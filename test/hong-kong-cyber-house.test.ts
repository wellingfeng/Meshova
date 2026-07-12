import { describe, expect, it } from "vitest";
import {
  bounds,
  buildHongKongCyberHouseParts,
  summarizeHongKongCyberHouse,
  triangleCount,
  type NamedPart,
} from "../src/index.js";

function allFinite(parts: NamedPart[]): boolean {
  return parts.every((part) => part.mesh.positions.every((position) => (
    Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z)
  )));
}

describe("Hong Kong cyber street house", () => {
  it("builds semantic facade, service, signage, and roof groups", () => {
    const parts = buildHongKongCyberHouseParts({ seed: 17, signDensity: 1, utilityDensity: 1 });
    const names = parts.map((part) => part.name);
    expect(names).toContain("building_shell");
    expect(names).toContain("storefront_glass");
    expect(names).toContain("facade_windows");
    expect(names).toContain("blade_signs");
    expect(names).toContain("fire_escape_steps");
    expect(names).toContain("air_conditioners");
    expect(names).toContain("roof_water_tank");
    expect(parts.every((part) => part.label && !part.label.match(/^(root|component_|object_)/i))).toBe(true);
    expect(allFinite(parts)).toBe(true);
    expect(parts.reduce((sum, part) => sum + triangleCount(part.mesh), 0)).toBeGreaterThan(1_000);
  });

  it("is deterministic for one seed", () => {
    const first = buildHongKongCyberHouseParts({ seed: 91 });
    const second = buildHongKongCyberHouseParts({ seed: 91 });
    expect(first.map((part) => part.name)).toEqual(second.map((part) => part.name));
    expect(first.map((part) => part.mesh.positions)).toEqual(second.map((part) => part.mesh.positions));
  });

  it("floor count changes silhouette height", () => {
    const low = summarizeHongKongCyberHouse(buildHongKongCyberHouseParts({ floors: 4 }));
    const high = summarizeHongKongCyberHouse(buildHongKongCyberHouseParts({ floors: 12 }));
    expect(high.height).toBeGreaterThan(low.height + 5);
  });

  it("keeps facade attachments proud of the wall", () => {
    const parts = buildHongKongCyberHouseParts({ signDensity: 1 });
    const shell = parts.find((part) => part.name === "building_shell")!;
    const signs = parts.find((part) => part.name === "shop_signs")!;
    const balconies = parts.find((part) => part.name === "balcony_slabs")!;
    expect(bounds(signs.mesh).max.z).toBeGreaterThan(bounds(shell.mesh).max.z);
    expect(bounds(balconies.mesh).max.z).toBeGreaterThan(bounds(shell.mesh).max.z);
  });
});
