import { clamp, smoothstep } from "../math/scalar.js";
import { fbm2, makeNoise } from "../random/noise.js";
import { makeTexture, type TextureBuffer } from "./buffer.js";
import type { GeometryTextureBake } from "./geometry-bake.js";
import { exportOpenPBRMaterial, type OpenPBRExport } from "./manufacturing-mechanics.js";
import type { LayeredMaterial } from "./shading-mechanics.js";
import { textureToPNG } from "./png.js";

export type SemanticInfluenceShape = "ellipse" | "stripe" | "ring";

export interface SemanticInfluenceSource {
  readonly center: readonly [number, number];
  readonly radius: readonly [number, number];
  readonly strength?: number;
  readonly rotation?: number;
  readonly shape?: SemanticInfluenceShape;
}

export interface SemanticSurfaceOptions {
  readonly seed?: number;
  readonly scale?: number;
  readonly edgeFrequency?: number;
  readonly rainDirection?: readonly [number, number];
  readonly waterline?: number;
  readonly contactSources?: ReadonlyArray<SemanticInfluenceSource>;
  readonly heatSources?: ReadonlyArray<SemanticInfluenceSource>;
  readonly loadSources?: ReadonlyArray<SemanticInfluenceSource>;
  readonly geometry?: GeometryTextureBake;
}

export interface SemanticSurfaceFields {
  readonly edge: TextureBuffer;
  readonly cavity: TextureBuffer;
  readonly exposure: TextureBuffer;
  readonly runoff: TextureBuffer;
  readonly contact: TextureBuffer;
  readonly heat: TextureBuffer;
  readonly load: TextureBuffer;
  readonly waterline: TextureBuffer;
}

export interface AssetLifecycleOptions {
  readonly time?: number;
  readonly iterations?: number;
  readonly moisture?: number;
  readonly salinity?: number;
  readonly traffic?: number;
  readonly temperature?: number;
  readonly cleaning?: number;
}

export interface AssetLifecycleMaps {
  readonly wear: TextureBuffer;
  readonly polish: TextureBuffer;
  readonly coatingLoss: TextureBuffer;
  readonly grime: TextureBuffer;
  readonly oxidation: TextureBuffer;
  readonly carbon: TextureBuffer;
  readonly mineral: TextureBuffer;
}

export interface AssetMaterialReport {
  readonly material: string;
  readonly schema: "MeshovaAssetMaterialReport";
  readonly version: 1;
  readonly channels: number;
  readonly means: {
    readonly roughness: number;
    readonly metallic: number;
    readonly ao: number;
    readonly wear: number;
    readonly grime: number;
  };
  readonly lodRoughnessDrift: number;
  readonly notes: ReadonlyArray<string>;
}

export interface AssetReadyExport extends OpenPBRExport {
  readonly report: AssetMaterialReport;
  readonly gltfMaterial: Record<string, unknown>;
}

const clamp01 = (value: number) => clamp(value, 0, 1);

function textureMean(texture: TextureBuffer, channel = 0): number {
  let total = 0;
  const pixels = texture.width * texture.height;
  for (let pixel = 0; pixel < pixels; pixel++) total += texture.data[pixel * texture.channels + channel]!;
  return pixels > 0 ? total / pixels : 0;
}

function readScalar(texture: TextureBuffer | undefined, pixel: number, fallback: number): number {
  if (!texture) return fallback;
  return texture.data[pixel * texture.channels] ?? fallback;
}

function influenceAt(source: SemanticInfluenceSource, u: number, v: number): number {
  const rotation = source.rotation ?? 0;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const offsetX = u - source.center[0];
  const offsetY = v - source.center[1];
  const localX = (offsetX * cosine + offsetY * sine) / Math.max(1e-4, source.radius[0]);
  const localY = (-offsetX * sine + offsetY * cosine) / Math.max(1e-4, source.radius[1]);
  const shape = source.shape ?? "ellipse";
  let distance: number;
  if (shape === "stripe") distance = Math.abs(localY);
  else if (shape === "ring") distance = Math.abs(Math.hypot(localX, localY) - 0.72);
  else distance = Math.hypot(localX, localY);
  return smoothstep(1, 0.15, distance) * (source.strength ?? 1);
}

function sourceField(sources: ReadonlyArray<SemanticInfluenceSource>, u: number, v: number): number {
  let value = 0;
  for (const source of sources) value = Math.max(value, influenceAt(source, u, v));
  return clamp01(value);
}

function validateGeometrySize(size: number, geometry: GeometryTextureBake | undefined): void {
  if (!geometry) return;
  const maps = [geometry.ao, geometry.curvature, geometry.height, geometry.coverage];
  if (maps.some((map) => map.width !== size || map.height !== size)) {
    throw new Error("geometry bake dimensions must match semantic field size");
  }
}

export function deriveSemanticSurfaceFields(
  size: number,
  options: SemanticSurfaceOptions = {},
): SemanticSurfaceFields {
  if (!Number.isInteger(size) || size < 4) throw new Error("size must be an integer >= 4");
  validateGeometrySize(size, options.geometry);
  const seed = options.seed ?? 0;
  const scale = options.scale ?? 6;
  const edgeFrequency = options.edgeFrequency ?? 4;
  const rainDirection = options.rainDirection ?? [0.15, -1];
  const waterlineHeight = options.waterline ?? 0.46;
  const contactSources = options.contactSources ?? [];
  const heatSources = options.heatSources ?? [];
  const loadSources = options.loadSources ?? contactSources;
  const noise = makeNoise(seed);
  const edge = makeTexture(size, size, 1);
  const cavity = makeTexture(size, size, 1);
  const exposure = makeTexture(size, size, 1);
  const runoff = makeTexture(size, size, 1);
  const contact = makeTexture(size, size, 1);
  const heat = makeTexture(size, size, 1);
  const load = makeTexture(size, size, 1);
  const waterline = makeTexture(size, size, 1);
  const directionLength = Math.hypot(rainDirection[0], rainDirection[1]) || 1;
  const rainX = rainDirection[0] / directionLength;
  const rainY = rainDirection[1] / directionLength;

  for (let y = 0; y < size; y++) {
    const v = 1 - (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const pixel = y * size + x;
      const macro = fbm2(noise, u * scale, v * scale, { octaves: 5 }) * 0.5 + 0.5;
      const fine = fbm2(noise, u * scale * 3.7 + 19.3, v * scale * 3.7 - 7.1, { octaves: 3 }) * 0.5 + 0.5;
      const gridX = Math.abs(Math.sin(u * Math.PI * edgeFrequency));
      const gridY = Math.abs(Math.sin(v * Math.PI * edgeFrequency));
      const proceduralEdge = 1 - smoothstep(0.02, 0.2, Math.min(gridX, gridY));
      const geometryEdge = readScalar(options.geometry?.curvature, pixel, proceduralEdge);
      const geometryAo = readScalar(options.geometry?.ao, pixel, 0.62 + macro * 0.38);
      const geometryHeight = readScalar(options.geometry?.height, pixel, v);
      const coverage = readScalar(options.geometry?.coverage, pixel, 1);
      const surfaceEdge = clamp01(geometryEdge * 0.82 + proceduralEdge * 0.18);
      const surfaceCavity = clamp01((1 - geometryAo) * 1.35 + (1 - macro) * 0.2);
      const surfaceExposure = clamp01(geometryHeight * 0.58 + (1 - surfaceCavity) * 0.3 + macro * 0.12);
      const projectedRain = u * rainX + v * rainY;
      const streak = Math.pow(clamp01(fbm2(noise, u * scale * 0.7 + 37, v * scale * 4.5, { octaves: 3 }) * 0.5 + 0.5), 3);
      edge.data[pixel] = surfaceEdge * coverage;
      cavity.data[pixel] = surfaceCavity * coverage;
      exposure.data[pixel] = surfaceExposure * coverage;
      runoff.data[pixel] = clamp01(streak * 0.52 + surfaceExposure * 0.28 + clamp01(0.5 - projectedRain) * 0.2) * coverage;
      contact.data[pixel] = sourceField(contactSources, u, v) * coverage;
      heat.data[pixel] = clamp01(sourceField(heatSources, u, v) * 0.9 + fine * 0.1) * coverage;
      load.data[pixel] = clamp01(sourceField(loadSources, u, v) * 0.88 + surfaceEdge * 0.12) * coverage;
      waterline.data[pixel] = Math.exp(-Math.abs(v - waterlineHeight) * 24) * coverage;
    }
  }
  return { edge, cavity, exposure, runoff, contact, heat, load, waterline };
}

function neighborMean(texture: TextureBuffer, x: number, y: number): number {
  let total = 0;
  let count = 0;
  for (let offsetY = -1; offsetY <= 1; offsetY++) {
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      const sampleX = (x + offsetX + texture.width) % texture.width;
      const sampleY = (y + offsetY + texture.height) % texture.height;
      total += texture.data[sampleY * texture.width + sampleX]!;
      count++;
    }
  }
  return total / count;
}

export function simulateAssetLifecycle(
  fields: SemanticSurfaceFields,
  options: AssetLifecycleOptions = {},
): AssetLifecycleMaps {
  const size = fields.edge.width;
  const maps = Object.values(fields);
  if (maps.some((map) => map.width !== size || map.height !== size || map.channels !== 1)) {
    throw new Error("semantic surface fields must share square scalar dimensions");
  }
  const time = clamp01(options.time ?? 0.75);
  const iterations = Math.max(1, Math.round(options.iterations ?? 3));
  const moisture = clamp01(options.moisture ?? 0.55);
  const salinity = clamp01(options.salinity ?? 0.15);
  const traffic = clamp01(options.traffic ?? 0.65);
  const temperature = clamp01(options.temperature ?? 0.5);
  const cleaning = clamp01(options.cleaning ?? 0.15);
  const wear = makeTexture(size, size, 1);
  const polish = makeTexture(size, size, 1);
  const coatingLoss = makeTexture(size, size, 1);
  const grime = makeTexture(size, size, 1);
  const oxidation = makeTexture(size, size, 1);
  const carbon = makeTexture(size, size, 1);
  const mineral = makeTexture(size, size, 1);

  for (let pixel = 0; pixel < size * size; pixel++) {
    const contact = fields.contact.data[pixel]!;
    const load = fields.load.data[pixel]!;
    const edge = fields.edge.data[pixel]!;
    const cavity = fields.cavity.data[pixel]!;
    const runoff = fields.runoff.data[pixel]!;
    const exposure = fields.exposure.data[pixel]!;
    const heat = fields.heat.data[pixel]!;
    const waterline = fields.waterline.data[pixel]!;
    wear.data[pixel] = clamp01((contact * 0.68 + load * 0.32) * traffic * time);
    polish.data[pixel] = clamp01((contact * 0.78 + load * 0.22) * traffic * time * 1.15);
    coatingLoss.data[pixel] = clamp01((edge * 0.58 + wear.data[pixel]! * 0.72) * time);
    grime.data[pixel] = clamp01((cavity * 0.62 + runoff * moisture * 0.45 + waterline * 0.22) * time * (1 - cleaning * 0.82));
    oxidation.data[pixel] = clamp01((exposure * moisture * 0.42 + runoff * 0.38 + waterline * salinity * 0.72) * time);
    carbon.data[pixel] = clamp01(heat * (0.42 + temperature * 0.58) * (0.55 + cavity * 0.45) * time);
    mineral.data[pixel] = clamp01((runoff * moisture * 0.55 + waterline * 0.6) * (0.35 + temperature * 0.4) * time);
  }

  for (let iteration = 1; iteration < iterations; iteration++) {
    const previousOxidation = new Float32Array(oxidation.data);
    const previousGrime = new Float32Array(grime.data);
    const oxidationTexture = { ...oxidation, data: previousOxidation };
    const grimeTexture = { ...grime, data: previousGrime };
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const pixel = y * size + x;
        oxidation.data[pixel] = clamp01(previousOxidation[pixel]! * 0.76 + neighborMean(oxidationTexture, x, y) * 0.24 * moisture);
        grime.data[pixel] = clamp01(previousGrime[pixel]! * 0.82 + neighborMean(grimeTexture, x, y) * 0.18 * (1 - cleaning));
      }
    }
  }
  return { wear, polish, coatingLoss, grime, oxidation, carbon, mineral };
}

export function packOrmTexture(material: LayeredMaterial): TextureBuffer {
  const width = material.ao.width;
  const height = material.ao.height;
  const packed = makeTexture(width, height, 3);
  for (let pixel = 0; pixel < width * height; pixel++) {
    packed.data[pixel * 3] = material.ao.data[pixel]!;
    packed.data[pixel * 3 + 1] = material.roughness.data[pixel]!;
    packed.data[pixel * 3 + 2] = material.metallic.data[pixel]!;
  }
  return packed;
}

export function buildTextureLodPyramid(texture: TextureBuffer, levels = 4): TextureBuffer[] {
  const pyramid = [texture];
  const count = Math.max(1, Math.round(levels));
  while (pyramid.length < count) {
    const source = pyramid[pyramid.length - 1]!;
    if (source.width === 1 && source.height === 1) break;
    const width = Math.max(1, Math.ceil(source.width / 2));
    const height = Math.max(1, Math.ceil(source.height / 2));
    const target = makeTexture(width, height, source.channels);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        for (let channel = 0; channel < source.channels; channel++) {
          let total = 0;
          let countSamples = 0;
          for (let offsetY = 0; offsetY < 2; offsetY++) {
            for (let offsetX = 0; offsetX < 2; offsetX++) {
              const sourceX = x * 2 + offsetX;
              const sourceY = y * 2 + offsetY;
              if (sourceX >= source.width || sourceY >= source.height) continue;
              total += source.data[(sourceY * source.width + sourceX) * source.channels + channel]!;
              countSamples++;
            }
          }
          target.data[(y * width + x) * source.channels + channel] = total / countSamples;
        }
      }
    }
    pyramid.push(target);
  }
  return pyramid;
}

export function createAssetMaterialReport(
  name: string,
  material: LayeredMaterial,
  lifecycle?: AssetLifecycleMaps,
): AssetMaterialReport {
  const lod = buildTextureLodPyramid(material.roughness, 4);
  const lodRoughnessDrift = Math.abs(textureMean(lod[0]!) - textureMean(lod[lod.length - 1]!));
  const notes: string[] = [];
  if (lodRoughnessDrift > 0.03) notes.push("粗糙度远距漂移偏高");
  if (textureMean(material.ao) < 0.45) notes.push("整体 AO 偏暗");
  if (textureMean(material.metallic) > 0.05 && textureMean(material.metallic) < 0.95) notes.push("混合金属区域需检查边界抗锯齿");
  return {
    material: name,
    schema: "MeshovaAssetMaterialReport",
    version: 1,
    channels: 19,
    means: {
      roughness: textureMean(material.roughness),
      metallic: textureMean(material.metallic),
      ao: textureMean(material.ao),
      wear: lifecycle ? textureMean(lifecycle.wear) : 0,
      grime: lifecycle ? textureMean(lifecycle.grime) : 0,
    },
    lodRoughnessDrift,
    notes,
  };
}

function encodeUtf8(value: string): Uint8Array {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index++) {
    let code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const low = value.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + low - 0xdc00;
        index++;
      }
    }
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | code >> 6, 0x80 | code & 0x3f);
    else if (code < 0x10000) bytes.push(0xe0 | code >> 12, 0x80 | code >> 6 & 0x3f, 0x80 | code & 0x3f);
    else bytes.push(0xf0 | code >> 18, 0x80 | code >> 12 & 0x3f, 0x80 | code >> 6 & 0x3f, 0x80 | code & 0x3f);
  }
  return Uint8Array.from(bytes);
}

export function exportAssetReadyMaterial(
  material: LayeredMaterial,
  baseName = "material",
  lifecycle?: AssetLifecycleMaps,
): AssetReadyExport {
  const portable = exportOpenPBRMaterial(material, baseName);
  const report = createAssetMaterialReport(baseName, material, lifecycle);
  const gltfMaterial = {
    name: baseName,
    pbrMetallicRoughness: {
      baseColorTexture: { uri: `${baseName}_baseColor.png`, colorSpace: "srgb" },
      metallicRoughnessTexture: { uri: `${baseName}_orm.png`, roughnessChannel: "g", metallicChannel: "b" },
    },
    normalTexture: { uri: `${baseName}_normal.png` },
    occlusionTexture: { uri: `${baseName}_orm.png`, channel: "r" },
    emissiveTexture: { uri: `${baseName}_emission.png`, colorSpace: "srgb" },
    extensions: {
      KHR_materials_clearcoat: {
        clearcoatTexture: { uri: `${baseName}_clearcoat.png` },
        clearcoatRoughnessTexture: { uri: `${baseName}_clearcoatRoughness.png` },
      },
      KHR_materials_transmission: { transmissionTexture: { uri: `${baseName}_transmission.png` } },
      KHR_materials_iridescence: { iridescenceTexture: { uri: `${baseName}_iridescence.png` } },
    },
  };
  return {
    ...portable,
    files: {
      ...portable.files,
      [`${baseName}_orm.png`]: textureToPNG(packOrmTexture(material)),
      [`${baseName}.gltf-material.json`]: encodeUtf8(JSON.stringify(gltfMaterial, null, 2)),
      [`${baseName}.asset-report.json`]: encodeUtf8(JSON.stringify(report, null, 2)),
    },
    report,
    gltfMaterial,
  };
}
