import { describe, it, expect } from "vitest";
import {
  parallelTransportFrames,
  curveTangents,
  pickPerpendicular,
  polyline,
  sweep,
  vertexCount,
  triangleCount,
} from "../src/geometry/index.js";
import { length, sub, dot, cross } from "../src/math/vec3.js";

function isUnit(v: { x: number; y: number; z: number }, eps = 1e-6): boolean {
  return Math.abs(Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) - 1) < eps;
}

describe("curveTangents", () => {
  it("gives unit tangents along a straight line", () => {
    const pts = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ];
    const t = curveTangents(pts);
    for (const v of t) {
      expect(isUnit(v)).toBe(true);
      expect(v.x).toBeCloseTo(1);
    }
  });

  it("wraps for closed curves", () => {
    // square in XZ plane
    const pts = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 0, z: 1 },
      { x: 0, y: 0, z: 1 },
    ];
    const t = curveTangents(pts, true);
    expect(t).toHaveLength(4);
    for (const v of t) expect(isUnit(v)).toBe(true);
  });
});

describe("parallelTransportFrames", () => {
  it("produces orthonormal frames (tangent ⟂ normal ⟂ binormal)", () => {
    const pts = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: 2, y: 0, z: 1 },
      { x: 3, y: 2, z: 2 },
    ];
    const frames = parallelTransportFrames(pts);
    expect(frames).toHaveLength(4);
    for (const f of frames) {
      expect(isUnit(f.tangent)).toBe(true);
      expect(isUnit(f.normal)).toBe(true);
      expect(isUnit(f.binormal)).toBe(true);
      expect(Math.abs(dot(f.tangent, f.normal))).toBeLessThan(1e-6);
      expect(Math.abs(dot(f.tangent, f.binormal))).toBeLessThan(1e-6);
      expect(Math.abs(dot(f.normal, f.binormal))).toBeLessThan(1e-6);
    }
  });

  it("does NOT flip when the curve passes vertical (the twist-flip bug)", () => {
    // A path that turns straight up: naive cross(tangent, worldUp) degenerates
    // here. Parallel transport should keep the normal changing smoothly.
    const pts = [
      { x: 0, y: 0, z: 0 },
      { x: 0.3, y: 0.6, z: 0 },
      { x: 0.3, y: 1.4, z: 0 }, // nearly vertical tangent
      { x: 0.3, y: 2.2, z: 0 },
    ];
    const frames = parallelTransportFrames(pts);
    // Consecutive normals must stay close (small angle) — no 180° snap.
    for (let i = 1; i < frames.length; i++) {
      const d = dot(frames[i - 1]!.normal, frames[i]!.normal);
      expect(d).toBeGreaterThan(0.3); // never anti-parallel
    }
  });

  it("honours an initial normal by projecting it onto the tangent plane", () => {
    const pts = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ];
    const frames = parallelTransportFrames(pts, { initialNormal: { x: 0, y: 1, z: 0 } });
    // tangent is +X, requested up is +Y, so normal should be ~+Y
    expect(frames[0]!.normal.y).toBeCloseTo(1);
  });

  it("is deterministic", () => {
    const pts = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0.5, z: 0.2 },
      { x: 2, y: -0.3, z: 1 },
    ];
    const a = parallelTransportFrames(pts);
    const b = parallelTransportFrames(pts);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!.normal.x).toBe(b[i]!.normal.x);
      expect(a[i]!.normal.y).toBe(b[i]!.normal.y);
      expect(a[i]!.normal.z).toBe(b[i]!.normal.z);
    }
  });
});

describe("closed-loop seam", () => {
  it("cancels the holonomy twist so the seam matches (circle)", () => {
    // A planar circle in the XZ plane. After transporting all the way around,
    // the corrected frame should return near its start (small residual).
    const N = 24;
    const pts = Array.from({ length: N }, (_, i) => {
      const a = (i / N) * Math.PI * 2;
      return { x: Math.cos(a), y: 0, z: Math.sin(a) };
    });
    const frames = parallelTransportFrames(pts, { closed: true });
    // Transport frame[last] one step to frame[0]'s tangent and compare normals.
    const first = frames[0]!;
    const last = frames[frames.length - 1]!;
    // For a planar loop, all normals should be nearly the plane normal (±Y),
    // and first vs last should agree closely (seam closed).
    const d = dot(first.normal, last.normal);
    expect(d).toBeGreaterThan(0.9);
  });
});

describe("sweep closed loop", () => {
  it("builds a seamless ring with no end caps", () => {
    const N = 20;
    const pts = Array.from({ length: N }, (_, i) => {
      const a = (i / N) * Math.PI * 2;
      return { x: Math.cos(a), y: 0, z: Math.sin(a) };
    });
    const ring = sweep(polyline(pts, true), { radius: 0.15, sides: 8, caps: true });
    // Closed curve forces caps off; torus is watertight-ish (ring of quads).
    expect(vertexCount(ring)).toBeGreaterThan(0);
    expect(triangleCount(ring)).toBeGreaterThan(N * 8);
    // The generated tube should stay within a torus bounding shell:
    // major radius 1 ± minor 0.15.
    for (const p of ring.positions) {
      const rad = Math.sqrt(p.x * p.x + p.z * p.z);
      expect(rad).toBeGreaterThan(1 - 0.15 - 1e-3);
      expect(rad).toBeLessThan(1 + 0.15 + 1e-3);
      expect(Math.abs(p.y)).toBeLessThan(0.15 + 1e-3);
    }
  });

  it("open curve still gets end caps", () => {
    const pts = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ];
    const openTube = sweep(polyline(pts, false), { radius: 0.2, sides: 8, caps: true });
    const noCaps = sweep(polyline(pts, false), { radius: 0.2, sides: 8, caps: false });
    // caps add extra fan geometry
    expect(vertexCount(openTube)).toBeGreaterThan(vertexCount(noCaps));
  });
});

describe("pickPerpendicular", () => {
  it("returns a unit vector perpendicular to the input", () => {
    for (const t of [
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0.577, y: 0.577, z: 0.577 },
    ]) {
      const p = pickPerpendicular(t);
      expect(isUnit(p)).toBe(true);
      expect(Math.abs(dot(p, t))).toBeLessThan(1e-6);
    }
  });
});
