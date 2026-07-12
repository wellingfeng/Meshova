import { describe, expect, it } from "vitest";
import {
  buildMeshGraph,
  diffuseMeshField,
  grayScottFieldMesh,
  icosphere,
  normalizeMeshField,
} from "../src/index.js";

describe("triangle-mesh scalar diffusion", () => {
  it("builds deterministic symmetric edge adjacency", () => {
    const mesh = icosphere(1, 1);
    const graph = buildMeshGraph(mesh);
    expect(graph.neighbors.length).toBe(mesh.positions.length);
    for (let i = 0; i < graph.neighbors.length; i++) {
      expect(graph.neighbors[i]!.length).toBeGreaterThanOrEqual(5);
      for (const neighbor of graph.neighbors[i]!) {
        expect(graph.neighbors[neighbor.index]!.some((other) => other.index === i)).toBe(true);
      }
    }
  });

  it("smooths an impulse without mutating the input field", () => {
    const mesh = icosphere(1, 1);
    const input = { values: mesh.positions.map((_, i) => i === 0 ? 1 : 0) };
    const output = diffuseMeshField(mesh, input, { iterations: 4, rate: 0.45, min: 0, max: 1 });
    expect(input.values[0]).toBe(1);
    expect(output.values[0]).toBeLessThan(1);
    expect(output.values.some((value, i) => i !== 0 && value > 0)).toBe(true);
    expect(output.values.every((value) => value >= 0 && value <= 1)).toBe(true);
  });

  it("runs deterministic Gray-Scott patterns over curved topology", () => {
    const mesh = icosphere(1, 2);
    const options = { iterations: 24, spots: 5, spotHops: 1, seed: 17 };
    const a = normalizeMeshField(grayScottFieldMesh(mesh, options));
    const b = normalizeMeshField(grayScottFieldMesh(mesh, options));
    const c = normalizeMeshField(grayScottFieldMesh(mesh, { ...options, seed: 18 }));
    expect(a.values).toEqual(b.values);
    expect(a.values).not.toEqual(c.values);
    expect(Math.min(...a.values)).toBeCloseTo(0);
    expect(Math.max(...a.values)).toBeCloseTo(1);
  });
});
