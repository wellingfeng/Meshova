import { describe, expect, it } from "vitest";
import {
  bounds,
  buildUe5PcgCaveMesh,
  buildUe5PcgCaveParts,
  triangleCount,
} from "../src/index.js";

describe("UE5 PCG procedural cave", () => {
  it("builds a fused branching cave shell with open portal boundaries", () => {
    const mesh = buildUe5PcgCaveMesh({
      length: 22,
      width: 16,
      resolution: 28,
      branchCount: 2,
    });
    const box = bounds(mesh);
    expect(triangleCount(mesh)).toBeGreaterThan(800);
    expect(box.max.x - box.min.x).toBeGreaterThan(20);
    expect(mesh.positions.some((point) => Math.abs(point.x + 11) < 1e-6)).toBe(true);
    expect(mesh.positions.some((point) => Math.abs(point.x - 11) < 1e-6)).toBe(true);
  });

  it("is deterministic for the same seed", () => {
    const options = {
      seed: 14,
      resolution: 24,
      floorRocks: 0,
      wallRocks: 0,
      ceilingRocks: 0,
    };
    const first = buildUe5PcgCaveParts(options);
    const second = buildUe5PcgCaveParts(options);
    expect(first[0]!.mesh.positions).toEqual(second[0]!.mesh.positions);
    expect(first[0]!.mesh.indices).toEqual(second[0]!.mesh.indices);
  });

  it("adds semantic PCG scatter layers", () => {
    const parts = buildUe5PcgCaveParts({
      resolution: 24,
      floorRocks: 4,
      wallRocks: 5,
      ceilingRocks: 3,
    });
    expect(parts.map((part) => part.label)).toEqual([
      "洞穴岩壁",
      "洞底碎岩",
      "洞壁岩块",
      "顶部垂岩",
    ]);
    for (const part of parts) expect(triangleCount(part.mesh)).toBeGreaterThan(0);
  });

  it("branch count changes the generated tunnel network", () => {
    const simple = buildUe5PcgCaveMesh({ resolution: 24, branchCount: 0, seed: 8 });
    const branching = buildUe5PcgCaveMesh({ resolution: 24, branchCount: 2, seed: 8 });
    expect(branching.positions).not.toEqual(simple.positions);
    expect(triangleCount(branching)).toBeGreaterThan(triangleCount(simple));
  });
});
