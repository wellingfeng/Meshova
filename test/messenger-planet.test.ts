import { describe, expect, it } from "vitest";
import { buildMessengerPlanetParts } from "../src/index.js";

describe("messenger toon planet", () => {
  it("builds deterministic semantic low-poly parts", () => {
    const first = buildMessengerPlanetParts({ seed: 42, buildingCount: 8, treeCount: 10 });
    const second = buildMessengerPlanetParts({ seed: 42, buildingCount: 8, treeCount: 10 });

    expect(first.map((part) => part.name)).toEqual(second.map((part) => part.name));
    expect(first.map((part) => part.mesh.positions)).toEqual(second.map((part) => part.mesh.positions));
    expect(first.every((part) => part.label && !part.label.includes("messenger_"))).toBe(true);
    expect(first.every((part) => part.metadata?.style === "messenger-toon")).toBe(true);
    expect(first.every((part) => part.colors?.length === part.mesh.positions.length * 3)).toBe(true);
  });

  it("keeps the core spherical and changes layouts by seed", () => {
    const first = buildMessengerPlanetParts({ seed: 7, radius: 4.5, buildingCount: 5, treeCount: 4 });
    const second = buildMessengerPlanetParts({ seed: 8, radius: 4.5, buildingCount: 5, treeCount: 4 });
    const core = first.find((part) => part.name === "messenger_planet");
    const firstFacade = first.find((part) => part.name === "messenger_facadeLight");
    const secondFacade = second.find((part) => part.name === "messenger_facadeLight");

    expect(core).toBeDefined();
    for (const point of core!.mesh.positions.slice(0, 30)) {
      expect(Math.hypot(point.x, point.y, point.z)).toBeCloseTo(4.5, 5);
    }
    expect(firstFacade?.mesh.positions).not.toEqual(secondFacade?.mesh.positions);
  });
});
