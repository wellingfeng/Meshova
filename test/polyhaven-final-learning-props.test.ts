import { describe, expect, it } from "vitest";
import {
  POLY_HAVEN_PROP_MODELS,
  buildPolyHavenPropParts,
} from "../src/models/polyhaven-props.js";

describe("Poly Haven final learning procedural props", () => {
  it("builds a roller shutter whose slats follow the opening state", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((entry) => entry.sourceAssetId === "rollershutter_door");
    expect(definition).toBeDefined();

    const closed = buildPolyHavenPropParts({ ...definition!.defaults, variation: 0 });
    const open = buildPolyHavenPropParts({ ...definition!.defaults, variation: 1 });
    expect(closed.map((entry) => entry.name)).toEqual(expect.arrayContaining([
      "roller_shutter_frame",
      "roller_shutter_tracks",
      "roller_shutter_slats",
      "roller_shutter_drum",
    ]));
    expect(closed.find((entry) => entry.name === "roller_shutter_slats")?.mesh.positions)
      .not.toEqual(open.find((entry) => entry.name === "roller_shutter_slats")?.mesh.positions);
  });

  it("builds a military compressor with a coupled crank and piston", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((entry) => entry.sourceAssetId === "old_military_compressor");
    expect(definition).toBeDefined();

    const retracted = buildPolyHavenPropParts({ ...definition!.defaults, variation: 0 });
    const extended = buildPolyHavenPropParts({ ...definition!.defaults, variation: 1 });
    expect(retracted.map((entry) => entry.name)).toEqual(expect.arrayContaining([
      "compressor_frame",
      "compressor_tank",
      "compressor_engine",
      "compressor_crank",
      "compressor_pistons",
      "compressor_gauges",
      "compressor_hoses",
    ]));
    expect(retracted.find((entry) => entry.name === "compressor_pistons")?.mesh.positions)
      .not.toEqual(extended.find((entry) => entry.name === "compressor_pistons")?.mesh.positions);
  });

  it("builds folding and extension ladders through one semantic family", () => {
    for (const sourceAssetId of ["ladder_sectioned_01", "wooden_ladder_02"]) {
      const definition = POLY_HAVEN_PROP_MODELS.find((entry) => entry.sourceAssetId === sourceAssetId);
      expect(definition).toBeDefined();
      const compact = buildPolyHavenPropParts({ ...definition!.defaults, variation: 0 });
      const deployed = buildPolyHavenPropParts({ ...definition!.defaults, variation: 1 });
      expect(compact.map((entry) => entry.name)).toEqual(expect.arrayContaining([
        "ladder_stiles",
        "ladder_rungs",
        "ladder_hinges",
        "ladder_locks",
      ]));
      expect(compact.find((entry) => entry.name === "ladder_stiles")?.mesh.positions)
        .not.toEqual(deployed.find((entry) => entry.name === "ladder_stiles")?.mesh.positions);
    }
  });

  it("builds a measuring tape with an extendable graduated blade", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((entry) => entry.sourceAssetId === "measuring_tape_01");
    expect(definition).toBeDefined();
    const retracted = buildPolyHavenPropParts({ ...definition!.defaults, variation: 0 });
    const extended = buildPolyHavenPropParts({ ...definition!.defaults, variation: 1 });
    expect(retracted.map((entry) => entry.name)).toEqual(expect.arrayContaining([
      "measuring_tape_case",
      "measuring_tape_reel",
      "measuring_tape_blade",
      "measuring_tape_ticks",
      "measuring_tape_lock",
      "measuring_tape_clip",
    ]));
    expect(retracted.find((entry) => entry.name === "measuring_tape_blade")?.mesh.positions)
      .not.toEqual(extended.find((entry) => entry.name === "measuring_tape_blade")?.mesh.positions);
  });

  it("builds an incandescent bulb with glass, screw base, and filament", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((entry) => entry.sourceAssetId === "lightbulb_01");
    expect(definition).toBeDefined();
    const sparse = buildPolyHavenPropParts({ ...definition!.defaults, structure: 6 });
    const dense = buildPolyHavenPropParts({ ...definition!.defaults, structure: 20 });
    expect(sparse.map((entry) => entry.name)).toEqual(expect.arrayContaining([
      "lightbulb_glass",
      "lightbulb_screw_base",
      "lightbulb_filament",
      "lightbulb_supports",
      "lightbulb_contact",
    ]));
    expect(sparse.find((entry) => entry.name === "lightbulb_filament")?.mesh.positions)
      .not.toEqual(dense.find((entry) => entry.name === "lightbulb_filament")?.mesh.positions);
  });

  it("builds a pendant lamp from shared rotational lighting forms", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((entry) => entry.sourceAssetId === "modern_ceiling_lamp_01");
    expect(definition).toBeDefined();
    const straight = buildPolyHavenPropParts({ ...definition!.defaults, variation: 0.5 });
    const offset = buildPolyHavenPropParts({ ...definition!.defaults, variation: 1 });
    expect(straight.map((entry) => entry.name)).toEqual(expect.arrayContaining([
      "pendant_canopy",
      "pendant_cable",
      "pendant_shade",
      "pendant_glass",
      "pendant_socket",
    ]));
    expect(straight.find((entry) => entry.name === "pendant_cable")?.mesh.positions)
      .not.toEqual(offset.find((entry) => entry.name === "pendant_cable")?.mesh.positions);
  });

  it("builds an A-frame chalkboard with procedural chalk lettering", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((entry) => entry.sourceAssetId === "standing_chalkboard_01");
    expect(definition).toBeDefined();
    const folded = buildPolyHavenPropParts({ ...definition!.defaults, variation: 0 });
    const open = buildPolyHavenPropParts({ ...definition!.defaults, variation: 1 });
    expect(folded.map((entry) => entry.name)).toEqual(expect.arrayContaining([
      "chalkboard_frame",
      "chalkboard_panels",
      "chalkboard_hinges",
      "chalkboard_chalk",
    ]));
    expect(folded.find((entry) => entry.name === "chalkboard_frame")?.mesh.positions)
      .not.toEqual(open.find((entry) => entry.name === "chalkboard_frame")?.mesh.positions);
  });

  it("builds a spade with a pressed blade, socket, shaft, and D grip", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((entry) => entry.sourceAssetId === "rusted_spade_01");
    expect(definition).toBeDefined();
    const upright = buildPolyHavenPropParts({ ...definition!.defaults, variation: 0 });
    const pitched = buildPolyHavenPropParts({ ...definition!.defaults, variation: 1 });
    expect(upright.map((entry) => entry.name)).toEqual(expect.arrayContaining([
      "spade_shaft",
      "spade_grip",
      "spade_socket",
      "spade_blade",
      "spade_ribs",
    ]));
    expect(upright.find((entry) => entry.name === "spade_blade")?.mesh.positions)
      .not.toEqual(pitched.find((entry) => entry.name === "spade_blade")?.mesh.positions);
  });

  it("builds handsaw and hacksaw variants with procedural tooth density", () => {
    for (const sourceAssetId of ["handsaw_wood", "rusted_hacksaw"]) {
      const definition = POLY_HAVEN_PROP_MODELS.find((entry) => entry.sourceAssetId === sourceAssetId);
      expect(definition).toBeDefined();
      const coarse = buildPolyHavenPropParts({ ...definition!.defaults, structure: 6 });
      const fine = buildPolyHavenPropParts({ ...definition!.defaults, structure: 20 });
      expect(coarse.map((entry) => entry.name)).toEqual(expect.arrayContaining([
        "saw_handle",
        "saw_blade",
        "saw_teeth",
      ]));
      expect(coarse.find((entry) => entry.name === "saw_teeth")?.mesh.positions)
        .not.toEqual(fine.find((entry) => entry.name === "saw_teeth")?.mesh.positions);
      if (sourceAssetId === "rusted_hacksaw") {
        expect(coarse.map((entry) => entry.name)).toEqual(expect.arrayContaining(["saw_frame", "saw_tensioner"]));
      }
    }
  });
});
