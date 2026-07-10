import { describe, it, expect } from "vitest";
import { buildTitanPlatformParts, TITAN_PLATFORM_DEFAULTS } from "../src/models/titan-platform.js";

describe("titan-platform (Tutorial_platform.hda)", () => {
  it("builds deck, legs and rail", () => {
    const parts = buildTitanPlatformParts();
    const names = parts.map((p) => p.name);
    expect(names).toContain("deck");
    expect(names).toContain("legs");
    expect(names).toContain("rail");
    for (const p of parts) expect(p.mesh.positions.length).toBeGreaterThan(0);
  });

  it("border=false drops the rail", () => {
    const parts = buildTitanPlatformParts({ border: false });
    expect(parts.find((p) => p.name === "rail")).toBeUndefined();
  });

  it("longer platform => more deck planks", () => {
    const short = buildTitanPlatformParts({ length: 4 });
    const long = buildTitanPlatformParts({ length: 16 });
    const sd =
      short.find((p) => p.name === "deck")!.mesh.positions.length +
      short.find((p) => p.name === "deck_alt")!.mesh.positions.length;
    const ld =
      long.find((p) => p.name === "deck")!.mesh.positions.length +
      long.find((p) => p.name === "deck_alt")!.mesh.positions.length;
    expect(ld).toBeGreaterThan(sd);
  });

  it("is deterministic", () => {
    const a = buildTitanPlatformParts({ width: 6 });
    const b = buildTitanPlatformParts({ width: 6 });
    expect(a.find((p) => p.name === "deck")!.mesh.positions).toEqual(
      b.find((p) => p.name === "deck")!.mesh.positions,
    );
  });

  it("deck uses a wood surface", () => {
    expect(buildTitanPlatformParts().find((p) => p.name === "deck")!.surface?.type).toBe("wood");
  });

  it("default length is 8m", () => {
    expect(TITAN_PLATFORM_DEFAULTS.length).toBe(8);
  });
});
