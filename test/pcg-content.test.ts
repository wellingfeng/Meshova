import { describe, expect, it } from "vitest";
import { materialFromFields, validateMaterial } from "../src/index.js";
import { contentManifest } from "../content/index.js";
import { teddyBear } from "../content/models/teddy-bear/index.js";
import { rustyMetalMaterial } from "../content/materials/rusty-metal/index.js";

describe("PCG content package", () => {
  it("builds the generated manifest without duplicate ids", () => {
    expect(contentManifest.models.map((entry) => entry.id)).toEqual(["teddy"]);
    expect(contentManifest.materials.map((entry) => entry.id)).toEqual(["rustyMetal"]);
    expect(contentManifest.byId.size).toBe(2);
  });

  it("builds deterministic finite teddy geometry", () => {
    const first = teddyBear.build(teddyBear.defaultParams);
    const second = teddyBear.build(teddyBear.defaultParams);
    expect(first.length).toBe(15);
    expect(second.map((part) => part.mesh.positions)).toEqual(first.map((part) => part.mesh.positions));
    for (const part of first) {
      expect(part.label).toBeTruthy();
      expect(part.mesh.positions.length).toBeGreaterThan(0);
      expect(part.mesh.positions.every((position) =>
        [position.x, position.y, position.z].every(Number.isFinite))).toBe(true);
    }
  });

  it("bakes deterministic physically valid rusty metal", () => {
    const first = materialFromFields(32, rustyMetalMaterial.build(rustyMetalMaterial.defaultParams));
    const second = materialFromFields(32, rustyMetalMaterial.build(rustyMetalMaterial.defaultParams));
    expect(validateMaterial(first)).toEqual([]);
    expect([...second.baseColor.data]).toEqual([...first.baseColor.data]);
  });
});
