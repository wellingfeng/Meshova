import { describe, expect, it } from "vitest";
import { generate } from "../src/texture/buffer.js";
import {
  VOLUME_RAYMARCH_WGSL,
  buildVolumeMipChain,
  createProceduralVolume,
  evolveVolume,
  fitTemporalVolume,
  integrateVolumeReference,
  parallaxOcclusionUv,
  planMicroDisplacement,
  sampleOceanSpectrum,
  sampleVolume,
} from "../src/texture/volume-material-system.js";

function mean(values: Float32Array): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

describe("volume material system", () => {
  it("creates deterministic scalar and velocity fields", () => {
    const options = { width: 7, height: 5, depth: 9, seed: 42, shape: "plume" as const };
    const first = createProceduralVolume(options);
    const second = createProceduralVolume(options);
    expect(first.density).toEqual(second.density);
    expect(first.temperature).toEqual(second.temperature);
    expect(first.velocity).toEqual(second.velocity);
    expect(sampleVolume(first, { x: 0.5, y: 0.5, z: 0.5 }, "density")).toBeGreaterThanOrEqual(0);
  });

  it("evolves density and temperature with deterministic dissipation", () => {
    const source = createProceduralVolume({ width: 6, height: 6, depth: 6, seed: 9, temperature: 0.8, shape: "box" });
    const first = evolveVolume(source, { timeStep: 0.2, dissipation: 0.1, cooling: 0.12 });
    const second = evolveVolume(source, { timeStep: 0.2, dissipation: 0.1, cooling: 0.12 });
    expect(first.density).toEqual(second.density);
    expect(mean(first.density)).toBeLessThan(mean(source.density));
    expect(mean(first.temperature)).toBeLessThan(mean(source.temperature));
  });

  it("integrates denser media to lower transmittance", () => {
    const thin = createProceduralVolume({ width: 8, density: 0.25, shape: "box", seed: 3 });
    const thick = createProceduralVolume({ width: 8, density: 1, shape: "box", seed: 3 });
    const ray = { origin: { x: 0, y: 0.5, z: 0.5 }, direction: { x: 1, y: 0, z: 0 }, length: 1 };
    const thinResult = integrateVolumeReference(thin, ray, { steps: 48 });
    const thickResult = integrateVolumeReference(thick, ray, { steps: 48 });
    expect(thickResult.transmittance).toBeLessThan(thinResult.transmittance);
    expect(thickResult.opticalDepth).toBeGreaterThan(thinResult.opticalDepth);
    expect(VOLUME_RAYMARCH_WGSL).toContain("texture_3d");
    expect(VOLUME_RAYMARCH_WGSL).toContain("integrateVolume");
  });

  it("preserves odd volume edges through mip chain", () => {
    const field = createProceduralVolume({ width: 7, height: 5, depth: 3, shape: "box", seed: 1 });
    field.density[field.density.length - 1] = 1;
    const mips = buildVolumeMipChain(field);
    expect(mips.map((level) => [level.width, level.height, level.depth])).toEqual([
      [7, 5, 3], [4, 3, 2], [2, 2, 1], [1, 1, 1],
    ]);
    expect(mips.at(-1)!.density[0]).toBeGreaterThan(0);
  });

  it("samples deterministic time-varying ocean spectra", () => {
    const waves = [
      { direction: [1, 0.25] as const, amplitude: 0.2, wavelength: 1.5, speed: 1.2, steepness: 0.8 },
      { direction: [-0.2, 1] as const, amplitude: 0.08, wavelength: 0.5, speed: 2, steepness: 0.6 },
    ];
    const first = sampleOceanSpectrum(0.4, 0.7, 1.2, waves);
    expect(sampleOceanSpectrum(0.4, 0.7, 1.2, waves)).toEqual(first);
    expect(sampleOceanSpectrum(0.4, 0.7, 2.2, waves).height).not.toBe(first.height);
    expect(Math.hypot(first.normal.x, first.normal.y, first.normal.z)).toBeCloseTo(1, 6);
  });

  it("plans microdisplacement and traces parallax UVs", () => {
    const height = generate(17, 17, 1, (u, v) => 0.5 + Math.sin(u * Math.PI * 4) * Math.sin(v * Math.PI * 4) * 0.3);
    const plan = planMicroDisplacement(height, { heightScale: 0.2, maxScreenError: 0.001 });
    const uv = parallaxOcclusionUv(height, [0.5, 0.5], { x: 0.4, y: 0.1, z: 0.6 }, 0.08, 32);
    expect(plan.subdivisions).toBeGreaterThan(0);
    expect(plan.estimatedError).toBeLessThan(plan.maxSlope);
    expect(uv[0]).toBeLessThan(0.5);
  });

  it("fits temporal sequence statistics", () => {
    const initial = createProceduralVolume({ width: 5, height: 5, depth: 5, seed: 6, shape: "box", temperature: 0.7 });
    const target = { dissipation: 0.08, cooling: 0.09, buoyancy: 0.3 };
    const one = evolveVolume(initial, { timeStep: 0.25, ...target });
    const two = evolveVolume(one, { timeStep: 0.25, ...target });
    const observations = [
      { time: 0.25, meanDensity: mean(one.density), meanTemperature: mean(one.temperature) },
      { time: 0.5, meanDensity: mean(two.density), meanTemperature: mean(two.temperature) },
    ];
    const fit = fitTemporalVolume(initial, observations, 128);
    expect(fit.error).toBeLessThan(0.018);
    expect(fit.evaluations).toBe(129);
  });
});
