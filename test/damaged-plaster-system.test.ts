import { describe, expect, it } from "vitest";
import {
  damagedPlasterSystem,
  damagedPlasterSystemResult,
  validateMaterial,
} from "../src/index.js";

describe("damaged plaster system", () => {
  it("builds deterministic valid PBR channels", () => {
    const params = { seed: 157, damage: 0.64, cracks: 0.72, edgeBreakup: 0.55, dirt: 0.4 };
    const first = damagedPlasterSystemResult(64, params);
    const second = damagedPlasterSystemResult(64, params);

    expect(Array.from(first.material.baseColor.data)).toEqual(Array.from(second.material.baseColor.data));
    expect(Array.from(first.masks.crack.data)).toEqual(Array.from(second.masks.crack.data));
    expect(validateMaterial(first.material)).toEqual([]);
  });

  it("emits plaster, brick, mortar, crack, chipped-edge, and dirt masks", () => {
    const result = damagedPlasterSystemResult(128, { damage: 0.72, cracks: 0.84, dirt: 0.8 });

    expect(maximum(result.masks.plaster.data)).toBeGreaterThan(0.95);
    expect(maximum(result.masks.exposedBrick.data)).toBeGreaterThan(0.4);
    expect(maximum(result.masks.brick.data)).toBeGreaterThan(0.3);
    expect(maximum(result.masks.mortar.data)).toBeGreaterThan(0.2);
    expect(maximum(result.masks.crack.data)).toBeGreaterThan(0.3);
    expect(maximum(result.masks.chippedEdge.data)).toBeGreaterThan(0.05);
    expect(maximum(result.masks.dirt.data)).toBeGreaterThan(0.05);
  });

  it("damage and crack controls change their target coverage", () => {
    const clean = damagedPlasterSystemResult(96, { seed: 13, damage: 0, cracks: 0, dirt: 0 });
    const damaged = damagedPlasterSystemResult(96, { seed: 13, damage: 1, cracks: 1, dirt: 0 });

    expect(sum(clean.masks.exposedBrick.data)).toBe(0);
    expect(sum(clean.masks.crack.data)).toBe(0);
    expect(sum(damaged.masks.exposedBrick.data)).toBeGreaterThan(100);
    expect(sum(damaged.masks.crack.data)).toBeGreaterThan(1);
  });

  it("brick layout controls change mortar topology", () => {
    const coarse = damagedPlasterSystemResult(96, { seed: 19, damage: 1, brickColumns: 3, brickRows: 6 });
    const fine = damagedPlasterSystemResult(96, { seed: 19, damage: 1, brickColumns: 12, brickRows: 24 });

    expect(Array.from(coarse.masks.mortar.data)).not.toEqual(Array.from(fine.masks.mortar.data));
  });

  it("rejects invalid resolution", () => {
    expect(() => damagedPlasterSystem(15)).toThrow(/integer >= 16/);
  });
});

function maximum(values: Float32Array): number {
  let result = -Infinity;
  for (const value of values) result = Math.max(result, value);
  return result;
}

function sum(values: Float32Array): number {
  let result = 0;
  for (const value of values) result += value;
  return result;
}
