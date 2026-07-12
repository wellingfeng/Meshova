import { evalPlan, type EvalResult, type OpPlan, type PlanValue } from "../agent/opplan.js";

export type WorkflowParamKind = "number" | "boolean" | "string" | "select" | "vec2" | "vec3" | "color";
export type WorkflowParamValue = number | boolean | string | ReadonlyArray<number>;

export interface WorkflowParamOption {
  readonly value: string;
  readonly label: string;
}

export interface ExposedWorkflowParam {
  readonly key: string;
  readonly label: string;
  readonly kind: WorkflowParamKind;
  readonly default: WorkflowParamValue;
  readonly description?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly options?: ReadonlyArray<WorkflowParamOption>;
  readonly group?: string;
}

export interface WorkflowSharedRef {
  readonly key: string;
  readonly value: WorkflowValue;
  readonly label?: string;
}

export interface WorkflowAssetSlot {
  readonly key: string;
  readonly label: string;
  readonly accepts?: ReadonlyArray<string>;
  readonly required?: boolean;
  readonly default?: unknown;
}

export type WorkflowBindingKind = "surface" | "curve" | "curve-graph" | "region" | "selection" | "point-cloud";

export interface WorkflowBindingEditor {
  readonly rows?: number;
  readonly columns?: number;
  readonly plane?: "xy" | "xz" | "yz" | "camera";
  readonly curveType?: "polyline" | "catmull-rom" | "bezier" | "b-spline";
  readonly curveTypes?: ReadonlyArray<"polyline" | "catmull-rom" | "bezier" | "b-spline">;
  readonly subdivisions?: number;
  readonly tension?: number;
  readonly degree?: number;
  readonly tangentMode?: "auto" | "aligned" | "mirrored" | "free" | "corner";
  readonly tangentModes?: ReadonlyArray<"auto" | "aligned" | "mirrored" | "free" | "corner">;
  readonly arcLength?: boolean;
  readonly sampleCount?: number;
  readonly attributes?: ReadonlyArray<"width" | "height" | "tilt" | "twist" | "material">;
  readonly surfaceInterpolation?: "bilinear" | "b-spline";
}

export interface WorkflowBindingSlot {
  readonly key: string;
  readonly label: string;
  readonly kind: WorkflowBindingKind;
  readonly required?: boolean;
  readonly default?: unknown;
  readonly editor?: WorkflowBindingEditor;
}

export interface WorkflowMetadata {
  readonly label: string;
  readonly description?: string;
  readonly tags?: ReadonlyArray<string>;
  readonly thumbnail?: string;
  readonly scope?: "model" | "material" | "scene";
}

export interface WorkflowExecution {
  readonly seed?: number;
  readonly debounceMs?: number;
  readonly frozenNodes?: ReadonlyArray<string>;
  readonly alwaysReRun?: ReadonlyArray<string>;
}

export type WorkflowValue =
  | PlanValue
  | { readonly $param: string }
  | { readonly $shared: string }
  | { readonly $asset: string }
  | { readonly $binding: string };

export interface WorkflowPreset {
  readonly schema: "meshova-workflow@1";
  readonly id: string;
  readonly version: number;
  readonly metadata: WorkflowMetadata;
  readonly graph: OpPlan;
  readonly exposedParams?: ReadonlyArray<ExposedWorkflowParam>;
  readonly sharedRefs?: ReadonlyArray<WorkflowSharedRef>;
  readonly assetSlots?: ReadonlyArray<WorkflowAssetSlot>;
  readonly bindings?: ReadonlyArray<WorkflowBindingSlot>;
  readonly execution?: WorkflowExecution;
}

export interface WorkflowInputs {
  readonly params?: Readonly<Record<string, WorkflowParamValue>>;
  readonly shared?: Readonly<Record<string, unknown>>;
  readonly assets?: Readonly<Record<string, unknown>>;
  readonly bindings?: Readonly<Record<string, unknown>>;
}

interface ResolveContext {
  readonly params: ReadonlyMap<string, WorkflowParamValue>;
  readonly sharedSpecs: ReadonlyMap<string, WorkflowSharedRef>;
  readonly sharedOverrides: Readonly<Record<string, unknown>>;
  readonly assets: Readonly<Record<string, unknown>>;
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly resolvingShared: Set<string>;
}

export function workflowDefaults(preset: WorkflowPreset): Record<string, WorkflowParamValue> {
  return Object.fromEntries((preset.exposedParams ?? []).map((param) => [param.key, cloneParamValue(param.default)]));
}

export function materializeWorkflow(preset: WorkflowPreset, inputs: WorkflowInputs = {}): OpPlan {
  validateWorkflowPreset(preset);
  const params = new Map<string, WorkflowParamValue>();
  for (const spec of preset.exposedParams ?? []) {
    const value = inputs.params?.[spec.key] ?? spec.default;
    validateParamValue(spec, value);
    params.set(spec.key, value);
  }
  for (const key of Object.keys(inputs.params ?? {})) {
    if (!params.has(key)) throw new Error(`unknown workflow param "${key}"`);
  }

  const ctx: ResolveContext = {
    params,
    sharedSpecs: new Map((preset.sharedRefs ?? []).map((spec) => [spec.key, spec])),
    sharedOverrides: inputs.shared ?? {},
    assets: resolveSlots(preset.assetSlots ?? [], inputs.assets ?? {}, "asset"),
    bindings: resolveSlots(preset.bindings ?? [], inputs.bindings ?? {}, "binding"),
    resolvingShared: new Set(),
  };

  return {
    ...preset.graph,
    nodes: preset.graph.nodes.map((node) => ({
      ...node,
      ...(node.args ? { args: node.args.map((arg) => resolveWorkflowValue(arg as WorkflowValue, ctx)) } : {}),
    })),
  };
}

export function evalWorkflow(
  preset: WorkflowPreset,
  inputs: WorkflowInputs = {},
  registry?: Record<string, unknown>,
): EvalResult {
  const plan = materializeWorkflow(preset, inputs);
  return registry === undefined ? evalPlan(plan) : evalPlan(plan, registry);
}

export function withWorkflowDefaults(
  preset: WorkflowPreset,
  values: Readonly<Record<string, WorkflowParamValue>>,
): WorkflowPreset {
  const known = new Set((preset.exposedParams ?? []).map((param) => param.key));
  for (const key of Object.keys(values)) {
    if (!known.has(key)) throw new Error(`unknown workflow param "${key}"`);
  }
  return {
    ...preset,
    exposedParams: (preset.exposedParams ?? []).map((param) => {
      const value = values[param.key];
      if (value === undefined) return param;
      validateParamValue(param, value);
      return { ...param, default: cloneParamValue(value) };
    }),
  };
}

export function validateWorkflowPreset(preset: WorkflowPreset): void {
  if (preset.schema !== "meshova-workflow@1") throw new Error(`unexpected workflow schema: ${String(preset.schema)}`);
  if (!preset.id.trim()) throw new Error("workflow id is empty");
  if (!Number.isInteger(preset.version) || preset.version < 1) throw new Error("workflow version must be a positive integer");
  if (preset.graph.schema !== "meshova-opplan@1") throw new Error("workflow graph must use meshova-opplan@1");
  assertUniqueKeys(preset.exposedParams ?? [], "workflow param");
  assertUniqueKeys(preset.sharedRefs ?? [], "shared ref");
  assertUniqueKeys(preset.assetSlots ?? [], "asset slot");
  assertUniqueKeys(preset.bindings ?? [], "binding slot");
  for (const spec of preset.exposedParams ?? []) validateParamValue(spec, spec.default);
  if ((preset.execution?.debounceMs ?? 0) < 0) throw new Error("workflow debounceMs must be >= 0");
}

export function parseWorkflowPreset(json: string): WorkflowPreset {
  const preset = JSON.parse(json) as WorkflowPreset;
  validateWorkflowPreset(preset);
  return preset;
}

export function serializeWorkflowPreset(preset: WorkflowPreset): string {
  validateWorkflowPreset(preset);
  return JSON.stringify(preset, null, 2);
}

function resolveWorkflowValue(value: WorkflowValue, ctx: ResolveContext): PlanValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => resolveWorkflowValue(item as WorkflowValue, ctx));
  if ("$ref" in value || "$lit" in value) return value as PlanValue;
  if ("$param" in value) {
    const key = String(value.$param);
    if (!ctx.params.has(key)) throw new Error(`unknown workflow param "${key}"`);
    return { $lit: ctx.params.get(key) };
  }
  if ("$asset" in value) return { $lit: requiredResolvedValue(ctx.assets, String(value.$asset), "asset") };
  if ("$binding" in value) return { $lit: requiredResolvedValue(ctx.bindings, String(value.$binding), "binding") };
  if ("$shared" in value) return { $lit: resolveShared(String(value.$shared), ctx) };
  const out: Record<string, PlanValue> = {};
  for (const [key, child] of Object.entries(value)) out[key] = resolveWorkflowValue(child as WorkflowValue, ctx);
  return out;
}

function resolveShared(key: string, ctx: ResolveContext): unknown {
  if (Object.prototype.hasOwnProperty.call(ctx.sharedOverrides, key)) return ctx.sharedOverrides[key];
  const spec = ctx.sharedSpecs.get(key);
  if (!spec) throw new Error(`unknown shared ref "${key}"`);
  if (ctx.resolvingShared.has(key)) throw new Error(`shared ref cycle at "${key}"`);
  ctx.resolvingShared.add(key);
  const resolved = resolveWorkflowValue(spec.value, ctx);
  ctx.resolvingShared.delete(key);
  return isLiteral(resolved) ? resolved.$lit : resolved;
}

function resolveSlots<T extends { readonly key: string; readonly required?: boolean; readonly default?: unknown }>(
  specs: ReadonlyArray<T>,
  supplied: Readonly<Record<string, unknown>>,
  kind: "asset" | "binding",
): Record<string, unknown> {
  const known = new Set(specs.map((spec) => spec.key));
  for (const key of Object.keys(supplied)) {
    if (!known.has(key)) throw new Error(`unknown workflow ${kind} "${key}"`);
  }
  const resolved: Record<string, unknown> = {};
  for (const spec of specs) {
    if (Object.prototype.hasOwnProperty.call(supplied, spec.key)) resolved[spec.key] = supplied[spec.key];
    else if (Object.prototype.hasOwnProperty.call(spec, "default")) resolved[spec.key] = spec.default;
    else if (spec.required ?? true) throw new Error(`missing required workflow ${kind} "${spec.key}"`);
  }
  return resolved;
}

function requiredResolvedValue(values: Readonly<Record<string, unknown>>, key: string, kind: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(values, key)) throw new Error(`unknown workflow ${kind} "${key}"`);
  return values[key];
}

function validateParamValue(spec: ExposedWorkflowParam, value: WorkflowParamValue): void {
  if (spec.kind === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`workflow param "${spec.key}" must be finite number`);
    if (spec.min !== undefined && value < spec.min) throw new Error(`workflow param "${spec.key}" is below min ${spec.min}`);
    if (spec.max !== undefined && value > spec.max) throw new Error(`workflow param "${spec.key}" is above max ${spec.max}`);
    return;
  }
  if (spec.kind === "boolean") {
    if (typeof value !== "boolean") throw new Error(`workflow param "${spec.key}" must be boolean`);
    return;
  }
  if (spec.kind === "string" || spec.kind === "select") {
    if (typeof value !== "string") throw new Error(`workflow param "${spec.key}" must be string`);
    if (spec.kind === "select" && spec.options && !spec.options.some((option) => option.value === value)) {
      throw new Error(`workflow param "${spec.key}" has invalid option "${value}"`);
    }
    return;
  }
  const lengths: Record<"vec2" | "vec3" | "color", number> = { vec2: 2, vec3: 3, color: 3 };
  const expected = lengths[spec.kind];
  if (!Array.isArray(value) || value.length !== expected || value.some((item) => !Number.isFinite(item))) {
    throw new Error(`workflow param "${spec.key}" must be ${spec.kind}`);
  }
}

function assertUniqueKeys(items: ReadonlyArray<{ readonly key: string }>, kind: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.key.trim()) throw new Error(`${kind} key is empty`);
    if (seen.has(item.key)) throw new Error(`duplicate ${kind} "${item.key}"`);
    seen.add(item.key);
  }
}

function cloneParamValue(value: WorkflowParamValue): WorkflowParamValue {
  return Array.isArray(value) ? value.slice() : value;
}

function isLiteral(value: PlanValue): value is { $lit: unknown } {
  return value !== null && typeof value === "object" && !Array.isArray(value) && "$lit" in value;
}
