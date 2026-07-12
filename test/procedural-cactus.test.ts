import { describe, it, expect } from "vitest";
import {
  buildProceduralCactusParts,
  PROCEDURAL_CACTUS_DEFAULTS,
  bounds,
} from "../src/index.js";

describe("procedural-cactus", () => {
  it("builds semantic parts", () => {
    const parts = buildProceduralCactusParts();
    const names = parts.map((p) => p.name);
    expect(names).toContain("cactus_skin");
    expect(names).toContain("spines");
    expect(names).toContain("flowers");
    expect(names).toContain("flower_centers");
    expect(parts.find((p) => p.name === "cactus_skin")?.surface?.type).toBe("stylizedFoliage");
    for (const part of parts) expect(part.mesh.positions.length).toBeGreaterThan(0);
  });

  it("is deterministic for a given seed", () => {
    const a = buildProceduralCactusParts({ seed: 33 });
    const b = buildProceduralCactusParts({ seed: 33 });
    expect(a.find((p) => p.name === "cactus_skin")!.mesh.positions).toEqual(
      b.find((p) => p.name === "cactus_skin")!.mesh.positions,
    );
    expect(a.find((p) => p.name === "spines")!.mesh.positions).toEqual(
      b.find((p) => p.name === "spines")!.mesh.positions,
    );
  });

  it("different seeds change branch layout", () => {
    const a = buildProceduralCactusParts({ seed: 1 });
    const b = buildProceduralCactusParts({ seed: 2 });
    expect(a.find((p) => p.name === "cactus_skin")!.mesh.positions).not.toEqual(
      b.find((p) => p.name === "cactus_skin")!.mesh.positions,
    );
  });

  it("more arms add stem geometry", () => {
    const none = buildProceduralCactusParts({ armCount: 0 });
    const many = buildProceduralCactusParts({ armCount: 6 });
    expect(many.find((p) => p.name === "cactus_skin")!.mesh.positions.length).toBeGreaterThan(
      none.find((p) => p.name === "cactus_skin")!.mesh.positions.length,
    );
  });

  it("more ribs increase radial detail", () => {
    const low = buildProceduralCactusParts({ ribs: 6, armCount: 0, spinesPerRib: 0, flowerCount: 0 });
    const high = buildProceduralCactusParts({ ribs: 14, armCount: 0, spinesPerRib: 0, flowerCount: 0 });
    expect(high.find((p) => p.name === "cactus_skin")!.mesh.positions.length).toBeGreaterThan(
      low.find((p) => p.name === "cactus_skin")!.mesh.positions.length,
    );
  });

  it("spines can be disabled", () => {
    const parts = buildProceduralCactusParts({ spinesPerRib: 0 });
    expect(parts.find((p) => p.name === "spines")).toBeUndefined();
  });

  it("default height fits generated bounds", () => {
    const skin = buildProceduralCactusParts().find((p) => p.name === "cactus_skin")!;
    const b = bounds(skin.mesh);
    expect(b.max.y).toBeGreaterThan(PROCEDURAL_CACTUS_DEFAULTS.height * 0.85);
  });
});
