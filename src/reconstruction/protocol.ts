import type { CritiqueReport, VlmCritique, VlmReviewLayer } from "../critique/critic.js";
import type { NamedPart } from "../geometry/export.js";
import { bounds, type Bounds } from "../geometry/mesh.js";
import type { AssemblySlot } from "../models/assembly.js";
import type { ReferenceEvaluation, ReferenceEvaluationStageId } from "../vision/reference-evaluation.js";

export type ReconstructionComplexity = "simple" | "moderate" | "complex" | "hero";
export type ReconstructionUse = "preview" | "game-ready" | "animation" | "destruction";
export type ReconstructionPhase = "blockout" | "structure" | "shape" | "material" | "lookdev";
export type LookDevMode = "reference" | "neutral" | "grazing";
export type Vec3Tuple = readonly [number, number, number];

export const RECONSTRUCTION_PHASES: readonly ReconstructionPhase[] = [
  "blockout",
  "structure",
  "shape",
  "material",
  "lookdev",
];

export interface CriticalFeatureTarget {
  id: string;
  label: string;
  description: string;
  /** Stable part names or semantic labels expected to represent the feature. */
  partNames?: readonly string[];
  minimumCount?: number;
  minimumScore?: number;
  required?: boolean;
}

export interface AttachmentContract {
  id: string;
  childPart: string;
  parentPart: string;
  parentSocket: string;
  localStart: Vec3Tuple;
  localEnd: Vec3Tuple;
  embedDepth: number;
  gapTolerance: number;
}

export interface ActionSocket {
  name: string;
  position: Vec3Tuple;
  axis?: Vec3Tuple;
}

export interface ActionCollider {
  type: "box" | "sphere" | "capsule" | "mesh";
  size?: Vec3Tuple;
  radius?: number;
  height?: number;
}

export interface ActionProfile {
  partName: string;
  pivot: Vec3Tuple;
  sockets?: readonly ActionSocket[];
  collider?: ActionCollider;
  detachable?: boolean;
  breakGroup?: string;
}

export interface ReconstructionQualityContract {
  targetScore?: number;
  minimumGeometryScore?: number;
  requireCriticPass?: boolean;
  requiredLookDevModes?: readonly LookDevMode[];
  /** Require one structured multi-view VLM review before every pass advances. */
  requireVlmReview?: boolean;
  minimumVlmScore?: number;
  minimumVlmConfidence?: number;
  minimumVlmLayerScore?: number;
  minimumVlmLayers?: Partial<Record<VlmReviewLayer, number>>;
}

export interface ReconstructionContract {
  version: 1;
  id: string;
  subject: string;
  complexity: ReconstructionComplexity;
  intendedUse: ReconstructionUse;
  referenceViews: readonly string[];
  assumptions?: readonly string[];
  criticalFeatures: readonly CriticalFeatureTarget[];
  attachments?: readonly AttachmentContract[];
  actions?: readonly ActionProfile[];
  quality?: ReconstructionQualityContract;
}

export interface ReconstructionContractIssue {
  path: string;
  message: string;
}

export interface CriticalFeatureResult {
  id: string;
  label: string;
  score: number;
  threshold: number;
  passed: boolean;
  matchedParts: readonly string[];
  finding: string;
}

export interface AttachmentResult {
  id: string;
  childPart: string;
  parentPart: string;
  gap: number | null;
  allowedGap: number;
  passed: boolean;
  finding: string;
}

export interface ReconstructionEvidence {
  iteration: number;
  runOk: boolean;
  candidateStable: boolean;
  evaluation?: ReferenceEvaluation;
  critique?: CritiqueReport;
  visualReview?: VlmCritique;
  criticalFeatures: readonly CriticalFeatureResult[];
  attachments: readonly AttachmentResult[];
  lookDevModes: readonly LookDevMode[];
}

export interface ReconstructionGateIssue {
  code: "run" | "candidate" | "stage" | "geometry" | "critique" | "vision" | "feature" | "attachment" | "lookdev";
  message: string;
}

export interface ReconstructionGateDecision {
  phase: ReconstructionPhase;
  accepted: boolean;
  nextPhase: ReconstructionPhase | null;
  /** Conservative quality: minimum of deterministic, VLM, and critical-feature scores. */
  qualityScore: number;
  qualityComponents: {
    deterministic: number;
    visual?: number;
    criticalFeatures?: number;
  };
  issues: readonly ReconstructionGateIssue[];
}

export interface ReconstructionPassState {
  contractId: string;
  phase: ReconstructionPhase;
  completed: boolean;
  acceptedIterations: readonly number[];
}

export interface ReviewScreenshot {
  id: string;
  mode: LookDevMode;
  imageBase64: string;
  notes?: string;
}

export interface ReviewLedgerEntry {
  iteration: number;
  phase: ReconstructionPhase;
  script: string;
  parameters?: Readonly<Record<string, unknown>>;
  screenshots: readonly ReviewScreenshot[];
  score?: number;
  candidateAccepted: boolean;
  gate: ReconstructionGateDecision;
  visualReview?: VlmCritique;
  criticalFeatures: readonly CriticalFeatureResult[];
  attachments: readonly AttachmentResult[];
}

export interface ReviewLedger {
  version: 1;
  contractId: string;
  entries: readonly ReviewLedgerEntry[];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function finiteTuple(value: Vec3Tuple): boolean {
  return value.length === 3 && value.every(Number.isFinite);
}

function duplicateIds(items: readonly { id: string }[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) duplicates.add(item.id);
    seen.add(item.id);
  }
  return [...duplicates];
}

export function validateReconstructionContract(contract: ReconstructionContract): ReconstructionContractIssue[] {
  const issues: ReconstructionContractIssue[] = [];
  if (!contract.id.trim()) issues.push({ path: "id", message: "contract id must not be empty" });
  if (!contract.subject.trim()) issues.push({ path: "subject", message: "subject must not be empty" });
  if (contract.referenceViews.length === 0) {
    issues.push({ path: "referenceViews", message: "at least one reference view is required" });
  }
  for (const id of duplicateIds(contract.criticalFeatures)) {
    issues.push({ path: "criticalFeatures", message: `duplicate critical feature id: ${id}` });
  }
  for (const feature of contract.criticalFeatures) {
    if (!feature.id.trim()) issues.push({ path: "criticalFeatures.id", message: "feature id must not be empty" });
    if (!feature.label.trim()) issues.push({ path: `criticalFeatures.${feature.id}.label`, message: "feature label must not be empty" });
    if ((feature.minimumCount ?? 1) < 1) {
      issues.push({ path: `criticalFeatures.${feature.id}.minimumCount`, message: "minimumCount must be at least 1" });
    }
    const minimumScore = feature.minimumScore ?? 0.7;
    if (minimumScore < 0 || minimumScore > 1) {
      issues.push({ path: `criticalFeatures.${feature.id}.minimumScore`, message: "minimumScore must be within 0..1" });
    }
  }
  const attachments = contract.attachments ?? [];
  for (const id of duplicateIds(attachments)) {
    issues.push({ path: "attachments", message: `duplicate attachment id: ${id}` });
  }
  for (const attachment of attachments) {
    if (!attachment.childPart.trim() || !attachment.parentPart.trim()) {
      issues.push({ path: `attachments.${attachment.id}`, message: "attachment parts must not be empty" });
    }
    if (!attachment.parentSocket.trim()) {
      issues.push({ path: `attachments.${attachment.id}.parentSocket`, message: "parentSocket must not be empty" });
    }
    if (!finiteTuple(attachment.localStart) || !finiteTuple(attachment.localEnd)) {
      issues.push({ path: `attachments.${attachment.id}`, message: "attachment endpoints must be finite vec3 tuples" });
    }
    if (attachment.embedDepth < 0 || attachment.gapTolerance < 0) {
      issues.push({ path: `attachments.${attachment.id}`, message: "embedDepth and gapTolerance must be non-negative" });
    }
  }
  for (const action of contract.actions ?? []) {
    if (!action.partName.trim()) issues.push({ path: "actions.partName", message: "action partName must not be empty" });
    if (!finiteTuple(action.pivot)) issues.push({ path: `actions.${action.partName}.pivot`, message: "pivot must be a finite vec3 tuple" });
  }
  const qualityScores: Array<[string, number | undefined]> = [
    ["quality.targetScore", contract.quality?.targetScore],
    ["quality.minimumGeometryScore", contract.quality?.minimumGeometryScore],
    ["quality.minimumVlmScore", contract.quality?.minimumVlmScore],
    ["quality.minimumVlmConfidence", contract.quality?.minimumVlmConfidence],
    ["quality.minimumVlmLayerScore", contract.quality?.minimumVlmLayerScore],
  ];
  for (const [path, score] of qualityScores) {
    if (score !== undefined && (score < 0 || score > 1)) {
      issues.push({ path, message: "score must be within 0..1" });
    }
  }
  for (const [layer, score] of Object.entries(contract.quality?.minimumVlmLayers ?? {})) {
    if (score !== undefined && (score < 0 || score > 1)) {
      issues.push({ path: `quality.minimumVlmLayers.${layer}`, message: "score must be within 0..1" });
    }
  }
  return issues;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_.]+/g, "-");
}

function partAliases(part: NamedPart): string[] {
  const aliases = [part.name, part.label];
  const role = part.metadata?.role;
  if (typeof role === "string") aliases.push(role);
  return aliases.filter((value): value is string => typeof value === "string").map(normalizeName);
}

export function evaluateCriticalFeatures(
  parts: readonly NamedPart[],
  targets: readonly CriticalFeatureTarget[],
  externalScores: Readonly<Record<string, number>> = {},
  options: { requireExternalScores?: boolean } = {},
): CriticalFeatureResult[] {
  return targets.map((target) => {
    const expected = (target.partNames ?? []).map(normalizeName);
    const matchedParts = expected.length === 0
      ? []
      : parts.filter((part) => {
        const aliases = partAliases(part);
        return expected.some((name) => aliases.includes(name));
      }).map((part) => part.name);
    const minimumCount = target.minimumCount ?? 1;
    const inferredScore = expected.length === 0 ? 0 : clamp01(matchedParts.length / minimumCount);
    const external = externalScores[target.id];
    const hasExternalScore = Number.isFinite(external);
    const score = clamp01(hasExternalScore ? external! : options.requireExternalScores ? 0 : inferredScore);
    const threshold = target.minimumScore ?? 0.7;
    const passed = score >= threshold;
    return {
      id: target.id,
      label: target.label,
      score,
      threshold,
      passed,
      matchedParts,
      finding: !hasExternalScore && options.requireExternalScores
        ? `${target.label} has no visual review score`
        : passed
        ? `${target.label} passed (${score.toFixed(3)})`
        : `${target.label} failed (${score.toFixed(3)} < ${threshold.toFixed(3)})`,
    };
  });
}

function axisGap(aMin: number, aMax: number, bMin: number, bMax: number): number {
  return Math.max(0, aMin - bMax, bMin - aMax);
}

function boundsGap(first: Bounds, second: Bounds): number {
  return Math.hypot(
    axisGap(first.min.x, first.max.x, second.min.x, second.max.x),
    axisGap(first.min.y, first.max.y, second.min.y, second.max.y),
    axisGap(first.min.z, first.max.z, second.min.z, second.max.z),
  );
}

export function evaluateAttachmentContracts(
  parts: readonly NamedPart[],
  contracts: readonly AttachmentContract[],
): AttachmentResult[] {
  const byName = new Map(parts.map((part) => [part.name, part]));
  return contracts.map((contract) => {
    const child = byName.get(contract.childPart);
    const parent = byName.get(contract.parentPart);
    const allowedGap = contract.gapTolerance + contract.embedDepth;
    if (!child || !parent) {
      const missing = [!child ? contract.childPart : "", !parent ? contract.parentPart : ""].filter(Boolean).join(", ");
      return {
        id: contract.id,
        childPart: contract.childPart,
        parentPart: contract.parentPart,
        gap: null,
        allowedGap,
        passed: false,
        finding: `missing attachment part: ${missing}`,
      };
    }
    const gap = boundsGap(bounds(child.mesh), bounds(parent.mesh));
    const passed = gap <= allowedGap;
    return {
      id: contract.id,
      childPart: contract.childPart,
      parentPart: contract.parentPart,
      gap,
      allowedGap,
      passed,
      finding: passed
        ? `${contract.childPart} attached to ${contract.parentPart}`
        : `${contract.childPart} gap ${gap.toFixed(4)} exceeds ${allowedGap.toFixed(4)}`,
    };
  });
}

function stageIndex(stage: ReferenceEvaluationStageId | null | undefined): number {
  return stage === null || stage === undefined ? -1 : ["D0", "D1", "D2", "D3"].indexOf(stage);
}

function requireStage(
  evidence: ReconstructionEvidence,
  required: ReferenceEvaluationStageId,
  issues: ReconstructionGateIssue[],
): void {
  if (stageIndex(evidence.evaluation?.highestPassedStage) < stageIndex(required)) {
    issues.push({ code: "stage", message: `${required} reference stage not passed` });
  }
}

const PHASE_VLM_LAYERS: Record<ReconstructionPhase, readonly VlmReviewLayer[]> = {
  blockout: ["silhouetteProportion"],
  structure: ["componentStructure", "spatialStructure"],
  shape: ["silhouetteProportion", "formDetail", "spatialStructure"],
  material: ["colorPalette", "materialSurface"],
  lookdev: ["materialSurface", "lightingCamera"],
};

function requireVisualReview(
  contract: ReconstructionContract,
  phase: ReconstructionPhase,
  evidence: ReconstructionEvidence,
  issues: ReconstructionGateIssue[],
): void {
  if (contract.quality?.requireVlmReview !== true) return;
  const review = evidence.visualReview;
  if (!review) {
    issues.push({ code: "vision", message: "missing structured VLM visual review" });
    return;
  }
  const minimumScore = contract.quality.minimumVlmScore ?? 0.7;
  if (review.visualScore === undefined || review.visualScore < minimumScore) {
    issues.push({
      code: "vision",
      message: `VLM visual score must reach ${minimumScore.toFixed(2)}`,
    });
  }
  const minimumConfidence = contract.quality.minimumVlmConfidence ?? 0.55;
  if (review.confidence === undefined || review.confidence < minimumConfidence) {
    issues.push({
      code: "vision",
      message: `VLM evidence confidence must reach ${minimumConfidence.toFixed(2)}`,
    });
  }
  const defaultLayerScore = contract.quality.minimumVlmLayerScore ?? 0.65;
  for (const layer of PHASE_VLM_LAYERS[phase]) {
    const threshold = contract.quality.minimumVlmLayers?.[layer] ?? defaultLayerScore;
    const score = review.layerScores?.[layer];
    if (score === undefined || score < threshold) {
      issues.push({
        code: "vision",
        message: `${layer} VLM score must reach ${threshold.toFixed(2)}`,
      });
    }
  }
}

export function evaluateReconstructionGate(
  contract: ReconstructionContract,
  phase: ReconstructionPhase,
  evidence: ReconstructionEvidence,
): ReconstructionGateDecision {
  const issues: ReconstructionGateIssue[] = [];
  if (!evidence.runOk) issues.push({ code: "run", message: "script did not run" });
  if (!evidence.candidateStable) issues.push({ code: "candidate", message: "candidate regressed locked metrics" });

  if (phase === "blockout") requireStage(evidence, "D0", issues);
  if (phase === "structure") {
    const minimumGeometryScore = contract.quality?.minimumGeometryScore ?? 0.55;
    const geometryScore = evidence.critique?.scores.geometry;
    if (geometryScore === undefined || geometryScore < minimumGeometryScore) {
      issues.push({ code: "geometry", message: `geometry score must reach ${minimumGeometryScore.toFixed(2)}` });
    }
    for (const attachment of contract.attachments ?? []) {
      const result = evidence.attachments.find((item) => item.id === attachment.id);
      if (!result) {
        issues.push({ code: "attachment", message: `missing attachment review: ${attachment.id}` });
      } else if (!result.passed) {
        issues.push({ code: "attachment", message: result.finding });
      }
    }
  }
  if (phase === "shape") {
    requireStage(evidence, "D1", issues);
    for (const feature of contract.criticalFeatures.filter((item) => item.required !== false)) {
      const result = evidence.criticalFeatures.find((item) => item.id === feature.id);
      if (!result) {
        issues.push({ code: "feature", message: `missing critical feature review: ${feature.id}` });
      } else if (!result.passed) {
        issues.push({ code: "feature", message: result.finding });
      }
    }
  }
  if (phase === "material") requireStage(evidence, "D2", issues);
  if (phase === "lookdev") {
    requireStage(evidence, "D3", issues);
    const requiredModes = contract.quality?.requiredLookDevModes ?? ["neutral", "grazing", "reference"];
    for (const mode of requiredModes) {
      if (!evidence.lookDevModes.includes(mode)) {
        issues.push({ code: "lookdev", message: `missing ${mode} lookdev capture` });
      }
    }
    if ((contract.quality?.requireCriticPass ?? true) && evidence.critique?.passed !== true) {
      issues.push({ code: "critique", message: "final critic did not pass" });
    }
  }
  requireVisualReview(contract, phase, evidence, issues);

  const index = RECONSTRUCTION_PHASES.indexOf(phase);
  const qualityComponents: ReconstructionGateDecision["qualityComponents"] = {
    deterministic: evidence.critique?.scores.deterministic ?? 0,
  };
  if (contract.quality?.requireVlmReview === true) {
    qualityComponents.visual = evidence.visualReview?.visualScore ?? 0;
  }
  const requiredFeatures = contract.criticalFeatures.filter((feature) => feature.required !== false);
  if (index >= RECONSTRUCTION_PHASES.indexOf("shape") && requiredFeatures.length > 0) {
    qualityComponents.criticalFeatures = Math.min(...requiredFeatures.map((feature) =>
      evidence.criticalFeatures.find((result) => result.id === feature.id)?.score ?? 0
    ));
  }
  const qualityScore = Math.min(...Object.values(qualityComponents));
  return {
    phase,
    accepted: issues.length === 0,
    nextPhase: index >= RECONSTRUCTION_PHASES.length - 1 ? null : RECONSTRUCTION_PHASES[index + 1]!,
    qualityScore,
    qualityComponents,
    issues,
  };
}

export function createReconstructionPassState(contract: ReconstructionContract): ReconstructionPassState {
  const issues = validateReconstructionContract(contract);
  if (issues.length > 0) throw new Error(issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
  return {
    contractId: contract.id,
    phase: RECONSTRUCTION_PHASES[0]!,
    completed: false,
    acceptedIterations: [],
  };
}

export function advanceReconstructionPass(
  state: ReconstructionPassState,
  decision: ReconstructionGateDecision,
  iteration: number,
): ReconstructionPassState {
  if (state.completed || !decision.accepted || decision.phase !== state.phase) return state;
  return {
    ...state,
    phase: decision.nextPhase ?? state.phase,
    completed: decision.nextPhase === null,
    acceptedIterations: [...state.acceptedIterations, iteration],
  };
}

export function createReviewLedger(contract: ReconstructionContract): ReviewLedger {
  return { version: 1, contractId: contract.id, entries: [] };
}

export function appendReviewLedger(ledger: ReviewLedger, entry: ReviewLedgerEntry): ReviewLedger {
  return { ...ledger, entries: [...ledger.entries, entry] };
}

export function serializeReviewLedger(ledger: ReviewLedger): string {
  return JSON.stringify(ledger, null, 2);
}

export function withReconstructionMetadata(
  parts: readonly NamedPart[],
  contract: ReconstructionContract,
): NamedPart[] {
  return parts.map((part) => {
    const attachments = (contract.attachments ?? []).filter((item) => item.childPart === part.name || item.parentPart === part.name);
    const action = (contract.actions ?? []).find((item) => item.partName === part.name);
    if (attachments.length === 0 && !action) return { ...part };
    return {
      ...part,
      metadata: {
        ...(part.metadata ?? {}),
        reconstructionAttachments: attachments.map((item) => ({ ...item })),
        ...(action ? { actionProfile: { ...action } } : {}),
      },
    };
  });
}

export function attachmentContractFromAssemblySlot<TMetadata extends object>(
  slot: AssemblySlot<TMetadata>,
  childPart: string,
  parentPart: string,
): AttachmentContract {
  const tolerance = Math.max(1e-4, Math.min(slot.size.width, slot.size.height, slot.size.depth) * 0.02);
  return {
    id: `attachment:${slot.id}`,
    childPart,
    parentPart,
    parentSocket: slot.id,
    localStart: slot.position,
    localEnd: slot.position,
    embedDepth: tolerance,
    gapTolerance: tolerance,
  };
}

export function reconstructionContractToPrompt(contract: ReconstructionContract, phase?: ReconstructionPhase): string {
  const lines = [
    `Reconstruction contract: ${contract.subject} (${contract.complexity}, ${contract.intendedUse}).`,
    `Reference views: ${contract.referenceViews.join(", ")}.`,
  ];
  if (phase) lines.push(`Current locked pass: ${phase}. Do not spend effort on later passes before this pass clears.`);
  if (contract.criticalFeatures.length > 0) {
    lines.push("Critical features (each required feature is a hard gate):");
    for (const feature of contract.criticalFeatures) {
      lines.push(`- ${feature.id}: ${feature.description} (min ${(feature.minimumScore ?? 0.7).toFixed(2)})`);
    }
  }
  for (const attachment of contract.attachments ?? []) {
    lines.push(`Attachment ${attachment.childPart} -> ${attachment.parentPart}.${attachment.parentSocket}; max gap ${(attachment.gapTolerance + attachment.embedDepth).toFixed(4)}.`);
  }
  for (const action of contract.actions ?? []) {
    lines.push(`Action-ready ${action.partName}: pivot=(${action.pivot.join(",")})${action.detachable ? ", detachable" : ""}${action.breakGroup ? `, breakGroup=${action.breakGroup}` : ""}.`);
  }
  return lines.join("\n");
}
