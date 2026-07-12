import { describe, expect, it } from "vitest";
import {
  INTERIOR_COMBINATION_MODELS,
  INTERIOR_SYSTEM_MODELS,
  bounds,
  buildInteriorCombinationParts,
  buildInteriorSystemParts,
  merge,
  triangleCount,
} from "../src/index.js";

describe("procedural interior model families", () => {
  it("registers twenty independent models across five systems", () => {
    expect(INTERIOR_SYSTEM_MODELS).toHaveLength(20);
    expect(new Set(INTERIOR_SYSTEM_MODELS.map((model) => model.id)).size).toBe(20);
    expect(new Set(INTERIOR_SYSTEM_MODELS.map((model) => model.kind)).size).toBe(20);
    expect(new Set(INTERIOR_SYSTEM_MODELS.map((model) => model.category)).size).toBe(5);
  });

  it.each(INTERIOR_SYSTEM_MODELS)("builds valid semantic geometry for $name", (definition) => {
    const parts = buildInteriorSystemParts(definition.defaults);
    const mesh = merge(...parts.map((entry) => entry.mesh));
    const modelBounds = bounds(mesh);

    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts.every((entry) => entry.label && !/^component_|^root\./.test(entry.label))).toBe(true);
    expect(parts.every((entry) => typeof entry.metadata?.materialSlot === "string")).toBe(true);
    expect(parts.every((entry) => entry.metadata?.collision === "box")).toBe(true);
    expect(parts.every((entry) => Array.isArray(entry.metadata?.anchors))).toBe(true);
    expect(mesh.positions.length).toBeGreaterThan(30);
    expect(mesh.normals).toHaveLength(mesh.positions.length);
    expect(mesh.uvs).toHaveLength(mesh.positions.length);
    expect(mesh.indices.every((index) => index >= 0 && index < mesh.positions.length)).toBe(true);
    expect(triangleCount(mesh)).toBeGreaterThan(10);
    expect(modelBounds.max.x - modelBounds.min.x).toBeGreaterThan(0.08);
    expect(modelBounds.max.y - modelBounds.min.y).toBeGreaterThan(0.08);
    expect(modelBounds.max.z - modelBounds.min.z).toBeGreaterThan(0.03);
  });

  it("is deterministic and links dimensions to geometry", () => {
    const options = { kind: "kitchen-island", width: 2.2, count: 4 } as const;
    const first = buildInteriorSystemParts(options);
    const second = buildInteriorSystemParts(options);
    expect(first.map((entry) => entry.mesh.positions)).toEqual(second.map((entry) => entry.mesh.positions));

    const narrow = merge(...buildInteriorSystemParts({ kind: "wall-panel", width: 2 }).map((entry) => entry.mesh));
    const wide = merge(...buildInteriorSystemParts({ kind: "wall-panel", width: 5 }).map((entry) => entry.mesh));
    expect(bounds(wide).max.x - bounds(wide).min.x).toBeGreaterThan(bounds(narrow).max.x - bounds(narrow).min.x);
  });

  it("changes opening, style and LOD without losing anchors", () => {
    const closed = buildInteriorSystemParts({ kind: "casement-window", openness: 0 });
    const open = buildInteriorSystemParts({ kind: "casement-window", openness: 1 });
    expect(open.map((entry) => entry.mesh.positions)).not.toEqual(closed.map((entry) => entry.mesh.positions));

    const square = buildInteriorSystemParts({ kind: "structural-column", style: 0 });
    const round = buildInteriorSystemParts({ kind: "structural-column", style: 1 });
    expect(round.map((entry) => entry.mesh.positions)).not.toEqual(square.map((entry) => entry.mesh.positions));

    const preview = buildInteriorSystemParts({ kind: "workstation", detail: 0 });
    const detailed = buildInteriorSystemParts({ kind: "workstation", detail: 1 });
    expect(detailed.length).toBeGreaterThan(preview.length);
    expect(detailed.every((entry) => entry.metadata?.lod === "high")).toBe(true);
    expect(preview.every((entry) => entry.metadata?.lod === "preview")).toBe(true);
  });

  it("registers and builds three kitchen combination presets", () => {
    expect(INTERIOR_COMBINATION_MODELS).toHaveLength(3);
    expect(new Set(INTERIOR_COMBINATION_MODELS.map((model) => model.id)).size).toBe(3);

    for (const definition of INTERIOR_COMBINATION_MODELS) {
      const parts = buildInteriorCombinationParts(definition.defaults);
      const mesh = merge(...parts.map((entry) => entry.mesh));
      expect(parts.length).toBeGreaterThanOrEqual(8);
      expect(parts.every((entry) => typeof entry.metadata?.assemblyRole === "string")).toBe(true);
      expect(parts.every((entry) => entry.metadata?.assembly === definition.kind)).toBe(true);
      expect(triangleCount(mesh)).toBeGreaterThan(80);
    }
  });

  it("transforms component anchors into combination space", () => {
    const parts = buildInteriorCombinationParts({ kind: "l-shaped-kitchen", width: 4.2, depth: 3.6 });
    const anchors = parts.flatMap((entry) => entry.metadata?.anchors as Array<{ position: [number, number, number] }>);
    const sideWallAnchors = parts
      .filter((entry) => entry.metadata?.assemblyRole === "侧墙地柜")
      .flatMap((entry) => entry.metadata?.anchors as Array<{ position: [number, number, number] }>);

    expect(anchors.length).toBeGreaterThan(10);
    expect(sideWallAnchors.some((anchor) => anchor.position[2] > 0)).toBe(true);
    expect(sideWallAnchors.every((anchor) => anchor.position.every(Number.isFinite))).toBe(true);
  });

  it("cuts a real sink opening into detailed island countertops", () => {
    const preview = buildInteriorSystemParts({ kind: "kitchen-island", detail: 0 });
    const detailed = buildInteriorSystemParts({ kind: "kitchen-island", detail: 1 });
    expect(preview.some((entry) => entry.name === "island_sink")).toBe(false);
    expect(detailed.some((entry) => entry.name === "island_sink")).toBe(true);
    expect(detailed.find((entry) => entry.name === "island_countertop")!.mesh.positions.length)
      .toBeGreaterThan(preview.find((entry) => entry.name === "island_countertop")!.mesh.positions.length);
  });
});
