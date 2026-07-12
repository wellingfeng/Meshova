import { describe, it, expect } from "vitest";
import {
  buildVineParts,
  buildVineStemMesh,
  growVineStrands,
  buildVinePreset,
  VINE_PRESETS,
  cylinderSurface,
  wallSurface,
  meshSurface,
  box,
  icosphere,
  growClimbingStrands,
  buildClimbingVineParts,
  buildIvyRuinsParts,
  length,
  type Mesh,
} from "../src/index.js";

function assertValid(m: Mesh) {
  expect(m.normals.length).toBe(m.positions.length);
  expect(m.uvs.length).toBe(m.positions.length);
  expect(m.indices.length % 3).toBe(0);
  expect(m.positions.length).toBeGreaterThan(0);
  for (const idx of m.indices) {
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(m.positions.length);
  }
  for (const n of m.normals) expect(length(n)).toBeCloseTo(1, 3);
}

describe("vine generator", () => {
  it("produces a valid stem mesh", () => {
    assertValid(buildVineStemMesh({ seed: 5 }));
  });

  it("is deterministic: same seed => identical geometry", () => {
    const a = buildVineStemMesh({ seed: 9, mode: "hanging" });
    const b = buildVineStemMesh({ seed: 9, mode: "hanging" });
    expect(b.positions).toEqual(a.positions);
    expect(b.indices).toEqual(a.indices);
  });

  it("different seeds produce different geometry", () => {
    const a = buildVineStemMesh({ seed: 1 });
    const b = buildVineStemMesh({ seed: 2 });
    expect(b.positions).not.toEqual(a.positions);
  });

  it("builds stem + leaf parts, both valid", () => {
    const parts = buildVineParts({ seed: 5, leafDensity: 6 });
    expect(parts.length).toBe(2);
    expect(parts[0]!.name).toBe("stem");
    expect(parts[1]!.name).toBe("leaves");
    for (const p of parts) assertValid(p.mesh);
  });

  it("leafDensity 0 yields a bare stem (no leaf part)", () => {
    const parts = buildVineParts({ seed: 5, leafDensity: 0 });
    expect(parts.length).toBe(1);
    expect(parts[0]!.name).toBe("stem");
  });

  it("branches increase strand count", () => {
    const few = growVineStrands({ seed: 7, branches: 0 });
    const many = growVineStrands({ seed: 7, branches: 4, branchDepth: 2 });
    expect(few.length).toBe(1); // only the main stem
    expect(many.length).toBeGreaterThan(few.length);
  });

  it("hanging vines droop below their root; climbing rise above it", () => {
    const hang = buildVineStemMesh({ seed: 4, mode: "hanging", branches: 0 });
    const climb = buildVineStemMesh({ seed: 4, mode: "climbing", branches: 0 });
    const minY = (m: Mesh) => Math.min(...m.positions.map((p) => p.y));
    const maxY = (m: Mesh) => Math.max(...m.positions.map((p) => p.y));
    expect(minY(hang)).toBeLessThan(0); // drooped below origin
    expect(maxY(climb)).toBeGreaterThan(0.5); // climbed upward
  });

  it("every named preset builds valid parts", () => {
    for (const name of Object.keys(VINE_PRESETS)) {
      const parts = buildVinePreset(name);
      expect(parts.length).toBeGreaterThan(0);
      for (const p of parts) assertValid(p.mesh);
    }
  });
});

describe("surface-climbing ivy", () => {
  it("cylinder-climbing strands stay glued to the column radius", () => {
    const R = 0.5;
    const surf = cylinderSurface({ center: { x: 0, y: 0, z: 0 }, radius: R, height: 3 });
    const strands = growClimbingStrands(surf, { seed: 5, strands: 3, branches: 0, offset: 0 });
    expect(strands.length).toBe(3);
    // every centerline point should be ~R from the axis (glued to the surface)
    for (const s of strands) {
      for (const p of s.curve.points) {
        const r = Math.hypot(p.x, p.z);
        expect(Math.abs(r - R)).toBeLessThan(0.12);
      }
    }
  });

  it("climbing strands actually gain height (climb upward)", () => {
    const surf = cylinderSurface({ center: { x: 0, y: 0, z: 0 }, radius: 0.5, height: 3 });
    const strands = growClimbingStrands(surf, { seed: 9, strands: 2, branches: 0 });
    for (const s of strands) {
      const ys = s.curve.points.map((p) => p.y);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(1.0);
    }
  });

  it("cylinder climbers wind around the column (not a straight vertical line)", () => {
    const surf = cylinderSurface({ center: { x: 0, y: 0, z: 0 }, radius: 0.5, height: 3 });
    const [s] = growClimbingStrands(surf, { seed: 3, strands: 1, branches: 0, weave: 1 });
    const angles = s!.curve.points.map((p) => Math.atan2(p.z, p.x));
    // total unwrapped angular travel should be well beyond zero
    let travel = 0;
    for (let i = 1; i < angles.length; i++) {
      let d = angles[i]! - angles[i - 1]!;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      travel += Math.abs(d);
    }
    expect(travel).toBeGreaterThan(0.8);
  });

  it("wall climbers stay on the wall plane", () => {
    const surf = wallSurface({
      origin: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      up: { x: 0, y: 1, z: 0 },
      width: 4,
      height: 3,
    });
    const strands = growClimbingStrands(surf, { seed: 7, strands: 3, branches: 0, offset: 0 });
    for (const s of strands) {
      for (const p of s.curve.points) expect(Math.abs(p.z)).toBeLessThan(0.08);
    }
  });

  it("buildClimbingVineParts + buildIvyRuinsParts produce valid meshes", () => {
    const surf = cylinderSurface({ center: { x: 0, y: 0, z: 0 }, radius: 0.4, height: 2.5 });
    for (const p of buildClimbingVineParts(surf, { seed: 4 })) assertValid(p.mesh);
    for (const p of buildIvyRuinsParts({ seed: 7, columns: 3 })) assertValid(p.mesh);
  });

  it("ivy ruins is deterministic", () => {
    const a = buildIvyRuinsParts({ seed: 7 });
    const b = buildIvyRuinsParts({ seed: 7 });
    expect(b[0]!.mesh.positions).toEqual(a[0]!.mesh.positions);
    expect(b[1]!.mesh.positions).toEqual(a[1]!.mesh.positions);
  });
});

describe("meshSurface — climb any mesh", () => {
  it("projects points onto an arbitrary mesh with a valid basis", () => {
    const surf = meshSurface(icosphere(1, 2));
    const p = surf.project({ x: 3, y: 0.5, z: 0 });
    // snapped roughly onto the unit sphere surface
    const r = Math.hypot(p.point.x, p.point.y, p.point.z);
    expect(r).toBeGreaterThan(0.7);
    expect(r).toBeLessThan(1.4);
    // basis vectors are finite and roughly unit
    expect(Number.isFinite(p.up.x + p.up.y + p.up.z)).toBe(true);
    expect(Number.isFinite(p.around.x + p.around.y + p.around.z)).toBe(true);
  });

  it("grows deterministic climbing strands on a box", () => {
    const surf = meshSurface(box(2, 3, 2));
    const a = buildClimbingVineParts(surf, { seed: 4, strands: 3 });
    const b = buildClimbingVineParts(surf, { seed: 4, strands: 3 });
    expect(a[0]!.mesh.positions.length).toBeGreaterThan(0);
    expect(b[0]!.mesh.positions).toEqual(a[0]!.mesh.positions);
  });

  it("exposes a finite topY from the mesh bounds", () => {
    const surf = meshSurface(box(1, 5, 1));
    expect(Number.isFinite(surf.topY)).toBe(true);
    expect(surf.topY).toBeGreaterThan(2);
  });
});
