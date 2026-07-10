import { describe, it, expect } from "vitest";
import {
  makePointCloud,
  pointAttribute,
} from "../src/geometry/point-cloud.js";
import {
  pointRow,
  selectRows,
  where,
  gatherPoints,
  aggregate,
  pointCloudBounds,
  groupBy,
  partition,
  histogram,
} from "../src/geometry/point-query.js";
import { vec3 } from "../src/math/vec3.js";

function grid(): ReturnType<typeof makePointCloud> {
  // 4 points at x=0..3, carrying "variant" and "h" columns
  return makePointCloud({
    points: [vec3(0, 0, 0), vec3(1, 0, 0), vec3(2, 0, 0), vec3(3, 0, 0)],
    attributes: {
      variant: [0, 1, 0, 1],
      h: [10, 20, 30, 40],
    },
  });
}

describe("point-query", () => {
  it("pointRow exposes position + all attributes", () => {
    const r = pointRow(grid(), 2);
    expect(r.index).toBe(2);
    expect(r.x).toBe(2);
    expect(r.variant).toBe(0);
    expect(r.h).toBe(30);
  });

  it("selectRows with a WHERE predicate", () => {
    const rows = selectRows(grid(), (c) => (c.attributes["h"]?.[c.index] ?? 0) >= 30);
    expect(rows.map((r) => r.h)).toEqual([30, 40]);
  });

  it("where keeps matching points and compacts attributes", () => {
    const pc = where(grid(), (c) => (c.attributes["variant"]?.[c.index] ?? 0) === 1);
    expect(pc.points.length).toBe(2);
    expect(pc.attributes["h"]).toEqual([20, 40]);
  });

  it("gatherPoints reorders/duplicates by index list", () => {
    const pc = gatherPoints(grid(), [3, 0]);
    expect(pc.points.map((p) => p.x)).toEqual([3, 0]);
    expect(pc.attributes["h"]).toEqual([40, 10]);
  });

  it("aggregate reduces a column", () => {
    const a = aggregate(grid(), pointAttribute("h"));
    expect(a).toEqual({ count: 4, sum: 100, min: 10, max: 40, mean: 25 });
  });

  it("aggregate on empty cloud is all zeros", () => {
    const a = aggregate(makePointCloud({ points: [] }), pointAttribute("h"));
    expect(a).toEqual({ count: 0, sum: 0, min: 0, max: 0, mean: 0 });
  });

  it("pointCloudBounds returns box/center/size", () => {
    const b = pointCloudBounds(grid());
    expect(b.min.x).toBe(0);
    expect(b.max.x).toBe(3);
    expect(b.center.x).toBe(1.5);
    expect(b.size.x).toBe(3);
  });

  it("groupBy buckets by a key column", () => {
    const groups = groupBy(grid(), pointAttribute("variant"));
    expect([...groups.keys()].sort()).toEqual([0, 1]);
    expect(groups.get(0)!.points.length).toBe(2);
    expect(groups.get(1)!.attributes["h"]).toEqual([20, 40]);
  });

  it("partition splits into inside/outside preserving order", () => {
    const { inside, outside } = partition(grid(), (c) => c.point.x >= 2);
    expect(inside.points.map((p) => p.x)).toEqual([2, 3]);
    expect(outside.points.map((p) => p.x)).toEqual([0, 1]);
  });

  it("histogram buckets a column across its range", () => {
    const hist = histogram(grid(), pointAttribute("h"), 3);
    expect(hist.min).toBe(10);
    expect(hist.max).toBe(40);
    expect(hist.counts.reduce((a, b) => a + b, 0)).toBe(4);
  });

  it("histogram with zero range dumps all into bin 0", () => {
    const pc = makePointCloud({ points: [vec3(0, 0, 0), vec3(1, 0, 0)], attributes: { h: [5, 5] } });
    const hist = histogram(pc, pointAttribute("h"), 4);
    expect(hist.counts[0]).toBe(2);
    expect(hist.binWidth).toBe(0);
  });
});
