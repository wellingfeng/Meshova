/**
 * Procedural civil-infrastructure kit — three deterministic models that fill
 * gaps in Meshova's urban/industrial catalog, in the spirit of CitySample's
 * background props but rebuilt from primitives:
 *
 *   buildPylonParts    — lattice electricity transmission pylon + cross-arms
 *   buildTowerCraneParts — construction tower crane (mast + jib + counter-jib)
 *   buildWindTurbineParts — 3-blade horizontal-axis wind turbine
 *
 * All are pure primitive assemblies (box/cylinder/cone) with matched surfaces.
 * Same params -> same mesh. No RNG, no time.
 */
import { vec3, type Vec3 } from "../math/vec3.js";
import { vec2 } from "../math/vec2.js";
import {
  box,
  cylinder,
  cone,
  transform,
  merge,
  makeMesh,
  recomputeNormals,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";

type RGB = [number, number, number];

const STEEL: RGB = [0.56, 0.58, 0.6];
const STEEL_DK: RGB = [0.34, 0.35, 0.38];
const PAINT_RED: RGB = [0.72, 0.12, 0.1];
const PAINT_YELLOW: RGB = [0.86, 0.68, 0.08];
const WHITE: RGB = [0.9, 0.9, 0.88];
const CONCRETE: RGB = [0.62, 0.62, 0.64];

/** A thin box strut between two points, approximated as an axis-oriented beam. */
function strutY(x: number, z: number, y0: number, y1: number, t: number): Mesh {
  const h = Math.abs(y1 - y0);
  return transform(box(t, h, t), { translate: vec3(x, (y0 + y1) / 2, z) });
}

/**
 * A single lofted wind-turbine blade extending along +Y (spanwise), built as a
 * stack of airfoil cross-sections. Each spanwise station has:
 *   - a chord that tapers linearly from `rootChord` to `rootChord*tipRatio`,
 *   - an aerodynamic twist (pitch) that washes out from `twist` at the root to
 *     0 at the tip (rotation about the spanwise Y axis),
 *   - a symmetric airfoil cross-section (a lens: thickness peaks mid-chord).
 * The blade lies in the chord(X)/thickness(Z) plane, span along +Y. Returns a
 * closed watertight mesh. Deterministic — pure function of the params.
 */
function airfoilBlade(
  length: number,
  rootChord: number,
  tipRatio: number,
  twist: number,
  thickness: number,
): Mesh {
  const spanStations = 10; // spanwise lofted sections
  const chordPts = 8; // points around each airfoil section
  const positions: Vec3[] = [];
  const uvs: ReturnType<typeof vec2>[] = [];
  const indices: number[] = [];

  // Symmetric airfoil outline parameterized by u in [0,1) around the section:
  // top surface (front->back) then bottom surface (back->front). x in chord
  // fraction [-0.5,0.5], z is +/- half-thickness following a NACA-like bump.
  const sectionPoint = (k: number, chord: number, tw: number): Vec3 => {
    const half = chordPts / 2;
    const top = k < half;
    const t = (top ? k : chordPts - k) / half; // 0..1 leading->trailing
    const xc = t - 0.5; // chord fraction -0.5..0.5
    // Airfoil half-thickness distribution (peaks ~30% chord, tapers to 0 at TE).
    const yt = thickness * (1.4845 * Math.sqrt(Math.max(0, t)) - 0.63 * t - 0.758 * t * t + 0.4 * t * t * t);
    const zc = (top ? 1 : -1) * yt;
    const cx = xc * chord;
    const cz = zc * chord;
    // Apply twist (pitch) about the spanwise Y axis.
    const rx = cx * Math.cos(tw) - cz * Math.sin(tw);
    const rz = cx * Math.sin(tw) + cz * Math.cos(tw);
    return vec3(rx, 0, rz);
  };

  for (let s = 0; s <= spanStations; s++) {
    const v = s / spanStations;
    const y = v * length;
    const chord = rootChord * (1 - (1 - tipRatio) * v);
    const tw = twist * (1 - v); // washout: max pitch at root, 0 at tip
    for (let k = 0; k < chordPts; k++) {
      const p = sectionPoint(k, chord, tw);
      positions.push(vec3(p.x, y, p.z));
      uvs.push(vec2(k / chordPts, v));
    }
  }

  // Stitch consecutive sections into a tube.
  for (let s = 0; s < spanStations; s++) {
    const a = s * chordPts;
    const b = (s + 1) * chordPts;
    for (let k = 0; k < chordPts; k++) {
      const k1 = (k + 1) % chordPts;
      indices.push(a + k, b + k, b + k1, a + k, b + k1, a + k1);
    }
  }
  // Cap the root and taper the tip to a point.
  const tipC = positions.length;
  positions.push(vec3(0, length, 0));
  uvs.push(vec2(0.5, 1));
  const lastBase = spanStations * chordPts;
  for (let k = 0; k < chordPts; k++) {
    const k1 = (k + 1) % chordPts;
    indices.push(lastBase + k, tipC, lastBase + k1);
  }
  const rootC = positions.length;
  positions.push(vec3(0, 0, 0));
  uvs.push(vec2(0.5, 0));
  for (let k = 0; k < chordPts; k++) {
    const k1 = (k + 1) % chordPts;
    indices.push(k1, rootC, k);
  }

  const normals = positions.map(() => vec3(0, 1, 0));
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}
export interface PylonParams {
  /** Overall tower height (metres). */
  height: number;
  /** Base half-footprint (tapers to `topWidth` at the top). */
  baseWidth: number;
  /** Top half-footprint of the tapered lattice waist. */
  topWidth: number;
  /** Number of horizontal lattice bracing levels. */
  levels: number;
  /** Number of cross-arms carrying conductor lines. */
  crossArms: number;
  /** Longest cross-arm half-span (metres). */
  armSpan: number;
  /** Strut thickness. */
  strut: number;
}

export const PYLON_DEFAULTS: PylonParams = {
  height: 24,
  baseWidth: 3,
  topWidth: 1.1,
  levels: 6,
  crossArms: 3,
  armSpan: 4.5,
  strut: 0.18,
};

/** Lattice transmission pylon: 4 tapered legs + X-bracing + cross-arms + insulators. */
export function buildPylonParts(params: Partial<PylonParams> = {}): NamedPart[] {
  const p: PylonParams = { ...PYLON_DEFAULTS, ...params };
  const legs: Mesh[] = [];
  const braces: Mesh[] = [];
  const t = p.strut;

  // Footprint half-width at a normalized height (linear taper).
  const wAt = (u: number): number => p.baseWidth + (p.topWidth - p.baseWidth) * u;
  const corners: Array<[number, number]> = [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ];

  // Four legs as stacked segments following the taper.
  const segH = p.height / p.levels;
  for (let lvl = 0; lvl < p.levels; lvl++) {
    const u0 = lvl / p.levels;
    const u1 = (lvl + 1) / p.levels;
    const w0 = wAt(u0);
    const w1 = wAt(u1);
    const y0 = lvl * segH;
    const y1 = (lvl + 1) * segH;
    const wm = (w0 + w1) / 2;
    for (const [sx, sz] of corners) {
      legs.push(strutY(sx * wm, sz * wm, y0, y1, t));
    }
    // Horizontal ring braces at each level top.
    for (let c = 0; c < 4; c++) {
      const [ax, az] = corners[c]!;
      const [bx, bz] = corners[(c + 1) % 4]!;
      const mx = ((ax + bx) / 2) * w1;
      const mz = ((az + bz) / 2) * w1;
      const len = Math.hypot((bx - ax) * w1, (bz - az) * w1);
      const horizontal = Math.abs(ax - bx) > Math.abs(az - bz);
      braces.push(
        transform(box(horizontal ? len : t, t, horizontal ? t : len), {
          translate: vec3(mx, y1, mz),
        }),
      );
    }
    // Diagonal X-brace on each of the 4 faces (approximated as a thin tilted box).
    for (let c = 0; c < 4; c++) {
      const [ax, az] = corners[c]!;
      const [bx, bz] = corners[(c + 1) % 4]!;
      const faceLen = Math.hypot((bx - ax) * w1, (bz - az) * w1);
      const diagLen = Math.hypot(faceLen, segH);
      const horizontal = Math.abs(ax - bx) > Math.abs(az - bz);
      const cx = ((ax + bx) / 2) * ((w0 + w1) / 2);
      const cz = ((az + bz) / 2) * ((w0 + w1) / 2);
      const ang = Math.atan2(segH, faceLen);
      braces.push(
        transform(box(t, diagLen, t), {
          rotate: horizontal ? vec3(0, 0, Math.PI / 2 - ang) : vec3(Math.PI / 2 - ang, 0, 0),
          translate: vec3(cx, (y0 + y1) / 2, cz),
        }),
      );
    }
  }

  const parts: NamedPart[] = [
    { name: "legs", label: "塔腿", mesh: merge(...legs), color: STEEL, surface: { type: "metal", params: { color: STEEL, roughness: 0.55 } } },
    { name: "bracing", label: "斜撑", mesh: merge(...braces), color: STEEL_DK, surface: { type: "metal", params: { color: STEEL_DK, roughness: 0.6 } } },
  ];

  // Cross-arms near the top carrying insulator strings + conductor points.
  const armTop = p.height * 0.96;
  const insulators: Mesh[] = [];
  const armMeshes: Mesh[] = [];
  for (let a = 0; a < p.crossArms; a++) {
    const y = armTop - a * (p.height * 0.12);
    const span = p.armSpan * (1 - a * 0.18);
    // Arm beam spanning X through the tower.
    armMeshes.push(transform(box(span * 2, t * 1.4, t * 1.4), { translate: vec3(0, y, 0) }));
    // Insulator strings hanging at both ends + midpoint.
    for (const ex of [-span, 0, span]) {
      insulators.push(transform(cylinder(0.09, 0.9, 8), { translate: vec3(ex, y - 0.6, 0) }));
    }
  }
  parts.push({ name: "cross_arms", label: "横担", mesh: merge(...armMeshes), color: STEEL, surface: { type: "metal", params: { color: STEEL, roughness: 0.55 } } });
  parts.push({ name: "insulators", label: "绝缘子串", mesh: merge(...insulators), color: [0.15, 0.15, 0.17], surface: { type: "ceramic", params: { color: [0.15, 0.15, 0.17], roughness: 0.3 } } });

  // Concrete footings under the 4 legs.
  const footings: Mesh[] = corners.map(([sx, sz]) =>
    transform(box(0.9, 1.0, 0.9), { translate: vec3(sx * p.baseWidth, 0.5, sz * p.baseWidth) }),
  );
  parts.push({ name: "footings", label: "基础", mesh: merge(...footings), color: CONCRETE, surface: { type: "concrete", params: { color: CONCRETE, roughness: 0.9 } } });

  return parts;
}

export interface TowerCraneParams {
  /** Mast height to the slewing unit (metres). */
  mastHeight: number;
  /** Mast cross-section half-width. */
  mastWidth: number;
  /** Working jib length (the long load-carrying arm). */
  jibLength: number;
  /** Counter-jib length (the short arm with the counterweight). */
  counterJibLength: number;
  /** Trolley position along the jib as a fraction 0..1. */
  trolley: number;
  /** Hook drop below the jib (metres). */
  hookDrop: number;
  /** Strut thickness. */
  strut: number;
}

export const TOWER_CRANE_DEFAULTS: TowerCraneParams = {
  mastHeight: 30,
  mastWidth: 0.9,
  jibLength: 22,
  counterJibLength: 8,
  trolley: 0.7,
  hookDrop: 12,
  strut: 0.16,
};

/** Construction tower crane: lattice mast + slewing cab + jib + counter-jib. */
export function buildTowerCraneParts(params: Partial<TowerCraneParams> = {}): NamedPart[] {
  const p: TowerCraneParams = { ...TOWER_CRANE_DEFAULTS, ...params };
  const t = p.strut;
  const w = p.mastWidth;
  const parts: NamedPart[] = [];

  // Lattice mast: 4 vertical legs + horizontal ring braces.
  const legs: Mesh[] = [];
  const braces: Mesh[] = [];
  const corners: Array<[number, number]> = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  for (const [sx, sz] of corners) {
    legs.push(strutY(sx * w, sz * w, 0, p.mastHeight, t));
  }
  const rings = Math.max(4, Math.round(p.mastHeight / 3));
  for (let r = 1; r < rings; r++) {
    const y = (r / rings) * p.mastHeight;
    for (let c = 0; c < 4; c++) {
      const [ax, az] = corners[c]!;
      const [bx, bz] = corners[(c + 1) % 4]!;
      const horizontal = Math.abs(ax - bx) > Math.abs(az - bz);
      braces.push(
        transform(box(horizontal ? w * 2 : t, t, horizontal ? t : w * 2), {
          translate: vec3(((ax + bx) / 2) * w, y, ((az + bz) / 2) * w),
        }),
      );
    }
  }
  parts.push({ name: "mast", label: "塔身", mesh: merge(...legs), color: PAINT_YELLOW, surface: { type: "metal", params: { color: PAINT_YELLOW, roughness: 0.5 } } });
  parts.push({ name: "mast_bracing", label: "塔身斜撑", mesh: merge(...braces), color: STEEL_DK, surface: { type: "metal", params: { color: STEEL_DK, roughness: 0.6 } } });

  // Slewing platform + operator cab at the top.
  const topY = p.mastHeight;
  parts.push({ name: "slew", label: "回转平台", mesh: transform(cylinder(w * 1.5, 0.6, 16), { translate: vec3(0, topY + 0.3, 0) }), color: STEEL, surface: { type: "metal", params: { color: STEEL, roughness: 0.5 } } });
  parts.push({ name: "cab", label: "操作室", mesh: transform(box(1.4, 1.4, 1.6), { translate: vec3(0, topY + 1.3, w + 0.8) }), color: PAINT_YELLOW, surface: { type: "metal", params: { color: PAINT_YELLOW, roughness: 0.45 } } });

  const jibY = topY + 1.6;
  parts.push({ name: "jib", label: "起重臂", mesh: transform(box(t * 3, 0.8, p.jibLength), { translate: vec3(0, jibY, p.jibLength / 2 + w) }), color: PAINT_YELLOW, surface: { type: "metal", params: { color: PAINT_YELLOW, roughness: 0.5 } } });
  parts.push({ name: "counter_jib", label: "平衡臂", mesh: transform(box(t * 3, 0.7, p.counterJibLength), { translate: vec3(0, jibY, -(p.counterJibLength / 2 + w)) }), color: PAINT_YELLOW, surface: { type: "metal", params: { color: PAINT_YELLOW, roughness: 0.5 } } });
  parts.push({ name: "counterweight", label: "配重", mesh: transform(box(2.2, 1.6, 1.4), { translate: vec3(0, jibY - 0.4, -(p.counterJibLength + w)) }), color: CONCRETE, surface: { type: "concrete", params: { color: CONCRETE, roughness: 0.9 } } });

  const apexY = jibY + 4;
  parts.push({ name: "apex", label: "塔尖", mesh: transform(cone(1.4, 4, 4), { translate: vec3(0, apexY - 2, 0) }), color: STEEL, surface: { type: "metal", params: { color: STEEL, roughness: 0.55 } } });

  const trolleyZ = w + p.trolley * p.jibLength;
  parts.push({ name: "trolley", label: "小车", mesh: transform(box(0.9, 0.5, 0.9), { translate: vec3(0, jibY - 0.6, trolleyZ) }), color: STEEL_DK, surface: { type: "metal", params: { color: STEEL_DK, roughness: 0.5 } } });
  parts.push({ name: "hoist_rope", label: "起升绳", mesh: transform(cylinder(0.04, p.hookDrop, 6), { translate: vec3(0, jibY - 0.6 - p.hookDrop / 2, trolleyZ) }), color: STEEL_DK, surface: { type: "metal", params: { color: STEEL_DK, roughness: 0.4 } } });
  parts.push({ name: "hook", label: "吊钩", mesh: transform(box(0.5, 0.6, 0.5), { translate: vec3(0, jibY - 0.6 - p.hookDrop, trolleyZ) }), color: PAINT_RED, surface: { type: "metal", params: { color: PAINT_RED, roughness: 0.45 } } });

  parts.push({ name: "base", label: "基座", mesh: transform(box(w * 4, 1.2, w * 4), { translate: vec3(0, 0.6, 0) }), color: CONCRETE, surface: { type: "concrete", params: { color: CONCRETE, roughness: 0.92 } } });

  return parts;
}
export interface WindTurbineParams {
  /** Tower height to the nacelle hub (metres). */
  towerHeight: number;
  /** Tower base radius (tapers to ~55% at the top). */
  towerRadius: number;
  /** Number of rotor blades. */
  blades: number;
  /** Blade length from hub (metres). */
  bladeLength: number;
  /** Blade root chord (width at the hub); tapers toward the tip. */
  bladeChord: number;
  /** Blade tip chord as a fraction of root chord (planform taper). */
  tipChordRatio: number;
  /** Total aerodynamic twist root->tip in radians (washout). */
  bladeTwist: number;
  /** Airfoil max thickness as a fraction of local chord. */
  airfoilThickness: number;
  /** Rotor rotation phase in radians (deterministic pose, no animation). */
  rotorPhase: number;
}

export const WIND_TURBINE_DEFAULTS: WindTurbineParams = {
  towerHeight: 28,
  towerRadius: 1.1,
  blades: 3,
  bladeLength: 16,
  bladeChord: 1.4,
  tipChordRatio: 0.32,
  bladeTwist: 0.55,
  airfoilThickness: 0.16,
  rotorPhase: 0,
};

/** 3-blade horizontal-axis wind turbine: tapered tower + nacelle + rotor. */
export function buildWindTurbineParts(params: Partial<WindTurbineParams> = {}): NamedPart[] {
  const p: WindTurbineParams = { ...WIND_TURBINE_DEFAULTS, ...params };
  const parts: NamedPart[] = [];

  // Tapered tubular tower (approximated as a slightly tapered cylinder via cone).
  parts.push({
    name: "tower",
    label: "塔筒",
    mesh: transform(cone(p.towerRadius, p.towerHeight, 24, true), {
      // cone tapers to a point; use a truncated look by scaling the top via a
      // separate thin cylinder cap. Here keep the cone body but blunt the tip.
      translate: vec3(0, p.towerHeight / 2, 0),
    }),
    color: WHITE,
    surface: { type: "ceramic", params: { color: WHITE, roughness: 0.4 } },
  });

  const hubY = p.towerHeight;
  const hubZ = p.towerRadius * 0.6; // nacelle sits slightly upwind of the tower axis

  // Nacelle housing behind the hub (box along +/-Z).
  parts.push({
    name: "nacelle",
    label: "机舱",
    mesh: transform(box(2.2, 2.0, 4.5), { translate: vec3(0, hubY, -1.0) }),
    color: WHITE,
    surface: { type: "ceramic", params: { color: WHITE, roughness: 0.4 } },
  });

  // Hub (spinner) facing +Z.
  parts.push({
    name: "hub",
    label: "轮毂",
    mesh: transform(cone(1.1, 1.6, 16), { rotate: vec3(-Math.PI / 2, 0, 0), translate: vec3(0, hubY, hubZ + 0.8) }),
    color: WHITE,
    surface: { type: "ceramic", params: { color: WHITE, roughness: 0.4 } },
  });

  // Rotor blades: lofted airfoil sections with taper + aerodynamic twist, then
  // radiated evenly around the hub axis (+Z) and rotated by the rotor phase.
  const blades: Mesh[] = [];
  const bl = p.bladeLength;
  const oneBlade = airfoilBlade(bl, p.bladeChord, p.tipChordRatio, p.bladeTwist, p.airfoilThickness);
  for (let i = 0; i < p.blades; i++) {
    const ang = p.rotorPhase + (i / p.blades) * Math.PI * 2;
    // The airfoil is built spanwise along +Y; rotate about Z to fan the blades
    // out radially, then place on the rotor plane just in front of the hub.
    blades.push(
      transform(oneBlade, {
        rotate: vec3(0, 0, ang),
        translate: vec3(0, hubY, hubZ + 0.9),
      }),
    );
  }
  parts.push({
    name: "blades",
    label: "叶片",
    mesh: merge(...blades),
    color: WHITE,
    surface: { type: "ceramic", params: { color: WHITE, roughness: 0.35 } },
  });

  // Concrete foundation pad.
  parts.push({
    name: "foundation",
    label: "基础",
    mesh: transform(cylinder(p.towerRadius * 2.2, 0.8, 20), { translate: vec3(0, 0.4, 0) }),
    color: CONCRETE,
    surface: { type: "concrete", params: { color: CONCRETE, roughness: 0.92 } },
  });

  return parts;
}
export interface TollStationParams {
  /** Number of toll lanes (booths = lanes + 1 islands). */
  lanes: number;
  /** Width of each lane (metres). */
  laneWidth: number;
  /** Depth of the canopy roof along the road (Z). */
  canopyDepth: number;
  /** Clearance height under the canopy. */
  clearance: number;
  /** Draw booth cabins on the islands. */
  booths: boolean;
}

export const TOLL_STATION_DEFAULTS: TollStationParams = {
  lanes: 5,
  laneWidth: 3.5,
  canopyDepth: 8,
  clearance: 5.5,
  booths: true,
};

/** Highway toll plaza: island barriers + booth cabins + a wide overhead canopy. */
export function buildTollStationParts(params: Partial<TollStationParams> = {}): NamedPart[] {
  const p: TollStationParams = { ...TOLL_STATION_DEFAULTS, ...params };
  const parts: NamedPart[] = [];
  const islands = p.lanes + 1;
  const totalW = p.lanes * p.laneWidth + islands * 0.9;
  const halfW = totalW / 2;
  const islandW = 0.9;

  // Ground / road pad.
  parts.push({
    name: "road_pad",
    label: "路面",
    mesh: transform(box(totalW + 4, 0.2, p.canopyDepth + 8), { translate: vec3(0, 0.1, 0) }),
    color: [0.09, 0.09, 0.1],
    surface: { type: "concrete", params: { color: [0.09, 0.09, 0.1], roughness: 0.92 } },
  });

  // Islands (raised concrete kerbs) between lanes, with optional booth cabins.
  const islandMeshes: Mesh[] = [];
  const boothMeshes: Mesh[] = [];
  for (let i = 0; i < islands; i++) {
    const x = -halfW + islandW / 2 + i * (p.laneWidth + islandW);
    islandMeshes.push(transform(box(islandW, 0.4, p.canopyDepth), { translate: vec3(x, 0.4, 0) }));
    if (p.booths) {
      boothMeshes.push(transform(box(islandW + 0.3, 2.6, 2.2), { translate: vec3(x, 1.5, 0) }));
    }
  }
  parts.push({ name: "islands", label: "分隔岛", mesh: merge(...islandMeshes), color: CONCRETE, surface: { type: "concrete", params: { color: CONCRETE, roughness: 0.85 } } });
  if (p.booths) {
    parts.push({ name: "booths", label: "收费亭", mesh: merge(...boothMeshes), color: [0.85, 0.86, 0.82], surface: { type: "ceramic", params: { color: [0.85, 0.86, 0.82], roughness: 0.5 } } });
  }

  // Overhead canopy roof + support columns straddling the whole plaza.
  const roofY = p.clearance;
  parts.push({
    name: "canopy",
    label: "顶棚",
    mesh: transform(box(totalW + 3, 0.5, p.canopyDepth + 1), { translate: vec3(0, roofY + 0.25, 0) }),
    color: [0.7, 0.72, 0.75],
    surface: { type: "metal", params: { color: [0.7, 0.72, 0.75], roughness: 0.5 } },
  });
  const cols: Mesh[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      cols.push(transform(cylinder(0.35, roofY, 12), { translate: vec3(sx * (halfW - 0.5), roofY / 2, sz * (p.canopyDepth / 2 - 0.5)) }));
    }
  }
  parts.push({ name: "canopy_columns", label: "顶棚立柱", mesh: merge(...cols), color: STEEL, surface: { type: "metal", params: { color: STEEL, roughness: 0.5 } } });

  return parts;
}

export interface TunnelPortalParams {
  /** Half-width of the road opening (metres). */
  openingHalfWidth: number;
  /** Height of the vertical walls before the arch springs. */
  wallHeight: number;
  /** Portal facade thickness (Z depth of the front wall). */
  facadeDepth: number;
  /** How far the tunnel bore extends behind the portal. */
  boreDepth: number;
  /** Facade border margin around the opening (the visible portal frame). */
  margin: number;
}

export const TUNNEL_PORTAL_DEFAULTS: TunnelPortalParams = {
  openingHalfWidth: 6,
  wallHeight: 4,
  facadeDepth: 1.2,
  boreDepth: 14,
  margin: 2.5,
};

/**
 * Highway tunnel portal: an arched opening cut into a rectangular facade, plus a
 * cylindrical bore receding behind it. The arch is built as a ring of trapezoid
 * voussoir blocks around a semicircle, framed by two side piers and a spandrel.
 * The facade is a solid wall with the arched opening left hollow.
 */
export function buildTunnelPortalParts(params: Partial<TunnelPortalParams> = {}): NamedPart[] {
  const p: TunnelPortalParams = { ...TUNNEL_PORTAL_DEFAULTS, ...params };
  const parts: NamedPart[] = [];
  const ohw = p.openingHalfWidth;
  const arcR = ohw; // semicircular crown of radius = opening half-width
  const springY = p.wallHeight; // arch springs from the top of the walls
  const facadeW = ohw + p.margin;
  const facadeTop = springY + arcR + p.margin;
  const fd = p.facadeDepth;

  // Two side piers (solid wall segments beside the opening).
  const piers: Mesh[] = [];
  for (const sx of [-1, 1]) {
    const pierW = p.margin;
    const cx = sx * (ohw + pierW / 2);
    piers.push(transform(box(pierW, facadeTop, fd), { translate: vec3(cx, facadeTop / 2, 0) }));
  }
  parts.push({ name: "piers", label: "边墩", mesh: merge(...piers), color: CONCRETE, surface: { type: "concrete", params: { color: CONCRETE, roughness: 0.88 } } });

  // Voussoir arch ring: trapezoid blocks around the semicircle above the springline.
  const segs = 14;
  const voussoirs: Mesh[] = [];
  for (let i = 0; i < segs; i++) {
    const a = (i + 0.5) / segs * Math.PI; // 0..PI across the semicircle
    const cx = Math.cos(a) * (arcR + p.margin / 2) * -1; // sweep left->right
    const cy = springY + Math.sin(a) * (arcR + p.margin / 2);
    const block = box(p.margin, (Math.PI * arcR) / segs + 0.3, fd);
    voussoirs.push(transform(block, { rotate: vec3(0, 0, a - Math.PI / 2), translate: vec3(cx, cy, 0) }));
  }
  parts.push({ name: "arch", label: "拱圈", mesh: merge(...voussoirs), color: CONCRETE, surface: { type: "concrete", params: { color: CONCRETE, roughness: 0.85 } } });

  // Spandrel wall above the arch crown up to the flat facade top.
  const crownY = springY + arcR;
  if (facadeTop > crownY + 0.1) {
    parts.push({
      name: "spandrel",
      label: "拱上墙",
      mesh: transform(box(facadeW * 2 + p.margin * 2, facadeTop - crownY, fd), { translate: vec3(0, (facadeTop + crownY) / 2, 0) }),
      color: CONCRETE,
      surface: { type: "concrete", params: { color: CONCRETE, roughness: 0.88 } },
    });
  }

  // Tunnel bore: a D-shaped inner-wall shell (two vertical side walls + a
  // semicircular crown) lofted along -Z, matching the portal opening exactly
  // instead of a full cylinder. Faces are wound so normals point *inward*, and
  // the shell is open at both ends (floor stays open for the road).
  const boreZ0 = -fd / 2;
  const boreZ1 = boreZ0 - p.boreDepth;
  // D-profile in the (x,y) plane, from the left springline foot up over the
  // crown and down to the right springline foot. Vertical walls first, then arc.
  const profile: Array<{ x: number; y: number }> = [];
  profile.push({ x: -arcR, y: 0 });
  profile.push({ x: -arcR, y: springY });
  const arcSteps = 16;
  for (let i = 0; i <= arcSteps; i++) {
    const a = Math.PI - (i / arcSteps) * Math.PI; // PI (left) -> 0 (right)
    profile.push({ x: Math.cos(a) * arcR, y: springY + Math.sin(a) * arcR });
  }
  profile.push({ x: arcR, y: springY });
  profile.push({ x: arcR, y: 0 });

  const bPos: Vec3[] = [];
  const bUv: ReturnType<typeof vec2>[] = [];
  const bIdx: number[] = [];
  const cols = profile.length;
  for (let z = 0; z < 2; z++) {
    const pz = z === 0 ? boreZ0 : boreZ1;
    for (let i = 0; i < cols; i++) {
      const pr = profile[i]!;
      bPos.push(vec3(pr.x, pr.y, pz));
      bUv.push(vec2(i / (cols - 1), z));
    }
  }
  for (let i = 0; i < cols - 1; i++) {
    const a0 = i, a1 = i + 1;
    const b0 = cols + i, b1 = cols + i + 1;
    // Wind CCW as seen from inside the tunnel so normals face inward.
    bIdx.push(a0, a1, b1, a0, b1, b0);
  }
  const bNorm = bPos.map(() => vec3(0, 1, 0));
  const bore = recomputeNormals(makeMesh({ positions: bPos, normals: bNorm, uvs: bUv, indices: bIdx }));
  parts.push({ name: "bore", label: "洞身", mesh: bore, color: [0.12, 0.12, 0.14], surface: { type: "concrete", params: { color: [0.12, 0.12, 0.14], roughness: 0.95 } } });

  // Road surface running through the portal.
  parts.push({
    name: "road",
    label: "路面",
    mesh: transform(box(ohw * 2, 0.2, p.boreDepth + fd + 6), { translate: vec3(0, 0.1, -(p.boreDepth + fd) / 2 + 3) }),
    color: [0.09, 0.09, 0.1],
    surface: { type: "concrete", params: { color: [0.09, 0.09, 0.1], roughness: 0.92 } },
  });

  return parts;
}


