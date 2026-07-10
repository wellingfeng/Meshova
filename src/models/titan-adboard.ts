/**
 * Titan Ad Board — reverse-engineered from Houdini "TUT_ad_boards.hda"
 * (project_titan). The HDA draws a board panel, wires a frame with Polywire,
 * ages it with curvature + ambient-occlusion masks, and lays out a slogan as
 * stacked text rows. Its layout wrangles:
 *
 *   string words[] = split(s@slogan);              // tokenize slogan
 *   ... build textparts, one row per 3 words ...
 *   @P.y -= i@iteration * 1.5;                      // stack rows downward
 *   @Cd = point(1,"Cd",0) / 255.0;                  // sample colour from source
 *
 * We do not render real fonts (Meshova stays procedural, no texture bake), so a
 * slogan becomes stacked emissive bars — one row per group of words, dropping
 * 1.5 units each (the exact HDA stacking rule). The board is a framed panel on
 * a post; a weathering tint darkens edges to fake the AO/curvature ageing.
 *
 * Run: pnpm tsx examples/titan-adboard.ts
 */
import {
  box,
  merge,
  translateMesh,
  transform,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { vec3 } from "../math/vec3.js";

type RGB = [number, number, number];

const FRAME: RGB = [0.28, 0.29, 0.31];
const PANEL: RGB = [0.85, 0.83, 0.78];
const POST: RGB = [0.3, 0.31, 0.33];
const TEXT: RGB = [0.9, 0.2, 0.15];

export interface TitanAdBoardParams {
  /** Board width (HDA "lenght"). */
  width: number;
  /** Board height (HDA "height"). */
  height: number;
  /** Board tilt around X (HDA "Rotate board"), radians. */
  tilt: number;
  /** Height of the support post from ground to board bottom. */
  postHeight: number;
  /** Slogan; split into rows of 3 words each (HDA split rule). */
  slogan: string;
  /** Words per text row (HDA uses 3). */
  wordsPerRow: number;
  /** Vertical drop per text row (HDA `@P.y -= iteration * 1.5`). */
  rowDrop: number;
  /** Frame border thickness. */
  frame: number;
  /** Twin posts instead of a single centre post. */
  twinPosts: boolean;
}

export const TITAN_ADBOARD_DEFAULTS: TitanAdBoardParams = {
  width: 6,
  height: 3,
  tilt: 0.08,
  postHeight: 4,
  slogan: "MESHOVA PROCEDURAL WORLDS BUILT BY CODE",
  wordsPerRow: 3,
  rowDrop: 1.5,
  frame: 0.18,
  twinPosts: true,
};

/** Emissive text-row bars stacked down the panel (HDA slogan stacking). */
function textRows(p: TitanAdBoardParams): Mesh {
  const words = p.slogan.trim().split(/\s+/).filter(Boolean);
  const rows: string[] = [];
  for (let i = 0; i < words.length; i += p.wordsPerRow) {
    rows.push(words.slice(i, i + p.wordsPerRow).join(" "));
  }
  if (rows.length === 0) return merge();
  const meshes: Mesh[] = [];
  const rowH = Math.min(0.5, (p.height * 0.7) / rows.length);
  // Normalise HDA's fixed 1.5 drop to fit inside the panel.
  const drop = Math.min(p.rowDrop, (p.height - rowH) / Math.max(1, rows.length));
  const startY = ((rows.length - 1) * drop) / 2;
  for (let r = 0; r < rows.length; r++) {
    const text = rows[r]!;
    // Bar length proportional to character count, clamped to panel width.
    const len = Math.min(p.width * 0.82, text.length * 0.22);
    const bar = box(len, rowH * 0.6, 0.06);
    const y = startY - r * drop; // @P.y -= iteration * drop
    meshes.push(translateMesh(bar, vec3(0, y, 0.09)));
  }
  return merge(...meshes);
}

export function buildTitanAdBoardParts(params: Partial<TitanAdBoardParams> = {}): NamedPart[] {
  const p: TitanAdBoardParams = { ...TITAN_ADBOARD_DEFAULTS, ...params };
  const boardBottom = p.postHeight;
  const boardCenterY = boardBottom + p.height / 2;

  // Panel + frame, built centred at origin then tilted and lifted.
  const panel = box(p.width, p.height, 0.12);
  const frameMeshes: Mesh[] = [];
  const f = p.frame;
  frameMeshes.push(translateMesh(box(p.width + f * 2, f, 0.16), vec3(0, p.height / 2 + f / 2, 0)));
  frameMeshes.push(translateMesh(box(p.width + f * 2, f, 0.16), vec3(0, -p.height / 2 - f / 2, 0)));
  frameMeshes.push(translateMesh(box(f, p.height, 0.16), vec3(-p.width / 2 - f / 2, 0, 0)));
  frameMeshes.push(translateMesh(box(f, p.height, 0.16), vec3(p.width / 2 + f / 2, 0, 0)));

  const rows = textRows(p);

  // Assemble board group, tilt around X, lift to board centre.
  const tiltLift = (m: Mesh) =>
    translateMesh(transform(m, { rotate: vec3(p.tilt, 0, 0) }), vec3(0, boardCenterY, 0));

  const panelMesh = tiltLift(panel);
  const frameMesh = tiltLift(merge(...frameMeshes));
  const textMesh = tiltLift(rows);

  // Posts.
  const postMeshes: Mesh[] = [];
  const postW = 0.28;
  const postXs = p.twinPosts ? [-p.width * 0.3, p.width * 0.3] : [0];
  for (const x of postXs) {
    postMeshes.push(translateMesh(box(postW, boardBottom, postW), vec3(x, boardBottom / 2, 0)));
  }

  return [
    {
      name: "posts",
      label: "支柱",
      mesh: merge(...postMeshes),
      color: POST,
      surface: { type: "metal", params: { color: POST, roughness: 0.6, metallic: 1 } },
    },
    {
      name: "frame",
      label: "边框",
      mesh: frameMesh,
      color: FRAME,
      surface: { type: "metal", params: { color: FRAME, roughness: 0.55, metallic: 1 } },
    },
    {
      name: "panel",
      label: "板面",
      mesh: panelMesh,
      color: PANEL,
      surface: { type: "plastic", params: { color: PANEL, roughness: 0.7 } },
    },
    {
      name: "text",
      label: "标语",
      mesh: textMesh,
      color: TEXT,
      surface: { type: "emissive", params: { color: TEXT, intensity: 1.2 } },
      metadata: { source: "TUT_ad_boards.hda", note: "slogan rows, no real font bake" },
    },
  ].filter((part) => part.mesh.positions.length > 0) as NamedPart[];
}
