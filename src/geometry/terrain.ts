/**
 * Terrain toolkit (P-terrain). A heightfield-first pipeline distilled from the
 * Houdini "Procedural Race Tracks" terrain HDA (fbm base -> stamps -> erosion ->
 * flatten under the track), reimplemented from scratch:
 *
 *   Heightfield  — a row-major Float32 grid with world size + resolution.
 *   fbmHeightfield — seed a base landscape from layered ridged/billow fbm.
 *   stampHeightfield — add radial "stamps" (mountains, craters, plateaus).
 *   thermalErode / hydraulicErode — iterative erosion that carves the grid.
 *   flattenUnderCurve — press the terrain flat along a track centreline.
 *   heightfieldToMesh — triangulate the grid into a Meshova mesh.
 *
 * All deterministic (seeded noise, fixed iteration order), immutable at the mesh
 * boundary. The grid itself is a mutable scratch buffer inside each op, but ops
 * return new Heightfields so the DSL stays side-effect-free.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3 } from "../math/vec3.js";
import { clamp, lerp } from "../math/scalar.js";
import { makeNoise, fbm2 } from "../random/noise.js";
import type { Mesh } from "./mesh.js";
import { computeNormals } from "./mesh.js";
import type { Curve } from "./curve.js";

/** Row-major heightfield: `height[y*cols + x]`, spanning [0,sizeX]x[0,sizeZ]. */
export interface Heightfield {
  readonly cols: number;
  readonly rows: number;
  readonly sizeX: number;
  readonly sizeZ: number;
  readonly height: Float32Array;
}

function makeHF(cols: number, rows: number, sizeX: number, sizeZ: number, height?: Float32Array): Heightfield {
  return { cols, rows, sizeX, sizeZ, height: height ?? new Float32Array(cols * rows) };
}

/** Clone a heightfield (ops copy-then-mutate so inputs stay immutable). */
function cloneHF(hf: Heightfield): Heightfield {
  return makeHF(hf.cols, hf.rows, hf.sizeX, hf.sizeZ, Float32Array.from(hf.height));
}

/** World XZ position of grid cell (x,y). */
function cellWorld(hf: Heightfield, x: number, y: number): { wx: number; wz: number } {
  const wx = (x / (hf.cols - 1)) * hf.sizeX - hf.sizeX / 2;
  const wz = (y / (hf.rows - 1)) * hf.sizeZ - hf.sizeZ / 2;
  return { wx, wz };
}

export interface FbmHeightfieldOptions {
  cols?: number;
  rows?: number;
  size?: number;
  seed?: number;
  /** Peak height of the base landscape. Default 20. */
  amplitude?: number;
  /** Noise feature scale (world units per feature). Larger = broader hills. */
  featureScale?: number;
  octaves?: number;
  /** 0 = smooth hills, 1 = ridged mountains (abs-fold the noise). Default 0.4. */
  ridged?: number;
}

/**
 * Seed a base landscape: sample fbm at each cell, optionally ridge-fold it for
 * sharp mountain crests. Output heights are in [~0, amplitude].
 */
export function fbmHeightfield(opts: FbmHeightfieldOptions = {}): Heightfield {
  const cols = Math.max(2, Math.floor(opts.cols ?? 128));
  const rows = Math.max(2, Math.floor(opts.rows ?? 128));
  const size = opts.size ?? 200;
  const amp = opts.amplitude ?? 20;
  const featureScale = opts.featureScale ?? 60;
  const octaves = Math.max(1, Math.floor(opts.octaves ?? 6));
  const ridged = clamp(opts.ridged ?? 0.4, 0, 1);
  const noise = makeNoise((opts.seed ?? 0) >>> 0);

  const hf = makeHF(cols, rows, size, size);
  const inv = 1 / featureScale;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const { wx, wz } = cellWorld(hf, x, y);
      const raw = fbm2(noise, wx * inv, wz * inv, { octaves });
      // Smooth branch: remap [-1,1]->[0,1]. Ridged branch: 1-|n| for crests.
      const smooth = 0.5 + 0.5 * raw;
      const ridge = 1 - Math.abs(raw);
      const h = lerp(smooth, ridge, ridged);
      hf.height[y * cols + x] = h * amp;
    }
  }
  return hf;
}


// ---------------------------------------------------------------------------
// Stamps — add radial features to the heightfield (mountains / craters / mesas).
// ---------------------------------------------------------------------------

export type StampShape = "cone" | "dome" | "crater" | "plateau";

export interface Stamp {
  /** World XZ centre. */
  x: number;
  z: number;
  /** World radius of influence. */
  radius: number;
  /** Peak height added (negative sinks / craters). */
  height: number;
  /** Falloff/profile. Default "dome". */
  shape?: StampShape;
}

/** Radial profile in [0,1] for normalized distance d in [0,1]. */
function stampProfile(shape: StampShape, d: number): number {
  const t = 1 - d; // 1 at centre, 0 at rim
  switch (shape) {
    case "cone":
      return t;
    case "dome":
      return t * t * (3 - 2 * t); // smoothstep bump
    case "plateau":
      // Flat top out to 60%, smooth shoulder to the rim.
      return d < 0.6 ? 1 : (1 - (d - 0.6) / 0.4) ** 2;
    case "crater": {
      // Raised rim + sunken bowl: peak near the rim, dip in the middle.
      const rim = Math.exp(-((d - 0.75) ** 2) / 0.02);
      const bowl = -Math.exp(-((d) ** 2) / 0.15);
      return rim + bowl;
    }
    default:
      return t;
  }
}

/**
 * Stamp radial features onto a copy of the heightfield. Stamps are applied in
 * array order (deterministic); each adds its profile*height within its radius.
 */
export function stampHeightfield(hf: Heightfield, stamps: ReadonlyArray<Stamp>): Heightfield {
  const out = cloneHF(hf);
  const { cols, rows } = out;
  for (const s of stamps) {
    const shape = s.shape ?? "dome";
    const r = Math.max(1e-3, s.radius);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const { wx, wz } = cellWorld(out, x, y);
        const dist = Math.hypot(wx - s.x, wz - s.z);
        if (dist > r) continue;
        const d = dist / r;
        out.height[y * cols + x]! += stampProfile(shape, d) * s.height;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Erosion — iterative carving. Thermal (talus slumping) + hydraulic (water).
// ---------------------------------------------------------------------------

export interface ThermalErosionOptions {
  /** Number of iterations. More = more slumping. Default 30. */
  iterations?: number;
  /**
   * Talus angle as a height difference threshold (per cell). Slopes steeper than
   * this shed material to lower neighbours. Default 1.2.
   */
  talus?: number;
  /** Fraction of the excess moved per iteration (0..0.5). Default 0.5. */
  strength?: number;
}

/**
 * Thermal erosion: material above the talus angle slumps to lower neighbours,
 * softening cliffs into scree slopes. 4-neighbour, deterministic sweep.
 */
export function thermalErode(hf: Heightfield, opts: ThermalErosionOptions = {}): Heightfield {
  const iterations = Math.max(0, Math.floor(opts.iterations ?? 30));
  const talus = opts.talus ?? 1.2;
  const strength = clamp(opts.strength ?? 0.5, 0, 0.5);
  const out = cloneHF(hf);
  const { cols, rows, height } = out;
  const delta = new Float32Array(cols * rows);
  const nx = [1, -1, 0, 0];
  const ny = [0, 0, 1, -1];

  for (let it = 0; it < iterations; it++) {
    delta.fill(0);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const h = height[i]!;
        let totalExcess = 0;
        const excess: number[] = [0, 0, 0, 0];
        for (let k = 0; k < 4; k++) {
          const ax = x + nx[k]!, ay = y + ny[k]!;
          if (ax < 0 || ay < 0 || ax >= cols || ay >= rows) continue;
          const diff = h - height[ay * cols + ax]!;
          if (diff > talus) {
            const e = diff - talus;
            excess[k] = e;
            totalExcess += e;
          }
        }
        if (totalExcess <= 0) continue;
        // Move a fraction of the max excess, distributed by each neighbour share.
        const move = strength * (totalExcess / 4);
        for (let k = 0; k < 4; k++) {
          if (excess[k]! <= 0) continue;
          const ax = x + nx[k]!, ay = y + ny[k]!;
          const share = (excess[k]! / totalExcess) * move;
          delta[i]! -= share;
          delta[ay * cols + ax]! += share;
        }
      }
    }
    for (let i = 0; i < height.length; i++) height[i]! += delta[i]!;
  }
  return out;
}


export interface HydraulicErosionOptions {
  /** Number of rain/flow/evaporate cycles. Default 40. */
  iterations?: number;
  /** Rain added per cell per cycle. Default 0.02. */
  rain?: number;
  /** Sediment capacity per unit of flow. Default 0.3. */
  capacity?: number;
  /** Fraction of capacity gap dissolved/deposited per cycle. Default 0.5. */
  solubility?: number;
  /** Fraction of water evaporated per cycle (0..1). Default 0.3. */
  evaporation?: number;
}

/**
 * Hydraulic erosion (virtual pipes, simplified): rain fills each cell, water
 * flows downhill carrying sediment, then evaporates depositing what it can't
 * hold. Carves valleys and gullies where flow concentrates. Deterministic.
 */
export function hydraulicErode(hf: Heightfield, opts: HydraulicErosionOptions = {}): Heightfield {
  const iterations = Math.max(0, Math.floor(opts.iterations ?? 40));
  const rain = opts.rain ?? 0.02;
  const capacity = opts.capacity ?? 0.3;
  const solubility = clamp(opts.solubility ?? 0.5, 0, 1);
  const evaporation = clamp(opts.evaporation ?? 0.3, 0, 1);
  const out = cloneHF(hf);
  const { cols, rows, height } = out;
  const water = new Float32Array(cols * rows);
  const sediment = new Float32Array(cols * rows);
  const nx = [1, -1, 0, 0];
  const ny = [0, 0, 1, -1];

  for (let it = 0; it < iterations; it++) {
    // 1. Rain.
    for (let i = 0; i < water.length; i++) water[i]! += rain;

    // 2. Flow: move water+sediment to the single lowest neighbour (by surface
    //    height = terrain + water). Deterministic steepest-descent routing.
    const dWater = new Float32Array(cols * rows);
    const dSed = new Float32Array(cols * rows);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const surf = height[i]! + water[i]!;
        let lowest = -1;
        let lowestSurf = surf;
        for (let k = 0; k < 4; k++) {
          const ax = x + nx[k]!, ay = y + ny[k]!;
          if (ax < 0 || ay < 0 || ax >= cols || ay >= rows) continue;
          const j = ay * cols + ax;
          const s = height[j]! + water[j]!;
          if (s < lowestSurf) { lowestSurf = s; lowest = j; }
        }
        if (lowest < 0) continue;
        // Move water limited by half the surface difference (stability).
        const move = Math.min(water[i]!, (surf - lowestSurf) * 0.5);
        if (move <= 0) continue;
        const carried = sediment[i]! * (move / Math.max(1e-6, water[i]!));
        dWater[i]! -= move; dWater[lowest]! += move;
        dSed[i]! -= carried; dSed[lowest]! += carried;
      }
    }
    for (let i = 0; i < water.length; i++) { water[i]! += dWater[i]!; sediment[i]! += dSed[i]!; }

    // 3. Erode/deposit against capacity, then evaporate.
    for (let i = 0; i < water.length; i++) {
      const cap = capacity * water[i]!;
      if (sediment[i]! < cap) {
        // Dissolve terrain into the water.
        const amt = solubility * (cap - sediment[i]!);
        height[i]! -= amt; sediment[i]! += amt;
      } else {
        // Deposit excess.
        const amt = solubility * (sediment[i]! - cap);
        height[i]! += amt; sediment[i]! -= amt;
      }
      water[i]! *= 1 - evaporation;
    }
  }
  // Any suspended sediment settles back onto the terrain.
  for (let i = 0; i < height.length; i++) height[i]! += sediment[i]!;
  return out;
}

// ---------------------------------------------------------------------------
// Track integration — press the terrain flat under a road centreline.
// ---------------------------------------------------------------------------

export interface FlattenUnderCurveOptions {
  /** Half-width flattened to the road level. Default 6. */
  width?: number;
  /** Extra blend distance beyond the flat band back to natural terrain. Default 8. */
  falloff?: number;
  /**
   * Vertical offset applied to the sampled road level (raise the pad slightly so
   * the road sits proud of the dirt). Default 0.
   */
  raise?: number;
}

/**
 * Flatten the terrain along a curve: within `width` the height is pulled to the
 * road level (sampled from the curve's own Y), then blended back over `falloff`.
 * This is how a track gets a buildable pad instead of clipping through hills.
 */
export function flattenUnderCurve(hf: Heightfield, curve: Curve, opts: FlattenUnderCurveOptions = {}): Heightfield {
  const width = opts.width ?? 6;
  const falloff = Math.max(1e-3, opts.falloff ?? 8);
  const raise = opts.raise ?? 0;
  const out = cloneHF(hf);
  const { cols, rows, height } = out;
  const pts = curve.points;
  if (pts.length < 2) return out;

  const segCount = curve.closed ? pts.length : pts.length - 1;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const { wx, wz } = cellWorld(out, x, y);
      // Nearest point on the polyline *segments* (not just vertices) in XZ, so
      // sparse control points still flatten the whole run. roadY interpolated.
      let best = Infinity;
      let roadY = 0;
      for (let s = 0; s < segCount; s++) {
        const a = pts[s]!;
        const b = pts[(s + 1) % pts.length]!;
        const abx = b.x - a.x, abz = b.z - a.z;
        const abLen2 = abx * abx + abz * abz;
        const t = abLen2 > 1e-9 ? clamp(((wx - a.x) * abx + (wz - a.z) * abz) / abLen2, 0, 1) : 0;
        const px = a.x + abx * t, pz = a.z + abz * t;
        const dx = wx - px, dz = wz - pz;
        const d = dx * dx + dz * dz;
        if (d < best) { best = d; roadY = a.y + (b.y - a.y) * t; }
      }
      const dist = Math.sqrt(best);
      const target = roadY + raise;
      const i = y * cols + x;
      if (dist <= width) {
        height[i] = target;
      } else if (dist <= width + falloff) {
        const t = (dist - width) / falloff; // 0 at band edge, 1 at natural
        const s = t * t * (3 - 2 * t); // smoothstep
        height[i] = lerp(target, height[i]!, s);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mesh conversion.
// ---------------------------------------------------------------------------

export interface HeightfieldMeshOptions {
  /** Cusp angle for normal computation. Default 60 (smooth terrain). */
  cusp?: number;
}

/** Triangulate a heightfield grid into a Meshova mesh (Y-up, centred at XZ 0). */
export function heightfieldToMesh(hf: Heightfield, opts: HeightfieldMeshOptions = {}): Mesh {
  const { cols, rows, height } = hf;
  const positions: Vec3[] = [];
  const uvs: { x: number; y: number }[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const { wx, wz } = cellWorld(hf, x, y);
      positions.push(vec3(wx, height[y * cols + x]!, wz));
      uvs.push({ x: x / (cols - 1), y: y / (rows - 1) });
    }
  }
  const indices: number[] = [];
  for (let y = 0; y < rows - 1; y++) {
    for (let x = 0; x < cols - 1; x++) {
      const a = y * cols + x;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      // CCW when viewed from +Y (front-facing up).
      indices.push(a, c, b, b, c, d);
    }
  }
  return computeNormals({ positions, normals: positions.map(() => vec3(0, 1, 0)), uvs, indices }, opts.cusp ?? 60);
}

/** Sample terrain height at a world XZ position (bilinear). Useful to sit props. */
export function sampleHeight(hf: Heightfield, wx: number, wz: number): number {
  const fx = clamp(((wx + hf.sizeX / 2) / hf.sizeX) * (hf.cols - 1), 0, hf.cols - 1);
  const fy = clamp(((wz + hf.sizeZ / 2) / hf.sizeZ) * (hf.rows - 1), 0, hf.rows - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(hf.cols - 1, x0 + 1), y1 = Math.min(hf.rows - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const h = hf.height;
  const h00 = h[y0 * hf.cols + x0]!, h10 = h[y0 * hf.cols + x1]!;
  const h01 = h[y1 * hf.cols + x0]!, h11 = h[y1 * hf.cols + x1]!;
  return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), ty);
}

/** Project every curve point onto the heightfield after smoothing/resampling. */
export function drapeCurveToHeightfield(hf: Heightfield, curve: Curve, offset = 0): Curve {
  return {
    closed: curve.closed,
    points: curve.points.map((point) => vec3(
      point.x,
      sampleHeight(hf, point.x, point.z) + offset,
      point.z,
    )),
  };
}
