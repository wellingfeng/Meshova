import { describe, expect, it } from "vitest";
import {
  buildLowPolyCloudValleyParts,
  buildLowPolyTropicalIslandParts,
  buildLowPolyTreeKitParts,
  buildLowPolyVillageParts,
} from "../src/index.js";

describe("low-poly course scenes", () => {
  const builders = [
    buildLowPolyVillageParts,
    buildLowPolyCloudValleyParts,
    buildLowPolyTropicalIslandParts,
    buildLowPolyTreeKitParts,
  ];

  it("builds deterministic faceted scene parts", () => {
    for (const build of builders) {
      const first = build({ seed: 42 });
      const second = build({ seed: 42 });
      expect(first.map((part) => part.name)).toEqual(second.map((part) => part.name));
      expect(first.map((part) => part.mesh.positions.length)).toEqual(second.map((part) => part.mesh.positions.length));
      expect(first.every((part) => part.metadata?.style === "low-poly")).toBe(true);
      expect(first.every((part) => part.colors?.length === part.mesh.positions.length * 3)).toBe(true);
    }
  });

  it("gives every triangle independent corners", () => {
    for (const part of buildLowPolyTropicalIslandParts()) {
      expect(part.mesh.positions.length).toBe(part.mesh.indices.length);
    }
  });
});
