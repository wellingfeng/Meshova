import type { Curve } from "../geometry/curve.js";
import { curveLength } from "../geometry/curve.js";
import type { Vec3 } from "../math/vec3.js";
import { add, normalize, scale, vec3 } from "../math/vec3.js";
import { curveFrameAt } from "./curve-frame.js";
import type { BranchSegment } from "./branch.js";

export type VegetationCarveMode = "radius" | "length-from-root" | "form-bottom" | "z-position";

export interface CarveBranchesOptions {
  mode: VegetationCarveMode;
  /** Normalized carve amount. Zero keeps the input unchanged; one applies the strongest cut. */
  amount?: number;
}

/**
 * UE 5.7 Vegetation Editor-style skeleton carving.
 *
 * `form-bottom` compresses height while preserving branch density. `z-position`
 * uses UE's Z-up meaning, mapped to Meshova's Y-up axis.
 */
export function carveBranches(
  branches: BranchSegment[],
  opts: CarveBranchesOptions,
): BranchSegment[] {
  const amount = clamp01(opts.amount ?? 0);
  if (amount <= 0 || branches.length === 0) return cloneBranches(branches);

  if (opts.mode === "form-bottom") {
    const { minY } = branchHeightRange(branches);
    const heightScale = 1 - amount;
    return branches.map((branch) => cloneBranch(branch, {
      ...branch.curve,
      points: branch.curve.points.map((point) => ({
        ...point,
        y: minY + (point.y - minY) * heightScale,
      })),
    }));
  }

  if (opts.mode === "radius") {
    const maxRadius = Math.max(...branches.map((branch) => branch.radius), 1e-6);
    return filterBranches(branches, (branch) => branch.radius / maxRadius >= amount);
  }

  if (opts.mode === "length-from-root") {
    const distances = branches.map(branchRootDistance);
    const maxDistance = Math.max(...distances, 1e-6);
    const maxAllowed = maxDistance * (1 - amount);
    return filterBranches(branches, (_branch, index) => distances[index]! <= maxAllowed);
  }

  const { minY, maxY } = branchHeightRange(branches);
  const cutoff = maxY - (maxY - minY) * amount;
  return filterBranches(branches, (branch) => branch.curve.points[0]!.y <= cutoff);
}

export interface BranchGravityOptions {
  /** World-space bend strength relative to branch length. Positive values follow direction. */
  strength?: number;
  /** Bend direction. Default is world down. Use world up for phototropism. */
  direction?: Vec3;
  /** Tip falloff exponent. Values above one keep branch roots stiffer. */
  exponent?: number;
}

/** Bend an existing skeleton while keeping child roots attached to moved parents. */
export function applyBranchGravity(
  branches: BranchSegment[],
  opts: BranchGravityOptions = {},
): BranchSegment[] {
  const strength = opts.strength ?? 0.12;
  const exponent = Math.max(0.1, opts.exponent ?? 1.8);
  const rawDirection = opts.direction ?? vec3(0, -1, 0);
  const direction = Math.hypot(rawDirection.x, rawDirection.y, rawDirection.z) > 1e-8
    ? normalize(rawDirection)
    : vec3(0, -1, 0);
  const out: BranchSegment[] = [];

  for (let index = 0; index < branches.length; index++) {
    const branch = branches[index]!;
    let attachmentDelta = vec3(0, 0, 0);
    if (branch.parentIndex !== undefined && branch.parentIndex < index) {
      const originalParent = branches[branch.parentIndex];
      const movedParent = out[branch.parentIndex];
      if (originalParent && movedParent) {
        const attachT = branch.attachT ?? 1;
        const originalAttach = curveFrameAt(originalParent.curve, attachT).position;
        const movedAttach = curveFrameAt(movedParent.curve, attachT).position;
        attachmentDelta = vec3(
          movedAttach.x - originalAttach.x,
          movedAttach.y - originalAttach.y,
          movedAttach.z - originalAttach.z,
        );
      }
    }

    const branchLength = curveLength(branch.curve);
    const last = Math.max(1, branch.curve.points.length - 1);
    const points = branch.curve.points.map((point, pointIndex) => {
      const t = pointIndex / last;
      const bend = strength * branchLength * Math.pow(t, exponent);
      return add(add(point, attachmentDelta), scale(direction, bend));
    });
    out.push(cloneBranch(branch, { ...branch.curve, points }));
  }

  return out;
}

export type RemoveBranchesMode = "age" | "radius" | "length" | "height" | "random";

export interface RemoveBranchesOptions {
  mode?: RemoveBranchesMode;
  /** Normalized removal pressure. Zero keeps all branches. */
  amount?: number;
  seed?: number;
  /** Protect branches shallower than this depth. */
  minDepth?: number;
}

/** Remove low-priority branches, cascading removal through their descendants. */
export function removeBranches(
  branches: BranchSegment[],
  opts: RemoveBranchesOptions = {},
): BranchSegment[] {
  const amount = clamp01(opts.amount ?? 0.2);
  if (amount <= 0 || branches.length === 0) return cloneBranches(branches);
  const mode = opts.mode ?? "age";
  const minDepth = Math.max(1, Math.floor(opts.minDepth ?? 2));
  const maxDepth = Math.max(...branches.map((branch) => branch.depth), 1);
  const maxRadius = Math.max(...branches.map((branch) => branch.radius), 1e-6);
  const lengths = branches.map((branch) => curveLength(branch.curve));
  const maxLength = Math.max(...lengths, 1e-6);
  const { minY, maxY } = branchHeightRange(branches);
  const spanY = Math.max(1e-6, maxY - minY);
  const seed = opts.seed ?? 1;

  return filterBranches(branches, (branch, index) => {
    if (branch.depth < minDepth) return true;
    let keepPriority: number;
    if (mode === "radius") keepPriority = branch.radius / maxRadius;
    else if (mode === "length") keepPriority = lengths[index]! / maxLength;
    else if (mode === "height") keepPriority = 1 - (branch.curve.points[0]!.y - minY) / spanY;
    else if (mode === "random") keepPriority = hash01(seed * 0.754877666 + index * 1.618033989);
    else keepPriority = 1 - branch.depth / (maxDepth + 1);
    return keepPriority >= amount;
  });
}

export interface ReduceBranchBonesOptions {
  /** Fraction of interior curve points to remove. */
  reduction?: number;
  /** Minimum points retained per branch. */
  minPoints?: number;
}

/** Reduce branch curve samples while retaining every root and tip. */
export function reduceBranchBones(
  branches: BranchSegment[],
  opts: ReduceBranchBonesOptions = {},
): BranchSegment[] {
  const reduction = clamp01(opts.reduction ?? 0.5);
  const minPoints = Math.max(2, Math.floor(opts.minPoints ?? 3));
  return branches.map((branch) => {
    const points = branch.curve.points;
    const target = Math.min(points.length, Math.max(minPoints, Math.ceil(points.length * (1 - reduction))));
    if (target >= points.length) return cloneBranch(branch);
    const sampled = new Array<Vec3>(target);
    for (let index = 0; index < target; index++) {
      const sourceIndex = Math.round((index / (target - 1)) * (points.length - 1));
      sampled[index] = { ...points[sourceIndex]! };
    }
    return cloneBranch(branch, { ...branch.curve, points: sampled });
  });
}

function filterBranches(
  branches: BranchSegment[],
  predicate: (branch: BranchSegment, index: number) => boolean,
): BranchSegment[] {
  const keep = branches.map(predicate);
  for (let index = 0; index < branches.length; index++) {
    const parentIndex = branches[index]!.parentIndex;
    if (parentIndex !== undefined && !keep[parentIndex]) keep[index] = false;
  }

  const indexMap = new Map<number, number>();
  for (let index = 0; index < keep.length; index++) {
    if (keep[index]) indexMap.set(index, indexMap.size);
  }

  const out: BranchSegment[] = [];
  for (let index = 0; index < branches.length; index++) {
    if (!keep[index]) continue;
    const source = branches[index]!;
    const parentIndex = source.parentIndex === undefined ? undefined : indexMap.get(source.parentIndex);
    const branch = cloneBranch(source);
    if (parentIndex === undefined) delete branch.parentIndex;
    else branch.parentIndex = parentIndex;
    branch.terminal = true;
    out.push(branch);
  }
  for (const branch of out) {
    if (branch.parentIndex !== undefined) out[branch.parentIndex]!.terminal = false;
  }
  return out;
}

function branchRootDistance(branch: BranchSegment): number {
  if (branch.lengthFromRoot !== undefined) return branch.lengthFromRoot;
  const root = branch.curve.points[0]!;
  return Math.hypot(root.x, root.y, root.z);
}

function branchHeightRange(branches: BranchSegment[]): { minY: number; maxY: number } {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const branch of branches) {
    for (const point of branch.curve.points) {
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
  }
  return { minY, maxY };
}

function cloneBranches(branches: BranchSegment[]): BranchSegment[] {
  return branches.map((branch) => cloneBranch(branch));
}

function cloneBranch(branch: BranchSegment, curve: Curve = branch.curve): BranchSegment {
  const cloned: BranchSegment = {
    ...branch,
    curve: {
      ...curve,
      points: curve.points.map((point) => ({ ...point })),
    },
  };
  if (branch.attachNormal) cloned.attachNormal = { ...branch.attachNormal };
  return cloned;
}

function hash01(value: number): number {
  const hash = Math.sin(value) * 43758.5453123;
  return hash - Math.floor(hash);
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
