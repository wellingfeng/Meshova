/**
 * Avatar body mesh (M3+ — renderable skin body).
 *
 * The avatar (avatar.ts) is a measurement + collision surface with no geometry.
 * For "character + clothes generated together", we need an actual body mesh the
 * garments sit on. This builds one from the SAME `Avatar`, so body and clothing
 * share one source of truth: change the measures and both update in lockstep.
 *
 * Construction (all from avatar data, deterministic):
 *   - torso: loft through the avatar's ellipse cross-sections.
 *   - limbs: tapered tubes around each Limb (reusing the sleeve tube math idea).
 *   - head + neck: a neck cylinder + an ellipsoid head above the neck base.
 *   - hands/feet are implied by the limb ends (kept simple; no digits).
 *
 * Surface: "skin" from the texture library so it renders as a body, not cloth.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, sub, scale, normalize, cross } from "../math/vec3.js";
import { TAU } from "../math/scalar.js";
import type { Mesh } from "../geometry/mesh.js";
import { merge } from "../geometry/mesh.js";
import { loft } from "../geometry/shapes.js";
import { sphere, box, transform, scaleMesh } from "../geometry/index.js";
import type { NamedPart } from "../geometry/export.js";
import type { Avatar, Limb } from "./avatar.js";
import { bodyPoint } from "./avatar.js";

export interface BodyOptions {
  /** Angular resolution around torso/limbs. */
  segments?: number;
  /** Vertical resolution of the torso loft (extra rings between sections). */
  torsoRings?: number;
  /** Skin tone (linear RGB). */
  skinColor?: [number, number, number];
  /** Include the head + neck. Default true. */
  head?: boolean;
  /** Include simple hands + feet at the limb ends. Default true. */
  extremities?: boolean;
  /** Skin texel density for the unified UV reprojection. Default 1.6. */
  uvDensity?: number;
}

const DEFAULT_SKIN: [number, number, number] = [0.82, 0.62, 0.5];

/** One torso ring: sample the body ellipse at height y into `segments` points. */
function torsoRing(avatar: Avatar, y: number, segments: number): Vec3[] {
  const ring: Vec3[] = [];
  for (let j = 0; j < segments; j++) {
    ring.push(bodyPoint(avatar, y, (j / segments) * TAU, 0));
  }
  return ring;
}

/** Loft the torso through the avatar's cross-sections, densified by torsoRings. */
function buildTorso(avatar: Avatar, segments: number, extra: number): Mesh {
  const ys: number[] = [];
  const secs = avatar.sections;
  for (let i = 0; i < secs.length - 1; i++) {
    const y0 = secs[i]!.y;
    const y1 = secs[i + 1]!.y;
    const steps = Math.max(1, extra);
    for (let k = 0; k < steps; k++) ys.push(y0 + (y1 - y0) * (k / steps));
  }
  ys.push(secs[secs.length - 1]!.y);
  const rings = ys.map((y) => torsoRing(avatar, y, segments));
  return loft(rings, { closed: false, caps: true });
}

/** A tapered tube around a limb (same axis/basis approach as limbSleeve). */
function buildLimbTube(limb: Limb, segments: number, rings: number): Mesh {
  const axis = sub(limb.end, limb.start);
  const dir = normalize(axis);
  const ref = Math.abs(dir.y) < 0.9 ? vec3(0, 1, 0) : vec3(1, 0, 0);
  const u = normalize(cross(ref, dir));
  const v = normalize(cross(dir, u));
  const ringList: Vec3[][] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const center = add(limb.start, scale(axis, t));
    const r = limb.startRadius + (limb.endRadius - limb.startRadius) * t;
    const ring: Vec3[] = [];
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * TAU;
      const radial = add(scale(u, Math.cos(a)), scale(v, Math.sin(a)));
      ring.push(add(center, scale(radial, r)));
    }
    ringList.push(ring);
  }
  return loft(ringList, { closed: false, caps: true });
}

/** Head: an ellipsoid above the neck base; neck: a short tube. */
function buildHead(avatar: Avatar, segments: number): Mesh {
  const L = avatar.landmarks;
  const neckTop = avatar.sections[avatar.sections.length - 1]!;
  const headR = (L.crown - L.chinLine) * 0.6 + 0.04;
  const headCy = L.chinLine + (L.crown - L.chinLine) * 0.55;
  const head = transform(
    scaleMesh(sphere(headR, segments, Math.max(10, Math.floor(segments * 0.6))), vec3(0.82, 1.0, 0.9)),
    { translate: vec3(0, headCy, 0) },
  );
  // Neck: tube from neck base up to chin line.
  const neckLimb: Limb = {
    id: "neck",
    start: vec3(0, neckTop.y - 0.01, 0),
    end: vec3(0, L.chinLine, 0),
    startRadius: neckTop.rx * 0.9,
    endRadius: neckTop.rx * 0.8,
  };
  const neck = buildLimbTube(neckLimb, segments, 3);
  return merge(head, neck);
}

/**
 * A stylized hand: a flattened palm ellipsoid plus a thumb nub off to one side.
 * `side` (-1 left, +1 right) mirrors the thumb so it points inward like a real
 * thumb. Still no individual fingers — a palm + thumb reads clearly as a hand
 * while staying cheap.
 */
function buildHand(limb: Limb, segments: number, side: number): Mesh {
  const dir = normalize(sub(limb.end, limb.start));
  const r = limb.endRadius;
  const seg = Math.max(10, Math.floor(segments * 0.5));
  // Palm center just past the wrist, along the arm direction.
  const center = add(limb.end, scale(dir, r * 1.4));
  // Long along the limb axis (Y; arms hang ~downward), wide across X, thin in Z.
  const palm = transform(
    scaleMesh(sphere(r, seg, 8), vec3(1.15, 1.8, 0.5)),
    { translate: center },
  );
  // Thumb: a small ellipsoid offset inward (+ toward body) and up toward wrist.
  const thumb = transform(
    scaleMesh(sphere(r * 0.5, 8, 6), vec3(1.2, 0.7, 0.6)),
    { translate: vec3(center.x - side * r * 0.95, center.y + r * 0.55, center.z + r * 0.1) },
  );
  return merge(palm, thumb);
}

/**
 * A stylized foot: a heel ball + a longer forefoot block extending forward (+Z)
 * from the ankle, sole flattened near the ground. No individual toes, but the
 * heel/forefoot split gives a recognizable shoe-last silhouette.
 */
function buildFoot(limb: Limb, segments: number): Mesh {
  const r = limb.endRadius;
  const ankle = limb.end;
  const seg = Math.max(10, Math.floor(segments * 0.5));
  const soleY = ankle.y - r * 0.5;
  // Heel: rounded ball under/behind the ankle.
  const heel = transform(
    scaleMesh(sphere(r, seg, 8), vec3(0.85, 0.7, 0.95)),
    { translate: vec3(ankle.x, soleY + r * 0.35, ankle.z - r * 0.15) },
  );
  // Forefoot: a flattened block sweeping forward to the toes, tapering down.
  const len = r * 3.0;
  const fore = transform(
    scaleMesh(box(r * 1.5, r * 0.85, len), vec3(1, 1, 1)),
    { translate: vec3(ankle.x, soleY + r * 0.28, ankle.z + len * 0.42) },
  );
  // Toe cap: round off the front of the forefoot.
  const toe = transform(
    scaleMesh(sphere(r * 0.75, seg, 6), vec3(1.0, 0.75, 0.9)),
    { translate: vec3(ankle.x, soleY + r * 0.28, ankle.z + len * 0.85) },
  );
  return merge(heel, fore, toe);
}

/**
 * Build the body as a single skin-surfaced NamedPart (merged). Returns one part
 * so it drops straight into a NamedPart[] scene next to the garments.
 */
export function buildBody(avatar: Avatar, opts: BodyOptions = {}): NamedPart {
  const segments = Math.max(8, opts.segments ?? 28);
  const extra = Math.max(1, opts.torsoRings ?? 2);
  const skin = opts.skinColor ?? DEFAULT_SKIN;
  const limbSeg = Math.max(10, Math.floor(segments * 0.6));

  const meshes: Mesh[] = [buildTorso(avatar, segments, extra)];
  for (const limb of avatar.limbs) {
    meshes.push(buildLimbTube(limb, limbSeg, 8));
    if (opts.extremities !== false) {
      if (limb.id.startsWith("arm_")) meshes.push(buildHand(limb, segments, limb.id.endsWith("_l") ? -1 : 1));
      else if (limb.id.startsWith("leg_")) meshes.push(buildFoot(limb, segments));
    }
  }
  if (opts.head !== false) meshes.push(buildHead(avatar, segments));

  const merged = reprojectSkinUV(merge(...meshes), opts.uvDensity ?? 1.6);

  return {
    name: "body",
    mesh: merged,
    color: skin,
    surface: { type: "skin", params: { color: skin } },
  };
}

/**
 * Reproject UVs onto the merged body with a single consistent texel density.
 * Each primitive (torso loft, limb tubes, blob hands/feet) ships its own 0..1
 * UV, so a thumb and the torso would get the SAME texture span -> visibly
 * different skin scale. We override with a world-space CYLINDRICAL projection:
 *   u = angle around the body's Y axis (one seam down the back),
 *   v = world height,
 * both scaled by `density` so texels are uniform everywhere.
 *
 * NOTE: a single UV channel cannot express a true triplanar blend (blending UV
 * *coordinates* smears the texture; you must blend sampled *colors* in a
 * shader). So the mesh keeps clean cylindrical UVs (good for export + the body
 * torso/head), and the viewer's skin material does the real per-pixel triplanar
 * blend in-shader to kill stretching on off-axis limbs (hands/feet).
 */
function reprojectSkinUV(mesh: Mesh, density: number): Mesh {
  const uvs = mesh.positions.map((p) => ({
    x: (Math.atan2(p.z, p.x) / TAU + 0.5) * density,
    y: p.y * density,
  }));
  return { ...mesh, uvs };
}

