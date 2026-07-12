import { describe, expect, it } from "vitest";
import { bounds } from "../src/geometry/mesh.js";
import {
  buildSuspensionBridgeParts,
  resolveSuspensionBridgeParams,
} from "../src/models/suspension-bridge.js";

describe("suspension bridge", () => {
  it("builds semantic bridge assemblies", () => {
    const parts = buildSuspensionBridgeParts({ spanLength: 48, towerCount: 4 });
    expect(parts.map((part) => part.name)).toEqual([
      "deck_planks",
      "tower_frames",
      "tower_roofs",
      "main_cables",
      "handrail_cables",
      "vertical_hangers",
      "anchor_cables",
    ]);
    expect(parts.every((part) => part.mesh.positions.length > 0)).toBe(true);
    expect(parts.every((part) => part.label && !part.label.includes("_"))).toBe(true);
  });

  it("is deterministic for the same seed", () => {
    const first = buildSuspensionBridgeParts({ seed: 17, towerCount: 5 });
    const second = buildSuspensionBridgeParts({ seed: 17, towerCount: 5 });
    expect(first.map((part) => part.mesh.positions)).toEqual(second.map((part) => part.mesh.positions));
  });

  it("preserves requested span and tower height", () => {
    const parts = buildSuspensionBridgeParts({ spanLength: 60, towerHeight: 7, towerCount: 5 });
    const deckBounds = bounds(parts[0]!.mesh);
    const towerBounds = bounds(parts[1]!.mesh);
    expect(deckBounds.max.x - deckBounds.min.x).toBeGreaterThan(57);
    expect(towerBounds.max.y - towerBounds.min.y).toBeGreaterThan(10);
  });

  it("clamps unsafe parameter ranges", () => {
    const params = resolveSuspensionBridgeParams({ towerCount: 50, deckSag: -1, bridgeWidth: 0 });
    expect(params.towerCount).toBe(12);
    expect(params.deckSag).toBe(0);
    expect(params.bridgeWidth).toBe(1.4);
  });
});
