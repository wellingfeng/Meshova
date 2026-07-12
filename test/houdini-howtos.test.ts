import { describe, expect, it } from "vitest";
import {
  buildBspDungeonParts,
  buildGrowthUrchinParts,
  buildHoudiniHowtosShowcaseParts,
  buildPipeNetworkParts,
  buildReactionDiffusionReliefParts,
  buildSciFiPanelParts,
  buildVoronoiVaseParts,
  buildWovenPotParts,
  bounds,
  meshMetrics,
  summarizeHoudiniHowtos,
  toViewerModel,
  triangleCount,
  vertexCount,
  type NamedPart,
} from "../src/index.js";

function allFinite(parts: readonly NamedPart[]): boolean {
  for (const part of parts) {
    for (const p of part.mesh.positions) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return false;
    }
  }
  return true;
}

function part(parts: readonly NamedPart[], name: string): NamedPart {
  const found = parts.find((p) => p.name === name);
  expect(found).toBeTruthy();
  return found!;
}

describe("HoudiniHowtos gallery models", () => {
  it("builds the non-duplicate recommended technique families", () => {
    const parts = buildHoudiniHowtosShowcaseParts({ seed: 4, scale: 0.75 });
    const summary = summarizeHoudiniHowtos(parts);
    expect(summary.categories.field).toBeGreaterThanOrEqual(2);
    expect(summary.categories.curveGraph).toBeGreaterThanOrEqual(3);
    expect(summary.categories.weave).toBeGreaterThanOrEqual(2);
    expect(summary.categories.panelRemesh).toBeGreaterThanOrEqual(3);
    expect(summary.categories.growth).toBeGreaterThanOrEqual(2);
    expect(summary.categories.dungeon).toBeGreaterThanOrEqual(3);
    expect(summary.categories.vase).toBeGreaterThanOrEqual(2);
    expect(summary.vertexCount).toBeGreaterThan(1000);
    expect(summary.triangleCount).toBeGreaterThan(1000);
    expect(allFinite(parts)).toBe(true);
  });

  it("turns reaction diffusion into a relief mesh with vertex colors", () => {
    const parts = buildReactionDiffusionReliefParts({
      resolution: 18,
      iterations: 8,
      seed: 2,
    });
    const relief = part(parts, "reaction_diffusion_relief");
    expect(vertexCount(relief.mesh)).toBe((18 + 1) * (18 + 1) * 2);
    expect(relief.colors?.length).toBe(vertexCount(relief.mesh) * 3);
    expect(triangleCount(relief.mesh)).toBeGreaterThan(18 * 18);
  });

  it("routes a curve graph into pipes and an accent shortest path", () => {
    const parts = buildPipeNetworkParts({ cols: 4, rows: 3, seed: 9 });
    expect(parts.map((p) => p.name)).toEqual(["pipe_network", "pipe_junctions", "shortest_route"]);
    expect(triangleCount(part(parts, "pipe_network").mesh)).toBeGreaterThan(100);
    expect(triangleCount(part(parts, "shortest_route").mesh)).toBeGreaterThan(0);
  });

  it("wraps weave field relief around a pot profile", () => {
    const parts = buildWovenPotParts({
      segments: 24,
      rows: 12,
      height: 1.8,
      weaveColumns: 8,
      weaveRows: 5,
    });
    const bodyPart = part(parts, "woven_body");
    const body = bodyPart.mesh;
    const bb = bounds(body);
    expect(bb.max.y - bb.min.y).toBeCloseTo(1.8, 3);
    expect(triangleCount(body)).toBeGreaterThan(24 * 12 * 2 + 24);
    expect(meshMetrics(body).watertight).toBe(true);
    expect(bodyPart.doubleSided).toBeUndefined();
    expect(toViewerModel(parts, "woven-pot").parts.find((p) => p.name === "woven_body")?.doubleSided).toBeUndefined();
  });

  it("uses panel counts and greebles to grow hard-surface detail", () => {
    const low = buildSciFiPanelParts({ cols: 2, rows: 2, greebles: 2, seed: 1 });
    const high = buildSciFiPanelParts({ cols: 5, rows: 4, greebles: 16, seed: 1 });
    expect(vertexCount(part(high, "panel_plates").mesh)).toBeGreaterThan(vertexCount(part(low, "panel_plates").mesh));
    expect(vertexCount(part(high, "panel_vents_bolts").mesh)).toBeGreaterThan(vertexCount(part(low, "panel_vents_bolts").mesh));
  });

  it("uses spine count to grow the radial growth asset", () => {
    const low = buildGrowthUrchinParts({ spines: 12, segments: 4, seed: 3 });
    const high = buildGrowthUrchinParts({ spines: 30, segments: 4, seed: 3 });
    expect(triangleCount(part(high, "growth_spines").mesh)).toBeGreaterThan(triangleCount(part(low, "growth_spines").mesh));
  });

  it("splits a BSP dungeon into deterministic rooms and corridors", () => {
    const low = buildBspDungeonParts({ iterations: 2, width: 8, depth: 6, seed: 6 });
    const high = buildBspDungeonParts({ iterations: 4, width: 8, depth: 6, seed: 6 });
    const lowFloor = part(low, "dungeon_floors");
    const highFloor = part(high, "dungeon_floors");
    expect(low.map((p) => p.name)).toEqual(["dungeon_floors", "dungeon_walls", "dungeon_entries"]);
    expect(highFloor.metadata?.rooms).toBeGreaterThan(lowFloor.metadata?.rooms as number);
    expect(highFloor.metadata?.corridors).toBeGreaterThan(lowFloor.metadata?.corridors as number);
    expect(triangleCount(part(high, "dungeon_walls").mesh)).toBeGreaterThan(triangleCount(part(low, "dungeon_walls").mesh));
    expect(allFinite(high)).toBe(true);
  });

  it("wraps a Voronoi edge mask around a vase profile", () => {
    const low = buildVoronoiVaseParts({ segments: 24, rows: 12, cells: 10, relief: 0, seed: 8 });
    const high = buildVoronoiVaseParts({ segments: 24, rows: 12, cells: 10, relief: 0.08, seed: 8 });
    const body = part(high, "voronoi_vase_body");
    const bb = bounds(body.mesh);
    const lowBb = bounds(part(low, "voronoi_vase_body").mesh);
    expect(vertexCount(body.mesh)).toBeGreaterThan((24 + 1) * (12 + 1));
    expect(body.colors?.length).toBe(vertexCount(body.mesh) * 3);
    expect(meshMetrics(body.mesh).watertight).toBe(true);
    expect(body.doubleSided).toBeUndefined();
    expect(bb.max.y - bb.min.y).toBeCloseTo(2.7, 1);
    expect(bb.max.x - bb.min.x).toBeGreaterThan(lowBb.max.x - lowBb.min.x);
  });

  it("is deterministic for the same showcase seed", () => {
    const a = buildHoudiniHowtosShowcaseParts({ seed: 12, scale: 0.5 });
    const b = buildHoudiniHowtosShowcaseParts({ seed: 12, scale: 0.5 });
    expect(summarizeHoudiniHowtos(a)).toEqual(summarizeHoudiniHowtos(b));
    expect(a[0]!.mesh.positions).toEqual(b[0]!.mesh.positions);
  });
});
