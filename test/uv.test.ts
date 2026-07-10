import { describe, it, expect } from "vitest";
import {
  box,
  cylinder,
  sphere,
  planarUV,
  boxUV,
  cylindricalUV,
  sphericalUV,
  normalizeUV,
  transformUV,
  vertexCount,
  triangleCount,
} from "../src/geometry/index.js";

// UV shear metric: for each triangle, compare the ratio of world-space edge
// length to UV-space edge length across its two edges. On a shear-free
// projection the ratios of the two edges should be comparable (bounded).
function maxUVStretch(m: {
  positions: ReadonlyArray<{ x: number; y: number; z: number }>;
  uvs: ReadonlyArray<{ x: number; y: number }>;
  indices: ReadonlyArray<number>;
}): number {
  let worst = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const ia = m.indices[t]!;
    const ib = m.indices[t + 1]!;
    const ic = m.indices[t + 2]!;
    const pa = m.positions[ia]!;
    const pb = m.positions[ib]!;
    const pc = m.positions[ic]!;
    const ua = m.uvs[ia]!;
    const ub = m.uvs[ib]!;
    const uc = m.uvs[ic]!;
    const w1 = Math.hypot(pb.x - pa.x, pb.y - pa.y, pb.z - pa.z);
    const w2 = Math.hypot(pc.x - pa.x, pc.y - pa.y, pc.z - pa.z);
    const t1 = Math.hypot(ub.x - ua.x, ub.y - ua.y);
    const t2 = Math.hypot(uc.x - ua.x, uc.y - ua.y);
    if (t1 > 1e-6 && t2 > 1e-6) {
      const r1 = w1 / t1;
      const r2 = w2 / t2;
      worst = Math.max(worst, r1 / r2, r2 / r1);
    }
  }
  return worst;
}

describe("planarUV", () => {
  it("keeps vertex count and maps XZ for a Y-plane box top", () => {
    const b = box(2, 2, 2);
    const out = planarUV(b, { axis: "y", scale: 1 });
    expect(vertexCount(out)).toBe(vertexCount(b));
    // A vertex at x=1,z=1 projects to u=1,v=1.
    const hit = out.positions.findIndex((p) => p.x === 1 && p.z === 1);
    expect(hit).toBeGreaterThanOrEqual(0);
    expect(out.uvs[hit]!.x).toBeCloseTo(1);
    expect(out.uvs[hit]!.y).toBeCloseTo(1);
  });

  it("scale enlarges tiles (divides UV)", () => {
    const b = box(2, 2, 2);
    const s1 = planarUV(b, { axis: "y", scale: 1 });
    const s2 = planarUV(b, { axis: "y", scale: 2 });
    const i = s1.positions.findIndex((p) => p.x === 1 && p.z === 1);
    expect(s2.uvs[i]!.x).toBeCloseTo(s1.uvs[i]!.x / 2);
  });
});

describe("boxUV", () => {
  it("unwelds to per-corner vertices", () => {
    const b = box(2, 2, 2);
    const out = boxUV(b);
    expect(vertexCount(out)).toBe(triangleCount(b) * 3);
    expect(triangleCount(out)).toBe(triangleCount(b));
  });

  it("produces shear-free UVs on a box (ratio ~1)", () => {
    const out = boxUV(box(2, 2, 2));
    // Every box face is axis-aligned, so box projection should be near-perfect.
    expect(maxUVStretch(out)).toBeLessThan(1.01);
  });

  it("is deterministic", () => {
    const a = boxUV(box(2, 2, 2));
    const b = boxUV(box(2, 2, 2));
    expect(a.uvs).toEqual(b.uvs);
  });
});

describe("cylindricalUV", () => {
  it("wraps u in [0,~1] and fixes the seam (no full-width triangle)", () => {
    const c = cylinder(1, 2, 16, false); // capless: side wall is where the seam matters
    const out = cylindricalUV(c, { axis: "y" });
    let maxSpan = 0;
    for (let t = 0; t < out.indices.length; t += 3) {
      const u0 = out.uvs[out.indices[t]!]!.x;
      const u1 = out.uvs[out.indices[t + 1]!]!.x;
      const u2 = out.uvs[out.indices[t + 2]!]!.x;
      maxSpan = Math.max(maxSpan, Math.max(u0, u1, u2) - Math.min(u0, u1, u2));
    }
    // Without the seam fix one triangle would span ~1.0; fixed it stays small.
    expect(maxSpan).toBeLessThan(0.5);
  });
});

describe("sphericalUV", () => {
  it("maps latitude to [0,1] v", () => {
    const s = sphere(1, 12);
    const out = sphericalUV(s);
    for (const uv of out.uvs) {
      expect(uv.y).toBeGreaterThanOrEqual(-0.01);
      expect(uv.y).toBeLessThanOrEqual(1.01);
    }
  });
});

describe("normalizeUV", () => {
  it("fits UVs into the unit square preserving aspect", () => {
    const out = normalizeUV(planarUV(box(4, 4, 4), { axis: "y" }));
    let minU = Infinity,
      minV = Infinity,
      maxU = -Infinity,
      maxV = -Infinity;
    for (const uv of out.uvs) {
      minU = Math.min(minU, uv.x);
      minV = Math.min(minV, uv.y);
      maxU = Math.max(maxU, uv.x);
      maxV = Math.max(maxV, uv.y);
    }
    expect(minU).toBeCloseTo(0);
    expect(minV).toBeCloseTo(0);
    expect(Math.max(maxU, maxV)).toBeCloseTo(1);
  });
});

describe("transformUV", () => {
  it("scales and translates UVs", () => {
    const base = planarUV(box(2, 2, 2), { axis: "y" });
    const out = transformUV(base, { scale: 2, offset: { x: 0.5, y: 0.5 } });
    const i = base.positions.findIndex((p) => p.x === 1 && p.z === 1);
    expect(out.uvs[i]!.x).toBeCloseTo(base.uvs[i]!.x * 2 + 0.5);
  });

  it("rotate 90deg swaps axes", () => {
    const base = planarUV(box(2, 2, 2), { axis: "y" });
    const out = transformUV(base, { rotateDeg: 90 });
    // A corner with UV (1,1) rotated 90deg -> (-1,1).
    const i = base.uvs.findIndex(
      (uv) => Math.abs(uv.x - 1) < 1e-6 && Math.abs(uv.y - 1) < 1e-6,
    );
    expect(i).toBeGreaterThanOrEqual(0);
    expect(out.uvs[i]!.x).toBeCloseTo(-1);
    expect(out.uvs[i]!.y).toBeCloseTo(1);
  });
});
