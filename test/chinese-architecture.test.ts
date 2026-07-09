import { describe, expect, it } from "vitest";
import {
  buildChineseHallParts,
  bounds,
  merge,
  triangleCount,
  CHINESE_HALL_DEFAULTS,
  type NamedPart,
} from "../src/index.js";

function partBounds(parts: NamedPart[], name: string) {
  const p = parts.find((q) => q.name === name)!;
  return bounds(p.mesh);
}

function allFinite(parts: NamedPart[]) {
  for (const part of parts) {
    for (const v of part.mesh.positions) {
      if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) return false;
    }
  }
  return true;
}

describe("chinese classical hall", () => {
  it("builds the layered named parts with matched surfaces", () => {
    const parts = buildChineseHallParts();
    const names = parts.map((p) => p.name);
    for (const n of ["platform", "steps", "columns", "architrave", "dougong", "roof", "ridge", "walls", "doors", "ridgeBeasts"]) {
      expect(names).toContain(n);
    }
    // roof tiles are ceramic, columns are painted wood, platform is stone
    expect(parts.find((p) => p.name === "roof")!.surface?.type).toBe("ceramic");
    expect(parts.find((p) => p.name === "columns")!.surface?.type).toBe("wood");
    expect(parts.find((p) => p.name === "platform")!.surface?.type).toBe("stone");
  });

  it("stacks the anatomy in the correct vertical order (base < columns < dougong < roof)", () => {
    const parts = buildChineseHallParts();
    const base = partBounds(parts, "platform");
    const cols = partBounds(parts, "columns");
    const dg = partBounds(parts, "dougong");
    const roof = partBounds(parts, "roof");
    // platform sits on the ground, columns rise off the platform top
    expect(base.min.y).toBeGreaterThanOrEqual(-1e-3);
    expect(cols.min.y).toBeGreaterThanOrEqual(base.max.y - 1e-3);
    // dougong caps the columns, roof sits above the brackets
    expect(dg.min.y).toBeGreaterThanOrEqual(cols.max.y - 1e-3);
    expect(roof.min.y).toBeGreaterThan(dg.min.y);
    // roof ridge is the highest structural element
    expect(roof.max.y).toBeGreaterThan(cols.max.y);
  });

  it("gives the roof an upturned corner (翼角 higher than mid-eave)", () => {
    const parts = buildChineseHallParts({ cornerUpturn: 1.0 });
    const roof = parts.find((p) => p.name === "roof")!;
    // sample the lowest ring (eave). Corner vertices (max |x|) should sit higher
    // than the mid-span eave vertices — that is the upturn.
    const b = bounds(roof.mesh);
    const eaveBand = roof.mesh.positions.filter((v) => v.y < b.min.y + (b.max.y - b.min.y) * 0.25);
    let cornerY = -Infinity;
    let midY = Infinity;
    for (const v of eaveBand) {
      if (Math.abs(v.x) > b.max.x * 0.85) cornerY = Math.max(cornerY, v.y);
      if (Math.abs(v.x) < b.max.x * 0.15) midY = Math.min(midY, v.y);
    }
    expect(cornerY).toBeGreaterThan(midY);
  });

  it("eaves overhang the column grid (出檐)", () => {
    const p = { ...CHINESE_HALL_DEFAULTS };
    const parts = buildChineseHallParts(p);
    const cols = partBounds(parts, "columns");
    const roof = partBounds(parts, "roof");
    expect(roof.max.x).toBeGreaterThan(cols.max.x);
    expect(roof.max.z).toBeGreaterThan(cols.max.z);
  });

  it("is deterministic and finite for a given seed", () => {
    const a = buildChineseHallParts({ seed: 21 });
    const b = buildChineseHallParts({ seed: 21 });
    expect(allFinite(a)).toBe(true);
    expect(triangleCount(merge(...a.map((p) => p.mesh)))).toBe(
      triangleCount(merge(...b.map((p) => p.mesh))),
    );
    // same seed -> identical first ridge-beast vertex
    const ra = a.find((p) => p.name === "ridgeBeasts")!.mesh.positions[0]!;
    const rb = b.find((p) => p.name === "ridgeBeasts")!.mesh.positions[0]!;
    expect(ra.x).toBe(rb.x);
    expect(ra.y).toBe(rb.y);
    expect(ra.z).toBe(rb.z);
  });

  it("respects the gable roof toggle (no hip end slopes)", () => {
    const hip = buildChineseHallParts({ roof: "hip" });
    const gable = buildChineseHallParts({ roof: "gable" });
    const hipTris = triangleCount(hip.find((p) => p.name === "roof")!.mesh);
    const gableTris = triangleCount(gable.find((p) => p.name === "roof")!.mesh);
    // hip roof has 4 slopes, gable only 2 -> fewer triangles
    expect(gableTris).toBeLessThan(hipTris);
  });
});

