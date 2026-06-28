import { describe, expect, it } from "vitest";
import {
  buildMidnightHorseParts,
  scoreHorseAnatomy,
  triangleCount,
} from "../src/index.js";

describe("midnight horse procedural template", () => {
  it("builds a deterministic anatomy-gated horse", () => {
    const a = buildMidnightHorseParts();
    const b = buildMidnightHorseParts();
    expect(a.map((p) => p.name)).toEqual(b.map((p) => p.name));
    expect(a.length).toBeGreaterThanOrEqual(15);
    expect(a.reduce((sum, p) => sum + triangleCount(p.mesh), 0)).toBeGreaterThan(3400);
    expect(a.find((p) => p.name === "body_skin")?.surface?.type).toBe("blackCoat");
    expect(a.find((p) => p.name === "mane")?.surface?.type).toBe("hair");

    const quality = scoreHorseAnatomy(a);
    expect(quality.score).toBeGreaterThanOrEqual(0.78);
    expect(quality.metrics.continuousSkin).toBeGreaterThan(0.78);
    expect(quality.metrics.sideSilhouette).toBeGreaterThan(0.78);
    expect(quality.metrics.materialMatch).toBeGreaterThan(0.9);
    expect(quality.metrics.limbLayout).toBeGreaterThan(0.9);
  });

  it("penalizes plush material, split skin, or missing anatomy", () => {
    const good = buildMidnightHorseParts();
    const bad = good
      .filter((p) => !/^rear_(leg|hoof|hock|fetlock)_1$/.test(p.name))
      .map((p) => (
        p.name === "body_skin"
          ? { ...p, surface: { type: "fur", params: { tint: [0.1, 0.1, 0.1] } } }
          : p
      ));

    const goodScore = scoreHorseAnatomy(good);
    const badScore = scoreHorseAnatomy(bad);
    expect(badScore.score).toBeLessThan(goodScore.score);
    expect(badScore.metrics.materialMatch).toBeLessThan(goodScore.metrics.materialMatch);
    expect(badScore.metrics.requiredParts).toBeLessThan(1);
  });

  it("rejects metadata-only primitive quadruped cheats", () => {
    const good = buildMidnightHorseParts();
    const cheat = good.filter((p) => p.name !== "body_skin");
    const score = scoreHorseAnatomy(cheat);
    expect(score.metrics.continuousSkin).toBe(0);
    expect(score.metrics.sideSilhouette).toBeLessThan(0.5);
    expect(score.score).toBeLessThan(0.72);
  });
});
