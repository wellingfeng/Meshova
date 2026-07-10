/**
 * WFC — a deterministic tiled Wave-Function-Collapse solver, Meshova's port of
 * the constraint-driven layout CitySample uses for its WFC_Rooftop kit. The
 * roof is a grid; each cell must hold one tile; tiles carry per-edge socket ids;
 * two tiles may sit side-by-side only when their touching edges share a socket.
 * The solver collapses the lowest-entropy cell, propagates the constraint to its
 * neighbours, and repeats until every cell is decided (or a contradiction forces
 * a deterministic restart with a bumped seed).
 *
 * This is the classic "simple tiled model": no bitmap sampling, no learned
 * adjacency — the adjacency is authored as socket ids, which is exactly how a
 * modular art kit is built. Same seed + same tileset -> same grid, every run;
 * that is the hard determinism invariant the screenshot loop depends on.
 *
 * The output is a `WfcGrid`: a `cols x rows` array of chosen tile ids plus each
 * cell's rotation (0..3 quarter turns). A model builder (`wfc-rooftop.ts`) turns
 * that into geometry by stamping one mesh per cell. The solver knows nothing
 * about meshes — it is pure combinatorics over sockets.
 */
import { makeRng, type Rng } from "../random/prng.js";

/** The four edge directions of a square tile, in CCW order from +X. */
export const DIRS = ["px", "pz", "nx", "nz"] as const;
export type Dir = (typeof DIRS)[number];

/** Index of the opposite direction (px<->nx, pz<->nz). */
const OPPOSITE: Record<Dir, Dir> = { px: "nx", nx: "px", pz: "nz", nz: "pz" };

/** Neighbour offset (dc,dr) for each direction on a col/row grid (row +z). */
const OFFSET: Record<Dir, [number, number]> = {
  px: [1, 0],
  nx: [-1, 0],
  pz: [0, 1],
  nz: [0, -1],
};

/**
 * A tile prototype: an id, four edge sockets (one per Dir), an optional weight
 * (higher = picked more often), and whether the solver may auto-generate its
 * three rotations. Sockets are compared by string equality after rotation.
 */
export interface WfcTile {
  id: string;
  /** Edge sockets keyed by direction (before rotation). */
  sockets: Record<Dir, string>;
  /** Relative selection weight (default 1). */
  weight?: number;
  /** If true, the solver adds the 90/180/270 rotations as extra prototypes. */
  rotatable?: boolean;
}

/** A concrete (possibly rotated) prototype the solver actually places. */
export interface WfcProto {
  /** Source tile id. */
  tile: string;
  /** Quarter turns applied (0..3). */
  rotation: number;
  /** Rotated sockets. */
  sockets: Record<Dir, string>;
  weight: number;
}

/** A solved cell: which prototype landed here. */
export interface WfcCell {
  tile: string;
  rotation: number;
}

/** A solved grid, row-major (index = r * cols + c). */
export interface WfcGrid {
  cols: number;
  rows: number;
  cells: WfcCell[];
}

export interface WfcOptions {
  cols: number;
  rows: number;
  tiles: WfcTile[];
  seed: number;
  /** Max collapse restarts on contradiction before throwing (default 12). */
  maxRestarts?: number;
  /** Force specific cells to a tile id before solving (row-major key "c,r"). */
  fixed?: Record<string, string>;
  /**
   * Socket that every grid-boundary edge must expose (and that interior edges
   * are forbidden to expose). On a finite grid this pins parapets to the true
   * perimeter: e.g. "O" means the outward edge of a border cell must be open,
   * while a cell facing another cell may never be open. Without it, two open
   * edges can wrongly satisfy each other in the grid interior.
   */
  boundarySocket?: string;
}

/** Rotate a socket map by `turns` quarter turns CCW. */
function rotateSockets(s: Record<Dir, string>, turns: number): Record<Dir, string> {
  // CCW: px<-nz? We map by shifting direction indices. DIRS = [px,pz,nx,nz].
  const t = ((turns % 4) + 4) % 4;
  const out = { ...s };
  for (let i = 0; i < DIRS.length; i++) {
    const from = DIRS[(i + t) % 4]!;
    const to = DIRS[i]!;
    out[to] = s[from];
  }
  return out;
}

/** Expand tiles into concrete prototypes (adding rotations where requested). */
export function expandProtos(tiles: WfcTile[]): WfcProto[] {
  const protos: WfcProto[] = [];
  for (const t of tiles) {
    const weight = t.weight ?? 1;
    const turns = t.rotatable ? [0, 1, 2, 3] : [0];
    const seen = new Set<string>();
    for (const r of turns) {
      const sockets = rotateSockets(t.sockets, r);
      // Deduplicate rotationally-symmetric tiles (same socket signature).
      const sig = `${sockets.px}|${sockets.pz}|${sockets.nx}|${sockets.nz}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      protos.push({ tile: t.id, rotation: r, sockets, weight });
    }
  }
  return protos;
}

/** True if proto A's edge in direction `dir` may touch proto B on that side. */
function compatible(a: WfcProto, b: WfcProto, dir: Dir): boolean {
  return a.sockets[dir] === b.sockets[OPPOSITE[dir]];
}

/**
 * Precompute, for every proto index and direction, the set of proto indices
 * allowed on that side. This is the adjacency table the propagator uses.
 */
function buildAdjacency(protos: WfcProto[]): Record<Dir, number[][]> {
  const adj: Record<Dir, number[][]> = { px: [], pz: [], nx: [], nz: [] };
  for (const d of DIRS) {
    for (let i = 0; i < protos.length; i++) {
      const allowed: number[] = [];
      for (let j = 0; j < protos.length; j++) {
        if (compatible(protos[i]!, protos[j]!, d)) allowed.push(j);
      }
      adj[d][i] = allowed;
    }
  }
  return adj;
}

/** Shannon-style entropy proxy: number of remaining options (fewest = collapse first). */
function cellOptionCount(mask: Uint8Array, base: number, n: number): number {
  let c = 0;
  for (let k = 0; k < n; k++) if (mask[base + k]) c++;
  return c;
}

/** Weighted random pick among the still-allowed protos in a cell. */
function pickWeighted(mask: Uint8Array, base: number, protos: WfcProto[], rng: Rng): number {
  let total = 0;
  for (let k = 0; k < protos.length; k++) if (mask[base + k]) total += protos[k]!.weight;
  let r = rng.next() * total;
  for (let k = 0; k < protos.length; k++) {
    if (!mask[base + k]) continue;
    r -= protos[k]!.weight;
    if (r <= 0) return k;
  }
  // Fallback (float drift): last allowed.
  for (let k = protos.length - 1; k >= 0; k--) if (mask[base + k]) return k;
  return -1;
}

/**
 * Solve one WFC attempt. Returns the grid, or null on contradiction (so the
 * caller can restart with a bumped seed for determinism).
 */
function solveOnce(
  cols: number,
  rows: number,
  protos: WfcProto[],
  adj: Record<Dir, number[][]>,
  rng: Rng,
  fixed?: Record<string, string>,
  boundarySocket?: string,
): WfcGrid | null {
  const n = protos.length;
  const cellCount = cols * rows;
  // mask[cell*n + k] = 1 if proto k still allowed in that cell.
  const mask = new Uint8Array(cellCount * n).fill(1);

  const idx = (c: number, r: number) => r * cols + c;

  // Apply fixed constraints: restrict a cell to protos of a given tile id.
  if (fixed) {
    for (const [key, tileId] of Object.entries(fixed)) {
      const [c, r] = key.split(",").map(Number) as [number, number];
      if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
      const base = idx(c, r) * n;
      for (let k = 0; k < n; k++) if (protos[k]!.tile !== tileId) mask[base + k] = 0;
    }
  }

  // Boundary socket: an edge facing outside the grid must equal boundarySocket;
  // an edge facing another cell must NOT be boundarySocket. This pins the border.
  if (boundarySocket !== undefined) {
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const base = idx(c, r) * n;
        for (const d of DIRS) {
          const [dc, dr] = OFFSET[d];
          const outside = c + dc < 0 || c + dc >= cols || r + dr < 0 || r + dr >= rows;
          for (let k = 0; k < n; k++) {
            if (!mask[base + k]) continue;
            const isB = protos[k]!.sockets[d] === boundarySocket;
            // Outward edge must be boundary; inward edge must not be.
            if (outside ? !isB : isB) mask[base + k] = 0;
          }
        }
      }
    }
  }

  // Propagate a cell's constraints outward (queue of cells whose mask shrank).
  const propagate = (start: number): boolean => {
    const stack = [start];
    while (stack.length) {
      const cell = stack.pop()!;
      const c = cell % cols;
      const r = (cell - c) / cols;
      const base = cell * n;
      for (const d of DIRS) {
        const [dc, dr] = OFFSET[d];
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
        const nCell = idx(nc, nr);
        const nBase = nCell * n;
        // Union of protos allowed by every still-possible proto in `cell`.
        const allowed = new Uint8Array(n);
        for (let k = 0; k < n; k++) {
          if (!mask[base + k]) continue;
          for (const a of adj[d][k]!) allowed[a] = 1;
        }
        let changed = false;
        let any = false;
        for (let k = 0; k < n; k++) {
          if (mask[nBase + k] && !allowed[k]) { mask[nBase + k] = 0; changed = true; }
          if (mask[nBase + k]) any = true;
        }
        if (!any) return false; // contradiction
        if (changed) stack.push(nCell);
      }
    }
    return true;
  };

  // Propagate initial fixed constraints.
  for (let cell = 0; cell < cellCount; cell++) {
    if (!propagate(cell)) return null;
  }

  // Collapse loop.
  for (;;) {
    // Find min-entropy undecided cell.
    let best = -1, bestCount = Infinity;
    for (let cell = 0; cell < cellCount; cell++) {
      const cnt = cellOptionCount(mask, cell * n, n);
      if (cnt === 0) return null;
      if (cnt > 1 && cnt < bestCount) { bestCount = cnt; best = cell; }
    }
    if (best === -1) break; // all cells decided
    const base = best * n;
    const chosen = pickWeighted(mask, base, protos, rng);
    if (chosen < 0) return null;
    for (let k = 0; k < n; k++) mask[base + k] = k === chosen ? 1 : 0;
    if (!propagate(best)) return null;
  }

  // Read out the single remaining proto per cell.
  const cells: WfcCell[] = new Array(cellCount);
  for (let cell = 0; cell < cellCount; cell++) {
    const base = cell * n;
    let k = 0;
    while (k < n && !mask[base + k]) k++;
    const p = protos[k]!;
    cells[cell] = { tile: p.tile, rotation: p.rotation };
  }
  return { cols, rows, cells };
}

/**
 * Solve a tiled WFC grid deterministically. On contradiction the solver retries
 * with a seed bumped by the attempt number, so the *same* input seed always
 * yields the *same* final grid.
 */
export function solveWfc(opts: WfcOptions): WfcGrid {
  const protos = expandProtos(opts.tiles);
  if (protos.length === 0) throw new Error("WFC: no tile prototypes");
  const adj = buildAdjacency(protos);
  const maxRestarts = opts.maxRestarts ?? 12;
  for (let attempt = 0; attempt <= maxRestarts; attempt++) {
    const rng = makeRng((opts.seed | 0) + attempt * 0x9e3779b1);
    const grid = solveOnce(opts.cols, opts.rows, protos, adj, rng, opts.fixed, opts.boundarySocket);
    if (grid) return grid;
  }
  throw new Error(`WFC: no solution after ${maxRestarts + 1} attempts (seed ${opts.seed})`);
}

/** Look up a solved cell by column/row. */
export function wfcAt(grid: WfcGrid, c: number, r: number): WfcCell {
  return grid.cells[r * grid.cols + c]!;
}
