import { describe, expect, it } from "vitest";
import { rock, rockVariants, archetypeRock, triangleCount, vertexCount, bounds, type RockArchetype } from "../src/index.js";

describe("rock / cliff variants", () => {
  it("rock builds a closed-ish blob mesh", () => {
    const m = rock({ seed: 1, radius: 1, detail: 3 });
    expect(triangleCount(m)).toBeGreaterThan(0);
    const b = bounds(m);
    expect(b.max.y - b.min.y).toBeGreaterThan(0);
  });

  it("same seed -> identical rock", () => {
    const a = rock({ seed: 5 });
    const b = rock({ seed: 5 });
    expect(vertexCount(a)).toBe(vertexCount(b));
    expect(a.positions[0]!.x).toBe(b.positions[0]!.x);
  });

  it("different seeds -> different silhouettes", () => {
    const a = rock({ seed: 1 });
    const b = rock({ seed: 2 });
    // topology same (same icosphere), positions differ
    const differ = a.positions.some((p, i) => p.x !== b.positions[i]!.x);
    expect(differ).toBe(true);
  });

  it("flatBase lowers variance at the bottom", () => {
    const flat = rock({ seed: 3, flatBase: 0.4 });
    const b = bounds(flat);
    // many verts should sit exactly on the cut plane
    const minY = b.min.y;
    const onFloor = flat.positions.filter((p) => Math.abs(p.y - minY) < 1e-6).length;
    expect(onFloor).toBeGreaterThan(3);
  });

  it("rockVariants yields N distinct meshes", () => {
    const set = rockVariants(8, { seed: 100, radius: 1 });
    expect(set.length).toBe(8);
    const sig = set.map((m) => `${vertexCount(m)}:${m.positions[10]?.x.toFixed(4)}`);
    // variants should not all be identical
    expect(new Set(sig).size).toBeGreaterThan(1);
  });

  it("rockVariants is deterministic batch-to-batch", () => {
    const a = rockVariants(4, { seed: 7 });
    const b = rockVariants(4, { seed: 7 });
    for (let i = 0; i < 4; i++) {
      expect(a[i]!.positions[0]!.x).toBe(b[i]!.positions[0]!.x);
    }
  });
});

describe("archetypeRock", () => {
  const kinds: RockArchetype[] = ["boulder", "slab", "spire", "eroded", "strata"];

  it("every archetype builds a valid mesh", () => {
    for (const k of kinds) {
      const m = archetypeRock(k, { seed: 1 });
      expect(triangleCount(m)).toBeGreaterThan(0);
      for (const p of m.positions) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
      }
    }
  });

  it("spire is taller than wide; slab is wider than tall", () => {
    const spire = bounds(archetypeRock("spire", { seed: 2 }));
    const slab = bounds(archetypeRock("slab", { seed: 2 }));
    const spireH = spire.max.y - spire.min.y;
    const spireW = spire.max.x - spire.min.x;
    const slabH = slab.max.y - slab.min.y;
    const slabW = slab.max.x - slab.min.x;
    expect(spireH).toBeGreaterThan(spireW);
    expect(slabW).toBeGreaterThan(slabH);
  });

  it("strata banding changes the surface vs no strata", () => {
    const plain = archetypeRock("boulder", { seed: 4, strata: 0 });
    const banded = archetypeRock("boulder", { seed: 4, strata: 0.6, strataBands: 5 });
    const differ = plain.positions.some((p, i) => p.y !== banded.positions[i]!.y);
    expect(differ).toBe(true);
  });

  it("is deterministic", () => {
    const a = archetypeRock("eroded", { seed: 11 });
    const b = archetypeRock("eroded", { seed: 11 });
    expect(a.positions[0]!.x).toBe(b.positions[0]!.x);
    expect(a.positions[10]!.y).toBe(b.positions[10]!.y);
  });
});
