import { describe, it, expect } from "vitest";
import {
  curveGraphPathToCurve,
  curveGraphShortestPath,
  makeCurveGraph,
  sweep,
  triangleCount,
  vec3,
} from "../src/index.js";

describe("curve graph", () => {
  it("routes by edge cost and emits a sweepable curve", () => {
    const graph = makeCurveGraph(
      [
        { id: "a", position: vec3(0, 0, 0) },
        { id: "b", position: vec3(1, 0, 0) },
        { id: "c", position: vec3(2, 0, 0) },
      ],
      [
        { from: "a", to: "c", cost: 10 },
        { from: "a", to: "b", cost: 1 },
        { from: "b", to: "c", cost: 1 },
      ],
    );

    const path = curveGraphShortestPath(graph, "a", "c");
    expect(path).toEqual(["a", "b", "c"]);
    const curve = curveGraphPathToCurve(graph, path);
    expect(curve.points.length).toBe(3);
    expect(triangleCount(sweep(curve, { radius: 0.05, sides: 6 }))).toBeGreaterThan(0);
  });

  it("keeps explicit curved edge points when extracting paths", () => {
    const graph = makeCurveGraph(
      [
        { id: "a", position: vec3(0, 0, 0) },
        { id: "b", position: vec3(2, 0, 0) },
      ],
      [
        {
          from: "a",
          to: "b",
          points: [vec3(0, 0, 0), vec3(1, 1, 0), vec3(2, 0, 0)],
        },
      ],
    );

    const curve = curveGraphPathToCurve(graph, ["a", "b"]);
    expect(curve.points).toEqual([vec3(0, 0, 0), vec3(1, 1, 0), vec3(2, 0, 0)]);

    const reversed = curveGraphPathToCurve(graph, ["b", "a"]);
    expect(reversed.points).toEqual([vec3(2, 0, 0), vec3(1, 1, 0), vec3(0, 0, 0)]);
  });
});
