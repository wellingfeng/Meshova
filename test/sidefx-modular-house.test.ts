import { describe, expect, it } from "vitest";
import {
  SIDEFX_HOUSE_KIT,
  bounds,
  buildSidefxModularHouseParts,
  createSidefxHouseSlots,
  isSidefxHouseModuleCompatible,
  planSidefxHouseModules,
  scoreSidefxModularHouse,
  summarizeSidefxModularHouse,
  triangleCount,
  type NamedPart,
} from "../src/index.js";

function allFinite(parts: NamedPart[]): boolean {
  for (const part of parts) {
    for (const p of part.mesh.positions) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return false;
    }
  }
  return true;
}

describe("SideFX-style modular house", () => {
  it("creates semantic module slots with convex and concave corners", () => {
    const slots = createSidefxHouseSlots({ layout: "lWing", seed: 4 });
    expect(slots.some((slot) => slot.kind === "door")).toBe(true);
    expect(slots.some((slot) => slot.cornerType === "convex")).toBe(true);
    expect(slots.some((slot) => slot.cornerType === "concave")).toBe(true);
    for (const slot of slots) {
      expect(slot.label).not.toMatch(/^(root|component_|object_|mesh_|\d|.*\.\d+$)/i);
      expect(slot.label.length).toBeGreaterThan(4);
    }
  });

  it("plans compatible modules deterministically", () => {
    const slots = createSidefxHouseSlots({ seed: 19, shutterDensity: 1 });
    const a = planSidefxHouseModules(slots, SIDEFX_HOUSE_KIT, 99);
    const b = planSidefxHouseModules(slots, SIDEFX_HOUSE_KIT, 99);
    expect(a.map((placement) => placement.asset.id)).toEqual(b.map((placement) => placement.asset.id));
    for (const placement of a) {
      expect(isSidefxHouseModuleCompatible(placement.asset, placement.slot)).toBe(true);
    }
    expect(a.some((placement) => placement.asset.id === "shuttered-window")).toBe(true);
  });

  it("builds a finite modular house with expected groups", () => {
    const parts = buildSidefxModularHouseParts({
      layout: "lWing",
      floors: 2,
      seed: 77,
      shutterDensity: 1,
      balconyDensity: 0.5,
    });
    const names = parts.map((part) => part.name);
    expect(names).toContain("brick_wall_modules");
    expect(names).toContain("window_frames");
    expect(names).toContain("window_glass");
    expect(names).toContain("entrance_doors");
    expect(names).toContain("cross_gable_roofs");
    expect(names).toContain("convex_corner_stones");
    expect(names).toContain("concave_corner_stones");
    expect(allFinite(parts)).toBe(true);
    expect(parts.reduce((sum, part) => sum + triangleCount(part.mesh), 0)).toBeGreaterThan(450);
    expect(scoreSidefxModularHouse(parts).score).toBeGreaterThan(0.85);
  });

  it("gives roof planes non-degenerate tile UVs and roof material", () => {
    const parts = buildSidefxModularHouseParts({ layout: "lWing", seed: 42 });
    const roof = parts.find((part) => part.name === "cross_gable_roofs");
    expect(roof).toBeDefined();
    expect(roof!.surface?.type).toBe("slateRoof");

    let minUvArea = Infinity;
    for (let i = 0; i < roof!.mesh.indices.length; i += 3) {
      const a = roof!.mesh.uvs[roof!.mesh.indices[i]!]!;
      const b = roof!.mesh.uvs[roof!.mesh.indices[i + 1]!]!;
      const c = roof!.mesh.uvs[roof!.mesh.indices[i + 2]!]!;
      const area = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) * 0.5;
      minUvArea = Math.min(minUvArea, area);
    }

    const us = roof!.mesh.uvs.map((uv) => uv.x);
    expect(Math.max(...us) - Math.min(...us)).toBeGreaterThan(1.2);
    expect(minUvArea).toBeGreaterThan(1e-4);
  });

  it("roof pitch changes silhouette height without moving the footprint", () => {
    const low = buildSidefxModularHouseParts({ roofPitch: 0.35, seed: 12 });
    const high = buildSidefxModularHouseParts({ roofPitch: 0.9, seed: 12 });
    const lowSummary = summarizeSidefxModularHouse(low);
    const highSummary = summarizeSidefxModularHouse(high);
    expect(highSummary.height).toBeGreaterThan(lowSummary.height + 0.5);

    const lowB = bounds(low.find((part) => part.name === "brick_wall_modules")!.mesh);
    const highB = bounds(high.find((part) => part.name === "brick_wall_modules")!.mesh);
    expect(highB.max.x - highB.min.x).toBeCloseTo(lowB.max.x - lowB.min.x);
    expect(highB.max.z - highB.min.z).toBeCloseTo(lowB.max.z - lowB.min.z);
  });
});
