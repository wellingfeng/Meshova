import { clamp, smoothstep } from "../math/scalar.js";
import { dot, normalize, vec3, type Vec3 } from "../math/vec3.js";
import { makeTexture, type TextureBuffer } from "./buffer.js";
import type { GeometryTextureBake } from "./geometry-bake.js";
import { heightToNormal, type Material } from "./pbr.js";

export interface GeometryAwareMaskOptions {
  rainDirection?: Vec3;
  dirtAmount?: number;
  wearAmount?: number;
  rainAmount?: number;
  streakScale?: number;
}

export interface GeometryAwareMasks {
  readonly cavity: TextureBuffer;
  readonly dirt: TextureBuffer;
  readonly edgeWear: TextureBuffer;
  readonly rain: TextureBuffer;
}

export function geometryAwareMasks(
  bake: GeometryTextureBake,
  options: GeometryAwareMaskOptions = {},
): GeometryAwareMasks {
  const width = bake.coverage.width;
  const height = bake.coverage.height;
  const cavity = makeTexture(width, height, 1);
  const dirt = makeTexture(width, height, 1);
  const edgeWear = makeTexture(width, height, 1);
  const rain = makeTexture(width, height, 1);
  const rainDirection = normalize(options.rainDirection ?? vec3(0, -1, 0));
  const dirtAmount = clamp(options.dirtAmount ?? 1, 0, 1);
  const wearAmount = clamp(options.wearAmount ?? 1, 0, 1);
  const rainAmount = clamp(options.rainAmount ?? 1, 0, 1);
  const streakScale = Math.max(1, options.streakScale ?? 24);
  for (let pixel = 0; pixel < width * height; pixel++) {
    const covered = bake.coverage.data[pixel]!;
    if (covered <= 0) continue;
    const normal = vec3(
      bake.worldNormal.data[pixel * 3]! * 2 - 1,
      bake.worldNormal.data[pixel * 3 + 1]! * 2 - 1,
      bake.worldNormal.data[pixel * 3 + 2]! * 2 - 1,
    );
    const positionX = bake.position.data[pixel * 3]!;
    const positionY = bake.position.data[pixel * 3 + 1]!;
    const positionZ = bake.position.data[pixel * 3 + 2]!;
    const cavityValue = clamp(1 - bake.ao.data[pixel]!, 0, 1);
    const exposure = clamp(-dot(normalize(normal), rainDirection), 0, 1);
    const streak = 0.55 + 0.45 * Math.sin(
      (positionX * 0.73 + positionZ * 0.27) * streakScale * Math.PI * 2,
    );
    const runoff = exposure * (0.35 + (1 - positionY) * 0.65) * streak;
    const edge = bake.curvature.data[pixel]! * bake.ao.data[pixel]!;
    cavity.data[pixel] = cavityValue;
    rain.data[pixel] = clamp(runoff * rainAmount, 0, 1);
    edgeWear.data[pixel] = clamp(edge * wearAmount, 0, 1);
    dirt.data[pixel] = clamp(
      (cavityValue * 0.72 + (1 - positionY) * 0.28) * (1 - runoff * 0.48) * dirtAmount,
      0,
      1,
    );
  }
  return { cavity, dirt, edgeWear, rain };
}

export interface GeometryAwareWeatheringOptions extends GeometryAwareMaskOptions {
  dirtColor?: readonly [number, number, number];
  edgeColor?: readonly [number, number, number];
  normalStrength?: number;
}

export function applyGeometryAwareWeathering(
  material: Material,
  bake: GeometryTextureBake,
  options: GeometryAwareWeatheringOptions = {},
): Material {
  assertSameSize(material.height, bake.coverage, "material and geometry bake");
  const masks = geometryAwareMasks(bake, options);
  const dirtColor = options.dirtColor ?? [0.055, 0.042, 0.025];
  const edgeColor = options.edgeColor ?? [0.62, 0.58, 0.5];
  const baseColor = makeTexture(material.baseColor.width, material.baseColor.height, 3);
  const roughness = makeTexture(material.roughness.width, material.roughness.height, 1);
  const metallic = makeTexture(material.metallic.width, material.metallic.height, 1);
  const ao = makeTexture(material.ao.width, material.ao.height, 1);
  const resultHeight = makeTexture(material.height.width, material.height.height, 1);
  for (let pixel = 0; pixel < material.height.width * material.height.height; pixel++) {
    const dirt = masks.dirt.data[pixel]!;
    const wear = masks.edgeWear.data[pixel]!;
    const wet = masks.rain.data[pixel]!;
    for (let channel = 0; channel < 3; channel++) {
      const source = material.baseColor.data[pixel * 3 + channel]!;
      const dirtMixed = mix(source, dirtColor[channel]!, dirt * 0.68);
      baseColor.data[pixel * 3 + channel] = clamp(mix(dirtMixed, edgeColor[channel]!, wear * 0.45) * (1 - wet * 0.22), 0, 1);
    }
    metallic.data[pixel] = clamp(material.metallic.data[pixel]! * (1 - dirt * 0.24), 0, 1);
    roughness.data[pixel] = clamp(material.roughness.data[pixel]! + dirt * 0.2 + wear * 0.08 - wet * 0.42, 0.04, 1);
    ao.data[pixel] = clamp(material.ao.data[pixel]! * (1 - dirt * 0.18), 0, 1);
    resultHeight.data[pixel] = clamp(material.height.data[pixel]! + dirt * 0.012 - wear * 0.008, 0, 1);
  }
  return {
    ...material,
    baseColor,
    metallic,
    roughness,
    ao,
    height: resultHeight,
    normal: heightToNormal(resultHeight, options.normalStrength ?? 4),
  };
}

export interface SplinePathPoint {
  readonly u: number;
  readonly v: number;
  readonly width?: number;
}

export interface SplinePathMaskOptions {
  width?: number;
  feather?: number;
  closed?: boolean;
  subdivisions?: number;
}

export function splinePathMask(
  textureWidth: number,
  textureHeight: number,
  points: readonly SplinePathPoint[],
  options: SplinePathMaskOptions = {},
): TextureBuffer {
  if (points.length < 2) throw new Error("spline path requires at least two points");
  const defaultWidth = Math.max(1e-4, options.width ?? 0.035);
  const feather = Math.max(1e-4, options.feather ?? defaultWidth * 0.35);
  const subdivisions = Math.max(1, Math.floor(options.subdivisions ?? 12));
  const sampled = sampleCatmullRomPath(points, subdivisions, options.closed ?? false, defaultWidth);
  const output = makeTexture(textureWidth, textureHeight, 1);
  for (let y = 0; y < textureHeight; y++) {
    const v = 1 - (y + 0.5) / textureHeight;
    for (let x = 0; x < textureWidth; x++) {
      const u = (x + 0.5) / textureWidth;
      let value = 0;
      for (let segment = 0; segment < sampled.length - 1; segment++) {
        const start = sampled[segment]!;
        const end = sampled[segment + 1]!;
        const nearest = nearestSegment(u, v, start.u, start.v, end.u, end.v);
        const segmentWidth = mix(start.width, end.width, nearest.t);
        value = Math.max(value, 1 - smoothstep(segmentWidth - feather, segmentWidth + feather, nearest.distance));
      }
      output.data[y * textureWidth + x] = value;
    }
  }
  return output;
}

export interface MaterialAnchors {
  readonly values: ReadonlyMap<string, TextureBuffer>;
}

export function createMaterialAnchors(): MaterialAnchors {
  return { values: new Map() };
}

export function withMaterialAnchor(
  anchors: MaterialAnchors,
  name: string,
  texture: TextureBuffer,
): MaterialAnchors {
  if (!name.trim()) throw new Error("material anchor name must not be empty");
  const values = new Map(anchors.values);
  values.set(name, cloneTexture(texture));
  return { values };
}

export function materialAnchor(anchors: MaterialAnchors, name: string): TextureBuffer {
  const texture = anchors.values.get(name);
  if (!texture) throw new Error(`unknown material anchor: ${name}`);
  return cloneTexture(texture);
}

function sampleCatmullRomPath(
  points: readonly SplinePathPoint[],
  subdivisions: number,
  closed: boolean,
  defaultWidth: number,
): Array<{ u: number; v: number; width: number }> {
  const result: Array<{ u: number; v: number; width: number }> = [];
  const segmentCount = closed ? points.length : points.length - 1;
  const at = (index: number): SplinePathPoint => {
    if (closed) return points[(index + points.length) % points.length]!;
    return points[Math.max(0, Math.min(points.length - 1, index))]!;
  };
  for (let segment = 0; segment < segmentCount; segment++) {
    const a = at(segment - 1);
    const b = at(segment);
    const c = at(segment + 1);
    const d = at(segment + 2);
    for (let step = 0; step < subdivisions; step++) {
      const t = step / subdivisions;
      result.push({
        u: catmullRom(a.u, b.u, c.u, d.u, t),
        v: catmullRom(a.v, b.v, c.v, d.v, t),
        width: mix(b.width ?? defaultWidth, c.width ?? defaultWidth, t),
      });
    }
  }
  const last = closed ? points[0]! : points[points.length - 1]!;
  result.push({ u: last.u, v: last.v, width: last.width ?? defaultWidth });
  return result;
}

function catmullRom(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
}

function nearestSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { distance: number; t: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > 1e-12 ? clamp(((px - ax) * dx + (py - ay) * dy) / lengthSquared, 0, 1) : 0;
  return { distance: Math.hypot(px - mix(ax, bx, t), py - mix(ay, by, t)), t };
}

function assertSameSize(left: TextureBuffer, right: TextureBuffer, label: string): void {
  if (left.width !== right.width || left.height !== right.height) {
    throw new Error(`${label} size mismatch`);
  }
}

function cloneTexture(texture: TextureBuffer): TextureBuffer {
  const copy = makeTexture(texture.width, texture.height, texture.channels);
  copy.data.set(texture.data);
  return copy;
}

function mix(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}
