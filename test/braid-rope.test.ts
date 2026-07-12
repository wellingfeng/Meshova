import { describe, expect, it } from "vitest";
import {
  BRAID_ROPE_DEFAULTS,
  bounds,
  braidRopeCurveLength,
  buildBraidRopeCurves,
  buildBraidRopeMesh,
  buildBraidRopeParts,
  triangleCount,
} from "../src/index.js";

describe("braid rope", () => {
  it("builds one swept part per strand plus end bands", () => {
    const parts = buildBraidRopeParts({ strands: 3, segments: 32, endBands: true, irregularity: 0 });
    expect(parts.map((p) => p.name)).toEqual(["strand_1", "strand_2", "strand_3", "end_bands"]);
    for (const part of parts) {
      expect(part.mesh.positions.length).toBeGreaterThan(0);
      expect(triangleCount(part.mesh)).toBeGreaterThan(0);
    }
  });

  it("curves span the rope length and stay phase-separated", () => {
    const curves = buildBraidRopeCurves({ strands: 3, length: 6, segments: 48, irregularity: 0 });
    expect(curves.length).toBe(3);
    const b = bounds({ positions: curves[0]!.points, normals: curves[0]!.points, uvs: [], indices: [] });
    expect(b.max.x - b.min.x).toBeCloseTo(6, 2);
    const mid = Math.floor(curves[0]!.points.length / 2);
    const yz = curves.map((c) => `${c.points[mid]!.y.toFixed(4)}:${c.points[mid]!.z.toFixed(4)}`);
    expect(new Set(yz).size).toBe(3);
  });

  it("more turns makes strand path longer", () => {
    const low = braidRopeCurveLength({ turns: 2, segments: 80, irregularity: 0 });
    const high = braidRopeCurveLength({ turns: 6, segments: 160, irregularity: 0 });
    expect(high).toBeGreaterThan(low);
  });

  it("is deterministic for the same seed", () => {
    const a = buildBraidRopeMesh({ seed: 3, irregularity: 0.2, segments: 40 });
    const b = buildBraidRopeMesh({ seed: 3, irregularity: 0.2, segments: 40 });
    expect(a.positions).toEqual(b.positions);
  });

  it("different seeds change irregular rope curves", () => {
    const a = buildBraidRopeCurves({ seed: 3, irregularity: 0.2, segments: 20 });
    const b = buildBraidRopeCurves({ seed: 4, irregularity: 0.2, segments: 20 });
    expect(a[0]!.points).not.toEqual(b[0]!.points);
  });

  it("keeps defaults in a practical range", () => {
    expect(BRAID_ROPE_DEFAULTS.strands).toBe(3);
    expect(BRAID_ROPE_DEFAULTS.strandRadius).toBeLessThan(BRAID_ROPE_DEFAULTS.braidRadius);
  });
});
