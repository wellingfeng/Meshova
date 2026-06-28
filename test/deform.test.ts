import { describe, it, expect } from "vitest";
import {
  box,
  cylinder,
  bendMesh,
  taperMesh,
  twistMesh,
  stretchMesh,
  segmentedTube,
  bounds,
  vec3,
  length,
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
  for (const p of m.positions) {
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
    expect(Number.isFinite(p.z)).toBe(true);
  }
}

describe("deformers", () => {
  it("taperMesh shrinks the far cross-section, preserves length", () => {
    const m = cylinder(0.5, 2, 16, true);
    const out = taperMesh(m, { axis: "y", startScale: 1, endScale: 0.2 });
    assertValid(out);
    const b0 = bounds(m), b1 = bounds(out);
    // height (y) preserved
    expect(b1.max.y - b1.min.y).toBeCloseTo(b0.max.y - b0.min.y, 4);
    // top ring narrower than bottom ring
    const radAt = (mesh: Mesh, hi: boolean) => {
      const ys = mesh.positions.map((p) => p.y);
      const yEdge = hi ? Math.max(...ys) : Math.min(...ys);
      const ring = mesh.positions.filter((p) => Math.abs(p.y - yEdge) < 1e-3);
      return Math.max(...ring.map((p) => Math.hypot(p.x, p.z)));
    };
    expect(radAt(out, true)).toBeLessThan(radAt(out, false) - 0.1);
  });

  it("stretchMesh elongates only along its axis", () => {
    const m = box(1, 1, 1);
    const out = stretchMesh(m, { axis: "y", factor: 2 });
    assertValid(out);
    const b = bounds(out);
    expect(b.max.y - b.min.y).toBeCloseTo(2, 4);
    expect(b.max.x - b.min.x).toBeCloseTo(1, 4);
  });

  it("bendMesh arcs a straight bar so its far end leaves the axis", () => {
    const m = box(0.2, 2, 0.2);
    const straight = bounds(m);
    const out = bendMesh(m, { axis: "y", towards: "z", angle: Math.PI / 2 });
    assertValid(out);
    const bent = bounds(out);
    // the bar curls toward +z, gaining z extent it didn't have before
    expect(bent.max.z - bent.min.z).toBeGreaterThan(straight.max.z - straight.min.z + 0.3);
  });

  it("twistMesh keeps the axis range but rotates sections (no NaN)", () => {
    const m = box(1, 2, 1);
    const out = twistMesh(m, { axis: "y", angle: Math.PI });
    assertValid(out);
    const b = bounds(out);
    expect(b.max.y - b.min.y).toBeCloseTo(2, 4);
  });

  it("deformers are deterministic", () => {
    const a = bendMesh(box(0.2, 2, 0.2), { angle: 1 });
    const b = bendMesh(box(0.2, 2, 0.2), { angle: 1 });
    expect(a.positions).toEqual(b.positions);
  });
});

describe("segmentedTube", () => {
  it("skins one continuous watertight-ish tube along a spine", () => {
    const spine = [vec3(0, 0, 0), vec3(0, 1, 0), vec3(0, 2, 0), vec3(0, 3, 0)];
    const out = segmentedTube(spine, { sides: 12, radius: 0.3, caps: true });
    assertValid(out);
    // single mesh, not a pile of spheres: vertex count ~ rings*(sides+1) + 2 apex
    expect(out.positions.length).toBe(4 * 13 + 2);
  });

  it("radiusAt tapers the tube", () => {
    const spine = [vec3(0, 0, 0), vec3(0, 1, 0), vec3(0, 2, 0)];
    const out = segmentedTube(spine, { sides: 8, radius: 0.4, radiusAt: (t) => 1 - t * 0.9, caps: false });
    assertValid(out);
    // bottom ring wider than top ring
    const ring0 = out.positions.slice(0, 9);
    const ringTop = out.positions.slice(18, 27);
    const rad = (ring: typeof ring0) => Math.max(...ring.map((p) => Math.hypot(p.x, p.z)));
    expect(rad(ring0)).toBeGreaterThan(rad(ringTop) + 0.1);
  });

  it("segments>0 adds periodic radius modulation (bulges)", () => {
    const spine = Array.from({ length: 20 }, (_, i) => vec3(0, i * 0.2, 0));
    const out = segmentedTube(spine, { sides: 10, radius: 0.3, segments: 4, segmentBulge: 0.15 });
    assertValid(out);
    const radii = [];
    for (let i = 0; i < 20; i++) {
      const ring = out.positions.slice(i * 11, i * 11 + 11);
      radii.push(Math.max(...ring.map((p) => Math.hypot(p.x, p.z))));
    }
    // not all rings equal -> modulation present
    const min = Math.min(...radii), max = Math.max(...radii);
    expect(max - min).toBeGreaterThan(0.02);
  });
});
