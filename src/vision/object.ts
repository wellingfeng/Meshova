/**
 * Object-level semantic recognition for imported/viewer screenshots.
 *
 * This module is intentionally VLM-first: it does not guess "vehicle" from
 * filenames, prompts, or visible UI text. If the VLM is unsure or unparseable,
 * callers get `unknown` and should keep generic UI labels.
 */
import { extractCode, type LlmClient, type LlmMessage } from "../agent/llm.js";

export type ObjectSemanticCategory =
  | "character"
  | "animal"
  | "vehicle"
  | "furniture"
  | "plant"
  | "architecture"
  | "equipment"
  | "food"
  | "prop"
  | "unknown";

export interface ObjectPartSemanticLabel {
  /** Stable mesh key when caller provided part keys. */
  name?: string;
  /** Simplified Chinese UI label. */
  label: string;
  role?: string;
  confidence: number;
}

export interface ObjectSemanticAnalysis {
  /** Simplified Chinese object name, e.g. "灭霸手套". */
  object: string;
  category: ObjectSemanticCategory;
  confidence: number;
  parts: ObjectPartSemanticLabel[];
  reason: string;
}

export interface ClassifyObjectByVlmOptions {
  client: LlmClient;
  /** PNG screenshot, base64 without data: prefix. */
  imageBase64: string;
  /**
   * Optional stable mesh part keys. If supplied, the VLM should label these
   * keys instead of inventing unrelated mesh IDs.
   */
  partKeys?: ReadonlyArray<string>;
  /** Optional context. Treated as weak hint only, never as ground truth. */
  hint?: string;
}

const CATEGORIES = new Set<string>([
  "character",
  "animal",
  "vehicle",
  "furniture",
  "plant",
  "architecture",
  "equipment",
  "food",
  "prop",
  "unknown",
]);

const SYSTEM_PROMPT = `You are Meshova's screenshot semantic recognizer.
Look at the rendered model image and identify the ACTUAL visible object.
Do not infer the category from filenames, prompt text, UI labels, or substrings.
Use the image as the source of truth. If uncertain, use category "unknown".

Return ONLY one compact JSON object:
{"object":"<简体中文物体名>","category":"character|animal|vehicle|furniture|plant|architecture|equipment|food|prop|unknown","confidence":0..1,"parts":[{"name":"<optional supplied mesh key>","label":"<简体中文部件名>","role":"<short>","confidence":0..1}],"reason":"<short>"}`;

function clamp01(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

function normalizeCategory(value: unknown): ObjectSemanticCategory {
  const s = String(value ?? "").trim().toLowerCase();
  return CATEGORIES.has(s) ? (s as ObjectSemanticCategory) : "unknown";
}

function normalizeText(value: unknown, fallback: string): string {
  const s = typeof value === "string" ? value.trim() : "";
  return s || fallback;
}

function unknown(reason: string): ObjectSemanticAnalysis {
  return { object: "未知物体", category: "unknown", confidence: 0.1, parts: [], reason };
}

export function parseObjectSemanticAnalysis(reply: string): ObjectSemanticAnalysis {
  const raw = extractCode(reply);
  const match = /\{[\s\S]*\}/.exec(raw);
  if (!match) return unknown("VLM reply unparseable");

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return unknown("VLM JSON parse error");
  }

  const category = normalizeCategory(parsed.category);
  const partsIn = Array.isArray(parsed.parts) ? (parsed.parts as Record<string, unknown>[]) : [];
  const parts: ObjectPartSemanticLabel[] = partsIn
    .map((part) => {
      const label = normalizeText(part.label, "");
      if (!label) return null;
      const out: ObjectPartSemanticLabel = {
        label,
        confidence: clamp01(part.confidence, 0.6),
      };
      const name = normalizeText(part.name, "");
      const role = normalizeText(part.role, "");
      if (name) out.name = name;
      if (role) out.role = role;
      return out;
    })
    .filter((part): part is ObjectPartSemanticLabel => part !== null);

  return {
    object: normalizeText(parsed.object, "未知物体"),
    category,
    confidence: clamp01(parsed.confidence, category === "unknown" ? 0.1 : 0.6),
    parts,
    reason: normalizeText(parsed.reason, "VLM classification"),
  };
}

function buildMessages(opts: ClassifyObjectByVlmOptions): LlmMessage[] {
  const partKeys = opts.partKeys?.length ? `Known mesh part keys: ${opts.partKeys.join(", ")}.` : "";
  const hint = opts.hint ? `Weak context hint: ${opts.hint}` : "";
  const content = [
    hint,
    partKeys,
    "Classify the main visible 3D model from the screenshot. Label supplied mesh keys only when visually clear.",
  ].filter(Boolean).join("\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content, imageBase64: opts.imageBase64 },
  ];
}

export async function classifyObjectByVlm(opts: ClassifyObjectByVlmOptions): Promise<ObjectSemanticAnalysis> {
  const reply = await opts.client.complete(buildMessages(opts));
  return parseObjectSemanticAnalysis(reply);
}
