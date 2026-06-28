import type { Vec3 } from "../math/vec3.js";
import type { Vec2 } from "../math/vec2.js";
import { add, scale, vec3 } from "../math/vec3.js";
import type { Mesh } from "../geometry/mesh.js";
import { makeMesh, recomputeNormals } from "../geometry/mesh.js";
import type { PartSurfaceRef } from "../geometry/export.js";

export interface CharacterRegion {
  name: string;
  vertexIndices: readonly number[];
}

export interface CharacterLandmark {
  name: string;
  vertexIndex: number;
}

export interface CharacterJoint {
  id: string;
  parent?: string;
  bindPosition: Vec3;
}

export interface CharacterSkeleton {
  joints: readonly CharacterJoint[];
}

export interface SkinWeight {
  vertex: number;
  influences: readonly { joint: string; weight: number }[];
}

export interface CharacterMaterialSlot {
  name: string;
  regions: readonly string[];
  surface?: PartSurfaceRef;
}

export interface MorphDelta {
  index: number;
  delta: Vec3;
}

export interface MorphTarget {
  id: string;
  label: string;
  min: number;
  max: number;
  default: number;
  deltas: readonly MorphDelta[];
}

export interface CharacterTemplate {
  id: string;
  name: string;
  baseMesh: Mesh;
  regions: readonly CharacterRegion[];
  regionForVertex: readonly string[];
  landmarks: readonly CharacterLandmark[];
  skeleton: CharacterSkeleton;
  skinWeights: readonly SkinWeight[];
  morphTargets: readonly MorphTarget[];
  materialSlots: readonly CharacterMaterialSlot[];
}

export type MorphWeights = Record<string, number>;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function defaultMorphWeights(template: CharacterTemplate): MorphWeights {
  const weights: MorphWeights = {};
  for (const target of template.morphTargets) weights[target.id] = target.default;
  return weights;
}

export function applyMorphTargets(
  template: CharacterTemplate,
  weights: MorphWeights = {},
): Mesh {
  const base = template.baseMesh;
  const positions = base.positions.map((p) => vec3(p.x, p.y, p.z));

  for (const target of template.morphTargets) {
    const raw = weights[target.id] ?? target.default;
    const w = clamp(raw, target.min, target.max);
    if (w === 0) continue;
    for (const delta of target.deltas) {
      const p = positions[delta.index]!;
      positions[delta.index] = add(p, scale(delta.delta, w));
    }
  }

  return recomputeNormals(makeMesh({
    positions,
    normals: base.normals.map((n) => vec3(n.x, n.y, n.z)),
    uvs: base.uvs.map((uv) => ({ x: uv.x, y: uv.y })),
    indices: base.indices.slice(),
  }));
}

export function landmarkPositions(
  template: CharacterTemplate,
  mesh: Mesh = template.baseMesh,
): Record<string, Vec3> {
  const out: Record<string, Vec3> = {};
  for (const mark of template.landmarks) {
    const p = mesh.positions[mark.vertexIndex];
    if (p) out[mark.name] = p;
  }
  return out;
}

export function extractRegionMesh(
  template: CharacterTemplate,
  mesh: Mesh,
  regionNames: readonly string[],
  normalOffset = 0,
): Mesh {
  const allowed = new Set(regionNames);
  const remap = new Map<number, number>();
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];

  const addVertex = (oldIndex: number): number => {
    const cached = remap.get(oldIndex);
    if (cached !== undefined) return cached;
    const p = mesh.positions[oldIndex]!;
    const n = mesh.normals[oldIndex]!;
    const next = positions.length;
    positions.push(vec3(
      p.x + n.x * normalOffset,
      p.y + n.y * normalOffset,
      p.z + n.z * normalOffset,
    ));
    normals.push(vec3(n.x, n.y, n.z));
    const uv = mesh.uvs[oldIndex]!;
    uvs.push({ x: uv.x, y: uv.y });
    remap.set(oldIndex, next);
    return next;
  };

  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i]!;
    const b = mesh.indices[i + 1]!;
    const c = mesh.indices[i + 2]!;
    if (
      !allowed.has(template.regionForVertex[a]!) ||
      !allowed.has(template.regionForVertex[b]!) ||
      !allowed.has(template.regionForVertex[c]!)
    ) {
      continue;
    }
    indices.push(addVertex(a), addVertex(b), addVertex(c));
  }

  return makeMesh({ positions, normals, uvs, indices });
}

export function validateCharacterTemplate(template: CharacterTemplate): void {
  const verts = template.baseMesh.positions.length;
  if (template.regionForVertex.length !== verts) {
    throw new Error(`regionForVertex length ${template.regionForVertex.length} != vertex count ${verts}`);
  }
  if (template.skinWeights.length !== verts) {
    throw new Error(`skinWeights length ${template.skinWeights.length} != vertex count ${verts}`);
  }
  for (const mark of template.landmarks) {
    if (mark.vertexIndex < 0 || mark.vertexIndex >= verts) {
      throw new Error(`landmark ${mark.name} points outside mesh`);
    }
  }
  for (const target of template.morphTargets) {
    for (const delta of target.deltas) {
      if (delta.index < 0 || delta.index >= verts) {
        throw new Error(`morph ${target.id} delta index ${delta.index} outside mesh`);
      }
    }
  }
}
