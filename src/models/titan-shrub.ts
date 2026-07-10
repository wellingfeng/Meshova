/**
 * Titan Shrub — reverse-engineered from Houdini "Tutorial_shrub.hda"
 * (project_titan). The HDA grows branch curves, remeshes an input volume,
 * scatters leaves from that volume (pointsfromvolume) with coverage / dry-leaf
 * ratio / min-max scale variation, and bends the whole thing. Controls seen:
 * branches, "Coverage leaves", "Dry leaves amount", Min/Max scale, Global Seed,
 * "Type shape", variation.
 *
 * We reproduce it procedurally and deterministically: N branch curves fan out
 * from the base within a cone, each swept to a tapered tube; leaves are small
 * quad cards scattered along the branches with seeded position/orientation/scale
 * jitter, and a `dryRatio` fraction tinted brown. No volume/remesh dependency —
 * the branch skeleton drives leaf placement directly.
 *
 * Run: pnpm tsx examples/titan-shrub.ts
 */
import {
  sweep,
  plane,
  polyline,
  smoothCurve,
  merge,
  transform,
  translateMesh,
  type Curve,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { vec3, add, scale as vscale, normalize, type Vec3 } from "../math/vec3.js";
import { makeRng, type Rng } from "../random/prng.js";

type RGB = [number, number, number];

const BRANCH: RGB = [0.28, 0.19, 0.11];
const LEAF: RGB = [0.24, 0.45, 0.18];
const LEAF_DRY: RGB = [0.55, 0.42, 0.16];

export interface TitanShrubParams {
  /** Number of primary branches fanning from the base. */
  branches: number;
  /** Height of the shrub (metres). */
  height: number;
  /** Cone half-angle the branches spread into (radians). */
  spread: number;
  /** Leaves scattered per branch (HDA "Coverage leaves"). */
  leavesPerBranch: number;
  /** Fraction of leaves tinted dry/brown (HDA "Dry leaves amount"). 0..1. */
  dryRatio: number;
  /** Leaf size min / max (HDA Min/Max scale). */
  leafMin: number;
  leafMax: number;
  /** Branch base radius. */
  branchRadius: number;
  /** Overall bend of the shrub toward +X (radians). */
  bend: number;
  /** Global seed (HDA "Global Seed"). */
  seed: number;
}

export const TITAN_SHRUB_DEFAULTS: TitanShrubParams = {
  branches: 7,
  height: 1.4,
  spread: 0.7,
  leavesPerBranch: 14,
  dryRatio: 0.2,
  leafMin: 0.12,
  leafMax: 0.26,
  branchRadius: 0.05,
  bend: 0.15,
  seed: 11,
};

/** One branch curve fanning from base into the cone, bending upward+outward. */
function branchCurve(p: TitanShrubParams, rng: Rng): Curve {
  const az = rng.range(0, Math.PI * 2);
  const tilt = rng.range(p.spread * 0.3, p.spread);
  const len = p.height * rng.range(0.7, 1.05);
  const dir = normalize(vec3(Math.cos(az) * Math.sin(tilt), Math.cos(tilt), Math.sin(az) * Math.sin(tilt)));
  const steps = 5;
  const pts: Vec3[] = [];
  let pos = vec3(0, 0.05, 0);
  let d = dir;
  for (let i = 0; i <= steps; i++) {
    pts.push(pos);
    // progressive bend toward +X and gravity droop at the tips
    const t = i / steps;
    d = normalize(add(d, vec3(p.bend * 0.3, -t * 0.15, 0)));
    pos = add(pos, vscale(d, len / steps));
  }
  return smoothCurve(polyline(pts), 3);
}

export function buildTitanShrubParts(params: Partial<TitanShrubParams> = {}): NamedPart[] {
  const p: TitanShrubParams = { ...TITAN_SHRUB_DEFAULTS, ...params };
  const rng = makeRng(Math.round(p.seed) >>> 0);

  const branchMeshes: Mesh[] = [];
  const leafGreen: Mesh[] = [];
  const leafDry: Mesh[] = [];
  const leafProto = plane(1, 1); // unit card, scaled per leaf

  for (let b = 0; b < p.branches; b++) {
    const curve = branchCurve(p, rng);
    branchMeshes.push(
      sweep(curve, {
        radius: p.branchRadius,
        sides: 5,
        caps: true,
        radiusAt: (t) => p.branchRadius * (1 - 0.8 * t), // taper to tip
      }),
    );
    // Scatter leaves along the branch's sampled points (skip the woody base).
    const pts = curve.points;
    for (let i = 0; i < p.leavesPerBranch; i++) {
      const f = rng.range(0.25, 1); // bias to outer branch
      const idx = Math.min(pts.length - 1, Math.floor(f * (pts.length - 1)));
      const at = pts[idx]!;
      const s = rng.range(p.leafMin, p.leafMax);
      const leaf = transform(leafProto, {
        rotate: vec3(rng.range(-1, 1), rng.range(0, Math.PI * 2), rng.range(-1, 1)),
        scale: s,
      });
      const placed = translateMesh(leaf, add(at, vec3(rng.range(-0.05, 0.05), rng.range(-0.02, 0.05), rng.range(-0.05, 0.05))));
      if (rng.next() < p.dryRatio) leafDry.push(placed);
      else leafGreen.push(placed);
    }
  }

  const parts: NamedPart[] = [
    {
      name: "branches",
      label: "枝干",
      mesh: merge(...branchMeshes),
      color: BRANCH,
      surface: { type: "bark", params: { color: BRANCH, roughness: 0.9 } },
    },
    {
      name: "leaves",
      label: "叶片",
      mesh: merge(...leafGreen),
      color: LEAF,
      surface: { type: "leaf", params: { color: LEAF, roughness: 0.6 } },
      metadata: { source: "Tutorial_shrub.hda" },
    },
  ];
  if (leafDry.length > 0) {
    parts.push({
      name: "dry_leaves",
      label: "枯叶",
      mesh: merge(...leafDry),
      color: LEAF_DRY,
      surface: { type: "leaf", params: { color: LEAF_DRY, roughness: 0.75 } },
    });
  }
  return parts.filter((part) => part.mesh.positions.length > 0);
}
