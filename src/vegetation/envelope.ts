import type { Vec3 } from "../math/vec3.js";
import { vec3 } from "../math/vec3.js";
import type { BranchSegment } from "./branch.js";

export type CanopyEnvelopeShape = "ellipsoid" | "cone" | "column" | "umbrella";

export interface CanopyEnvelope {
  shape?: CanopyEnvelopeShape;
  center?: Vec3;
  /** Base Y of the editable crown volume. */
  baseY?: number;
  /** Crown height. */
  height?: number;
  /** X radius at the widest part. */
  radiusX?: number;
  /** Z radius at the widest part. Defaults to radiusX. */
  radiusZ?: number;
  /** 0 keeps original, 1 clamps to envelope. */
  strength?: number;
  /** Prevents branches pinching to a zero-radius top. */
  minScale?: number;
  /** Profile exponent. >1 narrows tips faster. */
  power?: number;
}

export function shapeBranchesToEnvelope(
  branches: ReadonlyArray<BranchSegment>,
  envelope?: CanopyEnvelope,
): BranchSegment[] {
  if (!envelope) return branches.slice();
  return branches.map((branch) => ({
    ...branch,
    curve: {
      ...branch.curve,
      points: branch.curve.points.map((p) => constrainPointToEnvelope(p, envelope)),
    },
  }));
}

export function constrainPointToEnvelope(p: Vec3, envelope: CanopyEnvelope): Vec3 {
  const center = envelope.center ?? vec3(0, 0, 0);
  const baseY = envelope.baseY ?? center.y;
  const height = Math.max(1e-6, envelope.height ?? 4);
  const t = clamp01((p.y - baseY) / height);
  const strength = clamp01(envelope.strength ?? 1);
  if (strength <= 0) return { ...p };

  const scale = Math.max(envelope.minScale ?? 0.08, envelopeScale(envelope.shape ?? "ellipsoid", t, envelope.power ?? 1));
  const rx = Math.max(1e-6, (envelope.radiusX ?? 1) * scale);
  const rz = Math.max(1e-6, (envelope.radiusZ ?? envelope.radiusX ?? 1) * scale);
  const dx = p.x - center.x;
  const dz = p.z - center.z;
  const d = Math.sqrt((dx * dx) / (rx * rx) + (dz * dz) / (rz * rz));
  if (d <= 1) return { ...p };

  const clampedX = center.x + dx / d;
  const clampedZ = center.z + dz / d;
  return {
    x: lerp(p.x, clampedX, strength),
    y: p.y,
    z: lerp(p.z, clampedZ, strength),
  };
}

export function envelopeRadiusScale(shape: CanopyEnvelopeShape, t: number, power = 1): number {
  return envelopeScale(shape, clamp01(t), power);
}

function envelopeScale(shape: CanopyEnvelopeShape, t: number, power: number): number {
  if (shape === "cone") return Math.pow(1 - t * 0.92, power);
  if (shape === "column") return 1;
  if (shape === "umbrella") {
    const upper = Math.sin(Math.PI * Math.min(1, t * 0.9));
    return Math.pow(Math.max(0.12, upper), 0.35 / Math.max(0.1, power));
  }
  return Math.pow(Math.max(0, Math.sin(Math.PI * t)), power);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
