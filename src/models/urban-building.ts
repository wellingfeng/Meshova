/**
 * Urban building generator — the modern city-tower category, reconstructed as
 * original TypeScript from the anatomy of UE CitySample's building kit (studied
 * only as a parts taxonomy, never copied from the GPL/asset source).
 *
 * CitySample builds every tower from a modular kit named
 * `SM_BLDG_{city}{style}_L{floor}_{variant}_{element}` where element ∈
 * {Wall, CornerEx, CornerIn, Entrance, Column}, composed over a three-part
 * shape volume: a wider PODIUM (retail/lobby base) → a repeated SHAFT (the
 * standard-floor stack, optionally stepped back) → a CROWN (parapet / stepped
 * ziggurat / spire / mansard / rooftop water tank + mechanical). Facades are a
 * bay grid; windows are placed by copy-to-points, exactly the装配 step Houdini
 * uses. Everything is parameter + seed driven and returns NamedPart[] with
 * matched surface materials, built WITH the model so shape and material stay
 * aligned (Meshova's determinism + no-baked-dump invariants).
 *
 * A single `style` selects a preset that reads as one recognizable city type:
 *   artDeco       NY setback skyscraper — stone piers, stepped ziggurat crown
 *   glassTower    modern curtain-wall tower — horizontal vision/spandrel ribbon
 *   brickWalkup   low brick residential — punched windows, cornice, fire escape
 *   modernOffice  mid-rise office — banded floors, flat parapet, roof plant
 *   brownstone    SF/NY rowhouse — bay windows, stoop, mansard roof
 *   corporate     tower on a broad glazed podium — the classic plaza high-rise
 */
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  box,
  cone,
  cylinder,
  merge,
  transform,
  translateMesh,
  taperMesh,
  type Mesh,
  type NamedPart,
  type PartSurfaceRef,
} from "../geometry/index.js";

type RGB = [number, number, number];

/** Recognizable city-building archetype. */
export type UrbanStyle =
  | "artDeco"
  | "glassTower"
  | "brickWalkup"
  | "modernOffice"
  | "brownstone"
  | "corporate";

/** Crown (roof-top termination) treatment. */
export type CrownStyle = "flat" | "stepped" | "spire" | "mansard" | "watertank";

/** Facade window layout. `punched` = discrete openings; `ribbon` = horizontal bands. */
export type FacadeMode = "punched" | "ribbon";

export interface UrbanBuildingParams {
  style: UrbanStyle;
  /** Standard floors above the podium. */
  floors: number;
  /** Standard storey height. */
  floorHeight: number;
  /** Footprint width (X). */
  width: number;
  /** Footprint depth (Z). */
  depth: number;
  /** Window bays across the width. */
  baysX: number;
  /** Window bays across the depth. */
  baysZ: number;
  /** Podium (base) floor count; wider retail/lobby block. 0 = none. */
  podiumFloors: number;
  /** Podium overhang beyond the shaft footprint on each side. */
  podiumOverhang: number;
  /** Step the shaft back every N floors (art-deco massing). 0 = straight. */
  setbackEvery: number;
  /** Horizontal inset applied at each setback. */
  setbackAmount: number;
  /** Facade layout. */
  facade: FacadeMode;
  /** Window-to-wall ratio per bay (punched) / vision-band fraction (ribbon). */
  windowRatio: number;
  /** Strong vertical piers between bays (art-deco / gothic verticality). */
  verticalPiers: boolean;
  /** Crown treatment. */
  crown: CrownStyle;
  /** Crown height. */
  crownHeight: number;
  /** Variant seed (lit windows, jitter, rooftop clutter). */
  seed: number;
}

/** A style preset supplies the defining defaults + a color palette. */
interface StylePreset {
  defaults: Omit<UrbanBuildingParams, "style" | "seed">;
  palette: Palette;
}

interface Palette {
  wall: RGB;
  trim: RGB; // cornices / slabs / spandrels
  frame: RGB; // window frames / mullions
  glass: RGB; // glass tint
  glassLit: RGB; // lit-window emissive-ish tint
  accent: RGB; // piers / entrance / crown metal
  base: RGB; // podium / stoop stone
  wallSurface: PartSurfaceRef;
  trimSurface: PartSurfaceRef;
}

const P_ARTDECO: StylePreset = {
  defaults: {
    floors: 16, floorHeight: 1.0, width: 4.6, depth: 4.0, baysX: 5, baysZ: 4,
    podiumFloors: 2, podiumOverhang: 0.5, setbackEvery: 5, setbackAmount: 0.45,
    facade: "punched", windowRatio: 0.5, verticalPiers: true,
    crown: "stepped", crownHeight: 2.4,
  },
  palette: {
    wall: [0.66, 0.6, 0.5], trim: [0.5, 0.45, 0.37], frame: [0.24, 0.2, 0.14],
    glass: [0.08, 0.1, 0.12], glassLit: [0.95, 0.82, 0.5], accent: [0.55, 0.46, 0.24],
    base: [0.44, 0.4, 0.34],
    wallSurface: { type: "stone", params: { color: [0.66, 0.6, 0.5], roughness: 0.72 } },
    trimSurface: { type: "stone", params: { color: [0.5, 0.45, 0.37], roughness: 0.68 } },
  },
};

const P_GLASS: StylePreset = {
  defaults: {
    floors: 22, floorHeight: 0.9, width: 4.4, depth: 4.0, baysX: 6, baysZ: 5,
    podiumFloors: 1, podiumOverhang: 0.35, setbackEvery: 0, setbackAmount: 0,
    facade: "ribbon", windowRatio: 0.74, verticalPiers: false,
    crown: "flat", crownHeight: 0.9,
  },
  palette: {
    wall: [0.3, 0.36, 0.42], trim: [0.22, 0.26, 0.3], frame: [0.14, 0.16, 0.18],
    glass: [0.14, 0.26, 0.32], glassLit: [0.6, 0.78, 0.85], accent: [0.5, 0.55, 0.6],
    base: [0.24, 0.27, 0.3],
    wallSurface: { type: "metal", params: { color: [0.3, 0.36, 0.42], roughness: 0.35 } },
    trimSurface: { type: "metal", params: { color: [0.22, 0.26, 0.3], roughness: 0.4 } },
  },
};

const P_BRICK: StylePreset = {
  defaults: {
    floors: 5, floorHeight: 1.0, width: 3.6, depth: 3.4, baysX: 4, baysZ: 3,
    podiumFloors: 1, podiumOverhang: 0.0, setbackEvery: 0, setbackAmount: 0,
    facade: "punched", windowRatio: 0.42, verticalPiers: false,
    crown: "flat", crownHeight: 0.5,
  },
  palette: {
    wall: [0.5, 0.24, 0.18], trim: [0.72, 0.68, 0.6], frame: [0.9, 0.9, 0.86],
    glass: [0.1, 0.12, 0.14], glassLit: [0.96, 0.86, 0.58], accent: [0.2, 0.2, 0.22],
    base: [0.42, 0.4, 0.38],
    wallSurface: { type: "brick", params: { color: [0.5, 0.24, 0.18] } },
    trimSurface: { type: "stone", params: { color: [0.72, 0.68, 0.6], roughness: 0.7 } },
  },
};

const P_OFFICE: StylePreset = {
  defaults: {
    floors: 10, floorHeight: 0.92, width: 5.0, depth: 3.8, baysX: 6, baysZ: 4,
    podiumFloors: 1, podiumOverhang: 0.25, setbackEvery: 0, setbackAmount: 0,
    facade: "ribbon", windowRatio: 0.62, verticalPiers: false,
    crown: "watertank", crownHeight: 0.7,
  },
  palette: {
    wall: [0.6, 0.6, 0.58], trim: [0.46, 0.47, 0.48], frame: [0.2, 0.21, 0.23],
    glass: [0.12, 0.18, 0.22], glassLit: [0.7, 0.82, 0.86], accent: [0.4, 0.42, 0.45],
    base: [0.38, 0.39, 0.4],
    wallSurface: { type: "concrete", params: { color: [0.6, 0.6, 0.58] } },
    trimSurface: { type: "concrete", params: { color: [0.46, 0.47, 0.48] } },
  },
};

const P_BROWNSTONE: StylePreset = {
  defaults: {
    floors: 4, floorHeight: 1.05, width: 3.2, depth: 3.8, baysX: 3, baysZ: 3,
    podiumFloors: 1, podiumOverhang: 0.0, setbackEvery: 0, setbackAmount: 0,
    facade: "punched", windowRatio: 0.44, verticalPiers: false,
    crown: "mansard", crownHeight: 1.1,
  },
  palette: {
    wall: [0.42, 0.26, 0.2], trim: [0.6, 0.5, 0.42], frame: [0.85, 0.84, 0.8],
    glass: [0.09, 0.11, 0.13], glassLit: [0.95, 0.85, 0.6], accent: [0.24, 0.16, 0.12],
    base: [0.5, 0.46, 0.4],
    wallSurface: { type: "stone", params: { color: [0.42, 0.26, 0.2], roughness: 0.75 } },
    trimSurface: { type: "stone", params: { color: [0.6, 0.5, 0.42], roughness: 0.7 } },
  },
};

const P_CORPORATE: StylePreset = {
  defaults: {
    floors: 18, floorHeight: 0.92, width: 4.2, depth: 4.0, baysX: 5, baysZ: 5,
    podiumFloors: 2, podiumOverhang: 1.1, setbackEvery: 0, setbackAmount: 0,
    facade: "ribbon", windowRatio: 0.72, verticalPiers: true,
    crown: "spire", crownHeight: 1.8,
  },
  palette: {
    wall: [0.34, 0.4, 0.46], trim: [0.7, 0.72, 0.74], frame: [0.16, 0.18, 0.2],
    glass: [0.13, 0.24, 0.3], glassLit: [0.62, 0.8, 0.86], accent: [0.55, 0.58, 0.62],
    base: [0.28, 0.3, 0.33],
    wallSurface: { type: "metal", params: { color: [0.34, 0.4, 0.46], roughness: 0.38 } },
    trimSurface: { type: "metal", params: { color: [0.7, 0.72, 0.74], roughness: 0.3 } },
  },
};

const PRESETS: Record<UrbanStyle, StylePreset> = {
  artDeco: P_ARTDECO,
  glassTower: P_GLASS,
  brickWalkup: P_BRICK,
  modernOffice: P_OFFICE,
  brownstone: P_BROWNSTONE,
  corporate: P_CORPORATE,
};

/** Default params for a style; callers override individual fields. */
export function urbanDefaults(style: UrbanStyle): UrbanBuildingParams {
  const preset = PRESETS[style];
  return { style, seed: 7, ...preset.defaults };
}

/** One facade window slot: bay-centre world position + outward yaw. */
interface Slot {
  pos: Vec3;
  yaw: number;
  /** Half-width available for the window module at this slot (bay-local). */
  bayW: number;
  /** Storey height available (for ribbon band sizing). */
  storeyH: number;
}

/** A rectangular floor mass segment: centre Y, half-extents, storey height. */
interface Tier {
  y0: number; // bottom of the tier
  h: number; // tier height
  hw: number; // half width
  hd: number; // half depth
  floors: number; // storeys in this tier
  storeyH: number;
}

/**
 * Build a full urban building as named parts. Public entry for the viewer
 * registry and examples. Merges by material group (walls / slabs / frames /
 * glass / piers / crown / roof-plant) so the result stays a small, honest set
 * of surfaces regardless of floor count.
 */
export function buildUrbanBuildingParts(
  params: Partial<UrbanBuildingParams> & { style?: UrbanStyle } = {},
): NamedPart[] {
  const style: UrbanStyle = params.style ?? "artDeco";
  const p: UrbanBuildingParams = { ...urbanDefaults(style), ...params, style };
  const preset = PRESETS[style];
  const pal = preset.palette;
  const floors = Math.max(1, Math.round(p.floors));
  const baysX = Math.max(1, Math.round(p.baysX));
  const baysZ = Math.max(1, Math.round(p.baysZ));
  const podiumFloors = Math.max(0, Math.round(p.podiumFloors));
  const rng = makeRng(Math.round(p.seed) >>> 0);
  const litRng = rng.fork();

  const walls: Mesh[] = [];
  const slabs: Mesh[] = [];
  const piers: Mesh[] = [];
  const slots: Slot[] = [];
  const slotLit: number[] = [];

  let y = 0;

  // --- PODIUM: a wider base block (retail/lobby) the shaft rises out of ---
  let podiumHw = p.width / 2;
  let podiumHd = p.depth / 2;
  if (podiumFloors > 0) {
    const podH = podiumFloors * p.floorHeight * 1.25;
    podiumHw = p.width / 2 + p.podiumOverhang;
    podiumHd = p.depth / 2 + p.podiumOverhang;
    walls.push(translateMesh(box(podiumHw * 2, podH * 0.99, podiumHd * 2), vec3(0, y + podH / 2, 0)));
    // Cornice cap over the podium.
    slabs.push(translateMesh(box(podiumHw * 2 + 0.16, 0.12, podiumHd * 2 + 0.16), vec3(0, y + podH, 0)));
    // Podium storefront: a tall glazed band on all four sides (ground retail).
    collectPodiumGlazing(slots, slotLit, litRng, podiumHw, podiumHd, y, podH, baysX, baysZ);
    y += podH;
  }

  // --- SHAFT: the standard-floor stack, optionally stepped back in tiers ---
  const tiers: Tier[] = [];
  let hw = p.width / 2;
  let hd = p.depth / 2;
  let remaining = floors;
  let floorIndex = 0;
  const stepEvery = Math.max(0, Math.round(p.setbackEvery));
  while (remaining > 0) {
    const tierFloors = stepEvery > 0 ? Math.min(remaining, stepEvery) : remaining;
    const th = tierFloors * p.floorHeight;
    tiers.push({ y0: y, h: th, hw, hd, floors: tierFloors, storeyH: p.floorHeight });
    y += th;
    remaining -= tierFloors;
    floorIndex += tierFloors;
    if (stepEvery > 0 && remaining > 0) {
      hw = Math.max(0.6, hw - p.setbackAmount);
      hd = Math.max(0.6, hd - p.setbackAmount);
    }
  }
  const shaftTopY = y;

  for (let t = 0; t < tiers.length; t++) {
    const tier = tiers[t]!;
    // Storey mass + per-storey slab lines.
    walls.push(translateMesh(box(tier.hw * 2, tier.h * 0.99, tier.hd * 2), vec3(0, tier.y0 + tier.h / 2, 0)));
    for (let f = 0; f <= tier.floors; f++) {
      const sy = tier.y0 + f * tier.storeyH;
      slabs.push(translateMesh(box(tier.hw * 2 + 0.1, 0.06, tier.hd * 2 + 0.1), vec3(0, sy, 0)));
    }
    // Facade slots for every storey in this tier.
    for (let f = 0; f < tier.floors; f++) {
      const cy = tier.y0 + f * tier.storeyH + tier.storeyH / 2;
      collectFacadeSlots(slots, slotLit, litRng, {
        hw: tier.hw, hd: tier.hd, baysX, baysZ, centreY: cy, storeyH: tier.storeyH,
        ratio: p.windowRatio, ribbon: p.facade === "ribbon",
      });
    }
    // Vertical piers running the tier height between bays (art-deco/gothic).
    if (p.verticalPiers) {
      addVerticalPiers(piers, tier, baysX, baysZ);
    }
  }

  return finalizeBuilding({
    p, pal, preset, rng, litRng, walls, slabs, piers, slots, slotLit,
    shaftTopY, topHw: hw, topHd: hd, podiumHw, podiumHd, floors,
  });
}

interface FinalizeArgs {
  p: UrbanBuildingParams;
  pal: Palette;
  preset: StylePreset;
  rng: ReturnType<typeof makeRng>;
  litRng: ReturnType<typeof makeRng>;
  walls: Mesh[];
  slabs: Mesh[];
  piers: Mesh[];
  slots: Slot[];
  slotLit: number[];
  shaftTopY: number;
  topHw: number;
  topHd: number;
  podiumHw: number;
  podiumHd: number;
  floors: number;
}

function finalizeBuilding(a: FinalizeArgs): NamedPart[] {
  const { p, pal, walls, slabs, piers, slots, slotLit, shaftTopY, topHw, topHd } = a;

  // Ground slab under the whole footprint.
  slabs.push(translateMesh(box(a.podiumHw * 2 + 0.3, 0.14, a.podiumHd * 2 + 0.3), vec3(0, 0.07, 0)));

  // --- facade装配: build each slot's frame + glass at its own size, then place
  // by yaw + translation (copyToPoints only does uniform scale, but bay width
  // and storey height differ, so we size each module directly). Glass splits
  // into lit / dark groups so two materials read honestly. This is the same
  // "prototype module → per-slot placement" step Houdini/CitySample use. ---
  const ribbon = p.facade === "ribbon";
  const frameMeshes: Mesh[] = [];
  const glassDarkMeshes: Mesh[] = [];
  const glassLitMeshes: Mesh[] = [];
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]!;
    const win = ribbon
      ? ribbonWindow(s.bayW, s.storeyH, p.windowRatio)
      : punchedWindow(s.bayW, s.storeyH, p.windowRatio);
    const place = (m: Mesh) => translateMesh(transform(m, { rotate: vec3(0, s.yaw, 0) }), s.pos);
    frameMeshes.push(place(win.frame));
    const g = place(win.glass);
    (slotLit[i] ? glassLitMeshes : glassDarkMeshes).push(g);
  }

  // --- CROWN + roof plant + entrance ---
  const crownParts = buildCrown(p, pal, topHw, topHd, shaftTopY);
  const entrance = buildEntrance(p, pal, a.podiumHw, a.podiumHd);
  const roofPlant = buildRoofPlant(p, pal, a.rng, topHw, topHd, shaftTopY);

  const parts: NamedPart[] = [
    { name: "walls", mesh: merge(...walls), color: pal.wall, surface: pal.wallSurface },
    { name: "slabs", mesh: merge(...slabs), color: pal.trim, surface: pal.trimSurface },
    { name: "window_frames", mesh: merge(...frameMeshes), color: pal.frame, surface: { type: "metal", params: { color: pal.frame, roughness: 0.4 } } },
    { name: "windows", mesh: merge(...glassDarkMeshes), color: pal.glass, surface: { type: "glass", params: { tint: pal.glass, roughness: 0.05 } } },
  ];
  if (glassLitMeshes.length > 0) {
    parts.push({ name: "windows_lit", mesh: merge(...glassLitMeshes), color: pal.glassLit, surface: { type: "plastic", params: { color: pal.glassLit, roughness: 0.25 } } });
  }
  if (piers.length > 0) {
    parts.push({ name: "piers", mesh: merge(...piers), color: pal.accent, surface: pal.trimSurface });
  }
  if (entrance) parts.push(entrance);
  parts.push(...crownParts);
  if (roofPlant) parts.push(roofPlant);
  return parts;
}

// ---------------------------------------------------------------------------
// Facade slot collection
// ---------------------------------------------------------------------------

interface FacadeOpts {
  hw: number;
  hd: number;
  baysX: number;
  baysZ: number;
  centreY: number;
  storeyH: number;
  ratio: number;
  ribbon: boolean;
}

/**
 * Lay window bay centres on all four walls of one storey and push their world
 * position + outward yaw + local bay width. Bay width is the wall span / bays.
 */
function collectFacadeSlots(
  slots: Slot[],
  lit: number[],
  rng: { next(): number },
  o: FacadeOpts,
): void {
  const proud = 0.04;
  const bayWx = (o.hw * 2) / o.baysX;
  const bayWz = (o.hd * 2) / o.baysZ;
  // front (+Z) / back (-Z): bays along X
  for (const side of [1, -1] as const) {
    const z = side * (o.hd + proud);
    const yaw = side === 1 ? 0 : Math.PI;
    for (let b = 0; b < o.baysX; b++) {
      const x = -o.hw + bayWx * (b + 0.5);
      slots.push({ pos: vec3(x, o.centreY, z), yaw, bayW: bayWx, storeyH: o.storeyH });
      lit.push(rng.next() < 0.4 ? 1 : 0);
    }
  }
  // left (+X) / right (-X): bays along Z
  for (const side of [1, -1] as const) {
    const x = side * (o.hw + proud);
    const yaw = side === 1 ? Math.PI / 2 : -Math.PI / 2;
    for (let b = 0; b < o.baysZ; b++) {
      const z = -o.hd + bayWz * (b + 0.5);
      slots.push({ pos: vec3(x, o.centreY, z), yaw, bayW: bayWz, storeyH: o.storeyH });
      lit.push(rng.next() < 0.4 ? 1 : 0);
    }
  }
}

/** Ground-floor storefront: a single tall glazed bay per facade segment. */
function collectPodiumGlazing(
  slots: Slot[],
  lit: number[],
  rng: { next(): number },
  hw: number,
  hd: number,
  y0: number,
  podH: number,
  baysX: number,
  baysZ: number,
): void {
  const proud = 0.05;
  const cy = y0 + podH * 0.55;
  const storeyH = podH * 0.72;
  const bayWx = (hw * 2) / baysX;
  const bayWz = (hd * 2) / baysZ;
  for (const side of [1, -1] as const) {
    const z = side * (hd + proud);
    const yaw = side === 1 ? 0 : Math.PI;
    for (let b = 0; b < baysX; b++) {
      const x = -hw + bayWx * (b + 0.5);
      slots.push({ pos: vec3(x, cy, z), yaw, bayW: bayWx, storeyH });
      lit.push(rng.next() < 0.55 ? 1 : 0);
    }
  }
  for (const side of [1, -1] as const) {
    const x = side * (hw + proud);
    const yaw = side === 1 ? Math.PI / 2 : -Math.PI / 2;
    for (let b = 0; b < baysZ; b++) {
      const z = -hd + bayWz * (b + 0.5);
      slots.push({ pos: vec3(x, cy, z), yaw, bayW: bayWz, storeyH });
      lit.push(rng.next() < 0.55 ? 1 : 0);
    }
  }
}

// ---------------------------------------------------------------------------
// Window module prototypes — built in the XY plane facing +Z, sized to fit the
// bay (width) and storey (height). yaw rotates them onto each wall.
// ---------------------------------------------------------------------------

interface WindowModule {
  frame: Mesh;
  glass: Mesh;
}

/** Punched window: a discrete opening with a 4-sided frame + centre mullion. */
function punchedWindow(bayW: number, storeyH: number, ratio: number): WindowModule {
  const r = Math.min(0.95, Math.max(0.2, ratio));
  const w = bayW * r;
  const h = storeyH * 0.72;
  const t = Math.min(0.06, w * 0.12); // frame stock
  const dz = 0.03;
  const frame = merge(
    translateMesh(box(w + t, t, 0.06), vec3(0, h / 2, dz)),
    translateMesh(box(w + t, t, 0.06), vec3(0, -h / 2, dz)),
    translateMesh(box(t, h + t, 0.06), vec3(-w / 2, 0, dz)),
    translateMesh(box(t, h + t, 0.06), vec3(w / 2, 0, dz)),
    translateMesh(box(t * 0.6, h, 0.05), vec3(0, 0, dz)), // centre mullion
    translateMesh(box(w + t * 2, 0.05, 0.12), vec3(0, -h / 2 - t * 0.6, dz + 0.04)), // sill
  );
  const glass = translateMesh(box(w, h, 0.02), vec3(0, 0, 0.01));
  return { frame, glass };
}

/** Ribbon window: a wide horizontal vision band spanning the bay + spandrel. */
function ribbonWindow(bayW: number, storeyH: number, ratio: number): WindowModule {
  const r = Math.min(0.95, Math.max(0.4, ratio));
  const w = bayW * 0.98;
  const h = storeyH * r; // vision-glass fraction of the storey
  const t = 0.04;
  const dz = 0.025;
  // Continuous mullion grid: top+bottom rails, two verticals. The spandrel
  // (opaque under-band) is implied by the wall showing between ribbons.
  const frame = merge(
    translateMesh(box(w, t, 0.05), vec3(0, h / 2, dz)),
    translateMesh(box(w, t, 0.05), vec3(0, -h / 2, dz)),
    translateMesh(box(t, h, 0.05), vec3(-w / 2 + t / 2, 0, dz)),
    translateMesh(box(t, h, 0.05), vec3(w / 2 - t / 2, 0, dz)),
    translateMesh(box(t * 0.7, h, 0.045), vec3(0, 0, dz)),
  );
  const glass = translateMesh(box(w - t, h - t, 0.02), vec3(0, 0, 0.01));
  return { frame, glass };
}

// ---------------------------------------------------------------------------
// Vertical piers — continuous columns between bays running a tier's height.
// ---------------------------------------------------------------------------

function addVerticalPiers(piers: Mesh[], tier: Tier, baysX: number, baysZ: number): void {
  const cy = tier.y0 + tier.h / 2;
  const t = 0.14;
  const proud = 0.02;
  // piers between X bays on front/back
  for (const side of [1, -1] as const) {
    const z = side * (tier.hd + proud);
    for (let b = 0; b <= baysX; b++) {
      const x = -tier.hw + (tier.hw * 2 / baysX) * b;
      piers.push(translateMesh(box(t, tier.h, t), vec3(x, cy, z)));
    }
  }
  // piers between Z bays on sides
  for (const side of [1, -1] as const) {
    const x = side * (tier.hw + proud);
    for (let b = 0; b <= baysZ; b++) {
      const z = -tier.hd + (tier.hd * 2 / baysZ) * b;
      piers.push(translateMesh(box(t, tier.h, t), vec3(x, cy, z)));
    }
  }
}

// ---------------------------------------------------------------------------
// Crown — the rooftop termination that most defines the silhouette.
// ---------------------------------------------------------------------------

function buildCrown(
  p: UrbanBuildingParams,
  pal: Palette,
  hw: number,
  hd: number,
  topY: number,
): NamedPart[] {
  const ch = p.crownHeight;
  switch (p.crown) {
    case "stepped": {
      // Art-deco ziggurat: 3 shrinking slabs + a small finial mast.
      const steps: Mesh[] = [];
      let w = hw, d = hd, y = topY;
      for (let i = 0; i < 3; i++) {
        const sh = ch * (0.32 - i * 0.06);
        steps.push(translateMesh(box(w * 2, sh, d * 2), vec3(0, y + sh / 2, 0)));
        y += sh;
        w *= 0.72;
        d *= 0.72;
      }
      const mast = translateMesh(cylinder(0.05, ch * 0.5, 10, true), vec3(0, y + ch * 0.25, 0));
      return [
        { name: "crown", mesh: merge(...steps), color: pal.trim, surface: pal.trimSurface },
        { name: "crown_mast", mesh: mast, color: pal.accent, surface: { type: "metal", params: { color: pal.accent, roughness: 0.3 } } },
      ];
    }
    case "spire": {
      // Parapet ring + a tapered spire (4-sided) on a small drum.
      const parapet = parapetRing(hw, hd, topY, 0.3);
      const drum = translateMesh(box(hw * 0.9, ch * 0.2, hd * 0.9), vec3(0, topY + ch * 0.1, 0));
      const spire = transform(cone(Math.min(hw, hd) * 0.7, ch, 4, true), {
        rotate: vec3(0, Math.PI / 4, 0),
        translate: vec3(0, topY + ch * 0.2 + ch / 2, 0),
      });
      return [
        { name: "parapet", mesh: parapet, color: pal.trim, surface: pal.trimSurface },
        { name: "crown", mesh: merge(drum, spire), color: pal.accent, surface: { type: "metal", params: { color: pal.accent, roughness: 0.28 } } },
      ];
    }
    case "mansard": {
      // A sloped (inward-tapering) roof block + a flat cap: reads as a mansard.
      const slope = taperMesh(box(hw * 2, ch, hd * 2), { axis: "y", startScale: 1, endScale: 0.62, curve: 1 });
      const roof = translateMesh(slope, vec3(0, topY + ch / 2, 0));
      const cap = translateMesh(box(hw * 1.3, 0.1, hd * 1.3), vec3(0, topY + ch, 0));
      return [{ name: "crown", mesh: merge(roof, cap), color: pal.accent, surface: { type: "ceramic", params: { color: pal.accent, roughness: 0.55 } } }];
    }
    case "watertank": {
      // Flat parapet; the rooftop water tank is added by buildRoofPlant.
      const parapet = parapetRing(hw, hd, topY, ch * 0.4);
      return [{ name: "parapet", mesh: parapet, color: pal.trim, surface: pal.trimSurface }];
    }
    case "flat":
    default: {
      const slab = translateMesh(box(hw * 2 + 0.08, 0.1, hd * 2 + 0.08), vec3(0, topY + 0.05, 0));
      const parapet = parapetRing(hw, hd, topY, ch * 0.5);
      return [
        { name: "roof", mesh: slab, color: pal.trim, surface: pal.trimSurface },
        { name: "parapet", mesh: parapet, color: pal.trim, surface: pal.trimSurface },
      ];
    }
  }
}

/** A low parapet wall ring around a flat roof edge. */
function parapetRing(hw: number, hd: number, topY: number, h: number): Mesh {
  const t = 0.08;
  const cy = topY + h / 2;
  return merge(
    translateMesh(box(hw * 2 + t, h, t), vec3(0, cy, hd)),
    translateMesh(box(hw * 2 + t, h, t), vec3(0, cy, -hd)),
    translateMesh(box(t, h, hd * 2 - t), vec3(hw, cy, 0)),
    translateMesh(box(t, h, hd * 2 - t), vec3(-hw, cy, 0)),
  );
}

// ---------------------------------------------------------------------------
// Ground-floor entrance + rooftop mechanical plant.
// ---------------------------------------------------------------------------

/** Entrance: a recessed door + a projecting canopy on the front (+Z) face. */
function buildEntrance(
  p: UrbanBuildingParams,
  pal: Palette,
  hw: number,
  hd: number,
): NamedPart | null {
  const doorH = p.floorHeight * 1.0;
  const doorW = Math.min(1.0, hw * 0.7);
  const zf = hd + 0.02;
  const door = translateMesh(box(doorW, doorH, 0.08), vec3(0, doorH / 2 + 0.07, zf));
  const canopyProj = 0.6;
  const canopy = translateMesh(box(doorW * 1.5, 0.08, canopyProj), vec3(0, doorH + 0.18, zf + canopyProj / 2));
  return { name: "entrance", mesh: merge(door, canopy), color: pal.accent, surface: { type: "metal", params: { color: pal.accent, roughness: 0.35 } } };
}

/** Rooftop plant: HVAC boxes + (for watertank crowns) a raised wooden tank. */
function buildRoofPlant(
  p: UrbanBuildingParams,
  pal: Palette,
  rng: { next(): number },
  hw: number,
  hd: number,
  topY: number,
): NamedPart | null {
  const boxes: Mesh[] = [];
  const n = 2 + Math.floor(rng.next() * 3);
  for (let i = 0; i < n; i++) {
    const bw = 0.3 + rng.next() * 0.4;
    const bh = 0.2 + rng.next() * 0.35;
    const bd = 0.3 + rng.next() * 0.4;
    const x = (rng.next() - 0.5) * (hw * 2 - bw - 0.3);
    const z = (rng.next() - 0.5) * (hd * 2 - bd - 0.3);
    boxes.push(translateMesh(box(bw, bh, bd), vec3(x, topY + bh / 2 + 0.1, z)));
  }
  if (p.crown === "watertank") {
    // A cylindrical wooden tank on splayed legs — the classic NYC roof cue.
    const tankR = Math.min(hw, hd) * 0.4;
    const legH = 0.5;
    const tankBody = translateMesh(cylinder(tankR, 0.7, 16, true), vec3(0, topY + legH + 0.45, 0));
    const cone2 = transform(cone(tankR * 1.02, 0.3, 16, true), { translate: vec3(0, topY + legH + 0.95, 0) });
    const legs: Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      legs.push(translateMesh(box(0.05, legH, 0.05), vec3(Math.cos(a) * tankR * 0.7, topY + legH / 2 + 0.1, Math.sin(a) * tankR * 0.7)));
    }
    boxes.push(tankBody, cone2, ...legs);
  }
  if (boxes.length === 0) return null;
  return { name: "roof_plant", mesh: merge(...boxes), color: pal.base, surface: { type: "metal", params: { color: pal.base, roughness: 0.6 } } };
}
