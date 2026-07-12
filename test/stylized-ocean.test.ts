import { describe, expect, it } from "vitest";
import { buildStylizedOceanEnvironmentParts } from "../src/index.js";

describe("stylized ocean environment", () => {
  it("builds deterministic island, ocean, cloud, boat, and fish parts", () => {
    const first = buildStylizedOceanEnvironmentParts({ seed: 19, cloudCount: 0, palmCount: 2 });
    const second = buildStylizedOceanEnvironmentParts({ seed: 19, cloudCount: 0, palmCount: 2 });
    expect(first.map((part) => part.name)).toEqual(second.map((part) => part.name));
    expect(first.map((part) => part.mesh.positions)).toEqual(second.map((part) => part.mesh.positions));
    expect(first.some((part) => part.metadata?.fxRole === "ocean-boat")).toBe(true);
    expect(first.filter((part) => part.metadata?.fxRole === "ocean-fish")).toHaveLength(3);
  });

  it("uses a dense ocean mesh and semantic labels", () => {
    const parts = buildStylizedOceanEnvironmentParts({ islandCount: 1, cloudCount: 0, palmCount: 0 });
    const ocean = parts.find((part) => part.name === "stylized_ocean_surface")!;
    expect(ocean.label).toBe("风格化广阔海面");
    expect(ocean.mesh.positions.length).toBeGreaterThan(10_000);
    expect(ocean.surface?.type).toBe("water");
    expect(ocean.surface?.params?.body).toBe("ocean");
    expect(Array.isArray(ocean.metadata?.islandMasks)).toBe(true);
    expect(parts.every((part) => part.label && !/^component_|^root\./.test(part.label))).toBe(true);
  });

  it("clamps scene counts", () => {
    const parts = buildStylizedOceanEnvironmentParts({ islandCount: 99, cloudCount: 0, palmCount: 0 });
    const ocean = parts.find((part) => part.name === "stylized_ocean_surface")!;
    expect(ocean.metadata?.islandMasks).toHaveLength(3);
  });
});
