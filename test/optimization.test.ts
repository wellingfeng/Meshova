import { describe, expect, it } from "vitest";
import {
  archiveOptimizationRun,
  bestCandidate,
  clusterCandidates,
  defaultGenome,
  dominates,
  makeRng,
  mutateGenome,
  paretoFront,
  rankCandidates,
  restoreOptimizationRun,
  runRandomSearch,
  sampleGenome,
  schemaToGenes,
  selectCandidates,
  type FitnessValues,
  type OptimizationCandidate,
  type ObjectiveSpec,
} from "../src/index.js";

const objectives: ObjectiveSpec[] = [
  { key: "quality", direction: "maximize", weight: 0.75 },
  { key: "cost", direction: "minimize", weight: 0.25 },
];

function candidate(id: string, fitness: FitnessValues): OptimizationCandidate {
  return {
    id,
    index: Number(id.replace(/\D/g, "")) || 0,
    generation: 0,
    genome: {},
    fitness,
    metrics: {},
    rank: 0,
    score: 0,
    valid: true,
  };
}

describe("optimization genes", () => {
  it("converts ProcModel slider schema into deterministic genes", () => {
    const genes = schemaToGenes([
      { key: "height", label: "高度", min: 1, max: 5, step: 0.5, default: 2.2 },
      { key: "seed", label: "种子", min: 0, max: 99, step: 1, default: 7 },
      { key: "mode", values: ["a", "b"], default: "b" },
    ]);
    expect(genes[0]).toMatchObject({ key: "height", kind: "float", default: 2 });
    expect(genes[1]).toMatchObject({ key: "seed", kind: "int", default: 7 });
    expect(genes[2]).toMatchObject({ key: "mode", kind: "choice", default: "b" });
  });

  it("samples and mutates within bounds while preserving locked genes", () => {
    const genes = schemaToGenes([
      { key: "width", min: 0, max: 1, step: 0.1, default: 0.5 },
      { key: "seed", min: 3, max: 3, step: 1, default: 3, locked: true },
    ]);
    const rng = makeRng(5);
    for (let i = 0; i < 32; i++) {
      const genome = mutateGenome(sampleGenome(genes, rng), genes, rng, 1, 2);
      expect(genome.width).toBeGreaterThanOrEqual(0);
      expect(genome.width).toBeLessThanOrEqual(1);
      expect(genome.seed).toBe(3);
    }
    expect(defaultGenome(genes)).toEqual({ width: 0.5, seed: 3 });
  });
});

describe("pareto ranking", () => {
  it("detects domination and pareto front", () => {
    const a = candidate("c1", { quality: 10, cost: 5 });
    const b = candidate("c2", { quality: 8, cost: 6 });
    const c = candidate("c3", { quality: 6, cost: 1 });
    expect(dominates(a, b, objectives)).toBe(true);
    expect(dominates(a, c, objectives)).toBe(false);
    expect(paretoFront([a, b, c], objectives).map((x) => x.id)).toEqual(["c1", "c3"]);
  });

  it("ranks and selects best by rank then normalized score", () => {
    const ranked = rankCandidates([
      candidate("c1", { quality: 10, cost: 10 }),
      candidate("c2", { quality: 9, cost: 1 }),
      candidate("c3", { quality: 5, cost: 9 }),
    ], objectives);
    expect(ranked.find((x) => x.id === "c3")?.rank).toBeGreaterThan(0);
    expect(bestCandidate(ranked)?.id).toBe("c2");
  });

  it("clusters candidates deterministically", () => {
    const ranked = rankCandidates([
      candidate("c1", { quality: 10, cost: 1 }),
      candidate("c2", { quality: 9, cost: 2 }),
      candidate("c3", { quality: 1, cost: 10 }),
      candidate("c4", { quality: 2, cost: 9 }),
    ], objectives);
    const clusters = clusterCandidates(ranked, { count: 2 });
    expect(clusters).toHaveLength(2);
    expect(clusters.reduce((sum, cluster) => sum + cluster.candidates.length, 0)).toBe(4);
  });
});

describe("random search", () => {
  it("is deterministic for seed + evaluator", async () => {
    const genes = schemaToGenes([
      { key: "x", min: 0, max: 10, step: 1, default: 5 },
      { key: "y", min: 0, max: 10, step: 1, default: 5 },
    ]);
    const evaluate = (genome: Record<string, unknown>) => {
      const x = Number(genome.x);
      const y = Number(genome.y);
      return { fitness: { quality: -(Math.abs(x - 7) + Math.abs(y - 2)), cost: x + y } };
    };
    const a = await runRandomSearch({ seed: 42, genes, objectives, populationSize: 6, generations: 3, evaluate });
    const b = await runRandomSearch({ seed: 42, genes, objectives, populationSize: 6, generations: 3, evaluate });
    expect(a.candidates.map((x) => x.genome)).toEqual(b.candidates.map((x) => x.genome));
    expect(a.best?.genome).toEqual(b.best?.genome);
    expect(a.paretoFront.length).toBeGreaterThan(0);
  });

  it("penalizes invalid candidates without stopping the run", async () => {
    const genes = schemaToGenes([{ key: "x", min: 0, max: 3, step: 1, default: 0 }]);
    const run = await runRandomSearch({
      seed: 2,
      genes,
      objectives,
      populationSize: 4,
      includeDefault: false,
      evaluate: (genome) => {
        if (Number(genome.x) === 0) throw new Error("empty mesh");
        if (Number(genome.x) === 1) return { valid: false, invalidReason: "broken uv" };
        return { fitness: { quality: Number(genome.x), cost: Number(genome.x) } };
      },
    });
    expect(run.candidates).toHaveLength(4);
    expect(run.candidates.some((x) => !x.valid && x.invalidReason)).toBe(true);
    expect(run.best?.valid).toBe(true);
    expect(run.paretoFront.every((x) => x.valid)).toBe(true);
  });

  it("archives, restores, and selects candidates", async () => {
    const genes = schemaToGenes([
      { key: "x", min: 0, max: 10, step: 1, default: 5 },
      { key: "y", min: 0, max: 10, step: 1, default: 5 },
    ]);
    const run = await runRandomSearch({
      id: "archive-smoke",
      seed: 7,
      schemaVersion: "unit-test@1",
      genes,
      objectives,
      populationSize: 8,
      generations: 2,
      clusterCount: 2,
      metadata: { model: "unit" },
      evaluate: (genome) => ({
        fitness: {
          quality: 20 - Math.abs(Number(genome.x) - 7) - Math.abs(Number(genome.y) - 2),
          cost: Number(genome.x) + Number(genome.y),
        },
      }),
    });
    const archive = archiveOptimizationRun(run);
    const restored = restoreOptimizationRun(archive);
    expect(restored.id).toBe("archive-smoke");
    expect(restored.schemaVersion).toBe("unit-test@1");
    expect(restored.best?.id).toBe(run.best?.id);
    expect(selectCandidates(restored, { mode: "best", count: 2 })).toHaveLength(2);
    expect(selectCandidates(restored, { mode: "pareto-knee", count: 1 })).toHaveLength(1);
    expect(selectCandidates(restored, { mode: "per-objective", count: 2 }).length).toBeGreaterThan(0);
    expect(selectCandidates(restored, { mode: "cluster-representatives", count: 2 }).length).toBeGreaterThan(0);
    expect(selectCandidates(restored, { mode: "diverse", count: 3 })).toHaveLength(3);
  });
});
