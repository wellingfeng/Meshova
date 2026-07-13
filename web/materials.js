/**
 * Browser-side material baking. Calls the SAME Meshova procedural presets the
 * Node export uses (from /dist), evaluates them per-texel into three.js
 * DataTextures. Nothing here loads a static image; every map is computed.
 */
import * as THREE from "three";
import {
  CONTENT_MATERIALS,
  CONTENT_MATERIAL_PARAM_SCHEMA,
  defaultContentMaterialParams,
} from "/dist/web-content/content/index.js?v=pcg2";
import {
  materialFromFields,
  PRESETS,
  PRESET_PARAM_SCHEMA,
  defaultMatParams,
  MATERIAL_BUILDERS,
  SBS_REPRO,
  SBS_PARAM_SCHEMA,
  defaultSbsParams,
  BILIBILI_MATERIALS,
  BILIBILI_MATERIAL_DEFINITIONS,
  BILIBILI_MATERIAL_PARAM_SCHEMA,
  defaultBilibiliMaterialParams,
  STYLE_CASE_MATERIALS,
  STYLE_CASE_DEFINITIONS,
  STYLE_CASE_PARAM_SCHEMA,
  defaultStyleCaseParams,
  PRODUCTION_STUDY_MATERIALS,
  PRODUCTION_STUDY_DEFINITIONS,
  PRODUCTION_STUDY_PARAM_SCHEMA,
  defaultProductionStudyParams,
  URBAN_MATERIALS,
  URBAN_MATERIAL_DEFINITIONS,
  URBAN_MATERIAL_PARAM_SCHEMA,
  defaultUrbanMaterialParams,
  bakeUrbanMaterial as bakeUrbanMaterialTexture,
  ADVANCED_MATERIALS,
  ADVANCED_MATERIAL_DEFINITIONS,
  ADVANCED_MATERIAL_PARAM_SCHEMA,
  defaultAdvancedMaterialParams,
  THIRD_BATCH_MATERIALS,
  THIRD_BATCH_MATERIAL_DEFINITIONS,
  THIRD_BATCH_MATERIAL_PARAM_SCHEMA,
  defaultThirdBatchMaterialParams,
  FOURTH_BATCH_MATERIALS,
  FOURTH_BATCH_MATERIAL_DEFINITIONS,
  FOURTH_BATCH_MATERIAL_PARAM_SCHEMA,
  defaultFourthBatchMaterialParams,
  FIFTH_BATCH_MATERIALS,
  FIFTH_BATCH_MATERIAL_DEFINITIONS,
  FIFTH_BATCH_MATERIAL_PARAM_SCHEMA,
  defaultFifthBatchMaterialParams,
  SIXTH_BATCH_MATERIALS,
  SIXTH_BATCH_MATERIAL_DEFINITIONS,
  SIXTH_BATCH_MATERIAL_PARAM_SCHEMA,
  defaultSixthBatchMaterialParams,
  SEVENTH_BATCH_MATERIALS,
  SEVENTH_BATCH_MATERIAL_DEFINITIONS,
  SEVENTH_BATCH_MATERIAL_PARAM_SCHEMA,
  defaultSeventhBatchMaterialParams,
  EIGHTH_BATCH_MATERIALS,
  EIGHTH_BATCH_MATERIAL_DEFINITIONS,
  EIGHTH_BATCH_MATERIAL_PARAM_SCHEMA,
  defaultEighthBatchMaterialParams,
  NINTH_BATCH_MATERIALS,
  NINTH_BATCH_MATERIAL_DEFINITIONS,
  NINTH_BATCH_MATERIAL_PARAM_SCHEMA,
  defaultNinthBatchMaterialParams,
  OPENPBR_REALTIME_WGSL,
  buildSurface,
  resolvePhysical,
  resolveWaterSurfaceParams,
  SURFACE_LABELS,
  SURFACE_PARAM_SCHEMA,
  defaultSurfaceParams,
} from "/dist/index.js?v=productionstudies1";

/** Convert a Meshova float TextureBuffer to a three DataTexture. */
function bufferToDataTexture(tex, { srgb = false } = {}) {
  const { width, height, channels, data } = tex;
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * channels] ?? 0;
    const g = channels >= 3 ? data[i * channels + 1] : r;
    const b = channels >= 3 ? data[i * channels + 2] : r;
    rgba[i * 4] = Math.max(0, Math.min(255, Math.round(r * 255)));
    rgba[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
    rgba[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
    rgba[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(rgba, width, height, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/**
 * Bake a preset into a three MeshStandardMaterial with full PBR maps.
 * @param presetName one of PRESETS keys
 * @param size texture resolution
 * @param params preset params (seed, tint, color...)
 */
export function bakeStandardMaterial(presetName, size = 256, params = {}) {
  const presetFn = PRESETS[presetName];
  if (!presetFn) throw new Error("unknown preset: " + presetName);
  const fields = presetFn(params);
  const m = materialFromFields(size, fields);
  return materialFromMeshovaMaterial(m);
}

/** Build a three material from an already-assembled Meshova Material. */
function materialFromMeshovaMaterial(m) {
  const maximumEmission = maximumChannel(m.emission);
  return new THREE.MeshStandardMaterial({
    map: bufferToDataTexture(m.baseColor, { srgb: true }),
    metalnessMap: bufferToDataTexture(m.metallic),
    roughnessMap: bufferToDataTexture(m.roughness),
    normalMap: bufferToDataTexture(m.normal),
    aoMap: bufferToDataTexture(m.ao),
    emissiveMap: bufferToDataTexture(m.emission, { srgb: true }),
    emissive: new THREE.Color(maximumEmission > 0 ? 0xffffff : 0x000000),
    emissiveIntensity: maximumEmission > 0 ? 1.6 : 1,
    metalness: 1.0,
    roughness: 1.0,
    normalScale: new THREE.Vector2(1, 1),
  });
}

function maximumChannel(tex) {
  let maximum = 0;
  for (const value of tex.data) maximum = Math.max(maximum, value);
  return maximum;
}

function minimumChannel(tex) {
  let minimum = 1;
  for (const value of tex.data) minimum = Math.min(minimum, value);
  return minimum;
}

function anisotropyToDataTexture(strength, rotation) {
  const rgba = new Uint8Array(strength.width * strength.height * 4);
  for (let pixel = 0; pixel < strength.width * strength.height; pixel++) {
    const angle = (rotation.data[pixel] ?? 0) * Math.PI * 2;
    rgba[pixel * 4] = Math.round((Math.cos(angle) * 0.5 + 0.5) * 255);
    rgba[pixel * 4 + 1] = Math.round((Math.sin(angle) * 0.5 + 0.5) * 255);
    rgba[pixel * 4 + 2] = Math.round(Math.max(0, Math.min(1, strength.data[pixel] ?? 0)) * 255);
    rgba[pixel * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(rgba, strength.width, strength.height, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function colorStrengthToDataTexture(color, strength) {
  const rgba = new Uint8Array(strength.width * strength.height * 4);
  for (let pixel = 0; pixel < strength.width * strength.height; pixel++) {
    const amount = Math.max(0, Math.min(1, strength.data[pixel] ?? 0));
    rgba[pixel * 4] = Math.round(Math.max(0, Math.min(1, color.data[pixel * 3] ?? 0)) * amount * 255);
    rgba[pixel * 4 + 1] = Math.round(Math.max(0, Math.min(1, color.data[pixel * 3 + 1] ?? 0)) * amount * 255);
    rgba[pixel * 4 + 2] = Math.round(Math.max(0, Math.min(1, color.data[pixel * 3 + 2] ?? 0)) * amount * 255);
    rgba[pixel * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(rgba, strength.width, strength.height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function materialFromMeshovaExtendedMaterial(material) {
  const maximumTransmission = maximumChannel(material.transmission);
  const maximumAnisotropy = maximumChannel(material.anisotropy);
  const minimumOpacity = minimumChannel(material.opacity);
  const maximumEmission = maximumChannel(material.emission);
  const layered = material.clearcoat && material.sheen && material.iridescence;
  const parameters = {
    map: bufferToDataTexture(material.baseColor, { srgb: true }),
    metalnessMap: bufferToDataTexture(material.metallic),
    roughnessMap: bufferToDataTexture(material.roughness),
    normalMap: bufferToDataTexture(material.normal),
    aoMap: bufferToDataTexture(material.ao),
    emissiveMap: bufferToDataTexture(material.emission),
    alphaMap: bufferToDataTexture(material.opacity),
    transmissionMap: bufferToDataTexture(material.transmission),
    anisotropyMap: anisotropyToDataTexture(material.anisotropy, material.anisotropyRotation),
    metalness: 1,
    roughness: 1,
    normalScale: new THREE.Vector2(1, 1),
    emissive: new THREE.Color(maximumEmission > 0 ? 0xffffff : 0x000000),
    emissiveIntensity: material.physical.emissiveIntensity,
    transmission: maximumTransmission > 0.001 ? 1 : 0,
    anisotropy: maximumAnisotropy > 0.001 ? 1 : 0,
    ior: material.physical.ior,
    thickness: material.physical.thickness,
    dispersion: material.physical.dispersion ?? 0,
    transparent: minimumOpacity < 0.999 || maximumTransmission > 0.001,
    alphaTest: material.physical.alphaCutoff,
    side: material.physical.alphaCutoff > 0 ? THREE.DoubleSide : THREE.FrontSide,
  };
  if (layered) {
    parameters.clearcoatMap = bufferToDataTexture(material.clearcoat);
    parameters.clearcoatRoughnessMap = bufferToDataTexture(material.clearcoatRoughness);
    parameters.clearcoat = material.physical.clearcoat;
    parameters.clearcoatRoughness = material.physical.clearcoatRoughness;
    parameters.sheenColorMap = colorStrengthToDataTexture(material.sheenColor, material.sheen);
    parameters.sheen = material.physical.sheen;
    parameters.sheenColor = new THREE.Color(0xffffff);
    parameters.sheenRoughness = material.physical.sheenRoughness;
    parameters.thicknessMap = bufferToDataTexture(material.thicknessMap);
    parameters.thickness = material.physical.thickness;
    parameters.iridescenceMap = bufferToDataTexture(material.iridescence);
    parameters.iridescenceThicknessMap = bufferToDataTexture(material.iridescenceThickness);
    parameters.iridescence = material.physical.iridescence;
    parameters.iridescenceIOR = material.physical.iridescenceIor;
    parameters.iridescenceThicknessRange = [100, 900];
    parameters.attenuationDistance = material.physical.attenuationDistance;
    parameters.attenuationColor = new THREE.Color(...material.physical.attenuationColor);
  }
  return new THREE.MeshPhysicalMaterial(parameters);
}

/**
 * Bake a full-Material builder (buffer-chain recipe) into a three material.
 * Same recipes the Node PNG export uses (e.g. tileFloor).
 */
export function bakeBuilderMaterial(builderName, size = 256, params = {}) {
  const builderFn = MATERIAL_BUILDERS[builderName];
  if (!builderFn) throw new Error("unknown material builder: " + builderName);
  const m = builderFn(size, params);
  return materialFromMeshovaMaterial(m);
}

export const PRESET_NAMES = Object.keys(PRESETS);
export const BUILDER_NAMES = Object.keys(MATERIAL_BUILDERS);
export const CONTENT_MATERIAL_NAMES = Object.keys(CONTENT_MATERIALS);
export { CONTENT_MATERIAL_PARAM_SCHEMA, defaultContentMaterialParams };
export { PRESET_PARAM_SCHEMA, defaultMatParams };
/** SBS reproduction recipe names (field presets keyed by reference folder). */
export const SBS_REPRO_NAMES = Object.keys(SBS_REPRO);
export { SBS_PARAM_SCHEMA, defaultSbsParams };
export const BILIBILI_MATERIAL_NAMES = Object.keys(BILIBILI_MATERIALS);
export {
  BILIBILI_MATERIAL_DEFINITIONS,
  BILIBILI_MATERIAL_PARAM_SCHEMA,
  defaultBilibiliMaterialParams,
};
export const STYLE_CASE_MATERIAL_NAMES = Object.keys(STYLE_CASE_MATERIALS);
export {
  STYLE_CASE_DEFINITIONS,
  STYLE_CASE_PARAM_SCHEMA,
  defaultStyleCaseParams,
};
export const PRODUCTION_STUDY_MATERIAL_NAMES = Object.keys(PRODUCTION_STUDY_MATERIALS);
export {
  PRODUCTION_STUDY_DEFINITIONS,
  PRODUCTION_STUDY_PARAM_SCHEMA,
  defaultProductionStudyParams,
};
export const URBAN_MATERIAL_NAMES = Object.keys(URBAN_MATERIALS);
export {
  URBAN_MATERIAL_DEFINITIONS,
  URBAN_MATERIAL_PARAM_SCHEMA,
  defaultUrbanMaterialParams,
};
export const ADVANCED_MATERIAL_NAMES = Object.keys(ADVANCED_MATERIALS);
export {
  ADVANCED_MATERIAL_DEFINITIONS,
  ADVANCED_MATERIAL_PARAM_SCHEMA,
  defaultAdvancedMaterialParams,
};
export const THIRD_BATCH_MATERIAL_NAMES = Object.keys(THIRD_BATCH_MATERIALS);
export {
  THIRD_BATCH_MATERIAL_DEFINITIONS,
  THIRD_BATCH_MATERIAL_PARAM_SCHEMA,
  defaultThirdBatchMaterialParams,
};
export const FOURTH_BATCH_MATERIAL_NAMES = Object.keys(FOURTH_BATCH_MATERIALS);
export {
  FOURTH_BATCH_MATERIAL_DEFINITIONS,
  FOURTH_BATCH_MATERIAL_PARAM_SCHEMA,
  defaultFourthBatchMaterialParams,
};
export const FIFTH_BATCH_MATERIAL_NAMES = Object.keys(FIFTH_BATCH_MATERIALS);
export {
  FIFTH_BATCH_MATERIAL_DEFINITIONS,
  FIFTH_BATCH_MATERIAL_PARAM_SCHEMA,
  defaultFifthBatchMaterialParams,
};
export const SIXTH_BATCH_MATERIAL_NAMES = Object.keys(SIXTH_BATCH_MATERIALS);
export {
  SIXTH_BATCH_MATERIAL_DEFINITIONS,
  SIXTH_BATCH_MATERIAL_PARAM_SCHEMA,
  defaultSixthBatchMaterialParams,
};
export const SEVENTH_BATCH_MATERIAL_NAMES = Object.keys(SEVENTH_BATCH_MATERIALS);
export {
  SEVENTH_BATCH_MATERIAL_DEFINITIONS,
  SEVENTH_BATCH_MATERIAL_PARAM_SCHEMA,
  defaultSeventhBatchMaterialParams,
};
export const EIGHTH_BATCH_MATERIAL_NAMES = Object.keys(EIGHTH_BATCH_MATERIALS);
export {
  EIGHTH_BATCH_MATERIAL_DEFINITIONS,
  EIGHTH_BATCH_MATERIAL_PARAM_SCHEMA,
  defaultEighthBatchMaterialParams,
};
export const NINTH_BATCH_MATERIAL_NAMES = Object.keys(NINTH_BATCH_MATERIALS);
export {
  NINTH_BATCH_MATERIAL_DEFINITIONS,
  NINTH_BATCH_MATERIAL_PARAM_SCHEMA,
  defaultNinthBatchMaterialParams,
};

/**
 * User-facing material taxonomy. Categories describe where a material is used,
 * never which tutorial, batch, or implementation produced it.
 */
export const MATERIAL_USE_CATEGORIES = [
  {
    id: "metal-industrial",
    label: "金属与工业",
    names: [
      "rustyMetal", "corrugatedMetal", "manholeCover", "bakedSmartMaterial", "controlPanel", "Metal_Knurled_01", "Metal_Knurled_02", "Metal_Knurled_03",
      "Tiles_Metallic_01", "stylizedCoins", "sciFiIndustrialPanel", "brushedMetalGrille",
      "damagedPaintedMetal", "machinedBrushedMetal", "sciFiHardSurfacePanel",
      "sciFiHullHeightSystem",
      "sciFiHullMaterialSystem",
      "layeredAutomotivePaint", "reactionPatinatedCopper",
      "clearcoatCarbonFiber", "etchedDamascusSteel", "weldedHeatTintSteel",
      "galvanizedSpangleSteel", "powderCoatedMetal",
      "marineCorrodedSteel",
      "contactPolishedBrass", "chippedPaintedToolSteel", "seasonedCastIronCookware",
      "biofouledShipHull", "rainPatinatedCopperRoof",
      "sciFiCircuitPanel", "rustedRoundHatch", "modularTechTiles", "industrialSlats",
      "photovoltaicSolarPanel", "anodizedBrushedAluminum", "raisedDiamondTreadPlate", "interlockedChainmail",
    ],
  },
  {
    id: "wood-bamboo",
    label: "木材与竹材",
    names: [
      "wood", "Wood_Parquet_01", "Wood_Parquet_02", "Wood_Base_01",
      "Stylized_03_Wood_Planks", "Wood_OBS_01", "stylizedWoodPlanks", "redWoodPlanks",
      "bambooBlind", "bambooRaft", "bamboo", "bambooBasket", "stylizedBark",
      "stylizedWood", "treeBarkRings",
      "thermallyCharredWood",
      "laminatedPlywood",
      "trafficPolishedWoodStairs",
      "woodMaterialSystem",
      "wovenRattan",
      "exposedPlywoodEdge",
    ],
  },
  {
    id: "ground-road",
    label: "地面与道路",
    names: [
      "tileFloor", "Tiles_01", "Tiles_04", "Tiles_02", "earthyGround", "floorTiles",
      "stylizedFloorTilesA", "stylizedRoad", "realisticSteps", "stylizedFloorTilesB",
      "urbanGroundKit", "wetDrainConcrete", "wornAsphaltRoad",
      "tidalBeachSediment",
      "compactedSnowRuts", "hangarOilStainedFloor",
      "trafficWornSafetyFloor",
      "mossCobblestone", "fragmentedStoneMosaic", "wetPebbleGround",
      "chippedRoadMarkingAsphalt", "polishedTerrazzoFloor",
    ],
  },
  {
    id: "wall-facade",
    label: "墙面与建筑饰面",
    names: [
      "brickWall", "Wall_KitchenTiles_01", "Stylized_01_Bricks", "Wall_PaintedRough_01",
      "Facades_07", "facadeMaterialPipeline", "Wall_Walpaper_01", "Concrete_Decorative_01", "realisticConcreteWallA",
      "realisticConcreteWallB", "plasterWall", "stylizedStoneWall", "stylizedRedWall",
      "stylizedBrickWall", "stylizedMarble", "damagedPlasterBrick", "damagedPlasterSystem", "floodFillBrickWall",
      "continuousVeinMarble", "spalledRebarConcrete",
      "crackleCeramicGlaze", "ancientWeatheredWall",
      "rainWashedConcrete", "layeredGraffitiWall",
      "rustBleedRebarConcrete",
      "mossStoneBlocks", "rubbleStoneWall", "dressedStoneWall", "weatheredBrickWall",
      "saltWeatheredConcrete",
    ],
  },
  {
    id: "roof-tiles",
    label: "屋顶与瓦片",
    names: ["stylizedRoofTilesA", "stylizedRoofTilesB", "layeredRoofTiles", "mossRoofShingles"],
  },
  {
    id: "atmosphere-water",
    label: "大气、海洋与体积",
    names: ["evolvingCumulusCloud", "combustionFireAndSmoke", "spectralOceanSeafoam"],
  },
  {
    id: "natural-surface",
    label: "岩石与自然地表",
    names: [
      "terrain", "Stylized_06_Sand", "Stylized_08_Snow", "simpleRock", "volcanicRock",
      "meteorSurface", "stylizedGround", "stylizedDesert", "stylizedSnow", "forestGround",
      "layeredCliff", "meltingSnow", "wetMudPuddles", "coolingLava",
      "sceneAwareMossyRock", "slopeHeightTerrainBlend", "windErodedSandstone", "stylizedCellRock",
      "foldedErodedRockStrata", "deformableWetSandMud",
      "rootedForestEarth", "weatheredCliff", "mushroomStrata", "ornamentalStrata",
      "amethystCluster", "turquoiseOre", "goldenMarble", "overgrownSoil",
      "mossyLayeredRock", "fernCoveredRock", "mossyRiverPebbles",
    ],
  },
  {
    id: "vegetation-organic",
    label: "植被与有机表面",
    names: ["Stylized_15_Grass", "stylizedGrass", "vascularLeaf", "competitiveBiologicalColony", "organicCellScales", "displacedBarkMossGrowth"],
  },
  {
    id: "textile-soft",
    label: "织物、皮革与软装",
    names: ["plushFur", "stylizedBurlap", "stylizedCarpet", "wovenFabric", "wovenFabricSystem", "agedLeather", "directionalVelvetSilk", "compressedVehicleLeather", "dualLobeHumanHair", "directionalDenseFur", "geometricWovenYarn", "anisotropicLayeredFeather"],
  },
  {
    id: "glass-transparent",
    label: "玻璃、冰与透明材质",
    names: ["glassBlocks", "framedWindow", "fracturedGlacierIce", "translucentJadeWax", "dispersiveCutGem", "solidOpticalGlass", "tintedFlowingLiquid", "multiscaleCellularFoam", "iridescentSoapBubbles", "compactedSnowIceCrust", "flowingMoltenGlass"],
  },
  {
    id: "plastic-packaging",
    label: "塑料与包装",
    names: ["Plastic_01", "Plastic_02", "Plastic_03", "Plastic_04", "Plastic_BubbleWrap_01", "uvAgedPlastic", "fibrousAbsorbentPaper", "layeredCorrugatedCardboard"],
  },
  {
    id: "architectural-components",
    label: "建筑构件材质",
    names: ["stylizedColumn", "stylizedStoneColumn", "trimSheetPipeline"],
  },
  {
    id: "signage-decals",
    label: "标识与贴花",
    names: ["decalGlyphSystem"],
  },
  {
    id: "objects-decoration",
    label: "器物与装饰",
    names: ["ceramic", "lanternPaper", "ornamentalPattern", "nacreOilFilm", "holographicDiffractionFilm", "kilnFiredClay", "limescaleCeramicBasin", "carvedStoneEmblem", "crackedDiamondInlay"],
  },
  {
    id: "character-biological",
    label: "角色与生物表面",
    names: ["Skin_02", "Skin_03", "layeredHumanSkin", "anatomicalWetEye"],
  },
  {
    id: "food",
    label: "食品",
    names: ["Food_Rice_01"],
  },
  {
    id: "surface-contamination",
    label: "污染与湿痕",
    names: ["weatherStack", "contaminatedCondensationSurface", "wornMudTireRubber"],
  },
];

for (const definition of Object.values(CONTENT_MATERIALS)) {
  let category = MATERIAL_USE_CATEGORIES.find((entry) => entry.id === definition.metadata.category);
  if (!category) {
    category = {
      id: definition.metadata.category,
      label: definition.metadata.categoryLabel || definition.metadata.category,
      names: [],
    };
    MATERIAL_USE_CATEGORIES.push(category);
  }
  if (!category.names.includes(definition.id)) category.names.push(definition.id);
}

export const ALL_MATERIAL_NAMES = [
  ...CONTENT_MATERIAL_NAMES,
  ...PRODUCTION_STUDY_MATERIAL_NAMES,
  ...NINTH_BATCH_MATERIAL_NAMES,
  ...EIGHTH_BATCH_MATERIAL_NAMES,
  ...SEVENTH_BATCH_MATERIAL_NAMES,
  ...SIXTH_BATCH_MATERIAL_NAMES,
  ...FIFTH_BATCH_MATERIAL_NAMES,
  ...FOURTH_BATCH_MATERIAL_NAMES,
  ...THIRD_BATCH_MATERIAL_NAMES,
  ...ADVANCED_MATERIAL_NAMES,
  ...URBAN_MATERIAL_NAMES,
  ...BILIBILI_MATERIAL_NAMES,
  ...STYLE_CASE_MATERIAL_NAMES,
  ...SBS_REPRO_NAMES,
  ...PRESET_NAMES,
  ...BUILDER_NAMES,
];

const materialUseCategoryByName = new Map();
for (const category of MATERIAL_USE_CATEGORIES) {
  for (const name of category.names) {
    if (materialUseCategoryByName.has(name)) throw new Error(`material appears in multiple use categories: ${name}`);
    materialUseCategoryByName.set(name, category);
  }
}
const uncategorizedMaterialNames = ALL_MATERIAL_NAMES.filter((name) => !materialUseCategoryByName.has(name));
const unknownCategorizedNames = [...materialUseCategoryByName.keys()].filter((name) => !ALL_MATERIAL_NAMES.includes(name));
if (uncategorizedMaterialNames.length || unknownCategorizedNames.length) {
  throw new Error(
    `invalid material use taxonomy; uncategorized=${uncategorizedMaterialNames.join(",")}; unknown=${unknownCategorizedNames.join(",")}`,
  );
}

export function materialUseCategory(name) {
  return materialUseCategoryByName.get(name) ?? null;
}

/** True if `name` is a buffer-chain material builder rather than a field preset. */
export function isBuilder(name) {
  return Object.prototype.hasOwnProperty.call(MATERIAL_BUILDERS, name);
}

export function isContentMaterial(name) {
  return Object.prototype.hasOwnProperty.call(CONTENT_MATERIALS, name);
}

export function bakeContentMaterial(name, size = 256, params = {}) {
  const definition = CONTENT_MATERIALS[name];
  if (!definition) throw new Error("unknown content material: " + name);
  const fields = definition.build({ ...definition.defaultParams, ...params });
  return materialFromMeshovaMaterial(materialFromFields(size, fields));
}

/** True if `name` is an SBS reproduction recipe. */
export function isSbsRepro(name) {
  return Object.prototype.hasOwnProperty.call(SBS_REPRO, name);
}

export function isBilibiliMaterial(name) {
  return Object.prototype.hasOwnProperty.call(BILIBILI_MATERIALS, name);
}

export function isStyleCaseMaterial(name) {
  return Object.prototype.hasOwnProperty.call(STYLE_CASE_MATERIALS, name);
}

export function isProductionStudyMaterial(name) {
  return Object.prototype.hasOwnProperty.call(PRODUCTION_STUDY_MATERIALS, name);
}

export function materialDisplayName(name) {
  return PRODUCTION_STUDY_DEFINITIONS[name]?.label ?? STYLE_CASE_DEFINITIONS[name]?.label ?? name;
}

export function isUrbanMaterial(name) {
  return Object.prototype.hasOwnProperty.call(URBAN_MATERIALS, name);
}

export function isAdvancedMaterial(name) {
  return Object.prototype.hasOwnProperty.call(ADVANCED_MATERIALS, name);
}

export function isThirdBatchMaterial(name) {
  return Object.prototype.hasOwnProperty.call(THIRD_BATCH_MATERIALS, name);
}

export function isFourthBatchMaterial(name) {
  return Object.prototype.hasOwnProperty.call(FOURTH_BATCH_MATERIALS, name);
}

export function isFifthBatchMaterial(name) {
  return Object.prototype.hasOwnProperty.call(FIFTH_BATCH_MATERIALS, name);
}

export function isSixthBatchMaterial(name) {
  return Object.prototype.hasOwnProperty.call(SIXTH_BATCH_MATERIALS, name);
}

export function isSeventhBatchMaterial(name) {
  return Object.prototype.hasOwnProperty.call(SEVENTH_BATCH_MATERIALS, name);
}

export function isEighthBatchMaterial(name) {
  return Object.prototype.hasOwnProperty.call(EIGHTH_BATCH_MATERIALS, name);
}

export function isNinthBatchMaterial(name) {
  return Object.prototype.hasOwnProperty.call(NINTH_BATCH_MATERIALS, name);
}

/** Bake an SBS reproduction recipe into a three MeshStandardMaterial. */
export function bakeSbsReproMaterial(name, size = 256, params = {}) {
  const fn = SBS_REPRO[name];
  if (!fn) throw new Error("unknown sbs recipe: " + name);
  const m = materialFromFields(size, fn(params));
  return materialFromMeshovaMaterial(m);
}

export function bakeBilibiliMaterial(name, size = 256, params = {}) {
  const fn = BILIBILI_MATERIALS[name];
  if (!fn) throw new Error("unknown bilibili material: " + name);
  const m = materialFromFields(size, fn(params));
  return materialFromMeshovaMaterial(m);
}

export function bakeStyleCaseMaterial(name, size = 256, params = {}) {
  const fn = STYLE_CASE_MATERIALS[name];
  if (!fn) throw new Error("unknown style case material: " + name);
  return materialFromMeshovaMaterial(materialFromFields(size, fn(params)));
}

export function bakeProductionStudyMaterial(name, size = 256, params = {}) {
  const fn = PRODUCTION_STUDY_MATERIALS[name];
  if (!fn) throw new Error("unknown production study material: " + name);
  return materialFromMeshovaMaterial(materialFromFields(size, fn(params)));
}

export function bakeUrbanMaterial(name, size = 256, params = {}) {
  if (!URBAN_MATERIALS[name]) throw new Error("unknown urban material: " + name);
  const m = bakeUrbanMaterialTexture(name, size, params);
  return materialFromMeshovaMaterial(m);
}

export function bakeAdvancedMaterial(name, size = 256, params = {}) {
  const fn = ADVANCED_MATERIALS[name];
  if (!fn) throw new Error("unknown advanced material: " + name);
  return materialFromMeshovaMaterial(fn(size, params));
}

export function bakeThirdBatchMaterial(name, size = 256, params = {}) {
  const fn = THIRD_BATCH_MATERIALS[name];
  if (!fn) throw new Error("unknown third batch material: " + name);
  return materialFromMeshovaExtendedMaterial(fn(size, params));
}

export function bakeFourthBatchMaterial(name, size = 256, params = {}) {
  const fn = FOURTH_BATCH_MATERIALS[name];
  if (!fn) throw new Error("unknown fourth batch material: " + name);
  return materialFromMeshovaExtendedMaterial(fn(size, params));
}

export function bakeFifthBatchMaterial(name, size = 256, params = {}) {
  const fn = FIFTH_BATCH_MATERIALS[name];
  if (!fn) throw new Error("unknown fifth batch material: " + name);
  return materialFromMeshovaExtendedMaterial(fn(size, params));
}

export function bakeSixthBatchMaterial(name, size = 256, params = {}) {
  const fn = SIXTH_BATCH_MATERIALS[name];
  if (!fn) throw new Error("unknown sixth batch material: " + name);
  return materialFromMeshovaExtendedMaterial(fn(size, params));
}

export function bakeSeventhBatchMaterial(name, size = 256, params = {}) {
  const fn = SEVENTH_BATCH_MATERIALS[name];
  if (!fn) throw new Error("unknown seventh batch material: " + name);
  return materialFromMeshovaExtendedMaterial(fn(size, params));
}

export function bakeEighthBatchMaterial(name, size = 256, params = {}) {
  const fn = EIGHTH_BATCH_MATERIALS[name];
  if (!fn) throw new Error("unknown eighth batch material: " + name);
  const source = fn(size, params);
  const material = materialFromMeshovaExtendedMaterial(source);
  // Eighth-batch materials are dielectric and non-emissive. Keep these as
  // scalars in the WebGL fallback so transmission + iridescence stay under
  // common 16-sampler limits. Height already contributes through normalMap;
  // the full WebGPU WGSL still samples all 19 layers.
  material.metalnessMap?.dispose();
  material.metalnessMap = null;
  material.metalness = 0;
  material.emissiveMap?.dispose();
  material.emissiveMap = null;
  material.userData.openPbrWgsl = OPENPBR_REALTIME_WGSL;
  material.userData.realtimeChannelCount = 19;
  material.userData.worldScale = params.worldScale ?? 1;
  return material;
}

export function bakeNinthBatchMaterial(name, size = 256, params = {}) {
  const fn = NINTH_BATCH_MATERIALS[name];
  if (!fn) throw new Error("unknown ninth batch material: " + name);
  const source = fn(size, params);
  const material = materialFromMeshovaExtendedMaterial(source);
  material.metalnessMap?.dispose();
  material.metalnessMap = null;
  material.metalness = 0;
  if (name !== "combustionFireAndSmoke" && name !== "flowingMoltenGlass") {
    material.emissiveMap?.dispose();
    material.emissiveMap = null;
  }
  material.userData.openPbrWgsl = OPENPBR_REALTIME_WGSL;
  material.userData.volumeWgsl = source.ninthBatchRuntime.volumeWgsl;
  material.userData.volumeReference = source.ninthBatchRuntime.volumeReference;
  material.userData.displacementPlan = source.ninthBatchRuntime.displacement;
  material.userData.runtimeMode = source.ninthBatchRuntime.mode;
  material.userData.realtimeChannelCount = 19;
  return material;
}

/** Bake any known material (preset, builder or SBS repro) by name. */
export function bakeMaterial(name, size = 256, params = {}) {
  if (isContentMaterial(name)) return bakeContentMaterial(name, size, params);
  if (isBuilder(name)) return bakeBuilderMaterial(name, size, params);
  if (isSbsRepro(name)) return bakeSbsReproMaterial(name, size, params);
  if (isBilibiliMaterial(name)) return bakeBilibiliMaterial(name, size, params);
  if (isStyleCaseMaterial(name)) return bakeStyleCaseMaterial(name, size, params);
  if (isProductionStudyMaterial(name)) return bakeProductionStudyMaterial(name, size, params);
  if (isUrbanMaterial(name)) return bakeUrbanMaterial(name, size, params);
  if (isAdvancedMaterial(name)) return bakeAdvancedMaterial(name, size, params);
  if (isThirdBatchMaterial(name)) return bakeThirdBatchMaterial(name, size, params);
  if (isFourthBatchMaterial(name)) return bakeFourthBatchMaterial(name, size, params);
  if (isFifthBatchMaterial(name)) return bakeFifthBatchMaterial(name, size, params);
  if (isSixthBatchMaterial(name)) return bakeSixthBatchMaterial(name, size, params);
  if (isSeventhBatchMaterial(name)) return bakeSeventhBatchMaterial(name, size, params);
  if (isEighthBatchMaterial(name)) return bakeEighthBatchMaterial(name, size, params);
  if (isNinthBatchMaterial(name)) return bakeNinthBatchMaterial(name, size, params);
  return bakeStandardMaterial(name, size, params);
}

/**
 * Bake a SurfaceMaterial (from the surface library: glass/metal/liquid/...)
 * into a three MeshPhysicalMaterial, mapping the physical scalar layer onto the
 * renderer (transmission, ior, thickness, clearcoat, sheen, iridescence,
 * emissive). This is the path that lets glass actually look like glass instead
 * of an opaque tinted sphere. `surfaceRef` is { type, params } as attached to a
 * part; `fallbackColor` is the part's flat color when no fields/baseColor exist.
 */
export function bakeSurface(surfaceRef, size = 256, fallbackColor = [0.8, 0.8, 0.8]) {
  const sm = buildSurface(surfaceRef.type, surfaceRef.params || {});
  if (!sm) return null;
  const phys = resolvePhysical(sm.physical);
  const fields = sm.fields || {};
  const hasFields = fields.baseColor || fields.roughness || fields.metallic || fields.normalStrength;

  const mat = new THREE.MeshPhysicalMaterial();
  if (hasFields) {
    const m = materialFromFields(size, fields);
    mat.map = bufferToDataTexture(m.baseColor, { srgb: true });
    mat.metalnessMap = bufferToDataTexture(m.metallic);
    mat.roughnessMap = bufferToDataTexture(m.roughness);
    mat.normalMap = bufferToDataTexture(m.normal);
    mat.aoMap = bufferToDataTexture(m.ao);
    mat.metalness = 1.0;
    mat.roughness = 1.0;
    mat.normalScale = new THREE.Vector2(1, 1);
    // Stash the height map (grayscale) so the viewer can drive parallax-occlusion
    // mapping (POM) on demand. Not a standard MeshPhysicalMaterial slot, so it
    // lives in userData and is sampled via an onBeforeCompile injection.
    if (m.height) mat.userData.heightTex = bufferToDataTexture(m.height);
    // emission map only if the preset authored one
    if (fields.emission) mat.emissiveMap = bufferToDataTexture(m.emission, { srgb: true });
  } else {
    const c = (fields.baseColor && fields.baseColor(0.5, 0.5)) || fallbackColor;
    mat.color = new THREE.Color(c[0], c[1], c[2]);
  }

  // Physical scalar layer.
  mat.transmission = phys.transmission;
  mat.ior = phys.ior;
  mat.thickness = phys.thickness;
  mat.attenuationColor = new THREE.Color(...phys.attenuationColor);
  if (isFinite(phys.attenuationDistance)) mat.attenuationDistance = phys.attenuationDistance;
  mat.clearcoat = phys.clearcoat;
  mat.clearcoatRoughness = phys.clearcoatRoughness;
  mat.sheen = phys.sheen;
  mat.sheenColor = new THREE.Color(...phys.sheenColor);
  mat.sheenRoughness = phys.sheenRoughness;
  mat.specularIntensity = phys.specularIntensity;
  if (phys.specularColor) mat.specularColor = new THREE.Color(...phys.specularColor);
  mat.iridescence = phys.iridescence;
  mat.iridescenceIOR = phys.iridescenceIOR ?? 1.3;
  mat.iridescenceThicknessRange = [100, phys.iridescenceThickness];
  // Anisotropy (brushed metal, carbon, hair) — r185 native GGX anisotropy.
  if (phys.anisotropy) {
    mat.anisotropy = phys.anisotropy;
    mat.anisotropyRotation = phys.anisotropyRotation || 0;
  }
  // Chromatic dispersion for gems (only meaningful with transmission).
  if (phys.dispersion) mat.dispersion = phys.dispersion;

  // Emission: any surface that authored an emission field glows. The emissiveMap
  // carries the color, so emissive must be white (three multiplies them) and the
  // intensity comes from the physical layer (neon pushes it high to drive bloom).
  if (fields.emission) {
    mat.emissive = new THREE.Color(1, 1, 1);
    mat.emissiveIntensity = phys.emissiveIntensity;
    if (!mat.emissiveMap) {
      const e = fields.emission(0.5, 0.5) || [1, 1, 1];
      mat.emissive = new THREE.Color(e[0], e[1], e[2]);
    }
  }

  // Transparency render hints. NOTE: three.js transmission uses its own
  // refraction pass and must stay in the OPAQUE queue — forcing transparent=true
  // (alpha blending) breaks the transmission sampling and makes glass look milky.
  // So only flip transparent/depthWrite for genuine alpha opacity (<1); pure
  // transmissive glass keeps the defaults.
  if (phys.opacity < 1) {
    mat.transparent = true;
    mat.opacity = phys.opacity;
    mat.depthWrite = false;
  }
  mat.envMapIntensity = 1.0;
  mat.needsUpdate = true;
  return mat;
}

const WATER_BODY_CODE = { river: 0, pond: 1, ocean: 2 };

export function bakeWaterSurface(surfaceRef, size = 256, fallbackColor = [0.1, 0.35, 0.42]) {
  const params = resolveWaterSurfaceParams(surfaceRef?.params || {});
  const mat = bakeSurface({ type: "water", params }, size, fallbackColor);
  if (!mat) return null;
  const angle = params.flowAngle * Math.PI / 180;
  const bodyCode = WATER_BODY_CODE[params.body] ?? WATER_BODY_CODE.pond;

  mat.transparent = true;
  mat.opacity = 1;
  mat.depthWrite = false;
  mat.transmission = 0;
  mat.thickness = 0;
  mat.normalMap = null;
  const normalStrength = params.body === "ocean" ? 0.24 : (params.body === "river" ? 0.46 : 0.34);
  mat.normalScale.set(normalStrength, normalStrength);
  mat.envMapIntensity = params.body === "ocean" ? 1.3 : 1.15;
  mat.userData.isWaterSurface = true;
  mat.userData.waterTime = 0;
  mat.userData.waterParams = params;

  const previousCompile = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader) => {
    if (typeof previousCompile === "function") previousCompile(shader);
    shader.uniforms.uWaterTime = { value: mat.userData.waterTime || 0 };
    shader.uniforms.uWaterBody = { value: bodyCode };
    shader.uniforms.uWaterFlow = { value: new THREE.Vector2(Math.cos(angle), Math.sin(angle)) };
    shader.uniforms.uWaterWaveAmplitude = { value: params.waveAmplitude };
    shader.uniforms.uWaterWaveScale = { value: params.waveScale };
    shader.uniforms.uWaterFlowSpeed = { value: params.flowSpeed };
    shader.uniforms.uWaterFoamStrength = { value: params.foamStrength };
    shader.uniforms.uWaterShallowWidth = { value: params.shallowWidth };
    shader.uniforms.uWaterShallowOpacity = { value: params.shallowOpacity };
    shader.uniforms.uWaterDeepOpacity = { value: params.deepOpacity };
    shader.uniforms.uWaterAttenuationDistance = { value: params.attenuationDistance };
    shader.uniforms.uWaterSceneDepth = { value: null };
    shader.uniforms.uWaterDepthResolution = { value: new THREE.Vector2(1, 1) };
    shader.uniforms.uWaterCameraNear = { value: 0.1 };
    shader.uniforms.uWaterCameraFar = { value: 1000 };
    shader.uniforms.uWaterReversedDepth = { value: 0 };
    shader.uniforms.uWaterDepthAvailable = { value: 0 };
    shader.uniforms.uWaterShallowColor = { value: new THREE.Color(...params.tint) };
    shader.uniforms.uWaterDeepColor = { value: new THREE.Color(...params.deepColor) };
    shader.uniforms.uWaterSeed = { value: params.seed * 0.137 };

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
uniform float uWaterTime;
uniform float uWaterBody;
uniform vec2 uWaterFlow;
uniform float uWaterWaveAmplitude;
uniform float uWaterWaveScale;
uniform float uWaterFlowSpeed;
varying vec2 vMeshovaWaterUv;
varying vec2 vMeshovaWaterPosition;
varying float vMeshovaWaterWave;
float meshovaWaterWave(vec2 p, out vec2 gradient) {
  vec2 direction = normalize(uWaterFlow + vec2(0.0001));
  vec2 side = vec2(-direction.y, direction.x);
  float time = uWaterTime * uWaterFlowSpeed;
  float phaseA = dot(p, direction) * uWaterWaveScale * 6.28318 - time * 2.2;
  float phaseB = dot(p, side) * uWaterWaveScale * 9.7 + time * 1.35;
  float phaseC = dot(p, normalize(direction + side * 0.63)) * uWaterWaveScale * 15.1 - time * 3.1;
  float bodyAmplitude = uWaterBody > 1.5 ? 1.0 : (uWaterBody < 0.5 ? 0.55 : 0.35);
  float height = (sin(phaseA) * 0.58 + sin(phaseB) * 0.27 + sin(phaseC) * 0.15)
    * uWaterWaveAmplitude * bodyAmplitude;
  gradient = (cos(phaseA) * direction * uWaterWaveScale * 6.28318 * 0.58
    + cos(phaseB) * side * uWaterWaveScale * 9.7 * 0.27
    + cos(phaseC) * normalize(direction + side * 0.63) * uWaterWaveScale * 15.1 * 0.15)
    * uWaterWaveAmplitude * bodyAmplitude;
  return height;
}`)
      .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
vec2 meshovaWaterGradient;
meshovaWaterWave(position.xz, meshovaWaterGradient);
objectNormal = normalize(vec3(-meshovaWaterGradient.x, 1.0, -meshovaWaterGradient.y));`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
vec2 meshovaWaterGradientPosition;
float meshovaWaterHeight = meshovaWaterWave(position.xz, meshovaWaterGradientPosition);
transformed.y += meshovaWaterHeight;
vMeshovaWaterUv = uv;
vMeshovaWaterPosition = position.xz;
vMeshovaWaterWave = meshovaWaterHeight;`);

    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
#include <packing>
uniform float uWaterTime;
uniform float uWaterBody;
uniform float uWaterFlowSpeed;
uniform float uWaterFoamStrength;
uniform float uWaterShallowWidth;
uniform float uWaterShallowOpacity;
uniform float uWaterDeepOpacity;
uniform float uWaterAttenuationDistance;
uniform sampler2D uWaterSceneDepth;
uniform vec2 uWaterDepthResolution;
uniform float uWaterCameraNear;
uniform float uWaterCameraFar;
uniform float uWaterReversedDepth;
uniform float uWaterDepthAvailable;
uniform vec3 uWaterShallowColor;
uniform vec3 uWaterDeepColor;
uniform float uWaterSeed;
varying vec2 vMeshovaWaterUv;
varying vec2 vMeshovaWaterPosition;
varying float vMeshovaWaterWave;
float meshovaWaterHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32 + uWaterSeed);
  return fract(p.x * p.y);
}
float meshovaWaterNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 local = fract(p);
  local = local * local * (3.0 - 2.0 * local);
  return mix(mix(meshovaWaterHash(cell), meshovaWaterHash(cell + vec2(1.0, 0.0)), local.x),
    mix(meshovaWaterHash(cell + vec2(0.0, 1.0)), meshovaWaterHash(cell + 1.0), local.x), local.y);
}
float meshovaWaterLinearDepth(float depth) {
  return -perspectiveDepthToViewZ(depth, uWaterCameraNear, uWaterCameraFar);
}`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
vec2 meshovaScreenUv = gl_FragCoord.xy / max(uWaterDepthResolution, vec2(1.0));
float meshovaSceneDepth = unpackRGBAToDepth(texture2D(uWaterSceneDepth, meshovaScreenUv));
float meshovaWaterDepth = meshovaWaterLinearDepth(gl_FragCoord.z);
float meshovaBehindDepth = meshovaWaterLinearDepth(meshovaSceneDepth);
bool meshovaWaterBackground = uWaterReversedDepth > 0.5
  ? meshovaSceneDepth <= 0.0001
  : meshovaSceneDepth >= 0.9999;
float meshovaWaterColumn = meshovaWaterBackground
  ? uWaterAttenuationDistance * 4.0
  : max(0.0, meshovaBehindDepth - meshovaWaterDepth);
meshovaWaterColumn = mix(uWaterAttenuationDistance * 2.0, meshovaWaterColumn, uWaterDepthAvailable);
float meshovaDepthRange = max(0.08, uWaterAttenuationDistance * 0.075);
float meshovaDepthMix = smoothstep(0.015, meshovaDepthRange, meshovaWaterColumn);
vec3 meshovaWaterColor = mix(uWaterShallowColor, uWaterDeepColor, meshovaDepthMix);
float meshovaFresnel = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 4.0);
float meshovaFresnelTint = uWaterBody < 0.5 ? 0.08 : (uWaterBody > 1.5 ? 0.2 : 0.12);
meshovaWaterColor = mix(meshovaWaterColor, vec3(0.68), meshovaFresnel * meshovaFresnelTint);
float meshovaTime = uWaterTime * uWaterFlowSpeed;
float meshovaShoreDistance = max(0.025, uWaterShallowWidth);
vec2 meshovaFoamUv = uWaterBody < 0.5
  ? vec2(vMeshovaWaterUv.y * 18.0 - meshovaTime * 2.4, vMeshovaWaterUv.x * 13.0)
  : vMeshovaWaterPosition * 2.4 + vec2(meshovaTime * 0.28, -meshovaTime * 0.19);
float meshovaFoamNoise = meshovaWaterNoise(meshovaFoamUv) * 0.68 + meshovaWaterNoise(meshovaFoamUv * 2.13 + 7.1) * 0.32;
float meshovaShoreMask = 1.0 - smoothstep(meshovaShoreDistance * 0.12, meshovaShoreDistance, meshovaWaterColumn);
float meshovaShorePhase = meshovaWaterColumn / meshovaShoreDistance * 5.5 - meshovaTime * 1.8 + meshovaFoamNoise * 3.4;
float meshovaShoreBand = smoothstep(0.5, 0.9, sin(meshovaShorePhase) * 0.5 + 0.5);
float meshovaShoreFoam = meshovaShoreMask * mix(0.12, 0.82, meshovaShoreBand) * smoothstep(0.34, 0.78, meshovaFoamNoise);
float meshovaCrestFoam = uWaterBody > 1.5 ? smoothstep(0.045, 0.16, vMeshovaWaterWave) * smoothstep(0.48, 0.82, meshovaFoamNoise) : 0.0;
vec2 meshovaRiverUv = vec2(vMeshovaWaterUv.x * 9.0, vMeshovaWaterUv.y * 2.8 - meshovaTime * 1.9);
float meshovaRiverNoise = meshovaWaterNoise(meshovaRiverUv) * 0.62
  + meshovaWaterNoise(meshovaRiverUv * vec2(2.4, 0.72) + 11.7) * 0.38;
float meshovaRiverThread = smoothstep(0.7, 0.93,
  sin((vMeshovaWaterUv.x * 7.0 + meshovaRiverNoise * 0.32) * 6.28318) * 0.5 + 0.5);
float meshovaRiverPatch = smoothstep(0.58, 0.82, meshovaRiverNoise);
float meshovaRiverInterior = smoothstep(0.015, 0.14, vMeshovaWaterUv.x)
  * (1.0 - smoothstep(0.86, 0.985, vMeshovaWaterUv.x));
float meshovaRiverFlowFoam = uWaterBody < 0.5
  ? meshovaRiverInterior * (meshovaRiverPatch * 0.72 + meshovaRiverThread * 0.28) * 0.5
  : 0.0;
float meshovaFoam = clamp((meshovaShoreFoam + meshovaCrestFoam + meshovaRiverFlowFoam) * uWaterFoamStrength, 0.0, 0.88);
diffuseColor.rgb = mix(meshovaWaterColor, vec3(0.88, 0.96, 0.98), meshovaFoam);
float meshovaDepthAlpha = mix(uWaterShallowOpacity, uWaterDeepOpacity, meshovaDepthMix);
diffuseColor.a = clamp(meshovaDepthAlpha + meshovaFresnel * 0.08 + meshovaFoam * 0.28, 0.05, 0.98);`);

    mat.userData.waterUniforms = shader.uniforms;
  };
  mat.customProgramCacheKey = () => "meshova-water-v7";
  mat.needsUpdate = true;
  return mat;
}

/** All built-in surface type ids (glass/metal/marble/skin/...). */
export const SURFACE_NAMES = Object.keys(SURFACE_LABELS);
/** zh-CN labels keyed by surface type id, for the viewer dropdown. */
export const SURFACE_LABEL_MAP = SURFACE_LABELS;
/** Editable param schema + defaults per surface type (re-exported for the viewer). */
export { SURFACE_PARAM_SCHEMA, defaultSurfaceParams };

/** True if `name` is a named surface type (vs. a field preset / builder). */
export function isSurface(name) {
  return Object.prototype.hasOwnProperty.call(SURFACE_LABELS, name);
}

/**
 * Bake a named surface type globally for preview (applies one surface to a whole
 * model). Returns a MeshPhysicalMaterial; falls back to a flat material when the
 * surface name is unknown.
 */
export function bakeSurfaceByName(name, size = 256, fallbackColor = [0.8, 0.8, 0.8]) {
  return bakeSurface({ type: name, params: {} }, size, fallbackColor);
}
