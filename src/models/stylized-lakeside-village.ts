import {
  box,
  cone,
  cylinder,
  icosphere,
  makeMesh,
  merge,
  plane,
  rotateMesh,
  scaleMesh,
  styleLowPolyMesh,
  translateMesh,
  type LowPolyColor,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { vec2 } from "../math/vec2.js";
import { vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";

export interface StylizedLakesideVillageOptions {
  seed?: number;
  treeDensity?: number;
  night?: number;
  colorVariation?: number;
}

const SOURCE_URL = "https://www.bilibili.com/video/BV18U4y1L7AV";

interface HouseMeshes {
  walls: Mesh[];
  timber: Mesh[];
  roofs: Mesh[];
  doors: Mesh[];
  windows: Mesh[];
}

function placed(
  mesh: Mesh,
  position: [number, number, number],
  scale: [number, number, number] = [1, 1, 1],
  rotation: [number, number, number] = [0, 0, 0],
): Mesh {
  return translateMesh(
    rotateMesh(scaleMesh(mesh, vec3(scale[0], scale[1], scale[2])), vec3(rotation[0], rotation[1], rotation[2])),
    vec3(position[0], position[1], position[2]),
  );
}

function mixColor(day: LowPolyColor, night: LowPolyColor, amount: number): LowPolyColor {
  const t = Math.max(0, Math.min(1, amount));
  return [
    day[0] + (night[0] - day[0]) * t,
    day[1] + (night[1] - day[1]) * t,
    day[2] + (night[2] - day[2]) * t,
  ];
}

function styledPart(
  name: string,
  label: string,
  mesh: Mesh,
  color: LowPolyColor,
  seed: number,
  colorVariation: number,
  surface?: NamedPart["surface"],
  metadata: Record<string, unknown> = {},
): NamedPart {
  const styled = styleLowPolyMesh(mesh, color, { seed, colorVariation });
  const part: NamedPart = {
    name,
    label,
    mesh: styled.mesh,
    colors: styled.colors,
    color,
    metadata: {
      style: "stylized-low-poly",
      sourceStudy: SOURCE_URL,
      ...metadata,
    },
  };
  if (surface) part.surface = surface;
  return part;
}

function gablePrism(width: number, height: number, depth: number): Mesh {
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  const positions = [
    vec3(-halfWidth, 0, -halfDepth),
    vec3(halfWidth, 0, -halfDepth),
    vec3(0, height, -halfDepth),
    vec3(-halfWidth, 0, halfDepth),
    vec3(halfWidth, 0, halfDepth),
    vec3(0, height, halfDepth),
  ];
  return makeMesh({
    positions,
    normals: positions.map(() => vec3(0, 1, 0)),
    uvs: positions.map(() => vec2(0, 0)),
    indices: [
      0, 2, 1,
      3, 4, 5,
      0, 3, 5, 0, 5, 2,
      1, 2, 5, 1, 5, 4,
      0, 1, 4, 0, 4, 3,
    ],
  });
}

function houseTransform(
  mesh: Mesh,
  center: [number, number, number],
  local: [number, number, number],
  yaw: number,
  localRotation: [number, number, number] = [0, 0, 0],
): Mesh {
  const localMesh = translateMesh(
    rotateMesh(mesh, vec3(localRotation[0], localRotation[1], localRotation[2])),
    vec3(local[0], local[1], local[2]),
  );
  return translateMesh(rotateMesh(localMesh, vec3(0, yaw, 0)), vec3(center[0], center[1], center[2]));
}

function buildTimberHouse(
  center: [number, number, number],
  width: number,
  depth: number,
  height: number,
  yaw: number,
): HouseMeshes {
  const walls: Mesh[] = [];
  const timber: Mesh[] = [];
  const roofs: Mesh[] = [];
  const doors: Mesh[] = [];
  const windows: Mesh[] = [];
  const roofHeight = width * 0.34;
  const roofAngle = Math.atan2(roofHeight, width * 0.5);
  const roofLength = Math.hypot(width * 0.5, roofHeight) + 0.24;
  const front = depth * 0.5 + 0.035;
  const beam = 0.16;

  walls.push(houseTransform(box(width, height, depth), center, [0, height * 0.5, 0], yaw));
  walls.push(houseTransform(gablePrism(width * 0.98, roofHeight, depth * 0.96), center, [0, height, 0], yaw));

  roofs.push(houseTransform(box(roofLength, 0.16, depth + 0.58), center, [-width * 0.25, height + roofHeight * 0.5, 0], yaw, [0, 0, roofAngle]));
  roofs.push(houseTransform(box(roofLength, 0.16, depth + 0.58), center, [width * 0.25, height + roofHeight * 0.5, 0], yaw, [0, 0, -roofAngle]));
  roofs.push(houseTransform(cylinder(0.13, depth + 0.72, 8), center, [0, height + roofHeight + 0.05, 0], yaw, [Math.PI * 0.5, 0, 0]));

  for (const z of [-front, front]) {
    for (const x of [-width * 0.5 + beam * 0.55, width * 0.5 - beam * 0.55]) {
      timber.push(houseTransform(box(beam, height + roofHeight * 0.72, beam), center, [x, (height + roofHeight * 0.72) * 0.5, z], yaw));
    }
    timber.push(houseTransform(box(width, beam, beam), center, [0, beam * 0.7, z], yaw));
    timber.push(houseTransform(box(width, beam, beam), center, [0, height - beam * 0.6, z], yaw));
    timber.push(houseTransform(box(width * 0.96, beam * 0.85, beam), center, [0, height * 0.55, z], yaw));

    const braceLength = Math.hypot(width * 0.44, height * 0.56);
    const braceAngle = Math.atan2(height * 0.56, width * 0.44);
    timber.push(houseTransform(box(braceLength, beam * 0.72, beam * 0.78), center, [-width * 0.25, height * 0.28, z], yaw, [0, 0, braceAngle]));
    timber.push(houseTransform(box(braceLength, beam * 0.72, beam * 0.78), center, [width * 0.25, height * 0.28, z], yaw, [0, 0, -braceAngle]));
  }

  for (const x of [-width * 0.5 + beam * 0.55, width * 0.5 - beam * 0.55]) {
    timber.push(houseTransform(box(beam, height, depth), center, [x, height * 0.5, 0], yaw));
  }

  doors.push(houseTransform(box(width * 0.24, height * 0.68, 0.12), center, [0, height * 0.34, front + 0.04], yaw));
  for (const x of [-width * 0.31, width * 0.31]) {
    windows.push(houseTransform(box(width * 0.18, height * 0.27, 0.1), center, [x, height * 0.58, front + 0.07], yaw));
    timber.push(houseTransform(box(width * 0.19, 0.06, 0.13), center, [x, height * 0.58, front + 0.13], yaw));
    timber.push(houseTransform(box(0.055, height * 0.28, 0.13), center, [x, height * 0.58, front + 0.13], yaw));
  }

  return { walls, timber, roofs, doors, windows };
}

function appendHouse(target: HouseMeshes, house: HouseMeshes): void {
  target.walls.push(...house.walls);
  target.timber.push(...house.timber);
  target.roofs.push(...house.roofs);
  target.doors.push(...house.doors);
  target.windows.push(...house.windows);
}

function addFenceRun(
  posts: Mesh[],
  rails: Mesh[],
  start: [number, number],
  end: [number, number],
  sections: number,
  y: number,
): void {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const length = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  for (let index = 0; index <= sections; index++) {
    const t = index / sections;
    posts.push(placed(cylinder(0.075, 0.95, 6), [start[0] + dx * t, y + 0.475, start[1] + dz * t]));
  }
  for (const railY of [y + 0.34, y + 0.7]) {
    rails.push(placed(box(0.09, 0.09, length), [(start[0] + end[0]) * 0.5, railY, (start[1] + end[1]) * 0.5], [1, 1, 1], [0, yaw, 0]));
  }
}

export function buildStylizedLakesideVillageParts(
  options: StylizedLakesideVillageOptions = {},
): NamedPart[] {
  const seed = options.seed ?? 673285036;
  const density = Math.max(0.35, Math.min(1.8, options.treeDensity ?? 1));
  const night = Math.max(0, Math.min(1, options.night ?? 0));
  const colorVariation = Math.max(0, Math.min(0.24, options.colorVariation ?? 0.1));
  const rng = makeRng(seed);
  const parts: NamedPart[] = [];

  const waterColor = mixColor([0.08, 0.72, 0.9], [0.025, 0.12, 0.2], night);
  const grassColor = mixColor([0.48, 0.72, 0.18], [0.055, 0.2, 0.16], night);
  const soilColor = mixColor([0.43, 0.3, 0.18], [0.075, 0.09, 0.1], night);
  const rockColor = mixColor([0.45, 0.38, 0.3], [0.08, 0.12, 0.15], night);
  const plasterColor = mixColor([0.82, 0.75, 0.62], [0.18, 0.22, 0.22], night);
  const timberColor = mixColor([0.25, 0.12, 0.06], [0.055, 0.035, 0.03], night);
  const roofColor = mixColor([0.55, 0.19, 0.11], [0.12, 0.07, 0.08], night);
  const foliageLight = mixColor([0.42, 0.72, 0.16], [0.035, 0.24, 0.2], night);
  const foliageDark = mixColor([0.2, 0.52, 0.15], [0.02, 0.14, 0.14], night);

  parts.push(styledPart(
    "lake_water",
    "湖面",
    placed(plane(42, 34, 8, 8), [0, -0.58, 1]),
    waterColor,
    seed,
    colorVariation * 0.35,
    { type: "emissive", params: { color: waterColor, intensity: 0.24 + night * 0.18 } },
    { waterBody: "lake", castShadow: false, cameraFitIgnore: true },
  ));

  const islandRock = merge(
    placed(icosphere(1, 2), [0, -0.1, -0.4], [11.8, 1.2, 8.9]),
    placed(icosphere(1, 2), [6.8, -0.26, -2.8], [5.4, 1.1, 5.1]),
    placed(icosphere(1, 1), [-8.6, -0.3, 1.5], [4.1, 0.95, 4.4]),
  );
  const islandGrass = merge(
    placed(icosphere(1, 2), [0, 0.25, -0.45], [10.9, 1.05, 8.1]),
    placed(icosphere(1, 2), [6.7, 0.08, -2.8], [4.7, 0.76, 4.4]),
    placed(icosphere(1, 1), [-8.5, 0.02, 1.5], [3.45, 0.68, 3.7]),
  );
  parts.push(styledPart("island_rock_banks", "岛岸岩层", islandRock, soilColor, seed + 1, colorVariation));
  parts.push(styledPart("island_grass", "起伏草地", islandGrass, grassColor, seed + 2, colorVariation));

  const mountains: Mesh[] = [];
  for (let index = 0; index < 7; index++) {
    const x = -18 + index * 6;
    const height = rng.range(5.5, 10);
    mountains.push(placed(
      cone(rng.range(3.7, 6.4), height, 5),
      [x, height * 0.5 - 0.3, -14 - (index % 2) * 1.8],
      [1, 1, rng.range(0.7, 1.25)],
      [0, rng.range(-0.35, 0.35), 0],
    ));
  }
  parts.push(styledPart(
    "distant_mountains",
    "远景低模山群",
    merge(...mountains),
    mixColor([0.55, 0.45, 0.34], [0.035, 0.08, 0.12], night),
    seed + 3,
    colorVariation,
    undefined,
    { castShadow: false, cameraFitIgnore: true },
  ));

  const houseMeshes: HouseMeshes = { walls: [], timber: [], roofs: [], doors: [], windows: [] };
  appendHouse(houseMeshes, buildTimberHouse([-4.4, 0.64, -1.9], 4.2, 3.4, 2.55, 0.12));
  appendHouse(houseMeshes, buildTimberHouse([3.9, 0.58, -3.1], 3.45, 2.9, 2.2, -0.18));
  appendHouse(houseMeshes, buildTimberHouse([6.8, 0.46, 1.1], 2.65, 2.35, 1.75, -0.58));
  parts.push(styledPart("village_plaster_walls", "木构房·灰泥墙", merge(...houseMeshes.walls), plasterColor, seed + 4, colorVariation * 0.55, { type: "stylizedPlaster", params: { color: plasterColor, bands: 4, seed } }));
  parts.push(styledPart("village_timber_frames", "木构房·深色梁架", merge(...houseMeshes.timber), timberColor, seed + 5, colorVariation * 0.45, { type: "wood", params: { color: timberColor, roughness: 0.9, seed: seed + 1 } }));
  parts.push(styledPart("village_roofs", "木构房·暖红瓦顶", merge(...houseMeshes.roofs), roofColor, seed + 6, colorVariation * 0.72, { type: "stylizedRoof", params: { color: roofColor, rows: 9, seed: seed + 2 } }));
  parts.push(styledPart("village_doors", "木构房·木门", merge(...houseMeshes.doors), mixColor([0.36, 0.18, 0.08], [0.07, 0.045, 0.03], night), seed + 7, colorVariation * 0.4, { type: "wood", params: { color: timberColor, roughness: 0.84 } }));
  const windowColor: LowPolyColor = mixColor([0.95, 0.72, 0.28], [1, 0.58, 0.12], night);
  parts.push(styledPart("village_lit_windows", "木构房·暖光窗", merge(...houseMeshes.windows), windowColor, seed + 8, colorVariation * 0.2, { type: "emissive", params: { color: windowColor, intensity: 0.7 + night * 4.3 } }, { castShadow: false }));

  const dockPlanks: Mesh[] = [];
  const dockSupports: Mesh[] = [];
  for (let index = 0; index < 15; index++) {
    dockPlanks.push(placed(box(2.35, 0.14, 0.43), [0.2, 0.5, 4.8 + index * 0.43]));
    if (index % 3 === 0) {
      dockSupports.push(placed(cylinder(0.1, 1.9, 6), [-0.86, -0.18, 4.8 + index * 0.43]));
      dockSupports.push(placed(cylinder(0.1, 1.9, 6), [1.26, -0.18, 4.8 + index * 0.43]));
    }
  }
  for (let index = 0; index < 7; index++) dockPlanks.push(placed(box(0.43, 0.14, 3.7), [-1.1 + index * 0.43, 0.51, 10.95]));
  parts.push(styledPart("wooden_dock_planks", "湖岸木码头·踏板", merge(...dockPlanks), mixColor([0.42, 0.24, 0.11], [0.075, 0.05, 0.035], night), seed + 9, colorVariation, { type: "wood", params: { color: timberColor, roughness: 0.86, seed: seed + 3 } }));
  parts.push(styledPart("wooden_dock_supports", "湖岸木码头·桩柱", merge(...dockSupports), timberColor, seed + 10, colorVariation * 0.5, { type: "wood", params: { color: timberColor, roughness: 0.92 } }));

  const wellStone = merge(
    placed(cylinder(1.18, 0.38, 12), [2.8, 0.7, 2.6]),
    placed(cylinder(0.76, 0.42, 12), [2.8, 0.96, 2.6]),
  );
  const wellWood = merge(
    placed(box(0.16, 2.25, 0.16), [1.85, 1.8, 2.6]),
    placed(box(0.16, 2.25, 0.16), [3.75, 1.8, 2.6]),
    placed(cylinder(0.08, 1.85, 8), [2.8, 1.62, 2.6], [1, 1, 1], [0, 0, Math.PI * 0.5]),
  );
  const wellRoof = placed(cone(1.55, 1.0, 4), [2.8, 3.05, 2.6], [1, 1, 0.78], [0, Math.PI * 0.25, 0]);
  parts.push(styledPart("village_well_stone", "村落水井·石台", wellStone, rockColor, seed + 11, colorVariation));
  parts.push(styledPart("village_well_frame", "村落水井·木架", wellWood, timberColor, seed + 12, colorVariation * 0.5, { type: "wood", params: { color: timberColor, roughness: 0.9 } }));
  parts.push(styledPart("village_well_roof", "村落水井·瓦顶", wellRoof, roofColor, seed + 13, colorVariation * 0.72, { type: "stylizedRoof", params: { color: roofColor, rows: 6 } }));

  const fencePosts: Mesh[] = [];
  const fenceRails: Mesh[] = [];
  addFenceRun(fencePosts, fenceRails, [-5.8, 2.7], [-1.7, 4.4], 5, 0.45);
  addFenceRun(fencePosts, fenceRails, [1.8, 4.35], [5.8, 3.2], 5, 0.45);
  addFenceRun(fencePosts, fenceRails, [-7.5, 0.8], [-7.1, 4.2], 4, 0.42);
  parts.push(styledPart("village_fence_posts", "村路围栏·立柱", merge(...fencePosts), timberColor, seed + 14, colorVariation * 0.45, { type: "wood", params: { color: timberColor, roughness: 0.92 } }));
  parts.push(styledPart("village_fence_rails", "村路围栏·横杆", merge(...fenceRails), timberColor, seed + 15, colorVariation * 0.45, { type: "wood", params: { color: timberColor, roughness: 0.92 } }));

  const treeTrunks: Mesh[] = [];
  const lightCrowns: Mesh[] = [];
  const darkCrowns: Mesh[] = [];
  const treeCount = Math.max(7, Math.round(22 * density));
  for (let index = 0; index < treeCount; index++) {
    const angle = (index / treeCount) * Math.PI * 2 + rng.range(-0.18, 0.18);
    const radiusX = rng.range(7.6, 10.4);
    const radiusZ = rng.range(5.8, 7.7);
    const x = Math.cos(angle) * radiusX;
    const z = Math.sin(angle) * radiusZ - 0.5;
    if (z > 3.5 && Math.abs(x) < 2.6) continue;
    const scale = rng.range(0.78, 1.35);
    treeTrunks.push(placed(cylinder(0.15, 2.2, 6), [x, 1.35, z], [scale, scale, scale], [0, rng.range(-Math.PI, Math.PI), rng.range(-0.08, 0.08)]));
    const lobes: Mesh[] = [];
    const lobeCount = rng.int(3, 6);
    for (let lobe = 0; lobe < lobeCount; lobe++) {
      lobes.push(placed(
        icosphere(0.85, 1),
        [x + rng.range(-0.45, 0.45) * scale, 2.85 * scale + rng.range(-0.15, 0.45), z + rng.range(-0.4, 0.4) * scale],
        [scale * rng.range(0.75, 1.25), scale * rng.range(0.72, 1.18), scale * rng.range(0.75, 1.25)],
        [rng.range(-0.4, 0.4), rng.range(-Math.PI, Math.PI), rng.range(-0.4, 0.4)],
      ));
    }
    (index % 3 === 0 ? darkCrowns : lightCrowns).push(...lobes);
  }
  parts.push(styledPart("village_tree_trunks", "低模阔叶树·树干", merge(...treeTrunks), mixColor([0.32, 0.18, 0.08], [0.035, 0.055, 0.05], night), seed + 16, colorVariation * 0.65, { type: "wood", params: { color: timberColor, roughness: 0.94 } }));
  parts.push(styledPart("village_tree_crowns_light", "低模阔叶树·亮叶簇", merge(...lightCrowns), foliageLight, seed + 17, colorVariation, { type: "stylizedFoliage", params: { color: foliageLight, bands: 3, seed: seed + 4 } }));
  parts.push(styledPart("village_tree_crowns_dark", "低模阔叶树·深叶簇", merge(...darkCrowns), foliageDark, seed + 18, colorVariation, { type: "stylizedFoliage", params: { color: foliageDark, bands: 3, seed: seed + 5 } }));

  const shoreRocks: Mesh[] = [];
  for (let index = 0; index < 24; index++) {
    const angle = (index / 24) * Math.PI * 2 + rng.range(-0.12, 0.12);
    shoreRocks.push(placed(
      icosphere(0.55, 1),
      [Math.cos(angle) * rng.range(9.4, 11.2), rng.range(-0.05, 0.42), Math.sin(angle) * rng.range(7.1, 8.7) - 0.35],
      [rng.range(0.55, 1.7), rng.range(0.55, 1.25), rng.range(0.55, 1.5)],
      [rng.range(-0.6, 0.6), rng.range(-Math.PI, Math.PI), rng.range(-0.6, 0.6)],
    ));
  }
  parts.push(styledPart("shore_rocks", "湖岸散石", merge(...shoreRocks), rockColor, seed + 19, colorVariation));

  const lampPosts: Mesh[] = [];
  const lampFixtures: Mesh[] = [];
  const lampGlow: Mesh[] = [];
  const lampSlots: Array<[number, number]> = [[-1.25, 4.3], [1.65, 4.35], [-0.85, 8.5], [1.25, 10.5], [-5.9, 1.5]];
  for (const [x, z] of lampSlots) {
    lampPosts.push(placed(cylinder(0.075, 2.7, 7), [x, 1.68, z]));
    lampFixtures.push(placed(box(0.65, 0.1, 0.1), [x + 0.25, 2.97, z]));
    lampFixtures.push(placed(cone(0.28, 0.2, 4), [x + 0.5, 2.86, z], [1, 1, 0.8], [0, Math.PI * 0.25, Math.PI]));
    lampGlow.push(placed(box(0.25, 0.4, 0.25), [x + 0.5, 2.66, z]));
  }
  parts.push(styledPart("village_lamp_posts", "村路灯·木杆", merge(...lampPosts), timberColor, seed + 20, colorVariation * 0.45, { type: "wood", params: { color: timberColor, roughness: 0.9 } }));
  parts.push(styledPart("village_lamp_fixtures", "村路灯·灯罩", merge(...lampFixtures), mixColor([0.16, 0.13, 0.1], [0.025, 0.03, 0.035], night), seed + 21, colorVariation * 0.25, { type: "metal", params: { color: [0.12, 0.1, 0.08], roughness: 0.58 } }));
  parts.push(styledPart("village_lamp_glow", "村路灯·暖光", merge(...lampGlow), windowColor, seed + 22, colorVariation * 0.1, { type: "emissive", params: { color: windowColor, intensity: 1.2 + night * 5 } }, { castShadow: false }));

  const fireflies: Mesh[] = [];
  for (let index = 0; index < 28; index++) {
    const angle = rng.next() * Math.PI * 2;
    const radius = rng.range(3.8, 10.5);
    fireflies.push(placed(icosphere(rng.range(0.035, 0.075), 1), [Math.cos(angle) * radius, rng.range(0.9, 3.8), Math.sin(angle) * radius - 0.4]));
  }
  parts.push(styledPart(
    "village_fireflies",
    "夜景萤火",
    merge(...fireflies),
    mixColor([0.72, 0.82, 0.34], [1, 0.85, 0.24], night),
    seed + 23,
    0.05,
    { type: "emissive", params: { color: [1, 0.82, 0.25], intensity: 0.15 + night * 4.5 } },
    { castShadow: false },
  ));

  return parts;
}
