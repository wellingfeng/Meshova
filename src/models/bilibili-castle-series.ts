import { vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  box,
  cone,
  cylinder,
  frustum,
  icosphere,
  merge,
  rotateMesh,
  scaleMesh,
  styleLowPolyMesh,
  translateMesh,
  type LowPolyColor,
  type Mesh,
  type NamedPart,
  type PartSurfaceRef,
} from "../geometry/index.js";
import { buildRoofGeneratorMesh } from "./roof-generator.js";

export type BilibiliCastleSeriesVariant =
  | "earl-gate"
  | "baron-moat"
  | "wooden-island"
  | "trade-citadel"
  | "ridge-castle"
  | "military-stronghold"
  | "frontier-wood"
  | "blackstone"
  | "river-ruin"
  | "anime-hill"
  | "fantasy-hill"
  | "ring-ruin"
  | "grand-manor"
  | "mist-keep"
  | "cliff-beacon";

export interface BilibiliCastleSeriesParams {
  variant: BilibiliCastleSeriesVariant;
  seed: number;
  scale: number;
  wallHeight: number;
  towerScale: number;
  detail: number;
  colorVariation: number;
}

export interface BilibiliCastleSeriesDefinition {
  id: string;
  name: string;
  variant: BilibiliCastleSeriesVariant;
  part: number;
  sourceTitle: string;
  seed: number;
}

export const BILIBILI_CASTLE_SERIES: readonly BilibiliCastleSeriesDefinition[] = [
  { id: "bilibili-earl-gate-castle", name: "伯爵双塔门堡", variant: "earl-gate", part: 2, sourceTitle: "噢！伯爵大人，欢迎回到忠诚您的城堡", seed: 361975022 },
  { id: "bilibili-baron-moat-castle", name: "男爵水环宴会堡", variant: "baron-moat", part: 3, sourceTitle: "男爵大人，您的宴会已经准备好了", seed: 361970406 },
  { id: "bilibili-wooden-island-fort", name: "木栅岛心骑士堡", variant: "wooden-island", part: 5, sourceTitle: "经典样式有些富裕的骑士城堡", seed: 361982995 },
  { id: "bilibili-trade-citadel", name: "环城贸易要塞", variant: "trade-citadel", part: 7, sourceTitle: "远近闻名的富饶且强大的男爵领", seed: 361991087 },
  { id: "bilibili-ridge-castle", name: "山脊交通骑士堡", variant: "ridge-castle", part: 8, sourceTitle: "位于交通便利的骑士城堡", seed: 361994512 },
  { id: "bilibili-military-stronghold", name: "灰岩军事要塞", variant: "military-stronghold", part: 9, sourceTitle: "堡垒众多军事要塞重的贸易城市", seed: 362003109 },
  { id: "bilibili-frontier-wood-fort", name: "开荒木堡", variant: "frontier-wood", part: 11, sourceTitle: "早期与开荒时都用的木堡", seed: 362015703 },
  { id: "bilibili-blackstone-castle", name: "黑石紧凑城堡", variant: "blackstone", part: 17, sourceTitle: "黑石城堡，紧凑严密", seed: 362048117 },
  { id: "bilibili-river-ruin", name: "河道废弃城堡", variant: "river-ruin", part: 18, sourceTitle: "河道中废弃城堡遗址", seed: 362054821 },
  { id: "bilibili-anime-hill-castle", name: "温馨动漫山堡", variant: "anime-hill", part: 20, sourceTitle: "温馨动漫风", seed: 362066509 },
  { id: "bilibili-fantasy-hill-castle", name: "奇幻高塔山堡", variant: "fantasy-hill", part: 21, sourceTitle: "奇幻动漫风", seed: 362071933 },
  { id: "bilibili-ring-ruin", name: "晨雾环形废堡", variant: "ring-ruin", part: 23, sourceTitle: "晨雾中的废弃城堡", seed: 362086401 },
  { id: "bilibili-grand-manor-castle", name: "大贵族庄园城堡", variant: "grand-manor", part: 25, sourceTitle: "大贵族家的庄园城堡", seed: 362098729 },
  { id: "bilibili-mist-keep", name: "冒险任务废弃堡", variant: "mist-keep", part: 27, sourceTitle: "冒险任务-废弃城堡", seed: 362111537 },
  { id: "bilibili-cliff-beacon", name: "岩壁烽火要塞", variant: "cliff-beacon", part: 28, sourceTitle: "等待新使命的烽火要塞", seed: 362118643 },
] as const;

export const BILIBILI_CASTLE_SERIES_DEFAULTS: BilibiliCastleSeriesParams = {
  variant: "earl-gate",
  seed: BILIBILI_CASTLE_SERIES[0]!.seed,
  scale: 1,
  wallHeight: 1,
  towerScale: 1,
  detail: 1,
  colorVariation: 0.08,
};

type PointXZ = readonly [number, number];

interface Palette {
  stone: LowPolyColor;
  stoneLight: LowPolyColor;
  stoneDark: LowPolyColor;
  roof: LowPolyColor;
  wood: LowPolyColor;
  grass: LowPolyColor;
  earth: LowPolyColor;
  water: LowPolyColor;
  accent: LowPolyColor;
  dark: LowPolyColor;
}

interface Bucket {
  label: string;
  color: LowPolyColor;
  surface: PartSurfaceRef;
  meshes: Mesh[];
  faceted: boolean;
}

const PALE_PALETTE: Palette = {
  stone: [0.42, 0.39, 0.31],
  stoneLight: [0.58, 0.52, 0.4],
  stoneDark: [0.25, 0.24, 0.22],
  roof: [0.14, 0.12, 0.11],
  wood: [0.25, 0.13, 0.055],
  grass: [0.32, 0.43, 0.18],
  earth: [0.31, 0.24, 0.15],
  water: [0.13, 0.36, 0.42],
  accent: [0.52, 0.14, 0.08],
  dark: [0.065, 0.06, 0.055],
};

const DARK_PALETTE: Palette = {
  ...PALE_PALETTE,
  stone: [0.18, 0.19, 0.19],
  stoneLight: [0.28, 0.28, 0.27],
  stoneDark: [0.09, 0.1, 0.105],
  roof: [0.035, 0.045, 0.055],
  grass: [0.12, 0.22, 0.13],
  earth: [0.17, 0.15, 0.13],
  water: [0.035, 0.16, 0.21],
  accent: [0.88, 0.42, 0.08],
};

const ANIME_PALETTE: Palette = {
  ...PALE_PALETTE,
  stone: [0.64, 0.58, 0.44],
  stoneLight: [0.82, 0.73, 0.55],
  stoneDark: [0.36, 0.31, 0.27],
  roof: [0.12, 0.18, 0.25],
  grass: [0.42, 0.58, 0.24],
  earth: [0.44, 0.32, 0.2],
  water: [0.16, 0.48, 0.63],
  accent: [0.67, 0.28, 0.24],
};

class SeriesParts {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly params: BilibiliCastleSeriesParams,
    private readonly definition: BilibiliCastleSeriesDefinition,
  ) {}

  add(
    name: string,
    label: string,
    mesh: Mesh,
    color: LowPolyColor,
    material: PartSurfaceRef["type"] = "stone",
    roughness = 0.92,
    faceted = true,
  ): void {
    let bucket = this.buckets.get(name);
    if (!bucket) {
      const surface: PartSurfaceRef = material === "stone"
        ? { type: "romanCobblestone", params: { color, columns: 9, rows: 6, wetness: 0.02, seed: this.params.seed } }
        : { type: material, params: { color, roughness, seed: this.params.seed } };
      bucket = { label, color, surface, meshes: [], faceted };
      this.buckets.set(name, bucket);
    }
    bucket.meshes.push(mesh);
  }

  finish(): NamedPart[] {
    let index = 0;
    return [...this.buckets.entries()].map(([name, bucket]) => {
      const merged = bucket.meshes.length === 1 ? bucket.meshes[0]! : merge(...bucket.meshes);
      const styled = bucket.faceted
        ? styleLowPolyMesh(merged, bucket.color, {
            seed: this.params.seed + index++ * 991,
            colorVariation: this.params.colorVariation,
          })
        : { mesh: merged, colors: undefined };
      return {
        name,
        label: bucket.label,
        mesh: this.params.scale === 1 ? styled.mesh : scaleMesh(styled.mesh, vec3(this.params.scale, this.params.scale, this.params.scale)),
        color: bucket.color,
        ...(styled.colors ? { colors: styled.colors } : {}),
        surface: bucket.surface,
        metadata: {
          sourceStudy: `https://www.bilibili.com/video/BV1XhZvBwEAF?p=${this.definition.part}`,
          sourcePart: `${this.definition.part}.${this.definition.sourceTitle}`,
          seriesVariant: this.params.variant,
        },
      };
    });
  }
}

function placed(
  mesh: Mesh,
  x: number,
  y: number,
  z: number,
  yaw = 0,
  scale: readonly [number, number, number] = [1, 1, 1],
): Mesh {
  return translateMesh(
    rotateMesh(scaleMesh(mesh, vec3(scale[0], scale[1], scale[2])), vec3(0, yaw, 0)),
    vec3(x, y, z),
  );
}

function regularPolygon(radius: number, count: number, rotation = -Math.PI * 0.5): PointXZ[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = rotation + index * Math.PI * 2 / count;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius] as const;
  });
}

function addGround(parts: SeriesParts, palette: Palette, radius = 14, water = false, baseY = 0): void {
  if (water) {
    parts.add("water", "城堡周边水域", placed(cylinder(radius * 1.28, 0.16, 48), 0, baseY - 0.18, 0), palette.water, "water", 0.18, false);
  }
  parts.add("terrain", "城堡地基与岛台", placed(cylinder(radius, 0.7, 32), 0, baseY - 0.35, 0), palette.grass, "foliage", 0.97);
}

function addWall(
  parts: SeriesParts,
  palette: Palette,
  a: PointXZ,
  b: PointXZ,
  height: number,
  baseY: number,
  detail: number,
  ruined = false,
): void {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  const yaw = -Math.atan2(dz, dx);
  const actualHeight = ruined ? height * 0.72 : height;
  parts.add(
    ruined ? "ruined_walls" : "curtain_walls",
    ruined ? "残破城墙" : "城堡幕墙",
    placed(box(length, actualHeight, 0.72), (a[0] + b[0]) * 0.5, baseY + actualHeight * 0.5, (a[1] + b[1]) * 0.5, yaw),
    ruined ? palette.stoneDark : palette.stone,
  );
  const count = Math.max(3, Math.round(length * detail / 1.35));
  for (let index = 0; index <= count; index += 2) {
    if (ruined && (index + Math.round(length)) % 5 === 0) continue;
    const t = index / count;
    parts.add(
      "battlements",
      ruined ? "残存垛口" : "城墙垛口",
      placed(box(0.58, ruined ? 0.42 : 0.62, 0.52), a[0] + dx * t, baseY + actualHeight + (ruined ? 0.21 : 0.31), a[1] + dz * t, yaw),
      palette.stoneLight,
    );
  }
}

function addRing(
  parts: SeriesParts,
  palette: Palette,
  points: readonly PointXZ[],
  height: number,
  baseY: number,
  detail: number,
  ruinedSides: readonly number[] = [],
): void {
  for (let index = 0; index < points.length; index++) {
    addWall(parts, palette, points[index]!, points[(index + 1) % points.length]!, height, baseY, detail, ruinedSides.includes(index));
  }
}

function addRoundTower(
  parts: SeriesParts,
  palette: Palette,
  x: number,
  z: number,
  radius: number,
  height: number,
  baseY: number,
  detail: number,
  roofed = false,
  ruined = false,
): void {
  const segments = Math.max(10, Math.round(16 * detail));
  const actualHeight = ruined ? height * 0.72 : height;
  parts.add(ruined ? "ruined_towers" : "towers", ruined ? "残破防御塔" : "防御塔楼", placed(cylinder(radius, actualHeight, segments), x, baseY + actualHeight * 0.5, z), ruined ? palette.stoneDark : palette.stone);
  if (roofed) {
    parts.add("tower_roofs", "塔楼尖顶", placed(cone(radius * 1.32, radius * 2.2, segments), x, baseY + actualHeight + radius * 1.1, z), palette.roof, "stylizedRoof", 0.86);
    return;
  }
  const count = Math.max(6, Math.round(9 * detail));
  for (let index = 0; index < count; index++) {
    if (ruined && index % 4 === 0) continue;
    const angle = index / count * Math.PI * 2;
    parts.add("battlements", ruined ? "残存垛口" : "塔顶垛口", placed(box(0.46, 0.6, 0.42), x + Math.cos(angle) * radius * 0.86, baseY + actualHeight + 0.3, z + Math.sin(angle) * radius * 0.86, -angle), palette.stoneLight);
  }
}

function addSquareTower(
  parts: SeriesParts,
  palette: Palette,
  x: number,
  z: number,
  width: number,
  height: number,
  baseY: number,
  detail: number,
  roofed = false,
  ruined = false,
): void {
  const actualHeight = ruined ? height * 0.76 : height;
  parts.add(ruined ? "ruined_towers" : "towers", ruined ? "残破方塔" : "方形塔楼", placed(box(width, actualHeight, width), x, baseY + actualHeight * 0.5, z), ruined ? palette.stoneDark : palette.stone);
  if (roofed) {
    parts.add("tower_roofs", "塔楼尖顶", placed(cone(width * 0.82, width * 1.28, 4), x, baseY + actualHeight + width * 0.64, z, Math.PI * 0.25), palette.roof, "stylizedRoof", 0.86);
  } else {
    const edge = width * 0.42;
    for (const [offsetX, offsetZ] of [[-edge, -edge], [edge, -edge], [edge, edge], [-edge, edge]] as const) {
      parts.add("battlements", ruined ? "残存垛口" : "塔顶垛口", placed(box(0.55, 0.62, 0.55), x + offsetX, baseY + actualHeight + 0.31, z + offsetZ), palette.stoneLight);
    }
    if (detail > 1.1) {
      parts.add("battlements", "塔顶垛口", placed(box(0.55, 0.62, 0.55), x, baseY + actualHeight + 0.31, z - edge), palette.stoneLight);
      parts.add("battlements", "塔顶垛口", placed(box(0.55, 0.62, 0.55), x, baseY + actualHeight + 0.31, z + edge), palette.stoneLight);
    }
  }
}

function addHall(
  parts: SeriesParts,
  palette: Palette,
  x: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  baseY: number,
  yaw = 0,
  roofStyle: "gable" | "hip" = "gable",
): void {
  parts.add("great_hall", "城堡主厅", placed(box(width, height, depth), x, baseY + height * 0.5, z, yaw), palette.stoneLight);
  const roof = buildRoofGeneratorMesh({
    style: roofStyle,
    width,
    depth,
    wallHeight: baseY + height,
    roofHeight: Math.min(width, depth) * 0.42,
    overhang: 0.3,
    dormers: 0,
    chimney: false,
    rafters: false,
  });
  parts.add("hall_roofs", "主厅坡屋顶", placed(roof, x, 0, z, yaw), palette.roof, "stylizedRoof", 0.86);
  const rows = Math.max(2, Math.round(width / 2));
  for (let index = 0; index < rows; index++) {
    const windowX = x - width * 0.35 + index * width * 0.7 / Math.max(1, rows - 1);
    parts.add("windows", "暖光窗洞", placed(box(0.34, 0.65, 0.07), windowX, baseY + height * 0.56, z - depth * 0.505, yaw), palette.accent, "emissive", 0.65, false);
  }
}

function addGate(parts: SeriesParts, palette: Palette, z: number, width: number, height: number, baseY: number): void {
  parts.add("gatehouse", "强化门楼", placed(box(width, height, 1.45), 0, baseY + height * 0.5, z), palette.stoneLight);
  parts.add("gate", "城堡拱门", placed(box(width * 0.34, height * 0.58, 0.08), 0, baseY + height * 0.29, z - 0.76), palette.dark, "wood", 0.9, false);
  addRoundTower(parts, palette, -width * 0.58, z, width * 0.28, height * 1.2, baseY, 0.85);
  addRoundTower(parts, palette, width * 0.58, z, width * 0.28, height * 1.2, baseY, 0.85);
}

function addBridge(parts: SeriesParts, palette: Palette, z: number, length: number, width: number, baseY: number): void {
  parts.add("bridge", "城门木桥", placed(box(width, 0.24, length), 0, baseY, z), palette.wood, "wood", 0.86);
  for (const side of [-1, 1]) {
    parts.add("bridge_rails", "木桥护栏", placed(box(0.12, 0.52, length), side * width * 0.46, baseY + 0.32, z), palette.wood, "wood", 0.86);
  }
}

function addPalisade(parts: SeriesParts, palette: Palette, radius: number, count: number, height: number, baseY: number): void {
  for (let index = 0; index < count; index++) {
    const angle = index / count * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    parts.add("wooden_palisade", "尖桩木栅围墙", placed(cylinder(0.16, height, 7), x, baseY + height * 0.5, z), palette.wood, "wood", 0.9);
    parts.add("palisade_spikes", "木栅尖桩", placed(cone(0.21, 0.48, 7), x, baseY + height + 0.24, z), palette.wood, "wood", 0.9);
  }
}

function addVillage(parts: SeriesParts, palette: Palette, radius: number, count: number, baseY: number, seed: number): void {
  const rng = makeRng(seed);
  for (let index = 0; index < count; index++) {
    const angle = rng.range(0, Math.PI * 2);
    const distance = rng.range(radius * 0.42, radius);
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    const width = rng.range(0.85, 1.5);
    const depth = rng.range(0.85, 1.45);
    const height = rng.range(0.8, 1.45);
    parts.add("town_houses", "城内民居", placed(box(width, height, depth), x, baseY + height * 0.5, z, angle), palette.stoneLight);
    parts.add("town_roofs", "民居屋顶", placed(cone(Math.max(width, depth) * 0.72, 0.9, 4), x, baseY + height + 0.45, z, Math.PI * 0.25 + angle), palette.roof, "stylizedRoof", 0.88);
  }
}

function addRockBase(parts: SeriesParts, palette: Palette, x: number, z: number, radius: number, baseY: number, scale: readonly [number, number, number]): void {
  parts.add("rock_foundation", "岩石地基", placed(icosphere(radius, 2), x, baseY, z, 0, scale), palette.earth, "stone", 0.98);
}

function buildEarlGate(parts: SeriesParts, p: BilibiliCastleSeriesParams, palette: Palette): void {
  addGround(parts, palette, 14, false);
  const baseY = 0;
  const wallHeight = 3.1 * p.wallHeight;
  const ring: PointXZ[] = [[-9, -6.5], [9, -6.5], [9, 6.5], [-9, 6.5]];
  addRing(parts, palette, ring, wallHeight, baseY, p.detail);
  for (const point of ring) addRoundTower(parts, palette, point[0], point[1], 1.45 * p.towerScale, 5.2 * p.wallHeight * p.towerScale, baseY, p.detail, true);
  addGate(parts, palette, -6.5, 3.5, 4.4 * p.wallHeight, baseY);
  addBridge(parts, palette, -9, 5.2, 2.8, 0.2);
  addHall(parts, palette, 1.1, 0.8, 6.2, 4.8, 5.1 * p.towerScale, baseY, 0, "hip");
  addSquareTower(parts, palette, 1.1, 0.8, 2.2, 7.4 * p.towerScale, baseY, p.detail, true);
}

function buildBaronMoat(parts: SeriesParts, p: BilibiliCastleSeriesParams, palette: Palette): void {
  addGround(parts, palette, 15, true);
  const baseY = 0.1;
  const ring: PointXZ[] = [[-9.6, -7], [9.6, -7], [9.6, 7], [-9.6, 7]];
  addRing(parts, palette, ring, 2.9 * p.wallHeight, baseY, p.detail);
  for (const point of ring) addRoundTower(parts, palette, point[0], point[1], 1.3 * p.towerScale, 5.1 * p.towerScale, baseY, p.detail, true);
  addGate(parts, palette, -7, 3.2, 3.8, baseY);
  addBridge(parts, palette, -10, 6.2, 2.7, 0.24);
  addHall(parts, palette, 0.8, 0.7, 7.8, 5.2, 4.4 * p.towerScale, baseY, 0, "hip");
  for (const x of [-3.2, 4.7]) addSquareTower(parts, palette, x, 0.7, 1.65, 6.2 * p.towerScale, baseY, p.detail, true);
}

function buildWoodenIsland(parts: SeriesParts, p: BilibiliCastleSeriesParams, palette: Palette): void {
  addGround(parts, palette, 12, true);
  addPalisade(parts, palette, 8.3, Math.max(38, Math.round(58 * p.detail)), 3.1 * p.wallHeight, 0);
  addBridge(parts, palette, -10.5, 6.4, 2.4, 0.2);
  addHall(parts, palette, 0.8, 2.1, 5.4, 3.4, 2.9, 0, 0, "gable");
  addSquareTower(parts, palette, 0.8, 2.2, 3, 7.4 * p.towerScale, 0, p.detail, false);
  addVillage(parts, palette, 6.4, 9, 0, p.seed);
}

function buildTradeCitadel(parts: SeriesParts, p: BilibiliCastleSeriesParams, palette: Palette): void {
  addGround(parts, palette, 17, true);
  const outer = regularPolygon(13.2, 14);
  addRing(parts, palette, outer, 2.35 * p.wallHeight, 0.1, p.detail);
  for (let index = 0; index < outer.length; index += 2) {
    const point = outer[index]!;
    addRoundTower(parts, palette, point[0], point[1], 1.05 * p.towerScale, 3.8 * p.towerScale, 0.1, p.detail);
  }
  addVillage(parts, palette, 10.3, Math.max(20, Math.round(32 * p.detail)), 0.15, p.seed);
  parts.add("citadel_hill", "中央堡山", placed(cylinder(6.2, 2.4, 20), 0, 1.2, 0), palette.earth);
  addHall(parts, palette, 0, 0.6, 6, 4.5, 5.2 * p.towerScale, 2.4, 0, "hip");
  for (const [x, z] of [[-3.2, -2], [3.2, -2], [0, 3]] as const) addSquareTower(parts, palette, x, z, 1.7, 6.8 * p.towerScale, 2.4, p.detail, true);
}

function buildRidgeCastle(parts: SeriesParts, p: BilibiliCastleSeriesParams, palette: Palette): void {
  addRockBase(parts, palette, 0, 0, 8, -1.9, [1.75, 0.65, 0.82]);
  const baseY = 1;
  const ring: PointXZ[] = [[-11, -3], [-5, -5.3], [4, -4.7], [10, -2.3], [8.8, 3.1], [1.5, 4.3], [-7.5, 3.6]];
  addRing(parts, palette, ring, 3 * p.wallHeight, baseY, p.detail);
  for (const index of [0, 2, 3, 5, 6]) {
    const point = ring[index]!;
    addRoundTower(parts, palette, point[0], point[1], 1.05 * p.towerScale, 4.6 * p.towerScale, baseY, p.detail, index === 3);
  }
  addHall(parts, palette, 4.4, 0.1, 4.8, 3.8, 4.1, baseY, 0, "gable");
  addSquareTower(parts, palette, 4.4, 0.1, 2.2, 7.4 * p.towerScale, baseY, p.detail, false);
  addBridge(parts, palette, -6.2, 7.2, 2.4, 0.55);
}

function buildMilitaryStronghold(parts: SeriesParts, p: BilibiliCastleSeriesParams, palette: Palette): void {
  addGround(parts, palette, 13, false);
  const ring = regularPolygon(9.6, 10);
  addRing(parts, palette, ring, 4.1 * p.wallHeight, 0, p.detail);
  for (let index = 0; index < ring.length; index += 2) {
    const point = ring[index]!;
    addSquareTower(parts, palette, point[0], point[1], 2.25 * p.towerScale, 6.2 * p.towerScale, 0, p.detail, false);
  }
  for (const [x, z] of [[-2.8, 0], [2.8, 0], [0, 3.3]] as const) addRoundTower(parts, palette, x, z, 1.35, 7.4 * p.towerScale, 0, p.detail);
  addGate(parts, palette, -9.2, 3.5, 5.2, 0);
  addBridge(parts, palette, -12, 5.5, 3, 0.18);
}

function buildFrontierWood(parts: SeriesParts, p: BilibiliCastleSeriesParams, palette: Palette): void {
  addGround(parts, palette, 10, true);
  addPalisade(parts, palette, 6.7, Math.max(30, Math.round(46 * p.detail)), 2.3 * p.wallHeight, 0);
  addSquareTower(parts, palette, 0, 0.5, 2.5, 5.6 * p.towerScale, 0, p.detail, true);
  for (let index = 0; index < 6; index++) {
    const angle = index / 6 * Math.PI * 2;
    const x = Math.cos(angle) * 4.1;
    const z = Math.sin(angle) * 4.1;
    addHall(parts, palette, x, z, 2.1, 1.7, 1.6, 0, -angle, "gable");
  }
  addBridge(parts, palette, -8.3, 4.6, 2.2, 0.18);
}

function buildBlackstone(parts: SeriesParts, p: BilibiliCastleSeriesParams, palette: Palette): void {
  addGround(parts, palette, 12.4, true);
  const ring = regularPolygon(8, 12);
  addRing(parts, palette, ring, 3.8 * p.wallHeight, 0, p.detail);
  for (let index = 0; index < ring.length; index += 3) {
    const point = ring[index]!;
    addRoundTower(parts, palette, point[0], point[1], 1.5 * p.towerScale, 7 * p.towerScale, 0, p.detail, true);
  }
  addHall(parts, palette, 0, 0.5, 5.2, 4.4, 4.4, 0, 0, "hip");
  addSquareTower(parts, palette, 0, 0.5, 2.3, 8.2 * p.towerScale, 0, p.detail, true);
  addGate(parts, palette, -7.8, 3.1, 4.8, 0);
  addBridge(parts, palette, -10.6, 6, 2.6, 0.2);
}

function buildRiverRuin(parts: SeriesParts, p: BilibiliCastleSeriesParams, palette: Palette): void {
  parts.add("river", "环绕河道", placed(cylinder(14.5, 0.18, 48), 0, -0.35, 0, 0, [1.35, 1, 0.82]), palette.water, "water", 0.18, false);
  addRockBase(parts, palette, 0, 0, 7.4, -1.8, [1.45, 0.58, 0.9]);
  const ring: PointXZ[] = [[-7, -4.2], [6, -4.8], [8.4, 0], [5.8, 4.5], [-6.3, 4], [-8.2, 0]];
  addRing(parts, palette, ring, 3.4 * p.wallHeight, 0.4, p.detail, [1, 3, 4]);
  for (const index of [0, 2, 3, 5]) {
    const point = ring[index]!;
    addRoundTower(parts, palette, point[0], point[1], 1.35, 5.4 * p.towerScale, 0.4, p.detail, false, index !== 2);
  }
  addSquareTower(parts, palette, 1.8, 0.5, 3.2, 6.5 * p.towerScale, 0.4, p.detail, false, true);
  addBridge(parts, palette, 10.4, 7.2, 2.2, 0.25);
}

function addFlowers(parts: SeriesParts, palette: Palette, radius: number, count: number, baseY: number, seed: number): void {
  const rng = makeRng(seed);
  for (let index = 0; index < count; index++) {
    const angle = rng.range(0, Math.PI * 2);
    const distance = rng.range(radius * 0.4, radius);
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    const color: LowPolyColor = index % 3 === 0 ? [0.74, 0.24, 0.36] : index % 3 === 1 ? [0.78, 0.65, 0.18] : [0.68, 0.54, 0.78];
    parts.add("flowers", "山坡花丛", placed(icosphere(0.1, 1), x, baseY + rng.range(0, 0.25), z), color, "foliage", 0.9);
  }
}

function buildAnimeHill(parts: SeriesParts, p: BilibiliCastleSeriesParams, palette: Palette): void {
  parts.add("hill", "明亮草坡", placed(cone(10.5, 4.2, 28), 0, 0.1, 0), palette.grass, "foliage", 0.96);
  const baseY = 2.15;
  addHall(parts, palette, 0, 0, 5.3, 3.7, 3.7, baseY, 0, "gable");
  for (const [x, z, height] of [[-3.2, -0.8, 5.6], [3.2, -0.8, 6.6], [0, 2.2, 4.9]] as const) addSquareTower(parts, palette, x, z, 1.65, height * p.towerScale, baseY, p.detail, true);
  addFlowers(parts, palette, 8.3, Math.max(18, Math.round(32 * p.detail)), 0.3, p.seed);
}

function buildFantasyHill(parts: SeriesParts, p: BilibiliCastleSeriesParams, palette: Palette): void {
  addRockBase(parts, palette, 0, 0, 8.5, -0.8, [1.15, 0.6, 1]);
  const baseY = 2.2;
  const ring = regularPolygon(6.4, 8);
  addRing(parts, palette, ring, 2.2 * p.wallHeight, baseY, p.detail);
  addHall(parts, palette, 0, 0.4, 5.8, 4.2, 4.2, baseY, 0, "hip");
  for (const [x, z, width, height] of [[-3.6, -1.8, 1.7, 7.4], [3.6, -1.8, 1.7, 8.6], [0, 2.8, 1.5, 6.5]] as const) addSquareTower(parts, palette, x, z, width, height * p.towerScale, baseY, p.detail, true);
  addFlowers(parts, palette, 7, Math.max(12, Math.round(22 * p.detail)), 0.4, p.seed);
}

function buildRingRuin(parts: SeriesParts, p: BilibiliCastleSeriesParams, palette: Palette): void {
  addGround(parts, palette, 14, true);
  const outer = regularPolygon(10.4, 12);
  addRing(parts, palette, outer, 3.1 * p.wallHeight, 0.1, p.detail, [1, 4, 7, 9]);
  for (const index of [0, 3, 6, 10]) {
    const point = outer[index]!;
    addRoundTower(parts, palette, point[0], point[1], 1.25, 4.8 * p.towerScale, 0.1, p.detail, false, index !== 3);
  }
  parts.add("inner_pool", "废堡内湖", placed(cylinder(5.2, 0.08, 32), 0, 0.16, 0), palette.water, "water", 0.18, false);
  addSquareTower(parts, palette, 0, 4.4, 2.8, 6.2 * p.towerScale, 0.1, p.detail, false, true);
}

function buildGrandManor(parts: SeriesParts, p: BilibiliCastleSeriesParams, palette: Palette): void {
  addGround(parts, palette, 14, true);
  const ring: PointXZ[] = [[-9.5, -6.6], [9.5, -6.6], [9.5, 6.6], [-9.5, 6.6]];
  addRing(parts, palette, ring, 2.8 * p.wallHeight, 0.1, p.detail);
  for (const point of ring) addRoundTower(parts, palette, point[0], point[1], 1.35 * p.towerScale, 5.6 * p.towerScale, 0.1, p.detail, true);
  addGate(parts, palette, -6.6, 3.6, 4.4, 0.1);
  addBridge(parts, palette, -9.6, 6, 2.8, 0.28);
  addHall(parts, palette, 0, 0.8, 8.2, 5.4, 4.6, 0.1, 0, "gable");
  for (const x of [-3.6, 3.6]) addSquareTower(parts, palette, x, 0.8, 1.65, 6.4 * p.towerScale, 0.1, p.detail, true);
}

function buildMistKeep(parts: SeriesParts, p: BilibiliCastleSeriesParams, palette: Palette): void {
  parts.add("tidal_flats", "雾中潮滩", placed(cylinder(15, 0.16, 42), 0, -0.3, 0), palette.water, "water", 0.2, false);
  addRockBase(parts, palette, 0, 0, 7.8, -1.5, [1.35, 0.5, 0.9]);
  const baseY = 0.5;
  addHall(parts, palette, 0, 0.6, 7.4, 4.5, 5.2, baseY, 0, "gable");
  for (const [x, z] of [[-4.2, -1.6], [4.2, -1.6], [-4.2, 2.7], [4.2, 2.7]] as const) addRoundTower(parts, palette, x, z, 1.45, 6.7 * p.towerScale, baseY, p.detail, false, true);
  parts.add("collapsed_roof", "坍塌屋顶残片", placed(box(3.8, 0.22, 2.1), 0.5, baseY + 5.8, 0.5, 0.32), palette.roof, "wood", 0.9);
}

function buildCliffBeacon(parts: SeriesParts, p: BilibiliCastleSeriesParams, palette: Palette): void {
  addRockBase(parts, palette, 0, 1.5, 8.8, -1.9, [1.28, 0.38, 0.88]);
  for (const [x, z, width, height, yaw] of [
    [-6.3, -5.4, 3.1, 6.2, -0.16],
    [-3.4, -5.8, 3, 8, 0.12],
    [0, -6.1, 3.4, 9.2, -0.08],
    [3.5, -5.8, 3.1, 8.1, 0.14],
    [6.4, -5.3, 3.2, 6.4, -0.12],
  ] as const) {
    parts.add("cliff_wall", "岩壁峭壁", placed(frustum(width, width * 0.68, height, 7), x, height * 0.5 - 0.2, z, yaw, [1, 1, 0.78]), palette.earth);
  }
  const baseY = 1.4;
  addSquareTower(parts, palette, -1.5, 0.8, 2.8, 7.4 * p.towerScale, baseY, p.detail, false, true);
  addHall(parts, palette, 2.3, 0.5, 4.2, 3, 3.1, baseY, -0.12, "gable");
  const stairCount = Math.max(7, Math.round(11 * p.detail));
  for (let index = 0; index < stairCount; index++) {
    parts.add("cliff_stairs", "岩壁石阶", placed(box(1.8, 0.22, 0.58), -4.8 + index * 0.52, 0.3 + index * 0.34, 4.4 - index * 0.28, -0.48), palette.stoneLight);
  }
  parts.add("beacon", "烽火台", placed(cylinder(0.9, 1.1, 12), -1.5, baseY + 7.2 * p.towerScale, 0.8), palette.stoneDark);
  parts.add("beacon_fire", "烽火", placed(cone(0.45, 1.35, 12), -1.5, baseY + 8.45 * p.towerScale, 0.8), palette.accent, "emissive", 0.5, false);
}

function paletteFor(variant: BilibiliCastleSeriesVariant): Palette {
  if (["military-stronghold", "blackstone", "river-ruin", "ring-ruin", "mist-keep", "cliff-beacon"].includes(variant)) return DARK_PALETTE;
  if (["anime-hill", "fantasy-hill"].includes(variant)) return ANIME_PALETTE;
  if (["wooden-island", "frontier-wood"].includes(variant)) {
    return { ...PALE_PALETTE, stone: [0.34, 0.31, 0.25], stoneLight: [0.49, 0.42, 0.3], wood: [0.24, 0.12, 0.04], grass: [0.35, 0.44, 0.18] };
  }
  return PALE_PALETTE;
}

export function buildBilibiliCastleSeriesParts(params: Partial<BilibiliCastleSeriesParams> = {}): NamedPart[] {
  const p: BilibiliCastleSeriesParams = { ...BILIBILI_CASTLE_SERIES_DEFAULTS, ...params };
  p.seed = Math.round(p.seed);
  p.scale = Math.max(0.35, Math.min(2.5, p.scale));
  p.wallHeight = Math.max(0.65, Math.min(1.65, p.wallHeight));
  p.towerScale = Math.max(0.7, Math.min(1.55, p.towerScale));
  p.detail = Math.max(0.5, Math.min(1.5, p.detail));
  p.colorVariation = Math.max(0, Math.min(0.2, p.colorVariation));
  const definition = BILIBILI_CASTLE_SERIES.find((entry) => entry.variant === p.variant) ?? BILIBILI_CASTLE_SERIES[0]!;
  const parts = new SeriesParts(p, definition);
  const palette = paletteFor(p.variant);

  switch (p.variant) {
    case "baron-moat": buildBaronMoat(parts, p, palette); break;
    case "wooden-island": buildWoodenIsland(parts, p, palette); break;
    case "trade-citadel": buildTradeCitadel(parts, p, palette); break;
    case "ridge-castle": buildRidgeCastle(parts, p, palette); break;
    case "military-stronghold": buildMilitaryStronghold(parts, p, palette); break;
    case "frontier-wood": buildFrontierWood(parts, p, palette); break;
    case "blackstone": buildBlackstone(parts, p, palette); break;
    case "river-ruin": buildRiverRuin(parts, p, palette); break;
    case "anime-hill": buildAnimeHill(parts, p, palette); break;
    case "fantasy-hill": buildFantasyHill(parts, p, palette); break;
    case "ring-ruin": buildRingRuin(parts, p, palette); break;
    case "grand-manor": buildGrandManor(parts, p, palette); break;
    case "mist-keep": buildMistKeep(parts, p, palette); break;
    case "cliff-beacon": buildCliffBeacon(parts, p, palette); break;
    default: buildEarlGate(parts, p, palette);
  }
  return parts.finish();
}
