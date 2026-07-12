import { describe, it, expect } from "vitest";
import {
  fbmHeightfield,
  stampHeightfield,
  thermalErode,
  hydraulicErode,
  flattenUnderCurve,
  heightfieldToMesh,
  sampleHeight,
  drapeCurveToHeightfield,
  polyline,
  vec3,
  bounds,
  type Mesh,
} from "../src/index.js";

function assertValid(m: Mesh) {
  expect(m.positions.length).toBeGreaterThan(0);
  expect(m.indices.length % 3).toBe(0);
  for (const i of m.indices) {
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(m.positions.length);
  }
  for (const p of m.positions) {
    expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
  }
}

function maxSlope(hf: ReturnType<typeof fbmHeightfield>): number {
  const { cols, rows, height } = hf;
  let m = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols - 1; x++) {
      m = Math.max(m, Math.abs(height[y * cols + x + 1]! - height[y * cols + x]!));
    }
  }
  return m;
}

describe("fbmHeightfield", () => {
  it("builds a grid of the requested size with bounded heights", () => {
    const hf = fbmHeightfield({ cols: 32, rows: 32, size: 100, amplitude: 20, seed: 1 });
    expect(hf.height.length).toBe(32 * 32);
    for (const h of hf.height) {
      expect(h).toBeGreaterThanOrEqual(-1);
      expect(h).toBeLessThanOrEqual(21);
    }
  });

  it("is deterministic per seed", () => {
    const a = fbmHeightfield({ cols: 16, rows: 16, seed: 7 });
    const b = fbmHeightfield({ cols: 16, rows: 16, seed: 7 });
    for (let i = 0; i < a.height.length; i++) expect(a.height[i]).toBe(b.height[i]);
  });

  it("different seeds differ", () => {
    const a = fbmHeightfield({ cols: 16, rows: 16, seed: 1 });
    const b = fbmHeightfield({ cols: 16, rows: 16, seed: 2 });
    let diff = 0;
    for (let i = 0; i < a.height.length; i++) if (a.height[i] !== b.height[i]) diff++;
    expect(diff).toBeGreaterThan(0);
  });
});

describe("stampHeightfield", () => {
  it("a dome stamp raises the centre", () => {
    const flat = fbmHeightfield({ cols: 33, rows: 33, size: 100, amplitude: 0 });
    const stamped = stampHeightfield(flat, [{ x: 0, z: 0, radius: 30, height: 15, shape: "dome" }]);
    // Centre cell (index of middle) should be near +15.
    const mid = 16 * 33 + 16;
    expect(stamped.height[mid]!).toBeGreaterThan(14);
    // Corner outside radius stays flat.
    expect(stamped.height[0]!).toBeCloseTo(0, 5);
  });

  it("a crater sinks the middle and raises a rim", () => {
    const flat = fbmHeightfield({ cols: 41, rows: 41, size: 100, amplitude: 0 });
    const c = stampHeightfield(flat, [{ x: 0, z: 0, radius: 40, height: 10, shape: "crater" }]);
    const mid = 20 * 41 + 20;
    expect(c.height[mid]!).toBeLessThan(0); // bowl dips below zero
  });

  it("does not mutate the input", () => {
    const flat = fbmHeightfield({ cols: 16, rows: 16, amplitude: 0 });
    const before = Float32Array.from(flat.height);
    stampHeightfield(flat, [{ x: 0, z: 0, radius: 20, height: 5 }]);
    for (let i = 0; i < before.length; i++) expect(flat.height[i]).toBe(before[i]);
  });
});

describe("erosion", () => {
  it("thermal erosion reduces the steepest slope", () => {
    const hf = fbmHeightfield({ cols: 48, rows: 48, size: 100, amplitude: 30, ridged: 1, seed: 3 });
    const before = maxSlope(hf);
    const eroded = thermalErode(hf, { iterations: 40, talus: 0.5 });
    expect(maxSlope(eroded)).toBeLessThan(before);
    assertValid(heightfieldToMesh(eroded));
  });

  it("hydraulic erosion stays finite and bounded", () => {
    const hf = fbmHeightfield({ cols: 40, rows: 40, size: 100, amplitude: 25, seed: 5 });
    const eroded = hydraulicErode(hf, { iterations: 30 });
    for (const h of eroded.height) expect(Number.isFinite(h)).toBe(true);
    assertValid(heightfieldToMesh(eroded));
  });

  it("erosion is deterministic", () => {
    const hf = fbmHeightfield({ cols: 24, rows: 24, seed: 9 });
    const a = thermalErode(hf, { iterations: 10 });
    const b = thermalErode(hf, { iterations: 10 });
    for (let i = 0; i < a.height.length; i++) expect(a.height[i]).toBe(b.height[i]);
  });
});

describe("flattenUnderCurve", () => {
  it("presses the terrain flat along a road at road level", () => {
    const hf = fbmHeightfield({ cols: 48, rows: 48, size: 100, amplitude: 30, seed: 2 });
    // Straight road at y=5 crossing the middle along X.
    const road = polyline([vec3(-50, 5, 0), vec3(50, 5, 0)]);
    const flat = flattenUnderCurve(hf, road, { width: 6, falloff: 8 });
    // Sample right on the road line: should equal road level 5.
    expect(sampleHeight(flat, 0, 0)).toBeCloseTo(5, 1);
    expect(sampleHeight(flat, 20, 0)).toBeCloseTo(5, 1);
  });

  it("leaves distant terrain untouched", () => {
    const hf = fbmHeightfield({ cols: 48, rows: 48, size: 100, amplitude: 30, seed: 4 });
    const road = polyline([vec3(-50, 5, 0), vec3(50, 5, 0)]);
    const flat = flattenUnderCurve(hf, road, { width: 6, falloff: 8 });
    // Far edge (z ~ +45) is well outside the band+falloff.
    expect(sampleHeight(flat, 0, 45)).toBeCloseTo(sampleHeight(hf, 0, 45), 3);
  });
});

describe("heightfieldToMesh", () => {
  it("centres the mesh at XZ origin and spans the grid size", () => {
    const hf = fbmHeightfield({ cols: 16, rows: 16, size: 80, amplitude: 10 });
    const m = heightfieldToMesh(hf);
    assertValid(m);
    const b = bounds(m);
    expect(b.min.x).toBeCloseTo(-40, 3);
    expect(b.max.x).toBeCloseTo(40, 3);
  });
});

describe("drapeCurveToHeightfield", () => {
  it("projects every curve point onto bilinear terrain height", () => {
    const hf = stampHeightfield(
      fbmHeightfield({ cols: 17, rows: 17, size: 20, amplitude: 3, seed: 5 }),
      [{ x: 0, z: 0, radius: 6, height: 4, shape: "dome" }],
    );
    const curve = polyline([
      vec3(-8, 100, -7),
      vec3(-1.3, -100, 2.7),
      vec3(7.5, 0, 6.2),
    ]);
    const draped = drapeCurveToHeightfield(hf, curve, 0.35);

    for (const point of draped.points) {
      expect(point.y).toBeCloseTo(sampleHeight(hf, point.x, point.z) + 0.35, 6);
    }
  });
});
