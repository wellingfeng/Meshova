import type { Vec3 } from "../math/vec3.js";
import { add, dot, normalize, scale, vec3 } from "../math/vec3.js";
import type { Mesh } from "../geometry/mesh.js";
import { makeTexture, type TextureBuffer } from "./buffer.js";
import { heightToNormal, type Material } from "./pbr.js";

export interface GeometryTextureBakeOptions {
  readonly width?: number;
  readonly height?: number;
  readonly heightAxis?: Vec3;
  readonly primitiveIds?: ReadonlyArray<number>;
  readonly curvatureAoStrength?: number;
}

export interface GeometryTextureBake {
  readonly height: TextureBuffer;
  readonly id: TextureBuffer;
  readonly normal: TextureBuffer;
  readonly ao: TextureBuffer;
  readonly curvature: TextureBuffer;
  readonly coverage: TextureBuffer;
  readonly idRange: readonly [number, number];
}

export interface GeometryBakeMaterialOptions {
  readonly palette?: ReadonlyArray<readonly [number, number, number]>;
  readonly metallic?: number;
  readonly roughness?: number;
  readonly curvatureRoughness?: number;
  readonly normalStrength?: number;
}

export function bakeGeometryToTextures(
  mesh: Mesh,
  options: GeometryTextureBakeOptions = {},
): GeometryTextureBake {
  const width = Math.max(1, Math.floor(options.width ?? 256));
  const height = Math.max(1, Math.floor(options.height ?? width));
  const axis = normalize(options.heightAxis ?? vec3(0, 1, 0));
  const triangleCount = mesh.indices.length / 3;
  if (options.primitiveIds && options.primitiveIds.length !== triangleCount) {
    throw new Error("primitiveIds length must equal triangle count");
  }

  const projected = mesh.positions.map((position) => dot(position, axis));
  const minProjection = projected.length > 0 ? Math.min(...projected) : 0;
  const maxProjection = projected.length > 0 ? Math.max(...projected) : 1;
  const projectionRange = Math.max(1e-9, maxProjection - minProjection);
  const primitiveIds = Array.from({ length: triangleCount }, (_, index) => options.primitiveIds?.[index] ?? index);
  const idMin = primitiveIds.length > 0 ? Math.min(...primitiveIds) : 0;
  const idMax = primitiveIds.length > 0 ? Math.max(...primitiveIds) : 0;
  const idRange = Math.max(1, idMax - idMin);
  const vertexCurvature = computeVertexCurvature(mesh);

  const heightMap = makeTexture(width, height, 1);
  const idMap = makeTexture(width, height, 1);
  const normalMap = makeTexture(width, height, 3);
  const aoMap = makeTexture(width, height, 1);
  const curvatureMap = makeTexture(width, height, 1);
  const coverageMap = makeTexture(width, height, 1);
  const zBuffer = new Float64Array(width * height);
  zBuffer.fill(-Infinity);
  for (let pixel = 0; pixel < width * height; pixel++) {
    normalMap.data[pixel * 3] = 0.5;
    normalMap.data[pixel * 3 + 1] = 0.5;
    normalMap.data[pixel * 3 + 2] = 1;
    aoMap.data[pixel] = 1;
  }

  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const ia = mesh.indices[triangle * 3]!;
    const ib = mesh.indices[triangle * 3 + 1]!;
    const ic = mesh.indices[triangle * 3 + 2]!;
    const a = uvToPixel(mesh.uvs[ia]!, width, height);
    const b = uvToPixel(mesh.uvs[ib]!, width, height);
    const c = uvToPixel(mesh.uvs[ic]!, width, height);
    const area = edge(a.x, a.y, b.x, b.y, c.x, c.y);
    if (Math.abs(area) < 1e-12) continue;
    const minX = clampInt(Math.floor(Math.min(a.x, b.x, c.x)), 0, width - 1);
    const maxX = clampInt(Math.ceil(Math.max(a.x, b.x, c.x)), 0, width - 1);
    const minY = clampInt(Math.floor(Math.min(a.y, b.y, c.y)), 0, height - 1);
    const maxY = clampInt(Math.ceil(Math.max(a.y, b.y, c.y)), 0, height - 1);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const w0 = edge(b.x, b.y, c.x, c.y, x, y) / area;
        const w1 = edge(c.x, c.y, a.x, a.y, x, y) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
        const projection = projected[ia]! * w0 + projected[ib]! * w1 + projected[ic]! * w2;
        const pixel = y * width + x;
        if (projection < zBuffer[pixel]!) continue;
        zBuffer[pixel] = projection;
        const normalizedHeight = (projection - minProjection) / projectionRange;
        const normal = normalize(add(
          add(scale(mesh.normals[ia]!, w0), scale(mesh.normals[ib]!, w1)),
          scale(mesh.normals[ic]!, w2),
        ));
        const curvature = clamp01(
          vertexCurvature[ia]! * w0 + vertexCurvature[ib]! * w1 + vertexCurvature[ic]! * w2,
        );
        const upward = Math.abs(dot(normal, axis));
        const ao = clamp01(
          (0.65 + upward * 0.35) * (1 - curvature * (options.curvatureAoStrength ?? 0.65)),
        );
        heightMap.data[pixel] = normalizedHeight;
        idMap.data[pixel] = (primitiveIds[triangle]! - idMin) / idRange;
        normalMap.data[pixel * 3] = normal.x * 0.5 + 0.5;
        normalMap.data[pixel * 3 + 1] = normal.y * 0.5 + 0.5;
        normalMap.data[pixel * 3 + 2] = normal.z * 0.5 + 0.5;
        aoMap.data[pixel] = ao;
        curvatureMap.data[pixel] = curvature;
        coverageMap.data[pixel] = 1;
      }
    }
  }

  return {
    height: heightMap,
    id: idMap,
    normal: normalMap,
    ao: aoMap,
    curvature: curvatureMap,
    coverage: coverageMap,
    idRange: [idMin, idMax],
  };
}

export function materialFromGeometryBake(
  bake: GeometryTextureBake,
  options: GeometryBakeMaterialOptions = {},
): Material {
  const palette = options.palette ?? [
    [0.22, 0.07, 0.025],
    [0.45, 0.18, 0.055],
    [0.7, 0.36, 0.12],
    [0.32, 0.11, 0.035],
  ];
  if (palette.length === 0) throw new Error("geometry bake material palette must not be empty");
  const width = bake.height.width;
  const height = bake.height.height;
  const baseColor = makeTexture(width, height, 3);
  const metallic = makeTexture(width, height, 1);
  const roughness = makeTexture(width, height, 1);
  const emission = makeTexture(width, height, 3);
  const metalValue = clamp01(options.metallic ?? 0);
  const roughValue = clamp(options.roughness ?? 0.62, 0.04, 1);
  const curvatureRoughness = options.curvatureRoughness ?? 0.22;
  for (let pixel = 0; pixel < width * height; pixel++) {
    const covered = bake.coverage.data[pixel]!;
    const paletteIndex = Math.min(
      palette.length - 1,
      Math.max(0, Math.round(bake.id.data[pixel]! * (palette.length - 1))),
    );
    const color = covered > 0 ? palette[paletteIndex]! : [0, 0, 0];
    baseColor.data[pixel * 3] = color[0];
    baseColor.data[pixel * 3 + 1] = color[1];
    baseColor.data[pixel * 3 + 2] = color[2];
    metallic.data[pixel] = covered > 0 ? metalValue : 0;
    roughness.data[pixel] = covered > 0
      ? clamp(roughValue + bake.curvature.data[pixel]! * curvatureRoughness, 0.04, 1)
      : 1;
  }
  return {
    baseColor,
    metallic,
    roughness,
    normal: heightToNormal(bake.height, options.normalStrength ?? 6),
    ao: cloneTexture(bake.ao),
    height: cloneTexture(bake.height),
    emission,
  };
}

function computeVertexCurvature(mesh: Mesh): number[] {
  const sums = mesh.positions.map(() => 0);
  const counts = mesh.positions.map(() => 0);
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const triangle = [mesh.indices[index]!, mesh.indices[index + 1]!, mesh.indices[index + 2]!];
    for (let corner = 0; corner < 3; corner++) {
      const a = triangle[corner]!;
      const b = triangle[(corner + 1) % 3]!;
      const normalDelta = 1 - clamp(dot(normalize(mesh.normals[a]!), normalize(mesh.normals[b]!)), -1, 1);
      sums[a] = sums[a]! + normalDelta;
      sums[b] = sums[b]! + normalDelta;
      counts[a] = counts[a]! + 1;
      counts[b] = counts[b]! + 1;
    }
  }
  return sums.map((sum, index) => clamp01(counts[index]! > 0 ? sum / counts[index]! : 0));
}

function cloneTexture(texture: TextureBuffer): TextureBuffer {
  const copy = makeTexture(texture.width, texture.height, texture.channels);
  copy.data.set(texture.data);
  return copy;
}

function uvToPixel(uv: { x: number; y: number }, width: number, height: number): { x: number; y: number } {
  return {
    x: uv.x * (width - 1),
    y: (1 - uv.y) * (height - 1),
  };
}

function edge(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  return (px - ax) * (by - ay) - (py - ay) * (bx - ax);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
