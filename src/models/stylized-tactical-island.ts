import {
  box,
  cone,
  cylinder,
  icosphere,
  merge,
  rotateMesh,
  scaleMesh,
  styleLowPolyMesh,
  translateMesh,
  type LowPolyColor,
  type Mesh,
  type NamedPart,
  type PartSurfaceRef,
} from "../geometry/index.js";
import { vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";

export interface StylizedTacticalIslandOptions {
  seed?: number;
  islandScale?: number;
  forestDensity?: number;
  energy?: number;
  colorVariation?: number;
}

const SOURCE_URL = "https://waldobronchart.com/project/super-senso-game/";

const COLORS = {
  grass: [0.36, 0.48, 0.18],
  grassLight: [0.55, 0.58, 0.24],
  cliff: [0.25, 0.23, 0.2],
  cliffLight: [0.42, 0.36, 0.26],
  rock: [0.18, 0.19, 0.18],
  road: [0.16, 0.19, 0.2],
  roadTrim: [0.48, 0.54, 0.49],
  water: [0.08, 0.56, 0.82],
  waterLight: [0.35, 0.82, 0.94],
  trunk: [0.2, 0.16, 0.12],
  forest: [0.1, 0.24, 0.16],
  forestLight: [0.2, 0.34, 0.18],
  metal: [0.12, 0.16, 0.17],
  energy: [0.04, 0.95, 0.68],
  cloud: [0.78, 0.88, 0.88],
} satisfies Record<string, LowPolyColor>;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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

function part(
  name: string,
  label: string,
  mesh: Mesh,
  color: LowPolyColor,
  seed: number,
  colorVariation: number,
  surface?: PartSurfaceRef,
  metadata: Record<string, unknown> = {},
): NamedPart {
  const styled = styleLowPolyMesh(mesh, color, { seed, colorVariation });
  return {
    name,
    label,
    mesh: styled.mesh,
    colors: styled.colors,
    color,
    ...(surface ? { surface } : {}),
    metadata: {
      style: "stylized-low-poly",
      sourceStudy: SOURCE_URL,
      originalAssets: false,
      castShadow: true,
      ...metadata,
    },
  };
}

function buildIslandShell(seed: number, scale: number): { grass: Mesh; cliffs: Mesh; cliffHighlights: Mesh; underside: Mesh } {
  const rng = makeRng(seed);
  const topY = 4.6 * scale;
  const grass = merge(
    placed(icosphere(1, 2), [0, topY - 0.5 * scale, 0], [9.6 * scale, 1.25 * scale, 7.6 * scale]),
    placed(icosphere(1, 1), [-6.8 * scale, topY - 0.7 * scale, -1.1 * scale], [3.4 * scale, 1.05 * scale, 4.5 * scale]),
    placed(icosphere(1, 1), [6.9 * scale, topY - 0.75 * scale, 0.7 * scale], [3.1 * scale, 1.1 * scale, 4.2 * scale]),
  );
  const cliffs: Mesh[] = [];
  const cliffHighlights: Mesh[] = [];
  const underside: Mesh[] = [];
  const perimeterCount = 34;
  for (let index = 0; index < perimeterCount; index++) {
    const angle = (index / perimeterCount) * Math.PI * 2;
    const radiusX = 9.2 * scale * rng.range(0.92, 1.05);
    const radiusZ = 7.15 * scale * rng.range(0.9, 1.06);
    const rock = placed(
      icosphere(1, 1),
      [Math.cos(angle) * radiusX, topY - rng.range(1.4, 2.15) * scale, Math.sin(angle) * radiusZ],
      [rng.range(1.15, 2.0) * scale, rng.range(1.8, 3.1) * scale, rng.range(1.0, 1.7) * scale],
      [rng.range(-0.45, 0.45), angle, rng.range(-0.35, 0.35)],
    );
    (index % 5 === 0 ? cliffHighlights : cliffs).push(rock);
  }
  for (let index = 0; index < 18; index++) {
    const angle = (index / 18) * Math.PI * 2 + rng.range(-0.16, 0.16);
    const radius = rng.range(1.5, 6.8) * scale;
    underside.push(placed(
      cone(rng.range(0.65, 1.45) * scale, rng.range(3.2, 6.8) * scale, 5),
      [Math.cos(angle) * radius, topY - rng.range(4.0, 5.8) * scale, Math.sin(angle) * radius * 0.75],
      [1, 1, rng.range(0.7, 1.25)],
      [Math.PI, angle, rng.range(-0.18, 0.18)],
    ));
  }
  return { grass, cliffs: merge(...cliffs), cliffHighlights: merge(...cliffHighlights), underside: merge(...underside) };
}

function buildConifer(x: number, z: number, y: number, scale: number): { trunk: Mesh; crown: Mesh } {
  return {
    trunk: placed(cylinder(0.11, 1.35, 6), [x, y + 0.68 * scale, z], [scale, scale, scale]),
    crown: merge(
      placed(cone(0.82, 1.8, 7), [x, y + 1.45 * scale, z], [scale, scale, scale]),
      placed(cone(0.62, 1.55, 7), [x, y + 2.15 * scale, z], [scale, scale, scale]),
    ),
  };
}

function buildForests(seed: number, density: number, scale: number): { trunks: Mesh; dark: Mesh; light: Mesh } {
  const rng = makeRng(seed);
  const trunks: Mesh[] = [];
  const dark: Mesh[] = [];
  const light: Mesh[] = [];
  const count = Math.max(8, Math.round(52 * density));
  for (let index = 0; index < count; index++) {
    const angle = rng.next() * Math.PI * 2;
    const radius = rng.range(0.67, 0.94);
    const x = Math.cos(angle) * 8.6 * scale * radius;
    const z = Math.sin(angle) * 6.65 * scale * radius;
    if (z > 4.4 * scale && Math.abs(x) < 1.8 * scale) continue;
    const treeScale = rng.range(0.65, 1.18) * scale;
    const tree = buildConifer(x, z, 4.95 * scale, treeScale);
    trunks.push(tree.trunk);
    (index % 4 === 0 ? light : dark).push(tree.crown);
  }
  return { trunks: merge(...trunks), dark: merge(...dark), light: merge(...light) };
}

function buildRoadNetwork(scale: number): { roads: Mesh; trims: Mesh; pad: Mesh } {
  const y = 5.52 * scale;
  const roads = merge(
    placed(box(11.5 * scale, 0.16 * scale, 1.25 * scale), [0, y, 0]),
    placed(box(1.25 * scale, 0.16 * scale, 8.6 * scale), [0, y, 0]),
    placed(box(5.2 * scale, 0.16 * scale, 1.1 * scale), [3.1 * scale, y, 3.6 * scale]),
    placed(box(1.1 * scale, 0.16 * scale, 4.2 * scale), [5.2 * scale, y, 1.75 * scale]),
    placed(box(4.2 * scale, 0.16 * scale, 1.05 * scale), [-3.65 * scale, y, -3.65 * scale]),
  );
  const trims: Mesh[] = [];
  for (const z of [-0.72, 0.72]) trims.push(placed(box(11.8 * scale, 0.06 * scale, 0.08 * scale), [0, y + 0.12 * scale, z * scale]));
  for (const x of [-0.72, 0.72]) trims.push(placed(box(0.08 * scale, 0.06 * scale, 8.9 * scale), [x * scale, y + 0.12 * scale, 0]));
  const pad = merge(
    placed(cylinder(2.05 * scale, 0.28 * scale, 12), [3.6 * scale, y + 0.06 * scale, -1.9 * scale]),
    placed(cylinder(1.48 * scale, 0.34 * scale, 12), [3.6 * scale, y + 0.22 * scale, -1.9 * scale]),
  );
  return { roads, trims: merge(...trims), pad };
}

function buildRiverAndWaterfall(scale: number): { river: Mesh; waterfall: Mesh; foam: Mesh } {
  const y = 5.64 * scale;
  const river = merge(
    placed(box(1.55 * scale, 0.08 * scale, 4.2 * scale), [-1.5 * scale, y, -4.65 * scale], [1, 1, 1], [0, -0.12, 0]),
    placed(box(1.65 * scale, 0.08 * scale, 4.6 * scale), [-0.8 * scale, y, -0.55 * scale], [1, 1, 1], [0, 0.23, 0]),
    placed(box(1.8 * scale, 0.08 * scale, 4.9 * scale), [-1.65 * scale, y, 3.65 * scale], [1, 1, 1], [0, -0.25, 0]),
  );
  const waterfall = placed(box(1.72 * scale, 5.2 * scale, 0.12 * scale), [-2.25 * scale, 3.05 * scale, 7.15 * scale]);
  const foam = merge(
    placed(icosphere(0.5 * scale, 1), [-2.25 * scale, 5.6 * scale, 6.75 * scale], [2.0, 0.38, 1.0]),
    placed(icosphere(0.45 * scale, 1), [-2.25 * scale, 0.25 * scale, 7.25 * scale], [2.3, 0.45, 1.2]),
  );
  return { river, waterfall, foam };
}

function buildMountainGate(seed: number, scale: number): { mountains: Mesh; highlights: Mesh } {
  const rng = makeRng(seed);
  const mountains: Mesh[] = [];
  const highlights: Mesh[] = [];
  for (let index = 0; index < 9; index++) {
    const x = (-7.2 + index * 1.8) * scale;
    const height = rng.range(3.2, 6.4) * scale;
    const mesh = placed(
      icosphere(1, 1),
      [x, 4.6 * scale + height * 0.42, -6.35 * scale],
      [rng.range(0.9, 1.65) * scale, height * 0.58, rng.range(1.0, 1.65) * scale],
      [rng.range(-0.25, 0.25), rng.range(-0.35, 0.35), rng.range(-0.18, 0.18)],
    );
    (index % 3 === 0 ? highlights : mountains).push(mesh);
  }
  return { mountains: merge(...mountains), highlights: merge(...highlights) };
}

function buildEnergyStructures(scale: number, energy: number): { metal: Mesh; glow: Mesh } {
  const metal: Mesh[] = [];
  const glow: Mesh[] = [];
  const heightScale = 0.65 + energy * 0.7;
  const slots: Array<[number, number]> = [[-4.7, -2.5], [4.8, 2.55], [-4.8, 2.6], [4.75, -2.55]];
  for (const [x, z] of slots) {
    const px = x * scale;
    const pz = z * scale;
    metal.push(placed(cylinder(0.52 * scale, 0.32 * scale, 8), [px, 5.72 * scale, pz]));
    metal.push(placed(box(0.5 * scale, 1.75 * scale * heightScale, 0.5 * scale), [px, (6.6 + 0.55 * energy) * scale, pz], [1, 1, 1], [0, Math.PI / 4, 0]));
    glow.push(placed(box(0.56 * scale, 0.12 * scale, 0.56 * scale), [px, (6.35 + 0.15 * energy) * scale, pz], [1, 1, 1], [0, Math.PI / 4, 0]));
    glow.push(placed(icosphere(0.24 * scale, 1), [px, (7.5 + energy) * scale, pz], [1, 1.5 + energy, 1]));
  }
  return { metal: merge(...metal), glow: merge(...glow) };
}

function buildDebris(seed: number, scale: number): Mesh {
  const rng = makeRng(seed);
  const rocks: Mesh[] = [];
  for (let index = 0; index < 26; index++) {
    const angle = rng.next() * Math.PI * 2;
    const radius = rng.range(2.3, 8.1) * scale;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius * 0.78;
    if (Math.abs(x) < 5.9 * scale && Math.abs(z) < 4.4 * scale) continue;
    rocks.push(placed(
      icosphere(0.42 * scale, 1),
      [x, 5.6 * scale, z],
      [rng.range(0.45, 1.45), rng.range(0.4, 1.25), rng.range(0.45, 1.5)],
      [rng.range(-0.5, 0.5), rng.range(-Math.PI, Math.PI), rng.range(-0.5, 0.5)],
    ));
  }
  return merge(...rocks);
}

function buildCloudBank(seed: number, scale: number): Mesh {
  const rng = makeRng(seed);
  const clouds: Mesh[] = [];
  for (let cluster = 0; cluster < 4; cluster++) {
    const centerX = (-8 + cluster * 5.2) * scale;
    const centerZ = (cluster % 2 === 0 ? -2 : 2.5) * scale;
    for (let lobe = 0; lobe < 5; lobe++) {
      clouds.push(placed(
        icosphere(0.8 * scale, 1),
        [centerX + lobe * 0.55 * scale, rng.range(-0.6, 0.2) * scale, centerZ + rng.range(-0.4, 0.4) * scale],
        [rng.range(0.75, 1.25), rng.range(0.45, 0.75), rng.range(0.7, 1.1)],
      ));
    }
  }
  return merge(...clouds);
}

export function buildStylizedTacticalIslandParts(options: StylizedTacticalIslandOptions = {}): NamedPart[] {
  const seed = Math.round(options.seed ?? 2718);
  const scale = clamp(options.islandScale ?? 1, 0.65, 1.5);
  const forestDensity = clamp(options.forestDensity ?? 1, 0.2, 1.8);
  const energy = clamp(options.energy ?? 0.8, 0, 1);
  const colorVariation = clamp(options.colorVariation ?? 0.1, 0, 0.25);
  const shell = buildIslandShell(seed, scale);
  const forest = buildForests(seed + 100, forestDensity, scale);
  const roads = buildRoadNetwork(scale);
  const water = buildRiverAndWaterfall(scale);
  const mountain = buildMountainGate(seed + 200, scale);
  const structures = buildEnergyStructures(scale, energy);

  return [
    part("tactical_island_grass", "悬浮岛草地", shell.grass, COLORS.grass, seed, colorVariation, { type: "ground", params: { color: COLORS.grass, roughness: 0.92, seed } }),
    part("tactical_island_cliffs", "分层峭壁", shell.cliffs, COLORS.cliff, seed + 1, colorVariation, { type: "stone", params: { color: COLORS.cliff, roughness: 0.94 } }),
    part("tactical_island_cliff_highlights", "受光岩壁", shell.cliffHighlights, COLORS.cliffLight, seed + 2, colorVariation),
    part("tactical_island_underside", "悬浮岩锥", shell.underside, COLORS.rock, seed + 3, colorVariation),
    part("tactical_mountains", "北侧低模山门", mountain.mountains, COLORS.cliff, seed + 4, colorVariation),
    part("tactical_mountain_highlights", "山体受光面", mountain.highlights, COLORS.grassLight, seed + 5, colorVariation),
    part("tactical_roads", "战术道路网", roads.roads, COLORS.road, seed + 6, colorVariation * 0.3, { type: "concrete", params: { color: COLORS.road, roughness: 0.78 } }),
    part("tactical_road_trims", "道路导向边线", roads.trims, COLORS.roadTrim, seed + 7, colorVariation * 0.25),
    part("tactical_spawn_pad", "中央部署平台", roads.pad, COLORS.metal, seed + 8, colorVariation * 0.35, { type: "metal", params: { color: COLORS.metal, metallic: 0.7, roughness: 0.38 } }),
    part("tactical_river", "贯岛河道", water.river, COLORS.water, seed + 9, colorVariation * 0.2, { type: "water", params: { color: COLORS.water, waveScale: 4.5, waveStrength: 0.25, seed } }, { castShadow: false }),
    part("tactical_waterfall", "前崖瀑布", water.waterfall, COLORS.water, seed + 10, colorVariation * 0.18, { type: "water", params: { color: COLORS.water, waveScale: 5, waveStrength: 0.32, seed: seed + 1 } }, { castShadow: false, renderFx: "waterfall-sheet" }),
    part("tactical_foam", "瀑布泡沫", water.foam, COLORS.waterLight, seed + 11, colorVariation * 0.15, { type: "emissive", params: { color: COLORS.waterLight, intensity: 0.35 } }, { castShadow: false }),
    part("tactical_tree_trunks", "针叶林树干", forest.trunks, COLORS.trunk, seed + 12, colorVariation),
    part("tactical_forest_dark", "深色针叶林", forest.dark, COLORS.forest, seed + 13, colorVariation),
    part("tactical_forest_light", "受光针叶林", forest.light, COLORS.forestLight, seed + 14, colorVariation),
    part("tactical_debris", "散落岩块", buildDebris(seed + 300, scale), COLORS.rock, seed + 15, colorVariation),
    part("tactical_energy_frames", "能量塔框架", structures.metal, COLORS.metal, seed + 16, colorVariation * 0.35, { type: "metal", params: { color: COLORS.metal, metallic: 0.8, roughness: 0.3 } }),
    part("tactical_energy_glow", "青绿能量核心", structures.glow, COLORS.energy, seed + 17, colorVariation * 0.08, { type: "emissive", params: { color: COLORS.energy, intensity: 1.2 + energy * 2.2 } }, { castShadow: false }),
    part("tactical_cloud_bank", "岛底云雾", buildCloudBank(seed + 400, scale), COLORS.cloud, seed + 18, colorVariation * 0.18, { type: "cloud", params: { color: COLORS.cloud } }, { castShadow: false, cameraFitIgnore: true }),
  ];
}
