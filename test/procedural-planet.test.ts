import { describe, expect, it } from "vitest";
import {
  buildProceduralPlanetParts,
  buildProceduralPlanetTerrain,
  triangleCount,
} from "../src/index.js";

describe("procedural planet", () => {
  it("builds semantic terrain, ocean, and atmosphere shells", () => {
    const parts = buildProceduralPlanetParts({ subdivisions: 3, seed: 12 });
    expect(parts.map((part) => part.name)).toEqual([
      "planet_terrain",
      "planet_ocean",
      "planet_atmosphere",
    ]);
    expect(parts.every((part) => part.label && triangleCount(part.mesh) > 0)).toBe(true);
    expect(parts[0]?.colors).toHaveLength(parts[0]!.mesh.positions.length * 3);
  });

  it("is deterministic for a fixed seed", () => {
    const options = { subdivisions: 3, seed: 91 };
    const first = buildProceduralPlanetTerrain(options);
    const second = buildProceduralPlanetTerrain(options);
    expect(first.mesh.positions).toEqual(second.mesh.positions);
    expect(first.colors).toEqual(second.colors);
  });

  it("creates terrain both above and below sea level", () => {
    const planet = buildProceduralPlanetTerrain({ subdivisions: 4, seed: 42 });
    const radii = planet.mesh.positions.map((position) => Math.hypot(position.x, position.y, position.z));
    expect(Math.min(...radii)).toBeLessThan(planet.oceanRadius - 0.05);
    expect(Math.max(...radii)).toBeGreaterThan(planet.oceanRadius + 0.1);
  });

  it("responds to mountain and ocean controls without changing topology", () => {
    const flat = buildProceduralPlanetTerrain({ subdivisions: 3, seed: 7, mountainHeight: 0, oceanDepth: 0.1 });
    const rugged = buildProceduralPlanetTerrain({ subdivisions: 3, seed: 7, mountainHeight: 1.2, oceanDepth: 0.9 });
    expect(flat.mesh.indices).toEqual(rugged.mesh.indices);
    expect(flat.mesh.positions).not.toEqual(rugged.mesh.positions);
  });

  it("can disable the atmosphere shell", () => {
    expect(buildProceduralPlanetParts({ subdivisions: 2, atmosphere: 0 })).toHaveLength(2);
  });
});
