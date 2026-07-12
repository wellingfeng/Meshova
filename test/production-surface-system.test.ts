import { describe, expect, it } from "vitest";
import {
  applyGeometryAwareWeathering,
  bakeGeometryToTextures,
  bakeProductionMaterial,
  box,
  compileTextureCompute,
  createMaterialAnchors,
  executeTextureCompute,
  fitTextureReference,
  generate,
  geometryAwareMasks,
  makeTexture,
  materialAnchor,
  materialFromFields,
  splinePathMask,
  wangTileTexture,
  withMaterialAnchor,
} from "../src/index.js";

describe("production surface system", () => {
  it("bakes production mesh maps without breaking legacy fields", () => {
    const mesh = box(2, 1, 3);
    const triangleCount = mesh.indices.length / 3;
    const bake = bakeGeometryToTextures(mesh, {
      width: 32,
      height: 32,
      primitiveIds: Array.from({ length: triangleCount }, (_, index) => index),
      materialIds: Array.from({ length: triangleCount }, (_, index) => index % 3),
    });
    expect(bake.position.channels).toBe(3);
    expect(bake.worldNormal).toBe(bake.normal);
    expect(bake.thickness.channels).toBe(1);
    expect(Math.max(...bake.thickness.data)).toBeGreaterThan(0.9);
    expect(bake.materialIdRange).toEqual([0, 2]);
    expect(Math.max(...bake.materialId.data)).toBe(1);
  });

  it("derives geometry-aware dirt, wear and rain masks", () => {
    const bake = bakeGeometryToTextures(box(), { width: 16, height: 16 });
    const masks = geometryAwareMasks(bake, { rainAmount: 0.8, dirtAmount: 0.7 });
    expect(Math.max(...masks.rain.data)).toBeGreaterThan(0);
    expect(Math.max(...masks.dirt.data)).toBeGreaterThan(0);
    const material = materialFromFields(16, {
      baseColor: () => [0.5, 0.5, 0.5],
      roughness: () => 0.5,
      height: () => 0.5,
    });
    const weathered = applyGeometryAwareWeathering(material, bake);
    expect(weathered).not.toBe(material);
    expect(weathered.baseColor.data).not.toEqual(material.baseColor.data);
  });

  it("builds reusable spline masks and immutable anchors", () => {
    const path = splinePathMask(64, 32, [
      { u: 0.1, v: 0.2, width: 0.025 },
      { u: 0.5, v: 0.75, width: 0.06 },
      { u: 0.9, v: 0.35, width: 0.03 },
    ]);
    expect(Math.max(...path.data)).toBeGreaterThan(0.9);
    const anchors = withMaterialAnchor(createMaterialAnchors(), "cracks", path);
    const copy = materialAnchor(anchors, "cracks");
    copy.data[0] = 1;
    expect(materialAnchor(anchors, "cracks").data[0]).not.toBe(1);
  });

  it("assembles deterministic edge-compatible Wang tiles", () => {
    const sources = [0, 1].flatMap((vertical) => [0, 1].map((horizontal) => {
      const texture = makeTexture(4, 4, 1);
      texture.data.fill((vertical * 2 + horizontal) / 3);
      return {
        texture,
        north: vertical,
        east: horizontal,
        south: vertical,
        west: horizontal,
      };
    }));
    const first = wangTileTexture(sources, { tilesX: 5, tilesY: 4, seed: 72 });
    const second = wangTileTexture(sources, { tilesX: 5, tilesY: 4, seed: 72 });
    expect(first.texture.data).toEqual(second.texture.data);
    for (let y = 0; y < first.tilesY; y++) {
      for (let x = 0; x < first.tilesX; x++) {
        const placement = first.placements[y * first.tilesX + x]!;
        if (x > 0) expect(placement.west).toBe(first.placements[y * first.tilesX + x - 1]!.east);
        if (y > 0) expect(placement.north).toBe(first.placements[(y - 1) * first.tilesX + x]!.south);
      }
    }
  });

  it("fits numeric material parameters to a reference texture", () => {
    const reference = generate(8, 8, 1, () => 0.75);
    const fit = fitTextureReference(
      reference,
      [{ name: "value", min: 0, max: 1, step: 0.05 }],
      (params) => generate(8, 8, 1, () => params.value!),
      { seed: 5, candidates: 8, refinementPasses: 3 },
    );
    expect(fit.params.value).toBeCloseTo(0.75, 6);
    expect(fit.score).toBeCloseTo(0, 6);
  });

  it("runs one compute expression on CPU and emits WGSL", async () => {
    const left = generate(4, 4, 1, () => 0.25);
    const right = generate(4, 4, 1, () => 0.5);
    const expression = {
      op: "clamp" as const,
      value: {
        op: "add" as const,
        left: { op: "input" as const, index: 0 },
        right: { op: "input" as const, index: 1 },
      },
      min: 0,
      max: 1,
    };
    const compiled = compileTextureCompute(expression, 2);
    expect(compiled.wgsl).toContain("@compute @workgroup_size(64)");
    const result = await executeTextureCompute(expression, [left, right], { backend: "cpu" });
    expect(result.backend).toBe("cpu");
    expect([...result.texture.data].every((value) => Math.abs(value - 0.75) < 1e-6)).toBe(true);
  });

  it("exposes common anchors for all five production materials", () => {
    const names = [
      "urbanGroundKit",
      "damagedPlasterBrick",
      "sciFiIndustrialPanel",
      "brushedMetalGrille",
      "wetDrainConcrete",
    ] as const;
    for (const name of names) {
      const bake = bakeProductionMaterial(name, 16, { cache: false, mipLevels: 2 });
      expect(materialAnchor(bake.anchors, "height").data).toEqual(bake.material.height.data);
      expect(bake.mipmaps.height).toHaveLength(2);
    }
  });
});
