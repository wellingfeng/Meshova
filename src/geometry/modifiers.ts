/**
 * Non-destructive mesh modifier stack.
 *
 * Existing geometry operators remain the implementation kernels. Modifiers add
 * ordered evaluation, enable/disable state, immutable parameter edits, and
 * inspectable intermediate stages without introducing a second geometry API.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3 } from "../math/vec3.js";
import type { Mesh } from "./mesh.js";
import { computeNormals, merge } from "./mesh.js";
import { transform, type TransformOptions } from "./transform.js";
import {
  array,
  displaceByNoise,
  subdivide,
  type ArrayOptions,
  type DisplaceOptions,
} from "./ops.js";
import { catmullClark } from "./subdivision.js";
import {
  bevelEdges,
  solidify,
  type EdgeBevelOptions,
  type SolidifyOptions,
} from "./edit.js";
import {
  bendMesh,
  stretchMesh,
  taperMesh,
  twistMesh,
  type BendOptions,
  type StretchOptions,
  type TaperOptions,
  type TwistOptions,
} from "./deform.js";

export type ModifierCategory = "generate" | "deform" | "normal";

export interface MeshModifier<Parameters extends object = object> {
  readonly type: string;
  readonly name: string;
  readonly category: ModifierCategory;
  readonly enabled: boolean;
  readonly parameters: Readonly<Parameters>;
  apply(mesh: Mesh): Mesh;
  withParameters(parameters: Readonly<Parameters>): MeshModifier<Parameters>;
  withEnabled(enabled: boolean): MeshModifier<Parameters>;
}

export interface ModifierSettings {
  name?: string;
  enabled?: boolean;
}

export interface ModifierDefinition<Parameters extends object> extends ModifierSettings {
  type: string;
  category: ModifierCategory;
  parameters: Parameters;
  apply(mesh: Mesh, parameters: Readonly<Parameters>): Mesh;
}

/** Define a custom modifier while keeping parameter updates immutable. */
export function defineModifier<Parameters extends object>(
  definition: ModifierDefinition<Parameters>,
): MeshModifier<Parameters> {
  if (definition.type.trim().length === 0) throw new Error("modifier type must not be empty");
  const build = (
    parameters: Readonly<Parameters>,
    enabled: boolean,
  ): MeshModifier<Parameters> => {
    const storedParameters = { ...parameters } as Parameters;
    return {
      type: definition.type,
      name: definition.name ?? definition.type,
      category: definition.category,
      enabled,
      parameters: storedParameters,
      apply: (mesh) => definition.apply(mesh, storedParameters),
      withParameters: (next) => build(next, enabled),
      withEnabled: (next) => build(storedParameters, next),
    };
  };
  return build(definition.parameters, definition.enabled ?? true);
}

/** Return a new modifier with patched parameters. */
export function updateModifier<Parameters extends object>(
  modifier: MeshModifier<Parameters>,
  patch: Partial<Parameters>,
): MeshModifier<Parameters> {
  return modifier.withParameters({ ...modifier.parameters, ...patch } as Parameters);
}

/** Return a new modifier with changed viewport/evaluation state. */
export function setModifierEnabled<Parameters extends object>(
  modifier: MeshModifier<Parameters>,
  enabled: boolean,
): MeshModifier<Parameters> {
  return modifier.withEnabled(enabled);
}

export interface ModifierStage {
  readonly index: number;
  readonly modifier: MeshModifier;
  readonly applied: boolean;
  readonly input: Mesh;
  readonly output: Mesh;
}

export interface ModifierEvaluation {
  readonly mesh: Mesh;
  readonly stages: ReadonlyArray<ModifierStage>;
}

/** Evaluate a stack and retain every intermediate mesh for previews/debugging. */
export function evaluateModifierStack(
  input: Mesh,
  modifiers: ReadonlyArray<MeshModifier>,
): ModifierEvaluation {
  let mesh = input;
  const stages: ModifierStage[] = [];
  for (let index = 0; index < modifiers.length; index++) {
    const modifier = modifiers[index]!;
    const stageInput = mesh;
    if (modifier.enabled) mesh = applyModifierAtIndex(mesh, modifier, index);
    stages.push({ index, modifier, applied: modifier.enabled, input: stageInput, output: mesh });
  }
  return { mesh, stages };
}

/** Evaluate modifiers in list order and return only the final mesh. */
export function applyModifierStack(
  input: Mesh,
  modifiers: ReadonlyArray<MeshModifier>,
): Mesh {
  let mesh = input;
  for (let index = 0; index < modifiers.length; index++) {
    const modifier = modifiers[index]!;
    if (modifier.enabled) mesh = applyModifierAtIndex(mesh, modifier, index);
  }
  return mesh;
}

/** Apply one modifier. Disabled modifiers pass the input through unchanged. */
export function applyModifier(input: Mesh, modifier: MeshModifier): Mesh {
  return modifier.enabled ? applyModifierAtIndex(input, modifier, 0) : input;
}

function applyModifierAtIndex(input: Mesh, modifier: MeshModifier, index: number): Mesh {
  try {
    const output = modifier.apply(input);
    assertModifierOutput(output);
    return output;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `modifier "${modifier.name}" (${modifier.type}) failed at index ${index}: ${detail}`,
      { cause: error },
    );
  }
}

function assertModifierOutput(mesh: Mesh): void {
  if (mesh.normals.length !== mesh.positions.length) {
    throw new Error("output normals length does not match positions length");
  }
  if (mesh.uvs.length !== mesh.positions.length) {
    throw new Error("output uvs length does not match positions length");
  }
  if (mesh.indices.length % 3 !== 0) {
    throw new Error("output indices length is not a multiple of 3");
  }
  for (const index of mesh.indices) {
    if (!Number.isInteger(index) || index < 0 || index >= mesh.positions.length) {
      throw new Error(`output index ${index} is outside the vertex array`);
    }
  }
}

function builtInModifier<Parameters extends object>(
  type: string,
  name: string,
  category: ModifierCategory,
  parameters: Parameters,
  apply: (mesh: Mesh, parameters: Readonly<Parameters>) => Mesh,
  settings: ModifierSettings,
): MeshModifier<Parameters> {
  return defineModifier({
    type,
    name: settings.name ?? name,
    enabled: settings.enabled ?? true,
    category,
    parameters,
    apply,
  });
}

export function transformModifier(
  parameters: TransformOptions = {},
  settings: ModifierSettings = {},
): MeshModifier<TransformOptions> {
  return builtInModifier("transform", "Transform", "deform", parameters, transform, settings);
}

export type MirrorAxis = "x" | "y" | "z";

export interface MirrorOptions {
  axis?: MirrorAxis;
  origin?: Vec3;
  /** Keep the source beside its reflected copy. Defaults to true. */
  includeOriginal?: boolean;
}

/** Reflect across an object-space axis plane and correct triangle winding. */
export function mirrorMesh(mesh: Mesh, options: MirrorOptions = {}): Mesh {
  const axis = options.axis ?? "x";
  const origin = options.origin ?? vec3(0, 0, 0);
  const reflected: Mesh = {
    positions: mesh.positions.map((position) => {
      if (axis === "x") return vec3(origin.x * 2 - position.x, position.y, position.z);
      if (axis === "y") return vec3(position.x, origin.y * 2 - position.y, position.z);
      return vec3(position.x, position.y, origin.z * 2 - position.z);
    }),
    normals: mesh.normals.map((normal) => {
      if (axis === "x") return vec3(-normal.x, normal.y, normal.z);
      if (axis === "y") return vec3(normal.x, -normal.y, normal.z);
      return vec3(normal.x, normal.y, -normal.z);
    }),
    uvs: mesh.uvs.map((uv) => ({ ...uv })),
    indices: reverseTriangleWinding(mesh.indices),
  };
  return options.includeOriginal ?? true ? merge(mesh, reflected) : reflected;
}

function reverseTriangleWinding(indices: ReadonlyArray<number>): number[] {
  const result: number[] = [];
  for (let index = 0; index < indices.length; index += 3) {
    result.push(indices[index]!, indices[index + 2]!, indices[index + 1]!);
  }
  return result;
}

export function mirrorModifier(
  parameters: MirrorOptions = {},
  settings: ModifierSettings = {},
): MeshModifier<MirrorOptions> {
  return builtInModifier("mirror", "Mirror", "generate", parameters, mirrorMesh, settings);
}

export interface SubdivisionModifierOptions {
  mode?: "simple" | "catmull-clark";
  levels?: number;
}

export function subdivisionModifier(
  parameters: SubdivisionModifierOptions = {},
  settings: ModifierSettings = {},
): MeshModifier<SubdivisionModifierOptions> {
  return builtInModifier(
    "subdivision",
    "Subdivision Surface",
    "generate",
    parameters,
    (mesh, options) => {
      const levels = Math.max(0, Math.floor(options.levels ?? 1));
      if (levels === 0) return mesh;
      return options.mode === "simple" ? subdivide(mesh, levels) : catmullClark(mesh, levels);
    },
    settings,
  );
}

export function bevelModifier(
  parameters: EdgeBevelOptions = {},
  settings: ModifierSettings = {},
): MeshModifier<EdgeBevelOptions> {
  return builtInModifier("bevel", "Bevel", "generate", parameters, bevelEdges, settings);
}

export function solidifyModifier(
  parameters: SolidifyOptions = {},
  settings: ModifierSettings = {},
): MeshModifier<SolidifyOptions> {
  return builtInModifier("solidify", "Solidify", "generate", parameters, solidify, settings);
}

export function displaceModifier(
  parameters: DisplaceOptions = {},
  settings: ModifierSettings = {},
): MeshModifier<DisplaceOptions> {
  return builtInModifier("displace", "Displace", "deform", parameters, displaceByNoise, settings);
}

export function arrayModifier(
  parameters: ArrayOptions,
  settings: ModifierSettings = {},
): MeshModifier<ArrayOptions> {
  return builtInModifier("array", "Array", "generate", parameters, array, settings);
}

export function taperModifier(
  parameters: TaperOptions = {},
  settings: ModifierSettings = {},
): MeshModifier<TaperOptions> {
  return builtInModifier("taper", "Taper", "deform", parameters, taperMesh, settings);
}

export function twistModifier(
  parameters: TwistOptions = {},
  settings: ModifierSettings = {},
): MeshModifier<TwistOptions> {
  return builtInModifier("twist", "Twist", "deform", parameters, twistMesh, settings);
}

export function bendModifier(
  parameters: BendOptions = {},
  settings: ModifierSettings = {},
): MeshModifier<BendOptions> {
  return builtInModifier("bend", "Bend", "deform", parameters, bendMesh, settings);
}

export function stretchModifier(
  parameters: StretchOptions = {},
  settings: ModifierSettings = {},
): MeshModifier<StretchOptions> {
  return builtInModifier("stretch", "Stretch", "deform", parameters, stretchMesh, settings);
}

export interface NormalModifierOptions {
  cuspAngle?: number;
}

export function normalModifier(
  parameters: NormalModifierOptions = {},
  settings: ModifierSettings = {},
): MeshModifier<NormalModifierOptions> {
  return builtInModifier(
    "normal",
    "Normal",
    "normal",
    parameters,
    (mesh, options) => computeNormals(mesh, options.cuspAngle ?? 40),
    settings,
  );
}
