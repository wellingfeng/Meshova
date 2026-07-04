import type { PlantResult, TreeOptions, ShrubOptions, ConiferOptions, PalmOptions } from "./plant.js";
import { tree, shrub, conifer, palm } from "./plant.js";
import type { LeafShape } from "./leaf.js";

export type VegetationSpecies =
  | "oak"
  | "maple"
  | "birch"
  | "willow"
  | "pine"
  | "spruce"
  | "palm"
  | "shrub";

export type VegetationKind = "tree" | "shrub" | "conifer" | "palm";

export interface VegetationSpeciesPreset {
  id: VegetationSpecies;
  label: string;
  kind: VegetationKind;
  barkColor: [number, number, number];
  leafColor: [number, number, number];
  leafShape?: LeafShape;
  tree?: TreeOptions;
  shrub?: ShrubOptions;
  conifer?: ConiferOptions;
  palm?: PalmOptions;
}

export interface VegetationSpeciesOverrides extends Partial<Omit<VegetationSpeciesPreset, "id" | "kind">> {
  tree?: Partial<TreeOptions>;
  shrub?: Partial<ShrubOptions>;
  conifer?: Partial<ConiferOptions>;
  palm?: Partial<PalmOptions>;
}

export const VEGETATION_SPECIES_PRESETS: Record<VegetationSpecies, VegetationSpeciesPreset> = {
  oak: {
    id: "oak",
    label: "Oak",
    kind: "tree",
    barkColor: [0.31, 0.21, 0.13],
    leafColor: [0.16, 0.36, 0.12],
    leafShape: "oval",
    tree: {
      height: 4.6,
      trunkRadius: 0.34,
      branchCount: 8,
      depth: 3,
      branchAngle: 54,
      gnarl: 0.18,
      leafDensity: 10,
      leafSize: 0.2,
      leafShape: "oval",
      leafFold: 0.12,
      branchFlareScale: 2.0,
      branchLengthProfile: [{ t: 0, value: 1.35 }, { t: 0.55, value: 1.05 }, { t: 1, value: 0.55 }],
      branchRadiusProfile: [{ t: 0, value: 1.15 }, { t: 1, value: 0.75 }],
      leafDensityProfile: [{ t: 0, value: 0.35 }, { t: 0.55, value: 1.1 }, { t: 1, value: 0.9 }],
      canopy: { shape: "ellipsoid", baseY: 1.05, height: 3.65, radiusX: 2.05, radiusZ: 1.8, strength: 0.85, minScale: 0.18 },
      branchFeatures: { count: 12, size: 1.1, minBranchRadius: 0.045 },
    },
  },
  maple: {
    id: "maple",
    label: "Maple",
    kind: "tree",
    barkColor: [0.34, 0.24, 0.17],
    leafColor: [0.22, 0.46, 0.14],
    leafShape: "round",
    tree: {
      height: 4.2,
      trunkRadius: 0.24,
      branchCount: 9,
      depth: 3,
      branchAngle: 46,
      gnarl: 0.1,
      leafDensity: 11,
      leafSize: 0.17,
      leafShape: "round",
      leafFold: 0.08,
      branchLengthProfile: [{ t: 0, value: 1.05 }, { t: 0.55, value: 1.2 }, { t: 1, value: 0.6 }],
      leafDensityProfile: [{ t: 0, value: 0.45 }, { t: 0.7, value: 1.15 }, { t: 1, value: 0.85 }],
      canopy: { shape: "ellipsoid", baseY: 1.0, height: 3.2, radiusX: 1.65, radiusZ: 1.55, strength: 0.8, minScale: 0.15 },
      branchFeatures: { count: 6, size: 0.9, minBranchRadius: 0.04 },
    },
  },
  birch: {
    id: "birch",
    label: "Birch",
    kind: "tree",
    barkColor: [0.72, 0.68, 0.58],
    leafColor: [0.24, 0.5, 0.16],
    leafShape: "teardrop",
    tree: {
      height: 5.1,
      trunkRadius: 0.18,
      branchCount: 6,
      depth: 3,
      branchAngle: 38,
      gnarl: 0.08,
      leafDensity: 8,
      leafSize: 0.15,
      leafShape: "teardrop",
      leafCurl: 0.12,
      branchLengthProfile: [{ t: 0, value: 0.75 }, { t: 0.55, value: 0.95 }, { t: 1, value: 0.45 }],
      branchAngleProfile: [{ t: 0, value: 0.75 }, { t: 1, value: 1.05 }],
      leafDensityProfile: [{ t: 0, value: 0.25 }, { t: 0.65, value: 1.0 }, { t: 1, value: 0.7 }],
      canopy: { shape: "column", baseY: 1.25, height: 3.9, radiusX: 1.05, radiusZ: 0.95, strength: 0.9, minScale: 0.2 },
      branchFeatures: { count: 8, kind: "scar", size: 0.75, minBranchRadius: 0.035 },
    },
  },
  willow: {
    id: "willow",
    label: "Willow",
    kind: "tree",
    barkColor: [0.28, 0.2, 0.13],
    leafColor: [0.18, 0.43, 0.14],
    leafShape: "lanceolate",
    tree: {
      height: 4.8,
      trunkRadius: 0.24,
      branchCount: 10,
      depth: 3,
      branchAngle: 62,
      gnarl: 0.14,
      leafDensity: 13,
      leafSize: 0.16,
      leafShape: "lanceolate",
      leafCurl: -0.2,
      leafFold: 0.18,
      branchLengthProfile: [{ t: 0, value: 1.1 }, { t: 0.55, value: 1.35 }, { t: 1, value: 0.9 }],
      branchAngleProfile: [{ t: 0, value: 1.15 }, { t: 1, value: 1.35 }],
      leafDensityProfile: [{ t: 0, value: 0.55 }, { t: 0.65, value: 1.25 }, { t: 1, value: 1.1 }],
      canopy: { shape: "umbrella", baseY: 1.15, height: 3.7, radiusX: 1.85, radiusZ: 1.7, strength: 0.75, minScale: 0.2 },
      branchFeatures: { count: 9, size: 0.95, minBranchRadius: 0.04 },
    },
  },
  pine: {
    id: "pine",
    label: "Pine",
    kind: "conifer",
    barkColor: [0.26, 0.17, 0.1],
    leafColor: [0.1, 0.28, 0.13],
    conifer: {
      height: 5.6,
      trunkRadius: 0.17,
      whorls: 9,
      perWhorl: 6,
      needleDensity: 5,
    },
  },
  spruce: {
    id: "spruce",
    label: "Spruce",
    kind: "conifer",
    barkColor: [0.23, 0.16, 0.11],
    leafColor: [0.08, 0.22, 0.11],
    conifer: {
      height: 6.2,
      trunkRadius: 0.16,
      whorls: 12,
      perWhorl: 7,
      needleDensity: 6,
    },
  },
  palm: {
    id: "palm",
    label: "Palm",
    kind: "palm",
    barkColor: [0.4, 0.3, 0.18],
    leafColor: [0.22, 0.46, 0.16],
    palm: {
      height: 5,
      trunkRadius: 0.14,
      fronds: 10,
      frondLength: 1.9,
      lean: 0.42,
    },
  },
  shrub: {
    id: "shrub",
    label: "Shrub",
    kind: "shrub",
    barkColor: [0.27, 0.19, 0.12],
    leafColor: [0.32, 0.55, 0.18],
    leafShape: "oval",
    shrub: {
      height: 1.4,
      stems: 6,
      spread: 0.3,
      leafDensity: 11,
      leafSize: 0.12,
      leafShape: "oval",
      leafFold: 0.1,
    },
  },
};

export function vegetationSpeciesPreset(
  species: VegetationSpecies,
  overrides: VegetationSpeciesOverrides = {},
): VegetationSpeciesPreset {
  const base = VEGETATION_SPECIES_PRESETS[species];
  const {
    tree: treeOverride,
    shrub: shrubOverride,
    conifer: coniferOverride,
    palm: palmOverride,
    ...rest
  } = overrides;
  const out: VegetationSpeciesPreset = {
    ...base,
    ...rest,
    id: base.id,
    kind: base.kind,
  };
  if (base.tree || treeOverride) out.tree = { ...(base.tree ?? {}), ...(treeOverride ?? {}) };
  if (base.shrub || shrubOverride) out.shrub = { ...(base.shrub ?? {}), ...(shrubOverride ?? {}) };
  if (base.conifer || coniferOverride) out.conifer = { ...(base.conifer ?? {}), ...(coniferOverride ?? {}) };
  if (base.palm || palmOverride) out.palm = { ...(base.palm ?? {}), ...(palmOverride ?? {}) };
  return out;
}

export function buildSpeciesPlant(
  species: VegetationSpecies,
  overrides: VegetationSpeciesOverrides = {},
): PlantResult {
  const preset = vegetationSpeciesPreset(species, overrides);
  if (preset.kind === "tree") return tree(preset.tree);
  if (preset.kind === "shrub") return shrub(preset.shrub);
  if (preset.kind === "conifer") return conifer(preset.conifer);
  return palm(preset.palm);
}
