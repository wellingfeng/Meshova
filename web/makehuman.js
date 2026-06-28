const ROOT = "/assets/third_party/makehuman";
const TARGET_ROOT = `${ROOT}/targets`;

const SOURCE = {
  repository: "https://github.com/makehumancommunity/makehuman",
  license: "CC0 1.0 Universal",
  licenseFile: "assets/third_party/makehuman/LICENSE.ASSETS.md",
};

const TARGET_FILES = {
  caucasianFemaleYoung: "caucasian-female-young.target",
  caucasianMaleYoung: "caucasian-male-young.target",
  caucasianFemaleChild: "caucasian-female-child.target",
  caucasianMaleChild: "caucasian-male-child.target",
  caucasianFemaleOld: "caucasian-female-old.target",
  caucasianMaleOld: "caucasian-male-old.target",
  asianFemaleYoung: "asian-female-young.target",
  asianMaleYoung: "asian-male-young.target",
  africanFemaleYoung: "african-female-young.target",
  africanMaleYoung: "african-male-young.target",
  femaleWeightMax: "universal-female-young-averagemuscle-maxweight.target",
  femaleWeightMin: "universal-female-young-averagemuscle-minweight.target",
  maleWeightMax: "universal-male-young-averagemuscle-maxweight.target",
  maleWeightMin: "universal-male-young-averagemuscle-minweight.target",
  femaleMuscleMax: "universal-female-young-maxmuscle-averageweight.target",
  femaleMuscleMin: "universal-female-young-minmuscle-averageweight.target",
  maleMuscleMax: "universal-male-young-maxmuscle-averageweight.target",
  maleMuscleMin: "universal-male-young-minmuscle-averageweight.target",
  femaleHeightMax: "female-young-averagemuscle-averageweight-maxheight.target",
  femaleHeightMin: "female-young-averagemuscle-averageweight-minheight.target",
  maleHeightMax: "male-young-averagemuscle-averageweight-maxheight.target",
  maleHeightMin: "male-young-averagemuscle-averageweight-minheight.target",
  femaleIdealProportions: "female-young-averagemuscle-averageweight-idealproportions.target",
  femaleUncommonProportions: "female-young-averagemuscle-averageweight-uncommonproportions.target",
  maleIdealProportions: "male-young-averagemuscle-averageweight-idealproportions.target",
  maleUncommonProportions: "male-young-averagemuscle-averageweight-uncommonproportions.target",
  femHourglass: "bodyshapes-elvs-fem-neat-hourglass.target",
  femFullHourglass: "bodyshapes-elvs-fem-full-hourglass.target",
  femInvertedTriangle: "bodyshapes-elvs-fem-invert-triangle.target",
  manTrapezoid: "bodyshapes-elvs-man-trapezoid.target",
  manInvertedTriangle: "bodyshapes-elvs-man-invert-triangle.target",
  torsoVIncr: "torso-vshape-incr.target",
  torsoVDecr: "torso-vshape-decr.target",
  torsoWidthIncr: "torso-scale-horiz-incr.target",
  torsoWidthDecr: "torso-scale-horiz-decr.target",
  torsoDepthIncr: "torso-scale-depth-incr.target",
  torsoDepthDecr: "torso-scale-depth-decr.target",
  torsoHeightIncr: "torso-scale-vert-incr.target",
  torsoHeightDecr: "torso-scale-vert-decr.target",
  pectoralIncr: "torso-muscle-pectoral-incr.target",
  pectoralDecr: "torso-muscle-pectoral-decr.target",
  dorsiIncr: "torso-muscle-dorsi-incr.target",
  dorsiDecr: "torso-muscle-dorsi-decr.target",
  headAgeIncr: "head-age-incr.target",
  headAgeDecr: "head-age-decr.target",
  headWidthIncr: "head-scale-horiz-incr.target",
  headWidthDecr: "head-scale-horiz-decr.target",
  headHeightIncr: "head-scale-vert-incr.target",
  headHeightDecr: "head-scale-vert-decr.target",
  headDepthIncr: "head-scale-depth-incr.target",
  headDepthDecr: "head-scale-depth-decr.target",
  headRound: "head-round.target",
  headSquare: "head-square.target",
  headOval: "head-oval.target",
  upperLegsHeightIncr: "upperlegs-height-incr.target",
  upperLegsHeightDecr: "upperlegs-height-decr.target",
  lowerLegsHeightIncr: "lowerlegs-height-incr.target",
  lowerLegsHeightDecr: "lowerlegs-height-decr.target",
  lHandScaleIncr: "l-hand-scale-incr.target",
  rHandScaleIncr: "r-hand-scale-incr.target",
  lHandScaleDecr: "l-hand-scale-decr.target",
  rHandScaleDecr: "r-hand-scale-decr.target",
  lFingerLengthIncr: "l-hand-fingers-length-incr.target",
  rFingerLengthIncr: "r-hand-fingers-length-incr.target",
  lFingerLengthDecr: "l-hand-fingers-length-decr.target",
  rFingerLengthDecr: "r-hand-fingers-length-decr.target",
  lFootScaleIncr: "l-foot-scale-incr.target",
  rFootScaleIncr: "r-foot-scale-incr.target",
  lFootScaleDecr: "l-foot-scale-decr.target",
  rFootScaleDecr: "r-foot-scale-decr.target",
  lUpperArmMuscleIncr: "l-upperarm-muscle-incr.target",
  rUpperArmMuscleIncr: "r-upperarm-muscle-incr.target",
  lUpperArmMuscleDecr: "l-upperarm-muscle-decr.target",
  rUpperArmMuscleDecr: "r-upperarm-muscle-decr.target",
  lLowerArmMuscleIncr: "l-lowerarm-muscle-incr.target",
  rLowerArmMuscleIncr: "r-lowerarm-muscle-incr.target",
  lLowerArmMuscleDecr: "l-lowerarm-muscle-decr.target",
  rLowerArmMuscleDecr: "r-lowerarm-muscle-decr.target",
  lUpperLegMuscleIncr: "l-upperleg-muscle-incr.target",
  rUpperLegMuscleIncr: "r-upperleg-muscle-incr.target",
  lUpperLegMuscleDecr: "l-upperleg-muscle-decr.target",
  rUpperLegMuscleDecr: "r-upperleg-muscle-decr.target",
  lLowerLegMuscleIncr: "l-lowerleg-muscle-incr.target",
  rLowerLegMuscleIncr: "r-lowerleg-muscle-incr.target",
  lLowerLegMuscleDecr: "l-lowerleg-muscle-decr.target",
  rLowerLegMuscleDecr: "r-lowerleg-muscle-decr.target",
};

export const makeHumanParamSchema = [
  { key: "sex", label: "性别", min: 0, max: 1, step: 0.01, default: 0.65 },
  { key: "age", label: "年龄", min: -1, max: 1, step: 0.01, default: 0 },
  { key: "ethnicity", label: "族裔混合", min: -1, max: 1, step: 0.01, default: 0 },
  { key: "height", label: "身高", min: -1, max: 1, step: 0.01, default: 0.1 },
  { key: "weight", label: "体重", min: -1, max: 1, step: 0.01, default: -0.05 },
  { key: "muscle", label: "肌肉", min: -1, max: 1, step: 0.01, default: 0.08 },
  { key: "proportion", label: "比例", min: -1, max: 1, step: 0.01, default: 0 },
  { key: "hourglass", label: "沙漏体型", min: 0, max: 1, step: 0.01, default: 0.22 },
  { key: "invertedTriangle", label: "倒三角", min: 0, max: 1, step: 0.01, default: 0.04 },
  { key: "torsoV", label: "躯干V形", min: -1, max: 1, step: 0.01, default: -0.05 },
  { key: "torsoWidth", label: "躯干宽度", min: -1, max: 1, step: 0.01, default: -0.05 },
  { key: "torsoDepth", label: "躯干厚度", min: -1, max: 1, step: 0.01, default: 0 },
  { key: "torsoHeight", label: "躯干高度", min: -1, max: 1, step: 0.01, default: 0 },
  { key: "chestMuscle", label: "胸肌", min: -1, max: 1, step: 0.01, default: 0.02 },
  { key: "backMuscle", label: "背肌", min: -1, max: 1, step: 0.01, default: 0.02 },
  { key: "headAge", label: "头部年龄", min: -1, max: 1, step: 0.01, default: 0 },
  { key: "headWidth", label: "头宽", min: -1, max: 1, step: 0.01, default: 0 },
  { key: "headHeight", label: "头高", min: -1, max: 1, step: 0.01, default: 0 },
  { key: "headDepth", label: "头深", min: -1, max: 1, step: 0.01, default: 0 },
  { key: "headRound", label: "圆脸", min: 0, max: 1, step: 0.01, default: 0.1 },
  { key: "headSquare", label: "方脸", min: 0, max: 1, step: 0.01, default: 0 },
  { key: "headOval", label: "椭圆脸", min: 0, max: 1, step: 0.01, default: 0.15 },
  { key: "upperLegLength", label: "大腿长度", min: -1, max: 1, step: 0.01, default: 0.03 },
  { key: "lowerLegLength", label: "小腿长度", min: -1, max: 1, step: 0.01, default: 0.03 },
  { key: "handSize", label: "手大小", min: -1, max: 1, step: 0.01, default: 0 },
  { key: "fingerLength", label: "手指长度", min: -1, max: 1, step: 0.01, default: 0 },
  { key: "footSize", label: "脚大小", min: -1, max: 1, step: 0.01, default: 0 },
  { key: "armMuscle", label: "手臂肌肉", min: -1, max: 1, step: 0.01, default: 0.02 },
  { key: "legMuscle", label: "腿部肌肉", min: -1, max: 1, step: 0.01, default: 0.02 },
];

let cachedRig = null;

export async function getMakeHumanRig() {
  if (cachedRig) return cachedRig;
  const objText = await fetchText(`${ROOT}/base.obj`);
  const parsed = parseOBJ(objText);
  const bodyFaces = parsed.groups.get("body");
  if (!bodyFaces || bodyFaces.length === 0) throw new Error("MakeHuman base.obj has no body group");
  const targetEntries = await Promise.all(Object.entries(TARGET_FILES).map(async ([id, file]) => {
    const text = await fetchText(`${TARGET_ROOT}/${file}`);
    return [id, parseTarget(text, file)];
  }));
  cachedRig = {
    source: SOURCE,
    positions: parsed.positions,
    uvs: parsed.uvs,
    bodyFaces,
    norm: bodyNormalization(parsed.positions, bodyFaces),
    targets: new Map(targetEntries),
  };
  return cachedRig;
}

export function defaultMakeHumanParams() {
  const out = {};
  for (const spec of makeHumanParamSchema) out[spec.key] = spec.default;
  return out;
}

export async function buildMakeHumanParts(params = {}) {
  const rig = await getMakeHumanRig();
  const p = { ...defaultMakeHumanParams(), ...params };
  const weights = makeWeights(p);
  const morphed = applyTargets(rig.positions, rig.targets, weights);
  const mesh = buildBodyMesh(rig, morphed);
  const color = skinTone(p);
  return [{
    name: "body",
    color,
    surface: { type: "skin", params: { tone: color, roughness: 0.62, poreScale: 0.55 } },
    mesh,
  }];
}

export async function buildMakeHumanViewerModel(params = {}, name = "makehuman-live") {
  const parts = await buildMakeHumanParts(params);
  const part = parts[0];
  return {
    format: "meshova-model@1",
    name,
    source: SOURCE,
    morphWeights: makeWeights({ ...defaultMakeHumanParams(), ...params }),
    meta: {
      parts: 1,
      verts: part.mesh.positions.length,
      tris: part.mesh.indices.length / 3,
    },
    parts: [{
      name: part.name,
      color: part.color,
      positions: flat3(part.mesh.positions),
      normals: flat3(part.mesh.normals),
      uvs: flat2(part.mesh.uvs),
      indices: part.mesh.indices,
      surface: part.surface,
    }],
  };
}

function makeWeights(p) {
  const w = {};
  const add = (id, weight) => {
    if (!weight) return;
    w[id] = (w[id] || 0) + weight;
  };
  const pair = (v, inc, dec, scale = 1) => {
    const x = clamp(v, -1, 1) * scale;
    if (x > 0) add(inc, x);
    else if (x < 0) add(dec, -x);
  };
  const sex = clamp(p.sex, 0, 1);
  const female = sex;
  const male = 1 - sex;
  const child = clamp(-p.age, 0, 1);
  const old = clamp(p.age, 0, 1);
  const young = Math.max(0, 1 - child - old);
  const ethnicity = clamp(p.ethnicity, -1, 1);
  const asian = clamp(ethnicity, 0, 1);
  const african = clamp(-ethnicity, 0, 1);
  const caucasian = Math.max(0, 1 - asian - african);

  add("caucasianFemaleYoung", caucasian * female * young);
  add("caucasianMaleYoung", caucasian * male * young);
  add("caucasianFemaleChild", caucasian * female * child);
  add("caucasianMaleChild", caucasian * male * child);
  add("caucasianFemaleOld", caucasian * female * old);
  add("caucasianMaleOld", caucasian * male * old);
  add("asianFemaleYoung", asian * female * young);
  add("asianMaleYoung", asian * male * young);
  add("africanFemaleYoung", african * female * young);
  add("africanMaleYoung", african * male * young);

  pair(p.height, "femaleHeightMax", "femaleHeightMin", female);
  pair(p.height, "maleHeightMax", "maleHeightMin", male);
  pair(p.weight, "femaleWeightMax", "femaleWeightMin", female);
  pair(p.weight, "maleWeightMax", "maleWeightMin", male);
  pair(p.muscle, "femaleMuscleMax", "femaleMuscleMin", female);
  pair(p.muscle, "maleMuscleMax", "maleMuscleMin", male);
  pair(p.proportion, "femaleIdealProportions", "femaleUncommonProportions", female);
  pair(p.proportion, "maleIdealProportions", "maleUncommonProportions", male);

  add("femHourglass", p.hourglass * female);
  add("femFullHourglass", Math.max(0, p.hourglass - 0.45) * female);
  add("femInvertedTriangle", p.invertedTriangle * female);
  add("manTrapezoid", p.hourglass * male * 0.4);
  add("manInvertedTriangle", p.invertedTriangle * male);
  pair(p.torsoV, "torsoVIncr", "torsoVDecr");
  pair(p.torsoWidth, "torsoWidthIncr", "torsoWidthDecr");
  pair(p.torsoDepth, "torsoDepthIncr", "torsoDepthDecr");
  pair(p.torsoHeight, "torsoHeightIncr", "torsoHeightDecr");
  pair(p.chestMuscle, "pectoralIncr", "pectoralDecr");
  pair(p.backMuscle, "dorsiIncr", "dorsiDecr");

  pair(p.headAge, "headAgeIncr", "headAgeDecr");
  pair(p.headWidth, "headWidthIncr", "headWidthDecr");
  pair(p.headHeight, "headHeightIncr", "headHeightDecr");
  pair(p.headDepth, "headDepthIncr", "headDepthDecr");
  add("headRound", p.headRound);
  add("headSquare", p.headSquare);
  add("headOval", p.headOval);

  pair(p.upperLegLength, "upperLegsHeightIncr", "upperLegsHeightDecr");
  pair(p.lowerLegLength, "lowerLegsHeightIncr", "lowerLegsHeightDecr");
  pair(p.handSize, "lHandScaleIncr", "lHandScaleDecr");
  pair(p.handSize, "rHandScaleIncr", "rHandScaleDecr");
  pair(p.fingerLength, "lFingerLengthIncr", "lFingerLengthDecr");
  pair(p.fingerLength, "rFingerLengthIncr", "rFingerLengthDecr");
  pair(p.footSize, "lFootScaleIncr", "lFootScaleDecr");
  pair(p.footSize, "rFootScaleIncr", "rFootScaleDecr");
  pair(p.armMuscle, "lUpperArmMuscleIncr", "lUpperArmMuscleDecr");
  pair(p.armMuscle, "rUpperArmMuscleIncr", "rUpperArmMuscleDecr");
  pair(p.armMuscle, "lLowerArmMuscleIncr", "lLowerArmMuscleDecr", 0.7);
  pair(p.armMuscle, "rLowerArmMuscleIncr", "rLowerArmMuscleDecr", 0.7);
  pair(p.legMuscle, "lUpperLegMuscleIncr", "lUpperLegMuscleDecr");
  pair(p.legMuscle, "rUpperLegMuscleIncr", "rUpperLegMuscleDecr");
  pair(p.legMuscle, "lLowerLegMuscleIncr", "lLowerLegMuscleDecr", 0.7);
  pair(p.legMuscle, "rLowerLegMuscleIncr", "rLowerLegMuscleDecr", 0.7);
  return w;
}

function parseOBJ(text) {
  const positions = [];
  const uvs = [];
  const groups = new Map();
  let current = "default";
  const ensureGroup = (name) => {
    if (!groups.has(name)) groups.set(name, []);
    return groups.get(name);
  };
  ensureGroup(current);

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    const tag = parts[0];
    if (tag === "v") {
      positions.push({ x: Number(parts[1]), y: Number(parts[2]), z: Number(parts[3]) });
    } else if (tag === "vt") {
      uvs.push({ x: Number(parts[1]), y: 1 - Number(parts[2]) });
    } else if (tag === "g") {
      current = parts.slice(1).join("_") || "default";
      ensureGroup(current);
    } else if (tag === "f") {
      const face = parts.slice(1).map((token) => {
        const [vRaw, vtRaw] = token.split("/");
        return {
          v: parseIndex(vRaw, positions.length),
          vt: vtRaw ? parseIndex(vtRaw, uvs.length) : -1,
        };
      });
      if (face.length >= 3) ensureGroup(current).push(face);
    }
  }

  return { positions, uvs, groups };
}

function parseTarget(text, name) {
  const deltas = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const [idxRaw, dxRaw, dyRaw, dzRaw] = line.split(/\s+/);
    const index = Number.parseInt(idxRaw, 10);
    const dx = Number(dxRaw);
    const dy = Number(dyRaw);
    const dz = Number(dzRaw);
    if (!Number.isFinite(index) || !Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)) {
      throw new Error(`bad target line in ${name}: ${rawLine}`);
    }
    deltas.push({ index, dx, dy, dz });
  }
  return deltas;
}

function applyTargets(positions, targetData, weights) {
  const out = positions.map((p) => ({ x: p.x, y: p.y, z: p.z }));
  for (const [id, weight] of Object.entries(weights)) {
    if (!weight) continue;
    const deltas = targetData.get(id);
    if (!deltas) continue;
    for (const d of deltas) {
      const p = out[d.index];
      if (!p) continue;
      p.x += d.dx * weight;
      p.y += d.dy * weight;
      p.z += d.dz * weight;
    }
  }
  return out;
}

function buildBodyMesh(rig, positions) {
  const normPositions = normalizePositions(positions, rig.norm);
  const outPositions = [];
  const outUvs = [];
  const outIndices = [];
  const remap = new Map();
  const addCorner = (corner) => {
    const key = `${corner.v}/${corner.vt}`;
    const cached = remap.get(key);
    if (cached !== undefined) return cached;
    const next = outPositions.length;
    remap.set(key, next);
    outPositions.push(normPositions[corner.v]);
    outUvs.push(corner.vt >= 0 ? rig.uvs[corner.vt] : { x: 0, y: 0 });
    return next;
  };

  for (const face of rig.bodyFaces) {
    const ids = face.map(addCorner);
    for (let i = 1; i < ids.length - 1; i++) outIndices.push(ids[0], ids[i], ids[i + 1]);
  }

  const normals = outPositions.map(() => ({ x: 0, y: 0, z: 0 }));
  for (let i = 0; i < outIndices.length; i += 3) {
    const ia = outIndices[i], ib = outIndices[i + 1], ic = outIndices[i + 2];
    const n = cross(sub(outPositions[ib], outPositions[ia]), sub(outPositions[ic], outPositions[ia]));
    addTo(normals[ia], n);
    addTo(normals[ib], n);
    addTo(normals[ic], n);
  }

  return {
    positions: outPositions,
    normals: normals.map(normalize),
    uvs: outUvs,
    indices: outIndices,
  };
}

function bodyNormalization(positions, faces, targetHeight = 4.45) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const used = new Set();
  for (const face of faces) for (const c of face) used.add(c.v);
  for (const i of used) {
    const p = positions[i];
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); maxZ = Math.max(maxZ, p.z);
  }
  const scale = targetHeight / Math.max(1e-6, maxY - minY);
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  return { scale, cx, cz, minY };
}

function normalizePositions(positions, norm) {
  return positions.map((p) => ({
    x: (p.x - norm.cx) * norm.scale,
    y: (p.y - norm.minY) * norm.scale,
    z: (p.z - norm.cz) * norm.scale,
  }));
}

function skinTone(p) {
  const ethnicity = clamp(p.ethnicity, -1, 1);
  const base = ethnicity > 0
    ? [0.76, 0.56, 0.42]
    : ethnicity < 0
      ? [0.44, 0.28, 0.19]
      : [0.78, 0.62, 0.5];
  const ageDarken = Math.max(0, p.age || 0) * 0.04;
  return base.map((v) => Math.max(0, v - ageDarken));
}

function parseIndex(raw, count) {
  const idx = Number.parseInt(raw, 10);
  if (!Number.isFinite(idx)) throw new Error(`bad OBJ index: ${raw}`);
  return idx < 0 ? count + idx : idx - 1;
}

function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function addTo(a, b) {
  a.x += b.x; a.y += b.y; a.z += b.z;
}

function normalize(v) {
  const len = Math.hypot(v.x, v.y, v.z);
  return len > 0 ? { x: v.x / len, y: v.y / len, z: v.z / len } : { x: 0, y: 1, z: 0 };
}

function flat3(items) {
  const out = [];
  for (const p of items) out.push(p.x, p.y, p.z);
  return out;
}

function flat2(items) {
  const out = [];
  for (const p of items) out.push(p.x, p.y);
  return out;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, Number(v) || 0));
}

async function fetchText(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`failed to fetch ${path}`);
  return res.text();
}
