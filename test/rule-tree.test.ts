import { describe, it, expect } from "vitest";
import { makePointCloud, pointAttribute } from "../src/geometry/point-cloud.js";
import {
  seq,
  filter,
  iterate,
  emitNode,
  evalRuleTree,
  evalRuleTreeCached,
  emptyRuleTreeCache,
  fingerprintPointCloud,
  ruleKind,
  describeRuleTree,
  type RuleNode,
} from "../src/geometry/rule-tree.js";
import { ruleScale } from "../src/geometry/scatter-rules.js";
import { vec3 } from "../src/math/vec3.js";

function cloud() {
  return makePointCloud({
    points: [vec3(0, 0, 0), vec3(1, 0, 0), vec3(5, 0, 0), vec3(6, 0, 0)],
    attributes: { variant: [0, 0, 1, 1] },
  });
}

describe("rule-tree", () => {
  it("generator leaf emits items from its points", () => {
    const tree = emitNode<number>((pc) => pc.points.map((p) => p.x));
    expect(evalRuleTree(cloud(), tree)).toEqual([0, 1, 5, 6]);
  });

  it("filter routes inside/outside to different subtrees", () => {
    const tree = filter<string>(
      (c) => c.point.x >= 3,
      {
        inside: emitNode((pc) => pc.points.map(() => "far")),
        outside: emitNode((pc) => pc.points.map(() => "near")),
      },
    );
    // inside branch is walked first, then outside
    expect(evalRuleTree(cloud(), tree)).toEqual(["far", "far", "near", "near"]);
  });

  it("iterator runs the body once per group", () => {
    const tree = iterate<string>(
      pointAttribute("variant"),
      emitNode((pc) => [`group of ${pc.points.length}`]),
    );
    // two groups (variant 0 and 1), each with 2 points
    expect(evalRuleTree(cloud(), tree)).toEqual(["group of 2", "group of 2"]);
  });

  it("sequence applies linear rules then descends", () => {
    const tree = seq<number>(
      [ruleScale(2)],
      emitNode((pc) => pc.attributes["scale"] ?? []),
    );
    expect(evalRuleTree(cloud(), tree)).toEqual([2, 2, 2, 2]);
  });

  it("nested filter -> iterator -> generator composes", () => {
    const tree: RuleNode<number> = filter(
      (c) => c.point.x >= 3,
      {
        inside: iterate(
          pointAttribute("variant"),
          emitNode((pc) => [pc.points.length]),
        ),
      },
    );
    expect(evalRuleTree(cloud(), tree)).toEqual([2]);
  });

  it("ruleKind maps to RuleProcessor vocabulary", () => {
    expect(ruleKind(emitNode(() => []))).toBe("GENERATOR");
    expect(ruleKind(filter(() => true, {}))).toBe("FILTER");
    expect(ruleKind(iterate(0, emitNode(() => [])))).toBe("ITERATOR");
    expect(ruleKind(seq([]))).toBe("SEQUENCE");
  });

  it("describeRuleTree renders an indented outline", () => {
    const tree = filter<number>(
      (c) => c.point.x >= 3,
      { inside: emitNode(() => [], "spawn") },
      "byDistance",
    );
    const text = describeRuleTree(tree);
    expect(text).toContain('FILTER "byDistance"');
    expect(text).toContain("[inside]");
    expect(text).toContain('GENERATOR "spawn"');
  });
});

describe("rule-tree cached evaluation", () => {
  it("fingerprint is stable and sensitive to attribute changes", () => {
    const a = cloud();
    const b = cloud();
    expect(fingerprintPointCloud(a)).toBe(fingerprintPointCloud(b));
    const c = makePointCloud({
      points: [vec3(0, 0, 0), vec3(1, 0, 0), vec3(5, 0, 0), vec3(6, 0, 0)],
      attributes: { variant: [9, 0, 1, 1] },
    });
    expect(fingerprintPointCloud(c)).not.toBe(fingerprintPointCloud(a));
  });

  it("cached eval matches uncached output", () => {
    const tree = filter<string>(
      (c) => c.point.x >= 3,
      {
        inside: emitNode((pc) => pc.points.map(() => "far")),
        outside: emitNode((pc) => pc.points.map(() => "near")),
      },
    );
    const cache = emptyRuleTreeCache();
    const first = evalRuleTreeCached(cloud(), tree, cache);
    expect(first.items).toEqual(evalRuleTree(cloud(), tree));
    expect(first.recomputed).toBe(2);
    expect(first.reused).toBe(0);
  });

  it("re-running the same tree + cloud reuses every generator", () => {
    const tree = filter<string>(
      (c) => c.point.x >= 3,
      {
        inside: emitNode((pc) => pc.points.map(() => "far")),
        outside: emitNode((pc) => pc.points.map(() => "near")),
      },
    );
    const cache = emptyRuleTreeCache();
    evalRuleTreeCached(cloud(), tree, cache);
    const second = evalRuleTreeCached(cloud(), tree, cache);
    expect(second.recomputed).toBe(0);
    expect(second.reused).toBe(2);
  });

  it("reuses the untouched branch, recomputes only the rebuilt one", () => {
    // keep the inside leaf stable across runs (same object identity)
    const insideLeaf = emitNode<string>((pc) => pc.points.map(() => "far"));
    const cache = emptyRuleTreeCache();
    const tree1 = filter<string>(
      (c) => c.point.x >= 3,
      { inside: insideLeaf, outside: emitNode((pc) => pc.points.map(() => "near")) },
    );
    evalRuleTreeCached(cloud(), tree1, cache);
    // rebuild only the outside leaf (new object) -> inside leaf hits cache
    const tree2 = filter<string>(
      (c) => c.point.x >= 3,
      { inside: insideLeaf, outside: emitNode((pc) => pc.points.map(() => "NEAR")) },
    );
    const second = evalRuleTreeCached(cloud(), tree2, cache);
    expect(second.reused).toBe(1);
    expect(second.recomputed).toBe(1);
    expect(second.items).toEqual(["far", "far", "NEAR", "NEAR"]);
  });
});
