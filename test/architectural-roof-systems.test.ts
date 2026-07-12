import { describe, expect, it } from "vitest";
import { bounds, triangleCount } from "../src/geometry/index.js";
import {
  ARCHITECTURAL_ROOF_MODELS,
  buildArchitecturalRoofParts,
  buildArchitecturalRoofSystem,
  type ArchitecturalRoofKind,
} from "../src/models/architectural-roof-systems.js";

describe("architectural roof systems", () => {
  it("builds four independent roof families", () => {
    expect(ARCHITECTURAL_ROOF_MODELS.map((entry) => entry.kind)).toEqual([
      "shed",
      "gable",
      "hip",
      "skylight-gable",
    ]);
    for (const definition of ARCHITECTURAL_ROOF_MODELS) {
      const parts = buildArchitecturalRoofParts(definition.defaults);
      expect(parts.length).toBeGreaterThanOrEqual(4);
      expect(parts.every((part) => triangleCount(part.mesh) > 0)).toBe(true);
      expect(parts.every((part) => part.label.length > 0)).toBe(true);
    }
  });

  it("cuts skylights by segmenting roof covering", () => {
    const result = buildArchitecturalRoofSystem({ kind: "skylight-gable", skylights: 3 });
    const covering = result.parts.find((part) => part.name === "roof_covering")!;
    const glazing = result.parts.find((part) => part.name === "skylight_glazing")!;
    expect(covering.metadata?.openingMode).toBe("segmented-covering");
    expect(covering.metadata?.openings).toHaveLength(3);
    expect(triangleCount(covering.mesh)).toBeGreaterThan(triangleCount(glazing.mesh));
    expect(result.anchors.filter((anchor) => anchor.type === "skylight")).toHaveLength(3);
  });

  it("exposes wall, ridge and drainage anchors", () => {
    const result = buildArchitecturalRoofSystem({ kind: "gable", gutter: true });
    expect(result.anchors.filter((anchor) => anchor.type === "wall-top")).toHaveLength(4);
    expect(result.anchors.some((anchor) => anchor.type === "ridge")).toBe(true);
    expect(result.anchors.some((anchor) => anchor.type === "gutter")).toBe(true);
    expect(result.anchors.some((anchor) => anchor.type === "downspout")).toBe(true);
  });

  it("keeps roof footprint stable while rise changes", () => {
    const low = bounds(buildArchitecturalRoofParts({ kind: "gable", rise: 0.7 })[1]!.mesh);
    const high = bounds(buildArchitecturalRoofParts({ kind: "gable", rise: 2.1 })[1]!.mesh);
    expect(high.max.y).toBeGreaterThan(low.max.y);
    expect(high.max.x - high.min.x).toBeCloseTo(low.max.x - low.min.x, 5);
    expect(high.max.z - high.min.z).toBeCloseTo(low.max.z - low.min.z, 5);
  });

  it("reports roofs with unsafe low slope", () => {
    const result = buildArchitecturalRoofSystem({ kind: "shed", depth: 8, rise: 0.2 });
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "low-slope" }));
  });

  it("is deterministic for every family", () => {
    const kinds: ArchitecturalRoofKind[] = ["shed", "gable", "hip", "skylight-gable"];
    for (const kind of kinds) {
      const first = buildArchitecturalRoofParts({ kind, width: 5.7, depth: 4.4, skylights: 2 });
      const second = buildArchitecturalRoofParts({ kind, width: 5.7, depth: 4.4, skylights: 2 });
      expect(first.map((part) => part.mesh.positions)).toEqual(second.map((part) => part.mesh.positions));
    }
  });
});
