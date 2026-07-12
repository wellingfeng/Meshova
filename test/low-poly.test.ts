import { describe, expect, it } from "vitest";
import { box, styleLowPolyMesh } from "../src/index.js";

describe("low-poly style", () => {
  it("duplicates every triangle corner and assigns one normal per face", () => {
    const styled = styleLowPolyMesh(box(), [0.4, 0.7, 0.2], { seed: 7 });

    expect(styled.mesh.positions).toHaveLength(styled.mesh.indices.length);
    expect(styled.colors).toHaveLength(styled.mesh.positions.length * 3);
    for (let offset = 0; offset < styled.mesh.indices.length; offset += 3) {
      const normalA = styled.mesh.normals[offset]!;
      const normalB = styled.mesh.normals[offset + 1]!;
      const normalC = styled.mesh.normals[offset + 2]!;
      expect(normalB).toEqual(normalA);
      expect(normalC).toEqual(normalA);
    }
  });

  it("keeps face colors deterministic for a seed", () => {
    const first = styleLowPolyMesh(box(), [0.6, 0.5, 0.3], { seed: 19, colorVariation: 0.15 });
    const second = styleLowPolyMesh(box(), [0.6, 0.5, 0.3], { seed: 19, colorVariation: 0.15 });
    const other = styleLowPolyMesh(box(), [0.6, 0.5, 0.3], { seed: 20, colorVariation: 0.15 });

    expect(second.colors).toEqual(first.colors);
    expect(other.colors).not.toEqual(first.colors);
  });
});
