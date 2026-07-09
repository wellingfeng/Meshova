/**
 * Procedural cumulus cloud — a self-rewritten port of the classic Blender
 * geometry-node cloud recipe (algorithm only, no GPL code copied):
 *
 *   scatter blob centers  ->  PointsToVolume (implicit density field)
 *                         ->  VolumeToMesh   (iso-surface of the blobs)
 *                         ->  SubdivisionSurface (smooth the shell)
 *                         ->  Noise Texture displacement along normals (puffy)
 *
 * Meshova already owns every step: `metaballs` fuses finite-support blobs into
 * one watertight marching-cubes shell (== PointsToVolume + VolumeToMesh), and
 * layered fbm3 displacement gives the cauliflower "puff" the Blender graph gets
 * from stacked Noise Texture nodes (Scale / Detail / Roughness / Distortion).
 *
 * Determinism: all randomness comes from the seeded PRNG. Same params + seed =>
 * same cloud, every run.
 *
 * Run: pnpm cloud
 */
import { vec3, add, scale as vscale, length as vlen, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import { makeNoise, fbm3 } from "../random/noise.js";
import { metaballs } from "../geometry/metaball.js";
import { subdivide } from "../geometry/ops.js";
import { recomputeNormals, type Mesh } from "../geometry/mesh.js";
import type { NamedPart } from "../geometry/export.js";

export interface CloudOptions {
  /** Random stream seed. Same seed => identical cloud. Default 7. */
  seed?: number;
  /** Overall footprint radius in world units (X/Z spread). Default 3.2. */
  size?: number;
  /** Puffiness: how many blob lobes the cloud is built from. Default 14. */
  blobs?: number;
  /** Vertical squash (cumulus have flat bottoms). 1 = round, lower = flatter. Default 0.55. */
  flatten?: number;
  /** Marching-cubes grid resolution along the longest axis. Default 48. */
  resolution?: number;
  /** Iso value for the fused surface. Higher = tighter/lumpier. Default 0.5. */
  iso?: number;
  /** Catmull-style smoothing passes on the extracted shell. Default 1. */
  smooth?: number;
  /** Surface-noise displacement amount (puff depth). Default 0.18. */
  puff?: number;
  /** Base frequency of the surface puff noise. Default 1.6. */
  puffScale?: number;
}
interface Blob {
  center: Vec3;
  radius: number;
  strength: number;
}

/**
 * Scatter blob lobes in a flattened ellipsoid cluster. This is the
 * "distribute points + set radius" front half of the Blender graph: a big
 * base blob plus smaller satellite lobes clustered toward the top so the
 * silhouette reads as a cauliflower cumulus with a flat base.
 */
function scatterBlobs(opts: Required<CloudOptions>): Blob[] {
  const rng = makeRng(opts.seed);
  const balls: Blob[] = [];
  const R = opts.size;

  // Central body: one dominant low blob gives the flat-bottomed mass.
  balls.push({ center: vec3(0, R * opts.flatten * 0.25, 0), radius: R * 0.72, strength: 1.15 });

  for (let i = 0; i < opts.blobs; i++) {
    // Bias lobes upward (bulge on top, flat on the bottom) and outward.
    const ang = rng.next() * Math.PI * 2;
    const rad = Math.sqrt(rng.next()) * R * 0.82;
    const up = rng.next();
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad * 0.85;
    // Height: mostly above the base, clamped so the underside stays flat.
    const y = R * opts.flatten * (0.1 + up * up * 0.95);
    // Smaller lobes toward the rim, chunkier near the core.
    const t = rad / (R * 0.82);
    const radius = R * (0.5 - t * 0.28) * (0.7 + rng.next() * 0.5);
    balls.push({ center: vec3(x, y, z), radius: Math.max(radius, R * 0.14), strength: 1 });
  }
  return balls;
}

/**
 * Displace the fused shell along its normals with layered fbm noise. Two
 * octaved layers at different scales reproduce the Blender graph's stacked
 * Noise Texture displacement (coarse billows + fine cauliflower detail). The
 * underside is damped so the cloud keeps its flat cumulus base.
 */
function puffDisplace(mesh: Mesh, opts: Required<CloudOptions>): Mesh {
  const coarse = makeNoise(opts.seed * 2 + 1);
  const fine = makeNoise(opts.seed * 2 + 7);
  const f = opts.puffScale;

  // bounds for underside damping
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of mesh.positions) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const span = maxY - minY || 1;

  const positions = mesh.positions.map((p, i) => {
    const n = mesh.normals[i] ?? vec3(0, 1, 0);
    // coarse billows only push outward (abs) so lobes bulge, not cave in
    const billow = Math.abs(fbm3(coarse, p.x * f, p.y * f, p.z * f, { octaves: 4, gain: 0.55 }));
    const detail = fbm3(fine, p.x * f * 3.1, p.y * f * 3.1, p.z * f * 3.1, { octaves: 5, gain: 0.5 });
    let d = billow * opts.puff + detail * opts.puff * 0.35;
    // damp the underside toward flat
    const yn = (p.y - minY) / span;
    const underside = Math.min(1, yn * 2.2);
    d *= 0.35 + underside * 0.65;
    return add(p, vscale(n, d));
  });

  return recomputeNormals({
    positions,
    normals: mesh.normals.map((n) => ({ ...n })),
    uvs: mesh.uvs.map((uv) => ({ ...uv })),
    indices: mesh.indices.slice(),
  });
}

/** Build the fused, smoothed, puff-displaced cloud mesh. */
export function buildCloudMesh(options: CloudOptions = {}): Mesh {
  const opts: Required<CloudOptions> = {
    seed: options.seed ?? 7,
    size: options.size ?? 3.2,
    blobs: options.blobs ?? 14,
    flatten: options.flatten ?? 0.55,
    resolution: options.resolution ?? 48,
    iso: options.iso ?? 0.5,
    smooth: options.smooth ?? 1,
    puff: options.puff ?? 0.18,
    puffScale: options.puffScale ?? 1.6,
  };

  const balls = scatterBlobs(opts);
  // PointsToVolume + VolumeToMesh: fuse blobs into one iso-surface shell.
  let mesh = metaballs(balls, { iso: opts.iso, resolution: opts.resolution });
  // SubdivisionSurface: smooth the marching-cubes facets.
  if (opts.smooth > 0) mesh = subdivide(mesh, opts.smooth);
  // Noise Texture displacement: cauliflower puff.
  mesh = puffDisplace(mesh, opts);
  return mesh;
}

/**
 * Build the cloud as a single named part with a soft, translucent "cloud"
 * surface (subsurface-like scattering read). Ready for the viewer / OBJ export.
 */
export function buildCloudParts(options: CloudOptions = {}): NamedPart[] {
  const mesh = buildCloudMesh(options);
  return [
    {
      name: "cloud",
      label: "积云",
      mesh,
      color: [0.96, 0.97, 1.0],
      surface: { type: "cloud", params: { color: [0.97, 0.98, 1.0] } },
    },
  ];
}

/** Named cloud shapes — distinct silhouettes from the same generator. */
export const CLOUD_PRESETS: Record<string, CloudOptions> = {
  // Fair-weather cumulus: rounded, flat-bottomed, medium puff.
  cumulus: { seed: 7, size: 3.2, blobs: 14, flatten: 0.55, puff: 0.18, puffScale: 1.6 },
  // Towering cumulus congestus: tall, cauliflower, strong puff.
  towering: { seed: 21, size: 2.8, blobs: 20, flatten: 0.95, puff: 0.24, puffScale: 2.0 },
  // Small fluffy cotton puff: few lobes, low resolution, soft.
  puffy: { seed: 3, size: 2.2, blobs: 7, flatten: 0.6, resolution: 40, puff: 0.16, puffScale: 1.4 },
  // Stratocumulus mat: wide, flat, low, gentle lumps.
  stratus: { seed: 42, size: 4.6, blobs: 18, flatten: 0.3, iso: 0.55, puff: 0.12, puffScale: 1.2 },
  // Wispy small cloud: tight, lumpy, high-frequency detail.
  wispy: { seed: 88, size: 2.4, blobs: 10, flatten: 0.7, iso: 0.42, puff: 0.22, puffScale: 2.6 },
};

/** Build one preset by name. Falls back to cumulus for unknown names. */
export function buildCloudPreset(name: string, override: CloudOptions = {}): NamedPart[] {
  const base = CLOUD_PRESETS[name] ?? CLOUD_PRESETS.cumulus!;
  return buildCloudParts({ ...base, ...override });
}

/**
 * A little sky of several clouds laid out on a rough grid at varying heights,
 * each a distinct preset. Returns one named part per cloud so the viewer can
 * list them. Deterministic: positions come from a seeded stream.
 */
export function buildCloudSkyParts(seed = 11): NamedPart[] {
  const rng = makeRng(seed);
  const layout: Array<{ preset: string; pos: Vec3; scale: number }> = [
    { preset: "towering", pos: vec3(-7, 1.2, -2), scale: 1.0 },
    { preset: "cumulus", pos: vec3(0, 0, 0), scale: 1.1 },
    { preset: "puffy", pos: vec3(6.5, 2.0, 1.5), scale: 0.9 },
    { preset: "stratus", pos: vec3(1, -2.8, -7), scale: 1.0 },
    { preset: "wispy", pos: vec3(-5, 3.2, 4), scale: 0.8 },
  ];
  const parts: NamedPart[] = [];
  for (let i = 0; i < layout.length; i++) {
    const item = layout[i]!;
    const jitter = vec3((rng.next() - 0.5) * 1.5, (rng.next() - 0.5) * 0.8, (rng.next() - 0.5) * 1.5);
    let mesh = buildCloudMesh({ ...CLOUD_PRESETS[item.preset], seed: (CLOUD_PRESETS[item.preset]?.seed ?? 0) + i });
    // scale then translate the lobe into its sky slot
    mesh = {
      positions: mesh.positions.map((p) => add(vscale(p, item.scale), add(item.pos, jitter))),
      normals: mesh.normals.map((n) => ({ ...n })),
      uvs: mesh.uvs.map((uv) => ({ ...uv })),
      indices: mesh.indices.slice(),
    };
    parts.push({
      name: `cloud_${item.preset}`,
      label: `${item.preset} 云`,
      mesh,
      color: [0.96, 0.97, 1.0],
      surface: { type: "cloud", params: { color: [0.97, 0.98, 1.0] } },
    });
  }
  return parts;
}

/** Rough quality read: total verts/tris across all cloud parts. */
export function scoreCloud(parts: NamedPart[]): { feedback: string } {
  if (parts.length === 0) return { feedback: "cloud: empty" };
  let verts = 0;
  let tris = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  let maxR = 0;
  for (const part of parts) {
    verts += part.mesh.positions.length;
    tris += part.mesh.indices.length / 3;
    for (const p of part.mesh.positions) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      const r = vlen(vec3(p.x, 0, p.z));
      if (r > maxR) maxR = r;
    }
  }
  return {
    feedback: `cloud: ${parts.length} part(s), ${verts} verts, ${tris} tris, height ${(maxY - minY).toFixed(2)}, radius ${maxR.toFixed(2)}`,
  };
}
