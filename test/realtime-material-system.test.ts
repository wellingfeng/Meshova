import { describe, expect, it } from "vitest";
import { box } from "../src/geometry/primitives.js";
import { makeTexture } from "../src/texture/buffer.js";
import { EIGHTH_BATCH_MATERIALS } from "../src/texture/eighth-batch-materials.js";
import type { MaterialGraph } from "../src/texture/material-graph.js";
import { serializeMaterialX } from "../src/texture/manufacturing-mechanics.js";
import {
  OPENPBR_REALTIME_WGSL,
  REALTIME_MATERIAL_CHANNELS,
  bakeMeshMaterialInputs,
  compileMaterialGraphToWgsl,
  compileMaterialXToWgsl,
  evaluateMeasuredOpenPbr,
  fitMeasuredBrdf,
  scaleAwareSampling,
} from "../src/texture/realtime-material-system.js";

describe("realtime material system", () => {
  it("bakes ray AO, bent normals and padded UV maps", () => {
    const source = box({ size: 1 });
    const mesh = {
      ...source,
      uvs: source.uvs.map((uv) => ({ x: 0.25 + uv.x * 0.5, y: 0.25 + uv.y * 0.5 })),
    };
    const bake = bakeMeshMaterialInputs(mesh, {
      width: 20,
      height: 20,
      bentNormalSamples: 4,
      padding: 2,
    });
    expect(bake.bentNormal.channels).toBe(3);
    expect(bake.report.rayCount).toBe(mesh.positions.length * 4);
    expect(bake.report.coveredPixels).toBeGreaterThan(0);
    expect(bake.report.paddedPixels).toBeGreaterThan(0);
    expect(bake.report.meanAo).toBeGreaterThanOrEqual(0);
    expect(bake.report.meanAo).toBeLessThanOrEqual(1);
  });

  it("constant-folds and caches WGSL graph compilation with CPU parity", () => {
    const graph: MaterialGraph = {
      nodes: [
        { id: "input", op: "input", name: "roughness", valueType: "scalar" },
        { id: "input-again", op: "input", name: "roughness", valueType: "scalar" },
        { id: "a", op: "constant", value: 0.25, valueType: "scalar" },
        { id: "b", op: "constant", value: 0.5, valueType: "scalar" },
        { id: "sum", op: "add", left: "a", right: "b", valueType: "scalar" },
        { id: "result", op: "multiply", left: "input", right: "sum", valueType: "scalar" },
      ],
      outputs: { roughness: "result", raw: "input-again" },
    };
    const first = compileMaterialGraphToWgsl(graph);
    const second = compileMaterialGraphToWgsl(graph);
    expect(second).toBe(first);
    expect(first.foldedConstants).toBe(1);
    expect(first.inputNames).toEqual(["roughness"]);
    expect(first.wgsl).toContain("evaluateMaterialGraph");
    const input = makeTexture(2, 2, 1);
    input.data.fill(0.8);
    const execution = first.evaluateCpu({ roughness: { texture: input } });
    expect(execution.outputs.roughness!.data[0]).toBeCloseTo(0.6, 6);
  });

  it("compiles emitted MaterialX texture bindings to WGSL", () => {
    const material = EIGHTH_BATCH_MATERIALS.layeredHumanSkin(8, {});
    const document = serializeMaterialX(material, "skin");
    const compiled = compileMaterialXToWgsl(document);
    expect(compiled.outputNames).toContain("base_color");
    expect(compiled.inputNames).toContain("skin_baseColor.png");
    expect(compiled.wgsl).toContain("GraphOutputs");
  });

  it("consumes every realtime material channel in WGSL", () => {
    expect(REALTIME_MATERIAL_CHANNELS).toHaveLength(19);
    for (let layer = 0; layer < REALTIME_MATERIAL_CHANNELS.length; layer++) {
      expect(OPENPBR_REALTIME_WGSL).toContain(`materialLayer(${layer}, uv)`);
    }
    expect(OPENPBR_REALTIME_WGSL).toContain("subsurface");
    expect(OPENPBR_REALTIME_WGSL).toContain("iridescence");
  });

  it("keeps world texel density stable", () => {
    const sampling = scaleAwareSampling(2, 1024, 512);
    expect(sampling.repeats).toBe(1);
    expect(sampling.texelWorldSize).toBeCloseTo(1 / 512, 9);
    expect(sampling.lodBias).toBe(0);
  });

  it("fits synthetic measured BRDF observations", () => {
    const target = { roughness: 0.34, metallic: 0.7, ior: 1.62, clearcoat: 0.42, sheen: 0.18 };
    const directions = [
      { normalViewCosine: 0.25, normalLightCosine: 0.4, normalHalfCosine: 0.55 },
      { normalViewCosine: 0.5, normalLightCosine: 0.62, normalHalfCosine: 0.75 },
      { normalViewCosine: 0.8, normalLightCosine: 0.86, normalHalfCosine: 0.92 },
      { normalViewCosine: 0.95, normalLightCosine: 0.35, normalHalfCosine: 0.68 },
    ];
    const observations = directions.map((direction) => ({ ...direction, rgb: evaluateMeasuredOpenPbr(direction, target) }));
    const fit = fitMeasuredBrdf(observations, { candidates: 700, refinementPasses: 6 });
    expect(fit.error).toBeLessThan(0.012);
    expect(fit.evaluations).toBeGreaterThan(700);
  });
});
