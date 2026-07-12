import { makeRng, type Rng } from "../random/index.js";

export type GeneValue = number | string | boolean;
export type Genome = Record<string, GeneValue>;
export type FitnessValues = Record<string, number>;
export type MetricValue = number | string | boolean | null;
export type MetricValues = Record<string, MetricValue>;
export type ObjectiveDirection = "maximize" | "minimize";
export type EvaluationErrorMode = "penalize" | "throw";
export type CandidateSelectionMode =
  | "best"
  | "pareto-knee"
  | "per-objective"
  | "cluster-representatives"
  | "diverse";

interface GeneBase {
  key: string;
  label?: string;
  locked?: boolean;
}

export interface NumericGeneSpec extends GeneBase {
  kind: "float" | "int";
  min: number;
  max: number;
  step?: number;
  default: number;
}

export interface ChoiceGeneSpec extends GeneBase {
  kind: "choice";
  values: readonly GeneValue[];
  default: GeneValue;
}

export type GeneSpec = NumericGeneSpec | ChoiceGeneSpec;

export interface ObjectiveSpec {
  key: string;
  label?: string;
  direction: ObjectiveDirection;
  weight?: number;
}

export interface ValidCandidateEvaluation {
  valid?: true;
  fitness: FitnessValues;
  metrics?: MetricValues;
  thumbnail?: string;
  data?: unknown;
}

export interface InvalidCandidateEvaluation {
  valid: false;
  invalidReason?: string;
  fitness?: Partial<FitnessValues>;
  metrics?: MetricValues;
  thumbnail?: string;
  data?: unknown;
}

export type CandidateEvaluation = ValidCandidateEvaluation | InvalidCandidateEvaluation;

export interface EvaluationContext {
  index: number;
  generation: number;
  seed: number;
  parentId?: string;
}

export interface OptimizationCandidate {
  id: string;
  index: number;
  generation: number;
  genome: Genome;
  fitness: FitnessValues;
  metrics: MetricValues;
  score: number;
  rank: number;
  valid: boolean;
  invalidReason?: string;
  parentId?: string;
  thumbnail?: string;
  data?: unknown;
}

export interface CandidateCluster {
  id: string;
  centroid: FitnessValues;
  candidates: OptimizationCandidate[];
}

export interface OptimizationRun {
  id: string;
  seed: number;
  schemaVersion?: string;
  genes: GeneSpec[];
  objectives: ObjectiveSpec[];
  candidates: OptimizationCandidate[];
  paretoFront: OptimizationCandidate[];
  best: OptimizationCandidate | null;
  clusters?: CandidateCluster[];
  metadata?: Record<string, unknown>;
}

export interface RandomSearchOptions {
  id?: string;
  seed?: number;
  schemaVersion?: string;
  genes: readonly GeneSpec[];
  objectives: readonly ObjectiveSpec[];
  evaluate: (genome: Genome, context: EvaluationContext) => CandidateEvaluation | Promise<CandidateEvaluation>;
  populationSize?: number;
  generations?: number;
  eliteCount?: number;
  mutationRate?: number;
  mutationStrength?: number;
  includeDefault?: boolean;
  clusterCount?: number;
  invalidPenalty?: number;
  evaluationErrorMode?: EvaluationErrorMode;
  metadata?: Record<string, unknown>;
}

export interface ParamSchemaLike {
  key: string;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  default?: GeneValue;
  values?: readonly GeneValue[];
  locked?: boolean;
}

export interface SchemaToGenesOptions {
  defaults?: Record<string, GeneValue>;
  locked?: readonly string[];
}

export interface ClusterOptions {
  count: number;
  keys?: readonly string[];
  iterations?: number;
}

export interface CandidateSelectionOptions {
  mode?: CandidateSelectionMode;
  count?: number;
  objectiveKey?: string;
}

export interface OptimizationCandidateArchive {
  id: string;
  index: number;
  generation: number;
  genome: Genome;
  fitness: FitnessValues;
  metrics: MetricValues;
  score: number;
  rank: number;
  valid: boolean;
  invalidReason?: string;
  parentId?: string;
  thumbnail?: string;
}

export interface CandidateClusterArchive {
  id: string;
  centroid: FitnessValues;
  candidateIds: string[];
}

export interface OptimizationRunArchive {
  format: "meshova-optimization-run@1";
  schemaVersion: 1;
  run: {
    id: string;
    seed: number;
    schemaVersion?: string;
    genes: GeneSpec[];
    objectives: ObjectiveSpec[];
    candidates: OptimizationCandidateArchive[];
    paretoFrontIds: string[];
    bestId: string | null;
    clusters?: CandidateClusterArchive[];
    metadata?: Record<string, unknown>;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundStable(value: number): number {
  return Number(value.toFixed(12));
}

function snapNumeric(gene: NumericGeneSpec, value: number): number {
  const clamped = clamp(value, gene.min, gene.max);
  const step = gene.step;
  if (step !== undefined && step > 0) {
    const snapped = gene.min + Math.round((clamped - gene.min) / step) * step;
    const out = clamp(snapped, gene.min, gene.max);
    return gene.kind === "int" ? Math.round(out) : roundStable(out);
  }
  return gene.kind === "int" ? Math.round(clamped) : roundStable(clamped);
}

function copyGene(gene: GeneSpec): GeneSpec {
  const base = { key: gene.key };
  if (gene.label !== undefined) (base as GeneBase).label = gene.label;
  if (gene.locked !== undefined) (base as GeneBase).locked = gene.locked;
  if (gene.kind === "choice") {
    return { ...(base as GeneBase), kind: "choice", values: [...gene.values], default: gene.default };
  }
  const out: NumericGeneSpec = { ...(base as GeneBase), kind: gene.kind, min: gene.min, max: gene.max, default: gene.default };
  if (gene.step !== undefined) out.step = gene.step;
  return out;
}

function copyObjective(objective: ObjectiveSpec): ObjectiveSpec {
  const out: ObjectiveSpec = { key: objective.key, direction: objective.direction };
  if (objective.label !== undefined) out.label = objective.label;
  if (objective.weight !== undefined) out.weight = objective.weight;
  return out;
}

function mixSeed(seed: number, index: number, generation: number): number {
  let x = (seed ^ Math.imul(index + 1, 0x9e3779b9) ^ Math.imul(generation + 1, 0x85ebca6b)) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function invalidObjectiveValue(objective: ObjectiveSpec, penalty: number): number {
  return objective.direction === "maximize" ? -penalty : penalty;
}

function ensureFiniteFitness(
  fitness: Partial<FitnessValues> | undefined,
  objectives: readonly ObjectiveSpec[],
  options: { invalid?: boolean; invalidPenalty?: number } = {},
): FitnessValues {
  const out: FitnessValues = {};
  const invalid = options.invalid ?? false;
  const penalty = Math.max(1, options.invalidPenalty ?? 1e12);
  for (const objective of objectives) {
    const value = fitness?.[objective.key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      if (invalid) {
        out[objective.key] = invalidObjectiveValue(objective, penalty);
        continue;
      }
      throw new Error(`objective "${objective.key}" returned non-finite fitness`);
    }
    out[objective.key] = value;
  }
  return out;
}

function isCandidateValid(candidate: OptimizationCandidate): boolean {
  return candidate.valid !== false;
}

function fitnessValue(candidate: OptimizationCandidate, objective: ObjectiveSpec): number {
  const value = candidate.fitness[objective.key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`candidate "${candidate.id}" missing objective "${objective.key}"`);
  }
  return value;
}

function cloneCandidate(candidate: OptimizationCandidate): OptimizationCandidate {
  const out: OptimizationCandidate = {
    id: candidate.id,
    index: candidate.index,
    generation: candidate.generation,
    genome: { ...candidate.genome },
    fitness: { ...candidate.fitness },
    metrics: { ...candidate.metrics },
    score: candidate.score,
    rank: candidate.rank,
    valid: isCandidateValid(candidate),
  };
  if (candidate.invalidReason !== undefined) out.invalidReason = candidate.invalidReason;
  if (candidate.parentId !== undefined) out.parentId = candidate.parentId;
  if (candidate.thumbnail !== undefined) out.thumbnail = candidate.thumbnail;
  if (candidate.data !== undefined) out.data = candidate.data;
  return out;
}

export function schemaToGenes(schema: readonly ParamSchemaLike[], options: SchemaToGenesOptions = {}): GeneSpec[] {
  const locked = new Set(options.locked ?? []);
  const defaults = options.defaults ?? {};
  const genes: GeneSpec[] = [];
  for (const spec of schema) {
    const key = String(spec.key);
    const base: GeneBase = { key };
    if (spec.label !== undefined) base.label = String(spec.label);
    if (spec.locked || locked.has(key)) base.locked = true;

    const defaultValue = Object.prototype.hasOwnProperty.call(defaults, key) ? defaults[key] : spec.default;
    if (spec.values && spec.values.length > 0) {
      const fallback = defaultValue !== undefined ? defaultValue : spec.values[0]!;
      const gene: ChoiceGeneSpec = { ...base, kind: "choice", values: [...spec.values], default: fallback };
      genes.push(gene);
      continue;
    }

    const min = Number.isFinite(spec.min) ? Number(spec.min) : 0;
    const max = Number.isFinite(spec.max) ? Number(spec.max) : 1;
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    const step = Number.isFinite(spec.step) ? Number(spec.step) : undefined;
    const kind: "float" | "int" =
      step !== undefined && step >= 1 && Number.isInteger(step) && Number.isInteger(lo) && Number.isInteger(hi)
        ? "int"
        : "float";
    const rawDefault = Number.isFinite(defaultValue) ? Number(defaultValue) : lo;
    const gene: NumericGeneSpec = { ...base, kind, min: lo, max: hi, default: 0 };
    if (step !== undefined && step > 0) gene.step = step;
    gene.default = snapNumeric(gene, rawDefault);
    genes.push(gene);
  }
  return genes;
}

export function defaultGenome(genes: readonly GeneSpec[]): Genome {
  const genome: Genome = {};
  for (const gene of genes) genome[gene.key] = gene.default;
  return genome;
}

export function clampGenome(genes: readonly GeneSpec[], genome: Genome): Genome {
  const out: Genome = {};
  for (const gene of genes) {
    const value = genome[gene.key] ?? gene.default;
    if (gene.kind === "choice") {
      out[gene.key] = gene.values.includes(value) ? value : gene.default;
    } else {
      out[gene.key] = snapNumeric(gene, Number(value));
    }
  }
  return out;
}

export function sampleGenome(genes: readonly GeneSpec[], rng: Rng): Genome {
  const genome: Genome = {};
  for (const gene of genes) {
    if (gene.locked) {
      genome[gene.key] = gene.default;
      continue;
    }
    if (gene.kind === "choice") {
      const value = gene.values[rng.int(0, gene.values.length - 1)];
      genome[gene.key] = value ?? gene.default;
      continue;
    }
    const raw = gene.kind === "int" ? rng.int(Math.ceil(gene.min), Math.floor(gene.max)) : rng.range(gene.min, gene.max);
    genome[gene.key] = snapNumeric(gene, raw);
  }
  return genome;
}

export function mutateGenome(
  genome: Genome,
  genes: readonly GeneSpec[],
  rng: Rng,
  mutationRate = 0.25,
  mutationStrength = 0.2,
): Genome {
  const out: Genome = {};
  for (const gene of genes) {
    const current = genome[gene.key] ?? gene.default;
    if (gene.locked || rng.next() > mutationRate) {
      out[gene.key] = gene.kind === "choice" ? current : snapNumeric(gene, Number(current));
      continue;
    }
    if (gene.kind === "choice") {
      if (gene.values.length <= 1) {
        out[gene.key] = gene.default;
      } else {
        let next = current;
        for (let i = 0; i < 4 && next === current; i++) {
          next = gene.values[rng.int(0, gene.values.length - 1)] ?? gene.default;
        }
        out[gene.key] = next;
      }
      continue;
    }
    const span = Math.max(1e-9, gene.max - gene.min);
    const delta = rng.range(-span * mutationStrength, span * mutationStrength);
    out[gene.key] = snapNumeric(gene, Number(current) + delta);
  }
  return out;
}

export function dominates(a: OptimizationCandidate, b: OptimizationCandidate, objectives: readonly ObjectiveSpec[]): boolean {
  const av = isCandidateValid(a);
  const bv = isCandidateValid(b);
  if (av !== bv) return av;
  if (!av && !bv) return false;
  let strictlyBetter = false;
  for (const objective of objectives) {
    const av = fitnessValue(a, objective);
    const bv = fitnessValue(b, objective);
    if (objective.direction === "maximize") {
      if (av + 1e-12 < bv) return false;
      if (av > bv + 1e-12) strictlyBetter = true;
    } else {
      if (av - 1e-12 > bv) return false;
      if (av < bv - 1e-12) strictlyBetter = true;
    }
  }
  return strictlyBetter;
}

export function rankCandidates(
  candidates: readonly OptimizationCandidate[],
  objectives: readonly ObjectiveSpec[],
): OptimizationCandidate[] {
  const ranked = candidates.map(cloneCandidate);
  const remaining = new Set<number>(ranked.map((_, index) => index));
  let rank = 0;

  while (remaining.size > 0) {
    const front: number[] = [];
    for (const i of remaining) {
      const candidate = ranked[i]!;
      let dominated = false;
      for (const j of remaining) {
        if (i === j) continue;
        const other = ranked[j]!;
        if (dominates(other, candidate, objectives)) {
          dominated = true;
          break;
        }
      }
      if (!dominated) front.push(i);
    }
    const safeFront = front.length ? front : [...remaining];
    for (const i of safeFront) {
      ranked[i]!.rank = rank;
      remaining.delete(i);
    }
    rank++;
  }

  return scoreCandidates(ranked, objectives);
}

export function paretoFront(
  candidates: readonly OptimizationCandidate[],
  objectives: readonly ObjectiveSpec[],
): OptimizationCandidate[] {
  return rankCandidates(candidates, objectives).filter((candidate) => candidate.rank === 0 && isCandidateValid(candidate));
}

export function scoreCandidates(
  candidates: readonly OptimizationCandidate[],
  objectives: readonly ObjectiveSpec[],
): OptimizationCandidate[] {
  const rangeSource = candidates.some(isCandidateValid) ? candidates.filter(isCandidateValid) : candidates;
  const ranges = objectives.map((objective) => {
    let min = Infinity;
    let max = -Infinity;
    for (const candidate of rangeSource) {
      const value = fitnessValue(candidate, objective);
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    return { key: objective.key, min, max };
  });

  return candidates.map((candidate) => {
    if (!isCandidateValid(candidate)) return { ...cloneCandidate(candidate), score: 0 };
    let total = 0;
    let weights = 0;
    for (let i = 0; i < objectives.length; i++) {
      const objective = objectives[i]!;
      const range = ranges[i]!;
      const value = fitnessValue(candidate, objective);
      const denom = Math.max(1e-12, range.max - range.min);
      const normalized = objective.direction === "maximize"
        ? (value - range.min) / denom
        : (range.max - value) / denom;
      const weight = objective.weight ?? 1;
      total += normalized * weight;
      weights += weight;
    }
    return { ...cloneCandidate(candidate), score: weights > 0 ? total / weights : 0 };
  });
}

export function bestCandidate(candidates: readonly OptimizationCandidate[]): OptimizationCandidate | null {
  const valid = candidates.filter(isCandidateValid);
  if (!valid.length) return null;
  return [...valid].sort((a, b) => a.rank - b.rank || b.score - a.score || a.index - b.index)[0] ?? null;
}

export function clusterCandidates(
  candidates: readonly OptimizationCandidate[],
  options: ClusterOptions,
): CandidateCluster[] {
  if (!candidates.length || options.count <= 0) return [];
  const source = candidates.some(isCandidateValid) ? candidates.filter(isCandidateValid) : [...candidates];
  const keys = options.keys && options.keys.length ? [...options.keys] : Object.keys(source[0]!.fitness);
  if (!keys.length) return [];
  const count = Math.min(options.count, source.length);
  const iterations = Math.max(1, options.iterations ?? 8);
  const ranked = [...source].sort((a, b) => a.rank - b.rank || b.score - a.score || a.index - b.index);
  const stats = keys.map((key) => {
    let min = Infinity;
    let max = -Infinity;
    for (const candidate of ranked) {
      const value = candidate.fitness[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    }
    return { key, min, max };
  });
  const vector = (candidate: OptimizationCandidate): number[] => stats.map((stat) => {
    const value = candidate.fitness[stat.key] ?? 0;
    const denom = Math.max(1e-12, stat.max - stat.min);
    return (value - stat.min) / denom;
  });
  const centroids: number[][] = [];
  for (let i = 0; i < count; i++) {
    const pick = count === 1 ? 0 : Math.round((i / (count - 1)) * (ranked.length - 1));
    centroids.push(vector(ranked[pick]!));
  }

  let groups: OptimizationCandidate[][] = [];
  for (let iter = 0; iter < iterations; iter++) {
    groups = Array.from({ length: count }, () => []);
    for (const candidate of ranked) {
      const v = vector(candidate);
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < centroids.length; i++) {
        const c = centroids[i]!;
        let dist = 0;
        for (let k = 0; k < v.length; k++) {
          const d = v[k]! - c[k]!;
          dist += d * d;
        }
        if (dist < bestDist) {
          best = i;
          bestDist = dist;
        }
      }
      groups[best]!.push(candidate);
    }
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]!;
      if (!group.length) continue;
      const next = new Array(keys.length).fill(0) as number[];
      for (const candidate of group) {
        const v = vector(candidate);
        for (let k = 0; k < next.length; k++) next[k]! += v[k]!;
      }
      for (let k = 0; k < next.length; k++) next[k] = next[k]! / group.length;
      centroids[i] = next;
    }
  }

  return groups.map((group, index) => {
    const centroid: FitnessValues = {};
    for (const key of keys) {
      let sum = 0;
      for (const candidate of group) sum += candidate.fitness[key] ?? 0;
      centroid[key] = group.length ? sum / group.length : 0;
    }
    return { id: `cluster-${index}`, centroid, candidates: group.map(cloneCandidate) };
  }).filter((cluster) => cluster.candidates.length > 0);
}

function sortedValidCandidates(candidates: readonly OptimizationCandidate[]): OptimizationCandidate[] {
  return candidates
    .filter(isCandidateValid)
    .map(cloneCandidate)
    .sort((a, b) => a.rank - b.rank || b.score - a.score || a.index - b.index);
}

function objectiveBetter(a: number, b: number, objective: ObjectiveSpec): boolean {
  return objective.direction === "maximize" ? a > b : a < b;
}

function normalizedFitnessVector(
  candidate: OptimizationCandidate,
  objectives: readonly ObjectiveSpec[],
  ranges: readonly { min: number; max: number }[],
): number[] {
  return objectives.map((objective, i) => {
    const value = fitnessValue(candidate, objective);
    const range = ranges[i]!;
    const denom = Math.max(1e-12, range.max - range.min);
    return objective.direction === "maximize" ? (value - range.min) / denom : (range.max - value) / denom;
  });
}

function fitnessRanges(candidates: readonly OptimizationCandidate[], objectives: readonly ObjectiveSpec[]): Array<{ min: number; max: number }> {
  return objectives.map((objective) => {
    let min = Infinity;
    let max = -Infinity;
    for (const candidate of candidates) {
      const value = fitnessValue(candidate, objective);
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    return { min, max };
  });
}

function vectorDistance(a: readonly number[], b: readonly number[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    total += d * d;
  }
  return Math.sqrt(total);
}

export function selectCandidates(
  run: OptimizationRun,
  options: CandidateSelectionOptions = {},
): OptimizationCandidate[] {
  const mode = options.mode ?? "best";
  const count = Math.max(1, Math.floor(options.count ?? 1));
  const valid = sortedValidCandidates(run.candidates);
  if (!valid.length) return [];

  if (mode === "best") return valid.slice(0, count);

  if (mode === "per-objective") {
    const picks: OptimizationCandidate[] = [];
    const seen = new Set<string>();
    const objectives = options.objectiveKey
      ? run.objectives.filter((objective) => objective.key === options.objectiveKey)
      : run.objectives;
    for (const objective of objectives) {
      let best: OptimizationCandidate | undefined;
      for (const candidate of valid) {
        if (!best || objectiveBetter(fitnessValue(candidate, objective), fitnessValue(best, objective), objective)) {
          best = candidate;
        }
      }
      if (best && !seen.has(best.id)) {
        picks.push(best);
        seen.add(best.id);
      }
    }
    return picks.slice(0, count);
  }

  if (mode === "cluster-representatives") {
    const clusters = run.clusters && run.clusters.length
      ? run.clusters
      : clusterCandidates(valid, { count });
    const picks: OptimizationCandidate[] = [];
    const seen = new Set<string>();
    for (const cluster of clusters) {
      const best = bestCandidate(cluster.candidates);
      if (best && !seen.has(best.id)) {
        picks.push(best);
        seen.add(best.id);
      }
    }
    return picks.sort((a, b) => a.rank - b.rank || b.score - a.score || a.index - b.index).slice(0, count);
  }

  const front = run.paretoFront.length ? sortedValidCandidates(run.paretoFront) : valid.filter((candidate) => candidate.rank === 0);
  const pool = front.length ? front : valid;
  const ranges = fitnessRanges(valid, run.objectives);

  if (mode === "pareto-knee") {
    const ranked = pool
      .map((candidate) => {
        const v = normalizedFitnessVector(candidate, run.objectives, ranges);
        const dist = vectorDistance(v, new Array(v.length).fill(1));
        return { candidate, dist };
      })
      .sort((a, b) => a.dist - b.dist || a.candidate.rank - b.candidate.rank || b.candidate.score - a.candidate.score);
    return ranked.slice(0, count).map((item) => cloneCandidate(item.candidate));
  }

  const picks: OptimizationCandidate[] = [valid[0]!];
  const seen = new Set<string>([valid[0]!.id]);
  while (picks.length < count && picks.length < valid.length) {
    let best: OptimizationCandidate | undefined;
    let bestDist = -Infinity;
    for (const candidate of valid) {
      if (seen.has(candidate.id)) continue;
      const v = normalizedFitnessVector(candidate, run.objectives, ranges);
      let minDist = Infinity;
      for (const pick of picks) {
        const pv = normalizedFitnessVector(pick, run.objectives, ranges);
        minDist = Math.min(minDist, vectorDistance(v, pv));
      }
      if (minDist > bestDist) {
        best = candidate;
        bestDist = minDist;
      }
    }
    if (!best) break;
    picks.push(best);
    seen.add(best.id);
  }
  return picks;
}

export function archiveOptimizationRun(run: OptimizationRun): OptimizationRunArchive {
  const candidateRecord = (candidate: OptimizationCandidate): OptimizationCandidateArchive => {
    const out: OptimizationCandidateArchive = {
      id: candidate.id,
      index: candidate.index,
      generation: candidate.generation,
      genome: { ...candidate.genome },
      fitness: { ...candidate.fitness },
      metrics: { ...candidate.metrics },
      score: candidate.score,
      rank: candidate.rank,
      valid: isCandidateValid(candidate),
    };
    if (candidate.invalidReason !== undefined) out.invalidReason = candidate.invalidReason;
    if (candidate.parentId !== undefined) out.parentId = candidate.parentId;
    if (candidate.thumbnail !== undefined) out.thumbnail = candidate.thumbnail;
    return out;
  };
  const archivedRun: OptimizationRunArchive["run"] = {
    id: run.id,
    seed: run.seed,
    genes: run.genes.map(copyGene),
    objectives: run.objectives.map(copyObjective),
    candidates: run.candidates.map(candidateRecord),
    paretoFrontIds: run.paretoFront.map((candidate) => candidate.id),
    bestId: run.best?.id ?? null,
  };
  if (run.schemaVersion !== undefined) archivedRun.schemaVersion = run.schemaVersion;
  if (run.clusters !== undefined) {
    archivedRun.clusters = run.clusters.map((cluster) => ({
      id: cluster.id,
      centroid: { ...cluster.centroid },
      candidateIds: cluster.candidates.map((candidate) => candidate.id),
    }));
  }
  if (run.metadata !== undefined) archivedRun.metadata = JSON.parse(JSON.stringify(run.metadata)) as Record<string, unknown>;
  return { format: "meshova-optimization-run@1", schemaVersion: 1, run: archivedRun };
}

export function restoreOptimizationRun(archive: OptimizationRunArchive): OptimizationRun {
  if (archive.format !== "meshova-optimization-run@1" || archive.schemaVersion !== 1) {
    throw new Error("unsupported optimization archive format");
  }
  const candidates = archive.run.candidates.map((candidate): OptimizationCandidate => {
    const out: OptimizationCandidate = {
      id: candidate.id,
      index: candidate.index,
      generation: candidate.generation,
      genome: { ...candidate.genome },
      fitness: { ...candidate.fitness },
      metrics: { ...candidate.metrics },
      score: candidate.score,
      rank: candidate.rank,
      valid: candidate.valid,
    };
    if (candidate.invalidReason !== undefined) out.invalidReason = candidate.invalidReason;
    if (candidate.parentId !== undefined) out.parentId = candidate.parentId;
    if (candidate.thumbnail !== undefined) out.thumbnail = candidate.thumbnail;
    return out;
  });
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const run: OptimizationRun = {
    id: archive.run.id,
    seed: archive.run.seed,
    genes: archive.run.genes.map(copyGene),
    objectives: archive.run.objectives.map(copyObjective),
    candidates,
    paretoFront: archive.run.paretoFrontIds.map((id) => byId.get(id)).filter((candidate): candidate is OptimizationCandidate => !!candidate),
    best: archive.run.bestId ? byId.get(archive.run.bestId) ?? null : null,
  };
  if (archive.run.schemaVersion !== undefined) run.schemaVersion = archive.run.schemaVersion;
  if (archive.run.clusters !== undefined) {
    run.clusters = archive.run.clusters.map((cluster) => ({
      id: cluster.id,
      centroid: { ...cluster.centroid },
      candidates: cluster.candidateIds.map((id) => byId.get(id)).filter((candidate): candidate is OptimizationCandidate => !!candidate),
    })).filter((cluster) => cluster.candidates.length > 0);
  }
  if (archive.run.metadata !== undefined) run.metadata = JSON.parse(JSON.stringify(archive.run.metadata)) as Record<string, unknown>;
  return run;
}

export async function runRandomSearch(options: RandomSearchOptions): Promise<OptimizationRun> {
  const seed = options.seed ?? 1;
  const rng = makeRng(seed);
  const genes = options.genes.map(copyGene);
  const objectives = options.objectives.map(copyObjective);
  const populationSize = Math.max(1, Math.floor(options.populationSize ?? 16));
  const generations = Math.max(1, Math.floor(options.generations ?? 1));
  const eliteCount = Math.max(1, Math.floor(options.eliteCount ?? Math.min(4, populationSize)));
  const mutationRate = options.mutationRate ?? 0.3;
  const mutationStrength = options.mutationStrength ?? 0.2;
  const includeDefault = options.includeDefault ?? true;
  const invalidPenalty = options.invalidPenalty ?? 1e12;
  const evaluationErrorMode = options.evaluationErrorMode ?? "penalize";
  const candidates: OptimizationCandidate[] = [];
  let ranked: OptimizationCandidate[] = [];
  let nextIndex = 0;

  for (let generation = 0; generation < generations; generation++) {
    const elites = ranked.length
      ? [...ranked].sort((a, b) => a.rank - b.rank || b.score - a.score || a.index - b.index).slice(0, eliteCount)
      : [];
    for (let slot = 0; slot < populationSize; slot++) {
      let parent: OptimizationCandidate | undefined;
      let genome: Genome;
      if (includeDefault && generation === 0 && slot === 0) {
        genome = defaultGenome(genes);
      } else if (elites.length) {
        parent = elites[rng.int(0, elites.length - 1)]!;
        genome = mutateGenome(parent.genome, genes, rng, mutationRate, mutationStrength);
      } else {
        genome = sampleGenome(genes, rng);
      }

      const index = nextIndex++;
      const context: EvaluationContext = { index, generation, seed: mixSeed(seed, index, generation) };
      if (parent) context.parentId = parent.id;
      let evaluation: CandidateEvaluation;
      try {
        evaluation = await options.evaluate(genome, context);
      } catch (err) {
        if (evaluationErrorMode === "throw") throw err;
        evaluation = {
          valid: false,
          invalidReason: errorMessage(err),
        };
      }
      const valid = evaluation.valid !== false;
      const candidate: OptimizationCandidate = {
        id: `g${generation}-c${slot}`,
        index,
        generation,
        genome: clampGenome(genes, genome),
        fitness: ensureFiniteFitness(evaluation.fitness, objectives, { invalid: !valid, invalidPenalty }),
        metrics: evaluation.metrics ? { ...evaluation.metrics } : {},
        score: 0,
        rank: Number.POSITIVE_INFINITY,
        valid,
      };
      if (evaluation.valid === false && evaluation.invalidReason !== undefined) candidate.invalidReason = evaluation.invalidReason;
      if (parent) candidate.parentId = parent.id;
      if (evaluation.thumbnail !== undefined) candidate.thumbnail = evaluation.thumbnail;
      if (evaluation.data !== undefined) candidate.data = evaluation.data;
      candidates.push(candidate);
    }
    ranked = rankCandidates(candidates, objectives);
  }

  const fronts = ranked.filter((candidate) => candidate.rank === 0 && isCandidateValid(candidate));
  const run: OptimizationRun = {
    id: options.id ?? `random-${seed}-${populationSize}x${generations}`,
    seed,
    genes,
    objectives,
    candidates: ranked,
    paretoFront: fronts,
    best: bestCandidate(ranked),
  };
  if (options.schemaVersion !== undefined) run.schemaVersion = options.schemaVersion;
  if (options.metadata !== undefined) run.metadata = JSON.parse(JSON.stringify(options.metadata)) as Record<string, unknown>;
  if (options.clusterCount !== undefined && options.clusterCount > 0) {
    run.clusters = clusterCandidates(ranked, { count: options.clusterCount });
  }
  return run;
}
