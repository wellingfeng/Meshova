import { vec2 } from "../math/vec2.js";
import type { Vec3 } from "../math/vec3.js";
import { length, sub, vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import type { Curve } from "./curve.js";
import { curveLength, resampleCurve } from "./curve.js";
import type { Mesh } from "./mesh.js";
import { bounds, computeNormals, makeMesh, merge } from "./mesh.js";
import { archetypeRock, type RockArchetype } from "./rock.js";
import { transform } from "./transform.js";

export type RockBorderSide = "left" | "right" | "both";
export type RockBorderStyle = "boulder" | "cliff" | "strata";
export type RockBorderAnchor = "top" | "base" | "center";

export interface RockBorderOptions {
  seed?: number;
  /** Target distance between rock modules along the boundary. */
  spacing?: number;
  /** Average module depth perpendicular to the boundary. */
  depth?: number;
  /** Average module height. */
  height?: number;
  /** Number of descending rows. */
  tiers?: number;
  /** Initial perpendicular offset from the source boundary. */
  offset?: number;
  /** Direction in the XZ plane. */
  side?: RockBorderSide;
  style?: RockBorderStyle;
  /** Module overlap along the boundary, 0..0.8. */
  overlap?: number;
  /** Position, rotation, and scale variation, 0..1. */
  jitter?: number;
  roughness?: number;
  detail?: number;
  anchor?: RockBorderAnchor;
}

export interface RockBorderPlacement {
  position: Vec3;
  tangent: Vec3;
  normal: Vec3;
  rotation: Vec3;
  scale: Vec3;
  side: "left" | "right";
  tier: number;
  sourceIndex: number;
  /** Normalized arc position on the source boundary. */
  arcPosition: number;
  seed: number;
  archetype: RockArchetype;
  /** Guaranteed tangent-space coverage width in world units. */
  coverage: number;
}

export interface RockBorderResult {
  mesh: Mesh;
  moduleMesh: Mesh;
  backingMesh: Mesh;
  placements: RockBorderPlacement[];
  sampledBoundary: Curve;
}

interface ResolvedRockBorderOptions {
  seed: number;
  spacing: number;
  depth: number;
  height: number;
  tiers: number;
  offset: number;
  side: RockBorderSide;
  style: RockBorderStyle;
  overlap: number;
  jitter: number;
  roughness: number;
  detail: number;
  anchor: RockBorderAnchor;
}

/**
 * Build a modular rock/cliff border from an open or closed XZ boundary.
 * The boundary is arc-length resampled, then seeded rock modules are aligned
 * to its tangent and stacked into descending rows along its planar normal.
 */
export function buildRockBorder(boundary: Curve, options: RockBorderOptions = {}): RockBorderResult {
  const resolved = resolveOptions(options);
  const sampledBoundary = resampleCurve(boundary, { segmentLength: resolved.spacing });
  const points = sampledBoundary.points;
  if (points.length < 2) {
    const empty = merge();
    return { mesh: empty, moduleMesh: empty, backingMesh: empty, placements: [], sampledBoundary };
  }

  const sideSigns: Array<{ side: "left" | "right"; sign: -1 | 1 }> = resolved.side === "both"
    ? [{ side: "left", sign: 1 }, { side: "right", sign: -1 }]
    : [{ side: resolved.side, sign: resolved.side === "left" ? 1 : -1 }];
  const moduleMeshes: Mesh[] = [];
  const backingMeshes: Mesh[] = [];
  const placements: RockBorderPlacement[] = [];

  for (const sideEntry of sideSigns) {
    backingMeshes.push(buildBackingCliff(sampledBoundary, sideEntry.sign, resolved));
    for (let tier = 0; tier < resolved.tiers; tier++) {
      const tierSamples = irregularCurveSamples(
        sampledBoundary,
        resolved.spacing * (1 + tier * 0.28),
        mixSeed(resolved.seed, tier, 17, sideEntry.sign),
      );
      const tierCenters = tierSamples.map((sample, sourceIndex) => {
        const point = sample.point;
        const placementSeed = mixSeed(resolved.seed, sourceIndex, tier, sideEntry.sign);
        const rng = makeRng(placementSeed);
        const tangent = sample.tangent;
        const normal = vec3(-tangent.z * sideEntry.sign, 0, tangent.x * sideEntry.sign);
        const endpointBlend = sampledBoundary.closed
          ? 1
          : Math.sin(sample.arcPosition * Math.PI);
        const alongJitter = rng.range(-1, 1) * resolved.spacing * resolved.jitter * 0.08;
        const alongOffset = alongJitter * endpointBlend;
        const normalJitter = rng.range(-1, 1) * resolved.depth * resolved.jitter * 0.12;
        const tierOffset = resolved.offset + tier * resolved.depth * 0.52 + normalJitter;
        return {
          point,
          tangent,
          normal,
          position: vec3(
            point.x + tangent.x * alongOffset + normal.x * tierOffset,
            point.y,
            point.z + tangent.z * alongOffset + normal.z * tierOffset,
          ),
          placementSeed,
          arcPosition: sample.arcPosition,
          rng,
        };
      });

      for (let sourceIndex = 0; sourceIndex < tierCenters.length; sourceIndex++) {
        const center = tierCenters[sourceIndex]!;
        const { point, tangent, normal, placementSeed, arcPosition, rng } = center;
        const neighborSpan = localPlacementSpan(tierCenters, sourceIndex, sampledBoundary.closed, resolved.spacing);
        const variant = placementSeed % 7;
        const recipe = rockRecipe(resolved.style, variant);
        const tierScale = Math.max(0.56, 1 - tier * 0.11);
        const coverageFactor = tier === 0
          ? (1.08 + resolved.overlap * 0.42) * rng.range(1, 1.08)
          : rng.range(0.72, 1.02) + resolved.overlap * 0.18;
        const coverage = neighborSpan * coverageFactor;
        const desiredHeight = resolved.height * tierScale * recipe.height * rng.range(0.88, 1.12);
        const desiredDepth = resolved.depth * tierScale * recipe.depth * rng.range(0.88, 1.14);
        const yaw = Math.atan2(-tangent.z, tangent.x) + rng.range(-0.1, 0.1) * resolved.jitter;
        const tilt = resolved.jitter * 0.08;
        const rotation = vec3(rng.range(-tilt, tilt), yaw, rng.range(-tilt, tilt));
        const base = archetypeRock(recipe.archetype, {
          seed: placementSeed,
          radius: 0.5,
          detail: resolved.detail,
          roughness: resolved.roughness * rng.range(0.82, 1.18),
          lumpiness: recipe.lumpiness,
          flatBase: resolved.anchor === "base" ? Math.max(0.38, recipe.flatBase) : recipe.flatBase,
          strata: recipe.strata,
          strataBands: 5 + (placementSeed % 3),
          stretch: recipe.stretch,
        });
        const baseBounds = bounds(base);
        const baseSize = vec3(
          Math.max(1e-6, baseBounds.max.x - baseBounds.min.x),
          Math.max(1e-6, baseBounds.max.y - baseBounds.min.y),
          Math.max(1e-6, baseBounds.max.z - baseBounds.min.z),
        );
        const rockScale = vec3(coverage / baseSize.x, desiredHeight / baseSize.y, desiredDepth / baseSize.z);
        const oriented = transform(base, { scale: rockScale, rotate: rotation });
        const orientedBounds = bounds(oriented);
        const tierDrop = tier * resolved.height * 0.38;
        const anchorY = point.y - tierDrop + rng.range(-0.08, 0.08) * resolved.height * resolved.jitter;
        const y = resolved.anchor === "top"
          ? anchorY - orientedBounds.max.y
          : resolved.anchor === "base"
            ? anchorY - orientedBounds.min.y
            : anchorY - (orientedBounds.min.y + orientedBounds.max.y) * 0.5;
        const position = vec3(center.position.x, y, center.position.z);
        moduleMeshes.push(transform(oriented, { translate: position }));
        placements.push({
          position,
          tangent,
          normal,
          rotation,
          scale: rockScale,
          side: sideEntry.side,
          tier,
          sourceIndex,
          arcPosition,
          seed: placementSeed,
          archetype: recipe.archetype,
          coverage,
        });
      }
    }
  }

  const moduleMesh = merge(...moduleMeshes);
  const backingMesh = merge(...backingMeshes);
  return { mesh: merge(backingMesh, moduleMesh), moduleMesh, backingMesh, placements, sampledBoundary };
}

/** Mesh-only convenience wrapper. */
export function rockBorder(boundary: Curve, options: RockBorderOptions = {}): Mesh {
  return buildRockBorder(boundary, options).mesh;
}

function resolveOptions(options: RockBorderOptions): ResolvedRockBorderOptions {
  return {
    seed: Math.round(options.seed ?? 17) >>> 0,
    spacing: Math.max(0.08, options.spacing ?? 0.9),
    depth: Math.max(0.05, options.depth ?? 0.78),
    height: Math.max(0.05, options.height ?? 1.35),
    tiers: Math.max(1, Math.min(8, Math.round(options.tiers ?? 2))),
    offset: options.offset ?? 0,
    side: options.side ?? "left",
    style: options.style ?? "cliff",
    overlap: clamp(options.overlap ?? 0.2, 0, 0.8),
    jitter: clamp(options.jitter ?? 0.32, 0, 1),
    roughness: clamp(options.roughness ?? 0.18, 0, 0.8),
    detail: Math.max(1, Math.min(4, Math.round(options.detail ?? 1))),
    anchor: options.anchor ?? "top",
  };
}

interface RockRecipe {
  archetype: RockArchetype;
  stretch: Vec3;
  height: number;
  depth: number;
  lumpiness: number;
  flatBase: number;
  strata: number;
}

function rockRecipe(style: RockBorderStyle, variant: number): RockRecipe {
  if (style === "boulder") {
    const shapes = [
      { archetype: "boulder" as const, stretch: vec3(1.2, 0.82, 1.08), height: 0.78, depth: 1.12 },
      { archetype: "eroded" as const, stretch: vec3(0.95, 1.08, 1.18), height: 1.02, depth: 1.06 },
      { archetype: "slab" as const, stretch: vec3(1.42, 0.62, 1.04), height: 0.7, depth: 1.16 },
    ];
    const shape = shapes[variant % shapes.length]!;
    return { ...shape, lumpiness: 0.42, flatBase: 0.28, strata: 0 };
  }
  if (style === "strata") {
    const shapes = [
      { archetype: "strata" as const, stretch: vec3(1.35, 0.82, 0.92), height: 0.92, depth: 1.02 },
      { archetype: "slab" as const, stretch: vec3(1.5, 0.68, 1.05), height: 0.76, depth: 1.14 },
      { archetype: "eroded" as const, stretch: vec3(1.05, 1.15, 0.88), height: 1.12, depth: 0.92 },
    ];
    const shape = shapes[variant % shapes.length]!;
    return { ...shape, lumpiness: 0.31, flatBase: 0.2, strata: 0.5 };
  }
  const shapes = [
    { archetype: "eroded" as const, stretch: vec3(1.28, 1.02, 0.88), height: 0.98, depth: 0.96 },
    { archetype: "slab" as const, stretch: vec3(1.52, 0.7, 0.96), height: 0.76, depth: 1.08 },
    { archetype: "strata" as const, stretch: vec3(1.26, 0.9, 0.84), height: 0.88, depth: 0.9 },
    { archetype: "boulder" as const, stretch: vec3(1.02, 1.12, 1.04), height: 1.08, depth: 1.12 },
    { archetype: "spire" as const, stretch: vec3(0.78, 1.55, 0.82), height: 1.24, depth: 0.84 },
  ];
  const shape = shapes[variant % shapes.length]!;
  return {
    ...shape,
    lumpiness: shape.archetype === "eroded" ? 0.46 : 0.34,
    flatBase: 0.16,
    strata: shape.archetype === "strata" ? 0.34 : 0.08,
  };
}

function tangentAt(curve: Curve, index: number): Vec3 {
  const points = curve.points;
  const count = points.length;
  const previous = curve.closed
    ? points[(index - 1 + count) % count]!
    : points[Math.max(0, index - 1)]!;
  const next = curve.closed
    ? points[(index + 1) % count]!
    : points[Math.min(count - 1, index + 1)]!;
  const dx = next.x - previous.x;
  const dz = next.z - previous.z;
  const magnitude = Math.hypot(dx, dz) || 1;
  return vec3(dx / magnitude, 0, dz / magnitude);
}

function localPlacementSpan(
  centers: ReadonlyArray<{ position: Vec3 }>,
  index: number,
  closed: boolean,
  fallback: number,
): number {
  const count = centers.length;
  const current = centers[index]!.position;
  const previous = closed ? centers[(index - 1 + count) % count] : centers[index - 1];
  const next = closed ? centers[(index + 1) % count] : centers[index + 1];
  const previousDistance = previous ? length(sub(current, previous.position)) : 0;
  const nextDistance = next ? length(sub(next.position, current)) : 0;
  return Math.max(previousDistance, nextDistance, fallback * 0.5);
}

interface IrregularCurveSample {
  point: Vec3;
  tangent: Vec3;
  arcPosition: number;
}

function irregularCurveSamples(curve: Curve, spacing: number, seed: number): IrregularCurveSample[] {
  const total = curveLength(curve);
  if (total <= 1e-6) return [];
  const rng = makeRng(seed);
  const distances: number[] = [];

  if (curve.closed) {
    const count = Math.max(3, Math.round((total / spacing) * rng.range(0.9, 1.08)));
    const weights = Array.from({ length: count }, () => rng.range(0.62, 1.42));
    const weightScale = total / weights.reduce((sum, weight) => sum + weight, 0);
    const phase = rng.range(0, spacing);
    let distance = phase;
    for (const weight of weights) {
      distances.push(distance % total);
      distance += weight * weightScale;
    }
    distances.sort((first, second) => first - second);
  } else {
    distances.push(0);
    let distance = 0;
    while (distance < total) {
      const next = distance + spacing * rng.range(0.62, 1.42);
      if (next >= total - spacing * 0.34) break;
      distances.push(next);
      distance = next;
    }
    distances.push(total);
  }

  return distances.map((distance) => sampleCurveAtDistance(curve, distance, total));
}

function sampleCurveAtDistance(curve: Curve, distance: number, total: number): IrregularCurveSample {
  const points = curve.points;
  const spans = curve.closed ? points.length : points.length - 1;
  let remaining = Math.max(0, Math.min(total, distance));
  for (let index = 0; index < spans; index++) {
    const nextIndex = (index + 1) % points.length;
    const first = points[index]!;
    const second = points[nextIndex]!;
    const segmentLength = length(sub(second, first));
    if (remaining > segmentLength && index < spans - 1) {
      remaining -= segmentLength;
      continue;
    }
    const t = segmentLength > 1e-9 ? Math.min(1, remaining / segmentLength) : 0;
    const firstTangent = tangentAt(curve, index);
    const secondTangent = tangentAt(curve, nextIndex);
    const tangentX = firstTangent.x + (secondTangent.x - firstTangent.x) * t;
    const tangentZ = firstTangent.z + (secondTangent.z - firstTangent.z) * t;
    const tangentLength = Math.hypot(tangentX, tangentZ) || 1;
    return {
      point: vec3(
        first.x + (second.x - first.x) * t,
        first.y + (second.y - first.y) * t,
        first.z + (second.z - first.z) * t,
      ),
      tangent: vec3(tangentX / tangentLength, 0, tangentZ / tangentLength),
      arcPosition: distance / total,
    };
  }
  const last = points[points.length - 1]!;
  return { point: last, tangent: tangentAt(curve, points.length - 1), arcPosition: 1 };
}

function buildBackingCliff(
  boundary: Curve,
  sideSign: -1 | 1,
  options: ResolvedRockBorderOptions,
): Mesh {
  const count = boundary.points.length;
  const rows = Math.max(3, options.tiers * 2 + 1);
  const height = options.height * (1 + (options.tiers - 1) * 0.38);
  const phaseA = ((options.seed ^ (sideSign > 0 ? 0x51ed270b : 0x94d049bb)) >>> 0) * 0.000001;
  const phaseB = phaseA * 1.61803398875;
  const frequencyA = 3 + (options.seed % 4);
  const frequencyB = 7 + (options.seed % 5);
  const positions: Vec3[] = [];
  const uvs = [];

  for (let row = 0; row <= rows; row++) {
    const v = row / rows;
    for (let index = 0; index < count; index++) {
      const point = boundary.points[index]!;
      const tangent = tangentAt(boundary, index);
      const normal = vec3(-tangent.z * sideSign, 0, tangent.x * sideSign);
      const u = boundary.closed ? index / count : index / Math.max(1, count - 1);
      const angle = u * Math.PI * 2;
      const contourNoise = Math.sin(angle * frequencyA + phaseA)
        + Math.sin(angle * frequencyB + phaseB) * 0.45;
      const middleWeight = Math.sin(v * Math.PI);
      const slopeOffset = options.offset - options.depth * 0.16
        + v * Math.max(0, options.tiers - 1) * options.depth * 0.52;
      const rowNoise = Math.sin(angle * (frequencyB - 1) + phaseA + row * 2.13)
        * options.depth * 0.09 * middleWeight;
      const relief = contourNoise * options.depth * (0.08 + middleWeight * 0.15) + rowNoise;
      const verticalBreakup = Math.sin(angle * (frequencyA + 2) + phaseB + row * 1.7)
        * options.height * 0.06 * middleWeight;
      positions.push(vec3(
        point.x + normal.x * (slopeOffset + relief),
        point.y - v * height + verticalBreakup,
        point.z + normal.z * (slopeOffset + relief),
      ));
      uvs.push(vec2(u, v));
    }
  }

  const frontVertexCount = positions.length;
  const shellThickness = options.depth * 0.32;
  for (let row = 0; row <= rows; row++) {
    for (let index = 0; index < count; index++) {
      const front = positions[row * count + index]!;
      const tangent = tangentAt(boundary, index);
      const normal = vec3(-tangent.z * sideSign, 0, tangent.x * sideSign);
      positions.push(vec3(
        front.x - normal.x * shellThickness,
        front.y,
        front.z - normal.z * shellThickness,
      ));
      const u = boundary.closed ? index / count : index / Math.max(1, count - 1);
      uvs.push(vec2(u, row / rows));
    }
  }

  const indices: number[] = [];
  const spans = boundary.closed ? count : count - 1;
  for (let row = 0; row < rows; row++) {
    for (let index = 0; index < spans; index++) {
      const next = (index + 1) % count;
      const a = row * count + index;
      const b = row * count + next;
      const c = (row + 1) * count + index;
      const d = (row + 1) * count + next;
      const flip = ((index + row) & 1) === 1;
      if (sideSign > 0) {
        if (flip) indices.push(a, d, b, a, c, d);
        else indices.push(a, c, b, b, c, d);
      } else if (flip) {
        indices.push(a, b, d, a, d, c);
      } else {
        indices.push(a, b, c, b, d, c);
      }
    }
  }
  const frontIndexCount = indices.length;
  for (let index = 0; index < frontIndexCount; index += 3) {
    indices.push(
      indices[index]! + frontVertexCount,
      indices[index + 2]! + frontVertexCount,
      indices[index + 1]! + frontVertexCount,
    );
  }
  const addShellQuad = (first: number, second: number, reverse: boolean) => {
    const backFirst = first + frontVertexCount;
    const backSecond = second + frontVertexCount;
    if (reverse) indices.push(first, backFirst, second, second, backFirst, backSecond);
    else indices.push(first, second, backFirst, second, backSecond, backFirst);
  };
  for (let index = 0; index < spans; index++) {
    const next = (index + 1) % count;
    addShellQuad(index, next, false);
    addShellQuad(rows * count + index, rows * count + next, true);
  }
  if (!boundary.closed) {
    for (let row = 0; row < rows; row++) {
      addShellQuad(row * count, (row + 1) * count, true);
      addShellQuad(row * count + count - 1, (row + 1) * count + count - 1, false);
    }
  }
  return computeNormals(makeMesh({
    positions,
    normals: positions.map(() => vec3(0, 1, 0)),
    uvs,
    indices,
  }), 18);
}

function mixSeed(seed: number, sourceIndex: number, tier: number, sideSign: number): number {
  let mixed = seed ^ Math.imul(sourceIndex + 1, 0x9e3779b1);
  mixed ^= Math.imul(tier + 1, 0x85ebca6b);
  mixed ^= sideSign > 0 ? 0x27d4eb2d : 0x165667b1;
  return mixed >>> 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
