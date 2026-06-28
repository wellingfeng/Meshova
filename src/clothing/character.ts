/**
 * Character assembly (M3+ — body + clothing generated together).
 *
 * The whole point: one set of body measures drives BOTH the body mesh and every
 * garment, so clothes always fit. You list which garments to wear (by template
 * id + style params) and get back a single NamedPart[] scene: skin body first,
 * then each garment draped on the same avatar.
 *
 * Because every garment builder takes the same `measures`, fit is automatic —
 * change `chest` once and the body, shirt, and jacket all resize in lockstep.
 * Garment params may omit `measures`; we inject the character's measures so a
 * caller can't accidentally dress a different-sized body.
 */
import type { NamedPart } from "../geometry/export.js";
import type { Mesh } from "../geometry/mesh.js";
import { makeMesh } from "../geometry/mesh.js";
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, sub, scale, dot, cross, normalize, length } from "../math/vec3.js";
import { TAU } from "../math/scalar.js";
import type { AvatarMeasures, Avatar } from "./avatar.js";
import { buildAvatar } from "./avatar.js";
import { buildBody, type BodyOptions } from "./body.js";
import { buildGarment, type GarmentTemplateId } from "./templates.js";

/** One garment layer to put on the character. */
export interface GarmentLayer {
  template: GarmentTemplateId;
  /** Style params (fabric, length, ease, ...). `measures` is injected/overridden. */
  params?: Record<string, unknown>;
}

export interface CharacterOptions {
  /** Body measures; shared by the body and all garments so everything fits. */
  measures?: Partial<AvatarMeasures>;
  /** Garments to wear, in draw order (inner -> outer). */
  garments?: GarmentLayer[];
  /** Render the skin body. Default true; set false for clothing-only output. */
  body?: boolean;
  /** Body mesh detail/skin options. */
  bodyOptions?: BodyOptions;
  /**
   * Remove body triangles fully hidden under clothing (saves tris + avoids skin
   * poking through thin cloth). Default true when garments are present.
   */
  cullHidden?: boolean;
}

export interface CharacterResult {
  parts: NamedPart[];
  measures: AvatarMeasures;
}

/**
 * Build a dressed character: skin body + garments, all sized from one set of
 * measures. Returns parts ready for toViewerModel / toOBJScene / export.
 */
export function buildCharacter(opts: CharacterOptions = {}): CharacterResult {
  const avatar = buildAvatar(opts.measures);
  const parts: NamedPart[] = [];
  const garmentParts: NamedPart[] = [];

  for (const layer of opts.garments ?? []) {
    // Inject the character measures so the garment fits THIS body. Caller
    // params win for style, but measures are forced to the character's.
    const params = { ...(layer.params ?? {}), measures: opts.measures ?? {} };
    garmentParts.push(...buildGarment(layer.template, params));
  }

  if (opts.body !== false) {
    const body = buildBody(avatar, opts.bodyOptions ?? {});
    const cull = opts.cullHidden ?? garmentParts.length > 0;
    if (cull) body.mesh = cullHiddenBody(body.mesh, garmentParts, avatar);
    parts.push(body);
  }
  parts.push(...garmentParts);

  return { parts, measures: avatar.measures };
}

const AX = 24;   // axial bins along each bone
const AN = 24;   // angular bins around each bone

interface Bone {
  start: Vec3;
  dir: Vec3;     // unit start->end
  len: number;
  u: Vec3;       // perpendicular basis
  v: Vec3;
}

/** Build the skeleton bones: a central torso axis + every limb segment. */
function skeleton(avatar: Avatar): Bone[] {
  const segs = avatar.sections;
  const torso: [Vec3, Vec3] = [
    vec3(0, segs[0]!.y, 0),
    vec3(0, segs[segs.length - 1]!.y, 0),
  ];
  const pairs: [Vec3, Vec3][] = [torso, ...avatar.limbs.map((l) => [l.start, l.end] as [Vec3, Vec3])];
  return pairs.map(([s, e]) => {
    const axis = sub(e, s);
    const len = Math.max(1e-6, length(axis));
    const dir = scale(axis, 1 / len);
    const ref = Math.abs(dir.y) < 0.9 ? vec3(0, 1, 0) : vec3(1, 0, 0);
    const u = normalize(cross(ref, dir));
    const v = normalize(cross(dir, u));
    return { start: s, dir, len, u, v };
  });
}

/** Project a point onto a bone: axial param t in [0,1], radial r, angle. */
function boneCoord(
  b: Bone,
  p: Vec3,
): { t: number; r: number; ang: number; perp: number; over: number } {
  const rel = sub(p, b.start);
  const along = dot(rel, b.dir);
  const t = Math.min(1, Math.max(0, along / b.len));
  // Radial vector = rel minus its axial component, measured at the clamped foot.
  const foot = add(b.start, scale(b.dir, t * b.len));
  const radv = sub(p, foot);
  const ru = dot(radv, b.u);
  const rv = dot(radv, b.v);
  const r = Math.hypot(ru, rv);
  const ang = Math.atan2(rv, ru);
  // over = how far the projection overshoots the bone's axial span [0,len].
  // Points beyond a cap (e.g. the head above the torso bone) have over > 0 and
  // must NOT be treated as "beside" the bone — otherwise they'd be culled by
  // cloth binned into the cap cell. perp folds the overshoot into the
  // nearest-bone distance so a head vertex prefers no bone over a false torso hit.
  const over = Math.max(0, along - b.len, -along);
  return { t, r, ang, perp: Math.hypot(r, over), over };
}

function axBin(t: number): number {
  return Math.min(AX - 1, Math.max(0, Math.floor(t * AX)));
}
function angBin(ang: number): number {
  return Math.min(AN - 1, Math.max(0, Math.floor((ang / TAU + 0.5) * AN)));
}

/**
 * Cull body triangles fully hidden under clothing, using a TUBULAR distance
 * field around the avatar skeleton (torso axis + limb axes) instead of a single
 * global vertical axis. For each bone we bin cloth by (axial, angular) and store
 * the nearest cloth radius; a body vertex is "covered" when, relative to its
 * nearest bone, it sits inside the cloth radius (minus a safety margin) in a
 * cell that cloth actually reaches. This handles slanted sleeves / trouser legs
 * correctly, where a vertical-axis test would over- or under-cull.
 */
function cullHiddenBody(body: Mesh, garments: NamedPart[], avatar: Avatar, margin = 0.015): Mesh {
  const bones = skeleton(avatar);
  // grids[boneIndex] = Float64Array(AX*AN) of min cloth radius (Infinity = none)
  const grids = bones.map(() => new Float64Array(AX * AN).fill(Infinity));

  const assign = (p: Vec3): { bi: number; c: { t: number; r: number; ang: number; perp: number; over: number } } => {
    let bi = 0, best = Infinity, bc = boneCoord(bones[0]!, p);
    for (let i = 0; i < bones.length; i++) {
      const c = boneCoord(bones[i]!, p);
      if (c.perp < best) { best = c.perp; bi = i; bc = c; }
    }
    return { bi, c: bc };
  };

  for (const g of garments) {
    for (const p of g.mesh.positions) {
      const { bi, c } = assign(p);
      // Cloth that overshoots its bone's cap (rare) shouldn't seed a cap cell
      // used to cull geometry beyond the bone (e.g. the head). Skip it.
      if (c.over > margin) continue;
      const k = axBin(c.t) * AN + angBin(c.ang);
      if (c.r < grids[bi]![k]!) grids[bi]![k] = c.r;
    }
  }

  const covered = body.positions.map((p) => {
    const { bi, c } = assign(p);
    // A vertex beyond the bone's axial span (head above the torso bone, fingertips
    // past a limb) isn't laterally under cloth; never cull it from the cap cell.
    if (c.over > margin) return false;
    const clothR = grids[bi]![axBin(c.t) * AN + angBin(c.ang)]!;
    if (!isFinite(clothR)) return false;
    return c.r < clothR - margin;
  });

  const idx = body.indices;
  const keep: number[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t]!, b = idx[t + 1]!, c = idx[t + 2]!;
    if (covered[a] && covered[b] && covered[c]) continue; // fully hidden
    keep.push(a, b, c);
  }
  // Compact to referenced vertices only.
  const remap = new Map<number, number>();
  const positions = [], normals = [], uvs = [];
  const newIdx: number[] = [];
  for (const old of keep) {
    let ni = remap.get(old);
    if (ni === undefined) {
      ni = positions.length;
      positions.push({ ...body.positions[old]! });
      normals.push({ ...body.normals[old]! });
      uvs.push({ ...body.uvs[old]! });
      remap.set(old, ni);
    }
    newIdx.push(ni);
  }
  return makeMesh({ positions, normals, uvs, indices: newIdx });
}

