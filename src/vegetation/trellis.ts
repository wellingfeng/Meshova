import type { Vec3 } from "../math/vec3.js";
import { vec3, add, sub, scale, dot, normalize, length, lerpVec3 } from "../math/vec3.js";
import type { BranchSegment } from "./branch.js";

export type TrellisKind = "wall" | "grid" | "line" | "plane";

export interface TrellisEnvelope {
  kind?: TrellisKind;
  /** Origin of wall/grid/line/plane. */
  origin?: Vec3;
  /** Primary axis for line/grid. */
  axisU?: Vec3;
  /** Secondary axis for grid. */
  axisV?: Vec3;
  /** Plane normal for wall/plane. */
  normal?: Vec3;
  /** Grid spacing in world units. Used by kind: "grid". */
  spacing?: number;
  /** Attraction strength, 0..1. */
  strength?: number;
  /** Max movement per point in world units. */
  maxPull?: number;
  /** Only affect points after this normalized branch t. */
  startPct?: number;
  /** Optional branch-depth range. */
  depthMin?: number;
  depthMax?: number;
}

/**
 * Pull branch curves toward a trellis / wall / wire guide. This is a post-pass
 * over branch splines, so it stays renderer-independent and deterministic.
 */
export function shapeBranchesToTrellis(
  branches: ReadonlyArray<BranchSegment>,
  trellis?: TrellisEnvelope,
): BranchSegment[] {
  if (!trellis || (trellis.strength ?? 0.5) <= 0) return branches.slice();
  return branches.map((branch) => {
    if (!depthAllowed(branch.depth, trellis)) return { ...branch, curve: cloneCurve(branch) };
    const count = branch.curve.points.length;
    return {
      ...branch,
      curve: {
        ...branch.curve,
        points: branch.curve.points.map((p, i) => {
          const t = count > 1 ? i / (count - 1) : 1;
          if (t < (trellis.startPct ?? 0)) return { ...p };
          return pullPointToTrellis(p, trellis, t);
        }),
      },
    };
  });
}

export function pullPointToTrellis(p: Vec3, trellis: TrellisEnvelope, t = 1): Vec3 {
  const target = trellisTarget(p, trellis);
  const strength = clamp01((trellis.strength ?? 0.5) * smoothstep(t));
  const pulled = lerpVec3(p, target, strength);
  const maxPull = trellis.maxPull;
  if (maxPull === undefined || maxPull <= 0) return pulled;
  const delta = sub(pulled, p);
  const d = length(delta);
  return d > maxPull ? add(p, scale(delta, maxPull / d)) : pulled;
}

export function trellisTarget(p: Vec3, trellis: TrellisEnvelope): Vec3 {
  const kind = trellis.kind ?? "grid";
  if (kind === "line") return closestPointOnLine(p, trellis.origin ?? vec3(), trellis.axisU ?? vec3(0, 1, 0));
  if (kind === "plane" || kind === "wall") return closestPointOnPlane(p, trellis.origin ?? vec3(), trellis.normal ?? vec3(0, 0, 1));
  return closestPointOnGridLine(
    p,
    trellis.origin ?? vec3(),
    trellis.axisU ?? vec3(1, 0, 0),
    trellis.axisV ?? vec3(0, 1, 0),
    trellis.spacing ?? 0.5,
  );
}

function closestPointOnGridLine(p: Vec3, origin: Vec3, axisU: Vec3, axisV: Vec3, spacing: number): Vec3 {
  const u = safeNormalize(axisU, vec3(1, 0, 0));
  const v = safeNormalize(axisV, vec3(0, 1, 0));
  const local = sub(p, origin);
  const s = Math.max(1e-6, spacing);
  const du = dot(local, u);
  const dv = dot(local, v);
  const snappedU = Math.round(du / s) * s;
  const snappedV = Math.round(dv / s) * s;
  return Math.abs(snappedU - du) <= Math.abs(snappedV - dv)
    ? add(origin, add(scale(u, snappedU), scale(v, dv)))
    : add(origin, add(scale(u, du), scale(v, snappedV)));
}

function closestPointOnLine(p: Vec3, origin: Vec3, axis: Vec3): Vec3 {
  const u = safeNormalize(axis, vec3(0, 1, 0));
  return add(origin, scale(u, dot(sub(p, origin), u)));
}

function closestPointOnPlane(p: Vec3, origin: Vec3, normal: Vec3): Vec3 {
  const n = safeNormalize(normal, vec3(0, 0, 1));
  return sub(p, scale(n, dot(sub(p, origin), n)));
}

function depthAllowed(depth: number, trellis: TrellisEnvelope): boolean {
  if (trellis.depthMin !== undefined && depth < trellis.depthMin) return false;
  if (trellis.depthMax !== undefined && depth > trellis.depthMax) return false;
  return true;
}

function cloneCurve(branch: BranchSegment): BranchSegment["curve"] {
  return {
    ...branch.curve,
    points: branch.curve.points.map((p) => ({ ...p })),
  };
}

function safeNormalize(v: Vec3, fallback: Vec3): Vec3 {
  const n = normalize(v);
  return length(n) > 0 ? n : fallback;
}

function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
