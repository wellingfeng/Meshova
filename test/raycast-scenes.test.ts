import { describe, expect, it } from "vitest";
import {
  buildRaycastAsteroidGardenParts,
  buildRaycastCliffLightsParts,
  buildRaycastRoofGardenParts,
} from "../src/models/raycast-scenes.js";

describe("raycast scene model library", () => {
  it("builds three deterministic semantic scenes", () => {
    const builders = [
      () => buildRaycastRoofGardenParts({ columns: 7, rows: 6, seed: 4 }),
      () => buildRaycastAsteroidGardenParts({ samples: 20, seed: 5 }),
      () => buildRaycastCliffLightsParts({ columns: 7, rows: 5, seed: 6 }),
    ];

    for (const build of builders) {
      const first = build();
      const second = build();
      expect(first).toEqual(second);
      expect(first.length).toBeGreaterThanOrEqual(3);
      expect(first.every((part) => part.label && part.mesh.positions.length > 0)).toBe(true);
      expect(first.flatMap((part) => part.mesh.positions).every((position) =>
        Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z)
      )).toBe(true);
    }
  });

  it("preserves ray-hit diagnostics in scene metadata", () => {
    const scenes = [
      buildRaycastRoofGardenParts({ columns: 6, rows: 5, density: 1, seed: 1 }),
      buildRaycastAsteroidGardenParts({ samples: 16, seed: 2 }),
      buildRaycastCliffLightsParts({ columns: 6, rows: 5, density: 1, seed: 3 }),
    ];

    for (const parts of scenes) {
      const metadata = parts[0]?.metadata ?? parts[1]?.metadata;
      expect(Number(metadata?.candidateCount)).toBeGreaterThan(0);
      expect(Number(metadata?.hitCount)).toBeGreaterThan(0);
      expect(Number(metadata?.hitCount)).toBeLessThanOrEqual(Number(metadata?.candidateCount));
    }
  });

  it("emits valid HSV marker colors for asteroid diagnostics", () => {
    const debug = buildRaycastAsteroidGardenParts({ samples: 18, debugMarkers: true, seed: 8 })
      .find((part) => part.name === "asteroid_ray_distance_debug");
    expect(debug).toBeDefined();
    expect(debug?.colors?.length).toBe((debug?.mesh.positions.length ?? 0) * 3);
    expect(debug?.colors?.every((value) => value >= 0 && value <= 1)).toBe(true);

    const hidden = buildRaycastAsteroidGardenParts({ samples: 18, debugMarkers: false, seed: 8 });
    expect(hidden.some((part) => part.name === "asteroid_ray_distance_debug")).toBe(false);
  });
});
