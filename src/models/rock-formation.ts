/**
 * Procedural rock formation / cliff / rock-shelf generator.
 *
 * Why this exists: in UE's Electric Dreams PCG demo `_GENERATED/RockFormation/
 * SM_RockFormation_*`, `SM_ForestRockShelf_*` and `SM_SandstoneCliff_*` are
 * *baked* high-poly meshes an external sculpt/scan tool produced, then PCG
 * scatters and assembles them. Meshova instead grows the rock from primitives +
 * seeded noise, so a rock is a re-runnable script, never a mesh dump.
 *
 * Pipeline (all deterministic — seed only, no RNG of time):
 *   1. Stack + fuse a few overlapping spheres into one lumpy boulder skin
 *      (metaballs / fuseSpheres) — the coarse silhouette.
 *   2. Displace the skin along its normals by fBm noise — the craggy surface.
 *   3. Optionally plane-cut horizontal strata off the top/sides to read as
 *      sedimentary rock shelves (the "ForestRockShelf" ledge look).
 *
 * Three presets fall out of the same pipeline by tuning blob layout + cuts:
 *   - "boulder": one rounded fused blob, heavy noise, no strata cut
 *   - "shelf":   a wide low blob with a flat top cut (a rock ledge to stand on)
 *   - "cliff":   a tall stack sliced by several vertical/horizontal planes
 *
 * Determinism: same params + seed => identical rock. Never introduce
 * Math.random / Date.now here.
 */
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import { fuseSpheres } from "../geometry/metaball.js";
import { displaceByNoise } from "../geometry/ops.js";
import { planeCut } from "../geometry/cut.js";
import { recomputeNormals, type Mesh } from "../geometry/mesh.js";
import type { NamedPart } from "../geometry/export.js";

export type RockMode = "boulder" | "shelf" | "cliff";

export interface RockOptions {
  /** Random stream seed. Same seed => identical rock. Default 3. */
  seed?: number;
  /** Formation style. Default "boulder". */
  mode?: RockMode;
  /** Overall footprint radius (world units). Default 1.5. */
  radius?: number;
  /** Overall height (world units). Default 1.5. */
  height?: number;
  /** How many blobs are fused into the coarse silhouette. Default 5. */
  blobs?: number;
  /** Metaball extraction resolution (higher = finer + slower). Default 40. */
  resolution?: number;
  /** fBm displacement amount (crag depth) as a fraction of radius. Default 0.18. */
  crag?: number;
  /** fBm displacement frequency. Default 1.6. */
  cragFrequency?: number;
  /** Number of horizontal strata cuts (rock shelves). Default from mode. */
  strata?: number;
  /** Base color (linear RGB). Default warm sandstone grey. */
  color?: [number, number, number];
}

interface RockModeDefaults {
  strata: number;
  crag: number;
  /** Vertical squash of the blob stack (1 = round, <1 = flat/wide). */
  squash: number;
}

function rockModeDefaults(mode: RockMode): RockModeDefaults {
  switch (mode) {
    case "shelf":
      return { strata: 1, crag: 0.14, squash: 0.5 };
    case "cliff":
      return { strata: 3, crag: 0.2, squash: 1.4 };
    case "boulder":
    default:
      return { strata: 0, crag: 0.2, squash: 0.9 };
  }
}

interface RockResolved extends Required<RockOptions> {}

function resolveRock(options: RockOptions): RockResolved {
  const mode = options.mode ?? "boulder";
  const md = rockModeDefaults(mode);
  return {
    seed: options.seed ?? 3,
    mode,
    radius: options.radius ?? 1.5,
    height: options.height ?? 1.5,
    blobs: options.blobs ?? 5,
    resolution: options.resolution ?? 40,
    crag: options.crag ?? md.crag,
    cragFrequency: options.cragFrequency ?? 1.6,
    strata: options.strata ?? md.strata,
    color: options.color ?? [0.46, 0.42, 0.36],
  };
}

/**
 * Build the raw rock mesh: fuse a seeded blob stack, displace by noise, and cut
 * strata. Returns the mesh only (see buildRockFormationParts for a named part).
 */
export function buildRockFormationMesh(options: RockOptions = {}): Mesh {
  const opts = resolveRock(options);
  const md = rockModeDefaults(opts.mode);
  const rng = makeRng(opts.seed >>> 0);

  // 1. seeded blob stack — overlapping spheres climbing the height, jittered
  //    laterally so the silhouette is irregular, not a neat tower.
  const spheres: { center: Vec3; radius: number }[] = [];
  const n = Math.max(1, Math.floor(opts.blobs));
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0; // 0..1 up the stack
    // blobs shrink toward the top; wider footprint low down
    const r = opts.radius * (0.55 + (1 - t) * 0.45) * (0.8 + rng.next() * 0.4);
    const jx = (rng.next() - 0.5) * opts.radius * 0.6;
    const jz = (rng.next() - 0.5) * opts.radius * 0.6;
    const y = t * opts.height * md.squash;
    spheres.push({ center: vec3(jx, y, jz), radius: r });
  }
  let mesh = fuseSpheres(spheres, { resolution: opts.resolution });

  // 2. craggy surface — push vertices along normals by fBm noise
  mesh = displaceByNoise(mesh, {
    amount: opts.radius * opts.crag,
    scale: opts.cragFrequency,
    seed: opts.seed + 101,
  });

  // 3. strata cuts — slice flat horizontal ledges (rock shelf read). Each cut
  //    keeps the material below the plane and caps it, giving a flat shelf face.
  const strata = Math.max(0, Math.floor(opts.strata));
  if (strata > 0) {
    // top cut flattens the crown; extra cuts step down the stack
    for (let s = 0; s < strata; s++) {
      const frac = 1 - (s + 0.5) / (strata + 0.5);
      const y = opts.height * md.squash * (0.5 + frac * 0.5);
      // alternate a slight tilt so shelves aren't perfectly level
      const tilt = (rng.next() - 0.5) * 0.12;
      mesh = planeCut(
        mesh,
        { point: vec3(0, y, 0), normal: vec3(tilt, 1, tilt * 0.7) },
        { keep: "negative", cap: true },
      );
    }
  }
  return recomputeNormals(mesh);
}

/**
 * Build a rock formation as named parts (one stone part with a matched surface).
 * Deterministic for a given seed. Ready for the viewer / OBJ export.
 */
export function buildRockFormationParts(options: RockOptions = {}): NamedPart[] {
  const opts = resolveRock(options);
  const mesh = buildRockFormationMesh(options);
  return [
    {
      name: "rock",
      label: "岩体",
      mesh,
      color: opts.color,
      surface: { type: "stone", params: { tone: opts.color } },
    },
  ];
}

/** Named rock recipes — distinct silhouettes from the one pipeline. */
export const ROCK_PRESETS: Record<string, RockOptions> = {
  boulder: { seed: 3, mode: "boulder", radius: 1.5, height: 1.4, blobs: 5, crag: 0.22 },
  shelf: { seed: 8, mode: "shelf", radius: 2.2, height: 1.1, blobs: 6, crag: 0.14 },
  cliff: { seed: 15, mode: "cliff", radius: 1.6, height: 3.2, blobs: 7, crag: 0.2, strata: 3 },
};

/** Build one rock preset by name. Falls back to the boulder. */
export function buildRockPreset(name: string, override: RockOptions = {}): NamedPart[] {
  const base = ROCK_PRESETS[name] ?? ROCK_PRESETS.boulder!;
  return buildRockFormationParts({ ...base, ...override });
}
