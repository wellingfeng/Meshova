/**
 * Growing tree — a deterministic time-slice of a finished tree.
 *
 * Ported from the "growing tree" Geometry-Nodes idea: a single `growth` factor
 * in [0,1] drives the whole plant. Blender's setup trims each final spline by a
 * SplineParameter threshold and lets Set-Curve-Radius fatten the survivors;
 * instances (leaves) pop in last. We do the same on Meshova's spline + sweep +
 * scatter kernel:
 *
 *   1. Build the *finished* skeleton once (trunk + recursive branches).
 *   2. Give every branch a "birth" time from its depth + attach height, so the
 *      trunk shoots up first, then first-order branches, then twigs.
 *   3. For the current `growth`, trim each branch curve by arc-length to its
 *      local age, fatten its radius with age, and drop branches not yet born.
 *   4. Scatter leaves only on tips that are mature enough, scaling leaf size by
 *      local maturity so the canopy fills in at the end.
 *
 * growth = 0 -> bare sprout, growth = 1 -> the exact finished `tree()`. Same
 * seed + same growth -> same mesh, every run.
 */
import { vec3, add, scale, sub, length } from "../math/vec3.js";
import type { Vec3 } from "../math/vec3.js";
import { clamp, smoothstep } from "../math/scalar.js";
import type { Curve } from "../geometry/curve.js";
import { polyline, curveLength } from "../geometry/curve.js";
import type { Mesh } from "../geometry/mesh.js";
import { merge } from "../geometry/mesh.js";
import { makeRng } from "../random/prng.js";
import { tree, type TreeOptions, type PlantResult } from "./plant.js";
import {
  branchesToMesh,
  sweepBarkTube,
  type BranchSegment,
  type BranchMeshOptions,
} from "./branch.js";
import { scatterLeaves, type ScatterLeavesOptions, type LeafShape } from "./leaf.js";

const clamp01 = (x: number) => clamp(x, 0, 1);

export interface GrowingTreeOptions extends TreeOptions {
  /** Overall growth stage in [0,1]. 0 = sprout, 1 = the finished tree. */
  growth?: number;
  /**
   * How much of the total growth window each recursion level waits before it
   * starts. depthDelay=0.5 means depth-1 branches begin at growth≈0.25 and
   * finish by growth≈0.75, twigs later still. Higher = more staggered growth.
   */
  depthDelay?: number;
  /**
   * Extra per-branch birth jitter from attach height (0..1). Branches higher up
   * the parent are born a little later, so growth sweeps up the tree.
   */
  heightDelay?: number;
  /** Growth fraction at which leaves start appearing (0..1). */
  leafStart?: number;
  /** Min local branch maturity before a tip grows leaves (0..1). */
  leafMaturity?: number;
}

/** Trim a curve to the first `frac` of its arc length (frac in [0,1]). */
export function trimCurve(curve: Curve, frac: number): Curve {
  const pts = curve.points;
  const f = clamp01(frac);
  if (pts.length < 2 || f >= 1) return polyline(pts, false);
  if (f <= 0) return polyline([pts[0]!, pts[0]!], false);

  const total = curveLength(curve);
  const target = total * f;
  const out: Vec3[] = [pts[0]!];
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const segLen = length(sub(b, a));
    if (acc + segLen >= target) {
      const t = segLen > 1e-9 ? (target - acc) / segLen : 0;
      out.push(add(a, scale(sub(b, a), t)));
      break;
    }
    out.push(b);
    acc += segLen;
  }
  if (out.length < 2) out.push(out[0]!);
  return polyline(out, false);
}

/** Per-branch growth timing, derived deterministically from the finished tree. */
interface BranchAge {
  seg: BranchSegment;
  /** Growth value at which this branch starts extending. */
  birth: number;
  /** Growth value at which this branch reaches full length. */
  mature: number;
}

/**
 * Assign each branch a birth/mature window from its depth and attach height.
 * Deeper + higher branches are born later, so `growth` visibly sweeps outward
 * and upward through the crown.
 */
function ageBranches(
  branches: BranchSegment[],
  depthDelay: number,
  heightDelay: number,
): BranchAge[] {
  const maxDepth = branches.reduce((m, b) => Math.max(m, b.depth), 0) || 1;
  // Trunk (depth 0) occupies the first slice; each level after waits longer.
  const levelSpan = depthDelay / (maxDepth + 1);
  return branches.map((seg) => {
    const depthStart = seg.depth === 0 ? 0 : levelSpan * seg.depth;
    // attachT along parent (0 base -> 1 tip) pushes birth a touch later.
    const hDelay = (seg.attachT ?? 0) * heightDelay * levelSpan;
    const birth = clamp01(depthStart + hDelay);
    // Each branch takes the remaining window (after birth) to reach full size,
    // but faster for deeper twigs so the tree fills in by growth = 1.
    const span = Math.max(0.12, (1 - birth) * (0.55 + 0.15 * (maxDepth - seg.depth)));
    const mature = clamp01(birth + span);
    return { seg, birth, mature };
  });
}

/** Local age (0..1) of one branch at the current global growth. */
function branchAgeAt(a: BranchAge, growth: number): number {
  if (growth <= a.birth) return 0;
  if (growth >= a.mature) return 1;
  return smoothstep(a.birth, a.mature, growth);
}

export interface GrowingTreeResult extends PlantResult {
  /** The growth value this snapshot was built at. */
  growth: number;
}

/**
 * Build one tree at growth stage `growth ∈ [0,1]`. The finished skeleton is
 * generated once, then trimmed/fattened per-branch for the requested stage.
 */
export function growingTree(opts: GrowingTreeOptions = {}): GrowingTreeResult {
  const growth = clamp01(opts.growth ?? 1);
  const depthDelay = opts.depthDelay ?? 0.6;
  const heightDelay = opts.heightDelay ?? 0.5;
  const leafStart = opts.leafStart ?? 0.55;
  const leafMaturity = opts.leafMaturity ?? 0.6;
  const seed = opts.seed ?? 1;

  // 1. Finished tree: reuse the whole authoring pipeline. We rebuild geometry
  //    from its branch list so growth controls the mesh, not just a scale.
  const treeOpts: TreeOptions = { ...opts, leaves: false };
  const full = tree(treeOpts);
  const finishedBranches = full.branches;

  // Fully grown: return the finished tree untouched (with leaves).
  if (growth >= 1) {
    const leaves = buildLeaves(finishedBranches, opts, 1);
    return { wood: full.wood, leaves, branches: finishedBranches, growth: 1 };
  }

  const height = opts.height ?? 4;
  const trunkRadius = opts.trunkRadius ?? 0.28;
  const barkUv = opts.barkUv ?? opts.authoring?.barkUv;

  const ages = ageBranches(finishedBranches, depthDelay, heightDelay);

  // 2. Trunk grows first: trim + fatten by its own age.
  const trunkAge = ages.find((a) => a.seg.depth === 0);
  const trunkGrow = trunkAge ? branchAgeAt(trunkAge, growth) : 1;
  const trunkFrac = 0.15 + 0.85 * trunkGrow; // never a zero-length stub
  const trunkSeg = finishedBranches.find((b) => b.depth === 0);
  const trunkCurve = trunkSeg ? trimCurve(trunkSeg.curve, trunkFrac) : polyline([vec3(0, 0, 0), vec3(0, height * trunkFrac, 0)]);
  const trunkR = trunkRadius * (0.35 + 0.65 * trunkGrow);
  const trunkSweep = {
    sides: 8,
    radius: trunkR,
    radiusAt: (t: number) => (1 - t) * 1 + t * 0.3,
    caps: true,
  };
  const trunkMesh = barkUv
    ? sweepBarkTube(trunkCurve, { ...trunkSweep, barkUv: barkUv === true ? {} : barkUv })
    : sweepBarkTube(trunkCurve, trunkSweep);

  // 3. Branches: keep only those already born; trim + shrink by local age.
  const liveBranches: BranchSegment[] = [];
  for (const a of ages) {
    if (a.seg.depth === 0) continue; // trunk handled above
    const age = branchAgeAt(a, growth);
    if (age <= 0.001) continue;
    const trimmed = trimCurve(a.seg.curve, age);
    if (trimmed.points.length < 2 || curveLength(trimmed) < 1e-4) continue;
    liveBranches.push({
      ...a.seg,
      curve: trimmed,
      radius: a.seg.radius * (0.4 + 0.6 * age),
      terminal: a.seg.terminal || age < 0.999,
    });
  }

  const branchMeshOpts: BranchMeshOptions = { sides: 6, flare: opts.branchFlare ?? true };
  if (opts.branchFlareScale !== undefined) branchMeshOpts.flareScale = opts.branchFlareScale;
  if (barkUv !== undefined) branchMeshOpts.barkUv = barkUv;
  const branchMesh = liveBranches.length ? branchesToMesh(liveBranches, branchMeshOpts) : merge();

  const wood = merge(trunkMesh, branchMesh);

  // 4. Leaves: only on mature-enough tips, once past leafStart, scaled by stage.
  let leaves = merge();
  if ((opts.leaves ?? true) && growth >= leafStart) {
    // Keep only tips that are ripe enough, sized to their local maturity.
    const ripe = ages
      .filter((a) => a.seg.depth > 0 && branchAgeAt(a, growth) >= leafMaturity)
      .map((a) => {
        const age = branchAgeAt(a, growth);
        return { ...a.seg, radius: a.seg.radius * (0.4 + 0.6 * age), terminal: true };
      });
    const openness = smoothstep(leafStart, 1, growth);
    leaves = buildLeaves(ripe, opts, openness);
  }

  return { wood, leaves, branches: liveBranches, growth };
}

function buildLeaves(branches: BranchSegment[], opts: GrowingTreeOptions, openness: number): Mesh {
  const leafDensity = opts.leafDensity ?? 8;
  if (!(opts.leaves ?? true) || leafDensity <= 0 || branches.length === 0 || openness <= 0) return merge();
  const seed = opts.seed ?? 1;
  const rng = makeRng(seed);
  const leafOpts: ScatterLeavesOptions = {
    seed: (rng.next() * 1e9) | 0,
    perBranch: Math.max(1, Math.round(leafDensity * (0.35 + 0.65 * openness))),
    size: (opts.leafSize ?? 0.18) * (0.4 + 0.6 * openness),
    upBias: 0.45,
    cross: true,
    shape: (opts.leafShape ?? "quad") as LeafShape,
  };
  if (opts.leafCurl !== undefined) leafOpts.curl = opts.leafCurl;
  if (opts.leafFold !== undefined) leafOpts.fold = opts.leafFold;
  return scatterLeaves(branches, leafOpts);
}
