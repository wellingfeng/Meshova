/**
 * Surface materials (P8) — material types beyond the metal/roughness PBR base.
 *
 * The PBR `Material` (pbr.ts) only carries the metal/rough channel set, so it
 * can describe opaque dielectrics and metals but NOT glass, liquids, lacquered
 * surfaces, fabrics with sheen, etc. Real scenes need those: a wine glass is
 * transmissive glass, a car body is clearcoated paint, a cushion has sheen.
 *
 * A `SurfaceMaterial` keeps the same procedural texture fields (so it still
 * bakes to PNGs and DataTextures) and adds the *physical scalar* parameters a
 * physically-based renderer needs to go past opaque PBR — transmission, ior,
 * thickness/attenuation (glass + tinted liquids), clearcoat, sheen, specular,
 * iridescence, opacity, emissiveIntensity. These map 1:1 onto three.js
 * MeshPhysicalMaterial, so the viewer can render them honestly.
 *
 * This is the single source of truth for "what kind of surface is this":
 * AI-generated scripts attach a SurfaceMaterial (or just its type name) to each
 * part, and the viewer bakes it. Model and material are produced together and
 * stay matched, instead of a globally-applied preset that ignores the geometry.
 */
import type { MaterialFields } from "./pbr.js";
import { makeNoise, fbm2 } from "../random/noise.js";
import { voronoi } from "./patterns.js";
import { clamp } from "../math/scalar.js";
import {
  plushFur as plushFurFields,
  wood as woodFields,
  terrain as terrainFields,
  brickWall as brickWallFields,
  ceramic as ceramicFields,
  rustyMetal as rustyMetalFields,
} from "./presets.js";
import {
  painterVertex as painterVertexFields,
  stylizedPlaster as plasterFields,
  stylizedRoof as roofFields,
  brushPainted as brushPaintedFields,
  stylizedMetal as stylizedMetalFields,
  stylizedFoliage as stylizedFoliageFields,
  type StylizedParams,
} from "./stylized.js";
import {
  weatheredPlaster as weatheredPlasterFields,
  terracottaRoof as terracottaRoofFields,
  romanCobblestone as romanCobblestoneFields,
} from "./roman-presets.js";

/**
 * Physical surface parameters layered on top of the PBR channel fields. Every
 * value is optional with a physically-neutral default, so an opaque material
 * just omits them. Units/ranges follow the glTF / three MeshPhysicalMaterial
 * conventions.
 */
export interface SurfacePhysical {
  /** 0 = opaque, 1 = fully transmissive (glass/water). Default 0. */
  transmission?: number;
  /** Index of refraction, 1.0–2.333. Glass≈1.5, water≈1.33, diamond≈2.4. */
  ior?: number;
  /** Volume thickness for refraction + absorption. 0 = thin-walled. */
  thickness?: number;
  /** Beer–Lambert absorption color for thick transmissive volumes (linear). */
  attenuationColor?: [number, number, number];
  /** Distance light travels before attenuationColor fully applies. */
  attenuationDistance?: number;
  /** Clearcoat layer strength 0..1 (car paint, lacquer, varnished wood). */
  clearcoat?: number;
  /** Clearcoat roughness 0..1. */
  clearcoatRoughness?: number;
  /** Sheen strength 0..1 (cloth, velvet, dusty surfaces). */
  sheen?: number;
  /** Sheen tint (linear rgb). */
  sheenColor?: [number, number, number];
  /** Sheen roughness 0..1. */
  sheenRoughness?: number;
  /** Dielectric specular intensity 0..1 (default 1). Lowers Fresnel for cloth. */
  specularIntensity?: number;
  /** Iridescence strength 0..1 (soap film, beetle shells, oil slick). */
  iridescence?: number;
  /** Iridescence film thickness in nm (typ. 100–400). */
  iridescenceThickness?: number;
  /** Iridescence film index of refraction (1.0–2.333). Default 1.3. */
  iridescenceIOR?: number;
  /** Anisotropy strength 0..1 (brushed/satin metal, hair, vinyl). */
  anisotropy?: number;
  /** Anisotropy rotation in radians (direction of the grain). */
  anisotropyRotation?: number;
  /** Tinted dielectric specular color (linear rgb). Default white. */
  specularColor?: [number, number, number];
  /** Chromatic dispersion for transmissive gems (Abbe-ish). 0 = none. */
  dispersion?: number;
  /** Surface opacity 0..1 (use transmission for true glass; this is alpha). */
  opacity?: number;
  /** Emission multiplier for emissive materials. */
  emissiveIntensity?: number;
}

/**
 * A complete surface description: the procedural PBR texture fields (reused
 * verbatim from presets.ts) plus the physical scalar layer. `fields` may be
 * omitted for a flat-colored surface defined purely by `baseColor`.
 */
export interface SurfaceMaterial {
  /** Stable type id, e.g. "glass", "car-paint". Used for UI + matching. */
  type: string;
  /** Human label (zh-CN) for the viewer dropdown. */
  label: string;
  /** Per-texel PBR channel fields (baseColor/metallic/roughness/…). */
  fields: MaterialFields;
  /** Physical scalar layer for MeshPhysicalMaterial. */
  physical: SurfacePhysical;
  /** True when the surface needs alpha/transmission blending (render hint). */
  transparent: boolean;
}

/** Neutral physical defaults: opaque dielectric. */
export function defaultPhysical(): Required<SurfacePhysical> {
  return {
    transmission: 0,
    ior: 1.5,
    thickness: 0,
    attenuationColor: [1, 1, 1],
    attenuationDistance: Infinity,
    clearcoat: 0,
    clearcoatRoughness: 0,
    sheen: 0,
    sheenColor: [1, 1, 1],
    sheenRoughness: 1,
    specularIntensity: 1,
    iridescence: 0,
    iridescenceThickness: 200,
    iridescenceIOR: 1.3,
    anisotropy: 0,
    anisotropyRotation: 0,
    specularColor: [1, 1, 1],
    dispersion: 0,
    opacity: 1,
    emissiveIntensity: 1,
  };
}

/** Merge a partial physical layer over the neutral defaults. */
export function resolvePhysical(p: SurfacePhysical = {}): Required<SurfacePhysical> {
  return { ...defaultPhysical(), ...p };
}

/** Assemble a SurfaceMaterial, filling sensible defaults. */
export function makeSurface(opts: {
  type: string;
  label?: string;
  fields?: MaterialFields;
  physical?: SurfacePhysical;
  transparent?: boolean;
}): SurfaceMaterial {
  const physical = opts.physical ?? {};
  const transparent =
    opts.transparent ?? ((physical.transmission ?? 0) > 0 || (physical.opacity ?? 1) < 1);
  return {
    type: opts.type,
    label: opts.label ?? opts.type,
    fields: opts.fields ?? {},
    physical,
    transparent,
  };
}

/* ------------------------------------------------------------------ */
/* Built-in surface library — the named material types a scene can use */
/* ------------------------------------------------------------------ */

export interface SurfaceParams {
  seed?: number;
  /** Override base/albedo tint (linear rgb). */
  color?: [number, number, number];
}

/** Clear or tinted transmissive glass (wine glass, window, bottle). */
export function glass(p: SurfaceParams & { tint?: [number, number, number]; roughness?: number; thickness?: number } = {}): SurfaceMaterial {
  const tint = p.tint ?? p.color ?? [0.95, 0.97, 0.97];
  const rough = clamp(p.roughness ?? 0.02, 0.0, 1);
  return makeSurface({
    type: "glass",
    label: "玻璃",
    fields: {
      baseColor: () => tint,
      metallic: () => 0,
      roughness: () => rough,
      height: () => 0.5,
    },
    physical: {
      transmission: 1,
      ior: 1.5,
      thickness: p.thickness ?? 0.4,
      attenuationColor: tint,
      attenuationDistance: 1.2,
      specularIntensity: 1,
    },
    transparent: true,
  });
}

/** Tinted liquid (wine, water) — transmissive with strong Beer-Lambert color. */
export function liquid(p: SurfaceParams & { tint?: [number, number, number]; ior?: number; transmission?: number } = {}): SurfaceMaterial {
  const tint = p.tint ?? p.color ?? [0.4, 0.04, 0.08]; // red wine
  return makeSurface({
    type: "liquid",
    label: "液体",
    fields: {
      // Strong colored base so the liquid keeps its hue even where it transmits.
      baseColor: () => tint,
      metallic: () => 0,
      roughness: () => 0.06,
      height: () => 0.5,
    },
    physical: {
      // Partial transmission: full transmission on a thin lathe shell washes the
      // color out to the background. Mixing in the colored base keeps wine red.
      transmission: p.transmission ?? 0.3,
      ior: p.ior ?? 1.35,
      thickness: 1.2,
      attenuationColor: tint,
      attenuationDistance: 0.12,
    },
    transparent: true,
  });
}

/** Glossy clearcoated car paint with a faint metallic flake base. */
export function carPaint(p: SurfaceParams & { color?: [number, number, number] } = {}): SurfaceMaterial {
  const color = p.color ?? [0.05, 0.12, 0.4];
  const noise = makeNoise(p.seed ?? 17);
  return makeSurface({
    type: "carPaint",
    label: "车漆",
    fields: {
      baseColor: () => color,
      metallic: () => 0.6,
      roughness: (u, v) => clamp(0.25 + (fbm2(noise, u * 200, v * 200, { octaves: 2 }) * 0.05), 0.04, 1),
      height: () => 0.5,
    },
    physical: { clearcoat: 1, clearcoatRoughness: 0.06, specularIntensity: 1 },
  });
}

/** Smooth tinted plastic — opaque dielectric, low roughness. */
export function plastic(p: SurfaceParams & { color?: [number, number, number]; roughness?: number } = {}): SurfaceMaterial {
  const color = p.color ?? [0.8, 0.2, 0.2];
  return makeSurface({
    type: "plastic",
    label: "塑料",
    fields: {
      baseColor: () => color,
      metallic: () => 0,
      roughness: () => clamp(p.roughness ?? 0.35, 0.04, 1),
      height: () => 0.5,
    },
    physical: { clearcoat: 0.3, clearcoatRoughness: 0.2 },
  });
}

/** Polished metal (chrome/steel/gold) — high metallic, low roughness. */
export function metal(p: SurfaceParams & { color?: [number, number, number]; roughness?: number } = {}): SurfaceMaterial {
  const color = p.color ?? [0.95, 0.96, 0.97];
  return makeSurface({
    type: "metal",
    label: "金属",
    fields: {
      baseColor: () => color,
      metallic: () => 1,
      roughness: () => clamp(p.roughness ?? 0.12, 0.04, 1),
      height: () => 0.5,
    },
    physical: {},
  });
}

/** Brushed/satin metal — anisotropic roughness via stretched noise + GGX anisotropy. */
export function brushedMetal(p: SurfaceParams & { color?: [number, number, number]; rotation?: number } = {}): SurfaceMaterial {
  const color = p.color ?? [0.72, 0.73, 0.75];
  const noise = makeNoise(p.seed ?? 23);
  return makeSurface({
    type: "brushedMetal",
    label: "拉丝金属",
    fields: {
      baseColor: () => color,
      metallic: () => 1,
      roughness: (u, v) => clamp(0.3 + fbm2(noise, u * 300, v * 4, { octaves: 2 }) * 0.12, 0.04, 1),
      height: (u, v) => clamp(0.5 + fbm2(noise, u * 300, v * 4, { octaves: 2 }) * 0.05, 0, 1),
      normalStrength: 1.2,
    },
    physical: { anisotropy: 0.85, anisotropyRotation: p.rotation ?? 0 },
  });
}

/** Cloth/velvet with sheen — soft dielectric, fiber roughness. */
export function fabric(p: SurfaceParams & { color?: [number, number, number] } = {}): SurfaceMaterial {
  const color = p.color ?? [0.45, 0.18, 0.22];
  const noise = makeNoise(p.seed ?? 31);
  return makeSurface({
    type: "fabric",
    label: "织物",
    fields: {
      baseColor: (u, v) => {
        const f = fbm2(noise, u * 80, v * 80, { octaves: 3 }) * 0.1;
        return [clamp(color[0] + f, 0, 1), clamp(color[1] + f, 0, 1), clamp(color[2] + f, 0, 1)];
      },
      metallic: () => 0,
      roughness: () => 0.9,
      height: (u, v) => clamp(0.5 + fbm2(noise, u * 120, v * 120, { octaves: 2 }) * 0.3, 0, 1),
      normalStrength: 1.5,
    },
    physical: { sheen: 0.8, sheenColor: [color[0], color[1], color[2]], sheenRoughness: 0.4, specularIntensity: 0.4 },
  });
}

/** Leather — dielectric with tunable pebbled normal and clearcoat sheen. */
export function leather(
  p: SurfaceParams & {
    color?: [number, number, number];
    roughness?: number;
    grainScale?: number;
    grainStrength?: number;
    normalStrength?: number;
    clearcoat?: number;
  } = {},
): SurfaceMaterial {
  const color = p.color ?? [0.28, 0.16, 0.1];
  const grain = clamp(p.grainStrength ?? 1, 0, 2);
  const cells = voronoi({ scale: p.grainScale ?? 40, seed: p.seed ?? 19, metric: "f1" });
  return makeSurface({
    type: "leather",
    label: "皮革",
    fields: {
      baseColor: (u, v) => {
        const s = 1 - grain * 0.15 + cells(u, v) * 0.2 * grain;
        return [clamp(color[0] * s, 0, 1), clamp(color[1] * s, 0, 1), clamp(color[2] * s, 0, 1)];
      },
      metallic: () => 0,
      roughness: (u, v) => clamp((p.roughness ?? 0.55) + cells(u, v) * 0.2 * grain, 0.04, 1),
      height: (u, v) => {
        const pebbled = 0.4 + cells(u, v) * 0.5;
        return clamp(0.5 + (pebbled - 0.5) * grain, 0, 1);
      },
      normalStrength: p.normalStrength ?? 2.5,
    },
    physical: { clearcoat: p.clearcoat ?? 0.15, clearcoatRoughness: 0.5, sheen: 0.2 },
  });
}

/** Glowing emissive material (lamp, screen, neon). */
export function emissive(p: SurfaceParams & { color?: [number, number, number]; intensity?: number } = {}): SurfaceMaterial {
  const color = p.color ?? [1, 0.85, 0.5];
  return makeSurface({
    type: "emissive",
    label: "自发光",
    fields: {
      baseColor: () => [0, 0, 0],
      metallic: () => 0,
      roughness: () => 0.5,
      emission: () => color,
      height: () => 0.5,
    },
    physical: { emissiveIntensity: p.intensity ?? 2.5 },
  });
}

/**
 * Foliage / leaf — two-sided translucent dielectric (UE MF_TwoSided_Leaves +
 * MF_generateTranslucency). Real leaves glow when backlit because light
 * transmits through the thin blade; we drive that with a partial transmission
 * plus a thin-walled thickness, add procedural vein streaks and a waxy sheen,
 * and a subtle season/health tint. `transparent` is on so the viewer treats it
 * as needing two-sided/alpha rendering.
 */
export function foliage(
  p: SurfaceParams & {
    color?: [number, number, number];
    /** 0 = fresh green, 1 = autumn/dry tint. */
    season?: number;
    /** Backlit transmission strength 0..1. */
    translucency?: number;
    veinScale?: number;
  } = {},
): SurfaceMaterial {
  const green = p.color ?? [0.16, 0.4, 0.12];
  const autumn: [number, number, number] = [0.5, 0.32, 0.08];
  const season = clamp(p.season ?? 0, 0, 1);
  const base: [number, number, number] = [
    green[0] + (autumn[0] - green[0]) * season,
    green[1] + (autumn[1] - green[1]) * season,
    green[2] + (autumn[2] - green[2]) * season,
  ];
  const noise = makeNoise(p.seed ?? 37);
  const veinScale = p.veinScale ?? 26;
  return makeSurface({
    type: "foliage",
    label: "叶片",
    fields: {
      baseColor: (u, v) => {
        // veins: elongated fbm streaks running along v (leaf length)
        const vein = fbm2(noise, u * veinScale, v * (veinScale * 0.35), { octaves: 3 });
        const shade = 1 - Math.abs(vein) * 0.35;
        // slight lighter edge tint toward the leaf tip
        const tip = 0.9 + v * 0.2;
        return [
          clamp(base[0] * shade * tip, 0, 1),
          clamp(base[1] * shade * tip, 0, 1),
          clamp(base[2] * shade * tip, 0, 1),
        ];
      },
      metallic: () => 0,
      roughness: (u, v) => clamp(0.55 + fbm2(noise, u * veinScale, v * veinScale, { octaves: 2 }) * 0.12, 0.2, 1),
      height: (u, v) => clamp(0.5 + fbm2(noise, u * veinScale, v * (veinScale * 0.35), { octaves: 2 }) * 0.25, 0, 1),
      normalStrength: 1.3,
    },
    physical: {
      transmission: p.translucency ?? 0.35,
      thickness: 0,
      ior: 1.4,
      sheen: 0.25,
      sheenColor: [0.7, 0.85, 0.5],
      sheenRoughness: 0.5,
      specularIntensity: 0.5,
      attenuationColor: [base[0] * 1.6, base[1] * 1.4, base[2] * 1.6],
    },
    transparent: true,
  });
}

/** Iridescent / pearlescent surface (soap film, beetle shell). */
export function iridescent(p: SurfaceParams & { color?: [number, number, number] } = {}): SurfaceMaterial {
  const color = p.color ?? [0.6, 0.6, 0.65];
  return makeSurface({
    type: "iridescent",
    label: "虹彩",
    fields: {
      baseColor: () => color,
      metallic: () => 0,
      roughness: () => 0.15,
      height: () => 0.5,
    },
    physical: { iridescence: 1, iridescenceThickness: 320, clearcoat: 0.5 },
  });
}

/* --- Textured surfaces: wrap the procedural PBR presets as surface types so --- */
/* the "follow model" mode shows full procedural textures + physical params.    */

/** Soft plush fur (teddy bear, animals). Procedural fiber texture. */
export function furSurface(p: SurfaceParams & { tint?: [number, number, number] } = {}): SurfaceMaterial {
  const fields = plushFurFields(p.tint ? { seed: p.seed ?? 11, tint: p.tint } : { seed: p.seed ?? 11 });
  return makeSurface({ type: "fur", label: "毛绒", fields, physical: { sheen: 0.3, sheenRoughness: 0.6, specularIntensity: 0.3 } });
}

function shortAnimalCoat(
  type: "shortCoat" | "blackCoat",
  label: string,
  p: SurfaceParams & {
    tint?: [number, number, number];
    roughness?: number;
    variation?: number;
    normalStrength?: number;
    sheen?: number;
    clearcoat?: number;
  },
  fallback: [number, number, number],
): SurfaceMaterial {
  const color = p.tint ?? p.color ?? fallback;
  const roughness = clamp(p.roughness ?? 0.46, 0.18, 0.95);
  const variation = clamp(p.variation ?? 0.08, 0, 0.4);
  const noise = makeNoise(p.seed ?? 191);
  const strand = (u: number, v: number) =>
    fbm2(noise, u * 150, v * 18, { octaves: 3 }) * 0.5 + 0.5;
  const broad = (u: number, v: number) =>
    fbm2(noise, u * 9, v * 7, { octaves: 3 }) * 0.5 + 0.5;
  return makeSurface({
    type,
    label,
    fields: {
      baseColor: (u, v) => {
        const shade = 0.94 + (strand(u, v) - 0.5) * variation + (broad(u, v) - 0.5) * variation * 0.6;
        return [
          clamp(color[0] * shade, 0, 1),
          clamp(color[1] * shade, 0, 1),
          clamp(color[2] * shade, 0, 1),
        ];
      },
      metallic: () => 0,
      roughness: (u, v) => clamp(roughness + (strand(u, v) - 0.5) * 0.08, 0.04, 1),
      ao: () => 1,
      height: (u, v) => clamp(0.5 + (strand(u, v) - 0.5) * 0.045, 0, 1),
      normalStrength: p.normalStrength ?? 0.35,
    },
    physical: {
      sheen: p.sheen ?? 0.18,
      sheenColor: [color[0] * 1.2, color[1] * 1.2, color[2] * 1.2],
      sheenRoughness: 0.5,
      specularIntensity: 0.55,
      clearcoat: p.clearcoat ?? 0.16,
      clearcoatRoughness: 0.34,
    },
  });
}

/** Short animal coat — subtle fiber/noise, not plush pile. */
export function shortCoat(
  p: SurfaceParams & {
    tint?: [number, number, number];
    roughness?: number;
    variation?: number;
    normalStrength?: number;
    sheen?: number;
    clearcoat?: number;
  } = {},
): SurfaceMaterial {
  return shortAnimalCoat("shortCoat", "短毛皮", p, [0.08, 0.07, 0.055]);
}

/** Glossy black horse coat — dark short hair with restrained blue highlights. */
export function blackCoat(
  p: SurfaceParams & {
    tint?: [number, number, number];
    roughness?: number;
    variation?: number;
    normalStrength?: number;
    sheen?: number;
    clearcoat?: number;
  } = {},
): SurfaceMaterial {
  return shortAnimalCoat("blackCoat", "黑色短毛", {
    ...p,
    tint: p.tint ?? p.color ?? [0.006, 0.007, 0.01],
    roughness: p.roughness ?? 0.4,
    variation: p.variation ?? 0.06,
    normalStrength: p.normalStrength ?? 0.25,
    clearcoat: p.clearcoat ?? 0.22,
  }, [0.006, 0.007, 0.01]);
}

/** Wood with annual rings + grain. */
export function woodSurface(p: SurfaceParams & { tone?: [number, number, number]; ringScale?: number } = {}): SurfaceMaterial {
  const fields = woodFields({ seed: p.seed ?? 9, ...(p.tone ? { tone: p.tone } : {}), ...(p.ringScale ? { ringScale: p.ringScale } : {}) });
  return makeSurface({ type: "wood", label: "木纹", fields, physical: { clearcoat: 0.1, clearcoatRoughness: 0.6 } });
}

/** Rocky stone / terrain surface. */
export function stoneSurface(p: SurfaceParams & { scale?: number } = {}): SurfaceMaterial {
  const fields = terrainFields({ seed: p.seed ?? 12, ...(p.scale ? { scale: p.scale } : {}) });
  return makeSurface({ type: "stone", label: "岩石", fields, physical: {} });
}

/** Brick wall. */
export function brickSurface(p: SurfaceParams = {}): SurfaceMaterial {
  const fields = brickWallFields({ seed: p.seed ?? 4 });
  return makeSurface({ type: "brick", label: "砖墙", fields, physical: {} });
}

/** Glossy ceramic / porcelain. */
export function ceramicSurface(p: SurfaceParams & { color?: [number, number, number]; roughness?: number } = {}): SurfaceMaterial {
  const roughness = clamp(p.roughness ?? 0.15, 0.04, 1);
  const fields = ceramicFields({
    seed: p.seed ?? 5,
    ...(p.color ? { color: p.color } : {}),
    roughness,
  });
  return makeSurface({
    type: "ceramic",
    label: "陶瓷",
    fields,
    physical: { clearcoat: 0.25, clearcoatRoughness: clamp(roughness * 0.8, 0.18, 0.75) },
  });
}

/** Aged lime plaster used by warm rendered Roman facades. */
export function weatheredPlasterSurface(
  p: SurfaceParams & { color?: [number, number, number]; wear?: number; scale?: number } = {},
): SurfaceMaterial {
  const fields = weatheredPlasterFields({
    seed: p.seed ?? 71,
    ...(p.color ? { color: p.color } : {}),
    ...(p.wear !== undefined ? { wear: p.wear } : {}),
    ...(p.scale !== undefined ? { scale: p.scale } : {}),
  });
  return makeSurface({ type: "weatheredPlaster", label: "风化灰泥", fields, physical: {} });
}

/** Fired clay roof courses with curved tile relief. */
export function terracottaRoofSurface(
  p: SurfaceParams & { color?: [number, number, number]; columns?: number; rows?: number; weathering?: number } = {},
): SurfaceMaterial {
  const fields = terracottaRoofFields({
    seed: p.seed ?? 83,
    ...(p.color ? { color: p.color } : {}),
    ...(p.columns !== undefined ? { columns: p.columns } : {}),
    ...(p.rows !== undefined ? { rows: p.rows } : {}),
    ...(p.weathering !== undefined ? { weathering: p.weathering } : {}),
  });
  return makeSurface({ type: "terracottaRoof", label: "陶瓦屋顶", fields, physical: {} });
}

/** Roman basalt street setts with worn crowns and recessed joints. */
export function romanCobblestoneSurface(
  p: SurfaceParams & { color?: [number, number, number]; columns?: number; rows?: number; wetness?: number } = {},
): SurfaceMaterial {
  const fields = romanCobblestoneFields({
    seed: p.seed ?? 97,
    ...(p.color ? { color: p.color } : {}),
    ...(p.columns !== undefined ? { columns: p.columns } : {}),
    ...(p.rows !== undefined ? { rows: p.rows } : {}),
    ...(p.wetness !== undefined ? { wetness: p.wetness } : {}),
  });
  return makeSurface({ type: "romanCobblestone", label: "罗马块石路", fields, physical: {} });
}

/** Rusted/pitted metal. */
export function rustyMetalSurface(p: SurfaceParams & { rust?: number; scale?: number } = {}): SurfaceMaterial {
  const fields = rustyMetalFields({ seed: p.seed ?? 7, ...(p.rust !== undefined ? { rust: p.rust } : {}), ...(p.scale ? { scale: p.scale } : {}) });
  return makeSurface({ type: "rustyMetal", label: "锈金属", fields, physical: {} });
}

/* ============================================================= */
/* AAA material additions — physically grounded F0/IOR, modeled  */
/* on Unreal's shading models (default-lit, clearcoat, cloth,    */
/* subsurface, thin-translucent, hair).                          */
/* ============================================================= */

/**
 * Physically measured metal albedo (F0) values, linear rgb. These are the real
 * specular colors of conductors — using them is what makes gold look like gold
 * instead of a yellow-tinted dielectric.
 */
export const METAL_F0: Record<string, [number, number, number]> = {
  gold: [1.0, 0.766, 0.336],
  silver: [0.972, 0.96, 0.915],
  aluminum: [0.913, 0.922, 0.924],
  copper: [0.955, 0.638, 0.538],
  iron: [0.56, 0.57, 0.58],
  chrome: [0.55, 0.556, 0.554],
  brass: [0.91, 0.78, 0.42],
  titanium: [0.616, 0.583, 0.544],
  cobalt: [0.662, 0.655, 0.634],
  nickel: [0.66, 0.61, 0.53],
};

/** Polished/brushed precious or industrial metal with correct F0 albedo. */
export function preciousMetal(
  p: SurfaceParams & { metal?: keyof typeof METAL_F0; roughness?: number; anisotropy?: number } = {},
): SurfaceMaterial {
  const name = p.metal ?? "gold";
  const color = p.color ?? METAL_F0[name] ?? METAL_F0.gold!;
  const labelMap: Record<string, string> = {
    gold: "黄金", silver: "白银", aluminum: "铝", copper: "紫铜", iron: "铁",
    chrome: "铬", brass: "黄铜", titanium: "钛", cobalt: "钴", nickel: "镍",
  };
  return makeSurface({
    type: "preciousMetal",
    label: labelMap[name] ?? "金属",
    fields: {
      baseColor: () => color,
      metallic: () => 1,
      roughness: () => clamp(p.roughness ?? 0.18, 0.04, 1),
      height: () => 0.5,
    },
    physical: p.anisotropy ? { anisotropy: p.anisotropy } : {},
  });
}

/** Polished marble/stone — subtle subsurface tint, clearcoat polish, veining. */
export function marble(p: SurfaceParams & { color?: [number, number, number]; veinColor?: [number, number, number] } = {}): SurfaceMaterial {
  const color = p.color ?? [0.86, 0.85, 0.82];
  const vein = p.veinColor ?? [0.32, 0.3, 0.28];
  const noise = makeNoise(p.seed ?? 41);
  // Turbulence-warped sinusoidal veins, classic marble.
  const veinMask = (u: number, v: number) => {
    const t = fbm2(noise, u * 4, v * 4, { octaves: 5 });
    return clamp(Math.abs(Math.sin((u * 6 + t * 4) * Math.PI)) ** 6, 0, 1);
  };
  return makeSurface({
    type: "marble",
    label: "大理石",
    fields: {
      baseColor: (u, v) => {
        const m = veinMask(u, v);
        return [
          clamp(color[0] * (1 - m) + vein[0] * m, 0, 1),
          clamp(color[1] * (1 - m) + vein[1] * m, 0, 1),
          clamp(color[2] * (1 - m) + vein[2] * m, 0, 1),
        ];
      },
      metallic: () => 0,
      roughness: (u, v) => clamp(0.18 + veinMask(u, v) * 0.1, 0.04, 1),
      height: (u, v) => clamp(0.5 - veinMask(u, v) * 0.05, 0, 1),
      normalStrength: 0.5,
    },
    // Thin SSS look via attenuation + a thin polished clearcoat.
    physical: { clearcoat: 0.4, clearcoatRoughness: 0.12, transmission: 0.06, thickness: 0.5, attenuationColor: color, attenuationDistance: 0.6, ior: 1.486 },
  });
}

/** Skin — soft subsurface scattering look (thin translucency + sheen + low spec). */
export function skin(p: SurfaceParams & { tone?: [number, number, number] } = {}): SurfaceMaterial {
  const tone = p.tone ?? p.color ?? [0.82, 0.6, 0.52];
  const noise = makeNoise(p.seed ?? 53);
  const pore = (u: number, v: number) => fbm2(noise, u * 220, v * 220, { octaves: 3 }) * 0.5 + 0.5;
  return makeSurface({
    type: "skin",
    label: "皮肤",
    fields: {
      baseColor: (u, v) => {
        const n = (pore(u, v) - 0.5) * 0.06;
        return [clamp(tone[0] + n, 0, 1), clamp(tone[1] + n * 0.8, 0, 1), clamp(tone[2] + n * 0.7, 0, 1)];
      },
      metallic: () => 0,
      roughness: (u, v) => clamp(0.42 + pore(u, v) * 0.18, 0.04, 1),
      height: (u, v) => clamp(0.5 + (pore(u, v) - 0.5) * 0.4, 0, 1),
      normalStrength: 0.7,
    },
    // Forward-scatter through thin tissue + faint oily clearcoat.
    physical: {
      transmission: 0.12, thickness: 0.4, ior: 1.4,
      attenuationColor: [0.9, 0.4, 0.32], attenuationDistance: 0.25,
      clearcoat: 0.15, clearcoatRoughness: 0.35,
      sheen: 0.1, sheenColor: [1, 0.85, 0.8], sheenRoughness: 0.5,
      specularIntensity: 0.6,
    },
  });
}

/** Velvet — strong retro-reflective sheen, fiber roughness, near-zero spec. */
export function velvet(p: SurfaceParams & { color?: [number, number, number] } = {}): SurfaceMaterial {
  const color = p.color ?? [0.32, 0.06, 0.12];
  const noise = makeNoise(p.seed ?? 61);
  return makeSurface({
    type: "velvet",
    label: "天鹅绒",
    fields: {
      baseColor: (u, v) => {
        const f = fbm2(noise, u * 140, v * 140, { octaves: 3 }) * 0.08;
        return [clamp(color[0] + f, 0, 1), clamp(color[1] + f, 0, 1), clamp(color[2] + f, 0, 1)];
      },
      metallic: () => 0,
      roughness: () => 1.0,
      height: (u, v) => clamp(0.5 + fbm2(noise, u * 200, v * 200, { octaves: 2 }) * 0.2, 0, 1),
      normalStrength: 1.0,
    },
    physical: { sheen: 1.0, sheenColor: [color[0] * 2.2, color[1] * 2.2, color[2] * 2.2], sheenRoughness: 0.25, specularIntensity: 0.15 },
  });
}

/** Cut gemstone — high IOR transmissive with dispersion (diamond/ruby/emerald). */
export function gem(p: SurfaceParams & {
  tint?: [number, number, number];
  roughness?: number;
  transmission?: number;
  thickness?: number;
  attenuationDistance?: number;
  ior?: number;
  dispersion?: number;
} = {}): SurfaceMaterial {
  const tint = p.tint ?? p.color ?? [0.98, 0.98, 1.0];
  return makeSurface({
    type: "gem",
    label: "宝石",
    fields: {
      baseColor: () => tint,
      metallic: () => 0,
      roughness: () => clamp(p.roughness ?? 0.02, 0, 1),
      height: () => 0.5,
    },
    physical: {
      transmission: clamp(p.transmission ?? 1, 0, 1),
      ior: clamp(p.ior ?? 2.4, 1, 2.6), // diamond
      thickness: Math.max(0, p.thickness ?? 0.6),
      attenuationColor: tint,
      attenuationDistance: Math.max(0.001, p.attenuationDistance ?? 0.8),
      dispersion: clamp(p.dispersion ?? 4.0, 0, 10),
      specularIntensity: 1,
    },
    transparent: true,
  });
}

export type WaterBodyKind = "river" | "pond" | "ocean";

export interface WaterSurfaceParams extends SurfaceParams {
  body?: WaterBodyKind;
  tint?: [number, number, number];
  deepColor?: [number, number, number];
  roughness?: number;
  transmission?: number;
  thickness?: number;
  attenuationDistance?: number;
  waveAmplitude?: number;
  waveScale?: number;
  rippleScale?: number;
  flowSpeed?: number;
  flowAngle?: number;
  foamStrength?: number;
  shallowWidth?: number;
  shallowOpacity?: number;
  deepOpacity?: number;
}

export interface ResolvedWaterSurfaceParams {
  body: WaterBodyKind;
  tint: [number, number, number];
  deepColor: [number, number, number];
  roughness: number;
  transmission: number;
  thickness: number;
  attenuationDistance: number;
  waveAmplitude: number;
  waveScale: number;
  rippleScale: number;
  flowSpeed: number;
  flowAngle: number;
  foamStrength: number;
  shallowWidth: number;
  shallowOpacity: number;
  deepOpacity: number;
  seed: number;
}

const WATER_PROFILES: Record<WaterBodyKind, Omit<ResolvedWaterSurfaceParams, "body" | "seed">> = {
  river: {
    tint: [0.14, 0.32, 0.24],
    deepColor: [0.025, 0.085, 0.065],
    roughness: 0.12,
    transmission: 0.28,
    thickness: 0.65,
    attenuationDistance: 1.4,
    waveAmplitude: 0.018,
    waveScale: 2.4,
    rippleScale: 28,
    flowSpeed: 0.85,
    flowAngle: 90,
    foamStrength: 0.38,
    shallowWidth: 0.08,
    shallowOpacity: 0.42,
    deepOpacity: 0.86,
  },
  pond: {
    tint: [0.18, 0.3, 0.19],
    deepColor: [0.035, 0.075, 0.045],
    roughness: 0.09,
    transmission: 0.4,
    thickness: 0.9,
    attenuationDistance: 1.2,
    waveAmplitude: 0.006,
    waveScale: 1.5,
    rippleScale: 32,
    flowSpeed: 0.24,
    flowAngle: 25,
    foamStrength: 0.12,
    shallowWidth: 0.06,
    shallowOpacity: 0.36,
    deepOpacity: 0.82,
  },
  ocean: {
    tint: [0.08, 0.32, 0.5],
    deepColor: [0.01, 0.055, 0.13],
    roughness: 0.065,
    transmission: 0.18,
    thickness: 2.5,
    attenuationDistance: 3.2,
    waveAmplitude: 0.055,
    waveScale: 0.7,
    rippleScale: 42,
    flowSpeed: 0.55,
    flowAngle: 18,
    foamStrength: 0.48,
    shallowWidth: 0.045,
    shallowOpacity: 0.5,
    deepOpacity: 0.92,
  },
};

export function resolveWaterSurfaceParams(p: WaterSurfaceParams = {}): ResolvedWaterSurfaceParams {
  const body = p.body ?? "pond";
  const profile = WATER_PROFILES[body];
  return {
    body,
    tint: p.tint ?? p.color ?? profile.tint,
    deepColor: p.deepColor ?? profile.deepColor,
    roughness: clamp(p.roughness ?? profile.roughness, 0.02, 1),
    transmission: clamp(p.transmission ?? profile.transmission, 0, 1),
    thickness: Math.max(0, p.thickness ?? profile.thickness),
    attenuationDistance: Math.max(0.01, p.attenuationDistance ?? profile.attenuationDistance),
    waveAmplitude: Math.max(0, p.waveAmplitude ?? profile.waveAmplitude),
    waveScale: Math.max(0.01, p.waveScale ?? profile.waveScale),
    rippleScale: Math.max(1, p.rippleScale ?? profile.rippleScale),
    flowSpeed: Math.max(0, p.flowSpeed ?? profile.flowSpeed),
    flowAngle: p.flowAngle ?? profile.flowAngle,
    foamStrength: clamp(p.foamStrength ?? profile.foamStrength, 0, 1),
    shallowWidth: clamp(p.shallowWidth ?? profile.shallowWidth, 0.01, 0.49),
    shallowOpacity: clamp(p.shallowOpacity ?? profile.shallowOpacity, 0.05, 1),
    deepOpacity: clamp(p.deepOpacity ?? profile.deepOpacity, 0.05, 1),
    seed: p.seed ?? 71,
  };
}

/** River, pond, or ocean water with profile-scaled ripple normals and absorption. */
export function water(p: WaterSurfaceParams = {}): SurfaceMaterial {
  const waterParams = resolveWaterSurfaceParams(p);
  const noise = makeNoise(waterParams.seed);
  const ripple = (u: number, v: number) => fbm2(noise, u * waterParams.rippleScale, v * waterParams.rippleScale, { octaves: 4 }) * 0.5 + 0.5;
  return makeSurface({
    type: "water",
    label: "水面",
    fields: {
      baseColor: () => waterParams.tint,
      metallic: () => 0,
      roughness: () => waterParams.roughness,
      height: (u, v) => clamp(0.5 + (ripple(u, v) - 0.5) * 0.6, 0, 1),
      normalStrength: waterParams.body === "ocean" ? 1.2 : 0.85,
    },
    physical: {
      transmission: waterParams.transmission,
      ior: 1.333,
      thickness: waterParams.thickness,
      attenuationColor: waterParams.deepColor,
      attenuationDistance: waterParams.attenuationDistance,
      clearcoat: 0.7,
      clearcoatRoughness: waterParams.roughness * 0.55,
    },
    transparent: true,
  });
}

/** Frosted/rough glass — transmissive with high roughness for a frosted look. */
export function frostedGlass(p: SurfaceParams & { tint?: [number, number, number]; roughness?: number } = {}): SurfaceMaterial {
  const tint = p.tint ?? p.color ?? [0.92, 0.94, 0.96];
  const noise = makeNoise(p.seed ?? 77);
  return makeSurface({
    type: "frostedGlass",
    label: "磨砂玻璃",
    fields: {
      baseColor: () => tint,
      metallic: () => 0,
      roughness: (u, v) => clamp((p.roughness ?? 0.35) + fbm2(noise, u * 60, v * 60, { octaves: 3 }) * 0.1, 0.04, 1),
      height: (u, v) => clamp(0.5 + fbm2(noise, u * 80, v * 80, { octaves: 2 }) * 0.3, 0, 1),
      normalStrength: 0.6,
    },
    physical: { transmission: 0.9, ior: 1.5, thickness: 0.3, attenuationColor: tint, attenuationDistance: 1.5 },
    transparent: true,
  });
}

/** Ice — transmissive with cool tint, internal cracks, slight roughness. */
export function ice(p: SurfaceParams & { tint?: [number, number, number] } = {}): SurfaceMaterial {
  const tint = p.tint ?? p.color ?? [0.82, 0.9, 0.95];
  const cracks = voronoi({ scale: 12, seed: p.seed ?? 83, metric: "f2-f1" });
  return makeSurface({
    type: "ice",
    label: "冰",
    fields: {
      baseColor: () => tint,
      metallic: () => 0,
      roughness: (u, v) => clamp(0.08 + cracks(u, v) * 0.25, 0.04, 1),
      height: (u, v) => clamp(0.5 - cracks(u, v) * 0.4, 0, 1),
      normalStrength: 1.5,
    },
    physical: { transmission: 0.85, ior: 1.31, thickness: 0.8, attenuationColor: tint, attenuationDistance: 1.2, clearcoat: 0.3, clearcoatRoughness: 0.1 },
    transparent: true,
  });
}

/** Polished lacquered wood — wood grain + glossy clearcoat (furniture, guitars). */
export function lacqueredWood(p: SurfaceParams & { tone?: [number, number, number]; ringScale?: number } = {}): SurfaceMaterial {
  const fields = woodFields({ seed: p.seed ?? 9, ...(p.tone ? { tone: p.tone } : {}), ...(p.ringScale ? { ringScale: p.ringScale } : {}) });
  return makeSurface({ type: "lacqueredWood", label: "亮漆木", fields, physical: { clearcoat: 0.9, clearcoatRoughness: 0.05, specularIntensity: 1 } });
}

/** Carbon fiber — woven anisotropic weave with a glossy resin clearcoat. */
export function carbonFiber(p: SurfaceParams & { color?: [number, number, number] } = {}): SurfaceMaterial {
  const color = p.color ?? [0.02, 0.02, 0.025];
  const weave = (u: number, v: number) => {
    // 2x2 twill: alternating diagonal direction per cell.
    const cu = Math.floor(u * 32) % 2;
    const cv = Math.floor(v * 32) % 2;
    const diag = (cu ^ cv) ? Math.sin((u + v) * 64 * Math.PI) : Math.sin((u - v) * 64 * Math.PI);
    return diag * 0.5 + 0.5;
  };
  return makeSurface({
    type: "carbonFiber",
    label: "碳纤维",
    fields: {
      baseColor: (u, v) => {
        const s = 0.7 + weave(u, v) * 0.5;
        return [clamp(color[0] * s + 0.02, 0, 1), clamp(color[1] * s + 0.02, 0, 1), clamp(color[2] * s + 0.03, 0, 1)];
      },
      metallic: () => 0.1,
      roughness: (u, v) => clamp(0.25 + weave(u, v) * 0.15, 0.04, 1),
      height: (u, v) => weave(u, v),
      normalStrength: 1.5,
    },
    physical: { clearcoat: 1, clearcoatRoughness: 0.04, anisotropy: 0.6 },
  });
}

/** Rubber — matte dielectric, very rough, faint sheen. Tires, grips. */
export function rubber(p: SurfaceParams & { color?: [number, number, number] } = {}): SurfaceMaterial {
  const color = p.color ?? [0.04, 0.04, 0.045];
  const noise = makeNoise(p.seed ?? 91);
  return makeSurface({
    type: "rubber",
    label: "橡胶",
    fields: {
      baseColor: () => color,
      metallic: () => 0,
      roughness: (u, v) => clamp(0.85 + fbm2(noise, u * 100, v * 100, { octaves: 2 }) * 0.1, 0.04, 1),
      height: (u, v) => clamp(0.5 + fbm2(noise, u * 150, v * 150, { octaves: 2 }) * 0.2, 0, 1),
      normalStrength: 1.0,
    },
    physical: { specularIntensity: 0.5 },
  });
}

/** Pearl / nacre — pearlescent iridescent dielectric over a soft base. */
export function pearl(p: SurfaceParams & { color?: [number, number, number] } = {}): SurfaceMaterial {
  const color = p.color ?? [0.92, 0.9, 0.88];
  return makeSurface({
    type: "pearl",
    label: "珍珠",
    fields: {
      baseColor: () => color,
      metallic: () => 0,
      roughness: () => 0.12,
      height: () => 0.5,
    },
    physical: { iridescence: 0.9, iridescenceThickness: 480, iridescenceIOR: 1.4, clearcoat: 0.7, clearcoatRoughness: 0.08 },
  });
}

/** Anodized / oil-slick metal — metallic with strong thin-film iridescence. */
export function anodizedMetal(p: SurfaceParams & { color?: [number, number, number] } = {}): SurfaceMaterial {
  const color = p.color ?? [0.3, 0.3, 0.32];
  return makeSurface({
    type: "anodizedMetal",
    label: "阳极氧化金属",
    fields: {
      baseColor: () => color,
      metallic: () => 1,
      roughness: () => 0.22,
      height: () => 0.5,
    },
    physical: { iridescence: 1, iridescenceThickness: 380, iridescenceIOR: 2.0 },
  });
}

/** Polished glossy paint (non-metallic, like appliance enamel) with clearcoat. */
export function glossPaint(p: SurfaceParams & { color?: [number, number, number] } = {}): SurfaceMaterial {
  const color = p.color ?? [0.8, 0.1, 0.1];
  return makeSurface({
    type: "glossPaint",
    label: "亮漆",
    fields: {
      baseColor: () => color,
      metallic: () => 0,
      roughness: () => 0.18,
      height: () => 0.5,
    },
    physical: { clearcoat: 1, clearcoatRoughness: 0.08 },
  });
}

/** Concrete — rough porous dielectric with mottled tone + AO pitting. */
export function concrete(p: SurfaceParams & { color?: [number, number, number] } = {}): SurfaceMaterial {
  const color = p.color ?? [0.55, 0.54, 0.52];
  const noise = makeNoise(p.seed ?? 97);
  const stain = makeNoise((p.seed ?? 97) + 1);
  return makeSurface({
    type: "concrete",
    label: "混凝土",
    fields: {
      baseColor: (u, v) => {
        const n = (fbm2(noise, u * 18, v * 18, { octaves: 5 }) - 0) * 0.12;
        const s = fbm2(stain, u * 3, v * 3, { octaves: 3 }) * 0.08;
        return [clamp(color[0] + n - s, 0, 1), clamp(color[1] + n - s, 0, 1), clamp(color[2] + n - s, 0, 1)];
      },
      metallic: () => 0,
      roughness: (u, v) => clamp(0.82 + fbm2(noise, u * 40, v * 40, { octaves: 2 }) * 0.12, 0.04, 1),
      ao: (u, v) => clamp(0.85 + fbm2(noise, u * 30, v * 30, { octaves: 3 }) * 0.15, 0, 1),
      height: (u, v) => clamp(0.5 + (fbm2(noise, u * 60, v * 60, { octaves: 4 }) - 0.0) * 0.25, 0, 1),
      normalStrength: 1.8,
    },
    physical: { specularIntensity: 0.5 },
  });
}

/** Slate / dark roof shingles — rectangular courses with subtle per-tile variation. */
export function slateRoof(
  p: SurfaceParams & { rows?: number; columns?: number } = {},
): SurfaceMaterial {
  const seed = p.seed ?? 63;
  const color = p.color ?? [0.24, 0.25, 0.22];
  const rows = Math.max(4, p.rows ?? 14);
  const columns = Math.max(3, p.columns ?? 8);
  const noise = makeNoise(seed);
  const rand = (x: number, y: number) => {
    const n = Math.sin(x * 127.1 + y * 311.7 + seed * 17.3) * 43758.5453123;
    return n - Math.floor(n);
  };
  const tileInfo = (u: number, v: number) => {
    const row = Math.floor(v * rows);
    const fy = v * rows - row;
    const x = u * columns + (row % 2) * 0.5;
    const col = Math.floor(x);
    const fx = x - col;
    const mortar = fx < 0.035 || fx > 0.965 || fy < 0.055 || fy > 0.985;
    const crown = Math.sin(fx * Math.PI) * Math.sin(fy * Math.PI);
    return { row, col, mortar, crown };
  };
  return makeSurface({
    type: "slateRoof",
    label: "板瓦屋顶",
    fields: {
      baseColor: (u, v) => {
        const t = tileInfo(u, v);
        const grain = fbm2(noise, u * 28, v * 42, { octaves: 3 }) * 0.5 + 0.5;
        const varied = 0.78 + rand(t.col, t.row) * 0.18 + grain * 0.08;
        const shade = t.mortar ? 0.48 : varied + t.crown * 0.06;
        return [
          clamp(color[0] * shade, 0, 1),
          clamp(color[1] * shade, 0, 1),
          clamp(color[2] * shade, 0, 1),
        ];
      },
      metallic: () => 0,
      roughness: (u, v) => clamp(0.82 + fbm2(noise, u * 18, v * 18, { octaves: 2 }) * 0.08, 0.04, 1),
      ao: (u, v) => (tileInfo(u, v).mortar ? 0.55 : 0.92),
      height: (u, v) => {
        const t = tileInfo(u, v);
        return t.mortar ? 0.2 : clamp(0.55 + t.crown * 0.25, 0, 1);
      },
      normalStrength: 1.15,
    },
    physical: { specularIntensity: 0.45 },
  });
}

/** Polished chrome — perfect mirror metal. */
export function chrome(p: SurfaceParams = {}): SurfaceMaterial {
  const s = preciousMetal({ ...p, metal: "chrome", roughness: 0.04 });
  return { ...s, type: "chrome", label: "镀铬" };
}

/* ============================================================= */
/* Phase: AAA gap-fill materials that the existing fields+physical */
/* (MeshPhysicalMaterial) pipeline can render honestly today —    */
/* no custom shader needed. Anisotropic silk, flake paint, jade   */
/* SSS, wet/snow/sand/moss surface layers.                        */
/* ============================================================= */

/** Silk / satin — anisotropic dielectric sheen stretched along the weave. */
export function silk(
  p: SurfaceParams & { color?: [number, number, number]; rotation?: number } = {},
): SurfaceMaterial {
  const color = p.color ?? [0.55, 0.12, 0.2];
  const noise = makeNoise(p.seed ?? 101);
  // Stretched roughness => anisotropic highlight running along the threads.
  const sheenLine = (u: number, v: number) =>
    fbm2(noise, u * 220, v * 8, { octaves: 2 }) * 0.5 + 0.5;
  return makeSurface({
    type: "silk",
    label: "丝绸",
    fields: {
      baseColor: (u, v) => {
        const s = 0.85 + sheenLine(u, v) * 0.3;
        return [clamp(color[0] * s, 0, 1), clamp(color[1] * s, 0, 1), clamp(color[2] * s, 0, 1)];
      },
      metallic: () => 0,
      roughness: (u, v) => clamp(0.18 + sheenLine(u, v) * 0.12, 0.04, 1),
      height: (u, v) => clamp(0.5 + (sheenLine(u, v) - 0.5) * 0.2, 0, 1),
      normalStrength: 0.6,
    },
    // Anisotropy gives the flowing satin highlight; sheen adds the soft cloth edge.
    physical: {
      anisotropy: 0.7,
      anisotropyRotation: p.rotation ?? Math.PI / 2,
      sheen: 0.5,
      sheenColor: [color[0] * 1.6, color[1] * 1.6, color[2] * 1.6],
      sheenRoughness: 0.3,
      specularIntensity: 0.6,
    },
  });
}

/** Metallic flake paint — car paint with sparkle flake normals under clearcoat. */
export function flakePaint(
  p: SurfaceParams & { color?: [number, number, number]; flake?: number } = {},
): SurfaceMaterial {
  const color = p.color ?? [0.5, 0.05, 0.08];
  const flake = clamp(p.flake ?? 1, 0, 2);
  const noise = makeNoise(p.seed ?? 113);
  // High-frequency cellular flakes perturb the height (=> normal) so the clearcoat
  // catches glints at varied angles, the hallmark of metallic flake paint.
  const cells = voronoi({ scale: 140, seed: p.seed ?? 113, metric: "f1" });
  return makeSurface({
    type: "flakePaint",
    label: "金属闪粉漆",
    fields: {
      baseColor: (u, v) => {
        const sparkle = cells(u, v) > 0.82 ? 0.4 * flake : 0;
        return [clamp(color[0] + sparkle, 0, 1), clamp(color[1] + sparkle, 0, 1), clamp(color[2] + sparkle, 0, 1)];
      },
      metallic: () => 0.85,
      roughness: (u, v) => clamp(0.28 + fbm2(noise, u * 240, v * 240, { octaves: 2 }) * 0.06, 0.04, 1),
      height: (u, v) => clamp(0.5 + (cells(u, v) - 0.5) * 0.5 * flake, 0, 1),
      normalStrength: 2.0,
    },
    physical: { clearcoat: 1, clearcoatRoughness: 0.05, specularIntensity: 1 },
  });
}

/** Jade / wax — thick volumetric SSS look via strong attenuation + polished coat. */
export function jade(
  p: SurfaceParams & { color?: [number, number, number]; transmission?: number } = {},
): SurfaceMaterial {
  const color = p.color ?? [0.22, 0.55, 0.36];
  const noise = makeNoise(p.seed ?? 127);
  // Soft internal cloudiness so light pooling inside reads as translucent stone.
  const cloud = (u: number, v: number) => fbm2(noise, u * 5, v * 5, { octaves: 5 }) * 0.5 + 0.5;
  return makeSurface({
    type: "jade",
    label: "玉石",
    fields: {
      baseColor: (u, v) => {
        const c = 0.8 + cloud(u, v) * 0.4;
        return [clamp(color[0] * c, 0, 1), clamp(color[1] * c, 0, 1), clamp(color[2] * c, 0, 1)];
      },
      metallic: () => 0,
      roughness: (u, v) => clamp(0.12 + cloud(u, v) * 0.06, 0.04, 1),
      height: (u, v) => clamp(0.5 + (cloud(u, v) - 0.5) * 0.15, 0, 1),
      normalStrength: 0.4,
    },
    // Thick transmission + short attenuation distance => light absorbed quickly,
    // glowing near thin edges. Clearcoat gives the carved-and-polished sheen.
    physical: {
      transmission: p.transmission ?? 0.6,
      ior: 1.5,
      thickness: 1.5,
      attenuationColor: color,
      attenuationDistance: 0.35,
      clearcoat: 0.6,
      clearcoatRoughness: 0.08,
    },
    transparent: true,
  });
}

/** Wet asphalt / wet ground — dark, near-mirror puddle sheen over a rough base. */
export function wetGround(
  p: SurfaceParams & { color?: [number, number, number]; wetness?: number } = {},
): SurfaceMaterial {
  const color = p.color ?? [0.12, 0.12, 0.13];
  const wet = clamp(p.wetness ?? 0.7, 0, 1);
  const noise = makeNoise(p.seed ?? 131);
  const puddle = (u: number, v: number) => {
    const h = fbm2(noise, u * 4, v * 4, { octaves: 4 }) * 0.5 + 0.5;
    return clamp((0.55 - h) * 4, 0, 1) * wet;
  };
  const grain = (u: number, v: number) => fbm2(noise, u * 60, v * 60, { octaves: 3 }) * 0.5 + 0.5;
  return makeSurface({
    type: "wetGround",
    label: "湿地面",
    fields: {
      baseColor: (u, v) => {
        const wm = puddle(u, v);
        const g = grain(u, v) * 0.08;
        const dry: [number, number, number] = [color[0] + g, color[1] + g, color[2] + g];
        return [clamp(dry[0] * (1 - wm * 0.6), 0, 1), clamp(dry[1] * (1 - wm * 0.6), 0, 1), clamp(dry[2] * (1 - wm * 0.6), 0, 1)];
      },
      metallic: () => 0,
      roughness: (u, v) => clamp(0.9 - puddle(u, v) * 0.82, 0.04, 1),
      height: (u, v) => {
        const wm = puddle(u, v);
        return clamp(0.5 + (grain(u, v) - 0.5) * 0.4 * (1 - wm), 0, 1);
      },
      normalStrength: 2.0,
    },
    physical: { clearcoat: 0, specularIntensity: 1 },
  });
}

/** Snow cover — bright, slightly translucent, sparkle micro-relief. */
export function snow(p: SurfaceParams & { tint?: [number, number, number] } = {}): SurfaceMaterial {
  const tint = p.tint ?? p.color ?? [0.92, 0.94, 0.98];
  const noise = makeNoise(p.seed ?? 137);
  const sparkle = voronoi({ scale: 120, seed: p.seed ?? 137, metric: "f1" });
  const drift = (u: number, v: number) => fbm2(noise, u * 6, v * 6, { octaves: 4 }) * 0.5 + 0.5;
  return makeSurface({
    type: "snow",
    label: "积雪",
    fields: {
      baseColor: (u, v) => {
        const s = sparkle(u, v) > 0.9 ? 0.08 : 0;
        const d = drift(u, v) * 0.05;
        return [clamp(tint[0] - d + s, 0, 1), clamp(tint[1] - d + s, 0, 1), clamp(tint[2] - d + s, 0, 1)];
      },
      metallic: () => 0,
      roughness: (u, v) => clamp(0.55 + drift(u, v) * 0.2 - (sparkle(u, v) > 0.9 ? 0.3 : 0), 0.04, 1),
      height: (u, v) => clamp(0.5 + (drift(u, v) - 0.5) * 0.5, 0, 1),
      normalStrength: 1.6,
    },
    physical: { transmission: 0.12, thickness: 0.3, ior: 1.31, attenuationColor: tint, attenuationDistance: 0.4, specularIntensity: 0.6 },
  });
}

/**
 * Cloud — soft white body with subsurface-like light pooling. Moderate
 * transmission + thick volume + Beer–Lambert bluish attenuation reads as light
 * scattering through vapor; strong sheen gives the fuzzy back-lit rim; fbm
 * mottling breaks up the albedo so it doesn't look like plastic.
 */
export function cloudSurface(p: SurfaceParams & { tint?: [number, number, number] } = {}): SurfaceMaterial {
  const tint = p.tint ?? p.color ?? [0.97, 0.98, 1.0];
  const noise = makeNoise(p.seed ?? 91);
  const puff = (u: number, v: number) => fbm2(noise, u * 7, v * 7, { octaves: 5 }) * 0.5 + 0.5;
  return makeSurface({
    type: "cloud",
    label: "云",
    fields: {
      baseColor: (u, v) => {
        // slightly darker/cooler in the creases (shadowed vapor)
        const d = (puff(u, v) - 0.5) * 0.12;
        return [clamp(tint[0] + d, 0, 1), clamp(tint[1] + d, 0, 1), clamp(tint[2] + d * 0.7, 0, 1)];
      },
      metallic: () => 0,
      roughness: (u, v) => clamp(0.85 + puff(u, v) * 0.1, 0.04, 1),
      height: (u, v) => clamp(0.5 + (puff(u, v) - 0.5) * 0.6, 0, 1),
      normalStrength: 1.1,
    },
    physical: {
      transmission: 0.35,
      thickness: 1.2,
      ior: 1.05,
      attenuationColor: [0.85, 0.9, 1.0],
      attenuationDistance: 0.9,
      sheen: 0.9,
      sheenColor: [1, 1, 1],
      sheenRoughness: 0.8,
      specularIntensity: 0.3,
    },
    transparent: true,
  });
}

/** Sand — granular albedo, wind-ripple normals, faint mineral sparkle. */
export function sand(p: SurfaceParams & { color?: [number, number, number] } = {}): SurfaceMaterial {
  const color = p.color ?? [0.76, 0.62, 0.4];
  const noise = makeNoise(p.seed ?? 139);
  const ripple = (u: number, v: number) => Math.sin((v * 40 + fbm2(noise, u * 8, v * 8, { octaves: 3 }) * 6) * Math.PI) * 0.5 + 0.5;
  const grain = (u: number, v: number) => fbm2(noise, u * 180, v * 180, { octaves: 2 }) * 0.5 + 0.5;
  const sparkle = voronoi({ scale: 200, seed: p.seed ?? 139, metric: "f1" });
  return makeSurface({
    type: "sand",
    label: "沙地",
    fields: {
      baseColor: (u, v) => {
        const g = (grain(u, v) - 0.5) * 0.1;
        const sp = sparkle(u, v) > 0.92 ? 0.12 : 0;
        return [clamp(color[0] + g + sp, 0, 1), clamp(color[1] + g + sp, 0, 1), clamp(color[2] + g + sp * 0.8, 0, 1)];
      },
      metallic: () => 0,
      roughness: (u, v) => clamp(0.78 + grain(u, v) * 0.15 - (sparkle(u, v) > 0.92 ? 0.4 : 0), 0.04, 1),
      height: (u, v) => clamp(0.4 + ripple(u, v) * 0.4 + grain(u, v) * 0.2, 0, 1),
      normalStrength: 2.2,
    },
    physical: { specularIntensity: 0.6 },
  });
}

/** Dry dirt road — compacted dust + fine gravel, low relief so it does not read as rails/stone. */
export function dirtRoad(
  p: SurfaceParams & {
    color?: [number, number, number];
    rutStrength?: number;
    normalStrength?: number;
  } = {},
): SurfaceMaterial {
  const color = p.color ?? [0.5, 0.42, 0.31];
  const rutStrength = clamp(p.rutStrength ?? 0.12, 0, 0.5);
  const noise = makeNoise(p.seed ?? 141);
  const broad = (u: number, v: number) => fbm2(noise, u * 6, v * 2.5, { octaves: 3 }) * 0.5 + 0.5;
  const dust = (u: number, v: number) => fbm2(noise, u * 55, v * 55, { octaves: 2 }) * 0.5 + 0.5;
  const gravel = voronoi({ scale: 90, seed: p.seed ?? 141, metric: "f1" });
  const rut = (u: number) => {
    const left = Math.exp(-Math.pow((u - 0.32) / 0.07, 2));
    const right = Math.exp(-Math.pow((u - 0.68) / 0.07, 2));
    return clamp(Math.max(left, right), 0, 1);
  };
  return makeSurface({
    type: "dirtRoad",
    label: "土路",
    fields: {
      baseColor: (u, v) => {
        const wear = rut(u) * rutStrength;
        const shade = (broad(u, v) - 0.5) * 0.16 + (dust(u, v) - 0.5) * 0.07 - wear * 0.12;
        const pebble = gravel(u, v) > 0.88 ? 0.045 : 0;
        return [
          clamp(color[0] + shade + pebble, 0, 1),
          clamp(color[1] + shade + pebble * 0.85, 0, 1),
          clamp(color[2] + shade * 0.8 + pebble * 0.65, 0, 1),
        ];
      },
      metallic: () => 0,
      roughness: (u, v) => clamp(0.9 + dust(u, v) * 0.08, 0.04, 1),
      height: (u, v) => {
        const pebbles = (dust(u, v) - 0.5) * 0.08 + (gravel(u, v) > 0.9 ? 0.035 : 0);
        return clamp(0.5 + pebbles - rut(u) * rutStrength * 0.08, 0, 1);
      },
      normalStrength: p.normalStrength ?? 0.55,
    },
    physical: { specularIntensity: 0.25 },
  });
}

/** Mossy stone — rock base with moss growing in the cavities (soft sheen patches). */
export function mossyStone(p: SurfaceParams & { moss?: number } = {}): SurfaceMaterial {
  const base = terrainFields({ seed: p.seed ?? 12, scale: 5 });
  const mossAmt = clamp(p.moss ?? 0.6, 0, 1);
  const noise = makeNoise((p.seed ?? 12) + 7);
  const mossColor: [number, number, number] = [0.18, 0.32, 0.12];
  const mossMask = (u: number, v: number) => {
    const h = base.height ? base.height(u, v) : 0.5;
    const patch = fbm2(noise, u * 9, v * 9, { octaves: 4 }) * 0.5 + 0.5;
    return clamp((1 - h) * patch * 1.6, 0, 1) * mossAmt;
  };
  return makeSurface({
    type: "mossyStone",
    label: "苔石",
    fields: {
      baseColor: (u, v) => {
        const m = mossMask(u, v);
        const rock = base.baseColor ? base.baseColor(u, v) : [0.5, 0.48, 0.45];
        const tint = fbm2(noise, u * 30, v * 30, { octaves: 2 }) * 0.1;
        return [
          clamp(rock[0]! * (1 - m) + (mossColor[0] + tint) * m, 0, 1),
          clamp(rock[1]! * (1 - m) + (mossColor[1] + tint) * m, 0, 1),
          clamp(rock[2]! * (1 - m) + (mossColor[2] + tint) * m, 0, 1),
        ];
      },
      metallic: () => 0,
      roughness: (u, v) => clamp(0.9 - mossMask(u, v) * 0.15, 0.04, 1),
      ao: base.ao ?? (() => 1),
      height: (u, v) => {
        const h = base.height ? base.height(u, v) : 0.5;
        return clamp(h + mossMask(u, v) * 0.1, 0, 1);
      },
      normalStrength: base.normalStrength ?? 3,
    },
    physical: { sheen: 0.25 * mossAmt, sheenColor: [0.3, 0.45, 0.2], sheenRoughness: 0.7 },
  });
}

/** Scratched metal — directional micro-scratches break the highlight + clearcoat. */
export function scratchedMetal(
  p: SurfaceParams & { color?: [number, number, number]; density?: number; rotation?: number } = {},
): SurfaceMaterial {
  const color = p.color ?? [0.78, 0.79, 0.82];
  const density = clamp(p.density ?? 1, 0, 2);
  const noise = makeNoise(p.seed ?? 151);
  // Stretched high-freq noise => fine directional scratches in the roughness/normal.
  const scratch = (u: number, v: number) =>
    fbm2(noise, u * 400 * density, v * 12, { octaves: 2 }) * 0.5 + 0.5;
  return makeSurface({
    type: "scratchedMetal",
    label: "划痕金属",
    fields: {
      baseColor: () => color,
      metallic: () => 1,
      roughness: (u, v) => clamp(0.16 + scratch(u, v) * 0.22, 0.04, 1),
      height: (u, v) => clamp(0.5 + (scratch(u, v) - 0.5) * 0.12, 0, 1),
      normalStrength: 0.8,
    },
    physical: { anisotropy: 0.5, anisotropyRotation: p.rotation ?? 0, clearcoat: 0.3, clearcoatRoughness: 0.2 },
  });
}

/** Knit / wool — chunky stitch normal + fuzzy sheen (sweaters, scarves). */
export function knit(p: SurfaceParams & { color?: [number, number, number]; scale?: number } = {}): SurfaceMaterial {
  const color = p.color ?? [0.6, 0.2, 0.24];
  const sc = p.scale ?? 26;
  const noise = makeNoise(p.seed ?? 157);
  // Two interleaved sine lattices approximate a knit purl pattern.
  const stitch = (u: number, v: number) => {
    const a = Math.sin(u * sc * Math.PI + Math.cos(v * sc * 0.5 * Math.PI) * 1.5);
    const b = Math.sin(v * sc * Math.PI);
    return (a * 0.5 + 0.5) * 0.6 + (b * 0.5 + 0.5) * 0.4;
  };
  return makeSurface({
    type: "knit",
    label: "针织",
    fields: {
      baseColor: (u, v) => {
        const f = (fbm2(noise, u * 60, v * 60, { octaves: 2 }) - 0.5) * 0.08;
        const s = 0.85 + stitch(u, v) * 0.25;
        return [clamp(color[0] * s + f, 0, 1), clamp(color[1] * s + f, 0, 1), clamp(color[2] * s + f, 0, 1)];
      },
      metallic: () => 0,
      roughness: () => 0.9,
      height: (u, v) => clamp(stitch(u, v), 0, 1),
      normalStrength: 2.2,
    },
    physical: { sheen: 0.6, sheenColor: [color[0] * 1.5, color[1] * 1.5, color[2] * 1.5], sheenRoughness: 0.5, specularIntensity: 0.3 },
  });
}

/** Bark — deep vertical grooves, rough dielectric (tree trunks, branches). */
export function bark(p: SurfaceParams & { color?: [number, number, number]; scale?: number } = {}): SurfaceMaterial {
  const color = p.color ?? [0.42, 0.29, 0.18];
  const sc = p.scale ?? 8;
  const noise = makeNoise(p.seed ?? 163);
  const cracks = voronoi({ scale: sc, seed: p.seed ?? 163, metric: "f2-f1" });
  // Vertical fibrous grooves + cellular cracks.
  const groove = (u: number, v: number) => fbm2(noise, u * sc * 6, v * sc, { octaves: 4 }) * 0.5 + 0.5;
  return makeSurface({
    type: "bark",
    label: "树皮",
    fields: {
      baseColor: (u, v) => {
        const g = groove(u, v);
        const c = cracks(u, v);
        const shade = 0.75 + g * 0.5 - c * 0.45;
        return [clamp(color[0] * shade, 0, 1), clamp(color[1] * shade, 0, 1), clamp(color[2] * shade, 0, 1)];
      },
      metallic: () => 0,
      roughness: () => 0.92,
      ao: (u, v) => clamp(1 - cracks(u, v) * 0.6, 0, 1),
      height: (u, v) => clamp(groove(u, v) * 0.7 - cracks(u, v) * 0.4 + 0.3, 0, 1),
      normalStrength: 4.5,
    },
    physical: { specularIntensity: 0.4 },
  });
}

/** Neon glow — saturated emissive bar, very high intensity to drive bloom. */
export function neon(p: SurfaceParams & { color?: [number, number, number]; intensity?: number } = {}): SurfaceMaterial {
  const color = p.color ?? [0.1, 0.9, 1.0];
  return makeSurface({
    type: "neon",
    label: "霓虹",
    fields: {
      baseColor: () => [0.02, 0.02, 0.02],
      metallic: () => 0,
      roughness: () => 0.4,
      emission: () => color,
      height: () => 0.5,
    },
    physical: { emissiveIntensity: p.intensity ?? 4.5 },
  });
}

/** Leaf — thin two-sided translucency so back-lit foliage glows green. */
export function leaf(p: SurfaceParams & { color?: [number, number, number] } = {}): SurfaceMaterial {
  const color = p.color ?? [0.22, 0.45, 0.14];
  const noise = makeNoise(p.seed ?? 167);
  // Vein pattern: a midrib + branching ridges darken the albedo.
  const veins = (u: number, v: number) => {
    const mid = Math.exp(-Math.abs(u - 0.5) * 30) * 0.6;
    const branch = Math.abs(Math.sin(v * 14 + (u - 0.5) * 6)) > 0.92 ? 0.3 : 0;
    return clamp(mid + branch, 0, 1);
  };
  return makeSurface({
    type: "leaf",
    label: "叶片",
    fields: {
      baseColor: (u, v) => {
        const ve = veins(u, v);
        const n = (fbm2(noise, u * 30, v * 30, { octaves: 2 }) - 0.5) * 0.08;
        return [clamp(color[0] * (1 - ve * 0.4) + n, 0, 1), clamp(color[1] * (1 - ve * 0.3) + n, 0, 1), clamp(color[2] * (1 - ve * 0.5) + n, 0, 1)];
      },
      metallic: () => 0,
      roughness: () => 0.6,
      height: (u, v) => clamp(0.5 - veins(u, v) * 0.2, 0, 1),
      normalStrength: 1.0,
    },
    // Thin forward scatter gives the back-lit translucency; clearcoat = cuticle sheen.
    physical: { transmission: 0.35, thickness: 0.05, ior: 1.4, attenuationColor: [0.3, 0.6, 0.2], attenuationDistance: 0.2, clearcoat: 0.2, clearcoatRoughness: 0.4, sheen: 0.15, sheenColor: [0.4, 0.6, 0.3] },
    transparent: true,
  });
}

/** Grass blade — soft half-lambert-ish green, faint sheen, slight translucency. */
export function grassBlade(p: SurfaceParams & { color?: [number, number, number] } = {}): SurfaceMaterial {
  const color = p.color ?? [0.28, 0.5, 0.16];
  const noise = makeNoise(p.seed ?? 173);
  return makeSurface({
    type: "grassBlade",
    label: "草叶",
    fields: {
      baseColor: (u, v) => {
        // Darker at the base (v=0), brighter at the tip.
        const tip = clamp(v, 0, 1);
        const n = (fbm2(noise, u * 20, v * 8, { octaves: 2 }) - 0.5) * 0.1;
        const s = 0.7 + tip * 0.5;
        return [clamp(color[0] * s + n, 0, 1), clamp(color[1] * s + n, 0, 1), clamp(color[2] * s + n, 0, 1)];
      },
      metallic: () => 0,
      roughness: () => 0.7,
      height: () => 0.5,
      normalStrength: 0.5,
    },
    physical: { transmission: 0.2, thickness: 0.03, ior: 1.4, attenuationColor: [0.3, 0.55, 0.2], attenuationDistance: 0.3, sheen: 0.2, sheenColor: [0.4, 0.6, 0.3] },
    transparent: true,
  });
}

/**
 * Hair — base color + strand variation. The Marschner-style dual-highlight
 * (primary R + shifted secondary TRT, tinted by absorption) is too lighting-
 * dependent for a baked PBR texture, so the actual BSDF lives in a viewer shader
 * injection (attachHair) keyed on type === "hair". This surface supplies the
 * albedo and a roughness that the strand highlights ride on.
 */
export function hair(
  p: SurfaceParams & { color?: [number, number, number]; variation?: number } = {},
): SurfaceMaterial {
  const color = p.color ?? [0.22, 0.13, 0.07];
  const variation = clamp(p.variation ?? 0.3, 0, 1);
  const noise = makeNoise(p.seed ?? 181);
  // Strand-direction streaks (anisotropy follows v, the hair length axis): vary
  // brightness along u so individual strands read.
  const strand = (u: number, v: number) =>
    fbm2(noise, u * 220, v * 6, { octaves: 2 }) * 0.5 + 0.5;
  return makeSurface({
    type: "hair",
    label: "头发",
    fields: {
      baseColor: (u, v) => {
        const s = 1 - variation * 0.5 + strand(u, v) * variation;
        return [clamp(color[0] * s, 0, 1), clamp(color[1] * s, 0, 1), clamp(color[2] * s, 0, 1)];
      },
      metallic: () => 0,
      roughness: (u, v) => clamp(0.32 + strand(u, v) * 0.18, 0.04, 1),
      height: (u, v) => clamp(strand(u, v), 0, 1),
      normalStrength: 0.6,
    },
    physical: { anisotropy: 0.9, anisotropyRotation: Math.PI / 2, specularIntensity: 0.5 },
  });
}

/* ============================================================= */
/* Stylized / hand-painted surfaces — the Project Skylark look   */
/* (toon cel-shading + baked fake-light + painterly grain), all  */
/* baked into MaterialFields so they render through the standard */
/* MeshPhysicalMaterial path with no shader changes.             */
/* ============================================================= */

type StyleParams = SurfaceParams & StylizedParams;

/** Merge SurfaceParams.color + stylized knobs into a StylizedParams object. */
function styleArgs(p: StyleParams): StylizedParams {
  const out: StylizedParams = {};
  if (p.seed !== undefined) out.seed = p.seed;
  if (p.color !== undefined) out.color = p.color;
  if (p.bands !== undefined) out.bands = p.bands;
  if (p.shadow !== undefined) out.shadow = p.shadow;
  if (p.grain !== undefined) out.grain = p.grain;
  return out;
}

/** Flagship toon flat-color surface (Skylark M_Painter_Vertex). */
export function painterVertexSurface(p: StyleParams = {}): SurfaceMaterial {
  return makeSurface({ type: "painterVertex", label: "手绘卡通", fields: painterVertexFields(styleArgs(p)), physical: {} });
}

/** Toon-mottled plaster wall (Skylark T_Plaster). */
export function stylizedPlasterSurface(p: StyleParams = {}): SurfaceMaterial {
  return makeSurface({ type: "stylizedPlaster", label: "卡通灰泥", fields: plasterFields(styleArgs(p)), physical: {} });
}

/** Rounded stylized roof tiles (Skylark T_Roof). */
export function stylizedRoofSurface(p: StyleParams & { rows?: number } = {}): SurfaceMaterial {
  const args = styleArgs(p) as StylizedParams & { rows?: number };
  if (p.rows !== undefined) args.rows = p.rows;
  return makeSurface({ type: "stylizedRoof", label: "卡通屋顶瓦", fields: roofFields(args), physical: {} });
}

/** Directional hand-painted brush strokes (Skylark T_Brush_Strokes). */
export function brushPaintedSurface(p: StyleParams = {}): SurfaceMaterial {
  return makeSurface({ type: "brushPainted", label: "笔触手绘", fields: brushPaintedFields(styleArgs(p)), physical: {} });
}

/** Toon-banded metal (Skylark M_Metal_Stylized). */
export function stylizedMetalSurface(p: StyleParams = {}): SurfaceMaterial {
  return makeSurface({ type: "stylizedMetal", label: "卡通金属", fields: stylizedMetalFields(styleArgs(p)), physical: {} });
}

/** Toon canopy/bush green (Skylark Blob_Tree / Blob_Bush). */
export function stylizedFoliageSurface(p: StyleParams = {}): SurfaceMaterial {
  return makeSurface({ type: "stylizedFoliage", label: "卡通植被", fields: stylizedFoliageFields(styleArgs(p)), physical: {} });
}


/** Registry of surface-material builders, keyed by type id. */
export const SURFACE_LIBRARY = {
  glass,
  liquid,
  carPaint,
  plastic,
  metal,
  brushedMetal,
  fabric,
  leather,
  emissive,
  iridescent,
  fur: furSurface,
  foliage,
  shortCoat,
  blackCoat,
  wood: woodSurface,
  stone: stoneSurface,
  brick: brickSurface,
  ceramic: ceramicSurface,
  weatheredPlaster: weatheredPlasterSurface,
  terracottaRoof: terracottaRoofSurface,
  romanCobblestone: romanCobblestoneSurface,
  rustyMetal: rustyMetalSurface,
  // AAA additions
  preciousMetal,
  chrome,
  anodizedMetal,
  carbonFiber,
  marble,
  concrete,
  slateRoof,
  skin,
  velvet,
  rubber,
  pearl,
  glossPaint,
  lacqueredWood,
  gem,
  water,
  frostedGlass,
  ice,
  // Phase: shader-free AAA gap-fill
  silk,
  flakePaint,
  jade,
  wetGround,
  snow,
  sand,
  dirtRoad,
  mossyStone,
  // Phase: more material types (scratched metal, knit, bark, neon, foliage)
  scratchedMetal,
  knit,
  bark,
  neon,
  leaf,
  grassBlade,
  hair,
  cloud: cloudSurface,
  // Stylized / hand-painted (Project Skylark toon look)
  painterVertex: painterVertexSurface,
  stylizedPlaster: stylizedPlasterSurface,
  stylizedRoof: stylizedRoofSurface,
  brushPainted: brushPaintedSurface,
  stylizedMetal: stylizedMetalSurface,
  stylizedFoliage: stylizedFoliageSurface,
} as const;

export type SurfaceName = keyof typeof SURFACE_LIBRARY;

/** Build a surface by type name with optional params (used by viewer + scripts). */
export function buildSurface(name: string, params: SurfaceParams = {}): SurfaceMaterial | null {
  const fn = (SURFACE_LIBRARY as Record<string, (p: SurfaceParams) => SurfaceMaterial>)[name];
  return fn ? fn(params) : null;
}

/** Label map for UI, type id -> zh-CN label. */
export const SURFACE_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(SURFACE_LIBRARY).map(([k, fn]) => [k, fn({}).label]),
);

/**
 * Editable parameter schema per surface type, for the viewer's right panel in
 * "follow model" mode. Each entry maps straight to the surface builder's param
 * object; ranges render as sliders, rgb as a color picker, select as a dropdown.
 * Defaults mirror each builder's own defaults so the panel reflects reality.
 * Single source of truth shared by Node + browser.
 */
export interface SurfaceParamSpec {
  key: string;
  label: string;
  type: "range" | "rgb" | "select";
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  optionLabels?: Record<string, string>;
  default: number | [number, number, number] | string;
}

const SEED = (def: number): SurfaceParamSpec => ({
  key: "seed", label: "随机种子", type: "range", min: 0, max: 99, step: 1, default: def,
});
const ROUGH = (def: number): SurfaceParamSpec => ({
  key: "roughness", label: "粗糙度", type: "range", min: 0.02, max: 1, step: 0.01, default: def,
});

export const SURFACE_PARAM_SCHEMA: Record<string, SurfaceParamSpec[]> = {
  glass: [
    { key: "tint", label: "玻璃色", type: "rgb", default: [0.95, 0.97, 0.97] },
    ROUGH(0.02),
    { key: "thickness", label: "厚度", type: "range", min: 0, max: 2, step: 0.05, default: 0.4 },
  ],
  liquid: [
    { key: "tint", label: "液体色", type: "rgb", default: [0.4, 0.04, 0.08] },
    { key: "ior", label: "折射率", type: "range", min: 1, max: 2.4, step: 0.01, default: 1.35 },
    { key: "transmission", label: "透光度", type: "range", min: 0, max: 1, step: 0.02, default: 0.3 },
  ],
  carPaint: [
    { key: "color", label: "漆色", type: "rgb", default: [0.05, 0.12, 0.4] },
    SEED(17),
  ],
  plastic: [
    { key: "color", label: "颜色", type: "rgb", default: [0.8, 0.2, 0.2] },
    ROUGH(0.35),
  ],
  metal: [
    { key: "color", label: "金属色", type: "rgb", default: [0.95, 0.96, 0.97] },
    ROUGH(0.12),
  ],
  brushedMetal: [
    { key: "color", label: "金属色", type: "rgb", default: [0.72, 0.73, 0.75] },
    { key: "rotation", label: "拉丝方向", type: "range", min: 0, max: 3.14, step: 0.05, default: 0 },
    SEED(23),
  ],
  fabric: [
    { key: "color", label: "织物色", type: "rgb", default: [0.45, 0.18, 0.22] },
    SEED(31),
  ],
  foliage: [
    { key: "color", label: "叶片色", type: "rgb", default: [0.16, 0.4, 0.12] },
    { key: "season", label: "季节(青→枯)", type: "range", min: 0, max: 1, step: 0.02, default: 0 },
    { key: "translucency", label: "逆光透光", type: "range", min: 0, max: 1, step: 0.02, default: 0.35 },
    { key: "veinScale", label: "叶脉密度", type: "range", min: 8, max: 60, step: 1, default: 26 },
    SEED(37),
  ],
  leather: [
    { key: "color", label: "皮革色", type: "rgb", default: [0.28, 0.16, 0.1] },
    ROUGH(0.55),
    { key: "grainScale", label: "皮纹密度", type: "range", min: 8, max: 140, step: 1, default: 40 },
    { key: "grainStrength", label: "皮纹强度", type: "range", min: 0, max: 1.5, step: 0.01, default: 1 },
    { key: "normalStrength", label: "法线强度", type: "range", min: 0, max: 3, step: 0.05, default: 2.5 },
    { key: "clearcoat", label: "清漆强度", type: "range", min: 0, max: 0.5, step: 0.01, default: 0.15 },
    SEED(19),
  ],
  emissive: [
    { key: "color", label: "发光色", type: "rgb", default: [1, 0.85, 0.5] },
    { key: "intensity", label: "发光强度", type: "range", min: 0, max: 8, step: 0.1, default: 2.5 },
  ],
  iridescent: [
    { key: "color", label: "底色", type: "rgb", default: [0.6, 0.6, 0.65] },
  ],
  fur: [
    { key: "tint", label: "绒毛颜色", type: "rgb", default: [0.55, 0.36, 0.18] },
    SEED(11),
  ],
  shortCoat: [
    { key: "tint", label: "毛色", type: "rgb", default: [0.08, 0.07, 0.055] },
    ROUGH(0.46),
    { key: "variation", label: "毛色变化", type: "range", min: 0, max: 0.4, step: 0.01, default: 0.08 },
    { key: "normalStrength", label: "短毛法线", type: "range", min: 0, max: 1.2, step: 0.02, default: 0.35 },
    { key: "clearcoat", label: "油亮高光", type: "range", min: 0, max: 0.6, step: 0.01, default: 0.16 },
    SEED(191),
  ],
  blackCoat: [
    { key: "tint", label: "黑毛底色", type: "rgb", default: [0.006, 0.007, 0.01] },
    ROUGH(0.4),
    { key: "variation", label: "毛色变化", type: "range", min: 0, max: 0.3, step: 0.01, default: 0.06 },
    { key: "normalStrength", label: "短毛法线", type: "range", min: 0, max: 1, step: 0.02, default: 0.25 },
    { key: "clearcoat", label: "油亮高光", type: "range", min: 0, max: 0.7, step: 0.01, default: 0.22 },
    SEED(191),
  ],
  wood: [
    { key: "tone", label: "木色", type: "rgb", default: [0.45, 0.28, 0.13] },
    { key: "ringScale", label: "年轮密度", type: "range", min: 4, max: 30, step: 1, default: 14 },
    SEED(9),
  ],
  stone: [
    { key: "scale", label: "纹理频率", type: "range", min: 2, max: 12, step: 0.5, default: 5 },
    SEED(12),
  ],
  brick: [SEED(4)],
  ceramic: [
    { key: "color", label: "釉色", type: "rgb", default: [0.85, 0.82, 0.78] },
    ROUGH(0.15),
    SEED(5),
  ],
  weatheredPlaster: [
    { key: "color", label: "灰泥底色", type: "rgb", default: [0.72, 0.52, 0.34] },
    { key: "wear", label: "风化程度", type: "range", min: 0, max: 1, step: 0.02, default: 0.52 },
    { key: "scale", label: "污渍尺度", type: "range", min: 0.5, max: 12, step: 0.25, default: 4.2 },
    SEED(71),
  ],
  terracottaRoof: [
    { key: "color", label: "陶瓦底色", type: "rgb", default: [0.48, 0.18, 0.09] },
    { key: "columns", label: "横向瓦数", type: "range", min: 3, max: 32, step: 1, default: 12 },
    { key: "rows", label: "纵向瓦数", type: "range", min: 4, max: 48, step: 1, default: 22 },
    { key: "weathering", label: "屋瓦风化", type: "range", min: 0, max: 1, step: 0.02, default: 0.38 },
    SEED(83),
  ],
  romanCobblestone: [
    { key: "color", label: "玄武岩底色", type: "rgb", default: [0.20, 0.19, 0.17] },
    { key: "columns", label: "横向石块", type: "range", min: 4, max: 32, step: 1, default: 13 },
    { key: "rows", label: "纵向石块", type: "range", min: 6, max: 48, step: 1, default: 24 },
    { key: "wetness", label: "路面湿润", type: "range", min: 0, max: 1, step: 0.02, default: 0.08 },
    SEED(97),
  ],
  rustyMetal: [
    { key: "rust", label: "锈蚀程度", type: "range", min: -0.3, max: 0.5, step: 0.02, default: 0.15 },
    { key: "scale", label: "锈斑频率", type: "range", min: 1, max: 12, step: 0.5, default: 4 },
    SEED(7),
  ],
  preciousMetal: [
    { key: "metal", label: "金属种类", type: "select",
      options: ["gold", "silver", "aluminum", "copper", "iron", "chrome", "brass", "titanium", "cobalt", "nickel"],
      default: "gold" },
    ROUGH(0.18),
    { key: "anisotropy", label: "各向异性", type: "range", min: 0, max: 1, step: 0.02, default: 0 },
  ],
  marble: [
    { key: "color", label: "石色", type: "rgb", default: [0.86, 0.85, 0.82] },
    { key: "veinColor", label: "纹脉色", type: "rgb", default: [0.32, 0.3, 0.28] },
    SEED(41),
  ],
  skin: [
    { key: "tone", label: "肤色", type: "rgb", default: [0.82, 0.6, 0.52] },
    SEED(53),
  ],
  velvet: [
    { key: "color", label: "绒色", type: "rgb", default: [0.32, 0.06, 0.12] },
    SEED(61),
  ],
  gem: [
    { key: "tint", label: "宝石色", type: "rgb", default: [0.98, 0.98, 1.0] },
    { key: "roughness", label: "切面粗糙度", type: "range", min: 0, max: 0.45, step: 0.005, default: 0.02 },
    { key: "transmission", label: "透射", type: "range", min: 0, max: 1, step: 0.01, default: 1 },
    { key: "thickness", label: "折射厚度", type: "range", min: 0, max: 3, step: 0.02, default: 0.6 },
    { key: "attenuationDistance", label: "吸收距离", type: "range", min: 0.05, max: 5, step: 0.05, default: 0.8 },
    { key: "ior", label: "折射率", type: "range", min: 1, max: 2.6, step: 0.01, default: 2.4 },
    { key: "dispersion", label: "色散", type: "range", min: 0, max: 8, step: 0.1, default: 4.0 },
  ],
  water: [
    {
      key: "body",
      label: "水体类型",
      type: "select",
      options: ["river", "pond", "ocean"],
      optionLabels: { river: "河流", pond: "池塘", ocean: "海洋" },
      default: "pond",
    },
    { key: "tint", label: "浅水色", type: "rgb", default: [0.12, 0.42, 0.38] },
    { key: "deepColor", label: "深水色", type: "rgb", default: [0.025, 0.14, 0.13] },
    ROUGH(0.09),
    { key: "waveAmplitude", label: "波浪高度", type: "range", min: 0, max: 0.4, step: 0.005, default: 0.006 },
    { key: "waveScale", label: "波浪尺度", type: "range", min: 0.05, max: 4, step: 0.05, default: 1.5 },
    { key: "flowSpeed", label: "流动速度", type: "range", min: 0, max: 2, step: 0.02, default: 0.24 },
    { key: "foamStrength", label: "泡沫强度", type: "range", min: 0, max: 1, step: 0.02, default: 0.12 },
    { key: "shallowWidth", label: "浅滩宽度", type: "range", min: 0.01, max: 0.49, step: 0.005, default: 0.06 },
    { key: "shallowOpacity", label: "浅水透明度", type: "range", min: 0.05, max: 1, step: 0.01, default: 0.36 },
    { key: "deepOpacity", label: "深水不透明度", type: "range", min: 0.05, max: 1, step: 0.01, default: 0.82 },
    SEED(71),
  ],
  frostedGlass: [
    { key: "tint", label: "玻璃色", type: "rgb", default: [0.92, 0.94, 0.96] },
    ROUGH(0.35),
    SEED(77),
  ],
  ice: [
    { key: "tint", label: "冰色", type: "rgb", default: [0.82, 0.9, 0.95] },
    SEED(83),
  ],
  lacqueredWood: [
    { key: "tone", label: "木色", type: "rgb", default: [0.45, 0.28, 0.13] },
    { key: "ringScale", label: "年轮密度", type: "range", min: 4, max: 30, step: 1, default: 14 },
    SEED(9),
  ],
  carbonFiber: [
    { key: "color", label: "底色", type: "rgb", default: [0.02, 0.02, 0.025] },
    SEED(0),
  ],
  rubber: [
    { key: "color", label: "颜色", type: "rgb", default: [0.04, 0.04, 0.045] },
    SEED(91),
  ],
  pearl: [
    { key: "color", label: "珠色", type: "rgb", default: [0.92, 0.9, 0.88] },
  ],
  anodizedMetal: [
    { key: "color", label: "底色", type: "rgb", default: [0.3, 0.3, 0.32] },
  ],
  glossPaint: [
    { key: "color", label: "漆色", type: "rgb", default: [0.8, 0.1, 0.1] },
  ],
  concrete: [
    { key: "color", label: "颜色", type: "rgb", default: [0.55, 0.54, 0.52] },
    SEED(97),
  ],
  slateRoof: [
    { key: "color", label: "瓦色", type: "rgb", default: [0.24, 0.25, 0.22] },
    { key: "rows", label: "瓦片行数", type: "range", min: 4, max: 28, step: 1, default: 14 },
    { key: "columns", label: "每行瓦片", type: "range", min: 3, max: 18, step: 1, default: 8 },
    SEED(63),
  ],
  chrome: [],
  silk: [
    { key: "color", label: "丝色", type: "rgb", default: [0.55, 0.12, 0.2] },
    { key: "rotation", label: "织向", type: "range", min: 0, max: 3.14, step: 0.05, default: 1.57 },
    SEED(101),
  ],
  flakePaint: [
    { key: "color", label: "漆色", type: "rgb", default: [0.5, 0.05, 0.08] },
    { key: "flake", label: "闪粉强度", type: "range", min: 0, max: 2, step: 0.05, default: 1 },
    SEED(113),
  ],
  jade: [
    { key: "color", label: "玉色", type: "rgb", default: [0.22, 0.55, 0.36] },
    { key: "transmission", label: "透光度", type: "range", min: 0, max: 1, step: 0.02, default: 0.6 },
    SEED(127),
  ],
  wetGround: [
    { key: "color", label: "地面色", type: "rgb", default: [0.12, 0.12, 0.13] },
    { key: "wetness", label: "潮湿度", type: "range", min: 0, max: 1, step: 0.02, default: 0.7 },
    SEED(131),
  ],
  snow: [
    { key: "tint", label: "雪色", type: "rgb", default: [0.92, 0.94, 0.98] },
    SEED(137),
  ],
  sand: [
    { key: "color", label: "沙色", type: "rgb", default: [0.76, 0.62, 0.4] },
    SEED(139),
  ],
  dirtRoad: [
    { key: "color", label: "土路色", type: "rgb", default: [0.5, 0.42, 0.31] },
    { key: "rutStrength", label: "车辙强度", type: "range", min: 0, max: 0.5, step: 0.01, default: 0.12 },
    { key: "normalStrength", label: "法线强度", type: "range", min: 0, max: 2, step: 0.05, default: 0.55 },
    SEED(141),
  ],
  mossyStone: [
    { key: "moss", label: "苔藓覆盖", type: "range", min: 0, max: 1, step: 0.02, default: 0.6 },
    SEED(12),
  ],
  scratchedMetal: [
    { key: "color", label: "金属色", type: "rgb", default: [0.78, 0.79, 0.82] },
    { key: "density", label: "划痕密度", type: "range", min: 0, max: 2, step: 0.05, default: 1 },
    { key: "rotation", label: "划痕方向", type: "range", min: 0, max: 3.14, step: 0.05, default: 0 },
    SEED(151),
  ],
  knit: [
    { key: "color", label: "毛线色", type: "rgb", default: [0.6, 0.2, 0.24] },
    { key: "scale", label: "针脚密度", type: "range", min: 10, max: 50, step: 1, default: 26 },
    SEED(157),
  ],
  bark: [
    { key: "color", label: "树皮色", type: "rgb", default: [0.42, 0.29, 0.18] },
    { key: "scale", label: "沟槽密度", type: "range", min: 3, max: 16, step: 0.5, default: 8 },
    SEED(163),
  ],
  neon: [
    { key: "color", label: "霓虹色", type: "rgb", default: [0.1, 0.9, 1.0] },
    { key: "intensity", label: "发光强度", type: "range", min: 1, max: 10, step: 0.2, default: 4.5 },
  ],
  leaf: [
    { key: "color", label: "叶色", type: "rgb", default: [0.22, 0.45, 0.14] },
    SEED(167),
  ],
  grassBlade: [
    { key: "color", label: "草色", type: "rgb", default: [0.28, 0.5, 0.16] },
    SEED(173),
  ],
  hair: [
    { key: "color", label: "发色", type: "rgb", default: [0.22, 0.13, 0.07] },
    { key: "variation", label: "发丝变化", type: "range", min: 0, max: 1, step: 0.02, default: 0.3 },
    SEED(181),
  ],
  // Stylized / hand-painted surfaces
  painterVertex: [
    { key: "color", label: "主色", type: "rgb", default: [0.85, 0.55, 0.25] },
    { key: "bands", label: "明暗阶数", type: "range", min: 1, max: 5, step: 1, default: 3 },
    { key: "shadow", label: "暗部深度", type: "range", min: 0.2, max: 0.9, step: 0.02, default: 0.55 },
    { key: "grain", label: "笔触强度", type: "range", min: 0, max: 0.4, step: 0.02, default: 0.12 },
    SEED(3),
  ],
  stylizedPlaster: [
    { key: "color", label: "墙色", type: "rgb", default: [0.86, 0.82, 0.72] },
    { key: "bands", label: "明暗阶数", type: "range", min: 1, max: 5, step: 1, default: 4 },
    SEED(8),
  ],
  stylizedRoof: [
    { key: "color", label: "瓦色", type: "rgb", default: [0.62, 0.24, 0.18] },
    { key: "rows", label: "瓦片行数", type: "range", min: 4, max: 20, step: 1, default: 10 },
    SEED(6),
  ],
  brushPainted: [
    { key: "color", label: "主色", type: "rgb", default: [0.35, 0.55, 0.45] },
    { key: "bands", label: "明暗阶数", type: "range", min: 1, max: 4, step: 1, default: 2 },
    SEED(12),
  ],
  stylizedMetal: [
    { key: "color", label: "金属色", type: "rgb", default: [0.55, 0.57, 0.62] },
    { key: "bands", label: "明暗阶数", type: "range", min: 1, max: 5, step: 1, default: 3 },
    SEED(5),
  ],
  stylizedFoliage: [
    { key: "color", label: "叶色", type: "rgb", default: [0.28, 0.5, 0.22] },
    { key: "bands", label: "明暗阶数", type: "range", min: 1, max: 5, step: 1, default: 3 },
    SEED(21),
  ],
};

/** Default params object for a surface type, derived from its schema. */
export function defaultSurfaceParams(type: string): Record<string, unknown> {
  const schema = SURFACE_PARAM_SCHEMA[type] ?? [];
  const out: Record<string, unknown> = {};
  for (const s of schema) out[s.key] = Array.isArray(s.default) ? [...s.default] : s.default;
  return out;
}
