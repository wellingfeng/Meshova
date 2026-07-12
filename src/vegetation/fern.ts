/**
 * Procedural fern — a CPU port of Vercidium's vertex-shader vegetation trick.
 *
 * The reference technique builds an entire fern in a vertex shader with no mesh
 * data: `gl_VertexID` alone drives every vertex. A pitch/yaw pair is turned into
 * a 3D direction via sin/cos, the frond bends by decreasing pitch along its
 * length (`bentPitch = pitch - distance * bendStrength`), leaflets step out on a
 * perpendicular axis, and several fronds are rotated around a shared center to
 * form the plant. We reproduce the same math on Meshova's immutable index mesh
 * so the result is an editable, re-runnable script model instead of a GPU-only
 * draw call.
 *
 * Determinism: fully seeded; no Math.random / Date.now.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, scale, normalize, cross } from "../math/vec3.js";
import type { Mesh } from "../geometry/mesh.js";
import { makeMesh, merge, recomputeNormals } from "../geometry/mesh.js";
import type { Vec2 } from "../math/vec2.js";
import { vec2 } from "../math/vec2.js";

/** Turn a pitch (from +Y down toward horizon) and yaw into a unit direction. */
function pitchYawDir(pitch: number, yaw: number): Vec3 {
  // pitch = 0 -> straight up (+Y); pitch = PI/2 -> horizontal.
  const sp = Math.sin(pitch);
  const cp = Math.cos(pitch);
  return vec3(sp * Math.cos(yaw), cp, sp * Math.sin(yaw));
}

export interface FrondBladeOptions {
  /** Leaflet pairs along the rachis (segments of the central stem). */
  segments?: number;
  /** Base pitch of the frond (radians from vertical). Higher = flatter. */
  pitch?: number;
  /** Yaw / heading of the frond around +Y (radians). */
  yaw?: number;
  /** How hard the frond curls over its length. Bigger = more droop. */
  bendStrength?: number;
  /** Total rachis length. */
  length?: number;
  /** Leaflet length at the base (tapers to the tip). */
  leafletLength?: number;
  /** Leaflet width. */
  leafletWidth?: number;
  /** Sweep-back angle of leaflets toward the tip (radians). */
  leafletAngle?: number;
  /** Phase 0..1 of the animated wind bend (0 = rest). */
  windPhase?: number;
  /** Wind bend amplitude added onto pitch. */
  windStrength?: number;
}

interface Built {
  positions: Vec3[];
  normals: Vec3[];
  uvs: Vec2[];
  indices: number[];
}

/**
 * Integrate the bending rachis: walk `segments` steps, at each step advancing
 * along the current bent direction. Mirrors the shader's per-vertex
 * `bentPitch = pitch - distance * bendStrength`, but accumulated so the stem is
 * a smooth curve rather than a fan from the origin.
 */
function rachisPoints(o: Required<FrondBladeOptions>): { pts: Vec3[]; dirs: Vec3[] } {
  const pts: Vec3[] = [];
  const dirs: Vec3[] = [];
  let p = vec3(0, 0, 0);
  const step = o.length / o.segments;
  const windBend = Math.sin(o.windPhase * Math.PI * 2) * o.windStrength;
  for (let i = 0; i <= o.segments; i++) {
    const distance = i / o.segments;
    const bentPitch = o.pitch + distance * o.bendStrength + windBend * distance * distance;
    const dir = pitchYawDir(bentPitch, o.yaw);
    pts.push({ ...p });
    dirs.push(dir);
    p = add(p, scale(dir, step));
  }
  return { pts, dirs };
}

function pushQuad(b: Built, a: Vec3, bb: Vec3, c: Vec3, d: Vec3): void {
  const base = b.positions.length;
  const zero = vec3(0, 0, 0);
  b.positions.push(a, bb, c, d);
  b.normals.push(zero, zero, zero, zero);
  b.uvs.push(vec2(0, 0), vec2(1, 0), vec2(1, 1), vec2(0, 1));
  b.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/**
 * One fern frond: a bending central rachis lined with paired leaflet cards.
 * Geometry is generated the same way the reference shader indexes vertices —
 * width via a step across the rachis, distance via steps along it.
 */
export function fernFrond(opts: FrondBladeOptions = {}): Mesh {
  const o: Required<FrondBladeOptions> = {
    segments: Math.max(3, Math.floor(opts.segments ?? 14)),
    pitch: opts.pitch ?? 0.35,
    yaw: opts.yaw ?? 0,
    bendStrength: opts.bendStrength ?? 1.15,
    length: opts.length ?? 1.0,
    leafletLength: opts.leafletLength ?? 0.22,
    leafletWidth: opts.leafletWidth ?? 0.05,
    leafletAngle: opts.leafletAngle ?? 0.7,
    windPhase: opts.windPhase ?? 0,
    windStrength: opts.windStrength ?? 0,
  };
  const { pts, dirs } = rachisPoints(o);
  const b: Built = { positions: [], normals: [], uvs: [], indices: [] };

  const up = vec3(0, 1, 0);
  for (let i = 1; i < pts.length; i++) {
    const center = pts[i]!;
    const tangent = dirs[i]!;
    // The whole frond curls inside one vertical plane. `planeNormal` is the
    // horizontal vector out of that plane; leaflets lie IN the plane and their
    // card faces point along planeNormal.
    let planeNormal = cross(tangent, up);
    if (planeNormal.x * planeNormal.x + planeNormal.y * planeNormal.y + planeNormal.z * planeNormal.z < 1e-8) {
      planeNormal = vec3(0, 0, 1);
    }
    planeNormal = normalize(planeNormal);
    // In-plane axis perpendicular to the rachis — the direction leaflets fan out.
    const inPlaneSide = normalize(cross(planeNormal, tangent));
    const distance = i / o.segments;
    const len = o.leafletLength * (1 - 0.75 * distance);
    if (len <= 1e-4) continue;
    const ca = Math.cos(o.leafletAngle);
    const sa = Math.sin(o.leafletAngle);
    for (const s of [-1, 1] as const) {
      // Leaflet direction: out along the in-plane side axis, swept toward the tip.
      const dir = normalize(add(scale(scale(inPlaneSide, s), ca), scale(tangent, sa)));
      // Flat leaflet blade lying in the frond plane: length along `dir`, width
      // in-plane perpendicular to it, face normal = planeNormal.
      const widthAxis = normalize(cross(planeNormal, dir));
      const hw = o.leafletWidth * 0.5;
      const a = add(center, scale(widthAxis, -hw));
      const bb = add(center, scale(widthAxis, hw));
      const tip = add(center, scale(dir, len));
      const c = add(tip, scale(widthAxis, hw));
      const d = add(tip, scale(widthAxis, -hw));
      pushQuad(b, a, bb, c, d);
    }
  }
  return recomputeNormals(makeMesh(b));
}

export interface FernOptions {
  seed?: number;
  /** Number of fronds radiating from the base. */
  fronds?: number;
  /** Base pitch of fronds (radians from vertical). */
  pitch?: number;
  /** Curl strength of each frond. */
  bendStrength?: number;
  /** Frond length. */
  length?: number;
  /** Leaflet pairs per frond. */
  segments?: number;
  leafletLength?: number;
  leafletWidth?: number;
  leafletAngle?: number;
  /** Animated wind phase 0..1. */
  windPhase?: number;
  windStrength?: number;
}

/**
 * A full fern: `fronds` bending blades fanned around +Y by even yaw steps with
 * a golden-angle jitter, exactly the "rotate leaves around a center" step in the
 * reference video. Returns a single merged mesh.
 */
export function fern(opts: FernOptions = {}): Mesh {
  const count = Math.max(1, Math.floor(opts.fronds ?? 8));
  const golden = 2.399963; // golden angle in radians for natural spacing
  const meshes: Mesh[] = [];
  for (let i = 0; i < count; i++) {
    const yaw = i * golden;
    // Outer fronds droop a little more than inner ones for a rosette look.
    const t = i / count;
    meshes.push(
      fernFrond({
        yaw,
        pitch: (opts.pitch ?? 0.45) + 0.12 * Math.sin(t * Math.PI),
        bendStrength: opts.bendStrength ?? 1.25,
        length: opts.length ?? 1.0,
        segments: opts.segments ?? 14,
        leafletLength: opts.leafletLength ?? 0.22,
        leafletWidth: opts.leafletWidth ?? 0.05,
        leafletAngle: opts.leafletAngle ?? 0.7,
        windPhase: (opts.windPhase ?? 0) + t * 0.15,
        windStrength: opts.windStrength ?? 0,
      }),
    );
  }
  return merge(...meshes);
}
