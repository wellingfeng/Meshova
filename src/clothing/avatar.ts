/**
 * Clothing avatar (M3 — Avatar Measures).
 *
 * A parametric capsule body the garment system drapes cloth onto. It is NOT a
 * render-quality character; it is a *measurement + collision* surface. Garment
 * panels read body cross-sections (torso ellipse, limb tubes) to place cloth at
 * the right circumference, then add ease (the air gap between body and cloth).
 *
 * Deterministic by construction: pure functions of `AvatarMeasures`, no random,
 * no time. Same measures -> same body, every run (a hard project invariant).
 *
 * Coordinate frame: Y up, Z forward (front of body faces +Z), X to the body's
 * left-from-viewer. Units are arbitrary but tuned so a default height of ~1.8
 * reads as a human. Y = 0 is the ground (feet); the body stands on it.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3 } from "../math/vec3.js";

export interface AvatarMeasures {
  /** Total standing height, feet to crown. */
  height: number;
  /** Chest circumference (drives torso ellipse at chest line). */
  chest: number;
  /** Waist circumference (narrowest torso line). */
  waist: number;
  /** Hip circumference (widest pelvis line). */
  hip: number;
  /** Shoulder point-to-point width. */
  shoulderWidth: number;
  /** Upper-arm + forearm length, shoulder to wrist. */
  armLength: number;
  /** Crotch to ankle. */
  legLength: number;
  /** Neck circumference. */
  neck: number;
  /** Front-to-back depth ratio of the torso ellipse (0.5..0.9 of half-width). */
  depthRatio: number;
}

export const DEFAULT_MEASURES: AvatarMeasures = {
  height: 1.8,
  chest: 0.98,
  waist: 0.82,
  hip: 1.02,
  shoulderWidth: 0.46,
  armLength: 0.62,
  legLength: 0.84,
  neck: 0.38,
  depthRatio: 0.7,
};

/** A horizontal body slice: an ellipse centered at (cx, cz) in the XZ plane. */
export interface BodySection {
  /** Height up the body, ground-relative. */
  y: number;
  /** Ellipse center X. */
  cx: number;
  /** Ellipse center Z. */
  cz: number;
  /** Half-width along X. */
  rx: number;
  /** Half-depth along Z. */
  rz: number;
}

/** A limb is a tapered tube between two joints with per-end radii. */
export interface Limb {
  id: string;
  start: Vec3;
  end: Vec3;
  startRadius: number;
  endRadius: number;
}

/** Key vertical landmark heights derived from measures. */
export interface AvatarLandmarks {
  ground: number;
  ankle: number;
  knee: number;
  crotch: number;
  hipLine: number;
  waistLine: number;
  chestLine: number;
  shoulderLine: number;
  neckBase: number;
  chinLine: number;
  crown: number;
}

/** A resolved avatar: stacked torso sections, limbs, landmarks, measures. */
export interface Avatar {
  measures: AvatarMeasures;
  landmarks: AvatarLandmarks;
  /** Torso/pelvis cross-sections, ascending in Y (crotch -> neck base). */
  sections: BodySection[];
  /** Arm + leg tubes for sleeves / trouser legs and collision. */
  limbs: Limb[];
}

function landmarksOf(m: AvatarMeasures): AvatarLandmarks {
  const h = m.height;
  return {
    ground: 0,
    ankle: h * 0.04,
    knee: h * 0.28,
    crotch: h * 0.05 + m.legLength,
    hipLine: h * 0.05 + m.legLength + h * 0.04,
    waistLine: h * 0.62,
    chestLine: h * 0.72,
    shoulderLine: h * 0.82,
    neckBase: h * 0.84,
    chinLine: h * 0.87,
    crown: h,
  };
}

/**
 * Build the avatar from measures. Torso is a lofted ellipse stack; arms and
 * legs are tapered tubes anchored at the shoulder line and hips.
 */
export function buildAvatar(measures: Partial<AvatarMeasures> = {}): Avatar {
  const m: AvatarMeasures = { ...DEFAULT_MEASURES, ...measures };
  const L = landmarksOf(m);
  const depth = m.depthRatio;

  // Ellipse half-widths from circumference. Treat the ellipse perimeter as
  // ~ pi*(a+b) with b = depth*a, so a = C / (pi*(1+depth)).
  const halfWidth = (circ: number): number => circ / (Math.PI * (1 + depth));
  const chestA = halfWidth(m.chest);
  const waistA = halfWidth(m.waist);
  const hipA = halfWidth(m.hip);
  const neckA = halfWidth(m.neck);

  const sections: BodySection[] = [
    { y: L.crotch, cx: 0, cz: 0, rx: hipA * 0.9, rz: hipA * depth * 0.9 },
    { y: L.hipLine, cx: 0, cz: 0, rx: hipA, rz: hipA * depth },
    { y: (L.hipLine + L.waistLine) / 2, cx: 0, cz: 0, rx: (hipA + waistA) / 2, rz: ((hipA + waistA) / 2) * depth },
    { y: L.waistLine, cx: 0, cz: 0, rx: waistA, rz: waistA * depth },
    { y: L.chestLine, cx: 0, cz: 0, rx: chestA, rz: chestA * depth },
    { y: L.shoulderLine, cx: 0, cz: 0, rx: Math.max(chestA, m.shoulderWidth * 0.5), rz: chestA * depth },
    { y: L.neckBase, cx: 0, cz: 0, rx: neckA, rz: neckA * depth },
  ];

  const shoulderX = m.shoulderWidth * 0.5;
  const upperArmR = chestA * 0.28;
  const wristR = upperArmR * 0.55;
  const legTopR = hipA * 0.46;
  const ankleR = legTopR * 0.42;
  const hipX = hipA * 0.5;

  const limbs: Limb[] = [];
  for (const side of [-1, 1] as const) {
    const tag = side < 0 ? "l" : "r";
    // Arm: shoulder -> wrist, hanging slightly out and forward.
    limbs.push({
      id: `arm_${tag}`,
      start: vec3(side * shoulderX, L.shoulderLine - upperArmR, 0),
      end: vec3(side * (shoulderX + m.armLength * 0.25), L.shoulderLine - m.armLength, 0.02),
      startRadius: upperArmR,
      endRadius: wristR,
    });
    // Leg: hip -> ankle.
    limbs.push({
      id: `leg_${tag}`,
      start: vec3(side * hipX, L.crotch, 0),
      end: vec3(side * hipX * 0.8, L.ankle, 0.01),
      startRadius: legTopR,
      endRadius: ankleR,
    });
  }

  return { measures: m, landmarks: L, sections, limbs };
}

/**
 * Sample the torso ellipse at height `y` by linear interpolation between the
 * nearest cross-sections. Clamps to the end sections outside the torso range.
 */
export function bodySectionAt(avatar: Avatar, y: number): BodySection {
  const s = avatar.sections;
  if (y <= s[0]!.y) return { ...s[0]!, y };
  if (y >= s[s.length - 1]!.y) return { ...s[s.length - 1]!, y };
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i]!;
    const b = s[i + 1]!;
    if (y >= a.y && y <= b.y) {
      const t = (y - a.y) / (b.y - a.y);
      return {
        y,
        cx: a.cx + (b.cx - a.cx) * t,
        cz: a.cz + (b.cz - a.cz) * t,
        rx: a.rx + (b.rx - a.rx) * t,
        rz: a.rz + (b.rz - a.rz) * t,
      };
    }
  }
  return { ...s[s.length - 1]!, y };
}

/**
 * A point on the torso surface for parametric angle `theta` (0 = front/+Z,
 * increasing toward +X) at height `y`, expanded outward by `ease`.
 */
export function bodyPoint(avatar: Avatar, y: number, theta: number, ease = 0): Vec3 {
  const sec = bodySectionAt(avatar, y);
  const rx = sec.rx + ease;
  const rz = sec.rz + ease;
  return vec3(sec.cx + Math.sin(theta) * rx, y, sec.cz + Math.cos(theta) * rz);
}

/** Find a named limb (e.g. "arm_l", "leg_r"). */
export function limbById(avatar: Avatar, id: string): Limb | undefined {
  return avatar.limbs.find((l) => l.id === id);
}
