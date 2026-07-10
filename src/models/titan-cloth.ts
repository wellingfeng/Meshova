/**
 * Titan Cloth — reverse-engineered from "Tutorial_cloth_tool.hda" (project_titan).
 * The HDA is a Vellum cloth setup: a grid pinned at chosen corners/points, then
 * solved under gravity so it drapes and wrinkles. A true Vellum solve is
 * iterative and stateful, which breaks Meshova's determinism-per-frame model, so
 * we reproduce the *resting drape* analytically instead of simulating:
 *
 *   - a resampled grid of cloth vertices,
 *   - a smooth catenary-style sag between pinned anchors (each free vertex droops
 *     by a distance-weighted falloff from the nearest pins),
 *   - seeded fbm wrinkles layered on top so the fold pattern looks solved,
 *   - recomputed normals so lighting reads the folds.
 *
 * Same params + seed -> same drape (no per-step solve, fully deterministic).
 * Pin modes mirror the HDA's "Pin Corners / Pin Top Edge / Pin Center" presets.
 *
 * Run: pnpm tsx examples/titan-cloth.ts
 */
import { recomputeNormals, type Mesh, type NamedPart } from "../geometry/index.js";
import { vec3, sub, length } from "../math/vec3.js";
import type { Vec3 } from "../math/vec3.js";
import { vec2, type Vec2 } from "../math/vec2.js";
import { makeNoise, fbm2 } from "../random/index.js";

type RGB = [number, number, number];

const CLOTH: RGB = [0.65, 0.62, 0.55];

export type ClothPinMode = "corners" | "top-edge" | "center" | "two-corners";

export interface TitanClothParams {
  /** Random stream seed for the wrinkle field. Default 3. */
  seed: number;
  /** Cloth width (X) in metres. Default 4. */
  width: number;
  /** Cloth depth (Z) in metres. Default 4. */
  depth: number;
  /** Grid resolution per axis (verts = res+1). Default 40. */
  resolution: number;
  /** Which points are pinned (stay at rest height). Default "corners". */
  pinMode: ClothPinMode;
  /** Maximum sag depth at the least-supported point. Default 1.6. */
  sag: number;
  /** Wrinkle amplitude layered on the sag. Default 0.12. */
  wrinkle: number;
  /** Wrinkle spatial frequency. Default 3. */
  wrinkleScale: number;
  /** Rest height of the pinned points. Default 3. */
  restHeight: number;
}

export const TITAN_CLOTH_DEFAULTS: TitanClothParams = {
  seed: 3,
  width: 4,
  depth: 4,
  resolution: 40,
  pinMode: "corners",
  sag: 1.6,
  wrinkle: 0.12,
  wrinkleScale: 3,
  restHeight: 3,
};

/** Pinned anchor points in XZ for the chosen mode (used for sag falloff). */
function pinPoints(p: TitanClothParams): Vec3[] {
  const hw = p.width / 2;
  const hd = p.depth / 2;
  switch (p.pinMode) {
    case "top-edge":
      return [vec3(-hw, 0, -hd), vec3(0, 0, -hd), vec3(hw, 0, -hd)];
    case "center":
      return [vec3(0, 0, 0)];
    case "two-corners":
      return [vec3(-hw, 0, -hd), vec3(hw, 0, -hd)];
    case "corners":
    default:
      return [vec3(-hw, 0, -hd), vec3(hw, 0, -hd), vec3(-hw, 0, hd), vec3(hw, 0, hd)];
  }
}

/**
 * Build the draped cloth mesh. A grid where each vertex's Y = restHeight minus a
 * sag that grows with distance from the nearest pin, plus fbm wrinkles. Because
 * we build the grid by hand we also emit UVs and a CCW index list, then recompute
 * normals so the folds shade correctly.
 */
export function buildTitanClothMesh(params: Partial<TitanClothParams> = {}): Mesh {
  const p: TitanClothParams = { ...TITAN_CLOTH_DEFAULTS, ...params };
  const res = Math.max(2, Math.round(p.resolution));
  const pins = pinPoints(p);
  const noise = makeNoise(p.seed);
  const hw = p.width / 2;
  const hd = p.depth / 2;
  // Diagonal is the largest possible pin distance -> normalises sag to [0,1].
  const maxDist = Math.sqrt(p.width * p.width + p.depth * p.depth);

  const positions: Vec3[] = [];
  const uvs: Vec2[] = [];
  for (let iz = 0; iz <= res; iz++) {
    const tz = iz / res;
    const z = -hd + tz * p.depth;
    for (let ix = 0; ix <= res; ix++) {
      const tx = ix / res;
      const x = -hw + tx * p.width;
      const here = vec3(x, 0, z);
      // nearest-pin distance
      let nearest = Infinity;
      for (const pin of pins) {
        const d = length(sub(here, pin));
        if (d < nearest) nearest = d;
      }
      const t = Math.min(1, nearest / maxDist);
      // smootherstep falloff for a soft cloth belly
      const fall = t * t * (3 - 2 * t);
      const wrinkle = p.wrinkle * fbm2(noise, tx * p.wrinkleScale, tz * p.wrinkleScale, { octaves: 4 });
      const y = p.restHeight - p.sag * fall + wrinkle * fall;
      positions.push(vec3(x, y, z));
      uvs.push(vec2(tx, tz));
    }
  }

  const indices: number[] = [];
  const stride = res + 1;
  for (let iz = 0; iz < res; iz++) {
    for (let ix = 0; ix < res; ix++) {
      const a = iz * stride + ix;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      // two CCW triangles per quad (viewed from +Y)
      indices.push(a, c, b, b, c, d);
    }
  }

  const mesh: Mesh = {
    positions,
    normals: positions.map(() => vec3(0, 1, 0)),
    uvs,
    indices,
  };
  return recomputeNormals(mesh);
}

/** Build the Titan cloth as a single draped fabric part. */
export function buildTitanClothParts(params: Partial<TitanClothParams> = {}): NamedPart[] {
  const p: TitanClothParams = { ...TITAN_CLOTH_DEFAULTS, ...params };
  return [
    {
      name: "cloth",
      label: "布料",
      mesh: buildTitanClothMesh(p),
      color: CLOTH,
      surface: { type: "fabric", params: { color: CLOTH, roughness: 0.85, sheen: 0.4 } },
      metadata: { source: "Tutorial_cloth_tool.hda", pinMode: p.pinMode, note: "analytic drape (no Vellum solve)" },
    },
  ] as NamedPart[];
}
