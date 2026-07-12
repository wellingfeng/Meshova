import { vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  box,
  buildDualGridLayer,
  cone,
  countDualGridCases,
  createDualGrid,
  cylinder,
  icosphere,
  merge,
  torus,
  transform,
  type DualGrid,
  type Mesh,
  type NamedPart,
  type PartSurfaceRef,
} from "../geometry/index.js";

type RGB = [number, number, number];
type TerrainKind = "ground" | "path" | "water" | "accent";
export type DualGridSceneKind = "forest-camp" | "river-mill" | "hill-shrine" | "marsh-ruins";

export interface DualGridSceneParams {
  cells: number;
  tileSize: number;
  edgeResolution: number;
  layerHeight: number;
  propDensity: number;
  seed: number;
}

export interface DualGridSceneSummary {
  readonly cells: number;
  readonly transitions: number;
  readonly props: number;
}

export interface DualGridScene {
  readonly kind: DualGridSceneKind;
  readonly parts: NamedPart[];
  readonly grid: DualGrid<TerrainKind>;
  readonly summary: DualGridSceneSummary;
}

export const DUAL_GRID_SCENE_DEFAULTS: DualGridSceneParams = {
  cells: 20,
  tileSize: 1,
  edgeResolution: 6,
  layerHeight: 0.22,
  propDensity: 0.72,
  seed: 4821,
};

interface Palette {
  soil: RGB;
  ground: RGB;
  path: RGB;
  water: RGB;
  accent: RGB;
}

const PALETTES: Record<DualGridSceneKind, Palette> = {
  "forest-camp": {
    soil: [0.25, 0.16, 0.09], ground: [0.24, 0.52, 0.2], path: [0.48, 0.32, 0.18],
    water: [0.2, 0.46, 0.56], accent: [0.42, 0.65, 0.23],
  },
  "river-mill": {
    soil: [0.31, 0.24, 0.14], ground: [0.42, 0.62, 0.25], path: [0.56, 0.48, 0.35],
    water: [0.12, 0.43, 0.62], accent: [0.32, 0.55, 0.22],
  },
  "hill-shrine": {
    soil: [0.26, 0.23, 0.2], ground: [0.31, 0.48, 0.22], path: [0.53, 0.51, 0.47],
    water: [0.18, 0.42, 0.5], accent: [0.43, 0.38, 0.31],
  },
  "marsh-ruins": {
    soil: [0.19, 0.17, 0.12], ground: [0.25, 0.38, 0.18], path: [0.38, 0.29, 0.18],
    water: [0.12, 0.29, 0.28], accent: [0.39, 0.5, 0.2],
  },
};

const WOOD: RGB = [0.34, 0.2, 0.1];
const DARK_WOOD: RGB = [0.2, 0.11, 0.06];
const STONE: RGB = [0.5, 0.49, 0.45];
const DARK_STONE: RGB = [0.34, 0.35, 0.32];
const LEAF: RGB = [0.2, 0.47, 0.17];
const RED: RGB = [0.64, 0.12, 0.08];
const WARM: RGB = [0.95, 0.46, 0.08];

export function buildDualGridScene(
  kind: DualGridSceneKind,
  params: Partial<DualGridSceneParams> = {},
): DualGridScene {
  const p = normalizeParams({ ...DUAL_GRID_SCENE_DEFAULTS, ...params });
  const grid = buildSceneGrid(kind, p);
  const palette = PALETTES[kind];
  const size = p.cells * p.tileSize;
  const parts: NamedPart[] = [
    part("terrain_foundation", "地形基底", transform(box(size, 0.2, size), {
      translate: vec3(0, -0.1, 0),
    }), palette.soil, stoneSurface(palette.soil, 0.98)),
  ];

  const layerSpecs: Array<[TerrainKind, string, string, number, RGB, PartSurfaceRef]> = [
    ["water", "dual_grid_water", "双网格水域", p.layerHeight * 0.18, palette.water,
      { type: "water", params: { body: kind === "river-mill" ? "river" : "pond", tint: palette.water, roughness: 0.14, seed: p.seed + 13 } }],
    ["path", "dual_grid_path", "双网格道路", p.layerHeight * 0.62, palette.path,
      stoneSurface(palette.path, 0.9)],
    ["ground", "dual_grid_ground", "双网格主地表", p.layerHeight, palette.ground,
      foliageSurface(palette.ground, p.seed)],
    ["accent", "dual_grid_accent", "双网格点缀地表", p.layerHeight * 1.18, palette.accent,
      foliageSurface(palette.accent, p.seed + 1)],
  ];
  for (const [target, name, label, topY, color, surface] of layerSpecs) {
    const mesh = buildDualGridLayer(grid, target, {
      tileSize: p.tileSize,
      topY,
      skirtBottomY: 0,
      subdivisions: p.edgeResolution,
      smoothCorners: true,
    });
    if (mesh.positions.length > 0) parts.push(part(name, label, mesh, color, surface));
  }

  const dressing = buildDressing(kind, p);
  parts.push(...dressing.parts);
  const transitions = (["ground", "path", "water", "accent"] as const)
    .reduce((sum, target) => sum + countDualGridCases(grid, target).transitionCells, 0);
  return {
    kind,
    parts: parts.filter((candidate) => candidate.mesh.positions.length > 0),
    grid,
    summary: { cells: p.cells * p.cells, transitions, props: dressing.props },
  };
}

export const buildDualGridForestCampParts = (params: Partial<DualGridSceneParams> = {}): NamedPart[] =>
  buildDualGridScene("forest-camp", params).parts;

export const buildDualGridRiverMillParts = (params: Partial<DualGridSceneParams> = {}): NamedPart[] =>
  buildDualGridScene("river-mill", params).parts;

export const buildDualGridHillShrineParts = (params: Partial<DualGridSceneParams> = {}): NamedPart[] =>
  buildDualGridScene("hill-shrine", params).parts;

export const buildDualGridMarshRuinsParts = (params: Partial<DualGridSceneParams> = {}): NamedPart[] =>
  buildDualGridScene("marsh-ruins", params).parts;

function buildSceneGrid(kind: DualGridSceneKind, p: DualGridSceneParams): DualGrid<TerrainKind> {
  const rows: TerrainKind[][] = [];
  const phase = (p.seed % 97) * 0.031;
  for (let z = 0; z <= p.cells; z++) {
    const row: TerrainKind[] = [];
    const nz = z / p.cells * 2 - 1;
    for (let x = 0; x <= p.cells; x++) {
      const nx = x / p.cells * 2 - 1;
      const radius = Math.hypot(nx, nz);
      let value: TerrainKind = "ground";
      if (kind === "forest-camp") {
        const clearing = Math.hypot(nx + 0.05, nz - 0.03) < 0.3;
        const trail = Math.abs(nx + 0.14 * Math.sin(nz * 4 + phase)) < 0.075 && nz > -0.92;
        if (trail) value = "path";
        else if (clearing) value = "accent";
      } else if (kind === "river-mill") {
        const riverCenter = 0.14 * Math.sin(nz * 4.2 + phase);
        if (Math.abs(nx - riverCenter) < 0.16) value = "water";
        else if (Math.abs(nz + 0.18) < 0.075) value = "path";
        else if (radius > 0.78 && Math.sin(nx * 9 - nz * 5) > 0.2) value = "accent";
      } else if (kind === "hill-shrine") {
        if (Math.abs(nx) < 0.09 && nz > -0.88 && nz < 0.42) value = "path";
        else if (Math.hypot(nx, nz - 0.48) < 0.36) value = "accent";
        else if (radius > 0.82 && Math.sin(nx * 8 + nz * 7 + phase) > 0.4) value = "path";
      } else {
        const wet = Math.sin(nx * 6.3 + phase) + Math.cos(nz * 7.1 - phase) + Math.sin((nx + nz) * 4.2) > 0.72;
        const boardwalk = Math.abs(nx - nz * 0.42) < 0.055;
        if (boardwalk) value = "path";
        else if (wet) value = "water";
        else if (Math.sin(nx * 11 - nz * 8 + phase) > 0.56) value = "accent";
      }
      row.push(value);
    }
    rows.push(row);
  }
  return createDualGrid(rows, { originX: -p.cells / 2, originZ: -p.cells / 2 });
}

function buildDressing(
  kind: DualGridSceneKind,
  p: DualGridSceneParams,
): { parts: NamedPart[]; props: number } {
  if (kind === "forest-camp") return buildForestCamp(p);
  if (kind === "river-mill") return buildRiverMill(p);
  if (kind === "hill-shrine") return buildHillShrine(p);
  return buildMarshRuins(p);
}

function buildForestCamp(p: DualGridSceneParams): { parts: NamedPart[]; props: number } {
  const scale = p.tileSize;
  const baseY = p.layerHeight;
  const rng = makeRng(p.seed + 101);
  const trunks: Mesh[] = [];
  const canopies: Mesh[] = [];
  const treeCount = Math.round((8 + p.cells * 0.7) * p.propDensity);
  for (let index = 0; index < treeCount; index++) {
    const angle = index / Math.max(1, treeCount) * Math.PI * 2 + rng.range(-0.16, 0.16);
    const radius = p.cells * scale * rng.range(0.3, 0.46);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const height = rng.range(1.7, 2.7) * scale;
    trunks.push(transform(cylinder(0.13 * scale, height, 8), { translate: vec3(x, baseY + height / 2, z) }));
    canopies.push(transform(cone(rng.range(0.65, 0.95) * scale, height * 0.9, 9), {
      translate: vec3(x, baseY + height * 0.92, z),
    }));
  }
  const tents = [-1, 1].map((side) => transform(cone(1.15 * scale, 1.6 * scale, 4), {
    rotate: vec3(0, Math.PI / 4, 0),
    translate: vec3(side * 2.1 * scale, baseY + 0.8 * scale, 0.3 * scale),
  }));
  const fireRing = transform(torus(0.46 * scale, 0.11 * scale, 18, 6), {
    translate: vec3(0, baseY + 0.1 * scale, 0),
  });
  const flame = transform(cone(0.26 * scale, 0.75 * scale, 8), {
    translate: vec3(0, baseY + 0.45 * scale, 0),
  });
  return {
    parts: [
      part("camp_tree_trunks", "营地松树树干", merge(...trunks), DARK_WOOD, barkSurface(DARK_WOOD, p.seed)),
      part("camp_tree_canopies", "营地松树树冠", merge(...canopies), LEAF, foliageSurface(LEAF, p.seed + 2)),
      part("camp_tents", "露营帐篷", merge(...tents), [0.76, 0.37, 0.12], { type: "fabric", params: { color: [0.76, 0.37, 0.12], roughness: 0.92 } }),
      part("camp_fire_ring", "篝火石圈", fireRing, STONE, stoneSurface(STONE)),
      part("camp_fire", "篝火火焰", flame, WARM, { type: "ceramic", params: { color: WARM, roughness: 0.3 } }),
    ],
    props: treeCount + tents.length + 2,
  };
}

function buildRiverMill(p: DualGridSceneParams): { parts: NamedPart[]; props: number } {
  const scale = p.tileSize;
  const baseY = p.layerHeight;
  const millX = 2.8 * scale;
  const millZ = 1.5 * scale;
  const walls = transform(box(3.2 * scale, 2.4 * scale, 3 * scale), {
    translate: vec3(millX, baseY + 1.2 * scale, millZ),
  });
  const roof = transform(cone(2.5 * scale, 1.35 * scale, 4), {
    rotate: vec3(0, Math.PI / 4, 0),
    translate: vec3(millX, baseY + 3.05 * scale, millZ),
  });
  const wheel = transform(torus(1.15 * scale, 0.13 * scale, 22, 7), {
    rotate: vec3(0, 0, Math.PI / 2),
    translate: vec3(4.48 * scale, baseY + 1.05 * scale, millZ),
  });
  const spokes: Mesh[] = [];
  for (let index = 0; index < 8; index++) {
    spokes.push(transform(box(0.1 * scale, 2.15 * scale, 0.1 * scale), {
      rotate: vec3(index * Math.PI / 4, 0, 0),
      translate: vec3(4.48 * scale, baseY + 1.05 * scale, millZ),
    }));
  }
  const bridge: Mesh[] = [];
  for (let index = -4; index <= 4; index++) {
    bridge.push(transform(box(0.62 * scale, 0.12 * scale, 2.7 * scale), {
      translate: vec3(index * 0.58 * scale, baseY + 0.27 * scale, -1.8 * scale),
    }));
  }
  return {
    parts: [
      part("mill_walls", "水磨坊墙体", walls, [0.72, 0.61, 0.42], stoneSurface([0.72, 0.61, 0.42], 0.92)),
      part("mill_roof", "水磨坊屋顶", roof, [0.46, 0.16, 0.08], { type: "wood", params: { color: [0.46, 0.16, 0.08], roughness: 0.8 } }),
      part("mill_waterwheel", "水磨坊水轮", merge(wheel, ...spokes), DARK_WOOD, { type: "wood", params: { color: DARK_WOOD, roughness: 0.86 } }),
      part("river_bridge", "河道木桥", merge(...bridge), WOOD, { type: "wood", params: { color: WOOD, roughness: 0.88 } }),
    ],
    props: bridge.length + spokes.length + 3,
  };
}

function buildHillShrine(p: DualGridSceneParams): { parts: NamedPart[]; props: number } {
  const scale = p.tileSize;
  const baseY = p.layerHeight * 1.18;
  const shrineZ = 4.7 * scale;
  const platform = transform(box(5.2 * scale, 0.42 * scale, 3.8 * scale), {
    translate: vec3(0, baseY + 0.21 * scale, shrineZ),
  });
  const pillars = [-1, 1].flatMap((x) => [-1, 1].map((z) => transform(cylinder(0.16 * scale, 2.5 * scale, 10), {
    translate: vec3(x * 1.65 * scale, baseY + 1.65 * scale, shrineZ + z * 1.05 * scale),
  })));
  const roof = transform(cone(3.1 * scale, 1.35 * scale, 4), {
    rotate: vec3(0, Math.PI / 4, 0),
    translate: vec3(0, baseY + 3.25 * scale, shrineZ),
  });
  const torii: Mesh[] = [];
  for (const z of [-5.5, -1.8, 1.4]) {
    torii.push(
      transform(cylinder(0.14 * scale, 2.6 * scale, 9), { translate: vec3(-1.05 * scale, baseY + 1.3 * scale, z * scale) }),
      transform(cylinder(0.14 * scale, 2.6 * scale, 9), { translate: vec3(1.05 * scale, baseY + 1.3 * scale, z * scale) }),
      transform(box(2.75 * scale, 0.2 * scale, 0.2 * scale), { translate: vec3(0, baseY + 2.42 * scale, z * scale) }),
      transform(box(2.35 * scale, 0.16 * scale, 0.16 * scale), { translate: vec3(0, baseY + 2.06 * scale, z * scale) }),
    );
  }
  const lanterns: Mesh[] = [];
  const lanternCount = Math.round(8 * p.propDensity);
  for (let index = 0; index < lanternCount; index++) {
    const side = index % 2 === 0 ? -1 : 1;
    const z = -4.8 + Math.floor(index / 2) * 2.2;
    lanterns.push(merge(
      transform(cylinder(0.11 * scale, 0.8 * scale, 8), { translate: vec3(side * 1.45 * scale, baseY + 0.4 * scale, z * scale) }),
      transform(box(0.42 * scale, 0.42 * scale, 0.42 * scale), { translate: vec3(side * 1.45 * scale, baseY + 0.94 * scale, z * scale) }),
    ));
  }
  return {
    parts: [
      part("shrine_platform", "神社石台", platform, STONE, stoneSurface(STONE)),
      part("shrine_pillars", "神社立柱", merge(...pillars), RED, { type: "wood", params: { color: RED, roughness: 0.68 } }),
      part("shrine_roof", "神社屋顶", roof, [0.17, 0.16, 0.14], { type: "ceramic", params: { color: [0.17, 0.16, 0.14], roughness: 0.55 } }),
      part("shrine_torii", "参道鸟居", merge(...torii), RED, { type: "wood", params: { color: RED, roughness: 0.65 } }),
      part("shrine_lanterns", "参道石灯笼", merge(...lanterns), DARK_STONE, stoneSurface(DARK_STONE)),
    ],
    props: pillars.length + torii.length / 4 + lanterns.length + 2,
  };
}

function buildMarshRuins(p: DualGridSceneParams): { parts: NamedPart[]; props: number } {
  const scale = p.tileSize;
  const baseY = p.layerHeight;
  const ruins: Mesh[] = [];
  const columns: Mesh[] = [];
  const rng = makeRng(p.seed + 707);
  const ruinCount = Math.max(3, Math.round(7 * p.propDensity));
  for (let index = 0; index < ruinCount; index++) {
    const angle = index / ruinCount * Math.PI * 2;
    const radius = rng.range(2.2, 5.4) * scale;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const height = rng.range(1.2, 3.1) * scale;
    columns.push(transform(cylinder(0.28 * scale, height, 8), {
      translate: vec3(x, baseY + height / 2, z),
    }));
  }
  ruins.push(
    transform(box(0.55 * scale, 2.5 * scale, 0.7 * scale), { translate: vec3(-2 * scale, baseY + 1.25 * scale, 0) }),
    transform(box(0.55 * scale, 1.8 * scale, 0.7 * scale), { translate: vec3(2 * scale, baseY + 0.9 * scale, 0) }),
    transform(box(4.55 * scale, 0.55 * scale, 0.7 * scale), { translate: vec3(0, baseY + 2.35 * scale, 0) }),
    transform(box(4.2 * scale, 0.75 * scale, 0.55 * scale), { rotate: vec3(0, 0.35, 0), translate: vec3(-2.2 * scale, baseY + 0.38 * scale, 3.2 * scale) }),
  );
  const reeds: Mesh[] = [];
  const reedCount = Math.round((10 + p.cells) * p.propDensity);
  for (let index = 0; index < reedCount; index++) {
    const x = rng.range(-p.cells * 0.43, p.cells * 0.43) * scale;
    const z = rng.range(-p.cells * 0.43, p.cells * 0.43) * scale;
    const height = rng.range(0.55, 1.05) * scale;
    reeds.push(transform(cone(0.07 * scale, height, 5), { translate: vec3(x, baseY * 0.2 + height / 2, z) }));
  }
  return {
    parts: [
      part("ruin_columns", "沼泽残柱", merge(...columns), STONE, stoneSurface(STONE, 0.96)),
      part("ruin_arch", "沼泽残墙", merge(...ruins), DARK_STONE, stoneSurface(DARK_STONE, 0.98)),
      part("marsh_reeds", "沼泽芦苇", merge(...reeds), [0.42, 0.53, 0.17], foliageSurface([0.42, 0.53, 0.17], p.seed + 8)),
    ],
    props: ruinCount + ruins.length + reedCount,
  };
}

function part(name: string, label: string, mesh: Mesh, color: RGB, surface: PartSurfaceRef): NamedPart {
  return { name, label, mesh, color, surface };
}

function stoneSurface(color: RGB, roughness = 0.9): PartSurfaceRef {
  return { type: "stone", params: { color, roughness } };
}

function foliageSurface(color: RGB, seed: number): PartSurfaceRef {
  return { type: "stylizedFoliage", params: { color, bands: 3, seed } };
}

function barkSurface(color: RGB, seed: number): PartSurfaceRef {
  return { type: "bark", params: { color, scale: 8, seed } };
}

function normalizeParams(p: DualGridSceneParams): DualGridSceneParams {
  return {
    cells: clampInt(p.cells, 12, 32),
    tileSize: clamp(p.tileSize, 0.5, 2),
    edgeResolution: clampInt(p.edgeResolution, 1, 12),
    layerHeight: clamp(p.layerHeight, 0.06, 0.6),
    propDensity: clamp(p.propDensity, 0.2, 1),
    seed: Math.round(p.seed),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
