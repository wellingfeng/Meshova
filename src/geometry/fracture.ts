/**
 * Voronoi fracture — reverse-engineered from the Voronoi Fracture SOP used in
 * Houdini "Titan_StackingTool.hda" / "Tutorial_platform.hda" (project_titan).
 *
 * Houdini scatters points inside a solid and builds each fragment as the
 * Voronoi cell of a point clipped to the mesh. We reproduce that with the
 * project's own BSP CSG (boolean.ts): for each seed, a large block is clipped by
 * the perpendicular-bisector half-space against every other seed (so it becomes
 * that seed's Voronoi cell), then intersected with the source mesh. The result
 * is a set of convex-ish fragments that tile the original solid.
 *
 * Deterministic: seed points come from a seeded RNG; same seed -> same shards.
 * This is geometry only — no physics. The stacking tool's RBD sim is replaced by
 * a deterministic placement helper (`stackFragments`).
 */
import { vec3, add, sub, scale, normalize, length, cross, dot, type Vec3 } from "../math/vec3.js";
import type { Mat4 } from "../math/mat4.js";
import { chain, rotationX, rotationY, rotationZ, translation } from "../math/mat4.js";
import { applyMatrix } from "./transform.js";
import { subdivide } from "./ops.js";
import { bounds, makeMesh, computeNormals, type Mesh, type Bounds } from "./mesh.js";
import { makeRng } from "../random/prng.js";
import { makeNoise, fbm3, type Noise } from "../random/noise.js";

export interface FractureOptions {
  /** Number of Voronoi cells / fragments. */
  cells: number;
  /** Seed for deterministic scatter. */
  seed?: number;
  /**
   * Bias seed scatter toward this point (e.g. an impact point). 0 = uniform.
   * 1 = all seeds clustered near `focus`. Default 0.
   */
  focusBias?: number;
  /** Impact focus point in mesh space (used when focusBias > 0). */
  focus?: Vec3;
  /**
   * Displace each shard's surface by layered fbm noise so shards read as stone
   * (chipped, pitted) rather than clean-cut concrete blocks. Fraction of the
   * source diagonal. 0 = clean CSG cut. Default 0.
   */
  roughen?: number;
  /**
   * Cusp angle (deg) for shard normals. Low = hard faceted stone read; 180 =
   * fully smooth. Default 25 (faceted).
   */
  cusp?: number;
}

/**
 * Push a shard's vertices along their direction from the shard centroid by
 * layered fbm noise, so a clean CSG cell reads as pitted stone. Deterministic:
 * noise is seeded and sampled at world position, so shared cut faces of
 * neighbouring shards displace consistently (no gaps opening between shards).
 */
function roughenShard(mesh: Mesh, noise: Noise, amp: number): Mesh {
  if (amp <= 0) return mesh;
  const positions = mesh.positions.map((p) => {
    // Sample fbm at the vertex position (world-stable) for large pits, plus a
    // higher-frequency term for fine chips.
    const big = fbm3(noise, p.x * 1.1, p.y * 1.1, p.z * 1.1, { octaves: 3 });
    const fine = noise.noise3(p.x * 5.5, p.y * 5.5, p.z * 5.5);
    const d = amp * (0.7 * big + 0.3 * fine);
    // Displace along a stable pseudo-normal (position direction); shards share
    // vertices along cut planes so identical positions displace identically.
    const dir = length(p) > 1e-6 ? normalize(p) : vec3(0, 1, 0);
    return add(p, scale(dir, d));
  });
  return makeMesh({ positions, normals: mesh.normals.slice(), uvs: mesh.uvs.slice(), indices: mesh.indices.slice() });
}

export interface Fragment {
  /** The fragment mesh. */
  mesh: Mesh;
  /** The seed point this fragment grew from (its Voronoi site). */
  site: Vec3;
  /** Fragment centroid (approx, = site clamped into the mesh bounds). */
  center: Vec3;
}

/** Scatter deterministic seed points inside the mesh bounding box. */
function scatterSeeds(m: Mesh, opts: FractureOptions): Vec3[] {
  const b = bounds(m);
  const rng = makeRng((opts.seed ?? 0) >>> 0);
  const focus = opts.focus ?? scale(add(b.min, b.max), 0.5);
  const bias = Math.min(1, Math.max(0, opts.focusBias ?? 0));
  const seeds: Vec3[] = [];
  for (let i = 0; i < opts.cells; i++) {
    const rx = b.min.x + rng.next() * (b.max.x - b.min.x);
    const ry = b.min.y + rng.next() * (b.max.y - b.min.y);
    const rz = b.min.z + rng.next() * (b.max.z - b.min.z);
    const uniform = vec3(rx, ry, rz);
    seeds.push(bias > 0 ? add(scale(uniform, 1 - bias), scale(focus, bias)) : uniform);
  }
  return seeds;
}

type CellFace = Vec3[];

function boxFaces(b: Bounds): CellFace[] {
  const { min, max } = b;
  return [
    [vec3(max.x, min.y, max.z), vec3(max.x, min.y, min.z), vec3(max.x, max.y, min.z), vec3(max.x, max.y, max.z)],
    [vec3(min.x, min.y, min.z), vec3(min.x, min.y, max.z), vec3(min.x, max.y, max.z), vec3(min.x, max.y, min.z)],
    [vec3(min.x, max.y, max.z), vec3(max.x, max.y, max.z), vec3(max.x, max.y, min.z), vec3(min.x, max.y, min.z)],
    [vec3(min.x, min.y, min.z), vec3(max.x, min.y, min.z), vec3(max.x, min.y, max.z), vec3(min.x, min.y, max.z)],
    [vec3(min.x, min.y, max.z), vec3(max.x, min.y, max.z), vec3(max.x, max.y, max.z), vec3(min.x, max.y, max.z)],
    [vec3(max.x, min.y, min.z), vec3(min.x, min.y, min.z), vec3(min.x, max.y, min.z), vec3(max.x, max.y, min.z)],
  ];
}

function pushUnique(points: Vec3[], p: Vec3): void {
  const q = 1e5;
  const kx = Math.round(p.x * q);
  const ky = Math.round(p.y * q);
  const kz = Math.round(p.z * q);
  for (const e of points) {
    if (Math.round(e.x * q) === kx && Math.round(e.y * q) === ky && Math.round(e.z * q) === kz) return;
  }
  points.push(p);
}

function clipFace(face: CellFace, n: Vec3, w: number, capPoints: Vec3[]): CellFace {
  if (face.length < 3) return [];
  const out: Vec3[] = [];
  for (let i = 0; i < face.length; i++) {
    const a = face[i]!;
    const b = face[(i + 1) % face.length]!;
    const da = dot(n, a) - w;
    const db = dot(n, b) - w;
    const aIn = da <= 1e-6;
    const bIn = db <= 1e-6;
    if (aIn && bIn) {
      out.push(b);
    } else if (aIn && !bIn) {
      const t = da / (da - db);
      const p = add(a, scale(sub(b, a), t));
      out.push(p);
      pushUnique(capPoints, p);
    } else if (!aIn && bIn) {
      const t = da / (da - db);
      const p = add(a, scale(sub(b, a), t));
      out.push(p, b);
      pushUnique(capPoints, p);
    }
  }
  return out.length >= 3 ? out : [];
}

function capFace(points: Vec3[], normal: Vec3): CellFace {
  if (points.length < 3) return [];
  let cx = 0, cy = 0, cz = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
    cz += p.z;
  }
  const center = vec3(cx / points.length, cy / points.length, cz / points.length);
  const n = normalize(normal);
  const ref = Math.abs(n.y) < 0.9 ? vec3(0, 1, 0) : vec3(1, 0, 0);
  const tangent = normalize(cross(ref, n));
  const bitangent = normalize(cross(n, tangent));
  const sorted = points
    .slice()
    .sort((a, b) => Math.atan2(dot(sub(a, center), bitangent), dot(sub(a, center), tangent)) -
      Math.atan2(dot(sub(b, center), bitangent), dot(sub(b, center), tangent)));
  const faceN = cross(sub(sorted[1]!, sorted[0]!), sub(sorted[2]!, sorted[0]!));
  if (dot(faceN, n) < 0) sorted.reverse();
  return sorted;
}

function clipCell(faces: CellFace[], n: Vec3, w: number): CellFace[] {
  const capPoints: Vec3[] = [];
  const clipped: CellFace[] = [];
  for (const face of faces) {
    const out = clipFace(face, n, w, capPoints);
    if (out.length >= 3) clipped.push(out);
  }
  const cap = capFace(capPoints, n);
  if (cap.length >= 3) clipped.push(cap);
  return clipped;
}

function meshFromCell(faces: CellFace[]): Mesh {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: { x: number; y: number }[] = [];
  const indices: number[] = [];
  for (const face of faces) {
    if (face.length < 3) continue;
    const base = positions.length;
    const n = normalize(cross(sub(face[1]!, face[0]!), sub(face[2]!, face[0]!)));
    for (const p of face) {
      positions.push(p);
      normals.push(n);
      uvs.push({ x: p.x, y: p.z });
    }
    for (let i = 1; i < face.length - 1; i++) {
      const area = length(cross(sub(face[i]!, face[0]!), sub(face[i + 1]!, face[0]!)));
      if (area > 1e-8) indices.push(base, base + i, base + i + 1);
    }
  }
  return makeMesh({ positions, normals, uvs, indices });
}

function meshCentroid(mesh: Mesh): Vec3 {
  if (mesh.positions.length === 0) return vec3(0, 0, 0);
  let x = 0, y = 0, z = 0;
  for (const p of mesh.positions) {
    x += p.x;
    y += p.y;
    z += p.z;
  }
  const inv = 1 / mesh.positions.length;
  return vec3(x * inv, y * inv, z * inv);
}

/**
 * Fracture a solid mesh into Voronoi fragments. Returns one Fragment per seed;
 * empty-geometry cells (rare, when a seed lands outside) are dropped.
 */
export function voronoiFracture(mesh: Mesh, opts: FractureOptions): Fragment[] {
  if (mesh.indices.length === 0 || opts.cells < 1) return [];
  const seeds = scatterSeeds(mesh, opts);
  const b = bounds(mesh);
  const diag = length(sub(b.max, b.min));
  const roughen = (opts.roughen ?? 0) * diag;
  const cusp = opts.cusp ?? 25;
  const noise = makeNoise((opts.seed ?? 0) >>> 0);

  const fragments: Fragment[] = [];
  for (let i = 0; i < seeds.length; i++) {
    const si = seeds[i]!;
    // Build the Voronoi cell of seed i directly as a convex polyhedron clipped
    // by every bisector half-space. This avoids feeding many overlapping
    // half-space boxes into BSP CSG, which degenerates into near-full source
    // copies for the Titan stacking case.
    let faces = boxFaces(b);
    for (let j = 0; j < seeds.length; j++) {
      if (j === i) continue;
      const sj = seeds[j]!;
      const dir = sub(sj, si);
      const d = length(dir);
      if (d < 1e-6) continue;
      const mid = scale(add(si, sj), 0.5);
      faces = clipCell(faces, dir, dot(dir, mid));
      if (faces.length === 0) break;
    }
    let cell = meshFromCell(faces);
    if (cell.indices.length === 0) continue;
    // Add stone surface detail, then facet the normals for a hard stony read.
    if (roughen > 0) cell = roughenShard(subdivide(cell, 2), noise, roughen);
    cell = computeNormals(cell, cusp);
    fragments.push({ mesh: cell, site: si, center: meshCentroid(cell) });
  }
  return fragments;
}

export interface StackOptions {
  /** Ground Y the stack rests on. */
  groundY?: number;
  /** Deterministic seed for placement jitter. */
  seed?: number;
  /** Max yaw jitter per fragment (radians). */
  yawJitter?: number;
  /** Max pitch/roll jitter per fragment (radians). */
  tiltJitter?: number;
  /** Spread radius of the settled pile. */
  spread?: number;
}

/**
 * Deterministically settle fragments into a rubble mound — a stand-in for the
 * HDA's RBD Bullet sim (Meshova runs no physics). Approach: height-field
 * deposition (like a sandpile). We keep a 2D ground-height grid over the spread
 * area; each shard (largest first) is yaw-jittered, then we test several
 * candidate XZ positions and pick the one whose required rest height (the max
 * ground height under its footprint) is LOWEST. That fills valleys, so shards
 * spread out and pack into a low mound instead of towering in one column. After
 * placing, the shard's top height is stamped back into the covered cells.
 * Deterministic: candidates come from the seeded RNG. Same seed -> same pile.
 */
export function stackFragments(fragments: Fragment[], opts: StackOptions = {}): Mesh[] {
  const rng = makeRng((opts.seed ?? 0) >>> 0);
  const groundY = opts.groundY ?? 0;
  const spread = opts.spread ?? 1;
  const yawJitter = opts.yawJitter ?? Math.PI;
  const tiltJitter = opts.tiltJitter ?? Math.PI * 0.55;
  const placed: Mesh[] = [];

  // Ground-height grid covering [-half, half] in X and Z (spread + margin).
  const half = spread + 1.5;
  const res = 48;
  const cell = (2 * half) / res;
  const height = new Float32Array(res * res).fill(groundY);
  const gi = (v: number): number => {
    const idx = Math.floor((v + half) / cell);
    return idx < 0 ? 0 : idx >= res ? res - 1 : idx;
  };
  // Max ground height under an XZ AABB.
  const maxUnder = (minx: number, maxx: number, minz: number, maxz: number): number => {
    let m = groundY;
    for (let gx = gi(minx); gx <= gi(maxx); gx++) {
      for (let gz = gi(minz); gz <= gi(maxz); gz++) {
        const h = height[gx * res + gz]!;
        if (h > m) m = h;
      }
    }
    return m;
  };
  const stamp = (minx: number, maxx: number, minz: number, maxz: number, top: number): void => {
    for (let gx = gi(minx); gx <= gi(maxx); gx++) {
      for (let gz = gi(minz); gz <= gi(maxz); gz++) {
        const k = gx * res + gz;
        if (top > height[k]!) height[k] = top;
      }
    }
  };

  // Drop larger shards first so big blocks form the base and small chips settle
  // into the gaps on top — matches how real rubble sorts.
  const order = fragments
    .map((frag, i) => {
      const b = bounds(frag.mesh);
      const vol = (b.max.x - b.min.x) * (b.max.y - b.min.y) * (b.max.z - b.min.z);
      return { i, vol };
    })
    .sort((a, b) => b.vol - a.vol);

  for (const { i } of order) {
    const frag = fragments[i]!;
    const c = frag.center;
    const yaw = rng.range(-yawJitter, yawJitter);
    const pitch = rng.range(-tiltJitter, tiltJitter);
    const roll = rng.range(-tiltJitter, tiltJitter);

    const buildMat = (tx: number, tz: number, ty: number): Mat4 =>
      chain(
        translation(vec3(c.x + tx, c.y + ty, c.z + tz)),
        rotationZ(roll),
        rotationY(yaw),
        rotationX(pitch),
        translation(scale(c, -1)),
      );

    // Read the rotated footprint once (translation doesn't change its size).
    const b0 = bounds(applyMatrix(frag.mesh, buildMat(0, 0, 0)));
    const halfW = (b0.max.x - b0.min.x) / 2;
    const halfD = (b0.max.z - b0.min.z) / 2;
    // Keep footprints inside the grid so big shards don't hang off the edge.
    const limX = Math.max(0, half - halfW - cell);
    const limZ = Math.max(0, half - halfD - cell);

    // Try candidate XZ centres; keep the one that rests lowest (valley filling),
    // biased slightly toward the centre so the mound stays compact.
    let best = { tx: 0, tz: 0, rest: Infinity, score: Infinity };
    const tries = 36;
    for (let t = 0; t < tries; t++) {
      const ang = rng.range(0, Math.PI * 2);
      const rad = spread * Math.sqrt(rng.next());
      const cx = Math.max(-limX, Math.min(limX, Math.cos(ang) * rad));
      const cz = Math.max(-limZ, Math.min(limZ, Math.sin(ang) * rad));
      const rest = maxUnder(cx - halfW, cx + halfW, cz - halfD, cz + halfD);
      // Lower rest height wins; centre bias breaks ties toward a tidy pile.
      const score = rest + 0.05 * Math.hypot(cx, cz);
      if (score < best.score) best = { tx: cx, tz: cz, rest, score };
    }

    // Bottom sits on the rest height, sunk a hair so shards nestle, not hover.
    const settle = best.rest - b0.min.y - (best.rest > groundY ? cell * 0.5 : 0);
    const mesh = applyMatrix(frag.mesh, buildMat(best.tx, best.tz, settle));
    const bf = bounds(mesh);
    stamp(bf.min.x, bf.max.x, bf.min.z, bf.max.z, bf.max.y);
    placed.push(mesh);
  }
  return placed;
}
