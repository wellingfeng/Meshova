/**
 * Residential community assembly grammar.
 *
 * The grammar owns semantic placement. Geometry builders consume its layout,
 * keeping roads, towers, amenities, walls, landscape and freeway coordinated.
 */
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  box,
  cone,
  cylinder,
  grammarResample,
  merge,
  polyline,
  roadCenterLine,
  roadEdgeLines,
  roadRibbon,
  sphere,
  transform,
  type Mesh,
  type NamedPart,
  type PartSurfaceRef,
} from "../geometry/index.js";
import { buildFreewayParts } from "./freeway.js";
import { buildParkBenchParts, buildStreetLampParts } from "./city-props.js";
import { buildUrbanBuildingParts } from "./urban-building.js";

type RGB = [number, number, number];

export type CommunityPlacementKind =
  | "tower"
  | "wall"
  | "tree"
  | "lamp"
  | "bench"
  | "car"
  | "amenity"
  | "entrance"
  | "freeway";

export interface CommunityPlacement {
  readonly key: string;
  readonly label: string;
  readonly kind: CommunityPlacementKind;
  readonly position: readonly [number, number, number];
  readonly rotationY: number;
  readonly size: readonly [number, number, number];
  readonly variant: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ResidentialCommunityParams {
  /** Deterministic master seed. */
  seed: number;
  /** Community boundary width on X. */
  siteWidth: number;
  /** Community boundary depth on Z. */
  siteDepth: number;
  /** Apartment rows, separated by central amenities. */
  towerRows: number;
  /** Apartment towers in each row. */
  towersPerRow: number;
  /** Base apartment floor count before seeded variation. */
  towerFloors: number;
  /** Maximum seeded floor variation. */
  floorVariation: number;
  /** Boundary wall height. */
  wallHeight: number;
  /** Landscape density in 0..1. */
  treeDensity: number;
  /** Include elevated freeway behind the community. */
  includeFreeway: boolean;
  /** Elevated freeway deck height. */
  freewayElevation: number;
}

export interface ResidentialCommunityLayout {
  readonly params: ResidentialCommunityParams;
  readonly placements: readonly CommunityPlacement[];
  readonly rules: readonly string[];
}

export const RESIDENTIAL_COMMUNITY_DEFAULTS: ResidentialCommunityParams = {
  seed: 37,
  siteWidth: 112,
  siteDepth: 84,
  towerRows: 2,
  towersPerRow: 4,
  towerFloors: 15,
  floorVariation: 3,
  wallHeight: 2.1,
  treeDensity: 0.72,
  includeFreeway: true,
  freewayElevation: 8,
};

const COLORS = {
  grass: [0.16, 0.29, 0.13] as RGB,
  grassLight: [0.24, 0.4, 0.18] as RGB,
  asphalt: [0.055, 0.06, 0.067] as RGB,
  sidewalk: [0.48, 0.47, 0.44] as RGB,
  paint: [0.92, 0.91, 0.82] as RGB,
  concrete: [0.62, 0.6, 0.55] as RGB,
  concreteLight: [0.76, 0.73, 0.66] as RGB,
  steel: [0.18, 0.2, 0.22] as RGB,
  glass: [0.16, 0.28, 0.34] as RGB,
  hedge: [0.11, 0.31, 0.1] as RGB,
  trunk: [0.25, 0.15, 0.08] as RGB,
  canopy: [0.16, 0.38, 0.12] as RGB,
  playground: [0.16, 0.42, 0.7] as RGB,
  playgroundAccent: [0.92, 0.35, 0.08] as RGB,
  parking: [0.1, 0.105, 0.11] as RGB,
  water: [0.08, 0.32, 0.48] as RGB,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizedParams(params: Partial<ResidentialCommunityParams>): ResidentialCommunityParams {
  const p = { ...RESIDENTIAL_COMMUNITY_DEFAULTS, ...params };
  return {
    ...p,
    seed: Math.round(p.seed),
    siteWidth: clamp(p.siteWidth, 84, 160),
    siteDepth: clamp(p.siteDepth, 68, 124),
    towerRows: clamp(Math.round(p.towerRows), 1, 2),
    towersPerRow: clamp(Math.round(p.towersPerRow), 2, 5),
    towerFloors: clamp(Math.round(p.towerFloors), 7, 28),
    floorVariation: clamp(Math.round(p.floorVariation), 0, 8),
    wallHeight: clamp(p.wallHeight, 1.2, 3.5),
    treeDensity: clamp(p.treeDensity, 0, 1),
    includeFreeway: Boolean(p.includeFreeway),
    freewayElevation: clamp(p.freewayElevation, 4.5, 14),
  };
}

function placement(
  key: string,
  label: string,
  kind: CommunityPlacementKind,
  position: readonly [number, number, number],
  rotationY: number,
  size: readonly [number, number, number],
  variant: string,
  metadata: Readonly<Record<string, unknown>> = {},
): CommunityPlacement {
  return { key, label, kind, position, rotationY, size, variant, metadata };
}

function rowPositions(count: number, siteWidth: number): number[] {
  const edge = siteWidth * 0.5 - 16;
  const centerGap = 12;
  const leftCount = Math.ceil(count / 2);
  const rightCount = count - leftCount;
  const side = (amount: number, sign: -1 | 1): number[] => {
    if (amount <= 0) return [];
    if (amount === 1) return [sign * ((edge + centerGap) * 0.5)];
    return Array.from({ length: amount }, (_, index) => {
      const t = index / (amount - 1);
      return sign < 0
        ? -edge + (edge - centerGap) * t
        : centerGap + (edge - centerGap) * t;
    });
  };
  return [...side(leftCount, -1), ...side(rightCount, 1)];
}

function addWallRun(
  out: CommunityPlacement[],
  key: string,
  label: string,
  start: Vec3,
  end: Vec3,
  wallHeight: number,
): void {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dz, dx);
  const modules = grammarResample(length, [{
    key: "wall-bay",
    label: "围墙标准段",
    prefab: "community-wall-bay",
    length: 4,
    mode: "repeat",
    minCount: 1,
  }]);
  for (const module of modules) {
    const t = module.center / length;
    out.push(placement(
      `${key}-${module.instance}`,
      label,
      "wall",
      [start.x + dx * t, 0, start.z + dz * t],
      yaw,
      [module.length, wallHeight, 0.24],
      "stone-and-steel",
      { grammarModule: module.prefab, run: key },
    ));
  }
}

function treeCandidates(siteWidth: number, siteDepth: number): Array<[number, number]> {
  const candidates: Array<[number, number]> = [];
  const halfW = siteWidth * 0.5;
  const halfD = siteDepth * 0.5;
  for (let x = -halfW + 7; x <= halfW - 7; x += 8) {
    if (Math.abs(x) > 10) candidates.push([x, halfD - 5], [x, -halfD + 5]);
  }
  for (let z = -halfD + 10; z <= halfD - 10; z += 9) {
    candidates.push([-halfW + 5, z], [halfW - 5, z]);
  }
  candidates.push([-7, -6], [7, -6], [-7, 7], [7, 7], [-25, 0], [25, 0]);
  return candidates;
}

/** Generate deterministic semantic placements before any mesh is built. */
export function generateResidentialCommunityGrammar(
  params: Partial<ResidentialCommunityParams> = {},
): ResidentialCommunityLayout {
  const p = normalizedParams(params);
  const rng = makeRng(p.seed >>> 0);
  const out: CommunityPlacement[] = [];
  const halfW = p.siteWidth * 0.5;
  const halfD = p.siteDepth * 0.5;
  const entranceGap = 16;

  addWallRun(out, "north", "北侧围墙", vec3(-halfW, 0, -halfD), vec3(halfW, 0, -halfD), p.wallHeight);
  addWallRun(out, "west", "西侧围墙", vec3(-halfW, 0, -halfD), vec3(-halfW, 0, halfD), p.wallHeight);
  addWallRun(out, "east", "东侧围墙", vec3(halfW, 0, -halfD), vec3(halfW, 0, halfD), p.wallHeight);
  addWallRun(out, "south-west", "南侧围墙", vec3(-halfW, 0, halfD), vec3(-entranceGap * 0.5, 0, halfD), p.wallHeight);
  addWallRun(out, "south-east", "南侧围墙", vec3(entranceGap * 0.5, 0, halfD), vec3(halfW, 0, halfD), p.wallHeight);

  out.push(placement("main-gate", "小区主入口", "entrance", [0, 0, halfD - 0.6], 0, [entranceGap, 5.4, 4.6], "ceremonial-gate"));

  const xs = rowPositions(p.towersPerRow, p.siteWidth);
  const rowZ = p.towerRows === 1 ? [-14] : [-19, 18];
  let towerIndex = 0;
  for (let row = 0; row < p.towerRows; row++) {
    for (let column = 0; column < xs.length; column++) {
      const floors = p.towerFloors + rng.int(-p.floorVariation, p.floorVariation);
      const width = 9.2 + rng.range(-0.45, 0.45);
      const depth = 7.2 + rng.range(-0.35, 0.35);
      out.push(placement(
        `tower-${towerIndex}`,
        `${row === 0 ? "北" : "南"}${column + 1}号住宅楼`,
        "tower",
        [xs[column]!, 0, rowZ[row]!],
        row === 0 ? Math.PI : 0,
        [width, floors * 1.08, depth],
        towerIndex % 3 === 0 ? "warm-stone" : towerIndex % 3 === 1 ? "light-stone" : "brick-accent",
        { floors, row, column },
      ));
      towerIndex++;
    }
  }

  out.push(
    placement("clubhouse", "社区会所", "amenity", [0, 0, -1], 0, [17, 5.4, 9], "clubhouse"),
    placement("playground", "儿童活动场", "amenity", [halfW - 12, 0, 4], 0, [17, 0.12, 18], "playground"),
    placement("parking", "访客停车区", "amenity", [-halfW + 12, 0, 2], 0, [18, 0.12, 22], "parking"),
    placement("water-garden", "中央水景", "amenity", [0, 0, 9], 0, [11, 0.18, 5], "water-garden"),
  );

  const trees = treeCandidates(p.siteWidth, p.siteDepth);
  const treeCount = Math.round(trees.length * p.treeDensity);
  for (let index = 0; index < treeCount; index++) {
    const [x, z] = trees[index]!;
    out.push(placement(
      `tree-${index}`,
      "景观乔木",
      "tree",
      [x + rng.range(-0.6, 0.6), 0, z + rng.range(-0.6, 0.6)],
      rng.range(0, Math.PI * 2),
      [1, rng.range(0.85, 1.18), 1],
      index % 3 === 0 ? "golden-rain" : "camphor",
      { seed: p.seed * 97 + index },
    ));
  }

  const lampPoints: Array<[number, number, number]> = [
    [-43, -28, 0], [-22, -28, 0], [22, -28, Math.PI], [43, -28, Math.PI],
    [-43, 28, 0], [-22, 28, 0], [22, 28, Math.PI], [43, 28, Math.PI],
    [-47, 0, Math.PI / 2], [47, 0, -Math.PI / 2], [-6, 30, 0], [6, 30, Math.PI],
  ];
  for (let index = 0; index < lampPoints.length; index++) {
    const [x, z, yaw] = lampPoints[index]!;
    out.push(placement(`lamp-${index}`, "庭院路灯", "lamp", [x, 0, z], yaw, [1, 5.4, 1], "ornamental"));
  }

  const benchPoints: Array<[number, number, number]> = [
    [-8, 7, 0], [8, 7, Math.PI], [-8, 12, 0], [8, 12, Math.PI],
  ];
  for (let index = 0; index < benchPoints.length; index++) {
    const [x, z, yaw] = benchPoints[index]!;
    out.push(placement(`bench-${index}`, "休憩座椅", "bench", [x, 0, z], yaw, [1.8, 1, 0.7], "wood-and-iron"));
  }

  for (let index = 0; index < 8; index++) {
    out.push(placement(
      `car-${index}`,
      "停车车辆",
      "car",
      [-halfW + 8 + (index % 2) * 7.2, 0, -6 + Math.floor(index / 2) * 4.2],
      Math.PI / 2,
      [3.8, 1.35, 1.75],
      index % 3 === 0 ? "blue" : index % 3 === 1 ? "white" : "red",
    ));
  }

  if (p.includeFreeway) {
    out.push(placement(
      "elevated-freeway",
      "小区北侧高架高速",
      "freeway",
      [0, 0, -halfD - 20],
      Math.PI / 2,
      [p.siteWidth * 1.45, p.freewayElevation, 22],
      "dual-carriageway",
      { lanesPerSide: 3 },
    ));
  }

  return {
    params: p,
    placements: out,
    rules: [
      "围墙按标准段重采样，主入口保留16米开口",
      "住宅楼分列主轴两侧，中央视线与消防通道保持畅通",
      "环路连接入口、楼栋、停车与公共活动区",
      "绿化优先布置于边界、楼间和活动区缓冲带",
      "高架高速置于北侧红线外，桥墩、隔音屏、标志架同步生成",
    ],
  };
}

class GroupBag {
  private readonly order: string[] = [];
  private readonly groups = new Map<string, { label: string; color: RGB; surface: PartSurfaceRef; meshes: Mesh[] }>();

  add(name: string, label: string, mesh: Mesh, color: RGB, surface: PartSurfaceRef): void {
    let group = this.groups.get(name);
    if (!group) {
      group = { label, color, surface, meshes: [] };
      this.groups.set(name, group);
      this.order.push(name);
    }
    group.meshes.push(mesh);
  }

  addPart(part: NamedPart, prefix: string, position: Vec3, rotationY: number): void {
    const color = part.color ?? [0.8, 0.8, 0.8];
    const surface = part.surface ?? concrete(color);
    this.add(
      `${prefix}_${part.name}`,
      part.label ?? part.name,
      transform(part.mesh, { rotate: vec3(0, rotationY, 0), translate: position }),
      color,
      surface,
    );
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
      };
    });
  }
}

function concrete(color: RGB, roughness = 0.84): PartSurfaceRef {
  return { type: "concrete", params: { color, roughness } };
}

function metal(color: RGB, roughness = 0.44): PartSurfaceRef {
  return { type: "metal", params: { color, roughness } };
}

function ceramic(color: RGB, roughness = 0.46): PartSurfaceRef {
  return { type: "ceramic", params: { color, roughness } };
}

function glass(tint: RGB): PartSurfaceRef {
  return { type: "glass", params: { tint, roughness: 0.08 } };
}

function roadMeshes(p: ResidentialCommunityParams): { sidewalks: Mesh; roads: Mesh; centerLines: Mesh; edgeLines: Mesh } {
  const halfW = p.siteWidth * 0.5;
  const halfD = p.siteDepth * 0.5;
  const curves = [
    polyline([vec3(0, 0, halfD), vec3(0, 0, 28)]),
    polyline([vec3(-halfW + 9, 0, 28), vec3(halfW - 9, 0, 28)]),
    polyline([vec3(-halfW + 9, 0, -28), vec3(halfW - 9, 0, -28)]),
    polyline([vec3(-halfW + 9, 0, -28), vec3(-halfW + 9, 0, 28)]),
    polyline([vec3(halfW - 9, 0, -28), vec3(halfW - 9, 0, 28)]),
  ];
  const sidewalks = curves.map((curve) => roadRibbon(curve, {
    halfWidth: 4.7,
    sampleDistance: 2,
    widthSubdivisions: 2,
    verticalOffset: 0.015,
  }));
  const roads = curves.map((curve) => roadRibbon(curve, {
    halfWidth: 3.35,
    sampleDistance: 2,
    widthSubdivisions: 2,
    verticalOffset: 0.055,
  }));
  const centerLines = curves.map((curve) => roadCenterLine(curve, {
    halfWidth: 3.35,
    sampleDistance: 2,
    verticalOffset: 0.085,
    lineWidth: 0.1,
  }));
  const edgeLines = curves.map((curve) => roadEdgeLines(curve, {
    halfWidth: 3.35,
    sampleDistance: 2,
    verticalOffset: 0.088,
    lineWidth: 0.08,
    edgeInset: 0.24,
  }));
  return {
    sidewalks: merge(...sidewalks),
    roads: merge(...roads),
    centerLines: merge(...centerLines),
    edgeLines: merge(...edgeLines),
  };
}

function addTower(bag: GroupBag, item: CommunityPlacement, seed: number): void {
  const [width, , depth] = item.size;
  const floors = Number(item.metadata.floors);
  const parts = buildUrbanBuildingParts({
    style: "artDeco",
    width,
    depth,
    floors,
    floorHeight: 1.08,
    baysX: 6,
    baysZ: 4,
    podiumFloors: 1,
    podiumOverhang: 0.35,
    setbackEvery: 0,
    verticalPiers: true,
    crown: "flat",
    crownHeight: 0.7,
    seed,
  });
  const position = vec3(...item.position);
  for (const part of parts) bag.addPart(part, `community_tower_${item.variant}`, position, item.rotationY);

  const balconySlabs: Mesh[] = [];
  const balconyRails: Mesh[] = [];
  for (let floor = 3; floor <= floors; floor += 2) {
    const y = 1.35 + floor * 1.08;
    for (const side of [-1, 1]) {
      const localX = side * width * 0.25;
      balconySlabs.push(transform(box(width * 0.34, 0.1, 1.05), {
        translate: vec3(localX, y, depth * 0.5 + 0.42),
      }));
      balconyRails.push(transform(box(width * 0.34, 0.55, 0.045), {
        translate: vec3(localX, y + 0.34, depth * 0.5 + 0.98),
      }));
    }
  }
  const balconyPosition = vec3(...item.position);
  bag.add("community_tower_balcony_slabs", "住宅阳台板", transform(merge(...balconySlabs), {
    rotate: vec3(0, item.rotationY, 0),
    translate: balconyPosition,
  }), COLORS.concreteLight, concrete(COLORS.concreteLight, 0.72));
  bag.add("community_tower_balcony_glass", "住宅阳台玻璃", transform(merge(...balconyRails), {
    rotate: vec3(0, item.rotationY, 0),
    translate: balconyPosition,
  }), COLORS.glass, glass(COLORS.glass));
}

function addWall(bag: GroupBag, item: CommunityPlacement): void {
  const [length, height, depth] = item.size;
  const position = vec3(...item.position);
  const base = transform(box(length, 0.38, depth * 1.8), {
    rotate: vec3(0, item.rotationY, 0),
    translate: vec3(position.x, 0.19, position.z),
  });
  const cap = transform(box(length + 0.12, 0.12, depth * 2.1), {
    rotate: vec3(0, item.rotationY, 0),
    translate: vec3(position.x, height, position.z),
  });
  const panel = transform(box(length - 0.22, height - 0.42, depth), {
    rotate: vec3(0, item.rotationY, 0),
    translate: vec3(position.x, height * 0.5 + 0.18, position.z),
  });
  bag.add("community_wall_base", "围墙石基", base, COLORS.concrete, concrete(COLORS.concrete));
  bag.add("community_wall_cap", "围墙压顶", cap, COLORS.concreteLight, concrete(COLORS.concreteLight, 0.75));
  bag.add("community_wall_panels", "围墙金属栏片", panel, COLORS.steel, metal(COLORS.steel));
}

function addEntrance(bag: GroupBag, item: CommunityPlacement): void {
  const z = item.position[2];
  const columns = [-6.5, 6.5].map((x) => transform(box(1.15, 5.2, 1.15), { translate: vec3(x, 2.6, z) }));
  bag.add("community_gate_columns", "入口门柱", merge(...columns), COLORS.concreteLight, concrete(COLORS.concreteLight, 0.7));
  bag.add("community_gate_canopy", "入口门廊", transform(box(15.2, 0.65, 4.4), { translate: vec3(0, 4.8, z) }), COLORS.steel, metal(COLORS.steel, 0.36));
  bag.add("community_gate_sign", "小区标识牌", transform(box(6.8, 1.05, 0.22), { translate: vec3(0, 5.35, z + 2.18) }), [0.78, 0.63, 0.27], metal([0.78, 0.63, 0.27], 0.3));
  bag.add("community_guardhouse", "入口岗亭", transform(box(3.4, 2.8, 3.2), { translate: vec3(-8.8, 1.4, z - 2.2) }), COLORS.concreteLight, concrete(COLORS.concreteLight));
  bag.add("community_guardhouse_glass", "岗亭玻璃", transform(box(2.7, 1.25, 0.08), { translate: vec3(-8.8, 1.75, z - 0.56) }), COLORS.glass, glass(COLORS.glass));
  bag.add("community_gate_barriers", "车辆道闸", merge(
    transform(cylinder(0.1, 5.2, 10), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(-3.4, 1.05, z - 3) }),
    transform(cylinder(0.1, 5.2, 10), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(3.4, 1.05, z - 3) }),
  ), [0.9, 0.15, 0.1], metal([0.9, 0.15, 0.1], 0.38));
}

function addClubhouse(bag: GroupBag, item: CommunityPlacement): void {
  const [x, , z] = item.position;
  bag.add("community_clubhouse", "社区会所主体", transform(box(17, 4.8, 9), { translate: vec3(x, 2.4, z) }), [0.68, 0.62, 0.53], concrete([0.68, 0.62, 0.53], 0.7));
  bag.add("community_clubhouse_roof", "会所挑檐", transform(box(18.2, 0.35, 10.2), { translate: vec3(x, 5, z) }), COLORS.steel, metal(COLORS.steel, 0.38));
  bag.add("community_clubhouse_glass", "会所落地玻璃", transform(box(12.35, 2.55, 0.08), { translate: vec3(x, 2.25, z + 4.48) }), COLORS.glass, glass(COLORS.glass));
  const mullions = Array.from({ length: 7 }, (_, index) => transform(box(0.08, 2.8, 0.14), {
    translate: vec3(x - 6 + index * 2, 2.3, z + 4.62),
  }));
  bag.add("community_clubhouse_frames", "会所玻璃框", merge(...mullions), COLORS.steel, metal(COLORS.steel));
}

function addPlayground(bag: GroupBag, item: CommunityPlacement): void {
  const [x, , z] = item.position;
  bag.add("community_playground_floor", "儿童活动场地坪", transform(box(17, 0.12, 18), { translate: vec3(x, 0.08, z) }), COLORS.playground, { type: "rubber", params: { color: COLORS.playground, roughness: 0.82 } });
  const posts = [-2.6, 2.6].flatMap((px) => [-2.2, 2.2].map((pz) => transform(cylinder(0.12, 2.8, 12), { translate: vec3(x + px, 1.4, z + pz) })));
  bag.add("community_playground_posts", "组合游具立柱", merge(...posts), COLORS.playgroundAccent, metal(COLORS.playgroundAccent, 0.5));
  bag.add("community_playground_platform", "组合游具平台", transform(box(5.5, 0.22, 4.8), { translate: vec3(x, 2.1, z) }), [0.95, 0.72, 0.12], metal([0.95, 0.72, 0.12], 0.52));
  bag.add("community_playground_slide", "儿童滑梯", transform(box(1.4, 0.18, 5.2), { rotate: vec3(-0.42, 0, 0), translate: vec3(x + 1.8, 1.15, z + 4.3) }), COLORS.playgroundAccent, { type: "plastic", params: { color: COLORS.playgroundAccent, roughness: 0.38 } });
  bag.add("community_playground_roof", "游具遮阳顶", transform(cone(3.2, 1.4, 4, true), { rotate: vec3(0, Math.PI / 4, 0), translate: vec3(x, 4, z) }), [0.95, 0.35, 0.12], metal([0.95, 0.35, 0.12], 0.48));
}

function addParking(bag: GroupBag, item: CommunityPlacement): void {
  const [x, , z] = item.position;
  bag.add("community_parking_pad", "访客停车地坪", transform(box(18, 0.1, 22), { translate: vec3(x, 0.07, z) }), COLORS.parking, concrete(COLORS.parking, 0.93));
  const stripes: Mesh[] = [];
  for (let row = 0; row < 5; row++) {
    for (const side of [-1, 1]) {
      stripes.push(transform(box(0.08, 0.025, 3.6), { translate: vec3(x + side * 3.6, 0.135, z - 8 + row * 4.2) }));
      stripes.push(transform(box(6.8, 0.025, 0.08), { translate: vec3(x + side * 3.6, 0.135, z - 9.8 + row * 4.2) }));
    }
  }
  bag.add("community_parking_lines", "停车位标线", merge(...stripes), COLORS.paint, ceramic(COLORS.paint));
}

function addWaterGarden(bag: GroupBag, item: CommunityPlacement): void {
  const [x, , z] = item.position;
  bag.add("community_water_basin", "中央水景池体", transform(box(12, 0.35, 6), { translate: vec3(x, 0.18, z) }), COLORS.concreteLight, concrete(COLORS.concreteLight, 0.72));
  bag.add("community_water_surface", "中央水景水面", transform(box(11.3, 0.08, 5.3), { translate: vec3(x, 0.4, z) }), COLORS.water, { type: "liquid", params: { tint: COLORS.water, roughness: 0.08 } });
  const jets = [-3.5, 0, 3.5].map((jx) => transform(cylinder(0.07, 1.6, 8), { translate: vec3(x + jx, 1.15, z) }));
  bag.add("community_water_jets", "水景喷泉", merge(...jets), [0.55, 0.8, 0.9], { type: "glass", params: { tint: [0.55, 0.8, 0.9], roughness: 0.05 } });
}

function addTree(bag: GroupBag, item: CommunityPlacement): void {
  const [x, , z] = item.position;
  const scale = item.size[1];
  bag.add("community_tree_trunks", "景观乔木树干", transform(cylinder(0.22 * scale, 3.5 * scale, 10), { translate: vec3(x, 1.75 * scale, z) }), COLORS.trunk, { type: "bark", params: { color: COLORS.trunk, scale: 8 } });
  const crownColor = item.variant === "golden-rain" ? COLORS.grassLight : COLORS.canopy;
  const crowns = [
    transform(sphere(1.55 * scale, 14, 10), { scale: vec3(1, 0.78, 0.9), translate: vec3(x, 4.1 * scale, z) }),
    transform(sphere(1.1 * scale, 12, 8), { translate: vec3(x - 0.8 * scale, 4.45 * scale, z + 0.3 * scale) }),
    transform(sphere(1.05 * scale, 12, 8), { translate: vec3(x + 0.85 * scale, 4.35 * scale, z - 0.25 * scale) }),
  ];
  bag.add("community_tree_canopies", "景观乔木树冠", merge(...crowns), crownColor, { type: "leaf", params: { color: crownColor, roughness: 0.78 } });
}

function addCar(bag: GroupBag, item: CommunityPlacement): void {
  const [x, , z] = item.position;
  const colors: Record<string, RGB> = { blue: [0.08, 0.25, 0.48], white: [0.82, 0.84, 0.82], red: [0.55, 0.08, 0.06] };
  const color = colors[item.variant] ?? colors.blue!;
  const local = merge(
    transform(box(3.8, 0.55, 1.75), { translate: vec3(0, 0.58, 0) }),
    transform(box(2.05, 0.62, 1.58), { translate: vec3(-0.15, 1.08, 0) }),
  );
  bag.add("community_parked_cars", "停车车辆车身", transform(local, { rotate: vec3(0, item.rotationY, 0), translate: vec3(x, 0, z) }), color, metal(color, 0.3));
  const glassMesh = transform(box(1.55, 0.46, 1.62), { translate: vec3(-0.15, 1.12, 0) });
  bag.add("community_car_glass", "停车车辆玻璃", transform(glassMesh, { rotate: vec3(0, item.rotationY, 0), translate: vec3(x, 0, z) }), COLORS.glass, glass(COLORS.glass));
}

function addHedges(bag: GroupBag, p: ResidentialCommunityParams): void {
  const halfW = p.siteWidth * 0.5;
  const hedges: Mesh[] = [
    transform(box(p.siteWidth - 22, 1.05, 1.1), { translate: vec3(0, 0.53, -p.siteDepth * 0.5 + 3.2) }),
    transform(box(p.siteWidth - 22, 1.05, 1.1), { translate: vec3(0, 0.53, p.siteDepth * 0.5 - 3.2) }),
    transform(box(1.1, 1.05, p.siteDepth - 18), { translate: vec3(-halfW + 3.2, 0.53, 0) }),
    transform(box(1.1, 1.05, p.siteDepth - 18), { translate: vec3(halfW - 3.2, 0.53, 0) }),
  ];
  bag.add("community_hedges", "修剪绿篱", merge(...hedges), COLORS.hedge, { type: "leaf", params: { color: COLORS.hedge, roughness: 0.84 } });
}

/** Build complete residential community as semantic, materialed parts. */
export function buildResidentialCommunityParts(
  params: Partial<ResidentialCommunityParams> = {},
): NamedPart[] {
  const layout = generateResidentialCommunityGrammar(params);
  const p = layout.params;
  const bag = new GroupBag();

  bag.add("community_ground", "小区绿化基底", transform(box(p.siteWidth, 0.16, p.siteDepth), { translate: vec3(0, -0.1, 0) }), COLORS.grass, { type: "grass", params: { color: COLORS.grass, roughness: 0.98, seed: p.seed } });
  const roads = roadMeshes(p);
  bag.add("community_sidewalks", "小区人行道", roads.sidewalks, COLORS.sidewalk, concrete(COLORS.sidewalk, 0.86));
  bag.add("community_roads", "小区内部环路", roads.roads, COLORS.asphalt, concrete(COLORS.asphalt, 0.94));
  bag.add("community_center_lines", "道路中心线", roads.centerLines, COLORS.paint, ceramic(COLORS.paint));
  bag.add("community_edge_lines", "道路边线", roads.edgeLines, COLORS.paint, ceramic(COLORS.paint));

  const crosswalks: Mesh[] = [];
  for (let index = -4; index <= 4; index++) {
    crosswalks.push(transform(box(0.55, 0.025, 4.8), { translate: vec3(index * 0.9, 0.1, p.siteDepth * 0.5 - 8) }));
  }
  bag.add("community_crosswalk", "入口人行横道", merge(...crosswalks), COLORS.paint, ceramic(COLORS.paint));
  addHedges(bag, p);

  for (const item of layout.placements) {
    if (item.kind === "tower") addTower(bag, item, p.seed * 101 + Number(item.key.split("-")[1]));
    else if (item.kind === "wall") addWall(bag, item);
    else if (item.kind === "entrance") addEntrance(bag, item);
    else if (item.kind === "tree") addTree(bag, item);
    else if (item.kind === "car") addCar(bag, item);
    else if (item.kind === "lamp") {
      const parts = buildStreetLampParts({ height: 5.2, style: "ornamental", armReach: 1, base: true });
      for (const part of parts) bag.addPart(part, "community_lamp", vec3(...item.position), item.rotationY);
    } else if (item.kind === "bench") {
      const parts = buildParkBenchParts({ length: 1.8, slats: 5, backrest: true, armrests: true });
      for (const part of parts) bag.addPart(part, "community_bench", vec3(...item.position), item.rotationY);
    } else if (item.kind === "amenity" && item.variant === "clubhouse") addClubhouse(bag, item);
    else if (item.kind === "amenity" && item.variant === "playground") addPlayground(bag, item);
    else if (item.kind === "amenity" && item.variant === "parking") addParking(bag, item);
    else if (item.kind === "amenity" && item.variant === "water-garden") addWaterGarden(bag, item);
    else if (item.kind === "freeway") {
      const freeway = buildFreewayParts({
        length: item.size[0],
        bend: 5,
        lanesPerSide: 3,
        laneWidth: 3.4,
        medianWidth: 1.3,
        elevation: p.freewayElevation,
        guardrails: true,
        pillars: true,
        pillarSpacing: 15,
        signGantry: true,
        signSpacing: 52,
        lightPoles: true,
        lightSpacing: 24,
        noiseBarrier: true,
        barrierHeight: 2.8,
        deckThickness: 0.75,
        sample: 2,
      });
      for (const part of freeway) bag.addPart(part, "community_freeway", vec3(...item.position), item.rotationY);
    }
  }

  return bag.toParts();
}
