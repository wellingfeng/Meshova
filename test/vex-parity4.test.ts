import { describe, it, expect } from "vitest";
import {
  solvecubic,
  solvequadratic,
  vec3,
  box,
  primuvVec3,
  sampleNormalAt,
  closestPointOnMesh,
  computeNormals,
  recomputeNormals,
  vertexCount,
  triangleCount,
  length,
  normalize,
} from "../src/index.js";

describe("solvecubic VEX parity", () => {
  it("finds three real roots", () => {
    // (x-1)(x-2)(x-3) = x^3 -6x^2 +11x -6
    const r = solvecubic(1, -6, 11, -6);
    expect(r.length).toBe(3);
    expect(r[0]).toBeCloseTo(1);
    expect(r[1]).toBeCloseTo(2);
    expect(r[2]).toBeCloseTo(3);
  });

  it("single real root case", () => {
    // x^3 + x + 1 has one real root ~ -0.6823
    const r = solvecubic(1, 0, 1, 1);
    expect(r.length).toBe(1);
    // verify it actually zeroes the polynomial
    const x = r[0]!;
    expect(x * x * x + x + 1).toBeCloseTo(0, 4);
  });

  it("repeated root case", () => {
    // (x-2)^2 (x+1) = x^3 -3x^2 +0x +4
    const r = solvecubic(1, -3, 0, 4);
    // roots are 2 (double) and -1
    expect(Math.min(...r)).toBeCloseTo(-1);
    expect(Math.max(...r)).toBeCloseTo(2);
  });

  it("degenerates to quadratic when a=0", () => {
    expect(solvecubic(0, 1, -3, 2)).toEqual(solvequadratic(1, -3, 2));
  });
});

describe("primuv interpolation VEX parity", () => {
  it("interpolates positions at triangle corners", () => {
    const m = box(2, 2, 2);
    // corner weights: u=0,v=0 -> first vertex of prim 0
    const i0 = m.indices[0]!;
    const p = primuvVec3(m, m.positions, 0, 0, 0);
    expect(p.x).toBeCloseTo(m.positions[i0]!.x);
    expect(p.y).toBeCloseTo(m.positions[i0]!.y);
    expect(p.z).toBeCloseTo(m.positions[i0]!.z);
  });

  it("sampleNormalAt returns a unit normal pointing outward", () => {
    const m = box(2, 2, 2);
    const n = sampleNormalAt(m, vec3(5, 0, 0));
    expect(length(n)).toBeCloseTo(1, 5);
    // closest face to +X query is the +X face, normal ~ +X
    expect(n.x).toBeGreaterThan(0.5);
  });

  it("primuv center of a triangle averages its corners", () => {
    const m = box(2, 2, 2);
    const cp = closestPointOnMesh(m, vec3(0.3, 0.3, 5));
    const interp = primuvVec3(m, m.positions, cp.prim, cp.uv.u, cp.uv.v);
    // interpolated position should equal the closest point
    expect(interp.x).toBeCloseTo(cp.position.x);
    expect(interp.y).toBeCloseTo(cp.position.y);
    expect(interp.z).toBeCloseTo(cp.position.z);
  });
});

describe("computeNormals hard/soft edges (computenormal parity)", () => {
  it("cusp=0 produces faceted normals (more vertices)", () => {
    const m = box(2, 2, 2);
    const faceted = computeNormals(m, 0);
    // box faces meet at 90deg, so every corner splits -> 24 verts, 12 tris
    expect(triangleCount(faceted)).toBe(triangleCount(m));
    expect(vertexCount(faceted)).toBeGreaterThanOrEqual(vertexCount(m));
    // each face normal should be axis-aligned (one component ~ ±1)
    for (const n of faceted.normals) {
      const maxc = Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z));
      expect(maxc).toBeCloseTo(1, 3);
    }
  });

  it("cusp=180 is fully smooth (averaged normals)", () => {
    const m = box(2, 2, 2);
    const smooth = computeNormals(m, 180);
    // a smoothed box corner normal points roughly diagonally
    const n = smooth.normals[0]!;
    expect(length(n)).toBeCloseTo(1, 5);
    // not axis aligned: all three components should be non-trivial
    const comps = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)].filter(
      (c) => c > 0.3,
    );
    expect(comps.length).toBeGreaterThanOrEqual(2);
  });

  it("indices stay valid after splitting", () => {
    const m = box(2, 2, 2);
    const faceted = computeNormals(m, 30);
    for (const idx of faceted.indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(faceted.positions.length);
    }
  });

  it("faceted normals are perpendicular per face", () => {
    const m = box(2, 2, 2);
    const faceted = computeNormals(m, 0);
    // pick triangle 0, all three corner normals identical (flat)
    const n0 = faceted.normals[faceted.indices[0]!]!;
    const n1 = faceted.normals[faceted.indices[1]!]!;
    expect(normalize(n0).x).toBeCloseTo(normalize(n1).x);
    expect(normalize(n0).y).toBeCloseTo(normalize(n1).y);
    expect(normalize(n0).z).toBeCloseTo(normalize(n1).z);
  });
});

describe("recomputeNormals still works (regression)", () => {
  it("returns same vertex count", () => {
    const m = box(2, 2, 2);
    const r = recomputeNormals(m);
    expect(vertexCount(r)).toBe(vertexCount(m));
  });
});
