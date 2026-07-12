import { describe, it, expect } from "vitest";
import { fern, fernFrond } from "../src/vegetation/fern.js";

describe("fernFrond", () => {
  it("produces a non-empty mesh with valid triangle indices", () => {
    const m = fernFrond({ segments: 10 });
    expect(m.positions.length).toBeGreaterThan(0);
    expect(m.indices.length % 3).toBe(0);
    for (const idx of m.indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(m.positions.length);
    }
    expect(m.normals.length).toBe(m.positions.length);
    expect(m.uvs.length).toBe(m.positions.length);
  });

  it("is deterministic: same options give identical geometry", () => {
    const a = fernFrond({ segments: 12, pitch: 0.4, yaw: 1.1 });
    const b = fernFrond({ segments: 12, pitch: 0.4, yaw: 1.1 });
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });

  it("bends: the frond tip droops below its arc when bendStrength is high", () => {
    const straight = fernFrond({ bendStrength: 0, length: 1, segments: 16 });
    const curled = fernFrond({ bendStrength: 2.5, length: 1, segments: 16 });
    const topY = (m: { positions: ReadonlyArray<{ y: number }> }) =>
      Math.max(...m.positions.map((p) => p.y));
    // A curled frond cannot reach as high as a straight one of equal length.
    expect(topY(curled)).toBeLessThan(topY(straight));
  });

  it("wind phase changes geometry but keeps it valid", () => {
    const rest = fernFrond({ windStrength: 0.6, windPhase: 0 });
    const gust = fernFrond({ windStrength: 0.6, windPhase: 0.25 });
    expect(rest.positions).not.toEqual(gust.positions);
    expect(gust.indices.length % 3).toBe(0);
  });
});

describe("fern", () => {
  it("merges multiple fronds into one mesh", () => {
    const one = fern({ fronds: 1 });
    const many = fern({ fronds: 6 });
    expect(many.positions.length).toBeGreaterThan(one.positions.length * 4);
    expect(many.indices.length % 3).toBe(0);
  });

  it("is deterministic", () => {
    const a = fern({ fronds: 5, seed: 3 });
    const b = fern({ fronds: 5, seed: 3 });
    expect(a.positions).toEqual(b.positions);
  });
});
