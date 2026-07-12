/**
 * Trim Sheet system — Meshova's port of the SKYLARK / SideFX Labs
 * "M_Trim_Base" workflow. A trim sheet packs several material bands (wood
 * plank, metal edge, rope, fabric strip, ...) into ONE atlas laid out as
 * horizontal strips along V. Many parts then reuse that single atlas by mapping
 * their UVs into the strip they want — so a whole building's trims share one
 * texture instead of one map per part. This is the classic memory + draw-call
 * win of trim sheets, made procedural (every strip is a MaterialFields recipe,
 * never a baked bitmap).
 *
 * Determinism: strips are pure MaterialFields, baking is a pure function of
 * (sheet, size). Same inputs -> same atlas, every run.
 *
 * Layout: strips stack bottom (v=0) to top (v=1). Each strip owns a [v0,v1]
 * band; an optional gutter leaves neutral rows between bands so mip/bilinear
 * sampling on the GPU doesn't bleed one strip into its neighbour.
 */
import { clamp } from "../math/scalar.js";
import type { MaterialFields, Material } from "./pbr.js";
import { baseColorMap, scalarMap, heightToNormal } from "./pbr.js";
import type { SurfacePhysical } from "./surface.js";

/** One material band to pack into the sheet. */
export interface TrimStrip {
  /** Stable id used to look the strip up + remap UVs into it. */
  name: string;
  /** Per-texel PBR recipe for this band. */
  fields: MaterialFields;
  /** Relative vertical space; normalized across all strips. Default 1. */
  weight?: number;
  /** Optional physical scalars (carried through for surface matching). */
  physical?: SurfacePhysical;
}

/** A resolved strip with its normalized [v0,v1] band in the atlas. */
export interface TrimSlot {
  name: string;
  v0: number;
  v1: number;
  fields: MaterialFields;
  physical?: SurfacePhysical;
}

/** A packed trim sheet: ordered slots plus a name index. */
export interface TrimSheet {
  slots: TrimSlot[];
  byName: Record<string, TrimSlot>;
  /** Gutter fraction left between strips (0..1 of total V). */
  gutter: number;
}

export interface MakeTrimSheetOptions {
  /** Fraction of total V reserved as gutters between strips. Default 0. */
  gutter?: number;
}

/**
 * Pack strips into a sheet, assigning each a normalized [v0,v1] band by weight.
 * Gutters (if any) are split evenly between the strips. The V axis runs bottom
 * (0) to top (1), matching the buffer/UV convention used across the library.
 */
export function makeTrimSheet(
  strips: ReadonlyArray<TrimStrip>,
  opts: MakeTrimSheetOptions = {},
): TrimSheet {
  if (strips.length === 0) throw new Error("makeTrimSheet: no strips");
  const gutter = clamp(opts.gutter ?? 0, 0, 0.5);
  // Total weight across strips; gutters eat (n-1) gaps of `gutterEach`.
  const gaps = Math.max(0, strips.length - 1);
  const gutterEach = gaps > 0 ? (gutter * 1) / gaps : 0;
  const usable = 1 - gutter;
  let totalW = 0;
  for (const s of strips) totalW += Math.max(1e-6, s.weight ?? 1);

  const slots: TrimSlot[] = [];
  const byName: Record<string, TrimSlot> = {};
  let cursor = 0;
  for (let i = 0; i < strips.length; i++) {
    const s = strips[i]!;
    const frac = (Math.max(1e-6, s.weight ?? 1) / totalW) * usable;
    const v0 = cursor;
    const v1 = cursor + frac;
    const slot: TrimSlot = s.physical
      ? { name: s.name, v0, v1, fields: s.fields, physical: s.physical }
      : { name: s.name, v0, v1, fields: s.fields };
    slots.push(slot);
    byName[s.name] = slot;
    cursor = v1 + (i < strips.length - 1 ? gutterEach : 0);
  }
  return { slots, byName, gutter };
}

/**
 * Find which slot a global V coordinate falls into, plus the LOCAL v (0..1)
 * within that strip. Returns null when v lands in a gutter.
 */
function slotAtV(sheet: TrimSheet, v: number): { slot: TrimSlot; localV: number } | null {
  for (const slot of sheet.slots) {
    if (v >= slot.v0 && v <= slot.v1) {
      const span = slot.v1 - slot.v0;
      const localV = span > 1e-9 ? (v - slot.v0) / span : 0;
      return { slot, localV };
    }
  }
  return null;
}

/**
 * Collapse the whole sheet into ONE MaterialFields whose V axis selects the
 * strip. Sampling at global v evaluates the owning strip's recipe at (u,
 * localV). Gutter rows fall back to a neutral grey. This is what makes the
 * packed atlas a single bakeable material.
 */
export function trimSheetFields(sheet: TrimSheet): MaterialFields {
  const neutral: [number, number, number] = [0.5, 0.5, 0.5];
  return {
    baseColor: (u, v) => {
      const hit = slotAtV(sheet, v);
      if (!hit) return neutral;
      return hit.slot.fields.baseColor?.(u, hit.localV) ?? [0.8, 0.8, 0.8];
    },
    metallic: (u, v) => {
      const hit = slotAtV(sheet, v);
      return hit?.slot.fields.metallic?.(u, hit.localV) ?? 0;
    },
    roughness: (u, v) => {
      const hit = slotAtV(sheet, v);
      return hit?.slot.fields.roughness?.(u, hit.localV) ?? 0.6;
    },
    ao: (u, v) => {
      const hit = slotAtV(sheet, v);
      return hit?.slot.fields.ao?.(u, hit.localV) ?? 1;
    },
    height: (u, v) => {
      const hit = slotAtV(sheet, v);
      return hit?.slot.fields.height?.(u, hit.localV) ?? 0.5;
    },
    emission: (u, v) => {
      const hit = slotAtV(sheet, v);
      return hit?.slot.fields.emission?.(u, hit.localV) ?? [0, 0, 0];
    },
    // Use the strongest strip normalStrength so bumps aren't flattened.
    normalStrength: sheet.slots.reduce((m, s) => Math.max(m, s.fields.normalStrength ?? 2), 0),
  };
}

/** Bake the packed sheet to a full PBR Material at `size` (square). */
export function bakeTrimSheet(sheet: TrimSheet, size: number): Material {
  const fields = trimSheetFields(sheet);
  const baseColor = baseColorMap(size, fields.baseColor!);
  const metallic = scalarMap(size, fields.metallic!);
  const roughness = scalarMap(size, fields.roughness!, [0.04, 1]);
  const ao = scalarMap(size, fields.ao!);
  const height = scalarMap(size, fields.height!);
  const emission = baseColorMap(size, fields.emission!);
  const normal = heightToNormal(height, fields.normalStrength ?? 2);
  return { baseColor, metallic, roughness, normal, ao, height, emission };
}

/**
 * Compute the [v0,v1] band for a named strip, for callers that remap mesh UVs
 * into a strip on the geometry side (see geometry/trim-uv.ts). Returns null for
 * an unknown name.
 */
export function trimStripBand(sheet: TrimSheet, name: string): { v0: number; v1: number } | null {
  const slot = sheet.byName[name];
  return slot ? { v0: slot.v0, v1: slot.v1 } : null;
}

/** All strip names in packing order. */
export function trimStripNames(sheet: TrimSheet): string[] {
  return sheet.slots.map((s) => s.name);
}

/* ------------------------------------------------------------------ */
/* Ready-made trim sheets — one atlas that dresses a whole prop set.  */
/* ------------------------------------------------------------------ */

import { wood as woodFields, brickWall as brickFields, rustyMetal as rustyFields } from "./presets.js";

export interface ArchTrimOptions {
  seed?: number;
  gutter?: number;
}

/**
 * A stylized architectural trim sheet in the SKYLARK spirit: one atlas with
 * bands for painted wood plank, a metal edge band, a plaster/stucco band, and a
 * rope/beam accent. Map a part's UVs into the band it needs with
 * mapUVToTrimBand, then bake ONCE and share across the whole building.
 */
export function architecturalTrim(opts: ArchTrimOptions = {}): TrimSheet {
  const seed = opts.seed ?? 3;
  const paintedWood: MaterialFields = {
    ...woodFields({ seed, tone: [0.62, 0.34, 0.2], ringScale: 10 }),
    // slightly desaturated painted look on top of grain
  };
  const plankTrim: MaterialFields = {
    baseColor: (u) => {
      // grooved plank edge: dark seams every ~1/6 U
      const seam = Math.abs((u * 6) % 1 - 0.5) < 0.06 ? 0.4 : 1;
      return [0.5 * seam, 0.36 * seam, 0.24 * seam];
    },
    metallic: () => 0,
    roughness: () => 0.7,
    height: (u) => (Math.abs((u * 6) % 1 - 0.5) < 0.06 ? 0.2 : 0.7),
    normalStrength: 2.5,
  };
  const metalEdge: MaterialFields = {
    ...rustyFields({ seed: seed + 1, rust: -0.1, scale: 6 }),
  };
  const plaster: MaterialFields = {
    ...brickFields({ seed: seed + 2, columns: 1, rows: 1, mortar: 0 }),
    baseColor: () => [0.82, 0.78, 0.7],
    roughness: () => 0.9,
    height: () => 0.5,
    normalStrength: 1.0,
  };
  return makeTrimSheet(
    [
      { name: "wood", fields: paintedWood, weight: 2 },
      { name: "plank", fields: plankTrim, weight: 1.5 },
      { name: "metal", fields: metalEdge, weight: 1, physical: { clearcoat: 0.1 } },
      { name: "plaster", fields: plaster, weight: 2 },
    ],
    { gutter: opts.gutter ?? 0.04 },
  );
}

/* ------------------------------------------------------------------ */
/* Vertex-blend trim (M_Trim_Vertex): one part transitions across      */
/* several strips by per-vertex weights, baked to vertex colors.       */
/* ------------------------------------------------------------------ */

/**
 * Minimal per-vertex context this module needs to evaluate a blend. It is a
 * structural subset of geometry's FieldContext, so a colour field produced here
 * plugs straight into bakeVertexColors without texture importing geometry.
 */
export interface TrimBlendContext {
  index: number;
  uv: { x: number; y: number };
  attributes: Readonly<Record<string, number[]>>;
}

/** A per-vertex weight source: a constant, an attribute name, or a fn. */
export type TrimWeight = number | string | ((ctx: TrimBlendContext) => number);

export interface TrimBlendLayer {
  /** Strip name in the sheet. */
  strip: string;
  /** Per-vertex weight for this strip (0..1 before normalization). */
  weight: TrimWeight;
}

export interface TrimBlendOptions {
  /** Which UV axis samples ACROSS the strip (the tiling axis). Default "x". */
  uFrom?: "u" | "v";
  /** Tiling of the across-strip coordinate. Default 1. */
  uTile?: number;
  /**
   * Local position within each strip band to sample the recipe at (0..1).
   * A constant keeps the whole part on one row of the strip; a fn can vary it.
   * Default 0.5 (strip centre).
   */
  localV?: number | ((ctx: TrimBlendContext) => number);
}

function evalWeight(w: TrimWeight, ctx: TrimBlendContext): number {
  if (typeof w === "number") return w;
  if (typeof w === "string") return ctx.attributes[w]?.[ctx.index] ?? 0;
  return w(ctx);
}

/**
 * Evaluate a strip's baseColor recipe at a local (u, localV).
 */
function stripColorAt(sheet: TrimSheet, strip: string, u: number, localV: number): [number, number, number] {
  const slot = sheet.byName[strip];
  if (!slot) return [0.5, 0.5, 0.5];
  return slot.fields.baseColor?.(u, localV) ?? [0.8, 0.8, 0.8];
}

/**
 * M_Trim_Vertex — build a per-vertex COLOUR FIELD that blends several trim
 * strips by per-vertex weights. Each vertex reads its layers' weights, they are
 * normalized (so they always sum to 1, even if the artist paints loose values),
 * and the strips' baseColor recipes are mixed accordingly. The result is a
 * colour field `(ctx) => [r,g,b]` you pass to bakeVertexColors, so ONE part can
 * transition wood -> plaster -> metal across its surface using the SAME shared
 * trim atlas. Deterministic: pure function of weights + UVs.
 */
export function trimBlendColorField(
  sheet: TrimSheet,
  layers: ReadonlyArray<TrimBlendLayer>,
  opts: TrimBlendOptions = {},
): (ctx: TrimBlendContext) => [number, number, number] {
  if (layers.length === 0) throw new Error("trimBlendColorField: no layers");
  const uFrom = opts.uFrom ?? "u";
  const uTile = opts.uTile ?? 1;
  const localVOpt = opts.localV ?? 0.5;
  return (ctx: TrimBlendContext) => {
    const u = (uFrom === "u" ? ctx.uv.x : ctx.uv.y) * uTile;
    const lv = typeof localVOpt === "function" ? localVOpt(ctx) : localVOpt;
    // normalize weights
    let total = 0;
    const ws: number[] = [];
    for (const layer of layers) {
      const w = Math.max(0, evalWeight(layer.weight, ctx));
      ws.push(w);
      total += w;
    }
    if (total <= 1e-9) {
      // no weight anywhere -> fall back to the first strip
      return stripColorAt(sheet, layers[0]!.strip, u, lv);
    }
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < layers.length; i++) {
      const w = ws[i]! / total;
      if (w <= 0) continue;
      const c = stripColorAt(sheet, layers[i]!.strip, u, lv);
      r += c[0] * w;
      g += c[1] * w;
      b += c[2] * w;
    }
    return [r, g, b];
  };
}
