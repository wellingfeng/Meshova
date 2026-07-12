import { describe, it, expect } from "vitest";
import { textMesh, textMeshWidth, glyphSupported, bounds } from "../src/index.js";

describe("procedural glyph geometry", () => {
  it("renders non-empty geometry for supported text", () => {
    const m = textMesh("MAIN ST", { height: 1 });
    expect(m.positions.length).toBeGreaterThan(0);
    expect(m.indices.length % 3).toBe(0);
  });

  it("blank/space text yields empty mesh", () => {
    const m = textMesh("   ", { height: 1 });
    expect(m.positions.length).toBe(0);
  });

  it("is centered on origin in X and Y", () => {
    const b = bounds(textMesh("ABC", { height: 2 }));
    const cx = (b.min.x + b.max.x) / 2;
    const cy = (b.min.y + b.max.y) / 2;
    expect(Math.abs(cx)).toBeLessThan(1e-6);
    expect(Math.abs(cy)).toBeLessThan(1e-6);
  });

  it("height controls glyph cell height", () => {
    const b1 = bounds(textMesh("8", { height: 1 }));
    const b2 = bounds(textMesh("8", { height: 2 }));
    const h1 = b1.max.y - b1.min.y;
    const h2 = b2.max.y - b2.min.y;
    expect(h2).toBeGreaterThan(h1 * 1.8);
  });

  it("longer strings are wider", () => {
    expect(textMeshWidth("AB", { height: 1 })).toBeLessThan(textMeshWidth("ABCDE", { height: 1 }));
  });

  it("width helper approximates rendered geometry bounds", () => {
    // The helper is an analytical layout estimate (full cell advance); the
    // rendered run is marginally narrower by the dot fill gap. Within ~1%.
    const w = textMeshWidth("HARBOR", { height: 1.5 });
    const b = bounds(textMesh("HARBOR", { height: 1.5 }));
    const rendered = b.max.x - b.min.x;
    expect(Math.abs(rendered - w) / w).toBeLessThan(0.02);
  });

  it("is deterministic (same text -> identical mesh)", () => {
    const a = textMesh("EXIT 42", { height: 1 });
    const b = textMesh("EXIT 42", { height: 1 });
    expect(a.positions).toEqual(b.positions);
  });

  it("reports glyph coverage", () => {
    expect(glyphSupported("A")).toBe(true);
    expect(glyphSupported("z")).toBe(true); // case-insensitive
    expect(glyphSupported("5")).toBe(true);
    expect(glyphSupported("@")).toBe(false);
  });

  it("unsupported characters skip cleanly without crashing", () => {
    const m = textMesh("A@B", { height: 1 });
    expect(m.positions.length).toBeGreaterThan(0);
  });
});
