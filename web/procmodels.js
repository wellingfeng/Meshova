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
  makeNoise,
  fbm2,
  vec3,
  buildSportsCarParts,
  buildGmcCanyonAt4xParts,
  buildBuickRiviera1965Parts,
  buildCartoonMechPilotParts,
  buildStylizedHumanoidParts,
  buildBuildingParts,
  buildMidnightHorseParts,
  buildReferenceDogParts,
  buildCityBlockParts,
  buildInteriorRoomParts,
  buildHardSurfaceKitParts,
  buildTerrainIslandParts,
  buildTShirt,
  buildSkirt,
  buildPants,
  buildDress,
  buildHoodie,
  buildAvatar,
  solveCloth,
  getFabric,
  tree,
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

const vineModel = {
  id: "vine",
  name: "程序化藤蔓",
  schema: [
    { key: "length", label: "长度", min: 1.5, max: 4, step: 0.1, default: 2.5 },
    { key: "wiggle", label: "弯曲", min: 0, max: 1.2, step: 0.05, default: 0.6 },
    { key: "thick", label: "根部粗细", min: 0.05, max: 0.25, step: 0.01, default: 0.12 },
    { key: "leaves", label: "叶片数量", min: 0, max: 40, step: 1, default: 16 },
    { key: "leafSize", label: "叶片大小", min: 0.08, max: 0.5, step: 0.01, default: 0.26 },
    { key: "seed", label: "形态种子", min: 0, max: 30, step: 1, default: 4 },
  ],
  build(p) {
    // build a wiggly control polyline, smooth it, sweep with taper
    const segs = 6;
    const pts = [];
    let h = (n) => (((n * 2654435761) ^ (p.seed * 40503)) >>> 0) / 4294967295 - 0.5;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      pts.push(vec3(h(i) * p.wiggle, t * p.length, h(i + 99) * p.wiggle));
    }
    const curve = smoothCurve(polyline(pts), 10);
    const m = sweep(curve, { radius: p.thick, sides: 10, radiusAt: (t) => 1 - t * 0.8, caps: true });
    const parts = [surfPart("vine", m, "wood", { tone: [0.3, 0.2, 0.12] })];

    // Leaves: sample positions along the smoothed curve, place a flattened
    // ellipsoid leaf at each, rotating around the stem by a phyllotaxis-like
    // angle so they spiral. Each leaf tilts outward and gets a slight pitch.
    const cp = curve.points;
    const nLeaves = Math.round(p.leaves);
    const goldenAngle = 2.39996; // ~137.5° in radians
    const tangentAt = (idx) => {
      const a = cp[Math.max(0, idx - 1)];
      const b = cp[Math.min(cp.length - 1, idx + 1)];
      return vec3(b.x - a.x, b.y - a.y, b.z - a.z);
    };
    const leafMeshes = [];
    for (let i = 0; i < nLeaves; i++) {
      // skip the very base; spread leaves over the upper 85% of the vine
      const t = 0.12 + (i + 0.5) / Math.max(1, nLeaves) * 0.85;
      const ci = Math.min(cp.length - 1, Math.round(t * (cp.length - 1)));
      const base = cp[ci];
      const stemR = p.thick * (1 - t * 0.8);
      const yaw = i * goldenAngle + h(i) * 0.4;
      // leaf base shape: a flat teardrop-ish ellipsoid (long in local +X)
      const sz = p.leafSize * (0.7 + (1 - t) * 0.5) * (0.85 + h(i + 7) * 0.3);
      let leaf = scaleMesh(sphere(1, 12, 8), vec3(sz * 1.6, sz * 0.08, sz));
      // shift so the leaf grows outward from the stem, then tilt up and spin
      leaf = transform(leaf, {
        translate: vec3(sz * 1.4 + stemR, 0, 0),
        rotate: vec3(0, 0, 0.5 + h(i + 31) * 0.3),
      });
      leaf = transform(leaf, {
        rotate: vec3(0, yaw, 0),
        translate: vec3(base.x, base.y, base.z),
      });
      leafMeshes.push(leaf);
    }
    if (leafMeshes.length > 0) {
      parts.push(surfPart("leaves", merge(...leafMeshes), "fabric", { color: [0.24, 0.5, 0.18] }));
    }
    return parts;
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

// ---- P7 vegetation: SpeedTree-style recursive spline tree ----
const BARK_COL = [0.32, 0.22, 0.14];
const LEAF_COL = [0.18, 0.42, 0.13];
const BLADE_COL = [0.24, 0.5, 0.16];

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

export const PROC_MODELS = { sphere: sphereModel, teddy, rock, tower, pagoda, building, cityblock: cityBlock, "interior-room": interiorRoom, "hard-surface-kit": hardSurfaceKit, "terrain-island": terrainIsland, mushroom, gear, officechair: officeChair, dragonfly, "sports-car": sportsCar, "gmc-canyon-at4x": gmcCanyonAt4x, "buick-riviera-1965": buickRiviera1965, "midnight-horse": midnightHorse, "reference-dog": referenceDog, "cartoon-mech-pilot": cartoonMechPilot, "stylized-humanoid": stylizedHumanoid, tshirt: tshirtModel, skirt: skirtModel, pants: pantsModel, dress: dressModel, hoodie: hoodieModel, smooth: smoothModel, spring: springModel, vine: vineModel, meadow: meadowModel, csg: csgModel, fterrain: terrainModel, wineglass: wineGlassModel, "veg-tree": treeModel, "veg-shrub": shrubModel, "veg-grass": grassModel, "veg-conifer": coniferModel, "veg-palm": palmModel, ...SPEEDTREE_MODELS, ...SPEEDTREE_TUTORIAL_MODELS };

/** Default param object from a schema. */
export function defaultParams(model) {
  const p = {};
  for (const s of model.schema) p[s.key] = s.default;
  return p;
}
