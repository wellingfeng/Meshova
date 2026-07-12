/**
 * Solaris-market-inspired scene generator.
 *
 * Reference pattern: prepare reusable assets, expose variants, assemble a small
 * market scene, instance many jars/props, then frame it with background context.
 * This is an original Meshova procedural model; it does not copy SideFX assets.
 */
import { vec2 } from "../math/vec2.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng, type Rng } from "../random/prng.js";
import {
  box,
  bounds,
  computeNormals,
  cone,
  cylinder,
  icosphere,
  makeMesh,
  merge,
  sphere,
  torus,
  transform,
  translateMesh,
  triangleCount,
  type Mesh,
  type NamedPart,
  type PartSurfaceRef,
} from "../geometry/index.js";
import { palm } from "../vegetation/index.js";

type RGB = [number, number, number];

export interface SolarisMarketParams {
  stalls: number;
  shelfRows: number;
  jarsPerShelf: number;
  propDensity: number;
  backgroundBuildings: number;
  sandRelief: number;
  seed: number;
}

export const SOLARIS_MARKET_DEFAULTS: SolarisMarketParams = {
  stalls: 2,
  shelfRows: 3,
  jarsPerShelf: 9,
  propDensity: 0.75,
  backgroundBuildings: 3,
  sandRelief: 0.28,
  seed: 205,
};

export interface SolarisMarketSummary {
  parts: number;
  triangles: number;
  width: number;
  depth: number;
  height: number;
}

const SAND: RGB = [0.76, 0.62, 0.42];
const DIRT: RGB = [0.45, 0.34, 0.22];
const WOOD: RGB = [0.42, 0.26, 0.12];
const DARK_WOOD: RGB = [0.24, 0.14, 0.08];
const CANVAS_A: RGB = [0.78, 0.24, 0.18];
const CANVAS_B: RGB = [0.18, 0.42, 0.62];
const GLASS: RGB = [0.66, 0.88, 0.92];
const METAL: RGB = [0.52, 0.5, 0.45];
const PLASTER: RGB = [0.78, 0.68, 0.54];
const ROOF: RGB = [0.44, 0.24, 0.16];
const SHADOW: RGB = [0.12, 0.1, 0.08];
const PALM_LEAF: RGB = [0.18, 0.42, 0.16];
const JAR_CONTENTS: RGB[] = [
  [0.48, 0.08, 0.04],
  [0.82, 0.48, 0.14],
  [0.28, 0.52, 0.2],
  [0.18, 0.28, 0.62],
  [0.92, 0.78, 0.32],
];

function sandSurface(seed: number): PartSurfaceRef {
  return { type: "sand", params: { color: SAND, seed } };
}

function dirtSurface(seed: number): PartSurfaceRef {
  return { type: "dirtRoad", params: { color: DIRT, rutStrength: 0.04, normalStrength: 0.35, seed } };
}

function woodSurface(color: RGB = WOOD): PartSurfaceRef {
  return { type: "wood", params: { tone: color, ringScale: 12 } };
}

function fabricSurface(color: RGB, seed: number): PartSurfaceRef {
  return { type: "fabric", params: { color, seed } };
}

function glassSurface(tint: RGB = GLASS): PartSurfaceRef {
  return { type: "glass", params: { tint, roughness: 0.04, thickness: 0.22 } };
}

function liquidSurface(tint: RGB): PartSurfaceRef {
  return { type: "liquid", params: { tint, transmission: 0.18 } };
}

function ceramicSurface(color: RGB): PartSurfaceRef {
  return { type: "ceramic", params: { color } };
}

function plasterSurface(color: RGB, seed: number): PartSurfaceRef {
  return { type: "stylizedPlaster", params: { color, bands: 4, seed } };
}

function roofSurface(color: RGB, seed: number): PartSurfaceRef {
  return { type: "stylizedRoof", params: { color, rows: 12, seed } };
}

function metalSurface(color: RGB = METAL): PartSurfaceRef {
  return { type: "metal", params: { color, roughness: 0.48 } };
}

class GroupBag {
  private readonly order: string[] = [];
  private readonly groups = new Map<string, { label: string; color: RGB; surface?: PartSurfaceRef; meshes: Mesh[] }>();

  add(part: NamedPart): void {
    let group = this.groups.get(part.name);
    if (!group) {
      group = {
        label: part.label ?? part.name,
        color: (part.color ?? [0.8, 0.8, 0.8]) as RGB,
        meshes: [],
      };
      if (part.surface) group.surface = part.surface;
      this.groups.set(part.name, group);
      this.order.push(part.name);
    }
    group.meshes.push(part.mesh);
  }

  toParts(): NamedPart[] {
    return this.order.map((name) => {
      const g = this.groups.get(name)!;
      const part: NamedPart = {
        name,
        label: g.label,
        color: g.color,
        mesh: g.meshes.length === 1 ? g.meshes[0]! : merge(...g.meshes),
      };
      if (g.surface) part.surface = g.surface;
      return part;
    });
  }
}

export function buildSolarisMarketParts(params: Partial<SolarisMarketParams> = {}): NamedPart[] {
  const p = normalizeSolarisMarketParams(params);
  const rng = makeRng(p.seed >>> 0);
  const bag = new GroupBag();

  bag.add(named("sand_dunes", "沙地与低矮沙丘", dunePlane(16, 13, 38, p.sandRelief, p.seed), SAND, sandSurface(p.seed + 1)));
  bag.add(named("walk_paths", "摊位前压实沙路", pathStrips(), DIRT, dirtSurface(p.seed + 2)));

  const spacing = 4.9;
  for (let i = 0; i < p.stalls; i++) {
    const x = (i - (p.stalls - 1) * 0.5) * spacing;
    buildStall(bag, vec3(x, 0, -0.35 + (i % 2) * 0.28), i, rng, p);
  }

  buildLooseProps(bag, rng, p);
  buildBackground(bag, rng, p);
  buildPalmsAndLamps(bag, rng, p);

  return bag.toParts();
}

export function summarizeSolarisMarket(parts: NamedPart[]): SolarisMarketSummary {
  const m = merge(...parts.map((p) => p.mesh));
  const b = bounds(m);
  return {
    parts: parts.length,
    triangles: parts.reduce((sum, p) => sum + triangleCount(p.mesh), 0),
    width: b.max.x - b.min.x,
    depth: b.max.z - b.min.z,
    height: b.max.y - b.min.y,
  };
}

function normalizeSolarisMarketParams(params: Partial<SolarisMarketParams>): SolarisMarketParams {
  const p = { ...SOLARIS_MARKET_DEFAULTS, ...params };
  return {
    stalls: clampInt(p.stalls, 1, 4),
    shelfRows: clampInt(p.shelfRows, 1, 5),
    jarsPerShelf: clampInt(p.jarsPerShelf, 2, 18),
    propDensity: clamp(p.propDensity, 0, 1),
    backgroundBuildings: clampInt(p.backgroundBuildings, 0, 5),
    sandRelief: clamp(p.sandRelief, 0, 0.8),
    seed: Math.round(p.seed) >>> 0,
  };
}

function buildStall(bag: GroupBag, origin: Vec3, index: number, rng: Rng, p: SolarisMarketParams): void {
  const w = 3.9 + rng.range(-0.25, 0.35);
  const d = 2.7 + rng.range(-0.15, 0.2);
  const h = 2.35 + rng.range(-0.12, 0.12);
  const post = 0.12;
  const canvas = index % 2 === 0 ? CANVAS_A : CANVAS_B;

  const postMeshes: Mesh[] = [];
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      postMeshes.push(localBox(origin, sx * w * 0.5, h * 0.5, sz * d * 0.5, post, h, post));
    }
  }
  postMeshes.push(
    localBox(origin, 0, h - 0.08, -d * 0.5, w + post, 0.14, post),
    localBox(origin, 0, h - 0.08, d * 0.5, w + post, 0.14, post),
    localBox(origin, -w * 0.5, h - 0.08, 0, post, 0.14, d + post),
    localBox(origin, w * 0.5, h - 0.08, 0, post, 0.14, d + post),
  );
  bag.add(named("stall_frames", "木制摊位骨架", merge(...postMeshes), WOOD, woodSurface(WOOD)));

  bag.add(named("stall_canopies", "彩色布棚顶", translateMesh(gableCanopy(w + 0.55, d + 0.5, h - 0.02, 0.46), origin), canvas, fabricSurface(canvas, p.seed + index)));
  bag.add(named("canopy_valances", "棚檐垂布", valances(origin, w, d, h, canvas, index), canvas, fabricSurface(canvas, p.seed + 21 + index)));

  const counterY = 0.62;
  bag.add(named("market_counters", "木制柜台", localBox(origin, 0, counterY, d * 0.42, w * 0.92, 0.28, 0.48), DARK_WOOD, woodSurface(DARK_WOOD)));
  bag.add(named("back_shelves", "后排货架", shelfUnit(origin, w * 0.86, p.shelfRows, h), WOOD, woodSurface(WOOD)));

  buildShelfJars(bag, origin, w, d, h, index, rng, p);
  buildCratesAndGoods(bag, origin, w, d, rng, p);
}

function buildShelfJars(
  bag: GroupBag,
  origin: Vec3,
  width: number,
  depth: number,
  height: number,
  stallIndex: number,
  rng: Rng,
  p: SolarisMarketParams,
): void {
  const rows = p.shelfRows;
  const perRow = p.jarsPerShelf;
  const shelfZ = -depth * 0.46;
  for (let r = 0; r < rows; r++) {
    const y = 0.96 + r * ((height - 1.15) / Math.max(1, rows));
    for (let i = 0; i < perRow; i++) {
      if (rng.next() > 0.78 + p.propDensity * 0.22) continue;
      const t = perRow === 1 ? 0.5 : i / (perRow - 1);
      const x = (t - 0.5) * width * 0.68 + rng.range(-0.05, 0.05);
      const jarH = rng.range(0.22, 0.38);
      const radius = rng.range(0.065, 0.095);
      const pos = vec3(origin.x + x, y + jarH * 0.5, origin.z + shelfZ + rng.range(-0.025, 0.03));
      const content = JAR_CONTENTS[(i + r + stallIndex) % JAR_CONTENTS.length]!;
      const glass = jarGlass(radius, jarH, pos, rng);
      const liquid = translateMesh(cylinder(radius * 0.72, jarH * rng.range(0.36, 0.64), 12, true), vec3(pos.x, pos.y - jarH * 0.13, pos.z));
      const lid = translateMesh(cylinder(radius * 0.76, 0.045, 12, true), vec3(pos.x, pos.y + jarH * 0.54 - 0.006, pos.z));
      bag.add(named("glass_jars", "玻璃罐实例", glass, GLASS, glassSurface(GLASS)));
      bag.add(named(`jar_contents_${colorKey(content)}`, "罐中彩色货物", liquid, content, liquidSurface(content)));
      bag.add(named("jar_lids", "罐盖", lid, METAL, metalSurface(METAL)));
    }
  }
}

function buildCratesAndGoods(bag: GroupBag, origin: Vec3, width: number, depth: number, rng: Rng, p: SolarisMarketParams): void {
  const crateCount = Math.round(3 + p.propDensity * 5);
  for (let i = 0; i < crateCount; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * width * rng.range(0.22, 0.46);
    const z = depth * rng.range(0.22, 0.54);
    const yaw = rng.range(-0.55, 0.55);
    const crate = transform(crateMesh(rng.range(0.5, 0.74), rng.range(0.32, 0.5), rng.range(0.38, 0.55)), {
      rotate: vec3(0, yaw, 0),
      translate: vec3(origin.x + x, 0.22, origin.z + z),
    });
    bag.add(named("wooden_crates", "木箱与货筐", crate, WOOD, woodSurface(WOOD)));

    const goods: Mesh[] = [];
    const count = rng.int(4, 9);
    const color = JAR_CONTENTS[(i + rng.int(0, JAR_CONTENTS.length - 1)) % JAR_CONTENTS.length]!;
    for (let k = 0; k < count; k++) {
      goods.push(transform(icosphere(rng.range(0.055, 0.09), 0), {
        scale: vec3(rng.range(0.85, 1.25), rng.range(0.75, 1.1), rng.range(0.85, 1.25)),
        translate: vec3(origin.x + x + rng.range(-0.2, 0.2), 0.48 + rng.range(0, 0.1), origin.z + z + rng.range(-0.16, 0.16)),
      }));
    }
    bag.add(named(`basket_goods_${colorKey(color)}`, "货筐商品", merge(...goods), color, ceramicSurface(color)));
  }
}

function buildLooseProps(bag: GroupBag, rng: Rng, p: SolarisMarketParams): void {
  const sacks: Mesh[] = [];
  const ropes: Mesh[] = [];
  const count = Math.round(5 + p.propDensity * 9);
  for (let i = 0; i < count; i++) {
    const x = rng.range(-6.1, 6.1);
    const z = rng.range(2.0, 4.8);
    const sack = transform(sphere(0.34, 14, 10), {
      scale: vec3(rng.range(0.8, 1.15), rng.range(0.62, 0.95), rng.range(0.75, 1.08)),
      rotate: vec3(rng.range(-0.12, 0.12), rng.range(0, Math.PI), rng.range(-0.08, 0.08)),
      translate: vec3(x, 0.27, z),
    });
    sacks.push(sack);
    ropes.push(transform(torus(0.22, 0.012, 20, 6), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(x, 0.53, z) }));
  }
  if (sacks.length > 0) {
    bag.add(named("cloth_sacks", "布袋堆", merge(...sacks), [0.62, 0.52, 0.38], fabricSurface([0.62, 0.52, 0.38], p.seed + 50)));
    bag.add(named("sack_ties", "布袋扎绳", merge(...ropes), DARK_WOOD, woodSurface(DARK_WOOD)));
  }
}

function buildBackground(bag: GroupBag, rng: Rng, p: SolarisMarketParams): void {
  const n = p.backgroundBuildings;
  if (n <= 0) return;
  const startX = -(n - 1) * 1.85;
  const wallMeshes: Mesh[] = [];
  const roofMeshes: Mesh[] = [];
  const doorMeshes: Mesh[] = [];
  const windowMeshes: Mesh[] = [];
  const awnings: Mesh[] = [];

  for (let i = 0; i < n; i++) {
    const w = rng.range(1.45, 2.15);
    const d = rng.range(1.0, 1.35);
    const h = rng.range(1.6, 2.45);
    const x = startX + i * 1.85 + rng.range(-0.18, 0.18);
    const z = -4.25 + rng.range(-0.15, 0.18);
    wallMeshes.push(translateMesh(box(w, h, d), vec3(x, h * 0.5, z)));
    roofMeshes.push(translateMesh(gableCanopy(w + 0.35, d + 0.2, h, 0.42), vec3(x, 0, z)));
    doorMeshes.push(translateMesh(box(w * 0.22, h * 0.44, 0.06), vec3(x - w * 0.18, h * 0.22 + 0.006, z + d * 0.52)));
    for (const sx of [-0.22, 0.24] as const) {
      windowMeshes.push(translateMesh(box(w * 0.2, h * 0.18, 0.045), vec3(x + sx * w, h * 0.62, z + d * 0.53)));
    }
    if (rng.next() < 0.72) {
      const c = i % 2 === 0 ? CANVAS_B : CANVAS_A;
      awnings.push(transform(box(w * 0.62, 0.06, 0.46), {
        rotate: vec3(-0.22, 0, 0),
        translate: vec3(x, h * 0.78, z + d * 0.75),
      }));
      bag.add(named(`background_awnings_${i}`, "背景遮阳布", awnings.pop()!, c, fabricSurface(c, p.seed + 70 + i)));
    }
  }

  bag.add(named("background_walls", "背景市集建筑墙面", merge(...wallMeshes), PLASTER, plasterSurface(PLASTER, p.seed + 60)));
  bag.add(named("background_roofs", "背景建筑屋顶", merge(...roofMeshes), ROOF, roofSurface(ROOF, p.seed + 61)));
  bag.add(named("background_doors", "背景建筑木门", merge(...doorMeshes), DARK_WOOD, woodSurface(DARK_WOOD)));
  bag.add(named("background_windows", "背景小窗", merge(...windowMeshes), SHADOW, glassSurface([0.18, 0.22, 0.24])));
}

function buildPalmsAndLamps(bag: GroupBag, rng: Rng, p: SolarisMarketParams): void {
  const trunks: Mesh[] = [];
  const leaves: Mesh[] = [];
  const lamps: Mesh[] = [];
  const lampGlow: Mesh[] = [];
  for (const [i, x] of [-6.6, 6.6].entries()) {
    const z = -2.0 + rng.range(-0.4, 0.3);
    const h = rng.range(2.4, 3.1);
    const palmMeshes = marketPalm(p.seed + 90 + i, h, x, z);
    trunks.push(palmMeshes.wood);
    leaves.push(palmMeshes.leaves);
  }

  for (const x of [-2.8, 2.8]) {
    lamps.push(translateMesh(cylinder(0.035, 1.45, 8, true), vec3(x, 0.72, 4.15)));
    lamps.push(translateMesh(cone(0.18, 0.24, 12, true), vec3(x, 1.56, 4.15)));
    lampGlow.push(translateMesh(sphere(0.12, 12, 8), vec3(x, 1.42, 4.15)));
  }

  bag.add(named("palm_trunks", "背景棕榈树干", merge(...trunks), [0.34, 0.22, 0.12], { type: "bark", params: { color: [0.34, 0.22, 0.12], scale: 7, seed: p.seed + 90 } }));
  bag.add(named("palm_fronds", "棕榈叶片", merge(...leaves), PALM_LEAF, { type: "leaf", params: { color: PALM_LEAF, seed: p.seed + 91 } }));
  bag.add(named("market_lamps", "摊前金属灯架", merge(...lamps), METAL, metalSurface(METAL)));
  bag.add(named("warm_lamp_glow", "暖色灯光球", merge(...lampGlow), [1, 0.72, 0.32], { type: "emissive", params: { color: [1, 0.72, 0.32], intensity: 2.8 } }));
}

function marketPalm(seed: number, height: number, x: number, z: number): { wood: Mesh; leaves: Mesh } {
  const plant = palm({
    seed,
    height,
    trunkRadius: height * 0.045,
    fronds: 11,
    frondLength: height * 0.58,
    lean: height * 0.14,
  });
  const yaw = x < 0 ? 0.12 : Math.PI - 0.12;
  const placement = { rotate: vec3(0, yaw, 0), translate: vec3(x, 0, z) };
  return {
    wood: transform(plant.wood, placement),
    leaves: transform(plant.leaves, placement),
  };
}

function shelfUnit(origin: Vec3, width: number, rows: number, height: number): Mesh {
  const meshes: Mesh[] = [];
  const shelfZ = -1.18;
  meshes.push(localBox(origin, 0, 0.72, shelfZ, width, 0.12, 0.32));
  for (let r = 0; r < rows; r++) {
    const y = 0.9 + r * ((height - 1.1) / Math.max(1, rows));
    meshes.push(localBox(origin, 0, y, shelfZ, width, 0.08, 0.34));
  }
  for (const sx of [-1, 1] as const) {
    meshes.push(localBox(origin, sx * width * 0.5, 1.35, shelfZ, 0.08, height * 0.72, 0.32));
  }
  return merge(...meshes);
}

function valances(origin: Vec3, width: number, depth: number, height: number, _color: RGB, index: number): Mesh {
  const strips: Mesh[] = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = (t - 0.5) * width;
    const drop = 0.18 + ((i + index) % 2) * 0.07;
    strips.push(localBox(origin, x, height - 0.3 - drop * 0.5, depth * 0.58, width / n * 0.78, drop, 0.035));
  }
  strips.push(localBox(origin, 0, height - 0.34, -depth * 0.58, width, 0.16, 0.035));
  return merge(...strips);
}

function jarGlass(radius: number, height: number, pos: Vec3, rng: Rng): Mesh {
  const body = translateMesh(cylinder(radius, height * 0.78, 14, true), vec3(pos.x, pos.y - height * 0.06, pos.z));
  const shoulder = transform(sphere(radius * 1.02, 14, 8), {
    scale: vec3(1, 0.32, 1),
    translate: vec3(pos.x, pos.y + height * 0.31, pos.z),
  });
  const neck = translateMesh(cylinder(radius * rng.range(0.42, 0.58), height * 0.24, 12, true), vec3(pos.x, pos.y + height * 0.42, pos.z));
  return merge(body, shoulder, neck);
}

function crateMesh(width: number, height: number, depth: number): Mesh {
  const stock = 0.055;
  return merge(
    box(width, height, depth),
    translateMesh(box(width + stock, stock, depth + stock), vec3(0, height * 0.52, 0)),
    translateMesh(box(width + stock, stock, depth + stock), vec3(0, -height * 0.52, 0)),
    translateMesh(box(stock, height + stock, depth + stock), vec3(-width * 0.5, 0, 0)),
    translateMesh(box(stock, height + stock, depth + stock), vec3(width * 0.5, 0, 0)),
  );
}

function pathStrips(): Mesh {
  return merge(
    translateMesh(box(13.2, 0.035, 1.15), vec3(0, 0.035, 3.25)),
    transform(box(3.6, 0.035, 0.52), { rotate: vec3(0, 0.22, 0), translate: vec3(-3.4, 0.04, 1.3) }),
    transform(box(3.6, 0.035, 0.52), { rotate: vec3(0, -0.2, 0), translate: vec3(3.2, 0.04, 1.25) }),
  );
}

function dunePlane(width: number, depth: number, resolution: number, relief: number, seed: number): Mesh {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices: number[] = [];
  const cols = Math.max(2, Math.round(resolution));
  const rows = cols;
  for (let j = 0; j <= rows; j++) {
    const tz = j / rows;
    const z = (tz - 0.5) * depth;
    for (let i = 0; i <= cols; i++) {
      const tx = i / cols;
      const x = (tx - 0.5) * width;
      const y =
        Math.sin(x * 0.56 + seed * 0.017) * relief * 0.22 +
        Math.cos(z * 0.42 - seed * 0.011) * relief * 0.18 +
        Math.sin((x + z) * 0.31 + seed * 0.023) * relief * 0.16;
      positions.push(vec3(x, y, z));
      normals.push(vec3(0, 1, 0));
      uvs.push(vec2(tx * 4, tz * 4));
    }
  }
  const stride = cols + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * stride + i;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return computeNormals(makeMesh({ positions, normals, uvs, indices }), 180);
}

function gableCanopy(width: number, depth: number, baseY: number, rise: number): Mesh {
  const hx = width * 0.5;
  const hz = depth * 0.5;
  const positions = [
    vec3(-hx, baseY, -hz),
    vec3(hx, baseY, -hz),
    vec3(-hx, baseY + rise, 0),
    vec3(hx, baseY + rise, 0),
    vec3(-hx, baseY, hz),
    vec3(hx, baseY, hz),
  ];
  const uvs = [vec2(0, 0), vec2(1, 0), vec2(0, 1), vec2(1, 1), vec2(0, 0), vec2(1, 0)];
  const indices = [
    0, 3, 1, 0, 2, 3,
    2, 5, 3, 2, 4, 5,
    0, 4, 2, 1, 3, 5,
  ];
  return computeNormals(makeMesh({
    positions,
    normals: positions.map(() => vec3(0, 1, 0)),
    uvs,
    indices,
  }), 45);
}

function localBox(origin: Vec3, x: number, y: number, z: number, w: number, h: number, d: number): Mesh {
  return translateMesh(box(w, h, d), vec3(origin.x + x, origin.y + y, origin.z + z));
}

function named(name: string, label: string, mesh: Mesh, color: RGB, surface?: PartSurfaceRef): NamedPart {
  const part: NamedPart = { name, label, mesh, color };
  if (surface) part.surface = surface;
  return part;
}

function colorKey(c: RGB): string {
  return c.map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, "0")).join("");
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
}

function clampInt(v: number, min: number, max: number): number {
  return Math.round(clamp(v, min, max));
}
