import { vec2 } from "../math/vec2.js";
import type { Vec3 } from "../math/vec3.js";
import { add, cross, dot, length, normalize, scale, sub, vec3 } from "../math/vec3.js";
import { TAU } from "../math/scalar.js";
import type { Curve } from "./curve.js";
import { parallelTransportFrames } from "./frame.js";
import type { Mesh } from "./mesh.js";
import { bounds, computeNormals, makeMesh, merge, recomputeNormals } from "./mesh.js";
import { sphere } from "./primitives.js";
import { closestPointOnMesh, sampleNormalAt } from "./query.js";
import { edgeKey, fromTopo, toTopo, type TopoMesh } from "./topo.js";

export interface SmoothMeshOptions {
  iterations?: number;
  factor?: number;
  preserveBoundary?: boolean;
}

/** Laplacian smoothing over welded topology. */
export function smoothMesh(mesh: Mesh, options: SmoothMeshOptions = {}): Mesh {
  const iterations = Math.max(0, Math.floor(options.iterations ?? 1));
  const factor = Math.max(0, Math.min(1, options.factor ?? 0.5));
  if (iterations === 0 || factor === 0 || mesh.positions.length === 0) return mesh;

  const topo = toTopo(mesh);
  const points = smoothTopologyPoints(
    topo,
    iterations,
    factor,
    options.preserveBoundary ?? true,
  );
  return recomputeNormals(fromTopo({ ...topo, points }));
}

function smoothTopologyPoints(
  topo: TopoMesh,
  iterations: number,
  factor: number,
  preserveBoundary: boolean,
): Vec3[] {
  const neighbors = topo.points.map(() => new Set<number>());
  const boundary = new Set<number>();
  for (const edge of topo.edges.values()) {
    neighbors[edge.a]!.add(edge.b);
    neighbors[edge.b]!.add(edge.a);
    if (edge.faces.length === 1) {
      boundary.add(edge.a);
      boundary.add(edge.b);
    }
  }

  let points = topo.points.map((point) => ({ ...point }));
  for (let iteration = 0; iteration < iterations; iteration++) {
    points = points.map((point, index) => {
      if (preserveBoundary && boundary.has(index)) return point;
      const adjacent = neighbors[index]!;
      if (adjacent.size === 0) return point;
      let sum = vec3(0, 0, 0);
      for (const neighbor of adjacent) sum = add(sum, points[neighbor]!);
      const average = scale(sum, 1 / adjacent.size);
      return add(point, scale(sub(average, point), factor));
    });
  }
  return points;
}

export interface DecimateOptions {
  /** Approximate retained vertex ratio in (0, 1]. */
  ratio?: number;
}

interface VertexCluster {
  position: Vec3;
  normal: Vec3;
  uv: { x: number; y: number };
  count: number;
}

/** Deterministic vertex-cluster decimation. */
export function decimateMesh(mesh: Mesh, options: DecimateOptions = {}): Mesh {
  const ratio = Math.max(0.01, Math.min(1, options.ratio ?? 0.5));
  if (ratio >= 1 || mesh.positions.length < 4) return mesh;

  const topo = toTopo(mesh);
  const target = Math.max(4, Math.round(topo.points.length * ratio));
  const meshBounds = bounds(mesh);
  const spans = vec3(
    Math.max(1e-9, meshBounds.max.x - meshBounds.min.x),
    Math.max(1e-9, meshBounds.max.y - meshBounds.min.y),
    Math.max(1e-9, meshBounds.max.z - meshBounds.min.z),
  );
  const maxResolution = Math.max(2, Math.ceil(Math.cbrt(target) * 6));
  let bestResolution = 1;
  let bestDifference = Infinity;
  for (let resolution = 1; resolution <= maxResolution; resolution++) {
    const keys = new Set<string>();
    for (const point of topo.points) keys.add(clusterKey(point, meshBounds.min, spans, resolution));
    const difference = Math.abs(keys.size - target);
    if (difference < bestDifference) {
      bestDifference = difference;
      bestResolution = resolution;
    }
  }

  const clusters: VertexCluster[] = [];
  const keyToCluster = new Map<string, number>();
  const pointToCluster = new Array<number>(topo.points.length);
  for (let index = 0; index < topo.points.length; index++) {
    const point = topo.points[index]!;
    const key = clusterKey(point, meshBounds.min, spans, bestResolution);
    let clusterIndex = keyToCluster.get(key);
    if (clusterIndex === undefined) {
      clusterIndex = clusters.length;
      keyToCluster.set(key, clusterIndex);
      clusters.push({
        position: vec3(0, 0, 0),
        normal: vec3(0, 0, 0),
        uv: vec2(0, 0),
        count: 0,
      });
    }
    const cluster = clusters[clusterIndex]!;
    cluster.position = add(cluster.position, point);
    cluster.uv = {
      x: cluster.uv.x + (topo.uvOfPoint[index]?.x ?? 0),
      y: cluster.uv.y + (topo.uvOfPoint[index]?.y ?? 0),
    };
    cluster.count++;
    pointToCluster[index] = clusterIndex;
  }

  const positions = clusters.map((cluster) => scale(cluster.position, 1 / cluster.count));
  const uvs = clusters.map((cluster) => vec2(cluster.uv.x / cluster.count, cluster.uv.y / cluster.count));
  const indices: number[] = [];
  const faces = new Set<string>();
  for (const face of topo.faces) {
    if (face.length < 3) continue;
    const root = pointToCluster[face[0]!]!;
    for (let corner = 1; corner < face.length - 1; corner++) {
      const a = root;
      const b = pointToCluster[face[corner]!]!;
      const c = pointToCluster[face[corner + 1]!]!;
      if (a === b || b === c || c === a) continue;
      const key = [a, b, c].sort((left, right) => left - right).join("_");
      if (faces.has(key)) continue;
      faces.add(key);
      indices.push(a, b, c);
    }
  }
  if (indices.length === 0) return mesh;
  return recomputeNormals(makeMesh({
    positions,
    normals: positions.map(() => vec3(0, 1, 0)),
    uvs,
    indices,
  }));
}

function clusterKey(point: Vec3, min: Vec3, spans: Vec3, resolution: number): string {
  const x = Math.min(resolution - 1, Math.floor(((point.x - min.x) / spans.x) * resolution));
  const y = Math.min(resolution - 1, Math.floor(((point.y - min.y) / spans.y) * resolution));
  const z = Math.min(resolution - 1, Math.floor(((point.z - min.z) / spans.z) * resolution));
  return `${x}_${y}_${z}`;
}

export interface WireframeOptions {
  thickness?: number;
  sides?: number;
  boundaryOnly?: boolean;
}

/** Replace mesh edges with solid polygonal struts. */
export function wireframeMesh(mesh: Mesh, options: WireframeOptions = {}): Mesh {
  const thickness = Math.max(1e-6, options.thickness ?? 0.02);
  const sides = Math.max(3, Math.floor(options.sides ?? 6));
  const topo = toTopo(mesh);
  const struts: Mesh[] = [];
  for (const edge of topo.edges.values()) {
    if (options.boundaryOnly && edge.faces.length !== 1) continue;
    struts.push(edgeStrut(topo.points[edge.a]!, topo.points[edge.b]!, thickness, sides));
  }
  return struts.length === 0 ? mesh : merge(...struts);
}

function edgeStrut(start: Vec3, end: Vec3, radius: number, sides: number): Mesh {
  const delta = sub(end, start);
  if (length(delta) < 1e-9) return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  const direction = normalize(delta);
  const reference = Math.abs(direction.y) < 0.9 ? vec3(0, 1, 0) : vec3(1, 0, 0);
  const tangent = normalize(cross(direction, reference));
  const bitangent = normalize(cross(tangent, direction));
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Array<{ x: number; y: number }> = [];
  const indices: number[] = [];
  for (let ring = 0; ring < 2; ring++) {
    const center = ring === 0 ? start : end;
    for (let side = 0; side < sides; side++) {
      const angle = (side / sides) * Math.PI * 2;
      const radial = add(scale(tangent, Math.cos(angle)), scale(bitangent, Math.sin(angle)));
      positions.push(add(center, scale(radial, radius)));
      normals.push(radial);
      uvs.push(vec2(side / sides, ring));
    }
  }
  for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides;
    indices.push(side, sides + side, next, next, sides + side, sides + next);
  }
  return makeMesh({ positions, normals, uvs, indices });
}

export interface ShrinkwrapOptions {
  offset?: number;
  factor?: number;
}

/** Move vertices toward closest points on a target surface. */
export function shrinkwrapMesh(
  mesh: Mesh,
  target: Mesh,
  options: ShrinkwrapOptions = {},
): Mesh {
  if (mesh.positions.length === 0 || target.indices.length === 0) return mesh;
  const factor = Math.max(0, Math.min(1, options.factor ?? 1));
  const offset = options.offset ?? 0;
  const positions = mesh.positions.map((position) => {
    const closest = closestPointOnMesh(target, position);
    const normal = normalize(sampleNormalAt(target, closest.position));
    const projected = add(closest.position, scale(normal, offset));
    return add(position, scale(sub(projected, position), factor));
  });
  return recomputeNormals({
    positions,
    normals: mesh.normals.slice(),
    uvs: mesh.uvs.slice(),
    indices: mesh.indices.slice(),
  });
}

export type WeightedNormalMode = "face-area" | "corner-angle" | "face-area-and-angle";

export interface WeightedNormalOptions {
  mode?: WeightedNormalMode;
  /** Keep corners separated when faces meet above this angle. */
  sharpAngle?: number;
}

/** Rebuild corner normals using face area, corner angle, or both as weights. */
export function weightedNormalMesh(
  mesh: Mesh,
  options: WeightedNormalOptions = {},
): Mesh {
  if (mesh.indices.length === 0) return mesh;
  const mode = options.mode ?? "face-area-and-angle";
  const cosSharp = Math.cos(((options.sharpAngle ?? 180) * Math.PI) / 180);
  const faceNormals: Vec3[] = [];
  const faceAreas: number[] = [];
  const pointUses = new Map<string, Array<{ face: number; corner: number }>>();

  for (let face = 0; face < mesh.indices.length / 3; face++) {
    const offset = face * 3;
    const a = mesh.positions[mesh.indices[offset]!]!;
    const b = mesh.positions[mesh.indices[offset + 1]!]!;
    const c = mesh.positions[mesh.indices[offset + 2]!]!;
    const areaVector = cross(sub(b, a), sub(c, a));
    faceAreas.push(length(areaVector) * 0.5);
    faceNormals.push(length(areaVector) > 1e-12 ? normalize(areaVector) : vec3(0, 1, 0));
    for (let local = 0; local < 3; local++) {
      const corner = offset + local;
      const position = mesh.positions[mesh.indices[corner]!]!;
      const key = positionKey(position);
      const uses = pointUses.get(key);
      if (uses) uses.push({ face, corner });
      else pointUses.set(key, [{ face, corner }]);
    }
  }

  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Array<{ x: number; y: number }> = [];
  const indices: number[] = [];
  for (let corner = 0; corner < mesh.indices.length; corner++) {
    const vertex = mesh.indices[corner]!;
    const face = Math.floor(corner / 3);
    const faceNormal = faceNormals[face]!;
    let sum = vec3(0, 0, 0);
    for (const use of pointUses.get(positionKey(mesh.positions[vertex]!)) ?? []) {
      const candidate = faceNormals[use.face]!;
      if (dot(faceNormal, candidate) + 1e-12 < cosSharp) continue;
      const areaWeight = faceAreas[use.face]!;
      const angleWeight = cornerAngle(mesh, use.corner);
      const weight = mode === "face-area"
        ? areaWeight
        : mode === "corner-angle"
          ? angleWeight
          : areaWeight * angleWeight;
      sum = add(sum, scale(candidate, weight));
    }
    positions.push(mesh.positions[vertex]!);
    normals.push(length(sum) > 1e-12 ? normalize(sum) : faceNormal);
    uvs.push(mesh.uvs[vertex]!);
    indices.push(corner);
  }
  return makeMesh({ positions, normals, uvs, indices });
}

function cornerAngle(mesh: Mesh, corner: number): number {
  const faceStart = Math.floor(corner / 3) * 3;
  const local = corner - faceStart;
  const center = mesh.positions[mesh.indices[corner]!]!;
  const previous = mesh.positions[mesh.indices[faceStart + ((local + 2) % 3)]!]!;
  const next = mesh.positions[mesh.indices[faceStart + ((local + 1) % 3)]!]!;
  const left = normalize(sub(previous, center));
  const right = normalize(sub(next, center));
  return Math.acos(Math.max(-1, Math.min(1, dot(left, right))));
}

function positionKey(position: Vec3): string {
  const quantize = 1e5;
  return `${Math.round(position.x * quantize)},${Math.round(position.y * quantize)},${Math.round(position.z * quantize)}`;
}

export interface EdgeSplitOptions {
  angle?: number;
}

/** Split render vertices across sharp edges while preserving surface shape. */
export function edgeSplitMesh(mesh: Mesh, options: EdgeSplitOptions = {}): Mesh {
  return computeNormals(mesh, options.angle ?? 30);
}

export type DeformAxis = "x" | "y" | "z";

export interface CurveDeformOptions {
  axis?: DeformAxis;
  factor?: number;
  initialNormal?: Vec3;
}

/** Bend a mesh axis along a curve using rotation-minimizing frames. */
export function curveDeformMesh(
  mesh: Mesh,
  curve: Curve,
  options: CurveDeformOptions = {},
): Mesh {
  if (mesh.positions.length === 0 || curve.points.length < 2) return mesh;
  const frames = parallelTransportFrames(curve.points, {
    closed: curve.closed,
    ...(options.initialNormal ? { initialNormal: options.initialNormal } : {}),
  });
  const distances = [0];
  for (let index = 1; index < curve.points.length; index++) {
    distances.push(distances[index - 1]! + length(sub(curve.points[index]!, curve.points[index - 1]!)));
  }
  const totalLength = distances.at(-1)!;
  if (totalLength <= 1e-12) return mesh;
  const axis = options.axis ?? "x";
  const meshBounds = bounds(mesh);
  const min = axisValue(meshBounds.min, axis);
  const span = Math.max(1e-12, axisValue(meshBounds.max, axis) - min);
  const factor = Math.max(0, Math.min(1, options.factor ?? 1));
  const positions = mesh.positions.map((position) => {
    const parameter = Math.max(0, Math.min(1, (axisValue(position, axis) - min) / span));
    const frame = sampleFrame(frames, distances, parameter * totalLength);
    const [normalOffset, binormalOffset] = crossAxisValues(position, axis);
    const deformed = add(
      frame.position,
      add(scale(frame.normal, normalOffset), scale(frame.binormal, binormalOffset)),
    );
    return add(position, scale(sub(deformed, position), factor));
  });
  return recomputeNormals({
    positions,
    normals: mesh.normals.slice(),
    uvs: mesh.uvs.slice(),
    indices: mesh.indices.slice(),
  });
}

function sampleFrame(
  frames: ReturnType<typeof parallelTransportFrames>,
  distances: ReadonlyArray<number>,
  target: number,
): ReturnType<typeof parallelTransportFrames>[number] {
  let segment = 0;
  while (segment < distances.length - 2 && distances[segment + 1]! < target) segment++;
  const startDistance = distances[segment]!;
  const endDistance = distances[segment + 1]!;
  const parameter = endDistance > startDistance
    ? (target - startDistance) / (endDistance - startDistance)
    : 0;
  const start = frames[segment]!;
  const end = frames[Math.min(segment + 1, frames.length - 1)]!;
  return {
    position: add(start.position, scale(sub(end.position, start.position), parameter)),
    tangent: normalize(add(start.tangent, scale(sub(end.tangent, start.tangent), parameter))),
    normal: normalize(add(start.normal, scale(sub(end.normal, start.normal), parameter))),
    binormal: normalize(add(start.binormal, scale(sub(end.binormal, start.binormal), parameter))),
  };
}

function axisValue(position: Vec3, axis: DeformAxis): number {
  return axis === "x" ? position.x : axis === "y" ? position.y : position.z;
}

function crossAxisValues(position: Vec3, axis: DeformAxis): [number, number] {
  if (axis === "x") return [position.y, position.z];
  if (axis === "y") return [position.z, position.x];
  return [position.x, position.y];
}

export interface BuildMeshOptions {
  factor?: number;
  order?: "index" | "axis";
  axis?: DeformAxis;
  reverse?: boolean;
}

/** Reveal a deterministic prefix of mesh faces. */
export function buildMesh(mesh: Mesh, options: BuildMeshOptions = {}): Mesh {
  const factor = Math.max(0, Math.min(1, options.factor ?? 1));
  const faceCount = mesh.indices.length / 3;
  if (factor >= 1 || faceCount === 0) return mesh;
  let faces = Array.from({ length: faceCount }, (_, index) => index);
  if (options.order === "axis") {
    const axis = options.axis ?? "y";
    faces.sort((left, right) => faceAxisCenter(mesh, left, axis) - faceAxisCenter(mesh, right, axis) || left - right);
  }
  if (options.reverse) faces.reverse();
  return subsetFaces(mesh, faces.slice(0, Math.floor(faceCount * factor)));
}

function faceAxisCenter(mesh: Mesh, face: number, axis: DeformAxis): number {
  const offset = face * 3;
  return (
    axisValue(mesh.positions[mesh.indices[offset]!]!, axis)
    + axisValue(mesh.positions[mesh.indices[offset + 1]!]!, axis)
    + axisValue(mesh.positions[mesh.indices[offset + 2]!]!, axis)
  ) / 3;
}

export interface MaskMeshOptions {
  invert?: boolean;
}

/** Keep selected faces, or remove them when inverted. */
export function maskMesh(
  mesh: Mesh,
  faces: ReadonlyArray<number>,
  options: MaskMeshOptions = {},
): Mesh {
  const selected = new Set(faces.filter((face) => Number.isInteger(face) && face >= 0));
  const kept: number[] = [];
  for (let face = 0; face < mesh.indices.length / 3; face++) {
    if (selected.has(face) !== (options.invert ?? false)) kept.push(face);
  }
  return subsetFaces(mesh, kept);
}

function subsetFaces(mesh: Mesh, faces: ReadonlyArray<number>): Mesh {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Array<{ x: number; y: number }> = [];
  const indices: number[] = [];
  const oldToNew = new Map<number, number>();
  for (const face of faces) {
    if (face < 0 || face >= mesh.indices.length / 3) continue;
    for (let local = 0; local < 3; local++) {
      const oldIndex = mesh.indices[face * 3 + local]!;
      let newIndex = oldToNew.get(oldIndex);
      if (newIndex === undefined) {
        newIndex = positions.length;
        oldToNew.set(oldIndex, newIndex);
        positions.push(mesh.positions[oldIndex]!);
        normals.push(mesh.normals[oldIndex]!);
        uvs.push(mesh.uvs[oldIndex]!);
      }
      indices.push(newIndex);
    }
  }
  return makeMesh({ positions, normals, uvs, indices });
}

export interface ScrewMeshOptions {
  axis?: DeformAxis;
  /** Rotation per iteration, in radians. */
  angle?: number;
  /** Translation along the axis per iteration. */
  screwOffset?: number;
  steps?: number;
  iterations?: number;
  origin?: Vec3;
  caps?: boolean;
}

/** Sweep an open mesh boundary around an axis with optional axial rise. */
export function screwMesh(mesh: Mesh, options: ScrewMeshOptions = {}): Mesh {
  if (mesh.positions.length === 0 || mesh.indices.length === 0) return mesh;
  const topo = toTopo(mesh);
  const boundaryEdges = directedBoundaryEdges(topo);
  const steps = Math.max(3, Math.floor(options.steps ?? 16));
  const iterations = Math.max(1, Math.floor(options.iterations ?? 1));
  const totalSteps = steps * iterations;
  const totalAngle = (options.angle ?? TAU) * iterations;
  const totalOffset = (options.screwOffset ?? 0) * iterations;
  const axis = options.axis ?? "y";
  const origin = options.origin ?? vec3(0, 0, 0);
  const closed = Math.abs(totalOffset) <= 1e-9
    && Math.abs(totalAngle / TAU - Math.round(totalAngle / TAU)) <= 1e-9;

  if (boundaryEdges.length === 0) {
    const copies: Mesh[] = [];
    const copyCount = closed ? totalSteps : totalSteps + 1;
    for (let ring = 0; ring < copyCount; ring++) {
      const parameter = ring / totalSteps;
      copies.push(transformScrewCopy(mesh, axis, origin, totalAngle * parameter, totalOffset * parameter));
    }
    return merge(...copies);
  }

  const ringCount = closed ? totalSteps : totalSteps + 1;
  const stride = topo.points.length;
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Array<{ x: number; y: number }> = [];
  const indices: number[] = [];
  for (let ring = 0; ring < ringCount; ring++) {
    const parameter = ring / totalSteps;
    const angle = totalAngle * parameter;
    const offset = totalOffset * parameter;
    for (let point = 0; point < stride; point++) {
      positions.push(screwPoint(topo.points[point]!, axis, origin, angle, offset));
      normals.push(vec3(0, 1, 0));
      const uv = topo.uvOfPoint[point] ?? vec2(0, 0);
      uvs.push(vec2(parameter, uv.y));
    }
  }

  const connections = closed ? ringCount : ringCount - 1;
  for (let ring = 0; ring < connections; ring++) {
    const next = (ring + 1) % ringCount;
    for (const [start, end] of boundaryEdges) {
      const a = ring * stride + start;
      const b = ring * stride + end;
      const c = next * stride + start;
      const d = next * stride + end;
      indices.push(a, b, d, a, d, c);
    }
  }

  if (!closed && (options.caps ?? true)) {
    const last = (ringCount - 1) * stride;
    for (const face of topo.faces) {
      for (let corner = 1; corner < face.length - 1; corner++) {
        indices.push(face[0]!, face[corner + 1]!, face[corner]!);
        indices.push(last + face[0]!, last + face[corner]!, last + face[corner + 1]!);
      }
    }
  }
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function directedBoundaryEdges(topo: TopoMesh): Array<readonly [number, number]> {
  const result: Array<readonly [number, number]> = [];
  for (const face of topo.faces) {
    for (let corner = 0; corner < face.length; corner++) {
      const start = face[corner]!;
      const end = face[(corner + 1) % face.length]!;
      if (topo.edges.get(edgeKey(start, end))?.faces.length === 1) result.push([start, end]);
    }
  }
  return result;
}

function transformScrewCopy(
  mesh: Mesh,
  axis: DeformAxis,
  origin: Vec3,
  angle: number,
  offset: number,
): Mesh {
  return {
    positions: mesh.positions.map((position) => screwPoint(position, axis, origin, angle, offset)),
    normals: mesh.normals.map((normal) => rotateAxis(normal, axis, angle)),
    uvs: mesh.uvs.map((uv) => ({ ...uv })),
    indices: mesh.indices.slice(),
  };
}

function screwPoint(
  point: Vec3,
  axis: DeformAxis,
  origin: Vec3,
  angle: number,
  offset: number,
): Vec3 {
  const rotated = rotateAxis(sub(point, origin), axis, angle);
  const translated = axis === "x"
    ? vec3(offset, 0, 0)
    : axis === "y"
      ? vec3(0, offset, 0)
      : vec3(0, 0, offset);
  return add(origin, add(rotated, translated));
}

function rotateAxis(vector: Vec3, axis: DeformAxis, angle: number): Vec3 {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  if (axis === "x") {
    return vec3(vector.x, vector.y * cosine - vector.z * sine, vector.y * sine + vector.z * cosine);
  }
  if (axis === "y") {
    return vec3(vector.x * cosine - vector.z * sine, vector.y, vector.x * sine + vector.z * cosine);
  }
  return vec3(vector.x * cosine - vector.y * sine, vector.x * sine + vector.y * cosine, vector.z);
}

export interface SkinMeshOptions {
  radius?: number;
  sides?: number;
  joints?: boolean;
  jointSegments?: number;
  boundaryOnly?: boolean;
}

/** Wrap welded topology edges with tubes and optional spherical joints. */
export function skinMesh(mesh: Mesh, options: SkinMeshOptions = {}): Mesh {
  if (mesh.positions.length === 0) return mesh;
  const radius = Math.max(1e-6, options.radius ?? 0.05);
  const sides = Math.max(3, Math.floor(options.sides ?? 8));
  const skinned = wireframeMesh(mesh, {
    thickness: radius,
    sides,
    ...(options.boundaryOnly === undefined ? {} : { boundaryOnly: options.boundaryOnly }),
  });
  if (!(options.joints ?? true)) return skinned;
  const jointSegments = Math.max(6, Math.floor(options.jointSegments ?? sides));
  const joint = sphere(radius, jointSegments, Math.max(4, Math.floor(jointSegments / 2)));
  const joints = toTopo(mesh).points.map((point) => ({
    positions: joint.positions.map((position) => add(position, point)),
    normals: joint.normals.slice(),
    uvs: joint.uvs.slice(),
    indices: joint.indices.slice(),
  }));
  return merge(skinned, ...joints);
}

export type CastShape = "sphere" | "cylinder" | "cuboid";

export interface CastMeshOptions {
  shape?: CastShape;
  axis?: DeformAxis;
  origin?: Vec3;
  radius?: number;
  factor?: number;
}

/** Move vertices toward a sphere, cylinder, or cuboid centered at an origin. */
export function castMesh(mesh: Mesh, options: CastMeshOptions = {}): Mesh {
  if (mesh.positions.length === 0) return mesh;
  const meshBounds = bounds(mesh);
  const origin = options.origin ?? scale(add(meshBounds.min, meshBounds.max), 0.5);
  const axis = options.axis ?? "y";
  const shape = options.shape ?? "sphere";
  const factor = Math.max(-10, Math.min(10, options.factor ?? 1));
  const halfExtents = scale(sub(meshBounds.max, meshBounds.min), 0.5);
  const defaultRadius = shape === "cylinder"
    ? Math.max(...crossAxisValues(halfExtents, axis))
    : Math.max(halfExtents.x, halfExtents.y, halfExtents.z);
  const radius = Math.max(1e-9, options.radius ?? defaultRadius);
  const positions = mesh.positions.map((position) => {
    const local = sub(position, origin);
    let target: Vec3;
    if (shape === "sphere") {
      target = length(local) > 1e-12 ? scale(normalize(local), radius) : local;
    } else if (shape === "cylinder") {
      const [first, second] = crossAxisValues(local, axis);
      const radialLength = Math.hypot(first, second);
      const radialScale = radialLength > 1e-12 ? radius / radialLength : 1;
      target = setCrossAxisValues(local, axis, first * radialScale, second * radialScale);
    } else {
      const maximum = Math.max(Math.abs(local.x), Math.abs(local.y), Math.abs(local.z));
      target = maximum > 1e-12 ? scale(local, radius / maximum) : local;
    }
    return add(origin, add(local, scale(sub(target, local), factor)));
  });
  return recomputeNormals({
    positions,
    normals: mesh.normals.slice(),
    uvs: mesh.uvs.slice(),
    indices: mesh.indices.slice(),
  });
}

function setCrossAxisValues(
  point: Vec3,
  axis: DeformAxis,
  first: number,
  second: number,
): Vec3 {
  if (axis === "x") return vec3(point.x, first, second);
  if (axis === "y") return vec3(second, point.y, first);
  return vec3(first, second, point.z);
}

export type WaveCoordinate = "radial" | DeformAxis;

export interface WaveMeshOptions {
  amplitude?: number;
  wavelength?: number;
  speed?: number;
  phase?: number;
  origin?: Vec3;
  coordinate?: WaveCoordinate;
  radialAxis?: DeformAxis;
  displacement?: DeformAxis | "normal";
  falloff?: number;
}

/** Apply a deterministic traveling sine wave at the supplied evaluation time. */
export function waveMesh(mesh: Mesh, time = 0, options: WaveMeshOptions = {}): Mesh {
  if (mesh.positions.length === 0) return mesh;
  const amplitude = options.amplitude ?? 0.25;
  const wavelength = Math.max(1e-9, Math.abs(options.wavelength ?? 1));
  const speed = options.speed ?? 1;
  const phase = options.phase ?? 0;
  const origin = options.origin ?? vec3(0, 0, 0);
  const coordinate = options.coordinate ?? "radial";
  const displacement = options.displacement ?? "y";
  const falloff = options.falloff === undefined ? Infinity : Math.max(1e-9, options.falloff);
  const positions = mesh.positions.map((position, index) => {
    const local = sub(position, origin);
    const waveDistance = coordinate === "radial"
      ? Math.hypot(...crossAxisValues(local, options.radialAxis ?? "y"))
      : axisValue(local, coordinate);
    const envelope = Number.isFinite(falloff)
      ? Math.max(0, 1 - Math.abs(waveDistance) / falloff)
      : 1;
    const offset = Math.sin(TAU * (waveDistance / wavelength - time * speed) + phase)
      * amplitude
      * envelope;
    const direction = displacement === "normal"
      ? normalize(mesh.normals[index] ?? vec3(0, 1, 0))
      : displacement === "x"
        ? vec3(1, 0, 0)
        : displacement === "y"
          ? vec3(0, 1, 0)
          : vec3(0, 0, 1);
    return add(position, scale(direction, offset));
  });
  return recomputeNormals({
    positions,
    normals: mesh.normals.slice(),
    uvs: mesh.uvs.slice(),
    indices: mesh.indices.slice(),
  });
}

export interface LaplacianSmoothOptions extends SmoothMeshOptions {
  preserveVolume?: boolean;
}

/** Laplacian smoothing with optional closed-mesh volume correction. */
export function laplacianSmoothMesh(
  mesh: Mesh,
  options: LaplacianSmoothOptions = {},
): Mesh {
  const iterations = Math.max(0, Math.floor(options.iterations ?? 1));
  const factor = Math.max(0, Math.min(1, options.factor ?? 0.5));
  if (iterations === 0 || factor === 0 || mesh.positions.length === 0) return mesh;
  const topo = toTopo(mesh);
  let points = smoothTopologyPoints(topo, iterations, factor, options.preserveBoundary ?? true);
  if ((options.preserveVolume ?? true) && isClosedTopo(topo)) {
    points = restoreTopologyVolume(topo, points);
  }
  return recomputeNormals(fromTopo({ ...topo, points }));
}

function isClosedTopo(topo: TopoMesh): boolean {
  return topo.edges.size > 0 && [...topo.edges.values()].every((edge) => edge.faces.length === 2);
}

function restoreTopologyVolume(topo: TopoMesh, points: ReadonlyArray<Vec3>): Vec3[] {
  const originalVolume = Math.abs(topologyVolume(topo.faces, topo.points));
  const smoothedVolume = Math.abs(topologyVolume(topo.faces, points));
  if (originalVolume <= 1e-12 || smoothedVolume <= 1e-12) return points.slice();
  const center = scale(points.reduce((sum, point) => add(sum, point), vec3(0, 0, 0)), 1 / points.length);
  const volumeScale = Math.cbrt(originalVolume / smoothedVolume);
  return points.map((point) => add(center, scale(sub(point, center), volumeScale)));
}

function topologyVolume(faces: ReadonlyArray<ReadonlyArray<number>>, points: ReadonlyArray<Vec3>): number {
  let volume = 0;
  for (const face of faces) {
    if (face.length < 3) continue;
    const root = points[face[0]!]!;
    for (let corner = 1; corner < face.length - 1; corner++) {
      volume += dot(root, cross(points[face[corner]!]!, points[face[corner + 1]!]!)) / 6;
    }
  }
  return volume;
}

export interface CorrectiveSmoothOptions extends SmoothMeshOptions {
  correctionFactor?: number;
}

/** Smooth deformation while restoring the referenced rest mesh's base shape. */
export function correctiveSmoothMesh(
  mesh: Mesh,
  rest: Mesh,
  options: CorrectiveSmoothOptions = {},
): Mesh {
  if (mesh.positions.length === 0) return mesh;
  const topo = toTopo(mesh);
  const restTopo = toTopo(rest);
  if (!sameTopology(topo, restTopo)) {
    throw new Error("rest mesh topology does not match input topology");
  }
  const iterations = Math.max(0, Math.floor(options.iterations ?? 1));
  const factor = Math.max(0, Math.min(1, options.factor ?? 0.5));
  if (iterations === 0 || factor === 0) return mesh;
  const preserveBoundary = options.preserveBoundary ?? true;
  const smoothed = smoothTopologyPoints(topo, iterations, factor, preserveBoundary);
  const smoothedRest = smoothTopologyPoints(restTopo, iterations, factor, preserveBoundary);
  const correctionFactor = Math.max(0, Math.min(1, options.correctionFactor ?? 1));
  const points = smoothed.map((point, index) => add(
    point,
    scale(sub(restTopo.points[index]!, smoothedRest[index]!), correctionFactor),
  ));
  return recomputeNormals(fromTopo({ ...topo, points }));
}

function sameTopology(left: TopoMesh, right: TopoMesh): boolean {
  if (left.points.length !== right.points.length || left.faces.length !== right.faces.length) return false;
  return left.faces.every((face, index) => {
    const other = right.faces[index]!;
    return face.length === other.length && face.every((point, corner) => point === other[corner]);
  });
}
