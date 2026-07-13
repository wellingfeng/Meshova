/**
 * Non-destructive mesh modifier stack.
 *
 * Existing geometry operators remain the implementation kernels. Modifiers add
 * ordered evaluation, enable/disable state, immutable parameter edits, and
 * inspectable intermediate stages without introducing a second geometry API.
 */
import type { Vec3 } from "../math/vec3.js";
import { add, normalize, scale, sub, vec3 } from "../math/vec3.js";
import type { Curve } from "./curve.js";
import type { Mesh } from "./mesh.js";
import { computeNormals, makeMesh, merge } from "./mesh.js";
import { cleanMesh } from "./blast.js";
import { intersect, subtract, union } from "./boolean.js";
import { simulateCloth, type ClothSimOptions } from "./cloth.js";
import {
  deformByControlLattice,
  type ControlLatticeOptions,
} from "./control-lattice.js";
import { transform, type TransformOptions } from "./transform.js";
import {
  array,
  displaceByNoise,
  scatterOnSurface,
  subdivide,
  type ArrayOptions,
  type DisplaceOptions,
  type ScatterOptions,
} from "./ops.js";
import { voxelRemesh, type RemeshOptions } from "./remesh.js";
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
import {
  castMesh,
  correctiveSmoothMesh,
  decimateMesh,
  buildMesh,
  curveDeformMesh,
  edgeSplitMesh,
  laplacianSmoothMesh,
  maskMesh,
  screwMesh,
  shrinkwrapMesh,
  skinMesh,
  smoothMesh,
  waveMesh,
  weightedNormalMesh,
  wireframeMesh,
  type BuildMeshOptions,
  type CastMeshOptions,
  type CorrectiveSmoothOptions,
  type CurveDeformOptions,
  type DecimateOptions,
  type EdgeSplitOptions,
  type LaplacianSmoothOptions,
  type MaskMeshOptions,
  type ScrewMeshOptions,
  type ShrinkwrapOptions,
  type SkinMeshOptions,
  type SmoothMeshOptions,
  type WaveMeshOptions,
  type WeightedNormalOptions,
  type WireframeOptions,
} from "./modifier-kernels.js";

export type ModifierCategory =
  | "generate"
  | "deform"
  | "edit"
  | "physics"
  | "attribute"
  | "normal";

export interface ModifierContext {
  readonly meshes?: Readonly<Record<string, Mesh>>;
  readonly curves?: Readonly<Record<string, Curve>>;
  readonly pointSets?: Readonly<Record<string, ReadonlyArray<Vec3>>>;
  readonly faceSets?: Readonly<Record<string, ReadonlyArray<number>>>;
  readonly seed?: number;
  readonly time?: number;
}

export interface MeshModifier<Parameters extends object = object> {
  readonly type: string;
  readonly name: string;
  readonly category: ModifierCategory;
  readonly enabled: boolean;
  readonly parameters: Readonly<Parameters>;
  apply(mesh: Mesh, context?: ModifierContext): Mesh;
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
  apply(mesh: Mesh, parameters: Readonly<Parameters>, context: ModifierContext): Mesh;
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
      apply: (mesh, context = {}) => definition.apply(mesh, storedParameters, context),
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
  context: ModifierContext = {},
): ModifierEvaluation {
  let mesh = input;
  const stages: ModifierStage[] = [];
  for (let index = 0; index < modifiers.length; index++) {
    const modifier = modifiers[index]!;
    const stageInput = mesh;
    if (modifier.enabled) mesh = applyModifierAtIndex(mesh, modifier, index, context);
    stages.push({ index, modifier, applied: modifier.enabled, input: stageInput, output: mesh });
  }
  return { mesh, stages };
}

/** Evaluate modifiers in list order and return only the final mesh. */
export function applyModifierStack(
  input: Mesh,
  modifiers: ReadonlyArray<MeshModifier>,
  context: ModifierContext = {},
): Mesh {
  let mesh = input;
  for (let index = 0; index < modifiers.length; index++) {
    const modifier = modifiers[index]!;
    if (modifier.enabled) mesh = applyModifierAtIndex(mesh, modifier, index, context);
  }
  return mesh;
}

/** Apply one modifier. Disabled modifiers pass the input through unchanged. */
export function applyModifier(
  input: Mesh,
  modifier: MeshModifier,
  context: ModifierContext = {},
): Mesh {
  return modifier.enabled ? applyModifierAtIndex(input, modifier, 0, context) : input;
}

function applyModifierAtIndex(
  input: Mesh,
  modifier: MeshModifier,
  index: number,
  context: ModifierContext,
): Mesh {
  try {
    const output = modifier.apply(input, context);
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
  apply: (mesh: Mesh, parameters: Readonly<Parameters>, context: ModifierContext) => Mesh,
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
  axes?: ReadonlyArray<MirrorAxis>;
  origin?: Vec3;
  /** Keep the source beside its reflected copy. Defaults to true. */
  includeOriginal?: boolean;
  /** Weld coincident seam vertices after reflection. */
  merge?: boolean;
  mergeTolerance?: number;
  /** Cut the source at selected mirror planes before reflection. */
  bisect?: boolean | ReadonlyArray<MirrorAxis>;
  bisectSide?: "positive" | "negative";
  /** Snap near-plane vertices to the plane and weld the seam. */
  clip?: boolean;
}

/** Reflect across an object-space axis plane and correct triangle winding. */
export function mirrorMesh(mesh: Mesh, options: MirrorOptions = {}): Mesh {
  const axes = options.axes?.length ? [...new Set(options.axes)] : [options.axis ?? "x"];
  const origin = options.origin ?? vec3(0, 0, 0);
  const tolerance = options.mergeTolerance ?? 1e-5;
  const bisectAxes = options.bisect === true ? axes : options.bisect || [];
  let source = mesh;
  for (const axis of bisectAxes) {
    source = clipMeshToAxisPlane(source, axis, origin, options.bisectSide ?? "positive");
  }
  if (options.clip) source = snapToMirrorPlanes(source, axes, origin, tolerance);
  let copies = [source];
  for (const axis of axes) {
    copies = [...copies, ...copies.map((copy) => reflectMesh(copy, axis, origin))];
  }
  if (!(options.includeOriginal ?? true)) copies.shift();
  const result = merge(...copies);
  return options.merge || options.clip ? cleanMesh(result, tolerance) : result;
}

interface ClipVertex {
  position: Vec3;
  normal: Vec3;
  uv: { x: number; y: number };
}

function clipMeshToAxisPlane(
  mesh: Mesh,
  axis: MirrorAxis,
  origin: Vec3,
  side: "positive" | "negative",
): Mesh {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Array<{ x: number; y: number }> = [];
  const indices: number[] = [];
  const sign = side === "positive" ? 1 : -1;
  for (let index = 0; index < mesh.indices.length; index += 3) {
    let polygon: ClipVertex[] = [0, 1, 2].map((local) => {
      const vertex = mesh.indices[index + local]!;
      return {
        position: mesh.positions[vertex]!,
        normal: mesh.normals[vertex]!,
        uv: mesh.uvs[vertex]!,
      };
    });
    const clipped: ClipVertex[] = [];
    for (let corner = 0; corner < polygon.length; corner++) {
      const current = polygon[corner]!;
      const previous = polygon[(corner + polygon.length - 1) % polygon.length]!;
      const currentDistance = signedAxisDistance(current.position, axis, origin) * sign;
      const previousDistance = signedAxisDistance(previous.position, axis, origin) * sign;
      const currentInside = currentDistance >= -1e-12;
      const previousInside = previousDistance >= -1e-12;
      if (currentInside !== previousInside) {
        const parameter = previousDistance / (previousDistance - currentDistance);
        clipped.push(interpolateClipVertex(previous, current, parameter));
      }
      if (currentInside) clipped.push(current);
    }
    polygon = clipped;
    for (let corner = 1; corner < polygon.length - 1; corner++) {
      for (const vertex of [polygon[0]!, polygon[corner]!, polygon[corner + 1]!]) {
        indices.push(positions.length);
        positions.push(vertex.position);
        normals.push(vertex.normal);
        uvs.push(vertex.uv);
      }
    }
  }
  return computeNormals(makeMesh({ positions, normals, uvs, indices }), 180);
}

function signedAxisDistance(position: Vec3, axis: MirrorAxis, origin: Vec3): number {
  return axis === "x"
    ? position.x - origin.x
    : axis === "y"
      ? position.y - origin.y
      : position.z - origin.z;
}

function interpolateClipVertex(start: ClipVertex, end: ClipVertex, parameter: number): ClipVertex {
  return {
    position: add(start.position, scale(sub(end.position, start.position), parameter)),
    normal: normalize(add(start.normal, scale(sub(end.normal, start.normal), parameter))),
    uv: {
      x: start.uv.x + (end.uv.x - start.uv.x) * parameter,
      y: start.uv.y + (end.uv.y - start.uv.y) * parameter,
    },
  };
}

function snapToMirrorPlanes(
  mesh: Mesh,
  axes: ReadonlyArray<MirrorAxis>,
  origin: Vec3,
  tolerance: number,
): Mesh {
  const positions = mesh.positions.map((position) => {
    let x = position.x;
    let y = position.y;
    let z = position.z;
    if (axes.includes("x") && Math.abs(x - origin.x) <= tolerance) x = origin.x;
    if (axes.includes("y") && Math.abs(y - origin.y) <= tolerance) y = origin.y;
    if (axes.includes("z") && Math.abs(z - origin.z) <= tolerance) z = origin.z;
    return vec3(x, y, z);
  });
  return { positions, normals: mesh.normals.slice(), uvs: mesh.uvs.slice(), indices: mesh.indices.slice() };
}

function reflectMesh(mesh: Mesh, axis: MirrorAxis, origin: Vec3): Mesh {
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
  return reflected;
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

export type BooleanOperation = "union" | "subtract" | "intersect";

export interface BooleanModifierOptions {
  operation?: BooleanOperation;
  target: string;
  cleanupTolerance?: number;
}

export function booleanModifier(
  parameters: BooleanModifierOptions,
  settings: ModifierSettings = {},
): MeshModifier<BooleanModifierOptions> {
  return builtInModifier(
    "boolean",
    "Boolean",
    "generate",
    parameters,
    (mesh, options, context) => {
      const target = contextMesh(context, options.target, "Boolean");
      const result = options.operation === "intersect"
        ? intersect(mesh, target)
        : options.operation === "union"
          ? union(mesh, target)
          : subtract(mesh, target);
      return options.cleanupTolerance === undefined
        ? result
        : cleanMesh(result, options.cleanupTolerance);
    },
    settings,
  );
}

export function voxelRemeshModifier(
  parameters: RemeshOptions = {},
  settings: ModifierSettings = {},
): MeshModifier<RemeshOptions> {
  return builtInModifier("voxel-remesh", "Voxel Remesh", "generate", parameters, voxelRemesh, settings);
}

export interface CleanModifierOptions {
  tolerance?: number;
}

export function cleanModifier(
  parameters: CleanModifierOptions = {},
  settings: ModifierSettings = {},
): MeshModifier<CleanModifierOptions> {
  return builtInModifier(
    "clean",
    "Clean",
    "edit",
    parameters,
    (mesh, options) => cleanMesh(mesh, options.tolerance ?? 1e-4),
    settings,
  );
}

export interface LatticeModifierOptions extends ControlLatticeOptions {
  basePoints: string;
  editedPoints: string;
}

export function latticeModifier(
  parameters: LatticeModifierOptions,
  settings: ModifierSettings = {},
): MeshModifier<LatticeModifierOptions> {
  return builtInModifier(
    "lattice",
    "Lattice",
    "deform",
    parameters,
    (mesh, options, context) => deformByControlLattice(
      mesh,
      contextPointSet(context, options.basePoints, "Lattice"),
      contextPointSet(context, options.editedPoints, "Lattice"),
      options,
    ),
    settings,
  );
}

export function clothModifier(
  parameters: ClothSimOptions = {},
  settings: ModifierSettings = {},
): MeshModifier<ClothSimOptions> {
  return builtInModifier("cloth", "Cloth", "physics", parameters, simulateCloth, settings);
}

export interface SurfaceScatterModifierOptions extends ScatterOptions {
  instance: string;
  includeSurface?: boolean;
}

export function surfaceScatterModifier(
  parameters: SurfaceScatterModifierOptions,
  settings: ModifierSettings = {},
): MeshModifier<SurfaceScatterModifierOptions> {
  return builtInModifier(
    "surface-scatter",
    "Surface Scatter",
    "generate",
    parameters,
    (mesh, options, context) => {
      const instance = contextMesh(context, options.instance, "Surface Scatter");
      const scattered = scatterOnSurface(mesh, instance, options);
      return options.includeSurface ? merge(mesh, scattered) : scattered;
    },
    settings,
  );
}

export function smoothModifier(
  parameters: SmoothMeshOptions = {},
  settings: ModifierSettings = {},
): MeshModifier<SmoothMeshOptions> {
  return builtInModifier("smooth", "Smooth", "deform", parameters, smoothMesh, settings);
}

export function decimateModifier(
  parameters: DecimateOptions = {},
  settings: ModifierSettings = {},
): MeshModifier<DecimateOptions> {
  return builtInModifier("decimate", "Decimate", "generate", parameters, decimateMesh, settings);
}

export function wireframeModifier(
  parameters: WireframeOptions = {},
  settings: ModifierSettings = {},
): MeshModifier<WireframeOptions> {
  return builtInModifier("wireframe", "Wireframe", "generate", parameters, wireframeMesh, settings);
}

export interface ShrinkwrapModifierOptions extends ShrinkwrapOptions {
  target: string;
}

export function shrinkwrapModifier(
  parameters: ShrinkwrapModifierOptions,
  settings: ModifierSettings = {},
): MeshModifier<ShrinkwrapModifierOptions> {
  return builtInModifier(
    "shrinkwrap",
    "Shrinkwrap",
    "deform",
    parameters,
    (mesh, options, context) => shrinkwrapMesh(
      mesh,
      contextMesh(context, options.target, "Shrinkwrap"),
      options,
    ),
    settings,
  );
}

export function weightedNormalModifier(
  parameters: WeightedNormalOptions = {},
  settings: ModifierSettings = {},
): MeshModifier<WeightedNormalOptions> {
  return builtInModifier(
    "weighted-normal",
    "Weighted Normal",
    "normal",
    parameters,
    weightedNormalMesh,
    settings,
  );
}

export function edgeSplitModifier(
  parameters: EdgeSplitOptions = {},
  settings: ModifierSettings = {},
): MeshModifier<EdgeSplitOptions> {
  return builtInModifier("edge-split", "Edge Split", "edit", parameters, edgeSplitMesh, settings);
}

export interface CurveDeformModifierOptions extends CurveDeformOptions {
  curve: string;
}

export function curveDeformModifier(
  parameters: CurveDeformModifierOptions,
  settings: ModifierSettings = {},
): MeshModifier<CurveDeformModifierOptions> {
  return builtInModifier(
    "curve-deform",
    "Curve Deform",
    "deform",
    parameters,
    (mesh, options, context) => curveDeformMesh(
      mesh,
      contextCurve(context, options.curve, "Curve Deform"),
      options,
    ),
    settings,
  );
}

export function buildModifier(
  parameters: BuildMeshOptions = {},
  settings: ModifierSettings = {},
): MeshModifier<BuildMeshOptions> {
  return builtInModifier("build", "Build", "generate", parameters, buildMesh, settings);
}

export interface MaskModifierOptions extends MaskMeshOptions {
  faceSet: string;
}

export function maskModifier(
  parameters: MaskModifierOptions,
  settings: ModifierSettings = {},
): MeshModifier<MaskModifierOptions> {
  return builtInModifier(
    "mask",
    "Mask",
    "edit",
    parameters,
    (mesh, options, context) => maskMesh(
      mesh,
      contextFaceSet(context, options.faceSet, "Mask"),
      options,
    ),
    settings,
  );
}

export function screwModifier(
  parameters: ScrewMeshOptions = {},
  settings: ModifierSettings = {},
): MeshModifier<ScrewMeshOptions> {
  return builtInModifier("screw", "Screw", "generate", parameters, screwMesh, settings);
}

export function skinModifier(
  parameters: SkinMeshOptions = {},
  settings: ModifierSettings = {},
): MeshModifier<SkinMeshOptions> {
  return builtInModifier("skin", "Skin", "generate", parameters, skinMesh, settings);
}

export function castModifier(
  parameters: CastMeshOptions = {},
  settings: ModifierSettings = {},
): MeshModifier<CastMeshOptions> {
  return builtInModifier("cast", "Cast", "deform", parameters, castMesh, settings);
}

export interface WaveModifierOptions extends WaveMeshOptions {
  time?: number;
}

export function waveModifier(
  parameters: WaveModifierOptions = {},
  settings: ModifierSettings = {},
): MeshModifier<WaveModifierOptions> {
  return builtInModifier(
    "wave",
    "Wave",
    "deform",
    parameters,
    (mesh, options, context) => waveMesh(mesh, options.time ?? context.time ?? 0, options),
    settings,
  );
}

export function laplacianSmoothModifier(
  parameters: LaplacianSmoothOptions = {},
  settings: ModifierSettings = {},
): MeshModifier<LaplacianSmoothOptions> {
  return builtInModifier(
    "laplacian-smooth",
    "Laplacian Smooth",
    "deform",
    parameters,
    laplacianSmoothMesh,
    settings,
  );
}

export interface CorrectiveSmoothModifierOptions extends CorrectiveSmoothOptions {
  rest: string;
}

export function correctiveSmoothModifier(
  parameters: CorrectiveSmoothModifierOptions,
  settings: ModifierSettings = {},
): MeshModifier<CorrectiveSmoothModifierOptions> {
  return builtInModifier(
    "corrective-smooth",
    "Corrective Smooth",
    "deform",
    parameters,
    (mesh, options, context) => correctiveSmoothMesh(
      mesh,
      contextMesh(context, options.rest, "Corrective Smooth"),
      options,
    ),
    settings,
  );
}

function contextMesh(context: ModifierContext, key: string, modifier: string): Mesh {
  const mesh = context.meshes?.[key];
  if (!mesh) throw new Error(`${modifier} target mesh "${key}" was not found in modifier context`);
  return mesh;
}

function contextPointSet(
  context: ModifierContext,
  key: string,
  modifier: string,
): ReadonlyArray<Vec3> {
  const points = context.pointSets?.[key];
  if (!points) throw new Error(`${modifier} point set "${key}" was not found in modifier context`);
  return points;
}

function contextCurve(context: ModifierContext, key: string, modifier: string): Curve {
  const curve = context.curves?.[key];
  if (!curve) throw new Error(`${modifier} curve "${key}" was not found in modifier context`);
  return curve;
}

function contextFaceSet(
  context: ModifierContext,
  key: string,
  modifier: string,
): ReadonlyArray<number> {
  const faces = context.faceSets?.[key];
  if (!faces) throw new Error(`${modifier} face set "${key}" was not found in modifier context`);
  return faces;
}
