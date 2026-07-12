import { vec2, type Vec2 } from "../math/vec2.js";
import { cross, normalize, sub, type Vec3 } from "../math/vec3.js";
import { makeMesh, type Mesh } from "./mesh.js";

export interface CliffPanel {
  readonly id: number;
  readonly directionBin: number;
  readonly direction: Vec3;
  readonly faceCount: number;
  readonly fallback: boolean;
  readonly mesh: Mesh;
}

export interface CliffPanelOptions {
  directionBins?: number;
  maxUpDot?: number;
  uvScale?: number;
  minimumFaces?: number;
}

export function panelizeCliffMesh(mesh: Mesh, options: CliffPanelOptions = {}): ReadonlyArray<CliffPanel> {
  const directionBins = clampInt(options.directionBins ?? 8, 2, 32);
  const maxUpDot = clamp(options.maxUpDot ?? 0.72, 0, 1);
  const uvScale = Math.max(1e-6, options.uvScale ?? 1);
  const minimumFaces = clampInt(options.minimumFaces ?? 1, 1, Number.MAX_SAFE_INTEGER);
  const faceCount = mesh.indices.length / 3;
  const bins = new Map<number, number[]>();
  const fallback: number[] = [];

  for (let face = 0; face < faceCount; face++) {
    const a = mesh.positions[mesh.indices[face * 3]!]!;
    const b = mesh.positions[mesh.indices[face * 3 + 1]!]!;
    const c = mesh.positions[mesh.indices[face * 3 + 2]!]!;
    const normal = normalize(cross(sub(b, a), sub(c, a)));
    if (Math.abs(normal.y) > maxUpDot) {
      fallback.push(face);
      continue;
    }
    const angle = Math.atan2(normal.z, normal.x);
    const bin = ((Math.round((angle / (Math.PI * 2)) * directionBins) % directionBins) + directionBins) % directionBins;
    const faces = bins.get(bin) ?? [];
    faces.push(face);
    bins.set(bin, faces);
  }

  const panels: CliffPanel[] = [];
  for (const [bin, faces] of [...bins.entries()].sort((a, b) => a[0] - b[0])) {
    const components = connectedFaceComponents(mesh, faces);
    for (const component of components) {
      if (component.length < minimumFaces) {
        fallback.push(...component);
        continue;
      }
      const angle = (bin / directionBins) * Math.PI * 2;
      const direction = { x: Math.cos(angle), y: 0, z: Math.sin(angle) };
      panels.push({
        id: panels.length,
        directionBin: bin,
        direction,
        faceCount: component.length,
        fallback: false,
        mesh: extractPanelMesh(mesh, component, direction, uvScale),
      });
    }
  }
  if (fallback.length > 0) {
    panels.push({
      id: panels.length,
      directionBin: -1,
      direction: { x: 0, y: 1, z: 0 },
      faceCount: fallback.length,
      fallback: true,
      mesh: extractPanelMesh(mesh, fallback, { x: 0, y: 1, z: 0 }, uvScale),
    });
  }
  return panels;
}

function connectedFaceComponents(mesh: Mesh, faces: ReadonlyArray<number>): number[][] {
  const faceSet = new Set(faces);
  const facesByEdge = new Map<string, number[]>();
  for (const face of faces) {
    const ids = [mesh.indices[face * 3]!, mesh.indices[face * 3 + 1]!, mesh.indices[face * 3 + 2]!];
    for (let edge = 0; edge < 3; edge++) {
      const a = ids[edge]!;
      const b = ids[(edge + 1) % 3]!;
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const connected = facesByEdge.get(key) ?? [];
      connected.push(face);
      facesByEdge.set(key, connected);
    }
  }
  const adjacency = new Map<number, Set<number>>();
  for (const face of faces) adjacency.set(face, new Set());
  for (const connected of facesByEdge.values()) {
    for (const a of connected) for (const b of connected) if (a !== b && faceSet.has(b)) adjacency.get(a)!.add(b);
  }
  const unvisited = new Set(faces);
  const components: number[][] = [];
  while (unvisited.size > 0) {
    const first = unvisited.values().next().value as number;
    const stack = [first];
    const component: number[] = [];
    unvisited.delete(first);
    while (stack.length > 0) {
      const face = stack.pop()!;
      component.push(face);
      for (const neighbor of adjacency.get(face)!) {
        if (!unvisited.delete(neighbor)) continue;
        stack.push(neighbor);
      }
    }
    components.push(component.sort((a, b) => a - b));
  }
  return components;
}

function extractPanelMesh(
  mesh: Mesh,
  faces: ReadonlyArray<number>,
  direction: Vec3,
  uvScale: number,
): Mesh {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];
  const tangent = Math.abs(direction.y) > 0.5
    ? { x: 1, y: 0, z: 0 }
    : normalize({ x: -direction.z, y: 0, z: direction.x });
  for (const face of faces) {
    for (let corner = 0; corner < 3; corner++) {
      const source = mesh.indices[face * 3 + corner]!;
      const position = mesh.positions[source]!;
      positions.push(position);
      normals.push(mesh.normals[source]!);
      uvs.push(Math.abs(direction.y) > 0.5
        ? vec2(position.x / uvScale, position.z / uvScale)
        : vec2((position.x * tangent.x + position.z * tangent.z) / uvScale, position.y / uvScale));
      indices.push(indices.length);
    }
  }
  return makeMesh({ positions, normals, uvs, indices });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
