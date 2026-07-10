import { describe, it, expect } from "vitest";
import {
  partitionByAttribute,
  scatterToLayers,
  makePointCloud,
  box,
  cylinder,
  triangleCount,
} from "../src/geometry/index.js";
import { vec3 } from "../src/math/vec3.js";

function cloudWithLayers(layerValues: number[]) {
  return makePointCloud({
    points: layerValues.map((_, i) => vec3(i, 0, 0)),
    attributes: { layer: layerValues, scale: layerValues.map(() => 1) },
  });
}

describe("partitionByAttribute", () => {
  it("splits a cloud into per-value sub-clouds and drops out-of-range", () => {
    const pc = cloudWithLayers([0, 1, 0, 2, 1, 5]); // 5 is out of range for count=3
    const parts = partitionByAttribute(pc, "layer", 3);
    expect(parts.length).toBe(3);
    expect(parts[0]!.points.length).toBe(2); // two 0s
    expect(parts[1]!.points.length).toBe(2); // two 1s
    expect(parts[2]!.points.length).toBe(1); // one 2
  });

  it("carries other attributes compacted alongside", () => {
    const pc = cloudWithLayers([1, 0, 1]);
    const parts = partitionByAttribute(pc, "layer", 2);
    expect(parts[1]!.attributes.scale!.length).toBe(2);
  });
});

describe("scatterToLayers", () => {
  it("builds one named mesh per non-empty layer", () => {
    const pc = cloudWithLayers([0, 1, 0, 1, 1]); // 2 in layer0, 3 in layer1
    const stone = { parts: [{ mesh: box(0.5, 0.5, 0.5) }] };
    const post = { parts: [{ mesh: cylinder(0.1, 1, 6) }] };
    const out = scatterToLayers(pc, "layer", [
      { name: "stones", library: stone, options: { alignToNormal: false } },
      { name: "posts", library: post, options: { alignToNormal: false } },
    ]);
    expect(out.length).toBe(2);
    expect(out[0]!.name).toBe("stones");
    expect(out[0]!.count).toBe(2);
    expect(out[1]!.name).toBe("posts");
    expect(out[1]!.count).toBe(3);
    // stones mesh = 2 copies of a box
    expect(triangleCount(out[0]!.mesh)).toBe(triangleCount(box(0.5, 0.5, 0.5)) * 2);
  });

  it("skips empty layers", () => {
    const pc = cloudWithLayers([0, 0, 0]); // nothing in layer 1
    const out = scatterToLayers(pc, "layer", [
      { name: "a", library: { parts: [{ mesh: box(1, 1, 1) }] }, options: { alignToNormal: false } },
      { name: "b", library: { parts: [{ mesh: box(1, 1, 1) }] }, options: { alignToNormal: false } },
    ]);
    expect(out.length).toBe(1);
    expect(out[0]!.name).toBe("a");
  });
});
