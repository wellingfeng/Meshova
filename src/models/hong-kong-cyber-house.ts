/** Hong Kong cyber street house built from Meshova primitives. */
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng, type Rng } from "../random/prng.js";
import {
  box,
  bounds,
  cylinder,
  merge,
  transform,
  translateMesh,
  triangleCount,
  type Mesh,
  type NamedPart,
  type PartSurfaceRef,
} from "../geometry/index.js";

type RGB = [number, number, number];

export interface HongKongCyberHouseParams {
  /** Total floors, including the taller retail podium floor. */
  floors: number;
  width: number;
  depth: number;
  floorHeight: number;
  /** Window/storefront bays across the street facade. */
  bays: number;
  signDensity: number;
  neonAmount: number;
  balconyDepth: number;
  utilityDensity: number;
  seed: number;
}

export interface HongKongCyberHouseSummary {
  parts: number;
  triangles: number;
  height: number;
}

export const HONG_KONG_CYBER_HOUSE_DEFAULTS: HongKongCyberHouseParams = {
  floors: 9,
  width: 8.4,
  depth: 6.2,
  floorHeight: 0.92,
  bays: 5,
  signDensity: 0.88,
  neonAmount: 0.9,
  balconyDepth: 0.62,
  utilityDensity: 0.78,
  seed: 71,
};

const COLORS = {
  wall: [0.32, 0.16, 0.22] as RGB,
  wallAlt: [0.42, 0.2, 0.22] as RGB,
  trim: [0.12, 0.15, 0.18] as RGB,
  concrete: [0.28, 0.29, 0.3] as RGB,
  metal: [0.21, 0.24, 0.27] as RGB,
  glass: [0.045, 0.12, 0.16] as RGB,
  glassLit: [0.95, 0.52, 0.17] as RGB,
  cyan: [0.02, 0.9, 0.95] as RGB,
  magenta: [1, 0.05, 0.48] as RGB,
  amber: [1, 0.52, 0.04] as RGB,
  green: [0.22, 0.9, 0.38] as RGB,
  sidewalk: [0.24, 0.25, 0.27] as RGB,
  asphalt: [0.035, 0.04, 0.05] as RGB,
};

class PartBag {
  private readonly order: string[] = [];
  private readonly groups = new Map<string, {
    label: string;
    color: RGB;
    surface: PartSurfaceRef;
    meshes: Mesh[];
  }>();

  add(name: string, label: string, mesh: Mesh, color: RGB, surface: PartSurfaceRef): void {
    let group = this.groups.get(name);
    if (!group) {
      group = { label, color, surface, meshes: [] };
      this.groups.set(name, group);
      this.order.push(name);
    }
    group.meshes.push(mesh);
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
        metadata: { style: "香港赛博街屋", reference: "BV1cf4y1h7wZ" },
      };
    });
  }
}

export function buildHongKongCyberHouseParts(
  params: Partial<HongKongCyberHouseParams> = {},
): NamedPart[] {
  const p = normalizeParams(params);
  const bag = new PartBag();
  const rng = makeRng(p.seed >>> 0);
  const podiumHeight = p.floorHeight * 1.28;
  const totalHeight = podiumHeight + (p.floors - 1) * p.floorHeight;
  const frontZ = p.depth / 2;
  const bayWidth = p.width / p.bays;

  addStreetAndShell(bag, p, totalHeight, podiumHeight);
  addStorefronts(bag, p, rng.fork(), podiumHeight, frontZ, bayWidth);
  addUpperFacade(bag, p, rng.fork(), podiumHeight, frontZ, bayWidth);
  addSideFacade(bag, p, rng.fork(), podiumHeight);
  addSignsAndNeon(bag, p, rng.fork(), podiumHeight, frontZ, bayWidth);
  addFireEscape(bag, p, podiumHeight);
  addUtilities(bag, p, rng.fork(), podiumHeight, frontZ, bayWidth, totalHeight);
  addRoof(bag, p, rng.fork(), totalHeight);
  return bag.toParts();
}

export function summarizeHongKongCyberHouse(parts: NamedPart[]): HongKongCyberHouseSummary {
  const combined = merge(...parts.map((part) => part.mesh));
  const boxBounds = bounds(combined);
  return {
    parts: parts.length,
    triangles: parts.reduce((sum, part) => sum + triangleCount(part.mesh), 0),
    height: boxBounds.max.y - boxBounds.min.y,
  };
}

function addStreetAndShell(
  bag: PartBag,
  p: HongKongCyberHouseParams,
  totalHeight: number,
  podiumHeight: number,
): void {
  bag.add(
    "building_shell",
    "街屋主体",
    translateMesh(box(p.width, totalHeight, p.depth), vec3(0, totalHeight / 2, 0)),
    COLORS.wall,
    concrete(COLORS.wall, 0.88),
  );
  bag.add(
    "service_tower",
    "侧面机电塔",
    translateMesh(
      box(p.width * 0.17, totalHeight * 0.82, p.depth * 0.34),
      vec3(-p.width * 0.56, podiumHeight + totalHeight * 0.4, -p.depth * 0.25),
    ),
    COLORS.wallAlt,
    concrete(COLORS.wallAlt, 0.86),
  );
  for (let floor = 0; floor <= p.floors; floor++) {
    const y = floor === 0 ? 0 : podiumHeight + (floor - 1) * p.floorHeight;
    bag.add(
      "floor_bands",
      "外挑楼板带",
      translateMesh(box(p.width + 0.18, 0.065, p.depth + 0.2), vec3(0, y, 0)),
      COLORS.trim,
      metal(COLORS.trim, 0.48),
    );
  }
  bag.add(
    "sidewalk",
    "骑楼前人行道",
    translateMesh(box(p.width + 3.2, 0.1, 1.7), vec3(0, -0.045, p.depth / 2 + 0.85)),
    COLORS.sidewalk,
    concrete(COLORS.sidewalk, 0.92),
  );
  bag.add(
    "street",
    "潮湿街道路面",
    translateMesh(box(p.width + 3.2, 0.045, 2.1), vec3(0, -0.02, p.depth / 2 + 2.75)),
    COLORS.asphalt,
    { type: "asphalt", params: { color: COLORS.asphalt, roughness: 0.54, seed: p.seed } },
  );
}

function addStorefronts(
  bag: PartBag,
  p: HongKongCyberHouseParams,
  rng: Rng,
  podiumHeight: number,
  frontZ: number,
  bayWidth: number,
): void {
  const windowHeight = podiumHeight * 0.69;
  const windowWidth = bayWidth * 0.78;
  const y = podiumHeight * 0.47;
  for (let bay = 0; bay < p.bays; bay++) {
    const x = -p.width / 2 + bayWidth * (bay + 0.5);
    const tint = rng.next() < 0.58 ? COLORS.glassLit : COLORS.glass;
    bag.add(
      "storefront_glass",
      "首层商铺玻璃",
      translateMesh(box(windowWidth, windowHeight, 0.055), vec3(x, y, frontZ + 0.035)),
      tint,
      glass(tint),
    );
    bag.add(
      "storefront_frames",
      "商铺金属框",
      translateMesh(rectFrame(windowWidth, windowHeight, 0.055, 0.075), vec3(x, y, frontZ + 0.085)),
      COLORS.metal,
      metal(COLORS.metal, 0.42),
    );
    if (bay === 0 || bay === p.bays - 1 || rng.next() < 0.3) {
      bag.add(
        "rolling_shutters",
        "卷帘门",
        translateMesh(shutter(windowWidth * 0.94, windowHeight * 0.92), vec3(x, y, frontZ + 0.12)),
        COLORS.concrete,
        metal(COLORS.concrete, 0.6),
      );
    }
  }
  bag.add(
    "street_canopy",
    "首层连续雨棚",
    translateMesh(box(p.width + 0.45, 0.11, 1.05), vec3(0, podiumHeight * 0.92, frontZ + 0.48)),
    COLORS.trim,
    metal(COLORS.trim, 0.4),
  );
  const posts: Mesh[] = [];
  for (let bay = 0; bay <= p.bays; bay++) {
    const x = -p.width / 2 + bayWidth * bay;
    posts.push(translateMesh(box(0.06, podiumHeight * 0.88, 0.06), vec3(x, podiumHeight * 0.44, frontZ + 0.84)));
  }
  bag.add("canopy_posts", "雨棚支柱", merge(...posts), COLORS.metal, metal(COLORS.metal, 0.4));
}

function addUpperFacade(
  bag: PartBag,
  p: HongKongCyberHouseParams,
  rng: Rng,
  podiumHeight: number,
  frontZ: number,
  bayWidth: number,
): void {
  const windowWidth = bayWidth * 0.62;
  const windowHeight = p.floorHeight * 0.52;
  for (let floor = 1; floor < p.floors; floor++) {
    const baseY = podiumHeight + (floor - 1) * p.floorHeight;
    const y = baseY + p.floorHeight * 0.53;
    for (let bay = 0; bay < p.bays; bay++) {
      const x = -p.width / 2 + bayWidth * (bay + 0.5);
      const tint = rng.next() < 0.43 ? COLORS.glassLit : COLORS.glass;
      bag.add(
        "facade_windows",
        "住宅窗带",
        translateMesh(box(windowWidth, windowHeight, 0.045), vec3(x, y, frontZ + 0.03)),
        tint,
        glass(tint),
      );
      bag.add(
        "window_frames",
        "窗框",
        translateMesh(rectFrame(windowWidth, windowHeight, 0.045, 0.06), vec3(x, y, frontZ + 0.07)),
        COLORS.metal,
        metal(COLORS.metal, 0.4),
      );
    }
    const slabDepth = floor % 3 === 0 ? p.balconyDepth * 1.35 : p.balconyDepth;
    bag.add(
      "balcony_slabs",
      "层间外挑平台",
      translateMesh(box(p.width * 0.94, 0.065, slabDepth), vec3(0, baseY + 0.08, frontZ + slabDepth / 2)),
      COLORS.concrete,
      concrete(COLORS.concrete, 0.78),
    );
    if (floor % 3 === 0) {
      bag.add(
        "balcony_rails",
        "外挑平台护栏",
        translateMesh(railRun(p.width * 0.92, p.floorHeight * 0.28), vec3(0, baseY + p.floorHeight * 0.2, frontZ + slabDepth)),
        COLORS.metal,
        metal(COLORS.metal, 0.36),
      );
    } else {
      bag.add(
        "window_awnings",
        "窗带遮雨篷",
        translateMesh(box(p.width * 0.9, 0.045, p.balconyDepth * 0.65), vec3(0, y + windowHeight * 0.65, frontZ + p.balconyDepth * 0.3)),
        floor % 2 === 0 ? COLORS.wallAlt : COLORS.trim,
        metal(floor % 2 === 0 ? COLORS.wallAlt : COLORS.trim, 0.5),
      );
    }
  }
}

function addSideFacade(
  bag: PartBag,
  p: HongKongCyberHouseParams,
  rng: Rng,
  podiumHeight: number,
): void {
  const columns = Math.max(2, Math.round(p.depth / 2));
  const spacing = p.depth / (columns + 1);
  for (let floor = 1; floor < p.floors; floor++) {
    const y = podiumHeight + (floor - 0.46) * p.floorHeight;
    for (let column = 0; column < columns; column++) {
      const z = -p.depth / 2 + spacing * (column + 1);
      for (const side of [-1, 1]) {
        if (side < 0 && column === 0) continue;
        const tint = rng.next() < 0.32 ? COLORS.glassLit : COLORS.glass;
        bag.add(
          "side_windows",
          "侧墙窗",
          translateMesh(box(0.045, p.floorHeight * 0.45, spacing * 0.52), vec3(side * (p.width / 2 + 0.03), y, z)),
          tint,
          glass(tint),
        );
      }
    }
  }
}

function addSignsAndNeon(
  bag: PartBag,
  p: HongKongCyberHouseParams,
  rng: Rng,
  podiumHeight: number,
  frontZ: number,
  bayWidth: number,
): void {
  const neonColors = [COLORS.cyan, COLORS.magenta, COLORS.amber, COLORS.green];
  for (let bay = 0; bay < p.bays; bay++) {
    if (rng.next() > p.signDensity) continue;
    const color = neonColors[rng.int(0, neonColors.length - 1)]!;
    const x = -p.width / 2 + bayWidth * (bay + 0.5);
    const width = bayWidth * rng.range(0.64, 0.92);
    const height = podiumHeight * rng.range(0.15, 0.23);
    const y = podiumHeight * rng.range(0.72, 0.86);
    bag.add(
      "shop_signs",
      "横向店铺招牌",
      translateMesh(box(width, height, 0.1), vec3(x, y, frontZ + 0.63)),
      color,
      neon(color, 1.2 + p.neonAmount * 2),
    );
    bag.add(
      "sign_frames",
      "招牌框架",
      translateMesh(rectFrame(width, height, 0.035, 0.125), vec3(x, y, frontZ + 0.64)),
      COLORS.metal,
      metal(COLORS.metal, 0.38),
    );
    for (const glyph of glyphStrokes(width * 0.72, height * 0.54, p.seed + bay * 13)) {
      bag.add(
        "sign_glyphs",
        "招牌字形灯条",
        translateMesh(glyph, vec3(x, y, frontZ + 0.7)),
        [1, 0.9, 0.65],
        neon([1, 0.9, 0.65], 1.5 + p.neonAmount * 2.5),
      );
    }
  }
  const bladeCount = Math.max(2, Math.round(p.floors * p.signDensity * 0.55));
  for (let index = 0; index < bladeCount; index++) {
    const side = index % 2 === 0 ? -1 : 1;
    const color = neonColors[(index + p.seed) % neonColors.length]!;
    const height = p.floorHeight * rng.range(0.8, 1.7);
    const y = podiumHeight + p.floorHeight * rng.range(0.5, p.floors - 1.2);
    bag.add(
      "blade_signs",
      "垂直悬挑招牌",
      translateMesh(
        box(0.16, height, p.balconyDepth * 1.35),
        vec3(side * (p.width * 0.46), y, frontZ + p.balconyDepth * 0.72),
      ),
      color,
      neon(color, 1.2 + p.neonAmount * 2),
    );
  }
  for (let floor = 1; floor < p.floors; floor++) {
    if (rng.next() > p.neonAmount * 0.72) continue;
    const color = neonColors[(floor + p.seed) % neonColors.length]!;
    const y = podiumHeight + (floor - 1) * p.floorHeight + 0.14;
    bag.add(
      "neon_floor_strips",
      "层间霓虹灯带",
      translateMesh(box(p.width * 0.84, 0.028, 0.035), vec3(0, y, frontZ + p.balconyDepth + 0.03)),
      color,
      neon(color, 1.2 + p.neonAmount * 1.8),
    );
  }
}

function addFireEscape(bag: PartBag, p: HongKongCyberHouseParams, podiumHeight: number): void {
  const stairX = -p.width / 2 - 0.55;
  const run = p.depth * 0.52;
  const stepsPerFloor = 7;
  for (let floor = 1; floor < p.floors; floor++) {
    const y0 = podiumHeight + (floor - 1) * p.floorHeight;
    const direction = floor % 2 === 0 ? 1 : -1;
    for (let step = 0; step < stepsPerFloor; step++) {
      const t = step / (stepsPerFloor - 1);
      const z = direction * (-run / 2 + run * t);
      const y = y0 + p.floorHeight * (0.08 + t * 0.78);
      bag.add(
        "fire_escape_steps",
        "外置消防梯踏步",
        translateMesh(box(0.85, 0.045, run / stepsPerFloor * 1.12), vec3(stairX, y, z)),
        COLORS.metal,
        metal(COLORS.metal, 0.58),
      );
    }
    bag.add(
      "fire_escape_landings",
      "消防梯平台",
      translateMesh(box(1.1, 0.07, 0.76), vec3(stairX, y0 + 0.04, direction * run * 0.54)),
      COLORS.metal,
      metal(COLORS.metal, 0.55),
    );
    const railA = vec3(stairX - 0.48, y0 + p.floorHeight * 0.2, direction * -run / 2);
    const railB = vec3(stairX - 0.48, y0 + p.floorHeight * 0.98, direction * run / 2);
    bag.add(
      "fire_escape_rails",
      "消防梯护栏",
      beamBetween(railA, railB, 0.025),
      COLORS.metal,
      metal(COLORS.metal, 0.45),
    );
  }
}

function addUtilities(
  bag: PartBag,
  p: HongKongCyberHouseParams,
  rng: Rng,
  podiumHeight: number,
  frontZ: number,
  bayWidth: number,
  totalHeight: number,
): void {
  for (let floor = 1; floor < p.floors; floor++) {
    for (let bay = 0; bay < p.bays; bay++) {
      if (rng.next() > p.utilityDensity) continue;
      const x = -p.width / 2 + bayWidth * (bay + 0.5);
      const y = podiumHeight + (floor - 0.18) * p.floorHeight;
      const unit = merge(
        box(bayWidth * 0.34, p.floorHeight * 0.19, 0.24),
        translateMesh(box(bayWidth * 0.27, 0.018, 0.025), vec3(0, 0, 0.135)),
      );
      bag.add(
        "air_conditioners",
        "窗外空调机组",
        translateMesh(unit, vec3(x, y, frontZ + 0.26)),
        COLORS.concrete,
        metal(COLORS.concrete, 0.65),
      );
    }
  }
  for (let index = 0; index < 3; index++) {
    const x = p.width / 2 + 0.1 + index * 0.08;
    const z = -p.depth * 0.2 + index * p.depth * 0.2;
    const radius = 0.035 + index * 0.008;
    bag.add(
      "service_pipes",
      "外露机电管线",
      translateMesh(cylinder(radius, totalHeight * 0.82, 8, true), vec3(x, totalHeight * 0.45, z)),
      index === 1 ? COLORS.amber : COLORS.metal,
      metal(index === 1 ? COLORS.amber : COLORS.metal, 0.52),
    );
  }
}

function addRoof(bag: PartBag, p: HongKongCyberHouseParams, rng: Rng, totalHeight: number): void {
  const parapetHeight = p.floorHeight * 0.34;
  const parapetY = totalHeight + parapetHeight / 2;
  const wall = 0.09;
  const parapet = merge(
    translateMesh(box(p.width, parapetHeight, wall), vec3(0, parapetY, p.depth / 2 - wall / 2)),
    translateMesh(box(p.width, parapetHeight, wall), vec3(0, parapetY, -p.depth / 2 + wall / 2)),
    translateMesh(box(wall, parapetHeight, p.depth), vec3(p.width / 2 - wall / 2, parapetY, 0)),
    translateMesh(box(wall, parapetHeight, p.depth), vec3(-p.width / 2 + wall / 2, parapetY, 0)),
  );
  bag.add("roof_parapet", "屋顶女儿墙", parapet, COLORS.trim, concrete(COLORS.trim, 0.75));
  const shackWidth = p.width * 0.27;
  const shackDepth = p.depth * 0.34;
  const shackHeight = p.floorHeight * 0.8;
  bag.add(
    "roof_service_room",
    "屋顶机房",
    translateMesh(box(shackWidth, shackHeight, shackDepth), vec3(-p.width * 0.2, totalHeight + shackHeight / 2, -p.depth * 0.18)),
    COLORS.wallAlt,
    concrete(COLORS.wallAlt, 0.85),
  );
  const tankRadius = Math.min(p.width, p.depth) * 0.11;
  const tankHeight = p.floorHeight * 0.72;
  const tankX = p.width * 0.2;
  const tankZ = -p.depth * 0.14;
  bag.add(
    "roof_water_tank",
    "屋顶水箱",
    translateMesh(cylinder(tankRadius, tankHeight, 18, true), vec3(tankX, totalHeight + tankHeight * 0.68, tankZ)),
    COLORS.concrete,
    metal(COLORS.concrete, 0.52),
  );
  for (const side of [-1, 1]) {
    bag.add(
      "tank_supports",
      "水箱支架",
      translateMesh(box(0.055, tankHeight * 0.55, 0.055), vec3(tankX + side * tankRadius * 0.62, totalHeight + tankHeight * 0.24, tankZ)),
      COLORS.metal,
      metal(COLORS.metal, 0.42),
    );
  }
  const antennaHeight = p.floorHeight * rng.range(1.4, 2.1);
  bag.add(
    "roof_antenna",
    "屋顶天线",
    translateMesh(cylinder(0.035, antennaHeight, 8, true), vec3(p.width * 0.34, totalHeight + antennaHeight / 2, p.depth * 0.2)),
    COLORS.metal,
    metal(COLORS.metal, 0.36),
  );
  bag.add(
    "roof_beacon",
    "屋顶信标灯",
    translateMesh(box(0.18, 0.12, 0.18), vec3(p.width * 0.34, totalHeight + antennaHeight, p.depth * 0.2)),
    COLORS.magenta,
    neon(COLORS.magenta, 5),
  );
}

function rectFrame(width: number, height: number, stock: number, depth: number): Mesh {
  return merge(
    translateMesh(box(width + stock, stock, depth), vec3(0, height / 2, 0)),
    translateMesh(box(width + stock, stock, depth), vec3(0, -height / 2, 0)),
    translateMesh(box(stock, height + stock, depth), vec3(-width / 2, 0, 0)),
    translateMesh(box(stock, height + stock, depth), vec3(width / 2, 0, 0)),
  );
}

function shutter(width: number, height: number): Mesh {
  const meshes: Mesh[] = [box(width, height, 0.04)];
  const slats = Math.max(4, Math.round(height / 0.1));
  for (let index = 0; index <= slats; index++) {
    const y = -height / 2 + height * index / slats;
    meshes.push(translateMesh(box(width * 0.96, 0.014, 0.055), vec3(0, y, 0.035)));
  }
  return merge(...meshes);
}

function railRun(width: number, height: number): Mesh {
  const meshes: Mesh[] = [translateMesh(box(width, 0.03, 0.03), vec3(0, height, 0))];
  const posts = Math.max(5, Math.round(width / 0.35));
  for (let index = 0; index <= posts; index++) {
    const x = -width / 2 + width * index / posts;
    meshes.push(translateMesh(box(0.022, height, 0.022), vec3(x, height / 2, 0)));
  }
  return merge(...meshes);
}

function glyphStrokes(width: number, height: number, seed: number): Mesh[] {
  const rng = makeRng(seed >>> 0);
  const glyphs = Math.max(2, Math.round(width / Math.max(0.12, height * 0.9)));
  const cell = width / glyphs;
  const meshes: Mesh[] = [];
  for (let glyph = 0; glyph < glyphs; glyph++) {
    const x = -width / 2 + cell * (glyph + 0.5);
    meshes.push(translateMesh(box(cell * 0.65, height * 0.12, 0.025), vec3(x, rng.range(-height * 0.25, height * 0.25), 0)));
    meshes.push(translateMesh(box(cell * 0.12, height * 0.72, 0.025), vec3(x + rng.range(-cell * 0.18, cell * 0.18), 0, 0)));
  }
  return meshes;
}

function beamBetween(a: Vec3, b: Vec3, thickness: number): Mesh {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dy, dz);
  return transform(box(thickness, length, thickness), {
    rotate: vec3(Math.atan2(Math.hypot(dx, dz), dy), Math.atan2(dx, dz), 0),
    translate: vec3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2),
  });
}

function concrete(color: RGB, roughness: number): PartSurfaceRef {
  return { type: "concrete", params: { color, roughness } };
}

function metal(color: RGB, roughness: number): PartSurfaceRef {
  return { type: "metal", params: { color, roughness } };
}

function glass(tint: RGB): PartSurfaceRef {
  return { type: "glass", params: { tint, roughness: 0.08 } };
}

function neon(color: RGB, intensity: number): PartSurfaceRef {
  return { type: "neon", params: { color, intensity } };
}

function normalizeParams(params: Partial<HongKongCyberHouseParams>): HongKongCyberHouseParams {
  const p = { ...HONG_KONG_CYBER_HOUSE_DEFAULTS, ...params };
  return {
    floors: clampInt(p.floors, 3, 18),
    width: Math.max(3.6, p.width),
    depth: Math.max(3.2, p.depth),
    floorHeight: Math.max(0.65, p.floorHeight),
    bays: clampInt(p.bays, 2, 10),
    signDensity: clamp01(p.signDensity),
    neonAmount: clamp01(p.neonAmount),
    balconyDepth: Math.max(0.2, p.balconyDepth),
    utilityDensity: clamp01(p.utilityDensity),
    seed: Math.round(p.seed),
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
