/**
 * Heuristic drape (M4 — Heuristic Drape, research stages A/B).
 *
 * Turns the avatar body + garment intent into renderable cloth *shells*. This
 * is NOT a physics solver (that is the later XPBD milestone). Instead it wraps
 * cloth bands around the avatar torso cross-sections and tapered tubes around
 * the limbs, offset by an ease (air gap) profile, with gravity-driven flare and
 * deterministic Perlin wrinkles. The result is watertight, seam-aware enough to
 * read as a T-shirt / skirt / trousers, and fully reproducible.
 *
 * Hard invariant: deterministic. Wrinkles come from seeded noise, not random.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, sub, scale, normalize, cross } from "../math/vec3.js";
import { vec2 } from "../math/vec2.js";
import { TAU } from "../math/scalar.js";
import type { Mesh } from "../geometry/mesh.js";
import { makeMesh, recomputeNormals } from "../geometry/mesh.js";
import { makeNoise, fbm3 } from "../random/noise.js";
import type { Avatar, Limb } from "./avatar.js";
import { bodyPoint } from "./avatar.js";

/** A function returning ease (air gap) for a normalized height t in [0,1]. */
export type EaseProfile = number | ((t: number) => number);

/** A function returning extra outward flare for normalized height t. */
export type FlareProfile = number | ((t: number) => number);

function asFn(p: EaseProfile | FlareProfile): (t: number) => number {
  return typeof p === "number" ? () => p : p;
}

export interface WrinkleOptions {
  /** Seed for the noise field (determinism). */
  seed?: number;
  /** Spatial frequency of wrinkles. */
  scale?: number;
  /** Outward displacement amplitude. */
  amount?: number;
}

export interface TorsoShellOptions {
  /** Bottom height (ground-relative). */
  yBottom: number;
  /** Top height. */
  yTop: number;
  /** Vertical resolution. */
  rings?: number;
  /** Angular resolution around the body. */
  segments?: number;
  /** Air gap from the body surface, by normalized height. */
  ease?: EaseProfile;
  /** Extra outward radius added at the hem (gravity flare), by height. */
  flare?: FlareProfile;
  /** Angular start (radians, 0 = front). Defaults to full loop. */
  thetaStart?: number;
  /** Angular sweep (radians). Defaults to TAU (closed tube). */
  thetaSweep?: number;
  /** Cap the bottom opening (e.g. closed only if not a hem). */
  capBottom?: boolean;
  /** Cap the top opening. */
  capTop?: boolean;
  /** Deterministic wrinkles. */
  wrinkle?: WrinkleOptions;
}

/**
 * Build a cloth band wrapped around the torso between two heights. Closed tube
 * by default; a partial sweep produces an open panel (e.g. a cape back).
 */
export function torsoShell(avatar: Avatar, opts: TorsoShellOptions): Mesh {
  const rings = Math.max(2, opts.rings ?? 24);
  const sweep = opts.thetaSweep ?? TAU;
  const closed = Math.abs(sweep - TAU) < 1e-6;
  const segments = Math.max(3, opts.segments ?? 32);
  const thetaStart = opts.thetaStart ?? 0;
  const easeFn = asFn(opts.ease ?? 0.04);
  const flareFn = asFn(opts.flare ?? 0);
  const yB = opts.yBottom;
  const yT = opts.yTop;

  const noise = makeNoise(opts.wrinkle?.seed ?? 1);
  const wScale = opts.wrinkle?.scale ?? 6;
  const wAmount = opts.wrinkle?.amount ?? 0;

  const cols = closed ? segments : segments + 1;
  const positions: Vec3[] = [];
  const uvs: { x: number; y: number }[] = [];

  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const y = yB + (yT - yB) * t;
    const ease = easeFn(t) + flareFn(t);
    for (let j = 0; j < cols; j++) {
      const u = closed ? j / segments : j / segments;
      const theta = thetaStart + sweep * u;
      let p = bodyPoint(avatar, y, theta, ease);
      if (wAmount !== 0) {
        const w = fbm3(noise, Math.cos(theta) * wScale, y * wScale, Math.sin(theta) * wScale, { octaves: 3 });
        // Push along the local radial (outward) direction; stronger toward the hem.
        const radial = normalize(vec3(Math.sin(theta), 0, Math.cos(theta)));
        p = add(p, scale(radial, w * wAmount * (0.4 + 0.6 * t)));
      }
      positions.push(p);
      uvs.push(vec2(u, t));
    }
  }

  const indices: number[] = [];
  const ringStride = cols;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const jn = closed ? (j + 1) % cols : j + 1;
      const a = i * ringStride + j;
      const b = i * ringStride + jn;
      const c = (i + 1) * ringStride + j;
      const d = (i + 1) * ringStride + jn;
      indices.push(a, b, c, b, d, c);
    }
  }

  if (opts.capBottom) capRing(positions, uvs, indices, 0, ringStride, segments, closed, false);
  if (opts.capTop) capRing(positions, uvs, indices, rings, ringStride, segments, closed, true);

  return recomputeNormals(makeMesh({
    positions,
    normals: positions.map(() => vec3(0, 1, 0)),
    uvs,
    indices,
  }));
}

function capRing(
  positions: Vec3[],
  uvs: { x: number; y: number }[],
  indices: number[],
  ring: number,
  ringStride: number,
  segments: number,
  closed: boolean,
  up: boolean,
): void {
  const start = ring * ringStride;
  let cx = 0, cy = 0, cz = 0;
  const count = closed ? segments : segments + 1;
  for (let j = 0; j < count; j++) {
    const p = positions[start + j]!;
    cx += p.x; cy += p.y; cz += p.z;
  }
  const center = positions.length;
  positions.push(vec3(cx / count, cy / count, cz / count));
  uvs.push(vec2(0.5, 0.5));
  for (let j = 0; j < segments; j++) {
    const jn = closed ? (j + 1) % count : j + 1;
    const a = start + j;
    const b = start + jn;
    if (up) indices.push(center, b, a);
    else indices.push(center, a, b);
  }
}

export interface SleeveOptions {
  /** Start fraction along the limb (0 = shoulder/hip joint). */
  tStart?: number;
  /** End fraction along the limb (1 = wrist/ankle). */
  tEnd?: number;
  /** Air gap added to the limb radius. */
  ease?: EaseProfile;
  /** Extra flare at the cuff end (bell sleeve / wide leg). */
  flare?: FlareProfile;
  rings?: number;
  segments?: number;
  capStart?: boolean;
  capEnd?: boolean;
  wrinkle?: WrinkleOptions;
}

/**
 * Build a tapered cloth tube around a limb (sleeve or trouser leg). The limb is
 * a straight tapered segment; cloth follows it with ease + cuff flare.
 */
export function limbSleeve(limb: Limb, opts: SleeveOptions = {}): Mesh {
  const tStart = opts.tStart ?? 0;
  const tEnd = opts.tEnd ?? 1;
  const rings = Math.max(2, opts.rings ?? 12);
  const segments = Math.max(3, opts.segments ?? 16);
  const easeFn = asFn(opts.ease ?? 0.03);
  const flareFn = asFn(opts.flare ?? 0);

  const axis = sub(limb.end, limb.start);
  const dir = normalize(axis);
  // Stable perpendicular basis.
  const ref = Math.abs(dir.y) < 0.9 ? vec3(0, 1, 0) : vec3(1, 0, 0);
  const u = normalize(cross(ref, dir));
  const v = normalize(cross(dir, u));

  const noise = makeNoise(opts.wrinkle?.seed ?? 2);
  const wScale = opts.wrinkle?.scale ?? 8;
  const wAmount = opts.wrinkle?.amount ?? 0;

  const positions: Vec3[] = [];
  const uvs: { x: number; y: number }[] = [];
  for (let i = 0; i <= rings; i++) {
    const f = i / rings;
    const t = tStart + (tEnd - tStart) * f;
    const center = add(limb.start, scale(axis, t));
    const baseR = limb.startRadius + (limb.endRadius - limb.startRadius) * t;
    const r = baseR + easeFn(f) + flareFn(f);
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * TAU;
      const radial = add(scale(u, Math.cos(a)), scale(v, Math.sin(a)));
      let rr = r;
      if (wAmount !== 0) {
        const w = fbm3(noise, center.x * wScale, center.y * wScale + a, center.z * wScale, { octaves: 3 });
        rr += w * wAmount;
      }
      positions.push(add(center, scale(radial, rr)));
      uvs.push(vec2(j / segments, f));
    }
  }

  const indices: number[] = [];
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const jn = (j + 1) % segments;
      const a = i * segments + j;
      const b = i * segments + jn;
      const c = (i + 1) * segments + j;
      const d = (i + 1) * segments + jn;
      indices.push(a, b, c, b, d, c);
    }
  }

  if (opts.capStart) capTubeRing(positions, uvs, indices, 0, segments, false);
  if (opts.capEnd) capTubeRing(positions, uvs, indices, rings, segments, true);

  return recomputeNormals(makeMesh({
    positions,
    normals: positions.map(() => vec3(0, 1, 0)),
    uvs,
    indices,
  }));
}

function capTubeRing(
  positions: Vec3[],
  uvs: { x: number; y: number }[],
  indices: number[],
  ring: number,
  segments: number,
  end: boolean,
): void {
  const start = ring * segments;
  let cx = 0, cy = 0, cz = 0;
  for (let j = 0; j < segments; j++) {
    const p = positions[start + j]!;
    cx += p.x; cy += p.y; cz += p.z;
  }
  const center = positions.length;
  positions.push(vec3(cx / segments, cy / segments, cz / segments));
  uvs.push(vec2(0.5, 0.5));
  for (let j = 0; j < segments; j++) {
    const jn = (j + 1) % segments;
    const a = start + j;
    const b = start + jn;
    if (end) indices.push(center, b, a);
    else indices.push(center, a, b);
  }
}
