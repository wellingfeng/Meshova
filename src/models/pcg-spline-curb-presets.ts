import type { NamedPart } from "../geometry/index.js";
import { vec3 } from "../math/vec3.js";
import {
  buildPcgSplineCurb,
  type PcgSplineCurbParams,
  type PcgSplineCurbResult,
} from "./pcg-spline-curb.js";

type RGB = [number, number, number];
type PathPoint = readonly [x: number, y: number, z: number];

export interface PcgSplineCurbPalette {
  road: RGB;
  bed: RGB;
  curb: RGB;
  paver: RGB;
}

export interface PcgSplineCurbPreset {
  id: string;
  name: string;
  description: string;
  tags: readonly string[];
  path: readonly PathPoint[];
  defaults: Partial<Omit<PcgSplineCurbParams, "controlPoints">> & {
    length: number;
    bend: number;
  };
  palette: PcgSplineCurbPalette;
}

export const PCG_SPLINE_CURB_PRESETS: readonly PcgSplineCurbPreset[] = [
  {
    id: "pcg-curb-boulevard",
    name: "双侧林荫弯道",
    description: "宽车行道、双侧花岗岩路缘与规整浅色铺装，适合城市林荫大道。",
    tags: ["林荫大道", "双侧人行道", "花岗岩", "缓弯"],
    path: [
      [-0.5, 0, -0.34],
      [-0.34, 0, -0.36],
      [-0.14, 0, -0.24],
      [0.08, 0, 0.04],
      [0.3, 0, 0.34],
      [0.5, 0, 0.38],
    ],
    defaults: {
      length: 46,
      bend: 8,
      roadWidth: 9.5,
      sidewalkWidth: 3.1,
      curbWidth: 0.42,
      curbHeight: 0.46,
      curbCourses: 2,
      curbBlockLength: 1.05,
      sidewalkTileLength: 1.05,
      sidewalkTileWidth: 0.7,
      sidewalkHeight: 0.13,
      gap: 0.045,
      jitter: 0.018,
      bothSides: true,
      seed: 431,
    },
    palette: {
      road: [0.055, 0.062, 0.07],
      bed: [0.31, 0.32, 0.31],
      curb: [0.47, 0.49, 0.47],
      paver: [0.58, 0.55, 0.48],
    },
  },
  {
    id: "pcg-curb-market-street",
    name: "S 型商业街",
    description: "紧凑 S 弯、暖色砖路缘与密铺人行道，适合步行商业街。",
    tags: ["商业街", "S弯", "红砖", "密铺"],
    path: [
      [-0.5, 0, -0.18],
      [-0.38, 0, -0.38],
      [-0.16, 0, -0.34],
      [0.02, 0, 0.18],
      [0.2, 0, 0.42],
      [0.38, 0, 0.2],
      [0.5, 0, -0.12],
    ],
    defaults: {
      length: 38,
      bend: 9.5,
      roadWidth: 6.2,
      sidewalkWidth: 2.8,
      curbWidth: 0.36,
      curbHeight: 0.56,
      curbCourses: 3,
      curbBlockLength: 0.72,
      sidewalkTileLength: 0.7,
      sidewalkTileWidth: 0.48,
      sidewalkHeight: 0.11,
      gap: 0.05,
      jitter: 0.04,
      bothSides: true,
      seed: 722,
    },
    palette: {
      road: [0.07, 0.065, 0.062],
      bed: [0.24, 0.2, 0.17],
      curb: [0.5, 0.18, 0.1],
      paver: [0.55, 0.31, 0.18],
    },
  },
  {
    id: "pcg-curb-riverside-walk",
    name: "滨河宽步道",
    description: "窄车道配单侧宽步道，沿长样条起伏转折，突出连续滨水铺装带。",
    tags: ["滨河", "宽步道", "单侧路缘", "长曲线"],
    path: [
      [-0.5, 0, -0.28],
      [-0.37, 0.05, -0.4],
      [-0.2, 0.1, -0.24],
      [-0.04, 0.16, 0.08],
      [0.14, 0.1, 0.34],
      [0.32, 0.05, 0.26],
      [0.5, 0, -0.05],
    ],
    defaults: {
      length: 54,
      bend: 12,
      roadWidth: 5.4,
      sidewalkWidth: 4.2,
      curbWidth: 0.45,
      curbHeight: 0.44,
      curbCourses: 2,
      curbBlockLength: 1.15,
      sidewalkTileLength: 1.1,
      sidewalkTileWidth: 0.74,
      sidewalkHeight: 0.14,
      gap: 0.065,
      jitter: 0.025,
      bothSides: false,
      seed: 1203,
    },
    palette: {
      road: [0.065, 0.075, 0.08],
      bed: [0.27, 0.29, 0.27],
      curb: [0.52, 0.54, 0.5],
      paver: [0.5, 0.46, 0.36],
    },
  },
  {
    id: "pcg-curb-civic-crescent",
    name: "市政新月广场",
    description: "大弧新月道路、三层深色路缘与双侧石材铺装，适合公共建筑前场。",
    tags: ["市政广场", "新月弧", "三层路缘", "石材铺装"],
    path: [
      [-0.5, 0, -0.05],
      [-0.42, 0, 0.28],
      [-0.26, 0, 0.58],
      [-0.05, 0, 0.74],
      [0.18, 0, 0.66],
      [0.38, 0, 0.38],
      [0.5, 0, 0],
    ],
    defaults: {
      length: 44,
      bend: 14,
      roadWidth: 8,
      sidewalkWidth: 3.5,
      curbWidth: 0.5,
      curbHeight: 0.68,
      curbCourses: 3,
      curbBlockLength: 0.92,
      sidewalkTileLength: 0.88,
      sidewalkTileWidth: 0.58,
      sidewalkHeight: 0.16,
      gap: 0.04,
      jitter: 0.012,
      bothSides: true,
      seed: 2048,
    },
    palette: {
      road: [0.045, 0.05, 0.055],
      bed: [0.22, 0.23, 0.24],
      curb: [0.3, 0.32, 0.34],
      paver: [0.62, 0.59, 0.52],
    },
  },
] as const;

export function buildPcgSplineCurbPreset(
  presetId: string,
  params: Partial<PcgSplineCurbParams> = {},
): PcgSplineCurbResult {
  const preset = PCG_SPLINE_CURB_PRESETS.find((candidate) => candidate.id === presetId);
  if (!preset) throw new Error(`Unknown PCG spline curb preset: ${presetId}`);
  const merged = { ...preset.defaults, ...params };
  const length = merged.length ?? preset.defaults.length;
  const bend = merged.bend ?? preset.defaults.bend;
  const controlPoints = merged.controlPoints && merged.controlPoints.length >= 2
    ? merged.controlPoints.map((point) => vec3(point.x, point.y, point.z))
    : preset.path.map(([x, y, z]) => vec3(x * length, y, z * bend));
  const result = buildPcgSplineCurb({ ...merged, controlPoints });
  return {
    ...result,
    parts: recolorParts(result.parts, preset),
  };
}

export function buildPcgSplineCurbPresetParts(
  presetId: string,
  params: Partial<PcgSplineCurbParams> = {},
): NamedPart[] {
  return buildPcgSplineCurbPreset(presetId, params).parts;
}

function recolorParts(
  parts: readonly NamedPart[],
  preset: PcgSplineCurbPreset,
): NamedPart[] {
  return parts.map((part) => {
    const color = colorForPart(part.name, preset.palette);
    return {
      ...part,
      color,
      ...(part.surface
        ? {
            surface: {
              ...part.surface,
              type: usesPaletteSurface(part.name) ? "concrete" : part.surface.type,
              params: { ...part.surface.params, color },
            },
          }
        : {}),
      metadata: {
        ...part.metadata,
        presetId: preset.id,
        presetName: preset.name,
      },
    };
  });
}

function usesPaletteSurface(name: string): boolean {
  return name === "curb_courses" || name === "curb_caps" || name === "sidewalk_pavers";
}

function colorForPart(name: string, palette: PcgSplineCurbPalette): RGB {
  if (name === "road_surface") return palette.road;
  if (name === "sidewalk_bed") return palette.bed;
  if (name === "sidewalk_pavers") return palette.paver;
  return palette.curb;
}
