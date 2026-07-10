import { describe, it, expect } from "vitest";
import {
  buildTitanRailParts,
  TITAN_RAIL_DEFAULTS,
} from "../src/models/titan-rail.js";

describe("titan-rail (Tutorial_Rail.hda)", () => {
  it("builds ballast, sleepers and rails parts with geometry", () => {
    const parts = buildTitanRailParts();
    const names = parts.map((p) => p.name).sort();
    expect(names).toEqual(["ballast", "rails", "sleepers"]);
    for (const p of parts) expect(p.mesh.positions.length).toBeGreaterThan(0);
  });

  it("is deterministic — same params, identical geometry", () => {
    const a = buildTitanRailParts({ bend: 6, length: 40 });
    const b = buildTitanRailParts({ bend: 6, length: 40 });
    const ra = a.find((p) => p.name === "rails")!;
    const rb = b.find((p) => p.name === "rails")!;
    expect(ra.mesh.positions).toEqual(rb.mesh.positions);
  });

  it("reacts to segmentLength — smaller pieces => more geometry", () => {
    const coarse = buildTitanRailParts({ segmentLength: 8 });
    const fine = buildTitanRailParts({ segmentLength: 2 });
    const cRails = coarse.find((p) => p.name === "rails")!.mesh.positions.length;
    const fRails = fine.find((p) => p.name === "rails")!.mesh.positions.length;
    expect(fRails).toBeGreaterThan(cRails);
  });

  it("concrete sleepers switch surface + color", () => {
    const wood = buildTitanRailParts({ concreteSleepers: false });
    const conc = buildTitanRailParts({ concreteSleepers: true });
    const ws = wood.find((p) => p.name === "sleepers")!;
    const cs = conc.find((p) => p.name === "sleepers")!;
    expect(ws.surface?.type).toBe("wood");
    expect(cs.surface?.type).toBe("concrete");
    expect(ws.color).not.toEqual(cs.color);
  });

  it("exposes HDA provenance metadata", () => {
    const parts = buildTitanRailParts();
    const rails = parts.find((p) => p.name === "rails")!;
    expect(rails.metadata?.source).toBe("Tutorial_Rail.hda");
  });

  it("defaults are standard gauge", () => {
    expect(TITAN_RAIL_DEFAULTS.gauge).toBeCloseTo(1.435, 3);
  });
});
