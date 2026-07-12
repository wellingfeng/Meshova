/**
 * Road intersection kit — continuous arbitrary-angle junctions with painted
 * lane/stop lines, zebra crosswalks, sidewalks and curbs. The legacy N/S/E/W
 * arm API remains available; `branches` adds skewed crossroads, Y-junctions
 * and multi-way intersections. Same params -> same mesh.
 */
import { vec3 } from "../math/vec3.js";
import {
  box,
  plane,
  cylinder,
  joinedRoadJunctionMesh,
  transform,
  merge,
  makeMesh,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { vec2 } from "../math/vec2.js";

type RGB = [number, number, number];
const ASPHALT: RGB = [0.09, 0.09, 0.1];
const PAINT: RGB = [0.9, 0.9, 0.88];
const PAINT_Y: RGB = [0.95, 0.82, 0.15];
const CURB: RGB = [0.66, 0.66, 0.68];
const SIDEWALK: RGB = [0.55, 0.55, 0.57];
const GRASS: RGB = [0.24, 0.34, 0.16];

const asphaltS = () => ({ type: "ceramic" as const, params: { color: ASPHALT, roughness: 0.92 } });
const paintS = (c: RGB) => ({ type: "ceramic" as const, params: { color: c, roughness: 0.55 } });
const concS = (c: RGB, roughness = 0.8) => ({ type: "concrete" as const, params: { color: c, roughness } });

/** Which arms of the crossroads are present (N=+Z, S=-Z, E=+X, W=-X). */
export interface IntersectionArms {
  north: boolean;
  south: boolean;
  east: boolean;
  west: boolean;
}

/** One road leaving the junction. 0° points +X; angles increase toward +Z. */
export interface IntersectionBranch {
  angleDegrees: number;
  /** Override this branch's road half-width. */
  halfWidth?: number;
  /** Override this branch's length beyond the junction. */
  length?: number;
}

export interface IntersectionParams {
  /** Half-width of the road (per direction) in metres. */
  roadHalfWidth: number;
  /** Length of each road arm beyond the junction pad. */
  armLength: number;
  /** Number of lanes per direction (adds lane divider lines). */
  lanes: number;
  /** Draw zebra crosswalks across each arm. */
  crosswalks: boolean;
  /** Draw raised corner sidewalks + curbs. */
  sidewalks: boolean;
  /** Which arms are present. */
  arms: IntersectionArms;
  /** Arbitrary-angle branches. When set, replaces `arms`. Minimum: 3. */
  branches?: readonly IntersectionBranch[];
  /** Sidewalk width (metres). */
  sidewalkWidth: number;
}

export const INTERSECTION_DEFAULTS: IntersectionParams = {
  roadHalfWidth: 5,
  armLength: 10,
  lanes: 2,
  crosswalks: true,
  sidewalks: true,
  arms: { north: true, south: true, east: true, west: true },
  sidewalkWidth: 2.4,
};

interface ResolvedBranch {
  angle: number;
  halfWidth: number;
  length: number;
  dx: number;
  dz: number;
  lx: number;
  lz: number;
}

interface BoundaryPoint {
  x: number;
  z: number;
}

/**
 * A flat painted stripe laid just above the asphalt. The asphalt pad is 0.1
 * tall centred at y=0.02 (top face at 0.07), so paint sits at y=0.09 to stay
 * visible from above and avoid z-fighting.
 */
function stripe(w: number, d: number, x: number, z: number, y: number, rotY = 0): Mesh {
  return transform(box(w, 0.012, d), { rotate: vec3(0, rotY, 0), translate: vec3(x, y, z) });
}

/** Zebra crosswalk: a row of `bars` white stripes spanning the road width. */
function zebra(spanW: number, x: number, z: number, alongX: boolean): Mesh {
  const bars: Mesh[] = [];
  const barW = 0.5, gap = 0.5;
  const step = barW + gap;
  const n = Math.max(3, Math.floor(spanW / step));
  const start = -(n - 1) * step / 2;
  for (let i = 0; i < n; i++) {
    const off = start + i * step;
    // Bars run across the direction of travel.
    if (alongX) bars.push(stripe(1.6, barW, x, z + off, 0.112));
    else bars.push(stripe(barW, 1.6, x + off, z, 0.112));
  }
  return merge(...bars);
}

function joinedAsphaltMesh(hw: number, armLength: number, arms: IntersectionArms): Mesh {
  const outer = hw + armLength;
  const cuts = [-outer, -hw, hw, outer];
  const occupied = [
    [false, arms.south, false],
    [arms.west, true, arms.east],
    [false, arms.north, false],
  ];
  const bottom = -0.03;
  const top = 0.07;
  const positions: ReturnType<typeof vec3>[] = [];
  const normals: ReturnType<typeof vec3>[] = [];
  const uvs: ReturnType<typeof vec2>[] = [];
  const indices: number[] = [];
  const topVertices = new Map<string, number>();
  const bottomVertices = new Map<string, number>();

  const horizontalVertex = (x: number, y: number, z: number, up: boolean): number => {
    const vertices = up ? topVertices : bottomVertices;
    const key = `${x},${z}`;
    const found = vertices.get(key);
    if (found !== undefined) return found;
    const index = positions.length;
    positions.push(vec3(x, y, z));
    normals.push(vec3(0, up ? 1 : -1, 0));
    uvs.push(vec2((x + outer) / (outer * 2), (z + outer) / (outer * 2)));
    vertices.set(key, index);
    return index;
  };

  const horizontalCell = (x0: number, x1: number, z0: number, z1: number): void => {
    const t00 = horizontalVertex(x0, top, z0, true);
    const t01 = horizontalVertex(x0, top, z1, true);
    const t10 = horizontalVertex(x1, top, z0, true);
    const t11 = horizontalVertex(x1, top, z1, true);
    indices.push(t00, t01, t10, t10, t01, t11);

    const b00 = horizontalVertex(x0, bottom, z0, false);
    const b01 = horizontalVertex(x0, bottom, z1, false);
    const b10 = horizontalVertex(x1, bottom, z0, false);
    const b11 = horizontalVertex(x1, bottom, z1, false);
    indices.push(b00, b10, b01, b10, b11, b01);
  };

  const verticalFace = (
    corners: Array<[number, number, number]>,
    normal: [number, number, number],
  ): void => {
    const base = positions.length;
    const edgeLength = Math.hypot(
      corners[1]![0] - corners[0]![0],
      corners[1]![2] - corners[0]![2],
    );
    for (const [x, y, z] of corners) {
      positions.push(vec3(x, y, z));
      normals.push(vec3(...normal));
    }
    uvs.push(vec2(0, 0), vec2(edgeLength, 0), vec2(edgeLength, top - bottom), vec2(0, top - bottom));
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  for (let zCell = 0; zCell < 3; zCell++) {
    for (let xCell = 0; xCell < 3; xCell++) {
      if (!occupied[zCell]![xCell]) continue;
      const x0 = cuts[xCell]!;
      const x1 = cuts[xCell + 1]!;
      const z0 = cuts[zCell]!;
      const z1 = cuts[zCell + 1]!;
      horizontalCell(x0, x1, z0, z1);
      if (xCell === 0 || !occupied[zCell]![xCell - 1]) {
        verticalFace([[x0, bottom, z0], [x0, bottom, z1], [x0, top, z1], [x0, top, z0]], [-1, 0, 0]);
      }
      if (xCell === 2 || !occupied[zCell]![xCell + 1]) {
        verticalFace([[x1, bottom, z1], [x1, bottom, z0], [x1, top, z0], [x1, top, z1]], [1, 0, 0]);
      }
      if (zCell === 0 || !occupied[zCell - 1]![xCell]) {
        verticalFace([[x1, bottom, z0], [x0, bottom, z0], [x0, top, z0], [x1, top, z0]], [0, 0, -1]);
      }
      if (zCell === 2 || !occupied[zCell + 1]![xCell]) {
        verticalFace([[x0, bottom, z1], [x1, bottom, z1], [x1, top, z1], [x0, top, z1]], [0, 0, 1]);
      }
    }
  }

  return makeMesh({ positions, normals, uvs, indices });
}

function resolveBranches(
  specs: readonly IntersectionBranch[],
  defaults: Pick<IntersectionParams, "roadHalfWidth" | "armLength">,
): ResolvedBranch[] {
  if (specs.length < 3) throw new Error("an arbitrary-angle intersection needs at least 3 branches");
  const branches = specs.map((spec) => {
    if (!Number.isFinite(spec.angleDegrees)) throw new Error("branch angleDegrees must be finite");
    const halfWidth = spec.halfWidth ?? defaults.roadHalfWidth;
    const length = spec.length ?? defaults.armLength;
    if (!(halfWidth > 0) || !(length > 0)) throw new Error("branch halfWidth and length must be positive");
    const angle = ((spec.angleDegrees % 360) + 360) % 360 * Math.PI / 180;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    return { angle, halfWidth, length, dx, dz, lx: -dz, lz: dx };
  }).sort((a, b) => a.angle - b.angle);

  for (let i = 0; i < branches.length; i++) {
    const current = branches[i]!;
    const next = branches[(i + 1) % branches.length]!;
    const gap = (next.angle - current.angle + Math.PI * 2) % (Math.PI * 2);
    if (gap < Math.PI / 180) throw new Error("branch angles must differ by at least 1 degree");
    if (gap > Math.PI + 1e-8) throw new Error("branch directions must surround the junction centre");
  }
  return branches;
}

function junctionRadius(branches: readonly ResolvedBranch[]): number {
  let radius = Math.max(...branches.map((branch) => branch.halfWidth)) * 1.2;
  for (let iteration = 0; iteration < 128; iteration++) {
    let clear = true;
    for (let i = 0; i < branches.length; i++) {
      const current = branches[i]!;
      const next = branches[(i + 1) % branches.length]!;
      const gap = (next.angle - current.angle + Math.PI * 2) % (Math.PI * 2);
      if (gap >= Math.PI - 1e-8) continue;
      const occupiedAngle = Math.atan(current.halfWidth / radius) + Math.atan(next.halfWidth / radius);
      if (occupiedAngle >= gap * 0.9) {
        radius *= 1.2;
        clear = false;
        break;
      }
    }
    if (clear) return radius;
  }
  throw new Error("branch layout needs an impractically large junction centre");
}

function branchPoint(branch: ResolvedBranch, distance: number, lateral: number): BoundaryPoint {
  return {
    x: branch.dx * distance + branch.lx * lateral,
    z: branch.dz * distance + branch.lz * lateral,
  };
}

function angledBoundary(branches: readonly ResolvedBranch[], radius: number): BoundaryPoint[] {
  const boundary: BoundaryPoint[] = [];
  for (const branch of branches) {
    const outer = radius + branch.length;
    boundary.push(
      branchPoint(branch, radius, -branch.halfWidth),
      branchPoint(branch, outer, -branch.halfWidth),
      branchPoint(branch, outer, branch.halfWidth),
      branchPoint(branch, radius, branch.halfWidth),
    );
  }
  return boundary;
}

/** Closed, continuous road solid. Only its outer contour receives side faces. */
function joinedAngledAsphaltMesh(branches: readonly ResolvedBranch[], radius: number): Mesh {
  return joinedRoadJunctionMesh(branches.map((branch) => ({
    angleRadians: branch.angle,
    halfWidth: branch.halfWidth,
    length: branch.length,
  })), { radius, top: 0.07, bottom: -0.03 });
}

function branchStripe(
  branch: ResolvedBranch,
  length: number,
  width: number,
  start: number,
  lateral: number,
  y: number,
): Mesh {
  const centre = branchPoint(branch, start + length / 2, lateral);
  return transform(box(length, 0.012, width), {
    rotate: vec3(0, -branch.angle, 0),
    translate: vec3(centre.x, y, centre.z),
  });
}

function segmentBox(a: BoundaryPoint, b: BoundaryPoint, width: number, height: number, y: number, outward = 0): Mesh {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  const ox = dz / length;
  const oz = -dx / length;
  return transform(box(length, height, width), {
    rotate: vec3(0, -Math.atan2(dz, dx), 0),
    translate: vec3((a.x + b.x) / 2 + ox * outward, y, (a.z + b.z) / 2 + oz * outward),
  });
}

function buildAngledIntersectionParts(p: IntersectionParams, specs: readonly IntersectionBranch[]): NamedPart[] {
  const branches = resolveBranches(specs, p);
  const radius = junctionRadius(branches);
  const boundary = angledBoundary(branches, radius);
  const maxOuter = Math.max(...branches.map((branch) => radius + branch.length + branch.halfWidth));
  const extent = (maxOuter + p.sidewalkWidth) * 2;
  const parts: NamedPart[] = [
    { name: "ground", label: "地面", mesh: transform(plane(extent, extent, 1, 1), { translate: vec3(0, -0.01, 0) }), color: GRASS, surface: concS(GRASS, 1) },
    { name: "asphalt", label: "沥青路面", mesh: joinedAngledAsphaltMesh(branches, radius), color: ASPHALT, surface: asphaltS() },
  ];

  const lines: Mesh[] = [];
  const yellow: Mesh[] = [];
  const walks: Mesh[] = [];
  const nLanes = Math.max(1, Math.round(p.lanes));
  for (const branch of branches) {
    const lineLength = Math.max(0.1, branch.length - 0.5);
    yellow.push(branchStripe(branch, lineLength, 0.16, radius + 0.25, 0, 0.084));
    for (let side = -1; side <= 1; side += 2) {
      for (let lane = 1; lane < nLanes; lane++) {
        const lateral = side * (lane / nLanes) * branch.halfWidth;
        lines.push(branchStripe(branch, lineLength, 0.1, radius + 0.25, lateral, 0.098));
      }
    }
    lines.push(branchStripe(branch, 0.3, branch.halfWidth * 2 - 0.4, radius + 0.25, 0, 0.098));

    if (p.crosswalks) {
      const barWidth = 0.5;
      const step = 1;
      const count = Math.max(3, Math.floor((branch.halfWidth * 2 - 0.6) / step));
      const first = -(count - 1) * step / 2;
      for (let bar = 0; bar < count; bar++) {
        walks.push(branchStripe(branch, 1.6, barWidth, radius + 0.8, first + bar * step, 0.112));
      }
    }
  }
  parts.push({ name: "center_lines", label: "中心黄线", mesh: merge(...yellow), color: PAINT_Y, surface: paintS(PAINT_Y) });
  parts.push({ name: "lane_lines", label: "车道线", mesh: merge(...lines), color: PAINT, surface: paintS(PAINT) });
  if (walks.length) parts.push({ name: "crosswalks", label: "斑马线", mesh: merge(...walks), color: PAINT, surface: paintS(PAINT) });

  if (p.sidewalks) {
    const sidewalkMeshes: Mesh[] = [];
    const curbMeshes: Mesh[] = [];
    for (const branch of branches) {
      for (const side of [-1, 1]) {
        const centre = branchPoint(branch, radius + branch.length / 2, side * (branch.halfWidth + p.sidewalkWidth / 2));
        sidewalkMeshes.push(transform(box(branch.length, 0.16, p.sidewalkWidth), {
          rotate: vec3(0, -branch.angle, 0),
          translate: vec3(centre.x, 0.08, centre.z),
        }));
        const curb = branchPoint(branch, radius + branch.length / 2, side * (branch.halfWidth + 0.1));
        curbMeshes.push(transform(box(branch.length, 0.22, 0.2), {
          rotate: vec3(0, -branch.angle, 0),
          translate: vec3(curb.x, 0.18, curb.z),
        }));
      }
    }
    for (let i = 0; i < branches.length; i++) {
      const leftMouth = boundary[i * 4 + 3]!;
      const nextRightMouth = boundary[((i + 1) % branches.length) * 4]!;
      sidewalkMeshes.push(segmentBox(leftMouth, nextRightMouth, p.sidewalkWidth, 0.16, 0.08, p.sidewalkWidth / 2));
      curbMeshes.push(segmentBox(leftMouth, nextRightMouth, 0.2, 0.22, 0.18, 0.1));
    }
    parts.push({ name: "sidewalks", label: "人行道", mesh: merge(...sidewalkMeshes), color: SIDEWALK, surface: concS(SIDEWALK, 0.7) });
    parts.push({ name: "curbs", label: "路缘石", mesh: merge(...curbMeshes), color: CURB, surface: concS(CURB, 0.7) });
  }
  return parts;
}

/** Build an axis-aligned or arbitrary-angle road intersection. */
export function buildIntersectionParts(params: Partial<IntersectionParams> = {}): NamedPart[] {
  const p: IntersectionParams = { ...INTERSECTION_DEFAULTS, ...params, arms: { ...INTERSECTION_DEFAULTS.arms, ...(params.arms ?? {}) } };
  if (params.branches) return buildAngledIntersectionParts(p, params.branches);
  const parts: NamedPart[] = [];
  const hw = p.roadHalfWidth;
  const al = p.armLength;
  const arms = p.arms;

  // Ground plane for context (grass/dirt) under everything.
  const extent = (hw + al) * 2 + p.sidewalkWidth * 2;
  parts.push({ name: "ground", label: "地面", mesh: transform(plane(extent, extent, 1, 1), { translate: vec3(0, -0.01, 0) }), color: GRASS, surface: concS(GRASS, 1) });

  parts.push({ name: "asphalt", label: "沥青路面", mesh: joinedAsphaltMesh(hw, al, arms), color: ASPHALT, surface: asphaltS() });

  const armList: Array<["north" | "south" | "east" | "west", boolean, boolean, number]> = [
    ["north", arms.north, false, 1],
    ["south", arms.south, false, -1],
    ["east", arms.east, true, 1],
    ["west", arms.west, true, -1],
  ];

  // Lane divider + edge lines running down each arm.
  const lines: Mesh[] = [];
  const yellow: Mesh[] = [];
  const nLanes = Math.max(1, Math.round(p.lanes));
  for (const [, present, alongX, sign] of armList) {
    if (!present) continue;
    const armStart = hw;
    const armEnd = hw + al;
    const mid = (armStart + armEnd) / 2;
    const len = al - 0.5;
    // Centre double-yellow (divides opposing traffic).
    if (alongX) yellow.push(stripe(len, 0.16, sign * mid, 0, 0.084));
    else yellow.push(stripe(0.16, len, 0, sign * mid, 0.084));
    // White lane dividers between lanes on each half.
    for (let side = -1; side <= 1; side += 2) {
      for (let l = 1; l < nLanes; l++) {
        const off = side * (l / nLanes) * hw;
        if (alongX) lines.push(stripe(len, 0.1, sign * mid, off, 0.098));
        else lines.push(stripe(0.1, len, off, sign * mid, 0.098));
      }
    }
    // Stop line at the junction mouth.
    if (alongX) lines.push(stripe(0.3, hw * 2 - 0.4, sign * (hw + 0.4), 0, 0.098));
    else lines.push(stripe(hw * 2 - 0.4, 0.3, 0, sign * (hw + 0.4), 0.098));
  }
  if (yellow.length) parts.push({ name: "center_lines", label: "中心黄线", mesh: merge(...yellow), color: PAINT_Y, surface: paintS(PAINT_Y) });
  if (lines.length) parts.push({ name: "lane_lines", label: "车道线", mesh: merge(...lines), color: PAINT, surface: paintS(PAINT) });

  // Zebra crosswalks just outside the junction pad on each present arm.
  if (p.crosswalks) {
    const walks: Mesh[] = [];
    for (const [, present, alongX, sign] of armList) {
      if (!present) continue;
      const at = hw + 1.6;
      if (alongX) walks.push(zebra(hw * 2 - 0.6, sign * at, 0, false));
      else walks.push(zebra(hw * 2 - 0.6, 0, sign * at, true));
    }
    parts.push({ name: "crosswalks", label: "斑马线", mesh: merge(...walks), color: PAINT, surface: paintS(PAINT) });
  }

  // Corner sidewalks: four L-shaped raised concrete pads with curbs at the corners.
  if (p.sidewalks) {
    const sw = p.sidewalkWidth;
    const walk: Mesh[] = [];
    const curbs: Mesh[] = [];
    const outer = hw + al;
    for (const cx of [-1, 1]) {
      for (const cz of [-1, 1]) {
        // Sidewalk pad fills the corner block between two arms.
        const px = cx * (hw + (outer - hw) / 2 + sw / 2);
        const pz = cz * (hw + (outer - hw) / 2 + sw / 2);
        const size = (outer - hw) + sw;
        walk.push(transform(box(size, 0.16, size), { translate: vec3(px, 0.08, pz) }));
        // Curb strip facing the road on the two inner edges.
        curbs.push(transform(box(size, 0.22, 0.2), { translate: vec3(px, 0.18, cz * (hw - 0.1)) }));
        curbs.push(transform(box(0.2, 0.22, size), { translate: vec3(cx * (hw - 0.1), 0.18, pz) }));
      }
    }
    parts.push({ name: "sidewalks", label: "人行道", mesh: merge(...walk), color: SIDEWALK, surface: concS(SIDEWALK, 0.7) });
    parts.push({ name: "curbs", label: "路缘石", mesh: merge(...curbs), color: CURB, surface: concS(CURB, 0.7) });
  }

  return parts;
}
