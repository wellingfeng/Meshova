import { describe, expect, it } from "vitest";
import {
  buildLunarCraterHeightfield,
  buildLunarCraterSurfaceParts,
  sampleHeight,
} from "../src/index.js";

describe("lunar crater surface", () => {
  it("creates a sunken bowl with a raised irregular rim", () => {
    const size = 100;
    const heightfield = buildLunarCraterHeightfield({
      size,
      resolution: 96,
      largeCraters: 1,
      smallCraters: 0,
      roughness: 0,
      irregularity: 0.25,
      seed: 8,
    });
    const centerX = -size * 0.17;
    const centerZ = size * 0.08;
    const center = sampleHeight(heightfield, centerX, centerZ);
    let highestRim = -Infinity;
    for (let index = 0; index < 32; index++) {
      const angle = index / 32 * Math.PI * 2;
      const radius = size * 0.17 * 0.86;
      highestRim = Math.max(highestRim, sampleHeight(
        heightfield,
        centerX + Math.cos(angle) * radius,
        centerZ + Math.sin(angle) * radius,
      ));
    }
    expect(center).toBeLessThan(-2);
    expect(highestRim).toBeGreaterThan(0.5);
  });

  it("is deterministic for a fixed seed", () => {
    const options = { resolution: 48, largeCraters: 8, smallCraters: 30, seed: 91 };
    const first = buildLunarCraterHeightfield(options);
    const second = buildLunarCraterHeightfield(options);
    expect(Array.from(first.height)).toEqual(Array.from(second.height));
  });

  it("exports a valid colored semantic part", () => {
    const [part] = buildLunarCraterSurfaceParts({
      resolution: 40,
      largeCraters: 6,
      smallCraters: 20,
      seed: 17,
    });
    expect(part?.name).toBe("lunar_surface");
    expect(part!.mesh.positions.length).toBeGreaterThanOrEqual(41 * 41);
    expect(part?.mesh.indices.length).toBe(40 * 40 * 6);
    expect(part?.colors).toHaveLength(part!.mesh.positions.length * 3);
    expect(part?.mesh.positions.every((position) => Number.isFinite(position.y))).toBe(true);
  });
});
