import { describe, expect, it } from "vitest";
import {
  buildTerrainField,
  erodeTerrainHeightfield,
  field2DStats,
  heightfieldToTerrainMesh,
  islandTerrainRecipe,
  makeTerrainPrimitiveField,
  mutateTerrain,
  runTerrainRecipe,
  terrainVertexColors,
  triangleCount,
  vertexCount,
} from "../src/index.js";

describe("Gaea-style terrain heightfields", () => {
  it("builds heightfield, masks, mesh and vertex colors", () => {
    const terrain = buildTerrainField({ resolution: 32, seed: 7, height: 2, iterations: 8 });
    expect(terrain.height.width).toBe(33);
    expect(terrain.height.height).toBe(33);
    expect(vertexCount(terrain.mesh)).toBe(33 * 33);
    expect(triangleCount(terrain.mesh)).toBe(32 * 32 * 2);
    expect(terrain.colors.length).toBe(vertexCount(terrain.mesh) * 3);
    expect(terrain.fieldSet.fields.height).toBe(terrain.height);
    expect(terrain.fieldSet.fields.flow).toBe(terrain.masks.flow);
    expect(field2DStats(terrain.masks.slope).max).toBeGreaterThan(0);
    expect(field2DStats(terrain.masks.flow).max).toBe(1);
  });

  it("is deterministic for fixed seed and params", () => {
    const a = buildTerrainField({ resolution: 20, seed: 12, height: 1.7, iterations: 6 });
    const b = buildTerrainField({ resolution: 20, seed: 12, height: 1.7, iterations: 6 });
    expect(a.height.data).toEqual(b.height.data);
    expect(a.mesh.positions).toEqual(b.mesh.positions);
    expect(a.mesh.indices).toEqual(b.mesh.indices);
    expect(a.colors).toEqual(b.colors);
  });

  it("seed changes landform without changing topology", () => {
    const a = buildTerrainField({ resolution: 18, seed: 1, iterations: 0 });
    const b = buildTerrainField({ resolution: 18, seed: 99, iterations: 0 });
    expect(vertexCount(a.mesh)).toBe(vertexCount(b.mesh));
    expect(triangleCount(a.mesh)).toBe(triangleCount(b.mesh));
    expect(a.height.data).not.toEqual(b.height.data);
  });

  it("erosion produces wear and deposition maps while lowering sharp peaks", () => {
    const base = makeTerrainPrimitiveField({
      resolution: 36,
      seed: 5,
      height: 2.4,
      ridgeStrength: 0.85,
      islandFalloff: 0,
    });
    const eroded = erodeTerrainHeightfield(base, {
      iterations: 14,
      hydraulicStrength: 0.02,
      thermalStrength: 0.08,
      talus: 0.03,
    });
    expect(field2DStats(eroded.wear).max).toBe(1);
    expect(field2DStats(eroded.deposition).max).toBe(1);
    expect(field2DStats(eroded.height).max).toBeLessThan(field2DStats(base).max);
  });

  it("mesh conversion and colors stay aligned to field samples", () => {
    const height = makeTerrainPrimitiveField({ resolution: 12, seed: 3, height: 1 });
    const terrain = buildTerrainField({ resolution: 12, seed: 3, height: 1, iterations: 0 });
    const mesh = heightfieldToTerrainMesh(height, { size: 6 });
    const colors = terrainVertexColors(terrain.height, terrain.masks);
    expect(vertexCount(mesh)).toBe(height.width * height.height);
    expect(colors.length).toBe(height.data.length * 3);
  });

  it("runs terrain recipes with layers, data maps and mesh output", () => {
    const result = runTerrainRecipe({
      seed: 42,
      primitive: {
        resolution: 24,
        height: 1.4,
        noiseScale: 0.9,
        ridgeScale: 2.8,
        ridgeStrength: 0.7,
        islandFalloff: 0.8,
      },
      layers: [
        {
          height: 0.18,
          noiseScale: 5,
          ridgeScale: 8,
          ridgeStrength: 0.35,
          mode: "add",
          opacity: 0.45,
          mask: "slope",
        },
      ],
      erosion: [
        { iterations: 4, hydraulicStrength: 0.014, thermalStrength: 0.03 },
        { iterations: 4, hydraulicStrength: 0.01, rain: "slope" },
      ],
      masks: { size: 8, waterLevel: 0.15 },
      mesh: { size: 8 },
    });

    expect(result.fieldSet.width).toBe(25);
    expect(vertexCount(result.mesh)).toBe(25 * 25);
    expect(result.colors.length).toBe(vertexCount(result.mesh) * 3);
    expect(field2DStats(result.fieldSet.fields.wear).max).toBeGreaterThan(0);
    expect(field2DStats(result.fieldSet.fields.flow).max).toBe(1);
  });

  it("ships high-level terrain recipe presets", () => {
    const recipe = islandTerrainRecipe(11);
    const result = runTerrainRecipe({
      ...recipe,
      primitive: { ...recipe.primitive, resolution: 20 },
    });
    expect(recipe.name).toBe("island");
    expect(result.fieldSet.fields.height.width).toBe(21);
    expect(field2DStats(result.fieldSet.fields.water).mean).toBeGreaterThan(0);
  });

  it("mutates terrain recipes deterministically for AI search", () => {
    const recipe = islandTerrainRecipe(3);
    const options = { count: 3, seed: 99, amount: 0.12 };
    const a = mutateTerrain({
      ...recipe,
      primitive: { ...recipe.primitive, resolution: 14 },
    }, options);
    const b = mutateTerrain({
      ...recipe,
      primitive: { ...recipe.primitive, resolution: 14 },
    }, options);

    expect(a).toHaveLength(3);
    expect(a.map((candidate) => candidate.seed)).toEqual(b.map((candidate) => candidate.seed));
    expect(a.map((candidate) => candidate.metrics)).toEqual(b.map((candidate) => candidate.metrics));
    expect(a[0]!.metrics.elevationRange).toBeGreaterThan(0);
    expect(a[0]!.metrics.maxFlow).toBe(1);
  });
});
