/**
 * P4 OpPlan — a serializable, replayable modeling graph.
 *
 * Instead of (or alongside) a free-form script, a model can be described as a
 * list of nodes: each node names an operator, gives literal params, and
 * references the outputs of earlier nodes as inputs. Evaluating the plan in
 * dependency order rebuilds the mesh; serializing it to JSON makes the build
 * reproducible and — crucially for the AI screenshot loop — *targetably
 * editable*: the model can change "node `bevel1`.width = 0.08" without rewriting
 * the whole script, and the loop can report which node a defect came from.
 *
 * The operator registry is the curated `SCRIPT_API` (same surface scripts use),
 * so anything a script can call, a plan can call.
 */
import { SCRIPT_API } from "./api.js";
import type { NamedPart } from "../geometry/export.js";
import type { Mesh } from "../geometry/mesh.js";
import { triangleCount } from "../geometry/mesh.js";

/**
 * A reference to another node's output, or a literal value. Inputs are resolved
 * before the operator is called. `{ $ref: "id" }` pulls a prior node's result;
 * `{ $part: {...} }` marks a node as a scene part with name/color/surface;
 * anything else is passed through as a literal (numbers, arrays, objects).
 */
export type PlanValue =
  | { $ref: string }
  | { $lit: unknown }
  | string
  | number
  | boolean
  | null
  | PlanValue[]
  | { [k: string]: PlanValue };

export interface PlanNode {
  /** Unique node id, referenced by later nodes and by edit operations. */
  id: string;
  /** Operator name — a key in the registry (SCRIPT_API), e.g. "box", "bevelEdges". */
  op: string;
  /**
   * Positional arguments for the operator. Each may be a literal, a `{ $ref }`
   * to another node, or a nested structure containing refs/literals.
   */
  args?: PlanValue[];
  /**
   * If set, this node's mesh output becomes a scene part with this presentation.
   * The node's `op` should yield a Mesh (or the node may reference one via the
   * first arg using op "asPart").
   */
  part?: { name: string; color?: [number, number, number]; surface?: { type: string; params?: Record<string, unknown> } };
  /** Optional human note (why this step exists) — surfaced in summaries. */
  note?: string;
}

export interface OpPlan {
  /** Schema marker for forward-compat. */
  schema: "meshova-opplan@1";
  name: string;
  nodes: PlanNode[];
}

export interface EvalResult {
  ok: boolean;
  parts: NamedPart[];
  /** node id -> evaluated value (for debugging / partial inspection). */
  values: Map<string, unknown>;
  error?: string;
  /** node id where evaluation failed, if any. */
  failedNode?: string;
}

function isMesh(v: unknown): v is Mesh {
  return !!v && typeof v === "object"
    && Array.isArray((v as Mesh).positions) && Array.isArray((v as Mesh).indices);
}

/** Resolve a PlanValue: dereference $ref, unwrap $lit, recurse arrays/objects. */
function resolveValue(v: PlanValue, values: Map<string, unknown>): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => resolveValue(x, values));
  if ("$ref" in v) {
    const id = (v as { $ref: string }).$ref;
    if (!values.has(id)) throw new Error(`unresolved $ref to node "${id}" (not yet evaluated)`);
    return values.get(id);
  }
  if ("$lit" in v) return (v as { $lit: unknown }).$lit;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) out[k] = resolveValue(val as PlanValue, values);
  return out;
}

/** Collect node ids referenced by a node's args (for dependency ordering). */
function refsOf(v: PlanValue, acc: Set<string>): void {
  if (v === null || typeof v !== "object") return;
  if (Array.isArray(v)) { for (const x of v) refsOf(x, acc); return; }
  if ("$ref" in v) { acc.add((v as { $ref: string }).$ref); return; }
  if ("$lit" in v) return;
  for (const val of Object.values(v)) refsOf(val as PlanValue, acc);
}

/** Topologically order nodes by their $ref dependencies. Throws on cycles. */
function topoOrder(nodes: PlanNode[]): PlanNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const deps = new Map<string, Set<string>>();
  for (const n of nodes) {
    const s = new Set<string>();
    for (const a of n.args ?? []) refsOf(a, s);
    // Keep only deps that exist as nodes.
    for (const d of [...s]) if (!byId.has(d)) s.delete(d);
    deps.set(n.id, s);
  }
  const ordered: PlanNode[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string): void => {
    if (done.has(id)) return;
    if (visiting.has(id)) throw new Error(`cycle detected at node "${id}"`);
    visiting.add(id);
    for (const d of deps.get(id) ?? []) visit(d);
    visiting.delete(id);
    done.add(id);
    ordered.push(byId.get(id)!);
  };
  for (const n of nodes) visit(n.id);
  return ordered;
}

/**
 * Evaluate an OpPlan into scene parts. Nodes run in dependency order; each
 * node's operator is looked up in the registry and called with resolved args.
 * Nodes carrying a `part` spec contribute to the output scene.
 */
export function evalPlan(plan: OpPlan, registry: Record<string, unknown> = SCRIPT_API): EvalResult {
  const values = new Map<string, unknown>();
  const parts: NamedPart[] = [];
  let ordered: PlanNode[];
  try {
    ordered = topoOrder(plan.nodes);
  } catch (err) {
    return { ok: false, parts: [], values, error: err instanceof Error ? err.message : String(err) };
  }

  const seen = new Set<string>();
  for (const node of ordered) {
    if (seen.has(node.id)) {
      return { ok: false, parts: [], values, error: `duplicate node id "${node.id}"`, failedNode: node.id };
    }
    seen.add(node.id);
    const fn = registry[node.op];
    if (typeof fn !== "function") {
      return { ok: false, parts, values, error: `unknown operator "${node.op}"`, failedNode: node.id };
    }
    try {
      const args = (node.args ?? []).map((a) => resolveValue(a, values));
      const result = (fn as (...a: unknown[]) => unknown)(...args);
      values.set(node.id, result);
      if (node.part) {
        if (!isMesh(result)) {
          return { ok: false, parts, values, error: `node "${node.id}" has a part spec but did not produce a Mesh`, failedNode: node.id };
        }
        const p: NamedPart = { name: node.part.name, mesh: result };
        if (node.part.color) p.color = node.part.color;
        if (node.part.surface) p.surface = node.part.surface;
        parts.push(p);
      }
    } catch (err) {
      return { ok: false, parts, values, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err), failedNode: node.id };
    }
  }
  return { ok: true, parts, values };
}

/** Parse JSON into an OpPlan, validating the schema marker. */
export function parsePlan(json: string): OpPlan {
  const obj = JSON.parse(json) as OpPlan;
  if (obj.schema !== "meshova-opplan@1") throw new Error(`unexpected plan schema: ${String(obj.schema)}`);
  if (!Array.isArray(obj.nodes)) throw new Error("plan.nodes must be an array");
  return obj;
}

/** Serialize an OpPlan to pretty JSON. */
export function serializePlan(plan: OpPlan): string {
  return JSON.stringify(plan, null, 2);
}

/**
 * Return a NEW plan with one node's args/part patched — the targeted edit the
 * AI loop uses ("make node bevel1 wider"). Never mutates the input plan.
 */
export function patchNode(
  plan: OpPlan,
  id: string,
  patch: { args?: PlanValue[]; part?: PlanNode["part"]; note?: string },
): OpPlan {
  let found = false;
  const nodes = plan.nodes.map((n) => {
    if (n.id !== id) return n;
    found = true;
    const next: PlanNode = { ...n };
    if (patch.args !== undefined) next.args = patch.args;
    if (patch.part !== undefined) next.part = patch.part;
    if (patch.note !== undefined) next.note = patch.note;
    return next;
  });
  if (!found) throw new Error(`patchNode: no node with id "${id}"`);
  return { ...plan, nodes };
}

/** Compact, AI-readable summary of a plan's steps (for prompts / debugging). */
export function describePlan(plan: OpPlan): string {
  const lines = [`Plan "${plan.name}" (${plan.nodes.length} nodes):`];
  for (const n of plan.nodes) {
    const refs = new Set<string>();
    for (const a of n.args ?? []) refsOf(a, refs);
    const inputs = refs.size ? ` <- ${[...refs].join(",")}` : "";
    const partTag = n.part ? ` [part:${n.part.name}]` : "";
    const note = n.note ? `  // ${n.note}` : "";
    lines.push(`  ${n.id}: ${n.op}${inputs}${partTag}${note}`);
  }
  return lines.join("\n");
}

/** Per-node triangle count for an evaluated plan (debug view / defect locating). */
export function planNodeStats(result: EvalResult): Array<{ id: string; tris: number }> {
  const out: Array<{ id: string; tris: number }> = [];
  for (const [id, v] of result.values) {
    if (isMesh(v)) out.push({ id, tris: triangleCount(v) });
  }
  return out;
}
