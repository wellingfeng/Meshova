import { describe, it, expect } from "vitest";
import {
  metaballs,
  fuseSpheres,
  toTopo,
  diagnose,
  connectivity,
  bounds,
  vec3,
  triangleCount,
  type Mesh,
} from "../src/index.js";

function assertFinite(m: Mesh) {
  for (const p of m.positions) {
    expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
  }
  expect(m.indices.length % 3).toBe(0);
  for (const idx of m.indices) {
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(m.positions.length);
  }
}

describe("metaballs", () => {
  it("a single ball produces a closed blob", () => {
    const m = metaballs([{ center: vec3(0, 0, 0), radius: 1 }], { resolution: 24, iso: 0.3 });
    assertFinite(m);
    expect(triangleCount(m)).toBeGreaterThan(50);
    // roughly spherical bounds, centered
    const b = bounds(m);
    expect(Math.abs((b.max.x + b.min.x) / 2)).toBeLessThan(0.1);
  });

  it("two overlapping balls fuse into ONE connected island (no seam)", () => {
    const m = fuseSpheres([
      { center: vec3(-0.5, 0, 0), radius: 0.7 },
      { center: vec3(0.5, 0, 0), radius: 0.7 },
    ], { resolution: 28 });
    assertFinite(m);
    const conn = connectivity(toTopo(m));
    expect(conn.count).toBe(1); // single fused surface, not two
  });

  it("fused surface is watertight (closed, no border edges)", () => {
    const m = fuseSpheres([
      { center: vec3(0, 0, 0), radius: 0.8 },
      { center: vec3(0, 0.7, 0), radius: 0.6 },
    ], { resolution: 32 });
    const d = diagnose(toTopo(m));
    expect(d.borderEdges).toBe(0);
  });

  it("higher iso shrinks the surface", () => {
    const lo = metaballs([{ center: vec3(0, 0, 0), radius: 1 }], { resolution: 24, iso: 0.2 });
    const hi = metaballs([{ center: vec3(0, 0, 0), radius: 1 }], { resolution: 24, iso: 0.7 });
    const sizeLo = bounds(lo).max.x - bounds(lo).min.x;
    const sizeHi = bounds(hi).max.x - bounds(hi).min.x;
    expect(sizeHi).toBeLessThan(sizeLo);
  });

  it("is deterministic", () => {
    const a = fuseSpheres([{ center: vec3(0, 0, 0), radius: 1 }, { center: vec3(0.6, 0, 0), radius: 0.8 }], { resolution: 20 });
    const b = fuseSpheres([{ center: vec3(0, 0, 0), radius: 1 }, { center: vec3(0.6, 0, 0), radius: 0.8 }], { resolution: 20 });
    expect(a.positions.length).toBe(b.positions.length);
    expect(a.positions).toEqual(b.positions);
  });

  it("empty input returns empty mesh", () => {
    const m = metaballs([]);
    expect(m.positions.length).toBe(0);
  });
});
