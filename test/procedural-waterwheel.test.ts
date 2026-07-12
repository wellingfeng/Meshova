import { describe, expect, it } from "vitest";
import {
  bounds,
  buildProceduralWaterwheelParts,
  triangleCount,
} from "../src/index.js";

describe("procedural waterwheel", () => {
  it("builds all semantic assemblies", () => {
    const parts = buildProceduralWaterwheelParts();
    expect(parts.map((part) => part.name)).toEqual([
      "outer_rings",
      "inner_rings",
      "spokes",
      "paddles",
      "axle",
      "support_frame",
      "trough",
      "water",
    ]);
    expect(parts.every((part) => part.label && !part.label.includes("_"))).toBe(true);
    expect(parts.every((part) => triangleCount(part.mesh) > 0)).toBe(true);
  });

  it("changes spoke and paddle geometry with their counts", () => {
    const fewSpokes = buildProceduralWaterwheelParts({ spokeCount: 4 })
      .find((part) => part.name === "spokes")!.mesh.positions.length;
    const manySpokes = buildProceduralWaterwheelParts({ spokeCount: 12 })
      .find((part) => part.name === "spokes")!.mesh.positions.length;
    const fewPaddles = buildProceduralWaterwheelParts({ paddleCount: 8 })
      .find((part) => part.name === "paddles")!.mesh.positions.length;
    const manyPaddles = buildProceduralWaterwheelParts({ paddleCount: 24 })
      .find((part) => part.name === "paddles")!.mesh.positions.length;
    expect(manySpokes).toBeGreaterThan(fewSpokes);
    expect(manyPaddles).toBeGreaterThan(fewPaddles);
  });

  it("keeps trough and frame linked to wheel radius", () => {
    const small = buildProceduralWaterwheelParts({ radius: 1.4 });
    const large = buildProceduralWaterwheelParts({ radius: 3.4 });
    const smallTrough = bounds(small.find((part) => part.name === "trough")!.mesh);
    const largeTrough = bounds(large.find((part) => part.name === "trough")!.mesh);
    expect(largeTrough.max.y).toBeGreaterThan(smallTrough.max.y);
    expect(largeTrough.min.x).toBeLessThan(smallTrough.min.x);
  });

  it("toggles water guide geometry", () => {
    expect(buildProceduralWaterwheelParts({ water: true }).some((part) => part.name === "water")).toBe(true);
    expect(buildProceduralWaterwheelParts({ water: false }).some((part) => part.name === "water")).toBe(false);
  });

  it("is deterministic for identical parameters", () => {
    const params = { radius: 2.1, spokeCount: 7, paddleCount: 14, wheelAngle: 0.42 };
    expect(buildProceduralWaterwheelParts(params)).toEqual(buildProceduralWaterwheelParts(params));
  });
});
