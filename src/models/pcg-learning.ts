import { vec2 } from "../math/vec2.js";
import { vec3, normalize, sub, type Vec3 } from "../math/vec3.js";
import { makeNoise } from "../random/noise.js";
import {
  box,
  buildRiverSystem2D,
  clusterCells,
  hexCellGraph,
  icosphere,
  makeMesh,
  merge,
  meshSurface,
  panelizeCliffMesh,
  projectSurfaceStroke,
  recomputeNormals,
  sampleRiverField,
  sphere,
  subdivide,
  surfaceStrokeCurve,
  sweep,
  transform,
  type CellGraphCell2D,
  type Mesh,
  type NamedPart,
  type RiverSystem2D,
  type SurfaceStroke,
} from "../geometry/index.js";

type RGB = [number, number, number];

export interface PcgCellMapParams {
  rings: number;
  cellSize: number;
  clusters: number;
  jitter: number;
  relief: number;
  seed: number;
}

export const PCG_CELL_MAP_DEFAULTS: PcgCellMapParams = {
  rings: 6,
  cellSize: 0.72,
  clusters: 6,
  jitter: 0.12,
  relief: 1.8,
  seed: 12,
};

export function buildPcgCellMapParts(params: Partial<PcgCellMapParams> = {}): NamedPart[] {
  const p = { ...PCG_CELL_MAP_DEFAULTS, ...params };
  const graph = hexCellGraph({
    rings: p.rings,
    cellSize: p.cellSize,
    jitter: p.jitter,
    seed: p.seed,
  });
  const clusters = clusterCells(graph, p.clusters, p.seed + 1);
  const noise = makeNoise(p.seed + 11);
  const radius = Math.max(...graph.cells.map((cell) => Math.hypot(cell.center.x, cell.center.y))) || 1;
  const palette: RGB[] = [
    [0.25, 0.55, 0.2], [0.48, 0.7, 0.25], [0.72, 0.62, 0.27],
    [0.32, 0.58, 0.46], [0.48, 0.4, 0.27], [0.66, 0.74, 0.56],
    [0.35, 0.48, 0.2], [0.6, 0.5, 0.23],
  ];
  const byCluster = new Map<number, Mesh[]>();
  const coast: Mesh[] = [];
  for (const cell of graph.cells) {
    const radial = 1 - Math.hypot(cell.center.x, cell.center.y) / radius;
    const field = radial * 1.3 + noise.noise2(cell.center.x * 0.24, cell.center.y * 0.24) * 0.32;
    if (field < 0.23) continue;
    const height = 0.16 + Math.max(0, field) * p.relief;
    const inset = field < 0.36 ? 0.88 : 0.93;
    const mesh = cellPrism(cell, p.cellSize * inset, height, -0.12);
    if (field < 0.36) coast.push(mesh);
    else {
      const label = clusters[cell.id] ?? 0;
      const meshes = byCluster.get(label) ?? [];
      meshes.push(mesh);
      byCluster.set(label, meshes);
    }
  }
  const extent = (p.rings * 2 + 2) * p.cellSize * 1.75;
  const parts: NamedPart[] = [part(
    "cell_map_water",
    "六边格群岛水面",
    transform(box(extent, 0.08, extent), { translate: vec3(0, -0.17, 0) }),
    [0.07, 0.3, 0.52],
    "water",
    { body: "ocean", tint: [0.1, 0.34, 0.54], deepColor: [0.012, 0.06, 0.14], roughness: 0.1, seed: p.seed + 3 },
  )];
  if (coast.length > 0) parts.push(part(
    "cell_map_coast",
    "单元海岸带",
    merge(...coast),
    [0.78, 0.7, 0.4],
    "sand",
    { color: [0.78, 0.7, 0.4], seed: p.seed },
  ));
  for (const [label, meshes] of [...byCluster.entries()].sort((a, b) => a[0] - b[0])) {
    const color = palette[label % palette.length]!;
    parts.push(part(
      `cell_cluster_${label}`,
      `连通生态分区 ${label + 1}`,
      merge(...meshes),
      color,
      "stylizedTerrain",
      { color, seed: p.seed + label },
    ));
  }
  return parts;
}

export interface PcgRiverValleyParams {
  size: number;
  resolution: number;
  riverWidth: number;
  riverDepth: number;
  meander: number;
  relief: number;
  seed: number;
}

export const PCG_RIVER_VALLEY_DEFAULTS: PcgRiverValleyParams = {
  size: 26,
  resolution: 56,
  riverWidth: 1.2,
  riverDepth: 0.8,
  meander: 3.4,
  relief: 3.6,
  seed: 21,
};

export function buildPcgRiverValleyParts(params: Partial<PcgRiverValleyParams> = {}): NamedPart[] {
  const p = { ...PCG_RIVER_VALLEY_DEFAULTS, ...params };
  const river = buildRiverSystem2D({
    size: p.size,
    resolution: p.resolution,
    riverWidth: p.riverWidth,
    riverDepth: p.riverDepth,
    meander: p.meander,
    terrainHeight: p.relief,
    seed: p.seed,
  });
  const terrain = riverTerrainMesh(river);
  const water = riverWaterMesh(river);
  const colors: number[] = [];
  for (let index = 0; index < river.terrain.length; index++) {
    const wet = river.accumulation[index]!;
    const eroded = river.erosion[index]!;
    colors.push(
      0.22 + wet * 0.12 + eroded * 0.12,
      0.34 + wet * 0.18,
      0.16 + wet * 0.1,
    );
  }
  return [
    {
      name: "river_valley_terrain",
      label: "侵蚀河谷地形",
      mesh: terrain,
      color: [0.3, 0.42, 0.2],
      colors,
      surface: { type: "mossyStone", params: { color: [0.3, 0.42, 0.2], seed: p.seed } },
      metadata: { channels: ["direction", "accumulation", "erosion", "deposition"] },
    },
    part(
      "river_valley_water",
      "共享流向河面",
      water,
      [0.04, 0.3, 0.5],
      "water",
      { body: "river", tint: [0.08, 0.38, 0.5], deepColor: [0.015, 0.1, 0.16], roughness: 0.11, flowSpeed: 0.8, seed: p.seed + 7 },
    ),
  ];
}

export interface SurfaceSketchVineParams {
  wallWidth: number;
  wallHeight: number;
  strokeOffset: number;
  strokeWander: number;
  vineRadius: number;
  leafSize: number;
  seed: number;
}

export const SURFACE_SKETCH_VINE_DEFAULTS: SurfaceSketchVineParams = {
  wallWidth: 6.5,
  wallHeight: 5.4,
  strokeOffset: 0.04,
  strokeWander: 0.7,
  vineRadius: 0.045,
  leafSize: 0.15,
  seed: 9,
};

export function buildSurfaceSketchVineParts(params: Partial<SurfaceSketchVineParams> = {}): NamedPart[] {
  const p = { ...SURFACE_SKETCH_VINE_DEFAULTS, ...params };
  const wall = transform(subdivide(box(p.wallWidth, p.wallHeight, 0.72), 1), {
    translate: vec3(0, p.wallHeight * 0.5, 0),
  });
  const surface = meshSurface(wall);
  const noise = makeNoise(p.seed);
  const branches = [
    sketchSamples(p, noise, -0.28, 0.9, 1),
    sketchSamples(p, noise, 0.08, 0.72, -1),
    sketchSamples(p, noise, 0.32, 0.55, 1),
  ];
  const strokes = branches.map((samples) => projectSurfaceStroke(samples, surface, {
    spacing: 0.16,
    smoothing: 3,
    offset: p.strokeOffset,
  }));
  const stems = strokes.map((stroke, index) => sweep(surfaceStrokeCurve(stroke), {
    radius: p.vineRadius * (1 - index * 0.14),
    sides: 7,
    radiusAt: (t) => Math.max(0.15, 1 - t * 0.75),
    caps: false,
  }));
  const leafMeshes = strokes.flatMap((stroke, strokeIndex) => strokeLeaves(stroke, p.leafSize, strokeIndex));
  const controlMeshes = strokes.flatMap((stroke) => stroke.points
    .filter((_, index) => index % 12 === 0)
    .map((point) => transform(icosphere(0.055, 1), { translate: point.position })));
  return [
    part("surface_sketch_wall", "可绘制岩墙", wall, [0.42, 0.39, 0.34], "rock", { seed: p.seed, roughness: 0.94 }),
    part("surface_sketch_stems", "绘制意图生成藤茎", merge(...stems), [0.17, 0.3, 0.08], "wood", { color: [0.17, 0.3, 0.08] }),
    part("surface_sketch_leaves", "绘制意图生成叶片", merge(...leafMeshes), [0.22, 0.56, 0.14], "leaf", { color: [0.22, 0.56, 0.14] }),
    part("surface_sketch_controls", "可重放笔划采样点", merge(...controlMeshes), [0.96, 0.55, 0.08], "ceramic", { color: [0.96, 0.55, 0.08] }),
  ];
}

export interface CliffPanelStudyParams {
  width: number;
  depth: number;
  height: number;
  resolution: number;
  strata: number;
  erosion: number;
  talus: number;
  directionBins: number;
  panelScale: number;
  seed: number;
}

export const CLIFF_PANEL_STUDY_DEFAULTS: CliffPanelStudyParams = {
  width: 14,
  depth: 12,
  height: 6,
  resolution: 48,
  strata: 6,
  erosion: 0.72,
  talus: 0.65,
  directionBins: 8,
  panelScale: 2.5,
  seed: 31,
};

export function buildCliffPanelStudyParts(params: Partial<CliffPanelStudyParams> = {}): NamedPart[] {
  const p = { ...CLIFF_PANEL_STUDY_DEFAULTS, ...params };
  const terrain = cliffTerrainMesh(p);
  const panels = panelizeCliffMesh(terrain, {
    directionBins: p.directionBins,
    maxUpDot: 0.92,
    uvScale: p.panelScale,
    minimumFaces: 2,
  });
  const palette: RGB[] = [
    [0.36, 0.29, 0.23], [0.42, 0.32, 0.24], [0.33, 0.3, 0.26], [0.46, 0.35, 0.25],
    [0.3, 0.28, 0.25], [0.4, 0.3, 0.24], [0.38, 0.34, 0.28], [0.44, 0.32, 0.24],
  ];
  const fallback = panels.filter((panel) => panel.fallback).map((panel) => panel.mesh);
  const byDirection = new Map<number, Mesh[]>();
  for (const panel of panels) {
    if (panel.fallback) continue;
    const meshes = byDirection.get(panel.directionBin) ?? [];
    meshes.push(projectCliffWallUvs(panel.mesh, p.panelScale));
    byDirection.set(panel.directionBin, meshes);
  }
  const parts: NamedPart[] = [];
  if (fallback.length > 0) parts.push(part(
    "cliff_panel_fallback",
    "崖顶与崩积坡",
    merge(...fallback),
    [0.29, 0.3, 0.22],
    "mossyStone",
    { color: [0.29, 0.3, 0.22], moss: 0.08, seed: p.seed },
  ));
  for (const [direction, meshes] of [...byDirection.entries()].sort((a, b) => a[0] - b[0])) {
    const color = palette[direction % palette.length]!;
    parts.push(part(
      `cliff_panel_direction_${direction}`,
      `崖壁局部投影方向 ${direction + 1}`,
      merge(...meshes),
      color,
      "stone",
      { seed: p.seed, scale: p.panelScale, projection: "panel-local" },
    ));
  }
  return parts;
}

function projectCliffWallUvs(mesh: Mesh, scale: number): Mesh {
  return makeMesh({
    positions: mesh.positions.slice(),
    normals: mesh.normals.slice(),
    uvs: mesh.positions.map((position) => vec2(position.z / scale, position.y / scale)),
    indices: mesh.indices.slice(),
  });
}

function cellPrism(cell: CellGraphCell2D, radius: number, topY: number, bottomY: number): Mesh {
  const positions: Vec3[] = [vec3(cell.center.x, topY, cell.center.y), vec3(cell.center.x, bottomY, cell.center.y)];
  const normals: Vec3[] = [vec3(0, 1, 0), vec3(0, -1, 0)];
  const uvs = [vec2(0.5, 0.5), vec2(0.5, 0.5)];
  const indices: number[] = [];
  for (let corner = 0; corner < 6; corner++) {
    const angle = Math.PI / 6 + corner * Math.PI / 3;
    positions.push(vec3(cell.center.x + Math.cos(angle) * radius, topY, cell.center.y + Math.sin(angle) * radius));
    positions.push(vec3(cell.center.x + Math.cos(angle) * radius, bottomY, cell.center.y + Math.sin(angle) * radius));
    normals.push(vec3(0, 1, 0), vec3(0, -1, 0));
    uvs.push(vec2(0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5), vec2(corner / 6, 0));
  }
  for (let corner = 0; corner < 6; corner++) {
    const next = (corner + 1) % 6;
    const top = 2 + corner * 2;
    const bottom = top + 1;
    const nextTop = 2 + next * 2;
    const nextBottom = nextTop + 1;
    indices.push(0, top, nextTop, 1, nextBottom, bottom, top, bottom, nextBottom, top, nextBottom, nextTop);
  }
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function riverTerrainMesh(system: RiverSystem2D): Mesh {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];
  for (let z = 0; z < system.resolution; z++) {
    for (let x = 0; x < system.resolution; x++) {
      const index = z * system.resolution + x;
      positions.push(vec3(
        -system.size * 0.5 + (x / (system.resolution - 1)) * system.size,
        system.terrain[index]!,
        -system.size * 0.5 + (z / (system.resolution - 1)) * system.size,
      ));
      normals.push(vec3(0, 1, 0));
      uvs.push(vec2(x / (system.resolution - 1), z / (system.resolution - 1)));
    }
  }
  appendGridIndices(indices, system.resolution, system.resolution);
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function riverWaterMesh(system: RiverSystem2D): Mesh {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];
  const points = system.centerline.points;
  for (let index = 0; index < points.length; index++) {
    const point = points[index]!;
    const previous = points[Math.max(0, index - 1)]!;
    const next = points[Math.min(points.length - 1, index + 1)]!;
    const tangent = normalize(sub(next, previous));
    const right = vec3(-tangent.z, 0, tangent.x);
    const width = sampleRiverField(system, system.width, point.x, point.z) * 0.92;
    const bed = sampleRiverField(system, system.terrain, point.x, point.z);
    const depth = sampleRiverField(system, system.depth, point.x, point.z);
    const y = bed + depth * 0.72 + 0.04;
    positions.push(
      vec3(point.x - right.x * width, y, point.z - right.z * width),
      vec3(point.x + right.x * width, y, point.z + right.z * width),
    );
    normals.push(vec3(0, 1, 0), vec3(0, 1, 0));
    const v = index / Math.max(1, points.length - 1);
    uvs.push(vec2(0, v), vec2(1, v));
    if (index > 0) {
      const base = index * 2;
      indices.push(base - 2, base, base - 1, base - 1, base, base + 1);
    }
  }
  return makeMesh({ positions, normals, uvs, indices });
}

function sketchSamples(
  params: SurfaceSketchVineParams,
  noise: ReturnType<typeof makeNoise>,
  xOffset: number,
  heightScale: number,
  direction: number,
): Vec3[] {
  return Array.from({ length: 12 }, (_, index) => {
    const t = index / 11;
    const x = xOffset * params.wallWidth
      + Math.sin(t * Math.PI * (1.2 + heightScale) + xOffset * 8) * params.strokeWander * direction
      + noise.noise2(t * 3 + xOffset, params.seed * 0.1) * params.strokeWander * 0.3;
    return vec3(x, 0.18 + t * params.wallHeight * heightScale, 0.7);
  });
}

function strokeLeaves(stroke: SurfaceStroke, size: number, strokeIndex: number): Mesh[] {
  const meshes: Mesh[] = [];
  for (let index = 4; index < stroke.points.length; index += 7) {
    const point = stroke.points[index]!;
    const scale = size * (0.78 + ((index + strokeIndex) % 5) * 0.06);
    meshes.push(transform(sphere(1, 8, 5), {
      scale: vec3(scale * 0.62, scale, scale * 0.18),
      rotate: vec3(0, 0, ((index + strokeIndex) % 2 === 0 ? 1 : -1) * 0.55),
      translate: point.position,
    }));
  }
  return meshes;
}

function cliffTerrainMesh(params: CliffPanelStudyParams): Mesh {
  const zSamples = Math.max(16, Math.round(params.resolution));
  const ySamples = Math.max(12, Math.round(zSamples * 0.72));
  const plateauSamples = Math.max(6, Math.round(zSamples * 0.28));
  const valleySamples = Math.max(8, Math.round(zSamples * 0.34));
  const noise = makeNoise(params.seed);
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];

  const sampleZ = (zIndex: number): number =>
    -params.depth * 0.5 + (zIndex / (zSamples - 1)) * params.depth;
  const edgeCenter = (z: number): number => {
    const warp = noise.noise2(z * 0.13, 8.3) * 0.9;
    return Math.sin(z * 0.34 + warp) * params.width * 0.075
      + Math.sin(z * 0.91 + 1.2) * params.width * 0.025
      + noise.noise2(z * 0.19 + warp * 0.15, 4) * params.width * 0.055;
  };
  const topHeight = (z: number): number =>
    params.height + fractalNoise2(noise, z * 0.1, 12, 3) * params.height * 0.08;
  const bottomHeight = (z: number): number =>
    fractalNoise2(noise, z * 0.14, -8, 2) * params.height * 0.025;
  const cliffX = (z: number, v: number): number => {
    const warp = noise.noise2(z * 0.12, v * 1.15 + 3.7) * 0.72
      + noise.noise2(z * 0.31 + 5.1, v * 0.7) * 0.24;
    const warpedZ = z + warp;
    const macro = fractalNoise2(noise, warpedZ * 0.2, v * 1.25 + 18, 4)
      * params.width * 0.075;
    const detail = fractalNoise2(noise, warpedZ * 0.72 + 9, v * 4.2, 3)
      * params.width * 0.018;
    const bandCoord = v * Math.max(1, params.strata)
      + noise.noise2(warpedZ * 0.16, 22) * 0.25
      + noise.noise2(v * 1.9, 47) * 0.5;
    const bandPhase = bandCoord - Math.floor(bandCoord);
    const bandVariation = 0.45 + (noise.noise2(Math.floor(bandCoord) * 0.71, 61) * 0.5 + 0.5) * 0.55;
    const ledge = Math.pow(1 - bandPhase, 3.2) * params.width * 0.025 * bandVariation;
    const channel = Math.abs(noise.noise2(
      warpedZ * 0.3 + noise.noise2(v * 1.4, 31) * 0.32,
      33 + v * 0.22,
    ));
    const gully = smoothstep(0.22, 0.035, channel)
      * params.erosion * params.width * (0.018 + (1 - v) * 0.022);
    const joint = smoothstep(
      0.13,
      0.025,
      Math.abs(noise.noise2(
        warpedZ * 0.34 + noise.noise2(v * 1.7, 71) * 0.42,
        57 + v * 0.12,
      )),
    ) * params.erosion * params.width * 0.012;
    const undercut = Math.sin(v * Math.PI * 2.2 + warp) * params.width * 0.012;
    return edgeCenter(z) + macro + detail + ledge + undercut - gully - joint;
  };

  for (let zIndex = 0; zIndex < zSamples; zIndex++) {
    const z = sampleZ(zIndex);
    const bottom = bottomHeight(z);
    const top = topHeight(z);
    for (let yIndex = 0; yIndex < ySamples; yIndex++) {
      const v = yIndex / (ySamples - 1);
      positions.push(vec3(cliffX(z, v), bottom + (top - bottom) * v, z));
      normals.push(vec3(1, 0, 0));
      uvs.push(vec2(z / params.panelScale, v * params.height / params.panelScale));
    }
  }
  appendCliffFaceIndices(indices, ySamples, zSamples);

  const plateauOffset = positions.length;
  for (let zIndex = 0; zIndex < zSamples; zIndex++) {
    const z = sampleZ(zIndex);
    const edge = cliffX(z, 1);
    const top = topHeight(z);
    for (let xIndex = 0; xIndex < plateauSamples; xIndex++) {
      const t = xIndex / (plateauSamples - 1);
      const x = -params.width * 0.5 + (edge + params.width * 0.5) * t;
      const weathering = fractalNoise2(noise, x * 0.22, z * 0.22, 3)
        * params.height * 0.025 * (1 - t * 0.5);
      positions.push(vec3(x, top + weathering, z));
      normals.push(vec3(0, 1, 0));
      uvs.push(vec2(x / params.panelScale, z / params.panelScale));
    }
  }
  appendOffsetGridIndices(indices, plateauSamples, zSamples, plateauOffset);

  const valleyOffset = positions.length;
  for (let zIndex = 0; zIndex < zSamples; zIndex++) {
    const z = sampleZ(zIndex);
    const edge = cliffX(z, 0);
    const bottom = bottomHeight(z);
    for (let xIndex = 0; xIndex < valleySamples; xIndex++) {
      const t = xIndex / (valleySamples - 1);
      const x = edge + (params.width * 0.5 - edge) * t;
      const apron = Math.exp(-t * 5.2) * params.height * params.talus * 0.18;
      const rubble = Math.max(0, fractalNoise2(noise, x * 0.55 + 17, z * 0.55, 3))
        * params.height * params.talus * 0.045 * (1 - t);
      const floorNoise = fractalNoise2(noise, x * 0.18, z * 0.18, 2) * params.height * 0.018;
      positions.push(vec3(x, bottom + apron + rubble + floorNoise, z));
      normals.push(vec3(0, 1, 0));
      uvs.push(vec2(x / params.panelScale, z / params.panelScale));
    }
  }
  appendOffsetGridIndices(indices, valleySamples, zSamples, valleyOffset);
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function appendCliffFaceIndices(indices: number[], height: number, depth: number): void {
  for (let z = 0; z < depth - 1; z++) {
    for (let y = 0; y < height - 1; y++) {
      const a = z * height + y;
      const b = a + height;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
}

function appendOffsetGridIndices(indices: number[], width: number, height: number, offset: number): void {
  const local: number[] = [];
  appendGridIndices(local, width, height);
  indices.push(...local.map((index) => index + offset));
}

function fractalNoise2(
  noise: ReturnType<typeof makeNoise>,
  x: number,
  y: number,
  octaves: number,
): number {
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  let weight = 0;
  for (let octave = 0; octave < octaves; octave++) {
    total += noise.noise2(x * frequency, y * frequency) * amplitude;
    weight += amplitude;
    frequency *= 2.03;
    amplitude *= 0.5;
  }
  return weight > 0 ? total / weight : 0;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function appendGridIndices(indices: number[], width: number, height: number): void {
  for (let z = 0; z < height - 1; z++) {
    for (let x = 0; x < width - 1; x++) {
      const a = z * width + x;
      const b = a + width;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
}

function part(
  name: string,
  label: string,
  mesh: Mesh,
  color: RGB,
  surface: string,
  surfaceParams: Record<string, unknown>,
): NamedPart {
  return { name, label, mesh, color, surface: { type: surface, params: surfaceParams } };
}
