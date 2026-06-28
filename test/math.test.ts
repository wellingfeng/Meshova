import { describe, it, expect } from "vitest";
import {
  vec3,
  add,
  sub,
  cross,
  dot,
  normalize,
  length,
  lerpVec3,
  clamp,
  smoothstep,
  remap,
} from "../src/index.js";

describe("vec3", () => {
  it("adds and subtracts", () => {
    expect(add(vec3(1, 2, 3), vec3(4, 5, 6))).toEqual(vec3(5, 7, 9));
    expect(sub(vec3(4, 5, 6), vec3(1, 2, 3))).toEqual(vec3(3, 3, 3));
  });

  it("cross of basis vectors is right-handed", () => {
    expect(cross(vec3(1, 0, 0), vec3(0, 1, 0))).toEqual(vec3(0, 0, 1));
  });

  it("dot and length agree", () => {
    const v = vec3(3, 4, 0);
    expect(dot(v, v)).toBe(25);
    expect(length(v)).toBe(5);
  });

  it("normalize yields unit length", () => {
    const n = normalize(vec3(0, 3, 4));
    expect(length(n)).toBeCloseTo(1, 12);
  });

  it("normalize of zero is zero (no NaN)", () => {
    expect(normalize(vec3(0, 0, 0))).toEqual(vec3(0, 0, 0));
  });

  it("lerp midpoint", () => {
    expect(lerpVec3(vec3(0, 0, 0), vec3(2, 4, 6), 0.5)).toEqual(vec3(1, 2, 3));
  });
});

describe("scalar", () => {
  it("clamp bounds", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  it("smoothstep endpoints", () => {
    expect(smoothstep(0, 1, 0)).toBe(0);
    expect(smoothstep(0, 1, 1)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 12);
  });

  it("remap linear", () => {
    expect(remap(5, 0, 10, 0, 100)).toBe(50);
  });
});
