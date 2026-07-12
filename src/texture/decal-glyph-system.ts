import { clamp, smoothstep } from "../math/scalar.js";
import { fbm2, makeNoise } from "../random/noise.js";
import { makeTexture, type TextureBuffer } from "./buffer.js";
import {
  sdf2Union,
  sdfCircle,
  sdfOutline,
  sdfRegularPolygon,
  sdfRoundedBox,
  sdfTransform,
  type Sdf2,
} from "./sdf.js";
import { heightToNormal, type Material } from "./pbr.js";

export type DecalGlyphColor = readonly [number, number, number];
export type DecalGlyphIcon = "warning" | "arrow" | "bolt" | "info";
export type DecalStickerShape = "rounded" | "circle" | "diamond";

interface DecalGlyphLayerBase {
  readonly id: string;
  readonly label: string;
  readonly center: readonly [number, number];
  readonly size: readonly [number, number];
  readonly rotation?: number;
  readonly color: DecalGlyphColor;
  readonly opacity?: number;
  readonly roughness?: number;
  readonly metallic?: number;
  readonly height?: number;
  readonly emission?: number;
  readonly age?: number;
}

export interface DecalTextLayer extends DecalGlyphLayerBase {
  readonly kind: "text";
  readonly text: string;
  readonly tracking?: number;
}

export interface DecalIconLayer extends DecalGlyphLayerBase {
  readonly kind: "icon";
  readonly icon: DecalGlyphIcon;
}

export interface DecalStickerLayer extends DecalGlyphLayerBase {
  readonly kind: "sticker";
  readonly shape?: DecalStickerShape;
  readonly text?: string;
  readonly icon?: DecalGlyphIcon;
  readonly foregroundColor?: DecalGlyphColor;
}

export interface DecalStainLayer extends DecalGlyphLayerBase {
  readonly kind: "stain";
  readonly spread?: number;
}

export type DecalGlyphLayer =
  | DecalTextLayer
  | DecalIconLayer
  | DecalStickerLayer
  | DecalStainLayer;

export interface DecalGlyphSystemOptions {
  readonly seed?: number;
  readonly peel?: number;
  readonly grime?: number;
  readonly normalStrength?: number;
}

export interface DecalGlyphSystemMasks {
  readonly layerId: TextureBuffer;
  readonly coverage: TextureBuffer;
  readonly text: TextureBuffer;
  readonly icon: TextureBuffer;
  readonly sticker: TextureBuffer;
  readonly stain: TextureBuffer;
  readonly edge: TextureBuffer;
  readonly peel: TextureBuffer;
  readonly emission: TextureBuffer;
}

export interface DecalGlyphSystemResult {
  readonly material: Material;
  readonly layers: readonly DecalGlyphLayer[];
  readonly masks: DecalGlyphSystemMasks;
  readonly layerMasks: Readonly<Record<string, TextureBuffer>>;
}

interface CompiledLayer {
  readonly definition: DecalGlyphLayer;
  readonly index: number;
  readonly shape: Sdf2;
  readonly detail?: Sdf2;
  readonly noise: ReturnType<typeof makeNoise>;
}

interface LayerSample {
  readonly coverage: number;
  readonly detail: number;
  readonly edge: number;
  readonly peel: number;
  readonly alpha: number;
}

const GLYPH_WIDTH = 5;
const GLYPH_HEIGHT = 7;
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  A: ["  #  ", " # # ", "#   #", "#   #", "#####", "#   #", "#   #"],
  B: ["#### ", "#   #", "#   #", "#### ", "#   #", "#   #", "#### "],
  C: [" ####", "#    ", "#    ", "#    ", "#    ", "#    ", " ####"],
  D: ["#### ", "#   #", "#   #", "#   #", "#   #", "#   #", "#### "],
  E: ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#####"],
  F: ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#    "],
  G: [" ####", "#    ", "#    ", "#  ##", "#   #", "#   #", " ####"],
  H: ["#   #", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
  I: ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "#####"],
  J: ["#####", "   # ", "   # ", "   # ", "   # ", "#  # ", " ##  "],
  K: ["#   #", "#  # ", "# #  ", "##   ", "# #  ", "#  # ", "#   #"],
  L: ["#    ", "#    ", "#    ", "#    ", "#    ", "#    ", "#####"],
  M: ["#   #", "## ##", "# # #", "# # #", "#   #", "#   #", "#   #"],
  N: ["#   #", "##  #", "# # #", "# # #", "#  ##", "#   #", "#   #"],
  O: [" ### ", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
  P: ["#### ", "#   #", "#   #", "#### ", "#    ", "#    ", "#    "],
  Q: [" ### ", "#   #", "#   #", "#   #", "# # #", "#  # ", " ## #"],
  R: ["#### ", "#   #", "#   #", "#### ", "# #  ", "#  # ", "#   #"],
  S: [" ####", "#    ", "#    ", " ### ", "    #", "    #", "#### "],
  T: ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "],
  U: ["#   #", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
  V: ["#   #", "#   #", "#   #", "#   #", "#   #", " # # ", "  #  "],
  W: ["#   #", "#   #", "#   #", "# # #", "# # #", "## ##", "#   #"],
  X: ["#   #", "#   #", " # # ", "  #  ", " # # ", "#   #", "#   #"],
  Y: ["#   #", "#   #", " # # ", "  #  ", "  #  ", "  #  ", "  #  "],
  Z: ["#####", "    #", "   # ", "  #  ", " #   ", "#    ", "#####"],
  "0": [" ### ", "#   #", "#  ##", "# # #", "##  #", "#   #", " ### "],
  "1": ["  #  ", " ##  ", "  #  ", "  #  ", "  #  ", "  #  ", "#####"],
  "2": [" ### ", "#   #", "    #", "   # ", "  #  ", " #   ", "#####"],
  "3": ["#####", "   # ", "  #  ", "   # ", "    #", "#   #", " ### "],
  "4": ["   # ", "  ## ", " # # ", "#  # ", "#####", "   # ", "   # "],
  "5": ["#####", "#    ", "#### ", "    #", "    #", "#   #", " ### "],
  "6": [" ### ", "#    ", "#    ", "#### ", "#   #", "#   #", " ### "],
  "7": ["#####", "    #", "   # ", "  #  ", " #   ", " #   ", " #   "],
  "8": [" ### ", "#   #", "#   #", " ### ", "#   #", "#   #", " ### "],
  "9": [" ### ", "#   #", "#   #", " ####", "    #", "    #", " ### "],
  "-": ["     ", "     ", "     ", "#####", "     ", "     ", "     "],
  "/": ["    #", "    #", "   # ", "  #  ", " #   ", "#    ", "#    "],
  ".": ["     ", "     ", "     ", "     ", "     ", " ##  ", " ##  "],
  " ": ["     ", "     ", "     ", "     ", "     ", "     ", "     "],
};

const ICONS: Readonly<Record<DecalGlyphIcon, Sdf2>> = {
  warning: createWarningIcon(),
  arrow: createArrowIcon(),
  bolt: createBoltIcon(),
  info: createInfoIcon(),
};

export function decalGlyphSupported(character: string): boolean {
  return Object.prototype.hasOwnProperty.call(GLYPHS, character.toUpperCase());
}

export function decalGlyphIconSdf(icon: DecalGlyphIcon): Sdf2 {
  return ICONS[icon];
}

export function decalTextSdf(text: string, tracking = 0.24): Sdf2 {
  const characters = [...text.toUpperCase()];
  const gap = Math.max(0, tracking) * GLYPH_WIDTH;
  const runWidth = Math.max(1, characters.length * GLYPH_WIDTH + Math.max(0, characters.length - 1) * gap);
  const cells: Array<readonly [number, number]> = [];
  let cursor = 0;
  for (const character of characters) {
    const rows = GLYPHS[character];
    if (rows) {
      for (let row = 0; row < GLYPH_HEIGHT; row++) {
        for (let column = 0; column < GLYPH_WIDTH; column++) {
          if (rows[row]?.[column] === "#") cells.push([cursor + column + 0.5, GLYPH_HEIGHT - row - 0.5]);
        }
      }
    }
    cursor += GLYPH_WIDTH + gap;
  }
  const halfWidth = 0.94 / runWidth;
  const halfHeight = 0.94 / GLYPH_HEIGHT;
  return (x, y) => {
    let distance = Infinity;
    for (const cell of cells) {
      const centerX = (cell[0] / runWidth) * 2 - 1;
      const centerY = (cell[1] / GLYPH_HEIGHT) * 2 - 1;
      distance = Math.min(distance, roundedBoxDistance(x - centerX, y - centerY, halfWidth, halfHeight, Math.min(halfWidth, halfHeight) * 0.22));
    }
    return distance;
  };
}

export function applyDecalGlyphSystem(
  base: Material,
  layers: readonly DecalGlyphLayer[],
  options: DecalGlyphSystemOptions = {},
): DecalGlyphSystemResult {
  validateBaseMaterial(base);
  validateLayers(layers);
  const width = base.baseColor.width;
  const height = base.baseColor.height;
  const baseColor = copyTexture(base.baseColor);
  const metallic = copyTexture(base.metallic);
  const roughness = copyTexture(base.roughness);
  const ao = copyTexture(base.ao);
  const resultHeight = copyTexture(base.height);
  const emission = copyTexture(base.emission);
  const masks: DecalGlyphSystemMasks = {
    layerId: makeTexture(width, height, 1),
    coverage: makeTexture(width, height, 1),
    text: makeTexture(width, height, 1),
    icon: makeTexture(width, height, 1),
    sticker: makeTexture(width, height, 1),
    stain: makeTexture(width, height, 1),
    edge: makeTexture(width, height, 1),
    peel: makeTexture(width, height, 1),
    emission: makeTexture(width, height, 1),
  };
  const layerMasks: Record<string, TextureBuffer> = {};
  for (const layer of layers) layerMasks[layer.id] = makeTexture(width, height, 1);
  const compiled = layers.map((layer, index) => compileLayer(layer, index, options.seed ?? 127));
  const peelAmount = clamp(options.peel ?? 0.34, 0, 1);
  const grimeAmount = clamp(options.grime ?? 0.24, 0, 1);

  for (let y = 0; y < height; y++) {
    const v = 1 - (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const pixel = y * width + x;
      for (const layer of compiled) {
        const sample = sampleLayer(layer, u, v, width, height, peelAmount);
        if (sample.coverage <= 0.0001) continue;
        const definition = layer.definition;
        const alpha = sample.alpha;
        const grimeNoise = fbm2(layer.noise, u * 31 + 7, v * 31 - 3, { octaves: 3 }) * 0.5 + 0.5;
        const grime = clamp(sample.edge * grimeNoise * grimeAmount, 0, 1);
        const layerColor = definition.kind === "sticker" && sample.detail > 0.01
          ? definition.foregroundColor ?? [0.035, 0.04, 0.045]
          : definition.color;
        for (let channel = 0; channel < 3; channel++) {
          const colorIndex = pixel * 3 + channel;
          const dirtyColor = mix(layerColor[channel]!, channel === 0 ? 0.085 : channel === 1 ? 0.065 : 0.04, grime);
          baseColor.data[colorIndex] = mix(baseColor.data[colorIndex]!, dirtyColor, alpha);
          const layerEmission = layerColor[channel]! * clamp(definition.emission ?? 0, 0, 1) * alpha;
          emission.data[colorIndex] = clamp(Math.max(emission.data[colorIndex]!, layerEmission), 0, 1);
        }
        metallic.data[pixel] = mix(metallic.data[pixel]!, clamp(definition.metallic ?? 0, 0, 1), alpha);
        roughness.data[pixel] = clamp(mix(roughness.data[pixel]!, definition.roughness ?? defaultRoughness(definition.kind), alpha) + grime * 0.16, 0.04, 1);
        ao.data[pixel] = clamp(ao.data[pixel]! - sample.edge * alpha * 0.08 - grime * 0.12, 0, 1);
        resultHeight.data[pixel] = clamp(resultHeight.data[pixel]! + (definition.height ?? defaultHeight(definition.kind)) * alpha - sample.peel * 0.006, 0, 1);
        masks.layerId.data[pixel] = layers.length <= 1 ? 1 : (layer.index + 1) / layers.length;
        masks.coverage.data[pixel] = Math.max(masks.coverage.data[pixel]!, alpha);
        masks[definition.kind].data[pixel] = Math.max(masks[definition.kind].data[pixel]!, alpha);
        masks.edge.data[pixel] = Math.max(masks.edge.data[pixel]!, sample.edge * alpha);
        masks.peel.data[pixel] = Math.max(masks.peel.data[pixel]!, sample.peel);
        masks.emission.data[pixel] = Math.max(masks.emission.data[pixel]!, alpha * (definition.emission ?? 0));
        layerMasks[definition.id]!.data[pixel] = alpha;
      }
    }
  }

  return {
    material: {
      baseColor,
      metallic,
      roughness,
      normal: heightToNormal(resultHeight, options.normalStrength ?? 5),
      ao,
      height: resultHeight,
      emission,
    },
    layers,
    masks,
    layerMasks,
  };
}

function compileLayer(layer: DecalGlyphLayer, index: number, seed: number): CompiledLayer {
  if (layer.kind === "text") {
    return { definition: layer, index, shape: decalTextSdf(layer.text, layer.tracking), noise: makeNoise(seed + index * 101) };
  }
  if (layer.kind === "icon") {
    return { definition: layer, index, shape: decalGlyphIconSdf(layer.icon), noise: makeNoise(seed + index * 101) };
  }
  if (layer.kind === "sticker") {
    const shape = stickerSdf(layer.shape ?? "rounded");
    const detail = layer.text
      ? sdfTransform(decalTextSdf(layer.text, 0.18), { scale: [0.58, 0.58] })
      : layer.icon
        ? sdfTransform(decalGlyphIconSdf(layer.icon), { scale: [0.58, 0.58] })
        : undefined;
    const compiled = { definition: layer, index, shape, noise: makeNoise(seed + index * 101) };
    return detail ? { ...compiled, detail } : compiled;
  }
  const spread = clamp(layer.spread ?? 0.62, 0.15, 1.5);
  const shape = (x: number, y: number) => {
    const base = Math.hypot(x * (0.72 + spread * 0.22), y * (1.2 - spread * 0.18)) - 0.72;
    const lobes = Math.sin(x * 8 + y * 3) * 0.055 + Math.sin(y * 11 - x * 4) * 0.035;
    return base + lobes;
  };
  return { definition: layer, index, shape, noise: makeNoise(seed + index * 101) };
}

function sampleLayer(
  layer: CompiledLayer,
  u: number,
  v: number,
  width: number,
  height: number,
  peelAmount: number,
): LayerSample {
  const definition = layer.definition;
  const angle = definition.rotation ?? 0;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const deltaX = u - definition.center[0];
  const deltaY = v - definition.center[1];
  const rotatedX = cosine * deltaX + sine * deltaY;
  const rotatedY = -sine * deltaX + cosine * deltaY;
  const localX = rotatedX / (definition.size[0] * 0.5);
  const localY = rotatedY / (definition.size[1] * 0.5);
  const pixelSoftnessX = 2 / (width * definition.size[0]);
  const pixelSoftnessY = 2 / (height * definition.size[1]);
  const softness = (definition.kind === "text"
    ? Math.min(pixelSoftnessX, pixelSoftnessY)
    : Math.max(pixelSoftnessX, pixelSoftnessY)) * 0.72;
  const distance = layer.shape(localX, localY);
  let coverage = distanceMask(distance, softness);
  if (definition.kind === "stain") {
    const breakup = fbm2(layer.noise, localX * 2.8 + 11, localY * 2.8 - 5, { octaves: 4 }) * 0.5 + 0.5;
    coverage *= smoothstep(0.2, 0.78, breakup + coverage * 0.38);
  }
  const detail = layer.detail ? distanceMask(layer.detail(localX, localY), softness * 1.2) : 0;
  const edge = coverage * (1 - distanceMask(distance + 0.12, softness * 1.4));
  const age = clamp(definition.age ?? 0, 0, 1);
  const peelNoise = fbm2(layer.noise, u * 47 + 19, v * 47 - 13, { octaves: 3 }) * 0.5 + 0.5;
  const edgePeel = edge * smoothstep(0.34, 0.72, peelNoise);
  const innerPeel = coverage * smoothstep(0.8 - age * 0.36, 0.94 - age * 0.18, peelNoise);
  const peel = definition.kind === "stain" ? 0 : clamp(Math.max(edgePeel, innerPeel) * age * peelAmount, 0, 1);
  const alpha = clamp(coverage * (definition.opacity ?? 1) * (1 - peel), 0, 1);
  return { coverage, detail, edge, peel, alpha };
}

function createWarningIcon(): Sdf2 {
  const triangle = sdfOutline(sdfRegularPolygon(3, 0.78, Math.PI / 2), 0.12);
  const stem = sdfTransform(sdfRoundedBox(0.065, 0.25, 0.04), { translate: [0, 0.08] });
  const dot = sdfTransform(sdfCircle(0.075), { translate: [0, -0.32] });
  return sdf2Union(triangle, sdf2Union(stem, dot));
}

function createArrowIcon(): Sdf2 {
  const shaft = sdfTransform(sdfRoundedBox(0.46, 0.095, 0.045), { translate: [-0.12, 0] });
  const head = sdfTransform(sdfRegularPolygon(3, 0.42, 0), { translate: [0.4, 0] });
  return sdf2Union(shaft, head);
}

function createBoltIcon(): Sdf2 {
  return (x, y) => polygonDistance(x, y, [
    [-0.12, 0.78], [0.38, 0.78], [0.08, 0.14], [0.42, 0.14], [-0.28, -0.8], [-0.05, -0.12], [-0.4, -0.12],
  ]);
}

function createInfoIcon(): Sdf2 {
  const ring = sdfOutline(sdfCircle(0.74), 0.11);
  const stem = sdfTransform(sdfRoundedBox(0.08, 0.28, 0.04), { translate: [0, -0.13] });
  const dot = sdfTransform(sdfCircle(0.09), { translate: [0, 0.36] });
  return sdf2Union(ring, sdf2Union(stem, dot));
}

function stickerSdf(shape: DecalStickerShape): Sdf2 {
  if (shape === "circle") return sdfCircle(0.88);
  if (shape === "diamond") return sdfRegularPolygon(4, 1.02, Math.PI / 4);
  return sdfRoundedBox(0.92, 0.8, 0.16);
}

function validateBaseMaterial(material: Material): void {
  const width = material.baseColor.width;
  const height = material.baseColor.height;
  if (width < 1 || height < 1 || material.baseColor.channels !== 3) throw new Error("decal glyph base material must have RGB baseColor");
  const entries: ReadonlyArray<readonly [string, TextureBuffer, number]> = [
    ["metallic", material.metallic, 1], ["roughness", material.roughness, 1], ["normal", material.normal, 3],
    ["ao", material.ao, 1], ["height", material.height, 1], ["emission", material.emission, 3],
  ];
  for (const [name, texture, channels] of entries) {
    if (texture.width !== width || texture.height !== height || texture.channels !== channels) {
      throw new Error(`decal glyph base ${name} dimensions or channels do not match`);
    }
  }
}

function validateLayers(layers: readonly DecalGlyphLayer[]): void {
  const ids = new Set<string>();
  for (const layer of layers) {
    if (layer.id.trim().length === 0) throw new Error("decal glyph layer id must not be empty");
    if (ids.has(layer.id)) throw new Error(`duplicate decal glyph layer: ${layer.id}`);
    ids.add(layer.id);
    if (layer.size[0] <= 0 || layer.size[1] <= 0) throw new Error("decal glyph layer size must be positive");
    if (layer.kind === "text" && layer.text.length === 0) throw new Error("decal text must not be empty");
  }
}

function copyTexture(source: TextureBuffer): TextureBuffer {
  return { width: source.width, height: source.height, channels: source.channels, data: new Float32Array(source.data) };
}

function distanceMask(distance: number, softness: number): number {
  return 1 - smoothstep(-softness, softness, distance);
}

function roundedBoxDistance(x: number, y: number, halfWidth: number, halfHeight: number, radius: number): number {
  const deltaX = Math.abs(x) - halfWidth + radius;
  const deltaY = Math.abs(y) - halfHeight + radius;
  return Math.hypot(Math.max(deltaX, 0), Math.max(deltaY, 0)) + Math.min(Math.max(deltaX, deltaY), 0) - radius;
}

function polygonDistance(x: number, y: number, points: ReadonlyArray<readonly [number, number]>): number {
  let minimum = Infinity;
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const start = points[previous]!;
    const end = points[index]!;
    const edgeX = end[0] - start[0];
    const edgeY = end[1] - start[1];
    const amount = clamp(((x - start[0]) * edgeX + (y - start[1]) * edgeY) / Math.max(1e-9, edgeX * edgeX + edgeY * edgeY), 0, 1);
    minimum = Math.min(minimum, Math.hypot(x - start[0] - edgeX * amount, y - start[1] - edgeY * amount));
    if ((end[1] > y) !== (start[1] > y) && x < ((start[0] - end[0]) * (y - end[1])) / (start[1] - end[1]) + end[0]) inside = !inside;
  }
  return inside ? -minimum : minimum;
}

function defaultRoughness(kind: DecalGlyphLayer["kind"]): number {
  if (kind === "stain") return 0.86;
  if (kind === "sticker") return 0.42;
  return 0.54;
}

function defaultHeight(kind: DecalGlyphLayer["kind"]): number {
  if (kind === "stain") return -0.002;
  if (kind === "sticker") return 0.012;
  return 0.004;
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}
