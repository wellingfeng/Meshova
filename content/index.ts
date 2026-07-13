import { toProcModel, type ContentParams } from "meshova/pcg";
import { contentManifest } from "./manifest.generated.js";

export { contentManifest } from "./manifest.generated.js";

export const CONTENT_MODELS = Object.fromEntries(
  contentManifest.models.map((definition) => [definition.id, toProcModel(definition)]),
);

export const CONTENT_MATERIALS = Object.fromEntries(
  contentManifest.materials.map((definition) => [definition.id, definition]),
);

export const CONTENT_MATERIAL_PARAM_SCHEMA = Object.fromEntries(
  contentManifest.materials.map((definition) => [definition.id, definition.params]),
);

export function defaultContentMaterialParams(id: string): ContentParams {
  const definition = CONTENT_MATERIALS[id];
  if (!definition) throw new Error(`unknown content material: ${id}`);
  return { ...definition.defaultParams };
}
