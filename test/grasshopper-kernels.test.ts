import { describe, expect, it } from "vitest";
import {
  circlePackingStats,
  generateField2D,
  marchingSquaresContours,
  packCircles2D,
  polyline,
  ribbon,
  vertexCount,
  vec3,
} from "../src/index.js";

describe("Grasshopper-inspired geometry kernels", () => {
  it("relaxes seeded circle packing inside bounds", () => {
    const circles = packCircles2D({
      count: 32,
      width: 2,
      height: 1.5,
      minRadius: 0.04,
      maxRadius: 0.1,
      padding: 0.004,
      iterations: 90,
      seed: 3,
    });
    expect(circles).toEqual(packCircles2D({
      count: 32,
      width: 2,
      height: 1.5,
      minRadius: 0.04,
      maxRadius: 0.1,
      padding: 0.004,
      iterations: 90,
      seed: 3,
    }));
    for (const c of circles) {
      expect(Math.abs(c.center.x) + c.radius).toBeLessThanOrEqual(1.000001);
      expect(Math.abs(c.center.y) + c.radius).toBeLessThanOrEqual(0.750001);
    }
    expect(circlePackingStats(circles, 0.004).maxOverlap).toBeLessThan(0.02);
  });

  it("extracts marching-squares contour curves from a scalar field", () => {
    const field = generateField2D(16, 16, (u, v) => u + v);
    const curves = marchingSquaresContours(field, { level: 1, width: 2, depth: 2, y: 0.25 });
    expect(curves.length).toBeGreaterThan(0);
    expect(curves.reduce((sum, c) => sum + c.points.length, 0)).toBeGreaterThan(8);
    for (const c of curves) {
      for (const p of c.points) expect(p.y).toBeCloseTo(0.25);
    }
  });

  it("builds ribbon mesh with two vertices per curve sample", () => {
    const curve = polyline([
      vec3(-1, 0, 0),
      vec3(-0.2, 0.35, 0.4),
      vec3(0.6, 0.1, -0.2),
      vec3(1, 0.4, 0.25),
    ]);
    const mesh = ribbon(curve, { width: 0.2, initialNormal: vec3(0, 1, 0) });
    expect(vertexCount(mesh)).toBe(curve.points.length * 2);
    expect(mesh.indices.length).toBe((curve.points.length - 1) * 6);
  });
});
