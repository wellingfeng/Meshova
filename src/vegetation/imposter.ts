/**
 * Billboard imposters — SpeedTree's distant LOD, ported.
 *
 * Far from camera, a whole tree collapses to a few camera-facing cards textured
 * with pre-rendered views (an "octahedral" / multi-angle atlas). This module
 * builds the GEOMETRY + atlas UVs; the matching atlas image is captured by the
 * headless multi-view pipeline (scripts/capture-imposter.mjs) and applied as a
 * texture in the viewer.
 *
 * Two card layouts:
 *  - cross: 2-3 perpendicular quads (cheap, always visible from the side)
 *  - billboardGrid: a grid of cards each mapped to one atlas cell (octahedral)
 *
 * Determinism: pure geometry, no RNG.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, scale, normalize } from "../math/vec3.js";
import { vec2 } from "../math/vec2.js";
import type { Mesh } from "../geometry/mesh.js";
import { makeMesh, merge, bounds } from "../geometry/mesh.js";

export interface ImposterOptions {
  /** World height of the card (defaults to the source mesh's height). */
  height?: number;
  /** Width of the card (defaults to mesh's max horizontal extent). */
  width?: number;
  /** Number of crossed quads: 2 (X-cross) or 3 (star). Default 2. */
  cards?: number;
  /** Atlas cell this card samples: UVs span [u0,v0]..[u1,v1]. Default full 0..1. */
  uvRect?: [number, number, number, number];
  /** Center the card on this point. Default mesh footprint center, base on ground. */
  center?: Vec3;
}

/**
 * Build a crossed-billboard imposter sized to a source mesh's bounds. The cards
 * stand vertically, crossing through the trunk axis, so the silhouette reads
 * from any horizontal viewing angle. UVs map the whole card to `uvRect`.
 */
export function billboardImposter(source: Mesh, opts: ImposterOptions = {}): Mesh {
  const bb = bounds(source);
  const height = opts.height ?? bb.max.y - bb.min.y;
  const width = opts.width ?? Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
  const cards = Math.max(1, Math.min(3, Math.floor(opts.cards ?? 2)));
  const [u0, v0, u1, v1] = opts.uvRect ?? [0, 0, 1, 1];
  const cx = opts.center?.x ?? (bb.min.x + bb.max.x) * 0.5;
  const cz = opts.center?.z ?? (bb.min.z + bb.max.z) * 0.5;
  const baseY = opts.center?.y ?? bb.min.y;

  const quads: Mesh[] = [];
  for (let i = 0; i < cards; i++) {
    const angle = (i / cards) * Math.PI; // 0, 90 (, 60/120 for 3)
    const dir = vec3(Math.cos(angle), 0, Math.sin(angle));
    quads.push(verticalQuad(vec3(cx, baseY, cz), dir, width, height, [u0, v0, u1, v1]));
  }
  return merge(...quads);
}

/** A single vertical quad centered horizontally at `base`, facing `dir` (XZ). */
function verticalQuad(
  base: Vec3,
  dir: Vec3,
  width: number,
  height: number,
  uv: [number, number, number, number],
): Mesh {
  const right = normalize(vec3(dir.x, 0, dir.z));
  const hw = width / 2;
  const [u0, v0, u1, v1] = uv;
  const bl = add(base, scale(right, -hw));
  const br = add(base, scale(right, hw));
  const positions: Vec3[] = [
    bl,
    br,
    add(br, vec3(0, height, 0)),
    add(bl, vec3(0, height, 0)),
  ];
  // Normal faces perpendicular to the card (so both sides shade); use dir x up.
  const n = normalize(vec3(-right.z, 0, right.x));
  const normals = [n, n, n, n];
  const uvs = [vec2(u0, v0), vec2(u1, v0), vec2(u1, v1), vec2(u0, v1)];
  const indices = [0, 1, 2, 0, 2, 3];
  return makeMesh({ positions, normals, uvs, indices });
}

export interface AtlasGridOptions {
  /** Number of view angles around the Y axis (atlas columns). Default 8. */
  views?: number;
  /** Grid rows the atlas image uses. Default 1. */
  rows?: number;
}

/**
 * Compute the atlas layout (UV rects) for an N-view horizontal imposter atlas.
 * Returns, per view index, the camera azimuth (radians) and the UV rect in the
 * atlas. The capture script renders each azimuth into the matching cell; a
 * view-dependent material then picks the cell closest to the camera angle.
 */
export function imposterAtlasLayout(opts: AtlasGridOptions = {}): {
  views: number;
  cols: number;
  rows: number;
  cells: Array<{ index: number; azimuth: number; uvRect: [number, number, number, number] }>;
} {
  const views = Math.max(1, Math.floor(opts.views ?? 8));
  const rows = Math.max(1, Math.floor(opts.rows ?? 1));
  const cols = Math.ceil(views / rows);
  const cells = [];
  for (let i = 0; i < views; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const u0 = col / cols;
    const u1 = (col + 1) / cols;
    // Atlas image rows go top-down; flip so row 0 is the top cell in UV space.
    const v1 = 1 - row / rows;
    const v0 = 1 - (row + 1) / rows;
    cells.push({
      index: i,
      azimuth: (i / views) * Math.PI * 2,
      uvRect: [u0, v0, u1, v1] as [number, number, number, number],
    });
  }
  return { views, cols, rows, cells };
}
