import { describe, expect, it } from "vitest";
import {
  bounds,
  buildHoudiniCaveMesh,
  buildHoudiniCaveParts,
  triangleCount,
} from "../src/index.js";

describe("Houdini cave reproduction", () => {
  it("builds a wide hollow cave shell", () => {
    const mesh = buildHoudiniCaveMesh({ resolution: 32, seed: 7 });
    const box = bounds(mesh);
    expect(triangleCount(mesh)).toBeGreaterThan(500);
    expect(box.max.x - box.min.x).toBeGreaterThan(box.max.y - box.min.y);
    for (const point of mesh.positions) {
      expect(Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)).toBe(true);
    }
  });

  it("is deterministic for the same seed", () => {
    const first = buildHoudiniCaveMesh({ resolution: 28, seed: 23 });
    const second = buildHoudiniCaveMesh({ resolution: 28, seed: 23 });
    expect(first.positions).toEqual(second.positions);
    expect(first.indices).toEqual(second.indices);
  });

  it("seed changes the rock surface", () => {
    const first = buildHoudiniCaveMesh({ resolution: 28, seed: 1 });
    const second = buildHoudiniCaveMesh({ resolution: 28, seed: 2 });
    expect(first.positions).not.toEqual(second.positions);
  });

  it("exports semantic cave and entrance-rock labels", () => {
    const parts = buildHoudiniCaveParts({ resolution: 24, entranceRocks: 2 });
    expect(parts.map((part) => part.label)).toEqual(["山洞岩壁", "入口岩石 1", "入口岩石 2"]);
  });
});
