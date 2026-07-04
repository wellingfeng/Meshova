import type { NamedPart } from "./export.js";
import type { Mesh } from "./mesh.js";
import { triangleCount } from "./mesh.js";
import type { FaceLabel, SplitByFaceLabelsOptions } from "./segment.js";
import { splitByFaceLabels } from "./segment.js";

export type AIGuidedSplitMethod = "cut" | "regenerate";

export interface AIGuidedSplitPart {
  /** Stable AI/SAM key, e.g. "finger_1" or "gem_red". */
  key: string;
  /** UI label, usually Simplified Chinese. */
  label: string;
  role?: string;
  confidence?: number;
  color?: [number, number, number];
  /**
   * "cut" = segment existing mesh. "regenerate" = external image-to-3D worker
   * should replace this part; Meshova still uses masks to locate/socket it.
   */
  method?: AIGuidedSplitMethod;
  generationPrompt?: string;
  /** Optional normalized screen-space box [x0,y0,x1,y1] from VLM fallback. */
  bbox?: readonly [number, number, number, number];
}

export interface AIGuidedSplitPlan {
  objectLabel?: string;
  confidence?: number;
  parts: ReadonlyArray<AIGuidedSplitPart>;
  source?: "ai" | "user" | "mock";
  notes?: ReadonlyArray<string>;
}

export interface FaceIdView {
  width: number;
  height: number;
  /**
   * One face id per pixel. Valid ids are local mesh triangle indices. Use -1
   * or backgroundFaceId for empty/background pixels.
   */
  faceIds: ReadonlyArray<number>;
  backgroundFaceId?: number;
  weight?: number;
}

export interface AIPartMaskView {
  partKey?: string;
  label?: string;
  role?: string;
  confidence?: number;
  color?: [number, number, number];
  method?: AIGuidedSplitMethod;
  generationPrompt?: string;
  view: FaceIdView;
  /** One channel mask (0..1 or 0..255) or RGBA mask (alpha/luma used). */
  mask: ReadonlyArray<number | boolean>;
  threshold?: number;
  weight?: number;
}

export interface LiftPartMasksOptions {
  plan?: AIGuidedSplitPlan;
  minMaskValue?: number;
  minFaceScore?: number;
  minPartConfidence?: number;
  fillUnassigned?: boolean;
  unassignedLabel?: string;
  smoothPasses?: number;
  lockConfidence?: number;
}

export interface LiftedFaceLabels {
  labels: string[];
  displayLabels: Record<string, string>;
  roles: Record<string, string>;
  colors: Record<string, [number, number, number]>;
  methods: Record<string, AIGuidedSplitMethod>;
  generationPrompts: Record<string, string>;
  confidenceByFace: number[];
  scoreByPart: Record<string, number>;
  diagnostics: string[];
}

export interface OptimizeFaceLabelsOptions {
  smoothPasses?: number;
  unassignedLabel?: string;
  locked?: ReadonlyArray<boolean>;
}

export interface SplitMeshByAiMasksOptions extends SplitByFaceLabelsOptions, LiftPartMasksOptions {
  prefix?: string;
}

export interface AIGuidedSplitResult {
  ok: boolean;
  parts: NamedPart[];
  faceLabels: string[];
  displayLabels: Record<string, string>;
  confidenceByFace: number[];
  diagnostics: string[];
}

interface PartSpec {
  key: string;
  label: string;
  role: string;
  confidence: number;
  color?: [number, number, number];
  method: AIGuidedSplitMethod;
  generationPrompt?: string;
}

function clamp01(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

function sanitizeKey(value: string, fallback: string): string {
  const key = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return key || fallback;
}

function normalizeMaskSample(value: number | boolean | undefined): number {
  if (typeof value === "boolean") return value ? 1 : 0;
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return n > 1 ? clamp01(n / 255, 0) : clamp01(n, 0);
}

function maskAt(mask: ReadonlyArray<number | boolean>, pixel: number, pixels: number): number {
  if (mask.length === pixels) return normalizeMaskSample(mask[pixel]);
  if (mask.length === pixels * 4) {
    const i = pixel * 4;
    const alpha = normalizeMaskSample(mask[i + 3]);
    if (alpha > 0) return alpha;
    const r = normalizeMaskSample(mask[i]);
    const g = normalizeMaskSample(mask[i + 1]);
    const b = normalizeMaskSample(mask[i + 2]);
    return (r + g + b) / 3;
  }
  return 0;
}

function faceNeighbors(mesh: Mesh): number[][] {
  const tris = triangleCount(mesh);
  const out: number[][] = Array.from({ length: tris }, () => []);
  const owners = new Map<string, number[]>();
  const key = (a: number, b: number): string => (a < b ? `${a}/${b}` : `${b}/${a}`);
  for (let f = 0; f < tris; f++) {
    const a = mesh.indices[f * 3]!;
    const b = mesh.indices[f * 3 + 1]!;
    const c = mesh.indices[f * 3 + 2]!;
    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
      const k = key(u, v);
      const list = owners.get(k);
      if (list) list.push(f);
      else owners.set(k, [f]);
    }
  }
  for (const faces of owners.values()) {
    for (let i = 0; i < faces.length; i++) {
      for (let j = i + 1; j < faces.length; j++) {
        const a = faces[i]!;
        const b = faces[j]!;
        out[a]!.push(b);
        out[b]!.push(a);
      }
    }
  }
  return out;
}

function majorityLabel(labels: ReadonlyArray<string>, neighbors: ReadonlyArray<number>, skip: string): string | undefined {
  const votes = new Map<string, number>();
  for (const n of neighbors) {
    const label = labels[n]!;
    if (!label || label === skip) continue;
    votes.set(label, (votes.get(label) ?? 0) + 1);
  }
  let best = "";
  let bestVotes = 0;
  for (const [label, count] of votes) {
    if (count > bestVotes) {
      best = label;
      bestVotes = count;
    }
  }
  return bestVotes > 0 ? best : undefined;
}

function floodFillUnassigned(
  labels: ReadonlyArray<string>,
  neighbors: ReadonlyArray<ReadonlyArray<number>>,
  unassigned: string,
): string[] {
  const out = labels.slice();
  const queue: number[] = [];
  for (let f = 0; f < out.length; f++) {
    const label = out[f]!;
    if (label && label !== unassigned) queue.push(f);
  }
  for (let head = 0; head < queue.length; head++) {
    const face = queue[head]!;
    const label = out[face]!;
    for (const next of neighbors[face] ?? []) {
      if (out[next] && out[next] !== unassigned) continue;
      out[next] = label;
      queue.push(next);
    }
  }
  return out;
}

export function optimizeFaceLabelsByAdjacency(
  mesh: Mesh,
  faceLabels: ReadonlyArray<FaceLabel>,
  options: OptimizeFaceLabelsOptions = {},
): string[] {
  const tris = triangleCount(mesh);
  if (faceLabels.length !== tris) {
    throw new Error(`faceLabels length ${faceLabels.length} != triangle count ${tris}`);
  }
  const unassigned = options.unassignedLabel ?? "unassigned";
  const neighbors = faceNeighbors(mesh);
  let labels = faceLabels.map((label) => String(label));
  const locked = options.locked ?? [];
  const passes = Math.max(0, Math.floor(options.smoothPasses ?? 2));
  labels = floodFillUnassigned(labels, neighbors, unassigned);

  for (let pass = 0; pass < passes; pass++) {
    const next = labels.slice();
    for (let f = 0; f < tris; f++) {
      if (locked[f]) continue;
      const current = labels[f]!;
      const majority = majorityLabel(labels, neighbors[f]!, unassigned);
      if (!majority) continue;
      if (current === unassigned || current === "" || neighbors[f]!.filter((n) => labels[n] === majority).length >= 2) {
        next[f] = majority;
      }
    }
    labels = next;
  }

  return labels;
}

function partSpecForMask(mask: AIPartMaskView, index: number, planByKey: Map<string, AIGuidedSplitPart>): PartSpec {
  const fallback = `ai_part_${index + 1}`;
  const planKey = mask.partKey ? sanitizeKey(mask.partKey, fallback) : "";
  const key = planKey || sanitizeKey(mask.label ?? "", fallback);
  const planned = planByKey.get(key);
  const label = (mask.label ?? planned?.label ?? `AI部件 ${index + 1}`).trim();
  const role = (mask.role ?? planned?.role ?? "part").trim();
  const method = mask.method ?? planned?.method ?? "cut";
  const confidence = clamp01(mask.confidence ?? planned?.confidence, 1);
  const spec: PartSpec = { key, label, role, confidence, method };
  const color = mask.color ?? planned?.color;
  if (color) spec.color = color;
  const generationPrompt = mask.generationPrompt ?? planned?.generationPrompt;
  if (generationPrompt) spec.generationPrompt = generationPrompt;
  return spec;
}

function planMap(plan: AIGuidedSplitPlan | undefined): Map<string, AIGuidedSplitPart> {
  const out = new Map<string, AIGuidedSplitPart>();
  for (let i = 0; i < (plan?.parts.length ?? 0); i++) {
    const part = plan!.parts[i]!;
    out.set(sanitizeKey(part.key, `ai_part_${i + 1}`), part);
  }
  return out;
}

export function liftPartMasksToFaceLabels(
  mesh: Mesh,
  masks: ReadonlyArray<AIPartMaskView>,
  options: LiftPartMasksOptions = {},
): LiftedFaceLabels {
  const tris = triangleCount(mesh);
  const diagnostics: string[] = [];
  const displayLabels: Record<string, string> = {};
  const roles: Record<string, string> = {};
  const colors: Record<string, [number, number, number]> = {};
  const methods: Record<string, AIGuidedSplitMethod> = {};
  const generationPrompts: Record<string, string> = {};
  const scoreByPart: Record<string, number> = {};
  const minPartConfidence = options.minPartConfidence ?? 0.15;
  const minFaceScore = options.minFaceScore ?? 0.25;
  const unassigned = options.unassignedLabel ?? "unassigned";
  const plans = planMap(options.plan);
  const scoreArrays = new Map<string, Float64Array>();

  for (let i = 0; i < masks.length; i++) {
    const mask = masks[i]!;
    const spec = partSpecForMask(mask, i, plans);
    if (spec.confidence < minPartConfidence) {
      diagnostics.push(`skip low-confidence part ${spec.key}`);
      continue;
    }
    const pixels = mask.view.width * mask.view.height;
    if (mask.view.faceIds.length !== pixels) {
      diagnostics.push(`skip ${spec.key}: faceId size mismatch`);
      continue;
    }
    if (mask.mask.length !== pixels && mask.mask.length !== pixels * 4) {
      diagnostics.push(`skip ${spec.key}: mask size mismatch`);
      continue;
    }
    displayLabels[spec.key] = spec.label;
    roles[spec.key] = spec.role;
    methods[spec.key] = spec.method;
    if (spec.color) colors[spec.key] = spec.color;
    if (spec.generationPrompt) generationPrompts[spec.key] = spec.generationPrompt;
    const scores = scoreArrays.get(spec.key) ?? new Float64Array(tris);
    scoreArrays.set(spec.key, scores);
    const threshold = mask.threshold ?? options.minMaskValue ?? 0.5;
    const weight = (mask.weight ?? 1) * (mask.view.weight ?? 1) * spec.confidence;
    let hits = 0;
    for (let p = 0; p < pixels; p++) {
      const face = mask.view.faceIds[p]!;
      if (face < 0 || face >= tris || face === (mask.view.backgroundFaceId ?? -1)) continue;
      const v = maskAt(mask.mask, p, pixels);
      if (v < threshold) continue;
      scores[face] = (scores[face] ?? 0) + v * weight;
      hits++;
    }
    scoreByPart[spec.key] = (scoreByPart[spec.key] ?? 0) + hits;
    if (hits === 0) diagnostics.push(`no mask pixels hit mesh for ${spec.key}`);
  }

  displayLabels[unassigned] = "未识别区域";
  roles[unassigned] = "unassigned";
  methods[unassigned] = "cut";

  const labels = Array.from({ length: tris }, () => unassigned);
  const confidenceByFace = Array.from({ length: tris }, () => 0);
  for (let f = 0; f < tris; f++) {
    let best = "";
    let bestScore = 0;
    for (const [key, scores] of scoreArrays) {
      const score = scores[f]!;
      if (score > bestScore) {
        best = key;
        bestScore = score;
      }
    }
    if (best && bestScore >= minFaceScore) {
      labels[f] = best;
      confidenceByFace[f] = clamp01(bestScore, 0);
    }
  }

  const lockConfidence = options.lockConfidence ?? 0.65;
  const locked = confidenceByFace.map((c) => c >= lockConfidence);
  const finalLabels = options.fillUnassigned === false
    ? labels
    : optimizeFaceLabelsByAdjacency(mesh, labels, {
      smoothPasses: options.smoothPasses ?? 8,
      unassignedLabel: unassigned,
      locked,
    });

  return {
    labels: finalLabels,
    displayLabels,
    roles,
    colors,
    methods,
    generationPrompts,
    confidenceByFace,
    scoreByPart,
    diagnostics,
  };
}

export function splitMeshByAiMasks(
  mesh: Mesh,
  masks: ReadonlyArray<AIPartMaskView>,
  options: SplitMeshByAiMasksOptions = {},
): AIGuidedSplitResult {
  const lifted = liftPartMasksToFaceLabels(mesh, masks, options);
  const unique = new Set(lifted.labels);
  if (unique.size <= 1) {
    return {
      ok: false,
      parts: [],
      faceLabels: lifted.labels,
      displayLabels: lifted.displayLabels,
      confidenceByFace: lifted.confidenceByFace,
      diagnostics: [...lifted.diagnostics, "AI masks produced one region"],
    };
  }

  const splitOptions: SplitByFaceLabelsOptions = {
    cap: options.cap ?? true,
    prefix: options.prefix ?? "ai",
    displayLabels: lifted.displayLabels,
    colors: lifted.colors,
  };
  if (options.minTriangles !== undefined) splitOptions.minTriangles = options.minTriangles;
  const parts = splitByFaceLabels(mesh, lifted.labels, splitOptions).map((part) => {
    const key = String(part.metadata?.faceLabel ?? "");
    return {
      ...part,
      metadata: {
        ...(part.metadata ?? {}),
        source: "aiGuidedSplit",
        aiPartKey: key,
        role: lifted.roles[key] ?? "part",
        labelSource: "ai",
        labelConfidence: Math.max(...lifted.confidenceByFace.filter((_, i) => lifted.labels[i] === key), 0),
        splitMethod: lifted.methods[key] ?? "cut",
        generationPrompt: lifted.generationPrompts[key],
      },
    };
  });

  return {
    ok: parts.length > 1,
    parts,
    faceLabels: lifted.labels,
    displayLabels: lifted.displayLabels,
    confidenceByFace: lifted.confidenceByFace,
    diagnostics: lifted.diagnostics,
  };
}
