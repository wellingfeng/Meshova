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
