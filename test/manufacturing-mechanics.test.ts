import { describe, expect, it } from "vitest";
import {
  analyzeManufacturingQuality,
  depositCurves,
  evaluateMicrofacet,
  extractPerceptualFeatures,
  fitMaterialParameters,
  generate,
  growGrains,
  makeDualAnisotropyField,
  makeTextureSeamless,
  simulateDroplets,
  simulateManufacturing,
  spectralIor,
  temperatureOxideColor,
} from "../src/index.js";

describe("manufacturing material mechanics", () => {
  it("evaluates finite GGX, Beckmann and Charlie lobes", () => {
    for (const distribution of ["ggx", "beckmann", "charlie"] as const) {
      const sample = evaluateMicrofacet(distribution, 0.82, 0.75, 0.68, 0.34);
      expect(Number.isFinite(sample.response), distribution).toBe(true);
      expect(sample.response, distribution).toBeGreaterThanOrEqual(0);
      expect(sample.visibility, distribution).toBeGreaterThan(0);
    }
  });

  it("builds deterministic dual anisotropy fields", () => {
    const first = makeDualAnisotropyField(20, { seed: 7, weaveFrequency: 9 });
    const second = makeDualAnisotropyField(20, { seed: 7, weaveFrequency: 9 });
    expect([...first.primaryDirection.data]).toEqual([...second.primaryDirection.data]);
    expect([...first.primaryStrength.data]).not.toEqual([...first.secondaryStrength.data]);
  });

  it("approximates spectral dispersion and oxide colors", () => {
    expect(spectralIor(1.52, 30, 430)).toBeGreaterThan(spectralIor(1.52, 30, 680));
    expect(temperatureOxideColor(220)).not.toEqual(temperatureOxideColor(360));
  });

  it("grows deterministic grains with visible boundaries", () => {
    const first = growGrains(24, { seed: 13, grains: 18 });
    const second = growGrains(24, { seed: 13, grains: 18 });
    expect([...first.grainId.data]).toEqual([...second.grainId.data]);
    expect(Math.max(...first.boundary.data)).toBeGreaterThan(0.5);
  });

  it("deposits curves and coalesces droplets", () => {
    const curves = depositCurves(24, { seed: 4, curves: 2 });
    const droplets = simulateDroplets(24, { seed: 4, count: 20, mergeIterations: 3 });
    expect(Math.max(...curves.deposit.data)).toBeGreaterThan(0.5);
    expect(Math.max(...droplets.height.data)).toBeGreaterThan(0.4);
    expect([...simulateDroplets(24, { seed: 4, count: 20, mergeIterations: 3 }).height.data])
      .toEqual([...droplets.height.data]);
  });

  it("simulates distinct manufacturing processes", () => {
    const cutting = simulateManufacturing(20, "cutting", { seed: 8 });
    const sintering = simulateManufacturing(20, "sintering", { seed: 8 });
    expect([...cutting.height.data]).not.toEqual([...sintering.height.data]);
    expect(Math.max(...sintering.heat.data)).toBeGreaterThan(0.4);
  });

  it("reduces seams and reports spectrum/normal energy", () => {
    const source = generate(24, 24, 1, (u, v) => u * 0.7 + v * 0.3);
    const seamless = makeTextureSeamless(source, 0.15);
    const before = analyzeManufacturingQuality(source);
    const after = analyzeManufacturingQuality(seamless);
    expect(after.horizontalSeam).toBeLessThan(before.horizontalSeam);
    expect(after.verticalSeam).toBeLessThan(before.verticalSeam);
    expect(after.highFrequencyEnergy).toBeGreaterThanOrEqual(0);
  });

  it("fits finite candidates by perceptual features", () => {
    const render = (params: { frequency: number }) => generate(20, 20, 1, (u) => (
      Math.sin(u * Math.PI * 2 * params.frequency) * 0.5 + 0.5
    ));
    const target = render({ frequency: 3 });
    const result = fitMaterialParameters(target, [
      { frequency: 1 },
      { frequency: 3 },
      { frequency: 6 },
    ], render);
    expect(result.params.frequency).toBe(3);
    expect(result.score).toBeCloseTo(0, 6);
    expect(extractPerceptualFeatures(target).variance).toBeGreaterThan(0.1);
  });
});
