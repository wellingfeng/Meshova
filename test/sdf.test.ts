import { describe, expect, it } from "vitest";
import {
  rasterizeSdf,
  sample,
  sdf2Intersection,
  sdf2SmoothUnion,
  sdf2Subtract,
  sdf2Union,
  sdfCircle,
  sdfDilate,
  sdfErode,
  sdfOutline,
  sdfRoundedBox,
  sdfTransform,
} from "../src/index.js";

describe("texture 2D SDF", () => {
  it("combines, subtracts and transforms shapes", () => {
    const circle = sdfCircle(0.55);
    const box = sdfRoundedBox(0.42, 0.32, 0.08);
    expect(sdf2Union(circle, box)(0, 0)).toBeLessThan(0);
    expect(sdf2Intersection(circle, box)(0.5, 0)).toBeGreaterThan(0);
    expect(sdf2Subtract(circle, box)(0, 0)).toBeGreaterThan(0);
    expect(sdf2SmoothUnion(circle, sdfTransform(circle, { translate: [0.7, 0] }), 0.15)(0.35, 0)).toBeLessThan(0);
  });

  it("supports dilation, erosion and outlines", () => {
    const circle = sdfCircle(0.4);
    expect(sdfDilate(circle, 0.1)(0.45, 0)).toBeLessThan(0);
    expect(sdfErode(circle, 0.1)(0.35, 0)).toBeGreaterThan(0);
    expect(sdfOutline(circle, 0.1)(0.4, 0)).toBeLessThan(0);
  });

  it("rasterizes an antialiased mask deterministically", () => {
    const first = rasterizeSdf(32, 32, sdfCircle(0.5));
    const second = rasterizeSdf(32, 32, sdfCircle(0.5));
    expect([...first.data]).toEqual([...second.data]);
    expect(sample(first, 16, 16)).toBeGreaterThan(0.9);
    expect(sample(first, 0, 0)).toBeLessThan(0.1);
  });
});
