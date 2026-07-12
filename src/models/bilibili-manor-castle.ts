import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  box,
  cylinder,
  icosphere,
  merge,
  scaleMesh,
  styleLowPolyMesh,
  transform,
  type LowPolyColor,
  type Mesh,
  type NamedPart,
  type PartSurfaceRef,
} from "../geometry/index.js";
import { buildRoofGeneratorMesh } from "./roof-generator.js";

export interface BilibiliManorCastleParams {
  seed: number;
  scale: number;
  wallHeight: number;
  watchtowerHeight: number;
  gardenDensity: number;
  detail: number;
  colorVariation: number;
}

export const BILIBILI_MANOR_CASTLE_DEFAULTS: BilibiliManorCastleParams = {
  seed: 361646685,
  scale: 1,
  wallHeight: 2.1,
  watchtowerHeight: 7.8,
  gardenDensity: 1,
  detail: 1,
  colorVariation: 0.09,
};

const SOURCE_URL = "https://www.bilibili.com/video/BV1XhZvBwEAF?p=1";
const MEADOW: LowPolyColor = [0.4, 0.5, 0.24];
const ISLAND_GRASS: LowPolyColor = [0.35, 0.45, 0.22];
const WATER: LowPolyColor = [0.18, 0.45, 0.5];
const STONE: LowPolyColor = [0.3, 0.29, 0.26];
const STONE_LIGHT: LowPolyColor = [0.4, 0.38, 0.33];
const PLASTER: LowPolyColor = [0.52, 0.45, 0.34];
const TIMBER: LowPolyColor = [0.13, 0.07, 0.035];
const ROOF: LowPolyColor = [0.055, 0.05, 0.045];
const SHED_ROOF: LowPolyColor = [0.19, 0.09, 0.035];
const SOIL: LowPolyColor = [0.31, 0.22, 0.13];
const PATH: LowPolyColor = [0.56, 0.46, 0.32];
const CROPS: LowPolyColor = [0.25, 0.48, 0.18];
const FOLIAGE: LowPolyColor = [0.22, 0.38, 0.16];
const DARK: LowPolyColor = [0.09, 0.08, 0.07];

interface Bucket {
  label: string;
  color: LowPolyColor;
  surface: PartSurfaceRef;
  meshes: Mesh[];
  faceted: boolean;
}

class PartBag {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly seed: number,
    private readonly variation: number,
  ) {}

  add(
    name: string,
    label: string,
    mesh: Mesh,
    color: LowPolyColor,
    material: string,
    roughness: number,
    faceted = true,
  ): void {
    let bucket = this.buckets.get(name);
    if (!bucket) {
      const surface = material === "stone"
        ? { type: "romanCobblestone", params: { color, columns: 10, rows: 7, wetness: 0.02, seed: this.seed } }
        : { type: material, params: { color, roughness, seed: this.seed } };
      bucket = {
        label,
        color,
        surface,
        meshes: [],
        faceted,
      };
      this.buckets.set(name, bucket);
    }
    bucket.meshes.push(mesh);
  }

  finish(scale: number): NamedPart[] {
    let index = 0;
    return [...this.buckets.entries()].map(([name, bucket]) => {
      const merged = bucket.meshes.length === 1 ? bucket.meshes[0]! : merge(...bucket.meshes);
      const styled = bucket.faceted
        ? styleLowPolyMesh(merged, bucket.color, {
            seed: this.seed + index * 977,
            colorVariation: this.variation,
          })
        : { mesh: merged, colors: undefined };
      index++;
      return {
        name,
        label: bucket.label,
        mesh: scale === 1 ? styled.mesh : scaleMesh(styled.mesh, vec3(scale, scale, scale)),
        color: bucket.color,
        ...(styled.colors ? { colors: styled.colors } : {}),
        surface: bucket.surface,
        metadata: {
          sourceStudy: SOURCE_URL,
          sourcePart: "1.小庄园式城堡",
          recipe: "水围方堡 + 圆角塔 + 石木礼堂 + 高瞭望塔 + 庭院生产空间",
        },
      };
    });
  }
}

function placedBox(width: number, height: number, depth: number, x: number, y: number, z: number, yaw = 0): Mesh {
  return transform(box(width, height, depth), {
    rotate: vec3(0, yaw, 0),
    translate: vec3(x, y, z),
  });
}

function placedCylinder(radius: number, height: number, segments: number, x: number, y: number, z: number): Mesh {
  return transform(cylinder(radius, height, segments), { translate: vec3(x, y, z) });
}

function beamBetween(a: Vec3, b: Vec3, thickness: number): Mesh {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const horizontal = Math.hypot(dx, dz);
  const length = Math.hypot(horizontal, dy);
  return transform(box(length, thickness, thickness), {
    rotate: vec3(0, -Math.atan2(dz, dx), Math.atan2(dy, horizontal)),
    translate: vec3((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (a.z + b.z) * 0.5),
  });
}

function addMerlonLine(
  bag: PartBag,
  a: readonly [number, number],
  b: readonly [number, number],
  topY: number,
  detail: number,
): void {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  const count = Math.max(3, Math.round(length * detail / 1.25));
  const yaw = -Math.atan2(dz, dx);
  for (let index = 0; index <= count; index += 2) {
    const t = index / count;
    bag.add(
      "battlements",
      "城墙垛口",
      placedBox(0.62, 0.58, 0.54, a[0] + dx * t, topY + 0.29, a[1] + dz * t, yaw),
      STONE_LIGHT,
      "stone",
      0.95,
    );
  }
}

function addRoundTower(
  bag: PartBag,
  x: number,
  z: number,
  radius: number,
  height: number,
  baseY: number,
  detail: number,
): void {
  const segments = Math.max(12, Math.round(16 * detail));
  bag.add(
    "corner_towers",
    "城角圆塔",
    placedCylinder(radius, height, segments, x, baseY + height * 0.5, z),
    STONE,
    "stone",
    0.95,
  );
  bag.add(
    "tower_crowns",
    "圆塔顶台",
    placedCylinder(radius * 1.08, 0.22, segments, x, baseY + height + 0.11, z),
    STONE_LIGHT,
    "stone",
    0.93,
  );
  const count = Math.max(6, Math.round(9 * detail));
  for (let index = 0; index < count; index++) {
    const angle = index / count * Math.PI * 2;
    bag.add(
      "battlements",
      "城墙垛口",
      placedBox(
        0.44,
        0.58,
        0.42,
        x + Math.cos(angle) * radius * 0.88,
        baseY + height + 0.4,
        z + Math.sin(angle) * radius * 0.88,
        -angle,
      ),
      STONE_LIGHT,
      "stone",
      0.95,
    );
  }
}

function addWatchtower(
  bag: PartBag,
  x: number,
  z: number,
  radius: number,
  height: number,
  baseY: number,
  detail: number,
): void {
  const segments = Math.max(16, Math.round(22 * detail));
  bag.add(
    "watchtower",
    "高圆瞭望塔",
    placedCylinder(radius, height, segments, x, baseY + height * 0.5, z),
    STONE,
    "stone",
    0.94,
  );
  bag.add(
    "watchtower_deck",
    "瞭望木平台",
    placedCylinder(radius * 1.15, 0.28, segments, x, baseY + height + 0.14, z),
    TIMBER,
    "wood",
    0.84,
  );
  const railCount = Math.max(10, Math.round(14 * detail));
  const railRadius = radius * 1.08;
  for (let index = 0; index < railCount; index++) {
    const angle = index / railCount * Math.PI * 2;
    const nextAngle = (index + 1) / railCount * Math.PI * 2;
    const current = vec3(x + Math.cos(angle) * railRadius, baseY + height + 0.78, z + Math.sin(angle) * railRadius);
    const next = vec3(x + Math.cos(nextAngle) * railRadius, baseY + height + 0.78, z + Math.sin(nextAngle) * railRadius);
    bag.add("watchtower_rail", "瞭望台木栏", placedCylinder(0.055, 1.2, 7, current.x, baseY + height + 0.72, current.z), TIMBER, "wood", 0.84);
    bag.add("watchtower_rail", "瞭望台木栏", beamBetween(current, next, 0.1), TIMBER, "wood", 0.84);
  }
  for (const angle of [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5]) {
    bag.add(
      "arrow_slits",
      "塔身箭孔",
      placedBox(
        0.13,
        0.62,
        0.06,
        x + Math.cos(angle) * (radius + 0.018),
        baseY + height * 0.58,
        z + Math.sin(angle) * (radius + 0.018),
        -angle,
      ),
      DARK,
      "stone",
      0.9,
      false,
    );
  }
}

function addHall(bag: PartBag, baseY: number, heightScale: number): void {
  const x = 2;
  const z = -0.9;
  const width = 7.2;
  const depth = 3.45;
  const stoneHeight = 1.35 * heightScale;
  const upperHeight = 2.45 * heightScale;
  const eaveY = baseY + stoneHeight + upperHeight;
  bag.add("manor_stone_base", "礼堂石砌下层", placedBox(width, stoneHeight, depth, x, baseY + stoneHeight * 0.5, z), STONE_LIGHT, "stone", 0.93);
  bag.add("manor_plaster", "礼堂灰泥上层", placedBox(width, upperHeight, depth, x, baseY + stoneHeight + upperHeight * 0.5, z), PLASTER, "stylizedPlaster", 0.86);
  bag.add(
    "manor_roof",
    "礼堂深灰坡屋顶",
    transform(buildRoofGeneratorMesh({
      style: "gable",
      width,
      depth,
      wallHeight: eaveY,
      roofHeight: 1.35 * heightScale,
      overhang: 0.32,
      dormers: 0,
      chimney: false,
      rafters: false,
    }), { translate: vec3(x, 0, z) }),
    ROOF,
    "stylizedRoof",
    0.88,
  );

  const frontZ = z + depth * 0.5 + 0.035;
  const beam = 0.16;
  for (const timberX of [-1.6, 0.2, 2, 3.8, 5.6]) {
    bag.add("half_timber_frame", "礼堂深色木构", placedBox(beam, upperHeight + 0.12, beam, timberX, baseY + stoneHeight + upperHeight * 0.5, frontZ), TIMBER, "wood", 0.84);
  }
  for (const timberY of [baseY + stoneHeight, baseY + stoneHeight + upperHeight * 0.52, eaveY]) {
    bag.add("half_timber_frame", "礼堂深色木构", placedBox(width + 0.08, beam, beam, x, timberY, frontZ), TIMBER, "wood", 0.84);
  }
  for (const centerX of [-0.7, 2.9, 4.7]) {
    bag.add(
      "half_timber_frame",
      "礼堂深色木构",
      beamBetween(
        vec3(centerX - 0.72, baseY + stoneHeight + 0.08, frontZ + 0.01),
        vec3(centerX + 0.72, baseY + stoneHeight + upperHeight * 0.5 - 0.08, frontZ + 0.01),
        beam * 0.72,
      ),
      TIMBER,
      "wood",
      0.84,
    );
  }
  for (const windowX of [-0.7, 1.1, 2.9, 4.7]) {
    bag.add("manor_windows", "礼堂木框窗", placedBox(0.72, 1.05, 0.07, windowX, baseY + stoneHeight + upperHeight * 0.66, frontZ + 0.09), DARK, "glass", 0.25, false);
    bag.add("window_trim", "窗框木饰", placedBox(0.86, 0.09, 0.1, windowX, baseY + stoneHeight + upperHeight * 0.66, frontZ + 0.14), TIMBER, "wood", 0.84);
    bag.add("window_trim", "窗框木饰", placedBox(0.09, 1.16, 0.1, windowX, baseY + stoneHeight + upperHeight * 0.66, frontZ + 0.14), TIMBER, "wood", 0.84);
  }
  for (const doorX of [0.15, 3.85]) {
    bag.add("manor_doors", "礼堂木门", placedBox(0.72, 1.18, 0.08, doorX, baseY + 0.59, frontZ + 0.08), TIMBER, "wood", 0.87, false);
  }
}

function addChapel(bag: PartBag, baseY: number, heightScale: number): void {
  const x = -2.6;
  const z = 1.05;
  const width = 2.25;
  const depth = 3.1;
  const wallHeight = 3.2 * heightScale;
  bag.add("chapel", "石砌小礼拜堂", placedBox(width, wallHeight, depth, x, baseY + wallHeight * 0.5, z), STONE_LIGHT, "stone", 0.94);
  bag.add(
    "chapel_roof",
    "礼拜堂坡屋顶",
    transform(buildRoofGeneratorMesh({
      style: "gable",
      width: depth,
      depth: width,
      wallHeight: baseY + wallHeight,
      roofHeight: 1.12 * heightScale,
      overhang: 0.24,
      dormers: 0,
      chimney: false,
      rafters: false,
    }), { rotate: vec3(0, Math.PI * 0.5, 0), translate: vec3(x, 0, z) }),
    ROOF,
    "stylizedRoof",
    0.88,
  );
  const frontZ = z + depth * 0.5 + 0.045;
  bag.add("chapel_door", "礼拜堂拱门", placedBox(0.72, 1.45, 0.08, x, baseY + 0.73, frontZ), TIMBER, "wood", 0.87, false);
  bag.add(
    "chapel_door",
    "礼拜堂拱门",
    transform(cylinder(0.36, 0.08, 16), { rotate: vec3(Math.PI * 0.5, 0, 0), translate: vec3(x, baseY + 1.45, frontZ) }),
    TIMBER,
    "wood",
    0.87,
    false,
  );

  const steepleBase = baseY + wallHeight + 0.48;
  bag.add("bell_tower", "礼拜堂钟楼", placedBox(0.92, 2.25 * heightScale, 0.92, x, steepleBase + 1.1 * heightScale, z - 0.55), STONE_LIGHT, "stone", 0.93);
  for (const side of [-1, 1]) {
    bag.add("bell_openings", "钟楼开口", placedBox(0.28, 0.64, 0.06, x + side * 0.465, steepleBase + 1.35 * heightScale, z - 0.55, Math.PI * 0.5), DARK, "stone", 0.92, false);
    bag.add("bell_openings", "钟楼开口", placedBox(0.28, 0.64, 0.06, x, steepleBase + 1.35 * heightScale, z - 0.55 + side * 0.465), DARK, "stone", 0.92, false);
  }
  bag.add(
    "bell_tower_roof",
    "钟楼尖顶",
    transform(buildRoofGeneratorMesh({
      style: "hip",
      width: 1.25,
      depth: 1.25,
      wallHeight: steepleBase + 2.25 * heightScale,
      roofHeight: 1.7 * heightScale,
      overhang: 0.08,
      dormers: 0,
      chimney: false,
      rafters: false,
    }), { translate: vec3(x, 0, z - 0.55) }),
    ROOF,
    "stylizedRoof",
    0.88,
  );
}

function addShed(bag: PartBag, baseY: number): void {
  const x = -5.15;
  const z = -3.9;
  const width = 3.5;
  const depth = 2.15;
  const top = baseY + 2.15;
  for (const postX of [x - width * 0.43, x, x + width * 0.43]) {
    for (const postZ of [z - depth * 0.42, z + depth * 0.42]) {
      bag.add("timber_shed", "庭院木棚", placedBox(0.16, 2.05, 0.16, postX, baseY + 1.02, postZ), TIMBER, "wood", 0.86);
    }
  }
  bag.add("timber_shed", "庭院木棚", placedBox(width, 0.18, 0.18, x, top - 0.15, z - depth * 0.42), TIMBER, "wood", 0.86);
  bag.add("timber_shed", "庭院木棚", placedBox(width, 0.18, 0.18, x, top - 0.15, z + depth * 0.42), TIMBER, "wood", 0.86);
  bag.add(
    "shed_roof",
    "木棚暖棕屋顶",
    transform(buildRoofGeneratorMesh({
      style: "gable",
      width,
      depth,
      wallHeight: top,
      roofHeight: 0.72,
      overhang: 0.25,
      dormers: 0,
      chimney: false,
      rafters: false,
    }), { translate: vec3(x, 0, z) }),
    SHED_ROOF,
    "wood",
    0.88,
  );
}

function addCourtyard(bag: PartBag, baseY: number, density: number, seed: number): void {
  bag.add("courtyard_paths", "庭院土路", placedBox(3.2, 0.08, 1.05, -0.2, baseY + 0.04, 3.4), PATH, "soil", 0.98, false);
  bag.add("courtyard_paths", "庭院土路", placedBox(0.85, 0.08, 5.6, -1.7, baseY + 0.04, 2.25), PATH, "soil", 0.98, false);

  bag.add("pond_rim", "庭院池塘石岸", transform(cylinder(2.1, 0.16, 28), { scale: vec3(1.18, 1, 0.72), translate: vec3(-5.05, baseY + 0.08, 2.2) }), STONE_LIGHT, "stone", 0.95);
  bag.add("courtyard_pond", "庭院池塘", transform(cylinder(1.88, 0.06, 28), { scale: vec3(1.18, 1, 0.72), translate: vec3(-5.05, baseY + 0.19, 2.2) }), WATER, "water", 0.18, false);

  bag.add("well", "庭院石井", placedCylinder(0.72, 0.75, 18, 5.65, baseY + 0.375, 3.7), STONE_LIGHT, "stone", 0.95);
  bag.add("well_water", "井中水面", placedCylinder(0.52, 0.05, 18, 5.65, baseY + 0.78, 3.7), WATER, "water", 0.18, false);

  const rng = makeRng(seed);
  const gardens = [
    [-0.15, 4.55, 2.25, 1.3],
    [2.35, 4.55, 1.8, 1.3],
    [4.25, 5.25, 1.3, 1.05],
  ] as const;
  for (const [x, z, width, depth] of gardens) {
    bag.add("garden_beds", "庭院菜圃", placedBox(width, 0.14, depth, x, baseY + 0.07, z), SOIL, "soil", 0.98, false);
    const rows = Math.max(1, Math.round(4 * density));
    for (let row = 0; row < rows; row++) {
      const rowZ = z - depth * 0.34 + row * depth * 0.68 / Math.max(1, rows - 1);
      const plants = Math.max(2, Math.round(width * 2.3 * density));
      for (let plant = 0; plant < plants; plant++) {
        const plantX = x - width * 0.4 + plant * width * 0.8 / Math.max(1, plants - 1) + rng.range(-0.035, 0.035);
        bag.add("garden_crops", "庭院蔬菜", transform(icosphere(0.12, 1), { scale: vec3(1, rng.range(0.7, 1.25), 1), translate: vec3(plantX, baseY + 0.2, rowZ) }), CROPS, "foliage", 0.93);
      }
    }
  }
}

function addBridgeAndGate(bag: PartBag, baseY: number): void {
  const x = -4.45;
  const bridgeCenterZ = 9.15;
  const planks = 11;
  for (let index = 0; index < planks; index++) {
    const z = 7.72 + index * 2.9 / (planks - 1);
    bag.add("drawbridge", "护城河木桥", placedBox(2.35, 0.16, 0.32, x, baseY + 0.12, z), TIMBER, "wood", 0.88);
  }
  for (const side of [-1, 1]) {
    bag.add("drawbridge_rails", "木桥护栏", placedBox(0.12, 0.56, 3.3, x + side * 1.02, baseY + 0.48, bridgeCenterZ), TIMBER, "wood", 0.88);
  }
  bag.add("gate", "城堡入口", placedBox(1.5, 1.55, 0.08, x, baseY + 0.78, 7.39), DARK, "wood", 0.9, false);
  bag.add(
    "gate",
    "城堡入口",
    transform(cylinder(0.75, 0.08, 16), { rotate: vec3(Math.PI * 0.5, 0, 0), translate: vec3(x, baseY + 1.55, 7.39) }),
    DARK,
    "wood",
    0.9,
    false,
  );
  bag.add("outer_path", "城外引道", placedBox(2.6, 0.08, 4.2, x, 0.08, 12.35), PATH, "soil", 0.98, false);
}

function addOuterFarms(bag: PartBag, density: number, seed: number): void {
  const rng = makeRng(seed + 91);
  for (let field = 0; field < 4; field++) {
    const x = -8.7 + field * 3.15;
    const z = -12.25 + (field % 2) * 0.35;
    bag.add("outer_farmland", "城外农田", placedBox(2.65, 0.12, 2.3, x, 0.06, z), SOIL, "soil", 0.98, false);
    const rows = Math.max(2, Math.round(5 * density));
    for (let row = 0; row < rows; row++) {
      bag.add("outer_crops", "城外作物", placedBox(2.2, rng.range(0.1, 0.18), 0.13, x, 0.15, z - 0.85 + row * 1.7 / Math.max(1, rows - 1)), CROPS, "foliage", 0.94);
    }
  }
  for (const [x, z] of [[10.8, -7.8], [12.1, -2.9], [11.2, 2.3], [-12.1, -6.4]] as const) {
    bag.add("orchard_trunks", "城外果树树干", placedCylinder(0.13, 1.35, 8, x, 0.68, z), TIMBER, "wood", 0.9);
    bag.add("orchard_crowns", "城外果树树冠", transform(icosphere(0.92, 2), { scale: vec3(1, rng.range(0.9, 1.25), 1), translate: vec3(x, 1.72, z) }), FOLIAGE, "foliage", 0.94);
  }
}

export function buildBilibiliManorCastleParts(params: Partial<BilibiliManorCastleParams> = {}): NamedPart[] {
  const p: BilibiliManorCastleParams = { ...BILIBILI_MANOR_CASTLE_DEFAULTS, ...params };
  p.seed = Math.round(p.seed);
  p.scale = Math.max(0.35, Math.min(2.5, p.scale));
  p.wallHeight = Math.max(1.5, Math.min(3.4, p.wallHeight));
  p.watchtowerHeight = Math.max(5.2, Math.min(11.5, p.watchtowerHeight));
  p.gardenDensity = Math.max(0.25, Math.min(1.8, p.gardenDensity));
  p.detail = Math.max(0.55, Math.min(1.65, p.detail));
  p.colorVariation = Math.max(0, Math.min(0.22, p.colorVariation));

  const bag = new PartBag(p.seed, p.colorVariation);
  const baseY = 0.48;
  bag.add("meadow", "城堡外围草地", placedBox(34, 0.2, 28, 0, -0.1, 0), MEADOW, "foliage", 0.98);
  bag.add("moat", "环绕护城河", placedBox(25, 0.12, 21, 0, 0.06, 0), WATER, "water", 0.18, false);
  bag.add("castle_island", "城堡草地岛台", placedBox(19.2, 0.36, 15.5, 0, 0.3, 0), ISLAND_GRASS, "foliage", 0.98);

  const halfWall = p.wallHeight * 0.5;
  bag.add("curtain_walls", "暖灰石幕墙", placedBox(18, p.wallHeight, 0.72, 0, baseY + halfWall, -7.15), STONE, "stone", 0.95);
  bag.add("curtain_walls", "暖灰石幕墙", placedBox(0.72, p.wallHeight, 14.3, -8.95, baseY + halfWall, 0), STONE, "stone", 0.95);
  bag.add("curtain_walls", "暖灰石幕墙", placedBox(0.72, p.wallHeight, 14.3, 8.95, baseY + halfWall, 0), STONE, "stone", 0.95);
  bag.add("curtain_walls", "暖灰石幕墙", placedBox(3.25, p.wallHeight, 0.72, -7.33, baseY + halfWall, 7.15), STONE, "stone", 0.95);
  bag.add("curtain_walls", "暖灰石幕墙", placedBox(12.2, p.wallHeight, 0.72, 2.85, baseY + halfWall, 7.15), STONE, "stone", 0.95);

  const wallTop = baseY + p.wallHeight;
  addMerlonLine(bag, [-8.9, -7.15], [8.9, -7.15], wallTop, p.detail);
  addMerlonLine(bag, [-8.95, -7.05], [-8.95, 7.05], wallTop, p.detail);
  addMerlonLine(bag, [8.95, -7.05], [8.95, 7.05], wallTop, p.detail);
  addMerlonLine(bag, [-8.9, 7.15], [-5.75, 7.15], wallTop, p.detail);
  addMerlonLine(bag, [-3.15, 7.15], [8.9, 7.15], wallTop, p.detail);

  addRoundTower(bag, -8.65, -6.85, 1.2, p.wallHeight + 0.7, baseY, p.detail);
  addRoundTower(bag, -8.65, 6.85, 1.2, p.wallHeight + 0.7, baseY, p.detail);
  addRoundTower(bag, 8.65, 6.85, 1.2, p.wallHeight + 0.7, baseY, p.detail);
  addRoundTower(bag, 8.65, -6.85, 1.2, p.wallHeight + 0.7, baseY, p.detail);
  addWatchtower(bag, 5.8, -3.85, 1.85, p.watchtowerHeight, baseY, p.detail);

  const heightScale = p.watchtowerHeight / BILIBILI_MANOR_CASTLE_DEFAULTS.watchtowerHeight;
  addHall(bag, baseY, heightScale);
  addChapel(bag, baseY, heightScale);
  addShed(bag, baseY);
  addCourtyard(bag, baseY, p.gardenDensity, p.seed);
  addBridgeAndGate(bag, baseY);
  addOuterFarms(bag, p.gardenDensity, p.seed);

  return bag.finish(p.scale);
}
