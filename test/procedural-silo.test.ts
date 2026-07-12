import { describe, it, expect } from "vitest";
import {
  buildProceduralSiloParts,
  PROCEDURAL_SILO_DEFAULTS,
} from "../src/models/procedural-silo.js";
import { meshMetrics } from "../src/critique/geometry-metrics.js";

describe("procedural-silo", () => {
  it("builds semantic shaft/deck/module/stair/core parts", () => {
    const parts = buildProceduralSiloParts();
    const names = parts.map((p) => p.name);
    for (const n of ["shaft_wall", "ring_decks", "wall_modules", "spiral_stair_rails", "central_core"]) {
      expect(names).toContain(n);
    }
    for (const p of parts) expect(p.mesh.positions.length).toBeGreaterThan(0);
  });

  it("uses human-readable labels for UI", () => {
    const parts = buildProceduralSiloParts();
    for (const part of parts) {
      expect(part.label).toBeTruthy();
      expect(part.label).not.toContain("_");
    }
  });

  it("is deterministic for same seed", () => {
    const a = buildProceduralSiloParts({ seed: 7 });
    const b = buildProceduralSiloParts({ seed: 7 });
    const am = a.find((p) => p.name === "wall_modules")!.mesh.positions;
    const bm = b.find((p) => p.name === "wall_modules")!.mesh.positions;
    expect(am).toEqual(bm);
  });

  it("different seeds change module layout", () => {
    const a = buildProceduralSiloParts({ seed: 7 }).find((p) => p.name === "wall_modules")!.mesh.positions;
    const b = buildProceduralSiloParts({ seed: 8 }).find((p) => p.name === "wall_modules")!.mesh.positions;
    expect(a).not.toEqual(b);
  });

  it("levels control deck geometry", () => {
    const low = buildProceduralSiloParts({ levels: 5 }).find((p) => p.name === "ring_decks")!.mesh.positions.length;
    const high = buildProceduralSiloParts({ levels: 12 }).find((p) => p.name === "ring_decks")!.mesh.positions.length;
    expect(high).toBeGreaterThan(low);
  });

  it("default radius matches tutorial-style large shaft scale", () => {
    expect(PROCEDURAL_SILO_DEFAULTS.radius).toBeCloseTo(5.2, 3);
  });

  it("solidifies the transmissive elevator tube", () => {
    const glass = buildProceduralSiloParts().find((part) => part.name === "elevator_glass")!;
    expect(meshMetrics(glass.mesh).watertight).toBe(true);
    expect(glass.doubleSided).toBeUndefined();
  });
});
