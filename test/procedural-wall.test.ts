import { describe, expect, it } from "vitest";
import {
  buildPcgPalisadeWallParts,
  buildProceduralWallLayout,
  buildSplineStoneWallParts,
  triangleCount,
  vertexCount,
} from "../src/index.js";

describe("procedural wall", () => {
  it("resamples an editable guide into deterministic spans", () => {
    const first = buildProceduralWallLayout({ seed: 8 });
    const second = buildProceduralWallLayout({ seed: 8 });
    expect(first).toEqual(second);
    expect(first.guide.closed).toBe(true);
    expect(first.spans.length).toBeGreaterThan(20);
    expect(first.spans.some((span) => span.gate)).toBe(true);
  });

  it("builds a closed PCG palisade with gate and banners", () => {
    const parts = buildPcgPalisadeWallParts({ banners: 4, gateWidth: 3 });
    expect(parts.map((part) => part.name)).toEqual([
      "palisade_stakes",
      "palisade_rails",
      "fortified_gate",
      "banner_poles",
      "banner_cloth",
      "banner_trim",
    ]);
    for (const part of parts) {
      expect(vertexCount(part.mesh)).toBeGreaterThan(0);
      expect(triangleCount(part.mesh)).toBeGreaterThan(0);
      expect(part.label).toBeTruthy();
    }
  });

  it("builds an open terrain-following stone wall", () => {
    const layout = buildProceduralWallLayout({
      style: "stone",
      enclosure: false,
      gateWidth: 0,
      terrain: 1,
    });
    expect(layout.guide.closed).toBe(false);
    expect(layout.frames[0]!.center.y).not.toBe(layout.frames[Math.floor(layout.frames.length / 2)]!.center.y);

    const parts = buildSplineStoneWallParts({ detail: 4 });
    expect(parts[0]!.name).toBe("stone_mortar_core");
    expect(parts.at(-1)!.name).toBe("stone_coping");
    expect(parts.length).toBeGreaterThanOrEqual(4);
    expect(parts.every((part) => vertexCount(part.mesh) > 0)).toBe(true);
  });
});
