import { describe, it, expect } from "vitest";
import {
  angleMeshField,
  bomberField2D,
  box,
  cellsField2D,
  circleStamp2D,
  combineField2D,
  curveField2D,
  distanceField2D,
  field2DStats,
  generateField2D,
  heightMeshField,
  makeField2D,
  plane,
  repeatField2D,
  sampleField2D,
  sampleField2DOnMeshUV,
  softClipField2D,
  thresholdField2D,
  curvatureMeshField,
  vec3,
  warpField2D,
} from "../src/index.js";

describe("Field2D buffer", () => {
  it("generates, samples and maps deterministic scalar fields", () => {
    const f = generateField2D(4, 4, (u) => u);
    expect(sampleField2D(f, 0, 0)).toBeCloseTo(0.125, 6);
    expect(sampleField2D(f, 99, 0)).toBeCloseTo(0.875, 6);

    const stats = field2DStats(f);
    expect(stats.min).toBeCloseTo(0.125, 6);
    expect(stats.max).toBeCloseTo(0.875, 6);
  });
});

describe("Field2D combine + profile", () => {
  it("combines foreground over background with mask and opacity", () => {
    const fg = makeField2D(2, 2, 1);
    const bg = makeField2D(2, 2, 0.25);
    const mask = makeField2D(2, 2, 0.5);
    const out = combineField2D(fg, bg, { mode: "copy", mask, opacity: 0.5 });
    expect(out.data[0]).toBeCloseTo(0.4375, 6);
  });

  it("thresholds, curves and distance-fields masks", () => {
    const grad = generateField2D(5, 1, (u) => u);
    const hard = thresholdField2D(grad, 0.5);
    expect([...hard.data]).toEqual([0, 0, 1, 1, 1]);

    const curved = curveField2D(grad, [[0, 0], [1, 0.25]]);
    expect(curved.data[4]).toBeLessThan(0.25);

    const mask = makeField2D(5, 1);
    mask.data[2] = 1;
    const dist = distanceField2D(mask, { maxDistance: 2 });
    expect(dist.data[2]).toBe(1);
    expect(dist.data[1]).toBeGreaterThan(dist.data[0]!);
  });

  it("soft clips raw weights into smooth 0..1 selection", () => {
    const f = generateField2D(3, 1, (u) => u * 2 - 0.5);
    const out = softClipField2D(f, 0, 1);
    expect(out.data[0]).toBe(0);
    expect(out.data[2]).toBe(1);
  });
});

describe("Field2D warp + pattern", () => {
  it("warps source through vector fields", () => {
    const source = generateField2D(4, 1, (u) => u);
    const vx = makeField2D(4, 1, -1);
    const vy = makeField2D(4, 1, 0);
    const out = warpField2D(source, { x: vx, y: vy });
    expect(out.data[2]).toBeCloseTo(source.data[1]!, 6);
  });

  it("repeats source tiles", () => {
    const source = generateField2D(2, 1, (u) => (u < 0.5 ? 0 : 1));
    const out = repeatField2D(source, 4, 1, { columns: 2, rows: 1 });
    expect(out.data[0]).toBeLessThan(out.data[1]!);
    expect(out.data[2]).toBeLessThan(out.data[3]!);
  });

  it("builds cell and bomber masks deterministically", () => {
    const a = bomberField2D(32, 32, circleStamp2D({ softness: 0 }), { count: 8, seed: 5 });
    const b = bomberField2D(32, 32, circleStamp2D({ softness: 0 }), { count: 8, seed: 5 });
    expect([...a.data]).toEqual([...b.data]);
    expect(field2DStats(a).max).toBe(1);

    const edges = cellsField2D(16, 16, { columns: 4, rows: 4, mode: "edge" });
    expect(field2DStats(edges).max).toBeGreaterThan(0.9);
  });
});

describe("Mesh data fields", () => {
  it("projects Field2D through mesh UVs", () => {
    const mesh = plane(2, 2, 1, 1);
    const field = generateField2D(8, 8, (u) => u);
    const values = sampleField2DOnMeshUV(mesh, field).values;
    expect(values.length).toBe(mesh.positions.length);
    expect(values[0]).toBeLessThan(values[1]!);
  });

  it("creates height and angle fields", () => {
    const mesh = box(1, 2, 1);
    const h = heightMeshField(mesh, "y").values;
    expect(Math.min(...h)).toBe(0);
    expect(Math.max(...h)).toBe(1);

    const up = angleMeshField(mesh, vec3(0, 1, 0)).values;
    expect(Math.max(...up)).toBe(1);
    expect(Math.min(...up)).toBe(0);
  });

  it("detects hard-edge curvature better than flat plane", () => {
    const flat = curvatureMeshField(plane(1, 1, 1, 1)).values;
    const cube = curvatureMeshField(box(1, 1, 1)).values;
    expect(Math.max(...flat)).toBe(0);
    expect(Math.max(...cube)).toBeGreaterThan(0.1);
  });
});
