import { hueHistogram, hueSimilarity } from "./color.js";
import type { ReferenceTarget, ScoreBreakdown } from "./loss.js";
import { decodePNG } from "./png.js";
import { resizeNearest, type Raster } from "./raster.js";
import {
  maskBounds,
  maskFromBackground,
  maskIoU,
  normalizeMask,
  type Mask,
} from "./silhouette.js";

export type ReferenceEvaluationStageId = "D0" | "D1" | "D2" | "D3";

export interface ReferenceEvaluationStage {
  id: ReferenceEvaluationStageId;
  score: number;
  threshold: number;
  passed: boolean;
}

export interface ReferenceEvaluation extends ScoreBreakdown {
  /** Translation/scale-invariant outline match. */
  normalizedSilhouetteIoU: number;
  /** Outline match in original canvas coordinates. */
  canvasSilhouetteIoU: number;
  /** Boundary F1 with a small pixel tolerance. */
  edgeF1: number;
  /** IoU between reference and candidate foreground bounding boxes. */
  bboxIoU: number;
  /** Foreground-center agreement, 0..1. */
  centerSimilarity: number;
  /** Canvas, boundary, bbox and center agreement. */
  framingScore: number;
  /** Shape-only score used before appearance. */
  shapeScore: number;
  stages: readonly ReferenceEvaluationStage[];
  highestPassedStage: ReferenceEvaluationStageId | null;
}

export interface ReferenceEvaluationOptions {
  edgeRadius?: number;
  stageThresholds?: Partial<Record<ReferenceEvaluationStageId, number>>;
}

export type LockedReferenceMetric =
  | "normalizedSilhouetteIoU"
  | "canvasSilhouetteIoU"
  | "edgeF1"
  | "bboxIoU"
  | "centerSimilarity"
  | "shapeScore";

export interface ReferenceCandidate {
  evaluation: ReferenceEvaluation;
  /** Optional score after external penalties such as multi-view solidity. */
  rankScore?: number;
}

export interface ReferenceCandidateGateOptions {
  minImprovement?: number;
  lockedMetrics?: readonly LockedReferenceMetric[];
  regressionTolerance?: Partial<Record<LockedReferenceMetric, number>>;
  requireStageNonRegression?: boolean;
}

export interface ReferenceMetricRegression {
  metric: LockedReferenceMetric;
  incumbent: number;
  candidate: number;
  tolerance: number;
}

export interface ReferenceCandidateDecision {
  accepted: boolean;
  reason: "baseline" | "improved" | "no-improvement" | "metric-regression" | "stage-regression";
  delta: number;
  regressions: readonly ReferenceMetricRegression[];
}

const DEFAULT_THRESHOLDS: Record<ReferenceEvaluationStageId, number> = {
  D0: 0.35,
  D1: 0.3,
  D2: 0,
  D3: 0,
};

const DEFAULT_LOCKED_METRICS: readonly LockedReferenceMetric[] = [
  "normalizedSilhouetteIoU",
  "canvasSilhouetteIoU",
  "edgeF1",
  "bboxIoU",
];

const DEFAULT_TOLERANCE: Record<LockedReferenceMetric, number> = {
  normalizedSilhouetteIoU: 0.02,
  canvasSilhouetteIoU: 0.02,
  edgeF1: 0.03,
  bboxIoU: 0.03,
  centerSimilarity: 0.04,
  shapeScore: 0.01,
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function foregroundFraction(mask: Mask): number {
  let count = 0;
  for (const value of mask.data) count += value;
  return count / Math.max(1, mask.data.length);
}

function borderColor(raster: Raster): [number, number, number] {
  const sum = [0, 0, 0];
  let samples = 0;
  const sample = (x: number, y: number): void => {
    const offset = (y * raster.width + x) * 4;
    sum[0]! += raster.data[offset] ?? 0;
    sum[1]! += raster.data[offset + 1] ?? 0;
    sum[2]! += raster.data[offset + 2] ?? 0;
    samples++;
  };
  for (let x = 0; x < raster.width; x++) {
    sample(x, 0);
    sample(x, raster.height - 1);
  }
  for (let y = 1; y < raster.height - 1; y++) {
    sample(0, y);
    sample(raster.width - 1, y);
  }
  return sum.map((value) => Math.round(value / Math.max(1, samples))) as [number, number, number];
}

function renderMask(raster: Raster, target: ReferenceTarget): Mask {
  const configured = maskFromBackground(raster, target.opts.renderBg);
  if (foregroundFraction(configured) < 0.98) return configured;
  return maskFromBackground(raster, borderColor(raster), 18);
}

function edgeMask(mask: Mask): Mask {
  const data = new Uint8Array(mask.data.length);
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      const index = y * mask.width + x;
      if (!mask.data[index]) continue;
      if (
        x === 0 ||
        y === 0 ||
        x === mask.width - 1 ||
        y === mask.height - 1 ||
        !mask.data[index - 1] ||
        !mask.data[index + 1] ||
        !mask.data[index - mask.width] ||
        !mask.data[index + mask.width]
      ) {
        data[index] = 1;
      }
    }
  }
  return { width: mask.width, height: mask.height, data };
}

function edgeRecall(source: Mask, target: Mask, radius: number): number {
  let sourceCount = 0;
  let matched = 0;
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      if (!source.data[y * source.width + x]) continue;
      sourceCount++;
      let found = false;
      for (let dy = -radius; dy <= radius && !found; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= target.height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < target.width && target.data[yy * target.width + xx]) {
            found = true;
            break;
          }
        }
      }
      if (found) matched++;
    }
  }
  return sourceCount === 0 ? (foregroundFraction(target) === 0 ? 1 : 0) : matched / sourceCount;
}

export function maskEdgeF1(a: Mask, b: Mask, radius = 1): number {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error("maskEdgeF1: size mismatch");
  }
  const ae = edgeMask(a);
  const be = edgeMask(b);
  const safeRadius = Math.max(0, Math.floor(radius));
  const precision = edgeRecall(be, ae, safeRadius);
  const recall = edgeRecall(ae, be, safeRadius);
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

function bboxIoU(a: Mask, b: Mask): number {
  const ab = maskBounds(a);
  const bb = maskBounds(b);
  if (ab.area === 0 || bb.area === 0) return ab.area === bb.area ? 1 : 0;
  const ix0 = Math.max(ab.x0, bb.x0);
  const iy0 = Math.max(ab.y0, bb.y0);
  const ix1 = Math.min(ab.x1, bb.x1);
  const iy1 = Math.min(ab.y1, bb.y1);
  const intersection = Math.max(0, ix1 - ix0 + 1) * Math.max(0, iy1 - iy0 + 1);
  const areaA = (ab.x1 - ab.x0 + 1) * (ab.y1 - ab.y0 + 1);
  const areaB = (bb.x1 - bb.x0 + 1) * (bb.y1 - bb.y0 + 1);
  return intersection / Math.max(1, areaA + areaB - intersection);
}

function centerSimilarity(a: Mask, b: Mask): number {
  const ab = maskBounds(a);
  const bb = maskBounds(b);
  if (ab.area === 0 || bb.area === 0) return ab.area === bb.area ? 1 : 0;
  const ax = (ab.x0 + ab.x1) * 0.5;
  const ay = (ab.y0 + ab.y1) * 0.5;
  const bx = (bb.x0 + bb.x1) * 0.5;
  const by = (bb.y0 + bb.y1) * 0.5;
  const distance = Math.hypot(ax - bx, ay - by);
  return clamp01(1 - distance / Math.hypot(a.width, a.height));
}

function makeStages(
  normalizedIoU: number,
  framingScore: number,
  colorSimilarity: number,
  score: number,
  options: ReferenceEvaluationOptions | undefined,
): { stages: ReferenceEvaluationStage[]; highestPassedStage: ReferenceEvaluationStageId | null } {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...options?.stageThresholds };
  const values: Array<[ReferenceEvaluationStageId, number]> = [
    ["D0", normalizedIoU],
    ["D1", framingScore],
    ["D2", colorSimilarity],
    ["D3", score],
  ];
  const stages: ReferenceEvaluationStage[] = values.map(([id, value]) => ({
    id,
    score: value,
    threshold: thresholds[id],
    passed: value >= thresholds[id],
  }));
  let highestPassedStage: ReferenceEvaluationStageId | null = null;
  for (const stage of stages) {
    if (!stage.passed) break;
    highestPassedStage = stage.id;
  }
  return { stages, highestPassedStage };
}

export function evaluateReferenceRaster(
  target: ReferenceTarget,
  render: Raster,
  options?: ReferenceEvaluationOptions,
): ReferenceEvaluation {
  const gridSize = target.opts.gridSize;
  const raster = resizeNearest(render, gridSize, gridSize);
  const mask = renderMask(raster, target);
  const normalizedMask = target.opts.normalize ? normalizeMask(mask) : mask;
  const normalizedSilhouetteIoU = maskIoU(target.maskNorm, normalizedMask);
  const canvasSilhouetteIoU = maskIoU(target.mask, mask);
  const edgeF1 = maskEdgeF1(target.mask, mask, options?.edgeRadius ?? 1);
  const boxIoU = bboxIoU(target.mask, mask);
  const center = centerSimilarity(target.mask, mask);
  const framingScore =
    0.45 * canvasSilhouetteIoU +
    0.25 * edgeF1 +
    0.2 * boxIoU +
    0.1 * center;
  const shapeScore = 0.55 * normalizedSilhouetteIoU + 0.45 * framingScore;
  const renderHue = hueHistogram(raster, 12, mask);
  const colorSimilarity = hueSimilarity(target.hueHist, renderHue);
  const weights = target.opts.weights;
  const denominator = weights.silhouette + weights.color || 1;
  const score = (weights.silhouette * shapeScore + weights.color * colorSimilarity) / denominator;
  const stageInfo = makeStages(normalizedSilhouetteIoU, framingScore, colorSimilarity, score, options);
  return {
    score,
    silhouetteIoU: normalizedSilhouetteIoU,
    colorSimilarity,
    normalizedSilhouetteIoU,
    canvasSilhouetteIoU,
    edgeF1,
    bboxIoU: boxIoU,
    centerSimilarity: center,
    framingScore,
    shapeScore,
    stages: stageInfo.stages,
    highestPassedStage: stageInfo.highestPassedStage,
  };
}

export function evaluateReferencePng(
  target: ReferenceTarget,
  renderPng: Uint8Array,
  options?: ReferenceEvaluationOptions,
): ReferenceEvaluation {
  return evaluateReferenceRaster(target, decodePNG(renderPng), options);
}

function stageIndex(stage: ReferenceEvaluationStageId | null): number {
  return stage === null ? -1 : ["D0", "D1", "D2", "D3"].indexOf(stage);
}

export function gateReferenceCandidate(
  candidate: ReferenceCandidate,
  incumbent: ReferenceCandidate | null,
  options?: ReferenceCandidateGateOptions,
): ReferenceCandidateDecision {
  if (!incumbent) {
    return { accepted: true, reason: "baseline", delta: 0, regressions: [] };
  }
  const candidateScore = candidate.rankScore ?? candidate.evaluation.score;
  const incumbentScore = incumbent.rankScore ?? incumbent.evaluation.score;
  const delta = candidateScore - incumbentScore;
  if (
    options?.requireStageNonRegression !== false &&
    stageIndex(candidate.evaluation.highestPassedStage) < stageIndex(incumbent.evaluation.highestPassedStage)
  ) {
    return { accepted: false, reason: "stage-regression", delta, regressions: [] };
  }
  const lockedMetrics = options?.lockedMetrics ?? DEFAULT_LOCKED_METRICS;
  const regressions: ReferenceMetricRegression[] = [];
  for (const metric of lockedMetrics) {
    const tolerance = options?.regressionTolerance?.[metric] ?? DEFAULT_TOLERANCE[metric];
    const previous = incumbent.evaluation[metric];
    const current = candidate.evaluation[metric];
    if (current < previous - tolerance) {
      regressions.push({ metric, incumbent: previous, candidate: current, tolerance });
    }
  }
  if (regressions.length > 0) {
    return { accepted: false, reason: "metric-regression", delta, regressions };
  }
  if (delta < (options?.minImprovement ?? 0.003)) {
    return { accepted: false, reason: "no-improvement", delta, regressions: [] };
  }
  return { accepted: true, reason: "improved", delta, regressions: [] };
}

export function formatReferenceEvaluation(evaluation: ReferenceEvaluation): string {
  return `score=${evaluation.score.toFixed(3)} shape=${evaluation.shapeScore.toFixed(3)} ` +
    `(normIoU=${evaluation.normalizedSilhouetteIoU.toFixed(3)}, canvasIoU=${evaluation.canvasSilhouetteIoU.toFixed(3)}, ` +
    `edgeF1=${evaluation.edgeF1.toFixed(3)}, bboxIoU=${evaluation.bboxIoU.toFixed(3)}, color=${evaluation.colorSimilarity.toFixed(3)})`;
}

export function formatCandidateDecision(decision: ReferenceCandidateDecision): string {
  if (decision.accepted) return `accepted:${decision.reason} delta=${decision.delta.toFixed(3)}`;
  const regressions = decision.regressions
    .map((item) => `${item.metric} ${item.incumbent.toFixed(3)}->${item.candidate.toFixed(3)}`)
    .join(", ");
  return `rejected:${decision.reason} delta=${decision.delta.toFixed(3)}${regressions ? `; ${regressions}` : ""}`;
}
