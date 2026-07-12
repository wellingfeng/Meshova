/**
 * SideFX-style modular house generator.
 *
 * Reference pattern: footprint cells -> semantic slots -> seeded module choice
 * -> copy-to-points style realization -> roof pitch/corner controls. Meshes are
 * generated from primitives; no tutorial assets are copied.
 */
import { vec2 } from "../math/vec2.js";
import { distance, vec3, type Vec3 } from "../math/vec3.js";
import { makeRng, type Rng } from "../random/prng.js";
import {
  box,
  bounds,
  computeNormals,
  copyToPoints,
  makeMesh,
  makePointCloud,
  merge,
  pointAttribute,
  transform,
  translateMesh,
  triangleCount,
  type Mesh,
  type NamedPart,
  type PartSurfaceRef,
} from "../geometry/index.js";

type RGB = [number, number, number];

export type SidefxHouseLayout = "rectangle" | "lWing";
export type SidefxHouseSlotKind = "facade" | "door" | "balcony" | "corner";
export type SidefxHouseSide = "front" | "back" | "left" | "right" | "roof";
export type SidefxCornerType = "convex" | "concave";

export interface SidefxModularHouseParams {
  floors: number;
  baysX: number;
  baysZ: number;
  bayWidth: number;
  floorHeight: number;
  layout: SidefxHouseLayout;
  wingBays: number;
  wingDepthBays: number;
  roofPitch: number;
  roofOverhang: number;
  balconyDensity: number;
  shutterDensity: number;
  seed: number;
}

export const SIDEFX_MODULAR_HOUSE_DEFAULTS: SidefxModularHouseParams = {
  floors: 2,
  baysX: 6,
  baysZ: 3,
  bayWidth: 1.1,
  floorHeight: 1.15,
  layout: "lWing",
  wingBays: 3,
  wingDepthBays: 3,
  roofPitch: 0.72,
  roofOverhang: 0.28,
  balconyDensity: 0.18,
  shutterDensity: 0.65,
  seed: 42,
};

export interface SidefxHouseSlot {
  id: string;
  label: string;
  kind: SidefxHouseSlotKind;
  tags: string[];
  position: Vec3;
  yaw: number;
  width: number;
  height: number;
  depth: number;
  floor: number;
  bay: number;
  side: SidefxHouseSide;
  cornerType?: SidefxCornerType;
}

export interface SidefxModuleBuildContext {
  seed: number;
  palette: SidefxHousePalette;
}

export interface SidefxHouseModuleAsset {
  id: string;
  label: string;
  kind: SidefxHouseSlotKind;
  tags: string[];
  weight: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  build(slot: SidefxHouseSlot, ctx: SidefxModuleBuildContext): NamedPart[];
}

export interface SidefxHouseModuleKit {
  id: string;
  label: string;
  modules: SidefxHouseModuleAsset[];
}

export interface SidefxHouseModulePlacement {
  slot: SidefxHouseSlot;
  asset: SidefxHouseModuleAsset;
  variantSeed: number;
}

export interface SidefxModularHouseScore {
  score: number;
  metrics: {
    shell: number;
    openings: number;
    roof: number;
    corners: number;
    proportions: number;
  };
  feedback: string;
}

export interface SidefxHousePalette {
  brick: RGB;
  brickDark: RGB;
  stone: RGB;
  trim: RGB;
  roof: RGB;
  roofDark: RGB;
  glass: RGB;
  litGlass: RGB;
  wood: RGB;
  metal: RGB;
}

const PALETTE: SidefxHousePalette = {
  brick: [0.58, 0.34, 0.25],
  brickDark: [0.42, 0.25, 0.19],
  stone: [0.58, 0.57, 0.54],
  trim: [0.78, 0.75, 0.68],
  roof: [0.24, 0.25, 0.22],
  roofDark: [0.15, 0.16, 0.15],
  glass: [0.12, 0.18, 0.2],
  litGlass: [0.82, 0.66, 0.38],
  wood: [0.34, 0.2, 0.12],
  metal: [0.2, 0.21, 0.22],
};

const SURFACE_CONCRETE = (color: RGB): PartSurfaceRef => ({
  type: "concrete",
  params: { color, roughness: 0.86 },
});
const SURFACE_BRICK = (color: RGB, seed = 0): PartSurfaceRef => ({
  type: "brick",
  params: { color, roughness: 0.9, seed },
});
const SURFACE_GLASS = (tint: RGB): PartSurfaceRef => ({
  type: "glass",
  params: { tint, roughness: 0.06 },
});
const SURFACE_WOOD = (color: RGB): PartSurfaceRef => ({
  type: "wood",
  params: { color, roughness: 0.7 },
});
const SURFACE_METAL = (color: RGB): PartSurfaceRef => ({
  type: "metal",
  params: { color, roughness: 0.48 },
});
const SURFACE_ROOF = (color: RGB, seed = 6): PartSurfaceRef => ({
  type: "slateRoof",
  params: { color, rows: 14, columns: 8, seed },
});

const ROOF_UV_DENSITY = 0.32;

class GroupBag {
  private readonly order: string[] = [];
  private readonly map = new Map<string, { meshes: Mesh[]; label: string; color: RGB; surface: PartSurfaceRef }>();

  add(part: NamedPart): void {
    let group = this.map.get(part.name);
    if (!group) {
      group = {
        meshes: [],
        label: part.label ?? part.name,
        color: (part.color ?? [0.8, 0.8, 0.8]) as RGB,
        surface: part.surface ?? SURFACE_CONCRETE([0.8, 0.8, 0.8]),
      };
      this.map.set(part.name, group);
      this.order.push(part.name);
    }
    group.meshes.push(part.mesh);
  }

  toParts(): NamedPart[] {
    return this.order.map((name) => {
      const group = this.map.get(name)!;
      return {
        name,
        label: group.label,
        mesh: computeNormals(merge(...group.meshes), 35),
        color: group.color,
        surface: group.surface,
      };
    });
  }
}

interface Footprint {
  cells: ReadonlySet<string>;
  totalBaysZ: number;
  wingDepth: number;
}

interface BoundaryEdge {
  id: string;
  i: number;
  j: number;
  side: SidefxHouseSide;
  position: Vec3;
  yaw: number;
}

interface RoofRect {
  center: Vec3;
  width: number;
  depth: number;
  axis: "x" | "z";
  rise: number;
}

export const SIDEFX_HOUSE_KIT: SidefxHouseModuleKit = {
  id: "sidefx-house-kit",
  label: "SideFX-inspired modular house kit",
  modules: [
    brickWallModule(),
    sashWindowModule(),
    shutteredWindowModule(),
    doubleDoorModule(),
    stoneBalconyModule(),
    convexCornerModule(),
    concaveCornerModule(),
  ],
};

export function createSidefxHouseSlots(
  params: Partial<SidefxModularHouseParams> = {},
): SidefxHouseSlot[] {
  const p = normalizeSidefxParams(params);
  const footprint = makeFootprint(p);
  const edges = boundaryEdges(p, footprint);
  const rng = makeRng((p.seed ^ 0x5721a71f) >>> 0);
  const totalH = p.floors * p.floorHeight;
  const doorEdge = pickDoorEdge(edges);
  const slots: SidefxHouseSlot[] = [];

  for (let f = 0; f < p.floors; f++) {
    const y = f * p.floorHeight + p.floorHeight / 2;
    for (const edge of edges) {
      const isDoor = f === 0 && edge.id === doorEdge.id;
      const baseTags = ["sidefxHouse", edge.side, f === 0 ? "ground" : "upper"];
      const facadeTags = [...baseTags, "wall"];
      if (!isDoor && rng.next() < p.shutterDensity) facadeTags.push("shutterPreferred");
      slots.push({
        id: `${edge.id}-floor-${f + 1}-${isDoor ? "door" : "facade"}`,
        label: isDoor
          ? "Main entrance module"
          : `${capitalize(edge.side)} facade bay ${edge.i + 1}.${edge.j + 1} floor ${f + 1}`,
        kind: isDoor ? "door" : "facade",
        tags: isDoor ? [...baseTags, "entry"] : facadeTags,
        position: vec3(edge.position.x, y, edge.position.z),
        yaw: edge.yaw,
        width: p.bayWidth,
        height: p.floorHeight,
        depth: 0.14,
        floor: f,
        bay: edge.i,
        side: edge.side,
      });

      if (!isDoor && f > 0 && edge.side === "front" && rng.next() < p.balconyDensity) {
        slots.push({
          id: `${edge.id}-floor-${f + 1}-balcony`,
          label: `Front balcony module floor ${f + 1}`,
          kind: "balcony",
          tags: ["sidefxHouse", "front", "upper", "balcony"],
          position: vec3(edge.position.x, f * p.floorHeight + 0.1, edge.position.z),
          yaw: edge.yaw,
          width: p.bayWidth * 0.86,
          height: p.floorHeight * 0.42,
          depth: 0.62,
          floor: f,
          bay: edge.i,
          side: "front",
        });
      }
    }
  }

  for (const corner of cornerSlots(p, footprint, totalH)) slots.push(corner);
  return slots;
}

export function isSidefxHouseModuleCompatible(
  asset: SidefxHouseModuleAsset,
  slot: SidefxHouseSlot,
): boolean {
  if (asset.kind !== slot.kind) return false;
  if (slot.width < asset.minWidth || slot.width > asset.maxWidth) return false;
  if (slot.height < asset.minHeight || slot.height > asset.maxHeight) return false;
  return slot.tags.every((tag) => asset.tags.includes(tag));
}

export function pickSidefxHouseModule(
  slot: SidefxHouseSlot,
  kit: SidefxHouseModuleKit,
  rng: Rng,
): SidefxHouseModuleAsset {
  const candidates = kit.modules.filter((asset) => isSidefxHouseModuleCompatible(asset, slot));
  if (candidates.length === 0) throw new Error(`no module matches slot ${slot.id}`);
  const total = candidates.reduce((sum, asset) => sum + Math.max(0.001, asset.weight), 0);
  let r = rng.next() * total;
  for (const asset of candidates) {
    r -= Math.max(0.001, asset.weight);
    if (r <= 0) return asset;
  }
  return candidates[candidates.length - 1]!;
}

export function planSidefxHouseModules(
  slots: SidefxHouseSlot[],
  kit: SidefxHouseModuleKit = SIDEFX_HOUSE_KIT,
  seed = SIDEFX_MODULAR_HOUSE_DEFAULTS.seed,
): SidefxHouseModulePlacement[] {
  const rng = makeRng(seed >>> 0);
  return slots.map((slot) => ({
    slot,
    asset: pickSidefxHouseModule(slot, kit, rng),
    variantSeed: rng.int(0, 0x7fffffff),
  }));
}

export function buildSidefxModularHouseParts(
  params: Partial<SidefxModularHouseParams> = {},
  kit: SidefxHouseModuleKit = SIDEFX_HOUSE_KIT,
): NamedPart[] {
  const p = normalizeSidefxParams(params);
  const slots = createSidefxHouseSlots(p);
  const placements = planSidefxHouseModules(slots, kit, p.seed ^ 0x11d384b7);
  const bag = new GroupBag();

  for (const part of baseParts(p)) bag.add(part);
  for (const placement of placements) {
    const built = placement.asset.build(placement.slot, {
      seed: placement.variantSeed,
      palette: PALETTE,
    });
    for (const part of built) bag.add(part);
  }
  for (const part of roofParts(p)) bag.add(part);
  for (const part of exteriorDetailParts(p)) bag.add(part);

  return bag.toParts();
}

export function scoreSidefxModularHouse(parts: NamedPart[]): SidefxModularHouseScore {
  const byName = new Map(parts.map((part) => [part.name, part]));
  const shell = byName.has("brick_wall_modules") && byName.has("stone_foundation") ? 1 : byName.has("brick_wall_modules") ? 0.65 : 0;
  const openings =
    (byName.has("window_glass") ? 0.38 : 0) +
    (byName.has("window_frames") ? 0.32 : 0) +
    (byName.has("entrance_doors") ? 0.3 : 0);
  const roof =
    (byName.has("cross_gable_roofs") ? 0.7 : 0) +
    (byName.has("roof_ridges") ? 0.18 : 0) +
    (byName.has("eave_brackets") ? 0.12 : 0);
  const corners =
    (byName.has("convex_corner_stones") ? 0.55 : 0) +
    (byName.has("concave_corner_stones") ? 0.45 : 0);

  let proportions = 0;
  const merged = merge(...parts.map((part) => part.mesh));
  const b = bounds(merged);
  const dx = b.max.x - b.min.x;
  const dy = b.max.y - b.min.y;
  const dz = b.max.z - b.min.z;
  const footprint = Math.max(dx, dz);
  if (footprint > 0) {
    const heightRatio = dy / footprint;
    proportions = rangeScore(heightRatio, 0.32, 0.85);
  }

  const metrics = {
    shell: clamp01(shell),
    openings: clamp01(openings),
    roof: clamp01(roof),
    corners: clamp01(corners),
    proportions,
  };
  const score = clamp01(
    metrics.shell * 0.24 +
      metrics.openings * 0.22 +
      metrics.roof * 0.24 +
      metrics.corners * 0.15 +
      metrics.proportions * 0.15,
  );
  const tips: string[] = [];
  if (metrics.shell < 0.999) tips.push("add foundation and wall modules");
  if (metrics.openings < 0.999) tips.push("add window frames, glass and door modules");
  if (metrics.roof < 0.999) tips.push("add cross-gable roof, ridges and eave brackets");
  if (metrics.corners < 0.999) tips.push("add convex/concave corner modules");
  if (metrics.proportions < 0.75) tips.push("adjust roof pitch or footprint proportions");
  return {
    score,
    metrics,
    feedback: tips.length ? `Score ${score.toFixed(2)}. To improve: ${tips.join("; ")}.` : `Score ${score.toFixed(2)}. Modular house passed.`,
  };
}

export function summarizeSidefxModularHouse(parts: NamedPart[]): {
  parts: number;
  triangles: number;
  height: number;
} {
  const merged = merge(...parts.map((part) => part.mesh));
  const b = bounds(merged);
  return {
    parts: parts.length,
    triangles: parts.reduce((sum, part) => sum + triangleCount(part.mesh), 0),
    height: b.max.y - b.min.y,
  };
}

function brickWallModule(): SidefxHouseModuleAsset {
  const allSides = ["front", "back", "left", "right"];
  return {
    id: "brick-wall",
    label: "Brick wall bay",
    kind: "facade",
    tags: ["sidefxHouse", "wall", "ground", "upper", ...allSides],
    weight: 0.85,
    minWidth: 0.7,
    maxWidth: 2.0,
    minHeight: 0.8,
    maxHeight: 1.8,
    build(slot, ctx) {
      return [
        slotPart("brick_wall_modules", "Brick wall modules", wallPanel(slot.width, slot.height), slot, ctx.palette.brick, SURFACE_BRICK(ctx.palette.brick, ctx.seed)),
        slotPart("horizontal_belt_courses", "Horizontal stone belt courses", beltCourses(slot.width, slot.height), slot, ctx.palette.stone, SURFACE_CONCRETE(ctx.palette.stone)),
      ];
    },
  };
}

function sashWindowModule(): SidefxHouseModuleAsset {
  const allSides = ["front", "back", "left", "right"];
  return {
    id: "sash-window",
    label: "Sash window bay",
    kind: "facade",
    tags: ["sidefxHouse", "wall", "ground", "upper", ...allSides],
    weight: 2.6,
    minWidth: 0.7,
    maxWidth: 2.0,
    minHeight: 0.8,
    maxHeight: 1.8,
    build(slot, ctx) {
      const tint = (ctx.seed & 7) === 0 ? ctx.palette.litGlass : ctx.palette.glass;
      const w = slot.width * 0.44;
      const h = slot.height * 0.54;
      const y = slot.floor === 0 ? 0.02 : 0;
      return [
        slotPart("brick_wall_modules", "Brick wall modules", wallPanel(slot.width, slot.height), slot, ctx.palette.brick, SURFACE_BRICK(ctx.palette.brick, ctx.seed)),
        slotPart("window_frames", "Stone window frames", translateMesh(rectFrame(w, h, 0.055, 0.1), vec3(0, y, 0.08)), slot, ctx.palette.trim, SURFACE_CONCRETE(ctx.palette.trim)),
        slotPart("window_glass", "Window glass panes", translateMesh(windowPanes(w, h), vec3(0, y, 0.095)), slot, tint, SURFACE_GLASS(tint)),
        slotPart("window_sills", "Stone window sills", translateMesh(box(w * 1.28, 0.07, 0.18), vec3(0, y - h / 2 - 0.08, 0.11)), slot, ctx.palette.stone, SURFACE_CONCRETE(ctx.palette.stone)),
      ];
    },
  };
}

function shutteredWindowModule(): SidefxHouseModuleAsset {
  const allSides = ["front", "back", "left", "right"];
  return {
    id: "shuttered-window",
    label: "Shuttered window bay",
    kind: "facade",
    tags: ["sidefxHouse", "wall", "ground", "upper", "shutterPreferred", ...allSides],
    weight: 1.15,
    minWidth: 0.7,
    maxWidth: 2.0,
    minHeight: 0.8,
    maxHeight: 1.8,
    build(slot, ctx) {
      const w = slot.width * 0.42;
      const h = slot.height * 0.52;
      const shutterW = Math.min(0.16, slot.width * 0.13);
      const shutters = merge(
        translateMesh(box(shutterW, h * 0.92, 0.05), vec3(-w * 0.68, 0, 0.12)),
        translateMesh(box(shutterW, h * 0.92, 0.05), vec3(w * 0.68, 0, 0.12)),
      );
      return [
        slotPart("brick_wall_modules", "Brick wall modules", wallPanel(slot.width, slot.height), slot, ctx.palette.brickDark, SURFACE_BRICK(ctx.palette.brickDark, ctx.seed)),
        slotPart("window_frames", "Stone window frames", translateMesh(rectFrame(w, h, 0.052, 0.1), vec3(0, 0, 0.08)), slot, ctx.palette.trim, SURFACE_CONCRETE(ctx.palette.trim)),
        slotPart("window_glass", "Window glass panes", translateMesh(windowPanes(w, h), vec3(0, 0, 0.095)), slot, ctx.palette.glass, SURFACE_GLASS(ctx.palette.glass)),
        slotPart("wood_shutters", "Wood shutters", shutters, slot, ctx.palette.wood, SURFACE_WOOD(ctx.palette.wood)),
      ];
    },
  };
}

function doubleDoorModule(): SidefxHouseModuleAsset {
  return {
    id: "double-entry-door",
    label: "Double entry door",
    kind: "door",
    tags: ["sidefxHouse", "front", "ground", "entry"],
    weight: 1,
    minWidth: 0.7,
    maxWidth: 2.0,
    minHeight: 0.8,
    maxHeight: 1.8,
    build(slot, ctx) {
      const doorW = slot.width * 0.48;
      const doorH = slot.height * 0.74;
      const archW = doorW * 1.24;
      const frame = merge(
        rectFrame(archW, doorH + 0.12, 0.06, 0.14),
        translateMesh(box(archW * 1.22, 0.08, 0.18), vec3(0, doorH / 2 + 0.12, 0.08)),
      );
      const leaves = merge(
        translateMesh(box(doorW * 0.48, doorH, 0.055), vec3(-doorW * 0.24, -0.04, 0.12)),
        translateMesh(box(doorW * 0.48, doorH, 0.055), vec3(doorW * 0.24, -0.04, 0.12)),
        translateMesh(box(0.025, doorH * 0.92, 0.07), vec3(0, -0.04, 0.16)),
      );
      return [
        slotPart("brick_wall_modules", "Brick wall modules", wallPanel(slot.width, slot.height), slot, ctx.palette.brick, SURFACE_BRICK(ctx.palette.brick, ctx.seed)),
        slotPart("door_frames", "Stone door frames", frame, slot, ctx.palette.trim, SURFACE_CONCRETE(ctx.palette.trim)),
        slotPart("entrance_doors", "Main entrance doors", leaves, slot, ctx.palette.wood, SURFACE_WOOD(ctx.palette.wood)),
      ];
    },
  };
}

function stoneBalconyModule(): SidefxHouseModuleAsset {
  return {
    id: "stone-balcony",
    label: "Stone balcony",
    kind: "balcony",
    tags: ["sidefxHouse", "front", "upper", "balcony"],
    weight: 1,
    minWidth: 0.7,
    maxWidth: 2.0,
    minHeight: 0.2,
    maxHeight: 1.0,
    build(slot, ctx) {
      const w = slot.width;
      const d = slot.depth;
      const h = slot.height;
      const slab = translateMesh(box(w, 0.08, d), vec3(0, 0, d / 2));
      const rail = merge(
        translateMesh(box(w, 0.06, 0.07), vec3(0, h, d)),
        translateMesh(box(0.07, h, 0.07), vec3(-w / 2, h / 2, d)),
        translateMesh(box(0.07, h, 0.07), vec3(w / 2, h / 2, d)),
        translateMesh(box(0.06, 0.06, d), vec3(-w / 2, h, d / 2)),
        translateMesh(box(0.06, 0.06, d), vec3(w / 2, h, d / 2)),
      );
      return [
        slotPart("balcony_slabs", "Balcony stone slabs", slab, slot, ctx.palette.stone, SURFACE_CONCRETE(ctx.palette.stone)),
        slotPart("balcony_rails", "Balcony railings", rail, slot, ctx.palette.trim, SURFACE_CONCRETE(ctx.palette.trim)),
      ];
    },
  };
}

function convexCornerModule(): SidefxHouseModuleAsset {
  return {
    id: "convex-corner-stones",
    label: "Convex corner stone stack",
    kind: "corner",
    tags: ["sidefxHouse", "convex"],
    weight: 1,
    minWidth: 0.1,
    maxWidth: 2.0,
    minHeight: 0.8,
    maxHeight: 5.0,
    build(slot, ctx) {
      return [
        slotPart("convex_corner_stones", "Convex corner stone stacks", cornerStack(slot.height, false), slot, ctx.palette.stone, SURFACE_CONCRETE(ctx.palette.stone)),
      ];
    },
  };
}

function concaveCornerModule(): SidefxHouseModuleAsset {
  return {
    id: "concave-corner-stones",
    label: "Concave valley corner stone stack",
    kind: "corner",
    tags: ["sidefxHouse", "concave"],
    weight: 1,
    minWidth: 0.1,
    maxWidth: 2.0,
    minHeight: 0.8,
    maxHeight: 5.0,
    build(slot, ctx) {
      return [
        slotPart("concave_corner_stones", "Concave inside-corner stones", cornerStack(slot.height, true), slot, ctx.palette.trim, SURFACE_CONCRETE(ctx.palette.trim)),
      ];
    },
  };
}

function baseParts(p: SidefxModularHouseParams): NamedPart[] {
  const footprint = makeFootprint(p);
  const meshes: Mesh[] = [];
  for (const key of footprint.cells) {
    const [i, j] = parseCellKey(key);
    meshes.push(translateMesh(box(p.bayWidth, 0.26, p.bayWidth), vec3(cellX(i, p), 0.13, cellZ(j, p, footprint))));
  }
  const cellar: Mesh[] = [];
  const edges = boundaryEdges(p, footprint);
  for (const edge of edges) {
    cellar.push(transform(translateMesh(box(p.bayWidth * 0.9, 0.42, 0.1), vec3(0, 0, 0.09)), {
      rotate: vec3(0, edge.yaw, 0),
      translate: vec3(edge.position.x, 0.32, edge.position.z),
    }));
  }
  return [
    makeNamed("stone_foundation", "Cell-based stone foundation", merge(...meshes), PALETTE.stone, SURFACE_CONCRETE(PALETTE.stone)),
    makeNamed("basement_wall_modules", "Basement wall modules", merge(...cellar), PALETTE.stone, SURFACE_CONCRETE(PALETTE.stone)),
  ];
}

function roofParts(p: SidefxModularHouseParams): NamedPart[] {
  const rects = roofRects(p);
  const roofs: Mesh[] = [];
  const ridges: Mesh[] = [];
  for (const rect of rects) {
    roofs.push(rect.axis === "x" ? gableRoofX(rect.width, rect.depth, rect.center, rect.rise) : gableRoofZ(rect.width, rect.depth, rect.center, rect.rise));
    const ridge =
      rect.axis === "x"
        ? translateMesh(box(rect.width * 0.98, 0.055, 0.08), vec3(rect.center.x, rect.center.y + rect.rise + 0.03, rect.center.z))
        : translateMesh(box(0.08, 0.055, rect.depth * 0.98), vec3(rect.center.x, rect.center.y + rect.rise + 0.03, rect.center.z));
    ridges.push(ridge);
  }

  const parts = [
    makeNamed("cross_gable_roofs", "Cross-gable roof planes", merge(...roofs), PALETTE.roof, SURFACE_ROOF(PALETTE.roof, p.seed ^ 0x6b35)),
    makeNamed("roof_ridges", "Roof ridge caps", merge(...ridges), PALETTE.trim, SURFACE_CONCRETE(PALETTE.trim)),
    makeNamed("eave_brackets", "Instanced eave brackets", eaveBrackets(p, rects), PALETTE.trim, SURFACE_CONCRETE(PALETTE.trim)),
  ];

  if (p.layout === "lWing") {
    const valley = valleyTrim(p, rects);
    if (valley.positions.length > 0) {
      parts.push(makeNamed("roof_valleys", "Concave roof valley trim", valley, PALETTE.roofDark, SURFACE_CONCRETE(PALETTE.roofDark)));
    }
  }
  return parts;
}

function exteriorDetailParts(p: SidefxModularHouseParams): NamedPart[] {
  const footprint = makeFootprint(p);
  const door = pickDoorEdge(boundaryEdges(p, footprint));
  const step = transform(box(p.bayWidth * 0.72, 0.14, 0.65), {
    rotate: vec3(0, door.yaw, 0),
    translate: vec3(door.position.x, 0.14, door.position.z + Math.cos(door.yaw) * 0.34),
  });
  const roofRect = roofRects(p)[0]!;
  const chimney = merge(
    translateMesh(box(0.28, 0.78, 0.28), vec3(roofRect.center.x + roofRect.width * 0.24, roofRect.center.y + roofRect.rise * 0.62, roofRect.center.z - roofRect.depth * 0.18)),
    translateMesh(box(0.38, 0.1, 0.38), vec3(roofRect.center.x + roofRect.width * 0.24, roofRect.center.y + roofRect.rise * 1.0, roofRect.center.z - roofRect.depth * 0.18)),
  );
  return [
    makeNamed("front_steps", "Front stone steps", step, PALETTE.stone, SURFACE_CONCRETE(PALETTE.stone)),
    makeNamed("chimney", "Brick chimney", chimney, PALETTE.brickDark, SURFACE_BRICK(PALETTE.brickDark, p.seed ^ 0x4e2d)),
  ];
}

function wallPanel(width: number, height: number): Mesh {
  return merge(
    box(width * 0.96, height * 0.95, 0.1),
    translateMesh(box(width * 0.98, 0.05, 0.12), vec3(0, -height * 0.5 + 0.06, 0.015)),
  );
}

function beltCourses(width: number, height: number): Mesh {
  return merge(
    translateMesh(box(width, 0.035, 0.13), vec3(0, height * 0.43, 0.14)),
    translateMesh(box(width, 0.04, 0.13), vec3(0, -height * 0.3, 0.14)),
  );
}

function windowPanes(width: number, height: number): Mesh {
  return merge(
    box(width * 0.92, height * 0.9, 0.025),
    translateMesh(box(0.025, height * 0.9, 0.04), vec3(0, 0, 0.02)),
    translateMesh(box(width * 0.92, 0.025, 0.04), vec3(0, 0, 0.02)),
  );
}

function rectFrame(width: number, height: number, stock: number, depth: number): Mesh {
  return merge(
    translateMesh(box(width + stock, stock, depth), vec3(0, height / 2, 0)),
    translateMesh(box(width + stock, stock, depth), vec3(0, -height / 2, 0)),
    translateMesh(box(stock, height + stock, depth), vec3(-width / 2, 0, 0)),
    translateMesh(box(stock, height + stock, depth), vec3(width / 2, 0, 0)),
  );
}

function cornerStack(height: number, concave: boolean): Mesh {
  const courses: Mesh[] = [];
  const n = Math.max(4, Math.round(height / 0.22));
  for (let k = 0; k < n; k++) {
    const y = -height / 2 + (height * (k + 0.5)) / n;
    const sx = k % 2 === 0 ? 0.16 : 0.12;
    const sz = k % 2 === 0 ? 0.12 : 0.16;
    const block = concave
      ? merge(
          translateMesh(box(sx, height / n * 0.78, 0.08), vec3(0.04, y, 0)),
          translateMesh(box(0.08, height / n * 0.78, sz), vec3(0, y, 0.04)),
        )
      : translateMesh(box(sx, height / n * 0.82, sz), vec3(0, y, 0));
    courses.push(block);
  }
  return merge(...courses);
}

function slotPart(
  name: string,
  label: string,
  localMesh: Mesh,
  slot: SidefxHouseSlot,
  color: RGB,
  surface: PartSurfaceRef,
): NamedPart {
  return makeNamed(
    name,
    label,
    transform(localMesh, { rotate: vec3(0, slot.yaw, 0), translate: slot.position }),
    color,
    surface,
  );
}

function makeNamed(name: string, label: string, mesh: Mesh, color: RGB, surface: PartSurfaceRef): NamedPart {
  return { name, label, mesh, color, surface };
}

function makeFootprint(p: SidefxModularHouseParams): Footprint {
  const cells = new Set<string>();
  for (let i = 0; i < p.baysX; i++) {
    for (let j = 0; j < p.baysZ; j++) cells.add(cellKey(i, j));
  }
  const wingDepth = p.layout === "lWing" ? p.wingDepthBays : 0;
  if (p.layout === "lWing") {
    for (let i = 0; i < p.wingBays; i++) {
      for (let j = p.baysZ; j < p.baysZ + wingDepth; j++) cells.add(cellKey(i, j));
    }
  }
  return { cells, totalBaysZ: p.baysZ + wingDepth, wingDepth };
}

function boundaryEdges(p: SidefxModularHouseParams, footprint: Footprint): BoundaryEdge[] {
  const edges: BoundaryEdge[] = [];
  for (const key of footprint.cells) {
    const [i, j] = parseCellKey(key);
    if (!footprint.cells.has(cellKey(i, j - 1))) {
      edges.push(edge(p, footprint, i, j, "front"));
    }
    if (!footprint.cells.has(cellKey(i, j + 1))) {
      edges.push(edge(p, footprint, i, j, "back"));
    }
    if (!footprint.cells.has(cellKey(i - 1, j))) {
      edges.push(edge(p, footprint, i, j, "left"));
    }
    if (!footprint.cells.has(cellKey(i + 1, j))) {
      edges.push(edge(p, footprint, i, j, "right"));
    }
  }
  return edges;
}

function edge(
  p: SidefxModularHouseParams,
  footprint: Footprint,
  i: number,
  j: number,
  side: SidefxHouseSide,
): BoundaryEdge {
  const x = cellX(i, p);
  const z = cellZ(j, p, footprint);
  const half = p.bayWidth / 2;
  if (side === "front") {
    return { id: `front-cell-${i}-${j}`, i, j, side, position: vec3(x, 0, z + half), yaw: 0 };
  }
  if (side === "back") {
    return { id: `back-cell-${i}-${j}`, i, j, side, position: vec3(x, 0, z - half), yaw: Math.PI };
  }
  if (side === "left") {
    return { id: `left-cell-${i}-${j}`, i, j, side, position: vec3(x - half, 0, z), yaw: -Math.PI / 2 };
  }
  return { id: `right-cell-${i}-${j}`, i, j, side, position: vec3(x + half, 0, z), yaw: Math.PI / 2 };
}

function pickDoorEdge(edges: BoundaryEdge[]): BoundaryEdge {
  let best = edges.find((e) => e.side === "front") ?? edges[0]!;
  for (const edge of edges) {
    if (edge.side !== "front") continue;
    if (edge.position.z > best.position.z + 1e-6) best = edge;
    else if (Math.abs(edge.position.z - best.position.z) < 1e-6 && Math.abs(edge.position.x) < Math.abs(best.position.x)) best = edge;
  }
  return best;
}

function cornerSlots(
  p: SidefxModularHouseParams,
  footprint: Footprint,
  totalH: number,
): SidefxHouseSlot[] {
  const out: SidefxHouseSlot[] = [];
  const maxJ = footprint.totalBaysZ;
  for (let i = 0; i <= p.baysX; i++) {
    for (let j = 0; j <= maxJ; j++) {
      const adjacent = [
        footprint.cells.has(cellKey(i - 1, j - 1)),
        footprint.cells.has(cellKey(i, j - 1)),
        footprint.cells.has(cellKey(i - 1, j)),
        footprint.cells.has(cellKey(i, j)),
      ];
      const count = adjacent.filter(Boolean).length;
      const cornerType = count === 1 ? "convex" : count === 3 ? "concave" : undefined;
      if (!cornerType) continue;
      const x = (i - p.baysX / 2) * p.bayWidth;
      const z = (footprint.totalBaysZ / 2 - j) * p.bayWidth;
      out.push({
        id: `${cornerType}-corner-${i}-${j}`,
        label: `${capitalize(cornerType)} corner module column ${i} row ${j}`,
        kind: "corner",
        tags: ["sidefxHouse", cornerType],
        position: vec3(x, totalH / 2, z),
        yaw: 0,
        width: 0.2,
        height: totalH,
        depth: 0.2,
        floor: -1,
        bay: -1,
        side: "front",
        cornerType,
      });
    }
  }
  return out;
}

function roofRects(p: SidefxModularHouseParams): RoofRect[] {
  const footprint = makeFootprint(p);
  const topY = p.floors * p.floorHeight;
  const mainW = p.baysX * p.bayWidth + p.roofOverhang * 2;
  const mainD = p.baysZ * p.bayWidth + p.roofOverhang * 2;
  const mainFront = (footprint.totalBaysZ / 2) * p.bayWidth;
  const mainBack = (footprint.totalBaysZ / 2 - p.baysZ) * p.bayWidth;
  const mainCenter = vec3(0, topY, (mainFront + mainBack) / 2);
  const mainRise = Math.max(0.35, (mainD / 2) * p.roofPitch);
  const rects: RoofRect[] = [{ center: mainCenter, width: mainW, depth: mainD, axis: "x", rise: mainRise }];

  if (p.layout === "lWing" && footprint.wingDepth > 0) {
    const wingW = p.wingBays * p.bayWidth + p.roofOverhang * 2;
    const wingD = p.wingDepthBays * p.bayWidth + p.roofOverhang * 2;
    const left = -p.baysX * p.bayWidth / 2;
    const right = left + p.wingBays * p.bayWidth;
    const front = (footprint.totalBaysZ / 2 - p.baysZ) * p.bayWidth;
    const back = (footprint.totalBaysZ / 2 - p.baysZ - p.wingDepthBays) * p.bayWidth;
    rects.push({
      center: vec3((left + right) / 2, topY + 0.03, (front + back) / 2),
      width: wingW,
      depth: wingD,
      axis: "z",
      rise: Math.max(0.35, (wingW / 2) * p.roofPitch),
    });
  }
  return rects;
}

function gableRoofX(width: number, depth: number, center: Vec3, rise: number): Mesh {
  const hx = width / 2;
  const hz = depth / 2;
  const y = center.y;
  const positions = [
    vec3(center.x - hx, y, center.z - hz),
    vec3(center.x + hx, y, center.z - hz),
    vec3(center.x - hx, y + rise, center.z),
    vec3(center.x + hx, y + rise, center.z),
    vec3(center.x - hx, y, center.z + hz),
    vec3(center.x + hx, y, center.z + hz),
  ];
  const widthU = width * ROOF_UV_DENSITY;
  const depthU = depth * ROOF_UV_DENSITY;
  const slopeV = Math.hypot(depth / 2, rise) * ROOF_UV_DENSITY;
  const riseV = rise * ROOF_UV_DENSITY;
  return computeNormals(merge(
    roofQuad([positions[0]!, positions[2]!, positions[3]!, positions[1]!], widthU, slopeV, "vertical"),
    roofQuad([positions[2]!, positions[4]!, positions[5]!, positions[3]!], widthU, slopeV, "vertical"),
    roofTri([positions[0]!, positions[4]!, positions[2]!], [vec2(0, 0), vec2(depthU, 0), vec2(depthU * 0.5, riseV)]),
    roofTri([positions[1]!, positions[3]!, positions[5]!], [vec2(0, 0), vec2(depthU * 0.5, riseV), vec2(depthU, 0)]),
    roofQuad([positions[0]!, positions[1]!, positions[5]!, positions[4]!], widthU, depthU, "horizontal"),
  ), 35);
}

function gableRoofZ(width: number, depth: number, center: Vec3, rise: number): Mesh {
  const hx = width / 2;
  const hz = depth / 2;
  const y = center.y;
  const positions = [
    vec3(center.x - hx, y, center.z - hz),
    vec3(center.x, y + rise, center.z - hz),
    vec3(center.x + hx, y, center.z - hz),
    vec3(center.x - hx, y, center.z + hz),
    vec3(center.x, y + rise, center.z + hz),
    vec3(center.x + hx, y, center.z + hz),
  ];
  const widthU = width * ROOF_UV_DENSITY;
  const depthU = depth * ROOF_UV_DENSITY;
  const slopeV = Math.hypot(width / 2, rise) * ROOF_UV_DENSITY;
  const riseV = rise * ROOF_UV_DENSITY;
  return computeNormals(merge(
    roofQuad([positions[0]!, positions[3]!, positions[4]!, positions[1]!], depthU, slopeV, "horizontal"),
    roofQuad([positions[1]!, positions[4]!, positions[5]!, positions[2]!], depthU, slopeV, "horizontal"),
    roofTri([positions[0]!, positions[1]!, positions[2]!], [vec2(0, 0), vec2(widthU * 0.5, riseV), vec2(widthU, 0)]),
    roofTri([positions[3]!, positions[5]!, positions[4]!], [vec2(0, 0), vec2(widthU, 0), vec2(widthU * 0.5, riseV)]),
    roofQuad([positions[0]!, positions[2]!, positions[5]!, positions[3]!], widthU, depthU, "horizontal"),
  ), 35);
}

function roofQuad(points: [Vec3, Vec3, Vec3, Vec3], uLen: number, vLen: number, orientation: "horizontal" | "vertical"): Mesh {
  const uvs =
    orientation === "horizontal"
      ? [vec2(0, 0), vec2(uLen, 0), vec2(uLen, vLen), vec2(0, vLen)]
      : [vec2(0, 0), vec2(0, vLen), vec2(uLen, vLen), vec2(uLen, 0)];
  return makeMesh({
    positions: points,
    normals: points.map(() => vec3(0, 1, 0)),
    uvs,
    indices: [0, 1, 2, 0, 2, 3],
  });
}

function roofTri(points: [Vec3, Vec3, Vec3], uvs: [ReturnType<typeof vec2>, ReturnType<typeof vec2>, ReturnType<typeof vec2>]): Mesh {
  if (uvTriArea(uvs) < 1e-6) {
    const base = Math.max(distance(points[0], points[1]) * ROOF_UV_DENSITY, 0.05);
    const side = Math.max(distance(points[0], points[2]) * ROOF_UV_DENSITY, 0.05);
    uvs = [vec2(0, 0), vec2(base, 0), vec2(base * 0.5, side)];
  }
  return makeMesh({
    positions: points,
    normals: points.map(() => vec3(0, 1, 0)),
    uvs,
    indices: [0, 1, 2],
  });
}

function uvTriArea(uvs: [ReturnType<typeof vec2>, ReturnType<typeof vec2>, ReturnType<typeof vec2>]): number {
  const [a, b, c] = uvs;
  return Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) * 0.5;
}

function eaveBrackets(p: SidefxModularHouseParams, rects: RoofRect[]): Mesh {
  const points: Vec3[] = [];
  const yaw: number[] = [];
  const spacing = Math.max(0.45, p.bayWidth * 0.42);
  for (const rect of rects) {
    const y = rect.center.y - 0.08;
    if (rect.axis === "x") {
      const n = Math.max(2, Math.round(rect.width / spacing));
      for (let k = 0; k <= n; k++) {
        const x = rect.center.x - rect.width / 2 + (rect.width * k) / n;
        points.push(vec3(x, y, rect.center.z + rect.depth / 2 - 0.06), vec3(x, y, rect.center.z - rect.depth / 2 + 0.06));
        yaw.push(0, Math.PI);
      }
    } else {
      const n = Math.max(2, Math.round(rect.depth / spacing));
      for (let k = 0; k <= n; k++) {
        const z = rect.center.z - rect.depth / 2 + (rect.depth * k) / n;
        points.push(vec3(rect.center.x + rect.width / 2 - 0.06, y, z), vec3(rect.center.x - rect.width / 2 + 0.06, y, z));
        yaw.push(Math.PI / 2, -Math.PI / 2);
      }
    }
  }
  const pc = makePointCloud({ points, attributes: { yaw } });
  return copyToPoints(pc, box(0.12, 0.12, 0.22), {
    yaw: pointAttribute("yaw"),
    alignToNormal: false,
  });
}

function valleyTrim(p: SidefxModularHouseParams, rects: RoofRect[]): Mesh {
  if (rects.length < 2) return merge();
  const main = rects[0]!;
  const wing = rects[1]!;
  const x = -p.baysX * p.bayWidth / 2 + p.wingBays * p.bayWidth;
  const z = wing.center.z + wing.depth / 2 - p.roofOverhang;
  const y = Math.max(main.center.y, wing.center.y) + 0.08;
  return merge(
    translateMesh(box(0.08, 0.06, p.roofOverhang * 3), vec3(x, y, z - p.roofOverhang * 0.9)),
    translateMesh(box(p.roofOverhang * 3, 0.06, 0.08), vec3(x - p.roofOverhang * 0.9, y, z)),
  );
}

function normalizeSidefxParams(params: Partial<SidefxModularHouseParams>): SidefxModularHouseParams {
  const p = { ...SIDEFX_MODULAR_HOUSE_DEFAULTS, ...params };
  const baysX = Math.max(3, Math.round(p.baysX));
  const baysZ = Math.max(2, Math.round(p.baysZ));
  const wingBays = Math.max(1, Math.min(baysX - 1, Math.round(p.wingBays)));
  const wingDepthBays = p.layout === "lWing" ? Math.max(1, Math.round(p.wingDepthBays)) : 0;
  return {
    floors: Math.max(1, Math.round(p.floors)),
    baysX,
    baysZ,
    bayWidth: Math.max(0.7, p.bayWidth),
    floorHeight: Math.max(0.85, p.floorHeight),
    layout: p.layout === "rectangle" ? "rectangle" : "lWing",
    wingBays,
    wingDepthBays,
    roofPitch: clamp01(p.roofPitch),
    roofOverhang: Math.max(0.08, p.roofOverhang),
    balconyDensity: clamp01(p.balconyDensity),
    shutterDensity: clamp01(p.shutterDensity),
    seed: Math.round(p.seed) >>> 0,
  };
}

function cellKey(i: number, j: number): string {
  return `${i},${j}`;
}

function parseCellKey(key: string): [number, number] {
  const [a, b] = key.split(",");
  return [Number(a), Number(b)];
}

function cellX(i: number, p: SidefxModularHouseParams): number {
  return (i + 0.5 - p.baysX / 2) * p.bayWidth;
}

function cellZ(j: number, p: SidefxModularHouseParams, footprint: Footprint): number {
  return (footprint.totalBaysZ / 2 - (j + 0.5)) * p.bayWidth;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
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
