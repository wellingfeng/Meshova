import { describe, expect, it } from "vitest";
import { deformByControlLattice, plane, sampleControlSurface, translateMesh, vec3 } from "../src/index.js";

describe("deformByControlLattice", () => {
  it("interpolates control-point displacement without mutating input", () => {
    const mesh = plane(2, 2, 2, 2);
    const base = [
      vec3(-1, 0, -1), vec3(0, 0, -1), vec3(1, 0, -1),
      vec3(-1, 0, 0), vec3(0, 0, 0), vec3(1, 0, 0),
      vec3(-1, 0, 1), vec3(0, 0, 1), vec3(1, 0, 1),
    ];
    const edited = base.map((point, index) => index === 4 ? vec3(0, 2, 0) : point);
    const deformed = deformByControlLattice(mesh, base, edited, { rows: 3, columns: 3 });

    expect(mesh.positions[4]!.y).toBe(0);
    expect(Math.max(...deformed.positions.map((point) => point.y))).toBeCloseTo(2);
    expect(deformed.positions.length).toBe(mesh.positions.length);
    expect(deformed.normals.length).toBe(mesh.normals.length);
  });

  it("rejects malformed lattices", () => {
    expect(() => deformByControlLattice(plane(1, 1), [], [], { rows: 3, columns: 3 }))
      .toThrow("expected 9 points");
  });

  it("uses smooth tensor-product B-spline displacement", () => {
    const mesh = plane(2, 2, 8, 8);
    const base = Array.from({ length: 4 }, (_, row) =>
      Array.from({ length: 4 }, (_, column) => vec3(-1 + column * 2 / 3, 0, -1 + row * 2 / 3)))
      .flat();
    const edited = base.map((point, index) => [5, 6, 9, 10].includes(index)
      ? vec3(point.x, 2, point.z)
      : point);
    const deformed = deformByControlLattice(mesh, base, edited, {
      rows: 4,
      columns: 4,
      interpolation: "b-spline",
      degree: 3,
    });
    const heights = deformed.positions.map((point) => point.y);
    expect(Math.max(...heights)).toBeGreaterThan(1);
    expect(heights.filter((height) => height > 0.01).length).toBeGreaterThan(16);
    expect(mesh.positions.every((point) => point.y === 0)).toBe(true);
  });

  it("uses shared bounds to deform multipart scenes coherently", () => {
    const left = translateMesh(plane(2, 2, 1, 1), vec3(-4, 0, 0));
    const right = translateMesh(plane(2, 2, 1, 1), vec3(4, 0, 0));
    const base = [
      vec3(-5, 0, -1), vec3(5, 0, -1),
      vec3(-5, 0, 1), vec3(5, 0, 1),
    ];
    const edited = base.map((point) => point.x < 0 ? vec3(point.x, 2, point.z) : point);
    const options = {
      rows: 2,
      columns: 2,
      bounds: { minX: -5, maxX: 5, minZ: -1, maxZ: 1 },
    } as const;
    const deformedLeft = deformByControlLattice(left, base, edited, options);
    const deformedRight = deformByControlLattice(right, base, edited, options);

    expect(Math.min(...deformedLeft.positions.map((point) => point.y))).toBeGreaterThan(1.5);
    expect(Math.max(...deformedRight.positions.map((point) => point.y))).toBeLessThan(0.5);
  });

  it("samples a dense B-spline control surface", () => {
    const controls = Array.from({ length: 4 }, (_, row) =>
      Array.from({ length: 4 }, (_, column) => vec3(column, (row === 1 && column === 1) ? 2 : 0, row)))
      .flat();
    const sampled = sampleControlSurface(controls, {
      rows: 4,
      columns: 4,
      interpolation: "b-spline",
      rowSamples: 9,
      columnSamples: 11,
    });
    expect(sampled.rows).toBe(9);
    expect(sampled.columns).toBe(11);
    expect(sampled.points).toHaveLength(99);
    expect(sampled.points[0]).toEqual(controls[0]);
    expect(sampled.points.at(-1)).toEqual(controls.at(-1));
  });
});
