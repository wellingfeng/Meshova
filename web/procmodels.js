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
  sweep,
  poissonScatter,
  union,
  subtract,
  intersect,
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
  buildCartoonMechPilotParts,
  buildStylizedHumanoidParts,
  buildBuildingParts,
  buildUrbanBuildingParts,
  urbanDefaults,
  buildChineseHallParts,
  buildMountainVillageParts,
  buildMidnightHorseParts,
  buildReferenceDogParts,
  buildCityBlockParts,
  buildStreetsceneParts,
  buildInteriorRoomParts,
  buildHardSurfaceKitParts,
  buildTerrainIslandParts,
  buildCloudParts,
  buildCloudSkyParts,
  buildVineParts,
  buildVineStemMesh,
  buildIvyRuinsParts,
  buildRootsParts,
  buildRootMesh,
  buildRockFormationParts,
  buildRockFormationMesh,
  ruleVariantBySlope,
  buildPolygonIslandParts,
  buildTerrainField,
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
  growingTree,
  shrub,
  grass,
  conifer,
  palm,
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
  buildFreewayParts,
  buildRailwayParts,
  buildViaductParts,
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
  buildFreewaySignParts,
  buildMaterialStackParts,
  buildWaterTowerParts,
  buildWfcRooftopParts,
  buildIntersectionParts,
  makeTerrainPrimitiveField,
  heightfieldToTerrainMesh,
  sampleField2DBilinear,
  makeMesh,
  recomputeNormals,
} from "/dist/index.js";
import { SPEEDTREE_TUTORIAL_MODELS } from "/web/speedtree-tutorial-procmodels.js";

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
  return sp;
}

function speedTreePart(name, mesh, type, params, windKind, seed) {
  const sp = surfPart(name, mesh, type, params);
  sp.windWeight = windChannels(mesh, { kind: windKind, seed }).combined;
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

function speedTreeLibrarySchema(entry, defaults) {
  const hMax = Math.max(2, defaults.height * 2.2);
  return [
    { key: "seed", label: "随机种子", min: 0, max: 999999, step: 1, default: defaults.seed },
    { key: "height", label: "整体高度", min: 0.2, max: hMax, step: 0.05, default: defaults.height },
    { key: "trunkScale", label: "枝干粗细", min: 0.25, max: 3, step: 0.01, default: defaults.trunkScale },
    { key: "crownScale", label: "冠幅/扩散", min: 0.2, max: 3, step: 0.01, default: defaults.crownScale },
    { key: "crownDepth", label: "冠层深度", min: 0.2, max: 3, step: 0.01, default: defaults.crownDepth },
    { key: "branchAngle", label: "分枝角度偏移", min: -45, max: 45, step: 1, default: defaults.branchAngle },
    { key: "branchCount", label: "枝/茎数量", min: 0.1, max: 3, step: 0.05, default: defaults.branchCount },
    { key: "leafDensity", label: "叶/花密度", min: 0, max: 3, step: 0.05, default: defaults.leafDensity },
    { key: "leafSize", label: "叶/花尺寸", min: 0.2, max: 3, step: 0.01, default: defaults.leafSize },
    { key: "gnarl", label: "枝干扭曲", min: 0, max: 3, step: 0.01, default: defaults.gnarl },
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
    schema: speedTreeLibrarySchema(entry, defaults),
    defaultParams: () => ({ ...defaults }),
    build(params) {
      return buildSpeedTreeLibraryPlant(entry, { quality, params });
    },
  };
}

// ---- teddy bear, fully parameterized ----
const teddy = {
  id: "teddy",
  name: "卡通小熊",
  schema: [
    { key: "headSize", label: "头部大小", min: 0.4, max: 1.1, step: 0.01, default: 0.75 },
    { key: "earSize", label: "耳朵大小", min: 0.1, max: 0.5, step: 0.01, default: 0.3 },
    { key: "bodyW", label: "身体宽度", min: 0.6, max: 1.2, step: 0.01, default: 0.85 },
    { key: "bodyH", label: "身体高度", min: 0.8, max: 1.4, step: 0.01, default: 1.05 },
    { key: "limb", label: "四肢粗细", min: 0.3, max: 0.7, step: 0.01, default: 0.45 },
    { key: "snout", label: "口鼻大小", min: 0.2, max: 0.5, step: 0.01, default: 0.34 },
  ],
  build(p) {
    const FUR = [0.55, 0.36, 0.18];
    const LIGHT = [0.78, 0.6, 0.4];
    const DARK = [0.07, 0.05, 0.04];
    const parts = [];
    const headY = 0.4 + p.bodyH;
    const furP = (name, mesh, tint) => surfPart(name, mesh, "fur", { tint });
    parts.push(furP("body", scaleMesh(sphere(1, 28, 22), vec3(p.bodyW, p.bodyH, p.bodyW * 0.94)), FUR));
    parts.push(furP("belly", transform(sphere(0.55, 24, 18), { scale: vec3(0.7, 0.85, 0.5), translate: vec3(0, -0.05, p.bodyW * 0.65) }), LIGHT));
    parts.push(furP("head", transform(sphere(p.headSize, 28, 22), { translate: vec3(0, headY, 0.05) }), FUR));
    for (const side of [-1, 1]) {
      parts.push(furP(`ear_${side}`, transform(sphere(p.earSize, 18, 14), { scale: vec3(1, 1, 0.55), translate: vec3(p.headSize * 0.66 * side, headY + p.headSize * 0.73, 0) }), FUR));
      parts.push(furP(`ear_inner_${side}`, transform(sphere(p.earSize * 0.55, 16, 12), { scale: vec3(1, 1, 0.45), translate: vec3(p.headSize * 0.66 * side, headY + p.headSize * 0.73, 0.12) }), LIGHT));
    }
    parts.push(furP("muzzle", transform(sphere(p.snout, 22, 16), { scale: vec3(1.1, 0.85, 0.9), translate: vec3(0, headY - 0.12, p.headSize * 0.82) }), LIGHT));
    parts.push(surfPart("nose", transform(box(0.16, 0.12, 0.12), { translate: vec3(0, headY - 0.06, p.headSize * 0.82 + p.snout * 0.7) }), "plastic", { color: DARK, roughness: 0.3 }));
    // Eyes sit ON the head sphere surface so they stay visible: given the x/y
    // offset from the head center, solve z on the sphere of radius headSize.
    const eyeDx = p.headSize * 0.34;
    const eyeDy = 0.16;
    const eyeR = Math.max(0.08, p.headSize * 0.13);
    const eyeZ = 0.05 + Math.sqrt(Math.max(0.02, p.headSize * p.headSize - eyeDx * eyeDx - eyeDy * eyeDy)) - eyeR * 0.35;
    for (const side of [-1, 1]) {
      parts.push(surfPart(`eye_${side}`, transform(sphere(eyeR, 14, 10), { translate: vec3(eyeDx * side, headY + eyeDy, eyeZ) }), "plastic", { color: DARK, roughness: 0.15 }));
      parts.push(furP(`arm_${side}`, transform(sphere(0.34, 18, 14), { scale: vec3(p.limb / 0.45 * 0.55, 0.9, 0.55), rotate: vec3(0, 0, side * 0.5), translate: vec3((p.bodyW + 0.1) * side, 0.25, 0.1) }), FUR));
      parts.push(furP(`leg_${side}`, transform(sphere(0.42, 20, 16), { scale: vec3(p.limb / 0.45 * 0.7, 0.85, 0.85), translate: vec3(0.45 * side, -0.95, 0.1) }), FUR));
    }
    return parts;
  },
};

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

// ---- PCG vegetated terrain: the UE Electric Dreams scatter pipeline ----
// Terrain mesh -> surface sample -> slope density (陡坡不长草) -> noise density
// (疏密团簇) -> self-pruning (不穿模) -> clear a road band (Difference) ->
// copy tree/rock assemblies to the surviving points. All deterministic (seed).
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
    const trees = copyToPoints(cloud0(laid, 0), [treeMesh], {
      scale: pointAttribute("scale", 1),
      yaw: pointAttribute("yaw", 0),
      alignToNormal: false,
    });
    const lamps = copyToPoints(cloud0(laid, 1), [lampMesh], {
      yaw: pointAttribute("yaw", 0),
      alignToNormal: false,
    });
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
    { key: "halfWidth", label: "路面半宽", min: 1, max: 6, step: 0.25, default: 3 },
    { key: "curve", label: "弯曲程度", min: 0, max: 12, step: 0.5, default: 6 },
    { key: "length", label: "道路长度", min: 10, max: 40, step: 2, default: 24 },
    { key: "sample", label: "采样间距", min: 0.5, max: 4, step: 0.25, default: 1.5 },
    { key: "widthSub", label: "路宽细分", min: 1, max: 8, step: 1, default: 4 },
    { key: "curbH", label: "路缘高", min: 0, max: 0.5, step: 0.05, default: 0.2 },
    { key: "showLine", label: "中线(0/1)", min: 0, max: 1, step: 1, default: 1 },
  ],
  build(p) {
    const parts = [];
    const half = p.length / 2;
    const bend = p.curve;
    // S-shaped centerline via a cubic bezier on the XZ ground plane.
    const centerline = bezier(
      vec3(-bend, 0, -half),
      vec3(bend, 0, -half / 3),
      vec3(-bend, 0, half / 3),
      vec3(bend, 0, half),
      48,
    );
    const opts = {
      halfWidth: p.halfWidth,
      sampleDistance: p.sample,
      widthSubdivisions: Math.round(p.widthSub),
      adaptiveCurvature: true,
      curvatureThresholdDeg: 6,
      verticalOffset: 0.02,
    };
    // Asphalt surface (uniform dark ceramic reads as tarmac against the ground).
    parts.push(surfPart("road_surface", roadRibbon(centerline, opts), "ceramic", { color: [0.09, 0.09, 0.1], roughness: 0.92 }));
    // Raised curbs on both edges (light concrete via stone).
    if (p.curbH > 0.001) {
      parts.push(surfPart("curbs", roadCurbs(centerline, { ...opts, curbHeight: p.curbH, curbWidth: 0.3 }), "stone", { color: [0.62, 0.62, 0.64], roughness: 0.7 }));
    }
    // Painted centerline (glossy ceramic yellow).
    if (p.showLine > 0.5) {
      parts.push(surfPart("center_line", roadCenterLine(centerline, { ...opts, lineWidth: 0.2 }), "ceramic", { color: [0.95, 0.82, 0.15] }));
    }
    // Ground plane under the road for context.
    parts.push(surfPart("ground", transform(plane(p.length * 1.6, p.length * 1.6, 1, 1), { translate: vec3(0, 0, 0) }), "stone", { color: [0.2, 0.28, 0.16], roughness: 1 }));
    return parts;
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
      sample: p.sample,
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
  ],
  build(p) {
    return buildBillboardParts({
      panelWidth: p.panelWidth,
      panelHeight: p.panelHeight,
      clearance: p.clearance,
      singleMast: Math.round(p.singleMast) === 1,
      truss: Math.round(p.truss) === 1,
      lights: Math.round(p.lights) === 1,
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
    { key: "clusters", label: "树冠团数", min: 3, max: 12, step: 1, default: 7 },
    { key: "pit", label: "树池护栏(0/1)", min: 0, max: 1, step: 1, default: 1 },
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
    { key: "seed", label: "随机种子", min: 0, max: 64, step: 1, default: 5 },
  ],
  build(p) {
    return buildFreewaySignParts({
      span: p.span,
      postHeight: p.postHeight,
      signCount: Math.round(p.signCount),
      signHeight: p.signHeight,
      truss: Math.round(p.truss) === 1,
      lights: Math.round(p.lights) === 1,
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

// ---- four-arm road intersection kit (CitySample Kit_City_Road) ----
const intersection = {
  id: "intersection",
  name: "十字路口",
  schema: [
    { key: "roadHalfWidth", label: "路面半宽", min: 3, max: 8, step: 0.5, default: 5 },
    { key: "armLength", label: "路臂长", min: 5, max: 18, step: 1, default: 10 },
    { key: "lanes", label: "单向车道", min: 1, max: 4, step: 1, default: 2 },
    { key: "crosswalks", label: "斑马线(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "sidewalks", label: "人行道(0/1)", min: 0, max: 1, step: 1, default: 1 },
    { key: "west", label: "西臂(0/1)", min: 0, max: 1, step: 1, default: 1 },
  ],
  build(p) {
    return buildIntersectionParts({
      roadHalfWidth: p.roadHalfWidth,
      armLength: p.armLength,
      lanes: Math.round(p.lanes),
      crosswalks: Math.round(p.crosswalks) === 1,
      sidewalks: Math.round(p.sidewalks) === 1,
      arms: { north: true, south: true, east: true, west: Math.round(p.west) === 1 },
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
      seed: p.seed,
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
            const jw = cell * (0.85 + rng() * 0.3);
            const jd = cell * (0.85 + rng() * 0.3);
            const ci = placed % FIELD_COLORS.length;
            let m = plane(jw, jd, 1, 1);
            m = transform(m, { rotate: vec3(0, tilt, 0), translate: vec3(fx, gy + 0.04, fz) });
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
    { key: "focusBias", label: "冲击聚集", min: 0, max: 0.9, step: 0.05, default: 0 },
  ],
  build(p) {
    return buildTitanStackingParts({
      shards: Math.round(p.shards),
      fractureSeed: Math.round(p.fractureSeed),
      stackSeed: Math.round(p.stackSeed),
      spread: p.spread,
      focusBias: p.focusBias,
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
    { key: "pinMode", label: "固定点(0角/1顶/2中/3两角)", min: 0, max: 3, step: 1, default: 0 },
    { key: "sag", label: "垂坠深度", min: 0, max: 3, step: 0.1, default: 1.6 },
    { key: "wrinkle", label: "褶皱", min: 0, max: 0.4, step: 0.02, default: 0.12 },
    { key: "seed", label: "种子", min: 0, max: 64, step: 1, default: 3 },
  ],
  build(p) {
    const modes = ["corners", "top-edge", "center", "two-corners"];
    return buildTitanClothParts({
      width: p.width,
      depth: p.depth,
      resolution: Math.round(p.resolution),
      pinMode: modes[Math.round(p.pinMode)] ?? "corners",
      sag: p.sag,
      wrinkle: p.wrinkle,
      seed: Math.round(p.seed),
    });
  },
};

export const PROC_MODELS = { "town-scene": townScene, sphere: sphereModel, teddy, rock, "rock-pile": rockPile, "pcg-vegetation": pcgVegetation, "vine-slope": vineSlopeModel, "ivy-ruins": ivyRuinsModel, roots: rootsModel, "rock-formation": rockFormationModel, "pcg-colonnade": pcgColonnade, "pcg-plaza": pcgPlaza, "pcg-boulders": pcgBoulders, "terrain-layered": terrainLayered, "forest-floor": forestFloor, "triplanar-boulder": triplanarBoulder, tower, pagoda, building, "urban-artdeco": urbanArtDeco, "urban-glass": urbanGlassTower, "urban-brick": urbanBrickWalkup, "urban-office": urbanModernOffice, "urban-brownstone": urbanBrownstone, "urban-corporate": urbanCorporate, "chinese-hall": chineseHall, cityblock: cityBlock, streetscene, "interior-room": interiorRoom, "hard-surface-kit": hardSurfaceKit, "terrain-island": terrainIsland, cloud, "cloud-sky": cloudSky, "polygon-island": polygonIsland, "pcg-world": pcgWorld, "mountain-village": mountainVillage, mushroom, gear, road, freeway, railway, viaduct, "titan-rail": titanRail, "titan-fence": titanFence, "titan-cable": titanCable, "titan-adboard": titanAdBoard, "titan-shrub": titanShrub, "titan-platform": titanPlatform, "titan-building": titanBuilding, "titan-stacking": titanStacking, "titan-train": titanTrain, "titan-tree": titanTree, "titan-cloth": titanCloth, pylon, "tower-crane": towerCrane, "wind-turbine": windTurbine, "toll-station": tollStation, "tunnel-portal": tunnelPortal, "rooftop-kit": rooftopKit, scaffolding, "bus-stop": busStop, bicycle, billboard, "container-yard": containerYard, "manhole-cover": manholeCover, "barrier-run": barrierRun, "fire-escape": fireEscape, newsstand, "traffic-signal": trafficSignal, "umbrella-table": umbrellaTable, "street-tree": streetTree, "freeway-sign": freewaySign, "material-stack": materialStack, "water-tower": waterTower, "wfc-rooftop": wfcRooftop, intersection, officechair: officeChair, dragonfly, "sports-car": sportsCar, "gmc-canyon-at4x": gmcCanyonAt4x, "buick-riviera-1965": buickRiviera1965, "midnight-horse": midnightHorse, "reference-dog": referenceDog, "cartoon-mech-pilot": cartoonMechPilot, "stylized-humanoid": stylizedHumanoid, tshirt: tshirtModel, skirt: skirtModel, pants: pantsModel, dress: dressModel, hoodie: hoodieModel, smooth: smoothModel, spring: springModel, vine: vineModel, meadow: meadowModel, csg: csgModel, fterrain: terrainModel, wineglass: wineGlassModel, "veg-tree": treeModel, "veg-growing-tree": growingTreeModel, "veg-stylized-tree": stylizedTreeModel, "veg-authored-broadleaf": authoredBroadleafModel, "veg-trellis-fruit": trellisFruitModel, "veg-column-cypress": columnCypressAuthoringModel, "veg-authoring-lineup": authoringLineupModel, "veg-shrub": shrubModel, "veg-grass": grassModel, "veg-conifer": coniferModel, "veg-palm": palmModel, ...SPEEDTREE_MODELS, ...SPEEDTREE_TUTORIAL_MODELS };

/** Default param object from a schema. */
export function defaultParams(model) {
  const p = {};
  for (const s of model.schema) p[s.key] = s.default;
  return p;
}
