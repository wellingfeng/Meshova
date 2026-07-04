import { dihedral, qidentity, qrotate, qslerp } from "../math/quat.js";
import {
  add,
  dot,
  length,
  normalize,
  scale,
  sub,
  vec3,
  type Vec3,
} from "../math/vec3.js";
import type { NamedPart } from "./export.js";
import { bounds, makeMesh, merge, recomputeNormals, type Mesh } from "./mesh.js";

export type TPoseSide = "left" | "right";

export interface TPoseArmEstimate {
  side: TPoseSide;
  shoulder: Vec3;
  hand: Vec3;
  currentDirection: Vec3;
  targetDirection: Vec3;
  confidence: number;
}

export interface HumanoidTPoseOptions {
  /** 0..1 along model height. Default estimates shoulder at 70% height. */
  shoulderHeightRatio?: number;
  /** Override detected torso half-width. World units. */
  torsoHalfWidth?: number;
  /** Soft blend radius around each arm centerline. World units. */
  armRadius?: number;
  /** Overall deformation amount. 1 = full T-pose. */
  strength?: number;
}

export interface HumanoidTPoseJoints {
  center: Vec3;
  height: number;
  torsoHalfWidth: number;
  left?: TPoseArmEstimate;
  right?: TPoseArmEstimate;
}

export interface HumanoidTPoseResult {
  mesh: Mesh;
  confidence: number;
  joints: HumanoidTPoseJoints;
  diagnostics: string[];
}

export interface HumanoidTPosePartsResult {
  parts: NamedPart[];
  confidence: number;
  joints: HumanoidTPoseJoints;
  diagnostics: string[];
}

interface TPosePlan {
  joints: HumanoidTPoseJoints;
  diagnostics: string[];
  confidence: number;
  armRadius: number;
  strength: number;
}

function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x >= edge1 ? 1 : 0;
  const t = clamp((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const i = clamp(q, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  const t = i - lo;
  return sorted[lo]! * (1 - t) + sorted[hi]! * t;
}

function distanceToSegment(p: Vec3, a: Vec3, b: Vec3): { distance: number; t: number } {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  if (len2 <= 1e-12) return { distance: length(sub(p, a)), t: 0 };
  const t = clamp(dot(sub(p, a), ab) / len2);
  const q = add(a, scale(ab, t));
  return { distance: length(sub(p, q)), t };
}

function rotateAround(p: Vec3, pivot: Vec3, q: ReturnType<typeof qidentity>): Vec3 {
  return add(pivot, qrotate(q, sub(p, pivot)));
}

function estimateTorsoHalfWidth(mesh: Mesh, centerX: number, minY: number, height: number): number {
  const values: number[] = [];
  const lo = minY + height * 0.42;
  const hi = minY + height * 0.72;
  for (const p of mesh.positions) {
    if (p.y < lo || p.y > hi) continue;
    values.push(Math.abs(p.x - centerX));
  }
  return quantile(values, 0.62);
}

function sideSign(side: TPoseSide): -1 | 1 {
  return side === "left" ? -1 : 1;
}

function estimateArm(
  mesh: Mesh,
  side: TPoseSide,
  center: Vec3,
  minY: number,
  height: number,
  torsoHalfWidth: number,
  shoulderY: number,
): TPoseArmEstimate | undefined {
  const sign = sideSign(side);
  const minHandY = minY + height * 0.08;
  const maxHandY = minY + height * 0.82;
  let hand = mesh.positions[0];
  let bestScore = -Infinity;

  for (const p of mesh.positions) {
    const outward = sign * (p.x - center.x);
    if (outward <= torsoHalfWidth * 0.45) continue;
    if (p.y < minHandY || p.y > maxHandY) continue;
    const lowerBonus = (maxHandY - p.y) / Math.max(1e-6, maxHandY - minHandY);
    const score = outward + lowerBonus * torsoHalfWidth * 0.35;
    if (score > bestScore) {
      bestScore = score;
      hand = p;
    }
  }

  if (!hand || bestScore === -Infinity) return undefined;

  const shoulder = vec3(
    center.x + sign * torsoHalfWidth * 1.05,
    shoulderY,
    center.z,
  );
  const current = sub(hand, shoulder);
  const armLen = length(current);
  if (armLen < height * 0.12) return undefined;

  const target = vec3(sign, 0, 0);
  const outwardReach = sign * (hand.x - shoulder.x);
  const reachScore = smoothstep(height * 0.05, height * 0.18, outwardReach);
  const lengthScore = smoothstep(height * 0.14, height * 0.28, armLen);
  const sideScore = smoothstep(torsoHalfWidth * 0.35, torsoHalfWidth * 1.1, sign * (hand.x - center.x));
  const confidence = clamp((reachScore + lengthScore + sideScore) / 3);

  return {
    side,
    shoulder,
    hand,
    currentDirection: normalize(current),
    targetDirection: target,
    confidence,
  };
}

function estimateTPosePlan(mesh: Mesh, options: HumanoidTPoseOptions = {}): TPosePlan {
  const b = bounds(mesh);
  const height = Math.max(1e-6, b.max.y - b.min.y);
  const width = Math.max(1e-6, b.max.x - b.min.x);
  const depth = Math.max(1e-6, b.max.z - b.min.z);
  const center = vec3(
    (b.min.x + b.max.x) * 0.5,
    (b.min.y + b.max.y) * 0.5,
    (b.min.z + b.max.z) * 0.5,
  );
  const estimatedTorsoHalfWidth = estimateTorsoHalfWidth(mesh, center.x, b.min.y, height);
  const torsoHalfWidth = clamp(
    options.torsoHalfWidth ?? estimatedTorsoHalfWidth,
    width * 0.08,
    width * 0.42,
  );
  const shoulderRatio = options.shoulderHeightRatio ?? 0.7;
  const shoulderY = b.min.y + height * shoulderRatio;

  const left = estimateArm(mesh, "left", center, b.min.y, height, torsoHalfWidth, shoulderY);
  const right = estimateArm(mesh, "right", center, b.min.y, height, torsoHalfWidth, shoulderY);
  const diagnostics: string[] = [];
  if (!left) diagnostics.push("left_arm_not_found");
  if (!right) diagnostics.push("right_arm_not_found");
  if (left && left.confidence < 0.45) diagnostics.push("left_arm_low_confidence");
  if (right && right.confidence < 0.45) diagnostics.push("right_arm_low_confidence");
  if (width < depth * 0.55) diagnostics.push("front_or_side_orientation_uncertain");

  const confidences = [left?.confidence, right?.confidence].filter((v): v is number => typeof v === "number");
  const confidence = confidences.length
    ? confidences.reduce((a, b0) => a + b0, 0) / confidences.length
    : 0;

  const joints: HumanoidTPoseJoints = { center, height, torsoHalfWidth };
  if (left) joints.left = left;
  if (right) joints.right = right;

  return {
    joints,
    diagnostics,
    confidence,
    armRadius: options.armRadius ?? Math.max(height * 0.08, torsoHalfWidth * 0.55),
    strength: clamp(options.strength ?? 1),
  };
}

function armInfluence(
  p: Vec3,
  arm: TPoseArmEstimate,
  plan: TPosePlan,
  forcedSide?: TPoseSide,
): number {
  const sign = sideSign(arm.side);
  const center = plan.joints.center;
  const h = plan.joints.height;
  const torsoHalfWidth = plan.joints.torsoHalfWidth;
  const sideOut = sign * (p.x - center.x);
  const seg = distanceToSegment(p, arm.shoulder, arm.hand);
  const rootFade = smoothstep(0.08, 0.32, seg.t);
  if (forcedSide === arm.side) {
    const guided = Math.max(rootFade, 0.35) * (1 - smoothstep(plan.armRadius * 2.5, plan.armRadius * 5, seg.distance));
    return clamp(guided * arm.confidence * plan.strength);
  }

  const sideMask = smoothstep(torsoHalfWidth * 0.45, torsoHalfWidth * 0.95, sideOut);
  const capsule = 1 - smoothstep(plan.armRadius, plan.armRadius * 2.6, seg.distance);
  const yTopMask = 1 - smoothstep(arm.shoulder.y + h * 0.18, arm.shoulder.y + h * 0.32, p.y);
  const guided = capsule * rootFade * sideMask * yTopMask;
  const outerFallback = sideMask * smoothstep(0.18, 0.55, Math.abs(p.y - arm.shoulder.y) / h) * 0.18;
  return clamp(Math.max(guided, outerFallback) * arm.confidence * plan.strength);
}

function applyTPosePlan(mesh: Mesh, plan: TPosePlan, forcedSide?: TPoseSide): Mesh {
  const arms = [plan.joints.left, plan.joints.right].filter((v): v is TPoseArmEstimate => !!v);
  if (arms.length === 0 || plan.strength <= 0) {
    return {
      positions: mesh.positions.map((p) => vec3(p.x, p.y, p.z)),
      normals: mesh.normals.map((n) => vec3(n.x, n.y, n.z)),
      uvs: mesh.uvs.map((uv) => ({ x: uv.x, y: uv.y })),
      indices: mesh.indices.slice(),
    };
  }

  const positions = mesh.positions.map((source) => {
    let p = vec3(source.x, source.y, source.z);
    for (const arm of arms) {
      const w = armInfluence(p, arm, plan, forcedSide);
      if (w <= 1e-5) continue;
      const q = qslerp(qidentity(), dihedral(arm.currentDirection, arm.targetDirection), w);
      p = rotateAround(p, arm.shoulder, q);
    }
    return p;
  });

  return recomputeNormals(makeMesh({
    positions,
    normals: mesh.normals.map((n) => vec3(n.x, n.y, n.z)),
    uvs: mesh.uvs.map((uv) => ({ x: uv.x, y: uv.y })),
    indices: mesh.indices.slice(),
  }));
}

function partTPoseSideHint(part: NamedPart): TPoseSide | undefined {
  const text = [
    part.name,
    part.label,
    String(part.metadata?.role ?? ""),
  ].filter(Boolean).join(" ").toLowerCase();
  if (!/(arm|hand|glove|forearm|upperarm|lowerarm|手|臂|手套)/i.test(text)) return undefined;
  if (/(^|[^a-z])l($|[^a-z])|left|左|-1|_l\b|\bl_/i.test(text)) return "left";
  if (/(^|[^a-z])r($|[^a-z])|right|右|\+1|_r\b|\br_/i.test(text)) return "right";
  const b = bounds(part.mesh);
  const cx = (b.min.x + b.max.x) * 0.5;
  return cx < 0 ? "left" : "right";
}

/**
 * One-click humanoid T-pose canonicalization from geometry only.
 *
 * This is a deterministic, no-external-tool heuristic: estimate shoulders and
 * hands from an upright biped silhouette, rotate arm vertices toward horizontal
 * T-pose with soft capsule weights, then recompute normals. It is intended as a
 * coarse canonical mesh for editing/AI iteration, not animation-grade autorig.
 */
export function canonicalizeHumanoidTPose(
  mesh: Mesh,
  options: HumanoidTPoseOptions = {},
): HumanoidTPoseResult {
  const plan = estimateTPosePlan(mesh, options);
  return {
    mesh: applyTPosePlan(mesh, plan),
    confidence: plan.confidence,
    joints: plan.joints,
    diagnostics: plan.diagnostics,
  };
}

/** Apply the same one-click T-pose estimate to a multi-part model. */
export function canonicalizeHumanoidPartsToTPose(
  parts: readonly NamedPart[],
  options: HumanoidTPoseOptions = {},
): HumanoidTPosePartsResult {
  if (parts.length === 0) {
    return {
      parts: [],
      confidence: 0,
      joints: { center: vec3(0, 0, 0), height: 0, torsoHalfWidth: 0 },
      diagnostics: ["empty_model"],
    };
  }
  const source = merge(...parts.map((part) => part.mesh));
  const plan = estimateTPosePlan(source, options);
  const next = parts.map((part) => ({
    ...part,
    mesh: applyTPosePlan(part.mesh, plan, partTPoseSideHint(part)),
    metadata: {
      ...(part.metadata || {}),
      tpose: {
        confidence: Number(plan.confidence.toFixed(4)),
        diagnostics: plan.diagnostics,
      },
    },
  }));
  return {
    parts: next,
    confidence: plan.confidence,
    joints: plan.joints,
    diagnostics: plan.diagnostics,
  };
}
