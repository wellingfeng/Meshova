import { describe, it, expect } from "vitest";
import { buildTitanTreeParts, TITAN_TREE_DEFAULTS } from "../src/models/titan-tree.js";

describe("titan-tree (Tree_PivotPainter_Tutorial)", () => {
  it("builds bark and foliage parts with geometry", () => {
    const parts = buildTitanTreeParts();
    const names = parts.map((p) => p.name).sort();
    expect(names).toEqual(["bark", "foliage"]);
    for (const p of parts) expect(p.mesh.positions.length).toBeGreaterThan(0);
  });

  it("is deterministic — same seed, identical geometry", () => {
    const a = buildTitanTreeParts({ seed: 20 });
    const b = buildTitanTreeParts({ seed: 20 });
    const ba = a.find((p) => p.name === "bark")!;
    const bb = b.find((p) => p.name === "bark")!;
    expect(ba.mesh.positions).toEqual(bb.mesh.positions);
  });

  it("different seed => different tree", () => {
    const a = buildTitanTreeParts({ seed: 1 });
    const b = buildTitanTreeParts({ seed: 2 });
    const ba = a.find((p) => p.name === "bark")!;
    const bb = b.find((p) => p.name === "bark")!;
    expect(ba.mesh.positions).not.toEqual(bb.mesh.positions);
  });

  it("more levels => more branches", () => {
    const shallow = buildTitanTreeParts({ levels: 2 });
    const deep = buildTitanTreeParts({ levels: 5 });
    const sc = (shallow.find((p) => p.name === "bark")!.metadata as { branches: number }).branches;
    const dc = (deep.find((p) => p.name === "bark")!.metadata as { branches: number }).branches;
    expect(dc).toBeGreaterThan(sc);
  });

  it("bakes PivotPainter records (pivot/parent/level)", () => {
    const parts = buildTitanTreeParts({ levels: 3 });
    const bark = parts.find((p) => p.name === "bark")!;
    const pp = (bark.metadata as { pivotPainter: Array<{ parent: number; level: number }> }).pivotPainter;
    expect(pp.length).toBeGreaterThan(1);
    expect(pp[0]!.parent).toBe(-1); // trunk has no parent
    expect(pp[0]!.level).toBe(1);
  });

  it("leafSize 0 grows a bare tree (no foliage part)", () => {
    const parts = buildTitanTreeParts({ leafSize: 0 });
    expect(parts.find((p) => p.name === "foliage")).toBeUndefined();
  });

  it("uses shaped blades instead of rectangular leaf cards", () => {
    const foliage = buildTitanTreeParts({ levels: 1, branching: 1 })
      .find((part) => part.name === "foliage")!.mesh;
    expect(foliage.positions.length).toBeGreaterThan(4);
    expect(new Set(foliage.uvs.map((uv) => uv.y)).size).toBeGreaterThan(2);
  });

  it("defaults recurse four levels", () => {
    expect(TITAN_TREE_DEFAULTS.levels).toBe(4);
  });
});
