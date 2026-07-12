import { describe, expect, it } from "vitest";
import {
  box,
  makePointCloud,
  pointAttribute,
  rayProjectPointCloud,
  storePointColorHSV,
  vec3,
} from "../src/index.js";

describe("rayProjectPointCloud", () => {
  it("projects points onto any mesh and preserves source attributes", () => {
    const source = makePointCloud({
      points: [vec3(-1, 2, 0), vec3(1, 3, 0), vec3(5, 2, 0)],
      attributes: { id: [10, 20, 30] },
    });
    const projected = rayProjectPointCloud(source, box(4, 0.2, 4), {
      direction: vec3(0, -1, 0),
      surfaceOffset: 0.03,
    });

    expect(projected.points).toHaveLength(2);
    expect(projected.attributes.id).toEqual([10, 20]);
    expect(projected.attributes["ray.hit"]).toEqual([1, 1]);
    expect(projected.points[0]!.y).toBeCloseTo(0.13);
    expect(projected.points[1]!.y).toBeCloseTo(0.13);
    expect(projected.normals.every((normal) => normal.y > 0.99)).toBe(true);
  });

  it("can retain misses and enforce a maximum trace distance", () => {
    const source = makePointCloud({
      points: [vec3(0, 1, 0), vec3(0, 4, 0)],
    });
    const projected = rayProjectPointCloud(source, box(2, 0.2, 2), {
      maxDistance: 2,
      miss: "keep",
    });

    expect(projected.points).toHaveLength(2);
    expect(projected.attributes["ray.hit"]).toEqual([1, 0]);
    expect(projected.attributes["ray.distance"]![0]).toBeCloseTo(0.9);
    expect(projected.attributes["ray.distance"]![1]).toBe(-1);
    expect(projected.attributes["ray.prim"]![1]).toBe(-1);
  });

  it("supports per-point directions", () => {
    const source = makePointCloud({
      points: [vec3(0, 2, 0), vec3(0, -2, 0)],
      attributes: { side: [-1, 1] },
    });
    const projected = rayProjectPointCloud(source, box(2, 0.2, 2), {
      direction: (context) => vec3(0, context.attributes.side![context.index]!, 0),
    });

    expect(projected.points).toHaveLength(2);
    expect(projected.points[0]!.y).toBeCloseTo(0.1);
    expect(projected.points[1]!.y).toBeCloseTo(-0.1);
  });
});

describe("storePointColorHSV", () => {
  it("writes wrapped HSV debug colors into point attributes", () => {
    const source = makePointCloud({
      points: [vec3(), vec3(1, 0, 0), vec3(2, 0, 0)],
      attributes: { hue: [0, 1 / 3, 2 / 3] },
    });
    const colored = storePointColorHSV(source, pointAttribute("hue"));

    const expected = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    for (let index = 0; index < expected.length; index++) {
      expect(colored.attributes["color.r"]![index]).toBeCloseTo(expected[index]![0]);
      expect(colored.attributes["color.g"]![index]).toBeCloseTo(expected[index]![1]);
      expect(colored.attributes["color.b"]![index]).toBeCloseTo(expected[index]![2]);
    }
    expect(source.attributes["color.r"]).toBeUndefined();
  });
});
