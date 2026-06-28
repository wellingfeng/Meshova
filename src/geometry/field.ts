/**
 * Attribute + Field system (P16): the architectural piece that gives the
 * script DSL the same expressiveness as a node graph. A Field is "a value
 * evaluated per vertex" — it can be a constant, a position-derived function,
 * a named attribute lookup, or any composition of those. Operators like
 * displace/color/select take Fields instead of constants, so a single call
 * can vary smoothly across the surface.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, scale } from "../math/vec3.js";
import type { Mesh } from "./mesh.js";
import { makeMesh, recomputeNormals } from "./mesh.js";

/** Context passed to a field when evaluated at one vertex. */
export interface FieldContext {
  index: number;
  position: Vec3;
  normal: Vec3;
  uv: { x: number; y: number };
  /** Named per-vertex attributes attached to the mesh. */
  attributes: Readonly<Record<string, number[]>>;
}

/** A scalar field: per-vertex number. */
export type ScalarField = number | ((ctx: FieldContext) => number);
/** A vector field: per-vertex Vec3. */
export type VectorField = Vec3 | ((ctx: FieldContext) => Vec3);

export function evalScalar(field: ScalarField, ctx: FieldContext): number {
  return typeof field === "function" ? field(ctx) : field;
}
export function evalVector(field: VectorField, ctx: FieldContext): Vec3 {
  return typeof field === "function" ? field(ctx) : field;
}

/**
 * A mesh plus named per-vertex attribute arrays. Attributes ride alongside
 * the geometry so later operators can read what earlier ones wrote (the same
 * idea as Houdini/Blender attribute domains, scoped here to the point domain).
 */
export interface AttributedMesh {
  mesh: Mesh;
  attributes: Record<string, number[]>;
}

export function withAttributes(mesh: Mesh, attributes: Record<string, number[]> = {}): AttributedMesh {
  return { mesh, attributes };
}

function ctxFor(am: AttributedMesh, i: number): FieldContext {
  return {
    index: i,
    position: am.mesh.positions[i]!,
    normal: am.mesh.normals[i]!,
    uv: am.mesh.uvs[i]!,
    attributes: am.attributes,
  };
}

/** Write/overwrite a named scalar attribute computed from a field. */
export function storeAttribute(
  am: AttributedMesh,
  name: string,
  field: ScalarField,
): AttributedMesh {
  const values = am.mesh.positions.map((_, i) => evalScalar(field, ctxFor(am, i)));
  return { mesh: am.mesh, attributes: { ...am.attributes, [name]: values } };
}

/** Read a named attribute as a field (for use in later operators). */
export function attribute(name: string): ScalarField {
  return (ctx) => ctx.attributes[name]?.[ctx.index] ?? 0;
}

/** Displace each vertex along a vector field scaled by a scalar field. */
export function displaceField(
  am: AttributedMesh,
  direction: VectorField,
  amount: ScalarField,
): AttributedMesh {
  const positions = am.mesh.positions.map((p, i) => {
    const ctx = ctxFor(am, i);
    const dir = evalVector(direction, ctx);
    const amt = evalScalar(amount, ctx);
    return add(p, scale(dir, amt));
  });
  const mesh = recomputeNormals(
    makeMesh({ positions, normals: [...am.mesh.normals], uvs: [...am.mesh.uvs], indices: [...am.mesh.indices] }),
  );
  return { mesh, attributes: am.attributes };
}

/** Common shorthand: displace along each vertex normal by a scalar field. */
export function displaceAlongNormal(am: AttributedMesh, amount: ScalarField): AttributedMesh {
  return displaceField(am, (ctx) => ctx.normal, amount);
}

/** Build a per-vertex color attribute (stored as r,g,b triplet attributes). */
export function colorField(
  am: AttributedMesh,
  color: (ctx: FieldContext) => Vec3,
): AttributedMesh {
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  am.mesh.positions.forEach((_, i) => {
    const c = color(ctxFor(am, i));
    r.push(c.x); g.push(c.y); b.push(c.z);
  });
  return { mesh: am.mesh, attributes: { ...am.attributes, "color.r": r, "color.g": g, "color.b": b } };
}

/** Select vertices where a scalar field exceeds a threshold (mask attribute). */
export function selectField(
  am: AttributedMesh,
  field: ScalarField,
  threshold = 0.5,
): AttributedMesh {
  const mask = am.mesh.positions.map((_, i) => (evalScalar(field, ctxFor(am, i)) >= threshold ? 1 : 0));
  return { mesh: am.mesh, attributes: { ...am.attributes, mask } };
}

// ---- field combinators (compose without writing closures by hand) ----

export function constant(v: number): ScalarField {
  return v;
}
/** Position component fields. */
export const px: ScalarField = (ctx) => ctx.position.x;
export const py: ScalarField = (ctx) => ctx.position.y;
export const pz: ScalarField = (ctx) => ctx.position.z;

export function addF(a: ScalarField, b: ScalarField): ScalarField {
  return (ctx) => evalScalar(a, ctx) + evalScalar(b, ctx);
}
export function mulF(a: ScalarField, b: ScalarField): ScalarField {
  return (ctx) => evalScalar(a, ctx) * evalScalar(b, ctx);
}
export function clampF(a: ScalarField, lo = 0, hi = 1): ScalarField {
  return (ctx) => Math.max(lo, Math.min(hi, evalScalar(a, ctx)));
}
/** Remap a field from [inLo,inHi] to [outLo,outHi]. */
export function remapF(a: ScalarField, inLo: number, inHi: number, outLo: number, outHi: number): ScalarField {
  return (ctx) => {
    const t = (evalScalar(a, ctx) - inLo) / (inHi - inLo);
    return outLo + t * (outHi - outLo);
  };
}

// ---- object-space material: per-vertex color driven by geometry ----
//
// This is the "material aligned to shape" idea: color is a function of each
// vertex's own 3D position / normal, so it can never be misaligned the way a
// projected 2D bitmap can. Bake it to a per-vertex color array the viewer and
// exporters consume directly (no UV needed).

/** Bake a color field to a flat r,g,b-per-vertex array (length = verts*3). */
export function bakeVertexColors(
  am: AttributedMesh,
  color: (ctx: FieldContext) => Vec3,
): number[] {
  const out: number[] = [];
  am.mesh.positions.forEach((_, i) => {
    const c = color(ctxFor(am, i));
    out.push(c.x, c.y, c.z);
  });
  return out;
}

/** Linear interpolate two colors. */
function mixColor(a: Vec3, b: Vec3, t: number): Vec3 {
  const k = Math.max(0, Math.min(1, t));
  return vec3(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
}

export interface WeatheredOptions {
  /** Base surface color (rock/wood/etc). */
  base?: Vec3;
  /** Color deposited on upward-facing faces (snow/moss). */
  topColor?: Vec3;
  /** normal.y threshold above which top color appears. */
  topThreshold?: number;
  /** Softness of the top transition. */
  topSoftness?: number;
  /** Darkening color for low/recessed areas (dirt in crevices). */
  cavityColor?: Vec3;
  /** Height (position.y) below which cavity darkening ramps in. */
  cavityBelow?: number;
}

/**
 * A geometry-driven "weathering" color field: upward faces get a top color
 * (snow/moss), low areas get a cavity tint (dirt). Returns a color field you
 * pass to bakeVertexColors or colorField. Demonstrates shape-aligned material.
 */
export function weatheredColor(opts: WeatheredOptions = {}): (ctx: FieldContext) => Vec3 {
  const base = opts.base ?? vec3(0.45, 0.42, 0.38);
  const topColor = opts.topColor ?? vec3(0.95, 0.96, 0.98);
  const topThreshold = opts.topThreshold ?? 0.55;
  const topSoftness = opts.topSoftness ?? 0.2;
  const cavityColor = opts.cavityColor ?? vec3(0.18, 0.15, 0.12);
  const cavityBelow = opts.cavityBelow ?? -Infinity;
  return (ctx) => {
    let c = base;
    if (cavityBelow > -Infinity) {
      const d = (cavityBelow - ctx.position.y) / Math.max(1e-3, Math.abs(cavityBelow) + 0.5);
      c = mixColor(c, cavityColor, Math.max(0, Math.min(1, d)));
    }
    // upward-facing -> top color
    const up = (ctx.normal.y - (topThreshold - topSoftness)) / Math.max(1e-3, topSoftness * 2);
    c = mixColor(c, topColor, Math.max(0, Math.min(1, up)));
    return c;
  };
}
