/**
 * Chinese classical architecture generator — the "殿堂" (timber hall) category.
 *
 * Reconstructed as original TypeScript geometry from the layered anatomy of a
 * Chinese ritual/palace hall (referenced only as a parts taxonomy, not copied
 * from any GPL/asset source): the same 0..6 construction order a real 抬梁式
 * timber frame follows —
 *
 *   0 台基 base        stone platform + front steps (踏跺)
 *   1 柱   columns     the column grid (檐柱 perimeter, 金柱 interior)
 *   2 额枋 architrave   tie-beams (阑额/额枋) locking the column heads
 *   3 斗拱 dougong      bracket sets on the column heads carrying the eave
 *   4 屋顶 roof         the defining curved hip roof (举架 concave pitch +
 *                       翼角起翘 upturned corner eaves) with ridge + tiles
 *   5 墙   walls        infill walls, lattice doors (隔扇) on the front bay
 *   6 脊兽 ridge        ridge ornaments (正吻 + 垂脊小兽)
 *
 * Everything is parameter + seed driven and returns a NamedPart[] with matched
 * surface materials (painted timber columns/beams, stone platform, glazed clay
 * roof tiles), built WITH the model so material and shape stay aligned. The
 * concave roof + upturned corners are what make it read as Chinese rather than
 * a generic gable — that is where most of the geometry effort goes.
 */
import { vec3, type Vec3 } from "../math/vec3.js";
import { vec2, type Vec2 } from "../math/vec2.js";
import { TAU } from "../math/scalar.js";
import { makeRng } from "../random/prng.js";
import {
  box,
  cylinder,
  prism,
  merge,
  transform,
  translateMesh,
  scaleMesh,
  taperMesh,
  makeMesh,
  recomputeNormals,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";

type RGB = [number, number, number];

/** Roof style. 庑殿 = hip (4 slopes), 歇山 = hip-gable, 硬山 = flush gable. */
export type ChineseRoofType = "hip" | "hipGable" | "gable";

export interface ChineseHallParams {
  /** Bays across the front (面阔间数); columns = bays+1. */
  baysX: number;
  /** Bays in depth (进深间数). */
  baysZ: number;
  /** One bay width (间广) along X. */
  bayWidth: number;
  /** One bay depth along Z. */
  bayDepth: number;
  /** Column height 檐柱高 (eave column). */
  columnHeight: number;
  /** Column radius. */
  columnRadius: number;
  /** Stone platform (台基) height. */
  baseHeight: number;
  /** Platform overhang beyond the column grid on every side. */
  baseOverhang: number;
  /** Eave overhang beyond the outer columns (出檐). */
  eaveOverhang: number;
  /** Roof rise as a fraction of plan half-depth (举高比) — controls steepness. */
  roofRise: number;
  /** Concavity of the roof pitch (举架 0=straight rafter, 1=strongly concave). */
  roofConcavity: number;
  /** Corner upturn 翼角起翘 amount (extra Y lift at the corners). */
  cornerUpturn: number;
  /** Roof style. */
  roof: ChineseRoofType;
  /** Include dougong bracket sets. */
  dougong: boolean;
  /** Include ridge ornaments (正吻/脊兽). */
  ridgeBeasts: boolean;
  /** Include front lattice doors + side/back infill walls. */
  walls: boolean;
  /** Variant seed. */
  seed: number;
}

export const CHINESE_HALL_DEFAULTS: ChineseHallParams = {
  baysX: 5,
  baysZ: 3,
  bayWidth: 2.2,
  bayDepth: 1.9,
  columnHeight: 3.0,
  columnRadius: 0.16,
  baseHeight: 0.7,
  baseOverhang: 1.1,
  eaveOverhang: 1.25,
  roofRise: 0.36,
  roofConcavity: 0.55,
  cornerUpturn: 0.7,
  roof: "hip",
  dougong: true,
  ridgeBeasts: true,
  walls: true,
  seed: 9,
};

// Painted-timber palette (imperial polychrome): cinnabar columns, dark timber
// framing, gray stone platform, green-glazed clay roof tiles, gold ridge.
const STONE: RGB = [0.72, 0.7, 0.66];
const STONE_DK: RGB = [0.58, 0.56, 0.52];
const COLUMN_RED: RGB = [0.55, 0.12, 0.09];
const BEAM_RED: RGB = [0.5, 0.11, 0.08];
const BEAM_GREEN: RGB = [0.09, 0.28, 0.24];
const BRACKET_GREEN: RGB = [0.11, 0.32, 0.27];
const BRACKET_GOLD: RGB = [0.72, 0.55, 0.18];
const ROOF_TILE: RGB = [0.16, 0.3, 0.24];
const ROOF_RIDGE: RGB = [0.66, 0.5, 0.16];
const WALL_OCHRE: RGB = [0.62, 0.28, 0.16];
const DOOR_WOOD: RGB = [0.34, 0.14, 0.08];
const RAFTER_RED: RGB = [0.46, 0.14, 0.1]; // 檐椽 eave rafters
const PLINTH: RGB = [0.5, 0.49, 0.46]; // 柱础 column plinth stone

// ---------------------------------------------------------------------------
// Roof profile math — the 举架 (concave rise) curve and 翼角 (corner upturn).
// ---------------------------------------------------------------------------

/**
 * The 举架 pitch curve. Given a horizontal fraction t in [0,1] from ridge (0)
 * to eave (1), return the height fraction in [0,1] from eave (0) to ridge (1).
 * A straight rafter is linear; Chinese roofs bow the line downward so the lower
 * courses flatten and the eave sweeps out. `concavity` blends between straight
 * (0) and a strong power curve (1).
 */
function jujiaHeight(t: number, concavity: number): number {
  // h at eave (t=1) = 0, at ridge (t=0) = 1.
  const linear = 1 - t;
  const bowed = Math.pow(1 - t, 1 + 1.6 * concavity);
  return linear * (1 - concavity) + bowed * concavity;
}

/**
 * Build ONE roof slope as a curved quad grid, then let the caller mirror/rotate
 * it into the full hip. The slope spans from the ridge line (u=0, at halfSpan
 * inboard, full height) down to the eave (u=1, at the eave edge, low). Along the
 * ridge direction v in [0,1] the two ends lift by `upturn` to make 翼角起翘.
 *
 * halfSpan   : horizontal run of this slope (ridge center -> eave edge)
 * ridgeLen   : length of the ridge for this slope (X extent for front/back)
 * eaveExtra  : how far the eave edge juts past the ridge ends (hip splay)
 */
function roofSlope(
  halfSpan: number,
  ridgeHalf: number,
  eaveExtra: number,
  rise: number,
  eaveY: number,
  concavity: number,
  upturn: number,
  tileCourses = 0, // number of 筒瓦 courses across v; 0 = smooth surface
  rows = 14,
): Mesh {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];

  // Resolve v-resolution: with tile courses we need several samples per course
  // so the corrugation reads as rounded 筒瓦 rolls separated by 板瓦 valleys.
  const samplesPerCourse = 6;
  const cols = tileCourses > 0 ? tileCourses * samplesPerCourse : 12;
  const tileDepth = 0.05; // corrugation amplitude (world units)

  for (let iu = 0; iu <= rows; iu++) {
    const u = iu / rows; // 0 ridge -> 1 eave
    const z = u * halfSpan; // horizontal run outward
    const hFrac = jujiaHeight(u, concavity); // 1 ridge -> 0 eave
    const y = eaveY + hFrac * rise;
    // The eave line is wider than the ridge line (hip splay); interpolate the
    // half-width available at this u.
    const halfW = ridgeHalf + u * eaveExtra;
    for (let iv = 0; iv <= cols; iv++) {
      const v = iv / cols; // 0..1 across the ridge direction
      const x = (v - 0.5) * 2 * halfW;
      // Corner upturn: lift Y near the two ends (v->0 and v->1), strongest at
      // the eave (u=1). This is 翼角起翘.
      const edge = Math.pow(Math.abs(v - 0.5) * 2, 2.4);
      const lift = edge * u * u * upturn;
      // 瓦垄: rounded 筒瓦 rolls running down the slope. abs(sin) gives fat
      // rolls that sit above a flat 板瓦 base line, so the eave reads as a row
      // of half-cylinders — the single strongest "Chinese roof" cue.
      let tile = 0;
      if (tileCourses > 0) {
        const s = Math.abs(Math.sin(v * tileCourses * Math.PI));
        tile = Math.pow(s, 0.6) * tileDepth;
      }
      positions.push(vec3(x, y + lift + tile, z));
      normals.push(vec3(0, 1, 0));
      uvs.push(vec2(v * (tileCourses > 0 ? tileCourses : 1), u));
    }
  }
  const stride = cols + 1;
  for (let iu = 0; iu < rows; iu++) {
    for (let iv = 0; iv < cols; iv++) {
      const a = iu * stride + iv;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, d, a, d, b);
    }
  }
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

/**
 * Assemble the full curved hip roof from four slopes (front/back full-width,
 * left/right end slopes). Returns { tiles, ridge } meshes. `planHalfX`/`planHalfZ`
 * are the eave half-extents; `ridgeHalfX` is half the top ridge length.
 */
function buildHipRoof(
  planHalfX: number,
  planHalfZ: number,
  eaveY: number,
  rise: number,
  concavity: number,
  upturn: number,
  style: ChineseRoofType,
): { tiles: Mesh; ridge: Mesh } {
  const slopes: Mesh[] = [];
  // For a hip roof the ridge runs along X. Ridge length = 2*ridgeHalfX.
  const ridgeHalfX = style === "gable" ? planHalfX : Math.max(0.2, planHalfX - planHalfZ);

  // Number of 瓦垄 courses is proportional to the eave width so tile pitch stays
  // roughly constant (~0.34 world units per course) regardless of hall size.
  const courses = (halfW: number) => Math.max(6, Math.round((halfW * 2) / 0.34));

  // Front slope (faces +Z): its ridge line sits over the roof center, eave at +Z.
  const front = roofSlope(planHalfZ, ridgeHalfX, planHalfX - ridgeHalfX, rise, eaveY, concavity, upturn, courses(planHalfX));
  slopes.push(translateMesh(front, vec3(0, 0, 0)));
  // Back slope: mirror across Z.
  const back = transform(front, { rotate: vec3(0, Math.PI, 0) });
  slopes.push(back);

  if (style !== "gable") {
    // End slopes (庑殿 hip triangles): horizontal run is only planHalfZ (eave to
    // the hip diagonal), the ridge edge collapses to the ridge END point, and
    // the eave edge splays to full depth. After rotating the slope so its run
    // aligns with X, translate the ridge tip onto ±ridgeHalfX so the four hips
    // meet the main ridge cleanly (no穿透).
    const end = roofSlope(planHalfZ, 0.02, planHalfZ, rise, eaveY, concavity, upturn, courses(planHalfZ), 10);
    const right = translateMesh(transform(end, { rotate: vec3(0, Math.PI / 2, 0) }), vec3(ridgeHalfX, 0, 0));
    const left = translateMesh(transform(end, { rotate: vec3(0, -Math.PI / 2, 0) }), vec3(-ridgeHalfX, 0, 0));
    slopes.push(right, left);
  }

  // 檐口: a thin eave board (连檐) capping the four eave edges, plus a row of
  // 瓦当 (round tile-end discs) marking each 筒瓦 course at the front/back eave.
  // This gives the eave a crisp built edge instead of a bare mesh boundary.
  const eaveEdgeY = eaveY + 0.01;
  slopes.push(translateMesh(box(planHalfX * 2 + 0.1, 0.09, 0.1), vec3(0, eaveEdgeY, planHalfZ)));
  slopes.push(translateMesh(box(planHalfX * 2 + 0.1, 0.09, 0.1), vec3(0, eaveEdgeY, -planHalfZ)));
  if (style !== "gable") {
    slopes.push(translateMesh(box(0.1, 0.09, planHalfZ * 2 + 0.1), vec3(planHalfX, eaveEdgeY, 0)));
    slopes.push(translateMesh(box(0.1, 0.09, planHalfZ * 2 + 0.1), vec3(-planHalfX, eaveEdgeY, 0)));
  }
  const nWadang = courses(planHalfX);
  for (let k = 0; k < nWadang; k++) {
    const v = (k + 0.5) / nWadang;
    const x = (v - 0.5) * 2 * planHalfX;
    const disc = cylinder(0.05, 0.04, 10, true);
    const rot = transform(disc, { rotate: vec3(Math.PI / 2, 0, 0) });
    slopes.push(translateMesh(rot, vec3(x, eaveEdgeY + 0.04, planHalfZ + 0.05)));
    slopes.push(translateMesh(rot, vec3(x, eaveEdgeY + 0.04, -planHalfZ - 0.05)));
  }

  const tiles = merge(...slopes);

  // Main ridge (正脊): a raised bar along X sitting on top of the tiles, exactly
  // spanning the ridge line (no overhang past the ridge ends).
  const ridgeY = eaveY + rise;
  const ridgeBar = translateMesh(
    box(ridgeHalfX * 2, 0.26, 0.32),
    vec3(0, ridgeY + 0.1, 0),
  );
  const ridgeParts: Mesh[] = [ridgeBar];
  if (style !== "gable") {
    // Four hip ridges (垂脊/戗脊) running from the ridge ends down the hip
    // diagonals to each upturned corner. Built as a dense chain of small blocks
    // that follow the concave roof surface, so they hug the tiles instead of
    // floating on a straight bar. The corner sits at eaveY + upturn (翼角起翘).
    const cornerY = eaveY + upturn + 0.04;
    const steps = 14;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        for (let k = 0; k <= steps; k++) {
          const t = k / steps;
          // Follow the concave pitch (jujia) in Y, straight in plan.
          const x = sx * (ridgeHalfX + t * (planHalfX - ridgeHalfX));
          const z = sz * (t * planHalfZ);
          const surfaceY = eaveY + jujiaHeight(t, concavity) * rise;
          // Corner upturn near the eave end lifts the very tip.
          const lift = Math.pow(t, 2.4) * upturn;
          const y = Math.max(surfaceY + 0.08, eaveY) + lift * 0.7;
          const yEnd = k === steps ? cornerY : y;
          ridgeParts.push(translateMesh(box(0.16, 0.14, 0.16), vec3(x, yEnd, z)));
        }
      }
    }
  }
  return { tiles, ridge: merge(...ridgeParts) };
}


/**
 * One 斗拱 bracket set: a base block (大斗) + two crossed arms (拱) + small
 * blocks (升) on the arm ends. Simplified but reads as a stepped bracket.
 */
function dougongSet(size: number): Mesh {
  const parts: Mesh[] = [];
  const dou = box(size * 0.9, size * 0.5, size * 0.9); // 大斗
  parts.push(translateMesh(dou, vec3(0, size * 0.25, 0)));
  // Two tiers of crossed arms, each wider and higher.
  for (let tier = 0; tier < 2; tier++) {
    const y = size * (0.6 + tier * 0.45);
    const armLen = size * (1.6 + tier * 0.9);
    const armX = box(armLen, size * 0.24, size * 0.34);
    const armZ = box(size * 0.34, size * 0.24, armLen);
    parts.push(translateMesh(armX, vec3(0, y, 0)));
    parts.push(translateMesh(armZ, vec3(0, y, 0)));
    // 升 blocks on the four arm ends.
    const half = armLen / 2;
    for (const s of [-1, 1]) {
      parts.push(translateMesh(box(size * 0.4, size * 0.3, size * 0.4), vec3(s * half, y + size * 0.2, 0)));
      parts.push(translateMesh(box(size * 0.4, size * 0.3, size * 0.4), vec3(0, y + size * 0.2, s * half)));
    }
  }
  return merge(...parts);
}

// ---------------------------------------------------------------------------
// Main entry — assemble the hall following the 0..6 construction order.
// ---------------------------------------------------------------------------

/**
 * Build a Chinese timber hall as named parts. This is the public entry the
 * viewer registry and examples call.
 */
export function buildChineseHallParts(
  params: Partial<ChineseHallParams> = {},
): NamedPart[] {
  const p: ChineseHallParams = { ...CHINESE_HALL_DEFAULTS, ...params };
  const baysX = Math.max(1, Math.round(p.baysX));
  const baysZ = Math.max(1, Math.round(p.baysZ));
  const rng = makeRng(Math.round(p.seed) >>> 0);

  const spanX = baysX * p.bayWidth; // full column-grid width
  const spanZ = baysZ * p.bayDepth; // full column-grid depth
  const halfGX = spanX / 2;
  const halfGZ = spanZ / 2;
  const parts: NamedPart[] = [];

  // --- 0 台基 base: stone platform + front steps ---
  const baseHalfX = halfGX + p.baseOverhang;
  const baseHalfZ = halfGZ + p.baseOverhang;
  // 须弥座: a tiered stone base rather than a plain slab. Three courses —
  // 圭脚/下枋 (wide foot), 束腰 (recessed waist), 上枋 + 上枭 (flared cap that
  // the columns stand on). The waist inset is what makes it read as a proper
  // pedestal instead of a box.
  const baseParts: Mesh[] = [];
  const hFoot = p.baseHeight * 0.34;
  const hWaist = p.baseHeight * 0.32;
  const hCap = p.baseHeight - hFoot - hWaist;
  const waistInset = Math.min(0.22, p.baseOverhang * 0.35);
  // 下枋 foot
  baseParts.push(translateMesh(box(baseHalfX * 2, hFoot, baseHalfZ * 2), vec3(0, hFoot / 2, 0)));
  // 束腰 recessed waist
  const wHalfX = baseHalfX - waistInset, wHalfZ = baseHalfZ - waistInset;
  baseParts.push(translateMesh(box(wHalfX * 2, hWaist, wHalfZ * 2), vec3(0, hFoot + hWaist / 2, 0)));
  // 上枋 flared cap (slightly wider than the waist, matching the foot line)
  baseParts.push(translateMesh(box(baseHalfX * 2, hCap, baseHalfZ * 2), vec3(0, hFoot + hWaist + hCap / 2, 0)));
  parts.push({ name: "platform", mesh: merge(...baseParts), color: STONE, surface: { type: "stone", params: { color: STONE } } });
  // Front steps (踏跺): three descending treads on +Z.
  const stepMeshes: Mesh[] = [];
  const stepN = 3;
  const stepW = Math.min(spanX * 0.5, 3.2);
  for (let i = 0; i < stepN; i++) {
    const h = (p.baseHeight * (i + 1)) / stepN;
    const tread = box(stepW, h, 0.34);
    stepMeshes.push(translateMesh(tread, vec3(0, h / 2, baseHalfZ + 0.17 + (stepN - 1 - i) * 0.34)));
  }
  parts.push({ name: "steps", mesh: merge(...stepMeshes), color: STONE_DK, surface: { type: "stone", params: { color: STONE_DK } } });

  const floorY = p.baseHeight;

  // --- 1 柱 columns: perimeter eave columns on the grid intersections ---
  const cols: Mesh[] = [];
  const plinths: Mesh[] = [];
  const colXs: number[] = [];
  const colZs: number[] = [];
  for (let i = 0; i <= baysX; i++) colXs.push(-halfGX + i * p.bayWidth);
  for (let j = 0; j <= baysZ; j++) colZs.push(-halfGZ + j * p.bayDepth);
  const isPerimeter = (i: number, j: number) =>
    i === 0 || i === baysX || j === 0 || j === baysZ;
  const plinthH = 0.16;
  const plinthR = p.columnRadius * 1.7;
  for (let i = 0; i <= baysX; i++) {
    for (let j = 0; j <= baysZ; j++) {
      if (!isPerimeter(i, j)) continue; // only ring of 檐柱 for a clean hall
      // 柱础 plinth stone (a low drum under the column foot).
      const plinth = cylinder(plinthR, plinthH, 20, true);
      plinths.push(translateMesh(plinth, vec3(colXs[i]!, floorY + plinthH / 2, colZs[j]!)));
      // 梭柱 column: entasis — the shaft tapers ~12% toward the top, so it reads
      // as a slightly swelling timber column rather than a plain cylinder.
      const shaft = taperMesh(cylinder(p.columnRadius, p.columnHeight, 16, true), {
        axis: "y",
        startScale: 1.0,
        endScale: 0.86,
        curve: 0.5,
      });
      cols.push(translateMesh(shaft, vec3(colXs[i]!, floorY + plinthH + p.columnHeight / 2, colZs[j]!)));
    }
  }
  parts.push({ name: "plinths", mesh: merge(...plinths), color: PLINTH, surface: { type: "stone", params: { color: PLINTH } } });
  parts.push({ name: "columns", mesh: merge(...cols), color: COLUMN_RED, surface: { type: "wood", params: { color: COLUMN_RED, roughness: 0.6 } } });
  const colTop = floorY + plinthH + p.columnHeight;

  // --- 2 额枋 architrave: tie-beams linking perimeter column heads ---
  const beams: Mesh[] = [];
  const beamY = colTop - 0.22;
  const beamH = 0.34, beamT = 0.18;
  // Beams along X on front (j=0) and back (j=baysZ) rows.
  for (const j of [0, baysZ]) {
    const z = colZs[j]!;
    const b = box(spanX + p.columnRadius * 2, beamH, beamT);
    beams.push(translateMesh(b, vec3(0, beamY, z)));
  }
  // Beams along Z on left (i=0) and right (i=baysX) rows.
  for (const i of [0, baysX]) {
    const x = colXs[i]!;
    const b = box(beamT, beamH, spanZ + p.columnRadius * 2);
    beams.push(translateMesh(b, vec3(x, beamY, 0)));
  }
  parts.push({ name: "architrave", mesh: merge(...beams), color: BEAM_GREEN, surface: { type: "wood", params: { color: BEAM_GREEN, roughness: 0.55 } } });

  // --- 3 斗拱 dougong: bracket sets on each perimeter column head ---
  const dgTop = colTop;
  if (p.dougong) {
    const dgs: Mesh[] = [];
    const size = p.columnRadius * 1.7;
    for (let i = 0; i <= baysX; i++) {
      for (let j = 0; j <= baysZ; j++) {
        if (!isPerimeter(i, j)) continue;
        dgs.push(translateMesh(dougongSet(size), vec3(colXs[i]!, dgTop, colZs[j]!)));
      }
    }
    parts.push({ name: "dougong", mesh: merge(...dgs), color: BRACKET_GREEN, surface: { type: "wood", params: { color: BRACKET_GREEN, roughness: 0.5 } } });
  }

  // --- 3.5 承椽枋 + 檐椽 above-structure: the ring beam the eave sits on plus
  // the file of exposed round rafters under the eave (UE calls this AbvStruct).
  // The dense rafter row is the single most recognizable "Chinese eave" cue.
  const eaveY = dgTop + (p.dougong ? p.columnRadius * 3.2 : 0.15);
  const planHalfX = halfGX + p.eaveOverhang;
  const planHalfZ = halfGZ + p.eaveOverhang;
  const rise = p.roofRise * planHalfZ * 2;
  {
    const above: Mesh[] = [];
    // 承椽枋: a plate ring around the eave line just under the roof.
    const plateT = 0.16, plateH = 0.2;
    const pY = eaveY - plateH * 0.5;
    above.push(translateMesh(box(planHalfX * 2, plateH, plateT), vec3(0, pY, planHalfZ - plateT)));
    above.push(translateMesh(box(planHalfX * 2, plateH, plateT), vec3(0, pY, -planHalfZ + plateT)));
    above.push(translateMesh(box(plateT, plateH, planHalfZ * 2), vec3(planHalfX - plateT, pY, 0)));
    above.push(translateMesh(box(plateT, plateH, planHalfZ * 2), vec3(-planHalfX + plateT, pY, 0)));
    // 檐椽: round rafters poking out past the eave, evenly spaced on all sides.
    const rafterR = 0.055, rafterLen = p.eaveOverhang * 0.8 + 0.2;
    const spacing = 0.34;
    const rY = eaveY + 0.02;
    // front/back rows (rafters run along Z, poke out ±Z)
    const nX = Math.max(2, Math.floor((planHalfX * 2) / spacing));
    for (let k = 0; k <= nX; k++) {
      const x = -planHalfX + (k / nX) * planHalfX * 2;
      const rf = transform(cylinder(rafterR, rafterLen, 8, true), { rotate: vec3(Math.PI / 2, 0, 0) });
      above.push(translateMesh(rf, vec3(x, rY, planHalfZ - rafterLen * 0.3)));
      above.push(translateMesh(rf, vec3(x, rY, -planHalfZ + rafterLen * 0.3)));
    }
    // left/right rows (rafters run along X, poke out ±X)
    const nZ = Math.max(2, Math.floor((planHalfZ * 2) / spacing));
    for (let k = 0; k <= nZ; k++) {
      const z = -planHalfZ + (k / nZ) * planHalfZ * 2;
      const rf = transform(cylinder(rafterR, rafterLen, 8, true), { rotate: vec3(0, 0, Math.PI / 2) });
      above.push(translateMesh(rf, vec3(planHalfX - rafterLen * 0.3, rY, z)));
      above.push(translateMesh(rf, vec3(-planHalfX + rafterLen * 0.3, rY, z)));
    }
    parts.push({ name: "rafters", mesh: merge(...above), color: RAFTER_RED, surface: { type: "wood", params: { color: RAFTER_RED, roughness: 0.6 } } });
  }

  // --- 4 屋顶 roof: the defining curved hip roof over the whole plan ---
  const { tiles, ridge } = buildHipRoof(
    planHalfX, planHalfZ, eaveY, rise, p.roofConcavity, p.cornerUpturn, p.roof,
  );
  parts.push({ name: "roof", mesh: tiles, color: ROOF_TILE, surface: { type: "ceramic", params: { color: ROOF_TILE, roughness: 0.35 } } });
  parts.push({ name: "ridge", mesh: ridge, color: ROOF_RIDGE, surface: { type: "ceramic", params: { color: ROOF_RIDGE, roughness: 0.3 } } });

  // --- 5 墙 walls: infill on sides/back + lattice doors on the front bay ---
  if (p.walls) {
    const wallH = p.columnHeight - 0.5;
    const wallY = floorY + wallH / 2;
    const wallMeshes: Mesh[] = [];
    // Back wall (solid ochre plaster).
    wallMeshes.push(translateMesh(box(spanX, wallH, 0.12), vec3(0, wallY, colZs[0]!)));
    // Side walls.
    wallMeshes.push(translateMesh(box(0.12, wallH, spanZ), vec3(colXs[0]!, wallY, 0)));
    wallMeshes.push(translateMesh(box(0.12, wallH, spanZ), vec3(colXs[baysX]!, wallY, 0)));
    parts.push({ name: "walls", mesh: merge(...wallMeshes), color: WALL_OCHRE, surface: { type: "stone", params: { color: WALL_OCHRE, roughness: 0.8 } } });

    // Front lattice doors (隔扇): a mullion grid across the front bays.
    const doorMeshes: Mesh[] = [];
    const frontZ = colZs[baysZ]!;
    const doorH = wallH;
    const doorY = floorY + doorH / 2;
    const mullX = 5, mullY = 4;
    const frame = 0.05;
    for (let bx = 0; bx < baysX; bx++) {
      const cx = (colXs[bx]! + colXs[bx + 1]!) / 2;
      const bw = p.bayWidth - p.columnRadius * 2;
      // Vertical mullions.
      for (let m = 0; m <= mullX; m++) {
        const x = cx + (m / mullX - 0.5) * bw;
        doorMeshes.push(translateMesh(box(frame, doorH, 0.06), vec3(x, doorY, frontZ)));
      }
      // Horizontal rails.
      for (let m = 0; m <= mullY; m++) {
        const y = floorY + (m / mullY) * doorH;
        doorMeshes.push(translateMesh(box(bw, frame, 0.06), vec3(cx, y, frontZ)));
      }
    }
    parts.push({ name: "doors", mesh: merge(...doorMeshes), color: DOOR_WOOD, surface: { type: "wood", params: { color: DOOR_WOOD, roughness: 0.6 } } });
  }

  // --- 6 脊兽 ridge beasts: 正吻 at ridge ends + row of small beasts on hips ---
  if (p.ridgeBeasts) {
    const ridgeY = eaveY + rise;
    const ridgeHalfX = p.roof === "gable" ? planHalfX : Math.max(0.2, planHalfX - planHalfZ);
    const beasts: Mesh[] = [];
    // 正吻 (owl-tail finials) astride both ends of the main ridge, tails
    // curling inward toward the ridge center.
    for (const s of [-1, 1]) {
      const wen = wenFinial(0.62, -s);
      beasts.push(translateMesh(wen, vec3(s * ridgeHalfX, ridgeY + 0.24, 0)));
    }
    // 垂脊小兽: a short descending file of beasts on the lower part of each hip
    // ridge, following the concave roof surface (same curve as the hip ridge).
    if (p.roof !== "gable") {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const n = 4;
          for (let k = 1; k <= n; k++) {
            const t = 0.5 + (k / (n + 1)) * 0.45; // lower half of the hip
            const x = sx * (ridgeHalfX + t * (planHalfX - ridgeHalfX));
            const z = sz * (t * planHalfZ);
            const surfaceY = eaveY + jujiaHeight(t, p.roofConcavity) * rise;
            const lift = Math.pow(t, 2.4) * p.cornerUpturn * 0.7;
            const baseY = surfaceY + 0.14 + lift;
            const jitter = 0.02 * (rng.next() - 0.5);
            // Small crouching 脊兽: a haunched body + raised head, shrinking as
            // it steps down toward the eave.
            const sc = 1 - 0.08 * k;
            beasts.push(translateMesh(box(0.11 * sc, (0.14 + jitter) * sc, 0.13 * sc), vec3(x, baseY, z)));
            beasts.push(translateMesh(box(0.08 * sc, 0.1 * sc, 0.08 * sc), vec3(x - sx * 0.04 * sc, baseY + 0.12 * sc, z - sz * 0.04 * sc)));
          }
        }
      }
    }
    parts.push({ name: "ridgeBeasts", mesh: merge(...beasts), color: BRACKET_GOLD, surface: { type: "ceramic", params: { color: BRACKET_GOLD, roughness: 0.3 } } });
  }

  return parts;
}

/**
 * 正吻/鸱吻 (owl-tail ridge finial): the big ornament astride each end of the
 * main ridge. Built as an S-curved tail that rises off a swallowing mouth base
 * and curls inward at the top — a chain of blocks following a curve, so it
 * reads as the sweeping dragon-tail silhouette rather than a plain stack.
 * `dir` (+1/-1) points the curl inward toward the ridge center.
 */
function wenFinial(h: number, dir = 1): Mesh {
  const parts: Mesh[] = [];
  // Base mouth block (吞脊兽口): a chunky body straddling the ridge.
  parts.push(translateMesh(box(0.34, h * 0.42, 0.5), vec3(0, h * 0.21, 0)));
  // The rising tail: a curve that goes up then hooks back over itself.
  const steps = 10;
  let prevW = 0.3;
  for (let k = 0; k <= steps; k++) {
    const t = k / steps; // 0 base -> 1 tail tip
    // Up-and-over S: x hooks inward as the tail curls back at the top.
    const y = h * (0.42 + 0.62 * t);
    const x = dir * (0.05 + 0.34 * Math.sin(t * 1.7) - 0.28 * t * t);
    const w = prevW * (1 - 0.06 * k / steps);
    const seg = box(w * 0.7, h * 0.12, 0.4 - 0.16 * t);
    parts.push(translateMesh(seg, vec3(x, y, 0)));
    prevW = w;
  }
  // A couple of small fin spikes on the outer edge of the tail (鳍).
  for (const ft of [0.35, 0.6, 0.82]) {
    const y = h * (0.42 + 0.62 * ft);
    const x = dir * (0.05 + 0.34 * Math.sin(ft * 1.7) - 0.28 * ft * ft);
    parts.push(translateMesh(box(0.1, h * 0.14, 0.12), vec3(x - dir * 0.16, y + h * 0.05, 0)));
  }
  return merge(...parts);
}

