import { describe, expect, it } from "vitest";
import { vec2 } from "../src/math/vec2.js";
import { vec3 } from "../src/math/vec3.js";
import { makeMesh } from "../src/geometry/mesh.js";
import { generate, makeTexture } from "../src/texture/buffer.js";
import { textureToPNG } from "../src/texture/png.js";
import { dielectricBase } from "../src/texture/pbr.js";
import { extendedMaterialFromFields } from "../src/texture/material-mechanics.js";
import { assembleLayeredMaterial } from "../src/texture/shading-mechanics.js";
import {
  analyzeTexelDensity,
  bakeHighToLowTextures,
  dilateTexture,
} from "../src/texture/professional-bake.js";
import { compileMaterialGraph } from "../src/texture/material-graph.js";
import {
  analyzeUdimLayout,
  bakeVirtualTexturePage,
  compareVirtualTextureBorders,
  sampleNoRepeat,
} from "../src/texture/virtual-texture.js";
import { describeLayeredMaterial } from "../src/texture/material-interchange.js";
import { exportLayeredInterchange } from "../src/texture/export.js";
import {
  analyzeMaterialConformance,
  compareTextureResults,
  createMaterialQualityBaseline,
} from "../src/texture/material-quality.js";
import { fitTextureReferences, removeReferenceLighting } from "../src/texture/reference-fitting.js";

function horizontalQuad(y: number, tileU = 0) {
  return makeMesh({
    positions: [vec3(0, y, 0), vec3(1, y, 0), vec3(1, y, 1), vec3(0, y, 1)],
    normals: [vec3(0, 1, 0), vec3(0, 1, 0), vec3(0, 1, 0), vec3(0, 1, 0)],
    uvs: [vec2(tileU, 0), vec2(tileU + 1, 0), vec2(tileU + 1, 1), vec2(tileU, 1)],
    indices: [0, 2, 1, 0, 3, 2],
  });
}

describe("final production material pipeline", () => {
  it("transfers cage normals and reports texel density", () => {
    const low = horizontalQuad(0);
    const high = horizontalQuad(0.1);
    const bake = bakeHighToLowTextures(low, high, {
      width: 16,
      cageOffset: 0.2,
      maxRayDistance: 0.25,
      padding: 2,
    });
    expect(bake.hitRate).toBeGreaterThan(0.95);
    expect(Math.max(...bake.miss.data)).toBe(0);
    expect(bake.worldNormal.data[1]).toBeCloseTo(1);
    const density = analyzeTexelDensity(low, 256);
    expect(density.mean).toBeGreaterThan(100);
    expect(density.degenerateTriangles).toBe(0);
  });

  it("dilates uncovered texture borders", () => {
    const texture = makeTexture(5, 1, 1);
    const coverage = makeTexture(5, 1, 1);
    texture.data[2] = 0.75;
    coverage.data[2] = 1;
    const output = dilateTexture(texture, coverage, 2);
    expect([...output.data]).toEqual([0.75, 0.75, 0.75, 0.75, 0.75]);
    expect(texture.data[0]).toBe(0);
  });

  it("deduplicates and incrementally evaluates typed graph nodes", () => {
    const graph = compileMaterialGraph({
      nodes: [
        { id: "source", op: "input", name: "height", valueType: "scalar" },
        { id: "half-a", op: "constant", value: 0.5, valueType: "scalar" },
        { id: "half-b", op: "constant", value: 0.5, valueType: "scalar" },
        { id: "scaled-a", op: "multiply", left: "source", right: "half-a", valueType: "scalar" },
        { id: "scaled-b", op: "multiply", left: "source", right: "half-b", valueType: "scalar" },
      ],
      outputs: { height: "scaled-a", roughness: "scaled-b" },
    });
    expect(graph.commonSubexpressions).toBe(2);
    const source = generate(4, 4, 1, () => 0.8);
    const first = graph.execute({ height: { texture: source, revision: 1 } });
    expect(first.outputs.height!.data[0]).toBeCloseTo(0.4);
    const second = graph.execute({ height: { texture: source, revision: 1 } }, { previous: first.state });
    expect(second.evaluatedNodes).toBe(0);
    expect(second.reusedNodes).toBe(graph.order.length);
    const third = graph.execute({ height: { texture: source, revision: 2 } }, { previous: second.state });
    expect(third.evaluatedNodes).toBeGreaterThan(1);
  });

  it("tracks UDIMs and keeps virtual page borders continuous", () => {
    const layout = analyzeUdimLayout(horizontalQuad(0, 1));
    expect(layout.tiles.map((tile) => tile.udim)).toEqual([1002]);
    expect(layout.invalidTriangles).toEqual([]);
    const field = (u: number, v: number) => [u * 0.1, v * 0.1, (u + v) * 0.05];
    const left = bakeVirtualTexturePage(0, 0, field, { pageSize: 16, border: 2, channels: 3 });
    const right = bakeVirtualTexturePage(1, 0, field, { pageSize: 16, border: 2, channels: 3 });
    expect(compareVirtualTextureBorders(left, right).maximumError).toBeLessThan(1e-7);
    const source = generate(8, 8, 1, (u, v) => u * v);
    expect(sampleNoRepeat(source, 1.25, 2.5, { seed: 7 })).toEqual(sampleNoRepeat(source, 1.25, 2.5, { seed: 7 }));
  });

  it("fits shared parameters across references and removes lighting gradients", () => {
    const references = [
      { name: "front", texture: generate(4, 4, 1, () => 0.25) },
      { name: "side", texture: generate(4, 4, 1, () => 0.75), weight: 2 },
    ];
    const result = fitTextureReferences(
      references,
      [{ name: "amount", min: 0, max: 1, step: 0.05 }],
      (params) => ({
        front: generate(4, 4, 1, () => params.amount!),
        side: generate(4, 4, 1, () => 1 - params.amount!),
      }),
      { seed: 2, candidates: 12, refinementPasses: 3 },
    );
    expect(result.params.amount).toBeCloseTo(0.25, 1);
    expect(result.score).toBeLessThan(0.06);
    const corrected = removeReferenceLighting(generate(8, 8, 1, (u) => 0.2 + u * 0.6), 2);
    expect(corrected.width).toBe(8);
    expect(Math.max(...corrected.data)).toBeLessThanOrEqual(1);
  });

  it("exports advanced PBR descriptors and deterministic quality baselines", () => {
    const extended = extendedMaterialFromFields(4, {
      baseColor: () => [0.4, 0.2, 0.1],
      transmission: () => 0.3,
      anisotropy: () => 0.6,
      physical: { ior: 1.45, thickness: 0.2 },
    });
    const layered = assembleLayeredMaterial(extended, {}, {
      clearcoat: 0.7,
      sheen: 0.2,
      subsurface: 0.1,
    });
    const descriptors = describeLayeredMaterial(layered, { baseName: "paint", udim: true });
    expect(descriptors.gltf.extensionsUsed).toContain("KHR_materials_clearcoat");
    expect(descriptors.materialX).toContain("standard_surface");
    expect(descriptors.textureUris.baseColor).toContain("<UDIM>");
    expect(descriptors.packedTextures.baseColorOpacity.channels).toBe(4);
    expect(descriptors.packedTextures.metallicRoughness.data[1]).toBeCloseTo(layered.roughness.data[0]!);
    expect(textureToPNG(descriptors.packedTextures.baseColorOpacity)[25]).toBe(6);
    const exported = exportLayeredInterchange(layered, { baseName: "paint" });
    expect(Object.keys(exported.files)).toContain("paint_metallicRoughness.png");

    const material = dielectricBase({ size: 4, color: [0.5, 0.4, 0.3] });
    const baseline = createMaterialQualityBaseline(material);
    expect(baseline.channels.normal.fingerprint).toHaveLength(8);
    expect(analyzeMaterialConformance(material).problems).toEqual([]);
    expect(compareTextureResults(material.height, material.height).withinTolerance).toBe(true);
    const changed = generate(4, 4, 1, () => 0.6);
    expect(compareTextureResults(material.height, changed, 0.01).withinTolerance).toBe(false);
  });
});
