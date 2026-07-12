/**
 * HoudiniHowtos-inspired gallery models.
 *
 * These are not Houdini node translations. They are Meshova-native versions of
 * the useful patterns: scalar fields, curve graphs, weave masks, panel kits,
 * growth curves, BSP layout and Voronoi surface relief.
 */
import {
  field2DStats,
  field3DToScalarGrid,
  generateField3D,
  grayScottField2D,
  normalizeField2D,
  sampleField2DUV,
  weaveField2D,
  type Field2D,
} from "../field/index.js";
import { TAU, clamp, lerp, smoothstep } from "../math/scalar.js";
import {
  add,
  cross,
  lerpVec3,
  normalize,
  scale,
  sub,
  type Vec3,
} from "../math/vec3.js";
import { vec3 } from "../math/vec3.js";
import { makeRng } from "../random/index.js";
import {
  bevelEdges,
  box,
  computeNormals,
  curveGraphPathToCurve,
  curveGraphShortestPath,
  cylinder,
  makeCurveGraph,
  makeMesh,
  merge,
  polygonizeField,
  polyline,
  recomputeNormals,
  resampleCurve,
  solidify,
  smoothCurve,
  sphere,
  sweep,
  torus,
  transform,
  type CurveGraph,
  type CurveGraphEdge,
  type CurveGraphNode,
  type Mesh,
  type NamedPart,
  type PartSurfaceRef,
} from "../geometry/index.js";

type RGB = [number, number, number];

export type HoudiniHowtosCategory =
  | "field"
  | "curveGraph"
  | "weave"
  | "panelRemesh"
  | "growth"
  | "dungeon"
  | "vase";

export interface ReactionReliefParams {
  readonly resolution: number;
  readonly size: number;
  readonly height: number;
  readonly base: number;
  readonly iterations: number;
  readonly seed: number;
}

export interface PipeNetworkParams {
  readonly cols: number;
  readonly rows: number;
  readonly spacing: number;
  readonly radius: number;
  readonly jitter: number;
  readonly seed: number;
}

export interface WovenPotParams {
  readonly segments: number;
  readonly rows: number;
  readonly height: number;
  readonly radiusBottom: number;
  readonly radiusTop: number;
  readonly bulge: number;
  readonly relief: number;
  readonly weaveColumns: number;
  readonly weaveRows: number;
  readonly seed: number;
}

export interface SciFiPanelParams {
  readonly width: number;
  readonly depth: number;
  readonly thickness: number;
  readonly cols: number;
  readonly rows: number;
  readonly greebles: number;
  readonly seed: number;
}

export interface GrowthUrchinParams {
  readonly spines: number;
  readonly coreRadius: number;
  readonly spineLength: number;
  readonly spineRadius: number;
  readonly segments: number;
  readonly seed: number;
}

export interface BspDungeonParams {
  readonly width: number;
  readonly depth: number;
  readonly iterations: number;
  readonly roomFill: number;
  readonly corridorWidth: number;
  readonly wallHeight: number;
  readonly floorThickness: number;
  readonly seed: number;
}

export interface VoronoiVaseParams {
  readonly segments: number;
  readonly rows: number;
  readonly height: number;
  readonly radius: number;
  readonly neck: number;
  readonly bulge: number;
  readonly twist: number;
  readonly cells: number;
  readonly edgeWidth: number;
  readonly relief: number;
  readonly cellInset: number;
  readonly seed: number;
}

export interface HoudiniHowtosShowcaseParams {
  readonly seed: number;
  readonly scale: number;
}

export interface HoudiniHowtosSummary {
  readonly partCount: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly categories: Record<HoudiniHowtosCategory, number>;
}

export const REACTION_RELIEF_DEFAULTS: ReactionReliefParams = {
  resolution: 48,
  size: 3.0,
  height: 0.34,
  base: 0.08,
  iterations: 48,
  seed: 12,
};

export const PIPE_NETWORK_DEFAULTS: PipeNetworkParams = {
  cols: 4,
  rows: 3,
  spacing: 1.25,
  radius: 0.055,
  jitter: 0.18,
  seed: 21,
};

export const WOVEN_POT_DEFAULTS: WovenPotParams = {
  segments: 56,
  rows: 32,
  height: 2.4,
  radiusBottom: 0.62,
  radiusTop: 0.92,
  bulge: 0.18,
  relief: 0.045,
  weaveColumns: 18,
  weaveRows: 10,
  seed: 33,
};

export const SCI_FI_PANEL_DEFAULTS: SciFiPanelParams = {
  width: 3.4,
  depth: 2.2,
  thickness: 0.16,
  cols: 5,
  rows: 4,
  greebles: 18,
  seed: 44,
};

export const GROWTH_URCHIN_DEFAULTS: GrowthUrchinParams = {
  spines: 72,
  coreRadius: 0.48,
  spineLength: 1.28,
  spineRadius: 0.026,
  segments: 9,
  seed: 55,
};

export const BSP_DUNGEON_DEFAULTS: BspDungeonParams = {
  width: 13.5,
  depth: 9.5,
  iterations: 4,
  roomFill: 0.7,
  corridorWidth: 0.78,
  wallHeight: 0.72,
  floorThickness: 0.08,
  seed: 64,
};

export const VORONOI_VASE_DEFAULTS: VoronoiVaseParams = {
  segments: 72,
  rows: 44,
  height: 2.7,
  radius: 0.82,
  neck: 0.56,
  bulge: 0.3,
  twist: 0.16,
  cells: 34,
  edgeWidth: 0.045,
  relief: 0.055,
  cellInset: 0.38,
  seed: 72,
};

export const HOUDINI_HOWTOS_SHOWCASE_DEFAULTS: HoudiniHowtosShowcaseParams = {
  seed: 100,
  scale: 1,
};

const FIELD_BLUE: RGB = [0.16, 0.45, 0.8];
const FIELD_CREAM: RGB = [0.86, 0.78, 0.56];
const PIPE_METAL: RGB = [0.52, 0.56, 0.58];
const PIPE_ACCENT: RGB = [0.95, 0.46, 0.16];
const WICKER: RGB = [0.72, 0.52, 0.31];
const WICKER_DARK: RGB = [0.34, 0.2, 0.1];
const PANEL_BASE: RGB = [0.12, 0.14, 0.16];
const PANEL_PLATE: RGB = [0.42, 0.46, 0.48];
const PANEL_DARK: RGB = [0.045, 0.05, 0.055];
const GROWTH_CORE: RGB = [0.56, 0.34, 0.44];
const GROWTH_SPINE: RGB = [0.93, 0.71, 0.52];
const DUNGEON_FLOOR: RGB = [0.34, 0.32, 0.29];
const DUNGEON_WALL: RGB = [0.2, 0.21, 0.22];
const DUNGEON_ACCENT: RGB = [0.85, 0.48, 0.18];
const VASE_BODY: RGB = [0.33, 0.48, 0.55];
const VASE_RIB: RGB = [0.88, 0.78, 0.56];
const VASE_SHADOW: RGB = [0.18, 0.25, 0.29];

function resolveReactionRelief(params: Partial<ReactionReliefParams>): ReactionReliefParams {
  const p = { ...REACTION_RELIEF_DEFAULTS, ...params };
  return {
    resolution: Math.max(12, Math.round(p.resolution)),
    size: Math.max(0.5, p.size),
    height: Math.max(0.01, p.height),
    base: Math.max(0, p.base),
    iterations: Math.max(1, Math.round(p.iterations)),
    seed: Math.round(p.seed) >>> 0,
  };
}

function resolvePipeNetwork(params: Partial<PipeNetworkParams>): PipeNetworkParams {
  const p = { ...PIPE_NETWORK_DEFAULTS, ...params };
  return {
    cols: Math.max(2, Math.round(p.cols)),
    rows: Math.max(2, Math.round(p.rows)),
    spacing: Math.max(0.25, p.spacing),
    radius: Math.max(0.01, p.radius),
    jitter: Math.max(0, p.jitter),
    seed: Math.round(p.seed) >>> 0,
  };
}

function resolveWovenPot(params: Partial<WovenPotParams>): WovenPotParams {
  const p = { ...WOVEN_POT_DEFAULTS, ...params };
  return {
    segments: Math.max(12, Math.round(p.segments)),
    rows: Math.max(8, Math.round(p.rows)),
    height: Math.max(0.4, p.height),
    radiusBottom: Math.max(0.1, p.radiusBottom),
    radiusTop: Math.max(0.1, p.radiusTop),
    bulge: Math.max(0, p.bulge),
    relief: Math.max(0, p.relief),
    weaveColumns: Math.max(2, Math.round(p.weaveColumns)),
    weaveRows: Math.max(2, Math.round(p.weaveRows)),
    seed: Math.round(p.seed) >>> 0,
  };
}

function resolveSciFiPanel(params: Partial<SciFiPanelParams>): SciFiPanelParams {
  const p = { ...SCI_FI_PANEL_DEFAULTS, ...params };
  return {
    width: Math.max(0.8, p.width),
    depth: Math.max(0.6, p.depth),
    thickness: Math.max(0.04, p.thickness),
    cols: Math.max(1, Math.round(p.cols)),
    rows: Math.max(1, Math.round(p.rows)),
    greebles: Math.max(0, Math.round(p.greebles)),
    seed: Math.round(p.seed) >>> 0,
  };
}

function resolveGrowthUrchin(params: Partial<GrowthUrchinParams>): GrowthUrchinParams {
  const p = { ...GROWTH_URCHIN_DEFAULTS, ...params };
  return {
    spines: Math.max(6, Math.round(p.spines)),
    coreRadius: Math.max(0.08, p.coreRadius),
    spineLength: Math.max(0.1, p.spineLength),
    spineRadius: Math.max(0.004, p.spineRadius),
    segments: Math.max(3, Math.round(p.segments)),
    seed: Math.round(p.seed) >>> 0,
  };
}

function resolveBspDungeon(params: Partial<BspDungeonParams>): BspDungeonParams {
  const p = { ...BSP_DUNGEON_DEFAULTS, ...params };
  return {
    width: Math.max(4, p.width),
    depth: Math.max(4, p.depth),
    iterations: clamp(Math.round(p.iterations), 1, 7),
    roomFill: clamp(p.roomFill, 0.35, 0.94),
    corridorWidth: Math.max(0.18, p.corridorWidth),
    wallHeight: Math.max(0.12, p.wallHeight),
    floorThickness: Math.max(0.02, p.floorThickness),
    seed: Math.round(p.seed) >>> 0,
  };
}

function resolveVoronoiVase(params: Partial<VoronoiVaseParams>): VoronoiVaseParams {
  const p = { ...VORONOI_VASE_DEFAULTS, ...params };
  return {
    segments: Math.max(12, Math.round(p.segments)),
    rows: Math.max(8, Math.round(p.rows)),
    height: Math.max(0.6, p.height),
    radius: Math.max(0.16, p.radius),
    neck: clamp(p.neck, 0.22, 1.15),
    bulge: clamp(p.bulge, 0, 0.75),
    twist: clamp(p.twist, -1, 1),
    cells: Math.max(3, Math.round(p.cells)),
    edgeWidth: clamp(p.edgeWidth, 0.008, 0.18),
    relief: Math.max(0, p.relief),
    cellInset: clamp(p.cellInset, 0, 1),
    seed: Math.round(p.seed) >>> 0,
  };
}

function surf(
  category: HoudiniHowtosCategory,
  name: string,
  label: string,
  mesh: Mesh,
  color: RGB,
  type: string,
  params: Record<string, unknown> = {},
): NamedPart {
  const surface: PartSurfaceRef = { type, params: { color, ...params } };
  return {
    name,
    label,
    mesh: recomputeNormals(mesh),
    color,
    surface,
    metadata: {
      source: "HoudiniHowtos-inspired Meshova rewrite",
      category,
    },
  };
}

export function buildReactionDiffusionReliefParts(
  params: Partial<ReactionReliefParams> = {},
): NamedPart[] {
  const p = resolveReactionRelief(params);
  const raw = grayScottField2D(p.resolution, p.resolution, {
    iterations: p.iterations,
    seed: p.seed,
    spots: 8,
    spotRadiusRange: [p.resolution * 0.025, p.resolution * 0.075],
    feed: 0.034,
    kill: 0.061,
  });
  const field = normalizeField2D(raw);
  const relief = fieldToReliefMesh(field, p.size, p.size, p.height, p.base);
  const colors = relief.positions.map((pos) => {
    const t = clamp((pos.y - p.base) / Math.max(1e-6, p.height), 0, 1);
    return mixColor(FIELD_CREAM, FIELD_BLUE, smoothstep(0.12, 0.95, t));
  }).flat();

  return [
    {
      ...surf("field", "reaction_diffusion_relief", "反应扩散浮雕板", relief, FIELD_BLUE, "ceramic", {
        roughness: 0.72,
        seed: p.seed,
      }),
      colors,
      metadata: {
        source: "HoudiniHowtos-inspired Meshova rewrite",
        category: "field",
        field: field2DStats(field),
      },
    },
  ];
}

export function buildField3DBlobParts(seed = 0): NamedPart[] {
  const field = generateField3D(22, 22, 22, (u, v, w) => {
    const x = (u - 0.5) * 2;
    const y = (v - 0.5) * 2;
    const z = (w - 0.5) * 2;
    const sphereA = Math.hypot(x + 0.25, y * 1.08, z) - 0.58;
    const sphereB = Math.hypot(x - 0.35, y + 0.12, z * 1.15) - 0.46;
    const ripple = Math.sin((x * 2.1 + z * 1.7 + seed * 0.01) * TAU) * 0.045;
    return Math.min(sphereA, sphereB) + ripple;
  });
  const mesh = transform(
    polygonizeField(field3DToScalarGrid(field, { origin: vec3(-1.1, -1.1, -1.1), cell: 0.1 })),
    { translate: vec3(0, 1.1, 0) },
  );
  return [
    surf("field", "field3d_blob", "三维标量场等值面", mesh, [0.42, 0.65, 0.8], "ceramic", {
      roughness: 0.62,
      seed,
    }),
  ];
}

export function buildPipeNetworkParts(params: Partial<PipeNetworkParams> = {}): NamedPart[] {
  const p = resolvePipeNetwork(params);
  const graph = buildPipeGraph(p);
  const pipeMeshes: Mesh[] = [];
  for (const edge of graph.edges) {
    const curve = curveGraphPathToCurve(graph, [edge.from, edge.to]);
    const smooth = resampleCurve(smoothCurve(curve, 4), { count: 20 });
    pipeMeshes.push(sweep(smooth, { radius: p.radius, sides: 10, caps: true }));
  }

  const route = curveGraphShortestPath(graph, "n0_0", `n${p.cols - 1}_${p.rows - 1}`);
  const routeCurve = route.length > 1
    ? resampleCurve(smoothCurve(curveGraphPathToCurve(graph, route), 4), { count: 48 })
    : polyline([]);
  const routeMesh = routeCurve.points.length > 1
    ? sweep(routeCurve, { radius: p.radius * 1.55, sides: 12, caps: false })
    : merge();

  const nodeMeshes = graph.nodes.map((n) =>
    transform(sphere(p.radius * 2.15, 14, 10), { translate: n.position }),
  );

  return [
    surf("curveGraph", "pipe_network", "曲线图管网", merge(...pipeMeshes), PIPE_METAL, "metal", {
      roughness: 0.34,
      metallic: 1,
      seed: p.seed,
    }),
    surf("curveGraph", "pipe_junctions", "管网节点", merge(...nodeMeshes), PANEL_DARK, "metal", {
      roughness: 0.4,
      metallic: 1,
      seed: p.seed + 1,
    }),
    surf("curveGraph", "shortest_route", "最短路径高亮管", routeMesh, PIPE_ACCENT, "emissive", {
      intensity: 0.9,
      seed: p.seed + 2,
    }),
  ];
}

export function buildWovenPotParts(params: Partial<WovenPotParams> = {}): NamedPart[] {
  const p = resolveWovenPot(params);
  const field = weaveField2D(p.segments, p.rows, {
    columns: p.weaveColumns,
    rows: p.weaveRows,
    strandWidth: 0.32,
    softness: 0.045,
    underScale: 0.56,
    jitter: 0.14,
    seed: p.seed,
  });
  const body = wovenPotBodyMesh(field, p);
  const rimRadius = p.radiusTop + p.relief * 0.6;
  const footRadius = p.radiusBottom * 0.92;
  const rim = transform(torus(rimRadius, 0.045, 48, 8), {
    translate: vec3(0, p.height, 0),
  });
  const foot = transform(torus(footRadius, 0.04, 44, 8), {
    translate: vec3(0, 0.04, 0),
  });
  const bodyPart = surf("weave", "woven_body", "编织罐身", body, WICKER, "wood", {
    roughness: 0.88,
    seed: p.seed,
  });

  return [
    bodyPart,
    surf("weave", "woven_rim_and_foot", "罐口和底圈", merge(rim, foot), WICKER_DARK, "wood", {
      roughness: 0.84,
      seed: p.seed + 1,
    }),
  ];
}

export function buildSciFiPanelParts(params: Partial<SciFiPanelParams> = {}): NamedPart[] {
  const p = resolveSciFiPanel(params);
  const rng = makeRng(p.seed);
  const base = transform(
    bevelEdges(box(p.width, p.thickness, p.depth), { width: p.thickness * 0.22, segments: 1 }),
    { translate: vec3(0, p.thickness * 0.5, 0) },
  );

  const plates: Mesh[] = [];
  const vents: Mesh[] = [];
  const bolts: Mesh[] = [];
  const cellW = p.width / p.cols;
  const cellD = p.depth / p.rows;
  for (let z = 0; z < p.rows; z++) {
    for (let x = 0; x < p.cols; x++) {
      const u = (x + 0.5) / p.cols;
      const v = (z + 0.5) / p.rows;
      const cx = (u - 0.5) * p.width;
      const cz = (v - 0.5) * p.depth;
      const h = rng.range(0.035, 0.13);
      const w = cellW * rng.range(0.58, 0.86);
      const d = cellD * rng.range(0.54, 0.84);
      plates.push(transform(
        bevelEdges(box(w, h, d), { width: Math.min(w, d, h) * 0.12, segments: 1 }),
        {
          rotate: vec3(0, rng.range(-0.08, 0.08), 0),
          translate: vec3(cx, p.thickness + 0.006 + h * 0.5, cz),
        },
      ));
      if (((x + z) & 1) === 0) {
        const slotCount = 2 + ((x + z) % 3);
        for (let s = 0; s < slotCount; s++) {
          vents.push(transform(box(w * 0.52, 0.024, d * 0.08), {
            translate: vec3(cx, p.thickness + h + 0.022, cz + (s - (slotCount - 1) / 2) * d * 0.18),
          }));
        }
      }
    }
  }

  for (let i = 0; i < p.greebles; i++) {
    const x = rng.range(-p.width * 0.46, p.width * 0.46);
    const z = rng.range(-p.depth * 0.46, p.depth * 0.46);
    const boltHeight = 0.035;
    bolts.push(transform(cylinder(rng.range(0.025, 0.045), boltHeight, 10, true), {
      translate: vec3(x, p.thickness + 0.145 + boltHeight / 2, z),
    }));
  }

  const conduitRadius = p.thickness * 0.16;
  const conduit = transform(cylinder(p.thickness * 0.16, p.width * 0.86, 16, true), {
    rotate: vec3(0, 0, Math.PI / 2),
    translate: vec3(0, p.thickness + 0.145 + conduitRadius, -p.depth * 0.43),
  });

  return [
    surf("panelRemesh", "panel_base", "硬表面底板", base, PANEL_BASE, "metal", {
      roughness: 0.5,
      metallic: 0.7,
      seed: p.seed,
    }),
    surf("panelRemesh", "panel_plates", "装甲面板", merge(...plates), PANEL_PLATE, "metal", {
      roughness: 0.38,
      metallic: 0.9,
      seed: p.seed + 1,
    }),
    surf("panelRemesh", "panel_vents_bolts", "散热槽和螺栓", merge(conduit, ...vents, ...bolts), PANEL_DARK, "metal", {
      roughness: 0.32,
      metallic: 1,
      seed: p.seed + 2,
    }),
  ];
}

export function buildGrowthUrchinParts(params: Partial<GrowthUrchinParams> = {}): NamedPart[] {
  const p = resolveGrowthUrchin(params);
  const rng = makeRng(p.seed);
  const spines: Mesh[] = [];
  for (let i = 0; i < p.spines; i++) {
    const dir = fibonacciDirection(i, p.spines);
    const root = scale(dir, p.coreRadius * 0.74);
    const curlAxis = normalize(cross(dir, Math.abs(dir.y) < 0.85 ? vec3(0, 1, 0) : vec3(1, 0, 0)));
    const bend = rng.range(-0.18, 0.18);
    const phase = rng.next() * 0.2;
    const pts: Vec3[] = [];
    for (let s = 0; s <= p.segments; s++) {
      const t = s / p.segments;
      const wave = Math.sin((t * 1.4 + phase) * TAU) * bend * t;
      const radial = scale(dir, p.spineLength * t);
      pts.push(add(root, add(radial, scale(curlAxis, wave))));
    }
    const curve = resampleCurve(smoothCurve(polyline(pts), 3), { count: p.segments * 3 + 1 });
    spines.push(sweep(curve, {
      radius: p.spineRadius,
      sides: 6,
      radiusAt: (t) => Math.max(0.08, 1 - t * 0.92),
      caps: true,
    }));
  }

  const core = computeNormals(sphere(p.coreRadius, 28, 18), 55);
  const base = transform(cylinder(p.coreRadius * 0.86, 0.08, 28, true), {
    translate: vec3(0, -p.coreRadius * 0.74, 0),
  });

  return [
    surf("growth", "growth_core", "生长核心", merge(core, base), GROWTH_CORE, "ceramic", {
      roughness: 0.68,
      seed: p.seed,
    }),
    surf("growth", "growth_spines", "放射生长刺", merge(...spines), GROWTH_SPINE, "ceramic", {
      roughness: 0.54,
      seed: p.seed + 1,
    }),
  ];
}

export function buildBspDungeonParts(params: Partial<BspDungeonParams> = {}): NamedPart[] {
  const p = resolveBspDungeon(params);
  const rng = makeRng(p.seed);
  const leaves = splitBspRect({ x: -p.width * 0.5, z: -p.depth * 0.5, w: p.width, d: p.depth }, p.iterations, rng);
  const rooms = leaves.map((leaf) => roomFromLeaf(leaf, p, rng));
  const corridors = connectDungeonRooms(rooms, p, rng);

  const floorMeshes: Mesh[] = [
    ...rooms.map((room) => dungeonBox(room.x + room.w * 0.5, p.floorThickness * 0.5, room.z + room.d * 0.5, room.w, p.floorThickness, room.d)),
    ...corridors.map((corridor) =>
      dungeonBox(corridor.x + corridor.w * 0.5, p.floorThickness * 0.56, corridor.z + corridor.d * 0.5, corridor.w, p.floorThickness * 1.12, corridor.d),
    ),
  ];
  const wallMeshes = rooms.flatMap((room) => dungeonWallsForRoom(room, p));
  const markerMeshes: Mesh[] = [];
  if (rooms.length > 0) {
    markerMeshes.push(
      transform(cylinder(p.corridorWidth * 0.26, p.floorThickness * 1.7, 18, true), {
        translate: vec3(rooms[0]!.cx, p.floorThickness * 1.45, rooms[0]!.cz),
      }),
    );
    markerMeshes.push(
      transform(cylinder(p.corridorWidth * 0.26, p.floorThickness * 1.7, 18, true), {
        translate: vec3(rooms[rooms.length - 1]!.cx, p.floorThickness * 1.45, rooms[rooms.length - 1]!.cz),
      }),
    );
  }

  const floors = surf("dungeon", "dungeon_floors", "BSP 房间与走廊地面", merge(...floorMeshes), DUNGEON_FLOOR, "stone", {
    roughness: 0.9,
    seed: p.seed,
  });
  floors.metadata = {
    ...floors.metadata,
    rooms: rooms.length,
    corridors: corridors.length,
    method: "binary space partition rooms + L-corridor routing",
  };

  const walls = surf("dungeon", "dungeon_walls", "BSP 房间墙体", merge(...wallMeshes), DUNGEON_WALL, "stone", {
    roughness: 0.86,
    seed: p.seed + 1,
  });
  walls.metadata = { ...walls.metadata, rooms: rooms.length };

  const markers = surf("dungeon", "dungeon_entries", "入口和出口标记", merge(...markerMeshes), DUNGEON_ACCENT, "emissive", {
    intensity: 0.45,
    seed: p.seed + 2,
  });
  return [floors, walls, markers];
}

export function buildVoronoiVaseParts(params: Partial<VoronoiVaseParams> = {}): NamedPart[] {
  const p = resolveVoronoiVase(params);
  const sites = voronoiVaseSites(p);
  const body = voronoiVaseBodyMesh(p, sites);
  const rimRadius = vaseProfileRadius(1, p) + p.relief * 0.55;
  const footRadius = vaseProfileRadius(0, p) + p.relief * 0.35;
  const ringTube = Math.max(0.025, p.radius * 0.035 + p.relief * 0.35);
  const rim = transform(torus(rimRadius, ringTube, 64, 8), { translate: vec3(0, p.height, 0) });
  const foot = transform(torus(footRadius, ringTube * 0.82, 56, 8), { translate: vec3(0, ringTube * 0.55, 0) });

  const bodyPart = surf("vase", "voronoi_vase_body", "Voronoi 浮雕花瓶", body.mesh, VASE_BODY, "ceramic", {
    roughness: 0.58,
    seed: p.seed,
  });
  bodyPart.colors = body.colors;
  bodyPart.metadata = {
    ...bodyPart.metadata,
    cells: sites.length,
    wallThickness: Math.max(0.025, p.radius * 0.055),
    method: "wrapped UV Voronoi edge mask + radial relief",
  };

  return [
    bodyPart,
    surf("vase", "voronoi_vase_rim_foot", "花瓶口沿和底圈", merge(rim, foot), VASE_RIB, "ceramic", {
      roughness: 0.5,
      seed: p.seed + 1,
    }),
  ];
}

export function buildHoudiniHowtosShowcaseParts(
  params: Partial<HoudiniHowtosShowcaseParams> = {},
): NamedPart[] {
  const p = { ...HOUDINI_HOWTOS_SHOWCASE_DEFAULTS, ...params };
  const seed = Math.round(p.seed) >>> 0;
  const s = Math.max(0.1, p.scale);
  const groups: Array<{ prefix: string; offset: Vec3; parts: NamedPart[] }> = [
    {
      prefix: "rd",
      offset: vec3(-9.8 * s, 0, 0),
      parts: [
        ...buildReactionDiffusionReliefParts({ seed: seed + 1 }),
        ...buildField3DBlobParts(seed + 2),
      ],
    },
    {
      prefix: "graph",
      offset: vec3(-6.4 * s, 0, 0),
      parts: buildPipeNetworkParts({ seed: seed + 10 }),
    },
    {
      prefix: "dungeon",
      offset: vec3(-3.3 * s, 0, 0),
      parts: buildBspDungeonParts({ seed: seed + 15, width: 4.6, depth: 3.8, iterations: 3, corridorWidth: 0.32 }),
    },
    {
      prefix: "weave",
      offset: vec3(0.4 * s, 0, 0),
      parts: buildWovenPotParts({ seed: seed + 20 }),
    },
    {
      prefix: "vase",
      offset: vec3(3.2 * s, 0, 0),
      parts: buildVoronoiVaseParts({ seed: seed + 25, height: 2.25, radius: 0.62, segments: 48, rows: 30 }),
    },
    {
      prefix: "panel",
      offset: vec3(6.2 * s, 0, 0),
      parts: buildSciFiPanelParts({ seed: seed + 30 }),
    },
    {
      prefix: "growth",
      offset: vec3(9.5 * s, 1.1 * s, 0),
      parts: buildGrowthUrchinParts({ seed: seed + 40 }),
    },
  ];

  const out: NamedPart[] = [];
  for (const group of groups) {
    for (const part of group.parts) {
      out.push({
        ...part,
        name: `${group.prefix}_${part.name}`,
        mesh: transform(part.mesh, { scale: s, translate: group.offset }),
      });
    }
  }
  return out;
}

export function summarizeHoudiniHowtos(parts: readonly NamedPart[]): HoudiniHowtosSummary {
  const categories: Record<HoudiniHowtosCategory, number> = {
    field: 0,
    curveGraph: 0,
    weave: 0,
    panelRemesh: 0,
    growth: 0,
    dungeon: 0,
    vase: 0,
  };
  let vertexCount = 0;
  let triangleCount = 0;
  for (const part of parts) {
    vertexCount += part.mesh.positions.length;
    triangleCount += part.mesh.indices.length / 3;
    const category = part.metadata?.category;
    if (isHoudiniCategory(category)) categories[category]++;
  }
  return { partCount: parts.length, vertexCount, triangleCount, categories };
}

function fieldToReliefMesh(field: Field2D, width: number, depth: number, height: number, base: number): Mesh {
  const cols = field.width;
  const rows = field.height;
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: { x: number; y: number }[] = [];
  const indices: number[] = [];
  const topIndex = (x: number, y: number) => y * (cols + 1) + x;
  for (let y = 0; y <= rows; y++) {
    const v = y / rows;
    for (let x = 0; x <= cols; x++) {
      const u = x / cols;
      const h = base + sampleField2DUV(field, u, v) * height;
      positions.push(vec3((u - 0.5) * width, h, (v - 0.5) * depth));
      normals.push(vec3(0, 1, 0));
      uvs.push({ x: u, y: v });
    }
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const a = topIndex(x, y);
      const b = topIndex(x + 1, y);
      const c = topIndex(x, y + 1);
      const d = topIndex(x + 1, y + 1);
      indices.push(a, c, b, b, c, d);
    }
  }

  const bottomStart = positions.length;
  for (let y = 0; y <= rows; y++) {
    const v = y / rows;
    for (let x = 0; x <= cols; x++) {
      const u = x / cols;
      positions.push(vec3((u - 0.5) * width, 0, (v - 0.5) * depth));
      normals.push(vec3(0, -1, 0));
      uvs.push({ x: u, y: v });
    }
  }
  const bottomIndex = (x: number, y: number) => bottomStart + y * (cols + 1) + x;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const a = bottomIndex(x, y);
      const b = bottomIndex(x + 1, y);
      const c = bottomIndex(x, y + 1);
      const d = bottomIndex(x + 1, y + 1);
      indices.push(a, b, c, b, d, c);
    }
  }

  addReliefSide(indices, topIndex, bottomIndex, 0, 0, cols, 0, true);
  addReliefSide(indices, topIndex, bottomIndex, 0, rows, cols, rows, false);
  addReliefSide(indices, topIndex, bottomIndex, 0, 0, 0, rows, false);
  addReliefSide(indices, topIndex, bottomIndex, cols, 0, cols, rows, true);

  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function addReliefSide(
  indices: number[],
  topIndex: (x: number, y: number) => number,
  bottomIndex: (x: number, y: number) => number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  flip: boolean,
): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i < steps; i++) {
    const ax = x0 + Math.round(((x1 - x0) * i) / steps);
    const ay = y0 + Math.round(((y1 - y0) * i) / steps);
    const bx = x0 + Math.round(((x1 - x0) * (i + 1)) / steps);
    const by = y0 + Math.round(((y1 - y0) * (i + 1)) / steps);
    const a = topIndex(ax, ay);
    const b = topIndex(bx, by);
    const c = bottomIndex(ax, ay);
    const d = bottomIndex(bx, by);
    if (flip) indices.push(a, b, c, b, d, c);
    else indices.push(a, c, b, b, c, d);
  }
}

function buildPipeGraph(p: PipeNetworkParams): CurveGraph {
  const rng = makeRng(p.seed);
  const nodes: CurveGraphNode[] = [];
  const edges: CurveGraphEdge[] = [];
  const halfX = (p.cols - 1) * p.spacing * 0.5;
  const halfZ = (p.rows - 1) * p.spacing * 0.5;
  const pos = (x: number, z: number): Vec3 =>
    vec3(
      x * p.spacing - halfX + rng.range(-p.jitter, p.jitter),
      rng.range(0.12, 0.55),
      z * p.spacing - halfZ + rng.range(-p.jitter, p.jitter),
    );

  const nodePos = new Map<string, Vec3>();
  for (let z = 0; z < p.rows; z++) {
    for (let x = 0; x < p.cols; x++) {
      const id = `n${x}_${z}`;
      const position = pos(x, z);
      nodePos.set(id, position);
      nodes.push({ id, position });
    }
  }

  const addEdge = (from: string, to: string, arch: number): void => {
    const a = nodePos.get(from)!;
    const b = nodePos.get(to)!;
    const mid = lerpVec3(a, b, 0.5);
    const side = normalize(cross(sub(b, a), vec3(0, 1, 0)));
    const points = [
      a,
      add(mid, add(scale(side, rng.range(-0.12, 0.12)), vec3(0, arch, 0))),
      b,
    ];
    edges.push({ from, to, points });
  };

  for (let z = 0; z < p.rows; z++) {
    for (let x = 0; x < p.cols; x++) {
      if (x < p.cols - 1) addEdge(`n${x}_${z}`, `n${x + 1}_${z}`, rng.range(0.05, 0.28));
      if (z < p.rows - 1 && (x + z + p.seed) % 2 === 0) {
        addEdge(`n${x}_${z}`, `n${x}_${z + 1}`, rng.range(0.08, 0.34));
      }
    }
  }
  return makeCurveGraph(nodes, edges);
}

function wovenPotBodyMesh(field: Field2D, p: WovenPotParams): Mesh {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: { x: number; y: number }[] = [];
  const indices: number[] = [];
  for (let y = 0; y <= p.rows; y++) {
    const v = y / p.rows;
    const waist = Math.sin(v * Math.PI);
    const baseRadius = p.radiusBottom + (p.radiusTop - p.radiusBottom) * smoothstep(0.05, 1, v);
    const profileRadius = baseRadius + p.bulge * waist;
    for (let x = 0; x <= p.segments; x++) {
      const u = x / p.segments;
      const a = u * TAU;
      const weave = sampleField2DUV(field, u, v);
      const r = profileRadius + (weave - 0.42) * p.relief;
      const radial = vec3(Math.cos(a), 0, Math.sin(a));
      positions.push(vec3(radial.x * r, v * p.height, radial.z * r));
      normals.push(radial);
      uvs.push({ x: u, y: v });
    }
  }
  const stride = p.segments + 1;
  for (let y = 0; y < p.rows; y++) {
    for (let x = 0; x < p.segments; x++) {
      const a = y * stride + x;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const bottomCenter = positions.length;
  positions.push(vec3(0, 0, 0));
  normals.push(vec3(0, -1, 0));
  uvs.push({ x: 0.5, y: 0.5 });
  for (let x = 0; x < p.segments; x++) {
    indices.push(bottomCenter, x, x + 1);
  }
  const surface = recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
  const wallThickness = Math.max(0.025, Math.min(p.radiusBottom, p.radiusTop) * 0.055);
  return solidify(surface, { thickness: wallThickness });
}

function fibonacciDirection(i: number, count: number): Vec3 {
  const phi = Math.acos(1 - (2 * (i + 0.5)) / count);
  const theta = i * Math.PI * (3 - Math.sqrt(5));
  return normalize(vec3(
    Math.cos(theta) * Math.sin(phi),
    Math.cos(phi),
    Math.sin(theta) * Math.sin(phi),
  ));
}

interface Rect2 {
  x: number;
  z: number;
  w: number;
  d: number;
}

interface DungeonRoom extends Rect2 {
  cx: number;
  cz: number;
}

interface VaseSite {
  u: number;
  v: number;
  tint: number;
}

function splitBspRect(rect: Rect2, depth: number, rng: ReturnType<typeof makeRng>): Rect2[] {
  if (depth <= 0) return [rect];
  const vertical = rect.w / rect.d > 1.2 ? true : rect.d / rect.w > 1.2 ? false : rng.next() > 0.5;
  const size = vertical ? rect.w : rect.d;
  if (size < 2.4) return [rect];
  const t = rng.range(0.38, 0.62);
  if (vertical) {
    const w0 = rect.w * t;
    return [
      ...splitBspRect({ x: rect.x, z: rect.z, w: w0, d: rect.d }, depth - 1, rng),
      ...splitBspRect({ x: rect.x + w0, z: rect.z, w: rect.w - w0, d: rect.d }, depth - 1, rng),
    ];
  }
  const d0 = rect.d * t;
  return [
    ...splitBspRect({ x: rect.x, z: rect.z, w: rect.w, d: d0 }, depth - 1, rng),
    ...splitBspRect({ x: rect.x, z: rect.z + d0, w: rect.w, d: rect.d - d0 }, depth - 1, rng),
  ];
}

function roomFromLeaf(leaf: Rect2, p: BspDungeonParams, rng: ReturnType<typeof makeRng>): DungeonRoom {
  const fillX = clamp(p.roomFill * rng.range(0.86, 1.1), 0.32, 0.94);
  const fillZ = clamp(p.roomFill * rng.range(0.86, 1.1), 0.32, 0.94);
  const minSide = p.corridorWidth * 1.55;
  const rw = clamp(leaf.w * fillX, Math.min(minSide, leaf.w * 0.96), leaf.w * 0.96);
  const rd = clamp(leaf.d * fillZ, Math.min(minSide, leaf.d * 0.96), leaf.d * 0.96);
  const rx = leaf.x + (leaf.w - rw) * rng.next();
  const rz = leaf.z + (leaf.d - rd) * rng.next();
  return { x: rx, z: rz, w: rw, d: rd, cx: rx + rw * 0.5, cz: rz + rd * 0.5 };
}

function connectDungeonRooms(rooms: readonly DungeonRoom[], p: BspDungeonParams, rng: ReturnType<typeof makeRng>): Rect2[] {
  const sorted = rooms.slice().sort((a, b) => a.cx === b.cx ? a.cz - b.cz : a.cx - b.cx);
  const out: Rect2[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    const horizontalFirst = rng.next() > 0.5;
    if (horizontalFirst) {
      out.push(...corridorPair(a.cx, a.cz, b.cx, a.cz, b.cx, b.cz, p.corridorWidth));
    } else {
      out.push(...corridorPair(a.cx, a.cz, a.cx, b.cz, b.cx, b.cz, p.corridorWidth));
    }
  }
  return out;
}

function corridorPair(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, width: number): Rect2[] {
  const first = corridorRect(ax, az, bx, bz, width);
  const second = corridorRect(bx, bz, cx, cz, width);
  return [first, second].filter((rect) => rect.w > 0 && rect.d > 0);
}

function corridorRect(x0: number, z0: number, x1: number, z1: number, width: number): Rect2 {
  const minX = Math.min(x0, x1) - width * 0.5;
  const minZ = Math.min(z0, z1) - width * 0.5;
  return {
    x: minX,
    z: minZ,
    w: Math.abs(x1 - x0) + width,
    d: Math.abs(z1 - z0) + width,
  };
}

function dungeonBox(cx: number, cy: number, cz: number, w: number, h: number, d: number): Mesh {
  return transform(bevelEdges(box(w, h, d), { width: Math.min(w, h, d) * 0.08, segments: 1 }), {
    translate: vec3(cx, cy, cz),
  });
}

function dungeonWallsForRoom(room: DungeonRoom, p: BspDungeonParams): Mesh[] {
  const t = Math.max(0.08, p.corridorWidth * 0.16);
  const y = p.floorThickness + p.wallHeight * 0.5;
  const cx = room.cx;
  const cz = room.cz;
  const x0 = room.x - t * 0.5;
  const x1 = room.x + room.w + t * 0.5;
  const z0 = room.z - t * 0.5;
  const z1 = room.z + room.d + t * 0.5;
  return [
    dungeonBox(cx, y, z0, room.w + t * 2, p.wallHeight, t),
    dungeonBox(cx, y, z1, room.w + t * 2, p.wallHeight, t),
    dungeonBox(x0, y, cz, t, p.wallHeight, room.d),
    dungeonBox(x1, y, cz, t, p.wallHeight, room.d),
  ];
}

function voronoiVaseSites(p: VoronoiVaseParams): VaseSite[] {
  const rng = makeRng(p.seed);
  const sites: VaseSite[] = [];
  for (let i = 0; i < p.cells; i++) {
    sites.push({
      u: rng.next(),
      v: rng.range(0.04, 0.96),
      tint: rng.next(),
    });
  }
  return sites;
}

function voronoiVaseBodyMesh(p: VoronoiVaseParams, sites: readonly VaseSite[]): { mesh: Mesh; colors: number[] } {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: { x: number; y: number }[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  const aspect = Math.max(0.6, p.height / Math.max(0.1, p.radius * TAU));

  for (let y = 0; y <= p.rows; y++) {
    const v = y / p.rows;
    const baseRadius = vaseProfileRadius(v, p);
    for (let x = 0; x <= p.segments; x++) {
      const u = x / p.segments;
      const mask = wrappedVoronoiEdgeMask(u, v, sites, aspect, p.edgeWidth);
      const offset = p.relief * (mask.edge - (1 - mask.edge) * p.cellInset * 0.55);
      const r = Math.max(0.04, baseRadius + offset);
      const a = u * TAU + (v - 0.5) * p.twist;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      positions.push(vec3(ca * r, v * p.height, sa * r));
      normals.push(vec3(ca, 0, sa));
      uvs.push({ x: u, y: v });
      const site = sites[mask.nearest] ?? { tint: 0.5 };
      const cellTone = mixColor(VASE_BODY, VASE_SHADOW, site.tint * 0.34);
      colors.push(...mixColor(cellTone, VASE_RIB, mask.edge));
    }
  }

  const stride = p.segments + 1;
  for (let y = 0; y < p.rows; y++) {
    for (let x = 0; x < p.segments; x++) {
      const a = y * stride + x;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  const bottomCenter = positions.length;
  positions.push(vec3(0, 0, 0));
  normals.push(vec3(0, -1, 0));
  uvs.push({ x: 0.5, y: 0 });
  colors.push(...VASE_SHADOW);
  for (let x = 0; x < p.segments; x++) {
    indices.push(bottomCenter, x, x + 1);
  }

  const surface = recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
  const wallThickness = Math.max(0.025, p.radius * 0.055);
  const mesh = solidify(surface, { thickness: wallThickness });
  const shellColors = mesh.uvs.flatMap(({ x: u, y: v }) => {
    const mask = wrappedVoronoiEdgeMask(u, v, sites, aspect, p.edgeWidth);
    const site = sites[mask.nearest] ?? { tint: 0.5 };
    const cellTone = mixColor(VASE_BODY, VASE_SHADOW, site.tint * 0.34);
    return mixColor(cellTone, VASE_RIB, mask.edge);
  });
  return { mesh, colors: shellColors };
}

function vaseProfileRadius(v: number, p: VoronoiVaseParams): number {
  const foot = lerp(0.48, 0.68, smoothstep(0, 0.18, v));
  const belly = Math.sin(v * Math.PI) * p.bulge;
  const neck = (p.neck - 0.68) * smoothstep(0.58, 1, v);
  const lip = 0.06 * smoothstep(0.9, 1, v);
  return Math.max(0.04, p.radius * (foot + belly + neck + lip));
}

function wrappedVoronoiEdgeMask(
  u: number,
  v: number,
  sites: readonly VaseSite[],
  aspect: number,
  edgeWidth: number,
): { edge: number; nearest: number } {
  let d1 = Infinity;
  let d2 = Infinity;
  let nearest = 0;
  for (let i = 0; i < sites.length; i++) {
    const site = sites[i]!;
    let du = Math.abs(u - site.u);
    du = Math.min(du, 1 - du) / Math.max(0.2, aspect);
    const dv = v - site.v;
    const d = Math.hypot(du, dv);
    if (d < d1) {
      d2 = d1;
      d1 = d;
      nearest = i;
    } else if (d < d2) {
      d2 = d;
    }
  }
  const gap = d2 - d1;
  return { edge: 1 - smoothstep(edgeWidth * 0.22, edgeWidth, gap), nearest };
}

function mixColor(a: RGB, b: RGB, t: number): RGB {
  const k = clamp(t, 0, 1);
  return [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ];
}

function isHoudiniCategory(value: unknown): value is HoudiniHowtosCategory {
  return value === "field" ||
    value === "curveGraph" ||
    value === "weave" ||
    value === "panelRemesh" ||
    value === "growth" ||
    value === "dungeon" ||
    value === "vase";
}
