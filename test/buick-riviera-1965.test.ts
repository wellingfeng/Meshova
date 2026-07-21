import { describe, expect, it } from "vitest";
import {
  bounds,
  box,
  buildBuickRiviera1965Parts,
  scoreClassicCoupeVehicle,
  triangleCount,
  transform,
  vec3,
} from "../src/index.js";

describe("Buick Riviera 1963-1965 procedural coupe", () => {
  it("builds a deterministic first-gen Riviera style hardtop", () => {
    const a = buildBuickRiviera1965Parts();
    const b = buildBuickRiviera1965Parts();
    expect(a.length).toBeGreaterThan(42);
    expect(a.map((p) => p.name)).toEqual(b.map((p) => p.name));
    expect(a.find((p) => p.name === "pillarless_greenhouse_glass")).toBeTruthy();
    expect(a.find((p) => p.name === "front_buick_trishield_badge")).toBeTruthy();
    expect(a.find((p) => p.name === "front_center_grille")).toBeTruthy();
    expect(a.filter((p) => /^ribbed_clamshell_headlight_/.test(p.name))).toHaveLength(2);
    expect(a.filter((p) => /^whitewall_/.test(p.name))).toHaveLength(4);
    expect(a.reduce((sum, p) => sum + triangleCount(p.mesh), 0)).toBeGreaterThan(5200);

    const quality = scoreClassicCoupeVehicle(a);
    expect(quality.score).toBeGreaterThanOrEqual(0.8);
    expect(quality.metrics.requiredParts).toBe(1);
    expect(quality.metrics.proportions).toBeGreaterThan(0.84);
    expect(quality.metrics.coupeLayout).toBeGreaterThan(0.82);
    expect(quality.metrics.wheelSystem).toBeGreaterThan(0.88);
    expect(quality.metrics.brandSignature).toBeGreaterThan(0.86);
    expect(quality.metrics.vehicleSemantics).toBeGreaterThan(0.9);
    const frameBounds = bounds(a.find((part) => part.name === "hardtop_roof_frame")!.mesh);
    const edgeBounds = bounds(a.find((part) => part.name === "razor_roof_edge")!.mesh);
    expect(edgeBounds.min.y).toBeLessThanOrEqual(frameBounds.max.y + 0.001);
  });

  it("tracks classic coupe proportions when scaled", () => {
    const parts = buildBuickRiviera1965Parts({ length: 5.45, width: 2.0, height: 1.38 });
    const mergedBounds = parts.map((p) => bounds(p.mesh));
    const minX = Math.min(...mergedBounds.map((b) => b.min.x));
    const maxX = Math.max(...mergedBounds.map((b) => b.max.x));
    const minZ = Math.min(...mergedBounds.map((b) => b.min.z));
    const maxZ = Math.max(...mergedBounds.map((b) => b.max.z));
    expect(maxX - minX).toBeGreaterThan(1.95);
    expect(maxZ - minZ).toBeGreaterThan(5.3);
  });

  it("rejects fake arch names and floating whitewall tires", () => {
    const good = buildBuickRiviera1965Parts();
    const bad = good.map((part) => {
      if (/wheel_knife_arches$/.test(part.name)) return { ...part, mesh: box(0.1, 0.1, 0.1) };
      if (/^tire_/.test(part.name)) return { ...part, mesh: transform(part.mesh, { translate: vec3(0, 0.4, 0) }) };
      return part;
    });
    const goodScore = scoreClassicCoupeVehicle(good);
    const badScore = scoreClassicCoupeVehicle(bad);
    expect(badScore.metrics.wheelArchWrap).toBeLessThan(goodScore.metrics.wheelArchWrap);
    expect(badScore.metrics.tireContact).toBeLessThan(goodScore.metrics.tireContact);
    expect(badScore.score).toBeLessThan(goodScore.score);
  });
});
