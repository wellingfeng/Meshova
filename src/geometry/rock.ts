/**
 * Rock / cliff variant generator — one rule, N deterministic variants.
 *
 * Reference: Elderwood Overlook's Natsura_Rock_Cliffs_* (~100 baked variants
 * from a single Houdini rule). Meshova keeps the *rule* and derives variants
 * from a seed, so the library ships one function instead of 100 static meshes.
 * Same seed -> same rock, every run.
 *
 * Method: start from an icosphere (blobby, no poles), push each vertex by
 * layered fbm noise for the large silhouette, add high-frequency detail for
 * chipped facets, optionally flatten the base so it sits on the ground, then
 * facet the normals for a hard, stony read.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, scale, length, normalize } from "../math/vec3.js";
import { makeNoise, fbm3 } from "../random/noise.js";
import { makeRng } from "../random/prng.js";
import { icosphere } from "./primitives2.js";
import { computeNormals, type Mesh } from "./mesh.js";

export interface CliffRockOptions {
  seed?: number;
  /** Base radius. */
  radius?: number;
  /** Icosphere subdivisions (resolution). 2..4 sensible. */
  detail?: number;
  /** Large-form displacement amount (0..1 of radius). */
  lumpiness?: number;
  /** High-frequency chip detail amount. */
  roughness?: number;
  /** Non-uniform stretch [x,y,z] to make boulders vs slabs vs spires. */
  stretch?: Vec3;
  /** Flatten the bottom this fraction so it rests on the ground (0 = sphere). */
  flatBase?: number;
  /** Cusp angle for faceting (low = sharp stony facets). */
  cusp?: number;
}

/** Generate one rock/cliff mesh from a seed + shape knobs. */
export function rock(opts: CliffRockOptions = {}): Mesh {
  const seed = (opts.seed ?? 0) >>> 0;
  const radius = opts.radius ?? 1;
  const detail = Math.max(1, Math.min(5, Math.floor(opts.detail ?? 3)));
  const lumpiness = opts.lumpiness ?? 0.45;
  const roughness = opts.roughness ?? 0.15;
  const stretch = opts.stretch ?? vec3(1, 1, 1);
  const flatBase = Math.min(1, Math.max(0, opts.flatBase ?? 0.3));
  const cusp = opts.cusp ?? 22;

  const rng = makeRng(seed);
  // Random per-rock phase so variants don't share the same noise field.
  const ox = rng.range(-100, 100);
  const oy = rng.range(-100, 100);
  const oz = rng.range(-100, 100);
  const noise = makeNoise(seed);
  const base = icosphere(radius, detail);

  const positions = base.positions.map((p) => {
    const dir = length(p) > 1e-6 ? normalize(p) : vec3(0, 1, 0);
    // Large lumps via fbm on the direction (stable across the surface).
    const big = fbm3(noise, dir.x * 1.6 + ox, dir.y * 1.6 + oy, dir.z * 1.6 + oz, { octaves: 4 });
    // Fine chips via higher frequency.
    const fine = noise.noise3(p.x * 6 + ox, p.y * 6 + oy, p.z * 6 + oz);
    const disp = radius * (lumpiness * (0.5 + 0.5 * big) + roughness * fine);
    let np = add(p, scale(dir, disp));
    // Non-uniform stretch.
    np = vec3(np.x * stretch.x, np.y * stretch.y, np.z * stretch.z);
    return np;
  });

  // Flatten base: clamp verts below a Y threshold up to a flat plane.
  if (flatBase > 0) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of positions) { if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
    const cut = minY + (maxY - minY) * flatBase;
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i]!;
      if (p.y < cut) positions[i] = vec3(p.x, cut, p.z);
    }
  }

  return computeNormals({ positions, normals: base.normals.slice(), uvs: base.uvs.slice(), indices: base.indices.slice() }, cusp);
}

// ---------------------------------------------------------------------------
// Rock archetypes — named noise-domain recipes for distinct silhouettes, plus
// terrain scattering. All layer on the same seed-driven engine above.
// ---------------------------------------------------------------------------

export type RockArchetype = "boulder" | "slab" | "spire" | "eroded" | "strata";

/** Recipe knobs for each archetype (merged over user opts). */
function archetypeKnobs(kind: RockArchetype): Partial<CliffRockOptions> {
  switch (kind) {
    case "boulder":
      return { stretch: vec3(1.1, 0.85, 1.05), lumpiness: 0.4, roughness: 0.12, flatBase: 0.35, cusp: 26 };
    case "slab":
      return { stretch: vec3(1.4, 0.45, 1.2), lumpiness: 0.3, roughness: 0.1, flatBase: 0.5, cusp: 18 };
    case "spire":
      return { stretch: vec3(0.7, 2.1, 0.7), lumpiness: 0.35, roughness: 0.18, flatBase: 0.2, cusp: 16 };
    case "eroded":
      return { stretch: vec3(1.15, 0.9, 1.1), lumpiness: 0.55, roughness: 0.28, flatBase: 0.4, cusp: 30 };
    case "strata":
      return { stretch: vec3(1.25, 0.7, 1.15), lumpiness: 0.3, roughness: 0.14, flatBase: 0.45, cusp: 20 };
    default:
      return {};
  }
}

export interface ArchetypeRockOptions extends CliffRockOptions {
  /** Horizontal sedimentary banding depth (strata layers). 0 = off. */
  strata?: number;
  /** Number of strata bands over the height. Default 6. */
  strataBands?: number;
}

/**
 * Build a rock by named archetype. `strata` layers add horizontal sedimentary
 * banding (a stepped Y quantization) on top of the base displacement, giving the
 * eroded/strata looks their rock-face read.
 */
export function archetypeRock(kind: RockArchetype, opts: ArchetypeRockOptions = {}): Mesh {
  const knobs = archetypeKnobs(kind);
  const merged: CliffRockOptions = { ...knobs, ...opts };
  // strata implies banding even when not explicitly set.
  const strata = opts.strata ?? (kind === "strata" ? 0.35 : 0);
  const bands = Math.max(1, Math.floor(opts.strataBands ?? 6));
  const base = rock(merged);
  if (strata <= 0) return base;

  // Quantize Y into bands and pull each vertex toward its band centre, so the
  // surface reads as stacked sedimentary layers. Amount scaled by `strata`.
  let minY = Infinity, maxY = -Infinity;
  for (const p of base.positions) { if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
  const span = maxY - minY || 1;
  const step = span / bands;
  const positions = base.positions.map((p) => {
    const local = (p.y - minY) / step;
    const banded = (Math.round(local) * step) + minY;
    return vec3(p.x, p.y + (banded - p.y) * strata, p.z);
  });
  return computeNormals(
    { positions, normals: base.normals.slice(), uvs: base.uvs.slice(), indices: base.indices.slice() },
    merged.cusp ?? 20,
  );
}

/** Generate a deterministic set of `count` rock variants from a base seed. */
export function rockVariants(count: number, opts: CliffRockOptions = {}): Mesh[] {
  const out: Mesh[] = [];
  const baseSeed = (opts.seed ?? 0) >>> 0;
  const rng = makeRng(baseSeed);
  for (let i = 0; i < count; i++) {
    const s = (baseSeed + i * 2654435761) >>> 0;
    // Jitter the shape knobs per variant so a batch reads as a natural family.
    const stretch = vec3(
      rng.range(0.7, 1.4),
      rng.range(0.6, 1.6),
      rng.range(0.7, 1.4),
    );
    out.push(rock({
      ...opts,
      seed: s,
      stretch: opts.stretch ?? stretch,
      lumpiness: (opts.lumpiness ?? 0.45) * rng.range(0.8, 1.25),
      roughness: (opts.roughness ?? 0.15) * rng.range(0.7, 1.4),
    }));
  }
  return out;
}
