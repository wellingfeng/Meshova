import { describe, expect, it } from "vitest";
import {
  fireHydrant,
  trashCan,
  mailbox,
  streetLamp,
  bench,
  bollard,
  trafficSign,
  planter,
  STREET_PROP_KIT,
  buildStreetsceneParts,
  STREETSCENE_DEFAULTS,
  bounds,
  merge,
  triangleCount,
  vertexCount,
  type NamedPart,
} from "../src/index.js";

function mergedMesh(parts: NamedPart[]) {
  return merge(...parts.map((p) => p.mesh));
}

describe("street-furniture kit", () => {
  it("every prop builder yields non-empty named parts with matched surfaces", () => {
    for (const [id, build] of Object.entries(STREET_PROP_KIT)) {
      const parts = build();
      expect(parts.length, `${id} has parts`).toBeGreaterThan(0);
      for (const p of parts) {
        expect(triangleCount(p.mesh), `${id}/${p.name} has tris`).toBeGreaterThan(0);
        expect(p.surface?.type, `${id}/${p.name} has surface`).toBeTruthy();
      }
    }
  });

  it("props rest on the ground (min y >= -epsilon)", () => {
    for (const build of [fireHydrant, trashCan, mailbox, streetLamp, bench, bollard, trafficSign, planter]) {
      const b = bounds(mergedMesh(build()));
      expect(b.min.y).toBeGreaterThanOrEqual(-0.001);
    }
  });

  it("kit exposes all eight props", () => {
    expect(Object.keys(STREET_PROP_KIT).sort()).toEqual(
      ["bench", "bollard", "hydrant", "lamp", "mailbox", "planter", "sign", "trashcan"].sort(),
    );
  });
});

describe("streetscene assembler", () => {
  it("produces ground + at least one prop group", () => {
    const parts = buildStreetsceneParts();
    const names = parts.map((p) => p.name);
    expect(names).toContain("road");
    expect(names).toContain("sidewalk");
    // At least one lamp is guaranteed by the cadence rule.
    expect(names.some((n) => n.startsWith("lamp_"))).toBe(true);
  });

  it("is deterministic: same seed -> identical geometry", () => {
    const a = mergedMesh(buildStreetsceneParts({ seed: 7 }));
    const b = mergedMesh(buildStreetsceneParts({ seed: 7 }));
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });

  it("different seeds change the scene", () => {
    const a = mergedMesh(buildStreetsceneParts({ seed: 1 }));
    const b = mergedMesh(buildStreetsceneParts({ seed: 42 }));
    // Layout differs -> positions not identical.
    expect(a.positions).not.toEqual(b.positions);
  });

  it("bothSides=false halves the placement footprint on -X", () => {
    const oneSide = buildStreetsceneParts({ bothSides: false, seed: 3 });
    const GROUND = ["road", "sidewalk", "lane_lines", "center_line"];
    const b = bounds(mergedMesh(oneSide.filter((p) => !GROUND.includes(p.name))));
    // Props only on +X side, so min.x should be >= 0.
    expect(b.min.x).toBeGreaterThanOrEqual(-0.5);
  });

  it("STREETSCENE_DEFAULTS is stable", () => {
    expect(STREETSCENE_DEFAULTS.length).toBe(24);
    expect(STREETSCENE_DEFAULTS.bothSides).toBe(true);
  });
});
