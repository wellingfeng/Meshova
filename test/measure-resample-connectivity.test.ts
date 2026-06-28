import { describe, it, expect } from "vitest";
import {
  polyline,
  resampleCurve,
  curveLength,
  box,
  merge,
  translateMesh,
  faceAreas,
  surfaceArea,
  centerOn,
  groundMesh,
  fitInto,
  matchSize,
  bounds,
  toTopo,
  connectivity,
  pointIslands,
  vec3,
} from "../src/index.js";

const EPS = 1e-6;

describe("resampleCurve", () => {
  it("produces evenly spaced points along a straight line", () => {
    const c = polyline([vec3(0, 0, 0), vec3(3, 0, 0), vec3(10, 0, 0)]);
    const r = resampleCurve(c, { count: 11 });
    expect(r.points.length).toBe(11);
    // total length preserved
    expect(curveLength(r)).toBeCloseTo(10, 4);
    // equal spacing => 1.0 per segment
    for (let i = 1; i < r.points.length; i++) {
      const d = r.points[i]!.x - r.points[i - 1]!.x;
      expect(d).toBeCloseTo(1.0, 4);
    }
  });

  it("respects segmentLength target", () => {
    const c = polyline([vec3(0, 0, 0), vec3(10, 0, 0)]);
    const r = resampleCurve(c, { segmentLength: 2 });
    // 10 / 2 = 5 segments => 6 points (open)
    expect(r.points.length).toBe(6);
  });

  it("handles closed curves", () => {
    const c = polyline([vec3(0, 0, 0), vec3(4, 0, 0), vec3(4, 4, 0), vec3(0, 4, 0)], true);
    const r = resampleCurve(c, { count: 8 });
    expect(r.points.length).toBe(8);
    expect(r.closed).toBe(true);
    expect(curveLength(r)).toBeCloseTo(16, 3);
  });
});

describe("measure", () => {
  it("computes face areas and total surface area of a unit box", () => {
    const b = box(1, 1, 1);
    const areas = faceAreas(b);
    expect(areas.length).toBe(b.indices.length / 3);
    // unit cube surface area = 6
    expect(surfaceArea(b)).toBeCloseTo(6, 4);
  });

  it("centerOn moves bbox center to origin", () => {
    const b = translateMesh(box(2, 2, 2), vec3(5, 7, 9));
    const c = centerOn(b);
    const bb = bounds(c);
    expect((bb.min.x + bb.max.x) / 2).toBeCloseTo(0, EPS);
    expect((bb.min.y + bb.max.y) / 2).toBeCloseTo(0, EPS);
    expect((bb.min.z + bb.max.z) / 2).toBeCloseTo(0, EPS);
  });

  it("groundMesh sets min.y to 0", () => {
    const b = translateMesh(box(2, 2, 2), vec3(0, 10, 0));
    const g = groundMesh(b);
    expect(bounds(g).min.y).toBeCloseTo(0, EPS);
  });

  it("fitInto uniform keeps aspect and fits inside target", () => {
    const b = box(2, 1, 1);
    const f = fitInto(b, vec3(4, 4, 4));
    const sz = bounds(f);
    const w = sz.max.x - sz.min.x;
    const h = sz.max.y - sz.min.y;
    // longest axis (x=2) scales by min(4/2,4/1,4/1)=2 => x becomes 4, y becomes 2
    expect(w).toBeCloseTo(4, 4);
    expect(h).toBeCloseTo(2, 4);
  });

  it("matchSize scales one mesh to another's bounds (non-uniform)", () => {
    const a = box(1, 1, 1);
    const ref = box(3, 5, 2);
    const m = matchSize(a, ref, { uniform: false });
    const sz = bounds(m);
    expect(sz.max.x - sz.min.x).toBeCloseTo(3, 4);
    expect(sz.max.y - sz.min.y).toBeCloseTo(5, 4);
    expect(sz.max.z - sz.min.z).toBeCloseTo(2, 4);
  });
});

describe("connectivity", () => {
  it("counts separate islands for disjoint boxes", () => {
    const a = box(1, 1, 1);
    const b = translateMesh(box(1, 1, 1), vec3(10, 0, 0));
    const c = translateMesh(box(1, 1, 1), vec3(20, 0, 0));
    const m = merge(a, b, c);
    const topo = toTopo(m);
    const { faceIsland, count } = connectivity(topo);
    expect(count).toBe(3);
    expect(faceIsland.length).toBe(topo.faces.length);
  });

  it("single connected mesh is one island", () => {
    const topo = toTopo(box(1, 1, 1));
    expect(connectivity(topo).count).toBe(1);
    const { pointIsland, count } = pointIslands(topo);
    expect(count).toBe(1);
    expect(pointIsland.every((v) => v === 0)).toBe(true);
  });
});

import { computeVertexCurvature, sphere, plane } from "../src/index.js";

describe("computeVertexCurvature", () => {
  it("returns one value per vertex in [0,1]", () => {
    const m = box(1, 1, 1);
    const c = computeVertexCurvature(m);
    expect(c.length).toBe(m.positions.length);
    for (const v of c) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1);
  });

  it("a flat plane has ~zero curvature everywhere", () => {
    const m = plane(2, 2, 4, 4);
    const c = computeVertexCurvature(m);
    const max = Math.max(...c);
    expect(max).toBeLessThan(0.05);
  });

  it("a cube's split corners register as convex (non-zero curvature)", () => {
    // Hard-surface meshes split verts on sharp edges; the weld-by-position pass
    // must still detect the convex corner. Plane stays flat (~0) for contrast.
    const cubeMax = Math.max(...computeVertexCurvature(box(1, 1, 1)));
    const planeMax = Math.max(...computeVertexCurvature(plane(2, 2, 4, 4)));
    expect(cubeMax).toBeGreaterThan(0.4);
    expect(cubeMax).toBeGreaterThan(planeMax + 0.3);
  });

  it("is deterministic", () => {
    const m = sphere(1, 16, 8);
    expect(computeVertexCurvature(m)).toEqual(computeVertexCurvature(m));
  });
});
