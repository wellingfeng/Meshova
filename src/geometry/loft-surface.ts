import { vec2 } from "../math/vec2.js";
import { scale, sub, vec3, type Vec3 } from "../math/vec3.js";
import { makeMesh, recomputeNormals, type Mesh } from "./mesh.js";

export type LoftSurfaceInterpolation = "linear" | "catmull-rom";

export interface LoftSurfaceOptions {
  /** Samples per control-ring span along the loft direction. */
  readonly longitudinalSubdivisions?: number;
  /** Samples per control-point span around each closed section. */
  readonly crossSectionSubdivisions?: number;
  readonly longitudinalInterpolation?: LoftSurfaceInterpolation;
  readonly crossSectionInterpolation?: LoftSurfaceInterpolation;
  /** Catmull-Rom tangent scale. 0 is linear easing; 0.5 is standard. */
  readonly longitudinalTension?: number;
  /** Catmull-Rom tangent scale around the section. */
  readonly crossSectionTension?: number;
  readonly caps?: boolean;
  /** Uses control-span indices, so holes stay stable when tessellation changes. */
  readonly includePatch?: (longitudinalSpan: number, crossSectionSpan: number) => boolean;
}

export interface LoftSurfacePatchOptions {
  readonly longitudinalStart: number;
  readonly longitudinalEnd: number;
  readonly crossSectionStart: number;
  readonly crossSectionEnd: number;
  readonly longitudinalSegments?: number;
  readonly crossSectionSegments?: number;
  readonly longitudinalInterpolation?: LoftSurfaceInterpolation;
  readonly crossSectionInterpolation?: LoftSurfaceInterpolation;
  readonly longitudinalTension?: number;
  readonly crossSectionTension?: number;
  readonly offset?: Vec3;
  readonly doubleSided?: boolean;
}

function interpolate(a: Vec3, b: Vec3, t: number): Vec3 {
  return vec3(
    a.x + (b.x - a.x) * t,
    a.y + (b.y - a.y) * t,
    a.z + (b.z - a.z) * t,
  );
}

function catmullRom(a: Vec3, b: Vec3, c: Vec3, d: Vec3, t: number, tension: number): Vec3 {
  const t2 = t * t;
  const t3 = t2 * t;
  const m0 = scale(sub(c, a), tension);
  const m1 = scale(sub(d, b), tension);
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return vec3(
    b.x * h00 + m0.x * h10 + c.x * h01 + m1.x * h11,
    b.y * h00 + m0.y * h10 + c.y * h01 + m1.y * h11,
    b.z * h00 + m0.z * h10 + c.z * h01 + m1.z * h11,
  );
}

function sampleSpan(
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
  t: number,
  interpolation: LoftSurfaceInterpolation,
  tension: number,
): Vec3 {
  return interpolation === "linear" ? interpolate(b, c, t) : catmullRom(a, b, c, d, t, tension);
}

function validateRings(controlRings: ReadonlyArray<ReadonlyArray<Vec3>>): number {
  const ringSize = controlRings[0]?.length ?? 0;
  if (controlRings.length < 2 || ringSize < 3) return 0;
  if (controlRings.some((ring) => ring.length !== ringSize)) {
    throw new Error("loftSurface requires equal-sized control rings");
  }
  return ringSize;
}

function sampleLongitudinalRing(
  controlRings: ReadonlyArray<ReadonlyArray<Vec3>>,
  span: number,
  t: number,
  interpolation: LoftSurfaceInterpolation,
  tension: number,
): Vec3[] {
  const ringAt = (index: number): ReadonlyArray<Vec3> => (
    controlRings[Math.max(0, Math.min(controlRings.length - 1, index))]!
  );
  const a = ringAt(span - 1);
  const b = ringAt(span);
  const c = ringAt(span + 1);
  const d = ringAt(span + 2);
  return b.map((_, index) => sampleSpan(a[index]!, b[index]!, c[index]!, d[index]!, t, interpolation, tension));
}

/** Samples the same tensor-product surface used by loftSurface in control-grid coordinates. */
export function sampleLoftSurface(
  controlRings: ReadonlyArray<ReadonlyArray<Vec3>>,
  longitudinalCoordinate: number,
  crossSectionCoordinate: number,
  options: Pick<
    LoftSurfaceOptions,
    "longitudinalInterpolation" | "crossSectionInterpolation" | "longitudinalTension" | "crossSectionTension"
  > = {},
): Vec3 {
  const ringSize = validateRings(controlRings);
  if (ringSize === 0) throw new Error("sampleLoftSurface requires at least two valid control rings");
  const maximumLongitudinal = controlRings.length - 1;
  const longitudinal = Math.max(0, Math.min(maximumLongitudinal, longitudinalCoordinate));
  const longitudinalSpan = Math.min(maximumLongitudinal - 1, Math.floor(longitudinal));
  const longitudinalT = longitudinal - longitudinalSpan;
  const crossSection = ((crossSectionCoordinate % ringSize) + ringSize) % ringSize;
  const crossSectionSpan = Math.floor(crossSection);
  const crossSectionT = crossSection - crossSectionSpan;
  const sampledRing = sampleLongitudinalRing(
    controlRings,
    longitudinalSpan,
    longitudinalT,
    options.longitudinalInterpolation ?? "catmull-rom",
    options.longitudinalTension ?? 0.5,
  );
  const at = (index: number): Vec3 => sampledRing[(index + ringSize) % ringSize]!;
  return sampleSpan(
    at(crossSectionSpan - 1),
    at(crossSectionSpan),
    at(crossSectionSpan + 1),
    at(crossSectionSpan + 2),
    crossSectionT,
    options.crossSectionInterpolation ?? "catmull-rom",
    options.crossSectionTension ?? 0.5,
  );
}

/** Builds a trimmed rectangular patch that exactly follows a loftSurface control domain. */
export function loftSurfacePatch(
  controlRings: ReadonlyArray<ReadonlyArray<Vec3>>,
  options: LoftSurfacePatchOptions,
): Mesh {
  validateRings(controlRings);
  const longitudinalSegments = Math.max(1, Math.floor(options.longitudinalSegments ?? 5));
  const crossSectionSegments = Math.max(1, Math.floor(options.crossSectionSegments ?? 3));
  const rowSize = crossSectionSegments + 1;
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];
  const offset = options.offset ?? vec3(0, 0, 0);

  for (let row = 0; row <= longitudinalSegments; row++) {
    const u = row / longitudinalSegments;
    const longitudinal = options.longitudinalStart
      + (options.longitudinalEnd - options.longitudinalStart) * u;
    for (let column = 0; column <= crossSectionSegments; column++) {
      const v = column / crossSectionSegments;
      const crossSection = options.crossSectionStart
        + (options.crossSectionEnd - options.crossSectionStart) * v;
      const point = sampleLoftSurface(controlRings, longitudinal, crossSection, options);
      positions.push(vec3(point.x + offset.x, point.y + offset.y, point.z + offset.z));
      normals.push(vec3(0, 1, 0));
      uvs.push(vec2(v, u));
    }
  }

  for (let row = 0; row < longitudinalSegments; row++) {
    for (let column = 0; column < crossSectionSegments; column++) {
      const a = row * rowSize + column;
      const b = a + 1;
      const c = a + rowSize;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  if (options.doubleSided) {
    const count = positions.length;
    positions.push(...positions.slice(0, count).map((point) => ({ ...point })));
    normals.push(...normals.slice(0, count).map((normal) => scale(normal, -1)));
    uvs.push(...uvs.slice(0, count).map((uv) => ({ ...uv })));
    const frontIndices = [...indices];
    for (let index = 0; index < frontIndices.length; index += 3) {
      indices.push(
        frontIndices[index]! + count,
        frontIndices[index + 2]! + count,
        frontIndices[index + 1]! + count,
      );
    }
  }

  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function sampleClosedSection(
  controlRing: ReadonlyArray<Vec3>,
  subdivisions: number,
  interpolation: LoftSurfaceInterpolation,
  tension: number,
): Vec3[] {
  const size = controlRing.length;
  const at = (index: number): Vec3 => controlRing[(index + size) % size]!;
  const sampled: Vec3[] = [];
  for (let span = 0; span < size; span++) {
    for (let sample = 0; sample < subdivisions; sample++) {
      sampled.push(sampleSpan(
        at(span - 1),
        at(span),
        at(span + 1),
        at(span + 2),
        sample / subdivisions,
        interpolation,
        tension,
      ));
    }
  }
  return sampled;
}

/**
 * Tensor-product loft for vehicle bodies and other closed sectional forms.
 * Both directions can use Catmull-Rom interpolation, producing an editable C1
 * surface from sparse control rings without baking model-specific polygons.
 */
export function loftSurface(
  controlRings: ReadonlyArray<ReadonlyArray<Vec3>>,
  options: LoftSurfaceOptions = {},
): Mesh {
  const ringSize = validateRings(controlRings);
  if (ringSize === 0) return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });

  const longitudinalSubdivisions = Math.max(1, Math.floor(options.longitudinalSubdivisions ?? 4));
  const crossSectionSubdivisions = Math.max(1, Math.floor(options.crossSectionSubdivisions ?? 3));
  const longitudinalInterpolation = options.longitudinalInterpolation ?? "catmull-rom";
  const crossSectionInterpolation = options.crossSectionInterpolation ?? "catmull-rom";
  const longitudinalTension = options.longitudinalTension ?? 0.5;
  const crossSectionTension = options.crossSectionTension ?? 0.5;
  const includePatch = options.includePatch ?? (() => true);
  const spanCount = controlRings.length - 1;
  const sampledRings: Vec3[][] = [];

  for (let span = 0; span < spanCount; span++) {
    for (let sample = 0; sample < longitudinalSubdivisions; sample++) {
      sampledRings.push(sampleClosedSection(
        sampleLongitudinalRing(
          controlRings,
          span,
          sample / longitudinalSubdivisions,
          longitudinalInterpolation,
          longitudinalTension,
        ),
        crossSectionSubdivisions,
        crossSectionInterpolation,
        crossSectionTension,
      ));
    }
  }
  sampledRings.push(sampleClosedSection(
    controlRings[controlRings.length - 1]!,
    crossSectionSubdivisions,
    crossSectionInterpolation,
    crossSectionTension,
  ));

  const sampledRingSize = ringSize * crossSectionSubdivisions;
  const positions = sampledRings.flatMap((ring) => ring);
  const normals = positions.map(() => vec3(0, 1, 0));
  const uvs = sampledRings.flatMap((_, row) => Array.from(
    { length: sampledRingSize },
    (__, column) => vec2(column / sampledRingSize, row / (sampledRings.length - 1)),
  ));
  const indices: number[] = [];

  for (let row = 0; row < sampledRings.length - 1; row++) {
    const longitudinalSpan = Math.min(spanCount - 1, Math.floor(row / longitudinalSubdivisions));
    for (let column = 0; column < sampledRingSize; column++) {
      const crossSectionSpan = Math.floor(column / crossSectionSubdivisions);
      if (!includePatch(longitudinalSpan, crossSectionSpan)) continue;
      const nextColumn = (column + 1) % sampledRingSize;
      const a = row * sampledRingSize + column;
      const b = row * sampledRingSize + nextColumn;
      const c = (row + 1) * sampledRingSize + column;
      const d = (row + 1) * sampledRingSize + nextColumn;
      indices.push(a, c, b, b, c, d);
    }
  }

  if (options.caps ?? true) {
    const frontCenter = positions.length;
    positions.push(average(sampledRings[0]!));
    normals.push(vec3(0, 0, -1));
    uvs.push(vec2(0.5, 0.5));
    for (let column = 0; column < sampledRingSize; column++) {
      indices.push(frontCenter, column, (column + 1) % sampledRingSize);
    }

    const rearBase = (sampledRings.length - 1) * sampledRingSize;
    const rearCenter = positions.length;
    positions.push(average(sampledRings[sampledRings.length - 1]!));
    normals.push(vec3(0, 0, 1));
    uvs.push(vec2(0.5, 0.5));
    for (let column = 0; column < sampledRingSize; column++) {
      indices.push(rearCenter, rearBase + ((column + 1) % sampledRingSize), rearBase + column);
    }
  }

  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function average(points: ReadonlyArray<Vec3>): Vec3 {
  const total = points.reduce(
    (sum, point) => vec3(sum.x + point.x, sum.y + point.y, sum.z + point.z),
    vec3(0, 0, 0),
  );
  const inverse = 1 / Math.max(1, points.length);
  return scale(total, inverse);
}
