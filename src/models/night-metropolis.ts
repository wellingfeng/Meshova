/**
 * Large deterministic night metropolis inspired by a dense modern skyline.
 * Geometry stays deliberately modular: massing, windows, roads, lights and
 * distant mountains are separate semantic/material groups.
 */
import { vec3 } from "../math/vec3.js";
import { makeRng, type Rng } from "../random/prng.js";
import {
  box,
  icosphere,
  merge,
  transform,
  type Mesh,
  type NamedPart,
  type PartInstanceTransform,
} from "../geometry/index.js";

type RGB = [number, number, number];

export interface NightMetropolisParams {
  blocksX: number;
  blocksZ: number;
  blockSize: number;
  streetWidth: number;
  lotsPerBlock: number;
  density: number;
  minFloors: number;
  maxFloors: number;
  floorHeight: number;
  centerBoost: number;
  litWindowRatio: number;
  mountains: boolean;
  seed: number;
}

export const NIGHT_METROPOLIS_DEFAULTS: NightMetropolisParams = {
  blocksX: 8,
  blocksZ: 7,
  blockSize: 38,
  streetWidth: 10,
  lotsPerBlock: 3,
  density: 0.82,
  minFloors: 7,
  maxFloors: 48,
  floorHeight: 1.15,
  centerBoost: 1.35,
  litWindowRatio: 0.72,
  mountains: true,
  seed: 2026,
};

interface BoxGroup {
  label: string;
  color: RGB;
  surface: NonNullable<NamedPart["surface"]>;
  transforms: PartInstanceTransform[];
}

class MetropolisBag {
  private readonly unitBox = box(1, 1, 1);
  private readonly order: string[] = [];
  private readonly groups = new Map<string, BoxGroup>();

  addBox(
    name: string,
    label: string,
    color: RGB,
    surface: NonNullable<NamedPart["surface"]>,
    position: [number, number, number],
    scale: [number, number, number],
  ): void {
    let group = this.groups.get(name);
    if (!group) {
      group = { label, color, surface, transforms: [] };
      this.groups.set(name, group);
      this.order.push(name);
    }
    group.transforms.push({ position, scale });
  }

  toParts(): NamedPart[] {
    return this.order.map((name) => {
      const group = this.groups.get(name)!;
      const realized = group.transforms.map((instance) => transform(this.unitBox, {
        translate: vec3(...instance.position),
        scale: vec3(...(instance.scale ?? [1, 1, 1])),
      }));
      return {
        name,
        label: group.label,
        mesh: merge(...realized),
        color: group.color,
        surface: group.surface,
        renderInstances: { mesh: this.unitBox, transforms: group.transforms },
      };
    });
  }
}

const BUILDING_GROUPS = [
  { name: "tower_charcoal", label: "深灰办公塔楼", color: [0.075, 0.09, 0.12] as RGB, type: "concrete" },
  { name: "tower_blueglass", label: "蓝黑玻璃塔楼", color: [0.055, 0.11, 0.16] as RGB, type: "glass" },
  { name: "tower_stone", label: "浅灰商务塔楼", color: [0.19, 0.2, 0.22] as RGB, type: "concrete" },
  { name: "tower_bronze", label: "暖灰综合塔楼", color: [0.16, 0.12, 0.105] as RGB, type: "metal" },
] as const;

const COOL_LIGHT: RGB = [0.58, 0.86, 1];
const PALE_LIGHT: RGB = [0.82, 0.94, 1];
const WARM_LIGHT: RGB = [1, 0.68, 0.3];

export function buildNightMetropolisParts(
  params: Partial<NightMetropolisParams> = {},
): NamedPart[] {
  const resolved: NightMetropolisParams = { ...NIGHT_METROPOLIS_DEFAULTS, ...params };
  const blocksX = Math.max(2, Math.round(resolved.blocksX));
  const blocksZ = Math.max(2, Math.round(resolved.blocksZ));
  const lotsPerBlock = Math.max(2, Math.round(resolved.lotsPerBlock));
  const density = Math.max(0.1, Math.min(1, resolved.density));
  const minFloors = Math.max(2, Math.round(resolved.minFloors));
  const maxFloors = Math.max(minFloors, Math.round(resolved.maxFloors));
  const rng = makeRng(Math.round(resolved.seed) >>> 0);
  const bag = new MetropolisBag();
  const pitch = resolved.blockSize + resolved.streetWidth;
  const spanX = blocksX * pitch + resolved.streetWidth;
  const spanZ = blocksZ * pitch + resolved.streetWidth;

  addGroundAndRoads(bag, resolved, blocksX, blocksZ, pitch, spanX, spanZ);

  const lotStep = resolved.blockSize / lotsPerBlock;
  for (let blockZ = 0; blockZ < blocksZ; blockZ++) {
    for (let blockX = 0; blockX < blocksX; blockX++) {
      const blockCenterX = (blockX - (blocksX - 1) / 2) * pitch;
      const blockCenterZ = (blockZ - (blocksZ - 1) / 2) * pitch;
      for (let lotZ = 0; lotZ < lotsPerBlock; lotZ++) {
        for (let lotX = 0; lotX < lotsPerBlock; lotX++) {
          const lotRng = rng.fork();
          if (lotRng.next() > density) continue;
          const x = blockCenterX + (lotX - (lotsPerBlock - 1) / 2) * lotStep;
          const z = blockCenterZ + (lotZ - (lotsPerBlock - 1) / 2) * lotStep;
          addTower(bag, resolved, lotRng, x, z, lotStep, spanX, spanZ, minFloors, maxFloors);
        }
      }
    }
  }

  addLandmarkCore(bag, resolved, spanX, spanZ);
  addStreetLights(bag, resolved, blocksX, blocksZ, pitch, spanX, spanZ);

  const parts = bag.toParts();
  if (resolved.mountains) parts.push(buildMountainRing(resolved, spanX, spanZ));
  return parts;
}

function addGroundAndRoads(
  bag: MetropolisBag,
  params: NightMetropolisParams,
  blocksX: number,
  blocksZ: number,
  pitch: number,
  spanX: number,
  spanZ: number,
): void {
  bag.addBox(
    "city_ground",
    "都市地基",
    [0.025, 0.03, 0.04],
    { type: "wetGround", params: { color: [0.025, 0.03, 0.04], roughness: 0.34, wetness: 0.78, seed: params.seed } },
    [0, -0.16, 0],
    [spanX, 0.3, spanZ],
  );
  const asphalt: RGB = [0.018, 0.022, 0.03];
  const roadSurface = { type: "wetGround", params: { color: asphalt, roughness: 0.28, wetness: 0.92, seed: params.seed + 1 } };
  for (let avenue = 0; avenue <= blocksX; avenue++) {
    const x = (avenue - blocksX / 2) * pitch;
    bag.addBox("avenues", "纵向城市主干道", asphalt, roadSurface, [x, 0.015, 0], [params.streetWidth, 0.04, spanZ]);
    addRoadMarking(bag, x, 0, 0.16, spanZ, "z");
  }
  for (let street = 0; street <= blocksZ; street++) {
    const z = (street - blocksZ / 2) * pitch;
    for (let segment = 0; segment < blocksX; segment++) {
      const x = (segment + 0.5 - blocksX / 2) * pitch;
      bag.addBox("streets", "横向城市道路", asphalt, roadSurface, [x, 0.04, z], [pitch - params.streetWidth - 0.04, 0.045, params.streetWidth]);
    }
    addRoadMarking(bag, 0, z, spanX, 0.16, "x");
  }
}

function addRoadMarking(
  bag: MetropolisBag,
  x: number,
  z: number,
  width: number,
  depth: number,
  axis: "x" | "z",
): void {
  const length = axis === "x" ? width : depth;
  const dashCount = Math.max(4, Math.floor(length / 8));
  const dashLength = length / dashCount * 0.48;
  for (let index = 0; index < dashCount; index++) {
    const offset = -length / 2 + (index + 0.5) * (length / dashCount);
    const position: [number, number, number] = axis === "x" ? [offset, 0.09, z] : [x, 0.09, offset];
    const scale: [number, number, number] = axis === "x" ? [dashLength, 0.025, 0.13] : [0.13, 0.025, dashLength];
    bag.addBox(
      "road_markings",
      "暖色道路标线",
      [0.72, 0.48, 0.16],
      { type: "emissive", params: { color: [0.72, 0.48, 0.16], intensity: 0.55 } },
      position,
      scale,
    );
  }
}

function addTower(
  bag: MetropolisBag,
  params: NightMetropolisParams,
  rng: Rng,
  x: number,
  z: number,
  lotStep: number,
  spanX: number,
  spanZ: number,
  minFloors: number,
  maxFloors: number,
): void {
  const normalizedX = x / (spanX * 0.5);
  const normalizedZ = z / (spanZ * 0.5);
  const radius = Math.min(1, Math.hypot(normalizedX, normalizedZ));
  const centerWeight = Math.pow(1 - radius, 1.45);
  const heightWeight = Math.min(1.45, 0.28 + centerWeight * params.centerBoost + rng.range(-0.12, 0.2));
  const floors = Math.max(minFloors, Math.round(minFloors + (maxFloors - minFloors) * heightWeight));
  const width = lotStep * rng.range(0.62, 0.9);
  const depth = lotStep * rng.range(0.62, 0.9);
  const height = floors * params.floorHeight;
  const group = BUILDING_GROUPS[rng.int(0, BUILDING_GROUPS.length - 1)]!;
  const surface = group.type === "glass"
    ? { type: "glass", params: { tint: group.color, roughness: 0.13, thickness: 0.08 } }
    : { type: group.type, params: { color: group.color, roughness: group.type === "metal" ? 0.42 : 0.76, seed: rng.int(0, 9999) } };

  if (height > 30 && rng.next() < 0.72) {
    const podiumHeight = Math.min(7, height * 0.13);
    bag.addBox("tower_podiums", "塔楼裙房", [0.1, 0.11, 0.13], { type: "concrete", params: { color: [0.1, 0.11, 0.13], roughness: 0.72 } }, [x, podiumHeight / 2 - 0.04, z], [width * 1.12, podiumHeight, depth * 1.12]);
  }
  bag.addBox(group.name, group.label, group.color, surface, [x, height / 2, z], [width, height, depth]);

  if (rng.next() < 0.32) {
    const crownHeight = Math.min(8, Math.max(1.5, height * rng.range(0.05, 0.12)));
    bag.addBox("tower_crowns", "塔冠与退台", [0.1, 0.14, 0.19], { type: "metal", params: { color: [0.1, 0.14, 0.19], roughness: 0.35 } }, [x, height + crownHeight / 2, z], [width * rng.range(0.42, 0.72), crownHeight, depth * rng.range(0.42, 0.72)]);
  }
  if (height > 40 && rng.next() < 0.2) {
    const mastHeight = rng.range(5, 12);
    bag.addBox("tower_masts", "楼顶天线", [0.18, 0.22, 0.28], { type: "metal", params: { color: [0.18, 0.22, 0.28], roughness: 0.3 } }, [x, height + 0.05 + mastHeight / 2, z], [0.22, mastHeight, 0.22]);
  }

  addWindowBands(bag, params, rng, x, z, width, depth, height, floors);
}

function addWindowBands(
  bag: MetropolisBag,
  params: NightMetropolisParams,
  rng: Rng,
  x: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  floors: number,
): void {
  const bands = Math.max(2, Math.min(12, Math.round(floors / 3)));
  const warm = rng.next() < 0.24;
  const pale = !warm && rng.next() < 0.38;
  const color = warm ? WARM_LIGHT : pale ? PALE_LIGHT : COOL_LIGHT;
  const groupName = warm ? "windows_warm" : pale ? "windows_pale" : "windows_cool";
  const label = warm ? "暖色室内窗光" : pale ? "冷白室内窗光" : "蓝色幕墙窗光";
  const intensity = warm ? 2.8 : pale ? 3.4 : 3.1;
  const bandHeight = Math.max(0.18, params.floorHeight * rng.range(0.22, 0.38));
  const gridStyle = rng.next() < 0.34;
  for (let band = 0; band < bands; band++) {
    if (rng.next() > params.litWindowRatio) continue;
    const y = height * ((band + 1) / (bands + 1));
    const surface = { type: "emissive", params: { color, intensity } };
    if (gridStyle) {
      const bays = 3;
      const bayWidth = width * 0.72 / bays;
      for (let bay = 0; bay < bays; bay++) {
        if (rng.next() > params.litWindowRatio) continue;
        const offset = (bay - (bays - 1) / 2) * bayWidth * 1.18;
        bag.addBox(groupName, label, color, surface, [x + offset, y, z + depth / 2 + 0.025], [bayWidth, bandHeight, 0.05]);
        bag.addBox(groupName, label, color, surface, [x + offset, y, z - depth / 2 - 0.025], [bayWidth, bandHeight, 0.05]);
      }
    } else {
      bag.addBox(groupName, label, color, surface, [x, y, z + depth / 2 + 0.025], [width * 0.82, bandHeight, 0.05]);
      bag.addBox(groupName, label, color, surface, [x, y, z - depth / 2 - 0.025], [width * 0.82, bandHeight, 0.05]);
    }
    bag.addBox(groupName, label, color, surface, [x + width / 2 + 0.025, y, z], [0.05, bandHeight, depth * 0.82]);
    bag.addBox(groupName, label, color, surface, [x - width / 2 - 0.025, y, z], [0.05, bandHeight, depth * 0.82]);
  }
}

function addLandmarkCore(bag: MetropolisBag, params: NightMetropolisParams, spanX: number, spanZ: number): void {
  const landmarkRng = makeRng((params.seed ^ 0xa53c91e7) >>> 0);
  const positions: Array<[number, number]> = [[0, 0], [spanX * 0.075, -spanZ * 0.045], [-spanX * 0.09, spanZ * 0.065]];
  positions.forEach(([x, z], index) => {
    const width = index === 0 ? 15 : 11;
    const depth = index === 0 ? 13 : 10;
    const height = (params.maxFloors + 12 - index * 6) * params.floorHeight;
    bag.addBox("landmark_towers", "核心区地标塔楼", [0.055, 0.1, 0.15], { type: "metal", params: { color: [0.055, 0.1, 0.15], roughness: 0.28 } }, [x, height / 2 + 0.1, z], [width, height, depth]);
    addWindowBands(bag, { ...params, litWindowRatio: 0.92 }, landmarkRng.fork(), x, z, width, depth, height, params.maxFloors + 12 - index * 6);
    const beaconHeight = 9 - index;
    bag.addBox("landmark_beacons", "地标塔顶信标", [0.25, 0.75, 1], { type: "emissive", params: { color: [0.25, 0.75, 1], intensity: 5 } }, [x, height + beaconHeight / 2, z], [0.3, beaconHeight, 0.3]);
  });
}

function addStreetLights(
  bag: MetropolisBag,
  params: NightMetropolisParams,
  blocksX: number,
  blocksZ: number,
  pitch: number,
  spanX: number,
  spanZ: number,
): void {
  const spacing = 11;
  const warmSurface = { type: "emissive", params: { color: WARM_LIGHT, intensity: 4.4 } };
  for (let avenue = 0; avenue <= blocksX; avenue++) {
    const x = (avenue - blocksX / 2) * pitch + params.streetWidth * 0.32;
    for (let z = -spanZ / 2 + 4; z < spanZ / 2; z += spacing) {
      bag.addBox("street_lights", "暖色道路灯光", WARM_LIGHT, warmSurface, [x, 0.16, z], [0.34, 0.18, 1.8]);
    }
  }
  for (let street = 0; street <= blocksZ; street++) {
    const z = (street - blocksZ / 2) * pitch - params.streetWidth * 0.32;
    for (let x = -spanX / 2 + 4; x < spanX / 2; x += spacing) {
      bag.addBox("street_lights", "暖色道路灯光", WARM_LIGHT, warmSurface, [x, 0.17, z], [1.8, 0.18, 0.34]);
    }
  }
}

function buildMountainRing(params: NightMetropolisParams, spanX: number, spanZ: number): NamedPart {
  const rng = makeRng((params.seed ^ 0x6d2b79f5) >>> 0);
  const base = icosphere(1, 1);
  const meshes: Mesh[] = [];
  const count = 15;
  for (let index = 0; index < count; index++) {
    const normalized = index / (count - 1);
    const mountainHeight = rng.range(22, 48);
    meshes.push(transform(base, {
      translate: vec3(
        (normalized - 0.5) * spanX * 1.45 + rng.range(-12, 12),
        mountainHeight * 0.12 - 7,
        -spanZ * 0.72 + rng.range(-18, 10),
      ),
      scale: vec3(rng.range(34, 62), mountainHeight, rng.range(24, 38)),
      rotate: vec3(0, rng.range(-0.35, 0.35), 0),
    }));
  }
  return {
    name: "distant_mountains",
    label: "城市外围远山",
    mesh: merge(...meshes),
    color: [0.018, 0.026, 0.04],
    surface: { type: "stone", params: { color: [0.018, 0.026, 0.04], roughness: 0.98, scale: 2.4, seed: params.seed } },
  };
}
