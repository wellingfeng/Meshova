import { describe, expect, it } from "vitest";
import {
  applyMaskField,
  makePointCloud,
  polyline,
  sampleMaskField,
  vec3,
  type MaskField,
} from "../src/index.js";

describe("MaskField", () => {
  it("组合高度、坡度、反相字段", () => {
    const cloud = makePointCloud({
      points: [vec3(0, 1, 0), vec3(0, 5, 0), vec3(0, 2, 0)],
      normals: [vec3(0, 1, 0), vec3(0, 1, 0), vec3(1, 0, 0)],
    });
    const field: MaskField = {
      type: "combine",
      op: "multiply",
      fields: [
        { type: "height", min: 0, max: 3 },
        { type: "invert", field: { type: "slope", minDeg: 45 } },
      ],
    };
    expect(sampleMaskField(cloud, field)).toEqual([1, 0, 0]);
  });

  it("支持曲线距离、边界与投影", () => {
    const cloud = makePointCloud({ points: [vec3(0, 0, 0), vec3(0, 0, 3), vec3(5, 0, 0)] });
    const road = polyline([vec3(-5, 0, 0), vec3(5, 0, 0)]);
    expect(sampleMaskField(cloud, { type: "curve-distance", curve: road, max: 1 })).toEqual([1, 0, 1]);
    expect(sampleMaskField(cloud, {
      type: "polygon",
      points: [vec3(-1, 0, -1), vec3(1, 0, -1), vec3(1, 0, 1), vec3(-1, 0, 1)],
    })).toEqual([1, 0, 0]);
    expect(sampleMaskField(cloud, { type: "projection", axis: "z", min: 2, max: 4 })).toEqual([0, 1, 0]);
  });

  it("双线性采样纹理并读取顶点色", () => {
    const cloud = makePointCloud({
      points: [vec3(0, 0, 0), vec3(1, 0, 0)],
      attributes: { u: [0.5, 1], v: [0.5, 1], colorR: [0.25, 0.75] },
    });
    expect(sampleMaskField(cloud, { type: "texture", width: 2, height: 2, values: [0, 0, 0, 1] })).toEqual([0.25, 1]);
    expect(sampleMaskField(cloud, { type: "vertex-color", channel: "r" })).toEqual([0.25, 0.75]);
  });

  it("与已有 mask 相乘且不改输入", () => {
    const cloud = makePointCloud({ points: [vec3(0, 0, 0)], attributes: { mask: [0.5] } });
    const out = applyMaskField(cloud, { type: "constant", value: 0.4 }, { combine: "multiply" });
    expect(out.attributes.mask![0]).toBeCloseTo(0.2);
    expect(cloud.attributes.mask![0]).toBe(0.5);
  });
});
