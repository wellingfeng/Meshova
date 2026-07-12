import { describe, expect, it } from "vitest";
import { merge } from "../src/geometry/index.js";
import {
  POLY_HAVEN_PROP_MODELS,
  buildPolyHavenPropParts,
  type PolyHavenPropKind,
} from "../src/models/polyhaven-props.js";

const sourceIds = [
  "korean_public_payphone_01",
  "Drill_01",
  "ceiling_fan",
  "classic_laptop",
  "security_camera_01",
];

const expectedParts: Record<string, string[]> = {
  korean_public_payphone_01: ["payphone_body", "payphone_controls", "payphone_handset", "payphone_coiled_cord", "payphone_card_tray"],
  Drill_01: ["cordless_drill_shell", "cordless_drill_grip", "cordless_drill_chuck", "cordless_drill_battery", "cordless_drill_controls"],
  ceiling_fan: ["ceiling_fan_mount", "ceiling_fan_motor", "ceiling_fan_blades", "ceiling_fan_blade_brackets", "ceiling_fan_light"],
  classic_laptop: ["classic_laptop_base", "classic_laptop_lid", "classic_laptop_screen", "classic_laptop_keyboard", "classic_laptop_trackball"],
  security_camera_01: ["security_camera_housing", "security_camera_face", "security_camera_lens", "security_camera_bracket", "security_camera_fasteners"],
};

describe("Poly Haven next recommended procedural props", () => {
  it("registers all five preview-based reconstructions with provenance", () => {
    const definitions = sourceIds.map((sourceAssetId) => POLY_HAVEN_PROP_MODELS.find((entry) => entry.sourceAssetId === sourceAssetId));
    expect(definitions.every(Boolean)).toBe(true);
    expect(new Set(definitions.map((entry) => entry!.kind)).size).toBe(5);
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

  it("keeps all five generators deterministic", () => {
    for (const sourceAssetId of sourceIds) {
      const definition = POLY_HAVEN_PROP_MODELS.find((entry) => entry.sourceAssetId === sourceAssetId)!;
      const first = buildPolyHavenPropParts({ ...definition.defaults, seed: 77 });
      const second = buildPolyHavenPropParts({ ...definition.defaults, seed: 77 });
      expect(first.map((entry) => entry.mesh.positions)).toEqual(second.map((entry) => entry.mesh.positions));
    }
  });

  it.each([
    ["public-payphone", "payphone_coiled_cord"],
    ["cordless-drill", "cordless_drill_shell"],
    ["ceiling-fan", "ceiling_fan_blades"],
    ["classic-laptop", "classic_laptop_lid"],
    ["security-camera", "security_camera_bracket"],
  ] as Array<[PolyHavenPropKind, string]>)("variation changes %s geometry", (kind, partName) => {
    const low = buildPolyHavenPropParts({ kind, variation: 0 });
    const high = buildPolyHavenPropParts({ kind, variation: 1 });
    expect(low.find((entry) => entry.name === partName)?.mesh.positions)
      .not.toEqual(high.find((entry) => entry.name === partName)?.mesh.positions);
  });
});
