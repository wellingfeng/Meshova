import { describe, expect, it } from "vitest";
import {
  architecturalTrimRegions,
  buildTrimSheetPipeline,
  trimSheetPipelineBand,
  trimSheetPipelineResult,
  validateMaterial,
} from "../src/index.js";

describe("trim sheet material pipeline", () => {
  it("builds deterministic semantic bands and PBR channels", () => {
    const params = { seed: 17, wear: 0.64, dirt: 0.42, weathering: 0.2 };
    const first = trimSheetPipelineResult(64, params);
    const second = trimSheetPipelineResult(64, params);

    expect(first.bands.map((band) => band.label)).toEqual([
      "涂装框架",
      "倒角边框",
      "压纹金属条",
      "螺栓固定条",
      "凹陷接缝",
    ]);
    expect(Array.from(first.material.baseColor.data)).toEqual(Array.from(second.material.baseColor.data));
    expect(Array.from(first.masks.edgeWear.data)).toEqual(Array.from(second.masks.edgeWear.data));
    expect(validateMaterial(first.material)).toEqual([]);
  });

  it("resolves non-overlapping UV bands with gutters", () => {
    const result = trimSheetPipelineResult(48);
    for (let index = 1; index < result.bands.length; index++) {
      expect(result.bands[index]!.v0).toBeGreaterThan(result.bands[index - 1]!.v1);
    }
    expect(trimSheetPipelineBand(result, "fastener-rail")).not.toBeNull();
    expect(trimSheetPipelineBand(result, "missing")).toBeNull();
  });

  it("emits separate fastener, seam, wear and dirt masks", () => {
    const result = trimSheetPipelineResult(96, { wear: 1, dirt: 1, weathering: 0 });
    expect(maximum(result.masks.fastener.data)).toBeGreaterThan(0.8);
    expect(maximum(result.masks.seam.data)).toBeGreaterThan(0.8);
    expect(maximum(result.masks.edgeWear.data)).toBeGreaterThan(0.25);
    expect(maximum(result.masks.cavityDirt.data)).toBeGreaterThan(0.25);
    for (const band of result.bands) {
      expect(maximum(result.regionMasks[band.name]!.data)).toBe(1);
    }
  });

  it("responds to smart wear without changing band layout", () => {
    const clean = trimSheetPipelineResult(64, { seed: 5, wear: 0, dirt: 0, weathering: 0 });
    const aged = trimSheetPipelineResult(64, { seed: 5, wear: 1, dirt: 1, weathering: 0 });
    expect(aged.bands).toEqual(clean.bands);
    expect(Array.from(aged.material.baseColor.data)).not.toEqual(Array.from(clean.material.baseColor.data));
  });

  it("rejects empty, duplicate and non-positive regions", () => {
    expect(() => buildTrimSheetPipeline(32, [])).toThrow(/at least one region/);
    const region = architecturalTrimRegions()[0]!;
    expect(() => buildTrimSheetPipeline(32, [region, region])).toThrow(/duplicate/);
    expect(() => buildTrimSheetPipeline(32, [{ ...region, weight: 0 }])).toThrow(/positive/);
  });
});

function maximum(values: Float32Array): number {
  let result = -Infinity;
  for (const value of values) result = Math.max(result, value);
  return result;
}
