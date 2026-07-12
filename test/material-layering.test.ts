import { describe, expect, it } from "vitest";
import {
  generate,
  layerMaterials,
  materialFromFields,
  sample,
  semanticLayerMask,
  validateMaterial,
} from "../src/index.js";

const SIZE = 24;

describe("semantic PBR layering", () => {
  it("selects a semantic height range", () => {
    const height = generate(SIZE, SIZE, 1, (u) => u);
    const mask = semanticLayerMask(height, { heightRange: [0.7, 1], softness: 0.04 });
    expect(sample(mask, 2, 12)).toBeLessThan(0.1);
    expect(sample(mask, 21, 12)).toBeGreaterThan(0.8);
  });

  it("composes multiple full PBR layers and keeps normals normalized", () => {
    const base = materialFromFields(SIZE, {
      baseColor: () => [0.2, 0.2, 0.2],
      roughness: () => 0.8,
      height: (u) => u * 0.4,
    });
    const paint = materialFromFields(SIZE, {
      baseColor: () => [0.8, 0.1, 0.05],
      metallic: () => 0.2,
      roughness: () => 0.3,
      height: (u) => 0.2 + u * 0.4,
    });
    const result = layerMaterials(base, [{
      material: paint,
      mask: (u) => u,
      blend: "height",
      heightContrast: 0.1,
    }]);
    expect(result.baseColor.data[0]).toBeLessThan(result.baseColor.data[(SIZE - 1) * 3]!);
    expect(validateMaterial(result)).toEqual([]);
    for (let index = 0; index < result.normal.width * result.normal.height; index++) {
      const x = result.normal.data[index * 3]! * 2 - 1;
      const y = result.normal.data[index * 3 + 1]! * 2 - 1;
      const z = result.normal.data[index * 3 + 2]! * 2 - 1;
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 4);
    }
  });
});
