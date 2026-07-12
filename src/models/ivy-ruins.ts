/**
 * Ivy-covered ruins — a scene modeled on the classic UE PCG demo screenshot:
 * a stone base wall, three broken classical columns of varying height, ivy
 * climbing each column and the wall, and ivy creeping across the ground.
 *
 * The point of this model is to exercise the surface-climbing vine generator
 * (`cylinderSurface` / `wallSurface` + `buildClimbingVineParts`): the ivy is
 * grown live, adhering to each column/wall, not scattered baked meshes.
 *
 * Determinism: all randomness flows from the seeded PRNG, so the same seed
 * reproduces the same ruin + ivy tangle every run.
 *
 * Run: pnpm ivy-ruins
 */
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import { box, column, ruinify } from "../geometry/index.js";
import { merge, type Mesh } from "../geometry/mesh.js";
import { transform } from "../geometry/transform.js";
import { subdivide, displaceByNoise } from "../geometry/ops.js";
import {
  meshSurface,
  wallSurface,
  buildClimbingVineParts,
  type ClimbSurface,
} from "../geometry/vine.js";
import type { NamedPart } from "../geometry/export.js";

export interface IvyRuinsOptions {
  /** Random seed. Same seed => identical scene. Default 7. */
  seed?: number;
  /** Number of columns. Default 3. */
  columns?: number;
  /** Column radius. Default 0.45. */
  columnRadius?: number;
  /** Ivy strands seeded per column. Default 6. */
  ivyPerColumn?: number;
  /** Ivy leaf density. Default 9. */
  leafDensity?: number;
  /** How lush the ivy is (multiplies strand count + leaves). Default 1. */
  lushness?: number;
}

const STONE: [number, number, number] = [0.72, 0.7, 0.64];
const LEAF: [number, number, number] = [0.26, 0.5, 0.2];
const WOOD: [number, number, number] = [0.3, 0.24, 0.14];

/**
 * A weathered stone column. Upgraded to the real parametric `column()` (fluted,
 * tapered shaft + proper base/capital) run through `ruinify` so tall columns
 * read as broken/eroded ruins instead of clean cylinders. `broken` drives how
 * much of the crown is bitten away.
 */
function makeColumn(seed: number, radius: number, height: number, broken: number): Mesh {
  const col = column({
    height,
    radius,
    segments: 20,
    flutes: 16,
    fluteDepth: 0.07,
    taper: 0.14,
    base: true,
    capital: broken < 0.45, // heavily broken columns have lost their capital
  });
  return ruinify(col, {
    seed,
    crumble: broken,
    erosion: 0.45,
    chunks: 5,
    chunkSize: 0.06,
    cusp: 26,
  });
}

/** Build the ruin scene as named parts (stone + ivy stem + ivy leaves merged). */
export function buildIvyRuinsParts(options: IvyRuinsOptions = {}): NamedPart[] {
  const seed = options.seed ?? 7;
  const nCols = Math.max(1, Math.round(options.columns ?? 3));
  const cr = options.columnRadius ?? 0.45;
  const lush = options.lushness ?? 1;
  const ivyPerColumn = Math.max(1, Math.round((options.ivyPerColumn ?? 6) * lush));
  const leafDensity = (options.leafDensity ?? 9) * lush;
  const rng = makeRng(seed);

  const stoneMeshes: Mesh[] = [];
  const ivyStems: Mesh[] = [];
  const ivyLeaves: Mesh[] = [];

  const pushIvy = (parts: NamedPart[]) => {
    for (const p of parts) {
      if (p.name === "leaves") ivyLeaves.push(p.mesh);
      else ivyStems.push(p.mesh);
    }
  };

  // --- base wall (a long weathered block the columns stand on) ---
  const wallW = nCols * 2.4 + 1.2;
  const wallH = 1.6;
  const wallD = 1.4;
  let wall = box(wallW, wallH, wallD);
  wall = transform(wall, { translate: vec3(0, wallH / 2, 0) });
  wall = displaceByNoise(subdivide(wall, 1), { amount: 0.06, scale: 2.2, seed: seed + 99 });
  stoneMeshes.push(wall);

  // ivy climbing the front face of the wall
  const frontWall: ClimbSurface = wallSurface({
    origin: vec3(0, 0, wallD / 2),
    normal: vec3(0, 0, 1),
    up: vec3(0, 1, 0),
    width: wallW * 0.92,
    height: wallH,
  });
  pushIvy(
    buildClimbingVineParts(frontWall, {
      seed: seed + 1,
      strands: Math.round(5 * lush),
      radius: 0.03,
      climb: 0.8,
      weave: 0.5,
      leafDensity,
      branches: 1,
    }),
  );

  // --- columns across the top of the wall, varied heights (some broken) ---
  const heights: number[] = [];
  for (let i = 0; i < nCols; i++) {
    // alternate tall / broken-short so it reads as a ruin
    const tall = 3.2 + rng.next() * 0.8;
    const broken = 1.6 + rng.next() * 1.0;
    heights.push(rng.next() < 0.55 ? tall : broken);
  }

  for (let i = 0; i < nCols; i++) {
    const x = (i - (nCols - 1) / 2) * 2.4;
    const h = heights[i]!;
    const colSeed = seed + 100 + i * 7;
    // shorter columns are the "broken" ones: crumble their crown harder.
    const broken = h < 2.6 ? 0.5 : 0.2;
    let col = makeColumn(colSeed, cr, h, broken);
    col = transform(col, { translate: vec3(x, wallH, 0) });
    stoneMeshes.push(col);

    // ivy adheres to the ACTUAL ruined column mesh (not a cylinder approx), so
    // it hugs the flutes, broken crown and chunk bites via meshSurface.
    const surf = meshSurface(col);
    pushIvy(
      buildClimbingVineParts(surf, {
        seed: colSeed + 3,
        strands: ivyPerColumn,
        radius: 0.028,
        climb: 0.75,
        weave: 0.85, // strong winding => helix up the column
        wander: 0.35,
        leafDensity,
        branches: 2,
        length: h * 1.25,
      }),
    );
  }

  const parts: NamedPart[] = [
    {
      name: "stone",
      label: "石构",
      mesh: merge(...stoneMeshes),
      color: STONE,
      surface: { type: "stone", params: { color: STONE, roughness: 0.95, scale: 2.5 } },
      // Columns are run through `ruinify` (crumble/erosion/chunks) on purpose:
      // the open cross-sections and bitten crowns are the ruin aesthetic, not a
      // broken-mesh defect. Declare it so the critic's hole check backs off.
      metadata: { weathered: true },
    },
  ];
  if (ivyStems.length > 0) {
    parts.push({
      name: "ivy_stem",
      label: "藤茎",
      mesh: merge(...ivyStems),
      color: WOOD,
      surface: { type: "wood", params: { tone: WOOD } },
    });
  }
  if (ivyLeaves.length > 0) {
    parts.push({
      name: "ivy_leaves",
      label: "藤叶",
      mesh: merge(...ivyLeaves),
      color: LEAF,
      surface: { type: "fabric", params: { color: LEAF } },
    });
  }
  return parts;
}

/** Rough quality read: part/vert/tri totals across the scene. */
export function scoreIvyRuins(parts: NamedPart[]): { feedback: string } {
  let verts = 0;
  let tris = 0;
  for (const p of parts) {
    verts += p.mesh.positions.length;
    tris += p.mesh.indices.length / 3;
  }
  return { feedback: `ivy-ruins: ${parts.length} parts, ${verts} verts, ${tris} tris` };
}
