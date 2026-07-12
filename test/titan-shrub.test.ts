import { describe, it, expect } from "vitest";
import { buildTitanShrubParts, TITAN_SHRUB_DEFAULTS } from "../src/models/titan-shrub.js";

describe("titan-shrub (Tutorial_shrub.hda)", () => {
  it("builds branches and leaves", () => {
    const parts = buildTitanShrubParts();
    const names = parts.map((p) => p.name);
    expect(names).toContain("branches");
    expect(names).toContain("leaves");
    for (const p of parts) expect(p.mesh.positions.length).toBeGreaterThan(0);
  });

  it("uses shaped blades instead of rectangular leaf cards", () => {
    const leaves = buildTitanShrubParts({ branches: 1, leavesPerBranch: 1, dryRatio: 0 })
      .find((part) => part.name === "leaves")!.mesh;
    expect(leaves.positions.length).toBeGreaterThan(4);
    expect(new Set(leaves.uvs.map((uv) => uv.y)).size).toBeGreaterThan(2);
  });

  it("is deterministic for a given seed", () => {
    const a = buildTitanShrubParts({ seed: 5 });
    const b = buildTitanShrubParts({ seed: 5 });
    expect(a.find((p) => p.name === "leaves")!.mesh.positions).toEqual(
      b.find((p) => p.name === "leaves")!.mesh.positions,
    );
  });

  it("different seeds differ", () => {
    const a = buildTitanShrubParts({ seed: 1 });
    const b = buildTitanShrubParts({ seed: 2 });
    expect(a.find((p) => p.name === "branches")!.mesh.positions).not.toEqual(
      b.find((p) => p.name === "branches")!.mesh.positions,
    );
  });

  it("more branches => more branch geometry", () => {
    const few = buildTitanShrubParts({ branches: 3 });
    const many = buildTitanShrubParts({ branches: 12 });
    expect(many.find((p) => p.name === "branches")!.mesh.positions.length).toBeGreaterThan(
      few.find((p) => p.name === "branches")!.mesh.positions.length,
    );
  });

  it("dryRatio 0 drops the dry_leaves part; >0 can add it", () => {
    const none = buildTitanShrubParts({ dryRatio: 0 });
    expect(none.find((p) => p.name === "dry_leaves")).toBeUndefined();
    const some = buildTitanShrubParts({ dryRatio: 1 });
    // all dry -> green leaves part becomes empty and is filtered, dry present
    expect(some.find((p) => p.name === "dry_leaves")).toBeDefined();
  });

  it("default is 7 branches", () => {
    expect(TITAN_SHRUB_DEFAULTS.branches).toBe(7);
  });
});
