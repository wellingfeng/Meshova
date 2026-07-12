/**
 * Module-kit facade grammar for procedural city buildings.
 *
 * This is Meshova's copyright-safe equivalent of a DCC/engine modular building
 * kit: slots are semantic attachment points, modules declare compatible tags,
 * and a seeded planner chooses assets by weight. Asset meshes here are
 * generated from primitives, not copied from any commercial pack.
 */
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng, type Rng } from "../random/prng.js";
import {
  box,
  cylinder,
  merge,
  transform,
  translateMesh,
  bounds,
  triangleCount,
  type Mesh,
  type NamedPart,
  type PartSurfaceRef,
} from "../geometry/index.js";

type RGB = [number, number, number];

export type ModuleSlotKind =
  | "groundFacade"
  | "upperFacade"
  | "balcony"
  | "sign"
  | "utility"
  | "roof";

export type ModuleSlotSide = "front" | "back" | "left" | "right" | "roof";

export interface ModuleSlot {
  /** Stable semantic key; never importer-style names like root.0. */
  id: string;
  /** Human-readable UI label. */
  label: string;
  kind: ModuleSlotKind;
  tags: string[];
  position: Vec3;
  yaw: number;
  width: number;
  height: number;
  depth: number;
  floor: number;
  bay: number;
  side: ModuleSlotSide;
}

export interface ModuleBuildContext {
  seed: number;
  palette: JapaneseStreetPalette;
}

export interface ModuleAsset {
  id: string;
  label: string;
  kind: ModuleSlotKind;
  tags: string[];
  weight: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  build(slot: ModuleSlot, ctx: ModuleBuildContext): NamedPart[];
}

export interface ModuleKit {
  id: string;
  label: string;
  modules: ModuleAsset[];
}

export interface ModulePlacement {
  slot: ModuleSlot;
  asset: ModuleAsset;
  variantSeed: number;
}

export interface ModuleKitScore {
  score: number;
  metrics: {
    coverage: number;
    compatibility: number;
    semanticLabels: number;
    facadeVariety: number;
  };
  feedback: string;
}

export interface JapaneseStreetPalette {
  wall: RGB;
  trim: RGB;
  frame: RGB;
  glass: RGB;
  litGlass: RGB;
  signA: RGB;
  signB: RGB;
  metal: RGB;
  sidewalk: RGB;
  asphalt: RGB;
}

export interface JapaneseStreetBuildingParams {
  /** Total floors including the ground retail floor. */
  floors: number;
  width: number;
  depth: number;
  floorHeight: number;
  bayWidth: number;
  signDensity: number;
  balconyDensity: number;
  utilityDensity: number;
  roofClutter: number;
  seed: number;
}

export const JAPANESE_STREET_DEFAULTS: JapaneseStreetBuildingParams = {
  floors: 5,
  width: 7.2,
  depth: 5.2,
  floorHeight: 1.05,
  bayWidth: 1.2,
  signDensity: 0.75,
  balconyDensity: 0.45,
  utilityDensity: 0.35,
  roofClutter: 0.8,
  seed: 23,
};

const TOKYO_PALETTE: JapaneseStreetPalette = {
  wall: [0.66, 0.64, 0.58],
  trim: [0.38, 0.39, 0.38],
  frame: [0.14, 0.15, 0.16],
  glass: [0.08, 0.13, 0.16],
  litGlass: [0.95, 0.78, 0.42],
  signA: [0.86, 0.12, 0.09],
  signB: [0.95, 0.86, 0.28],
  metal: [0.42, 0.44, 0.45],
  sidewalk: [0.48, 0.47, 0.44],
  asphalt: [0.08, 0.08, 0.085],
};

const SURFACE_CONCRETE = (color: RGB): PartSurfaceRef => ({
  type: "concrete",
  params: { color, roughness: 0.82 },
});
const SURFACE_METAL = (color: RGB): PartSurfaceRef => ({
  type: "metal",
  params: { color, roughness: 0.46 },
});
const SURFACE_GLASS = (tint: RGB): PartSurfaceRef => ({
  type: "glass",
  params: { tint, roughness: 0.05 },
});
const SURFACE_PLASTIC = (color: RGB): PartSurfaceRef => ({
  type: "plastic",
  params: { color, roughness: 0.42 },
});

class GroupBag {
  private readonly order: string[] = [];
  private readonly map = new Map<string, { meshes: Mesh[]; label: string; color: RGB; surface: PartSurfaceRef }>();

  add(part: NamedPart): void {
    let g = this.map.get(part.name);
    if (!g) {
      g = {
        meshes: [],
        label: part.label ?? part.name,
        color: part.color ?? [0.8, 0.8, 0.8],
        surface: part.surface ?? SURFACE_CONCRETE([0.8, 0.8, 0.8]),
      };
      this.map.set(part.name, g);
      this.order.push(part.name);
    }
    g.meshes.push(part.mesh);
  }

  toParts(): NamedPart[] {
    return this.order.map((name) => {
      const g = this.map.get(name)!;
      return {
        name,
        label: g.label,
        mesh: merge(...g.meshes),
        color: g.color,
        surface: g.surface,
      };
    });
  }
}

export function isModuleCompatible(asset: ModuleAsset, slot: ModuleSlot): boolean {
  if (asset.kind !== slot.kind) return false;
  if (slot.width < asset.minWidth || slot.width > asset.maxWidth) return false;
  if (slot.height < asset.minHeight || slot.height > asset.maxHeight) return false;
  return slot.tags.every((tag) => asset.tags.includes(tag));
}

export function pickModuleForSlot(slot: ModuleSlot, kit: ModuleKit, rng: Rng): ModuleAsset {
  const candidates = kit.modules.filter((m) => isModuleCompatible(m, slot));
  if (candidates.length === 0) {
    throw new Error(`no module matches slot ${slot.id} (${slot.kind})`);
  }
  const total = candidates.reduce((sum, m) => sum + Math.max(0.001, m.weight), 0);
  let p = rng.next() * total;
  for (const c of candidates) {
    p -= Math.max(0.001, c.weight);
    if (p <= 0) return c;
  }
  return candidates[candidates.length - 1]!;
}

export function planModulePlacements(slots: ModuleSlot[], kit: ModuleKit, seed: number): ModulePlacement[] {
  const rng = makeRng(seed >>> 0);
  return slots.map((slot) => ({
    slot,
    asset: pickModuleForSlot(slot, kit, rng),
    variantSeed: rng.int(0, 0x7fffffff),
  }));
}

export function scoreModuleKitPlan(slots: ModuleSlot[], placements: ModulePlacement[]): ModuleKitScore {
  const slotIds = new Set(slots.map((s) => s.id));
  const placedIds = new Set(placements.map((p) => p.slot.id));
  let compatible = 0;
  let semantic = 0;
  const assetIds = new Set<string>();

  for (const p of placements) {
    if (slotIds.has(p.slot.id) && isModuleCompatible(p.asset, p.slot)) compatible++;
    assetIds.add(p.asset.id);
  }
  for (const s of slots) {
    const rawish = /^(root|component_|object_|mesh_|\d|.*\.\d+$)/i.test(s.label);
    if (s.label.trim().length >= 4 && !rawish) semantic++;
  }

  const coverage = slots.length === 0 ? 1 : placedIds.size / slots.length;
  const compatibility = placements.length === 0 ? 1 : compatible / placements.length;
  const semanticLabels = slots.length === 0 ? 1 : semantic / slots.length;
  const facadeVariety = Math.min(1, assetIds.size / 5);
  const metrics = { coverage, compatibility, semanticLabels, facadeVariety };
  const score = clamp01(
    metrics.coverage * 0.35 +
      metrics.compatibility * 0.35 +
      metrics.semanticLabels * 0.2 +
      metrics.facadeVariety * 0.1,
  );
  const tips: string[] = [];
  if (coverage < 1) tips.push("fill every generated slot");
  if (compatibility < 1) tips.push("module tags must match slot tags");
  if (semanticLabels < 1) tips.push("replace raw slot names with semantic UI labels");
  if (facadeVariety < 0.5) tips.push("add more facade module variation");
  return {
    score,
    metrics,
    feedback: tips.length ? `Score ${score.toFixed(2)}. To improve: ${tips.join("; ")}.` : `Score ${score.toFixed(2)}. Module-kit plan passed.`,
  };
}

export function createJapaneseStreetSlots(
  params: Partial<JapaneseStreetBuildingParams> = {},
): ModuleSlot[] {
  const p = normalizeJapaneseParams(params);
  const rng = makeRng((p.seed ^ 0xa53a9d13) >>> 0);
  const floors = Math.max(1, Math.round(p.floors));
  const bays = Math.max(2, Math.round(p.width / Math.max(0.6, p.bayWidth)));
  const bayW = p.width / bays;
  const groundH = p.floorHeight * 1.22;
  const frontZ = p.depth / 2 + 0.045;
  const slots: ModuleSlot[] = [];

  for (let b = 0; b < bays; b++) {
    const x = -p.width / 2 + bayW * (b + 0.5);
    slots.push({
      id: `front-ground-bay-${b + 1}`,
      label: `Ground retail bay ${b + 1}`,
      kind: "groundFacade",
      tags: ["japaneseLowrise", "streetFront", "retail"],
      position: vec3(x, groundH * 0.5, frontZ),
      yaw: 0,
      width: bayW,
      height: groundH * 0.76,
      depth: 0.18,
      floor: 0,
      bay: b,
      side: "front",
    });
    if (rng.next() < p.signDensity) {
      slots.push({
        id: `front-sign-bay-${b + 1}`,
        label: `Shop sign bay ${b + 1}`,
        kind: "sign",
        tags: ["japaneseLowrise", "streetFront", "signage"],
        position: vec3(x, groundH - 0.12, frontZ + 0.035),
        yaw: 0,
        width: bayW * 0.86,
        height: groundH * 0.36,
        depth: 0.18,
        floor: 0,
        bay: b,
        side: "front",
      });
    }
  }

  for (let f = 1; f < floors; f++) {
    const floorBase = groundH + (f - 1) * p.floorHeight;
    for (let b = 0; b < bays; b++) {
      const x = -p.width / 2 + bayW * (b + 0.5);
      slots.push({
        id: `front-floor-${f + 1}-bay-${b + 1}-window`,
        label: `Floor ${f + 1} residential bay ${b + 1}`,
        kind: "upperFacade",
        tags: ["japaneseLowrise", "streetFront", "residential"],
        position: vec3(x, floorBase + p.floorHeight * 0.55, frontZ),
        yaw: 0,
        width: bayW,
        height: p.floorHeight * 0.68,
        depth: 0.12,
        floor: f,
        bay: b,
        side: "front",
      });
      if (rng.next() < p.balconyDensity) {
        slots.push({
          id: `front-floor-${f + 1}-bay-${b + 1}-balcony`,
          label: `Floor ${f + 1} balcony bay ${b + 1}`,
          kind: "balcony",
          tags: ["japaneseLowrise", "streetFront", "residential"],
          position: vec3(x, floorBase + p.floorHeight * 0.18, frontZ + 0.2),
          yaw: 0,
          width: bayW * 0.86,
          height: p.floorHeight * 0.45,
          depth: 0.55,
          floor: f,
          bay: b,
          side: "front",
        });
      }
      if (rng.next() < p.utilityDensity) {
        slots.push({
          id: `front-floor-${f + 1}-bay-${b + 1}-utility`,
          label: `Floor ${f + 1} air-conditioner bay ${b + 1}`,
          kind: "utility",
          tags: ["japaneseLowrise", "streetFront", "utility"],
          position: vec3(x + bayW * 0.24, floorBase + p.floorHeight * 0.32, frontZ + 0.07),
          yaw: 0,
          width: bayW * 0.34,
          height: p.floorHeight * 0.24,
          depth: 0.22,
          floor: f,
          bay: b,
          side: "front",
        });
      }
    }
  }

  if (rng.next() < p.roofClutter) {
    slots.push({
      id: "roof-service-kit",
      label: "Rooftop service kit",
      kind: "roof",
      tags: ["japaneseLowrise", "roof", "utility"],
      position: vec3(p.width * 0.18, totalHeight(p) + 0.08, -p.depth * 0.12),
      yaw: 0,
      width: Math.min(2.4, p.width * 0.34),
      height: 0.8,
      depth: Math.min(1.6, p.depth * 0.35),
      floor: floors,
      bay: -1,
      side: "roof",
    });
  }

  return slots;
}

export const JAPANESE_URBAN_KIT: ModuleKit = {
  id: "japanese-urban-kit",
  label: "Japanese low-rise urban module kit",
  modules: [
    storefrontGlass(),
    storefrontShutter(),
    apartmentWindow(),
    slidingBalconyDoor(),
    steelBalcony(),
    boxShopSign(),
    verticalShopSign(),
    airConditioner(),
    rooftopServiceKit(),
  ],
};

export function buildJapaneseStreetBuildingParts(
  params: Partial<JapaneseStreetBuildingParams> = {},
  kit: ModuleKit = JAPANESE_URBAN_KIT,
): NamedPart[] {
  const p = normalizeJapaneseParams(params);
  const bag = new GroupBag();
  for (const part of buildJapaneseStreetShell(p)) bag.add(part);

  const slots = createJapaneseStreetSlots(p);
  const placements = planModulePlacements(slots, kit, p.seed ^ 0x4f1bbcdc);
  for (const placement of placements) {
    const built = placement.asset.build(placement.slot, {
      seed: placement.variantSeed,
      palette: TOKYO_PALETTE,
    });
    for (const part of built) bag.add(part);
  }
  return bag.toParts();
}

export function scoreJapaneseStreetBuilding(parts: NamedPart[]): ModuleKitScore {
  const byName = new Map(parts.map((p) => [p.name, p]));
  const walls = byName.get("street_walls");
  const storefront = byName.get("storefront_glass") ?? byName.get("storefront_shutters");
  const windows = byName.get("residential_windows");
  const signs = byName.get("shop_signs");
  let facadeVariety = 0;
  for (const key of ["storefront_glass", "storefront_shutters", "balcony_rails", "shop_signs", "air_conditioners", "roof_service"]) {
    if (byName.has(key)) facadeVariety += 0.2;
  }
  let coverage = 0;
  if (walls && storefront && windows) coverage = 1;
  else if (walls && (storefront || windows)) coverage = 0.65;
  else if (walls) coverage = 0.35;

  let compatibility = 0;
  if (walls && storefront && windows) {
    const wallB = bounds(walls.mesh);
    const frontB = bounds(storefront.mesh);
    compatibility = frontB.max.z >= wallB.max.z ? 1 : 0.5;
  }

  const semanticLabels = parts.every((p) => p.label && p.label.length >= 4 && !/^root|component_/i.test(p.label)) ? 1 : 0;
  const metrics = {
    coverage,
    compatibility,
    semanticLabels,
    facadeVariety: clamp01(facadeVariety),
  };
  const score = clamp01(
    metrics.coverage * 0.35 +
      metrics.compatibility * 0.25 +
      metrics.semanticLabels * 0.2 +
      metrics.facadeVariety * 0.2,
  );
  const tips: string[] = [];
  if (!walls) tips.push("add street wall shell");
  if (!storefront) tips.push("add ground-floor storefront modules");
  if (!windows) tips.push("add upper-floor residential windows");
  if (!signs) tips.push("add shop signage for street identity");
  return {
    score,
    metrics,
    feedback: tips.length ? `Score ${score.toFixed(2)}. To improve: ${tips.join("; ")}.` : `Score ${score.toFixed(2)}. Japanese street building passed.`,
  };
}

function buildJapaneseStreetShell(p: JapaneseStreetBuildingParams): NamedPart[] {
  const h = totalHeight(p);
  const groundH = p.floorHeight * 1.22;
  const slabs: Mesh[] = [];
  for (let i = 0; i <= p.floors; i++) {
    const y = i === 0 ? 0 : groundH + (i - 1) * p.floorHeight;
    slabs.push(translateMesh(box(p.width + 0.12, 0.055, p.depth + 0.12), vec3(0, y, 0)));
  }
  const parapetH = 0.32;
  const parapetInset = 0.06;
  const parapet = merge(
    translateMesh(box(p.width - parapetInset * 2, parapetH, 0.08), vec3(0, h + parapetH / 2, p.depth / 2 - parapetInset)),
    translateMesh(box(p.width - parapetInset * 2, parapetH, 0.08), vec3(0, h + parapetH / 2, -p.depth / 2 + parapetInset)),
    translateMesh(box(0.08, parapetH, p.depth - parapetInset * 2), vec3(p.width / 2 - parapetInset, h + parapetH / 2, 0)),
    translateMesh(box(0.08, parapetH, p.depth - parapetInset * 2), vec3(-p.width / 2 + parapetInset, h + parapetH / 2, 0)),
  );
  const sidewalkDepth = 1.3;
  const roadDepth = 1.1;
  const street = translateMesh(box(p.width + 2.4, 0.08, sidewalkDepth), vec3(0, -0.04, p.depth / 2 + sidewalkDepth / 2));
  const road = translateMesh(box(p.width + 2.2, 0.035, roadDepth), vec3(0, 0.0, p.depth / 2 + sidewalkDepth + roadDepth / 2));
  return [
    makeNamed("street_walls", "Street wall shell", translateMesh(box(p.width, h, p.depth), vec3(0, h / 2, 0)), TOKYO_PALETTE.wall, SURFACE_CONCRETE(TOKYO_PALETTE.wall)),
    makeNamed("floor_slabs", "Floor slab bands", merge(...slabs), TOKYO_PALETTE.trim, SURFACE_CONCRETE(TOKYO_PALETTE.trim)),
    makeNamed("roof_parapet", "Flat roof parapet", parapet, TOKYO_PALETTE.trim, SURFACE_CONCRETE(TOKYO_PALETTE.trim)),
    makeNamed("sidewalk", "Street sidewalk", street, TOKYO_PALETTE.sidewalk, SURFACE_CONCRETE(TOKYO_PALETTE.sidewalk)),
    makeNamed("street_asphalt", "Street asphalt strip", road, TOKYO_PALETTE.asphalt, SURFACE_CONCRETE(TOKYO_PALETTE.asphalt)),
  ];
}

function storefrontGlass(): ModuleAsset {
  return {
    id: "storefront-glass",
    label: "Glass storefront",
    kind: "groundFacade",
    tags: ["japaneseLowrise", "streetFront", "retail"],
    weight: 2.4,
    minWidth: 0.7,
    maxWidth: 2.5,
    minHeight: 0.5,
    maxHeight: 2.2,
    build(slot, ctx) {
      const w = slot.width * 0.9;
      const h = slot.height;
      const frame = rectFrame(w, h, 0.045, 0.06);
      const doorW = w * 0.42;
      const glass = merge(
        translateMesh(box(doorW, h * 0.86, 0.025), vec3(-w * 0.22, 0, 0.01)),
        translateMesh(box(w * 0.42, h * 0.72, 0.025), vec3(w * 0.25, h * 0.04, 0.01)),
      );
      return [
        slotPart("storefront_frames", "Storefront metal frames", frame, slot, ctx.palette.frame, SURFACE_METAL(ctx.palette.frame)),
        slotPart("storefront_glass", "Storefront glass", glass, slot, ctx.palette.glass, SURFACE_GLASS(ctx.palette.glass)),
      ];
    },
  };
}

function storefrontShutter(): ModuleAsset {
  return {
    id: "rolling-shutter",
    label: "Rolling shutter storefront",
    kind: "groundFacade",
    tags: ["japaneseLowrise", "streetFront", "retail"],
    weight: 1.2,
    minWidth: 0.7,
    maxWidth: 2.5,
    minHeight: 0.5,
    maxHeight: 2.2,
    build(slot, ctx) {
      const w = slot.width * 0.88;
      const h = slot.height * 0.88;
      const slats: Mesh[] = [translateMesh(box(w, h, 0.025), vec3(0, 0, 0))];
      const n = Math.max(3, Math.floor(h / 0.13));
      for (let i = 0; i <= n; i++) {
        const y = -h / 2 + (h * i) / n;
        slats.push(translateMesh(box(w, 0.018, 0.045), vec3(0, y, 0.035)));
      }
      const frame = rectFrame(w, h, 0.05, 0.07);
      return [
        slotPart("storefront_shutters", "Rolling shutters", merge(...slats), slot, ctx.palette.metal, SURFACE_METAL(ctx.palette.metal)),
        slotPart("storefront_frames", "Storefront metal frames", frame, slot, ctx.palette.frame, SURFACE_METAL(ctx.palette.frame)),
      ];
    },
  };
}

function apartmentWindow(): ModuleAsset {
  return {
    id: "apartment-window",
    label: "Apartment window",
    kind: "upperFacade",
    tags: ["japaneseLowrise", "streetFront", "residential"],
    weight: 1.8,
    minWidth: 0.6,
    maxWidth: 2.2,
    minHeight: 0.4,
    maxHeight: 1.4,
    build(slot, ctx) {
      const w = slot.width * 0.58;
      const h = slot.height * 0.82;
      const frame = merge(
        rectFrame(w, h, 0.035, 0.045),
        translateMesh(box(0.03, h * 0.9, 0.05), vec3(0, 0, 0.035)),
      );
      const tint = (ctx.seed & 3) === 0 ? ctx.palette.litGlass : ctx.palette.glass;
      return [
        slotPart("residential_frames", "Residential window frames", frame, slot, ctx.palette.frame, SURFACE_METAL(ctx.palette.frame)),
        slotPart("residential_windows", "Residential window glass", box(w * 0.92, h * 0.88, 0.018), slot, tint, SURFACE_GLASS(tint)),
      ];
    },
  };
}

function slidingBalconyDoor(): ModuleAsset {
  return {
    id: "sliding-balcony-door",
    label: "Sliding balcony door",
    kind: "upperFacade",
    tags: ["japaneseLowrise", "streetFront", "residential"],
    weight: 1.25,
    minWidth: 0.75,
    maxWidth: 2.4,
    minHeight: 0.4,
    maxHeight: 1.4,
    build(slot, ctx) {
      const w = slot.width * 0.75;
      const h = slot.height * 0.98;
      const frame = merge(
        rectFrame(w, h, 0.035, 0.045),
        translateMesh(box(0.028, h * 0.96, 0.05), vec3(0, 0, 0.035)),
        translateMesh(box(w * 0.96, 0.028, 0.05), vec3(0, -h * 0.12, 0.035)),
      );
      return [
        slotPart("residential_frames", "Residential window frames", frame, slot, ctx.palette.frame, SURFACE_METAL(ctx.palette.frame)),
        slotPart("residential_windows", "Sliding balcony glass", box(w * 0.92, h * 0.9, 0.018), slot, ctx.palette.glass, SURFACE_GLASS(ctx.palette.glass)),
      ];
    },
  };
}

function steelBalcony(): ModuleAsset {
  return {
    id: "steel-balcony",
    label: "Steel balcony",
    kind: "balcony",
    tags: ["japaneseLowrise", "streetFront", "residential"],
    weight: 1,
    minWidth: 0.6,
    maxWidth: 2.2,
    minHeight: 0.2,
    maxHeight: 1.0,
    build(slot, ctx) {
      const w = slot.width;
      const d = slot.depth;
      const h = slot.height;
      const rails: Mesh[] = [
        translateMesh(box(w, 0.04, 0.04), vec3(0, h, d / 2)),
        translateMesh(box(0.04, 0.04, d), vec3(-w / 2, h, 0)),
        translateMesh(box(0.04, 0.04, d), vec3(w / 2, h, 0)),
      ];
      const n = Math.max(3, Math.round(w / 0.18));
      for (let i = 0; i <= n; i++) {
        const x = -w / 2 + (w * i) / n;
        rails.push(translateMesh(box(0.022, h, 0.022), vec3(x, h / 2, d / 2)));
      }
      return [
        slotPart("balcony_slabs", "Balcony floor plates", box(w, 0.055, d), slot, ctx.palette.trim, SURFACE_CONCRETE(ctx.palette.trim)),
        slotPart("balcony_rails", "Balcony railings", merge(...rails), slot, ctx.palette.metal, SURFACE_METAL(ctx.palette.metal)),
      ];
    },
  };
}

function boxShopSign(): ModuleAsset {
  return {
    id: "box-shop-sign",
    label: "Box shop sign",
    kind: "sign",
    tags: ["japaneseLowrise", "streetFront", "signage"],
    weight: 1.7,
    minWidth: 0.5,
    maxWidth: 2.2,
    minHeight: 0.2,
    maxHeight: 0.8,
    build(slot, ctx) {
      const color = (ctx.seed & 1) === 0 ? ctx.palette.signA : ctx.palette.signB;
      const sign = box(slot.width, slot.height, 0.12);
      const trim = rectFrame(slot.width, slot.height, 0.035, 0.14);
      return [
        slotPart("shop_signs", "Shop signs", sign, slot, color, SURFACE_PLASTIC(color)),
        slotPart("sign_frames", "Sign frames", trim, slot, ctx.palette.frame, SURFACE_METAL(ctx.palette.frame)),
      ];
    },
  };
}

function verticalShopSign(): ModuleAsset {
  return {
    id: "vertical-shop-sign",
    label: "Vertical shop sign",
    kind: "sign",
    tags: ["japaneseLowrise", "streetFront", "signage"],
    weight: 0.9,
    minWidth: 0.5,
    maxWidth: 2.2,
    minHeight: 0.2,
    maxHeight: 0.8,
    build(slot, ctx) {
      const color = (ctx.seed & 1) === 0 ? ctx.palette.signB : ctx.palette.signA;
      const w = Math.max(0.2, slot.width * 0.34);
      const h = Math.min(slot.height * 1.8, 0.95);
      const offset = vec3(slot.width * 0.32, h * 0.1, 0);
      const local = translateMesh(box(w, h, 0.14), offset);
      const frame = translateMesh(rectFrame(w, h, 0.03, 0.15), offset);
      return [
        slotPart("shop_signs", "Shop signs", local, slot, color, SURFACE_PLASTIC(color)),
        slotPart("sign_frames", "Sign frames", frame, slot, ctx.palette.frame, SURFACE_METAL(ctx.palette.frame)),
      ];
    },
  };
}

function airConditioner(): ModuleAsset {
  return {
    id: "wall-ac-unit",
    label: "Wall air-conditioner unit",
    kind: "utility",
    tags: ["japaneseLowrise", "streetFront", "utility"],
    weight: 1,
    minWidth: 0.2,
    maxWidth: 1.0,
    minHeight: 0.15,
    maxHeight: 0.5,
    build(slot, ctx) {
      const grille: Mesh[] = [box(slot.width, slot.height, slot.depth)];
      const n = 4;
      for (let i = 0; i < n; i++) {
        const y = -slot.height * 0.25 + (slot.height * 0.5 * i) / (n - 1);
        grille.push(translateMesh(box(slot.width * 0.78, 0.012, slot.depth * 0.08), vec3(0, y, slot.depth * 0.53)));
      }
      return [
        slotPart("air_conditioners", "Air-conditioner units", merge(...grille), slot, ctx.palette.metal, SURFACE_METAL(ctx.palette.metal)),
      ];
    },
  };
}

function rooftopServiceKit(): ModuleAsset {
  return {
    id: "rooftop-service-kit",
    label: "Rooftop service kit",
    kind: "roof",
    tags: ["japaneseLowrise", "roof", "utility"],
    weight: 1,
    minWidth: 0.7,
    maxWidth: 3.5,
    minHeight: 0.2,
    maxHeight: 1.5,
    build(slot, ctx) {
      const rng = makeRng(ctx.seed >>> 0);
      const meshes: Mesh[] = [];
      const tank = cylinder(Math.min(slot.width, slot.depth) * 0.16, slot.height * 0.62, 16, true);
      meshes.push(translateMesh(tank, vec3(-slot.width * 0.25, slot.height * 0.35, 0)));
      const n = 2 + rng.int(0, 2);
      for (let i = 0; i < n; i++) {
        const w = slot.width * rng.range(0.18, 0.32);
        const h = slot.height * rng.range(0.18, 0.34);
        const d = slot.depth * rng.range(0.18, 0.32);
        const x = rng.range(-slot.width * 0.2, slot.width * 0.34);
        const z = rng.range(-slot.depth * 0.25, slot.depth * 0.25);
        meshes.push(translateMesh(box(w, h, d), vec3(x, h / 2, z)));
      }
      return [
        slotPart("roof_service", "Rooftop service equipment", merge(...meshes), slot, ctx.palette.metal, SURFACE_METAL(ctx.palette.metal)),
      ];
    },
  };
}

function slotPart(
  name: string,
  label: string,
  localMesh: Mesh,
  slot: ModuleSlot,
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

function rectFrame(width: number, height: number, stock: number, depth: number): Mesh {
  return merge(
    translateMesh(box(width + stock, stock, depth), vec3(0, height / 2, depth * 0.18)),
    translateMesh(box(width + stock, stock, depth), vec3(0, -height / 2, depth * 0.18)),
    translateMesh(box(stock, height + stock, depth), vec3(-width / 2, 0, depth * 0.18)),
    translateMesh(box(stock, height + stock, depth), vec3(width / 2, 0, depth * 0.18)),
  );
}

function normalizeJapaneseParams(params: Partial<JapaneseStreetBuildingParams>): JapaneseStreetBuildingParams {
  const p = { ...JAPANESE_STREET_DEFAULTS, ...params };
  return {
    floors: Math.max(1, Math.round(p.floors)),
    width: Math.max(1.5, p.width),
    depth: Math.max(1.5, p.depth),
    floorHeight: Math.max(0.6, p.floorHeight),
    bayWidth: Math.max(0.6, p.bayWidth),
    signDensity: clamp01(p.signDensity),
    balconyDensity: clamp01(p.balconyDensity),
    utilityDensity: clamp01(p.utilityDensity),
    roofClutter: clamp01(p.roofClutter),
    seed: Math.round(p.seed) >>> 0,
  };
}

function totalHeight(p: JapaneseStreetBuildingParams): number {
  return p.floorHeight * 1.22 + Math.max(0, p.floors - 1) * p.floorHeight;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function summarizeJapaneseStreetBuilding(parts: NamedPart[]): {
  parts: number;
  triangles: number;
  height: number;
} {
  const merged = merge(...parts.map((p) => p.mesh));
  const b = bounds(merged);
  return {
    parts: parts.length,
    triangles: parts.reduce((sum, p) => sum + triangleCount(p.mesh), 0),
    height: b.max.y - b.min.y,
  };
}
