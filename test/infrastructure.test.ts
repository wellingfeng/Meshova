import { describe, expect, it } from "vitest";
import {
  buildViaductParts,
  VIADUCT_DEFAULTS,
  buildPylonParts,
  buildTowerCraneParts,
  buildWindTurbineParts,
  buildTollStationParts,
  buildTunnelPortalParts,
  bounds,
  merge,
  triangleCount,
  type NamedPart,
} from "../src/index.js";

function mergedMesh(parts: NamedPart[]) {
  return merge(...parts.map((p) => p.mesh));
}

function allPartsValid(parts: NamedPart[]) {
  expect(parts.length).toBeGreaterThan(0);
  for (const p of parts) {
    expect(triangleCount(p.mesh)).toBeGreaterThan(0);
    expect(p.mesh.positions.every((v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z))).toBe(true);
  }
}

describe("viaduct model", () => {
  it("builds deck + piers + pier caps and is deterministic", () => {
    const parts = buildViaductParts();
    allPartsValid(parts);
    const names = parts.map((p) => p.name);
    expect(names).toContain("deck_surface");
    expect(names).toContain("deck_slab");
    expect(names).toContain("piers");
    expect(names).toContain("pier_caps");
    const a = mergedMesh(buildViaductParts());
    const b = mergedMesh(buildViaductParts());
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });

  it("main span reaches the requested clearance height", () => {
    const parts = buildViaductParts({ clearance: 10 });
    const deck = parts.find((p) => p.name === "deck_slab")!;
    expect(bounds(deck.mesh).max.y).toBeGreaterThan(9);
  });

  it("piers drop to the ground", () => {
    const piers = buildViaductParts({ clearance: 8 }).find((p) => p.name === "piers")!;
    expect(bounds(piers.mesh).min.y).toBeLessThan(0.2);
  });

  it("barriers and abutments toggle off", () => {
    const off = buildViaductParts({ barriers: false, abutments: false });
    expect(off.some((p) => p.name.startsWith("barrier_"))).toBe(false);
    expect(off.some((p) => p.name.startsWith("abutment_"))).toBe(false);
  });

  it("square piers produce different geometry than round piers", () => {
    const round = buildViaductParts({ pierShape: "round" }).find((p) => p.name === "piers")!;
    const square = buildViaductParts({ pierShape: "square" }).find((p) => p.name === "piers")!;
    // Square piers use a 4-gon ring, round uses a 12-gon: different vertex counts.
    expect(square.mesh.positions.length).not.toBe(round.mesh.positions.length);
    expect(triangleCount(square.mesh)).toBeGreaterThan(0);
  });

  it("pier taper narrows the top of the column", () => {
    const straight = buildViaductParts({ pierTaper: 1 }).find((p) => p.name === "piers")!;
    const tapered = buildViaductParts({ pierTaper: 0.6 }).find((p) => p.name === "piers")!;
    // Tapered columns are narrower overall (smaller X extent up top).
    const bw = bounds(straight.mesh);
    const tw = bounds(tapered.mesh);
    expect(tw.max.x - tw.min.x).toBeLessThanOrEqual(bw.max.x - bw.min.x + 1e-6);
  });

  it("VIADUCT_DEFAULTS is stable", () => {
    expect(VIADUCT_DEFAULTS.length).toBe(80);
    expect(VIADUCT_DEFAULTS.clearance).toBe(8);
    expect(VIADUCT_DEFAULTS.pierShape).toBe("round");
  });
});

describe("toll station model", () => {
  it("builds road pad + islands + canopy", () => {
    const parts = buildTollStationParts();
    allPartsValid(parts);
    const names = parts.map((p) => p.name);
    expect(names).toContain("islands");
    expect(names).toContain("canopy");
    expect(names).toContain("canopy_columns");
  });

  it("more lanes widen the plaza footprint", () => {
    const few = bounds(mergedMesh(buildTollStationParts({ lanes: 3 })));
    const many = bounds(mergedMesh(buildTollStationParts({ lanes: 8 })));
    expect(many.max.x - many.min.x).toBeGreaterThan(few.max.x - few.min.x);
  });

  it("booths toggle off", () => {
    const off = buildTollStationParts({ booths: false });
    expect(off.some((p) => p.name === "booths")).toBe(false);
  });

  it("canopy sits above the clearance height", () => {
    const canopy = buildTollStationParts({ clearance: 5.5 }).find((p) => p.name === "canopy")!;
    expect(bounds(canopy.mesh).min.y).toBeGreaterThanOrEqual(5.4);
  });
});

describe("tunnel portal model", () => {
  it("builds piers + arch + bore", () => {
    const parts = buildTunnelPortalParts();
    allPartsValid(parts);
    const names = parts.map((p) => p.name);
    expect(names).toContain("piers");
    expect(names).toContain("arch");
    expect(names).toContain("bore");
  });

  it("arch crown rises above the wall springline", () => {
    const parts = buildTunnelPortalParts({ openingHalfWidth: 6, wallHeight: 4 });
    const arch = bounds(parts.find((p) => p.name === "arch")!.mesh);
    expect(arch.max.y).toBeGreaterThan(4);
  });

  it("bore recedes behind the facade (negative Z)", () => {
    const bore = buildTunnelPortalParts({ boreDepth: 14 }).find((p) => p.name === "bore")!;
    expect(bounds(bore.mesh).min.z).toBeLessThan(-5);
  });

  it("bore is a D-shaped shell matching the opening (walls + arch crown)", () => {
    const bore = buildTunnelPortalParts({ openingHalfWidth: 6, wallHeight: 4 }).find((p) => p.name === "bore")!;
    const b = bounds(bore.mesh);
    // Side walls sit at +/- opening half-width, crown reaches springline + radius.
    expect(b.max.x).toBeCloseTo(6, 1);
    expect(b.min.x).toBeCloseTo(-6, 1);
    expect(b.max.y).toBeCloseTo(4 + 6, 1);
    expect(b.min.y).toBeCloseTo(0, 1);
  });

  it("is deterministic", () => {
    const a = mergedMesh(buildTunnelPortalParts());
    const b = mergedMesh(buildTunnelPortalParts());
    expect(a.positions).toEqual(b.positions);
  });
});

describe("transmission pylon model", () => {
  it("builds a tapered lattice tower with cross-arms", () => {
    const parts = buildPylonParts();
    allPartsValid(parts);
    const names = parts.map((p) => p.name);
    expect(names).toContain("legs");
    expect(names).toContain("cross_arms");
    expect(names).toContain("insulators");
  });

  it("taller height raises the tower top", () => {
    const short = bounds(mergedMesh(buildPylonParts({ height: 16 })));
    const tall = bounds(mergedMesh(buildPylonParts({ height: 32 })));
    expect(tall.max.y).toBeGreaterThan(short.max.y);
  });

  it("is deterministic", () => {
    const a = mergedMesh(buildPylonParts({ height: 24, levels: 6 }));
    const b = mergedMesh(buildPylonParts({ height: 24, levels: 6 }));
    expect(a.positions).toEqual(b.positions);
  });
});

describe("tower crane model", () => {
  it("builds mast + jib + counter-jib + hook", () => {
    const parts = buildTowerCraneParts();
    allPartsValid(parts);
    const names = parts.map((p) => p.name);
    expect(names).toContain("mast");
    expect(names).toContain("jib");
    expect(names).toContain("counter_jib");
    expect(names).toContain("hook");
  });

  it("jib and counter-jib extend to opposite sides along Z", () => {
    const parts = buildTowerCraneParts();
    const jib = bounds(parts.find((p) => p.name === "jib")!.mesh);
    const counter = bounds(parts.find((p) => p.name === "counter_jib")!.mesh);
    expect(jib.max.z).toBeGreaterThan(0);
    expect(counter.min.z).toBeLessThan(0);
  });

  it("hook hangs below the jib by the requested drop", () => {
    const parts = buildTowerCraneParts({ mastHeight: 30, hookDrop: 12 });
    const jib = bounds(parts.find((p) => p.name === "jib")!.mesh);
    const hook = bounds(parts.find((p) => p.name === "hook")!.mesh);
    expect(hook.max.y).toBeLessThan(jib.min.y);
  });
});

describe("wind turbine model", () => {
  it("builds tower + nacelle + hub + blades", () => {
    const parts = buildWindTurbineParts();
    allPartsValid(parts);
    const names = parts.map((p) => p.name);
    expect(names).toContain("tower");
    expect(names).toContain("nacelle");
    expect(names).toContain("blades");
  });

  it("blade count changes blade geometry span", () => {
    const three = mergedMesh(buildWindTurbineParts({ blades: 3 }));
    const five = mergedMesh(buildWindTurbineParts({ blades: 5 }));
    expect(five.positions.length).toBeGreaterThan(three.positions.length);
  });

  it("blades reach above the nacelle hub height", () => {
    const parts = buildWindTurbineParts({ towerHeight: 28, bladeLength: 16 });
    const blades = bounds(parts.find((p) => p.name === "blades")!.mesh);
    expect(blades.max.y).toBeGreaterThan(28 + 10);
  });

  it("is deterministic for a fixed rotor phase and twist", () => {
    const a = mergedMesh(buildWindTurbineParts({ rotorPhase: 0.4, bladeTwist: 0.5 }));
    const b = mergedMesh(buildWindTurbineParts({ rotorPhase: 0.4, bladeTwist: 0.5 }));
    expect(a.positions).toEqual(b.positions);
  });

  it("airfoil twist changes blade geometry vs an untwisted blade", () => {
    const flat = mergedMesh(buildWindTurbineParts({ bladeTwist: 0 }));
    const twisted = mergedMesh(buildWindTurbineParts({ bladeTwist: 0.8 }));
    // Same topology, different vertex positions once twist is applied.
    expect(twisted.positions.length).toBe(flat.positions.length);
    const differs = twisted.positions.some((v, i) => {
      const f = flat.positions[i]!;
      return Math.abs(v.x - f.x) > 1e-4 || Math.abs(v.z - f.z) > 1e-4;
    });
    expect(differs).toBe(true);
  });
});

