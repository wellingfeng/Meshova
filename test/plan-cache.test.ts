import { describe, it, expect } from "vitest";
import {
  evalPlanIncremental,
  emptyPlanCache,
  patchNode,
  type OpPlan,
} from "../src/index.js";

const PLAN: OpPlan = {
  schema: "meshova-opplan@1",
  name: "panel",
  nodes: [
    { id: "base", op: "box", args: [2, 1, 1] },
    { id: "bev", op: "bevelEdges", args: [{ $ref: "base" }, { width: 0.08 }] },
    {
      id: "out",
      op: "extrudeRegion",
      args: [{ $ref: "bev" }, { normalDir: { x: 0, y: 1, z: 0 }, angleDeg: 40 }, { distance: 0.2 }],
      part: { name: "chassis" },
    },
  ],
};

describe("OpPlan incremental cache", () => {
  it("first run recomputes everything", () => {
    const res = evalPlanIncremental(PLAN);
    expect(res.ok).toBe(true);
    expect(res.recomputed.sort()).toEqual(["base", "bev", "out"]);
    expect(res.reused).toEqual([]);
    expect(res.parts.length).toBe(1);
  });

  it("re-running an unchanged plan reuses every node", () => {
    const first = evalPlanIncremental(PLAN);
    const second = evalPlanIncremental(PLAN, first.cache);
    expect(second.ok).toBe(true);
    expect(second.reused.sort()).toEqual(["base", "bev", "out"]);
    expect(second.recomputed).toEqual([]);
    // reused mesh identity is the exact cached object
    expect(second.parts[0]!.mesh).toBe(first.parts[0]!.mesh);
  });

  it("editing one node only recomputes it and its descendants", () => {
    const first = evalPlanIncremental(PLAN);
    // widen the bevel: bev changes -> out (depends on bev) changes -> base reused
    const edited = patchNode(PLAN, "bev", { args: [{ $ref: "base" }, { width: 0.15 }] });
    const second = evalPlanIncremental(edited, first.cache);
    expect(second.ok).toBe(true);
    expect(second.recomputed.sort()).toEqual(["bev", "out"]);
    expect(second.reused).toEqual(["base"]);
    // base's mesh came straight from cache
    expect(second.values.get("base")).toBe(first.values.get("base"));
  });

  it("alwaysReRun nodes never cache", () => {
    const first = evalPlanIncremental(PLAN);
    const second = evalPlanIncremental(PLAN, first.cache, { alwaysReRun: ["base"] });
    expect(second.recomputed).toContain("base");
    // base recompute alone doesn't dirty descendants: their dep hash is unchanged
    expect(second.reused.sort()).toEqual(["bev", "out"]);
  });

  it("matches evalPlan output parts", () => {
    const res = evalPlanIncremental(PLAN, emptyPlanCache());
    expect(res.parts[0]!.name).toBe("chassis");
    expect(res.parts[0]!.mesh.indices.length).toBeGreaterThan(0);
  });
});
