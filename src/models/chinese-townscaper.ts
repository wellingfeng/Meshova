import { vec2 } from "../math/vec2.js";
import { vec3 } from "../math/vec3.js";
import {
  box,
  merge,
  plane,
  prism,
  transform,
  type Mesh,
  type NamedPart,
  type PartSurfaceRef,
} from "../geometry/index.js";
import { buildChineseHallParts, type ChineseRoofType } from "./chinese-architecture.js";

type RGB = [number, number, number];

interface Cell {
  x: number;
  z: number;
  worldX: number;
  worldZ: number;
  neighbours: number;
  module: "hallX" | "hallZ" | "pavilion" | "tower";
}

interface PartGroup {
  label: string;
  meshes: Mesh[];
  color?: RGB;
  surface?: PartSurfaceRef;
}

export interface ChineseTownscaperParams {
  gridSize: number;
  cellSize: number;
  density: number;
  islandRadius: number;
  canalAmount: number;
  doubleEaveRate: number;
  roofUpturn: number;
  waterHeight: number;
  seed: number;
}

export interface ChineseTownscaperSummary {
  moduleCount: number;
  doubleEaveCount: number;
  bridgeCount: number;
  connectedEdges: number;
}

export interface ChineseTownscaperScene {
  parts: NamedPart[];
  summary: ChineseTownscaperSummary;
}

export const CHINESE_TOWNSCAPER_DEFAULTS: ChineseTownscaperParams = {
  gridSize: 7,
  cellSize: 6.2,
  density: 0.44,
  islandRadius: 0.9,
  canalAmount: 0.56,
  doubleEaveRate: 0.62,
  roofUpturn: 0.72,
  waterHeight: 0.035,
  seed: 715,
};

const WATER: RGB = [0.38, 0.69, 0.68];
const DEEP_WATER: RGB = [0.08, 0.3, 0.35];
const ISLAND: RGB = [0.68, 0.71, 0.48];
const SHORE: RGB = [0.78, 0.76, 0.58];
const PATH: RGB = [0.72, 0.7, 0.61];
const BRIDGE: RGB = [0.56, 0.52, 0.42];

const TOWN_MATERIALS: Record<string, { color: RGB; type: string; roughness: number }> = {
  platform: { color: [0.62, 0.61, 0.56], type: "stone", roughness: 0.88 },
  steps: { color: [0.53, 0.52, 0.48], type: "stone", roughness: 0.9 },
  plinths: { color: [0.55, 0.54, 0.5], type: "stone", roughness: 0.88 },
  columns: { color: [0.31, 0.16, 0.1], type: "wood", roughness: 0.68 },
  architrave: { color: [0.23, 0.12, 0.08], type: "wood", roughness: 0.67 },
  dougong: { color: [0.27, 0.14, 0.09], type: "wood", roughness: 0.66 },
  rafters: { color: [0.22, 0.11, 0.075], type: "wood", roughness: 0.68 },
  roof: { color: [0.19, 0.21, 0.2], type: "ceramic", roughness: 0.56 },
  ridge: { color: [0.34, 0.34, 0.3], type: "ceramic", roughness: 0.54 },
  walls: { color: [0.73, 0.7, 0.62], type: "stone", roughness: 0.86 },
  doors: { color: [0.2, 0.1, 0.065], type: "wood", roughness: 0.68 },
  ridgeBeasts: { color: [0.35, 0.34, 0.29], type: "ceramic", roughness: 0.52 },
};

const LABELS: Record<string, string> = {
  platform: "台基",
  steps: "踏跺",
  plinths: "柱础",
  columns: "木柱",
  architrave: "额枋",
  dougong: "斗拱",
  rafters: "檐椽",
  roof: "灰瓦曲面屋顶",
  ridge: "屋脊",
  walls: "白墙",
  doors: "格扇门",
  ridgeBeasts: "脊兽",
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function resolveParams(params: Partial<ChineseTownscaperParams>): ChineseTownscaperParams {
  const merged = { ...CHINESE_TOWNSCAPER_DEFAULTS, ...params };
  return {
    gridSize: clampInt(merged.gridSize, 5, 11),
    cellSize: clamp(merged.cellSize, 5.2, 8),
    density: clamp(merged.density, 0.2, 0.78),
    islandRadius: clamp(merged.islandRadius, 0.65, 1.2),
    canalAmount: clamp(merged.canalAmount, 0, 1),
    doubleEaveRate: clamp(merged.doubleEaveRate, 0, 1),
    roofUpturn: clamp(merged.roofUpturn, 0.25, 1.25),
    waterHeight: clamp(merged.waterHeight, 0.01, 0.12),
    seed: Math.round(merged.seed) >>> 0,
  };
}

function hash01(x: number, z: number, seed: number): number {
  let value = Math.imul((x + 0x7f4a7c15) | 0, 0x45d9f3b);
  value ^= Math.imul((z + 0x165667b1) | 0, 0x119de1f3);
  value ^= seed | 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function buildCells(params: ChineseTownscaperParams): Cell[] {
  const size = params.gridSize;
  const half = (size - 1) * 0.5;
  const occupied = Array.from({ length: size }, () => Array.from({ length: size }, () => false));

  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const nx = (x - half) / Math.max(1, half);
      const nz = (z - half) / Math.max(1, half);
      const radius = Math.hypot(nx * 0.92, nz * 1.08);
      const coast = params.islandRadius + (hash01(x, z, params.seed + 13) - 0.5) * 0.24;
      if (radius > coast) continue;
      const centerBias = clamp(1 - radius, 0, 1) * 0.18;
      occupied[z]![x] = hash01(x, z, params.seed + 31) < params.density + centerBias;
    }
  }
  occupied[Math.round(half)]![Math.round(half)] = true;

  const result: Cell[] = [];
  const at = (x: number, z: number) => occupied[z]?.[x] ?? false;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      if (!at(x, z)) continue;
      const left = at(x - 1, z);
      const right = at(x + 1, z);
      const front = at(x, z + 1);
      const back = at(x, z - 1);
      const neighbours = Number(left) + Number(right) + Number(front) + Number(back);
      const horizontal = Number(left) + Number(right);
      const vertical = Number(front) + Number(back);
      const tower = neighbours >= 3 || (x === Math.round(half) && z === Math.round(half));
      const module = tower
        ? "tower"
        : neighbours === 0
          ? "pavilion"
          : horizontal > vertical
            ? "hallX"
            : vertical > horizontal
              ? "hallZ"
              : hash01(x, z, params.seed + 47) < 0.5 ? "hallX" : "hallZ";
      const jitter = params.cellSize * 0.08;
      result.push({
        x,
        z,
        worldX: (x - half) * params.cellSize + (hash01(x, z, params.seed + 71) - 0.5) * jitter,
        worldZ: (z - half) * params.cellSize + (hash01(x, z, params.seed + 89) - 0.5) * jitter,
        neighbours,
        module,
      });
    }
  }
  return result;
}

function islandOutline(params: ChineseTownscaperParams, scale: number): ReturnType<typeof vec2>[] {
  const radius = params.gridSize * params.cellSize * 0.49 * params.islandRadius * scale;
  const points: ReturnType<typeof vec2>[] = [];
  const count = 28;
  for (let index = 0; index < count; index++) {
    const angle = (index / count) * Math.PI * 2;
    const variation = 0.9 + hash01(index, 0, params.seed + 101) * 0.17
      + Math.sin(angle * 3 + params.seed * 0.01) * 0.035;
    points.push(vec2(
      Math.cos(angle) * radius * variation,
      Math.sin(angle) * radius * variation * 0.86,
    ));
  }
  return points;
}

function addHall(
  groups: Map<string, PartGroup>,
  cell: Cell,
  params: ChineseTownscaperParams,
  doubleEave: boolean,
): void {
  const isLong = cell.module === "hallX" || cell.module === "hallZ";
  const lowerRoof: ChineseRoofType = cell.module === "pavilion" ? "hip" : "hipGable";
  const yaw = cell.module === "hallZ" ? Math.PI / 2 : 0;
  const lowerColumnHeight = cell.module === "tower" ? 2.45 : 2.1;
  const lower = buildChineseHallParts({
    baysX: isLong ? 2 : 1,
    baysZ: 1,
    bayWidth: isLong ? 1.85 : 2.15,
    bayDepth: 1.75,
    columnHeight: lowerColumnHeight,
    columnRadius: 0.12,
    baseHeight: 0.42,
    baseOverhang: 0.48,
    eaveOverhang: 0.78,
    roofRise: 0.3,
    roofConcavity: 0.72,
    cornerUpturn: params.roofUpturn,
    roof: lowerRoof,
    dougong: true,
    ridgeBeasts: cell.module === "tower",
    walls: true,
    seed: params.seed + cell.x * 31 + cell.z * 59,
  });
  collectHallParts(groups, lower, "lower", yaw, cell.worldX, 0.08, cell.worldZ, false);

  if (!doubleEave) return;
  const upperY = 3.08 + (cell.module === "tower" ? 0.28 : 0);
  const upper = buildChineseHallParts({
    baysX: 1,
    baysZ: 1,
    bayWidth: 1.55,
    bayDepth: 1.42,
    columnHeight: 1.48,
    columnRadius: 0.09,
    baseHeight: 0.2,
    baseOverhang: 0.24,
    eaveOverhang: 0.66,
    roofRise: 0.4,
    roofConcavity: 0.78,
    cornerUpturn: params.roofUpturn * 1.05,
    roof: cell.module === "tower" ? "hip" : "hipGable",
    dougong: true,
    ridgeBeasts: cell.module === "tower",
    walls: true,
    seed: params.seed + cell.x * 71 + cell.z * 97 + 1009,
  });
  collectHallParts(groups, upper, "upper", yaw, cell.worldX, upperY, cell.worldZ, true);
}

function collectHallParts(
  groups: Map<string, PartGroup>,
  parts: readonly NamedPart[],
  tier: "lower" | "upper",
  yaw: number,
  x: number,
  y: number,
  z: number,
  skipSteps: boolean,
): void {
  for (const part of parts) {
    if (skipSteps && part.name === "steps") continue;
    const key = `${tier}_${part.name}`;
    let group = groups.get(key);
    if (!group) {
      const material = TOWN_MATERIALS[part.name];
      group = {
        label: `${tier === "upper" ? "上层重檐" : "下层檐廊"}·${LABELS[part.name] ?? part.name}`,
        meshes: [],
      };
      if (material) {
        group.color = material.color;
        group.surface = {
          type: material.type,
          params: { color: material.color, roughness: material.roughness },
        };
      } else {
        if (part.color) group.color = part.color;
        if (part.surface) group.surface = part.surface;
      }
    }
    const clearanceY = part.name === "ridgeBeasts" ? 0.1 : 0;
    group.meshes.push(transform(part.mesh, { rotate: vec3(0, yaw, 0), translate: vec3(x, y + clearanceY, z) }));
    groups.set(key, group);
  }
}

function connectorMesh(a: Cell, b: Cell, width: number, y: number): Mesh {
  const dx = b.worldX - a.worldX;
  const dz = b.worldZ - a.worldZ;
  const length = Math.hypot(dx, dz);
  return transform(box(length, 0.12, width), {
    rotate: vec3(0, -Math.atan2(dz, dx), 0),
    translate: vec3((a.worldX + b.worldX) * 0.5, y, (a.worldZ + b.worldZ) * 0.5),
  });
}

export function buildChineseTownscaperScene(
  params: Partial<ChineseTownscaperParams> = {},
): ChineseTownscaperScene {
  const p = resolveParams(params);
  const cells = buildCells(p);
  const cellByKey = new Map(cells.map((cell) => [`${cell.x},${cell.z}`, cell]));
  const groups = new Map<string, PartGroup>();
  let doubleEaveCount = 0;

  for (const cell of cells) {
    const doubleEave = cell.module === "tower"
      || hash01(cell.x, cell.z, p.seed + 131) < p.doubleEaveRate * (cell.neighbours > 0 ? 1 : 0.72);
    if (doubleEave) doubleEaveCount++;
    addHall(groups, cell, p, doubleEave);
  }

  const paths: Mesh[] = [];
  const bridges: Mesh[] = [];
  let connectedEdges = 0;
  let bridgeCount = 0;
  for (const cell of cells) {
    for (const [dx, dz] of [[1, 0], [0, 1]] as const) {
      const neighbour = cellByKey.get(`${cell.x + dx},${cell.z + dz}`);
      if (!neighbour) continue;
      connectedEdges++;
      const crossesCanal = p.canalAmount > 0.05
        && Math.abs((cell.worldX + neighbour.worldX) * 0.5 - Math.sin((cell.worldZ + neighbour.worldZ) * 0.11) * p.cellSize * 0.42)
          < p.cellSize * p.canalAmount * 0.75;
      if (crossesCanal) {
        bridges.push(connectorMesh(cell, neighbour, 1.05, 0.24));
        bridgeCount++;
      } else {
        paths.push(connectorMesh(cell, neighbour, 0.62, 0.19));
      }
    }
  }

  const worldSize = p.gridSize * p.cellSize * 3.4;
  const islandHeight = 0.58;
  const parts: NamedPart[] = [
    {
      name: "chinese_townscaper_water",
      label: "水墨湖面",
      mesh: transform(plane(worldSize, worldSize, 96, 96), { translate: vec3(0, -0.54, 0) }),
      color: WATER,
      surface: {
        type: "water",
        params: {
          body: "pond",
          tint: WATER,
          deepColor: DEEP_WATER,
          roughness: 0.12,
          waveAmplitude: p.waterHeight,
          waveScale: 0.34,
          flowSpeed: 0.16,
          foamStrength: 0.12,
          shallowOpacity: 0.68,
          deepOpacity: 0.92,
          seed: p.seed + 3,
        },
      },
      metadata: { cameraFitIgnore: true, castShadow: false, waterLevel: -0.54 },
    },
    {
      name: "chinese_townscaper_shore",
      label: "浅色岛岸",
      mesh: transform(prism(islandOutline(p, 1.04), islandHeight * 0.72), { translate: vec3(0, -0.47, 0) }),
      color: SHORE,
      surface: { type: "sand", params: { color: SHORE, roughness: 0.94, grainScale: 4.2, seed: p.seed + 5 } },
    },
    {
      name: "chinese_townscaper_island",
      label: "草土岛台",
      mesh: transform(prism(islandOutline(p, 1), islandHeight), { translate: vec3(0, -0.29, 0) }),
      color: ISLAND,
      surface: { type: "ground", params: { color: ISLAND, roughness: 0.91, seed: p.seed + 7 } },
      metadata: {
        semanticKey: "chinese-townscaper-island",
        summary: { moduleCount: cells.length, doubleEaveCount, bridgeCount, connectedEdges },
      },
    },
  ];

  if (p.canalAmount > 0.02) {
    const canalMeshes: Mesh[] = [];
    const segments = 9;
    for (let index = 0; index < segments; index++) {
      const z0 = (index / segments - 0.5) * p.gridSize * p.cellSize * 0.86;
      const z1 = ((index + 1) / segments - 0.5) * p.gridSize * p.cellSize * 0.86;
      const x0 = Math.sin(z0 * 0.11 + p.seed * 0.01) * p.cellSize * 0.42;
      const x1 = Math.sin(z1 * 0.11 + p.seed * 0.01) * p.cellSize * 0.42;
      const a: Cell = { x: 0, z: 0, worldX: x0, worldZ: z0, neighbours: 0, module: "pavilion" };
      const b: Cell = { x: 0, z: 0, worldX: x1, worldZ: z1, neighbours: 0, module: "pavilion" };
      canalMeshes.push(connectorMesh(a, b, 0.45 + p.canalAmount * 1.3, 0.045));
    }
    parts.push({
      name: "chinese_townscaper_canals",
      label: "蜿蜒水渠",
      mesh: merge(...canalMeshes),
      color: WATER,
      surface: {
        type: "water",
        params: {
          body: "river",
          tint: WATER,
          deepColor: DEEP_WATER,
          roughness: 0.1,
          transmission: 0.58,
          ior: 1.333,
          opacity: 0.82,
          waveAmplitude: p.waterHeight * 0.35,
          waveScale: 0.26,
          flowSpeed: 0.09,
          foamStrength: 0.05,
          shallowOpacity: 0.7,
          deepOpacity: 0.9,
          seed: p.seed + 11,
        },
      },
    });
  }

  if (paths.length > 0) parts.push({
    name: "chinese_townscaper_paths",
    label: "邻接石板路",
    mesh: merge(...paths),
    color: PATH,
    surface: { type: "stone", params: { color: PATH, roughness: 0.88 } },
  });
  if (bridges.length > 0) parts.push({
    name: "chinese_townscaper_bridges",
    label: "跨渠石桥",
    mesh: merge(...bridges),
    color: BRIDGE,
    surface: { type: "stone", params: { color: BRIDGE, roughness: 0.84 } },
  });

  for (const [key, group] of groups) {
    if (group.meshes.length === 0) continue;
    const part: NamedPart = {
      name: `chinese_townscaper_${key}`,
      label: group.label,
      mesh: merge(...group.meshes),
    };
    if (group.color) part.color = group.color;
    if (group.surface) part.surface = group.surface;
    parts.push(part);
  }

  return {
    parts,
    summary: { moduleCount: cells.length, doubleEaveCount, bridgeCount, connectedEdges },
  };
}

export function buildChineseTownscaperParts(
  params: Partial<ChineseTownscaperParams> = {},
): NamedPart[] {
  return buildChineseTownscaperScene(params).parts;
}
