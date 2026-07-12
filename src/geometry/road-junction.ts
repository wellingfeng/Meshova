import { vec2 } from "../math/vec2.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeMesh, type Mesh } from "./mesh.js";

export interface RoadJunctionBranch {
  /** Direction leaving the junction, in radians on XZ. 0 points +X. */
  angleRadians: number;
  /** Road half-width at this junction mouth. */
  halfWidth: number;
  /** Road length beyond the central junction pad. */
  length?: number;
}

export interface RoadJunctionMeshOptions {
  /** Override the automatically resolved central radius. */
  radius?: number;
  /** Top surface Y. */
  top?: number;
  /** Bottom surface Y. */
  bottom?: number;
}

interface ResolvedRoadJunctionBranch {
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

function resolveBranches(branches: readonly RoadJunctionBranch[]): ResolvedRoadJunctionBranch[] {
  if (branches.length < 3) throw new Error("a road junction needs at least 3 branches");
  const resolved = branches.map((branch) => {
    if (!Number.isFinite(branch.angleRadians)) throw new Error("branch angleRadians must be finite");
    if (!(branch.halfWidth > 0)) throw new Error("branch halfWidth must be positive");
    const length = branch.length ?? 0;
    if (!(length >= 0)) throw new Error("branch length must not be negative");
    const angle = ((branch.angleRadians % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    return { angle, halfWidth: branch.halfWidth, length, dx, dz, lx: -dz, lz: dx };
  }).sort((a, b) => a.angle - b.angle);

  for (let index = 0; index < resolved.length; index++) {
    const current = resolved[index]!;
    const next = resolved[(index + 1) % resolved.length]!;
    const gap = (next.angle - current.angle + Math.PI * 2) % (Math.PI * 2);
    if (gap < Math.PI / 180) throw new Error("branch angles must differ by at least 1 degree");
    if (gap > Math.PI + 1e-8) throw new Error("branch directions must surround the junction centre");
  }
  return resolved;
}

function resolvedRadius(branches: readonly ResolvedRoadJunctionBranch[]): number {
  let radius = Math.max(...branches.map((branch) => branch.halfWidth)) * 1.2;
  for (let iteration = 0; iteration < 128; iteration++) {
    let clear = true;
    for (let index = 0; index < branches.length; index++) {
      const current = branches[index]!;
      const next = branches[(index + 1) % branches.length]!;
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

/** Radius required to keep arbitrary-angle branch mouths from overlapping. */
export function roadJunctionRadius(branches: readonly RoadJunctionBranch[]): number {
  return resolvedRadius(resolveBranches(branches));
}

function pointAt(branch: ResolvedRoadJunctionBranch, distance: number, lateral: number): BoundaryPoint {
  return {
    x: branch.dx * distance + branch.lx * lateral,
    z: branch.dz * distance + branch.lz * lateral,
  };
}

function fullBoundary(branches: readonly ResolvedRoadJunctionBranch[], radius: number): BoundaryPoint[] {
  const boundary: BoundaryPoint[] = [];
  for (const branch of branches) {
    const outer = radius + branch.length;
    boundary.push(
      pointAt(branch, radius, -branch.halfWidth),
      pointAt(branch, outer, -branch.halfWidth),
      pointAt(branch, outer, branch.halfWidth),
      pointAt(branch, radius, branch.halfWidth),
    );
  }
  return boundary;
}

function padBoundary(branches: readonly ResolvedRoadJunctionBranch[], radius: number): BoundaryPoint[] {
  const boundary: BoundaryPoint[] = [];
  for (const branch of branches) {
    boundary.push(
      pointAt(branch, radius, -branch.halfWidth),
      pointAt(branch, radius, branch.halfWidth),
    );
  }
  return boundary;
}

function flatPlate(boundary: readonly BoundaryPoint[], y: number): Mesh {
  const extent = Math.max(...boundary.map((point) => Math.hypot(point.x, point.z)), 1e-6);
  const positions: Vec3[] = [vec3(0, y, 0)];
  const normals: Vec3[] = [vec3(0, 1, 0)];
  const uvs = [vec2(0.5, 0.5)];
  const indices: number[] = [];
  for (const point of boundary) {
    positions.push(vec3(point.x, y, point.z));
    normals.push(vec3(0, 1, 0));
    uvs.push(vec2(point.x / (extent * 2) + 0.5, point.z / (extent * 2) + 0.5));
  }
  for (let index = 0; index < boundary.length; index++) {
    indices.push(0, (index + 1) % boundary.length + 1, index + 1);
  }
  return makeMesh({ positions, normals, uvs, indices });
}

/** Central pad whose branch-mouth edges exactly match trimmed road ribbons. */
export function roadJunctionPadMesh(
  branches: readonly RoadJunctionBranch[],
  options: Pick<RoadJunctionMeshOptions, "radius" | "top"> = {},
): Mesh {
  const resolved = resolveBranches(branches);
  const radius = options.radius ?? resolvedRadius(resolved);
  if (!(radius > 0)) throw new Error("junction radius must be positive");
  return flatPlate(padBoundary(resolved, radius), options.top ?? 0);
}

/** Closed road solid: central arbitrary-angle pad and all branches share one contour. */
export function joinedRoadJunctionMesh(
  branches: readonly RoadJunctionBranch[],
  options: RoadJunctionMeshOptions = {},
): Mesh {
  const resolved = resolveBranches(branches);
  const radius = options.radius ?? resolvedRadius(resolved);
  const top = options.top ?? 0.07;
  const bottom = options.bottom ?? -0.03;
  if (!(radius > 0)) throw new Error("junction radius must be positive");
  if (!(top > bottom)) throw new Error("junction top must exceed bottom");
  const boundary = fullBoundary(resolved, radius);
  const extent = Math.max(...boundary.map((point) => Math.hypot(point.x, point.z)), 1e-6);
  const positions: Vec3[] = [vec3(0, top, 0), vec3(0, bottom, 0)];
  const normals: Vec3[] = [vec3(0, 1, 0), vec3(0, -1, 0)];
  const uvs = [vec2(0.5, 0.5), vec2(0.5, 0.5)];
  const indices: number[] = [];
  const topRing: number[] = [];
  const bottomRing: number[] = [];

  for (const point of boundary) {
    topRing.push(positions.length);
    positions.push(vec3(point.x, top, point.z));
    normals.push(vec3(0, 1, 0));
    uvs.push(vec2(point.x / (extent * 2) + 0.5, point.z / (extent * 2) + 0.5));
    bottomRing.push(positions.length);
    positions.push(vec3(point.x, bottom, point.z));
    normals.push(vec3(0, -1, 0));
    uvs.push(vec2(point.x / (extent * 2) + 0.5, point.z / (extent * 2) + 0.5));
  }

  for (let index = 0; index < boundary.length; index++) {
    const next = (index + 1) % boundary.length;
    indices.push(0, topRing[next]!, topRing[index]!);
    indices.push(1, bottomRing[index]!, bottomRing[next]!);

    const currentPoint = boundary[index]!;
    const nextPoint = boundary[next]!;
    const edgeLength = Math.hypot(nextPoint.x - currentPoint.x, nextPoint.z - currentPoint.z);
    if (edgeLength < 1e-9) continue;
    const outwardX = (nextPoint.z - currentPoint.z) / edgeLength;
    const outwardZ = -(nextPoint.x - currentPoint.x) / edgeLength;
    const base = positions.length;
    positions.push(
      vec3(currentPoint.x, bottom, currentPoint.z),
      vec3(currentPoint.x, top, currentPoint.z),
      vec3(nextPoint.x, top, nextPoint.z),
      vec3(nextPoint.x, bottom, nextPoint.z),
    );
    normals.push(
      vec3(outwardX, 0, outwardZ),
      vec3(outwardX, 0, outwardZ),
      vec3(outwardX, 0, outwardZ),
      vec3(outwardX, 0, outwardZ),
    );
    uvs.push(vec2(0, 0), vec2(0, top - bottom), vec2(edgeLength, top - bottom), vec2(edgeLength, 0));
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return makeMesh({ positions, normals, uvs, indices });
}
