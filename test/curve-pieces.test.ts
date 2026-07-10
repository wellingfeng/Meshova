import { describe, it, expect } from "vitest";
import { polyline } from "../src/geometry/curve.js";
import {
  segmentCurve,
  segmentMatrix,
  layoutPiecesOnCurve,
} from "../src/geometry/curve-pieces.js";
import { box } from "../src/geometry/primitives.js";
import { vec3, transformPoint } from "../src/index.js";

describe("segmentCurve", () => {
  it("splits a straight curve into fixed-count segments with rest lengths", () => {
    const c = polyline([vec3(0, 0, 0), vec3(0, 0, 10)]);
    const segs = segmentCurve(c, { count: 6 }); // 5 segments of length 2
    expect(segs.length).toBe(5);
    for (const s of segs) expect(s.restLength).toBeCloseTo(2, 5);
    // tangent points along +Z
    expect(segs[0]!.tangent.z).toBeCloseTo(1, 6);
  });

  it("classifies segments into buckets by ascending thresholds (Rail rule)", () => {
    // one 0.5m, one 2m, one 5m segment via explicit points
    const c = polyline([
      vec3(0, 0, 0),
      vec3(0, 0, 0.5),
      vec3(0, 0, 2.5),
      vec3(0, 0, 7.5),
    ]);
    const segs = segmentCurve(c, { resample: false, bucketThresholds: [1, 3] });
    // Rail: <1 => small(0), 1..3 => medium(1), >3 => large(2)
    const buckets = segs.map((s) => s.bucket);
    expect(buckets).toEqual([0, 1, 2]);
  });
});

describe("segmentMatrix", () => {
  it("stretches local +Z to fill the segment (Rail scale.z = restLength/pieceLen)", () => {
    const c = polyline([vec3(0, 0, 0), vec3(0, 0, 4)]);
    const seg = segmentCurve(c, { count: 2 })[0]!; // one 4m segment
    const pieceLen = 2;
    const mat = segmentMatrix(seg, seg.restLength / pieceLen);
    // a point at local +Z (0.5) end of a unit piece should map to +Z stretched
    const tip = transformPoint(mat, vec3(0, 0, 1));
    const base = transformPoint(mat, vec3(0, 0, -1));
    // stretch = 4/2 = 2, so local Z span of 2 becomes 4 along world Z
    expect(tip.z - base.z).toBeCloseTo(4, 5);
  });
});

describe("layoutPiecesOnCurve", () => {
  it("fills a curve with stretched pieces (no gaps, deterministic)", () => {
    const c = polyline([vec3(0, 0, 0), vec3(0, 0, 12)]);
    const piece = box(0.5, 0.2, 1); // spans 1 along Z
    const m1 = layoutPiecesOnCurve(c, { count: 7, pieces: [piece], pieceLengths: [1] });
    const m2 = layoutPiecesOnCurve(c, { count: 7, pieces: [piece], pieceLengths: [1] });
    expect(m1.positions.length).toBeGreaterThan(0);
    expect(m1.positions).toEqual(m2.positions); // determinism
    // 6 segments -> 6 boxes -> 6*24 verts
    expect(m1.positions.length).toBe(6 * 24);
  });

  it("picks per-bucket pieces by segment length", () => {
    const c = polyline([
      vec3(0, 0, 0),
      vec3(0, 0, 0.5),
      vec3(0, 0, 2.5),
      vec3(0, 0, 7.5),
    ]);
    const small = box(0.2, 0.2, 1);
    const med = box(0.4, 0.4, 1);
    const large = box(0.6, 0.6, 1);
    const mesh = layoutPiecesOnCurve(c, {
      resample: false,
      bucketThresholds: [1, 3],
      pieces: [small, med, large],
      pieceLengths: [1, 1, 1],
    });
    expect(mesh.positions.length).toBe(3 * 24);
  });
});
