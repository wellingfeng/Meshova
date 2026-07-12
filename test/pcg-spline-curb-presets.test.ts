import { describe, expect, it } from "vitest";
import {
  buildPcgSplineCurbPreset,
  PCG_SPLINE_CURB_PRESETS,
} from "../src/models/pcg-spline-curb-presets.js";

describe("PCG spline curb preset library", () => {
  it("contains four unique authored road variants", () => {
    const ids = PCG_SPLINE_CURB_PRESETS.map((preset) => preset.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(PCG_SPLINE_CURB_PRESETS)("builds $name with semantic instancing", (preset) => {
    const result = buildPcgSplineCurbPreset(preset.id);
    expect(result.parts.map((part) => part.name)).toEqual([
      "road_surface",
      "sidewalk_bed",
      "curb_courses",
      "curb_caps",
      "sidewalk_pavers",
    ]);
    expect(result.controlPoints).toHaveLength(preset.path.length);
    expect(result.curbBlockCount).toBeGreaterThan(70);
    expect(result.sidewalkPaverCount).toBeGreaterThan(90);
    expect(result.parts.every((part) => part.metadata?.presetId === preset.id)).toBe(true);
    expect(result.parts.find((part) => part.name === "curb_courses")?.renderInstances)
      .toBeDefined();
  });

  it("keeps each preset deterministic", () => {
    for (const preset of PCG_SPLINE_CURB_PRESETS) {
      const first = buildPcgSplineCurbPreset(preset.id);
      const second = buildPcgSplineCurbPreset(preset.id);
      expect(first.parts[2]?.renderInstances?.transforms)
        .toEqual(second.parts[2]?.renderInstances?.transforms);
    }
  });

  it("scales authored paths through live length and bend controls", () => {
    const compact = buildPcgSplineCurbPreset("pcg-curb-civic-crescent", {
      length: 20,
      bend: 5,
    });
    const wide = buildPcgSplineCurbPreset("pcg-curb-civic-crescent", {
      length: 60,
      bend: 18,
    });
    const compactSpan = compact.controlPoints.at(-1)!.x - compact.controlPoints[0]!.x;
    const wideSpan = wide.controlPoints.at(-1)!.x - wide.controlPoints[0]!.x;
    const compactDepth = Math.max(...compact.controlPoints.map((point) => point.z));
    const wideDepth = Math.max(...wide.controlPoints.map((point) => point.z));

    expect(wideSpan).toBeGreaterThan(compactSpan * 2);
    expect(wideDepth).toBeGreaterThan(compactDepth * 3);
  });
});
