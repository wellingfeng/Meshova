import { describe, expect, it } from "vitest";
import { ShallowWaterGrid } from "../src/simulation/shallow-water.js";

describe("ShallowWaterGrid", () => {
  it("preserves water volume in a closed flat basin", () => {
    const water = new ShallowWaterGrid({ width: 24, height: 20, cellSize: 0.5 });
    water.setBed(() => 0);
    water.fillToSurface(1, (x, y) => x > 5 && x < 18 && y > 4 && y < 15);
    const initialVolume = water.totalVolume();

    for (let step = 0; step < 80; step++) water.step(1 / 120);

    expect(water.totalVolume()).toBeCloseTo(initialVolume, 4);
    expect(water.maxWaterDepth()).toBeGreaterThan(0);
  });

  it("adds the same deterministic volume from a source", () => {
    const makeGrid = () => {
      const water = new ShallowWaterGrid({ width: 18, height: 18 });
      water.setBed((x) => x === 9 ? 2 : 0);
      return water;
    };
    const first = makeGrid();
    const second = makeGrid();
    const source = { x: 5, y: 9, radius: 3, rate: 0.8 };

    for (let step = 0; step < 30; step++) {
      first.step(1 / 60, [source]);
      second.step(1 / 60, [source]);
    }

    expect(first.totalVolume()).toBeGreaterThan(0);
    expect(Array.from(first.depth)).toEqual(Array.from(second.depth));
    expect(Array.from(first.velocityX)).toEqual(Array.from(second.velocityX));
  });

  it("keeps water behind a barrier higher than its surface", () => {
    const water = new ShallowWaterGrid({ width: 30, height: 14, friction: 0.35 });
    water.setBed((x) => x === 15 ? 3 : 0);
    water.fillToSurface(1.2, (x) => x < 15);

    for (let step = 0; step < 240; step++) water.step(1 / 120);

    let leakedDepth = 0;
    for (let y = 1; y < water.height - 1; y++) {
      for (let x = 16; x < water.width - 1; x++) leakedDepth += water.depth[y * water.width + x]!;
    }
    expect(leakedDepth).toBeLessThan(1e-5);
  });
});
