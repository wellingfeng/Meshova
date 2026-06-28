import { describe, it, expect } from "vitest";
import {
  // ramp
  scalarRamp,
  vectorRamp,
  vec3,
  // query
  box,
  rayTriangle,
  rayMesh,
  countRayHits,
  isPointInside,
  // noise
  makeNoise,
  flowNoise2,
  anisoNoise2,
  warpedNoise2,
} from "../src/index.js";

describe("ramp interp modes (chramp parity)", () => {
  const stops = [
    { t: 0, value: 0 },
    { t: 0.5, value: 1 },
    { t: 1, value: 0 },
  ];

  it("linear hits stops exactly and interpolates straight", () => {
    const r = scalarRamp(stops, { interp: "linear" });
    expect(r(0)).toBe(0);
    expect(r(0.5)).toBe(1);
    expect(r(0.25)).toBeCloseTo(0.5);
  });

  it("constant holds the previous stop", () => {
    const r = scalarRamp(stops, { interp: "constant" });
    expect(r(0.25)).toBe(0);
    expect(r(0.75)).toBe(1);
  });

  it("smooth eases (not linear) between stops", () => {
    const r = scalarRamp(stops, { interp: "smooth" });
    // at quarter, smoothstep(0.5)=0.5 so equals linear midpoint here
    expect(r(0.25)).toBeCloseTo(0.5);
    // but at t=0.125 smoothstep < linear
    expect(r(0.125)).toBeLessThan(0.25);
  });

  it("spline passes through control stops", () => {
    const r = scalarRamp(stops, { interp: "spline" });
    expect(r(0)).toBeCloseTo(0);
    expect(r(0.5)).toBeCloseTo(1);
    expect(r(1)).toBeCloseTo(0);
  });

  it("smooth flag maps to smooth interp", () => {
    const r = scalarRamp(stops, { smooth: true });
    expect(r(0.125)).toBeLessThan(0.25);
  });

  it("vector spline interpolates per component", () => {
    const r = vectorRamp(
      [
        { t: 0, value: vec3(0, 0, 0) },
        { t: 1, value: vec3(1, 2, 3) },
      ],
      { interp: "spline" },
    );
    const mid = r(0.5);
    expect(mid.x).toBeCloseTo(0.5);
    expect(mid.y).toBeCloseTo(1);
    expect(mid.z).toBeCloseTo(1.5);
  });
});

describe("ray / intersection VEX parity", () => {
  it("rayTriangle hits a facing triangle", () => {
    const hit = rayTriangle(
      vec3(0.25, 0.25, -1),
      vec3(0, 0, 1),
      vec3(0, 0, 0),
      vec3(1, 0, 0),
      vec3(0, 1, 0),
    );
    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(1);
  });

  it("rayTriangle misses outside the triangle", () => {
    const hit = rayTriangle(
      vec3(5, 5, -1),
      vec3(0, 0, 1),
      vec3(0, 0, 0),
      vec3(1, 0, 0),
      vec3(0, 1, 0),
    );
    expect(hit).toBeNull();
  });

  it("rayMesh returns nearest forward hit on a box", () => {
    const m = box(2, 2, 2); // -1..1
    const hit = rayMesh(m, vec3(0, 0, -5), vec3(0, 0, 1));
    expect(hit).not.toBeNull();
    expect(hit!.position.z).toBeCloseTo(-1); // near face
  });

  it("countRayHits through a box is even from outside", () => {
    const m = box(2, 2, 2);
    expect(countRayHits(m, vec3(0, 0, -5), vec3(0, 0, 1)) % 2).toBe(0);
  });

  it("isPointInside detects interior vs exterior of a box", () => {
    const m = box(2, 2, 2);
    expect(isPointInside(m, vec3(0, 0, 0))).toBe(true);
    expect(isPointInside(m, vec3(5, 0, 0))).toBe(false);
    expect(isPointInside(m, vec3(0.5, -0.5, 0.5))).toBe(true);
  });
});

describe("noise variants VEX parity", () => {
  it("flowNoise2 is deterministic and in range", () => {
    const n = makeNoise(7);
    const a = flowNoise2(n, 1.2, 3.4, 0.3);
    expect(flowNoise2(n, 1.2, 3.4, 0.3)).toBeCloseTo(a);
    expect(Math.abs(a)).toBeLessThanOrEqual(1.0001);
  });

  it("flowNoise2 evolves with the flow parameter", () => {
    const n = makeNoise(7);
    const a = flowNoise2(n, 1.2, 3.4, 0.0);
    const b = flowNoise2(n, 1.2, 3.4, 0.5);
    expect(a).not.toBeCloseTo(b);
  });

  it("anisoNoise2 with aniso=1 matches plain noise rotated by 0", () => {
    const n = makeNoise(3);
    expect(anisoNoise2(n, 2.1, 0.7, 0, 1)).toBeCloseTo(n.noise2(2.1, 0.7));
  });

  it("anisoNoise2 stretches along the axis (slower variation)", () => {
    const n = makeNoise(3);
    const base = anisoNoise2(n, 0, 0, 0, 8);
    const stepped = anisoNoise2(n, 1, 0, 0, 8);
    // along the squashed axis the value should change little
    expect(Math.abs(stepped - base)).toBeLessThan(0.5);
  });

  it("warpedNoise2 deterministic", () => {
    const n = makeNoise(11);
    expect(warpedNoise2(n, 0.5, 0.9, 1)).toBeCloseTo(
      warpedNoise2(n, 0.5, 0.9, 1),
    );
  });
});
