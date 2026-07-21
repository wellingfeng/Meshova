/**
 * B/C-tier VLM critique — the aesthetic + realism judgment the deterministic
 * critic can't make. It shows a vision LLM one or more renders (ideally
 * multi-view) and a category rubric, and asks for two 0..1 scores plus concrete,
 * part-located issues. This is the *expensive* tier, so callers run it at
 * milestones, not every iteration.
 *
 * It never pixel-matches and never bakes an image: it returns structured data
 * (`VlmCritique`) that folds into `critique(..., { vlm })` exactly like the
 * deterministic axes, so downstream feedback formatting stays uniform.
 */
import { extractCode, type LlmClient, type LlmMessage } from "../agent/llm.js";
import type { Rubric } from "./rubric.js";
import { rubricForGoal } from "./rubric.js";
import type {
  CritiqueAxis,
  CritiqueIssue,
  Severity,
  VlmCritique,
  VlmFeatureReview,
  VlmReviewLayer,
} from "./critic.js";

export interface VlmCriticalFeature {
  id: string;
  label: string;
  description: string;
}

export interface VlmCritiqueOptions {
  client: LlmClient;
  goal: string;
  /** One or more renders of the SAME model. base64 PNG (no data: prefix). */
  rendersBase64: string[];
  /** Optional reference photo (image-target mode). Compared for realism. */
  referenceBase64?: string;
  /** Labels aligned with rendersBase64, e.g. front, side, neutral, grazing. */
  renderLabels?: string[];
  /** Current locked reconstruction pass. Changes review priority, not schema. */
  phase?: string;
  /** Identity-defining systems that must be scored independently. */
  criticalFeatures?: readonly VlmCriticalFeature[];
  /** Override the auto-selected rubric. */
  rubric?: Rubric;
}

const REVIEW_LAYERS: readonly VlmReviewLayer[] = [
  "silhouetteProportion",
  "componentStructure",
  "spatialStructure",
  "formDetail",
  "colorPalette",
  "materialSurface",
  "lightingCamera",
];

function buildSystemPrompt(rubric: Rubric, opts: VlmCritiqueOptions): string {
  const checks = rubric.checklist.map((c, i) => `  ${i + 1}. ${c}`).join("\n");
  const features = (opts.criticalFeatures ?? [])
    .map((feature) => `  - ${feature.id}: ${feature.label} — ${feature.description}`)
    .join("\n");
  return `You are a senior 3D art director reviewing a procedurally generated
model of a "${rubric.category}". You are shown one or more renders of the SAME
model (multiple camera angles when available), optionally with a reference photo.

Judge these layers independently, each 0..1:
- silhouetteProportion: outer contour, mass distribution, aspect ratios, negative space.
- componentStructure: required parts, hierarchy, repetition, joints, contact points.
- spatialStructure: depth, relative placement, overlap, support, attachment, no floating parts.
- formDetail: curvature, taper, bevels, secondary forms, local geometry.
- colorPalette: dominant/accent colors, value grouping, regional color placement.
- materialSurface: roughness/metalness response, normals, tactile frequency, local wear.
- lightingCamera: reference camera match, exposure, shadow/contact response, readable highlights.

Also judge two aggregate qualities, each 0..1:
- aesthetic: proportion balance, silhouette readability, part balance, detail
  density, material/color plausibility. Is it visually coherent and appealing?
- realism: does it match how a real ${rubric.category} is built and proportioned?
  Use this checklist:
${checks}

Current locked pass: ${opts.phase ?? "unspecified"}. Prioritize that pass, but report regressions in solved layers.
visualScore is the acceptance score for the CURRENT locked pass. Score every
layer, but do not lower visualScore for later-pass work that is intentionally deferred.
${features ? `Critical semantic systems (score each independently; visible=false when evidence cannot prove it):\n${features}` : "No explicit critical semantic systems were supplied."}

Report concrete, actionable problems. Each issue names the offending part when
you can identify it, states what is wrong, and gives a fix the modeler can act
on. Prioritize the biggest structural/proportion errors over tiny detail.

Compare the reference only with the render labeled as its matched/reference view.
Use auxiliary angles to judge real 3D volume and spatial structure, not camera match.
Use neutral/grazing views to judge PBR response, not reference lighting similarity.
Do NOT pixel-match textures. Do not hide a failed critical feature inside a high average.
Return ONLY one fenced \`\`\`json code block matching this TypeScript type:
{ "visualScore": number, "confidence": number,
  "aesthetic": number, "realism": number,
  "layerScores": {
    "silhouetteProportion": number, "componentStructure": number,
    "spatialStructure": number, "formDetail": number,
    "colorPalette": number, "materialSurface": number,
    "lightingCamera": number },
  "featureReviews": [ { "id": string, "score": number,
    "visible": boolean, "notes"?: string } ],
  "summary": string,
  "issues": [ { "axis": "aesthetic"|"realism", "severity": "hard"|"soft",
    "part"?: string, "finding": string, "suggestion": string } ] }`;
}

function buildUserMessage(opts: VlmCritiqueOptions): LlmMessage {
  const imgs: string[] = [];
  const labels: string[] = [];
  let n = 1;
  if (opts.referenceBase64) {
    imgs.push(opts.referenceBase64);
    labels.push(`Image ${n++} = reference photo (the target).`);
  }
  for (const [index, r] of opts.rendersBase64.entries()) {
    imgs.push(r);
    const label = opts.renderLabels?.[index] ?? `angle-${index + 1}`;
    labels.push(`Image ${n++} = model render (${label}).`);
  }
  const content = [
    `Goal: ${opts.goal}.`,
    labels.join(" "),
    "Score aesthetic and realism, and list the issues to fix next.",
  ].join("\n");
  return { role: "user", content, imagesBase64: imgs };
}

const clamp01 = (v: unknown, d = 0.5): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : d;
};

function optionalScore(value: unknown): number | undefined {
  const score = typeof value === "number" ? value : Number(value);
  return Number.isFinite(score) ? clamp01(score) : undefined;
}

/** Parse a VLM critique reply into structured scores + issues, tolerant of drift. */
export function parseVlmCritique(reply: string): VlmCritique {
  let obj: unknown;
  try {
    obj = JSON.parse(extractCode(reply));
  } catch {
    throw new Error("parseVlmCritique: reply was not valid JSON");
  }
  const o = obj as Record<string, unknown>;
  const rawLayers = o.layerScores && typeof o.layerScores === "object"
    ? o.layerScores as Record<string, unknown>
    : {};
  const layerScores: Partial<Record<VlmReviewLayer, number>> = {};
  for (const layer of REVIEW_LAYERS) {
    const score = optionalScore(rawLayers[layer]);
    if (score !== undefined) layerScores[layer] = score;
  }
  const rawFeatures = Array.isArray(o.featureReviews)
    ? o.featureReviews as Record<string, unknown>[]
    : [];
  const featureReviews: VlmFeatureReview[] = rawFeatures
    .filter((review) => typeof review.id === "string" && review.id.length > 0)
    .map((review) => {
      const result: VlmFeatureReview = {
        id: String(review.id),
        score: clamp01(review.score, 0),
        visible: review.visible === true,
      };
      if (typeof review.notes === "string" && review.notes) result.notes = review.notes;
      return result;
    });
  const rawIssues = Array.isArray(o.issues) ? (o.issues as Record<string, unknown>[]) : [];
  const issues: CritiqueIssue[] = rawIssues.map((i) => {
    const axis: CritiqueAxis = i.axis === "aesthetic" ? "aesthetic" : "realism";
    const severity: Severity = i.severity === "hard" ? "hard" : "soft";
    const issue: CritiqueIssue = {
      axis,
      severity,
      finding: typeof i.finding === "string" ? i.finding : "",
      suggestion: typeof i.suggestion === "string" ? i.suggestion : "",
    };
    if (typeof i.part === "string" && i.part) issue.part = i.part;
    return issue;
  });
  const result: VlmCritique = {
    aesthetic: clamp01(o.aesthetic),
    realism: clamp01(o.realism),
    issues,
  };
  const visualScore = optionalScore(o.visualScore);
  const confidence = optionalScore(o.confidence);
  if (visualScore !== undefined) result.visualScore = visualScore;
  if (confidence !== undefined) result.confidence = confidence;
  if (Object.keys(layerScores).length > 0) result.layerScores = layerScores;
  if (featureReviews.length > 0) result.featureReviews = featureReviews;
  if (typeof o.summary === "string" && o.summary) result.summary = o.summary;
  return result;
}

/**
 * Run one VLM aesthetic/realism pass over the render(s). The result is meant to
 * be passed straight into `critique(parts, { goal, vlm })`, which folds these
 * axes into the overall score and merges the issues.
 */
export async function critiqueWithVlm(opts: VlmCritiqueOptions): Promise<VlmCritique> {
  const rubric = opts.rubric ?? rubricForGoal(opts.goal);
  const messages: LlmMessage[] = [
    { role: "system", content: buildSystemPrompt(rubric, opts) },
    buildUserMessage(opts),
  ];
  const reply = await opts.client.complete(messages);
  const review = parseVlmCritique(reply);
  const completion = opts.client.completionMetadata?.();
  if (completion) {
    review.providerModel = completion.model;
    review.providerAttempts = completion.attempts;
    review.providerFallbackUsed = completion.fallbackUsed;
  }
  return review;
}

/** Compact structured feedback for the next modeling turn and review ledger. */
export function formatVlmCritique(review: VlmCritique): string {
  const layers = REVIEW_LAYERS
    .flatMap((layer) => {
      const score = review.layerScores?.[layer];
      return score === undefined ? [] : [`${layer}=${score.toFixed(2)}`];
    })
    .join(" ");
  const head = [
    review.providerModel === undefined ? "" : `model=${review.providerModel}`,
    review.visualScore === undefined ? "" : `visual=${review.visualScore.toFixed(2)}`,
    review.confidence === undefined ? "" : `confidence=${review.confidence.toFixed(2)}`,
    layers,
  ].filter(Boolean).join(" ");
  return [head, review.summary].filter(Boolean).join("\n");
}
