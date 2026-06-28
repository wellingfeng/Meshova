import { vec2 } from "../math/vec2.js";
import {
  add as addVec3,
  cross,
  dot,
  length,
  normalize,
  scale as scaleVec3,
  sub as subVec3,
  vec3,
  type Vec3,
} from "../math/vec3.js";
import {
  bounds,
  cone,
  makeMesh,
  recomputeNormals,
  segmentedTube,
  sphere,
  transform,
  type Mesh,
  type NamedPart,
  triangleCount,
} from "../geometry/index.js";

type RGB = [number, number, number];

export interface QuadrupedBuildParams {
  scale: number;
  bodyLength: number;
  bodyWidth: number;
  legLength: number;
  neckArch: number;
  maneLength: number;
  tailLength: number;
  stride: number;
}

export interface QuadrupedPreset {
  id: string;
  label: string;
  defaultParams: QuadrupedBuildParams;
  bodyProfile: "horse" | "dog";
  earKind: "upright" | "floppy";
  footKind: "hoof" | "paw";
  tailKind: "horseHair" | "raisedCoat";
  coat: RGB;
  coatHighlight: RGB;
  hair: RGB;
  hoof: RGB;
  eye: RGB;
  nose?: RGB;
  tongue?: RGB;
  coatSurface: "shortCoat" | "blackCoat";
  hasMane: boolean;
  hasMouth?: boolean;
}

export const HORSE_QUADRUPED_DEFAULTS: QuadrupedBuildParams = {
  scale: 1,
  bodyLength: 3.75,
  bodyWidth: 0.94,
  legLength: 1.32,
  neckArch: 1,
  maneLength: 0.46,
  tailLength: 1.05,
  stride: 0.1,
};

export const HORSE_QUADRUPED_PRESET: QuadrupedPreset = {
  id: "horse",
  label: "Horse",
  defaultParams: HORSE_QUADRUPED_DEFAULTS,
  bodyProfile: "horse",
  earKind: "upright",
  footKind: "hoof",
  tailKind: "horseHair",
  coat: [0.006, 0.007, 0.01],
  coatHighlight: [0.018, 0.022, 0.034],
  hair: [0.002, 0.002, 0.004],
  hoof: [0.035, 0.032, 0.03],
  eye: [0.045, 0.025, 0.012],
  coatSurface: "blackCoat",
  hasMane: true,
};

export const REFERENCE_DOG_DEFAULTS: QuadrupedBuildParams = {
  scale: 1,
  bodyLength: 2.95,
  bodyWidth: 0.68,
  legLength: 0.86,
  neckArch: 0.72,
  maneLength: 0,
  tailLength: 0.82,
  stride: 0.06,
};

export const REFERENCE_DOG_PRESET: QuadrupedPreset = {
  id: "reference-dog",
  label: "Reference Dog",
  defaultParams: REFERENCE_DOG_DEFAULTS,
  bodyProfile: "dog",
  earKind: "floppy",
  footKind: "paw",
  tailKind: "raisedCoat",
  coat: [0.58, 0.45, 0.25],
  coatHighlight: [0.74, 0.6, 0.34],
  hair: [0.48, 0.35, 0.19],
  hoof: [0.12, 0.075, 0.045],
  eye: [0.025, 0.015, 0.008],
  nose: [0.018, 0.014, 0.012],
  tongue: [0.72, 0.28, 0.34],
  coatSurface: "shortCoat",
  hasMane: false,
  hasMouth: true,
};

interface SkinSection {
  center: Vec3;
  rx: number;
  ry: number;
  topPinch?: number;
  bellySwell?: number;
}

function addPart(
  parts: NamedPart[],
  name: string,
  mesh: Mesh,
  color: RGB,
  surfaceType?: string,
  params?: Record<string, unknown>,
) {
  const part: NamedPart = { name, mesh, color };
  if (surfaceType) part.surface = params ? { type: surfaceType, params } : { type: surfaceType };
  parts.push(part);
}

function average(points: ReadonlyArray<Vec3>): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
    z += p.z;
  }
  const inv = points.length > 0 ? 1 / points.length : 0;
  return vec3(x * inv, y * inv, z * inv);
}

function tangentAt(sections: ReadonlyArray<SkinSection>, i: number): Vec3 {
  const prev = sections[Math.max(0, i - 1)]!.center;
  const next = sections[Math.min(sections.length - 1, i + 1)]!.center;
  const t = normalize(subVec3(next, prev));
  return length(t) > 0 ? t : vec3(0, 0, 1);
}

function interpolateSection(a: SkinSection, b: SkinSection, t: number): SkinSection {
  return {
    center: lerpVec3(a.center, b.center, t),
    rx: a.rx + (b.rx - a.rx) * t,
    ry: a.ry + (b.ry - a.ry) * t,
    topPinch: (a.topPinch ?? 0.08) + ((b.topPinch ?? 0.08) - (a.topPinch ?? 0.08)) * t,
    bellySwell: (a.bellySwell ?? 0.08) + ((b.bellySwell ?? 0.08) - (a.bellySwell ?? 0.08)) * t,
  };
}

function densifySections(sections: ReadonlyArray<SkinSection>, stepsPerSpan = 2): SkinSection[] {
  const out: SkinSection[] = [];
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i]!;
    const b = sections[i + 1]!;
    out.push(a);
    for (let step = 1; step < stepsPerSpan; step++) {
      out.push(interpolateSection(a, b, step / stepsPerSpan));
    }
  }
  out.push(sections[sections.length - 1]!);
  return out;
}

function orientedSkin(sections: ReadonlyArray<SkinSection>, sides = 28): Mesh {
  if (sections.length < 2) {
    return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  }
  const denseSections = densifySections(sections, 3);
  const sideRef = vec3(1, 0, 0);
  const upRef = vec3(0, 1, 0);
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];

  for (let i = 0; i < denseSections.length; i++) {
    const section = denseSections[i]!;
    const tangent = tangentAt(denseSections, i);
    let up = normalize(cross(tangent, sideRef));
    if (length(up) < 1e-5) up = upRef;
    if (dot(up, upRef) < 0) up = scaleVec3(up, -1);
    let side = normalize(cross(up, tangent));
    if (dot(side, sideRef) < 0) side = scaleVec3(side, -1);

    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const topPinch = section.topPinch ?? 0.08;
      const bellySwell = section.bellySwell ?? 0.08;
      const flankScale = s > 0 ? 1 - s * topPinch : 1 + -s * bellySwell;
      const p = addVec3(
        addVec3(section.center, scaleVec3(side, c * section.rx * flankScale)),
        scaleVec3(up, s * section.ry),
      );
      positions.push(p);
      normals.push(normalize(addVec3(scaleVec3(side, c), scaleVec3(up, s))));
      uvs.push(vec2(j / sides, i / (denseSections.length - 1)));
    }
  }

  const stride = sides + 1;
  for (let i = 0; i < denseSections.length - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const addCap = (ringStart: number, flip: boolean) => {
    const center = average(positions.slice(ringStart, ringStart + sides));
    const ci = positions.length;
    positions.push(center);
    normals.push(vec3(0, flip ? 1 : -1, 0));
    uvs.push(vec2(0.5, 0.5));
    for (let j = 0; j < sides; j++) {
      const a = ringStart + j;
      const b = ringStart + j + 1;
      if (flip) indices.push(ci, b, a);
      else indices.push(ci, a, b);
    }
  };
  addCap(0, false);
  addCap((denseSections.length - 1) * stride, true);

  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function skinBoundsScore(mesh: Mesh, bins = 32): { coverage: number; smoothness: number } {
  const b = bounds(mesh);
  const dz = Math.max(1e-6, b.max.z - b.min.z);
  const dy = Math.max(1e-6, b.max.y - b.min.y);
  const top = new Array<number>(bins).fill(-Infinity);
  for (const p of mesh.positions) {
    const i = Math.max(0, Math.min(bins - 1, Math.floor(((p.z - b.min.z) / dz) * bins)));
    top[i] = Math.max(top[i]!, p.y);
  }
  const filled = top.map((v) => Number.isFinite(v));
  const coverage = filled.filter(Boolean).length / bins;
  const values = top.filter((v) => Number.isFinite(v));
  if (values.length < 4) return { coverage, smoothness: 0 };
  let rough = 0;
  for (let i = 1; i < values.length - 1; i++) {
    rough += Math.abs(values[i - 1]! - 2 * values[i]! + values[i + 1]!);
  }
  rough /= (values.length - 2) * dy;
  return { coverage, smoothness: clamp01(1 - rough * 7) };
}

function buildHoof(center: Vec3, width: number, height: number, depth: number): Mesh {
  const toe = -depth * 0.62;
  const heel = depth * 0.42;
  const x0 = -width * 0.55;
  const x1 = width * 0.55;
  const xt0 = -width * 0.42;
  const xt1 = width * 0.42;
  const y0 = center.y;
  const y1 = center.y + height;
  const zToe = center.z + toe;
  const zHeel = center.z + heel;
  const positions = [
    vec3(center.x + x0, y0, zToe),
    vec3(center.x + x1, y0, zToe),
    vec3(center.x + x1, y0, zHeel),
    vec3(center.x + x0, y0, zHeel),
    vec3(center.x + xt0, y1 * 0.98 + y0 * 0.02, zToe + depth * 0.08),
    vec3(center.x + xt1, y1 * 0.98 + y0 * 0.02, zToe + depth * 0.08),
    vec3(center.x + xt1, y1 * 0.78 + y0 * 0.22, zHeel),
    vec3(center.x + xt0, y1 * 0.78 + y0 * 0.22, zHeel),
  ];
  const normals = positions.map(() => vec3(0, 1, 0));
  const uvs = positions.map((_, i) => vec2(i & 1, i > 3 ? 1 : 0));
  const indices: number[] = [];
  const quad = (a: number, b: number, c: number, d: number) => indices.push(a, b, c, a, c, d);
  quad(0, 1, 2, 3);
  quad(4, 7, 6, 5);
  quad(0, 4, 5, 1);
  quad(1, 5, 6, 2);
  quad(2, 6, 7, 3);
  quad(3, 7, 4, 0);
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function buildBodySkin(preset: QuadrupedPreset, params: QuadrupedBuildParams): Mesh {
  if (preset.bodyProfile === "dog") return buildDogBodySkin(params);

  const s = params.scale;
  const half = params.bodyLength * s * 0.5;
  const width = params.bodyWidth * s;
  const leg = params.legLength * s;
  const bodyY = leg + 0.58 * s;
  const arch = params.neckArch;
  const sections: SkinSection[] = [
    { center: vec3(0, bodyY + 0.88 * s, -half - 0.78 * s), rx: 0.08 * s, ry: 0.1 * s, topPinch: 0.02 },
    { center: vec3(0, bodyY + 0.93 * s, -half - 0.58 * s), rx: 0.13 * s, ry: 0.17 * s, topPinch: 0.03 },
    { center: vec3(0, bodyY + 1.03 * s, -half - 0.34 * s), rx: 0.2 * s, ry: 0.28 * s, topPinch: 0.05 },
    { center: vec3(0, bodyY + 1.0 * s, -half - 0.06 * s), rx: 0.23 * s, ry: 0.3 * s, topPinch: 0.06 },
    { center: vec3(0, bodyY + (0.82 + 0.12 * arch) * s, -half + 0.25 * s), rx: 0.27 * s, ry: 0.34 * s },
    { center: vec3(0, bodyY + (0.68 + 0.14 * arch) * s, -half + 0.58 * s), rx: 0.31 * s, ry: 0.42 * s },
    { center: vec3(0, bodyY + 0.42 * s, -half + 0.9 * s), rx: width * 0.42, ry: 0.55 * s, topPinch: 0.16 },
    { center: vec3(0, bodyY + 0.18 * s, -half + 1.18 * s), rx: width * 0.52, ry: 0.68 * s, topPinch: 0.16, bellySwell: 0.16 },
    { center: vec3(0, bodyY + 0.02 * s, -half + 1.66 * s), rx: width * 0.56, ry: 0.72 * s, topPinch: 0.12, bellySwell: 0.18 },
    { center: vec3(0, bodyY - 0.02 * s, -half + 2.24 * s), rx: width * 0.55, ry: 0.69 * s, topPinch: 0.1, bellySwell: 0.16 },
    { center: vec3(0, bodyY + 0.02 * s, -half + 2.82 * s), rx: width * 0.5, ry: 0.64 * s, topPinch: 0.1, bellySwell: 0.12 },
    { center: vec3(0, bodyY + 0.08 * s, -half + 3.32 * s), rx: width * 0.42, ry: 0.56 * s, topPinch: 0.12 },
    { center: vec3(0, bodyY + 0.02 * s, half - 0.1 * s), rx: width * 0.3, ry: 0.36 * s, topPinch: 0.12 },
  ];
  if (!preset.hasMane) {
    sections[4] = { ...sections[4]!, ry: sections[4]!.ry * 0.92 };
  }
  return orientedSkin(sections, 34);
}

function buildDogBodySkin(params: QuadrupedBuildParams): Mesh {
  const s = params.scale;
  const half = params.bodyLength * s * 0.5;
  const width = params.bodyWidth * s;
  const leg = params.legLength * s;
  const bodyY = leg + 0.58 * s;
  const arch = params.neckArch;
  const sections: SkinSection[] = [
    { center: vec3(0, bodyY + 0.5 * s, -half - 0.82 * s), rx: 0.052 * s, ry: 0.05 * s, topPinch: 0.02 },
    { center: vec3(0, bodyY + 0.52 * s, -half - 0.64 * s), rx: 0.105 * s, ry: 0.085 * s, topPinch: 0.04 },
    { center: vec3(0, bodyY + 0.59 * s, -half - 0.45 * s), rx: 0.17 * s, ry: 0.15 * s, topPinch: 0.06 },
    { center: vec3(0, bodyY + 0.64 * s, -half - 0.22 * s), rx: 0.24 * s, ry: 0.22 * s, topPinch: 0.08 },
    { center: vec3(0, bodyY + (0.35 + arch * 0.1) * s, -half + 0.12 * s), rx: 0.24 * s, ry: 0.23 * s, topPinch: 0.08 },
    { center: vec3(0, bodyY + 0.12 * s, -half + 0.43 * s), rx: width * 0.45, ry: 0.48 * s, topPinch: 0.12, bellySwell: 0.18 },
    { center: vec3(0, bodyY - 0.02 * s, -half + 0.85 * s), rx: width * 0.55, ry: 0.54 * s, topPinch: 0.11, bellySwell: 0.2 },
    { center: vec3(0, bodyY - 0.04 * s, -half + 1.3 * s), rx: width * 0.55, ry: 0.48 * s, topPinch: 0.1, bellySwell: 0.12 },
    { center: vec3(0, bodyY + 0.0 * s, -half + 1.78 * s), rx: width * 0.49, ry: 0.4 * s, topPinch: 0.1, bellySwell: 0.06 },
    { center: vec3(0, bodyY + 0.08 * s, -half + 2.22 * s), rx: width * 0.4, ry: 0.34 * s, topPinch: 0.11 },
    { center: vec3(0, bodyY + 0.12 * s, half - 0.16 * s), rx: width * 0.28, ry: 0.24 * s, topPinch: 0.12 },
    { center: vec3(0, bodyY + 0.16 * s, half + 0.04 * s), rx: width * 0.16, ry: 0.14 * s, topPinch: 0.1 },
    { center: vec3(0, bodyY + 0.17 * s, half + 0.18 * s), rx: width * 0.08, ry: 0.07 * s, topPinch: 0.05 },
  ];
  return orientedSkin(sections, 34);
}

function legSections(
  preset: QuadrupedPreset,
  side: -1 | 1,
  front: boolean,
  params: QuadrupedBuildParams,
): { skin: Mesh; foot: Mesh } {
  if (preset.footKind === "paw") return dogLegSections(side, front, params);

  const s = params.scale;
  const half = params.bodyLength * s * 0.5;
  const width = params.bodyWidth * s;
  const leg = params.legLength * s;
  const bodyY = leg + 0.58 * s;
  const x = side * width * (front ? 0.33 : 0.36);
  const anchorZ = front ? -half + 1.18 * s : half - 0.72 * s;
  const footStride = params.stride * s * (side < 0 ? 1 : -0.85);
  const footZ = anchorZ + (front ? -0.1 * s - footStride : 0.18 * s + footStride);
  const topY = bodyY - (front ? 0.28 : 0.2) * s;
  const kneeY = leg * (front ? 0.58 : 0.62);
  const fetlockY = leg * 0.22;
  const centers = front
    ? [
        vec3(x, topY, anchorZ),
        vec3(x * 0.98, leg * 0.9, anchorZ - 0.02 * s),
        vec3(x * 0.94, kneeY, footZ + 0.08 * s),
        vec3(x * 0.9, fetlockY, footZ),
        vec3(x * 0.9, 0.13 * s, footZ - 0.03 * s),
      ]
    : [
        vec3(x, topY, anchorZ),
        vec3(x * 0.98, leg * 0.92, anchorZ + 0.18 * s),
        vec3(x * 0.94, kneeY, anchorZ + 0.04 * s),
        vec3(x * 0.9, fetlockY, footZ + 0.02 * s),
        vec3(x * 0.9, 0.13 * s, footZ - 0.01 * s),
      ];
  return {
    skin: segmentedTube(centers, {
      radius: (front ? 0.095 : 0.105) * s,
      sides: 16,
      radiusAt: (t) => {
        if (t < 0.28) return 1 - t * 0.45;
        if (t < 0.7) return 0.78 - (t - 0.28) * 0.55;
        return 0.52 - (t - 0.7) * 0.16;
      },
      caps: true,
    }),
    foot: buildHoof(vec3(x * 0.9, 0, footZ - 0.02 * s), 0.17 * s, 0.085 * s, 0.25 * s),
  };
}

function buildPaw(center: Vec3, side: -1 | 1, s: number): Mesh {
  const pad = transform(sphere(1, 16, 8), {
    scale: vec3(0.14 * s, 0.055 * s, 0.2 * s),
    translate: vec3(center.x, center.y + 0.055 * s, center.z),
  });
  const toes: Mesh[] = [];
  for (const offset of [-0.055, 0, 0.055]) {
    toes.push(transform(sphere(1, 10, 6), {
      scale: vec3(0.046 * s, 0.035 * s, 0.07 * s),
      translate: vec3(center.x + side * offset * s, center.y + 0.09 * s, center.z - 0.11 * s),
    }));
  }
  return mergeMeshes([pad, ...toes]);
}

function dogLegSections(
  side: -1 | 1,
  front: boolean,
  params: QuadrupedBuildParams,
): { skin: Mesh; foot: Mesh } {
  const s = params.scale;
  const half = params.bodyLength * s * 0.5;
  const width = params.bodyWidth * s;
  const leg = params.legLength * s;
  const bodyY = leg + 0.58 * s;
  const x = side * width * (front ? 0.42 : 0.38);
  const anchorZ = front ? -half + 0.78 * s : half - 0.58 * s;
  const footStride = params.stride * s * (side < 0 ? 1 : -0.7);
  const footZ = anchorZ + (front ? -0.04 * s - footStride : 0.13 * s + footStride);
  const topY = bodyY - (front ? 0.23 : 0.18) * s;
  const centers = front
    ? [
        vec3(x, topY, anchorZ),
        vec3(x * 0.98, leg * 0.82, anchorZ + 0.02 * s),
        vec3(x * 0.94, leg * 0.48, footZ + 0.04 * s),
        vec3(x * 0.88, 0.15 * s, footZ),
      ]
    : [
        vec3(x, topY, anchorZ),
        vec3(x * 0.98, leg * 0.86, anchorZ + 0.2 * s),
        vec3(x * 0.94, leg * 0.56, anchorZ + 0.08 * s),
        vec3(x * 0.88, leg * 0.26, footZ + 0.06 * s),
        vec3(x * 0.86, 0.15 * s, footZ),
      ];
  return {
    skin: segmentedTube(centers, {
      radius: (front ? 0.078 : 0.088) * s,
      sides: 16,
      radiusAt: (t) => {
        if (t < 0.24) return 1 - t * 0.24;
        if (t < 0.62) return 0.92 - (t - 0.24) * 0.58;
        return 0.66 - (t - 0.62) * 0.34;
      },
      caps: true,
    }),
    foot: buildPaw(vec3(x * 0.86, 0, footZ - 0.03 * s), side, s),
  };
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return addVec3(a, scaleVec3(subVec3(b, a), t));
}

function samplePolyline(points: ReadonlyArray<Vec3>, t: number): Vec3 {
  const f = Math.max(0, Math.min(1, t)) * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(f));
  return lerpVec3(points[i]!, points[i + 1]!, f - i);
}

function buildMane(crest: Vec3[], length: number, s: number): Mesh {
  const meshes: Mesh[] = [
    segmentedTube(crest, { radius: 0.045 * s, sides: 7, radiusAt: (t) => 1 - t * 0.15, caps: true }),
  ];
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const start = samplePolyline(crest, t);
    const drop = length * (0.58 + ((i * 11) % 7) * 0.045);
    const strand = [
      start,
      vec3(-0.035 * s, start.y - drop * 0.42, start.z + 0.02 * s),
      vec3(-0.07 * s, start.y - drop, start.z + 0.04 * s),
    ];
    meshes.push(segmentedTube(strand, { radius: 0.016 * s, sides: 5, radiusAt: (u) => 1 - u * 0.72, caps: true }));
  }
  return mergeMeshes(meshes);
}

function buildTail(base: Vec3, tailLength: number, s: number): Mesh {
  const tail = [
    base,
    vec3(0.02 * s, base.y + 0.04 * s, base.z + 0.16 * s),
    vec3(0.04 * s, base.y - 0.44 * s, base.z + tailLength * 0.52 * s),
    vec3(0.02 * s, 0.24 * s, base.z + tailLength * 0.78 * s),
  ];
  const meshes: Mesh[] = [
    segmentedTube(tail, { radius: 0.075 * s, sides: 11, radiusAt: (t) => 1 - t * 0.52, caps: true }),
  ];
  for (let i = 0; i < 7; i++) {
    const off = (i - 3) * 0.025 * s;
    const strand = tail.map((p, idx) => vec3(p.x + off, p.y - idx * 0.02 * s, p.z + Math.abs(off) * 0.7));
    meshes.push(segmentedTube(strand, { radius: 0.018 * s, sides: 5, radiusAt: (t) => 1 - t * 0.72, caps: true }));
  }
  return mergeMeshes(meshes);
}

function buildDogTail(base: Vec3, tailLength: number, s: number): Mesh {
  const tail = [
    base,
    vec3(0.0, base.y + 0.08 * s, base.z + tailLength * 0.22 * s),
    vec3(0.02 * s, base.y + 0.2 * s, base.z + tailLength * 0.52 * s),
    vec3(0.04 * s, base.y + 0.18 * s, base.z + tailLength * 0.82 * s),
  ];
  return segmentedTube(tail, {
    radius: 0.075 * s,
    sides: 14,
    radiusAt: (t) => 1 - t * 0.72,
    caps: true,
  });
}

function buildFloppyEar(side: -1 | 1, params: QuadrupedBuildParams): Mesh {
  const s = params.scale;
  const half = params.bodyLength * s * 0.5;
  const bodyY = params.legLength * s + 0.58 * s;
  const root = vec3(side * 0.2 * s, bodyY + 0.72 * s, -half - 0.2 * s);
  return orientedSkin([
    { center: root, rx: 0.035 * s, ry: 0.08 * s, topPinch: 0.02 },
    { center: vec3(side * 0.24 * s, bodyY + 0.56 * s, -half - 0.18 * s), rx: 0.06 * s, ry: 0.12 * s, topPinch: 0.04 },
    { center: vec3(side * 0.25 * s, bodyY + 0.36 * s, -half - 0.14 * s), rx: 0.052 * s, ry: 0.12 * s, topPinch: 0.04 },
    { center: vec3(side * 0.22 * s, bodyY + 0.2 * s, -half - 0.1 * s), rx: 0.02 * s, ry: 0.045 * s, topPinch: 0.02 },
  ], 12);
}

function buildDogMouthParts(params: QuadrupedBuildParams, nose: RGB, tongue: RGB): NamedPart[] {
  const s = params.scale;
  const half = params.bodyLength * s * 0.5;
  const bodyY = params.legLength * s + 0.58 * s;
  const parts: NamedPart[] = [];
  addPart(parts, "nose", transform(sphere(1, 16, 8), {
    scale: vec3(0.075 * s, 0.055 * s, 0.055 * s),
    translate: vec3(0, bodyY + 0.57 * s, -half - 0.82 * s),
  }), nose, "rubber", { color: nose, roughness: 0.38 });
  for (const side of [-1, 1] as const) {
    const mouth = [
      vec3(side * 0.035 * s, bodyY + 0.49 * s, -half - 0.72 * s),
      vec3(side * 0.08 * s, bodyY + 0.48 * s, -half - 0.58 * s),
      vec3(side * 0.11 * s, bodyY + 0.52 * s, -half - 0.45 * s),
    ];
    addPart(parts, `mouth_${side}`, segmentedTube(mouth, {
      radius: 0.014 * s,
      sides: 6,
      radiusAt: (t) => 1 - t * 0.25,
      caps: true,
    }), nose, "rubber", { color: nose, roughness: 0.45 });
  }
  addPart(parts, "tongue", transform(sphere(1, 12, 6), {
    scale: vec3(0.055 * s, 0.026 * s, 0.13 * s),
    rotate: vec3(0.18, 0, 0),
    translate: vec3(0, bodyY + 0.475 * s, -half - 0.58 * s),
  }), tongue, "plastic", { color: tongue, roughness: 0.58 });
  return parts;
}

function mergeMeshes(meshes: ReadonlyArray<Mesh>): Mesh {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];
  let offset = 0;
  for (const mesh of meshes) {
    positions.push(...mesh.positions);
    normals.push(...mesh.normals);
    uvs.push(...mesh.uvs);
    for (const idx of mesh.indices) indices.push(idx + offset);
    offset += mesh.positions.length;
  }
  return makeMesh({ positions, normals, uvs, indices });
}

export function buildQuadrupedParts(
  presetOrParams: QuadrupedPreset | Partial<QuadrupedBuildParams> = HORSE_QUADRUPED_PRESET,
  params: Partial<QuadrupedBuildParams> = {},
): NamedPart[] {
  const preset = "defaultParams" in presetOrParams ? presetOrParams : HORSE_QUADRUPED_PRESET;
  const overrides = "defaultParams" in presetOrParams ? params : presetOrParams;
  const p = { ...preset.defaultParams, ...overrides };
  const s = p.scale;
  const half = p.bodyLength * s * 0.5;
  const leg = p.legLength * s;
  const bodyY = leg + 0.58 * s;
  const parts: NamedPart[] = [];
  const coatSurface = {
    tint: preset.coat,
    seed: 31,
    roughness: 0.42,
    variation: 0.05,
    normalStrength: 0.18,
    clearcoat: preset.coatSurface === "blackCoat" ? 0.24 : 0.08,
  };

  addPart(parts, "body_skin", buildBodySkin(preset, p), preset.coatHighlight, preset.coatSurface, coatSurface);

  for (const side of [-1, 1] as const) {
    const frontLeg = legSections(preset, side, true, p);
    addPart(parts, `front_leg_${side}`, frontLeg.skin, preset.coat, preset.coatSurface, coatSurface);
    addPart(
      parts,
      `front_${preset.footKind}_${side}`,
      frontLeg.foot,
      preset.footKind === "hoof" ? preset.hoof : preset.coat,
      preset.footKind === "hoof" ? "rubber" : preset.coatSurface,
      preset.footKind === "hoof" ? { color: preset.hoof, roughness: 0.52 } : coatSurface,
    );

    const rearLeg = legSections(preset, side, false, p);
    addPart(parts, `rear_leg_${side}`, rearLeg.skin, preset.coat, preset.coatSurface, coatSurface);
    addPart(
      parts,
      `rear_${preset.footKind}_${side}`,
      rearLeg.foot,
      preset.footKind === "hoof" ? preset.hoof : preset.coat,
      preset.footKind === "hoof" ? "rubber" : preset.coatSurface,
      preset.footKind === "hoof" ? { color: preset.hoof, roughness: 0.52 } : coatSurface,
    );
  }

  for (const side of [-1, 1] as const) {
    const eyeY = preset.bodyProfile === "dog" ? bodyY + 0.63 * s : bodyY + 1.04 * s;
    const eyeZ = preset.bodyProfile === "dog" ? -half - 0.36 * s : -half - 0.3 * s;
    const eyeX = preset.bodyProfile === "dog" ? side * 0.15 * s : side * 0.16 * s;
    addPart(parts, `eye_${side}`, transform(sphere(0.045 * s, 10, 8), {
      translate: vec3(eyeX, eyeY, eyeZ),
    }), preset.eye, "gem", { tint: preset.eye, ior: 1.5, dispersion: 0.7 });
    const ear = preset.earKind === "floppy"
      ? buildFloppyEar(side, p)
      : transform(cone(0.065 * s, 0.3 * s, 8, false), {
          rotate: vec3(-0.12, 0, side * 0.16),
          translate: vec3(side * 0.13 * s, bodyY + 1.34 * s, -half - 0.03 * s),
        });
    addPart(parts, `ear_${side}`, ear, preset.coat, preset.coatSurface, coatSurface);
  }

  if (preset.hasMouth) {
    parts.push(...buildDogMouthParts(p, preset.nose ?? [0.02, 0.015, 0.012], preset.tongue ?? [0.7, 0.25, 0.32]));
  }

  if (preset.hasMane) {
    const crest = [
      vec3(0, bodyY + 0.58 * s, -half + 0.82 * s),
      vec3(0, bodyY + 0.86 * s, -half + 0.42 * s),
      vec3(0, bodyY + 1.18 * s, -half - 0.06 * s),
      vec3(0, bodyY + 1.23 * s, -half - 0.34 * s),
    ];
    addPart(parts, "mane", buildMane(crest, p.maneLength * s, s), preset.hair, "hair", { color: preset.hair, variation: 0.18 });
  }

  const tailBase = preset.bodyProfile === "dog"
    ? vec3(0, bodyY + 0.18 * s, half + 0.14 * s)
    : vec3(0, bodyY + 0.08 * s, half - 0.1 * s);
  if (preset.tailKind === "horseHair") {
    addPart(parts, "tail", buildTail(tailBase, p.tailLength, s), preset.hair, "hair", { color: preset.hair, variation: 0.22 });
  } else {
    addPart(parts, "tail", buildDogTail(tailBase, p.tailLength, s), preset.coat, preset.coatSurface, coatSurface);
  }

  return parts;
}

export interface QuadrupedAnatomyScore {
  score: number;
  metrics: {
    requiredParts: number;
    continuousSkin: number;
    sideSilhouette: number;
    limbLayout: number;
    groundContact: number;
    materialMatch: number;
    detail: number;
  };
  feedback: string;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function rangeScore(v: number, min: number, max: number): number {
  if (v >= min && v <= max) return 1;
  const span = Math.max(1e-6, max - min);
  return v < min ? clamp01(1 - (min - v) / span) : clamp01(1 - (v - max) / span);
}

function combinedBounds(parts: ReadonlyArray<NamedPart>): { min: Vec3; max: Vec3 } {
  if (parts.length === 0) return { min: vec3(0, 0, 0), max: vec3(0, 0, 0) };
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const part of parts) {
    const b = bounds(part.mesh);
    minX = Math.min(minX, b.min.x);
    minY = Math.min(minY, b.min.y);
    minZ = Math.min(minZ, b.min.z);
    maxX = Math.max(maxX, b.max.x);
    maxY = Math.max(maxY, b.max.y);
    maxZ = Math.max(maxZ, b.max.z);
  }
  return { min: vec3(minX, minY, minZ), max: vec3(maxX, maxY, maxZ) };
}

function dim(b: { min: Vec3; max: Vec3 }): { x: number; y: number; z: number } {
  return {
    x: Math.max(1e-6, b.max.x - b.min.x),
    y: Math.max(1e-6, b.max.y - b.min.y),
    z: Math.max(1e-6, b.max.z - b.min.z),
  };
}

function meanZ(parts: ReadonlyArray<NamedPart>): number {
  if (parts.length === 0) return 0;
  let total = 0;
  for (const part of parts) {
    const b = bounds(part.mesh);
    total += (b.min.z + b.max.z) * 0.5;
  }
  return total / parts.length;
}

export function scoreQuadrupedAnatomy(
  parts: NamedPart[],
  preset: QuadrupedPreset = HORSE_QUADRUPED_PRESET,
): QuadrupedAnatomyScore {
  const byName = new Map(parts.map((part) => [part.name, part]));
  const foot = preset.footKind;
  const required = [
    "body_skin",
    "front_leg_-1", "front_leg_1", "rear_leg_-1", "rear_leg_1",
    `front_${foot}_-1`, `front_${foot}_1`, `rear_${foot}_-1`, `rear_${foot}_1`,
    "tail",
  ];
  if (preset.hasMane) required.push("mane");
  if (preset.hasMouth) required.push("nose", "tongue");
  const requiredParts = required.filter((name) => byName.has(name)).length / required.length;

  const bodySkin = byName.get("body_skin");
  const allB = combinedBounds(parts);
  const allD = dim(allB);
  const bodyB = bodySkin ? bounds(bodySkin.mesh) : combinedBounds([]);
  const bodyD = dim(bodyB);
  const bodyRatio = bodyD.z / bodyD.y;
  const bodyAboveGround = (bodyB.min.y - allB.min.y) / allD.y;
  const skinProjection = bodySkin ? skinBoundsScore(bodySkin.mesh) : { coverage: 0, smoothness: 0 };
  const continuousSkin = bodySkin
    ? (
        rangeScore(bodyRatio, 1.85, 3.35) * 0.3 +
        rangeScore(bodyAboveGround, 0.28, 0.58) * 0.25 +
        skinProjection.coverage * 0.25 +
        skinProjection.smoothness * 0.2
      )
    : 0;

  const frontLegs = parts.filter((part) => /^front_leg_/.test(part.name));
  const rearLegs = parts.filter((part) => /^rear_leg_/.test(part.name));
  const feet = parts.filter((part) => new RegExp(`_${foot}_`).test(part.name));
  const frontZ = meanZ(frontLegs);
  const rearZ = meanZ(rearLegs);
  const sideSeparation = (() => {
    const xs = [...frontLegs, ...rearLegs].map((part) => {
      const b = bounds(part.mesh);
      return (b.min.x + b.max.x) * 0.5;
    });
    const left = xs.filter((x) => x < 0).length;
    const right = xs.filter((x) => x > 0).length;
    return Math.min(left, right) / 2;
  })();
  const legHeight = dim(combinedBounds([...frontLegs, ...rearLegs])).y;
  const limbLayout = (
    clamp01(frontLegs.length / 2) * 0.22 +
    clamp01(rearLegs.length / 2) * 0.22 +
    clamp01(feet.length / 4) * 0.18 +
    (frontZ < rearZ ? 0.18 : 0) +
    clamp01(sideSeparation) * 0.1 +
    rangeScore(legHeight / bodyD.y, 0.7, 1.5) * 0.1
  );

  const lowFeet = feet.filter((part) => bounds(part.mesh).min.y < allB.min.y + allD.y * 0.035).length;
  const footSpreadZ = dim(combinedBounds(feet)).z / allD.z;
  const groundContact = clamp01(lowFeet / 4) * 0.7 + rangeScore(footSpreadZ, 0.38, 0.72) * 0.3;

  const frontReach = bodySkin ? (frontZ - bodyB.min.z) / allD.z : 0;
  const rumpReach = bodySkin ? (bodyB.max.z - rearZ) / allD.z : 0;
  const neckRise = bodySkin
    ? (() => {
        const frontCut = bodyB.min.z + bodyD.z * 0.38;
        const midMin = bodyB.min.z + bodyD.z * 0.45;
        const midMax = bodyB.min.z + bodyD.z * 0.78;
        let frontTop = -Infinity;
        let midTop = -Infinity;
        for (const p of bodySkin.mesh.positions) {
          if (p.z < frontCut) frontTop = Math.max(frontTop, p.y);
          if (p.z >= midMin && p.z <= midMax) midTop = Math.max(midTop, p.y);
        }
        return Number.isFinite(frontTop) && Number.isFinite(midTop)
          ? rangeScore((frontTop - midTop) / allD.y, 0.04, 0.24)
          : 0;
      })()
    : 0;
  const sideSilhouette = (
    rangeScore(allD.z / allD.y, 1.65, 2.65) * 0.22 +
    rangeScore(frontReach, 0.16, 0.34) * 0.22 +
    rangeScore(rumpReach, 0.08, 0.26) * 0.14 +
    neckRise * 0.2 +
    skinProjection.coverage * 0.12 +
    skinProjection.smoothness * 0.1
  );

  const coatParts = parts.filter((part) =>
    part.name === "body_skin" ||
    /^front_leg_/.test(part.name) ||
    /^rear_leg_/.test(part.name) ||
    (preset.footKind === "paw" && new RegExp(`_${foot}_`).test(part.name)) ||
    /^ear_/.test(part.name),
  );
  const coatGood = coatParts.filter((part) =>
    part.surface?.type === preset.coatSurface || part.surface?.type === "shortCoat" || part.surface?.type === "blackCoat",
  ).length / Math.max(1, coatParts.length);
  const noPlush = coatParts.some((part) => part.surface?.type === "fur") ? 0 : 1;
  const hairGood =
    (preset.hasMane ? (byName.get("mane")?.surface?.type === "hair" ? 0.5 : 0) : 0.5) +
    (preset.tailKind === "horseHair"
      ? (byName.get("tail")?.surface?.type === "hair" ? 0.5 : 0)
      : (byName.get("tail")?.surface?.type === preset.coatSurface ? 0.5 : 0));
  const materialMatch = coatGood * 0.58 + hairGood * 0.27 + noPlush * 0.15;

  const tris = parts.reduce((sum, part) => sum + triangleCount(part.mesh), 0);
  const detail = clamp01(parts.length / 18) * 0.25 + clamp01(tris / 4200) * 0.75;

  const metrics = {
    requiredParts,
    continuousSkin,
    sideSilhouette,
    limbLayout,
    groundContact,
    materialMatch,
    detail,
  };
  const score = clamp01(
    metrics.requiredParts * 0.14 +
      metrics.continuousSkin * 0.22 +
      metrics.sideSilhouette * 0.24 +
      metrics.limbLayout * 0.16 +
      metrics.groundContact * 0.1 +
      metrics.materialMatch * 0.08 +
      metrics.detail * 0.06,
  );

  const tips: string[] = [];
  if (metrics.requiredParts < 1) tips.push(`missing quadruped skin, legs, ${foot}s, face details or tail`);
  if (metrics.continuousSkin < 0.78) tips.push("use one continuous body/neck/head skin with stable side projection");
  if (metrics.sideSilhouette < 0.78) tips.push("fix side silhouette: head reach, neck rise, body length, croup");
  if (metrics.limbLayout < 0.9) tips.push("fix four-limb layout and front/rear stance");
  if (metrics.groundContact < 0.88) tips.push(`put all four ${foot}s on ground with readable stance spread`);
  if (metrics.materialMatch < 0.9) tips.push("use shortCoat/blackCoat for skin, hair only for mane/tail, rubber for nose/hooves");
  if (metrics.detail < 0.72) tips.push("increase skin/limb resolution");
  const feedback = tips.length
    ? `Score ${score.toFixed(2)}. To improve: ${tips.join("; ")}.`
    : `Score ${score.toFixed(2)}. Quadruped anatomy gate passed.`;

  return { score, metrics, feedback };
}
