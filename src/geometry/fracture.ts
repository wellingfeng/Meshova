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
import { vec3, add, sub, scale, normalize, length, cross, type Vec3 } from "../math/vec3.js";
import type { Mat4 } from "../math/mat4.js";
import { box } from "./primitives.js";
import { applyMatrix } from "./transform.js";
import { intersect, subtractAll } from "./boolean.js";
import { bounds, type Mesh } from "./mesh.js";
import { makeRng } from "../random/prng.js";

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
}

export interface Fragment {
  /** The fragment mesh. */
  mesh: Mesh;
  /** The seed point this fragment grew from (its Voronoi site). */
  site: Vec3;
  /** Fragment centroid (approx, = site clamped into the mesh bounds). */
  center: Vec3;
}

/** A half-space cutter block whose inner face lies on plane (point, normal). */
function halfSpaceBlock(planePoint: Vec3, normal: Vec3, size: number): Mesh {
  // Build a big box, place its -Z face on the plane, extending toward +normal
  // (the region to REMOVE). We orient local +Z to `normal`.
  const n = normalize(normal);
  let x = cross(vec3(0, 1, 0), n);
  if (length(x) < 1e-6) x = cross(vec3(1, 0, 0), n);
  x = normalize(x);
  const y = normalize(cross(n, x));
  // Box centred so its near face sits on the plane: offset centre by size/2 along n.
  const c = add(planePoint, scale(n, size / 2));
  const s = size;
  const mat = new Float32Array([
    x.x * s, x.y * s, x.z * s, 0,
    y.x * s, y.y * s, y.z * s, 0,
    n.x * s, n.y * s, n.z * s, 0,
    c.x, c.y, c.z, 1,
  ]) as Mat4;
  return applyMatrix(box(1, 1, 1), mat);
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

/**
 * Fracture a solid mesh into Voronoi fragments. Returns one Fragment per seed;
 * empty-geometry cells (rare, when a seed lands outside) are dropped.
 */
export function voronoiFracture(mesh: Mesh, opts: FractureOptions): Fragment[] {
  if (mesh.indices.length === 0 || opts.cells < 1) return [];
  const seeds = scatterSeeds(mesh, opts);
  const b = bounds(mesh);
  const diag = length(sub(b.max, b.min));
  const blockSize = Math.max(diag * 2.5, 1);

  const fragments: Fragment[] = [];
  for (let i = 0; i < seeds.length; i++) {
    const si = seeds[i]!;
    // Build the Voronoi cell of seed i: intersect the mesh with all half-spaces
    // {x : (x - mid)·(sj - si) <= 0} for every other seed j. We remove the far
    // side by subtracting a block on the +（sj-si) side of each bisector.
    const cutters: Mesh[] = [];
    for (let j = 0; j < seeds.length; j++) {
      if (j === i) continue;
      const sj = seeds[j]!;
      const dir = sub(sj, si);
      const d = length(dir);
      if (d < 1e-6) continue;
      const mid = scale(add(si, sj), 0.5);
      cutters.push(halfSpaceBlock(mid, dir, blockSize));
    }
    // cell = mesh - (all far half-spaces)
    const cell = cutters.length > 0 ? subtractAll(mesh, cutters) : mesh;
    if (cell.indices.length === 0) continue;
    fragments.push({ mesh: cell, site: si, center: si });
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
  /** Spread radius of the settled pile. */
  spread?: number;
}

/**
 * Deterministically settle fragments into a loose pile — a stand-in for the
 * HDA's RBD Bullet sim (no physics). Fragments are dropped onto a spiral and
 * stacked by index so the result reads as a rubble heap. Same seed -> same pile.
 */
export function stackFragments(fragments: Fragment[], opts: StackOptions = {}): Mesh[] {
  const rng = makeRng((opts.seed ?? 0) >>> 0);
  const groundY = opts.groundY ?? 0;
  const spread = opts.spread ?? 1;
  const yawJitter = opts.yawJitter ?? Math.PI;
  const placed: Mesh[] = [];
  const n = fragments.length;
  for (let i = 0; i < n; i++) {
    const frag = fragments[i]!;
    const b = bounds(frag.mesh);
    const h = b.max.y - b.min.y;
    // spiral position
    const ang = i * 2.399963; // golden angle
    const rad = spread * Math.sqrt(i / Math.max(1, n));
    const px = Math.cos(ang) * rad + rng.range(-0.05, 0.05);
    const pz = Math.sin(ang) * rad + rng.range(-0.05, 0.05);
    const layer = Math.floor(i / Math.max(1, Math.ceil(Math.sqrt(n))));
    const py = groundY + layer * h * 0.6 - b.min.y;
    const yaw = rng.range(-yawJitter, yawJitter);
    const c = frag.center;
    // rotate around Y about the fragment centre, then translate to target.
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const mat = new Float32Array([
      cs, 0, -sn, 0,
      0, 1, 0, 0,
      sn, 0, cs, 0,
      px + c.x - (cs * c.x - sn * c.z),
      py,
      pz + c.z - (sn * c.x + cs * c.z),
      1,
    ]) as Mat4;
    placed.push(applyMatrix(frag.mesh, mat));
  }
  return placed;
}
