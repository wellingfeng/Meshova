/**
 * Wallacei-style optimization showcase.
 *
 * Runs deterministic parameter search for several production-facing procedural
 * props, exports the selected phenotype, and archives every run so the chosen
 * genome can be reconstructed later.
 *
 * Run: pnpm tsx examples/optimization-showcase.ts
 */
import {
  archiveOptimizationRun,
  bounds,
  buildBusStopParts,
  buildFreewaySignParts,
  buildStreetLampParts,
  buildWaterTowerParts,
  merge,
  runRandomSearch,
  schemaToGenes,
  selectCandidates,
  toOBJScene,
  toViewerModel,
  triangleCount,
  type GeneValue,
  type NamedPart,
  type OptimizationCandidate,
  type ParamSchemaLike,
} from "../src/index.js";

const fs = await import("node:fs");
const path = await import("node:path");

type Params = Record<string, GeneValue>;
type Metrics = {
  parts: number;
  vertices: number;
  triangles: number;
  width: number;
  height: number;
  depth: number;
};

interface ShowcaseConfig {
  id: string;
  name: string;
  seed: number;
  schema: ParamSchemaLike[];
  build(params: Params): NamedPart[];
  fitness(params: Params, metrics: Metrics): number;
  invalid?(params: Params, metrics: Metrics): string | null;
}

const outDir = path.resolve(process.cwd(), "out");
const archiveDir = path.join(outDir, "optimization-runs");
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(archiveDir, { recursive: true });

function num(params: Params, key: string): number {
  return Number(params[key]);
}

function bool(params: Params, key: string): boolean {
  return params[key] === true || params[key] === "true" || Number(params[key]) === 1;
}

function str(params: Params, key: string): string {
  return String(params[key]);
}

function measure(parts: NamedPart[]): Metrics {
  const meshes = parts.map((part) => part.mesh);
  if (!meshes.length) return { parts: 0, vertices: 0, triangles: 0, width: 0, height: 0, depth: 0 };
  const merged = merge(...meshes);
  const b = bounds(merged);
  return {
    parts: parts.length,
    vertices: merged.positions.length,
    triangles: meshes.reduce((sum, mesh) => sum + triangleCount(mesh), 0),
    width: b.max.x - b.min.x,
    height: b.max.y - b.min.y,
    depth: b.max.z - b.min.z,
  };
}

function readManifest(): { models: Array<{ id: string; name: string; file: string }> } {
  const manifestPath = path.join(outDir, "models.json");
  if (!fs.existsSync(manifestPath)) return { models: [] };
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { models: Array<{ id: string; name: string; file: string }> };
  } catch {
    return { models: [] };
  }
}

function writeManifest(manifest: { models: Array<{ id: string; name: string; file: string }> }): void {
  fs.writeFileSync(path.join(outDir, "models.json"), JSON.stringify(manifest, null, 2));
}

function register(manifest: { models: Array<{ id: string; name: string; file: string }> }, id: string, name: string): void {
  manifest.models = manifest.models.filter((model) => model.id !== id);
  manifest.models.push({ id, name, file: `${id}.json` });
}

function emitModel(id: string, name: string, parts: NamedPart[], candidate: OptimizationCandidate): void {
  const { obj, mtl } = toOBJScene(parts, `${id}.mtl`);
  const model = toViewerModel(parts, id);
  model.meta.optimization = {
    candidateId: candidate.id,
    generation: candidate.generation,
    rank: candidate.rank,
    score: candidate.score,
    genome: candidate.genome,
    fitness: candidate.fitness,
  };
  fs.writeFileSync(path.join(outDir, `${id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(model, null, 2));
  console.log(`${id}: ${name} · ${model.meta.parts} parts · ${model.meta.verts} verts · ${model.meta.tris} tris`);
}

const configs: ShowcaseConfig[] = [
  {
    id: "opt-water-tower",
    name: "优化候选：屋顶水塔",
    seed: 31,
    schema: [
      { key: "radius", label: "罐体半径", min: 1.0, max: 2.2, step: 0.05, default: 1.6 },
      { key: "tankHeight", label: "罐体高度", min: 2.0, max: 4.4, step: 0.1, default: 3.2 },
      { key: "staves", label: "木板数", min: 10, max: 36, step: 1, default: 24 },
      { key: "hoops", label: "钢箍数", min: 2, max: 7, step: 1, default: 4 },
      { key: "legHeight", label: "支架高度", min: 1.2, max: 4.2, step: 0.1, default: 2.4 },
      { key: "roofPitch", label: "屋顶坡度", min: 0.25, max: 0.9, step: 0.05, default: 0.55 },
      { key: "ladder", label: "爬梯", values: [true, false], default: true },
      { key: "seed", label: "种子", min: 0, max: 99, step: 1, default: 9 },
    ],
    build: (p) => buildWaterTowerParts({
      radius: num(p, "radius"),
      tankHeight: num(p, "tankHeight"),
      staves: num(p, "staves"),
      hoops: num(p, "hoops"),
      legHeight: num(p, "legHeight"),
      roofPitch: num(p, "roofPitch"),
      ladder: bool(p, "ladder"),
      seed: num(p, "seed"),
    }),
    invalid: (p, m) => {
      if (m.triangles <= 0) return "empty mesh";
      if (num(p, "tankHeight") < num(p, "radius") * 1.2) return "tank too squat";
      return null;
    },
    fitness: (p, m) => m.height * 0.55 + (m.height / Math.max(0.1, m.width)) * 1.2 + num(p, "hoops") * 0.12 + (bool(p, "ladder") ? 1.0 : 0),
  },
  {
    id: "opt-freeway-sign",
    name: "优化候选：高速龙门牌",
    seed: 43,
    schema: [
      { key: "span", label: "跨距", min: 8, max: 20, step: 0.5, default: 12 },
      { key: "postHeight", label: "立柱高", min: 4.8, max: 8.2, step: 0.1, default: 6.2 },
      { key: "signCount", label: "牌面数", min: 1, max: 4, step: 1, default: 2 },
      { key: "signHeight", label: "牌面高", min: 1.4, max: 3.2, step: 0.1, default: 2.2 },
      { key: "truss", label: "桁架", values: [true, false], default: true },
      { key: "lights", label: "灯具", values: [true, false], default: true },
      { key: "seed", label: "种子", min: 0, max: 99, step: 1, default: 5 },
    ],
    build: (p) => buildFreewaySignParts({
      span: num(p, "span"),
      postHeight: num(p, "postHeight"),
      signCount: num(p, "signCount"),
      signHeight: num(p, "signHeight"),
      truss: bool(p, "truss"),
      lights: bool(p, "lights"),
      legends: ["DOWNTOWN", "AIRPORT", "HARBOR", "CENTRAL"],
      exitNumber: "42",
      seed: num(p, "seed"),
    }),
    invalid: (p, m) => {
      if (m.triangles <= 0) return "empty mesh";
      if (num(p, "span") / Math.max(1, num(p, "signCount")) < 3.2) return "panels too narrow";
      return null;
    },
    fitness: (p, m) => num(p, "span") * 0.25 + num(p, "signCount") * 1.25 + num(p, "signHeight") * 0.9 + (bool(p, "truss") ? 0.35 : 0) + (bool(p, "lights") ? 0.25 : 0) - Math.abs(m.height - 7.2) * 0.25,
  },
  {
    id: "opt-bus-stop",
    name: "优化候选：公交站亭",
    seed: 59,
    schema: [
      { key: "length", label: "长度", min: 3.0, max: 6.5, step: 0.1, default: 4.2 },
      { key: "depth", label: "进深", min: 1.1, max: 2.4, step: 0.1, default: 1.5 },
      { key: "height", label: "高度", min: 2.0, max: 3.2, step: 0.1, default: 2.4 },
      { key: "bench", label: "座椅", values: [true, false], default: true },
      { key: "adPanel", label: "广告灯箱", values: [true, false], default: true },
    ],
    build: (p) => buildBusStopParts({
      length: num(p, "length"),
      depth: num(p, "depth"),
      height: num(p, "height"),
      bench: bool(p, "bench"),
      adPanel: bool(p, "adPanel"),
    }),
    invalid: (p, m) => {
      if (m.triangles <= 0) return "empty mesh";
      if (num(p, "length") / Math.max(0.1, num(p, "depth")) < 2.0) return "shelter too boxy";
      return null;
    },
    fitness: (p, m) => num(p, "length") * 0.55 + num(p, "depth") * 0.45 + (bool(p, "bench") ? 0.8 : 0) + (bool(p, "adPanel") ? 0.6 : 0) - Math.abs(m.height - 2.9) * 0.2,
  },
  {
    id: "opt-street-lamp",
    name: "优化候选：街道路灯",
    seed: 71,
    schema: [
      { key: "height", label: "灯杆高", min: 3.5, max: 8.5, step: 0.1, default: 6.5 },
      { key: "style", label: "样式", values: ["cobra", "ornamental", "double"], default: "cobra" },
      { key: "armReach", label: "灯臂伸出", min: 0.8, max: 3.4, step: 0.1, default: 2.2 },
      { key: "base", label: "灯座", values: [true, false], default: true },
    ],
    build: (p) => buildStreetLampParts({
      height: num(p, "height"),
      style: str(p, "style") as "cobra" | "ornamental" | "double",
      armReach: num(p, "armReach"),
      base: bool(p, "base"),
      color: [0.2, 0.21, 0.23],
    }),
    invalid: (p, m) => {
      if (m.triangles <= 0) return "empty mesh";
      if (str(p, "style") !== "ornamental" && num(p, "armReach") > num(p, "height") * 0.48) return "arm reach too long";
      return null;
    },
    fitness: (p, m) => m.height * 0.5 + (str(p, "style") === "double" ? 1.2 : 0) + (bool(p, "base") ? 0.25 : 0) + num(p, "armReach") * 0.35,
  },
];

const manifest = readManifest();
const summary: Array<Record<string, unknown>> = [];

for (const config of configs) {
  const genes = schemaToGenes(config.schema);
  const run = await runRandomSearch({
    id: `${config.id}-run`,
    seed: config.seed,
    schemaVersion: "optimization-showcase@1",
    genes,
    objectives: [
      { key: "assetFit", label: "资产适配", direction: "maximize", weight: 0.75 },
      { key: "triangles", label: "三角面", direction: "minimize", weight: 0.25 },
    ],
    populationSize: 10,
    generations: 3,
    eliteCount: 4,
    mutationRate: 0.38,
    mutationStrength: 0.24,
    includeDefault: true,
    clusterCount: 3,
    metadata: { modelId: config.id, name: config.name },
    evaluate: (genome) => {
      const params = { ...genome };
      const parts = config.build(params);
      const metrics = measure(parts);
      const invalidReason = config.invalid?.(params, metrics) ?? null;
      if (invalidReason) {
        return { valid: false, invalidReason, metrics };
      }
      return {
        fitness: {
          assetFit: config.fitness(params, metrics),
          triangles: metrics.triangles,
        },
        metrics,
      };
    },
  });

  const candidate = selectCandidates(run, { mode: "per-objective", objectiveKey: "assetFit", count: 1 })[0] ?? run.best;
  if (!candidate) throw new Error(`${config.id} produced no valid candidate`);
  const parts = config.build(candidate.genome);
  emitModel(config.id, config.name, parts, candidate);
  register(manifest, config.id, config.name);

  const archive = archiveOptimizationRun(run);
  fs.writeFileSync(path.join(archiveDir, `${config.id}.json`), JSON.stringify(archive, null, 2));
  summary.push({
    id: config.id,
    name: config.name,
    candidateId: candidate.id,
    genome: candidate.genome,
    fitness: candidate.fitness,
    invalidCandidates: run.candidates.filter((item) => !item.valid).length,
    candidates: run.candidates.length,
    pareto: run.paretoFront.length,
  });
}

writeManifest(manifest);
fs.writeFileSync(path.join(archiveDir, "showcase-summary.json"), JSON.stringify(summary, null, 2));
console.log(`archives: ${path.relative(process.cwd(), archiveDir)}`);
