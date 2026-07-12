/**
 * Traditional Roman neighbourhood generator.
 *
 * Pipeline: narrow street grid -> perimeter courtyard bars -> floor/facade
 * slots -> Roman modules -> roof grammar -> piazza/terrace dressing.
 * Geometry and variation are deterministic and authored from primitives.
 */
import { vec3 } from "../math/vec3.js";
import { makeRng, type Rng } from "../random/prng.js";
import {
  archway,
  box,
  bounds,
  cone,
  cylinder,
  merge,
  transform,
  triangleCount,
  type Mesh,
  type NamedPart,
  type PartSurfaceRef,
} from "../geometry/index.js";
import { buildRoofGeneratorMesh } from "./roof-generator.js";

type RGB = [number, number, number];

export interface RomanTownParams {
  blocksX: number;
  blocksZ: number;
  blockSize: number;
  streetWidth: number;
  barDepth: number;
  minFloors: number;
  maxFloors: number;
  floorHeight: number;
  shopDensity: number;
  shutterDensity: number;
  balconyDensity: number;
  roofTerraceDensity: number;
  piazza: boolean;
  seed: number;
}

export const ROMAN_TOWN_DEFAULTS: RomanTownParams = {
  blocksX: 3,
  blocksZ: 3,
  blockSize: 21,
  streetWidth: 4.2,
  barDepth: 5.2,
  minFloors: 4,
  maxFloors: 6,
  floorHeight: 1.18,
  shopDensity: 0.62,
  shutterDensity: 0.72,
  balconyDensity: 0.24,
  roofTerraceDensity: 0.42,
  piazza: true,
  seed: 1703,
};

const PLASTER_PALETTES: ReadonlyArray<{ name: string; wall: RGB; trim: RGB }> = [
  { name: "ochre", wall: [0.72, 0.46, 0.25], trim: [0.82, 0.72, 0.57] },
  { name: "umber", wall: [0.58, 0.35, 0.22], trim: [0.76, 0.67, 0.54] },
  { name: "rose", wall: [0.66, 0.39, 0.31], trim: [0.82, 0.69, 0.58] },
  { name: "cream", wall: [0.78, 0.67, 0.48], trim: [0.88, 0.8, 0.65] },
];

const GLASS: RGB = [0.10, 0.16, 0.17];
const SHUTTER: RGB = [0.17, 0.24, 0.18];
const IRON: RGB = [0.095, 0.09, 0.075];
const WOOD: RGB = [0.27, 0.14, 0.07];
const TERRACOTTA: RGB = [0.5, 0.19, 0.09];
const COBBLE: RGB = [0.2, 0.19, 0.17];
const PIAZZA_STONE: RGB = [0.48, 0.43, 0.36];
const PLANTER: RGB = [0.46, 0.18, 0.08];
const FOLIAGE: RGB = [0.13, 0.25, 0.09];

function surface(type: string, color: RGB, params: Record<string, unknown> = {}): PartSurfaceRef {
  return { type, params: { color, ...params } };
}

class PartBag {
  private readonly order: string[] = [];
  private readonly groups = new Map<string, {
    meshes: Mesh[];
    label: string;
    color: RGB;
    surface: PartSurfaceRef;
  }>();

  add(name: string, label: string, mesh: Mesh, color: RGB, surfaceRef: PartSurfaceRef): void {
    if (mesh.positions.length === 0) return;
    let group = this.groups.get(name);
    if (!group) {
      group = { meshes: [], label, color, surface: surfaceRef };
      this.groups.set(name, group);
      this.order.push(name);
    }
    group.meshes.push(mesh);
  }

  toParts(): NamedPart[] {
    return this.order.map((name) => {
      const group = this.groups.get(name)!;
      return {
        name,
        label: group.label,
        mesh: merge(...group.meshes),
        color: group.color,
        surface: group.surface,
        metadata: { style: "traditional Roman neighbourhood", semanticKey: name },
      };
    });
  }
}

interface BarSpec {
  cx: number;
  cz: number;
  yaw: number;
  length: number;
  depth: number;
  floors: number;
  palette: number;
  seed: number;
}

function resolveParams(params: Partial<RomanTownParams>): RomanTownParams {
  const minFloors = Math.max(2, Math.round(params.minFloors ?? ROMAN_TOWN_DEFAULTS.minFloors));
  const maxFloors = Math.max(minFloors, Math.round(params.maxFloors ?? ROMAN_TOWN_DEFAULTS.maxFloors));
  return {
    blocksX: Math.max(1, Math.round(params.blocksX ?? ROMAN_TOWN_DEFAULTS.blocksX)),
    blocksZ: Math.max(1, Math.round(params.blocksZ ?? ROMAN_TOWN_DEFAULTS.blocksZ)),
    blockSize: Math.max(12, params.blockSize ?? ROMAN_TOWN_DEFAULTS.blockSize),
    streetWidth: Math.max(2.4, params.streetWidth ?? ROMAN_TOWN_DEFAULTS.streetWidth),
    barDepth: Math.max(3.6, params.barDepth ?? ROMAN_TOWN_DEFAULTS.barDepth),
    minFloors,
    maxFloors,
    floorHeight: Math.max(0.9, params.floorHeight ?? ROMAN_TOWN_DEFAULTS.floorHeight),
    shopDensity: clamp01(params.shopDensity ?? ROMAN_TOWN_DEFAULTS.shopDensity),
    shutterDensity: clamp01(params.shutterDensity ?? ROMAN_TOWN_DEFAULTS.shutterDensity),
    balconyDensity: clamp01(params.balconyDensity ?? ROMAN_TOWN_DEFAULTS.balconyDensity),
    roofTerraceDensity: clamp01(params.roofTerraceDensity ?? ROMAN_TOWN_DEFAULTS.roofTerraceDensity),
    piazza: params.piazza ?? ROMAN_TOWN_DEFAULTS.piazza,
    seed: Math.round(params.seed ?? ROMAN_TOWN_DEFAULTS.seed) >>> 0,
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function place(mesh: Mesh, spec: BarSpec, y = 0): Mesh {
  return transform(mesh, {
    rotate: vec3(0, spec.yaw, 0),
    translate: vec3(spec.cx, y, spec.cz),
  });
}

/** Build semantic scene parts suitable for Viewer JSON, OBJ and AI iteration. */
export function buildRomanTownParts(params: Partial<RomanTownParams> = {}): NamedPart[] {
  const p = resolveParams(params);
  const rng = makeRng(p.seed);
  const bag = new PartBag();
  const totalX = p.blocksX * p.blockSize + (p.blocksX + 1) * p.streetWidth;
  const totalZ = p.blocksZ * p.blockSize + (p.blocksZ + 1) * p.streetWidth;

  bag.add(
    "town_ground",
    "城镇地基",
    transform(box(totalX + 2, 0.18, totalZ + 2), { translate: vec3(0, -0.11, 0) }),
    [0.28, 0.25, 0.2],
    surface("stone", [0.28, 0.25, 0.2], { roughness: 0.98, scale: 6 }),
  );
  addStreetGrid(bag, p, totalX, totalZ);

  const piazzaX = Math.floor(p.blocksX / 2);
  const piazzaZ = Math.floor(p.blocksZ / 2);
  for (let bz = 0; bz < p.blocksZ; bz++) {
    for (let bx = 0; bx < p.blocksX; bx++) {
      const cx = -totalX / 2 + p.streetWidth + p.blockSize / 2 + bx * (p.blockSize + p.streetWidth);
      const cz = -totalZ / 2 + p.streetWidth + p.blockSize / 2 + bz * (p.blockSize + p.streetWidth);
      const isPiazza = p.piazza && bx === piazzaX && bz === piazzaZ;
      if (isPiazza) {
        addPiazza(bag, cx, cz, p, rng.fork());
        continue;
      }
      addCourtyardBlock(bag, cx, cz, p, rng.fork());
    }
  }

  return bag.toParts();
}

function addStreetGrid(bag: PartBag, p: RomanTownParams, totalX: number, totalZ: number): void {
  const streets: Mesh[] = [];
  for (let i = 0; i <= p.blocksX; i++) {
    const x = -totalX / 2 + p.streetWidth / 2 + i * (p.blockSize + p.streetWidth);
    streets.push(transform(box(p.streetWidth, 0.08, totalZ), { translate: vec3(x, -0.01, 0) }));
  }
  for (let i = 0; i <= p.blocksZ; i++) {
    const z = -totalZ / 2 + p.streetWidth / 2 + i * (p.blockSize + p.streetWidth);
    streets.push(transform(box(totalX, 0.08, p.streetWidth), { translate: vec3(0, 0, z) }));
  }
  bag.add(
    "sampietrini_streets",
    "窄街玄武岩块石",
    merge(...streets),
    COBBLE,
    surface("romanCobblestone", COBBLE, { columns: 13, rows: 24, wetness: 0.08, seed: p.seed + 97 }),
  );
}

function addCourtyardBlock(bag: PartBag, cx: number, cz: number, p: RomanTownParams, rng: Rng): void {
  const inset = 0.35;
  const size = p.blockSize - inset * 2;
  const d = Math.min(p.barDepth, size * 0.34);
  const sideLength = Math.max(3.6, size - d * 2);
  const bars: BarSpec[] = [
    makeBar(cx, cz + size / 2 - d / 2, 0, size, d, p, rng),
    makeBar(cx, cz - size / 2 + d / 2, Math.PI, size, d, p, rng),
    makeBar(cx + size / 2 - d / 2, cz, Math.PI / 2, sideLength, d, p, rng),
    makeBar(cx - size / 2 + d / 2, cz, -Math.PI / 2, sideLength, d, p, rng),
  ];

  const courtyardSize = Math.max(2, size - d * 2);
  bag.add(
    "courtyard_paving",
    "围合内院铺地",
    transform(box(courtyardSize, 0.06, courtyardSize), { translate: vec3(cx, 0.015, cz) }),
    PIAZZA_STONE,
    surface("romanCobblestone", PIAZZA_STONE, { columns: 10, rows: 18, seed: rng.int(0, 9999) }),
  );
  for (const bar of bars) addBuildingBar(bag, bar, p);
}

function makeBar(
  cx: number,
  cz: number,
  yaw: number,
  length: number,
  depth: number,
  p: RomanTownParams,
  rng: Rng,
): BarSpec {
  return {
    cx,
    cz,
    yaw,
    length,
    depth,
    floors: rng.int(p.minFloors, p.maxFloors),
    palette: rng.int(0, PLASTER_PALETTES.length - 1),
    seed: rng.int(0, 0x7fffffff),
  };
}

function addBuildingBar(bag: PartBag, spec: BarSpec, p: RomanTownParams): void {
  const rng = makeRng(spec.seed);
  const pal = PLASTER_PALETTES[spec.palette]!;
  const height = spec.floors * p.floorHeight;
  const wallName = `weathered_plaster_${pal.name}`;
  const trimName = `roman_trim_${pal.name}`;
  const wallSurface = surface("weatheredPlaster", pal.wall, {
    wear: 0.42 + (spec.palette % 3) * 0.1,
    scale: 4.2,
    seed: spec.seed & 255,
  });

  bag.add(wallName, `风化灰泥立面·${paletteLabel(spec.palette)}`, place(box(spec.length, height, spec.depth), spec, height / 2), pal.wall, wallSurface);
  bag.add(
    "stone_plinths",
    "街墙石质基座",
    place(transform(box(spec.length + 0.08, 0.22, spec.depth + 0.08), { translate: vec3(0, 0.11, 0) }), spec),
    pal.trim,
    surface("stone", pal.trim, { scale: 7, roughness: 0.88 }),
  );

  const bayCount = Math.max(3, Math.round(spec.length / 2.05));
  const bayWidth = spec.length / bayCount;
  const frontZ = spec.depth / 2;
  for (let bay = 0; bay < bayCount; bay++) {
    const x = -spec.length / 2 + (bay + 0.5) * bayWidth;
    addGroundBay(bag, spec, p, rng, x, frontZ, bayWidth, pal.trim, bay);
    for (let floor = 1; floor < spec.floors; floor++) {
      addUpperWindow(bag, spec, p, rng, x, frontZ, bayWidth, pal.trim, floor, bay);
    }
  }

  const belts: Mesh[] = [];
  for (let floor = 1; floor < spec.floors; floor++) {
    belts.push(transform(box(spec.length + 0.08, 0.075, 0.12), {
      translate: vec3(0, floor * p.floorHeight, frontZ + 0.055),
    }));
  }
  belts.push(transform(box(spec.length + 0.26, 0.16, 0.28), {
    translate: vec3(0, height - 0.03, frontZ + 0.09),
  }));
  bag.add(trimName, `罗马窗楣与檐口·${paletteLabel(spec.palette)}`, place(merge(...belts), spec), pal.trim, surface("stone", pal.trim, { roughness: 0.84 }));

  addCornerQuoins(bag, spec, height, pal.trim);
  if (rng.next() < p.roofTerraceDensity) addRoofTerrace(bag, spec, height, rng);
  else addTiledRoof(bag, spec, height, rng);
}

function addGroundBay(
  bag: PartBag,
  spec: BarSpec,
  p: RomanTownParams,
  rng: Rng,
  x: number,
  frontZ: number,
  bayWidth: number,
  trim: RGB,
  bay: number,
): void {
  const isShop = rng.next() < p.shopDensity;
  if (isShop) {
    const span = Math.min(bayWidth * 0.55, p.floorHeight * 0.72);
    const pierHeight = p.floorHeight * 0.38;
    const arch = archway({
      span,
      pierHeight,
      pierWidth: Math.max(0.11, bayWidth * 0.09),
      depth: 0.14,
      ringThickness: 0.12,
      archStyle: "round",
      keystone: (bay & 1) === 0,
      segments: 12,
    });
    bag.add(
      "arched_shopfront_frames",
      "底层圆拱店面",
      place(transform(arch, { translate: vec3(x, 0.06, frontZ + 0.09) }), spec),
      trim,
      surface("stone", trim, { roughness: 0.82 }),
    );
    const doorH = pierHeight + span * 0.48;
    bag.add(
      "shopfront_glazing",
      "底商橱窗与门",
      place(transform(box(span * 0.86, doorH, 0.035), { translate: vec3(x, 0.06 + doorH / 2, frontZ + 0.055) }), spec),
      GLASS,
      { type: "glass", params: { tint: GLASS, roughness: 0.18 } },
    );
    if (rng.next() < 0.55) {
      const awning = transform(box(bayWidth * 0.72, 0.07, 0.52), {
        rotate: vec3(-0.18, 0, 0),
        translate: vec3(x, p.floorHeight * 0.82, frontZ + 0.34),
      });
      const awningColor: RGB = (bay & 1) === 0 ? [0.48, 0.12, 0.08] : [0.18, 0.28, 0.18];
      bag.add("shop_awnings", "沿街店铺遮阳篷", place(awning, spec), awningColor, surface("fabric", awningColor, { roughness: 0.78 }));
    }
  } else {
    const doorW = Math.min(0.68, bayWidth * 0.5);
    const doorH = p.floorHeight * 0.74;
    bag.add(
      "ground_doors",
      "底层木门",
      place(transform(box(doorW, doorH, 0.08), { translate: vec3(x, doorH / 2 + 0.04, frontZ + 0.07) }), spec),
      WOOD,
      surface("wood", WOOD, { roughness: 0.74, seed: spec.seed + bay }),
    );
  }
}

function addUpperWindow(
  bag: PartBag,
  spec: BarSpec,
  p: RomanTownParams,
  rng: Rng,
  x: number,
  frontZ: number,
  bayWidth: number,
  trim: RGB,
  floor: number,
  bay: number,
): void {
  const w = Math.min(0.72, bayWidth * 0.46);
  const h = p.floorHeight * 0.57;
  const y = floor * p.floorHeight + p.floorHeight * 0.51;
  const z = frontZ + 0.055;
  bag.add(
    "upper_window_glass",
    "上层深窗洞",
    place(transform(box(w, h, 0.035), { translate: vec3(x, y, z) }), spec),
    GLASS,
    { type: "glass", params: { tint: GLASS, roughness: 0.12 } },
  );

  const fw = 0.055;
  const frames = merge(
    transform(box(w + fw * 2, fw, 0.075), { translate: vec3(x, y + h / 2, z + 0.025) }),
    transform(box(w + fw * 2, fw, 0.075), { translate: vec3(x, y - h / 2, z + 0.025) }),
    transform(box(fw, h, 0.075), { translate: vec3(x - w / 2, y, z + 0.025) }),
    transform(box(fw, h, 0.075), { translate: vec3(x + w / 2, y, z + 0.025) }),
  );
  bag.add("window_frames", "木质窗框", place(frames, spec), WOOD, surface("wood", WOOD, { roughness: 0.68 }));

  const sill = transform(box(w + 0.22, 0.07, 0.18), { translate: vec3(x, y - h / 2 - 0.06, z + 0.08) });
  const lintel = transform(box(w + 0.25, 0.09, 0.15), { translate: vec3(x, y + h / 2 + 0.07, z + 0.07) });
  const classical = ((floor + bay + spec.palette) % 3) === 0;
  const trimMeshes = [sill, lintel];
  if (classical) {
    trimMeshes.push(
      transform(box(w * 0.62, 0.075, 0.13), { rotate: vec3(0, 0, 0.22), translate: vec3(x - w * 0.25, y + h / 2 + 0.17, z + 0.075) }),
      transform(box(w * 0.62, 0.075, 0.13), { rotate: vec3(0, 0, -0.22), translate: vec3(x + w * 0.25, y + h / 2 + 0.17, z + 0.075) }),
    );
  }
  bag.add("roman_window_surrounds", "罗马窗楣与三角山花", place(merge(...trimMeshes), spec), trim, surface("stone", trim, { roughness: 0.8 }));

  if (rng.next() < p.shutterDensity) {
    const shutterW = w * 0.31;
    const shutters = merge(
      transform(box(shutterW, h * 0.96, 0.055), { translate: vec3(x - w * 0.69, y, z + 0.06) }),
      transform(box(shutterW, h * 0.96, 0.055), { translate: vec3(x + w * 0.69, y, z + 0.06) }),
    );
    bag.add("green_shutters", "百叶木窗扇", place(shutters, spec), SHUTTER, surface("wood", SHUTTER, { roughness: 0.76 }));
  }

  if (rng.next() < p.balconyDensity) {
    const slab = transform(box(w + 0.5, 0.08, 0.48), { translate: vec3(x, y - h / 2 - 0.12, frontZ + 0.27) });
    bag.add("balcony_slabs", "法式阳台石板", place(slab, spec), trim, surface("stone", trim, { roughness: 0.84 }));
    const rails: Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const rx = x - (w + 0.38) / 2 + i * (w + 0.38) / 5;
      rails.push(transform(box(0.025, 0.34, 0.025), { translate: vec3(rx, y - h / 2 + 0.08, frontZ + 0.49) }));
    }
    rails.push(transform(box(w + 0.44, 0.035, 0.035), { translate: vec3(x, y - h / 2 + 0.26, frontZ + 0.49) }));
    bag.add("wrought_iron_balconies", "锻铁阳台栏杆", place(merge(...rails), spec), IRON, surface("metal", IRON, { roughness: 0.58 }));
  }
}

function addCornerQuoins(bag: PartBag, spec: BarSpec, height: number, trim: RGB): void {
  const stones: Mesh[] = [];
  const count = Math.max(4, Math.floor(height / 0.36));
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < count; i++) {
      stones.push(transform(box(0.23, 0.22, 0.16), {
        translate: vec3(side * (spec.length / 2 - 0.08), 0.18 + i * 0.36, spec.depth / 2 + 0.06),
      }));
    }
  }
  bag.add("corner_quoins", "街角交错石饰", place(merge(...stones), spec), trim, surface("stone", trim, { roughness: 0.88 }));
}

function addTiledRoof(bag: PartBag, spec: BarSpec, height: number, rng: Rng): void {
  const roofHeight = 0.62 + rng.range(0, 0.28);
  const roof = buildRoofGeneratorMesh({
    style: "hip",
    width: spec.length,
    depth: spec.depth,
    wallHeight: 0.02,
    roofHeight,
    overhang: 0.24,
    dormers: 0,
    chimney: false,
    rafters: false,
    seed: spec.seed,
  });
  bag.add(
    "terracotta_hip_roofs",
    "错缝陶瓦四坡屋顶",
    place(roof, spec, height - 0.02),
    TERRACOTTA,
    surface("terracottaRoof", TERRACOTTA, { columns: 12, rows: 22, weathering: 0.42, seed: spec.seed & 255 }),
  );
  const chimney = transform(box(0.32, 0.72, 0.32), {
    translate: vec3(spec.length * rng.range(-0.25, 0.25), height + 0.46, spec.depth * rng.range(-0.18, 0.18)),
  });
  bag.add("roof_chimneys", "陶瓦屋顶烟囱", place(chimney, spec), [0.4, 0.17, 0.1], surface("brick", [0.4, 0.17, 0.1], { seed: spec.seed }));
}

function addRoofTerrace(bag: PartBag, spec: BarSpec, height: number, rng: Rng): void {
  const slab = transform(box(spec.length + 0.12, 0.12, spec.depth + 0.12), { translate: vec3(0, height + 0.06, 0) });
  bag.add("roof_terrace_decks", "屋顶露台地坪", place(slab, spec), PIAZZA_STONE, surface("romanCobblestone", PIAZZA_STONE, { columns: 10, rows: 18, seed: spec.seed }));
  const parapetH = 0.34;
  const parapets = merge(
    transform(box(spec.length + 0.12, parapetH, 0.14), { translate: vec3(0, height + parapetH / 2, -spec.depth / 2) }),
    transform(box(spec.length + 0.12, parapetH, 0.14), { translate: vec3(0, height + parapetH / 2, spec.depth / 2) }),
    transform(box(0.14, parapetH, spec.depth), { translate: vec3(-spec.length / 2, height + parapetH / 2, 0) }),
    transform(box(0.14, parapetH, spec.depth), { translate: vec3(spec.length / 2, height + parapetH / 2, 0) }),
  );
  bag.add("roof_terrace_parapets", "屋顶露台女儿墙", place(parapets, spec), [0.72, 0.61, 0.45], surface("weatheredPlaster", [0.72, 0.61, 0.45], { wear: 0.38, seed: spec.seed }));

  const pergolaX = spec.length * rng.range(-0.2, 0.2);
  const ph = 1.05;
  const pergola = merge(
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => transform(box(0.08, ph, 0.08), {
      translate: vec3(pergolaX + sx * 0.75, height + ph / 2, sz * 0.72),
    }))),
    transform(box(1.65, 0.08, 0.1), { translate: vec3(pergolaX, height + ph, -0.72) }),
    transform(box(1.65, 0.08, 0.1), { translate: vec3(pergolaX, height + ph, 0.72) }),
  );
  bag.add("roof_pergolas", "屋顶露台木棚架", place(pergola, spec), WOOD, surface("wood", WOOD, { roughness: 0.75 }));

  const pots: Mesh[] = [];
  const plants: Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const x = spec.length * rng.range(-0.38, 0.38);
    const z = spec.depth * rng.range(-0.3, 0.3);
    pots.push(transform(cylinder(0.13, 0.22, 10), { translate: vec3(x, height + 0.23, z) }));
    plants.push(transform(cone(0.24, 0.55, 10), { translate: vec3(x, height + 0.58, z) }));
  }
  bag.add("terrace_planters", "屋顶露台陶盆", place(merge(...pots), spec), PLANTER, surface("terracottaRoof", PLANTER, { columns: 6, rows: 8, seed: spec.seed }));
  bag.add("terrace_plants", "屋顶露台绿植", place(merge(...plants), spec), FOLIAGE, surface("foliage", FOLIAGE, { roughness: 0.82 }));
}

function addPiazza(bag: PartBag, cx: number, cz: number, p: RomanTownParams, rng: Rng): void {
  const size = p.blockSize - 0.7;
  bag.add(
    "central_piazza",
    "中心广场石铺地",
    transform(box(size, 0.09, size), { translate: vec3(cx, 0.025, cz) }),
    PIAZZA_STONE,
    surface("romanCobblestone", PIAZZA_STONE, { columns: 14, rows: 28, wetness: 0.02, seed: p.seed + 211 }),
  );
  const fountainStone: RGB = [0.58, 0.55, 0.49];
  const fountain = merge(
    transform(cylinder(1.25, 0.24, 28), { translate: vec3(cx, 0.16, cz) }),
    transform(cylinder(0.3, 1.1, 20), { translate: vec3(cx, 0.76, cz) }),
    transform(cylinder(0.72, 0.16, 24), { translate: vec3(cx, 1.24, cz) }),
  );
  bag.add("piazza_fountain", "中心广场石喷泉", fountain, fountainStone, surface("stone", fountainStone, { scale: 8, roughness: 0.7 }));

  const tables: Mesh[] = [];
  const canopies: Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + rng.range(-0.08, 0.08);
    const radius = size * 0.31;
    const x = cx + Math.cos(angle) * radius;
    const z = cz + Math.sin(angle) * radius;
    tables.push(
      transform(cylinder(0.35, 0.06, 16), { translate: vec3(x, 0.62, z) }),
      transform(cylinder(0.04, 1.55, 10), { translate: vec3(x, 0.8, z) }),
    );
    canopies.push(transform(cone(0.88, 0.32, 16), { rotate: vec3(Math.PI, 0, 0), translate: vec3(x, 1.66, z) }));
  }
  bag.add("piazza_cafe_tables", "广场咖啡桌", merge(...tables), WOOD, surface("wood", WOOD, { roughness: 0.68 }));
  bag.add("piazza_cafe_canopies", "广场咖啡遮阳伞", merge(...canopies), [0.65, 0.25, 0.12], surface("fabric", [0.65, 0.25, 0.12], { roughness: 0.82 }));

  const cypress: Mesh[] = [];
  const trunks: Mesh[] = [];
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const x = cx + dx * size * 0.41;
    const z = cz + dz * size * 0.41;
    trunks.push(transform(cylinder(0.1, 1.5, 10), { translate: vec3(x, 0.75, z) }));
    cypress.push(transform(cone(0.55, 3.3, 14), { translate: vec3(x, 2.35, z) }));
  }
  bag.add("piazza_cypress_trunks", "广场柏树树干", merge(...trunks), WOOD, surface("wood", WOOD, { roughness: 0.9 }));
  bag.add("piazza_cypress", "广场意大利柏树", merge(...cypress), FOLIAGE, surface("foliage", FOLIAGE, { roughness: 0.86 }));
}

function paletteLabel(index: number): string {
  return ["赭黄", "棕褐", "旧玫瑰", "暖米白"][index] ?? "暖灰泥";
}

export function summarizeRomanTown(parts: NamedPart[]): {
  parts: number;
  triangles: number;
  width: number;
  height: number;
  depth: number;
} {
  const merged = merge(...parts.map((part) => part.mesh));
  const b = bounds(merged);
  return {
    parts: parts.length,
    triangles: parts.reduce((sum, part) => sum + triangleCount(part.mesh), 0),
    width: b.max.x - b.min.x,
    height: b.max.y - b.min.y,
    depth: b.max.z - b.min.z,
  };
}

