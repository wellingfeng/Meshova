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
import type { CritiqueAxis, CritiqueIssue, Severity, VlmCritique } from "./critic.js";

export interface VlmCritiqueOptions {
  client: LlmClient;
  goal: string;
  /** One or more renders of the SAME model. base64 PNG (no data: prefix). */
  rendersBase64: string[];
  /** Optional reference photo (image-target mode). Compared for realism. */
  referenceBase64?: string;
  /** Override the auto-selected rubric. */
  rubric?: Rubric;
}

function buildSystemPrompt(rubric: Rubric): string {
  const checks = rubric.checklist.map((c, i) => `  ${i + 1}. ${c}`).join("\n");
  return `You are a senior 3D art director reviewing a procedurally generated
model of a "${rubric.category}". You are shown one or more renders of the SAME
model (multiple camera angles when available), optionally with a reference photo.

Judge two things, each 0..1:
- aesthetic: proportion balance, silhouette readability, part balance, detail
  density, material/color plausibility. Is it visually coherent and appealing?
- realism: does it match how a real ${rubric.category} is built and proportioned?
  Use this checklist:
${checks}

Report concrete, actionable problems. Each issue names the offending part when
you can identify it, states what is wrong, and gives a fix the modeler can act
on. Prioritize the biggest structural/proportion errors over tiny detail.

Do NOT pixel-match textures; material is judged by category plausibility only.
Return ONLY one fenced \`\`\`json code block matching this TypeScript type:
{ "aesthetic": number, "realism": number,
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
  for (const r of opts.rendersBase64) {
    imgs.push(r);
    labels.push(`Image ${n++} = render of the model (angle ${imgs.length}).`);
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

/** Parse a VLM critique reply into structured scores + issues, tolerant of drift. */
export function parseVlmCritique(reply: string): VlmCritique {
  let obj: unknown;
  try {
    obj = JSON.parse(extractCode(reply));
  } catch {
    throw new Error("parseVlmCritique: reply was not valid JSON");
  }
  const o = obj as Record<string, unknown>;
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
  return {
    aesthetic: clamp01(o.aesthetic),
    realism: clamp01(o.realism),
    issues,
  };
}

/**
 * Run one VLM aesthetic/realism pass over the render(s). The result is meant to
 * be passed straight into `critique(parts, { goal, vlm })`, which folds these
 * axes into the overall score and merges the issues.
 */
export async function critiqueWithVlm(opts: VlmCritiqueOptions): Promise<VlmCritique> {
  const rubric = opts.rubric ?? rubricForGoal(opts.goal);
  const messages: LlmMessage[] = [
    { role: "system", content: buildSystemPrompt(rubric) },
    buildUserMessage(opts),
  ];
  const reply = await opts.client.complete(messages);
  return parseVlmCritique(reply);
}
