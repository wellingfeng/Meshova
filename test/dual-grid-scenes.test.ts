import { describe, expect, it } from "vitest";
import { buildDualGridScene, type DualGridSceneKind } from "../src/index.js";

const KINDS: DualGridSceneKind[] = ["forest-camp", "river-mill", "hill-shrine", "marsh-ruins"];

describe("dual grid scene library", () => {
  it.each(KINDS)("builds deterministic %s scene", (kind) => {
    const params = { cells: 14, edgeResolution: 3, propDensity: 0.5, seed: 81 };
    const first = buildDualGridScene(kind, params);
    const second = buildDualGridScene(kind, params);
    expect(first.parts).toEqual(second.parts);
    expect(first.summary.cells).toBe(196);
    expect(first.summary.transitions).toBeGreaterThan(0);
    expect(first.summary.props).toBeGreaterThan(0);
    expect(first.parts.some((part) => part.name.startsWith("dual_grid_"))).toBe(true);
    expect(first.parts.every((part) => Boolean(part.label))).toBe(true);
  });

  it("keeps each scene composition distinct", () => {
    const names = KINDS.map((kind) => buildDualGridScene(kind, { cells: 12 }).parts.map((part) => part.name));
    expect(new Set(names.map((value) => value.join("|"))).size).toBe(KINDS.length);
  });
});
