/**
 * Mountain-village overworld — a reference-image reproduction.
 *
 * The look: a square, gently-rolling sandy plateau; a tangle of winding dirt
 * mountain roads that hug the terrain height (no elevated highways); a dense
 * central cluster of macaron-colored low-poly buildings; conifers scattered
 * around the settlement. Everything is placed by sampling the shared terrain
 * heightfield, so roads/buildings/trees all sit on the ground.
 *
 * Shared by examples/mountain-village.ts (CLI export) and web/procmodels.js
 * (live editor) so the browser and Node stay on one code path.
 */
import {
  buildTerrainField,
  heightfieldToTerrainMesh,
  polyline,
  smoothCurve,
  resampleCurve,
  roadRibbon,
  cloneField2D,
  box,
  cone,
  cylinder,
  translateMesh,
  rotateMesh,
  merge,
  makeNoise,
  makeRng,
  type NamedPart,
  type Curve,
  type Mesh,
} from "../index.js";
import { vec3 } from "../math/vec3.js";
import type { Field2D } from "../field/buffer.js";

export interface MountainVillageOptions {
  size?: number;
  resolution?: number;
  height?: number;
  noiseScale?: number;
  roads?: number;
  buildings?: number;
  trees?: number;
  seed?: number;
}

interface Grounder {
  size: number;
  half: number;
  W: number;
  H: number;
  field: Field2D;
  /** World XZ -> terrain height (world Y). */
  heightAt(wx: number, wz: number): number;
  /** World XZ -> grid cell (clamped, fractional). */
  gridAt(wx: number, wz: number): { gx: number; gy: number };
}

function makeGrounder(field: Field2D, size: number): Grounder {
  const W = field.width;
  const H = field.height;
  const half = size * 0.5;
  return {
    size,
    half,
    W,
    H,
    field,
    heightAt(wx: number, wz: number): number {
      const tx = (wx + half) / size;
      const ty = (wz + half) / size;
      const gx = Math.min(W - 1, Math.max(0, tx * (W - 1)));
      const gy = Math.min(H - 1, Math.max(0, ty * (H - 1)));
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const x1 = Math.min(W - 1, x0 + 1);
      const y1 = Math.min(H - 1, y0 + 1);
      const fx = gx - x0;
      const fy = gy - y0;
      const a = field.data[y0 * W + x0]!;
      const b = field.data[y0 * W + x1]!;
      const c = field.data[y1 * W + x0]!;
      const d = field.data[y1 * W + x1]!;
      const top = a + (b - a) * fx;
      const bot = c + (d - c) * fx;
      return top + (bot - top) * fy;
    },
    gridAt(wx: number, wz: number) {
      const tx = (wx + half) / size;
      const ty = (wz + half) / size;
      return {
        gx: Math.min(W - 1, Math.max(0, tx * (W - 1))),
        gy: Math.min(H - 1, Math.max(0, ty * (H - 1))),
      };
    },
  };
}

/**
 * Carve a road corridor into the heightfield: for every cell within `radius`
 * (world units) of a centerline point, blend the terrain height toward the
 * road's local height. This flattens a driveable track and its shoulders so
 * roads read as cut into the ground rather than draped over dunes. Mutates the
 * field in place (called before meshing).
 */
function carveCorridor(
  g: Grounder,
  pts: ReturnType<typeof vec3>[],
  radius: number,
  shoulder: number,
): void {
  const cellSize = g.size / (g.W - 1);
  const rCells = Math.ceil((radius + shoulder) / cellSize) + 1;
  const data = g.field.data;
  for (const p of pts) {
    const { gx, gy } = g.gridAt(p.x, p.z);
    const x0 = Math.max(0, Math.floor(gx) - rCells);
    const x1 = Math.min(g.W - 1, Math.ceil(gx) + rCells);
    const y0 = Math.max(0, Math.floor(gy) - rCells);
    const y1 = Math.min(g.H - 1, Math.ceil(gy) + rCells);
    // Road surface height at this point: sample current terrain (already draped).
    const roadY = p.y;
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        const wx = -g.half + (xx / (g.W - 1)) * g.size;
        const wz = -g.half + (yy / (g.H - 1)) * g.size;
        const dist = Math.hypot(wx - p.x, wz - p.z);
        if (dist > radius + shoulder) continue;
        // Full flatten inside `radius`, smooth falloff across the shoulder.
        const t = dist <= radius ? 1 : 1 - (dist - radius) / shoulder;
        const w = t * t * (3 - 2 * t); // smoothstep
        const idx = yy * g.W + xx;
        data[idx] = data[idx]! + (roadY - data[idx]!) * w;
      }
    }
  }
}
/**
 * A single winding road: a low-frequency wander across the plateau, resampled
 * and smoothed, then draped onto the terrain height with a small lift so the
 * ribbon reads as a dirt track carved into the ground.
 */
function throughRoad(
  g: Grounder,
  seed: number,
  axisAngle: number,
  lift: number,
): Curve {
  const rng = makeRng(seed);
  const noise = makeNoise(seed * 7 + 13);
  // A through-road runs from one plateau edge, past the village center, to the
  // far edge. Multiple through-roads at different angles cross near the center,
  // forming intersections and a connected web instead of a radial fan.
  const reach = g.half * 0.94;
  const dirX = Math.cos(axisAngle);
  const dirZ = Math.sin(axisAngle);
  // Perpendicular offset so not every road passes dead-center (some skirt it).
  const perp = rng.range(-0.28, 0.28) * g.half;
  const offX = -dirZ * perp;
  const offZ = dirX * perp;
  const steps = 40;
  const raw: ReturnType<typeof vec3>[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const along = (t * 2 - 1) * reach; // -reach .. +reach
    // Lateral wander via smooth noise so the road curls organically.
    const wander = noise.noise2(t * 2.6 + seed * 0.11, seed * 0.7) * g.half * 0.16;
    let px = dirX * along + offX - dirZ * wander;
    let pz = dirZ * along + offZ + dirX * wander;
    const m = g.half * 0.97;
    px = Math.max(-m, Math.min(m, px));
    pz = Math.max(-m, Math.min(m, pz));
    const y = g.heightAt(px, pz) + lift;
    raw.push(vec3(px, y, pz));
  }
  return smoothCurve(polyline(raw), 3);
}

/** Re-drape a smoothed curve onto the terrain so smoothing didn't lift it off. */
function drape(g: Grounder, curve: Curve, lift: number): Curve {
  return {
    closed: curve.closed,
    points: curve.points.map((p) => vec3(p.x, g.heightAt(p.x, p.z) + lift, p.z)),
  };
}

const ROAD_COLOR: [number, number, number] = [0.34, 0.28, 0.22]; // packed dirt track
const SAND_A: [number, number, number] = [0.83, 0.76, 0.58];
const SAND_B: [number, number, number] = [0.74, 0.66, 0.47];

// Muted, cohesive village palette — desaturated earthy tones so the cluster
// reads as one settlement instead of scattered candy blocks.
const BUILDING_COLORS: [number, number, number][] = [
  [0.9, 0.55, 0.52], // brick red
  [0.92, 0.79, 0.55], // ochre
  [0.72, 0.76, 0.66], // sage
  [0.62, 0.7, 0.79], // slate blue
  [0.87, 0.83, 0.74], // cream
];

// Roofs share one tone so the rooflines read as a unified settlement.
const ROOF_COLOR: [number, number, number] = [0.46, 0.31, 0.27];

const TRUNK_COLOR: [number, number, number] = [0.32, 0.22, 0.14];
const CONIFER_COLOR: [number, number, number] = [0.12, 0.34, 0.16];
/** Recolor terrain vertices as sand, darkening slightly with elevation. */
function sandColors(field: Field2D): number[] {
  let min = Infinity;
  let max = -Infinity;
  for (const v of field.data) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min || 1;
  const out: number[] = [];
  for (const v of field.data) {
    const t = (v - min) / span;
    // Higher ground reads a touch cooler/darker; low flats are pale sand.
    out.push(
      SAND_A[0] + (SAND_B[0] - SAND_A[0]) * t,
      SAND_A[1] + (SAND_B[1] - SAND_A[1]) * t,
      SAND_A[2] + (SAND_B[2] - SAND_A[2]) * t,
    );
  }
  return out;
}

/**
 * One low-poly building: a colored box body + a shared-tone pyramid roof,
 * rotated to face `yaw` (radians, around +Y) so it aligns with its road.
 * Returns body and roof separately so they can be bucketed into their own
 * color parts.
 */
function buildingMeshes(
  wx: number,
  wz: number,
  groundY: number,
  yaw: number,
  rng: ReturnType<typeof makeRng>,
): { body: Mesh; roof: Mesh } {
  const w = rng.range(0.34, 0.5);
  const d = rng.range(0.4, 0.62);
  const bodyH = rng.range(0.45, 0.95);
  const roofH = rng.range(0.16, 0.3);
  const body = translateMesh(
    rotateMesh(box(w, bodyH, d), vec3(0, yaw, 0)),
    vec3(wx, groundY + bodyH * 0.5, wz),
  );
  const roof = translateMesh(
    rotateMesh(cone(Math.max(w, d) * 0.7, roofH, 4, true), vec3(0, yaw + Math.PI / 4, 0)),
    vec3(wx, groundY + bodyH + roofH * 0.5, wz),
  );
  return { body, roof };
}

/** One conifer: brown trunk cylinder + green cone canopy. */
function coniferMeshes(
  g: Grounder,
  wx: number,
  wz: number,
  rng: ReturnType<typeof makeRng>,
): { trunk: Mesh; canopy: Mesh } {
  const trunkH = rng.range(0.12, 0.22);
  const trunkR = rng.range(0.02, 0.035);
  const canopyH = rng.range(0.35, 0.6);
  const canopyR = rng.range(0.14, 0.22);
  const y = g.heightAt(wx, wz);
  const trunk = translateMesh(cylinder(trunkR, trunkH, 6, true), vec3(wx, y + trunkH * 0.5, wz));
  const canopy = translateMesh(cone(canopyR, canopyH, 7, true), vec3(wx, y + trunkH + canopyH * 0.5, wz));
  return { trunk, canopy };
}

export function buildMountainVillageParts(options: MountainVillageOptions = {}): NamedPart[] {
  const size = options.size ?? 12;
  const resolution = Math.round(options.resolution ?? 128);
  const seed = Math.round(options.seed ?? 21);
  const roadCount = Math.max(0, Math.round(options.roads ?? 9));
  const buildingCount = Math.max(0, Math.round(options.buildings ?? 140));
  const treeCount = Math.max(0, Math.round(options.trees ?? 70));

  // 1. Gently-rolling sandy plateau. Low ridge strength + more erosion keeps it
  //    a broad landform instead of a single central bump.
  const terrain = buildTerrainField({
    size,
    resolution,
    seed,
    height: options.height ?? 1.5,
    noiseScale: options.noiseScale ?? 0.95,
    ridgeStrength: 0.35,
    islandFalloff: 0,
    iterations: 22,
    thermalStrength: 0.6,
    waterLevel: -1,
    shoreWidth: 0.01,
  });

  // Carve a small, soft central basin so only the village core + road hub sit
  // on level ground, leaving the rim hilly. Keeping the flat zone tight avoids
  // ironing the whole plateau into a flat sheet.
  const field = cloneField2D(terrain.height);
  {
    let sum = 0;
    for (const v of field.data) sum += v;
    const mean = sum / field.data.length;
    const W = field.width;
    const H = field.height;
    const target = mean - (options.height ?? 1.5) * 0.1; // gentle bowl
    for (let y = 0; y < H; y++) {
      const nz = (y / (H - 1)) * 2 - 1;
      for (let x = 0; x < W; x++) {
        const nx = (x / (W - 1)) * 2 - 1;
        const r = Math.hypot(nx, nz);
        // Flat only inside r<0.2; ramp back to natural terrain by r=0.48.
        const t = 1 - Math.min(1, Math.max(0, (r - 0.2) / 0.28));
        const flat = t * t * (3 - 2 * t); // smoothstep
        const idx = y * W + x;
        field.data[idx] = field.data[idx]! + (target - field.data[idx]!) * flat * 0.7;
      }
    }
  }

  const g = makeGrounder(field, size);
  const parts: NamedPart[] = [];

  // 2. Road network: through-roads crossing near the center form a connected
  //    web with intersections. Each is draped, then its corridor is carved flat
  //    into the heightfield (road bed) BEFORE meshing so roads sit cut-in.
  const roadLift = size * 0.004;
  const roadHalf = size * 0.03; // wider -> actually visible tracks
  const roadShoulder = roadHalf * 1.8;
  const roadCurves: Curve[] = [];
  for (let i = 0; i < roadCount; i++) {
    const axis = (i / Math.max(1, roadCount)) * Math.PI + (seed % 5) * 0.21;
    const curve = drape(g, throughRoad(g, seed * 31 + i * 101, axis, roadLift), roadLift);
    if (curve.points.length >= 2) roadCurves.push(curve);
  }
  for (const curve of roadCurves) {
    const dense = resampleCurve(curve, { segmentLength: roadHalf * 0.5 });
    carveCorridor(g, dense.points, roadHalf, roadShoulder);
  }

  // 3. Mesh the (carved) terrain and color it as sand.
  const terrainMesh = heightfieldToTerrainMesh(field, { size });
  parts.push({ name: "terrain", label: "沙地地形", mesh: terrainMesh, colors: sandColors(field) });

  // 4. Road ribbons on the re-draped (now flattened) centerlines.
  const roadMeshes: Mesh[] = [];
  for (const curve of roadCurves) {
    const draped = drape(g, curve, roadLift);
    const ribbon = roadRibbon(draped, {
      halfWidth: roadHalf,
      sampleDistance: size * 0.018,
      widthSubdivisions: 3,
      adaptiveCurvature: true,
      curvatureThresholdDeg: 8,
      verticalOffset: 0,
    });
    if (ribbon.positions.length > 0) roadMeshes.push(ribbon);
  }
  if (roadMeshes.length > 0) {
    parts.push({
      name: "roads",
      label: "道路",
      mesh: roadMeshes.length === 1 ? roadMeshes[0]! : merge(...roadMeshes),
      surface: { type: "stone", params: { color: ROAD_COLOR, roughness: 0.96, scale: 3 } },
      color: ROAD_COLOR,
    });
  }

  // 5. Buildings line the roads: walk each centerline, offset plots left/right,
  //    orient each to face the road. An occupancy grid enforces min spacing so
  //    nothing overlaps. Denser near center, sparser toward the rim.
  const brng = makeRng(seed * 17 + 3);
  const bodyBuckets: Mesh[][] = BUILDING_COLORS.map(() => []);
  const roofMeshes: Mesh[] = [];
  const occupancy = new Set<string>();
  const cellW = Math.max(0.45, roadHalf * 1.6);
  const claim = (wx: number, wz: number): boolean => {
    const key = `${Math.round(wx / cellW)},${Math.round(wz / cellW)}`;
    if (occupancy.has(key)) return false;
    occupancy.add(key);
    return true;
  };
  const setback = roadHalf + cellW * 0.55;
  let placed = 0;
  outer: for (const curve of roadCurves) {
    const dense = resampleCurve(curve, { segmentLength: cellW * 0.9 });
    const pts = dense.points;
    for (let i = 1; i < pts.length - 1; i++) {
      if (placed >= buildingCount) break outer;
      const prev = pts[i - 1]!;
      const next = pts[i + 1]!;
      const tx = next.x - prev.x;
      const tz = next.z - prev.z;
      const tlen = Math.hypot(tx, tz) || 1;
      const nx = -tz / tlen; // road normal
      const nz = tx / tlen;
      const yaw = Math.atan2(tx, tz);
      for (const side of [-1, 1] as const) {
        if (placed >= buildingCount) break outer;
        const centerDist = Math.hypot(pts[i]!.x, pts[i]!.z) / g.half;
        if (brng.next() > 1 - centerDist * 0.55) continue;
        const jitter = brng.range(0, cellW * 0.5);
        const wx = pts[i]!.x + nx * side * (setback + jitter);
        const wz = pts[i]!.z + nz * side * (setback + jitter);
        if (Math.abs(wx) > g.half * 0.95 || Math.abs(wz) > g.half * 0.95) continue;
        if (!claim(wx, wz)) continue;
        const groundY = g.heightAt(wx, wz);
        const { body, roof } = buildingMeshes(wx, wz, groundY, yaw, brng);
        const ci = brng.int(0, BUILDING_COLORS.length - 1);
        bodyBuckets[ci]!.push(body);
        roofMeshes.push(roof);
        placed++;
      }
    }
  }
  bodyBuckets.forEach((meshes, ci) => {
    if (meshes.length === 0) return;
    parts.push({
      name: `buildings_${ci}`,
      label: `建筑群 ${ci + 1}`,
      mesh: meshes.length === 1 ? meshes[0]! : merge(...meshes),
      color: BUILDING_COLORS[ci]!,
    });
  });
  if (roofMeshes.length > 0) {
    parts.push({
      name: "roofs",
      label: "屋顶",
      mesh: roofMeshes.length === 1 ? roofMeshes[0]! : merge(...roofMeshes),
      color: ROOF_COLOR,
    });
  }

  // 6. Conifers around the rim: dense outside, sparse in the built-up core, and
  //    kept off roads/buildings via the shared occupancy grid.
  const trng = makeRng(seed * 53 + 9);
  const trunks: Mesh[] = [];
  const canopies: Mesh[] = [];
  let treesPlaced = 0;
  const treeAttempts = treeCount * 6;
  for (let i = 0; i < treeAttempts && treesPlaced < treeCount; i++) {
    const r = Math.sqrt(0.2 + trng.next() * 0.8) * g.half * 0.95;
    const a = trng.next() * Math.PI * 2;
    const wx = Math.cos(a) * r;
    const wz = Math.sin(a) * r;
    if (!claim(wx, wz)) continue;
    const t = coniferMeshes(g, wx, wz, trng);
    trunks.push(t.trunk);
    canopies.push(t.canopy);
    treesPlaced++;
  }
  if (trunks.length > 0) {
    parts.push({
      name: "tree_trunks",
      label: "树干",
      mesh: trunks.length === 1 ? trunks[0]! : merge(...trunks),
      color: TRUNK_COLOR,
    });
    parts.push({
      name: "tree_canopies",
      label: "树冠",
      mesh: canopies.length === 1 ? canopies[0]! : merge(...canopies),
      color: CONIFER_COLOR,
    });
  }

  return parts;
}
