import { describe, it, expect } from "vitest";
import {
  roadRibbon,
  roadCurbs,
  roadCenterLine,
  roadLaneLines,
  roadEdgeLines,
  roadsidePlacements,
  roadLightPoles,
  roadNoiseBarrier,
  roadNoiseBarrierFrame,
  polyline,
  bezier,
  bounds,
  triangleCount,
  vertexCount,
} from "../src/geometry/index.js";
import { vec3 } from "../src/math/vec3.js";

const straight = polyline([vec3(0, 0, -10), vec3(0, 0, 10)]);

describe("roadRibbon", () => {
  it("builds a non-empty mesh from a straight centerline", () => {
    const m = roadRibbon(straight, { halfWidth: 3, sampleDistance: 2 });
    expect(vertexCount(m)).toBeGreaterThan(0);
    expect(triangleCount(m)).toBeGreaterThan(0);
    expect(m.indices.length % 3).toBe(0);
  });

  it("respects half-width in the mesh bounds", () => {
    const m = roadRibbon(straight, { halfWidth: 4, sampleDistance: 2 });
    const b = bounds(m);
    // Road runs along Z, so X extent is the full width (~2 * halfWidth).
    expect(b.max.x - b.min.x).toBeCloseTo(8, 1);
    expect(b.max.z - b.min.z).toBeCloseTo(20, 1);
  });

  it("is deterministic: same input yields identical vertex count", () => {
    const a = roadRibbon(straight, { halfWidth: 3, sampleDistance: 1 });
    const c = roadRibbon(straight, { halfWidth: 3, sampleDistance: 1 });
    expect(vertexCount(a)).toBe(vertexCount(c));
    expect(a.indices).toEqual(c.indices);
    expect(a.positions).toEqual(c.positions);
  });

  it("adds more geometry across the width with widthSubdivisions", () => {
    const coarse = roadRibbon(straight, { halfWidth: 3, sampleDistance: 2, widthSubdivisions: 1 });
    const fine = roadRibbon(straight, { halfWidth: 3, sampleDistance: 2, widthSubdivisions: 6 });
    expect(vertexCount(fine)).toBeGreaterThan(vertexCount(coarse));
  });

  it("inserts extra rings on curves when adaptive curvature is on", () => {
    const curve = bezier(vec3(0, 0, 0), vec3(10, 0, 0), vec3(10, 0, 10), vec3(20, 0, 10), 4);
    const adaptive = roadRibbon(curve, { halfWidth: 2, sampleDistance: 5, adaptiveCurvature: true, curvatureThresholdDeg: 4 });
    const flat = roadRibbon(curve, { halfWidth: 2, sampleDistance: 5, adaptiveCurvature: false });
    expect(vertexCount(adaptive)).toBeGreaterThanOrEqual(vertexCount(flat));
  });

  it("applies vertical offset to lift the surface", () => {
    const low = roadRibbon(straight, { halfWidth: 2, sampleDistance: 4, verticalOffset: 0 });
    const high = roadRibbon(straight, { halfWidth: 2, sampleDistance: 4, verticalOffset: 1 });
    expect(bounds(high).min.y - bounds(low).min.y).toBeCloseTo(1, 3);
  });
});

describe("roadCurbs", () => {
  it("builds curb geometry taller than the flat road", () => {
    const curbs = roadCurbs(straight, { halfWidth: 3, sampleDistance: 2, curbHeight: 0.3 });
    expect(triangleCount(curbs)).toBeGreaterThan(0);
    const b = bounds(curbs);
    expect(b.max.y - b.min.y).toBeCloseTo(0.3, 2);
  });
});

describe("roadCenterLine", () => {
  it("builds a thin strip narrower than the road", () => {
    const line = roadCenterLine(straight, { halfWidth: 3, sampleDistance: 2, lineWidth: 0.2 });
    const b = bounds(line);
    expect(b.max.x - b.min.x).toBeCloseTo(0.2, 2);
    expect(b.min.y).toBeGreaterThanOrEqual(0.04);
  });
});

describe("roadLaneLines", () => {
  it("builds dividers for a multi-lane road, skipping the center", () => {
    const m = roadLaneLines(straight, { halfWidth: 4, lanes: 4, dashed: true, skipCenter: true });
    expect(triangleCount(m)).toBeGreaterThan(0);
    // 4 lanes -> 3 internal dividers, center skipped -> 2 dashed lines within +/-halfWidth.
    const b = bounds(m);
    expect(b.max.x).toBeLessThanOrEqual(4);
    expect(b.min.x).toBeGreaterThanOrEqual(-4);
  });

  it("keeps solid lines on the sampled path while dashed lines leave gaps", () => {
    const dashed = roadLaneLines(straight, { halfWidth: 4, lanes: 2, dashed: true, skipCenter: false, dashLength: 1, gapLength: 3 });
    const solid = roadLaneLines(straight, { halfWidth: 4, lanes: 2, dashed: false, skipCenter: false });
    expect(triangleCount(solid)).toBeGreaterThan(2);
    expect(triangleCount(dashed)).toBeGreaterThan(0);
    expect(triangleCount(dashed)).toBeLessThan(triangleCount(solid));
  });

  it("is deterministic", () => {
    const a = roadLaneLines(straight, { halfWidth: 4, lanes: 4, dashed: true });
    const b = roadLaneLines(straight, { halfWidth: 4, lanes: 4, dashed: true });
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });

  it("keeps paint visibly separated from the road surface", () => {
    const markings = roadLaneLines(straight, { halfWidth: 4, lanes: 4, verticalOffset: 0.02 });
    expect(bounds(markings).min.y).toBeGreaterThanOrEqual(0.06);
  });
});

describe("roadEdgeLines", () => {
  it("builds two solid lines near the outer edges", () => {
    const m = roadEdgeLines(straight, { halfWidth: 4, lineWidth: 0.1, edgeInset: 0.2 });
    expect(triangleCount(m)).toBeGreaterThan(0);
    const b = bounds(m);
    // Lines sit at +/-(halfWidth - inset) = +/-3.8, +/- half line width.
    expect(b.max.x).toBeCloseTo(3.85, 1);
    expect(b.min.x).toBeCloseTo(-3.85, 1);
    expect(b.min.y).toBeGreaterThanOrEqual(0.04);
  });
});

describe("roadsidePlacements", () => {
  it("places deterministic points beyond both road edges", () => {
    const options = { spacing: 4, offsetMin: 5, offsetMax: 7, seed: 42, distanceJitter: 0 };
    const a = roadsidePlacements(straight, options);
    const b = roadsidePlacements(straight, options);
    expect(a).toEqual(b);
    expect(a.length).toBe(10);
    expect(a.some((placement) => placement.side === "left" && placement.position.x >= 5)).toBe(true);
    expect(a.some((placement) => placement.side === "right" && placement.position.x <= -5)).toBe(true);
  });

  it("supports density, one-sided placement, and exclusion zones", () => {
    expect(roadsidePlacements(straight, { density: 0 })).toEqual([]);
    const placements = roadsidePlacements(straight, {
      spacing: 2,
      side: "left",
      offsetMin: 4,
      offsetMax: 4,
      distanceJitter: 0,
      exclusionZones: [{ distance: 10, radius: 3 }],
    });
    expect(placements.every((placement) => placement.side === "left" && placement.position.x === 4)).toBe(true);
    expect(placements.every((placement) => Math.abs(placement.distance - 10) >= 3)).toBe(true);
  });

  it("keeps generated scale within the requested range", () => {
    const placements = roadsidePlacements(straight, { spacing: 2, scaleMin: 0.6, scaleMax: 1.4, seed: 7 });
    expect(placements.every((placement) => placement.scale >= 0.6 && placement.scale < 1.4)).toBe(true);
  });
});

describe("roadLightPoles", () => {
  it("stamps masts along one edge, rising to the pole height", () => {
    const m = roadLightPoles(straight, { halfWidth: 4, side: 1, spacing: 5, poleHeight: 6, lateral: 5 });
    expect(triangleCount(m)).toBeGreaterThan(0);
    const b = bounds(m);
    // 20m run at 5m spacing -> multiple poles; side +1 rides the road's right
    // vector, which is -X for a +Z-heading straight.
    expect(b.max.y).toBeCloseTo(6, 0);
    expect(b.min.x).toBeLessThan(-4);
  });

  it("mirrors to the opposite edge for side -1", () => {
    const m = roadLightPoles(straight, { halfWidth: 4, side: -1, spacing: 5, lateral: 5 });
    const b = bounds(m);
    expect(b.max.x).toBeGreaterThan(4);
  });

  it("is deterministic", () => {
    const a = roadLightPoles(straight, { halfWidth: 4, side: 1, spacing: 4 });
    const b = roadLightPoles(straight, { halfWidth: 4, side: 1, spacing: 4 });
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });
});

describe("roadNoiseBarrier", () => {
  it("builds a tall wall rising to the requested height on one edge", () => {
    const m = roadNoiseBarrier(straight, { halfWidth: 4, side: 1, lateral: 5, wallHeight: 2.6, baseHeight: 0.4 });
    expect(triangleCount(m)).toBeGreaterThan(0);
    const b = bounds(m);
    expect(b.max.y).toBeCloseTo(2.6, 1);
    // side +1 rides the road's right vector (-X for a +Z-heading straight).
    expect(b.min.x).toBeLessThan(-4);
    // thin slab: X extent far smaller than the run length.
    expect(b.max.x - b.min.x).toBeLessThan(1);
  });

  it("mirrors to the opposite edge for side -1", () => {
    const m = roadNoiseBarrier(straight, { halfWidth: 4, side: -1, lateral: 5, wallHeight: 2.6 });
    const b = bounds(m);
    expect(b.max.x).toBeGreaterThan(4);
  });

  it("is deterministic", () => {
    const a = roadNoiseBarrier(straight, { halfWidth: 4, side: 1, lateral: 5 });
    const b = roadNoiseBarrier(straight, { halfWidth: 4, side: 1, lateral: 5 });
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });
});

describe("roadNoiseBarrierFrame", () => {
  it("stamps posts and rails within the wall height band", () => {
    const m = roadNoiseBarrierFrame(straight, { halfWidth: 4, side: 1, lateral: 5, wallHeight: 2.6, baseHeight: 0.4, postSpacing: 5 });
    expect(triangleCount(m)).toBeGreaterThan(0);
    const b = bounds(m);
    expect(b.max.y).toBeLessThanOrEqual(2.7);
    expect(b.min.y).toBeGreaterThanOrEqual(0.3);
  });

  it("is deterministic", () => {
    const a = roadNoiseBarrierFrame(straight, { halfWidth: 4, side: 1, lateral: 5, postSpacing: 4 });
    const b = roadNoiseBarrierFrame(straight, { halfWidth: 4, side: 1, lateral: 5, postSpacing: 4 });
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });
});
