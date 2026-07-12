import { describe, expect, it } from "vitest";
import {
  bakeMeshSceneAttributes,
  computeTerrainBlendWeights,
  createReplicationReport,
  fitMaterialMultiview,
  generate,
  makeFlowField,
  noise3D,
  plane,
  projectSdfDecals,
  serializeReplicationReport,
  simulateSurfaceEvolution,
  transportScalarField,
  triplanarNoise3D,
  vec3,
} from "../src/index.js";

describe("scene-aware material mechanics", () => {
  it("samples deterministic 3D and triplanar noise", () => {
    const position = vec3(1.2, 3.4, 5.6);
    const first = noise3D(position, { seed: 12, scale: 2 });
    expect(noise3D(position, { seed: 12, scale: 2 })).toBe(first);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThanOrEqual(1);
    expect(triplanarNoise3D(position, vec3(0, 1, 0), { seed: 12 })).toBeGreaterThanOrEqual(0);
  });

  it("bakes mesh scene attributes with consistent shapes", () => {
    const attributes = bakeMeshSceneAttributes(plane(2, 2, 4, 4), { size: 20 });
    expect(attributes.slope.width).toBe(20);
    expect(attributes.worldPosition.channels).toBe(3);
    expect(Math.max(...attributes.coverage.data)).toBeGreaterThan(0.5);
    expect(Math.max(...attributes.thickness.data)).toBeGreaterThan(0.1);
  });

  it("transports scalar fields and records deposition", () => {
    const source = generate(24, 24, 1, (u, v) => Math.exp(-80 * ((u - 0.4) ** 2 + (v - 0.6) ** 2)));
    const velocity = makeFlowField(24, 4, [1, -0.2], 0.1);
    const result = transportScalarField(source, velocity, { steps: 4, deposition: 0.12 });
    expect([...result.field.data]).not.toEqual([...source.data]);
    expect(Math.max(...result.deposited.data)).toBeGreaterThan(0);
  });

  it("evolves coupled fields deterministically over time", () => {
    const young = simulateSurfaceEvolution(20, { seed: 7, time: 0.1, humidity: 0.8, salinity: 0.6 });
    const old = simulateSurfaceEvolution(20, { seed: 7, time: 0.9, humidity: 0.8, salinity: 0.6 });
    const repeated = simulateSurfaceEvolution(20, { seed: 7, time: 0.9, humidity: 0.8, salinity: 0.6 });
    expect([...old.corrosion.data]).toEqual([...repeated.corrosion.data]);
    expect(Math.max(...old.corrosion.data)).toBeGreaterThan(Math.max(...young.corrosion.data));
    expect([...old.wear.data]).not.toEqual([...young.wear.data]);
  });

  it("projects SDF decals and normalizes terrain weights", () => {
    const decals = projectSdfDecals(20, [
      { shape: "circle", center: [0.5, 0.5], size: [0.2, 0.2] },
      { shape: "stripe", center: [0.5, 0.25], size: [0.35, 0.04] },
    ]);
    expect(Math.max(...decals.data)).toBeGreaterThan(0.9);
    const height = generate(12, 12, 1, (u) => u);
    const slope = generate(12, 12, 1, (_u, v) => v);
    const moisture = generate(12, 12, 1, (u, v) => (u + v) * 0.5);
    const weights = computeTerrainBlendWeights(height, slope, moisture, [
      { maxSlope: 0.5 },
      { minSlope: 0.35, maxHeight: 0.7 },
      { minHeight: 0.6 },
    ]);
    for (let pixel = 0; pixel < 12 * 12; pixel++) {
      const sum = weights.data[pixel * 3]! + weights.data[pixel * 3 + 1]! + weights.data[pixel * 3 + 2]!;
      expect(sum).toBeCloseTo(1, 5);
    }
  });

  it("fits multiple reference views and emits a report", () => {
    const render = (params: Readonly<Record<string, number>>, view: number) => generate(18, 18, 1, (u, v) => (
      Math.sin((view === 0 ? u : v) * Math.PI * 2 * params.frequency!) * 0.5 + 0.5
    ));
    const targets = [render({ frequency: 3 }, 0), render({ frequency: 3 }, 1)];
    const fit = fitMaterialMultiview(targets, { frequency: { min: 1, max: 6 } }, render, {
      seed: 4,
      generations: 12,
      population: 16,
      initial: { frequency: 2.8 },
    });
    expect(fit.score).toBeLessThan(0.08);
    expect(fit.viewScores).toHaveLength(2);
    const report = createReplicationReport("stripe", fit, 0.1);
    expect(JSON.parse(serializeReplicationReport(report)).material).toBe("stripe");
  });
});
