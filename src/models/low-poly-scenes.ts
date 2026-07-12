import {
  box,
  cone,
  cylinder,
  frustum,
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
import { makeNoise } from "../random/noise.js";
import { makeRng, type Rng } from "../random/prng.js";

export type LowPolySceneKind = "village" | "cloud-valley" | "tropical-island";

export interface LowPolySceneOptions {
  seed?: number;
  colorVariation?: number;
}

const SOURCE_URL = "https://www.bilibili.com/video/BV11s411e7Sa";

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

function styledPart(
  name: string,
  label: string,
  mesh: Mesh,
  color: LowPolyColor,
  seed: number,
  colorVariation: number,
  doubleSided = false,
  castShadow = true,
): NamedPart {
  const styled = styleLowPolyMesh(mesh, color, { seed, colorVariation });
  return {
    name,
    label,
    mesh: styled.mesh,
    colors: styled.colors,
    color,
    doubleSided,
    metadata: { style: "low-poly", sourceStudy: SOURCE_URL, castShadow },
  };
}

function gableRoof(width: number, height: number, depth: number): Mesh {
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
    indices: [0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3],
  });
}

function leafBlade(length: number, width: number): Mesh {
  const positions = [
    vec3(0, 0, 0),
    vec3(length * 0.45, length * 0.08, width * 0.5),
    vec3(length, -length * 0.08, 0),
    vec3(length * 0.45, length * 0.08, -width * 0.5),
  ];
  return makeMesh({
    positions,
    normals: positions.map(() => vec3(0, 1, 0)),
    uvs: [vec2(0, 0.5), vec2(0.45, 1), vec2(1, 0.5), vec2(0.45, 0)],
    indices: [0, 2, 1, 0, 3, 2],
  });
}

function displacedGround(sizeX: number, sizeZ: number, segments: number, height: number, seed: number): Mesh {
  const source = plane(sizeX, sizeZ, segments, Math.max(2, Math.round((segments * sizeZ) / sizeX)));
  const noise = makeNoise(seed);
  return makeMesh({
    positions: source.positions.map((point) => vec3(
      point.x,
      noise.noise2(point.x * 0.13, point.z * 0.13) * height +
        noise.noise2(point.x * 0.34 + 17, point.z * 0.34 - 9) * height * 0.28,
      point.z,
    )),
    normals: source.normals.slice(),
    uvs: source.uvs.slice(),
    indices: source.indices.slice(),
  });
}

function broadleafTree(
  position: [number, number, number],
  scale: number,
  seed: number,
): { trunk: Mesh; crown: Mesh } {
  const rng = makeRng(seed);
  const trunk = placed(cylinder(0.12, 1.4, 6), [position[0], position[1] + scale * 0.7, position[2]], [scale, scale, scale]);
  const lobes: Mesh[] = [];
  for (let index = 0; index < 3; index++) {
    lobes.push(placed(
      icosphere(0.72, 1),
      [
        position[0] + rng.range(-0.3, 0.3) * scale,
        position[1] + rng.range(1.45, 1.85) * scale,
        position[2] + rng.range(-0.25, 0.25) * scale,
      ],
      [scale * rng.range(0.8, 1.2), scale * rng.range(0.85, 1.2), scale * rng.range(0.8, 1.2)],
      [rng.range(-0.3, 0.3), rng.range(-Math.PI, Math.PI), rng.range(-0.3, 0.3)],
    ));
  }
  return { trunk, crown: merge(...lobes) };
}

function coniferTree(position: [number, number, number], scale: number): { trunk: Mesh; crown: Mesh } {
  const trunk = placed(cylinder(0.11, 1.6, 6), [position[0], position[1] + 0.8 * scale, position[2]], [scale, scale, scale]);
  const crown = merge(
    placed(cone(0.85, 1.8, 7), [position[0], position[1] + 1.55 * scale, position[2]], [scale, scale, scale]),
    placed(cone(0.65, 1.6, 7), [position[0], position[1] + 2.35 * scale, position[2]], [scale, scale, scale]),
  );
  return { trunk, crown };
}

function palmTree(position: [number, number, number], scale: number, seed: number): { trunk: Mesh; leaves: Mesh } {
  const rng = makeRng(seed);
  const trunkHeight = scale * rng.range(2.6, 3.5);
  const trunk = placed(frustum(0.16, 0.1, trunkHeight, 7), [position[0], position[1] + trunkHeight * 0.5, position[2]]);
  const leaves: Mesh[] = [];
  const blade = leafBlade(scale * 1.55, scale * 0.48);
  for (let index = 0; index < 7; index++) {
    const angle = (index / 7) * Math.PI * 2 + rng.range(-0.16, 0.16);
    leaves.push(placed(blade, [position[0], position[1] + trunkHeight, position[2]], [1, 1, 1], [0, angle, rng.range(-0.22, 0.12)]));
  }
  return { trunk, leaves: merge(...leaves) };
}

function cloudCluster(position: [number, number, number], scale: number, seed: number): Mesh {
  const rng = makeRng(seed);
  const lobes: Mesh[] = [];
  for (let index = 0; index < 7; index++) {
    lobes.push(placed(
      icosphere(0.75, 1),
      [
        position[0] + (index - 3) * scale * 0.48,
        position[1] + rng.range(-0.1, 0.34) * scale,
        position[2] + rng.range(-0.2, 0.2) * scale,
      ],
      [scale * rng.range(0.7, 1.15), scale * rng.range(0.55, 0.95), scale * rng.range(0.7, 1.1)],
    ));
  }
  return merge(...lobes);
}

function collectTrees(
  rng: Rng,
  count: number,
  radiusX: number,
  radiusZ: number,
  y: number,
  seed: number,
): { trunks: Mesh[]; crowns: Mesh[] } {
  const trunks: Mesh[] = [];
  const crowns: Mesh[] = [];
  for (let index = 0; index < count; index++) {
    const angle = rng.next() * Math.PI * 2;
    const radius = rng.range(0.58, 1);
    const tree = broadleafTree(
      [Math.cos(angle) * radiusX * radius, y, Math.sin(angle) * radiusZ * radius],
      rng.range(0.65, 1.2),
      seed + index,
    );
    trunks.push(tree.trunk);
    crowns.push(tree.crown);
  }
  return { trunks, crowns };
}

export function buildLowPolyVillageParts(options: LowPolySceneOptions = {}): NamedPart[] {
  const seed = options.seed ?? 1601;
  const colorVariation = options.colorVariation ?? 0.09;
  const rng = makeRng(seed);
  const parts: NamedPart[] = [];
  const bodies: Mesh[] = [];
  const roofs: Mesh[] = [];
  const roads: Mesh[] = [];
  const trunks: Mesh[] = [];
  const crowns: Mesh[] = [];

  parts.push(styledPart("village_ground", "起伏草地", displacedGround(24, 22, 12, 0.35, seed), [0.48, 0.62, 0.22], seed, colorVariation));
  roads.push(placed(box(2.1, 0.16, 22), [0.8, 0.2, 0], [1, 1, 1], [0, 0.16, 0]));
  roads.push(placed(box(1.7, 0.14, 13), [-4.2, 0.22, -1.3], [1, 1, 1], [0, -0.72, 0]));
  roads.push(placed(box(1.4, 0.13, 10), [5.1, 0.22, 2.8], [1, 1, 1], [0, 0.92, 0]));

  const houseSlots: Array<[number, number, number]> = [
    [-7, -5, 0.25], [-4.6, -2, -0.3], [-7.2, 2.2, 0.15], [-4.2, 5.3, 0.45],
    [4.4, -6, -0.2], [6.8, -2.8, 0.3], [4.5, 0.7, -0.45], [7, 4.6, 0.25],
    [-1.8, 6.9, -0.1], [2.5, 6.7, 0.35], [-1.9, -7.4, 0.2], [2.3, -7, -0.25],
  ];
  for (let index = 0; index < houseSlots.length; index++) {
    const [x, z, yaw] = houseSlots[index]!;
    const width = rng.range(1.7, 2.6);
    const height = rng.range(1.1, 1.8);
    const depth = rng.range(2.2, 3.4);
    bodies.push(placed(box(width, height, depth), [x, height * 0.5 + 0.28, z], [1, 1, 1], [0, yaw, 0]));
    roofs.push(placed(gableRoof(width * 1.15, height * 0.55, depth * 1.12), [x, height + 0.28, z], [1, 1, 1], [0, yaw, 0]));
  }

  const treeRing = collectTrees(rng, 30, 11.1, 10.2, 0.18, seed + 200);
  trunks.push(...treeRing.trunks);
  crowns.push(...treeRing.crowns);
  parts.push(styledPart("village_roads", "弯曲村路", merge(...roads), [0.34, 0.36, 0.38], seed + 1, colorVariation));
  parts.push(styledPart("village_houses", "村屋", merge(...bodies), [0.62, 0.48, 0.34], seed + 2, colorVariation));
  parts.push(styledPart("village_roofs", "蓝灰屋顶", merge(...roofs), [0.18, 0.32, 0.44], seed + 3, colorVariation));
  parts.push(styledPart("village_tree_trunks", "树干", merge(...trunks), [0.31, 0.2, 0.12], seed + 4, colorVariation));
  parts.push(styledPart("village_tree_crowns", "树冠", merge(...crowns), [0.31, 0.46, 0.18], seed + 5, colorVariation));
  return parts;
}

export function buildLowPolyCloudValleyParts(options: LowPolySceneOptions = {}): NamedPart[] {
  const seed = options.seed ?? 803;
  const colorVariation = options.colorVariation ?? 0.1;
  const rng = makeRng(seed);
  const mountains: Mesh[] = [];
  const trunks: Mesh[] = [];
  const crowns: Mesh[] = [];
  const clouds: Mesh[] = [];

  for (let index = 0; index < 11; index++) {
    const x = -14 + index * 2.8;
    const back = index % 2 === 0 ? -6.8 : -8.2;
    mountains.push(placed(
      cone(rng.range(2.3, 3.8), rng.range(4.8, 8.5), 6),
      [x, rng.range(2.2, 3.5), back],
      [1, 1, rng.range(0.75, 1.2)],
      [0, rng.range(-0.3, 0.3), 0],
    ));
  }

  for (let index = 0; index < 18; index++) {
    const side = index % 2 === 0 ? -1 : 1;
    const tree = index % 3 === 0
      ? coniferTree([side * rng.range(5.5, 11), 0, rng.range(-5, 4)], rng.range(0.8, 1.45))
      : broadleafTree([side * rng.range(5.5, 11), 0, rng.range(-5, 4)], rng.range(0.75, 1.35), seed + index);
    trunks.push(tree.trunk);
    crowns.push(tree.crown);
  }

  for (let index = 0; index < 5; index++) clouds.push(cloudCluster([-10 + index * 5, 7 + (index % 2), -4], rng.range(0.65, 1.05), seed + 100 + index));

  return [
    styledPart("valley_ground", "山谷草地", displacedGround(30, 20, 14, 0.42, seed), [0.45, 0.62, 0.22], seed, colorVariation),
    styledPart("valley_mountains", "低多边形群山", merge(...mountains), [0.36, 0.29, 0.31], seed + 1, colorVariation),
    styledPart("valley_tree_trunks", "树干", merge(...trunks), [0.38, 0.25, 0.14], seed + 2, colorVariation),
    styledPart("valley_tree_crowns", "树冠", merge(...crowns), [0.38, 0.6, 0.16], seed + 3, colorVariation),
    styledPart("valley_clouds", "低多边形云带", merge(...clouds), [0.94, 0.95, 0.92], seed + 4, colorVariation * 0.55, false, false),
  ];
}

export function buildLowPolyTropicalIslandParts(options: LowPolySceneOptions = {}): NamedPart[] {
  const seed = options.seed ?? 911;
  const colorVariation = options.colorVariation ?? 0.09;
  const rng = makeRng(seed);
  const rocks: Mesh[] = [];
  const trunks: Mesh[] = [];
  const leaves: Mesh[] = [];
  const clouds: Mesh[] = [];

  for (let index = 0; index < 14; index++) {
    const angle = rng.next() * Math.PI * 2;
    const radius = rng.range(2.2, 4.8);
    rocks.push(placed(
      icosphere(0.65, 1),
      [Math.cos(angle) * radius, rng.range(0.45, 0.85), Math.sin(angle) * radius * 0.65],
      [rng.range(0.6, 1.5), rng.range(0.65, 1.25), rng.range(0.6, 1.35)],
      [rng.range(-0.5, 0.5), rng.range(-Math.PI, Math.PI), rng.range(-0.5, 0.5)],
    ));
  }

  const palmSlots: Array<[number, number]> = [[-2.2, -0.7], [0.1, 0.5], [2.1, -0.4], [1.25, 1.25], [-0.8, 1.2]];
  for (let index = 0; index < palmSlots.length; index++) {
    const [x, z] = palmSlots[index]!;
    const palm = palmTree([x, 0.65, z], rng.range(0.8, 1.15), seed + index);
    trunks.push(palm.trunk);
    leaves.push(palm.leaves);
  }

  for (let index = 0; index < 4; index++) clouds.push(cloudCluster([-8 + index * 5.2, 5.4 + (index % 2) * 0.4, -4.8], 0.65, seed + 80 + index));

  return [
    styledPart("island_water", "浅海", plane(28, 20, 2, 2), [0.18, 0.62, 0.72], seed, colorVariation * 0.35, true),
    styledPart("island_sand", "沙洲", placed(icosphere(1, 2), [0, 0.18, 0], [6.2, 0.55, 4.15]), [0.84, 0.75, 0.47], seed + 1, colorVariation),
    styledPart("island_grass", "岛心草地", placed(icosphere(1, 2), [0, 0.62, 0], [4.25, 0.68, 2.8]), [0.35, 0.58, 0.16], seed + 2, colorVariation),
    styledPart("island_rocks", "火山岩", merge(...rocks), [0.23, 0.2, 0.18], seed + 3, colorVariation),
    styledPart("island_palm_trunks", "棕榈树干", merge(...trunks), [0.35, 0.23, 0.11], seed + 4, colorVariation),
    styledPart("island_palm_leaves", "棕榈叶", merge(...leaves), [0.27, 0.58, 0.08], seed + 5, colorVariation, true),
    styledPart("island_clouds", "远景云带", merge(...clouds), [0.96, 0.97, 0.94], seed + 6, colorVariation * 0.5, false, false),
  ];
}

export function buildLowPolyTreeKitParts(options: LowPolySceneOptions = {}): NamedPart[] {
  const seed = options.seed ?? 1316;
  const colorVariation = options.colorVariation ?? 0.1;
  const trunks: Mesh[] = [];
  const broadleafCrowns: Mesh[] = [];
  const coniferCrowns: Mesh[] = [];
  const palmLeaves: Mesh[] = [];

  for (let index = 0; index < 3; index++) {
    const tree = broadleafTree([-5 + index * 2.3, 0, 0], 0.85 + index * 0.12, seed + index);
    trunks.push(tree.trunk);
    broadleafCrowns.push(tree.crown);
  }
  for (let index = 0; index < 2; index++) {
    const tree = coniferTree([2 + index * 2.25, 0, 0], 0.9 + index * 0.15);
    trunks.push(tree.trunk);
    coniferCrowns.push(tree.crown);
  }
  const palm = palmTree([6.5, 0, 0], 1, seed + 20);
  trunks.push(palm.trunk);
  palmLeaves.push(palm.leaves);

  return [
    styledPart("tree_kit_ground", "展示台", placed(box(15, 0.2, 4), [0.5, -0.12, 0]), [0.34, 0.39, 0.27], seed, colorVariation * 0.35),
    styledPart("tree_kit_trunks", "树干组", merge(...trunks), [0.34, 0.22, 0.12], seed + 1, colorVariation),
    styledPart("tree_kit_broadleaf", "阔叶树冠", merge(...broadleafCrowns), [0.3, 0.55, 0.17], seed + 2, colorVariation),
    styledPart("tree_kit_conifer", "针叶树冠", merge(...coniferCrowns), [0.2, 0.42, 0.18], seed + 3, colorVariation),
    styledPart("tree_kit_palm", "棕榈叶", merge(...palmLeaves), [0.34, 0.65, 0.12], seed + 4, colorVariation, true),
  ];
}

export function buildLowPolySceneParts(
  kind: LowPolySceneKind,
  options: LowPolySceneOptions = {},
): NamedPart[] {
  if (kind === "village") return buildLowPolyVillageParts(options);
  if (kind === "cloud-valley") return buildLowPolyCloudValleyParts(options);
  return buildLowPolyTropicalIslandParts(options);
}
