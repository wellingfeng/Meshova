/**
 * Procedural architecture generator — the building category.
 *
 * Follows the standard Houdini procedural-building pipeline (see
 * doc/houdini-procedural-architecture.html): footprint -> floor mass ->
 * facade grid -> module placement (copy-to-points) -> roof -> ground-floor
 * detail. Everything is parameter + seed driven, so the same params always
 * yield the same building (Meshova's determinism invariant).
 *
 * The output is a NamedPart[] with matched surface materials (concrete walls,
 * glass windows, metal frames, tiled/concrete roof), built WITH the model so
 * material and shape stay aligned — never a baked mesh dump.
 */
import { vec2 } from "../math/vec2.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  box,
  cone,
  merge,
  makeMesh,
  computeNormals,
  bounds,
  triangleCount,
  transform,
  translateMesh,
  makePointCloud,
  copyToPoints,
  pointAttribute,
  type Mesh,
  type NamedPart,
  type PointCloud,
} from "../geometry/index.js";
import { buildWaterTowerParts } from "./water-tower.js";

type RGB = [number, number, number];

/** Roof style id. */
export type RoofType = "flat" | "hip" | "gable";

export interface BuildingParams {
  /** Number of stories above ground. */
  floors: number;
  /** Standard storey height. */
  floorHeight: number;
  /** Footprint width (X). */
  width: number;
  /** Footprint depth (Z). */
  depth: number;
  /** Window bays along the width (X sides). */
  baysX: number;
  /** Window bays along the depth (Z sides). */
  baysZ: number;
  /** Window-to-wall ratio per bay (0..1). */
  windowRatio: number;
  /** Per-storey horizontal setback (mass taper), 0 = straight tower. */
  setback: number;
  /** Extra height multiplier for the ground floor (lobby/retail). */
  groundFloorScale: number;
  /** Roof style. */
  roof: RoofType;
  /** Roof height (for hip/gable). */
  roofHeight: number;
  /** Corner pilasters (vertical edge columns). */
  corners: boolean;
  /** Add a balcony on the front facade every N floors (0 = none). */
  balconyEvery: number;
  /** Entrance canopy/awning over the ground-floor door. */
  canopy: boolean;
  /** Variant seed (window state, slight jitter). */
  seed: number;
}

export const BUILDING_DEFAULTS: BuildingParams = {
  floors: 6,
  floorHeight: 1.0,
  width: 4.0,
  depth: 3.0,
  baysX: 4,
  baysZ: 3,
  windowRatio: 0.62,
  setback: 0.0,
  groundFloorScale: 1.35,
  roof: "flat",
  roofHeight: 1.2,
  corners: true,
  balconyEvery: 0,
  canopy: true,
  seed: 7,
};

export interface BuildingQualityScore {
  /** Overall 0..1 (higher is better). */
  score: number;
  /** Per-criterion breakdown 0..1. */
  metrics: {
    requiredParts: number;
    roofCoverage: number;
    roofAttachment: number;
    facadeSemantics: number;
    proportions: number;
  };
  /** Human/LLM-readable critique to feed back into the agent loop. */
  feedback: string;
}

const WALL: RGB = [0.62, 0.6, 0.56];
const SLAB: RGB = [0.42, 0.41, 0.39];
const FRAME: RGB = [0.16, 0.17, 0.19];
const GLASS_TINT: RGB = [0.07, 0.11, 0.14];
const DOOR: RGB = [0.1, 0.11, 0.12];
const ROOF_COL: RGB = [0.3, 0.31, 0.33];
const PARAPET: RGB = [0.5, 0.49, 0.47];
const PILASTER: RGB = [0.54, 0.52, 0.49];
const RAIL: RGB = [0.2, 0.21, 0.23];
const PITCHED_ROOF_EAVE = 0.28;

/** One facade slot: world position of the bay centre + yaw to face outward. */
interface Slot {
  pos: Vec3;
  yaw: number;
}

/**
 * Build the parametric building as named parts. This is the public entry the
 * viewer registry and examples call.
 */
export function buildBuildingParts(
  params: Partial<BuildingParams> = {},
): NamedPart[] {
  const p: BuildingParams = { ...BUILDING_DEFAULTS, ...params };
  const floors = Math.max(1, Math.round(p.floors));
  const baysX = Math.max(1, Math.round(p.baysX));
  const baysZ = Math.max(1, Math.round(p.baysZ));
  const rng = makeRng(Math.round(p.seed) >>> 0);

  // --- per-floor mass + facade slots ---
  const walls: Mesh[] = [];
  const slabs: Mesh[] = [];
  const winSlots: Slot[] = [];
  const winLit: number[] = []; // 0 dark, 1 lit (variant)
  const balconies: Mesh[] = [];
  const rails: Mesh[] = [];
  // Independent RNG stream for balcony placement so it never perturbs the
  // window-lit sequence (keeps both deterministic and decoupled).
  const balconyRng = rng.fork();

  let y = 0;
  for (let i = 0; i < floors; i++) {
    const h = i === 0 ? p.floorHeight * p.groundFloorScale : p.floorHeight;
    const inset = i * p.setback;
    const w = Math.max(0.4, p.width - inset * 2);
    const d = Math.max(0.4, p.depth - inset * 2);
    const cy = y + h / 2;

    // Wall block for the storey (thin shell look comes from window proud-ness).
    walls.push(transform(box(w, h * 0.98, d), { translate: vec3(0, cy, 0) }));
    // Floor slab / cornice line: a slightly wider thin slab at the storey top.
    slabs.push(
      transform(box(w + 0.12, h * 0.06, d + 0.12), {
        translate: vec3(0, y + h, 0),
      }),
    );

    collectFacadeSlots(winSlots, winLit, rng, {
      width: w,
      depth: d,
      baysX,
      baysZ,
      centreY: cy,
      groundFloor: i === 0,
    });

    // Balcony on the front facade (+Z) every N floors, skip ground floor.
    if (p.balconyEvery > 0 && i > 0 && i % Math.round(p.balconyEvery) === 0) {
      addBalcony(balconies, rails, balconyRng, { width: w, depth: d, baseY: y, floorH: h });
    }

    y += h;
  }
  const totalH = y;

  // Base slab at ground.
  slabs.push(
    transform(box(p.width + 0.2, 0.12, p.depth + 0.2), {
      translate: vec3(0, 0.06, 0),
    }),
  );

  // --- corner pilasters: vertical columns at the four footprint edges ---
  const pilasters: Mesh[] = [];
  if (p.corners) {
    addCornerPilasters(pilasters, p, floors, totalH);
  }

  // --- window modules via copy-to-points (the Houdini装配 step) ---
  const winPc: PointCloud = makePointCloud({
    points: winSlots.map((s) => s.pos),
    attributes: {
      yaw: winSlots.map((s) => s.yaw),
      lit: winLit,
    },
  });

  const bw = p.windowRatio; // bay-relative width baked into module scale below
  const frameMesh = windowFrameMesh(bw);
  const glassDark = windowGlassMesh(bw, false);
  const glassLit = windowGlassMesh(bw, true);

  const placeOpts = {
    yaw: pointAttribute("yaw"),
    alignToNormal: false,
  } as const;

  const frames = copyToPoints(winPc, frameMesh, placeOpts);
  // Glass split into lit / dark by variant so two materials read honestly.
  const glass = copyToPoints(winPc, [glassDark, glassLit], {
    ...placeOpts,
    variant: pointAttribute("lit"),
  });

  // --- roof ---
  const topInset = (floors - 1) * p.setback;
  const topW = Math.max(0.4, p.width - topInset * 2);
  const topD = Math.max(0.4, p.depth - topInset * 2);
  const roofParts = buildRoof(p.roof, topW, topD, totalH, p.roofHeight);

  // --- ground-floor entrance door + optional canopy ---
  const doorH = p.floorHeight * p.groundFloorScale * 0.62;
  const door = transform(box(0.55, doorH, 0.08), {
    translate: vec3(0, doorH / 2 + 0.06, p.depth / 2 + 0.02),
  });

  const parts: NamedPart[] = [
    { name: "walls", mesh: merge(...walls), color: WALL, surface: { type: "concrete" } },
    { name: "slabs", mesh: merge(...slabs), color: SLAB, surface: { type: "concrete" } },
    { name: "window_frames", mesh: frames, color: FRAME, surface: { type: "metal", params: { color: FRAME, roughness: 0.45 } } },
    { name: "windows", mesh: glass, color: GLASS_TINT, surface: { type: "glass", params: { tint: GLASS_TINT, roughness: 0.05 } } },
    { name: "door", mesh: door, color: DOOR, surface: { type: "metal", params: { color: DOOR, roughness: 0.3 } } },
    ...roofParts,
  ];

  if (pilasters.length > 0) {
    parts.push({ name: "corner_pilasters", mesh: merge(...pilasters), color: PILASTER, surface: { type: "concrete" } });
  }
  if (balconies.length > 0) {
    parts.push({ name: "balcony_slabs", mesh: merge(...balconies), color: SLAB, surface: { type: "concrete" } });
    parts.push({ name: "balcony_rails", mesh: merge(...rails), color: RAIL, surface: { type: "metal", params: { color: RAIL, roughness: 0.4 } } });
  }
  if (p.canopy) {
    const canopyW = 1.1;
    const canopyProj = 0.7;
    const canopyY = doorH + 0.18;
    const zFront = p.depth / 2;
    const slabMesh = transform(box(canopyW, 0.08, canopyProj), {
      translate: vec3(0, canopyY, zFront + canopyProj / 2),
    });
    // Diagonal support brackets from the wall up to the canopy outer edge.
    const brackets: Mesh[] = [];
    const brLen = Math.hypot(canopyProj * 0.7, 0.28);
    const brAngle = Math.atan2(0.28, canopyProj * 0.7);
    for (const sx of [-1, 1] as const) {
      brackets.push(
        transform(box(0.05, 0.05, brLen), {
          rotate: vec3(brAngle, 0, 0),
          translate: vec3(sx * canopyW * 0.38, canopyY - 0.18, zFront + canopyProj * 0.36),
        }),
      );
    }
    const canopyMesh = merge(slabMesh, ...brackets);
    parts.push({ name: "canopy", mesh: canopyMesh, color: FRAME, surface: { type: "metal", params: { color: FRAME, roughness: 0.5 } } });
  }
  return parts;
}

/**
 * Deterministic scorer for one procedural building. It catches assembly-level
 * mistakes that raw mesh validity misses: missing semantic parts, roof smaller
 * than the top cornice, roof floating/sinking, wrong material categories and
 * implausible massing.
 */
export function scoreBuilding(parts: NamedPart[]): BuildingQualityScore {
  const byName = new Map(parts.map((p) => [p.name, p]));
  const has = (n: string) => byName.has(n);
  const roof = byName.get("roof");
  const slabs = byName.get("slabs");
  const parapet = byName.get("parapet");
  const walls = byName.get("walls");

  const requiredParts =
    (has("walls") ? 0.24 : 0) +
    (has("slabs") ? 0.16 : 0) +
    (has("roof") ? 0.2 : 0) +
    (has("windows") ? 0.2 : 0) +
    (has("door") ? 0.1 : 0) +
    (has("window_frames") ? 0.1 : 0);

  const roofAssembly = roof
    ? parapet ? merge(roof.mesh, parapet.mesh) : roof.mesh
    : undefined;
  const topCornice = slabs ? topHorizontalExtent(slabs.mesh) : undefined;
  const roofB = roofAssembly ? bounds(roofAssembly) : undefined;

  let roofCoverage = 0;
  if (topCornice && roofB) {
    const margin = Math.min(
      roofB.max.x - topCornice.maxX,
      topCornice.minX - roofB.min.x,
      roofB.max.z - topCornice.maxZ,
      topCornice.minZ - roofB.min.z,
    );
    roofCoverage = clamp01((margin + 0.04) / 0.18);
  }

  let roofAttachment = 0;
  if (topCornice && roofB) {
    const gap = roofB.min.y - topCornice.topY;
    roofAttachment = clamp01(1 - Math.abs(gap) / 0.22);
  }

  const windows = byName.get("windows");
  const frames = byName.get("window_frames");
  const wallMat = walls?.surface?.type === "concrete" ? 0.2 : 0;
  const windowMat = windows?.surface?.type === "glass" ? 0.3 : 0;
  const frameMat = frames?.surface?.type === "metal" ? 0.2 : 0;
  const roofMat = roof?.surface?.type === "ceramic" || roof?.surface?.type === "concrete" ? 0.3 : 0;
  const facadeSemantics = wallMat + windowMat + frameMat + roofMat;

  let proportions = 0;
  if (walls) {
    const b = bounds(walls.mesh);
    const dx = b.max.x - b.min.x;
    const dy = b.max.y - b.min.y;
    const dz = b.max.z - b.min.z;
    const footprint = Math.max(dx, dz);
    const heightRatio = footprint > 0 ? dy / footprint : 0;
    const depthRatio = dx > 0 ? dz / dx : 0;
    proportions = (
      rangeScore(heightRatio, 0.7, 4.5) * 0.65 +
      rangeScore(depthRatio, 0.35, 1.8) * 0.35
    );
  }

  const metrics = {
    requiredParts: clamp01(requiredParts),
    roofCoverage,
    roofAttachment,
    facadeSemantics: clamp01(facadeSemantics),
    proportions,
  };
  const score = clamp01(
    metrics.requiredParts * 0.25 +
      metrics.roofCoverage * 0.25 +
      metrics.roofAttachment * 0.15 +
      metrics.facadeSemantics * 0.2 +
      metrics.proportions * 0.15,
  );

  const tips: string[] = [];
  if (metrics.requiredParts < 1) tips.push("add required building parts: walls, slabs, windows, frames, door, roof");
  if (metrics.roofCoverage < 0.75) tips.push("roof must cover the top cornice/eave in X and Z");
  if (metrics.roofAttachment < 0.75) tips.push("roof base should contact the top slab, with no visible gap or deep sink");
  if (metrics.facadeSemantics < 1) tips.push("match surfaces: concrete walls/slabs, glass windows, metal frames, ceramic/concrete roof");
  if (metrics.proportions < 0.75) tips.push("adjust height/footprint proportions so the building mass reads plausibly");
  const feedback = tips.length
    ? `Score ${score.toFixed(2)}. To improve: ${tips.join("; ")}.`
    : `Score ${score.toFixed(2)}. Building quality gate passed.`;

  return { score, metrics, feedback };
}

export interface CityBlockParams {
  /** Buildings along X (street frontage). */
  cols: number;
  /** Buildings along Z (block depth). */
  rows: number;
  /** Lot size in X (building footprint + gap). */
  lotX: number;
  /** Lot size in Z. */
  lotZ: number;
  /** Min floors (random per building). */
  minFloors: number;
  /** Max floors (random per building). */
  maxFloors: number;
  /** Add a ground/street slab under the block. */
  ground: boolean;
  /** Add a central road + sidewalks; rows split front/back to line the street. */
  roads: boolean;
  /** Road carriageway width (asphalt). */
  roadWidth: number;
  /** Sidewalk width on each side of the road. */
  sidewalkWidth: number;
  /** Rotate each lot so its front (+Z) faces the adjacent street. */
  faceStreet: boolean;
  /** Master seed; each building derives a stable per-lot seed from it. */
  seed: number;
  /** Fraction (0..1) of flat-roof buildings that get a rooftop water tower. */
  waterTowers: number;
  /** Base params applied to every building (footprint, bays, features). */
  base?: Partial<BuildingParams>;
}

export const CITY_BLOCK_DEFAULTS: CityBlockParams = {
  cols: 4,
  rows: 2,
  lotX: 5.5,
  lotZ: 4.5,
  minFloors: 3,
  maxFloors: 12,
  ground: true,
  roads: true,
  roadWidth: 3.0,
  sidewalkWidth: 1.0,
  faceStreet: true,
  seed: 11,
  waterTowers: 0.4,
};

const GROUND_COL: RGB = [0.22, 0.22, 0.24];
const ROAD_COL: RGB = [0.07, 0.07, 0.08];
const SIDEWALK_COL: RGB = [0.4, 0.4, 0.42];
const ROADLINE_COL: RGB = [0.85, 0.82, 0.3];

/**
 * City block: a grid of procedural buildings, each a seeded variant of
 * buildBuildingParts. Parts are merged by name across buildings so the whole
 * block stays a small set of material groups (walls, windows, ...). This is
 * the Houdini "scatter buildings on a lot grid" step, kept deterministic: the
 * same master seed always yields the same street.
 */
export function buildCityBlockParts(
  params: Partial<CityBlockParams> = {},
): NamedPart[] {
  const p: CityBlockParams = { ...CITY_BLOCK_DEFAULTS, ...params };
  const cols = Math.max(1, Math.round(p.cols));
  const rows = Math.max(1, Math.round(p.rows));
  const minF = Math.max(1, Math.round(p.minFloors));
  const maxF = Math.max(minF, Math.round(p.maxFloors));
  const rng = makeRng(Math.round(p.seed) >>> 0);

  // Footprint defaults to ~80% of the lot so neighbours don't touch.
  const baseW = p.base?.width ?? Math.min(BUILDING_DEFAULTS.width, p.lotX * 0.78);
  const baseD = p.base?.depth ?? Math.min(BUILDING_DEFAULTS.depth, p.lotZ * 0.78);

  const groupOrder: string[] = [];
  const groups = new Map<string, { meshes: Mesh[]; color?: RGB; surface?: NamedPart["surface"] }>();

  // Rooftop water-tower accumulation (namespaced so all towers collapse into a
  // few material groups). Placed only on flat-roof lots, seeded per-lot.
  const towerGroups = new Map<string, { meshes: Mesh[]; color?: RGB; surface?: NamedPart["surface"] }>();
  const towerOrder: string[] = [];
  const towerFrac = Math.max(0, Math.min(1, p.waterTowers));
  const fh = p.base?.floorHeight ?? BUILDING_DEFAULTS.floorHeight;
  const gfs = p.base?.groundFloorScale ?? BUILDING_DEFAULTS.groundFloorScale;

  const x0 = -((cols - 1) * p.lotX) / 2;

  // Per-row Z position and yaw. With roads on, rows split into two bands that
  // line a central street; faceStreet rotates the far band 180° so every front
  // faces the road. Without roads, a plain centred grid.
  const corridor = p.roadWidth + 2 * p.sidewalkWidth;
  const useRoads = p.roads && rows >= 2;
  const rowZ: number[] = [];
  const rowYaw: number[] = [];
  if (useRoads) {
    const nFront = rows - Math.floor(rows / 2); // rows on the -Z band
    for (let r = 0; r < rows; r++) {
      if (r < nFront) {
        // front band on -Z, nearest-to-road row last
        const k = nFront - 1 - r;
        rowZ.push(-(corridor / 2) - p.lotZ / 2 - k * p.lotZ);
        rowYaw.push(0); // faces +Z toward the road
      } else {
        const j = r - nFront;
        rowZ.push(corridor / 2 + p.lotZ / 2 + j * p.lotZ);
        rowYaw.push(p.faceStreet ? Math.PI : 0); // faces -Z toward the road
      }
    }
  } else {
    const z0 = -((rows - 1) * p.lotZ) / 2;
    for (let r = 0; r < rows; r++) {
      const z = z0 + r * p.lotZ;
      rowZ.push(z);
      // faceStreet without roads: rows past centre turn to face the centreline
      rowYaw.push(p.faceStreet && z > 0 ? Math.PI : 0);
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lotRng = rng.fork();
      const floors = lotRng.int(minF, maxF);
      const roofPick = lotRng.int(0, 2);
      const roof: RoofType = roofPick === 0 ? "flat" : roofPick === 1 ? "hip" : "gable";
      const buildingSeed = lotRng.int(0, 9999);

      const parts = buildBuildingParts({
        width: baseW,
        depth: baseD,
        floors,
        roof,
        balconyEvery: lotRng.next() < 0.4 ? lotRng.int(2, 4) : 0,
        seed: buildingSeed,
        ...p.base,
      });

      const tx = x0 + c * p.lotX;
      const tz = rowZ[r]!;
      const yaw = rowYaw[r]!;

      for (const part of parts) {
        // rotate about lot origin (Y) then translate to the lot centre
        const placed = yaw !== 0
          ? translateMesh(transform(part.mesh, { rotate: vec3(0, yaw, 0) }), vec3(tx, 0, tz))
          : translateMesh(part.mesh, vec3(tx, 0, tz));
        let g = groups.get(part.name);
        if (!g) {
          g = { meshes: [] };
          if (part.color) g.color = part.color as RGB;
          if (part.surface) g.surface = part.surface;
          groups.set(part.name, g);
          groupOrder.push(part.name);
        }
        g.meshes.push(placed);
      }

      // Rooftop water tower: flat roofs only, seeded chance per lot. Placed on
      // the roof slab, offset into a back corner so it reads as service kit.
      if (roof === "flat" && towerFrac > 0 && lotRng.next() < towerFrac) {
        const totalH = fh * gfs + Math.max(0, floors - 1) * fh;
        const tRadius = Math.min(baseW, baseD) * 0.22;
        const tRng = lotRng.fork();
        const towerParts = buildWaterTowerParts({
          radius: tRadius,
          tankHeight: tRadius * 2.0,
          legHeight: tRadius * 1.4,
          staves: 20,
          hoops: 4,
          ladder: true,
          seed: tRng.int(0, 9999),
        });
        // Nudge toward a back corner of the roof, rotate by yaw with the lot.
        const ox = (tRng.next() - 0.5) * baseW * 0.35;
        const oz = -baseD * 0.22 + (tRng.next() - 0.5) * baseD * 0.2;
        for (const part of towerParts) {
          const lifted = translateMesh(part.mesh, vec3(ox, totalH + 0.06, oz));
          const placed = yaw !== 0
            ? translateMesh(transform(lifted, { rotate: vec3(0, yaw, 0) }), vec3(tx, 0, tz))
            : translateMesh(lifted, vec3(tx, 0, tz));
          const key = `tower_${part.name}`;
          let tg = towerGroups.get(key);
          if (!tg) {
            tg = { meshes: [] };
            if (part.color) tg.color = part.color as RGB;
            if (part.surface) tg.surface = part.surface;
            towerGroups.set(key, tg);
            towerOrder.push(key);
          }
          tg.meshes.push(placed);
        }
      }
    }
  }

  // Overall block extents (for ground/road sizing).
  const spanX = cols * p.lotX;
  const minZ = rowZ.length ? Math.min(...rowZ) - p.lotZ / 2 : -p.lotZ / 2;
  const maxZ = rowZ.length ? Math.max(...rowZ) + p.lotZ / 2 : p.lotZ / 2;
  const spanZ = maxZ - minZ;

  const out: NamedPart[] = [];
  if (p.ground) {
    out.push({
      name: "ground",
      mesh: transform(box(spanX + 2, 0.1, spanZ + 2), { translate: vec3(0, -0.05, (minZ + maxZ) / 2) }),
      color: GROUND_COL,
      surface: { type: "concrete" },
    });
  }
  if (useRoads) {
    out.push(...buildRoad(spanX + 2, p.roadWidth, p.sidewalkWidth, cols));
  }
  for (const name of groupOrder) {
    const g = groups.get(name)!;
    const merged = merge(...g.meshes);
    const part: NamedPart = { name, mesh: merged };
    if (g.color) part.color = g.color;
    if (g.surface) part.surface = g.surface;
    out.push(part);
  }
  for (const name of towerOrder) {
    const tg = towerGroups.get(name)!;
    const part: NamedPart = { name, label: "屋顶水塔", mesh: merge(...tg.meshes) };
    if (tg.color) part.color = tg.color;
    if (tg.surface) part.surface = tg.surface;
    out.push(part);
  }
  return out;
}

/**
 * Central street running along X at z=0: asphalt carriageway + two sidewalks +
 * a dashed centre line. Returns named parts with matched materials.
 */
function buildRoad(
  length: number,
  roadWidth: number,
  sidewalkWidth: number,
  cols: number,
): NamedPart[] {
  const parts: NamedPart[] = [];
  // asphalt carriageway (slightly above ground)
  parts.push({
    name: "road",
    mesh: transform(box(length, 0.06, roadWidth), { translate: vec3(0, 0.03, 0) }),
    color: ROAD_COL,
    surface: { type: "concrete", params: { color: ROAD_COL, roughness: 0.9 } },
  });
  // sidewalks on both sides, a touch higher (kerb)
  const swZ = roadWidth / 2 + sidewalkWidth / 2;
  const sidewalks: Mesh[] = [];
  for (const s of [-1, 1] as const) {
    sidewalks.push(transform(box(length, 0.12, sidewalkWidth), { translate: vec3(0, 0.06, s * swZ) }));
  }
  parts.push({ name: "sidewalks", mesh: merge(...sidewalks), color: SIDEWALK_COL, surface: { type: "concrete" } });
  // dashed centre line
  const dashes: Mesh[] = [];
  const nDash = Math.max(4, cols * 3);
  const dashLen = (length / nDash) * 0.5;
  for (let i = 0; i < nDash; i++) {
    const x = -length / 2 + (length / nDash) * (i + 0.5);
    dashes.push(transform(box(dashLen, 0.02, 0.1), { translate: vec3(x, 0.07, 0) }));
  }
  parts.push({ name: "road_lines", mesh: merge(...dashes), color: ROADLINE_COL, surface: { type: "plastic", params: { color: ROADLINE_COL, roughness: 0.6 } } });
  return parts;
}

export interface CityBlockScore {
  /** Overall 0..1 (higher is better). */
  score: number;
  /** Per-criterion breakdown 0..1. */
  metrics: {
    buildings: number;
    streetFurniture: number;
    heightVariety: number;
    footprintCoverage: number;
  };
  /** Human/LLM-readable critique to feed back into the agent loop. */
  feedback: string;
}

/**
 * Deterministic scorer for a generated city-block scene (NamedPart[]). This is
 * the geometry-side feedback signal the closed loop uses to judge "is this a
 * believable street block?" without a human. It is intentionally cheap and
 * pure (no rendering): it inspects part names, bounds and triangle counts.
 *
 * Criteria (weighted):
 *  - buildings:        has wall/window mass, enough of it for a block
 *  - streetFurniture:  has road + sidewalks + centre line
 *  - heightVariety:    the silhouette is not a flat slab (varied roofline)
 *  - footprintCoverage: buildings fill a reasonable share of the ground plane
 */
export function scoreCityBlock(parts: NamedPart[]): CityBlockScore {
  const byName = new Map(parts.map((p) => [p.name, p]));
  const has = (n: string) => byName.has(n);

  const walls = byName.get("walls");
  const windows = byName.get("windows");
  const ground = byName.get("ground");

  // buildings: presence + enough triangles to be more than one box
  const wallTris = walls ? triangleCount(walls.mesh) : 0;
  const buildings = walls && windows
    ? clamp01(0.4 + Math.min(1, wallTris / 400) * 0.6)
    : walls
      ? 0.3
      : 0;

  // street furniture: road + sidewalks + lines
  const furn =
    (has("road") ? 0.5 : 0) +
    (has("sidewalks") ? 0.3 : 0) +
    (has("road_lines") ? 0.2 : 0);

  // height variety: roofline span vs mean height -> reward varied skylines
  let heightVariety = 0;
  if (walls) {
    const bb = bounds(walls.mesh);
    const span = bb.max.y - bb.min.y;
    heightVariety = clamp01((span - 2) / 12); // taller spread -> higher, saturates
  }

  // footprint coverage: building bbox area vs ground bbox area
  let footprintCoverage = 0.5;
  if (walls && ground) {
    const wb = bounds(walls.mesh);
    const gb = bounds(ground.mesh);
    const wArea = (wb.max.x - wb.min.x) * (wb.max.z - wb.min.z);
    const gArea = (gb.max.x - gb.min.x) * (gb.max.z - gb.min.z);
    const ratio = gArea > 0 ? wArea / gArea : 0;
    // ideal coverage ~0.35..0.7; penalise empty or fully packed blocks
    footprintCoverage = clamp01(1 - Math.abs(ratio - 0.5) / 0.5);
  }

  const metrics = { buildings, streetFurniture: clamp01(furn), heightVariety, footprintCoverage };
  const score = clamp01(
    metrics.buildings * 0.4 +
      metrics.streetFurniture * 0.3 +
      metrics.heightVariety * 0.2 +
      metrics.footprintCoverage * 0.1,
  );

  const tips: string[] = [];
  if (metrics.buildings < 0.6) tips.push("add more building mass (walls + windows) so it reads as a block, not a single house");
  if (metrics.streetFurniture < 1) tips.push("include a road, sidewalks and a centre line (enable roads with rows>=2)");
  if (metrics.heightVariety < 0.4) tips.push("vary building heights for a less flat skyline (wider minFloors..maxFloors)");
  if (metrics.footprintCoverage < 0.5) tips.push("adjust lot/footprint so buildings cover a believable share of the ground");
  const feedback = tips.length
    ? `Score ${score.toFixed(2)}. To improve: ${tips.join("; ")}.`
    : `Score ${score.toFixed(2)}. Looks like a believable street block.`;

  return { score, metrics, feedback };
}

interface HorizontalExtent {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  topY: number;
}

function topHorizontalExtent(mesh: Mesh, band = 0.14): HorizontalExtent | undefined {
  if (mesh.positions.length === 0) return undefined;
  const b = bounds(mesh);
  const minY = b.max.y - band;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let count = 0;

  for (const p of mesh.positions) {
    if (p.y < minY) continue;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
    count++;
  }

  return count > 0 ? { minX, maxX, minZ, maxZ, topY: b.max.y } : undefined;
}

function rangeScore(v: number, min: number, max: number): number {
  if (!Number.isFinite(v) || max <= min) return 0;
  if (v >= min && v <= max) return 1;
  const span = max - min;
  return v < min ? clamp01(1 - (min - v) / span) : clamp01(1 - (v - max) / span);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

interface FacadeOptions {
  width: number;
  depth: number;
  baysX: number;
  baysZ: number;
  centreY: number;
  groundFloor: boolean;
}

/**
 * Lay window bay centres on all four walls and push their world position +
 * outward yaw. Ground floor leaves the central front bay empty for the door.
 * Window "lit" variant is seeded so it's deterministic.
 */
function collectFacadeSlots(
  slots: Slot[],
  lit: number[],
  rng: { next(): number },
  o: FacadeOptions,
): void {
  const hw = o.width / 2;
  const hd = o.depth / 2;
  const proud = 0.04; // push glass/frame slightly out of the wall plane

  // Front (+Z) and back (-Z): bays along X.
  for (let side = 0; side < 2; side++) {
    const z = side === 0 ? hd + proud : -hd - proud;
    const yaw = side === 0 ? 0 : Math.PI;
    const doorBay = o.groundFloor && side === 0 ? Math.floor(o.baysX / 2) : -1;
    for (let b = 0; b < o.baysX; b++) {
      if (b === doorBay) continue;
      const x = bayCentre(b, o.baysX, o.width);
      slots.push({ pos: vec3(x, o.centreY, z), yaw });
      lit.push(rng.next() < 0.42 ? 1 : 0);
    }
  }

  // Left (-X) and right (+X): bays along Z.
  for (let side = 0; side < 2; side++) {
    const x = side === 0 ? hw + proud : -hw - proud;
    const yaw = side === 0 ? Math.PI / 2 : -Math.PI / 2;
    for (let b = 0; b < o.baysZ; b++) {
      const z = bayCentre(b, o.baysZ, o.depth);
      slots.push({ pos: vec3(x, o.centreY, z), yaw });
      lit.push(rng.next() < 0.42 ? 1 : 0);
    }
  }
}

/** Centre coordinate of bay `b` of `n` across a span, evenly distributed. */
function bayCentre(b: number, n: number, span: number): number {
  const step = span / n;
  return -span / 2 + step * (b + 0.5);
}

/**
 * Vertical pilasters at the four footprint corners, running the full height.
 * Tapered with the same setback as the mass so they hug the corner edges.
 * This is the Houdini "corner module" — corners read crisp instead of bare.
 */
function addCornerPilasters(
  out: Mesh[],
  p: BuildingParams,
  floors: number,
  totalH: number,
): void {
  const t = 0.18; // pilaster cross-section
  const baseY = 0.12;
  const height = Math.max(0.01, totalH - baseY);
  // Use the average half-extent so a tapered tower still gets centred columns.
  const baseHw = p.width / 2;
  const baseHd = p.depth / 2;
  const topInset = (floors - 1) * p.setback;
  const topHw = Math.max(0.2, (p.width - topInset * 2) / 2);
  const topHd = Math.max(0.2, (p.depth - topInset * 2) / 2);
  const hw = (baseHw + topHw) / 2;
  const hd = (baseHd + topHd) / 2;
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      out.push(
        transform(box(t, height, t), {
          translate: vec3(sx * hw, baseY + height / 2, sz * hd),
        }),
      );
    }
  }
}

interface BalconyOptions {
  width: number;
  depth: number;
  baseY: number;
  floorH: number;
}

/**
 * A cantilevered balcony slab on the front facade (+Z) with a railing
 * (top/side rails, corner posts, vertical balusters). Width and lateral offset
 * are seeded so balconies vary per floor while staying deterministic.
 */
function addBalcony(
  slabs: Mesh[],
  rails: Mesh[],
  rng: { range(a: number, b: number): number },
  o: BalconyOptions,
): void {
  const maxBw = Math.min(o.width * 0.9, o.width - 0.3);
  // Seeded width (60%..100% of max) and lateral offset within the facade.
  const bw = maxBw * rng.range(0.6, 1.0);
  const slack = (o.width - bw) / 2 - 0.1;
  const cx = slack > 0 ? rng.range(-slack, slack) : 0;
  const proj = rng.range(0.42, 0.6);
  const z0 = o.depth / 2;
  const y0 = o.baseY; // floor level of this storey
  const railH = 0.42;
  const railBase = y0 + 0.085;
  const railTop = railBase + railH;
  const zMid = z0 + proj / 2;
  const zOuter = z0 + proj;
  const hbw = bw / 2;

  // slab
  slabs.push(
    transform(box(bw, 0.08, proj), {
      translate: vec3(cx, y0 + 0.04, zMid),
    }),
  );
  // top rail along the outer edge + two sides
  rails.push(transform(box(bw, 0.05, 0.05), { translate: vec3(cx, railTop, zOuter) }));
  rails.push(transform(box(0.05, 0.05, proj), { translate: vec3(cx - hbw, railTop, zMid) }));
  rails.push(transform(box(0.05, 0.05, proj), { translate: vec3(cx + hbw, railTop, zMid) }));
  // posts at the outer corners
  for (const sx of [-1, 1] as const) {
    rails.push(transform(box(0.05, railH, 0.05), { translate: vec3(cx + sx * hbw, railBase + railH / 2, zOuter) }));
  }
  // vertical balusters along the outer edge (evenly spaced)
  const nbal = Math.max(2, Math.round(bw / 0.18));
  for (let b = 0; b <= nbal; b++) {
    const x = cx - hbw + (bw * b) / nbal;
    rails.push(transform(box(0.025, railH, 0.025), { translate: vec3(x, railBase + railH / 2, zOuter) }));
  }
}

/**
 * Window frame module: a thin rectangular ring built from 4 boxes, in the XY
 * plane facing +Z (yaw rotates it to each wall). `ratio` scales the opening.
 */
function windowFrameMesh(ratio: number): Mesh {
  const w = 0.5 * Math.min(1, Math.max(0.2, ratio));
  const h = 0.62 * Math.min(1, Math.max(0.2, ratio));
  const t = 0.05; // frame thickness
  const dz = 0.03;
  const sideH = h + t;
  const bars = [
    transform(box(w + t, t, 0.06), { translate: vec3(0, h / 2, dz) }), // top
    transform(box(w + t, t, 0.06), { translate: vec3(0, -h / 2, dz) }), // bottom
    transform(box(t, sideH, 0.06), { translate: vec3(-w / 2, 0, dz) }), // left
    transform(box(t, sideH, 0.06), { translate: vec3(w / 2, 0, dz) }), // right
    // vertical centre mullion (two-pane look)
    transform(box(t * 0.6, h, 0.05), { translate: vec3(0, 0, dz) }),
    // window sill: a thin ledge projecting below the opening
    transform(box(w + t * 2.2, 0.045, 0.12), { translate: vec3(0, -h / 2 - t * 0.5, dz + 0.04) }),
  ];
  return merge(...bars);
}

/** Glass pane filling a window opening, in the XY plane facing +Z. */
function windowGlassMesh(ratio: number, _lit: boolean): Mesh {
  const w = 0.5 * Math.min(1, Math.max(0.2, ratio));
  const h = 0.62 * Math.min(1, Math.max(0.2, ratio));
  const frameInset = 0.05;
  return transform(box(w - frameInset, h - frameInset, 0.012), {
    translate: vec3(0, 0, 0.018),
  });
}

/**
 * Build the roof parts for a given style at the top of the mass.
 *  - flat: parapet ring + roof slab
 *  - hip:  4-sided pyramid (cone with 4 segments)
 *  - gable: a ridged prism with real gable ends
 */
function buildRoof(
  type: RoofType,
  w: number,
  d: number,
  topY: number,
  roofH: number,
): NamedPart[] {
  if (type === "flat") {
    const slabHeight = 0.1;
    const slab = transform(box(w + 0.08, 0.1, d + 0.08), {
      translate: vec3(0, topY + slabHeight / 2, 0),
    });
    const parapet = parapetRing(w, d, topY + slabHeight, 0.32);
    return [
      { name: "roof", mesh: slab, color: ROOF_COL, surface: { type: "concrete" } },
      { name: "parapet", mesh: parapet, color: PARAPET, surface: { type: "concrete" } },
    ];
  }

  if (type === "hip") {
    // 4-sided pyramid: a cone with 4 segments, rotated 45deg to align faces.
    const roofW = w + PITCHED_ROOF_EAVE * 2;
    const roofD = d + PITCHED_ROOF_EAVE * 2;
    const r = Math.hypot(roofW, roofD) / 2;
    const pyr = transform(cone(r * 0.72, roofH, 4, true), {
      rotate: vec3(0, Math.PI / 4, 0),
      scale: vec3(roofW / (r * 1.02), 1, roofD / (r * 1.02)),
      translate: vec3(0, topY + roofH / 2, 0),
    });
    return [{ name: "roof", mesh: pyr, color: ROOF_COL, surface: { type: "ceramic", params: { color: [0.42, 0.2, 0.15] } } }];
  }

  // Gable roof: triangular prism. The eave covers the top floor slab/cornice so
  // the roof reads as one cap instead of a red plate sitting on a gray shelf.
  const roof = gableRoofMesh(w + PITCHED_ROOF_EAVE * 2, d + PITCHED_ROOF_EAVE * 2, topY, roofH);
  return [{ name: "roof", mesh: roof, color: ROOF_COL, surface: { type: "ceramic", params: { color: [0.42, 0.2, 0.15] } } }];
}

function gableRoofMesh(w: number, d: number, baseY: number, roofH: number): Mesh {
  const hx = w / 2;
  const hz = d / 2;
  const ridgeY = baseY + roofH;
  const positions = [
    vec3(-hx, baseY, -hz),
    vec3(hx, baseY, -hz),
    vec3(-hx, ridgeY, 0),
    vec3(hx, ridgeY, 0),
    vec3(-hx, baseY, hz),
    vec3(hx, baseY, hz),
  ];
  const uvs = [
    vec2(0, 0),
    vec2(1, 0),
    vec2(0, 1),
    vec2(1, 1),
    vec2(0, 0),
    vec2(1, 0),
  ];
  const indices = [
    // back slope
    0, 3, 1, 0, 2, 3,
    // front slope
    2, 5, 3, 2, 4, 5,
    // gable ends
    0, 4, 2, 1, 3, 5,
    // underside, mostly hidden by the top slab
    0, 1, 5, 0, 5, 4,
  ];
  return computeNormals(makeMesh({
    positions,
    normals: positions.map(() => vec3(0, 1, 0)),
    uvs,
    indices,
  }), 1);
}

/** A low parapet wall ring around a flat roof. */
function parapetRing(w: number, d: number, topY: number, h: number): Mesh {
  const t = 0.08;
  const hw = w / 2;
  const hd = d / 2;
  const cy = topY + h / 2;
  return merge(
    translateMesh(box(w + t, h, t), vec3(0, cy, hd)),
    translateMesh(box(w + t, h, t), vec3(0, cy, -hd)),
    translateMesh(box(t, h, d - t), vec3(hw, cy, 0)),
    translateMesh(box(t, h, d - t), vec3(-hw, cy, 0)),
  );
}
