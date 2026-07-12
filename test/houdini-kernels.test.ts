import { describe, expect, it } from "vitest";
import {
  bakeGeometryToTextures,
  box,
  buildInstanceBuffers,
  grammarResample,
  materialFromGeometryBake,
  plane,
  proximityGraphGrowth,
  proximityGrowthToMesh,
  triangleCount,
  validateMaterial,
  vec3,
} from "../src/index.js";

describe("grammarResample", () => {
  it("repeats modules and distributes remainder to exact target length", () => {
    const placements = grammarResample(9, [
      { key: "left", label: "左端模块", prefab: "cap", length: 1 },
      { key: "bay", label: "重复窗格", prefab: "window", length: 2, mode: "repeat", minCount: 1 },
      { key: "right", label: "右端模块", prefab: "cap", length: 1 },
    ]);
    const bays = placements.filter((placement) => placement.key === "bay");
    expect(bays).toHaveLength(3);
    expect(placements[0]!.start).toBeCloseTo(0);
    expect(placements.at(-1)!.end).toBeCloseTo(9);
    expect(bays[0]!.length).toBeCloseTo(7 / 3);
  });

  it("culls optional modules below their threshold", () => {
    const placements = grammarResample(4, [
      { key: "bay", label: "主体模块", prefab: "main", length: 2, mode: "repeat", minCount: 1 },
      { key: "service", label: "服务模块", prefab: "service", length: 1, cullBelow: 6 },
    ]);
    expect(placements.some((placement) => placement.key === "service")).toBe(false);
    expect(placements.at(-1)!.end).toBeCloseTo(4);
  });
});

describe("InstanceBuffer", () => {
  it("groups by mesh, material and partition with fixed custom stride", () => {
    const buffers = buildInstanceBuffers([
      { meshId: "window", materialId: "glass", partition: "front", position: vec3(1, 2, 3), customData: [2, 5] },
      { meshId: "window", materialId: "glass", partition: "front", position: vec3(4, 5, 6), scale: vec3(2, 1, 1), customData: [3] },
      { meshId: "window", materialId: "glass", partition: "back", position: vec3() },
    ], { customStride: 2 });
    expect(buffers).toHaveLength(2);
    expect(buffers[0]!.count).toBe(2);
    expect([...buffers[0]!.positions]).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...buffers[0]!.customData]).toEqual([2, 5, 3, 0]);
    expect([...buffers[0]!.rotations.slice(0, 4)]).toEqual([0, 0, 0, 1]);
  });
});

describe("proximityGraphGrowth", () => {
  it("builds a deterministic connected tapered tree", () => {
    const points = [
      vec3(0, 0, 0),
      vec3(1, 0.1, 0),
      vec3(2, 0.2, 0),
      vec3(2, 0.3, 1),
      vec3(3, 0.2, 0),
    ];
    const first = proximityGraphGrowth(points, {
      rootIndex: 0,
      maxDistance: 1.5,
      maxChildren: 2,
      baseRadius: 0.2,
      endpointScale: 0.2,
      relaxIterations: 1,
    });
    const second = proximityGraphGrowth(points, {
      rootIndex: 0,
      maxDistance: 1.5,
      maxChildren: 2,
      baseRadius: 0.2,
      endpointScale: 0.2,
      relaxIterations: 1,
    });
    expect(first).toEqual(second);
    expect(first.nodes).toHaveLength(points.length);
    expect(first.edges).toHaveLength(points.length - 1);
    expect(first.droppedPointIndices).toEqual([]);
    expect(Math.max(...first.nodes.map((node) => node.radius))).toBeGreaterThan(first.nodes[0]!.radius);
    expect(triangleCount(proximityGrowthToMesh(first, 6))).toBeGreaterThan(0);
  });
});

describe("geometry texture bake", () => {
  it("rasterizes UV geometry into valid PBR fields", () => {
    const mesh = plane(2, 2, 2, 1);
    const bake = bakeGeometryToTextures(mesh, {
      width: 32,
      height: 16,
      primitiveIds: [0, 0, 1, 1],
    });
    const covered = [...bake.coverage.data].filter((value) => value > 0).length;
    expect(covered).toBeGreaterThan(32 * 8);
    expect(Math.max(...bake.id.data)).toBe(1);
    expect(bake.normal.channels).toBe(3);
    expect(validateMaterial(materialFromGeometryBake(bake))).toEqual([]);
  });

  it("rejects mismatched primitive ids", () => {
    expect(() => bakeGeometryToTextures(box(), { primitiveIds: [0] })).toThrow(/primitiveIds/);
  });
});
