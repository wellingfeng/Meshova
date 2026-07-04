import type { Vec3 } from "../math/vec3.js";
import type { Vec2 } from "../math/vec2.js";
import {
  add,
  cross,
  dot,
  lerpVec3,
  mul,
  normalize,
  scale as scaleVec3,
  sub,
  vec3,
} from "../math/vec3.js";
import type { Mesh, Bounds } from "./mesh.js";
import { bounds, makeMesh, merge, recomputeNormals } from "./mesh.js";
import type { NamedPart, PartSurfaceRef, PartTextureRef } from "./export.js";

type SemanticAxis = "x" | "y" | "z" | Vec3;
type SemanticPartSelector = string | RegExp | ReadonlyArray<string | RegExp>;
type SemanticPivot = "min" | "center" | "max" | number;

export interface SemanticPart {
  name: string;
  label?: string;
  vertices: ReadonlyArray<number>;
  color?: [number, number, number];
  surface?: PartSurfaceRef;
  textures?: PartTextureRef;
  metadata?: Record<string, unknown>;
}

export interface SemanticMeshModel {
  mesh: Mesh;
  parts: ReadonlyArray<SemanticPart>;
}

export type SemanticDeformMode =
  | "translate"
  | "scale"
  | "stretch"
  | "thicken"
  | "taper"
  | "twist"
  | "bend";

export interface SemanticDeformOp {
  part: SemanticPartSelector;
  mode: SemanticDeformMode;
  axis?: SemanticAxis;
  towards?: SemanticAxis;
  factor?: number;
  vector?: Vec3;
  scale?: number | Vec3;
  startScale?: number;
  endScale?: number;
  angle?: number;
  pivot?: SemanticPivot;
  center?: Vec3;
  curve?: number;
  /** Optional object-space blend distance outside the selected part. */
  falloff?: number;
}

export interface ConnectivitySegmentationOptions {
  tolerance?: number;
  minVertices?: number;
  maxParts?: number;
  prefix?: string;
}

export interface SemanticPartLabel {
  name: string;
  label: string;
  role: string;
  confidence: number;
  source?: "ai" | "explicit" | "source" | "heuristic" | "generic";
}

export type SemanticCategory =
  | "character"
  | "animal"
  | "vehicle"
  | "furniture"
  | "plant"
  | "architecture"
  | "equipment"
  | "food"
  | "prop"
  | "unknown";

export interface SemanticObjectPartLabel {
  name?: string;
  key?: string;
  label?: string;
  role?: string;
  confidence?: number;
}

export interface SemanticObjectAnalysis {
  object?: string;
  category?: SemanticCategory | string;
  confidence?: number;
  partLabels?: Record<string, string>;
  parts?: ReadonlyArray<SemanticObjectPartLabel>;
}

export interface SemanticLabelOptions {
  /**
   * Text hint only. It no longer drives category inference by default because
   * arbitrary words such as "MOCARNA" can contain misleading substrings.
   */
  prompt?: string;
  /** Explicit category from AI/user. Prompt heuristics are off unless requested. */
  category?: SemanticCategory;
  /** Object label from AI/user, used for single-part models. */
  objectLabel?: string;
  /** Explicit UI labels by stable part name. */
  partLabels?: Record<string, string>;
  /** VLM/screenshot analysis result. Preferred source for category + labels. */
  analysis?: SemanticObjectAnalysis;
  /** Legacy deterministic prompt parser. Off by default. */
  enablePromptHeuristics?: boolean;
  /** Ignore existing part.label values unless they came from AI/user metadata. */
  replaceExistingLabels?: boolean;
  /** Minimum AI confidence for using category/object labels. Default 0.45. */
  minAnalysisConfidence?: number;
}

function clonePart(part: SemanticPart): SemanticPart {
  const out: SemanticPart = {
    name: part.name,
    vertices: part.vertices.slice(),
  };
  if (part.label) out.label = part.label;
  if (part.color) out.color = part.color;
  if (part.surface) out.surface = part.surface;
  if (part.textures) out.textures = { ...part.textures };
  if (part.metadata) out.metadata = { ...part.metadata };
  return out;
}

function resolveAxis(axis: SemanticAxis | undefined): Vec3 {
  if (axis === "x") return vec3(1, 0, 0);
  if (axis === "y" || axis === undefined) return vec3(0, 1, 0);
  if (axis === "z") return vec3(0, 0, 1);
  return normalize(axis);
}

function centerOf(b: Bounds): Vec3 {
  return vec3(
    (b.min.x + b.max.x) * 0.5,
    (b.min.y + b.max.y) * 0.5,
    (b.min.z + b.max.z) * 0.5,
  );
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function quantize(p: Vec3, tolerance: number): string {
  const inv = 1 / tolerance;
  return `${Math.round(p.x * inv)},${Math.round(p.y * inv)},${Math.round(p.z * inv)}`;
}

function distanceToBounds(p: Vec3, b: Bounds): number {
  const dx = Math.max(b.min.x - p.x, 0, p.x - b.max.x);
  const dy = Math.max(b.min.y - p.y, 0, p.y - b.max.y);
  const dz = Math.max(b.min.z - p.z, 0, p.z - b.max.z);
  return Math.hypot(dx, dy, dz);
}

function axisRange(mesh: Mesh, vertices: ReadonlyArray<number>, axis: Vec3): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const v of vertices) {
    const p = mesh.positions[v]!;
    const s = dot(p, axis);
    if (s < min) min = s;
    if (s > max) max = s;
  }
  return { min, max };
}

function pivotValue(pivot: SemanticPivot | undefined, min: number, max: number): number {
  if (typeof pivot === "number") return pivot;
  if (pivot === "max") return max;
  if (pivot === "center") return (min + max) * 0.5;
  return min;
}

function basisFromAxis(axis: Vec3): { u: Vec3; v: Vec3 } {
  const ref = Math.abs(axis.y) > 0.9 ? vec3(1, 0, 0) : vec3(0, 1, 0);
  const u = normalize(sub(ref, scaleVec3(axis, dot(ref, axis))));
  return { u, v: normalize(cross(axis, u)) };
}

function partBounds(mesh: Mesh, vertices: ReadonlyArray<number>): Bounds {
  if (vertices.length === 0) return { min: vec3(0, 0, 0), max: vec3(0, 0, 0) };
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const v of vertices) {
    const p = mesh.positions[v]!;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { min: vec3(minX, minY, minZ), max: vec3(maxX, maxY, maxZ) };
}

function matchesSelector(name: string, selector: SemanticPartSelector): boolean {
  if (typeof selector === "string") return name === selector;
  if (selector instanceof RegExp) return selector.test(name);
  return selector.some((s) => matchesSelector(name, s));
}

function selectedParts(model: SemanticMeshModel, selector: SemanticPartSelector): SemanticPart[] {
  return model.parts.filter((part) => matchesSelector(part.name, selector));
}

function validatePartVertices(mesh: Mesh, part: SemanticPart): void {
  for (const v of part.vertices) {
    if (!Number.isInteger(v) || v < 0 || v >= mesh.positions.length) {
      throw new Error(`semantic part ${part.name} references missing vertex ${v}`);
    }
  }
}

export function makeSemanticMeshModel(mesh: Mesh, parts: ReadonlyArray<SemanticPart>): SemanticMeshModel {
  const cloned = parts.map(clonePart);
  for (const part of cloned) validatePartVertices(mesh, part);
  return { mesh, parts: cloned };
}

export function semanticModelFromParts(parts: ReadonlyArray<NamedPart>): SemanticMeshModel {
  const mesh = merge(...parts.map((part) => part.mesh));
  const semanticParts: SemanticPart[] = [];
  let offset = 0;
  for (const part of parts) {
    const semanticPart: SemanticPart = {
      name: part.name,
      vertices: Array.from({ length: part.mesh.positions.length }, (_, i) => offset + i),
    };
    if (part.label) semanticPart.label = part.label;
    if (part.color) semanticPart.color = part.color;
    if (part.surface) semanticPart.surface = part.surface;
    if (part.textures) semanticPart.textures = { ...part.textures };
    if (part.metadata) semanticPart.metadata = { ...part.metadata };
    semanticParts.push(semanticPart);
    offset += part.mesh.positions.length;
  }
  return makeSemanticMeshModel(mesh, semanticParts);
}

export function semanticPartBounds(model: SemanticMeshModel, name: string): Bounds {
  const part = model.parts.find((p) => p.name === name);
  if (!part) throw new Error(`semantic part not found: ${name}`);
  return partBounds(model.mesh, part.vertices);
}

export function semanticModelToNamedParts(model: SemanticMeshModel): NamedPart[] {
  const out: NamedPart[] = [];
  for (const part of model.parts) {
    const vertexSet = new Set(part.vertices);
    const positions: Vec3[] = [];
    const normals: Vec3[] = [];
    const uvs: Vec2[] = [];
    const indices: number[] = [];
    const remap = new Map<number, number>();

    const addVertex = (oldIndex: number): number => {
      const cached = remap.get(oldIndex);
      if (cached !== undefined) return cached;
      const next = positions.length;
      remap.set(oldIndex, next);
      positions.push(model.mesh.positions[oldIndex]!);
      normals.push(model.mesh.normals[oldIndex]!);
      uvs.push(model.mesh.uvs[oldIndex]!);
      return next;
    };

    for (let i = 0; i < model.mesh.indices.length; i += 3) {
      const a = model.mesh.indices[i]!;
      const b = model.mesh.indices[i + 1]!;
      const c = model.mesh.indices[i + 2]!;
      if (!vertexSet.has(a) || !vertexSet.has(b) || !vertexSet.has(c)) continue;
      indices.push(addVertex(a), addVertex(b), addVertex(c));
    }

    const named: NamedPart = {
      name: part.name,
      mesh: makeMesh({ positions, normals, uvs, indices }),
    };
    if (part.label) named.label = part.label;
    if (part.color) named.color = part.color;
    if (part.surface) named.surface = part.surface;
    if (part.textures) named.textures = { ...part.textures };
    if (part.metadata) named.metadata = { ...part.metadata };
    out.push(named);
  }
  return out;
}

export function segmentMeshByConnectivity(
  mesh: Mesh,
  options: ConnectivitySegmentationOptions = {},
): SemanticPart[] {
  const parent = Array.from({ length: mesh.positions.length }, (_, i) => i);
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

  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i]!;
    const b = mesh.indices[i + 1]!;
    const c = mesh.indices[i + 2]!;
    union(a, b);
    union(a, c);
  }

  const tolerance = options.tolerance ?? 1e-6;
  if (tolerance > 0) {
    const byPosition = new Map<string, number>();
    for (let i = 0; i < mesh.positions.length; i++) {
      const key = quantize(mesh.positions[i]!, tolerance);
      const first = byPosition.get(key);
      if (first === undefined) byPosition.set(key, i);
      else union(first, i);
    }
  }

  const components = new Map<number, number[]>();
  for (let i = 0; i < mesh.positions.length; i++) {
    const root = find(i);
    const list = components.get(root);
    if (list) list.push(i);
    else components.set(root, [i]);
  }

  const minVertices = options.minVertices ?? 1;
  const prefix = options.prefix ?? "component";
  return [...components.values()]
    .filter((vertices) => vertices.length >= minVertices)
    .sort((a, b) => b.length - a.length)
    .slice(0, options.maxParts ?? Infinity)
    .map((vertices, i) => ({
      name: `${prefix}_${i}`,
      vertices,
      metadata: { vertexCount: vertices.length },
    }));
}

interface PartMetric {
  part: NamedPart;
  index: number;
  bounds: Bounds;
  center: Vec3;
  size: Vec3;
  rel: Vec3;
  volume: number;
  tris: number;
  longAxis: "x" | "y" | "z";
  slenderness: number;
  flatness: number;
}

function lowerText(text: string | undefined): string {
  return (text ?? "").toLowerCase();
}

const SEMANTIC_CATEGORIES = new Set<string>([
  "character",
  "animal",
  "vehicle",
  "furniture",
  "plant",
  "architecture",
  "equipment",
  "food",
  "prop",
  "unknown",
]);

function normalizeSemanticCategory(value: unknown): SemanticCategory {
  const s = String(value ?? "").trim().toLowerCase();
  return SEMANTIC_CATEGORIES.has(s) ? (s as SemanticCategory) : "unknown";
}

function confidence(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

function hasWord(text: string, words: ReadonlyArray<string>): boolean {
  const ascii = text.replace(/[_-]+/g, " ");
  for (const word of words) {
    if (/^[a-z0-9]+$/i.test(word)) {
      const re = new RegExp(`(^|[^a-z0-9])${word}([^a-z0-9]|$)`, "i");
      if (re.test(ascii)) return true;
    } else if (text.includes(word.toLowerCase())) {
      return true;
    }
  }
  return false;
}

function semanticCategoryFromPrompt(prompt: string | undefined): SemanticCategory {
  const p = lowerText(prompt);
  if (hasWord(p, ["dog", "cat", "puppy", "capybara", "horse", "bear", "fox", "wolf", "bird", "fish", "animal", "creature", "狗", "猫", "马", "熊", "动物"])) return "animal";
  if (hasWord(p, ["person", "man", "woman", "girl", "boy", "hiker", "hero", "knight", "paladin", "character", "chibi", "figurine", "robot", "alien", "orc", "naruto", "人", "角色", "机器人"])) return "character";
  if (hasWord(p, ["car", "truck", "vehicle", "tank", "ship", "plane", "aircraft", "bike", "motorcycle", "train", "汽车", "车辆", "飞机", "坦克", "船"])) return "vehicle";
  if (hasWord(p, ["chair", "sofa", "loveseat", "table", "desk", "cabinet", "bed", "furniture", "椅", "沙发", "桌", "柜", "床", "家具"])) return "furniture";
  if (hasWord(p, ["plant", "tree", "bamboo", "leaf", "leaves", "flower", "grass", "moss", "植物", "树", "叶", "花", "草"])) return "plant";
  if (hasWord(p, ["building", "house", "tower", "castle", "temple", "wall", "door", "window", "architecture", "建筑", "房", "塔", "城堡", "寺庙", "墙", "门", "窗"])) return "architecture";
  if (hasWord(p, ["weapon", "sword", "gun", "gauntlet", "glove", "shield", "armor", "helmet", "武器", "剑", "枪", "手套", "护手", "盾", "盔甲", "头盔"])) return "equipment";
  if (hasWord(p, ["food", "cake", "fruit", "drink", "coffee", "bread", "meat", "食物", "蛋糕", "水果", "饮料", "咖啡", "面包", "肉"])) return "food";
  return "prop";
}

function resolveSemanticCategory(options: SemanticLabelOptions): SemanticCategory {
  const minConfidence = options.minAnalysisConfidence ?? 0.45;
  const analysisCategory = normalizeSemanticCategory(options.analysis?.category);
  if (analysisCategory !== "unknown" && confidence(options.analysis?.confidence, 1) >= minConfidence) {
    return analysisCategory;
  }
  const explicit = normalizeSemanticCategory(options.category);
  if (explicit !== "unknown") return explicit;
  if (options.enablePromptHeuristics) return semanticCategoryFromPrompt(options.prompt);
  return "prop";
}

function resolveObjectLabel(options: SemanticLabelOptions): string | undefined {
  if (options.objectLabel?.trim()) return options.objectLabel.trim();
  const minConfidence = options.minAnalysisConfidence ?? 0.45;
  const object = options.analysis?.object?.trim();
  if (!object || confidence(options.analysis?.confidence, 0) < minConfidence) return undefined;
  if (/^(object|unknown|unknown object|model|mesh)$/i.test(object)) return undefined;
  return object;
}

function metricForPart(part: NamedPart, index: number, modelBounds: Bounds): PartMetric {
  const b = bounds(part.mesh);
  const size = vec3(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
  const center = centerOf(b);
  const modelSize = vec3(
    modelBounds.max.x - modelBounds.min.x || 1,
    modelBounds.max.y - modelBounds.min.y || 1,
    modelBounds.max.z - modelBounds.min.z || 1,
  );
  const rel = vec3(
    (center.x - modelBounds.min.x) / modelSize.x,
    (center.y - modelBounds.min.y) / modelSize.y,
    (center.z - modelBounds.min.z) / modelSize.z,
  );
  const extents: Array<["x" | "y" | "z", number]> = [["x", size.x], ["y", size.y], ["z", size.z]];
  extents.sort((a, b2) => b2[1] - a[1]);
  const longAxis = extents[0]![0];
  const longest = extents[0]![1] || 1;
  const middle = extents[1]![1] || 1;
  const shortest = extents[2]![1] || 1;
  return {
    part,
    index,
    bounds: b,
    center,
    size,
    rel,
    volume: Math.max(1e-9, size.x * size.y * size.z),
    tris: part.mesh.indices.length / 3,
    longAxis,
    slenderness: longest / Math.max(1e-6, middle),
    flatness: middle / Math.max(1e-6, shortest),
  };
}

function sideLabel(m: PartMetric): string {
  if (m.rel.x < 0.42) return "左侧";
  if (m.rel.x > 0.58) return "右侧";
  if (m.rel.z < 0.38) return "前部";
  if (m.rel.z > 0.62) return "后部";
  return "";
}

function labelForMetric(m: PartMetric, largest: PartMetric, category: SemanticCategory): { label: string; role: string; confidence: number } {
  const side = sideLabel(m);
  const isLargest = m.part.name === largest.part.name;
  const high = m.rel.y > 0.68;
  const low = m.rel.y < 0.24;
  const centralX = m.rel.x >= 0.35 && m.rel.x <= 0.65;
  const centralZ = m.rel.z >= 0.32 && m.rel.z <= 0.68;
  const slender = m.slenderness > 2.2;
  const flat = m.flatness > 3.0;

  if (category === "character" || category === "animal") {
    if (low && (flat || isLargest)) return { label: "底座", role: "base", confidence: 0.8 };
    if (high && centralX && centralZ && !isLargest) return { label: "头部", role: "head", confidence: 0.72 };
    if (isLargest) return { label: category === "animal" ? "身体" : "躯干", role: "body", confidence: 0.72 };
    if (slender && side) return { label: `${side}${low ? "腿部" : "手臂"}`, role: low ? "leg" : "arm", confidence: 0.62 };
    if (high) return { label: "头部细节", role: "headDetail", confidence: 0.52 };
  }

  if (category === "vehicle") {
    if (isLargest) return { label: "车身", role: "body", confidence: 0.72 };
    if (low) return { label: side ? `${side}轮组` : "底盘/轮组", role: "wheelOrChassis", confidence: 0.56 };
    if (high) return { label: "顶部结构", role: "top", confidence: 0.52 };
  }

  if (category === "furniture") {
    if (isLargest) return { label: "主体/坐垫", role: "body", confidence: 0.68 };
    if (high && m.longAxis !== "y") return { label: "靠背/顶部", role: "back", confidence: 0.56 };
    if (low && slender) return { label: side ? `${side}支撑腿` : "支撑腿", role: "leg", confidence: 0.56 };
  }

  if (category === "plant") {
    if (slender && m.longAxis === "y") return { label: "茎干", role: "stem", confidence: 0.64 };
    if (high || flat) return { label: "叶片/树冠", role: "foliage", confidence: 0.56 };
    if (isLargest) return { label: "主体植株", role: "body", confidence: 0.54 };
  }

  if (category === "architecture") {
    if (isLargest) return { label: "主体结构", role: "body", confidence: 0.66 };
    if (high) return { label: "顶部结构", role: "top", confidence: 0.54 };
    if (low) return { label: "基座/底部", role: "base", confidence: 0.54 };
    if (flat) return { label: "墙面/板件", role: "panel", confidence: 0.5 };
  }

  if (category === "equipment") {
    if (isLargest) return { label: "主体装备", role: "body", confidence: 0.62 };
    if (high) return { label: "顶部部件", role: "top", confidence: 0.52 };
    if (side) return { label: `${side}部件`, role: "sidePart", confidence: 0.48 };
    return { label: "装备细节", role: "detail", confidence: 0.46 };
  }

  if (category === "food") {
    if (isLargest) return { label: "主体食物", role: "body", confidence: 0.6 };
    if (high) return { label: "顶部装饰", role: "top", confidence: 0.5 };
    return { label: "食物细节", role: "detail", confidence: 0.46 };
  }

  if (isLargest) return { label: "主体", role: "body", confidence: 0.62 };
  if (low && flat) return { label: "底座", role: "base", confidence: 0.58 };
  if (high) return { label: "顶部部件", role: "top", confidence: 0.52 };
  if (slender) return { label: side ? `${side}细长件` : "细长件", role: "limbOrRod", confidence: 0.48 };
  if (side) return { label: `${side}部件`, role: "sidePart", confidence: 0.46 };
  return { label: `细节部件`, role: "detail", confidence: 0.42 };
}

function uniquifyLabels(labels: SemanticPartLabel[]): SemanticPartLabel[] {
  const total = new Map<string, number>();
  for (const item of labels) total.set(item.label, (total.get(item.label) ?? 0) + 1);
  const seen = new Map<string, number>();
  return labels.map((item) => {
    const count = total.get(item.label) ?? 1;
    if (count <= 1) return item;
    const next = (seen.get(item.label) ?? 0) + 1;
    seen.set(item.label, next);
    return { ...item, label: `${item.label}${next}` };
  });
}

function optionLabelSource(options: SemanticLabelOptions): NonNullable<SemanticPartLabel["source"]> {
  if (options.analysis) return "ai";
  if (options.category || options.objectLabel || options.partLabels) return "explicit";
  if (options.enablePromptHeuristics) return "heuristic";
  return "generic";
}

function partLabelFromAnalysis(part: NamedPart, index: number, options: SemanticLabelOptions): SemanticPartLabel | undefined {
  const direct = options.partLabels?.[part.name] ?? options.analysis?.partLabels?.[part.name];
  const source = optionLabelSource(options);
  if (direct?.trim()) {
    return { name: part.name, label: direct.trim(), role: "ai", confidence: 1, source };
  }

  const items = options.analysis?.parts ?? [];
  const byName = items.find((item) => item.name === part.name || item.key === part.name);
  const fallback = items.length === 1 && index === 0 ? items[0] : undefined;
  const item = byName ?? fallback;
  const label = item?.label?.trim();
  if (!label) return undefined;
  return {
    name: part.name,
    label,
    role: item?.role ?? "ai",
    confidence: confidence(item?.confidence, confidence(options.analysis?.confidence, 0.8)),
    source,
  };
}

/**
 * Infer UI-facing semantic labels for raw OBJ parts such as root.0/root.1.
 *
 * Default behavior is conservative: no prompt-based category guessing. Pass
 * VLM/user `analysis`, `category`, or `partLabels` for semantic labels.
 */
export function inferSemanticPartLabels(
  parts: ReadonlyArray<NamedPart>,
  options: SemanticLabelOptions = {},
): SemanticPartLabel[] {
  if (parts.length === 0) return [];
  const modelBounds = bounds(merge(...parts.map((part) => part.mesh)));
  const metrics = parts.map((part, index) => metricForPart(part, index, modelBounds));
  const largest = metrics.reduce((best, item) => (
    item.tris > best.tris || (item.tris === best.tris && item.volume > best.volume) ? item : best
  ), metrics[0]!);
  const category = resolveSemanticCategory(options);
  const objectLabel = resolveObjectLabel(options);
  const source = optionLabelSource(options);
  const labels = metrics.map((metric): SemanticPartLabel => {
    const explicitLabel = partLabelFromAnalysis(metric.part, metric.index, options);
    if (explicitLabel) return explicitLabel;
    if (objectLabel && parts.length === 1) {
      return {
        name: metric.part.name,
        label: objectLabel,
        role: "object",
        confidence: confidence(options.analysis?.confidence, 1),
        source,
      };
    }
    if (metric.part.label && !options.replaceExistingLabels) {
      return {
        name: metric.part.name,
        label: metric.part.label,
        role: String(metric.part.metadata?.role ?? "source"),
        confidence: 1,
        source: "source",
      };
    }
    const inferred = labelForMetric(metric, largest, category);
    return {
      name: metric.part.name,
      ...inferred,
      source,
    };
  });
  return uniquifyLabels(labels);
}

export function withInferredSemanticPartLabels(
  parts: ReadonlyArray<NamedPart>,
  options: SemanticLabelOptions = {},
): NamedPart[] {
  const labels = inferSemanticPartLabels(parts, options);
  const byName = new Map(labels.map((item) => [item.name, item]));
  return parts.map((part) => {
    const item = byName.get(part.name);
    if (!item) return { ...part };
    return {
      ...part,
      label: item.label,
      metadata: {
        ...(part.metadata ?? {}),
        role: item.role,
        labelConfidence: item.confidence,
        labelSource: item.source ?? "generic",
      },
    };
  });
}

function deformPosition(p: Vec3, op: SemanticDeformOp, b: Bounds, range: { min: number; max: number }): Vec3 {
  const axis = resolveAxis(op.axis);
  const span = range.max - range.min || 1;
  const center = op.center ?? centerOf(b);
  const rel = sub(p, center);

  if (op.mode === "translate") {
    const vector = op.vector ?? scaleVec3(axis, op.factor ?? 0);
    return add(p, vector);
  }

  if (op.mode === "scale") {
    const raw = op.scale ?? op.factor ?? 1;
    const factors = typeof raw === "number" ? vec3(raw, raw, raw) : raw;
    return add(center, mul(rel, factors));
  }

  if (op.mode === "stretch") {
    const factor = op.factor ?? 1;
    const pivot = pivotValue(op.pivot, range.min, range.max);
    const s = dot(p, axis);
    const perp = sub(p, scaleVec3(axis, s));
    return add(perp, scaleVec3(axis, pivot + (s - pivot) * factor));
  }

  if (op.mode === "thicken") {
    const factor = op.factor ?? 1;
    const s = dot(rel, axis);
    const perp = sub(rel, scaleVec3(axis, s));
    return add(center, add(scaleVec3(axis, s), scaleVec3(perp, factor)));
  }

  if (op.mode === "taper") {
    const startScale = op.startScale ?? 1;
    const endScale = op.endScale ?? op.factor ?? 0.5;
    const curve = op.curve ?? 1;
    const s = dot(p, axis);
    const t0 = Math.max(0, Math.min(1, (s - range.min) / span));
    const t = curve === 1 ? t0 : Math.pow(t0, curve);
    const factor = startScale + (endScale - startScale) * t;
    const sRel = dot(rel, axis);
    const perp = sub(rel, scaleVec3(axis, sRel));
    return add(center, add(scaleVec3(axis, sRel), scaleVec3(perp, factor)));
  }

  if (op.mode === "twist") {
    const angle = op.angle ?? Math.PI / 2;
    const { u, v } = basisFromAxis(axis);
    const t = Math.max(0, Math.min(1, (dot(p, axis) - range.min) / span));
    const a = angle * t;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const s = dot(rel, axis);
    const cu = dot(rel, u);
    const cv = dot(rel, v);
    const ru = cu * cos - cv * sin;
    const rv = cu * sin + cv * cos;
    return add(center, add(scaleVec3(axis, s), add(scaleVec3(u, ru), scaleVec3(v, rv))));
  }

  const angle = op.angle ?? Math.PI / 4;
  if (Math.abs(angle) < 1e-6) return p;
  const towards = resolveAxis(op.towards ?? "z");
  const bendDir = normalize(sub(towards, scaleVec3(axis, dot(towards, axis))));
  const originS = dot(center, axis);
  const relMin = range.min - originS;
  const sGlobal = dot(p, axis);
  const sRel = dot(rel, axis);
  const d = dot(rel, bendDir);
  const planar = add(scaleVec3(axis, sRel), scaleVec3(bendDir, d));
  const residual = sub(rel, planar);
  const t = Math.max(0, Math.min(1, (sGlobal - range.min) / span));
  const theta = angle * t;
  const radius = span / angle;
  const r = radius - d;
  const along = Math.sin(theta) * r;
  const off = radius - Math.cos(theta) * r;
  return add(center, add(residual, add(scaleVec3(axis, relMin + along), scaleVec3(bendDir, off))));
}

function deformOnePart(mesh: Mesh, part: SemanticPart, op: SemanticDeformOp): Mesh {
  if (part.vertices.length === 0) return mesh;
  const selected = new Set(part.vertices);
  const b = partBounds(mesh, part.vertices);
  const axis = resolveAxis(op.axis);
  const range = axisRange(mesh, part.vertices, axis);
  const falloff = Math.max(0, op.falloff ?? 0);

  const positions = mesh.positions.map((p, i) => {
    let weight = selected.has(i) ? 1 : 0;
    if (weight === 0 && falloff > 0) {
      const d = distanceToBounds(p, b);
      weight = d >= falloff ? 0 : smoothstep(falloff, 0, d);
    }
    if (weight <= 0) return p;
    const deformed = deformPosition(p, op, b, range);
    return weight >= 1 ? deformed : lerpVec3(p, deformed, weight);
  });

  return recomputeNormals(makeMesh({
    positions,
    normals: mesh.normals.slice(),
    uvs: mesh.uvs.slice(),
    indices: mesh.indices.slice(),
  }));
}

export function deformSemanticMesh(
  model: SemanticMeshModel,
  operations: ReadonlyArray<SemanticDeformOp>,
): SemanticMeshModel {
  let mesh = model.mesh;
  const parts = model.parts.map(clonePart);
  for (const op of operations) {
    const targets = selectedParts({ mesh, parts }, op.part);
    if (targets.length === 0) throw new Error(`semantic part selector matched nothing`);
    for (const part of targets) {
      mesh = deformOnePart(mesh, part, op);
    }
  }
  return { mesh, parts };
}

export function semanticWholeMesh(mesh: Mesh, name = "mesh"): SemanticMeshModel {
  return makeSemanticMeshModel(mesh, [{
    name,
    vertices: Array.from({ length: mesh.positions.length }, (_, i) => i),
  }]);
}

export function semanticModelBounds(model: SemanticMeshModel): Bounds {
  return bounds(model.mesh);
}
