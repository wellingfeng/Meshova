import { describe, expect, it } from "vitest";
import {
  buildFreewayParts,
  FREEWAY_DEFAULTS,
  roadMedianBarrier,
  roadGuardrail,
  roadPillars,
  roadDeck,
  roadPierCaps,
  roadSignGantry,
  polyline,
  bezier,
  vec3,
  bounds,
  merge,
  triangleCount,
  vertexCount,
  type NamedPart,
} from "../src/index.js";

function mergedMesh(parts: NamedPart[]) {
  return merge(...parts.map((p) => p.mesh));
}

const straight = polyline([vec3(0, 0, -10), vec3(0, 0, 10)]);

describe("freeway road primitives", () => {
  it("median barrier sweeps a non-empty raised wall", () => {
    const m = roadMedianBarrier(straight, { barrierHeight: 0.9, barrierWidth: 0.6 });
    expect(triangleCount(m)).toBeGreaterThan(0);
    const b = bounds(m);
    expect(b.max.y).toBeGreaterThan(0.5); // reaches barrier height
  });

  it("guardrail builds posts + rail on the chosen side", () => {
    const right = roadGuardrail(straight, { side: 1, lateral: 3, postSpacing: 4 });
    const left = roadGuardrail(straight, { side: -1, lateral: 3, postSpacing: 4 });
    expect(triangleCount(right)).toBeGreaterThan(0);
    expect(triangleCount(left)).toBeGreaterThan(0);
    // side=+1 and side=-1 land on opposite sides of the centerline.
    expect(bounds(right).min.x * bounds(left).max.x).toBeLessThan(0);
    expect(bounds(right).max.y).toBeGreaterThan(0.5); // rail reaches its height
  });

  it("pillars only appear when the deck is elevated above ground", () => {
    const flat = roadPillars(straight, { spacing: 5, groundY: 0 });
    expect(triangleCount(flat)).toBe(0); // deck at y=0, no room for pillars
    const elevated = roadPillars(polyline([vec3(0, 6, -10), vec3(0, 6, 10)]), { spacing: 5, groundY: 0 });
    expect(triangleCount(elevated)).toBeGreaterThan(0);
    expect(bounds(elevated).min.y).toBeLessThan(0.1); // reach ground
  });

  it("roadDeck sweeps a solid slab with a real underside below the surface", () => {
    const m = roadDeck(straight, { halfWidth: 4, thickness: 0.6, verticalOffset: 0 });
    expect(triangleCount(m)).toBeGreaterThan(0);
    const b = bounds(m);
    // slab spans from top (0) down to -thickness, so it has a genuine bottom face.
    expect(b.min.y).toBeLessThan(-0.5);
    expect(b.max.y).toBeLessThanOrEqual(0.001);
    expect(b.max.x - b.min.x).toBeGreaterThan(7); // full width ~8
  });

  it("roadPierCaps places one transverse beam per pillar station", () => {
    const caps = roadPierCaps(polyline([vec3(0, 5, -20), vec3(0, 5, 20)]), {
      spacing: 10,
      capWidth: 12,
      deckThickness: 0.6,
    });
    expect(triangleCount(caps)).toBeGreaterThan(0);
    const b = bounds(caps);
    // caps hang just under the deck (y=5 - deckThickness) and span the width.
    expect(b.max.y).toBeLessThan(5);
    expect(b.max.x - b.min.x).toBeGreaterThan(10);
  });

  it("roadSignGantry straddles the road: two poles + beam above clearance", () => {
    const g = roadSignGantry(straight, {
      halfWidth: 6,
      spacing: 8,
      clearance: 5.5,
      verticalOffset: 0,
    });
    expect(triangleCount(g)).toBeGreaterThan(0);
    const b = bounds(g);
    expect(b.max.y).toBeGreaterThan(5.5); // beam rises above the clearance height
    expect(b.max.x - b.min.x).toBeGreaterThan(12); // spans wider than the road
  });
});

describe("freeway model", () => {
  it("builds two carriageways + a median barrier", () => {
    const parts = buildFreewayParts();
    const names = parts.map((p) => p.name);
    expect(names).toContain("deck_r");
    expect(names).toContain("deck_l");
    expect(names).toContain("median_barrier");
    expect(names).toContain("guardrail_r");
  });

  it("is deterministic: same params -> identical geometry", () => {
    const a = mergedMesh(buildFreewayParts({ bend: 8, lanesPerSide: 3 }));
    const b = mergedMesh(buildFreewayParts({ bend: 8, lanesPerSide: 3 }));
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });

  it("elevation adds pillars that reach the ground", () => {
    const flat = buildFreewayParts({ elevation: 0 });
    expect(flat.some((p) => p.name === "pillars")).toBe(false);
    const via = buildFreewayParts({ elevation: 6, pillars: true });
    const pillars = via.find((p) => p.name === "pillars");
    expect(pillars).toBeDefined();
    expect(bounds(pillars!.mesh).min.y).toBeLessThan(0.1);
  });

  it("elevated freeway adds solid slabs + pier caps under the deck", () => {
    const via = buildFreewayParts({ elevation: 6, pillars: true });
    const names = via.map((p) => p.name);
    expect(names).toContain("slab_r");
    expect(names).toContain("slab_l");
    expect(names).toContain("pier_caps");
    // Ground-level freeway has no slab/cap parts.
    const flat = buildFreewayParts({ elevation: 0 });
    expect(flat.some((p) => p.name.startsWith("slab_"))).toBe(false);
    expect(flat.some((p) => p.name === "pier_caps")).toBe(false);
  });

  it("sign gantries toggle and rise above the carriageway", () => {
    const on = buildFreewayParts({ signGantry: true });
    const gantry = on.find((p) => p.name === "sign_gantry");
    expect(gantry).toBeDefined();
    expect(bounds(gantry!.mesh).max.y).toBeGreaterThan(5);
    const off = buildFreewayParts({ signGantry: false });
    expect(off.some((p) => p.name === "sign_gantry")).toBe(false);
  });

  it("more lanes per side widens the carriageway footprint", () => {
    const narrow = bounds(mergedMesh(buildFreewayParts({ lanesPerSide: 2, bend: 0 })));
    const wide = bounds(mergedMesh(buildFreewayParts({ lanesPerSide: 4, bend: 0 })));
    const narrowW = narrow.max.x - narrow.min.x;
    const wideW = wide.max.x - wide.min.x;
    expect(wideW).toBeGreaterThan(narrowW);
  });

  it("guardrails toggle off", () => {
    const off = buildFreewayParts({ guardrails: false });
    expect(off.some((p) => p.name.startsWith("guardrail_"))).toBe(false);
  });

  it("FREEWAY_DEFAULTS is stable", () => {
    expect(FREEWAY_DEFAULTS.lanesPerSide).toBe(3);
    expect(FREEWAY_DEFAULTS.length).toBe(60);
  });
});
