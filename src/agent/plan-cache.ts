/**
 * Incremental OpPlan evaluation — Meshova's port of the CitySample
 * RuleProcessor "hash & revision skip" (UPointCloudRule::ShouldAlwaysReRun /
 * bAlwaysReRun). In the AI screenshot loop the model usually edits *one* node
 * (patchNode) between iterations; re-running the whole plan wastes time. This
 * layer gives every node a content hash derived from its operator, its literal
 * args, and the hashes of the nodes it $refs. When a hash is unchanged from the
 * previous run, the node's output is pulled from the cache instead of recomputed
 * — so editing "bevel1.width" only re-evaluates bevel1 and its descendants.
 *
 * Determinism guarantees this is safe: same op + same inputs => same output.
 * Nodes flagged `alwaysReRun` (dynamic/nondeterministic) are never cached.
 */
import { SCRIPT_API } from "./api.js";
import type { NamedPart } from "../geometry/export.js";
import type { Mesh } from "../geometry/mesh.js";
import type { OpPlan, PlanNode, PlanValue, EvalResult } from "./opplan.js";

/** A cache of node id -> { hash, value } carried between plan evaluations. */
export interface PlanCache {
  entries: Map<string, { hash: string; value: unknown }>;
}

export interface IncrementalResult extends EvalResult {
  /** The cache to feed into the next evaluation. */
  cache: PlanCache;
  /** Node ids that were recomputed this run (the rest were cache hits). */
  recomputed: string[];
  /** Node ids served from cache (skipped). */
  reused: string[];
}

/** Start an empty cache (first evaluation recomputes everything). */
export function emptyPlanCache(): PlanCache {
  return { entries: new Map() };
}

function isMesh(v: unknown): v is Mesh {
  return !!v && typeof v === "object"
    && Array.isArray((v as Mesh).positions) && Array.isArray((v as Mesh).indices);
}

/**
 * FNV-1a 32-bit string hash rendered as hex. Small, fast, dependency-free, and
 * good enough to detect whether a node's inputs changed between iterations.
 */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Collect node ids referenced by a PlanValue (mirrors opplan.refsOf). */
function refsOf(v: PlanValue, acc: Set<string>): void {
  if (v === null || typeof v !== "object") return;
  if (Array.isArray(v)) { for (const x of v) refsOf(x, acc); return; }
  if ("$ref" in v) { acc.add((v as { $ref: string }).$ref); return; }
  if ("$lit" in v) return;
  for (const val of Object.values(v)) refsOf(val as PlanValue, acc);
}

/**
 * Serialize the *literal* structure of a PlanValue for hashing. $ref markers are
 * emitted as a placeholder; the referenced node's own hash is folded in
 * separately (so a ref only changes this hash when the target's hash changes).
 */
function literalShape(v: PlanValue): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(literalShape).join(",")}]`;
  if ("$ref" in v) return `#ref`;
  if ("$lit" in v) return `L${JSON.stringify((v as { $lit: unknown }).$lit)}`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => `${k}:${literalShape((v as Record<string, PlanValue>)[k]!)}`).join(",")}}`;
}

/** Topologically order nodes by $ref dependencies (mirrors opplan.topoOrder). */
function topoOrder(nodes: PlanNode[]): PlanNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const deps = new Map<string, Set<string>>();
  for (const n of nodes) {
    const s = new Set<string>();
    for (const a of n.args ?? []) refsOf(a, s);
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

/** Resolve a PlanValue against computed node values (mirrors opplan). */
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

/**
 * Evaluate a plan incrementally against a previous cache. Each node's hash =
 * fnv1a(op + literalShape(args) + sorted referenced-node hashes). If the hash
 * matches the cached one, the cached value is reused; otherwise the operator
 * runs and the cache is updated. Nodes whose id appears in `alwaysReRun` (or
 * ops in it) always recompute and never populate the cache.
 *
 * Returns the parts, the new cache, and which nodes were recomputed vs reused.
 */
export function evalPlanIncremental(
  plan: OpPlan,
  prev: PlanCache = emptyPlanCache(),
  opts: { registry?: Record<string, unknown>; alwaysReRun?: ReadonlyArray<string> } = {},
): IncrementalResult {
  const registry = opts.registry ?? SCRIPT_API;
  const always = new Set(opts.alwaysReRun ?? []);
  const values = new Map<string, unknown>();
  const parts: NamedPart[] = [];
  const nextCache: PlanCache = { entries: new Map() };
  const recomputed: string[] = [];
  const reused: string[] = [];
  const nodeHash = new Map<string, string>();

  let ordered: PlanNode[];
  try {
    ordered = topoOrder(plan.nodes);
  } catch (err) {
    return {
      ok: false, parts: [], values, cache: nextCache, recomputed, reused,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const seen = new Set<string>();
  for (const node of ordered) {
    if (seen.has(node.id)) {
      return {
        ok: false, parts: [], values, cache: nextCache, recomputed, reused,
        error: `duplicate node id "${node.id}"`, failedNode: node.id,
      };
    }
    seen.add(node.id);

    // Compute this node's content hash from op + literal args + dep hashes.
    const refs = new Set<string>();
    for (const a of node.args ?? []) refsOf(a, refs);
    const depHashes = [...refs].filter((r) => nodeHash.has(r)).sort()
      .map((r) => `${r}=${nodeHash.get(r)}`).join("|");
    const argShape = (node.args ?? []).map(literalShape).join(",");
    const partShape = node.part ? JSON.stringify(node.part) : "";
    const hash = fnv1a(`${node.op}(${argShape})[${depHashes}]${partShape}`);
    nodeHash.set(node.id, hash);

    const cacheable = !always.has(node.id) && !always.has(node.op);
    const prevEntry = prev.entries.get(node.id);

    let result: unknown;
    if (cacheable && prevEntry && prevEntry.hash === hash) {
      result = prevEntry.value;
      reused.push(node.id);
    } else {
      const fn = registry[node.op];
      if (typeof fn !== "function") {
        return {
          ok: false, parts, values, cache: nextCache, recomputed, reused,
          error: `unknown operator "${node.op}"`, failedNode: node.id,
        };
      }
      try {
        const args = (node.args ?? []).map((a) => resolveValue(a, values));
        result = (fn as (...a: unknown[]) => unknown)(...args);
      } catch (err) {
        return {
          ok: false, parts, values, cache: nextCache, recomputed, reused,
          error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
          failedNode: node.id,
        };
      }
      recomputed.push(node.id);
    }

    values.set(node.id, result);
    if (cacheable) nextCache.entries.set(node.id, { hash, value: result });

    if (node.part) {
      if (!isMesh(result)) {
        return {
          ok: false, parts, values, cache: nextCache, recomputed, reused,
          error: `node "${node.id}" has a part spec but did not produce a Mesh`,
          failedNode: node.id,
        };
      }
      const p: NamedPart = { name: node.part.name, mesh: result };
      if (node.part.color) p.color = node.part.color;
      if (node.part.surface) p.surface = node.part.surface;
      parts.push(p);
    }
  }

  return { ok: true, parts, values, cache: nextCache, recomputed, reused };
}
