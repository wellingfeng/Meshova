/**
 * Wind weights — SpeedTree's per-vertex sway authority, ported.
 *
 * Wind in SpeedTree is a vertex-shader displacement, not a topology change:
 * each vertex carries a weight in [0,1] (root = 0, tip = 1) and the shader adds
 * sin(time + phase) * weight * strength. Here we COMPUTE the weights on the
 * mesh; the viewer's wind shader consumes them. This keeps the data fully
 * deterministic and the animation entirely on the GPU.
 *
 * Two contributions, combined:
 *  - height: normalized Y over the mesh bounds (tall things sway more at top)
 *  - radial: horizontal distance from the trunk axis (outer foliage sways more)
 */
import type { Mesh } from "../geometry/mesh.js";
import { bounds } from "../geometry/mesh.js";

export interface WindWeightOptions {
  /** Weight contribution from normalized height (0..1). Default 0.7. */
  heightInfluence?: number;
  /** Weight contribution from horizontal distance to the axis. Default 0.3. */
  radialInfluence?: number;
  /** Exponent applied to the height term (>1 keeps the base stiffer). Default 1.5. */
  heightExponent?: number;
  /** World X/Z of the trunk axis the radial term measures from. Default mesh center. */
  axis?: { x: number; z: number };
  /** Clamp the final weight to [0,1]. Default true. */
  clamp?: boolean;
}

export type WindKind = "wood" | "foliage" | "grass" | "frond";

export interface WindChannelOptions extends WindWeightOptions {
  /** Controls channel balance. */
  kind?: WindKind;
  /** Deterministic phase salt. */
  seed?: number;
}

export interface WindChannels {
  /** Slow whole-object bend, strongest near the top. */
  trunkBend: number[];
  /** Medium branch sway, stronger away from the trunk axis. */
  branchSway: number[];
  /** Fast small-detail flutter for leaf/frond/grass geometry. */
  leafFlutter: number[];
  /** Deterministic per-vertex phase in [0,1]. */
  phase: number[];
  /** Single packed weight for the current viewer shader. */
  combined: number[];
}

/**
 * Compute a per-vertex wind weight array (length = vertex count) for a mesh.
 * Anchored at the base (weight ~0), rising toward the top and outer edges.
 */
export function windWeights(mesh: Mesh, opts: WindWeightOptions = {}): number[] {
  const heightInfluence = opts.heightInfluence ?? 0.7;
  const radialInfluence = opts.radialInfluence ?? 0.3;
  const heightExponent = opts.heightExponent ?? 1.5;
  const clamp = opts.clamp ?? true;

  const bb = bounds(mesh);
  const minY = bb.min.y;
  const spanY = Math.max(1e-6, bb.max.y - bb.min.y);
  const ax = opts.axis?.x ?? (bb.min.x + bb.max.x) * 0.5;
  const az = opts.axis?.z ?? (bb.min.z + bb.max.z) * 0.5;
  const halfX = Math.max(1e-6, (bb.max.x - bb.min.x) * 0.5);
  const halfZ = Math.max(1e-6, (bb.max.z - bb.min.z) * 0.5);
  const radialNorm = Math.max(halfX, halfZ);

  const out = new Array<number>(mesh.positions.length);
  for (let i = 0; i < mesh.positions.length; i++) {
    const p = mesh.positions[i]!;
    const h = Math.pow((p.y - minY) / spanY, heightExponent);
    const dx = p.x - ax;
    const dz = p.z - az;
    const radial = Math.sqrt(dx * dx + dz * dz) / radialNorm;
    let w = heightInfluence * h + radialInfluence * radial;
    if (clamp) w = w < 0 ? 0 : w > 1 ? 1 : w;
    out[i] = w;
  }
  return out;
}

/**
 * Convenience: build a wind weight array that is uniformly high — for foliage
 * meshes (leaf cards, grass blades) that should all sway, regardless of their
 * Y position within the merged mesh.
 */
export function foliageWindWeights(mesh: Mesh, base = 0.6, jitter = 0.4): number[] {
  // Deterministic per-vertex variation from position hash (no RNG needed).
  const out = new Array<number>(mesh.positions.length);
  for (let i = 0; i < mesh.positions.length; i++) {
    const p = mesh.positions[i]!;
    const hash = Math.abs(Math.sin((p.x * 12.9898 + p.y * 78.233 + p.z * 37.719) * 43758.5453));
    const frac = hash - Math.floor(hash);
    out[i] = base + jitter * frac;
  }
  return out;
}

/**
 * Multi-channel wind data. SpeedTree-style runtime shaders usually separate
 * trunk bend, branch sway, leaf flutter, and phase. Meshova's viewer currently
 * consumes `combined`; advanced runtimes can use every channel.
 */
export function windChannels(mesh: Mesh, opts: WindChannelOptions = {}): WindChannels {
  const kind = opts.kind ?? "wood";
  const seed = opts.seed ?? 1;
  const bb = bounds(mesh);
  const minY = bb.min.y;
  const spanY = Math.max(1e-6, bb.max.y - bb.min.y);
  const ax = opts.axis?.x ?? (bb.min.x + bb.max.x) * 0.5;
  const az = opts.axis?.z ?? (bb.min.z + bb.max.z) * 0.5;
  const halfX = Math.max(1e-6, (bb.max.x - bb.min.x) * 0.5);
  const halfZ = Math.max(1e-6, (bb.max.z - bb.min.z) * 0.5);
  const radialNorm = Math.max(halfX, halfZ);

  const trunkBend: number[] = [];
  const branchSway: number[] = [];
  const leafFlutter: number[] = [];
  const phase: number[] = [];

  for (const p of mesh.positions) {
    const h = (p.y - minY) / spanY;
    const dx = p.x - ax;
    const dz = p.z - az;
    const radial = Math.min(1, Math.sqrt(dx * dx + dz * dz) / radialNorm);
    const ph = hash01(p.x * 12.9898 + p.y * 78.233 + p.z * 37.719 + seed * 0.137);

    if (kind === "wood") {
      trunkBend.push(clamp01(h * h));
      branchSway.push(clamp01(0.35 * h + 0.55 * radial));
      leafFlutter.push(0);
    } else if (kind === "grass") {
      trunkBend.push(0);
      branchSway.push(clamp01(0.2 + 0.8 * h));
      leafFlutter.push(clamp01(0.55 + 0.45 * ph));
    } else {
      trunkBend.push(clamp01(0.15 * h));
      branchSway.push(clamp01(0.35 + 0.45 * radial));
      leafFlutter.push(clamp01(0.65 + 0.35 * ph));
    }
    phase.push(ph);
  }

  const combined = combineWindChannels({ trunkBend, branchSway, leafFlutter }, {
    trunk: kind === "wood" ? 0.55 : 0.15,
    branch: kind === "wood" ? 0.45 : 0.35,
    leaf: kind === "wood" ? 0 : 0.5,
  });
  return { trunkBend, branchSway, leafFlutter, phase, combined };
}

export function combineWindChannels(
  channels: Pick<WindChannels, "trunkBend" | "branchSway" | "leafFlutter">,
  weights: { trunk?: number; branch?: number; leaf?: number } = {},
): number[] {
  const trunk = weights.trunk ?? 0.45;
  const branch = weights.branch ?? 0.35;
  const leaf = weights.leaf ?? 0.2;
  const n = Math.max(channels.trunkBend.length, channels.branchSway.length, channels.leafFlutter.length);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    out[i] = clamp01(
      trunk * (channels.trunkBend[i] ?? 0) +
      branch * (channels.branchSway[i] ?? 0) +
      leaf * (channels.leafFlutter[i] ?? 0),
    );
  }
  return out;
}

function hash01(v: number): number {
  const h = Math.sin(v) * 43758.5453123;
  return h - Math.floor(h);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
