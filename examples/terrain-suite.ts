/**
 * Terrain suite generated from Meshova's Gaea-lite heightfield pipeline.
 *
 * Run:
 *   pnpm tsx examples/terrain-suite.ts
 */
import {
  alpineTerrainRecipe,
  field2DStats,
  generateField2D,
  mutateTerrain,
  plane,
  runTerrainRecipe,
  terrainFieldSetStats,
  toOBJScene,
  toViewerModel,
  transform,
  vec3,
  type NamedPart,
  type TerrainRecipe,
  type TerrainRecipeContext,
  type TerrainRecipeMaskSource,
  type ViewerModel,
} from "../src/index.js";

interface TerrainSuiteSpec {
  id: string;
  name: string;
  description: string;
  recipe: TerrainRecipe;
  baseColor: [number, number, number];
  surface: "mossyStone" | "stone" | "sand";
  waterLevel?: number;
  waterBody?: "river" | "pond" | "ocean";
}

interface Manifest {
  models: Array<{ id: string; name: string; file: string; category?: string }>;
}

const WATER: [number, number, number] = [0.2, 0.48, 0.68];

const suite: TerrainSuiteSpec[] = [
  {
    id: "terrain-alpine-spines",
    name: "地形：高山脊线",
    description: "高 relief、尖锐 ridge、双阶段侵蚀，适合雪线山脉和远景屏障。",
    baseColor: [0.42, 0.43, 0.39],
    surface: "mossyStone",
    recipe: pickAlpineMutation(),
  },
  {
    id: "terrain-volcanic-caldera",
    name: "地形：火山破口岛",
    description: "中心塌陷 caldera、环形火山缘、外侧海蚀坡。",
    baseColor: [0.33, 0.31, 0.28],
    surface: "stone",
    waterLevel: 0.16,
    waterBody: "ocean",
    recipe: {
      name: "volcanic-caldera",
      seed: 8203,
      primitive: {
        resolution: 128,
        height: 1.9,
        noiseScale: 0.82,
        ridgeScale: 2.2,
        ridgeStrength: 0.52,
        islandFalloff: 1.95,
        terraceStrength: 0.05,
      },
      layers: [
        {
          mode: "subtract",
          opacity: 0.74,
          height: 1.15,
          noiseScale: 0.5,
          ridgeScale: 1.2,
          ridgeStrength: 0.12,
          islandFalloff: 2.6,
          mask: centerMask(0.36, 0.16),
        },
        {
          mode: "add",
          opacity: 0.56,
          height: 0.58,
          noiseScale: 1.15,
          ridgeScale: 2.8,
          ridgeStrength: 0.42,
          islandFalloff: 1.4,
          mask: ringMask(0.31, 0.58, 0.08),
        },
      ],
      erosion: [
        { iterations: 16, hydraulicStrength: 0.014, thermalStrength: 0.07, talus: 0.04, rain: ringMask(0.36, 0.95, 0.12) },
        { iterations: 6, hydraulicStrength: 0.007, thermalStrength: 0.09, talus: 0.025 },
      ],
      masks: { size: 11, waterLevel: 0.16, shoreWidth: 0.07 },
      mesh: { size: 11 },
    },
  },
  {
    id: "terrain-mesa-canyon",
    name: "地形：台地峡谷",
    description: "强 terrace、蛇形下切峡谷、热侵蚀削坡，适合沙漠关卡。",
    baseColor: [0.61, 0.47, 0.29],
    surface: "sand",
    recipe: {
      name: "mesa-canyon",
      seed: 11491,
      primitive: {
        resolution: 128,
        height: 1.55,
        base: 0.08,
        noiseScale: 0.78,
        ridgeScale: 1.75,
        ridgeStrength: 0.28,
        islandFalloff: 0,
        terraceStrength: 0.76,
        terraceSteps: 8,
      },
      layers: [
        {
          mode: "subtract",
          opacity: 0.9,
          height: 0.74,
          noiseScale: 1.1,
          ridgeScale: 1.9,
          ridgeStrength: 0.2,
          islandFalloff: 0,
          mask: meanderMask({ width: 0.105, frequency: 2.3, amplitude: 0.34, phase: 0.9 }),
        },
        {
          mode: "add",
          opacity: 0.21,
          height: 0.28,
          noiseScale: 5.6,
          ridgeScale: 8.4,
          ridgeStrength: 0.36,
          islandFalloff: 0,
        },
      ],
      erosion: [
        { iterations: 14, hydraulicStrength: 0.012, thermalStrength: 0.08, talus: 0.035, rain: meanderMask({ width: 0.18, frequency: 2.3, amplitude: 0.34, phase: 0.9 }) },
        { iterations: 12, hydraulicStrength: 0.004, thermalStrength: 0.11, talus: 0.025, rain: 0.32 },
      ],
      masks: { size: 12, waterLevel: -0.2, shoreWidth: 0.02, slopeScale: 1.45 },
      mesh: { size: 12 },
    },
  },
  {
    id: "terrain-delta-wetlands",
    name: "地形：湿地三角洲",
    description: "低 relief、扇形水网、沉积平原，适合河口/沼泽生态位。",
    baseColor: [0.25, 0.38, 0.2],
    surface: "mossyStone",
    waterLevel: 0.08,
    waterBody: "river",
    recipe: {
      name: "delta-wetlands",
      seed: 50317,
      primitive: {
        resolution: 128,
        height: 0.82,
        base: 0.02,
        noiseScale: 1.4,
        ridgeScale: 3.2,
        ridgeStrength: 0.16,
        islandFalloff: 0.65,
        terraceStrength: 0.02,
      },
      layers: [
        {
          mode: "subtract",
          opacity: 0.58,
          height: 0.42,
          noiseScale: 2.6,
          ridgeScale: 4.2,
          ridgeStrength: 0.08,
          islandFalloff: 0.4,
          mask: deltaChannelsMask(),
        },
        {
          mode: "add",
          opacity: 0.24,
          height: 0.16,
          noiseScale: 7.5,
          ridgeScale: 9.5,
          ridgeStrength: 0.16,
          islandFalloff: 0.7,
        },
      ],
      erosion: { iterations: 22, hydraulicStrength: 0.017, thermalStrength: 0.025, talus: 0.02, rain: deltaChannelsMask(), depositionRate: 0.72 },
      masks: { size: 12, waterLevel: 0.08, shoreWidth: 0.08, slopeScale: 0.9 },
      mesh: { size: 12 },
    },
  },
  {
    id: "terrain-arid-badlands",
    name: "地形：干旱恶地",
    description: "高频 gullies、弱降雨强搬运、裸岩沟壑，适合荒原与硬科幻场景。",
    baseColor: [0.48, 0.38, 0.3],
    surface: "stone",
    recipe: {
      name: "arid-badlands",
      seed: 35029,
      primitive: {
        resolution: 128,
        height: 1.82,
        base: 0.03,
        noiseScale: 1.05,
        ridgeScale: 5.2,
        ridgeStrength: 0.78,
        islandFalloff: 0.18,
        terraceStrength: 0.28,
        terraceSteps: 13,
      },
      layers: [
        {
          mode: "subtract",
          opacity: 0.34,
          height: 0.34,
          noiseScale: 7.3,
          ridgeScale: 12.0,
          ridgeStrength: 0.55,
          islandFalloff: 0.12,
          mask: slopeBiasedMask(),
        },
      ],
      erosion: [
        { iterations: 14, hydraulicStrength: 0.008, thermalStrength: 0.07, talus: 0.026, rain: slopeBiasedMask(), depositionRate: 0.42 },
        { iterations: 6, hydraulicStrength: 0.003, thermalStrength: 0.08, talus: 0.02, rain: 0.2 },
      ],
      masks: { size: 12, waterLevel: -0.25, shoreWidth: 0.02, slopeScale: 1.7 },
      mesh: { size: 12 },
    },
  },
];

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

const summary = [];
for (const spec of suite) {
  const result = runTerrainRecipe(spec.recipe);
  const parts = terrainParts(spec, result);
  const { obj, mtl } = toOBJScene(parts, `${spec.id}.mtl`);
  const model = toViewerModel(parts, spec.id);
  enrichModelMeta(model, spec, result);

  fs.writeFileSync(path.join(outDir, `${spec.id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${spec.id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${spec.id}.json`), JSON.stringify(model, null, 2));

  const heightStats = field2DStats(result.fieldSet.fields.height);
  const slopeStats = field2DStats(result.fieldSet.fields.slope);
  const flowStats = field2DStats(result.fieldSet.fields.flow);
  const waterStats = field2DStats(result.fieldSet.fields.water);
  summary.push({
    id: spec.id,
    name: spec.name,
    description: spec.description,
    verts: model.meta.verts,
    tris: model.meta.tris,
    elevationRange: round(heightStats.max - heightStats.min),
    meanSlope: round(slopeStats.mean),
    maxFlow: round(flowStats.max),
    waterCoverage: round(waterStats.mean),
  });
}

writeManifest(suite);
fs.writeFileSync(path.join(outDir, "terrain-suite-summary.json"), JSON.stringify(summary, null, 2));

for (const item of summary) {
  console.log(`${item.id}: ${item.verts} verts, ${item.tris} tris, relief=${item.elevationRange}, slope=${item.meanSlope}, water=${item.waterCoverage}`);
}
console.log("written: out/terrain-{alpine-spines,volcanic-caldera,mesa-canyon,delta-wetlands,arid-badlands}.{obj,mtl,json}");
console.log("written: out/terrain-suite-summary.json + out/models.json");

function terrainParts(
  spec: TerrainSuiteSpec,
  result: ReturnType<typeof runTerrainRecipe>,
): NamedPart[] {
  const stats = terrainFieldSetStats(result.fieldSet);
  const terrain: NamedPart = {
    name: "terrain_heightfield",
    label: "地形高度场",
    mesh: result.mesh,
    color: spec.baseColor,
    colors: result.colors,
    surface: {
      type: spec.surface,
      params: { color: spec.baseColor, seed: spec.recipe.seed ?? 1 },
    },
    metadata: {
      terrainRecipe: spec.recipe.name ?? spec.id,
      description: spec.description,
      fieldStats: compactStats(stats),
    },
  };
  const parts: NamedPart[] = [terrain];
  if (spec.waterLevel !== undefined) {
    const size = spec.recipe.mesh?.size ?? spec.recipe.masks?.size ?? 10;
    parts.push({
      name: "water_level",
      label: "水位面",
      mesh: transform(plane(size * 1.03, size * 1.03, 24, 24), {
        translate: vec3(0, spec.waterLevel + 0.012, 0),
      }),
      color: WATER,
      surface: { type: "water", params: { body: spec.waterBody ?? "pond", tint: WATER, seed: (spec.recipe.seed ?? 1) + 17 } },
      metadata: { waterLevel: spec.waterLevel },
    });
  }
  return parts;
}

function enrichModelMeta(
  model: ViewerModel,
  spec: TerrainSuiteSpec,
  result: ReturnType<typeof runTerrainRecipe>,
): void {
  const stats = terrainFieldSetStats(result.fieldSet);
  model.meta.recipe = spec.recipe.name ?? spec.id;
  model.meta.description = spec.description;
  model.meta.elevationRange = round(stats.height.max - stats.height.min);
  model.meta.meanSlope = round(stats.slope.mean);
  model.meta.maxFlow = round(stats.flow.max);
  model.meta.waterCoverage = round(stats.water.mean);
}

function writeManifest(specs: TerrainSuiteSpec[]): void {
  const manifestPath = path.join(outDir, "models.json");
  let manifest: Manifest = { models: [] };
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;
    } catch {
      manifest = { models: [] };
    }
  }
  const ids = new Set(specs.map((spec) => spec.id));
  manifest.models = manifest.models.filter((model) => !ids.has(model.id));
  for (const spec of specs) {
    manifest.models.push({ id: spec.id, name: spec.name, file: `${spec.id}.json`, category: "地形" });
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

function pickAlpineMutation(): TerrainRecipe {
  const base = alpineTerrainRecipe(6101);
  const candidates = mutateTerrain(base, { count: 8, seed: 8821, amount: 0.22 });
  const best = candidates
    .slice()
    .sort((a, b) => {
      const as = a.metrics.elevationRange * 0.52 + a.metrics.meanSlope * 2.6 + a.metrics.maxFlow * 0.16;
      const bs = b.metrics.elevationRange * 0.52 + b.metrics.meanSlope * 2.6 + b.metrics.maxFlow * 0.16;
      return bs - as;
    })[0];
  if (!best) return { ...base, name: "alpine-spines" };
  return {
    ...best.recipe,
    name: "alpine-spines",
    masks: { ...best.recipe.masks, waterLevel: -0.15, shoreWidth: 0.02 },
  };
}

function centerMask(radius: number, softness: number): TerrainRecipeMaskSource {
  return ({ height }: TerrainRecipeContext) => generateField2D(height.width, height.height, (u, v) => {
    const r = Math.hypot(u * 2 - 1, v * 2 - 1);
    return 1 - smoothstep(radius - softness, radius + softness, r);
  });
}

function ringMask(inner: number, outer: number, softness: number): TerrainRecipeMaskSource {
  return ({ height }: TerrainRecipeContext) => generateField2D(height.width, height.height, (u, v) => {
    const r = Math.hypot(u * 2 - 1, v * 2 - 1);
    const a = smoothstep(inner - softness, inner + softness, r);
    const b = 1 - smoothstep(outer - softness, outer + softness, r);
    return clamp01(a * b);
  });
}

function meanderMask(options: {
  width: number;
  frequency: number;
  amplitude: number;
  phase: number;
}): TerrainRecipeMaskSource {
  return ({ height }: TerrainRecipeContext) => generateField2D(height.width, height.height, (u, v) => {
    const y = v * 2 - 1;
    const x = u * 2 - 1;
    const center = Math.sin(y * Math.PI * options.frequency + options.phase) * options.amplitude
      + Math.sin(y * Math.PI * (options.frequency * 1.8) - options.phase * 0.6) * options.amplitude * 0.24;
    const d = Math.abs(x - center);
    return 1 - smoothstep(options.width * 0.35, options.width, d);
  });
}

function deltaChannelsMask(): TerrainRecipeMaskSource {
  return ({ height }: TerrainRecipeContext) => generateField2D(height.width, height.height, (u, v) => {
    const x = u * 2 - 1;
    const y = v * 2 - 1;
    const downstream = smoothstep(0.15, -0.95, y);
    let m = 0;
    for (const branch of [-0.46, -0.22, 0.02, 0.27, 0.5]) {
      const spread = branch * downstream;
      const wiggle = Math.sin((y + branch) * 8.0) * 0.045;
      const d = Math.abs(x - spread - wiggle);
      m = Math.max(m, 1 - smoothstep(0.035, 0.12, d));
    }
    const trunk = 1 - smoothstep(0.05, 0.18, Math.abs(x + Math.sin(y * 5.5) * 0.07));
    return clamp01(Math.max(m * downstream, trunk * smoothstep(0.9, -0.2, y)));
  });
}

function slopeBiasedMask(): TerrainRecipeMaskSource {
  return ({ height, fieldSet }: TerrainRecipeContext) => generateField2D(height.width, height.height, (_u, _v, x, y) => {
    const i = y * height.width + x;
    return Math.pow(clamp01(fieldSet.fields.slope.data[i]!), 0.7);
  });
}

function compactStats(stats: ReturnType<typeof terrainFieldSetStats>): Record<string, { min: number; max: number; mean: number }> {
  return Object.fromEntries(
    Object.entries(stats).map(([key, value]) => [
      key,
      { min: round(value.min), max: round(value.max), mean: round(value.mean) },
    ]),
  );
}

function smoothstep(a: number, b: number, x: number): number {
  if (a === b) return x < a ? 0 : 1;
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function round(v: number): number {
  return Math.round(v * 10000) / 10000;
}
