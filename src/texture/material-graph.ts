import { makeTexture, type TextureBuffer } from "./buffer.js";

export type MaterialGraphValueType = "scalar" | "color";

interface GraphNodeBase {
  readonly id: string;
  readonly valueType: MaterialGraphValueType;
}

export type MaterialGraphNode =
  | (GraphNodeBase & { readonly op: "input"; readonly name: string })
  | (GraphNodeBase & { readonly op: "constant"; readonly value: number | readonly [number, number, number] })
  | (GraphNodeBase & { readonly op: "add" | "multiply" | "min" | "max"; readonly left: string; readonly right: string })
  | (GraphNodeBase & { readonly op: "clamp"; readonly source: string; readonly minimum: number; readonly maximum: number })
  | (GraphNodeBase & { readonly op: "mix"; readonly left: string; readonly right: string; readonly amount: string });

export interface MaterialGraph {
  readonly nodes: readonly MaterialGraphNode[];
  readonly outputs: Readonly<Record<string, string>>;
}

export interface MaterialGraphInput {
  readonly texture: TextureBuffer;
  /** Increment when mutating a reused texture object. */
  readonly revision?: string | number;
}

export interface MaterialGraphState {
  readonly values: ReadonlyMap<string, TextureBuffer>;
  readonly revisions: ReadonlyMap<string, string>;
}

export interface MaterialGraphExecution {
  readonly outputs: Readonly<Record<string, TextureBuffer>>;
  readonly state: MaterialGraphState;
  readonly evaluatedNodes: number;
  readonly reusedNodes: number;
}

export interface CompiledMaterialGraph {
  readonly order: readonly string[];
  readonly commonSubexpressions: number;
  execute(
    inputs: Readonly<Record<string, MaterialGraphInput>>,
    options?: { readonly width?: number; readonly height?: number; readonly previous?: MaterialGraphState },
  ): MaterialGraphExecution;
}

/** Type-check, sort and deduplicate a texture DAG before repeated execution. */
export function compileMaterialGraph(graph: MaterialGraph): CompiledMaterialGraph {
  const sourceNodes = new Map<string, MaterialGraphNode>();
  for (const node of graph.nodes) {
    if (!node.id.trim()) throw new Error("material graph node id must not be empty");
    if (sourceNodes.has(node.id)) throw new Error(`duplicate material graph node: ${node.id}`);
    sourceNodes.set(node.id, node);
  }
  for (const [name, id] of Object.entries(graph.outputs)) {
    if (!name.trim()) throw new Error("material graph output name must not be empty");
    if (!sourceNodes.has(id)) throw new Error(`material graph output ${name} references missing node ${id}`);
  }
  validateNodeReferences(sourceNodes);
  const sourceOrder = topologicalOrder(sourceNodes, Object.values(graph.outputs));
  const canonicalById = new Map<string, string>();
  const signatureToId = new Map<string, string>();
  const nodes = new Map<string, MaterialGraphNode>();
  let commonSubexpressions = 0;
  for (const id of sourceOrder) {
    const node = remapNode(sourceNodes.get(id)!, canonicalById);
    validateNodeTypes(node, nodes);
    const signature = nodeSignature(node);
    const existing = node.op === "input" ? undefined : signatureToId.get(signature);
    if (existing) {
      canonicalById.set(id, existing);
      commonSubexpressions++;
      continue;
    }
    nodes.set(id, node);
    canonicalById.set(id, id);
    signatureToId.set(signature, id);
  }
  const order = [...nodes.keys()];
  const outputIds = Object.fromEntries(Object.entries(graph.outputs).map(([name, id]) => [name, canonicalById.get(id)!]));
  return {
    order,
    commonSubexpressions,
    execute(inputs, options = {}) {
      const shape = resolveShape(inputs, options.width, options.height);
      const values = new Map<string, TextureBuffer>();
      const revisions = new Map<string, string>();
      let evaluatedNodes = 0;
      let reusedNodes = 0;
      for (const id of order) {
        const node = nodes.get(id)!;
        const revision = nodeRevision(node, revisions, inputs);
        const previousValue = options.previous?.values.get(id);
        if (previousValue && options.previous?.revisions.get(id) === revision) {
          values.set(id, previousValue);
          revisions.set(id, revision);
          reusedNodes++;
          continue;
        }
        const value = evaluateNode(node, values, inputs, shape.width, shape.height);
        values.set(id, value);
        revisions.set(id, revision);
        evaluatedNodes++;
      }
      return {
        outputs: Object.fromEntries(Object.entries(outputIds).map(([name, id]) => [name, values.get(id)!])),
        state: { values, revisions },
        evaluatedNodes,
        reusedNodes,
      };
    },
  };
}

function validateNodeReferences(nodes: ReadonlyMap<string, MaterialGraphNode>): void {
  for (const node of nodes.values()) {
    for (const dependency of dependencies(node)) {
      if (!nodes.has(dependency)) throw new Error(`material graph node ${node.id} references missing node ${dependency}`);
    }
    if (node.op === "constant") {
      const valid = node.valueType === "scalar" ? typeof node.value === "number" : Array.isArray(node.value) && node.value.length === 3;
      if (!valid) throw new Error(`constant node ${node.id} value does not match ${node.valueType}`);
    }
    if (node.op === "clamp" && node.maximum < node.minimum) throw new Error(`clamp node ${node.id} maximum must be >= minimum`);
  }
}

function topologicalOrder(nodes: ReadonlyMap<string, MaterialGraphNode>, roots: readonly string[]): string[] {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const order: string[] = [];
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error(`material graph cycle at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of dependencies(nodes.get(id)!)) visit(dependency);
    visiting.delete(id);
    visited.add(id);
    order.push(id);
  };
  for (const root of roots) visit(root);
  return order;
}

function dependencies(node: MaterialGraphNode): string[] {
  if (node.op === "input" || node.op === "constant") return [];
  if (node.op === "clamp") return [node.source];
  if (node.op === "mix") return [node.left, node.right, node.amount];
  return [node.left, node.right];
}

function remapNode(node: MaterialGraphNode, canonical: ReadonlyMap<string, string>): MaterialGraphNode {
  const remap = (id: string) => canonical.get(id) ?? id;
  if (node.op === "clamp") return { ...node, source: remap(node.source) };
  if (node.op === "mix") return { ...node, left: remap(node.left), right: remap(node.right), amount: remap(node.amount) };
  if (node.op === "add" || node.op === "multiply" || node.op === "min" || node.op === "max") {
    return { ...node, left: remap(node.left), right: remap(node.right) };
  }
  return node;
}

function validateNodeTypes(node: MaterialGraphNode, nodes: ReadonlyMap<string, MaterialGraphNode>): void {
  const typeOf = (id: string) => nodes.get(id)!.valueType;
  if (node.op === "add" || node.op === "multiply" || node.op === "min" || node.op === "max") {
    if (typeOf(node.left) !== node.valueType || typeOf(node.right) !== node.valueType) {
      throw new Error(`material graph node ${node.id} input type mismatch`);
    }
  } else if (node.op === "clamp") {
    if (typeOf(node.source) !== node.valueType) throw new Error(`material graph node ${node.id} input type mismatch`);
  } else if (node.op === "mix") {
    if (typeOf(node.left) !== node.valueType || typeOf(node.right) !== node.valueType || typeOf(node.amount) !== "scalar") {
      throw new Error(`material graph node ${node.id} mix type mismatch`);
    }
  }
}

function nodeSignature(node: MaterialGraphNode): string {
  if (node.op === "input") return `input:${node.id}:${node.name}:${node.valueType}`;
  if (node.op === "constant") return `constant:${node.valueType}:${JSON.stringify(node.value)}`;
  if (node.op === "clamp") return `clamp:${node.valueType}:${node.source}:${node.minimum}:${node.maximum}`;
  if (node.op === "mix") return `mix:${node.valueType}:${node.left}:${node.right}:${node.amount}`;
  const commutative = [node.left, node.right].sort().join(":");
  return `${node.op}:${node.valueType}:${commutative}`;
}

function nodeRevision(
  node: MaterialGraphNode,
  revisions: ReadonlyMap<string, string>,
  inputs: Readonly<Record<string, MaterialGraphInput>>,
): string {
  if (node.op === "input") {
    const input = inputs[node.name];
    if (!input) throw new Error(`missing material graph input: ${node.name}`);
    return `input:${node.name}:${String(input.revision ?? fingerprint(input.texture))}`;
  }
  if (node.op === "constant") return nodeSignature(node);
  return `${nodeSignature(node)}|${dependencies(node).map((id) => revisions.get(id)).join("|")}`;
}

function evaluateNode(
  node: MaterialGraphNode,
  values: ReadonlyMap<string, TextureBuffer>,
  inputs: Readonly<Record<string, MaterialGraphInput>>,
  width: number,
  height: number,
): TextureBuffer {
  if (node.op === "input") {
    const texture = inputs[node.name]?.texture;
    if (!texture) throw new Error(`missing material graph input: ${node.name}`);
    validateTextureType(texture, node.valueType);
    if (texture.width !== width || texture.height !== height) throw new Error(`material graph input ${node.name} shape mismatch`);
    return texture;
  }
  const channels = node.valueType === "scalar" ? 1 : 3;
  if (node.op === "constant") {
    const output = makeTexture(width, height, channels);
    const source = typeof node.value === "number" ? [node.value] : node.value;
    for (let pixel = 0; pixel < width * height; pixel++) {
      for (let channel = 0; channel < channels; channel++) output.data[pixel * channels + channel] = source[channel] ?? source[0]!;
    }
    return output;
  }
  const output = makeTexture(width, height, channels);
  const get = (id: string) => values.get(id)!;
  for (let pixel = 0; pixel < width * height; pixel++) {
    for (let channel = 0; channel < channels; channel++) {
      const index = pixel * channels + channel;
      if (node.op === "clamp") {
        output.data[index] = Math.max(node.minimum, Math.min(node.maximum, get(node.source).data[index]!));
      } else if (node.op === "mix") {
        const amount = get(node.amount).data[pixel]!;
        const left = get(node.left).data[index]!;
        output.data[index] = left + (get(node.right).data[index]! - left) * amount;
      } else {
        const left = get(node.left).data[index]!;
        const right = get(node.right).data[index]!;
        output.data[index] = node.op === "add" ? left + right
          : node.op === "multiply" ? left * right
            : node.op === "min" ? Math.min(left, right) : Math.max(left, right);
      }
    }
  }
  return output;
}

function resolveShape(
  inputs: Readonly<Record<string, MaterialGraphInput>>,
  requestedWidth?: number,
  requestedHeight?: number,
): { width: number; height: number } {
  const first = Object.values(inputs)[0]?.texture;
  const width = Math.floor(requestedWidth ?? first?.width ?? 0);
  const height = Math.floor(requestedHeight ?? first?.height ?? width);
  if (width < 1 || height < 1) throw new Error("material graph execution requires input textures or explicit dimensions");
  return { width, height };
}

function validateTextureType(texture: TextureBuffer, type: MaterialGraphValueType): void {
  const expected = type === "scalar" ? 1 : 3;
  if (texture.channels !== expected) throw new Error(`material graph expected ${type} texture with ${expected} channels`);
}

function fingerprint(texture: TextureBuffer): string {
  let hash = 2166136261;
  for (let index = 0; index < texture.data.length; index++) {
    const value = Math.round(texture.data[index]! * 1e6);
    hash ^= value;
    hash = Math.imul(hash, 16777619);
  }
  return `${texture.width}x${texture.height}x${texture.channels}:${hash >>> 0}`;
}
