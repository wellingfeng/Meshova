/**
 * Rule tree — Meshova's port of the CitySample RuleProcessor "SliceAndDice"
 * rule tree. Where `scatter-rules.ts` gives a *linear* decorate chain
 * (pc -> pc), a real layout system needs branching: split a point set, run a
 * different sub-tree on each half, iterate per-group, and land results at the
 * leaves. That's exactly the three node types UPointCloudRule uses:
 *
 *   - FILTER    partitions points into Inside / Outside, each feeding a subtree
 *               (e.g. "big lots -> towers, small lots -> houses")
 *   - ITERATOR  groups points by a key and runs a subtree per group
 *               (e.g. per city tile, per building floor)
 *   - GENERATOR a leaf that turns the points it receives into output items
 *               (the copyToPoints / spawn stage)
 *
 * A `sequence` node applies plain ScatterRule decorators (the linear chain) then
 * continues into a child, so the two systems compose. The tree is evaluated
 * purely and deterministically into a flat list of generator outputs (of a
 * caller-chosen type T — instance records, named parts, whatever). Nothing is
 * mutated; each branch gets its own compacted sub-cloud.
 */
import type {
  PointCloud,
  PointContext,
  PointScalar,
} from "./point-cloud.js";
import { partition, groupBy } from "./point-query.js";
import { applyRules, type ScatterRule } from "./scatter-rules.js";

/** A FILTER predicate: does this point go Inside (true) or Outside (false)? */
export type FilterPredicate = (ctx: PointContext) => boolean;

/** A GENERATOR: turn the points that reach this leaf into zero or more outputs. */
export type GeneratorFn<T> = (pc: PointCloud) => T[];

/**
 * A node in the rule tree. Generic over the output item type T that generators
 * emit (e.g. an InstanceRecord, a NamedPart, or a debug string).
 */
export type RuleNode<T> =
  | {
      /** Apply linear decorators, then continue into `then` (or stop). */
      kind: "sequence";
      label?: string;
      rules: ReadonlyArray<ScatterRule>;
      then?: RuleNode<T>;
    }
  | {
      /** FILTER: split by predicate; route each half to a subtree. */
      kind: "filter";
      label?: string;
      predicate: FilterPredicate;
      inside?: RuleNode<T>;
      outside?: RuleNode<T>;
    }
  | {
      /** ITERATOR: group by a key field; run `body` on each group. */
      kind: "iterator";
      label?: string;
      key: PointScalar;
      body: RuleNode<T>;
    }
  | {
      /** GENERATOR: leaf that emits output items from its points. */
      kind: "generator";
      label?: string;
      emit: GeneratorFn<T>;
    };

// ---------------------------------------------------------------------------
// Builders — small constructors so trees read top-down like the UE rule graph.
// ---------------------------------------------------------------------------

/** Decorate the cloud with linear rules, then descend into `then`. */
export function seq<T>(
  rules: ReadonlyArray<ScatterRule>,
  then?: RuleNode<T>,
  label?: string,
): RuleNode<T> {
  const node: RuleNode<T> = then
    ? { kind: "sequence", rules, then }
    : { kind: "sequence", rules };
  if (label !== undefined) (node as { label?: string }).label = label;
  return node;
}

/** FILTER node: route Inside / Outside points to different subtrees. */
export function filter<T>(
  predicate: FilterPredicate,
  branches: { inside?: RuleNode<T>; outside?: RuleNode<T> },
  label?: string,
): RuleNode<T> {
  const node: RuleNode<T> = { kind: "filter", predicate };
  if (branches.inside !== undefined) node.inside = branches.inside;
  if (branches.outside !== undefined) node.outside = branches.outside;
  if (label !== undefined) (node as { label?: string }).label = label;
  return node;
}

/** ITERATOR node: group by `key`, run `body` on each group. */
export function iterate<T>(
  key: PointScalar,
  body: RuleNode<T>,
  label?: string,
): RuleNode<T> {
  const node: RuleNode<T> = { kind: "iterator", key, body };
  if (label !== undefined) (node as { label?: string }).label = label;
  return node;
}

/** GENERATOR leaf: emit output items from whatever points reach it. */
export function emitNode<T>(emit: GeneratorFn<T>, label?: string): RuleNode<T> {
  const node: RuleNode<T> = { kind: "generator", emit };
  if (label !== undefined) (node as { label?: string }).label = label;
  return node;
}

// ---------------------------------------------------------------------------
// Evaluation — walk the tree, threading sub-clouds, collecting generator output.
// ---------------------------------------------------------------------------

/**
 * Evaluate a rule tree against an input cloud, returning the flat list of items
 * produced by every generator reached. Deterministic: filter/iterator preserve
 * point order, iterator visits groups in first-appearance order.
 */
export function evalRuleTree<T>(pc: PointCloud, node: RuleNode<T>): T[] {
  const out: T[] = [];
  walk(pc, node, out);
  return out;
}

function walk<T>(pc: PointCloud, node: RuleNode<T>, out: T[]): void {
  switch (node.kind) {
    case "sequence": {
      const decorated = applyRules(pc, node.rules);
      if (node.then) walk(decorated, node.then, out);
      break;
    }
    case "filter": {
      const { inside, outside } = partition(pc, node.predicate);
      if (node.inside) walk(inside, node.inside, out);
      if (node.outside) walk(outside, node.outside, out);
      break;
    }
    case "iterator": {
      const groups = groupBy(pc, node.key);
      for (const group of groups.values()) walk(group, node.body, out);
      break;
    }
    case "generator": {
      for (const item of node.emit(pc)) out.push(item);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Cached evaluation — the rule-tree analogue of the OpPlan hash-skip cache
// (RuleProcessor's ShouldAlwaysReRun). A subtree's output depends only on its
// structure and the points that reach it (determinism invariant). We key the
// cache on the NODE OBJECT IDENTITY (a subtree the AI didn't rebuild is the same
// reference) crossed with a content fingerprint of its input cloud. So when the
// model edits one branch — building a fresh node for it while reusing the rest —
// only the changed subtree (and any whose input cloud shifted) re-runs.
// ---------------------------------------------------------------------------

/** A cache carried between cached evaluations. Keyed by node identity. */
export type RuleTreeCache = WeakMap<object, Map<string, unknown[]>>;

/** Start an empty rule-tree cache. */
export function emptyRuleTreeCache(): RuleTreeCache {
  return new WeakMap<object, Map<string, unknown[]>>();
}

export interface CachedEvalResult<T> {
  items: T[];
  /** Number of generator nodes actually executed (cache misses). */
  recomputed: number;
  /** Number of generator nodes served from cache (skipped). */
  reused: number;
}

/** FNV-1a 32-bit over a string. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Content fingerprint of a point cloud: point count, quantized positions, and
 * each attribute column. Quantizing to 1e4 keeps it stable against float noise
 * while still catching real layout changes.
 */
export function fingerprintPointCloud(pc: PointCloud): string {
  const q = (n: number): number => Math.round(n * 1e4);
  const parts: string[] = [`n${pc.points.length}`];
  for (const p of pc.points) parts.push(`${q(p.x)},${q(p.y)},${q(p.z)}`);
  const names = Object.keys(pc.attributes).sort();
  for (const name of names) {
    const col = pc.attributes[name]!;
    parts.push(`@${name}:${col.map(q).join(",")}`);
  }
  return fnv1a(parts.join("|"));
}

/**
 * Evaluate a rule tree with subtree caching. Returns the items plus how many
 * generators ran vs were reused. Only GENERATOR leaves count toward the stats
 * (they're where the work happens); a cached leaf returns its stored items.
 */
export function evalRuleTreeCached<T>(
  pc: PointCloud,
  node: RuleNode<T>,
  cache: RuleTreeCache = emptyRuleTreeCache(),
): CachedEvalResult<T> {
  let recomputed = 0;
  let reused = 0;

  const walkCached = (cloud: PointCloud, n: RuleNode<T>): T[] => {
    switch (n.kind) {
      case "sequence": {
        const decorated = applyRules(cloud, n.rules);
        return n.then ? walkCached(decorated, n.then) : [];
      }
      case "filter": {
        const { inside, outside } = partition(cloud, n.predicate);
        const out: T[] = [];
        if (n.inside) out.push(...walkCached(inside, n.inside));
        if (n.outside) out.push(...walkCached(outside, n.outside));
        return out;
      }
      case "iterator": {
        const groups = groupBy(cloud, n.key);
        const out: T[] = [];
        for (const group of groups.values()) out.push(...walkCached(group, n.body));
        return out;
      }
      case "generator": {
        const fp = fingerprintPointCloud(cloud);
        let byFp = cache.get(n as object);
        const hit = byFp?.get(fp);
        if (hit) {
          reused++;
          return hit as T[];
        }
        const items = n.emit(cloud);
        recomputed++;
        if (!byFp) {
          byFp = new Map<string, unknown[]>();
          cache.set(n as object, byFp);
        }
        byFp.set(fp, items);
        return items;
      }
    }
  };

  const items = walkCached(pc, node);
  return { items, recomputed, reused };
}

/** Return the node type in RuleProcessor's vocabulary (for summaries/debug). */
export function ruleKind<T>(node: RuleNode<T>): "FILTER" | "ITERATOR" | "GENERATOR" | "SEQUENCE" {
  switch (node.kind) {
    case "filter": return "FILTER";
    case "iterator": return "ITERATOR";
    case "generator": return "GENERATOR";
    case "sequence": return "SEQUENCE";
  }
}

/** Compact multi-line description of a tree (indented), for prompts/debugging. */
export function describeRuleTree<T>(node: RuleNode<T>, indent = 0): string {
  const pad = "  ".repeat(indent);
  const tag = node.label ? ` "${node.label}"` : "";
  const lines: string[] = [`${pad}${ruleKind(node)}${tag}`];
  switch (node.kind) {
    case "sequence":
      if (node.then) lines.push(describeRuleTree(node.then, indent + 1));
      break;
    case "filter":
      if (node.inside) lines.push(`${pad}  [inside]`, describeRuleTree(node.inside, indent + 2));
      if (node.outside) lines.push(`${pad}  [outside]`, describeRuleTree(node.outside, indent + 2));
      break;
    case "iterator":
      lines.push(describeRuleTree(node.body, indent + 1));
      break;
    case "generator":
      break;
  }
  return lines.join("\n");
}
