import type { Vec3 } from "../math/vec3.js";
import { add, cross, dot, length, normalize, scale, sub } from "../math/vec3.js";
import type { Mesh } from "../geometry/mesh.js";
import { makeTexture, type TextureBuffer } from "./buffer.js";

export type BakeOverlapPolicy = "closest" | "first";

export interface ProfessionalBakeOptions {
  readonly width?: number;
  readonly height?: number;
  readonly cageOffset?: number;
  readonly maxRayDistance?: number;
  readonly rayBias?: number;
  readonly padding?: number;
  readonly overlapPolicy?: BakeOverlapPolicy;
}

export interface ProfessionalBakeResult {
  readonly normal: TextureBuffer;
  readonly worldNormal: TextureBuffer;
  readonly position: TextureBuffer;
  readonly hitDistance: TextureBuffer;
  readonly coverage: TextureBuffer;
  readonly miss: TextureBuffer;
  readonly overlap: TextureBuffer;
  readonly hitRate: number;
}

interface RasterPoint {
  readonly x: number;
  readonly y: number;
}

interface RayHit {
  readonly distance: number;
  readonly position: Vec3;
  readonly normal: Vec3;
}

/**
 * Transfer high-poly position and normals into low-poly UV space. Rays start
 * at the low-poly cage and travel inward. Misses remain explicit for QA.
 */
export function bakeHighToLowTextures(
  lowMesh: Mesh,
  highMesh: Mesh,
  options: ProfessionalBakeOptions = {},
): ProfessionalBakeResult {
  const width = positiveInt(options.width ?? 256, "width");
  const height = positiveInt(options.height ?? width, "height");
  const cageOffset = Math.max(0, options.cageOffset ?? 0.05);
  const maxRayDistance = Math.max(1e-8, options.maxRayDistance ?? Math.max(cageOffset * 2, 0.1));
  const rayBias = Math.max(0, options.rayBias ?? 1e-5);
  const overlapPolicy = options.overlapPolicy ?? "closest";
  const normal = makeTexture(width, height, 3);
  const worldNormal = makeTexture(width, height, 3);
  const position = makeTexture(width, height, 3);
  const hitDistance = makeTexture(width, height, 1);
  const coverage = makeTexture(width, height, 1);
  const miss = makeTexture(width, height, 1);
  const overlap = makeTexture(width, height, 1);
  const selectedDistance = new Float64Array(width * height);
  selectedDistance.fill(Infinity);
  fillFlatNormals(normal);
  fillFlatNormals(worldNormal);

  for (let triangle = 0; triangle < lowMesh.indices.length; triangle += 3) {
    const ia = lowMesh.indices[triangle]!;
    const ib = lowMesh.indices[triangle + 1]!;
    const ic = lowMesh.indices[triangle + 2]!;
    const uvA = uvToPixel(lowMesh.uvs[ia]!.x, lowMesh.uvs[ia]!.y, width, height);
    const uvB = uvToPixel(lowMesh.uvs[ib]!.x, lowMesh.uvs[ib]!.y, width, height);
    const uvC = uvToPixel(lowMesh.uvs[ic]!.x, lowMesh.uvs[ic]!.y, width, height);
    const area = edge(uvA, uvB, uvC);
    if (Math.abs(area) < 1e-12) continue;
    const tangentFrame = triangleTangentFrame(lowMesh, ia, ib, ic);
    const minX = clampInt(Math.floor(Math.min(uvA.x, uvB.x, uvC.x)), 0, width - 1);
    const maxX = clampInt(Math.ceil(Math.max(uvA.x, uvB.x, uvC.x)), 0, width - 1);
    const minY = clampInt(Math.floor(Math.min(uvA.y, uvB.y, uvC.y)), 0, height - 1);
    const maxY = clampInt(Math.ceil(Math.max(uvA.y, uvB.y, uvC.y)), 0, height - 1);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const point = { x: x + 0.5, y: y + 0.5 };
        const w0 = edge(uvB, uvC, point) / area;
        const w1 = edge(uvC, uvA, point) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
        const pixel = y * width + x;
        overlap.data[pixel] = Math.min(1, overlap.data[pixel]! + (coverage.data[pixel]! > 0 ? 1 : 0));
        const lowPosition = barycentricVec(lowMesh.positions[ia]!, lowMesh.positions[ib]!, lowMesh.positions[ic]!, w0, w1, w2);
        const lowNormal = normalize(barycentricVec(lowMesh.normals[ia]!, lowMesh.normals[ib]!, lowMesh.normals[ic]!, w0, w1, w2));
        const origin = add(lowPosition, scale(lowNormal, cageOffset + rayBias));
        const hit = traceClosest(highMesh, origin, scale(lowNormal, -1), maxRayDistance + cageOffset);
        coverage.data[pixel] = 1;
        if (!hit) {
          miss.data[pixel] = 1;
          continue;
        }
        const surfaceDistance = Math.abs(dot(sub(hit.position, lowPosition), lowNormal));
        if (overlapPolicy === "first" && selectedDistance[pixel]! < Infinity) continue;
        if (overlapPolicy === "closest" && surfaceDistance >= selectedDistance[pixel]!) continue;
        selectedDistance[pixel] = surfaceDistance;
        miss.data[pixel] = 0;
        hitDistance.data[pixel] = Math.min(1, surfaceDistance / maxRayDistance);
        writeVec3(position, pixel, hit.position);
        writeEncodedNormal(worldNormal, pixel, hit.normal);
        writeEncodedNormal(normal, pixel, normalize({
          x: dot(hit.normal, tangentFrame.tangent),
          y: dot(hit.normal, tangentFrame.bitangent),
          z: dot(hit.normal, lowNormal),
        }));
      }
    }
  }

  let covered = 0;
  let hits = 0;
  for (let pixel = 0; pixel < coverage.data.length; pixel++) {
    if (coverage.data[pixel]! <= 0) continue;
    covered++;
    if (miss.data[pixel]! === 0) hits++;
  }
  const padding = Math.max(0, Math.floor(options.padding ?? 8));
  if (padding > 0) {
    for (const texture of [normal, worldNormal, position, hitDistance]) {
      dilateTextureInPlace(texture, coverage, padding);
    }
  }
  return {
    normal,
    worldNormal,
    position,
    hitDistance,
    coverage,
    miss,
    overlap,
    hitRate: covered === 0 ? 0 : hits / covered,
  };
}

export interface TexelDensityReport {
  readonly mean: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly deviation: number;
  readonly degenerateTriangles: number;
}

/** Texels per world-space unit for each UV triangle, area weighted. */
export function analyzeTexelDensity(mesh: Mesh, width: number, height = width): TexelDensityReport {
  const densities: Array<{ value: number; weight: number }> = [];
  let degenerateTriangles = 0;
  for (let triangle = 0; triangle < mesh.indices.length; triangle += 3) {
    const ia = mesh.indices[triangle]!;
    const ib = mesh.indices[triangle + 1]!;
    const ic = mesh.indices[triangle + 2]!;
    const worldArea = length(cross(
      sub(mesh.positions[ib]!, mesh.positions[ia]!),
      sub(mesh.positions[ic]!, mesh.positions[ia]!),
    )) * 0.5;
    const a = mesh.uvs[ia]!;
    const b = mesh.uvs[ib]!;
    const c = mesh.uvs[ic]!;
    const uvArea = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) * 0.5;
    if (worldArea <= 1e-12 || uvArea <= 1e-12) {
      degenerateTriangles++;
      continue;
    }
    densities.push({ value: Math.sqrt(uvArea * width * height / worldArea), weight: worldArea });
  }
  if (densities.length === 0) return { mean: 0, minimum: 0, maximum: 0, deviation: 0, degenerateTriangles };
  const totalWeight = densities.reduce((sum, entry) => sum + entry.weight, 0);
  const mean = densities.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight;
  const variance = densities.reduce((sum, entry) => sum + (entry.value - mean) ** 2 * entry.weight, 0) / totalWeight;
  return {
    mean,
    minimum: Math.min(...densities.map((entry) => entry.value)),
    maximum: Math.max(...densities.map((entry) => entry.value)),
    deviation: Math.sqrt(variance),
    degenerateTriangles,
  };
}

export function dilateTexture(
  texture: TextureBuffer,
  coverage: TextureBuffer,
  padding: number,
): TextureBuffer {
  assertSameSize(texture, coverage);
  const output = makeTexture(texture.width, texture.height, texture.channels);
  output.data.set(texture.data);
  dilateTextureInPlace(output, coverage, padding);
  return output;
}

function dilateTextureInPlace(texture: TextureBuffer, coverage: TextureBuffer, padding: number): void {
  assertSameSize(texture, coverage);
  let active = new Uint8Array(texture.width * texture.height);
  for (let index = 0; index < active.length; index++) active[index] = coverage.data[index]! > 0 ? 1 : 0;
  for (let step = 0; step < padding; step++) {
    const next = active.slice();
    const writes: Array<{ target: number; source: number }> = [];
    for (let y = 0; y < texture.height; y++) {
      for (let x = 0; x < texture.width; x++) {
        const target = y * texture.width + x;
        if (active[target]) continue;
        const sources = [
          x > 0 ? target - 1 : -1,
          x + 1 < texture.width ? target + 1 : -1,
          y > 0 ? target - texture.width : -1,
          y + 1 < texture.height ? target + texture.width : -1,
        ];
        const source = sources.find((candidate) => candidate >= 0 && active[candidate]);
        if (source === undefined) continue;
        next[target] = 1;
        writes.push({ target, source });
      }
    }
    if (writes.length === 0) break;
    for (const write of writes) {
      for (let channel = 0; channel < texture.channels; channel++) {
        texture.data[write.target * texture.channels + channel] = texture.data[write.source * texture.channels + channel]!;
      }
    }
    active = next;
  }
}

function traceClosest(mesh: Mesh, origin: Vec3, direction: Vec3, maximum: number): RayHit | undefined {
  let closest: RayHit | undefined;
  for (let triangle = 0; triangle < mesh.indices.length; triangle += 3) {
    const ia = mesh.indices[triangle]!;
    const ib = mesh.indices[triangle + 1]!;
    const ic = mesh.indices[triangle + 2]!;
    const hit = rayTriangle(origin, direction, mesh.positions[ia]!, mesh.positions[ib]!, mesh.positions[ic]!);
    if (!hit || hit.distance > maximum || (closest && hit.distance >= closest.distance)) continue;
    closest = {
      distance: hit.distance,
      position: add(origin, scale(direction, hit.distance)),
      normal: normalize(barycentricVec(mesh.normals[ia]!, mesh.normals[ib]!, mesh.normals[ic]!, hit.w, hit.u, hit.v)),
    };
  }
  return closest;
}

function rayTriangle(origin: Vec3, direction: Vec3, a: Vec3, b: Vec3, c: Vec3): { distance: number; u: number; v: number; w: number } | undefined {
  const edgeA = sub(b, a);
  const edgeB = sub(c, a);
  const perpendicular = cross(direction, edgeB);
  const determinant = dot(edgeA, perpendicular);
  if (Math.abs(determinant) < 1e-10) return undefined;
  const inverse = 1 / determinant;
  const offset = sub(origin, a);
  const u = dot(offset, perpendicular) * inverse;
  if (u < 0 || u > 1) return undefined;
  const crossOffset = cross(offset, edgeA);
  const v = dot(direction, crossOffset) * inverse;
  if (v < 0 || u + v > 1) return undefined;
  const distance = dot(edgeB, crossOffset) * inverse;
  if (distance < 0) return undefined;
  return { distance, u, v, w: 1 - u - v };
}

function triangleTangentFrame(mesh: Mesh, ia: number, ib: number, ic: number): { tangent: Vec3; bitangent: Vec3 } {
  const edgeA = sub(mesh.positions[ib]!, mesh.positions[ia]!);
  const edgeB = sub(mesh.positions[ic]!, mesh.positions[ia]!);
  const duA = mesh.uvs[ib]!.x - mesh.uvs[ia]!.x;
  const dvA = mesh.uvs[ib]!.y - mesh.uvs[ia]!.y;
  const duB = mesh.uvs[ic]!.x - mesh.uvs[ia]!.x;
  const dvB = mesh.uvs[ic]!.y - mesh.uvs[ia]!.y;
  const determinant = duA * dvB - duB * dvA;
  if (Math.abs(determinant) < 1e-12) {
    const tangent = normalize(edgeA);
    return { tangent, bitangent: normalize(cross(normalize(cross(edgeA, edgeB)), tangent)) };
  }
  const inverse = 1 / determinant;
  return {
    tangent: normalize(sub(scale(edgeA, dvB * inverse), scale(edgeB, dvA * inverse))),
    bitangent: normalize(sub(scale(edgeB, duA * inverse), scale(edgeA, duB * inverse))),
  };
}

function barycentricVec(a: Vec3, b: Vec3, c: Vec3, wa: number, wb: number, wc: number): Vec3 {
  return add(add(scale(a, wa), scale(b, wb)), scale(c, wc));
}

function fillFlatNormals(texture: TextureBuffer): void {
  for (let pixel = 0; pixel < texture.width * texture.height; pixel++) {
    texture.data[pixel * 3] = 0.5;
    texture.data[pixel * 3 + 1] = 0.5;
    texture.data[pixel * 3 + 2] = 1;
  }
}

function writeVec3(texture: TextureBuffer, pixel: number, value: Vec3): void {
  texture.data[pixel * 3] = value.x;
  texture.data[pixel * 3 + 1] = value.y;
  texture.data[pixel * 3 + 2] = value.z;
}

function writeEncodedNormal(texture: TextureBuffer, pixel: number, value: Vec3): void {
  texture.data[pixel * 3] = value.x * 0.5 + 0.5;
  texture.data[pixel * 3 + 1] = value.y * 0.5 + 0.5;
  texture.data[pixel * 3 + 2] = value.z * 0.5 + 0.5;
}

function uvToPixel(u: number, v: number, width: number, height: number): RasterPoint {
  return { x: u * width - 0.5, y: (1 - v) * height - 0.5 };
}

function edge(a: RasterPoint, b: RasterPoint, c: RasterPoint): number {
  return (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x);
}

function positiveInt(value: number, name: string): number {
  const result = Math.floor(value);
  if (!Number.isFinite(value) || result < 1) throw new Error(`${name} must be a positive integer`);
  return result;
}

function clampInt(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function assertSameSize(texture: TextureBuffer, coverage: TextureBuffer): void {
  if (coverage.channels !== 1 || texture.width !== coverage.width || texture.height !== coverage.height) {
    throw new Error("coverage must be a same-size single-channel texture");
  }
}
