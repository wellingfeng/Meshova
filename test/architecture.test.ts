import { describe, expect, it } from "vitest";
import {
  archway, column, pavilion, bridgeWall,
  triangleCount, vertexCount, bounds,
} from "../src/index.js";

describe("architecture generators", () => {
  it("archway builds a non-empty ring on two piers", () => {
    const m = archway({ span: 2, pierHeight: 2 });
    expect(triangleCount(m)).toBeGreaterThan(0);
    const b = bounds(m);
    // crown reaches above the springline
    expect(b.max.y).toBeGreaterThan(2);
    // opening spans roughly 2 units
    expect(b.max.x - b.min.x).toBeGreaterThan(2);
  });

  it("pointed arch is taller than a round arch of same span", () => {
    const round = bounds(archway({ span: 2, pierHeight: 2, archStyle: "round", keystone: false }));
    const pointed = bounds(archway({ span: 2, pierHeight: 2, archStyle: "pointed", keystone: false }));
    expect(pointed.max.y).toBeGreaterThan(round.max.y);
  });

  it("column respects height and adds base+capital", () => {
    const m = column({ height: 4, radius: 0.4, flutes: 16 });
    const b = bounds(m);
    expect(b.max.y - b.min.y).toBeCloseTo(4, 1);
    expect(triangleCount(m)).toBeGreaterThan(0);
  });

  it("flutes change the mesh vs a smooth shaft", () => {
    const smooth = column({ height: 4, flutes: 0 });
    const fluted = column({ height: 4, flutes: 16 });
    expect(vertexCount(fluted)).not.toBe(vertexCount(smooth));
  });

  it("pavilion places perimeter columns + roof deterministically", () => {
    const a = pavilion({ size: 3, columnsPerSide: 3, roof: "hip" });
    const b = pavilion({ size: 3, columnsPerSide: 3, roof: "hip" });
    expect(vertexCount(a)).toBe(vertexCount(b));
    expect(triangleCount(a)).toBe(triangleCount(b));
    expect(triangleCount(a)).toBeGreaterThan(0);
  });

  it("pavilion roof styles produce different geometry", () => {
    const hip = triangleCount(pavilion({ roof: "hip" }));
    const flat = triangleCount(pavilion({ roof: "flat" }));
    const dome = triangleCount(pavilion({ roof: "dome" }));
    expect(new Set([hip, flat, dome]).size).toBeGreaterThan(1);
  });

  it("bridgeWall builds baluster / crenel / solid variants", () => {
    for (const style of ["baluster", "crenel", "solid"] as const) {
      const m = bridgeWall({ length: 6, height: 1, openings: 4, style });
      expect(triangleCount(m)).toBeGreaterThan(0);
      const b = bounds(m);
      expect(b.max.x - b.min.x).toBeGreaterThan(5.5);
    }
  });
});
