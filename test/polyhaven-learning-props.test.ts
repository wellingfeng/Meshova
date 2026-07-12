import { describe, expect, it } from "vitest";
import { bounds, merge } from "../src/geometry/index.js";
import {
  POLY_HAVEN_PROP_MODELS,
  buildPolyHavenPropParts,
  type PolyHavenPropKind,
} from "../src/models/polyhaven-props.js";

const sourceIds = [
  "modular_factory_facade",
  "modular_urban_apartments_facade",
  "cassette_player",
  "hand_truck",
  "korean_fire_extinguisher_01",
  "dartboard",
];

const expectedParts: Record<string, string[]> = {
  modular_factory_facade: ["facade_wall_modules", "facade_window_frames", "facade_window_glass", "facade_entrances", "facade_feature_modules", "facade_roofline"],
  modular_urban_apartments_facade: ["facade_wall_modules", "facade_window_frames", "facade_window_glass", "facade_entrances", "facade_feature_modules", "facade_roofline"],
  cassette_player: ["cassette_player_shell", "cassette_player_speaker", "cassette_player_grille", "cassette_player_window", "cassette_player_spools", "cassette_player_controls"],
  hand_truck: ["hand_truck_rails", "hand_truck_crossbars", "hand_truck_toe_plate", "hand_truck_axle", "hand_truck_wheels"],
  korean_fire_extinguisher_01: ["fire_extinguisher_stand", "fire_extinguisher_vessel", "fire_extinguisher_valve", "fire_extinguisher_hose", "fire_extinguisher_label"],
  dartboard: ["dartboard_body", "dartboard_dark_sectors", "dartboard_light_sectors", "dartboard_red_rings", "dartboard_green_rings", "dartboard_bullseye", "dartboard_numbers", "dartboard_wire"],
};

describe("Poly Haven capability-learning procedural props", () => {
  it("registers all six preview-based reconstructions with provenance", () => {
    const definitions = sourceIds.map((sourceAssetId) => POLY_HAVEN_PROP_MODELS.find((entry) => entry.sourceAssetId === sourceAssetId));
    expect(definitions.every(Boolean)).toBe(true);
    expect(new Set(definitions.map((entry) => entry!.kind)).size).toBe(6);
    for (const definition of definitions) {
      expect(buildPolyHavenPropParts(definition!.defaults)[0]!.metadata).toMatchObject({
        referencePage: `https://polyhaven.com/a/${definition!.sourceAssetId}`,
        reconstruction: "procedural-from-public-preview",
        sourceMeshUsed: false,
        sourceTexturesUsed: false,
      });
    }
  });

  it.each(sourceIds)("builds semantic non-empty parts for %s", (sourceAssetId) => {
    const definition = POLY_HAVEN_PROP_MODELS.find((entry) => entry.sourceAssetId === sourceAssetId)!;
    const parts = buildPolyHavenPropParts(definition.defaults);
    expect(parts.map((entry) => entry.name)).toEqual(expect.arrayContaining(expectedParts[sourceAssetId]!));
    expect(parts.every((entry) => entry.label && !entry.label.includes("component_"))).toBe(true);
    expect(parts.every((entry) => entry.mesh.positions.length > 0)).toBe(true);
    expect(merge(...parts.map((entry) => entry.mesh)).positions.length).toBeGreaterThan(300);
  });

  it("uses one semantic facade grammar for factory and apartment styles", () => {
    const factory = buildPolyHavenPropParts({ kind: "factory-facade-kit" });
    const apartment = buildPolyHavenPropParts({ kind: "apartment-facade-kit" });
    expect(factory.map((entry) => entry.name)).toEqual(apartment.map((entry) => entry.name));
    expect(factory.find((entry) => entry.name === "facade_feature_modules")!.label).toContain("雨棚");
    expect(apartment.find((entry) => entry.name === "facade_feature_modules")!.label).toContain("阳台");
  });

  it("keeps all six generators deterministic", () => {
    for (const sourceAssetId of sourceIds) {
      const definition = POLY_HAVEN_PROP_MODELS.find((entry) => entry.sourceAssetId === sourceAssetId)!;
      const first = buildPolyHavenPropParts({ ...definition.defaults, seed: 77 });
      const second = buildPolyHavenPropParts({ ...definition.defaults, seed: 77 });
      expect(first.map((entry) => entry.mesh.positions)).toEqual(second.map((entry) => entry.mesh.positions));
    }
  });

  it.each([
    ["factory-facade-kit", "facade_roofline"],
    ["apartment-facade-kit", "facade_feature_modules"],
    ["cassette-player", "cassette_player_side_hardware"],
    ["hand-truck", "hand_truck_toe_plate"],
    ["fire-extinguisher", "fire_extinguisher_valve"],
    ["dartboard", "dartboard_dark_sectors"],
  ] as Array<[PolyHavenPropKind, string]>)("variation changes %s geometry", (kind, partName) => {
    const low = buildPolyHavenPropParts({ kind, variation: 0 });
    const high = buildPolyHavenPropParts({ kind, variation: 1 });
    expect(low.find((entry) => entry.name === partName)?.mesh.positions)
      .not.toEqual(high.find((entry) => entry.name === partName)?.mesh.positions);
  });

  it("keeps dartboard centered above ground at declared diameter", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((entry) => entry.sourceAssetId === "dartboard")!;
    const boardBounds = bounds(merge(...buildPolyHavenPropParts(definition.defaults).map((entry) => entry.mesh)));
    expect(boardBounds.min.y).toBeCloseTo(0, 3);
    expect(boardBounds.max.y).toBeCloseTo(definition.defaults.height, 3);
  });
});
