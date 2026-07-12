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
  cloneField2D,
  box,
  cone,
  cylinder,
  translateMesh,
  rotateMesh,
  merge,
  makeMesh,
  makeNoise,
  makeRng,
  recomputeNormals,
  type NamedPart,
  type Curve,
  type Mesh,
} from "../index.js";
import { vec2 } from "../math/vec2.js";
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

const ROAD_COLOR: [number, number, number] = [0.5, 0.42, 0.31]; // compacted dirt track
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

const WINDOW_COLOR: [number, number, number] = [0.1, 0.15, 0.18];
const DOOR_COLOR: [number, number, number] = [0.28, 0.16, 0.09];
const STEP_COLOR: [number, number, number] = [0.54, 0.49, 0.41];
const CHIMNEY_COLOR: [number, number, number] = [0.38, 0.24, 0.2];
const TRUNK_COLOR: [number, number, number] = [0.32, 0.22, 0.14];
const CONIFER_COLOR: [number, number, number] = [0.12, 0.34, 0.16];

interface HouseSpec {
  width: number;
  depth: number;
  bodyHeight: number;
  roofHeight: number;
  detailSeed: number;
}

interface Footprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function sampleHouseSpec(rng: ReturnType<typeof makeRng>): HouseSpec {
  return {
    width: rng.range(0.42, 0.72),
    depth: rng.range(0.48, 0.82),
    bodyHeight: rng.range(0.5, 1.1),
    roofHeight: rng.range(0.18, 0.36),
    detailSeed: rng.int(0, 10_000),
  };
}

function rotatedFootprint(wx: number, wz: number, yaw: number, width: number, depth: number, pad = 0): Footprint {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const hx = width * 0.5;
  const hz = depth * 0.5;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const lx of [-hx, hx]) {
    for (const lz of [-hz, hz]) {
      const x = wx + c * lx + s * lz;
      const z = wz - s * lx + c * lz;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
}

function footprintGap(a: Footprint, b: Footprint): number {
  const dx = a.maxX < b.minX ? b.minX - a.maxX : b.maxX < a.minX ? a.minX - b.maxX : 0;
  const dz = a.maxZ < b.minZ ? b.minZ - a.maxZ : b.maxZ < a.minZ ? a.minZ - b.maxZ : 0;
  return Math.hypot(dx, dz);
}

function footprintHasPoint(fp: Footprint, p: ReturnType<typeof vec3>, pad: number): boolean {
  return p.x >= fp.minX - pad && p.x <= fp.maxX + pad && p.z >= fp.minZ - pad && p.z <= fp.maxZ + pad;
}

function footprintClear(fp: Footprint, occupied: Footprint[], minGap: number): boolean {
  return occupied.every((other) => footprintGap(fp, other) >= minGap);
}

function localToWorld(
  wx: number,
  wz: number,
  groundY: number,
  yaw: number,
  lx: number,
  ly: number,
  lz: number,
): ReturnType<typeof vec3> {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return vec3(wx + c * lx + s * lz, groundY + ly, wz - s * lx + c * lz);
}

function localBox(
  wx: number,
  wz: number,
  groundY: number,
  yaw: number,
  lx: number,
  ly: number,
  lz: number,
  width: number,
  height: number,
  depth: number,
): Mesh {
  return translateMesh(
    rotateMesh(box(width, height, depth), vec3(0, yaw, 0)),
    localToWorld(wx, wz, groundY, yaw, lx, ly, lz),
  );
}

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

function roadMaskMesh(
  g: Grounder,
  centers: ReturnType<typeof vec3>[],
  radius: number,
  lift: number,
): Mesh {
  if (centers.length === 0) return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  const cell = g.size / (g.W - 1);
  const testRadius = radius + cell * 0.15;
  const testRadiusSq = testRadius * testRadius;
  const positions: ReturnType<typeof vec3>[] = [];
  const normals: ReturnType<typeof vec3>[] = [];
  const uvs: ReturnType<typeof vec2>[] = [];
  const indices: number[] = [];
  const vertexMap = new Map<number, number>();

  const nearRoad = (wx: number, wz: number, extra = 0): boolean => {
    const rr = testRadiusSq + extra * extra + 2 * testRadius * extra;
    for (const p of centers) {
      const dx = wx - p.x;
      const dz = wz - p.z;
      if (dx * dx + dz * dz <= rr) return true;
    }
    return false;
  };

  const addVertex = (x: number, y: number): number => {
    const key = y * g.W + x;
    const existing = vertexMap.get(key);
    if (existing !== undefined) return existing;
    const tx = x / (g.W - 1);
    const ty = y / (g.H - 1);
    const wx = -g.half + tx * g.size;
    const wz = -g.half + ty * g.size;
    const out = positions.length;
    vertexMap.set(key, out);
    positions.push(vec3(wx, g.heightAt(wx, wz) + lift, wz));
    normals.push(vec3(0, 1, 0));
    uvs.push(vec2(wx * 0.22, wz * 0.22));
    return out;
  };

  for (let y = 0; y < g.H - 1; y++) {
    const z0 = -g.half + (y / (g.H - 1)) * g.size;
    const z1 = -g.half + ((y + 1) / (g.H - 1)) * g.size;
    for (let x = 0; x < g.W - 1; x++) {
      const x0 = -g.half + (x / (g.W - 1)) * g.size;
      const x1 = -g.half + ((x + 1) / (g.W - 1)) * g.size;
      const cx = (x0 + x1) * 0.5;
      const cz = (z0 + z1) * 0.5;
      if (
        !nearRoad(cx, cz, cell * 0.25) &&
        !nearRoad(x0, z0) &&
        !nearRoad(x1, z0) &&
        !nearRoad(x0, z1) &&
        !nearRoad(x1, z1)
      ) {
        continue;
      }
      const a = addVertex(x, y);
      const b = addVertex(x, y + 1);
      const c = addVertex(x + 1, y);
      const d = addVertex(x + 1, y + 1);
      indices.push(a, b, c, c, b, d);
    }
  }

  if (indices.length === 0) return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
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
  spec: HouseSpec,
): { body: Mesh; roof: Mesh; windows: Mesh[]; doors: Mesh[]; steps: Mesh[]; chimneys: Mesh[] } {
  const w = spec.width;
  const d = spec.depth;
  const bodyH = spec.bodyHeight;
  const roofH = spec.roofHeight;
  const body = translateMesh(
    rotateMesh(box(w, bodyH, d), vec3(0, yaw, 0)),
    vec3(wx, groundY + bodyH * 0.5, wz),
  );
  const roof = translateMesh(
    rotateMesh(cone(Math.max(w, d) * 0.7, roofH, 4, true), vec3(0, yaw + Math.PI / 4, 0)),
    vec3(wx, groundY + bodyH + roofH * 0.5, wz),
  );
  const windows: Mesh[] = [];
  const doors: Mesh[] = [];
  const steps: Mesh[] = [];
  const chimneys: Mesh[] = [];

  const winW = Math.max(0.075, Math.min(0.13, w * 0.22));
  const winH = Math.max(0.085, Math.min(0.17, bodyH * 0.22));
  const winY = Math.min(bodyH - winH * 0.8, bodyH * 0.68);
  const windowXs = w > 0.54 ? [-w * 0.23, w * 0.23] : [0];
  for (const x of windowXs) {
    windows.push(localBox(wx, wz, groundY, yaw, x, winY, d * 0.5 + 0.018, winW, winH, 0.028));
    if (spec.detailSeed % 3 !== 0) {
      windows.push(localBox(wx, wz, groundY, yaw, x, winY, -d * 0.5 - 0.018, winW, winH, 0.028));
    }
  }
  if (bodyH > 0.78) {
    const upperX = spec.detailSeed % 2 === 0 ? 0 : w * 0.18;
    windows.push(localBox(wx, wz, groundY, yaw, upperX, bodyH * 0.84, d * 0.5 + 0.018, winW * 0.85, winH * 0.85, 0.028));
  }

  const doorW = Math.max(0.12, Math.min(0.2, w * 0.34));
  const doorH = Math.max(0.26, Math.min(0.44, bodyH * 0.58));
  doors.push(localBox(wx, wz, groundY, yaw, 0, doorH * 0.5 + 0.015, d * 0.5 + 0.02, doorW, doorH, 0.035));
  steps.push(localBox(wx, wz, groundY, yaw, 0, 0.025, d * 0.5 + 0.13, doorW * 1.5, 0.05, 0.2));

  if (spec.detailSeed % 4 !== 1) {
    const chimneyH = Math.max(0.12, roofH * 0.85);
    const chimneyX = ((spec.detailSeed % 3) - 1) * w * 0.16;
    chimneys.push(localBox(wx, wz, groundY, yaw, chimneyX, bodyH + roofH * 0.55 + chimneyH * 0.5, -d * 0.12, 0.075, chimneyH, 0.075));
  }

  return { body, roof, windows, doors, steps, chimneys };
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
  const roadHalf = size * 0.022; // visible but leaves usable roadside parcels
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

  // 4. Road surface: build one terrain-following mask mesh instead of stacking
  //    separate ribbons. Crossings become one surface, so no z-fighting stripes.
  const roadPoints: ReturnType<typeof vec3>[] = [];
  for (const curve of roadCurves) {
    const draped = drape(g, curve, roadLift);
    const dense = resampleCurve(draped, { segmentLength: roadHalf * 0.45 });
    roadPoints.push(...dense.points);
  }
  const roadMesh = roadMaskMesh(g, roadPoints, roadHalf, size * 0.0006);
  if (roadMesh.positions.length > 0) {
    parts.push({
      name: "roads",
      label: "道路",
      mesh: roadMesh,
      surface: { type: "dirtRoad", params: { color: ROAD_COLOR, rutStrength: 0.03, normalStrength: 0.35, seed: seed + 141 } },
      color: ROAD_COLOR,
    });
  }
  const roadAvoidPoints = roadMesh.positions.length > 0 ? roadMesh.positions : roadPoints;

  // 5. Buildings line the roads: walk each centerline, offset plots left/right,
  //    orient each facade toward the road. Footprint checks use the full road
  //    network plus existing parcels, so houses leave readable alleys and never
  //    sit on top of a crossing road.
  const brng = makeRng(seed * 17 + 3);
  const bodyBuckets: Mesh[][] = BUILDING_COLORS.map(() => []);
  const roofMeshes: Mesh[] = [];
  const windowMeshes: Mesh[] = [];
  const doorMeshes: Mesh[] = [];
  const stepMeshes: Mesh[] = [];
  const chimneyMeshes: Mesh[] = [];
  const placedFootprints: Footprint[] = [];
  const occupancy = new Set<string>();
  const cellW = Math.max(0.48, roadHalf * 1.5);
  const claim = (wx: number, wz: number): boolean => {
    const key = `${Math.round(wx / cellW)},${Math.round(wz / cellW)}`;
    if (occupancy.has(key)) return false;
    occupancy.add(key);
    return true;
  };
  const plotSpacing = Math.max(size * 0.055, roadHalf * 1.8);
  let placed = 0;
  const placeHouse = (wx: number, wz: number, yaw: number, spec: HouseSpec, minGap: number): boolean => {
    const roadGap = Math.max(0.12, Math.min(0.18, minGap + 0.01));
    const fp = rotatedFootprint(wx, wz, yaw, spec.width, spec.depth, 0.012);
    if (fp.minX < -g.half * 0.96 || fp.maxX > g.half * 0.96 || fp.minZ < -g.half * 0.96 || fp.maxZ > g.half * 0.96) return false;
    if (roadAvoidPoints.some((p) => footprintHasPoint(fp, p, roadGap))) return false;
    if (!footprintClear(fp, placedFootprints, minGap)) return false;
    if (!claim(wx, wz)) return false;
    const groundY = g.heightAt(wx, wz);
    const { body, roof, windows, doors, steps, chimneys } = buildingMeshes(wx, wz, groundY, yaw, spec);
    const ci = brng.int(0, BUILDING_COLORS.length - 1);
    bodyBuckets[ci]!.push(body);
    roofMeshes.push(roof);
    windowMeshes.push(...windows);
    doorMeshes.push(...doors);
    stepMeshes.push(...steps);
    chimneyMeshes.push(...chimneys);
    placedFootprints.push(fp);
    return true;
  };
  outer: for (const curve of roadCurves) {
    const dense = resampleCurve(curve, { segmentLength: plotSpacing });
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
      for (const side of [-1, 1] as const) {
        if (placed >= buildingCount) break outer;
        const centerDist = Math.hypot(pts[i]!.x, pts[i]!.z) / g.half;
        if (brng.next() > 0.94 - centerDist * 0.12) continue;
        const spec = sampleHouseSpec(brng);
        const minGap = Math.max(0.14, Math.max(spec.width, spec.depth) * 0.2);
        const yaw = Math.atan2(-nx * side, -nz * side);
        const setback = roadHalf + spec.depth * 0.5 + minGap;
        const jitter = brng.range(0, plotSpacing * 0.32);
        const wx = pts[i]!.x + nx * side * (setback + jitter);
        const wz = pts[i]!.z + nz * side * (setback + jitter);
        if (placeHouse(wx, wz, yaw, spec, minGap)) placed++;
      }
    }
  }

  // Roadside placement can be sparse when many roads criss-cross the center.
  // Fill remaining open parcels inside the village envelope, still rejecting
  // any footprint that touches a road or another house.
  const targetBuildings = Math.min(buildingCount, Math.max(18, Math.round(size * size * 0.34)));
  const fillerAttempts = Math.max(220, targetBuildings * 80);
  for (let attempt = 0; placed < targetBuildings && attempt < fillerAttempts; attempt++) {
    const r = Math.sqrt(brng.next()) * g.half * 0.92;
    const a = brng.next() * Math.PI * 2;
    const wx = Math.cos(a) * r;
    const wz = Math.sin(a) * r;
    const spec = sampleHouseSpec(brng);
    const minGap = Math.max(0.14, Math.max(spec.width, spec.depth) * 0.2);
    const yaw = Math.atan2(-wx, -wz) + brng.range(-0.35, 0.35);
    if (placeHouse(wx, wz, yaw, spec, minGap)) placed++;
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
  if (windowMeshes.length > 0) {
    parts.push({
      name: "windows",
      label: "窗户",
      mesh: windowMeshes.length === 1 ? windowMeshes[0]! : merge(...windowMeshes),
      surface: { type: "glass", params: { tint: WINDOW_COLOR, roughness: 0.32 } },
      color: WINDOW_COLOR,
    });
  }
  if (doorMeshes.length > 0) {
    parts.push({
      name: "doors",
      label: "木门",
      mesh: doorMeshes.length === 1 ? doorMeshes[0]! : merge(...doorMeshes),
      surface: { type: "wood", params: { color: DOOR_COLOR, roughness: 0.88 } },
      color: DOOR_COLOR,
    });
  }
  if (stepMeshes.length > 0) {
    parts.push({
      name: "door_steps",
      label: "门阶",
      mesh: stepMeshes.length === 1 ? stepMeshes[0]! : merge(...stepMeshes),
      surface: { type: "stone", params: { color: STEP_COLOR, roughness: 0.95 } },
      color: STEP_COLOR,
    });
  }
  if (chimneyMeshes.length > 0) {
    parts.push({
      name: "chimneys",
      label: "烟囱",
      mesh: chimneyMeshes.length === 1 ? chimneyMeshes[0]! : merge(...chimneyMeshes),
      surface: { type: "stone", params: { color: CHIMNEY_COLOR, roughness: 0.9 } },
      color: CHIMNEY_COLOR,
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
    const treeFp = { minX: wx, maxX: wx, minZ: wz, maxZ: wz };
    if (roadAvoidPoints.some((p) => footprintHasPoint(treeFp, p, roadHalf * 0.9))) continue;
    if (!footprintClear(treeFp, placedFootprints, 0.28)) continue;
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
