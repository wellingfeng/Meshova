import { describe, it, expect } from "vitest";
import { catenaryCurve } from "../src/geometry/curve-pieces.js";
import { buildTitanCableParts, TITAN_CABLE_DEFAULTS } from "../src/models/titan-cable.js";
import { vec3 } from "../src/index.js";

describe("catenaryCurve", () => {
  it("endpoints meet the anchors exactly", () => {
    const a = vec3(-5, 3, 0);
    const b = vec3(5, 3, 0);
    const c = catenaryCurve(a, b, { sag: 0.2, segments: 20 });
    const first = c.points[0]!;
    const last = c.points[c.points.length - 1]!;
    expect(first.x).toBeCloseTo(a.x, 5);
    expect(first.y).toBeCloseTo(a.y, 5);
    expect(last.x).toBeCloseTo(b.x, 5);
    expect(last.y).toBeCloseTo(b.y, 5);
  });

  it("midpoint sags below the anchor line by ~sag*span", () => {
    const a = vec3(-5, 3, 0);
    const b = vec3(5, 3, 0);
    const span = 10;
    const sag = 0.15;
    const c = catenaryCurve(a, b, { sag, segments: 21 });
    const mid = c.points[10]!;
    // catenary sag is close to the requested fraction of span
    expect(3 - mid.y).toBeCloseTo(sag * span, 1);
  });

  it("sag=0 gives a straight line", () => {
    const c = catenaryCurve(vec3(0, 2, 0), vec3(4, 2, 0), { sag: 0, segments: 10 });
    for (const pt of c.points) expect(pt.y).toBeCloseTo(2, 6);
  });

  it("is deterministic", () => {
    const opts = { sag: 0.2, segments: 16 };
    const c1 = catenaryCurve(vec3(0, 0, 0), vec3(8, 1, 0), opts);
    const c2 = catenaryCurve(vec3(0, 0, 0), vec3(8, 1, 0), opts);
    expect(c1.points).toEqual(c2.points);
  });
});

describe("titan-cable (tutorial_cable.hda)", () => {
  it("builds poles and cables with geometry", () => {
    const parts = buildTitanCableParts();
    const names = parts.map((p) => p.name).sort();
    expect(names).toEqual(["cables", "poles"]);
    for (const p of parts) expect(p.mesh.positions.length).toBeGreaterThan(0);
  });

  it("more poles => more geometry, deterministic", () => {
    const a = buildTitanCableParts({ poles: 3 });
    const b = buildTitanCableParts({ poles: 6 });
    const ap = a.find((p) => p.name === "poles")!.mesh.positions.length;
    const bp = b.find((p) => p.name === "poles")!.mesh.positions.length;
    expect(bp).toBeGreaterThan(ap);
    const c = buildTitanCableParts({ poles: 3 });
    expect(a.find((p) => p.name === "cables")!.mesh.positions).toEqual(
      c.find((p) => p.name === "cables")!.mesh.positions,
    );
  });

  it("subCables count controls cable geometry", () => {
    const few = buildTitanCableParts({ subCables: 1 });
    const many = buildTitanCableParts({ subCables: 4 });
    const fp = few.find((p) => p.name === "cables")!.mesh.positions.length;
    const mp = many.find((p) => p.name === "cables")!.mesh.positions.length;
    expect(mp).toBeGreaterThan(fp);
  });

  it("metal poles switch surface", () => {
    expect(buildTitanCableParts({ metalPoles: true }).find((p) => p.name === "poles")!.surface?.type).toBe("metal");
    expect(buildTitanCableParts({ metalPoles: false }).find((p) => p.name === "poles")!.surface?.type).toBe("wood");
  });

  it("default is 4 poles", () => {
    expect(TITAN_CABLE_DEFAULTS.poles).toBe(4);
  });
});
