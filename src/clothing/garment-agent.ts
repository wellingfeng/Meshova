/**
 * Garment AI loop (M6 — AI Closed Loop).
 *
 * Three pieces, matching the project's image-target策略 (shape first, material
 * by coarse category, never pixel-match):
 *
 *  1. classifyGarment  — a VLM picks the garment template + coarse features
 *     (sleeve length, neckline, fit, fabric class) from a reference photo.
 *  2. parseGarmentHint — a zero-LLM keyword fallback: turn a text hint like
 *     "宽松长袖牛仔衬衫" into a GarmentSpec. Useful for tests and offline runs.
 *  3. optimizeGarment  — a deterministic black-box optimizer (coordinate
 *     descent / hill-climb) that nudges continuous params (ease, length, flare)
 *     to maximize a silhouette score from a render callback.
 *
 * The garment template choice is discrete (tshirt/skirt/pants) and comes from
 * classification; the optimizer only tunes the continuous knobs, so it can't
 * wander into a different garment. That mirrors the research note: pick the
 * right template, then fit its parameters.
 */
import type { LlmClient, LlmMessage } from "../agent/llm.js";
import { extractCode } from "../agent/llm.js";
import type { NamedPart } from "../geometry/export.js";
import { FABRIC_IDS } from "./fabric.js";
import { buildGarment, type GarmentTemplateId } from "./templates.js";

/** Continuous + discrete knobs shared across templates. The optimizer only
 *  touches the continuous ones; template + fabric are discrete. */
export interface GarmentSpec {
  template: GarmentTemplateId;
  fabric: string;
  /** Continuous params passed through to the template builder. */
  params: Record<string, number>;
}

/** Per-template tunable continuous parameters with bounds. */
export interface ParamBound {
  key: string;
  min: number;
  max: number;
}

export const TEMPLATE_PARAM_BOUNDS: Record<GarmentTemplateId, ParamBound[]> = {
  tshirt: [
    { key: "chestEase", min: 0, max: 0.2 },
    { key: "bodyLength", min: 0.7, max: 1.4 },
    { key: "sleeveLength", min: 0, max: 1 },
    { key: "neckDrop", min: 0, max: 0.25 },
  ],
  skirt: [
    { key: "length", min: 0.2, max: 0.95 },
    { key: "flare", min: 0, max: 0.45 },
    { key: "hipEase", min: 0, max: 0.15 },
  ],
  pants: [
    { key: "length", min: 0.3, max: 1 },
    { key: "legOpening", min: -0.04, max: 0.2 },
    { key: "thighEase", min: 0, max: 0.15 },
    { key: "hipEase", min: 0, max: 0.15 },
  ],
  dress: [
    { key: "chestEase", min: 0, max: 0.15 },
    { key: "waistline", min: -0.4, max: 0.3 },
    { key: "skirtLength", min: 0.25, max: 0.95 },
    { key: "flare", min: 0, max: 0.45 },
    { key: "sleeveLength", min: 0, max: 1 },
  ],
  hoodie: [
    { key: "chestEase", min: 0.04, max: 0.22 },
    { key: "bodyLength", min: 0.8, max: 1.4 },
    { key: "sleeveLength", min: 0.4, max: 1 },
    { key: "hoodScale", min: 0.8, max: 1.3 },
  ],
};

function defaultParamsFor(t: GarmentTemplateId): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of TEMPLATE_PARAM_BOUNDS[t]) out[b.key] = (b.min + b.max) / 2;
  return out;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/* ------------------------------------------------------------------ */
/* 2. Text-heuristic parser (no LLM)                                  */
/* ------------------------------------------------------------------ */

const FABRIC_KEYWORDS: Array<[string, string[]]> = [
  ["denim", ["denim", "jean", "牛仔"]],
  ["leather", ["leather", "皮", "皮革"]],
  ["wool", ["wool", "羊毛", "毛呢"]],
  ["silk", ["silk", "satin", "丝", "丝绸", "缎"]],
  ["linen", ["linen", "亚麻", "麻"]],
  ["cottonJersey", ["cotton", "jersey", "棉", "针织", "t-shirt", "tee"]],
];

function pickFabric(text: string): string {
  const t = text.toLowerCase();
  for (const [id, kws] of FABRIC_KEYWORDS) {
    if (kws.some((k) => t.includes(k))) return id;
  }
  return "cottonJersey";
}

function pickTemplate(text: string): GarmentTemplateId {
  const t = text.toLowerCase();
  // Most specific first.
  if (["hoodie", "hooded", "卫衣", "连帽", "帽衫"].some((k) => t.includes(k))) return "hoodie";
  if (["dress", "gown", "连衣裙", "礼服", "裙装"].some((k) => t.includes(k))) return "dress";
  if (["skirt", "半身裙", "裙"].some((k) => t.includes(k))) return "skirt";
  if (["pant", "trouser", "jean", "裤", "长裤", "短裤"].some((k) => t.includes(k))) return "pants";
  return "tshirt";
}

/**
 * Parse a free-text description into a GarmentSpec via keyword heuristics.
 * Deterministic, dependency-free; the offline path for the closed loop.
 */
export function parseGarmentHint(hint: string): GarmentSpec {
  const t = hint.toLowerCase();
  const template = pickTemplate(t);
  const fabric = pickFabric(t);
  const params = defaultParamsFor(template);

  const loose = ["loose", "oversize", "宽松", "阔"].some((k) => t.includes(k));
  const tight = ["slim", "tight", "fitted", "修身", "紧"].some((k) => t.includes(k));
  const long = ["long", "长", "maxi", "及踝"].some((k) => t.includes(k));
  const short = ["short", "crop", "mini", "短"].some((k) => t.includes(k));

  if (template === "tshirt") {
    if (["sleeveless", "tank", "无袖", "背心"].some((k) => t.includes(k))) params.sleeveLength = 0;
    else if (["long sleeve", "long-sleeve", "longsleeve", "长袖"].some((k) => t.includes(k))) params.sleeveLength = 0.95;
    else params.sleeveLength = 0.32;
    if (["v-neck", "vneck", "v领", "v 领"].some((k) => t.includes(k))) params.neckDrop = 0.18;
    if (loose) params.chestEase = 0.16;
    if (tight) params.chestEase = 0.01;
    if (long) params.bodyLength = 1.3;
    if (short) params.bodyLength = 0.8;
  } else if (template === "skirt") {
    if (long) params.length = 0.9;
    if (short) params.length = 0.3;
    if (["a-line", "a字", "flare", "喇叭", "蓬"].some((k) => t.includes(k))) params.flare = 0.35;
    if (["pencil", "包臀", "直筒"].some((k) => t.includes(k))) params.flare = 0.0;
  } else if (template === "pants") {
    if (["wide", "阔腿", "喇叭裤"].some((k) => t.includes(k))) params.legOpening = 0.16;
    if (["skinny", "紧身", "束脚", "jogger"].some((k) => t.includes(k))) params.legOpening = -0.03;
    if (short || ["shorts", "短裤"].some((k) => t.includes(k))) params.length = 0.45;
    if (loose) params.thighEase = 0.1;
  } else if (template === "dress") {
    if (["sleeveless", "tank", "无袖", "吊带"].some((k) => t.includes(k))) params.sleeveLength = 0;
    else if (["long sleeve", "long-sleeve", "长袖"].some((k) => t.includes(k))) params.sleeveLength = 0.95;
    else params.sleeveLength = 0;
    if (long || ["maxi", "及地", "拖地", "gown", "礼服"].some((k) => t.includes(k))) params.skirtLength = 0.9;
    if (short || ["mini", "迷你"].some((k) => t.includes(k))) params.skirtLength = 0.35;
    if (["empire", "高腰", "帝政"].some((k) => t.includes(k))) params.waistline = -0.3;
    if (["drop-waist", "低腰", "落腰"].some((k) => t.includes(k))) params.waistline = 0.25;
    if (["ball", "蓬蓬", "公主", "a字", "a-line"].some((k) => t.includes(k))) params.flare = 0.4;
  } else if (template === "hoodie") {
    if (["short sleeve", "短袖"].some((k) => t.includes(k))) params.sleeveLength = 0.5;
    else params.sleeveLength = 0.95;
    if (loose || ["oversize", "宽松", "落肩"].some((k) => t.includes(k))) params.chestEase = 0.2;
    if (tight) params.chestEase = 0.06;
    if (long || ["longline", "长款"].some((k) => t.includes(k))) params.bodyLength = 1.3;
    if (short || ["crop", "短款"].some((k) => t.includes(k))) params.bodyLength = 0.85;
    if (["big hood", "大帽", "大帽子"].some((k) => t.includes(k))) params.hoodScale = 1.25;
  }

  return { template, fabric, params };
}

/* ------------------------------------------------------------------ */
/* 1. VLM garment classifier                                          */
/* ------------------------------------------------------------------ */

export interface GarmentClassification {
  template: GarmentTemplateId;
  fabric: string;
  /** Coarse feature words the VLM read off (sleeve/neck/fit). */
  features: string[];
  /** VLM confidence in the template choice, 0..1. */
  confidence: number;
}

const CLASSIFY_SYSTEM = `You are a garment classifier for a procedural clothing
system. Given a reference photo of a single garment (worn or flat), identify:
- template: one of "tshirt" (tee/shirt/tank/sweater), "skirt" (skirt only),
  "pants" (trousers/shorts/jeans), "dress" (one-piece dress/gown), "hoodie"
  (hooded sweatshirt). Prefer "hoodie" for hooded tops and "dress" for
  one-piece dresses; use "skirt" only for standalone skirts.
- fabric: one COARSE class from cottonJersey, denim, wool, leather, silk, linen.
- features: short tags like "long-sleeve", "v-neck", "loose", "a-line",
  "wide-leg", "cropped", "empire-waist", "big-hood".
- confidence: 0..1 for the template choice.
Do not pixel-match texture; pick the closest coarse fabric.
Return ONLY one fenced \`\`\`json block:
{ "template": string, "fabric": string, "features": string[], "confidence": number }`;

/** Parse a classifier reply, tolerating format drift, with safe fallbacks. */
export function parseClassification(reply: string): GarmentClassification {
  let obj: Record<string, unknown> = {};
  try {
    obj = JSON.parse(extractCode(reply)) as Record<string, unknown>;
  } catch {
    obj = {};
  }
  const templates: GarmentTemplateId[] = ["tshirt", "skirt", "pants", "dress", "hoodie"];
  const tRaw = String(obj.template ?? "").toLowerCase();
  const template = (templates as string[]).includes(tRaw) ? (tRaw as GarmentTemplateId) : "tshirt";
  const fRaw = String(obj.fabric ?? "");
  const fabric = FABRIC_IDS.includes(fRaw) ? fRaw : "cottonJersey";
  const features = Array.isArray(obj.features) ? obj.features.map((x) => String(x)) : [];
  const confRaw = typeof obj.confidence === "number" ? obj.confidence : Number(obj.confidence);
  const confidence = Number.isFinite(confRaw) ? Math.max(0, Math.min(1, confRaw)) : 0.5;
  return { template, fabric, features, confidence };
}

/** Run the VLM classifier on a reference photo (base64 PNG, no data: prefix). */
export async function classifyGarment(
  client: LlmClient,
  referenceBase64: string,
  hint?: string,
): Promise<GarmentClassification> {
  const messages: LlmMessage[] = [
    { role: "system", content: CLASSIFY_SYSTEM },
    {
      role: "user",
      content: hint ? `Reference attached. Hint: ${hint}.` : "Reference attached. Classify it.",
      imageBase64: referenceBase64,
    },
  ];
  const reply = await client.complete(messages);
  return parseClassification(reply);
}

/**
 * Turn a classification into a starting GarmentSpec: template + fabric from the
 * VLM, continuous params seeded by folding the feature tags through the text
 * heuristic (so "long-sleeve" etc. set sensible starting knobs).
 */
export function classificationToSpec(c: GarmentClassification): GarmentSpec {
  const seed = parseGarmentHint([c.template, ...c.features].join(" "));
  return { template: c.template, fabric: c.fabric, params: seed.params };
}

/* ------------------------------------------------------------------ */
/* 3. Black-box parameter optimizer                                   */
/* ------------------------------------------------------------------ */

export interface OptimizeOptions {
  /** Build parts for a spec, render, and return a score in 0..1 (higher better). */
  evaluate: (spec: GarmentSpec) => Promise<number> | number;
  /** Max coordinate-descent rounds over all params. Default 4. */
  rounds?: number;
  /** Initial step as a fraction of each param's range. Default 0.4. */
  initialStep?: number;
  /** Step decay per round. Default 0.5. */
  stepDecay?: number;
  /** Stop once score reaches this. Default 0.97. */
  targetScore?: number;
  onStep?: (info: { round: number; key: string; spec: GarmentSpec; score: number }) => void;
}

export interface OptimizeResult {
  spec: GarmentSpec;
  score: number;
  evaluations: number;
}

/**
 * Deterministic coordinate-descent / hill-climb over the template's continuous
 * params. For each param it tries +step and -step (clamped to bounds), keeps
 * the best, then shrinks the step. No randomness => reproducible fits.
 */
export async function optimizeGarment(
  start: GarmentSpec,
  opts: OptimizeOptions,
): Promise<OptimizeResult> {
  const rounds = Math.max(1, opts.rounds ?? 4);
  const stepDecay = opts.stepDecay ?? 0.5;
  const targetScore = opts.targetScore ?? 0.97;
  const bounds = TEMPLATE_PARAM_BOUNDS[start.template];

  let bestSpec: GarmentSpec = { template: start.template, fabric: start.fabric, params: { ...start.params } };
  let bestScore = await opts.evaluate(bestSpec);
  let evaluations = 1;
  let stepFrac = opts.initialStep ?? 0.4;

  for (let round = 0; round < rounds; round++) {
    let improvedThisRound = false;
    for (const b of bounds) {
      const range = b.max - b.min;
      const step = range * stepFrac;
      const cur = bestSpec.params[b.key] ?? (b.min + b.max) / 2;
      for (const delta of [step, -step]) {
        const trial = clamp(cur + delta, b.min, b.max);
        if (Math.abs(trial - cur) < 1e-9) continue;
        const trialSpec: GarmentSpec = {
          template: bestSpec.template,
          fabric: bestSpec.fabric,
          params: { ...bestSpec.params, [b.key]: trial },
        };
        const s = await opts.evaluate(trialSpec);
        evaluations++;
        opts.onStep?.({ round, key: b.key, spec: trialSpec, score: s });
        if (s > bestScore + 1e-6) {
          bestScore = s;
          bestSpec = trialSpec;
          improvedThisRound = true;
          break; // accept first improving move on this axis
        }
      }
      if (bestScore >= targetScore) break;
    }
    stepFrac *= stepDecay;
    if (bestScore >= targetScore) break;
    if (!improvedThisRound && stepFrac < 0.02) break;
  }

  return { spec: bestSpec, score: bestScore, evaluations };
}

/** Convenience: build parts for a spec via the template registry. */
export function buildSpec(spec: GarmentSpec, measures: Record<string, number> = {}): NamedPart[] {
  return buildGarment(spec.template, { ...spec.params, fabric: spec.fabric, measures });
}

