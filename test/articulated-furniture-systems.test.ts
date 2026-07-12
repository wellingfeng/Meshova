import { describe, expect, it } from "vitest";
import { bounds, triangleCount } from "../src/geometry/index.js";
import {
  ARTICULATED_FURNITURE_MODELS,
  buildArticulatedFurniture,
  type ArticulatedFurnitureKind,
} from "../src/models/articulated-furniture-systems.js";

describe("articulated furniture systems", () => {
  it("builds four semantic furniture families", () => {
    expect(ARTICULATED_FURNITURE_MODELS).toHaveLength(4);
    for (const definition of ARTICULATED_FURNITURE_MODELS) {
      const result = buildArticulatedFurniture(definition.defaults);
      expect(result.parts.length).toBeGreaterThanOrEqual(3);
      expect(result.parts.every((part) => triangleCount(part.mesh) > 0)).toBe(true);
      expect(result.joints.length).toBeGreaterThan(0);
    }
  });

  it("drives cabinet doors from hinge pivots", () => {
    const closed = buildArticulatedFurniture({ kind: "hinged-cabinet", openness: 0 });
    const open = buildArticulatedFurniture({ kind: "hinged-cabinet", openness: 1 });
    const closedDoors = closed.parts.find((part) => part.name === "cabinet_doors")!.mesh;
    const openDoors = open.parts.find((part) => part.name === "cabinet_doors")!.mesh;
    expect(openDoors.positions).not.toEqual(closedDoors.positions);
    expect(open.joints.every((joint) => joint.type === "hinge")).toBe(true);
    expect(open.joints.every((joint) => joint.value >= joint.minimum && joint.value <= joint.maximum)).toBe(true);
  });

  it("moves drawers through independent slider joints", () => {
    const closed = buildArticulatedFurniture({ kind: "drawer-chest", openness: 0, count: 5 });
    const open = buildArticulatedFurniture({ kind: "drawer-chest", openness: 1, count: 5 });
    const closedBounds = bounds(closed.parts.find((part) => part.name === "drawer_fronts")!.mesh);
    const openBounds = bounds(open.parts.find((part) => part.name === "drawer_fronts")!.mesh);
    expect(openBounds.max.z).toBeGreaterThan(closedBounds.max.z + 0.2);
    expect(open.joints).toHaveLength(5);
    expect(open.joints.every((joint) => joint.type === "slider" && joint.axis[2] === 1)).toBe(true);
  });

  it("folds tabletop around wall hinge", () => {
    const folded = buildArticulatedFurniture({ kind: "folding-table", openness: 0 });
    const deployed = buildArticulatedFurniture({ kind: "folding-table", openness: 1 });
    const foldedTop = bounds(folded.parts.find((part) => part.name === "folding_tabletop")!.mesh);
    const deployedTop = bounds(deployed.parts.find((part) => part.name === "folding_tabletop")!.mesh);
    expect(foldedTop.max.y - foldedTop.min.y).toBeGreaterThan(deployedTop.max.y - deployedTop.min.y);
    expect(deployed.joints[0]).toMatchObject({ id: "tabletop-hinge", type: "hinge", value: 0 });
  });

  it("slides wardrobe doors on alternating tracks", () => {
    const closed = buildArticulatedFurniture({ kind: "sliding-wardrobe", openness: 0, count: 3 });
    const open = buildArticulatedFurniture({ kind: "sliding-wardrobe", openness: 1, count: 3 });
    const closedPanels = closed.parts.find((part) => part.name === "sliding_panels")!.mesh;
    const openPanels = open.parts.find((part) => part.name === "sliding_panels")!.mesh;
    expect(openPanels.positions).not.toEqual(closedPanels.positions);
    expect(open.joints).toHaveLength(3);
    expect(new Set(open.joints.map((joint) => joint.pivot[2])).size).toBe(2);
  });

  it("is deterministic for every articulated family", () => {
    const kinds: ArticulatedFurnitureKind[] = ["hinged-cabinet", "drawer-chest", "folding-table", "sliding-wardrobe"];
    for (const kind of kinds) {
      const first = buildArticulatedFurniture({ kind, openness: 0.63, count: 3 });
      const second = buildArticulatedFurniture({ kind, openness: 0.63, count: 3 });
      expect(first.parts.map((part) => part.mesh.positions)).toEqual(second.parts.map((part) => part.mesh.positions));
      expect(first.joints).toEqual(second.joints);
    }
  });
});
