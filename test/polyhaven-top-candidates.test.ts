import { describe, expect, it } from "vitest";
import { merge } from "../src/geometry/index.js";
import {
  POLY_HAVEN_PROP_MODELS,
  buildPolyHavenPropParts,
  type PolyHavenPropKind,
} from "../src/models/polyhaven-props.js";

const sourceIds = [
  "vintage_grandfather_clock_01",
  "Drill_01",
  "security_camera_01",
  "metal_tool_chest",
  "modular_fire_escape",
  "Camera_01",
  "modular_wooden_pier",
  "modular_chainlink_fence",
];

const expectedParts: Record<string, string[]> = {
  vintage_grandfather_clock_01: ["grandfather_clock_case", "grandfather_clock_face", "grandfather_clock_marks", "grandfather_clock_door", "grandfather_clock_pendulum"],
  Drill_01: ["cordless_drill_shell", "cordless_drill_grip", "cordless_drill_chuck", "cordless_drill_battery", "cordless_drill_controls"],
  security_camera_01: ["security_camera_housing", "security_camera_face", "security_camera_lens", "security_camera_bracket", "security_camera_fasteners"],
  metal_tool_chest: ["tool_chest_cabinet", "tool_chest_drawers", "tool_chest_lid", "tool_chest_lid_supports", "tool_chest_hardware"],
  modular_fire_escape: ["fire_escape_platforms", "fire_escape_grating", "fire_escape_stairs", "fire_escape_guardrails", "fire_escape_ladder"],
  Camera_01: ["rangefinder_camera_body", "rangefinder_camera_lens", "rangefinder_camera_windows", "rangefinder_camera_controls", "rangefinder_camera_strap"],
  modular_wooden_pier: ["wooden_pier_deck", "wooden_pier_beams", "wooden_pier_piles", "wooden_pier_braces", "wooden_pier_end_rails"],
  modular_chainlink_fence: ["chainlink_fence_posts", "chainlink_fence_frames", "chainlink_fence_mesh", "chainlink_fence_privacy"],
};

describe("Poly Haven top candidate procedural props", () => {
  it("registers all eight preview-based reconstructions with provenance", () => {
    const definitions = sourceIds.map((sourceAssetId) => POLY_HAVEN_PROP_MODELS.find((entry) => entry.sourceAssetId === sourceAssetId));
    expect(definitions.every(Boolean)).toBe(true);
    expect(new Set(definitions.map((entry) => entry!.kind)).size).toBe(8);
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

  it("keeps all eight generators deterministic", () => {
    for (const sourceAssetId of sourceIds) {
      const definition = POLY_HAVEN_PROP_MODELS.find((entry) => entry.sourceAssetId === sourceAssetId)!;
      const first = buildPolyHavenPropParts({ ...definition.defaults, seed: 77 });
      const second = buildPolyHavenPropParts({ ...definition.defaults, seed: 77 });
      expect(first.map((entry) => entry.mesh.positions)).toEqual(second.map((entry) => entry.mesh.positions));
    }
  });

  it.each([
    ["grandfather-clock", "grandfather_clock_marks"],
    ["cordless-drill", "cordless_drill_shell"],
    ["security-camera", "security_camera_bracket"],
    ["metal-tool-chest", "tool_chest_lid"],
    ["modular-fire-escape", "fire_escape_ladder"],
    ["rangefinder-camera", "rangefinder_camera_strap"],
    ["modular-wooden-pier", "wooden_pier_deck"],
    ["modular-chainlink-fence", "chainlink_fence_mesh"],
  ] as Array<[PolyHavenPropKind, string]>) ("variation changes %s geometry", (kind, partName) => {
    const low = buildPolyHavenPropParts({ kind, variation: 0 });
    const high = buildPolyHavenPropParts({ kind, variation: 1 });
    expect(low.find((entry) => entry.name === partName)?.mesh.positions)
      .not.toEqual(high.find((entry) => entry.name === partName)?.mesh.positions);
  });
});
