/**
 * Titan Rail — reverse-engineered from Houdini "Tutorial_Rail.hda"
 * (project_titan). The HDA takes an input curve, resamples it, measures each
 * segment's rest length, then classifies segments into three buckets by a size
 * wrangle:
 *
 *   if (@restlength > 3)                @group_large  = 1;  // Cd red
 *   if (@restlength < 3 && > 1)         @group_medium = 1;  // Cd green
 *   if (@restlength < 1)                @group_small  = 1;  // Cd blue
 *
 * Each bucket copies a matching prefab track piece and stretches it along-curve
 * so it fills the segment exactly:
 *
 *   @scale = set(1, 1, @restlength / ch("../lengthN"));  // N = 1|2|3
 *   @scale *= set(scalex, scaley, scalez);               // global size tweak
 *
 * We reproduce that faithfully with `layoutPiecesOnCurve` from curve-pieces.ts:
 * three prefab pieces (large 8m / medium 4m / small 1m) built once, bucketed by
 * thresholds [1, 3], stretched to fill. Rails are steel I-profiles; sleepers
 * are a per-piece row of ties whose count scales with the piece length. Same
 * params -> same track (deterministic, no RNG in the layout path).
 *
 * Run: pnpm tsx examples/titan-rail.ts
 */
import {
  polyline,
  bezier,
  smoothCurve,
  box,
  merge,
  transform,
  translateMesh,
  layoutPiecesOnCurve,
  type Curve,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { vec3 } from "../math/vec3.js";

type RGB = [number, number, number];

const STEEL: RGB = [0.5, 0.51, 0.53];
const SLEEPER_WOOD: RGB = [0.22, 0.15, 0.09];
const SLEEPER_CONCRETE: RGB = [0.58, 0.58, 0.6];
const BALLAST: RGB = [0.33, 0.32, 0.3];

export interface TitanRailParams {
  /** Run length (metres) of the generated centerline. */
  length: number;
  /** Lateral bend amplitude of the S-curve centerline (0 = straight). */
  bend: number;
  /** Track gauge — outer distance between the two rail centres. Default 1.435m. */
  gauge: number;
  /** HDA "Length Large Piece" — prefab length of the large module (@restlength>3). */
  lengthLarge: number;
  /** HDA "Length Medium Piece". */
  lengthMedium: number;
  /** HDA "Length Small Piece". */
  lengthSmall: number;
  /**
   * Resample target segment length. Drives which buckets appear: near lengthLarge
   * => large modules; shrink to spawn medium/small at bends. Default = lengthLarge.
   */
  segmentLength: number;
  /** Global scale tweak (HDA scalex/y/z applied after the fill stretch). */
  scale: [number, number, number];
  /** Concrete sleepers instead of timber. */
  concreteSleepers: boolean;
}

export const TITAN_RAIL_DEFAULTS: TitanRailParams = {
  length: 48,
  bend: 8,
  gauge: 1.435,
  lengthLarge: 8,
  lengthMedium: 4,
  lengthSmall: 1,
  segmentLength: 6,
  scale: [1, 1, 1],
  concreteSleepers: false,
};

/** Deterministic S-curve centerline on the XZ plane (matches railway.ts style). */
function railCenterline(p: TitanRailParams): Curve {
  const half = p.length / 2;
  const ctrl = bezier(
    vec3(-half, 0, -half),
    vec3(-half * 0.3, 0, -half + p.bend),
    vec3(half * 0.3, 0, half - p.bend),
    vec3(half, 0, half),
    24,
  );
  return smoothCurve(polyline(ctrl.points), 4);
}

/** Prefab rail pair spanning `pieceLen` along +Z, centred on X. */
function railsPiece(pieceLen: number, p: TitanRailParams): Mesh {
  const halfGauge = p.gauge / 2;
  const railH = 0.16;
  const railW = 0.07;
  const parts: Mesh[] = [];
  for (const sx of [-halfGauge, halfGauge]) {
    const rail = box(railW, railH, pieceLen);
    parts.push(translateMesh(rail, vec3(sx, railH / 2 + 0.12, 0)));
  }
  return merge(...parts);
}

/** Prefab sleeper row spanning `pieceLen` along +Z (one tie per ~0.6m). */
function sleepersPiece(pieceLen: number, p: TitanRailParams): Mesh {
  const tieCount = Math.max(2, Math.round(pieceLen / 0.6));
  const tieW = p.gauge + 0.5;
  const tie = box(tieW, 0.12, 0.22);
  const parts: Mesh[] = [];
  for (let i = 0; i < tieCount; i++) {
    const z = -pieceLen / 2 + (pieceLen * (i + 0.5)) / tieCount;
    parts.push(translateMesh(tie, vec3(0, 0.06, z)));
  }
  return merge(...parts);
}

/** Ballast trapezoid bed spanning one piece along +Z. */
function ballastPiece(pieceLen: number, p: TitanRailParams): Mesh {
  const w = p.gauge + 1.6;
  const bed = box(w, 0.1, pieceLen);
  return translateMesh(bed, vec3(0, -0.02, 0));
}

/** Build the Titan rail as separate materialed parts (ballast / track). */
export function buildTitanRailParts(params: Partial<TitanRailParams> = {}): NamedPart[] {
  const p: TitanRailParams = { ...TITAN_RAIL_DEFAULTS, ...params };
  const center = railCenterline(p);
  const [sx, sy, sz] = p.scale;

  // Three prefab pieces + their authored lengths (Rail's length/length2/length3).
  const pieceLens = [p.lengthSmall, p.lengthMedium, p.lengthLarge];
  const gscale = { scale: vec3(sx, sy, sz) };
  const railPieces = pieceLens.map((L) => transform(railsPiece(L, p), gscale));
  const sleeperPieces = pieceLens.map((L) => transform(sleepersPiece(L, p), gscale));
  const ballastPieces = pieceLens.map((L) => ballastPiece(L, p));

  // Bucket thresholds [1,3] reproduce the HDA size wrangle exactly.
  const layout = {
    segmentLength: p.segmentLength,
    bucketThresholds: [1, 3],
    pieceLengths: pieceLens,
  };

  const railMesh = layoutPiecesOnCurve(center, { ...layout, pieces: railPieces });
  const sleeperMesh = layoutPiecesOnCurve(center, { ...layout, pieces: sleeperPieces });
  const ballastMesh = layoutPiecesOnCurve(center, { ...layout, pieces: ballastPieces });

  const sleeperColor = p.concreteSleepers ? SLEEPER_CONCRETE : SLEEPER_WOOD;

  return [
    {
      name: "ballast",
      label: "道砟",
      mesh: ballastMesh,
      color: BALLAST,
      surface: { type: "concrete", params: { color: BALLAST, roughness: 0.95 } },
    },
    {
      name: "sleepers",
      label: "枕木",
      mesh: sleeperMesh,
      color: sleeperColor,
      surface: p.concreteSleepers
        ? { type: "concrete", params: { color: sleeperColor, roughness: 0.85 } }
        : { type: "wood", params: { color: sleeperColor, roughness: 0.8 } },
    },
    {
      name: "rails",
      label: "钢轨",
      mesh: railMesh,
      color: STEEL,
      surface: { type: "metal", params: { color: STEEL, roughness: 0.45, metallic: 1 } },
      metadata: { source: "Tutorial_Rail.hda", buckets: "small<1<medium<3<large" },
    },
  ] as NamedPart[];
}
