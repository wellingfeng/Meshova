import { extractCode, type LlmClient, type LlmMessage } from "../agent/llm.js";
import type { AIGuidedSplitMethod, AIGuidedSplitPart, AIGuidedSplitPlan } from "../geometry/ai-split.js";

export interface PlanAIGuidedSplitByVlmOptions {
  client: LlmClient;
  /** PNG screenshot, base64 without data: prefix. */
  imageBase64: string;
  /** Weak context only. Image stays source of truth. */
  hint?: string;
  /** Max target parts requested from VLM. Default 12. */
  maxParts?: number;
}

const METHODS = new Set<string>(["cut", "regenerate"]);

const SYSTEM_PROMPT = `You are Meshova's AI-guided mesh split planner.
Look at the rendered object screenshot. Identify the actual object and visible meaningful parts.
Do not use filenames, prompt substrings, or UI labels as ground truth.
Prefer "cut" for parts that can be segmented from the current mesh.
Use "regenerate" only when a part is fused/missing/too blurry and should be replaced by an external image-to-3D worker.

Return ONLY compact JSON. bbox is normalized screen box [x0,y0,x1,y1] from top-left:
{"objectLabel":"<简体中文物体名>","confidence":0..1,"parts":[{"key":"stable_ascii_key","label":"<简体中文部件名>","role":"short","confidence":0..1,"method":"cut|regenerate","bbox":[0,0,1,1],"generationPrompt":"optional Chinese prompt"}],"notes":["short"]}`;

function clamp01(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

function text(value: unknown, fallback = ""): string {
  const s = typeof value === "string" ? value.trim() : "";
  return s || fallback;
}

function key(value: unknown, fallback: string): string {
  const raw = text(value, fallback).toLowerCase();
  const out = raw.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return out || fallback;
}

function method(value: unknown): AIGuidedSplitMethod {
  const s = text(value, "cut").toLowerCase();
  return METHODS.has(s) ? (s as AIGuidedSplitMethod) : "cut";
}

function bbox(value: unknown): readonly [number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length < 4) return undefined;
  const out = value.slice(0, 4).map((item) => clamp01(item, Number.NaN));
  if (out.some((item) => !Number.isFinite(item))) return undefined;
  return out as [number, number, number, number];
}

export function parseAIGuidedSplitPlan(reply: string): AIGuidedSplitPlan {
  const raw = extractCode(reply);
  const match = /\{[\s\S]*\}/.exec(raw);
  if (!match) return { confidence: 0.1, parts: [], source: "ai", notes: ["VLM reply unparseable"] };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return { confidence: 0.1, parts: [], source: "ai", notes: ["VLM JSON parse error"] };
  }

  const rawParts = Array.isArray(parsed.parts) ? (parsed.parts as Record<string, unknown>[]) : [];
  const parts: AIGuidedSplitPart[] = [];
  for (let i = 0; i < rawParts.length; i++) {
    const item = rawParts[i]!;
    const label = text(item.label);
    if (!label) continue;
    const part: AIGuidedSplitPart = {
      key: key(item.key, `ai_part_${i + 1}`),
      label,
      confidence: clamp01(item.confidence, 0.6),
      method: method(item.method),
    };
    const role = text(item.role);
    if (role) part.role = role;
    const generationPrompt = text(item.generationPrompt);
    if (generationPrompt) part.generationPrompt = generationPrompt;
    const partBox = bbox(item.bbox);
    if (partBox) part.bbox = partBox;
    parts.push(part);
  }

  const plan: AIGuidedSplitPlan = {
    confidence: clamp01(parsed.confidence, parts.length ? 0.6 : 0.1),
    parts,
    source: "ai",
  };
  const objectLabel = text(parsed.objectLabel ?? parsed.object);
  if (objectLabel) plan.objectLabel = objectLabel;
  const notes = Array.isArray(parsed.notes)
    ? parsed.notes.map((item) => text(item)).filter(Boolean)
    : [];
  if (notes.length) plan.notes = notes;
  return plan;
}

function buildMessages(opts: PlanAIGuidedSplitByVlmOptions): LlmMessage[] {
  const maxParts = Math.max(1, Math.floor(opts.maxParts ?? 12));
  const hint = opts.hint ? `Weak context hint: ${opts.hint}` : "";
  const content = [
    hint,
    `Plan up to ${maxParts} meaningful mesh parts. Use stable ASCII keys. Labels must be Simplified Chinese.`,
  ].filter(Boolean).join("\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content, imageBase64: opts.imageBase64 },
  ];
}

export async function planAIGuidedSplitByVlm(opts: PlanAIGuidedSplitByVlmOptions): Promise<AIGuidedSplitPlan> {
  const reply = await opts.client.complete(buildMessages(opts));
  return parseAIGuidedSplitPlan(reply);
}
