import { describe, expect, it } from "vitest";
import { merge } from "../src/geometry/index.js";
import {
  REFERENCE_BENCHMARK_MODELS,
  buildReferenceBenchmarkParts,
  type ReferenceBenchmarkPropKind,
} from "../src/models/reference-benchmark-props.js";

const expectedParts: Record<ReferenceBenchmarkPropKind, string[]> = {
  "magnifying-glass": ["magnifier_frame", "magnifier_lens", "magnifier_handle", "magnifier_collar"],
  headphones: ["headphones_headband", "headphones_sliders", "headphones_yokes", "headphones_earcups", "headphones_cushions"],
  "electric-kettle": ["kettle_body", "kettle_base", "kettle_lid", "kettle_spout", "kettle_handle", "kettle_window", "kettle_switch"],
  scissors: ["scissors_blades", "scissors_edges", "scissors_handles", "scissors_pivot"],
};

describe("real-image procedural benchmark props", () => {
  it("registers four licensed public reference images without source meshes", () => {
    expect(REFERENCE_BENCHMARK_MODELS).toHaveLength(4);
    expect(new Set(REFERENCE_BENCHMARK_MODELS.map((entry) => entry.kind)).size).toBe(4);
    for (const definition of REFERENCE_BENCHMARK_MODELS) {
      const metadata = buildReferenceBenchmarkParts(definition.defaults)[0]!.metadata;
      expect(metadata).toMatchObject({
        benchmark: "real-image-fitting",
        referencePage: definition.sourcePage,
        referenceLicense: definition.sourceLicense,
        reconstruction: "procedural-from-public-reference-image",
        sourceMeshUsed: false,
        sourceTexturesUsed: false,
      });
    }
  });

  it.each(REFERENCE_BENCHMARK_MODELS)("builds semantic parts for $kind", (definition) => {
    const parts = buildReferenceBenchmarkParts(definition.defaults);
    expect(parts.map((entry) => entry.name)).toEqual(expect.arrayContaining(expectedParts[definition.kind]));
    expect(parts.every((entry) => entry.label && !/component_|root\./.test(entry.label))).toBe(true);
    expect(parts.every((entry) => entry.mesh.positions.length > 0)).toBe(true);
    expect(merge(...parts.map((entry) => entry.mesh)).positions.length).toBeGreaterThan(250);
  });

  it("keeps every benchmark deterministic", () => {
    for (const definition of REFERENCE_BENCHMARK_MODELS) {
      const first = buildReferenceBenchmarkParts({ ...definition.defaults, seed: 97 });
      const second = buildReferenceBenchmarkParts({ ...definition.defaults, seed: 97 });
      expect(first.map((entry) => entry.mesh.positions)).toEqual(second.map((entry) => entry.mesh.positions));
    }
  });

  it.each([
    ["magnifying-glass", "magnifier_handle"],
    ["headphones", "headphones_sliders"],
    ["electric-kettle", "kettle_spout"],
    ["scissors", "scissors_blades"],
  ] as Array<[ReferenceBenchmarkPropKind, string]>)("variation changes %s benchmark geometry", (kind, partName) => {
    const low = buildReferenceBenchmarkParts({ kind, variation: 0 });
    const high = buildReferenceBenchmarkParts({ kind, variation: 1 });
    expect(low.find((entry) => entry.name === partName)?.mesh.positions)
      .not.toEqual(high.find((entry) => entry.name === partName)?.mesh.positions);
  });

  it("uses glass only for optical/transmissive semantic parts", () => {
    for (const kind of ["magnifying-glass", "electric-kettle"] as const) {
      const glassParts = buildReferenceBenchmarkParts({ kind }).filter((entry) => entry.surface?.type === "glass");
      expect(glassParts.length).toBeGreaterThan(0);
      expect(glassParts.every((entry) => /lens|window/.test(entry.name))).toBe(true);
    }
  });
});
