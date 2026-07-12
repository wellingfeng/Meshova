import { describe, expect, it } from "vitest";
import {
  MaterialBakeCache,
  antiAliasField,
  applyMaterialWeathering,
  bakeProductionMaterial,
  compileSemanticMaterial,
  generate,
  generateMipChain,
  generateMaterialMipChains,
  materialFromFields,
  periodicField,
  sample,
  validateMaterial,
} from "../src/index.js";

describe("production material pipeline", () => {
  it("wraps fields periodically and anti-aliases deterministically", () => {
    const wrapped = periodicField((u, v) => u * 0.7 + v * 0.3);
    expect(wrapped(0.2, 0.4)).toBeCloseTo(wrapped(1.2, -0.6), 6);
    const checker = (u: number, v: number) => (Math.floor(u * 16) + Math.floor(v * 16)) % 2;
    const filtered = antiAliasField(checker, { samples: 16, footprint: 0.08 });
    expect(filtered(0.5, 0.5)).toBe(filtered(0.5, 0.5));
    expect(filtered(0.5, 0.5)).toBeGreaterThan(0);
    expect(filtered(0.5, 0.5)).toBeLessThan(1);
  });

  it("builds full mip chains and renormalizes normal maps", () => {
    const source = generate(8, 8, 1, (u, v) => u * v);
    const levels = generateMipChain(source);
    expect(levels.map((level) => level.width)).toEqual([8, 4, 2, 1]);

    const material = materialFromFields(8, { height: (u, v) => u * v });
    const materialLevels = generateMaterialMipChains(material);
    expect(materialLevels.normal).toHaveLength(4);
    const last = materialLevels.normal.at(-1)!;
    const x = sample(last, 0, 0, 0) * 2 - 1;
    const y = sample(last, 0, 0, 1) * 2 - 1;
    const z = sample(last, 0, 0, 2) * 2 - 1;
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5);
  });

  it("applies transport-based aging without mutating source", () => {
    const source = materialFromFields(16, {
      baseColor: () => [0.5, 0.5, 0.5],
      metallic: () => 0.8,
      roughness: () => 0.5,
      height: (u, v) => 0.2 + u * 0.4 + v * 0.2,
    });
    const before = [...source.baseColor.data];
    const aged = applyMaterialWeathering(source, { amount: 0.8, seed: 7, iterations: 3 });
    expect([...source.baseColor.data]).toEqual(before);
    expect([...aged.baseColor.data]).not.toEqual(before);
    expect(validateMaterial(aged)).toEqual([]);
  });

  it("compiles semantic descriptions into stable material controls", () => {
    const intent = compileSemanticMaterial("潮湿破旧的混凝土排水沟，高细节");
    expect(intent.name).toBe("wetDrainConcrete");
    expect(intent.params.wetness).toBeGreaterThan(0.8);
    expect(intent.params.wear).toBeGreaterThan(0.8);
    expect(intent.params.detail).toBe(7);
    expect(intent.confidence).toBeGreaterThan(0.5);
  });

  it("reuses cached bakes and returns quality plus mip metadata", () => {
    const cache = new MaterialBakeCache();
    const first = bakeProductionMaterial("潮湿破旧混凝土", 16, {
      cache,
      mipLevels: 3,
      weathering: { amount: 0.4, iterations: 2, seed: 4 },
    });
    const second = bakeProductionMaterial("潮湿破旧混凝土", 16, {
      cache,
      mipLevels: 3,
      weathering: { amount: 0.4, iterations: 2, seed: 4 },
    });
    expect(first.name).toBe("wetDrainConcrete");
    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(second.material).toBe(first.material);
    expect(second.mipmaps.baseColor).toHaveLength(3);
    expect(second.quality.height.maximumSeam).toBeGreaterThanOrEqual(0);
    expect(cache.stats).toEqual({ hits: 1, misses: 1 });
  });
});
