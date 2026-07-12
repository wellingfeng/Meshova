/**
 * Gradational crystal cluster inspired by HoudiniHowtos Live-0145.
 *
 * Clean-room Meshova implementation: closed faceted prisms, seeded clustering,
 * height/azimuth vertex-color gradients and the physical gem surface.
 */
import { clamp, lerp, TAU } from "../math/scalar.js";
import { vec2 } from "../math/vec2.js";
import { vec3 } from "../math/vec3.js";
import { makeRng } from "../random/index.js";
import {
  computeNormals,
  icosphere,
  makeMesh,
  merge,
  transform,
  type Mesh,
  type NamedPart,
  type PartSurfaceRef,
} from "../geometry/index.js";

type RGB = [number, number, number];

export interface GradationalCrystalParams {
  readonly sides: number;
  readonly count: number;
  readonly height: number;
  readonly radius: number;
  readonly tipRatio: number;
  readonly spread: number;
  /** Maximum satellite lean in radians. */
  readonly lean: number;
  /** Shaft twist in radians. */
  readonly twist: number;
  /** Palette rotation in degrees. */
  readonly hueShift: number;
  readonly roughness: number;
  readonly ior: number;
  readonly dispersion: number;
  readonly seed: number;
}

export interface CrystalMeshParams {
  readonly sides: number;
  readonly height: number;
  readonly radius: number;
  readonly tipRatio: number;
  readonly twist: number;
  readonly seed: number;
}

export const GRADATIONAL_CRYSTAL_DEFAULTS: GradationalCrystalParams = {
  sides: 6,
  count: 17,
  height: 3.8,
  radius: 0.58,
  tipRatio: 0.28,
  spread: 2.5,
  lean: 0.34,
  twist: 0.08,
  hueShift: 0,
  roughness: 0.035,
  ior: 2.4,
  dispersion: 4,
  seed: 145,
};

function resolveParams(params: Partial<GradationalCrystalParams>): GradationalCrystalParams {
  const p = { ...GRADATIONAL_CRYSTAL_DEFAULTS, ...params };
  return {
    sides: clamp(Math.round(p.sides), 3, 12),
    count: clamp(Math.round(p.count), 1, 64),
    height: Math.max(0.3, p.height),
    radius: Math.max(0.05, p.radius),
    tipRatio: clamp(p.tipRatio, 0.12, 0.62),
    spread: Math.max(0.1, p.spread),
    lean: clamp(p.lean, 0, 0.9),
    twist: clamp(p.twist, -Math.PI * 0.45, Math.PI * 0.45),
    hueShift: ((p.hueShift % 360) + 360) % 360,
    roughness: clamp(p.roughness, 0, 0.45),
    ior: clamp(p.ior, 1, 2.6),
    dispersion: clamp(p.dispersion, 0, 10),
    seed: Math.round(p.seed) >>> 0,
  };
}

function resolveMeshParams(params: Partial<CrystalMeshParams>): CrystalMeshParams {
  const p = { ...GRADATIONAL_CRYSTAL_DEFAULTS, ...params };
  return {
    sides: clamp(Math.round(p.sides), 3, 12),
    height: Math.max(0.3, p.height),
    radius: Math.max(0.05, p.radius),
    tipRatio: clamp(p.tipRatio, 0.12, 0.62),
    twist: clamp(p.twist, -Math.PI * 0.45, Math.PI * 0.45),
    seed: Math.round(p.seed) >>> 0,
  };
}

/** Build one closed, hard-faceted crystal aligned to +Y. */
export function buildGradationalCrystalMesh(params: Partial<CrystalMeshParams> = {}): Mesh {
  const p = resolveMeshParams(params);
  const rng = makeRng(p.seed);
  const sideScale = Array.from({ length: p.sides }, () => rng.range(0.91, 1.09));
  const phase = rng.range(0, TAU);
  const baseBevel = p.height * 0.055;
  const crownY = p.height * (1 - p.tipRatio);
  const ringDefs = [
    { y: 0, radius: 0.78, twist: 0 },
    { y: baseBevel, radius: 1, twist: p.twist * 0.08 },
    { y: crownY, radius: 0.9, twist: p.twist },
  ];
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices: number[] = [];

  for (let row = 0; row < ringDefs.length; row++) {
    const ring = ringDefs[row]!;
    for (let side = 0; side < p.sides; side++) {
      const angle = phase + side / p.sides * TAU + ring.twist;
      const radius = p.radius * ring.radius * sideScale[side]!;
      positions.push(vec3(Math.cos(angle) * radius, ring.y, Math.sin(angle) * radius));
      normals.push(vec3(0, 1, 0));
      uvs.push(vec2(side / p.sides, ring.y / p.height));
    }
  }

  const bottomCenter = positions.length;
  positions.push(vec3(0, 0, 0));
  normals.push(vec3(0, -1, 0));
  uvs.push(vec2(0.5, 0));

  const tip = positions.length;
  const tipOffset = p.radius * 0.07;
  positions.push(vec3(
    Math.cos(phase + 1.7) * tipOffset,
    p.height,
    Math.sin(phase + 1.7) * tipOffset,
  ));
  normals.push(vec3(0, 1, 0));
  uvs.push(vec2(0.5, 1));

  for (let side = 0; side < p.sides; side++) {
    const next = (side + 1) % p.sides;
    indices.push(bottomCenter, side, next);
  }

  for (let row = 0; row < ringDefs.length - 1; row++) {
    const lower = row * p.sides;
    const upper = (row + 1) * p.sides;
    for (let side = 0; side < p.sides; side++) {
      const next = (side + 1) % p.sides;
      const a = lower + side;
      const b = lower + next;
      const c = upper + next;
      const d = upper + side;
      indices.push(a, c, b, a, d, c);
    }
  }

  const crown = (ringDefs.length - 1) * p.sides;
  for (let side = 0; side < p.sides; side++) {
    const next = (side + 1) % p.sides;
    indices.push(crown + side, tip, crown + next);
  }

  return computeNormals(makeMesh({ positions, normals, uvs, indices }), 1);
}

function hslToRgb(hue: number, saturation: number, lightness: number): RGB {
  const h = ((hue % 360) + 360) % 360 / 360;
  if (saturation <= 0) return [lightness, lightness, lightness];
  const q = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const channel = (offset: number): number => {
    let t = h + offset;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [channel(1 / 3), channel(0), channel(-1 / 3)];
}

function crystalColors(mesh: Mesh, height: number, hueShift: number, seed: number): number[] {
  const colors: number[] = [];
  for (const pos of mesh.positions) {
    const t = clamp(pos.y / height, 0, 1);
    const angle = Math.atan2(pos.z, pos.x);
    const hue = lerp(208, 326, t) + hueShift + Math.sin(angle * 3 + seed * 0.17) * 9;
    const color = hslToRgb(hue, 0.84, lerp(0.42, 0.68, t));
    colors.push(color[0], color[1], color[2]);
  }
  return colors;
}

function gemSurface(p: GradationalCrystalParams, tint: RGB): PartSurfaceRef {
  return {
    type: "gem",
    params: {
      tint,
      roughness: p.roughness,
      transmission: 1,
      thickness: Math.max(0.2, p.radius * 1.8),
      attenuationDistance: Math.max(0.3, p.radius * 2.4),
      ior: p.ior,
      dispersion: p.dispersion,
    },
  };
}

interface CrystalInstance {
  mesh: Mesh;
  colors: number[];
}

function mergeInstances(instances: readonly CrystalInstance[]): CrystalInstance {
  return {
    mesh: merge(...instances.map((instance) => instance.mesh)),
    colors: instances.flatMap((instance) => instance.colors),
  };
}

/** Build a seeded hero crystal with inner/outer satellite rings and stone base. */
export function buildGradationalCrystalParts(
  params: Partial<GradationalCrystalParams> = {},
): NamedPart[] {
  const p = resolveParams(params);
  const rng = makeRng(p.seed);
  const coreMesh = buildGradationalCrystalMesh({
    sides: p.sides,
    height: p.height,
    radius: p.radius,
    tipRatio: p.tipRatio,
    twist: p.twist,
    seed: p.seed,
  });
  const core: CrystalInstance = {
    mesh: coreMesh,
    colors: crystalColors(coreMesh, p.height, p.hueShift, p.seed),
  };

  const inner: CrystalInstance[] = [];
  const outer: CrystalInstance[] = [];
  const satelliteCount = p.count - 1;
  for (let i = 0; i < satelliteCount; i++) {
    const rank = (i + 1) / Math.max(1, satelliteCount);
    const angle = i / Math.max(1, satelliteCount) * TAU + rng.range(-0.24, 0.24);
    const distance = p.spread * 0.76 * Math.sqrt(rank) * rng.range(0.68, 1.02);
    const height = p.height * rng.range(0.34, 0.78) * lerp(1, 0.78, rank);
    const radius = p.radius * rng.range(0.43, 0.78) * lerp(1, 0.82, rank);
    const crystalSeed = (p.seed + 1 + i * 977) >>> 0;
    const local = buildGradationalCrystalMesh({
      sides: p.sides + rng.int(-1, 1),
      height,
      radius,
      tipRatio: clamp(p.tipRatio * rng.range(0.82, 1.2), 0.12, 0.62),
      twist: p.twist * rng.range(-1.4, 1.4),
      seed: crystalSeed,
    });
    const lean = p.lean * rng.range(0.32, 1) * lerp(0.65, 1, rank);
    const placed = transform(local, {
      rotate: vec3(Math.sin(angle) * lean, rng.range(-0.35, 0.35), -Math.cos(angle) * lean),
      translate: vec3(Math.cos(angle) * distance, 0.02, Math.sin(angle) * distance),
    });
    const instance = {
      mesh: placed,
      colors: crystalColors(local, height, p.hueShift + rng.range(-16, 16), crystalSeed),
    };
    (rank < 0.52 ? inner : outer).push(instance);
  }

  const base = transform(icosphere(p.spread * 0.9, 2), {
    scale: vec3(1, 0.17, 0.82),
    translate: vec3(0, -p.spread * 0.12, 0),
  });
  const parts: NamedPart[] = [{
    name: "crystal_base",
    label: "晶簇岩基",
    mesh: computeNormals(base, 28),
    color: [0.07, 0.075, 0.11],
    surface: { type: "stone", params: { color: [0.07, 0.075, 0.11], roughness: 0.82, seed: p.seed + 9 } },
    metadata: {
      source: "HoudiniHowtos Live-0145 inspired clean-room Meshova rewrite",
      technique: "seeded faceted crystal cluster with height and azimuth gradients",
    },
  }, {
    name: "hero_crystal",
    label: "主渐变晶柱",
    mesh: core.mesh,
    colors: core.colors,
    color: [0.62, 0.25, 0.95],
    surface: gemSurface(p, [0.72, 0.38, 0.96]),
  }];

  if (inner.length > 0) {
    const merged = mergeInstances(inner);
    parts.push({
      name: "inner_crystals",
      label: "内圈伴生晶柱",
      mesh: merged.mesh,
      colors: merged.colors,
      color: [0.36, 0.32, 0.95],
      surface: gemSurface(p, [0.48, 0.42, 0.98]),
    });
  }
  if (outer.length > 0) {
    const merged = mergeInstances(outer);
    parts.push({
      name: "outer_crystals",
      label: "外圈伴生晶柱",
      mesh: merged.mesh,
      colors: merged.colors,
      color: [0.16, 0.48, 0.92],
      surface: gemSurface(p, [0.28, 0.56, 0.96]),
    });
  }
  return parts;
}
