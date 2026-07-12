import type { NamedPart } from "../geometry/export.js";
import { computeNormals, merge, type Mesh } from "../geometry/mesh.js";
import { box, sphere } from "../geometry/primitives.js";
import { cone, cylinder } from "../geometry/primitives2.js";
import { transform } from "../geometry/transform.js";
import { vec2 } from "../math/vec2.js";
import { vec3 } from "../math/vec3.js";
import { makeRng, type Rng } from "../random/prng.js";

export interface XianxiaMountainsOptions {
  seed?: number;
  peakCount?: number;
  height?: number;
  spread?: number;
  cliffRoughness?: number;
  treeDensity?: number;
  cloudCount?: number;
}

interface ResolvedXianxiaMountainsOptions {
  seed: number;
  peakCount: number;
  height: number;
  spread: number;
  cliffRoughness: number;
  treeDensity: number;
  cloudCount: number;
}

interface PeakSpec {
  x: number;
  z: number;
  height: number;
  radius: number;
  distant: boolean;
}

interface LedgeSpec {
  x: number;
  y: number;
  z: number;
  scale: number;
  yaw: number;
}

const PEAK_LAYOUT = [
  [-0.25, 0.02, 1, 1, 0],
  [0.17, -0.02, 0.84, 1.08, 0],
  [0.43, 0.1, 0.62, 0.72, 0],
  [-0.49, 0.08, 0.55, 0.66, 0],
  [0.7, -0.08, 0.7, 0.78, 0],
  [-0.73, -0.34, 0.5, 0.58, 1],
  [-0.36, -0.48, 0.64, 0.6, 1],
  [0.02, -0.54, 0.54, 0.55, 1],
  [0.39, -0.5, 0.58, 0.58, 1],
  [0.76, -0.38, 0.48, 0.52, 1],
  [-0.9, -0.12, 0.38, 0.48, 1],
  [0.92, 0.18, 0.43, 0.5, 1],
] as const;

export const XIANXIA_MOUNTAINS_DEFAULTS: ResolvedXianxiaMountainsOptions = {
  seed: 71,
  peakCount: 10,
  height: 19,
  spread: 28,
  cliffRoughness: 0.38,
  treeDensity: 0.68,
  cloudCount: 8,
};

export function buildXianxiaMountainsParts(
  options: XianxiaMountainsOptions = {},
): NamedPart[] {
  const params = resolveOptions(options);
  const rng = makeRng(params.seed);
  const stoneMeshes: Mesh[] = [];
  const distantMeshes: Mesh[] = [];
  const fissureMeshes: Mesh[] = [];
  const ledgeRockMeshes: Mesh[] = [];
  const mossMeshes: Mesh[] = [];
  const trunkMeshes: Mesh[] = [];
  const foliageMeshes: Mesh[] = [];

  const peaks = buildPeakSpecs(params, rng);
  peaks.forEach((peak, peakIndex) => {
    const peakRng = makeRng((params.seed + peakIndex * 7919) >>> 0);
    const peakMesh = buildKarstPeak(peak, params.cliffRoughness, peakRng);
    (peak.distant ? distantMeshes : stoneMeshes).push(peakMesh);

    if (!peak.distant) {
      const buttressCount = peakIndex < 2 ? 3 : 2;
      for (let buttressIndex = 0; buttressIndex < buttressCount; buttressIndex++) {
        const angle = peakRng.range(0, Math.PI * 2);
        const offset = peak.radius * peakRng.range(0.7, 1.05);
        stoneMeshes.push(buildKarstPeak({
          x: peak.x + Math.cos(angle) * offset,
          z: peak.z + Math.sin(angle) * offset,
          height: peak.height * peakRng.range(0.4, 0.7),
          radius: peak.radius * peakRng.range(0.38, 0.62),
          distant: false,
        }, params.cliffRoughness * 1.08, peakRng.fork()));
      }
      fissureMeshes.push(...buildFissures(peak, params.cliffRoughness, peakRng));
      const ledges = buildLedges(peak, params.cliffRoughness, peakRng);
      for (const ledge of ledges) {
        ledgeRockMeshes.push(buildLedgeRock(ledge));
        mossMeshes.push(buildMossPad(ledge));
      }
      scatterPeakTrees(peak, ledges, params.treeDensity, peakRng, trunkMeshes, foliageMeshes);
    }
  });

  const karstMesh = merge(...stoneMeshes);
  const distantMesh = merge(...distantMeshes);
  const fissureMesh = merge(...fissureMeshes);
  const ledgeMesh = merge(...ledgeRockMeshes);
  const parts: NamedPart[] = [
    {
      name: "karst_peaks",
      label: "石英砂岩柱峰",
      mesh: karstMesh,
      colors: rockVertexColors(karstMesh, [0.34, 0.38, 0.37], 0.12),
      color: [0.34, 0.38, 0.37],
      surface: { type: "stone", params: { scale: 2.8, roughness: 0.96, seed: params.seed } },
    },
    {
      name: "distant_peaks",
      label: "云后远峰",
      mesh: distantMesh,
      colors: rockVertexColors(distantMesh, [0.27, 0.34, 0.36], 0.07),
      color: [0.27, 0.34, 0.36],
      surface: { type: "stone", params: { scale: 3.4, roughness: 0.98, seed: params.seed + 1 } },
    },
    {
      name: "vertical_fissures",
      label: "纵向岩缝",
      mesh: fissureMesh,
      colors: rockVertexColors(fissureMesh, [0.07, 0.1, 0.1], 0.025),
      color: [0.07, 0.1, 0.1],
      surface: { type: "stone", params: { scale: 1.6, roughness: 1, seed: params.seed + 2 } },
    },
    {
      name: "cliff_ledges",
      label: "峰壁岩台",
      mesh: ledgeMesh,
      colors: rockVertexColors(ledgeMesh, [0.27, 0.32, 0.3], 0.07),
      color: [0.27, 0.32, 0.3],
      surface: { type: "stone", params: { scale: 2.2, roughness: 0.96, seed: params.seed + 3 } },
    },
    {
      name: "moss_caps",
      label: "峰顶苔草",
      mesh: merge(...mossMeshes),
      color: [0.16, 0.3, 0.15],
      surface: { type: "foliage", params: { color: [0.16, 0.3, 0.15], roughness: 0.9, translucency: 0.12 } },
    },
  ];

  if (trunkMeshes.length > 0) {
    parts.push({
      name: "cliff_pine_trunks",
      label: "附岩松树干",
      mesh: merge(...trunkMeshes),
      color: [0.16, 0.1, 0.06],
      surface: { type: "wood", params: { color: [0.16, 0.1, 0.06], roughness: 0.92, seed: params.seed } },
    });
    parts.push({
      name: "cliff_pine_foliage",
      label: "附岩松针叶",
      mesh: merge(...foliageMeshes),
      color: [0.08, 0.22, 0.11],
      surface: { type: "foliage", params: { color: [0.08, 0.22, 0.11], roughness: 0.88, translucency: 0.18 } },
    });
  }

  parts.push(...buildCloudBanks(params, rng));
  return parts;
}

function resolveOptions(options: XianxiaMountainsOptions): ResolvedXianxiaMountainsOptions {
  return {
    seed: Math.round(options.seed ?? XIANXIA_MOUNTAINS_DEFAULTS.seed) >>> 0,
    peakCount: clampInt(options.peakCount ?? XIANXIA_MOUNTAINS_DEFAULTS.peakCount, 3, PEAK_LAYOUT.length),
    height: clamp(options.height ?? XIANXIA_MOUNTAINS_DEFAULTS.height, 8, 34),
    spread: clamp(options.spread ?? XIANXIA_MOUNTAINS_DEFAULTS.spread, 18, 60),
    cliffRoughness: clamp(options.cliffRoughness ?? XIANXIA_MOUNTAINS_DEFAULTS.cliffRoughness, 0.05, 0.75),
    treeDensity: clamp(options.treeDensity ?? XIANXIA_MOUNTAINS_DEFAULTS.treeDensity, 0, 1),
    cloudCount: clampInt(options.cloudCount ?? XIANXIA_MOUNTAINS_DEFAULTS.cloudCount, 0, 10),
  };
}

function buildPeakSpecs(params: ResolvedXianxiaMountainsOptions, rng: Rng): PeakSpec[] {
  return PEAK_LAYOUT.slice(0, params.peakCount).map((entry, index) => ({
    x: entry[0] * params.spread + rng.range(-0.025, 0.025) * params.spread,
    z: entry[1] * params.spread + rng.range(-0.018, 0.018) * params.spread,
    height: params.height * entry[2] * rng.range(0.94, 1.05),
    radius: params.height * 0.155 * entry[3] * rng.range(0.9, 1.08),
    distant: entry[4] === 1 || index >= 5,
  }));
}

function buildKarstPeak(peak: PeakSpec, roughness: number, rng: Rng): Mesh {
  const sides = 14;
  const ringLevels = [0, 0.07, 0.17, 0.3, 0.43, 0.56, 0.68, 0.79, 0.88, 0.95, 1];
  const angleOffsets = Array.from({ length: sides }, () => rng.range(-0.14, 0.14));
  const sideWidths = Array.from({ length: sides }, () => 1 + rng.range(-0.23, 0.23) * roughness);
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices: number[] = [];

  ringLevels.forEach((level, ringIndex) => {
    const taper = 1 - level * 0.47;
    const terrace = ringIndex % 2 === 0 ? 1.06 : 0.92;
    const crown = level > 0.88 ? 1 + (level - 0.88) * 1.1 : 1;
    const ringRadius = peak.radius * taper * terrace * crown;
    const driftX = Math.sin(level * 8.7 + rng.range(-0.25, 0.25)) * peak.radius * roughness * 0.12;
    const driftZ = Math.cos(level * 7.1 + rng.range(-0.25, 0.25)) * peak.radius * roughness * 0.1;
    for (let sideIndex = 0; sideIndex < sides; sideIndex++) {
      const angle = (sideIndex / sides) * Math.PI * 2 + angleOffsets[sideIndex]!;
      const ringNoise = 1 + rng.range(-0.16, 0.16) * roughness;
      const radius = ringRadius * sideWidths[sideIndex]! * ringNoise;
      positions.push(vec3(
        peak.x + Math.cos(angle) * radius + driftX,
        level * peak.height + rng.range(-0.012, 0.012) * peak.height * roughness,
        peak.z + Math.sin(angle) * radius + driftZ,
      ));
      normals.push(vec3(Math.cos(angle), 0, Math.sin(angle)));
      uvs.push(vec2(sideIndex / sides, level));
    }
  });

  for (let ringIndex = 0; ringIndex < ringLevels.length - 1; ringIndex++) {
    const current = ringIndex * sides;
    const next = current + sides;
    for (let sideIndex = 0; sideIndex < sides; sideIndex++) {
      const following = (sideIndex + 1) % sides;
      indices.push(current + sideIndex, next + sideIndex, current + following);
      indices.push(current + following, next + sideIndex, next + following);
    }
  }

  const topCenter = positions.length;
  positions.push(vec3(peak.x, peak.height, peak.z));
  normals.push(vec3(0, 1, 0));
  uvs.push(vec2(0.5, 0.5));
  const topRing = (ringLevels.length - 1) * sides;
  for (let sideIndex = 0; sideIndex < sides; sideIndex++) {
    const following = (sideIndex + 1) % sides;
    indices.push(topCenter, topRing + following, topRing + sideIndex);
  }
  return computeNormals({ positions, normals, uvs, indices }, peak.distant ? 48 : 28);
}

function buildFissures(peak: PeakSpec, roughness: number, rng: Rng): Mesh[] {
  const fissures: Mesh[] = [];
  const count = Math.max(3, Math.round(4 + roughness * 7));
  for (let fissureIndex = 0; fissureIndex < count; fissureIndex++) {
    const angle = rng.range(0, Math.PI * 2);
    const length = peak.height * rng.range(0.16, 0.48);
    const centerY = peak.height * rng.range(0.22, 0.78);
    const localRadius = peak.radius * (1 - (centerY / peak.height) * 0.42) * 1.01;
    const fissure = transform(cylinder(1, length, 5, true), {
      scale: vec3(peak.radius * rng.range(0.025, 0.055), 1, peak.radius * rng.range(0.008, 0.018)),
      rotate: vec3(rng.range(-0.05, 0.05), -angle, rng.range(-0.025, 0.025)),
      translate: vec3(
        peak.x + Math.cos(angle) * localRadius,
        centerY,
        peak.z + Math.sin(angle) * localRadius,
      ),
    });
    fissures.push(fissure);
  }
  return fissures;
}

function buildLedges(peak: PeakSpec, roughness: number, rng: Rng): LedgeSpec[] {
  const ledges: LedgeSpec[] = [];
  const count = Math.max(3, Math.round(4 + roughness * 6));
  for (let ledgeIndex = 0; ledgeIndex < count; ledgeIndex++) {
    const yaw = rng.range(0, Math.PI * 2);
    const level = ledgeIndex === 0 ? rng.range(0.88, 0.96) : rng.range(0.18, 0.82);
    const localRadius = peak.radius * (1 - level * 0.4);
    ledges.push({
      x: peak.x + Math.cos(yaw) * localRadius,
      y: peak.height * level,
      z: peak.z + Math.sin(yaw) * localRadius,
      scale: peak.radius * rng.range(0.28, 0.62),
      yaw,
    });
  }
  ledges.push({ x: peak.x, y: peak.height + 0.04, z: peak.z, scale: peak.radius * 0.72, yaw: 0 });
  return ledges;
}

function buildLedgeRock(ledge: LedgeSpec): Mesh {
  return transform(sphere(1, 9, 5), {
    scale: vec3(ledge.scale * 0.92, ledge.scale * 0.2, ledge.scale * 0.58),
    rotate: vec3(0, -ledge.yaw, 0),
    translate: vec3(ledge.x, ledge.y - ledge.scale * 0.08, ledge.z),
  });
}

function buildMossPad(ledge: LedgeSpec): Mesh {
  return transform(sphere(1, 9, 4), {
    scale: vec3(ledge.scale * 0.78, ledge.scale * 0.07, ledge.scale * 0.48),
    rotate: vec3(0, -ledge.yaw, 0),
    translate: vec3(ledge.x, ledge.y + ledge.scale * 0.12, ledge.z),
  });
}

function scatterPeakTrees(
  peak: PeakSpec,
  ledges: LedgeSpec[],
  density: number,
  rng: Rng,
  trunks: Mesh[],
  foliage: Mesh[],
): void {
  for (const ledge of ledges) {
    const treeCount = Math.round(density * rng.range(1.4, 4.2));
    for (let treeIndex = 0; treeIndex < treeCount; treeIndex++) {
      const scale = clamp(peak.height * rng.range(0.04, 0.078), 0.55, 1.7);
      const tangent = ledge.yaw + Math.PI * 0.5;
      const offset = rng.range(-0.55, 0.55) * ledge.scale;
      const x = ledge.x + Math.cos(tangent) * offset;
      const z = ledge.z + Math.sin(tangent) * offset;
      appendPine(x, ledge.y + ledge.scale * 0.12, z, scale, rng, trunks, foliage);
    }
  }
}

function appendPine(
  x: number,
  y: number,
  z: number,
  scale: number,
  rng: Rng,
  trunks: Mesh[],
  foliage: Mesh[],
): void {
  const height = scale * rng.range(1.8, 2.7);
  trunks.push(transform(cylinder(scale * 0.08, height, 6, true), {
    translate: vec3(x, y + height * 0.5, z),
  }));
  const tiers = 3;
  for (let tier = 0; tier < tiers; tier++) {
    const tierScale = 1 - tier * 0.2;
    const tierHeight = height * (0.34 + tier * 0.2);
    foliage.push(transform(cone(scale * 0.5 * tierScale, height * 0.56, 7, true), {
      translate: vec3(x, y + tierHeight, z),
    }));
  }
}

function buildCloudBanks(params: ResolvedXianxiaMountainsOptions, rng: Rng): NamedPart[] {
  const parts: NamedPart[] = [];
  for (let cloudIndex = 0; cloudIndex < params.cloudCount; cloudIndex++) {
    const normalizedX = params.cloudCount === 1 ? 0 : cloudIndex / (params.cloudCount - 1) - 0.5;
    const centerX = normalizedX * params.spread * 1.02 + rng.range(-0.05, 0.05) * params.spread;
    const centerZ = rng.range(-0.18, 0.24) * params.spread;
    const centerY = params.height * rng.range(0.13, 0.3);
    const bankSize = params.spread * rng.range(0.09, 0.14);
    const lobes: Mesh[] = [];
    const lobeCount = 5 + (cloudIndex % 3);
    for (let lobeIndex = 0; lobeIndex < lobeCount; lobeIndex++) {
      const angle = rng.range(0, Math.PI * 2);
      const radius = bankSize * rng.range(0.42, 0.76);
      lobes.push(transform(sphere(1, 12, 7), {
        scale: vec3(radius * rng.range(1.05, 1.48), radius * rng.range(0.44, 0.72), radius * rng.range(0.82, 1.14)),
        translate: vec3(
          centerX + Math.cos(angle) * bankSize * rng.range(0.25, 1.1),
          centerY + rng.range(-0.12, 0.18) * bankSize,
          centerZ + Math.sin(angle) * bankSize * rng.range(0.25, 1.1),
        ),
      }));
    }
    parts.push({
      name: `cloud_bank_${cloudIndex + 1}`,
      label: `云海 ${cloudIndex + 1}`,
      mesh: merge(...lobes),
      color: [0.91, 0.95, 0.98],
      surface: {
        type: "cloud",
        params: {
          color: [0.91, 0.95, 0.98],
          density: 1.45,
          absorption: 1.65,
          coverage: 0.16,
          noiseFreq: 3.8,
          steps: 42,
          seed: params.seed + cloudIndex * 17,
        },
      },
    });
  }
  return parts;
}

function rockVertexColors(
  mesh: Mesh,
  base: [number, number, number],
  variation: number,
): number[] {
  const colors: number[] = [];
  for (const position of mesh.positions) {
    const strata = Math.sin(position.y * 1.7 + position.x * 0.27) * 0.5;
    const mineral = Math.sin(position.x * 2.3 + position.z * 1.9) * 0.5;
    const shade = (strata * 0.72 + mineral * 0.28) * variation;
    colors.push(
      clamp(base[0] + shade, 0, 1),
      clamp(base[1] + shade, 0, 1),
      clamp(base[2] + shade * 0.92, 0, 1),
    );
  }
  return colors;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}
