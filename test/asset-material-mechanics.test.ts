import { describe, expect, it } from "vitest";
import {
  buildTextureLodPyramid,
  deriveSemanticSurfaceFields,
  exportAssetReadyMaterial,
  packOrmTexture,
  simulateAssetLifecycle,
} from "../src/texture/asset-material-mechanics.js";
import { SEVENTH_BATCH_MATERIALS } from "../src/texture/seventh-batch-materials.js";

function mean(values: Float32Array): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

describe("asset material mechanics", () => {
  it("builds deterministic semantic fields around declared sources", () => {
    const options = {
      seed: 12,
      contactSources: [{ center: [0.5, 0.5] as const, radius: [0.2, 0.2] as const }],
      heatSources: [{ center: [0.25, 0.25] as const, radius: [0.12, 0.12] as const }],
    };
    const first = deriveSemanticSurfaceFields(24, options);
    const second = deriveSemanticSurfaceFields(24, options);
    expect(first.contact.data).toEqual(second.contact.data);
    expect(first.runoff.data).toEqual(second.runoff.data);
    expect(first.contact.data[12 * 24 + 12]).toBeGreaterThan(first.contact.data[0]!);
    expect(first.heat.data[18 * 24 + 6]).toBeGreaterThan(first.heat.data[0]!);
  });

  it("evolves wear, grime and oxidation monotonically", () => {
    const fields = deriveSemanticSurfaceFields(28, {
      seed: 20,
      waterline: 0.5,
      contactSources: [{ center: [0.5, 0.5], radius: [0.35, 0.35] }],
    });
    const young = simulateAssetLifecycle(fields, { time: 0.1, moisture: 0.8, salinity: 0.8 });
    const old = simulateAssetLifecycle(fields, { time: 1, moisture: 0.8, salinity: 0.8 });
    const clean = simulateAssetLifecycle(fields, { time: 1, moisture: 0.8, salinity: 0.8, cleaning: 1 });
    expect(mean(old.wear.data)).toBeGreaterThan(mean(young.wear.data));
    expect(mean(old.oxidation.data)).toBeGreaterThan(mean(young.oxidation.data));
    expect(mean(clean.grime.data)).toBeLessThan(mean(old.grime.data));
  });

  it("packs glTF ORM channels and preserves means through LOD", () => {
    const material = SEVENTH_BATCH_MATERIALS.contactPolishedBrass(24, {});
    const orm = packOrmTexture(material);
    expect(orm.channels).toBe(3);
    expect(orm.data[0]).toBeCloseTo(material.ao.data[0]!, 6);
    expect(orm.data[1]).toBeCloseTo(material.roughness.data[0]!, 6);
    expect(orm.data[2]).toBeCloseTo(material.metallic.data[0]!, 6);
    const lod = buildTextureLodPyramid(material.roughness, 5);
    expect(lod.length).toBe(5);
    expect(lod[1]!.width).toBe(12);
    expect(Math.abs(mean(lod.at(-1)!.data) - mean(lod[0]!.data))).toBeLessThan(0.03);
  });

  it("exports layered maps, ORM, glTF, OpenPBR, MaterialX and report", () => {
    const material = SEVENTH_BATCH_MATERIALS.chippedPaintedToolSteel(16, {});
    const exported = exportAssetReadyMaterial(material, "tool");
    expect(Object.keys(exported.files)).toHaveLength(24);
    expect(exported.files["tool_orm.png"]?.slice(1, 4)).toEqual(Uint8Array.from([80, 78, 71]));
    expect(exported.files["tool.gltf-material.json"]).toBeDefined();
    expect(exported.openPbr.schema).toBe("OpenPBR");
    expect(exported.materialX).toContain("<materialx");
    expect(exported.report.schema).toBe("MeshovaAssetMaterialReport");
  });
});
