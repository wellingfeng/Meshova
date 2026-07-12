/**
 * Export a Material as a set of PNG maps, the P5 acceptance deliverable
 * ("script generates a PBR set and exports a PNG collection").
 */
import type { Material } from "./pbr.js";
import type { ExtendedMaterial } from "./material-mechanics.js";
import type { LayeredMaterial } from "./shading-mechanics.js";
import { textureToPNG } from "./png.js";
import {
  describeLayeredMaterial,
  type MaterialInterchangeDescriptors,
  type MaterialInterchangeOptions,
} from "./material-interchange.js";

export interface PBRExport {
  /** filename suffix -> PNG bytes */
  files: Record<string, Uint8Array>;
}

/** Produce one PNG per PBR channel, keyed by conventional suffix. */
export function exportPBR(mat: Material, baseName = "material"): PBRExport {
  return {
    files: {
      [`${baseName}_baseColor.png`]: textureToPNG(mat.baseColor),
      [`${baseName}_metallic.png`]: textureToPNG(mat.metallic),
      [`${baseName}_roughness.png`]: textureToPNG(mat.roughness),
      [`${baseName}_normal.png`]: textureToPNG(mat.normal),
      [`${baseName}_ao.png`]: textureToPNG(mat.ao),
      [`${baseName}_height.png`]: textureToPNG(mat.height),
      [`${baseName}_emission.png`]: textureToPNG(mat.emission),
    },
  };
}

/** Produce the standard PBR maps plus opacity, transmission and anisotropy maps. */
export function exportExtendedPBR(mat: ExtendedMaterial, baseName = "material"): PBRExport {
  const standard = exportPBR(mat, baseName);
  return {
    files: {
      ...standard.files,
      [`${baseName}_opacity.png`]: textureToPNG(mat.opacity),
      [`${baseName}_transmission.png`]: textureToPNG(mat.transmission),
      [`${baseName}_anisotropy.png`]: textureToPNG(mat.anisotropy),
      [`${baseName}_anisotropyRotation.png`]: textureToPNG(mat.anisotropyRotation),
    },
  };
}

export function exportLayeredPBR(mat: LayeredMaterial, baseName = "material"): PBRExport {
  const extended = exportExtendedPBR(mat, baseName);
  return {
    files: {
      ...extended.files,
      [`${baseName}_clearcoat.png`]: textureToPNG(mat.clearcoat),
      [`${baseName}_clearcoatRoughness.png`]: textureToPNG(mat.clearcoatRoughness),
      [`${baseName}_sheen.png`]: textureToPNG(mat.sheen),
      [`${baseName}_sheenColor.png`]: textureToPNG(mat.sheenColor),
      [`${baseName}_thickness.png`]: textureToPNG(mat.thicknessMap),
      [`${baseName}_subsurface.png`]: textureToPNG(mat.subsurface),
      [`${baseName}_iridescence.png`]: textureToPNG(mat.iridescence),
      [`${baseName}_iridescenceThickness.png`]: textureToPNG(mat.iridescenceThickness),
    },
  };
}

export interface LayeredInterchangeExport extends PBRExport {
  readonly descriptors: MaterialInterchangeDescriptors;
}

/** Advanced PBR PNGs plus glTF packed maps and MaterialX/glTF descriptors. */
export function exportLayeredInterchange(
  material: LayeredMaterial,
  options: MaterialInterchangeOptions = {},
): LayeredInterchangeExport {
  const baseName = options.baseName ?? "material";
  const standard = exportLayeredPBR(material, baseName);
  const descriptors = describeLayeredMaterial(material, options);
  return {
    files: {
      ...standard.files,
      [descriptors.textureUris.baseColorOpacity!]: textureToPNG(descriptors.packedTextures.baseColorOpacity),
      [descriptors.textureUris.metallicRoughness!]: textureToPNG(descriptors.packedTextures.metallicRoughness),
    },
    descriptors,
  };
}
