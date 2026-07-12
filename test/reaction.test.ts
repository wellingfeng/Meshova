import { describe, it, expect } from "vitest";
import {
  field2DStats,
  grayScottField2D,
  grayScottState2D,
  grayScottStep2D,
} from "../src/index.js";

describe("Gray-Scott reaction diffusion", () => {
  it("is deterministic for the same seed and parameters", () => {
    const opts = { iterations: 8, seed: 4, spots: 3, spotRadius: 3 };
    const a = grayScottField2D(24, 24, opts);
    const b = grayScottField2D(24, 24, opts);
    expect([...a.data]).toEqual([...b.data]);
    const stats = field2DStats(a);
    expect(stats.max).toBeGreaterThan(stats.min);
    expect(stats.min).toBeGreaterThanOrEqual(0);
    expect(stats.max).toBeLessThanOrEqual(1);
  });

  it("steps immutable state with matching dimensions", () => {
    const state = grayScottState2D(12, 10, { seed: 2, spots: 1, spotRadius: 2 });
    const next = grayScottStep2D(state);
    expect(next.u.width).toBe(12);
    expect(next.u.height).toBe(10);
    expect(next.v.data).not.toBe(state.v.data);
  });
});
