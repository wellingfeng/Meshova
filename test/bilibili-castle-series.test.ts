import { describe, expect, it } from "vitest";
import {
  BILIBILI_CASTLE_SERIES,
  bounds,
  buildBilibiliCastleSeriesParts,
  triangleCount,
} from "../src/index.js";

describe("bilibili castle series", () => {
  it.each(BILIBILI_CASTLE_SERIES)("builds $name from part $part", (definition) => {
    const parts = buildBilibiliCastleSeriesParts({
      variant: definition.variant,
      seed: definition.seed,
      detail: 0.6,
    });

    expect(parts.length).toBeGreaterThanOrEqual(4);
    expect(parts.every((part) => part.label && !part.label.includes("_"))).toBe(true);
    expect(parts.every((part) => triangleCount(part.mesh) > 0)).toBe(true);
    expect(parts.every((part) => part.metadata?.sourceStudy === `https://www.bilibili.com/video/BV1XhZvBwEAF?p=${definition.part}`)).toBe(true);
  });

  it("is deterministic for every source variant", () => {
    for (const definition of BILIBILI_CASTLE_SERIES) {
      const first = buildBilibiliCastleSeriesParts({ variant: definition.variant, seed: definition.seed, detail: 0.55 });
      const second = buildBilibiliCastleSeriesParts({ variant: definition.variant, seed: definition.seed, detail: 0.55 });
      expect(first.map((part) => part.name)).toEqual(second.map((part) => part.name));
      expect(first.map((part) => part.mesh.positions.length)).toEqual(second.map((part) => part.mesh.positions.length));
    }
  });

  it("scales complete castles", () => {
    const small = buildBilibiliCastleSeriesParts({ variant: "grand-manor", scale: 0.6 });
    const large = buildBilibiliCastleSeriesParts({ variant: "grand-manor", scale: 1.4 });
    const smallBounds = bounds(small.find((part) => part.name === "terrain")!.mesh);
    const largeBounds = bounds(large.find((part) => part.name === "terrain")!.mesh);

    expect(largeBounds.max.x - largeBounds.min.x).toBeGreaterThan((smallBounds.max.x - smallBounds.min.x) * 2.2);
  });
});
