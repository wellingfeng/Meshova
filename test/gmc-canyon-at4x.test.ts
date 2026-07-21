import { describe, expect, it } from "vitest";
import {
  bounds,
  box,
  buildGmcCanyonAt4xParts,
  scorePickupVehicle,
  triangleCount,
  transform,
  vec3,
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

  it("rejects named wheel-arch and tire-contact geometry cheats", () => {
    const good = buildGmcCanyonAt4xParts();
    const bad = good.map((part) => {
      if (part.name === "wheel_flares") return { ...part, mesh: box(0.1, 0.1, 0.1) };
      if (/^tire_/.test(part.name)) return { ...part, mesh: transform(part.mesh, { translate: vec3(0, 0.5, 0) }) };
      return part;
    });
    const goodScore = scorePickupVehicle(good);
    const badScore = scorePickupVehicle(bad);
    expect(badScore.metrics.wheelArchWrap).toBeLessThan(goodScore.metrics.wheelArchWrap);
    expect(badScore.metrics.tireContact).toBeLessThan(goodScore.metrics.tireContact);
    expect(badScore.score).toBeLessThan(goodScore.score);
  });
});
