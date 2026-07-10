import { describe, it, expect } from "vitest";
import { buildMaterialStackParts, MATERIAL_STACK_DEFAULTS } from "../src/models/material-stack.js";

describe("material-stack (CitySample Kit_Pallet/Lumber/Plywood/SandBag)", () => {
  it("always builds pallets with geometry", () => {
    const parts = buildMaterialStackParts();
    const pallets = parts.find((p) => p.name === "pallets")!;
    expect(pallets).toBeTruthy();
    expect(pallets.mesh.positions.length).toBeGreaterThan(0);
  });

  it("is deterministic (seeded cargo choice + jitter)", () => {
    const a = buildMaterialStackParts({ seed: 4 });
    const b = buildMaterialStackParts({ seed: 4 });
    expect(a.map((p) => p.name)).toEqual(b.map((p) => p.name));
    const ap = a.find((p) => p.name === "pallets")!;
    const bp = b.find((p) => p.name === "pallets")!;
    expect(ap.mesh.positions).toEqual(bp.mesh.positions);
  });

  it("single cargo kind yields exactly that cargo part", () => {
    const lumber = buildMaterialStackParts({ cargo: "lumber", pallets: 2 });
    expect(lumber.some((p) => p.name === "lumber")).toBe(true);
    expect(lumber.some((p) => p.name === "plywood")).toBe(false);
    expect(lumber.some((p) => p.name === "sandbags")).toBe(false);

    const sand = buildMaterialStackParts({ cargo: "sandbag", pallets: 2 });
    expect(sand.some((p) => p.name === "sandbags")).toBe(true);
    expect(sand.some((p) => p.name === "lumber")).toBe(false);
  });

  it("more pallets means more pallet geometry", () => {
    const few = buildMaterialStackParts({ pallets: 1, cargo: "lumber" });
    const many = buildMaterialStackParts({ pallets: 4, cargo: "lumber" });
    const fp = few.find((p) => p.name === "pallets")!.mesh.positions.length;
    const mp = many.find((p) => p.name === "pallets")!.mesh.positions.length;
    expect(mp).toBeGreaterThan(fp);
  });

  it("straps flag toggles strap part for lumber cargo", () => {
    const withStraps = buildMaterialStackParts({ cargo: "lumber", straps: true });
    const noStraps = buildMaterialStackParts({ cargo: "lumber", straps: false });
    expect(withStraps.some((p) => p.name === "straps")).toBe(true);
    expect(noStraps.some((p) => p.name === "straps")).toBe(false);
  });

  it("default pallet count is 3", () => {
    expect(MATERIAL_STACK_DEFAULTS.pallets).toBe(3);
  });
});
