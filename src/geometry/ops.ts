/**
 * P2 geometry DSL operators. Small, orthogonal, composable.
 *
 * All operators are pure: take a Mesh, return a new Mesh, never mutate input.
 * Determinism via explicit seeds where randomness is used.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, sub, scale, cross, normalize, length, dot } from "../math/vec3.js";
import { makeNoise, type Noise } from "../random/noise.js";
import { makeRng } from "../random/prng.js";
import type { Mesh } from "./mesh.js";
import { makeMesh, recomputeNormals, merge } from "./mesh.js";
import { translateMesh } from "./transform.js";

/**
 * Subdivide every triangle into 4 by inserting edge midpoints. Increases
 * detail for later displacement. Recomputes normals.
 */
export function subdivide(mesh: Mesh, iterations = 1): Mesh {
  let cur = mesh;
  for (let it = 0; it < iterations; it++) cur = subdivideOnce(cur);
  return recomputeNormals(cur);
}

function subdivideOnce(mesh: Mesh): Mesh {
  const positions = mesh.positions.map((p) => ({ ...p }));
  const uvs = mesh.uvs.map((uv) => ({ ...uv }));
  const indices: number[] = [];
  const midCache = new Map<string, number>();

  const midpoint = (a: number, b: number): number => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    const cached = midCache.get(key);
    if (cached !== undefined) return cached;
    const pa = mesh.positions[a]!;
    const pb = mesh.positions[b]!;
    const ua = mesh.uvs[a]!;
    const ub = mesh.uvs[b]!;
    const idx = positions.length;
    positions.push({ x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2, z: (pa.z + pb.z) / 2 });
    uvs.push({ x: (ua.x + ub.x) / 2, y: (ua.y + ub.y) / 2 });
    midCache.set(key, idx);
    return idx;
  };

  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i]!;
    const b = mesh.indices[i + 1]!;
    const c = mesh.indices[i + 2]!;
    const ab = midpoint(a, b);
    const bc = midpoint(b, c);
    const ca = midpoint(c, a);
    indices.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }

  const normals = positions.map(() => vec3(0, 1, 0));
  return makeMesh({ positions, normals, uvs, indices });
}

export interface DisplaceOptions {
  amount?: number;
  scale?: number;
  seed?: number;
}

/** Push each vertex along its normal by seeded 3D noise at its position. */
export function displaceByNoise(mesh: Mesh, opts: DisplaceOptions = {}): Mesh {
  const amount = opts.amount ?? 0.1;
  const freq = opts.scale ?? 2;
  const seed = opts.seed ?? 0;
  const noise: Noise = makeNoise(seed);

  // Coincident vertices (a cylinder's cap rim, seams, or any merged primitive
  // boundary) share a position but may carry DIFFERENT normals. Displacing each
  // along its own normal pushes them apart and tears the surface into an open
  // shell. Instead we group vertices by welded position, displace the whole
  // group by ONE shared vector (position-sampled amplitude along the group's
  // averaged normal), so coincident verts stay coincident and seams hold.
  const n = mesh.positions.length;
  const keyOf = (p: Vec3): string => {
    const q = 1e5; // ~1e-5 world-units weld tolerance
    return `${Math.round(p.x * q)},${Math.round(p.y * q)},${Math.round(p.z * q)}`;
  };
  const groups = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const k = keyOf(mesh.positions[i]!);
    let g = groups.get(k);
    if (!g) {
      g = [];
      groups.set(k, g);
    }
    g.push(i);
  }

  const positions = mesh.positions.map((p) => ({ ...p }));
  for (const idxs of groups.values()) {
    const p = mesh.positions[idxs[0]!]!;
    const d = noise.noise3(p.x * freq, p.y * freq, p.z * freq) * amount;
    // Averaged normal for the shared displacement direction.
    let nx = 0, ny = 0, nz = 0;
    for (const i of idxs) {
      const nrm = mesh.normals[i] ?? vec3(0, 1, 0);
      nx += nrm.x; ny += nrm.y; nz += nrm.z;
    }
    const nl = Math.hypot(nx, ny, nz) || 1;
    const disp = { x: (nx / nl) * d, y: (ny / nl) * d, z: (nz / nl) * d };
    const moved = add(p, disp);
    for (const i of idxs) positions[i] = { ...moved };
  }

  return recomputeNormals(
    makeMesh({
      positions,
      normals: mesh.normals.map((nrm) => ({ ...nrm })),
      uvs: mesh.uvs.map((uv) => ({ ...uv })),
      indices: mesh.indices.slice(),
    }),
  );
}

export interface ArrayOptions {
  count: number;
  axis?: "x" | "y" | "z";
  step?: number;
  offset?: Vec3;
}

/** Linear array: duplicate the mesh `count` times along an axis/offset. */
export function array(mesh: Mesh, opts: ArrayOptions): Mesh {
  const count = Math.max(1, Math.floor(opts.count));
  const step = opts.step ?? 1;
  const axis = opts.axis ?? "x";
  const base: Vec3 =
    opts.offset ??
    (axis === "x" ? vec3(step, 0, 0) : axis === "y" ? vec3(0, step, 0) : vec3(0, 0, step));
  const copies: Mesh[] = [];
  for (let i = 0; i < count; i++) copies.push(translateMesh(mesh, scale(base, i)));
  return merge(...copies);
}

export interface ScatterOptions {
  count: number;
  seed?: number;
  instanceScale?: number;
  alignToNormal?: boolean;
}

/**
 * Scatter copies of `instance` across the surface of `target`, area-weighted
 * so the distribution is uniform on the surface.
 */
export function scatterOnSurface(target: Mesh, instance: Mesh, opts: ScatterOptions): Mesh {
  const count = Math.max(0, Math.floor(opts.count));
  const rng = makeRng(opts.seed ?? 0);
  const instScale = opts.instanceScale ?? 1;
  const align = opts.alignToNormal ?? true;

  const triCount = target.indices.length / 3;
  const areas = new Float64Array(triCount);
  let total = 0;
  for (let t = 0; t < triCount; t++) {
    const a = target.positions[target.indices[t * 3]!]!;
    const b = target.positions[target.indices[t * 3 + 1]!]!;
    const c = target.positions[target.indices[t * 3 + 2]!]!;
    total += length(cross(sub(b, a), sub(c, a))) * 0.5;
    areas[t] = total;
  }
  if (total === 0) return merge();

  const placed: Mesh[] = [];
  for (let i = 0; i < count; i++) {
    const r = rng.next() * total;
    let lo = 0, hi = triCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (areas[mid]! < r) lo = mid + 1;
      else hi = mid;
    }
    const t = lo;
    const a = target.positions[target.indices[t * 3]!]!;
    const b = target.positions[target.indices[t * 3 + 1]!]!;
    const c = target.positions[target.indices[t * 3 + 2]!]!;
    let u = rng.next();
    let v = rng.next();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const point = add(add(a, scale(sub(b, a), u)), scale(sub(c, a), v));
    const faceN = normalize(cross(sub(b, a), sub(c, a)));
    let inst = instScale !== 1 ? scaleMeshLocal(instance, instScale) : instance;
    if (align) inst = alignYTo(inst, faceN);
    placed.push(translateMesh(inst, point));
  }
  return placed.length ? merge(...placed) : merge();
}

function scaleMeshLocal(mesh: Mesh, s: number): Mesh {
  return makeMesh({
    positions: mesh.positions.map((p) => scale(p, s)),
    normals: mesh.normals.map((n) => ({ ...n })),
    uvs: mesh.uvs.map((uv) => ({ ...uv })),
    indices: mesh.indices.slice(),
  });
}

/** Rotate a mesh so its +Y axis aligns to the target direction (Rodrigues). */
function alignYTo(mesh: Mesh, dir: Vec3): Mesh {
  const up = vec3(0, 1, 0);
  const d = normalize(dir);
  const c = dot(up, d);
  if (c > 0.9999) return mesh;
  if (c < -0.9999) {
    return makeMesh({
      positions: mesh.positions.map((p) => vec3(p.x, -p.y, p.z)),
      normals: mesh.normals.map((n) => vec3(n.x, -n.y, n.z)),
      uvs: mesh.uvs.map((uv) => ({ ...uv })),
      indices: mesh.indices.slice(),
    });
  }
  const axis = normalize(cross(up, d));
  const angle = Math.acos(c);
  const rot = (p: Vec3): Vec3 => {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    return add(
      add(scale(p, cosA), scale(cross(axis, p), sinA)),
      scale(axis, dot(axis, p) * (1 - cosA)),
    );
  };
  return makeMesh({
    positions: mesh.positions.map(rot),
    normals: mesh.normals.map(rot),
    uvs: mesh.uvs.map((uv) => ({ ...uv })),
    indices: mesh.indices.slice(),
  });
}

export interface SelectOptions {
  normalAxis?: Vec3;
  normalThreshold?: number;
  heightAxis?: Vec3;
  heightMin?: number;
  heightMax?: number;
}

/** Select faces by attribute (normal direction or height band) -> new mesh. */
export function selectByAttr(mesh: Mesh, opts: SelectOptions): Mesh {
  const triCount = mesh.indices.length / 3;
  const keepTris: number[] = [];
  const nAxis = opts.normalAxis ? normalize(opts.normalAxis) : null;
  const nThresh = opts.normalThreshold ?? 0.5;
  const hAxis = opts.heightAxis ? normalize(opts.heightAxis) : null;

  for (let t = 0; t < triCount; t++) {
    const a = mesh.positions[mesh.indices[t * 3]!]!;
    const b = mesh.positions[mesh.indices[t * 3 + 1]!]!;
    const c = mesh.positions[mesh.indices[t * 3 + 2]!]!;
    const faceN = normalize(cross(sub(b, a), sub(c, a)));
    let keep = true;
    if (nAxis) keep = keep && dot(faceN, nAxis) >= nThresh;
    if (hAxis) {
      const centroid = scale(add(add(a, b), c), 1 / 3);
      const h = dot(centroid, hAxis);
      if (opts.heightMin !== undefined) keep = keep && h >= opts.heightMin;
      if (opts.heightMax !== undefined) keep = keep && h <= opts.heightMax;
    }
    if (keep) keepTris.push(t);
  }

  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: { x: number; y: number }[] = [];
  const indices: number[] = [];
  const remap = new Map<number, number>();
  const pushVert = (old: number): number => {
    const ex = remap.get(old);
    if (ex !== undefined) return ex;
    const idx = positions.length;
    positions.push({ ...mesh.positions[old]! });
    normals.push({ ...mesh.normals[old]! });
    uvs.push({ ...mesh.uvs[old]! });
    remap.set(old, idx);
    return idx;
  };
  for (const t of keepTris) {
    indices.push(
      pushVert(mesh.indices[t * 3]!),
      pushVert(mesh.indices[t * 3 + 1]!),
      pushVert(mesh.indices[t * 3 + 2]!),
    );
  }
  return makeMesh({ positions, normals, uvs, indices });
}

/**
 * Per-face extrude along face normals by `distance`, building side walls so
 * each face becomes a solid prism. Good for paneling/greebles.
 */
export function extrude(mesh: Mesh, distance = 0.1): Mesh {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: { x: number; y: number }[] = [];
  const indices: number[] = [];
  const triCount = mesh.indices.length / 3;

  for (let t = 0; t < triCount; t++) {
    const ia = mesh.indices[t * 3]!;
    const ib = mesh.indices[t * 3 + 1]!;
    const ic = mesh.indices[t * 3 + 2]!;
    const a = mesh.positions[ia]!;
    const b = mesh.positions[ib]!;
    const c = mesh.positions[ic]!;
    // Use the stored vertex normals (averaged) for extrude direction so it
    // matches the authored surface orientation, not raw winding.
    const na = mesh.normals[ia]!;
    const nb = mesh.normals[ib]!;
    const nc = mesh.normals[ic]!;
    const faceN = normalize(
      vec3((na.x + nb.x + nc.x) / 3, (na.y + nb.y + nc.y) / 3, (na.z + nb.z + nc.z) / 3),
    );
    const off = scale(faceN, distance);
    const a2 = add(a, off);
    const b2 = add(b, off);
    const c2 = add(c, off);
    const base = positions.length;
    positions.push(a2, b2, c2);
    normals.push(faceN, faceN, faceN);
    uvs.push({ ...mesh.uvs[ia]! }, { ...mesh.uvs[ib]! }, { ...mesh.uvs[ic]! });
    indices.push(base, base + 1, base + 2);
    const ring: ReadonlyArray<readonly [Vec3, Vec3, Vec3, Vec3]> = [
      [a, b, b2, a2],
      [b, c, c2, b2],
      [c, a, a2, c2],
    ];
    for (const [p0, p1, p2, p3] of ring) {
      const sN = normalize(cross(sub(p1, p0), sub(p3, p0)));
      const s = positions.length;
      positions.push(p0, p1, p2, p3);
      normals.push(sN, sN, sN, sN);
      uvs.push({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 });
      indices.push(s, s + 1, s + 2, s, s + 2, s + 3);
    }
  }
  return makeMesh({ positions, normals, uvs, indices });
}
