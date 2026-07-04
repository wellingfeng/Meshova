/**
 * Mesh segmentation helpers for turning one indexed mesh into independent,
 * semantic parts. The first layer is deterministic: callers provide per-face
 * labels from geometry heuristics, VLM masks, or importer metadata; this module
 * cuts along label boundaries and optionally caps the cut surface.
 */
import type { Vec2 } from "../math/vec2.js";
import type { Vec3 } from "../math/vec3.js";
import { add, length, normalize, scale, vec3 } from "../math/vec3.js";
import type { Mesh } from "./mesh.js";
import { bounds, makeMesh, recomputeNormals, triangleCount } from "./mesh.js";
import type { NamedPart } from "./export.js";

export type FaceLabel = string | number;

export interface FaceLabelBoundaryLoop {
  /** The face label this cut loop belongs to. */
  label: string;
  /** Original mesh vertex indices ordered around the cut. */
  vertices: number[];
  /** False means non-manifold/open input interrupted the loop. */
  closed: boolean;
}

export interface SplitByFaceLabelsOptions {
  /** Fill label cut loops with fan-triangulated cap polygons. Default true. */
  cap?: boolean;
  /** Stable internal part-name prefix. Default "part". */
  prefix?: string;
  /** UI labels by raw face label. */
  displayLabels?: Record<string, string>;
  /** Optional part colors by raw face label. */
  colors?: Record<string, [number, number, number]>;
  /** Drop very small regions. Default 1 triangle. */
  minTriangles?: number;
}

export type SemanticSplitPreset = "upright-character" | "quadruped";

export interface CoarseSemanticFaceLabelOptions {
  /**
   * Deterministic first-pass geometry classifier. It assumes Y-up assets.
   * Use external face labels from VLM/SAM for production-quality semantics.
   */
  preset?: SemanticSplitPreset;
  prompt?: string;
}

export interface ConnectedComponentFaceLabelOptions {
  /** Stable label prefix. Default "component". */
  prefix?: string;
  /** Merge duplicate seam vertices by position. Default 1e-6. Use 0 for strict topology. */
  positionTolerance?: number;
}

export interface SemanticSplitMeshOptions extends SplitByFaceLabelsOptions, CoarseSemanticFaceLabelOptions {
  /** Optional precomputed per-face labels. If omitted, connected components are used unless preset is set. */
  faceLabels?: ReadonlyArray<FaceLabel>;
  /** Merge duplicate seam vertices when doing default component split. Default 1e-6. */
  positionTolerance?: number;
}

interface EdgeOwner {
  face: number;
  label: string;
  from: number;
  to: number;
}

interface DirectedEdge {
  from: number;
  to: number;
}

const COMMON_LABELS: Record<string, string> = {
  body: "身体",
  torso: "躯干",
  head: "头部",
  neck: "颈部",
  left_arm: "左臂",
  right_arm: "右臂",
  left_leg: "左腿",
  right_leg: "右腿",
  left_front_leg: "左前腿",
  right_front_leg: "右前腿",
  left_back_leg: "左后腿",
  right_back_leg: "右后腿",
  tail: "尾部",
};

function validateFaceLabels(mesh: Mesh, labels: ReadonlyArray<FaceLabel>): string[] {
  const tris = triangleCount(mesh);
  if (labels.length !== tris) {
    throw new Error(`faceLabels length ${labels.length} != triangle count ${tris}`);
  }
  return labels.map((label) => String(label));
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}/${b}` : `${b}/${a}`;
}

function pointKey(p: Vec3, tolerance: number): string {
  const inv = 1 / tolerance;
  return `${Math.round(p.x * inv)},${Math.round(p.y * inv)},${Math.round(p.z * inv)}`;
}

function orderedLabels(labels: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of labels) {
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

function buildEdgeOwners(mesh: Mesh, labels: ReadonlyArray<string>): Map<string, EdgeOwner[]> {
  const owners = new Map<string, EdgeOwner[]>();
  for (let f = 0; f < labels.length; f++) {
    const a = mesh.indices[f * 3]!;
    const b = mesh.indices[f * 3 + 1]!;
    const c = mesh.indices[f * 3 + 2]!;
    for (const [from, to] of [[a, b], [b, c], [c, a]] as const) {
      const key = edgeKey(from, to);
      const list = owners.get(key);
      const item: EdgeOwner = { face: f, label: labels[f]!, from, to };
      if (list) list.push(item);
      else owners.set(key, [item]);
    }
  }
  return owners;
}

function boundaryEdgesByLabel(mesh: Mesh, labels: ReadonlyArray<string>): Map<string, DirectedEdge[]> {
  const owners = buildEdgeOwners(mesh, labels);
  const out = new Map<string, DirectedEdge[]>();
  for (let f = 0; f < labels.length; f++) {
    const label = labels[f]!;
    const a = mesh.indices[f * 3]!;
    const b = mesh.indices[f * 3 + 1]!;
    const c = mesh.indices[f * 3 + 2]!;
    for (const [from, to] of [[a, b], [b, c], [c, a]] as const) {
      const edgeOwners = owners.get(edgeKey(from, to)) ?? [];
      const crossesLabel = edgeOwners.length > 1 && edgeOwners.some((item) => item.label !== label);
      if (!crossesLabel) continue;
      const list = out.get(label);
      const edge: DirectedEdge = { from, to };
      if (list) list.push(edge);
      else out.set(label, [edge]);
    }
  }
  return out;
}

function loopsFromDirectedEdges(edges: ReadonlyArray<DirectedEdge>): Array<{ vertices: number[]; closed: boolean }> {
  const remaining = new Set<number>();
  const fromMap = new Map<number, number[]>();
  for (let i = 0; i < edges.length; i++) {
    remaining.add(i);
    const edge = edges[i]!;
    const list = fromMap.get(edge.from);
    if (list) list.push(i);
    else fromMap.set(edge.from, [i]);
  }
  for (const list of fromMap.values()) list.sort((a, b) => a - b);

  const loops: Array<{ vertices: number[]; closed: boolean }> = [];
  while (remaining.size > 0) {
    const startEdgeIndex = Math.min(...remaining);
    const start = edges[startEdgeIndex]!;
    const vertices = [start.from, start.to];
    remaining.delete(startEdgeIndex);

    let current = start.to;
    let closed = current === start.from;
    while (!closed) {
      const candidates = fromMap.get(current) ?? [];
      const nextIndex = candidates.find((idx) => remaining.has(idx));
      if (nextIndex === undefined) break;
      const next = edges[nextIndex]!;
      remaining.delete(nextIndex);
      current = next.to;
      vertices.push(current);
      closed = current === start.from;
    }

    if (closed) vertices.pop();
    loops.push({ vertices, closed });
  }
  return loops;
}

export function boundaryLoopsForFaceLabels(
  mesh: Mesh,
  faceLabels: ReadonlyArray<FaceLabel>,
  targetLabel?: FaceLabel,
): FaceLabelBoundaryLoop[] {
  const labels = validateFaceLabels(mesh, faceLabels);
  const target = targetLabel === undefined ? undefined : String(targetLabel);
  const edges = boundaryEdgesByLabel(mesh, labels);
  const out: FaceLabelBoundaryLoop[] = [];
  for (const label of orderedLabels(labels)) {
    if (target !== undefined && label !== target) continue;
    for (const loop of loopsFromDirectedEdges(edges.get(label) ?? [])) {
      if (loop.vertices.length < 2) continue;
      out.push({ label, vertices: loop.vertices, closed: loop.closed });
    }
  }
  return out;
}

function sanitizeName(label: string): string {
  const cleaned = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "region";
}

function uniqueName(base: string, used: Map<string, number>): string {
  const count = used.get(base) ?? 0;
  used.set(base, count + 1);
  return count === 0 ? base : `${base}_${count + 1}`;
}

function displayLabelFor(label: string, options: SplitByFaceLabelsOptions): string {
  const explicit = options.displayLabels?.[label];
  if (explicit) return explicit;
  const normalized = sanitizeName(label);
  const common = COMMON_LABELS[normalized];
  if (common) return common;
  const componentMatch = normalized.match(/^(?:component|region|part)_?(\d+)$/);
  if (componentMatch) return `部件 ${componentMatch[1]}`;
  return label;
}

function averageUv(uvs: ReadonlyArray<Vec2>, vertices: ReadonlyArray<number>): Vec2 {
  let x = 0;
  let y = 0;
  for (const v of vertices) {
    const uv = uvs[v] ?? { x: 0, y: 0 };
    x += uv.x;
    y += uv.y;
  }
  const inv = vertices.length > 0 ? 1 / vertices.length : 1;
  return { x: x * inv, y: y * inv };
}

function newellNormal(positions: ReadonlyArray<Vec3>, loop: ReadonlyArray<number>): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = positions[loop[i]!]!;
    const b = positions[loop[(i + 1) % loop.length]!]!;
    x += (a.y - b.y) * (a.z + b.z);
    y += (a.z - b.z) * (a.x + b.x);
    z += (a.x - b.x) * (a.y + b.y);
  }
  const n = vec3(x, y, z);
  return length(n) > 1e-9 ? normalize(n) : vec3(0, 1, 0);
}

function capLoops(
  positions: Vec3[],
  normals: Vec3[],
  uvs: Vec2[],
  indices: number[],
  loops: ReadonlyArray<ReadonlyArray<number>>,
): number {
  let capTriangles = 0;
  for (const rawLoop of loops) {
    const loop = [...new Set(rawLoop)];
    if (loop.length < 3) continue;
    let center = vec3(0, 0, 0);
    for (const v of loop) center = add(center, positions[v]!);
    center = scale(center, 1 / loop.length);
    const centerIndex = positions.length;
    positions.push(center);
    normals.push(newellNormal(positions, loop));
    uvs.push(averageUv(uvs, loop));
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!;
      const b = loop[(i + 1) % loop.length]!;
      indices.push(centerIndex, b, a);
      capTriangles++;
    }
  }
  return capTriangles;
}

export function splitByFaceLabels(
  mesh: Mesh,
  faceLabels: ReadonlyArray<FaceLabel>,
  options: SplitByFaceLabelsOptions = {},
): NamedPart[] {
  const labels = validateFaceLabels(mesh, faceLabels);
  const cap = options.cap ?? true;
  const prefix = options.prefix ?? "part";
  const minTriangles = Math.max(1, Math.floor(options.minTriangles ?? 1));
  const boundaryEdges = boundaryEdgesByLabel(mesh, labels);
  const usedNames = new Map<string, number>();
  const parts: NamedPart[] = [];

  for (const label of orderedLabels(labels)) {
    const positions: Vec3[] = [];
    const normals: Vec3[] = [];
    const uvs: Vec2[] = [];
    const indices: number[] = [];
    const remap = new Map<number, number>();
    let sourceTriangles = 0;

    const addVertex = (oldIndex: number): number => {
      const cached = remap.get(oldIndex);
      if (cached !== undefined) return cached;
      const next = positions.length;
      remap.set(oldIndex, next);
      positions.push(mesh.positions[oldIndex]!);
      normals.push(mesh.normals[oldIndex] ?? vec3(0, 1, 0));
      uvs.push(mesh.uvs[oldIndex] ?? { x: 0, y: 0 });
      return next;
    };

    for (let f = 0; f < labels.length; f++) {
      if (labels[f] !== label) continue;
      sourceTriangles++;
      indices.push(
        addVertex(mesh.indices[f * 3]!),
        addVertex(mesh.indices[f * 3 + 1]!),
        addVertex(mesh.indices[f * 3 + 2]!),
      );
    }

    if (sourceTriangles < minTriangles) continue;

    let capTriangles = 0;
    let capLoopsCount = 0;
    if (cap) {
      const loops = loopsFromDirectedEdges(boundaryEdges.get(label) ?? [])
        .filter((loop) => loop.closed && loop.vertices.length >= 3)
        .map((loop) => loop.vertices.map((oldIndex) => remap.get(oldIndex)!));
      capLoopsCount = loops.length;
      capTriangles = capLoops(positions, normals, uvs, indices, loops);
    }

    const name = uniqueName(`${prefix}_${sanitizeName(label)}`, usedNames);
    const part: NamedPart = {
      name,
      label: displayLabelFor(label, options),
      mesh: recomputeNormals(makeMesh({ positions, normals, uvs, indices })),
      metadata: {
        source: "faceLabels",
        faceLabel: label,
        sourceTriangles,
        capLoops: capLoopsCount,
        capTriangles,
      },
    };
    const color = options.colors?.[label];
    if (color) part.color = color;
    parts.push(part);
  }

  return parts;
}

function faceCenter(mesh: Mesh, face: number): Vec3 {
  const a = mesh.positions[mesh.indices[face * 3]!]!;
  const b = mesh.positions[mesh.indices[face * 3 + 1]!]!;
  const c = mesh.positions[mesh.indices[face * 3 + 2]!]!;
  return scale(add(add(a, b), c), 1 / 3);
}

function relCoord(value: number, min: number, max: number): number {
  const span = max - min;
  return span > 1e-9 ? (value - min) / span : 0.5;
}

export function connectedComponentFaceLabels(
  mesh: Mesh,
  options: ConnectedComponentFaceLabelOptions = {},
): string[] {
  const tris = triangleCount(mesh);
  if (tris === 0) return [];
  const parent = Array.from({ length: tris }, (_, i) => i);
  const find = (x0: number): number => {
    let x = x0;
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  const union = (a0: number, b0: number): void => {
    const a = find(a0);
    const b = find(b0);
    if (a !== b) parent[b] = a;
  };

  const firstFaceByVertex = new Map<number, number>();
  for (let f = 0; f < tris; f++) {
    for (let j = 0; j < 3; j++) {
      const v = mesh.indices[f * 3 + j]!;
      const first = firstFaceByVertex.get(v);
      if (first === undefined) firstFaceByVertex.set(v, f);
      else union(first, f);
    }
  }

  const tolerance = options.positionTolerance ?? 1e-6;
  if (tolerance > 0) {
    const firstFaceByPosition = new Map<string, number>();
    for (let f = 0; f < tris; f++) {
      for (let j = 0; j < 3; j++) {
        const v = mesh.indices[f * 3 + j]!;
        const key = pointKey(mesh.positions[v]!, tolerance);
        const first = firstFaceByPosition.get(key);
        if (first === undefined) firstFaceByPosition.set(key, f);
        else union(first, f);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let f = 0; f < tris; f++) {
    const root = find(f);
    const list = groups.get(root);
    if (list) list.push(f);
    else groups.set(root, [f]);
  }

  const prefix = options.prefix ?? "component";
  const labels = Array.from({ length: tris }, () => "");
  const sorted = [...groups.values()].sort((a, b) => b.length - a.length || a[0]! - b[0]!);
  sorted.forEach((faces, i) => {
    const label = `${prefix}_${i + 1}`;
    for (const face of faces) labels[face] = label;
  });
  return labels;
}

function inferPreset(prompt: string | undefined, preset: SemanticSplitPreset | undefined): SemanticSplitPreset {
  if (preset) return preset;
  const p = (prompt ?? "").toLowerCase();
  if (/(dog|horse|cat|wolf|fox|quadruped|四足|狗|马|猫)/.test(p)) return "quadruped";
  return "upright-character";
}

function uprightCharacterLabel(rx: number, ry: number, rz: number): string {
  const centralX = rx >= 0.34 && rx <= 0.66;
  const centralZ = rz >= 0.25 && rz <= 0.75;
  if (ry > 0.68 && centralX && centralZ) return "head";
  if (rx < 0.28 && ry >= 0.28 && ry <= 0.76) return "left_arm";
  if (rx > 0.72 && ry >= 0.28 && ry <= 0.76) return "right_arm";
  if (rx < 0.46 && ry < 0.34) return "left_leg";
  if (rx > 0.54 && ry < 0.34) return "right_leg";
  return "body";
}

function quadrupedLabel(rx: number, ry: number, rz: number): string {
  if (rz > 0.70 && ry > 0.36) return "head";
  if (rz < 0.16 && ry > 0.34) return "tail";
  if (ry < 0.43 && rx < 0.48 && rz > 0.50) return "left_front_leg";
  if (ry < 0.43 && rx > 0.52 && rz > 0.50) return "right_front_leg";
  if (ry < 0.43 && rx < 0.48 && rz <= 0.50) return "left_back_leg";
  if (ry < 0.43 && rx > 0.52 && rz <= 0.50) return "right_back_leg";
  return "body";
}

/**
 * Coarse Y-up semantic seed labels. This is useful for one-piece teddy/character
 * blockouts and tests; production flows should pass VLM/SAM-derived faceLabels
 * into splitByFaceLabels/semanticSplitMesh.
 */
export function coarseSemanticFaceLabels(
  mesh: Mesh,
  options: CoarseSemanticFaceLabelOptions = {},
): string[] {
  const b = bounds(mesh);
  const preset = inferPreset(options.prompt, options.preset);
  const out: string[] = [];
  for (let f = 0; f < triangleCount(mesh); f++) {
    const c = faceCenter(mesh, f);
    const rx = relCoord(c.x, b.min.x, b.max.x);
    const ry = relCoord(c.y, b.min.y, b.max.y);
    const rz = relCoord(c.z, b.min.z, b.max.z);
    out.push(preset === "quadruped" ? quadrupedLabel(rx, ry, rz) : uprightCharacterLabel(rx, ry, rz));
  }
  return out;
}

/**
 * One-call split. If faceLabels are supplied, it only performs the topological
 * split/cap. Without faceLabels, the default is conservative connected
 * components: actual mesh islands become "部件 1..N". Pass preset explicitly
 * to request coarse human/quadruped seed labels.
 */
export function semanticSplitMesh(mesh: Mesh, options: SemanticSplitMeshOptions = {}): NamedPart[] {
  const componentOptions: ConnectedComponentFaceLabelOptions = { prefix: "component" };
  if (options.positionTolerance !== undefined) componentOptions.positionTolerance = options.positionTolerance;
  const labels = options.faceLabels
    ?? (options.preset
      ? coarseSemanticFaceLabels(mesh, options)
      : connectedComponentFaceLabels(mesh, componentOptions));
  return splitByFaceLabels(mesh, labels, options);
}
