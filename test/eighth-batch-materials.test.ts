import { describe, expect, it } from "vitest";
import {
  defaultEighthBatchMaterialParams,
  EIGHTH_BATCH_MATERIAL_DEFINITIONS,
  EIGHTH_BATCH_MATERIAL_PARAM_SCHEMA,
  EIGHTH_BATCH_MATERIALS,
} from "../src/texture/eighth-batch-materials.js";
import { exportRealtimeMaterialBundle } from "../src/texture/realtime-material-system.js";
import { validateLayeredMaterial } from "../src/texture/shading-mechanics.js";

function mean(values: Float32Array): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

describe("eighth batch realtime advanced materials", () => {
  const names = Object.keys(EIGHTH_BATCH_MATERIALS) as Array<keyof typeof EIGHTH_BATCH_MATERIALS>;

  it("registers ten materials with complete parameter schemas", () => {
    expect(names).toHaveLength(10);
    expect(Object.keys(EIGHTH_BATCH_MATERIAL_DEFINITIONS)).toEqual(names);
    for (const name of names) {
      expect(EIGHTH_BATCH_MATERIAL_PARAM_SCHEMA[name]).toHaveLength(9);
      expect(Object.keys(defaultEighthBatchMaterialParams(name))).toHaveLength(9);
    }
  });

  it("builds deterministic valid nineteen-channel materials", () => {
    for (const name of names) {
      const first = EIGHTH_BATCH_MATERIALS[name](18, {});
      const second = EIGHTH_BATCH_MATERIALS[name](18, {});
      expect(validateLayeredMaterial(first), name).toEqual([]);
      expect(first.baseColor.data, name).toEqual(second.baseColor.data);
      expect(first.roughness.data, name).toEqual(second.roughness.data);
      expect(first.iridescenceThickness.data.length, name).toBe(18 * 18);
    }
  });

  it("authors distinctive advanced shading channels", () => {
    const eye = EIGHTH_BATCH_MATERIALS.anatomicalWetEye(24, {});
    const hair = EIGHTH_BATCH_MATERIALS.dualLobeHumanHair(24, {});
    const glass = EIGHTH_BATCH_MATERIALS.solidOpticalGlass(24, {});
    const bubbles = EIGHTH_BATCH_MATERIALS.iridescentSoapBubbles(24, {});
    const paper = EIGHTH_BATCH_MATERIALS.fibrousAbsorbentPaper(24, {});
    expect(mean(eye.clearcoat.data)).toBeGreaterThan(0.9);
    expect(mean(hair.anisotropy.data)).toBeGreaterThan(0.85);
    expect(mean(glass.transmission.data)).toBeGreaterThan(0.7);
    expect(mean(bubbles.iridescence.data)).toBeGreaterThan(0.6);
    expect(mean(paper.subsurface.data)).toBeGreaterThan(0.3);
  });

  it("responds to world scale and thickness parameters", () => {
    const small = EIGHTH_BATCH_MATERIALS.layeredCorrugatedCardboard(24, { worldScale: 0.5 });
    const large = EIGHTH_BATCH_MATERIALS.layeredCorrugatedCardboard(24, { worldScale: 2 });
    const thin = EIGHTH_BATCH_MATERIALS.solidOpticalGlass(24, { thickness: 0.1 });
    const thick = EIGHTH_BATCH_MATERIALS.solidOpticalGlass(24, { thickness: 1 });
    expect(small.height.data).not.toEqual(large.height.data);
    expect(mean(thick.thicknessMap.data)).toBeGreaterThan(mean(thin.thicknessMap.data));
  });

  it("exports maps, OpenPBR, MaterialX, WGSL and runtime manifest", () => {
    const material = EIGHTH_BATCH_MATERIALS.tintedFlowingLiquid(16, {});
    const exported = exportRealtimeMaterialBundle(material, "liquid");
    expect(Object.keys(exported.files)).toHaveLength(23);
    expect(exported.files["liquid_baseColor.png"]?.slice(1, 4)).toEqual(Uint8Array.from([80, 78, 71]));
    expect(exported.files["liquid.openpbr.json"]).toBeDefined();
    expect(exported.files["liquid.mtlx"]).toBeDefined();
    expect(exported.files["liquid.openpbr.wgsl"]).toBeDefined();
    expect(exported.manifest.channels).toHaveLength(19);
  });
});
