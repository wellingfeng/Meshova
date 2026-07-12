import { describe, expect, it } from "vitest";
import {
  ruinify, crumbleTop, erodeEdges, knockChunks,
  box, archway, column, bridgeWall, bounds, triangleCount, vertexCount,
  meshMetrics, subdivide, cross, dot, sub, type Mesh,
} from "../src/index.js";

function flippedFaces(before: Mesh, after: Mesh): number {
  let flipped = 0;
  for (let index = 0; index < before.indices.length; index += 3) {
    const ia = before.indices[index]!;
    const ib = before.indices[index + 1]!;
    const ic = before.indices[index + 2]!;
    const beforeNormal = cross(
      sub(before.positions[ib]!, before.positions[ia]!),
      sub(before.positions[ic]!, before.positions[ia]!),
    );
    const afterNormal = cross(
      sub(after.positions[ib]!, after.positions[ia]!),
      sub(after.positions[ic]!, after.positions[ia]!),
    );
    if (dot(beforeNormal, afterNormal) < 0) flipped++;
  }
  return flipped;
}

describe("ruinify", () => {
  it("crumbleTop lowers the crown without deleting geometry", () => {
    const wall = box(2, 3, 0.4);
    const before = bounds(wall).max.y;
    const damaged = crumbleTop(wall, 0.6, 7);
    const after = bounds(damaged).max.y;
    expect(after).toBeLessThanOrEqual(before);
    expect(triangleCount(damaged)).toBe(triangleCount(wall));
  });

  it("crumbleTop keeps the damaged crown closed", () => {
    const damaged = crumbleTop(box(2, 3, 0.4), 0.6, 7);
    const metrics = meshMetrics(damaged);
    expect(metrics.boundaryEdges).toBe(0);
    expect(metrics.degenerateFaces).toBe(0);
  });

  it("crumbleTop preserves depth-wise extrusion thickness", () => {
    const source = box(2, 3, 0.8);
    const damaged = crumbleTop(source, 0.7, 7);
    const top = source.positions
      .map((point, index) => ({ point, index }))
      .filter(({ point }) => point.y === bounds(source).max.y && point.x < 0);
    const drops = top.map(({ point, index }) => point.y - damaged.positions[index]!.y);
    expect(Math.max(...drops) - Math.min(...drops)).toBeCloseTo(0, 8);
  });

  it("erodeEdges moves silhouette verts inward but keeps topology", () => {
    const wall = box(2, 3, 0.4);
    const eroded = erodeEdges(wall, 0.8, 3);
    // vertex count preserved (pure displacement)
    expect(vertexCount(eroded)).toBe(vertexCount(wall));
  });

  it("erodeEdges keeps coincident hard-edge vertices welded", () => {
    const metrics = meshMetrics(erodeEdges(box(2, 3, 0.4), 0.8, 3));
    expect(metrics.boundaryEdges).toBe(0);
    expect(metrics.degenerateFaces).toBe(0);
  });

  it("knockChunks presses closed chipped pockets into the surface", () => {
    const wall = box(3, 3, 0.5);
    const chewed = knockChunks(wall, 5, 0.1, 11);
    expect(triangleCount(chewed)).toBeGreaterThan(0);
    const metrics = meshMetrics(chewed);
    expect(metrics.boundaryEdges).toBe(0);
    expect(metrics.degenerateFaces).toBe(0);
  });

  it("knockChunks does not fold arch faces through the crown", () => {
    const source = crumbleTop(
      archway({ span: 3, pierHeight: 3, pierWidth: 0.6, depth: 0.8, archStyle: "pointed" }),
      0.45,
      7,
    );
    const prepared = subdivide(source, 2);
    const damaged = knockChunks(source, 8, 0.07, 8);
    expect(flippedFaces(prepared, damaged)).toBe(0);
  });

  it("full ruinify is deterministic for the same seed", () => {
    const src = archway({ span: 2, pierHeight: 2 });
    const a = ruinify(src, { seed: 42, crumble: 0.4, erosion: 0.5, chunks: 4 });
    const b = ruinify(src, { seed: 42, crumble: 0.4, erosion: 0.5, chunks: 4 });
    expect(vertexCount(a)).toBe(vertexCount(b));
    expect(triangleCount(a)).toBe(triangleCount(b));
  });

  it("different seeds give different ruins", () => {
    const src = box(3, 4, 0.5);
    const a = ruinify(src, { seed: 1, chunks: 6 });
    const b = ruinify(src, { seed: 2, chunks: 6 });
    const same = a.positions.every((point, index) => {
      const other = b.positions[index];
      return other !== undefined && point.x === other.x && point.y === other.y && point.z === other.z;
    });
    expect(same).toBe(false);
  });

  it("keeps ruined architecture free of holes and zero-area faces", () => {
    const sources = [
      archway({ span: 3, pierHeight: 3, pierWidth: 0.6, depth: 0.8, archStyle: "pointed" }),
      column({ height: 4, radius: 0.35, flutes: 14, fluteDepth: 0.06 }),
      bridgeWall({ length: 7, height: 1.4, thickness: 0.4, openings: 5, style: "crenel" }),
    ];
    for (const source of sources) {
      const metrics = meshMetrics(ruinify(source, {
        seed: 7,
        crumble: 0.45,
        erosion: 0.5,
        chunks: 8,
        chunkSize: 0.07,
      }));
      expect(metrics.boundaryEdges).toBe(0);
      expect(metrics.degenerateFaces).toBe(0);
    }
  });

  it("zeroed options return an unbroken mesh", () => {
    const src = box(2, 2, 2);
    const m = ruinify(src, { crumble: 0, erosion: 0, chunks: 0 });
    expect(triangleCount(m)).toBe(triangleCount(src));
  });
});
