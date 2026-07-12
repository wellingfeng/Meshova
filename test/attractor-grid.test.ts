import { describe, expect, it } from "vitest";
import {
  ATTRACTOR_GRID_DEFAULTS,
  attractorGridCells,
  buildAttractorGridParts,
  triangleCount,
  vec3,
} from "../src/index.js";

describe("attractor grid", () => {
  it("builds base, columns and marker parts", () => {
    const parts = buildAttractorGridParts({ cells: 5, jitter: 0 });
    expect(parts.map((p) => p.name)).toEqual(["base", "columns", "attractors"]);
    for (const part of parts) {
      expect(part.mesh.positions.length).toBeGreaterThan(0);
      expect(triangleCount(part.mesh)).toBeGreaterThan(0);
    }
  });

  it("attract mode makes center columns taller than edge columns", () => {
    const cells = attractorGridCells({
      cells: 5,
      spacing: 1,
      radius: 3,
      jitter: 0,
      attractors: [{ position: vec3(0, 0, 0) }],
    });
    const center = cells.find((c) => c.ix === 2 && c.iz === 2)!;
    const corner = cells.find((c) => c.ix === 0 && c.iz === 0)!;
    expect(center.height).toBeGreaterThan(corner.height);
  });

  it("repel mode inverts the height field", () => {
    const cells = attractorGridCells({
      cells: 5,
      spacing: 1,
      radius: 3,
      jitter: 0,
      mode: "repel",
      attractors: [{ position: vec3(0, 0, 0) }],
    });
    const center = cells.find((c) => c.ix === 2 && c.iz === 2)!;
    const corner = cells.find((c) => c.ix === 0 && c.iz === 0)!;
    expect(corner.height).toBeGreaterThan(center.height);
  });

  it("is deterministic for the same seed", () => {
    const a = buildAttractorGridParts({ cells: 6, jitter: 0.2, seed: 4 });
    const b = buildAttractorGridParts({ cells: 6, jitter: 0.2, seed: 4 });
    expect(a.find((p) => p.name === "columns")!.mesh.positions).toEqual(
      b.find((p) => p.name === "columns")!.mesh.positions,
    );
  });

  it("different seeds change jittered placement", () => {
    const a = attractorGridCells({ cells: 6, jitter: 0.2, seed: 4 });
    const b = attractorGridCells({ cells: 6, jitter: 0.2, seed: 5 });
    expect(a.map((c) => c.position)).not.toEqual(b.map((c) => c.position));
  });

  it("keeps documented defaults usable", () => {
    expect(ATTRACTOR_GRID_DEFAULTS.cells).toBeGreaterThanOrEqual(9);
    expect(ATTRACTOR_GRID_DEFAULTS.radius).toBeGreaterThan(0);
  });
});
