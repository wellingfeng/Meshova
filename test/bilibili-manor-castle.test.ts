import { describe, expect, it } from "vitest";
import {
  bounds,
  buildBilibiliManorCastleParts,
  triangleCount,
} from "../src/index.js";

describe("Bilibili manor castle", () => {
  it("builds the reference castle as semantic procedural parts", () => {
    const parts = buildBilibiliManorCastleParts({ detail: 0.65, gardenDensity: 0.5 });
    const names = new Set(parts.map((part) => part.name));

    for (const name of [
      "moat",
      "curtain_walls",
      "corner_towers",
      "watchtower",
      "manor_stone_base",
      "half_timber_frame",
      "chapel",
      "courtyard_pond",
      "garden_beds",
      "drawbridge",
    ]) {
      expect(names).toContain(name);
    }
    expect(parts.every((part) => part.label && !part.label.includes("_"))).toBe(true);
    expect(parts.every((part) => triangleCount(part.mesh) > 0)).toBe(true);
    expect(parts.every((part) => part.metadata?.sourceStudy === "https://www.bilibili.com/video/BV1XhZvBwEAF?p=1")).toBe(true);
  });

  it("is deterministic for a fixed seed", () => {
    const first = buildBilibiliManorCastleParts({ seed: 27, detail: 0.7 });
    const second = buildBilibiliManorCastleParts({ seed: 27, detail: 0.7 });
    expect(first.map((part) => part.name)).toEqual(second.map((part) => part.name));
    expect(first.find((part) => part.name === "garden_crops")?.mesh.positions).toEqual(
      second.find((part) => part.name === "garden_crops")?.mesh.positions,
    );
  });

  it("scales uniformly and raises geometry density", () => {
    const compact = buildBilibiliManorCastleParts({ scale: 0.5, detail: 0.55, gardenDensity: 0.3 });
    const large = buildBilibiliManorCastleParts({ scale: 1.5, detail: 1.45, gardenDensity: 1.4 });
    const compactBounds = bounds(compact.find((part) => part.name === "meadow")!.mesh);
    const largeBounds = bounds(large.find((part) => part.name === "meadow")!.mesh);
    const compactWidth = compactBounds.max.x - compactBounds.min.x;
    const largeWidth = largeBounds.max.x - largeBounds.min.x;

    expect(largeWidth).toBeCloseTo(compactWidth * 3, 5);
    expect(large.find((part) => part.name === "battlements")!.mesh.positions.length).toBeGreaterThan(
      compact.find((part) => part.name === "battlements")!.mesh.positions.length,
    );
    expect(large.find((part) => part.name === "garden_crops")!.mesh.positions.length).toBeGreaterThan(
      compact.find((part) => part.name === "garden_crops")!.mesh.positions.length,
    );
  });
});
