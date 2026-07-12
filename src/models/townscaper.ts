import { vec2 } from "../math/vec2.js";
import { vec3 } from "../math/vec3.js";
import {
  archway,
  box,
  computeNormals,
  cylinder,
  makeMesh,
  merge,
  plane,
  prism,
  transform,
  type Mesh,
  type NamedPart,
  type PartSurfaceRef,
} from "../geometry/index.js";

type RGB = [number, number, number];

interface PointXZ {
  x: number;
  z: number;
}

interface TownPalette {
  name: string;
  walls: readonly RGB[];
  roof: RGB;
  trim: RGB;
  windows: RGB;
  doors: RGB;
}

export interface TownscaperParams {
  gridSize: number;
  cellSize: number;
  density: number;
  maxFloors: number;
  floorHeight: number;
  irregularity: number;
  canalWidth: number;
  archDensity: number;
  roofPitch: number;
  palette: number;
  waveHeight: number;
  seed: number;
}

export interface TownscaperSummary {
  occupiedCells: number;
  maxHeight: number;
  bridgeCount: number;
  archCount: number;
  windowCount: number;
}

export interface TownscaperScene {
  parts: NamedPart[];
  summary: TownscaperSummary;
}

export const TOWNSCAPER_DEFAULTS: TownscaperParams = {
  gridSize: 13,
  cellSize: 2.4,
  density: 0.7,
  maxFloors: 6,
  floorHeight: 1.65,
  irregularity: 0.48,
  canalWidth: 0.62,
  archDensity: 0.58,
  roofPitch: 0.58,
  palette: 0,
  waveHeight: 0.035,
  seed: 684,
};

const PALETTES: readonly TownPalette[] = [
  {
    name: "海港粉彩",
    walls: [
      [0.86, 0.24, 0.22],
      [0.96, 0.56, 0.18],
      [0.96, 0.79, 0.34],
      [0.36, 0.7, 0.64],
      [0.27, 0.52, 0.73],
      [0.72, 0.4, 0.66],
      [0.9, 0.66, 0.62],
    ],
    roof: [0.58, 0.15, 0.08],
    trim: [0.93, 0.86, 0.66],
    windows: [0.045, 0.13, 0.18],
    doors: [0.18, 0.09, 0.055],
  },
  {
    name: "北海明彩",
    walls: [
      [0.75, 0.14, 0.12],
      [0.91, 0.54, 0.08],
      [0.9, 0.78, 0.52],
      [0.16, 0.46, 0.52],
      [0.13, 0.31, 0.52],
      [0.42, 0.2, 0.43],
      [0.68, 0.38, 0.3],
    ],
    roof: [0.34, 0.11, 0.075],
    trim: [0.88, 0.83, 0.7],
    windows: [0.035, 0.08, 0.12],
    doors: [0.12, 0.075, 0.05],
  },
  {
    name: "地中海柔彩",
    walls: [
      [0.83, 0.4, 0.28],
      [0.92, 0.66, 0.3],
      [0.87, 0.79, 0.58],
      [0.35, 0.62, 0.57],
      [0.35, 0.52, 0.68],
      [0.61, 0.42, 0.58],
      [0.79, 0.58, 0.49],
    ],
    roof: [0.55, 0.2, 0.1],
    trim: [0.92, 0.85, 0.69],
    windows: [0.055, 0.14, 0.16],
    doors: [0.22, 0.12, 0.07],
  },
];

const WATER: RGB = [0.055, 0.48, 0.58];
const DEEP_WATER: RGB = [0.012, 0.16, 0.25];
const SEABED: RGB = [0.12, 0.32, 0.32];
const FOUNDATION: RGB = [0.22, 0.19, 0.16];

const surface = (type: string, color: RGB, params: Record<string, unknown> = {}): PartSurfaceRef => ({
  type,
  params: { color, ...params },
});

function resolveParams(params: Partial<TownscaperParams>): TownscaperParams {
  const merged = { ...TOWNSCAPER_DEFAULTS, ...params };
  return {
    gridSize: clampInt(merged.gridSize, 7, 22),
    cellSize: clamp(merged.cellSize, 1.4, 4),
    density: clamp(merged.density, 0.28, 0.96),
    maxFloors: clampInt(merged.maxFloors, 2, 10),
    floorHeight: clamp(merged.floorHeight, 1.1, 2.4),
    irregularity: clamp(merged.irregularity, 0, 1),
    canalWidth: clamp(merged.canalWidth, 0, 1.35),
    archDensity: clamp(merged.archDensity, 0, 1),
    roofPitch: clamp(merged.roofPitch, 0.1, 1.1),
    palette: clampInt(merged.palette, 0, PALETTES.length - 1),
    waveHeight: clamp(merged.waveHeight, 0.01, 0.2),
    seed: Math.round(merged.seed) >>> 0,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function hash01(x: number, z: number, seed: number): number {
  let value = Math.imul((x + 0x7f4a7c15) | 0, 0x45d9f3b);
  value ^= Math.imul((z + 0x165667b1) | 0, 0x119de1f3);
  value ^= seed | 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function buildOrganicGrid(params: TownscaperParams): PointXZ[][] {
  const size = params.gridSize;
  const half = size / 2;
  const phaseX = hash01(3, 7, params.seed) * Math.PI * 2;
  const phaseZ = hash01(11, 5, params.seed) * Math.PI * 2;
  let points = Array.from({ length: size + 1 }, (_, z) => Array.from({ length: size + 1 }, (_, x) => {
    const baseX = (x - half) * params.cellSize;
    const baseZ = (z - half) * params.cellSize;
    const radius = Math.hypot(baseX, baseZ) / Math.max(1, size * params.cellSize);
    const angle = params.irregularity * 0.18 * Math.sin(radius * 9 + phaseX);
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const warpedX = baseX * cosine - baseZ * sine;
    const warpedZ = baseX * sine + baseZ * cosine;
    const jitter = params.cellSize * params.irregularity * 0.23;
    const dx = (hash01(x, z, params.seed + 17) - 0.5) * jitter
      + Math.sin(z * 0.72 + phaseX) * jitter * 0.34;
    const dz = (hash01(x, z, params.seed + 41) - 0.5) * jitter
      + Math.sin(x * 0.66 + phaseZ) * jitter * 0.34;
    return { x: warpedX + dx, z: warpedZ + dz };
  }));

  for (let iteration = 0; iteration < 3; iteration++) {
    points = points.map((row, z) => row.map((point, x) => {
      if (x === 0 || z === 0 || x === size || z === size) return point;
      const average = [points[z]![x - 1]!, points[z]![x + 1]!, points[z - 1]![x]!, points[z + 1]![x]!]
        .reduce((sum, current) => ({ x: sum.x + current.x * 0.25, z: sum.z + current.z * 0.25 }), { x: 0, z: 0 });
      const pull = 0.16 + params.irregularity * 0.08;
      return {
        x: point.x + (average.x - point.x) * pull,
        z: point.z + (average.z - point.z) * pull,
      };
    }));
  }
  return points;
}

function buildHeights(params: TownscaperParams): number[][] {
  const size = params.gridSize;
  const half = (size - 1) * 0.5;
  const phase = hash01(19, 23, params.seed) * Math.PI * 2;
  const heights = Array.from({ length: size }, (_, z) => Array.from({ length: size }, (_, x) => {
    const nx = (x - half) / Math.max(1, half);
    const nz = (z - half) / Math.max(1, half);
    const angle = Math.atan2(nz, nx);
    const radial = Math.hypot(nx * 0.9, nz * 1.08);
    const coastline = 0.7 + params.density * 0.34
      + Math.sin(angle * 3 + phase) * 0.08
      + Math.sin((x + z) * 0.72 + phase) * 0.035;
    const noise = hash01(x, z, params.seed + 101);
    if (radial > coastline + (noise - 0.5) * 0.24) return 0;

    const canalCenter = Math.sin((z - half) * 0.58 + phase) * (0.45 + size * 0.035);
    if (params.canalWidth > 0 && Math.abs((x - half) - canalCenter) < params.canalWidth) return 0;

    const centerLift = clamp(1 - radial / Math.max(0.35, coastline), 0, 1);
    const variation = hash01(x * 3 + 5, z * 5 + 7, params.seed + 211);
    return clampInt(1 + centerLift * (params.maxFloors - 1) * 0.74 + variation * params.maxFloors * 0.42, 1, params.maxFloors);
  }));

  for (let iteration = 0; iteration < 2; iteration++) {
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        if (heights[z]![x] === 0) continue;
        const neighbours = [heightAt(heights, x - 1, z), heightAt(heights, x + 1, z), heightAt(heights, x, z - 1), heightAt(heights, x, z + 1)];
        const maxNeighbour = Math.max(...neighbours);
        heights[z]![x] = Math.min(heights[z]![x]!, maxNeighbour + 2);
      }
    }
  }
  return heights;
}

function heightAt(heights: readonly (readonly number[])[], x: number, z: number): number {
  return heights[z]?.[x] ?? 0;
}

function cellCorners(grid: readonly (readonly PointXZ[])[], x: number, z: number): PointXZ[] {
  return [grid[z]![x]!, grid[z + 1]![x]!, grid[z + 1]![x + 1]!, grid[z]![x + 1]!];
}

function roundedOutline(corners: readonly PointXZ[], amount: number): PointXZ[] {
  const output: PointXZ[] = [];
  const inset = clamp(amount, 0.03, 0.34);
  for (let index = 0; index < corners.length; index++) {
    const previous = corners[(index + corners.length - 1) % corners.length]!;
    const current = corners[index]!;
    const next = corners[(index + 1) % corners.length]!;
    const start = lerpPoint(current, previous, inset);
    const end = lerpPoint(current, next, inset);
    for (let step = 0; step < 3; step++) {
      const t = step / 2;
      const inverse = 1 - t;
      output.push({
        x: inverse * inverse * start.x + 2 * inverse * t * current.x + t * t * end.x,
        z: inverse * inverse * start.z + 2 * inverse * t * current.z + t * t * end.z,
      });
    }
  }
  return output;
}

function lerpPoint(a: PointXZ, b: PointXZ, t: number): PointXZ {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

function centroid(points: readonly PointXZ[]): PointXZ {
  const total = points.reduce((sum, point) => ({ x: sum.x + point.x, z: sum.z + point.z }), { x: 0, z: 0 });
  return { x: total.x / points.length, z: total.z / points.length };
}

function bodyMesh(outline: readonly PointXZ[], height: number): Mesh {
  return transform(prism(outline.map((point) => vec2(point.x, point.z)), height), {
    translate: vec3(0, height * 0.5, 0),
  });
}

function hipRoofMesh(outline: readonly PointXZ[], baseY: number, pitch: number): Mesh {
  const center = centroid(outline);
  const inner = outline.map((point) => lerpPoint(center, point, 0.13));
  const positions = [
    ...outline.map((point) => vec3(point.x, baseY, point.z)),
    ...inner.map((point) => vec3(point.x, baseY + pitch, point.z)),
    vec3(center.x, baseY + pitch * 1.04, center.z),
  ];
  const normals = positions.map(() => vec3(0, 0, 0));
  const uvs = positions.map((position) => vec2(position.x * 0.2, position.z * 0.2));
  const indices: number[] = [];
  const count = outline.length;
  for (let index = 0; index < count; index++) {
    const next = (index + 1) % count;
    indices.push(index, next, count + next, index, count + next, count + index);
    indices.push(count * 2, count + index, count + next);
  }
  return computeNormals(makeMesh({ positions, normals, uvs, indices }), 58);
}

function edgeTransform(a: PointXZ, b: PointXZ, outward: number): {
  center: PointXZ;
  length: number;
  yaw: number;
} {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz) || 1;
  return {
    center: {
      x: (a.x + b.x) * 0.5 + (-dz / length) * outward,
      z: (a.z + b.z) * 0.5 + (dx / length) * outward,
    },
    length,
    yaw: -Math.atan2(dz, dx),
  };
}

function facadeBox(a: PointXZ, b: PointXZ, width: number, height: number, depth: number, y: number, outward: number): Mesh {
  const placement = edgeTransform(a, b, outward);
  return transform(box(Math.min(width, placement.length * 0.76), height, depth), {
    rotate: vec3(0, placement.yaw, 0),
    translate: vec3(placement.center.x, y, placement.center.z),
  });
}

function archTrim(a: PointXZ, b: PointXZ, floorHeight: number, outward: number): Mesh {
  const placement = edgeTransform(a, b, outward);
  const span = Math.min(placement.length * 0.48, floorHeight * 0.72);
  const arch = archway({
    span,
    pierHeight: floorHeight * 0.42,
    pierWidth: floorHeight * 0.11,
    depth: 0.1,
    ringThickness: floorHeight * 0.1,
    segments: 12,
    keystone: true,
  });
  return transform(arch, {
    rotate: vec3(0, placement.yaw, 0),
    translate: vec3(placement.center.x, 0.05, placement.center.z),
  });
}

function bridgeMesh(a: PointXZ, b: PointXZ, width: number, floorHeight: number, level: number): Mesh {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz) + width * 0.55;
  const yaw = -Math.atan2(dz, dx);
  const height = floorHeight * 0.72;
  return transform(box(length, height, width), {
    rotate: vec3(0, yaw, 0),
    translate: vec3((a.x + b.x) * 0.5, level * floorHeight + height * 0.5, (a.z + b.z) * 0.5),
  });
}

function bridgeRoofMesh(a: PointXZ, b: PointXZ, width: number, y: number): Mesh {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz) + width * 0.55;
  return transform(box(length * 1.03, 0.16, width * 1.12), {
    rotate: vec3(0, -Math.atan2(dz, dx), 0),
    translate: vec3((a.x + b.x) * 0.5, y, (a.z + b.z) * 0.5),
  });
}

export function buildTownscaperScene(params: Partial<TownscaperParams> = {}): TownscaperScene {
  const p = resolveParams(params);
  const grid = buildOrganicGrid(p);
  const heights = buildHeights(p);
  const palette = PALETTES[p.palette]!;
  const rounded = p.cellSize * (0.055 + p.irregularity * 0.035);
  const wallGroups: Mesh[][] = palette.walls.map(() => []);
  const roofs: Mesh[] = [];
  const windows: Mesh[] = [];
  const shutters: Mesh[] = [];
  const doors: Mesh[] = [];
  const trims: Mesh[] = [];
  const chimneys: Mesh[] = [];
  const piers: Mesh[] = [];
  const bridgeBodies: Mesh[] = [];
  const bridgeRoofs: Mesh[] = [];
  const pierKeys = new Set<string>();
  let occupiedCells = 0;
  let maxHeight = 0;
  let archCount = 0;
  let windowCount = 0;

  const neighbours = [
    { dx: -1, dz: 0 },
    { dx: 0, dz: 1 },
    { dx: 1, dz: 0 },
    { dx: 0, dz: -1 },
  ];

  for (let z = 0; z < p.gridSize; z++) {
    for (let x = 0; x < p.gridSize; x++) {
      const floors = heights[z]![x]!;
      if (floors === 0) continue;
      occupiedCells++;
      maxHeight = Math.max(maxHeight, floors);
      const corners = cellCorners(grid, x, z);
      const outline = roundedOutline(corners, rounded / p.cellSize);
      const wallIndex = Math.floor(hash01(x, z, p.seed + 301) * palette.walls.length) % palette.walls.length;
      wallGroups[wallIndex]!.push(bodyMesh(outline, floors * p.floorHeight));
      roofs.push(hipRoofMesh(outline, floors * p.floorHeight + 0.015, p.roofPitch));

      if (hash01(x, z, p.seed + 401) > 0.7) {
        const center = centroid(outline);
        chimneys.push(transform(box(0.24, 0.72, 0.24), {
          translate: vec3(center.x + p.cellSize * 0.18, floors * p.floorHeight + p.roofPitch * 0.72, center.z - p.cellSize * 0.12),
        }));
      }

      for (let side = 0; side < 4; side++) {
        const neighbour = neighbours[side]!;
        const neighbourHeight = heightAt(heights, x + neighbour.dx, z + neighbour.dz);
        if (neighbourHeight >= floors) continue;
        const a = corners[side]!;
        const b = corners[(side + 1) % 4]!;
        const outward = 0.035;
        for (let floor = Math.max(1, neighbourHeight + 1); floor <= floors; floor++) {
          const centerY = (floor - 0.48) * p.floorHeight;
          const isGroundArch = floor === 1 && hash01(x * 7 + side, z * 11 + floor, p.seed + 503) < p.archDensity;
          if (isGroundArch) {
            doors.push(facadeBox(a, b, p.cellSize * 0.48, p.floorHeight * 0.68, 0.07, p.floorHeight * 0.35, outward + 0.018));
            trims.push(archTrim(a, b, p.floorHeight, outward + 0.07));
            archCount++;
            continue;
          }
          const windowWidth = p.cellSize * (0.24 + hash01(x + floor, z + side, p.seed + 601) * 0.08);
          windows.push(facadeBox(a, b, windowWidth, p.floorHeight * 0.33, 0.065, centerY, outward + 0.02));
          shutters.push(facadeBox(a, b, windowWidth * 1.42, p.floorHeight * 0.42, 0.035, centerY, outward + 0.01));
          windowCount++;
        }

        if (neighbourHeight === 0) {
          for (const corner of [a, b]) {
            const key = `${Math.round(corner.x * 100)},${Math.round(corner.z * 100)}`;
            if (pierKeys.has(key)) continue;
            pierKeys.add(key);
            piers.push(transform(cylinder(0.11, 0.82, 8), { translate: vec3(corner.x, -0.31, corner.z) }));
          }
        }
      }
    }
  }

  let bridgeCount = 0;
  for (let z = 1; z < p.gridSize - 1; z++) {
    for (let x = 1; x < p.gridSize - 1; x++) {
      if (heights[z]![x] !== 0) continue;
      const horizontal = Math.min(heightAt(heights, x - 1, z), heightAt(heights, x + 1, z));
      const vertical = Math.min(heightAt(heights, x, z - 1), heightAt(heights, x, z + 1));
      const orientation = horizontal >= 2 ? "horizontal" : vertical >= 2 ? "vertical" : null;
      if (!orientation || hash01(x, z, p.seed + 701) > p.archDensity) continue;
      const startCell = orientation === "horizontal" ? [x - 1, z] : [x, z - 1];
      const endCell = orientation === "horizontal" ? [x + 1, z] : [x, z + 1];
      const start = centroid(cellCorners(grid, startCell[0]!, startCell[1]!));
      const end = centroid(cellCorners(grid, endCell[0]!, endCell[1]!));
      const level = Math.max(1, Math.min(horizontal || vertical, 3) - 1);
      const width = p.cellSize * 0.68;
      bridgeBodies.push(bridgeMesh(start, end, width, p.floorHeight, level));
      bridgeRoofs.push(bridgeRoofMesh(start, end, width, level * p.floorHeight + p.floorHeight * 0.77));
      bridgeCount++;
    }
  }

  const parts: NamedPart[] = [
    {
      name: "townscaper_seabed",
      label: "港湾海床",
      mesh: transform(plane(p.gridSize * p.cellSize * 10.2, p.gridSize * p.cellSize * 10.2, 2, 2), { translate: vec3(0, -2.6, 0) }),
      color: SEABED,
      surface: surface("sand", SEABED, { roughness: 0.96, grainScale: 5, seed: p.seed + 3 }),
      metadata: { cameraFitIgnore: true, castShadow: false },
    },
    {
      name: "townscaper_water",
      label: "程序化港湾水体",
      mesh: transform(plane(p.gridSize * p.cellSize * 10, p.gridSize * p.cellSize * 10, 96, 96), { translate: vec3(0, -0.68, 0) }),
      color: WATER,
      surface: {
        type: "water",
        params: {
          body: "ocean",
          tint: WATER,
          deepColor: DEEP_WATER,
          roughness: 0.08,
          waveAmplitude: p.waveHeight,
          waveScale: 0.28,
          flowSpeed: 0.26,
          foamStrength: 0.22,
          shallowOpacity: 0.62,
          deepOpacity: 0.94,
          seed: p.seed + 5,
        },
      },
      metadata: {
        waterLevel: -0.68,
        waterSystem: "townscaper-harbour",
        cameraFitIgnore: true,
        castShadow: false,
        style: "Townscaper-inspired procedural harbour",
        summary: { occupiedCells, maxHeight, bridgeCount, archCount, windowCount },
      },
    },
  ];

  for (let index = 0; index < wallGroups.length; index++) {
    if (wallGroups[index]!.length === 0) continue;
    const color = palette.walls[index]!;
    parts.push({
      name: `townscaper_walls_${index + 1}`,
      label: `${palette.name}·彩色灰泥墙${index + 1}`,
      mesh: merge(...wallGroups[index]!),
      color,
      surface: surface("stylizedPlaster", color, { roughness: 0.82, grainScale: 3.2, seed: p.seed + 31 + index }),
      metadata: { semanticKey: "painted-building-mass", palette: palette.name },
    });
  }
  pushMerged(parts, "townscaper_roofs", "联动陶瓦屋顶", roofs, palette.roof, surface("terracottaRoof", palette.roof, { roughness: 0.78, seed: p.seed + 43 }));
  pushMerged(parts, "townscaper_window_shutters", "窗框与百叶", shutters, palette.trim, surface("lacqueredWood", palette.trim, { roughness: 0.7, seed: p.seed + 47 }));
  pushMerged(parts, "townscaper_windows", "深色窗玻璃", windows, palette.windows, surface("glass", palette.windows, { roughness: 0.22, opacity: 0.92 }));
  pushMerged(parts, "townscaper_doors", "拱门暗部与木门", doors, palette.doors, surface("lacqueredWood", palette.doors, { roughness: 0.76 }));
  pushMerged(parts, "townscaper_arch_trims", "自动拱券与门套", trims, palette.trim, surface("ceramic", palette.trim, { roughness: 0.64 }));
  pushMerged(parts, "townscaper_chimneys", "屋顶烟囱", chimneys, palette.trim, surface("stone", palette.trim, { roughness: 0.86 }));
  pushMerged(parts, "townscaper_foundation_piers", "临水支柱", piers, FOUNDATION, surface("wetGround", FOUNDATION, { roughness: 0.92, wetness: 0.48 }));
  pushMerged(parts, "townscaper_bridges", "跨水连廊", bridgeBodies, palette.walls[1]!, surface("stylizedPlaster", palette.walls[1]!, { roughness: 0.82, seed: p.seed + 59 }));
  pushMerged(parts, "townscaper_bridge_roofs", "连廊陶瓦顶", bridgeRoofs, palette.roof, surface("terracottaRoof", palette.roof, { roughness: 0.78, seed: p.seed + 61 }));

  return {
    parts,
    summary: { occupiedCells, maxHeight, bridgeCount, archCount, windowCount },
  };
}

function pushMerged(
  parts: NamedPart[],
  name: string,
  label: string,
  meshes: readonly Mesh[],
  color: RGB,
  surfaceRef: PartSurfaceRef,
): void {
  if (meshes.length === 0) return;
  parts.push({ name, label, mesh: merge(...meshes), color, surface: surfaceRef });
}

export function buildTownscaperParts(params: Partial<TownscaperParams> = {}): NamedPart[] {
  return buildTownscaperScene(params).parts;
}
