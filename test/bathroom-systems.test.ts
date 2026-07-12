import { describe, expect, it } from "vitest";
import {
  BATHROOM_FIXTURE_MODELS,
  BATHROOM_SUITE_MODELS,
  analyzeBathroomLayout,
  buildBathroomFixtureParts,
  buildBathroomSuiteParts,
} from "../src/models/bathroom-systems.js";
import {
  bounds,
  merge,
  triangleCount,
} from "../src/geometry/index.js";

describe("procedural bathroom systems", () => {
  it("registers five fixtures and three suite presets", () => {
    expect(BATHROOM_FIXTURE_MODELS).toHaveLength(5);
    expect(BATHROOM_SUITE_MODELS).toHaveLength(3);
    expect(new Set(BATHROOM_FIXTURE_MODELS.map((entry) => entry.id)).size).toBe(5);
    expect(new Set(BATHROOM_SUITE_MODELS.map((entry) => entry.id)).size).toBe(3);
  });

  it.each(BATHROOM_FIXTURE_MODELS)("builds valid semantic geometry for $name", (definition) => {
    const parts = buildBathroomFixtureParts(definition.defaults);
    const mesh = merge(...parts.map((entry) => entry.mesh));
    const modelBounds = bounds(mesh);

    expect(parts.length).toBeGreaterThanOrEqual(3);
    expect(parts.every((entry) => entry.label && !/^component_|^root\./.test(entry.label))).toBe(true);
    expect(parts.every((entry) => typeof entry.metadata?.materialSlot === "string")).toBe(true);
    expect(parts.every((entry) => Array.isArray(entry.metadata?.anchors))).toBe(true);
    expect(mesh.positions.length).toBeGreaterThan(40);
    expect(mesh.normals).toHaveLength(mesh.positions.length);
    expect(mesh.uvs).toHaveLength(mesh.positions.length);
    expect(mesh.indices.every((index) => index >= 0 && index < mesh.positions.length)).toBe(true);
    expect(triangleCount(mesh)).toBeGreaterThan(20);
    expect(modelBounds.max.x - modelBounds.min.x).toBeGreaterThan(0.1);
    expect(modelBounds.max.y - modelBounds.min.y).toBeGreaterThan(0.1);
    expect(modelBounds.max.z - modelBounds.min.z).toBeGreaterThan(0.05);
  });

  it("uses real openings and swept plumbing geometry", () => {
    const vanity = buildBathroomFixtureParts({ kind: "vanity", detail: 1 });
    const shower = buildBathroomFixtureParts({ kind: "shower-enclosure", detail: 1 });
    const countertop = vanity.find((entry) => entry.name === "vanity_countertop")!;
    const tray = shower.find((entry) => entry.name === "shower_tray")!;
    const plumbing = vanity.find((entry) => entry.name === "vanity_supplies")!;
    const riser = shower.find((entry) => entry.name === "shower_riser")!;

    expect(countertop.metadata?.opening).toMatchObject({ type: "basin" });
    expect(tray.metadata?.opening).toMatchObject({ type: "drain" });
    expect(countertop.mesh.positions.length).toBeGreaterThan(24);
    expect(tray.mesh.positions.length).toBeGreaterThan(24);
    expect(triangleCount(plumbing.mesh)).toBeGreaterThan(40);
    expect(triangleCount(riser.mesh)).toBeGreaterThan(20);
  });

  it("links movable state and LOD to geometry", () => {
    const closed = buildBathroomFixtureParts({ kind: "vanity", openness: 0, detail: 1 });
    const open = buildBathroomFixtureParts({ kind: "vanity", openness: 1, detail: 1 });
    const preview = buildBathroomFixtureParts({ kind: "vanity", detail: 0 });

    expect(open.find((entry) => entry.name === "vanity_doors")!.mesh.positions)
      .not.toEqual(closed.find((entry) => entry.name === "vanity_doors")!.mesh.positions);
    expect(open.find((entry) => entry.name === "vanity_doors")!.metadata?.joint).toMatchObject({ type: "hinge-pair", state: 1 });
    expect(closed.every((entry) => entry.metadata?.lod === "high")).toBe(true);
    expect(preview.every((entry) => entry.metadata?.lod === "preview")).toBe(true);
    expect(closed.length).toBeGreaterThan(preview.length);
  });

  it.each(BATHROOM_SUITE_MODELS)("builds integrated $name", (definition) => {
    const parts = buildBathroomSuiteParts(definition.defaults);
    const mesh = merge(...parts.map((entry) => entry.mesh));
    const errors = analyzeBathroomLayout(definition.defaults).filter((entry) => entry.severity === "error");

    expect(parts.some((entry) => entry.metadata?.assemblyRole === "卫浴空间")).toBe(true);
    expect(parts.some((entry) => entry.metadata?.assemblyRole === "淋浴房" || entry.metadata?.assemblyRole === "步入式淋浴房")).toBe(true);
    expect(parts.every((entry) => entry.metadata?.assembly === `bathroom-suite-${definition.kind}`)).toBe(true);
    expect(parts.every((entry) => Array.isArray(entry.metadata?.layoutIssues))).toBe(true);
    expect(errors).toHaveLength(0);
    expect(triangleCount(mesh)).toBeGreaterThan(250);
  });

  it("transforms fixture anchors into suite space", () => {
    const parts = buildBathroomSuiteParts({ kind: "standard" });
    const showerParts = parts.filter((entry) => entry.metadata?.assemblyRole === "淋浴房");
    const anchors = showerParts.flatMap((entry) => entry.metadata?.anchors as Array<{ position: [number, number, number] }>);

    expect(anchors.length).toBeGreaterThan(5);
    expect(anchors.every((anchor) => anchor.position.every(Number.isFinite))).toBe(true);
    expect(anchors.some((anchor) => anchor.position[0] > 0.8)).toBe(true);
    expect(anchors.some((anchor) => anchor.position[2] < -0.5)).toBe(true);
  });

  it("reports cramped layouts deterministically", () => {
    const input = { kind: "compact", width: 1.6, depth: 1.5, openness: 1 } as const;
    const first = analyzeBathroomLayout(input);
    const second = analyzeBathroomLayout(input);

    expect(first).toEqual(second);
    expect(first.some((entry) => entry.severity === "error")).toBe(true);
    expect(first.some((entry) => ["insufficient-room", "out-of-bounds", "fixture-overlap"].includes(entry.code))).toBe(true);
  });

  it("is deterministic", () => {
    const input = { kind: "spa", width: 5.4, depth: 4.4, openness: 0.6 } as const;
    const first = buildBathroomSuiteParts(input);
    const second = buildBathroomSuiteParts(input);
    expect(first.map((entry) => entry.mesh.positions)).toEqual(second.map((entry) => entry.mesh.positions));
  });
});
