import { describe, expect, it } from "vitest";
import {
  buildReferenceDogParts,
  scoreDogAnatomy,
  triangleCount,
} from "../src/index.js";

describe("reference dog procedural template", () => {
  it("builds a deterministic dog with canine-specific parts", () => {
    const a = buildReferenceDogParts();
    const b = buildReferenceDogParts();
    expect(a.map((p) => p.name)).toEqual(b.map((p) => p.name));
    expect(a.length).toBeGreaterThanOrEqual(18);
    expect(a.reduce((sum, p) => sum + triangleCount(p.mesh), 0)).toBeGreaterThan(3600);
    expect(a.find((p) => p.name === "body_skin")?.surface?.type).toBe("shortCoat");
    expect(a.find((p) => p.name === "front_paw_1")?.surface?.type).toBe("shortCoat");
    expect(a.find((p) => p.name === "nose")?.surface?.type).toBe("rubber");
    expect(a.find((p) => p.name === "tongue")?.surface?.type).toBe("plastic");
    expect(a.find((p) => p.name === "eye_1")?.surface?.type).toBe("glossPaint");
    expect(a.some((p) => p.name === "mane")).toBe(false);
  });

  it("passes the quadruped dog gate", () => {
    const quality = scoreDogAnatomy(buildReferenceDogParts());
    expect(quality.score).toBeGreaterThanOrEqual(0.78);
    expect(quality.metrics.continuousSkin).toBeGreaterThan(0.78);
    expect(quality.metrics.sideSilhouette).toBeGreaterThan(0.78);
    expect(quality.metrics.materialMatch).toBeGreaterThan(0.9);
    expect(quality.metrics.limbLayout).toBeGreaterThan(0.9);
    expect(quality.metrics.groundContact).toBeGreaterThan(0.88);
  });

  it("penalizes missing dog face or paw layout", () => {
    const good = buildReferenceDogParts();
    const bad = good.filter((p) => p.name !== "nose" && p.name !== "tongue" && p.name !== "front_paw_1");
    const goodScore = scoreDogAnatomy(good);
    const badScore = scoreDogAnatomy(bad);
    expect(badScore.score).toBeLessThan(goodScore.score);
    expect(badScore.metrics.requiredParts).toBeLessThan(1);
    expect(badScore.metrics.groundContact).toBeLessThan(goodScore.metrics.groundContact);
  });
});
