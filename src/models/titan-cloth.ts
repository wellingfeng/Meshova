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
import { recomputeNormals, simulateCloth, type ClothCollider, type Mesh, type NamedPart } from "../geometry/index.js";
import { vec3, sub, length } from "../math/vec3.js";
import type { Vec3 } from "../math/vec3.js";
import { vec2, type Vec2 } from "../math/vec2.js";
import { makeNoise, fbm2 } from "../random/index.js";

type RGB = [number, number, number];

const CLOTH: RGB = [0.65, 0.62, 0.55];

export type ClothPinMode = "corners" | "top-edge" | "center" | "two-corners" | "none";

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
  /**
   * Run a real XPBD cloth solve instead of the analytic drape. The grid starts
   * flat at restHeight, is pinned per pinMode, then settles under gravity onto
   * an optional sphere/ground collider. Deterministic (fixed substeps, no
   * random). Default false to keep the cheap analytic path as the baseline.
   */
  physics: boolean;
  /** Physics: solver substeps. More = more settled + slower. Default 60. */
  simSteps: number;
  /** Physics: stiffness in [0,1] (silk≈0.6, canvas≈0.95). Default 0.9. */
  stiffness: number;
  /** Physics: radius of a sphere collider under the cloth (0 = none). Default 0. */
  colliderRadius: number;
  /** Physics: ground plane height the cloth may not sink below. Default 0. */
  groundY: number;
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
  physics: false,
  simSteps: 90,
  stiffness: 0.9,
  colliderRadius: 0,
  groundY: 0,
};

/** Pinned anchor points in XZ for the chosen mode (used for sag falloff). */
function pinPoints(p: TitanClothParams): Vec3[] {
  const hw = p.width / 2;
  const hd = p.depth / 2;
  switch (p.pinMode) {
    case "none":
      return []; // free-fall drape: no anchors, cloth rests on colliders alone
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
/** Is XZ point `here` within `tol` of any pinned anchor? Used to fix grid verts. */
function isPinned(here: Vec3, pins: ReadonlyArray<Vec3>, tol: number): boolean {
  for (const pin of pins) {
    if (length(sub(here, pin)) <= tol) return true;
  }
  return false;
}

/**
 * Physics path: build a flat grid at restHeight, pin the anchor verts, and run
 * a deterministic XPBD solve so the cloth actually falls, stretches and folds.
 * Pins snap to the nearest grid vertex so corners/edges stay fixed in the air.
 */
function buildTitanClothPhysics(p: TitanClothParams): Mesh {
  const res = Math.max(2, Math.round(p.resolution));
  const pins = pinPoints(p);
  const hw = p.width / 2;
  const hd = p.depth / 2;
  const cell = Math.min(p.width, p.depth) / res;
  const pinTol = cell * 0.75;

  const positions: Vec3[] = [];
  const uvs: Vec2[] = [];
  const pinned: boolean[] = [];
  for (let iz = 0; iz <= res; iz++) {
    const tz = iz / res;
    const z = -hd + tz * p.depth;
    for (let ix = 0; ix <= res; ix++) {
      const tx = ix / res;
      const x = -hw + tx * p.width;
      const here = vec3(x, 0, z);
      positions.push(vec3(x, p.restHeight, z));
      uvs.push(vec2(tx, tz));
      pinned.push(isPinned(here, pins, pinTol));
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
      indices.push(a, c, b, b, c, d);
    }
  }

  const flat: Mesh = { positions, normals: positions.map(() => vec3(0, 1, 0)), uvs, indices };

  const colliders: ClothCollider[] = [{ kind: "ground", y: p.groundY }];
  if (p.colliderRadius > 0) {
    // Rest the cloth over a sphere sitting on the ground, centered under the grid.
    colliders.push({ kind: "sphere", center: vec3(0, p.groundY + p.colliderRadius, 0), radius: p.colliderRadius });
  }

  return simulateCloth(flat, {
    iterations: Math.max(2, Math.round(p.simSteps)),
    passes: 10,
    gravity: 0.01,
    damping: 0.3,
    stretchStiffness: p.stiffness,
    bendStiffness: Math.max(0.05, p.stiffness * 0.4),
    colliders,
    collisionOffset: 0.01,
    maxStretch: 1.08,
    pin: (_pt, i) => pinned[i] === true,
  });
}

export function buildTitanClothMesh(params: Partial<TitanClothParams> = {}): Mesh {
  const p: TitanClothParams = { ...TITAN_CLOTH_DEFAULTS, ...params };
  if (p.physics) return buildTitanClothPhysics(p);
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
      metadata: {
        source: "Tutorial_cloth_tool.hda",
        pinMode: p.pinMode,
        supportAnchor: p.pinMode !== "none",
        note: p.physics ? "XPBD cloth solve (deterministic)" : "analytic drape (no solve)",
      },
    },
  ] as NamedPart[];
}
