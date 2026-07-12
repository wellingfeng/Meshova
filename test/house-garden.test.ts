import { describe, expect, it } from "vitest";
import {
  buildHouseGardenParts,
  HOUSE_GARDEN_DEFAULTS,
  HOUSE_GARDEN_VARIANTS,
  bounds,
  merge,
  triangleCount,
  type NamedPart,
} from "../src/index.js";

function mergedMesh(parts: NamedPart[]) {
  return merge(...parts.map((p) => p.mesh));
}

describe("house-garden generator", () => {
  it("builds the expected semantic part families", () => {
    const names = buildHouseGardenParts().map((p) => p.name);
    expect(names).toContain("lot_tiles");
    expect(names).toContain("paths");
    expect(names).toContain("house_foundations");
    expect(names.some((n) => n.startsWith("house_walls"))).toBe(true);
    expect(names.some((n) => n.startsWith("house_roofs"))).toBe(true);
    expect(names).toContain("window_frames");
    expect(names).toContain("windows");
    expect(names).toContain("doors");
    expect(names).toContain("tree_trunks");
    expect(names).toContain("tree_canopies");
    expect(names.some((n) => n.startsWith("shrubs"))).toBe(true);
    expect(names.some((n) => n.startsWith("flower_beds"))).toBe(true);
  });

  it("attaches matched surfaces to the main semantic parts", () => {
    const parts = buildHouseGardenParts();
    expect(parts.find((p) => p.name === "lot_tiles")?.surface?.type).toBe("stylizedFoliage");
    expect(parts.find((p) => p.name === "windows")?.surface?.type).toBe("glass");
    expect(parts.find((p) => p.name === "tree_trunks")?.surface?.type).toBe("bark");
    expect(parts.find((p) => p.name === "window_frames")?.surface?.type).toBe("wood");
  });

  it("is deterministic for a fixed seed", () => {
    const a = mergedMesh(buildHouseGardenParts({ seed: 13, variantIndex: 2 }));
    const b = mergedMesh(buildHouseGardenParts({ seed: 13, variantIndex: 2 }));
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });

  it("changes geometry when the seed changes", () => {
    const a = mergedMesh(buildHouseGardenParts({ seed: 1, variantIndex: 4 }));
    const b = mergedMesh(buildHouseGardenParts({ seed: 77, variantIndex: 4 }));
    expect(a.positions).not.toEqual(b.positions);
  });

  it("exposes nine separate library presets", () => {
    expect(HOUSE_GARDEN_VARIANTS).toHaveLength(9);
    expect(new Set(HOUSE_GARDEN_VARIANTS.map((variant) => variant.id)).size).toBe(9);

    for (const variant of HOUSE_GARDEN_VARIANTS) {
      const mesh = mergedMesh(buildHouseGardenParts({ ...variant.params, variants: 1 }));
      const b = bounds(mesh);
      expect(Math.max(b.max.x - b.min.x, b.max.z - b.min.z)).toBeGreaterThan(3);
      expect(triangleCount(mesh)).toBeGreaterThan(100);
    }
  });

  it("exposes sane defaults", () => {
    expect(HOUSE_GARDEN_DEFAULTS.variants).toBe(1);
    expect(HOUSE_GARDEN_DEFAULTS.variantIndex).toBeGreaterThanOrEqual(0);
    expect(HOUSE_GARDEN_DEFAULTS.lotSize).toBeGreaterThan(0);
  });
});
