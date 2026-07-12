import { describe, expect, it } from "vitest";
import {
  box,
  bounds,
  buildCliffPanelStudyParts,
  buildPcgCellMapParts,
  buildPcgRiverValleyParts,
  buildRiverSystem2D,
  buildSurfaceSketchVineParts,
  clusterCells,
  hexCellGraph,
  merge,
  panelizeCliffMesh,
  projectSurfaceStroke,
  triangleCount,
  traceCellGraphBoundaries,
  vec3,
  wallSurface,
} from "../src/index.js";

describe("PCG study kernels", () => {
  it("builds deterministic connected hex clusters and boundaries", () => {
    const first = hexCellGraph({ rings: 4, cellSize: 0.8, jitter: 0.15, seed: 7 });
    const second = hexCellGraph({ rings: 4, cellSize: 0.8, jitter: 0.15, seed: 7 });
    expect(first).toEqual(second);
    expect(first.cells).toHaveLength(61);
    const labels = clusterCells(first, 5, 12);
    expect(labels).toEqual(clusterCells(second, 5, 12));
    expect(new Set(labels).size).toBe(5);
    expect(traceCellGraphBoundaries(first, labels).length).toBeGreaterThan(20);
  });

  it("shares deterministic river geometry and simulation channels", () => {
    const first = buildRiverSystem2D({ resolution: 24, seed: 4 });
    const second = buildRiverSystem2D({ resolution: 24, seed: 4 });
    expect(first.centerline).toEqual(second.centerline);
    expect(first.terrain).toEqual(second.terrain);
    expect(first.direction.x).toEqual(second.direction.x);
    expect(Math.max(...first.accumulation)).toBeGreaterThan(0.5);
    expect(Math.max(...first.depth)).toBeGreaterThan(0.4);
  });

  it("uses editable control points as the river centerline", () => {
    const river = buildRiverSystem2D({
      size: 20,
      resolution: 24,
      controlPoints: [vec3(-5, 0, -9), vec3(-5, 0, 0), vec3(-5, 0, 9)],
    });
    expect(river.centerline.points.every((point) => Math.abs(point.x + 5) < 1e-8)).toBe(true);
    expect(river.centerline.points[0]).toEqual(vec3(-5, 0, -9));
    expect(river.centerline.points.at(-1)).toEqual(vec3(-5, 0, 9));
  });

  it("projects replayable strokes onto a surface", () => {
    const surface = wallSurface({ origin: vec3(0, 0, 0), normal: vec3(0, 0, 1), width: 4, height: 4 });
    const samples = [vec3(-1, 0.2, 2), vec3(-0.6, 1, 1), vec3(0.2, 2.2, -2), vec3(0.8, 3.5, 1)];
    const stroke = projectSurfaceStroke(samples, surface, { spacing: 0.2, smoothing: 2, offset: 0.03 });
    expect(stroke.points.length).toBeGreaterThan(samples.length);
    expect(stroke.points.every((point) => Math.abs(point.position.z - 0.03) < 1e-8)).toBe(true);
    expect(stroke).toEqual(projectSurfaceStroke(samples, surface, { spacing: 0.2, smoothing: 2, offset: 0.03 }));
  });

  it("partitions every face into local-projection cliff panels", () => {
    const mesh = box(4, 3, 2);
    const panels = panelizeCliffMesh(mesh, { directionBins: 8, maxUpDot: 0.7 });
    expect(panels.some((panel) => panel.fallback)).toBe(true);
    expect(panels.some((panel) => !panel.fallback)).toBe(true);
    expect(panels.reduce((sum, panel) => sum + panel.faceCount, 0)).toBe(mesh.indices.length / 3);
    expect(panels.every((panel) => panel.mesh.uvs.length === panel.mesh.positions.length)).toBe(true);
  });

  it("builds an eroded cliff face instead of a four-strip curtain", () => {
    const parts = buildCliffPanelStudyParts({ resolution: 32, seed: 8 });
    const cliffParts = parts.filter((part) => part.name.startsWith("cliff_panel_direction_"));
    const cliff = merge(...cliffParts.map((part) => part.mesh));
    const cliffBounds = bounds(cliff);
    expect(cliffParts.length).toBeGreaterThanOrEqual(2);
    expect(triangleCount(cliff)).toBeGreaterThan(1000);
    expect(cliffBounds.max.y - cliffBounds.min.y).toBeGreaterThan(5);
  });
});

describe("PCG study model library scenes", () => {
  it("rebuilds the surface vine from an editable stroke", () => {
    const controlPoints = [vec3(-2, 0.3, 0.5), vec3(0, 2.6, 0.5), vec3(2, 5, 0.5)];
    const parts = buildSurfaceSketchVineParts({ controlPoints, seed: 4 });
    const controls = parts.find((part) => part.name === "surface_sketch_controls")!.mesh.positions;
    expect(Math.min(...controls.map((point) => point.x))).toBeLessThan(-1.8);
    expect(Math.max(...controls.map((point) => point.x))).toBeGreaterThan(1.7);
    expect(Math.max(...controls.map((point) => point.y))).toBeGreaterThan(4.6);
  });

  it("builds four deterministic semantic model entries", () => {
    const scenes = [
      buildPcgCellMapParts({ rings: 3, seed: 2 }),
      buildPcgRiverValleyParts({ resolution: 24, seed: 3 }),
      buildSurfaceSketchVineParts({ seed: 4 }),
      buildCliffPanelStudyParts({ resolution: 24, seed: 5 }),
    ];
    const repeats = [
      buildPcgCellMapParts({ rings: 3, seed: 2 }),
      buildPcgRiverValleyParts({ resolution: 24, seed: 3 }),
      buildSurfaceSketchVineParts({ seed: 4 }),
      buildCliffPanelStudyParts({ resolution: 24, seed: 5 }),
    ];
    expect(scenes).toEqual(repeats);
    expect(scenes.every((parts) => parts.length >= 2)).toBe(true);
    expect(scenes.flat().every((part) => part.label && part.mesh.positions.length > 0)).toBe(true);
  });
});
