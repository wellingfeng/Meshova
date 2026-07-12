import { describe, expect, it } from "vitest";
import {
  BILIBILI_MATERIAL_DEFINITIONS,
  BILIBILI_MATERIAL_PARAM_SCHEMA,
  BILIBILI_MATERIALS,
  defaultBilibiliMaterialParams,
  materialFromFields,
  validateMaterial,
} from "../src/index.js";

describe("bilibili stylized material course", () => {
  const names = Object.keys(BILIBILI_MATERIALS) as Array<keyof typeof BILIBILI_MATERIALS>;

  it("registers all 38 episodes in course order", () => {
    expect(names).toHaveLength(38);
    expect(Object.keys(BILIBILI_MATERIAL_DEFINITIONS)).toEqual(names);
    expect(names.map((name) => BILIBILI_MATERIAL_DEFINITIONS[name].episode)).toEqual(
      Array.from({ length: 38 }, (_, index) => index + 1),
    );
    expect(new Set(names.map((name) => BILIBILI_MATERIAL_DEFINITIONS[name].bvid)).size).toBe(38);
  });

  it("provides editable independent defaults", () => {
    for (const name of names) {
      expect(BILIBILI_MATERIAL_PARAM_SCHEMA[name]).toHaveLength(7);
      const first = defaultBilibiliMaterialParams(name);
      const second = defaultBilibiliMaterialParams(name);
      expect(first.color).toEqual(second.color);
      expect(first.color).not.toBe(second.color);
    }
  });

  it("bakes deterministic valid PBR maps", () => {
    for (const name of names) {
      const first = materialFromFields(12, BILIBILI_MATERIALS[name]({}));
      const second = materialFromFields(12, BILIBILI_MATERIALS[name]({}));
      expect(validateMaterial(first), name).toEqual([]);
      expect([...first.height.data], name).toEqual([...second.height.data]);
      expect(Math.max(...first.height.data) - Math.min(...first.height.data), name).toBeGreaterThan(0.02);
    }
  });

  it("scale changes structural output", () => {
    const coarse = materialFromFields(16, BILIBILI_MATERIALS.stylizedBrickWall({ scale: 4 }));
    const dense = materialFromFields(16, BILIBILI_MATERIALS.stylizedBrickWall({ scale: 12 }));
    expect([...coarse.height.data]).not.toEqual([...dense.height.data]);
  });
});
