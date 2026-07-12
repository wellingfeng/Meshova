/**
 * Stylized / hand-painted material presets — a procedural reconstruction of the
 * UE "Project Skylark" stylized-base look (M_Painter_*, M_Trim_*, T_Plaster,
 * T_Roof, T_Brush_Strokes). Skylark bakes the light INTO the material with four
 * tricks; we rebuild each as a pure texture-field recipe so it still bakes to
 * PNGs / DataTextures and needs zero renderer changes:
 *
 *   1. cel quantization  — `celStep` snaps a continuous 0..1 signal into N flat
 *      bands, the hard shading steps that define a toon look.
 *   2. baked fake-light   — Skylark does `dot(vertexNormal, lightDir)`; a flat
 *      texture has no world normal, so we approximate the shading break with a
 *      low-frequency height/curvature field, cel-step it, and lerp lit->shadow
 *      tint into baseColor. Reads as hand-painted ambient occlusion + toon light.
 *   3. painterly grain    — brush-stroke + plaster + roof noise rebuilt from
 *      fbm / voronoi / stripes, replacing the T_* tileables.
 *   4. tint-driven recolor — every recipe takes a `color`, so one recipe paints
 *      a whole palette (the MI_Painter_Vertex_* colorway family).
 *
 * These return MaterialFields (bake at any resolution) and register into the
 * shared PRESETS-style flow via surface.ts.
 */
import { makeNoise, fbm2 } from "../random/noise.js";
import { voronoi, ramp, blendColor, blend } from "./patterns.js";
import { stripes } from "./patterns3.js";
import { clamp } from "../math/scalar.js";
import type { MaterialFields } from "./pbr.js";

/* ------------------------------------------------------------------ */
/* Core stylized primitives                                            */
/* ------------------------------------------------------------------ */

/**
 * Cel/toon quantization: snap a 0..1 signal into `steps` flat bands with a soft
 * `edge` transition so the boundary isn't aliased. steps=1 => on/off, higher =>
 * more gradient retained. This is the single operator that turns any smooth
 * field into stepped toon shading.
 */
export function celStep(t: number, steps = 3, edge = 0.03): number {
  const s = Math.max(1, Math.floor(steps));
  const scaled = clamp(t, 0, 1) * s;
  const band = Math.floor(scaled);
  const frac = scaled - band;
  // soft edge only near the top of each band, else hold the flat level
  const soft = edge > 0 ? clamp((frac - (1 - edge)) / edge, 0, 1) : 0;
  return clamp((band + soft) / s, 0, 1);
}

/** Darken/lighten an rgb tint by a scalar factor, clamped. */
export function shadeColor(
  c: [number, number, number],
  factor: number,
): [number, number, number] {
  return [clamp(c[0] * factor, 0, 1), clamp(c[1] * factor, 0, 1), clamp(c[2] * factor, 0, 1)];
}

export interface StylizedParams {
  seed?: number;
  /** Base tint (linear rgb) — drives the whole colorway. */
  color?: [number, number, number];
  /** Number of toon shading bands (1..5). */
  bands?: number;
  /** How dark the baked shadow band goes (0..1, lower = deeper). */
  shadow?: number;
  /** Painterly grain strength 0..1. */
  grain?: number;
}

/* ------------------------------------------------------------------ */
/* Recipe 1 — Painter Vertex: the flagship toon-shaded flat color.     */
/* Skylark's M_Painter_Vertex: a solid tint with baked cel light +     */
/* subtle hand-painted brush grain. This is the colorway workhorse.    */
/* ------------------------------------------------------------------ */
export function painterVertex(p: StylizedParams = {}): MaterialFields {
  const seed = p.seed ?? 3;
  const color = p.color ?? [0.85, 0.55, 0.25];
  const bands = p.bands ?? 3;
  const shadow = p.shadow ?? 0.55;
  const grainAmt = p.grain ?? 0.12;
  const noise = makeNoise(seed);
  // low-freq "form" field stands in for surface curvature => the toon light break
  const form = (u: number, v: number) => fbm2(noise, u * 2.2, v * 2.2, { octaves: 3 }) * 0.5 + 0.5;
  // fine directional brush strokes
  const brush = (u: number, v: number) =>
    fbm2(noise, u * 40, v * 9, { octaves: 3 }) * 0.5 + 0.5;
  return {
    baseColor: (u, v) => {
      const lit = celStep(form(u, v), bands, 0.04); // stepped light 0..1
      const shade = shadow + (1 - shadow) * lit; // shadow tint .. full color
      const b = 1 + (brush(u, v) - 0.5) * grainAmt; // painterly value wobble
      return shadeColor(color, shade * b);
    },
    metallic: () => 0,
    roughness: (u, v) => clamp(0.72 + (brush(u, v) - 0.5) * 0.15, 0.04, 1),
    ao: (u, v) => clamp(0.6 + celStep(form(u, v), bands) * 0.4, 0, 1),
    height: (u, v) => clamp(form(u, v) * 0.6 + brush(u, v) * 0.15, 0, 1),
    normalStrength: 1.2,
  };
}

/* ------------------------------------------------------------------ */
/* Recipe 2 — Plaster: T_Plaster tileable. Soft blotchy wall with      */
/* toon-stepped mottling; the stylized-building basement look.         */
/* ------------------------------------------------------------------ */
export function stylizedPlaster(p: StylizedParams = {}): MaterialFields {
  const seed = p.seed ?? 8;
  const color = p.color ?? [0.86, 0.82, 0.72];
  const bands = p.bands ?? 4;
  const noise = makeNoise(seed);
  const blotch = (u: number, v: number) => fbm2(noise, u * 5, v * 5, { octaves: 4 }) * 0.5 + 0.5;
  const fine = (u: number, v: number) => fbm2(noise, u * 60, v * 60, { octaves: 2 }) * 0.5 + 0.5;
  const pits = voronoi({ scale: 22, seed: seed + 1, metric: "f1" });
  return {
    baseColor: (u, v) => {
      const m = celStep(blotch(u, v), bands, 0.05);
      const shade = 0.82 + m * 0.22;
      return shadeColor(color, shade - pits(u, v) * 0.08);
    },
    metallic: () => 0,
    roughness: (u, v) => clamp(0.85 + fine(u, v) * 0.1, 0.04, 1),
    ao: (u, v) => clamp(0.85 - pits(u, v) * 0.25, 0, 1),
    height: (u, v) => clamp(0.5 + (blotch(u, v) - 0.5) * 0.3 - pits(u, v) * 0.3, 0, 1),
    normalStrength: 2,
  };
}

/* ------------------------------------------------------------------ */
/* Recipe 3 — Roof tiles: T_Roof. Rows of stylized curved tiles with   */
/* baked cel light per row and stroke-painted color variation.         */
/* ------------------------------------------------------------------ */
export function stylizedRoof(p: StylizedParams & { rows?: number } = {}): MaterialFields {
  const seed = p.seed ?? 6;
  const color = p.color ?? [0.62, 0.24, 0.18];
  const rows = p.rows ?? 10;
  const noise = makeNoise(seed);
  // repeating rounded tile rows along v; offset every other row along u
  const tileShade = (u: number, v: number) => {
    const row = Math.floor(v * rows);
    const off = (row % 2) * 0.5;
    const fx = (u * rows * 0.5 + off) % 1; // position across a tile
    const fy = (v * rows) % 1; // position down a tile
    // rounded bump: bright center, dark seam
    const bump = Math.sin(fx * Math.PI) * Math.sin(fy * Math.PI);
    return clamp(bump, 0, 1);
  };
  const vary = (u: number, v: number) => fbm2(noise, u * 8, v * 8, { octaves: 3 }) * 0.5 + 0.5;
  return {
    baseColor: (u, v) => {
      const lit = celStep(tileShade(u, v), 3, 0.06);
      const shade = 0.5 + lit * 0.5;
      const tint = blendColor(color, shadeColor(color, 1.25), vary(u, v));
      return shadeColor(tint, shade);
    },
    metallic: () => 0,
    roughness: () => 0.8,
    ao: (u, v) => clamp(0.5 + tileShade(u, v) * 0.5, 0, 1),
    height: (u, v) => clamp(tileShade(u, v) * 0.8 + 0.1, 0, 1),
    normalStrength: 3.5,
  };
}

/* ------------------------------------------------------------------ */
/* Recipe 4 — Brush-stroke overlay color: T_Brush_Strokes. Directional */
/* hand-painted streaks; a flat toon color with visible strokes.       */
/* ------------------------------------------------------------------ */
export function brushPainted(p: StylizedParams = {}): MaterialFields {
  const seed = p.seed ?? 12;
  const color = p.color ?? [0.35, 0.55, 0.45];
  const bands = p.bands ?? 2;
  const noise = makeNoise(seed);
  const strokeMask = stripes({ count: 14, angle: 0.5, softness: 0.3 });
  const streak = (u: number, v: number) => fbm2(noise, u * 30, v * 6, { octaves: 3 }) * 0.5 + 0.5;
  const form = (u: number, v: number) => fbm2(noise, u * 2, v * 2, { octaves: 2 }) * 0.5 + 0.5;
  return {
    baseColor: (u, v) => {
      const lit = celStep(form(u, v), bands, 0.05);
      const s = strokeMask(u, v);
      const streakShade = 0.85 + streak(u, v) * 0.3;
      return shadeColor(color, (0.6 + lit * 0.4) * streakShade * (0.9 + s * 0.15));
    },
    metallic: () => 0,
    roughness: (u, v) => clamp(0.7 + streak(u, v) * 0.15, 0.04, 1),
    ao: () => 0.95,
    height: (u, v) => clamp(streak(u, v) * 0.5 + strokeMask(u, v) * 0.3, 0, 1),
    normalStrength: 1.5,
  };
}

/* ------------------------------------------------------------------ */
/* Recipe 5 — Stylized metal: M_Metal_Stylized. Toon-banded metal with */
/* a crisp lit/shadow break, the SideFX stylized-prop metal.           */
/* ------------------------------------------------------------------ */
export function stylizedMetal(p: StylizedParams = {}): MaterialFields {
  const seed = p.seed ?? 5;
  const color = p.color ?? [0.55, 0.57, 0.62];
  const bands = p.bands ?? 3;
  const noise = makeNoise(seed);
  const form = (u: number, v: number) => fbm2(noise, u * 3, v * 3, { octaves: 2 }) * 0.5 + 0.5;
  const scratch = (u: number, v: number) => fbm2(noise, u * 80, v * 12, { octaves: 2 }) * 0.5 + 0.5;
  return {
    baseColor: (u, v) => {
      const lit = celStep(form(u, v), bands, 0.02);
      return shadeColor(color, 0.55 + lit * 0.55);
    },
    metallic: () => 1,
    roughness: (u, v) => clamp(0.25 + celStep(form(u, v), bands) * 0.2 + scratch(u, v) * 0.08, 0.04, 1),
    ao: () => 1,
    height: (u, v) => clamp(form(u, v) * 0.6 + scratch(u, v) * 0.2, 0, 1),
    normalStrength: 1,
  };
}

/* ------------------------------------------------------------------ */
/* Recipe 6 — Stylized foliage/canopy: blob-tree / bush toon green.    */
/* Clumped cel-lit green, the Blob_Tree / Blob_Bush look.              */
/* ------------------------------------------------------------------ */
export function stylizedFoliage(p: StylizedParams = {}): MaterialFields {
  const seed = p.seed ?? 21;
  const color = p.color ?? [0.28, 0.5, 0.22];
  const bands = p.bands ?? 3;
  const noise = makeNoise(seed);
  const clump = (u: number, v: number) => fbm2(noise, u * 6, v * 6, { octaves: 4 }) * 0.5 + 0.5;
  const leaf = voronoi({ scale: 30, seed, metric: "f1" });
  const highlight = ramp([
    { at: 0.0, color: [0.16, 0.32, 0.12] },
    { at: 0.6, color: color },
    { at: 1.0, color: [0.55, 0.72, 0.3] },
  ]);
  return {
    baseColor: (u, v) => {
      const lit = celStep(clump(u, v), bands, 0.05);
      const c = highlight(lit);
      return blendColor(c, shadeColor(c, 0.8), leaf(u, v) * 0.4);
    },
    metallic: () => 0,
    roughness: () => 0.85,
    ao: (u, v) => clamp(0.6 + celStep(clump(u, v), bands) * 0.4, 0, 1),
    height: (u, v) => clamp(clump(u, v) * 0.7 + (1 - leaf(u, v)) * 0.3, 0, 1),
    normalStrength: 2.5,
  };
}

/** All stylized field recipes, keyed by id (used by surface.ts wrappers). */
export const STYLIZED_RECIPES = {
  painterVertex,
  stylizedPlaster,
  stylizedRoof,
  brushPainted,
  stylizedMetal,
  stylizedFoliage,
} as const;

export type StylizedRecipeName = keyof typeof STYLIZED_RECIPES;


