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
    // Drop landmark groups (gantries span the whole road by design; here we
    // only check the per-slot furniture scatter footprint).
    const oneSide = buildStreetsceneParts({ bothSides: false, gantries: 0, materialStacks: 0, seed: 3 });
    const GROUND = ["road", "sidewalk", "lane_lines", "center_line"];
    const b = bounds(mergedMesh(oneSide.filter((p) => !GROUND.includes(p.name))));
    // Props only on +X side, so min.x should be >= 0.
    expect(b.min.x).toBeGreaterThanOrEqual(-0.5);
  });

  it("STREETSCENE_DEFAULTS is stable", () => {
    expect(STREETSCENE_DEFAULTS.length).toBe(24);
    expect(STREETSCENE_DEFAULTS.bothSides).toBe(true);
  });

  it("gantries add a namespaced freeway-sign group spanning the road", () => {
    const withG = buildStreetsceneParts({ gantries: 2, materialStacks: 0, seed: 5 });
    const gantry = withG.filter((p) => p.name.startsWith("gantry_"));
    expect(gantry.length, "has gantry parts").toBeGreaterThan(0);
    // Beam spans the road (rotated to run along X), so it must reach past both
    // sidewalks in X.
    const b = bounds(mergedMesh(gantry));
    const reach = STREETSCENE_DEFAULTS.roadHalfWidth + STREETSCENE_DEFAULTS.sidewalkWidth;
    expect(b.max.x).toBeGreaterThan(reach);
    expect(b.min.x).toBeLessThan(-reach);
    // And it stands taller than the furniture (a real gantry).
    expect(b.max.y).toBeGreaterThan(5);
  });

  it("material stacks add sidewalk cargo groups", () => {
    const withS = buildStreetsceneParts({ gantries: 0, materialStacks: 3, seed: 8 });
    const stacks = withS.filter((p) => p.name.startsWith("stack_"));
    expect(stacks.length, "has stack parts").toBeGreaterThan(0);
    for (const s of stacks) {
      expect(triangleCount(s.mesh), `${s.name} has tris`).toBeGreaterThan(0);
      expect(s.surface?.type, `${s.name} has surface`).toBeTruthy();
    }
  });

  it("gantries=0 and materialStacks=0 fall back to plain furniture scene", () => {
    const plain = buildStreetsceneParts({ gantries: 0, materialStacks: 0, seed: 5 });
    expect(plain.some((p) => p.name.startsWith("gantry_"))).toBe(false);
    expect(plain.some((p) => p.name.startsWith("stack_"))).toBe(false);
  });

  it("landmark placement stays deterministic across runs", () => {
    const a = mergedMesh(buildStreetsceneParts({ gantries: 2, materialStacks: 2, seed: 13 }));
    const b = mergedMesh(buildStreetsceneParts({ gantries: 2, materialStacks: 2, seed: 13 }));
    expect(a.positions).toEqual(b.positions);
  });

  it("gantry legends add procedural text parts", () => {
    const withG = buildStreetsceneParts({ gantries: 2, materialStacks: 0, seed: 5 });
    expect(withG.some((p) => p.name === "gantry_sign_legend")).toBe(true);
  });

  it("workZones cluster stacks and add fence groups", () => {
    const zoned = buildStreetsceneParts({ gantries: 0, materialStacks: 4, workZones: 1, seed: 8 });
    expect(zoned.some((p) => p.name.startsWith("stack_")), "has stacks").toBe(true);
    expect(zoned.some((p) => p.name.startsWith("fence_")), "has fence").toBe(true);
  });

  it("workZones=0 scatters stacks with no fences (legacy path)", () => {
    const scattered = buildStreetsceneParts({ gantries: 0, materialStacks: 4, workZones: 0, seed: 8 });
    expect(scattered.some((p) => p.name.startsWith("stack_"))).toBe(true);
    expect(scattered.some((p) => p.name.startsWith("fence_"))).toBe(false);
  });

  it("clustered zones stay deterministic across runs", () => {
    const a = mergedMesh(buildStreetsceneParts({ materialStacks: 5, workZones: 2, seed: 17 }));
    const b = mergedMesh(buildStreetsceneParts({ materialStacks: 5, workZones: 2, seed: 17 }));
    expect(a.positions).toEqual(b.positions);
  });
});
