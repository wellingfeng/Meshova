import { describe, expect, it } from "vitest";
import {
  buildSpeedTreeLibraryPlant,
  critique,
  defaultSpeedTreeLibraryParams,
  foliageMetrics,
  inferSpeedTreeLibraryRecipe,
  speedTreeLibraryId,
  speedTreeLibraryRepresentativeScore,
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

function maxComponentDiagonal(m: Mesh): number {
  const parent = Array.from({ length: m.positions.length }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  const unite = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = m.indices[i]!;
    const b = m.indices[i + 1]!;
    const c = m.indices[i + 2]!;
    unite(a, b);
    unite(a, c);
  }
  const boxes = new Map<number, { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }>();
  for (let i = 0; i < m.positions.length; i++) {
    const root = find(i);
    const p = m.positions[i]!;
    const b = boxes.get(root);
    if (!b) {
      boxes.set(root, { minX: p.x, minY: p.y, minZ: p.z, maxX: p.x, maxY: p.y, maxZ: p.z });
    } else {
      b.minX = Math.min(b.minX, p.x); b.minY = Math.min(b.minY, p.y); b.minZ = Math.min(b.minZ, p.z);
      b.maxX = Math.max(b.maxX, p.x); b.maxY = Math.max(b.maxY, p.y); b.maxZ = Math.max(b.maxZ, p.z);
    }
  }
  let max = 0;
  for (const b of boxes.values()) {
    const dx = b.maxX - b.minX, dy = b.maxY - b.minY, dz = b.maxZ - b.minZ;
    max = Math.max(max, Math.sqrt(dx * dx + dy * dy + dz * dz));
  }
  return max;
}

function componentBoxes(m: Mesh) {
  const parent = Array.from({ length: m.positions.length }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  const unite = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = m.indices[i]!;
    unite(a, m.indices[i + 1]!);
    unite(a, m.indices[i + 2]!);
  }
  const boxes = new Map<number, { min: [number, number, number]; max: [number, number, number] }>();
  for (let i = 0; i < m.positions.length; i++) {
    const point = m.positions[i]!;
    const values: [number, number, number] = [point.x, point.y, point.z];
    const root = find(i);
    const box = boxes.get(root);
    if (!box) {
      boxes.set(root, { min: [...values], max: [...values] });
      continue;
    }
    for (let axis = 0; axis < 3; axis++) {
      box.min[axis] = Math.min(box.min[axis], values[axis]!);
      box.max[axis] = Math.max(box.max[axis], values[axis]!);
    }
  }
  return [...boxes.values()];
}

function meshExtents(m: Mesh) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of m.positions) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); maxZ = Math.max(maxZ, p.z);
  }
  return { x: maxX - minX, y: maxY - minY, z: maxZ - minZ };
}

function boxesOverlap(a: ReturnType<typeof componentBoxes>[number], b: ReturnType<typeof componentBoxes>[number], margin = 0.015) {
  return [0, 1, 2].every((axis) => a.min[axis]! <= b.max[axis]! + margin && b.min[axis]! <= a.max[axis]! + margin);
}

describe("SpeedTree library regeneration", () => {
  it("infers botanical generator kinds from source inventory names", () => {
    expect(inferSpeedTreeLibraryRecipe({ category: "Palms_&_Cacti", species: "Saguaro_Cactus" }).kind).toBe("cactus");
    expect(inferSpeedTreeLibraryRecipe({ category: "Palms_&_Cacti", species: "Banana_Plant" }).kind).toBe("plant");
    expect(inferSpeedTreeLibraryRecipe({ category: "Palms_&_Cacti", species: "Aloe_Vera" }).kind).toBe("plant");
    expect(inferSpeedTreeLibraryRecipe({ category: "Conifers", species: "Italian_Cypress" }).kind).toBe("conifer");
    expect(inferSpeedTreeLibraryRecipe({ category: "Broadleaves", species: "Weeping_Willow" }).kind).toBe("broadleaf");
    expect(inferSpeedTreeLibraryRecipe({ category: "Shrubs_&_Flowers", species: "American_Boxwood" }).kind).toBe("shrub");
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

  it("builds banana and aloe as upright broad-leaf silhouettes", () => {
    const banana = buildSpeedTreeLibraryPlant(
      { category: "Palms_&_Cacti", species: "Banana_Plant" },
      { quality: "proxy" },
    );
    const bananaFoliage = banana.find((p) => p.name === "foliage");
    expect(bananaFoliage).toBeDefined();
    const bananaBox = meshExtents(bananaFoliage!.mesh);
    expect(bananaBox.y / Math.max(bananaBox.x, bananaBox.z)).toBeGreaterThan(0.45);

    const aloe = buildSpeedTreeLibraryPlant(
      { category: "Palms_&_Cacti", species: "Aloe_Vera" },
      { quality: "proxy" },
    );
    const aloeFoliage = aloe.find((p) => p.name === "foliage");
    expect(aloeFoliage).toBeDefined();
    const aloeBox = meshExtents(aloeFoliage!.mesh);
    expect(aloeBox.y / Math.max(aloeBox.x, aloeBox.z)).toBeGreaterThan(0.45);
    expect(aloe.some((p) => p.name === "flowers")).toBe(true);
  });

  it("builds acacia foliage from small leaf clusters, not large disk blobs", () => {
    const parts = buildSpeedTreeLibraryPlant(
      { category: "Broadleaves", species: "Acacia", seed: 111259 },
      { quality: "proxy" },
    );
    const foliage = parts.find((p) => p.name === "foliage");
    expect(foliage).toBeDefined();
    expect(maxComponentDiagonal(foliage!.mesh)).toBeLessThan(0.35);
    expect(foliageMetrics(foliage!.mesh).crowding).toBeLessThan(0.6);
    const report = critique(parts, { goal: "Meshova树库 Acacia" });
    expect(report.category).toBe("tree");
    expect(report.issues.some((i) => /overlap heavily|overcrowded/.test(i.finding))).toBe(false);
  });

  it("builds broadleaf crown clouds without exposed green ball occluders", () => {
    const species = ["Red_Delicious_Apple", "Lombardy_Poplar", "Red_Gum", "Lemon"];
    for (const name of species) {
      const parts = buildSpeedTreeLibraryPlant(
        { category: "Broadleaves", species: name },
        { quality: "proxy" },
      );
      const foliage = parts.find((p) => p.name === "foliage");
      expect(foliage).toBeDefined();
      const fm = foliageMetrics(foliage!.mesh);
      expect(fm.blobRatio).toBe(0);
      expect(fm.crowding).toBeLessThan(0.6);
      const report = critique(parts, { goal: `Meshova树库 ${name}` });
      expect(report.issues.some((i) => /occluder blobs|green balls|overcrowded/.test(i.finding))).toBe(false);
    }
  });

  it("builds conifer crowns from needle sprays, not stacked solid blobs", () => {
    const species = [
      "Alaska_Cedar",
      "Bald_Cypress",
      "Eastern_Red_Cedar",
      "Fraser_Fir",
      "Giant_Redwood",
      "Jeffrey_Pine",
      "Scots_Pine",
      "White_Fir",
    ];
    for (const name of species) {
      const parts = buildSpeedTreeLibraryPlant(
        { category: "Conifers", species: name },
        { quality: "proxy" },
      );
      const needles = parts.find((p) => p.name === "needles");
      expect(needles).toBeDefined();
      const fm = foliageMetrics(needles!.mesh);
      expect(fm.blobRatio).toBe(0);
      const report = critique(parts, { goal: `Meshova树库 ${name}` });
      expect(report.issues.some((i) => /occluder blobs|green balls/.test(i.finding))).toBe(false);
    }
  });

  it("builds pad cacti as one attached hierarchy", () => {
    for (const species of ["Beavertail_Cactus", "Prickly_Pear_Cactus"]) {
      const parts = buildSpeedTreeLibraryPlant(
        { category: "Palms_&_Cacti", species },
        { quality: "proxy" },
      );
      const stem = parts.find((part) => part.name === "stem");
      const areoles = parts.find((part) => part.name === "areoles");
      const spines = parts.find((part) => part.name === "spines");
      expect(stem).toBeDefined();
      expect(areoles).toBeDefined();
      expect(spines).toBeDefined();
      const boxes = componentBoxes(stem!.mesh);
      expect(boxes.length).toBeGreaterThan(1);
      const reached = new Set([0]);
      while (true) {
        const before = reached.size;
        for (let i = 0; i < boxes.length; i++) {
          if (reached.has(i)) continue;
          if ([...reached].some((j) => boxesOverlap(boxes[i]!, boxes[j]!))) reached.add(i);
        }
        if (reached.size === before) break;
      }
      expect(reached.size).toBe(boxes.length);
      const stemBoxes = componentBoxes(stem!.mesh);
      const areoleBoxes = componentBoxes(areoles!.mesh);
      const spineBoxes = componentBoxes(spines!.mesh);
      expect(areoleBoxes.every((box) => stemBoxes.some((stemBox) => boxesOverlap(box, stemBox, 0.08)))).toBe(true);
      expect(spineBoxes.every((box) => areoleBoxes.some((areoleBox) => boxesOverlap(box, areoleBox, 0.035)))).toBe(true);
    }
  });

  it("builds column cacti with rigid ribs and dense spines", () => {
    for (const species of ["Saguaro_Cactus", "Cholla_Cactus"]) {
      const parts = buildSpeedTreeLibraryPlant(
        { category: "Palms_&_Cacti", species },
        { quality: "proxy" },
      );
      const stem = parts.find((part) => part.name === "stem");
      const ribs = parts.find((part) => part.name === "ribs");
      const areoles = parts.find((part) => part.name === "areoles");
      const spines = parts.find((part) => part.name === "spines");
      expect(stem).toBeDefined();
      expect(ribs).toBeDefined();
      expect(areoles).toBeDefined();
      expect(spines).toBeDefined();
      const stemBoxes = componentBoxes(stem!.mesh);
      const ribBoxes = componentBoxes(ribs!.mesh);
      const areoleBoxes = componentBoxes(areoles!.mesh);
      const spineBoxes = componentBoxes(spines!.mesh);
      expect(ribBoxes.length).toBeGreaterThan(0);
      expect(areoleBoxes.length).toBeGreaterThan(0);
      expect(spineBoxes.length).toBeGreaterThan(0);
      expect(ribBoxes.every((box) => stemBoxes.some((stemBox) => boxesOverlap(box, stemBox, 0.04)))).toBe(true);
      expect(areoleBoxes.every((box) => stemBoxes.some((stemBox) => boxesOverlap(box, stemBox, 0.06)))).toBe(true);
      expect(spines!.mesh.positions.length).toBeGreaterThan(areoles!.mesh.positions.length);
    }
  });

  it("builds Easter lily cactus as a rounded barrel form, not square column arms", () => {
    const parts = buildSpeedTreeLibraryPlant(
      { category: "Palms_&_Cacti", species: "Easter_Lily_Cactus" },
      { quality: "proxy" },
    );
    const stem = parts.find((part) => part.name === "stem");
    const ribs = parts.find((part) => part.name === "ribs");
    const areoles = parts.find((part) => part.name === "areoles");
    const spines = parts.find((part) => part.name === "spines");
    expect(stem).toBeDefined();
    expect(ribs).toBeDefined();
    expect(areoles).toBeDefined();
    expect(spines).toBeDefined();
    const extents = meshExtents(stem!.mesh);
    expect(extents.y / Math.max(extents.x, extents.z)).toBeLessThan(1.55);
    expect(componentBoxes(stem!.mesh).length).toBe(1);
    expect(componentBoxes(ribs!.mesh).length).toBeGreaterThan(8);
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

  it("groups marine entries that share the same generated large-leaf form", () => {
    const entries = ["Water_Lily", "Starfish", "Lotus_Flower", "Hydrilla"]
      .map((species) => ({ category: "Marine", species }));
    const keys = entries.map(speedTreeLibraryVisualKey);
    expect(new Set(keys).size).toBe(1);
    expect(speedTreeLibraryVisualKey({ category: "Marine", species: "Coral_Fan" })).not.toBe(keys[0]);

    const representative = [...entries].sort(
      (a, b) => speedTreeLibraryRepresentativeScore(b) - speedTreeLibraryRepresentativeScore(a),
    )[0];
    expect(representative?.species).toBe("Water_Lily");
  });
});
