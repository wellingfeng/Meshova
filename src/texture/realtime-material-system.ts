import type { Mesh } from "../geometry/mesh.js";
import { clamp } from "../math/scalar.js";
import { add, cross, dot, length, normalize, scale, sub, vec3, type Vec3 } from "../math/vec3.js";
import { bakeGeometryToTextures, type GeometryTextureBake, type GeometryTextureBakeOptions } from "./geometry-bake.js";
import { compileMaterialGraph, type MaterialGraph, type MaterialGraphNode } from "./material-graph.js";
import { exportOpenPBRMaterial } from "./manufacturing-mechanics.js";
import { makeTexture, type TextureBuffer } from "./buffer.js";
import type { LayeredMaterial } from "./shading-mechanics.js";

export const REALTIME_MATERIAL_CHANNELS = [
  "baseColor", "metallic", "roughness", "normal", "ao", "height", "emission",
  "opacity", "transmission", "anisotropy", "anisotropyRotation", "clearcoat",
  "clearcoatRoughness", "sheen", "sheenColor", "thickness", "subsurface",
  "iridescence", "iridescenceThickness",
] as const;

export type RealtimeMaterialChannel = typeof REALTIME_MATERIAL_CHANNELS[number];

export interface AdvancedGeometryBakeOptions extends GeometryTextureBakeOptions {
  readonly bentNormalSamples?: number;
  readonly rayDistance?: number;
  readonly padding?: number;
}

export interface AdvancedGeometryBakeReport {
  readonly triangles: number;
  readonly coveredPixels: number;
  readonly paddedPixels: number;
  readonly overlapPixels: number;
  readonly rayCount: number;
  readonly meanAo: number;
}

export interface AdvancedGeometryBake extends GeometryTextureBake {
  readonly bentNormal: TextureBuffer;
  readonly report: AdvancedGeometryBakeReport;
}

interface VertexAmbientSample {
  readonly ao: number;
  readonly bentNormal: Vec3;
}

/** UV-space mesh bake with deterministic ray AO, bent normals and island padding. */
export function bakeMeshMaterialInputs(
  mesh: Mesh,
  options: AdvancedGeometryBakeOptions = {},
): AdvancedGeometryBake {
  const width = Math.max(1, Math.floor(options.width ?? 256));
  const height = Math.max(1, Math.floor(options.height ?? width));
  const samples = Math.max(1, Math.floor(options.bentNormalSamples ?? 12));
  const diagonal = meshBoundsDiagonal(mesh);
  const rayDistance = Math.max(1e-6, options.rayDistance ?? diagonal * 0.35);
  const base = bakeGeometryToTextures(mesh, { ...options, width, height });
  const ambient = mesh.positions.map((_, vertex) => sampleVertexAmbient(mesh, vertex, samples, rayDistance));
  const ao = makeTexture(width, height, 1);
  const bentNormal = makeTexture(width, height, 3);
  const hits = new Uint16Array(width * height);
  for (let pixel = 0; pixel < width * height; pixel++) {
    ao.data[pixel] = 1;
    bentNormal.data[pixel * 3] = 0.5;
    bentNormal.data[pixel * 3 + 1] = 0.5;
    bentNormal.data[pixel * 3 + 2] = 1;
  }
  rasterizeVertexAmbient(mesh, ambient, ao, bentNormal, hits);
  const maps = cloneGeometryBake({ ...base, ao });
  const padding = Math.max(0, Math.floor(options.padding ?? 4));
  const paddedPixels = padding > 0 ? dilateGeometryBake(maps, bentNormal, padding) : 0;
  let coveredPixels = 0;
  let overlapPixels = 0;
  let aoTotal = 0;
  for (let pixel = 0; pixel < width * height; pixel++) {
    if (base.coverage.data[pixel]! > 0) {
      coveredPixels++;
      aoTotal += ao.data[pixel]!;
    }
    if (hits[pixel]! > 1) overlapPixels++;
  }
  return {
    ...maps,
    bentNormal,
    report: {
      triangles: mesh.indices.length / 3,
      coveredPixels,
      paddedPixels,
      overlapPixels,
      rayCount: mesh.positions.length * samples,
      meanAo: aoTotal / Math.max(1, coveredPixels),
    },
  };
}

function sampleVertexAmbient(mesh: Mesh, vertex: number, samples: number, maxDistance: number): VertexAmbientSample {
  const normal = normalize(mesh.normals[vertex]!);
  const tangentSeed = Math.abs(normal.y) < 0.9 ? vec3(0, 1, 0) : vec3(1, 0, 0);
  const tangent = normalize(cross(tangentSeed, normal));
  const bitangent = normalize(cross(normal, tangent));
  const origin = add(mesh.positions[vertex]!, scale(normal, Math.max(1e-5, maxDistance * 1e-5)));
  let open = 0;
  let accumulated = vec3(0, 0, 0);
  for (let sampleIndex = 0; sampleIndex < samples; sampleIndex++) {
    const z = (sampleIndex + 0.5) / samples;
    const radius = Math.sqrt(Math.max(0, 1 - z * z));
    const phi = Math.PI * 2 * fract(sampleIndex * 0.61803398875 + vertex * 0.38196601125);
    const direction = normalize(add(
      add(scale(tangent, Math.cos(phi) * radius), scale(bitangent, Math.sin(phi) * radius)),
      scale(normal, z),
    ));
    if (!rayHitsMesh(mesh, origin, direction, maxDistance, vertex)) {
      open++;
      accumulated = add(accumulated, direction);
    }
  }
  return {
    ao: open / samples,
    bentNormal: length(accumulated) > 1e-8 ? normalize(accumulated) : normal,
  };
}

function rayHitsMesh(mesh: Mesh, origin: Vec3, direction: Vec3, maxDistance: number, ignoredVertex: number): boolean {
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const ia = mesh.indices[index]!;
    const ib = mesh.indices[index + 1]!;
    const ic = mesh.indices[index + 2]!;
    if (ia === ignoredVertex || ib === ignoredVertex || ic === ignoredVertex) continue;
    const distance = rayTriangleDistance(origin, direction, mesh.positions[ia]!, mesh.positions[ib]!, mesh.positions[ic]!);
    if (distance > 1e-6 && distance <= maxDistance) return true;
  }
  return false;
}

function rayTriangleDistance(origin: Vec3, direction: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  const edgeA = sub(b, a);
  const edgeB = sub(c, a);
  const perpendicular = cross(direction, edgeB);
  const determinant = dot(edgeA, perpendicular);
  if (Math.abs(determinant) < 1e-9) return Infinity;
  const inverse = 1 / determinant;
  const offset = sub(origin, a);
  const u = dot(offset, perpendicular) * inverse;
  if (u < 0 || u > 1) return Infinity;
  const crossOffset = cross(offset, edgeA);
  const v = dot(direction, crossOffset) * inverse;
  if (v < 0 || u + v > 1) return Infinity;
  return dot(edgeB, crossOffset) * inverse;
}

function rasterizeVertexAmbient(
  mesh: Mesh,
  ambient: readonly VertexAmbientSample[],
  ao: TextureBuffer,
  bentNormal: TextureBuffer,
  hits: Uint16Array,
): void {
  const width = ao.width;
  const height = ao.height;
  for (let triangle = 0; triangle < mesh.indices.length; triangle += 3) {
    const ia = mesh.indices[triangle]!;
    const ib = mesh.indices[triangle + 1]!;
    const ic = mesh.indices[triangle + 2]!;
    const a = uvPixel(mesh.uvs[ia]!, width, height);
    const b = uvPixel(mesh.uvs[ib]!, width, height);
    const c = uvPixel(mesh.uvs[ic]!, width, height);
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
        const pixel = y * width + x;
        const count = hits[pixel]!;
        hits[pixel] = Math.min(65535, count + 1);
        const value = ambient[ia]!.ao * w0 + ambient[ib]!.ao * w1 + ambient[ic]!.ao * w2;
        ao.data[pixel] = count === 0 ? value : (ao.data[pixel]! * count + value) / (count + 1);
        const normal = normalize(add(
          add(scale(ambient[ia]!.bentNormal, w0), scale(ambient[ib]!.bentNormal, w1)),
          scale(ambient[ic]!.bentNormal, w2),
        ));
        const base = pixel * 3;
        const encoded = [normal.x * 0.5 + 0.5, normal.y * 0.5 + 0.5, normal.z * 0.5 + 0.5];
        for (let channel = 0; channel < 3; channel++) {
          bentNormal.data[base + channel] = count === 0
            ? encoded[channel]!
            : (bentNormal.data[base + channel]! * count + encoded[channel]!) / (count + 1);
        }
      }
    }
  }
}

function cloneGeometryBake(bake: GeometryTextureBake): GeometryTextureBake {
  return {
    ...bake,
    height: cloneTexture(bake.height),
    id: cloneTexture(bake.id),
    materialId: cloneTexture(bake.materialId),
    position: cloneTexture(bake.position),
    normal: cloneTexture(bake.normal),
    worldNormal: cloneTexture(bake.worldNormal),
    thickness: cloneTexture(bake.thickness),
    ao: cloneTexture(bake.ao),
    curvature: cloneTexture(bake.curvature),
    coverage: cloneTexture(bake.coverage),
  };
}

function dilateGeometryBake(bake: GeometryTextureBake, bentNormal: TextureBuffer, padding: number): number {
  const maps = [bake.height, bake.id, bake.materialId, bake.position, bake.normal, bake.worldNormal,
    bake.thickness, bake.ao, bake.curvature, bentNormal];
  let mask = Uint8Array.from(bake.coverage.data, (value) => value > 0 ? 1 : 0);
  let padded = 0;
  for (let pass = 0; pass < padding; pass++) {
    const next = mask.slice();
    for (let y = 0; y < bake.coverage.height; y++) {
      for (let x = 0; x < bake.coverage.width; x++) {
        const pixel = y * bake.coverage.width + x;
        if (mask[pixel]) continue;
        const source = nearestCoveredNeighbor(mask, bake.coverage.width, bake.coverage.height, x, y);
        if (source < 0) continue;
        for (const map of maps) copyPixel(map, source, pixel);
        next[pixel] = 1;
        padded++;
      }
    }
    mask = next;
  }
  return padded;
}

function nearestCoveredNeighbor(mask: Uint8Array, width: number, height: number, x: number, y: number): number {
  const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const;
  for (const [dx, dy] of offsets) {
    const px = x + dx;
    const py = y + dy;
    if (px >= 0 && px < width && py >= 0 && py < height && mask[py * width + px]) return py * width + px;
  }
  return -1;
}

function copyPixel(texture: TextureBuffer, source: number, target: number): void {
  for (let channel = 0; channel < texture.channels; channel++) {
    texture.data[target * texture.channels + channel] = texture.data[source * texture.channels + channel]!;
  }
}

function cloneTexture(texture: TextureBuffer): TextureBuffer {
  const output = makeTexture(texture.width, texture.height, texture.channels);
  output.data.set(texture.data);
  return output;
}

function meshBoundsDiagonal(mesh: Mesh): number {
  if (mesh.positions.length === 0) return 1;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const position of mesh.positions) {
    minX = Math.min(minX, position.x); minY = Math.min(minY, position.y); minZ = Math.min(minZ, position.z);
    maxX = Math.max(maxX, position.x); maxY = Math.max(maxY, position.y); maxZ = Math.max(maxZ, position.z);
  }
  return Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) || 1;
}

export interface WgslGraphCompilation {
  readonly wgsl: string;
  readonly cacheKey: string;
  readonly foldedConstants: number;
  readonly inputNames: readonly string[];
  readonly outputNames: readonly string[];
  evaluateCpu(
    inputs: Parameters<ReturnType<typeof compileMaterialGraph>["execute"]>[0],
    options?: Parameters<ReturnType<typeof compileMaterialGraph>["execute"]>[1],
  ): ReturnType<ReturnType<typeof compileMaterialGraph>["execute"]>;
}

const wgslGraphCache = new Map<string, WgslGraphCompilation>();

/** Compile Meshova's typed material DAG to deterministic WGSL with constant folding. */
export function compileMaterialGraphToWgsl(graph: MaterialGraph): WgslGraphCompilation {
  const cacheKey = hashText(stableStringify(graph));
  const cached = wgslGraphCache.get(cacheKey);
  if (cached) return cached;
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const order = graphOrder(nodes, Object.values(graph.outputs));
  const constants = new Map<string, number | readonly [number, number, number]>();
  const expressions = new Map<string, string>();
  const declarations: string[] = [];
  const usedNodeIdentifiers = new Set<string>();
  const inputNodes = order.map((id) => nodes.get(id)!).filter((node) => node.op === "input");
  const inputNames = [...new Set(inputNodes.map((node) => node.name))];
  const inputTypes = new Map<string, "scalar" | "color">();
  for (const node of inputNodes) {
    const existing = inputTypes.get(node.name);
    if (existing && existing !== node.valueType) throw new Error(`material graph input ${node.name} has conflicting types`);
    inputTypes.set(node.name, node.valueType);
  }
  const inputIdentifiers = allocateIdentifiers(inputNames);
  const inputFields = new Map(inputNodes.map((node) => [node.id, inputIdentifiers.get(node.name)!]));
  let foldedConstants = 0;
  for (const id of order) {
    const node = nodes.get(id)!;
    if (node.op === "input") {
      expressions.set(id, `inputs.${inputFields.get(id)!}`);
      continue;
    }
    if (node.op === "constant") {
      constants.set(id, node.value);
      expressions.set(id, wgslLiteral(node.value));
      continue;
    }
    const folded = foldGraphNode(node, constants);
    if (folded !== undefined) {
      constants.set(id, folded);
      expressions.set(id, wgslLiteral(folded));
      foldedConstants++;
      continue;
    }
    const expression = graphNodeExpression(node, expressions);
    const variable = `n_${allocateIdentifier(id, usedNodeIdentifiers)}`;
    declarations.push(`  let ${variable} = ${expression};`);
    expressions.set(id, variable);
  }
  const outputEntries = Object.entries(graph.outputs);
  const outputNames = outputEntries.map(([name]) => name);
  const outputIdentifiers = allocateIdentifiers(outputNames);
  const inputStruct = inputNames.map((name) => `  ${inputIdentifiers.get(name)!}: ${wgslType(inputTypes.get(name)!)},`).join("\n");
  const outputStruct = outputEntries.map(([name, id]) => `  ${outputIdentifiers.get(name)!}: ${wgslType(nodes.get(id)!.valueType)},`).join("\n");
  const resultFields = outputEntries.map(([name, id]) => `    ${outputIdentifiers.get(name)!}: ${expressions.get(id)!},`).join("\n");
  const wgsl = [
    "struct GraphInputs {", inputStruct, "};", "",
    "struct GraphOutputs {", outputStruct, "};", "",
    "fn evaluateMaterialGraph(inputs: GraphInputs) -> GraphOutputs {",
    ...declarations,
    "  return GraphOutputs(", resultFields, "  );", "}",
  ].join("\n");
  const cpu = compileMaterialGraph(graph);
  const compilation: WgslGraphCompilation = {
    wgsl,
    cacheKey,
    foldedConstants,
    inputNames,
    outputNames,
    evaluateCpu: (inputs, options) => cpu.execute(inputs, options),
  };
  wgslGraphCache.set(cacheKey, compilation);
  return compilation;
}

export interface MaterialXWgslCompilation extends WgslGraphCompilation {
  readonly graph: MaterialGraph;
  readonly textureBindings: Readonly<Record<string, string>>;
}

/** Parse the portable MaterialX subset emitted by Meshova and compile it to WGSL. */
export function compileMaterialXToWgsl(document: string): MaterialXWgslCompilation {
  const elements = parseXmlElements(document);
  const nodes: MaterialGraphNode[] = [];
  const textureBindings: Record<string, string> = {};
  const nodeTypes = new Map<string, "scalar" | "color">();
  for (const element of elements) {
    if (element.name === "image") {
      const id = requiredAttribute(element, "name");
      const type = materialXValueType(element.attributes.type);
      const file = element.attributes.file ?? id;
      nodes.push({ id, op: "input", name: file, valueType: type });
      textureBindings[file] = id;
      nodeTypes.set(id, type);
    } else if (element.name === "constant") {
      const id = requiredAttribute(element, "name");
      const type = materialXValueType(element.attributes.type);
      const value = parseMaterialXValue(requiredAttribute(element, "value"), type);
      nodes.push({ id, op: "constant", valueType: type, value });
      nodeTypes.set(id, type);
    } else if (element.name === "add" || element.name === "multiply") {
      const id = requiredAttribute(element, "name");
      const type = materialXValueType(element.attributes.type);
      nodes.push({ id, op: element.name, valueType: type, left: requiredAttribute(element, "in1"), right: requiredAttribute(element, "in2") });
      nodeTypes.set(id, type);
    }
  }
  const outputs: Record<string, string> = {};
  let inlineIndex = 0;
  for (const element of elements.filter((entry) => entry.name === "input" && entry.parent === "standard_surface")) {
    const name = element.attributes.name;
    if (!name) continue;
    const referenced = element.attributes.nodename;
    if (referenced && nodeTypes.has(referenced)) {
      outputs[name] = referenced;
      continue;
    }
    if (element.attributes.value !== undefined) {
      const type = materialXValueType(element.attributes.type);
      const id = `inline_${inlineIndex++}_${safeIdentifier(name)}`;
      nodes.push({ id, op: "constant", valueType: type, value: parseMaterialXValue(element.attributes.value, type) });
      nodeTypes.set(id, type);
      outputs[name] = id;
    }
  }
  if (Object.keys(outputs).length === 0) throw new Error("MaterialX document has no standard_surface inputs");
  const graph: MaterialGraph = { nodes, outputs };
  return { ...compileMaterialGraphToWgsl(graph), graph, textureBindings };
}

interface XmlElement {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly parent?: string;
}

function parseXmlElements(document: string): XmlElement[] {
  const output: XmlElement[] = [];
  const stack: string[] = [];
  const tokenPattern = /<\s*(\/)?\s*([\w:-]+)([^>]*)>/g;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(document))) {
    const closing = Boolean(match[1]);
    const name = match[2]!;
    const tail = match[3] ?? "";
    if (closing) {
      if (stack.at(-1) === name) stack.pop();
      continue;
    }
    const selfClosing = /\/\s*$/.test(tail);
    const attributes: Record<string, string> = {};
    const attributePattern = /([\w:-]+)\s*=\s*(["'])(.*?)\2/g;
    let attribute: RegExpExecArray | null;
    while ((attribute = attributePattern.exec(tail))) attributes[attribute[1]!] = decodeXml(attribute[3]!);
    output.push({ name, attributes, ...(stack.length ? { parent: stack.at(-1)! } : {}) });
    if (!selfClosing && name !== "input" && name !== "image" && name !== "constant" && name !== "add" && name !== "multiply") stack.push(name);
  }
  return output;
}

function requiredAttribute(element: XmlElement, name: string): string {
  const value = element.attributes[name];
  if (value === undefined) throw new Error(`MaterialX ${element.name} missing ${name}`);
  return value;
}

function materialXValueType(type: string | undefined): "scalar" | "color" {
  return type === "color3" || type === "vector3" ? "color" : "scalar";
}

function parseMaterialXValue(value: string, type: "scalar" | "color"): number | readonly [number, number, number] {
  const values = value.split(/[\s,]+/).filter(Boolean).map(Number);
  if (values.some((entry) => !Number.isFinite(entry))) throw new Error(`invalid MaterialX value: ${value}`);
  if (type === "scalar") return values[0] ?? 0;
  return [values[0] ?? 0, values[1] ?? values[0] ?? 0, values[2] ?? values[0] ?? 0];
}

function decodeXml(value: string): string {
  return value.replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function graphOrder(nodes: ReadonlyMap<string, MaterialGraphNode>, roots: readonly string[]): string[] {
  const order: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error(`material graph cycle at ${id}`);
    if (visited.has(id)) return;
    const node = nodes.get(id);
    if (!node) throw new Error(`material graph references missing node ${id}`);
    visiting.add(id);
    for (const dependency of graphDependencies(node)) visit(dependency);
    visiting.delete(id);
    visited.add(id);
    order.push(id);
  };
  for (const root of roots) visit(root);
  return order;
}

function graphDependencies(node: MaterialGraphNode): string[] {
  if (node.op === "input" || node.op === "constant") return [];
  if (node.op === "clamp") return [node.source];
  if (node.op === "mix") return [node.left, node.right, node.amount];
  return [node.left, node.right];
}

function foldGraphNode(
  node: Exclude<MaterialGraphNode, { readonly op: "input" | "constant" }>,
  constants: ReadonlyMap<string, number | readonly [number, number, number]>,
): number | readonly [number, number, number] | undefined {
  const apply = (value: number | readonly [number, number, number], fn: (entry: number, channel: number) => number) => (
    typeof value === "number" ? fn(value, 0) : value.map(fn) as unknown as readonly [number, number, number]
  );
  if (node.op === "clamp") {
    const source = constants.get(node.source);
    return source === undefined ? undefined : apply(source, (value) => clamp(value, node.minimum, node.maximum));
  }
  if (node.op === "mix") {
    const left = constants.get(node.left);
    const right = constants.get(node.right);
    const amount = constants.get(node.amount);
    if (left === undefined || right === undefined || typeof amount !== "number") return undefined;
    return binaryValue(left, right, (a, b) => a + (b - a) * amount);
  }
  const left = constants.get(node.left);
  const right = constants.get(node.right);
  if (left === undefined || right === undefined) return undefined;
  return binaryValue(left, right, (a, b) => node.op === "add" ? a + b : node.op === "multiply" ? a * b : node.op === "min" ? Math.min(a, b) : Math.max(a, b));
}

function binaryValue(
  left: number | readonly [number, number, number],
  right: number | readonly [number, number, number],
  fn: (left: number, right: number) => number,
): number | readonly [number, number, number] {
  if (typeof left === "number" && typeof right === "number") return fn(left, right);
  const a = typeof left === "number" ? [left, left, left] : left;
  const b = typeof right === "number" ? [right, right, right] : right;
  return [fn(a[0]!, b[0]!), fn(a[1]!, b[1]!), fn(a[2]!, b[2]!)];
}

function graphNodeExpression(node: Exclude<MaterialGraphNode, { readonly op: "input" | "constant" }>, expressions: ReadonlyMap<string, string>): string {
  if (node.op === "clamp") return `clamp(${expressions.get(node.source)!}, ${formatNumber(node.minimum)}, ${formatNumber(node.maximum)})`;
  if (node.op === "mix") return `mix(${expressions.get(node.left)!}, ${expressions.get(node.right)!}, ${expressions.get(node.amount)!})`;
  const fn = node.op === "add" ? "+" : node.op === "multiply" ? "*" : node.op;
  return node.op === "min" || node.op === "max"
    ? `${fn}(${expressions.get(node.left)!}, ${expressions.get(node.right)!})`
    : `(${expressions.get(node.left)!} ${fn} ${expressions.get(node.right)!})`;
}

function wgslType(type: "scalar" | "color"): string {
  return type === "scalar" ? "f32" : "vec3f";
}

function wgslLiteral(value: number | readonly [number, number, number]): string {
  return typeof value === "number" ? formatNumber(value) : `vec3f(${value.map(formatNumber).join(", ")})`;
}

function formatNumber(value: number): string {
  const formatted = Number.isInteger(value) ? `${value}.0` : String(value);
  return formatted === "-0.0" ? "0.0" : formatted;
}

function safeIdentifier(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9_]/g, "_");
  return /^[a-zA-Z_]/.test(sanitized) ? sanitized : `v_${sanitized}`;
}

function allocateIdentifiers(values: readonly string[]): ReadonlyMap<string, string> {
  const output = new Map<string, string>();
  const used = new Set<string>();
  for (const value of values) output.set(value, allocateIdentifier(value, used));
  return output;
}

function allocateIdentifier(value: string, used: Set<string>): string {
  const base = safeIdentifier(value);
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}_${suffix++}`;
  used.add(candidate);
  return candidate;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `wgsl-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export const OPENPBR_REALTIME_WGSL = `
struct OpenPbrPhysical {
  ior: f32,
  attenuationDistance: f32,
  emissiveIntensity: f32,
  worldScale: f32,
};

struct OpenPbrSample {
  baseColor: vec3f,
  normal: vec3f,
  emission: vec3f,
  opacity: f32,
  roughness: f32,
  metallic: f32,
  ao: f32,
  transmission: f32,
  thickness: f32,
};

@group(1) @binding(0) var materialTextures: texture_2d_array<f32>;
@group(1) @binding(1) var materialSampler: sampler;
@group(1) @binding(2) var<uniform> physical: OpenPbrPhysical;

fn materialLayer(layer: i32, uv: vec2f) -> vec4f {
  return textureSample(materialTextures, materialSampler, uv * physical.worldScale, layer);
}

fn sampleOpenPbr(uv: vec2f, viewCosine: f32) -> OpenPbrSample {
  let baseColor = materialLayer(0, uv).rgb;
  let metallic = materialLayer(1, uv).r;
  let roughness = materialLayer(2, uv).r;
  let normalMap = materialLayer(3, uv).rgb * 2.0 - 1.0;
  let ao = materialLayer(4, uv).r;
  let height = materialLayer(5, uv).r;
  let emission = materialLayer(6, uv).rgb;
  let opacity = materialLayer(7, uv).r;
  let transmission = materialLayer(8, uv).r;
  let anisotropy = materialLayer(9, uv).r;
  let anisotropyRotation = materialLayer(10, uv).r * 6.28318530718;
  let clearcoat = materialLayer(11, uv).r;
  let clearcoatRoughness = materialLayer(12, uv).r;
  let sheen = materialLayer(13, uv).r;
  let sheenColor = materialLayer(14, uv).rgb;
  let thickness = materialLayer(15, uv).r;
  let subsurface = materialLayer(16, uv).r;
  let iridescence = materialLayer(17, uv).r;
  let filmThickness = materialLayer(18, uv).r;
  let direction = vec2f(cos(anisotropyRotation), sin(anisotropyRotation));
  let directionalResponse = abs(dot(normalize(direction), normalize(vec2f(0.7071, 0.7071))));
  let effectiveRoughness = clamp(roughness * (1.0 - anisotropy * 0.35 * directionalResponse), 0.025, 1.0);
  let fresnel = pow(1.0 - clamp(viewCosine, 0.0, 1.0), 5.0);
  let film = 0.5 + 0.5 * cos(6.28318530718 * (filmThickness * 5.0 + viewCosine));
  let filmColor = mix(vec3f(0.25, 0.75, 1.0), vec3f(1.0, 0.35, 0.15), film);
  let coatEnergy = clearcoat * (1.0 - clearcoatRoughness) * fresnel;
  let sheenEnergy = sheen * pow(1.0 - viewCosine, 2.0);
  let scatter = subsurface * thickness * (1.0 - viewCosine * 0.5);
  let transmitted = transmission * exp(-thickness / max(physical.attenuationDistance, 0.0001));
  let color = baseColor * (1.0 - metallic * 0.35) * ao;
  color += baseColor * scatter * 0.4;
  color += sheenColor * sheenEnergy;
  color += vec3f(coatEnergy);
  color = mix(color, filmColor * (0.4 + baseColor * 0.6), iridescence * fresnel);
  color = mix(color, baseColor * 0.35, transmitted);
  color += emission * physical.emissiveIntensity;
  let perturbedNormal = normalize(normalMap + vec3f(0.0, 0.0, (height - 0.5) * 0.08));
  return OpenPbrSample(color, perturbedNormal, emission, opacity, effectiveRoughness, metallic, ao, transmission, thickness);
}
`;

export interface ScaleAwareSampling {
  readonly repeats: number;
  readonly texelWorldSize: number;
  readonly lodBias: number;
}

/** Resolve world-size texture repetition while preserving target texel density. */
export function scaleAwareSampling(
  worldSpan: number,
  textureResolution: number,
  texelsPerWorldUnit = 512,
): ScaleAwareSampling {
  if (!(worldSpan > 0) || !Number.isFinite(worldSpan)) throw new Error("worldSpan must be positive");
  if (!Number.isInteger(textureResolution) || textureResolution < 1) throw new Error("textureResolution must be a positive integer");
  if (!(texelsPerWorldUnit > 0)) throw new Error("texelsPerWorldUnit must be positive");
  const repeats = worldSpan * texelsPerWorldUnit / textureResolution;
  return {
    repeats,
    texelWorldSize: 1 / texelsPerWorldUnit,
    lodBias: Math.log2(Math.max(1e-6, repeats)),
  };
}

export interface MeasuredBrdfObservation {
  readonly normalViewCosine: number;
  readonly normalLightCosine: number;
  readonly normalHalfCosine: number;
  readonly rgb: readonly [number, number, number];
  readonly weight?: number;
}

export interface MeasuredOpenPbrParameters {
  readonly roughness: number;
  readonly metallic: number;
  readonly ior: number;
  readonly clearcoat: number;
  readonly sheen: number;
}

export interface MeasuredBrdfFitResult {
  readonly params: MeasuredOpenPbrParameters;
  readonly error: number;
  readonly evaluations: number;
  readonly perSampleError: readonly number[];
}

export function evaluateMeasuredOpenPbr(
  observation: Omit<MeasuredBrdfObservation, "rgb" | "weight">,
  params: MeasuredOpenPbrParameters,
): readonly [number, number, number] {
  const nv = clamp(observation.normalViewCosine, 1e-4, 1);
  const nl = clamp(observation.normalLightCosine, 1e-4, 1);
  const nh = clamp(observation.normalHalfCosine, 1e-4, 1);
  const alpha = Math.max(0.025, params.roughness * params.roughness);
  const alpha2 = alpha * alpha;
  const denominator = nh * nh * (alpha2 - 1) + 1;
  const distribution = alpha2 / Math.max(1e-6, Math.PI * denominator * denominator);
  const geometry = smithGgx(nv, alpha) * smithGgx(nl, alpha);
  const dielectricF0 = Math.pow((params.ior - 1) / (params.ior + 1), 2);
  const viewHalf = clamp((nv + nl) * 0.5, 0, 1);
  const fresnel = dielectricF0 + (1 - dielectricF0) * Math.pow(1 - viewHalf, 5);
  const specular = distribution * geometry * fresnel / Math.max(4 * nv * nl, 1e-5);
  const diffuse = (1 - params.metallic) * nl / Math.PI;
  const coat = params.clearcoat * Math.pow(1 - viewHalf, 5) * (1 - params.roughness * 0.5);
  const sheen = params.sheen * Math.pow(1 - nh, 2) * 0.35;
  const metalTint: readonly [number, number, number] = [0.92, 0.72, 0.48];
  return metalTint.map((tint) => diffuse * (1 - params.metallic * 0.7) + specular * (1 - params.metallic + tint * params.metallic) + coat + sheen) as unknown as readonly [number, number, number];
}

/** Deterministic inverse fit for MERL/SVBRDF-style directional observations. */
export function fitMeasuredBrdf(
  observations: readonly MeasuredBrdfObservation[],
  options: { readonly candidates?: number; readonly refinementPasses?: number } = {},
): MeasuredBrdfFitResult {
  if (observations.length === 0) throw new Error("measured BRDF fitting requires observations");
  const bounds = {
    roughness: [0.04, 1], metallic: [0, 1], ior: [1, 2.5], clearcoat: [0, 1], sheen: [0, 1],
  } as const;
  let evaluations = 0;
  const evaluate = (params: MeasuredOpenPbrParameters) => {
    evaluations++;
    const perSampleError = observations.map((observation) => {
      const predicted = evaluateMeasuredOpenPbr(observation, params);
      return (Math.abs(predicted[0] - observation.rgb[0]) + Math.abs(predicted[1] - observation.rgb[1]) + Math.abs(predicted[2] - observation.rgb[2])) / 3;
    });
    const totalWeight = observations.reduce((sum, observation) => sum + (observation.weight ?? 1), 0);
    const error = perSampleError.reduce((sum, value, index) => sum + value * (observations[index]!.weight ?? 1), 0) / Math.max(1e-9, totalWeight);
    return { params, error, perSampleError };
  };
  let best = evaluate({ roughness: 0.52, metallic: 0.5, ior: 1.5, clearcoat: 0.25, sheen: 0.2 });
  const candidates = Math.max(1, Math.floor(options.candidates ?? 384));
  for (let index = 1; index <= candidates; index++) {
    const params: MeasuredOpenPbrParameters = {
      roughness: mixBounds(bounds.roughness, halton(index, 2)),
      metallic: mixBounds(bounds.metallic, halton(index, 3)),
      ior: mixBounds(bounds.ior, halton(index, 5)),
      clearcoat: mixBounds(bounds.clearcoat, halton(index, 7)),
      sheen: mixBounds(bounds.sheen, halton(index, 11)),
    };
    const result = evaluate(params);
    if (result.error < best.error) best = result;
  }
  const keys = Object.keys(bounds) as Array<keyof MeasuredOpenPbrParameters>;
  for (let pass = 0; pass < Math.max(0, Math.floor(options.refinementPasses ?? 5)); pass++) {
    for (const key of keys) {
      const range = bounds[key][1] - bounds[key][0];
      const radius = range * 0.12 * Math.pow(0.45, pass);
      for (const direction of [-1, 1]) {
        const params = { ...best.params, [key]: clamp(best.params[key] + radius * direction, bounds[key][0], bounds[key][1]) };
        const result = evaluate(params);
        if (result.error < best.error) best = result;
      }
    }
  }
  return { ...best, evaluations };
}

export interface RealtimeMaterialBundle {
  readonly files: Readonly<Record<string, Uint8Array>>;
  readonly manifest: {
    readonly schema: "MeshovaRealtimeMaterial";
    readonly version: 1;
    readonly channels: typeof REALTIME_MATERIAL_CHANNELS;
    readonly shader: string;
  };
}

/** Export 19 maps, OpenPBR, MaterialX, WGSL and runtime manifest. */
export function exportRealtimeMaterialBundle(material: LayeredMaterial, baseName = "material"): RealtimeMaterialBundle {
  const portable = exportOpenPBRMaterial(material, baseName);
  const shaderName = `${baseName}.openpbr.wgsl`;
  const manifestName = `${baseName}.realtime.json`;
  const manifest = {
    schema: "MeshovaRealtimeMaterial" as const,
    version: 1 as const,
    channels: REALTIME_MATERIAL_CHANNELS,
    shader: shaderName,
  };
  return {
    files: {
      ...portable.files,
      [shaderName]: encodeUtf8(OPENPBR_REALTIME_WGSL),
      [manifestName]: encodeUtf8(JSON.stringify(manifest, null, 2)),
    },
    manifest,
  };
}

function smithGgx(cosine: number, alpha: number): number {
  const cosine2 = cosine * cosine;
  const tangent2 = Math.max(0, 1 - cosine2) / Math.max(1e-6, cosine2);
  return 2 / (1 + Math.sqrt(1 + alpha * alpha * tangent2));
}

function halton(index: number, base: number): number {
  let fraction = 1;
  let result = 0;
  let value = index;
  while (value > 0) {
    fraction /= base;
    result += fraction * (value % base);
    value = Math.floor(value / base);
  }
  return result;
}

function mixBounds(bounds: readonly [number, number], amount: number): number {
  return bounds[0] + (bounds[1] - bounds[0]) * amount;
}

function encodeUtf8(value: string): Uint8Array {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | code >> 6, 0x80 | code & 0x3f);
    else bytes.push(0xe0 | code >> 12, 0x80 | code >> 6 & 0x3f, 0x80 | code & 0x3f);
  }
  return Uint8Array.from(bytes);
}

function uvPixel(uv: { readonly x: number; readonly y: number }, width: number, height: number): { x: number; y: number } {
  return { x: uv.x * (width - 1), y: (1 - uv.y) * (height - 1) };
}

function edge(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  return (px - ax) * (by - ay) - (py - ay) * (bx - ax);
}

function clampInt(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function fract(value: number): number {
  return value - Math.floor(value);
}
