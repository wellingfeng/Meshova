/**
 * Procedural model definitions for the live editor.
 *
 * A ProcModel is a recipe, not data: a parameter `schema` plus a `build(params)`
 * function that calls Meshova geometry functions to produce named, colored
 * parts. The viewer renders build() output and re-runs it whenever a parameter
 * changes — so what's on screen is always a live procedural model.
 *
 * Everything here imports from /dist (the same library Node uses), keeping the
 * browser and CLI on one code path.
 */
import {
  box,
  sphere,
  plane,
  transform,
  scaleMesh,
  translateMesh,
  subdivide,
  displaceByNoise,
  array,
  cylinder,
  cone,
  torus,
  icosphere,
  catmullClark,
  merge,
  helix,
  bezier,
  polyline,
  smoothCurve,
  controlCurve,
  sampleCurveAttribute,
  curveLength,
  sweep,
  poissonScatter,
  union,
  subtract,
  intersect,
  voxelRemesh,
  boxUV,
  cleanMesh,
  withAttributes,
  displaceField,
  indentCreases,
  scalarRamp,
  makePointCloud,
  storePointAttribute,
  pointAttribute,
  copyToPoints,
  surfacePointCloud,
  scatterAlongCurve,
  scatterGrid,
  applyRules,
  ruleCadence,
  ruleLookAt,
  ruleDistanceToNeighbors,
  ruleClipToPolygon,
  ruleScale,
  ruleJitterPosition,
  partitionByAttribute,
  ruleNormalToDensity,
  ruleDensityNoise,
  ruleDensityPrune,
  ruleSelfPruning,
  ruleSlopeFilter,
  ruleVariantByHeight,
  ruleScaleJitter,
  ruleYawJitter,
  ruleClipToCurveBand,
  ruleWeightedFill,
  pruneMasked,
  copyAssembliesToPoints,
  scatterToLayers,
  bakeVertexColors,
  triplanarColor,
  terrainAutoMaterial,
  fbmPattern,
  makeNoise,
  fbm2,
  vec2,
  vec3,
  buildSportsCarParts,
  buildGmcCanyonAt4xParts,
  buildBuickRiviera1965Parts,
  buildProceduralVehicleVariant,
  buildProceduralVehicleParts,
  PROCEDURAL_VEHICLE_VARIANTS,
  buildModularVehicleParts,
  buildModularRescueRoverParts,
  buildCartoonMechPilotParts,
  buildStylizedHumanoidParts,
  buildBuildingParts,
  buildUrbanBuildingParts,
  urbanDefaults,
  buildJapaneseStreetBuildingParts,
  buildHongKongCyberHouseParts,
  buildKowloonCyberCourtyardParts,
  buildChineseHallParts,
  buildMountainVillageParts,
  buildXianxiaMountainsParts,
  buildCreamSofaParts,
  buildBlendReferenceFurnishingParts,
  BLEND_REFERENCE_FURNISHINGS,
  buildBlendReferencePlantParts,
  BLEND_REFERENCE_PLANTS,
  buildBlendReferenceInteriorParts,
  BLEND_REFERENCE_INTERIORS,
  buildSweetHomeStaircaseParts,
  SWEET_HOME_STAIR_MODELS,
  buildPolyHavenPropParts,
  POLY_HAVEN_PROP_MODELS,
  buildReferenceBenchmarkParts,
  REFERENCE_BENCHMARK_MODELS,
  buildSweetHomeFurnishingParts,
  SWEET_HOME_FURNISHING_MODELS,
  SWEET_HOME_FURNISHING_SOURCE_PAGE,
  buildInteriorCombinationParts,
  buildInteriorSystemParts,
  INTERIOR_COMBINATION_MODELS,
  INTERIOR_SYSTEM_MODELS,
  buildRoomShellPresetParts,
  buildStorageRoomSuiteParts,
  buildStorageWallParts,
  ROOM_SHELL_MODELS,
  STORAGE_ROOM_SUITE_DEFAULTS,
  STORAGE_WALL_MODELS,
  BATHROOM_FIXTURE_MODELS,
  BATHROOM_SUITE_MODELS,
  buildBathroomFixtureParts,
  buildBathroomSuiteParts,
  buildRoomLayoutParts,
  ROOM_LAYOUT_MODELS,
  buildExpansionSystemParts,
  EXPANSION_SYSTEM_MODELS,
  buildHouseGardenParts,
  HOUSE_GARDEN_VARIANTS,
  buildPcgCartoonHouseParts,
  buildMidnightHorseParts,
  buildReferenceDogParts,
  buildCityBlockParts,
  buildCityDistrictParts,
  buildNightMetropolisParts,
  buildGardenMetropolisParts,
  buildRomanTownParts,
  CITYGEN_DEFAULTS,
  buildCitygenParts,
  WATABOU_CITY_DEFAULTS,
  buildWatabouCityParts,
  TOWNSCAPER_DEFAULTS,
  buildTownscaperParts,
  CHINESE_TOWNSCAPER_DEFAULTS,
  buildChineseTownscaperParts,
  cityBlocks,
  ringToPlate,
  parcelOBB,
  polygonCentroidXZ,
  buildStreetsceneParts,
  buildInteriorRoomParts,
  buildProceduralBuildingParts,
  buildHardSurfaceKitParts,
  buildTerrainIslandParts,
  buildLunarCraterSurfaceParts,
  buildProceduralPlanetParts,
  buildCropoutIslandPresetParts,
  buildStylizedOceanEnvironmentParts,
  buildCloudParts,
  buildCloudSkyParts,
  buildLowPolyVillageParts,
  buildLowPolyCloudValleyParts,
  buildLowPolyTropicalIslandParts,
  buildLowPolyTreeKitParts,
  buildStylizedLakesideVillageParts,
  buildStylizedTacticalIslandParts,
  buildProceduralCastleParts,
  buildBilibiliManorCastleParts,
  BILIBILI_CASTLE_SERIES,
  buildBilibiliCastleSeriesParts,
  BLENDER_119_SCENES,
  buildBlender119SceneParts,
  buildMessengerPlanetParts,
  buildWaterfallParts,
  buildProceduralRiverParts,
  buildRiverLakeParts,
  buildPcgBiomeRiverParts,
  buildVineParts,
  buildVineStemMesh,
  buildIvyRuinsParts,
  buildVineCoveredRockParts,
  buildLowPolyIvyParts,
  buildLowPolyIvyKitParts,
  buildCrazyIvyWallParts,
  buildRootsParts,
  buildRootMesh,
  buildRockFormationParts,
  buildRockFormationMesh,
  buildRockBorderSceneParts,
  buildStylizedRockIslandParts,
  buildPcgRockClusterParts,
  buildPcgSnowSceneParts,
  buildEasyCliffRockParts,
  buildRealisticSplinePathParts,
  buildPcgSplineCurbParts,
  buildPcgSplineCurbPresetParts,
  PCG_SPLINE_CURB_PRESETS,
  buildHoudiniCaveParts,
  buildUe5PcgCaveParts,
  buildAttractorGridParts,
  buildBraidRopeParts,
  buildSpiralScalesParts,
  buildDnaHelixParts,
  buildGradientBoxParts,
  buildRainingGardenParts,
  buildBlenderHowtosShowcaseParts,
  buildRockTileParts,
  buildVoronoiPipeParts,
  buildWafflePatternParts,
  buildReactionDiffusionPlateParts,
  buildGrasshopperHowtosShowcaseParts,
  buildPackedCircleParts,
  buildLandscapeContourParts,
  buildRibbonLoopParts,
  buildVoxelBunnyParts,
  buildImageFieldReliefParts,
  buildMeshReactionShellParts,
  buildSuperformulaTowerParts,
  buildOrigamiPavilionParts,
  buildReactionDiffusionReliefParts,
  buildField3DBlobParts,
  buildPipeNetworkParts,
  buildWovenPotParts,
  buildSciFiPanelParts,
  buildGrowthUrchinParts,
  buildBspDungeonParts,
  buildDungeonArchitectParts,
  buildRandomDungeonParts,
  buildVoronoiVaseParts,
  buildHoudiniHowtosShowcaseParts,
  buildGradationalCrystalParts,
  buildFabcafeWavySurfaceParts,
  buildFabcafeTwistTowerParts,
  buildFabcafeHoudiniShowcaseParts,
  buildRoofGeneratorParts,
  ARCHITECTURAL_ROOF_MODELS,
  buildArchitecturalRoofParts,
  ARTICULATED_FURNITURE_MODELS,
  buildArticulatedFurnitureParts,
  buildImageRemeshParts,
  ruleVariantBySlope,
  buildPolygonIslandParts,
  buildTerrainField,
  buildPcgForestParts,
  buildVegetationAssemblyPreset,
  buildEcosystemArtToolParts,
  buildEcosystemFeatureParts,
  buildPcgPathfindingParts,
  classifyBiomes,
  overworldBiomeTable,
  scatterPointsOnField,
  buildTShirt,
  buildSkirt,
  buildPants,
  buildDress,
  buildHoodie,
  buildAvatar,
  solveCloth,
  getFabric,
  tree,
  scatterLeaves,
  growingTree,
  shrub,
  grass,
  conifer,
  palm,
  fern,
  buildTreeFromGuide,
  buildSpeciesPlant,
  treeGuideFromSilhouette,
  vegetationSpeciesPreset,
  windWeights,
  foliageWindWeights,
  windChannels,
  buildSpeedTreeLibraryPlant,
  defaultSpeedTreeLibraryParams,
  inferSpeedTreeLibraryRecipe,
  speedTreeLibraryId,
  segmentedTube,
  bendMesh,
  taperMesh,
  twistMesh,
  stretchMesh,
  metaballs,
  fuseSpheres,
  roadRibbon,
  roadCurbs,
  roadCenterLine,
  roadLaneLines,
  roadEdgeLines,
  roadGuardrail,
  roadsidePlacements,
  buildFreewayParts,
  buildMultilevelInterchangeParts,
  buildResidentialCommunityParts,
  buildRailwayParts,
  buildViaductParts,
  buildSuspensionBridgeParts,
  buildPcgBrickWallParts,
  buildPcgPalisadeWallParts,
  buildSplineStoneWallParts,
  buildTitanRailParts,
  buildTitanFenceParts,
  buildTitanCableParts,
  buildTitanAdBoardParts,
  buildTitanShrubParts,
  buildTitanPlatformParts,
  buildTitanBuildingParts,
  buildTitanStackingParts,
  buildTitanTrainParts,
  buildTitanTreeParts,
  buildTitanClothParts,
  buildPylonParts,
  buildTowerCraneParts,
  buildWindTurbineParts,
  buildTollStationParts,
  buildTunnelPortalParts,
  buildRooftopKitParts,
  buildScaffoldingParts,
  buildBusStopParts,
  buildBicycleParts,
  buildBillboardParts,
  buildContainerYardParts,
  buildManholeCoverParts,
  buildBarrierRunParts,
  buildFireEscapeParts,
  buildNewsstandParts,
  buildTrafficSignalParts,
  buildUmbrellaTableParts,
  buildStreetTreeParts,
  buildStreetLampParts,
  buildFireHydrantParts,
  buildParkBenchParts,
  buildTrashcanParts,
  buildTrafficConeParts,
  buildFreewaySignParts,
  buildMaterialStackParts,
  buildWaterTowerParts,
  buildProceduralWaterwheelParts,
  buildSidefxModularHouseParts,
  buildHoudiniLakeHouseParts,
  buildSolarisMarketParts,
  buildProceduralCactusParts,
  buildProceduralSiloParts,
  buildProceduralGameMapParts,
  buildDualGridFarmParts,
  buildDualGridForestCampParts,
  buildDualGridRiverMillParts,
  buildDualGridHillShrineParts,
  buildDualGridMarshRuinsParts,
  buildPcgCellMapParts,
  buildPcgRiverValleyParts,
  buildSurfaceSketchVineParts,
  buildCliffPanelStudyParts,
  buildRaycastRoofGardenParts,
  buildRaycastAsteroidGardenParts,
  buildRaycastCliffLightsParts,
  buildRiceFieldParts,
  buildWfcRooftopParts,
  buildIntersectionParts,
  buildRoundaboutTrafficParts,
  makeTerrainPrimitiveField,
  heightfieldToTerrainMesh,
  sampleField2DBilinear,
  makeMesh,
  recomputeNormals,
  deformByControlLattice,
  computeNormals,
  lathe,
  makeRng,
  buildDrawableFenceParts,
  buildRegionGroveParts,
  buildPathLightsParts,
  DRAWABLE_FENCE_WORKFLOW,
  REGION_GROVE_WORKFLOW,
  PATH_LIGHTS_WORKFLOW,
} from "/dist/index.js?v=lowpoly1";
import { SPEEDTREE_TUTORIAL_MODELS } from "/web/speedtree-tutorial-procmodels.js?v=cloth2";
import { CONTENT_MODELS } from "/dist/web-content/content/index.js?v=pcg2";

/** @typedef {{ key:string, label:string, min:number, max:number, step:number, default:number }} ParamSpec */

function part(name, mesh, color) {
  return { name, mesh, color };
}

/**
 * A part that carries a matched surface material (glass/metal/liquid/...).
 * `type` is a SURFACE_LIBRARY key, `params` tunes it. The viewer's "跟随模型"
 * mode bakes this into a MeshPhysicalMaterial, so model + material stay matched.
 */
function surfPart(name, mesh, type, params) {
  return { name, mesh, color: (params && params.color) || (params && params.tint) || [0.8, 0.8, 0.8], surface: params ? { type, params } : { type } };
}

function roundedBoxMesh(w, h, d, iterations = 1) {
  return catmullClark(box(w, h, d), iterations);
}

/** Deterministic 0..1 PRNG (mulberry32) so the rock pile is reproducible per seed. */
function mulberry32(seed) {
  let a = seed >>> 0 || 1;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lift a mesh so its lowest vertex sits on y=0 (rocks rest on the ground). */
function dropToGround(m) {
  let minY = Infinity;
  for (const p of m.positions) if (p.y < minY) minY = p.y;
  return Number.isFinite(minY) ? translateMesh(m, vec3(0, -minY, 0)) : m;
}

/**
 * World-space triplanar UV reprojection. After non-uniform scaling, a mesh's
 * original UVs get stretched — projecting UVs from world position (per the
 * dominant normal axis) keeps texel density uniform regardless of scale.
 * `density` is texture repeats per world unit.
 */
function triplanarUV(m, density = 1) {
  const uvs = m.positions.map((p, i) => {
    const n = m.normals[i];
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    let u, v;
    if (ax >= ay && ax >= az) { u = p.z; v = p.y; }       // facing X -> ZY plane
    else if (ay >= ax && ay >= az) { u = p.x; v = p.z; }  // facing Y -> XZ plane
    else { u = p.x; v = p.y; }                            // facing Z -> XY plane
    return vec2(u * density, v * density);
  });
  return { positions: m.positions, normals: m.normals, uvs, indices: m.indices };
}

/**
 * A surface part with a per-vertex wind weight attached, so the viewer's wind
 * shader sways it. `mode` "tree" anchors by height (trunks/branches), "foliage"
 * makes everything sway (leaf cards / grass blades).
 */
function windSurfPart(name, mesh, type, params, mode = "tree") {
  const sp = surfPart(name, mesh, type, params);
  sp.windWeight = mode === "foliage" ? foliageWindWeights(mesh, 0.55, 0.45) : windWeights(mesh, {});
  if (mode === "foliage") sp.doubleSided = true;
  return sp;
}

function speedTreePart(name, mesh, type, params, windKind, seed) {
  const sp = surfPart(name, mesh, type, params);
  sp.windWeight = windChannels(mesh, { kind: windKind, seed }).combined;
  if (windKind === "foliage" || windKind === "grass" || windKind === "frond") sp.doubleSided = true;
  return sp;
}

function normalizedSpeedTreeLibraryEntry(input) {
  const entry = input && input.entry ? input.entry : input;
  return {
    category: String(entry?.category || "SpeedTree"),
    species: String(entry?.species || "Unknown"),
    ...(entry?.variant ? { variant: String(entry.variant) } : {}),
    ...(entry?.relPath ? { relPath: String(entry.relPath) } : {}),
    ...(Number.isFinite(Number(entry?.seed)) ? { seed: Number(entry.seed) } : {}),
  };
}

function speedTreeLibrarySchema(entry, defaults, recipe) {
  const hMax = Math.max(2, defaults.height * 2.2);
  const cactus = recipe?.kind === "cactus";
  return [
    { key: "seed", label: "随机种子", min: 0, max: 999999, step: 1, default: defaults.seed },
    { key: "height", label: "整体高度", min: 0.2, max: hMax, step: 0.05, default: defaults.height },
    { key: "trunkScale", label: cactus ? "肉质茎粗细" : "枝干粗细", min: 0.25, max: 3, step: 0.01, default: defaults.trunkScale },
    { key: "crownScale", label: cactus ? "横向扩展" : "冠幅/扩散", min: 0.2, max: 3, step: 0.01, default: defaults.crownScale },
    { key: "crownDepth", label: cactus ? "前后厚度" : "冠层深度", min: 0.2, max: 3, step: 0.01, default: defaults.crownDepth },
    { key: "branchAngle", label: cactus ? "分枝角度" : "分枝角度偏移", min: -45, max: 45, step: 1, default: defaults.branchAngle },
    { key: "branchCount", label: cactus ? "肉质茎数量" : "枝/茎数量", min: 0.1, max: 3, step: 0.05, default: defaults.branchCount },
    { key: "leafDensity", label: cactus ? "刺座密度" : "叶/花密度", min: 0, max: 3, step: 0.05, default: defaults.leafDensity },
    { key: "leafSize", label: cactus ? "肉质茎/刺尺寸" : "叶/花尺寸", min: 0.2, max: 3, step: 0.01, default: defaults.leafSize },
    { key: "gnarl", label: cactus ? "茎体弯曲" : "枝干扭曲", min: 0, max: 3, step: 0.01, default: defaults.gnarl },
    { key: "lean", label: "整体倾斜", min: -2, max: 2, step: 0.01, default: defaults.lean },
  ];
}

export function makeSpeedTreeLibraryModel(procedural = {}, fallbackName = "Meshova树库") {
  const entry = normalizedSpeedTreeLibraryEntry(procedural);
  const quality = procedural.quality === "medium" || procedural.quality === "high" ? procedural.quality : "proxy";
  const defaults = {
    ...defaultSpeedTreeLibraryParams(entry, { quality }),
    ...(procedural.defaultParams || {}),
  };
  const recipe = inferSpeedTreeLibraryRecipe(entry, { quality, params: defaults });
  const id = procedural.id || speedTreeLibraryId(entry);
  return {
    id,
    name: procedural.name || fallbackName || recipe.label,
    critiqueGoal: `${recipe.label} ${recipe.kind} plant`,
    schema: speedTreeLibrarySchema(entry, defaults, recipe),
    defaultParams: () => ({ ...defaults }),
    build(params) {
      return buildSpeedTreeLibraryPlant(entry, { quality, params });
    },
  };
}

const teddy = CONTENT_MODELS.teddy;

// ---- a procedural rock: subdivided sphere + noise displacement ----
const rock = {
  id: "rock",
  name: "程序化石头",
  schema: [
    { key: "size", label: "尺寸", min: 0.5, max: 2, step: 0.01, default: 1 },
    { key: "detail", label: "细分级数", min: 0, max: 3, step: 1, default: 2 },
    { key: "rough", label: "崎岖程度", min: 0, max: 0.6, step: 0.01, default: 0.3 },
    { key: "freq", label: "噪声频率", min: 0.5, max: 6, step: 0.1, default: 2 },
    { key: "seed", label: "随机种子", min: 0, max: 50, step: 1, default: 7 },
  ],
  build(p) {
    let m = subdivide(sphere(p.size, 24, 18), p.detail);
    m = displaceByNoise(m, { amount: p.rough, scale: p.freq, seed: p.seed });
    return [surfPart("rock", m, "stone", { scale: 5 })];
  },
};

// ---- a stylized rock pile: polar-scattered low-poly rocks with distance falloff ----
// Reimplements the RockTools aesthetic (Cubic / Sharp) from public knowledge:
// rocks scattered on a disk, scaled down toward the edge, stretched tall/flat/wide,
// with rotation jitter growing with distance from the center.
const rockPile = {
  id: "rock-pile",
  name: "风格化岩石群",
  schema: [
    { key: "type", label: "形态 (0圆润 1尖锐)", min: 0, max: 1, step: 1, default: 0 },
    { key: "count", label: "石块数", min: 1, max: 60, step: 1, default: 30 },
    { key: "radius", label: "分布半径", min: 0.6, max: 3, step: 0.05, default: 1.7 },
    { key: "decentralize", label: "外扩程度", min: 0, max: 1, step: 0.01, default: 0.55 },
    { key: "tallness", label: "高耸", min: 0, max: 1, step: 0.01, default: 0.35 },
    { key: "flatness", label: "扁平", min: 0, max: 1, step: 0.01, default: 0.15 },
    { key: "wideness", label: "横宽", min: 0, max: 1, step: 0.01, default: 0.2 },
    { key: "jitter", label: "旋转扰动", min: 0, max: 1, step: 0.01, default: 0.4 },
    { key: "rough", label: "表面崎岖", min: 0, max: 0.5, step: 0.01, default: 0.18 },
    { key: "seed", label: "随机种子", min: 0, max: 100, step: 1, default: 7 },
  ],
  build(p) {
    const rnd = mulberry32((p.seed | 0) * 2654435761 + 1);
    const count = Math.max(1, Math.round(p.count));
    const sharp = p.type >= 0.5;
    const parts = [];

    for (let i = 0; i < count; i++) {
      const rd = rnd(), theta = rnd() * Math.PI * 2;
      const rr = rnd(), sr = rnd();
      const rx = rnd(), ry = rnd(), rz = rnd();

      // polar position: exponent < 1 pushes rocks outward as decentralize grows
      const pow = 0.66 + (0.25 - 0.66) * p.decentralize;
      const d = Math.pow(rd, pow); // 0..1 normalized distance
      const r = d * p.radius;
      const pos = vec3(r * Math.cos(theta), 0, r * Math.sin(theta));

      // base low-poly rock: sharp = icosphere kept faceted, cubic = rounded box
      let m = sharp
        ? subdivide(icosphere(0.28 + rr * 0.14, 1), 0)
        : catmullClark(box(0.4 + rr * 0.2, 0.4 + rr * 0.2, 0.4 + rr * 0.2), 1);

      // give each rock its own crag via seeded noise displacement
      if (p.rough > 0) {
        m = displaceByNoise(m, { amount: p.rough, scale: sharp ? 3.5 : 2.2, seed: (p.seed | 0) + i * 13 });
      }

      // distance falloff: center rocks biggest, edge rocks smallest
      const distCurve = 1 - d;               // near-center -> ~1, edge -> ~0
      const distRev = d;                     // inverse
      // gentler center->edge falloff so the pile reads as a cluster, not one boulder + gravel
      const localScale = (0.55 + distCurve * 0.55) * (0.78 + sr * 0.44);
      const tall = 1 + 2 * (distCurve * p.tallness);
      const flat = 3 * (distRev * p.flatness);
      const wide = 3 * (distRev * p.wideness);
      const height = Math.max(0.15, tall - flat);
      const sc = vec3((1 + wide) * localScale, height * localScale, (1 + wide) * localScale);

      // rotation jitter grows with distance (edge rocks tumble more)
      const jr = p.jitter * Math.PI * d;
      const rot = vec3((rx - 0.5) * jr, ry * Math.PI * 2, (rz - 0.5) * jr);

      m = transform(m, { scale: sc, rotate: rot });
      m = dropToGround(m);
      // reproject UVs in the rock's local (post-scale) space so stretching from
      // the non-uniform scale doesn't smear the stone texture into streaks
      m = triplanarUV(m, 1.6);
      m = translateMesh(m, pos);
      parts.push(m);
    }

    const merged = parts.reduce((acc, m) => (acc ? merge(acc, m) : m), null);
    return [surfPart("rocks", cleanMesh(merged), "stone", { scale: 1.5 })];
  },
};

const stylizedRockIslandModel = {
  id: "stylized-rock-island",
  name: "风格化浮岛岩",
  category: "自然",
  assetMeta: {
    description: "复刻 Houdini 风格化岩石：分块竖崖、内收底部、阶梯顶台与黄绿草盖。",
    tags: ["岩石", "浮岛", "风格化", "Houdini", "程序化复刻"],
    capabilities: ["分块崖壁", "锥化底部", "阶梯台地", "草地顶盖", "种子变体"],
    materialClasses: ["冷灰岩石", "深色岩缝", "草地"],
  },
  schema: [
    { key: "size", label: "浮岛尺寸", min: 2.5, max: 14, step: 0.1, default: 6.4 },
    { key: "cliffHeight", label: "崖壁高度", min: 1.5, max: 9, step: 0.1, default: 3.8 },
    { key: "chunksPerSide", label: "每侧岩块", min: 3, max: 16, step: 1, default: 8 },
    { key: "terraces", label: "顶部阶数", min: 0, max: 4, step: 1, default: 2 },
    { key: "jaggedness", label: "岩面破碎度", min: 0, max: 0.8, step: 0.01, default: 0.34 },
    { key: "grassInset", label: "草地边距", min: 0.02, max: 0.35, step: 0.01, default: 0.12 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 18 },
  ],
  build(p) {
    return buildStylizedRockIslandParts({
      ...p,
      seed: Math.round(p.seed),
      chunksPerSide: Math.round(p.chunksPerSide),
      terraces: Math.round(p.terraces),
    });
  },
};

const pcgRockCluster = {
  id: "pcg-rock-cluster",
  name: "PCG 岩石群落（教程复刻）",
  category: "程序工作流",
  assetMeta: {
    description: "主石作为群落核心，伴生石与碎石按距离环聚，尺寸向外衰减，随机旋转缩放。",
    tags: ["PCG", "岩石", "群落", "距离衰减", "确定性散布"],
    capabilities: ["群落中心采样", "分层资产选择", "环形散布", "尺寸衰减", "种子复现"],
    materialClasses: ["岩石", "土壤"],
  },
  schema: [
    { key: "clusterCount", label: "群落数量", min: 1, max: 10, step: 1, default: 5 },
    { key: "rocksPerCluster", label: "每群石块数", min: 6, max: 50, step: 1, default: 22 },
    { key: "areaSize", label: "场地尺寸", min: 6, max: 28, step: 0.5, default: 14 },
    { key: "clusterRadius", label: "群落半径", min: 0.7, max: 3.5, step: 0.05, default: 2 },
    { key: "heroScale", label: "主石尺寸", min: 0.4, max: 2.5, step: 0.05, default: 1 },
    { key: "falloff", label: "向外尺寸衰减", min: 0.2, max: 3, step: 0.05, default: 1.35 },
    { key: "roughness", label: "岩面破碎度", min: 0, max: 0.35, step: 0.01, default: 0.16 },
    { key: "includeGround", label: "显示土壤地面", min: 0, max: 1, step: 1, default: 1 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 17 },
  ],
  build(params) {
    return buildPcgRockClusterParts({
      clusterCount: Math.round(params.clusterCount),
      rocksPerCluster: Math.round(params.rocksPerCluster),
      areaSize: params.areaSize,
      clusterRadius: params.clusterRadius,
      heroScale: params.heroScale,
      falloff: params.falloff,
      roughness: params.roughness,
      includeGround: Math.round(params.includeGround) === 1,
      seed: Math.round(params.seed),
    });
  },
};

const pcgSnowScene = {
  id: "pcg-snow-scene",
  name: "PCG 自定义积雪场景",
  schema: [
    { key: "size", label: "场景尺寸", min: 5, max: 14, step: 0.5, default: 8 },
    { key: "coverage", label: "积雪覆盖率", min: 0, max: 1, step: 0.02, default: 0.78 },
    { key: "snowDepth", label: "积雪厚度", min: 0.03, max: 0.3, step: 0.01, default: 0.11 },
    { key: "treeHeight", label: "枯树高度", min: 2.5, max: 6, step: 0.1, default: 4.2 },
    { key: "seed", label: "随机种子", min: 0, max: 100, step: 1, default: 23 },
  ],
  build(params) {
    return buildPcgSnowSceneParts(params);
  },
};

// ---- PCG forest: terrain masks -> path difference -> layered vegetation ----
const pcgForest = {
  id: "pcg-forest",
  name: "程序化混交森林",
  schema: [
    { key: "size", label: "林地尺寸", min: 20, max: 100, step: 2, default: 56 },
    { key: "resolution", label: "地形精度", min: 32, max: 128, step: 8, default: 72 },
    { key: "relief", label: "地形起伏", min: 1, max: 16, step: 0.5, default: 5.5 },
    { key: "candidates", label: "乔木候选点", min: 100, max: 1600, step: 50, default: 720 },
    { key: "slopeMax", label: "最大生长坡度°", min: 20, max: 60, step: 1, default: 40 },
    { key: "clumping", label: "林斑空隙", min: 0, max: 0.9, step: 0.02, default: 0.34 },
    { key: "spacing", label: "乔木间距", min: 1.5, max: 6, step: 0.1, default: 3.1 },
    { key: "coniferLine", label: "针叶海拔线", min: 0.2, max: 0.9, step: 0.02, default: 0.64 },
    { key: "pathWidth", label: "林间小径宽", min: 0.8, max: 6, step: 0.1, default: 2.4 },
    { key: "shrubs", label: "林下灌木", min: 0, max: 1, step: 0.05, default: 0.7 },
    { key: "rocks", label: "苔石密度", min: 0, max: 1, step: 0.05, default: 0.38 },
    { key: "deadwood", label: "倒木密度", min: 0, max: 1, step: 0.05, default: 0.3 },
    { key: "canopy", label: "树冠丰满度", min: 0.5, max: 1.5, step: 0.05, default: 1 },
    { key: "seed", label: "随机种子", min: 0, max: 100, step: 1, default: 11 },
  ],
  build(p) {
    return buildPcgForestParts(p);
  },
};

const ecosystemArtTool = {
  id: "ecosystem-art-tool",
  name: "生态艺术工具（视频复刻）",
  category: "程序生态",
  assetMeta: {
    description: "生态层表驱动；组合地形掩码、笔刷排除、确定性散布、空间分块与 GPU 实例缓冲。",
    tags: ["PCG", "生态", "ScatterTable", "MaskField", "HISM", "视频复刻"],
    capabilities: ["分层生态", "道路避让", "笔刷清除", "坡度过滤", "分块烘焙", "种子复现"],
    materialClasses: ["植被", "木材", "岩石", "土壤"],
  },
  schema: [
    { key: "size", label: "生态范围", min: 20, max: 100, step: 2, default: 54 },
    { key: "resolution", label: "地形精度", min: 24, max: 128, step: 8, default: 64 },
    { key: "relief", label: "地形起伏", min: 0.5, max: 16, step: 0.5, default: 5.2 },
    { key: "density", label: "总体密度", min: 0.05, max: 1, step: 0.05, default: 0.72 },
    { key: "slopeMax", label: "最大生长坡度°", min: 12, max: 70, step: 1, default: 42 },
    { key: "treeSpacing", label: "乔木间距", min: 1.4, max: 8, step: 0.1, default: 3.2 },
    { key: "pathWidth", label: "道路宽度", min: 0.5, max: 8, step: 0.1, default: 2.2 },
    { key: "clusterScale", label: "生态聚类尺度", min: 0, max: 1, step: 0.02, default: 0.42 },
    { key: "paintGap", label: "笔刷清除半径", min: 0, max: 12, step: 0.2, default: 3.8 },
    { key: "chunkSize", label: "烘焙分块尺寸", min: 4, max: 40, step: 1, default: 14 },
    { key: "season", label: "季节", min: 0, max: 1, step: 0.02, default: 0.16 },
    { key: "seed", label: "随机种子", min: 0, max: 100, step: 1, default: 27 },
  ],
  build(p) {
    return buildEcosystemArtToolParts(p);
  },
};

function ecosystemFeatureModel(id, name, feature, description, capabilities) {
  return {
    id,
    name,
    category: "程序生态",
    assetMeta: {
      description,
      tags: ["PCG", "生态", "Field", "确定性", "生产工具"],
      capabilities,
      materialClasses: ["植被", "木材", "岩石", "土壤", "水体"],
    },
    schema: [
      { key: "density", label: "生态密度", min: 0.1, max: 1, step: 0.05, default: 0.72 },
      { key: "season", label: "季节状态", min: 0, max: 1, step: 0.02, default: 0.2 },
      { key: "seed", label: "随机种子", min: 0, max: 100, step: 1, default: 31 },
    ],
    build(p) {
      return buildEcosystemFeatureParts(feature, p);
    },
  };
}

const ecosystemBrushEditor = ecosystemFeatureModel(
  "ecosystem-brush-editor",
  "生态笔刷编辑器",
  "brush-editor",
  "补种、擦除、密度涂抹、物种替换与实时笔刷范围预览。",
  ["补种", "擦除", "密度涂抹", "物种替换", "笔刷预览"],
);

const biomeBlendWorld = ecosystemFeatureModel(
  "biome-blend-world",
  "多 Biome 混合世界",
  "biome-blend",
  "森林、草地、湿地按高度、坡度、湿度与流域连续混合。",
  ["Biome 权重", "高度过滤", "坡度过滤", "湿度场", "流域过渡"],
);

const ecosystemBakePipeline = ecosystemFeatureModel(
  "ecosystem-bake-pipeline",
  "生态 Bake 生产管线",
  "bake-contract",
  "预览到实例、碰撞、LOD、分块、导出的显式可验证契约。",
  ["实例缓冲", "碰撞代理", "LOD 契约", "空间分块", "导出阶段"],
);

const ecologicalAssociation = ecosystemFeatureModel(
  "ecological-association",
  "生态关联规则",
  "association-rules",
  "树荫、岩石、道路等邻域条件驱动伴生与排除规则。",
  ["邻域偏好", "邻域排除", "道路退让", "岩石伴生", "确定性筛选"],
);

const ecosystemLodStreaming = ecosystemFeatureModel(
  "ecosystem-lod-streaming",
  "生态分块流送与 LOD",
  "lod-streaming",
  "近景网格、中景简模、远景 Impostor、超远裁剪。",
  ["空间流送", "近景网格", "中景简模", "远景 Impostor", "距离裁剪"],
);

const terrainEcologyFeedback = ecosystemFeatureModel(
  "terrain-ecology-feedback",
  "地形—生态反馈",
  "terrain-feedback",
  "侵蚀、水流与沉积生成湿度、肥力场，再反向驱动植被。",
  ["侵蚀场", "水流场", "沉积场", "湿度", "肥力"],
);

const ecosystemSuccession = ecosystemFeatureModel(
  "ecosystem-succession",
  "季节与生态演替",
  "succession",
  "裸地、先锋草本、灌木、幼林、成熟林及火烧恢复序列。",
  ["生长阶段", "季节变色", "火烧扰动", "采伐扰动", "恢复演替"],
);

const pcgVegetation = {
  id: "pcg-vegetation",
  name: "PCG 植被地形",
  schema: [
    { key: "size", label: "地形尺寸", min: 8, max: 30, step: 0.5, default: 18 },
    { key: "relief", label: "地形起伏", min: 0.5, max: 6, step: 0.1, default: 3 },
    { key: "count", label: "撒点密度", min: 200, max: 3000, step: 50, default: 1400 },
    { key: "slopeMax", label: "最大生长坡度°", min: 20, max: 70, step: 1, default: 42 },
    { key: "clumping", label: "疏密团簇", min: 0, max: 1, step: 0.01, default: 0.55 },
    { key: "spacing", label: "最小间距", min: 0.2, max: 2, step: 0.05, default: 0.7 },
    { key: "roadWidth", label: "空地/路宽", min: 0, max: 3, step: 0.1, default: 1.4 },
    { key: "treeRatio", label: "乔木占比", min: 0, max: 1, step: 0.05, default: 0.35 },
    { key: "seed", label: "随机种子", min: 0, max: 100, step: 1, default: 7 },
  ],
  build(p) {
    const size = p.size;
    // 1) terrain: an island-falloff heightfield turned into a mesh.
    const field = makeTerrainPrimitiveField({
      resolution: 96,
      seed: p.seed | 0,
      height: 1,
      noiseScale: 1.25,
      ridgeStrength: 0.5,
      islandFalloff: 1.6,
    });
    const terrain = heightfieldToTerrainMesh(field, {
      size,
      heightScale: p.relief,
      baseY: 0,
    });
    return buildPcgVegetationParts(p, terrain, size);
  },
};

function vegetationAssemblyModel(id, name, preset, description) {
  return {
    id,
    name,
    assetMeta: {
      description,
      tags: ["Assembly Collection", "位置种子", "语义替换", "植被构图"],
      capabilities: ["同类资产变体", "相对布局保持", "确定性生成", "实时调参"],
      source: "BV1LZftBWELc 技术复刻",
    },
    schema: [
      { key: "seed", label: "随机种子", min: 0, max: 100, step: 1, default: 7 },
      { key: "locationX", label: "位置种子 X", min: -20, max: 20, step: 1, default: 0 },
      { key: "locationZ", label: "位置种子 Z", min: -20, max: 20, step: 1, default: 0 },
      { key: "spread", label: "构图展开", min: 0.72, max: 1.35, step: 0.01, default: 1 },
      { key: "treeScale", label: "主树比例", min: 0.65, max: 1.35, step: 0.01, default: 1 },
      { key: "density", label: "地被密度", min: 0.2, max: 1, step: 0.05, default: 1 },
    ],
    build(p) {
      return buildVegetationAssemblyPreset(preset, {
        seed: p.seed,
        locationX: p.locationX,
        locationZ: p.locationZ,
        spread: p.spread,
        treeScale: p.treeScale,
        density: p.density,
      });
    },
  };
}

const assemblyFlowerIsland = vegetationAssemblyModel(
  "assembly-flower-island",
  "Assembly 花境岛",
  "flower-island",
  "主树、灌木、花簇、地被与景石保持相对构图，同类资产按位置种子替换。",
);

const assemblyWoodlandEdge = vegetationAssemblyModel(
  "assembly-woodland-edge",
  "Assembly 林缘组合",
  "woodland-edge",
  "深浅绿林缘层次；移动位置种子获得稳定的新植被变体。",
);

const assemblyDryRockery = vegetationAssemblyModel(
  "assembly-dry-rockery",
  "Assembly 旱溪岩组",
  "dry-rockery",
  "针叶主景、暖色花草与层叠岩石组成的干旱景观模块。",
);

function buildPcgVegetationParts(p, terrain, size) {
  // 2) surface scatter, then the density/pruning pipeline.
  const raw = surfacePointCloud(terrain, { count: Math.round(p.count), seed: (p.seed | 0) + 1 });
  const slope = (p.slopeMax * Math.PI) / 180;
  // a gentle S-curve road across the middle for the "Difference" clear.
  const road = smoothCurve(
    polyline([
      vec3(-size * 0.5, 0, -size * 0.18),
      vec3(-size * 0.15, 0, size * 0.08),
      vec3(size * 0.2, 0, -size * 0.1),
      vec3(size * 0.5, 0, size * 0.16),
    ]),
    6,
  );
  const rules = [
    ruleNormalToDensity({ startAngle: slope * 0.6, endAngle: slope }),
    ruleDensityNoise({ frequency: 0.12 + p.clumping * 0.25, floor: p.clumping * 0.55, multiply: true, seed: (p.seed | 0) + 2 }),
    ruleDensityPrune((p.seed | 0) + 3),
    ruleSelfPruning({ radius: p.spacing }),
  ];
  if (p.roadWidth > 0) rules.push(ruleClipToCurveBand(road, { width: p.roadWidth, mode: "remove" }));
  // pick tree vs rock per point, then jitter scale/yaw for variety.
  rules.push(
    ruleWeightedFill([0, 1], { weights: [p.treeRatio, 1 - p.treeRatio], seed: (p.seed | 0) + 4 }),
    ruleScaleJitter(0.35, (p.seed | 0) + 5),
    ruleYawJitter(Math.PI, (p.seed | 0) + 6),
    pruneMasked(),
  );
  const scattered = applyRules(raw, rules);

  // 3) instance libraries as hierarchical assemblies (trunk+canopy / rock cluster).
  const treeAsm = {
    parts: [
      { mesh: cylinder(0.06, 0.9, 6), offset: vec3(0, 0.45, 0) },
      { mesh: icosphere(0.42, 1), offset: vec3(0, 1.15, 0), scale: 1 },
      { mesh: icosphere(0.3, 1), offset: vec3(0.12, 1.5, 0.05), scale: 0.8 },
    ],
  };
  const rockAsm = {
    parts: [
      { mesh: catmullClark(box(0.4, 0.32, 0.42), 1), offset: vec3(0, 0.14, 0) },
      { mesh: icosphere(0.18, 0), offset: vec3(0.28, 0.1, 0.1), scale: 0.9 },
    ],
  };
  // split points by variant so each mesh set gets its own material.
  const treePts = filterByVariant(scattered, 0);
  const rockPts = filterByVariant(scattered, 1);
  const parts = [surfPart("terrain", terrain, "stone", { color: [0.34, 0.3, 0.22], roughness: 0.95, scale: 3 })];
  if (pointCountOf(treePts) > 0) {
    const trees = copyAssembliesToPoints(treePts, treeAsm, {
      scale: pointAttribute("scale", 1),
      yaw: pointAttribute("yaw", 0),
      alignToNormal: false,
    });
    parts.push(surfPart("trees", trees, "foliage", { color: [0.22, 0.44, 0.18], season: 0.15, translucency: 0.4 }));
  }
  if (pointCountOf(rockPts) > 0) {
    const rocks = copyAssembliesToPoints(rockPts, rockAsm, {
      scale: pointAttribute("scale", 1),
      yaw: pointAttribute("yaw", 0),
      alignToNormal: false,
    });
    parts.push(surfPart("rocks", rocks, "stone", { color: [0.5, 0.48, 0.45], scale: 2 }));
  }
  return parts;
}

// ---- Slope-zoned vines: UE PointMatchAndSet (ruleVariantBySlope) demo ----
// A hill is surface-sampled, then ruleVariantBySlope picks a vine species per
// point by how steep the ground is: flat = ground creeper, mid = climbing ivy,
// cliff = woody liana. Each species is a small pre-grown vine stem instanced by
// copyToPoints. This is "陡坡长藤本、平地长匍匐藤" as a two-line rule chain.
const pcgPathfindingModel = {
  id: "pcg-pathfinding",
  name: "PCG 地表寻路",
  schema: [
    { key: "size", label: "地形尺寸", min: 60, max: 180, step: 5, default: 120 },
    { key: "resolution", label: "地形精度", min: 33, max: 97, step: 8, default: 65 },
    { key: "terrainRelief", label: "地形起伏", min: 2, max: 30, step: 1, default: 18 },
    { key: "mountainHeight", label: "中央山高度", min: 0, max: 40, step: 1, default: 22 },
    { key: "slopePreferenceDeg", label: "坡度惩罚起点°", min: 0, max: 35, step: 1, default: 12 },
    { key: "slopeLimitDeg", label: "最大可行坡度°", min: 20, max: 70, step: 1, default: 38 },
    { key: "pathSmoothness", label: "路径平滑度", min: 1, max: 8, step: 1, default: 3 },
    { key: "pathLift", label: "路径离地高度", min: 0.05, max: 2, step: 0.05, default: 0.55 },
    { key: "pathRadius", label: "路径粗细", min: 0.15, max: 1.5, step: 0.05, default: 0.55 },
    { key: "seed", label: "地形种子", min: 0, max: 100, step: 1, default: 19 },
  ],
  build(p) {
    return buildPcgPathfindingParts({
      size: p.size,
      resolution: Math.round(p.resolution),
      terrainRelief: p.terrainRelief,
      mountainHeight: p.mountainHeight,
      slopePreferenceDeg: p.slopePreferenceDeg,
      slopeLimitDeg: p.slopeLimitDeg,
      pathSmoothness: Math.round(p.pathSmoothness),
      pathLift: p.pathLift,
      pathRadius: p.pathRadius,
      seed: Math.round(p.seed),
    });
  },
};

const vineSlopeModel = {
  id: "vine-slope",
  name: "PCG 坡度选藤",
  schema: [
    { key: "size", label: "地形尺寸", min: 8, max: 24, step: 0.5, default: 14 },
    { key: "relief", label: "地形起伏", min: 1, max: 8, step: 0.1, default: 4.5 },
    { key: "count", label: "撒点密度", min: 40, max: 400, step: 10, default: 160 },
    { key: "flatMax", label: "平地坡度上限°", min: 5, max: 35, step: 1, default: 18 },
    { key: "midMax", label: "斜坡坡度上限°", min: 35, max: 70, step: 1, default: 52 },
    { key: "spacing", label: "最小间距", min: 0.4, max: 2.5, step: 0.1, default: 1.1 },
    { key: "vineScale", label: "藤蔓大小", min: 0.15, max: 0.6, step: 0.05, default: 0.35 },
    { key: "seed", label: "随机种子", min: 0, max: 60, step: 1, default: 9 },
  ],
  build(p) {
    const size = p.size;
    const field = makeTerrainPrimitiveField({
      resolution: 96, seed: p.seed | 0, height: 1,
      noiseScale: 1.4, ridgeStrength: 0.7, islandFalloff: 1.4,
    });
    const terrain = heightfieldToTerrainMesh(field, { size, heightScale: p.relief, baseY: 0 });

    // scatter + de-clump, then zone by slope into 3 vine variants.
    const raw = surfacePointCloud(terrain, { count: Math.round(p.count), seed: (p.seed | 0) + 1 });
    const scattered = applyRules(raw, [
      ruleSelfPruning({ radius: p.spacing }),
      ruleVariantBySlope({
        thresholds: [(p.flatMax * Math.PI) / 180, (p.midMax * Math.PI) / 180],
        variants: [0, 1, 2], // 0=匍匐 1=攀爬 2=木质藤本
      }),
      ruleYawJitter(Math.PI, (p.seed | 0) + 5),
    ]);

    // three small pre-grown vine species (just stems, kept light for instancing).
    const sc = p.vineScale;
    const lib = [
      buildVineStemMesh({ seed: 3, mode: "creeping", length: 1.6 * sc / 0.35, radius: 0.04, branches: 2, sides: 5 }),
      buildVineStemMesh({ seed: 7, mode: "climbing", length: 2.0 * sc / 0.35, radius: 0.035, branches: 3, sides: 5 }),
      buildVineStemMesh({ seed: 11, mode: "hanging", length: 2.2 * sc / 0.35, radius: 0.06, branches: 2, sides: 5 }),
    ];

    const parts = [surfPart("terrain", terrain, "stone", { color: [0.33, 0.29, 0.22], roughness: 0.95, scale: 3 })];
    const names = ["creeper", "ivy", "liana"];
    const labels = ["匍匐藤", "攀爬藤", "木质藤本"];
    const tones = [[0.28, 0.5, 0.2], [0.24, 0.46, 0.2], [0.35, 0.24, 0.14]];
    for (let v = 0; v < 3; v++) {
      const pts = filterByVariant(scattered, v);
      if (pointCountOf(pts) === 0) continue;
      const mesh = copyToPoints(pts, [lib[v]], {
        yaw: pointAttribute("yaw", 0),
        alignToNormal: true,
      });
      parts.push(surfPart(names[v], mesh, v === 2 ? "wood" : "foliage",
        v === 2 ? { tone: tones[v] } : { color: tones[v], season: 0.15, translucency: 0.4 }));
    }
    return parts;
  },
};

function pointCountOf(pc) {
  return pc && pc.points ? pc.points.length : 0;
}

/** Keep only points whose "variant" attribute equals `v` (compacts attributes). */
function filterByVariant(pc, v) {
  const variant = pc.attributes.variant;
  if (!variant) return v === 0 ? pc : makePointCloud({ points: [] });
  const keep = [];
  for (let i = 0; i < pc.points.length; i++) {
    if (Math.round(variant[i]) === v) keep.push(i);
  }
  const attributes = {};
  for (const name of Object.keys(pc.attributes)) {
    attributes[name] = keep.map((i) => pc.attributes[name][i]);
  }
  return makePointCloud({
    points: keep.map((i) => pc.points[i]),
    normals: keep.map((i) => pc.normals[i]),
    attributes,
  });
}

// ---- Roots: grown-from-recipe root systems (mirror of the vine walk) --------
// UE Electric Dreams ships baked SM_Roots_* meshes; Meshova grows them live by
// a seeded gravity+wander walk that dives DOWN and OUT from a flare collar.
const rootsModel = {
  id: "roots",
  name: "根系 / 板根",
  schema: [
    { key: "mode", label: "模式(0板根/1裸根/2主根)", min: 0, max: 2, step: 1, default: 0 },
    { key: "count", label: "主根数量", min: 3, max: 14, step: 1, default: 7 },
    { key: "collarRadius", label: "根盘半径", min: 0.15, max: 1.2, step: 0.05, default: 0.4 },
    { key: "length", label: "根长", min: 1.2, max: 4, step: 0.1, default: 2.6 },
    { key: "radius", label: "根粗", min: 0.05, max: 0.25, step: 0.01, default: 0.13 },
    { key: "branches", label: "分叉数", min: 0, max: 6, step: 1, default: 3 },
    { key: "wander", label: "蜿蜒程度", min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: "seed", label: "随机种子", min: 0, max: 60, step: 1, default: 7 },
  ],
  build(p) {
    const modes = ["flare", "erosion", "taproot"];
    return buildRootsParts({
      mode: modes[Math.round(p.mode)] || "flare",
      count: Math.round(p.count),
      collarRadius: p.collarRadius,
      length: p.length,
      radius: p.radius,
      branches: Math.round(p.branches),
      wander: p.wander,
      seed: p.seed | 0,
    });
  },
};

// ---- Rock formation: fuse spheres -> fBm noise -> strata plane-cut ----------
// UE ships baked SM_RockFormation_* / SM_ForestRockShelf_* meshes; Meshova grows
// the rock from primitives + seeded noise so it stays a re-runnable script.
const rockFormationModel = {
  id: "rock-formation",
  name: "岩层 / 岩壁",
  schema: [
    { key: "mode", label: "模式(0巨砾/1岩台/2岩壁)", min: 0, max: 2, step: 1, default: 0 },
    { key: "radius", label: "底盘半径", min: 0.8, max: 3, step: 0.1, default: 1.5 },
    { key: "height", label: "高度", min: 0.6, max: 4, step: 0.1, default: 1.5 },
    { key: "blobs", label: "融球数", min: 3, max: 9, step: 1, default: 5 },
    { key: "crag", label: "崎岖度", min: 0.05, max: 0.35, step: 0.01, default: 0.2 },
    { key: "strata", label: "岩层切数", min: 0, max: 5, step: 1, default: 0 },
    { key: "resolution", label: "网格精度", min: 24, max: 56, step: 4, default: 40 },
    { key: "seed", label: "随机种子", min: 0, max: 60, step: 1, default: 3 },
  ],
  build(p) {
    const modes = ["boulder", "shelf", "cliff"];
    return buildRockFormationParts({
      mode: modes[Math.round(p.mode)] || "boulder",
      radius: p.radius,
      height: p.height,
      blobs: Math.round(p.blobs),
      crag: p.crag,
      strata: Math.round(p.strata),
      resolution: Math.round(p.resolution),
      seed: p.seed | 0,
    });
  },
};

const easyCliffRockModel = {
  id: "easy-cliff-rock",
  name: "悬崖岩山群",
  critiqueGoal: "tall eroded cliff pillars with readable strata and ledge vegetation",
  schema: [
    { key: "count", label: "岩柱数量", min: 1, max: 16, step: 1, default: 5 },
    { key: "height", label: "主峰高度", min: 2, max: 16, step: 0.2, default: 8.5 },
    { key: "radius", label: "岩柱半径", min: 0.5, max: 3, step: 0.05, default: 1.3 },
    { key: "spread", label: "群落范围", min: 3.5, max: 20, step: 0.2, default: 6.5 },
    { key: "blobs", label: "轮廓团块", min: 3, max: 11, step: 1, default: 7 },
    { key: "crag", label: "侵蚀崎岖度", min: 0.04, max: 0.42, step: 0.01, default: 0.22 },
    { key: "strata", label: "水平岩层", min: 0, max: 7, step: 1, default: 4 },
    { key: "resolution", label: "网格精度", min: 20, max: 48, step: 4, default: 32 },
    { key: "foliageDensity", label: "崖面植被", min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: "seed", label: "地貌种子", min: 0, max: 200, step: 1, default: 19 },
  ],
  build(p) {
    return buildEasyCliffRockParts({
      count: p.count,
      height: p.height,
      radius: p.radius,
      spread: p.spread,
      blobs: p.blobs,
      crag: p.crag,
      strata: p.strata,
      resolution: p.resolution,
      foliageDensity: p.foliageDensity,
      seed: p.seed,
    });
  },
};

const realisticSplinePathModel = {
  id: "realistic-spline-path",
  name: "写实岩石样条路径",
  critiqueGoal: "continuous walkable sandstone pads with irregular edges, landmark spires, and sparse desert vegetation",
  schema: [
    { key: "length", label: "路径长度", min: 10, max: 80, step: 1, default: 34 },
    { key: "width", label: "岩盘宽度", min: 1.4, max: 9, step: 0.1, default: 4.2 },
    { key: "meander", label: "样条蜿蜒", min: 0, max: 14, step: 0.2, default: 4.8 },
    { key: "elevation", label: "高差", min: 0, max: 8, step: 0.1, default: 2.2 },
    { key: "padSpacing", label: "岩盘间距", min: 0.9, max: 4, step: 0.05, default: 2.35 },
    { key: "padThickness", label: "岩盘厚度", min: 0.25, max: 2.2, step: 0.05, default: 0.9 },
    { key: "edgeDensity", label: "边缘碎石", min: 0, max: 1, step: 0.05, default: 0.82 },
    { key: "spireDensity", label: "标志岩柱", min: 0, max: 1, step: 0.05, default: 0.18 },
    { key: "vegetationDensity", label: "荒漠植被", min: 0, max: 1, step: 0.05, default: 0.42 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 42 },
  ],
  build(p) {
    return buildRealisticSplinePathParts({
      ...p,
      seed: Math.round(p.seed),
    });
  },
};

const houdiniCaveModel = {
  id: "houdini-cave",
  name: "Houdini 程序化山洞",
  schema: [
    { key: "width", label: "洞体宽度", min: 7, max: 18, step: 0.5, default: 12 },
    { key: "height", label: "洞体高度", min: 2.5, max: 8, step: 0.25, default: 4 },
    { key: "depth", label: "洞体深度", min: 5, max: 14, step: 0.5, default: 8 },
    { key: "wallThickness", label: "岩壁厚度", min: 0.16, max: 0.8, step: 0.02, default: 0.34 },
    { key: "entranceWidth", label: "洞口宽度", min: 1.4, max: 5, step: 0.1, default: 2.78 },
    { key: "entranceHeight", label: "洞口高度", min: 1.6, max: 6, step: 0.1, default: 3.32 },
    { key: "entranceOffsetZ", label: "洞口侧向位置", min: -3, max: 3, step: 0.1, default: 1 },
    { key: "roughness", label: "大形崎岖度", min: 0, max: 1.2, step: 0.02, default: 0.58 },
    { key: "surfaceDetail", label: "表面碎岩度", min: 0, max: 0.4, step: 0.01, default: 0.16 },
    { key: "resolution", label: "体素精度", min: 28, max: 72, step: 4, default: 56 },
    { key: "entranceRocks", label: "入口岩石数", min: 0, max: 3, step: 1, default: 3 },
    { key: "seed", label: "随机种子", min: 0, max: 100, step: 1, default: 19 },
  ],
  build(p) {
    return buildHoudiniCaveParts({
      width: p.width,
      height: p.height,
      depth: p.depth,
      wallThickness: p.wallThickness,
      entranceWidth: p.entranceWidth,
      entranceHeight: p.entranceHeight,
      entranceOffsetZ: p.entranceOffsetZ,
      roughness: p.roughness,
      surfaceDetail: p.surfaceDetail,
      resolution: Math.round(p.resolution),
      entranceRocks: Math.round(p.entranceRocks),
      seed: Math.round(p.seed),
    });
  },
};

const ue5PcgCaveModel = {
  id: "ue5-pcg-cave",
  name: "UE5 PCG 程序化山洞",
  schema: [
    { key: "length", label: "洞网长度", min: 16, max: 42, step: 1, default: 28 },
    { key: "width", label: "洞网宽度", min: 10, max: 30, step: 1, default: 20 },
    { key: "tunnelRadius", label: "通道半径", min: 1.2, max: 4, step: 0.1, default: 2.35 },
    { key: "verticalStretch", label: "通道纵向拉伸", min: 0.7, max: 1.8, step: 0.05, default: 1.22 },
    { key: "branchCount", label: "支路数量", min: 0, max: 2, step: 1, default: 2 },
    { key: "irregularity", label: "大形崎岖度", min: 0, max: 0.9, step: 0.02, default: 0.42 },
    { key: "surfaceDetail", label: "表面碎岩度", min: 0, max: 0.35, step: 0.01, default: 0.12 },
    { key: "wallThickness", label: "岩壁厚度", min: 0.1, max: 0.9, step: 0.02, default: 0.34 },
    { key: "resolution", label: "体素精度", min: 24, max: 72, step: 4, default: 52 },
    { key: "floorRocks", label: "洞底碎岩数", min: 0, max: 80, step: 2, default: 28 },
    { key: "wallRocks", label: "洞壁岩块数", min: 0, max: 120, step: 2, default: 52 },
    { key: "ceilingRocks", label: "顶部垂岩数", min: 0, max: 50, step: 1, default: 16 },
    { key: "seed", label: "随机种子", min: 0, max: 100, step: 1, default: 25 },
  ],
  build(p) {
    return buildUe5PcgCaveParts({
      length: p.length,
      width: p.width,
      tunnelRadius: p.tunnelRadius,
      verticalStretch: p.verticalStretch,
      branchCount: Math.round(p.branchCount),
      irregularity: p.irregularity,
      surfaceDetail: p.surfaceDetail,
      wallThickness: p.wallThickness,
      resolution: Math.round(p.resolution),
      floorRocks: Math.round(p.floorRocks),
      wallRocks: Math.round(p.wallRocks),
      ceilingRocks: Math.round(p.ceilingRocks),
      seed: Math.round(p.seed),
    });
  },
};

// ---- Attractor grid: distance field -> ramp -> height/color/twist ----------
// First Algorithmic Design Workbook-style clone: one attractor field drives a
// grid of modules. It exercises falloff + ramp without needing heavy topology.
const attractorGridModel = {
  id: "attractor-grid",
  name: "吸引子柱阵",
  schema: [
    { key: "cells", label: "网格数量", min: 5, max: 31, step: 2, default: 17 },
    { key: "spacing", label: "网格间距", min: 0.2, max: 0.8, step: 0.02, default: 0.42 },
    { key: "cellSize", label: "柱体宽度", min: 0.08, max: 0.5, step: 0.01, default: 0.28 },
    { key: "minHeight", label: "最低高度", min: 0.02, max: 0.5, step: 0.01, default: 0.08 },
    { key: "maxHeight", label: "最高高度", min: 0.3, max: 5, step: 0.05, default: 2.2 },
    { key: "radius", label: "影响半径", min: 0.4, max: 8, step: 0.05, default: 3.2 },
    { key: "attractorX", label: "吸引子X", min: -4, max: 4, step: 0.05, default: 0 },
    { key: "attractorZ", label: "吸引子Z", min: -4, max: 4, step: 0.05, default: 0 },
    { key: "mode", label: "模式(0吸引/1排斥)", min: 0, max: 1, step: 1, default: 0 },
    { key: "curve", label: "曲线(0线性/1平滑/2更滑/3二次/4三次)", min: 0, max: 4, step: 1, default: 1 },
    { key: "jitter", label: "位置扰动", min: 0, max: 0.35, step: 0.01, default: 0.06 },
    { key: "twist", label: "旋转强度", min: -1.5, max: 1.5, step: 0.05, default: 0.35 },
    { key: "seed", label: "随机种子", min: 0, max: 100, step: 1, default: 11 },
    { key: "markers", label: "显示吸引子(0/1)", min: 0, max: 1, step: 1, default: 1 },
  ],
  build(p) {
    const curves = ["linear", "smooth", "smoother", "quadratic", "cubic"];
    return buildAttractorGridParts({
      cells: Math.round(p.cells),
      spacing: p.spacing,
      cellSize: p.cellSize,
      minHeight: p.minHeight,
      maxHeight: p.maxHeight,
      radius: p.radius,
      mode: Math.round(p.mode) === 1 ? "repel" : "attract",
      curve: curves[Math.round(p.curve)] || "smooth",
      jitter: p.jitter,
      twist: p.twist,
      seed: Math.round(p.seed),
      markers: Math.round(p.markers) === 1,
      attractors: [{ position: vec3(p.attractorX, 0, p.attractorZ), radius: p.radius, strength: 1 }],
    });
  },
};

// ---- BlenderHowtos clean-room cookbook ------------------------------------
const blenderSpiralScales = {
  id: "blender-spiral-scales",
  name: "BlenderHowtos 螺旋鳞片",
  schema: [
    { key: "count", label: "鳞片数量", min: 8, max: 180, step: 1, default: 84 },
    { key: "radius", label: "螺旋半径", min: 0.25, max: 1.6, step: 0.01, default: 0.78 },
    { key: "height", label: "整体高度", min: 0.8, max: 6, step: 0.05, default: 3.1 },
    { key: "turns", label: "圈数", min: 0.5, max: 9, step: 0.1, default: 5.2 },
    { key: "scaleWidth", label: "鳞片宽度", min: 0.04, max: 0.45, step: 0.005, default: 0.18 },
    { key: "scaleHeight", label: "鳞片长度", min: 0.06, max: 0.7, step: 0.005, default: 0.34 },
    { key: "scaleThickness", label: "鳞片厚度", min: 0.008, max: 0.08, step: 0.002, default: 0.035 },
    { key: "phase", label: "相位", min: -6.28, max: 6.28, step: 0.02, default: 0 },
    { key: "stemRadius", label: "中心茎粗细", min: 0.006, max: 0.12, step: 0.002, default: 0.035 },
  ],
  build(p) {
    return buildSpiralScalesParts({
      count: Math.round(p.count),
      radius: p.radius,
      height: p.height,
      turns: p.turns,
      scaleWidth: p.scaleWidth,
      scaleHeight: p.scaleHeight,
      scaleThickness: p.scaleThickness,
      phase: p.phase,
      stemRadius: p.stemRadius,
    });
  },
};

const blenderDnaHelix = {
  id: "blender-dna-helix",
  name: "BlenderHowtos DNA 双螺旋",
  schema: [
    { key: "pairs", label: "横档数量", min: 4, max: 80, step: 1, default: 34 },
    { key: "radius", label: "螺旋半径", min: 0.2, max: 1.5, step: 0.01, default: 0.62 },
    { key: "height", label: "整体高度", min: 0.8, max: 6, step: 0.05, default: 3.2 },
    { key: "turns", label: "圈数", min: 0.5, max: 8, step: 0.1, default: 3.2 },
    { key: "strandRadius", label: "链条粗细", min: 0.006, max: 0.1, step: 0.002, default: 0.035 },
    { key: "rungRadius", label: "横档粗细", min: 0.004, max: 0.08, step: 0.002, default: 0.018 },
    { key: "beadRadius", label: "节点半径", min: 0.02, max: 0.16, step: 0.005, default: 0.07 },
    { key: "phase", label: "相位", min: -6.28, max: 6.28, step: 0.02, default: 0 },
  ],
  build(p) {
    return buildDnaHelixParts({
      pairs: Math.round(p.pairs),
      radius: p.radius,
      height: p.height,
      turns: p.turns,
      strandRadius: p.strandRadius,
      rungRadius: p.rungRadius,
      beadRadius: p.beadRadius,
      phase: p.phase,
    });
  },
};

const blenderGradientBox = {
  id: "blender-gradient-box",
  name: "BlenderHowtos 渐变盒阵",
  schema: [
    { key: "cols", label: "列数", min: 1, max: 24, step: 1, default: 10 },
    { key: "rows", label: "行数", min: 1, max: 24, step: 1, default: 8 },
    { key: "spacing", label: "间距", min: 0.12, max: 0.7, step: 0.01, default: 0.36 },
    { key: "minHeight", label: "最低高度", min: 0.02, max: 0.8, step: 0.01, default: 0.12 },
    { key: "maxHeight", label: "最高高度", min: 0.2, max: 3, step: 0.02, default: 1.35 },
    { key: "rampBias", label: "渐变偏置", min: 0.2, max: 3, step: 0.02, default: 1.15 },
    { key: "ripple", label: "波纹扰动", min: 0, max: 0.45, step: 0.01, default: 0.16 },
  ],
  build(p) {
    return buildGradientBoxParts({
      cols: Math.round(p.cols),
      rows: Math.round(p.rows),
      spacing: p.spacing,
      minHeight: p.minHeight,
      maxHeight: p.maxHeight,
      rampBias: p.rampBias,
      ripple: p.ripple,
    });
  },
};

const blenderRainingGarden = {
  id: "blender-raining-garden",
  name: "BlenderHowtos 雨中花园",
  schema: [
    { key: "radius", label: "花园半径", min: 0.8, max: 4, step: 0.05, default: 2.15 },
    { key: "grassCount", label: "草叶数量", min: 0, max: 500, step: 5, default: 180 },
    { key: "flowerCount", label: "花朵数量", min: 0, max: 120, step: 1, default: 36 },
    { key: "rainCount", label: "雨线数量", min: 0, max: 240, step: 2, default: 90 },
    { key: "rainHeight", label: "雨层高度", min: 0.8, max: 5, step: 0.05, default: 2.7 },
    { key: "rainSlant", label: "雨线倾斜", min: -1, max: 1, step: 0.02, default: 0.32 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 19 },
  ],
  build(p) {
    return buildRainingGardenParts({
      radius: p.radius,
      grassCount: Math.round(p.grassCount),
      flowerCount: Math.round(p.flowerCount),
      rainCount: Math.round(p.rainCount),
      rainHeight: p.rainHeight,
      rainSlant: p.rainSlant,
      seed: Math.round(p.seed),
    });
  },
};

const blenderHowtos = {
  id: "blender-howtos",
  name: "BlenderHowtos 四类总览",
  schema: [
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 80 },
    { key: "scale", label: "整体缩放", min: 0.4, max: 1.6, step: 0.05, default: 1 },
  ],
  build(p) {
    return buildBlenderHowtosShowcaseParts({
      seed: Math.round(p.seed),
      scale: p.scale,
    });
  },
};

// ---- GrasshopperHowtos clean-room recipes ---------------------------------
const grasshopperRockTile = {
  id: "grasshopper-rock-tile",
  name: "Grasshopper 岩石瓦片",
  schema: [
    { key: "resolution", label: "场分辨率", min: 8, max: 96, step: 4, default: 40 },
    { key: "size", label: "尺寸", min: 1, max: 6, step: 0.1, default: 3.2 },
    { key: "height", label: "浮雕高度", min: 0.02, max: 0.8, step: 0.01, default: 0.28 },
    { key: "cells", label: "瓦片数量", min: 1, max: 10, step: 1, default: 5 },
    { key: "gap", label: "缝隙宽度", min: 0.01, max: 0.28, step: 0.01, default: 0.08 },
    { key: "roughness", label: "石面粗糙", min: 0, max: 1, step: 0.01, default: 0.42 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 11 },
  ],
  build(p) {
    return buildRockTileParts({
      resolution: Math.round(p.resolution),
      size: p.size,
      height: p.height,
      cells: Math.round(p.cells),
      gap: p.gap,
      roughness: p.roughness,
      seed: Math.round(p.seed),
    });
  },
};

const grasshopperVoronoiPipe = {
  id: "grasshopper-voronoi-pipe",
  name: "Grasshopper Voronoi 管网",
  schema: [
    { key: "cells", label: "Voronoi 密度", min: 2, max: 9, step: 1, default: 5 },
    { key: "size", label: "尺寸", min: 1, max: 6, step: 0.1, default: 3.2 },
    { key: "radius", label: "管半径", min: 0.005, max: 0.12, step: 0.005, default: 0.035 },
    { key: "height", label: "离地高度", min: 0.05, max: 0.8, step: 0.01, default: 0.18 },
    { key: "jitter", label: "细胞抖动", min: 0, max: 1.5, step: 0.01, default: 0.92 },
    { key: "edgeWidth", label: "边界宽度", min: 0.02, max: 0.18, step: 0.005, default: 0.07 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 23 },
  ],
  build(p) {
    return buildVoronoiPipeParts({
      cells: Math.round(p.cells),
      size: p.size,
      radius: p.radius,
      height: p.height,
      jitter: p.jitter,
      edgeWidth: p.edgeWidth,
      seed: Math.round(p.seed),
    });
  },
};

const grasshopperWafflePattern = {
  id: "grasshopper-waffle-pattern",
  name: "Grasshopper Waffle 切片",
  schema: [
    { key: "width", label: "宽度", min: 1, max: 6, step: 0.1, default: 3.4 },
    { key: "depth", label: "深度", min: 1, max: 6, step: 0.1, default: 2.6 },
    { key: "slicesX", label: "纵向片数", min: 1, max: 18, step: 1, default: 8 },
    { key: "slicesZ", label: "横向片数", min: 1, max: 18, step: 1, default: 7 },
    { key: "height", label: "高度", min: 0.2, max: 3, step: 0.05, default: 1.25 },
    { key: "thickness", label: "板厚", min: 0.02, max: 0.2, step: 0.005, default: 0.055 },
    { key: "wave", label: "轮廓波动", min: 0, max: 1, step: 0.01, default: 0.32 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 31 },
  ],
  build(p) {
    return buildWafflePatternParts({
      width: p.width,
      depth: p.depth,
      slicesX: Math.round(p.slicesX),
      slicesZ: Math.round(p.slicesZ),
      height: p.height,
      thickness: p.thickness,
      wave: p.wave,
      seed: Math.round(p.seed),
    });
  },
};

const grasshopperReactionDiffusion = {
  id: "grasshopper-reaction-diffusion",
  name: "Grasshopper 反应扩散板",
  schema: [
    { key: "resolution", label: "场分辨率", min: 12, max: 96, step: 4, default: 48 },
    { key: "size", label: "尺寸", min: 1, max: 6, step: 0.1, default: 3 },
    { key: "height", label: "浮雕高度", min: 0.02, max: 0.8, step: 0.01, default: 0.32 },
    { key: "iterations", label: "迭代次数", min: 1, max: 120, step: 1, default: 52 },
    { key: "feed", label: "Feed", min: 0.005, max: 0.09, step: 0.001, default: 0.035 },
    { key: "kill", label: "Kill", min: 0.03, max: 0.09, step: 0.001, default: 0.061 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 43 },
  ],
  build(p) {
    return buildReactionDiffusionPlateParts({
      resolution: Math.round(p.resolution),
      size: p.size,
      height: p.height,
      iterations: Math.round(p.iterations),
      feed: p.feed,
      kill: p.kill,
      seed: Math.round(p.seed),
    });
  },
};

const grasshopperPackedCircle = {
  id: "grasshopper-packed-circle",
  name: "Grasshopper Packed Circle",
  schema: [
    { key: "count", label: "圆数量", min: 4, max: 180, step: 1, default: 64 },
    { key: "width", label: "宽度", min: 1, max: 6, step: 0.1, default: 3.4 },
    { key: "depth", label: "深度", min: 1, max: 6, step: 0.1, default: 2.6 },
    { key: "minRadius", label: "最小半径", min: 0.02, max: 0.25, step: 0.005, default: 0.055 },
    { key: "maxRadius", label: "最大半径", min: 0.03, max: 0.4, step: 0.005, default: 0.18 },
    { key: "padding", label: "间隙", min: 0, max: 0.08, step: 0.002, default: 0.012 },
    { key: "relax", label: "松弛迭代", min: 0, max: 180, step: 1, default: 90 },
    { key: "height", label: "高度", min: 0.03, max: 0.5, step: 0.01, default: 0.16 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 53 },
  ],
  build(p) {
    return buildPackedCircleParts({
      count: Math.round(p.count),
      width: p.width,
      depth: p.depth,
      minRadius: p.minRadius,
      maxRadius: p.maxRadius,
      padding: p.padding,
      relax: Math.round(p.relax),
      height: p.height,
      seed: Math.round(p.seed),
    });
  },
};

const grasshopperLandscapeContour = {
  id: "grasshopper-landscape-contour",
  name: "Grasshopper 等高线地形",
  schema: [
    { key: "resolution", label: "场分辨率", min: 12, max: 96, step: 4, default: 52 },
    { key: "size", label: "尺寸", min: 1, max: 6, step: 0.1, default: 3.4 },
    { key: "height", label: "地形高度", min: 0.05, max: 1.4, step: 0.01, default: 0.62 },
    { key: "levels", label: "等高线层数", min: 1, max: 18, step: 1, default: 9 },
    { key: "lineRadius", label: "线半径", min: 0.004, max: 0.05, step: 0.002, default: 0.012 },
    { key: "noiseScale", label: "地貌频率", min: 0.5, max: 8, step: 0.1, default: 3.1 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 61 },
  ],
  build(p) {
    return buildLandscapeContourParts({
      resolution: Math.round(p.resolution),
      size: p.size,
      height: p.height,
      levels: Math.round(p.levels),
      lineRadius: p.lineRadius,
      noiseScale: p.noiseScale,
      seed: Math.round(p.seed),
    });
  },
};

const grasshopperRibbonLoop = {
  id: "grasshopper-ribbon-loop",
  name: "Grasshopper Ribbon Loop",
  schema: [
    { key: "radius", label: "环半径", min: 0.3, max: 2.5, step: 0.05, default: 1.25 },
    { key: "width", label: "带宽", min: 0.03, max: 0.6, step: 0.01, default: 0.22 },
    { key: "waves", label: "波峰数", min: 0, max: 9, step: 1, default: 3 },
    { key: "twist", label: "扭转强度", min: -3.14, max: 3.14, step: 0.05, default: 1.1 },
    { key: "height", label: "起伏高度", min: 0, max: 1.2, step: 0.02, default: 0.42 },
    { key: "segments", label: "曲线分段", min: 12, max: 160, step: 4, default: 72 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 73 },
  ],
  build(p) {
    return buildRibbonLoopParts({
      radius: p.radius,
      width: p.width,
      waves: Math.round(p.waves),
      twist: p.twist,
      height: p.height,
      segments: Math.round(p.segments),
      seed: Math.round(p.seed),
    });
  },
};

const grasshopperVoxelBunny = {
  id: "grasshopper-voxel-bunny",
  name: "Grasshopper Voxel Bunny",
  schema: [
    { key: "resolution", label: "体素分辨率", min: 16, max: 64, step: 2, default: 34 },
    { key: "size", label: "整体尺寸", min: 0.4, max: 2, step: 0.05, default: 1.1 },
    { key: "earLength", label: "耳朵长度", min: 0.3, max: 1.4, step: 0.02, default: 0.86 },
    { key: "smoothness", label: "融合圆滑度", min: 0.01, max: 0.4, step: 0.01, default: 0.14 },
    { key: "seed", label: "姿态种子", min: 0, max: 999, step: 1, default: 83 },
  ],
  build(p) {
    return buildVoxelBunnyParts({
      resolution: Math.round(p.resolution),
      size: p.size,
      earLength: p.earLength,
      smoothness: p.smoothness,
      seed: Math.round(p.seed),
    });
  },
};

const grasshopperImageField = {
  id: "grasshopper-image-field",
  name: "Grasshopper 图像场浮雕",
  schema: [
    { key: "samples", label: "针阵采样", min: 6, max: 32, step: 1, default: 18 },
    { key: "size", label: "整体尺寸", min: 1, max: 5, step: 0.1, default: 2.8 },
    { key: "reliefHeight", label: "浮雕高度", min: 0.08, max: 1, step: 0.02, default: 0.52 },
    { key: "threshold", label: "轮廓阈值", min: 0.1, max: 0.9, step: 0.01, default: 0.42 },
    { key: "gamma", label: "图像场曲线", min: 0.2, max: 2.5, step: 0.05, default: 0.9 },
    { key: "volumeResolution", label: "体积分辨率", min: 16, max: 64, step: 2, default: 34 },
    { key: "seed", label: "输入种子", min: 0, max: 999, step: 1, default: 89 },
  ],
  build(p) {
    return buildImageFieldReliefParts({
      samples: Math.round(p.samples),
      size: p.size,
      reliefHeight: p.reliefHeight,
      threshold: p.threshold,
      gamma: p.gamma,
      volumeResolution: Math.round(p.volumeResolution),
      seed: Math.round(p.seed),
    });
  },
};

const grasshopperMeshReactionShell = {
  id: "grasshopper-mesh-reaction-shell",
  name: "Grasshopper 曲面反应扩散壳",
  schema: [
    { key: "radius", label: "壳体半径", min: 0.5, max: 2.5, step: 0.05, default: 1.25 },
    { key: "subdivisions", label: "网格细分", min: 1, max: 4, step: 1, default: 4 },
    { key: "iterations", label: "扩散迭代", min: 4, max: 360, step: 1, default: 220 },
    { key: "amplitude", label: "位移强度", min: 0, max: 0.6, step: 0.01, default: 0.12 },
    { key: "feed", label: "Feed", min: 0.01, max: 0.08, step: 0.001, default: 0.035 },
    { key: "kill", label: "Kill", min: 0.03, max: 0.08, step: 0.001, default: 0.061 },
    { key: "spots", label: "初始斑点", min: 1, max: 32, step: 1, default: 14 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 211 },
  ],
  build(p) {
    return buildMeshReactionShellParts({ ...p, subdivisions: Math.round(p.subdivisions), iterations: Math.round(p.iterations), spots: Math.round(p.spots), seed: Math.round(p.seed) });
  },
};

const grasshopperSuperformulaTower = {
  id: "grasshopper-superformula-tower",
  name: "Grasshopper Superformula 塔",
  schema: [
    { key: "height", label: "塔高", min: 1, max: 8, step: 0.1, default: 4.2 },
    { key: "radius", label: "底部半径", min: 0.3, max: 2.5, step: 0.05, default: 1.15 },
    { key: "taper", label: "顶部锥化", min: 0.1, max: 1.5, step: 0.01, default: 0.58 },
    { key: "m", label: "截面瓣数", min: 2, max: 16, step: 1, default: 7 },
    { key: "n1", label: "形状指数 N1", min: 0.1, max: 4, step: 0.02, default: 0.34 },
    { key: "n2", label: "形状指数 N2", min: 0.1, max: 4, step: 0.02, default: 1.15 },
    { key: "n3", label: "形状指数 N3", min: 0.1, max: 4, step: 0.02, default: 1.15 },
    { key: "twist", label: "总扭转", min: -3.14, max: 3.14, step: 0.02, default: 1.05 },
    { key: "bulge", label: "中段鼓度", min: -0.6, max: 0.8, step: 0.01, default: 0.12 },
    { key: "segments", label: "环向分段", min: 12, max: 128, step: 4, default: 72 },
  ],
  build(p) {
    return buildSuperformulaTowerParts({ ...p, m: Math.round(p.m), segments: Math.round(p.segments) });
  },
};

const grasshopperOrigamiPavilion = {
  id: "grasshopper-origami-pavilion",
  name: "Grasshopper XPBD 折纸展亭",
  schema: [
    { key: "width", label: "屋面宽度", min: 1.5, max: 6, step: 0.1, default: 3.8 },
    { key: "depth", label: "屋面进深", min: 1.5, max: 6, step: 0.1, default: 3 },
    { key: "resolution", label: "折纸网格", min: 4, max: 24, step: 2, default: 12 },
    { key: "foldAngle", label: "目标折角", min: -130, max: 130, step: 1, default: 78 },
    { key: "stiffness", label: "折痕刚度", min: 0.1, max: 1, step: 0.01, default: 0.94 },
    { key: "iterations", label: "求解迭代", min: 2, max: 60, step: 1, default: 22 },
  ],
  build(p) {
    return buildOrigamiPavilionParts({ ...p, resolution: Math.round(p.resolution), iterations: Math.round(p.iterations) });
  },
};

const grasshopperHowtos = {
  id: "grasshopper-howtos",
  name: "GrasshopperHowtos 九类总览",
  schema: [
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 70 },
    { key: "scale", label: "整体缩放", min: 0.4, max: 1.6, step: 0.05, default: 1 },
  ],
  build(p) {
    return buildGrasshopperHowtosShowcaseParts({
      seed: Math.round(p.seed),
      scale: p.scale,
    });
  },
};

// ---- HoudiniHowtos clean-room cookbook ------------------------------------
const houdiniHowtosField = {
  id: "houdini-howtos-field",
  name: "HoudiniHowtos 场与等值面",
  schema: [
    { key: "resolution", label: "浮雕分辨率", min: 12, max: 80, step: 2, default: 48 },
    { key: "size", label: "浮雕尺寸", min: 1.2, max: 5, step: 0.05, default: 3 },
    { key: "height", label: "浮雕高度", min: 0.02, max: 0.8, step: 0.01, default: 0.34 },
    { key: "iterations", label: "扩散迭代", min: 1, max: 120, step: 1, default: 48 },
    { key: "showBlob", label: "等值面(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 12 },
  ],
  build(p) {
    const parts = buildReactionDiffusionReliefParts({
      resolution: Math.round(p.resolution),
      size: p.size,
      height: p.height,
      iterations: Math.round(p.iterations),
      seed: Math.round(p.seed),
    });
    if (Math.round(p.showBlob) === 1) parts.push(...buildField3DBlobParts(Math.round(p.seed) + 1));
    return parts;
  },
};

const houdiniHowtosCurveGraph = {
  id: "houdini-howtos-curve-graph",
  name: "HoudiniHowtos 曲线图管网",
  schema: [
    { key: "cols", label: "列数", min: 2, max: 8, step: 1, default: 4 },
    { key: "rows", label: "行数", min: 2, max: 7, step: 1, default: 3 },
    { key: "spacing", label: "节点间距", min: 0.5, max: 2.4, step: 0.05, default: 1.25 },
    { key: "radius", label: "管线半径", min: 0.015, max: 0.16, step: 0.005, default: 0.055 },
    { key: "jitter", label: "节点扰动", min: 0, max: 0.5, step: 0.01, default: 0.18 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 21 },
  ],
  build(p) {
    return buildPipeNetworkParts({
      cols: Math.round(p.cols),
      rows: Math.round(p.rows),
      spacing: p.spacing,
      radius: p.radius,
      jitter: p.jitter,
      seed: Math.round(p.seed),
    });
  },
};

const houdiniHowtosWeavePot = {
  id: "houdini-howtos-weave-pot",
  name: "HoudiniHowtos 编织罐",
  schema: [
    { key: "segments", label: "环向分段", min: 16, max: 96, step: 2, default: 56 },
    { key: "rows", label: "纵向分段", min: 8, max: 64, step: 2, default: 32 },
    { key: "height", label: "罐身高度", min: 0.8, max: 4, step: 0.05, default: 2.4 },
    { key: "radiusBottom", label: "底部半径", min: 0.25, max: 1.4, step: 0.02, default: 0.62 },
    { key: "radiusTop", label: "口部半径", min: 0.25, max: 1.6, step: 0.02, default: 0.92 },
    { key: "bulge", label: "腹部外鼓", min: 0, max: 0.5, step: 0.01, default: 0.18 },
    { key: "relief", label: "编织浮雕", min: 0, max: 0.16, step: 0.005, default: 0.045 },
    { key: "weaveColumns", label: "编织列", min: 2, max: 40, step: 1, default: 18 },
    { key: "weaveRows", label: "编织行", min: 2, max: 24, step: 1, default: 10 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 33 },
  ],
  build(p) {
    return buildWovenPotParts({
      segments: Math.round(p.segments),
      rows: Math.round(p.rows),
      height: p.height,
      radiusBottom: p.radiusBottom,
      radiusTop: p.radiusTop,
      bulge: p.bulge,
      relief: p.relief,
      weaveColumns: Math.round(p.weaveColumns),
      weaveRows: Math.round(p.weaveRows),
      seed: Math.round(p.seed),
    });
  },
};

const houdiniHowtosSciFiPanel = {
  id: "houdini-howtos-sci-fi-panel",
  name: "HoudiniHowtos Sci-Fi 面板",
  schema: [
    { key: "width", label: "面板宽度", min: 1, max: 6, step: 0.05, default: 3.4 },
    { key: "depth", label: "面板深度", min: 0.8, max: 4, step: 0.05, default: 2.2 },
    { key: "thickness", label: "底板厚度", min: 0.04, max: 0.4, step: 0.01, default: 0.16 },
    { key: "cols", label: "横向分格", min: 1, max: 10, step: 1, default: 5 },
    { key: "rows", label: "纵向分格", min: 1, max: 8, step: 1, default: 4 },
    { key: "greebles", label: "小件数量", min: 0, max: 80, step: 1, default: 18 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 44 },
  ],
  build(p) {
    return buildSciFiPanelParts({
      width: p.width,
      depth: p.depth,
      thickness: p.thickness,
      cols: Math.round(p.cols),
      rows: Math.round(p.rows),
      greebles: Math.round(p.greebles),
      seed: Math.round(p.seed),
    });
  },
};

const houdiniHowtosGrowthUrchin = {
  id: "houdini-howtos-growth-urchin",
  name: "HoudiniHowtos 放射生长体",
  schema: [
    { key: "spines", label: "生长刺数量", min: 6, max: 180, step: 1, default: 72 },
    { key: "coreRadius", label: "核心半径", min: 0.12, max: 1.2, step: 0.02, default: 0.48 },
    { key: "spineLength", label: "生长刺长度", min: 0.2, max: 2.6, step: 0.02, default: 1.28 },
    { key: "spineRadius", label: "生长刺粗细", min: 0.006, max: 0.08, step: 0.002, default: 0.026 },
    { key: "segments", label: "曲线分段", min: 3, max: 18, step: 1, default: 9 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 55 },
  ],
  build(p) {
    return buildGrowthUrchinParts({
      spines: Math.round(p.spines),
      coreRadius: p.coreRadius,
      spineLength: p.spineLength,
      spineRadius: p.spineRadius,
      segments: Math.round(p.segments),
      seed: Math.round(p.seed),
    });
  },
};

const houdiniHowtosBspDungeon = {
  id: "houdini-howtos-bsp-dungeon",
  name: "HoudiniHowtos BSP 地牢",
  schema: [
    { key: "width", label: "地图宽度", min: 4, max: 22, step: 0.25, default: 13.5 },
    { key: "depth", label: "地图深度", min: 4, max: 18, step: 0.25, default: 9.5 },
    { key: "iterations", label: "划分层数", min: 1, max: 7, step: 1, default: 4 },
    { key: "roomFill", label: "房间填充", min: 0.35, max: 0.94, step: 0.01, default: 0.7 },
    { key: "corridorWidth", label: "走廊宽度", min: 0.18, max: 1.6, step: 0.02, default: 0.78 },
    { key: "wallHeight", label: "墙体高度", min: 0.12, max: 2.2, step: 0.02, default: 0.72 },
    { key: "floorThickness", label: "地面厚度", min: 0.02, max: 0.24, step: 0.01, default: 0.08 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 64 },
  ],
  build(p) {
    return buildBspDungeonParts({
      width: p.width,
      depth: p.depth,
      iterations: Math.round(p.iterations),
      roomFill: p.roomFill,
      corridorWidth: p.corridorWidth,
      wallHeight: p.wallHeight,
      floorThickness: p.floorThickness,
      seed: Math.round(p.seed),
    });
  },
};

const pcgSplineCurbModel = {
  id: "pcg-spline-curb-sidewalk",
  name: "PCG 样条路缘与人行道",
  category: "基建",
  critiqueGoal: "clean spline-following road edge with staggered curb courses, transverse cap stones, and readable sidewalk paving",
  scenePreset: {
    environment: "studio",
    background: { mode: "gradient", color: "#7d8b91", color2: "#c6c3b6" },
    exposure: 1.05,
    camera: "persp",
    grid: false,
  },
  assetMeta: {
    description: "复刻 UE5 PCG 教程的样条采样、点变换、静态网格实例化套路，并扩展为道路、分层路缘砖、压顶砖和错缝人行道铺装。",
    tags: ["B站复刻", "UE5 PCG", "样条线", "路缘", "人行道", "程序化基建"],
    capabilities: ["样条弯曲", "路缘分层", "半砖错缝", "双侧生成", "GPU 实例", "种子复现"],
    materialClasses: ["沥青", "砖", "石材", "混凝土"],
    sourceUrl: "https://www.bilibili.com/video/BV1FCyeYUEB7/",
  },
  schema: [
    { key: "length", label: "道路长度", min: 8, max: 80, step: 1, default: 34 },
    { key: "bend", label: "样条弯曲", min: 0, max: 24, step: 0.5, default: 7 },
    { key: "roadWidth", label: "车行道宽度", min: 2.5, max: 14, step: 0.25, default: 7 },
    { key: "sidewalkWidth", label: "人行道宽度", min: 0.8, max: 6, step: 0.1, default: 2.4 },
    { key: "curbWidth", label: "路缘宽度", min: 0.16, max: 0.9, step: 0.02, default: 0.38 },
    { key: "curbHeight", label: "路缘高度", min: 0.16, max: 1.2, step: 0.02, default: 0.5 },
    { key: "curbCourses", label: "路缘层数", min: 1, max: 5, step: 1, default: 2 },
    { key: "curbBlockLength", label: "路缘砖长度", min: 0.3, max: 2, step: 0.02, default: 0.82 },
    { key: "sidewalkTileLength", label: "铺砖长度", min: 0.3, max: 2, step: 0.02, default: 0.9 },
    { key: "sidewalkTileWidth", label: "铺砖宽度", min: 0.25, max: 1.4, step: 0.02, default: 0.62 },
    { key: "gap", label: "砖缝", min: 0.01, max: 0.16, step: 0.005, default: 0.055 },
    { key: "jitter", label: "自然扰动", min: 0, max: 0.14, step: 0.005, default: 0.035 },
    { key: "bothSides", label: "双侧生成", min: 0, max: 1, step: 1, default: 0 },
    { key: "seed", label: "随机种子", min: 0, max: 9999, step: 1, default: 170 },
  ],
  build(params) {
    return buildPcgSplineCurbParts({
      ...params,
      curbCourses: Math.round(params.curbCourses),
      bothSides: params.bothSides >= 0.5,
      seed: Math.round(params.seed),
    });
  },
};

const pcgSplineCurbPresetModels = Object.fromEntries(
  PCG_SPLINE_CURB_PRESETS.map((preset) => [
    preset.id,
    {
      id: preset.id,
      name: preset.name,
      category: "基建",
      critiqueGoal: "distinct spline-authored infrastructure with clean curb courses, readable paving rhythm, and continuous road silhouette",
      scenePreset: {
        environment: "studio",
        background: { mode: "gradient", color: "#718087", color2: "#c8c2b4" },
        exposure: 1.05,
        camera: "persp",
        grid: false,
      },
      assetMeta: {
        description: preset.description,
        tags: ["程序化基建", "样条线", "GPU 实例", ...preset.tags],
        capabilities: ["自定义路径", "弧长采样", "路缘错缝", "铺装阵列", "实时参数", "种子复现"],
        materialClasses: ["沥青", "砖", "石材", "混凝土"],
        sourceUrl: "https://www.bilibili.com/video/BV1FCyeYUEB7/",
      },
      schema: pcgSplineCurbModel.schema.map((field) => ({
        ...field,
        default: preset.defaults[field.key] ?? field.default,
      })),
      build(params) {
        return buildPcgSplineCurbPresetParts(preset.id, {
          ...params,
          curbCourses: Math.round(params.curbCourses),
          bothSides: params.bothSides >= 0.5,
          seed: Math.round(params.seed),
        });
      },
    },
  ]),
);

const randomDungeon = {
  id: "random-dungeon",
  name: "随机地牢",
  critiqueGoal: "seeded branching dungeon with connected rooms, corridors, loops and readable entry/exit",
  schema: [
    { key: "roomCount", label: "房间数量", min: 4, max: 40, step: 1, default: 22 },
    { key: "minRoomSize", label: "最小房间", min: 3, max: 8, step: 1, default: 4 },
    { key: "maxRoomSize", label: "最大房间", min: 4, max: 12, step: 1, default: 9 },
    { key: "corridorWidth", label: "走廊宽度", min: 1, max: 4, step: 1, default: 2 },
    { key: "branchiness", label: "分支程度", min: 0, max: 1, step: 0.01, default: 0.68 },
    { key: "loopChance", label: "环路概率", min: 0, max: 1, step: 0.01, default: 0.22 },
    { key: "cellSize", label: "格子尺寸", min: 0.35, max: 1.5, step: 0.05, default: 0.72 },
    { key: "wallHeight", label: "墙体高度", min: 0.15, max: 2.2, step: 0.05, default: 0.8 },
    { key: "seed", label: "随机种子", min: 0, max: 999999, step: 1, default: 147 },
  ],
  build(p) {
    return buildRandomDungeonParts({
      roomCount: Math.round(p.roomCount),
      minRoomSize: Math.round(p.minRoomSize),
      maxRoomSize: Math.max(Math.round(p.minRoomSize), Math.round(p.maxRoomSize)),
      corridorWidth: Math.round(p.corridorWidth),
      branchiness: p.branchiness,
      loopChance: p.loopChance,
      cellSize: p.cellSize,
      wallHeight: p.wallHeight,
      seed: Math.round(p.seed),
    });
  },
};

const dungeonArchitectGrid = {
  id: "dungeon-architect-grid",
  name: "Meshova Dungeon Architect",
  category: "程序地牢",
  critiqueGoal: "connected themed grid dungeon with semantic rooms, corridors, doors, entry and exit",
  assetMeta: {
    description: "布局模型、房间连接图、回环、语义 Marker、可替换 Theme。受地牢生成器工作流启发，Meshova 独立实现。",
    tags: ["程序地牢", "Grid", "MST", "Marker", "Theme"],
    capabilities: ["种子复现", "连通房间图", "回环控制", "主题替换", "语义部件"],
    materialClasses: ["石材", "墓穴", "科幻金属"],
  },
  scenePreset: {
    environment: "studio",
    camera: "top",
    grid: true,
  },
  schema: [
    { key: "width", label: "地牢宽度", min: 16, max: 60, step: 1, default: 34 },
    { key: "depth", label: "地牢深度", min: 16, max: 50, step: 1, default: 26 },
    { key: "roomCount", label: "目标房间数", min: 3, max: 28, step: 1, default: 12 },
    { key: "minRoomSize", label: "最小房间尺寸", min: 3, max: 8, step: 1, default: 4 },
    { key: "maxRoomSize", label: "最大房间尺寸", min: 4, max: 14, step: 1, default: 8 },
    { key: "roomPadding", label: "房间间隔", min: 0, max: 3, step: 1, default: 1 },
    { key: "loopChance", label: "回环密度", min: 0, max: 1, step: 0.05, default: 0.18 },
    { key: "wallHeight", label: "墙体高度", min: 0.3, max: 3, step: 0.05, default: 1.25 },
    { key: "themeIndex", label: "主题：石材/墓穴/科幻", min: 0, max: 2, step: 1, default: 0 },
    { key: "seed", label: "布局种子", min: 0, max: 9999, step: 1, default: 1337 },
  ],
  build(p) {
    const themes = ["stone", "crypt", "tech"];
    return buildDungeonArchitectParts({
      width: Math.round(p.width),
      depth: Math.round(p.depth),
      roomCount: Math.round(p.roomCount),
      minRoomSize: Math.round(p.minRoomSize),
      maxRoomSize: Math.round(p.maxRoomSize),
      roomPadding: Math.round(p.roomPadding),
      loopChance: p.loopChance,
      wallHeight: p.wallHeight,
      theme: themes[Math.max(0, Math.min(2, Math.round(p.themeIndex)))],
      seed: Math.round(p.seed),
    });
  },
};

const houdiniHowtosVoronoiVase = {
  id: "houdini-howtos-voronoi-vase",
  name: "HoudiniHowtos Voronoi 花瓶",
  schema: [
    { key: "segments", label: "环向分段", min: 12, max: 128, step: 2, default: 72 },
    { key: "rows", label: "纵向分段", min: 8, max: 80, step: 2, default: 44 },
    { key: "height", label: "高度", min: 0.8, max: 4.5, step: 0.05, default: 2.7 },
    { key: "radius", label: "主体半径", min: 0.25, max: 1.6, step: 0.02, default: 0.82 },
    { key: "neck", label: "颈部收束", min: 0.22, max: 1.15, step: 0.01, default: 0.56 },
    { key: "bulge", label: "腹部外鼓", min: 0, max: 0.75, step: 0.01, default: 0.3 },
    { key: "twist", label: "扭转", min: -1, max: 1, step: 0.01, default: 0.16 },
    { key: "cells", label: "Voronoi 单元", min: 3, max: 96, step: 1, default: 34 },
    { key: "edgeWidth", label: "边界宽度", min: 0.008, max: 0.18, step: 0.002, default: 0.045 },
    { key: "relief", label: "浮雕高度", min: 0, max: 0.18, step: 0.005, default: 0.055 },
    { key: "cellInset", label: "单元内凹", min: 0, max: 1, step: 0.01, default: 0.38 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 72 },
  ],
  build(p) {
    return buildVoronoiVaseParts({
      segments: Math.round(p.segments),
      rows: Math.round(p.rows),
      height: p.height,
      radius: p.radius,
      neck: p.neck,
      bulge: p.bulge,
      twist: p.twist,
      cells: Math.round(p.cells),
      edgeWidth: p.edgeWidth,
      relief: p.relief,
      cellInset: p.cellInset,
      seed: Math.round(p.seed),
    });
  },
};

const houdiniHowtos = {
  id: "houdini-howtos",
  name: "HoudiniHowtos 七类总览",
  schema: [
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 100 },
    { key: "scale", label: "整体缩放", min: 0.4, max: 1.6, step: 0.05, default: 1 },
  ],
  build(p) {
    return buildHoudiniHowtosShowcaseParts({
      seed: Math.round(p.seed),
      scale: p.scale,
    });
  },
};

// ---- Fabcafe Houdini Lectures clean-room reproductions ---------------------
const fabcafeWavySurface = {
  id: "fabcafe-wavy-surface",
  name: "Fabcafe 波浪实例面",
  schema: [
    { key: "cols", label: "网格列数", min: 6, max: 56, step: 1, default: 28 },
    { key: "rows", label: "网格行数", min: 6, max: 56, step: 1, default: 28 },
    { key: "size", label: "整体尺寸", min: 2, max: 12, step: 0.1, default: 7 },
    { key: "waveScale", label: "噪声频率", min: 0.4, max: 6, step: 0.05, default: 2.1 },
    { key: "surfaceAmp", label: "波面起伏", min: 0, max: 1.2, step: 0.02, default: 0.32 },
    { key: "threshold", label: "删除阈值", min: 0, max: 0.9, step: 0.01, default: 0.34 },
    { key: "blockHeight", label: "方柱高度", min: 0.08, max: 1.4, step: 0.02, default: 0.42 },
    { key: "fill", label: "方柱填充", min: 0.2, max: 1, step: 0.01, default: 0.72 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 17 },
  ],
  build(p) {
    return buildFabcafeWavySurfaceParts({
      cols: Math.round(p.cols),
      rows: Math.round(p.rows),
      size: p.size,
      waveScale: p.waveScale,
      surfaceAmp: p.surfaceAmp,
      threshold: p.threshold,
      blockHeight: p.blockHeight,
      fill: p.fill,
      seed: Math.round(p.seed),
    });
  },
};

const fabcafeTwistTower = {
  id: "fabcafe-twist-tower",
  name: "Fabcafe 扭转塔",
  schema: [
    { key: "height", label: "塔高", min: 2, max: 14, step: 0.1, default: 7.5 },
    { key: "radius", label: "半径", min: 0.25, max: 2.4, step: 0.02, default: 1.15 },
    { key: "turns", label: "旋转圈数", min: 0.25, max: 5, step: 0.05, default: 2.35 },
    { key: "twist", label: "扭曲强度", min: -3, max: 3, step: 0.05, default: 1.2 },
    { key: "samples", label: "粒子点数", min: 12, max: 90, step: 1, default: 44 },
    { key: "copies", label: "反馈复制数", min: 1, max: 10, step: 1, default: 6 },
    { key: "tubeRadius", label: "体素半径", min: 0.04, max: 0.36, step: 0.01, default: 0.18 },
    { key: "floors", label: "楼层环数", min: 0, max: 20, step: 1, default: 9 },
    { key: "resolution", label: "体素分辨率", min: 16, max: 52, step: 1, default: 34 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 29 },
  ],
  build(p) {
    return buildFabcafeTwistTowerParts({
      height: p.height,
      radius: p.radius,
      turns: p.turns,
      twist: p.twist,
      samples: Math.round(p.samples),
      copies: Math.round(p.copies),
      tubeRadius: p.tubeRadius,
      floors: Math.round(p.floors),
      resolution: Math.round(p.resolution),
      seed: Math.round(p.seed),
    });
  },
};

const fabcafeHoudini = {
  id: "fabcafe-houdini",
  name: "Fabcafe Houdini 两例总览",
  schema: [
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 40 },
    { key: "scale", label: "整体缩放", min: 0.4, max: 1.5, step: 0.05, default: 1 },
  ],
  build(p) {
    return buildFabcafeHoudiniShowcaseParts({
      seed: Math.round(p.seed),
      scale: p.scale,
    });
  },
};

// ---- Braid rope: phase-shifted curves -> resample -> tube sweep ------------
const braidRopeModel = {
  id: "braid-rope",
  name: "编织绳",
  schema: [
    { key: "strands", label: "绳股数", min: 2, max: 5, step: 1, default: 3 },
    { key: "length", label: "长度", min: 1.5, max: 10, step: 0.1, default: 5.2 },
    { key: "braidRadius", label: "编织半径", min: 0.08, max: 0.8, step: 0.01, default: 0.24 },
    { key: "strandRadius", label: "绳股粗细", min: 0.02, max: 0.2, step: 0.005, default: 0.075 },
    { key: "turns", label: "编织圈数", min: 1, max: 12, step: 0.5, default: 5 },
    { key: "segments", label: "曲线分段", min: 24, max: 220, step: 4, default: 140 },
    { key: "sides", label: "截面边数", min: 4, max: 18, step: 1, default: 9 },
    { key: "irregularity", label: "手工不规则", min: 0, max: 0.25, step: 0.005, default: 0.025 },
    { key: "endBands", label: "端部金属箍(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "seed", label: "随机种子", min: 0, max: 100, step: 1, default: 17 },
  ],
  build(p) {
    return buildBraidRopeParts({
      strands: Math.round(p.strands),
      length: p.length,
      braidRadius: p.braidRadius,
      strandRadius: p.strandRadius,
      turns: p.turns,
      segments: Math.round(p.segments),
      sides: Math.round(p.sides),
      irregularity: p.irregularity,
      endBands: Math.round(p.endBands) === 1,
      seed: Math.round(p.seed),
    });
  },
};

// ---- Roof generator: footprint -> roof style -> trim/details --------------
const roofGeneratorModel = {
  id: "roof-generator",
  name: "屋顶生成器",
  schema: [
    { key: "style", label: "样式(0双坡/1四坡/2十字/3折线/4单坡/5蝶形)", min: 0, max: 5, step: 1, default: 2 },
    { key: "width", label: "面宽", min: 1.5, max: 10, step: 0.1, default: 5.2 },
    { key: "depth", label: "进深", min: 1.2, max: 8, step: 0.1, default: 3.6 },
    { key: "wallHeight", label: "墙体高度", min: 0.4, max: 4, step: 0.05, default: 1.6 },
    { key: "roofHeight", label: "屋顶高度", min: 0.15, max: 3, step: 0.05, default: 1.15 },
    { key: "overhang", label: "屋檐外挑", min: 0, max: 1, step: 0.02, default: 0.34 },
    { key: "dormers", label: "老虎窗数量", min: 0, max: 6, step: 1, default: 2 },
    { key: "chimney", label: "烟囱(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "rafters", label: "外露椽子(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "seed", label: "随机种子", min: 0, max: 100, step: 1, default: 31 },
  ],
  build(p) {
    const styles = ["gable", "hip", "crossGable", "mansard", "shed", "butterfly"];
    return buildRoofGeneratorParts({
      style: styles[Math.round(p.style)] || "crossGable",
      width: p.width,
      depth: p.depth,
      wallHeight: p.wallHeight,
      roofHeight: p.roofHeight,
      overhang: p.overhang,
      dormers: Math.round(p.dormers),
      chimney: Math.round(p.chimney) === 1,
      rafters: Math.round(p.rafters) === 1,
      seed: Math.round(p.seed),
    });
  },
};

// ---- Image remeshing: source image field -> cells/dots/triangles/relief ----
const imageRemeshModel = {
  id: "image-remesh",
  name: "图像重网格",
  schema: [
    { key: "mode", label: "模式(0套件/1Voronoi/2点阵/3三角/4浮雕)", min: 0, max: 4, step: 1, default: 0 },
    { key: "source", label: "图像(0肖像/1水果/2波浪)", min: 0, max: 2, step: 1, default: 0 },
    { key: "size", label: "面板尺寸", min: 1.2, max: 4.2, step: 0.05, default: 2.25 },
    { key: "resolution", label: "网格精度", min: 6, max: 34, step: 1, default: 18 },
    { key: "samples", label: "采样点数", min: 16, max: 180, step: 4, default: 80 },
    { key: "reliefHeight", label: "浮雕高度", min: 0.05, max: 1.2, step: 0.02, default: 0.55 },
    { key: "seed", label: "随机种子", min: 0, max: 100, step: 1, default: 47 },
  ],
  build(p) {
    const modes = ["suite", "voronoi", "dots", "triangles", "relief"];
    const sources = ["portrait", "fruit", "waves"];
    return buildImageRemeshParts({
      mode: modes[Math.round(p.mode)] || "suite",
      source: sources[Math.round(p.source)] || "portrait",
      size: p.size,
      resolution: Math.round(p.resolution),
      samples: Math.round(p.samples),
      reliefHeight: p.reliefHeight,
      seed: Math.round(p.seed),
    });
  },
};

// ---- PCG colonnade: scatter along a spline, cadence + look-at orientation ----
// A boulevard built with scatterAlongCurve -> ruleCadence (every Nth slot is a
// lamp) -> ruleLookAt (props face the central axis) -> copyToPoints. Shows the
// UE PCG "spline sampler + LookAt" flow end to end.
const pcgColonnade = {
  id: "pcg-colonnade",
  name: "PCG 林荫大道",
  schema: [
    { key: "length", label: "大道长度", min: 12, max: 40, step: 1, default: 26 },
    { key: "curve", label: "弯曲程度", min: 0, max: 6, step: 0.1, default: 2.5 },
    { key: "spacing", label: "间距", min: 1, max: 4, step: 0.1, default: 2.2 },
    { key: "width", label: "道宽", min: 1.5, max: 6, step: 0.1, default: 3.2 },
    { key: "lampEvery", label: "灯柱间隔", min: 2, max: 8, step: 1, default: 4 },
    { key: "seed", label: "随机种子", min: 0, max: 100, step: 1, default: 5 },
  ],
  build(p) {
    const half = p.length / 2;
    const path = smoothCurve(
      polyline([
        vec3(-half, 0, -p.curve),
        vec3(-half * 0.35, 0, p.curve),
        vec3(half * 0.35, 0, -p.curve),
        vec3(half, 0, p.curve),
      ]),
      8,
    );
    // rows of points on both sides of the boulevard, facing the centerline.
    const cloud = scatterAlongCurve(path, {
      spacing: p.spacing,
      offset: p.width / 2,
      bothSides: true,
      endPadding: 0.5,
    });
    const laid = applyRules(cloud, [
      ruleCadence(Math.round(p.lampEvery), 1, 0), // variant 1 = lamp, 0 = tree
      ruleLookAt({ target: vec3(0, 0, 0) }),
      ruleScaleJitter(0.2, (p.seed | 0) + 1),
    ]);
    // library: variant 0 = small tree, variant 1 = lamp post.
    const treeMesh = merge(
      translateMesh(cylinder(0.06, 0.8, 6), vec3(0, 0.4, 0)),
      translateMesh(icosphere(0.4, 1), vec3(0, 1.1, 0)),
    );
    const lampMesh = merge(
      translateMesh(cylinder(0.04, 1.3, 6), vec3(0, 0.65, 0)),
      translateMesh(icosphere(0.13, 1), vec3(0, 1.4, 0)),
    );
    const trees = translateMesh(copyToPoints(cloud0(laid, 0), [treeMesh], {
      scale: pointAttribute("scale", 1),
      yaw: pointAttribute("yaw", 0),
      alignToNormal: false,
    }), vec3(0, 0.01, 0));
    const lamps = translateMesh(copyToPoints(cloud0(laid, 1), [lampMesh], {
      yaw: pointAttribute("yaw", 0),
      alignToNormal: false,
    }), vec3(0, 0.01, 0));
    // the road ribbon itself.
    const ribbon = roadRibbon(path, { halfWidth: p.width / 2 + 0.4, sampleDistance: 0.5 });
    return [
      surfPart("road", ribbon, "plastic", { color: [0.22, 0.22, 0.24], roughness: 0.9 }),
      part("trees", trees, [0.28, 0.5, 0.2]),
      surfPart("lamps", lamps, "brushedMetal", { color: [0.7, 0.7, 0.72] }),
    ];
  },
};

// keep only points whose "variant" attribute equals v (post-cadence split).
function cloud0(pc, v) {
  const keep = [];
  const va = pc.attributes && pc.attributes.variant ? pc.attributes.variant : null;
  for (let i = 0; i < pc.points.length; i++) {
    if (!va || Math.round(va[i]) === v) keep.push(i);
  }
  const attributes = {};
  if (pc.attributes) {
    for (const k of Object.keys(pc.attributes)) {
      attributes[k] = keep.map((i) => pc.attributes[k][i]);
    }
  }
  return makePointCloud({
    points: keep.map((i) => pc.points[i]),
    normals: keep.map((i) => pc.normals[i]),
    attributes,
  });
}

// ---- PCG plaza: grid clipped to a circle, hierarchical assemblies placed ----
// scatterGrid -> ruleClipToPolygon (circular boundary = UE Intersection) ->
// copyAssembliesToPoints. Each stamp is a composed unit (trunk + canopy or a
// planter box + shrub) so detail travels together — the ApplyHierarchy idea.
const pcgPlaza = {
  id: "pcg-plaza",
  name: "PCG 圆形广场",
  schema: [
    { key: "radius", label: "广场半径", min: 4, max: 14, step: 0.5, default: 9 },
    { key: "cell", label: "网格间距", min: 1, max: 3, step: 0.1, default: 1.6 },
    { key: "ringGap", label: "中心留空", min: 0, max: 6, step: 0.2, default: 2.4 },
    { key: "jitter", label: "位置抖动", min: 0, max: 0.6, step: 0.02, default: 0.25 },
    { key: "treeRatio", label: "乔木占比", min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: "seed", label: "随机种子", min: 0, max: 100, step: 1, default: 9 },
  ],
  build(p) {
    const n = Math.ceil((p.radius * 2) / p.cell) + 1;
    const grid = scatterGrid({ cols: n, rows: n, cellX: p.cell, cellZ: p.cell, y: 0 });
    // circle boundary as a closed polygon (XZ).
    const ring = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      ring.push(vec3(Math.cos(a) * p.radius, 0, Math.sin(a) * p.radius));
    }
    const inner = [];
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      inner.push(vec3(Math.cos(a) * p.ringGap, 0, Math.sin(a) * p.ringGap));
    }
    const rules = [
      ruleClipToPolygon(ring, { mode: "keep" }), // intersection with the disc
    ];
    if (p.ringGap > 0) rules.push(ruleClipToPolygon(inner, { mode: "remove" })); // punch center
    rules.push(
      pruneMasked(), // drop everything outside the ring / inside the center
      ruleJitterPosition(p.jitter, (p.seed | 0) + 1),
      ruleWeightedFill([0, 1], { weights: [p.treeRatio, 1 - p.treeRatio], seed: (p.seed | 0) + 2 }),
      ruleScaleJitter(0.25, (p.seed | 0) + 3),
      ruleYawJitter(Math.PI, (p.seed | 0) + 4),
    );
    const placed = applyRules(grid, rules);
    // two hierarchical assemblies: variant 0 = tree, variant 1 = planter + shrub.
    const treeAsm = {
      parts: [
        { mesh: cylinder(0.07, 1.0, 6), offset: vec3(0, 0.5, 0) },
        { mesh: icosphere(0.5, 1), offset: vec3(0, 1.35, 0) },
        { mesh: icosphere(0.34, 1), offset: vec3(0.14, 1.7, 0.05), scale: 0.8 },
      ],
    };
    const planterAsm = {
      parts: [
        { mesh: box(0.55, 0.35, 0.55), offset: vec3(0, 0.17, 0) },
        { mesh: icosphere(0.32, 1), offset: vec3(0, 0.55, 0), scale: 0.9 },
      ],
    };
    const props = copyAssembliesToPoints(placed, [treeAsm, planterAsm], {
      variant: pointAttribute("variant", 0),
      scale: pointAttribute("scale", 1),
      yaw: pointAttribute("yaw", 0),
      alignToNormal: false,
    });
    // paved disc.
    const disc = scaleMesh(cylinder(p.radius + 0.5, 0.15, 48), vec3(1, 1, 1));
    return [
      surfPart("plaza", translateMesh(disc, vec3(0, -0.075, 0)), "plastic", {
        color: [0.55, 0.52, 0.48],
        roughness: 0.85,
      }),
      part("props", props, [0.32, 0.5, 0.24]),
    ];
  },
};

// ---- PCG boulder field: neighbor spacing + self-pruning, layered by size ----
// surfacePointCloud on a bumpy terrain -> ruleDistanceToNeighbors (measure
// crowding) -> ruleSelfPruning (Poisson de-clump) -> partition by size into
// two layers (UE PCG DistanceToNeighbors + density partitioning).
const pcgBoulders = {
  id: "pcg-boulders",
  name: "PCG 岩石阵",
  schema: [
    { key: "size", label: "地形尺寸", min: 8, max: 24, step: 0.5, default: 16 },
    { key: "relief", label: "地形起伏", min: 0.3, max: 4, step: 0.1, default: 1.6 },
    { key: "count", label: "初始撒点", min: 200, max: 2000, step: 50, default: 900 },
    { key: "spacing", label: "最小间距", min: 0.6, max: 3, step: 0.1, default: 1.4 },
    { key: "bigRatio", label: "巨石占比", min: 0, max: 1, step: 0.05, default: 0.3 },
    { key: "seed", label: "随机种子", min: 0, max: 100, step: 1, default: 3 },
  ],
  build(p) {
    const field = makeTerrainPrimitiveField({
      resolution: 80,
      seed: p.seed | 0,
      height: 1,
      noiseScale: 1.4,
      ridgeStrength: 0.35,
      islandFalloff: 1.4,
    });
    const terrain = heightfieldToTerrainMesh(field, { size: p.size, heightScale: p.relief, baseY: 0 });
    const raw = surfacePointCloud(terrain, { count: Math.round(p.count), seed: (p.seed | 0) + 1 });
    const declumped = applyRules(raw, [
      ruleDistanceToNeighbors({ attr: "nd", cellSize: p.spacing }),
      ruleSelfPruning({ radius: p.spacing }),
      pruneMasked(), // actually drop the clashing points self-pruning marked
      // size = big/small, jitter scale + yaw for rock variety.
      ruleWeightedFill([1, 0], { weights: [p.bigRatio, 1 - p.bigRatio], seed: (p.seed | 0) + 2 }),
      ruleScaleJitter(0.4, (p.seed | 0) + 3),
      ruleYawJitter(Math.PI, (p.seed | 0) + 4),
    ]);
    // split into big/small layers, each with its own rock mesh.
    const smallRock = displaceByNoise(icosphere(0.3, 1), { amount: 0.09, scale: 3, seed: 11 });
    const bigRock = displaceByNoise(icosphere(0.75, 2), { amount: 0.22, scale: 2, seed: 21 });
    const layers = partitionByAttribute(declumped, "variant", 2);
    const smallMesh = copyToPoints(layers[0], [smallRock], {
      scale: pointAttribute("scale", 1),
      yaw: pointAttribute("yaw", 0),
      alignToNormal: false,
    });
    const bigMesh = copyToPoints(layers[1], [bigRock], {
      scale: pointAttribute("scale", 1),
      yaw: pointAttribute("yaw", 0),
      alignToNormal: false,
    });
    return [
      part("terrain", terrain, [0.45, 0.42, 0.36]),
      surfPart("small-rocks", smallMesh, "plastic", { color: [0.5, 0.48, 0.45], roughness: 0.95 }),
      surfPart("big-rocks", bigMesh, "plastic", { color: [0.42, 0.4, 0.38], roughness: 0.95 }),
    ];
  },
};

// ---- Terrain with slope/height auto-material (UE M_BGLandscape_Auto) ----
// A heightfield mesh vertex-colored by slope + altitude: grass on flat tops,
// dirt on medium slopes, rock on cliffs, snow on the peaks. Pure code, per the
// same "陡坡不长草" idea as ruleNormalToDensity but on the material side.
const terrainLayered = {
  id: "terrain-layered",
  name: "坡度分层地形",
  schema: [
    { key: "size", label: "地形尺寸", min: 10, max: 40, step: 1, default: 24 },
    { key: "relief", label: "地形起伏", min: 1, max: 12, step: 0.2, default: 6 },
    { key: "snowLine", label: "雪线高度", min: 0, max: 1, step: 0.02, default: 0.72 },
    { key: "grassSlope", label: "草地坡度阈", min: 0.4, max: 0.95, step: 0.01, default: 0.8 },
    { key: "breakup", label: "边界噪声", min: 0, max: 1, step: 0.02, default: 0.5 },
    { key: "seed", label: "随机种子", min: 0, max: 100, step: 1, default: 12 },
  ],
  build(p) {
    const field = makeTerrainPrimitiveField({
      resolution: 128,
      seed: p.seed | 0,
      height: 1,
      noiseScale: 1.15,
      ridgeStrength: 0.6,
      islandFalloff: 1.4,
    });
    const terrain = heightfieldToTerrainMesh(field, { size: p.size, heightScale: p.relief, baseY: 0 });
    const hi = p.relief; // peaks approach ~relief
    const auto = terrainAutoMaterial(
      [
        { color: [0.32, 0.28, 0.22], minSlope: 0 },                                   // rock/cliff base
        { color: [0.4, 0.3, 0.18], minSlope: 0.55, priority: 1 },                     // dirt on medium slopes
        { color: [0.22, 0.46, 0.16], minSlope: p.grassSlope, priority: 2 },           // grass on flat ground
        { color: [0.92, 0.94, 0.98], minSlope: 0.5, heightRange: [hi * p.snowLine, hi * 1.4], priority: 4 }, // snow caps
      ],
      { breakup: p.breakup, breakupScale: 0.18, softness: 0.12, seed: (p.seed | 0) + 5 },
    );
    const colors = bakeVertexColors(withAttributes(terrain), (ctx) => {
      const c = auto(ctx.position, ctx.normal);
      return vec3(c[0], c[1], c[2]);
    });
    return [{ name: "terrain", mesh: terrain, color: [0.4, 0.4, 0.4], colors }];
  },
};

// ---- Forest floor built as layered scatter (UE Asmbly organization) ----
// One scatter pass, split into layers by variant: a pebble layer, a mushroom
// layer, and a fallen-branch layer, each with its own assemblies + material,
// merged back — the "Stones / Foliage / FallenTrees" pattern.
const forestFloor = {
  id: "forest-floor",
  name: "分层林地地面",
  schema: [
    { key: "size", label: "地面尺寸", min: 4, max: 16, step: 0.5, default: 9 },
    { key: "count", label: "撒点密度", min: 100, max: 1500, step: 50, default: 700 },
    { key: "spacing", label: "最小间距", min: 0.15, max: 1, step: 0.05, default: 0.35 },
    { key: "pebbleRatio", label: "碎石占比", min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: "mushRatio", label: "蘑菇占比", min: 0, max: 1, step: 0.05, default: 0.3 },
    { key: "seed", label: "随机种子", min: 0, max: 100, step: 1, default: 3 },
  ],
  build(p) {
    const ground = plane(p.size, p.size, 1, 1);
    const raw = surfacePointCloud(ground, { count: Math.round(p.count), seed: (p.seed | 0) + 1 });
    // three-way weighted layer choice: 0 pebble, 1 mushroom, 2 branch
    const branchRatio = Math.max(0, 1 - p.pebbleRatio - p.mushRatio);
    const scattered = applyRules(raw, [
      ruleSelfPruning({ radius: p.spacing }),
      ruleWeightedFill([0, 1, 2], { weights: [p.pebbleRatio, p.mushRatio, branchRatio], seed: (p.seed | 0) + 2 }),
      ruleScaleJitter(0.4, (p.seed | 0) + 3),
      ruleYawJitter(Math.PI, (p.seed | 0) + 4),
      pruneMasked(),
    ]);
    const pebble = { parts: [{ mesh: catmullClark(box(0.18, 0.1, 0.22), 1), offset: vec3(0, 0.04, 0) }] };
    const mushroom = {
      parts: [
        { mesh: cylinder(0.03, 0.16, 6), offset: vec3(0, 0.08, 0) },
        { mesh: scaleMesh(sphere(0.09, 10, 8), vec3(1, 0.55, 1)), offset: vec3(0, 0.17, 0) },
      ],
    };
    const branch = { parts: [{ mesh: transform(cylinder(0.035, 0.7, 6), { rotate: vec3(0, 0, Math.PI / 2) }), offset: vec3(0, 0.035, 0) }] };
    const layers = scatterToLayers(scattered, "variant", [
      { name: "pebbles", library: pebble, options: { scale: pointAttribute("scale", 1), yaw: pointAttribute("yaw", 0), alignToNormal: false } },
      { name: "mushrooms", library: mushroom, options: { scale: pointAttribute("scale", 1), yaw: pointAttribute("yaw", 0), alignToNormal: false } },
      { name: "branches", library: branch, options: { scale: pointAttribute("scale", 1), yaw: pointAttribute("yaw", 0), alignToNormal: false } },
    ]);
    const parts = [surfPart("ground", ground, "stone", { color: [0.26, 0.2, 0.13], roughness: 0.95, scale: 3 })];
    const mat = { pebbles: ["stone", { color: [0.5, 0.48, 0.44] }], mushrooms: ["plastic", { color: [0.75, 0.28, 0.2], roughness: 0.5 }], branches: ["foliage", { color: [0.32, 0.22, 0.12], translucency: 0.1 }] };
    for (const L of layers) {
      const [type, params] = mat[L.name] || ["stone", {}];
      parts.push(surfPart(L.name, L.mesh, type, params));
    }
    return parts;
  },
};

// ---- Triplanar-textured boulder: no-UV world-projected rock detail ----
const triplanarBoulder = {
  id: "triplanar-boulder",
  name: "三平面巨石",
  schema: [
    { key: "size", label: "尺寸", min: 0.6, max: 3, step: 0.05, default: 1.6 },
    { key: "detail", label: "细分级数", min: 1, max: 3, step: 1, default: 2 },
    { key: "rough", label: "崎岖程度", min: 0, max: 0.6, step: 0.02, default: 0.32 },
    { key: "texScale", label: "纹理密度", min: 0.5, max: 6, step: 0.1, default: 2.2 },
    { key: "seed", label: "随机种子", min: 0, max: 100, step: 1, default: 9 },
  ],
  build(p) {
    let m = subdivide(icosphere(p.size, 1), p.detail | 0);
    m = displaceByNoise(m, { amount: p.rough, scale: 2.2, seed: p.seed | 0 });
    // triplanar rock albedo: two-tone fbm blended over world position + normal
    const light = fbmPattern((p.seed | 0) + 1, 5);
    const tp = triplanarColor(
      (u, v) => {
        // sharpen fbm into crevice/face bands for clear contrast
        const n = Math.pow(light(u, v), 1.6);
        // dark shadowed crevice -> warm lit rock face (strong enough to read
        // under the bright sky IBL without washing out)
        const dark = [0.06, 0.055, 0.05];
        const lite = [0.42, 0.36, 0.29];
        return [
          dark[0] + (lite[0] - dark[0]) * n,
          dark[1] + (lite[1] - dark[1]) * n,
          dark[2] + (lite[2] - dark[2]) * n,
        ];
      },
      { scale: p.texScale, sharpness: 4 },
    );
    const colors = bakeVertexColors(withAttributes(m), (ctx) => {
      const c = tp(ctx.position, ctx.normal);
      return vec3(c[0], c[1], c[2]);
    });
    // stone surface for full PBR (roughness/normal/ao), triplanar vertex colors
    // drive the albedo so there is no UV stretching on the unwrapped icosphere.
    const p0 = surfPart("boulder", m, "stone", { color: [0.4, 0.38, 0.35], roughness: 0.92, scale: 3 });
    return [{ ...p0, colors }];
  },
};

// ---- a procedural tower: arrayed, scaled boxes ----
const tower = {
  id: "tower",
  name: "程序化塔",
  schema: [
    { key: "floors", label: "层数", min: 2, max: 14, step: 1, default: 7 },
    { key: "width", label: "底宽", min: 0.6, max: 2, step: 0.05, default: 1.2 },
    { key: "floorH", label: "层高", min: 0.4, max: 1.2, step: 0.05, default: 0.7 },
    { key: "taper", label: "收分", min: 0, max: 0.12, step: 0.005, default: 0.05 },
  ],
  build(p) {
    const parts = [];
    const floors = Math.round(p.floors);
    for (let i = 0; i < floors; i++) {
      const w = Math.max(0.15, p.width - i * p.taper);
      const y = i * p.floorH;
      parts.push(surfPart(`floor_${i}`, transform(box(w, p.floorH * 0.92, w), { translate: vec3(0, y, 0) }), "brick"));
    }
    // roof
    const topW = Math.max(0.15, p.width - floors * p.taper);
    parts.push(surfPart("roof", transform(scaleMesh(sphere(topW * 0.8, 4, 2), vec3(1, 1.4, 1)), { translate: vec3(0, floors * p.floorH, 0) }), "ceramic", { color: [0.45, 0.22, 0.16] }));
    return parts;
  },
};

// ---- Houdini-style pagoda: ramp + point cloud + copy-to-points ----
const pagoda = {
  id: "pagoda",
  name: "Houdini式宝塔",
  schema: [
    { key: "floors", label: "层数", min: 3, max: 12, step: 1, default: 7 },
    { key: "width", label: "底层宽度", min: 1.2, max: 3.2, step: 0.05, default: 2.3 },
    { key: "floorH", label: "层高", min: 0.35, max: 0.9, step: 0.05, default: 0.58 },
    { key: "taper", label: "整体收分", min: 0.12, max: 0.55, step: 0.01, default: 0.38 },
    { key: "eave", label: "屋檐外挑", min: 0.06, max: 0.45, step: 0.01, default: 0.22 },
    { key: "density", label: "构件密度", min: 2, max: 8, step: 1, default: 5 },
    { key: "seed", label: "变体种子", min: 0, max: 50, step: 1, default: 9 },
  ],
  build(p) {
    const floors = Math.round(p.floors);
    const widthAt = scalarRamp([
      { t: 0, value: p.width },
      { t: 0.65, value: p.width * (1 - p.taper * 0.72) },
      { t: 1, value: p.width * (1 - p.taper) },
    ], { smooth: true });
    const base = [];
    const walls = [];
    const roofs = [];
    const trim = [];
    const windowPts = [];
    const bracketPts = [];
    const railPts = [];
    const windowYaw = [];
    const bracketYaw = [];
    const railYaw = [];
    const windowVariant = [];
    const windowScale = [];
    const bracketScale = [];
    const railScale = [];
    const density = Math.round(p.density);
    const totalH = floors * p.floorH;

    for (let i = 0; i < floors; i++) {
      const t = floors <= 1 ? 0 : i / (floors - 1);
      const w = widthAt(t);
      const y = i * p.floorH;
      const wallH = p.floorH * 0.48;
      const roofH = p.floorH * 0.36;
      const roofR = w * 0.55 + p.eave;
      const wallW = w * 0.62;
      base.push(transform(box(w * 0.9, 0.08, w * 0.9), { translate: vec3(0, y + 0.04, 0) }));
      walls.push(transform(box(wallW, wallH, wallW), { translate: vec3(0, y + 0.24, 0) }));
      roofs.push(transform(cone(roofR, roofH, 4, true), {
        rotate: vec3(0, Math.PI / 4, 0),
        translate: vec3(0, y + p.floorH * 0.56, 0),
      }));
      trim.push(transform(torus(w * 0.39, 0.015, 4, 8), {
        rotate: vec3(0, Math.PI / 4, 0),
        scale: vec3(1.42, 0.15, 1.42),
        translate: vec3(0, y + p.floorH * 0.36, 0),
      }));

      addWallPoints(windowPts, windowYaw, windowVariant, windowScale, wallW * 0.55, y + 0.22, Math.max(1, density - 2), (i + p.seed) % 4, t);
      addPerimeterPoints(bracketPts, bracketYaw, bracketScale, w * 0.62, y + p.floorH * 0.38, density + 1, 0.75 + (1 - t) * 0.2);
      if (i > 0) addPerimeterPoints(railPts, railYaw, railScale, w * 0.48, y + 0.14, density, 0.75 + (1 - t) * 0.15);
    }

    const windowPc = makePointCloud({
      points: windowPts,
      attributes: { yaw: windowYaw, variant: windowVariant, scale: windowScale },
    });
    const bracketPc = storePointAttribute(makePointCloud({
      points: bracketPts,
      attributes: { yaw: bracketYaw, scale: bracketScale },
    }), "variant", (ctx) => (ctx.index + p.seed) % 2);
    const railPc = makePointCloud({
      points: railPts,
      attributes: { yaw: railYaw, scale: railScale },
    });

    const windowMesh = box(0.16, 0.24, 0.025);
    const doorMesh = box(0.22, 0.36, 0.03);
    const bracketA = box(0.05, 0.09, 0.18);
    const bracketB = transform(box(0.04, 0.12, 0.14), { rotate: vec3(0, 0, 0.35) });
    const railPost = box(0.035, 0.22, 0.035);

    const parts = [
      surfPart("stone_plinths", merge(...base), "stone", { scale: 4 }),
      surfPart("brick_walls", merge(...walls), "brick", { seed: p.seed }),
      surfPart("red_roofs", merge(...roofs), "plastic", { color: [0.38, 0.11, 0.08], roughness: 0.5 }),
      surfPart("wood_trim", merge(...trim), "wood", { tone: [0.42, 0.24, 0.13] }),
      surfPart("windows_doors", copyToPoints(windowPc, [windowMesh, doorMesh], {
        yaw: pointAttribute("yaw"),
        scale: pointAttribute("scale"),
        variant: pointAttribute("variant"),
        alignToNormal: false,
      }), "wood", { tone: [0.22, 0.13, 0.08] }),
      surfPart("eave_brackets", copyToPoints(bracketPc, [bracketA, bracketB], {
        yaw: pointAttribute("yaw"),
        scale: pointAttribute("scale"),
        variant: pointAttribute("variant"),
        alignToNormal: false,
      }), "wood", { tone: [0.35, 0.18, 0.09] }),
      surfPart("rail_posts", copyToPoints(railPc, railPost, {
        yaw: pointAttribute("yaw"),
        scale: pointAttribute("scale"),
        alignToNormal: false,
      }), "wood", { tone: [0.32, 0.18, 0.1] }),
    ];
    const topW = widthAt(1);
    parts.push(surfPart("spire", transform(cone(topW * 0.12, p.floorH * 0.9, 16, true), { translate: vec3(0, totalH + p.floorH * 0.16, 0) }), "metal", { color: [0.85, 0.64, 0.28], roughness: 0.25 }));
    return parts;
  },
};

function addPerimeterPoints(points, yaw, scaleAttr, w, y, count, s) {
  const h = w / 2;
  const n = Math.max(1, count);
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n * 2 - 1;
      if (side === 0) { points.push(vec3(k * h, y, h)); yaw.push(0); }
      if (side === 1) { points.push(vec3(h, y, -k * h)); yaw.push(Math.PI / 2); }
      if (side === 2) { points.push(vec3(-k * h, y, -h)); yaw.push(Math.PI); }
      if (side === 3) { points.push(vec3(-h, y, k * h)); yaw.push(-Math.PI / 2); }
      scaleAttr.push(s);
    }
  }
}

function addWallPoints(points, yaw, variant, scaleAttr, w, y, count, doorSide, t) {
  const h = w / 2;
  const n = Math.max(1, count);
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n * 1.45 - 0.725;
      const isDoor = t === 0 && side === doorSide && i === Math.floor(n / 2);
      if (side === 0) { points.push(vec3(k * h, y, h + 0.018)); yaw.push(0); }
      if (side === 1) { points.push(vec3(h + 0.018, y, -k * h)); yaw.push(Math.PI / 2); }
      if (side === 2) { points.push(vec3(-k * h, y, -h - 0.018)); yaw.push(Math.PI); }
      if (side === 3) { points.push(vec3(-h - 0.018, y, k * h)); yaw.push(-Math.PI / 2); }
      variant.push(isDoor ? 1 : 0);
      scaleAttr.push(0.8 + (1 - t) * 0.25);
    }
  }
}

// ---- procedural fern: Vercidium vertex-shader vegetation, CPU-side ----
// pitch/yaw -> direction, rachis bends as bentPitch = pitch + distance*bend,
// leaflets step out perpendicular, fronds fan around the center by golden angle.
const fernModel = {
  id: "fern",
  name: "程序化蕨类",
  schema: [
    { key: "fronds", label: "叶片数", min: 1, max: 18, step: 1, default: 9 },
    { key: "pitch", label: "基部倾角", min: 0.0, max: 1.2, step: 0.02, default: 0.42 },
    { key: "bend", label: "弯曲强度", min: 0.0, max: 3.0, step: 0.05, default: 1.3 },
    { key: "length", label: "叶长", min: 0.5, max: 2.0, step: 0.05, default: 1.15 },
    { key: "segments", label: "小叶段数", min: 4, max: 24, step: 1, default: 16 },
    { key: "leafletLen", label: "小叶长", min: 0.08, max: 0.4, step: 0.01, default: 0.24 },
    { key: "leafletAngle", label: "小叶后掠", min: 0.2, max: 1.4, step: 0.02, default: 0.72 },
    { key: "wind", label: "风摆幅度", min: 0.0, max: 1.2, step: 0.02, default: 0.0 },
    { key: "windPhase", label: "风相位", min: 0.0, max: 1.0, step: 0.01, default: 0.0 },
  ],
  build(p) {
    const mesh = fern({
      fronds: Math.round(p.fronds),
      pitch: p.pitch,
      bendStrength: p.bend,
      length: p.length,
      segments: Math.round(p.segments),
      leafletLength: p.leafletLen,
      leafletWidth: p.leafletLen * 0.23,
      leafletAngle: p.leafletAngle,
      windStrength: p.wind,
      windPhase: p.windPhase,
    });
    return [windSurfPart("fronds", mesh, "fabric", { color: [0.18, 0.42, 0.15], roughness: 0.7 }, "foliage")];
  },
};

// ---- procedural mushroom: cone/sphere cap + cylinder stem + spots ----
const mushroom = {
  id: "mushroom",
  name: "程序化蘑菇",
  schema: [
    { key: "capR", label: "伞盖半径", min: 0.4, max: 1.2, step: 0.02, default: 0.8 },
    { key: "capH", label: "伞盖高度", min: 0.2, max: 0.9, step: 0.02, default: 0.5 },
    { key: "stemR", label: "菌柄粗细", min: 0.1, max: 0.4, step: 0.01, default: 0.22 },
    { key: "stemH", label: "菌柄高度", min: 0.4, max: 1.6, step: 0.05, default: 0.9 },
    { key: "spots", label: "斑点数量", min: 0, max: 14, step: 1, default: 7 },
    { key: "seed", label: "斑点种子", min: 0, max: 40, step: 1, default: 3 },
  ],
  build(p) {
    const parts = [];
    const CAP = [0.75, 0.13, 0.1];
    const STEM = [0.92, 0.88, 0.78];
    const SPOT = [0.96, 0.95, 0.92];
    // stem
    parts.push(surfPart("stem", transform(cylinder(p.stemR, p.stemH, 20, true), { translate: vec3(0, p.stemH / 2, 0) }), "ceramic", { color: STEM }));
    // cap: a lathe (surface of revolution) of a half-dome profile. The bottom
    // edge has the full capR radius and the top tapers to a point; sweep's caps
    // close the underside as a FLAT disc, so the cap reads as an umbrella with
    // a hollow flat bottom instead of a full squashed sphere bulging downward.
    const capSegs = 18;
    const capProf = [];
    for (let i = 0; i <= capSegs; i++) {
      const t = i / capSegs;
      const r = Math.max(p.capR * 0.015, p.capR * Math.cos(t * Math.PI * 0.5));
      capProf.push([p.stemH + t * p.capH, r]);
    }
    const capPts = capProf.map((q) => vec3(0, q[0], 0));
    const cn = capProf.length;
    const capRadiusAt = (t) => {
      const f = t * (cn - 1);
      const i = Math.max(0, Math.min(cn - 2, Math.floor(f)));
      const k = f - i;
      return capProf[i][1] * (1 - k) + capProf[i + 1][1] * k;
    };
    const cap = sweep(polyline(capPts, false), { radius: 1, sides: 32, radiusAt: capRadiusAt, caps: true });
    parts.push(surfPart("cap", cap, "plastic", { color: CAP, roughness: 0.45 }));
    // spots placed deterministically around the cap dome
    const n = Math.round(p.spots);
    for (let i = 0; i < n; i++) {
      // simple seeded hash angle/height
      const h = ((i * 2654435761) ^ (p.seed * 40503)) >>> 0;
      const ang = (h % 360) / 360 * Math.PI * 2;
      const t = ((h >> 9) % 100) / 100; // 0..1 up the dome
      const phi = t * Math.PI * 0.42;
      const rr = p.capR * Math.sin(phi);
      const yy = p.stemH + p.capH * Math.cos(phi);
      const sx = Math.cos(ang) * rr;
      const sz = Math.sin(ang) * rr;
      parts.push(surfPart(`spot_${i}`, transform(scaleMesh(sphere(p.capR * 0.12, 10, 8), vec3(1, 0.4, 1)), { translate: vec3(sx, yy, sz) }), "ceramic", { color: SPOT }));
    }
    return parts;
  },
};

// ---- procedural gear: arrayed teeth (box) on a torus/cylinder hub ----
const gear = {
  id: "gear",
  name: "程序化齿轮",
  schema: [
    { key: "teeth", label: "齿数", min: 6, max: 28, step: 1, default: 14 },
    { key: "radius", label: "半径", min: 0.6, max: 1.4, step: 0.05, default: 1 },
    { key: "thick", label: "厚度", min: 0.1, max: 0.6, step: 0.02, default: 0.25 },
    { key: "toothLen", label: "齿长", min: 0.08, max: 0.35, step: 0.01, default: 0.18 },
    { key: "boreR", label: "轴孔半径", min: 0.1, max: 0.5, step: 0.02, default: 0.25 },
  ],
  build(p) {
    const parts = [];
    const teeth = Math.round(p.teeth);
    // disc body
    parts.push(surfPart("body", cylinder(p.radius, p.thick, Math.max(16, teeth * 2), true), "metal", { color: [0.55, 0.56, 0.58], roughness: 0.25 }));
    // hub
    parts.push(surfPart("hub", cylinder(p.boreR + 0.12, p.thick * 1.25, 20, true), "brushedMetal", { color: [0.45, 0.46, 0.5] }));
    // teeth around the rim
    for (let i = 0; i < teeth; i++) {
      const ang = (i / teeth) * Math.PI * 2;
      const cx = Math.cos(ang) * (p.radius + p.toothLen / 2);
      const cz = Math.sin(ang) * (p.radius + p.toothLen / 2);
      const tooth = transform(box(p.toothLen, p.thick, (Math.PI * 2 * p.radius) / teeth * 0.55), {
        rotate: vec3(0, -ang, 0),
        translate: vec3(cx, 0, cz),
      });
      parts.push(surfPart(`tooth_${i}`, tooth, "metal", { color: [0.55, 0.56, 0.58], roughness: 0.25 }));
    }
    return parts;
  },
};

// ---- procedural road: ribbon swept along a spline (ported from UE Quick Road PCG) ----
const road = {
  id: "road",
  name: "程序化道路",
  schema: [
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 27 },
    { key: "halfWidth", label: "路面半宽", min: 1, max: 6, step: 0.25, default: 3 },
    { key: "lanes", label: "车道数量", min: 2, max: 6, step: 2, default: 2 },
    { key: "curve", label: "弯曲程度", min: 0, max: 12, step: 0.5, default: 6 },
    { key: "length", label: "道路长度", min: 16, max: 80, step: 2, default: 42 },
    { key: "sample", label: "采样间距", min: 0.5, max: 4, step: 0.25, default: 1.5 },
    { key: "widthSub", label: "路宽细分", min: 1, max: 8, step: 1, default: 4 },
    { key: "shoulder", label: "路肩宽度", min: 0, max: 3, step: 0.1, default: 0.8 },
    { key: "curbH", label: "路缘高", min: 0, max: 0.5, step: 0.05, default: 0.2 },
    { key: "showLines", label: "道路标线", min: 0, max: 1, step: 1, default: 1 },
    { key: "guardrails", label: "双侧护栏", min: 0, max: 1, step: 1, default: 0 },
    { key: "vegetation", label: "路边植被", min: 0, max: 1, step: 1, default: 1 },
    { key: "roadsideWidth", label: "植被带宽", min: 1, max: 10, step: 0.25, default: 5 },
    { key: "vegSpacing", label: "植被间距", min: 2, max: 10, step: 0.25, default: 2.75 },
    { key: "vegDensity", label: "植被密度", min: 0, max: 1, step: 0.05, default: 0.95 },
    { key: "vegScale", label: "植被尺寸", min: 0.5, max: 2, step: 0.05, default: 1 },
    { key: "keepAway", label: "中部排除半径", min: 0, max: 12, step: 0.5, default: 3 },
  ],
  build(p) {
    const parts = [];
    const half = p.length / 2;
    const centerline = p.controlPoints?.length >= 2
      ? smoothCurve(polyline(p.controlPoints), 6)
      : bezier(
          vec3(0, 0, -half),
          vec3(p.curve, 0, -half / 3),
          vec3(-p.curve, 0, half / 3),
          vec3(0, 0, half),
          64,
        );
    const opts = {
      halfWidth: p.halfWidth,
      sampleDistance: p.sample,
      widthSubdivisions: Math.round(p.widthSub),
      adaptiveCurvature: true,
      curvatureThresholdDeg: 6,
      verticalOffset: 0.035,
    };
    if (p.shoulder > 0.001) {
      parts.push(surfPart("road_shoulders", roadRibbon(centerline, {
        ...opts,
        halfWidth: p.halfWidth + p.shoulder,
        verticalOffset: 0.018,
      }), "dirtRoad", { color: [0.31, 0.29, 0.24], roughness: 0.98 }));
    }
    parts.push(surfPart("road_surface", roadRibbon(centerline, opts), "ceramic", { color: [0.09, 0.09, 0.1], roughness: 0.92 }));
    if (p.curbH > 0.001) {
      parts.push(surfPart("curbs", roadCurbs(centerline, { ...opts, curbHeight: p.curbH, curbWidth: 0.3 }), "stone", { color: [0.62, 0.62, 0.64], roughness: 0.7 }));
    }
    if (p.showLines > 0.5) {
      parts.push(surfPart("center_line", roadCenterLine(centerline, { ...opts, lineWidth: 0.2 }), "ceramic", { color: [0.95, 0.82, 0.15] }));
      if (Math.round(p.lanes) > 2) {
        parts.push(surfPart("lane_lines", roadLaneLines(centerline, {
          ...opts,
          lanes: Math.round(p.lanes),
          skipCenter: true,
          dashLength: 2.5,
          gapLength: 3.5,
        }), "ceramic", { color: [0.92, 0.92, 0.9], roughness: 0.55 }));
      }
      parts.push(surfPart("edge_lines", roadEdgeLines(centerline, { ...opts, edgeInset: 0.22 }), "ceramic", { color: [0.94, 0.94, 0.9], roughness: 0.55 }));
    }
    if (p.guardrails > 0.5) {
      const lateral = p.halfWidth + p.shoulder + 0.15;
      parts.push(surfPart("guardrails", merge(
        roadGuardrail(centerline, { ...opts, side: -1, lateral }),
        roadGuardrail(centerline, { ...opts, side: 1, lateral }),
      ), "brushedMetal", { color: [0.58, 0.6, 0.62], roughness: 0.42 }));
    }
    if (p.vegetation > 0.5 && p.vegDensity > 0.001) {
      const seed = Math.round(p.seed);
      const placements = roadsidePlacements(centerline, {
        spacing: p.vegSpacing,
        offsetMin: p.halfWidth + p.shoulder + 0.8,
        offsetMax: p.halfWidth + p.shoulder + 0.8 + p.roadsideWidth,
        density: p.vegDensity,
        distanceJitter: p.vegSpacing * 0.32,
        scaleMin: p.vegScale * 0.7,
        scaleMax: p.vegScale * 1.25,
        seed,
        exclusionZones: p.keepAway > 0 ? [{ distance: curveLength(centerline) * 0.5, radius: p.keepAway }] : [],
      });
      const tree = conifer({ seed, height: 3.8, trunkRadius: 0.13, whorls: 7, perWhorl: 5, needleDensity: 3 });
      const bush = shrub({ seed: seed + 1, height: 1.15, stems: 4, spread: 0.28, leafDensity: 6, leafSize: 0.11 });
      const choose = mulberry32(seed ^ 0x9e3779b9);
      const woods = [];
      const leaves = [];
      for (const placement of placements) {
        const useTree = choose() < 0.42;
        const plant = useTree ? tree : bush;
        const plantScale = placement.scale * (useTree ? 1 : 0.9);
        const transformOptions = {
          translate: placement.position,
          rotate: vec3(0, placement.yaw, 0),
          scale: plantScale,
        };
        woods.push(transform(plant.wood, transformOptions));
        leaves.push(transform(plant.leaves, transformOptions));
      }
      parts.push(surfPart("roadside_wood", merge(...woods), "wood", { color: [0.28, 0.19, 0.11], roughness: 0.94 }));
      parts.push(windSurfPart("roadside_foliage", merge(...leaves), "fabric", { color: [0.18, 0.42, 0.13], roughness: 0.76 }, "foliage"));
    }
    const groundSize = Math.max(p.length * 1.3, (p.halfWidth + p.shoulder + p.roadsideWidth + 3) * 2);
    parts.push(surfPart("ground", transform(plane(groundSize, groundSize, 1, 1), { translate: vec3(0, -0.015, 0) }), "stone", { color: [0.2, 0.28, 0.16], roughness: 1 }));
    return parts;
  },
};

// ---- UE5 PCG-style brick wall: spline-resampled running bond with real bricks ----
const pcgBrickWall = {
  id: "pcg-brick-wall",
  name: "PCG 程序化砖墙",
  schema: [
    { key: "length", label: "墙体长度", min: 2, max: 12, step: 0.1, default: 6.4 },
    { key: "height", label: "墙体高度", min: 1, max: 6, step: 0.1, default: 3.3 },
    { key: "depth", label: "墙体厚度", min: 0.12, max: 0.8, step: 0.02, default: 0.36 },
    { key: "columns", label: "横向砖列", min: 4, max: 32, step: 1, default: 15 },
    { key: "rows", label: "竖向砖行", min: 4, max: 30, step: 1, default: 17 },
    { key: "curveDepth", label: "曲线偏移", min: -3, max: 3, step: 0.05, default: 0.48 },
    { key: "brickScale", label: "砖块占格", min: 0.5, max: 0.98, step: 0.01, default: 0.94 },
    { key: "mortar", label: "砂浆缝宽", min: 0, max: 0.08, step: 0.002, default: 0.01 },
    { key: "stagger", label: "错缝强度", min: 0, max: 1.2, step: 0.05, default: 1 },
    { key: "jitter", label: "砖块扰动", min: 0, max: 0.12, step: 0.005, default: 0.02 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 21 },
  ],
  build(p) {
    return buildPcgBrickWallParts({
      length: p.length,
      height: p.height,
      depth: p.depth,
      columns: Math.round(p.columns),
      rows: Math.round(p.rows),
      curveDepth: p.curveDepth,
      brickScale: p.brickScale,
      mortar: p.mortar,
      stagger: p.stagger,
      jitter: p.jitter,
      seed: Math.round(p.seed),
      controlPoints: p.controlPoints,
    });
  },
};

const pcgPalisadeWall = {
  id: "pcg-palisade-wall",
  name: "PCG 木栅城墙",
  schema: [
    { key: "length", label: "路径总长", min: 12, max: 64, step: 1, default: 30 },
    { key: "bend", label: "轮廓弯曲", min: -10, max: 10, step: 0.5, default: 4.5 },
    { key: "height", label: "木墙高度", min: 1.5, max: 6, step: 0.1, default: 3.2 },
    { key: "thickness", label: "木桩粗细", min: 0.25, max: 0.9, step: 0.02, default: 0.48 },
    { key: "segmentLength", label: "木桩间距", min: 0.3, max: 1.2, step: 0.02, default: 0.48 },
    { key: "enclosure", label: "闭合围墙(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "gateWidth", label: "城门宽度", min: 0, max: 8, step: 0.2, default: 3.2 },
    { key: "terrain", label: "地形起伏", min: 0, max: 2, step: 0.05, default: 0.35 },
    { key: "banners", label: "战旗数量", min: 0, max: 12, step: 1, default: 6 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 27 },
  ],
  build(p) {
    return buildPcgPalisadeWallParts({
      length: p.length,
      bend: p.bend,
      height: p.height,
      thickness: p.thickness,
      segmentLength: p.segmentLength,
      enclosure: Math.round(p.enclosure) === 1,
      gateWidth: p.gateWidth,
      terrain: p.terrain,
      banners: Math.round(p.banners),
      seed: Math.round(p.seed),
      controlPoints: p.controlPoints,
    });
  },
};

const splineStoneWall = {
  id: "spline-stone-wall",
  name: "样条石砌围墙",
  schema: [
    { key: "length", label: "路径总长", min: 6, max: 48, step: 1, default: 18 },
    { key: "bend", label: "样条弯曲", min: -10, max: 10, step: 0.5, default: 3.2 },
    { key: "height", label: "墙体高度", min: 1, max: 5, step: 0.1, default: 2.4 },
    { key: "thickness", label: "墙体厚度", min: 0.35, max: 1.5, step: 0.05, default: 0.72 },
    { key: "segmentLength", label: "样条段长", min: 0.35, max: 2, step: 0.05, default: 0.72 },
    { key: "enclosure", label: "闭合围墙(0/1)", min: 0, max: 1, step: 1, default: 0 },
    { key: "gateWidth", label: "缺口宽度", min: 0, max: 8, step: 0.2, default: 0 },
    { key: "terrain", label: "地形起伏", min: 0, max: 3, step: 0.05, default: 0.8 },
    { key: "detail", label: "砌石层数", min: 2, max: 9, step: 1, default: 5 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 41 },
  ],
  build(p) {
    return buildSplineStoneWallParts({
      length: p.length,
      bend: p.bend,
      height: p.height,
      thickness: p.thickness,
      segmentLength: p.segmentLength,
      enclosure: Math.round(p.enclosure) === 1,
      gateWidth: p.gateWidth,
      terrain: p.terrain,
      detail: Math.round(p.detail),
      seed: Math.round(p.seed),
      controlPoints: p.controlPoints,
    });
  },
};

// ---- complete residential community assembly grammar ----
const residentialCommunity = {
  id: "residential-community",
  name: "程序化完整小区",
  category: "城市与建筑",
  assetMeta: {
    description: "总装Grammar统一生成入口、围墙、环路、住宅楼、会所、停车、游乐、绿化与北侧高架高速。",
    tags: ["PCG", "小区", "总装Grammar", "住宅", "高速", "确定性"],
    capabilities: ["语义布局", "模块化围墙", "住宅楼阵列", "公共设施", "高架高速", "参数化重建"],
    materialClasses: ["混凝土", "玻璃", "金属", "植被", "沥青"],
  },
  schema: [
    { key: "siteWidth", label: "小区宽度", min: 84, max: 160, step: 2, default: 112 },
    { key: "siteDepth", label: "小区进深", min: 68, max: 124, step: 2, default: 84 },
    { key: "towerRows", label: "住宅排数", min: 1, max: 2, step: 1, default: 2 },
    { key: "towersPerRow", label: "每排楼栋数", min: 2, max: 5, step: 1, default: 4 },
    { key: "towerFloors", label: "住宅基准层数", min: 7, max: 28, step: 1, default: 15 },
    { key: "floorVariation", label: "楼层高度变化", min: 0, max: 8, step: 1, default: 3 },
    { key: "wallHeight", label: "围墙高度", min: 1.2, max: 3.5, step: 0.1, default: 2.1 },
    { key: "treeDensity", label: "绿化密度", min: 0, max: 1, step: 0.05, default: 0.72 },
    { key: "includeFreeway", label: "生成北侧高速(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "freewayElevation", label: "高速高架高度", min: 4.5, max: 14, step: 0.5, default: 8 },
    { key: "seed", label: "随机种子", min: 0, max: 100, step: 1, default: 37 },
  ],
  build(p) {
    return buildResidentialCommunityParts({
      ...p,
      seed: Math.round(p.seed),
      towerRows: Math.round(p.towerRows),
      towersPerRow: Math.round(p.towersPerRow),
      towerFloors: Math.round(p.towerFloors),
      floorVariation: Math.round(p.floorVariation),
      includeFreeway: Math.round(p.includeFreeway) === 1,
    });
  },
};

// ---- procedural freeway: dual carriageway + median barrier + guardrails ----
const freeway = {
  id: "freeway",
  name: "程序化高速",
  schema: [
    { key: "length", label: "路段长度", min: 20, max: 120, step: 2, default: 64 },
    { key: "bend", label: "弯曲幅度", min: 0, max: 20, step: 0.5, default: 9 },
    { key: "lanesPerSide", label: "单向车道数", min: 1, max: 5, step: 1, default: 3 },
    { key: "laneWidth", label: "车道宽", min: 2.5, max: 4.5, step: 0.1, default: 3.5 },
    { key: "medianWidth", label: "中央带宽", min: 0.6, max: 4, step: 0.1, default: 1.4 },
    { key: "elevation", label: "高架高度", min: 0, max: 12, step: 0.5, default: 0 },
    { key: "guardrails", label: "护栏(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "pillars", label: "桥墩(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "pillarSpacing", label: "桥墩间距", min: 6, max: 24, step: 1, default: 12 },
    { key: "deckThickness", label: "桥面厚度", min: 0.3, max: 1.5, step: 0.1, default: 0.6 },
    { key: "signGantry", label: "标志架(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "signSpacing", label: "标志架间距", min: 12, max: 80, step: 2, default: 36 },
    { key: "lightPoles", label: "路灯(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "lightSpacing", label: "路灯间距", min: 8, max: 48, step: 2, default: 18 },
    { key: "noiseBarrier", label: "隔音屏(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "barrierHeight", label: "隔音屏高度", min: 1.5, max: 4, step: 0.1, default: 2.6 },
    { key: "sample", label: "采样间距", min: 0.6, max: 3, step: 0.2, default: 1.2 },
  ],
  build(p) {
    return buildFreewayParts({
      length: p.length,
      bend: p.bend,
      lanesPerSide: Math.round(p.lanesPerSide),
      laneWidth: p.laneWidth,
      medianWidth: p.medianWidth,
      elevation: p.elevation,
      guardrails: Math.round(p.guardrails) === 1,
      pillars: Math.round(p.pillars) === 1,
      pillarSpacing: p.pillarSpacing,
      deckThickness: p.deckThickness,
      signGantry: Math.round(p.signGantry) === 1,
      signSpacing: p.signSpacing,
      lightPoles: Math.round(p.lightPoles) === 1,
      lightSpacing: p.lightSpacing,
      noiseBarrier: Math.round(p.noiseBarrier) === 1,
      barrierHeight: p.barrierHeight,
      sample: p.sample,
      controlPoints: p.controlPoints,
    });
  },
};

// ---- reference-inspired three-level urban interchange ----
const multilevelInterchange = {
  id: "multilevel-interchange",
  name: "参考视频复刻·多层立体交通",
  critiqueGoal: "three-level urban interchange with signalized crossroads, cloverleaf loops, directional ramps, lane markings, bridge piers, and traffic lights",
  schema: [
    { key: "span", label: "枢纽总跨度", min: 120, max: 260, step: 5, default: 190 },
    { key: "mainElevation", label: "顶层主线高度", min: 8, max: 18, step: 0.5, default: 11 },
    { key: "crossElevation", label: "中层跨线桥高度", min: 4, max: 10, step: 0.5, default: 6 },
    { key: "lanesPerSide", label: "主线单向车道数", min: 2, max: 5, step: 1, default: 4 },
    { key: "rampWidth", label: "匝道宽度", min: 3.2, max: 6, step: 0.1, default: 4.2 },
    { key: "loopRadius", label: "环形匝道半径", min: 20, max: 46, step: 1, default: 28 },
    { key: "trafficSignals", label: "红绿灯(0关/1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "streetLights", label: "道路照明(0关/1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "landscaping", label: "中央绿化带(0关/1开)", min: 0, max: 1, step: 1, default: 1 },
  ],
  build(p) {
    return buildMultilevelInterchangeParts({
      span: p.span,
      mainElevation: p.mainElevation,
      crossElevation: p.crossElevation,
      lanesPerSide: Math.round(p.lanesPerSide),
      rampWidth: p.rampWidth,
      loopRadius: p.loopRadius,
      trafficSignals: Math.round(p.trafficSignals) === 1,
      streetLights: Math.round(p.streetLights) === 1,
      landscaping: Math.round(p.landscaping) === 1,
    });
  },
};

// ---- procedural railway: ballast bed + sleepers + two steel rails ----
const railway = {
  id: "railway",
  name: "程序化铁路",
  schema: [
    { key: "length", label: "线路长度", min: 12, max: 100, step: 2, default: 40 },
    { key: "bend", label: "弯曲幅度", min: 0, max: 16, step: 0.5, default: 6 },
    { key: "gauge", label: "轨距", min: 0.6, max: 2, step: 0.005, default: 1.435 },
    { key: "sleeperSpacing", label: "轨枕间距", min: 0.4, max: 1.5, step: 0.05, default: 0.6 },
    { key: "concreteSleepers", label: "混凝土枕(0/1)", min: 0, max: 1, step: 1, default: 0 },
    { key: "sample", label: "采样间距", min: 0.4, max: 2, step: 0.1, default: 0.8 },
  ],
  build(p) {
    return buildRailwayParts({
      length: p.length,
      bend: p.bend,
      gauge: p.gauge,
      sleeperSpacing: p.sleeperSpacing,
      concreteSleepers: Math.round(p.concreteSleepers) === 1,
      sample: p.sample,
      controlPoints: p.controlPoints,
    });
  },
};

// ---- procedural elevated viaduct / overpass (CitySample FreewayBridge) ----
const viaduct = {
  id: "viaduct",
  name: "高架桥",
  schema: [
    { key: "length", label: "总长度", min: 40, max: 160, step: 4, default: 80 },
    { key: "halfWidth", label: "桥面半宽", min: 3, max: 10, step: 0.5, default: 6 },
    { key: "clearance", label: "净空高度", min: 4, max: 16, step: 0.5, default: 8 },
    { key: "rampFraction", label: "引桥占比", min: 0.05, max: 0.45, step: 0.01, default: 0.28 },
    { key: "pierSpacing", label: "桥墩间距", min: 6, max: 24, step: 1, default: 12 },
    { key: "pierRadius", label: "桥墩半径", min: 0.5, max: 1.6, step: 0.1, default: 0.9 },
    { key: "pierShape", label: "墩型(0圆1方)", min: 0, max: 1, step: 1, default: 0 },
    { key: "pierTaper", label: "墩身收分", min: 0.6, max: 1, step: 0.05, default: 1 },
    { key: "deckThickness", label: "梁体厚度", min: 0.4, max: 2, step: 0.1, default: 0.9 },
    { key: "barriers", label: "护栏(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "abutments", label: "桥台(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "sample", label: "采样间距", min: 0.6, max: 3, step: 0.2, default: 1.2 },
  ],
  build(p) {
    return buildViaductParts({
      length: p.length,
      halfWidth: p.halfWidth,
      clearance: p.clearance,
      rampFraction: p.rampFraction,
      pierSpacing: p.pierSpacing,
      pierRadius: p.pierRadius,
      pierShape: Math.round(p.pierShape) === 1 ? "square" : "round",
      pierTaper: p.pierTaper,
      deckThickness: p.deckThickness,
      barriers: Math.round(p.barriers) === 1,
      abutments: Math.round(p.abutments) === 1,
      sample: p.sample,
      controlPoints: p.controlPoints,
    });
  },
};

const suspensionBridge = {
  id: "suspension-bridge",
  name: "程序化悬索桥",
  critiqueGoal: "long wooden suspension bridge with repeated roofed towers, sagging deck, main cables and vertical hangers",
  schema: [
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 83 },
    { key: "spanLength", label: "桥梁总长", min: 24, max: 160, step: 2, default: 90 },
    { key: "towerCount", label: "桥塔数量", min: 2, max: 12, step: 1, default: 6 },
    { key: "bridgeWidth", label: "桥面宽度", min: 1.4, max: 8, step: 0.2, default: 3.8 },
    { key: "towerHeight", label: "桥塔高度", min: 2.4, max: 12, step: 0.2, default: 5.2 },
    { key: "valleyDepth", label: "整体下垂", min: 0, max: 18, step: 0.5, default: 5.5 },
    { key: "pathBend", label: "水平弯曲", min: 0, max: 24, step: 0.5, default: 3.2 },
    { key: "towerJitter", label: "桥塔高差", min: 0, max: 2.5, step: 0.05, default: 0.35 },
    { key: "deckSag", label: "分跨桥面下垂", min: 0, max: 0.09, step: 0.002, default: 0.024 },
    { key: "cableSag", label: "主索下垂", min: 0.02, max: 0.28, step: 0.005, default: 0.11 },
    { key: "plankSpacing", label: "木板间距", min: 0.28, max: 1.4, step: 0.02, default: 0.58 },
    { key: "hangerSpacing", label: "吊索间距", min: 0.8, max: 5, step: 0.1, default: 2.1 },
  ],
  build(params) {
    return buildSuspensionBridgeParts({
      ...params,
      seed: Math.round(params.seed),
      towerCount: Math.round(params.towerCount),
    });
  },
};

// ---- procedural lattice transmission pylon ----
const pylon = {
  id: "pylon",
  name: "高压输电塔",
  schema: [
    { key: "height", label: "塔高", min: 12, max: 48, step: 2, default: 24 },
    { key: "baseWidth", label: "底部半宽", min: 1.5, max: 5, step: 0.25, default: 3 },
    { key: "topWidth", label: "顶部半宽", min: 0.5, max: 2.5, step: 0.1, default: 1.1 },
    { key: "levels", label: "格构层数", min: 3, max: 12, step: 1, default: 6 },
    { key: "crossArms", label: "横担数", min: 1, max: 5, step: 1, default: 3 },
    { key: "armSpan", label: "横担半跨", min: 2, max: 8, step: 0.5, default: 4.5 },
    { key: "strut", label: "杆件粗细", min: 0.08, max: 0.4, step: 0.02, default: 0.18 },
  ],
  build(p) {
    return buildPylonParts({
      height: p.height,
      baseWidth: p.baseWidth,
      topWidth: p.topWidth,
      levels: Math.round(p.levels),
      crossArms: Math.round(p.crossArms),
      armSpan: p.armSpan,
      strut: p.strut,
    });
  },
};

// ---- procedural construction tower crane ----
const towerCrane = {
  id: "tower-crane",
  name: "塔式起重机",
  schema: [
    { key: "mastHeight", label: "塔身高", min: 15, max: 60, step: 2, default: 30 },
    { key: "mastWidth", label: "塔身半宽", min: 0.5, max: 1.6, step: 0.1, default: 0.9 },
    { key: "jibLength", label: "起重臂长", min: 10, max: 40, step: 1, default: 22 },
    { key: "counterJibLength", label: "平衡臂长", min: 4, max: 16, step: 1, default: 8 },
    { key: "trolley", label: "小车位置", min: 0.1, max: 1, step: 0.05, default: 0.7 },
    { key: "hookDrop", label: "吊钩下垂", min: 2, max: 25, step: 1, default: 12 },
    { key: "strut", label: "杆件粗细", min: 0.08, max: 0.3, step: 0.02, default: 0.16 },
  ],
  build(p) {
    return buildTowerCraneParts({
      mastHeight: p.mastHeight,
      mastWidth: p.mastWidth,
      jibLength: p.jibLength,
      counterJibLength: p.counterJibLength,
      trolley: p.trolley,
      hookDrop: p.hookDrop,
      strut: p.strut,
    });
  },
};

// ---- procedural horizontal-axis wind turbine ----
const windTurbine = {
  id: "wind-turbine",
  name: "风力发电机",
  schema: [
    { key: "towerHeight", label: "塔高", min: 15, max: 50, step: 2, default: 28 },
    { key: "towerRadius", label: "塔底半径", min: 0.6, max: 2, step: 0.1, default: 1.1 },
    { key: "blades", label: "叶片数", min: 2, max: 5, step: 1, default: 3 },
    { key: "bladeLength", label: "叶片长度", min: 8, max: 28, step: 1, default: 16 },
    { key: "bladeChord", label: "叶根弦长", min: 0.6, max: 2.5, step: 0.1, default: 1.4 },
    { key: "tipChordRatio", label: "叶尖收窄", min: 0.15, max: 0.8, step: 0.05, default: 0.32 },
    { key: "bladeTwist", label: "气动扭转", min: 0, max: 1.2, step: 0.05, default: 0.55 },
    { key: "airfoilThickness", label: "翼型厚度", min: 0.08, max: 0.28, step: 0.02, default: 0.16 },
    { key: "rotorPhase", label: "转子相位", min: 0, max: 6.28, step: 0.1, default: 0 },
  ],
  build(p) {
    return buildWindTurbineParts({
      towerHeight: p.towerHeight,
      towerRadius: p.towerRadius,
      blades: Math.round(p.blades),
      bladeLength: p.bladeLength,
      bladeChord: p.bladeChord,
      tipChordRatio: p.tipChordRatio,
      bladeTwist: p.bladeTwist,
      airfoilThickness: p.airfoilThickness,
      rotorPhase: p.rotorPhase,
    });
  },
};

// ---- procedural highway toll plaza ----
const tollStation = {
  id: "toll-station",
  name: "高速收费站",
  schema: [
    { key: "lanes", label: "车道数", min: 2, max: 10, step: 1, default: 5 },
    { key: "laneWidth", label: "车道宽", min: 2.8, max: 4.5, step: 0.1, default: 3.5 },
    { key: "canopyDepth", label: "顶棚进深", min: 4, max: 16, step: 1, default: 8 },
    { key: "clearance", label: "净空高度", min: 4, max: 8, step: 0.5, default: 5.5 },
    { key: "booths", label: "收费亭(0/1)", min: 0, max: 1, step: 1, default: 1 },
  ],
  build(p) {
    return buildTollStationParts({
      lanes: Math.round(p.lanes),
      laneWidth: p.laneWidth,
      canopyDepth: p.canopyDepth,
      clearance: p.clearance,
      booths: Math.round(p.booths) === 1,
    });
  },
};

// ---- procedural highway tunnel portal ----
const tunnelPortal = {
  id: "tunnel-portal",
  name: "隧道洞口",
  schema: [
    { key: "openingHalfWidth", label: "洞口半宽", min: 3, max: 10, step: 0.5, default: 6 },
    { key: "wallHeight", label: "边墙高", min: 2, max: 7, step: 0.5, default: 4 },
    { key: "facadeDepth", label: "洞门厚度", min: 0.6, max: 2.5, step: 0.1, default: 1.2 },
    { key: "boreDepth", label: "洞身深度", min: 6, max: 30, step: 1, default: 14 },
    { key: "margin", label: "洞门边宽", min: 1, max: 5, step: 0.25, default: 2.5 },
  ],
  build(p) {
    return buildTunnelPortalParts({
      openingHalfWidth: p.openingHalfWidth,
      wallHeight: p.wallHeight,
      facadeDepth: p.facadeDepth,
      boreDepth: p.boreDepth,
      margin: p.margin,
    });
  },
};

// ---- procedural rooftop mechanical kit (CitySample Kit_roof_*) ----
const rooftopKit = {
  id: "rooftop-kit",
  name: "屋顶设备包",
  schema: [
    { key: "roofWidth", label: "屋面半宽", min: 5, max: 16, step: 0.5, default: 9 },
    { key: "roofDepth", label: "屋面半深", min: 4, max: 14, step: 0.5, default: 7 },
    { key: "hvacUnits", label: "空调机组数", min: 1, max: 6, step: 1, default: 3 },
    { key: "parapet", label: "女儿墙高", min: 0.3, max: 2, step: 0.1, default: 0.9 },
    { key: "waterTank", label: "水箱(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "accessHut", label: "楼梯间(0/1)", min: 0, max: 1, step: 1, default: 1 },
  ],
  build(p) {
    return buildRooftopKitParts({
      roofWidth: p.roofWidth,
      roofDepth: p.roofDepth,
      hvacUnits: Math.round(p.hvacUnits),
      parapet: p.parapet,
      waterTank: Math.round(p.waterTank) === 1,
      accessHut: Math.round(p.accessHut) === 1,
    });
  },
};

// ---- procedural tube-and-frame scaffolding (CitySample Kit_Scaffolding) ----
const scaffolding = {
  id: "scaffolding",
  name: "施工脚手架",
  schema: [
    { key: "bays", label: "跨数", min: 1, max: 8, step: 1, default: 4 },
    { key: "lifts", label: "层数", min: 1, max: 6, step: 1, default: 3 },
    { key: "bayWidth", label: "跨宽", min: 1.5, max: 3, step: 0.1, default: 2.4 },
    { key: "liftHeight", label: "层高", min: 1.6, max: 2.4, step: 0.1, default: 2.0 },
    { key: "depth", label: "进深", min: 0.8, max: 2, step: 0.1, default: 1.2 },
    { key: "tube", label: "钢管粗细", min: 0.03, max: 0.09, step: 0.01, default: 0.05 },
    { key: "planks", label: "脚手板(0/1)", min: 0, max: 1, step: 1, default: 1 },
  ],
  build(p) {
    return buildScaffoldingParts({
      bays: Math.round(p.bays),
      lifts: Math.round(p.lifts),
      bayWidth: p.bayWidth,
      liftHeight: p.liftHeight,
      depth: p.depth,
      tube: p.tube,
      planks: Math.round(p.planks) === 1,
    });
  },
};

// ---- procedural city bus shelter (CitySample Kit_BusStop) ----
const busStop = {
  id: "bus-stop",
  name: "公交候车亭",
  schema: [
    { key: "length", label: "亭长", min: 2.5, max: 7, step: 0.2, default: 4.2 },
    { key: "depth", label: "亭深", min: 1, max: 2.4, step: 0.1, default: 1.5 },
    { key: "height", label: "净空高", min: 2, max: 3, step: 0.1, default: 2.4 },
    { key: "bench", label: "座椅(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "adPanel", label: "广告灯箱(0/1)", min: 0, max: 1, step: 1, default: 1 },
  ],
  build(p) {
    return buildBusStopParts({
      length: p.length,
      depth: p.depth,
      height: p.height,
      bench: Math.round(p.bench) === 1,
      adPanel: Math.round(p.adPanel) === 1,
    });
  },
};

// ---- procedural parked bicycle (CitySample Kit_Bicycle_A) ----
const bicycle = {
  id: "bicycle",
  name: "自行车",
  schema: [
    { key: "wheelRadius", label: "车轮半径", min: 0.25, max: 0.4, step: 0.01, default: 0.34 },
    { key: "wheelbase", label: "轴距", min: 0.9, max: 1.2, step: 0.02, default: 1.02 },
    { key: "tyre", label: "轮胎粗细", min: 0.02, max: 0.06, step: 0.005, default: 0.035 },
    { key: "frameTube", label: "车架管径", min: 0.015, max: 0.035, step: 0.005, default: 0.022 },
    { key: "spokes", label: "辐条数", min: 6, max: 20, step: 1, default: 12 },
  ],
  build(p) {
    return buildBicycleParts({
      wheelRadius: p.wheelRadius,
      wheelbase: p.wheelbase,
      tyre: p.tyre,
      frameTube: p.frameTube,
      spokes: Math.round(p.spokes),
    });
  },
};

// ---- procedural roadside billboard (CitySample Kit_Billboard) ----
const billboard = {
  id: "billboard",
  name: "广告牌",
  schema: [
    { key: "panelWidth", label: "面板宽", min: 4, max: 20, step: 0.5, default: 12 },
    { key: "panelHeight", label: "面板高", min: 2, max: 9, step: 0.25, default: 5 },
    { key: "clearance", label: "离地高", min: 2, max: 12, step: 0.5, default: 6 },
    { key: "singleMast", label: "单立柱(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "truss", label: "桁架(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "lights", label: "投光灯(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "adTexture", label: "广告贴图", type: "image", accept: "image/png,image/jpeg,image/webp,image/avif", part: "ad_face", channel: "baseColor", default: "" },
  ],
  build(p) {
    return buildBillboardParts({
      panelWidth: p.panelWidth,
      panelHeight: p.panelHeight,
      clearance: p.clearance,
      singleMast: Math.round(p.singleMast) === 1,
      truss: Math.round(p.truss) === 1,
      lights: Math.round(p.lights) === 1,
      adTexture: p.adTexture,
    });
  },
};

// ---- procedural container yard + pallets (CitySample Kit_ShippingContainer/Kit_Pallet) ----
const containerYard = {
  id: "container-yard",
  name: "集装箱堆场",
  schema: [
    { key: "containers", label: "集装箱数", min: 1, max: 12, step: 1, default: 4 },
    { key: "stackHeight", label: "最大堆高", min: 1, max: 4, step: 1, default: 2 },
    { key: "pallets", label: "托盘数", min: 0, max: 8, step: 1, default: 3 },
    { key: "cargo", label: "堆料(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "seed", label: "随机种子", min: 0, max: 64, step: 1, default: 7 },
  ],
  build(p) {
    return buildContainerYardParts({
      containers: Math.round(p.containers),
      stackHeight: Math.round(p.stackHeight),
      pallets: Math.round(p.pallets),
      cargo: Math.round(p.cargo) === 1,
      seed: Math.round(p.seed),
    });
  },
};

// ---- procedural cast-iron manhole cover (CitySample Kit_ManholeCover) ----
const manholeCover = {
  id: "manhole-cover",
  name: "井盖",
  schema: [
    { key: "radius", label: "半径", min: 0.2, max: 0.5, step: 0.01, default: 0.32 },
    { key: "thickness", label: "厚度", min: 0.02, max: 0.08, step: 0.005, default: 0.04 },
    { key: "spokes", label: "花纹条数", min: 4, max: 24, step: 1, default: 12 },
    { key: "frame", label: "座圈(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "proud", label: "凸出(0/1)", min: 0, max: 1, step: 1, default: 1 },
  ],
  build(p) {
    return buildManholeCoverParts({
      radius: p.radius,
      thickness: p.thickness,
      spokes: Math.round(p.spokes),
      frame: Math.round(p.frame) === 1,
      proud: Math.round(p.proud) === 1,
    });
  },
};

// ---- procedural construction barrier run (CitySample Kit_Barricade/Kit_Fence) ----
const barrierRun = {
  id: "barrier-run",
  name: "施工围挡",
  schema: [
    { key: "style", label: "样式", type: "select", options: ["jersey", "aframe", "chainlink"], default: "jersey" },
    { key: "segments", label: "段数", min: 1, max: 12, step: 1, default: 5 },
    { key: "segLength", label: "段长", min: 1, max: 3, step: 0.1, default: 2.0 },
    { key: "height", label: "高度", min: 0.6, max: 2.4, step: 0.1, default: 1.0 },
  ],
  build(p) {
    return buildBarrierRunParts({
      style: p.style,
      segments: Math.round(p.segments),
      segLength: p.segLength,
      height: p.height,
    });
  },
};

// ---- procedural wall-mounted fire escape (CitySample Kit_Prop_FireEscape) ----
const fireEscape = {
  id: "fire-escape",
  name: "消防逃生梯",
  schema: [
    { key: "floors", label: "楼层数", min: 1, max: 8, step: 1, default: 4 },
    { key: "floorHeight", label: "层高", min: 2.6, max: 4, step: 0.1, default: 3.2 },
    { key: "platformDepth", label: "平台进深", min: 0.8, max: 2, step: 0.1, default: 1.2 },
    { key: "width", label: "宽度", min: 1.6, max: 4, step: 0.2, default: 2.6 },
    { key: "stairs", label: "楼梯(0/1)", min: 0, max: 1, step: 1, default: 1 },
  ],
  build(p) {
    return buildFireEscapeParts({
      floors: Math.round(p.floors),
      floorHeight: p.floorHeight,
      platformDepth: p.platformDepth,
      width: p.width,
      stairs: Math.round(p.stairs) === 1,
    });
  },
};

// ---- procedural sidewalk newsstand (CitySample Kit_NewsBooth/Kit_NewsDispenser) ----
const newsstand = {
  id: "newsstand",
  name: "报刊亭",
  schema: [
    { key: "width", label: "亭宽", min: 1.8, max: 4, step: 0.2, default: 2.6 },
    { key: "depth", label: "亭深", min: 1.2, max: 2.6, step: 0.1, default: 1.8 },
    { key: "height", label: "亭高", min: 2, max: 3, step: 0.1, default: 2.4 },
    { key: "awning", label: "遮阳棚(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "dispensers", label: "报箱数", min: 0, max: 5, step: 1, default: 2 },
  ],
  build(p) {
    return buildNewsstandParts({
      width: p.width,
      depth: p.depth,
      height: p.height,
      awning: Math.round(p.awning) === 1,
      dispensers: Math.round(p.dispensers),
    });
  },
};

// ---- CitySample cantilever traffic signal ----
const trafficSignal = {
  id: "traffic-signal",
  name: "交通信号灯",
  schema: [
    { key: "mastHeight", label: "立杆高", min: 4.5, max: 8, step: 0.1, default: 6.2 },
    { key: "armReach", label: "悬臂长", min: 3, max: 8, step: 0.2, default: 5.5 },
    { key: "heads", label: "信号头数", min: 1, max: 4, step: 1, default: 2 },
    { key: "pedestrian", label: "人行灯(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "streetSign", label: "路名牌(0/1)", min: 0, max: 1, step: 1, default: 1 },
  ],
  build(p) {
    return buildTrafficSignalParts({
      mastHeight: p.mastHeight,
      armReach: p.armReach,
      heads: Math.round(p.heads),
      pedestrian: Math.round(p.pedestrian) === 1,
      streetSign: Math.round(p.streetSign) === 1,
    });
  },
};

// ---- CitySample cafe umbrella + stone table set ----
const umbrellaTable = {
  id: "umbrella-table",
  name: "遮阳伞石桌",
  schema: [
    { key: "tableRadius", label: "桌半径", min: 0.35, max: 0.9, step: 0.05, default: 0.55 },
    { key: "umbrellaRadius", label: "伞半径", min: 1, max: 2.4, step: 0.1, default: 1.5 },
    { key: "stools", label: "凳子数", min: 0, max: 6, step: 1, default: 4 },
  ],
  build(p) {
    return buildUmbrellaTableParts({
      tableRadius: p.tableRadius,
      umbrellaRadius: p.umbrellaRadius,
      stools: Math.round(p.stools),
    });
  },
};

// ---- CitySample street tree with tree pit ----
const streetTree = {
  id: "street-tree",
  name: "行道树",
  schema: [
    { key: "trunkHeight", label: "树干高", min: 1.4, max: 3.5, step: 0.1, default: 2.2 },
    { key: "canopyRadius", label: "树冠半径", min: 1.2, max: 3.2, step: 0.1, default: 2.0 },
    { key: "clusters", label: "树冠密度", min: 3, max: 12, step: 1, default: 8 },
    { key: "pit", label: "树池格栅(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "seed", label: "随机种子", min: 1, max: 64, step: 1, default: 7 },
  ],
  build(p) {
    return buildStreetTreeParts({
      trunkHeight: p.trunkHeight,
      canopyRadius: p.canopyRadius,
      clusters: Math.round(p.clusters),
      pit: Math.round(p.pit) === 1,
      seed: Math.round(p.seed),
    });
  },
};

// ---- CitySample Kit_StreetLamp: cobra / ornamental street lamp ----
const streetLamp = {
  id: "street-lamp",
  name: "街灯",
  schema: [
    { key: "height", label: "灯杆高", min: 4, max: 9, step: 0.1, default: 6.5 },
    { key: "style", label: "样式", type: "select", options: ["cobra", "ornamental", "double"], default: "cobra" },
    { key: "armReach", label: "悬臂长", min: 1, max: 3.5, step: 0.1, default: 2.2 },
    { key: "base", label: "灯座(0/1)", min: 0, max: 1, step: 1, default: 1 },
  ],
  build(p) {
    return buildStreetLampParts({
      height: p.height,
      style: p.style,
      armReach: p.armReach,
      base: Math.round(p.base) === 1,
    });
  },
};

// ---- CitySample fire hydrant ----
const fireHydrant = {
  id: "fire-hydrant",
  name: "消防栓",
  schema: [
    { key: "height", label: "本体高", min: 0.5, max: 1.1, step: 0.05, default: 0.75 },
    { key: "radius", label: "本体半径", min: 0.08, max: 0.16, step: 0.01, default: 0.11 },
    { key: "outlets", label: "出水口数", min: 0, max: 2, step: 1, default: 2 },
  ],
  build(p) {
    return buildFireHydrantParts({
      height: p.height,
      radius: p.radius,
      outlets: Math.round(p.outlets),
    });
  },
};

// ---- CitySample Kit_bench_RR: slatted park bench ----
const parkBench = {
  id: "park-bench",
  name: "长椅",
  schema: [
    { key: "length", label: "椅长", min: 1.2, max: 3, step: 0.1, default: 1.8 },
    { key: "slats", label: "板条数", min: 3, max: 8, step: 1, default: 5 },
    { key: "backrest", label: "靠背(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "armrests", label: "扶手(0/1)", min: 0, max: 1, step: 1, default: 1 },
  ],
  build(p) {
    return buildParkBenchParts({
      length: p.length,
      slats: Math.round(p.slats),
      backrest: Math.round(p.backrest) === 1,
      armrests: Math.round(p.armrests) === 1,
    });
  },
};

// ---- CitySample Kit_Trashcan_A: perforated litter bin ----
const trashcan = {
  id: "trashcan",
  name: "垃圾桶",
  schema: [
    { key: "radius", label: "桶半径", min: 0.2, max: 0.4, step: 0.02, default: 0.28 },
    { key: "height", label: "桶高", min: 0.5, max: 1.1, step: 0.05, default: 0.8 },
    { key: "lid", label: "顶盖(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "frame", label: "支架(0/1)", min: 0, max: 1, step: 1, default: 1 },
  ],
  build(p) {
    return buildTrashcanParts({
      radius: p.radius,
      height: p.height,
      lid: Math.round(p.lid) === 1,
      frame: Math.round(p.frame) === 1,
    });
  },
};

// ---- CitySample Kit_Cone_C_A: traffic cone ----
const trafficCone = {
  id: "traffic-cone",
  name: "交通路锥",
  schema: [
    { key: "height", label: "锥高", min: 0.4, max: 1, step: 0.05, default: 0.7 },
    { key: "baseWidth", label: "底座半宽", min: 0.12, max: 0.28, step: 0.01, default: 0.18 },
    { key: "collars", label: "反光带数", min: 0, max: 3, step: 1, default: 2 },
  ],
  build(p) {
    return buildTrafficConeParts({
      height: p.height,
      baseWidth: p.baseWidth,
      collars: Math.round(p.collars),
    });
  },
};

// ---- CitySample freeway overhead sign gantry (Kit_FreewaySign) ----
const freewaySign = {
  id: "freeway-sign",
  name: "高速龙门牌",
  schema: [
    { key: "span", label: "跨度", min: 8, max: 20, step: 0.5, default: 12 },
    { key: "postHeight", label: "立柱高", min: 5, max: 8, step: 0.1, default: 6.2 },
    { key: "signCount", label: "牌面数", min: 1, max: 4, step: 1, default: 2 },
    { key: "signHeight", label: "牌面高", min: 1.4, max: 3, step: 0.1, default: 2.2 },
    { key: "truss", label: "桁架梁(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "lights", label: "照明灯(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "legend1", label: "牌面1路名", type: "select", options: ["MAIN ST", "5TH AVE", "HARBOR", "CENTRAL", "AIRPORT", "DOWNTOWN", "MARKET ST", "PORT"], default: "MAIN ST" },
    { key: "legend2", label: "牌面2路名", type: "select", options: ["5TH AVE", "MAIN ST", "HARBOR", "CENTRAL", "AIRPORT", "DOWNTOWN", "MARKET ST", "PORT"], default: "5TH AVE" },
    { key: "exit", label: "出口编号(0=无)", min: 0, max: 99, step: 1, default: 0 },
    { key: "seed", label: "随机种子", min: 0, max: 64, step: 1, default: 5 },
  ],
  build(p) {
    const legends = [p.legend1, p.legend2].slice(0, Math.round(p.signCount));
    return buildFreewaySignParts({
      span: p.span,
      postHeight: p.postHeight,
      signCount: Math.round(p.signCount),
      signHeight: p.signHeight,
      truss: Math.round(p.truss) === 1,
      lights: Math.round(p.lights) === 1,
      legends,
      exitNumber: Math.round(p.exit) > 0 ? String(Math.round(p.exit)) : "",
      seed: Math.round(p.seed),
    });
  },
};

// ---- CitySample construction material stack (Kit_Pallet/Lumber/Plywood/SandBag) ----
const materialStack = {
  id: "material-stack",
  name: "施工物料堆",
  schema: [
    { key: "pallets", label: "托盘数", min: 1, max: 6, step: 1, default: 3 },
    { key: "cargo", label: "货物", type: "select", options: ["mixed", "lumber", "plywood", "sandbag"], default: "mixed" },
    { key: "palletSize", label: "托盘尺寸", min: 0.9, max: 1.6, step: 0.1, default: 1.2 },
    { key: "stack", label: "堆高系数", min: 0.5, max: 2, step: 0.1, default: 1 },
    { key: "straps", label: "捆扎带(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "seed", label: "随机种子", min: 0, max: 64, step: 1, default: 11 },
  ],
  build(p) {
    return buildMaterialStackParts({
      pallets: Math.round(p.pallets),
      cargo: p.cargo,
      palletSize: p.palletSize,
      stack: p.stack,
      straps: Math.round(p.straps) === 1,
      seed: Math.round(p.seed),
    });
  },
};

// ---- CitySample rooftop wooden water tower (Kit_roof_tank) ----
const waterTower = {
  id: "water-tower",
  name: "屋顶木水塔",
  schema: [
    { key: "radius", label: "罐体半径", min: 1, max: 2.4, step: 0.1, default: 1.6 },
    { key: "tankHeight", label: "罐体高", min: 2, max: 4.5, step: 0.1, default: 3.2 },
    { key: "staves", label: "木条数", min: 12, max: 40, step: 1, default: 24 },
    { key: "hoops", label: "钢箍数", min: 2, max: 8, step: 1, default: 4 },
    { key: "legHeight", label: "支架高", min: 1.5, max: 4, step: 0.1, default: 2.4 },
    { key: "roofPitch", label: "锥顶坡度", min: 0.3, max: 0.9, step: 0.05, default: 0.55 },
    { key: "ladder", label: "爬梯(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "seed", label: "随机种子", min: 0, max: 64, step: 1, default: 9 },
  ],
  build(p) {
    return buildWaterTowerParts({
      radius: p.radius,
      tankHeight: p.tankHeight,
      staves: Math.round(p.staves),
      hoops: Math.round(p.hoops),
      legHeight: p.legHeight,
      roofPitch: p.roofPitch,
      ladder: Math.round(p.ladder) === 1,
      seed: Math.round(p.seed),
    });
  },
};

// ---- SideFX-style modular house: footprint -> slots -> module kit -> roofs ----
const sidefxModularHouse = {
  id: "sidefx-modular-house",
  name: "SideFX 模块化房屋",
  critiqueGoal: "Houdini-style procedural modular house with semantic facade slots",
  schema: [
    { key: "floors", label: "楼层数", min: 1, max: 4, step: 1, default: 2 },
    { key: "baysX", label: "横向开间", min: 3, max: 10, step: 1, default: 6 },
    { key: "baysZ", label: "纵向进深", min: 2, max: 6, step: 1, default: 3 },
    { key: "bayWidth", label: "开间宽度", min: 0.8, max: 1.8, step: 0.05, default: 1.1 },
    { key: "floorHeight", label: "层高", min: 0.9, max: 1.8, step: 0.05, default: 1.15 },
    { key: "layout", label: "平面布局(0矩形/1L形)", min: 0, max: 1, step: 1, default: 1 },
    { key: "wingBays", label: "侧翼开间", min: 1, max: 6, step: 1, default: 3 },
    { key: "wingDepthBays", label: "侧翼进深", min: 1, max: 5, step: 1, default: 3 },
    { key: "roofPitch", label: "屋顶坡度", min: 0.2, max: 1, step: 0.02, default: 0.72 },
    { key: "roofOverhang", label: "屋檐外挑", min: 0.08, max: 0.6, step: 0.02, default: 0.28 },
    { key: "balconyDensity", label: "阳台概率", min: 0, max: 1, step: 0.05, default: 0.18 },
    { key: "shutterDensity", label: "百叶窗概率", min: 0, max: 1, step: 0.05, default: 0.65 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 42 },
  ],
  build(p) {
    return buildSidefxModularHouseParts({
      floors: Math.round(p.floors),
      baysX: Math.round(p.baysX),
      baysZ: Math.round(p.baysZ),
      bayWidth: p.bayWidth,
      floorHeight: p.floorHeight,
      layout: Math.round(p.layout) === 0 ? "rectangle" : "lWing",
      wingBays: Math.round(p.wingBays),
      wingDepthBays: Math.round(p.wingDepthBays),
      roofPitch: p.roofPitch,
      roofOverhang: p.roofOverhang,
      balconyDensity: p.balconyDensity,
      shutterDensity: p.shutterDensity,
      seed: Math.round(p.seed),
    });
  },
};

// ---- Houdini Lake House: modular masses -> supports -> pier -> set dressing ----
const houdiniLakeHouse = {
  id: "houdini-lake-house",
  name: "Houdini 湖边小屋",
  category: "建筑",
  critiqueGoal: "Houdini-style weathered lake house with readable modular construction, pier and roof silhouette",
  scenePreset: {
    environment: "studio",
    background: { mode: "gradient", color: "#8ba4a0", color2: "#cad3c6" },
    exposure: 1.02,
    bloom: { enabled: true, strength: 0.2, radius: 0.35, threshold: 0.82 },
    fog: { enabled: false },
    camera: "persp",
    grid: false,
    renderMode: "pbr",
  },
  assetMeta: {
    description: "依据 Houdini 17.5 Lake_House_Modeling.hip 的节点网络与模块分类独立重写：2×3×2 模块网格、木构立面、屋顶装饰、支撑、外楼梯、石码头与概率塔楼。",
    tags: ["Houdini复刻", "湖边小屋", "模块化建筑", "码头", "程序化建模"],
    capabilities: ["种子复现", "楼层与开间", "屋顶概率装饰", "塔楼概率", "栈桥长度", "水位结构"],
    materialClasses: ["风化木材", "石材", "木瓦", "玻璃", "水体", "金属"],
    sourceStudy: "Lake_House_Modeling.hip · bank_house_v03 · Houdini 17.5 · BV1i44y1F7gu",
  },
  schema: [
    { key: "floors", label: "楼层数", min: 1, max: 3, step: 1, default: 2 },
    { key: "baysX", label: "横向开间", min: 3, max: 7, step: 1, default: 4 },
    { key: "baysZ", label: "纵向进深", min: 2, max: 5, step: 1, default: 3 },
    { key: "bayWidth", label: "模块宽度", min: 1.4, max: 2.8, step: 0.1, default: 2 },
    { key: "floorHeight", label: "模块层高", min: 2.4, max: 3.8, step: 0.1, default: 3 },
    { key: "roofPitch", label: "屋顶坡度", min: 0.35, max: 1.15, step: 0.05, default: 0.72 },
    { key: "roofWindowProbability", label: "老虎窗概率", min: 0, max: 1, step: 0.05, default: 0.6 },
    { key: "chimneyProbability", label: "烟囱概率", min: 0, max: 1, step: 0.05, default: 0.1 },
    { key: "towerProbability", label: "塔楼概率", min: 0, max: 1, step: 0.05, default: 0.6 },
    { key: "walkwayLength", label: "栈桥长度", min: 2.5, max: 10, step: 0.25, default: 5.5 },
    { key: "pierHeight", label: "高脚平台离水高度", min: 0.8, max: 2.8, step: 0.1, default: 1.9 },
    { key: "lakeSize", label: "湖面范围", min: 14, max: 36, step: 1, default: 16 },
    { key: "weathering", label: "风化程度", min: 0, max: 1, step: 0.05, default: 0.45 },
    { key: "seed", label: "全局种子", min: 0, max: 10000, step: 1, default: 2983 },
  ],
  build(p) {
    return buildHoudiniLakeHouseParts({
      ...p,
      floors: Math.round(p.floors),
      baysX: Math.round(p.baysX),
      baysZ: Math.round(p.baysZ),
      seed: Math.round(p.seed),
    });
  },
};

// ---- SideFX Solaris Market inspired scene: USD-style asset variants + layout ----
const sidefxSolarisMarket = {
  id: "sidefx-solaris-market",
  name: "SideFX Solaris 市集",
  critiqueGoal: "Solaris-style market scene with stalls, shelves, instanced jars and background context",
  schema: [
    { key: "stalls", label: "摊位数量", min: 1, max: 4, step: 1, default: 2 },
    { key: "shelfRows", label: "货架层数", min: 1, max: 5, step: 1, default: 3 },
    { key: "jarsPerShelf", label: "每层罐数", min: 2, max: 18, step: 1, default: 10 },
    { key: "propDensity", label: "道具密度", min: 0, max: 1, step: 0.05, default: 0.82 },
    { key: "backgroundBuildings", label: "背景建筑", min: 0, max: 5, step: 1, default: 3 },
    { key: "sandRelief", label: "沙地起伏", min: 0, max: 0.8, step: 0.02, default: 0.28 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 205 },
  ],
  build(p) {
    return buildSolarisMarketParts({
      stalls: Math.round(p.stalls),
      shelfRows: Math.round(p.shelfRows),
      jarsPerShelf: Math.round(p.jarsPerShelf),
      propDensity: p.propDensity,
      backgroundBuildings: Math.round(p.backgroundBuildings),
      sandRelief: p.sandRelief,
      seed: Math.round(p.seed),
    });
  },
};

// ---- SideFX procedural cactus-inspired organic plant ----
const proceduralCactus = {
  id: "procedural-cactus",
  name: "程序化仙人掌",
  schema: [
    { key: "height", label: "主干高度", min: 1.5, max: 8, step: 0.1, default: 4.8 },
    { key: "radius", label: "主干半径", min: 0.18, max: 0.9, step: 0.02, default: 0.42 },
    { key: "ribs", label: "纵向棱数", min: 5, max: 22, step: 1, default: 12 },
    { key: "ribDepth", label: "棱槽深度", min: 0, max: 0.45, step: 0.01, default: 0.18 },
    { key: "armCount", label: "分枝数量", min: 0, max: 10, step: 1, default: 5 },
    { key: "armLength", label: "分枝外伸", min: 0.3, max: 3, step: 0.05, default: 1.45 },
    { key: "armLift", label: "分枝上扬", min: 0.3, max: 3, step: 0.05, default: 1.55 },
    { key: "bend", label: "整体弯曲", min: 0, max: 0.45, step: 0.01, default: 0.18 },
    { key: "spinesPerRib", label: "刺密度", min: 0, max: 18, step: 1, default: 9 },
    { key: "flowerCount", label: "花朵数量", min: 0, max: 12, step: 1, default: 5 },
    { key: "baseRadius", label: "沙地半径", min: 0, max: 3, step: 0.05, default: 1.5 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 19 },
  ],
  build(p) {
    return buildProceduralCactusParts({
      height: p.height,
      radius: p.radius,
      ribs: Math.round(p.ribs),
      ribDepth: p.ribDepth,
      armCount: Math.round(p.armCount),
      armLength: p.armLength,
      armLift: p.armLift,
      bend: p.bend,
      spinesPerRib: Math.round(p.spinesPerRib),
      flowerCount: Math.round(p.flowerCount),
      baseRadius: p.baseRadius,
      seed: Math.round(p.seed),
    });
  },
};

// ---- SideFX Procedural SILO-inspired cutaway megashaft ----
const proceduralSilo = {
  id: "procedural-silo",
  name: "程序化筒仓",
  schema: [
    { key: "radius", label: "筒仓半径", min: 2.5, max: 9, step: 0.1, default: 5.2 },
    { key: "height", label: "总高度", min: 10, max: 40, step: 0.5, default: 22 },
    { key: "levels", label: "楼层数", min: 4, max: 26, step: 1, default: 14 },
    { key: "modulesPerLevel", label: "每层模块", min: 6, max: 28, step: 1, default: 14 },
    { key: "balconyDepth", label: "环廊深度", min: 0.5, max: 2.5, step: 0.05, default: 1.15 },
    { key: "cutawayAngle", label: "剖切开口", min: 0.2, max: 3.6, step: 0.05, default: 1.45 },
    { key: "stairTurns", label: "楼梯圈数", min: 1, max: 9, step: 0.1, default: 4.2 },
    { key: "servicePipes", label: "管线数", min: 0, max: 18, step: 1, default: 8 },
    { key: "moduleDensity", label: "模块密度", min: 0.2, max: 1, step: 0.02, default: 0.78 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 41 },
  ],
  build(p) {
    return buildProceduralSiloParts({
      radius: p.radius,
      height: p.height,
      levels: Math.round(p.levels),
      modulesPerLevel: Math.round(p.modulesPerLevel),
      balconyDepth: p.balconyDepth,
      cutawayAngle: p.cutawayAngle,
      stairTurns: p.stairTurns,
      servicePipes: Math.round(p.servicePipes),
      moduleDensity: p.moduleDensity,
      seed: Math.round(p.seed),
    });
  },
};

// ---- WFC-tiled building rooftop (CitySample WFC_Rooftop) ----
const wfcRooftop = {
  id: "wfc-rooftop",
  name: "WFC屋顶",
  schema: [
    { key: "cols", label: "网格列", min: 2, max: 12, step: 1, default: 6 },
    { key: "rows", label: "网格行", min: 2, max: 12, step: 1, default: 5 },
    { key: "cell", label: "格尺寸", min: 1.6, max: 3.2, step: 0.1, default: 2.4 },
    { key: "parapet", label: "女儿墙高", min: 0.4, max: 1.6, step: 0.1, default: 0.9 },
    { key: "equipmentDensity", label: "设备密度", min: 0, max: 1, step: 0.05, default: 0.35 },
    { key: "seed", label: "随机种子", min: 1, max: 64, step: 1, default: 11 },
  ],
  build(p) {
    return buildWfcRooftopParts({
      cols: Math.round(p.cols),
      rows: Math.round(p.rows),
      cell: p.cell,
      parapet: p.parapet,
      equipmentDensity: p.equipmentDensity,
      seed: Math.round(p.seed),
    });
  },
};

// ---- continuous arbitrary-angle road intersection kit ----
const intersection = {
  id: "intersection",
  name: "任意角路口",
  schema: [
    { key: "layout", label: "路口类型(0十字/1斜十字/2Y字/3斜T/4五岔)", min: 0, max: 4, step: 1, default: 1 },
    { key: "branchAngle", label: "斜交夹角", min: 25, max: 155, step: 1, default: 55 },
    { key: "roadHalfWidth", label: "路面半宽", min: 3, max: 8, step: 0.5, default: 5 },
    { key: "armLength", label: "路臂长", min: 5, max: 18, step: 1, default: 10 },
    { key: "lanes", label: "单向车道", min: 1, max: 4, step: 1, default: 2 },
    { key: "crosswalks", label: "斑马线(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "sidewalks", label: "人行道(0/1)", min: 0, max: 1, step: 1, default: 1 },
  ],
  build(p) {
    const layout = Math.round(p.layout);
    const angle = p.branchAngle;
    const layouts = [
      [0, 90, 180, 270],
      [0, angle, 180, 180 + angle],
      [90, 210, 330],
      [0, angle, 180],
      [0, 55, 130, 205, 285],
    ];
    return buildIntersectionParts({
      roadHalfWidth: p.roadHalfWidth,
      armLength: p.armLength,
      lanes: Math.round(p.lanes),
      crosswalks: Math.round(p.crosswalks) === 1,
      sidewalks: Math.round(p.sidewalks) === 1,
      branches: layouts[layout].map((angleDegrees) => ({ angleDegrees })),
    });
  },
};

// ---- reference-image inspired red 90s T-top sports car ----
const sportsCar = {
  id: "sports-car",
  name: "红色T-top跑车",
  schema: [
    { key: "length", label: "车长", min: 4.8, max: 6.4, step: 0.05, default: 5.8 },
    { key: "width", label: "车宽", min: 1.75, max: 2.35, step: 0.02, default: 2.08 },
    { key: "height", label: "车高", min: 1.05, max: 1.55, step: 0.02, default: 1.28 },
    { key: "wheelRadius", label: "轮胎半径", min: 0.25, max: 0.46, step: 0.01, default: 0.34 },
    { key: "rideHeight", label: "离地高度", min: -0.05, max: 0.18, step: 0.01, default: 0.04 },
    { key: "spoiler", label: "尾翼高度", min: 0.2, max: 1.3, step: 0.02, default: 0.75 },
    { key: "roofGlass", label: "黑顶强度", min: 0.3, max: 1, step: 0.02, default: 1 },
  ],
  build(p) {
    return buildSportsCarParts(p);
  },
};

// ---- reference-inspired 2023 GMC Canyon AT4X pickup ----
const gmcCanyonAt4x = {
  id: "gmc-canyon-at4x",
  name: "GMC Canyon AT4X 皮卡",
  schema: [
    { key: "length", label: "车长", min: 5.1, max: 6.5, step: 0.05, default: 5.85 },
    { key: "width", label: "车宽", min: 1.9, max: 2.55, step: 0.02, default: 2.18 },
    { key: "height", label: "车高", min: 1.65, max: 2.35, step: 0.02, default: 1.92 },
    { key: "wheelRadius", label: "轮胎半径", min: 0.34, max: 0.62, step: 0.01, default: 0.47 },
    { key: "rideHeight", label: "离地高度", min: 0, max: 0.22, step: 0.01, default: 0.08 },
    { key: "bedLength", label: "货箱长度", min: 1.0, max: 1.9, step: 0.02, default: 1.48 },
    { key: "armor", label: "越野护杠(0关1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "tireTread", label: "胎纹强度", min: 0.4, max: 1.7, step: 0.05, default: 1 },
    { key: "suspensionLift", label: "悬挂升高", min: 0, max: 0.24, step: 0.01, default: 0.08 },
  ],
  build(p) {
    return buildGmcCanyonAt4xParts(p);
  },
};

// ---- reference-inspired 1963-1965 Buick Riviera personal luxury coupe ----
const buickRiviera1965 = {
  id: "buick-riviera-1965",
  name: "Buick Riviera 1963-1965",
  schema: [
    { key: "length", label: "车长", min: 4.9, max: 5.7, step: 0.05, default: 5.3 },
    { key: "width", label: "车宽", min: 1.75, max: 2.2, step: 0.02, default: 1.95 },
    { key: "height", label: "车高", min: 1.15, max: 1.55, step: 0.02, default: 1.35 },
    { key: "wheelRadius", label: "轮胎半径", min: 0.28, max: 0.45, step: 0.01, default: 0.33 },
    { key: "rideHeight", label: "离地高度", min: -0.02, max: 0.16, step: 0.01, default: 0.055 },
    { key: "hoodLength", label: "长车头", min: 1.55, max: 2.35, step: 0.03, default: 2.05 },
    { key: "deckLength", label: "短尾箱", min: 0.95, max: 1.65, step: 0.03, default: 1.33 },
    { key: "chrome", label: "镀铬装饰(0关1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "hiddenHeadlights", label: "隐藏头灯(0开1闭)", min: 0, max: 1, step: 0.05, default: 1 },
  ],
  build(p) {
    return buildBuickRiviera1965Parts(p);
  },
};

const proceduralVehicleVariants = Object.fromEntries(PROCEDURAL_VEHICLE_VARIANTS.map((definition) => [
  definition.id,
  {
    id: definition.id,
    name: definition.name,
    category: "载具",
    assetMeta: {
      description: definition.description,
      tags: [...definition.tags],
      capabilities: ["车身截面放样", "玻璃切面内缩", "尺寸联动", "确定性生成"],
    },
    schema: [
      { key: "length", label: "车长", min: definition.params.length * 0.82, max: definition.params.length * 1.22, step: 0.05, default: definition.params.length },
      { key: "width", label: "车宽", min: definition.params.width * 0.86, max: definition.params.width * 1.16, step: 0.02, default: definition.params.width },
      { key: "height", label: "车高", min: definition.params.height * 0.82, max: definition.params.height * 1.2, step: 0.02, default: definition.params.height },
      { key: "wheelBase", label: "轴距", min: definition.params.wheelBase * 0.84, max: definition.params.wheelBase * 1.16, step: 0.03, default: definition.params.wheelBase },
      { key: "wheelRadius", label: "轮胎半径", min: definition.params.wheelRadius * 0.78, max: definition.params.wheelRadius * 1.24, step: 0.01, default: definition.params.wheelRadius },
      { key: "rideHeight", label: "离地高度", min: 0.04, max: Math.max(0.3, definition.params.rideHeight * 1.8), step: 0.01, default: definition.params.rideHeight },
      { key: "roofRoundness", label: "车顶横向弧度", min: 0, max: 1, step: 0.02, default: definition.params.roofRoundness },
      { key: "hoodSlope", label: "车头过渡", min: 0, max: 1, step: 0.02, default: definition.params.hoodSlope },
      { key: "seed", label: "细节种子", min: 0, max: 999, step: 1, default: definition.params.seed },
    ],
    build(p) {
      return buildProceduralVehicleVariant(definition.id, p);
    },
  },
]));

const proceduralVehicle = {
  id: "procedural-vehicle",
  name: "通用程序化载具",
  category: "载具",
  assetMeta: {
    description: "基于车身截面放样与语义部件装配的通用程序化载具生成器。",
    tags: ["载具", "Houdini 思路", "程序化建模", "车型生成器"],
    capabilities: ["五类车型", "低冠双曲率车顶", "玻璃切面内嵌", "确定性生成"],
  },
  schema: [
    { key: "style", label: "车型", type: "select", options: ["轿车", "SUV", "皮卡", "厢式车", "巴士"], default: "SUV" },
    { key: "length", label: "车长", min: 3.6, max: 10, step: 0.05, default: 4.8 },
    { key: "width", label: "车宽", min: 1.5, max: 2.7, step: 0.02, default: 1.92 },
    { key: "height", label: "车高", min: 1.2, max: 3.4, step: 0.02, default: 1.68 },
    { key: "wheelBase", label: "轴距", min: 2, max: 6.8, step: 0.03, default: 2.82 },
    { key: "wheelRadius", label: "轮胎半径", min: 0.26, max: 0.62, step: 0.01, default: 0.36 },
    { key: "wheelWidth", label: "轮胎宽度", min: 0.16, max: 0.38, step: 0.01, default: 0.24 },
    { key: "rideHeight", label: "离地高度", min: 0.05, max: 0.36, step: 0.01, default: 0.16 },
    { key: "cabinPosition", label: "驾驶舱前后", min: -1, max: 1, step: 0.02, default: 0 },
    { key: "roofRoundness", label: "车顶横向弧度", min: 0, max: 1, step: 0.02, default: 0.34 },
    { key: "hoodSlope", label: "车头过渡", min: 0, max: 1, step: 0.02, default: 0.52 },
    { key: "detail", label: "细节(0关1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "seed", label: "细节种子", min: 0, max: 999, step: 1, default: 17 },
  ],
  build(p) {
    const styleMap = { "轿车": "sedan", SUV: "suv", "皮卡": "pickup", "厢式车": "van", "巴士": "bus" };
    return buildProceduralVehicleParts({
      ...p,
      style: styleMap[p.style] ?? "suv",
    });
  },
};

const modularRescueRover = {
  id: "modular-rescue-rover",
  name: "模块化远征救援车",
  category: "载具",
  assetMeta: {
    description: "高扭矩动力、多人驾驶舱、救援指挥后舱组成的确定性模块化远征车。",
    tags: ["救援载具", "语义装配", "程序化建模", "功能元数据"],
    capabilities: ["稳定模块 ID", "无人机起降位", "医疗装备锚点", "参数化车身"],
  },
  schema: [
    { key: "length", label: "车长", min: 4.8, max: 6.6, step: 0.05, default: 5.4 },
    { key: "width", label: "车宽", min: 1.85, max: 2.5, step: 0.02, default: 2.08 },
    { key: "height", label: "车高", min: 1.65, max: 2.5, step: 0.02, default: 1.92 },
    { key: "wheelBase", label: "轴距", min: 2.7, max: 4.2, step: 0.03, default: 3.25 },
    { key: "wheelRadius", label: "越野轮半径", min: 0.36, max: 0.58, step: 0.01, default: 0.44 },
    { key: "rideHeight", label: "离地高度", min: 0.16, max: 0.42, step: 0.01, default: 0.25 },
    { key: "seed", label: "细节种子", min: 0, max: 999, step: 1, default: 73 },
  ],
  build(params) {
    return buildModularRescueRoverParts(params);
  },
};

// ---- reference-inspired midnight black horse: procedural approximation ----
const midnightHorse = {
  id: "midnight-horse",
  name: "午夜黑马",
  schema: [
    { key: "scale", label: "整体缩放", min: 0.7, max: 1.4, step: 0.02, default: 1 },
    { key: "bodyLength", label: "躯干长度", min: 3.0, max: 4.4, step: 0.05, default: 3.6 },
    { key: "bodyWidth", label: "躯干宽度", min: 0.75, max: 1.25, step: 0.02, default: 1 },
    { key: "legLength", label: "腿长", min: 0.9, max: 1.55, step: 0.02, default: 1.22 },
    { key: "neckArch", label: "颈部弧度", min: 0.75, max: 1.35, step: 0.02, default: 1 },
    { key: "maneLength", label: "鬃毛长度", min: 0.15, max: 0.8, step: 0.02, default: 0.42 },
    { key: "tailLength", label: "尾巴长度", min: 0.65, max: 1.45, step: 0.02, default: 1 },
    { key: "stride", label: "站姿步幅", min: -0.35, max: 0.35, step: 0.01, default: 0.12 },
  ],
  build(p) {
    return buildMidnightHorseParts(p);
  },
};

// ---- reference-inspired yellow dog: quadruped dog preset ----
const referenceDog = {
  id: "reference-dog",
  name: "参考黄犬",
  schema: [
    { key: "scale", label: "整体缩放", min: 0.7, max: 1.4, step: 0.02, default: 1 },
    { key: "bodyLength", label: "躯干长度", min: 2.3, max: 3.6, step: 0.05, default: 2.95 },
    { key: "bodyWidth", label: "躯干宽度", min: 0.48, max: 0.95, step: 0.02, default: 0.68 },
    { key: "legLength", label: "腿长", min: 0.62, max: 1.15, step: 0.02, default: 0.86 },
    { key: "neckArch", label: "颈头抬高", min: 0.45, max: 1.05, step: 0.02, default: 0.72 },
    { key: "maneLength", label: "鬃毛长度", min: 0, max: 0, step: 1, default: 0 },
    { key: "tailLength", label: "尾巴长度", min: 0.45, max: 1.25, step: 0.02, default: 0.82 },
    { key: "stride", label: "站姿步幅", min: -0.22, max: 0.22, step: 0.01, default: 0.06 },
  ],
  build(p) {
    return buildReferenceDogParts(p);
  },
};

// ---- stylized cartoon mech pilot: humanoid silhouette + suit armor accents ----
const cartoonMechPilot = {
  id: "cartoon-mech-pilot",
  name: "卡通机甲驾驶员",
  schema: [
    { key: "height", label: "身高", min: 3.5, max: 5.4, step: 0.05, default: 4.45 },
    { key: "armSpread", label: "手臂展开", min: 0.4, max: 1.4, step: 0.02, default: 1 },
    { key: "bootScale", label: "靴子大小", min: 0.75, max: 1.3, step: 0.02, default: 1 },
    { key: "armorScale", label: "护甲体积", min: 0.75, max: 1.3, step: 0.02, default: 1 },
    { key: "headsetScale", label: "耳机大小", min: 0.65, max: 1.35, step: 0.02, default: 1 },
  ],
  build(p) {
    return buildCartoonMechPilotParts(p);
  },
};

// ---- CharacterKit MVP: fixed-topology stylized humanoid + morph sliders ----
const stylizedHumanoid = {
  id: "stylized-humanoid",
  name: "CharacterKit风格化人形",
  schema: [
    { key: "height", label: "身高Morph", min: -1, max: 1, step: 0.02, default: 0.08 },
    { key: "shoulderWidth", label: "肩宽Morph", min: -1, max: 1, step: 0.02, default: 0.15 },
    { key: "waist", label: "腰围Morph", min: -1, max: 1, step: 0.02, default: -0.22 },
    { key: "legLength", label: "腿长Morph", min: -1, max: 1, step: 0.02, default: 0.18 },
    { key: "armLength", label: "臂长Morph", min: -1, max: 1, step: 0.02, default: 0.05 },
    { key: "headSize", label: "头部Morph", min: -1, max: 1, step: 0.02, default: 0.08 },
    { key: "jawWidth", label: "下颌Morph", min: -1, max: 1, step: 0.02, default: -0.15 },
    { key: "noseBridge", label: "鼻梁Morph", min: -1, max: 1, step: 0.02, default: 0.25 },
    { key: "chibi", label: "卡通比例", min: -1, max: 1, step: 0.02, default: 0.06 },
    { key: "eyeSize", label: "眼睛大小", min: -1, max: 1, step: 0.02, default: 0.22 },
  ],
  build(p) {
    return buildStylizedHumanoidParts(p);
  },
};

const FABRIC_OPTIONS = ["cottonJersey", "denim", "wool", "leather", "silk", "linen"];
function fabricByIndex(i) {
  return FABRIC_OPTIONS[Math.max(0, Math.min(FABRIC_OPTIONS.length - 1, Math.round(i)))];
}

/** Optionally settle garment parts with XPBD when the `settle` slider is on. */
function maybeSettle(parts, fabricId, settle) {
  if (!settle || settle < 0.5) return parts;
  const avatar = buildAvatar();
  const physical = getFabric(fabricId).physical;
  return parts.map((part) => ({
    ...part,
    mesh: solveCloth(part.mesh, { iterations: 30, gravity: -0.02, avatar, pinTopBand: 0.04, fabric: physical }),
  }));
}

// ---- procedural clothing: T-shirt, skirt, pants on a parametric avatar ----
const tshirtModel = {
  id: "tshirt",
  name: "T 恤 (程序化服装)",
  schema: [
    { key: "chest", label: "胸围", min: 0.7, max: 1.5, step: 0.01, default: 0.98 },
    { key: "height", label: "身高", min: 1.5, max: 2.0, step: 0.01, default: 1.8 },
    { key: "chestEase", label: "胸部松量", min: 0.0, max: 0.2, step: 0.005, default: 0.06 },
    { key: "bodyLength", label: "衣长", min: 0.7, max: 1.4, step: 0.02, default: 1.0 },
    { key: "sleeveLength", label: "袖长", min: 0.0, max: 1.0, step: 0.02, default: 0.32 },
    { key: "neckDrop", label: "领口下移", min: 0.0, max: 0.25, step: 0.01, default: 0.05 },
    { key: "fabric", label: "面料(0棉1牛仔2毛3皮4丝5麻)", min: 0, max: 5, step: 1, default: 0 },
    { key: "settle", label: "XPBD仿真(0关1开)", min: 0, max: 1, step: 1, default: 0 },
  ],
  build(p) {
    const fab = fabricByIndex(p.fabric);
    return maybeSettle(buildTShirt({
      measures: { chest: p.chest, height: p.height },
      chestEase: p.chestEase,
      bodyLength: p.bodyLength,
      sleeveLength: p.sleeveLength,
      neckDrop: p.neckDrop,
      fabric: fab,
    }), fab, p.settle);
  },
};

const skirtModel = {
  id: "skirt",
  name: "半身裙 (程序化服装)",
  schema: [
    { key: "hip", label: "臀围", min: 0.8, max: 1.5, step: 0.01, default: 1.02 },
    { key: "height", label: "身高", min: 1.5, max: 2.0, step: 0.01, default: 1.8 },
    { key: "length", label: "裙长", min: 0.2, max: 0.95, step: 0.02, default: 0.55 },
    { key: "flare", label: "下摆外扩(A字)", min: 0.0, max: 0.45, step: 0.01, default: 0.16 },
    { key: "hipEase", label: "臀部松量", min: 0.0, max: 0.15, step: 0.005, default: 0.04 },
    { key: "fabric", label: "面料(0棉1牛仔2毛3皮4丝5麻)", min: 0, max: 5, step: 1, default: 1 },
    { key: "settle", label: "XPBD仿真(0关1开)", min: 0, max: 1, step: 1, default: 0 },
  ],
  build(p) {
    const fab = fabricByIndex(p.fabric);
    return maybeSettle(buildSkirt({
      measures: { hip: p.hip, height: p.height },
      length: p.length,
      flare: p.flare,
      hipEase: p.hipEase,
      fabric: fab,
    }), fab, p.settle);
  },
};

const pantsModel = {
  id: "pants",
  name: "长裤 (程序化服装)",
  schema: [
    { key: "hip", label: "臀围", min: 0.8, max: 1.5, step: 0.01, default: 1.02 },
    { key: "height", label: "身高", min: 1.5, max: 2.0, step: 0.01, default: 1.8 },
    { key: "length", label: "裤长", min: 0.3, max: 1.0, step: 0.02, default: 1.0 },
    { key: "legOpening", label: "裤脚外扩(阔腿)", min: -0.04, max: 0.2, step: 0.005, default: 0.0 },
    { key: "thighEase", label: "大腿松量", min: 0.0, max: 0.15, step: 0.005, default: 0.03 },
    { key: "hipEase", label: "臀部松量", min: 0.0, max: 0.15, step: 0.005, default: 0.04 },
    { key: "fabric", label: "面料(0棉1牛仔2毛3皮4丝5麻)", min: 0, max: 5, step: 1, default: 1 },
    { key: "settle", label: "XPBD仿真(0关1开)", min: 0, max: 1, step: 1, default: 0 },
  ],
  build(p) {
    const fab = fabricByIndex(p.fabric);
    return maybeSettle(buildPants({
      measures: { hip: p.hip, height: p.height },
      length: p.length,
      legOpening: p.legOpening,
      thighEase: p.thighEase,
      hipEase: p.hipEase,
      fabric: fab,
    }), fab, p.settle);
  },
};

const dressModel = {
  id: "dress",
  name: "连衣裙 (程序化服装)",
  schema: [
    { key: "chest", label: "胸围", min: 0.7, max: 1.5, step: 0.01, default: 0.98 },
    { key: "hip", label: "臀围", min: 0.8, max: 1.5, step: 0.01, default: 1.02 },
    { key: "height", label: "身高", min: 1.5, max: 2.0, step: 0.01, default: 1.8 },
    { key: "waistline", label: "腰线(负=高腰)", min: -0.4, max: 0.3, step: 0.02, default: 0.0 },
    { key: "skirtLength", label: "裙长", min: 0.25, max: 0.95, step: 0.02, default: 0.55 },
    { key: "flare", label: "下摆外扩", min: 0.0, max: 0.45, step: 0.01, default: 0.22 },
    { key: "sleeveLength", label: "袖长(0无袖)", min: 0.0, max: 1.0, step: 0.02, default: 0.0 },
    { key: "neckDrop", label: "领口下移", min: 0.0, max: 0.25, step: 0.01, default: 0.06 },
    { key: "fabric", label: "面料(0棉1牛仔2毛3皮4丝5麻)", min: 0, max: 5, step: 1, default: 4 },
    { key: "settle", label: "XPBD仿真(0关1开)", min: 0, max: 1, step: 1, default: 0 },
  ],
  build(p) {
    const fab = fabricByIndex(p.fabric);
    return maybeSettle(buildDress({
      measures: { chest: p.chest, hip: p.hip, height: p.height },
      waistline: p.waistline,
      skirtLength: p.skirtLength,
      flare: p.flare,
      sleeveLength: p.sleeveLength,
      neckDrop: p.neckDrop,
      fabric: fab,
    }), fab, p.settle);
  },
};

const hoodieModel = {
  id: "hoodie",
  name: "卫衣 (程序化服装)",
  schema: [
    { key: "chest", label: "胸围", min: 0.7, max: 1.5, step: 0.01, default: 0.98 },
    { key: "height", label: "身高", min: 1.5, max: 2.0, step: 0.01, default: 1.8 },
    { key: "chestEase", label: "宽松度", min: 0.04, max: 0.22, step: 0.005, default: 0.12 },
    { key: "bodyLength", label: "衣长", min: 0.8, max: 1.4, step: 0.02, default: 1.05 },
    { key: "sleeveLength", label: "袖长", min: 0.4, max: 1.0, step: 0.02, default: 0.95 },
    { key: "hoodScale", label: "帽子大小", min: 0.8, max: 1.3, step: 0.02, default: 1.0 },
    { key: "pocket", label: "口袋(0无1有)", min: 0, max: 1, step: 1, default: 1 },
    { key: "fabric", label: "面料(0棉1牛仔2毛3皮4丝5麻)", min: 0, max: 5, step: 1, default: 0 },
    { key: "settle", label: "XPBD仿真(0关1开)", min: 0, max: 1, step: 1, default: 0 },
  ],
  build(p) {
    const fab = fabricByIndex(p.fabric);
    return maybeSettle(buildHoodie({
      measures: { chest: p.chest, height: p.height },
      chestEase: p.chestEase,
      bodyLength: p.bodyLength,
      sleeveLength: p.sleeveLength,
      hoodScale: p.hoodScale,
      pocket: p.pocket >= 0.5,
      fabric: fab,
    }), fab, p.settle);
  },
};

// ---- black office chair: wrinkled soft back, arms, gas lift, five-star base ----
const officeChair = {
  id: "officechair",
  name: "黑色办公椅",
  schema: [
    { key: "seatW", label: "坐垫宽度", min: 1.2, max: 2.2, step: 0.05, default: 1.65 },
    { key: "seatD", label: "坐垫深度", min: 1.0, max: 1.8, step: 0.05, default: 1.35 },
    { key: "backH", label: "靠背高度", min: 1.5, max: 2.8, step: 0.05, default: 2.2 },
    { key: "backW", label: "靠背宽度", min: 0.9, max: 1.7, step: 0.05, default: 1.22 },
    { key: "armSpread", label: "扶手外展", min: 0.85, max: 1.45, step: 0.02, default: 1.24 },
    { key: "baseR", label: "五星脚半径", min: 0.55, max: 1.1, step: 0.03, default: 0.86 },
    { key: "tilt", label: "靠背后倾", min: -0.24, max: 0.04, step: 0.01, default: -0.12 },
  ],
  build(p) {
    const LEATHER = [0.012, 0.017, 0.016];
    const LEATHER_HI = [0.03, 0.04, 0.038];
    const FRAME = [0.015, 0.018, 0.018];
    const METAL = [0.18, 0.19, 0.18];
    const seatH = 0.24;
    const seatY = 1.02;
    const backT = 0.18;
    const backY = seatY + p.backH * 0.48;
    const backZ = -p.seatD * 0.42;
    const frontBackZ = backZ + backT * 0.58;
    const parts = [];
    const leatherParams = (color) => ({ color, roughness: 0.72, grainScale: 96, grainStrength: 0.28, normalStrength: 0.45, clearcoat: 0.08 });
    const leatherP = (name, mesh, color = LEATHER) => surfPart(name, mesh, "leather", leatherParams(color));
    const plasticP = (name, mesh, color = FRAME) => surfPart(name, mesh, "plastic", { color, roughness: 0.76 });

    const seatTop = seatH * 0.5;
    const seatMesh = indentCreases(
      roundedBoxMesh(p.seatW, seatH, p.seatD, 3),
      [
        { from: vec3(-p.seatW * 0.2, seatTop, -p.seatD * 0.16), to: vec3(-p.seatW * 0.17, seatTop, p.seatD * 0.28), depth: 0.018, width: 0.035 },
        { from: vec3(0.02, seatTop, -p.seatD * 0.1), to: vec3(0, seatTop, p.seatD * 0.24), depth: 0.014, width: 0.03 },
        { from: vec3(p.seatW * 0.22, seatTop, -p.seatD * 0.12), to: vec3(p.seatW * 0.17, seatTop, p.seatD * 0.2), depth: 0.012, width: 0.032 },
        { from: vec3(-p.seatW * 0.26, seatTop, p.seatD * 0.04), to: vec3(p.seatW * 0.28, seatTop, p.seatD * 0.01), depth: 0.012, width: 0.036 },
      ],
      { direction: vec3(0, -1, 0), surfaceNormal: vec3(0, 1, 0), normalThreshold: 0.35 },
    );
    parts.push(leatherP("seat_cushion", transform(seatMesh, { translate: vec3(0, seatY, 0.08) })));
    parts.push(leatherP("front_lip", transform(cylinder(0.075, p.seatW * 0.86, 24, true), {
      rotate: vec3(0, 0, Math.PI / 2),
      translate: vec3(0, seatY - 0.01, 0.08 + p.seatD * 0.48),
    }), LEATHER_HI));

    const backFront = backT * 0.5;
    const backMesh = indentCreases(
      roundedBoxMesh(p.backW, p.backH, backT, 3),
      [
        { from: vec3(-p.backW * 0.18, -p.backH * 0.28, backFront), to: vec3(-p.backW * 0.15, p.backH * 0.18, backFront), depth: 0.018, width: 0.03 },
        { from: vec3(p.backW * 0.18, -p.backH * 0.24, backFront), to: vec3(p.backW * 0.14, p.backH * 0.16, backFront), depth: 0.016, width: 0.03 },
        { from: vec3(-p.backW * 0.28, p.backH * 0.02, backFront), to: vec3(p.backW * 0.27, p.backH * -0.01, backFront), depth: 0.013, width: 0.035 },
        { from: vec3(-p.backW * 0.24, -p.backH * 0.18, backFront), to: vec3(p.backW * 0.22, -p.backH * 0.2, backFront), depth: 0.012, width: 0.034 },
      ],
      { direction: vec3(0, 0, -1), surfaceNormal: vec3(0, 0, 1), normalThreshold: 0.3 },
    );
    parts.push(leatherP("back_outer", transform(backMesh, {
      rotate: vec3(p.tilt, 0, 0),
      translate: vec3(0, backY, backZ),
    })));
    parts.push(leatherP("head_panel", transform(roundedBoxMesh(p.backW * 0.78, p.backH * 0.22, backT * 0.7, 1), {
      rotate: vec3(p.tilt, 0, 0),
      translate: vec3(0, backY + p.backH * 0.32, frontBackZ + 0.035),
    }), LEATHER_HI));
    parts.push(leatherP("lumbar_panel", transform(roundedBoxMesh(p.backW * 0.86, p.backH * 0.16, backT * 0.66, 1), {
      rotate: vec3(p.tilt, 0, 0),
      translate: vec3(0, backY - p.backH * 0.27, frontBackZ + 0.035),
    }), LEATHER_HI));
    for (const side of [-1, 1]) {
      parts.push(leatherP(`side_bolster_${side}`, transform(roundedBoxMesh(p.backW * 0.16, p.backH * 0.72, backT * 0.62, 1), {
        rotate: vec3(p.tilt, 0, 0),
        translate: vec3(side * p.backW * 0.41, backY - p.backH * 0.03, frontBackZ + 0.04),
      }), LEATHER_HI));
    }
    const armX = p.seatW * p.armSpread * 0.5;
    for (const side of [-1, 1]) {
      const x = side * armX;
      const armCurve = bezier(
        vec3(x, seatY - 0.08, -p.seatD * 0.36),
        vec3(x, seatY + 0.58, -p.seatD * 0.34),
        vec3(x, seatY + 0.72, p.seatD * 0.18),
        vec3(x, seatY + 0.08, p.seatD * 0.48),
        28,
      );
      parts.push(plasticP(`arm_curve_${side}`, sweep(armCurve, { radius: 0.045, sides: 10, caps: true })));
      parts.push(plasticP(`arm_top_${side}`, transform(roundedBoxMesh(0.16, 0.08, p.seatD * 0.66, 1), {
        rotate: vec3(0.04, 0, 0),
        translate: vec3(x, seatY + 0.58, p.seatD * 0.06),
      })));
      parts.push(plasticP(`arm_front_post_${side}`, transform(cylinder(0.045, 0.58, 12, true), { translate: vec3(x, seatY + 0.23, p.seatD * 0.46) })));
    }

    parts.push(surfPart("gas_lift", transform(cylinder(0.095, 0.72, 24, true), { translate: vec3(0, 0.62, 0.02) }), "brushedMetal", { color: METAL }));
    parts.push(plasticP("seat_mount", transform(roundedBoxMesh(0.54, 0.12, 0.42, 1), { translate: vec3(0, seatY - 0.22, 0) })));
    parts.push(plasticP("base_hub", transform(cylinder(0.18, 0.16, 24, true), { translate: vec3(0, 0.29, 0) })));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const cx = Math.sin(a) * p.baseR * 0.43;
      const cz = Math.cos(a) * p.baseR * 0.43;
      parts.push(plasticP(`base_spoke_${i}`, transform(roundedBoxMesh(0.16, 0.095, p.baseR * 0.92, 1), {
        rotate: vec3(0, a, 0),
        translate: vec3(cx, 0.28, cz),
      })));
      const wx = Math.sin(a) * p.baseR * 0.9;
      const wz = Math.cos(a) * p.baseR * 0.9;
      parts.push(plasticP(`caster_${i}`, transform(cylinder(0.075, 0.1, 14, true), {
        rotate: vec3(0, a, Math.PI / 2),
        translate: vec3(wx, 0.13, wz),
      })));
      parts.push(plasticP(`caster_fork_${i}`, transform(roundedBoxMesh(0.12, 0.08, 0.07, 1), {
        rotate: vec3(0, a, 0),
        translate: vec3(wx, 0.22, wz),
      })));
    }
    return parts;
  },
};

// material preview ball
const sphereModel = {
  id: "sphere",
  name: "材质预览球",
  schema: [
    { key: "radius", label: "半径", min: 0.5, max: 1.5, step: 0.05, default: 1 },
    { key: "detail", label: "精度", min: 16, max: 96, step: 8, default: 64 },
  ],
  build(p) {
    return [surfPart("preview", sphere(p.radius, Math.round(p.detail), Math.round(p.detail * 0.75)), "ceramic", { color: [0.8, 0.8, 0.82] })];
  },
};

// Catmull-Clark smooth subdivision demo: a blocky base smoothed live.
const smoothModel = {
  id: "smooth",
  name: "平滑细分体",
  schema: [
    { key: "iterations", label: "细分级数", min: 0, max: 3, step: 1, default: 2 },
    { key: "size", label: "尺寸", min: 0.6, max: 1.6, step: 0.05, default: 1 },
    { key: "twist", label: "塔层数", min: 1, max: 5, step: 1, default: 3 },
  ],
  build(p) {
    const layers = Math.round(p.twist);
    const merged = [];
    for (let i = 0; i < layers; i++) {
      const w = p.size * (1.4 - i * 0.25);
      merged.push(transform(box(w, p.size, w), { translate: vec3(0, i * p.size, 0) }));
    }
    const m = merge(...merged);
    const it = Math.round(p.iterations);
    const result = it > 0 ? catmullClark(m, it) : m;
    return [surfPart("smooth", result, "plastic", { color: [0.6, 0.7, 0.85], roughness: 0.25 })];
  },
};

// Curve sweep demo: a spring (helix) and a tapered vine.
const springModel = {
  id: "spring",
  name: "程序化弹簧",
  schema: [
    { key: "radius", label: "螺旋半径", min: 0.3, max: 1, step: 0.05, default: 0.6 },
    { key: "height", label: "高度", min: 1, max: 3, step: 0.1, default: 2 },
    { key: "turns", label: "圈数", min: 2, max: 10, step: 1, default: 6 },
    { key: "wire", label: "线材粗细", min: 0.03, max: 0.18, step: 0.01, default: 0.08 },
    { key: "sides", label: "截面边数", min: 4, max: 16, step: 1, default: 10 },
  ],
  build(p) {
    const c = helix({ radius: p.radius, height: p.height, turns: Math.round(p.turns), segments: Math.round(p.turns) * 24 });
    const m = sweep(c, { radius: p.wire, sides: Math.round(p.sides), caps: true });
    return [surfPart("spring", m, "metal", { color: [0.7, 0.72, 0.78], roughness: 0.2 })];
  },
};

// Ivy-covered ruins: stone columns + wall with ivy that ADHERES to each surface
// and climbs up (cylinderSurface/wallSurface + buildClimbingVineParts). Modeled
// on the UE PCG demo screenshot: broken classical columns wrapped in ivy.
const ivyRuinsModel = {
  id: "ivy-ruins",
  name: "藤蔓石柱废墟",
  schema: [
    { key: "columns", label: "石柱数", min: 1, max: 5, step: 1, default: 3 },
    { key: "columnRadius", label: "柱身半径", min: 0.3, max: 0.7, step: 0.05, default: 0.45 },
    { key: "ivyPerColumn", label: "每柱藤蔓数", min: 2, max: 12, step: 1, default: 6 },
    { key: "leafDensity", label: "叶片密度", min: 2, max: 14, step: 0.5, default: 9 },
    { key: "lushness", label: "繁茂度", min: 0.4, max: 1.6, step: 0.1, default: 1 },
    { key: "seed", label: "随机种子", min: 0, max: 40, step: 1, default: 7 },
  ],
  build(p) {
    return buildIvyRuinsParts({
      seed: Math.round(p.seed),
      columns: Math.round(p.columns),
      columnRadius: p.columnRadius,
      ivyPerColumn: Math.round(p.ivyPerColumn),
      leafDensity: p.leafDensity,
      lushness: p.lushness,
    });
  },
};

const vineCoveredRockModel = {
  id: "vine-covered-rock",
  name: "藤蔓覆盖裂隙岩柱",
  category: "自然",
  assetMeta: {
    description: "参考 BV12w411a7ne：竖向裂隙岩柱、表面吸附藤蔓、顶冠垂藤、基部环形密叶。",
    tags: ["岩石", "藤蔓", "常春藤", "PCG", "程序化复刻"],
    capabilities: ["岩柱数量", "覆盖度", "叶片尺寸", "垂藤长度", "基部扩散", "四级LOD"],
    materialClasses: ["风化岩石", "木质藤茎", "双面藤叶", "土壤"],
  },
  schema: [
    { key: "rockCount", label: "裂隙岩柱数", min: 3, max: 8, step: 1, default: 5 },
    { key: "width", label: "岩体宽度", min: 3, max: 9, step: 0.1, default: 5.4 },
    { key: "height", label: "岩体高度", min: 3, max: 10, step: 0.1, default: 5.8 },
    { key: "coverage", label: "藤叶覆盖度", min: 0.2, max: 1.8, step: 0.05, default: 1 },
    { key: "leafSize", label: "藤叶尺寸", min: 0.08, max: 0.4, step: 0.01, default: 0.22 },
    { key: "hangingLength", label: "顶冠垂藤长度", min: 0, max: 4, step: 0.1, default: 1.7 },
    { key: "groundSpread", label: "基部藤叶扩散", min: 0, max: 2.5, step: 0.05, default: 1.45 },
    { key: "lod", label: "细节等级", min: 0, max: 3, step: 1, default: 1 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 73 },
  ],
  build(params) {
    return buildVineCoveredRockParts({
      seed: Math.round(params.seed),
      rockCount: Math.round(params.rockCount),
      width: params.width,
      height: params.height,
      coverage: params.coverage,
      leafSize: params.leafSize,
      hangingLength: params.hangingLength,
      groundSpread: params.groundSpread,
      lod: Math.round(params.lod),
    });
  },
};

const crazyIvyWallModel = {
  id: "crazy-ivy-wall",
  name: "Crazy Ivy 爬墙藤蔓复刻",
  category: "植被",
  assetMeta: {
    description: "参考 BV1YL411r7Cg：多簇表面蔓延、随机分叉、墙顶悬垂、绿叶/红叶物种切换。",
    tags: ["常春藤", "墙面覆盖", "悬垂藤", "Crazy Ivy", "程序化复刻"],
    capabilities: ["覆盖度", "悬垂量", "分叉率", "叶片密度", "秋色变体", "四级LOD"],
    materialClasses: ["灰泥墙", "木质藤茎", "双面常春藤叶"],
  },
  schema: [
    { key: "width", label: "墙面宽度", min: 3, max: 14, step: 0.25, default: 8 },
    { key: "height", label: "墙面高度", min: 2, max: 8, step: 0.25, default: 4.2 },
    { key: "coverage", label: "藤蔓覆盖度", min: 0.1, max: 1.4, step: 0.05, default: 0.82 },
    { key: "hanging", label: "墙顶悬垂量", min: 0, max: 1, step: 0.05, default: 0.48 },
    { key: "branching", label: "随机分叉率", min: 0, max: 1, step: 0.05, default: 0.62 },
    { key: "leafSize", label: "常春藤叶尺寸", min: 0.06, max: 0.32, step: 0.01, default: 0.18 },
    { key: "leafDensity", label: "叶片密度", min: 1, max: 14, step: 0.5, default: 8.5 },
    { key: "dryness", label: "枯叶比例", min: 0, max: 1, step: 0.05, default: 0.06 },
    { key: "autumn", label: "红叶物种混合", min: 0, max: 1, step: 0.05, default: 0 },
    { key: "lod", label: "LOD等级", min: 0, max: 3, step: 1, default: 1 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 45 },
  ],
  build(p) {
    return buildCrazyIvyWallParts({
      seed: Math.round(p.seed),
      width: p.width,
      height: p.height,
      coverage: p.coverage,
      hanging: p.hanging,
      branching: p.branching,
      leafSize: p.leafSize,
      leafDensity: p.leafDensity,
      dryness: p.dryness,
      autumn: p.autumn,
      lod: Math.round(p.lod),
    });
  },
};

const lowPolyIvyModel = {
  id: "ivy-lowpoly-vol23",
  name: "低模常春藤 VOL23 复刻",
  category: "植被",
  assetMeta: {
    description: "从 UE5 VOL23 资产规律重建：五类剪影、三裂叶、活枯双态、四级 LOD；全部为程序化几何。",
    tags: ["常春藤", "低模", "藤蔓", "LOD", "程序化复刻"],
    capabilities: ["五类生长构型", "种子变体", "活枯混合", "风权重", "四级LOD"],
    materialClasses: ["树皮", "双面叶片"],
  },
  schema: [
    { key: "form", label: "形态(0墙1垂2横3帘4疏)", min: 0, max: 4, step: 1, default: 0 },
    { key: "width", label: "横向尺寸", min: 0.8, max: 5, step: 0.1, default: 2.2 },
    { key: "height", label: "纵向尺寸", min: 0.8, max: 6, step: 0.1, default: 2.8 },
    { key: "strands", label: "主藤数量", min: 1, max: 9, step: 1, default: 4 },
    { key: "branches", label: "每藤分叉", min: 0, max: 4, step: 1, default: 2 },
    { key: "leafSize", label: "叶片尺寸", min: 0.06, max: 0.32, step: 0.01, default: 0.16 },
    { key: "leafDensity", label: "叶片密度", min: 1, max: 14, step: 0.5, default: 7.5 },
    { key: "lushness", label: "繁茂度", min: 0.25, max: 1.8, step: 0.05, default: 1 },
    { key: "dryness", label: "枯叶比例", min: 0, max: 1, step: 0.05, default: 0.08 },
    { key: "lod", label: "LOD等级", min: 0, max: 3, step: 1, default: 0 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 23 },
  ],
  build(p) {
    const forms = ["wall", "hanging", "runner", "curtain", "sparse"];
    return buildLowPolyIvyParts({
      seed: Math.round(p.seed),
      form: forms[Math.round(p.form)] ?? "wall",
      width: p.width,
      height: p.height,
      strands: Math.round(p.strands),
      branches: Math.round(p.branches),
      leafSize: p.leafSize,
      leafDensity: p.leafDensity,
      lushness: p.lushness,
      dryness: p.dryness,
      lod: Math.round(p.lod),
    });
  },
};

const lowPolyIvyKitModel = {
  id: "ivy-lowpoly-vol23-kit",
  name: "低模常春藤 VOL23 套件",
  category: "植被",
  schema: [
    { key: "variants", label: "变体数量", min: 5, max: 20, step: 1, default: 10 },
    { key: "columns", label: "每行数量", min: 2, max: 8, step: 1, default: 5 },
    { key: "scale", label: "整体尺度", min: 0.4, max: 2, step: 0.05, default: 1 },
    { key: "lushness", label: "繁茂度", min: 0.25, max: 1.6, step: 0.05, default: 1 },
    { key: "dryness", label: "枯叶基准", min: 0, max: 1, step: 0.05, default: 0.12 },
    { key: "lod", label: "LOD等级", min: 0, max: 3, step: 1, default: 1 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 23 },
  ],
  build(p) {
    return buildLowPolyIvyKitParts({
      seed: Math.round(p.seed),
      variants: Math.round(p.variants),
      columns: Math.round(p.columns),
      scale: p.scale,
      lushness: p.lushness,
      dryness: p.dryness,
      lod: Math.round(p.lod),
    });
  },
};

const vineModel = {
  id: "vine",
  name: "程序化藤蔓",
  // Driven by the real vine generator (src/geometry/vine.ts): a seeded
  // gravity + wander growth walk, swept into tapering tubes, with recursive
  // branches and phyllotaxis leaves. mode 0=垂吊 1=攀爬 2=匍匐.
  schema: [
    { key: "mode", label: "生长模式(0垂1爬2匍)", min: 0, max: 2, step: 1, default: 0 },
    { key: "length", label: "主茎长度", min: 1.5, max: 4.5, step: 0.1, default: 3 },
    { key: "radius", label: "根部粗细", min: 0.03, max: 0.14, step: 0.005, default: 0.06 },
    { key: "wander", label: "弯曲随机", min: 0, max: 1.2, step: 0.05, default: 0.5 },
    { key: "branches", label: "分叉数", min: 0, max: 6, step: 1, default: 3 },
    { key: "branchDepth", label: "分叉层级", min: 1, max: 3, step: 1, default: 2 },
    { key: "leafDensity", label: "叶片密度", min: 0, max: 12, step: 0.5, default: 6 },
    { key: "leafSize", label: "叶片大小", min: 0.06, max: 0.3, step: 0.01, default: 0.13 },
    { key: "seed", label: "形态种子", min: 0, max: 40, step: 1, default: 5 },
  ],
  build(p) {
    const modes = ["hanging", "climbing", "creeping"];
    return buildVineParts({
      seed: Math.round(p.seed),
      mode: modes[Math.round(p.mode)] ?? "hanging",
      length: p.length,
      radius: p.radius,
      wander: p.wander,
      branches: Math.round(p.branches),
      branchDepth: Math.round(p.branchDepth),
      leafDensity: p.leafDensity,
      leafSize: p.leafSize,
    });
  },
};

// Scatter demo: a ground patch with blue-noise scattered grass blades + rocks.
const meadowModel = {
  id: "meadow",
  name: "程序化草地",
  schema: [
    { key: "blades", label: "草叶数", min: 10, max: 120, step: 5, default: 60 },
    { key: "rocks", label: "石头数", min: 0, max: 20, step: 1, default: 6 },
    { key: "bladeH", label: "草高", min: 0.2, max: 0.8, step: 0.02, default: 0.4 },
    { key: "seed", label: "分布种子", min: 0, max: 40, step: 1, default: 7 },
  ],
  build(p) {
    const parts = [];
    const ground = transform(scaleMesh(sphere(2, 32, 20), vec3(1, 0.12, 1)), { translate: vec3(0, 0, 0) });
    parts.push(surfPart("ground", ground, "fabric", { color: [0.28, 0.4, 0.2] }));
    // grass blade = thin tall cone
    const blade = cone(0.04, p.bladeH, 5, false);
    const grass = poissonScatter(ground, blade, {
      count: Math.round(p.blades), seed: p.seed, candidates: 10,
      scaleRange: [0.7, 1.3], randomYaw: true, alignToNormal: true,
    });
    parts.push(surfPart("grass", grass, "fabric", { color: [0.35, 0.6, 0.25] }));
    if (p.rocks > 0) {
      const rock = icosphere(0.12, 1);
      const rocks = poissonScatter(ground, rock, {
        count: Math.round(p.rocks), seed: p.seed + 99, candidates: 8,
        scaleRange: [0.6, 1.5], randomYaw: true, alignToNormal: false,
      });
      parts.push(surfPart("rocks", rocks, "stone"));
    }
    return parts;
  },
};

// Boolean (CSG) demo: a rounded cube with a hole drilled and corners cut.
const csgModel = {
  id: "csg",
  name: "布尔切割体",
  schema: [
    { key: "size", label: "立方体尺寸", min: 1, max: 2.2, step: 0.05, default: 1.6 },
    { key: "holeR", label: "孔半径", min: 0.2, max: 0.7, step: 0.02, default: 0.45 },
    { key: "sphereCut", label: "球切量", min: 0.6, max: 1.3, step: 0.02, default: 1 },
    { key: "mode", label: "运算(0减1交2并)", min: 0, max: 2, step: 1, default: 0 },
  ],
  build(p) {
    const cube = box(p.size, p.size, p.size);
    const ball = sphere(p.sphereCut, 24, 16);
    const drill = cylinder(p.holeR, p.size * 2.2, 24, true);
    let result;
    const mode = Math.round(p.mode);
    if (mode === 0) {
      // subtract: drill a hole, then round corners by subtracting nothing extra
      result = subtract(cube, drill);
    } else if (mode === 1) {
      result = intersect(cube, ball);
    } else {
      result = union(cube, transform(ball, { translate: vec3(p.size / 2, p.size / 2, 0) }));
    }
    return [surfPart("csg", result, "carPaint", { color: [0.7, 0.55, 0.35] })];
  },
};

const remeshModel = {
  id: "remesh",
  name: "体素重网格",
  schema: [
    { key: "res", label: "体素分辨率", min: 12, max: 56, step: 2, default: 30 },
    { key: "shapeMix", label: "球体嵌入量", min: 0.4, max: 1.1, step: 0.02, default: 0.75 },
    { key: "raw", label: "显示原始布尔(0否1是)", min: 0, max: 1, step: 1, default: 0 },
  ],
  build(p) {
    // A messy boolean union: box + offset sphere + a drilled hole. The seams,
    // slivers and uneven density are exactly what voxel remesh cleans up.
    const cube = box(1.4, 1.4, 1.4);
    const ball = sphere(p.shapeMix, 20, 14);
    const drill = cylinder(0.35, 3, 20, true);
    const messy = subtract(
      union(cube, transform(ball, { translate: vec3(0.7, 0.7, 0) })),
      drill,
    );
    if (Math.round(p.raw) === 1) {
      return [surfPart("remesh", boxUV(messy), "metal", { color: [0.75, 0.4, 0.3], roughness: 0.5 })];
    }
    const clean = boxUV(voxelRemesh(messy, { resolution: Math.round(p.res) }));
    return [surfPart("remesh", clean, "metal", { color: [0.5, 0.65, 0.8], roughness: 0.45 })];
  },
};

// Field-driven terrain: a plane displaced by a per-vertex noise ScalarField.
const terrainModel = {
  id: "fterrain",
  name: "字段地形",
  schema: [
    { key: "size", label: "地块尺寸", min: 2, max: 6, step: 0.5, default: 4 },
    { key: "res", label: "网格密度", min: 16, max: 80, step: 8, default: 48 },
    { key: "height", label: "起伏高度", min: 0.1, max: 1.5, step: 0.05, default: 0.7 },
    { key: "scale", label: "噪声频率", min: 0.5, max: 4, step: 0.1, default: 1.5 },
    { key: "seed", label: "地形种子", min: 0, max: 40, step: 1, default: 5 },
  ],
  build(p) {
    const res = Math.round(p.res);
    const base = plane(p.size, p.size, res, res);
    const noise = makeNoise(p.seed);
    // ScalarField: height from fbm of XZ position
    const heightField = (ctx) =>
      fbm2(noise, ctx.position.x * p.scale, ctx.position.z * p.scale, { octaves: 4 }) * p.height;
    const am = displaceField(withAttributes(base), vec3(0, 1, 0), heightField);
    return [surfPart("terrain", am.mesh, "stone", { scale: p.scale })];
  },
};

// Lathe (surface of revolution): a stemmed wine glass built by sweeping a
// vertical polyline with a per-height radius profile. The bowl, stem and foot
// are all driven by parameters, so the same recipe covers many glass shapes —
// this is the live, editable version of the image->model wine-glass result.
const wineGlassModel = {
  id: "wineglass",
  name: "程序化酒杯",
  schema: [
    { key: "bowlR", label: "杯碗半径", min: 0.25, max: 0.7, step: 0.01, default: 0.45 },
    { key: "bowlH", label: "杯碗高度", min: 0.6, max: 1.6, step: 0.02, default: 1.05 },
    { key: "rimIn", label: "收口程度", min: 0, max: 0.5, step: 0.01, default: 0.22 },
    { key: "belly", label: "腹部饱满", min: 0.6, max: 1.3, step: 0.02, default: 1.0 },
    { key: "stemR", label: "杯杆粗细", min: 0.02, max: 0.1, step: 0.005, default: 0.045 },
    { key: "stemH", label: "杯杆高度", min: 0.3, max: 1.0, step: 0.02, default: 0.62 },
    { key: "footR", label: "底座半径", min: 0.25, max: 0.6, step: 0.01, default: 0.42 },
    { key: "sides", label: "旋转面数", min: 16, max: 64, step: 4, default: 48 },
    { key: "wine", label: "斟酒量", min: 0, max: 0.9, step: 0.02, default: 0.45 },
  ],
  build(p) {
    // Profile control points as [y, radius], bottom -> rim. The bowl belly is
    // a rounded egg shape; rimIn pulls the top edge back inward (tulip).
    const footTop = 0.18;
    const bowlBase = footTop + p.stemH;
    const prof = [
      [0.0, 0.02],
      [0.03, p.footR],
      [0.06, p.footR],
      [0.11, p.footR * 0.45],
      [footTop, p.stemR],
      [bowlBase - 0.02, p.stemR],
      [bowlBase + 0.06, p.bowlR * 0.45],
      [bowlBase + p.bowlH * 0.28, p.bowlR * 0.92 * p.belly],
      [bowlBase + p.bowlH * 0.6, p.bowlR * p.belly],
      [bowlBase + p.bowlH * 0.85, p.bowlR * (1 - p.rimIn * 0.7)],
      [bowlBase + p.bowlH, p.bowlR * (1 - p.rimIn)],
    ];
    const pts = prof.map((q) => vec3(0, q[0], 0));
    const curve = polyline(pts, false);
    const n = prof.length;
    const radiusAt = (t) => {
      const f = t * (n - 1);
      const i = Math.max(0, Math.min(n - 2, Math.floor(f)));
      const k = f - i;
      return prof[i][1] * (1 - k) + prof[i + 1][1] * k;
    };
    const glassMesh = sweep(curve, { radius: 1, sides: Math.round(p.sides), radiusAt, caps: true });
    const parts = [surfPart("glass", glassMesh, "glass", { tint: [0.92, 0.96, 0.96], roughness: 0.02 })];
    // Wine: a smaller lathe filling the lower bowl, as transmissive liquid.
    if (p.wine > 0.001) {
      const fillTop = bowlBase + 0.06 + (p.bowlH - 0.06) * p.wine;
      const wineProf = prof.filter((q) => q[0] >= bowlBase + 0.04 && q[0] <= fillTop);
      wineProf.unshift([bowlBase + 0.04, p.bowlR * 0.3]);
      wineProf.push([fillTop, radiusAt((fillTop) / (prof[prof.length - 1][0])) * 0.94]);
      const wpts = wineProf.map((q) => vec3(0, q[0], 0));
      const wm = wineProf.length;
      const wineCurve = polyline(wpts, false);
      const wineRadiusAt = (t) => {
        const f = t * (wm - 1);
        const i = Math.max(0, Math.min(wm - 2, Math.floor(f)));
        const k = f - i;
        return (wineProf[i][1] * (1 - k) + wineProf[i + 1][1] * k) * 0.92;
      };
      const wineMesh = sweep(wineCurve, { radius: 1, sides: Math.round(p.sides), radiusAt: wineRadiusAt, caps: true });
      parts.push(surfPart("wine", wineMesh, "liquid", { tint: [0.42, 0.04, 0.08] }));
    }
    return parts;
  },
};

// ---- procedural architecture: parametric building (footprint→floors→facade→roof) ----
const ROOF_TYPES = ["flat", "hip", "gable"];
const building = {
  id: "building",
  name: "程序化建筑",
  schema: [
    { key: "floors", label: "层数", min: 1, max: 24, step: 1, default: 6 },
    { key: "floorHeight", label: "层高", min: 0.6, max: 1.6, step: 0.05, default: 1.0 },
    { key: "width", label: "面宽", min: 2, max: 9, step: 0.1, default: 4.0 },
    { key: "depth", label: "进深", min: 2, max: 9, step: 0.1, default: 3.0 },
    { key: "baysX", label: "面宽开间", min: 1, max: 8, step: 1, default: 4 },
    { key: "baysZ", label: "进深开间", min: 1, max: 8, step: 1, default: 3 },
    { key: "windowRatio", label: "窗墙比", min: 0.25, max: 0.95, step: 0.01, default: 0.62 },
    { key: "setback", label: "逐层收分", min: 0, max: 0.3, step: 0.01, default: 0 },
    { key: "groundFloorScale", label: "首层挑高", min: 1, max: 2, step: 0.05, default: 1.35 },
    { key: "roofType", label: "屋顶(0平/1四坡/2双坡)", min: 0, max: 2, step: 1, default: 0 },
    { key: "roofHeight", label: "屋顶高", min: 0.4, max: 2.5, step: 0.05, default: 1.2 },
    { key: "corners", label: "转角壁柱(0关/1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "balconyEvery", label: "阳台间隔层(0关)", min: 0, max: 6, step: 1, default: 0 },
    { key: "canopy", label: "入口雨棚(0关/1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "seed", label: "亮窗种子", min: 0, max: 60, step: 1, default: 7 },
  ],
  build(p) {
    return buildBuildingParts({
      floors: p.floors,
      floorHeight: p.floorHeight,
      width: p.width,
      depth: p.depth,
      baysX: p.baysX,
      baysZ: p.baysZ,
      windowRatio: p.windowRatio,
      setback: p.setback,
      groundFloorScale: p.groundFloorScale,
      roof: ROOF_TYPES[Math.round(p.roofType)] || "flat",
      roofHeight: p.roofHeight,
      corners: Math.round(p.corners) === 1,
      balconyEvery: Math.round(p.balconyEvery),
      canopy: Math.round(p.canopy) === 1,
      seed: p.seed,
    });
  },
};

// ---- urban city buildings: CitySample-style modular towers (podium/shaft/crown) ----
const URBAN_FACADE = ["punched", "ribbon"];
const URBAN_CROWN = ["flat", "stepped", "spire", "mansard", "watertank"];

/**
 * Build a ProcModel for one urban-building style. Each style gets the same
 * schema (footprint / floors / bays / podium / setback / facade / crown), with
 * defaults pulled from the library preset so the slider starting point already
 * reads as that city type.
 */
function makeUrbanModel(id, name, style) {
  const d = urbanDefaults(style);
  return {
    id,
    name,
    schema: [
      { key: "floors", label: "标准层数", min: 1, max: 40, step: 1, default: d.floors },
      { key: "floorHeight", label: "层高", min: 0.6, max: 1.6, step: 0.02, default: d.floorHeight },
      { key: "width", label: "面宽", min: 2, max: 8, step: 0.1, default: d.width },
      { key: "depth", label: "进深", min: 2, max: 8, step: 0.1, default: d.depth },
      { key: "baysX", label: "面宽开间", min: 1, max: 10, step: 1, default: d.baysX },
      { key: "baysZ", label: "进深开间", min: 1, max: 10, step: 1, default: d.baysZ },
      { key: "podiumFloors", label: "裙楼层数", min: 0, max: 4, step: 1, default: d.podiumFloors },
      { key: "podiumOverhang", label: "裙楼外扩", min: 0, max: 1.6, step: 0.05, default: d.podiumOverhang },
      { key: "setbackEvery", label: "每N层收分(0关)", min: 0, max: 10, step: 1, default: d.setbackEvery },
      { key: "setbackAmount", label: "收分量", min: 0, max: 1, step: 0.05, default: d.setbackAmount },
      { key: "facade", label: "立面(0冲孔窗/1带形窗)", min: 0, max: 1, step: 1, default: URBAN_FACADE.indexOf(d.facade) },
      { key: "windowRatio", label: "窗墙比", min: 0.2, max: 0.95, step: 0.01, default: d.windowRatio },
      { key: "verticalPiers", label: "竖向壁柱(0关/1开)", min: 0, max: 1, step: 1, default: d.verticalPiers ? 1 : 0 },
      { key: "crown", label: "塔冠(0平/1退台/2尖顶/3孟莎/4水塔)", min: 0, max: 4, step: 1, default: URBAN_CROWN.indexOf(d.crown) },
      { key: "crownHeight", label: "塔冠高", min: 0.3, max: 3.5, step: 0.05, default: d.crownHeight },
      { key: "seed", label: "变体种子", min: 0, max: 120, step: 1, default: d.seed },
    ],
    build(p) {
      return buildUrbanBuildingParts({
        style,
        floors: p.floors,
        floorHeight: p.floorHeight,
        width: p.width,
        depth: p.depth,
        baysX: p.baysX,
        baysZ: p.baysZ,
        podiumFloors: p.podiumFloors,
        podiumOverhang: p.podiumOverhang,
        setbackEvery: Math.round(p.setbackEvery),
        setbackAmount: p.setbackAmount,
        facade: URBAN_FACADE[Math.round(p.facade)] || "punched",
        windowRatio: p.windowRatio,
        verticalPiers: Math.round(p.verticalPiers) === 1,
        crown: URBAN_CROWN[Math.round(p.crown)] || "flat",
        crownHeight: p.crownHeight,
        seed: p.seed,
      });
    },
  };
}

const urbanArtDeco = makeUrbanModel("urban-artdeco", "都市·装饰艺术摩天楼", "artDeco");
const urbanGlassTower = makeUrbanModel("urban-glass", "都市·玻璃幕墙塔", "glassTower");
const urbanBrickWalkup = makeUrbanModel("urban-brick", "都市·砖砌公寓", "brickWalkup");
const urbanModernOffice = makeUrbanModel("urban-office", "都市·现代办公楼", "modernOffice");
const urbanBrownstone = makeUrbanModel("urban-brownstone", "都市·褐石排屋", "brownstone");
const urbanCorporate = makeUrbanModel("urban-corporate", "都市·企业总部塔", "corporate");

// ---- semantic module-kit street building: slots -> weighted facade modules ----
const japaneseStreetBuilding = {
  id: "japanese-street-building",
  name: "日式模块化街屋",
  schema: [
    { key: "floors", label: "层数", min: 1, max: 9, step: 1, default: 5 },
    { key: "width", label: "面宽", min: 3, max: 14, step: 0.1, default: 7.2 },
    { key: "depth", label: "进深", min: 3, max: 10, step: 0.1, default: 5.2 },
    { key: "floorHeight", label: "层高", min: 0.7, max: 1.6, step: 0.05, default: 1.05 },
    { key: "bayWidth", label: "模块开间", min: 0.7, max: 2, step: 0.05, default: 1.2 },
    { key: "signDensity", label: "招牌密度", min: 0, max: 1, step: 0.05, default: 0.95 },
    { key: "balconyDensity", label: "阳台密度", min: 0, max: 1, step: 0.05, default: 0.75 },
    { key: "utilityDensity", label: "空调密度", min: 0, max: 1, step: 0.05, default: 0.55 },
    { key: "roofClutter", label: "屋顶设备", min: 0, max: 1, step: 0.05, default: 1 },
    { key: "seed", label: "模块种子", min: 0, max: 999, step: 1, default: 23 },
  ],
  build(p) {
    return buildJapaneseStreetBuildingParts({
      floors: Math.round(p.floors),
      width: p.width,
      depth: p.depth,
      floorHeight: p.floorHeight,
      bayWidth: p.bayWidth,
      signDensity: p.signDensity,
      balconyDensity: p.balconyDensity,
      utilityDensity: p.utilityDensity,
      roofClutter: p.roofClutter,
      seed: Math.round(p.seed),
    });
  },
};

// ---- Hong Kong cyber street house: dense facade + signs + exposed services ----
const hongKongCyberHouse = {
  id: "hong-kong-cyber-house",
  name: "香港赛博街屋",
  schema: [
    { key: "floors", label: "楼层数", min: 3, max: 18, step: 1, default: 9 },
    { key: "width", label: "街面宽度", min: 3.6, max: 14, step: 0.1, default: 8.4 },
    { key: "depth", label: "建筑进深", min: 3.2, max: 11, step: 0.1, default: 6.2 },
    { key: "floorHeight", label: "标准层高", min: 0.65, max: 1.5, step: 0.05, default: 0.92 },
    { key: "bays", label: "立面开间", min: 2, max: 10, step: 1, default: 5 },
    { key: "signDensity", label: "招牌密度", min: 0, max: 1, step: 0.05, default: 0.88 },
    { key: "neonAmount", label: "霓虹强度", min: 0, max: 1, step: 0.05, default: 0.9 },
    { key: "balconyDepth", label: "外挑深度", min: 0.2, max: 1.4, step: 0.05, default: 0.62 },
    { key: "utilityDensity", label: "机电密度", min: 0, max: 1, step: 0.05, default: 0.78 },
    { key: "seed", label: "变体种子", min: 0, max: 999, step: 1, default: 71 },
  ],
  build(p) {
    return buildHongKongCyberHouseParts({
      floors: Math.round(p.floors),
      width: p.width,
      depth: p.depth,
      floorHeight: p.floorHeight,
      bays: Math.round(p.bays),
      signDensity: p.signDensity,
      neonAmount: p.neonAmount,
      balconyDepth: p.balconyDepth,
      utilityDensity: p.utilityDensity,
      seed: Math.round(p.seed),
    });
  },
};

// ---- Kowloon cyber courtyard: inward-facing blocks + wet neon night ----
const kowloonCyberCourtyard = {
  id: "kowloon-cyber-courtyard",
  name: "九龙城·夜雨赛博天井",
  scenePreset: {
    environment: "night",
    background: { mode: "gradient", color: "#01030a", color2: "#09172d" },
    exposure: 0.72,
    bloom: { enabled: true, strength: 0.58, radius: 0.5, threshold: 0.8 },
    fog: { enabled: false, density: 0.012, height: 2.8, shaft: 0 },
    camera: "courtyard",
    grid: false,
  },
  schema: [
    { key: "floors", label: "周边楼层", min: 4, max: 18, step: 1, default: 10 },
    { key: "courtyardWidth", label: "天井宽度", min: 4, max: 15, step: 0.1, default: 8.2 },
    { key: "courtyardDepth", label: "天井深度", min: 5, max: 18, step: 0.1, default: 10.6 },
    { key: "buildingDepth", label: "周边楼深", min: 2.8, max: 7, step: 0.1, default: 4.4 },
    { key: "floorHeight", label: "标准层高", min: 0.65, max: 1.4, step: 0.05, default: 0.9 },
    { key: "alleyWidth", label: "窄巷宽度", min: 0.75, max: 2.8, step: 0.05, default: 1.35 },
    { key: "signDensity", label: "广告牌密度", min: 0, max: 1, step: 0.05, default: 0.94 },
    { key: "neonAmount", label: "霓虹强度", min: 0, max: 1, step: 0.05, default: 1 },
    { key: "utilityDensity", label: "机电密度", min: 0, max: 1, step: 0.05, default: 0.9 },
    { key: "wetness", label: "地面湿度", min: 0, max: 1, step: 0.05, default: 0.95 },
    { key: "rainAmount", label: "雨丝密度", min: 0, max: 1, step: 0.05, default: 0.72 },
    { key: "seed", label: "街区种子", min: 0, max: 999, step: 1, default: 113 },
  ],
  build(p) {
    return buildKowloonCyberCourtyardParts({
      ...p,
      floors: Math.round(p.floors),
      seed: Math.round(p.seed),
    });
  },
};

// ---- Chinese classical timber hall (殿堂): curved hip roof + dougong ----
const CHINESE_ROOF_TYPES = ["hip", "hipGable", "gable"];
const chineseHall = {
  id: "chinese-hall",
  name: "中式古建·殿堂",
  schema: [
    { key: "baysX", label: "面阔间数", min: 1, max: 9, step: 1, default: 5 },
    { key: "baysZ", label: "进深间数", min: 1, max: 6, step: 1, default: 3 },
    { key: "bayWidth", label: "间广(X)", min: 1.2, max: 3.5, step: 0.1, default: 2.2 },
    { key: "bayDepth", label: "间深(Z)", min: 1.0, max: 3.0, step: 0.1, default: 1.9 },
    { key: "columnHeight", label: "檐柱高", min: 1.8, max: 4.5, step: 0.1, default: 3.0 },
    { key: "columnRadius", label: "柱径", min: 0.1, max: 0.3, step: 0.01, default: 0.16 },
    { key: "baseHeight", label: "台基高", min: 0.3, max: 1.6, step: 0.05, default: 0.7 },
    { key: "eaveOverhang", label: "出檐", min: 0.6, max: 2.2, step: 0.05, default: 1.25 },
    { key: "roofRise", label: "举高比", min: 0.2, max: 0.7, step: 0.02, default: 0.36 },
    { key: "roofConcavity", label: "举架曲度", min: 0, max: 1, step: 0.05, default: 0.55 },
    { key: "cornerUpturn", label: "翼角起翘", min: 0, max: 1.6, step: 0.05, default: 0.7 },
    { key: "roofType", label: "屋顶(0庑殿/1歇山/2硬山)", min: 0, max: 2, step: 1, default: 0 },
    { key: "dougong", label: "斗拱(0关/1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "ridgeBeasts", label: "脊兽(0关/1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "walls", label: "墙与隔扇(0关/1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "seed", label: "变体种子", min: 0, max: 60, step: 1, default: 9 },
  ],
  build(p) {
    return buildChineseHallParts({
      baysX: p.baysX,
      baysZ: p.baysZ,
      bayWidth: p.bayWidth,
      bayDepth: p.bayDepth,
      columnHeight: p.columnHeight,
      columnRadius: p.columnRadius,
      baseHeight: p.baseHeight,
      eaveOverhang: p.eaveOverhang,
      roofRise: p.roofRise,
      roofConcavity: p.roofConcavity,
      cornerUpturn: p.cornerUpturn,
      roof: CHINESE_ROOF_TYPES[Math.round(p.roofType)] || "hip",
      dougong: Math.round(p.dougong) === 1,
      ridgeBeasts: Math.round(p.ridgeBeasts) === 1,
      walls: Math.round(p.walls) === 1,
      seed: p.seed,
    });
  },
};

// ---- procedural city block: grid of seeded building variants ----
const cityBlock = {
  id: "cityblock",
  name: "程序化街区",
  critiqueGoal: "city block settlement",
  schema: [
    { key: "cols", label: "沿街栋数", min: 1, max: 8, step: 1, default: 4 },
    { key: "rows", label: "进深排数", min: 1, max: 5, step: 1, default: 2 },
    { key: "lotX", label: "地块宽", min: 3.5, max: 8, step: 0.1, default: 5.5 },
    { key: "lotZ", label: "地块深", min: 3, max: 8, step: 0.1, default: 4.5 },
    { key: "minFloors", label: "最低层数", min: 1, max: 10, step: 1, default: 3 },
    { key: "maxFloors", label: "最高层数", min: 2, max: 24, step: 1, default: 12 },
    { key: "ground", label: "地面(0关/1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "roads", label: "道路(0关/1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "roadWidth", label: "车行道宽", min: 1.5, max: 6, step: 0.1, default: 3.0 },
    { key: "sidewalkWidth", label: "人行道宽", min: 0.4, max: 2.5, step: 0.1, default: 1.0 },
    { key: "faceStreet", label: "朝街(0关/1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "waterTowers", label: "屋顶水塔比例", min: 0, max: 1, step: 0.05, default: 0.4 },
    { key: "seed", label: "街区种子", min: 0, max: 120, step: 1, default: 11 },
  ],
  build(p) {
    return buildCityBlockParts({
      cols: p.cols,
      rows: p.rows,
      lotX: p.lotX,
      lotZ: p.lotZ,
      minFloors: p.minFloors,
      maxFloors: p.maxFloors,
      ground: Math.round(p.ground) === 1,
      roads: Math.round(p.roads) === 1,
      roadWidth: p.roadWidth,
      sidewalkWidth: p.sidewalkWidth,
      faceStreet: Math.round(p.faceStreet) === 1,
      waterTowers: p.waterTowers,
      seed: p.seed,
    });
  },
};

// ---- large procedural city district: multi-block road network + sidewalk props ----
const cityDistrict = {
  id: "city-district",
  name: "大规模城区",
  schema: [
    { key: "blocksX", label: "横向街坊", min: 1, max: 6, step: 1, default: 5 },
    { key: "blocksZ", label: "纵向街坊", min: 1, max: 5, step: 1, default: 4 },
    { key: "blockX", label: "街坊宽", min: 18, max: 44, step: 1, default: 34 },
    { key: "blockZ", label: "街坊深", min: 16, max: 36, step: 1, default: 26 },
    { key: "streetWidth", label: "街道宽", min: 5, max: 14, step: 0.5, default: 9 },
    { key: "minFloors", label: "最低层数", min: 1, max: 12, step: 1, default: 3 },
    { key: "maxFloors", label: "最高层数", min: 2, max: 20, step: 1, default: 10 },
    { key: "waterTowers", label: "屋顶水塔比例", min: 0, max: 1, step: 0.05, default: 0.35 },
    { key: "streetTrees", label: "行道树(0关/1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "streetFurniture", label: "街具(0关/1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "crosswalks", label: "斑马线(0关/1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "lotJitter", label: "地块偏移", min: 0, max: 0.8, step: 0.02, default: 0.25 },
    { key: "seed", label: "城区种子", min: 0, max: 999, step: 1, default: 42 },
  ],
  build(p) {
    return buildCityDistrictParts({
      blocksX: Math.round(p.blocksX),
      blocksZ: Math.round(p.blocksZ),
      blockX: p.blockX,
      blockZ: p.blockZ,
      streetWidth: p.streetWidth,
      minFloors: Math.round(p.minFloors),
      maxFloors: Math.round(p.maxFloors),
      waterTowers: p.waterTowers,
      streetTrees: Math.round(p.streetTrees) === 1,
      streetFurniture: Math.round(p.streetFurniture) === 1,
      crosswalks: Math.round(p.crosswalks) === 1,
      lotJitter: p.lotJitter,
      seed: Math.round(p.seed),
    });
  },
};

const houdiniHowtosGradationalCrystal = {
  id: "houdini-howtos-gradational-crystal",
  name: "HoudiniHowtos 渐变晶簇",
  critiqueGoal: "faceted transmissive crystal cluster with readable height gradients and seeded composition",
  schema: [
    { key: "sides", label: "晶柱棱数", min: 3, max: 12, step: 1, default: 6 },
    { key: "count", label: "晶柱数量", min: 1, max: 48, step: 1, default: 17 },
    { key: "height", label: "主晶高度", min: 1, max: 7, step: 0.05, default: 3.8 },
    { key: "radius", label: "主晶粗细", min: 0.15, max: 1.2, step: 0.02, default: 0.58 },
    { key: "tipRatio", label: "晶尖比例", min: 0.12, max: 0.62, step: 0.01, default: 0.28 },
    { key: "spread", label: "晶簇展开", min: 0.5, max: 5, step: 0.05, default: 2.5 },
    { key: "lean", label: "伴晶倾斜", min: 0, max: 0.9, step: 0.01, default: 0.34 },
    { key: "twist", label: "切面扭转", min: -1.4, max: 1.4, step: 0.01, default: 0.08 },
    { key: "hueShift", label: "渐变色相", min: 0, max: 360, step: 1, default: 0 },
    { key: "roughness", label: "切面粗糙度", min: 0, max: 0.3, step: 0.005, default: 0.035 },
    { key: "ior", label: "折射率", min: 1, max: 2.6, step: 0.01, default: 2.4 },
    { key: "dispersion", label: "色散", min: 0, max: 8, step: 0.1, default: 4 },
    { key: "seed", label: "随机种子", min: 0, max: 9999, step: 1, default: 145 },
  ],
  build(p) {
    return buildGradationalCrystalParts({
      ...p,
      sides: Math.round(p.sides),
      count: Math.round(p.count),
      seed: Math.round(p.seed),
    });
  },
};

const pcgCartoonHouse = {
  id: "pcg-cartoon-house",
  name: "PCG 卡通小房子",
  category: "风格复刻",
  critiqueGoal: "mint tiled cartoon cottage with cross gables, timber framing, bay windows and chimneys",
  scenePreset: {
    environment: "studio",
    background: { mode: "gradient", color: "#8fb8b1", color2: "#d8ddd2" },
    exposure: 1.05,
    bloom: { enabled: false, strength: 0, radius: 0, threshold: 1 },
    fog: { enabled: false },
    camera: "persp",
    grid: true,
    renderMode: "toon",
    toon: { steps: 4, outline: 0.0025, color: "#342923" },
  },
  assetMeta: {
    description: "参考 UE PCG 模块化建筑视频原创重写：L 形体块、十字山墙、薄荷瓦顶、深棕木构、凸窗与可调烟囱。",
    tags: ["PCG", "卡通房屋", "十字山墙", "木构立面", "程序化建筑"],
    capabilities: ["参数化体块", "种子变体", "语义部件", "程序化 PBR"],
    materialClasses: ["卡通灰泥", "薄荷瓦", "木构", "玻璃", "石材"],
    sourceStudy: "https://www.bilibili.com/video/BV1b3j4zmEkq/",
  },
  schema: [
    { key: "width", label: "房屋宽度", min: 3.6, max: 9, step: 0.1, default: 5.8 },
    { key: "depth", label: "房屋进深", min: 2.8, max: 6.5, step: 0.1, default: 3.8 },
    { key: "wallHeight", label: "墙体高度", min: 1.8, max: 4.2, step: 0.1, default: 2.5 },
    { key: "roofPitch", label: "屋顶坡度", min: 0.35, max: 1.2, step: 0.02, default: 0.78 },
    { key: "wingScale", label: "前翼比例", min: 0.32, max: 0.68, step: 0.02, default: 0.48 },
    { key: "roofRows", label: "瓦片行数", min: 4, max: 16, step: 1, default: 9 },
    { key: "timberDensity", label: "木构密度", min: 0, max: 1, step: 0.05, default: 0.82 },
    { key: "chimneyCount", label: "烟囱数量", min: 0, max: 3, step: 1, default: 2 },
    { key: "windowCount", label: "窗户数量", min: 3, max: 12, step: 1, default: 7 },
    { key: "seed", label: "布局种子", min: 0, max: 999, step: 1, default: 23 },
  ],
  build(p) {
    return buildPcgCartoonHouseParts({
      ...p,
      roofRows: Math.round(p.roofRows),
      chimneyCount: Math.round(p.chimneyCount),
      windowCount: Math.round(p.windowCount),
      seed: Math.round(p.seed),
    });
  },
};

// ---- Houdini planning-study procedural waterwheel ----
const proceduralWaterwheel = {
  id: "procedural-waterwheel",
  name: "程序化水车",
  category: "机械构造",
  critiqueGoal: "coherent timber waterwheel with linked trough, paddles, axle, frame and visible water path",
  assetMeta: {
    description: "按 Houdini 水车规划课拆解：外轮、内轮、轮辐、轮轴、叶板、支架、曲线水槽全部参数联动。",
    tags: ["Houdini", "水车", "程序化机械", "曲线水槽", "参数联动"],
    capabilities: ["轮圈分段", "径向阵列", "弯折叶板", "曲线木槽", "水流示意"],
    materialClasses: ["木材", "铁件", "水体"],
    sourceStudy: "https://www.bilibili.com/video/BV1nwKZ6UECd/",
  },
  schema: [
    { key: "radius", label: "水车半径", min: 1.2, max: 4, step: 0.05, default: 2.35 },
    { key: "wheelWidth", label: "轮体宽度", min: 0.45, max: 1.8, step: 0.05, default: 0.95 },
    { key: "ringThickness", label: "轮圈厚度", min: 0.1, max: 0.5, step: 0.01, default: 0.24 },
    { key: "spokeCount", label: "轮辐数量", min: 4, max: 16, step: 1, default: 8 },
    { key: "paddleCount", label: "叶板数量", min: 8, max: 28, step: 1, default: 16 },
    { key: "paddleLength", label: "叶板伸出", min: 0.2, max: 1, step: 0.02, default: 0.52 },
    { key: "paddleBend", label: "叶板弯折角", min: 0, max: 55, step: 1, default: 25 },
    { key: "wheelAngle", label: "水车旋转角", min: 0, max: 360, step: 1, default: 12 },
    { key: "axleLength", label: "轮轴长度", min: 1.8, max: 5, step: 0.05, default: 2.8 },
    { key: "axleRadius", label: "轮轴粗细", min: 0.06, max: 0.34, step: 0.01, default: 0.16 },
    { key: "troughPlanks", label: "水槽木板数", min: 4, max: 24, step: 1, default: 12 },
    { key: "troughSlope", label: "水槽入口抬升", min: -0.15, max: 0.55, step: 0.01, default: 0.16 },
    { key: "water", label: "显示水流(0/1)", min: 0, max: 1, step: 1, default: 1 },
  ],
  build(p) {
    return buildProceduralWaterwheelParts({
      radius: p.radius,
      wheelWidth: p.wheelWidth,
      ringThickness: p.ringThickness,
      spokeCount: Math.round(p.spokeCount),
      paddleCount: Math.round(p.paddleCount),
      paddleLength: p.paddleLength,
      paddleBend: p.paddleBend * Math.PI / 180,
      wheelAngle: p.wheelAngle * Math.PI / 180,
      axleLength: p.axleLength,
      axleRadius: p.axleRadius,
      troughPlanks: Math.round(p.troughPlanks),
      troughSlope: p.troughSlope,
      water: Math.round(p.water) === 1,
    });
  },
};

// ---- reference-inspired night metropolis: dense skyline + luminous roads ----
export const NIGHT_METROPOLIS_MODEL = {
  id: "night-metropolis",
  name: "夜间都市天际线",
  category: "城市",
  critiqueGoal: "large dense night metropolis skyline with central high-rise cluster, luminous windows, road grid, and distant mountains",
  scenePreset: {
    environment: "night",
    background: { mode: "gradient", color: "#01030a", color2: "#111827" },
    exposure: 0.82,
    bloom: { enabled: true, strength: 0.72, radius: 0.58, threshold: 0.68 },
    fog: { enabled: false, density: 0.0035, height: 18, shaft: 0.08 },
    camera: "city",
    grid: false,
  },
  assetMeta: {
    description: "数百栋中高层建筑组成的夜间都市群，含中心商务区、冷暖窗光、道路灯带与外围远山。",
    tags: ["都市天际线", "夜景", "程序化城市", "摩天楼", "城市群"],
    capabilities: ["确定性布局", "中心高度场", "实例化楼体", "程序化窗光", "夜景渲染预设"],
    materialClasses: ["深色玻璃", "混凝土", "金属", "自发光窗户", "湿地面"],
  },
  schema: [
    { key: "blocksX", label: "横向街坊", min: 3, max: 10, step: 1, default: 8 },
    { key: "blocksZ", label: "纵向街坊", min: 3, max: 9, step: 1, default: 7 },
    { key: "blockSize", label: "街坊尺寸", min: 26, max: 52, step: 1, default: 38 },
    { key: "streetWidth", label: "道路宽度", min: 6, max: 16, step: 0.5, default: 10 },
    { key: "lotsPerBlock", label: "每边地块数", min: 2, max: 4, step: 1, default: 3 },
    { key: "density", label: "建筑密度", min: 0.3, max: 1, step: 0.02, default: 0.82 },
    { key: "minFloors", label: "最低层数", min: 3, max: 18, step: 1, default: 7 },
    { key: "maxFloors", label: "最高层数", min: 18, max: 72, step: 1, default: 48 },
    { key: "centerBoost", label: "中心高度聚集", min: 0.5, max: 1.8, step: 0.05, default: 1.35 },
    { key: "litWindowRatio", label: "亮窗比例", min: 0.1, max: 1, step: 0.02, default: 0.72 },
    { key: "mountains", label: "外围远山(0关/1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "seed", label: "城市种子", min: 0, max: 9999, step: 1, default: 2026 },
  ],
  build(params) {
    return buildNightMetropolisParts({
      ...params,
      blocksX: Math.round(params.blocksX),
      blocksZ: Math.round(params.blocksZ),
      lotsPerBlock: Math.round(params.lotsPerBlock),
      minFloors: Math.round(params.minFloors),
      maxFloors: Math.round(params.maxFloors),
      mountains: Math.round(params.mountains) === 1,
      seed: Math.round(params.seed),
    });
  },
};

// ---- reference-inspired garden metropolis: lake park + villas + skyline ----
export const GARDEN_METROPOLIS_MODEL = {
  id: "garden-metropolis",
  name: "湖畔花园都市群",
  category: "城市与建筑",
  critiqueGoal: "lush daylight metropolis with a central lake, park vegetation, low-rise waterfront villas, and a dense varied high-rise skyline behind them",
  scenePreset: {
    environment: "studio",
    background: { mode: "gradient", color: "#8fc4df", color2: "#d9edf4" },
    exposure: 1.02,
    bloom: { enabled: false, strength: 0.18, radius: 0.3, threshold: 0.9 },
    fog: { enabled: true, density: 0.0015, height: 22, shaft: 0.04 },
    camera: "city",
    grid: false,
  },
  assetMeta: {
    description: "中央景观湖、环湖道路、低密湖畔住宅、大量热带绿化与后景异形高层共同组成的白昼花园都市群。",
    tags: ["都市群", "花园城市", "湖区", "天际线", "住宅", "程序化城市"],
    capabilities: ["确定性分区", "实例化植被", "分层城市天际线", "湖岸构图", "语义分件"],
    materialClasses: ["水体", "草地", "玻璃幕墙", "混凝土", "住宅灰泥", "植被"],
  },
  schema: [
    { key: "width", label: "城区宽度", min: 140, max: 360, step: 5, default: 240 },
    { key: "depth", label: "城区深度", min: 120, max: 300, step: 5, default: 190 },
    { key: "lakeRadiusX", label: "湖泊横向半径", min: 16, max: 64, step: 1, default: 38 },
    { key: "lakeRadiusZ", label: "湖泊纵向半径", min: 10, max: 48, step: 1, default: 25 },
    { key: "villaCount", label: "湖畔住宅数", min: 8, max: 72, step: 1, default: 36 },
    { key: "treeCount", label: "树木数量", min: 80, max: 800, step: 10, default: 420 },
    { key: "skylineCount", label: "高层建筑数", min: 16, max: 100, step: 1, default: 58 },
    { key: "minTowerFloors", label: "最低塔楼层数", min: 5, max: 24, step: 1, default: 10 },
    { key: "maxTowerFloors", label: "最高塔楼层数", min: 24, max: 80, step: 1, default: 52 },
    { key: "floorHeight", label: "塔楼层高", min: 0.9, max: 1.8, step: 0.05, default: 1.28 },
    { key: "seed", label: "城市种子", min: 0, max: 9999, step: 1, default: 1783 },
  ],
  build(params) {
    return buildGardenMetropolisParts({
      ...params,
      villaCount: Math.round(params.villaCount),
      treeCount: Math.round(params.treeCount),
      skylineCount: Math.round(params.skylineCount),
      minTowerFloors: Math.round(params.minTowerFloors),
      maxTowerFloors: Math.round(params.maxTowerFloors),
      seed: Math.round(params.seed),
    });
  },
};

// ---- traditional Roman neighbourhood: courtyard blocks + piazza + narrow stone streets ----
const romanTown = {
  id: "roman-town",
  name: "传统罗马街区",
  category: "城市与建筑",
  assetMeta: {
    description: "暖色风化灰泥街墙、圆拱底商、百叶窗、陶瓦坡屋顶、屋顶露台与玄武岩窄街。",
    tags: ["罗马", "街区", "围合院落", "陶瓦", "Sampietrini", "程序化城市"],
    capabilities: ["立面模块槽", "围合街坊", "种子变体", "语义分件", "程序化PBR"],
    materialClasses: ["风化灰泥", "陶瓦", "玄武岩块石", "木材", "锻铁"],
  },
  schema: [
    { key: "blocksX", label: "横向街坊", min: 1, max: 5, step: 1, default: 3 },
    { key: "blocksZ", label: "纵向街坊", min: 1, max: 5, step: 1, default: 3 },
    { key: "blockSize", label: "街坊尺寸", min: 14, max: 30, step: 0.5, default: 21 },
    { key: "streetWidth", label: "窄街宽度", min: 2.4, max: 7, step: 0.1, default: 4.2 },
    { key: "minFloors", label: "最低层数", min: 2, max: 7, step: 1, default: 4 },
    { key: "maxFloors", label: "最高层数", min: 3, max: 9, step: 1, default: 6 },
    { key: "shopDensity", label: "拱形底商密度", min: 0, max: 1, step: 0.02, default: 0.62 },
    { key: "shutterDensity", label: "百叶窗密度", min: 0, max: 1, step: 0.02, default: 0.72 },
    { key: "balconyDensity", label: "阳台密度", min: 0, max: 1, step: 0.02, default: 0.24 },
    { key: "roofTerraceDensity", label: "屋顶露台比例", min: 0, max: 1, step: 0.02, default: 0.42 },
    { key: "piazza", label: "中心广场(0关/1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "seed", label: "街区种子", min: 0, max: 9999, step: 1, default: 1703 },
  ],
  build(p) {
    return buildRomanTownParts({
      blocksX: Math.round(p.blocksX),
      blocksZ: Math.round(p.blocksZ),
      blockSize: p.blockSize,
      streetWidth: p.streetWidth,
      minFloors: Math.round(p.minFloors),
      maxFloors: Math.round(p.maxFloors),
      shopDensity: p.shopDensity,
      shutterDensity: p.shutterDensity,
      balconyDensity: p.balconyDensity,
      roofTerraceDensity: p.roofTerraceDensity,
      piazza: Math.round(p.piazza) === 1,
      seed: Math.round(p.seed),
    });
  },
};

// ---- road-network district: non-convex parcel slicing + real streets + buildings ----
function roadnetBoundary(size, shape) {
  const sx = size * 1.35;
  const sz = size;
  const mode = Math.round(shape);
  if (mode === 2) {
    return [
      vec3(-sx, 0, -sz), vec3(sx, 0, -sz), vec3(sx, 0, sz),
      vec3(sx * 0.45, 0, sz), vec3(sx * 0.45, 0, -sz * 0.18),
      vec3(-sx * 0.45, 0, -sz * 0.18), vec3(-sx * 0.45, 0, sz),
      vec3(-sx, 0, sz),
    ];
  }
  if (mode === 1) {
    return [
      vec3(-sx, 0, -sz), vec3(sx, 0, -sz), vec3(sx, 0, sz * 0.15),
      vec3(sx * 0.18, 0, sz * 0.15), vec3(sx * 0.18, 0, sz),
      vec3(-sx, 0, sz),
    ];
  }
  return [vec3(-sx, 0, -sz), vec3(sx, 0, -sz), vec3(sx, 0, sz), vec3(-sx, 0, sz)];
}

function roadnetStyleForArea(area, r) {
  if (area > 1500) return r() < 0.5 ? "glassTower" : "corporate";
  if (area > 850) return r() < 0.55 ? "modernOffice" : "artDeco";
  return r() < 0.5 ? "brickWalkup" : "brownstone";
}

function roadnetFootprintsOverlap(a, b, gap = 0.35) {
  const axes = [
    { x: Math.cos(a.yaw), z: -Math.sin(a.yaw) },
    { x: Math.sin(a.yaw), z: Math.cos(a.yaw) },
    { x: Math.cos(b.yaw), z: -Math.sin(b.yaw) },
    { x: Math.sin(b.yaw), z: Math.cos(b.yaw) },
  ];
  const radiusOn = (footprint, axis) => {
    const xAxis = { x: Math.cos(footprint.yaw), z: -Math.sin(footprint.yaw) };
    const zAxis = { x: Math.sin(footprint.yaw), z: Math.cos(footprint.yaw) };
    return footprint.halfWidth * Math.abs(axis.x * xAxis.x + axis.z * xAxis.z) +
      footprint.halfDepth * Math.abs(axis.x * zAxis.x + axis.z * zAxis.z);
  };
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return axes.every((axis) =>
    Math.abs(dx * axis.x + dz * axis.z) < radiusOn(a, axis) + radiusOn(b, axis) + gap,
  );
}

const roadNetworkModel = {
  id: "road-network",
  name: "参数化路网",
  critiqueGoal: "standalone procedural road network",
  schema: [
    { key: "size", label: "地块尺寸", min: 40, max: 150, step: 2, default: 86 },
    { key: "shape", label: "边界形状(0矩形/1L形/2U形)", min: 0, max: 2, step: 1, default: 2 },
    { key: "targetArea", label: "街坊目标面积", min: 420, max: 2600, step: 40, default: 900 },
    { key: "minAreaRatio", label: "碎块过滤", min: 0.05, max: 0.55, step: 0.01, default: 0.26 },
    { key: "streetWidth", label: "主路宽", min: 4, max: 16, step: 0.25, default: 8 },
    { key: "streetTaper", label: "支路递减", min: 0.55, max: 1, step: 0.01, default: 0.84 },
    { key: "sidewalkWidth", label: "人行道宽", min: 0, max: 5, step: 0.1, default: 1.8 },
    { key: "lanes", label: "车道数", min: 2, max: 4, step: 1, default: 2 },
    { key: "jitter", label: "切割偏移", min: 0, max: 0.4, step: 0.01, default: 0.16 },
    { key: "irregularity", label: "不规则停分", min: 0, max: 0.55, step: 0.01, default: 0.1 },
    { key: "roadCurve", label: "道路弯曲", min: 0, max: 10, step: 0.25, default: 2 },
    { key: "roundabouts", label: "环岛(0关/1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "showBlocks", label: "显示地块(0关/1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "seed", label: "路网种子", min: 0, max: 999, step: 1, default: 42 },
  ],
  build(p) {
    const boundary = roadnetBoundary(p.size, p.shape);
    const result = cityBlocks(boundary, {
      targetArea: p.targetArea,
      minArea: Math.max(80, p.targetArea * p.minAreaRatio),
      minPerimeter: Math.max(36, Math.sqrt(p.targetArea) * 1.7),
      streetWidth: p.streetWidth,
      sidewalkWidth: p.sidewalkWidth,
      splitJitter: p.jitter,
      irregularity: p.irregularity,
      blockLift: 0.055,
      groundSlab: true,
      realRoads: true,
      curbs: true,
      laneLines: true,
      edgeLines: true,
      crosswalks: true,
      intersectionPads: true,
      roundabouts: Math.round(p.roundabouts) === 1,
      roundaboutMinArms: 3,
      roadCurveAmount: p.roadCurve,
      streetTaper: p.streetTaper,
      roadLanes: Math.round(p.lanes),
      roadSampleDistance: 1.25,
      seed: Math.round(p.seed),
    });
    const roadParts = result.roadParts;
    const base = Math.round(p.showBlocks) === 1 ? result.baseMesh : ringToPlate(boundary, 0);
    return [
      surfPart("land_and_blocks", base, "concrete", { color: [0.32, 0.38, 0.31], roughness: 0.95 }),
      surfPart("road_asphalt", merge(roadParts.asphaltMesh, roadParts.intersectionMesh, roadParts.roundaboutMesh), "concrete", { color: [0.095, 0.096, 0.105], roughness: 0.94 }),
      surfPart("road_markings", merge(roadParts.markingMesh, roadParts.crosswalkMesh), "ceramic", { color: [0.93, 0.91, 0.78], roughness: 0.48 }),
      surfPart("sidewalks", roadParts.sidewalkMesh, "concrete", { color: [0.56, 0.56, 0.54], roughness: 0.86 }),
      surfPart("curbs", roadParts.curbMesh, "concrete", { color: [0.7, 0.7, 0.67], roughness: 0.78 }),
      surfPart("roundabout_islands", roadParts.islandMesh, "concrete", { color: [0.23, 0.34, 0.18], roughness: 0.95 }),
    ];
  },
};

const roundaboutTraffic = {
  id: "roundabout-traffic",
  name: "参考图复刻·六臂交通环岛",
  critiqueGoal: "reference-style six-arm urban roundabout with complete traffic dressing and vehicles",
  schema: [
    { key: "islandRadius", label: "中央岛半径", min: 8, max: 24, step: 0.5, default: 15 },
    { key: "roadWidth", label: "道路宽度", min: 8, max: 22, step: 0.5, default: 14 },
    { key: "armLength", label: "道路延伸", min: 24, max: 80, step: 2, default: 52 },
    { key: "vehicleCount", label: "载具数量", min: 0, max: 72, step: 1, default: 38 },
    { key: "treeCount", label: "树木数量", min: 0, max: 80, step: 1, default: 32 },
    { key: "streetFurniture", label: "街道设施(0关/1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 178 },
  ],
  build(p) {
    return buildRoundaboutTrafficParts({
      islandRadius: p.islandRadius,
      roadWidth: p.roadWidth,
      armLength: p.armLength,
      vehicleCount: Math.round(p.vehicleCount),
      treeCount: Math.round(p.treeCount),
      streetFurniture: Math.round(p.streetFurniture) === 1,
      seed: Math.round(p.seed),
    });
  },
};

const dualGridFarm = {
  id: "dual-grid-farm",
  name: "双网格农场",
  critiqueGoal: "stylized farming scene built from editable dual-grid terrain layers",
  schema: [
    { key: "cells", label: "地形网格", min: 10, max: 30, step: 1, default: 18 },
    { key: "tileSize", label: "地块尺寸", min: 0.6, max: 1.8, step: 0.1, default: 1 },
    { key: "edgeResolution", label: "圆角精度", min: 1, max: 10, step: 1, default: 6 },
    { key: "grassHeight", label: "草地层高", min: 0.05, max: 0.5, step: 0.01, default: 0.2 },
    { key: "cropDensity", label: "作物密度", min: 0, max: 1, step: 0.05, default: 0.8 },
    { key: "treeCount", label: "果树数量", min: 0, max: 10, step: 1, default: 7 },
    { key: "seed", label: "场景种子", min: 0, max: 999999, step: 1, default: 2024 },
  ],
  build(p) {
    return buildDualGridFarmParts({
      cells: Math.round(p.cells),
      tileSize: p.tileSize,
      edgeResolution: Math.round(p.edgeResolution),
      grassHeight: p.grassHeight,
      cropDensity: p.cropDensity,
      treeCount: Math.round(p.treeCount),
      seed: Math.round(p.seed),
    });
  },
};

function makeDualGridSceneModel(id, name, critiqueGoal, seed, buildParts) {
  return {
    id,
    name,
    critiqueGoal,
    schema: [
      { key: "cells", label: "地形网格", min: 12, max: 32, step: 1, default: 20 },
      { key: "tileSize", label: "地块尺寸", min: 0.5, max: 2, step: 0.1, default: 1 },
      { key: "edgeResolution", label: "圆角精度", min: 1, max: 12, step: 1, default: 6 },
      { key: "layerHeight", label: "地表层高", min: 0.06, max: 0.6, step: 0.01, default: 0.22 },
      { key: "propDensity", label: "场景密度", min: 0.2, max: 1, step: 0.05, default: 0.72 },
      { key: "seed", label: "场景种子", min: 0, max: 999999, step: 1, default: seed },
    ],
    build(p) {
      return buildParts({
        cells: Math.round(p.cells),
        tileSize: p.tileSize,
        edgeResolution: Math.round(p.edgeResolution),
        layerHeight: p.layerHeight,
        propDensity: p.propDensity,
        seed: Math.round(p.seed),
      });
    },
  };
}

const dualGridForestCamp = makeDualGridSceneModel(
  "dual-grid-forest-camp",
  "双网格·林间营地",
  "rounded dual-grid forest clearing with tents, campfire and conifer ring",
  4821,
  buildDualGridForestCampParts,
);

const dualGridRiverMill = makeDualGridSceneModel(
  "dual-grid-river-mill",
  "双网格·河岸水磨",
  "winding dual-grid river crossed by a timber bridge beside a working watermill",
  7314,
  buildDualGridRiverMillParts,
);

const dualGridHillShrine = makeDualGridSceneModel(
  "dual-grid-hill-shrine",
  "双网格·山顶神社",
  "layered dual-grid hill path framed by torii gates, lanterns and a hilltop shrine",
  2206,
  buildDualGridHillShrineParts,
);

const dualGridMarshRuins = makeDualGridSceneModel(
  "dual-grid-marsh-ruins",
  "双网格·沼泽遗迹",
  "fragmented dual-grid wetlands with boardwalk, reeds and ancient stone ruins",
  9091,
  buildDualGridMarshRuinsParts,
);

const riceField = {
  id: "rice-field",
  name: "程序化稻田",
  critiqueGoal: "tropical procedural rice paddies with irregular terraces, irrigation water, planted rows and palms",
  schema: [
    { key: "columns", label: "田块列数", min: 2, max: 9, step: 1, default: 6 },
    { key: "rows", label: "田块行数", min: 2, max: 9, step: 1, default: 5 },
    { key: "plotSize", label: "田块尺寸", min: 2, max: 8, step: 0.1, default: 4.2 },
    { key: "channelWidth", label: "水渠宽度", min: 0.1, max: 1.2, step: 0.02, default: 0.42 },
    { key: "terraceHeight", label: "梯田层高", min: 0, max: 0.8, step: 0.02, default: 0.18 },
    { key: "irregularity", label: "边界不规则度", min: 0, max: 0.7, step: 0.01, default: 0.28 },
    { key: "coverage", label: "田块覆盖率", min: 0.45, max: 1, step: 0.01, default: 0.9 },
    { key: "riceDensity", label: "插秧密度", min: 2, max: 14, step: 1, default: 9 },
    { key: "riceHeight", label: "稻株高度", min: 0.25, max: 1.5, step: 0.02, default: 0.72 },
    { key: "maturity", label: "成熟比例", min: 0, max: 1, step: 0.01, default: 0.38 },
    { key: "flooded", label: "水田积水", min: 0, max: 1, step: 0.01, default: 0.68 },
    { key: "palmCount", label: "椰树数量", min: 0, max: 24, step: 1, default: 9 },
    { key: "seed", label: "场景种子", min: 0, max: 999999, step: 1, default: 2026 },
  ],
  build(p) {
    return buildRiceFieldParts({
      columns: Math.round(p.columns),
      rows: Math.round(p.rows),
      plotSize: p.plotSize,
      channelWidth: p.channelWidth,
      terraceHeight: p.terraceHeight,
      irregularity: p.irregularity,
      coverage: p.coverage,
      riceDensity: Math.round(p.riceDensity),
      riceHeight: p.riceHeight,
      maturity: p.maturity,
      flooded: p.flooded,
      palmCount: Math.round(p.palmCount),
      seed: Math.round(p.seed),
    });
  },
};

// ---- live procedural game map: roads -> zones -> gameplay dressing ----
const proceduralGameMap = {
  id: "procedural-game-map",
  name: "程序化游戏地图",
  critiqueGoal: "live procedural gameplay map with roads, zones, spawns and cover",
  schema: [
    { key: "size", label: "地图尺寸", min: 90, max: 280, step: 5, default: 180 },
    { key: "boundarySides", label: "边界分段", min: 8, max: 24, step: 1, default: 14 },
    { key: "boundaryJitter", label: "边界不规则度", min: 0, max: 0.35, step: 0.01, default: 0.16 },
    { key: "targetBlockArea", label: "街区目标面积", min: 420, max: 2400, step: 40, default: 950 },
    { key: "minBlockArea", label: "最小街区面积", min: 80, max: 700, step: 20, default: 280 },
    { key: "streetWidth", label: "主路宽度", min: 4, max: 16, step: 0.25, default: 8.5 },
    { key: "streetTaper", label: "支路宽度递减", min: 0.55, max: 1, step: 0.01, default: 0.84 },
    { key: "roadCurveAmount", label: "道路弯曲", min: 0, max: 8, step: 0.25, default: 2.4 },
    { key: "maxBuildings", label: "建筑街区上限", min: 0, max: 70, step: 1, default: 34 },
    { key: "propDensity", label: "玩法道具密度", min: 0, max: 1, step: 0.05, default: 0.8 },
    { key: "gameplayMarkers", label: "出生点/控制点/掩体(0关/1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "streetProps", label: "街道设施(0关/1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "seed", label: "地图种子", min: 0, max: 999999, step: 1, default: 91 },
  ],
  build(p) {
    return buildProceduralGameMapParts({
      size: p.size,
      boundarySides: Math.round(p.boundarySides),
      boundaryJitter: p.boundaryJitter,
      targetBlockArea: p.targetBlockArea,
      minBlockArea: p.minBlockArea,
      streetWidth: p.streetWidth,
      streetTaper: p.streetTaper,
      roadCurveAmount: p.roadCurveAmount,
      maxBuildings: Math.round(p.maxBuildings),
      propDensity: p.propDensity,
      gameplayMarkers: Math.round(p.gameplayMarkers) === 1,
      streetProps: Math.round(p.streetProps) === 1,
      seed: Math.round(p.seed),
    });
  },
};

const cityDistrictRoadnet = {
  id: "city-district-roadnet",
  name: "路网城区·非凸街区",
  critiqueGoal: "procedural road network district",
  schema: [
    { key: "size", label: "地块尺寸", min: 50, max: 130, step: 2, default: 86 },
    { key: "shape", label: "地块形状(0矩形/1L形/2U形)", min: 0, max: 2, step: 1, default: 1 },
    { key: "targetArea", label: "街坊目标面积", min: 550, max: 2200, step: 50, default: 1150 },
    { key: "streetWidth", label: "道路宽", min: 5, max: 14, step: 0.5, default: 8.5 },
    { key: "sidewalkWidth", label: "人行道宽", min: 0, max: 4, step: 0.2, default: 1.8 },
    { key: "jitter", label: "切割偏移", min: 0, max: 0.35, step: 0.01, default: 0.15 },
    { key: "irregularity", label: "不规则停分", min: 0, max: 0.45, step: 0.01, default: 0.12 },
    { key: "roadCurve", label: "道路弯曲", min: 0, max: 8, step: 0.25, default: 1.75 },
    { key: "roundabouts", label: "环岛(0关/1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "buildings", label: "建筑上限", min: 0, max: 60, step: 1, default: 26 },
    { key: "heightScale", label: "楼高倍率", min: 0.4, max: 1.4, step: 0.05, default: 0.72 },
    { key: "seed", label: "路网种子", min: 0, max: 999, step: 1, default: 42 },
  ],
  build(p) {
    const boundary = roadnetBoundary(p.size, p.shape);
    const result = cityBlocks(boundary, {
      targetArea: p.targetArea,
      minArea: Math.max(220, p.targetArea * 0.28),
      minPerimeter: 55,
      streetWidth: p.streetWidth,
      sidewalkWidth: p.sidewalkWidth,
      splitJitter: p.jitter,
      irregularity: p.irregularity,
      blockLift: 0.055,
      realRoads: true,
      roundabouts: Math.round(p.roundabouts) === 1,
      roadCurveAmount: p.roadCurve,
      streetTaper: 0.86,
      roadLanes: 2,
      roadSampleDistance: 1.4,
      seed: Math.round(p.seed),
    });
    const { blocks, insetRings, roadParts, baseMesh } = result;
    const parts = [
      surfPart("ground_blocks", baseMesh, "concrete", { color: [0.34, 0.39, 0.32], roughness: 0.95 }),
      surfPart("road_asphalt", merge(roadParts.asphaltMesh, roadParts.intersectionMesh, roadParts.roundaboutMesh), "concrete", { color: [0.1, 0.1, 0.11], roughness: 0.92 }),
      surfPart("road_markings", merge(roadParts.markingMesh, roadParts.crosswalkMesh), "ceramic", { color: [0.92, 0.9, 0.78], roughness: 0.55 }),
      surfPart("sidewalks", roadParts.sidewalkMesh, "concrete", { color: [0.54, 0.54, 0.52], roughness: 0.86 }),
      surfPart("curbs", roadParts.curbMesh, "concrete", { color: [0.68, 0.68, 0.66], roughness: 0.78 }),
      surfPart("roundabout_islands", roadParts.islandMesh, "concrete", { color: [0.24, 0.34, 0.18], roughness: 0.95 }),
    ];

    const rng = makeRng((Math.round(p.seed) ^ 0x6d2b79f5) >>> 0);
    const order = blocks.map((block, i) => ({ block, inset: insetRings[i], i }))
      .filter((item) => item.inset)
      .sort((a, b) => b.block.area - a.block.area)
      .slice(0, Math.round(p.buildings));
    const placedBuildings = [];
    for (let rank = 0; rank < order.length; rank++) {
      const { block, inset, i } = order[rank];
      const r = rng.fork();
      const obb = parcelOBB(inset);
      const style = roadnetStyleForArea(block.area, () => r.next());
      const tower = block.area > 1500;
      const mid = block.area > 850;
      const floors = Math.max(2, Math.round((tower ? r.range(18, 30) : mid ? r.range(8, 15) : r.range(3, 6)) * p.heightScale));
      const footprint = tower ? r.range(0.46, 0.6) : mid ? r.range(0.58, 0.74) : r.range(0.74, 0.88);
      const width = Math.max(3.5, obb.extU * footprint);
      const depth = Math.max(3.5, obb.extV * footprint);
      const c = polygonCentroidXZ(inset);
      const placed = { x: c.x, z: c.z, halfWidth: width / 2, halfDepth: depth / 2, yaw: obb.angleY };
      if (placedBuildings.some((other) => roadnetFootprintsOverlap(placed, other))) continue;
      placedBuildings.push(placed);
      const bParts = buildUrbanBuildingParts({
        style,
        width,
        depth,
        floors,
        baysX: 2,
        baysZ: 2,
        seed: 1000 + i,
      });
      for (const bp of bParts) {
        parts.push({
          ...bp,
          name: `roadnet_${rank}_${bp.name}`,
          mesh: transform(bp.mesh, { rotate: vec3(0, obb.angleY, 0), translate: vec3(c.x, 0, c.z) }),
        });
      }
    }
    return parts;
  },
};

// ---- CityGen-style road growth: heat-map roads + snap constraints + roadside buildings ----
function citygenSchema(preset, includeBuildings) {
  const d = CITYGEN_DEFAULTS[preset];
  const controls = [
    { key: "radius", label: "城市半径", min: 48, max: 150, step: 2, default: d.radius },
    { key: "segmentLimit", label: "道路段数", min: 24, max: 260, step: 4, default: d.segmentLimit },
    { key: "branchProbability", label: "支路概率", min: 0.05, max: 0.8, step: 0.01, default: d.branchProbability },
    { key: "snapDistance", label: "道路吸附", min: 1, max: 12, step: 0.2, default: d.snapDistance },
    { key: "populationThreshold", label: "热力阈值", min: 0.04, max: 0.45, step: 0.01, default: d.populationThreshold },
  ];
  if (includeBuildings) {
    controls.push(
      { key: "buildings", label: "建筑数量", min: 0, max: 120, step: 2, default: d.buildings },
      { key: "heightScale", label: "楼高倍率", min: 0.35, max: 1.6, step: 0.05, default: d.heightScale },
      { key: "streetProps", label: "街具(0关/1开)", min: 0, max: 1, step: 1, default: d.streetProps ? 1 : 0 },
    );
  }
  controls.push({ key: "seed", label: "生成种子", min: 0, max: 999, step: 1, default: d.seed });
  return controls;
}

function makeCitygenModel(id, name, preset, includeBuildings) {
  return {
    id,
    name,
    critiqueGoal: includeBuildings ? "procedural city road growth settlement" : "standalone procedural road network",
    schema: citygenSchema(preset, includeBuildings),
    build(p) {
      const d = CITYGEN_DEFAULTS[preset];
      return buildCitygenParts({
        preset,
        radius: p.radius,
        segmentLimit: Math.round(p.segmentLimit),
        branchProbability: p.branchProbability,
        snapDistance: p.snapDistance,
        populationThreshold: p.populationThreshold,
        buildings: includeBuildings ? Math.round(p.buildings) : 0,
        heightScale: includeBuildings ? p.heightScale : d.heightScale,
        streetProps: includeBuildings ? Math.round(p.streetProps) === 1 : false,
        seed: Math.round(p.seed),
      });
    },
  };
}

const citygenRoadGrowth = makeCitygenModel("citygen-road-growth", "CityGen复刻·道路生长", "roadGrowth", false);
const citygenResidential = makeCitygenModel("citygen-residential", "CityGen复刻·住宅街区", "residential", true);
const citygenDowntown = makeCitygenModel("citygen-downtown", "CityGen复刻·核心城区", "downtown", true);

const watabouCity = {
  id: "watabou-city",
  name: "Watabou复刻·河谷城市数据",
  critiqueGoal: "Watabou Bridge UE PCG data visualization with S-river, roads, fields, trees and settlement footprints",
  schema: [
    { key: "size", label: "地图尺寸", min: 100, max: 320, step: 5, default: WATABOU_CITY_DEFAULTS.size },
    { key: "riverWidth", label: "河道宽度", min: 8, max: 34, step: 0.5, default: WATABOU_CITY_DEFAULTS.riverWidth },
    { key: "roadDensity", label: "道路密度", min: 0.2, max: 1.5, step: 0.05, default: WATABOU_CITY_DEFAULTS.roadDensity },
    { key: "fieldDensity", label: "农田密度", min: 0, max: 1.5, step: 0.05, default: WATABOU_CITY_DEFAULTS.fieldDensity },
    { key: "treeDensity", label: "树群密度", min: 0, max: 1.5, step: 0.05, default: WATABOU_CITY_DEFAULTS.treeDensity },
    { key: "rockDensity", label: "河岸岩石", min: 0, max: 1.5, step: 0.05, default: WATABOU_CITY_DEFAULTS.rockDensity },
    { key: "buildingDensity", label: "聚落密度", min: 0, max: 1.5, step: 0.05, default: WATABOU_CITY_DEFAULTS.buildingDensity },
    { key: "seed", label: "随机种子", min: 0, max: 999999, step: 1, default: WATABOU_CITY_DEFAULTS.seed },
  ],
  build(p) {
    return buildWatabouCityParts({
      size: p.size,
      riverWidth: p.riverWidth,
      roadDensity: p.roadDensity,
      fieldDensity: p.fieldDensity,
      treeDensity: p.treeDensity,
      rockDensity: p.rockDensity,
      buildingDensity: p.buildingDensity,
      seed: Math.round(p.seed),
    });
  },
};

// ---- procedural streetscene: modular street-furniture kit scattered along a road ----
const streetscene = {
  id: "streetscene",
  name: "程序化街景",
  schema: [
    { key: "length", label: "街段长度", min: 8, max: 48, step: 1, default: 26 },
    { key: "roadHalfWidth", label: "车道半宽", min: 1.5, max: 6, step: 0.1, default: 3.2 },
    { key: "sidewalkWidth", label: "人行道宽", min: 0.8, max: 4, step: 0.1, default: 2.0 },
    { key: "spacing", label: "布设间距", min: 1.5, max: 6, step: 0.1, default: 3.0 },
    { key: "jitter", label: "位置抖动", min: 0, max: 0.8, step: 0.05, default: 0.35 },
    { key: "bothSides", label: "双侧(0关/1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "ground", label: "地面(0关/1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "gantries", label: "跨街龙门牌数", min: 0, max: 4, step: 1, default: 1 },
    { key: "materialStacks", label: "施工料堆数", min: 0, max: 5, step: 1, default: 1 },
    { key: "coneRun", label: "施工锥线(0关/1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "workZones", label: "围挡施工区数", min: 0, max: 3, step: 1, default: 1 },
    { key: "seed", label: "街景种子", min: 0, max: 120, step: 1, default: 21 },
  ],
  build(p) {
    return buildStreetsceneParts({
      length: p.length,
      roadHalfWidth: p.roadHalfWidth,
      sidewalkWidth: p.sidewalkWidth,
      spacing: p.spacing,
      jitter: p.jitter,
      bothSides: Math.round(p.bothSides) === 1,
      ground: Math.round(p.ground) === 1,
      gantries: Math.round(p.gantries),
      materialStacks: Math.round(p.materialStacks),
      coneRun: Math.round(p.coneRun) === 1,
      workZones: Math.round(p.workZones),
      seed: p.seed,
    });
  },
};

// ---- procedural interior: furnished room + articulated door/drawers ----
const interiorRoom = {
  id: "interior-room",
  name: "程序化室内房间",
  schema: [
    { key: "width", label: "房间宽度", min: 4, max: 10, step: 0.1, default: 7 },
    { key: "depth", label: "房间进深", min: 3.5, max: 8, step: 0.1, default: 5.2 },
    { key: "wallHeight", label: "墙高", min: 2.2, max: 4.2, step: 0.05, default: 3 },
    { key: "furnitureScale", label: "家具尺度", min: 0.7, max: 1.4, step: 0.02, default: 1 },
    { key: "chairs", label: "椅子数量", min: 0, max: 8, step: 1, default: 4 },
    { key: "shelves", label: "书架层数", min: 1, max: 7, step: 1, default: 4 },
    { key: "clutter", label: "小物件数量", min: 0, max: 40, step: 1, default: 14 },
    { key: "doorOpen", label: "门开启", min: 0, max: 1, step: 0.01, default: 0.35 },
    { key: "drawerOpen", label: "抽屉开启", min: 0, max: 1, step: 0.01, default: 0.25 },
    { key: "seed", label: "布局种子", min: 0, max: 120, step: 1, default: 23 },
  ],
  build(p) {
    return buildInteriorRoomParts({
      width: p.width,
      depth: p.depth,
      wallHeight: p.wallHeight,
      furnitureScale: p.furnitureScale,
      chairs: p.chairs,
      shelves: p.shelves,
      clutter: p.clutter,
      doorOpen: p.doorOpen,
      drawerOpen: p.drawerOpen,
      seed: p.seed,
    });
  },
};

// ---- integrated procedural building: one grammar for shell and interiors ----
const proceduralBuilding = {
  id: "procedural-building",
  name: "程序化建筑·室内外一体",
  critiqueGoal: "integrated procedural building with exterior, rooms, stairs, roof and fitted furniture",
  schema: [
    { key: "width", label: "建筑宽度", min: 7, max: 24, step: 0.25, default: 13.5 },
    { key: "depth", label: "建筑进深", min: 6, max: 18, step: 0.25, default: 9.5 },
    { key: "footprintShape", label: "轮廓(0矩形/1L形)", min: 0, max: 1, step: 1, default: 0 },
    { key: "floors", label: "楼层数量", min: 1, max: 8, step: 1, default: 4 },
    { key: "floorHeight", label: "层高", min: 2.4, max: 4.2, step: 0.05, default: 3 },
    { key: "facadeModule", label: "立面模数", min: 1.4, max: 4, step: 0.05, default: 2.3 },
    { key: "roomColumns", label: "每侧房间列数", min: 1, max: 6, step: 1, default: 3 },
    { key: "corridorWidth", label: "走廊宽度", min: 1.1, max: 2.8, step: 0.05, default: 1.65 },
    { key: "roofStyle", label: "屋顶(0平/1双坡/2四坡)", min: 0, max: 2, step: 1, default: 1 },
    { key: "furnitureDensity", label: "家具密度", min: 0, max: 1, step: 0.05, default: 0.88 },
    { key: "exteriorDetails", label: "外饰", type: "toggle", min: 0, max: 1, step: 1, default: 1 },
    { key: "revealInterior", label: "剖切室内", type: "toggle", min: 0, max: 1, step: 1, default: 0 },
    { key: "seed", label: "生成种子", min: 0, max: 999, step: 1, default: 41 },
  ],
  build(p) {
    const roofStyles = ["flat", "gable", "hip"];
    return buildProceduralBuildingParts({
      width: p.width,
      depth: p.depth,
      footprintShape: Math.round(p.footprintShape) === 1 ? "lShape" : "rectangle",
      floors: Math.round(p.floors),
      floorHeight: p.floorHeight,
      facadeModule: p.facadeModule,
      roomColumns: Math.round(p.roomColumns),
      corridorWidth: p.corridorWidth,
      roofStyle: roofStyles[Math.max(0, Math.min(2, Math.round(p.roofStyle)))],
      furnitureDensity: p.furnitureDensity,
      exteriorDetails: Math.round(p.exteriorDetails) === 1,
      revealInterior: Math.round(p.revealInterior) === 1,
      seed: Math.round(p.seed),
    });
  },
};

// ---- hard-surface kit: chassis + paneling + vents + greebles ----
const hardSurfaceKit = {
  id: "hard-surface-kit",
  name: "硬表面工业设备",
  schema: [
    { key: "width", label: "主体宽度", min: 1.8, max: 5, step: 0.05, default: 3 },
    { key: "height", label: "主体高度", min: 0.7, max: 2.2, step: 0.05, default: 1.25 },
    { key: "depth", label: "主体进深", min: 1, max: 3.5, step: 0.05, default: 2 },
    { key: "bevel", label: "倒角宽度", min: 0.01, max: 0.22, step: 0.005, default: 0.08 },
    { key: "panelCols", label: "面板列数", min: 1, max: 8, step: 1, default: 3 },
    { key: "panelRows", label: "面板行数", min: 1, max: 6, step: 1, default: 2 },
    { key: "ventCols", label: "散热列数", min: 1, max: 8, step: 1, default: 3 },
    { key: "ventRows", label: "散热行数", min: 1, max: 10, step: 1, default: 5 },
    { key: "bolts", label: "螺丝数量", min: 0, max: 40, step: 1, default: 14 },
    { key: "pipes", label: "管线数量", min: 0, max: 10, step: 1, default: 4 },
    { key: "greebles", label: "细节块数量", min: 0, max: 80, step: 1, default: 24 },
    { key: "seed", label: "变体种子", min: 0, max: 120, step: 1, default: 31 },
  ],
  build(p) {
    return buildHardSurfaceKitParts({
      width: p.width,
      height: p.height,
      depth: p.depth,
      bevel: p.bevel,
      panelCols: p.panelCols,
      panelRows: p.panelRows,
      ventCols: p.ventCols,
      ventRows: p.ventRows,
      bolts: p.bolts,
      pipes: p.pipes,
      greebles: p.greebles,
      seed: p.seed,
    });
  },
};

// ---- terrain island: heightfield + river + cliffs + scatter ----
const terrainIsland = {
  id: "terrain-island",
  name: "程序化岛屿地貌",
  schema: [
    { key: "size", label: "地貌尺寸", min: 5, max: 16, step: 0.2, default: 10 },
    { key: "resolution", label: "网格密度", min: 16, max: 120, step: 8, default: 64 },
    { key: "height", label: "山体高度", min: 0.4, max: 4, step: 0.05, default: 2.2 },
    { key: "noiseScale", label: "噪声频率", min: 0.4, max: 3.5, step: 0.05, default: 1.25 },
    { key: "islandFalloff", label: "海岸收边", min: 0.6, max: 3, step: 0.05, default: 1.55 },
    { key: "seaLevel", label: "海平面", min: -0.4, max: 0.8, step: 0.02, default: 0.05 },
    { key: "riverWidth", label: "河道宽度", min: 0.08, max: 1.2, step: 0.02, default: 0.46 },
    { key: "riverDepth", label: "河道下切", min: 0, max: 1.4, step: 0.02, default: 0.55 },
    { key: "cliffStrength", label: "悬崖强度", min: 0, max: 1.4, step: 0.02, default: 0.65 },
    { key: "rocks", label: "岩石数量", min: 0, max: 120, step: 1, default: 26 },
    { key: "trees", label: "树丛数量", min: 0, max: 180, step: 1, default: 52 },
    { key: "seed", label: "地貌种子", min: 0, max: 160, step: 1, default: 43 },
  ],
  build(p) {
    return buildTerrainIslandParts({
      size: p.size,
      resolution: p.resolution,
      height: p.height,
      noiseScale: p.noiseScale,
      islandFalloff: p.islandFalloff,
      seaLevel: p.seaLevel,
      riverWidth: p.riverWidth,
      riverDepth: p.riverDepth,
      cliffStrength: p.cliffStrength,
      rocks: p.rocks,
      trees: p.trees,
      seed: p.seed,
    });
  },
};

const lunarCraterSurface = {
  id: "lunar-crater-surface",
  name: "月球陨石坑表面",
  category: "地形",
  critiqueGoal: "Moon-like crater field with readable bowls, raised broken rims, ejecta and multi-scale surface detail",
  assetMeta: {
    description: "复刻 BV18QZWYBEYr：分层散布大小陨石坑，噪声破坏坑缘，并叠加喷射纹与微地形。",
    tags: ["月球", "陨石坑", "高度场", "Houdini复刻"],
    capabilities: ["种子复现", "大小坑分层", "坑缘破碎", "实时参数化"],
    materialClasses: ["月壤", "岩石"],
  },
  schema: [
    { key: "size", label: "地形尺寸", min: 60, max: 220, step: 5, default: 120 },
    { key: "resolution", label: "网格分辨率", min: 48, max: 220, step: 8, default: 160 },
    { key: "largeCraters", label: "大型陨石坑", min: 1, max: 60, step: 1, default: 18 },
    { key: "smallCraters", label: "次级陨石坑", min: 0, max: 500, step: 10, default: 240 },
    { key: "relief", label: "坑体起伏", min: 0.25, max: 2.2, step: 0.05, default: 1 },
    { key: "rimSharpness", label: "坑缘锐度", min: 0, max: 1, step: 0.02, default: 0.72 },
    { key: "irregularity", label: "坑缘破碎", min: 0, max: 0.65, step: 0.01, default: 0.14 },
    { key: "roughness", label: "月壤粗糙度", min: 0, max: 1.8, step: 0.05, default: 0.65 },
    { key: "seed", label: "地形种子", min: 0, max: 9999, step: 1, default: 2025 },
  ],
  build(p) {
    return buildLunarCraterSurfaceParts(p);
  },
};

const proceduralPlanet = {
  id: "procedural-planet",
  name: "程序化星球",
  category: "地形",
  critiqueGoal: "Earth-like procedural planet with readable continents, oceans, mountain ranges, polar snow and atmosphere",
  assetMeta: {
    description: "复刻 Sebastian Lague Solar System Episode 02：均匀球面、分形大陆、山脉遮罩、独立海洋与大气层。",
    tags: ["星球", "大陆", "海洋", "山脉", "Sebastian Lague"],
    capabilities: ["种子复现", "球面无接缝噪声", "参数化海陆", "纬度生态着色"],
    materialClasses: ["地表", "海洋", "大气"],
  },
  schema: [
    { key: "radius", label: "星球半径", min: 2, max: 8, step: 0.1, default: 4 },
    { key: "subdivisions", label: "球面细分", min: 2, max: 5, step: 1, default: 5 },
    { key: "continentScale", label: "大陆尺度", min: 0.45, max: 4, step: 0.05, default: 1.2 },
    { key: "continentBias", label: "陆地占比", min: -0.35, max: 0.3, step: 0.01, default: 0.055 },
    { key: "continentHeight", label: "大陆起伏", min: 0, max: 1.8, step: 0.02, default: 0.45 },
    { key: "oceanDepth", label: "海洋深度", min: 0, max: 1.5, step: 0.02, default: 0.34 },
    { key: "oceanFloor", label: "海床下限", min: 0.05, max: 0.7, step: 0.01, default: 0.32 },
    { key: "mountainScale", label: "山脉密度", min: 1, max: 12, step: 0.1, default: 4.2 },
    { key: "mountainHeight", label: "山脉高度", min: 0, max: 1.6, step: 0.02, default: 0.28 },
    { key: "roughness", label: "地表细节", min: 0, max: 0.25, step: 0.005, default: 0.04 },
    { key: "oceanLevel", label: "海平面", min: -0.35, max: 0.35, step: 0.01, default: 0 },
    { key: "snowLine", label: "极地雪线", min: 0.35, max: 0.95, step: 0.01, default: 0.72 },
    { key: "atmosphere", label: "大气厚度", min: 0, max: 0.4, step: 0.01, default: 0.12 },
    { key: "seed", label: "星球种子", min: 0, max: 9999, step: 1, default: 42 },
  ],
  build(params) {
    return buildProceduralPlanetParts(params);
  },
};

const townscaperHarbour = {
  id: "townscaper-harbour",
  name: "Townscaper灵感·彩色港湾",
  category: "建筑与城市",
  critiqueGoal: "Townscaper-inspired organic quad-grid harbour with adjacency-driven roofs, arches, bridges and animated water",
  assetMeta: {
    description: "有机四边网格驱动的彩色港湾。高度、密度、运河改变后，墙体、屋顶、窗、拱券、连廊和临水支柱自动重算。",
    tags: ["Townscaper", "有机网格", "邻接规则", "彩色港湾", "程序化水体"],
    capabilities: ["种子复现", "参数化占用", "自动屋顶", "自动拱桥", "动态水体"],
    materialClasses: ["彩色灰泥", "陶瓦", "玻璃", "木材", "水体"],
  },
  schema: [
    { key: "gridSize", label: "有机网格规模", min: 7, max: 22, step: 1, default: TOWNSCAPER_DEFAULTS.gridSize },
    { key: "cellSize", label: "街区单元尺寸", min: 1.4, max: 4, step: 0.1, default: TOWNSCAPER_DEFAULTS.cellSize },
    { key: "density", label: "城镇覆盖密度", min: 0.28, max: 0.96, step: 0.02, default: TOWNSCAPER_DEFAULTS.density },
    { key: "maxFloors", label: "最高楼层", min: 2, max: 10, step: 1, default: TOWNSCAPER_DEFAULTS.maxFloors },
    { key: "floorHeight", label: "单层高度", min: 1.1, max: 2.4, step: 0.05, default: TOWNSCAPER_DEFAULTS.floorHeight },
    { key: "irregularity", label: "网格有机扭曲", min: 0, max: 1, step: 0.02, default: TOWNSCAPER_DEFAULTS.irregularity },
    { key: "canalWidth", label: "蜿蜒运河宽度", min: 0, max: 1.35, step: 0.05, default: TOWNSCAPER_DEFAULTS.canalWidth },
    { key: "archDensity", label: "拱券与连廊概率", min: 0, max: 1, step: 0.02, default: TOWNSCAPER_DEFAULTS.archDensity },
    { key: "roofPitch", label: "陶瓦屋顶坡高", min: 0.1, max: 1.1, step: 0.02, default: TOWNSCAPER_DEFAULTS.roofPitch },
    { key: "palette", label: "建筑色板(0海港/1北海/2地中海)", min: 0, max: 2, step: 1, default: TOWNSCAPER_DEFAULTS.palette },
    { key: "waveHeight", label: "港湾波浪高度", min: 0.01, max: 0.2, step: 0.005, default: TOWNSCAPER_DEFAULTS.waveHeight },
    { key: "seed", label: "生成种子", min: 0, max: 999999, step: 1, default: TOWNSCAPER_DEFAULTS.seed },
  ],
  build(p) {
    return buildTownscaperParts({
      gridSize: Math.round(p.gridSize),
      cellSize: p.cellSize,
      density: p.density,
      maxFloors: Math.round(p.maxFloors),
      floorHeight: p.floorHeight,
      irregularity: p.irregularity,
      canalWidth: p.canalWidth,
      archDensity: p.archDensity,
      roofPitch: p.roofPitch,
      palette: Math.round(p.palette),
      waveHeight: p.waveHeight,
      seed: Math.round(p.seed),
    });
  },
};

const chineseTownscaper = {
  id: "chinese-townscaper",
  name: "中式城镇叠叠乐·重檐岛",
  category: "建筑与城市",
  critiqueGoal: "Chinese Townscaper island with adjacency-driven timber halls, double eaves, curved roofs and canals",
  assetMeta: {
    description: "复刻 BV1nR4y1v715：邻接占用驱动殿堂朝向，中心与交汇单元生成重檐，配套岛岸、水渠、石路和桥。",
    tags: ["中式古建", "Townscaper", "重檐", "飞檐", "斗拱", "邻接规则"],
    capabilities: ["种子复现", "邻接模块", "自动重檐", "自动桥路", "动态水体"],
    materialClasses: ["灰瓦", "木构", "石材", "草土", "水体"],
  },
  schema: [
    { key: "gridSize", label: "城镇网格规模", min: 5, max: 11, step: 1, default: CHINESE_TOWNSCAPER_DEFAULTS.gridSize },
    { key: "cellSize", label: "建筑间距", min: 5.2, max: 8, step: 0.1, default: CHINESE_TOWNSCAPER_DEFAULTS.cellSize },
    { key: "density", label: "殿堂密度", min: 0.2, max: 0.78, step: 0.02, default: CHINESE_TOWNSCAPER_DEFAULTS.density },
    { key: "islandRadius", label: "岛屿覆盖", min: 0.65, max: 1.2, step: 0.02, default: CHINESE_TOWNSCAPER_DEFAULTS.islandRadius },
    { key: "canalAmount", label: "水渠强度", min: 0, max: 1, step: 0.02, default: CHINESE_TOWNSCAPER_DEFAULTS.canalAmount },
    { key: "doubleEaveRate", label: "重檐比例", min: 0, max: 1, step: 0.02, default: CHINESE_TOWNSCAPER_DEFAULTS.doubleEaveRate },
    { key: "roofUpturn", label: "翼角起翘", min: 0.25, max: 1.25, step: 0.02, default: CHINESE_TOWNSCAPER_DEFAULTS.roofUpturn },
    { key: "waterHeight", label: "水面波高", min: 0.01, max: 0.12, step: 0.005, default: CHINESE_TOWNSCAPER_DEFAULTS.waterHeight },
    { key: "seed", label: "生成种子", min: 0, max: 999999, step: 1, default: CHINESE_TOWNSCAPER_DEFAULTS.seed },
  ],
  build(p) {
    return buildChineseTownscaperParts({
      gridSize: Math.round(p.gridSize),
      cellSize: p.cellSize,
      density: p.density,
      islandRadius: p.islandRadius,
      canalAmount: p.canalAmount,
      doubleEaveRate: p.doubleEaveRate,
      roofUpturn: p.roofUpturn,
      waterHeight: p.waterHeight,
      seed: Math.round(p.seed),
    });
  },
};

const cropoutIslandDefinitions = [
  ["cropout-pasture-island", "Cropout 牧场岛", "pasture", 101],
  ["cropout-longshore-island", "Cropout 长湾岛", "longshore", 211],
  ["cropout-twin-islands", "Cropout 双生岛", "twin", 307],
  ["cropout-archipelago", "Cropout 群岛", "archipelago", 419],
  ["cropout-rocky-islands", "Cropout 岩岸岛", "rocky", 523],
  ["cropout-lush-islands", "Cropout 密林岛", "lush", 631],
];

const CROPOUT_ISLAND_MODELS = Object.fromEntries(cropoutIslandDefinitions.map((definition) => {
  const [id, name, preset, seed] = definition;
  return [id, {
    id,
    name,
    category: "地形与环境",
    assetMeta: {
      description: "复刻 Cropout 教程的圆片融合、三级海岸和顶面散布流程。",
      tags: ["Cropout", "岛屿", "动态网格", "程序化海岸", "植被散布"],
      capabilities: ["种子复现", "轮廓融合", "分层材质", "多岛布局"],
      materialClasses: ["水体", "岩石", "沙地", "草地", "植被"],
    },
    schema: [
      { key: "size", label: "岛屿范围", min: 7, max: 22, step: 0.25, default: 12 },
      { key: "coastWidth", label: "海岸宽度", min: 0.2, max: 1.5, step: 0.02, default: 0.62 },
      { key: "terraceHeight", label: "岩层高度", min: 0.45, max: 2.2, step: 0.05, default: 1 },
      { key: "trees", label: "树木数量", min: 0, max: 180, step: 1, default: preset === "lush" ? 92 : 48 },
      { key: "rocks", label: "岩石数量", min: 0, max: 120, step: 1, default: preset === "rocky" ? 54 : 20 },
      { key: "seed", label: "生成种子", min: 0, max: 999, step: 1, default: seed },
    ],
    build(params) {
      return buildCropoutIslandPresetParts(preset, {
        size: params.size,
        coastWidth: params.coastWidth,
        terraceHeight: params.terraceHeight,
        trees: Math.round(params.trees),
        rocks: Math.round(params.rocks),
        seed: Math.round(params.seed),
      });
    },
  }];
}));

const stylizedOceanEnvironment = {
  id: "stylized-ocean-environment",
  name: "风格化广阔海洋环境",
  category: "地形与环境",
  assetMeta: {
    description: "复刻俯视风格化海洋：多岛地形、程序化岸线、水体、棕榈、积云、船与鱼跃。",
    tags: ["海洋", "风格化", "岛屿", "Gerstner 波", "昼夜循环"],
    capabilities: ["高细分海面", "动态岸线泡沫", "船尾迹", "鱼跃水花", "昼夜循环"],
    materialClasses: ["水体", "沙地", "草地", "植被", "云层", "木材"],
  },
  schema: [
    { key: "worldSize", label: "海域范围", min: 56, max: 180, step: 2, default: 140 },
    { key: "islandScale", label: "岛屿尺度", min: 0.6, max: 1.5, step: 0.05, default: 1 },
    { key: "islandCount", label: "岛屿数量", min: 1, max: 3, step: 1, default: 3 },
    { key: "palmCount", label: "棕榈数量", min: 0, max: 24, step: 1, default: 9 },
    { key: "cloudCount", label: "积云数量", min: 0, max: 6, step: 1, default: 4 },
    { key: "waveHeight", label: "波浪高度", min: 0.02, max: 0.6, step: 0.01, default: 0.22 },
    { key: "foamStrength", label: "泡沫强度", min: 0, max: 1, step: 0.02, default: 0.82 },
    { key: "seed", label: "生成种子", min: 0, max: 9999, step: 1, default: 812 },
  ],
  build(params) {
    return buildStylizedOceanEnvironmentParts({
      ...params,
      islandCount: Math.round(params.islandCount),
      palmCount: Math.round(params.palmCount),
      cloudCount: Math.round(params.cloudCount),
      seed: Math.round(params.seed),
    });
  },
};

// ---- procedural cumulus cloud: scatter blobs -> iso-surface -> puff noise ----
const cloud = {
  id: "cloud",
  name: "程序化积云",
  schema: [
    { key: "size", label: "云团尺寸", min: 1.5, max: 6, step: 0.1, default: 3.2 },
    { key: "blobs", label: "团块数量", min: 4, max: 30, step: 1, default: 14 },
    { key: "flatten", label: "底部压平", min: 0.25, max: 1, step: 0.05, default: 0.55 },
    { key: "resolution", label: "网格密度", min: 24, max: 72, step: 4, default: 48 },
    { key: "iso", label: "等值面", min: 0.3, max: 0.8, step: 0.02, default: 0.5 },
    { key: "smooth", label: "平滑次数", min: 0, max: 2, step: 1, default: 1 },
    { key: "puff", label: "蓬松强度", min: 0, max: 0.4, step: 0.01, default: 0.18 },
    { key: "puffScale", label: "蓬松频率", min: 0.6, max: 3.5, step: 0.05, default: 1.6 },
    { key: "seed", label: "云团种子", min: 0, max: 160, step: 1, default: 7 },
  ],
  build(p) {
    return buildCloudParts({
      size: p.size,
      blobs: p.blobs,
      flatten: p.flatten,
      resolution: p.resolution,
      iso: p.iso,
      smooth: p.smooth,
      puff: p.puff,
      puffScale: p.puffScale,
      seed: p.seed,
    });
  },
};

// ---- cloud sky: several distinct cloud shapes laid out in the air ----
const cloudSky = {
  id: "cloud-sky",
  name: "程序化云海",
  schema: [
    { key: "seed", label: "布局种子", min: 0, max: 160, step: 1, default: 11 },
  ],
  build(p) {
    return buildCloudSkyParts(p.seed);
  },
};

// ---- realtime waterfall: path ribbons + flow shader + instanced spray ----
const waterfall = {
  id: "waterfall",
  name: "程序化瀑布",
  critiqueGoal: "layered realtime waterfall with cliff, plunge pool, spray and mist",
  schema: [
    { key: "width", label: "瀑布宽度", min: 2, max: 14, step: 0.2, default: 6.8 },
    { key: "height", label: "落差高度", min: 3, max: 20, step: 0.25, default: 8.5 },
    { key: "depth", label: "前冲距离", min: 1, max: 8, step: 0.1, default: 3.4 },
    { key: "sheetCount", label: "水帘股数", min: 1, max: 8, step: 1, default: 4 },
    { key: "turbulence", label: "水流扰动", min: 0, max: 1.2, step: 0.02, default: 0.42 },
    { key: "flowSpeed", label: "流动速度", min: 0.2, max: 3, step: 0.05, default: 1.25 },
    { key: "rockCount", label: "岩块数量", min: 8, max: 90, step: 1, default: 34 },
    { key: "particleCount", label: "飞沫数量", min: 0, max: 420, step: 10, default: 180 },
    { key: "mistCount", label: "水雾数量", min: 0, max: 180, step: 6, default: 72 },
    { key: "foamCount", label: "漂泡数量", min: 0, max: 240, step: 8, default: 96 },
    { key: "seed", label: "水流种子", min: 0, max: 160, step: 1, default: 17 },
  ],
  build(p) {
    return buildWaterfallParts({
      width: p.width,
      height: p.height,
      depth: p.depth,
      sheetCount: Math.round(p.sheetCount),
      turbulence: p.turbulence,
      flowSpeed: p.flowSpeed,
      rockCount: Math.round(p.rockCount),
      particleCount: Math.round(p.particleCount),
      mistCount: Math.round(p.mistCount),
      foamCount: Math.round(p.foamCount),
      seed: Math.round(p.seed),
      controlPoints: p.controlPoints,
    });
  },
};

// ---- spline river: carved terrain + water + riparian PCG scatter ----
const proceduralRiver = {
  id: "procedural-river",
  name: "程序化河流",
  critiqueGoal: "spline-carved mountain river with gravel banks, boulders, foam and riparian forest",
  schema: [
    { key: "size", label: "河谷尺寸", min: 16, max: 52, step: 1, default: 24 },
    { key: "resolution", label: "地形精度", min: 24, max: 120, step: 8, default: 72 },
    { key: "riverWidth", label: "河道宽度", min: 0.5, max: 3.2, step: 0.1, default: 1.8 },
    { key: "riverDepth", label: "河槽深度", min: 0.2, max: 2.2, step: 0.05, default: 0.75 },
    { key: "meander", label: "蜿蜒强度", min: 0, max: 8, step: 0.2, default: 3.8 },
    { key: "relief", label: "山谷起伏", min: 1, max: 9, step: 0.2, default: 3.6 },
    { key: "bankRocks", label: "河岸岩石", min: 0, max: 140, step: 2, default: 78 },
    { key: "riverBoulders", label: "水中巨石", min: 0, max: 20, step: 1, default: 7 },
    { key: "trees", label: "河岸树木", min: 0, max: 220, step: 4, default: 108 },
    { key: "flowStreaks", label: "水面流痕", min: 0, max: 60, step: 2, default: 24 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 27 },
  ],
  build(p) {
    return buildProceduralRiverParts({
      size: p.size,
      resolution: Math.round(p.resolution),
      riverWidth: p.riverWidth,
      riverDepth: p.riverDepth,
      meander: p.meander,
      relief: p.relief,
      bankRocks: Math.round(p.bankRocks),
      riverBoulders: Math.round(p.riverBoulders),
      trees: Math.round(p.trees),
      flowStreaks: Math.round(p.flowStreaks),
      seed: Math.round(p.seed),
      controlPoints: p.controlPoints,
    });
  },
};

// ---- Houdini PCG river-to-lake: fixed lake boundary + upstream backwater ----
const riverLake = {
  id: "river-lake",
  name: "PCG 河流湖泊回水",
  critiqueGoal: "mountain river entering an irregular lake with a continuous shoreline and monotonic backwater profile",
  assetMeta: {
    description: "复刻 Houdini PCG 河流入湖：湖面高程反向约束上游水面，河床保持顺坡，入口连续加宽。",
    tags: ["Houdini", "PCG", "河流", "湖泊", "回水"],
    capabilities: ["回水剖面", "顺坡河床", "连续入湖", "确定性种子"],
    materialClasses: ["水体", "湿岸", "岩石地形"],
    source: "BV1ndiWBfEXo",
  },
  schema: [
    { key: "size", label: "流域尺寸", min: 22, max: 56, step: 1, default: 36 },
    { key: "resolution", label: "地形精度", min: 32, max: 144, step: 8, default: 88 },
    { key: "riverWidth", label: "河道宽度", min: 0.5, max: 3.2, step: 0.05, default: 1.25 },
    { key: "riverDepth", label: "河槽深度", min: 0.25, max: 2.2, step: 0.05, default: 0.82 },
    { key: "meander", label: "河道蜿蜒", min: 0, max: 8, step: 0.2, default: 4.2 },
    { key: "relief", label: "山地起伏", min: 1.5, max: 9, step: 0.2, default: 5.2 },
    { key: "lakeRadiusX", label: "湖泊横向半径", min: 3, max: 11, step: 0.2, default: 7.4 },
    { key: "lakeRadiusZ", label: "湖泊纵向半径", min: 2.5, max: 9, step: 0.2, default: 5.4 },
    { key: "lakeLevel", label: "湖面高程", min: 0.1, max: 2.5, step: 0.05, default: 0.72 },
    { key: "backwater", label: "回水强度", min: 0, max: 1, step: 0.02, default: 1 },
    { key: "flowStreaks", label: "水面流痕", min: 0, max: 80, step: 2, default: 24 },
    { key: "seed", label: "地貌种子", min: 0, max: 999, step: 1, default: 96 },
  ],
  build(p) {
    return buildRiverLakeParts({
      size: p.size,
      resolution: Math.round(p.resolution),
      riverWidth: p.riverWidth,
      riverDepth: p.riverDepth,
      meander: p.meander,
      relief: p.relief,
      lakeRadiusX: p.lakeRadiusX,
      lakeRadiusZ: p.lakeRadiusZ,
      lakeLevel: p.lakeLevel,
      backwater: p.backwater,
      flowStreaks: Math.round(p.flowStreaks),
      seed: Math.round(p.seed),
      controlPoints: p.controlPoints,
    });
  },
};

// ---- UE PCG Biome River: wetland spline + density-filtered biome layers ----
const pcgBiomeRiver = {
  id: "pcg-biome-river",
  name: "PCG 湿地河道",
  critiqueGoal: "calm wetland river with dense reeds, lily pads, broadleaf shrubs, rocks and driftwood",
  assetMeta: {
    description: "复刻 UE PCG Biome River 的分层生态散布：水体、岸带、水草、睡莲、灌丛、岩石、枯木。",
    tags: ["UE5 PCG", "河道", "湿地", "水草", "生态散布"],
    capabilities: ["Spline 河道", "密度分层", "确定性种子", "实时参数"],
    materialClasses: ["水体", "土壤", "植被", "岩石", "木材"],
  },
  schema: [
    { key: "size", label: "湿地尺寸", min: 18, max: 48, step: 1, default: 30 },
    { key: "resolution", label: "地形精度", min: 24, max: 112, step: 8, default: 64 },
    { key: "riverWidth", label: "水面宽度", min: 1.5, max: 6, step: 0.1, default: 3.4 },
    { key: "meander", label: "河道蜿蜒", min: 0, max: 7, step: 0.2, default: 3.2 },
    { key: "reeds", label: "水边芦苇", min: 0, max: 360, step: 10, default: 150 },
    { key: "dryReeds", label: "枯黄芦苇", min: 0, max: 180, step: 6, default: 54 },
    { key: "waterLilies", label: "睡莲数量", min: 0, max: 160, step: 4, default: 42 },
    { key: "shrubs", label: "河岸灌丛", min: 0, max: 120, step: 4, default: 28 },
    { key: "rocks", label: "岸边岩石", min: 0, max: 100, step: 2, default: 18 },
    { key: "snags", label: "漂流枯木", min: 0, max: 40, step: 1, default: 7 },
    { key: "seed", label: "生态种子", min: 0, max: 999, step: 1, default: 53 },
  ],
  build(p) {
    return buildPcgBiomeRiverParts({
      size: p.size,
      resolution: Math.round(p.resolution),
      riverWidth: p.riverWidth,
      meander: p.meander,
      reeds: Math.round(p.reeds),
      dryReeds: Math.round(p.dryReeds),
      waterLilies: Math.round(p.waterLilies),
      shrubs: Math.round(p.shrubs),
      rocks: Math.round(p.rocks),
      snags: Math.round(p.snags),
      seed: Math.round(p.seed),
      controlPoints: p.controlPoints,
    });
  },
};

// ---- polygon island: Voronoi graph + biomes + rivers (42arch-style) ----
const polygonIsland = {
  id: "polygon-island",
  name: "多边形岛屿(biome)",
  schema: [
    { key: "size", label: "岛屿尺寸", min: 6, max: 20, step: 0.5, default: 12 },
    { key: "points", label: "单元数量", min: 200, max: 2400, step: 100, default: 900 },
    { key: "height", label: "山体高度", min: 0.6, max: 6, step: 0.1, default: 2.2 },
    { key: "seaLevel", label: "海平面阈值", min: 0.05, max: 0.5, step: 0.01, default: 0.2 },
    { key: "islandFactor", label: "海岸收边", min: 0.4, max: 2.2, step: 0.02, default: 0.72 },
    { key: "jitter", label: "站点抖动", min: 0, max: 1, step: 0.02, default: 0.62 },
    { key: "rivers", label: "河流数量", min: 0, max: 24, step: 1, default: 8 },
    { key: "seed", label: "地貌种子", min: 0, max: 200, step: 1, default: 7 },
  ],
  build(p) {
    return buildPolygonIslandParts({
      size: p.size,
      points: Math.round(p.points),
      height: p.height,
      seaLevel: p.seaLevel,
      islandFactor: p.islandFactor,
      jitter: p.jitter,
      rivers: Math.round(p.rivers),
      seed: Math.round(p.seed),
      boundary: p.controlPoints,
    });
  },
};

// ---- pcg world: heightfield -> discrete biomes -> best-candidate resources ----
const pcgWorld = {
  id: "pcg-world",
  name: "PCG 生物群系世界",
  schema: [
    { key: "size", label: "世界尺寸", min: 6, max: 18, step: 0.5, default: 12 },
    { key: "resolution", label: "网格密度", min: 32, max: 160, step: 8, default: 112 },
    { key: "height", label: "地形起伏", min: 0.6, max: 4, step: 0.05, default: 2.9 },
    { key: "noiseScale", label: "噪声频率", min: 0.5, max: 3, step: 0.05, default: 1.05 },
    { key: "ridgeStrength", label: "山脊强度", min: 0, max: 1.2, step: 0.02, default: 0.28 },
    { key: "islandFalloff", label: "海岸收边", min: 0, max: 3, step: 0.05, default: 2.3 },
    { key: "terraceStrength", label: "台阶化强度", min: 0, max: 1, step: 0.02, default: 0.82 },
    { key: "terraceSteps", label: "台阶层数", min: 4, max: 20, step: 1, default: 11 },
    { key: "iterations", label: "侵蚀迭代", min: 0, max: 40, step: 1, default: 3 },
    { key: "waterLevel", label: "海平面阈值", min: 0.1, max: 0.6, step: 0.01, default: 0.3 },
    { key: "slopeLevel", label: "崖壁坡度阈值", min: 0.3, max: 0.95, step: 0.02, default: 0.72 },
    { key: "resources", label: "资源点数量", min: 0, max: 240, step: 2, default: 30 },
    { key: "seed", label: "世界种子", min: 0, max: 200, step: 1, default: 7 },
  ],
  build(p) {
    const size = p.size;
    const terrain = buildTerrainField({
      size,
      resolution: Math.round(p.resolution),
      seed: Math.round(p.seed),
      height: p.height,
      noiseScale: p.noiseScale,
      ridgeStrength: p.ridgeStrength,
      islandFalloff: p.islandFalloff,
      terraceStrength: p.terraceStrength,
      terraceSteps: Math.round(p.terraceSteps),
      iterations: Math.round(p.iterations),
      waterLevel: p.waterLevel,
      shoreWidth: 0.04,
    });
    const table = overworldBiomeTable();
    table.waterLevel = p.waterLevel;
    table.slopeLevel = p.slopeLevel;
    const biomes = classifyBiomes(terrain.height, table, {
      water: terrain.masks.water,
      slope: terrain.masks.slope,
    });
    const W = terrain.height.width;
    const H = terrain.height.height;
    const half = size * 0.5;
    const parts = [
      { name: "terrain", label: "地形", mesh: terrain.mesh, colors: biomes.colors.slice() },
    ];
    const count = Math.round(p.resources);
    if (count > 0) {
      const pts = scatterPointsOnField(terrain.masks.water, {
        width: W, height: H, count, seed: Math.round(p.seed) + 500,
        accept: (water) => water < 0.4,
      });
      const markers = pts.map((pt) => {
        const wx = -half + (pt.x / (W - 1)) * size;
        const wz = -half + (pt.y / (H - 1)) * size;
        const gx = Math.min(W - 1, Math.max(0, Math.round(pt.x)));
        const gy = Math.min(H - 1, Math.max(0, Math.round(pt.y)));
        const wy = terrain.height.data[gy * W + gx] + 0.09;
        return translateMesh(box(0.1, 0.18, 0.1), vec3(wx, wy, wz));
      });
      if (markers.length > 0) {
        parts.push({
          name: "resources", label: "资源点",
          mesh: markers.length === 1 ? markers[0] : merge(...markers),
          color: [0.82, 0.72, 0.95],
        });
      }
    }
    return parts;
  },
};

// ---- mountain village: square sandy plateau + winding dirt roads +
//      macaron low-poly buildings + conifers, all draped on terrain height ----
const mountainVillage = {
  id: "mountain-village",
  name: "山村聚落",
  critiqueGoal: "mountain village settlement",
  schema: [
    { key: "size", label: "地块尺寸", min: 8, max: 18, step: 0.5, default: 12 },
    { key: "resolution", label: "网格密度", min: 48, max: 160, step: 8, default: 128 },
    { key: "height", label: "地形起伏", min: 0.6, max: 3, step: 0.05, default: 1.6 },
    { key: "noiseScale", label: "噪声频率", min: 0.5, max: 2.5, step: 0.05, default: 1.05 },
    { key: "roads", label: "山路数量", min: 0, max: 16, step: 1, default: 9 },
    { key: "buildings", label: "建筑数量", min: 0, max: 320, step: 5, default: 190 },
    { key: "trees", label: "树木数量", min: 0, max: 200, step: 5, default: 60 },
    { key: "seed", label: "随机种子", min: 0, max: 200, step: 1, default: 21 },
  ],
  build(p) {
    return buildMountainVillageParts({
      size: p.size,
      resolution: Math.round(p.resolution),
      height: p.height,
      noiseScale: p.noiseScale,
      roads: Math.round(p.roads),
      buildings: Math.round(p.buildings),
      trees: Math.round(p.trees),
      seed: Math.round(p.seed),
    });
  },
};

const xianxiaMountains = {
  id: "xianxia-mountains",
  name: "仙侠云海峰林",
  category: "自然",
  critiqueGoal: "cinematic Chinese xianxia quartz-sandstone pillar mountains rising through layered cloud sea",
  assetMeta: {
    description: "按参考图复刻张家界式仙侠柱峰：截顶岩柱、纵向裂隙、峰壁松林、冷色远峰与分层体积云海。",
    tags: ["仙侠", "张家界", "柱峰", "云海", "松树", "参考图复刻"],
    capabilities: ["多层景深", "截顶柱峰", "岩壁裂隙", "附岩植被", "体积云", "种子变体"],
    materialClasses: ["石英砂岩", "苔草", "松木", "松针", "云雾"],
  },
  schema: [
    { key: "peakCount", label: "峰柱数量", min: 3, max: 12, step: 1, default: 10 },
    { key: "height", label: "主峰高度", min: 8, max: 34, step: 0.5, default: 19 },
    { key: "spread", label: "峰林范围", min: 18, max: 60, step: 1, default: 28 },
    { key: "cliffRoughness", label: "岩壁破碎度", min: 0.05, max: 0.75, step: 0.01, default: 0.38 },
    { key: "treeDensity", label: "附岩松密度", min: 0, max: 1, step: 0.02, default: 0.68 },
    { key: "cloudCount", label: "云团数量", min: 0, max: 10, step: 1, default: 8 },
    { key: "seed", label: "随机种子", min: 0, max: 9999, step: 1, default: 71 },
  ],
  build(params) {
    return buildXianxiaMountainsParts({
      ...params,
      peakCount: Math.round(params.peakCount),
      cloudCount: Math.round(params.cloudCount),
      seed: Math.round(params.seed),
    });
  },
};

// ---- house garden: nine separate square tray lots ----
function makeHouseGardenModel(variant) {
  const params = variant.params || {};
  return {
    id: variant.id,
    name: variant.name,
    critiqueGoal: "stylized procedural house and garden lot",
    schema: [
      { key: "lotSize", label: "地块尺寸", min: 3.5, max: 9, step: 0.1, default: params.lotSize ?? 5.4 },
      { key: "houseScale", label: "房屋尺度", min: 0.6, max: 1.45, step: 0.01, default: params.houseScale ?? 1 },
      { key: "gardenDensity", label: "花园密度", min: 0, max: 1, step: 0.01, default: params.gardenDensity ?? 0.75 },
      { key: "treeDensity", label: "树木密度", min: 0, max: 1, step: 0.01, default: params.treeDensity ?? 0.7 },
      { key: "flowerDensity", label: "花朵密度", min: 0, max: 1, step: 0.01, default: params.flowerDensity ?? 0.85 },
      { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: params.seed ?? 37 },
    ],
    build(p) {
      return buildHouseGardenParts({
        variants: 1,
        variantIndex: params.variantIndex ?? 0,
        lotSize: p.lotSize,
        houseScale: p.houseScale,
        gardenDensity: p.gardenDensity,
        treeDensity: p.treeDensity,
        flowerDensity: p.flowerDensity,
        seed: Math.round(p.seed),
      });
    },
  };
}

const HOUSE_GARDEN_MODELS = Object.fromEntries(HOUSE_GARDEN_VARIANTS.map((variant) => [variant.id, makeHouseGardenModel(variant)]));

// ---- P7 vegetation: SpeedTree-style recursive spline tree ----
const BARK_COL = [0.32, 0.22, 0.14];
const LEAF_COL = [0.18, 0.42, 0.13];
const BLADE_COL = [0.24, 0.5, 0.16];

function authoredTreeParts(label, plant, barkColor, leafColor, seed, tag) {
  const parts = [
    speedTreePart("wood", plant.wood, "wood", { color: barkColor, roughness: 0.9 }, "wood", seed),
  ];
  parts[0].label = `${label} 枝干`;
  parts[0].metadata = { generator: "authoring-levels-stratified-bark-uv", tag };
  if (plant.leaves.positions.length > 0) {
    const leaf = speedTreePart("foliage", plant.leaves, "fabric", { color: leafColor, roughness: 0.72 }, "foliage", seed + 1);
    leaf.label = `${label} 叶冠`;
    leaf.metadata = { generator: "rounded-leaf-normals-stratified", tag };
    parts.push(leaf);
  }
  return parts;
}

function trellisFrameMesh(width, height, spacing) {
  const rails = [];
  const half = width * 0.5;
  const postR = 0.025;
  const railR = 0.018;
  for (let x = -half; x <= half + 1e-6; x += spacing) {
    rails.push(transform(cylinder(postR, height, 8, true), { translate: vec3(x, height * 0.5, 0) }));
  }
  for (let y = spacing; y <= height + 1e-6; y += spacing) {
    rails.push(transform(cylinder(railR, width, 8, true), {
      rotate: vec3(0, 0, Math.PI / 2),
      translate: vec3(0, y, 0),
    }));
  }
  return merge(...rails);
}

function fruitMeshFromBranches(branches, count, radius) {
  const terminals = branches.filter((b) => b.terminal && b.curve.points.length > 0);
  if (!terminals.length || count <= 0) return merge();
  const fruits = [];
  const n = Math.min(Math.round(count), terminals.length);
  for (let i = 0; i < n; i++) {
    const bi = Math.min(terminals.length - 1, Math.floor(((i + 0.5) / n) * terminals.length));
    const branch = terminals[bi];
    const pt = branch.curve.points[branch.curve.points.length - 1];
    fruits.push(transform(sphere(radius, 12, 8), { translate: vec3(pt.x, pt.y - radius * 0.45, pt.z) }));
  }
  return merge(...fruits);
}

function offsetParts(parts, prefix, label, x, z = 0) {
  return parts.map((p) => ({
    ...p,
    name: `${prefix}_${p.name}`,
    label: `${label} ${p.label || p.name}`,
    mesh: translateMesh(p.mesh, vec3(x, 0, z)),
  }));
}

function buildAuthoredBroadleafParts(p) {
  const seed = Math.round(p.seed);
  const height = p.height;
  const plant = tree({
    seed,
    height,
    trunkRadius: p.trunkRadius,
    gnarl: p.gnarl,
    leaves: p.leafDensity > 0,
    leafDensity: Math.round(p.leafDensity),
    leafSize: p.leafSize,
    leafShape: "oval",
    leafCurl: 0.12,
    leafFold: 0.08,
    barkUv: { longitudinalScale: 0.72, radialScale: 0.38 },
    branchFlareScale: 1.9,
    branchFeatures: p.featureCount > 0 ? { count: Math.round(p.featureCount), kind: "mixed", size: 0.95, minBranchRadius: 0.035 } : false,
    branchLengthProfile: [{ t: 0, value: 0.72 }, { t: 0.42, value: 1.25 }, { t: 1, value: 0.55 }],
    leafDensityProfile: [{ t: 0, value: 0.18 }, { t: 0.62, value: 1.18 }, { t: 1, value: 0.9 }],
    canopy: {
      shape: "ellipsoid",
      baseY: height * 0.24,
      height: height * 0.82,
      radiusX: p.crownWidth * 0.5,
      radiusZ: p.crownDepth * 0.5,
      strength: 0.85,
      minScale: 0.14,
      power: 0.82,
    },
    authoring: {
      placement: "stratified-shuffled",
      leafPlacement: "stratified-shuffled",
      roundedLeafNormals: true,
      levels: [
        { count: Math.round(p.primaryBranches), startPct: 0.18, endPct: 0.84, angle: p.primaryAngle, angleJitter: 8, lengthScale: p.spread, radiusScale: 0.52, phototropism: 0.34, gravity: 0.04, segments: 7, gnarl: p.gnarl * 1.4 },
        { count: Math.round(p.secondaryBranches), startPct: 0.14, endPct: 0.94, angle: p.secondaryAngle, angleJitter: 12, lengthScale: 0.66, radiusScale: 0.55, phototropism: 0.36, gravity: 0.04, segments: 5, gnarl: p.gnarl * 1.1 },
        { count: Math.round(p.twigBranches), startPct: 0.28, endPct: 0.98, angle: p.twigAngle, angleJitter: 18, lengthScale: 0.48, radiusScale: 0.5, phototropism: 0.55, gravity: 0.02, segments: 4, gnarl: p.gnarl * 0.8 },
      ],
    },
  });
  return authoredTreeParts("分层阔叶树", plant, [0.32, 0.21, 0.13], [0.18, 0.43, 0.14], seed, "authored-broadleaf");
}

function buildTrellisFruitParts(p) {
  const seed = Math.round(p.seed);
  const height = p.height;
  const plant = tree({
    seed,
    height,
    trunkRadius: p.trunkRadius,
    gnarl: p.gnarl,
    leaves: p.leafDensity > 0,
    leafDensity: Math.round(p.leafDensity),
    leafSize: p.leafSize,
    leafShape: "round",
    leafCurl: 0.08,
    barkUv: { longitudinalScale: 0.62, radialScale: 0.32 },
    branchFlareScale: 1.75,
    branchLengthProfile: [{ t: 0, value: 0.55 }, { t: 0.55, value: 1.2 }, { t: 1, value: 0.75 }],
    leafDensityProfile: [{ t: 0, value: 0.1 }, { t: 0.7, value: 1.05 }, { t: 1, value: 1.15 }],
    trellis: {
      kind: "grid",
      origin: vec3(0, 0, 0),
      axisU: vec3(1, 0, 0),
      axisV: vec3(0, 1, 0),
      spacing: p.gridSpacing,
      strength: p.trellisPull,
      maxPull: 1.25,
      startPct: 0.18,
      depthMin: 1,
    },
    authoring: {
      placement: "stratified-shuffled",
      leafPlacement: "stratified-shuffled",
      roundedLeafNormals: true,
      levels: [
        { count: Math.round(p.primaryBranches), startPct: 0.22, endPct: 0.9, angle: 72, angleJitter: 6, lengthScale: p.spread, radiusScale: 0.52, phototropism: 0.18, gravity: 0.02, segments: 7, gnarl: p.gnarl * 0.8 },
        { count: Math.round(p.secondaryBranches), startPct: 0.18, endPct: 0.94, angle: 56, angleJitter: 14, lengthScale: 0.58, radiusScale: 0.54, phototropism: 0.26, gravity: 0.02, segments: 5, gnarl: p.gnarl },
        { count: Math.round(p.twigBranches), startPct: 0.35, endPct: 0.98, angle: 42, angleJitter: 16, lengthScale: 0.42, radiusScale: 0.5, phototropism: 0.35, gravity: 0.02, segments: 4, gnarl: p.gnarl * 0.7 },
      ],
    },
  });
  const parts = authoredTreeParts("棚架果树", plant, [0.34, 0.22, 0.12], [0.22, 0.44, 0.16], seed, "trellis-fruit");
  parts.push(surfPart("trellis_frame", transform(trellisFrameMesh(p.frameWidth, height * 0.92, p.gridSpacing), { translate: vec3(0, 0.05, -0.06) }), "wood", { color: [0.42, 0.27, 0.13], roughness: 0.86 }));
  if (p.fruitCount > 0) parts.push(surfPart("fruit", fruitMeshFromBranches(plant.branches, p.fruitCount, p.fruitSize), "ceramic", { color: [0.78, 0.12, 0.08], roughness: 0.48 }));
  return parts;
}

function buildColumnCypressParts(p) {
  const seed = Math.round(p.seed);
  const height = p.height;
  const plant = tree({
    seed,
    height,
    trunkRadius: p.trunkRadius,
    gnarl: p.gnarl,
    leaves: p.leafDensity > 0,
    leafDensity: Math.round(p.leafDensity),
    leafSize: p.leafSize,
    leafShape: "lanceolate",
    leafCurl: 0.18,
    leafFold: 0.16,
    barkUv: { longitudinalScale: 0.55, radialScale: 0.3 },
    branchFlareScale: 1.55,
    leafDensityProfile: [{ t: 0, value: 0.45 }, { t: 0.6, value: 1.05 }, { t: 1, value: 0.8 }],
    canopy: {
      shape: "column",
      baseY: height * 0.08,
      height: height * 0.9,
      radiusX: p.crownRadius,
      radiusZ: p.crownRadius * 0.86,
      strength: 0.96,
      minScale: 0.28,
    },
    authoring: {
      placement: "stratified-shuffled",
      leafPlacement: "stratified-shuffled",
      roundedLeafNormals: true,
      levels: [
        { count: Math.round(p.primaryBranches), startPct: 0.08, endPct: 0.96, angle: 30, angleJitter: 8, lengthScale: 0.42, radiusScale: 0.45, phototropism: 0.78, gravity: 0.0, segments: 6, gnarl: p.gnarl },
        { count: Math.round(p.secondaryBranches), startPct: 0.25, endPct: 0.96, angle: 34, angleJitter: 10, lengthScale: 0.38, radiusScale: 0.48, phototropism: 0.72, gravity: 0.0, segments: 4, gnarl: p.gnarl * 0.8 },
        { count: Math.round(p.twigBranches), startPct: 0.35, endPct: 0.98, angle: 38, angleJitter: 14, lengthScale: 0.3, radiusScale: 0.5, phototropism: 0.74, gravity: 0.0, segments: 3, gnarl: p.gnarl * 0.55 },
      ],
    },
  });
  return authoredTreeParts("柱形柏树", plant, [0.29, 0.2, 0.13], [0.07, 0.27, 0.15], seed, "column-cypress");
}

// 盆景 — 复刻 B 站《Houdini 程序化生成盆景树》教程的造型语言：
// 矮壮弯主干 + 细密递归分枝 + 露根 nebari + 车削浅盆 + scatter 苔点土面。
// bare 模式(叶密度=0)=落叶枯枝(忠实视频)，否则枝端放压扁 icosphere 云片。
const bonsaiModel = {
  id: "bonsai",
  name: "盆景 (Houdini教程复刻)",
  schema: [
    { key: "height", label: "树高(矮)", min: 1.2, max: 3.2, step: 0.05, default: 2.4 },
    { key: "trunkRadius", label: "主干半径(壮)", min: 0.16, max: 0.4, step: 0.01, default: 0.26 },
    { key: "sway", label: "主干弯曲", min: 0.1, max: 0.8, step: 0.02, default: 0.34 },
    { key: "gnarl", label: "扭曲度", min: 0, max: 0.6, step: 0.02, default: 0.4 },
    { key: "branches", label: "一级枝数", min: 4, max: 12, step: 1, default: 8 },
    { key: "depth", label: "递归层级", min: 2, max: 5, step: 1, default: 5 },
    { key: "branchAngle", label: "出枝角", min: 30, max: 65, step: 1, default: 42 },
    { key: "leafDensity", label: "叶团数量(0=枯枝)", min: 0, max: 8, step: 1, default: 8 },
    { key: "padSize", label: "云片大小", min: 1.2, max: 3.0, step: 0.1, default: 2.0 },
    { key: "moss", label: "苔点数量", min: 0, max: 60, step: 2, default: 40 },
    { key: "seed", label: "种子", min: 0, max: 200, step: 1, default: 421 },
  ],
  build(p) {
    const seed = Math.round(p.seed);
    const rng = makeRng(seed);
    const R = p.trunkRadius;
    const h = p.height;
    const s = p.sway * h;
    // 弯曲主干脊线（S 形折线）
    const spine = polyline([
      vec3(0, 0, 0),
      vec3(s * (0.3 + rng.range(-0.1, 0.1)), h * 0.28, s * 0.15),
      vec3(-s * (0.35 + rng.range(-0.1, 0.1)), h * 0.55, -s * 0.1),
      vec3(s * (0.25 + rng.range(-0.1, 0.1)), h * 0.78, s * 0.2),
      vec3(-s * 0.15 + rng.range(-0.05, 0.05), h, rng.range(-0.05, 0.05)),
    ]);
    const bare = p.leafDensity <= 0;
    const depth = Math.round(p.depth);
    const allLevels = [
      { count: Math.round(p.branches), children: 4, angle: p.branchAngle, lengthScale: 0.74, radiusScale: 0.6 },
      { count: 4, children: 4, angle: p.branchAngle + 6, lengthScale: 0.72, radiusScale: 0.56 },
      { count: 4, children: 3, angle: p.branchAngle + 12, lengthScale: 0.68, radiusScale: 0.52 },
      { count: 3, children: 3, angle: p.branchAngle + 18, lengthScale: 0.62, radiusScale: 0.48 },
      { count: 3, children: 0, angle: p.branchAngle + 24, lengthScale: 0.56, radiusScale: 0.44 },
    ].slice(0, depth);
    const t = tree({
      seed,
      trunkCurve: spine,
      trunkRadius: R,
      gnarl: p.gnarl,
      leaves: false,
      branchAngle: p.branchAngle,
      branchPhototropism: bare ? 0.35 : 0.5,
      branchGravity: 0.06,
      branchFlare: true,
      branchFlareScale: 1.6,
      authoring: { levels: allLevels },
      branchRadiusProfile: [{ t: 0, value: 0.9 }, { t: 1, value: 0.28 }],
      canopy: bare
        ? { shape: "ellipsoid", baseY: h * 0.35, height: h * 0.9, radiusX: h * 0.55, strength: 0.5 }
        : undefined,
    });
    // 露根 nebari
    const roots = [];
    const nr = 5;
    for (let i = 0; i < nr; i++) {
      const a = (i / nr) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const len = R * (2.4 + rng.range(-0.4, 0.6));
      const dir = vec3(Math.cos(a), 0, Math.sin(a));
      roots.push(sweep(polyline([
        vec3(0, R * 0.4, 0),
        vec3(dir.x * len * 0.5, R * 0.15, dir.z * len * 0.5),
        vec3(dir.x * len, -0.02, dir.z * len),
      ]), { sides: 5, radius: R * 0.5, radiusAt: (u) => 1 - 0.85 * u, caps: true }));
    }
    const wood = merge(t.wood, ...roots);
    const parts = [windSurfPart("wood", wood, "wood", { color: BARK_COL, roughness: 0.9 }, "tree")];
    // 云片模式：只在少数上层枝端放分层叶团（真实盆景是几片分离云片，非满树）。
    // leafDensity 直接 = 云团数量；每团几个小球叠成扁平团，看得见骨架和盆。
    if (!bare) {
      const tips = t.branches
        .filter((x) => x.terminal)
        .map((branch) => ({ branch, tip: branch.curve.points[branch.curve.points.length - 1] }))
        .filter(({ tip }) => tip.y > h * 0.45 && Math.hypot(tip.x, tip.z) < h * 0.75)
        .sort((a, b) => b.tip.y - a.tip.y);
      const nPads = Math.min(Math.round(p.leafDensity), tips.length);
      const picked = [];
      if (nPads > 0) picked.push(tips[0]);
      while (picked.length < nPads) {
        let best = null;
        let bestScore = -Infinity;
        for (const candidate of tips) {
          if (picked.includes(candidate)) continue;
          const nearest = Math.min(...picked.map((other) => {
            const dx = (candidate.tip.x - other.tip.x) / h;
            const dy = (candidate.tip.y - other.tip.y) / h;
            const dz = (candidate.tip.z - other.tip.z) / h;
            return Math.hypot(dx, dy * 0.7, dz);
          }));
          const score = nearest + Math.max(0, candidate.tip.y / h - 0.4) * 0.18;
          if (score > bestScore) {
            best = candidate;
            bestScore = score;
          }
        }
        if (!best) break;
        picked.push(best);
      }
      const leafBranches = [];
      const seenBranches = new Set();
      for (const center of picked) {
        const nearby = tips
          .map((candidate) => ({
            branch: candidate.branch,
            distance: Math.hypot(
              candidate.tip.x - center.tip.x,
              (candidate.tip.y - center.tip.y) * 0.65,
              candidate.tip.z - center.tip.z,
            ),
          }))
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 10);
        for (const { branch } of nearby) {
          if (seenBranches.has(branch)) continue;
          seenBranches.add(branch);
          leafBranches.push(branch);
        }
      }
      const foliage = scatterLeaves(leafBranches, {
        seed: seed + 1,
        perBranch: 8,
        size: R * p.padSize * 0.28,
        aspect: 1.45,
        sizeJitter: 0.3,
        upBias: 0.55,
        startPct: 0.1,
        shape: "oval",
        leafSegments: 5,
        curl: 0.12,
        fold: 0.1,
        roundedNormals: true,
        placement: "stratified-shuffled",
      });
      parts.push(windSurfPart("foliage", foliage, "leaf", { color: LEAF_COL }, "foliage"));
    }
    // 车削浅盆
    const potR = R * 4.2;
    const wall = potR * 0.08;
    const H = h * 0.16;
    const footR = potR * 0.75;
    const pot = computeNormals(lathe([
      vec2(0, -H), vec2(footR * 0.5, -H), vec2(footR, -H * 0.6),
      vec2(potR, -H * 0.05), vec2(potR + wall, 0), vec2(potR + wall, wall),
      vec2(potR - wall, wall), vec2(potR - wall, -H * 0.6),
      vec2(footR * 0.5, -H * 0.75), vec2(0, -H * 0.75),
    ], { segments: 48 }), 45);
    // 苔点土面
    const soilR = potR - R * 0.5;
    const soilMeshes = [translateMesh(scaleMesh(icosphere(soilR, 2), vec3(1, 0.12, 1)), vec3(0, -0.02, 0))];
    const mossN = Math.round(p.moss);
    for (let i = 0; i < mossN; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * soilR * 0.92;
      const sz = R * rng.range(0.1, 0.24);
      soilMeshes.push(translateMesh(scaleMesh(icosphere(sz, 1), vec3(1, rng.range(0.4, 0.7), 1)),
        vec3(Math.cos(a) * r, soilR * 0.11 + sz * 0.3, Math.sin(a) * r)));
    }
    parts.push(surfPart("soil", merge(...soilMeshes), "stone", { color: [0.14, 0.11, 0.08], roughness: 0.95 }));
    parts.push(surfPart("pot", pot, "ceramic", { color: [0.4, 0.26, 0.2], roughness: 0.5 }));
    return parts;
  },
};

const treeModel = {
  id: "veg-tree",
  name: "程序化树",
  schema: [
    { key: "height", label: "树高", min: 2, max: 7, step: 0.1, default: 4.2 },
    { key: "trunkRadius", label: "主干半径", min: 0.1, max: 0.5, step: 0.01, default: 0.28 },
    { key: "branchCount", label: "一级枝数", min: 3, max: 12, step: 1, default: 7 },
    { key: "depth", label: "分叉层级", min: 1, max: 4, step: 1, default: 3 },
    { key: "branchAngle", label: "出枝角", min: 25, max: 75, step: 1, default: 48 },
    { key: "gnarl", label: "弯曲度", min: 0, max: 0.4, step: 0.01, default: 0.12 },
    { key: "leafDensity", label: "叶密度", min: 0, max: 16, step: 1, default: 9 },
    { key: "leafSize", label: "叶片大小", min: 0.08, max: 0.35, step: 0.01, default: 0.18 },
    { key: "seed", label: "种子", min: 0, max: 60, step: 1, default: 7 },
  ],
  build(p) {
    const t = tree({
      seed: Math.round(p.seed),
      height: p.height,
      trunkRadius: p.trunkRadius,
      branchCount: Math.round(p.branchCount),
      depth: Math.round(p.depth),
      branchAngle: p.branchAngle,
      gnarl: p.gnarl,
      leafDensity: Math.round(p.leafDensity),
      leafSize: p.leafSize,
      leaves: p.leafDensity > 0,
    });
    const parts = [surfPart("trunk", t.wood, "wood", { color: BARK_COL, roughness: 0.9 })];
    if (p.leafDensity > 0) parts.push(windSurfPart("leaves", t.leaves, "fabric", { color: LEAF_COL, roughness: 0.7 }, "foliage"));
    return parts;
  },
};

// 复刻 Blender geometry-nodes 教程 "Procedural Tree.blend" 的风格化树：
// gnarl 主干 + 4 级贝塞尔子枝 + Float-Curve 半径/长度/叶密度锥化 + 圆润叶法线。
const stylizedTreeModel = {
  id: "veg-stylized-tree",
  name: "风格化树 (Blender复刻)",
  schema: [
    { key: "height", label: "树高", min: 2.5, max: 7, step: 0.1, default: 4.4 },
    { key: "trunkRadius", label: "主干半径", min: 0.12, max: 0.5, step: 0.01, default: 0.26 },
    { key: "gnarl", label: "主干扭曲", min: 0, max: 0.45, step: 0.01, default: 0.18 },
    { key: "branchAngle", label: "出枝角", min: 30, max: 75, step: 1, default: 46 },
    { key: "l0count", label: "一级枝数", min: 3, max: 12, step: 1, default: 6 },
    { key: "l0children", label: "每枝分叉数", min: 2, max: 6, step: 1, default: 4 },
    { key: "phototropism", label: "向光弯曲", min: 0, max: 0.8, step: 0.02, default: 0.42 },
    { key: "gravity", label: "重力下垂", min: 0, max: 0.4, step: 0.01, default: 0.06 },
    { key: "radiusTaper", label: "枝端锥化", min: 0.2, max: 0.6, step: 0.02, default: 0.4 },
    { key: "leafDensity", label: "叶密度", min: 0, max: 12, step: 1, default: 5 },
    { key: "leafSize", label: "叶片大小", min: 0.1, max: 0.32, step: 0.01, default: 0.2 },
    { key: "leafShape", label: "叶形(0水滴1椭圆2圆)", min: 0, max: 2, step: 1, default: 0 },
    { key: "leafCurl", label: "叶片卷曲", min: 0, max: 0.4, step: 0.02, default: 0.16 },
    { key: "seed", label: "种子", min: 0, max: 200, step: 1, default: 614 },
  ],
  build(p) {
    const shapes = ["teardrop", "oval", "round"];
    const levels = [
      { count: Math.round(p.l0count), children: Math.round(p.l0children), angle: p.branchAngle, lengthScale: 0.72, radiusScale: 0.55 },
      { count: 4, children: 3, angle: p.branchAngle + 6, lengthScale: 0.7, radiusScale: 0.52 },
      { count: 3, children: 2, angle: p.branchAngle + 12, lengthScale: 0.66, radiusScale: 0.5 },
      { count: 2, children: 0, angle: p.branchAngle + 18, lengthScale: 0.6, radiusScale: 0.48 },
    ];
    const wantLeaves = p.leafDensity > 0;
    const t = tree({
      seed: Math.round(p.seed),
      height: p.height,
      trunkRadius: p.trunkRadius,
      gnarl: p.gnarl,
      branchAngle: p.branchAngle,
      branchPhototropism: p.phototropism,
      branchGravity: p.gravity,
      leafDensity: Math.round(p.leafDensity),
      leafSize: p.leafSize,
      leaves: wantLeaves,
      leafShape: shapes[Math.round(p.leafShape)] || "teardrop",
      leafCurl: p.leafCurl,
      leafFold: 0.08,
      roundedLeafNormals: true,
      branchFlareScale: 1.4,
      authoring: { levels },
      branchRadiusProfile: [{ t: 0, value: 0.92 }, { t: 1, value: p.radiusTaper }],
      branchLengthProfile: { stops: [{ t: 0, value: 0.7 }, { t: 0.5, value: 1.05 }, { t: 1, value: 0.6 }], smooth: true },
      leafDensityProfile: [{ t: 0, value: 0.2 }, { t: 0.6, value: 1.1 }, { t: 1, value: 1.3 }],
    });
    const parts = [surfPart("trunk", t.wood, "wood", { color: BARK_COL, roughness: 0.9 })];
    if (wantLeaves) parts.push(windSurfPart("leaves", t.leaves, "fabric", { color: LEAF_COL, roughness: 0.7 }, "foliage"));
    return parts;
  },
};

// ---- Growing tree: a single `growth` slider animates a tree from sprout to full ----
function buildGrowingTreeParts(p) {
  const seed = Math.round(p.seed);
  const plant = growingTree({
    seed,
    height: p.height,
    trunkRadius: p.trunkRadius,
    gnarl: p.gnarl,
    branchCount: Math.round(p.branchCount),
    depth: Math.round(p.depth),
    branchAngle: p.branchAngle,
    leaves: p.leafDensity > 0,
    leafDensity: Math.round(p.leafDensity),
    leafSize: p.leafSize,
    leafShape: "oval",
    leafCurl: 0.12,
    leafFold: 0.08,
    barkUv: { longitudinalScale: 0.72, radialScale: 0.38 },
    branchFlareScale: 1.6,
    growth: p.growth,
    depthDelay: p.depthDelay,
    heightDelay: p.heightDelay,
    leafStart: p.leafStart,
  });
  const parts = [
    speedTreePart("wood", plant.wood, "wood", { color: [0.32, 0.22, 0.14], roughness: 0.9 }, "wood", seed),
  ];
  parts[0].label = "生长树 枝干";
  parts[0].metadata = { generator: "growing-tree", growth: p.growth };
  if (plant.leaves.positions.length > 0) {
    const leaf = speedTreePart("foliage", plant.leaves, "fabric", { color: [0.18, 0.43, 0.14], roughness: 0.72 }, "foliage", seed + 1);
    leaf.label = "生长树 叶冠";
    leaf.metadata = { generator: "growing-tree", growth: p.growth };
    parts.push(leaf);
  }
  return parts;
}

const growingTreeModel = {
  id: "veg-growing-tree",
  name: "生长树",
  schema: [
    { key: "growth", label: "生长阶段", min: 0, max: 1, step: 0.01, default: 1 },
    { key: "height", label: "成树高度", min: 2.5, max: 8, step: 0.1, default: 5 },
    { key: "trunkRadius", label: "主干半径", min: 0.12, max: 0.5, step: 0.01, default: 0.3 },
    { key: "branchCount", label: "一级枝数", min: 3, max: 14, step: 1, default: 8 },
    { key: "depth", label: "分枝层级", min: 1, max: 4, step: 1, default: 3 },
    { key: "branchAngle", label: "出枝角", min: 25, max: 75, step: 1, default: 48 },
    { key: "gnarl", label: "枝干弯曲", min: 0, max: 0.4, step: 0.01, default: 0.14 },
    { key: "leafDensity", label: "叶密度", min: 0, max: 16, step: 1, default: 9 },
    { key: "leafSize", label: "叶片大小", min: 0.08, max: 0.32, step: 0.01, default: 0.18 },
    { key: "depthDelay", label: "分层延迟", min: 0.2, max: 0.9, step: 0.02, default: 0.6 },
    { key: "heightDelay", label: "沿枝延迟", min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: "leafStart", label: "出叶时刻", min: 0.2, max: 0.9, step: 0.02, default: 0.55 },
    { key: "seed", label: "种子", min: 0, max: 200, step: 1, default: 7 },
  ],
  build(p) {
    return buildGrowingTreeParts(p);
  },
};

const authoredBroadleafModel = {
  id: "veg-authored-broadleaf",
  name: "分层阔叶树",
  schema: [
    { key: "height", label: "树高", min: 2.5, max: 7.5, step: 0.1, default: 4.4 },
    { key: "trunkRadius", label: "主干半径", min: 0.12, max: 0.55, step: 0.01, default: 0.28 },
    { key: "crownWidth", label: "树冠宽度", min: 1.2, max: 5.5, step: 0.05, default: 4.2 },
    { key: "crownDepth", label: "树冠厚度", min: 1.0, max: 5.0, step: 0.05, default: 3.1 },
    { key: "primaryBranches", label: "一级枝数", min: 3, max: 12, step: 1, default: 8 },
    { key: "secondaryBranches", label: "二级枝数", min: 1, max: 8, step: 1, default: 4 },
    { key: "twigBranches", label: "末级枝数", min: 0, max: 6, step: 1, default: 3 },
    { key: "primaryAngle", label: "一级出枝角", min: 32, max: 78, step: 1, default: 68 },
    { key: "secondaryAngle", label: "二级出枝角", min: 25, max: 72, step: 1, default: 52 },
    { key: "twigAngle", label: "末级出枝角", min: 20, max: 70, step: 1, default: 36 },
    { key: "spread", label: "横向展开", min: 0.45, max: 1.35, step: 0.02, default: 1.08 },
    { key: "gnarl", label: "枝干弯曲", min: 0, max: 0.42, step: 0.01, default: 0.14 },
    { key: "leafDensity", label: "叶密度", min: 0, max: 16, step: 1, default: 10 },
    { key: "leafSize", label: "叶片大小", min: 0.08, max: 0.32, step: 0.01, default: 0.17 },
    { key: "featureCount", label: "树皮特征", min: 0, max: 28, step: 1, default: 10 },
    { key: "seed", label: "种子", min: 0, max: 200, step: 1, default: 41 },
  ],
  build(p) {
    return buildAuthoredBroadleafParts(p);
  },
};

const trellisFruitModel = {
  id: "veg-trellis-fruit",
  name: "棚架果树",
  schema: [
    { key: "height", label: "树高", min: 2.0, max: 5.4, step: 0.1, default: 3.6 },
    { key: "trunkRadius", label: "主干半径", min: 0.08, max: 0.35, step: 0.01, default: 0.18 },
    { key: "frameWidth", label: "棚架宽度", min: 1.6, max: 5.5, step: 0.1, default: 3.6 },
    { key: "gridSpacing", label: "棚架网格", min: 0.35, max: 1.1, step: 0.05, default: 0.6 },
    { key: "trellisPull", label: "吸附强度", min: 0, max: 1, step: 0.02, default: 0.82 },
    { key: "primaryBranches", label: "一级枝数", min: 3, max: 10, step: 1, default: 6 },
    { key: "secondaryBranches", label: "二级枝数", min: 1, max: 7, step: 1, default: 4 },
    { key: "twigBranches", label: "末级枝数", min: 0, max: 6, step: 1, default: 2 },
    { key: "spread", label: "横向展开", min: 0.5, max: 1.55, step: 0.02, default: 1.05 },
    { key: "gnarl", label: "枝干弯曲", min: 0, max: 0.34, step: 0.01, default: 0.08 },
    { key: "leafDensity", label: "叶密度", min: 0, max: 14, step: 1, default: 8 },
    { key: "leafSize", label: "叶片大小", min: 0.07, max: 0.24, step: 0.01, default: 0.13 },
    { key: "fruitCount", label: "果实数量", min: 0, max: 24, step: 1, default: 12 },
    { key: "fruitSize", label: "果实大小", min: 0.035, max: 0.14, step: 0.005, default: 0.07 },
    { key: "seed", label: "种子", min: 0, max: 200, step: 1, default: 73 },
  ],
  build(p) {
    return buildTrellisFruitParts(p);
  },
};

const columnCypressAuthoringModel = {
  id: "veg-column-cypress",
  name: "柱形柏树",
  schema: [
    { key: "height", label: "树高", min: 3.0, max: 9.0, step: 0.1, default: 5.8 },
    { key: "trunkRadius", label: "主干半径", min: 0.06, max: 0.28, step: 0.01, default: 0.16 },
    { key: "crownRadius", label: "冠柱半径", min: 0.35, max: 1.4, step: 0.02, default: 0.72 },
    { key: "primaryBranches", label: "一级枝数", min: 5, max: 18, step: 1, default: 12 },
    { key: "secondaryBranches", label: "二级枝数", min: 1, max: 7, step: 1, default: 3 },
    { key: "twigBranches", label: "末级枝数", min: 0, max: 5, step: 1, default: 2 },
    { key: "gnarl", label: "枝干弯曲", min: 0, max: 0.22, step: 0.01, default: 0.06 },
    { key: "leafDensity", label: "叶密度", min: 0, max: 16, step: 1, default: 11 },
    { key: "leafSize", label: "叶片大小", min: 0.05, max: 0.22, step: 0.01, default: 0.11 },
    { key: "seed", label: "种子", min: 0, max: 200, step: 1, default: 97 },
  ],
  build(p) {
    return buildColumnCypressParts(p);
  },
};

const authoringLineupModel = {
  id: "veg-authoring-lineup",
  name: "新树木技术对比",
  schema: [
    { key: "heightScale", label: "整体高度倍率", min: 0.65, max: 1.35, step: 0.05, default: 1 },
    { key: "leafScale", label: "叶量倍率", min: 0, max: 1.5, step: 0.05, default: 0.9 },
    { key: "spacing", label: "间距", min: 2.6, max: 5.2, step: 0.1, default: 3.5 },
    { key: "seedOffset", label: "种子偏移", min: 0, max: 120, step: 1, default: 0 },
  ],
  build(p) {
    const broad = defaultParams(authoredBroadleafModel);
    broad.height *= p.heightScale;
    broad.trunkRadius *= p.heightScale;
    broad.crownWidth *= p.heightScale;
    broad.crownDepth *= p.heightScale;
    broad.leafDensity = Math.round(broad.leafDensity * p.leafScale);
    broad.seed += Math.round(p.seedOffset);

    const trellis = defaultParams(trellisFruitModel);
    trellis.height *= p.heightScale;
    trellis.trunkRadius *= p.heightScale;
    trellis.frameWidth *= p.heightScale;
    trellis.leafDensity = Math.round(trellis.leafDensity * p.leafScale);
    trellis.seed += Math.round(p.seedOffset) + 7;

    const cypress = defaultParams(columnCypressAuthoringModel);
    cypress.height *= p.heightScale;
    cypress.trunkRadius *= p.heightScale;
    cypress.crownRadius *= p.heightScale;
    cypress.leafDensity = Math.round(cypress.leafDensity * p.leafScale);
    cypress.seed += Math.round(p.seedOffset) + 13;

    return [
      ...offsetParts(buildAuthoredBroadleafParts(broad), "broadleaf", "阔叶", -p.spacing),
      ...offsetParts(buildTrellisFruitParts(trellis), "trellis", "棚架", 0),
      ...offsetParts(buildColumnCypressParts(cypress), "cypress", "柏树", p.spacing),
    ];
  },
};

const shrubModel = {
  id: "veg-shrub",
  name: "程序化灌木",
  schema: [
    { key: "height", label: "高度", min: 0.6, max: 2.5, step: 0.05, default: 1.5 },
    { key: "stems", label: "丛生杆数", min: 2, max: 10, step: 1, default: 6 },
    { key: "spread", label: "展开度", min: 0.1, max: 0.6, step: 0.02, default: 0.25 },
    { key: "leafDensity", label: "叶密度", min: 2, max: 18, step: 1, default: 11 },
    { key: "leafSize", label: "叶片大小", min: 0.06, max: 0.25, step: 0.01, default: 0.12 },
    { key: "seed", label: "种子", min: 0, max: 60, step: 1, default: 11 },
  ],
  build(p) {
    const s = shrub({
      seed: Math.round(p.seed),
      height: p.height,
      stems: Math.round(p.stems),
      spread: p.spread,
      leafDensity: Math.round(p.leafDensity),
      leafSize: p.leafSize,
    });
    return [
      surfPart("stems", s.wood, "wood", { color: BARK_COL, roughness: 0.9 }),
      windSurfPart("foliage", s.leaves, "fabric", { color: [0.32, 0.55, 0.18], roughness: 0.7 }, "foliage"),
    ];
  },
};

const grassModel = {
  id: "veg-grass",
  name: "程序化草地",
  schema: [
    { key: "blades", label: "草叶数", min: 50, max: 800, step: 10, default: 320 },
    { key: "area", label: "面积", min: 1, max: 5, step: 0.2, default: 2.4 },
    { key: "height", label: "草高", min: 0.15, max: 0.8, step: 0.02, default: 0.45 },
    { key: "bend", label: "弯曲", min: 0, max: 0.5, step: 0.02, default: 0.22 },
    { key: "seed", label: "种子", min: 0, max: 60, step: 1, default: 5 },
  ],
  build(p) {
    const g = grass({
      seed: Math.round(p.seed),
      blades: Math.round(p.blades),
      area: p.area,
      height: p.height,
      bend: p.bend,
    });
    return [windSurfPart("blades", g.leaves, "fabric", { color: BLADE_COL, roughness: 0.75 }, "tree")];
  },
};

const coniferModel = {
  id: "veg-conifer",
  name: "程序化针叶树",
  schema: [
    { key: "height", label: "树高", min: 3, max: 9, step: 0.2, default: 5 },
    { key: "trunkRadius", label: "主干半径", min: 0.08, max: 0.3, step: 0.01, default: 0.16 },
    { key: "whorls", label: "枝层数", min: 4, max: 16, step: 1, default: 9 },
    { key: "perWhorl", label: "每层枝数", min: 3, max: 10, step: 1, default: 6 },
    { key: "needleDensity", label: "针叶密度", min: 2, max: 8, step: 1, default: 5 },
    { key: "seed", label: "种子", min: 0, max: 60, step: 1, default: 1 },
  ],
  build(p) {
    const c = conifer({
      seed: Math.round(p.seed),
      height: p.height,
      trunkRadius: p.trunkRadius,
      whorls: Math.round(p.whorls),
      perWhorl: Math.round(p.perWhorl),
      needleDensity: Math.round(p.needleDensity),
    });
    return [
      surfPart("trunk", c.wood, "wood", { color: BARK_COL, roughness: 0.9 }),
      windSurfPart("needles", c.leaves, "fabric", { color: [0.13, 0.34, 0.16], roughness: 0.7 }, "foliage"),
    ];
  },
};

const palmModel = {
  id: "veg-palm",
  name: "程序化棕榈树",
  schema: [
    { key: "height", label: "树高", min: 3, max: 9, step: 0.2, default: 5 },
    { key: "trunkRadius", label: "主干半径", min: 0.08, max: 0.25, step: 0.01, default: 0.14 },
    { key: "fronds", label: "叶片数", min: 4, max: 16, step: 1, default: 9 },
    { key: "frondLength", label: "叶长", min: 1, max: 3, step: 0.1, default: 1.8 },
    { key: "lean", label: "倾斜", min: 0, max: 1, step: 0.05, default: 0.4 },
    { key: "seed", label: "种子", min: 0, max: 60, step: 1, default: 1 },
  ],
  build(p) {
    const pl = palm({
      seed: Math.round(p.seed),
      height: p.height,
      trunkRadius: p.trunkRadius,
      fronds: Math.round(p.fronds),
      frondLength: p.frondLength,
      lean: p.lean,
    });
    return [
      surfPart("trunk", pl.wood, "wood", { color: [0.4, 0.3, 0.18], roughness: 0.9 }),
      windSurfPart("fronds", pl.leaves, "fabric", { color: [0.22, 0.46, 0.16], roughness: 0.7 }, "foliage"),
    ];
  },
};

// ---- SpeedTree-lite: live procedural tree recipes, not static exported JSON ----
const SPEEDTREE_SPECIES = [
  { id: "oak", label: "橡树", seed: 101, height: 4.6 },
  { id: "maple", label: "枫树", seed: 117, height: 4.2 },
  { id: "birch", label: "桦树", seed: 131, height: 5.0 },
  { id: "willow", label: "柳树", seed: 149, height: 4.8 },
  { id: "pine", label: "松树", seed: 163, height: 5.6 },
  { id: "spruce", label: "云杉", seed: 179, height: 6.1 },
  { id: "palm", label: "棕榈树", seed: 191, height: 5.2 },
];

const SPEEDTREE_TREE_SCHEMA = [
  { key: "height", label: "树高", min: 2.4, max: 7.5, step: 0.1, default: 4.6 },
  { key: "trunkRadius", label: "主干半径", min: 0.08, max: 0.7, step: 0.01, default: 0.28 },
  { key: "branchCount", label: "一级枝数", min: 3, max: 12, step: 1, default: 8 },
  { key: "depth", label: "分叉层级", min: 1, max: 4, step: 1, default: 3 },
  { key: "branchAngle", label: "出枝角", min: 25, max: 78, step: 1, default: 54 },
  { key: "gnarl", label: "弯曲度", min: 0, max: 0.42, step: 0.01, default: 0.16 },
  { key: "leafDensity", label: "叶密度", min: 0, max: 16, step: 1, default: 9 },
  { key: "leafSize", label: "叶片大小", min: 0.06, max: 0.32, step: 0.01, default: 0.18 },
  { key: "flareScale", label: "枝根膨大", min: 1, max: 2.6, step: 0.05, default: 1.8 },
  { key: "featureCount", label: "树皮特征", min: 0, max: 28, step: 1, default: 9 },
  { key: "seed", label: "种子", min: 0, max: 500, step: 1, default: 101 },
];

const SPEEDTREE_CONIFER_SCHEMA = [
  { key: "height", label: "树高", min: 3, max: 9, step: 0.1, default: 5.6 },
  { key: "trunkRadius", label: "主干半径", min: 0.08, max: 0.35, step: 0.01, default: 0.17 },
  { key: "whorls", label: "枝层数", min: 4, max: 16, step: 1, default: 9 },
  { key: "perWhorl", label: "每层枝数", min: 3, max: 10, step: 1, default: 6 },
  { key: "needleDensity", label: "针叶密度", min: 1, max: 8, step: 1, default: 5 },
  { key: "seed", label: "种子", min: 0, max: 500, step: 1, default: 163 },
];

const SPEEDTREE_PALM_SCHEMA = [
  { key: "height", label: "树高", min: 3, max: 9, step: 0.1, default: 5.2 },
  { key: "trunkRadius", label: "主干半径", min: 0.08, max: 0.3, step: 0.01, default: 0.14 },
  { key: "fronds", label: "棕榈叶数", min: 4, max: 18, step: 1, default: 10 },
  { key: "frondLength", label: "叶长", min: 1, max: 3.2, step: 0.1, default: 1.9 },
  { key: "lean", label: "倾斜", min: -0.6, max: 1.1, step: 0.05, default: 0.42 },
  { key: "seed", label: "种子", min: 0, max: 500, step: 1, default: 191 },
];

function schemaWithDefaults(schema, defaults) {
  return schema.map((s) => ({ ...s, default: defaults[s.key] ?? s.default }));
}

function speciesSchema(entry) {
  if (entry.id === "pine" || entry.id === "spruce") {
    const preset = vegetationSpeciesPreset(entry.id).conifer || {};
    return schemaWithDefaults(SPEEDTREE_CONIFER_SCHEMA, { ...preset, seed: entry.seed, height: entry.height });
  }
  if (entry.id === "palm") {
    const preset = vegetationSpeciesPreset(entry.id).palm || {};
    return schemaWithDefaults(SPEEDTREE_PALM_SCHEMA, { ...preset, seed: entry.seed, height: entry.height });
  }
  const preset = vegetationSpeciesPreset(entry.id).tree || {};
  return schemaWithDefaults(SPEEDTREE_TREE_SCHEMA, {
    ...preset,
    seed: entry.seed,
    height: entry.height,
    flareScale: preset.branchFlareScale ?? 1.8,
    featureCount: typeof preset.branchFeatures === "object" ? (preset.branchFeatures.count ?? 9) : 0,
  });
}

function makeSpeciesModel(entry) {
  return {
    id: `speedtree-${entry.id}`,
    name: `SpeedTree-lite ${entry.label}`,
    schema: speciesSchema(entry),
    build(p) {
      const seed = Math.round(p.seed);
      let overrides;
      if (entry.id === "pine" || entry.id === "spruce") {
        overrides = {
          conifer: {
            seed,
            height: p.height,
            trunkRadius: p.trunkRadius,
            whorls: Math.round(p.whorls),
            perWhorl: Math.round(p.perWhorl),
            needleDensity: Math.round(p.needleDensity),
          },
        };
      } else if (entry.id === "palm") {
        overrides = {
          palm: {
            seed,
            height: p.height,
            trunkRadius: p.trunkRadius,
            fronds: Math.round(p.fronds),
            frondLength: p.frondLength,
            lean: p.lean,
          },
        };
      } else {
        const featureBase = vegetationSpeciesPreset(entry.id).tree?.branchFeatures || {};
        overrides = {
          tree: {
            seed,
            height: p.height,
            trunkRadius: p.trunkRadius,
            branchCount: Math.round(p.branchCount),
            depth: Math.round(p.depth),
            branchAngle: p.branchAngle,
            gnarl: p.gnarl,
            leafDensity: Math.round(p.leafDensity),
            leafSize: p.leafSize,
            leaves: p.leafDensity > 0,
            branchFlareScale: p.flareScale,
            branchFeatures: p.featureCount > 0 ? { ...featureBase, count: Math.round(p.featureCount) } : false,
          },
        };
      }
      const preset = vegetationSpeciesPreset(entry.id, overrides);
      const plant = buildSpeciesPlant(entry.id, overrides);
      return speedTreePlantParts(entry.label, plant, preset.barkColor, preset.leafColor, seed, entry.id);
    },
  };
}

function speedTreePlantParts(label, plant, barkColor, leafColor, seed, tag) {
  const parts = [
    speedTreePart("wood", plant.wood, "wood", { color: barkColor, roughness: 0.9 }, "wood", seed),
  ];
  parts[0].label = `${label} 枝干`;
  parts[0].metadata = { generator: "spline-sweep-branch-flare", tag };
  if (plant.leaves.positions.length > 0) {
    const leaf = speedTreePart("foliage", plant.leaves, "fabric", { color: leafColor, roughness: 0.72 }, "foliage", seed + 1);
    leaf.label = `${label} 叶冠`;
    leaf.metadata = { generator: "procedural-shaped-leaf-or-frond", tag };
    parts.push(leaf);
  }
  return parts;
}

const SPEEDTREE_ARCHETYPES = [
  {
    id: "column-cypress",
    name: "柱形柏树",
    bark: [0.36, 0.25, 0.16],
    leaf: [0.06, 0.25, 0.14],
    guide: { height: 6.2, crownWidth: 1.25, crownDepth: 1.05, crownBasePct: 0.12, trunkLean: 0, shape: "column" },
    tree: {
      seed: 307,
      trunkRadius: 0.18,
      gnarl: 0.04,
      branchCount: 9,
      depth: 3,
      branchAngle: 26,
      leafDensity: 4,
      leafSize: 0.1,
      leafShape: "lanceolate",
      leafCurl: 0.12,
      branchFlareScale: 1.35,
      branchLengthProfile: { stops: [{ t: 0, value: 0.55 }, { t: 0.55, value: 0.72 }, { t: 1, value: 0.38 }], smooth: true },
      branchAngleProfile: { value: 0.72, variance: 0.08, seed: 307, min: 0.48, max: 0.92 },
      branchCountProfile: [{ t: 0, value: 1.25 }, { t: 0.8, value: 0.7 }, { t: 1, value: 0.35 }],
      leafDensityProfile: [{ t: 0, value: 0.45 }, { t: 0.45, value: 1.25 }, { t: 1, value: 0.95 }],
      branchFeatures: { count: 5, size: 0.7 },
    },
  },
  {
    id: "baobab",
    name: "猴面包树",
    bark: [0.53, 0.42, 0.29],
    leaf: [0.16, 0.42, 0.18],
    guide: { height: 4.8, crownWidth: 4.5, crownDepth: 3.6, crownBasePct: 0.48, trunkLean: 0, shape: "umbrella" },
    tree: {
      seed: 331,
      trunkRadius: 0.62,
      gnarl: 0.09,
      branchCount: 8,
      depth: 3,
      branchAngle: 66,
      leafDensity: 5,
      leafSize: 0.16,
      leafShape: "round",
      leafFold: 0.08,
      branchFlareScale: 2.2,
      branchLengthProfile: [{ t: 0, value: 0.35 }, { t: 0.55, value: 1.3 }, { t: 1, value: 0.75 }],
      branchRadiusProfile: [{ t: 0, value: 1.35 }, { t: 1, value: 0.6 }],
      leafDensityProfile: [{ t: 0, value: 0.15 }, { t: 0.68, value: 0.8 }, { t: 1, value: 1.15 }],
      branchFeatures: { count: 22, size: 1.3, minBranchRadius: 0.05 },
    },
  },
  {
    id: "windswept-coastal-pine",
    name: "风吹海岸松",
    bark: [0.28, 0.19, 0.13],
    leaf: [0.08, 0.29, 0.17],
    guide: { height: 5.2, crownWidth: 3.4, crownDepth: 1.6, trunkLean: 1.15, crownBasePct: 0.34, shape: "ellipsoid" },
    tree: {
      seed: 353,
      trunkRadius: 0.28,
      gnarl: 0.2,
      branchCount: 8,
      depth: 3,
      branchAngle: 52,
      leafDensity: 5,
      leafSize: 0.14,
      leafShape: "lanceolate",
      leafCurl: 0.2,
      leafFold: 0.15,
      branchFlareScale: 1.75,
      branchLengthProfile: { stops: [{ t: 0, value: 0.25 }, { t: 0.52, value: 1.25 }, { t: 1, value: 0.85 }], variance: 0.18, seed: 353, min: 0.1 },
      branchAngleProfile: [{ t: 0, value: 0.65 }, { t: 0.65, value: 1.2 }, { t: 1, value: 0.82 }],
      leafDensityProfile: [{ t: 0, value: 0.2 }, { t: 0.55, value: 1.0 }, { t: 1, value: 0.65 }],
      branchFeatures: { count: 13, kind: "scar", size: 0.95 },
    },
  },
  {
    id: "dead-snag",
    name: "枯树残干",
    bark: [0.48, 0.43, 0.35],
    guide: { height: 4.3, crownWidth: 2.4, crownDepth: 1.7, trunkLean: -0.28, crownBasePct: 0.24, shape: "cone" },
    tree: {
      seed: 379,
      trunkRadius: 0.34,
      gnarl: 0.28,
      branchCount: 8,
      depth: 2,
      branchAngle: 58,
      leaves: false,
      leafDensity: 0,
      leafSize: 0.12,
      branchFlareScale: 1.55,
      branchLengthProfile: { stops: [{ t: 0, value: 0.95 }, { t: 0.58, value: 0.72 }, { t: 1, value: 0.22 }], variance: 0.22, seed: 379, min: 0.12 },
      branchRadiusProfile: [{ t: 0, value: 0.9 }, { t: 1, value: 0.42 }],
      branchCountProfile: [{ t: 0, value: 0.85 }, { t: 1, value: 0.35 }],
      branchFeatures: { count: 26, kind: "mixed", size: 1.1, minBranchRadius: 0.035 },
    },
  },
  {
    id: "blossom-tree",
    name: "开花小乔木",
    bark: [0.36, 0.23, 0.18],
    leaf: [0.96, 0.56, 0.72],
    guide: { height: 3.6, crownWidth: 3.5, crownDepth: 3.0, trunkLean: 0.18, crownBasePct: 0.26, shape: "ellipsoid" },
    tree: {
      seed: 401,
      trunkRadius: 0.2,
      gnarl: 0.14,
      branchCount: 8,
      depth: 3,
      branchAngle: 54,
      leafDensity: 6,
      leafSize: 0.12,
      leafShape: "teardrop",
      leafCurl: 0.1,
      leafFold: 0.06,
      branchFlareScale: 1.6,
      branchLengthProfile: { stops: [{ t: 0, value: 0.7 }, { t: 0.55, value: 1.1 }, { t: 1, value: 0.72 }], variance: 0.1, seed: 401 },
      leafDensityProfile: [{ t: 0, value: 0.25 }, { t: 0.55, value: 1.2 }, { t: 1, value: 1.35 }],
      branchFeatures: { count: 7, kind: "knot", size: 0.85 },
    },
  },
  {
    id: "bonsai-pine",
    name: "盆景松",
    bark: [0.27, 0.18, 0.12],
    leaf: [0.06, 0.2, 0.12],
    guide: { height: 1.65, crownWidth: 2.1, crownDepth: 1.35, trunkLean: -0.42, crownBasePct: 0.18, shape: "umbrella" },
    tree: {
      seed: 433,
      trunkRadius: 0.18,
      gnarl: 0.36,
      branchCount: 7,
      depth: 3,
      branchAngle: 72,
      leafDensity: 6,
      leafSize: 0.08,
      leafShape: "lanceolate",
      leafCurl: 0.24,
      leafFold: 0.12,
      branchFlareScale: 1.9,
      branchLengthProfile: { stops: [{ t: 0, value: 0.65 }, { t: 0.42, value: 1.35 }, { t: 1, value: 0.5 }], variance: 0.18, seed: 433, min: 0.18 },
      branchAngleProfile: { value: 1.15, variance: 0.16, seed: 433, min: 0.72, max: 1.45 },
      branchCountProfile: [{ t: 0, value: 1.1 }, { t: 0.7, value: 0.82 }, { t: 1, value: 0.35 }],
      leafDensityProfile: [{ t: 0, value: 0.15 }, { t: 0.55, value: 1.05 }, { t: 1, value: 0.9 }],
      branchFeatures: { count: 10, kind: "burl", size: 0.9 },
    },
  },
];

function customDefaults(cfg) {
  const features = typeof cfg.tree.branchFeatures === "object" ? cfg.tree.branchFeatures : {};
  return {
    height: cfg.guide.height,
    crownWidth: cfg.guide.crownWidth,
    crownDepth: cfg.guide.crownDepth,
    trunkLean: cfg.guide.trunkLean ?? 0,
    crownBasePct: cfg.guide.crownBasePct,
    trunkRadius: cfg.tree.trunkRadius,
    branchCount: cfg.tree.branchCount,
    depth: cfg.tree.depth,
    branchAngle: cfg.tree.branchAngle,
    gnarl: cfg.tree.gnarl,
    leafDensity: cfg.tree.leafDensity ?? 0,
    leafSize: cfg.tree.leafSize ?? 0.12,
    flareScale: cfg.tree.branchFlareScale ?? 1.6,
    featureCount: features.count ?? 0,
    featureSize: features.size ?? 1,
    seed: cfg.tree.seed,
  };
}

function customSchema(cfg) {
  const d = customDefaults(cfg);
  return [
    { key: "height", label: "树高", min: 1.2, max: 8, step: 0.1, default: d.height },
    { key: "crownWidth", label: "树冠宽度", min: 0.7, max: 5.5, step: 0.05, default: d.crownWidth },
    { key: "crownDepth", label: "树冠深度", min: 0.7, max: 5, step: 0.05, default: d.crownDepth },
    { key: "trunkLean", label: "主干倾斜", min: -1.4, max: 1.4, step: 0.02, default: d.trunkLean },
    { key: "crownBasePct", label: "树冠起点", min: 0.08, max: 0.65, step: 0.01, default: d.crownBasePct },
    { key: "trunkRadius", label: "主干半径", min: 0.06, max: 0.75, step: 0.01, default: d.trunkRadius },
    { key: "branchCount", label: "一级枝数", min: 2, max: 12, step: 1, default: d.branchCount },
    { key: "depth", label: "分叉层级", min: 1, max: 4, step: 1, default: d.depth },
    { key: "branchAngle", label: "出枝角", min: 18, max: 78, step: 1, default: d.branchAngle },
    { key: "gnarl", label: "弯曲度", min: 0, max: 0.45, step: 0.01, default: d.gnarl },
    { key: "leafDensity", label: "叶密度", min: 0, max: 10, step: 1, default: d.leafDensity },
    { key: "leafSize", label: "叶片大小", min: 0.05, max: 0.28, step: 0.01, default: d.leafSize },
    { key: "flareScale", label: "枝根膨大", min: 1, max: 2.8, step: 0.05, default: d.flareScale },
    { key: "featureCount", label: "树皮特征", min: 0, max: 32, step: 1, default: d.featureCount },
    { key: "featureSize", label: "特征大小", min: 0.3, max: 1.6, step: 0.05, default: d.featureSize },
    { key: "seed", label: "种子", min: 0, max: 500, step: 1, default: d.seed },
  ];
}

function buildCustomSpeedTreeParts(cfg, p) {
  const seed = Math.round(p.seed);
  const featureBase = typeof cfg.tree.branchFeatures === "object" ? cfg.tree.branchFeatures : {};
  const opts = {
    ...cfg.tree,
    seed,
    trunkRadius: p.trunkRadius,
    branchCount: Math.round(p.branchCount),
    depth: Math.round(p.depth),
    branchAngle: p.branchAngle,
    gnarl: p.gnarl,
    leafDensity: Math.round(p.leafDensity),
    leafSize: p.leafSize,
    leaves: !!cfg.leaf && p.leafDensity > 0,
    branchFlareScale: p.flareScale,
    branchFeatures: p.featureCount > 0 ? { ...featureBase, count: Math.round(p.featureCount), size: p.featureSize } : false,
  };
  const plant = buildTreeFromGuide(treeGuideFromSilhouette({
    ...cfg.guide,
    height: p.height,
    crownWidth: p.crownWidth,
    crownDepth: p.crownDepth,
    trunkLean: p.trunkLean,
    crownBasePct: p.crownBasePct,
  }), opts);
  return speedTreePlantParts(cfg.name, plant, cfg.bark, cfg.leaf || [0.2, 0.38, 0.16], seed, cfg.id);
}

function makeCustomSpeedTreeModel(cfg) {
  return {
    id: `speedtree-custom-${cfg.id}`,
    name: `SpeedTree-lite ${cfg.name}`,
    schema: customSchema(cfg),
    build(p) {
      return buildCustomSpeedTreeParts(cfg, p);
    },
  };
}

const speedtreeGuidedCanopy = {
  id: "speedtree-guided-canopy",
  name: "SpeedTree-lite 引导树冠",
  schema: customSchema({
    id: "guided-canopy",
    name: "引导树冠",
    bark: [0.31, 0.21, 0.13],
    leaf: [0.16, 0.36, 0.12],
    guide: { height: 4.7, crownWidth: 3.5, crownDepth: 2.7, trunkLean: -0.42, crownBasePct: 0.22, shape: "umbrella" },
    tree: {
      seed: 233,
      trunkRadius: 0.26,
      branchCount: 9,
      depth: 3,
      branchAngle: 56,
      gnarl: 0.12,
      leafDensity: 10,
      leafSize: 0.18,
      leafShape: "oval",
      branchFlareScale: 1.8,
      branchFeatures: { count: 10, size: 1.0 },
      branchLengthProfile: [{ t: 0, value: 1.25 }, { t: 0.6, value: 1.1 }, { t: 1, value: 0.65 }],
      leafDensityProfile: [{ t: 0, value: 0.35 }, { t: 0.7, value: 1.15 }, { t: 1, value: 0.8 }],
    },
  }),
  build(p) {
    return buildCustomSpeedTreeParts({
      id: "guided-canopy",
      name: "引导树冠",
      bark: [0.31, 0.21, 0.13],
      leaf: [0.16, 0.36, 0.12],
      guide: { height: 4.7, crownWidth: 3.5, crownDepth: 2.7, trunkLean: -0.42, crownBasePct: 0.22, shape: "umbrella" },
      tree: {
        seed: 233,
        trunkRadius: 0.26,
        branchCount: 9,
        depth: 3,
        branchAngle: 56,
        gnarl: 0.12,
        leafDensity: 10,
        leafSize: 0.18,
        leafShape: "oval",
        branchFlareScale: 1.8,
        branchFeatures: { count: 10, size: 1.0 },
        branchLengthProfile: [{ t: 0, value: 1.25 }, { t: 0.6, value: 1.1 }, { t: 1, value: 0.65 }],
        leafDensityProfile: [{ t: 0, value: 0.35 }, { t: 0.7, value: 1.15 }, { t: 1, value: 0.8 }],
      },
    }, p);
  },
};

const speedtreeSpeciesLineup = {
  id: "speedtree-species-lineup",
  name: "SpeedTree-lite 树种对比",
  schema: [
    { key: "heightScale", label: "整体高度倍率", min: 0.7, max: 1.35, step: 0.05, default: 1 },
    { key: "leafScale", label: "叶量倍率", min: 0, max: 1.5, step: 0.05, default: 0.75 },
    { key: "spacing", label: "间距", min: 2.4, max: 4.5, step: 0.1, default: 3.2 },
    { key: "seedOffset", label: "种子偏移", min: 0, max: 80, step: 1, default: 0 },
  ],
  build(p) {
    const parts = [];
    const count = SPEEDTREE_SPECIES.length;
    for (let i = 0; i < count; i++) {
      const entry = SPEEDTREE_SPECIES[i];
      const model = makeSpeciesModel(entry);
      const params = defaultParams(model);
      params.height *= p.heightScale;
      if ("leafDensity" in params) params.leafDensity = Math.round(params.leafDensity * p.leafScale);
      if ("needleDensity" in params) params.needleDensity = Math.max(1, Math.round(params.needleDensity * p.leafScale));
      params.seed = Math.round(params.seed + p.seedOffset);
      const x = (i - (count - 1) * 0.5) * p.spacing;
      for (const part of model.build(params)) {
        parts.push({
          ...part,
          name: `${entry.id}_${part.name}`,
          label: part.label || `${entry.label} ${part.name}`,
          mesh: translateMesh(part.mesh, vec3(x, 0, 0)),
        });
      }
    }
    return parts;
  },
};

const speedtreeCustomLineup = {
  id: "speedtree-custom-lineup",
  name: "SpeedTree-lite 新树型对比",
  schema: [
    { key: "heightScale", label: "整体高度倍率", min: 0.7, max: 1.35, step: 0.05, default: 1 },
    { key: "leafScale", label: "叶量倍率", min: 0, max: 1.5, step: 0.05, default: 0.75 },
    { key: "spacing", label: "间距", min: 2.6, max: 4.8, step: 0.1, default: 3.4 },
    { key: "seedOffset", label: "种子偏移", min: 0, max: 80, step: 1, default: 0 },
  ],
  build(p) {
    const parts = [];
    const count = SPEEDTREE_ARCHETYPES.length;
    for (let i = 0; i < count; i++) {
      const cfg = SPEEDTREE_ARCHETYPES[i];
      const params = customDefaults(cfg);
      params.height *= p.heightScale;
      params.crownWidth *= p.heightScale;
      params.crownDepth *= p.heightScale;
      params.trunkRadius *= p.heightScale;
      params.leafDensity = Math.round(params.leafDensity * p.leafScale);
      params.seed = Math.round(params.seed + p.seedOffset);
      const x = (i - (count - 1) * 0.5) * p.spacing;
      for (const part of buildCustomSpeedTreeParts(cfg, params)) {
        parts.push({
          ...part,
          name: `${cfg.id}_${part.name}`,
          label: part.label || `${cfg.name} ${part.name}`,
          mesh: translateMesh(part.mesh, vec3(x, 0, 0)),
        });
      }
    }
    return parts;
  },
};

const SPEEDTREE_MODELS = Object.fromEntries([
  ...SPEEDTREE_SPECIES.map((entry) => [`speedtree-${entry.id}`, makeSpeciesModel(entry)]),
  ["speedtree-guided-canopy", speedtreeGuidedCanopy],
  ["speedtree-species-lineup", speedtreeSpeciesLineup],
  ...SPEEDTREE_ARCHETYPES.map((cfg) => [`speedtree-custom-${cfg.id}`, makeCustomSpeedTreeModel(cfg)]),
  ["speedtree-custom-lineup", speedtreeCustomLineup],
]);

// ---- mechanical dragonfly: head + compound eyes, short thorax, long
// segmented tail, four iridescent wings, six mechanical legs. Fully
// parametric and deterministic (no random) — silhouette over the reference. ----
const dragonfly = {
  id: "dragonfly",
  name: "机械蜻蜓",
  schema: [
    { key: "bodyLen", label: "腹部长度", min: 2, max: 5, step: 0.1, default: 3.4 },
    { key: "abdomenSegs", label: "腹部节数", min: 5, max: 14, step: 1, default: 9 },
    { key: "abdomenCurve", label: "尾部上翘", min: -0.2, max: 0.6, step: 0.02, default: 0.16 },
    { key: "wingLen", label: "翅膀长度", min: 1.6, max: 4, step: 0.1, default: 2.8 },
    { key: "wingWidth", label: "翅膀宽度", min: 0.4, max: 1.1, step: 0.02, default: 0.66 },
    { key: "wingTilt", label: "翅展抬角", min: -0.1, max: 0.6, step: 0.02, default: 0.14 },
    { key: "headSize", label: "复眼大小", min: 0.25, max: 0.6, step: 0.01, default: 0.4 },
    { key: "legLen", label: "腿长", min: 0.4, max: 1.2, step: 0.02, default: 0.78 },
    { key: "holes", label: "机械孔洞(0关1开,布尔较慢)", min: 0, max: 1, step: 1, default: 1 },
  ],
  build(p) {
    const DARK = [0.05, 0.045, 0.08];
    const STEEL = [0.13, 0.12, 0.17];
    const PURPLE = [0.2, 0.07, 0.32];
    const parts = [];

    // head + thorax fused into ONE seamless skin via metaballs — no hollow
    // gap at the neck joint. NEGATIVE blobs at the eye positions carve real
    // sockets the eyeballs nest into (organic dents, no boolean needed), then
    // we drill true mechanical through-holes with subtract (CSG) for the
    // perforated machine look.
    const headZ = 0.78;
    const eyeR = p.headSize * 0.62;       // smaller eyes so head/holes stay visible
    const eyeCx = p.headSize * 0.6;
    const eyeCy = 0.16;
    const eyeCz = headZ + 0.02;
    const core = metaballs([
      { center: vec3(0, 0, 0), radius: 0.62, strength: 1 },          // thorax
      { center: vec3(0, 0.16, 0.04), radius: 0.46, strength: 0.9 },  // dorsal hump
      { center: vec3(0, 0.05, 0.42), radius: 0.34, strength: 0.8 },  // neck bridge
      { center: vec3(0, 0.06, headZ), radius: 0.4, strength: 1 },    // head
      // eye sockets: negative field scoops a concave seat on each side (free)
      { center: vec3(-eyeCx, eyeCy, eyeCz + 0.08), radius: p.headSize * 0.8, strength: -0.5 },
      { center: vec3(eyeCx, eyeCy, eyeCz + 0.08), radius: p.headSize * 0.8, strength: -0.5 },
    ], { iso: 0.5, resolution: 30 });

    // mechanical through-holes (optional — boolean is the slow path). When on,
    // merge all drill bits into ONE tool mesh and subtract once. Holes are
    // placed on EXPOSED surfaces: a vertical bore through the dorsal hump top
    // (visible from above) and a lateral bore through the front thorax flank
    // (forward of the wing roots, not hidden behind the eyes). metaball output
    // is watertight so CSG is clean. Off => instant rebuild for slider drag.
    let headThorax = core;
    if (Math.round(p.holes) === 1) {
      const drillTool = merge(
        // vertical lightening bore straight down through the dorsal hump
        transform(cylinder(0.1, 1.0, 16, true), { translate: vec3(0, 0.2, 0.05) }),
        // a pair of smaller vertical bores flanking it
        transform(cylinder(0.05, 1.0, 12, true), { translate: vec3(-0.17, 0.18, 0.18) }),
        transform(cylinder(0.05, 1.0, 12, true), { translate: vec3(0.17, 0.18, 0.18) }),
        // lateral bore through the lower-front flank (exposed, ahead of wings)
        transform(cylinder(0.08, 1.4, 14, true), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(0, -0.05, 0.3) }),
      );
      headThorax = cleanMesh(subtract(core, drillTool));
    }
    parts.push(surfPart("cephalothorax", headThorax, "metal", { color: STEEL, roughness: 0.32 }));
    // slim dorsal accent ridge — kept narrow so it does NOT cap the bores
    parts.push(surfPart("dorsal_ridge", transform(scaleMesh(sphere(1, 18, 12), vec3(0.08, 0.12, 0.34)), { translate: vec3(0, 0.34, 0.0) }), "metal", { color: PURPLE, roughness: 0.28 }));

    // compound eyes nest into the carved sockets; antennae + jaw accents
    for (const side of [-1, 1]) {
      parts.push(surfPart(`eye_${side}`, transform(scaleMesh(sphere(eyeR, 22, 16), vec3(0.92, 1, 0.95)), { translate: vec3(side * eyeCx, eyeCy, eyeCz) }), "iridescent", { color: [0.26, 0.13, 0.46] }));
      parts.push(surfPart(`antenna_${side}`, transform(cylinder(0.012, 0.34, 6, false), { rotate: vec3(-0.9, 0, side * 0.4), translate: vec3(side * 0.1, 0.22, headZ + 0.22) }), "metal", { color: STEEL }));
    }
    parts.push(surfPart("jaw", transform(scaleMesh(sphere(0.16, 14, 10), vec3(1, 0.65, 1.4)), { translate: vec3(0, -0.08, headZ + 0.2) }), "brushedMetal", { color: STEEL }));

    // abdomen (tail) — ONE continuous segmented tube along an arching spine,
    // tapering to the tip. Replaces the old string-of-spheres (which read as
    // disconnected beads). segmentedTube gives a seamless insect abdomen.
    const segs = Math.round(p.abdomenSegs);
    const startZ = -0.42;
    const spineN = Math.max(12, segs * 3);
    const spine = [];
    for (let i = 0; i < spineN; i++) {
      const t = i / (spineN - 1);
      const y = 0.04 + t * t * p.abdomenCurve * p.bodyLen * 0.45;
      spine.push(vec3(0, y, startZ - t * p.bodyLen));
    }
    const abdomen = segmentedTube(spine, {
      sides: 16,
      radius: 0.26,
      radiusAt: (t) => 1 - t * 0.78,
      segments: segs,
      segmentPinch: 0.16,
      segmentBulge: 0.1,
      caps: true,
    });
    parts.push(surfPart("abdomen", abdomen, "metal", { color: PURPLE, roughness: 0.3 }));
    // segment joint rings as a separate darker accent band set
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const y = 0.04 + t * t * p.abdomenCurve * p.bodyLen * 0.45;
      const z = startZ - t * p.bodyLen;
      const rr = 0.26 * (1 - t * 0.78) * 0.92;
      parts.push(surfPart(`joint_${i}`, transform(torus(rr, rr * 0.12, 14, 8), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(0, y, z) }), "brushedMetal", { color: STEEL }));
    }
    // tail-tip cerci (twin prongs)
    const tipZ = startZ - p.bodyLen;
    const tipY = 0.04 + p.abdomenCurve * p.bodyLen * 0.45;
    for (const side of [-1, 1]) {
      parts.push(surfPart(`cercus_${side}`, transform(cone(0.035, 0.24, 8, false), { rotate: vec3(-Math.PI / 2, 0, side * 0.2), translate: vec3(side * 0.035, tipY, tipZ - 0.12) }), "metal", { color: PURPLE, roughness: 0.3 }));
    }
    // four wings: fore + hind on each side, swept out and back from the
    // thorax top. Each wing is a thin elongated, slightly tapered blade with
    // a vein spar; iridescent so it shimmers like the reference.
    const wingDefs = [
      { name: "fore", z: 0.12, sweep: 0.32, len: p.wingLen, tint: [0.28, 0.1, 0.42] },
      { name: "hind", z: -0.16, sweep: -0.18, len: p.wingLen * 0.92, tint: [0.16, 0.08, 0.4] },
    ];
    for (const side of [-1, 1]) {
      for (const w of wingDefs) {
        // blade tapered along its length (root wide, tip narrow) then placed.
        let wing = scaleMesh(sphere(1, 18, 8), vec3(w.len * 0.5, 0.022, p.wingWidth * 0.5));
        wing = taperMesh(wing, { axis: "x", startScale: 1.05, endScale: 0.45, curve: 1.3 });
        const placed = transform(wing, {
          rotate: vec3(0, w.sweep * side, side * p.wingTilt),
          translate: vec3(side * (0.18 + w.len * 0.46), 0.42, w.z),
        });
        parts.push(surfPart(`wing_${w.name}_${side}`, placed, "iridescent", { color: w.tint }));
        // leading-edge spar
        const spar = scaleMesh(box(1, 1, 1), vec3(w.len, 0.05, 0.03));
        parts.push(surfPart(`spar_${w.name}_${side}`, transform(spar, {
          rotate: vec3(0, w.sweep * side, side * p.wingTilt),
          translate: vec3(side * (0.18 + w.len * 0.46), 0.45, w.z + p.wingWidth * 0.22),
        }), "metal", { color: STEEL, roughness: 0.25 }));
      }
    }

    // six mechanical legs: two-segment, splayed from thorax underside (+z bias)
    const legBaseZ = [0.34, 0.0, -0.34];
    for (const side of [-1, 1]) {
      for (let li = 0; li < 3; li++) {
        const bz = legBaseZ[li];
        const out = side * 0.34;
        const hipX = out;
        const hipY = -0.2;
        const kneeX = side * (0.34 + p.legLen * 0.5);
        const kneeY = -0.18;
        const footX = side * (0.34 + p.legLen);
        const footY = -0.62;
        const upper = bezier(vec3(hipX, hipY, bz), vec3((hipX + kneeX) / 2, hipY + 0.16, bz + 0.04), vec3(kneeX, kneeY + 0.04, bz), vec3(kneeX, kneeY, bz), 10);
        const lower = bezier(vec3(kneeX, kneeY, bz), vec3(kneeX, kneeY - 0.12, bz), vec3(footX, footY + 0.18, bz), vec3(footX, footY, bz), 10);
        parts.push(surfPart(`leg_u_${side}_${li}`, sweep(upper, { radius: 0.035, sides: 7, radiusAt: (t) => 1 - t * 0.3, caps: true }), "metal", { color: DARK, roughness: 0.35 }));
        parts.push(surfPart(`leg_l_${side}_${li}`, sweep(lower, { radius: 0.026, sides: 7, radiusAt: (t) => 1 - t * 0.5, caps: true }), "metal", { color: STEEL, roughness: 0.35 }));
        parts.push(surfPart(`knee_${side}_${li}`, transform(sphere(0.045, 10, 8), { translate: vec3(kneeX, kneeY, bz) }), "brushedMetal", { color: PURPLE }));
      }
    }
    return parts;
  },
};

// ---- reference-image inspired procedural town: terrain mound + road network
//      + clustered colorful buildings + tree clumps + field patches ----------
const townScene = (() => {
  // Palette pulled from the reference bird's-eye render.
  const GROUND = [0.83, 0.76, 0.57];      // beige earth (ridge tops)
  const GROUND_LOW = [0.7, 0.63, 0.45];   // darker valleys -> readable relief
  const ROAD_COL = [0.8, 0.76, 0.68];     // cool pale-grey track: reads on warm beige ground
  const TREE_TRUNK = [0.34, 0.26, 0.16];
  const TREE_LEAF = [0.16, 0.34, 0.16];   // dark green clumps
  const BLD_COLORS = [
    [0.32, 0.74, 0.7],   // teal/cyan
    [0.9, 0.62, 0.72],   // pink
    [0.93, 0.82, 0.4],   // yellow
    [0.92, 0.92, 0.88],  // white
    [0.55, 0.72, 0.82],  // pale blue
    [0.86, 0.5, 0.42],   // terracotta
  ];
  const FIELD_COLORS = [
    [0.86, 0.55, 0.62], [0.6, 0.78, 0.5], [0.92, 0.8, 0.42],
    [0.5, 0.68, 0.78], [0.88, 0.86, 0.8], [0.78, 0.55, 0.72],
  ];

  // Sample terrain world-height at (wx, wz). Field grid maps linearly to
  // [-half, +half] on both axes (see heightfieldToTerrainMesh).
  function heightAt(field, size, heightScale, baseY, wx, wz) {
    const w = field.width, h = field.height;
    const half = size * 0.5;
    const gx = ((wx + half) / size) * (w - 1);
    const gy = ((wz + half) / size) * (h - 1);
    return baseY + sampleField2DBilinear(field, gx, gy) * heightScale;
  }

  return {
    id: "town-scene",
    name: "程序化小镇场景",
    schema: [
      { key: "size", label: "场景尺寸", min: 20, max: 60, step: 2, default: 40 },
      { key: "resolution", label: "地形密度", min: 32, max: 128, step: 8, default: 96 },
      { key: "moundHeight", label: "山体高度", min: 1, max: 10, step: 0.25, default: 5.5 },
      { key: "islandFalloff", label: "边缘收平", min: 0.8, max: 3, step: 0.1, default: 2.0 },
      { key: "noiseScale", label: "地形起伏", min: 0.6, max: 3.5, step: 0.1, default: 2.0 },
      { key: "buildings", label: "建筑数量", min: 20, max: 320, step: 10, default: 170 },
      { key: "clusters", label: "建筑簇数", min: 3, max: 14, step: 1, default: 9 },
      { key: "trees", label: "树丛数量", min: 0, max: 200, step: 10, default: 70 },
      { key: "roads", label: "道路条数", min: 2, max: 8, step: 1, default: 5 },
      { key: "fields", label: "田块数量", min: 0, max: 24, step: 2, default: 12 },
      { key: "seed", label: "随机种子", min: 0, max: 200, step: 1, default: 17 },
    ],
    build(p) {
      const parts = [];
      const size = p.size;
      const half = size * 0.5;
      const heightScale = 1;
      const baseY = 0;
      const seed = Math.round(p.seed) >>> 0;

      // --- terrain: central mound flattening toward the edges -------------
      const field = makeTerrainPrimitiveField({
        resolution: Math.round(p.resolution),
        seed,
        height: p.moundHeight,
        base: 0,
        noiseScale: p.noiseScale,
        ridgeScale: p.noiseScale * 2.4,
        ridgeStrength: 0.9,          // sharper ridges -> plateau/spur look
        islandFalloff: p.islandFalloff,
      });
      const terrain = heightfieldToTerrainMesh(field, { size, heightScale, baseY });
      // per-vertex color: beige, slightly lighter on the flats
      const tcolors = [];
      for (let i = 0; i < terrain.positions.length; i++) {
        const y = terrain.positions[i].y;
        const t = Math.min(1, Math.max(0, y / (p.moundHeight * 0.8)));
        const c = [
          GROUND_LOW[0] * (1 - t) + GROUND[0] * t,
          GROUND_LOW[1] * (1 - t) + GROUND[1] * t,
          GROUND_LOW[2] * (1 - t) + GROUND[2] * t,
        ];
        tcolors.push(c[0], c[1], c[2]);
      }
      parts.push({
        name: "terrain",
        mesh: terrain,
        color: GROUND,
        colors: tcolors,
        surface: { type: "sand", params: { color: GROUND, roughness: 1, seed } },
      });

      const rng = mulberry32(seed || 1);
      const hAt = (x, z) => heightAt(field, size, heightScale, baseY, x, z);

      // --- winding dirt roads: swept ribbons, then per-vertex draped onto
      //     the terrain so every point sits on the ground (no cutting into
      //     slopes or floating). No curbs/markings -> reads as a hill trail.
      //     Roads wander loosely for a tangled, organic layout. -----------
      // Re-set every ribbon vertex Y to terrain height + small lift, so the
      // road hugs the mound laterally as well as along its length.
      const drape = (mesh, lift) => {
        const pos = mesh.positions.map((v) => {
          const gy = hAt(v.x, v.z);
          return vec3(v.x, gy + lift, v.z);
        });
        return recomputeNormals(makeMesh({
          positions: pos,
          normals: mesh.normals,
          uvs: mesh.uvs,
          indices: mesh.indices,
        }));
      };
      const roadN = Math.round(p.roads);
      const surfMeshes = [];
      for (let r = 0; r < roadN; r++) {
        // start somewhere on the mound and wander outward with random turns,
        // so paths cross and tangle like the reference instead of clean radials
        const a0 = rng() * Math.PI * 2;
        const r0 = rng() * half * 0.35;
        let cxp = Math.cos(a0) * r0;
        let czp = Math.sin(a0) * r0;
        let dir = rng() * Math.PI * 2;
        const pts = [vec3(cxp, hAt(cxp, czp), czp)];
        const steps = 14 + Math.floor(rng() * 8);
        const stepLen = size * 0.09;
        for (let s = 0; s < steps; s++) {
          dir += (rng() - 0.5) * 1.1;              // meander
          cxp += Math.cos(dir) * stepLen;
          czp += Math.sin(dir) * stepLen;
          if (Math.abs(cxp) > half * 0.98 || Math.abs(czp) > half * 0.98) break;
          pts.push(vec3(cxp, hAt(cxp, czp), czp));
        }
        if (pts.length < 3) continue;
        const centerline = smoothCurve(polyline(pts), 3);
        const halfW = 1.0 + rng() * 0.5;
        const ribbon = roadRibbon(centerline, {
          halfWidth: halfW,
          sampleDistance: 0.6,
          widthSubdivisions: 3,
          adaptiveCurvature: true,
          curvatureThresholdDeg: 5,
        });
        surfMeshes.push(drape(ribbon, 0.05));
      }
      if (surfMeshes.length) {
        // pale sandy track: slightly lighter than ground, reads as the
        // washed-out roads in the reference (not dark cut-in trenches)
        parts.push(surfPart("dirt_roads", merge(...surfMeshes), "sand", { color: ROAD_COL, roughness: 1 }));
      }

      // --- clustered colorful buildings spread across the ridges ----------
      // Reference shows dense-but-separated little houses blanketing the
      // whole raised terrain, not one crowded blob. Spread cluster centers
      // over a wide radius and reject placements that overlap an already
      // placed footprint (min-distance packing) so houses read individually.
      const clusters = [];
      const nClusters = Math.round(p.clusters);
      for (let c = 0; c < nClusters; c++) {
        // spread centers across most of the mound (up to ~0.85*half),
        // near-uniform in area so no single blob dominates
        const a = rng() * Math.PI * 2;
        const rr = Math.sqrt(rng()) * half * 0.85;
        clusters.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, spread: size * (0.07 + rng() * 0.07) });
      }
      const bldByColor = BLD_COLORS.map(() => []);
      const placedB = [];                         // {x,z,r} for spacing test
      const minGap = size * 0.018;                // clearance between houses
      const nB = Math.round(p.buildings);
      let tries = 0;
      const maxTries = nB * 8;
      while (placedB.length < nB && tries < maxTries) {
        tries++;
        const cl = clusters[Math.floor(rng() * clusters.length)];
        const bx = cl.x + (rng() - 0.5) * cl.spread * 2;
        const bz = cl.z + (rng() - 0.5) * cl.spread * 2;
        if (Math.abs(bx) > half * 0.92 || Math.abs(bz) > half * 0.92) continue;
        const bw = 0.45 + rng() * 0.4;
        const bd = 0.45 + rng() * 0.4;
        const bh = 0.4 + rng() * 0.9;
        const rad = Math.max(bw, bd) * 0.5;
        // reject if too close to an existing house
        let ok = true;
        for (let k = 0; k < placedB.length; k++) {
          const q = placedB[k];
          const dx = q.x - bx, dz = q.z - bz;
          if (dx * dx + dz * dz < (q.r + rad + minGap) * (q.r + rad + minGap)) { ok = false; break; }
        }
        if (!ok) continue;
        placedB.push({ x: bx, z: bz, r: rad });
        const gy = hAt(bx, bz);
        const yaw = rng() * Math.PI;
        const ci = Math.floor(rng() * BLD_COLORS.length);
        let m = box(bw, bh, bd);
        m = transform(m, { rotate: vec3(0, yaw, 0), translate: vec3(bx, gy + bh * 0.5, bz) });
        bldByColor[ci].push(m);
      }
      for (let ci = 0; ci < BLD_COLORS.length; ci++) {
        if (bldByColor[ci].length) {
          parts.push(surfPart(`buildings_${ci}`, merge(...bldByColor[ci]), "ceramic", { color: BLD_COLORS[ci], roughness: 0.7 }));
        }
      }

      // --- dark-green tree clumps (trunk + conical canopy) ----------------
      const trunkMeshes = [];
      const leafMeshes = [];
      const nT = Math.round(p.trees);
      for (let i = 0; i < nT; i++) {
        // trees favor the flanks/edges of the mound
        const a = rng() * Math.PI * 2;
        const rr = (0.35 + rng() * 0.55) * half * 0.9;
        const tx = Math.cos(a) * rr;
        const tz = Math.sin(a) * rr;
        if (Math.abs(tx) > half * 0.95 || Math.abs(tz) > half * 0.95) continue;
        const gy = hAt(tx, tz);
        const th = 0.4 + rng() * 0.4;
        const cr = 0.35 + rng() * 0.3;
        const ch = 0.9 + rng() * 0.7;
        trunkMeshes.push(transform(cylinder(0.06, th, 6, true), { translate: vec3(tx, gy + th * 0.5, tz) }));
        leafMeshes.push(transform(cone(cr, ch, 7, true), { translate: vec3(tx, gy + th + ch * 0.5, tz) }));
      }
      if (trunkMeshes.length) parts.push(surfPart("tree_trunks", merge(...trunkMeshes), "bark", { color: TREE_TRUNK, roughness: 0.95 }));
      if (leafMeshes.length) parts.push(surfPart("tree_canopies", merge(...leafMeshes), "leaf", { color: TREE_LEAF, roughness: 0.85 }));

      // --- colorful field patches: a tidy grid tucked in the -x,-z corner,
      //     matching the reference's little quilt of farm plots ------------
      const fieldByColor = FIELD_COLORS.map(() => []);
      const nF = Math.round(p.fields);
      if (nF > 0) {
        const cols = Math.max(2, Math.round(Math.sqrt(nF)));
        const rows = Math.ceil(nF / cols);
        const cell = size * 0.055;                 // plot size
        const gap = cell * 0.14;
        const gridW = cols * (cell + gap);
        const gridD = rows * (cell + gap);
        // anchor near the lower-left corner of the map
        const ox = -half * 0.82;
        const oz = -half * 0.82;
        const tilt = -0.35;                          // whole quilt rotated a bit
        let placed = 0;
        for (let ry = 0; ry < rows && placed < nF; ry++) {
          for (let cx = 0; cx < cols && placed < nF; cx++) {
            const lx = cx * (cell + gap) - gridW * 0.5;
            const lz = ry * (cell + gap) - gridD * 0.5;
            // rotate the local grid coord by tilt around the anchor
            const rx = lx * Math.cos(tilt) - lz * Math.sin(tilt);
            const rz = lx * Math.sin(tilt) + lz * Math.cos(tilt);
            const fx = ox + gridW * 0.5 + rx;
            const fz = oz + gridD * 0.5 + rz;
            const gy = hAt(fx, fz);
            const jw = cell * (0.82 + rng() * 0.22);
            const jd = cell * (0.82 + rng() * 0.22);
            const ci = placed % FIELD_COLORS.length;
            let m = plane(jw, jd, 1, 1);
            m = transform(m, { rotate: vec3(0, -tilt, 0), translate: vec3(fx, gy + 0.04, fz) });
            fieldByColor[ci].push(m);
            placed++;
          }
        }
      }
      for (let ci = 0; ci < FIELD_COLORS.length; ci++) {
        if (fieldByColor[ci].length) {
          parts.push(surfPart(`fields_${ci}`, merge(...fieldByColor[ci]), "fabric", { color: FIELD_COLORS[ci], roughness: 0.9 }));
        }
      }

      return parts;
    },
  };
})();

// ---- project_titan HDA reproductions (curve-pieces + fracture kernels) ----
const titanRail = {
  id: "titan-rail",
  name: "泰坦轨道",
  schema: [
    { key: "length", label: "总长", min: 20, max: 96, step: 4, default: 48 },
    { key: "bend", label: "弯曲", min: 0, max: 16, step: 1, default: 8 },
    { key: "segmentLength", label: "段长", min: 1, max: 8, step: 0.5, default: 6 },
    { key: "concreteSleepers", label: "混凝土枕(0/1)", min: 0, max: 1, step: 1, default: 0 },
  ],
  build(p) {
    return buildTitanRailParts({
      length: p.length,
      bend: p.bend,
      segmentLength: p.segmentLength,
      concreteSleepers: Math.round(p.concreteSleepers) === 1,
    });
  },
};

const titanFence = {
  id: "titan-fence",
  name: "泰坦栅栏",
  schema: [
    { key: "length", label: "总长", min: 16, max: 80, step: 4, default: 40 },
    { key: "bend", label: "弯曲", min: 0, max: 12, step: 1, default: 5 },
    { key: "postSpacing", label: "立柱间距", min: 1, max: 4, step: 0.2, default: 2.2 },
    { key: "height", label: "高度", min: 0.8, max: 2.4, step: 0.1, default: 1.5 },
    { key: "rails", label: "横档数", min: 1, max: 6, step: 1, default: 3 },
    { key: "lean", label: "倾斜抖动", min: 0, max: 0.2, step: 0.01, default: 0.04 },
    { key: "metal", label: "金属(0/1)", min: 0, max: 1, step: 1, default: 0 },
    { key: "seed", label: "随机种子", min: 0, max: 64, step: 1, default: 7 },
  ],
  build(p) {
    return buildTitanFenceParts({
      length: p.length,
      bend: p.bend,
      postSpacing: p.postSpacing,
      height: p.height,
      rails: Math.round(p.rails),
      lean: p.lean,
      metal: Math.round(p.metal) === 1,
      seed: Math.round(p.seed),
    });
  },
};

const titanCable = {
  id: "titan-cable",
  name: "泰坦电缆",
  schema: [
    { key: "poles", label: "电杆数", min: 2, max: 10, step: 1, default: 4 },
    { key: "span", label: "跨距", min: 6, max: 24, step: 1, default: 12 },
    { key: "poleHeight", label: "杆高", min: 3, max: 12, step: 0.5, default: 6 },
    { key: "sag", label: "垂度", min: 0, max: 0.4, step: 0.02, default: 0.16 },
    { key: "subCables", label: "子缆数", min: 0, max: 6, step: 1, default: 2 },
    { key: "metalPoles", label: "金属杆(0/1)", min: 0, max: 1, step: 1, default: 0 },
  ],
  build(p) {
    return buildTitanCableParts({
      poles: Math.round(p.poles),
      span: p.span,
      poleHeight: p.poleHeight,
      sag: p.sag,
      subCables: Math.round(p.subCables),
      metalPoles: Math.round(p.metalPoles) === 1,
      controlPoints: p.controlPoints,
    });
  },
};

const titanAdBoard = {
  id: "titan-adboard",
  name: "泰坦广告牌",
  schema: [
    { key: "width", label: "板宽", min: 3, max: 12, step: 0.5, default: 6 },
    { key: "height", label: "板高", min: 1.5, max: 6, step: 0.5, default: 3 },
    { key: "postHeight", label: "立柱高", min: 2, max: 8, step: 0.5, default: 4 },
    { key: "tilt", label: "俯仰", min: -0.3, max: 0.3, step: 0.02, default: 0.08 },
    { key: "twinPosts", label: "双柱(0/1)", min: 0, max: 1, step: 1, default: 1 },
  ],
  build(p) {
    return buildTitanAdBoardParts({
      width: p.width,
      height: p.height,
      postHeight: p.postHeight,
      tilt: p.tilt,
      twinPosts: Math.round(p.twinPosts) === 1,
    });
  },
};

const titanShrub = {
  id: "titan-shrub",
  name: "泰坦灌木",
  schema: [
    { key: "branches", label: "枝数", min: 3, max: 16, step: 1, default: 7 },
    { key: "height", label: "高度", min: 0.6, max: 3, step: 0.1, default: 1.4 },
    { key: "spread", label: "张开角", min: 0.2, max: 1.4, step: 0.05, default: 0.7 },
    { key: "leavesPerBranch", label: "每枝叶数", min: 2, max: 30, step: 1, default: 14 },
    { key: "dryRatio", label: "枯叶比例", min: 0, max: 1, step: 0.05, default: 0.2 },
    { key: "bend", label: "整体弯曲", min: 0, max: 0.5, step: 0.02, default: 0.15 },
    { key: "seed", label: "随机种子", min: 0, max: 64, step: 1, default: 11 },
  ],
  build(p) {
    return buildTitanShrubParts({
      branches: Math.round(p.branches),
      height: p.height,
      spread: p.spread,
      leavesPerBranch: Math.round(p.leavesPerBranch),
      dryRatio: p.dryRatio,
      bend: p.bend,
      seed: Math.round(p.seed),
    });
  },
};

const titanPlatform = {
  id: "titan-platform",
  name: "泰坦平台",
  schema: [
    { key: "length", label: "长度", min: 4, max: 20, step: 1, default: 8 },
    { key: "width", label: "宽度", min: 3, max: 14, step: 1, default: 5 },
    { key: "height", label: "离地高", min: 0.2, max: 2, step: 0.1, default: 0.6 },
    { key: "plankWidth", label: "板宽", min: 0.2, max: 1, step: 0.05, default: 0.5 },
    { key: "border", label: "围栏(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "railHeight", label: "栏高", min: 0.4, max: 1.6, step: 0.1, default: 1 },
  ],
  build(p) {
    return buildTitanPlatformParts({
      length: p.length,
      width: p.width,
      height: p.height,
      plankWidth: p.plankWidth,
      border: Math.round(p.border) === 1,
      railHeight: p.railHeight,
    });
  },
};

const titanBuilding = {
  id: "titan-building",
  name: "泰坦建筑",
  schema: [
    { key: "width", label: "面宽", min: 6, max: 24, step: 1, default: 12 },
    { key: "depth", label: "进深", min: 5, max: 20, step: 1, default: 9 },
    { key: "floors", label: "楼层", min: 1, max: 12, step: 1, default: 4 },
    { key: "floorHeight", label: "层高", min: 2.2, max: 4.5, step: 0.1, default: 3 },
    { key: "bayWidth", label: "开间宽", min: 1, max: 4, step: 0.25, default: 2 },
    { key: "roof", label: "女儿墙(0/1)", min: 0, max: 1, step: 1, default: 1 },
  ],
  build(p) {
    return buildTitanBuildingParts({
      width: p.width,
      depth: p.depth,
      floors: Math.round(p.floors),
      floorHeight: p.floorHeight,
      bayWidth: p.bayWidth,
      roof: Math.round(p.roof) === 1,
    });
  },
};

const titanStacking = {
  id: "titan-stacking",
  name: "泰坦碎石堆",
  schema: [
    { key: "shards", label: "碎块数", min: 3, max: 24, step: 1, default: 12 },
    { key: "fractureSeed", label: "断裂种子", min: 0, max: 64, step: 1, default: 5 },
    { key: "stackSeed", label: "堆叠种子", min: 0, max: 64, step: 1, default: 2 },
    { key: "spread", label: "散布半径", min: 0.5, max: 5, step: 0.1, default: 2.2 },
    { key: "minScale", label: "最小缩放", min: 0.1, max: 1, step: 0.05, default: 0.2 },
    { key: "maxScale", label: "最大缩放", min: 0.1, max: 1.5, step: 0.05, default: 1 },
    { key: "focusBias", label: "冲击聚集", min: 0, max: 0.9, step: 0.05, default: 0 },
    { key: "roughen", label: "石面碎化", min: 0, max: 0.2, step: 0.01, default: 0.06 },
  ],
  build(p) {
    return buildTitanStackingParts({
      shards: Math.round(p.shards),
      fractureSeed: Math.round(p.fractureSeed),
      stackSeed: Math.round(p.stackSeed),
      spread: p.spread,
      minScale: p.minScale,
      maxScale: p.maxScale,
      focusBias: p.focusBias,
      roughen: p.roughen,
    });
  },
};

const titanTrain = {
  id: "titan-train",
  name: "泰坦火车",
  schema: [
    { key: "wagons", label: "车厢数", min: 0, max: 8, step: 1, default: 3 },
    { key: "carLength", label: "车长", min: 4, max: 14, step: 0.5, default: 8 },
    { key: "carWidth", label: "车宽", min: 1.8, max: 3.4, step: 0.1, default: 2.6 },
    { key: "carHeight", label: "车高", min: 1.8, max: 4, step: 0.1, default: 2.8 },
    { key: "damage", label: "破损量", min: 0, max: 1, step: 0.05, default: 0 },
    { key: "seed", label: "种子", min: 0, max: 64, step: 1, default: 7 },
  ],
  build(p) {
    return buildTitanTrainParts({
      wagons: Math.round(p.wagons),
      carLength: p.carLength,
      carWidth: p.carWidth,
      carHeight: p.carHeight,
      damage: p.damage,
      seed: Math.round(p.seed),
    });
  },
};

const titanTree = {
  id: "titan-tree",
  name: "泰坦树",
  schema: [
    { key: "levels", label: "分支层数", min: 1, max: 5, step: 1, default: 4 },
    { key: "trunkLength", label: "主干长", min: 1, max: 6, step: 0.25, default: 3 },
    { key: "branching", label: "每节分支", min: 2, max: 5, step: 1, default: 3 },
    { key: "spread", label: "张角", min: 0.2, max: 1.2, step: 0.05, default: 0.6 },
    { key: "leafSize", label: "叶片大小", min: 0, max: 0.8, step: 0.05, default: 0.4 },
    { key: "seed", label: "种子", min: 0, max: 64, step: 1, default: 11 },
  ],
  build(p) {
    return buildTitanTreeParts({
      levels: Math.round(p.levels),
      trunkLength: p.trunkLength,
      branching: Math.round(p.branching),
      spread: p.spread,
      leafSize: p.leafSize,
      seed: Math.round(p.seed),
    });
  },
};

const titanCloth = {
  id: "titan-cloth",
  name: "泰坦布料",
  schema: [
    { key: "width", label: "宽", min: 2, max: 8, step: 0.5, default: 4 },
    { key: "depth", label: "深", min: 2, max: 8, step: 0.5, default: 4 },
    { key: "resolution", label: "网格分辨率", min: 10, max: 60, step: 2, default: 40 },
    { key: "pinMode", label: "固定点(0角/1顶/2中/3两角/4无)", min: 0, max: 4, step: 1, default: 4 },
    { key: "sag", label: "垂坠深度", min: 0, max: 3, step: 0.1, default: 1.6 },
    { key: "wrinkle", label: "褶皱", min: 0, max: 0.4, step: 0.02, default: 0.12 },
    { key: "seed", label: "种子", min: 0, max: 64, step: 1, default: 3 },
    { key: "physics", label: "物理仿真(0关/1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "simSteps", label: "仿真步数", min: 10, max: 120, step: 5, default: 90 },
    { key: "stiffness", label: "布料刚度", min: 0.3, max: 1, step: 0.05, default: 0.9 },
    { key: "colliderRadius", label: "球碰撞半径(0无)", min: 0, max: 2, step: 0.1, default: 1.2 },
    { key: "groundY", label: "地面高度", min: -2, max: 2, step: 0.2, default: 0 },
  ],
  build(p) {
    const modes = ["corners", "top-edge", "center", "two-corners", "none"];
    return buildTitanClothParts({
      width: p.width,
      depth: p.depth,
      resolution: Math.round(p.resolution),
      pinMode: modes[Math.round(p.pinMode)] ?? "corners",
      sag: p.sag,
      wrinkle: p.wrinkle,
      seed: Math.round(p.seed),
      physics: Math.round(p.physics) === 1,
      simSteps: Math.round(p.simSteps),
      stiffness: p.stiffness,
      colliderRadius: p.colliderRadius,
      groundY: p.groundY,
    });
  },
};

const pcgCellMap = {
  id: "pcg-cell-map",
  name: "PCG 六边格群岛",
  schema: [
    { key: "rings", label: "地图环数", min: 2, max: 10, step: 1, default: 6 },
    { key: "cellSize", label: "单元尺寸", min: 0.4, max: 1.2, step: 0.05, default: 0.72 },
    { key: "clusters", label: "生态分区数", min: 2, max: 12, step: 1, default: 6 },
    { key: "jitter", label: "网格不规则度", min: 0, max: 0.3, step: 0.01, default: 0.12 },
    { key: "relief", label: "地形起伏", min: 0.5, max: 3.5, step: 0.1, default: 1.8 },
    { key: "seed", label: "随机种子", min: 0, max: 100, step: 1, default: 12 },
  ],
  build(p) {
    return buildPcgCellMapParts({
      rings: Math.round(p.rings),
      cellSize: p.cellSize,
      clusters: Math.round(p.clusters),
      jitter: p.jitter,
      relief: p.relief,
      seed: Math.round(p.seed),
    });
  },
};

const pcgRiverValley = {
  id: "pcg-river-valley",
  name: "PCG 蜿蜒侵蚀河谷",
  schema: [
    { key: "size", label: "河谷尺寸", min: 16, max: 42, step: 1, default: 26 },
    { key: "resolution", label: "地形精度", min: 24, max: 96, step: 8, default: 56 },
    { key: "riverWidth", label: "河道宽度", min: 0.5, max: 3, step: 0.1, default: 1.2 },
    { key: "riverDepth", label: "河槽深度", min: 0.2, max: 2, step: 0.1, default: 0.8 },
    { key: "meander", label: "蜿蜒强度", min: 0, max: 7, step: 0.2, default: 3.4 },
    { key: "relief", label: "谷地起伏", min: 1, max: 8, step: 0.2, default: 3.6 },
    { key: "seed", label: "随机种子", min: 0, max: 100, step: 1, default: 21 },
  ],
  build(p) {
    return buildPcgRiverValleyParts({
      size: p.size,
      resolution: Math.round(p.resolution),
      riverWidth: p.riverWidth,
      riverDepth: p.riverDepth,
      meander: p.meander,
      relief: p.relief,
      seed: Math.round(p.seed),
    });
  },
};

const surfaceSketchVine = {
  id: "surface-sketch-vine",
  name: "表面绘制藤蔓",
  schema: [
    { key: "wallWidth", label: "岩墙宽度", min: 4, max: 10, step: 0.25, default: 6.5 },
    { key: "wallHeight", label: "岩墙高度", min: 3, max: 9, step: 0.25, default: 5.4 },
    { key: "strokeOffset", label: "笔划离面距离", min: 0.01, max: 0.12, step: 0.01, default: 0.04 },
    { key: "strokeWander", label: "笔划蜿蜒", min: 0, max: 1.6, step: 0.05, default: 0.7 },
    { key: "vineRadius", label: "藤茎粗细", min: 0.02, max: 0.12, step: 0.005, default: 0.045 },
    { key: "leafSize", label: "叶片尺寸", min: 0.06, max: 0.35, step: 0.01, default: 0.15 },
    { key: "seed", label: "笔划种子", min: 0, max: 100, step: 1, default: 9 },
  ],
  build(p) {
    return buildSurfaceSketchVineParts({
      wallWidth: p.wallWidth,
      wallHeight: p.wallHeight,
      strokeOffset: p.strokeOffset,
      strokeWander: p.strokeWander,
      vineRadius: p.vineRadius,
      leafSize: p.leafSize,
      seed: Math.round(p.seed),
      controlPoints: p.controlPoints,
    });
  },
};

const cliffPanelStudy = {
  id: "cliff-panel-study",
  name: "崖壁方向贴片",
  schema: [
    { key: "width", label: "崖体宽度", min: 8, max: 24, step: 1, default: 14 },
    { key: "depth", label: "崖体深度", min: 8, max: 20, step: 1, default: 12 },
    { key: "height", label: "崖壁高度", min: 3, max: 12, step: 0.5, default: 6 },
    { key: "resolution", label: "地形精度", min: 24, max: 96, step: 8, default: 48 },
    { key: "strata", label: "水平岩层", min: 2, max: 14, step: 1, default: 6 },
    { key: "erosion", label: "冲沟侵蚀", min: 0, max: 1.4, step: 0.05, default: 0.72 },
    { key: "talus", label: "坡脚崩积", min: 0, max: 1.4, step: 0.05, default: 0.65 },
    { key: "directionBins", label: "方向分区数", min: 4, max: 16, step: 1, default: 8 },
    { key: "panelScale", label: "局部投影尺度", min: 0.5, max: 6, step: 0.25, default: 2.5 },
    { key: "seed", label: "随机种子", min: 0, max: 100, step: 1, default: 31 },
  ],
  build(p) {
    return buildCliffPanelStudyParts({
      width: p.width,
      depth: p.depth,
      height: p.height,
      resolution: Math.round(p.resolution),
      strata: Math.round(p.strata),
      erosion: p.erosion,
      talus: p.talus,
      directionBins: Math.round(p.directionBins),
      panelScale: p.panelScale,
      seed: Math.round(p.seed),
    });
  },
};

const raycastRoofGarden = {
  id: "raycast-roof-garden",
  name: "射线投射屋顶花园",
  category: "程序工作流",
  assetMeta: {
    description: "候选点向下投射到双坡屋面，花盆与植被自动继承命中法线。",
    tags: ["PCG", "射线投射", "屋顶", "植被", "法线对齐"],
    capabilities: ["World Ray Hit Query", "属性保留", "法线对齐", "确定性撒点"],
    materialClasses: ["瓦片", "陶土", "植被"],
  },
  schema: [
    { key: "width", label: "房屋宽度", min: 5, max: 16, step: 0.5, default: 9 },
    { key: "depth", label: "房屋进深", min: 4, max: 14, step: 0.5, default: 7 },
    { key: "wallHeight", label: "墙体高度", min: 2.5, max: 8, step: 0.25, default: 4.2 },
    { key: "roofPitch", label: "屋顶坡度", min: 4, max: 42, step: 1, default: 22 },
    { key: "columns", label: "横向候选点", min: 4, max: 24, step: 1, default: 13 },
    { key: "rows", label: "纵向候选点", min: 3, max: 20, step: 1, default: 10 },
    { key: "density", label: "种植密度", min: 0.05, max: 1, step: 0.05, default: 0.7 },
    { key: "plantScale", label: "花盆尺寸", min: 0.25, max: 1.2, step: 0.05, default: 0.62 },
    { key: "seed", label: "随机种子", min: 0, max: 100, step: 1, default: 14 },
  ],
  build(params) {
    return buildRaycastRoofGardenParts({
      ...params,
      columns: Math.round(params.columns),
      rows: Math.round(params.rows),
      seed: Math.round(params.seed),
    });
  },
};

const raycastAsteroidGarden = {
  id: "raycast-asteroid-garden",
  name: "径向投射晶体小行星",
  category: "程序工作流",
  assetMeta: {
    description: "球壳候选点沿径向投向任意粗糙网格，生成全表面法线对齐晶簇。",
    tags: ["PCG", "径向射线", "小行星", "晶体", "HSV调试"],
    capabilities: ["逐点射线方向", "任意旋转网格", "HSV属性可视化", "法线对齐"],
    materialClasses: ["岩石", "金属", "晶体"],
  },
  schema: [
    { key: "radius", label: "小行星半径", min: 2, max: 8, step: 0.25, default: 4.2 },
    { key: "roughness", label: "表面起伏", min: 0, max: 1.2, step: 0.05, default: 0.55 },
    { key: "samples", label: "径向候选点", min: 12, max: 120, step: 4, default: 52 },
    { key: "crystalScale", label: "晶簇尺寸", min: 0.2, max: 1.2, step: 0.05, default: 0.58 },
    { key: "debugMarkers", label: "HSV距离点(0关/1开)", min: 0, max: 1, step: 1, default: 1 },
    { key: "seed", label: "随机种子", min: 0, max: 100, step: 1, default: 33 },
  ],
  build(params) {
    return buildRaycastAsteroidGardenParts({
      ...params,
      samples: Math.round(params.samples),
      debugMarkers: Math.round(params.debugMarkers) === 1,
      seed: Math.round(params.seed),
    });
  },
};

const raycastCliffLights = {
  id: "raycast-cliff-lights",
  name: "横向投射岩壁灯阵",
  category: "程序工作流",
  assetMeta: {
    description: "平面候选点横向命中粗糙岩壁，灯架自动贴合局部表面法线。",
    tags: ["PCG", "横向射线", "岩壁", "灯阵", "法线对齐"],
    capabilities: ["World Ray Hit Query", "非地形表面", "实例变体", "确定性撒点"],
    materialClasses: ["岩石", "金属", "发光体"],
  },
  schema: [
    { key: "width", label: "岩壁宽度", min: 5, max: 18, step: 0.5, default: 10 },
    { key: "height", label: "岩壁高度", min: 4, max: 14, step: 0.5, default: 7 },
    { key: "columns", label: "横向候选点", min: 4, max: 24, step: 1, default: 12 },
    { key: "rows", label: "纵向候选点", min: 3, max: 16, step: 1, default: 8 },
    { key: "density", label: "灯具密度", min: 0.05, max: 1, step: 0.05, default: 0.62 },
    { key: "roughness", label: "岩壁起伏", min: 0, max: 0.9, step: 0.05, default: 0.38 },
    { key: "lampScale", label: "灯具尺寸", min: 0.25, max: 1.4, step: 0.05, default: 0.72 },
    { key: "seed", label: "随机种子", min: 0, max: 100, step: 1, default: 27 },
  ],
  build(params) {
    return buildRaycastCliffLightsParts({
      ...params,
      columns: Math.round(params.columns),
      rows: Math.round(params.rows),
      seed: Math.round(params.seed),
    });
  },
};

const drawablePathFence = {
  id: "drawable-path-fence",
  name: "可绘制路径围栏",
  category: "程序工作流",
  workflowPreset: DRAWABLE_FENCE_WORKFLOW,
  assetMeta: {
    description: "在视口绘制曲线，实时生成沿线立柱与双层横杆。",
    tags: ["Drawable", "曲线", "围栏", "WorkflowPreset", "非破坏"],
    capabilities: ["视口绘制", "曲线绑定", "实时参数", "确定性输出"],
    materialClasses: ["木材"],
  },
  schema: [
    { key: "postSpacing", label: "立柱间距", min: 0.3, max: 2, step: 0.05, default: 0.75 },
    { key: "postHeight", label: "围栏高度", min: 0.5, max: 2.5, step: 0.05, default: 1.25 },
    { key: "railRadius", label: "横杆粗细", min: 0.02, max: 0.16, step: 0.005, default: 0.055 },
  ],
  build(p, context) {
    return buildDrawableFenceParts(p, context);
  },
};

const maskedRegionGrove = {
  id: "masked-region-grove",
  name: "可绘制区域林地",
  category: "程序工作流",
  workflowPreset: REGION_GROVE_WORKFLOW,
  assetMeta: {
    description: "绘制区域后，用 MaskField 裁剪候选点，ScatterTable 混合乔木、灌木、岩石。",
    tags: ["Drawable", "区域", "MaskField", "ScatterTable", "植被"],
    capabilities: ["区域绑定", "多物种散布", "密度控制", "种子复现"],
    materialClasses: ["植被", "土壤", "岩石", "木材"],
  },
  schema: [
    { key: "density", label: "分布密度", min: 0.1, max: 1, step: 0.02, default: 0.62 },
    { key: "spacing", label: "采样间距", min: 0.4, max: 1.5, step: 0.04, default: 0.72 },
    { key: "treeScale", label: "植被尺度", min: 0.45, max: 1.8, step: 0.05, default: 1 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 17 },
  ],
  build(p, context) {
    return buildRegionGroveParts({ ...p, seed: Math.round(p.seed) }, context);
  },
};

const scatterPathLights = {
  id: "scatter-path-lights",
  name: "可绘制路径灯带",
  category: "程序工作流",
  workflowPreset: PATH_LIGHTS_WORKFLOW,
  assetMeta: {
    description: "沿绘制路径生成步道，通过 MaskField 和 ScatterTable 布置路灯、长椅、矮桩。",
    tags: ["Drawable", "曲线", "MaskField", "ScatterTable", "场景布置"],
    capabilities: ["路径绑定", "设施混合", "资产槽思路", "种子复现"],
    materialClasses: ["石材", "金属", "玻璃", "木材"],
  },
  schema: [
    { key: "pathWidth", label: "步道宽度", min: 0.4, max: 2.2, step: 0.05, default: 0.9 },
    { key: "propSpacing", label: "设施间距", min: 0.7, max: 3, step: 0.05, default: 1.35 },
    { key: "propOffset", label: "设施外偏", min: 0.35, max: 1.8, step: 0.05, default: 0.8 },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 29 },
  ],
  build(p, context) {
    return buildPathLightsParts({ ...p, seed: Math.round(p.seed) }, context);
  },
};

function makeLowPolyCourseModel(id, name, build, seed) {
  return {
    id,
    name,
    category: "Low Poly 场景",
    assetMeta: {
      description: "基于 Low Poly 系列课程视觉语言重写的程序化场景，使用低面数原语、面法线和确定性面色差。",
      tags: ["Low Poly", "程序化场景", "面法线", "课程复刻"],
      capabilities: ["种子复现", "面级色差", "实时参数", "OBJ/Viewer 导出"],
      materialClasses: ["风格化草地", "风格化岩石", "风格化植被"],
    },
    schema: [
      { key: "seed", label: "随机种子", min: 0, max: 9999, step: 1, default: seed },
      { key: "colorVariation", label: "面色差", min: 0, max: 0.24, step: 0.01, default: 0.09 },
    ],
    build(params) {
      return build({ seed: Math.round(params.seed), colorVariation: params.colorVariation });
    },
  };
}

const lowPolyVillage = makeLowPolyCourseModel("low-poly-village", "Low Poly 村落", buildLowPolyVillageParts, 1601);
const lowPolyCloudValley = makeLowPolyCourseModel("low-poly-cloud-valley", "Low Poly 山谷云景", buildLowPolyCloudValleyParts, 803);
const lowPolyTropicalIsland = makeLowPolyCourseModel("low-poly-tropical-island", "Low Poly 热带岛", buildLowPolyTropicalIslandParts, 911);
const lowPolyTreeKit = makeLowPolyCourseModel("low-poly-tree-kit", "Low Poly 树木 Kit", buildLowPolyTreeKitParts, 1316);

const stylizedLakesideVillage = {
  id: "stylized-lakeside-village",
  name: "风格化湖畔村落",
  category: "风格化场景",
  scenePreset: {
    environment: "studio",
    background: { mode: "gradient", color: "#78c7e8", color2: "#d7f0e5" },
    exposure: 1.08,
    bloom: { enabled: true, strength: 0.2, radius: 0.28, threshold: 0.9 },
    camera: "persp",
    grid: false,
  },
  assetMeta: {
    description: "复刻参考片的中世纪木构湖畔村落：低模树岩、暖红瓦顶、木码头、水井、围栏和昼夜灯光。",
    tags: ["风格化场景", "低多边形", "湖畔村落", "木构建筑", "B站复刻"],
    capabilities: ["种子复现", "植被密度", "昼夜切换", "面色差", "OBJ/Viewer 导出"],
    materialClasses: ["风格化草地", "木材", "瓦片", "水面", "发光材质"],
    sourceUrl: "https://www.bilibili.com/video/BV18U4y1L7AV",
  },
  schema: [
    { key: "seed", label: "随机种子", min: 0, max: 999999999, step: 1, default: 673285036 },
    { key: "treeDensity", label: "树木密度", min: 0.35, max: 1.8, step: 0.05, default: 1 },
    { key: "night", label: "昼夜", min: 0, max: 1, step: 0.05, default: 0 },
    { key: "colorVariation", label: "面色差", min: 0, max: 0.24, step: 0.01, default: 0.1 },
  ],
  build(params) {
    return buildStylizedLakesideVillageParts({
      seed: Math.round(params.seed),
      treeDensity: params.treeDensity,
      night: params.night,
      colorVariation: params.colorVariation,
    });
  },
};

const stylizedTacticalIsland = {
  id: "stylized-tactical-island",
  name: "风格化战术悬浮岛",
  category: "风格化场景",
  scenePreset: {
    environment: "studio",
    background: { mode: "gradient", color: "#d3e9ef", color2: "#71999b" },
    exposure: 0.94,
    bloom: { enabled: true, strength: 0.32, radius: 0.36, threshold: 0.72 },
    fog: { enabled: false, color: "#a9c6c7", density: 0.008, heightFalloff: 0.12 },
    camera: "tactical",
    grid: false,
    floor: "none",
  },
  assetMeta: {
    description: "参考 Super Senso 的低多边形视觉语言重写：悬浮战术岛、分层峭壁、贯岛河瀑、道路棋盘、针叶林和青绿能量设施。",
    tags: ["风格化场景", "Low Poly", "悬浮岛", "战术地图", "科幻设施"],
    capabilities: ["种子复现", "森林密度", "岛屿尺度", "能量强度", "面级色差"],
    materialClasses: ["风格化草地", "岩石", "水面", "金属", "发光材质"],
    sourceUrl: "https://waldobronchart.com/project/super-senso-game/",
  },
  schema: [
    { key: "seed", label: "随机种子", min: 0, max: 999999, step: 1, default: 2718 },
    { key: "islandScale", label: "岛屿尺度", min: 0.65, max: 1.5, step: 0.05, default: 1 },
    { key: "forestDensity", label: "森林密度", min: 0.2, max: 1.8, step: 0.05, default: 1 },
    { key: "energy", label: "能量强度", min: 0, max: 1, step: 0.05, default: 0.8 },
    { key: "colorVariation", label: "面色差", min: 0, max: 0.25, step: 0.01, default: 0.1 },
  ],
  build(params) {
    return buildStylizedTacticalIslandParts({
      seed: Math.round(params.seed),
      islandScale: params.islandScale,
      forestDensity: params.forestDensity,
      energy: params.energy,
      colorVariation: params.colorVariation,
    });
  },
};

function makeCastleModel(id, name, variant, seed) {
  return {
    id,
    name,
    category: "程序化城堡",
    scenePreset: {
      environment: "studio",
      background: { mode: "gradient", color: "#8fa8b0", color2: "#d8d2c3" },
      exposure: 1.05,
      bloom: { enabled: false, strength: 0, radius: 0, threshold: 1 },
      camera: "persp",
      grid: false,
    },
    assetMeta: {
      description: `${name}：用防御纵深、侧射塔楼、强化门区和围城功能分区生成完整中世纪城堡。`,
      tags: ["中世纪城堡", "程序化建筑", "防御纵深", "B站研究复刻"],
      capabilities: ["种子复现", "墙高调节", "塔楼比例", "垛口密度", "OBJ/Viewer 导出"],
      materialClasses: ["粗砌石材", "深色屋瓦", "木构", "金属闸门", "水面"],
      sourceUrl: "https://www.bilibili.com/video/BV18W411x7vc",
    },
    schema: [
      { key: "seed", label: "布局种子", min: 0, max: 999999, step: 1, default: seed },
      { key: "scale", label: "整体尺度", min: 0.5, max: 1.8, step: 0.05, default: 1 },
      { key: "wallHeight", label: "城墙高度", min: 0.65, max: 1.6, step: 0.05, default: 1 },
      { key: "towerScale", label: "塔楼尺度", min: 0.7, max: 1.5, step: 0.05, default: 1 },
      { key: "detail", label: "防御构件密度", min: 0.5, max: 1.5, step: 0.05, default: 1 },
      { key: "colorVariation", label: "石材色差", min: 0, max: 0.2, step: 0.01, default: 0.08 },
    ],
    build(params) {
      return buildProceduralCastleParts({
        variant,
        seed: Math.round(params.seed),
        scale: params.scale,
        wallHeight: params.wallHeight,
        towerScale: params.towerScale,
        detail: params.detail,
        colorVariation: params.colorVariation,
      });
    },
  };
}

const concentricRoyalCastle = makeCastleModel("concentric-royal-castle", "同心王堡", "concentric", 1520);
const ridgeCitadel = makeCastleModel("ridge-citadel", "山脊要塞", "ridge", 1066);
const riverGateCastle = makeCastleModel("river-gate-castle", "河关城堡", "river", 1327);

const bilibiliManorCastle = {
  id: "bilibili-manor-castle",
  name: "水围庄园城堡",
  category: "程序化城堡",
  scenePreset: {
    environment: "studio",
    background: { mode: "gradient", color: "#8dbdca", color2: "#d7d3ad" },
    exposure: 1.08,
    bloom: { enabled: true, strength: 0.12, radius: 0.22, threshold: 0.92 },
    camera: "persp",
    grid: false,
  },
  assetMeta: {
    description: "复刻《咱的各种城堡》第 1 P：水围方堡、圆角塔、石木礼堂、高瞭望塔、礼拜堂和生产型庭院。",
    tags: ["中世纪城堡", "水围庄园", "半木构", "程序化建筑", "B站复刻"],
    capabilities: ["种子复现", "墙高调节", "瞭望塔比例", "菜圃密度", "垛口密度", "OBJ/Viewer 导出"],
    materialClasses: ["暖灰石材", "深色木构", "炭灰屋瓦", "水面", "庭院植被"],
    sourceUrl: "https://www.bilibili.com/video/BV1XhZvBwEAF?p=1",
  },
  schema: [
    { key: "seed", label: "布局种子", min: 0, max: 999999999, step: 1, default: 361646685 },
    { key: "scale", label: "整体尺度", min: 0.5, max: 1.8, step: 0.05, default: 1 },
    { key: "wallHeight", label: "幕墙高度", min: 1.5, max: 3.4, step: 0.05, default: 2.1 },
    { key: "watchtowerHeight", label: "瞭望塔高度", min: 5.2, max: 11.5, step: 0.1, default: 7.8 },
    { key: "gardenDensity", label: "庭院作物密度", min: 0.25, max: 1.8, step: 0.05, default: 1 },
    { key: "detail", label: "建筑构件密度", min: 0.55, max: 1.65, step: 0.05, default: 1 },
    { key: "colorVariation", label: "石木面色差", min: 0, max: 0.22, step: 0.01, default: 0.09 },
  ],
  build(params) {
    return buildBilibiliManorCastleParts({
      seed: Math.round(params.seed),
      scale: params.scale,
      wallHeight: params.wallHeight,
      watchtowerHeight: params.watchtowerHeight,
      gardenDensity: params.gardenDensity,
      detail: params.detail,
      colorVariation: params.colorVariation,
    });
  },
};

const bilibiliCastleSeriesModels = Object.fromEntries(BILIBILI_CASTLE_SERIES.map((definition) => [definition.id, {
  id: definition.id,
  name: definition.name,
  category: "B站城堡系列复刻",
  scenePreset: {
    environment: "studio",
    background: definition.variant.includes("ruin") || definition.variant === "blackstone" || definition.variant === "mist-keep"
      ? { mode: "gradient", color: "#34404a", color2: "#a5aa9e" }
      : { mode: "gradient", color: "#88adbd", color2: "#ddd1a6" },
    exposure: 1.06,
    bloom: { enabled: definition.variant === "anime-hill" || definition.variant === "fantasy-hill", strength: 0.16, radius: 0.25, threshold: 0.9 },
    camera: "persp",
    grid: false,
  },
  assetMeta: {
    description: `复刻《咱的各种城堡》第 ${definition.part} P《${definition.sourceTitle}》：独立程序化平面、塔楼、幕墙、地形和配色。`,
    tags: ["中世纪城堡", "程序化建筑", "B站系列复刻", definition.sourceTitle],
    capabilities: ["种子复现", "整体缩放", "墙高调节", "塔楼比例", "构件密度", "OBJ/Viewer 导出"],
    materialClasses: ["程序化石材", "木构", "风格化屋顶", "地形", "水面"],
    sourceUrl: `https://www.bilibili.com/video/BV1XhZvBwEAF?p=${definition.part}`,
  },
  schema: [
    { key: "seed", label: "布局种子", min: 0, max: 999999999, step: 1, default: definition.seed },
    { key: "scale", label: "整体尺度", min: 0.5, max: 1.8, step: 0.05, default: 1 },
    { key: "wallHeight", label: "城墙高度", min: 0.65, max: 1.6, step: 0.05, default: 1 },
    { key: "towerScale", label: "塔楼尺度", min: 0.7, max: 1.5, step: 0.05, default: 1 },
    { key: "detail", label: "构件密度", min: 0.5, max: 1.5, step: 0.05, default: 1 },
    { key: "colorVariation", label: "材质色差", min: 0, max: 0.2, step: 0.01, default: 0.08 },
  ],
  build(params) {
    return buildBilibiliCastleSeriesParts({
      variant: definition.variant,
      seed: Math.round(params.seed),
      scale: params.scale,
      wallHeight: params.wallHeight,
      towerScale: params.towerScale,
      detail: params.detail,
      colorVariation: params.colorVariation,
    });
  },
}]));

const blender119Models = Object.fromEntries(BLENDER_119_SCENES.map((scene) => [scene.id, {
  id: scene.id,
  name: `百景 ${String(scene.page).padStart(3, "0")} · ${scene.name}`,
  category: "Blender 百景复刻",
  assetMeta: {
    description: `复刻合集第 ${scene.page} 集《${scene.name}》的程序化场景。`,
    tags: ["Blender", "百景复刻", "程序化场景", scene.theme],
    capabilities: ["种子复现", "密度调节", "整体缩放", "面级色差"],
    materialClasses: ["风格化地表", "风格化建筑", "风格化特效"],
    sourceUrl: `https://www.bilibili.com/video/BV1nx421972j?p=${scene.page}`,
  },
  schema: [
    { key: "seed", label: "随机种子", min: 0, max: 999999, step: 1, default: scene.page * 7919 },
    { key: "density", label: "构件密度", min: 0.35, max: 1.8, step: 0.05, default: 1 },
    { key: "scale", label: "整体缩放", min: 0.35, max: 2.2, step: 0.05, default: 1 },
    { key: "colorVariation", label: "面色差", min: 0, max: 0.24, step: 0.01, default: 0.1 },
  ],
  build(params) {
    return buildBlender119SceneParts(scene, {
      seed: Math.round(params.seed),
      density: params.density,
      scale: params.scale,
      colorVariation: params.colorVariation,
    });
  },
}]));

const messengerToonPlanet = {
  id: "messenger-toon-planet",
  name: "卡通信使·球形街区",
  category: "风格复刻",
  scenePreset: {
    environment: "studio",
    background: { mode: "gradient", color: "#61beb9", color2: "#9fe4d4" },
    exposure: 1.02,
    bloom: { enabled: false, strength: 0, radius: 0, threshold: 1 },
    fog: { enabled: false },
    camera: "planet",
    grid: false,
    renderMode: "toon",
    toon: { steps: 3, outline: 0.004, color: "#26343a" },
  },
  assetMeta: {
    description: "基于 Messenger Web 游戏视觉语言原创重写的球形街区：低饱和色块、三段卡渲、深灰描边、团块植被与微缩建筑。",
    tags: ["球形世界", "卡渲", "粗描边", "低多边形", "Web 风格研究"],
    capabilities: ["径向贴附", "程序化街区", "语义部件", "种子复现"],
    materialClasses: ["卡通地表", "灰泥建筑", "植被", "街区设施"],
    sourceStudy: "https://messenger.abeto.co/",
  },
  schema: [
    { key: "radius", label: "星球半径", min: 3.5, max: 8, step: 0.1, default: 5.2 },
    { key: "buildingCount", label: "建筑数量", min: 4, max: 26, step: 1, default: 14 },
    { key: "treeCount", label: "树木数量", min: 0, max: 48, step: 1, default: 22 },
    { key: "propDensity", label: "街区设施密度", min: 0, max: 1, step: 0.05, default: 0.8 },
    { key: "colorVariation", label: "面级色差", min: 0, max: 0.16, step: 0.005, default: 0.055 },
    { key: "seed", label: "街区种子", min: 0, max: 9999, step: 1, default: 2607 },
  ],
  build(params) {
    return buildMessengerPlanetParts({
      ...params,
      buildingCount: Math.round(params.buildingCount),
      treeCount: Math.round(params.treeCount),
      seed: Math.round(params.seed),
    });
  },
};

function creamSofaModel(id, name, variant, defaults) {
  return {
    id,
    name,
    category: "Blender 实物复刻",
    assetMeta: {
      description: `基于《奶油风沙发.blend》实测组件尺寸重建的${name}。`,
      tags: ["沙发", "软包家具", "Blender 参考复刻", "多视角校准"],
      capabilities: ["长宽高调节", "座包分段调节", "程序化材质", "确定性生成"],
      materialClasses: ["奶油色织物", "深色脚架"],
    },
    schema: [
      { key: "width", label: "整体宽度", min: 1.8, max: 4.2, step: 0.01, default: defaults.width },
      { key: "depth", label: "整体深度", min: 0.65, max: 1.6, step: 0.01, default: defaults.depth },
      { key: "height", label: "整体高度", min: 0.5, max: 1.2, step: 0.01, default: defaults.height },
      ...(variant === "quilted" ? [
        { key: "seatColumns", label: "座包分段", min: 5, max: 10, step: 1, default: defaults.seatColumns },
      ] : []),
    ],
    build(params) {
      return buildCreamSofaParts({
        variant,
        width: params.width,
        depth: params.depth,
        height: params.height,
        seatColumns: Math.round(params.seatColumns ?? defaults.seatColumns),
      });
    },
  };
}

const creamSofaQuilted = creamSofaModel(
  "cream-sofa-quilted",
  "奶油风绗缝沙发",
  "quilted",
  { width: 2.8, depth: 1.1, height: 0.8, seatColumns: 8 },
);
const creamSofaWrap = creamSofaModel(
  "cream-sofa-wrap",
  "奶油风环抱沙发",
  "wrap",
  { width: 2.68, depth: 0.943, height: 0.806, seatColumns: 5 },
);

export const PROC_MODELS = { "town-scene": townScene, "drawable-path-fence": drawablePathFence, "masked-region-grove": maskedRegionGrove, "scatter-path-lights": scatterPathLights, sphere: sphereModel, teddy, rock, "rock-pile": rockPile, "attractor-grid": attractorGridModel, "blender-howtos": blenderHowtos, "blender-spiral-scales": blenderSpiralScales, "blender-dna-helix": blenderDnaHelix, "blender-gradient-box": blenderGradientBox, "blender-raining-garden": blenderRainingGarden, "grasshopper-howtos": grasshopperHowtos, "grasshopper-rock-tile": grasshopperRockTile, "grasshopper-voronoi-pipe": grasshopperVoronoiPipe, "grasshopper-waffle-pattern": grasshopperWafflePattern, "grasshopper-reaction-diffusion": grasshopperReactionDiffusion, "grasshopper-packed-circle": grasshopperPackedCircle, "grasshopper-landscape-contour": grasshopperLandscapeContour, "grasshopper-ribbon-loop": grasshopperRibbonLoop, "houdini-howtos": houdiniHowtos, "houdini-howtos-field": houdiniHowtosField, "houdini-howtos-curve-graph": houdiniHowtosCurveGraph, "houdini-howtos-weave-pot": houdiniHowtosWeavePot, "houdini-howtos-sci-fi-panel": houdiniHowtosSciFiPanel, "houdini-howtos-growth-urchin": houdiniHowtosGrowthUrchin, "houdini-howtos-bsp-dungeon": houdiniHowtosBspDungeon, "houdini-howtos-voronoi-vase": houdiniHowtosVoronoiVase, "braid-rope": braidRopeModel, "roof-generator": roofGeneratorModel, "pcg-vegetation": pcgVegetation, "vine-slope": vineSlopeModel, "ivy-ruins": ivyRuinsModel, "ivy-lowpoly-vol23": lowPolyIvyModel, "ivy-lowpoly-vol23-kit": lowPolyIvyKitModel, roots: rootsModel, "rock-formation": rockFormationModel, "pcg-colonnade": pcgColonnade, "pcg-plaza": pcgPlaza, "pcg-boulders": pcgBoulders, "pcg-forest": pcgForest, "pcg-brick-wall": pcgBrickWall, "terrain-layered": terrainLayered, "forest-floor": forestFloor, "triplanar-boulder": triplanarBoulder, tower, pagoda, building, "urban-artdeco": urbanArtDeco, "urban-glass": urbanGlassTower, "urban-brick": urbanBrickWalkup, "urban-office": urbanModernOffice, "urban-brownstone": urbanBrownstone, "urban-corporate": urbanCorporate, "japanese-street-building": japaneseStreetBuilding, "hong-kong-cyber-house": hongKongCyberHouse, "kowloon-cyber-courtyard": kowloonCyberCourtyard, "chinese-hall": chineseHall, cityblock: cityBlock, "city-district": cityDistrict, "city-district-roadnet": cityDistrictRoadnet, "watabou-city": watabouCity, "citygen-road-growth": citygenRoadGrowth, "citygen-residential": citygenResidential, "citygen-downtown": citygenDowntown, "residential-community": residentialCommunity, "road-network": roadNetworkModel, "procedural-game-map": proceduralGameMap, streetscene, "interior-room": interiorRoom, "hard-surface-kit": hardSurfaceKit, "terrain-island": terrainIsland, "lunar-crater-surface": lunarCraterSurface, ...CROPOUT_ISLAND_MODELS, cloud, "cloud-sky": cloudSky, "polygon-island": polygonIsland, "pcg-world": pcgWorld, "mountain-village": mountainVillage, ...HOUSE_GARDEN_MODELS, fern: fernModel, mushroom, gear, road, freeway, railway, viaduct, "titan-rail": titanRail, "titan-fence": titanFence, "titan-cable": titanCable, "titan-adboard": titanAdBoard, "titan-shrub": titanShrub, "titan-platform": titanPlatform, "titan-building": titanBuilding, "titan-stacking": titanStacking, "titan-train": titanTrain, "titan-tree": titanTree, "titan-cloth": titanCloth, pylon, "tower-crane": towerCrane, "wind-turbine": windTurbine, "toll-station": tollStation, "tunnel-portal": tunnelPortal, "rooftop-kit": rooftopKit, scaffolding, "bus-stop": busStop, bicycle, billboard, "container-yard": containerYard, "manhole-cover": manholeCover, "barrier-run": barrierRun, "fire-escape": fireEscape, newsstand, "traffic-signal": trafficSignal, "umbrella-table": umbrellaTable, "street-tree": streetTree, "street-lamp": streetLamp, "fire-hydrant": fireHydrant, "park-bench": parkBench, trashcan, "traffic-cone": trafficCone, "freeway-sign": freewaySign, "material-stack": materialStack, "water-tower": waterTower, "wfc-rooftop": wfcRooftop, intersection, officechair: officeChair, dragonfly, "sports-car": sportsCar, "gmc-canyon-at4x": gmcCanyonAt4x, "buick-riviera-1965": buickRiviera1965, "midnight-horse": midnightHorse, "reference-dog": referenceDog, "cartoon-mech-pilot": cartoonMechPilot, "stylized-humanoid": stylizedHumanoid, tshirt: tshirtModel, skirt: skirtModel, pants: pantsModel, dress: dressModel, hoodie: hoodieModel, smooth: smoothModel, spring: springModel, vine: vineModel, meadow: meadowModel, csg: csgModel, remesh: remeshModel, fterrain: terrainModel, wineglass: wineGlassModel, bonsai: bonsaiModel, "veg-tree": treeModel, "veg-growing-tree": growingTreeModel, "veg-stylized-tree": stylizedTreeModel, "veg-authored-broadleaf": authoredBroadleafModel, "veg-trellis-fruit": trellisFruitModel, "veg-column-cypress": columnCypressAuthoringModel, "veg-authoring-lineup": authoringLineupModel, "veg-shrub": shrubModel, "veg-grass": grassModel, "veg-conifer": coniferModel, "veg-palm": palmModel, ...SPEEDTREE_MODELS, ...SPEEDTREE_TUTORIAL_MODELS };

PROC_MODELS["random-dungeon"] = randomDungeon;
PROC_MODELS[proceduralVehicle.id] = proceduralVehicle;
PROC_MODELS[modularRescueRover.id] = modularRescueRover;
Object.assign(PROC_MODELS, proceduralVehicleVariants);
PROC_MODELS[houdiniHowtosGradationalCrystal.id] = houdiniHowtosGradationalCrystal;
PROC_MODELS["dungeon-architect-grid"] = dungeonArchitectGrid;
PROC_MODELS["procedural-waterwheel"] = proceduralWaterwheel;
PROC_MODELS[NIGHT_METROPOLIS_MODEL.id] = NIGHT_METROPOLIS_MODEL;
PROC_MODELS["townscaper-harbour"] = townscaperHarbour;
PROC_MODELS["chinese-townscaper"] = chineseTownscaper;
PROC_MODELS["low-poly-village"] = lowPolyVillage;
PROC_MODELS["low-poly-cloud-valley"] = lowPolyCloudValley;
PROC_MODELS["low-poly-tropical-island"] = lowPolyTropicalIsland;
PROC_MODELS["low-poly-tree-kit"] = lowPolyTreeKit;
PROC_MODELS["stylized-lakeside-village"] = stylizedLakesideVillage;
PROC_MODELS["stylized-tactical-island"] = stylizedTacticalIsland;
PROC_MODELS[concentricRoyalCastle.id] = concentricRoyalCastle;
PROC_MODELS[ridgeCitadel.id] = ridgeCitadel;
PROC_MODELS[riverGateCastle.id] = riverGateCastle;
PROC_MODELS[bilibiliManorCastle.id] = bilibiliManorCastle;
Object.assign(PROC_MODELS, bilibiliCastleSeriesModels);
Object.assign(PROC_MODELS, blender119Models);
PROC_MODELS[creamSofaQuilted.id] = creamSofaQuilted;
PROC_MODELS[creamSofaWrap.id] = creamSofaWrap;
for (const definition of BLEND_REFERENCE_FURNISHINGS) {
  const defaults = definition.defaults;
  PROC_MODELS[definition.id] = {
    id: definition.id,
    name: definition.name,
    category: `Blender 实物复刻 · ${definition.sourceCategory.split("/")[0]}`,
    assetMeta: {
      description: `从本地 Blender 家具参考库提炼的${definition.name}程序化模型族。`,
      tags: [definition.sourceCategory.split("/")[0], "家具系统", "程序化复刻", "语义部件"],
      capabilities: ["尺寸驱动", "模块数量调节", "确定性生成", "程序化材质"],
      materialClasses: ["织物", "木材", "金属", "玻璃", "陶瓷"],
    },
    schema: [
      { key: "width", label: "整体宽度", min: Math.max(0.04, defaults.width * 0.45), max: defaults.width * 2.4, step: Math.max(0.005, defaults.width * 0.01), default: defaults.width },
      { key: "height", label: "整体高度", min: Math.max(0.04, defaults.height * 0.45), max: defaults.height * 2.4, step: Math.max(0.005, defaults.height * 0.01), default: defaults.height },
      { key: "depth", label: "整体进深", min: Math.max(0.04, defaults.depth * 0.45), max: defaults.depth * 2.4, step: Math.max(0.005, defaults.depth * 0.01), default: defaults.depth },
      { key: "modules", label: definition.defaults.kind === "indoor-plant" ? "枝叶密度" : "模块数量", min: 1, max: 24, step: 1, default: defaults.modules },
      { key: "detail", label: "细节等级", min: 0.5, max: 1.5, step: 0.05, default: defaults.detail },
      { key: "seed", label: "随机种子", min: 0, max: 9999, step: 1, default: defaults.seed },
    ],
    build(params) {
      return buildBlendReferenceFurnishingParts({
        ...defaults,
        width: params.width,
        height: params.height,
        depth: params.depth,
        modules: Math.round(params.modules),
        detail: params.detail,
        seed: Math.round(params.seed),
      });
    },
  };
}
for (const definition of BLEND_REFERENCE_INTERIORS) {
  const defaults = definition.defaults;
  const moduleLabels = {
    curtain: "褶皱数量",
    "venetian-blind": "百叶片数量",
    "sculptural-chandelier": "发光环数量",
    copier: "纸盒数量",
    "wine-cabinet": "柜体分格数",
    "side-table": "支脚数量",
    "book-row": "书本数量",
    "bar-accessories": "器皿数量",
  };
  PROC_MODELS[definition.id] = {
    id: definition.id,
    name: definition.name,
    category: `Blender 实物复刻 · ${definition.sourceCategory.split("/")[0]}`,
    assetMeta: {
      description: `从本地 Blender 参考库独立重建的${definition.name}程序化模型。`,
      tags: [definition.sourceCategory.split("/")[0], "室内模型", "程序化复刻", "语义分件"],
      capabilities: ["尺寸驱动", "重复结构调节", "确定性生成", "程序化材质"],
      materialClasses: ["织物", "木材", "金属", "玻璃", "塑料", "石材"],
    },
    schema: [
      { key: "width", label: "整体宽度", min: Math.max(0.04, defaults.width * 0.45), max: defaults.width * 2.4, step: Math.max(0.005, defaults.width * 0.01), default: defaults.width },
      { key: "height", label: "整体高度", min: Math.max(0.04, defaults.height * 0.45), max: defaults.height * 2.4, step: Math.max(0.005, defaults.height * 0.01), default: defaults.height },
      { key: "depth", label: "整体进深", min: Math.max(0.04, defaults.depth * 0.45), max: defaults.depth * 2.4, step: Math.max(0.005, defaults.depth * 0.01), default: defaults.depth },
      { key: "modules", label: moduleLabels[defaults.kind] ?? "结构数量", min: 1, max: 72, step: 1, default: defaults.modules },
      { key: "detail", label: "细节等级", min: 0.5, max: 1.5, step: 0.05, default: defaults.detail },
      { key: "seed", label: "随机种子", min: 0, max: 9999, step: 1, default: defaults.seed },
    ],
    build(params) {
      return buildBlendReferenceInteriorParts({
        ...defaults,
        width: params.width,
        height: params.height,
        depth: params.depth,
        modules: Math.round(params.modules),
        detail: params.detail,
        seed: Math.round(params.seed),
      });
    },
  };
}
for (const definition of BLEND_REFERENCE_PLANTS) {
  const defaults = definition.defaults;
  PROC_MODELS[definition.id] = {
    id: definition.id,
    name: definition.name,
    category: "Blender 实物复刻 · 植物",
    assetMeta: {
      description: `从本地 Blender 植物参考库提炼的${definition.name}程序化模型。`,
      tags: ["室内植物", "程序化复刻", "枝干图", "叶序"],
      capabilities: ["尺寸驱动", "枝叶密度调节", "随机种子", "确定性生成"],
      materialClasses: ["叶片", "木质", "陶瓷", "土壤"],
    },
    schema: [
      { key: "width", label: "冠幅宽度", min: defaults.width * 0.55, max: defaults.width * 1.8, step: Math.max(0.005, defaults.width * 0.01), default: defaults.width },
      { key: "height", label: "植株高度", min: defaults.height * 0.55, max: defaults.height * 1.8, step: Math.max(0.005, defaults.height * 0.01), default: defaults.height },
      { key: "depth", label: "冠幅进深", min: defaults.depth * 0.55, max: defaults.depth * 1.8, step: Math.max(0.005, defaults.depth * 0.01), default: defaults.depth },
      { key: "density", label: "枝叶密度", min: 0.5, max: 1.6, step: 0.05, default: defaults.density },
      { key: "seed", label: "形态种子", min: 0, max: 9999, step: 1, default: defaults.seed },
    ],
    build(params) {
      return buildBlendReferencePlantParts({
        ...defaults,
        width: params.width,
        height: params.height,
        depth: params.depth,
        density: params.density,
        seed: Math.round(params.seed),
      });
    },
  };
}
for (const definition of SWEET_HOME_STAIR_MODELS) {
  const defaults = definition.defaults;
  PROC_MODELS[definition.id] = {
    id: definition.id,
    name: definition.name,
    category: "Sweet Home 3D 参考复刻",
    assetMeta: {
      description: `基于 Sweet Home 3D 的 ${definition.sourceName} 预览图独立程序化重建，未读取或复用原模型网格。`,
      tags: ["楼梯", "家居", "Sweet Home 3D 参考", "程序化复刻"],
      capabilities: ["尺寸调节", "踏步数量调节", "栏杆开关", "确定性生成"],
      sourceUrl: definition.sourceImage,
    },
    schema: [
      { key: "width", label: definition.kind === "spiral" || definition.kind === "square-spiral" ? "整体直径" : "梯段宽度", min: 0.55, max: 4, step: 0.05, default: defaults.width },
      { key: "rise", label: "总高度", min: 0.8, max: 8, step: 0.05, default: defaults.rise },
      { key: "run", label: "水平进深", min: 0.8, max: 12, step: 0.05, default: defaults.run },
      { key: "steps", label: "踏步数量", min: 6, max: 40, step: 1, default: defaults.steps },
      { key: "railHeight", label: "扶手高度", min: 0.45, max: 1.5, step: 0.02, default: defaults.railHeight },
      { key: "railings", label: "启用栏杆", min: 0, max: 1, step: 1, default: defaults.railings },
    ],
    build(params) {
      return buildSweetHomeStaircaseParts({
        kind: definition.kind,
        width: params.width,
        rise: params.rise,
        run: params.run,
        steps: Math.round(params.steps),
        railHeight: params.railHeight,
        railings: params.railings,
      });
    },
  };
}
for (const definition of SWEET_HOME_FURNISHING_MODELS) {
  const defaults = definition.defaults;
  PROC_MODELS[definition.id] = {
    id: definition.id,
    name: definition.name,
    category: `Sweet Home 3D 参考复刻 · ${definition.category}`,
    assetMeta: {
      description: `参考 Sweet Home 3D 的 ${definition.sourceName} 公开预览轮廓独立程序化重建，未读取或复用原模型网格。`,
      tags: [definition.category, "家居", "Sweet Home 3D 参考", "程序化复刻"],
      capabilities: ["宽高深调节", `${definition.countLabel}调节`, "独立语义部件", "确定性生成"],
      sourceUrl: SWEET_HOME_FURNISHING_SOURCE_PAGE,
    },
    schema: [
      { key: "width", label: "整体宽度", min: Math.max(0.2, defaults.width * 0.45), max: defaults.width * 2.4, step: 0.02, default: defaults.width },
      { key: "height", label: "整体高度", min: Math.max(0.2, defaults.height * 0.45), max: defaults.height * 2.4, step: 0.02, default: defaults.height },
      { key: "depth", label: "整体深度", min: Math.max(0.08, defaults.depth * 0.45), max: defaults.depth * 2.4, step: 0.02, default: defaults.depth },
      { key: "count", label: definition.countLabel, min: 1, max: 24, step: 1, default: defaults.count },
      { key: "detail", label: "高细节构件", min: 0, max: 1, step: 1, default: defaults.detail },
    ],
    build(params) {
      return buildSweetHomeFurnishingParts({
        kind: definition.kind,
        width: params.width,
        height: params.height,
        depth: params.depth,
        count: Math.round(params.count),
        detail: params.detail,
      });
    },
  };
}
for (const definition of INTERIOR_SYSTEM_MODELS) {
  const defaults = definition.defaults;
  const hasOpening = ["casement-window", "french-door"].includes(definition.kind);
  const hasStyle = ["conference-table", "structural-column", "structural-beam"].includes(definition.kind);
  PROC_MODELS[definition.id] = {
    id: definition.id,
    name: definition.name,
    category: `程序化室内系统 · ${definition.category}`,
    assetMeta: {
      description: `${definition.name}程序化模型族。尺寸、构件数量、连接锚点与语义材质自动联动。`,
      tags: [definition.category, "室内系统", "模型族", "程序化"],
      capabilities: ["尺寸联动", `${definition.countLabel}调节`, "连接锚点", "语义材质槽", "预览/高细节 LOD", "碰撞元数据"],
    },
    schema: [
      { key: "width", label: "整体宽度", min: Math.max(0.18, defaults.width * 0.45), max: defaults.width * 2.5, step: 0.02, default: defaults.width },
      { key: "height", label: "整体高度", min: Math.max(0.18, defaults.height * 0.45), max: defaults.height * 2.5, step: 0.02, default: defaults.height },
      { key: "depth", label: "整体进深", min: Math.max(0.08, defaults.depth * 0.45), max: defaults.depth * 2.5, step: 0.02, default: defaults.depth },
      { key: "count", label: definition.countLabel, min: 1, max: 24, step: 1, default: defaults.count },
      ...(hasOpening ? [{ key: "openness", label: "开启程度", min: 0, max: 1, step: 0.05, default: defaults.openness }] : []),
      ...(hasStyle ? [{ key: "style", label: "结构样式", min: 0, max: 1, step: 1, default: defaults.style }] : []),
      { key: "detail", label: "高细节构件", min: 0, max: 1, step: 1, default: defaults.detail },
    ],
    build(params) {
      return buildInteriorSystemParts({
        kind: definition.kind,
        width: params.width,
        height: params.height,
        depth: params.depth,
        count: Math.round(params.count),
        openness: params.openness ?? defaults.openness,
        style: params.style ?? defaults.style,
        detail: params.detail,
      });
    },
  };
}
for (const definition of INTERIOR_COMBINATION_MODELS) {
  const defaults = definition.defaults;
  PROC_MODELS[definition.id] = {
    id: definition.id,
    name: definition.name,
    category: "程序化室内系统 · 厨房组合",
    assetMeta: {
      description: `${definition.name}组合预设。单体模型共享尺寸、锚点与材质协议，可继续拆分编辑。`,
      tags: ["厨房模块", "组合预设", "室内系统", "程序化"],
      capabilities: ["组合布局", "尺寸联动", "模块数量联动", "连接锚点", "语义材质槽", "预览/高细节 LOD"],
    },
    schema: [
      { key: "width", label: "厨房总宽", min: 2.4, max: 12, step: 0.05, default: defaults.width },
      { key: "height", label: "空间净高", min: 2, max: 4, step: 0.05, default: defaults.height },
      { key: "depth", label: "厨房总进深", min: 1.4, max: 10, step: 0.05, default: defaults.depth },
      { key: "count", label: "柜体模块数", min: 2, max: 16, step: 1, default: defaults.count },
      { key: "detail", label: "高细节构件", min: 0, max: 1, step: 1, default: defaults.detail },
    ],
    build(params) {
      return buildInteriorCombinationParts({
        kind: definition.kind,
        width: params.width,
        height: params.height,
        depth: params.depth,
        count: Math.round(params.count),
        detail: params.detail,
      });
    },
  };
}
for (const definition of ROOM_SHELL_MODELS) {
  const defaults = definition.defaults;
  PROC_MODELS[definition.id] = {
    id: definition.id,
    name: definition.name,
    category: "程序化室内系统 · 房间壳体",
    assetMeta: {
      description: `${definition.name}。墙体按门窗边界切片，洞口真实贯穿墙体。`,
      tags: ["房间壳体", "真实开洞", "门窗系统", "程序化"],
      capabilities: ["真实门窗洞", "尺寸联动", "可开启门扇", "洞口锚点", "踢脚线避让", "预览/高细节 LOD"],
    },
    schema: [
      { key: "width", label: "房间宽度", min: 2.4, max: 14, step: 0.05, default: defaults.width },
      { key: "depth", label: "房间进深", min: 2.4, max: 12, step: 0.05, default: defaults.depth },
      { key: "height", label: "房间净高", min: 2, max: 4.5, step: 0.05, default: defaults.height },
      { key: "doorWidth", label: "门洞宽度", min: 0.7, max: 1.8, step: 0.02, default: defaults.doorWidth },
      { key: "windowWidth", label: "窗洞宽度", min: 0.65, max: 3.2, step: 0.02, default: defaults.windowWidth },
      { key: "openness", label: "门开启程度", min: 0, max: 1, step: 0.05, default: defaults.openness },
      { key: "frontWall", label: "生成前墙", min: 0, max: 1, step: 1, default: defaults.frontWall ? 1 : 0 },
      { key: "ceiling", label: "生成吊顶", min: 0, max: 1, step: 1, default: defaults.ceiling ? 1 : 0 },
      { key: "detail", label: "高细节构件", min: 0, max: 1, step: 1, default: defaults.detail },
    ],
    build(params) {
      return buildRoomShellPresetParts({
        kind: definition.kind,
        width: params.width,
        depth: params.depth,
        height: params.height,
        wallThickness: defaults.wallThickness,
        floorThickness: defaults.floorThickness,
        frontWall: params.frontWall >= 0.5,
        baseboards: true,
        doorWidth: params.doorWidth,
        windowWidth: params.windowWidth,
        openness: params.openness,
        ceiling: params.ceiling >= 0.5,
        detail: params.detail,
      });
    },
  };
}
for (const definition of STORAGE_WALL_MODELS) {
  const defaults = definition.defaults;
  PROC_MODELS[definition.id] = {
    id: definition.id,
    name: definition.name,
    category: "程序化室内系统 · 收纳系统",
    assetMeta: {
      description: `${definition.name}模型族。尺寸变化后自动重排格口、门板、抽屉、层板。`,
      tags: ["整墙收纳", "格口系统", "模块化家具", "程序化"],
      capabilities: ["格口自动分配", "门板联动", "抽屉联动", "层板重排", "连接锚点", "语义材质槽"],
    },
    schema: [
      { key: "width", label: "收纳墙宽度", min: 1.2, max: 10, step: 0.05, default: defaults.width },
      { key: "height", label: "收纳墙高度", min: 1.2, max: 4, step: 0.05, default: defaults.height },
      { key: "depth", label: "柜体进深", min: 0.22, max: 1, step: 0.02, default: defaults.depth },
      { key: "bays", label: "格口列数", min: 2, max: 12, step: 1, default: defaults.bays },
      { key: "shelves", label: "每列层板数", min: 1, max: 10, step: 1, default: defaults.shelves },
      { key: "drawers", label: "底部抽屉数", min: 0, max: 6, step: 1, default: defaults.drawers },
      { key: "openness", label: "门板/抽屉开启", min: 0, max: 1, step: 0.05, default: defaults.openness },
      { key: "detail", label: "高细节陈设", min: 0, max: 1, step: 1, default: defaults.detail },
    ],
    build(params) {
      return buildStorageWallParts({
        kind: definition.kind,
        width: params.width,
        height: params.height,
        depth: params.depth,
        bays: Math.round(params.bays),
        shelves: Math.round(params.shelves),
        drawers: Math.round(params.drawers),
        openness: params.openness,
        detail: params.detail,
      });
    },
  };
}
PROC_MODELS["spatial-storage-room-suite"] = {
  id: "spatial-storage-room-suite",
  name: "门窗房间与整墙收纳组合",
  category: "程序化室内系统 · 组合预设",
  assetMeta: {
    description: "房间壳体、真实门窗洞与电视收纳墙组合预设。",
    tags: ["房间预设", "整墙收纳", "真实开洞", "程序化"],
    capabilities: ["空间组合", "真实门窗洞", "收纳格口联动", "连接锚点", "可开启构件", "语义材质槽"],
  },
  schema: [
    { key: "width", label: "房间宽度", min: 4.2, max: 14, step: 0.05, default: STORAGE_ROOM_SUITE_DEFAULTS.width },
    { key: "depth", label: "房间进深", min: 3.2, max: 12, step: 0.05, default: STORAGE_ROOM_SUITE_DEFAULTS.depth },
    { key: "height", label: "房间净高", min: 2.2, max: 4.5, step: 0.05, default: STORAGE_ROOM_SUITE_DEFAULTS.height },
    { key: "bays", label: "收纳格口列数", min: 3, max: 10, step: 1, default: STORAGE_ROOM_SUITE_DEFAULTS.bays },
    { key: "shelves", label: "收纳层板数", min: 2, max: 8, step: 1, default: STORAGE_ROOM_SUITE_DEFAULTS.shelves },
    { key: "openness", label: "门板开启程度", min: 0, max: 1, step: 0.05, default: STORAGE_ROOM_SUITE_DEFAULTS.openness },
    { key: "detail", label: "高细节构件", min: 0, max: 1, step: 1, default: STORAGE_ROOM_SUITE_DEFAULTS.detail },
  ],
  build(params) {
    return buildStorageRoomSuiteParts({
      width: params.width,
      depth: params.depth,
      height: params.height,
      bays: Math.round(params.bays),
      shelves: Math.round(params.shelves),
      openness: params.openness,
      detail: params.detail,
    });
  },
};
for (const definition of BATHROOM_FIXTURE_MODELS) {
  const defaults = definition.defaults;
  const movable = ["shower-enclosure", "toilet", "vanity", "mirror-cabinet"].includes(definition.kind);
  PROC_MODELS[definition.id] = {
    id: definition.id,
    name: definition.name,
    category: "程序化室内系统 · 模块化卫浴",
    assetMeta: {
      description: `${definition.name}模型族。管线、开孔、可动状态、连接锚点随尺寸联动。`,
      tags: ["模块化卫浴", "管线锚点", "真实开孔", "程序化"],
      capabilities: ["尺寸联动", "冷热水与排水锚点", "真实排水开孔", "扫掠管线", "语义材质槽", "预览/高细节 LOD"],
    },
    schema: [
      { key: "width", label: "整体宽度", min: Math.max(0.28, defaults.width * 0.55), max: defaults.width * 2, step: 0.02, default: defaults.width },
      { key: "height", label: "整体高度", min: Math.max(0.35, defaults.height * 0.55), max: defaults.height * 1.8, step: 0.02, default: defaults.height },
      { key: "depth", label: "整体进深", min: Math.max(0.12, defaults.depth * 0.55), max: defaults.depth * 2, step: 0.02, default: defaults.depth },
      ...(movable ? [{ key: "openness", label: "开启程度", min: 0, max: 1, step: 0.05, default: defaults.openness }] : []),
      { key: "detail", label: "高细节管线", min: 0, max: 1, step: 1, default: defaults.detail },
    ],
    build(params) {
      return buildBathroomFixtureParts({
        kind: definition.kind,
        width: params.width,
        height: params.height,
        depth: params.depth,
        openness: params.openness ?? defaults.openness,
        detail: params.detail,
      });
    },
  };
}
for (const definition of BATHROOM_SUITE_MODELS) {
  const defaults = definition.defaults;
  PROC_MODELS[definition.id] = {
    id: definition.id,
    name: definition.name,
    category: "程序化室内系统 · 卫浴组合",
    assetMeta: {
      description: `${definition.name}。自动布置洁具、湿区、管线与地漏，并输出穿插和通道诊断。`,
      tags: ["卫浴组合", "干湿分区", "布局诊断", "程序化"],
      capabilities: ["组合布局", "尺寸联动", "自动冲突检测", "可动构件", "管线锚点", "真实地漏开孔"],
    },
    schema: [
      { key: "width", label: "房间宽度", min: 1.6, max: 9, step: 0.05, default: defaults.width },
      { key: "height", label: "房间净高", min: 2.2, max: 4.2, step: 0.05, default: defaults.height },
      { key: "depth", label: "房间进深", min: 1.5, max: 8, step: 0.05, default: defaults.depth },
      { key: "openness", label: "门扇开启程度", min: 0, max: 1, step: 0.05, default: defaults.openness },
      { key: "detail", label: "高细节管线", min: 0, max: 1, step: 1, default: defaults.detail },
    ],
    build(params) {
      return buildBathroomSuiteParts({
        kind: definition.kind,
        width: params.width,
        height: params.height,
        depth: params.depth,
        openness: params.openness,
        detail: params.detail,
      });
    },
  };
}
for (const definition of ARCHITECTURAL_ROOF_MODELS) {
  const defaults = definition.defaults;
  PROC_MODELS[definition.id] = {
    id: definition.id,
    name: definition.name,
    category: "程序化建筑系统 · 屋顶",
    assetMeta: {
      description: `${definition.name}。坡面、收边、排水、天窗开洞和连接锚点随尺寸联动。`,
      tags: ["参数化屋顶", "连接锚点", "排水系统", "程序化"],
      capabilities: ["坡面尺寸联动", "墙顶与屋脊锚点", "檐沟落水管", "坡度诊断", "语义材质槽", ...(definition.kind === "skylight-gable" ? ["真实分段天窗开洞"] : [])],
    },
    schema: [
      { key: "width", label: "屋顶面宽", min: 1.8, max: 16, step: 0.05, default: defaults.width },
      { key: "depth", label: "屋顶进深", min: 1.6, max: 14, step: 0.05, default: defaults.depth },
      { key: "baseHeight", label: "墙顶高度", min: 0.4, max: 6, step: 0.05, default: defaults.baseHeight },
      { key: "rise", label: "屋顶起坡高度", min: 0.12, max: 5, step: 0.05, default: defaults.rise },
      { key: "overhang", label: "屋檐外挑", min: 0, max: 1.5, step: 0.02, default: defaults.overhang },
      ...(definition.kind === "skylight-gable" ? [{ key: "skylights", label: "天窗数量", min: 1, max: 6, step: 1, default: defaults.skylights }] : []),
      { key: "gutter", label: "生成排水系统", min: 0, max: 1, step: 1, default: defaults.gutter ? 1 : 0 },
      { key: "detail", label: "高细节收边", min: 0, max: 1, step: 1, default: defaults.detail },
    ],
    build(params) {
      return buildArchitecturalRoofParts({
        kind: definition.kind,
        width: params.width,
        depth: params.depth,
        baseHeight: params.baseHeight,
        rise: params.rise,
        overhang: params.overhang,
        skylights: Math.round(params.skylights ?? defaults.skylights),
        gutter: params.gutter >= 0.5,
        detail: params.detail,
      });
    },
  };
}
for (const definition of ARTICULATED_FURNITURE_MODELS) {
  const defaults = definition.defaults;
  PROC_MODELS[definition.id] = {
    id: definition.id,
    name: definition.name,
    category: "程序化室内系统 · 可动家具",
    assetMeta: {
      description: `${definition.name}。几何状态由统一铰链/滑轨协议驱动。`,
      tags: ["可动家具", "关节约束", "状态参数", "程序化"],
      capabilities: ["统一关节元数据", "枢轴与行程约束", "开启状态联动", "语义部件", "语义材质槽", "确定性生成"],
    },
    schema: [
      { key: "width", label: "整体宽度", min: 0.55, max: 5, step: 0.02, default: defaults.width },
      { key: "height", label: definition.kind === "folding-table" ? "安装高度" : "整体高度", min: 0.45, max: 3.5, step: 0.02, default: defaults.height },
      { key: "depth", label: definition.kind === "folding-table" ? "展开进深" : "整体进深", min: 0.25, max: 1.6, step: 0.02, default: defaults.depth },
      { key: "count", label: definition.countLabel, min: definition.kind === "drawer-chest" || definition.kind === "sliding-wardrobe" ? 2 : 1, max: definition.kind === "hinged-cabinet" || definition.kind === "sliding-wardrobe" ? 4 : 8, step: 1, default: defaults.count },
      { key: "openness", label: definition.kind === "folding-table" ? "展开程度" : "开启程度", min: 0, max: 1, step: 0.05, default: defaults.openness },
      { key: "detail", label: "高细节五金", min: 0, max: 1, step: 1, default: defaults.detail },
    ],
    build(params) {
      return buildArticulatedFurnitureParts({
        kind: definition.kind,
        width: params.width,
        height: params.height,
        depth: params.depth,
        count: Math.round(params.count),
        openness: params.openness,
        detail: params.detail,
      });
    },
  };
}
for (const definition of ROOM_LAYOUT_MODELS) {
  const defaults = definition.defaults;
  PROC_MODELS[definition.id] = {
    id: definition.id,
    name: definition.name,
    category: "程序化室内系统 · 自动布局房间",
    assetMeta: {
      description: `${definition.name}。候选生成、硬约束淘汰、多目标评分、确定性退火搜索；优先复用现有程序化家具。`,
      tags: ["房间布局器", "家具自动摆放", "门窗避让", "程序化"],
      capabilities: ["家具碰撞求解", "门口与窗前净空", "连续通道检测", "关系与朝向评分", "确定性优化", "现有模型复用"],
      sourceUrl: "https://doi.org/10.1145/1964921.1964981",
    },
    schema: [
      { key: "width", label: "房间宽度", min: 4.2, max: 14, step: 0.05, default: defaults.width },
      { key: "depth", label: "房间进深", min: 3.8, max: 12, step: 0.05, default: defaults.depth },
      { key: "height", label: "房间净高", min: 2.2, max: 4.5, step: 0.05, default: defaults.height },
      { key: "density", label: "家具密度", min: 0.35, max: 1, step: 0.05, default: defaults.density },
      { key: "accessibility", label: "通道净宽等级", min: 0, max: 1, step: 0.05, default: defaults.accessibility },
      { key: "openness", label: "入户门开启程度", min: 0, max: 1, step: 0.05, default: defaults.openness },
      { key: "detail", label: "高细节家具", min: 0, max: 1, step: 1, default: defaults.detail },
      { key: "seed", label: "布局种子", min: 0, max: 999, step: 1, default: defaults.seed },
    ],
    build(params) {
      return buildRoomLayoutParts({
        kind: definition.kind,
        width: params.width,
        depth: params.depth,
        height: params.height,
        density: params.density,
        accessibility: params.accessibility,
        openness: params.openness,
        detail: params.detail,
        seed: Math.round(params.seed),
      });
    },
  };
}
for (const definition of EXPANSION_SYSTEM_MODELS) {
  const defaults = definition.defaults;
  const supportsOpenness = definition.kind === "sofa-recliner"
    || definition.kind.startsWith("appliance-")
    || definition.kind === "soft-curtains"
    || definition.kind === "soft-blinds";
  PROC_MODELS[definition.id] = {
    id: definition.id,
    name: definition.name,
    category: `程序化扩展系统 · ${definition.category}`,
    assetMeta: {
      description: `${definition.name}模型族。尺寸、数量、开合状态与细节级别联动。`,
      tags: [definition.category, definition.kind, "程序化模型族"],
      capabilities: ["尺寸联动", "数量联动", "语义部件", "语义材质槽", "确定性生成", "预览/高细节 LOD"],
    },
    schema: [
      { key: "width", label: "整体宽度", min: 0.08, max: 14, step: 0.02, default: defaults.width },
      { key: "height", label: "整体高度", min: 0.04, max: 6, step: 0.02, default: defaults.height },
      { key: "depth", label: "整体进深", min: 0.08, max: 8, step: 0.02, default: defaults.depth },
      { key: "count", label: definition.countLabel, min: 1, max: 32, step: 1, default: defaults.count },
      ...(supportsOpenness ? [{ key: "openness", label: "开启/展开程度", min: 0, max: 1, step: 0.05, default: defaults.openness }] : []),
      { key: "detail", label: "高细节构件", min: 0, max: 1, step: 1, default: defaults.detail },
    ],
    build(params) {
      return buildExpansionSystemParts({
        kind: definition.kind,
        width: params.width,
        height: params.height,
        depth: params.depth,
        count: Math.round(params.count),
        openness: params.openness ?? defaults.openness,
        detail: params.detail,
        seed: defaults.seed,
      });
    },
  };
}
for (const definition of POLY_HAVEN_PROP_MODELS) {
  const defaults = definition.defaults;
  const handToolKinds = ["adjustable-wrench", "pliers", "screwdriver", "cross-pein-hammer", "hatchet"];
  const supportsDamage = ["ruined-fort-arch", "boulder", "deadwood", "watering-can", "bench-vise", "alarm-clock", "oil-can", "hand-drill", "hose-reel", "drill-press", "portable-generator", "rectangular-airduct-kit", "welding-cart", "film-projector", "industrial-microscope", "cash-register", "overhead-crane", "vintage-microscope", "power-pole-system", "spinning-wheel", "aircon-unit", "hand-plane", "circular-airduct-kit", "electric-cable-kit", "articulated-desk-lamp", "gamepad", "grandfather-clock", "cordless-drill", "security-camera", "metal-tool-chest", "modular-fire-escape", "rangefinder-camera", "modular-wooden-pier", "modular-chainlink-fence", "public-payphone", "ceiling-fan", "classic-laptop", "factory-facade-kit", "apartment-facade-kit", "cassette-player", "hand-truck", "fire-extinguisher", "dartboard", "roller-shutter", "military-compressor", "extension-ladder", "folding-ladder", "measuring-tape", "incandescent-bulb", "pendant-lamp", "standing-chalkboard", "spade", "handsaw", "hacksaw", ...handToolKinds].includes(definition.kind);
  const supportsStructure = ![...handToolKinds, "watering-can", "bench-vise", "binoculars", "megaphone", "oil-can", "drill-press", "welding-cart", "industrial-microscope", "vintage-microscope", "power-pole-system", "hand-plane", "articulated-desk-lamp", "gamepad", "grandfather-clock", "cordless-drill", "security-camera", "standing-chalkboard", "spade"].includes(definition.kind);
  const supportsVariation = !["binoculars", "alarm-clock", "megaphone", "oil-can", "hand-drill", "wheelchair", "portable-generator"].includes(definition.kind);
  const variationLabel = ({
    "bench-vise": "钳口开合",
    "watering-can": "出水管仰角",
    "hose-reel": "水管盘绕松弛",
    "drill-press": "工作台高度",
    multimeter: "表针偏转",
    "welding-cart": "软管松弛",
    "film-projector": "供片盘尺寸",
    "industrial-microscope": "载物台高度",
    "cash-register": "现金抽屉开合",
    "overhead-crane": "横移小车位置",
    "vintage-microscope": "载物台高度",
    "power-pole-system": "导线垂度",
    "spinning-wheel": "踏板行程",
    "aircon-unit": "叶轮角度",
    "hand-plane": "刨铁吃刀深度",
    "circular-airduct-kit": "模块尺寸层级",
    "electric-cable-kit": "线束弯曲幅度",
    "articulated-desk-lamp": "关节展开姿态",
    gamepad: "电缆盘绕松弛",
    "grandfather-clock": "指针时间",
    "cordless-drill": "机身与手柄比例",
    "security-camera": "防雨罩长度与支架高度",
    "public-payphone": "听筒线垂挂松弛",
    "ceiling-fan": "叶片旋转相位",
    "classic-laptop": "屏幕开合角度",
    "metal-tool-chest": "翻盖角度与拉手长度",
    "modular-fire-escape": "侧梯横向位置",
    "rangefinder-camera": "镜头尺寸与背带松弛",
    "modular-wooden-pier": "铺板扰动",
    "modular-chainlink-fence": "钢丝网纵深",
    "factory-facade-kit": "雨棚深度与屋顶错台",
    "apartment-facade-kit": "阳台进深与屋顶错台",
    "cassette-player": "提带展开幅度",
    "hand-truck": "把手外扩与铲板深度",
    "fire-extinguisher": "压把角度与软管弧度",
    dartboard: "径向分区相位",
    "roller-shutter": "卷帘开合高度",
    "military-compressor": "曲柄活塞相位",
    "extension-ladder": "套节伸出量",
    "folding-ladder": "A 架展开角度",
    "measuring-tape": "尺带伸出长度",
    "incandescent-bulb": "灯丝松弛度",
    "pendant-lamp": "悬线自然偏移",
    "standing-chalkboard": "A 架展开程度",
    spade: "锹头俯仰角",
    handsaw: "锯片安装角",
    hacksaw: "锯片安装角",
  })[definition.kind] ?? "形态变化";
  const structureLabel = ({
    "industrial-pipes": "法兰螺栓密度",
    "ruined-fort-arch": "坍塌碎块数量",
    boulder: "岩体融合块数",
    deadwood: "枯枝密度",
    "utility-box": "散热百叶数量",
    boombox: "面板控制密度",
    "brass-lantern": "径向框架数量",
    flashlight: "灯头防滑环数",
    "hand-drill": "大齿轮齿数",
    wheelchair: "驱动轮辐条数量",
    "hose-reel": "水管盘绕密度",
    multimeter: "表盘刻度密度",
    "portable-generator": "发动机散热片数量",
    "rectangular-airduct-kit": "风管模块数量",
    "film-projector": "面板控制密度",
    "cash-register": "金额键列数",
    "wicker-basket": "编织经条数量",
    "alarm-clock": "表盘刻度数量",
    "overhead-crane": "桥架加强筋数量",
    "spinning-wheel": "飞轮辐条数量",
    "aircon-unit": "换热翅片密度",
    "circular-airduct-kit": "圆风管模块数量",
    "electric-cable-kit": "电缆模块数量",
    "public-payphone": "键盘列数",
    "ceiling-fan": "扇叶数量",
    "classic-laptop": "键盘列数",
    "metal-tool-chest": "抽屉层数",
    "modular-fire-escape": "平台层数与踏步密度",
    "modular-wooden-pier": "铺板与桩基模块数",
    "modular-chainlink-fence": "围栏分段数",
    "factory-facade-kit": "立面开间与楼层密度",
    "apartment-facade-kit": "立面开间与楼层密度",
    "cassette-player": "扬声器冲孔密度",
    "hand-truck": "承载横档数量",
    "fire-extinguisher": "阀体结构密度",
    dartboard: "径向分区数量",
    "roller-shutter": "卷帘分节数量",
    "military-compressor": "泵体散热片数量",
    "extension-ladder": "梯级数量",
    "folding-ladder": "梯级数量",
    "measuring-tape": "尺带刻度密度",
    "incandescent-bulb": "灯丝与螺纹密度",
    "pendant-lamp": "灯座散热环数量",
    handsaw: "锯齿密度",
    hacksaw: "锯齿密度",
  })[definition.kind] ?? "结构数量";
  PROC_MODELS[definition.id] = {
    id: definition.id,
    name: definition.name,
    category: "Poly Haven 参考复刻",
    assetMeta: {
      description: `基于 Poly Haven 的 ${definition.sourceName} 公开预览图独立程序化重建，未读取原模型网格或贴图。`,
      tags: ["Poly Haven", "道具", "程序化复刻", definition.kind],
      capabilities: ["长宽高调节", "细节开关", "确定性生成", "真实尺寸基准", ...(supportsDamage ? ["破损程度调节"] : [])],
      sourceUrl: `https://polyhaven.com/a/${definition.sourceAssetId}`,
    },
    schema: [
      { key: "width", label: "整体宽度", min: 0.01, max: 10, step: 0.005, default: defaults.width },
      { key: "depth", label: "整体进深", min: 0.01, max: 5, step: 0.005, default: defaults.depth },
      { key: "height", label: "整体高度", min: 0.01, max: 6, step: 0.005, default: defaults.height },
      { key: "detail", label: "结构细节", min: 0, max: 1, step: 1, default: defaults.detail },
      { key: "seed", label: "生成种子", min: 0, max: 999, step: 1, default: defaults.seed },
      ...(supportsVariation ? [{ key: "variation", label: variationLabel, min: 0, max: 1, step: 0.01, default: defaults.variation }] : []),
      ...(supportsStructure ? [{ key: "structure", label: structureLabel, min: 3, max: 24, step: 1, default: defaults.structure }] : []),
      ...(supportsDamage ? [{ key: "damage", label: "破损程度", min: 0, max: 1, step: 0.01, default: defaults.damage }] : []),
    ],
    build(params) {
      return buildPolyHavenPropParts({
        kind: definition.kind,
        width: params.width,
        depth: params.depth,
        height: params.height,
        detail: params.detail,
        seed: params.seed,
        variation: params.variation,
        structure: params.structure,
        damage: params.damage ?? defaults.damage,
      });
    },
  };
}
for (const definition of REFERENCE_BENCHMARK_MODELS) {
  const defaults = definition.defaults;
  const variationLabel = ({
    "magnifying-glass": "手柄倾角",
    headphones: "头梁伸缩",
    "electric-kettle": "壶嘴仰角",
    scissors: "剪刀开合",
  })[definition.kind];
  const structureLabel = "结构密度";
  PROC_MODELS[definition.id] = {
    id: definition.id,
    name: definition.name,
    category: "实图闭环基准",
    assetMeta: {
      description: `基于 ${definition.sourceProvider} 公开参考图独立程序化重建，用于多视角与轮廓优化回归。`,
      tags: ["实图闭环", "程序化复刻", definition.kind, ...definition.benchmarkSignals],
      capabilities: ["语义拆件", "尺寸联动", "多视角基准", "黑盒调参", "确定性生成"],
      sourceUrl: definition.sourcePage,
    },
    schema: [
      { key: "width", label: "整体宽度", min: defaults.width * 0.65, max: defaults.width * 1.45, step: 0.002, default: defaults.width },
      { key: "depth", label: "整体进深", min: defaults.depth * 0.55, max: defaults.depth * 1.7, step: 0.002, default: defaults.depth },
      { key: "height", label: "整体高度", min: defaults.height * 0.65, max: defaults.height * 1.45, step: 0.002, default: defaults.height },
      { key: "variation", label: variationLabel, min: 0, max: 1, step: 0.01, default: defaults.variation },
      { key: "structure", label: structureLabel, min: 3, max: 24, step: 1, default: defaults.structure },
      { key: "wear", label: "表面磨损", min: 0, max: 1, step: 0.01, default: defaults.wear },
      { key: "detail", label: "高细节结构", min: 0, max: 1, step: 1, default: defaults.detail },
      { key: "seed", label: "生成种子", min: 0, max: 999, step: 1, default: defaults.seed },
    ],
    build(params) {
      return buildReferenceBenchmarkParts({
        kind: definition.kind,
        width: params.width,
        depth: params.depth,
        height: params.height,
        variation: params.variation,
        structure: Math.round(params.structure),
        wear: params.wear,
        detail: params.detail,
        seed: Math.round(params.seed),
      });
    },
  };
}
PROC_MODELS["messenger-toon-planet"] = messengerToonPlanet;
PROC_MODELS["pcg-rock-cluster"] = pcgRockCluster;
PROC_MODELS["stylized-ocean-environment"] = stylizedOceanEnvironment;
PROC_MODELS["stylized-rock-island"] = stylizedRockIslandModel;
PROC_MODELS["xianxia-mountains"] = xianxiaMountains;
PROC_MODELS["vine-covered-rock"] = vineCoveredRockModel;
PROC_MODELS["suspension-bridge"] = suspensionBridge;
PROC_MODELS["pcg-snow-scene"] = pcgSnowScene;
PROC_MODELS["crazy-ivy-wall"] = crazyIvyWallModel;
PROC_MODELS.waterfall = waterfall;
PROC_MODELS["procedural-river"] = proceduralRiver;
PROC_MODELS["river-lake"] = riverLake;
PROC_MODELS["pcg-biome-river"] = pcgBiomeRiver;
PROC_MODELS["houdini-cave"] = houdiniCaveModel;
PROC_MODELS["ue5-pcg-cave"] = ue5PcgCaveModel;
PROC_MODELS["fabcafe-houdini"] = fabcafeHoudini;
PROC_MODELS["grasshopper-voxel-bunny"] = grasshopperVoxelBunny;
PROC_MODELS["grasshopper-image-field"] = grasshopperImageField;
PROC_MODELS["grasshopper-mesh-reaction-shell"] = grasshopperMeshReactionShell;
PROC_MODELS["grasshopper-superformula-tower"] = grasshopperSuperformulaTower;
PROC_MODELS["grasshopper-origami-pavilion"] = grasshopperOrigamiPavilion;
PROC_MODELS["fabcafe-wavy-surface"] = fabcafeWavySurface;
PROC_MODELS["fabcafe-twist-tower"] = fabcafeTwistTower;
PROC_MODELS["procedural-silo"] = proceduralSilo;
PROC_MODELS["procedural-cactus"] = proceduralCactus;
PROC_MODELS["sidefx-modular-house"] = sidefxModularHouse;
PROC_MODELS["houdini-lake-house"] = houdiniLakeHouse;
PROC_MODELS["pcg-cartoon-house"] = pcgCartoonHouse;
PROC_MODELS["sidefx-solaris-market"] = sidefxSolarisMarket;
PROC_MODELS["procedural-building"] = proceduralBuilding;
PROC_MODELS["image-remesh"] = imageRemeshModel;
PROC_MODELS["roundabout-traffic"] = roundaboutTraffic;
PROC_MODELS["multilevel-interchange"] = multilevelInterchange;
PROC_MODELS["dual-grid-farm"] = dualGridFarm;
PROC_MODELS["dual-grid-forest-camp"] = dualGridForestCamp;
PROC_MODELS["dual-grid-river-mill"] = dualGridRiverMill;
PROC_MODELS["dual-grid-hill-shrine"] = dualGridHillShrine;
PROC_MODELS["dual-grid-marsh-ruins"] = dualGridMarshRuins;
PROC_MODELS["pcg-cell-map"] = pcgCellMap;
PROC_MODELS["pcg-river-valley"] = pcgRiverValley;
PROC_MODELS["pcg-pathfinding"] = pcgPathfindingModel;
PROC_MODELS["surface-sketch-vine"] = surfaceSketchVine;
PROC_MODELS["cliff-panel-study"] = cliffPanelStudy;
PROC_MODELS["raycast-roof-garden"] = raycastRoofGarden;
PROC_MODELS["raycast-asteroid-garden"] = raycastAsteroidGarden;
PROC_MODELS["raycast-cliff-lights"] = raycastCliffLights;
PROC_MODELS["rice-field"] = riceField;
PROC_MODELS["roman-town"] = romanTown;

PROC_MODELS["easy-cliff-rock"] = easyCliffRockModel;
for (const [id, name, preset] of [
  ["rock-border-river-gorge", "河谷岩石包边", "river-gorge"],
  ["rock-border-crater-lake", "火山湖岩石包边", "crater-lake"],
  ["rock-border-mesa-rim", "台地悬崖包边", "mesa-rim"],
]) {
  PROC_MODELS[id] = {
    id,
    name,
    schema: [
      { key: "spacing", label: "岩石间距", min: 0.45, max: 1.8, step: 0.05, default: 0.92 },
      { key: "borderHeight", label: "包边高度", min: 0.6, max: 3.4, step: 0.1, default: 1.65 },
      { key: "tiers", label: "包边层数", min: 1, max: 5, step: 1, default: 2 },
      { key: "roughness", label: "岩石破碎度", min: 0, max: 0.5, step: 0.02, default: 0.2 },
      { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: 31 },
    ],
    build(params) {
      return buildRockBorderSceneParts({
        preset,
        spacing: params.spacing,
        borderHeight: params.borderHeight,
        tiers: Math.round(params.tiers),
        roughness: params.roughness,
        seed: Math.round(params.seed),
      });
    },
  };
}
PROC_MODELS["realistic-spline-path"] = realisticSplinePathModel;
PROC_MODELS["pcg-spline-curb-sidewalk"] = pcgSplineCurbModel;
Object.assign(PROC_MODELS, pcgSplineCurbPresetModels);
PROC_MODELS["ecosystem-art-tool"] = ecosystemArtTool;
PROC_MODELS["ecosystem-brush-editor"] = ecosystemBrushEditor;
PROC_MODELS["biome-blend-world"] = biomeBlendWorld;
PROC_MODELS["ecosystem-bake-pipeline"] = ecosystemBakePipeline;
PROC_MODELS["ecological-association"] = ecologicalAssociation;
PROC_MODELS["ecosystem-lod-streaming"] = ecosystemLodStreaming;
PROC_MODELS["terrain-ecology-feedback"] = terrainEcologyFeedback;
PROC_MODELS["ecosystem-succession"] = ecosystemSuccession;
PROC_MODELS["pcg-palisade-wall"] = pcgPalisadeWall;
PROC_MODELS["spline-stone-wall"] = splineStoneWall;

/** Default param object from a schema. */
PROC_MODELS["assembly-flower-island"] = assemblyFlowerIsland;
PROC_MODELS["assembly-woodland-edge"] = assemblyWoodlandEdge;
PROC_MODELS["assembly-dry-rockery"] = assemblyDryRockery;
PROC_MODELS["procedural-planet"] = proceduralPlanet;
PROC_MODELS["garden-metropolis"] = GARDEN_METROPOLIS_MODEL;
Object.assign(PROC_MODELS, CONTENT_MODELS);

function editableWorkflow(model, key, label, kind, defaultBinding, editor = undefined) {
  return {
    schema: "meshova-workflow@1",
    id: `${model.id}-spatial-edit`,
    version: 1,
    metadata: {
      label: `${model.name}空间编辑`,
      tags: [kind === "surface" ? "曲面控制网格" : "曲线控制点", "视口拖拽", "非破坏"],
      scope: "model",
    },
    graph: {
      schema: "meshova-opplan@1",
      name: `${model.id}-spatial-edit`,
      nodes: [{ id: "output", op: model.id, args: [{ $binding: key }] }],
    },
    bindings: [{ key, label, kind, required: false, default: defaultBinding, ...(editor ? { editor } : {}) }],
    execution: { debounceMs: 80 },
  };
}

function bindingVec3Points(context, key, fallback) {
  const binding = context?.bindings?.[key];
  const points = binding?.points?.length >= 2 ? binding.points : fallback.points;
  return points.map((point) => vec3(Number(point[0]), Number(point[1]), Number(point[2])));
}

function bindingCurveOptions(context, key, fallback) {
  const binding = context?.bindings?.[key] || fallback;
  return {
    type: binding.curveType || fallback.curveType || "catmull-rom",
    closed: binding.closed === true || fallback.closed === true,
    subdivisions: Number(binding.subdivisions || fallback.subdivisions || 8),
    tension: Number(binding.tension ?? fallback.tension ?? 0.5),
    degree: Number(binding.degree || fallback.degree || 3),
    handles: (binding.handles || fallback.handles || []).map((handle) => handle ? {
      mode: handle.mode || "auto",
      ...(handle.in ? { in: vec3(Number(handle.in[0]), Number(handle.in[1]), Number(handle.in[2])) } : {}),
      ...(handle.out ? { out: vec3(Number(handle.out[0]), Number(handle.out[1]), Number(handle.out[2])) } : {}),
    } : undefined),
    arcLength: binding.arcLength ?? fallback.arcLength ?? true,
    ...(Number(binding.sampleCount || fallback.sampleCount) > 1 ? {
      sampleCount: Number(binding.sampleCount || fallback.sampleCount),
    } : {}),
  };
}

function bindingPointAttribute(context, key, index, name, fallback) {
  return Number(context?.bindings?.[key]?.pointAttributes?.[index]?.[name] ?? fallback);
}

function sampledBindingAttributes(context, key, sampleCount) {
  const binding = context?.bindings?.[key];
  const pointCount = binding?.points?.length || 0;
  const names = ["width", "height", "tilt", "twist"];
  return Array.from({ length: sampleCount }, (_, sample) => Object.fromEntries(names.map((name) => [
    name,
    sampleCurveAttribute({
      keys: Array.from({ length: pointCount }, (_, index) => ({
        t: pointCount > 1 ? index / (pointCount - 1) : 0,
        value: bindingPointAttribute(context, key, index, name, name === "width" ? 1 : 0),
      })),
      interpolation: "smooth",
    }, sampleCount > 1 ? sample / (sampleCount - 1) : 0),
  ])));
}

function curvePointScale(params, spec) {
  if (!spec) return 1;
  const value = Number(params[spec.key]);
  return Number.isFinite(value) && Math.abs(spec.default) > 1e-8 ? value / spec.default : 1;
}

function attachCurveEditor(id, label, points, {
  closed = false,
  scale = {},
  offset = {},
  curveType = "catmull-rom",
} = {}) {
  const model = PROC_MODELS[id];
  if (!model) return;
  const key = "guideCurve";
  const defaultBinding = {
    kind: closed ? "region" : "curve",
    points,
    closed,
    curveType,
    subdivisions: 8,
    tension: 0.5,
    degree: 3,
    arcLength: true,
    pointAttributes: points.map(() => ({ width: 1, height: 0, tilt: 0, twist: 0 })),
  };
  const originalBuild = model.build.bind(model);
  model.workflowPreset = editableWorkflow(
    model,
    key,
    label,
    closed ? "region" : "curve",
    defaultBinding,
    {
      curveType,
      curveTypes: ["catmull-rom", "bezier", "b-spline", "polyline"],
      subdivisions: 8,
      tension: 0.5,
      degree: 3,
      arcLength: true,
      attributes: ["width", "height", "tilt", "twist"],
    },
  );
  model.build = (params, context) => {
    const authoredPoints = bindingVec3Points(context, key, defaultBinding).map((point, index) => vec3(
      point.x * curvePointScale(params, scale.x) + Number(params[offset.x] ?? 0),
      point.y * curvePointScale(params, scale.y) + Number(params[offset.y] ?? 0)
        + bindingPointAttribute(context, key, index, "height", 0),
      point.z * curvePointScale(params, scale.z) + Number(params[offset.z] ?? 0),
    ));
    const controlPoints = controlCurve(authoredPoints, bindingCurveOptions(context, key, defaultBinding)).points;
    const curveAttributes = sampledBindingAttributes(context, key, controlPoints.length);
    return originalBuild({ ...params, controlPoints, curveAttributes }, context);
  };
  model.assetMeta = {
    ...(model.assetMeta || {}),
    capabilities: [...new Set([...(model.assetMeta?.capabilities || []), "视口曲线拖拽", "控制点增删", "高度编辑"])],
  };
}

function latticePoints(size, rows = 4, columns = 4) {
  const half = size * 0.5;
  return Array.from({ length: rows }, (_, row) => -half + (row / (rows - 1)) * size)
    .flatMap((z) => Array.from({ length: columns }, (_, column) => [
      -half + (column / (columns - 1)) * size,
      0,
      z,
    ]));
}

function attachSurfaceEditor(id, label, size, partNames) {
  const model = PROC_MODELS[id];
  if (!model) return;
  const key = "controlSurface";
  const rows = 4;
  const columns = 4;
  const points = latticePoints(size, rows, columns);
  const defaultBinding = {
    kind: "surface",
    points,
    rows,
    columns,
    closed: false,
    surfaceInterpolation: "b-spline",
    degree: 3,
  };
  const basePoints = points.map((point) => vec3(point[0], point[1], point[2]));
  const acceptsPart = (name) => partNames.some((pattern) => pattern.endsWith("*")
    ? name.startsWith(pattern.slice(0, -1))
    : name === pattern);
  const originalBuild = model.build.bind(model);
  model.workflowPreset = editableWorkflow(model, key, label, "surface", defaultBinding, {
    rows,
    columns,
    surfaceInterpolation: "b-spline",
    degree: 3,
  });
  model.build = (params, context) => {
    const suppliedPoints = context?.bindings?.[key]?.points;
    const editedPoints = suppliedPoints?.length === basePoints.length
      ? suppliedPoints.map((point) => vec3(Number(point[0]), Number(point[1]), Number(point[2])))
      : basePoints;
    const parts = originalBuild(params, context);
    const acceptedParts = parts.filter((part) => acceptsPart(part.name));
    let bounds;
    for (const part of acceptedParts) {
      for (const point of part.mesh.positions) {
        bounds = bounds || { minX: point.x, maxX: point.x, minZ: point.z, maxZ: point.z };
        bounds.minX = Math.min(bounds.minX, point.x);
        bounds.maxX = Math.max(bounds.maxX, point.x);
        bounds.minZ = Math.min(bounds.minZ, point.z);
        bounds.maxZ = Math.max(bounds.maxZ, point.z);
      }
    }
    return parts.map((part) => acceptsPart(part.name)
      ? { ...part, mesh: deformByControlLattice(part.mesh, basePoints, editedPoints, {
        rows,
        columns,
        interpolation: "b-spline",
        degree: 3,
        bounds,
      }) }
      : part);
  };
  model.assetMeta = {
    ...(model.assetMeta || {}),
    capabilities: [...new Set([...(model.assetMeta?.capabilities || []), "视口曲面控制网格", "局部高程塑形"])],
  };
}

function sampleGuidePoint(points, t) {
  if (points.length === 1) return points[0];
  const position = Math.max(0, Math.min(1, t)) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(position));
  const local = position - index;
  const start = points[index];
  const end = points[index + 1];
  return vec3(
    start.x + (end.x - start.x) * local,
    start.y + (end.y - start.y) * local,
    start.z + (end.z - start.z) * local,
  );
}

function sampleGuideAttributes(attributes, t) {
  if (!attributes.length) return { width: 1, height: 0, tilt: 0, twist: 0 };
  if (attributes.length === 1) return attributes[0];
  const position = Math.max(0, Math.min(1, t)) * (attributes.length - 1);
  const index = Math.min(attributes.length - 2, Math.floor(position));
  const local = position - index;
  const start = attributes[index];
  const end = attributes[index + 1];
  return Object.fromEntries(["width", "height", "tilt", "twist"].map((key) => [
    key,
    Number(start[key] ?? 0) + (Number(end[key] ?? 0) - Number(start[key] ?? 0)) * local,
  ]));
}

function deformMeshAlongGuide(mesh, guidePoints, height, guideAttributes = []) {
  const safeHeight = Math.max(1e-6, height);
  const positions = mesh.positions.map((position) => {
    const t = Math.max(0, Math.min(1, position.y / safeHeight));
    const guide = sampleGuidePoint(guidePoints, t);
    const attributes = sampleGuideAttributes(guideAttributes, t);
    const width = Number(attributes.width ?? 1);
    const twist = Number(attributes.twist ?? 0) * Math.PI / 180;
    const cos = Math.cos(twist);
    const sin = Math.sin(twist);
    const x = position.x * width;
    const z = position.z * width;
    return vec3(
      x * cos - z * sin + guide.x,
      position.y + guide.y - t * safeHeight,
      x * sin + z * cos + guide.z,
    );
  });
  return recomputeNormals({
    positions,
    normals: mesh.normals,
    uvs: mesh.uvs,
    indices: mesh.indices,
  });
}

function attachSpineEditor(id, label = "主干导向曲线") {
  const model = PROC_MODELS[id];
  const heightSchema = model?.schema?.find((entry) => entry.key === "height");
  if (!model || !heightSchema) return;
  const defaultHeight = Number(heightSchema.default);
  const key = "trunkGuide";
  const defaultBinding = {
    kind: "curve",
    points: [0, 0.25, 0.5, 0.75, 1].map((t) => [0, defaultHeight * t, 0]),
    closed: false,
    curveType: "catmull-rom",
    subdivisions: 8,
    tension: 0.5,
    degree: 3,
    arcLength: true,
    pointAttributes: [0, 0.25, 0.5, 0.75, 1].map(() => ({ width: 1, height: 0, tilt: 0, twist: 0 })),
  };
  const originalBuild = model.build.bind(model);
  model.workflowPreset = editableWorkflow(model, key, label, "curve", defaultBinding, {
    curveType: "catmull-rom",
    curveTypes: ["catmull-rom", "bezier", "b-spline", "polyline"],
    subdivisions: 8,
    tension: 0.5,
    degree: 3,
    arcLength: true,
    attributes: ["width", "height", "tilt", "twist"],
  });
  model.build = (params, context) => {
    const height = Number(params.height ?? defaultHeight);
    const authoredPoints = bindingVec3Points(context, key, defaultBinding).map((point, index) => vec3(
      point.x,
      point.y * height / defaultHeight + bindingPointAttribute(context, key, index, "height", 0),
      point.z,
    ));
    const guidePoints = controlCurve(authoredPoints, bindingCurveOptions(context, key, defaultBinding)).points;
    const guideAttributes = sampledBindingAttributes(context, key, guidePoints.length);
    return originalBuild(params, context).map((part) => ["wood", "trunk", "foliage", "leaves", "fronds"].includes(part.name)
      ? { ...part, mesh: deformMeshAlongGuide(part.mesh, guidePoints, height, guideAttributes) }
      : part);
  };
  model.assetMeta = {
    ...(model.assetMeta || {}),
    capabilities: [...new Set([...(model.assetMeta?.capabilities || []), "视口主干曲线", "树冠随主干变形"])],
  };
}

function attachCurveGraphEditor(id, label = "分叉曲线图") {
  const model = PROC_MODELS[id];
  if (!model) return;
  const key = "curveGraph";
  const points = [
    [-2.4, 0, -1.4], [-0.8, 0.18, -1.4], [0.8, -0.12, -1.4], [2.4, 0.08, -1.4],
    [-2.4, 0.12, 0], [-0.8, -0.08, 0], [0.8, 0.16, 0], [2.4, -0.06, 0],
    [-2.4, -0.1, 1.4], [-0.8, 0.14, 1.4], [0.8, 0, 1.4], [2.4, 0.1, 1.4],
  ];
  const edges = [];
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) edges.push({ from: row * 4 + column, to: row * 4 + column + 1 });
  }
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < 4; column++) edges.push({ from: row * 4 + column, to: (row + 1) * 4 + column });
  }
  const defaultBinding = {
    kind: "curve-graph",
    points,
    edges,
    curveType: "catmull-rom",
    subdivisions: 8,
    tension: 0.5,
    degree: 3,
    arcLength: true,
    pointAttributes: points.map(() => ({ width: 1, height: 0, tilt: 0, twist: 0 })),
  };
  const originalBuild = model.build.bind(model);
  model.workflowPreset = editableWorkflow(model, key, label, "curve-graph", defaultBinding, {
    curveType: "catmull-rom",
    curveTypes: ["catmull-rom", "bezier", "b-spline", "polyline"],
    subdivisions: 8,
    tension: 0.5,
    degree: 3,
    arcLength: true,
    attributes: ["width", "height", "tilt", "twist"],
  });
  model.build = (params, context) => {
    const binding = context?.bindings?.[key] || defaultBinding;
    const graphEdges = binding.edges || defaultBinding.edges;
    const graphPoints = bindingVec3Points(context, key, defaultBinding).map((point, index) => vec3(
      point.x,
      point.y + bindingPointAttribute(context, key, index, "height", 0),
      point.z,
    ));
    const radius = Number(params.radius ?? 0.055);
    const pipeMeshes = graphEdges.map((edge) => {
      const from = graphPoints[Number(edge.from ?? edge[0])];
      const to = graphPoints[Number(edge.to ?? edge[1])];
      if (!from || !to) return null;
      const controls = [from, ...(edge.points || []).map((point) => vec3(...point)), to];
      const curve = controlCurve(controls, {
        ...bindingCurveOptions(context, key, defaultBinding),
        type: edge.curveType || binding.curveType || "catmull-rom",
        closed: false,
      });
      return sweep(curve, { radius, sides: 10, caps: true });
    }).filter(Boolean);
    const junctions = graphPoints.map((point) => transform(sphere(radius * 2.15, 14, 10), { translate: point }));
    const adjacency = graphPoints.map(() => []);
    for (const edge of graphEdges) {
      const from = Number(edge.from ?? edge[0]);
      const to = Number(edge.to ?? edge[1]);
      if (!adjacency[from] || !adjacency[to]) continue;
      adjacency[from].push(to);
      adjacency[to].push(from);
    }
    const target = graphPoints.length - 1;
    const previous = new Array(graphPoints.length).fill(-1);
    const queue = [0];
    previous[0] = 0;
    for (let cursor = 0; cursor < queue.length && previous[target] < 0; cursor++) {
      const current = queue[cursor];
      for (const next of adjacency[current]) {
        if (previous[next] >= 0) continue;
        previous[next] = current;
        queue.push(next);
      }
    }
    const route = [];
    if (previous[target] >= 0) {
      for (let current = target; current !== 0; current = previous[current]) route.push(graphPoints[current]);
      route.push(graphPoints[0]);
      route.reverse();
    }
    const routeMesh = route.length > 1
      ? sweep(controlCurve(route, { type: "catmull-rom", closed: false, subdivisions: 8 }), {
        radius: radius * 1.55,
        sides: 12,
        caps: false,
      })
      : null;
    const parts = originalBuild(params, context);
    return parts.map((part) => part.name === "pipe_network"
      ? { ...part, mesh: merge(...pipeMeshes) }
      : part.name === "pipe_junctions"
        ? { ...part, mesh: merge(...junctions) }
        : part.name === "shortest_route" && routeMesh
          ? { ...part, mesh: routeMesh }
          : part);
  };
  model.assetMeta = {
    ...(model.assetMeta || {}),
    capabilities: [...new Set([...(model.assetMeta?.capabilities || []), "分叉曲线图", "节点与分支编辑"])],
  };
}

attachCurveGraphEditor("houdini-howtos-curve-graph", "管网分叉图");

attachCurveEditor("road", "道路中心线", [[0, 0, -21], [6, 0, -7], [-6, 0, 7], [0, 0, 21]], { scale: { x: { key: "curve", default: 6 }, z: { key: "length", default: 42 } } });
attachCurveEditor("freeway", "高速中心线", [[-9, 0, -32], [9, 0, -11], [-9, 0, 11], [9, 0, 32]], { scale: { x: { key: "bend", default: 9 }, z: { key: "length", default: 64 } }, offset: { y: "elevation" } });
attachCurveEditor("railway", "铁路中心线", [[-6, 0, -20], [6, 0, -7], [-6, 0, 7], [6, 0, 20]], { scale: { x: { key: "bend", default: 6 }, z: { key: "length", default: 40 } } });
attachCurveEditor("viaduct", "高架桥中心线", [[0, 0, -40], [0, 5, -26], [0, 8, -12], [0, 8, 12], [0, 5, 26], [0, 0, 40]], { scale: { y: { key: "clearance", default: 8 }, z: { key: "length", default: 80 } } });
attachCurveEditor("suspension-bridge", "桥面控制线", [[-45, 0, 0], [-27, -3.2, 2.8], [-9, -5.2, 1.2], [9, -5.2, -1.2], [27, -3.2, -2.8], [45, 0, 0]], { scale: { x: { key: "spanLength", default: 90 }, y: { key: "valleyDepth", default: 5.5 }, z: { key: "pathBend", default: 3.2 } } });
attachCurveEditor("pcg-brick-wall", "砖墙基线", [[-3.2, 0, 0], [-1.1, 0, 0.15], [1.1, 0, 0.35], [3.2, 0, 0.48]], { scale: { x: { key: "length", default: 6.4 }, z: { key: "curveDepth", default: 0.48 } } });
attachCurveEditor("pcg-palisade-wall", "木栅围合边界", [[-4.8, 0, -3.2], [0, 0, -4.4], [4.8, 0, -3.2], [5.5, 0, 0], [4.8, 0, 3.2], [0, 0, 4.4], [-4.8, 0, 3.2], [-5.5, 0, 0]], { closed: true, scale: { x: { key: "length", default: 30 }, z: { key: "length", default: 30 } } });
attachCurveEditor("spline-stone-wall", "石墙基线", [[-9, 0, 0], [-3, 0.6, 3.2], [3, -0.4, -1.4], [9, 0.2, 0.6]], { scale: { x: { key: "length", default: 18 }, y: { key: "terrain", default: 0.8 }, z: { key: "bend", default: 3.2 } } });
attachCurveEditor("realistic-spline-path", "岩石路径中心线", [[-17, 0, 0], [-11, 0.8, 3.2], [-5, 1.6, -2], [1, 1.2, 4.8], [7, 0.4, -3.2], [12, 0.8, 2], [17, 0, 0]], { scale: { x: { key: "length", default: 34 }, y: { key: "elevation", default: 2.2 }, z: { key: "meander", default: 4.8 } } });
attachCurveEditor("pcg-spline-curb-sidewalk", "道路样条", [[-17, 0, -2], [-10, 0, -6], [-3, 0, -3], [5, 0, 5], [12, 0, 7], [17, 0, 2]], { scale: { x: { key: "length", default: 34 }, z: { key: "bend", default: 7 } } });
attachCurveEditor("pcg-curb-boulevard", "林荫道路样条", [[-23, 0, -2.7], [-15, 0, -3], [-6, 0, -1.9], [4, 0, 0.3], [14, 0, 2.7], [23, 0, 3]], { scale: { x: { key: "length", default: 46 }, z: { key: "bend", default: 8 } } });
attachCurveEditor("pcg-curb-market-street", "商业街样条", [[-19, 0, -1.7], [-14, 0, -3.6], [-6, 0, -3.2], [1, 0, 1.7], [8, 0, 4], [14, 0, 1.9], [19, 0, -1.1]], { scale: { x: { key: "length", default: 38 }, z: { key: "bend", default: 9.5 } } });
attachCurveEditor("pcg-curb-riverside-walk", "滨河步道样条", [[-27, 0, -3.4], [-20, 0.05, -4.8], [-11, 0.1, -2.9], [-2, 0.16, 1], [8, 0.1, 4.1], [17, 0.05, 3.1], [27, 0, -0.6]], { scale: { x: { key: "length", default: 54 }, z: { key: "bend", default: 12 } } });
attachCurveEditor("pcg-curb-civic-crescent", "市政广场样条", [[-22, 0, -0.7], [-18, 0, 3.9], [-11, 0, 8.1], [-2, 0, 10.4], [8, 0, 9.2], [17, 0, 5.3], [22, 0, 0]], { scale: { x: { key: "length", default: 44 }, z: { key: "bend", default: 14 } } });
attachCurveEditor("procedural-river", "河道中心线", [[0, 0, -11.5], [2.8, 0, -7.5], [-3.2, 0, -3], [3.6, 0, 2], [-2.4, 0, 7], [0, 0, 11.5]], { scale: { x: { key: "meander", default: 3.8 }, z: { key: "size", default: 24 } } });
attachCurveEditor("river-lake", "入湖河道中心线", [[-6.5, 0, -17.3], [-2.8, 0, -12], [-5.4, 0, -6.5], [0.6, 0, -1], [-1.2, 0, 2.2], [2.3, 0, 4.2]], { scale: { x: { key: "meander", default: 4.2 }, z: { key: "size", default: 36 } } });
attachCurveEditor("pcg-biome-river", "湿地河道中心线", [[0, 0, -14.4], [2.3, 0, -9], [-2.8, 0, -3], [3, 0, 3], [-2.1, 0, 9], [0, 0, 14.4]], { scale: { x: { key: "meander", default: 3.2 }, z: { key: "size", default: 30 } } });
attachCurveEditor("polygon-island", "岛屿海岸边界", [[-4.8, 0, -2.8], [-2.2, 0, -5], [2.5, 0, -4.6], [5, 0, -1.8], [4.3, 0, 3.1], [1.2, 0, 5], [-3.4, 0, 4.2], [-5.2, 0, 0.8]], { closed: true, scale: { x: { key: "size", default: 12 }, z: { key: "size", default: 12 } } });
attachCurveEditor("titan-cable", "电杆锚点与悬垂路径", [[-18, 6, 0], [-6, 6.4, 0], [6, 5.9, 0], [18, 5.6, 0]], { scale: { x: { key: "span", default: 12 }, y: { key: "poleHeight", default: 6 } } });
attachCurveEditor("waterfall", "瀑布落水纵断线", [[0, 8.72, -0.95], [0.18, 7.2, -0.7], [-0.16, 4.8, -0.1], [0.12, 2.2, 0.65], [0, 0.22, 1.02]], { scale: { y: { key: "height", default: 8.5 }, z: { key: "depth", default: 3.4 } } });
attachCurveEditor("surface-sketch-vine", "藤蔓表面笔划", [[-2.35, 0.25, 0.4], [-1.8, 1.1, 0.4], [-2.1, 2.1, 0.4], [-1.1, 3.2, 0.4], [-0.5, 4.5, 0.4], [0.6, 5.1, 0.4]], { scale: { x: { key: "wallWidth", default: 6.5 }, y: { key: "wallHeight", default: 5.4 } } });

attachSurfaceEditor("terrain-island", "岛屿地形控制面", 10, ["terrain"]);
attachSurfaceEditor("lunar-crater-surface", "月面控制网格", 120, ["lunar_surface"]);
attachSurfaceEditor("pcg-river-valley", "河谷控制网格", 26, ["river_valley_terrain", "river_valley_water"]);
attachSurfaceEditor("terrain-layered", "分层地形控制网格", 24, ["terrain"]);
attachSurfaceEditor("fterrain", "字段地形控制网格", 4, ["terrain"]);
attachSurfaceEditor("cliff-panel-study", "崖壁控制网格", 14, ["cliff_panel_*"]);
attachSurfaceEditor("rock-formation", "岩体控制网格", 4, ["rock"]);
attachSurfaceEditor("stylized-rock-island", "浮岛岩体控制网格", 6.4, ["cliff_faces", "recessed_rock", "underside_spires", "terrace_rocks", "grass_caps"]);
attachSurfaceEditor("easy-cliff-rock", "岩山群控制网格", 13, ["cliff_*"]);
attachSurfaceEditor("houdini-cave", "洞体控制网格", 12, ["caveShell"]);
attachSurfaceEditor("ue5-pcg-cave", "洞网控制网格", 28, ["caveShell", "floorRocks", "wallRocks", "ceilingRocks"]);
attachSurfaceEditor("grasshopper-landscape-contour", "等高线地形控制网格", 3.4, ["contour_*"]);
attachSurfaceEditor("grasshopper-reaction-diffusion", "反应扩散浮雕控制网格", 3.4, ["reaction_diffusion_plate"]);
attachSurfaceEditor("pcg-cell-map", "六边格群岛控制网格", 10, ["cell_map_coast", "cell_cluster_*"]);
attachSurfaceEditor("pcg-world", "生物群系世界控制网格", 12, ["terrain", "resources"]);
attachSurfaceEditor("pcg-vegetation", "植被地形控制网格", 18, ["terrain", "trees", "rocks"]);
attachSurfaceEditor("stylized-ocean-environment", "海洋大形控制网格", 72, ["stylized_ocean_surface"]);
attachSurfaceEditor("meadow", "草地控制网格", 4, ["ground", "grass", "rocks"]);
attachSurfaceEditor("rock-pile", "岩石堆控制网格", 5, ["rocks"]);
attachSurfaceEditor("pcg-rock-cluster", "岩石群落控制网格", 14, ["*"]);

const EXTENDED_SURFACE_EDITORS = Object.freeze([
  ["roof-generator", "屋面轮廓控制面", 12],
  ["building", "建筑体量控制面", 14],
  ["procedural-building", "建筑体量控制面", 16],
  ["sidefx-modular-house", "模块住宅体量控制面", 12],
  ["houdini-lake-house", "湖畔住宅体量控制面", 16],
  ["pcg-cartoon-house", "卡通住宅体量控制面", 11],
  ["urban-artdeco", "装饰艺术塔楼体量控制面", 20],
  ["urban-glass", "玻璃塔楼体量控制面", 20],
  ["urban-brick", "砖砌公寓体量控制面", 20],
  ["urban-office", "办公塔楼体量控制面", 20],
  ["urban-brownstone", "褐石住宅体量控制面", 20],
  ["urban-corporate", "企业塔楼体量控制面", 20],
  ["japanese-street-building", "日式街屋体量控制面", 12],
  ["hong-kong-cyber-house", "赛博街屋体量控制面", 10],
  ["kowloon-cyber-courtyard", "九龙院落控制面", 40],
  ["chinese-hall", "中式殿堂屋面控制面", 20],
  ["cityblock", "城市街区控制面", 48],
  ["city-district", "城区布局控制面", 80],
  ["city-district-roadnet", "城区路网控制面", 100],
  ["road-network", "道路网络控制面", 96],
  ["citygen-road-growth", "道路生长控制面", 100],
  ["citygen-residential", "住宅路网控制面", 100],
  ["citygen-downtown", "核心城区路网控制面", 100],
  ["watabou-city", "河流聚落控制面", 80],
  ["residential-community", "社区路网控制面", 90],
  ["roman-town", "罗马街区控制面", 60],
  ["townscaper-harbour", "港湾聚落控制面", 30],
  ["chinese-townscaper", "中式水城控制面", 32],
  ["mountain-village", "山村地貌控制面", 70],
  ["town-scene", "山地城镇控制面", 80],
  ["procedural-game-map", "游戏地图控制面", 90],
  ["multilevel-interchange", "多层立交控制面", 190],
  ["intersection", "道路交叉口控制面", 44],
  ["streetscene", "街道场景控制面", 60],
  ["pcg-forest", "森林地表控制面", 36],
  ["forest-floor", "林下地表控制面", 12],
  ["ecosystem-art-tool", "生态地表控制面", 54],
  ["ecosystem-brush-editor", "生态笔刷区域控制面", 54],
  ["biome-blend-world", "生物群系混合控制面", 54],
  ["ecosystem-bake-pipeline", "生态烘焙区域控制面", 54],
  ["ecological-association", "生态关联区域控制面", 54],
  ["ecosystem-lod-streaming", "生态流送区域控制面", 54],
  ["terrain-ecology-feedback", "地形生态反馈控制面", 54],
  ["ecosystem-succession", "生态演替区域控制面", 54],
  ["dual-grid-forest-camp", "森林营地控制面", 34],
  ["dual-grid-river-mill", "河谷磨坊控制面", 34],
]);

for (const [id, label, size] of EXTENDED_SURFACE_EDITORS) {
  attachSurfaceEditor(id, label, size, ["*"]);
}

const SPINE_EDIT_MODEL_IDS = Object.freeze([...new Set([
  "bonsai", "veg-tree", "veg-growing-tree", "veg-stylized-tree",
  "veg-authored-broadleaf", "veg-trellis-fruit", "veg-column-cypress",
  "veg-conifer", "veg-palm", "titan-tree", "street-tree",
  ...Object.keys(PROC_MODELS).filter((id) => id.startsWith("speedtree-")
    && PROC_MODELS[id]?.schema?.some((entry) => entry.key === "height")),
])]);

for (const id of SPINE_EDIT_MODEL_IDS) attachSpineEditor(id);

export const SPATIAL_EDIT_AUDIT = Object.freeze({
  registryCount: Object.keys(PROC_MODELS).length,
  curveModels: Object.freeze([
    "drawable-path-fence", "scatter-path-lights", "road", "freeway", "railway", "viaduct",
    "suspension-bridge", "pcg-brick-wall", "pcg-palisade-wall", "spline-stone-wall",
    "realistic-spline-path", "pcg-spline-curb-sidewalk", "pcg-curb-boulevard",
    "pcg-curb-market-street", "pcg-curb-riverside-walk", "pcg-curb-civic-crescent",
    "procedural-river", "river-lake", "pcg-biome-river",
    "titan-cable", "waterfall", "surface-sketch-vine",
    ...SPINE_EDIT_MODEL_IDS,
  ]),
  regionModels: Object.freeze(["masked-region-grove", "pcg-palisade-wall", "polygon-island"]),
  surfaceModels: Object.freeze([
    "terrain-island", "lunar-crater-surface", "pcg-river-valley",
    "terrain-layered", "fterrain", "cliff-panel-study",
    "rock-formation", "stylized-rock-island", "easy-cliff-rock",
    "houdini-cave", "ue5-pcg-cave", "grasshopper-landscape-contour",
    "grasshopper-reaction-diffusion", "pcg-cell-map", "pcg-world",
    "pcg-vegetation", "stylized-ocean-environment", "meadow",
    "rock-pile", "pcg-rock-cluster",
    ...EXTENDED_SURFACE_EDITORS.map(([id]) => id),
  ]),
});

export function defaultParams(model) {
  const p = {};
  for (const s of model.schema) p[s.key] = s.default;
  return p;
}
