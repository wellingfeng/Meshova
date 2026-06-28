/**
 * Export a Material as a set of PNG maps, the P5 acceptance deliverable
 * ("script generates a PBR set and exports a PNG collection").
 */
import type { Material } from "./pbr.js";
import { textureToPNG } from "./png.js";

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
