import { describe, expect, it } from "vitest";
import { bounds, buildRiceField } from "../src/index.js";

describe("procedural rice field", () => {
  it("builds deterministic semantic paddies", () => {
    const params = { columns: 4, rows: 3, riceDensity: 4, palmCount: 3, seed: 77 };
    const first = buildRiceField(params);
    const second = buildRiceField(params);
    expect(first).toEqual(second);
    expect(first.summary.plots).toBeGreaterThan(5);
    expect(first.summary.riceClumps).toBe(first.summary.plots * 16);
    expect(first.summary.matureClumps).toBeGreaterThan(0);
    expect(first.summary.palms).toBe(3);
    expect(first.parts.map((part) => part.label)).toEqual(expect.arrayContaining([
      "水田泥底",
      "田埂",
      "稻田水面",
      "青绿稻株",
      "成熟稻株",
      "稻穗",
      "椰树树干",
      "椰树冠叶",
    ]));
    expect(Math.max(...first.parts.map((part) => bounds(part.mesh).max.y))).toBeGreaterThan(4);
  });

  it("clamps authoring parameters to safe limits", () => {
    const field = buildRiceField({ columns: 1, rows: 20, riceDensity: 1, palmCount: -4, seed: 5 });
    expect(field.summary.plots).toBeGreaterThan(0);
    expect(field.summary.riceClumps).toBe(field.summary.plots * 4);
    expect(field.summary.palms).toBe(0);
  });
});
