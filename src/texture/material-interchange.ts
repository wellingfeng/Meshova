import type { LayeredMaterial } from "./shading-mechanics.js";
import { makeTexture, type TextureBuffer } from "./buffer.js";

export interface GltfMaterialDescriptor {
  readonly asset: { readonly version: "2.0"; readonly generator: string };
  readonly extensionsUsed: readonly string[];
  readonly images: readonly { readonly uri: string }[];
  readonly textures: readonly { readonly source: number }[];
  readonly materials: readonly Record<string, unknown>[];
}

export interface MaterialInterchangeOptions {
  readonly baseName?: string;
  readonly udim?: boolean;
}

export interface MaterialInterchangeDescriptors {
  readonly gltf: GltfMaterialDescriptor;
  readonly materialX: string;
  readonly textureUris: Readonly<Record<string, string>>;
  readonly packedTextures: Readonly<{
    baseColorOpacity: TextureBuffer;
    metallicRoughness: TextureBuffer;
  }>;
}

const CHANNELS = [
  "baseColor", "metallic", "roughness", "normal", "ao", "emission",
  "opacity", "transmission", "anisotropy", "anisotropyRotation",
  "clearcoat", "clearcoatRoughness", "sheen", "sheenColor", "thickness",
  "subsurface", "iridescence", "iridescenceThickness",
] as const;

const GLTF_PACKED_CHANNELS = ["baseColorOpacity", "metallicRoughness"] as const;

/** Export JSON-ready glTF metadata and MaterialX Standard Surface XML. */
export function describeLayeredMaterial(
  material: LayeredMaterial,
  options: MaterialInterchangeOptions = {},
): MaterialInterchangeDescriptors {
  const baseName = sanitizeName(options.baseName ?? "material");
  const tile = options.udim ? ".<UDIM>" : "";
  const allChannels = [...CHANNELS, ...GLTF_PACKED_CHANNELS];
  const textureUris = Object.fromEntries(allChannels.map((channel) => [channel, `${baseName}_${channel}${tile}.png`]));
  const images = allChannels.map((channel) => ({ uri: textureUris[channel]! }));
  const textures = allChannels.map((_, source) => ({ source }));
  const index = Object.fromEntries(allChannels.map((channel, channelIndex) => [channel, channelIndex])) as Record<typeof allChannels[number], number>;
  const extensionsUsed = [
    "KHR_materials_clearcoat",
    "KHR_materials_transmission",
    "KHR_materials_ior",
    "KHR_materials_volume",
    "KHR_materials_sheen",
    "KHR_materials_iridescence",
    "KHR_materials_anisotropy",
  ];
  const physical = material.physical;
  const gltfMaterial: Record<string, unknown> = {
    name: baseName,
    pbrMetallicRoughness: {
      baseColorTexture: { index: index.baseColorOpacity },
      metallicRoughnessTexture: { index: index.metallicRoughness },
      metallicFactor: 1,
      roughnessFactor: 1,
    },
    normalTexture: { index: index.normal },
    occlusionTexture: { index: index.ao },
    emissiveTexture: { index: index.emission },
    alphaMode: minimumValue(material.opacity) < 0.999 ? "BLEND" : "OPAQUE",
    extensions: {
      KHR_materials_clearcoat: {
        clearcoatFactor: physical.clearcoat,
        clearcoatTexture: { index: index.clearcoat },
        clearcoatRoughnessFactor: physical.clearcoatRoughness,
        clearcoatRoughnessTexture: { index: index.clearcoatRoughness },
      },
      KHR_materials_transmission: {
        transmissionFactor: maximumValue(material.transmission),
        transmissionTexture: { index: index.transmission },
      },
      KHR_materials_ior: { ior: physical.ior },
      KHR_materials_volume: {
        thicknessFactor: physical.thickness,
        thicknessTexture: { index: index.thickness },
        attenuationDistance: physical.attenuationDistance,
        attenuationColor: physical.attenuationColor,
      },
      KHR_materials_sheen: {
        sheenColorFactor: [physical.sheen, physical.sheen, physical.sheen],
        sheenColorTexture: { index: index.sheenColor },
        sheenRoughnessFactor: physical.sheenRoughness,
      },
      KHR_materials_iridescence: {
        iridescenceFactor: physical.iridescence,
        iridescenceTexture: { index: index.iridescence },
        iridescenceIor: physical.iridescenceIor,
        iridescenceThicknessTexture: { index: index.iridescenceThickness },
      },
      KHR_materials_anisotropy: {
        anisotropyStrength: maximumValue(material.anisotropy),
        anisotropyRotation: meanValue(material.anisotropyRotation),
        anisotropyTexture: { index: index.anisotropy },
      },
    },
  };
  return {
    textureUris,
    packedTextures: {
      baseColorOpacity: packBaseColorOpacity(material),
      metallicRoughness: packMetallicRoughness(material),
    },
    gltf: {
      asset: { version: "2.0", generator: "Meshova" },
      extensionsUsed,
      images,
      textures,
      materials: [gltfMaterial],
    },
    materialX: materialXDocument(baseName, textureUris, material),
  };
}

export function packBaseColorOpacity(material: LayeredMaterial): TextureBuffer {
  const output = makeTexture(material.baseColor.width, material.baseColor.height, 4);
  for (let pixel = 0; pixel < material.baseColor.width * material.baseColor.height; pixel++) {
    output.data[pixel * 4] = material.baseColor.data[pixel * 3]!;
    output.data[pixel * 4 + 1] = material.baseColor.data[pixel * 3 + 1]!;
    output.data[pixel * 4 + 2] = material.baseColor.data[pixel * 3 + 2]!;
    output.data[pixel * 4 + 3] = material.opacity.data[pixel]!;
  }
  return output;
}

/** glTF convention: G=roughness, B=metallic. R is unused. */
export function packMetallicRoughness(material: LayeredMaterial): TextureBuffer {
  const output = makeTexture(material.metallic.width, material.metallic.height, 3);
  for (let pixel = 0; pixel < material.metallic.width * material.metallic.height; pixel++) {
    output.data[pixel * 3] = 1;
    output.data[pixel * 3 + 1] = material.roughness.data[pixel]!;
    output.data[pixel * 3 + 2] = material.metallic.data[pixel]!;
  }
  return output;
}

function materialXDocument(
  name: string,
  uris: Readonly<Record<string, string>>,
  material: LayeredMaterial,
): string {
  const image = (channel: string, type: "color3" | "float" | "vector3") => (
    `  <image name="${channel}_image" type="${type}">\n`
    + `    <input name="file" type="filename" value="${escapeXml(uris[channel]!)}" />\n`
    + "  </image>"
  );
  const physical = material.physical;
  return [
    "<?xml version=\"1.0\"?>",
    "<materialx version=\"1.38\">",
    image("baseColor", "color3"),
    image("metallic", "float"),
    image("roughness", "float"),
    image("normal", "vector3"),
    image("emission", "color3"),
    image("transmission", "float"),
    image("clearcoat", "float"),
    image("sheenColor", "color3"),
    image("subsurface", "float"),
    `  <standard_surface name="${escapeXml(name)}_surface" type="surfaceshader">`,
    "    <input name=\"base_color\" type=\"color3\" nodename=\"baseColor_image\" />",
    "    <input name=\"metalness\" type=\"float\" nodename=\"metallic_image\" />",
    "    <input name=\"specular_roughness\" type=\"float\" nodename=\"roughness_image\" />",
    "    <input name=\"normal\" type=\"vector3\" nodename=\"normal_image\" />",
    "    <input name=\"emission_color\" type=\"color3\" nodename=\"emission_image\" />",
    `    <input name="specular_IOR" type="float" value="${physical.ior}" />`,
    `    <input name="transmission" type="float" value="${maximumValue(material.transmission)}" nodename="transmission_image" />`,
    `    <input name="coat" type="float" value="${physical.clearcoat}" nodename="clearcoat_image" />`,
    `    <input name="coat_roughness" type="float" value="${physical.clearcoatRoughness}" />`,
    `    <input name="sheen" type="float" value="${physical.sheen}" />`,
    "    <input name=\"sheen_color\" type=\"color3\" nodename=\"sheenColor_image\" />",
    `    <input name="subsurface" type="float" value="${physical.subsurface}" nodename="subsurface_image" />`,
    "  </standard_surface>",
    `  <surfacematerial name="${escapeXml(name)}" type="material">`,
    `    <input name="surfaceshader" type="surfaceshader" nodename="${escapeXml(name)}_surface" />`,
    "  </surfacematerial>",
    "</materialx>",
  ].join("\n");
}

function sanitizeName(value: string): string {
  const result = value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return result || "material";
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

function minimumValue(texture: { readonly data: Float32Array }): number {
  let minimum = Infinity;
  for (const value of texture.data) minimum = Math.min(minimum, value);
  return texture.data.length === 0 ? 0 : minimum;
}

function maximumValue(texture: { readonly data: Float32Array }): number {
  let maximum = -Infinity;
  for (const value of texture.data) maximum = Math.max(maximum, value);
  return texture.data.length === 0 ? 0 : maximum;
}

function meanValue(texture: { readonly data: Float32Array }): number {
  let total = 0;
  for (const value of texture.data) total += value;
  return texture.data.length === 0 ? 0 : total / texture.data.length;
}
