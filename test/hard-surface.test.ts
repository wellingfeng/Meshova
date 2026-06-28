import { describe, expect, it } from "vitest";
import {
  HARD_SURFACE_KIT_DEFAULTS,
  bounds,
  buildHardSurfaceKitParts,
  merge,
  scoreHardSurfaceKit,
  triangleCount,
  vertexCount,
  type NamedPart,
} from "../src/index.js";

function merged(parts: NamedPart[]) {
  return merge(...parts.map((p) => p.mesh));
}

describe("procedural hard-surface kit", () => {
  it("builds chassis, panels and mechanical details with matched surfaces", () => {
    const parts = buildHardSurfaceKitParts();
    const names = parts.map((p) => p.name);
    expect(names).toContain("chassis");
    expect(names).toContain("front_recessed_panel");
    expect(names).toContain("top_service_panel");
    expect(names).toContain("armor_panels");
    expect(names).toContain("vents");
    expect(names).toContain("bolts");
    expect(names).toContain("pipes");
    expect(names).toContain("greebles");
    expect(parts.find((p) => p.name === "chassis")!.surface?.type).toBe("carPaint");
    expect(parts.find((p) => p.name === "vents")!.surface?.type).toBe("plastic");
    expect(parts.find((p) => p.name === "bolts")!.surface?.type).toBe("metal");
  });

  it("is deterministic for fixed params", () => {
    const a = merged(buildHardSurfaceKitParts({ seed: 17, greebles: 20, bolts: 12 }));
    const b = merged(buildHardSurfaceKitParts({ seed: 17, greebles: 20, bolts: 12 }));
    expect(vertexCount(a)).toBe(vertexCount(b));
    expect(triangleCount(a)).toBe(triangleCount(b));
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });

  it("seed changes greeble placement without changing topology", () => {
    const a = buildHardSurfaceKitParts({ seed: 1, greebles: 18 }).find((p) => p.name === "greebles")!.mesh;
    const b = buildHardSurfaceKitParts({ seed: 99, greebles: 18 }).find((p) => p.name === "greebles")!.mesh;
    expect(vertexCount(a)).toBe(vertexCount(b));
    expect(a.positions).not.toEqual(b.positions);
  });

  it("width height depth control chassis bounds", () => {
    const parts = buildHardSurfaceKitParts({ width: 4, height: 1.5, depth: 2.5 });
    const chassis = parts.find((p) => p.name === "chassis")!.mesh;
    const bb = bounds(chassis);
    expect(bb.max.x - bb.min.x).toBeCloseTo(4);
    expect(bb.max.y - bb.min.y).toBeCloseTo(1.5);
    expect(bb.max.z - bb.min.z).toBeCloseTo(2.5);
  });

  it("panel grid controls armor geometry", () => {
    const low = buildHardSurfaceKitParts({ panelCols: 1, panelRows: 1 }).find((p) => p.name === "armor_panels")!.mesh;
    const high = buildHardSurfaceKitParts({ panelCols: 4, panelRows: 3 }).find((p) => p.name === "armor_panels")!.mesh;
    expect(vertexCount(high)).toBeGreaterThan(vertexCount(low));
  });

  it("vent grid controls vent geometry", () => {
    const low = buildHardSurfaceKitParts({ ventCols: 1, ventRows: 1 }).find((p) => p.name === "vents")!.mesh;
    const high = buildHardSurfaceKitParts({ ventCols: 4, ventRows: 5 }).find((p) => p.name === "vents")!.mesh;
    expect(vertexCount(high)).toBeGreaterThan(vertexCount(low));
  });

  it("greeble count controls micro-detail geometry", () => {
    const few = buildHardSurfaceKitParts({ greebles: 4 }).find((p) => p.name === "greebles")!.mesh;
    const many = buildHardSurfaceKitParts({ greebles: 30 }).find((p) => p.name === "greebles")!.mesh;
    expect(vertexCount(many)).toBeGreaterThan(vertexCount(few));
  });

  it("scores a complete kit higher than chassis-only", () => {
    const full = buildHardSurfaceKitParts();
    const chassisOnly = full.filter((p) => p.name === "chassis");
    const fullScore = scoreHardSurfaceKit(full);
    const sparseScore = scoreHardSurfaceKit(chassisOnly);
    expect(fullScore.score).toBeGreaterThan(0.75);
    expect(fullScore.score).toBeGreaterThan(sparseScore.score);
    expect(fullScore.metrics.paneling).toBe(1);
  });

  it("exposes sane defaults", () => {
    expect(HARD_SURFACE_KIT_DEFAULTS.width).toBeGreaterThan(0);
    expect(HARD_SURFACE_KIT_DEFAULTS.greebles).toBeGreaterThan(0);
  });
});
