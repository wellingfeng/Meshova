import { describe, expect, it } from "vitest";
import {
  bounds,
  buildXianxiaMountainsParts,
  triangleCount,
} from "../src/index.js";

describe("xianxia mountains", () => {
  it("builds semantic peaks, fissures, ledges, pines, and cloud banks", () => {
    const parts = buildXianxiaMountainsParts({ cloudCount: 3 });
    expect(parts.slice(0, 7).map((part) => part.name)).toEqual([
      "karst_peaks",
      "distant_peaks",
      "vertical_fissures",
      "cliff_ledges",
      "moss_caps",
      "cliff_pine_trunks",
      "cliff_pine_foliage",
    ]);
    expect(parts.filter((part) => part.name.startsWith("cloud_bank_"))).toHaveLength(3);
    expect(parts.every((part) => part.label && triangleCount(part.mesh) > 0)).toBe(true);
  });

  it("is deterministic for one seed", () => {
    const first = buildXianxiaMountainsParts({ seed: 93, peakCount: 7, cloudCount: 2 });
    const second = buildXianxiaMountainsParts({ seed: 93, peakCount: 7, cloudCount: 2 });
    expect(first.map((part) => part.mesh.positions)).toEqual(second.map((part) => part.mesh.positions));
  });

  it("forms tall narrow pillars with cloud sea below the summits", () => {
    const parts = buildXianxiaMountainsParts({ height: 20, spread: 34, cloudCount: 2 });
    const peaks = bounds(parts.find((part) => part.name === "karst_peaks")!.mesh);
    const cloud = bounds(parts.find((part) => part.name === "cloud_bank_1")!.mesh);
    expect(peaks.max.y - peaks.min.y).toBeGreaterThan(18);
    expect(peaks.max.x - peaks.min.x).toBeGreaterThan(20);
    expect(cloud.max.y).toBeLessThan(peaks.max.y * 0.65);
  });

  it("changes peak topology through peak count", () => {
    const sparse = buildXianxiaMountainsParts({ peakCount: 4, cloudCount: 0 });
    const dense = buildXianxiaMountainsParts({ peakCount: 10, cloudCount: 0 });
    expect(triangleCount(dense[0]!.mesh)).toBeGreaterThan(triangleCount(sparse[0]!.mesh));
  });
});
