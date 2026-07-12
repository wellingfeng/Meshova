/**
 * Procedural game map inspired by the Houdini city-road workflow in the
 * provided video: land boundary -> road cuts -> inset blocks -> semantic zones
 * -> game-readable set dressing. All layout choices come from params + seed.
 */
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng, type Rng } from "../random/prng.js";
import {
  box,
  cityBlocks,
  cylinder,
  cone,
  merge,
  parcelOBB,
  polygonCentroidXZ,
  ringToPlate,
  transform,
  type Mesh,
  type NamedPart,
  type PartSurfaceRef,
  type StreetSegment,
} from "../geometry/index.js";
import { buildUrbanBuildingParts, type UrbanStyle } from "./urban-building.js";
import {
  buildBarrierRunParts,
  buildBillboardParts,
  buildBusStopParts,
  buildContainerYardParts,
  buildNewsstandParts,
  buildParkBenchParts,
  buildStreetLampParts,
  buildStreetTreeParts,
  buildTrashcanParts,
  buildUmbrellaTableParts,
} from "./city-props.js";

type RGB = [number, number, number];

export type GameMapZone =
  | "downtown"
  | "residential"
  | "industrial"
  | "park"
  | "plaza"
  | "spawnA"
  | "spawnB";

export interface ProceduralGameMapParams {
  /** Approximate map diameter. */
  size: number;
  /** Number of vertices in the outer land boundary. */
  boundarySides: number;
  /** Radial noise on the boundary, 0..0.35. */
  boundaryJitter: number;
  /** Target parcel area before subdivision stops. */
  targetBlockArea: number;
  /** Drop parcels smaller than this. */
  minBlockArea: number;
  /** Main road width. */
  streetWidth: number;
  /** Minor-road width multiplier by recursion depth. */
  streetTaper: number;
  /** Visual bend amount on road ribbons. */
  roadCurveAmount: number;
  /** Max blocks that receive full building generators. */
  maxBuildings: number;
  /** 0..1 multiplier for props, covers, trees and lamps. */
  propDensity: number;
  /** Include spawn/control-point/cover geometry. */
  gameplayMarkers: boolean;
  /** Include lamps, benches, bus stops and street clutter. */
  streetProps: boolean;
  /** Master deterministic seed. */
  seed: number;
}

export interface ProceduralGameMapSummary {
  readonly blockCount: number;
  readonly streetCount: number;
  readonly zoneCounts: Record<GameMapZone, number>;
}

export interface ProceduralGameMap {
  readonly parts: NamedPart[];
  readonly summary: ProceduralGameMapSummary;
}

export const PROCEDURAL_GAME_MAP_DEFAULTS: ProceduralGameMapParams = {
  size: 180,
  boundarySides: 14,
  boundaryJitter: 0.16,
  targetBlockArea: 950,
  minBlockArea: 280,
  streetWidth: 8.5,
  streetTaper: 0.84,
  roadCurveAmount: 2.4,
  maxBuildings: 34,
  propDensity: 0.8,
  gameplayMarkers: true,
  streetProps: true,
  seed: 91,
};

const ZONES: readonly GameMapZone[] = [
  "downtown",
  "residential",
  "industrial",
  "park",
  "plaza",
  "spawnA",
  "spawnB",
];

const GROUND: RGB = [0.22, 0.3, 0.24];
const ASPHALT: RGB = [0.08, 0.08, 0.09];
const ROAD_PAINT: RGB = [0.9, 0.87, 0.72];
const SIDEWALK: RGB = [0.55, 0.55, 0.52];
const CURB: RGB = [0.68, 0.68, 0.65];
const BOUNDARY: RGB = [0.22, 0.23, 0.24];
const PARK: RGB = [0.16, 0.34, 0.17];
const PLAZA: RGB = [0.56, 0.53, 0.47];
const RESIDENTIAL: RGB = [0.32, 0.39, 0.33];
const DOWNTOWN: RGB = [0.38, 0.39, 0.4];
const INDUSTRIAL: RGB = [0.37, 0.36, 0.31];
const SPAWN_A: RGB = [0.18, 0.35, 0.86];
const SPAWN_B: RGB = [0.88, 0.24, 0.18];
const COVER: RGB = [0.42, 0.42, 0.39];
const WOOD: RGB = [0.42, 0.28, 0.14];

interface Group {
  meshes: Mesh[];
  color?: RGB;
  surface?: PartSurfaceRef;
  label?: string;
}

class PartBag {
  private readonly order: string[] = [];
  private readonly groups = new Map<string, Group>();

  add(name: string, mesh: Mesh, color?: RGB, surface?: PartSurfaceRef, label?: string): void {
    if (mesh.positions.length === 0) return;
    let group = this.groups.get(name);
    if (!group) {
      group = { meshes: [] };
      this.groups.set(name, group);
      this.order.push(name);
    }
    group.meshes.push(mesh);
    if (group.color === undefined && color !== undefined) group.color = color;
    if (group.surface === undefined && surface !== undefined) group.surface = surface;
    if (group.label === undefined && label !== undefined) group.label = label;
  }

  addPart(prefix: string, part: NamedPart, labelPrefix?: string): void {
    const label = labelPrefix && part.label ? `${labelPrefix}-${part.label}` : part.label;
    this.add(`${prefix}_${part.name}`, part.mesh, part.color as RGB | undefined, part.surface, label);
  }

  toParts(): NamedPart[] {
    return this.order.map((name) => {
      const group = this.groups.get(name)!;
      const out: NamedPart = { name, mesh: merge(...group.meshes) };
      if (group.color) out.color = group.color;
      if (group.surface) out.surface = group.surface;
      if (group.label) out.label = group.label;
      return out;
    });
  }
}

interface BlockInfo {
  index: number;
  ring: Vec3[];
  center: Vec3;
  obb: ReturnType<typeof parcelOBB>;
  area: number;
  distance: number;
  zone: GameMapZone;
}

function emptyZoneCounts(): Record<GameMapZone, number> {
  return {
    downtown: 0,
    residential: 0,
    industrial: 0,
    park: 0,
    plaza: 0,
    spawnA: 0,
    spawnB: 0,
  };
}

export function buildProceduralGameMap(params: Partial<ProceduralGameMapParams> = {}): ProceduralGameMap {
  const p: ProceduralGameMapParams = { ...PROCEDURAL_GAME_MAP_DEFAULTS, ...params };
  const seed = Math.round(p.seed) >>> 0;
  const rng = makeRng(seed);
  const boundary = makeBoundary(p, rng.fork());
  const roads = cityBlocks(boundary, {
    targetArea: Math.max(160, p.targetBlockArea),
    minArea: Math.max(40, p.minBlockArea),
    minPerimeter: Math.sqrt(Math.max(40, p.minBlockArea)) * 3,
    streetWidth: Math.max(3, p.streetWidth),
    sidewalkWidth: Math.max(1, p.streetWidth * 0.22),
    splitJitter: 0.18,
    irregularity: 0.12,
    streetTaper: Math.max(0.55, Math.min(1, p.streetTaper)),
    roadCurveAmount: Math.max(0, p.roadCurveAmount),
    realRoads: true,
    roundabouts: true,
    crosswalks: true,
    blockLift: 0.05,
    seed,
  });

  const bag = new PartBag();
  addBaseParts(bag, roads.baseMesh, roads.roadParts);
  addBoundaryWalls(bag, boundary);

  const infos = assignZones(roads.blocks.map((block, i) => ({
    index: i,
    ring: roads.insetRings[i]!,
    center: polygonCentroidXZ(roads.insetRings[i]!),
    obb: parcelOBB(roads.insetRings[i]!),
    area: block.area,
    distance: Math.hypot(polygonCentroidXZ(roads.insetRings[i]!).x, polygonCentroidXZ(roads.insetRings[i]!).z),
    zone: "residential" as GameMapZone,
  })), seed);

  for (const info of infos) addZonePlate(bag, info);

  let buildings = 0;
  for (const info of infos) {
    const r = makeRng((seed ^ Math.imul(info.index + 1, 0x9e3779b9)) >>> 0);
    if (info.zone === "park") {
      addPark(bag, info, r, p);
    } else if (info.zone === "industrial") {
      addIndustrialBlock(bag, info, r, p);
      buildings++;
    } else if (info.zone === "plaza") {
      addPlaza(bag, info, r, p);
    } else if (info.zone === "spawnA" || info.zone === "spawnB") {
      addSpawnBlock(bag, info, r, p);
    } else if (buildings < Math.max(0, Math.round(p.maxBuildings))) {
      addUrbanBlock(bag, info, r, p);
      buildings++;
    }
    if (p.gameplayMarkers && shouldAddCover(info, r, p)) addCoverCluster(bag, info, r, p);
  }

  if (p.streetProps) addStreetProps(bag, roads.streets, p, seed + 700);

  const zoneCounts = emptyZoneCounts();
  for (const info of infos) zoneCounts[info.zone]++;
  return {
    parts: bag.toParts(),
    summary: {
      blockCount: infos.length,
      streetCount: roads.streets.length,
      zoneCounts,
    },
  };
}

export function buildProceduralGameMapParts(params: Partial<ProceduralGameMapParams> = {}): NamedPart[] {
  return buildProceduralGameMap(params).parts;
}

function makeBoundary(p: ProceduralGameMapParams, rng: Rng): Vec3[] {
  const sides = Math.max(8, Math.round(p.boundarySides));
  const jitter = Math.max(0, Math.min(0.35, p.boundaryJitter));
  const radius = Math.max(40, p.size) * 0.5;
  const ring: Vec3[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const notch = Math.cos(a - Math.PI * 0.35) > 0.84 ? -0.18 : 0;
    const r = radius * (0.9 + rng.range(-jitter, jitter) + notch);
    ring.push(vec3(Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  return ring;
}

function addBaseParts(bag: PartBag, baseMesh: Mesh, roads: ReturnType<typeof cityBlocks>["roadParts"]): void {
  bag.add("ground_blocks", baseMesh, GROUND, { type: "mossyStone", params: { color: GROUND, roughness: 0.95 } }, "地块底板");
  bag.add("road_asphalt", merge(roads.asphaltMesh, roads.intersectionMesh, roads.roundaboutMesh), ASPHALT, { type: "concrete", params: { color: ASPHALT, roughness: 0.92 } }, "道路沥青");
  bag.add("road_markings", merge(roads.markingMesh, roads.crosswalkMesh), ROAD_PAINT, { type: "ceramic", params: { color: ROAD_PAINT, roughness: 0.45 } }, "道路标线");
  bag.add("sidewalks", roads.sidewalkMesh, SIDEWALK, { type: "concrete", params: { color: SIDEWALK, roughness: 0.85 } }, "人行道");
  bag.add("curbs", roads.curbMesh, CURB, { type: "concrete", params: { color: CURB, roughness: 0.8 } }, "路缘石");
  bag.add("roundabout_islands", roads.islandMesh, PARK, { type: "mossyStone", params: { color: PARK } }, "环岛绿岛");
}

function addBoundaryWalls(bag: PartBag, boundary: readonly Vec3[]): void {
  const meshes: Mesh[] = [];
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i]!;
    const b = boundary[(i + 1) % boundary.length]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-5) continue;
    meshes.push(transform(box(len, 0.75, 0.22), {
      rotate: vec3(0, yawForAxis(dx / len, dz / len), 0),
      translate: vec3((a.x + b.x) * 0.5, 0.4, (a.z + b.z) * 0.5),
    }));
  }
  bag.add("map_boundary_walls", merge(...meshes), BOUNDARY, { type: "concrete", params: { color: BOUNDARY, roughness: 0.9 } }, "可玩边界墙");
}

function assignZones(infos: BlockInfo[], seed: number): BlockInfo[] {
  if (infos.length === 0) return infos;
  const sortedByCenter = infos.slice().sort((a, b) => a.distance - b.distance);
  const sortedByX = infos.slice().sort((a, b) => a.center.x - b.center.x);
  const central = sortedByCenter[0]!.index;
  const spawnA = sortedByX[0]!.index;
  const spawnB = sortedByX[sortedByX.length - 1]!.index;
  const maxDistance = Math.max(...infos.map((i) => i.distance), 1);

  return infos.map((info) => {
    let zone: GameMapZone;
    if (info.index === spawnA) zone = "spawnA";
    else if (info.index === spawnB && spawnB !== spawnA) zone = "spawnB";
    else if (info.index === central) zone = "plaza";
    else {
      const r = makeRng((seed + Math.imul(info.index + 17, 2654435761)) >>> 0);
      const d = info.distance / maxDistance;
      if (d > 0.58 && r.next() < 0.34) zone = "industrial";
      else if (r.next() < 0.22) zone = "park";
      else if (d < 0.46 && info.area > 700) zone = "downtown";
      else zone = "residential";
    }
    return { ...info, zone };
  });
}

function zoneColor(zone: GameMapZone): RGB {
  switch (zone) {
    case "downtown": return DOWNTOWN;
    case "industrial": return INDUSTRIAL;
    case "park": return PARK;
    case "plaza": return PLAZA;
    case "spawnA": return SPAWN_A;
    case "spawnB": return SPAWN_B;
    case "residential":
    default: return RESIDENTIAL;
  }
}

function addZonePlate(bag: PartBag, info: BlockInfo): void {
  const color = zoneColor(info.zone);
  bag.add(`zone_${info.zone}_plates`, ringToPlate(info.ring, 0.09), color, { type: "concrete", params: { color, roughness: 0.9 } }, `地图分区-${info.zone}`);
}

function addUrbanBlock(bag: PartBag, info: BlockInfo, rng: Rng, p: ProceduralGameMapParams): void {
  const downtown = info.zone === "downtown";
  const style: UrbanStyle = downtown
    ? (rng.next() < 0.5 ? "glassTower" : "corporate")
    : (rng.next() < 0.5 ? "brickWalkup" : "brownstone");
  const footprint = downtown ? rng.range(0.5, 0.68) : rng.range(0.72, 0.88);
  const floors = downtown ? rng.int(14, 32) : rng.int(3, 7);
  const width = Math.max(4, Math.min(info.obb.extU * footprint, downtown ? 16 : 11));
  const depth = Math.max(4, Math.min(info.obb.extV * footprint, downtown ? 15 : 10));
  const parts = buildUrbanBuildingParts({
    style,
    width,
    depth,
    floors,
    baysX: downtown ? 5 : 3,
    baysZ: downtown ? 4 : 3,
    seed: rng.int(1, 1_000_000),
  });
  placeNamedParts(bag, `${info.zone}_${style}`, parts, vec3(info.center.x, 0.11, info.center.z), info.obb.angleY, 1, "程序化建筑");
  if (rng.next() < p.propDensity * 0.35) {
    addBarrierLine(bag, info, rng.next() < 0.5 ? "u" : "v", rng.range(-0.2, 0.2), rng.range(-0.2, 0.2), Math.min(info.obb.extU, info.obb.extV) * 0.55, "chainlink");
  }
}

function addIndustrialBlock(bag: PartBag, info: BlockInfo, rng: Rng, p: ProceduralGameMapParams): void {
  const w = Math.max(6, Math.min(info.obb.extU * 0.58, 20));
  const d = Math.max(5, Math.min(info.obb.extV * 0.45, 14));
  const h = rng.range(3.2, 6.5);
  const base = merge(
    transform(box(w, h, d), { translate: vec3(0, h / 2, 0) }),
    transform(box(w + 0.5, 0.28, d + 0.5), { translate: vec3(0, h + 0.14, 0) }),
  );
  bag.add("industrial_warehouses", placeMesh(base, info.center, info.obb.angleY, 0.1), [0.48, 0.45, 0.38], { type: "metal", params: { color: [0.48, 0.45, 0.38], roughness: 0.68 } }, "工业仓库");

  const doors: Mesh[] = [];
  const nDoors = Math.max(1, Math.floor(w / 5));
  for (let i = 0; i < nDoors; i++) {
    const x = -w * 0.35 + (i / Math.max(1, nDoors - 1)) * w * 0.7;
    doors.push(transform(box(2.1, 2.2, 0.08), { translate: vec3(x, 1.15, d / 2 + 0.06) }));
  }
  bag.add("industrial_rollup_doors", placeMesh(merge(...doors), info.center, info.obb.angleY, 0.1), [0.18, 0.2, 0.22], { type: "metal", params: { color: [0.18, 0.2, 0.22], roughness: 0.5 } }, "卷帘门");

  const scale = Math.max(0.55, Math.min(1, info.obb.extU / 28, info.obb.extV / 18));
  const c = localPoint(info, rng.range(-info.obb.extU * 0.16, info.obb.extU * 0.16), -info.obb.extV * 0.2, 0.12);
  placeNamedParts(bag, "industrial_container_yard", buildContainerYardParts({
    containers: rng.int(3, 7),
    stackHeight: rng.int(1, 3),
    pallets: rng.int(1, 4),
    seed: rng.int(1, 1_000_000),
  }), c, info.obb.angleY, scale, "集装箱场");

  if (p.gameplayMarkers) {
    addBarrierLine(bag, info, "u", 0, info.obb.extV * 0.35, info.obb.extU * 0.65, "chainlink");
  }
}

function addPark(bag: PartBag, info: BlockInfo, rng: Rng, p: ProceduralGameMapParams): void {
  const path = transform(box(Math.max(4, info.obb.extU * 0.7), 0.045, 1.05), {
    rotate: vec3(0, info.obb.angleY, 0),
    translate: vec3(info.center.x, 0.16, info.center.z),
  });
  bag.add("park_paths", path, [0.66, 0.61, 0.5], { type: "concrete", params: { color: [0.66, 0.61, 0.5], roughness: 0.88 } }, "公园步道");

  const treeCount = Math.max(2, Math.round((info.area / 260) * p.propDensity));
  for (let i = 0; i < treeCount; i++) {
    const pt = randomPointInBlock(info, rng, 10);
    placeNamedParts(bag, "park_tree", buildStreetTreeParts({
      canopyRadius: rng.range(1.0, 1.9),
      trunkHeight: rng.range(1.5, 2.3),
      clusters: rng.int(3, 6),
      seed: rng.int(1, 1_000_000),
    }), pt, rng.range(-Math.PI, Math.PI), rng.range(0.8, 1.15), "公园树");
  }
  if (rng.next() < p.propDensity) {
    placeNamedParts(bag, "park_bench", buildParkBenchParts({ length: rng.range(1.5, 2.2) }), localPoint(info, 0, info.obb.extV * 0.18, 0.13), info.obb.angleY, 1, "公园长椅");
  }
  if (rng.next() < p.propDensity * 0.6) {
    placeNamedParts(bag, "park_trashcan", buildTrashcanParts({ radius: 0.22, height: 0.68 }), localPoint(info, info.obb.extU * 0.22, -info.obb.extV * 0.12, 0.13), 0, 1, "公园垃圾桶");
  }
}

function addPlaza(bag: PartBag, info: BlockInfo, rng: Rng, p: ProceduralGameMapParams): void {
  const radius = Math.max(3.5, Math.min(info.obb.extU, info.obb.extV) * 0.22);
  const pad = transform(cylinder(radius, 0.08, 48), { translate: vec3(info.center.x, 0.17, info.center.z) });
  bag.add("control_point_pad", pad, [0.88, 0.78, 0.35], { type: "ceramic", params: { color: [0.88, 0.78, 0.35], roughness: 0.48 } }, "中心控制点");

  const monument = merge(
    transform(cylinder(radius * 0.22, 1.2, 24), { translate: vec3(0, 0.76, 0) }),
    transform(cone(radius * 0.34, 1.4, 24), { translate: vec3(0, 2.05, 0) }),
  );
  bag.add("control_point_monument", placeMesh(monument, info.center, 0, 0.17), [0.62, 0.58, 0.5], { type: "stone", params: { color: [0.62, 0.58, 0.5], roughness: 0.72 } }, "控制点纪念物");

  const marketCount = Math.max(1, Math.round(2 * p.propDensity));
  for (let i = 0; i < marketCount; i++) {
    const a = (i / marketCount) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const pt = vec3(info.center.x + Math.cos(a) * radius * 1.45, 0.13, info.center.z + Math.sin(a) * radius * 1.45);
    placeNamedParts(bag, "plaza_umbrella_table", buildUmbrellaTableParts({
      canopy: i % 2 === 0 ? [0.85, 0.25, 0.16] : [0.18, 0.34, 0.72],
      stools: rng.int(3, 5),
    }), pt, a, 1, "广场摊位");
  }
  if (rng.next() < p.propDensity) {
    placeNamedParts(bag, "plaza_newsstand", buildNewsstandParts({ width: 2.4, depth: 1.6, dispensers: 2 }), localPoint(info, -info.obb.extU * 0.22, info.obb.extV * 0.25, 0.13), info.obb.angleY, 1, "报亭");
  }
}

function addSpawnBlock(bag: PartBag, info: BlockInfo, rng: Rng, p: ProceduralGameMapParams): void {
  const color = info.zone === "spawnA" ? SPAWN_A : SPAWN_B;
  const prefix = info.zone === "spawnA" ? "spawn_a" : "spawn_b";
  const radius = Math.max(3.2, Math.min(info.obb.extU, info.obb.extV) * 0.2);
  bag.add(`${prefix}_pad`, transform(cylinder(radius, 0.08, 40), { translate: vec3(info.center.x, 0.18, info.center.z) }), color, { type: "ceramic", params: { color, roughness: 0.4 } }, `${prefix} 出生点`);
  const flag = merge(
    transform(cylinder(0.06, 3.2, 10), { translate: vec3(0, 1.6, 0) }),
    transform(box(1.4, 0.75, 0.05), { translate: vec3(0.7, 2.7, 0) }),
  );
  bag.add(`${prefix}_flag`, placeMesh(flag, info.center, info.obb.angleY, 0.2), color, { type: "metal", params: { color, roughness: 0.35 } }, `${prefix} 队旗`);
  addBarrierLine(bag, info, "u", 0, radius * 0.9, radius * 2.1, "jersey");
  addBarrierLine(bag, info, "u", 0, -radius * 0.9, radius * 2.1, "jersey");
  if (p.streetProps && rng.next() < p.propDensity) {
    placeNamedParts(bag, `${prefix}_bus_stop`, buildBusStopParts({ length: 3.4, depth: 1.2 }), localPoint(info, -info.obb.extU * 0.25, -info.obb.extV * 0.25, 0.12), info.obb.angleY, 1, "出生点公交站");
  }
}

function addCoverCluster(bag: PartBag, info: BlockInfo, rng: Rng, p: ProceduralGameMapParams): void {
  const n = Math.max(1, Math.round((info.area / 420) * Math.max(0.25, p.propDensity)));
  const walls: Mesh[] = [];
  const crates: Mesh[] = [];
  for (let i = 0; i < n; i++) {
    const pt = randomPointInBlock(info, rng, 8);
    const yaw = rng.range(-Math.PI, Math.PI);
    if (rng.next() < 0.55) {
      const w = rng.range(1.2, 2.7);
      walls.push(transform(box(w, 0.75, 0.32), { rotate: vec3(0, yaw, 0), translate: vec3(pt.x, 0.52, pt.z) }));
    } else {
      const s = rng.range(0.55, 1.05);
      crates.push(transform(box(s, s, s), { rotate: vec3(0, yaw, 0), translate: vec3(pt.x, 0.16 + s / 2, pt.z) }));
    }
  }
  if (walls.length) bag.add("gameplay_cover_walls", merge(...walls), COVER, { type: "concrete", params: { color: COVER, roughness: 0.9 } }, "游戏掩体矮墙");
  if (crates.length) bag.add("gameplay_cover_crates", merge(...crates), WOOD, { type: "wood", params: { color: WOOD, roughness: 0.85 } }, "游戏掩体箱子");
}

function addStreetProps(bag: PartBag, streets: readonly StreetSegment[], p: ProceduralGameMapParams, seed: number): void {
  const sorted = streets.slice().sort((a, b) => streetLength(b) - streetLength(a));
  const count = Math.min(sorted.length, Math.max(3, Math.round(8 * p.propDensity)));
  for (let i = 0; i < count; i++) {
    const s = sorted[i]!;
    const len = streetLength(s);
    if (len < p.streetWidth * 2) continue;
    const r = makeRng((seed + i * 101) >>> 0);
    const dx = (s.b.x - s.a.x) / len;
    const dz = (s.b.z - s.a.z) / len;
    const px = -dz;
    const pz = dx;
    const places = Math.max(1, Math.floor(len / 34));
    for (let j = 0; j < places; j++) {
      const t = (j + 0.5) / places;
      const side = (j + i) % 2 === 0 ? 1 : -1;
      const x = s.a.x + (s.b.x - s.a.x) * t + px * side * p.streetWidth * 0.78;
      const z = s.a.z + (s.b.z - s.a.z) * t + pz * side * p.streetWidth * 0.78;
      placeNamedParts(bag, "street_lamp", buildStreetLampParts({ height: r.range(5.2, 6.6), style: r.next() < 0.6 ? "cobra" : "ornamental" }), vec3(x, 0.11, z), yawForAxis(px * side, pz * side), 1, "路灯");
    }
    if (i < 2 && len > 45) {
      const t = 0.35 + i * 0.2;
      const x = s.a.x + (s.b.x - s.a.x) * t + px * p.streetWidth * 0.95;
      const z = s.a.z + (s.b.z - s.a.z) * t + pz * p.streetWidth * 0.95;
      placeNamedParts(bag, "street_bus_stop", buildBusStopParts({ length: 3.8, depth: 1.25 }), vec3(x, 0.11, z), yawForAxis(dx, dz), 1, "公交站");
    }
    if (i === 0 && len > 55) {
      const x = (s.a.x + s.b.x) * 0.5 - px * p.streetWidth * 1.4;
      const z = (s.a.z + s.b.z) * 0.5 - pz * p.streetWidth * 1.4;
      placeNamedParts(bag, "street_billboard", buildBillboardParts({ panelWidth: 8, panelHeight: 3.5, clearance: 4.2 }), vec3(x, 0.11, z), yawForAxis(dx, dz), 0.75, "广告牌");
    }
  }
}

function addBarrierLine(
  bag: PartBag,
  info: BlockInfo,
  axis: "u" | "v",
  offsetU: number,
  offsetV: number,
  length: number,
  style: "jersey" | "aframe" | "chainlink",
): void {
  const segLength = style === "chainlink" ? 2.2 : 1.8;
  const segments = Math.max(1, Math.round(length / segLength));
  const dir = axis === "u" ? info.obb.u : info.obb.v;
  const yaw = yawForAxis(dir.x, dir.z);
  const pt = localPoint(info, offsetU, offsetV, 0.13);
  placeNamedParts(bag, `gameplay_${style}_barrier`, buildBarrierRunParts({ segments, segLength, style, height: style === "chainlink" ? 1.6 : 0.9 }), pt, yaw, 1, "玩法围挡");
}

function shouldAddCover(info: BlockInfo, rng: Rng, p: ProceduralGameMapParams): boolean {
  if (info.zone === "downtown") return rng.next() < p.propDensity * 0.3;
  if (info.zone === "park") return rng.next() < p.propDensity * 0.45;
  return rng.next() < p.propDensity * 0.85;
}

function placeNamedParts(
  bag: PartBag,
  prefix: string,
  parts: readonly NamedPart[],
  pos: Vec3,
  yaw: number,
  scale = 1,
  labelPrefix?: string,
): void {
  for (const part of parts) {
    const placed = transform(part.mesh, {
      scale,
      rotate: vec3(0, yaw, 0),
      translate: pos,
    });
    bag.addPart(prefix, { ...part, mesh: placed }, labelPrefix);
  }
}

function placeMesh(mesh: Mesh, pos: Vec3, yaw: number, y = 0): Mesh {
  return transform(mesh, {
    rotate: vec3(0, yaw, 0),
    translate: vec3(pos.x, y, pos.z),
  });
}

function localPoint(info: BlockInfo, du: number, dv: number, y: number): Vec3 {
  return vec3(
    info.center.x + info.obb.u.x * du + info.obb.v.x * dv,
    y,
    info.center.z + info.obb.u.z * du + info.obb.v.z * dv,
  );
}

function randomPointInBlock(info: BlockInfo, rng: Rng, attempts: number): Vec3 {
  for (let i = 0; i < attempts; i++) {
    const pt = localPoint(
      info,
      rng.range(-info.obb.extU * 0.38, info.obb.extU * 0.38),
      rng.range(-info.obb.extV * 0.38, info.obb.extV * 0.38),
      0.14,
    );
    if (pointInRingXZ(pt, info.ring)) return pt;
  }
  return vec3(info.center.x, 0.14, info.center.z);
}

function pointInRingXZ(point: Vec3, ring: readonly Vec3[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    const hit = (a.z > point.z) !== (b.z > point.z)
      && point.x < ((b.x - a.x) * (point.z - a.z)) / ((b.z - a.z) || 1e-9) + a.x;
    if (hit) inside = !inside;
  }
  return inside;
}

function yawForAxis(x: number, z: number): number {
  return Math.atan2(-z, x);
}

function streetLength(s: StreetSegment): number {
  return Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z);
}
