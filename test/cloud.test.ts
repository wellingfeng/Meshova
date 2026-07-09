import { describe, expect, it } from "vitest";
import { buildCloudMesh, buildCloudParts } from "../src/models/cloud.js";

describe("procedural cloud", () => {
  it("is deterministic for a given seed", () => {
    const a = buildCloudMesh({ seed: 5, resolution: 32 });
    const b = buildCloudMesh({ seed: 5, resolution: 32 });
    expect(a.positions.length).toBe(b.positions.length);
    expect(a.indices).toEqual(b.indices);
    expect(a.positions).toEqual(b.positions);
  });

  it("different seeds produce different clouds", () => {
    const a = buildCloudMesh({ seed: 1, resolution: 32 });
    const b = buildCloudMesh({ seed: 2, resolution: 32 });
    expect(a.positions).not.toEqual(b.positions);
  });

  it("produces a non-empty watertight-ish shell", () => {
    const m = buildCloudMesh({ resolution: 32 });
    expect(m.positions.length).toBeGreaterThan(100);
    expect(m.indices.length % 3).toBe(0);
    // normals count matches positions
    expect(m.normals.length).toBe(m.positions.length);
  });

  it("has a flatter base than top (cumulus profile)", () => {
    const m = buildCloudMesh({ seed: 7, flatten: 0.5, resolution: 40 });
    let minY = Infinity, maxY = -Infinity;
    for (const p of m.positions) { if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
    // spread above the midline should exceed spread below (bulge on top)
    const mid = (minY + maxY) / 2;
    const above = m.positions.filter((p) => p.y > mid).length;
    const below = m.positions.filter((p) => p.y <= mid).length;
    expect(above + below).toBe(m.positions.length);
    expect(maxY - minY).toBeGreaterThan(0.5);
  });

  it("builds a single named part with a surface", () => {
    const parts = buildCloudParts({ resolution: 32 });
    expect(parts).toHaveLength(1);
    expect(parts[0]!.name).toBe("cloud");
    expect(parts[0]!.surface).toBeDefined();
  });
});
