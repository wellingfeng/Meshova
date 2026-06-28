import { describe, it, expect } from "vitest";
import {
  evalPlan,
  parsePlan,
  serializePlan,
  patchNode,
  describePlan,
  planNodeStats,
  type OpPlan,
} from "../src/index.js";

// A small hard-surface plan: box -> bevel -> inset top -> extrude top, one part.
const PLAN: OpPlan = {
  schema: "meshova-opplan@1",
  name: "panel",
  nodes: [
    { id: "base", op: "box", args: [2, 1, 1], note: "chassis blank" },
    { id: "bev", op: "bevelEdges", args: [{ $ref: "base" }, { width: 0.08 }] },
    {
      id: "out",
      op: "extrudeRegion",
      args: [{ $ref: "bev" }, { normalDir: { x: 0, y: 1, z: 0 }, angleDeg: 40 }, { distance: 0.2 }],
      part: { name: "chassis", color: [0.5, 0.55, 0.6] },
    },
  ],
};

describe("OpPlan evaluation", () => {
  it("evaluates a multi-step plan into one part", () => {
    const res = evalPlan(PLAN);
    expect(res.ok).toBe(true);
    expect(res.parts.length).toBe(1);
    expect(res.parts[0]!.name).toBe("chassis");
    expect(res.parts[0]!.mesh.indices.length).toBeGreaterThan(0);
    expect(res.parts[0]!.color).toEqual([0.5, 0.55, 0.6]);
  });

  it("resolves $ref dependencies in topological order regardless of node order", () => {
    const shuffled: OpPlan = { ...PLAN, nodes: [PLAN.nodes[2]!, PLAN.nodes[0]!, PLAN.nodes[1]!] };
    const res = evalPlan(shuffled);
    expect(res.ok).toBe(true);
    expect(res.parts.length).toBe(1);
  });

  it("reports the failing node on an unknown operator", () => {
    const bad: OpPlan = {
      schema: "meshova-opplan@1",
      name: "bad",
      nodes: [{ id: "x", op: "nonexistentOp", args: [] }],
    };
    const res = evalPlan(bad);
    expect(res.ok).toBe(false);
    expect(res.failedNode).toBe("x");
    expect(res.error).toMatch(/unknown operator/);
  });

  it("detects dependency cycles", () => {
    const cyclic: OpPlan = {
      schema: "meshova-opplan@1",
      name: "cycle",
      nodes: [
        { id: "a", op: "merge", args: [{ $ref: "b" }] },
        { id: "b", op: "merge", args: [{ $ref: "a" }] },
      ],
    };
    const res = evalPlan(cyclic);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/cycle/);
  });

  it("rejects an unresolved $ref to a missing node", () => {
    const dangling: OpPlan = {
      schema: "meshova-opplan@1",
      name: "dangling",
      nodes: [{ id: "a", op: "bevelEdges", args: [{ $ref: "ghost" }, {}] }],
    };
    const res = evalPlan(dangling);
    expect(res.ok).toBe(false);
  });
});

describe("OpPlan serialization & editing", () => {
  it("round-trips through JSON", () => {
    const json = serializePlan(PLAN);
    const back = parsePlan(json);
    expect(back.name).toBe("panel");
    expect(back.nodes.length).toBe(3);
    expect(evalPlan(back).ok).toBe(true);
  });

  it("rejects a wrong schema marker", () => {
    expect(() => parsePlan(JSON.stringify({ schema: "nope", nodes: [] }))).toThrow();
  });

  it("patchNode does a targeted, non-mutating edit", () => {
    const wider = patchNode(PLAN, "bev", { args: [{ $ref: "base" }, { width: 0.2 }] });
    // Original plan untouched.
    expect((PLAN.nodes[1]!.args![1] as { width: number }).width).toBe(0.08);
    // Patched plan still evaluates, and produces different geometry (wider
    // bevel pulls corner points further in, so positions differ even though the
    // topology/vertex count is unchanged).
    const a = evalPlan(PLAN);
    const b = evalPlan(wider);
    expect(b.ok).toBe(true);
    const pa = a.parts[0]!.mesh.positions;
    const pb = b.parts[0]!.mesh.positions;
    const anyDifferent = pa.some((p, i) => {
      const q = pb[i];
      return !q || Math.abs(p.x - q.x) > 1e-6 || Math.abs(p.y - q.y) > 1e-6 || Math.abs(p.z - q.z) > 1e-6;
    });
    expect(anyDifferent).toBe(true);
  });

  it("patchNode throws on a missing id", () => {
    expect(() => patchNode(PLAN, "missing", { note: "x" })).toThrow();
  });

  it("describePlan lists steps with their inputs and part tags", () => {
    const text = describePlan(PLAN);
    expect(text).toMatch(/base: box/);
    expect(text).toMatch(/bev: bevelEdges <- base/);
    expect(text).toMatch(/\[part:chassis\]/);
  });

  it("planNodeStats reports per-node triangle counts", () => {
    const res = evalPlan(PLAN);
    const stats = planNodeStats(res);
    const ids = stats.map((s) => s.id);
    expect(ids).toContain("base");
    expect(ids).toContain("out");
    for (const s of stats) expect(s.tris).toBeGreaterThan(0);
  });
});
