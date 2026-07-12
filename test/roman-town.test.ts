import { describe, expect, it } from "vitest";
import {
  ROMAN_TOWN_DEFAULTS,
  buildRomanTownParts,
  buildSurface,
  materialFromFields,
  merge,
  romanCobblestone,
  summarizeRomanTown,
  terracottaRoof,
  triangleCount,
  validateMaterial,
  weatheredPlaster,
  type NamedPart,
} from "../src/index.js";

function validateParts(parts: NamedPart[]): void {
  expect(parts.length).toBeGreaterThan(12);
  for (const part of parts) {
    expect(part.label?.length, `${part.name} semantic label`).toBeGreaterThan(0);
    expect(triangleCount(part.mesh), `${part.name} triangles`).toBeGreaterThan(0);
    expect(part.mesh.positions.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))).toBe(true);
  }
}

describe("Roman town generator", () => {
  it("builds all six requested style systems", () => {
    const parts = buildRomanTownParts({ blocksX: 2, blocksZ: 2, piazza: true, seed: 17 });
    validateParts(parts);
    const names = parts.map((part) => part.name);
    expect(names.some((name) => name.startsWith("weathered_plaster_"))).toBe(true);
    expect(names).toContain("terracotta_hip_roofs");
    expect(names).toContain("roman_window_surrounds");
    expect(names).toContain("arched_shopfront_frames");
    expect(names).toContain("sampietrini_streets");
    expect(names).toContain("roof_terrace_decks");
    expect(names).toContain("central_piazza");
  });

  it("is deterministic for same params and seed", () => {
    const params = { blocksX: 2, blocksZ: 1, piazza: false, seed: 91 };
    const a = merge(...buildRomanTownParts(params).map((part) => part.mesh));
    const b = merge(...buildRomanTownParts(params).map((part) => part.mesh));
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });

  it("keeps practical defaults and district-scale bounds", () => {
    expect(ROMAN_TOWN_DEFAULTS.streetWidth).toBeLessThan(6);
    expect(ROMAN_TOWN_DEFAULTS.minFloors).toBeGreaterThanOrEqual(4);
    const summary = summarizeRomanTown(buildRomanTownParts({ blocksX: 1, blocksZ: 1, piazza: false }));
    expect(summary.width).toBeGreaterThan(20);
    expect(summary.height).toBeGreaterThan(4);
    expect(summary.triangles).toBeGreaterThan(1000);
  });
});

describe("Roman procedural surfaces", () => {
  it.each([
    ["weatheredPlaster", weatheredPlaster({ seed: 1 })],
    ["terracottaRoof", terracottaRoof({ seed: 2 })],
    ["romanCobblestone", romanCobblestone({ seed: 3 })],
  ])("bakes valid %s PBR channels", (_name, fields) => {
    expect(validateMaterial(materialFromFields(32, fields))).toEqual([]);
  });

  it.each(["weatheredPlaster", "terracottaRoof", "romanCobblestone"])(
    "registers %s in surface library",
    (name) => {
      expect(buildSurface(name)).not.toBeNull();
    },
  );
});

