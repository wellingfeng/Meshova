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

  it("legends add a procedural sign_legend text part", () => {
    const withText = buildFreewaySignParts({ signCount: 2, legends: ["MAIN ST", "5TH AVE"] });
    const legend = withText.find((p) => p.name === "sign_legend");
    expect(legend, "has legend part").toBeTruthy();
    expect(legend!.mesh.positions.length).toBeGreaterThan(0);
  });

  it("different legends produce different glyph geometry", () => {
    const a = buildFreewaySignParts({ signCount: 1, legends: ["MAIN ST"] }).find((p) => p.name === "sign_legend")!;
    const b = buildFreewaySignParts({ signCount: 1, legends: ["AIRPORT"] }).find((p) => p.name === "sign_legend")!;
    expect(a.mesh.positions).not.toEqual(b.mesh.positions);
  });

  it("exit number adds a tab + legend geometry", () => {
    const noExit = buildFreewaySignParts({ signCount: 1, legends: ["MAIN ST"], exitNumber: "" });
    const withExit = buildFreewaySignParts({ signCount: 1, legends: ["MAIN ST"], exitNumber: "42" });
    const nf = noExit.find((p) => p.name === "sign_face")!.mesh.positions.length;
    const wf = withExit.find((p) => p.name === "sign_face")!.mesh.positions.length;
    expect(wf).toBeGreaterThan(nf); // extra tab box
  });

  it("empty legends still build (seeded default legends)", () => {
    const parts = buildFreewaySignParts({ signCount: 2, legends: [] });
    expect(parts.some((p) => p.name === "sign_legend")).toBe(true);
  });

  it("legend rendering stays deterministic", () => {
    const a = buildFreewaySignParts({ legends: ["HARBOR"], seed: 7 }).find((p) => p.name === "sign_legend")!;
    const b = buildFreewaySignParts({ legends: ["HARBOR"], seed: 7 }).find((p) => p.name === "sign_legend")!;
    expect(a.mesh.positions).toEqual(b.mesh.positions);
  });
});
