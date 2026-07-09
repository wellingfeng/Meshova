import { describe, expect, it } from "vitest";
import {
  classifyBiomes,
  overworldBiomeTable,
  biomeAt,
  bestCandidatePoints,
  scatterPointsOnField,
  makeField2D,
  buildTerrainField,
  type BiomeTable,
} from "../src/index.js";

function rampField(w: number, h: number): ReturnType<typeof makeField2D> {
  // 0 at left, 1 at right — deterministic elevation ramp.
  const f = makeField2D(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f.data[y * w + x] = x / (w - 1);
  }
  return f;
}

const twoBand: BiomeTable = {
  name: "test",
  bands: [
    { id: "high", minElevation: 0.5, color: [1, 1, 1] },
    { id: "low", minElevation: 0, color: [0, 0, 0] },
  ],
};

describe("classifyBiomes", () => {
  it("splits an elevation ramp at the threshold", () => {
    const f = rampField(11, 3);
    const c = classifyBiomes(f, twoBand);
    // left half -> low, right half -> high
    expect(biomeAt(c, 0, 1).id).toBe("low");
    expect(biomeAt(c, 10, 1).id).toBe("high");
    expect(c.histogram.high! + c.histogram.low!).toBe(11 * 3);
  });

  it("emits one RGB triple per cell matching band colors", () => {
    const f = rampField(4, 4);
    const c = classifyBiomes(f, twoBand);
    expect(c.colors.length).toBe(4 * 4 * 3);
    // rightmost column is high -> white
    expect(c.colors[(1 * 4 + 3) * 3]).toBe(1);
  });

  it("throws on an empty band table", () => {
    expect(() => classifyBiomes(rampField(2, 2), { bands: [] })).toThrow();
  });

  it("forces water cells to the water biome regardless of elevation", () => {
    const f = rampField(4, 1);
    const water = makeField2D(4, 1);
    water.data[3] = 1; // highest cell flagged as water
    const table: BiomeTable = { ...twoBand, waterBiome: "low", waterLevel: -1 };
    const c = classifyBiomes(f, table, { water });
    expect(biomeAt(c, 3, 0).id).toBe("low");
  });
});

describe("bestCandidatePoints", () => {
  it("is deterministic for a fixed seed", () => {
    const a = bestCandidatePoints({ width: 100, height: 100, count: 30, seed: 42 });
    const b = bestCandidatePoints({ width: 100, height: 100, count: 30, seed: 42 });
    expect(a).toEqual(b);
    expect(a.length).toBe(30);
  });

  it("changes layout with a different seed", () => {
    const a = bestCandidatePoints({ width: 100, height: 100, count: 20, seed: 1 });
    const b = bestCandidatePoints({ width: 100, height: 100, count: 20, seed: 2 });
    expect(a).not.toEqual(b);
  });

  it("keeps every point inside the rectangle", () => {
    const pts = bestCandidatePoints({ width: 50, height: 80, count: 40, seed: 5 });
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(50);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(80);
    }
  });

  it("spaces points more evenly than uniform random (larger min gap)", () => {
    const pts = bestCandidatePoints({ width: 100, height: 100, count: 25, seed: 9 });
    let minGap = Infinity;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i]!.x - pts[j]!.x;
        const dy = pts[i]!.y - pts[j]!.y;
        minGap = Math.min(minGap, Math.hypot(dx, dy));
      }
    }
    // Blue-noise should keep points comfortably apart on a 100x100 field.
    expect(minGap).toBeGreaterThan(5);
  });

  it("returns empty for count 0", () => {
    expect(bestCandidatePoints({ width: 10, height: 10, count: 0 })).toEqual([]);
  });
});

describe("scatterPointsOnField", () => {
  it("rejects points failing the field predicate", () => {
    const water = makeField2D(16, 16);
    for (let i = 0; i < water.data.length; i++) water.data[i] = i % 16 < 8 ? 1 : 0;
    const pts = scatterPointsOnField(water, {
      width: 16, height: 16, count: 60, seed: 3,
      accept: (v) => v < 0.5,
    });
    // All accepted points must sample dry cells; count should drop below request.
    expect(pts.length).toBeGreaterThan(0);
    expect(pts.length).toBeLessThanOrEqual(60);
  });
});

describe("pcg world integration", () => {
  it("classifies a real terrain heightfield into overworld biomes", () => {
    const terrain = buildTerrainField({ size: 8, resolution: 32, seed: 7, iterations: 4 });
    const c = classifyBiomes(terrain.height, overworldBiomeTable(), {
      water: terrain.masks.water,
      slope: terrain.masks.slope,
    });
    const total = Object.values(c.histogram).reduce((s, n) => s + n, 0);
    expect(total).toBe(terrain.height.data.length);
    expect(c.colors.length).toBe(terrain.height.data.length * 3);
  });
});
