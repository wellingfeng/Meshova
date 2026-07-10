/**
 * Procedural road ribbon (P-road): re-implementation of the core algorithm from
 * the UE5 "Quick Road" PCG plugin, ported to Meshova's deterministic geometry
 * kernel. The idea is a ribbon mesh swept along a spline (centerline):
 *
 *   1. Sample the spline by arc length. Curves get adaptively subdivided so
 *      sharp bends stay smooth (angle threshold + max recursion depth).
 *   2. At every sample, build a lateral ring of points from -halfWidth to
 *      +halfWidth across the road, using the flattened tangent's right vector.
 *   3. Connect consecutive rings into a quad strip (two triangles per cell).
 *   4. UV = (distance-along-spline, lateral-offset), so road textures and lane
 *      markings tile correctly along the driving direction.
 *
 * Everything is deterministic: same centerline + params -> same mesh. No RNG,
 * no time. The centerline is a Curve (see curve.ts); by convention roads live
 * on the XZ ground plane with +Y up, matching the rest of Meshova.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, sub, scale, cross, normalize, length, dot } from "../math/vec3.js";
import { vec2 } from "../math/vec2.js";
import { clamp, lerp } from "../math/scalar.js";
import type { Curve } from "./curve.js";
import { resampleCurve } from "./curve.js";
import type { Mesh } from "./mesh.js";
import { makeMesh, recomputeNormals } from "./mesh.js";

const UP: Vec3 = { x: 0, y: 1, z: 0 };

export interface RoadRibbonOptions {
  /** Road half-width (centerline to edge). Full road width is 2x this. */
  halfWidth?: number;
  /** Base spacing between rings along the spline (arc-length). */
  sampleDistance?: number;
  /** Number of cells across the road width (>=1). More = finer lateral tessellation. */
  widthSubdivisions?: number;
  /** Adaptively insert extra rings where the spline bends. */
  adaptiveCurvature?: boolean;
  /** Bend angle (degrees) between two samples that triggers subdivision. */
  curvatureThresholdDeg?: number;
  /** Max recursion depth for adaptive subdivision. */
  maxCurvatureSubdivisions?: number;
  /** Extra Y offset for the road surface (e.g. lift slightly above terrain). */
  verticalOffset?: number;
  /** UV scale along the driving direction (world units per V tile). */
  uvLengthScale?: number;
  /** UV scale across the road (world units per U tile). Default: full width = 1. */
  uvWidthScale?: number;
}

interface ResolvedOptions {
  halfWidth: number;
  sampleDistance: number;
  widthSubdivisions: number;
  adaptiveCurvature: boolean;
  curvatureThresholdDeg: number;
  maxCurvatureSubdivisions: number;
  verticalOffset: number;
  uvLengthScale: number;
  uvWidthScale: number;
}

function resolve(opts: RoadRibbonOptions): ResolvedOptions {
  return {
    halfWidth: Math.max(0.001, opts.halfWidth ?? 2.5),
    sampleDistance: Math.max(0.05, opts.sampleDistance ?? 1),
    widthSubdivisions: Math.max(1, Math.floor(opts.widthSubdivisions ?? 3)),
    adaptiveCurvature: opts.adaptiveCurvature ?? true,
    curvatureThresholdDeg: clamp(opts.curvatureThresholdDeg ?? 8, 1, 45),
    maxCurvatureSubdivisions: clamp(Math.floor(opts.maxCurvatureSubdivisions ?? 3), 0, 6),
    verticalOffset: opts.verticalOffset ?? 0,
    uvLengthScale: Math.max(0.001, opts.uvLengthScale ?? 8),
    uvWidthScale: Math.max(0.001, opts.uvWidthScale ?? 1),
  };
}

/** Cumulative arc length at each source point of an (open) polyline. */
function cumulativeLengths(points: Vec3[]): number[] {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1]! + length(sub(points[i]!, points[i - 1]!)));
  }
  return cum;
}

/** Position on the polyline at a given arc-length distance. */
function pointAtDistance(points: Vec3[], cum: number[], distance: number): Vec3 {
  const total = cum[cum.length - 1]!;
  if (distance <= 0) return { ...points[0]! };
  if (distance >= total) return { ...points[points.length - 1]! };
  // Binary search the segment containing `distance`.
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid]! <= distance) lo = mid;
    else hi = mid;
  }
  const segLen = cum[hi]! - cum[lo]!;
  const t = segLen > 1e-9 ? (distance - cum[lo]!) / segLen : 0;
  return add(points[lo]!, scale(sub(points[hi]!, points[lo]!), t));
}

/** Flattened (XZ) tangent direction at a distance, via a small central difference. */
function tangentAtDistance(points: Vec3[], cum: number[], distance: number): Vec3 {
  const total = cum[cum.length - 1]!;
  const eps = Math.min(0.05, total * 0.01) || 0.001;
  const a = pointAtDistance(points, cum, clamp(distance - eps, 0, total));
  const b = pointAtDistance(points, cum, clamp(distance + eps, 0, total));
  const raw = sub(b, a);
  const t = vec3(raw.x, 0, raw.z); // flatten to ground plane so the road banks flat
  if (Math.abs(t.x) < 1e-9 && Math.abs(t.z) < 1e-9) return { x: 1, y: 0, z: 0 };
  return normalize(t);
}

/** Right-vector of the road at a distance: cross(tangent, up), normalized. */
function rightAtDistance(points: Vec3[], cum: number[], distance: number): Vec3 {
  const tan = tangentAtDistance(points, cum, distance);
  const right = cross(tan, UP);
  const len = length(right);
  return len > 1e-9 ? scale(right, 1 / len) : { x: 0, y: 0, z: 1 };
}

/** Recursively insert sample distances where the spline bends past the threshold. */
function collectAdaptiveDistances(
  points: Vec3[],
  cum: number[],
  dStart: number,
  dEnd: number,
  thresholdDeg: number,
  depth: number,
  out: number[],
): void {
  if (depth <= 0) return;
  const tanA = tangentAtDistance(points, cum, dStart);
  const tanB = tangentAtDistance(points, cum, dEnd);
  const angleDeg = (Math.acos(clamp(dot(tanA, tanB), -1, 1)) * 180) / Math.PI;
  if (angleDeg < thresholdDeg) return;
  const mid = (dStart + dEnd) * 0.5;
  collectAdaptiveDistances(points, cum, dStart, mid, thresholdDeg, depth - 1, out);
  out.push(mid);
  collectAdaptiveDistances(points, cum, mid, dEnd, thresholdDeg, depth - 1, out);
}

/** Build the ordered list of arc-length distances at which to place rings. */
function buildSampleDistances(points: Vec3[], cum: number[], opt: ResolvedOptions): number[] {
  const total = cum[cum.length - 1]!;
  const distances: number[] = [0];
  for (let d = opt.sampleDistance; d < total - opt.sampleDistance * 0.25; d += opt.sampleDistance) {
    distances.push(d);
  }
  distances.push(total);

  if (!opt.adaptiveCurvature || distances.length < 2) return distances;

  const refined: number[] = [];
  for (let i = 0; i < distances.length - 1; i++) {
    refined.push(distances[i]!);
    const inserted: number[] = [];
    collectAdaptiveDistances(
      points,
      cum,
      distances[i]!,
      distances[i + 1]!,
      opt.curvatureThresholdDeg,
      opt.maxCurvatureSubdivisions,
      inserted,
    );
    for (const ins of inserted) refined.push(ins);
  }
  refined.push(distances[distances.length - 1]!);
  return refined;
}

/**
 * Build a flat road ribbon mesh swept along a centerline curve.
 * The curve is treated as a polyline on the XZ plane; Y comes from the curve
 * points plus `verticalOffset`, so it can follow terrain height if the input
 * points already carry elevation.
 */
export function roadRibbon(centerline: Curve, options: RoadRibbonOptions = {}): Mesh {
  const opt = resolve(options);
  // Densify the input first so tangents/lengths are stable, then walk arc length.
  const dense = resampleCurve(centerline, { segmentLength: opt.sampleDistance });
  const points = dense.points;
  if (points.length < 2) {
    return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  }
  const cum = cumulativeLengths(points);
  const distances = buildSampleDistances(points, cum, opt);

  const ringCount = opt.widthSubdivisions + 1;
  const positions: Vec3[] = [];
  const uvList: ReturnType<typeof vec2>[] = [];
  const indices: number[] = [];

  // Ring vertex base index for each sample distance.
  const ringBase: number[] = [];
  for (const d of distances) {
    const center = pointAtDistance(points, cum, d);
    const right = rightAtDistance(points, cum, d);
    ringBase.push(positions.length);
    for (let r = 0; r < ringCount; r++) {
      const alpha = ringCount > 1 ? r / (ringCount - 1) : 0.5;
      const lateral = lerp(-opt.halfWidth, opt.halfWidth, alpha);
      const p = add(center, scale(right, lateral));
      positions.push(vec3(p.x, p.y + opt.verticalOffset, p.z));
      uvList.push(
        vec2(
          (lateral + opt.halfWidth) / (2 * opt.halfWidth) / opt.uvWidthScale,
          d / opt.uvLengthScale,
        ),
      );
    }
  }

  // Stitch consecutive rings into quads (CCW, front face up).
  for (let s = 0; s < distances.length - 1; s++) {
    const base0 = ringBase[s]!;
    const base1 = ringBase[s + 1]!;
    for (let r = 0; r < ringCount - 1; r++) {
      const i00 = base0 + r;
      const i01 = base0 + r + 1;
      const i10 = base1 + r;
      const i11 = base1 + r + 1;
      indices.push(i00, i11, i10);
      indices.push(i00, i01, i11);
    }
  }

  const normals = positions.map(() => vec3(0, 1, 0));
  return recomputeNormals(makeMesh({ positions, normals, uvs: uvList, indices }));
}

/**
 * Add curbs (raised edges) to a road ribbon by building two thin walls along
 * the outer edges. Returns just the curb mesh; merge with the ribbon for a full
 * road. Height lifts along +Y; width extends outward from the road edge.
 */
export function roadCurbs(
  centerline: Curve,
  options: RoadRibbonOptions & { curbHeight?: number; curbWidth?: number } = {},
): Mesh {
  const opt = resolve(options);
  const curbHeight = options.curbHeight ?? 0.15;
  const curbWidth = options.curbWidth ?? 0.2;
  const dense = resampleCurve(centerline, { segmentLength: opt.sampleDistance });
  const points = dense.points;
  if (points.length < 2) {
    return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  }
  const cum = cumulativeLengths(points);
  const distances = buildSampleDistances(points, cum, opt);

  const positions: Vec3[] = [];
  const uvList: ReturnType<typeof vec2>[] = [];
  const indices: number[] = [];

  // Each side gets a 4-vertex cross section (inner-bottom, inner-top,
  // outer-top, outer-bottom) extruded along the spline.
  for (const side of [-1, 1] as const) {
    const sideBase: number[] = [];
    for (const d of distances) {
      const center = pointAtDistance(points, cum, d);
      const right = rightAtDistance(points, cum, d);
      const edge = add(center, scale(right, side * opt.halfWidth));
      const outer = add(edge, scale(right, side * curbWidth));
      const y0 = opt.verticalOffset;
      const y1 = opt.verticalOffset + curbHeight;
      sideBase.push(positions.length);
      const innerBottom = { x: edge.x, y: edge.y + y0, z: edge.z };
      const innerTop = { x: edge.x, y: edge.y + y1, z: edge.z };
      const outerTop = { x: outer.x, y: outer.y + y1, z: outer.z };
      const outerBottom = { x: outer.x, y: outer.y + y0, z: outer.z };
      const cross4 = [innerBottom, innerTop, outerTop, outerBottom];
      for (const p of cross4) {
        positions.push(p);
        uvList.push(vec2(0, d / opt.uvLengthScale));
      }
    }
    // Connect the 4-vertex cross sections into a tube-like strip.
    for (let s = 0; s < distances.length - 1; s++) {
      const b0 = sideBase[s]!;
      const b1 = sideBase[s + 1]!;
      for (let e = 0; e < 4; e++) {
        const e2 = (e + 1) % 4;
        const i00 = b0 + e;
        const i01 = b0 + e2;
        const i10 = b1 + e;
        const i11 = b1 + e2;
        if (side > 0) {
          indices.push(i00, i11, i10, i00, i01, i11);
        } else {
          indices.push(i00, i10, i11, i00, i11, i01);
        }
      }
    }
  }

  const normals = positions.map(() => vec3(0, 1, 0));
  return recomputeNormals(makeMesh({ positions, normals, uvs: uvList, indices }));
}

/**
 * Center lane markings: a thin flat strip running down the middle of the road,
 * lifted just above the surface. Good for a painted centerline. Returns the
 * marking mesh only.
 */
export function roadCenterLine(
  centerline: Curve,
  options: RoadRibbonOptions & { lineWidth?: number } = {},
): Mesh {
  const lineWidth = options.lineWidth ?? 0.15;
  return roadRibbon(centerline, {
    ...options,
    halfWidth: lineWidth * 0.5,
    verticalOffset: (options.verticalOffset ?? 0) + 0.01,
    widthSubdivisions: 1,
  });
}

export interface RoadMarkingOptions extends RoadRibbonOptions {
  /** Painted line width (metres). */
  lineWidth?: number;
  /** Dash length along the driving direction. 0 or dashed:false -> solid line. */
  dashLength?: number;
  /** Gap between dashes along the driving direction. */
  gapLength?: number;
  /** Draw dashed (true) or solid (false) lines. */
  dashed?: boolean;
}

/**
 * Build one flat painted strip (solid or dashed) offset laterally from the
 * centerline by `lateral` metres, lifted just above the road surface. Shared
 * worker for lane dividers and edge lines. Each dash is a quad following the
 * spline; UV runs (lateral, distance) like the ribbon.
 */
function paintedStrip(
  points: Vec3[],
  cum: number[],
  opt: ResolvedOptions,
  lateral: number,
  halfLine: number,
  dashed: boolean,
  dashLen: number,
  gapLen: number,
  lift: number,
): { positions: Vec3[]; uvs: ReturnType<typeof vec2>[]; indices: number[] } {
  const total = cum[cum.length - 1]!;
  const positions: Vec3[] = [];
  const uvs: ReturnType<typeof vec2>[] = [];
  const indices: number[] = [];
  const period = dashed ? Math.max(0.01, dashLen + gapLen) : total;
  const on = dashed ? Math.max(0.01, dashLen) : total;

  const emitQuad = (dStart: number, dEnd: number): void => {
    const base = positions.length;
    for (const d of [dStart, dEnd] as const) {
      const center = pointAtDistance(points, cum, d);
      const right = rightAtDistance(points, cum, d);
      const mid = add(center, scale(right, lateral));
      const left = add(mid, scale(right, -halfLine));
      const rgt = add(mid, scale(right, halfLine));
      const y = opt.verticalOffset + lift;
      positions.push(vec3(left.x, left.y + y, left.z), vec3(rgt.x, rgt.y + y, rgt.z));
      uvs.push(vec2(0, d / opt.uvLengthScale), vec2(1, d / opt.uvLengthScale));
    }
    // base..base+3 = [startL, startR, endL, endR]; CCW facing up.
    indices.push(base, base + 3, base + 2, base, base + 1, base + 3);
  };

  for (let d = 0; d < total - 1e-6; d += period) {
    const end = Math.min(total, d + on);
    if (end - d < 1e-4) continue;
    emitQuad(d, end);
  }
  return { positions, uvs, indices };
}

/**
 * Lane divider markings: dashed (or solid) painted lines at the internal lane
 * boundaries of a multi-lane road. `lanes` is the total number of lanes across
 * the full width; `lanes-1` divider lines are placed. Returns the marking mesh
 * only (lift it above the ribbon, surfacePart it as white/yellow paint).
 * Skips the central divider so it can be painted separately (double-yellow).
 */
export function roadLaneLines(
  centerline: Curve,
  options: RoadMarkingOptions & { lanes?: number; skipCenter?: boolean } = {},
): Mesh {
  const opt = resolve(options);
  const lanes = Math.max(2, Math.floor(options.lanes ?? 2));
  const halfLine = (options.lineWidth ?? 0.12) * 0.5;
  const dashed = options.dashed ?? true;
  const dashLen = options.dashLength ?? 2;
  const gapLen = options.gapLength ?? 3;
  const skipCenter = options.skipCenter ?? true;
  const dense = resampleCurve(centerline, { segmentLength: opt.sampleDistance });
  const points = dense.points;
  if (points.length < 2) return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  const cum = cumulativeLengths(points);

  const laneW = (2 * opt.halfWidth) / lanes;
  const positions: Vec3[] = [];
  const uvs: ReturnType<typeof vec2>[] = [];
  const indices: number[] = [];
  const centerIdx = lanes / 2; // integer only when lanes is even
  for (let i = 1; i < lanes; i++) {
    if (skipCenter && lanes % 2 === 0 && i === centerIdx) continue;
    const lateral = -opt.halfWidth + laneW * i;
    const strip = paintedStrip(points, cum, opt, lateral, halfLine, dashed, dashLen, gapLen, 0.012);
    const off = positions.length;
    positions.push(...strip.positions);
    uvs.push(...strip.uvs);
    indices.push(...strip.indices.map((n) => n + off));
  }
  const normals = positions.map(() => vec3(0, 1, 0));
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

/**
 * Solid edge lines running along both outer edges of the road (the white lines
 * that bound the carriageway). Returns the marking mesh only.
 */
export function roadEdgeLines(
  centerline: Curve,
  options: RoadMarkingOptions & { edgeInset?: number } = {},
): Mesh {
  const opt = resolve(options);
  const halfLine = (options.lineWidth ?? 0.12) * 0.5;
  const inset = options.edgeInset ?? 0.2;
  const dense = resampleCurve(centerline, { segmentLength: opt.sampleDistance });
  const points = dense.points;
  if (points.length < 2) return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  const cum = cumulativeLengths(points);

  const positions: Vec3[] = [];
  const uvs: ReturnType<typeof vec2>[] = [];
  const indices: number[] = [];
  for (const side of [-1, 1] as const) {
    const lateral = side * (opt.halfWidth - inset);
    const strip = paintedStrip(points, cum, opt, lateral, halfLine, false, 0, 0, 0.012);
    const off = positions.length;
    positions.push(...strip.positions);
    uvs.push(...strip.uvs);
    indices.push(...strip.indices.map((n) => n + off));
  }
  const normals = positions.map(() => vec3(0, 1, 0));
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

/**
 * Jersey barrier / median wall: a continuous crash barrier swept along the
 * centerline (the concrete divider between opposing carriageways on a freeway).
 * Cross-section is a stylized Jersey profile: wide foot, sloped lower face,
 * narrow top. Returns the barrier mesh only; place it on the centerline (or
 * offset laterally for edge barriers). Deterministic — pure sweep, no RNG.
 */
export function roadMedianBarrier(
  centerline: Curve,
  options: RoadRibbonOptions & { barrierHeight?: number; barrierWidth?: number } = {},
): Mesh {
  const opt = resolve(options);
  const h = options.barrierHeight ?? 0.9;
  const w = options.barrierWidth ?? 0.6;
  const dense = resampleCurve(centerline, { segmentLength: opt.sampleDistance });
  const points = dense.points;
  if (points.length < 2) return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  const cum = cumulativeLengths(points);
  const distances = buildSampleDistances(points, cum, opt);

  // Jersey cross-section as lateral/height offsets. y is up, lat is right vector.
  const footHalf = w * 0.5;
  const topHalf = w * 0.18;
  const kneeH = h * 0.28;
  const profile: Array<{ lat: number; y: number }> = [
    { lat: -footHalf, y: 0 },
    { lat: -footHalf * 0.75, y: kneeH },
    { lat: -topHalf, y: h },
    { lat: topHalf, y: h },
    { lat: footHalf * 0.75, y: kneeH },
    { lat: footHalf, y: 0 },
  ];
  const n = profile.length;

  const positions: Vec3[] = [];
  const uvList: ReturnType<typeof vec2>[] = [];
  const indices: number[] = [];
  const ringBase: number[] = [];
  for (const d of distances) {
    const center = pointAtDistance(points, cum, d);
    const right = rightAtDistance(points, cum, d);
    ringBase.push(positions.length);
    for (const pr of profile) {
      const p = add(center, scale(right, pr.lat));
      positions.push(vec3(p.x, p.y + opt.verticalOffset + pr.y, p.z));
      uvList.push(vec2((pr.lat + footHalf) / w, d / opt.uvLengthScale));
    }
  }
  for (let s = 0; s < distances.length - 1; s++) {
    const b0 = ringBase[s]!;
    const b1 = ringBase[s + 1]!;
    for (let e = 0; e < n - 1; e++) {
      const i00 = b0 + e, i01 = b0 + e + 1, i10 = b1 + e, i11 = b1 + e + 1;
      indices.push(i00, i11, i10, i00, i01, i11);
    }
  }
  const normals = positions.map(() => vec3(0, 1, 0));
  return recomputeNormals(makeMesh({ positions, normals, uvs: uvList, indices }));
}

/**
 * Metal guardrail: evenly spaced posts plus a horizontal rail beam, run along
 * one edge of the road (offset laterally from the centerline). `side` = +1 for
 * the right edge, -1 for the left. Returns the combined guardrail mesh. The rail
 * follows the spline; posts sit at a fixed spacing. Deterministic.
 */
export function roadGuardrail(
  centerline: Curve,
  options: RoadRibbonOptions & {
    side?: 1 | -1;
    lateral?: number;
    postSpacing?: number;
    railHeight?: number;
    postSize?: number;
  } = {},
): Mesh {
  const opt = resolve(options);
  const side = options.side ?? 1;
  const lateral = options.lateral ?? opt.halfWidth + 0.2;
  const spacing = Math.max(0.5, options.postSpacing ?? 3);
  const railH = options.railHeight ?? 0.6;
  const postSize = options.postSize ?? 0.08;
  const railHalf = 0.06;
  const dense = resampleCurve(centerline, { segmentLength: opt.sampleDistance });
  const points = dense.points;
  if (points.length < 2) return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  const cum = cumulativeLengths(points);
  const total = cum[cum.length - 1]!;

  const positions: Vec3[] = [];
  const uvList: ReturnType<typeof vec2>[] = [];
  const indices: number[] = [];

  // Horizontal rail beam: a thin box swept along the spline at railH.
  const railDist = buildSampleDistances(points, cum, opt);
  const railBaseIdx: number[] = [];
  for (const d of railDist) {
    const center = pointAtDistance(points, cum, d);
    const right = rightAtDistance(points, cum, d);
    const at = add(center, scale(right, side * lateral));
    const yTop = opt.verticalOffset + railH + railHalf;
    const yBot = opt.verticalOffset + railH - railHalf;
    railBaseIdx.push(positions.length);
    const inner = add(at, scale(right, side * -postSize * 0.5));
    const outer = add(at, scale(right, side * postSize * 0.5));
    positions.push(
      vec3(inner.x, inner.y + yBot, inner.z),
      vec3(inner.x, inner.y + yTop, inner.z),
      vec3(outer.x, outer.y + yTop, outer.z),
      vec3(outer.x, outer.y + yBot, outer.z),
    );
    for (let k = 0; k < 4; k++) uvList.push(vec2(0, d / opt.uvLengthScale));
  }
  for (let s = 0; s < railDist.length - 1; s++) {
    const b0 = railBaseIdx[s]!;
    const b1 = railBaseIdx[s + 1]!;
    for (let e = 0; e < 4; e++) {
      const e2 = (e + 1) % 4;
      const i00 = b0 + e, i01 = b0 + e2, i10 = b1 + e, i11 = b1 + e2;
      if (side > 0) indices.push(i00, i11, i10, i00, i01, i11);
      else indices.push(i00, i10, i11, i00, i11, i01);
    }
  }

  // Posts at fixed spacing: a small vertical box from ground to rail top.
  const emitPost = (d: number): void => {
    const center = pointAtDistance(points, cum, d);
    const right = rightAtDistance(points, cum, d);
    const at = add(center, scale(right, side * lateral));
    const y0 = opt.verticalOffset;
    const y1 = opt.verticalOffset + railH + railHalf;
    const hs = postSize * 0.5;
    const corners: Array<[number, number]> = [
      [-hs, -hs], [hs, -hs], [hs, hs], [-hs, hs],
    ];
    const base = positions.length;
    for (const [dx, dz] of corners) {
      positions.push(vec3(at.x + dx, at.y + y0, at.z + dz));
      uvList.push(vec2(0, 0));
    }
    for (const [dx, dz] of corners) {
      positions.push(vec3(at.x + dx, at.y + y1, at.z + dz));
      uvList.push(vec2(0, 1));
    }
    for (let e = 0; e < 4; e++) {
      const e2 = (e + 1) % 4;
      const b0 = base + e, b1 = base + e2, t0 = base + 4 + e, t1 = base + 4 + e2;
      indices.push(b0, t0, t1, b0, t1, b1);
    }
  };
  for (let d = spacing * 0.5; d < total; d += spacing) emitPost(d);

  const normals = positions.map(() => vec3(0, 1, 0));
  return recomputeNormals(makeMesh({ positions, normals, uvs: uvList, indices }));
}

/**
 * Elevated support pillars for a viaduct/overpass: evenly spaced columns from
 * the ground (groundY) up to the underside of the road deck. Deck height comes
 * from the centerline Y plus `verticalOffset`; pillars are placed at `spacing`
 * along the spline, centered under the road. Returns the merged pillar mesh.
 * Deterministic.
 */
export function roadPillars(
  centerline: Curve,
  options: RoadRibbonOptions & {
    spacing?: number;
    radius?: number;
    groundY?: number;
    deckThickness?: number;
    /** Column cross-section: "round" cylinder (default) or "square" pier. */
    shape?: "round" | "square";
    /** Taper factor at the top (1 = straight, <1 = narrower top). */
    taper?: number;
  } = {},
): Mesh {
  const opt = resolve(options);
  const spacing = Math.max(1, options.spacing ?? 8);
  const radius = options.radius ?? 0.5;
  const groundY = options.groundY ?? 0;
  const deckT = options.deckThickness ?? 0.4;
  const shape = options.shape ?? "round";
  const taper = options.taper ?? 1;
  const dense = resampleCurve(centerline, { segmentLength: opt.sampleDistance });
  const points = dense.points;
  if (points.length < 2) return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  const cum = cumulativeLengths(points);
  const total = cum[cum.length - 1]!;

  const positions: Vec3[] = [];
  const uvList: ReturnType<typeof vec2>[] = [];
  const indices: number[] = [];
  // Round columns use a smooth 12-gon ring; square piers use a 4-gon with the
  // ring radius scaled so the flat side length matches the requested radius*2.
  const seg = shape === "square" ? 4 : 12;
  const angleOffset = shape === "square" ? Math.PI / 4 : 0;
  const ringScale = shape === "square" ? Math.SQRT2 : 1;

  const emitPillar = (d: number): void => {
    const center = pointAtDistance(points, cum, d);
    const deckBottom = center.y + opt.verticalOffset - deckT;
    const h = deckBottom - groundY;
    if (h <= 0.01) return;
    const base = positions.length;
    for (let y = 0; y < 2; y++) {
      const py = y === 0 ? groundY : deckBottom;
      // Optional taper: the top ring (y=1) can be narrower than the base.
      const rScale = (y === 0 ? 1 : taper) * ringScale;
      for (let i = 0; i <= seg; i++) {
        const a = angleOffset + (i / seg) * Math.PI * 2;
        const nx = Math.cos(a), nz = Math.sin(a);
        positions.push(vec3(center.x + nx * radius * rScale, py, center.z + nz * radius * rScale));
        uvList.push(vec2(i / seg, y));
      }
    }
    const row = seg + 1;
    for (let i = 0; i < seg; i++) {
      const i00 = base + i, i01 = base + i + 1;
      const i10 = base + row + i, i11 = base + row + i + 1;
      indices.push(i00, i11, i10, i00, i01, i11);
    }
    const topC = positions.length;
    positions.push(vec3(center.x, deckBottom, center.z));
    uvList.push(vec2(0.5, 0.5));
    for (let i = 0; i < seg; i++) {
      indices.push(topC, base + row + i, base + row + i + 1);
    }
  };
  for (let d = spacing * 0.5; d < total; d += spacing) emitPillar(d);

  const normals = positions.map(() => vec3(0, 1, 0));
  return recomputeNormals(makeMesh({ positions, normals, uvs: uvList, indices }));
}

/**
 * Push an axis-oriented box into the given buffers. The box is defined by a
 * center and three (unit) axes with their half-extents; faces are wound CCW so
 * their outward normals point away from the center. Shared by the freeway
 * bridge/gantry parts below. UVs are stubbed (0,0) — these are structural
 * concrete/steel parts, not paint.
 */
function emitOrientedBox(
  positions: Vec3[],
  uvList: ReturnType<typeof vec2>[],
  indices: number[],
  center: Vec3,
  axisR: Vec3,
  axisU: Vec3,
  axisT: Vec3,
  hr: number,
  hu: number,
  ht: number,
): void {
  const base = positions.length;
  // 8 corners: bit order (sx,sy,sz) with s in {0->-1, 1->+1}.
  for (let c = 0; c < 8; c++) {
    const sx = c & 1 ? 1 : -1;
    const sy = c & 2 ? 1 : -1;
    const sz = c & 4 ? 1 : -1;
    const p = add(
      add(center, scale(axisR, sx * hr)),
      add(scale(axisU, sy * hu), scale(axisT, sz * ht)),
    );
    positions.push(vec3(p.x, p.y, p.z));
    uvList.push(vec2(0, 0));
  }
  // 6 quad faces (two tris each), CCW seen from outside.
  const quad = (a: number, b: number, cc: number, d: number): void => {
    indices.push(base + a, base + b, base + cc, base + a, base + cc, base + d);
  };
  quad(0, 2, 3, 1); // -Z
  quad(4, 5, 7, 6); // +Z
  quad(0, 1, 5, 4); // -Y
  quad(2, 6, 7, 3); // +Y
  quad(0, 4, 6, 2); // -X
  quad(1, 3, 7, 5); // +X
}

/**
 * Solid road deck with thickness — a closed box beam swept along the centerline
 * (Meshova's take on CitySample's SM_FREEWAY_BRIDGE sections + the underside
 * mesh-decal). Unlike roadRibbon (a single driving surface), this has a real
 * bottom and side faces, so an elevated viaduct reads as a chunky bridge slab
 * from below instead of a paper-thin sheet. Cross-section is a rectangle from
 * `verticalOffset` (top) down to `verticalOffset - thickness` (bottom); side
 * walls follow the road's right vector so the slab banks flat through bends.
 * End caps close the tube. Deterministic — pure sweep.
 */
export function roadDeck(
  centerline: Curve,
  options: RoadRibbonOptions & { thickness?: number } = {},
): Mesh {
  const opt = resolve(options);
  const thickness = Math.max(0.02, options.thickness ?? 0.5);
  const dense = resampleCurve(centerline, { segmentLength: opt.sampleDistance });
  const points = dense.points;
  if (points.length < 2) return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  const cum = cumulativeLengths(points);
  const distances = buildSampleDistances(points, cum, opt);

  // Rectangular cross-section as (lat, y) offsets, wound so the tube faces out.
  const top = opt.verticalOffset;
  const bot = opt.verticalOffset - thickness;
  const hw = opt.halfWidth;
  const profile: Array<{ lat: number; y: number }> = [
    { lat: -hw, y: top },
    { lat: hw, y: top },
    { lat: hw, y: bot },
    { lat: -hw, y: bot },
  ];
  const n = profile.length;

  const positions: Vec3[] = [];
  const uvList: ReturnType<typeof vec2>[] = [];
  const indices: number[] = [];
  const ringBase: number[] = [];
  for (const d of distances) {
    const center = pointAtDistance(points, cum, d);
    const right = rightAtDistance(points, cum, d);
    ringBase.push(positions.length);
    for (const pr of profile) {
      const p = add(center, scale(right, pr.lat));
      positions.push(vec3(p.x, p.y + pr.y, p.z));
      uvList.push(vec2((pr.lat + hw) / (2 * hw), d / opt.uvLengthScale));
    }
  }
  for (let s = 0; s < distances.length - 1; s++) {
    const b0 = ringBase[s]!;
    const b1 = ringBase[s + 1]!;
    for (let e = 0; e < n; e++) {
      const e2 = (e + 1) % n;
      const i00 = b0 + e, i01 = b0 + e2, i10 = b1 + e, i11 = b1 + e2;
      indices.push(i00, i11, i10, i00, i01, i11);
    }
  }
  // End caps (fan from vertex 0 of each end ring).
  const first = ringBase[0]!;
  indices.push(first, first + 2, first + 1, first, first + 3, first + 2);
  const last = ringBase[ringBase.length - 1]!;
  indices.push(last, last + 1, last + 2, last, last + 2, last + 3);

  const normals = positions.map(() => vec3(0, 1, 0));
  return recomputeNormals(makeMesh({ positions, normals, uvs: uvList, indices }));
}

/**
 * Pier cap / support cross-beams — the wide horizontal beams that sit on top of
 * the viaduct columns and carry the deck (CitySample's SM_Support_Ceiling_Beam
 * / SM_Support_Beam_Rectangle). One transverse beam is placed at each pillar
 * station, spanning the full road width just under the deck underside. Returns
 * the merged beam mesh. Pair with roadPillars using the same `spacing`.
 * Deterministic.
 */
export function roadPierCaps(
  centerline: Curve,
  options: RoadRibbonOptions & {
    spacing?: number;
    capWidth?: number;
    capHeight?: number;
    capLength?: number;
    deckThickness?: number;
  } = {},
): Mesh {
  const opt = resolve(options);
  const spacing = Math.max(1, options.spacing ?? 8);
  const capHeight = options.capHeight ?? 0.6;
  const capLength = options.capLength ?? 1.0; // extent along the road direction
  const deckT = options.deckThickness ?? 0.5;
  // Span the full width plus a small overhang unless overridden.
  const halfSpan = (options.capWidth ?? opt.halfWidth * 2 + 0.6) * 0.5;
  const dense = resampleCurve(centerline, { segmentLength: opt.sampleDistance });
  const points = dense.points;
  if (points.length < 2) return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  const cum = cumulativeLengths(points);
  const total = cum[cum.length - 1]!;

  const positions: Vec3[] = [];
  const uvList: ReturnType<typeof vec2>[] = [];
  const indices: number[] = [];

  const emitCap = (d: number): void => {
    const center = pointAtDistance(points, cum, d);
    const right = rightAtDistance(points, cum, d);
    const tan = tangentAtDistance(points, cum, d);
    // Beam top sits at the deck underside; grows downward by capHeight.
    const topY = center.y + opt.verticalOffset - deckT;
    const c = vec3(center.x, topY - capHeight * 0.5, center.z);
    emitOrientedBox(
      positions, uvList, indices, c,
      right, UP, tan,
      halfSpan, capHeight * 0.5, capLength * 0.5,
    );
  };
  for (let d = spacing * 0.5; d < total; d += spacing) emitCap(d);

  const normals = positions.map(() => vec3(0, 1, 0));
  return recomputeNormals(makeMesh({ positions, normals, uvs: uvList, indices }));
}

/**
 * Overhead sign gantry — the sign bridges that straddle a freeway (CitySample's
 * Kit_FreewaySign Frame_A: two vertical poles, a horizontal truss beam spanning
 * the carriageway at `clearance` height, and a rectangular sign panel hanging
 * below the beam). One gantry is emitted per `spacing` interval. `panelSpan`
 * controls how wide the sign board is (0 = beam only). Returns the merged mesh.
 * Deterministic — no RNG.
 */
export function roadSignGantry(
  centerline: Curve,
  options: RoadRibbonOptions & {
    spacing?: number;
    clearance?: number;
    poleRadius?: number;
    beamThickness?: number;
    panelSpan?: number;
    panelHeight?: number;
    overhang?: number;
  } = {},
): Mesh {
  const opt = resolve(options);
  const spacing = Math.max(1, options.spacing ?? 40);
  const clearance = options.clearance ?? 5.5;
  const poleR = options.poleRadius ?? 0.18;
  const beamT = options.beamThickness ?? 0.22;
  const overhang = options.overhang ?? 0.6;
  const halfSpan = opt.halfWidth + overhang;
  const panelSpan = options.panelSpan ?? opt.halfWidth * 1.4;
  const panelH = options.panelHeight ?? 1.6;
  const dense = resampleCurve(centerline, { segmentLength: opt.sampleDistance });
  const points = dense.points;
  if (points.length < 2) return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  const cum = cumulativeLengths(points);
  const total = cum[cum.length - 1]!;

  const positions: Vec3[] = [];
  const uvList: ReturnType<typeof vec2>[] = [];
  const indices: number[] = [];

  const emitGantry = (d: number): void => {
    const center = pointAtDistance(points, cum, d);
    const right = rightAtDistance(points, cum, d);
    const tan = tangentAtDistance(points, cum, d);
    const y0 = center.y + opt.verticalOffset;
    // Two poles at +/- halfSpan.
    for (const s of [-1, 1] as const) {
      const foot = add(center, scale(right, s * halfSpan));
      const c = vec3(foot.x, y0 + clearance * 0.5, foot.z);
      emitOrientedBox(positions, uvList, indices, c, right, UP, tan, poleR, clearance * 0.5, poleR);
    }
    // Horizontal truss beam across the top.
    const beamC = vec3(center.x, y0 + clearance + beamT * 0.5, center.z);
    emitOrientedBox(positions, uvList, indices, beamC, right, UP, tan, halfSpan, beamT * 0.5, beamT);
    // Sign panel hanging below the beam, centered over the road.
    if (panelSpan > 0.01) {
      const panelC = vec3(center.x, y0 + clearance - panelH * 0.5, center.z);
      emitOrientedBox(positions, uvList, indices, panelC, right, UP, tan, panelSpan, panelH * 0.5, 0.06);
    }
  };
  for (let d = spacing * 0.5; d < total; d += spacing) emitGantry(d);

  const normals = positions.map(() => vec3(0, 1, 0));
  return recomputeNormals(makeMesh({ positions, normals, uvs: uvList, indices }));
}
