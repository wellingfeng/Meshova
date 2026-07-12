import { describe, expect, it } from "vitest";
import {
  bounds,
  buildChineseTownscaperScene,
  merge,
  triangleCount,
} from "../src/index.js";

describe("Chinese double-eave Townscaper", () => {
  it("builds island, water and semantic timber architecture", () => {
    const scene = buildChineseTownscaperScene();
    const names = scene.parts.map((part) => part.name);
    expect(names).toContain("chinese_townscaper_water");
    expect(names).toContain("chinese_townscaper_island");
    expect(names).toContain("chinese_townscaper_lower_roof");
    expect(names).toContain("chinese_townscaper_upper_roof");
    expect(names).toContain("chinese_townscaper_lower_dougong");
    expect(scene.summary.moduleCount).toBeGreaterThan(5);
    expect(scene.summary.doubleEaveCount).toBeGreaterThan(0);
    expect(scene.parts.every((part) => part.label && !part.label.includes("chinese_townscaper"))).toBe(true);
  });

  it("is deterministic for equal seeds", () => {
    const params = { gridSize: 5, density: 0.4, seed: 93 };
    const first = buildChineseTownscaperScene(params);
    const second = buildChineseTownscaperScene(params);
    expect(first.summary).toEqual(second.summary);
    expect(first.parts.find((part) => part.name === "chinese_townscaper_lower_roof")?.mesh).toEqual(
      second.parts.find((part) => part.name === "chinese_townscaper_lower_roof")?.mesh,
    );
  });

  it("double-eave rate changes the skyline", () => {
    const low = buildChineseTownscaperScene({ doubleEaveRate: 0, seed: 21 });
    const high = buildChineseTownscaperScene({ doubleEaveRate: 1, seed: 21 });
    expect(high.summary.doubleEaveCount).toBeGreaterThan(low.summary.doubleEaveCount);
    const lowBounds = bounds(merge(...low.parts.map((part) => part.mesh)));
    const highBounds = bounds(merge(...high.parts.map((part) => part.mesh)));
    expect(highBounds.max.y).toBeGreaterThanOrEqual(lowBounds.max.y);
  });

  it("emits finite indexed geometry", () => {
    const scene = buildChineseTownscaperScene({ gridSize: 5, density: 0.3 });
    for (const part of scene.parts) {
      expect(triangleCount(part.mesh), part.name).toBeGreaterThan(0);
      expect(part.mesh.positions.every((position) => Number.isFinite(position.x + position.y + position.z))).toBe(true);
    }
  });
});
