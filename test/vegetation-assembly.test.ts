import { describe, expect, it } from "vitest";
import {
  box,
  buildVegetationAssembly,
  buildVegetationAssemblyPreset,
  resolveVegetationAssembly,
  vec3,
  type VegetationAssemblyAsset,
  type VegetationAssemblyCollection,
} from "../src/index.js";

const collection: VegetationAssemblyCollection = {
  id: "test-assembly",
  label: "测试组合",
  slots: [{ id: "focal", label: "主景植物", species: "tree", type: "focal", transform: { position: vec3(1, 0, 2) } }],
};

const assets: VegetationAssemblyAsset[] = [
  { id: "tree-a", label: "树 A", species: "tree", type: "focal", build: () => [{ name: "mesh", label: "树冠", mesh: box(1) }] },
  { id: "tree-b", label: "树 B", species: "tree", type: "focal", build: () => [{ name: "mesh", label: "树冠", mesh: box(1) }] },
];

describe("vegetation assembly collection", () => {
  it("resolves assets deterministically from collection and location", () => {
    const options = { seed: 12, seedPosition: vec3(4, 0, 9), positionJitter: 0.1, yawJitter: 0.2, scaleJitter: 0.1 };
    const first = resolveVegetationAssembly(collection, assets, options);
    const second = resolveVegetationAssembly(collection, assets, options);
    expect(first[0]!.asset.id).toBe(second[0]!.asset.id);
    expect(first[0]!.seed).toBe(second[0]!.seed);
    expect(first[0]!.resolvedTransform).toEqual(second[0]!.resolvedTransform);
    const moved = resolveVegetationAssembly(collection, assets, { ...options, seedPosition: vec3(5, 0, 9) });
    expect(moved[0]!.seed).not.toBe(first[0]!.seed);
  });

  it("preserves semantic slots and relative transforms in built parts", () => {
    const parts = buildVegetationAssembly(collection, assets, { seed: 3, randomizeAssets: false });
    expect(parts).toHaveLength(1);
    expect(parts[0]!.label).toContain("主景植物");
    expect(parts[0]!.metadata?.species).toBe("tree");
    expect(parts[0]!.metadata?.assemblyType).toBe("focal");
    const xs = parts[0]!.mesh.positions.map((point) => point.x);
    const zs = parts[0]!.mesh.positions.map((point) => point.z);
    expect((Math.min(...xs) + Math.max(...xs)) * 0.5).toBeCloseTo(1);
    expect((Math.min(...zs) + Math.max(...zs)) * 0.5).toBeCloseTo(2);
  });

  it("builds three model-library presets with semantic metadata", () => {
    for (const preset of ["flower-island", "woodland-edge", "dry-rockery"] as const) {
      const parts = buildVegetationAssemblyPreset(preset, { seed: 5, density: 0.25 });
      expect(parts.length).toBeGreaterThan(8);
      expect(parts.every((part) => part.mesh.indices.length % 3 === 0)).toBe(true);
      expect(parts.every((part) => typeof part.metadata?.slotLabel === "string")).toBe(true);
      expect(parts.some((part) => part.metadata?.species === "tree")).toBe(true);
      expect(parts.some((part) => part.metadata?.species === "rock")).toBe(true);
    }
  });
});
