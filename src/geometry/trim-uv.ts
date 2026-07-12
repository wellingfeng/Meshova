/**
 * Trim-sheet UV remapping (geometry side). A trim sheet packs many material
 * bands into one atlas (see texture/trim.ts). To make a mesh USE a specific
 * band, its V coordinate must be squeezed into that band's [v0,v1] range while
 * U tiles freely along the strip. These helpers do that remap so one atlas
 * dresses many parts — the memory/draw-call win of trim sheets.
 *
 * Pure: every function returns a new Mesh, never mutates. Deterministic.
 *
 * Typical flow:
 *   1. box/plane a panel, project UVs (planarUV/boxUV) so v spans the height.
 *   2. mapUVToTrimBand(mesh, {v0,v1, uTile}) to land it in the wood-plank strip.
 *   3. surfacePart it against the ONE baked trim atlas.
 */
import { vec2 } from "../math/vec2.js";
import type { Mesh } from "./mesh.js";

export interface TrimBandOptions {
  /** Bottom of the target strip in atlas V (0..1). */
  v0: number;
  /** Top of the target strip in atlas V (0..1). */
  v1: number;
  /** How many times U repeats along the strip. Default 1. */
  uTile?: number;
  /** Shift U before tiling (slide the trim sideways). Default 0. */
  uOffset?: number;
  /**
   * Which existing UV axis drives the band position. "v" (default) uses the
   * mesh's current v; "u" swaps so a horizontal strip reads the mesh u instead.
   */
  from?: "u" | "v";
  /**
   * Normalize the driving axis into [0,1] across the mesh's own UV range before
   * remapping (so a panel whose v runs 0..8 still fills the strip once). Default
   * true.
   */
  normalize?: boolean;
}

/**
 * Squeeze a mesh's UVs into a single trim band. The driving axis (v by default)
 * is mapped from its own [min,max] into [v0,v1]; U is tiled/offset. This is the
 * per-part step that points geometry at its slice of a shared trim atlas.
 */
export function mapUVToTrimBand(m: Mesh, opts: TrimBandOptions): Mesh {
  const uTile = opts.uTile ?? 1;
  const uOffset = opts.uOffset ?? 0;
  const from = opts.from ?? "v";
  const normalize = opts.normalize ?? true;
  if (m.uvs.length === 0) {
    return { positions: m.positions.slice(), normals: m.normals.slice(), uvs: [], indices: m.indices.slice() };
  }

  // Range of the driving axis for normalization.
  let lo = Infinity;
  let hi = -Infinity;
  for (const uv of m.uvs) {
    const d = from === "v" ? uv.y : uv.x;
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  const span = hi - lo;
  const invSpan = normalize && span > 1e-9 ? 1 / span : 1;

  const uvs = m.uvs.map((uv) => {
    const drive = from === "v" ? uv.y : uv.x;
    const cross = from === "v" ? uv.x : uv.y;
    const t = normalize ? (drive - lo) * invSpan : drive; // 0..1 within the strip
    const bandV = opts.v0 + t * (opts.v1 - opts.v0);
    const bandU = cross * uTile + uOffset;
    return vec2(bandU, bandV);
  });
  return {
    positions: m.positions.slice(),
    normals: m.normals.slice(),
    uvs,
    indices: m.indices.slice(),
  };
}
