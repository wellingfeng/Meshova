/**
 * Procedural medieval castles based on the defensive principles explained in
 * Bilibili BV18W411x7vc: layered wards, flanking towers, hardened gates,
 * protected circulation, a final keep, and siege-resilient service spaces.
 */
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
} from "../geometry/index.js";
import { vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";

export type CastleVariant = "concentric" | "ridge" | "river";

export interface ProceduralCastleOptions {
  variant?: CastleVariant;
  seed?: number;
  scale?: number;
  wallHeight?: number;
  towerScale?: number;
  detail?: number;
  colorVariation?: number;
}

export const PROCEDURAL_CASTLE_DEFAULTS: Required<ProceduralCastleOptions> = {
  variant: "concentric",
  seed: 1520,
  scale: 1,
  wallHeight: 1,
  towerScale: 1,
  detail: 1,
  colorVariation: 0.08,
};

const SOURCE_URL = "https://www.bilibili.com/video/BV18W411x7vc";
const STONE: LowPolyColor = [0.47, 0.45, 0.41];
const STONE_LIGHT: LowPolyColor = [0.62, 0.59, 0.53];
const STONE_DARK: LowPolyColor = [0.31, 0.31, 0.3];
const ROOF: LowPolyColor = [0.16, 0.18, 0.2];
const WOOD: LowPolyColor = [0.31, 0.19, 0.1];
const METAL: LowPolyColor = [0.12, 0.13, 0.14];
const BANNER: LowPolyColor = [0.48, 0.07, 0.08];
const EARTH: LowPolyColor = [0.28, 0.24, 0.18];
const GRASS: LowPolyColor = [0.25, 0.39, 0.19];
const WATER: LowPolyColor = [0.08, 0.29, 0.42];

type PointXZ = readonly [number, number];
type Surface = NonNullable<NamedPart["surface"]>;

interface Bucket {
  label: string;
  color: LowPolyColor;
  surface: Surface;
  meshes: Mesh[];
}

class CastleParts {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly seed: number,
    private readonly variation: number,
    private readonly variant: CastleVariant,
  ) {}

  add(
    name: string,
    label: string,
    mesh: Mesh,
    color: LowPolyColor,
    material: Surface["type"] = "stone",
    roughness = 0.9,
  ): void {
    let bucket = this.buckets.get(name);
    if (!bucket) {
      bucket = {
        label,
        color,
        surface: { type: material, params: { color, roughness, seed: this.seed } },
        meshes: [],
      };
      this.buckets.set(name, bucket);
    }
    bucket.meshes.push(mesh);
  }

  finish(scale: number): NamedPart[] {
    let index = 0;
    return [...this.buckets.entries()].map(([name, bucket]) => {
      const styled = styleLowPolyMesh(merge(...bucket.meshes), bucket.color, {
        seed: this.seed + index++ * 977,
        colorVariation: this.variation,
      });
      return {
        name,
        label: bucket.label,
        mesh: scale === 1 ? styled.mesh : scaleMesh(styled.mesh, vec3(scale, scale, scale)),
        colors: styled.colors,
        color: bucket.color,
        surface: bucket.surface,
        metadata: {
          sourceStudy: SOURCE_URL,
          castleVariant: this.variant,
          principles: [
            "分层防御",
            "塔楼侧射",
            "强化门区",
            "内堡终局据点",
            "院落功能分区",
          ],
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
  rotationY = 0,
  scale: readonly [number, number, number] = [1, 1, 1],
): Mesh {
  return translateMesh(
    rotateMesh(scaleMesh(mesh, vec3(scale[0], scale[1], scale[2])), vec3(0, rotationY, 0)),
    vec3(x, y, z),
  );
}

function localPoint(center: PointXZ, yaw: number, x: number, z: number): PointXZ {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [center[0] + x * c + z * s, center[1] - x * s + z * c];
}

function wallSegmentMesh(a: PointXZ, b: PointXZ, height: number, thickness: number, baseY: number): Mesh {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  const yaw = -Math.atan2(dz, dx);
  return placed(box(length, height, thickness), (a[0] + b[0]) * 0.5, baseY + height * 0.5, (a[1] + b[1]) * 0.5, yaw);
}

function addWall(
  parts: CastleParts,
  a: PointXZ,
  b: PointXZ,
  height: number,
  thickness: number,
  baseY: number,
  detail: number,
  inner = false,
): void {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  const yaw = -Math.atan2(dz, dx);
  const nx = -dz / length;
  const nz = dx / length;
  parts.add(
    inner ? "inner_curtain_walls" : "outer_curtain_walls",
    inner ? "内层幕墙" : "外层幕墙",
    wallSegmentMesh(a, b, height, thickness, baseY),
    inner ? STONE_LIGHT : STONE,
  );
  parts.add(
    "wall_walks",
    "城墙巡逻道",
    placed(box(length - 0.15, 0.16, thickness * 1.05), (a[0] + b[0]) * 0.5, baseY + height + 0.08, (a[1] + b[1]) * 0.5, yaw),
    STONE_LIGHT,
  );

  const spacing = Math.max(0.72, 1.55 / detail);
  const count = Math.max(2, Math.floor(length / spacing));
  const merlonWidth = Math.min(0.72, length / (count * 1.75));
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i <= count; i++) {
      if (i % 2 === 1) continue;
      const t = i / count;
      const x = a[0] + dx * t + nx * side * thickness * 0.42;
      const z = a[1] + dz * t + nz * side * thickness * 0.42;
      parts.add(
        "battlements",
        "垛口与女墙",
        placed(box(merlonWidth, 0.65, 0.34), x, baseY + height + 0.4, z, yaw),
        STONE_LIGHT,
      );
    }
  }
}

function regularPolygon(radius: number, count: number, sideCenteredAngle = -Math.PI / 2): PointXZ[] {
  const first = sideCenteredAngle - Math.PI / count;
  return Array.from({ length: count }, (_, index) => {
    const angle = first + index * Math.PI * 2 / count;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius] as const;
  });
}

function addCurtainRing(
  parts: CastleParts,
  points: readonly PointXZ[],
  height: number,
  thickness: number,
  baseY: number,
  detail: number,
  gateSide: number,
  gateWidth: number,
  inner = false,
): void {
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    if (i !== gateSide) {
      addWall(parts, a, b, height, thickness, baseY, detail, inner);
      continue;
    }
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    const gap = Math.min(gateWidth, length * 0.6) / length;
    const leftEnd: PointXZ = [a[0] + dx * (0.5 - gap * 0.5), a[1] + dz * (0.5 - gap * 0.5)];
    const rightStart: PointXZ = [a[0] + dx * (0.5 + gap * 0.5), a[1] + dz * (0.5 + gap * 0.5)];
    addWall(parts, a, leftEnd, height, thickness, baseY, detail, inner);
    addWall(parts, rightStart, b, height, thickness, baseY, detail, inner);
  }
}

function addRoundTower(
  parts: CastleParts,
  center: PointXZ,
  radius: number,
  height: number,
  baseY: number,
  detail: number,
  roofed = false,
): void {
  const segments = Math.max(10, Math.round(12 * detail));
  const foundationEmbed = 0.08;
  parts.add(
    "flanking_towers",
    "侧射圆塔",
    placed(
      cylinder(radius, height + foundationEmbed, segments),
      center[0],
      baseY + (height - foundationEmbed) * 0.5,
      center[1],
    ),
    STONE,
  );
  parts.add(
    "tower_crowns",
    "塔顶战斗平台",
    placed(cylinder(radius * 1.08, 0.24, segments), center[0], baseY + height + 0.12, center[1]),
    STONE_LIGHT,
  );
  const merlons = Math.max(6, Math.round(8 * detail));
  for (let i = 0; i < merlons; i++) {
    const angle = i / merlons * Math.PI * 2;
    const x = center[0] + Math.cos(angle) * radius * 0.91;
    const z = center[1] + Math.sin(angle) * radius * 0.91;
    parts.add(
      "battlements",
      "垛口与女墙",
      placed(box(0.5, 0.65, 0.34), x, baseY + height + 0.48, z, -angle),
      STONE_LIGHT,
    );
  }
  for (const angle of [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5]) {
    const x = center[0] + Math.cos(angle) * (radius + 0.015);
    const z = center[1] + Math.sin(angle) * (radius + 0.015);
    parts.add(
      "arrow_slits",
      "箭孔",
      placed(box(0.11, 0.62, 0.045), x, baseY + height * 0.62, z, -angle),
      METAL,
      "metal",
      0.7,
    );
  }
  if (roofed) {
    parts.add(
      "tower_roofs",
      "塔楼尖顶",
      placed(cone(radius * 1.28, radius * 2.35, segments), center[0], baseY + height + radius * 1.15, center[1]),
      ROOF,
      "stone",
      0.82,
    );
  }
}

function addGatehouse(
  parts: CastleParts,
  center: PointXZ,
  yaw: number,
  width: number,
  height: number,
  baseY: number,
  detail: number,
  roofed = false,
): void {
  const radius = width * 0.28;
  const towerOffset = width * 0.5 + radius * 0.62;
  const left = localPoint(center, yaw, -towerOffset, 0);
  const right = localPoint(center, yaw, towerOffset, 0);
  addRoundTower(parts, left, radius, height * 1.08, baseY, detail, roofed);
  addRoundTower(parts, right, radius, height * 1.08, baseY, detail, roofed);

  const upperHeight = height * 0.38;
  const upperY = baseY + height * 0.77;
  parts.add(
    "gatehouses",
    "双塔门楼",
    placed(box(width + radius * 1.35, upperHeight, radius * 1.75), center[0], upperY, center[1], yaw),
    STONE_LIGHT,
  );
  const barCount = 7;
  for (let i = 0; i < barCount; i++) {
    const x = -width * 0.42 + i * width * 0.84 / (barCount - 1);
    const position = localPoint(center, yaw, x, radius * 0.9);
    parts.add(
      "portcullises",
      "闸门与落栅",
      placed(box(0.075, height * 0.66, 0.075), position[0], baseY + height * 0.33, position[1], yaw),
      METAL,
      "metal",
      0.63,
    );
  }
  const beamCount = 3;
  for (let i = 0; i < beamCount; i++) {
    const position = localPoint(center, yaw, 0, radius * 0.9);
    parts.add(
      "portcullises",
      "闸门与落栅",
      placed(box(width * 0.92, 0.075, 0.075), position[0], baseY + height * (0.16 + i * 0.2), position[1], yaw),
      METAL,
      "metal",
      0.63,
    );
  }
}

function addKeep(
  parts: CastleParts,
  center: PointXZ,
  width: number,
  depth: number,
  height: number,
  baseY: number,
  detail: number,
  roofed: boolean,
): void {
  parts.add(
    "central_keep",
    "中央内堡",
    placed(box(width, height, depth), center[0], baseY + height * 0.5, center[1]),
    STONE_LIGHT,
  );
  const corners: PointXZ[] = [
    [center[0] - width * 0.5, center[1] - depth * 0.5],
    [center[0] + width * 0.5, center[1] - depth * 0.5],
    [center[0] + width * 0.5, center[1] + depth * 0.5],
    [center[0] - width * 0.5, center[1] + depth * 0.5],
  ];
  for (const corner of corners) addRoundTower(parts, corner, width * 0.15, height * 1.06, baseY, detail, roofed);

  for (const [a, b] of [
    [corners[0]!, corners[1]!],
    [corners[1]!, corners[2]!],
    [corners[2]!, corners[3]!],
    [corners[3]!, corners[0]!],
  ] as const) {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    const count = Math.max(4, Math.floor(length * detail / 1.2));
    const yaw = -Math.atan2(dz, dx);
    for (let i = 0; i <= count; i += 2) {
      const t = i / count;
      parts.add(
        "battlements",
        "垛口与女墙",
        placed(box(0.58, 0.68, 0.38), a[0] + dx * t, baseY + height + 0.38, a[1] + dz * t, yaw),
        STONE_LIGHT,
      );
    }
  }
  parts.add(
    "keep_entrance",
    "内堡入口",
    placed(box(width * 0.22, height * 0.42, 0.08), center[0], baseY + height * 0.21 + 0.03, center[1] - depth * 0.505),
    WOOD,
    "wood",
    0.84,
  );
}

function addHall(
  parts: CastleParts,
  center: PointXZ,
  width: number,
  depth: number,
  height: number,
  baseY: number,
  yaw = 0,
): void {
  parts.add(
    "ward_buildings",
    "院落厅堂与兵营",
    placed(box(width, height, depth), center[0], baseY + height * 0.5, center[1], yaw),
    STONE_LIGHT,
  );
  const roofRise = width * 0.26;
  const slope = Math.atan2(roofRise, width * 0.5);
  const roofWidth = Math.hypot(width * 0.5, roofRise) + 0.18;
  for (const side of [-1, 1]) {
    const local = localPoint(center, yaw, side * width * 0.25, 0);
    const roof = rotateMesh(box(roofWidth, 0.18, depth + 0.35), vec3(0, yaw, side * -slope));
    parts.add(
      "ward_roofs",
      "院落建筑屋顶",
      translateMesh(roof, vec3(local[0], baseY + height + roofRise * 0.5, local[1])),
      ROOF,
      "stone",
      0.82,
    );
  }
}

function addWell(parts: CastleParts, center: PointXZ, baseY: number): void {
  parts.add(
    "siege_well",
    "围城水井",
    placed(cylinder(0.7, 0.72, 16), center[0], baseY + 0.36, center[1]),
    STONE_LIGHT,
  );
  parts.add(
    "siege_well",
    "围城水井",
    placed(cylinder(0.48, 0.06, 16), center[0], baseY + 0.76, center[1]),
    METAL,
    "metal",
    0.74,
  );
}

function addBridge(
  parts: CastleParts,
  center: PointXZ,
  yaw: number,
  length: number,
  width: number,
  baseY: number,
): void {
  parts.add(
    "gate_bridges",
    "门前吊桥与引道",
    placed(box(width, 0.28, length), center[0], baseY, center[1], yaw),
    WOOD,
    "wood",
    0.86,
  );
  for (const side of [-1, 1]) {
    const rail = localPoint(center, yaw, side * width * 0.46, 0);
    parts.add(
      "gate_bridges",
      "门前吊桥与引道",
      placed(box(0.12, 0.52, length), rail[0], baseY + 0.34, rail[1], yaw),
      WOOD,
      "wood",
      0.86,
    );
  }
}

function addSupplies(
  parts: CastleParts,
  center: PointXZ,
  radius: number,
  baseY: number,
  count: number,
  seed: number,
): void {
  const rng = makeRng(seed);
  for (let i = 0; i < count; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const distance = rng.range(radius * 0.35, radius);
    const x = center[0] + Math.cos(angle) * distance;
    const z = center[1] + Math.sin(angle) * distance;
    if (i % 2 === 0) {
      parts.add(
        "siege_stores",
        "粮仓与围城储备",
        placed(box(0.55, 0.55, 0.55), x, baseY + 0.275, z, rng.range(-0.3, 0.3)),
        WOOD,
        "wood",
        0.88,
      );
    } else {
      parts.add(
        "siege_stores",
        "粮仓与围城储备",
        placed(cylinder(0.29, 0.7, 10), x, baseY + 0.35, z),
        WOOD,
        "wood",
        0.88,
      );
    }
  }
}

function addBanner(parts: CastleParts, center: PointXZ, baseY: number, height: number): void {
  parts.add(
    "standards",
    "城堡旗帜",
    placed(cylinder(0.055, height, 8), center[0], baseY + height * 0.5, center[1]),
    METAL,
    "metal",
    0.64,
  );
  parts.add(
    "standards",
    "城堡旗帜",
    placed(box(0.9, 0.48, 0.04), center[0] + 0.45, baseY + height * 0.78, center[1]),
    BANNER,
    "fabric",
    0.76,
  );
}

function buildConcentric(parts: CastleParts, p: Required<ProceduralCastleOptions>): void {
  const wall = 4.15 * p.wallHeight;
  const towerHeight = 5.5 * p.wallHeight * p.towerScale;
  parts.add("terrain", "城堡台地", placed(cylinder(15.2, 1.1, 12), 0, -0.55, 0), GRASS, "foliage", 0.96);
  parts.add("moat", "环形护城河", placed(cylinder(13.9, 0.12, 48), 0, -0.02, 0), WATER, "water", 0.2);
  parts.add("terrain", "城堡台地", placed(cylinder(12.8, 0.22, 48), 0, 0.04, 0), EARTH, "stone", 0.98);

  const outer = regularPolygon(11.4, 10);
  addCurtainRing(parts, outer, wall, 0.82, 0.1, p.detail, 0, 3.4);
  for (const point of outer) addRoundTower(parts, point, 1.25 * p.towerScale, towerHeight, 0.1, p.detail);

  const gateMid: PointXZ = [(outer[0]![0] + outer[1]![0]) * 0.5, (outer[0]![1] + outer[1]![1]) * 0.5];
  addGatehouse(parts, gateMid, 0, 3.35, towerHeight, 0.1, p.detail);
  addBridge(parts, [0, gateMid[1] - 2.6], 0, 5.5, 2.7, 0.42);

  const inner: PointXZ[] = [[-6.1, -5.4], [6.1, -5.4], [6.1, 5.4], [-6.1, 5.4]];
  addCurtainRing(parts, inner, wall * 1.12, 0.92, 0.12, p.detail, 0, 2.8, true);
  for (const point of inner) addRoundTower(parts, point, 1.05 * p.towerScale, towerHeight * 1.08, 0.12, p.detail);
  addGatehouse(parts, [0, -5.4], 0, 2.7, towerHeight * 1.02, 0.12, p.detail);

  addKeep(parts, [0.8, 1.2], 5.2, 4.8, 7.4 * p.wallHeight, 0.15, p.detail, false);
  addHall(parts, [-4, 1.1], 2.6, 4, 2.3, 0.15, Math.PI * 0.5);
  addHall(parts, [3.65, -2.5], 3.6, 1.9, 1.9, 0.15);
  addWell(parts, [-2.7, -2.15], 0.15);
  addSupplies(parts, [0, -3.35], 1.05, 0.18, Math.max(4, Math.round(8 * p.detail)), p.seed);
  addBanner(parts, [0.8, 1.2], 0.15 + 7.4 * p.wallHeight, 3.1);
}

function buildRidge(parts: CastleParts, p: Required<ProceduralCastleOptions>): void {
  const baseY = 1.15;
  const wall = 3.7 * p.wallHeight;
  parts.add(
    "terrain_platform",
    "山脊平顶承台",
    placed(frustum(17.8, 16.8, 1.5, 16), -0.3, baseY - 0.75, 0, 0, [1, 1, 0.52]),
    EARTH,
    "stone",
    0.98,
  );
  parts.add("terrain", "山脊岩台", placed(icosphere(8, 2), -1.5, -2.4, 0, 0, [1.7, 0.55, 1]), EARTH, "stone", 0.98);
  parts.add("terrain", "山脊岩台", placed(icosphere(5.8, 2), 8.2, -1.8, 1.2, 0, [1.35, 0.48, 0.8]), EARTH, "stone", 0.98);
  parts.add("terrain", "山脊岩台", placed(icosphere(5.2, 2), -10.2, -2.1, -1.4, 0, [1.05, 0.45, 0.78]), EARTH, "stone", 0.98);

  const ring: PointXZ[] = [[-12, -3.8], [-5.5, -6.6], [3.2, -6.1], [11.8, -3.1], [12.8, 3.3], [5.8, 6.4], [-3.5, 5.8], [-11.5, 3.2]];
  addCurtainRing(parts, ring, wall, 0.76, baseY, p.detail, 0, 3.1);
  for (const index of [0, 1, 3, 4, 6, 7]) {
    addRoundTower(parts, ring[index]!, 1.05 * p.towerScale, wall * 1.38 * p.towerScale, baseY, p.detail, index === 4 || index === 7);
  }
  const gate: PointXZ = [(ring[0]![0] + ring[1]![0]) * 0.5, (ring[0]![1] + ring[1]![1]) * 0.5];
  const gateYaw = -Math.atan2(ring[1]![1] - ring[0]![1], ring[1]![0] - ring[0]![0]);
  addGatehouse(parts, gate, gateYaw, 3, wall * 1.3, baseY, p.detail, true);
  addBridge(parts, [-10.1, -6.8], -0.62, 7.2, 2.45, 0.8);

  addKeep(parts, [6.1, 1.1], 4.8, 4.4, 8.4 * p.wallHeight, baseY + 0.35, p.detail, true);
  addHall(parts, [-1.5, 1.9], 5.8, 2.6, 2.7, baseY + 0.15, 0.08);
  addHall(parts, [-5.5, -2.2], 3.7, 2.2, 2.2, baseY + 0.05, -0.25);
  addWell(parts, [1.8, -2.1], baseY + 0.15);
  addSupplies(parts, [-1.4, -3.45], 1.15, baseY + 0.15, Math.max(4, Math.round(7 * p.detail)), p.seed + 31);
  addBanner(parts, [6.1, 1.1], baseY + 0.35 + 8.4 * p.wallHeight, 3.4);
}

function buildRiver(parts: CastleParts, p: Required<ProceduralCastleOptions>): void {
  const baseY = 0.55;
  const wall = 3.8 * p.wallHeight;
  parts.add("river", "河道", placed(box(38, 0.18, 26), 0, -0.2, 0), WATER, "water", 0.18);
  parts.add("terrain", "河心堡岛", placed(cylinder(13.2, 1.2, 16), 0, -0.05, 0, 0, [1, 1, 0.78]), EARTH, "stone", 0.98);
  parts.add("terrain", "河岸", placed(box(40, 0.55, 5.5), 0, 0.05, -15.3), GRASS, "foliage", 0.96);
  parts.add("terrain", "河岸", placed(box(40, 0.55, 5.5), 0, 0.05, 15.3), GRASS, "foliage", 0.96);

  const ring: PointXZ[] = [[-8.6, -7], [8.6, -7], [10.2, -3], [10.2, 3], [8.6, 7], [-8.6, 7], [-10.2, 3], [-10.2, -3]];
  addCurtainRing(parts, ring, wall, 0.84, baseY, p.detail, 0, 3.4);
  for (const index of [0, 1, 2, 3, 4, 5, 6, 7]) {
    addRoundTower(parts, ring[index]!, 1.08 * p.towerScale, wall * 1.35 * p.towerScale, baseY, p.detail, index === 2 || index === 6);
  }
  addGatehouse(parts, [0, -7], 0, 3.4, wall * 1.35, baseY, p.detail);
  addGatehouse(parts, [0, 7], Math.PI, 3.4, wall * 1.35, baseY, p.detail);
  addBridge(parts, [0, -11.4], 0, 8.8, 2.8, baseY + 0.08);
  addBridge(parts, [0, 11.4], 0, 8.8, 2.8, baseY + 0.08);

  addKeep(parts, [0.8, 0], 5.3, 4.8, 7.6 * p.wallHeight, baseY + 0.08, p.detail, false);
  addHall(parts, [-4.8, -2.7], 2.6, 4.2, 2.3, baseY + 0.08, Math.PI * 0.5);
  addHall(parts, [-4.6, 3.1], 3.4, 2.2, 2.1, baseY + 0.08);
  addWell(parts, [4.7, 3], baseY + 0.08);
  addSupplies(parts, [5.5, -3.4], 1.15, baseY + 0.08, Math.max(4, Math.round(6 * p.detail)), p.seed + 79);
  addBanner(parts, [0.8, 0], baseY + 0.08 + 7.6 * p.wallHeight, 3.1);
}

/** Build one of three deterministic castles from a shared defensive grammar. */
export function buildProceduralCastleParts(options: ProceduralCastleOptions = {}): NamedPart[] {
  const p: Required<ProceduralCastleOptions> = { ...PROCEDURAL_CASTLE_DEFAULTS, ...options };
  p.seed = Math.round(p.seed);
  p.scale = Math.max(0.25, Math.min(3, p.scale));
  p.wallHeight = Math.max(0.6, Math.min(1.8, p.wallHeight));
  p.towerScale = Math.max(0.65, Math.min(1.65, p.towerScale));
  p.detail = Math.max(0.5, Math.min(1.6, p.detail));
  p.colorVariation = Math.max(0, Math.min(0.24, p.colorVariation));

  const parts = new CastleParts(p.seed, p.colorVariation, p.variant);
  if (p.variant === "ridge") buildRidge(parts, p);
  else if (p.variant === "river") buildRiver(parts, p);
  else buildConcentric(parts, p);
  return parts.finish(p.scale);
}
