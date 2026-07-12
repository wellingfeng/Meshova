import { describe, expect, it } from "vitest";
import {
  bounds,
  buildKowloonCyberCourtyardParts,
  summarizeKowloonCyberCourtyard,
  triangleCount,
  type NamedPart,
} from "../src/index.js";

function allFinite(parts: NamedPart[]): boolean {
  return parts.every((part) => part.mesh.positions.every((position) => (
    Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z)
  )));
}

describe("Kowloon cyber courtyard", () => {
  it("builds four perimeter blocks around a wet central courtyard", () => {
    const parts = buildKowloonCyberCourtyardParts({ seed: 23, rainAmount: 1 });
    const names = parts.map((part) => part.name);
    expect(names).toContain("north_building_shell");
    expect(names).toContain("south_building_shell");
    expect(names).toContain("west_building_shell");
    expect(names).toContain("east_building_shell");
    expect(names).toContain("courtyard_floor");
    expect(names).toContain("courtyard_puddles");
    expect(names).toContain("neon_reflections_1");
    expect(names).toContain("rain_streaks");
    expect(parts.every((part) => part.label && !part.label.match(/^(root|component_|object_)/i))).toBe(true);
    expect(allFinite(parts)).toBe(true);
    expect(parts.reduce((sum, part) => sum + triangleCount(part.mesh), 0)).toBeGreaterThan(5_000);
  });

  it("keeps the central courtyard clear of perimeter shells", () => {
    const parts = buildKowloonCyberCourtyardParts({ courtyardWidth: 8, courtyardDepth: 10 });
    const courtyard = parts.find((part) => part.name === "courtyard_floor")!;
    const courtyardBounds = bounds(courtyard.mesh);
    expect(courtyardBounds.max.x - courtyardBounds.min.x).toBeCloseTo(8);
    expect(courtyardBounds.max.z - courtyardBounds.min.z).toBeCloseTo(10);
    for (const side of ["north", "south", "west", "east"]) {
      const shell = parts.find((part) => part.name === `${side}_building_shell`)!;
      const shellBounds = bounds(shell.mesh);
      const epsilon = 0.00001;
      const separatedOnX = shellBounds.max.x <= courtyardBounds.min.x + epsilon || shellBounds.min.x >= courtyardBounds.max.x - epsilon;
      const separatedOnZ = shellBounds.max.z <= courtyardBounds.min.z + epsilon || shellBounds.min.z >= courtyardBounds.max.z - epsilon;
      expect(separatedOnX || separatedOnZ).toBe(true);
    }
  });

  it("is deterministic for one seed", () => {
    const first = buildKowloonCyberCourtyardParts({ seed: 91 });
    const second = buildKowloonCyberCourtyardParts({ seed: 91 });
    expect(first.map((part) => part.name)).toEqual(second.map((part) => part.name));
    expect(first.map((part) => part.mesh.positions)).toEqual(second.map((part) => part.mesh.positions));
  });

  it("reports courtyard and overall dimensions", () => {
    const parts = buildKowloonCyberCourtyardParts({ courtyardWidth: 7, courtyardDepth: 9, floors: 8 });
    const summary = summarizeKowloonCyberCourtyard(parts, { courtyardWidth: 7, courtyardDepth: 9, floors: 8 });
    expect(summary.courtyardArea).toBe(63);
    expect(summary.footprintWidth).toBeGreaterThan(11);
    expect(summary.footprintDepth).toBeGreaterThan(13);
    expect(summary.height).toBeGreaterThan(6);
  });
});
