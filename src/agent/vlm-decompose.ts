/**
 * VLM semantic decomposition (P7+) — turn a reference photo (optionally with
 * aligned render channels) into a STRUCTURED part list the modeling loop can
 * act on. This is the "understand before you build" step: instead of letting
 * the model free-associate, we ask a vision LLM to enumerate parts with their
 * rough position, relative size, shape primitive, and a coarse material class.
 *
 * Feeding multiple ALIGNED channels (pbr + normal + depth) of the same pose
 * helps the VLM separate true geometry (a real protrusion shows in normal +
 * depth) from surface markings (a painted line shows only in pbr). That keeps
 * the decomposition honest about what is 3D structure vs. texture.
 *
 * The output is plain data — no geometry is generated here. It seeds the
 * script-writing prompt and gives the optimizer a per-part checklist.
 */
import { extractCode, type LlmClient, type LlmMessage } from "./llm.js";

/** Coarse, classifier-style material buckets (never pixel-matched). */
export type MaterialClass =
  | "metal" | "plastic" | "wood" | "fabric" | "glass" | "ceramic"
  | "stone" | "rubber" | "skin" | "foliage" | "liquid" | "unknown";

export interface DecomposedPart {
  /** Stable, lowercase name, e.g. "seat", "left-armrest". */
  name: string;
  /** One-line description of the part's role/shape. */
  description: string;
  /** Suggested base primitive(s) to compose it from. */
  primitive: string;
  /** Rough normalized center in the reference, 0..1 (x right, y up). */
  position: { x: number; y: number };
  /** Rough normalized size, 0..1 of the object's bounding box. */
  size: { w: number; h: number };
  /** Coarse material category for preset selection (not pixel matching). */
  material: MaterialClass;
  /** Semantic parent part, when this component attaches to another. */
  parent?: string;
  /** Visible contact/assembly relation to the parent or neighboring structure. */
  attachment?: "embedded" | "overlap" | "socket" | "hinge" | "surface-contact" | "separate" | "unknown";
  /** Relative depth cue inferred from the reference view. */
  depth?: "front" | "middle" | "back" | "spans-depth" | "unknown";
  /** Short regional color description; never a baked texture instruction. */
  color?: string;
  /** VLM confidence this is true 3D structure (not a surface marking), 0..1. */
  confidence: number;
}

export interface Decomposition {
  /** Short object label, e.g. "office chair". */
  object: string;
  /** Dominant symmetry, helps the modeler mirror parts. */
  symmetry: "none" | "bilateral" | "radial";
  parts: DecomposedPart[];
  /** Free-form notes (proportions, key silhouette features). */
  notes?: string;
}

/** Channel image bundle for one pose. All PNGs are base64 (no data: prefix). */
export interface ChannelImages {
  /** The real reference photo. */
  reference: string;
  /** Aligned PBR render of the current attempt (optional). */
  pbr?: string;
  /** Aligned surface-normal render (optional). */
  normal?: string;
  /** Aligned depth render (optional). */
  depth?: string;
}

export interface DecomposeOptions {
  client: LlmClient;
  images: ChannelImages;
  /** Optional text hint, e.g. "a swivel office chair". */
  hint?: string;
  /** Cap the number of parts to keep the breakdown actionable. Default 12. */
  maxParts?: number;
}

const SYSTEM_PROMPT = `You are a 3D part-decomposition analyst for Meshova.
Given a reference image (and optionally aligned PBR/normal/depth renders of a
current attempt), break the object into the SMALLEST set of 3D parts needed to
reproduce its SHAPE. Distinguish true geometry from surface markings:
- A real protrusion/indent appears in the NORMAL and DEPTH channels.
- A painted line, seam, decal, or color boundary appears only in PBR/photo and
  must NOT become its own part — note it as surface detail instead.

Rules:
- Prefer few, meaningful parts over many tiny ones.
- Use normalized coordinates: x in [0,1] left->right, y in [0,1] bottom->top.
- size is the part's fraction of the whole object's bounding box.
- material is a COARSE class only (metal/plastic/wood/fabric/glass/ceramic/
  stone/rubber/skin/foliage/liquid/unknown). Do not pixel-match texture.
- parent + attachment describe the visible assembly graph. Never leave a child
  floating when the image shows contact, overlap, embedding, a socket, or hinge.
- depth is front/middle/back/spans-depth/unknown relative to the reference camera.
- color is a short regional palette description, not a texture extraction.
- confidence is how sure you are the part is real 3D structure (0..1). Mark
  ambiguous surface markings with low confidence.
- Respect symmetry: name mirrored parts like "left-armrest"/"right-armrest".
Return ONLY one fenced \`\`\`json code block matching this TypeScript type:
{ "object": string, "symmetry": "none"|"bilateral"|"radial",
  "parts": [ { "name": string, "description": string, "primitive": string,
    "position": {"x":number,"y":number}, "size": {"w":number,"h":number},
    "material": string, "parent"?: string,
    "attachment"?: "embedded"|"overlap"|"socket"|"hinge"|"surface-contact"|"separate"|"unknown",
    "depth"?: "front"|"middle"|"back"|"spans-depth"|"unknown",
    "color"?: string, "confidence": number } ],
  "notes"?: string }`;

/** Build the multi-image user turn from whatever channels are available. */
function buildUserMessage(opts: DecomposeOptions): LlmMessage {
  const imgs: string[] = [opts.images.reference];
  const labels = ["Image 1 = reference photo."];
  let n = 2;
  if (opts.images.pbr) { imgs.push(opts.images.pbr); labels.push(`Image ${n++} = current PBR render (same pose).`); }
  if (opts.images.normal) { imgs.push(opts.images.normal); labels.push(`Image ${n++} = surface-normal render.`); }
  if (opts.images.depth) { imgs.push(opts.images.depth); labels.push(`Image ${n++} = depth render.`); }
  const cap = opts.maxParts ?? 12;
  const content = [
    opts.hint ? `Hint: ${opts.hint}.` : "",
    labels.join(" "),
    `Decompose into at most ${cap} parts. Use the normal/depth channels (if present) to avoid turning surface markings into parts.`,
  ].filter(Boolean).join("\n");
  return { role: "user", content, imagesBase64: imgs };
}

/** Parse the VLM reply into a Decomposition, tolerating minor format drift. */
export function parseDecomposition(reply: string): Decomposition {
  const raw = extractCode(reply);
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error("parseDecomposition: reply was not valid JSON");
  }
  const o = obj as Record<string, unknown>;
  const partsIn = Array.isArray(o.parts) ? (o.parts as Record<string, unknown>[]) : [];
  const clamp01 = (v: unknown, d = 0): number => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : d;
  };
  const parts: DecomposedPart[] = partsIn.map((p, i) => {
    const pos = (p.position ?? {}) as Record<string, unknown>;
    const size = (p.size ?? {}) as Record<string, unknown>;
    const part: DecomposedPart = {
      name: typeof p.name === "string" && p.name ? p.name : `part-${i}`,
      description: typeof p.description === "string" ? p.description : "",
      primitive: typeof p.primitive === "string" ? p.primitive : "box",
      position: { x: clamp01(pos.x, 0.5), y: clamp01(pos.y, 0.5) },
      size: { w: clamp01(size.w, 0.3), h: clamp01(size.h, 0.3) },
      material: normalizeMaterial(p.material),
      confidence: clamp01(p.confidence, 0.5),
    };
    if (typeof p.parent === "string" && p.parent) part.parent = p.parent;
    const attachment = normalizeChoice(p.attachment, ["embedded", "overlap", "socket", "hinge", "surface-contact", "separate", "unknown"] as const);
    const depth = normalizeChoice(p.depth, ["front", "middle", "back", "spans-depth", "unknown"] as const);
    if (attachment) part.attachment = attachment;
    if (depth) part.depth = depth;
    if (typeof p.color === "string" && p.color) part.color = p.color;
    return part;
  });
  const sym = o.symmetry;
  return {
    object: typeof o.object === "string" ? o.object : "object",
    symmetry: sym === "bilateral" || sym === "radial" ? sym : "none",
    parts,
    ...(typeof o.notes === "string" ? { notes: o.notes } : {}),
  };
}

function normalizeMaterial(v: unknown): MaterialClass {
  const known: MaterialClass[] = [
    "metal", "plastic", "wood", "fabric", "glass", "ceramic",
    "stone", "rubber", "skin", "foliage", "liquid", "unknown",
  ];
  const s = String(v ?? "").toLowerCase();
  return (known as string[]).includes(s) ? (s as MaterialClass) : "unknown";
}

function normalizeChoice<const T extends readonly string[]>(value: unknown, choices: T): T[number] | undefined {
  const normalized = String(value ?? "").toLowerCase();
  return choices.includes(normalized) ? normalized as T[number] : undefined;
}

/** Run one decomposition pass: prompt the VLM, parse the structured result. */
export async function decomposeImage(opts: DecomposeOptions): Promise<Decomposition> {
  const messages: LlmMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    buildUserMessage(opts),
  ];
  const reply = await opts.client.complete(messages);
  return parseDecomposition(reply);
}

/**
 * Render a decomposition into a compact text checklist to inject into the
 * script-writing prompt — so the modeler builds the parts the analyst found,
 * in the right places, with the right coarse materials.
 */
export function decompositionToPrompt(d: Decomposition): string {
  const lines = [
    `Object: ${d.object} (symmetry: ${d.symmetry}).`,
    "Build these parts; keep each at its noted position/size:",
  ];
  for (const p of d.parts) {
    const conf = p.confidence < 0.5 ? " [low-confidence: may be surface detail, verify before adding]" : "";
    lines.push(
      `- ${p.name}: ${p.description} | primitive=${p.primitive}` +
      ` pos=(${p.position.x.toFixed(2)},${p.position.y.toFixed(2)})` +
      ` size=(${p.size.w.toFixed(2)}x${p.size.h.toFixed(2)}) material=${p.material}` +
      `${p.color ? ` color=${p.color}` : ""}${p.depth ? ` depth=${p.depth}` : ""}` +
      `${p.parent ? ` parent=${p.parent} attachment=${p.attachment ?? "unknown"}` : ""}${conf}`,
    );
  }
  if (d.notes) lines.push(`Notes: ${d.notes}`);
  return lines.join("\n");
}
