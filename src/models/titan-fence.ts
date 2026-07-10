/**
 * Titan Fence — reverse-engineered from Houdini "Tutorial_fence.hda"
 * (project_titan). The HDA runs a curve through Resample + a Chain SOP, then
 * copies a fence module per segment. The size wrangle:
 *
 *   @scale = set(@width / 2, ch("height"), 1);   // posts sized to half-segment
 *
 * plus a deformation-blend wrangle that lerps N/up toward a second input using
 * a mask (the bend/lean along the curve). We reproduce the essence: rigid posts
 * stand at each segment boundary (not stretched), while horizontal rails/panels
 * are stretched to fill the gap between posts — the classic Rail vs Fence split
 * that `curve-pieces.ts` was built to serve (rigid pieces + stretch pieces).
 *
 * Deterministic: posts and rails follow the resampled curve; per-post lean and
 * height jitter use a seeded value, not Math.random.
 *
 * Run: pnpm tsx examples/titan-fence.ts
 */
import {
  polyline,
  bezier,
  smoothCurve,
  box,
  merge,
  translateMesh,
  transform,
  segmentCurve,
  layoutPiecesOnCurve,
  type Curve,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";

type RGB = [number, number, number];

const WOOD: RGB = [0.32, 0.22, 0.13];
const WOOD_DARK: RGB = [0.24, 0.16, 0.09];
const METAL: RGB = [0.42, 0.43, 0.46];

export interface TitanFenceParams {
  /** Run length (metres). */
  length: number;
  /** Lateral bend of the S-curve centerline. */
  bend: number;
  /** Post-to-post spacing (Resample segment length). */
  postSpacing: number;
  /** Fence height (HDA ch("height")). */
  height: number;
  /** Number of horizontal rails between posts. */
  rails: number;
  /** Post cross-section (square) size. */
  postSize: number;
  /** Per-post lean jitter amplitude (radians) — weathered look. Deterministic. */
  lean: number;
  /** Metal chain-link style rails instead of timber planks. */
  metal: boolean;
  /** Seed for deterministic jitter. */
  seed: number;
}

export const TITAN_FENCE_DEFAULTS: TitanFenceParams = {
  length: 40,
  bend: 5,
  postSpacing: 2.2,
  height: 1.5,
  rails: 3,
  postSize: 0.14,
  lean: 0.04,
  metal: false,
  seed: 7,
};

function fenceCenterline(p: TitanFenceParams): Curve {
  const half = p.length / 2;
  const ctrl = bezier(
    vec3(-half, 0, -half * 0.6),
    vec3(-half * 0.3, 0, -half * 0.6 + p.bend),
    vec3(half * 0.3, 0, half * 0.6 - p.bend),
    vec3(half, 0, half * 0.6),
    24,
  );
  return smoothCurve(polyline(ctrl.points), 4);
}

/** A single fence post (rigid, stands upright at a segment boundary). */
function postPiece(p: TitanFenceParams): Mesh {
  // Authored spanning ~postSize along Z so it stays rigid (pieceLength = postSize).
  const post = box(p.postSize, p.height, p.postSize);
  return translateMesh(post, vec3(0, p.height / 2, 0));
}

/** A rail-set piece spanning 1m along +Z, stretched to fill each segment gap. */
function railPiece(p: TitanFenceParams): Mesh {
  const parts: Mesh[] = [];
  const railT = p.metal ? 0.03 : 0.05;
  for (let i = 0; i < p.rails; i++) {
    const y = p.height * ((i + 1) / (p.rails + 1));
    const rail = box(p.metal ? 0.02 : 0.12, railT, 1); // spans 1 along Z
    parts.push(translateMesh(rail, vec3(0, y, 0)));
  }
  return merge(...parts);
}

export function buildTitanFenceParts(params: Partial<TitanFenceParams> = {}): NamedPart[] {
  const p: TitanFenceParams = { ...TITAN_FENCE_DEFAULTS, ...params };
  const center = fenceCenterline(p);
  const rng = makeRng(p.seed);

  // Posts: place one rigid post at each resampled point via segment centers.
  // We build posts by iterating segment starts so posts sit on the curve nodes.
  const segs = segmentCurve(center, { segmentLength: p.postSpacing });
  const postProto = postPiece(p);
  const postMeshes: Mesh[] = [];
  for (const seg of segs) {
    const leanX = rng.range(-p.lean, p.lean);
    const leanZ = rng.range(-p.lean, p.lean);
    const m = transform(postProto, { rotate: vec3(leanX, 0, leanZ) });
    postMeshes.push(translateMesh(m, seg.start));
  }
  // final post at the last segment end
  if (segs.length > 0) {
    const last = segs[segs.length - 1]!;
    postMeshes.push(translateMesh(postProto, last.end));
  }
  const postsMesh = merge(...postMeshes);

  // Rails: stretch a 1m rail-set to fill each segment (Rail-style fill).
  const railsMesh = layoutPiecesOnCurve(center, {
    segmentLength: p.postSpacing,
    pieces: [railPiece(p)],
    pieceLengths: [1],
  });

  const railColor = p.metal ? METAL : WOOD_DARK;
  return [
    {
      name: "posts",
      label: "立柱",
      mesh: postsMesh,
      color: WOOD,
      surface: { type: "wood", params: { color: WOOD, roughness: 0.8 } },
    },
    {
      name: "rails",
      label: p.metal ? "金属横档" : "木横档",
      mesh: railsMesh,
      color: railColor,
      surface: p.metal
        ? { type: "metal", params: { color: railColor, roughness: 0.55, metallic: 1 } }
        : { type: "wood", params: { color: railColor, roughness: 0.85 } },
      metadata: { source: "Tutorial_fence.hda" },
    },
  ] as NamedPart[];
}
