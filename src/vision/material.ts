/**
 * Material classification (P7) — the "don't turn metal into leather" guard.
 *
 * The hard requirement is getting the *surface category* right; exact texture
 * is explicitly not the goal. So this module's job is: from a sample patch (or
 * a VLM's verdict), pick a procedural material family and a confidence. When
 * confidence is low we fall back to a safe neutral material rather than guess
 * a wrong category.
 *
 * Two classifiers are provided:
 *  - A heuristic feature classifier (no network): coarse, uses color/contrast.
 *  - A VLM-backed classifier (preferred): asks a vision model for the category,
 *    which is far more reliable for surface type than pixel heuristics.
 * The map from category -> material id lives here so both paths agree.
 */
import type { Raster } from "./raster.js";
import { meanColor, meanSaturation, luminanceStdDev, meanLuminance } from "./color.js";
import type { LlmClient } from "../agent/llm.js";

/** Coarse surface categories Meshova can represent procedurally today. */
export type MaterialCategory =
  | "metal"
  | "rustedMetal"
  | "animalCoat"
  | "leather"
  | "fabric"
  | "wood"
  | "ceramic"
  | "plastic"
  | "stone"
  | "brick"
  | "unknown";

/** Map a category to a procedural material id (+ optional tint hints). */
export interface MaterialChoice {
  category: MaterialCategory;
  /** Texture preset or surface type id, or null for neutral. */
  preset: string | null;
  confidence: number; // 0..1
  /** Suggested base tint (linear 0..1) from the sample, for micro-tuning. */
  tint?: [number, number, number];
  /** Human-readable reasoning for logs/UI. */
  reason: string;
}

/**
 * Category -> material family. Categories without a dedicated material map to
 * the closest available recipe; this is where we extend as surfaces grow. Keeping
 * the table explicit makes the "metal stays metal" contract auditable.
 */
export const CATEGORY_TO_PRESET: Record<MaterialCategory, string | null> = {
  metal: "metal",
  rustedMetal: "rustyMetal",
  animalCoat: "shortCoat",
  leather: "leather",
  fabric: "fabric",
  wood: "wood",
  ceramic: "ceramic",
  plastic: "plastic",
  stone: "stone",
  brick: "brick",
  unknown: null, // neutral fallback — never guess a category
};

const CONFIDENCE_FLOOR = 0.45;

function toLinear(c: [number, number, number]): [number, number, number] {
  return [c[0] / 255, c[1] / 255, c[2] / 255];
}

/**
 * Heuristic, network-free classifier. It is intentionally conservative: it
 * separates broad buckets by metallic-looking achromatic-but-bright vs. warm
 * organic tones vs. high-contrast stone, and reports modest confidence so the
 * VLM path (or user) can override. Not a substitute for the VLM classifier.
 */
export function classifyByFeatures(patch: Raster): MaterialChoice {
  const mean = meanColor(patch);
  const sat = meanSaturation(patch);
  const std = luminanceStdDev(patch);
  const lum = meanLuminance(patch);
  const tint = toLinear(mean);

  // Achromatic + fairly bright + low-mid texture => bare metal/ceramic-ish.
  if (sat < 0.18 && lum > 0.35) {
    if (std < 0.12) {
      return { category: "ceramic", preset: CATEGORY_TO_PRESET.ceramic, confidence: 0.5, tint, reason: "low saturation, smooth, bright -> ceramic/plastic" };
    }
    return { category: "metal", preset: CATEGORY_TO_PRESET.metal, confidence: 0.5, tint, reason: "low saturation, bright, some texture -> metal" };
  }
  // Warm hue (r>g>b) + moderate texture => wood/leather/fabric family.
  if (mean[0] > mean[2] && std > 0.08) {
    return { category: "wood", preset: CATEGORY_TO_PRESET.wood, confidence: 0.45, tint, reason: "warm tone with grain-like contrast -> wood" };
  }
  // High contrast, desaturated, darker => stone.
  if (sat < 0.25 && std > 0.16) {
    return { category: "stone", preset: CATEGORY_TO_PRESET.stone, confidence: 0.45, tint, reason: "high-contrast desaturated -> stone" };
  }
  return { category: "unknown", preset: null, confidence: 0.2, tint, reason: "no confident heuristic match -> neutral fallback" };
}

const VALID_CATEGORIES = new Set<string>([
  "metal", "rustedMetal", "animalCoat", "leather", "fabric", "wood", "ceramic", "plastic", "stone", "brick", "unknown",
]);

const CLASSIFY_PROMPT = `You are a material classifier for a procedural material library.
Look at the image and decide the dominant SURFACE CATEGORY of the main object.
Choose exactly one from this list:
  metal, rustedMetal, animalCoat, leather, fabric, wood, ceramic, plastic,
  stone, brick, unknown
Getting the broad category right matters more than detail. If you are not
reasonably sure, answer "unknown" rather than guessing.
Reply with ONLY a compact JSON object, no prose:
{"category":"<one>","confidence":<0..1>,"reason":"<short>"}`;

/**
 * VLM-backed classifier (preferred). Sends the patch to a vision model and
 * parses its category + confidence. Falls back to "unknown" on any parse
 * failure, honoring the never-guess rule. The image must be a base64 PNG.
 */
export async function classifyByVlm(
  client: LlmClient,
  imageBase64: string,
  featureHint?: MaterialChoice,
): Promise<MaterialChoice> {
  const reply = await client.complete([
    { role: "system", content: CLASSIFY_PROMPT },
    {
      role: "user",
      content: featureHint
        ? `A heuristic guessed "${featureHint.category}" (low confidence). Classify the surface.`
        : "Classify the surface in this image.",
      imageBase64,
    },
  ]);
  const match = /\{[\s\S]*\}/.exec(reply);
  if (!match) return { category: "unknown", preset: null, confidence: 0.1, reason: "VLM reply unparseable" };
  try {
    const parsed = JSON.parse(match[0]) as { category?: string; confidence?: number; reason?: string };
    const cat = (parsed.category && VALID_CATEGORIES.has(parsed.category) ? parsed.category : "unknown") as MaterialCategory;
    const choice: MaterialChoice = {
      category: cat,
      preset: CATEGORY_TO_PRESET[cat],
      confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.6,
      reason: parsed.reason ?? "VLM classification",
    };
    if (featureHint?.tint) choice.tint = featureHint.tint;
    return choice;
  } catch {
    return { category: "unknown", preset: null, confidence: 0.1, reason: "VLM JSON parse error" };
  }
}

/**
 * Resolve a final material choice with the confidence guard applied. If the
 * best available confidence is below the floor, the category is forced to
 * "unknown" with a null preset so callers apply a neutral material instead of
 * a possibly-wrong one (e.g. avoid painting leather as metal).
 */
export function resolveWithGuard(choice: MaterialChoice): MaterialChoice {
  if (choice.confidence < CONFIDENCE_FLOOR || choice.preset === null) {
    return {
      category: "unknown",
      preset: null,
      confidence: choice.confidence,
      reason: `${choice.reason} (below confidence floor ${CONFIDENCE_FLOOR}; using neutral)`,
      ...(choice.tint ? { tint: choice.tint } : {}),
    };
  }
  return choice;
}
