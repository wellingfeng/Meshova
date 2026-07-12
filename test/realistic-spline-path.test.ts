import { describe, expect, it } from "vitest";
import {
  buildRealisticSplinePath,
  buildRealisticSplinePathParts,
  triangleCount,
  vec3,
} from "../src/index.js";

describe("realistic spline path", () => {
  it("builds semantic path dressing layers", () => {
    const result = buildRealisticSplinePath({ seed: 12 });
    const names = new Set(result.parts.map((part) => part.name));
    expect(names.has("path_pads")).toBe(true);
    expect(names.has("walk_surface")).toBe(true);
    expect(names.has("edge_rocks")).toBe(true);
    expect(result.padCount).toBeGreaterThan(8);
    expect(result.edgeRockCount).toBeGreaterThan(4);
    for (const part of result.parts) expect(triangleCount(part.mesh)).toBeGreaterThan(0);
    const walkSurface = result.parts.find((part) => part.name === "walk_surface")!;
    expect(walkSurface.mesh.normals.every((normal) => normal.y > 0.9)).toBe(true);
  });

  it("is deterministic for one seed", () => {
    const params = { length: 18, padSpacing: 2.8, seed: 27 };
    const first = buildRealisticSplinePathParts(params);
    const second = buildRealisticSplinePathParts(params);
    expect(second.map((part) => part.name)).toEqual(first.map((part) => part.name));
    expect(second[0]!.mesh.positions).toEqual(first[0]!.mesh.positions);
    expect(second[1]!.mesh.positions).toEqual(first[1]!.mesh.positions);
  });

  it("accepts authored spline control points", () => {
    const controlPoints = [
      vec3(-6, 0, -2),
      vec3(-2, 1, 1),
      vec3(2, 0.5, -1),
      vec3(6, 0, 2),
    ];
    const result = buildRealisticSplinePath({
      controlPoints,
      padSpacing: 2,
      edgeDensity: 0,
      spireDensity: 0,
      vegetationDensity: 0,
      seed: 3,
    });
    expect(result.controlPoints).toEqual(controlPoints);
    expect(result.curve.points[0]).toEqual(controlPoints[0]);
    expect(result.curve.points.at(-1)).toEqual(controlPoints.at(-1));
    expect(result.parts.map((part) => part.name)).toEqual(["path_pads", "walk_surface"]);
  });
});
