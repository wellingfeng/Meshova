import { describe, expect, it } from "vitest";
import {
  buildPcgSnowSceneParts,
  sphere,
  snowCover,
  triangleCount,
  vertexCount,
} from "../src/index.js";

describe("PCG snow cover", () => {
  it("builds a separate closed snow shell on upward faces", () => {
    const source = sphere(1, 24, 16);
    const snow = snowCover(source, {
      normalThreshold: 0.35,
      breakup: 0,
      thickness: 0.08,
      seed: 7,
    });

    expect(vertexCount(snow)).toBeGreaterThan(0);
    expect(triangleCount(snow)).toBeGreaterThan(0);
    expect(triangleCount(snow)).toBeLessThan(triangleCount(source) * 2);
    expect(source.positions[0]).not.toBe(snow.positions[0]);
  });

  it("is deterministic for a fixed seed", () => {
    const source = sphere(1, 20, 12);
    const options = { normalThreshold: 0.4, breakup: 0.25, roughness: 0.04, seed: 23 };
    expect(snowCover(source, options)).toEqual(snowCover(source, options));
  });

  it("builds the reference snow diorama with semantic parts", () => {
    const first = buildPcgSnowSceneParts({ seed: 23 });
    const second = buildPcgSnowSceneParts({ seed: 23 });
    const labels = new Set(first.map((part) => part.label));

    expect(labels).toEqual(new Set(["裸露冻土", "雪地覆盖", "景观岩石", "岩石积雪", "枯树枝干", "树枝积雪"]));
    expect(first).toEqual(second);
    expect(first.every((part) => triangleCount(part.mesh) > 0)).toBe(true);
  });
});
