import { vec2 } from "../math/vec2.js";
import {
  add,
  distance,
  length,
  makeBasis,
  normalize,
  scale,
  sub,
  vec3,
  type Vec3,
} from "../math/vec3.js";
import {
  box,
  makeMesh,
  recomputeNormals,
  sphere,
  torus,
  transform,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import {
  applyMorphTargets,
  extractRegionMesh,
  landmarkPositions,
  validateCharacterTemplate,
  type CharacterJoint,
  type CharacterTemplate,
  type MorphDelta,
  type MorphTarget,
  type MorphWeights,
  type SkinWeight,
} from "./template.js";

type RGB = [number, number, number];

export interface StylizedHumanoidParams {
  height: number;
  shoulderWidth: number;
  waist: number;
  legLength: number;
  armLength: number;
  headSize: number;
  jawWidth: number;
  noseBridge: number;
  chibi: number;
  eyeSize: number;
}

export const STYLIZED_HUMANOID_DEFAULTS: StylizedHumanoidParams = {
  height: 0,
  shoulderWidth: 0,
  waist: 0,
  legLength: 0,
  armLength: 0,
  headSize: 0,
  jawWidth: 0,
  noseBridge: 0,
  chibi: 0,
  eyeSize: 0,
};

const SKIN: RGB = [0.86, 0.58, 0.42];
const SUIT: RGB = [0.1, 0.14, 0.42];
const ACCENT: RGB = [0.02, 0.62, 0.92];
const BOOT: RGB = [0.035, 0.04, 0.07];
const HAIR: RGB = [0.045, 0.025, 0.018];
const WHITE: RGB = [0.94, 0.94, 0.9];
const IRIS: RGB = [0.12, 0.36, 0.86];
const BLACK: RGB = [0.004, 0.004, 0.006];

interface BuildBuffers {
  positions: Vec3[];
  normals: Vec3[];
  uvs: { x: number; y: number }[];
  indices: number[];
  regionForVertex: string[];
}

function gaussian(x: number, center: number, width: number): number {
  const d = (x - center) / width;
  return Math.exp(-d * d);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function appendMesh(
  b: BuildBuffers,
  mesh: Mesh,
  region: string | ((p: Vec3, i: number) => string),
): void {
  const offset = b.positions.length;
  for (let i = 0; i < mesh.positions.length; i++) {
    const p = mesh.positions[i]!;
    const n = mesh.normals[i]!;
    const uv = mesh.uvs[i]!;
    b.positions.push(vec3(p.x, p.y, p.z));
    b.normals.push(vec3(n.x, n.y, n.z));
    b.uvs.push(vec2(uv.x, uv.y));
    b.regionForVertex.push(typeof region === "string" ? region : region(p, i));
  }
  for (const idx of mesh.indices) b.indices.push(idx + offset);
}

function ellipsoid(center: Vec3, radius: Vec3, segments = 24, rings = 16): Mesh {
  return transform(sphere(1, segments, rings), {
    scale: radius,
    translate: center,
  });
}

function stylizedHead(center: Vec3): Mesh {
  const base = ellipsoid(center, vec3(0.42, 0.52, 0.36), 32, 22);
  const positions = base.positions.map((p) => {
    const local = sub(p, center);
    const front = smoothstep(0.08, 0.34, local.z);
    const lower = smoothstep(0.16, -0.34, local.y);
    const cheek = gaussian(local.y, -0.08, 0.22) * front;
    return vec3(
      p.x * (1 + cheek * 0.08),
      p.y - lower * front * 0.025,
      p.z + front * (0.035 + cheek * 0.04),
    );
  });
  return recomputeNormals(makeMesh({
    positions,
    normals: base.normals.map((n) => vec3(n.x, n.y, n.z)),
    uvs: base.uvs.map((uv) => vec2(uv.x, uv.y)),
    indices: base.indices.slice(),
  }));
}

function tubeBetween(
  start: Vec3,
  end: Vec3,
  segments: number,
  sides: number,
  radiusAt: (t: number) => [number, number],
): Mesh {
  const axis = sub(end, start);
  const basis = makeBasis(axis);
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const center = add(start, scale(axis, t));
    const [rx, rz] = radiusAt(t);
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const dir = normalize(add(
        scale(basis.x, Math.cos(a) / Math.max(rx, 1e-6)),
        scale(basis.y, Math.sin(a) / Math.max(rz, 1e-6)),
      ));
      const pos = add(center, add(scale(basis.x, Math.cos(a) * rx), scale(basis.y, Math.sin(a) * rz)));
      positions.push(pos);
      normals.push(dir);
      uvs.push(vec2(j / sides, t));
    }
  }

  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j;
      const b = i * sides + ((j + 1) % sides);
      const c = (i + 1) * sides + j;
      const d = (i + 1) * sides + ((j + 1) % sides);
      indices.push(a, c, b, b, c, d);
    }
  }

  const addCap = (ring: number, normal: Vec3, flip: boolean) => {
    const center = positions.length;
    positions.push(ring === 0 ? start : end);
    normals.push(normal);
    uvs.push(vec2(0.5, 0.5));
    const ringStart = ring * sides;
    for (let j = 0; j < sides; j++) {
      const a = ringStart + j;
      const b = ringStart + ((j + 1) % sides);
      if (flip) indices.push(center, b, a);
      else indices.push(center, a, b);
    }
  };
  addCap(0, scale(normalize(axis), -1), true);
  addCap(segments, normalize(axis), false);

  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function ellipticLoft(
  sections: ReadonlyArray<{ y: number; rx: number; rz: number; x?: number; z?: number }>,
  sides = 24,
): Mesh {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]!;
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      positions.push(vec3((s.x ?? 0) + Math.cos(a) * s.rx, s.y, (s.z ?? 0) + Math.sin(a) * s.rz));
      normals.push(normalize(vec3(Math.cos(a) / s.rx, 0, Math.sin(a) / s.rz)));
      uvs.push(vec2(j / sides, i / (sections.length - 1)));
    }
  }
  for (let i = 0; i < sections.length - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j;
      const b = i * sides + ((j + 1) % sides);
      const c = (i + 1) * sides + j;
      const d = (i + 1) * sides + ((j + 1) % sides);
      indices.push(a, c, b, b, c, d);
    }
  }
  const addCap = (ring: number, up: boolean) => {
    const s = sections[ring]!;
    const center = positions.length;
    positions.push(vec3(s.x ?? 0, s.y, s.z ?? 0));
    normals.push(up ? vec3(0, 1, 0) : vec3(0, -1, 0));
    uvs.push(vec2(0.5, 0.5));
    const start = ring * sides;
    for (let j = 0; j < sides; j++) {
      const a = start + j;
      const b = start + ((j + 1) % sides);
      if (up) indices.push(center, a, b);
      else indices.push(center, b, a);
    }
  };
  addCap(0, false);
  addCap(sections.length - 1, true);
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function faceRegionFor(center: Vec3) {
  return (p: Vec3): string => {
    const local = sub(p, center);
    return local.z > 0.15 && local.y > -0.3 && local.y < 0.28 ? "face" : "head";
  };
}

function nearestVertex(positions: readonly Vec3[], target: Vec3): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < positions.length; i++) {
    const d = distance(positions[i]!, target);
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

function sparseMorph(
  id: string,
  label: string,
  base: readonly Vec3[],
  regionForVertex: readonly string[],
  fn: (p: Vec3, region: string) => Vec3,
  min = -1,
  max = 1,
  def = 0,
): MorphTarget {
  const deltas: MorphDelta[] = [];
  for (let i = 0; i < base.length; i++) {
    const d = fn(base[i]!, regionForVertex[i]!);
    if (length(d) > 1e-7) deltas.push({ index: i, delta: d });
  }
  return { id, label, min, max, default: def, deltas };
}

function makeRegions(regionForVertex: readonly string[]) {
  const map = new Map<string, number[]>();
  for (let i = 0; i < regionForVertex.length; i++) {
    const r = regionForVertex[i]!;
    const list = map.get(r) ?? [];
    list.push(i);
    map.set(r, list);
  }
  return [...map.entries()].map(([name, vertexIndices]) => ({ name, vertexIndices }));
}

function makeSkeleton(): CharacterJoint[] {
  return [
    { id: "root", bindPosition: vec3(0, 0.95, 0) },
    { id: "pelvis", parent: "root", bindPosition: vec3(0, 1.9, 0) },
    { id: "spine", parent: "pelvis", bindPosition: vec3(0, 2.55, 0) },
    { id: "neck", parent: "spine", bindPosition: vec3(0, 3.18, 0) },
    { id: "head", parent: "neck", bindPosition: vec3(0, 3.72, 0) },
    { id: "upper_arm_l", parent: "spine", bindPosition: vec3(-0.56, 2.94, 0) },
    { id: "lower_arm_l", parent: "upper_arm_l", bindPosition: vec3(-0.82, 2.35, 0.02) },
    { id: "hand_l", parent: "lower_arm_l", bindPosition: vec3(-0.98, 1.75, 0.03) },
    { id: "upper_arm_r", parent: "spine", bindPosition: vec3(0.56, 2.94, 0) },
    { id: "lower_arm_r", parent: "upper_arm_r", bindPosition: vec3(0.82, 2.35, 0.02) },
    { id: "hand_r", parent: "lower_arm_r", bindPosition: vec3(0.98, 1.75, 0.03) },
    { id: "upper_leg_l", parent: "pelvis", bindPosition: vec3(-0.24, 1.75, 0) },
    { id: "lower_leg_l", parent: "upper_leg_l", bindPosition: vec3(-0.22, 1.12, 0.01) },
    { id: "foot_l", parent: "lower_leg_l", bindPosition: vec3(-0.2, 0.18, 0.16) },
    { id: "upper_leg_r", parent: "pelvis", bindPosition: vec3(0.24, 1.75, 0) },
    { id: "lower_leg_r", parent: "upper_leg_r", bindPosition: vec3(0.22, 1.12, 0.01) },
    { id: "foot_r", parent: "lower_leg_r", bindPosition: vec3(0.2, 0.18, 0.16) },
  ];
}

function jointForRegion(region: string): string {
  if (region === "face" || region === "head") return "head";
  if (region === "neck") return "neck";
  if (region === "torso") return "spine";
  if (region === "pelvis") return "pelvis";
  if (region.includes("upper_arm")) return region;
  if (region.includes("lower_arm")) return region;
  if (region.includes("hand")) return region;
  if (region.includes("upper_leg")) return region;
  if (region.includes("lower_leg")) return region;
  if (region.includes("foot")) return region;
  return "root";
}

function buildSkinWeights(regionForVertex: readonly string[]): SkinWeight[] {
  return regionForVertex.map((region, vertex) => ({
    vertex,
    influences: [{ joint: jointForRegion(region), weight: 1 }],
  }));
}

let cachedTemplate: CharacterTemplate | undefined;

export function buildStylizedHumanoidTemplate(): CharacterTemplate {
  if (cachedTemplate) return cachedTemplate;

  const b: BuildBuffers = {
    positions: [],
    normals: [],
    uvs: [],
    indices: [],
    regionForVertex: [],
  };

  const headCenter = vec3(0, 3.72, 0.03);
  appendMesh(b, ellipticLoft([
    { y: 1.58, rx: 0.31, rz: 0.2 },
    { y: 1.78, rx: 0.44, rz: 0.27 },
    { y: 2.02, rx: 0.39, rz: 0.25 },
  ], 28), "pelvis");
  appendMesh(b, ellipticLoft([
    { y: 2.0, rx: 0.34, rz: 0.24 },
    { y: 2.28, rx: 0.42, rz: 0.27 },
    { y: 2.7, rx: 0.52, rz: 0.29 },
    { y: 3.08, rx: 0.42, rz: 0.23 },
  ], 32), "torso");
  appendMesh(b, tubeBetween(vec3(0, 3.06, 0), vec3(0, 3.34, 0.02), 4, 16, () => [0.13, 0.11]), "neck");
  appendMesh(b, stylizedHead(headCenter), faceRegionFor(headCenter));

  for (const side of [-1, 1] as const) {
    const tag = side < 0 ? "l" : "r";
    appendMesh(
      b,
      tubeBetween(
        vec3(side * 0.48, 2.92, 0),
        vec3(side * 0.82, 2.34, 0.03),
        7,
        16,
        (t) => [0.145 - t * 0.035, 0.12 - t * 0.025],
      ),
      `upper_arm_${tag}`,
    );
    appendMesh(
      b,
      tubeBetween(
        vec3(side * 0.82, 2.34, 0.03),
        vec3(side * 0.98, 1.76, 0.05),
        7,
        16,
        (t) => [0.11 - t * 0.025, 0.095 - t * 0.02],
      ),
      `lower_arm_${tag}`,
    );
    appendMesh(b, ellipsoid(vec3(side * 1.0, 1.63, 0.08), vec3(0.105, 0.12, 0.075), 14, 10), `hand_${tag}`);

    appendMesh(
      b,
      tubeBetween(
        vec3(side * 0.25, 1.82, 0),
        vec3(side * 0.22, 1.08, 0.02),
        8,
        18,
        (t) => [0.185 - t * 0.025, 0.145 - t * 0.02],
      ),
      `upper_leg_${tag}`,
    );
    appendMesh(
      b,
      tubeBetween(
        vec3(side * 0.22, 1.08, 0.02),
        vec3(side * 0.2, 0.32, 0.06),
        8,
        18,
        (t) => [0.145 - t * 0.035, 0.12 - t * 0.025],
      ),
      `lower_leg_${tag}`,
    );
    appendMesh(b, ellipsoid(vec3(side * 0.2, 0.15, 0.25), vec3(0.17, 0.09, 0.38), 20, 10), `foot_${tag}`);
  }

  const baseMesh = recomputeNormals(makeMesh({
    positions: b.positions,
    normals: b.normals,
    uvs: b.uvs,
    indices: b.indices,
  }));
  const base = baseMesh.positions;
  const regions = b.regionForVertex;
  const headTop = 3.72;

  const morphTargets: MorphTarget[] = [
    sparseMorph("body.height", "身高", base, regions, (p) => vec3(0, p.y * 0.12, 0)),
    sparseMorph("body.shoulderWidth", "肩宽", base, regions, (p, r) => {
      const m = r === "torso" || r.includes("arm") ? smoothstep(2.25, 3.05, p.y) : 0;
      return vec3(p.x * 0.16 * m, 0, 0);
    }),
    sparseMorph("body.waist", "腰围", base, regions, (p, r) => {
      const m = r === "torso" || r === "pelvis" ? gaussian(p.y, 2.18, 0.42) : 0;
      return vec3(p.x * 0.16 * m, 0, p.z * 0.1 * m);
    }),
    sparseMorph("body.legLength", "腿长", base, regions, (p) => {
      if (p.y < 0.28) return vec3(0, 0, 0);
      const belowHip = p.y < 1.9 ? (p.y - 0.28) * 0.13 : 0.21;
      return vec3(0, belowHip, 0);
    }),
    sparseMorph("body.armLength", "臂长", base, regions, (p, r) => {
      if (!r.includes("arm") && !r.includes("hand")) return vec3(0, 0, 0);
      const side = p.x < 0 ? -1 : 1;
      const down = Math.max(0, 2.95 - p.y);
      return vec3(side * down * 0.08, -down * 0.08, 0);
    }),
    sparseMorph("head.size", "头部大小", base, regions, (p, r) => {
      if (r !== "head" && r !== "face") return vec3(0, 0, 0);
      return scale(sub(p, headCenter), 0.18);
    }),
    sparseMorph("face.jawWidth", "下颌宽度", base, regions, (p, r) => {
      if (r !== "face" && r !== "head") return vec3(0, 0, 0);
      const m = smoothstep(headTop - 0.05, headTop - 0.42, p.y) * smoothstep(0.06, 0.34, p.z);
      return vec3(p.x * 0.18 * m, -0.025 * m, 0);
    }),
    sparseMorph("face.noseBridge", "鼻梁", base, regions, (p, r) => {
      if (r !== "face") return vec3(0, 0, 0);
      const mx = gaussian(p.x, 0, 0.11);
      const my = gaussian(p.y, headTop - 0.07, 0.18);
      const mz = smoothstep(0.16, 0.36, p.z);
      return vec3(0, 0, 0.095 * mx * my * mz);
    }),
    sparseMorph("style.chibi", "卡通比例", base, regions, (p, r) => {
      if (r === "head" || r === "face") return scale(sub(p, headCenter), 0.28);
      if (r === "neck") return vec3(0, 0.05, 0);
      return vec3(-p.x * 0.07, p.y < 2.0 ? -0.04 : 0, -p.z * 0.04);
    }),
  ];

  const landmarks = [
    { name: "leftEye", vertexIndex: nearestVertex(base, vec3(-0.15, 3.78, 0.39)) },
    { name: "rightEye", vertexIndex: nearestVertex(base, vec3(0.15, 3.78, 0.39)) },
    { name: "noseTip", vertexIndex: nearestVertex(base, vec3(0, 3.68, 0.43)) },
    { name: "mouth", vertexIndex: nearestVertex(base, vec3(0, 3.55, 0.38)) },
    { name: "headTop", vertexIndex: nearestVertex(base, vec3(0, 4.22, 0.02)) },
    { name: "pelvis", vertexIndex: nearestVertex(base, vec3(0, 1.9, 0.27)) },
  ];

  cachedTemplate = {
    id: "stylized-humanoid-v0",
    name: "Stylized Humanoid V0",
    baseMesh,
    regions: makeRegions(regions),
    regionForVertex: regions,
    landmarks,
    skeleton: { joints: makeSkeleton() },
    skinWeights: buildSkinWeights(regions),
    morphTargets,
    materialSlots: [
      { name: "skin", regions: ["head", "face", "neck", "hand_l", "hand_r"], surface: { type: "skin", params: { tone: SKIN } } },
      { name: "body_suit", regions: ["torso", "pelvis"], surface: { type: "fabric", params: { color: SUIT } } },
      { name: "boots", regions: ["lower_leg_l", "lower_leg_r", "foot_l", "foot_r"], surface: { type: "plastic", params: { color: BOOT, roughness: 0.42 } } },
    ],
  };
  validateCharacterTemplate(cachedTemplate);
  return cachedTemplate;
}

function addPart(
  parts: NamedPart[],
  name: string,
  mesh: Mesh,
  color: RGB,
  surfaceType?: string,
  params?: Record<string, unknown>,
): void {
  const part: NamedPart = { name, mesh, color };
  if (surfaceType) part.surface = params ? { type: surfaceType, params } : { type: surfaceType };
  parts.push(part);
}

function morphWeightsFromParams(p: StylizedHumanoidParams): MorphWeights {
  return {
    "body.height": p.height,
    "body.shoulderWidth": p.shoulderWidth,
    "body.waist": p.waist,
    "body.legLength": p.legLength,
    "body.armLength": p.armLength,
    "head.size": p.headSize,
    "face.jawWidth": p.jawWidth,
    "face.noseBridge": p.noseBridge,
    "style.chibi": p.chibi,
  };
}

function partRegions(side: "l" | "r", kind: "lowerArm" | "boot") {
  if (kind === "lowerArm") return [`lower_arm_${side}`, `hand_${side}`];
  return [`lower_leg_${side}`, `foot_${side}`];
}

export function buildStylizedHumanoidParts(params: Partial<StylizedHumanoidParams> = {}): NamedPart[] {
  const p = { ...STYLIZED_HUMANOID_DEFAULTS, ...params };
  const template = buildStylizedHumanoidTemplate();
  const body = applyMorphTargets(template, morphWeightsFromParams(p));
  const marks = landmarkPositions(template, body);
  const parts: NamedPart[] = [];

  addPart(parts, "body_template_morph", body, SKIN, "skin", { tone: SKIN, poreScale: 0.55 });

  const torsoSuit = extractRegionMesh(template, body, ["torso", "pelvis"], 0.018);
  addPart(parts, "conformed_body_suit", torsoSuit, SUIT, "fabric", { color: SUIT });

  for (const side of ["l", "r"] as const) {
    addPart(
      parts,
      `conformed_glove_${side}`,
      extractRegionMesh(template, body, partRegions(side, "lowerArm"), 0.022),
      BOOT,
      "plastic",
      { color: BOOT, roughness: 0.5 },
    );
    addPart(
      parts,
      `conformed_boot_${side}`,
      extractRegionMesh(template, body, partRegions(side, "boot"), 0.026),
      BOOT,
      "plastic",
      { color: BOOT, roughness: 0.38 },
    );
  }

  const beltY = (marks.pelvis?.y ?? 1.9) + 0.1 + p.legLength * 0.08;
  addPart(parts, "waist_ring", transform(torus(0.43, 0.025, 32, 8), {
    scale: vec3(1.0 + p.waist * 0.08, 0.5, 0.62 + p.waist * 0.05),
    translate: vec3(0, beltY, 0.01),
  }), ACCENT, "plastic", { color: ACCENT, roughness: 0.25 });

  const eyeScale = 1 + p.eyeSize * 0.35 + p.chibi * 0.18;
  const leftEye = marks.leftEye ?? vec3(-0.15, 3.78, 0.39);
  const rightEye = marks.rightEye ?? vec3(0.15, 3.78, 0.39);
  for (const [side, eye] of [["l", leftEye], ["r", rightEye]] as const) {
    addPart(parts, `eye_white_${side}`, transform(sphere(0.075, 18, 12), {
      scale: vec3(1.25 * eyeScale, 0.9 * eyeScale, 0.32),
      translate: vec3(eye.x, eye.y, eye.z + 0.035),
    }), WHITE, "plastic", { color: WHITE, roughness: 0.18 });
    addPart(parts, `iris_${side}`, transform(sphere(0.032, 12, 8), {
      scale: vec3(1, 1, 0.18),
      translate: vec3(eye.x, eye.y, eye.z + 0.092),
    }), IRIS, "glossPaint", { color: IRIS });
  }

  const nose = marks.noseTip ?? vec3(0, 3.68, 0.43);
  addPart(parts, "nose_highlight", transform(sphere(0.035, 10, 8), {
    scale: vec3(0.7, 1.15, 0.35),
    translate: vec3(nose.x, nose.y, nose.z + 0.035),
  }), [0.92, 0.64, 0.5], "skin", { tone: [0.92, 0.64, 0.5] });

  const mouth = marks.mouth ?? vec3(0, 3.55, 0.38);
  addPart(parts, "mouth_mark", transform(box(0.18, 0.012, 0.012), {
    translate: vec3(mouth.x, mouth.y, mouth.z + 0.045),
  }), BLACK, "plastic", { color: BLACK, roughness: 0.35 });

  const headTop = marks.headTop ?? vec3(0, 4.22, 0.02);
  const hairCenter = vec3(0, headTop.y - 0.27, 0.02);
  addPart(parts, "hair_shell", transform(sphere(0.42, 28, 16), {
    scale: vec3(1.02 + p.headSize * 0.08, 0.62 + p.headSize * 0.08, 0.82),
    translate: hairCenter,
  }), HAIR, "fur", { tint: HAIR });
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.09;
    addPart(parts, `front_hair_lock_${i}`, transform(sphere(0.12, 12, 8), {
      scale: vec3(0.55, 1.15, 0.34),
      rotate: vec3(0.2 + i * 0.04, 0, (i - 2) * -0.18),
      translate: vec3(x, headTop.y - 0.5 - Math.abs(i - 2) * 0.03, 0.34),
    }), HAIR, "fur", { tint: HAIR });
  }

  for (const side of [-1, 1] as const) {
    addPart(parts, `shoulder_pad_${side}`, transform(sphere(0.18, 16, 10), {
      scale: vec3(1.35, 0.55, 0.85),
      rotate: vec3(0, 0, side * 0.24),
      translate: vec3(side * (0.56 + p.shoulderWidth * 0.08), 2.86 + p.height * 0.08, 0.02),
    }), ACCENT, "plastic", { color: ACCENT, roughness: 0.28 });
  }

  return parts;
}
