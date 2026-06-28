import { describe, it, expect } from "vitest";
import {
  generate,
  sample,
  labelComponents,
  floodFillRandom,
  floodFillGradient,
  makeTile,
  tileSampler,
  shape,
  dots,
} from "../src/index.js";

const SIZE = 32;

describe("tiling: connected components", () => {
  it("labels two separate blobs as 2 components", () => {
    // two discs far apart
    const a = dots({ scale: 1, radius: 0.12, softness: 0.001 });
    const m = generate(SIZE, SIZE, 1, (u, v) => {
      const left = Math.hypot(u - 0.25, v - 0.5) < 0.12 ? 1 : 0;
      const right = Math.hypot(u - 0.75, v - 0.5) < 0.12 ? 1 : 0;
      return Math.max(left, right);
    });
    const { count } = labelComponents(m, { threshold: 0.5 });
    expect(count).toBe(2);
  });

  it("single blob = 1 component", () => {
    const m = generate(SIZE, SIZE, 1, (u, v) =>
      Math.hypot(u - 0.5, v - 0.5) < 0.3 ? 1 : 0,
    );
    expect(labelComponents(m).count).toBe(1);
  });
});

describe("tiling: flood fill", () => {
  it("floodFillRandom gives each component a distinct stable value", () => {
    const m = generate(SIZE, SIZE, 1, (u, v) => {
      const left = Math.hypot(u - 0.25, v - 0.5) < 0.12 ? 1 : 0;
      const right = Math.hypot(u - 0.75, v - 0.5) < 0.12 ? 1 : 0;
      return Math.max(left, right);
    });
    const r1 = floodFillRandom(m, { seed: 3 });
    const r2 = floodFillRandom(m, { seed: 3 });
    // deterministic
    expect(sample(r1, 8, 16)).toBe(sample(r2, 8, 16));
    // left and right blobs differ
    const leftV = sample(r1, 8, 16);
    const rightV = sample(r1, 24, 16);
    expect(leftV).not.toBe(rightV);
    // background is 0
    expect(sample(r1, 0, 0)).toBe(0);
  });

  it("floodFillGradient ramps across a component", () => {
    const m = generate(SIZE, SIZE, 1, (u, v) =>
      v > 0.3 && v < 0.7 ? 1 : 0,
    );
    const g = floodFillGradient(m, { axis: "u" });
    // leftmost foreground < rightmost foreground along U
    expect(sample(g, 1, 16)).toBeLessThan(sample(g, SIZE - 2, 16));
  });
});

describe("tiling: makeTile", () => {
  it("reduces a hard edge seam (non-periodic ramp)", () => {
    // a linear ramp has a big jump between x=0 (~0) and x=last (~1)
    const ramp = generate(SIZE, SIZE, 1, (u) => u);
    const tiled = makeTile(ramp, { band: 0.3 });
    const seam = (t: typeof ramp) => {
      let d = 0;
      for (let y = 0; y < SIZE; y++) d += Math.abs(sample(t, 0, y) - sample(t, SIZE - 1, y));
      return d;
    };
    // offset-blend relocates the seam to the center, so the wrap edges become continuous
    expect(seam(tiled)).toBeLessThan(seam(ramp));
    expect(tiled.data.length).toBe(ramp.data.length);
  });
});

describe("tiling: tileSampler", () => {
  it("scatters instances and stays in [0,1]", () => {
    const disc = shape({ type: "disc", size: 0.4, softness: 0.05 });
    const t = tileSampler(SIZE, disc, { count: 4, jitter: 0.2, seed: 1 });
    let max = 0;
    let min = 1;
    for (let i = 0; i < t.data.length; i++) {
      max = Math.max(max, t.data[i]!);
      min = Math.min(min, t.data[i]!);
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(1);
    // something got drawn
    expect(max).toBeGreaterThan(0.5);
  });

  it("tileSampler is deterministic given seed", () => {
    const disc = shape({ type: "disc", size: 0.4 });
    const a = tileSampler(SIZE, disc, { count: 4, seed: 9 });
    const b = tileSampler(SIZE, disc, { count: 4, seed: 9 });
    expect(sample(a, 16, 16)).toBe(sample(b, 16, 16));
  });
});
