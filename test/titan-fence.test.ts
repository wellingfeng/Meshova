import { describe, it, expect } from "vitest";
import { buildTitanFenceParts, TITAN_FENCE_DEFAULTS } from "../src/models/titan-fence.js";

describe("titan-fence (Tutorial_fence.hda)", () => {
  it("builds posts and rails with geometry", () => {
    const parts = buildTitanFenceParts();
    const names = parts.map((p) => p.name).sort();
    expect(names).toEqual(["posts", "rails"]);
    for (const p of parts) expect(p.mesh.positions.length).toBeGreaterThan(0);
  });

  it("is deterministic including seeded post lean", () => {
    const a = buildTitanFenceParts({ seed: 3 });
    const b = buildTitanFenceParts({ seed: 3 });
    const ap = a.find((p) => p.name === "posts")!;
    const bp = b.find((p) => p.name === "posts")!;
    expect(ap.mesh.positions).toEqual(bp.mesh.positions);
  });

  it("different seeds give different post lean", () => {
    const a = buildTitanFenceParts({ seed: 1, lean: 0.1 });
    const b = buildTitanFenceParts({ seed: 2, lean: 0.1 });
    const ap = a.find((p) => p.name === "posts")!.mesh.positions;
    const bp = b.find((p) => p.name === "posts")!.mesh.positions;
    expect(ap).not.toEqual(bp);
  });

  it("tighter postSpacing yields more posts", () => {
    const wide = buildTitanFenceParts({ postSpacing: 4 });
    const tight = buildTitanFenceParts({ postSpacing: 1 });
    const wp = wide.find((p) => p.name === "posts")!.mesh.positions.length;
    const tp = tight.find((p) => p.name === "posts")!.mesh.positions.length;
    expect(tp).toBeGreaterThan(wp);
  });

  it("metal switch changes rail surface", () => {
    const wood = buildTitanFenceParts({ metal: false });
    const metal = buildTitanFenceParts({ metal: true });
    expect(wood.find((p) => p.name === "rails")!.surface?.type).toBe("wood");
    expect(metal.find((p) => p.name === "rails")!.surface?.type).toBe("metal");
  });

  it("rails count controls rail geometry", () => {
    const few = buildTitanFenceParts({ rails: 2 });
    const many = buildTitanFenceParts({ rails: 5 });
    const fp = few.find((p) => p.name === "rails")!.mesh.positions.length;
    const mp = many.find((p) => p.name === "rails")!.mesh.positions.length;
    expect(mp).toBeGreaterThan(fp);
  });

  it("default height is 1.5m", () => {
    expect(TITAN_FENCE_DEFAULTS.height).toBeCloseTo(1.5, 3);
  });
});
