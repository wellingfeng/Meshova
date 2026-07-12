import { describe, expect, it } from "vitest";
import { attractorWeight, pointFalloff, radialFalloff, vec3 } from "../src/index.js";

describe("geometry falloff", () => {
  it("returns 1 at center and 0 at radius", () => {
    expect(radialFalloff(0, { radius: 10 })).toBeCloseTo(1);
    expect(radialFalloff(10, { radius: 10 })).toBeCloseTo(0);
    expect(radialFalloff(12, { radius: 10 })).toBeCloseTo(0);
  });

  it("keeps full influence inside inner radius", () => {
    expect(radialFalloff(1, { innerRadius: 2, radius: 5 })).toBeCloseTo(1);
    expect(radialFalloff(5, { innerRadius: 2, radius: 5 })).toBeCloseTo(0);
  });

  it("supports point and multi-attractor weights", () => {
    const p = vec3(1, 0, 0);
    expect(pointFalloff(p, vec3(0, 0, 0), { radius: 2, curve: "linear" })).toBeCloseTo(0.5);
    expect(attractorWeight(p, [
      { position: vec3(0, 0, 0), radius: 2 },
      { position: vec3(3, 0, 0), radius: 2 },
    ], { curve: "linear", combine: "max" })).toBeCloseTo(0.5);
  });

  it("can invert falloff", () => {
    expect(radialFalloff(0, { radius: 3, invert: true })).toBeCloseTo(0);
    expect(radialFalloff(3, { radius: 3, invert: true })).toBeCloseTo(1);
  });
});
