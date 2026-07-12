import { describe, expect, it } from "vitest";
import { bounds, buildBillboardParts, buildStreetLampParts, buildStreetTreeParts, toViewerModel } from "../src/index.js";

describe("city prop billboard", () => {
  it("builds an independent front face with full-range UVs", () => {
    const parts = buildBillboardParts({ panelWidth: 9, panelHeight: 4 });
    const face = parts.find((part) => part.name === "ad_face");
    expect(face).toBeTruthy();
    expect(face!.mesh.indices).toHaveLength(6);
    expect(new Set(face!.mesh.uvs.map((uv) => uv.x))).toEqual(new Set([0, 1]));
    expect(new Set(face!.mesh.uvs.map((uv) => uv.y))).toEqual(new Set([0, 1]));
    expect(face!.metadata?.textureReplaceable).toBe(true);
  });

  it("carries a replaceable ad texture through viewer export", () => {
    const path = "ads/summer-sale.webp";
    const parts = buildBillboardParts({ adTexture: path });
    const face = parts.find((part) => part.name === "ad_face")!;
    expect(face.textures?.baseColor).toBe(path);
    expect(toViewerModel(parts, "billboard").parts.find((part) => part.name === "ad_face")?.textures?.baseColor).toBe(path);
  });

  it("keeps the default billboard texture-free", () => {
    const face = buildBillboardParts().find((part) => part.name === "ad_face")!;
    expect(face.textures).toBeUndefined();
  });
});

describe("city prop street lamp", () => {
  it("keeps the pole top thick enough to support the arm", () => {
    const parts = buildStreetLampParts({ height: 6.5, style: "cobra", armReach: 2.2 });
    const pole = parts.find((part) => part.name === "pole");
    expect(pole).toBeTruthy();

    const b = bounds(pole!.mesh);
    const radiusAt = (y: number) =>
      Math.max(
        ...pole!.mesh.positions
          .filter((p) => Math.abs(p.y - y) < 1e-6)
          .map((p) => Math.hypot(p.x, p.z)),
      );
    const bottomRadius = radiusAt(b.min.y);
    const topRadius = radiusAt(b.max.y);

    expect(topRadius).toBeGreaterThan(0.05);
    expect(topRadius / bottomRadius).toBeGreaterThan(0.65);
  });
});

describe("city prop street tree", () => {
  it("builds a tapered recursive crown instead of detached foliage scatter", () => {
    const parts = buildStreetTreeParts({ trunkHeight: 2.2, canopyRadius: 2, clusters: 8, seed: 7 });
    const trunk = parts.find((part) => part.name === "trunk");
    const canopy = parts.find((part) => part.name === "canopy");
    expect(trunk).toBeTruthy();
    expect(canopy).toBeTruthy();
    expect(trunk!.surface?.type).toBe("bark");

    const crownBounds = bounds(canopy!.mesh);
    expect(crownBounds.max.x - crownBounds.min.x).toBeGreaterThan(2.4);
    expect(crownBounds.max.y - crownBounds.min.y).toBeGreaterThan(1.2);
    expect(canopy!.mesh.positions.length).toBeGreaterThan(2_000);
  });

  it("stays deterministic for identical seeds", () => {
    const a = buildStreetTreeParts({ seed: 23 });
    const b = buildStreetTreeParts({ seed: 23 });
    expect(a.map((part) => part.mesh.positions)).toEqual(b.map((part) => part.mesh.positions));
  });
});
