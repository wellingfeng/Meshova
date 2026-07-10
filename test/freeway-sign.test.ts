import { describe, it, expect } from "vitest";
import { buildFreewaySignParts, FREEWAY_SIGN_DEFAULTS } from "../src/models/freeway-sign.js";

describe("freeway-sign (CitySample Kit_FreewaySign)", () => {
  it("builds gantry + sign parts with geometry", () => {
    const parts = buildFreewaySignParts();
    const names = parts.map((p) => p.name);
    expect(names).toContain("gantry");
    expect(names).toContain("sign_face");
    expect(names).toContain("sign_trim");
    for (const p of parts) expect(p.mesh.positions.length).toBeGreaterThan(0);
  });

  it("is deterministic across runs (seeded truss jitter)", () => {
    const a = buildFreewaySignParts({ seed: 3 });
    const b = buildFreewaySignParts({ seed: 3 });
    const ag = a.find((p) => p.name === "gantry")!;
    const bg = b.find((p) => p.name === "gantry")!;
    expect(ag.mesh.positions).toEqual(bg.mesh.positions);
  });

  it("solid beam differs from truss beam", () => {
    const truss = buildFreewaySignParts({ truss: true });
    const solid = buildFreewaySignParts({ truss: false });
    const tv = truss.find((p) => p.name === "gantry")!.mesh.positions.length;
    const sv = solid.find((p) => p.name === "gantry")!.mesh.positions.length;
    expect(tv).toBeGreaterThan(sv);
  });

  it("signCount controls panel geometry", () => {
    const one = buildFreewaySignParts({ signCount: 1 });
    const three = buildFreewaySignParts({ signCount: 3 });
    const o = one.find((p) => p.name === "sign_trim")!.mesh.positions.length;
    const t = three.find((p) => p.name === "sign_trim")!.mesh.positions.length;
    expect(t).toBeGreaterThan(o);
  });

  it("lights flag toggles lamp parts", () => {
    const withLights = buildFreewaySignParts({ lights: true });
    const noLights = buildFreewaySignParts({ lights: false });
    expect(withLights.some((p) => p.name === "lamp_lens")).toBe(true);
    expect(noLights.some((p) => p.name === "lamp_lens")).toBe(false);
  });

  it("default span is 12m", () => {
    expect(FREEWAY_SIGN_DEFAULTS.span).toBeCloseTo(12, 3);
  });
});
