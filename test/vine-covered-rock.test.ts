import { describe, expect, it } from "vitest";

import { buildVineCoveredRockParts, triangleCount } from "../src/index.js";

describe("vine-covered rock", () => {
  it("builds semantic rock and vegetation layers", () => {
    const parts = buildVineCoveredRockParts({ rockCount: 3, coverage: 0.4, lod: 3 });
    expect(parts.some((part) => part.name === "rock_pillars")).toBe(true);
    expect(parts.some((part) => part.name === "vine_stems")).toBe(true);
    expect(parts.some((part) => part.name === "ivy_mature")).toBe(true);
    expect(parts.every((part) => part.label && !/^component_|^root\./.test(part.label))).toBe(true);
    expect(parts.every((part) => triangleCount(part.mesh) > 0)).toBe(true);
  });

  it("is deterministic for the same recipe", () => {
    const options = { seed: 19, rockCount: 3, coverage: 0.35, lod: 3 } as const;
    const first = buildVineCoveredRockParts(options);
    const second = buildVineCoveredRockParts(options);
    expect(second.map((part) => part.name)).toEqual(first.map((part) => part.name));
    expect(second.map((part) => part.mesh.positions)).toEqual(first.map((part) => part.mesh.positions));
  });
});
