import { describe, it, expect } from "vitest";
import {
  SURFACE_LIBRARY,
  buildSurface,
  resolvePhysical,
  resolveWaterSurfaceParams,
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

  it("resolves distinct deterministic river, pond, and ocean profiles", () => {
    const river = resolveWaterSurfaceParams({ body: "river", seed: 9 });
    const pond = resolveWaterSurfaceParams({ body: "pond", seed: 9 });
    const ocean = resolveWaterSurfaceParams({ body: "ocean", seed: 9 });
    expect(river.flowSpeed).toBeGreaterThan(pond.flowSpeed);
    expect(ocean.waveAmplitude).toBeGreaterThan(river.waveAmplitude);
    expect(ocean.waveAmplitude).toBeLessThan(0.08);
    expect(ocean.rippleScale).toBeGreaterThan(river.rippleScale);
    expect(ocean.deepOpacity).toBeGreaterThan(ocean.shallowOpacity);
    expect(ocean.shallowWidth).toBeLessThan(river.shallowWidth);
    expect(ocean.deepColor[2]).toBeGreaterThan(ocean.deepColor[1]);
    expect(river.tint[1]).toBeGreaterThan(river.tint[2]);
    expect(pond.tint[1]).toBeGreaterThan(pond.tint[2]);
    expect(resolveWaterSurfaceParams({ body: "river", seed: 9 })).toEqual(river);
  });

  it("builds water with physical IOR, absorption, and profile roughness", () => {
    const water = buildSurface("water", { body: "ocean", roughness: 0.08 })!;
    const physical = resolvePhysical(water.physical);
    expect(physical.ior).toBeCloseTo(1.333, 3);
    expect(physical.transmission).toBeGreaterThan(0);
    expect(physical.attenuationDistance).toBeGreaterThan(1);
    expect(water.fields.roughness!(0.2, 0.7)).toBeCloseTo(0.08, 5);
  });

  it("opaque metal is not transparent", () => {
    const m = buildSurface("metal")!;
    expect(m.transparent).toBe(false);
    expect(resolvePhysical(m.physical).transmission).toBe(0);
  });

  it("honors ceramic roughness without enabling transparency", () => {
    const matte = buildSurface("ceramic", { roughness: 0.6 })!;
    const glossy = buildSurface("ceramic", { roughness: 0.12 })!;
    expect(matte.fields.roughness!(0.5, 0.5)).toBeGreaterThan(0.5);
    expect(glossy.fields.roughness!(0.5, 0.5)).toBeLessThan(0.25);
    expect(resolvePhysical(matte.physical).transmission).toBe(0);
    expect(resolvePhysical(matte.physical).opacity).toBe(1);
    expect(resolvePhysical(matte.physical).clearcoatRoughness).toBeGreaterThan(0.4);
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
    // wetGround / sand / dirtRoad / mossyStone: opaque, but build cleanly with valid fields
    for (const k of ["wetGround", "sand", "dirtRoad", "mossyStone"]) {
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
