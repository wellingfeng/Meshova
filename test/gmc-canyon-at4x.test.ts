import { describe, expect, it } from "vitest";
import {
  bounds,
  buildGmcCanyonAt4xParts,
  scorePickupVehicle,
  triangleCount,
} from "../src/index.js";

describe("GMC Canyon AT4X procedural pickup", () => {
  it("builds a detailed deterministic multi-part model", () => {
    const a = buildGmcCanyonAt4xParts();
    const b = buildGmcCanyonAt4xParts();
    expect(a.length).toBeGreaterThan(40);
    expect(a.map((p) => p.name)).toEqual(b.map((p) => p.name));
    expect(a.find((p) => p.name === "gmc_front_badge")).toBeTruthy();
    expect(a.find((p) => p.name === "front_skid_plate")).toBeTruthy();
    expect(a.reduce((sum, p) => sum + triangleCount(p.mesh), 0)).toBeGreaterThan(5000);
    const quality = scorePickupVehicle(a);
    expect(quality.score).toBeGreaterThanOrEqual(0.78);
    expect(quality.metrics.requiredParts).toBe(1);
    expect(quality.metrics.proportions).toBeGreaterThan(0.82);
    expect(quality.metrics.cabBedLayout).toBeGreaterThan(0.8);
    expect(quality.metrics.wheelSystem).toBeGreaterThan(0.9);
    expect(quality.metrics.vehicleSemantics).toBeGreaterThan(0.9);
    const roofBounds = bounds(a.find((part) => part.name === "cab_black_roof")!.mesh);
    const pillarBounds = bounds(a.find((part) => part.name === "crew_cab_pillars")!.mesh);
    const railBounds = bounds(a.find((part) => part.name === "roof_rails")!.mesh);
    expect(roofBounds.min.y).toBeLessThan(pillarBounds.max.y);
    expect(railBounds.min.y).toBeLessThanOrEqual(roofBounds.max.y + 0.001);
  });

  it("tracks pickup proportions when scaled", () => {
    const parts = buildGmcCanyonAt4xParts({ length: 6.2, width: 2.35, height: 2.05 });
    const mergedBounds = parts.map((p) => bounds(p.mesh));
    const minX = Math.min(...mergedBounds.map((b) => b.min.x));
    const maxX = Math.max(...mergedBounds.map((b) => b.max.x));
    const minZ = Math.min(...mergedBounds.map((b) => b.min.z));
    const maxZ = Math.max(...mergedBounds.map((b) => b.max.z));
    expect(maxX - minX).toBeGreaterThan(2.3);
    expect(maxZ - minZ).toBeGreaterThan(6.1);
  });
});
