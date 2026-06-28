/**
 * Wavefront OBJ exporter — the geometry core's file output, so meshes built
 * by scripts can be opened in any 3D viewer before the P3 WebGPU screenshot
 * loop exists.
 *
 * OBJ indices are 1-based. We emit positions (v), UVs (vt), normals (vn) and
 * faces as v/vt/vn triples.
 */
import type { Mesh } from "./mesh.js";

function fmt(n: number): string {
  // Trim float noise but keep enough precision for smooth surfaces.
  return Number.isInteger(n) ? n.toString() : n.toFixed(6);
}

/**
 * A reference to a surface material from the texture library: a type id (e.g.
 * "glass", "metal") plus optional params (color/tint/roughness/seed). Kept as a
 * lightweight by-name ref so the geometry module stays decoupled from the
 * texture module — the viewer/exporter resolves it via buildSurface(). This is
 * how a part carries its own matched material instead of relying on a global
 * preset picked separately from the model.
 */
export interface PartSurfaceRef {
  /** Surface library type id (key of SURFACE_LIBRARY). */
  type: string;
  /** Builder params: color, tint, roughness, seed, etc. */
  params?: Record<string, unknown>;
}

/** A named, optionally colored part for multi-material scene export. */
export interface NamedPart {
  name: string;
  mesh: Mesh;
  /** Linear RGB 0..1; written as a diffuse material in the .mtl sidecar. */
  color?: [number, number, number];
  /** Optional per-vertex colors (flat r,g,b triples, length = verts*3). */
  colors?: number[];
  /** Optional matched surface material for this part (glass, metal, ...). */
  surface?: PartSurfaceRef;
  /**
   * Optional per-vertex wind weight (0..1, one per vertex). Drives the viewer's
   * wind shader: 0 = anchored (root/trunk base), 1 = max sway (leaf tips).
   */
  windWeight?: number[];
}

/** Serialize a single mesh to OBJ text. */
export function toOBJ(mesh: Mesh, objectName = "mesh"): string {
  return toOBJScene([{ name: objectName, mesh }]).obj;
}

/**
 * Serialize several named parts into one OBJ plus an MTL sidecar. Each part
 * becomes an OBJ group with its own material so colors survive the round trip.
 */
export function toOBJScene(
  parts: NamedPart[],
  mtlFileName = "model.mtl",
): { obj: string; mtl: string } {
  const objLines: string[] = ["# Meshova OBJ export", `mtllib ${mtlFileName}`];
  const mtlLines: string[] = ["# Meshova MTL export"];

  let vOffset = 0;
  let vtOffset = 0;
  let vnOffset = 0;

  parts.forEach((part, i) => {
    const matName = `${part.name}_mat_${i}`;
    const c = part.color ?? [0.8, 0.8, 0.8];
    mtlLines.push(
      `newmtl ${matName}`,
      `Kd ${fmt(c[0])} ${fmt(c[1])} ${fmt(c[2])}`,
      `Ka 0 0 0`,
      `Ns 32`,
      "",
    );

    const m = part.mesh;
    objLines.push(`g ${part.name}`, `usemtl ${matName}`);
    for (const p of m.positions) objLines.push(`v ${fmt(p.x)} ${fmt(p.y)} ${fmt(p.z)}`);
    for (const uv of m.uvs) objLines.push(`vt ${fmt(uv.x)} ${fmt(uv.y)}`);
    for (const n of m.normals) objLines.push(`vn ${fmt(n.x)} ${fmt(n.y)} ${fmt(n.z)}`);

    for (let k = 0; k < m.indices.length; k += 3) {
      const a = m.indices[k]! + 1;
      const b = m.indices[k + 1]! + 1;
      const cc = m.indices[k + 2]! + 1;
      const av = a + vOffset;
      const bv = b + vOffset;
      const cv = cc + vOffset;
      const at = a + vtOffset;
      const bt = b + vtOffset;
      const ct = cc + vtOffset;
      const an = a + vnOffset;
      const bn = b + vnOffset;
      const cn = cc + vnOffset;
      objLines.push(
        `f ${av}/${at}/${an} ${bv}/${bt}/${bn} ${cv}/${ct}/${cn}`,
      );
    }

    vOffset += m.positions.length;
    vtOffset += m.uvs.length;
    vnOffset += m.normals.length;
  });

  return { obj: objLines.join("\n") + "\n", mtl: mtlLines.join("\n") + "\n" };
}

/* ------------------------------------------------------------------ */
/* Viewer JSON — flat typed arrays the web viewer feeds straight into */
/* three.js BufferGeometry, and that AI screenshot tooling can diff.  */
/* ------------------------------------------------------------------ */

export interface ViewerPart {
  name: string;
  /** Linear RGB 0..1. */
  color: [number, number, number];
  /** Flat xyz triples. */
  positions: number[];
  /** Flat xyz triples, unit length. */
  normals: number[];
  /** Flat uv pairs. */
  uvs: number[];
  /** Triangle index list. */
  indices: number[];
  /** Optional per-vertex colors (flat r,g,b triples) for shape-aligned material. */
  colors?: number[];
  /** Optional matched surface material ref (glass/metal/...), resolved by viewer. */
  surface?: PartSurfaceRef;
  /** Optional per-vertex wind weight (0..1) for the viewer's wind shader. */
  windWeight?: number[];
}

export interface ViewerModel {
  format: "meshova-model@1";
  name: string;
  meta: { parts: number; verts: number; tris: number };
  parts: ViewerPart[];
}

/** Convert named parts into the viewer/screenshot JSON model. */
export function toViewerModel(parts: NamedPart[], name = "model"): ViewerModel {
  let verts = 0;
  let tris = 0;
  const vparts: ViewerPart[] = parts.map((part) => {
    const m = part.mesh;
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    for (const p of m.positions) positions.push(p.x, p.y, p.z);
    for (const n of m.normals) normals.push(n.x, n.y, n.z);
    for (const uv of m.uvs) uvs.push(uv.x, uv.y);
    verts += m.positions.length;
    tris += m.indices.length / 3;
    const vpart: ViewerPart = {
      name: part.name,
      color: part.color ?? [0.8, 0.8, 0.8],
      positions,
      normals,
      uvs,
      indices: m.indices.slice(),
    };
    if (part.colors && part.colors.length === m.positions.length * 3) {
      vpart.colors = part.colors.slice();
    }
    if (part.windWeight && part.windWeight.length === m.positions.length) {
      vpart.windWeight = part.windWeight.slice();
    }
    if (part.surface) {
      vpart.surface = part.surface;
    }
    return vpart;
  });
  return {
    format: "meshova-model@1",
    name,
    meta: { parts: parts.length, verts, tris },
    parts: vparts,
  };
}
