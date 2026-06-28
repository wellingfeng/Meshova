/**
 * Garment templates (research M4/M5 first batch: T-shirt, skirt, pants).
 *
 * Each template is a parametric builder: avatar measures + style params ->
 * NamedPart[] (the same contract the rest of Meshova uses, so garments render
 * in the existing viewer and export through toViewerModel / toOBJScene).
 *
 * The shapes come from the heuristic drape (torso bands + limb tubes), so they
 * are watertight cloth shells with fabric/leather surfaces attached. Material
 * follows the research策略: pick a fabric preset (类别对), do not pixel-match.
 *
 * Deterministic: every param maps to geometry through pure functions + seeded
 * wrinkle noise.
 */
import type { NamedPart } from "../geometry/export.js";
import type { AvatarMeasures } from "./avatar.js";
import { buildAvatar } from "./avatar.js";
import { torsoShell, limbSleeve } from "./drape.js";
import { getFabric, drapeTuning, type Fabric } from "./fabric.js";
import { loft, solidify } from "../geometry/index.js";
import { makeMesh, recomputeNormals } from "../geometry/mesh.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { vec2 } from "../math/vec2.js";
import { TAU } from "../math/scalar.js";
import { bodyPoint } from "./avatar.js";
import type { Avatar } from "./avatar.js";

/**
 * Fabric thickness for solidify: heavier / stiffer cloth reads thicker. Keeps a
 * floor so even silk has a hair of depth (no zero-thickness edges that show
 * through at hems/cuffs/openings).
 */
function fabricThickness(fabric: Fabric): number {
  const ph = fabric.physical;
  return 0.004 + 0.012 * Math.min(1, ph.bendStiffness * 0.6 + ph.density * 0.4);
}

function clothPart(name: string, mesh: NamedPart["mesh"], fabric: Fabric, thickness?: number): NamedPart {
  // Single-sided shells by default (normals point outward; the winding
  // regression depends on this). Pass an explicit `thickness` to solidify a
  // panel into a double-layer shell with real edge depth when desired.
  const t = thickness ?? 0;
  const solid = t > 0 ? solidify(mesh, { thickness: t, offset: 0.5 }) : mesh;
  return {
    name,
    mesh: solid,
    color: fabric.visual.color,
    surface: { type: fabric.visual.surface, params: fabric.visual.params },
  };
}

/**
 * Build a watertight double-layer panel from two aligned (rings x cols) grids:
 * `outer` (visible, facing away from body) and `inner` (lining, facing body).
 * Both grids share the same (rings+1)*(cols+1) layout. We stitch:
 *   - outer surface (normals out), inner surface (normals in, reversed winding),
 *   - and seam the 4 open borders (top/bottom/left/right) so the two sheets
 *     join into a closed shell with real thickness — like a sewn hood.
 */
function doubleLayerPanel(outer: Vec3[][], inner: Vec3[][]): NamedPart["mesh"] {
  const nr = outer.length;
  const nc = outer[0]!.length;
  const positions: Vec3[] = [];
  const uvs: { x: number; y: number }[] = [];
  const indices: number[] = [];
  const idx = (layer: 0 | 1, i: number, j: number): number => layer * nr * nc + i * nc + j;

  for (const grid of [outer, inner]) {
    for (let i = 0; i < nr; i++) {
      for (let j = 0; j < nc; j++) {
        positions.push({ ...grid[i]![j]! });
        uvs.push(vec2(j / (nc - 1), i / (nr - 1)));
      }
    }
  }
  // Outer faces (CCW outward).
  for (let i = 0; i < nr - 1; i++) {
    for (let j = 0; j < nc - 1; j++) {
      const a = idx(0, i, j), b = idx(0, i, j + 1), c = idx(0, i + 1, j), d = idx(0, i + 1, j + 1);
      indices.push(a, b, d, a, d, c);
    }
  }
  // Inner faces (reversed winding so normals point toward the body).
  for (let i = 0; i < nr - 1; i++) {
    for (let j = 0; j < nc - 1; j++) {
      const a = idx(1, i, j), b = idx(1, i, j + 1), c = idx(1, i + 1, j), d = idx(1, i + 1, j + 1);
      indices.push(a, d, b, a, c, d);
    }
  }
  // Seam the four borders. Each seam quad bridges an outer edge segment to the
  // matching inner edge segment. Corners in rectangle order (c00,c01,c11,c10)
  // so the vertical sides are shared with neighbouring seam quads; the diagonal
  // c00->c11 stays internal. This is what makes the shell fully closed.
  const seam = (c00: number, c01: number, c11: number, c10: number) =>
    indices.push(c00, c01, c11, c00, c11, c10);
  for (let j = 0; j < nc - 1; j++) {          // top edge (i=0)
    seam(idx(0, 0, j), idx(0, 0, j + 1), idx(1, 0, j + 1), idx(1, 0, j));
  }
  for (let j = 0; j < nc - 1; j++) {          // bottom edge (i=nr-1)
    seam(idx(1, nr - 1, j), idx(1, nr - 1, j + 1), idx(0, nr - 1, j + 1), idx(0, nr - 1, j));
  }
  for (let i = 0; i < nr - 1; i++) {          // left edge (j=0)
    seam(idx(1, i, 0), idx(1, i + 1, 0), idx(0, i + 1, 0), idx(0, i, 0));
  }
  for (let i = 0; i < nr - 1; i++) {          // right edge (j=nc-1)
    seam(idx(0, i, nc - 1), idx(0, i + 1, nc - 1), idx(1, i + 1, nc - 1), idx(1, i, nc - 1));
  }
  return recomputeNormals(makeMesh({ positions, normals: positions.map(() => vec3(0, 1, 0)), uvs, indices }));
}

/**
 * A down-hood: a curved cloth sheet hanging behind the neck, conforming to the
 * body's back contour (sampled from bodyPoint) so it fits ANY measures. Built as
 * a sewn DOUBLE layer (outer shell + inner lining) so it reads as real fabric
 * with thickness, joined to the neckline at the top edge.
 */
function hoodPanel(avatar: Avatar, scale: number, segments = 20, rings = 10): NamedPart["mesh"] {
  const L = avatar.landmarks;
  const yTop = L.neckBase + 0.02 * scale;
  const yBottom = L.shoulderLine - (L.shoulderLine - L.chestLine) * 1.1 * scale;
  const arc = TAU * 0.34 * scale;
  const thickness = 0.012 + 0.01 * scale; // fabric thickness (gap between layers)
  const outer: Vec3[][] = [];
  const inner: Vec3[][] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const y = yTop + (yBottom - yTop) * t;
    // Drape gap grows toward the bottom (fabric falls away from the back).
    const gap = 0.02 + t * 0.06 * scale;
    const orow: Vec3[] = [];
    const irow: Vec3[] = [];
    for (let j = 0; j <= segments; j++) {
      const u = j / segments;
      const theta = Math.PI - arc / 2 + arc * u;
      orow.push(bodyPoint(avatar, y, theta, gap + thickness));
      irow.push(bodyPoint(avatar, y, theta, gap));
    }
    outer.push(orow);
    inner.push(irow);
  }
  return doubleLayerPanel(outer, inner);
}

/**
 * A kangaroo-pocket panel: a low-curvature cloth patch lying on the lower front
 * of the body, conforming to the front belly contour from bodyPoint.
 */
function pocketPanel(avatar: Avatar, yCenter: number, ease: number, segments = 14, rings = 8): NamedPart["mesh"] {
  const half = 0.11;
  const arc = TAU * 0.2;
  const ringList: Vec3[][] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const y = yCenter - half + 2 * half * t;
    // Pocket bulges out a little at the middle (a pouch), flat at the edges.
    const bulge = Math.sin(t * Math.PI) * 0.02;
    const ring: Vec3[] = [];
    for (let j = 0; j <= segments; j++) {
      const u = j / segments;
      const theta = -arc / 2 + arc * u; // front center is theta 0
      ring.push(bodyPoint(avatar, y, theta, ease + 0.012 + bulge));
    }
    ringList.push(ring);
  }
  return loft(ringList, { closed: false });
}

/* ------------------------------------------------------------------ */
/* T-shirt                                                            */
/* ------------------------------------------------------------------ */

export interface TShirtParams {
  measures: Partial<AvatarMeasures>;
  /** Ease (looseness) added around the torso. */
  chestEase: number;
  /** Fraction of torso height the body covers below the shoulder. */
  bodyLength: number;
  /** Sleeve length as fraction of arm (0 = sleeveless, 1 = full). */
  sleeveLength: number;
  /** Neckline drop below the neck base. */
  neckDrop: number;
  /** Sleeve looseness. */
  sleeveEase: number;
  fabric: string;
  seed: number;
}

export const TSHIRT_DEFAULTS: TShirtParams = {
  measures: {},
  chestEase: 0.06,
  bodyLength: 1.0,
  sleeveLength: 0.32,
  neckDrop: 0.05,
  sleeveEase: 0.03,
  fabric: "cottonJersey",
  seed: 11,
};

export function buildTShirt(params: Partial<TShirtParams> = {}): NamedPart[] {
  const p = { ...TSHIRT_DEFAULTS, ...params };
  const avatar = buildAvatar(p.measures);
  const L = avatar.landmarks;
  const fab = getFabric(p.fabric);
  const tune = drapeTuning(fab);
  const parts: NamedPart[] = [];

  const yTop = L.neckBase - p.neckDrop;
  // Hem reaches the hip for bodyLength=1, lower for tunics, higher for crops.
  const hem = L.waistLine - (L.waistLine - L.hipLine) * 1.4 * p.bodyLength;

  parts.push(
    clothPart(
      "tshirt_body",
      torsoShell(avatar, {
        yBottom: hem,
        yTop,
        rings: 28,
        segments: 40,
        ease: p.chestEase,
        capBottom: false,
        capTop: false,
        wrinkle: { seed: p.seed, scale: tune.wrinkleScale, amount: tune.wrinkleAmount },
      }),
      fab,
    ),
  );

  if (p.sleeveLength > 0.01) {
    for (const tag of ["l", "r"] as const) {
      const limb = avatar.limbs.find((x) => x.id === `arm_${tag}`)!;
      parts.push(
        clothPart(
          `tshirt_sleeve_${tag}`,
          limbSleeve(limb, {
            tStart: 0,
            tEnd: p.sleeveLength,
            ease: p.sleeveEase,
            rings: 10,
            segments: 18,
            capEnd: false,
            capStart: false,
            wrinkle: { seed: p.seed + 5, scale: tune.wrinkleScale + 2, amount: tune.wrinkleAmount * 0.7 },
          }),
          fab,
        ),
      );
    }
  }

  return parts;
}

/* ------------------------------------------------------------------ */
/* Skirt                                                              */
/* ------------------------------------------------------------------ */

export interface SkirtParams {
  measures: Partial<AvatarMeasures>;
  /** Waist ease. */
  waistEase: number;
  /** Hip ease. */
  hipEase: number;
  /** Skirt length below the waist, as fraction of leg length. */
  length: number;
  /** Outward flare added at the hem (A-line). */
  flare: number;
  fabric: string;
  seed: number;
}

export const SKIRT_DEFAULTS: SkirtParams = {
  measures: {},
  waistEase: 0.02,
  hipEase: 0.04,
  length: 0.55,
  flare: 0.12,
  fabric: "denim",
  seed: 21,
};

export function buildSkirt(params: Partial<SkirtParams> = {}): NamedPart[] {
  const p = { ...SKIRT_DEFAULTS, ...params };
  const avatar = buildAvatar(p.measures);
  const L = avatar.landmarks;
  const fab = getFabric(p.fabric);
  const tune = drapeTuning(fab);

  const yTop = L.waistLine;
  const yBottom = Math.max(L.ankle + 0.02, L.crotch - avatar.measures.legLength * p.length);

  // Ease grows from waist to hip; flare ramps in over the lower half, scaled by
  // the fabric's flare gain (soft/light fabrics flare more).
  const ease = (t: number): number => p.waistEase + (p.hipEase - p.waistEase) * Math.min(1, (1 - t) * 2);
  const flare = (t: number): number => p.flare * tune.flareGain * Math.pow(1 - t, 1.5);

  const mesh = torsoShell(avatar, {
    yBottom,
    yTop,
    rings: 26,
    segments: 40,
    ease,
    flare,
    capBottom: false,
    capTop: false,
    wrinkle: { seed: p.seed, scale: tune.wrinkleScale, amount: tune.wrinkleAmount * 1.4 },
  });
  return [clothPart("skirt", mesh, fab)];
}

/* ------------------------------------------------------------------ */
/* Pants                                                              */
/* ------------------------------------------------------------------ */

export interface PantsParams {
  measures: Partial<AvatarMeasures>;
  /** Hip/seat ease. */
  hipEase: number;
  /** Length down the leg (1 = full to ankle). */
  length: number;
  /** Leg opening flare (>0 wide leg, <0 tapered). */
  legOpening: number;
  /** Thigh ease. */
  thighEase: number;
  /** Waistband height above the hip line. */
  riseToWaist: number;
  fabric: string;
  seed: number;
}

export const PANTS_DEFAULTS: PantsParams = {
  measures: {},
  hipEase: 0.04,
  length: 1.0,
  legOpening: 0.0,
  thighEase: 0.03,
  riseToWaist: 0.0,
  fabric: "denim",
  seed: 31,
};

export function buildPants(params: Partial<PantsParams> = {}): NamedPart[] {
  const p = { ...PANTS_DEFAULTS, ...params };
  const avatar = buildAvatar(p.measures);
  const L = avatar.landmarks;
  const fab = getFabric(p.fabric);
  const tune = drapeTuning(fab);
  const parts: NamedPart[] = [];

  // Seat/hip band from waist down to crotch (closed tube around pelvis).
  const seatTop = L.waistLine + (L.chestLine - L.waistLine) * p.riseToWaist;
  parts.push(
    clothPart(
      "pants_seat",
      torsoShell(avatar, {
        yBottom: L.crotch,
        yTop: seatTop,
        rings: 14,
        segments: 36,
        ease: p.hipEase,
        capBottom: false,
        capTop: false,
        wrinkle: { seed: p.seed, scale: tune.wrinkleScale, amount: tune.wrinkleAmount },
      }),
      fab,
    ),
  );

  // Two trouser legs from the leg tubes.
  for (const tag of ["l", "r"] as const) {
    const limb = avatar.limbs.find((x) => x.id === `leg_${tag}`)!;
    const flareFn = (f: number) => p.legOpening * f;
    parts.push(
      clothPart(
        `pants_leg_${tag}`,
        limbSleeve(limb, {
          tStart: 0.0,
          tEnd: p.length,
          ease: p.thighEase,
          flare: flareFn,
          rings: 16,
          segments: 22,
          capEnd: false,
          capStart: false,
          wrinkle: { seed: p.seed + 7, scale: tune.wrinkleScale + 1, amount: tune.wrinkleAmount },
        }),
        fab,
      ),
    );
  }

  return parts;
}

/* ------------------------------------------------------------------ */
/* Dress (Tier 2) — bodice + flared skirt, optional sleeves            */
/* ------------------------------------------------------------------ */

export interface DressParams {
  measures: Partial<AvatarMeasures>;
  /** Bodice (upper) ease. */
  chestEase: number;
  /** Waistline drop/raise from the natural waist (fraction of torso). */
  waistline: number;
  /** Skirt length below the waist, fraction of leg length. */
  skirtLength: number;
  /** Skirt flare (A-line / ball gown volume). */
  flare: number;
  /** Sleeve length (0 = sleeveless). */
  sleeveLength: number;
  /** Neckline drop. */
  neckDrop: number;
  fabric: string;
  seed: number;
}

export const DRESS_DEFAULTS: DressParams = {
  measures: {},
  chestEase: 0.04,
  waistline: 0.0,
  skirtLength: 0.55,
  flare: 0.22,
  sleeveLength: 0.0,
  neckDrop: 0.06,
  fabric: "silk",
  seed: 41,
};

export function buildDress(params: Partial<DressParams> = {}): NamedPart[] {
  const p = { ...DRESS_DEFAULTS, ...params };
  const avatar = buildAvatar(p.measures);
  const L = avatar.landmarks;
  const fab = getFabric(p.fabric);
  const tune = drapeTuning(fab);
  const parts: NamedPart[] = [];

  // Waist seam line: natural waist nudged by `waistline` (empire <0, drop >0).
  const waistY = L.waistLine + (L.chestLine - L.waistLine) * p.waistline;
  const yTop = L.neckBase - p.neckDrop;
  const hem = Math.max(L.ankle + 0.02, L.crotch - avatar.measures.legLength * p.skirtLength);

  // Bodice: fitted torso band, neck base down to the waist seam.
  parts.push(
    clothPart(
      "dress_bodice",
      torsoShell(avatar, {
        yBottom: waistY,
        yTop,
        rings: 18,
        segments: 40,
        ease: p.chestEase,
        capBottom: false,
        capTop: false,
        wrinkle: { seed: p.seed, scale: tune.wrinkleScale, amount: tune.wrinkleAmount },
      }),
      fab,
    ),
  );

  // Skirt: waist seam down to hem, flaring out (gravity + fabric flare gain).
  const ease = (t: number): number => 0.02 + (1 - t) * 0.04;
  const flare = (t: number): number => p.flare * tune.flareGain * Math.pow(1 - t, 1.4);
  parts.push(
    clothPart(
      "dress_skirt",
      torsoShell(avatar, {
        yBottom: hem,
        yTop: waistY,
        rings: 28,
        segments: 44,
        ease,
        flare,
        capBottom: false,
        capTop: false,
        wrinkle: { seed: p.seed + 3, scale: tune.wrinkleScale, amount: tune.wrinkleAmount * 1.5 },
      }),
      fab,
    ),
  );

  if (p.sleeveLength > 0.01) {
    for (const tag of ["l", "r"] as const) {
      const limb = avatar.limbs.find((x) => x.id === `arm_${tag}`)!;
      parts.push(
        clothPart(
          `dress_sleeve_${tag}`,
          limbSleeve(limb, {
            tStart: 0,
            tEnd: p.sleeveLength,
            ease: 0.025,
            rings: 10,
            segments: 18,
            wrinkle: { seed: p.seed + 6, scale: tune.wrinkleScale + 2, amount: tune.wrinkleAmount * 0.7 },
          }),
          fab,
        ),
      );
    }
  }

  return parts;
}

/* ------------------------------------------------------------------ */
/* Hoodie (Tier 2) — loose body + sleeves + hood dome + pocket         */
/* ------------------------------------------------------------------ */

export interface HoodieParams {
  measures: Partial<AvatarMeasures>;
  /** Body looseness (hoodies are roomy). */
  chestEase: number;
  /** Body length (1 = hip, >1 longline). */
  bodyLength: number;
  /** Sleeve length (1 = full to wrist). */
  sleeveLength: number;
  /** Sleeve looseness. */
  sleeveEase: number;
  /** Hood size multiplier. */
  hoodScale: number;
  /** Kangaroo pocket on/off. */
  pocket: boolean;
  fabric: string;
  seed: number;
}

export const HOODIE_DEFAULTS: HoodieParams = {
  measures: {},
  chestEase: 0.12,
  bodyLength: 1.05,
  sleeveLength: 0.95,
  sleeveEase: 0.06,
  hoodScale: 1.0,
  pocket: true,
  fabric: "cottonJersey",
  seed: 51,
};

export function buildHoodie(params: Partial<HoodieParams> = {}): NamedPart[] {
  const p = { ...HOODIE_DEFAULTS, ...params };
  const avatar = buildAvatar(p.measures);
  const L = avatar.landmarks;
  const fab = getFabric(p.fabric);
  const tune = drapeTuning(fab);
  const parts: NamedPart[] = [];

  const yTop = L.neckBase - 0.02;
  const hem = L.waistLine - (L.waistLine - L.hipLine) * 1.5 * p.bodyLength;

  // Loose body.
  parts.push(
    clothPart(
      "hoodie_body",
      torsoShell(avatar, {
        yBottom: hem,
        yTop,
        rings: 26,
        segments: 40,
        ease: p.chestEase,
        capBottom: false,
        capTop: false,
        wrinkle: { seed: p.seed, scale: tune.wrinkleScale, amount: tune.wrinkleAmount * 1.2 },
      }),
      fab,
    ),
  );

  // Sleeves.
  for (const tag of ["l", "r"] as const) {
    const limb = avatar.limbs.find((x) => x.id === `arm_${tag}`)!;
    parts.push(
      clothPart(
        `hoodie_sleeve_${tag}`,
        limbSleeve(limb, {
          tStart: 0,
          tEnd: p.sleeveLength,
          ease: p.sleeveEase,
          flare: (f: number) => -0.015 * f, // taper toward a ribbed cuff
          rings: 12,
          segments: 18,
          wrinkle: { seed: p.seed + 5, scale: tune.wrinkleScale + 2, amount: tune.wrinkleAmount },
        }),
        fab,
      ),
    );
  }

  // Hood (down position): already a sewn DOUBLE-layer shell with its own
  // thickness, so pass thickness 0 (don't solidify a closed mesh again).
  parts.push(clothPart("hoodie_hood", hoodPanel(avatar, p.hoodScale), fab, 0));

  // Kangaroo pocket: a body-conforming patch on the lower front.
  if (p.pocket) {
    const pocketY = L.waistLine - (L.waistLine - hem) * 0.5;
    parts.push(clothPart("hoodie_pocket", pocketPanel(avatar, pocketY, p.chestEase), fab));
  }

  return parts;
}

/** All built-in garment template ids. */
export const GARMENT_TEMPLATES = ["tshirt", "skirt", "pants", "dress", "hoodie"] as const;
export type GarmentTemplateId = (typeof GARMENT_TEMPLATES)[number];

/** Build a garment by template id with default params merged with overrides. */
export function buildGarment(id: GarmentTemplateId, params: Record<string, unknown> = {}): NamedPart[] {
  switch (id) {
    case "tshirt":
      return buildTShirt(params as Partial<TShirtParams>);
    case "skirt":
      return buildSkirt(params as Partial<SkirtParams>);
    case "pants":
      return buildPants(params as Partial<PantsParams>);
    case "dress":
      return buildDress(params as Partial<DressParams>);
    case "hoodie":
      return buildHoodie(params as Partial<HoodieParams>);
    default:
      throw new Error(`unknown garment template: ${id}`);
  }
}
