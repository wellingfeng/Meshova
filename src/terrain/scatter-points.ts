/**
 * Mitchell's best-candidate blue-noise point scatter.
 *
 * A deterministic port of the reference PCG resource placer: each new point is
 * chosen from K random candidates as the one farthest from all points placed so
 * far (plus fixed edge anchors), yielding evenly spaced, non-clumping layouts.
 * The reference used Math.random(); this uses the seeded Rng so the same seed
 * always yields the same layout (Meshova determinism invariant).
 */
import { makeRng, type Rng } from "../random/prng.js";
import { sampleField2DUV } from "../field/index.js";
import type { Field2D } from "../field/index.js";

export interface Point2 {
  x: number;
  y: number;
}

export interface BestCandidateOptions {
  /** Sampling rectangle width. */
  width: number;
  /** Sampling rectangle height. */
  height: number;
  /** Number of points to place. */
  count: number;
  /** Deterministic seed. */
  seed?: number;
  /**
   * Candidates tested per placed point. Higher = more even but slower.
   * Defaults to max(8, ceil(width) * 10) to mirror the reference heuristic.
   */
  candidates?: number;
  /** Keep points off the border by anchoring the 8 edge midpoints/corners. */
  edgeAnchors?: boolean;
}

function dist2(a: Point2, b: Point2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Generate `count` evenly spaced points inside [0,width] x [0,height] using
 * Mitchell's best-candidate algorithm.
 */
export function bestCandidatePoints(options: BestCandidateOptions): Point2[] {
  const { width, height } = options;
  const count = Math.max(0, Math.floor(options.count));
  if (count === 0) return [];
  if (width <= 0 || height <= 0) throw new Error("bestCandidatePoints: width/height must be > 0");
  const rng = makeRng((options.seed ?? 1) >>> 0);
  const candidateNum = Math.max(1, Math.floor(options.candidates ?? Math.max(8, Math.ceil(width) * 10)));

  const randomPoint = (): Point2 => ({ x: rng.next() * width, y: rng.next() * height });

  const edge: Point2[] = options.edgeAnchors === false ? [] : [
    { x: 0, y: 0 }, { x: 0, y: height / 2 }, { x: 0, y: height },
    { x: width / 2, y: 0 }, { x: width / 2, y: height },
    { x: width, y: 0 }, { x: width, y: height / 2 }, { x: width, y: height },
  ];

  const result: Point2[] = [randomPoint()];
  while (result.length < count) {
    let bestDist = -Infinity;
    let best: Point2 = randomPoint();
    for (let i = 0; i < candidateNum; i++) {
      const p = randomPoint();
      let minD = Infinity;
      for (const q of result) minD = Math.min(minD, dist2(p, q));
      for (const q of edge) minD = Math.min(minD, dist2(p, q));
      if (minD > bestDist) {
        bestDist = minD;
        best = p;
      }
    }
    result.push(best);
  }
  return result;
}

/**
 * Scatter points, then keep only those whose sampled field value passes a test.
 * Useful for placing resources only on land, only on grass biomes, etc. Points
 * are sampled in UV space (x/width, y/height) against `field`.
 */
export function scatterPointsOnField(
  field: Field2D,
  options: BestCandidateOptions & { accept: (value: number, point: Point2) => boolean },
): Point2[] {
  const pts = bestCandidatePoints(options);
  const { width, height, accept } = options;
  return pts.filter((p) => accept(sampleField2DUV(field, p.x / width, 1 - p.y / height), p));
}
