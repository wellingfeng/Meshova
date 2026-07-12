import type { NamedPart } from "../geometry/export.js";
import { bounds, merge, type Mesh } from "../geometry/mesh.js";
import { archetypeRock } from "../geometry/rock.js";
import { transform } from "../geometry/transform.js";
import { buildClimbingVineParts, meshSurface } from "../geometry/vine.js";
import { vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import { shrub } from "../vegetation/plant.js";
import { buildLowPolyIvyParts } from "./ivy-lowpoly-kit.js";
import { buildRockFormationMesh } from "./rock-formation.js";

export interface VineCoveredRockOptions {
  seed?: number;
  rockCount?: number;
  width?: number;
  height?: number;
  coverage?: number;
  leafSize?: number;
  hangingLength?: number;
  groundSpread?: number;
  lod?: number;
}

interface ResolvedOptions {
  seed: number;
  rockCount: number;
  width: number;
  height: number;
  coverage: number;
  leafSize: number;
  hangingLength: number;
  groundSpread: number;
  lod: number;
}

interface VegetationBuckets {
  stems: Mesh[];
  mature: Mesh[];
  young: Mesh[];
  dry: Mesh[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveOptions(options: VineCoveredRockOptions): ResolvedOptions {
  return {
    seed: Math.round(options.seed ?? 73),
    rockCount: Math.max(3, Math.round(options.rockCount ?? 5)),
    width: Math.max(2.5, options.width ?? 5.4),
    height: Math.max(2.5, options.height ?? 5.8),
    coverage: clamp(options.coverage ?? 1, 0.2, 1.8),
    leafSize: Math.max(0.06, options.leafSize ?? 0.22),
    hangingLength: Math.max(0, options.hangingLength ?? 1.7),
    groundSpread: Math.max(0, options.groundSpread ?? 1.45),
    lod: Math.round(clamp(options.lod ?? 1, 0, 3)),
  };
}

function groundMesh(mesh: Mesh): Mesh {
  const meshBounds = bounds(mesh);
  return transform(mesh, { translate: vec3(0, -meshBounds.min.y, 0) });
}

function fitMesh(mesh: Mesh, width: number, height: number, depth: number): Mesh {
  const meshBounds = bounds(mesh);
  const spanX = Math.max(1e-6, meshBounds.max.x - meshBounds.min.x);
  const spanY = Math.max(1e-6, meshBounds.max.y - meshBounds.min.y);
  const spanZ = Math.max(1e-6, meshBounds.max.z - meshBounds.min.z);
  return transform(mesh, { scale: vec3(width / spanX, height / spanY, depth / spanZ) });
}

function collectVegetation(
  buckets: VegetationBuckets,
  parts: NamedPart[],
  placement?: Parameters<typeof transform>[1],
): void {
  for (const part of parts) {
    const mesh = placement ? transform(part.mesh, placement) : part.mesh;
    if (part.name.includes("stem")) buckets.stems.push(mesh);
    else if (part.name.includes("young")) buckets.young.push(mesh);
    else if (part.name.includes("dry")) buckets.dry.push(mesh);
    else buckets.mature.push(mesh);
  }
}

function foliagePart(
  name: string,
  label: string,
  meshes: Mesh[],
  color: [number, number, number],
  seed: number,
): NamedPart | undefined {
  if (meshes.length === 0) return undefined;
  const mesh = merge(...meshes);
  return {
    name,
    label,
    mesh,
    color,
    surface: { type: "foliage", params: { color, seed, veinStrength: 0.3, translucency: 0.3 } },
    doubleSided: true,
    windWeight: mesh.positions.map(() => 1),
  };
}

export function buildVineCoveredRockParts(options: VineCoveredRockOptions = {}): NamedPart[] {
  const resolved = resolveOptions(options);
  const rng = makeRng(resolved.seed);
  const rocks: Mesh[] = [];
  const fragments: Mesh[] = [];
  const vegetation: VegetationBuckets = { stems: [], mature: [], young: [], dry: [] };
  const rockAnchors: Array<{ x: number; z: number; top: number }> = [];
  let rockTop = resolved.height;

  for (let index = 0; index < resolved.rockCount; index++) {
    const fraction = resolved.rockCount === 1 ? 0.5 : index / (resolved.rockCount - 1);
    const centerWeight = 1 - Math.abs(fraction - 0.5) * 0.42;
    const x = (fraction - 0.5) * resolved.width * 0.63 + rng.range(-0.035, 0.035) * resolved.width;
    const z = rng.range(-0.08, 0.08) * resolved.width;
    const columnWidth = resolved.width / resolved.rockCount * rng.range(1.45, 1.72);
    const columnHeight = resolved.height * centerWeight * rng.range(0.9, 1.04);
    const columnDepth = resolved.width * rng.range(0.48, 0.6);
    const rawRock = buildRockFormationMesh({
      seed: resolved.seed + index * 97,
      mode: "cliff",
      radius: 1,
      height: 2.8,
      blobs: resolved.lod >= 2 ? 4 : 6,
      resolution: resolved.lod === 0 ? 30 : resolved.lod === 1 ? 24 : 20,
      crag: rng.range(0.22, 0.31),
      cragFrequency: rng.range(1.8, 2.6),
      strata: 0,
      chip: rng.range(0.07, 0.11),
      faceCusp: rng.range(14, 21),
    });
    const tilted = transform(fitMesh(rawRock, columnWidth, columnHeight, columnDepth), {
      rotate: vec3(rng.range(-0.08, 0.08), rng.range(-0.18, 0.18), rng.range(-0.08, 0.08)),
    });
    const placed = transform(groundMesh(tilted), { translate: vec3(x, 0, z) });
    const placedTop = bounds(placed).max.y;
    rockTop = Math.max(rockTop, placedTop);
    rockAnchors.push({ x, z, top: placedTop });
    rocks.push(placed);

    collectVegetation(vegetation, buildClimbingVineParts(meshSurface(placed), {
      seed: resolved.seed + 1000 + index * 131,
      strands: Math.max(2, Math.round((3.2 + centerWeight * 2.2) * resolved.coverage)),
      length: resolved.height * rng.range(0.72, 1.05),
      radius: resolved.leafSize * 0.09,
      steps: resolved.lod >= 2 ? 18 : 25,
      climb: rng.range(0.72, 1.02),
      weave: rng.range(0.55, 0.95),
      wander: 0.36,
      sides: resolved.lod >= 2 ? 4 : 6,
      leafDensity: 6.2 * resolved.coverage,
      leafSize: resolved.leafSize * rng.range(0.72, 0.98),
      branches: resolved.lod >= 2 ? 1 : 2,
    }));
  }

  for (let index = 0; index < rockAnchors.length; index++) {
    const anchor = rockAnchors[index]!;
    const cluster = shrub({
      seed: resolved.seed + 4001 + index * 89,
      height: resolved.leafSize * 3.3,
      stems: resolved.lod >= 2 ? 3 : 4,
      stemRadius: resolved.leafSize * 0.05,
      spread: resolved.leafSize * 1.35,
      leafDensity: Math.max(5, Math.round(8 * resolved.coverage)),
      leafSize: resolved.leafSize * 0.72,
      leafShape: "round",
      leafCurl: 0.08,
      leafFold: 0.08,
      branchFlare: false,
    });
    const placement = {
      scale: vec3(1.05, 0.72, 1.05),
      rotate: vec3(rng.range(-0.12, 0.12), rng.range(-Math.PI, Math.PI), rng.range(-0.12, 0.12)),
      translate: vec3(anchor.x, Math.max(anchor.top * 0.88, rockTop * 0.78), anchor.z),
    };
    vegetation.stems.push(transform(cluster.wood, placement));
    vegetation.mature.push(transform(cluster.leaves, placement));
  }

  const faceClusterCount = Math.max(3, Math.round(5 * resolved.coverage));
  for (let index = 0; index < faceClusterCount; index++) {
    const cluster = shrub({
      seed: resolved.seed + 4703 + index * 61,
      height: resolved.leafSize * 2.35,
      stems: resolved.lod >= 2 ? 2 : 4,
      stemRadius: resolved.leafSize * 0.04,
      spread: resolved.leafSize,
      leafDensity: Math.max(5, Math.round(8 * resolved.coverage)),
      leafSize: resolved.leafSize * 0.65,
      leafShape: "round",
      branchFlare: false,
    });
    const placement = {
      scale: vec3(0.82, 0.52, 0.82),
      rotate: vec3(Math.PI * 0.5, rng.range(-0.45, 0.45), rng.range(-0.5, 0.5)),
      translate: vec3(
        rng.range(-resolved.width * 0.4, resolved.width * 0.4),
        rng.range(rockTop * 0.26, rockTop * 0.82),
        resolved.width * 0.24,
      ),
    };
    vegetation.stems.push(transform(cluster.wood, placement));
    vegetation.mature.push(transform(cluster.leaves, placement));
  }

  if (resolved.hangingLength > 0) {
    collectVegetation(vegetation, buildLowPolyIvyParts({
      seed: resolved.seed + 5003,
      form: "curtain",
      width: resolved.width * 0.76,
      height: resolved.hangingLength,
      depth: resolved.width * 0.08,
      strands: Math.max(2, Math.round(4 * resolved.coverage)),
      branches: 1,
      stemRadius: resolved.leafSize * 0.065,
      leafSize: resolved.leafSize * 1.08,
      leafDensity: 10.5,
      lushness: resolved.coverage * 1.15,
      dryness: 0.06,
      lod: resolved.lod,
    }), {
      translate: vec3(0, rockTop * 0.88 - resolved.hangingLength, resolved.width * 0.17),
    });
  }

  const patchCount = Math.max(4, Math.round(6 * resolved.coverage));
  for (let index = 0; index < patchCount; index++) {
    const angle = (index / patchCount) * Math.PI * 2 + rng.range(-0.18, 0.18);
    const radius = resolved.width * (0.22 + resolved.groundSpread * 0.08);
    collectVegetation(vegetation, buildLowPolyIvyParts({
      seed: resolved.seed + 6007 + index * 79,
      form: "runner",
      width: resolved.width * rng.range(0.32, 0.48),
      height: 0.8,
      depth: resolved.width * 0.12,
      strands: Math.max(2, Math.round(3 * resolved.coverage)),
      branches: Math.max(1, Math.round(2 * resolved.coverage)),
      stemRadius: resolved.leafSize * 0.055,
      leafSize: resolved.leafSize * rng.range(0.8, 1.18),
      leafDensity: 7,
      lushness: resolved.coverage,
      dryness: 0.1,
      lod: resolved.lod,
    }), {
      rotate: vec3(rng.range(-0.08, 0.08), angle, rng.range(-0.08, 0.08)),
      translate: vec3(Math.cos(angle) * radius, 0.08, Math.sin(angle) * radius),
    });

    const groundCluster = shrub({
      seed: resolved.seed + 7307 + index * 83,
      height: resolved.leafSize * 3.5,
      stems: resolved.lod >= 2 ? 3 : 5,
      stemRadius: resolved.leafSize * 0.045,
      spread: resolved.leafSize * 1.8,
      leafDensity: Math.max(5, Math.round(8 * resolved.coverage)),
      leafSize: resolved.leafSize * 0.7,
      leafShape: "round",
      leafCurl: 0.06,
      branchFlare: false,
    });
    const groundPlacement = {
      scale: vec3(1.2, 0.62, 1.2),
      rotate: vec3(0, angle + rng.range(-0.4, 0.4), 0),
      translate: vec3(Math.cos(angle) * radius, 0.06, Math.sin(angle) * radius),
    };
    vegetation.stems.push(transform(groundCluster.wood, groundPlacement));
    vegetation.mature.push(transform(groundCluster.leaves, groundPlacement));
  }

  const fragmentCount = resolved.rockCount * 2;
  for (let index = 0; index < fragmentCount; index++) {
    const angle = rng.range(0, Math.PI * 2);
    const radius = resolved.width * rng.range(0.34, 0.55);
    const size = resolved.width * rng.range(0.045, 0.085);
    const fragment = archetypeRock(index % 2 === 0 ? "eroded" : "slab", {
      seed: resolved.seed + 8009 + index * 43,
      radius: size,
      detail: 1,
      roughness: 0.2,
    });
    fragments.push(transform(groundMesh(fragment), {
      rotate: vec3(rng.range(-0.2, 0.2), angle, rng.range(-0.2, 0.2)),
      translate: vec3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius),
    }));
  }

  const soilBase = groundMesh(archetypeRock("slab", {
    seed: resolved.seed + 9001,
    radius: 1,
    detail: 2,
    stretch: vec3(resolved.width * 0.58, 0.14, resolved.width * 0.43),
    lumpiness: 0.18,
    roughness: 0.08,
    flatBase: 0.65,
  }));

  const parts: NamedPart[] = [
    {
      name: "soil_bed",
      label: "植被土床",
      mesh: transform(soilBase, { translate: vec3(0, -0.08, 0) }),
      color: [0.12, 0.095, 0.06],
      surface: { type: "soil", params: { color: [0.12, 0.095, 0.06], roughness: 0.98, scale: 2.7, seed: resolved.seed } },
    },
    {
      name: "rock_pillars",
      label: "竖向裂隙岩柱",
      mesh: merge(...rocks),
      color: [0.38, 0.29, 0.235],
      surface: { type: "stone", params: { color: [0.38, 0.29, 0.235], roughness: 0.94, scale: 1.8, seed: resolved.seed } },
      metadata: { sourceReference: "Bilibili BV12w411a7ne", procedural: true },
    },
    {
      name: "rock_fragments",
      label: "基部碎石",
      mesh: merge(...fragments),
      color: [0.31, 0.25, 0.2],
      surface: { type: "stone", params: { color: [0.31, 0.25, 0.2], roughness: 0.97, scale: 2.4, seed: resolved.seed + 1 } },
    },
  ];

  if (vegetation.stems.length > 0) {
    parts.push({
      name: "vine_stems",
      label: "攀爬与垂落藤茎",
      mesh: merge(...vegetation.stems),
      color: [0.2, 0.13, 0.07],
      surface: { type: "bark", params: { color: [0.2, 0.13, 0.07], roughness: 0.93, scale: 2.5 } },
    });
  }
  const foliage = [
    foliagePart("ivy_mature", "成熟藤叶", vegetation.mature, [0.15, 0.38, 0.075], resolved.seed + 11),
    foliagePart("ivy_young", "嫩绿藤叶", vegetation.young, [0.32, 0.56, 0.11], resolved.seed + 17),
    foliagePart("ivy_dry", "枯黄藤叶", vegetation.dry, [0.42, 0.28, 0.07], resolved.seed + 23),
  ].filter((part): part is NamedPart => part !== undefined);
  parts.push(...foliage);
  return parts;
}
