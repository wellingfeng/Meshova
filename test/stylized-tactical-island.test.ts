import { describe, expect, it } from "vitest";
import { buildStylizedTacticalIslandParts } from "../src/index.js";

describe("stylized tactical island", () => {
  it("builds deterministic semantic scene parts", () => {
    const first = buildStylizedTacticalIslandParts({ seed: 42, forestDensity: 1.2, energy: 0.65 });
    const second = buildStylizedTacticalIslandParts({ seed: 42, forestDensity: 1.2, energy: 0.65 });

    expect(first.map((part) => part.name)).toEqual(second.map((part) => part.name));
    expect(first.map((part) => part.mesh.positions.length)).toEqual(second.map((part) => part.mesh.positions.length));
    expect(first.every((part) => part.label && part.label.length > 0)).toBe(true);
    expect(first.every((part) => part.colors?.length === part.mesh.positions.length * 3)).toBe(true);
    expect(first.every((part) => part.metadata?.sourceStudy === "https://waldobronchart.com/project/super-senso-game/")).toBe(true);
  });

  it("contains reference-inspired scene landmarks", () => {
    const names = new Set(buildStylizedTacticalIslandParts().map((part) => part.name));
    expect(names).toContain("tactical_island_underside");
    expect(names).toContain("tactical_roads");
    expect(names).toContain("tactical_waterfall");
    expect(names).toContain("tactical_forest_dark");
    expect(names).toContain("tactical_energy_glow");
  });

  it("uses forest density and energy parameters", () => {
    const sparse = buildStylizedTacticalIslandParts({ seed: 7, forestDensity: 0.35, energy: 0 });
    const dense = buildStylizedTacticalIslandParts({ seed: 7, forestDensity: 1.6, energy: 1 });
    const sparseForest = sparse.find((part) => part.name === "tactical_forest_dark");
    const denseForest = dense.find((part) => part.name === "tactical_forest_dark");
    const lowEnergy = sparse.find((part) => part.name === "tactical_energy_glow");
    const highEnergy = dense.find((part) => part.name === "tactical_energy_glow");

    expect(denseForest!.mesh.positions.length).toBeGreaterThan(sparseForest!.mesh.positions.length);
    expect(Math.max(...highEnergy!.mesh.positions.map((position) => position.y))).toBeGreaterThan(
      Math.max(...lowEnergy!.mesh.positions.map((position) => position.y)),
    );
  });
});
