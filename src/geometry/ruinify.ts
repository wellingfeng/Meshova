/**
 * Ruinify — turn an intact structure into a weathered, broken ruin.
 *
 * Reference: Elderwood Overlook's `Quick_Ruinify` Houdini HDA (intact ->
 * cracked / eroded / collapsed). Re-authored as a composable post-process
 * pass over an indexed Mesh, deterministic by seed. This is a *capability*,
 * not a model: feed it any building mesh (an archway, a wall, a column) and
 * get a plausibly decayed version back.
 *
 * The pass chains three independent effects, each individually toggleable:
 *   1) crumbleTop  — bite chunks out of the upper region (noise height mask)
 *   2) erodeEdges  — push border/silhouette verts inward + roughen (weathering)
 *   3) knockChunks — subtract Voronoi-ish bites from the surface (missing bricks)
 *
 * Pure geometry: no textures baked. Same seed -> same ruin.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, sub, scale, length, normalize, dot, cross } from "../math/vec3.js";
import { makeNoise } from "../random/noise.js";
import { makeRng } from "../random/prng.js";
import { bounds, recomputeNormals, computeNormals, type Mesh } from "./mesh.js";
import { subdivide } from "./ops.js";

export interface RuinifyOptions {
  seed?: number;
  /** 0..1 how much of the top gets bitten away (0 = keep whole). */
  crumble?: number;
  /** 0..1 edge weathering / erosion intensity. */
  erosion?: number;
  /** Number of chunk bites subtracted from the surface (missing masonry). */
  chunks?: number;
  /** Chunk bite size as a fraction of the bounding-box diagonal. */
  chunkSize?: number;
  /** Cusp angle for the final normal recompute. */
  cusp?: number;
}

interface WeldedGroup {
  readonly position: Vec3;
  readonly normal: Vec3;
  readonly indices: number[];
}

function weldedGroups(mesh: Mesh): WeldedGroup[] {
  const b = bounds(mesh);
  const diag = Math.max(length(sub(b.max, b.min)), 1e-6);
  const quantize = 1 / Math.max(diag * 1e-6, 1e-7);
  const groups = new Map<string, number[]>();
  for (let index = 0; index < mesh.positions.length; index++) {
    const point = mesh.positions[index]!;
    const key = `${Math.round(point.x * quantize)},${Math.round(point.y * quantize)},${Math.round(point.z * quantize)}`;
    const group = groups.get(key);
    if (group) group.push(index);
    else groups.set(key, [index]);
  }

  const center = scale(add(b.min, b.max), 0.5);
  return [...groups.values()].map((indices) => {
    const position = mesh.positions[indices[0]!]!;
    let normal = vec3(0, 0, 0);
    for (const index of indices) normal = add(normal, mesh.normals[index] ?? vec3(0, 1, 0));
    if (length(normal) < 1e-8) normal = sub(position, center);
    if (length(normal) < 1e-8) normal = vec3(0, 1, 0);
    return { position, normal: normalize(normal), indices };
  });
}

function deformWelded(mesh: Mesh, deform: (position: Vec3, normal: Vec3) => Vec3): Mesh {
  const groups = weldedGroups(mesh);
  const positions = mesh.positions.map((point) => ({ ...point }));
  const targets = groups.map((group) => deform(group.position, group.normal));
  const factors = groups.map(() => 1);
  const groupByVertex = new Array<number>(mesh.positions.length);
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    for (const vertexIndex of groups[groupIndex]!.indices) groupByVertex[vertexIndex] = groupIndex;
  }

  for (let iteration = 0; iteration < 20; iteration++) {
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
      const group = groups[groupIndex]!;
      const moved = add(group.position, scale(sub(targets[groupIndex]!, group.position), factors[groupIndex]!));
      for (const vertexIndex of group.indices) positions[vertexIndex] = moved;
    }

    const unsafeGroups = new Set<number>();
    for (let index = 0; index < mesh.indices.length; index += 3) {
      const ia = mesh.indices[index]!;
      const ib = mesh.indices[index + 1]!;
      const ic = mesh.indices[index + 2]!;
      const beforeNormal = cross(
        sub(mesh.positions[ib]!, mesh.positions[ia]!),
        sub(mesh.positions[ic]!, mesh.positions[ia]!),
      );
      const afterNormal = cross(
        sub(positions[ib]!, positions[ia]!),
        sub(positions[ic]!, positions[ia]!),
      );
      if (dot(beforeNormal, afterNormal) > dot(beforeNormal, beforeNormal) * 1e-6) continue;
      unsafeGroups.add(groupByVertex[ia]!);
      unsafeGroups.add(groupByVertex[ib]!);
      unsafeGroups.add(groupByVertex[ic]!);
    }
    if (unsafeGroups.size === 0) break;
    for (const groupIndex of unsafeGroups) factors[groupIndex] = factors[groupIndex]! * 0.5;
  }

  return recomputeNormals({
    positions,
    normals: mesh.normals.map((normal) => ({ ...normal })),
    uvs: mesh.uvs.map((uv) => ({ ...uv })),
    indices: mesh.indices.slice(),
  });
}

/**
 * Collapse the crown along a noise-modulated height field. Coincident seam
 * vertices move as one group, so the result stays a closed solid instead of
 * becoming a set of uncapped deleted faces.
 */
export function crumbleTop(mesh: Mesh, amount: number, seed = 0): Mesh {
  if (amount <= 0 || mesh.indices.length === 0) return mesh;
  const strength = Math.min(1, amount);
  const b = bounds(mesh);
  const h = b.max.y - b.min.y;
  if (h < 1e-6) return mesh;
  const noise = makeNoise(seed >>> 0);
  const horizontalExtent = Math.max(b.max.x - b.min.x, b.max.z - b.min.z, 1e-3);
  const freq = 2 / horizontalExtent;
  const region = h * Math.min(0.9, strength);
  const cutBase = b.max.y - region;
  return deformWelded(mesh, (point) => {
    if (point.y <= cutBase) return point;
    const t = Math.min(1, Math.max(0, (point.y - cutBase) / region));
    const smooth = t * t * (3 - 2 * t);
    const variation = 0.5 + 0.5 * noise.noise2(point.x * freq, 0.37);
    const drop = region * (0.08 + variation * 0.2) * smooth;
    return vec3(point.x, point.y - drop, point.z);
  });
}

/**
 * Weather the silhouette: displace boundary/high verts inward+down with noise
 * so straight edges become gnawed. Interior verts move less (mask by how
 * exposed a vertex is, approximated by its distance from the bbox centre axis).
 */
export function erodeEdges(mesh: Mesh, amount: number, seed = 0): Mesh {
  if (amount <= 0 || mesh.positions.length === 0) return mesh;
  const strength = Math.min(1, amount);
  const b = bounds(mesh);
  const c = scale(add(b.min, b.max), 0.5);
  const ext = sub(b.max, b.min);
  const maxExt = Math.max(ext.x, ext.y, ext.z, 1e-3);
  const noise = makeNoise((seed ^ 0x9e37) >>> 0);
  const freq = 4 / maxExt;
  return deformWelded(mesh, (point, normal) => {
    // exposure: how far this vert sits from the central axis (0..1)
    const radial = Math.hypot(point.x - c.x, point.z - c.z) / (maxExt * 0.5);
    const exposure = Math.min(1, radial);
    const d = noise.noise3(point.x * freq, point.y * freq, point.z * freq);
    const bite = (0.5 + 0.5 * d) * strength * maxExt * 0.04 * exposure;
    // pull inward along -normal, plus a touch of gravity sag
    return add(point, add(scale(normal, -bite), vec3(0, -bite * 0.3, 0)));
  });
}

/**
 * Press N chipped pockets into the surface. The mesh is subdivided before
 * deformation and welded seam groups share one displacement, producing visible
 * missing-masonry damage without uncapped Boolean cracks.
 */
export function knockChunks(mesh: Mesh, count: number, sizeFrac: number, seed = 0): Mesh {
  if (count <= 0 || mesh.indices.length === 0) return mesh;
  const detailed = subdivide(mesh, 2);
  const b = bounds(detailed);
  const diag = length(sub(b.max, b.min));
  const s = Math.max(1e-3, sizeFrac) * diag;
  const rng = makeRng((seed ^ 0x1234) >>> 0);
  const bites: Array<{ center: Vec3; normal: Vec3; radius: number; depth: number }> = [];
  const triCount = detailed.indices.length / 3;
  for (let i = 0; i < count; i++) {
    const t = Math.floor(rng.next() * triCount);
    const ia = detailed.indices[t * 3]!;
    const ib = detailed.indices[t * 3 + 1]!;
    const ic = detailed.indices[t * 3 + 2]!;
    // random barycentric point on the triangle
    let u = rng.next();
    let v = rng.next();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const pa = detailed.positions[ia]!;
    const pb = detailed.positions[ib]!;
    const pc = detailed.positions[ic]!;
    const px = pa.x + u * (pb.x - pa.x) + v * (pc.x - pa.x);
    const py = pa.y + u * (pb.y - pa.y) + v * (pc.y - pa.y);
    const pz = pa.z + u * (pb.z - pa.z) + v * (pc.z - pa.z);
    const wa = 1 - u - v;
    const normal = normalize(add(
      scale(detailed.normals[ia]!, wa),
      add(scale(detailed.normals[ib]!, u), scale(detailed.normals[ic]!, v)),
    ));
    bites.push({
      center: vec3(px, py, pz),
      normal,
      radius: s * rng.range(1.5, 2.75),
      depth: s * rng.range(0.3, 0.65),
    });
  }
  return deformWelded(detailed, (point, normal) => {
    let depth = 0;
    let direction = normal;
    for (const bite of bites) {
      const alignment = dot(normal, bite.normal);
      if (alignment <= 0.35) continue;
      const distance = length(sub(point, bite.center));
      if (distance >= bite.radius) continue;
      const t = 1 - distance / bite.radius;
      const smooth = t * t * (3 - 2 * t);
      const candidate = bite.depth * smooth * alignment;
      if (candidate <= depth) continue;
      depth = candidate;
      direction = bite.normal;
    }
    return depth > 0 ? add(point, scale(direction, -Math.min(depth, s * 0.45))) : point;
  });
}

/** Full ruinify pass: crumble -> knock chunks -> erode edges. */
export function ruinify(mesh: Mesh, opts: RuinifyOptions = {}): Mesh {
  const seed = (opts.seed ?? 0) >>> 0;
  const crumble = opts.crumble ?? 0.4;
  const erosion = opts.erosion ?? 0.5;
  const chunks = opts.chunks ?? 6;
  const chunkSize = opts.chunkSize ?? 0.06;
  const cusp = opts.cusp ?? 40;

  let m = mesh;
  if (crumble > 0) m = crumbleTop(m, crumble, seed);
  if (chunks > 0) m = knockChunks(m, chunks, chunkSize, seed + 1);
  if (erosion > 0) m = erodeEdges(m, erosion, seed + 2);
  return computeNormals(m, cusp);
}
