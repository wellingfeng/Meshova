import { describe, expect, it } from "vitest";
import { buildStylizedLakesideVillageParts } from "../src/index.js";

describe("stylized lakeside village", () => {
  it("builds deterministic semantic scene parts", () => {
    const first = buildStylizedLakesideVillageParts({ seed: 91, treeDensity: 1.1, night: 0.4 });
    const second = buildStylizedLakesideVillageParts({ seed: 91, treeDensity: 1.1, night: 0.4 });

    expect(first.map((part) => part.name)).toEqual(second.map((part) => part.name));
    expect(first.map((part) => part.mesh.positions.length)).toEqual(second.map((part) => part.mesh.positions.length));
    expect(first.every((part) => typeof part.label === "string" && part.label.length > 0)).toBe(true);
    expect(first.every((part) => part.metadata?.sourceStudy === "https://www.bilibili.com/video/BV18U4y1L7AV")).toBe(true);
  });

  it("contains recognizable reference landmarks", () => {
    const names = new Set(buildStylizedLakesideVillageParts().map((part) => part.name));
    expect(names).toContain("village_timber_frames");
    expect(names).toContain("wooden_dock_planks");
    expect(names).toContain("village_well_roof");
    expect(names).toContain("village_tree_crowns_light");
    expect(names).toContain("village_lamp_glow");
  });

  it("uses density to control vegetation complexity", () => {
    const sparse = buildStylizedLakesideVillageParts({ seed: 7, treeDensity: 0.4 });
    const dense = buildStylizedLakesideVillageParts({ seed: 7, treeDensity: 1.6 });
    const sparseCrown = sparse.find((part) => part.name === "village_tree_crowns_light");
    const denseCrown = dense.find((part) => part.name === "village_tree_crowns_light");

    expect(sparseCrown).toBeDefined();
    expect(denseCrown).toBeDefined();
    expect(denseCrown!.mesh.positions.length).toBeGreaterThan(sparseCrown!.mesh.positions.length);
  });
});
