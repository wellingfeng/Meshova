import { describe, expect, it } from "vitest";
import {
  buildEcosystemArtToolParts,
  compileEcosystemLayers,
  plane,
  summarizeEcosystemArtTool,
} from "../src/index.js";

describe("ecosystem art tool", () => {
  it("builds deterministic layered ecosystem and chunk bake metadata", () => {
    const params = {
      size: 24,
      resolution: 24,
      density: 0.3,
      treeSpacing: 3.8,
      chunkSize: 8,
      seed: 9,
    };
    const first = buildEcosystemArtToolParts(params);
    const second = buildEcosystemArtToolParts(params);
    const firstSummary = summarizeEcosystemArtTool(first);
    const secondSummary = summarizeEcosystemArtTool(second);

    expect(first.map((part) => part.name)).toEqual([
      "ecosystem_terrain",
      "ecosystem_path",
      "canopy_trunks",
      "canopy_foliage",
      "understory",
      "ground_cover",
      "ecosystem_rocks",
    ]);
    expect(firstSummary).toEqual(secondSummary);
    expect(firstSummary.treeCount).toBeGreaterThan(0);
    expect(firstSummary.totalInstances).toBe(
      firstSummary.treeCount + firstSummary.shrubCount + firstSummary.groundCoverCount + firstSummary.rockCount,
    );
    expect(firstSummary.chunkCount).toBeGreaterThan(1);
    expect(firstSummary.bufferGroupCount).toBeGreaterThan(0);
  });

  it("compiles layer tables into deterministic GPU instance groups", () => {
    const surface = plane(12, 12, 8, 8);
    const layers = [{
      id: "grass",
      label: "草本",
      candidates: 120,
      density: 0.75,
      spacing: 0.6,
      mask: { type: "slope", maxDeg: 5 } as const,
      materialId: "foliage",
      assets: [
        { id: "grass-a", label: "草 A", weight: 2, scale: [0.7, 1.1] as const },
        { id: "grass-b", label: "草 B", weight: 1, scale: [0.5, 0.9] as const },
      ],
    }];
    const first = compileEcosystemLayers(surface, layers, { seed: 4, chunkSize: 4 });
    const second = compileEcosystemLayers(surface, layers, { seed: 4, chunkSize: 4 });

    expect(first.totalInstances).toBeGreaterThan(0);
    expect(first.totalInstances).toBe(second.totalInstances);
    expect(first.chunks).toEqual(second.chunks);
    expect(first.instanceBuffers.map((group) => [group.key, group.count])).toEqual(
      second.instanceBuffers.map((group) => [group.key, group.count]),
    );
  });
});
