/**
 * CityGen-style procedural city generator.
 *
 * Reference studied: jhorikawa/citygen (MIT, CoffeeScript). Meshova keeps the
 * same high-level idea, not the implementation: heat-map biased road growth,
 * local intersection/snap constraints, then buildings placed beside accepted
 * roads with a collision pass.
 */
import { vec2 } from "../math/vec2.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng, type Rng } from "../random/prng.js";
import {
  box,
  makeMesh,
  merge,
  polyline,
  roadCenterLine,
  roadCurbs,
  roadEdgeLines,
  roadLaneLines,
  roadJunctionPadMesh,
  roadJunctionRadius,
  roadRibbon,
  transform,
  type Mesh,
  type NamedPart,
  type PartInstanceTransform,
  type RoadJunctionBranch,
} from "../geometry/index.js";
import { buildStreetLampParts, buildStreetTreeParts } from "./city-props.js";
import { buildUrbanBuildingParts, type UrbanStyle } from "./urban-building.js";

type RGB = [number, number, number];
type SurfaceRef = NonNullable<NamedPart["surface"]>;

export type CitygenPreset = "roadGrowth" | "residential" | "downtown";

export interface CitygenParams {
  preset: CitygenPreset;
  /** Deterministic master seed. */
  seed: number;
  /** Max accepted road segments. */
  segmentLimit: number;
  /** Soft city radius on XZ. Roads outside this are rejected. */
  radius: number;
  /** Local street segment length. */
  streetLength: number;
  /** Highway/arterial segment length. */
  highwayLength: number;
  /** Full street width. */
  streetWidth: number;
  /** Full highway width. */
  highwayWidth: number;
  /** Chance for local roads to branch left/right. */
  branchProbability: number;
  /** Snap/intersection search distance. */
  snapDistance: number;
  /** Minimum population heat for local roads to continue. */
  populationThreshold: number;
  /** Target number of buildings. 0 = road-only model. */
  buildings: number;
  /** Building floors multiplier. */
  heightScale: number;
  /** Add trees and lamps along local streets. */
  streetProps: boolean;
}

export const CITYGEN_DEFAULTS: Record<CitygenPreset, CitygenParams> = {
  roadGrowth: {
    preset: "roadGrowth",
    seed: 17,
    segmentLimit: 150,
    radius: 105,
    streetLength: 13,
    highwayLength: 19,
    streetWidth: 5.2,
    highwayWidth: 12,
    branchProbability: 0.42,
    snapDistance: 5.6,
    populationThreshold: 0.16,
    buildings: 0,
    heightScale: 0.8,
    streetProps: false,
  },
  residential: {
    preset: "residential",
    seed: 29,
    segmentLimit: 130,
    radius: 92,
    streetLength: 11.5,
    highwayLength: 17,
    streetWidth: 4.6,
    highwayWidth: 9,
    branchProbability: 0.48,
    snapDistance: 4.8,
    populationThreshold: 0.18,
    buildings: 48,
    heightScale: 0.72,
    streetProps: true,
  },
  downtown: {
    preset: "downtown",
    seed: 41,
    segmentLimit: 100,
    radius: 95,
    streetLength: 12,
    highwayLength: 18,
    streetWidth: 5.8,
    highwayWidth: 12.5,
    branchProbability: 0.4,
    snapDistance: 5.2,
    populationThreshold: 0.14,
    buildings: 28,
    heightScale: 0.65,
    streetProps: true,
  },
};

export interface CitygenRoadSegment {
  id: number;
  start: Vec3;
  end: Vec3;
  angle: number;
  highway: boolean;
  width: number;
  depth: number;
  severed: boolean;
}

interface CandidateSegment {
  start: Vec3;
  end: Vec3;
  angle: number;
  highway: boolean;
  width: number;
  depth: number;
  time: number;
  severed: boolean;
}

interface PlacedCircle {
  x: number;
  z: number;
  radius: number;
}

interface RoadJunction {
  point: Vec3;
  radius: number;
  degree: number;
  branches: RoadJunctionBranch[];
}

interface RoadTrim {
  start: number;
  end: number;
}

const ASPHALT: RGB = [0.085, 0.088, 0.095];
const HIGHWAY_ASPHALT: RGB = [0.075, 0.078, 0.086];
const MARKING: RGB = [0.92, 0.89, 0.68];
const EDGE_MARKING: RGB = [0.86, 0.86, 0.8];
const CURB: RGB = [0.62, 0.62, 0.59];
const GROUND: RGB = [0.28, 0.34, 0.28];
const SIDEWALK: RGB = [0.5, 0.5, 0.47];

function emptyMesh(): Mesh {
  return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
}

function mergeOrEmpty(meshes: Mesh[]): Mesh {
  return meshes.length ? merge(...meshes) : emptyMesh();
}

function surface(type: SurfaceRef["type"], color: RGB, roughness = 0.85): SurfaceRef {
  return { type, params: { color, roughness } };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function dist2XZ(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function lenXZ(a: Vec3, b: Vec3): number {
  return Math.sqrt(dist2XZ(a, b));
}

function makeSegment(
  start: Vec3,
  angle: number,
  length: number,
  highway: boolean,
  width: number,
  depth: number,
  time: number,
): CandidateSegment {
  return {
    start,
    end: vec3(start.x + Math.cos(angle) * length, 0, start.z + Math.sin(angle) * length),
    angle,
    highway,
    width,
    depth,
    time,
    severed: false,
  };
}

function signedAngleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function pointLineProjection(p: Vec3, a: Vec3, b: Vec3): { point: Vec3; t: number; distance: number } {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz || 1;
  const t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2;
  const tt = Math.max(0, Math.min(1, t));
  const point = vec3(a.x + dx * tt, 0, a.z + dz * tt);
  return { point, t: tt, distance: lenXZ(p, point) };
}

function segmentIntersection(a0: Vec3, a1: Vec3, b0: Vec3, b1: Vec3): { point: Vec3; ta: number; tb: number } | null {
  const ax = a1.x - a0.x;
  const az = a1.z - a0.z;
  const bx = b1.x - b0.x;
  const bz = b1.z - b0.z;
  const den = ax * bz - az * bx;
  if (Math.abs(den) < 1e-7) return null;
  const cx = b0.x - a0.x;
  const cz = b0.z - a0.z;
  const ta = (cx * bz - cz * bx) / den;
  const tb = (cx * az - cz * ax) / den;
  if (ta <= 0.04 || ta >= 0.98 || tb <= 0.04 || tb >= 0.96) return null;
  return { point: vec3(a0.x + ax * ta, 0, a0.z + az * ta), ta, tb };
}

function roadLength(s: CitygenRoadSegment): number {
  return lenXZ(s.start, s.end);
}

function pointOnRoad(s: CitygenRoadSegment, t: number): Vec3 {
  return vec3(
    s.start.x + (s.end.x - s.start.x) * t,
    0,
    s.start.z + (s.end.z - s.start.z) * t,
  );
}

function touchesRoadPoint(point: Vec3, road: CitygenRoadSegment): boolean {
  return roadArmsAtPoint(point, road) > 0;
}

function roadArmsAtPoint(point: Vec3, road: CitygenRoadSegment): number {
  if (lenXZ(point, road.start) < 0.28 || lenXZ(point, road.end) < 0.28) return 1;
  const proj = pointLineProjection(point, road.start, road.end);
  return proj.t > 0.03
    && proj.t < 0.97
    && proj.distance < Math.max(0.32, road.width * 0.06)
    ? 2
    : 0;
}

function addRoadJunctionBranch(
  branches: RoadJunctionBranch[],
  dx: number,
  dz: number,
  halfWidth: number,
): void {
  const length = Math.hypot(dx, dz);
  if (length < 1e-8) return;
  const angleRadians = Math.atan2(dz, dx);
  const dirX = dx / length;
  const dirZ = dz / length;
  for (const branch of branches) {
    if (Math.cos(branch.angleRadians) * dirX + Math.sin(branch.angleRadians) * dirZ > 0.985) {
      branch.halfWidth = Math.max(branch.halfWidth, halfWidth);
      return;
    }
  }
  branches.push({ angleRadians, halfWidth });
}

function roadJunctionBranches(point: Vec3, roads: CitygenRoadSegment[]): RoadJunctionBranch[] {
  const branches: RoadJunctionBranch[] = [];
  for (const road of roads) {
    const halfWidth = road.width * 0.5;
    if (lenXZ(point, road.start) < 0.28) {
      addRoadJunctionBranch(branches, road.end.x - road.start.x, road.end.z - road.start.z, halfWidth);
      continue;
    }
    if (lenXZ(point, road.end) < 0.28) {
      addRoadJunctionBranch(branches, road.start.x - road.end.x, road.start.z - road.end.z, halfWidth);
      continue;
    }
    const projection = pointLineProjection(point, road.start, road.end);
    if (projection.t <= 0.03 || projection.t >= 0.97 || projection.distance >= Math.max(0.32, road.width * 0.06)) continue;
    addRoadJunctionBranch(branches, road.start.x - point.x, road.start.z - point.z, halfWidth);
    addRoadJunctionBranch(branches, road.end.x - point.x, road.end.z - point.z, halfWidth);
  }
  return branches;
}

function addJunction(out: RoadJunction[], junction: RoadJunction): void {
  for (const existing of out) {
    if (lenXZ(existing.point, junction.point) <= Math.max(0.5, Math.min(existing.radius, junction.radius) * 0.5)) {
      existing.radius = Math.max(existing.radius, junction.radius);
      existing.degree = Math.max(existing.degree, junction.degree);
      return;
    }
  }
  out.push(junction);
}

function analyzeRoadJunctions(segments: CitygenRoadSegment[]): RoadJunction[] {
  const junctions: RoadJunction[] = [];
  for (const s of segments) {
    for (const point of [s.start, s.end] as const) {
      const touching = segments.filter((other) => touchesRoadPoint(point, other));
      const branches = roadJunctionBranches(point, touching);
      const degree = branches.length;
      if (degree < 3) continue;
      let requiredRadius: number;
      try {
        requiredRadius = roadJunctionRadius(branches);
      } catch {
        continue;
      }
      const radius = Math.max(
        requiredRadius,
        Math.max(...touching.map((other) => other.width * 0.5)) + 0.42,
      );
      addJunction(junctions, { point, radius, degree, branches });
    }
  }
  return junctions;
}

function junctionAt(point: Vec3, junctions: RoadJunction[]): RoadJunction | null {
  let best: RoadJunction | null = null;
  for (const j of junctions) {
    const d = lenXZ(point, j.point);
    if (d > Math.max(0.6, j.radius * 0.35)) continue;
    if (!best || d < lenXZ(point, best.point)) best = j;
  }
  return best;
}

function roadTrims(segments: CitygenRoadSegment[], junctions: RoadJunction[]): Map<number, RoadTrim> {
  const trims = new Map<number, RoadTrim>();
  for (const s of segments) {
    const len = roadLength(s);
    if (len <= 1e-6) {
      trims.set(s.id, { start: 0, end: 0 });
      continue;
    }
    let start = junctionAt(s.start, junctions)?.radius ?? 0;
    let end = junctionAt(s.end, junctions)?.radius ?? 0;
    const maxTotal = len * 0.72;
    if (start + end > maxTotal && start + end > 0) {
      const k = maxTotal / (start + end);
      start *= k;
      end *= k;
    }
    trims.set(s.id, { start, end });
  }
  return trims;
}

function trimmedRoadCurve(segment: CitygenRoadSegment, trim: RoadTrim | undefined) {
  const len = roadLength(segment);
  if (len <= 1e-6) return null;
  const startTrim = trim?.start ?? 0;
  const endTrim = trim?.end ?? 0;
  const remaining = len - startTrim - endTrim;
  if (remaining < Math.max(0.45, segment.width * 0.22)) return null;
  const a = pointOnRoad(segment, startTrim / len);
  const b = pointOnRoad(segment, 1 - endTrim / len);
  return polyline([a, b]);
}

function populationAt(x: number, z: number, p: CitygenParams): number {
  const r = Math.max(1, p.radius);
  const d = Math.hypot(x, z) / r;
  const central = Math.exp(-d * d * 2.2);
  const c1 = Math.exp(-((x + r * 0.28) ** 2 + (z - r * 0.18) ** 2) / (r * r * 0.22));
  const c2 = Math.exp(-((x - r * 0.24) ** 2 + (z + r * 0.24) ** 2) / (r * r * 0.28));
  const wave = 0.5 + 0.5 * Math.sin(x * 0.045 + p.seed * 0.17) * Math.cos(z * 0.037 - p.seed * 0.13);
  return clamp01(central * 0.54 + c1 * 0.26 + c2 * 0.2 + wave * 0.14);
}

function randomAngle(rng: Rng, maxDegrees: number): number {
  const max = (maxDegrees * Math.PI) / 180;
  return (rng.next() - rng.next()) * max;
}

function constrainSegment(candidate: CandidateSegment, accepted: CitygenRoadSegment[], p: CitygenParams): boolean {
  if (Math.hypot(candidate.end.x, candidate.end.z) > p.radius * 1.18) return false;

  let bestIntersection: { point: Vec3; distance: number; angle: number } | null = null;
  for (const other of accepted) {
    if (dist2XZ(candidate.start, other.start) < 1e-5 || dist2XZ(candidate.start, other.end) < 1e-5) continue;
    const hit = segmentIntersection(candidate.start, candidate.end, other.start, other.end);
    if (!hit) continue;
    const angleDiff = Math.abs(signedAngleDiff(candidate.angle, other.angle));
    const deviation = Math.min(angleDiff, Math.PI - angleDiff);
    if (deviation < (30 * Math.PI) / 180) return false;
    const d = lenXZ(candidate.start, hit.point);
    if (!bestIntersection || d < bestIntersection.distance) {
      bestIntersection = { point: hit.point, distance: d, angle: other.angle };
    }
  }
  if (bestIntersection) {
    candidate.end = bestIntersection.point;
    candidate.severed = true;
  }

  if (!candidate.severed) {
    for (const other of accepted) {
      for (const end of [other.start, other.end] as const) {
        if (lenXZ(candidate.end, end) <= p.snapDistance) {
          candidate.end = end;
          candidate.severed = true;
          break;
        }
      }
      if (candidate.severed) break;
    }
  }

  if (!candidate.severed) {
    let best: { point: Vec3; distance: number; angle: number } | null = null;
    for (const other of accepted) {
      const proj = pointLineProjection(candidate.end, other.start, other.end);
      if (proj.t <= 0.08 || proj.t >= 0.92 || proj.distance > p.snapDistance) continue;
      const angleDiff = Math.abs(signedAngleDiff(candidate.angle, other.angle));
      const deviation = Math.min(angleDiff, Math.PI - angleDiff);
      if (deviation < (30 * Math.PI) / 180) continue;
      if (!best || proj.distance < best.distance) best = { point: proj.point, distance: proj.distance, angle: other.angle };
    }
    if (best) {
      candidate.end = best.point;
      candidate.severed = true;
    }
  }

  if (lenXZ(candidate.start, candidate.end) < Math.max(2, p.streetLength * 0.25)) return false;
  for (const other of accepted) {
    const same =
      (lenXZ(candidate.start, other.start) < 0.1 && lenXZ(candidate.end, other.end) < 0.1) ||
      (lenXZ(candidate.start, other.end) < 0.1 && lenXZ(candidate.end, other.start) < 0.1);
    if (same) return false;
  }
  return true;
}

function nextBranches(segment: CitygenRoadSegment, p: CitygenParams, rng: Rng): CandidateSegment[] {
  if (segment.severed) return [];
  const out: CandidateSegment[] = [];
  const heat = populationAt(segment.end.x, segment.end.z, p);
  const streetWidth = p.streetWidth;
  const highwayWidth = p.highwayWidth;

  if (segment.highway) {
    const straight = makeSegment(segment.end, segment.angle, p.highwayLength, true, highwayWidth, segment.depth + 1, segment.depth + 1);
    const bent = makeSegment(segment.end, segment.angle + randomAngle(rng, 14), p.highwayLength, true, highwayWidth, segment.depth + 1, segment.depth + 1);
    const straightHeat = populationAt(straight.end.x, straight.end.z, p);
    const bentHeat = populationAt(bent.end.x, bent.end.z, p);
    out.push(bentHeat > straightHeat ? bent : straight);

    if (heat > p.populationThreshold && rng.next() < 0.24) {
      const dir = rng.next() < 0.5 ? -1 : 1;
      out.push(makeSegment(segment.end, segment.angle + dir * Math.PI / 2 + randomAngle(rng, 5), p.highwayLength * 0.9, true, highwayWidth, segment.depth + 1, segment.depth + 2));
    }
    if (heat > p.populationThreshold && rng.next() < 0.7) {
      const dir = rng.next() < 0.5 ? -1 : 1;
      out.push(makeSegment(segment.end, segment.angle + dir * Math.PI / 2 + randomAngle(rng, 7), p.streetLength, false, streetWidth, segment.depth + 1, segment.depth + 4));
    }
  } else if (heat > p.populationThreshold) {
    out.push(makeSegment(segment.end, segment.angle + randomAngle(rng, 18), p.streetLength, false, streetWidth, segment.depth + 1, segment.depth + 1));
    for (const dir of [-1, 1]) {
      if (rng.next() < p.branchProbability) {
        out.push(makeSegment(segment.end, segment.angle + dir * Math.PI / 2 + randomAngle(rng, 5), p.streetLength, false, streetWidth, segment.depth + 1, segment.depth + 2));
      }
    }
  }
  return out;
}

export function generateCitygenRoads(params: Partial<CitygenParams> = {}): CitygenRoadSegment[] {
  const preset = params.preset ?? "downtown";
  const p: CitygenParams = { ...CITYGEN_DEFAULTS[preset], ...params, preset };
  const rng = makeRng(Math.round(p.seed) >>> 0);
  const queue: CandidateSegment[] = [
    makeSegment(vec3(0, 0, 0), 0, p.highwayLength, true, p.highwayWidth, 0, 0),
    makeSegment(vec3(0, 0, 0), Math.PI, p.highwayLength, true, p.highwayWidth, 0, 0),
  ];
  const accepted: CitygenRoadSegment[] = [];

  while (queue.length && accepted.length < Math.max(2, Math.round(p.segmentLimit))) {
    let best = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i]!.time < queue[best]!.time) best = i;
    const cand = queue.splice(best, 1)[0]!;
    if (!constrainSegment(cand, accepted, p)) continue;
    const segment: CitygenRoadSegment = {
      id: accepted.length,
      start: cand.start,
      end: cand.end,
      angle: Math.atan2(cand.end.z - cand.start.z, cand.end.x - cand.start.x),
      highway: cand.highway,
      width: cand.width,
      depth: cand.depth,
      severed: cand.severed,
    };
    accepted.push(segment);
    for (const b of nextBranches(segment, p, rng)) queue.push(b);
  }
  return accepted;
}

function roadCurve(segment: CitygenRoadSegment) {
  return polyline([segment.start, segment.end]);
}

function roadMeshes(segments: CitygenRoadSegment[]) {
  const highwayRoads: Mesh[] = [];
  const streetRoads: Mesh[] = [];
  const junctionPatches: Mesh[] = [];
  const curbs: Mesh[] = [];
  const markings: Mesh[] = [];
  const edgeMarks: Mesh[] = [];
  const junctions = analyzeRoadJunctions(segments);
  const trims = roadTrims(segments, junctions);

  for (const j of junctions) {
    junctionPatches.push(transform(
      roadJunctionPadMesh(j.branches, { radius: j.radius, top: 0.04 }),
      { translate: vec3(j.point.x, 0, j.point.z) },
    ));
  }

  for (const s of segments) {
    const curve = trimmedRoadCurve(s, trims.get(s.id));
    if (!curve) continue;
    const half = s.width / 2;
    const opts = {
      halfWidth: half,
      sampleDistance: 1.2,
      widthSubdivisions: s.highway ? 4 : 3,
      verticalOffset: s.highway ? 0.023 : 0.031,
    };
    (s.highway ? highwayRoads : streetRoads).push(roadRibbon(curve, opts));
    curbs.push(roadCurbs(curve, { ...opts, curbHeight: 0.14, curbWidth: 0.22 }));
    const markingOffset = opts.verticalOffset + 0.012;
    edgeMarks.push(roadEdgeLines(curve, { ...opts, verticalOffset: opts.verticalOffset + 0.03, lineWidth: 0.1, edgeInset: 0.32 }));
    if (s.highway) {
      markings.push(roadLaneLines(curve, { ...opts, verticalOffset: markingOffset, lanes: 4, lineWidth: 0.1, dashLength: 2.2, gapLength: 2.4, skipCenter: true }));
      markings.push(roadCenterLine(curve, { ...opts, verticalOffset: markingOffset, lineWidth: 0.16 }));
    } else {
      markings.push(roadCenterLine(curve, { ...opts, verticalOffset: markingOffset, lineWidth: 0.12 }));
    }
  }
  return { highwayRoads, streetRoads, junctionPatches, curbs, markings, edgeMarks };
}

function axisAngleYForX(x: number, z: number): number {
  return Math.atan2(-z, x);
}

function styleFor(preset: CitygenPreset, heat: number, rng: Rng): UrbanStyle {
  if (preset === "residential") {
    if (heat > 0.72 && rng.next() < 0.35) return "modernOffice";
    return rng.next() < 0.58 ? "brickWalkup" : "brownstone";
  }
  if (heat > 0.75) return rng.next() < 0.4 ? "glassTower" : "corporate";
  if (heat > 0.55) return rng.next() < 0.5 ? "artDeco" : "modernOffice";
  return rng.next() < 0.55 ? "brickWalkup" : "brownstone";
}

function floorsFor(style: UrbanStyle, heat: number, p: CitygenParams, rng: Rng): number {
  let floors = 4;
  if (style === "glassTower" || style === "corporate") floors = rng.int(16, 28);
  else if (style === "artDeco") floors = rng.int(12, 22);
  else if (style === "modernOffice") floors = rng.int(7, 14);
  else floors = rng.int(3, 6);
  floors *= 0.72 + heat * 0.55;
  return Math.max(2, Math.round(floors * p.heightScale));
}

interface PartBucket {
  name: string;
  label?: string;
  meshes: Mesh[];
  color?: RGB;
  surface?: SurfaceRef;
  renderMesh?: Mesh;
  renderTransforms: PartInstanceTransform[];
  renderCompatible: boolean;
}

function partSignature(part: NamedPart): string {
  const color = part.color ? part.color.map((v) => v.toFixed(4)).join(",") : "";
  return `${part.name}|${color}|${JSON.stringify(part.surface ?? null)}`;
}

function sameMesh(a: Mesh, b: Mesh): boolean {
  if (
    a.positions.length !== b.positions.length ||
    a.normals.length !== b.normals.length ||
    a.uvs.length !== b.uvs.length ||
    a.indices.length !== b.indices.length
  ) return false;
  for (let i = 0; i < a.positions.length; i++) {
    const ap = a.positions[i]!;
    const bp = b.positions[i]!;
    const an = a.normals[i]!;
    const bn = b.normals[i]!;
    const auv = a.uvs[i]!;
    const buv = b.uvs[i]!;
    if (ap.x !== bp.x || ap.y !== bp.y || ap.z !== bp.z) return false;
    if (an.x !== bn.x || an.y !== bn.y || an.z !== bn.z) return false;
    if (auv.x !== buv.x || auv.y !== buv.y) return false;
  }
  for (let i = 0; i < a.indices.length; i++) {
    if (a.indices[i] !== b.indices[i]) return false;
  }
  return true;
}

function composeInstance(instance: PartInstanceTransform, angle: number, translate: Vec3): PartInstanceTransform {
  const [x, y, z] = instance.position;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rotation = instance.rotation ?? [0, 0, 0];
  const out: PartInstanceTransform = {
    position: [translate.x + c * x + s * z, translate.y + y, translate.z - s * x + c * z],
    rotation: [rotation[0], rotation[1] + angle, rotation[2]],
  };
  if (instance.scale) out.scale = [...instance.scale];
  return out;
}

function pushTransformedParts(buckets: Map<string, PartBucket>, parts: NamedPart[], prefix: string, angle: number, translate: Vec3): void {
  for (const part of parts) {
    const signature = `${prefix}|${partSignature(part)}`;
    let bucket = buckets.get(signature);
    if (!bucket) {
      bucket = {
        name: `${prefix}_${part.name}_${buckets.size}`,
        meshes: [],
        renderTransforms: [],
        renderCompatible: true,
      };
      if (part.label) bucket.label = part.label;
      if (part.color) bucket.color = part.color;
      if (part.surface) bucket.surface = part.surface;
      buckets.set(signature, bucket);
    }
    bucket.meshes.push(transform(part.mesh, { rotate: vec3(0, angle, 0), translate }));
    if (!bucket.renderCompatible) continue;
    const renderMesh = part.renderInstances?.mesh ?? part.mesh;
    if (bucket.renderMesh && !sameMesh(bucket.renderMesh, renderMesh)) {
      bucket.renderCompatible = false;
      bucket.renderTransforms = [];
      continue;
    }
    bucket.renderMesh ??= renderMesh;
    const instances = part.renderInstances?.transforms ?? [{ position: [0, 0, 0] as [number, number, number] }];
    bucket.renderTransforms.push(...instances.map((instance) => composeInstance(instance, angle, translate)));
  }
}

function flushPartBuckets(buckets: Map<string, PartBucket>): NamedPart[] {
  const out: NamedPart[] = [];
  for (const bucket of buckets.values()) {
    const part: NamedPart = {
      name: bucket.name,
      mesh: mergeOrEmpty(bucket.meshes),
    };
    if (bucket.label) part.label = bucket.label;
    if (bucket.color) part.color = bucket.color;
    if (bucket.surface) part.surface = bucket.surface;
    if (bucket.renderCompatible && bucket.renderMesh && bucket.renderTransforms.length > 1) {
      part.renderInstances = {
        mesh: bucket.renderMesh,
        transforms: bucket.renderTransforms,
      };
      part.metadata = { gpuInstances: bucket.renderTransforms.length };
    }
    out.push(part);
  }
  return out;
}

function canPlace(placed: PlacedCircle[], x: number, z: number, radius: number): boolean {
  for (const p of placed) {
    const dx = p.x - x;
    const dz = p.z - z;
    const minD = p.radius + radius;
    if (dx * dx + dz * dz < minD * minD) return false;
  }
  return true;
}

function podiumOverhangForStyle(style: UrbanStyle): number {
  switch (style) {
    case "corporate":
      return 1.1;
    case "artDeco":
      return 0.5;
    case "glassTower":
      return 0.35;
    case "modernOffice":
      return 0.25;
    default:
      return 0;
  }
}

function buildingFootprintRadius(style: UrbanStyle, width: number, depth: number): number {
  return Math.hypot(width * 0.5, depth * 0.5) + podiumOverhangForStyle(style) + 0.8;
}

function clearOfRoads(segments: CitygenRoadSegment[], x: number, z: number, radius: number, margin: number): boolean {
  const p = vec3(x, 0, z);
  for (const road of segments) {
    const proj = pointLineProjection(p, road.start, road.end);
    const shoulder = road.highway ? 0.7 : 1.8;
    if (proj.distance < road.width * 0.5 + shoulder + radius + margin) return false;
  }
  return true;
}

function buildingParts(segments: CitygenRoadSegment[], p: CitygenParams, rng: Rng): NamedPart[] {
  if (p.buildings <= 0) return [];
  const buckets = new Map<string, PartBucket>();
  const placed: PlacedCircle[] = [];
  const ordered = segments
    .filter((s) => !s.highway || p.preset === "downtown")
    .sort((a, b) => populationAt(b.end.x, b.end.z, p) - populationAt(a.end.x, a.end.z, p));

  for (const s of ordered) {
    if (placed.length >= p.buildings) break;
    const len = lenXZ(s.start, s.end);
    if (len < 4) continue;
    const ux = (s.end.x - s.start.x) / len;
    const uz = (s.end.z - s.start.z) / len;
    const vx = -uz;
    const vz = ux;
    const sideOrder = rng.next() < 0.5 ? [-1, 1] : [1, -1];
    for (const side of sideOrder) {
      if (placed.length >= p.buildings) break;
      const t = rng.range(0.25, 0.75);
      const cx0 = s.start.x + (s.end.x - s.start.x) * t;
      const cz0 = s.start.z + (s.end.z - s.start.z) * t;
      const heat = populationAt(cx0, cz0, p);
      if (!s.highway && rng.next() > 0.72 + heat * 0.35) continue;
      const style = styleFor(p.preset, heat, rng);
      const floors = floorsFor(style, heat, p, rng);
      const width = style === "brownstone" || style === "brickWalkup" ? rng.range(3.1, 4.8) : rng.range(4.4, 7.0);
      const depth = style === "brownstone" || style === "brickWalkup" ? rng.range(3.2, 5.0) : rng.range(4.2, 6.8);
      const radius = buildingFootprintRadius(style, width, depth);
      const shoulder = s.highway ? 0.7 : 1.8;
      const offset = s.width / 2 + shoulder + radius + rng.range(1.0, 1.6);
      const x = cx0 + vx * offset * side;
      const z = cz0 + vz * offset * side;
      if (Math.hypot(x, z) > p.radius * 1.08) continue;
      if (!clearOfRoads(segments, x, z, radius, 0.75)) continue;
      if (!canPlace(placed, x, z, radius + 0.35)) continue;
      placed.push({ x, z, radius });
      const yaw = axisAngleYForX(ux, uz);
      const b = buildUrbanBuildingParts({
        style,
        width,
        depth,
        floors,
        baysX: Math.max(2, Math.round(width)),
        baysZ: Math.max(2, Math.round(depth * 0.8)),
        seed: p.seed * 97 + s.id * 13 + placed.length,
      });
      pushTransformedParts(buckets, b, "citygen_building", yaw, vec3(x, 0, z));
    }
  }
  return flushPartBuckets(buckets);
}

function propParts(segments: CitygenRoadSegment[], p: CitygenParams, rng: Rng): NamedPart[] {
  if (!p.streetProps) return [];
  const buckets = new Map<string, PartBucket>();
  let count = 0;
  for (const s of segments) {
    if (s.highway || count > 34) continue;
    const len = lenXZ(s.start, s.end);
    if (len < p.streetLength * 0.7 || rng.next() > 0.38) continue;
    const ux = (s.end.x - s.start.x) / len;
    const uz = (s.end.z - s.start.z) / len;
    const vx = -uz;
    const vz = ux;
    const side = rng.next() < 0.5 ? -1 : 1;
    const t = rng.range(0.18, 0.82);
    const cx = s.start.x + (s.end.x - s.start.x) * t + vx * (s.width / 2 + 1.3) * side;
    const cz = s.start.z + (s.end.z - s.start.z) * t + vz * (s.width / 2 + 1.3) * side;
    const yaw = axisAngleYForX(ux, uz) + (side < 0 ? Math.PI : 0);
    const tree = buildStreetTreeParts({
      trunkHeight: 1.5 + rng.next() * 0.5,
      canopyRadius: 0.9 + rng.next() * 0.35,
      clusters: 4,
      pit: true,
      seed: p.seed * 31 + count,
    });
    pushTransformedParts(buckets, tree, "citygen_tree", 0, vec3(cx, 0, cz));
    if (count % 3 === 0) {
      const lamp = buildStreetLampParts({
        height: 4.8,
        style: p.preset === "downtown" ? "double" : "cobra",
        armReach: 1.2,
      });
      pushTransformedParts(buckets, lamp, "citygen_lamp", yaw, vec3(cx + ux * 1.1, 0, cz + uz * 1.1));
    }
    count++;
  }
  return flushPartBuckets(buckets);
}

export function buildCitygenParts(params: Partial<CitygenParams> = {}): NamedPart[] {
  const preset = params.preset ?? "downtown";
  const p: CitygenParams = { ...CITYGEN_DEFAULTS[preset], ...params, preset };
  const segments = generateCitygenRoads(p);
  const r = roadMeshes(segments);
  const extent = p.radius * 2.4;
  const parts: NamedPart[] = [
    {
      name: "citygen_ground",
      label: "地面",
      mesh: transform(box(extent, 0.08, extent), { translate: vec3(0, -0.06, 0) }),
      color: GROUND,
      surface: surface("concrete", GROUND, 0.96),
    },
    {
      name: "citygen_highways",
      label: "主干路",
      mesh: mergeOrEmpty(r.highwayRoads),
      color: HIGHWAY_ASPHALT,
      surface: surface("concrete", HIGHWAY_ASPHALT, 0.92),
    },
    {
      name: "citygen_streets",
      label: "支路",
      mesh: mergeOrEmpty(r.streetRoads),
      color: ASPHALT,
      surface: surface("concrete", ASPHALT, 0.94),
    },
    {
      name: "citygen_intersections",
      label: "路口面",
      mesh: mergeOrEmpty(r.junctionPatches),
      color: ASPHALT,
      surface: surface("concrete", ASPHALT, 0.93),
    },
    {
      name: "citygen_curbs",
      label: "路缘石",
      mesh: mergeOrEmpty(r.curbs),
      color: CURB,
      surface: surface("concrete", CURB, 0.78),
    },
    {
      name: "citygen_road_markings",
      label: "道路标线",
      mesh: mergeOrEmpty(r.markings),
      color: MARKING,
      surface: surface("ceramic", MARKING, 0.45),
    },
    {
      name: "citygen_edge_markings",
      label: "边线",
      mesh: mergeOrEmpty(r.edgeMarks),
      color: EDGE_MARKING,
      surface: surface("ceramic", EDGE_MARKING, 0.5),
    },
  ];

  const rng = makeRng((Math.round(p.seed) ^ 0xa53c9e11) >>> 0);
  if (p.preset !== "roadGrowth") {
    const sidewalkMeshes = segments
      .filter((s) => !s.highway)
      .map((s) => roadRibbon(roadCurve(s), {
        halfWidth: s.width / 2 + 1.4,
        sampleDistance: 1.4,
        widthSubdivisions: 2,
        verticalOffset: 0.005,
      }));
    parts.splice(2, 0, {
      name: "citygen_sidewalks",
      label: "人行道",
      mesh: mergeOrEmpty(sidewalkMeshes),
      color: SIDEWALK,
      surface: surface("concrete", SIDEWALK, 0.86),
    });
    parts.push(...buildingParts(segments, p, rng), ...propParts(segments, p, rng));
  }
  return parts.filter((part) => part.mesh.positions.length > 0);
}
