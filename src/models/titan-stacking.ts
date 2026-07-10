/**
 * Titan Stacking — reverse-engineered from Houdini "Titan_StackingTool.hda"
 * (project_titan). The HDA Voronoi-fractures an object, then drops the shards
 * with an RBD Bullet sim (Min/Max Angle Rotation, Min/Max Scale, Velocity,
 * "enable sim") so they settle into a pile.
 *
 * Meshova does not run physics (out of scope by design), so we keep the real
 * part — the deterministic Voronoi fracture (`voronoiFracture`) — and replace
 * the Bullet solve with `stackFragments`, a deterministic golden-angle spiral
 * that settles shards into a rubble heap. Same seed -> same pile, every run.
 *
 * Run: pnpm tsx examples/titan-stacking.ts
 */
import {
  box,
  merge,
  voronoiFracture,
  stackFragments,
  type NamedPart,
} from "../geometry/index.js";

type RGB = [number, number, number];

const STONE: RGB = [0.5, 0.48, 0.45];
const STONE_DARK: RGB = [0.38, 0.36, 0.33];

export interface TitanStackingParams {
  /** Source block size (the thing that gets fractured). */
  blockSize: [number, number, number];
  /** Number of Voronoi shards (HDA cell count). */
  shards: number;
  /** Fracture seed. */
  fractureSeed: number;
  /** Placement seed for the settled pile. */
  stackSeed: number;
  /** Pile spread radius. */
  spread: number;
  /** Max yaw jitter per shard (radians). HDA Max Angle Rotation. */
  yawJitter: number;
  /** Bias fracture toward an impact point (0 = uniform). */
  focusBias: number;
}

export const TITAN_STACKING_DEFAULTS: TitanStackingParams = {
  blockSize: [3, 3, 3],
  shards: 12,
  fractureSeed: 5,
  stackSeed: 2,
  spread: 2.2,
  yawJitter: Math.PI,
  focusBias: 0,
};

export function buildTitanStackingParts(params: Partial<TitanStackingParams> = {}): NamedPart[] {
  const p: TitanStackingParams = { ...TITAN_STACKING_DEFAULTS, ...params };
  const [bx, by, bz] = p.blockSize;
  const src = box(bx, by, bz);

  const frags = voronoiFracture(src, {
    cells: p.shards,
    seed: p.fractureSeed,
    focusBias: p.focusBias,
  });
  const placed = stackFragments(frags, {
    seed: p.stackSeed,
    spread: p.spread,
    yawJitter: p.yawJitter,
    groundY: 0,
  });

  // Split shards into two colour groups (alternating) so the pile reads as
  // mixed rubble rather than one flat mass.
  const groupA = placed.filter((_, i) => i % 2 === 0);
  const groupB = placed.filter((_, i) => i % 2 === 1);

  return [
    {
      name: "rubble_a",
      label: "碎块A",
      mesh: merge(...groupA),
      color: STONE,
      surface: { type: "concrete", params: { color: STONE, roughness: 0.95 } },
      metadata: { source: "Titan_StackingTool.hda", method: "voronoi fracture + deterministic pile (no RBD)" },
    },
    {
      name: "rubble_b",
      label: "碎块B",
      mesh: merge(...groupB),
      color: STONE_DARK,
      surface: { type: "concrete", params: { color: STONE_DARK, roughness: 0.95 } },
    },
  ].filter((part) => part.mesh.positions.length > 0) as NamedPart[];
}
