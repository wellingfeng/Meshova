import { vec3, normalize, sub, type Vec3 } from "../math/vec3.js";
import { makeNoise } from "../random/noise.js";
import { makeRng } from "../random/prng.js";
import { polyline, smoothCurve, type Curve } from "./curve.js";

export interface RiverVectorField2D {
  readonly width: number;
  readonly height: number;
  readonly x: Float32Array;
  readonly z: Float32Array;
}

export interface RiverSystem2D {
  readonly size: number;
  readonly resolution: number;
  readonly centerline: Curve;
  readonly terrain: Float32Array;
  readonly width: Float32Array;
  readonly depth: Float32Array;
  readonly accumulation: Float32Array;
  readonly erosion: Float32Array;
  readonly deposition: Float32Array;
  readonly direction: RiverVectorField2D;
}

export interface RiverSystemOptions {
  size?: number;
  resolution?: number;
  points?: number;
  riverWidth?: number;
  riverDepth?: number;
  meander?: number;
  terrainHeight?: number;
  seed?: number;
}

export interface BackwaterProfileOptions {
  /** Fixed water elevation imposed by the downstream lake or reservoir. */
  outletLevel: number;
  /** Minimum upstream rise per world unit. */
  minSlope?: number;
  /** 0 disables outlet influence; 1 applies the full downstream boundary. */
  strength?: number;
  /** Optional cumulative distances matching `naturalLevels`. */
  distances?: ReadonlyArray<number>;
}

/**
 * Propagate a lake/reservoir boundary upstream while preserving downstream flow.
 * Samples must be ordered upstream -> downstream.
 */
export function solveBackwaterProfile(
  naturalLevels: ReadonlyArray<number>,
  options: BackwaterProfileOptions,
): Float32Array {
  if (naturalLevels.length === 0) return new Float32Array();
  if (options.distances && options.distances.length !== naturalLevels.length) {
    throw new Error("backwater distances must match natural level count");
  }

  const minSlope = Math.max(0, options.minSlope ?? 0);
  const strength = clamp(options.strength ?? 1, 0, 1);
  const result = new Float32Array(naturalLevels.length);
  const last = naturalLevels.length - 1;
  const naturalOutlet = naturalLevels[last]!;
  result[last] = naturalOutlet
    + Math.max(0, options.outletLevel - naturalOutlet) * strength;

  for (let index = last - 1; index >= 0; index--) {
    const segmentLength = options.distances
      ? Math.max(0, options.distances[index + 1]! - options.distances[index]!)
      : 1;
    const minimumUpstreamLevel = result[index + 1]! + minSlope * segmentLength;
    result[index] = Math.max(naturalLevels[index]!, minimumUpstreamLevel);
  }
  return result;
}

export function buildRiverSystem2D(options: RiverSystemOptions = {}): RiverSystem2D {
  const size = Math.max(1, options.size ?? 24);
  const resolution = clampInt(options.resolution ?? 64, 8, 256);
  const pointCount = clampInt(options.points ?? 13, 4, 64);
  const riverWidth = Math.max(0.05, options.riverWidth ?? 1.25);
  const riverDepth = Math.max(0, options.riverDepth ?? 0.7);
  const meander = Math.max(0, options.meander ?? 3.2);
  const terrainHeight = Math.max(0, options.terrainHeight ?? 3.4);
  const seed = Math.round(options.seed ?? 0);
  const rng = makeRng(seed);
  const points: Vec3[] = [];
  for (let i = 0; i < pointCount; i++) {
    const t = i / (pointCount - 1);
    const z = -size * 0.48 + t * size * 0.96;
    const envelope = Math.sin(Math.PI * t);
    const x = (Math.sin(t * Math.PI * 3.1 + seed * 0.17) * 0.68
      + Math.sin(t * Math.PI * 6.7 + seed * 0.07) * 0.22
      + (rng.next() - 0.5) * 0.18) * meander * envelope;
    points.push(vec3(x, 0, z));
  }
  const centerline = smoothCurve(polyline(points), 5);
  const sampleCount = resolution * resolution;
  const terrain = new Float32Array(sampleCount);
  const width = new Float32Array(sampleCount);
  const depth = new Float32Array(sampleCount);
  const accumulation = new Float32Array(sampleCount);
  const erosion = new Float32Array(sampleCount);
  const deposition = new Float32Array(sampleCount);
  const directionX = new Float32Array(sampleCount);
  const directionZ = new Float32Array(sampleCount);
  const noise = makeNoise(seed + 101);

  for (let row = 0; row < resolution; row++) {
    const z = -size * 0.5 + (row / (resolution - 1)) * size;
    for (let column = 0; column < resolution; column++) {
      const x = -size * 0.5 + (column / (resolution - 1)) * size;
      const index = row * resolution + column;
      const nearest = nearestCurveSegment(centerline, x, z);
      const downstream = clamp(nearest.t, 0, 1);
      const localWidth = riverWidth * (0.72 + downstream * 0.5);
      const normalizedDistance = nearest.distance / localWidth;
      const riverMask = normalizedDistance < 1 ? (1 - normalizedDistance) ** 2 : 0;
      const ridge = Math.abs(x / size) * terrainHeight * 0.85;
      const rolling = noise.noise2(x * 0.09, z * 0.09) * terrainHeight * 0.24
        + noise.noise2(x * 0.23 + 17, z * 0.23 - 9) * terrainHeight * 0.08;
      const base = 0.65 + ridge + rolling;
      const carve = riverMask * riverDepth * (0.65 + downstream * 0.55);
      const curvature = curveCurvature(centerline, nearest.segment);
      const side = Math.sign(nearest.cross);
      terrain[index] = base - carve;
      width[index] = localWidth;
      depth[index] = carve;
      accumulation[index] = riverMask * (0.18 + downstream * 0.82);
      erosion[index] = riverMask * clamp(0.5 + curvature * side * 3.5, 0, 1);
      deposition[index] = riverMask * clamp(0.5 - curvature * side * 3.5, 0, 1);
      directionX[index] = nearest.tangent.x;
      directionZ[index] = nearest.tangent.z;
    }
  }

  return {
    size,
    resolution,
    centerline,
    terrain,
    width,
    depth,
    accumulation,
    erosion,
    deposition,
    direction: { width: resolution, height: resolution, x: directionX, z: directionZ },
  };
}

export function sampleRiverField(
  system: RiverSystem2D,
  field: Float32Array,
  x: number,
  z: number,
): number {
  if (field.length !== system.resolution * system.resolution) {
    throw new Error("river field size must match system resolution");
  }
  const gx = clamp(((x / system.size) + 0.5) * (system.resolution - 1), 0, system.resolution - 1);
  const gz = clamp(((z / system.size) + 0.5) * (system.resolution - 1), 0, system.resolution - 1);
  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const x1 = Math.min(system.resolution - 1, x0 + 1);
  const z1 = Math.min(system.resolution - 1, z0 + 1);
  const tx = gx - x0;
  const tz = gz - z0;
  const a = field[z0 * system.resolution + x0]! * (1 - tx) + field[z0 * system.resolution + x1]! * tx;
  const b = field[z1 * system.resolution + x0]! * (1 - tx) + field[z1 * system.resolution + x1]! * tx;
  return a * (1 - tz) + b * tz;
}

interface NearestSegment {
  distance: number;
  segment: number;
  t: number;
  cross: number;
  tangent: Vec3;
}

function nearestCurveSegment(curve: Curve, x: number, z: number): NearestSegment {
  let best: NearestSegment = {
    distance: Infinity,
    segment: 0,
    t: 0,
    cross: 0,
    tangent: vec3(0, 0, 1),
  };
  const segmentCount = Math.max(1, curve.points.length - 1);
  for (let segment = 0; segment < curve.points.length - 1; segment++) {
    const a = curve.points[segment]!;
    const b = curve.points[segment + 1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSq = dx * dx + dz * dz || 1;
    const local = clamp(((x - a.x) * dx + (z - a.z) * dz) / lengthSq, 0, 1);
    const px = a.x + dx * local;
    const pz = a.z + dz * local;
    const offsetX = x - px;
    const offsetZ = z - pz;
    const distance = Math.hypot(offsetX, offsetZ);
    if (distance >= best.distance) continue;
    best = {
      distance,
      segment,
      t: (segment + local) / segmentCount,
      cross: dx * offsetZ - dz * offsetX,
      tangent: normalize(sub(b, a)),
    };
  }
  return best;
}

function curveCurvature(curve: Curve, segment: number): number {
  const a = curve.points[Math.max(0, segment - 1)]!;
  const b = curve.points[segment]!;
  const c = curve.points[Math.min(curve.points.length - 1, segment + 2)]!;
  const ab = normalize(sub(b, a));
  const bc = normalize(sub(c, b));
  return ab.x * bc.z - ab.z * bc.x;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
