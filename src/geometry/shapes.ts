/**
 * P3 shape builders — revolve / sweep / loft and rounded primitives.
 *
 * These turn a few curve/profile parameters into recognizable models (bottles,
 * cups, wheels, handrails, blades, rounded hard-surface blocks). All pure
 * mesh-out, deterministic, normals recomputed by the consuming op.
 *
 * Profiles are 2D point lists in the XY plane: x = radius/offset from the axis,
 * y = height along the axis. Paths reuse the `Curve` type from curve.ts.
 */
import type { Vec3 } from "../math/vec3.js";
import type { Vec2 } from "../math/vec2.js";
import { vec3, add, sub, scale, cross, normalize, length, dot } from "../math/vec3.js";
import { vec2 } from "../math/vec2.js";
import { TAU } from "../math/scalar.js";
import type { Mesh } from "./mesh.js";
import { makeMesh, recomputeNormals } from "./mesh.js";
import type { Curve } from "./curve.js";

export interface LatheOptions {
  /** Rings around the axis. */
  segments?: number;
  /** Sweep angle in radians (default full revolution). */
  angle?: number;
  /** Cap the open ends when angle < full turn. */
  caps?: boolean;
}

/**
 * Revolve a 2D profile around the Y axis (Blender Spin / 3ds Max Lathe / Maya
 * Revolve). Profile points are (radius, height); the surface is the swept band.
 * Bottles, cups, vases, columns, wheel rims, turned legs.
 */
export function lathe(profile: Vec2[], opts: LatheOptions = {}): Mesh {
  if (profile.length < 2) return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  const segments = Math.max(3, Math.floor(opts.segments ?? 32));
  const sweepAngle = opts.angle ?? TAU;
  const full = Math.abs(sweepAngle - TAU) < 1e-6;
  const rings = full ? segments : segments + 1;

  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];
  const m = profile.length;

  for (let s = 0; s < rings; s++) {
    const a = (s / segments) * sweepAngle;
    const ca = Math.cos(a), sa = Math.sin(a);
    for (let i = 0; i < m; i++) {
      const p = profile[i]!;
      positions.push(vec3(p.x * ca, p.y, p.x * sa));
      normals.push(vec3(0, 1, 0));
      uvs.push(vec2(s / segments, i / (m - 1)));
    }
  }

  const ringStride = m;
  const ringCount = rings;
  for (let s = 0; s < (full ? segments : rings - 1); s++) {
    const s0 = (s % ringCount) * ringStride;
    const s1 = ((s + 1) % ringCount) * ringStride;
    for (let i = 0; i < m - 1; i++) {
      const a0 = s0 + i, a1 = s0 + i + 1;
      const b0 = s1 + i, b1 = s1 + i + 1;
      indices.push(a0, a1, b1, a0, b1, b0);
    }
  }

  if (opts.caps && !full) capLatheEnds(positions, normals, uvs, indices, profile, ringCount, ringStride, sweepAngle);

  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function capLatheEnds(
  positions: Vec3[], normals: Vec3[], uvs: Vec2[], indices: number[],
  profile: Vec2[], rings: number, stride: number, sweepAngle: number,
): void {
  // Triangle-fan each open end (start ring s=0 and final ring) to its centroid.
  const ends: Array<{ ring: number; flip: boolean }> = [
    { ring: 0, flip: false },
    { ring: rings - 1, flip: true },
  ];
  void sweepAngle;
  for (const e of ends) {
    const base = e.ring * stride;
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < profile.length; i++) {
      const p = positions[base + i]!;
      cx += p.x; cy += p.y; cz += p.z;
    }
    const inv = 1 / profile.length;
    const c = positions.length;
    positions.push(vec3(cx * inv, cy * inv, cz * inv));
    normals.push(vec3(0, 1, 0));
    uvs.push(vec2(0.5, 0.5));
    for (let i = 0; i < profile.length - 1; i++) {
      const a = base + i, b = base + i + 1;
      if (e.flip) indices.push(c, b, a);
      else indices.push(c, a, b);
    }
  }
}

function pickPerp(t: Vec3): Vec3 {
  const ax = Math.abs(t.x), ay = Math.abs(t.y), az = Math.abs(t.z);
  const other = ax < ay && ax < az ? vec3(1, 0, 0) : ay < az ? vec3(0, 1, 0) : vec3(0, 0, 1);
  return normalize(cross(t, other));
}

function rotAxis(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle), s = Math.sin(angle);
  return add(add(scale(v, c), scale(cross(axis, v), s)), scale(axis, dot(axis, v) * (1 - c)));
}

/** Parallel-transport frames along a curve (shared by sweep-like builders). */
function transportFrames(pts: Vec3[]): { tangent: Vec3; normal: Vec3; binormal: Vec3 }[] {
  const n = pts.length;
  const tangents = pts.map((_, i) => {
    const prev = pts[Math.max(0, i - 1)]!;
    const next = pts[Math.min(n - 1, i + 1)]!;
    return normalize(sub(next, prev));
  });
  let ref = pickPerp(tangents[0]!);
  const frames: { tangent: Vec3; normal: Vec3; binormal: Vec3 }[] = [];
  for (let i = 0; i < n; i++) {
    const t = tangents[i]!;
    ref = normalize(sub(ref, scale(t, dot(ref, t))));
    if (length(ref) < 1e-5) ref = pickPerp(t);
    const binormal = normalize(cross(t, ref));
    frames.push({ tangent: t, normal: ref, binormal });
    if (i < n - 1) {
      const axis = cross(t, tangents[i + 1]!);
      const al = length(axis);
      if (al > 1e-6) ref = rotAxis(ref, scale(axis, 1 / al), Math.asin(Math.min(1, al)));
    }
  }
  return frames;
}

export interface ProfileSweepOptions {
  /** Scale of the profile (0..1 along the curve) for tapering. */
  scaleAt?: (t: number) => number;
  /** Close the swept tube into a loop (for closed curves). */
  closed?: boolean;
  caps?: boolean;
}

/**
 * Sweep an arbitrary 2D cross-section (profile in the local normal/binormal
 * plane) along a curve. Unlike `sweep` (circular only), this handles square
 * tubes, rails, handrails, window frames, mouldings, cables with a flat side.
 */
export function profileSweep(curve: Curve, profile: Vec2[], opts: ProfileSweepOptions = {}): Mesh {
  const pts = curve.points;
  if (pts.length < 2 || profile.length < 2) {
    return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  }
  const frames = transportFrames(pts);
  const scaleAt = opts.scaleAt ?? (() => 1);
  const closed = opts.closed ?? curve.closed;
  const m = profile.length;
  const n = pts.length;

  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];

  for (let i = 0; i < n; i++) {
    const center = pts[i]!;
    const f = frames[i]!;
    const s = scaleAt(i / (n - 1));
    for (let j = 0; j < m; j++) {
      const p = profile[j]!;
      const off = add(scale(f.normal, p.x * s), scale(f.binormal, p.y * s));
      positions.push(add(center, off));
      normals.push(normalize(off));
      uvs.push(vec2(i / (n - 1), j / (m - 1)));
    }
  }

  const ringsToConnect = closed ? n : n - 1;
  for (let i = 0; i < ringsToConnect; i++) {
    const s0 = (i % n) * m;
    const s1 = ((i + 1) % n) * m;
    for (let j = 0; j < m - 1; j++) {
      const a0 = s0 + j, a1 = s0 + j + 1;
      const b0 = s1 + j, b1 = s1 + j + 1;
      indices.push(a0, a1, b1, a0, b1, b0);
    }
    // Close the profile loop (connect last vertex back to first).
    const la = s0 + m - 1, lb = s1 + m - 1;
    indices.push(la, s0, s1, la, s1, lb);
  }

  if (opts.caps && !closed) {
    fanCap(positions, normals, uvs, indices, 0, m, false);
    fanCap(positions, normals, uvs, indices, (n - 1) * m, m, true);
  }

  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function fanCap(
  positions: Vec3[], normals: Vec3[], uvs: Vec2[], indices: number[],
  base: number, m: number, flip: boolean,
): void {
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < m; i++) { const p = positions[base + i]!; cx += p.x; cy += p.y; cz += p.z; }
  const inv = 1 / m;
  const c = positions.length;
  positions.push(vec3(cx * inv, cy * inv, cz * inv));
  normals.push(vec3(0, 1, 0));
  uvs.push(vec2(0.5, 0.5));
  for (let i = 0; i < m; i++) {
    const a = base + i, b = base + ((i + 1) % m);
    if (flip) indices.push(c, b, a);
    else indices.push(c, a, b);
  }
}

export interface LoftOptions {
  /** Close the loft into a tube end-to-end. */
  closed?: boolean;
  caps?: boolean;
}

/**
 * Loft a surface through a sequence of cross-section rings (each an equal-length
 * list of 3D points). Maya/Max Loft — car body panels, boat hulls, organic
 * tubes, petals. All rings must share the same point count.
 */
export function loft(rings: Vec3[][], opts: LoftOptions = {}): Mesh {
  if (rings.length < 2) return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  const m = rings[0]!.length;
  if (m < 2 || rings.some((r) => r.length !== m)) {
    return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  }
  const n = rings.length;
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      positions.push({ ...rings[i]![j]! });
      normals.push(vec3(0, 1, 0));
      uvs.push(vec2(i / (n - 1), j / (m - 1)));
    }
  }
  const ringsToConnect = opts.closed ? n : n - 1;
  for (let i = 0; i < ringsToConnect; i++) {
    const s0 = (i % n) * m;
    const s1 = ((i + 1) % n) * m;
    for (let j = 0; j < m - 1; j++) {
      const a0 = s0 + j, a1 = s0 + j + 1;
      const b0 = s1 + j, b1 = s1 + j + 1;
      indices.push(a0, a1, b1, a0, b1, b0);
    }
  }
  if (opts.caps) {
    fanCap(positions, normals, uvs, indices, 0, m, false);
    fanCap(positions, normals, uvs, indices, (n - 1) * m, m, true);
  }
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

/** A rectangle profile (for profileSweep): half-width hw, half-height hh. */
export function rectProfile(hw = 0.1, hh = 0.1): Vec2[] {
  return [vec2(-hw, -hh), vec2(hw, -hh), vec2(hw, hh), vec2(-hw, hh)];
}

/** An L-shaped profile (handrails, skirting, trim). */
export function lProfile(w = 0.2, h = 0.2, t = 0.05): Vec2[] {
  return [vec2(0, 0), vec2(w, 0), vec2(w, t), vec2(t, t), vec2(t, h), vec2(0, h)];
}

/**
 * Capsule = cylinder with two hemispherical caps. Built by revolving a profile
 * so it's watertight. Common collision/blockout shape, limbs, pills, bottles.
 */
export function capsule(radius = 0.4, height = 1, segments = 24, rings = 6): Mesh {
  const r = radius;
  const halfCyl = Math.max(0, height / 2 - r); // cylindrical half-length
  const profile: Vec2[] = [];
  // Bottom pole up the right side: lower hemisphere -> cylinder -> upper hemi.
  profile.push(vec2(0, -halfCyl - r));
  for (let i = 1; i <= rings; i++) {
    const a = -Math.PI / 2 + (i / rings) * (Math.PI / 2);
    profile.push(vec2(Math.cos(a) * r, -halfCyl + Math.sin(a) * r));
  }
  if (halfCyl > 0) profile.push(vec2(r, halfCyl - 1e-6)); // ensure straight side
  for (let i = 1; i <= rings; i++) {
    const a = (i / rings) * (Math.PI / 2);
    profile.push(vec2(Math.cos(a) * r, halfCyl + Math.sin(a) * r));
  }
  profile.push(vec2(0, halfCyl + r));
  return lathe(profile, { segments });
}

export interface RoundedBoxOptions {
  width?: number;
  height?: number;
  depth?: number;
  /** Corner/edge fillet radius. */
  radius?: number;
  /** Subdivisions per quarter-round (higher = smoother corners). */
  steps?: number;
}

/**
 * Rounded box — a box with filleted edges and corners, built as a "spherified"
 * inflation of a subdivided cube so corners stay round. The hard-surface
 * blockout staple (controllers, casings, furniture, props), saving manual
 * bevels. radius is clamped to half the smallest dimension.
 */
export function roundedBox(opts: RoundedBoxOptions = {}): Mesh {
  const w = opts.width ?? 1, h = opts.height ?? 1, d = opts.depth ?? 1;
  const steps = Math.max(1, Math.floor(opts.steps ?? 4));
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const r = Math.min(opts.radius ?? 0.15, hw, hh, hd);
  // Inner box half-extents (the flat core); corners get rounded by radius r.
  const ix = hw - r, iy = hh - r, iz = hd - r;

  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];
  const keyToIdx = new Map<string, number>();

  const pushVert = (dir: Vec3): number => {
    // dir is a unit-ish direction on the cube; map to rounded surface.
    const k = `${Math.round(dir.x * 1e4)},${Math.round(dir.y * 1e4)},${Math.round(dir.z * 1e4)}`;
    const ex = keyToIdx.get(k);
    if (ex !== undefined) return ex;
    // Clamp the core offset to the inner box, add the rounded shell of radius r.
    const nrm = normalize(dir);
    const core = vec3(
      Math.max(-ix, Math.min(ix, dir.x * hw)),
      Math.max(-iy, Math.min(iy, dir.y * hh)),
      Math.max(-iz, Math.min(iz, dir.z * hd)),
    );
    const pos = add(core, scale(nrm, r));
    const idx = positions.length;
    positions.push(pos);
    normals.push(nrm);
    // Planar UV by the dominant normal axis (triplanar-style box projection),
    // normalized to the box extent. All-zero UVs make anisotropic materials
    // (brushedMetal etc.) compute NaN tangents and drop the whole render.
    const ax = Math.abs(nrm.x), ay = Math.abs(nrm.y), az = Math.abs(nrm.z);
    let uu: number, vv: number;
    if (ax >= ay && ax >= az) { uu = pos.z / (2 * hd) + 0.5; vv = pos.y / (2 * hh) + 0.5; }
    else if (ay >= ax && ay >= az) { uu = pos.x / (2 * hw) + 0.5; vv = pos.z / (2 * hd) + 0.5; }
    else { uu = pos.x / (2 * hw) + 0.5; vv = pos.y / (2 * hh) + 0.5; }
    uvs.push(vec2(uu, vv));
    keyToIdx.set(k, idx);
    return idx;
  };

  // Build 6 faces of a subdivided cube, each vertex mapped through pushVert.
  const faceAxes: Array<[Vec3, Vec3, Vec3]> = [
    [vec3(0, 0, 1), vec3(1, 0, 0), vec3(0, 1, 0)],
    [vec3(0, 0, -1), vec3(-1, 0, 0), vec3(0, 1, 0)],
    [vec3(1, 0, 0), vec3(0, 0, -1), vec3(0, 1, 0)],
    [vec3(-1, 0, 0), vec3(0, 0, 1), vec3(0, 1, 0)],
    [vec3(0, 1, 0), vec3(1, 0, 0), vec3(0, 0, -1)],
    [vec3(0, -1, 0), vec3(1, 0, 0), vec3(0, 0, 1)],
  ];
  const seg = steps * 2;
  for (const [normalDir, u, v] of faceAxes) {
    const grid: number[][] = [];
    for (let i = 0; i <= seg; i++) {
      grid[i] = [];
      const fi = (i / seg) * 2 - 1;
      for (let j = 0; j <= seg; j++) {
        const fj = (j / seg) * 2 - 1;
        const dir = add(add(normalDir, scale(u, fi)), scale(v, fj));
        grid[i]![j] = pushVert(dir);
      }
    }
    for (let i = 0; i < seg; i++) {
      for (let j = 0; j < seg; j++) {
        const a = grid[i]![j]!, b = grid[i + 1]![j]!;
        const c = grid[i + 1]![j + 1]!, e = grid[i]![j + 1]!;
        indices.push(a, b, c, a, c, e);
      }
    }
  }
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

export interface SegmentedTubeOptions {
  /** Cross-section resolution around the tube. Default 16. */
  sides?: number;
  /** Base radius (multiplied by radiusAt). Default 0.25. */
  radius?: number;
  /** Per-point radius profile, t in 0..1 along the spine. Default constant 1. */
  radiusAt?: (t: number) => number;
  /** Number of bulged segments (insect/worm body rings). 0 = smooth. Default 0. */
  segments?: number;
  /** How much each segment joint pinches in, 0..1. Default 0.18. */
  segmentPinch?: number;
  /** Extra bulge at each segment mid, as a radius fraction. Default 0.08. */
  segmentBulge?: number;
  /** Cap the ends. Default true. */
  caps?: boolean;
}

/**
 * Skin a single CONTINUOUS tube along a spine of points — the fix for
 * "string of beads" bodies. Unlike merging separate spheres, this produces one
 * watertight surface whose radius follows `radiusAt` and, when `segments`>0,
 * carries periodic ring bulges/pinches so it reads as a segmented insect
 * abdomen, worm, or finger without any seams. Deterministic.
 */
export function segmentedTube(spine: Vec3[], opts: SegmentedTubeOptions = {}): Mesh {
  if (spine.length < 2) return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  const sides = Math.max(3, Math.floor(opts.sides ?? 16));
  const baseR = opts.radius ?? 0.25;
  const radiusAt = opts.radiusAt ?? (() => 1);
  const segs = Math.max(0, Math.floor(opts.segments ?? 0));
  const pinch = opts.segmentPinch ?? 0.18;
  const bulge = opts.segmentBulge ?? 0.08;
  const caps = opts.caps ?? true;
  const n = spine.length;
  const frames = transportFrames(spine);

  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];

  const ringMod = (t: number): number => {
    if (segs <= 0) return 1;
    const phase = t * segs * Math.PI * 2;
    return 1 + bulge * Math.cos(phase) - pinch * Math.abs(Math.sin(phase * 0.5));
  };

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const center = spine[i]!;
    const { normal, binormal } = frames[i]!;
    const r = baseR * radiusAt(t) * ringMod(t);
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * TAU;
      const dir = add(scale(normal, Math.cos(a)), scale(binormal, Math.sin(a)));
      positions.push(add(center, scale(dir, r)));
      normals.push(dir);
      uvs.push(vec2(s / sides, t));
    }
  }

  const stride = sides + 1;
  for (let i = 0; i < n - 1; i++) {
    for (let s = 0; s < sides; s++) {
      const a = i * stride + s;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  if (caps) {
    const addCap = (ringStart: number, apex: Vec3, flip: boolean) => {
      const apexIdx = positions.length;
      positions.push(apex);
      normals.push(vec3(0, 0, 0));
      uvs.push(vec2(0.5, 0.5));
      for (let s = 0; s < sides; s++) {
        const a = ringStart + s;
        const b = ringStart + s + 1;
        if (flip) indices.push(apexIdx, b, a);
        else indices.push(apexIdx, a, b);
      }
    };
    addCap(0, spine[0]!, false);
    addCap((n - 1) * stride, spine[n - 1]!, true);
  }

  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}
