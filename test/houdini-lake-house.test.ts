import { describe, expect, it } from "vitest";
import {
  bounds,
  buildHoudiniLakeHouseParts,
  merge,
  triangleCount,
  type NamedPart,
} from "../src/index.js";

function merged(parts: NamedPart[]) {
  return merge(...parts.map((part) => part.mesh));
}

describe("Houdini lake house reconstruction", () => {
  it("builds all characteristic semantic systems", () => {
    const parts = buildHoudiniLakeHouseParts({
      roofWindowProbability: 1,
      chimneyProbability: 1,
      towerProbability: 1,
    });
    const names = parts.map((part) => part.name);
    expect(names).toContain("lake");
    expect(names).toContain("stone_pier");
    expect(names).toContain("platform_deck");
    expect(names).toContain("timber_walls");
    expect(names).toContain("supports");
    expect(names).toContain("roof");
    expect(names).toContain("window_glass");
    expect(names).toContain("balcony");
    expect(names).toContain("stairs");
    expect(names).toContain("tower");
    expect(names).toContain("chimney");
    expect(names).toContain("metal");
    expect(names).toContain("props");
    expect(names).toContain("lanterns");
    expect(parts.every((part) => part.label && !part.label.match(/^(root|component_|object_)/i))).toBe(true);
    expect(parts.every((part) => part.metadata?.sourceVideo === "https://www.bilibili.com/video/BV1i44y1F7gu/")).toBe(true);
  });

  it("is deterministic for a fixed seed", () => {
    const a = merged(buildHoudiniLakeHouseParts({ seed: 2983 }));
    const b = merged(buildHoudiniLakeHouseParts({ seed: 2983 }));
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });

  it("keeps geometry finite with useful scene scale", () => {
    const parts = buildHoudiniLakeHouseParts();
    for (const part of parts) {
      for (const point of part.mesh.positions) {
        expect(Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)).toBe(true);
      }
    }
    const sceneBounds = bounds(merged(parts));
    expect(sceneBounds.max.y - sceneBounds.min.y).toBeGreaterThan(8);
    expect(sceneBounds.max.x - sceneBounds.min.x).toBeGreaterThan(15);
    expect(parts.reduce((sum, part) => sum + triangleCount(part.mesh), 0)).toBeGreaterThan(1200);
  });

  it("makes roof pitch and walkway length affect silhouette", () => {
    const lowParts = buildHoudiniLakeHouseParts({ roofPitch: 0.35, walkwayLength: 3, towerProbability: 0 });
    const highParts = buildHoudiniLakeHouseParts({ roofPitch: 1.1, walkwayLength: 9, towerProbability: 0 });
    const lowRoof = bounds(lowParts.find((part) => part.name === "roof")!.mesh);
    const highRoof = bounds(highParts.find((part) => part.name === "roof")!.mesh);
    expect(highRoof.max.y).toBeGreaterThan(lowRoof.max.y + 1);
    const lowWalkway = bounds(lowParts.find((part) => part.name === "balcony")!.mesh);
    const highWalkway = bounds(highParts.find((part) => part.name === "balcony")!.mesh);
    expect(highWalkway.max.z).toBeGreaterThan(lowWalkway.max.z + 4);
  });

  it("attaches procedural PBR surface classes", () => {
    const parts = buildHoudiniLakeHouseParts();
    expect(parts.find((part) => part.name === "lake")?.surface?.type).toBe("liquid");
    expect(parts.find((part) => part.name === "roof")?.surface?.type).toBe("slateRoof");
    expect(parts.find((part) => part.name === "timber_walls")?.surface?.type).toBe("wood");
    expect(parts.find((part) => part.name === "window_glass")?.surface?.type).toBe("glass");
  });
});
