/**
 * Procedural glyph geometry: render short text (road names, plate numbers,
 * exit numbers) as extruded box strokes from a built-in 5x7 dot-matrix font.
 *
 * This keeps signage text fully procedural — no bitmap glyph atlas, no font
 * file — so it obeys the project invariant "textures are computed, never baked
 * bitmaps". The output is a plain Mesh laid out in the XY plane, centered on
 * the origin, facing +Z, that callers place onto sign faces / plates.
 *
 * The font covers A-Z, 0-9, and a handful of punctuation ("-", "/", " ", ".").
 * Unknown characters fall back to a blank cell so layout stays stable.
 */
import { vec3 } from "../math/vec3.js";
import type { Mesh } from "./mesh.js";
import { box } from "./primitives.js";
import { merge } from "./mesh.js";
import { translateMesh } from "./transform.js";

/** Glyph cell is 5 columns x 7 rows. Each string is a row, top-to-bottom. */
const GLYPH_W = 5;
const GLYPH_H = 7;

/**
 * 5x7 dot-matrix font. Each entry is 7 strings of 5 chars ("#"=on, " "=off),
 * top row first. Compact, readable, and enough for road signage.
 */
const FONT: Record<string, string[]> = {
  A: ["  #  ", " # # ", "#   #", "#   #", "#####", "#   #", "#   #"],
  B: ["#### ", "#   #", "#   #", "#### ", "#   #", "#   #", "#### "],
  C: [" ####", "#    ", "#    ", "#    ", "#    ", "#    ", " ####"],
  D: ["#### ", "#   #", "#   #", "#   #", "#   #", "#   #", "#### "],
  E: ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#####"],
  F: ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#    "],
  G: [" ####", "#    ", "#    ", "#  ##", "#   #", "#   #", " ####"],
  H: ["#   #", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
  I: ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "#####"],
  J: ["#####", "   # ", "   # ", "   # ", "   # ", "#  # ", " ##  "],
  K: ["#   #", "#  # ", "# #  ", "##   ", "# #  ", "#  # ", "#   #"],
  L: ["#    ", "#    ", "#    ", "#    ", "#    ", "#    ", "#####"],
  M: ["#   #", "## ##", "# # #", "# # #", "#   #", "#   #", "#   #"],
  N: ["#   #", "##  #", "# # #", "# # #", "#  ##", "#   #", "#   #"],
  O: [" ### ", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
  P: ["#### ", "#   #", "#   #", "#### ", "#    ", "#    ", "#    "],
  Q: [" ### ", "#   #", "#   #", "#   #", "# # #", "#  # ", " ## #"],
  R: ["#### ", "#   #", "#   #", "#### ", "# #  ", "#  # ", "#   #"],
  S: [" ####", "#    ", "#    ", " ### ", "    #", "    #", "#### "],
  T: ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "],
  U: ["#   #", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
  V: ["#   #", "#   #", "#   #", "#   #", "#   #", " # # ", "  #  "],
  W: ["#   #", "#   #", "#   #", "# # #", "# # #", "## ##", "#   #"],
  X: ["#   #", "#   #", " # # ", "  #  ", " # # ", "#   #", "#   #"],
  Y: ["#   #", "#   #", " # # ", "  #  ", "  #  ", "  #  ", "  #  "],
  Z: ["#####", "    #", "   # ", "  #  ", " #   ", "#    ", "#####"],
  "0": [" ### ", "#   #", "#  ##", "# # #", "##  #", "#   #", " ### "],
  "1": ["  #  ", " ##  ", "  #  ", "  #  ", "  #  ", "  #  ", "#####"],
  "2": [" ### ", "#   #", "    #", "   # ", "  #  ", " #   ", "#####"],
  "3": ["#####", "   # ", "  #  ", "   # ", "    #", "#   #", " ### "],
  "4": ["   # ", "  ## ", " # # ", "#  # ", "#####", "   # ", "   # "],
  "5": ["#####", "#    ", "#### ", "    #", "    #", "#   #", " ### "],
  "6": [" ### ", "#    ", "#    ", "#### ", "#   #", "#   #", " ### "],
  "7": ["#####", "    #", "   # ", "  #  ", " #   ", " #   ", " #   "],
  "8": [" ### ", "#   #", "#   #", " ### ", "#   #", "#   #", " ### "],
  "9": [" ### ", "#   #", "#   #", " ####", "    #", "    #", " ### "],
  "-": ["     ", "     ", "     ", "#####", "     ", "     ", "     "],
  "/": ["    #", "    #", "   # ", "  #  ", " #   ", "#    ", "#    "],
  ".": ["     ", "     ", "     ", "     ", "     ", " ##  ", " ##  "],
  " ": ["     ", "     ", "     ", "     ", "     ", "     ", "     "],
};

/** Options for {@link textMesh}. */
export interface TextMeshOptions {
  /** Full height of a glyph cell in world units. Default 1. */
  height?: number;
  /** Stroke extrusion depth (Z thickness). Default height * 0.15. */
  depth?: number;
  /** Gap between glyphs as a fraction of glyph width. Default 0.25. */
  tracking?: number;
  /** Dot fill ratio (0..1); <1 leaves seams between dots. Default 0.98. */
  fill?: number;
}

/** Which characters this font can render (uppercased). */
export function glyphSupported(ch: string): boolean {
  return Object.prototype.hasOwnProperty.call(FONT, ch.toUpperCase());
}

/**
 * Build a single glyph as merged dot-boxes, laid out with the cell's
 * bottom-left at the origin (grows +X, +Y). Cell width = GLYPH_W*dot,
 * height = GLYPH_H*dot. Returns an empty mesh for a blank/space cell.
 */
function glyphMesh(ch: string, dot: number, depth: number, fill: number): Mesh {
  const rows = FONT[ch.toUpperCase()];
  if (!rows) return merge();
  const boxes: Mesh[] = [];
  const s = dot * fill;
  for (let r = 0; r < GLYPH_H; r++) {
    const row = rows[r] ?? "";
    for (let c = 0; c < GLYPH_W; c++) {
      if (row[c] !== "#") continue;
      // Row 0 is the top of the glyph -> highest Y.
      const cx = (c + 0.5) * dot;
      const cy = (GLYPH_H - 1 - r + 0.5) * dot;
      boxes.push(translateMesh(box(s, s, depth), vec3(cx, cy, 0)));
    }
  }
  return boxes.length ? merge(...boxes) : merge();
}

/**
 * Render a text string as extruded stroke geometry, centered on the origin in
 * the XY plane, facing +Z. Height controls the glyph cell height; width scales
 * with the character count. Great for road-name plates, exit numbers, plates.
 */
export function textMesh(text: string, opts: TextMeshOptions = {}): Mesh {
  const height = opts.height ?? 1;
  const dot = height / GLYPH_H;
  const depth = opts.depth ?? height * 0.15;
  const tracking = opts.tracking ?? 0.25;
  const fill = opts.fill ?? 0.98;

  const cellW = GLYPH_W * dot;
  const advance = cellW + tracking * cellW;

  const chars = [...text];
  const glyphs: Mesh[] = [];
  let x = 0;
  for (const ch of chars) {
    const g = glyphMesh(ch, dot, depth, fill);
    if (g.positions.length > 0) glyphs.push(translateMesh(g, vec3(x, 0, 0)));
    x += advance;
  }
  // Total advanced width includes a trailing gap; the visible run is x - gap.
  const runW = chars.length > 0 ? x - (advance - cellW) : 0;
  const runH = GLYPH_H * dot;
  // Recenter on origin.
  const merged = glyphs.length ? merge(...glyphs) : merge();
  return translateMesh(merged, vec3(-runW / 2, -runH / 2, 0));
}

/** Measured width of a rendered text run (world units), for layout/fitting. */
export function textMeshWidth(text: string, opts: TextMeshOptions = {}): number {
  const height = opts.height ?? 1;
  const dot = height / GLYPH_H;
  const tracking = opts.tracking ?? 0.25;
  const cellW = GLYPH_W * dot;
  const advance = cellW + tracking * cellW;
  const n = [...text].length;
  return n > 0 ? n * advance - (advance - cellW) : 0;
}
