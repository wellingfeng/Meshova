import { describe, expect, it } from "vitest";
import {
  bounds,
  buildPcgCartoonHouseParts,
  merge,
  triangleCount,
} from "../src/index.js";

describe("PCG cartoon house", () => {
  it("builds semantic facade and roof parts", () => {
    const parts = buildPcgCartoonHouseParts();
    const names = parts.map((part) => part.name);
    expect(names).toEqual(expect.arrayContaining([
      "foundation",
      "walls",
      "roof",
      "roof_trim",
      "timber_frame",
      "window_frames",
      "window_glass",
      "door",
      "chimney",
    ]));
    expect(parts.every((part) => Boolean(part.label))).toBe(true);
  });

  it("is deterministic for a fixed seed", () => {
    const first = merge(...buildPcgCartoonHouseParts({ seed: 41 }).map((part) => part.mesh));
    const second = merge(...buildPcgCartoonHouseParts({ seed: 41 }).map((part) => part.mesh));
    expect(first.positions).toEqual(second.positions);
    expect(first.indices).toEqual(second.indices);
  });

  it("changes layout when seed changes", () => {
    const first = merge(...buildPcgCartoonHouseParts({ seed: 1 }).map((part) => part.mesh));
    const second = merge(...buildPcgCartoonHouseParts({ seed: 2 }).map((part) => part.mesh));
    expect(first.positions).not.toEqual(second.positions);
  });

  it("responds to size and detail parameters", () => {
    const compact = merge(...buildPcgCartoonHouseParts({ width: 4, chimneyCount: 0 }).map((part) => part.mesh));
    const wide = merge(...buildPcgCartoonHouseParts({ width: 8, chimneyCount: 3, windowCount: 11 }).map((part) => part.mesh));
    const compactBounds = bounds(compact);
    const wideBounds = bounds(wide);
    expect(wideBounds.max.x - wideBounds.min.x).toBeGreaterThan(compactBounds.max.x - compactBounds.min.x);
    expect(triangleCount(wide)).toBeGreaterThan(triangleCount(compact));
  });

  it("attaches stylized PBR surface classes", () => {
    const parts = buildPcgCartoonHouseParts();
    expect(parts.find((part) => part.name === "roof")?.surface?.type).toBe("stylizedRoof");
    expect(parts.find((part) => part.name === "walls")?.surface?.type).toBe("stylizedPlaster");
    expect(parts.find((part) => part.name === "window_glass")?.surface?.type).toBe("glass");
  });
});
