/**
 * CitySample-inspired city prop kit — deterministic primitive assemblies that
 * fill the biggest gaps versus Epic's CitySample background props, rebuilt from
 * Meshova primitives (box/cylinder/cone/torus). No RNG, no time; same params ->
 * same mesh. Every part carries a matched surface material.
 *
 *   buildRooftopKitParts — the rooftop mechanical clutter (HVAC packages, water
 *     tank, exhaust ducts, vents, roof-access hut) that gives CitySample its
 *     skyline silhouette. CitySample source: Kit_roof_* family.
 *   buildScaffoldingParts — modular tube-and-frame construction scaffolding with
 *     configurable bays/lifts, planks, ladders and toe-boards. Source: Kit_Scaffolding.
 *   buildBusStopParts — city bus shelter: canopy + posts + bench + ad light-box +
 *     sign pole. Source: Kit_BusStop.
 *   buildBicycleParts — parked bicycle: two torus wheels, diamond frame, fork,
 *     handlebar, saddle, pedals. Source: Kit_Bicycle_A.
 */
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  box,
  cylinder,
  cone,
  sphere,
  torus,
  transform,
  merge,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";

type RGB = [number, number, number];

const STEEL: RGB = [0.56, 0.58, 0.6];
const STEEL_DK: RGB = [0.32, 0.33, 0.36];
const GALV: RGB = [0.7, 0.71, 0.72];
const PAINT_BLUE: RGB = [0.16, 0.34, 0.52];
const RUST_RED: RGB = [0.55, 0.24, 0.14];
const CONCRETE: RGB = [0.6, 0.6, 0.62];
const WOOD: RGB = [0.5, 0.36, 0.2];
const GLASS: RGB = [0.72, 0.82, 0.85];
const RUBBER: RGB = [0.08, 0.08, 0.09];
const CHROME: RGB = [0.78, 0.79, 0.82];
const BRICK: RGB = [0.42, 0.24, 0.18];

const metal = (color: RGB, roughness = 0.5) => ({ type: "metal" as const, params: { color, roughness } });
const conc = (color: RGB, roughness = 0.9) => ({ type: "concrete" as const, params: { color, roughness } });
const ceram = (color: RGB, roughness = 0.4) => ({ type: "ceramic" as const, params: { color, roughness } });

/** Thin vertical strut helper (axis-aligned beam between two heights). */
function strutY(x: number, z: number, y0: number, y1: number, t: number): Mesh {
  return transform(box(t, Math.abs(y1 - y0), t), { translate: vec3(x, (y0 + y1) / 2, z) });
}

export interface RooftopKitParams {
  /** Roof slab half-extent along X (metres). */
  roofWidth: number;
  /** Roof slab half-extent along Z (metres). */
  roofDepth: number;
  /** Number of HVAC package units on the roof. */
  hvacUnits: number;
  /** Draw a cylindrical water tank on stilts. */
  waterTank: boolean;
  /** Draw the roof-access stair hut. */
  accessHut: boolean;
  /** Height of the perimeter parapet wall. */
  parapet: number;
}

export const ROOFTOP_KIT_DEFAULTS: RooftopKitParams = {
  roofWidth: 9,
  roofDepth: 7,
  hvacUnits: 3,
  waterTank: true,
  accessHut: true,
  parapet: 0.9,
};

/** Rooftop mechanical clutter: slab + parapet + HVAC boxes + ducts + vents + water tank + access hut. */
export function buildRooftopKitParts(params: Partial<RooftopKitParams> = {}): NamedPart[] {
  const p: RooftopKitParams = { ...ROOFTOP_KIT_DEFAULTS, ...params };
  const parts: NamedPart[] = [];
  const rw = p.roofWidth;
  const rd = p.roofDepth;

  // Roof slab (top surface at y=0, so props sit on the origin plane).
  parts.push({ name: "roof_slab", label: "屋面板", mesh: transform(box(rw * 2, 0.4, rd * 2), { translate: vec3(0, -0.2, 0) }), color: CONCRETE, surface: conc(CONCRETE) });

  // Perimeter parapet (four low walls around the roof edge).
  const pw: Mesh[] = [];
  const th = 0.3;
  pw.push(transform(box(rw * 2, p.parapet, th), { translate: vec3(0, p.parapet / 2, rd - th / 2) }));
  pw.push(transform(box(rw * 2, p.parapet, th), { translate: vec3(0, p.parapet / 2, -(rd - th / 2)) }));
  pw.push(transform(box(th, p.parapet, rd * 2), { translate: vec3(rw - th / 2, p.parapet / 2, 0) }));
  pw.push(transform(box(th, p.parapet, rd * 2), { translate: vec3(-(rw - th / 2), p.parapet / 2, 0) }));
  parts.push({ name: "parapet", label: "女儿墙", mesh: merge(...pw), color: CONCRETE, surface: conc([0.55, 0.55, 0.57]) });

  // HVAC package units in a row, each with a fan grille disc and a side duct.
  const units: Mesh[] = [];
  const ducts: Mesh[] = [];
  const n = Math.max(1, Math.round(p.hvacUnits));
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? -rw * 0.35 : -rw * 0.6 + (i / (n - 1)) * rw * 1.1;
    const z = -rd * 0.35;
    const uw = 1.6, uh = 1.1, ul = 2.2;
    units.push(transform(box(uw, uh, ul), { translate: vec3(x, uh / 2, z) }));
    units.push(transform(cylinder(0.55, 0.12, 16), { translate: vec3(x, uh + 0.06, z) }));
    ducts.push(transform(cylinder(0.28, 2.4, 12), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(x + 1.4, 0.6, z) }));
  }
  parts.push({ name: "hvac", label: "空调机组", mesh: merge(...units), color: GALV, surface: metal(GALV, 0.55) });
  parts.push({ name: "ducts", label: "风管", mesh: merge(...ducts), color: STEEL, surface: metal(STEEL, 0.6) });

  // A cluster of small exhaust vents / pipe stacks.
  const vents: Mesh[] = [];
  const ventSpots: Array<[number, number, number]> = [
    [rw * 0.55, 0.9, rd * 0.5], [rw * 0.55, 0.7, rd * 0.2], [rw * 0.35, 1.1, rd * 0.55],
  ];
  for (const [vx, vh, vz] of ventSpots) {
    vents.push(transform(cylinder(0.16, vh, 10), { translate: vec3(vx, vh / 2, vz) }));
    vents.push(transform(cone(0.24, 0.3, 10), { translate: vec3(vx, vh + 0.15, vz) }));
  }
  parts.push({ name: "vents", label: "排气管", mesh: merge(...vents), color: STEEL_DK, surface: metal(STEEL_DK, 0.65) });

  // Water tank on a short steel stilt frame.
  if (p.waterTank) {
    const tx = -rw * 0.55, tz = rd * 0.45;
    const stiltH = 1.4;
    const legs: Mesh[] = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      legs.push(strutY(tx + sx * 0.9, tz + sz * 0.9, 0, stiltH, 0.14));
    }
    parts.push({ name: "tank_frame", label: "水箱支架", mesh: merge(...legs), color: STEEL_DK, surface: metal(STEEL_DK, 0.6) });
    parts.push({ name: "water_tank", label: "水箱", mesh: transform(cylinder(1.3, 2.0, 20), { translate: vec3(tx, stiltH + 1.0, tz) }), color: WOOD, surface: metal([0.42, 0.3, 0.18], 0.7) });
    parts.push({ name: "tank_cap", label: "水箱顶", mesh: transform(cone(1.4, 0.9, 20), { translate: vec3(tx, stiltH + 2.4, tz) }), color: STEEL, surface: metal(STEEL, 0.6) });
  }

  // Roof-access stair hut with a door and slab roof.
  if (p.accessHut) {
    const hx = rw * 0.5, hz = -rd * 0.55;
    parts.push({ name: "access_hut", label: "楼梯间", mesh: transform(box(2.4, 2.6, 2.4), { translate: vec3(hx, 1.3, hz) }), color: BRICK, surface: conc(BRICK, 0.85) });
    parts.push({ name: "hut_roof", label: "楼梯间顶", mesh: transform(box(2.7, 0.25, 2.7), { translate: vec3(hx, 2.72, hz) }), color: CONCRETE, surface: conc(CONCRETE) });
    parts.push({ name: "hut_door", label: "屋顶门", mesh: transform(box(0.9, 1.9, 0.1), { translate: vec3(hx, 0.95, hz + 1.2) }), color: RUST_RED, surface: metal(RUST_RED, 0.6) });
  }

  return parts;
}

export interface ScaffoldingParams {
  /** Number of horizontal bays along the wall (each ~2m). */
  bays: number;
  /** Number of vertical lifts (levels). */
  lifts: number;
  /** Bay width (metres). */
  bayWidth: number;
  /** Lift height (metres). */
  liftHeight: number;
  /** Depth of the scaffold (distance from wall). */
  depth: number;
  /** Tube radius. */
  tube: number;
  /** Draw working platform planks per lift. */
  planks: boolean;
}

export const SCAFFOLDING_DEFAULTS: ScaffoldingParams = {
  bays: 4,
  lifts: 3,
  bayWidth: 2.4,
  liftHeight: 2.0,
  depth: 1.2,
  tube: 0.05,
  planks: true,
};

/** Modular tube-and-frame scaffolding: standards + ledgers + transoms + braces + planks + ladder. */
export function buildScaffoldingParts(params: Partial<ScaffoldingParams> = {}): NamedPart[] {
  const p: ScaffoldingParams = { ...SCAFFOLDING_DEFAULTS, ...params };
  const parts: NamedPart[] = [];
  const bays = Math.max(1, Math.round(p.bays));
  const lifts = Math.max(1, Math.round(p.lifts));
  const bw = p.bayWidth;
  const lh = p.liftHeight;
  const d = p.depth;
  const t = p.tube;
  const totalW = bays * bw;
  const totalH = lifts * lh;

  // Vertical standards: at each bay boundary (bays+1) x 2 rows (front/back).
  const standards: Mesh[] = [];
  for (let i = 0; i <= bays; i++) {
    const x = -totalW / 2 + i * bw;
    for (const z of [0, d]) {
      standards.push(strutY(x, z, 0, totalH + 0.3, t));
    }
  }
  parts.push({ name: "standards", label: "立杆", mesh: merge(...standards), color: GALV, surface: metal(GALV, 0.45) });

  // Horizontal ledgers (along X) + transoms (along Z) at each lift.
  const ledgers: Mesh[] = [];
  for (let l = 1; l <= lifts; l++) {
    const y = l * lh;
    for (const z of [0, d]) {
      ledgers.push(transform(box(totalW, t, t), { translate: vec3(0, y, z) }));
    }
    for (let i = 0; i <= bays; i++) {
      const x = -totalW / 2 + i * bw;
      ledgers.push(transform(box(t, t, d), { translate: vec3(x, y, d / 2) }));
    }
  }
  parts.push({ name: "ledgers", label: "横杆", mesh: merge(...ledgers), color: GALV, surface: metal(GALV, 0.45) });

  // Diagonal face braces (one per bay per lift on the outer row, thin tilted tube).
  const braces: Mesh[] = [];
  const diag = Math.hypot(bw, lh);
  const ang = Math.atan2(lh, bw);
  for (let l = 0; l < lifts; l++) {
    for (let i = 0; i < bays; i++) {
      const cx = -totalW / 2 + i * bw + bw / 2;
      const cy = l * lh + lh / 2;
      braces.push(transform(box(t, diag, t), { rotate: vec3(0, 0, Math.PI / 2 - ang), translate: vec3(cx, cy, 0) }));
    }
  }
  parts.push({ name: "braces", label: "斜撑", mesh: merge(...braces), color: STEEL_DK, surface: metal(STEEL_DK, 0.55) });

  // Working platform planks + toe-boards per lift.
  if (p.planks) {
    const plankMeshes: Mesh[] = [];
    for (let l = 1; l <= lifts; l++) {
      const y = l * lh + t;
      plankMeshes.push(transform(box(totalW, 0.05, d * 0.85), { translate: vec3(0, y, d / 2) }));
      plankMeshes.push(transform(box(totalW, 0.18, 0.03), { translate: vec3(0, y + 0.1, d - 0.03) }));
    }
    parts.push({ name: "planks", label: "脚手板", mesh: merge(...plankMeshes), color: WOOD, surface: metal([0.5, 0.36, 0.2], 0.85) });
  }

  // Access ladder on the last bay (vertical rails + rungs).
  const ladder: Mesh[] = [];
  const lx = totalW / 2 - 0.2;
  for (const off of [-0.18, 0.18]) {
    ladder.push(strutY(lx + off, d + 0.25, 0, totalH, t * 0.8));
  }
  const rungs = Math.max(2, Math.round(totalH / 0.35));
  for (let r = 1; r < rungs; r++) {
    const y = (r / rungs) * totalH;
    ladder.push(transform(box(0.42, t * 0.8, t * 0.8), { translate: vec3(lx, y, d + 0.25) }));
  }
  parts.push({ name: "ladder", label: "爬梯", mesh: merge(...ladder), color: STEEL, surface: metal(STEEL, 0.5) });

  return parts;
}

export interface BusStopParams {
  /** Shelter length along the kerb (metres). */
  length: number;
  /** Shelter depth (metres). */
  depth: number;
  /** Clearance height under the canopy. */
  height: number;
  /** Draw the seat bench inside the shelter. */
  bench: boolean;
  /** Draw the illuminated ad panel at one end. */
  adPanel: boolean;
}

export const BUS_STOP_DEFAULTS: BusStopParams = {
  length: 4.2,
  depth: 1.5,
  height: 2.4,
  bench: true,
  adPanel: true,
};

/** City bus shelter: glass rear/side walls + canopy + posts + bench + ad light-box + sign pole. */
export function buildBusStopParts(params: Partial<BusStopParams> = {}): NamedPart[] {
  const p: BusStopParams = { ...BUS_STOP_DEFAULTS, ...params };
  const parts: NamedPart[] = [];
  const L = p.length;
  const D = p.depth;
  const H = p.height;

  // Four corner posts.
  const posts: Mesh[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    posts.push(strutY(sx * (L / 2 - 0.06), sz * (D / 2 - 0.06), 0, H, 0.08));
  }
  parts.push({ name: "posts", label: "立柱", mesh: merge(...posts), color: STEEL_DK, surface: metal(STEEL_DK, 0.4) });

  // Canopy roof (slight forward overhang).
  parts.push({ name: "canopy", label: "顶棚", mesh: transform(box(L + 0.4, 0.12, D + 0.5), { translate: vec3(0, H + 0.06, 0.1) }), color: STEEL, surface: metal(STEEL, 0.45) });

  // Glass rear wall + two partial side walls.
  const glass: Mesh[] = [];
  glass.push(transform(box(L - 0.1, H - 0.2, 0.04), { translate: vec3(0, H / 2, -(D / 2 - 0.04)) }));
  glass.push(transform(box(0.04, H - 0.2, D - 0.1), { translate: vec3(-(L / 2 - 0.04), H / 2, 0) }));
  parts.push({ name: "glass", label: "玻璃围板", mesh: merge(...glass), color: GLASS, surface: { type: "glass" as const, params: { color: GLASS, roughness: 0.05 } } });

  // Bench along the rear wall.
  if (p.bench) {
    const seat = transform(box(L - 0.6, 0.08, 0.4), { translate: vec3(0, 0.5, -(D / 2 - 0.35)) });
    const legs: Mesh[] = [];
    for (const sx of [-1, 1]) legs.push(strutY(sx * (L / 2 - 0.6), -(D / 2 - 0.35), 0, 0.5, 0.06));
    parts.push({ name: "bench", label: "座椅", mesh: merge(seat, ...legs), color: STEEL, surface: metal(STEEL, 0.4) });
  }

  // Illuminated ad panel light-box at the right end.
  if (p.adPanel) {
    parts.push({ name: "ad_frame", label: "广告灯箱框", mesh: transform(box(0.12, H - 0.3, D - 0.2), { translate: vec3(L / 2 - 0.02, H / 2, 0) }), color: STEEL_DK, surface: metal(STEEL_DK, 0.4) });
    parts.push({ name: "ad_panel", label: "广告面板", mesh: transform(box(0.04, H - 0.6, D - 0.5), { translate: vec3(L / 2 + 0.02, H / 2, 0) }), color: [0.95, 0.95, 0.9], surface: ceram([0.95, 0.95, 0.9], 0.2) });
  }

  // Bus-stop sign pole standing just outside the shelter.
  const px = L / 2 + 0.8;
  parts.push({ name: "sign_pole", label: "站牌杆", mesh: transform(cylinder(0.05, H + 0.6, 10), { translate: vec3(px, (H + 0.6) / 2, D / 2) }), color: STEEL, surface: metal(STEEL, 0.45) });
  parts.push({ name: "sign_board", label: "站牌", mesh: transform(box(0.5, 0.7, 0.05), { translate: vec3(px, H + 0.2, D / 2) }), color: PAINT_BLUE, surface: metal(PAINT_BLUE, 0.4) });

  return parts;
}

export interface BicycleParams {
  /** Wheel radius (metres). */
  wheelRadius: number;
  /** Distance between front/rear axles (metres). */
  wheelbase: number;
  /** Tyre tube thickness. */
  tyre: number;
  /** Frame tube radius. */
  frameTube: number;
  /** Number of spokes per wheel. */
  spokes: number;
}

export const BICYCLE_DEFAULTS: BicycleParams = {
  wheelRadius: 0.34,
  wheelbase: 1.02,
  tyre: 0.035,
  frameTube: 0.022,
  spokes: 12,
};

/** A tube between two 3D points, approximated as a rotated cylinder. */
function tubeBetween(a: Vec3, b: Vec3, r: number): Mesh {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz) || 1e-6;
  // cylinder default axis is +Y; rotate to align with (a->b).
  const cyl = cylinder(r, len, 10);
  const yaw = Math.atan2(dx, dz);
  const pitch = Math.acos(Math.max(-1, Math.min(1, dy / len)));
  const mid = vec3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  // rotate: first tilt from +Y by `pitch` toward the XZ heading `yaw`.
  return transform(cyl, { rotate: vec3(pitch * Math.cos(yaw + Math.PI / 2), yaw, pitch * Math.sin(yaw + Math.PI / 2)) , translate: mid });
}

/** Parked bicycle: two spoked wheels, diamond frame, fork, handlebar, saddle, pedals. */
export function buildBicycleParts(params: Partial<BicycleParams> = {}): NamedPart[] {
  const p: BicycleParams = { ...BICYCLE_DEFAULTS, ...params };
  const parts: NamedPart[] = [];
  const R = p.wheelRadius;
  const wb = p.wheelbase;
  const ft = p.frameTube;

  // Axle centres: rear at x=-wb/2, front at x=+wb/2, both at y=R (wheels touch ground).
  const rear = vec3(-wb / 2, R, 0);
  const front = vec3(wb / 2, R, 0);

  // Wheels: torus in XZ plane by default -> rotate 90° about X to stand in XY (rolls along X).
  const wheels: Mesh[] = [];
  const rims: Mesh[] = [];
  const spokeMeshes: Mesh[] = [];
  for (const c of [rear, front]) {
    wheels.push(transform(torus(R, p.tyre, 28, 10), { rotate: vec3(Math.PI / 2, 0, 0), translate: c }));
    rims.push(transform(torus(R - p.tyre, ft * 0.6, 28, 8), { rotate: vec3(Math.PI / 2, 0, 0), translate: c }));
    // Spokes radiating in the wheel plane (XY).
    const ns = Math.max(4, Math.round(p.spokes));
    for (let i = 0; i < ns; i++) {
      const a = (i / ns) * Math.PI * 2;
      const rim = vec3(c.x + Math.cos(a) * (R - p.tyre), c.y + Math.sin(a) * (R - p.tyre), 0);
      spokeMeshes.push(tubeBetween(c, rim, ft * 0.28));
    }
  }
  parts.push({ name: "tyres", label: "轮胎", mesh: merge(...wheels), color: RUBBER, surface: metal(RUBBER, 0.85) });
  parts.push({ name: "rims", label: "轮圈", mesh: merge(...rims), color: CHROME, surface: metal(CHROME, 0.2) });
  parts.push({ name: "spokes", label: "辐条", mesh: merge(...spokeMeshes), color: CHROME, surface: metal(CHROME, 0.25) });

  // Frame key joints (a classic diamond frame in the XY plane).
  const bb = vec3(rear.x + wb * 0.42, R * 0.62, 0);       // bottom bracket (crank centre)
  const seatTop = vec3(rear.x + wb * 0.34, R * 2.0, 0);   // top of seat tube
  const headTop = vec3(front.x - wb * 0.16, R * 2.05, 0); // top of head tube
  const headBot = vec3(front.x - wb * 0.02, R * 1.35, 0); // fork crown

  const frame: Mesh[] = [];
  frame.push(tubeBetween(rear, bb, ft));        // chain stay
  frame.push(tubeBetween(rear, seatTop, ft));   // seat stay
  frame.push(tubeBetween(bb, seatTop, ft));     // seat tube
  frame.push(tubeBetween(bb, headBot, ft));     // down tube
  frame.push(tubeBetween(seatTop, headTop, ft));// top tube
  frame.push(tubeBetween(headTop, headBot, ft * 1.2)); // head tube
  parts.push({ name: "frame", label: "车架", mesh: merge(...frame), color: PAINT_BLUE, surface: metal(PAINT_BLUE, 0.3) });

  // Fork: from fork crown down to the front axle (two legs).
  const fork: Mesh[] = [];
  for (const dz of [-0.05, 0.05]) {
    fork.push(tubeBetween(vec3(headBot.x, headBot.y, dz), vec3(front.x, front.y, dz), ft * 0.9));
  }
  parts.push({ name: "fork", label: "前叉", mesh: merge(...fork), color: CHROME, surface: metal(CHROME, 0.25) });

  // Handlebar + stem.
  const stemTop = vec3(headTop.x, headTop.y + 0.08, 0);
  parts.push({ name: "handlebar", label: "车把", mesh: merge(
    tubeBetween(headTop, stemTop, ft),
    transform(cylinder(ft * 0.9, 0.42, 10), { rotate: vec3(Math.PI / 2, 0, 0), translate: stemTop }),
  ), color: STEEL_DK, surface: metal(STEEL_DK, 0.3) });

  // Saddle.
  parts.push({ name: "saddle", label: "车座", mesh: transform(box(0.26, 0.06, 0.14), { translate: vec3(seatTop.x, seatTop.y + 0.07, 0) }), color: RUBBER, surface: metal([0.1, 0.1, 0.11], 0.6) });

  // Crank + pedals at the bottom bracket.
  const pedals: Mesh[] = [];
  parts.push({ name: "crank", label: "牙盘", mesh: transform(cylinder(0.09, ft * 2, 16), { rotate: vec3(Math.PI / 2, 0, 0), translate: bb }), color: CHROME, surface: metal(CHROME, 0.25) });
  for (const [dx, dz] of [[0.11, 0.09], [-0.11, -0.09]] as Array<[number, number]>) {
    pedals.push(transform(box(0.1, 0.03, 0.06), { translate: vec3(bb.x + dx, bb.y - 0.02, dz) }));
  }
  parts.push({ name: "pedals", label: "脚踏", mesh: merge(...pedals), color: RUBBER, surface: metal(RUBBER, 0.7) });

  return parts;
}

export interface BillboardParams {
  /** Panel width (metres). */
  panelWidth: number;
  /** Panel height (metres). */
  panelHeight: number;
  /** Bottom clearance of the panel above ground (metres). */
  clearance: number;
  /** Single centre mast (true) or twin masts (false). */
  singleMast: boolean;
  /** Draw the lattice truss backing behind the panel. */
  truss: boolean;
  /** Draw the top-mounted flood-light bar. */
  lights: boolean;
}

export const BILLBOARD_DEFAULTS: BillboardParams = {
  panelWidth: 12,
  panelHeight: 5,
  clearance: 6,
  singleMast: true,
  truss: true,
  lights: true,
};

/** Roadside billboard: mast(s) + lattice truss backing + ad panel + flood-lights. */
export function buildBillboardParts(params: Partial<BillboardParams> = {}): NamedPart[] {
  const p: BillboardParams = { ...BILLBOARD_DEFAULTS, ...params };
  const parts: NamedPart[] = [];
  const pw = p.panelWidth;
  const ph = p.panelHeight;
  const panelCy = p.clearance + ph / 2;

  // Mast(s): one central column or two side columns.
  const masts: Mesh[] = [];
  const mastXs = p.singleMast ? [0] : [-pw * 0.32, pw * 0.32];
  const mastTop = p.clearance + ph * 0.5;
  for (const mx of mastXs) {
    masts.push(transform(cylinder(0.45, mastTop, 16), { translate: vec3(mx, mastTop / 2, 0) }));
  }
  parts.push({ name: "masts", label: "立柱", mesh: merge(...masts), color: STEEL_DK, surface: metal(STEEL_DK, 0.55) });

  // Lattice truss backing (verticals + horizontals + diagonals) just behind the panel.
  if (p.truss) {
    const truss: Mesh[] = [];
    const tz = -0.35;
    const t = 0.06;
    const cols = Math.max(3, Math.round(pw / 2));
    const rows = Math.max(2, Math.round(ph / 1.5));
    const y0 = p.clearance;
    for (let c = 0; c <= cols; c++) {
      const x = -pw / 2 + (c / cols) * pw;
      truss.push(transform(box(t, ph, t), { translate: vec3(x, panelCy, tz) }));
    }
    for (let r = 0; r <= rows; r++) {
      const y = y0 + (r / rows) * ph;
      truss.push(transform(box(pw, t, t), { translate: vec3(0, y, tz) }));
    }
    // Diagonal per cell (single direction, thin tilted box).
    const cellW = pw / cols;
    const cellH = ph / rows;
    const diag = Math.hypot(cellW, cellH);
    const ang = Math.atan2(cellH, cellW);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const cx = -pw / 2 + (c + 0.5) * cellW;
        const cy = y0 + (r + 0.5) * cellH;
        truss.push(transform(box(t, diag, t), { rotate: vec3(0, 0, Math.PI / 2 - ang), translate: vec3(cx, cy, tz - 0.05) }));
      }
    }
    parts.push({ name: "truss", label: "桁架", mesh: merge(...truss), color: STEEL, surface: metal(STEEL, 0.55) });
  }

  // Ad panel (bright faced board).
  parts.push({ name: "panel", label: "广告面板", mesh: transform(box(pw, ph, 0.2), { translate: vec3(0, panelCy, 0) }), color: [0.92, 0.92, 0.88], surface: ceram([0.92, 0.92, 0.88], 0.25) });
  // Panel frame border.
  parts.push({ name: "frame", label: "边框", mesh: merge(
    transform(box(pw + 0.4, 0.3, 0.3), { translate: vec3(0, panelCy + ph / 2 + 0.15, 0) }),
    transform(box(pw + 0.4, 0.3, 0.3), { translate: vec3(0, panelCy - ph / 2 - 0.15, 0) }),
    transform(box(0.3, ph, 0.3), { translate: vec3(-pw / 2 - 0.15, panelCy, 0) }),
    transform(box(0.3, ph, 0.3), { translate: vec3(pw / 2 + 0.15, panelCy, 0) }),
  ), color: STEEL_DK, surface: metal(STEEL_DK, 0.5) });

  // Top flood-light bar with a few lamp heads.
  if (p.lights) {
    const lights: Mesh[] = [];
    const barY = panelCy + ph / 2 + 0.7;
    lights.push(transform(box(pw * 0.9, 0.08, 0.08), { translate: vec3(0, barY, 0.5) }));
    const nl = 4;
    for (let i = 0; i < nl; i++) {
      const x = -pw * 0.35 + (i / (nl - 1)) * pw * 0.7;
      lights.push(transform(box(0.05, 0.35, 0.05), { translate: vec3(x, barY - 0.2, 0.5) }));
      lights.push(transform(cone(0.22, 0.28, 12), { rotate: vec3(Math.PI * 0.85, 0, 0), translate: vec3(x, barY - 0.4, 0.4) }));
    }
    parts.push({ name: "lights", label: "投光灯", mesh: merge(...lights), color: GALV, surface: metal(GALV, 0.4) });
  }

  return parts;
}

const CONTAINER_COLORS: RGB[] = [
  [0.62, 0.24, 0.16], // rust red
  [0.14, 0.36, 0.5],  // blue
  [0.2, 0.42, 0.26],  // green
  [0.66, 0.58, 0.16], // yellow
  [0.5, 0.5, 0.52],   // grey
];

export interface ContainerYardParams {
  /** Container length: 20ft (~6.06m) or 40ft (~12.19m) toggle via longUnits fraction. */
  containers: number;
  /** Max stack height (containers high). */
  stackHeight: number;
  /** Number of wooden pallets scattered around. */
  pallets: number;
  /** Draw stacked lumber/plywood on the pallets. */
  cargo: boolean;
  /** Seed for deterministic colour/placement jitter. */
  seed: number;
}

export const CONTAINER_YARD_DEFAULTS: ContainerYardParams = {
  containers: 4,
  stackHeight: 2,
  pallets: 3,
  cargo: true,
  seed: 7,
};

/** A single ISO container with corrugated-look ribs and end doors. */
function oneContainer(len: number, color: RGB): { body: Mesh; ribs: Mesh } {
  const w = 2.44, h = 2.59;
  const body = box(len, h, w);
  // Corrugation ribs: thin vertical slats along both long sides.
  const ribMeshes: Mesh[] = [];
  const nribs = Math.max(6, Math.round(len / 0.4));
  for (let i = 0; i < nribs; i++) {
    const x = -len / 2 + (i + 0.5) * (len / nribs);
    for (const sz of [-1, 1]) {
      ribMeshes.push(transform(box(0.06, h * 0.86, 0.05), { translate: vec3(x, h / 2, sz * (w / 2 + 0.02)) }));
    }
  }
  return { body: transform(body, { translate: vec3(0, h / 2, 0) }), ribs: merge(...ribMeshes) };
}

/** A EUR-style wooden pallet (top deck boards + bottom stringers + blocks). */
function onePallet(): Mesh {
  const L = 1.2, W = 0.8, deckT = 0.022, gap = 0.14;
  const meshes: Mesh[] = [];
  // Top deck boards (7 along L).
  for (let i = 0; i < 7; i++) {
    const x = -L / 2 + 0.05 + i * (L - 0.1) / 6;
    meshes.push(transform(box(0.09, deckT, W), { translate: vec3(x, 0.13, 0) }));
  }
  // Bottom boards (3 along L).
  for (const x of [-L / 2 + 0.08, 0, L / 2 - 0.08]) {
    meshes.push(transform(box(0.1, deckT, W), { translate: vec3(x, 0.0, 0) }));
  }
  // Blocks (9 = 3x3).
  for (const x of [-L / 2 + 0.08, 0, L / 2 - 0.08]) {
    for (const z of [-W / 2 + 0.05, 0, W / 2 - 0.05]) {
      meshes.push(transform(box(0.1, gap, 0.1), { translate: vec3(x, 0.06, z) }));
    }
  }
  return merge(...meshes);
}

/** Container yard: stacked ISO shipping containers + wooden pallets + optional cargo stacks. */
export function buildContainerYardParts(params: Partial<ContainerYardParams> = {}): NamedPart[] {
  const p: ContainerYardParams = { ...CONTAINER_YARD_DEFAULTS, ...params };
  const parts: NamedPart[] = [];
  const rng = makeRng(p.seed);
  const n = Math.max(1, Math.round(p.containers));
  const maxStack = Math.max(1, Math.round(p.stackHeight));
  const chH = 2.59;

  // Lay out containers in a rough grid, some stacked, deterministic per seed.
  const bodies: Array<{ mesh: Mesh; color: RGB }> = [];
  const ribsAll: Mesh[] = [];
  let idx = 0;
  const cols = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i++) {
    const long = rng.next() > 0.5;
    const len = long ? 12.19 : 6.06;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const baseX = col * 13 - (cols - 1) * 6.5;
    const baseZ = row * 3.0;
    const stack = 1 + rng.int(0, maxStack - 1);
    for (let s = 0; s < stack; s++) {
      const color = CONTAINER_COLORS[rng.int(0, CONTAINER_COLORS.length - 1)]!;
      const c = oneContainer(len, color);
      const y = s * (chH + 0.04);
      bodies.push({ mesh: transform(c.body, { translate: vec3(baseX, y, baseZ) }), color });
      ribsAll.push(transform(c.ribs, { translate: vec3(baseX, y, baseZ) }));
      idx++;
    }
  }
  // Group container bodies by colour so each colour is one part.
  const byColor = new Map<string, { color: RGB; meshes: Mesh[] }>();
  for (const b of bodies) {
    const key = b.color.join(",");
    if (!byColor.has(key)) byColor.set(key, { color: b.color, meshes: [] });
    byColor.get(key)!.meshes.push(b.mesh);
  }
  let ci = 0;
  for (const { color, meshes } of byColor.values()) {
    parts.push({ name: `containers_${ci}`, label: `集装箱${ci + 1}`, mesh: merge(...meshes), color, surface: metal(color, 0.6) });
    ci++;
  }
  parts.push({ name: "ribs", label: "波纹筋", mesh: merge(...ribsAll), color: STEEL_DK, surface: metal(STEEL_DK, 0.62) });

  // Pallets scattered in the foreground with optional cargo.
  const palletMeshes: Mesh[] = [];
  const cargoMeshes: Mesh[] = [];
  const np = Math.max(0, Math.round(p.pallets));
  for (let i = 0; i < np; i++) {
    const px = rng.range(-6, 6);
    const pz = rng.range(-4, -2);
    const rot = rng.range(0, Math.PI * 2);
    palletMeshes.push(transform(onePallet(), { rotate: vec3(0, rot, 0), translate: vec3(px, 0, pz) }));
    if (p.cargo) {
      // Stack of plywood/lumber boards on top.
      const layers = rng.int(3, 7);
      for (let l = 0; l < layers; l++) {
        cargoMeshes.push(transform(box(1.1, 0.05, 0.72), { rotate: vec3(0, rot, 0), translate: vec3(px, 0.16 + l * 0.055, pz) }));
      }
    }
  }
  if (palletMeshes.length) parts.push({ name: "pallets", label: "木托盘", mesh: merge(...palletMeshes), color: WOOD, surface: metal([0.5, 0.36, 0.2], 0.85) });
  if (cargoMeshes.length) parts.push({ name: "cargo", label: "堆料", mesh: merge(...cargoMeshes), color: [0.72, 0.6, 0.4], surface: metal([0.72, 0.6, 0.4], 0.8) });

  return parts;
}

export interface ManholeCoverParams {
  /** Cover radius (metres). */
  radius: number;
  /** Cover plate thickness (metres). */
  thickness: number;
  /** Number of radial pick-hole notches / pattern spokes. */
  spokes: number;
  /** Draw the recessed frame ring set into the road. */
  frame: boolean;
  /** Raise the cover slightly proud of the road (true) or flush (false). */
  proud: boolean;
}

export const MANHOLE_COVER_DEFAULTS: ManholeCoverParams = {
  radius: 0.32,
  thickness: 0.04,
  spokes: 12,
  frame: true,
  proud: true,
};

/** Cast-iron manhole cover: frame ring + circular plate + radial rib pattern + rim. */
export function buildManholeCoverParts(params: Partial<ManholeCoverParams> = {}): NamedPart[] {
  const p: ManholeCoverParams = { ...MANHOLE_COVER_DEFAULTS, ...params };
  const parts: NamedPart[] = [];
  const R = p.radius;
  const th = p.thickness;
  const baseY = p.proud ? 0.01 : 0;

  // Frame ring set into the road (a slightly larger torus flush with ground).
  if (p.frame) {
    parts.push({ name: "frame", label: "座圈", mesh: transform(torus(R + 0.05, 0.05, 40, 8), { translate: vec3(0, baseY, 0) }), color: STEEL_DK, surface: metal(STEEL_DK, 0.7) });
  }

  // Cover plate (short cylinder disc).
  const plateY = baseY + th / 2;
  parts.push({ name: "plate", label: "盖板", mesh: transform(cylinder(R, th, 48), { translate: vec3(0, plateY, 0) }), color: [0.24, 0.24, 0.26], surface: metal([0.24, 0.24, 0.26], 0.72) });

  // Outer rim ring (raised lip near the edge).
  parts.push({ name: "rim", label: "边缘环", mesh: transform(torus(R * 0.9, 0.02, 40, 6), { translate: vec3(0, baseY + th, 0) }), color: [0.3, 0.3, 0.32], surface: metal([0.3, 0.3, 0.32], 0.65) });

  // Radial rib pattern on the top face (thin raised bars).
  const ribs: Mesh[] = [];
  const ns = Math.max(4, Math.round(p.spokes));
  for (let i = 0; i < ns; i++) {
    const a = (i / ns) * Math.PI * 2;
    ribs.push(transform(box(R * 0.72, 0.012, 0.03), { rotate: vec3(0, a, 0), translate: vec3(0, baseY + th + 0.006, 0) }));
  }
  // Central boss.
  ribs.push(transform(cylinder(R * 0.14, 0.02, 16), { translate: vec3(0, baseY + th + 0.01, 0) }));
  parts.push({ name: "pattern", label: "花纹", mesh: merge(...ribs), color: [0.32, 0.32, 0.34], surface: metal([0.32, 0.32, 0.34], 0.66) });

  // Two pick-holes at the edge (small notches, shown as tiny recessed discs).
  const holes: Mesh[] = [];
  for (const a of [0, Math.PI]) {
    holes.push(transform(cylinder(0.03, th * 1.2, 10), { translate: vec3(Math.cos(a) * R * 0.8, baseY + th * 0.5, Math.sin(a) * R * 0.8) }));
  }
  parts.push({ name: "pick_holes", label: "撬孔", mesh: merge(...holes), color: [0.1, 0.1, 0.11], surface: metal([0.1, 0.1, 0.11], 0.8) });

  return parts;
}

export interface BarrierRunParams {
  /** Number of barrier segments in a line. */
  segments: number;
  /** Segment length (metres). */
  segLength: number;
  /** Style: "jersey" plastic water barrier, "aframe" A-frame barricade, "chainlink" fence. */
  style: "jersey" | "aframe" | "chainlink";
  /** Fence/barrier height (metres). */
  height: number;
}

export const BARRIER_RUN_DEFAULTS: BarrierRunParams = {
  segments: 5,
  segLength: 2.0,
  style: "jersey",
  height: 1.0,
};

/** Construction barrier run: jersey water barriers, A-frame barricades, or chain-link fence. */
export function buildBarrierRunParts(params: Partial<BarrierRunParams> = {}): NamedPart[] {
  const p: BarrierRunParams = { ...BARRIER_RUN_DEFAULTS, ...params };
  const parts: NamedPart[] = [];
  const n = Math.max(1, Math.round(p.segments));
  const sl = p.segLength;
  const total = n * sl;
  const x0 = -total / 2;

  if (p.style === "jersey") {
    // Plastic water-filled jersey barriers: wide base + narrow top.
    const bodies: Mesh[] = [];
    for (let i = 0; i < n; i++) {
      const cx = x0 + (i + 0.5) * sl;
      bodies.push(transform(box(sl - 0.05, p.height * 0.45, 0.5), { translate: vec3(cx, p.height * 0.22, 0) }));
      bodies.push(transform(box(sl - 0.05, p.height * 0.55, 0.24), { translate: vec3(cx, p.height * 0.72, 0) }));
    }
    parts.push({ name: "barriers", label: "水马围挡", mesh: merge(...bodies), color: [0.85, 0.35, 0.08], surface: metal([0.85, 0.35, 0.08], 0.5) });
    return parts;
  }

  if (p.style === "aframe") {
    // A-frame traffic barricades: two splayed legs + horizontal reflective plank.
    const frames: Mesh[] = [];
    const planks: Mesh[] = [];
    for (let i = 0; i < n; i++) {
      const cx = x0 + (i + 0.5) * sl;
      for (const sz of [-0.35, 0.35]) {
        frames.push(transform(box(0.06, p.height, 0.06), { rotate: vec3(sz > 0 ? 0.18 : -0.18, 0, 0), translate: vec3(cx, p.height / 2, sz) }));
      }
      planks.push(transform(box(sl - 0.1, 0.28, 0.05), { translate: vec3(cx, p.height * 0.75, 0) }));
    }
    parts.push({ name: "frames", label: "支架", mesh: merge(...frames), color: STEEL_DK, surface: metal(STEEL_DK, 0.55) });
    parts.push({ name: "planks", label: "反光板", mesh: merge(...planks), color: [0.9, 0.55, 0.05], surface: metal([0.9, 0.55, 0.05], 0.4) });
    return parts;
  }

  // Chain-link fence: posts + top/bottom rails + a thin mesh panel stand-in.
  const posts: Mesh[] = [];
  for (let i = 0; i <= n; i++) {
    posts.push(transform(cylinder(0.04, p.height, 10), { translate: vec3(x0 + i * sl, p.height / 2, 0) }));
  }
  parts.push({ name: "posts", label: "立柱", mesh: merge(...posts), color: GALV, surface: metal(GALV, 0.5) });
  const rails: Mesh[] = [];
  for (const ry of [p.height - 0.05, 0.1]) {
    rails.push(transform(box(total, 0.05, 0.05), { translate: vec3(0, ry, 0) }));
  }
  parts.push({ name: "rails", label: "横管", mesh: merge(...rails), color: GALV, surface: metal(GALV, 0.5) });
  parts.push({ name: "mesh_panel", label: "网面", mesh: transform(box(total, p.height - 0.15, 0.01), { translate: vec3(0, p.height / 2 + 0.02, 0) }), color: [0.55, 0.56, 0.58], surface: metal([0.55, 0.56, 0.58], 0.6) });
  return parts;
}

export interface FireEscapeParams {
  /** Number of stacked floor landings. */
  floors: number;
  /** Floor-to-floor height (metres). */
  floorHeight: number;
  /** Landing platform depth from the wall (metres). */
  platformDepth: number;
  /** Landing width along the wall (metres). */
  width: number;
  /** Draw the diagonal connecting stairs. */
  stairs: boolean;
}

export const FIRE_ESCAPE_DEFAULTS: FireEscapeParams = {
  floors: 4,
  floorHeight: 3.2,
  platformDepth: 1.2,
  width: 2.6,
  stairs: true,
};

/** Wall-mounted iron fire escape: stacked landings + railings + zig-zag stairs + stringers. */
export function buildFireEscapeParts(params: Partial<FireEscapeParams> = {}): NamedPart[] {
  const p: FireEscapeParams = { ...FIRE_ESCAPE_DEFAULTS, ...params };
  const parts: NamedPart[] = [];
  const n = Math.max(1, Math.round(p.floors));
  const fh = p.floorHeight;
  const pd = p.platformDepth;
  const w = p.width;
  // Wall at z=0; escape extends into +Z.

  const platforms: Mesh[] = [];
  const rails: Mesh[] = [];
  const stringers: Mesh[] = [];
  const steps: Mesh[] = [];

  for (let f = 0; f < n; f++) {
    const y = (f + 1) * fh;
    // Landing grate platform.
    platforms.push(transform(box(w, 0.08, pd), { translate: vec3(0, y, pd / 2 + 0.1) }));
    // Support brackets under the platform (two diagonal struts to the wall).
    for (const sx of [-w / 2 + 0.1, w / 2 - 0.1]) {
      stringers.push(transform(box(0.06, 0.06, Math.hypot(pd, 0.6)), { rotate: vec3(Math.atan2(0.6, pd), 0, 0), translate: vec3(sx, y - 0.35, pd / 2 + 0.1) }));
    }
    // Railings: front rail + two side rails + balusters.
    const rh = 1.0;
    rails.push(transform(box(w, 0.05, 0.05), { translate: vec3(0, y + rh, pd + 0.1) }));
    for (const sx of [-w / 2, w / 2]) {
      rails.push(transform(box(0.05, 0.05, pd), { translate: vec3(sx, y + rh, pd / 2 + 0.1) }));
    }
    const nbal = 6;
    for (let b = 0; b <= nbal; b++) {
      const bx = -w / 2 + (b / nbal) * w;
      rails.push(transform(box(0.03, rh, 0.03), { translate: vec3(bx, y + rh / 2, pd + 0.1) }));
    }
  }

  // Zig-zag connecting stairs between consecutive landings.
  if (p.stairs) {
    for (let f = 0; f < n; f++) {
      const yTop = (f + 1) * fh;
      const yBot = f * fh + 0.1;
      const side = f % 2 === 0 ? -1 : 1; // alternate stair side
      const sx = side * (w / 2 - 0.4);
      const run = pd;
      const rise = yTop - yBot;
      const diag = Math.hypot(run, rise);
      const ang = Math.atan2(rise, run);
      // Two stringers.
      for (const off of [-0.35, 0.35]) {
        stringers.push(transform(box(0.05, 0.05, diag), { rotate: vec3(-ang, 0, 0), translate: vec3(sx + off, (yTop + yBot) / 2, pd / 2 + 0.1) }));
      }
      // Steps.
      const nsteps = Math.max(4, Math.round(rise / 0.28));
      for (let s = 1; s < nsteps; s++) {
        const t = s / nsteps;
        steps.push(transform(box(0.7, 0.03, 0.22), { translate: vec3(sx, yBot + t * rise, 0.1 + t * pd) }));
      }
    }
  }

  parts.push({ name: "platforms", label: "平台", mesh: merge(...platforms), color: STEEL_DK, surface: metal(STEEL_DK, 0.65) });
  parts.push({ name: "railings", label: "栏杆", mesh: merge(...rails), color: STEEL_DK, surface: metal(STEEL_DK, 0.6) });
  parts.push({ name: "stringers", label: "斜梁", mesh: merge(...stringers), color: STEEL, surface: metal(STEEL, 0.6) });
  if (steps.length) parts.push({ name: "steps", label: "踏步", mesh: merge(...steps), color: STEEL, surface: metal(STEEL, 0.62) });

  return parts;
}

export interface NewsstandParams {
  /** Booth width along the pavement (metres). */
  width: number;
  /** Booth depth (metres). */
  depth: number;
  /** Booth body height (metres). */
  height: number;
  /** Draw the front serving counter + awning. */
  awning: boolean;
  /** Draw a row of newspaper vending dispensers alongside. */
  dispensers: number;
}

export const NEWSSTAND_DEFAULTS: NewsstandParams = {
  width: 2.6,
  depth: 1.8,
  height: 2.4,
  awning: true,
  dispensers: 2,
};

/** Sidewalk newsstand: kiosk body + serving hatch + display racks + awning + vending dispensers. */
export function buildNewsstandParts(params: Partial<NewsstandParams> = {}): NamedPart[] {
  const p: NewsstandParams = { ...NEWSSTAND_DEFAULTS, ...params };
  const parts: NamedPart[] = [];
  const w = p.width;
  const d = p.depth;
  const h = p.height;

  // Main body (kiosk box).
  parts.push({ name: "body", label: "亭身", mesh: transform(box(w, h, d), { translate: vec3(0, h / 2, 0) }), color: [0.2, 0.28, 0.34], surface: metal([0.2, 0.28, 0.34], 0.55) });
  // Roof cap.
  parts.push({ name: "roof", label: "顶盖", mesh: transform(box(w + 0.3, 0.18, d + 0.3), { translate: vec3(0, h + 0.09, 0) }), color: STEEL_DK, surface: metal(STEEL_DK, 0.5) });

  // Front serving hatch opening (a recessed dark panel) + counter shelf.
  const frontZ = d / 2;
  parts.push({ name: "hatch", label: "售货窗", mesh: transform(box(w * 0.8, h * 0.42, 0.04), { translate: vec3(0, h * 0.62, frontZ + 0.02) }), color: [0.05, 0.05, 0.06], surface: metal([0.05, 0.05, 0.06], 0.3) });
  parts.push({ name: "counter", label: "台面", mesh: transform(box(w * 0.9, 0.08, 0.35), { translate: vec3(0, h * 0.4, frontZ + 0.15) }), color: STEEL, surface: metal(STEEL, 0.5) });

  // Side magazine display racks (a few slanted shelves).
  const racks: Mesh[] = [];
  const rackZ = frontZ + 0.05;
  for (let s = 0; s < 3; s++) {
    racks.push(transform(box(w * 0.9, 0.04, 0.28), { rotate: vec3(-0.35, 0, 0), translate: vec3(0, h * 0.28 - s * 0.28, rackZ + 0.2 + s * 0.05) }));
  }
  parts.push({ name: "racks", label: "报刊架", mesh: merge(...racks), color: [0.85, 0.82, 0.72], surface: ceram([0.85, 0.82, 0.72], 0.5) });

  // Awning over the serving side.
  if (p.awning) {
    parts.push({ name: "awning", label: "遮阳棚", mesh: transform(box(w + 0.4, 0.06, 0.9), { rotate: vec3(-0.2, 0, 0), translate: vec3(0, h * 0.86, frontZ + 0.45) }), color: [0.6, 0.12, 0.1], surface: metal([0.6, 0.12, 0.1], 0.6) });
  }

  // Newspaper vending dispensers standing beside the booth.
  const nd = Math.max(0, Math.round(p.dispensers));
  const disp: Mesh[] = [];
  const legs: Mesh[] = [];
  for (let i = 0; i < nd; i++) {
    const dx = w / 2 + 0.5 + i * 0.6;
    // Box on legs, slanted display window on front.
    disp.push(transform(box(0.45, 0.7, 0.4), { translate: vec3(dx, 0.9, 0) }));
    disp.push(transform(box(0.4, 0.3, 0.04), { rotate: vec3(0.3, 0, 0), translate: vec3(dx, 1.15, 0.22) }));
    for (const [lx, lz] of [[-0.16, -0.14], [0.16, -0.14], [-0.16, 0.14], [0.16, 0.14]] as Array<[number, number]>) {
      legs.push(strutY(dx + lx, lz, 0, 0.55, 0.04));
    }
  }
  if (disp.length) {
    parts.push({ name: "dispensers", label: "报箱", mesh: merge(...disp), color: [0.75, 0.15, 0.12], surface: metal([0.75, 0.15, 0.12], 0.5) });
    parts.push({ name: "dispenser_legs", label: "报箱腿", mesh: merge(...legs), color: STEEL_DK, surface: metal(STEEL_DK, 0.55) });
  }

  return parts;
}

// -----------------------------------------------------------------------------
// Traffic signal — cantilever mast-arm holding a 3-lens vehicle head plus an
// optional pedestrian head and street-name sign. Source: CitySample intersection
// signal rigs (Kit_StreetLamp/Sign family + traffic control).
// -----------------------------------------------------------------------------

export interface TrafficSignalParams {
  /** Mast (upright pole) height in metres. */
  mastHeight: number;
  /** Horizontal cantilever arm reach over the road. */
  armReach: number;
  /** Number of vehicle signal heads hung along the arm. */
  heads: number;
  /** Add a pedestrian signal head + push button on the mast. */
  pedestrian: boolean;
  /** Add a street-name sign blade on top of the arm. */
  streetSign: boolean;
}

export const TRAFFIC_SIGNAL_DEFAULTS: TrafficSignalParams = {
  mastHeight: 6.2,
  armReach: 5.5,
  heads: 2,
  pedestrian: true,
  streetSign: true,
};

const SIGNAL_HOUSING: RGB = [0.14, 0.16, 0.15];
const LENS_RED: RGB = [0.85, 0.12, 0.1];
const LENS_AMBER: RGB = [0.92, 0.62, 0.08];
const LENS_GREEN: RGB = [0.12, 0.72, 0.32];

/** Build one 3-lens vehicle signal head centred at the given hang point. */
function signalHead(cx: number, topY: number): NamedPart[] {
  const bodyH = 1.05;
  const bodyY = topY - bodyH / 2 - 0.05;
  const housing: Mesh = transform(box(0.32, bodyH, 0.28), { translate: vec3(cx, bodyY, 0) });
  const parts: NamedPart[] = [
    { name: "housing", label: "灯箱", mesh: housing, color: SIGNAL_HOUSING, surface: metal(SIGNAL_HOUSING, 0.5) },
  ];
  // Three lenses (red/amber/green) facing +Z, each with a small visor hood.
  const lenses: Array<[RGB, number]> = [[LENS_RED, 0.32], [LENS_AMBER, 0], [LENS_GREEN, -0.32]];
  const lensMesh: Mesh[] = [];
  const hoods: Mesh[] = [];
  for (const [, dy] of lenses) {
    lensMesh.push(transform(cylinder(0.1, 0.05, 16), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(cx, topY - 0.28 + dy - 0.35, 0.15) }));
    hoods.push(transform(cone(0.13, 0.14, 16, false), { rotate: vec3(-Math.PI / 2, 0, 0), translate: vec3(cx, topY - 0.28 + dy - 0.35, 0.24) }));
  }
  parts.push({ name: "lens_red", label: "红灯", mesh: lensMesh[0]!, color: LENS_RED, surface: { type: "glass" as const, params: { color: LENS_RED, transmission: 0.2, roughness: 0.15 } } });
  parts.push({ name: "lens_amber", label: "黄灯", mesh: lensMesh[1]!, color: LENS_AMBER, surface: { type: "glass" as const, params: { color: LENS_AMBER, transmission: 0.2, roughness: 0.15 } } });
  parts.push({ name: "lens_green", label: "绿灯", mesh: lensMesh[2]!, color: LENS_GREEN, surface: { type: "glass" as const, params: { color: LENS_GREEN, transmission: 0.2, roughness: 0.15 } } });
  parts.push({ name: "visors", label: "遮光罩", mesh: merge(...hoods), color: SIGNAL_HOUSING, surface: metal(SIGNAL_HOUSING, 0.5) });
  return parts;
}

/** Cantilever traffic signal: base + mast + mast-arm + vehicle heads + pedestrian head + street sign. */
export function buildTrafficSignalParts(params: Partial<TrafficSignalParams> = {}): NamedPart[] {
  const p: TrafficSignalParams = { ...TRAFFIC_SIGNAL_DEFAULTS, ...params };
  const parts: NamedPart[] = [];
  const mh = p.mastHeight;
  const reach = p.armReach;

  // Foundation base + anchor bolts.
  parts.push({ name: "base", label: "基座", mesh: transform(cylinder(0.4, 0.3, 16), { translate: vec3(0, 0.15, 0) }), color: CONCRETE, surface: conc(CONCRETE) });
  // Upright mast pole.
  parts.push({ name: "mast", label: "立杆", mesh: transform(cylinder(0.17, mh, 20), { translate: vec3(0, 0.3 + mh / 2, 0) }), color: STEEL_DK, surface: metal(STEEL_DK, 0.45) });
  // Horizontal cantilever arm reaching over the road (+X).
  const armY = 0.3 + mh - 0.4;
  parts.push({ name: "arm", label: "悬臂", mesh: transform(cylinder(0.12, reach, 16), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(reach / 2, armY, 0) }), color: STEEL_DK, surface: metal(STEEL_DK, 0.45) });
  // Gusset connecting mast to arm.
  parts.push({ name: "gusset", label: "加强板", mesh: transform(box(0.9, 0.7, 0.06), { rotate: vec3(0, 0, -0.7), translate: vec3(0.5, armY - 0.45, 0) }), color: STEEL_DK, surface: metal(STEEL_DK, 0.5) });

  // Vehicle signal heads hung along the arm.
  const nh = Math.max(1, Math.round(p.heads));
  for (let i = 0; i < nh; i++) {
    const cx = reach * (0.45 + (0.5 * i) / Math.max(1, nh));
    for (const hp of signalHead(cx, armY - 0.15)) {
      parts.push({ ...hp, name: `head${i}_${hp.name}`, label: `信号${i + 1}·${hp.label}` });
    }
  }

  // Pedestrian head + push-button box on the mast.
  if (p.pedestrian) {
    const py = 0.3 + 2.6;
    parts.push({ name: "ped_box", label: "人行灯箱", mesh: transform(box(0.36, 0.5, 0.24), { translate: vec3(0.18, py, 0.16) }), color: SIGNAL_HOUSING, surface: metal(SIGNAL_HOUSING, 0.5) });
    parts.push({ name: "ped_lens", label: "人行灯面", mesh: transform(box(0.28, 0.4, 0.03), { translate: vec3(0.18, py, 0.29) }), color: [0.9, 0.55, 0.1], surface: { type: "glass" as const, params: { color: [0.9, 0.55, 0.1], transmission: 0.2, roughness: 0.2 } } });
    parts.push({ name: "push_button", label: "过街按钮", mesh: transform(box(0.14, 0.2, 0.12), { translate: vec3(0.16, 1.1, 0.14) }), color: [0.8, 0.75, 0.1], surface: metal([0.8, 0.75, 0.1], 0.5) });
  }

  // Street-name sign blade on top of the arm.
  if (p.streetSign) {
    parts.push({ name: "sign", label: "路名牌", mesh: transform(box(1.8, 0.3, 0.04), { translate: vec3(reach * 0.4, armY + 0.35, 0) }), color: [0.1, 0.42, 0.24], surface: metal([0.1, 0.42, 0.24], 0.4) });
  }

  return parts;
}

// -----------------------------------------------------------------------------
// Cafe umbrella + stone table set — patio furniture that dresses plazas and
// sidewalks. Source: CitySample Kit_Umbella_StoneTable_A.
// -----------------------------------------------------------------------------

export interface UmbrellaTableParams {
  /** Radius of the round stone table top (metres). */
  tableRadius: number;
  /** Radius of the fabric umbrella canopy (metres). */
  umbrellaRadius: number;
  /** Number of stools around the table. */
  stools: number;
  /** Canopy fabric colour tint. */
  canopy: RGB;
}

export const UMBRELLA_TABLE_DEFAULTS: UmbrellaTableParams = {
  tableRadius: 0.55,
  umbrellaRadius: 1.5,
  stools: 4,
  canopy: [0.82, 0.28, 0.2],
};

const STONE: RGB = [0.62, 0.6, 0.56];

/** Cafe set: stone table + centre pole + fabric umbrella canopy + ring of stools. */
export function buildUmbrellaTableParts(params: Partial<UmbrellaTableParams> = {}): NamedPart[] {
  const p: UmbrellaTableParams = { ...UMBRELLA_TABLE_DEFAULTS, ...params };
  const parts: NamedPart[] = [];
  const tr = p.tableRadius;
  const tableY = 0.74;

  // Table top + pedestal + base.
  parts.push({ name: "table_top", label: "桌面", mesh: transform(cylinder(tr, 0.06, 32), { translate: vec3(0, tableY, 0) }), color: STONE, surface: conc(STONE, 0.5) });
  parts.push({ name: "table_pole", label: "桌柱", mesh: transform(cylinder(0.07, tableY, 12), { translate: vec3(0, tableY / 2, 0) }), color: STEEL_DK, surface: metal(STEEL_DK, 0.5) });
  parts.push({ name: "table_base", label: "桌基", mesh: transform(cylinder(0.28, 0.06, 24), { translate: vec3(0, 0.03, 0) }), color: STONE, surface: conc(STONE, 0.6) });

  // Umbrella mast through the table + canopy (cone) + tip finial.
  const canopyY = 2.35;
  parts.push({ name: "umbrella_pole", label: "伞杆", mesh: transform(cylinder(0.035, canopyY, 12), { translate: vec3(0, canopyY / 2, 0) }), color: WOOD, surface: metal(WOOD, 0.6) });
  parts.push({ name: "canopy", label: "伞面", mesh: transform(cone(p.umbrellaRadius, 0.55, 12, false), { translate: vec3(0, canopyY, 0) }), color: p.canopy, surface: { type: "fabric" as const, params: { color: p.canopy, roughness: 0.85 } } });
  // Scalloped valance ring under the canopy edge.
  parts.push({ name: "valance", label: "伞裙", mesh: transform(cylinder(p.umbrellaRadius * 0.92, 0.12, 12, false), { translate: vec3(0, canopyY - 0.14, 0) }), color: p.canopy, surface: { type: "fabric" as const, params: { color: p.canopy, roughness: 0.85 } } });
  parts.push({ name: "finial", label: "伞顶", mesh: transform(sphere(0.06, 10, 8), { translate: vec3(0, canopyY + 0.58, 0) }), color: WOOD, surface: metal(WOOD, 0.5) });

  // Ring of stools around the table.
  const ns = Math.max(0, Math.round(p.stools));
  const seats: Mesh[] = [];
  const legs: Mesh[] = [];
  const ringR = tr + 0.55;
  for (let i = 0; i < ns; i++) {
    const a = (i / ns) * Math.PI * 2;
    const sx = Math.cos(a) * ringR;
    const sz = Math.sin(a) * ringR;
    seats.push(transform(cylinder(0.2, 0.06, 16), { translate: vec3(sx, 0.48, sz) }));
    legs.push(transform(cylinder(0.045, 0.46, 8), { translate: vec3(sx, 0.23, sz) }));
  }
  if (seats.length) {
    parts.push({ name: "stool_seats", label: "凳面", mesh: merge(...seats), color: WOOD, surface: metal(WOOD, 0.55) });
    parts.push({ name: "stool_legs", label: "凳腿", mesh: merge(...legs), color: STEEL_DK, surface: metal(STEEL_DK, 0.5) });
  }

  return parts;
}

// -----------------------------------------------------------------------------
// Street tree with tree pit — a low-poly deterministic canopy tree set in a
// paver tree-pit with a protective steel guard. Source: CitySample Kit_Tree_*
// + Kit_TreeBase_A. Deterministic (seeded), no time, same seed -> same tree.
// -----------------------------------------------------------------------------

export interface StreetTreeParams {
  /** Trunk height to first branching (metres). */
  trunkHeight: number;
  /** Overall canopy radius (metres). */
  canopyRadius: number;
  /** Number of canopy foliage clusters (blobs). */
  clusters: number;
  /** Draw the paver tree-pit surround + steel tree guard. */
  pit: boolean;
  /** Foliage colour tint. */
  foliage: RGB;
  /** Seed for deterministic cluster placement. */
  seed: number;
}

export const STREET_TREE_DEFAULTS: StreetTreeParams = {
  trunkHeight: 2.2,
  canopyRadius: 2.0,
  clusters: 7,
  pit: true,
  foliage: [0.26, 0.44, 0.2],
  seed: 7,
};

const BARK: RGB = [0.32, 0.24, 0.17];

/** Street tree: trunk + a few tapered limbs + clustered canopy blobs + paver pit + steel guard. */
export function buildStreetTreeParts(params: Partial<StreetTreeParams> = {}): NamedPart[] {
  const p: StreetTreeParams = { ...STREET_TREE_DEFAULTS, ...params };
  const parts: NamedPart[] = [];
  const rng = makeRng(p.seed);
  const th = p.trunkHeight;
  const cr = p.canopyRadius;

  // Trunk (slightly tapered by using a stubby cone) + flare at ground.
  parts.push({ name: "trunk", label: "树干", mesh: transform(cylinder(0.18, th, 12), { translate: vec3(0, th / 2, 0) }), color: BARK, surface: { type: "wood" as const, params: { color: BARK, roughness: 0.85 } } });
  parts.push({ name: "flare", label: "根盘", mesh: transform(cone(0.34, 0.4, 12, false), { translate: vec3(0, 0.2, 0) }), color: BARK, surface: { type: "wood" as const, params: { color: BARK, roughness: 0.9 } } });

  // A few upward limbs.
  const limbs: Mesh[] = [];
  const nl = 4;
  for (let i = 0; i < nl; i++) {
    const a = (i / nl) * Math.PI * 2 + 0.4;
    const lean = 0.5 + rng.next() * 0.3;
    limbs.push(transform(cylinder(0.07, 1.1, 8), { rotate: vec3(lean, a, 0), translate: vec3(Math.cos(a) * 0.35, th + 0.35, Math.sin(a) * 0.35) }));
  }
  parts.push({ name: "limbs", label: "枝条", mesh: merge(...limbs), color: BARK, surface: { type: "wood" as const, params: { color: BARK, roughness: 0.85 } } });

  // Canopy: overlapping foliage blobs placed deterministically in a dome.
  const blobs: Mesh[] = [];
  const nc = Math.max(1, Math.round(p.clusters));
  const canopyBase = th + 0.6;
  for (let i = 0; i < nc; i++) {
    const a = rng.next() * Math.PI * 2;
    const rr = rng.next() * cr * 0.6;
    const bx = Math.cos(a) * rr;
    const bz = Math.sin(a) * rr;
    const by = canopyBase + rng.next() * cr * 0.7;
    const br = cr * (0.4 + rng.next() * 0.35);
    blobs.push(transform(sphere(br, 12, 9), { translate: vec3(bx, by, bz) }));
  }
  parts.push({ name: "canopy", label: "树冠", mesh: merge(...blobs), color: p.foliage, surface: { type: "fabric" as const, params: { color: p.foliage, roughness: 0.95 } } });

  // Tree pit: paver surround ring + soil disc + steel tree guard grate.
  if (p.pit) {
    parts.push({ name: "pit_border", label: "树池边", mesh: transform(torus(0.95, 0.1, 32, 8), { translate: vec3(0, 0.05, 0) }), color: STONE, surface: conc(STONE, 0.8) });
    parts.push({ name: "soil", label: "树池土", mesh: transform(cylinder(0.85, 0.04, 32), { translate: vec3(0, 0.02, 0) }), color: [0.24, 0.18, 0.12], surface: conc([0.24, 0.18, 0.12], 0.95) });
    // Radial guard bars.
    const bars: Mesh[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      bars.push(transform(box(0.82, 0.03, 0.03), { rotate: vec3(0, a, 0), translate: vec3(0, 0.09, 0) }));
    }
    bars.push(transform(torus(0.8, 0.02, 32, 6), { translate: vec3(0, 0.09, 0) }));
    bars.push(transform(torus(0.4, 0.02, 24, 6), { translate: vec3(0, 0.09, 0) }));
    parts.push({ name: "guard", label: "护树栅", mesh: merge(...bars), color: STEEL_DK, surface: metal(STEEL_DK, 0.55) });
  }

  return parts;
}



