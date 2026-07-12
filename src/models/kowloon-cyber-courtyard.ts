/** Dense Kowloon cyber courtyard assembled from inward-facing street houses. */
import { vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  bounds,
  box,
  cylinder,
  merge,
  transform,
  triangleCount,
  type Mesh,
  type NamedPart,
  type PartSurfaceRef,
} from "../geometry/index.js";
import { buildHongKongCyberHouseParts } from "./hong-kong-cyber-house.js";

type RGB = [number, number, number];

export interface KowloonCyberCourtyardParams {
  floors: number;
  courtyardWidth: number;
  courtyardDepth: number;
  buildingDepth: number;
  floorHeight: number;
  alleyWidth: number;
  signDensity: number;
  neonAmount: number;
  utilityDensity: number;
  wetness: number;
  rainAmount: number;
  seed: number;
}

export interface KowloonCyberCourtyardSummary {
  parts: number;
  triangles: number;
  height: number;
  footprintWidth: number;
  footprintDepth: number;
  courtyardArea: number;
}

export const KOWLOON_CYBER_COURTYARD_DEFAULTS: KowloonCyberCourtyardParams = {
  floors: 10,
  courtyardWidth: 8.2,
  courtyardDepth: 10.6,
  buildingDepth: 4.4,
  floorHeight: 0.9,
  alleyWidth: 1.35,
  signDensity: 0.94,
  neonAmount: 1,
  utilityDensity: 0.9,
  wetness: 0.95,
  rainAmount: 0.72,
  seed: 113,
};

const COLORS = {
  asphalt: [0.018, 0.024, 0.034] as RGB,
  concrete: [0.12, 0.14, 0.17] as RGB,
  water: [0.025, 0.09, 0.14] as RGB,
  drain: [0.035, 0.045, 0.055] as RGB,
  cable: [0.025, 0.03, 0.04] as RGB,
  rain: [0.28, 0.52, 0.72] as RGB,
  cyan: [0.02, 0.9, 0.95] as RGB,
  magenta: [1, 0.04, 0.48] as RGB,
  amber: [1, 0.46, 0.03] as RGB,
  violet: [0.52, 0.12, 1] as RGB,
};

const SIDES = [
  { key: "north", label: "北侧", yaw: 0, axis: "z", sign: -1 },
  { key: "south", label: "南侧", yaw: Math.PI, axis: "z", sign: 1 },
  { key: "west", label: "西侧", yaw: Math.PI / 2, axis: "x", sign: -1 },
  { key: "east", label: "东侧", yaw: -Math.PI / 2, axis: "x", sign: 1 },
] as const;

export function buildKowloonCyberCourtyardParts(
  params: Partial<KowloonCyberCourtyardParams> = {},
): NamedPart[] {
  const p = normalizeParams(params);
  const rng = makeRng(p.seed >>> 0);
  const parts: NamedPart[] = [];
  const northSouthWidth = Math.max(3.6, p.courtyardWidth - p.alleyWidth);
  const eastWestWidth = Math.max(3.6, p.courtyardDepth - p.alleyWidth);

  for (let index = 0; index < SIDES.length; index++) {
    const side = SIDES[index]!;
    const facadeWidth = side.axis === "z" ? northSouthWidth : eastWestWidth;
    const sideFloors = Math.max(3, p.floors + rng.int(-1, 2));
    const childParts = buildHongKongCyberHouseParts({
      floors: sideFloors,
      width: facadeWidth,
      depth: p.buildingDepth,
      floorHeight: p.floorHeight,
      bays: Math.max(3, Math.round(facadeWidth / 1.55)),
      signDensity: p.signDensity,
      neonAmount: p.neonAmount,
      balconyDepth: Math.min(0.72, p.buildingDepth * 0.16),
      utilityDensity: p.utilityDensity,
      seed: p.seed + index * 101,
    });
    const offset = side.axis === "z"
      ? vec3(rng.range(-0.22, 0.22), 0, side.sign * (p.courtyardDepth + p.buildingDepth) / 2)
      : vec3(side.sign * (p.courtyardWidth + p.buildingDepth) / 2, 0, rng.range(-0.22, 0.22));
    for (const part of childParts) {
      if (part.name === "sidewalk" || part.name === "street") continue;
      parts.push({
        ...part,
        name: `${side.key}_${part.name}`,
        label: `${side.label}${part.label || part.name}`,
        mesh: transform(part.mesh, { rotate: vec3(0, side.yaw, 0), translate: offset }),
        metadata: {
          ...part.metadata,
          style: "九龙城围合赛博天井",
          courtyardSide: side.key,
        },
      });
    }
  }

  addCourtyard(parts, p, rng.fork());
  addAlleyThresholds(parts, p);
  addOverheadServices(parts, p, rng.fork());
  addRain(parts, p, rng.fork());
  return parts;
}

export function summarizeKowloonCyberCourtyard(
  parts: NamedPart[],
  params: Partial<KowloonCyberCourtyardParams> = {},
): KowloonCyberCourtyardSummary {
  const p = normalizeParams(params);
  const combined = merge(...parts.map((part) => part.mesh));
  const modelBounds = bounds(combined);
  return {
    parts: parts.length,
    triangles: parts.reduce((sum, part) => sum + triangleCount(part.mesh), 0),
    height: modelBounds.max.y - modelBounds.min.y,
    footprintWidth: modelBounds.max.x - modelBounds.min.x,
    footprintDepth: modelBounds.max.z - modelBounds.min.z,
    courtyardArea: p.courtyardWidth * p.courtyardDepth,
  };
}

function addCourtyard(
  parts: NamedPart[],
  p: KowloonCyberCourtyardParams,
  rng: ReturnType<typeof makeRng>,
): void {
  parts.push(part(
    "courtyard_floor",
    "中央潮湿天井",
    transform(box(p.courtyardWidth, 0.08, p.courtyardDepth), { translate: vec3(0, -0.04, 0) }),
    COLORS.asphalt,
    { type: "asphalt", params: { color: COLORS.asphalt, roughness: 0.12 + (1 - p.wetness) * 0.5, seed: p.seed } },
  ));

  const puddles: Mesh[] = [];
  const reflectionGroups: Mesh[][] = [[], [], [], []];
  const reflectionColors = [COLORS.cyan, COLORS.magenta, COLORS.amber, COLORS.violet];
  const puddleCount = Math.max(2, Math.round(14 * p.wetness));
  for (let index = 0; index < puddleCount; index++) {
    const radius = rng.range(0.3, 1.15);
    const puddle = transform(cylinder(radius, 0.012, 18, true), {
      scale: vec3(rng.range(0.55, 1.5), 1, rng.range(0.38, 0.88)),
      translate: vec3(
        rng.range(-p.courtyardWidth * 0.42, p.courtyardWidth * 0.42),
        0.008,
        rng.range(-p.courtyardDepth * 0.42, p.courtyardDepth * 0.42),
      ),
    });
    puddles.push(puddle);
    if (index < Math.round(puddleCount * p.neonAmount)) {
      const colorIndex = index % reflectionColors.length;
      reflectionGroups[colorIndex]!.push(transform(box(rng.range(0.025, 0.06), 0.006, radius * rng.range(0.9, 2.1)), {
        rotate: vec3(0, rng.range(-0.5, 0.5), 0),
        translate: vec3(
          rng.range(-p.courtyardWidth * 0.38, p.courtyardWidth * 0.38),
          0.018,
          rng.range(-p.courtyardDepth * 0.38, p.courtyardDepth * 0.38),
        ),
      }));
    }
  }
  parts.push(part(
    "courtyard_puddles",
    "天井积水",
    merge(...puddles),
    COLORS.water,
    { type: "glass", params: { tint: COLORS.water, roughness: 0.035 } },
  ));
  for (let index = 0; index < reflectionGroups.length; index++) {
    const reflections = reflectionGroups[index]!;
    if (!reflections.length) continue;
    const color = reflectionColors[index]!;
    parts.push(part(
      `neon_reflections_${index + 1}`,
      `积水霓虹倒影${index + 1}`,
      merge(...reflections),
      color,
      { type: "neon", params: { color, intensity: 1.6 + p.neonAmount * 1.8 } },
    ));
  }

  const drains: Mesh[] = [];
  for (let index = -3; index <= 3; index++) {
    drains.push(transform(box(0.035, 0.018, p.courtyardDepth * 0.62), {
      translate: vec3(-p.courtyardWidth * 0.32 + index * 0.055, 0.006, 0),
    }));
  }
  parts.push(part(
    "courtyard_drain",
    "天井排水沟",
    merge(...drains),
    COLORS.drain,
    { type: "metal", params: { color: COLORS.drain, roughness: 0.48 } },
  ));
}

function addAlleyThresholds(parts: NamedPart[], p: KowloonCyberCourtyardParams): void {
  const alleyDepth = p.buildingDepth * 1.05;
  const meshes = [
    transform(box(p.alleyWidth, 0.055, alleyDepth), { translate: vec3(0, -0.015, (p.courtyardDepth + alleyDepth) / 2) }),
    transform(box(p.alleyWidth, 0.055, alleyDepth), { translate: vec3(0, -0.015, -(p.courtyardDepth + alleyDepth) / 2) }),
    transform(box(alleyDepth, 0.055, p.alleyWidth), { translate: vec3((p.courtyardWidth + alleyDepth) / 2, -0.015, 0) }),
    transform(box(alleyDepth, 0.055, p.alleyWidth), { translate: vec3(-(p.courtyardWidth + alleyDepth) / 2, -0.015, 0) }),
  ];
  parts.push(part(
    "narrow_alleys",
    "通向天井的窄巷",
    merge(...meshes),
    COLORS.asphalt,
    { type: "asphalt", params: { color: COLORS.asphalt, roughness: 0.18, seed: p.seed + 17 } },
  ));
}

function addOverheadServices(
  parts: NamedPart[],
  p: KowloonCyberCourtyardParams,
  rng: ReturnType<typeof makeRng>,
): void {
  const wires: Mesh[] = [];
  const lampGroups: Mesh[][] = [[], [], []];
  const colors = [COLORS.cyan, COLORS.magenta, COLORS.amber];
  const top = p.floorHeight * Math.max(4, p.floors * 0.72);
  for (let index = 0; index < 18; index++) {
    const acrossX = index % 2 === 0;
    const y = rng.range(p.floorHeight * 1.4, top);
    const lateral = acrossX
      ? rng.range(-p.courtyardDepth * 0.44, p.courtyardDepth * 0.44)
      : rng.range(-p.courtyardWidth * 0.44, p.courtyardWidth * 0.44);
    const length = acrossX ? p.courtyardWidth * 1.06 : p.courtyardDepth * 1.06;
    wires.push(transform(cylinder(0.012, length, 7, true), {
      rotate: acrossX ? vec3(0, 0, Math.PI / 2) : vec3(Math.PI / 2, 0, 0),
      translate: acrossX ? vec3(0, y, lateral) : vec3(lateral, y, 0),
    }));
    if (index % 3 === 0) {
      const colorIndex = (index / 3) % colors.length;
      lampGroups[colorIndex]!.push(transform(box(0.16, 0.08, 0.08), {
        translate: acrossX ? vec3(rng.range(-2, 2), y - 0.08, lateral) : vec3(lateral, y - 0.08, rng.range(-2, 2)),
      }));
    }
  }
  parts.push(part(
    "overhead_cables",
    "天井上空线缆",
    merge(...wires),
    COLORS.cable,
    { type: "rubber", params: { color: COLORS.cable, roughness: 0.78 } },
  ));
  for (let index = 0; index < lampGroups.length; index++) {
    const lamps = lampGroups[index]!;
    if (!lamps.length) continue;
    const color = colors[index]!;
    parts.push(part(`courtyard_lamps_${index + 1}`, `天井悬挂灯${index + 1}`, merge(...lamps), color, neon(color, 3.4)));
  }
}

function addRain(
  parts: NamedPart[],
  p: KowloonCyberCourtyardParams,
  rng: ReturnType<typeof makeRng>,
): void {
  const streaks: Mesh[] = [];
  const count = Math.round(150 * p.rainAmount);
  const maxY = p.floorHeight * (p.floors + 1);
  for (let index = 0; index < count; index++) {
    const length = rng.range(0.18, 0.62);
    streaks.push(transform(box(0.009, length, 0.009), {
      rotate: vec3(0, 0, -0.09),
      translate: vec3(
        rng.range(-p.courtyardWidth * 0.48, p.courtyardWidth * 0.48),
        rng.range(0.3, maxY),
        rng.range(-p.courtyardDepth * 0.48, p.courtyardDepth * 0.48),
      ),
    }));
  }
  if (streaks.length) {
    parts.push(part(
      "rain_streaks",
      "天井雨丝",
      merge(...streaks),
      COLORS.rain,
      { type: "glass", params: { tint: COLORS.rain, roughness: 0.02 } },
    ));
  }
}

function part(
  name: string,
  label: string,
  mesh: Mesh,
  color: RGB,
  surface: PartSurfaceRef,
): NamedPart {
  return {
    name,
    label,
    mesh,
    color,
    surface,
    metadata: { style: "九龙城围合赛博天井", role: "environment" },
  };
}

function neon(color: RGB, intensity: number): PartSurfaceRef {
  return { type: "neon", params: { color, intensity } };
}

function normalizeParams(params: Partial<KowloonCyberCourtyardParams>): KowloonCyberCourtyardParams {
  const p = { ...KOWLOON_CYBER_COURTYARD_DEFAULTS, ...params };
  return {
    floors: Math.max(3, Math.round(p.floors)),
    courtyardWidth: Math.max(4, p.courtyardWidth),
    courtyardDepth: Math.max(4, p.courtyardDepth),
    buildingDepth: Math.max(2.8, p.buildingDepth),
    floorHeight: Math.max(0.65, p.floorHeight),
    alleyWidth: Math.max(0.75, Math.min(p.alleyWidth, Math.min(p.courtyardWidth, p.courtyardDepth) * 0.4)),
    signDensity: clamp01(p.signDensity),
    neonAmount: clamp01(p.neonAmount),
    utilityDensity: clamp01(p.utilityDensity),
    wetness: clamp01(p.wetness),
    rainAmount: clamp01(p.rainAmount),
    seed: Math.round(p.seed),
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
