import { describe, expect, it } from "vitest";
import {
  bounds,
  buildFabcafeHoudiniShowcaseParts,
  buildFabcafeTwistTowerParts,
  buildFabcafeWavySurfaceParts,
  summarizeFabcafeHoudini,
  toViewerModel,
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

function totalInstances(parts: readonly NamedPart[]): number {
  return parts.reduce((sum, part) => sum + Number(part.metadata?.instances ?? 0), 0);
}

function part(parts: readonly NamedPart[], name: string): NamedPart {
  const found = parts.find((p) => p.name === name);
  expect(found).toBeTruthy();
  return found!;
}

describe("Fabcafe Houdini lecture reproductions", () => {
  it("builds wavy surface as noise attributes driving delete, scale and color bands", () => {
    const parts = buildFabcafeWavySurfaceParts({
      cols: 12,
      rows: 10,
      threshold: 0.3,
      seed: 3,
    });
    const surface = part(parts, "wavy_surface");
    expect(surface.colors?.length).toBe(vertexCount(surface.mesh) * 3);
    expect(totalInstances(parts)).toBeGreaterThan(20);
    expect(parts.filter((p) => p.name.startsWith("wave_instances_band_")).length).toBeGreaterThan(1);
    expect(allFinite(parts)).toBe(true);
    expect(toViewerModel(parts, "fabcafe-wavy-surface").meta.parts).toBe(parts.length);
  });

  it("prunes more copied boxes when the delete threshold rises", () => {
    const low = buildFabcafeWavySurfaceParts({ cols: 14, rows: 14, threshold: 0.2, seed: 8 });
    const high = buildFabcafeWavySurfaceParts({ cols: 14, rows: 14, threshold: 0.72, seed: 8 });
    expect(totalInstances(low)).toBeGreaterThan(totalInstances(high));
  });

  it("builds twist tower with feedback-copied metaball particles", () => {
    const parts = buildFabcafeTwistTowerParts({
      height: 4,
      radius: 0.75,
      samples: 16,
      copies: 3,
      floors: 4,
      resolution: 18,
      seed: 5,
    });
    const skin = part(parts, "twist_tower_skin");
    expect(Number(skin.metadata?.particles)).toBe(48);
    expect(vertexCount(skin.mesh)).toBeGreaterThan(50);
    const bb = bounds(skin.mesh);
    expect(bb.max.y - bb.min.y).toBeGreaterThan(3.2);
    expect(allFinite(parts)).toBe(true);
  });

  it("summarizes both lecture examples in the showcase", () => {
    const parts = buildFabcafeHoudiniShowcaseParts({ seed: 11, scale: 0.5 });
    const summary = summarizeFabcafeHoudini(parts);
    expect(summary.sources.wavySurface).toBeGreaterThan(1);
    expect(summary.sources.twistTower).toBeGreaterThan(1);
    expect(summary.vertexCount).toBeGreaterThan(500);
    expect(summary.triangleCount).toBeGreaterThan(500);
  });
});
