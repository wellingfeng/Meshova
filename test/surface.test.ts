import { describe, it, expect } from "vitest";
import {
  SURFACE_LIBRARY,
  buildSurface,
  resolvePhysical,
  defaultPhysical,
  makeSurface,
  runMeshScript,
  toViewerModel,
  box,
} from "../src/index.js";

describe("surface materials", () => {
  it("exposes all built-in surface types with labels", () => {
    const keys = Object.keys(SURFACE_LIBRARY);
    expect(keys).toContain("glass");
    expect(keys).toContain("liquid");
    expect(keys).toContain("metal");
    expect(keys).toContain("fabric");
    for (const k of keys) {
      const s = buildSurface(k);
      expect(s).not.toBeNull();
      expect(s!.type).toBe(k);
      expect(typeof s!.label).toBe("string");
    }
  });

  it("glass is transmissive with glass-like ior", () => {
    const g = buildSurface("glass")!;
    expect(g.transparent).toBe(true);
    const phys = resolvePhysical(g.physical);
    expect(phys.transmission).toBeGreaterThan(0.9);
    expect(phys.ior).toBeGreaterThan(1.4);
    expect(phys.ior).toBeLessThan(1.8);
  });

  it("liquid carries a strong attenuation tint", () => {
    const w = buildSurface("liquid", { tint: [0.4, 0.04, 0.08] })!;
    const phys = resolvePhysical(w.physical);
    expect(phys.transmission).toBeGreaterThan(0);
    expect(phys.attenuationColor[0]).toBeCloseTo(0.4, 5);
    expect(phys.attenuationDistance).toBeLessThan(1);
  });

  it("opaque metal is not transparent", () => {
    const m = buildSurface("metal")!;
    expect(m.transparent).toBe(false);
    expect(resolvePhysical(m.physical).transmission).toBe(0);
  });

  it("unknown surface type returns null", () => {
    expect(buildSurface("not-a-real-type")).toBeNull();
  });

  it("shader-free AAA gap-fill materials carry their defining physical traits", () => {
    // silk: anisotropic satin highlight
    expect(resolvePhysical(buildSurface("silk")!.physical).anisotropy).toBeGreaterThan(0);
    // flakePaint: glossy clearcoat over metallic flake
    expect(resolvePhysical(buildSurface("flakePaint")!.physical).clearcoat).toBeGreaterThan(0.9);
    // jade: translucent SSS look with short attenuation distance
    const j = buildSurface("jade")!;
    expect(j.transparent).toBe(true);
    expect(resolvePhysical(j.physical).attenuationDistance).toBeLessThan(1);
    // snow: faint forward-scatter translucency
    expect(resolvePhysical(buildSurface("snow")!.physical).transmission).toBeGreaterThan(0);
    // wetGround / sand / mossyStone: opaque, but build cleanly with valid fields
    for (const k of ["wetGround", "sand", "mossyStone"]) {
      const s = buildSurface(k)!;
      expect(s.fields.baseColor!(0.5, 0.5).length).toBe(3);
      expect(s.fields.roughness!(0.3, 0.7)).toBeGreaterThanOrEqual(0.04);
    }
  });

  it("more material types (scratched metal, knit, bark, neon, foliage) build cleanly", () => {
    expect(resolvePhysical(buildSurface("scratchedMetal")!.physical).anisotropy).toBeGreaterThan(0);
    expect(resolvePhysical(buildSurface("knit")!.physical).sheen).toBeGreaterThan(0);
    expect(buildSurface("bark")!.fields.roughness!(0.5, 0.5)).toBeGreaterThan(0.8);
    expect(resolvePhysical(buildSurface("neon")!.physical).emissiveIntensity).toBeGreaterThan(3);
    expect(buildSurface("leaf")!.transparent).toBe(true);
    expect(resolvePhysical(buildSurface("grassBlade")!.physical).transmission).toBeGreaterThan(0);
  });

  it("short animal coat is distinct from plush fur", () => {
    const short = buildSurface("shortCoat", { tint: [0.02, 0.018, 0.014] })!;
    const black = buildSurface("blackCoat")!;
    const fur = buildSurface("fur")!;
    expect(short.type).toBe("shortCoat");
    expect(black.type).toBe("blackCoat");
    expect(short.fields.normalStrength).toBeLessThan(fur.fields.normalStrength!);
    expect(resolvePhysical(black.physical).clearcoat).toBeGreaterThan(0);
    expect(resolvePhysical(black.physical).sheen).toBeGreaterThan(0);
  });

  it("defaultPhysical is a neutral opaque dielectric", () => {
    const d = defaultPhysical();
    expect(d.transmission).toBe(0);
    expect(d.opacity).toBe(1);
    expect(d.clearcoat).toBe(0);
  });

  it("makeSurface infers transparency from transmission", () => {
    const s = makeSurface({ type: "x", physical: { transmission: 0.5 } });
    expect(s.transparent).toBe(true);
  });
});

describe("matched model + material via script", () => {
  it("surfacePart attaches a surface ref that survives viewer export", () => {
    const script = `
      const bowl = sphere(0.5, 16, 12);
      return [ surfacePart("bowl", bowl, "glass", { tint: [0.9,0.95,0.95] }) ];
    `;
    const res = runMeshScript(script, "glass-test");
    expect(res.ok).toBe(true);
    expect(res.parts[0]!.surface).toEqual({ type: "glass", params: { tint: [0.9, 0.95, 0.95] } });
    const vm = toViewerModel(res.parts, "glass-test");
    expect(vm.parts[0]!.surface).toEqual({ type: "glass", params: { tint: [0.9, 0.95, 0.95] } });
  });

  it("plain part has no surface ref", () => {
    const vm = toViewerModel([{ name: "b", mesh: box(1, 1, 1), color: [1, 0, 0] }], "x");
    expect(vm.parts[0]!.surface).toBeUndefined();
  });
});
