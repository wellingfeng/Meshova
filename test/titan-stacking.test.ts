import { describe, it, expect } from "vitest";
import { buildTitanStackingParts, TITAN_STACKING_DEFAULTS } from "../src/models/titan-stacking.js";

describe("titan-stacking (Titan_StackingTool.hda)", () => {
  it("builds rubble parts with geometry", () => {
    const parts = buildTitanStackingParts();
    expect(parts.length).toBeGreaterThan(0);
    for (const p of parts) expect(p.mesh.positions.length).toBeGreaterThan(0);
  });

  it("is deterministic for given seeds", () => {
    const a = buildTitanStackingParts({ fractureSeed: 5, stackSeed: 2 });
    const b = buildTitanStackingParts({ fractureSeed: 5, stackSeed: 2 });
    expect(a[0]!.mesh.positions).toEqual(b[0]!.mesh.positions);
  });

  it("different fracture seed => different rubble", () => {
    const a = buildTitanStackingParts({ fractureSeed: 1 });
    const b = buildTitanStackingParts({ fractureSeed: 9 });
    expect(a[0]!.mesh.positions).not.toEqual(b[0]!.mesh.positions);
  });

  it("more shards => more geometry", () => {
    const few = buildTitanStackingParts({ shards: 4 });
    const many = buildTitanStackingParts({ shards: 16 });
    const fv = few.reduce((s, p) => s + p.mesh.positions.length, 0);
    const mv = many.reduce((s, p) => s + p.mesh.positions.length, 0);
    expect(mv).toBeGreaterThan(fv);
  });

  it("rubble uses a concrete surface", () => {
    expect(buildTitanStackingParts().every((p) => p.surface?.type === "concrete")).toBe(true);
  });

  it("default is 12 shards", () => {
    expect(TITAN_STACKING_DEFAULTS.shards).toBe(12);
  });
});
