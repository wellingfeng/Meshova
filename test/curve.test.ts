import { describe, it, expect } from "vitest";
import {
  polyline,
  bezier,
  helix,
  smoothCurve,
  controlCurve,
  resolveBezierControlHandles,
  sampleCurveAttribute,
  sweep,
  bounds,
  triangleCount,
  length,
  vec3,
  type Mesh,
} from "../src/index.js";

function assertValid(m: Mesh) {
  expect(m.normals.length).toBe(m.positions.length);
  expect(m.uvs.length).toBe(m.positions.length);
  expect(m.indices.length % 3).toBe(0);
  for (const idx of m.indices) {
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(m.positions.length);
  }
  for (const n of m.normals) expect(length(n)).toBeCloseTo(1, 3);
}

describe("curve generators", () => {
  it("bezier passes through its endpoints", () => {
    const c = bezier(vec3(0, 0, 0), vec3(1, 1, 0), vec3(2, 1, 0), vec3(3, 0, 0), 16);
    expect(c.points[0]).toEqual(vec3(0, 0, 0));
    expect(c.points[c.points.length - 1]).toEqual(vec3(3, 0, 0));
    expect(c.points.length).toBe(17);
  });
  it("helix spans its height and radius", () => {
    const c = helix({ radius: 0.5, height: 2, turns: 3, segments: 60 });
    const b = bounds({ positions: c.points, normals: c.points, uvs: c.points.map(() => ({ x: 0, y: 0 })), indices: [] } as unknown as Mesh);
    expect(b.max.y - b.min.y).toBeCloseTo(2, 5);
    expect(b.max.x).toBeCloseTo(0.5, 5);
  });
  it("smoothCurve adds points and keeps endpoints (open)", () => {
    const c = polyline([vec3(0, 0, 0), vec3(1, 2, 0), vec3(2, 0, 0), vec3(3, 2, 0)]);
    const s = smoothCurve(c, 8);
    expect(s.points.length).toBeGreaterThan(c.points.length);
    expect(s.points[0]).toEqual(vec3(0, 0, 0));
  });
  it("samples editable Catmull-Rom controls through every anchor", () => {
    const controls = [vec3(0, 0, 0), vec3(1, 2, 0), vec3(2, -1, 0), vec3(3, 0, 0)];
    const curve = controlCurve(controls, { type: "catmull-rom", subdivisions: 6 });
    expect(curve.points).toHaveLength(19);
    expect(curve.points[0]).toEqual(controls[0]);
    expect(curve.points[6]).toEqual(controls[1]);
    expect(curve.points[12]).toEqual(controls[2]);
    expect(curve.points.at(-1)).toEqual(controls[3]);
  });
  it("supports Bezier and clamped cubic B-spline control curves", () => {
    const controls = [vec3(0, 0, 0), vec3(1, 3, 0), vec3(2, 3, 0), vec3(4, 0, 0)];
    const bezierCurve = controlCurve(controls, { type: "bezier", subdivisions: 8 });
    const splineCurve = controlCurve(controls, { type: "b-spline", subdivisions: 8, degree: 3 });
    expect(bezierCurve.points[0]).toEqual(controls[0]);
    expect(bezierCurve.points.at(-1)).toEqual(controls.at(-1));
    expect(Math.max(...bezierCurve.points.map((point) => point.y))).toBeGreaterThan(2);
    expect(splineCurve.points[0]).toEqual(controls[0]);
    expect(splineCurve.points.at(-1)).toEqual(controls.at(-1));
    expect(splineCurve.points.length).toBeGreaterThan(controls.length);
  });
  it("supports authored Bezier handle modes", () => {
    const controls = [vec3(0, 0, 0), vec3(2, 0, 0), vec3(4, 0, 0)];
    const curve = controlCurve(controls, {
      type: "bezier",
      subdivisions: 8,
      handles: [
        { mode: "free", out: vec3(0, 2, 0) },
        { mode: "corner" },
        { mode: "free", in: vec3(0, -2, 0) },
      ],
    });
    expect(Math.max(...curve.points.map((point) => point.y))).toBeGreaterThan(0.5);
    expect(curve.points[8]).toEqual(controls[1]);
    const mirrored = resolveBezierControlHandles(controls, {
      handles: [{ mode: "mirrored", out: vec3(1, 2, 0) }],
    });
    expect(mirrored[0]!.in).toEqual(vec3(-1, -2, 0));
  });
  it("resamples control curves uniformly by arc length", () => {
    const curve = controlCurve([
      vec3(0, 0, 0), vec3(0.2, 2, 0), vec3(5, 2, 0), vec3(6, 0, 0),
    ], { type: "catmull-rom", subdivisions: 16, arcLength: true, sampleCount: 20 });
    const lengths = curve.points.slice(1).map((point, index) => length({
      x: point.x - curve.points[index]!.x,
      y: point.y - curve.points[index]!.y,
      z: point.z - curve.points[index]!.z,
    }));
    expect(Math.max(...lengths) / Math.min(...lengths)).toBeLessThan(1.08);
  });
  it("samples linear, smooth and stepped attribute tracks", () => {
    const keys = [{ t: 0, value: 1 }, { t: 1, value: 3 }];
    expect(sampleCurveAttribute({ keys }, 0.25)).toBeCloseTo(1.5);
    expect(sampleCurveAttribute({ keys, interpolation: "smooth" }, 0.25)).toBeCloseTo(1.3125);
    expect(sampleCurveAttribute({ keys, interpolation: "step" }, 0.75)).toBe(1);
  });
  it("samples a seamless periodic B-spline", () => {
    const curve = controlCurve([
      vec3(-1, 0, -1), vec3(1, 0, -1), vec3(1, 0, 1), vec3(-1, 0, 1),
    ], { type: "b-spline", closed: true, subdivisions: 6 });
    expect(curve.closed).toBe(true);
    expect(curve.points).toHaveLength(24);
    expect(curve.points.every((point) => Number.isFinite(point.x + point.y + point.z))).toBe(true);
  });
});

describe("sweep", () => {
  it("builds a watertight tube along a polyline", () => {
    const c = polyline([vec3(0, 0, 0), vec3(0, 1, 0), vec3(0, 2, 0)]);
    const m = sweep(c, { radius: 0.2, sides: 12, caps: true });
    assertValid(m);
    const b = bounds(m);
    expect(b.max.x).toBeCloseTo(0.2, 2);
    expect(b.max.y).toBeCloseTo(2, 2);
  });
  it("tapers with radiusAt", () => {
    const c = polyline([vec3(0, 0, 0), vec3(0, 2, 0)]);
    const m = sweep(c, { radius: 0.3, sides: 10, radiusAt: (t) => 1 - t * 0.9 });
    // top should be thinner than bottom
    let topMaxR = 0, botMaxR = 0;
    for (const p of m.positions) {
      const r = Math.hypot(p.x, p.z);
      if (p.y > 1.5) topMaxR = Math.max(topMaxR, r);
      if (p.y < 0.5) botMaxR = Math.max(botMaxR, r);
    }
    expect(topMaxR).toBeLessThan(botMaxR);
  });
  it("more sides => more triangles", () => {
    const c = polyline([vec3(0, 0, 0), vec3(1, 0, 0)]);
    expect(triangleCount(sweep(c, { sides: 24 }))).toBeGreaterThan(
      triangleCount(sweep(c, { sides: 8 })),
    );
  });
  it("sweeps a helix without blowing up", () => {
    const m = sweep(helix({ turns: 4, segments: 120 }), { radius: 0.08, sides: 10 });
    assertValid(m);
  });
});
