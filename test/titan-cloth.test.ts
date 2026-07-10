import { describe, it, expect } from "vitest";
import {
  buildTitanClothParts,
  buildTitanClothMesh,
  TITAN_CLOTH_DEFAULTS,
} from "../src/models/titan-cloth.js";

describe("titan-cloth (Tutorial_cloth_tool.hda)", () => {
  it("builds a single cloth part with geometry and UVs", () => {
    const parts = buildTitanClothParts();
    expect(parts).toHaveLength(1);
    const cloth = parts[0]!;
    expect(cloth.name).toBe("cloth");
    expect(cloth.mesh.positions.length).toBeGreaterThan(0);
    expect(cloth.mesh.uvs.length).toBe(cloth.mesh.positions.length);
  });

  it("is deterministic — same params, identical drape", () => {
    const a = buildTitanClothMesh({ seed: 4, sag: 1.2 });
    const b = buildTitanClothMesh({ seed: 4, sag: 1.2 });
    expect(a.positions).toEqual(b.positions);
  });

  it("higher resolution => more vertices", () => {
    const lo = buildTitanClothMesh({ resolution: 10 });
    const hi = buildTitanClothMesh({ resolution: 40 });
    expect(hi.positions.length).toBeGreaterThan(lo.positions.length);
  });

  it("sag pulls the belly below the rest height", () => {
    const mesh = buildTitanClothMesh({ pinMode: "corners", sag: 2, restHeight: 3, wrinkle: 0 });
    const minY = Math.min(...mesh.positions.map((p) => p.y));
    const maxY = Math.max(...mesh.positions.map((p) => p.y));
    expect(maxY).toBeCloseTo(3, 1); // pinned corners hold rest height
    expect(minY).toBeLessThan(3); // belly droops
  });

  it("pin mode changes the drape", () => {
    const corners = buildTitanClothMesh({ pinMode: "corners" });
    const center = buildTitanClothMesh({ pinMode: "center" });
    expect(corners.positions).not.toEqual(center.positions);
  });

  it("exposes HDA provenance metadata", () => {
    const cloth = buildTitanClothParts()[0]!;
    expect(cloth.metadata?.source).toBe("Tutorial_cloth_tool.hda");
  });

  it("defaults pin the corners", () => {
    expect(TITAN_CLOTH_DEFAULTS.pinMode).toBe("corners");
  });
});
