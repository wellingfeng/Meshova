import { describe, expect, it } from "vitest";
import {
  analyzeTextureQuality,
  assembleLayeredMaterial,
  beerLambertAbsorption,
  buildThicknessField,
  extendedMaterialFromFields,
  generate,
  growCracks,
  makeFiberTensorField,
  reactionDiffusion,
  thinFilmInterference,
  validateLayeredMaterial,
  validateTextureQuality,
  weatheringTransport,
} from "../src/index.js";

describe("advanced shading mechanics", () => {
  const size = 24;
  const height = generate(size, size, 1, (u, v) => (
    0.5 + Math.sin(u * Math.PI * 4) * 0.18 + Math.cos(v * Math.PI * 3) * 0.14
  ));

  it("simulates deterministic reaction diffusion", () => {
    const first = reactionDiffusion(size, { seed: 41, iterations: 32 });
    const second = reactionDiffusion(size, { seed: 41, iterations: 32 });
    expect([...first.pattern.data]).toEqual([...second.pattern.data]);
    expect(Math.max(...first.pattern.data) - Math.min(...first.pattern.data)).toBeGreaterThan(0.4);
  });

  it("grows hierarchical cracks with lifted borders", () => {
    const result = growCracks(size, { seed: 9, starts: 3, steps: 30, branchChance: 0.12 });
    expect(Math.max(...result.crack.data)).toBeGreaterThan(0.5);
    expect(Math.max(...result.edgeLift.data)).toBeGreaterThan(0.05);
    expect(Math.min(...result.hierarchy.data)).toBe(0);
  });

  it("derives thickness and Beer-Lambert absorption", () => {
    const mask = generate(size, size, 1, (u, v) => Math.hypot(u - 0.5, v - 0.5) < 0.42 ? 1 : 0);
    const thickness = buildThicknessField(mask, { height, maximum: 1 });
    const absorbed = beerLambertAbsorption([0.7, 0.9, 0.75], thickness, [1.2, 0.25, 0.8]);
    const center = (12 * size + 12) * 3;
    const edge = (12 * size + 2) * 3;
    expect(thickness.data[12 * size + 12]).toBeGreaterThan(thickness.data[12 * size + 2]!);
    expect(absorbed.data[center]).toBeLessThan(absorbed.data[edge]!);
  });

  it("produces wavelength-dependent thin-film color", () => {
    const thickness = generate(size, size, 1, (u) => u);
    const film = thinFilmInterference(thickness, { ior: 1.5, strength: 1 });
    expect(Math.max(...film.data) - Math.min(...film.data)).toBeGreaterThan(0.8);
    expect(film.data[0]).not.toBeCloseTo(film.data[1]!);
  });

  it("transports moisture, salt, mold and peeling", () => {
    const first = weatheringTransport(height, { seed: 17, iterations: 5 });
    const second = weatheringTransport(height, { seed: 17, iterations: 5 });
    expect([...first.moisture.data]).toEqual([...second.moisture.data]);
    expect(Math.max(...first.salt.data)).toBeGreaterThan(0.02);
    expect(Math.max(...first.mold.data)).toBeGreaterThan(0.02);
    expect(Math.max(...first.peel.data)).toBeGreaterThan(0.01);
  });

  it("builds normalized fiber tensor fields", () => {
    const fibers = makeFiberTensorField(size, { seed: 8, crossWeave: 0.6 });
    const directionX = fibers.direction.data[0]! * 2 - 1;
    const directionY = fibers.direction.data[1]! * 2 - 1;
    expect(Math.hypot(directionX, directionY)).toBeCloseTo(1, 5);
    expect(Math.max(...fibers.crossing.data)).toBeGreaterThan(0.5);
  });

  it("reports seams and mip stability", () => {
    const seamless = generate(size, size, 1, (u, v) => 0.5 + Math.sin(u * Math.PI * 2) * Math.cos(v * Math.PI * 2) * 0.4);
    const broken = generate(size, size, 1, (u) => u);
    expect(analyzeTextureQuality(seamless).maximumSeam).toBeLessThan(0.08);
    expect(validateTextureQuality(seamless, { seamTolerance: 0.08 })).toEqual([]);
    expect(validateTextureQuality(broken, { seamTolerance: 0.1 }).some((problem) => problem.includes("horizontal"))).toBe(true);
  });

  it("assembles valid layered BRDF channels", () => {
    const base = extendedMaterialFromFields(size, {
      baseColor: () => [0.3, 0.4, 0.5],
      height: (u, v) => u * v,
    });
    const clearcoat = generate(size, size, 1, (u) => u);
    const material = assembleLayeredMaterial(base, { clearcoat }, {
      clearcoat: 1,
      sheen: 0.4,
      iridescence: 0.6,
      subsurface: 0.3,
    });
    expect(validateLayeredMaterial(material)).toEqual([]);
    expect(material.clearcoat).toBe(clearcoat);
  });
});
