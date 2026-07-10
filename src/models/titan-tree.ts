/**
 * Titan Tree — reverse-engineered from "Tree_PivotPainter_Tutorial" (project_titan).
 * The Houdini tutorial builds a recursive branch skeleton then bakes each
 * branch's pivot + hierarchy into the PivotPainter texture so UE can wind-animate
 * per branch. We can't emit that texture, but we reproduce the SKELETON exactly:
 * a deterministic recursive tree where every branch records its pivot, parent
 * index and hierarchy level (the data PivotPainter would encode).
 *
 * Each branch is a tapered tube (cylinder) oriented along its growth heading;
 * children split off with a seeded cone-angle spread and shrink by `taper`.
 * Leaves are quads scattered at the tips of the last level. Same seed -> same
 * tree. Branch metadata (pivot/parent/level) is attached to the trunk part so a
 * PivotPainter exporter could consume it later.
 *
 * Run: pnpm tsx examples/titan-tree.ts
 */
import {
  cylinder,
  plane,
  merge,
  transform,
  translateMesh,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { vec3, add, scale, normalize, cross, length } from "../math/vec3.js";
import type { Vec3 } from "../math/vec3.js";
import { makeRng, type Rng } from "../random/index.js";

type RGB = [number, number, number];

const BARK: RGB = [0.28, 0.19, 0.12];
const LEAF: RGB = [0.22, 0.42, 0.16];

export interface TitanTreeParams {
  /** Random stream seed. Same seed => identical tree. Default 11. */
  seed: number;
  /** Recursion depth (levels of branching). Default 4. */
  levels: number;
  /** Trunk length (metres). Default 3. */
  trunkLength: number;
  /** Trunk base radius. Default 0.28. */
  trunkRadius: number;
  /** Children spawned per branch. Default 3. */
  branching: number;
  /** Length multiplier applied to each child vs its parent. Default 0.72. */
  taper: number;
  /** Spread half-angle of children off the parent heading, radians. Default 0.6. */
  spread: number;
  /** Seeded wobble added to each child heading (0 = tidy). Default 0.35. */
  wobble: number;
  /** Leaf quad size. 0 = bare. Default 0.4. */
  leafSize: number;
}

export const TITAN_TREE_DEFAULTS: TitanTreeParams = {
  seed: 11,
  levels: 4,
  trunkLength: 3,
  trunkRadius: 0.28,
  branching: 3,
  taper: 0.72,
  spread: 0.6,
  wobble: 0.35,
  leafSize: 0.4,
};

/** One PivotPainter branch record — the data the UE texture would bake. */
export interface BranchRecord {
  pivot: Vec3;
  heading: Vec3;
  parent: number;
  level: number;
}

/** Build an orthonormal basis with `heading` as the up axis. */
function basisFrom(heading: Vec3): { u: Vec3; v: Vec3; up: Vec3 } {
  const up = normalize(heading);
  let u = cross(vec3(0, 1, 0), up);
  if (length(u) < 1e-5) u = cross(vec3(1, 0, 0), up);
  u = normalize(u);
  const v = normalize(cross(up, u));
  return { u, v, up };
}

/** Tapered branch tube from `base` along `heading` for `len`, radius r0->r1. */
function branchTube(base: Vec3, heading: Vec3, len: number, r0: number, r1: number): Mesh {
  // cylinder is +Y aligned, centred; scale radius via two-ring not supported,
  // so approximate taper by averaging radius and orienting onto heading.
  const r = (r0 + r1) / 2;
  const seg = 8;
  const tube = cylinder(r, len, seg, true);
  const { up } = basisFrom(heading);
  // rotate +Y onto `up`, then translate so the base sits at `base`.
  // derive euler that maps Y->up: use yaw/pitch from up direction.
  const pitch = Math.acos(Math.max(-1, Math.min(1, up.y)));
  const yaw = Math.atan2(up.x, up.z);
  const centred = translateMesh(tube, vec3(0, len / 2, 0));
  const oriented = transform(centred, { rotate: vec3(pitch, yaw, 0) });
  return translateMesh(oriented, base);
}

/** A leaf quad centred at `pos`, facing roughly along `heading`. */
function leafQuad(pos: Vec3, heading: Vec3, size: number): Mesh {
  const up = normalize(heading);
  const pitch = Math.acos(Math.max(-1, Math.min(1, up.y)));
  const yaw = Math.atan2(up.x, up.z);
  const quad = plane(size, size, 1, 1);
  const oriented = transform(quad, { rotate: vec3(pitch, yaw, 0) });
  return translateMesh(oriented, pos);
}

interface TreeAccum {
  branches: Mesh[];
  leaves: Mesh[];
  records: BranchRecord[];
}

/** Recursively grow branches, recording pivots/hierarchy as we go. */
function grow(
  acc: TreeAccum,
  rng: Rng,
  p: TitanTreeParams,
  base: Vec3,
  heading: Vec3,
  len: number,
  radius: number,
  level: number,
  parent: number,
): void {
  const tipR = radius * 0.6;
  acc.branches.push(branchTube(base, heading, len, radius, tipR));
  const myIndex = acc.records.length;
  acc.records.push({ pivot: base, heading, parent, level });
  const tip = add(base, scale(normalize(heading), len));

  if (level >= p.levels) {
    if (p.leafSize > 0) {
      acc.leaves.push(leafQuad(tip, heading, p.leafSize));
    }
    return;
  }

  const { u, v, up } = basisFrom(heading);
  for (let i = 0; i < p.branching; i++) {
    const az = (i / p.branching) * Math.PI * 2 + rng.next() * p.wobble;
    const spread = p.spread * (0.6 + rng.next() * 0.8);
    // child heading = up tilted by `spread` toward the (u,v) azimuth
    const side = add(scale(u, Math.cos(az)), scale(v, Math.sin(az)));
    const childDir = normalize(add(scale(up, Math.cos(spread)), scale(side, Math.sin(spread))));
    grow(acc, rng, p, tip, childDir, len * p.taper, tipR, level + 1, myIndex);
  }
}

/** Build the Titan tree as bark + foliage parts. Trunk carries branch metadata. */
export function buildTitanTreeParts(params: Partial<TitanTreeParams> = {}): NamedPart[] {
  const p: TitanTreeParams = { ...TITAN_TREE_DEFAULTS, ...params };
  const rng = makeRng(p.seed);
  const acc: TreeAccum = { branches: [], leaves: [], records: [] };
  grow(acc, rng, p, vec3(0, 0, 0), vec3(0, 1, 0), p.trunkLength, p.trunkRadius, 1, -1);

  const parts: NamedPart[] = [
    {
      name: "bark",
      label: "枝干",
      mesh: merge(...acc.branches),
      color: BARK,
      surface: { type: "wood", params: { color: BARK, roughness: 0.85 } },
      metadata: {
        source: "Tree_PivotPainter_Tutorial",
        branches: acc.records.length,
        pivotPainter: acc.records.map((r) => ({
          pivot: [r.pivot.x, r.pivot.y, r.pivot.z],
          parent: r.parent,
          level: r.level,
        })),
      },
    },
  ];
  if (acc.leaves.length > 0) {
    parts.push({
      name: "foliage",
      label: "叶片",
      mesh: merge(...acc.leaves),
      color: LEAF,
      surface: { type: "foliage", params: { color: LEAF, roughness: 0.75 } },
    });
  }
  return parts;
}
