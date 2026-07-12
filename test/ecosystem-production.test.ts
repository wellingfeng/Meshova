import { describe, expect, it } from "vitest";
import {
  applyEcologicalAssociations,
  applyEcosystemBrushStrokes,
  bakeEcosystem,
  blendBiomes,
  buildEcosystemFeatureParts,
  deriveTerrainFeedback,
  planEcosystemStreaming,
  simulateEcosystemSuccession,
  vec3,
  type EcosystemInstance,
} from "../src/index.js";

const instances: EcosystemInstance[] = [
  { id: "tree", layerId: "canopy", assetId: "tree", position: vec3(0, 0, 0), collision: true },
  { id: "fern-near", layerId: "fern", assetId: "fern", position: vec3(1, 0, 0) },
  { id: "fern-far", layerId: "fern", assetId: "fern", position: vec3(8, 0, 0) },
  { id: "grass", layerId: "ground-cover", assetId: "grass", position: vec3(5, 0, 5) },
];

describe("ecosystem production tools", () => {
  it("applies deterministic add, erase, density and replace brush strokes", () => {
    const candidates = [
      ...instances,
      { id: "new-grass", layerId: "ground-cover", assetId: "grass", position: vec3(2, 0, 2) },
    ];
    const strokes = [
      { mode: "erase", center: vec3(0, 0, 0), radius: 0.5, strength: 1, targetLayer: "canopy" },
      { mode: "add", center: vec3(2, 0, 2), radius: 0.5, strength: 1, targetLayer: "ground-cover" },
      { mode: "replace", center: vec3(1, 0, 0), radius: 0.5, strength: 1, targetLayer: "fern", replacementAssetId: "moss" },
      { mode: "density", center: vec3(8, 0, 0), radius: 0.5, strength: 0, targetLayer: "fern" },
    ] as const;
    const first = applyEcosystemBrushStrokes(instances, candidates, strokes, 7);
    const second = applyEcosystemBrushStrokes(instances, candidates, strokes, 7);

    expect(first).toEqual(second);
    expect(first.map((instance) => instance.id)).toEqual(["fern-near", "grass", "new-grass"]);
    expect(first[0]?.assetId).toBe("moss");
  });

  it("blends forest, grassland and wetland weights", () => {
    const result = blendBiomes([
      { position: vec3(0, 0, 0), height: 0.2, slope: 0.1, moisture: 0.9, flow: 0.8 },
    ], [
      { id: "forest", height: [0.3, 1], slope: [0, 0.8], moisture: [0.2, 0.7], flow: [0, 0.6] },
      { id: "wetland", height: [0, 0.4], slope: [0, 0.3], moisture: [0.6, 1], flow: [0.5, 1] },
    ]);

    expect(result[0]?.dominantBiome).toBe("wetland");
    expect(Object.values(result[0]!.weights).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
  });

  it("bakes explicit chunks, collisions, LOD and streaming decisions", () => {
    const baked = bakeEcosystem(instances, 4, [10, 20, 40]);
    const decisions = planEcosystemStreaming(baked.chunks, vec3(0, 0, 0));

    expect(baked.schema).toBe("meshova-ecosystem-bake@1");
    expect(baked.exportStages).toEqual(["preview", "instances", "collision", "lod", "chunks", "export"]);
    expect(baked.collisionInstanceIds).toEqual(["tree"]);
    expect(baked.instanceBuffers.length).toBeGreaterThan(0);
    expect(decisions.every((decision) => decision.loaded)).toBe(true);
  });

  it("applies ecological proximity rules", () => {
    const associated = applyEcologicalAssociations(instances, [{
      sourceLayer: "canopy",
      targetLayer: "fern",
      minDistance: 0,
      maxDistance: 3,
      effect: "prefer",
      strength: 1,
    }]);

    expect(associated.some((instance) => instance.id === "fern-near")).toBe(true);
    expect(associated.some((instance) => instance.id === "fern-far")).toBe(false);
  });

  it("derives wetness and fertility then simulates succession", () => {
    const feedback = deriveTerrainFeedback([
      { position: vec3(0, 0, 0), height: 0, slope: 0.05, moisture: 0.9, flow: 0.8, sediment: 0.7 },
      { position: vec3(1, 1, 0), height: 1, slope: 0.8, moisture: 0.1, flow: 0, erosion: 0.8 },
    ]);
    const pioneer = simulateEcosystemSuccession(instances, { years: 4 });
    const mature = simulateEcosystemSuccession(instances, { years: 90 });

    expect(feedback[0]!.wetness).toBeGreaterThan(feedback[1]!.wetness);
    expect(feedback[0]!.fertility).toBeGreaterThan(feedback[1]!.fertility);
    expect(pioneer.find((instance) => instance.layerId === "canopy")?.visible).toBe(false);
    expect(mature.find((instance) => instance.layerId === "canopy")?.visible).toBe(true);
  });

  it("builds all seven deterministic model-library showcases", () => {
    const features = ["brush-editor", "biome-blend", "bake-contract", "association-rules", "lod-streaming", "terrain-feedback", "succession"] as const;
    for (const feature of features) {
      const first = buildEcosystemFeatureParts(feature, { density: 0.35, seed: 3 });
      const second = buildEcosystemFeatureParts(feature, { density: 0.35, seed: 3 });
      expect(first.length).toBeGreaterThan(1);
      expect(first.map((part) => [part.name, part.mesh.indices.length])).toEqual(
        second.map((part) => [part.name, part.mesh.indices.length]),
      );
    }
  });

  it("uses river water semantics for terrain feedback channels", () => {
    const parts = buildEcosystemFeatureParts("terrain-feedback", { density: 0.2, seed: 5 });
    const channel = parts.find((part) => part.name.endsWith("forest_path"));
    expect(channel?.surface).toMatchObject({ type: "water", params: { body: "river" } });
  });
});
