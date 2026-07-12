import { describe, it, expect } from "vitest";
import {
  box,
  sphere,
  cylinder,
  union,
  voxelRemesh,
  meshToSDF,
  polygonizeField,
  bounds,
  triangleCount,
  vertexCount,
  isPointInside,
  type ScalarGrid,
} from "../src/geometry/index.js";

// Count boundary (border) edges — an edge used by exactly one triangle.
// A watertight closed mesh has zero border edges.
function borderEdgeCount(m: {
  indices: ReadonlyArray<number>;
}): number {
  const edgeUse = new Map<string, number>();
  const key = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (let t = 0; t < m.indices.length; t += 3) {
    const ia = m.indices[t]!;
    const ib = m.indices[t + 1]!;
    const ic = m.indices[t + 2]!;
    for (const [x, y] of [[ia, ib], [ib, ic], [ic, ia]] as const) {
      const k = key(x, y);
      edgeUse.set(k, (edgeUse.get(k) ?? 0) + 1);
    }
  }
  let border = 0;
  for (const n of edgeUse.values()) if (n === 1) border++;
  return border;
}

describe("polygonizeField", () => {
  it("extracts a sphere-like surface from an analytic SDF grid", () => {
    // Build an SDF for a sphere of radius R centered in a cube grid.
    const g = 16;
    const cell = 1 / g;
    const R = 0.35;
    const gx = g + 1, gy = g + 1, gz = g + 1;
    const values = new Float64Array(gx * gy * gz);
    const idx = (i: number, j: number, k: number) => (k * gy + j) * gx + i;
    for (let k = 0; k < gz; k++)
      for (let j = 0; j < gy; j++)
        for (let i = 0; i < gx; i++) {
          const x = -0.5 + i * cell;
          const y = -0.5 + j * cell;
          const z = -0.5 + k * cell;
          values[idx(i, j, k)] = Math.sqrt(x * x + y * y + z * z) - R;
        }
    const grid: ScalarGrid = {
      gx, gy, gz,
      origin: { x: -0.5, y: -0.5, z: -0.5 },
      cell,
      values,
    };
    const m = polygonizeField(grid, { iso: 0 });
    expect(triangleCount(m)).toBeGreaterThan(50);
    // watertight: no border edges
    expect(borderEdgeCount(m)).toBe(0);
    // every vertex sits near radius R from origin
    for (const p of m.positions) {
      const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
      expect(Math.abs(r - R)).toBeLessThan(cell * 1.5);
    }
  });

  it("returns empty for a degenerate grid", () => {
    const grid: ScalarGrid = {
      gx: 1, gy: 1, gz: 1,
      origin: { x: 0, y: 0, z: 0 },
      cell: 1,
      values: new Float64Array([1]),
    };
    expect(triangleCount(polygonizeField(grid))).toBe(0);
  });
});

describe("meshToSDF", () => {
  it("is negative inside and positive outside", () => {
    const m = sphere(0.5, 16, 12);
    const grid = meshToSDF(m, { resolution: 16 });
    const idx = (i: number, j: number, k: number) =>
      (k * grid.gy + j) * grid.gx + i;
    // center-most grid vertex should be well inside -> negative
    const ci = Math.floor(grid.gx / 2);
    const cj = Math.floor(grid.gy / 2);
    const ck = Math.floor(grid.gz / 2);
    expect(grid.values[idx(ci, cj, ck)]!).toBeLessThan(0);
    // corner grid vertex is outside -> positive
    expect(grid.values[idx(0, 0, 0)]!).toBeGreaterThan(0);
  });
});

describe("voxelRemesh", () => {
  it("produces a watertight shell from a boolean union", () => {
    const a = box(1, 1, 1);
    const b = sphere(0.6, 16, 12);
    const messy = union(a, b);
    const clean = voxelRemesh(messy, { resolution: 24 });
    expect(triangleCount(clean)).toBeGreaterThan(100);
    expect(borderEdgeCount(clean)).toBe(0);
  });

  it("preserves bounds within one voxel", () => {
    const m = sphere(0.5, 16, 12);
    const clean = voxelRemesh(m, { resolution: 32 });
    const bi = bounds(m);
    const bo = bounds(clean);
    const cell = (bi.max.x - bi.min.x) / 32;
    // remeshed bounds stay close to the source (rounding at voxel scale)
    expect(Math.abs(bo.max.x - bi.max.x)).toBeLessThan(cell * 2);
    expect(Math.abs(bo.min.y - bi.min.y)).toBeLessThan(cell * 2);
  });

  it("is deterministic — same mesh + resolution gives identical output", () => {
    const m = cylinder(0.4, 1, 12);
    const a = voxelRemesh(m, { resolution: 20 });
    const b = voxelRemesh(m, { resolution: 20 });
    expect(vertexCount(a)).toBe(vertexCount(b));
    expect(triangleCount(a)).toBe(triangleCount(b));
    for (let i = 0; i < a.positions.length; i++) {
      expect(a.positions[i]!.x).toBe(b.positions[i]!.x);
      expect(a.positions[i]!.y).toBe(b.positions[i]!.y);
      expect(a.positions[i]!.z).toBe(b.positions[i]!.z);
    }
  });

  it("remeshed sphere center is still inside the shell", () => {
    const m = sphere(0.5, 16, 12);
    const clean = voxelRemesh(m, { resolution: 24 });
    expect(isPointInside(clean, { x: 0, y: 0, z: 0 })).toBe(true);
  });

  it("returns empty for empty input", () => {
    const empty = { positions: [], normals: [], uvs: [], indices: [] };
    const r = voxelRemesh(empty as never);
    expect(vertexCount(r)).toBe(0);
  });
});
