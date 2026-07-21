/**
 * Procedural city district — a large-scale, multi-block urban grid.
 *
 * This scales the single-block generator up to a full district, following the
 * Houdini city pipeline shown in the reference tutorial (wangtaian, BV1kk4y1t75G):
 *
 *   1. A street grid (avenues x streets) partitions the ground into blocks.
 *   2. Each block is a rectangular parcel; buildings are placed *perimeter-style*
 *      around its edges, fronts facing the surrounding streets, leaving an inner
 *      courtyard — the "red-brick warehouse" district look.
 *   3. Per-lot seeds drive floor count, roof style and a brick/stone palette so
 *      the skyline varies while the whole district stays deterministic.
 *   4. Streets get asphalt + sidewalks + a dashed centre line; intersections are
 *      filled so the road network reads continuously.
 *
 * Everything derives from one master seed: same params -> same city, every run
 * (Meshova's determinism invariant). Parts are merged by name across the whole
 * district so the scene stays a handful of material groups, not thousands.
 *
 * Run: pnpm city-district
 */
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng, type Rng } from "../random/prng.js";
import {
  box,
  joinedRoadJunctionMesh,
  merge,
  roadJunctionRadius,
  transform,
  translateMesh,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { buildBuildingParts, type BuildingParams, type RoofType } from "./building.js";
import {
  buildParkBenchParts,
  buildStreetLampParts,
  buildStreetTreeParts,
  buildTrafficSignalParts,
  buildTrashcanParts,
} from "./city-props.js";
import { buildWaterTowerParts } from "./water-tower.js";

type RGB = [number, number, number];

export interface CityDistrictParams {
  /** Blocks along X (number of avenue-separated columns of blocks). */
  blocksX: number;
  /** Blocks along Z (number of street-separated rows of blocks). */
  blocksZ: number;
  /** Block footprint in X (parcel width, before the street gap). */
  blockX: number;
  /** Block footprint in Z (parcel depth, before the street gap). */
  blockZ: number;
  /** Street width between blocks (asphalt + both sidewalks). */
  streetWidth: number;
  /** Building footprint width (X) placed along the block edge. */
  lotWidth: number;
  /** Building footprint depth (Z), i.e. how far it reaches into the block. */
  lotDepth: number;
  /** Min floors (random per building). */
  minFloors: number;
  /** Max floors (random per building). */
  maxFloors: number;
  /** Standard storey height. */
  floorHeight: number;
  /** Fraction (0..1) of flat-roof buildings that get a rooftop water tower. */
  waterTowers: number;
  /** Add row of street trees along each sidewalk. */
  streetTrees: boolean;
  /** Add lamps, benches, bins and traffic signals on generated sidewalks. */
  streetFurniture: boolean;
  /** Spacing target for sidewalk trees / props. */
  propSpacing: number;
  /** Add zebra crossings at street intersections. */
  crosswalks: boolean;
  /** Per-lot lateral offset, like the hand-offset curve pass in the reference. */
  lotJitter: number;
  /** Master seed; every block/lot derives a stable seed from it. */
  seed: number;
  /** Base params applied to every building (bays, features, ...). */
  base?: Partial<BuildingParams>;
}

export const CITY_DISTRICT_DEFAULTS: CityDistrictParams = {
  blocksX: 5,
  blocksZ: 4,
  blockX: 34,
  blockZ: 26,
  streetWidth: 9,
  lotWidth: 12,
  lotDepth: 7,
  minFloors: 3,
  maxFloors: 10,
  floorHeight: 1.15,
  waterTowers: 0.35,
  streetTrees: true,
  streetFurniture: true,
  propSpacing: 14,
  crosswalks: true,
  lotJitter: 0.25,
  seed: 42,
  base: { baysX: 2, baysZ: 2 },
};

// --- red-brick warehouse district palette ---------------------------------
// Each entry recolors the building's wall/slab/pilaster groups so the skyline
// reads as a mix of red brick, buff/sand stone and pale render, matching the
// reference tutorial's warehouse city. Windows/frames/glass keep their own
// materials so the facade grid still reads honestly.
interface FacadePalette {
  wall: RGB;
  trim: RGB;
  surface: "brick" | "concrete" | "stone";
}
const PALETTES: FacadePalette[] = [
  { wall: [0.52, 0.24, 0.18], trim: [0.4, 0.19, 0.15], surface: "brick" }, // deep red brick
  { wall: [0.62, 0.31, 0.22], trim: [0.48, 0.24, 0.18], surface: "brick" }, // orange brick
  { wall: [0.78, 0.68, 0.5], trim: [0.6, 0.52, 0.38], surface: "stone" }, // buff sandstone
  { wall: [0.82, 0.78, 0.72], trim: [0.66, 0.62, 0.57], surface: "stone" }, // pale render
  { wall: [0.45, 0.2, 0.16], trim: [0.34, 0.15, 0.12], surface: "brick" }, // dark brick
];

const GROUND_COL: RGB = [0.24, 0.24, 0.26];
const ASPHALT_COL: RGB = [0.09, 0.09, 0.1];
const SIDEWALK_COL: RGB = [0.55, 0.54, 0.52];
const CURB_COL: RGB = [0.66, 0.66, 0.68];
const ROADLINE_COL: RGB = [0.82, 0.78, 0.35];
const CROSSWALK_COL: RGB = [0.9, 0.9, 0.88];
const COURTYARD_COL: RGB = [0.24, 0.29, 0.22];

/** Accumulates placed meshes into merge-by-name material groups. */
class GroupBag {
  private order: string[] = [];
  private map = new Map<string, { meshes: Mesh[]; color?: RGB; surface?: NamedPart["surface"]; label?: string }>();

  add(name: string, mesh: Mesh, color?: RGB, surface?: NamedPart["surface"], label?: string): void {
    let g = this.map.get(name);
    if (!g) {
      g = { meshes: [] };
      if (color) g.color = color;
      if (surface) g.surface = surface;
      if (label) g.label = label;
      this.map.set(name, g);
      this.order.push(name);
    }
    g.meshes.push(mesh);
  }

  toParts(): NamedPart[] {
    const out: NamedPart[] = [];
    for (const name of this.order) {
      const g = this.map.get(name)!;
      const part: NamedPart = { name, mesh: merge(...g.meshes) };
      if (g.label) part.label = g.label;
      if (g.color) part.color = g.color;
      if (g.surface) part.surface = g.surface;
      out.push(part);
    }
    return out;
  }
}

/** Recolor a building's masonry groups to a district palette entry. */
function repaint(part: NamedPart, pal: FacadePalette): { color?: RGB; surface?: NamedPart["surface"] } {
  if (part.name === "walls") {
    return { color: pal.wall, surface: { type: pal.surface, params: { color: pal.wall } } };
  }
  if (part.name === "slabs" || part.name === "corner_pilasters" || part.name === "balcony_slabs") {
    return { color: pal.trim, surface: { type: pal.surface, params: { color: pal.trim } } };
  }
  const out: { color?: RGB; surface?: NamedPart["surface"] } = {};
  if (part.color) out.color = part.color as RGB;
  if (part.surface) out.surface = part.surface;
  return out;
}

/**
 * Build the full city district as named parts. A grid of blocks separated by
 * streets; each block has buildings arranged perimeter-style around its edge.
 */
export function buildCityDistrictParts(
  params: Partial<CityDistrictParams> = {},
): NamedPart[] {
  const p: CityDistrictParams = { ...CITY_DISTRICT_DEFAULTS, ...params };
  const bx = Math.max(1, Math.round(p.blocksX));
  const bz = Math.max(1, Math.round(p.blocksZ));
  const minF = Math.max(1, Math.round(p.minFloors));
  const maxF = Math.max(minF, Math.round(p.maxFloors));
  const rng = makeRng(Math.round(p.seed) >>> 0);

  const bag = new GroupBag();
  const towerBag = new GroupBag();

  // Cell pitch = block footprint + one street. The district is centred on origin.
  const pitchX = p.blockX + p.streetWidth;
  const pitchZ = p.blockZ + p.streetWidth;
  const originX = -((bx - 1) * pitchX) / 2;
  const originZ = -((bz - 1) * pitchZ) / 2;

  // Overall ground slab spanning all blocks + the outer street ring.
  const spanX = bx * pitchX + p.streetWidth;
  const spanZ = bz * pitchZ + p.streetWidth;
  bag.add(
    "ground",
    transform(box(spanX, 0.08, spanZ), { translate: vec3(0, -0.09, 0) }),
    GROUND_COL,
    { type: "concrete" },
  );

  // Street network: fill the whole ground with asphalt at the block gaps by
  // laying one asphalt slab per gap lane (both axes) + sidewalks framing blocks.
  buildStreetNetwork(bag, p, bx, bz, pitchX, pitchZ, originX, originZ, makeRng((p.seed ^ 0x9e3779b9) >>> 0));

  for (let iz = 0; iz < bz; iz++) {
    for (let ix = 0; ix < bx; ix++) {
      const cx = originX + ix * pitchX;
      const cz = originZ + iz * pitchZ;
      buildBlock(bag, towerBag, p, rng.fork(), cx, cz, minF, maxF);
    }
  }

  return [...bag.toParts(), ...towerBag.toParts()];
}

/**
 * One block: buildings lined up perimeter-style around the parcel edge, fronts
 * facing outward to the surrounding streets, leaving an inner courtyard. Each
 * side is filled with as many lots as fit; corners are handled by insetting the
 * side runs so buildings don't overlap at the corner.
 */
function buildBlock(
  bag: GroupBag,
  towerBag: GroupBag,
  p: CityDistrictParams,
  rng: Rng,
  cx: number,
  cz: number,
  minF: number,
  maxF: number,
): void {
  const halfX = p.blockX / 2;
  const halfZ = p.blockZ / 2;
  // Distance from block edge to a building's centre (footprint reaches inward).
  const insetZ = halfZ - p.lotDepth / 2;
  const insetX = halfX - p.lotDepth / 2;

  // Number of lots along each axis; leave the corners for the perpendicular run.
  const runX = Math.max(1, Math.floor((p.blockX - 2 * p.lotDepth) / p.lotWidth));
  const runZ = Math.max(1, Math.floor((p.blockZ - 2 * p.lotDepth) / p.lotWidth));

  const courtW = p.blockX - p.lotDepth * 2 - 0.8;
  const courtD = p.blockZ - p.lotDepth * 2 - 0.8;
  if (courtW > 1 && courtD > 1) {
    bag.add(
      "courtyards",
      transform(box(courtW, 0.04, courtD), { translate: vec3(cx, 0.02, cz) }),
      COURTYARD_COL,
      { type: "concrete", params: { color: COURTYARD_COL, roughness: 0.95 } },
      "内院绿地",
    );
  }

  // North (+Z) and South (-Z) edges: buildings span along X, front toward +/-Z.
  placeEdgeRun(bag, towerBag, p, rng, cx, cz, minF, maxF, "z", +1, runX, insetZ);
  placeEdgeRun(bag, towerBag, p, rng, cx, cz, minF, maxF, "z", -1, runX, insetZ);
  // East (+X) and West (-X) edges: buildings span along Z, front toward +/-X.
  placeEdgeRun(bag, towerBag, p, rng, cx, cz, minF, maxF, "x", +1, runZ, insetX);
  placeEdgeRun(bag, towerBag, p, rng, cx, cz, minF, maxF, "x", -1, runZ, insetX);
}

/**
 * Place a run of buildings along one edge of a block.
 * axis "z": run spans X, buildings sit at +/-Z edge, front faces +/-Z (side).
 * axis "x": run spans Z, buildings sit at +/-X edge, front faces +/-X (side).
 * `side` is +1 or -1 (which edge). `count` lots, spaced by lotWidth, centred.
 */
function placeEdgeRun(
  bag: GroupBag,
  towerBag: GroupBag,
  p: CityDistrictParams,
  rng: Rng,
  cx: number,
  cz: number,
  minF: number,
  maxF: number,
  axis: "x" | "z",
  side: 1 | -1,
  count: number,
  inset: number,
): void {
  const runLen = count * p.lotWidth;
  const start = -runLen / 2 + p.lotWidth / 2;
  for (let i = 0; i < count; i++) {
    const off = start + i * p.lotWidth;
    const lotRng = rng.fork();
    const floors = lotRng.int(minF, maxF);
    const roofPick = lotRng.int(0, 2);
    const roof: RoofType = roofPick === 0 ? "flat" : roofPick === 1 ? "hip" : "gable";
    const pal = PALETTES[lotRng.int(0, PALETTES.length - 1)]!;
    const alongJitter = count > 1 ? lotRng.range(-p.lotJitter, p.lotJitter) : 0;
    const yawJitter = lotRng.range(-p.lotJitter * 0.04, p.lotJitter * 0.04);

    let tx: number, tz: number, yaw: number;
    if (axis === "z") {
      tx = cx + off + alongJitter;
      tz = cz + side * inset;
      // front (+Z) should face outward: +Z edge yaw 0, -Z edge yaw PI
      yaw = side === 1 ? 0 : Math.PI;
    } else {
      tz = cz + off + alongJitter;
      tx = cx + side * inset;
      // front (+Z) faces +/-X: +X edge yaw +90, -X edge yaw -90
      yaw = side === 1 ? Math.PI / 2 : -Math.PI / 2;
    }
    placeBuilding(bag, towerBag, p, lotRng, floors, roof, pal, tx, tz, yaw + yawJitter);
  }
}

/** Instance one building, recolor to palette, place at (tx,tz) with yaw. */
function placeBuilding(
  bag: GroupBag,
  towerBag: GroupBag,
  p: CityDistrictParams,
  rng: Rng,
  floors: number,
  roof: RoofType,
  pal: FacadePalette,
  tx: number,
  tz: number,
  yaw: number,
): void {
  const heroOnlyParts = new Set([
    "ground_floor_base", "crown_band", "window_reveals", "entrance_recess",
    "entrance_frame", "entrance_threshold", "roof_coping", "roof_trim", "rooftop_service",
  ]);
  const buildingSeed = rng.int(0, 9999);
  const parts = buildBuildingParts({
    width: p.lotWidth * 0.94,
    depth: p.lotDepth * 0.94,
    floors,
    floorHeight: p.floorHeight,
    roof,
    balconyEvery: rng.next() < 0.3 ? rng.int(3, 5) : 0,
    seed: buildingSeed,
    ...p.base,
  });

  const place = (mesh: Mesh): Mesh =>
    yaw !== 0
      ? translateMesh(transform(mesh, { rotate: vec3(0, yaw, 0) }), vec3(tx, 0, tz))
      : translateMesh(mesh, vec3(tx, 0, tz));

  for (const part of parts) {
    if (heroOnlyParts.has(part.name)) continue;
    const { color, surface } = repaint(part, pal);
    bag.add(part.name, place(part.mesh), color, surface);
  }

  // Rooftop water tower on flat roofs, seeded chance.
  if (roof === "flat" && p.waterTowers > 0 && rng.next() < p.waterTowers) {
    const totalH = p.floorHeight * (p.base?.groundFloorScale ?? 1.35) + Math.max(0, floors - 1) * p.floorHeight;
    const tRadius = Math.min(p.lotWidth, p.lotDepth) * 0.16;
    const tRng = rng.fork();
    const towerParts = buildWaterTowerParts({
      radius: tRadius,
      tankHeight: tRadius * 2,
      legHeight: tRadius * 1.4,
      staves: 18,
      hoops: 4,
      ladder: true,
      seed: tRng.int(0, 9999),
    });
    const ox = (tRng.next() - 0.5) * p.lotWidth * 0.3;
    const oz = -p.lotDepth * 0.2 + (tRng.next() - 0.5) * p.lotDepth * 0.15;
    for (const part of towerParts) {
      const lifted = translateMesh(part.mesh, vec3(ox, totalH + 0.06, oz));
      towerBag.add(`tower_${part.name}`, place(lifted), part.color as RGB, part.surface);
    }
  }
}

/**
 * Street network: asphalt lanes running between blocks on both axes, sidewalks
 * framing each block edge, dashed centre lines down each lane, and optional
 * street trees along the sidewalks. Blocks sit in the grid cells; the streets
 * are the gaps of width `streetWidth` between/around them.
 */
function buildStreetNetwork(
  bag: GroupBag,
  p: CityDistrictParams,
  bx: number,
  bz: number,
  pitchX: number,
  pitchZ: number,
  originX: number,
  originZ: number,
  rng: Rng,
): void {
  const spanX = bx * pitchX + p.streetWidth;
  const spanZ = bz * pitchZ + p.streetWidth;
  const carriage = p.streetWidth * 0.7; // asphalt width; rest is sidewalk kerb
  const asphalt: Mesh[] = [];
  const sidewalks: Mesh[] = [];
  const curbs: Mesh[] = [];
  const lines: Mesh[] = [];
  const crosswalks: Mesh[] = [];
  const sidewalkHeight = 0.1;
  const sidewalkBaseY = 0.04;
  const sidewalkCenterY = sidewalkBaseY + sidewalkHeight / 2;
  const roadHalfWidth = carriage / 2;
  const junctionBranches = [
    { angleRadians: 0, halfWidth: roadHalfWidth },
    { angleRadians: Math.PI / 2, halfWidth: roadHalfWidth },
    { angleRadians: Math.PI, halfWidth: roadHalfWidth },
    { angleRadians: Math.PI * 1.5, halfWidth: roadHalfWidth },
  ];
  const junctionRadius = roadJunctionRadius(junctionBranches);

  // Each grid junction owns its centre and half of every connecting road arm.
  // Adjacent pieces meet at one edge, avoiding overlapping full-length boxes.
  for (let i = 0; i <= bx; i++) {
    const x = originX - pitchX / 2 + i * pitchX;
    addDashes(lines, "z", x, spanZ);
    for (let j = 0; j <= bz; j++) {
      const z = originZ - pitchZ / 2 + j * pitchZ;
      const eastReach = i < bx ? pitchX / 2 : p.streetWidth / 2;
      const westReach = i > 0 ? pitchX / 2 : p.streetWidth / 2;
      const northReach = j < bz ? pitchZ / 2 : p.streetWidth / 2;
      const southReach = j > 0 ? pitchZ / 2 : p.streetWidth / 2;
      asphalt.push(transform(joinedRoadJunctionMesh([
        { ...junctionBranches[0]!, length: Math.max(0.001, eastReach - junctionRadius) },
        { ...junctionBranches[1]!, length: Math.max(0.001, northReach - junctionRadius) },
        { ...junctionBranches[2]!, length: Math.max(0.001, westReach - junctionRadius) },
        { ...junctionBranches[3]!, length: Math.max(0.001, southReach - junctionRadius) },
      ], { radius: junctionRadius, top: 0.03, bottom: -0.03 }), { translate: vec3(x, 0, z) }));
    }
  }
  for (let j = 0; j <= bz; j++) {
    const z = originZ - pitchZ / 2 + j * pitchZ;
    addDashes(lines, "x", z, spanX);
  }

  // Sidewalks: a raised kerb ring around each block footprint.
  const swW = (p.streetWidth - carriage) / 2;
  for (let iz = 0; iz < bz; iz++) {
    for (let ix = 0; ix < bx; ix++) {
      const cx = originX + ix * pitchX;
      const cz = originZ + iz * pitchZ;
      const ow = p.blockX + swW * 2;
      const od = p.blockZ + swW * 2;
      // ring = outer slab minus inner (approx via 4 thin bars)
      sidewalks.push(transform(box(ow, sidewalkHeight, swW), { translate: vec3(cx, sidewalkCenterY, cz + p.blockZ / 2 + swW / 2) }));
      sidewalks.push(transform(box(ow, sidewalkHeight, swW), { translate: vec3(cx, sidewalkCenterY, cz - p.blockZ / 2 - swW / 2) }));
      sidewalks.push(transform(box(swW, sidewalkHeight, od - swW * 2), { translate: vec3(cx + p.blockX / 2 + swW / 2, sidewalkCenterY, cz) }));
      sidewalks.push(transform(box(swW, sidewalkHeight, od - swW * 2), { translate: vec3(cx - p.blockX / 2 - swW / 2, sidewalkCenterY, cz) }));

      const curbH = 0.18;
      const curbT = 0.16;
      const curbY = 0.03 + curbH / 2;
      const curbX = p.blockX / 2 + swW + curbT / 2;
      const curbZ = p.blockZ / 2 + swW + curbT / 2;
      curbs.push(transform(box(ow, curbH, curbT), { translate: vec3(cx, curbY, cz + curbZ) }));
      curbs.push(transform(box(ow, curbH, curbT), { translate: vec3(cx, curbY, cz - curbZ) }));
      curbs.push(transform(box(curbT, curbH, od), { translate: vec3(cx + curbX, curbY, cz) }));
      curbs.push(transform(box(curbT, curbH, od), { translate: vec3(cx - curbX, curbY, cz) }));

      if (p.streetTrees || p.streetFurniture) {
        addBlockPerimeterDressing(bag, p, rng.fork(), cx, cz, swW);
      }
    }
  }

  if (p.crosswalks) {
    for (let i = 0; i <= bx; i++) {
      const x = originX - pitchX / 2 + i * pitchX;
      for (let j = 0; j <= bz; j++) {
        const z = originZ - pitchZ / 2 + j * pitchZ;
        addIntersectionCrosswalks(crosswalks, x, z, carriage);
        if (p.streetFurniture && i > 0 && i < bx && j > 0 && j < bz && (i + j) % 2 === 0) {
          placeKitParts(
            bag,
            "traffic_signal",
            buildTrafficSignalParts({ mastHeight: 5.8, armReach: carriage * 0.85, heads: 2 }),
            x - carriage * 0.55,
            z - carriage * 0.55,
            0,
          );
        }
      }
    }
  }

  bag.add("street_asphalt", merge(...asphalt), ASPHALT_COL, { type: "concrete", params: { color: ASPHALT_COL, roughness: 0.92 } });
  bag.add("sidewalks", merge(...sidewalks), SIDEWALK_COL, { type: "concrete" });
  bag.add("curbs", merge(...curbs), CURB_COL, { type: "concrete", params: { color: CURB_COL, roughness: 0.75 } });
  bag.add("street_lines", merge(...lines), ROADLINE_COL, { type: "plastic", params: { color: ROADLINE_COL, roughness: 0.6 } });
  if (crosswalks.length) {
    bag.add("crosswalks", merge(...crosswalks), CROSSWALK_COL, { type: "plastic", params: { color: CROSSWALK_COL, roughness: 0.55 } });
  }
}

/** Dashed centre line along a lane. axis "z": line runs along Z at x=pos. */
function addDashes(out: Mesh[], axis: "x" | "z", pos: number, len: number): void {
  const nDash = Math.max(4, Math.floor(len / 3));
  const cell = len / nDash;
  const dashLen = cell * 0.5;
  for (let i = 0; i < nDash; i++) {
    const c = -len / 2 + cell * (i + 0.5);
    if (axis === "z") {
      out.push(transform(box(0.12, 0.02, dashLen), { translate: vec3(pos, 0.04, c) }));
    } else {
      out.push(transform(box(dashLen, 0.02, 0.12), { translate: vec3(c, 0.04, pos) }));
    }
  }
}

function addIntersectionCrosswalks(out: Mesh[], x: number, z: number, carriage: number): void {
  const offset = carriage * 0.56;
  addZebraAcrossX(out, x, z + offset, carriage);
  addZebraAcrossX(out, x, z - offset, carriage);
  addZebraAcrossZ(out, x + offset, z, carriage);
  addZebraAcrossZ(out, x - offset, z, carriage);
}

function addZebraAcrossX(out: Mesh[], x: number, z: number, span: number): void {
  const bars = Math.max(4, Math.floor(span / 0.75));
  const step = span / bars;
  for (let i = 0; i < bars; i++) {
    const bx = x - span / 2 + step * (i + 0.5);
    out.push(transform(box(step * 0.45, 0.025, 1.15), { translate: vec3(bx, 0.105, z) }));
  }
}

function addZebraAcrossZ(out: Mesh[], x: number, z: number, span: number): void {
  const bars = Math.max(4, Math.floor(span / 0.75));
  const step = span / bars;
  for (let i = 0; i < bars; i++) {
    const bz = z - span / 2 + step * (i + 0.5);
    out.push(transform(box(1.15, 0.025, step * 0.45), { translate: vec3(x, 0.105, bz) }));
  }
}

function addBlockPerimeterDressing(
  bag: GroupBag,
  p: CityDistrictParams,
  rng: Rng,
  cx: number,
  cz: number,
  sidewalkInset: number,
): void {
  const treeStep = Math.max(5, p.propSpacing);
  const zEdge = p.blockZ / 2 + sidewalkInset * 0.5;
  const xEdge = p.blockX / 2 + sidewalkInset * 0.5;
  const occupiedBySide = new Map<-1 | 1, DressingSlot[]>([
    [-1, []],
    [1, []],
  ]);

  if (p.streetTrees) {
    const countX = Math.max(2, Math.floor(p.blockX / treeStep) + 1);
    for (let i = 0; i < countX; i++) {
      const localX = -p.blockX / 2 + (p.blockX * i) / Math.max(1, countX - 1);
      placeTree(bag, cx + localX, cz + zEdge, rng.int(0, 999999));
      placeTree(bag, cx + localX, cz - zEdge, rng.int(0, 999999));
      occupiedBySide.get(-1)!.push({ x: localX, radius: 0.68 });
      occupiedBySide.get(1)!.push({ x: localX, radius: 0.68 });
    }

    const countZ = Math.max(2, Math.floor(p.blockZ / treeStep) + 1);
    for (let i = 1; i < countZ - 1; i++) {
      const z = cz - p.blockZ / 2 + (p.blockZ * i) / Math.max(1, countZ - 1);
      placeTree(bag, cx + xEdge, z, rng.int(0, 999999));
      placeTree(bag, cx - xEdge, z, rng.int(0, 999999));
    }
  }

  if (!p.streetFurniture) return;

  const lampStyle = rng.next() < 0.55 ? "ornamental" : "double";
  const lamp = buildStreetLampParts({ height: 5.8, style: lampStyle, armReach: 1.8 });
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      placeKitParts(bag, "street_lamp", lamp, cx + sx * xEdge, cz + sz * zEdge, 0);
    }
  }

  for (const side of [-1, 1] as const) {
    const occupied = occupiedBySide.get(side)!;
    if (rng.next() < 0.55) {
      const localX = reserveDressingSlot(rng, p.blockX * 0.25, 1.02, occupied);
      if (localX !== undefined) {
        placeKitParts(
          bag,
          "bench",
          buildParkBenchParts({ length: 1.9 }),
          cx + localX,
          cz + side * zEdge,
          side > 0 ? 0 : Math.PI,
        );
      }
    }
    if (rng.next() < 0.65) {
      const localX = reserveDressingSlot(rng, p.blockX * 0.32, 0.34, occupied);
      if (localX !== undefined) {
        placeKitParts(
          bag,
          "trashcan",
          buildTrashcanParts({ radius: 0.22, height: 0.7 }),
          cx + localX,
          cz + side * zEdge,
          0,
        );
      }
    }
  }
}

interface DressingSlot {
  x: number;
  radius: number;
}

function reserveDressingSlot(
  rng: Rng,
  halfRange: number,
  radius: number,
  occupied: DressingSlot[],
): number | undefined {
  for (let attempt = 0; attempt < 24; attempt++) {
    const x = rng.range(-halfRange, halfRange);
    if (occupied.every((slot) => Math.abs(slot.x - x) > slot.radius + radius + 0.12)) {
      occupied.push({ x, radius });
      return x;
    }
  }
  return undefined;
}

function placeTree(bag: GroupBag, x: number, z: number, seed: number): void {
  placeKitParts(
    bag,
    "street_tree",
    buildStreetTreeParts({
      trunkHeight: 1.8,
      canopyRadius: 1.15,
      clusters: 3,
      pit: true,
      seed,
    }),
    x,
    z,
    0,
  );
}

function placeKitParts(
  bag: GroupBag,
  prefix: string,
  parts: NamedPart[],
  x: number,
  z: number,
  yaw: number,
): void {
  for (const part of parts) {
    const placed = yaw !== 0
      ? transform(part.mesh, { rotate: vec3(0, yaw, 0), translate: vec3(x, 0, z) })
      : translateMesh(part.mesh, vec3(x, 0, z));
    bag.add(`${prefix}_${part.name}`, placed, part.color as RGB | undefined, part.surface, part.label);
  }
}
