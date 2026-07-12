import { describe, expect, it } from "vitest";
import { buildWaterfallParts, scoreWaterfall } from "../src/models/waterfall.js";

const compactOptions = {
  seed: 23,
  sheetCount: 3,
  pathSegments: 12,
  rockCount: 8,
  particleCount: 18,
  mistCount: 8,
  foamCount: 10,
};

describe("procedural waterfall", () => {
  it("is deterministic for identical options", () => {
    const first = buildWaterfallParts(compactOptions);
    const second = buildWaterfallParts(compactOptions);
    expect(second).toEqual(first);
  });

  it("builds layered water, impact FX, and semantic labels", () => {
    const parts = buildWaterfallParts(compactOptions);
    const score = scoreWaterfall(parts);
    expect(score.sheets).toBe(3);
    expect(score.fxLayers).toBeGreaterThanOrEqual(7);
    expect(score.verts).toBeGreaterThan(500);
    expect(score.tris).toBeGreaterThan(500);
    expect(parts.every((part) => part.label && !/^component_|^root\./.test(part.label))).toBe(true);
    expect(parts.some((part) => part.metadata?.renderFx === "waterfall-spray")).toBe(true);
    expect(parts.some((part) => part.metadata?.renderFx === "waterfall-mist")).toBe(true);
    expect(parts.find((part) => part.name === "waterfall_pool")?.surface).toMatchObject({
      type: "water",
      params: { body: "pond" },
    });
    expect(parts.filter((part) => part.name.startsWith("waterfall_sheet_")).every((part) =>
      part.surface?.type === "water" && part.surface.params?.body === "river"
    )).toBe(true);
  });

  it("changes the generated flow when seed changes", () => {
    const first = buildWaterfallParts(compactOptions);
    const second = buildWaterfallParts({ ...compactOptions, seed: compactOptions.seed + 1 });
    const firstSheet = first.find((part) => part.name === "waterfall_sheet_1")!;
    const secondSheet = second.find((part) => part.name === "waterfall_sheet_1")!;
    expect(secondSheet.mesh.positions).not.toEqual(firstSheet.mesh.positions);
  });
});
