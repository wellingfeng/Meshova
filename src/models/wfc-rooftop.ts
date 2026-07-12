/**
 * WFC rooftop — a procedurally-tiled building roof, Meshova's take on Epic's
 * CitySample WFC_Rooftop kit. A `cols x rows` grid is solved by the tiled
 * Wave-Function-Collapse solver (`geometry/wfc.ts`) using authored edge sockets,
 * then each solved cell stamps a small mesh: flat deck, parapet wall along the
 * building perimeter, outer corner posts, and — on random interior decks — a
 * scatter of rooftop machinery (HVAC boxes, vents, a stair hut). Deterministic:
 * same seed + same grid size -> same roof, so the screenshot loop stays stable.
 *
 * Socket design (two ids only, which is all a flat roof needs):
 *   "R" = roof-interior edge (a deck continues on this side)
 *   "O" = open/outside edge  (the building ends on this side -> needs a parapet)
 * The perimeter is fixed to force parapet tiles at the boundary; the interior is
 * left free so the solver fills it with deck (and the model layer decorates some
 * decks with equipment using a second seeded pass).
 */
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  box,
  cylinder,
  cone,
  transform,
  merge,
  solveWfc,
  wfcAt,
  type WfcTile,
  type WfcGrid,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";

type RGB = [number, number, number];
const CONCRETE: RGB = [0.6, 0.6, 0.62];
const PARAPET: RGB = [0.54, 0.54, 0.57];
const GALV: RGB = [0.7, 0.71, 0.72];
const STEEL: RGB = [0.56, 0.58, 0.6];
const STEEL_DK: RGB = [0.32, 0.33, 0.36];
const BRICK: RGB = [0.42, 0.24, 0.18];
const RUST_RED: RGB = [0.55, 0.24, 0.14];

const metal = (color: RGB, roughness = 0.5) => ({ type: "metal" as const, params: { color, roughness } });
const conc = (color: RGB, roughness = 0.9) => ({ type: "concrete" as const, params: { color, roughness } });

/**
 * The rooftop tileset. "deck" is the free interior; "wall" is a straight
 * parapet (rotatable to face any open edge); "corner" is an L parapet for the
 * two-open-edge case. Sockets: R = roof continues, O = building edge.
 */
export const ROOFTOP_TILES: WfcTile[] = [
  // Interior deck: roof on all four sides.
  { id: "deck", sockets: { px: "R", pz: "R", nx: "R", nz: "R" }, weight: 3 },
  // Straight parapet: open on +Z (parapet side), roof on the other three.
  { id: "wall", sockets: { px: "R", pz: "O", nx: "R", nz: "R" }, weight: 2, rotatable: true },
  // Outer corner: open on +Z and +X, roof on the inner two.
  { id: "corner", sockets: { px: "O", pz: "O", nx: "R", nz: "R" }, weight: 1, rotatable: true },
];

export interface WfcRooftopParams {
  /** Grid columns (building footprint along X). */
  cols: number;
  /** Grid rows (footprint along Z). */
  rows: number;
  /** Cell size in metres. */
  cell: number;
  /** Parapet wall height. */
  parapet: number;
  /** Fraction of interior decks that get rooftop equipment (0..1). */
  equipmentDensity: number;
  /** Seed for both the WFC solve and the equipment scatter. */
  seed: number;
}

export const WFC_ROOFTOP_DEFAULTS: WfcRooftopParams = {
  cols: 6,
  rows: 5,
  cell: 2.4,
  parapet: 0.9,
  equipmentDensity: 0.35,
  seed: 11,
};

/** One HVAC box + fan disc + a short duct, centred at (x,z) on the deck. */
function hvacUnit(x: number, z: number): Mesh {
  const uh = 0.9;
  return merge(
    transform(box(1.1, uh, 1.4), { translate: vec3(x, uh / 2, z) }),
    transform(cylinder(0.36, 0.1, 14), { translate: vec3(x, uh + 0.05, z) }),
    transform(cylinder(0.16, 1.2, 10), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(x + 0.75, 0.45, z) }),
  );
}

/** A cluster of thin exhaust pipes with cone caps. */
function ventCluster(x: number, z: number): Mesh {
  const parts: Mesh[] = [];
  for (const [dx, dz, h] of [[0, 0, 0.8], [0.25, 0.15, 0.6], [-0.2, 0.2, 0.7]] as Array<[number, number, number]>) {
    parts.push(transform(cylinder(0.1, h, 8), { translate: vec3(x + dx, h / 2, z + dz) }));
    parts.push(transform(cone(0.15, 0.18, 8), { translate: vec3(x + dx, h + 0.09, z + dz) }));
  }
  return merge(...parts);
}

/** Recompute a cell's rotated sockets from the tileset (to know open edges). */
function cellOpenEdges(grid: WfcGrid, c: number, r: number): { px: boolean; pz: boolean; nx: boolean; nz: boolean } {
  const cell = wfcAt(grid, c, r);
  const tile = ROOFTOP_TILES.find((t) => t.id === cell.tile)!;
  const DIRS = ["px", "pz", "nx", "nz"] as const;
  const rot = ((cell.rotation % 4) + 4) % 4;
  const rotated: Record<string, string> = {};
  for (let i = 0; i < DIRS.length; i++) {
    rotated[DIRS[i]!] = tile.sockets[DIRS[(i + rot) % 4]!];
  }
  return {
    px: rotated.px === "O",
    pz: rotated.pz === "O",
    nx: rotated.nx === "O",
    nz: rotated.nz === "O",
  };
}

/** WFC-tiled rooftop: solved deck grid + perimeter parapet + scattered equipment. */
export function buildWfcRooftopParts(params: Partial<WfcRooftopParams> = {}): NamedPart[] {
  const p: WfcRooftopParams = { ...WFC_ROOFTOP_DEFAULTS, ...params };
  const cols = Math.max(2, Math.round(p.cols));
  const rows = Math.max(2, Math.round(p.rows));
  const cs = p.cell;
  const parts: NamedPart[] = [];

  // Solve with a boundary socket: outward edges must be "O" (open -> parapet),
  // interior edges must be "R". This pins parapets to the true perimeter, so the
  // solver auto-derives wall/corner tiles at the border and deck in the middle.
  const grid = solveWfc({
    cols, rows, tiles: ROOFTOP_TILES, seed: p.seed,
    boundarySocket: "O",
  });

  // World position of a cell centre (roof centred on origin, deck top at y=0).
  const worldX = (c: number) => (c - (cols - 1) / 2) * cs;
  const worldZ = (r: number) => (r - (rows - 1) / 2) * cs;

  // Deck slabs (one merged mesh for the whole floor).
  const decks: Mesh[] = [];
  const walls: Mesh[] = [];
  const posts: Mesh[] = [];
  const ph = p.parapet;
  const pt = 0.18; // parapet thickness

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x = worldX(c), z = worldZ(r);
      decks.push(transform(box(cs, 0.3, cs), { translate: vec3(x, -0.15, z) }));
      const open = cellOpenEdges(grid, c, r);
      // Parapet segment on each open edge.
      if (open.px) walls.push(transform(box(pt, ph, cs), { translate: vec3(x + cs / 2 - pt / 2, ph / 2, z) }));
      if (open.nx) walls.push(transform(box(pt, ph, cs), { translate: vec3(x - cs / 2 + pt / 2, ph / 2, z) }));
      if (open.pz) walls.push(transform(box(cs, ph, pt), { translate: vec3(x, ph / 2, z + cs / 2 - pt / 2) }));
      if (open.nz) walls.push(transform(box(cs, ph, pt), { translate: vec3(x, ph / 2, z - cs / 2 + pt / 2) }));
      // Corner post where two edges are open.
      if ((open.px || open.nx) && (open.pz || open.nz)) {
        const px = open.px ? x + cs / 2 - pt / 2 : x - cs / 2 + pt / 2;
        const pz = open.pz ? z + cs / 2 - pt / 2 : z - cs / 2 + pt / 2;
        posts.push(transform(box(pt * 1.6, ph + 0.15, pt * 1.6), { translate: vec3(px, (ph + 0.15) / 2 - 0.05, pz) }));
      }
    }
  }
  parts.push({ name: "deck", label: "屋面", mesh: merge(...decks), color: CONCRETE, surface: conc(CONCRETE) });
  if (walls.length) parts.push({ name: "parapet", label: "女儿墙", mesh: merge(...walls), color: PARAPET, surface: conc(PARAPET) });
  if (posts.length) parts.push({ name: "posts", label: "角柱", mesh: merge(...posts), color: PARAPET, surface: conc([0.5, 0.5, 0.52]) });

  // Second seeded pass: scatter equipment on interior deck cells.
  const rng = makeRng((p.seed | 0) ^ 0x5bd1e995);
  const hvac: Mesh[] = [];
  const vents: Mesh[] = [];
  let hut: NamedPart | null = null;
  let hutPos: Vec3 | null = null;
  for (let c = 1; c < cols - 1; c++) {
    for (let r = 1; r < rows - 1; r++) {
      if (rng.next() > p.equipmentDensity) continue;
      const x = worldX(c), z = worldZ(r);
      const roll = rng.next();
      if (roll < 0.15 && !hut) {
        // One stair-access hut.
        hutPos = vec3(x, 0, z);
        hut = { name: "stair_hut", label: "楼梯间", mesh: merge(
          transform(box(cs * 0.8, 2.4, cs * 0.8), { translate: vec3(x, 1.2, z) }),
          transform(box(cs * 0.9, 0.2, cs * 0.9), { translate: vec3(x, 2.5, z) }),
        ), color: BRICK, surface: conc(BRICK, 0.85) };
      } else if (roll < 0.6) {
        hvac.push(hvacUnit(x, z));
      } else {
        vents.push(ventCluster(x, z));
      }
    }
  }
  if (hvac.length) parts.push({ name: "hvac", label: "空调机组", mesh: merge(...hvac), color: GALV, surface: metal(GALV, 0.55) });
  if (vents.length) parts.push({ name: "vents", label: "排气管", mesh: merge(...vents), color: STEEL_DK, surface: metal(STEEL_DK, 0.65) });
  if (hut) parts.push(hut);
  // A single roof-access door on the hut face (decorative accent).
  if (hut && hutPos) parts.push({ name: "hut_door", label: "屋顶门", mesh: transform(box(0.8, 1.7, 0.08), { translate: vec3(hutPos.x, 0.85, hutPos.z + cs * 0.42) }), color: RUST_RED, surface: metal(RUST_RED, 0.6) });

  return parts;
}
