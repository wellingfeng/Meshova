import { cross, length, normalize, sub, vec3, type Vec3 } from "../math/vec3.js";
import { makeMesh, type Mesh } from "./mesh.js";

export type LowPolyColor = [number, number, number];

export interface LowPolyStyleOptions {
  seed?: number;
  colorVariation?: number;
}

export interface LowPolyStyledMesh {
  mesh: Mesh;
  colors: number[];
}

function faceRandom(seed: number, faceIndex: number): number {
  let value = Math.imul((seed | 0) ^ Math.imul(faceIndex + 1, 0x9e3779b1), 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

export function facetedMesh(mesh: Mesh): Mesh {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];

  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    const sourceIndices = [mesh.indices[offset]!, mesh.indices[offset + 1]!, mesh.indices[offset + 2]!];
    const pointA = mesh.positions[sourceIndices[0]!]!;
    const pointB = mesh.positions[sourceIndices[1]!]!;
    const pointC = mesh.positions[sourceIndices[2]!]!;
    const crossNormal = cross(sub(pointB, pointA), sub(pointC, pointA));
    const faceNormal = length(crossNormal) > 0 ? normalize(crossNormal) : vec3(0, 1, 0);
    const baseIndex = positions.length;

    for (const sourceIndex of sourceIndices) {
      positions.push(mesh.positions[sourceIndex]!);
      normals.push(faceNormal);
      uvs.push(mesh.uvs[sourceIndex]!);
    }
    indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
  }

  return makeMesh({ positions, normals, uvs, indices });
}

export function styleLowPolyMesh(
  mesh: Mesh,
  baseColor: LowPolyColor,
  options: LowPolyStyleOptions = {},
): LowPolyStyledMesh {
  const faceted = facetedMesh(mesh);
  const variation = Math.max(0, options.colorVariation ?? 0.08);
  const seed = options.seed ?? 1;
  const colors: number[] = [];

  for (let faceIndex = 0; faceIndex < faceted.indices.length / 3; faceIndex++) {
    const shade = 1 + (faceRandom(seed, faceIndex) * 2 - 1) * variation;
    const red = Math.max(0, Math.min(1, baseColor[0] * shade));
    const green = Math.max(0, Math.min(1, baseColor[1] * shade));
    const blue = Math.max(0, Math.min(1, baseColor[2] * shade));
    for (let corner = 0; corner < 3; corner++) colors.push(red, green, blue);
  }

  return { mesh: faceted, colors };
}
