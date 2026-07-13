export type ContentParamValue = number | string | boolean | readonly number[];
export type ContentParams = Record<string, ContentParamValue>;

export interface NumberParamDefinition {
  key: string;
  label: string;
  type?: "number";
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface SelectParamDefinition {
  key: string;
  label: string;
  type: "select";
  options: readonly { label: string; value: string | number }[];
  default: string | number;
}

export interface ToggleParamDefinition {
  key: string;
  label: string;
  type: "toggle";
  default: boolean;
}

export type ContentParamDefinition =
  | NumberParamDefinition
  | SelectParamDefinition
  | ToggleParamDefinition;

export interface ContentMetadata {
  name: string;
  category: string;
  tags: readonly string[];
  description?: string;
  categoryLabel?: string;
}

export interface ContentPreview {
  camera: "persp" | "front" | "side" | "top";
  material?: string;
  background?: string;
}

interface ContentDefinitionBase<P extends ContentParams> {
  id: string;
  version: string;
  metadata: ContentMetadata;
  params: readonly ContentParamDefinition[];
  defaultParams: Readonly<P>;
  preview: ContentPreview;
}

export interface ModelDefinition<P extends ContentParams, Output> extends ContentDefinitionBase<P> {
  kind: "model";
  build(params: Readonly<P>): Output;
}

export interface MaterialDefinition<P extends ContentParams, Output> extends ContentDefinitionBase<P> {
  kind: "material";
  build(params: Readonly<P>): Output;
}

export type AnyModelDefinition = ModelDefinition<ContentParams, unknown>;
export type AnyMaterialDefinition = MaterialDefinition<ContentParams, unknown>;
export type AnyContentDefinition = AnyModelDefinition | AnyMaterialDefinition;

const contentIdPattern = /^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/;
const semverPattern = /^\d+\.\d+\.\d+$/;

function validateDefinition<P extends ContentParams>(definition: ContentDefinitionBase<P>): void {
  if (!contentIdPattern.test(definition.id)) throw new Error(`invalid content id: ${definition.id}`);
  if (!semverPattern.test(definition.version)) throw new Error(`invalid content version: ${definition.version}`);
  if (!definition.metadata.name.trim()) throw new Error(`content ${definition.id} has no name`);
  if (!definition.metadata.category.trim()) throw new Error(`content ${definition.id} has no category`);

  const keys = new Set<string>();
  for (const param of definition.params) {
    if (keys.has(param.key)) throw new Error(`duplicate param ${param.key} in ${definition.id}`);
    keys.add(param.key);
    if (!(param.key in definition.defaultParams)) {
      throw new Error(`missing default param ${param.key} in ${definition.id}`);
    }
  }
}

export function defineModel<P extends ContentParams, Output>(
  definition: ModelDefinition<P, Output>,
): ModelDefinition<P, Output> {
  validateDefinition(definition);
  return Object.freeze(definition);
}

export function defineMaterial<P extends ContentParams, Output>(
  definition: MaterialDefinition<P, Output>,
): MaterialDefinition<P, Output> {
  validateDefinition(definition);
  return Object.freeze(definition);
}

export interface ContentManifest {
  readonly models: readonly AnyModelDefinition[];
  readonly materials: readonly AnyMaterialDefinition[];
  readonly byId: ReadonlyMap<string, AnyContentDefinition>;
}

export function createContentManifest(definitions: readonly AnyContentDefinition[]): ContentManifest {
  const byId = new Map<string, AnyContentDefinition>();
  for (const definition of definitions) {
    if (byId.has(definition.id)) throw new Error(`duplicate content id: ${definition.id}`);
    byId.set(definition.id, definition);
  }
  return Object.freeze({
    models: Object.freeze(definitions.filter((entry): entry is AnyModelDefinition => entry.kind === "model")),
    materials: Object.freeze(definitions.filter((entry): entry is AnyMaterialDefinition => entry.kind === "material")),
    byId,
  });
}

export function toProcModel(definition: AnyModelDefinition) {
  return {
    id: definition.id,
    name: definition.metadata.name,
    category: definition.metadata.category,
    version: definition.version,
    assetMeta: definition.metadata,
    preview: definition.preview,
    schema: definition.params,
    defaultParams: () => ({ ...definition.defaultParams }),
    build: (params: ContentParams) => definition.build(params),
  };
}
