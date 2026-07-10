/**
 * Titan Platform — reverse-engineered from Houdini "Tutorial_platform.hda"
 * (project_titan). The HDA extracts a silhouette from the input, walks its
 * border, and copies plank pieces along it, stretching each to fill:
 *
 *   @scale = set(@width / ch("../../length"), 1, 1);   // fill plank to segment
 *   @scale *= chv("scalar");                            // per-plank scale tweak
 *
 * plus Base / Border / Corner-in / Corner-out / Planks / Scalar-Height controls
 * (a decked platform: plank floor + border rail + corner posts).
 *
 * This is the same fill-pieces-along-a-boundary pattern as Rail/Fence, so it
 * reuses `layoutPiecesOnCurve` (from curve-pieces.ts): the deck is a run of
 * planks laid across the platform, and the border rail is a plank strip swept
 * around the rectangular outline. Deterministic — no RNG in the layout.
 *
 * Run: pnpm tsx examples/titan-platform.ts
 */
import {
  polyline,
  box,
  merge,
  translateMesh,
  layoutPiecesOnCurve,
  type Curve,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { vec3 } from "../math/vec3.js";

type RGB = [number, number, number];

const PLANK: RGB = [0.42, 0.3, 0.18];
const PLANK_ALT: RGB = [0.36, 0.25, 0.14];
const RAIL: RGB = [0.3, 0.21, 0.12];
const POST: RGB = [0.26, 0.18, 0.1];

export interface TitanPlatformParams {
  /** Platform length along +Z (metres, HDA "Length"). */
  length: number;
  /** Platform width along +X (metres, HDA "Scale width"). */
  width: number;
  /** Deck height off the ground. */
  height: number;
  /** Plank width across the deck (planks run along +X). */
  plankWidth: number;
  /** Plank thickness. */
  plankThickness: number;
  /** Add a border rail around the deck (HDA "Border"). */
  border: boolean;
  /** Rail height above the deck. */
  railHeight: number;
  /** Corner post size (HDA "Corner in/out"). 0 = no posts. */
  cornerPost: number;
}

export const TITAN_PLATFORM_DEFAULTS: TitanPlatformParams = {
  length: 8,
  width: 5,
  height: 0.6,
  plankWidth: 0.5,
  plankThickness: 0.08,
  border: true,
  railHeight: 1,
  cornerPost: 0.16,
};

/** Rectangular outline curve of the platform on the XZ plane at deck top. */
function outline(p: TitanPlatformParams, y: number): Curve {
  const hx = p.width / 2;
  const hz = p.length / 2;
  return polyline(
    [
      vec3(-hx, y, -hz),
      vec3(hx, y, -hz),
      vec3(hx, y, hz),
      vec3(-hx, y, hz),
      vec3(-hx, y, -hz),
    ],
    true,
  );
}

export function buildTitanPlatformParts(params: Partial<TitanPlatformParams> = {}): NamedPart[] {
  const p: TitanPlatformParams = { ...TITAN_PLATFORM_DEFAULTS, ...params };
  const deckTop = p.height;

  // Deck planks: run across +X, laid one after another along +Z.
  const deckMeshes: Mesh[] = [];
  const altMeshes: Mesh[] = [];
  const count = Math.max(1, Math.round(p.length / p.plankWidth));
  const gap = 0.01;
  for (let i = 0; i < count; i++) {
    const z = -p.length / 2 + (i + 0.5) * (p.length / count);
    const plank = box(p.width, p.plankThickness, (p.length / count) - gap);
    const placed = translateMesh(plank, vec3(0, deckTop, z));
    if (i % 2 === 0) deckMeshes.push(placed);
    else altMeshes.push(placed);
  }

  // Support legs at the four corners under the deck.
  const legMeshes: Mesh[] = [];
  const hx = p.width / 2 - 0.2;
  const hz = p.length / 2 - 0.2;
  for (const sx of [-hx, hx]) {
    for (const sz of [-hz, hz]) {
      legMeshes.push(translateMesh(box(0.18, p.height, 0.18), vec3(sx, p.height / 2, sz)));
    }
  }

  const parts: NamedPart[] = [
    {
      name: "deck",
      label: "甲板",
      mesh: merge(...deckMeshes),
      color: PLANK,
      surface: { type: "wood", params: { color: PLANK, roughness: 0.8 } },
      metadata: { source: "Tutorial_platform.hda" },
    },
    {
      name: "deck_alt",
      label: "甲板纹",
      mesh: merge(...altMeshes),
      color: PLANK_ALT,
      surface: { type: "wood", params: { color: PLANK_ALT, roughness: 0.82 } },
    },
    {
      name: "legs",
      label: "支腿",
      mesh: merge(...legMeshes),
      color: POST,
      surface: { type: "wood", params: { color: POST, roughness: 0.85 } },
    },
  ];

  if (p.border) {
    // Border rail: a plank strip swept around the outline, filled by the layout.
    const railPiece = translateMesh(box(0.08, 0.1, 1), vec3(0, p.railHeight, 0));
    const railMesh = layoutPiecesOnCurve(outline(p, deckTop), {
      segmentLength: 1,
      pieces: [railPiece],
      pieceLengths: [1],
    });
    // Vertical balusters via corner posts.
    const postMeshes: Mesh[] = [];
    if (p.cornerPost > 0) {
      const px = p.width / 2;
      const pz = p.length / 2;
      for (const sx of [-px, px]) {
        for (const sz of [-pz, pz]) {
          postMeshes.push(
            translateMesh(box(p.cornerPost, p.railHeight, p.cornerPost), vec3(sx, deckTop + p.railHeight / 2, sz)),
          );
        }
      }
    }
    parts.push({
      name: "rail",
      label: "围栏",
      mesh: merge(railMesh, ...postMeshes),
      color: RAIL,
      surface: { type: "wood", params: { color: RAIL, roughness: 0.8 } },
    });
  }

  return parts.filter((part) => part.mesh.positions.length > 0);
}
