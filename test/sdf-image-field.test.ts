import { describe, expect, it } from "vitest";
import {
  bounds,
  field2DExtrudeSDF,
  generateField2D,
  polygonizeField,
  rasterToField2D,
  sampleField2DUV,
  sdfBox,
  sdfSmoothUnion,
  sdfSphere,
  sdfSubtract,
  sdfToScalarGrid,
  triangleCount,
  vec3,
} from "../src/index.js";

describe("SDF3D", () => {
  it("composes signed primitives and boolean operations", () => {
    const sphere = sdfSphere(1);
    const box = sdfBox(vec3(1.2, 1.2, 1.2));
    expect(sphere(vec3())).toBeCloseTo(-1);
    expect(sphere(vec3(2, 0, 0))).toBeCloseTo(1);
    expect(sdfSubtract(sphere, box)(vec3())).toBeGreaterThan(0);
    expect(sdfSmoothUnion(sphere, sdfSphere(0.7, vec3(1, 0, 0)), 0.2)(vec3(0.7, 0, 0))).toBeLessThan(0);
  });

  it("samples deterministic grids for marching cubes", () => {
    const field = sdfSmoothUnion(sdfSphere(0.55, vec3(-0.3, 0, 0)), sdfSphere(0.55, vec3(0.3, 0, 0)), 0.2);
    const options = { min: vec3(-1, -1, -1), max: vec3(1, 1, 1), resolution: 24 };
    const a = polygonizeField(sdfToScalarGrid(field, options));
    const b = polygonizeField(sdfToScalarGrid(field, options));
    expect(triangleCount(a)).toBeGreaterThan(300);
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });
});

describe("ImageField", () => {
  it("converts RGBA channels with UV orientation and alpha", () => {
    const raster = {
      width: 2,
      height: 2,
      data: new Uint8Array([
        255, 0, 0, 255, 0, 255, 0, 128,
        0, 0, 255, 255, 255, 255, 255, 0,
      ]),
    };
    const red = rasterToField2D(raster, { channel: "red" });
    const alpha = rasterToField2D(raster, { channel: "alpha" });
    expect(sampleField2DUV(red, 0, 1)).toBeCloseTo(1);
    expect(sampleField2DUV(red, 1, 1)).toBeCloseTo(0);
    expect(sampleField2DUV(alpha, 1, 0)).toBeCloseTo(0);
  });

  it("extrudes a 2D mask into a closed marching-cubes volume", () => {
    const mask = generateField2D(32, 32, (u, v) => {
      const dx = u - 0.5;
      const dy = v - 0.5;
      return dx * dx + dy * dy < 0.12 ? 1 : 0;
    });
    const sdf = field2DExtrudeSDF(mask, { width: 2, depth: 2, height: 0.4 });
    const mesh = polygonizeField(sdfToScalarGrid(sdf, {
      min: vec3(-1.2, -0.4, -1.2),
      max: vec3(1.2, 0.4, 1.2),
      resolution: 28,
    }));
    expect(triangleCount(mesh)).toBeGreaterThan(100);
    const meshBounds = bounds(mesh);
    expect(meshBounds.max.y).toBeCloseTo(0.2, 1);
    expect(meshBounds.min.y).toBeCloseTo(-0.2, 1);
  });
});
