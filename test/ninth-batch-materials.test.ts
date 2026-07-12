import { describe, expect, it } from "vitest";
import {
  NINTH_BATCH_MATERIAL_DEFINITIONS,
  NINTH_BATCH_MATERIAL_PARAM_SCHEMA,
  NINTH_BATCH_MATERIALS,
  defaultNinthBatchMaterialParams,
  exportNinthBatchMaterialBundle,
} from "../src/texture/ninth-batch-materials.js";
import { validateLayeredMaterial } from "../src/texture/shading-mechanics.js";

function mean(values: Float32Array): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

describe("ninth batch volumetric and displaced materials", () => {
  const names = Object.keys(NINTH_BATCH_MATERIALS) as Array<keyof typeof NINTH_BATCH_MATERIALS>;

  it("registers ten materials with complete schemas", () => {
    expect(names).toHaveLength(10);
    expect(Object.keys(NINTH_BATCH_MATERIAL_DEFINITIONS)).toEqual(names);
    for (const name of names) {
      expect(NINTH_BATCH_MATERIAL_PARAM_SCHEMA[name]).toHaveLength(9);
      expect(Object.keys(defaultNinthBatchMaterialParams(name))).toHaveLength(9);
    }
  });

  it("builds deterministic valid nineteen-channel materials", () => {
    for (const name of names) {
      const first = NINTH_BATCH_MATERIALS[name](16, {});
      const second = NINTH_BATCH_MATERIALS[name](16, {});
      expect(validateLayeredMaterial(first), name).toEqual([]);
      expect(first.baseColor.data, name).toEqual(second.baseColor.data);
      expect(first.ninthBatchRuntime.volumeReference.checksum, name).toBe(second.ninthBatchRuntime.volumeReference.checksum);
      expect(first.ninthBatchRuntime.volumeWgsl, name).toContain("integrateVolume");
    }
  });

  it("authors distinctive volume, ocean, displacement and fiber features", () => {
    const cloud = NINTH_BATCH_MATERIALS.evolvingCumulusCloud(24, {});
    const fire = NINTH_BATCH_MATERIALS.combustionFireAndSmoke(24, {});
    const ocean = NINTH_BATCH_MATERIALS.spectralOceanSeafoam(24, {});
    const strata = NINTH_BATCH_MATERIALS.foldedErodedRockStrata(24, {});
    const yarn = NINTH_BATCH_MATERIALS.geometricWovenYarn(24, {});
    const feather = NINTH_BATCH_MATERIALS.anisotropicLayeredFeather(24, {});
    expect(cloud.ninthBatchRuntime.volumeReference.activeVoxelRatio).toBeGreaterThan(0.05);
    expect(mean(fire.emission.data)).toBeGreaterThan(0.01);
    expect(mean(ocean.transmission.data)).toBeGreaterThan(0.35);
    expect(strata.ninthBatchRuntime.displacement.subdivisions).toBeGreaterThan(0);
    expect(mean(yarn.anisotropy.data)).toBeGreaterThan(0.75);
    expect(mean(feather.opacity.data)).toBeLessThan(0.9);
  });

  it("responds to time and displacement parameters", () => {
    const early = NINTH_BATCH_MATERIALS.spectralOceanSeafoam(20, { time: 0 });
    const late = NINTH_BATCH_MATERIALS.spectralOceanSeafoam(20, { time: 4 });
    const flat = NINTH_BATCH_MATERIALS.foldedErodedRockStrata(20, { displacement: 0.1 });
    const deep = NINTH_BATCH_MATERIALS.foldedErodedRockStrata(20, { displacement: 1 });
    expect(early.height.data).not.toEqual(late.height.data);
    expect(deep.ninthBatchRuntime.displacement.maxSlope).toBeGreaterThan(flat.ninthBatchRuntime.displacement.maxSlope);
  });

  it("exports surface, volume, WGSL and reference assets", () => {
    const material = NINTH_BATCH_MATERIALS.evolvingCumulusCloud(16, {});
    const exported = exportNinthBatchMaterialBundle(material, "cloud");
    expect(Object.keys(exported.files)).toHaveLength(28);
    expect(exported.files["cloud_baseColor.png"]?.slice(1, 4)).toEqual(Uint8Array.from([80, 78, 71]));
    expect(exported.files["cloud.volume.f32"]?.byteLength).toBe(12 * 12 * 12 * 6 * 4);
    expect(exported.files["cloud.volume.json"]).toBeDefined();
    expect(exported.files["cloud.volume.wgsl"]).toBeDefined();
    expect(exported.files["cloud.reference.json"]).toBeDefined();
    expect(exported.manifest.mode).toBe("volume");
  });
});
