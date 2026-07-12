/**
 * Titan Stacking — reverse-engineered from Houdini "Titan_StackingTool.hda"
 * (project_titan). The HDA Voronoi-fractures an object, then drops the shards
 * with an RBD Bullet sim (Min/Max Angle Rotation, Min/Max Scale, Velocity,
 * "enable sim") so they settle into a pile.
 *
 * Meshova does not run physics (out of scope by design), so we keep the real
 * part — the deterministic Voronoi fracture (`voronoiFracture`) — and replace
 * the Bullet solve with `stackFragments`, a deterministic golden-angle spiral
 * that settles shards into a rubble heap. Same seed -> same pile, every run.
 *
 * Run: pnpm tsx examples/titan-stacking.ts
 */
import {
  box,
  bounds,
  merge,
  translateMesh,
  voronoiFracture,
  stackFragments,
  type Fragment,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { makeRng } from "../random/prng.js";

type RGB = [number, number, number];

const STONE: RGB = [0.5, 0.48, 0.45];
const STONE_DARK: RGB = [0.38, 0.36, 0.33];

export interface TitanStackingParams {
  /** Source block size (the thing that gets fractured). */
  blockSize: [number, number, number];
  /** Number of Voronoi shards (HDA cell count). */
  shards: number;
  /** Fracture seed. */
  fractureSeed: number;
  /** Placement seed for the settled pile. */
  stackSeed: number;
  /** Pile spread radius. */
  spread: number;
  /** Max yaw jitter per shard (radians). HDA Max Angle Rotation. */
  yawJitter: number;
  /** Bias fracture toward an impact point (0 = uniform). */
  focusBias: number;
  /** Stone surface roughening (fraction of block diagonal). 0 = clean cut. */
  roughen: number;
  /** Per-piece random scale min, matching the HDA Min Scale control. */
  minScale: number;
  /** Per-piece random scale max, matching the HDA Max Scale control. */
  maxScale: number;
}

export const TITAN_STACKING_DEFAULTS: TitanStackingParams = {
  blockSize: [3, 3, 3],
  shards: 12,
  fractureSeed: 5,
  stackSeed: 2,
  spread: 2.2,
  yawJitter: Math.PI,
  focusBias: 0,
  roughen: 0.06,
  minScale: 0.2,
  maxScale: 1,
};

function scaleAround(mesh: Mesh, center: { x: number; y: number; z: number }, s: number): Mesh {
  return {
    positions: mesh.positions.map((p) => ({
      x: center.x + (p.x - center.x) * s,
      y: center.y + (p.y - center.y) * s,
      z: center.z + (p.z - center.z) * s,
    })),
    normals: mesh.normals.slice(),
    uvs: mesh.uvs.slice(),
    indices: mesh.indices.slice(),
  };
}

function scaleFragments(fragments: Fragment[], p: TitanStackingParams): Fragment[] {
  const lo = Math.max(0.01, Math.min(p.minScale, p.maxScale));
  const hi = Math.max(lo, Math.max(p.minScale, p.maxScale));
  const rng = makeRng((p.stackSeed ^ 0x9e3779b9) >>> 0);
  return fragments.map((frag) => {
    const s = rng.range(lo, hi);
    return { ...frag, mesh: scaleAround(frag.mesh, frag.center, s) };
  });
}

function settleUnsupportedFragments(meshes: Mesh[], groundY = 0, tolerance = 0.04): Mesh[] {
  const order = meshes
    .map((mesh, index) => ({ index, mesh, bounds: bounds(mesh) }))
    .sort((a, b) => a.bounds.min.y - b.bounds.min.y);
  const settled: Array<{ mesh: Mesh; bounds: ReturnType<typeof bounds> }> = [];
  const result = meshes.slice();

  for (const item of order) {
    const boxNow = item.bounds;
    let targetY = groundY;
    let touching = boxNow.min.y <= groundY + tolerance;
    for (const below of settled) {
      const overlapX = boxNow.min.x <= below.bounds.max.x && boxNow.max.x >= below.bounds.min.x;
      const overlapZ = boxNow.min.z <= below.bounds.max.z && boxNow.max.z >= below.bounds.min.z;
      if (!overlapX || !overlapZ || below.bounds.min.y > boxNow.min.y) continue;
      if (boxNow.min.y <= below.bounds.max.y + tolerance) touching = true;
      if (below.bounds.max.y <= boxNow.min.y) targetY = Math.max(targetY, below.bounds.max.y);
    }
    const mesh = touching ? item.mesh : translateMesh(item.mesh, { x: 0, y: targetY - boxNow.min.y, z: 0 });
    const next = { mesh, bounds: bounds(mesh) };
    settled.push(next);
    result[item.index] = mesh;
  }
  return result;
}

export function buildTitanStackingParts(params: Partial<TitanStackingParams> = {}): NamedPart[] {
  const p: TitanStackingParams = { ...TITAN_STACKING_DEFAULTS, ...params };
  const [bx, by, bz] = p.blockSize;
  const src = box(bx, by, bz);

  const frags = voronoiFracture(src, {
    cells: p.shards,
    seed: p.fractureSeed,
    focusBias: p.focusBias,
    roughen: p.roughen,
  });
  const placed = settleUnsupportedFragments(stackFragments(scaleFragments(frags, p), {
    seed: p.stackSeed,
    spread: p.spread,
    yawJitter: p.yawJitter,
    groundY: 0,
  }));

  // Split shards into two colour groups (alternating) so the pile reads as
  // mixed rubble rather than one flat mass.
  const groupA = placed.filter((_, i) => i % 2 === 0);
  const groupB = placed.filter((_, i) => i % 2 === 1);

  return [
    {
      name: "rubble_a",
      label: "碎块A",
      mesh: merge(...groupA),
      color: STONE,
      surface: { type: "concrete", params: { color: STONE, roughness: 0.95 } },
      metadata: { source: "Titan_StackingTool.hda", method: "voronoi fracture + deterministic pile (no RBD)" },
    },
    {
      name: "rubble_b",
      label: "碎块B",
      mesh: merge(...groupB),
      color: STONE_DARK,
      surface: { type: "concrete", params: { color: STONE_DARK, roughness: 0.95 } },
    },
  ].filter((part) => part.mesh.positions.length > 0) as NamedPart[];
}
