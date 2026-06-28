import { describe, expect, it } from "vitest";
import {
  box,
  bounds,
  copyToPoints,
  filterPoints,
  instanceCount,
  instancePlanFromPoints,
  makePointCloud,
  plane,
  pointAttribute,
  pointCount,
  poissonPointCloud,
  rampF,
  scalarRamp,
  storePointAttribute,
  surfacePointCloud,
  triangleCount,
  vec3,
  type FieldContext,
} from "../src/index.js";

describe("ramps", () => {
  it("samples clamped scalar ramps with unsorted stops", () => {
    const r = scalarRamp([{ t: 1, value: 10 }, { t: 0, value: 0 }]);
    expect(r(-1)).toBe(0);
    expect(r(0.25)).toBeCloseTo(2.5, 6);
    expect(r(2)).toBe(10);
  });

  it("lifts ramps into field expressions", () => {
    const f = rampF((ctx) => ctx.position.y, [{ t: 0, value: 2 }, { t: 2, value: 6 }]);
    const v = typeof f === "function"
      ? f({ index: 0, position: vec3(0, 1, 0), normal: vec3(0, 1, 0), uv: { x: 0, y: 0 }, attributes: {} } as FieldContext)
      : f;
    expect(v).toBeCloseTo(4, 6);
  });
});

describe("point cloud domain", () => {
  it("samples deterministic surface point clouds with debug attrs", () => {
    const a = surfacePointCloud(plane(4, 4, 1, 1), { count: 12, seed: 2 });
    const b = surfacePointCloud(plane(4, 4, 1, 1), { count: 12, seed: 2 });
    expect(pointCount(a)).toBe(12);
    expect(a.points[0]).toEqual(b.points[0]);
    expect(a.attributes.id!.length).toBe(12);
    expect(a.attributes.tri!.length).toBe(12);
  });

  it("stores and filters point attributes", () => {
    let pc = makePointCloud({
      points: [vec3(-1, 0, 0), vec3(1, 0, 0), vec3(2, 0, 0)],
    });
    pc = storePointAttribute(pc, "right", (ctx) => (ctx.point.x > 0 ? 1 : 0));
    const right = filterPoints(pc, pointAttribute("right"));
    expect(pointCount(right)).toBe(2);
    expect(right.attributes.right).toEqual([1, 1]);
  });

  it("poisson point cloud returns requested count", () => {
    const pc = poissonPointCloud(plane(2, 2, 1, 1), { count: 8, seed: 3, candidates: 6 });
    expect(pointCount(pc)).toBe(8);
  });
});

describe("instance plans", () => {
  it("copies meshes to points with point-driven scale", () => {
    const pc = makePointCloud({
      points: [vec3(0, 0, 0), vec3(2, 0, 0)],
      normals: [vec3(0, 1, 0), vec3(0, 1, 0)],
      attributes: { scale: [1, 2] },
    });
    const out = copyToPoints(pc, box(1, 1, 1), {
      scale: pointAttribute("scale"),
      alignToNormal: false,
    });
    expect(triangleCount(out)).toBe(triangleCount(box(1, 1, 1)) * 2);
    expect(bounds(out).max.x).toBeCloseTo(3, 6);
  });

  it("keeps instance plan inspectable before realize", () => {
    const pc = makePointCloud({
      points: [vec3(0, 0, 0), vec3(1, 0, 0), vec3(2, 0, 0)],
      attributes: { variant: [0, 1, 0] },
    });
    const plan = instancePlanFromPoints(pc, [box(1, 1, 1), box(1, 2, 1)], {
      variant: pointAttribute("variant"),
      alignToNormal: false,
    });
    expect(instanceCount(plan)).toBe(3);
    expect(plan.instances.map((i) => i.variant)).toEqual([0, 1, 0]);
  });
});
