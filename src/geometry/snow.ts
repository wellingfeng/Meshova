import { add, normalize, scale, vec3 } from "../math/vec3.js";
import { makeNoise } from "../random/noise.js";
import { blast } from "./blast.js";
import { solidify } from "./edit.js";
import { recomputeNormals, type Mesh } from "./mesh.js";

export interface SnowCoverOptions {
  /** Minimum geometric normal Y accepted as an accumulation surface. */
  normalThreshold?: number;
  /** Noise added to the normal test to break up the coverage boundary. */
  breakup?: number;
  /** World-space frequency of the boundary and surface noise. */
  noiseScale?: number;
  /** Snow shell thickness. */
  thickness?: number;
  /** Clearance above the source surface. */
  offset?: number;
  /** Small positive surface displacement for soft snow. */
  roughness?: number;
  seed?: number;
}

/**
 * Build a deterministic snow shell from upward-facing source triangles.
 * The source mesh stays unchanged; the result is a separate closed mesh.
 */
export function snowCover(mesh: Mesh, options: SnowCoverOptions = {}): Mesh {
  const threshold = Math.max(-1, Math.min(1, options.normalThreshold ?? 0.42));
  const breakup = Math.max(0, options.breakup ?? 0.18);
  const noiseScale = Math.max(0.001, options.noiseScale ?? 0.8);
  const thickness = Math.max(0.001, options.thickness ?? 0.08);
  const offset = Math.max(0, options.offset ?? 0.025);
  const roughness = Math.max(0, options.roughness ?? 0.025);
  const noise = makeNoise((options.seed ?? 0) >>> 0);

  const selected = blast(mesh, (face) => {
    const offset = face.index * 3;
    const normalA = mesh.normals[mesh.indices[offset]!] ?? face.normal;
    const normalB = mesh.normals[mesh.indices[offset + 1]!] ?? face.normal;
    const normalC = mesh.normals[mesh.indices[offset + 2]!] ?? face.normal;
    const surfaceNormal = normalize(add(add(normalA, normalB), normalC));
    const boundaryNoise = noise.noise3(
      face.center.x * noiseScale,
      face.center.y * noiseScale,
      face.center.z * noiseScale,
    );
    return surfaceNormal.y + boundaryNoise * breakup >= threshold;
  }, { keep: true, recompute: true });

  if (selected.indices.length === 0) return selected;

  const positions = selected.positions.map((position, index) => {
    const normal = selected.normals[index] ?? vec3(0, 1, 0);
    const surfaceNoise = noise.noise3(
      position.x * noiseScale * 1.7 + 31.7,
      position.y * noiseScale * 1.7 - 12.1,
      position.z * noiseScale * 1.7 + 7.3,
    );
    const lift = offset + roughness * (surfaceNoise * 0.5 + 0.5);
    return add(position, scale(normal, lift));
  });
  const lifted = recomputeNormals({
    positions,
    normals: selected.normals.slice(),
    uvs: selected.uvs.slice(),
    indices: selected.indices.slice(),
  });
  return solidify(lifted, { thickness, offset: 0 });
}
