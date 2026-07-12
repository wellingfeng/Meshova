/**
 * Procedural lake house reconstructed from the rule structure of a Houdini
 * 17.5 study file: 2x3x2 module grid, stacked masses, semantic facade assets,
 * roof set dressing, supports, stairs, pier and optional tower.
 */
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  box,
  cone,
  cylinder,
  merge,
  transform,
  type Mesh,
  type NamedPart,
  type PartSurfaceRef,
} from "../geometry/index.js";
import { buildRoofGeneratorMesh } from "./roof-generator.js";

type RGB = [number, number, number];

export interface HoudiniLakeHouseParams {
  seed: number;
  floors: number;
  baysX: number;
  baysZ: number;
  bayWidth: number;
  floorHeight: number;
  roofPitch: number;
  roofWindowProbability: number;
  chimneyProbability: number;
  towerProbability: number;
  walkwayLength: number;
  pierHeight: number;
  lakeSize: number;
  weathering: number;
}

export const HOUDINI_LAKE_HOUSE_DEFAULTS: HoudiniLakeHouseParams = {
  seed: 2983,
  floors: 2,
  baysX: 4,
  baysZ: 3,
  bayWidth: 2,
  floorHeight: 3,
  roofPitch: 0.72,
  roofWindowProbability: 0.6,
  chimneyProbability: 0.1,
  towerProbability: 0.6,
  walkwayLength: 5.5,
  pierHeight: 1.9,
  lakeSize: 16,
  weathering: 0.45,
};

interface GroupDef {
  label: string;
  color: RGB;
  surface: PartSurfaceRef;
}

interface Group extends GroupDef {
  meshes: Mesh[];
}

interface HouseMass {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
}

const SOURCE_STUDY = "Lake_House_Modeling.hip · bank_house_v03 study · Houdini 17.5";
const SOURCE_VIDEO = "https://www.bilibili.com/video/BV1i44y1F7gu/";

const GROUPS = {
  lake: def("湖面", [0.12, 0.32, 0.38], "liquid", { roughness: 0.08 }),
  lakebed: def("浅水湖床", [0.19, 0.24, 0.2], "stone", { roughness: 0.96 }),
  stone_pier: def("水下石质柱脚", [0.36, 0.34, 0.3], "stone", { roughness: 0.94 }),
  platform_deck: def("高脚木构平台", [0.36, 0.24, 0.14], "wood", { roughness: 0.9 }),
  pier_posts: def("水下承重桩", [0.22, 0.15, 0.1], "wood", { roughness: 0.9 }),
  timber_walls: def("风化木板墙", [0.46, 0.3, 0.19], "wood", { roughness: 0.88 }),
  timber_frame: def("深色承重木构", [0.2, 0.12, 0.07], "wood", { roughness: 0.82 }),
  supports: def("外立面柱与拱撑", [0.26, 0.17, 0.1], "wood", { roughness: 0.84 }),
  roof: def("深灰木瓦屋顶", [0.17, 0.19, 0.18], "slateRoof", { roughness: 0.88 }),
  roof_trim: def("屋脊与檐口压条", [0.28, 0.2, 0.13], "wood", { roughness: 0.8 }),
  window_glass: def("暖色窗玻璃", [0.32, 0.48, 0.48], "glass", { roughness: 0.12 }),
  window_frames: def("窗框与百叶", [0.63, 0.55, 0.42], "wood", { roughness: 0.72 }),
  doors: def("厚木门", [0.29, 0.17, 0.09], "wood", { roughness: 0.8 }),
  balcony: def("外廊与栏杆", [0.34, 0.22, 0.12], "wood", { roughness: 0.84 }),
  stairs: def("码头楼梯", [0.32, 0.21, 0.12], "wood", { roughness: 0.86 }),
  tower: def("观湖塔楼", [0.4, 0.27, 0.17], "wood", { roughness: 0.86 }),
  chimney: def("砖砌烟囱", [0.39, 0.24, 0.18], "brick", { roughness: 0.93 }),
  metal: def("吊机与建筑五金", [0.18, 0.19, 0.18], "metal", { roughness: 0.62 }),
  props: def("码头箱桶与船桨", [0.42, 0.27, 0.13], "wood", { roughness: 0.88 }),
  lanterns: def("悬挂灯笼", [0.92, 0.56, 0.2], "neon", { intensity: 1.5 }),
} satisfies Record<string, GroupDef>;

export function buildHoudiniLakeHouseParts(
  params: Partial<HoudiniLakeHouseParams> = {},
): NamedPart[] {
  const p = normalizeParams(params);
  const rng = makeRng(p.seed);
  const groups = new Map<string, Group>();
  const width = p.baysX * p.bayWidth;
  const depth = p.baysZ * p.bayWidth;
  const pierTop = p.pierHeight;
  const wallBase = pierTop + 0.34;
  const eaveY = wallBase + p.floors * p.floorHeight;
  const frontZ = depth * 0.5;
  const overhang = p.bayWidth * 0.28;

  addEnvironment(groups, p, width, depth, pierTop);
  addHouseMasses(groups, p, width, depth, wallBase);
  addFacadeModules(groups, p, rng, width, depth, wallBase);
  addRoofSystem(groups, p, rng, width, depth, eaveY, overhang);
  addSupports(groups, p, width, depth, wallBase);
  addWalkwaysAndStairs(groups, p, width, depth, wallBase);
  addSetDressing(groups, p, rng, width, frontZ, wallBase);

  if (seededChance(p.seed, 0x71a9, p.towerProbability)) {
    addTower(groups, p, width, depth, wallBase);
  }

  return [...groups.entries()].map(([name, group]) => ({
    name,
    label: group.label,
    mesh: group.meshes.length === 1 ? group.meshes[0]! : merge(...group.meshes),
    color: group.color,
    surface: name === "roof"
      ? { type: "slateRoof", params: { color: group.color, rows: 15, columns: 9, seed: p.seed ^ 0x493d } }
      : group.surface,
    metadata: {
      sourceStudy: SOURCE_STUDY,
      sourceVideo: SOURCE_VIDEO,
      method: "procedural reconstruction from Houdini node graph and module taxonomy",
      moduleGrid: "2m x 3m x 2m",
      seed: p.seed,
      weathering: p.weathering,
    },
  }));
}

function addEnvironment(
  groups: Map<string, Group>,
  p: HoudiniLakeHouseParams,
  width: number,
  depth: number,
  pierTop: number,
): void {
  add(groups, "lakebed", placedBox(p.lakeSize * 1.08, 0.28, p.lakeSize * 0.86, 0, -0.45, 1.2));
  add(groups, "lake", placedBox(p.lakeSize, 0.055, p.lakeSize * 0.78, 0, 0, 1.2));

  const pierWidth = width + 3.4;
  const pierDepth = depth + 4.8;
  const deckZ = 0.6;
  const plankCount = Math.max(12, Math.round(pierDepth / 0.42));
  for (let index = 0; index < plankCount; index++) {
    const z = deckZ - pierDepth * 0.5 + (index + 0.5) * (pierDepth / plankCount);
    add(groups, "platform_deck", placedBox(pierWidth, 0.16, pierDepth / plankCount - 0.035, 0, pierTop, z));
  }

  const xs = [-pierWidth * 0.5, -pierWidth / 6, pierWidth / 6, pierWidth * 0.5];
  const zs = [deckZ - pierDepth * 0.5, deckZ, deckZ + pierDepth * 0.5];
  const postBottom = -0.42;
  const postTop = pierTop + 0.08;
  const postY = (postBottom + postTop) * 0.5;
  const postHeight = postTop - postBottom;
  for (const x of xs) {
    for (const z of zs) {
      add(groups, "stone_pier", placedBox(0.5, 0.3, 0.5, x, -0.3, z));
      add(groups, "pier_posts", transform(cylinder(0.13, postHeight, 8), { translate: vec3(x, postY, z) }));
    }
  }
  for (const z of [zs[0]!, zs[2]!]) {
    for (let index = 0; index < xs.length - 1; index++) {
      const a = xs[index]!;
      const b = xs[index + 1]!;
      add(groups, "pier_posts", beamBetween(vec3(a, postBottom + 0.18, z), vec3(b, postTop - 0.18, z), 0.1));
      add(groups, "pier_posts", beamBetween(vec3(a, postTop - 0.18, z), vec3(b, postBottom + 0.18, z), 0.1));
    }
  }
  for (const x of [xs[0]!, xs[3]!]) {
    for (let index = 0; index < zs.length - 1; index++) {
      const a = zs[index]!;
      const b = zs[index + 1]!;
      add(groups, "pier_posts", beamBetween(vec3(x, postBottom + 0.18, a), vec3(x, postTop - 0.18, b), 0.1));
      add(groups, "pier_posts", beamBetween(vec3(x, postTop - 0.18, a), vec3(x, postBottom + 0.18, b), 0.1));
    }
  }
}

function addHouseMasses(
  groups: Map<string, Group>,
  p: HoudiniLakeHouseParams,
  width: number,
  depth: number,
  wallBase: number,
): void {
  for (const mass of houseMasses(p, width, depth)) addFramedMass(groups, mass, wallBase, p.floorHeight, p.bayWidth);
}

function addFacadeModules(
  groups: Map<string, Group>,
  p: HoudiniLakeHouseParams,
  rng: ReturnType<typeof makeRng>,
  width: number,
  depth: number,
  wallBase: number,
): void {
  const windowWidth = p.bayWidth * 0.46;
  const windowHeight = p.floorHeight * 0.42;
  const [main, left, right] = houseMasses(p, width, depth);
  const mainFront = main!.z + main!.depth * 0.5 + 0.065;
  const mainBack = main!.z - main!.depth * 0.5 - 0.065;
  const mainColumns = Math.max(2, Math.round(main!.width / p.bayWidth));
  for (let floor = 0; floor < p.floors; floor++) {
    const y = wallBase + floor * p.floorHeight + p.floorHeight * 0.55;
    for (let column = 0; column < mainColumns; column++) {
      const x = main!.x - main!.width * 0.5 + (column + 0.5) * (main!.width / mainColumns);
      if (floor === 0 && column === mainColumns - 1) {
        addDoor(groups, x, wallBase, mainFront, p.bayWidth * 0.44, p.floorHeight * 0.72, 0);
      } else {
        addWindow(groups, x, y, mainFront, windowWidth, windowHeight, 0, rng.next() < 0.58);
      }
      addWindow(groups, x, y, mainBack, windowWidth * 0.9, windowHeight, Math.PI, rng.next() < 0.42);
    }
  }

  const wingY = wallBase + p.floorHeight * 0.53;
  const leftFront = left!.z + left!.depth * 0.5 + 0.065;
  addDoor(groups, left!.x, wallBase, leftFront, p.bayWidth * 0.46, p.floorHeight * 0.7, 0);
  addWindow(groups, left!.x - left!.width * 0.5 - 0.065, wingY, left!.z, windowWidth * 0.78, windowHeight, -Math.PI / 2, true);

  const rightFront = right!.z + right!.depth * 0.5 + 0.065;
  addWindow(groups, right!.x, wingY, rightFront, windowWidth * 0.9, windowHeight, 0, true);
  addWindow(groups, right!.x + right!.width * 0.5 + 0.065, wingY, right!.z, windowWidth * 0.78, windowHeight, Math.PI / 2, false);
}

function addRoofSystem(
  groups: Map<string, Group>,
  p: HoudiniLakeHouseParams,
  rng: ReturnType<typeof makeRng>,
  width: number,
  depth: number,
  eaveY: number,
  overhang: number,
): void {
  const wallBase = eaveY - p.floors * p.floorHeight;
  const masses = houseMasses(p, width, depth);
  const main = masses[0]!;
  for (const mass of masses) {
    const eave = wallBase + mass.height;
    const rise = mass.depth * 0.5 * p.roofPitch;
    add(groups, "roof", transform(buildRoofGeneratorMesh({
      style: "gable",
      width: mass.width,
      depth: mass.depth,
      wallHeight: eave,
      roofHeight: rise,
      overhang: overhang * (mass === main ? 1 : 0.72),
    }), { translate: vec3(mass.x, 0, mass.z) }));
    add(groups, "roof_trim", placedBox(mass.width + overhang * 1.7, 0.11, 0.14, mass.x, eave + rise + 0.045, mass.z));
  }

  const dormerCandidates = Math.max(2, p.baysX - 1);
  for (let index = 0; index < dormerCandidates; index++) {
    if (rng.next() >= p.roofWindowProbability) continue;
    const x = main.x - main.width * 0.34 + (index / Math.max(1, dormerCandidates - 1)) * main.width * 0.68;
    const z = main.z + main.depth * 0.24;
    const mainRise = main.depth * 0.5 * p.roofPitch;
    const baseY = wallBase + main.height + mainRise * 0.38;
    addDormer(groups, x, baseY, z, p.bayWidth * 0.78, p.floorHeight * 0.48, p.roofPitch);
  }

  if (seededChance(p.seed, 0x2d53, p.chimneyProbability)) {
    const x = main.x + main.width * 0.27;
    const y = wallBase + main.height + main.depth * p.roofPitch * 0.3;
    add(groups, "chimney", placedBox(0.48, 1.75, 0.45, x, y + 0.55, main.z - main.depth * 0.15));
    add(groups, "chimney", placedBox(0.62, 0.16, 0.6, x, y + 1.46, main.z - main.depth * 0.15));
  }
}

function addSupports(
  groups: Map<string, Group>,
  p: HoudiniLakeHouseParams,
  width: number,
  depth: number,
  wallBase: number,
): void {
  const frontZ = depth * 0.5 + p.bayWidth * 0.64;
  const postHeight = p.floorHeight;
  const postY = wallBase + postHeight * 0.5;
  const thickness = 0.16;
  for (let bay = 0; bay <= p.baysX; bay++) {
    const x = -width * 0.5 + bay * p.bayWidth;
    add(groups, "supports", placedBox(thickness, postHeight, thickness, x, postY, frontZ));
    if (bay < p.baysX) {
      const nextX = x + p.bayWidth;
      add(groups, "supports", beamBetween(vec3(x, wallBase + postHeight * 0.78, frontZ), vec3(nextX, wallBase + postHeight, frontZ), thickness * 0.7));
      add(groups, "supports", beamBetween(vec3(nextX, wallBase + postHeight * 0.78, frontZ), vec3(x, wallBase + postHeight, frontZ), thickness * 0.7));
    }
  }
  add(groups, "supports", placedBox(width + 0.3, thickness, thickness, 0, wallBase + postHeight, frontZ));
}

function addWalkwaysAndStairs(
  groups: Map<string, Group>,
  p: HoudiniLakeHouseParams,
  width: number,
  depth: number,
  wallBase: number,
): void {
  const frontZ = depth * 0.5 + p.bayWidth * 0.62;
  const balconyY = wallBase + p.floorHeight;
  const deckDepth = p.bayWidth * 0.78;
  add(groups, "balcony", placedBox(width + 0.36, 0.18, deckDepth, 0, balconyY, frontZ));
  addRailing(groups, -width * 0.5, width * 0.5, balconyY + 0.62, frontZ + deckDepth * 0.5, 0.12);

  const pierZ = depth * 0.5 + 1.8 + p.walkwayLength * 0.5;
  add(groups, "balcony", placedBox(1.5, 0.2, p.walkwayLength, width * 0.36, p.pierHeight + 0.08, pierZ));
  addRailing(groups, -p.walkwayLength * 0.5, p.walkwayLength * 0.5, p.pierHeight + 0.72, width * 0.36 - 0.66, 0.11, true, pierZ);
  addRailing(groups, -p.walkwayLength * 0.5, p.walkwayLength * 0.5, p.pierHeight + 0.72, width * 0.36 + 0.66, 0.11, true, pierZ);

  const steps = Math.max(8, Math.round((wallBase + p.floorHeight - p.pierHeight) / 0.22));
  const stairX = -width * 0.34;
  const stairStartZ = frontZ + deckDepth * 0.2;
  for (let step = 0; step < steps; step++) {
    const t = step / Math.max(1, steps - 1);
    const y = balconyY - t * (balconyY - p.pierHeight) - 0.06;
    const z = stairStartZ + t * 3.6;
    add(groups, "stairs", placedBox(1.25, 0.14, 0.42, stairX, y, z));
  }
  const topLeft = vec3(stairX - 0.58, balconyY + 0.72, stairStartZ);
  const bottomLeft = vec3(stairX - 0.58, p.pierHeight + 0.72, stairStartZ + 3.6);
  const topRight = vec3(stairX + 0.58, balconyY + 0.72, stairStartZ);
  const bottomRight = vec3(stairX + 0.58, p.pierHeight + 0.72, stairStartZ + 3.6);
  add(groups, "stairs", beamBetween(topLeft, bottomLeft, 0.1));
  add(groups, "stairs", beamBetween(topRight, bottomRight, 0.1));
}

function addSetDressing(
  groups: Map<string, Group>,
  p: HoudiniLakeHouseParams,
  rng: ReturnType<typeof makeRng>,
  width: number,
  frontZ: number,
  wallBase: number,
): void {
  const craneX = width * 0.48;
  const craneZ = frontZ + 1.45;
  const craneBaseY = p.pierHeight + 0.2;
  add(groups, "metal", placedBox(0.18, 3.1, 0.18, craneX, craneBaseY + 1.55, craneZ));
  add(groups, "metal", beamBetween(
    vec3(craneX, craneBaseY + 2.9, craneZ),
    vec3(craneX - 1.55, craneBaseY + 3.55, craneZ + 0.1),
    0.15,
  ));
  add(groups, "metal", placedBox(0.035, 1.45, 0.035, craneX - 1.48, craneBaseY + 2.75, craneZ + 0.1));
  add(groups, "metal", transform(cone(0.14, 0.18, 8), {
    translate: vec3(craneX - 1.48, craneBaseY + 2.02, craneZ + 0.1),
  }));

  for (let index = 0; index < 4; index++) {
    const x = -width * 0.34 + index * 0.72 + rng.range(-0.08, 0.08);
    const z = frontZ + 1.18 + rng.range(-0.18, 0.18);
    const size = rng.range(0.48, 0.7);
    add(groups, "props", placedBox(size, size * 0.72, size, x, p.pierHeight + size * 0.36, z));
  }
  add(groups, "props", transform(box(0.16, 2.4, 0.1), {
    rotate: vec3(0, 0, -0.32),
    translate: vec3(width * 0.05, wallBase + 1.28, frontZ + 0.87),
  }));
  add(groups, "props", transform(box(0.42, 0.62, 0.08), {
    rotate: vec3(0, 0, -0.32),
    translate: vec3(width * 0.05 + 0.34, wallBase + 0.18, frontZ + 0.87),
  }));

  for (const x of [-width * 0.32, 0, width * 0.32]) {
    add(groups, "metal", placedBox(0.03, 0.5, 0.03, x, wallBase + p.floorHeight * 0.76, frontZ + 0.72));
    add(groups, "lanterns", transform(cylinder(0.12, 0.28, 10), {
      translate: vec3(x, wallBase + p.floorHeight * 0.62, frontZ + 0.72),
    }));
  }
}

function addTower(
  groups: Map<string, Group>,
  p: HoudiniLakeHouseParams,
  width: number,
  depth: number,
  wallBase: number,
): void {
  const main = houseMasses(p, width, depth)[0]!;
  const towerSize = p.bayWidth * 1.28;
  const towerHeight = p.floorHeight * 1.72;
  const x = main.x - main.width * 0.18;
  const z = main.z - main.depth * 0.08;
  const baseY = wallBase + p.floorHeight * 0.82;
  add(groups, "tower", placedBox(towerSize, towerHeight, towerSize, x, baseY + towerHeight * 0.5, z));

  const crownY = baseY + towerHeight;
  add(groups, "roof", transform(buildRoofGeneratorMesh({
    style: "gable",
    width: towerSize,
    depth: towerSize * 0.92,
    wallHeight: crownY,
    roofHeight: towerSize * 0.62,
    overhang: towerSize * 0.16,
  }), { translate: vec3(x, 0, z) }));
  add(groups, "roof_trim", placedBox(towerSize * 1.32, 0.11, 0.13, x, crownY + towerSize * 0.62 + 0.04, z));

  const y = baseY + towerHeight * 0.55;
  addWindow(groups, x, y, z + towerSize * 0.5 + 0.06, towerSize * 0.45, towerHeight * 0.28, 0, false);
  addWindow(groups, x + towerSize * 0.5 + 0.06, y, z, towerSize * 0.45, towerHeight * 0.28, Math.PI / 2, false);
}

function addDormer(
  groups: Map<string, Group>,
  x: number,
  baseY: number,
  z: number,
  width: number,
  height: number,
  pitch: number,
): void {
  const depth = width * 0.66;
  add(groups, "timber_walls", placedBox(width, height, depth, x, baseY + height * 0.5, z));
  add(groups, "roof", transform(buildRoofGeneratorMesh({
    style: "gable",
    width,
    depth,
    wallHeight: baseY + height,
    roofHeight: width * 0.34 * pitch,
    overhang: width * 0.12,
  }), { translate: vec3(x, 0, z) }));
  addWindow(groups, x, baseY + height * 0.52, z + depth * 0.5 + 0.04, width * 0.46, height * 0.52, 0, false);
}

function addWindow(
  groups: Map<string, Group>,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  yaw: number,
  shutters: boolean,
): void {
  const stock = Math.max(0.065, width * 0.1);
  const local: Array<[keyof typeof GROUPS, Mesh]> = [
    ["window_glass", placedBox(width, height, 0.055, 0, 0, 0)],
    ["window_frames", placedBox(width + stock * 2, stock, 0.1, 0, height * 0.5 + stock * 0.5, 0.02)],
    ["window_frames", placedBox(width + stock * 2, stock, 0.1, 0, -height * 0.5 - stock * 0.5, 0.02)],
    ["window_frames", placedBox(stock, height, 0.1, -width * 0.5 - stock * 0.5, 0, 0.02)],
    ["window_frames", placedBox(stock, height, 0.1, width * 0.5 + stock * 0.5, 0, 0.02)],
    ["window_frames", placedBox(stock * 0.55, height, 0.105, 0, 0, 0.025)],
    ["window_frames", placedBox(width, stock * 0.55, 0.105, 0, 0, 0.025)],
  ];
  if (shutters) {
    local.push(
      ["window_frames", placedBox(width * 0.36, height * 0.98, 0.06, -width * 0.76, 0, 0.01)],
      ["window_frames", placedBox(width * 0.36, height * 0.98, 0.06, width * 0.76, 0, 0.01)],
    );
  }
  for (const [name, mesh] of local) {
    add(groups, name, transform(mesh, { rotate: vec3(0, yaw, 0), translate: vec3(x, y, z) }));
  }
}

function addDoor(
  groups: Map<string, Group>,
  x: number,
  baseY: number,
  z: number,
  width: number,
  height: number,
  yaw: number,
): void {
  const stock = width * 0.13;
  const meshes: Array<[keyof typeof GROUPS, Mesh]> = [
    ["doors", placedBox(width, height, 0.12, 0, height * 0.5, 0)],
    ["window_frames", placedBox(stock, height + stock, 0.17, -width * 0.5 - stock * 0.5, height * 0.5, 0.02)],
    ["window_frames", placedBox(stock, height + stock, 0.17, width * 0.5 + stock * 0.5, height * 0.5, 0.02)],
    ["window_frames", placedBox(width + stock * 2, stock, 0.17, 0, height + stock * 0.5, 0.02)],
    ["metal", transform(cylinder(stock * 0.22, 0.09, 10), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(width * 0.3, height * 0.5, 0.1) })],
  ];
  for (const [name, mesh] of meshes) {
    add(groups, name, transform(mesh, { rotate: vec3(0, yaw, 0), translate: vec3(x, baseY, z) }));
  }
}

function addRailing(
  groups: Map<string, Group>,
  start: number,
  end: number,
  y: number,
  fixed: number,
  thickness: number,
  alongZ = false,
  centerZ = 0,
): void {
  const length = end - start;
  if (alongZ) {
    add(groups, "balcony", placedBox(thickness, thickness, length, fixed, y, centerZ));
    for (let z = start; z <= end + 0.01; z += 0.72) {
      add(groups, "balcony", placedBox(thickness, 0.72, thickness, fixed, y - 0.34, centerZ + z));
    }
  } else {
    add(groups, "balcony", placedBox(length, thickness, thickness, (start + end) * 0.5, y, fixed));
    for (let x = start; x <= end + 0.01; x += 0.72) {
      add(groups, "balcony", placedBox(thickness, 0.72, thickness, x, y - 0.34, fixed));
    }
  }
}

function beamBetween(a: Vec3, b: Vec3, thickness: number): Mesh {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dy, dz);
  return transform(box(thickness, length, thickness), {
    rotate: vec3(Math.atan2(Math.hypot(dx, dz), dy), Math.atan2(dx, dz), 0),
    translate: vec3((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (a.z + b.z) * 0.5),
  });
}

function placedBox(width: number, height: number, depth: number, x: number, y: number, z: number): Mesh {
  return transform(box(width, height, depth), { translate: vec3(x, y, z) });
}

function add(groups: Map<string, Group>, name: keyof typeof GROUPS, mesh: Mesh): void {
  let group = groups.get(name);
  if (!group) {
    const source = GROUPS[name];
    group = { ...source, meshes: [] };
    groups.set(name, group);
  }
  group.meshes.push(mesh);
}

function houseMasses(
  p: HoudiniLakeHouseParams,
  width: number,
  depth: number,
): [HouseMass, HouseMass, HouseMass] {
  return [
    {
      x: width * 0.05,
      z: -depth * 0.04,
      width: width * 0.58,
      depth: depth * 0.72,
      height: p.floors * p.floorHeight,
    },
    {
      x: -width * 0.36,
      z: depth * 0.12,
      width: width * 0.32,
      depth: depth * 0.55,
      height: p.floorHeight * 1.02,
    },
    {
      x: width * 0.38,
      z: -depth * 0.02,
      width: width * 0.3,
      depth: depth * 0.5,
      height: p.floorHeight * 1.08,
    },
  ];
}

function addFramedMass(
  groups: Map<string, Group>,
  mass: HouseMass,
  wallBase: number,
  floorHeight: number,
  bayWidth: number,
): void {
  const beam = Math.max(0.13, bayWidth * 0.075);
  add(groups, "timber_walls", placedBox(mass.width, mass.height, mass.depth, mass.x, wallBase + mass.height * 0.5, mass.z));
  const levels = Math.max(1, Math.round(mass.height / floorHeight));
  for (let level = 0; level <= levels; level++) {
    const y = wallBase + Math.min(mass.height, level * floorHeight);
    add(groups, "timber_frame", placedBox(mass.width + beam, beam, beam, mass.x, y, mass.z + mass.depth * 0.5 + beam * 0.5));
    add(groups, "timber_frame", placedBox(mass.width + beam, beam, beam, mass.x, y, mass.z - mass.depth * 0.5 - beam * 0.5));
  }
  const columns = Math.max(1, Math.round(mass.width / bayWidth));
  for (let column = 0; column <= columns; column++) {
    const x = mass.x - mass.width * 0.5 + column * (mass.width / columns);
    add(groups, "timber_frame", placedBox(beam, mass.height, beam, x, wallBase + mass.height * 0.5, mass.z + mass.depth * 0.5 + beam * 0.5));
    add(groups, "timber_frame", placedBox(beam, mass.height, beam, x, wallBase + mass.height * 0.5, mass.z - mass.depth * 0.5 - beam * 0.5));
  }
  for (const x of [mass.x - mass.width * 0.5 - beam * 0.5, mass.x + mass.width * 0.5 + beam * 0.5]) {
    add(groups, "timber_frame", placedBox(beam, mass.height, beam, x, wallBase + mass.height * 0.5, mass.z));
  }
}

function def(label: string, color: RGB, type: string, params: Record<string, unknown>): GroupDef {
  return { label, color, surface: { type, params: { color, ...params } } };
}

function normalizeParams(params: Partial<HoudiniLakeHouseParams>): HoudiniLakeHouseParams {
  const p = { ...HOUDINI_LAKE_HOUSE_DEFAULTS, ...params };
  return {
    seed: Math.round(finite(p.seed, 2983)) >>> 0,
    floors: clampInt(p.floors, 1, 3),
    baysX: clampInt(p.baysX, 3, 7),
    baysZ: clampInt(p.baysZ, 2, 5),
    bayWidth: clamp(p.bayWidth, 1.4, 2.8),
    floorHeight: clamp(p.floorHeight, 2.4, 3.8),
    roofPitch: clamp(p.roofPitch, 0.35, 1.15),
    roofWindowProbability: clamp(p.roofWindowProbability, 0, 1),
    chimneyProbability: clamp(p.chimneyProbability, 0, 1),
    towerProbability: clamp(p.towerProbability, 0, 1),
    walkwayLength: clamp(p.walkwayLength, 2.5, 10),
    pierHeight: clamp(p.pierHeight, 0.8, 2.8),
    lakeSize: clamp(p.lakeSize, 14, 36),
    weathering: clamp(p.weathering, 0, 1),
  };
}

function seededChance(seed: number, salt: number, probability: number): boolean {
  if (probability <= 0) return false;
  if (probability >= 1) return true;
  let value = (seed ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = (value ^ (value >>> 16)) >>> 0;
  return value / 0x100000000 < probability;
}

function seededSigned(seed: number, salt: number): number {
  let value = (seed ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d);
  value = Math.imul(value ^ (value >>> 12), 0x297a2d39);
  return (((value ^ (value >>> 15)) >>> 0) / 0xffffffff) * 2 - 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, finite(value, min)));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
