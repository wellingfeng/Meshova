import { describe, expect, it } from "vitest";
import {
  buildProceduralBuilding,
  buildProceduralBuildingParts,
  scoreProceduralBuilding,
  triangleCount,
  vertexCount,
} from "../src/index.js";

describe("integrated procedural building", () => {
  it("builds exterior and interior from one footprint", () => {
    const scene = buildProceduralBuilding({ floors: 3, furnished: true });
    const names = scene.parts.map((part) => part.name);
    expect(names).toContain("exterior_walls");
    expect(names).toContain("window_glass");
    expect(names).toContain("entrance_doors");
    expect(names).toContain("interior_walls");
    expect(names).toContain("stairs");
    expect(names).toContain("roof");
    expect(names).toContain("furniture_wood");
    expect(scene.rooms.length).toBeGreaterThan(6);
    expect(scene.stairs).toHaveLength(2);
  });

  it("derives stair count from floor height", () => {
    const low = buildProceduralBuilding({ floors: 2, floorHeight: 2.5 });
    const high = buildProceduralBuilding({ floors: 2, floorHeight: 4 });
    expect(high.stairs[0]!.steps).toBeGreaterThan(low.stairs[0]!.steps);
    expect(high.stairs[0]!.steps * high.stairs[0]!.rise).toBeCloseTo(4);
  });

  it("supports concave L-shaped footprints", () => {
    const scene = buildProceduralBuilding({ footprintShape: "lShape", floors: 2, roofStyle: "hip" });
    expect(scene.parts.find((part) => part.name === "roof_parapet")).toBeDefined();
    expect(scene.rooms.length).toBeGreaterThan(0);
    expect(scene.parts.every((part) => part.mesh.positions.length > 0)).toBe(true);
  });

  it("supports custom spline polygons", () => {
    const scene = buildProceduralBuilding({
      floors: 1,
      footprint: [
        { x: -5, y: 0, z: -3 },
        { x: 5, y: 0, z: -3 },
        { x: 4, y: 0, z: 3 },
        { x: -4, y: 0, z: 3 },
      ],
    });
    expect(scene.parts.find((part) => part.name === "exterior_walls")).toBeDefined();
    expect(scene.parts.find((part) => part.name === "roof_parapet")).toBeDefined();
  });

  it("cutaway removes front shell and roof but keeps rooms", () => {
    const closed = buildProceduralBuilding({ revealInterior: false });
    const cutaway = buildProceduralBuilding({ revealInterior: true });
    const closedWalls = closed.parts.find((part) => part.name === "exterior_walls")!.mesh;
    const cutawayWalls = cutaway.parts.find((part) => part.name === "exterior_walls")!.mesh;
    expect(vertexCount(cutawayWalls)).toBeLessThan(vertexCount(closedWalls));
    expect(cutaway.parts.some((part) => part.name === "roof")).toBe(false);
    expect(cutaway.rooms).toEqual(closed.rooms);
  });

  it("is deterministic for fixed parameters", () => {
    const a = buildProceduralBuildingParts({ seed: 77, furnitureDensity: 0.6 });
    const b = buildProceduralBuildingParts({ seed: 77, furnitureDensity: 0.6 });
    expect(a.map((part) => part.name)).toEqual(b.map((part) => part.name));
    expect(a.map((part) => vertexCount(part.mesh))).toEqual(b.map((part) => vertexCount(part.mesh)));
    expect(a.map((part) => triangleCount(part.mesh))).toEqual(b.map((part) => triangleCount(part.mesh)));
    expect(a.map((part) => part.mesh.positions)).toEqual(b.map((part) => part.mesh.positions));
  });

  it("scores the complete grammar highly", () => {
    const score = scoreProceduralBuilding(buildProceduralBuilding());
    expect(score.score).toBeGreaterThan(0.9);
    expect(score.metrics.exterior).toBe(1);
    expect(score.metrics.interior).toBe(1);
    expect(score.metrics.circulation).toBe(1);
  });
});
