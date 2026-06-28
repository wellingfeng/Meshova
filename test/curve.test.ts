import { describe, it, expect } from "vitest";
import {
  polyline,
  bezier,
  helix,
  smoothCurve,
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
