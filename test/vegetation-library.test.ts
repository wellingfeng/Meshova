import { describe, expect, it } from "vitest";
import {
  buildSpeedTreeLibraryPlant,
  defaultSpeedTreeLibraryParams,
  inferSpeedTreeLibraryRecipe,
  speedTreeLibraryId,
  speedTreeLibraryVisualKey,
  type Mesh,
} from "../src/index.js";

function assertValid(m: Mesh) {
  expect(m.normals.length).toBe(m.positions.length);
  expect(m.uvs.length).toBe(m.positions.length);
  expect(m.indices.length % 3).toBe(0);
  for (const idx of m.indices) {
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(m.positions.length);
  }
}

describe("SpeedTree library regeneration", () => {
  it("infers botanical generator kinds from source inventory names", () => {
    expect(inferSpeedTreeLibraryRecipe({ category: "Palms_&_Cacti", species: "Saguaro_Cactus" }).kind).toBe("cactus");
    expect(inferSpeedTreeLibraryRecipe({ category: "Conifers", species: "Italian_Cypress" }).kind).toBe("conifer");
    expect(inferSpeedTreeLibraryRecipe({ category: "Broadleaves", species: "Weeping_Willow" }).kind).toBe("broadleaf");
    expect(inferSpeedTreeLibraryRecipe({ category: "Shrubs_&_Flowers", species: "Boston_Fern" }).kind).toBe("fern");
    expect(inferSpeedTreeLibraryRecipe({ category: "Miscellaneous_&_Fantasy", species: "Bolete_Mushroom" }).kind).toBe("fungus");
  });

  it("creates stable viewer ids from category/species/variant", () => {
    expect(speedTreeLibraryId({ category: "Broadleaves", species: "Red_Oak", variant: "Red_Oak_01.spm" }))
      .toBe("speedtree-library-broadleaves-red-oak-red-oak-01");
  });

  it("builds valid deterministic procedural parts", () => {
    const entry = { category: "Broadleaves", species: "Japanese_Maple", variant: "Japanese_Maple_RT" };
    const a = buildSpeedTreeLibraryPlant(entry, { quality: "proxy" });
    const b = buildSpeedTreeLibraryPlant(entry, { quality: "proxy" });
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      assertValid(a[i]!.mesh);
      expect(a[i]!.mesh.positions.slice(0, 8)).toEqual(b[i]!.mesh.positions.slice(0, 8));
    }
  });

  it("exposes live procedural params that change generated geometry", () => {
    const entry = { category: "Shrubs_&_Flowers", species: "Horseweed" };
    const defaults = defaultSpeedTreeLibraryParams(entry, { quality: "proxy" });
    const base = buildSpeedTreeLibraryPlant(entry, { quality: "proxy", params: defaults });
    const taller = buildSpeedTreeLibraryPlant(entry, {
      quality: "proxy",
      params: { ...defaults, height: defaults.height * 1.4, branchCount: 1.8, leafSize: 1.5 },
    });
    expect(taller[0]!.mesh.positions.length).toBeGreaterThan(base[0]!.mesh.positions.length);
    const maxY = (mesh: Mesh) => Math.max(...mesh.positions.map((p) => p.y));
    expect(maxY(taller[0]!.mesh)).toBeGreaterThan(maxY(base[0]!.mesh));
  });

  it("groups visually duplicate inventory names but keeps distinct forms", () => {
    const horseweed = speedTreeLibraryVisualKey({ category: "Shrubs_&_Flowers", species: "Horseweed" });
    const mixedGreens = speedTreeLibraryVisualKey({ category: "Shrubs_&_Flowers", species: "Mixed_Greens" });
    const sunflower = speedTreeLibraryVisualKey({ category: "Shrubs_&_Flowers", species: "Sunflower" });
    expect(horseweed).toBe(mixedGreens);
    expect(sunflower).not.toBe(horseweed);
  });
});
