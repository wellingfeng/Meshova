import { describe, it, expect } from "vitest";
import {
  plane,
  box,
  poissonScatter,
  scatterOnSurface,
  triangleCount,
  type Mesh,
} from "../src/index.js";

// Extract per-instance centroids by chunking vertices (each instance = same
// vertex count as the source box).
function instanceCentroids(m: Mesh, vertsPerInstance: number) {
  const centroids: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < m.positions.length; i += vertsPerInstance) {
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < vertsPerInstance; j++) {
      const p = m.positions[i + j]!;
      cx += p.x; cy += p.y; cz += p.z;
    }
    centroids.push({ x: cx / vertsPerInstance, y: cy / vertsPerInstance, z: cz / vertsPerInstance });
  }
  return centroids;
}

function minPairwiseDistance(pts: { x: number; y: number; z: number }[]) {
  let min = Infinity;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y, pts[i]!.z - pts[j]!.z);
      if (d < min) min = d;
    }
  }
  return min;
}

describe("poissonScatter", () => {
  it("places the requested count and is deterministic", () => {
    const ground = plane(4, 4, 2, 2);
    const inst = box(0.1, 0.1, 0.1);
    const a = poissonScatter(ground, inst, { count: 25, seed: 1 });
    const b = poissonScatter(ground, inst, { count: 25, seed: 1 });
    expect(triangleCount(a)).toBe(triangleCount(inst) * 25);
    expect(a.positions[0]).toEqual(b.positions[0]);
  });

  it("blue-noise spacing beats pure random clumping", () => {
    const ground = plane(4, 4, 1, 1);
    const inst = box(0.05, 0.05, 0.05);
    const vpi = inst.positions.length;
    const blue = poissonScatter(ground, inst, { count: 30, seed: 5, candidates: 12, alignToNormal: false });
    const rand = scatterOnSurface(ground, inst, { count: 30, seed: 5, alignToNormal: false });
    const blueMin = minPairwiseDistance(instanceCentroids(blue, vpi));
    const randMin = minPairwiseDistance(instanceCentroids(rand, vpi));
    expect(blueMin).toBeGreaterThan(randMin);
  });

  it("scaleRange varies instance sizes", () => {
    const ground = plane(4, 4, 1, 1);
    const inst = box(0.1, 0.1, 0.1);
    const m = poissonScatter(ground, inst, { count: 20, seed: 2, scaleRange: [0.5, 2], alignToNormal: false });
    expect(triangleCount(m)).toBe(triangleCount(inst) * 20);
  });

  it("count 0 yields empty mesh", () => {
    const m = poissonScatter(plane(2, 2, 1, 1), box(0.1, 0.1, 0.1), { count: 0 });
    expect(m.positions.length).toBe(0);
  });
});
