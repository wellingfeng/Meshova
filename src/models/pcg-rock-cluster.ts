import type { NamedPart } from "../geometry/export.js";
import { merge, type Mesh } from "../geometry/mesh.js";
import { plane } from "../geometry/primitives.js";
import { archetypeRock, type RockArchetype } from "../geometry/rock.js";
import { transform } from "../geometry/transform.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng, type Rng } from "../random/prng.js";

export interface PcgRockClusterOptions {
  seed?: number;
  clusterCount?: number;
  rocksPerCluster?: number;
  areaSize?: number;
  clusterRadius?: number;
  heroScale?: number;
  falloff?: number;
  roughness?: number;
  includeGround?: boolean;
  groundColor?: [number, number, number];
  rockColor?: [number, number, number];
}

interface ResolvedPcgRockClusterOptions {
  seed: number;
  clusterCount: number;
  rocksPerCluster: number;
  areaSize: number;
  clusterRadius: number;
  heroScale: number;
  falloff: number;
  roughness: number;
  includeGround: boolean;
  groundColor: [number, number, number];
  rockColor: [number, number, number];
}

function resolveOptions(options: PcgRockClusterOptions): ResolvedPcgRockClusterOptions {
  return {
    seed: options.seed ?? 17,
    clusterCount: Math.max(1, Math.floor(options.clusterCount ?? 5)),
    rocksPerCluster: Math.max(4, Math.floor(options.rocksPerCluster ?? 22)),
    areaSize: Math.max(4, options.areaSize ?? 14),
    clusterRadius: Math.max(0.5, options.clusterRadius ?? 2),
    heroScale: Math.max(0.2, options.heroScale ?? 1),
    falloff: Math.max(0.1, options.falloff ?? 1.35),
    roughness: Math.max(0, options.roughness ?? 0.16),
    includeGround: options.includeGround ?? true,
    groundColor: options.groundColor ?? [0.34, 0.29, 0.22],
    rockColor: options.rockColor ?? [0.39, 0.34, 0.28],
  };
}

function dropToGround(mesh: Mesh): Mesh {
  let minY = Infinity;
  for (const position of mesh.positions) minY = Math.min(minY, position.y);
  return Number.isFinite(minY)
    ? transform(mesh, { translate: vec3(0, -minY, 0) })
    : mesh;
}

function distanceXZ(left: Vec3, right: Vec3): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function scatterClusterCenters(options: ResolvedPcgRockClusterOptions, rng: Rng): Vec3[] {
  const centers = [vec3(0, 0, 0)];
  const spread = Math.max(options.clusterRadius, options.areaSize * 0.37);
  const minSpacing = Math.min(options.clusterRadius * 1.65, spread * 0.9);

  for (let clusterIndex = 1; clusterIndex < options.clusterCount; clusterIndex++) {
    let accepted: Vec3 | undefined;
    for (let attempt = 0; attempt < 32; attempt++) {
      const angle = rng.range(0, Math.PI * 2);
      const radius = spread * Math.sqrt(rng.next());
      const candidate = vec3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      if (centers.every((center) => distanceXZ(center, candidate) >= minSpacing)) {
        accepted = candidate;
        break;
      }
    }

    if (!accepted) {
      const angle = (clusterIndex / options.clusterCount) * Math.PI * 2;
      accepted = vec3(Math.cos(angle) * spread, 0, Math.sin(angle) * spread);
    }
    centers.push(accepted);
  }
  return centers;
}

function chooseArchetype(rng: Rng, hero: boolean): RockArchetype {
  const sample = rng.next();
  if (hero) {
    if (sample < 0.48) return "boulder";
    if (sample < 0.78) return "eroded";
    return "strata";
  }
  if (sample < 0.42) return "slab";
  if (sample < 0.75) return "boulder";
  if (sample < 0.94) return "eroded";
  return "strata";
}

function buildPlacedRock(
  archetype: RockArchetype,
  seed: number,
  rockScale: Vec3,
  rotation: Vec3,
  position: Vec3,
  roughness: number,
  detail: number,
): Mesh {
  const rockMesh = archetypeRock(archetype, {
    seed,
    radius: 1,
    detail,
    roughness,
    flatBase: 0.28,
  });
  const shaped = transform(rockMesh, { scale: rockScale, rotate: rotation });
  return transform(dropToGround(shaped), { translate: position });
}

export function buildPcgRockClusterParts(options: PcgRockClusterOptions = {}): NamedPart[] {
  const resolved = resolveOptions(options);
  const rng = makeRng(resolved.seed >>> 0);
  const centers = scatterClusterCenters(resolved, rng);
  const heroes: Mesh[] = [];
  const secondaryRocks: Mesh[] = [];
  const debris: Mesh[] = [];

  for (let clusterIndex = 0; clusterIndex < centers.length; clusterIndex++) {
    const center = centers[clusterIndex]!;
    const heroSize = resolved.heroScale * rng.range(0.82, 1.22);
    heroes.push(buildPlacedRock(
      chooseArchetype(rng, true),
      resolved.seed + clusterIndex * 1009,
      vec3(heroSize * rng.range(0.9, 1.2), heroSize * rng.range(0.9, 1.35), heroSize * rng.range(0.82, 1.15)),
      vec3(rng.range(-0.12, 0.12), rng.range(0, Math.PI * 2), rng.range(-0.12, 0.12)),
      center,
      resolved.roughness,
      2,
    ));

    const secondaryCount = Math.max(2, Math.round(resolved.rocksPerCluster * 0.18));
    for (let rockIndex = 0; rockIndex < resolved.rocksPerCluster - 1; rockIndex++) {
      const isSecondary = rockIndex < secondaryCount;
      const angle = rng.range(0, Math.PI * 2);
      const radialSample = isSecondary
        ? rng.range(0.5, 0.78)
        : 0.46 + 0.54 * Math.pow(rng.next(), 0.62);
      const radius = resolved.clusterRadius * radialSample;
      const anisotropy = rng.range(0.72, 1.18);
      const position = vec3(
        center.x + Math.cos(angle) * radius * anisotropy,
        0,
        center.z + Math.sin(angle) * radius / anisotropy,
      );
      const edgeFalloff = Math.pow(radialSample, resolved.falloff);
      const baseScale = isSecondary
        ? resolved.heroScale * rng.range(0.24, 0.46)
        : resolved.heroScale * (0.09 + (1 - edgeFalloff) * 0.16) * rng.range(0.68, 1.28);
      const rockScale = vec3(
        baseScale * rng.range(0.85, 1.45),
        baseScale * rng.range(isSecondary ? 0.75 : 0.45, isSecondary ? 1.35 : 0.95),
        baseScale * rng.range(0.82, 1.35),
      );
      const tilt = radialSample * rng.range(0.08, 0.42);
      const placed = buildPlacedRock(
        chooseArchetype(rng, false),
        resolved.seed + clusterIndex * 1009 + rockIndex * 37 + 19,
        rockScale,
        vec3(rng.range(-tilt, tilt), rng.range(0, Math.PI * 2), rng.range(-tilt, tilt)),
        position,
        resolved.roughness * rng.range(0.65, 1.15),
        1,
      );
      (isSecondary ? secondaryRocks : debris).push(placed);
    }
  }

  const parts: NamedPart[] = [];
  if (resolved.includeGround) {
    parts.push({
      name: "ground",
      label: "土壤地面",
      mesh: plane(resolved.areaSize, resolved.areaSize, 1, 1),
      color: resolved.groundColor,
      surface: { type: "soil", params: { color: resolved.groundColor, roughness: 0.98, scale: 2.8, seed: resolved.seed } },
    });
  }
  parts.push({
    name: "hero_rocks",
    label: "群落主石",
    mesh: merge(...heroes),
    color: resolved.rockColor,
    surface: { type: "stone", params: { color: resolved.rockColor, roughness: 0.92, scale: 1.7, seed: resolved.seed } },
  });
  parts.push({
    name: "secondary_rocks",
    label: "伴生石块",
    mesh: merge(...secondaryRocks),
    color: [resolved.rockColor[0] * 0.92, resolved.rockColor[1] * 0.92, resolved.rockColor[2] * 0.92],
    surface: { type: "stone", params: { color: resolved.rockColor, roughness: 0.95, scale: 2.1, seed: resolved.seed + 1 } },
  });
  parts.push({
    name: "debris_ring",
    label: "环形碎石",
    mesh: merge(...debris),
    color: [resolved.rockColor[0] * 0.82, resolved.rockColor[1] * 0.82, resolved.rockColor[2] * 0.82],
    surface: { type: "stone", params: { color: resolved.rockColor, roughness: 0.98, scale: 2.8, seed: resolved.seed + 2 } },
  });
  return parts;
}
