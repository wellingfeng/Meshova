import { describe, expect, it } from "vitest";
import {
  SOLARIS_MARKET_DEFAULTS,
  buildSolarisMarketParts,
  merge,
  summarizeSolarisMarket,
  type NamedPart,
} from "../src/index.js";

function mergedMesh(parts: NamedPart[]) {
  return merge(...parts.map((p) => p.mesh));
}

function allFinite(parts: NamedPart[]): boolean {
  for (const part of parts) {
    for (const p of part.mesh.positions) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return false;
    }
  }
  return true;
}

describe("Solaris market generator", () => {
  it("builds expected semantic scene groups", () => {
    const names = buildSolarisMarketParts().map((p) => p.name);
    expect(names).toContain("sand_dunes");
    expect(names).toContain("stall_frames");
    expect(names).toContain("stall_canopies");
    expect(names).toContain("back_shelves");
    expect(names).toContain("glass_jars");
    expect(names).toContain("jar_lids");
    expect(names).toContain("wooden_crates");
    expect(names).toContain("background_walls");
    expect(names).toContain("warm_lamp_glow");
  });

  it("attaches matched procedural surfaces", () => {
    const parts = buildSolarisMarketParts();
    expect(parts.find((p) => p.name === "sand_dunes")?.surface?.type).toBe("sand");
    expect(parts.find((p) => p.name === "stall_canopies")?.surface?.type).toBe("fabric");
    expect(parts.find((p) => p.name === "glass_jars")?.surface?.type).toBe("glass");
    expect(parts.find((p) => p.name === "jar_lids")?.surface?.type).toBe("metal");
    expect(parts.find((p) => p.name === "background_roofs")?.surface?.type).toBe("stylizedRoof");
    expect(parts.find((p) => p.name === "palm_trunks")?.surface?.type).toBe("bark");
    expect(parts.find((p) => p.name === "palm_fronds")?.surface?.type).toBe("leaf");
  });

  it("uses the procedural vegetation palm system for background trees", () => {
    const parts = buildSolarisMarketParts();
    const trunks = parts.find((p) => p.name === "palm_trunks")!;
    const fronds = parts.find((p) => p.name === "palm_fronds")!;
    expect(trunks.mesh.positions.length).toBeGreaterThan(900);
    expect(fronds.mesh.positions.length).toBeGreaterThan(2000);
  });

  it("is deterministic for fixed seed", () => {
    const a = mergedMesh(buildSolarisMarketParts({ seed: 99 }));
    const b = mergedMesh(buildSolarisMarketParts({ seed: 99 }));
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });

  it("responds to jar count parameter", () => {
    const few = buildSolarisMarketParts({ jarsPerShelf: 3, propDensity: 1, seed: 12 });
    const many = buildSolarisMarketParts({ jarsPerShelf: 14, propDensity: 1, seed: 12 });
    const fewJars = few.find((p) => p.name === "glass_jars")!;
    const manyJars = many.find((p) => p.name === "glass_jars")!;
    expect(manyJars.mesh.positions.length).toBeGreaterThan(fewJars.mesh.positions.length);
  });

  it("has finite geometry and useful scene scale", () => {
    const parts = buildSolarisMarketParts();
    const summary = summarizeSolarisMarket(parts);
    expect(allFinite(parts)).toBe(true);
    expect(summary.parts).toBeGreaterThan(12);
    expect(summary.triangles).toBeGreaterThan(1000);
    expect(summary.width).toBeGreaterThan(10);
    expect(summary.depth).toBeGreaterThan(9);
    expect(summary.height).toBeGreaterThan(3);
    expect(SOLARIS_MARKET_DEFAULTS.stalls).toBeGreaterThan(0);
  });
});
