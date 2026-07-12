import { describe, expect, it } from "vitest";
import { repeat, repeatTrace } from "../src/index.js";

describe("repeat feedback helper", () => {
  it("feeds previous state into each deterministic iteration", () => {
    const value = repeat(1, 4, (state, ctx) => state + ctx.index + ctx.previous);
    expect(value).toBe(27);
  });

  it("keeps trace states including the initial state", () => {
    const trace = repeatTrace({ value: 0 }, 3, (state) => ({ value: state.value + 2 }));
    expect(trace.map((state) => state.value)).toEqual([0, 2, 4, 6]);
  });
});
