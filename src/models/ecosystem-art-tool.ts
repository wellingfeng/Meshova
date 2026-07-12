import { field2DStats, sampleField2DBilinear, type Field2D } from "../field/index.js";
import {
  applyMaskField,
  applyScatterTable,
  buildInstanceBuffers,
  cone,
  copyToPoints,
  cylinder,
  icosphere,
  merge,
  pointAttribute,
  pointCount,
  polyline,
  pruneMasked,
  roadRibbon,
  ruleSelfPruning,
  scaleMesh,
  smoothCurve,
  surfacePointCloud,
  transform,
  translateMesh,
  type GpuInstanceRecord,
  type InstanceBufferGroup,
  type MaskField,
  type Mesh,
  type NamedPart,
  type PointCloud,
  type ScatterTable,
} from "../geometry/index.js";
import { fromAxisAngle } from "../math/quat.js";
import { vec3 } from "../math/vec3.js";
import { buildTerrainField } from "../terrain/index.js";
import { foliageWindWeights } from "../vegetation/index.js";

type RGB = [number, number, number];

export interface EcosystemAssetSlot {
  readonly id: string;
  readonly label: string;
  readonly weight: number;
  readonly scale: readonly [number, number];
  readonly yaw?: readonly [number, number];
}

export interface EcosystemLayerDefinition {
  readonly id: string;
  readonly label: string;
  readonly candidates: number;
  readonly density: number;
  readonly spacing: number;
  readonly mask: MaskField;
  readonly materialId: string;
  readonly assets: ReadonlyArray<EcosystemAssetSlot>;
}

export interface CompiledEcosystemLayer {
  readonly definition: EcosystemLayerDefinition;
  readonly points: PointCloud;
}

export interface EcosystemChunkSummary {
  readonly id: string;
  readonly instanceCount: number;
  readonly layerCounts: Readonly<Record<string, number>>;
}

export interface EcosystemCompileResult {
  readonly layers: ReadonlyArray<CompiledEcosystemLayer>;
  readonly chunks: ReadonlyArray<EcosystemChunkSummary>;
  readonly instanceBuffers: ReadonlyArray<InstanceBufferGroup>;
  readonly totalInstances: number;
}

export interface CompileEcosystemOptions {
  readonly seed: number;
  readonly chunkSize: number;
}

export interface EcosystemArtToolParams {
  size: number;
  resolution: number;
  relief: number;
  density: number;
  slopeMax: number;
  treeSpacing: number;
  pathWidth: number;
  clusterScale: number;
  paintGap: number;
  chunkSize: number;
  season: number;
  seed: number;
}

export interface EcosystemArtToolSummary {
  treeCount: number;
  shrubCount: number;
  groundCoverCount: number;
  rockCount: number;
  chunkCount: number;
  bufferGroupCount: number;
  totalInstances: number;
  triangleCount: number;
}

export const ECOSYSTEM_ART_TOOL_DEFAULTS: EcosystemArtToolParams = {
  size: 54,
  resolution: 64,
  relief: 5.2,
  density: 0.72,
  slopeMax: 42,
  treeSpacing: 3.2,
  pathWidth: 2.2,
  clusterScale: 0.42,
  paintGap: 3.8,
  chunkSize: 14,
  season: 0.16,
  seed: 27,
};

const SOURCE_VIDEO = "https://www.bilibili.com/video/BV1459jBxEzE/";
const UP = vec3(0, 1, 0);
const BARK: RGB = [0.25, 0.14, 0.07];
const SHRUB: RGB = [0.2, 0.42, 0.12];
const GRASS: RGB = [0.28, 0.5, 0.13];
const ROCK: RGB = [0.34, 0.35, 0.31];
const PATH: RGB = [0.28, 0.21, 0.13];

export function compileEcosystemLayers(
  surface: Mesh,
  definitions: ReadonlyArray<EcosystemLayerDefinition>,
  options: CompileEcosystemOptions,
): EcosystemCompileResult {
  if (!Number.isFinite(options.chunkSize) || options.chunkSize <= 0) {
    throw new Error("ecosystem chunkSize must be > 0");
  }
  const layers: CompiledEcosystemLayer[] = [];
  const records: GpuInstanceRecord[] = [];
  const chunks = new Map<string, { instanceCount: number; layerCounts: Record<string, number> }>();

  definitions.forEach((definition, layerIndex) => {
    validateLayer(definition);
    const seed = (options.seed + layerIndex * 1009) >>> 0;
    let points = surfacePointCloud(surface, {
      count: Math.max(0, Math.round(definition.candidates)),
      seed,
    });
    points = applyMaskField(points, definition.mask);
    points = pruneMasked()(points);
    const table: ScatterTable = {
      schema: "meshova-scatter-table@1",
      seed: seed + 1,
      density: definition.density,
      rows: definition.assets.map((asset, variant) => ({
        id: asset.id,
        label: asset.label,
        variant,
        weight: asset.weight,
        scale: asset.scale,
        yaw: asset.yaw ?? [-Math.PI, Math.PI],
      })),
    };
    points = applyScatterTable(points, table, { prune: true });
    points = pruneMasked()(ruleSelfPruning({ radius: definition.spacing })(points));
    layers.push({ definition, points });

    for (let index = 0; index < points.points.length; index++) {
      const point = points.points[index]!;
      const variant = positiveModulo(Math.round(points.attributes.variant?.[index] ?? 0), definition.assets.length);
      const asset = definition.assets[variant]!;
      const partition = chunkId(point.x, point.z, options.chunkSize);
      const chunk = chunks.get(partition) ?? { instanceCount: 0, layerCounts: {} };
      chunk.instanceCount += 1;
      chunk.layerCounts[definition.id] = (chunk.layerCounts[definition.id] ?? 0) + 1;
      chunks.set(partition, chunk);
      records.push({
        meshId: asset.id,
        materialId: definition.materialId,
        partition,
        position: point,
        rotation: fromAxisAngle(UP, points.attributes.yaw?.[index] ?? 0),
        scale: points.attributes.scale?.[index] ?? 1,
        customData: [variant, layerIndex],
        sourceNode: definition.id,
      });
    }
  });

  return {
    layers,
    chunks: [...chunks.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, chunk]) => ({ id, instanceCount: chunk.instanceCount, layerCounts: chunk.layerCounts })),
    instanceBuffers: buildInstanceBuffers(records, { customStride: 2 }),
    totalInstances: records.length,
  };
}

export function buildEcosystemArtToolParts(
  params: Partial<EcosystemArtToolParams> = {},
): NamedPart[] {
  const p = resolveParams(params);
  const terrain = buildTerrainField({
    size: p.size,
    resolution: p.resolution,
    seed: p.seed,
    height: p.relief,
    noiseScale: 1.1,
    ridgeScale: 2.2,
    ridgeStrength: 0.24,
    islandFalloff: 0.18,
    terraceStrength: 0.02,
    iterations: 5,
    hydraulicStrength: 0.012,
    thermalStrength: 0.03,
    waterLevel: -1,
  });
  const path = buildPath(terrain.height, p.size);
  const stats = field2DStats(terrain.height);
  const clearPoint = vec3(p.size * 0.17, 0, p.size * 0.08);
  const definitions = ecosystemDefinitions(p, path, stats.min, stats.max, clearPoint);
  const compiled = compileEcosystemLayers(terrain.mesh, definitions, {
    seed: p.seed + 100,
    chunkSize: p.chunkSize,
  });
  const byId = new Map(compiled.layers.map((layer) => [layer.definition.id, layer.points]));
  const treePoints = byId.get("canopy")!;
  const shrubPoints = byId.get("understory")!;
  const groundPoints = byId.get("ground-cover")!;
  const rockPoints = byId.get("rocks")!;
  const trees = treePrototypes();
  const placement = {
    variant: pointAttribute("variant", 0),
    scale: pointAttribute("scale", 1),
    yaw: pointAttribute("yaw", 0),
    alignToNormal: false,
  } as const;
  const leafColor = seasonalColor(p.season);
  const canopyMesh = copyToPoints(treePoints, trees.map((tree) => tree.foliage), placement);
  const shrubMesh = copyToPoints(shrubPoints, shrubPrototype(), placement);
  const groundMesh = copyToPoints(groundPoints, groundCoverPrototype(), placement);

  const layerCounts = Object.fromEntries(compiled.layers.map((layer) => [layer.definition.id, pointCount(layer.points)]));
  const parts: NamedPart[] = [
    {
      name: "ecosystem_terrain",
      label: "生态地形",
      mesh: terrain.mesh,
      color: [0.2, 0.27, 0.12],
      surface: { type: "mossyStone", params: { color: [0.2, 0.27, 0.12], moss: 0.62, scale: 3.4 } },
      metadata: {
        generator: "ecosystem-art-tool",
        sourceVideo: SOURCE_VIDEO,
        workflow: "layer-table -> masks -> deterministic scatter -> chunked GPU buffers",
        maskModes: ["slope", "height", "noise", "curve-distance", "painted-clearance"],
        bakeMode: "chunked-instance-buffer",
        chunkCount: compiled.chunks.length,
        bufferGroupCount: compiled.instanceBuffers.length,
        totalInstances: compiled.totalInstances,
        layerCounts,
      },
    },
    {
      name: "ecosystem_path",
      label: "林地道路",
      mesh: roadRibbon(path, {
        halfWidth: p.pathWidth * 0.5,
        sampleDistance: 0.55,
        widthSubdivisions: 3,
        verticalOffset: 0.045,
        uvLengthScale: 2.2,
      }),
      color: PATH,
      surface: { type: "stone", params: { color: PATH, roughness: 0.98, scale: 2.4 } },
    },
    {
      name: "canopy_trunks",
      label: "乔木树干",
      mesh: copyToPoints(treePoints, trees.map((tree) => tree.wood), placement),
      color: BARK,
      surface: { type: "wood", params: { color: BARK, roughness: 0.94, grainScale: 2.1 } },
      metadata: { instanceCount: pointCount(treePoints), chunked: true },
    },
    {
      name: "canopy_foliage",
      label: "乔木树冠",
      mesh: canopyMesh,
      color: leafColor,
      surface: { type: "foliage", params: { color: leafColor, season: p.season, translucency: 0.34 } },
      windWeight: foliageWindWeights(canopyMesh, 0.42, 0.52),
      metadata: { instanceCount: pointCount(treePoints), chunked: true },
    },
    {
      name: "understory",
      label: "林下灌木",
      mesh: shrubMesh,
      color: SHRUB,
      surface: { type: "foliage", params: { color: SHRUB, translucency: 0.28 } },
      windWeight: foliageWindWeights(shrubMesh, 0.35, 0.42),
      metadata: { instanceCount: pointCount(shrubPoints), chunked: true },
    },
    {
      name: "ground_cover",
      label: "草本地被",
      mesh: transform(groundMesh, { translate: vec3(0, 0.025, 0) }),
      color: GRASS,
      surface: { type: "foliage", params: { color: GRASS, translucency: 0.22 } },
      windWeight: foliageWindWeights(groundMesh, 0.55, 0.4),
      metadata: { instanceCount: pointCount(groundPoints), chunked: true },
    },
    {
      name: "ecosystem_rocks",
      label: "生态岩石",
      mesh: copyToPoints(rockPoints, [rockPrototype(0), rockPrototype(1)], placement),
      color: ROCK,
      surface: { type: "mossyStone", params: { color: ROCK, moss: 0.52, scale: 1.8 } },
      metadata: { instanceCount: pointCount(rockPoints), chunked: true },
    },
  ];
  return parts;
}

export function summarizeEcosystemArtTool(parts: readonly NamedPart[]): EcosystemArtToolSummary {
  const metadata = parts.find((part) => part.name === "ecosystem_terrain")?.metadata ?? {};
  const layerCounts = isRecord(metadata.layerCounts) ? metadata.layerCounts : {};
  return {
    treeCount: numberValue(layerCounts.canopy),
    shrubCount: numberValue(layerCounts.understory),
    groundCoverCount: numberValue(layerCounts["ground-cover"]),
    rockCount: numberValue(layerCounts.rocks),
    chunkCount: numberValue(metadata.chunkCount),
    bufferGroupCount: numberValue(metadata.bufferGroupCount),
    totalInstances: numberValue(metadata.totalInstances),
    triangleCount: parts.reduce((sum, part) => sum + part.mesh.indices.length / 3, 0),
  };
}

function ecosystemDefinitions(
  p: EcosystemArtToolParams,
  path: ReturnType<typeof buildPath>,
  minHeight: number,
  maxHeight: number,
  clearPoint: ReturnType<typeof vec3>,
): EcosystemLayerDefinition[] {
  const common = (slopeMax: number, noiseFloor: number, seed: number, pathClearance: number): MaskField => ({
    type: "combine",
    op: "multiply",
    fields: [
      { type: "slope", maxDeg: slopeMax, featherDeg: 7 },
      {
        type: "remap",
        field: { type: "noise", frequency: 0.045 + p.clusterScale * 0.12, seed },
        inMin: 0.18 + noiseFloor * 0.35,
        inMax: 0.43 + noiseFloor * 0.35,
        outMin: 0,
        outMax: 1,
      },
      { type: "curve-distance", curve: path, min: pathClearance, feather: 1.1 },
      { type: "distance", targets: [clearPoint], min: p.paintGap, feather: Math.max(0.4, p.paintGap * 0.35) },
    ],
  });
  const density = p.density;
  const heightSpan = Math.max(1e-3, maxHeight - minHeight);
  return [
    {
      id: "canopy",
      label: "乔木层",
      candidates: Math.round(840 * density),
      density: 0.8,
      spacing: p.treeSpacing,
      mask: common(p.slopeMax, 0.24 + (1 - density) * 0.22, p.seed + 11, p.pathWidth * 0.5 + 1.1),
      materialId: "foliage-canopy",
      assets: [
        { id: "broadleaf-a", label: "阔叶乔木 A", weight: 0.46, scale: [0.78, 1.18] },
        { id: "broadleaf-b", label: "阔叶乔木 B", weight: 0.34, scale: [0.86, 1.28] },
        { id: "conifer", label: "针叶乔木", weight: 0.2, scale: [0.82, 1.2] },
      ],
    },
    {
      id: "understory",
      label: "灌木层",
      candidates: Math.round(1300 * density),
      density: 0.78,
      spacing: Math.max(0.75, p.treeSpacing * 0.42),
      mask: common(p.slopeMax + 8, 0.14 + (1 - density) * 0.16, p.seed + 21, p.pathWidth * 0.5 + 0.35),
      materialId: "foliage-understory",
      assets: [
        { id: "shrub-round", label: "圆簇灌木", weight: 0.66, scale: [0.55, 1.1] },
        { id: "shrub-low", label: "低矮灌木", weight: 0.34, scale: [0.42, 0.84] },
      ],
    },
    {
      id: "ground-cover",
      label: "草本层",
      candidates: Math.round(1900 * density),
      density: 0.72,
      spacing: Math.max(0.34, p.treeSpacing * 0.16),
      mask: {
        type: "combine",
        op: "multiply",
        fields: [
          common(p.slopeMax + 12, 0.08, p.seed + 31, p.pathWidth * 0.5 + 0.12),
          { type: "height", min: minHeight - heightSpan * 0.05, max: maxHeight - heightSpan * 0.08, feather: heightSpan * 0.12 },
        ],
      },
      materialId: "foliage-ground",
      assets: [
        { id: "grass-clump", label: "草簇", weight: 0.76, scale: [0.45, 1.05] },
        { id: "fern-clump", label: "蕨类", weight: 0.24, scale: [0.55, 0.95] },
      ],
    },
    {
      id: "rocks",
      label: "岩石层",
      candidates: Math.round(210 * density),
      density: 0.74,
      spacing: Math.max(2.2, p.treeSpacing * 0.85),
      mask: common(Math.min(68, p.slopeMax + 20), 0.32, p.seed + 41, p.pathWidth * 0.5 + 0.5),
      materialId: "stone-moss",
      assets: [
        { id: "rock-flat", label: "扁岩", weight: 0.58, scale: [0.55, 1.25] },
        { id: "rock-tall", label: "立岩", weight: 0.42, scale: [0.48, 1.08] },
      ],
    },
  ];
}

function buildPath(height: Field2D, size: number) {
  const half = size * 0.5;
  const curve = smoothCurve(polyline([
    vec3(-half, 0, -half * 0.34),
    vec3(-half * 0.54, 0, -half * 0.08),
    vec3(-half * 0.1, 0, half * 0.06),
    vec3(half * 0.36, 0, -half * 0.04),
    vec3(half, 0, half * 0.42),
  ]), 7);
  return {
    closed: false,
    points: curve.points.map((point) => vec3(point.x, sampleHeight(height, size, point.x, point.z), point.z)),
  };
}

function sampleHeight(height: Field2D, size: number, x: number, z: number): number {
  const half = size * 0.5;
  const gx = ((x + half) / size) * (height.width - 1);
  const gy = ((z + half) / size) * (height.height - 1);
  return sampleField2DBilinear(height, gx, gy);
}

function treePrototypes(): Array<{ wood: Mesh; foliage: Mesh }> {
  return [broadleafPrototype(5.4, 1), broadleafPrototype(6.4, 1.08), coniferPrototype(7.2)];
}

function broadleafPrototype(height: number, width: number): { wood: Mesh; foliage: Mesh } {
  const trunkRadius = height * 0.04;
  const wood = translateMesh(cylinder(trunkRadius, height * 0.78, 7, true), vec3(0, height * 0.39, 0));
  const radius = height * 0.24 * width;
  const blob = (x: number, y: number, z: number, scale: ReturnType<typeof vec3>) =>
    translateMesh(scaleMesh(icosphere(radius, 1), scale), vec3(x, y, z));
  return {
    wood,
    foliage: merge(
      blob(0, height * 0.76, 0, vec3(1.18, 0.9, 1.06)),
      blob(-radius * 0.68, height * 0.72, 0.08, vec3(0.82, 0.74, 0.86)),
      blob(radius * 0.65, height * 0.73, -0.08, vec3(0.86, 0.78, 0.82)),
      blob(0.05, height * 0.91, 0.02, vec3(0.78, 0.68, 0.74)),
    ),
  };
}

function coniferPrototype(height: number): { wood: Mesh; foliage: Mesh } {
  const wood = translateMesh(cylinder(height * 0.027, height, 7, true), vec3(0, height * 0.5, 0));
  return {
    wood,
    foliage: merge(
      translateMesh(cone(height * 0.25, height * 0.42, 9, true), vec3(0, height * 0.34, 0)),
      translateMesh(cone(height * 0.2, height * 0.38, 9, true), vec3(0, height * 0.57, 0)),
      translateMesh(cone(height * 0.14, height * 0.32, 8, true), vec3(0, height * 0.78, 0)),
    ),
  };
}

function shrubPrototype(): Mesh[] {
  const unit = icosphere(0.55, 1);
  const round = merge(
    translateMesh(scaleMesh(unit, vec3(1.1, 0.76, 1)), vec3(0, 0.48, 0)),
    translateMesh(scaleMesh(unit, vec3(0.72, 0.68, 0.76)), vec3(-0.4, 0.38, 0.08)),
    translateMesh(scaleMesh(unit, vec3(0.7, 0.64, 0.72)), vec3(0.4, 0.36, -0.06)),
  );
  const low = scaleMesh(round, vec3(1.18, 0.68, 1.08));
  return [round, low];
}

function groundCoverPrototype(): Mesh[] {
  const blade = transform(cone(0.085, 0.62, 4, true), { translate: vec3(0, 0.31, 0) });
  const grass = merge(
    blade,
    transform(blade, { rotate: vec3(0.18, 0.9, -0.22), translate: vec3(0.12, 0, 0.03) }),
    transform(blade, { rotate: vec3(-0.15, -0.75, 0.2), translate: vec3(-0.11, 0, -0.04) }),
  );
  const fern = merge(
    scaleMesh(grass, vec3(1.35, 0.72, 1.35)),
    transform(scaleMesh(grass, vec3(1.1, 0.65, 1.1)), { rotate: vec3(0, Math.PI * 0.5, 0) }),
  );
  return [grass, fern];
}

function rockPrototype(variant: number): Mesh {
  return transform(icosphere(0.86, 1), {
    scale: variant === 0 ? vec3(1.2, 0.56, 0.88) : vec3(0.78, 1.02, 1.16),
    rotate: variant === 0 ? vec3(0.08, 0.2, -0.12) : vec3(-0.14, -0.28, 0.1),
    translate: vec3(0, variant === 0 ? 0.4 : 0.62, 0),
  });
}

function resolveParams(params: Partial<EcosystemArtToolParams>): EcosystemArtToolParams {
  const p = { ...ECOSYSTEM_ART_TOOL_DEFAULTS, ...params };
  return {
    size: clamp(p.size, 20, 100),
    resolution: Math.round(clamp(p.resolution, 24, 128)),
    relief: clamp(p.relief, 0.5, 16),
    density: clamp(p.density, 0.05, 1),
    slopeMax: clamp(p.slopeMax, 12, 70),
    treeSpacing: clamp(p.treeSpacing, 1.4, 8),
    pathWidth: clamp(p.pathWidth, 0.5, 8),
    clusterScale: clamp(p.clusterScale, 0, 1),
    paintGap: clamp(p.paintGap, 0, 12),
    chunkSize: clamp(p.chunkSize, 4, 40),
    season: clamp(p.season, 0, 1),
    seed: Math.round(p.seed) >>> 0,
  };
}

function validateLayer(layer: EcosystemLayerDefinition): void {
  if (!layer.id.trim()) throw new Error("ecosystem layer id must not be empty");
  if (layer.assets.length === 0) throw new Error(`ecosystem layer "${layer.id}" needs assets`);
  if (layer.density < 0 || layer.density > 1) throw new Error(`ecosystem layer "${layer.id}" density must be within [0,1]`);
  if (!Number.isFinite(layer.spacing) || layer.spacing <= 0) throw new Error(`ecosystem layer "${layer.id}" spacing must be > 0`);
  if (layer.assets.some((asset) => asset.weight < 0)) throw new Error(`ecosystem layer "${layer.id}" asset weight must be >= 0`);
}

function chunkId(x: number, z: number, chunkSize: number): string {
  return `chunk_${Math.floor(x / chunkSize)}_${Math.floor(z / chunkSize)}`;
}

function seasonalColor(season: number): RGB {
  const summer: RGB = [0.12, 0.36, 0.11];
  const autumn: RGB = [0.64, 0.31, 0.06];
  const t = clamp((season - 0.35) / 0.65, 0, 1);
  return [
    summer[0] + (autumn[0] - summer[0]) * t,
    summer[1] + (autumn[1] - summer[1]) * t,
    summer[2] + (autumn[2] - summer[2]) * t,
  ];
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
