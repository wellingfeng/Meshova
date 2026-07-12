import type { NamedPart } from "../geometry/export.js";
import { merge } from "../geometry/mesh.js";
import { cylinder, icosphere } from "../geometry/primitives2.js";
import { transform } from "../geometry/transform.js";
import { vec3 } from "../math/vec3.js";
import { fern } from "../vegetation/fern.js";
import { buildSpeedTreeLibraryPlant } from "../vegetation/library.js";
import { grass } from "../vegetation/plant.js";
import {
  buildVegetationAssembly,
  type VegetationAssemblyAsset,
  type VegetationAssemblyCollection,
  type VegetationAssemblySlot,
} from "../vegetation/assembly.js";
import { buildRockFormationMesh } from "./rock-formation.js";

export type VegetationAssemblyPreset = "flower-island" | "woodland-edge" | "dry-rockery";

export interface VegetationAssemblyPresetOptions {
  seed?: number;
  locationX?: number;
  locationZ?: number;
  spread?: number;
  treeScale?: number;
  density?: number;
}

interface AssemblyPalette {
  ground: [number, number, number];
  bark: [number, number, number];
  foliage: [number, number, number];
  foliageAlt: [number, number, number];
  flower: [number, number, number];
  flowerAlt: [number, number, number];
  stone: [number, number, number];
  grass: [number, number, number];
}

const PALETTES: Record<VegetationAssemblyPreset, AssemblyPalette> = {
  "flower-island": {
    ground: [0.18, 0.26, 0.1], bark: [0.28, 0.18, 0.1], foliage: [0.24, 0.52, 0.16],
    foliageAlt: [0.44, 0.62, 0.16], flower: [0.85, 0.12, 0.28], flowerAlt: [0.76, 0.26, 0.78],
    stone: [0.54, 0.5, 0.43], grass: [0.2, 0.46, 0.12],
  },
  "woodland-edge": {
    ground: [0.12, 0.21, 0.09], bark: [0.3, 0.22, 0.14], foliage: [0.12, 0.36, 0.12],
    foliageAlt: [0.26, 0.5, 0.18], flower: [0.9, 0.78, 0.34], flowerAlt: [0.68, 0.78, 0.48],
    stone: [0.4, 0.43, 0.39], grass: [0.15, 0.38, 0.11],
  },
  "dry-rockery": {
    ground: [0.3, 0.25, 0.13], bark: [0.31, 0.2, 0.1], foliage: [0.34, 0.45, 0.1],
    foliageAlt: [0.5, 0.56, 0.12], flower: [0.92, 0.52, 0.08], flowerAlt: [0.82, 0.18, 0.08],
    stone: [0.58, 0.46, 0.3], grass: [0.45, 0.4, 0.12],
  },
};

function treeParts(seed: number, preset: VegetationAssemblyPreset, palette: AssemblyPalette, variant: number): NamedPart[] {
  const species: Record<VegetationAssemblyPreset, [string, string]> = {
    "flower-island": ["Japanese_Maple", "Green_Ash"],
    "woodland-edge": ["European_Beech", "European_Aspen"],
    "dry-rockery": ["Scots_Pine", "Eastern_White_Pine"],
  };
  const category = preset === "dry-rockery" ? "Conifers" : "Broadleaves";
  return buildSpeedTreeLibraryPlant({ category, species: species[preset][variant]!, seed }, {
    quality: "proxy",
    foliageColor: variant === 0 ? palette.foliage : palette.foliageAlt,
    barkColor: palette.bark,
    params: {
      seed,
      height: 3.35 + variant * 0.25,
      trunkScale: 0.72,
      crownScale: 0.88,
      crownDepth: 0.9,
      branchCount: 0.82,
      leafDensity: 1.35,
      leafSize: 0.9,
      gnarl: 0.8,
    },
  });
}

function shrubParts(seed: number, preset: VegetationAssemblyPreset, palette: AssemblyPalette, variant: number): NamedPart[] {
  const species = preset === "dry-rockery"
    ? ["Sagebrush", "Manzanita"]
    : preset === "woodland-edge"
      ? ["American_Boxwood", "Holly"]
      : ["Azalea", "American_Boxwood"];
  return buildSpeedTreeLibraryPlant({ category: "Shrubs_&_Flowers", species: species[variant]!, seed }, {
    quality: "proxy",
    foliageColor: variant === 0 ? palette.foliage : palette.foliageAlt,
    barkColor: palette.bark,
    params: {
      seed,
      height: 0.82 + variant * 0.08,
      trunkScale: 0.7,
      crownScale: 0.82,
      branchCount: 0.86,
      leafDensity: 1.2,
      leafSize: 0.82,
    },
  });
}

function flowerCluster(seed: number, palette: AssemblyPalette, alternate: boolean): NamedPart[] {
  const stems = [];
  const petals = [];
  const centers = [];
  const count = 3 + (seed % 3);
  for (let index = 0; index < count; index++) {
    const angle = index * 2.399963 + (seed % 17) * 0.07;
    const radius = 0.08 + index * 0.055;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const height = 0.48 + ((seed + index * 7) % 9) * 0.03;
    stems.push(transform(cylinder(0.014, height, 5), { translate: vec3(x, height * 0.5, z) }));
    centers.push(transform(icosphere(0.075, 0), { translate: vec3(x, height, z) }));
    for (let petal = 0; petal < 7; petal++) {
      const petalAngle = (petal / 7) * Math.PI * 2;
      petals.push(transform(icosphere(0.09, 0), {
        translate: vec3(x + Math.cos(petalAngle) * 0.105, height, z + Math.sin(petalAngle) * 0.105),
        rotate: vec3(0, -petalAngle, 0), scale: vec3(1.45, 0.32, 0.72),
      }));
    }
  }
  const petalColor = alternate ? palette.flowerAlt : palette.flower;
  return [
    { name: "stems", label: "花茎", mesh: merge(...stems), color: palette.grass, surface: { type: "leaf", params: { color: palette.grass } } },
    { name: "petals", label: "花瓣", mesh: merge(...petals), color: petalColor, surface: { type: "flower", params: { color: petalColor } } },
    { name: "centers", label: "花心", mesh: merge(...centers), color: [0.94, 0.68, 0.12], surface: { type: "flower", params: { color: [0.94, 0.68, 0.12] } } },
  ];
}

function makeAssets(preset: VegetationAssemblyPreset): VegetationAssemblyAsset[] {
  const palette = PALETTES[preset];
  return [
    {
      id: `${preset}-ground`, label: "地被基底", species: "ground", type: "base",
      build: () => [{ name: "ground", label: "苔藓地被", mesh: transform(icosphere(1, 2), { translate: vec3(0, -0.08, 0), scale: vec3(2.28, 0.18, 2.02) }), color: palette.ground, surface: { type: "soil", params: { color: palette.ground, roughness: 0.98, scale: 2.4 } } }],
    },
    { id: `${preset}-tree-a`, label: "主景树 A", species: "tree", type: "focal", weight: 1.2, build: (seed) => treeParts(seed, preset, palette, 0) },
    { id: `${preset}-tree-b`, label: "主景树 B", species: "tree", type: "focal", build: (seed) => treeParts(seed + 19, preset, palette, 1) },
    { id: `${preset}-shrub-a`, label: "团簇灌木 A", species: "shrub", type: "mass", weight: 1.2, build: (seed) => shrubParts(seed, preset, palette, 0) },
    { id: `${preset}-shrub-b`, label: "团簇灌木 B", species: "shrub", type: "mass", build: (seed) => shrubParts(seed + 31, preset, palette, 1) },
    { id: `${preset}-flower-a`, label: "暖色花簇", species: "flower", type: "accent", build: (seed) => flowerCluster(seed, palette, false) },
    { id: `${preset}-flower-b`, label: "冷色花簇", species: "flower", type: "accent", build: (seed) => flowerCluster(seed, palette, true) },
    {
      id: `${preset}-rock-a`, label: "圆润景石", species: "rock", type: "anchor", weight: 1.2,
      build: (seed) => [{ name: "stone", label: "景石", mesh: buildRockFormationMesh({ seed, mode: "boulder", radius: 0.62, height: 0.58, blobs: 3, resolution: 16, crag: 0.12, chip: 0.035, faceCusp: 58 }), color: palette.stone, surface: { type: "stone", params: { color: palette.stone, scale: 1.5 } } }],
    },
    {
      id: `${preset}-rock-b`, label: "层叠景石", species: "rock", type: "anchor",
      build: (seed) => [{ name: "stone", label: "层叠景石", mesh: transform(buildRockFormationMesh({ seed: seed + 11, mode: "boulder", radius: 0.66, height: 0.52, blobs: 4, resolution: 16, crag: 0.1, chip: 0.025, faceCusp: 52 }), { scale: vec3(1.15, 0.72, 0.9) }), color: palette.stone, surface: { type: "stone", params: { color: palette.stone, scale: 1.8 } } }],
    },
    {
      id: `${preset}-fern`, label: "蕨类地被", species: "groundcover", type: "soft",
      build: (seed) => [{ name: "fern", label: "蕨叶", mesh: fern({ seed, fronds: 7, length: 0.72, segments: 9, leafletLength: 0.15, leafletWidth: 0.04 }), color: palette.foliageAlt, surface: { type: "leaf", params: { color: palette.foliageAlt } }, doubleSided: true }],
    },
    {
      id: `${preset}-grass`, label: "细草地被", species: "groundcover", type: "soft",
      build: (seed) => {
        const patch = grass({ seed, blades: 64, area: 0.72, height: 0.28, bend: 0.14 });
        return [{ name: "grass", label: "细草", mesh: patch.leaves, color: palette.grass, surface: { type: "leaf", params: { color: palette.grass } }, doubleSided: true }];
      },
    },
  ];
}

function slot(id: string, label: string, species: string, type: string, x: number, y: number, z: number, scale = 1): VegetationAssemblySlot {
  return { id, label, species, type, transform: { position: vec3(x, y, z), scale } };
}

function collectionFor(preset: VegetationAssemblyPreset, spread: number, treeScale: number, density: number): VegetationAssemblyCollection {
  const base: VegetationAssemblySlot[] = [
    slot("ground", "地被基底", "ground", "base", 0, -0.05, 0),
    slot("focal-tree", "后景主树", "tree", "focal", 0.55 * spread, 0, 0.65 * spread, treeScale),
    slot("anchor-rock", "右侧主景石", "rock", "anchor", 1.35 * spread, 0.02, -0.05 * spread, 1.1),
    slot("support-rock", "左侧辅景石", "rock", "anchor", -1.25 * spread, 0.01, 0.4 * spread, 0.72),
    slot("shrub-left", "左侧灌木层", "shrub", "mass", -0.8 * spread, 0, 0.15 * spread, 0.72),
    slot("shrub-center", "中景灌木层", "shrub", "mass", 0.05, 0, -0.15 * spread, 0.78),
    slot("shrub-right", "右侧灌木层", "shrub", "mass", 0.82 * spread, 0, -0.5 * spread, 0.62),
    slot("flower-front", "前景花簇", "flower", "accent", -0.2 * spread, 0.03, -1.0 * spread, 1),
    slot("flower-left", "左前花簇", "flower", "accent", -1.0 * spread, 0.03, -0.62 * spread, 0.82),
    slot("groundcover-a", "石边地被", "groundcover", "soft", 1.2 * spread, 0.04, -0.62 * spread, 0.85),
    slot("groundcover-b", "树下地被", "groundcover", "soft", 0.4 * spread, 0.03, 0.2 * spread, 0.75),
    slot("groundcover-c", "左侧地被", "groundcover", "soft", -1.45 * spread, 0.03, -0.25 * spread, 0.78),
  ];
  const mandatory = base.slice(0, 7);
  const accents = base.slice(7);
  const accentCount = Math.max(1, Math.min(accents.length, Math.round(accents.length * density)));
  return { id: `assembly-${preset}`, label: preset, slots: [...mandatory, ...accents.slice(0, accentCount)] };
}

export function buildVegetationAssemblyPreset(preset: VegetationAssemblyPreset, options: VegetationAssemblyPresetOptions = {}): NamedPart[] {
  const seed = Math.floor(options.seed ?? 7);
  const spread = Math.max(0.7, options.spread ?? 1);
  const treeScale = Math.max(0.55, options.treeScale ?? 1);
  const density = Math.max(0.2, Math.min(1, options.density ?? 1));
  const presetTreeScale = treeScale * (preset === "dry-rockery" ? 0.84 : 1);
  return buildVegetationAssembly(collectionFor(preset, spread, presetTreeScale, density), makeAssets(preset), {
    seed,
    seedPosition: vec3(options.locationX ?? 0, 0, options.locationZ ?? 0),
    randomizeAssets: true,
    positionJitter: 0.055 * spread,
    yawJitter: 0.22,
    scaleJitter: 0.08,
  });
}
