import { describe, expect, it } from "vitest";
import {
  ROOM_LAYOUT_MODELS,
  ROOM_LAYOUT_RESEARCH_SOURCES,
  buildRoomLayoutScene,
} from "../src/models/room-layout-systems.js";

describe("room layout systems", () => {
  it("records the optimization and accessibility research inputs", () => {
    expect(ROOM_LAYOUT_RESEARCH_SOURCES.map((source) => source.id)).toEqual([
      "make-it-home-2011",
      "ada-accessible-routes",
    ]);
    expect(ROOM_LAYOUT_RESEARCH_SOURCES[1]!.applied).toContain("连续净宽 0.9144m");
  });

  it("builds five reachable room presets without layout conflicts", () => {
    expect(ROOM_LAYOUT_MODELS).toHaveLength(5);
    for (const definition of ROOM_LAYOUT_MODELS) {
      const scene = buildRoomLayoutScene(definition.defaults);
      expect(scene.parts.length).toBeGreaterThan(8);
      expect(scene.layout.placements.length).toBeGreaterThan(4);
      expect(scene.layout.issues).toEqual([]);
      expect(scene.layout.metrics.score).toBeGreaterThan(90);
      expect(scene.layout.metrics.circulation).toBeGreaterThan(0.9);
      expect(scene.layout.metrics.accessibleObjects).toBe(1);
      expect(scene.parts.some((entry) => entry.metadata?.reusedExistingModel === true)).toBe(true);
    }
  });

  it("is deterministic for identical room inputs", () => {
    const defaults = ROOM_LAYOUT_MODELS[0]!.defaults;
    const first = buildRoomLayoutScene(defaults);
    const second = buildRoomLayoutScene(defaults);
    expect(first.layout).toEqual(second.layout);
    expect(first.parts.map((entry) => entry.name)).toEqual(second.parts.map((entry) => entry.name));
    expect(first.parts[0]!.mesh.positions).toEqual(second.parts[0]!.mesh.positions);
  });

  it("uses density to control optional furniture", () => {
    const defaults = ROOM_LAYOUT_MODELS.find((entry) => entry.kind === "living-room")!.defaults;
    const sparse = buildRoomLayoutScene({ ...defaults, density: 0.35 });
    const dense = buildRoomLayoutScene({ ...defaults, density: 1 });
    expect(sparse.layout.placements.length).toBeLessThan(dense.layout.placements.length);
    expect(sparse.layout.issues).toEqual([]);
    expect(dense.layout.issues).toEqual([]);
  });
});
