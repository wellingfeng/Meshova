import {
  assertSameField2D,
  cloneField2D,
  field2DStats,
  type Field2D,
  type Field2DStats,
} from "../field/index.js";

export const TERRAIN_FIELD_NAMES = [
  "height",
  "slope",
  "flow",
  "convexity",
  "water",
  "wear",
  "deposition",
] as const;

export type TerrainFieldName = typeof TERRAIN_FIELD_NAMES[number];
export type TerrainMaskFieldName = Exclude<TerrainFieldName, "height">;
export type TerrainMaskMap = Record<TerrainMaskFieldName, Field2D>;
export type TerrainFieldMap = Record<TerrainFieldName, Field2D>;

export interface TerrainFieldSet {
  /** Sample width shared by all terrain data maps. */
  readonly width: number;
  /** Sample height shared by all terrain data maps. */
  readonly height: number;
  /** Height plus first-class derived maps usable by materials, scatter and AI scoring. */
  readonly fields: TerrainFieldMap;
}

export function makeTerrainFieldSet(height: Field2D, masks: TerrainMaskMap): TerrainFieldSet {
  for (const name of Object.keys(masks) as TerrainMaskFieldName[]) {
    assertSameField2D(height, masks[name]);
  }
  return {
    width: height.width,
    height: height.height,
    fields: {
      height,
      slope: masks.slope,
      flow: masks.flow,
      convexity: masks.convexity,
      water: masks.water,
      wear: masks.wear,
      deposition: masks.deposition,
    },
  };
}

export function cloneTerrainFieldSet(set: TerrainFieldSet): TerrainFieldSet {
  return makeTerrainFieldSet(cloneField2D(set.fields.height), {
    slope: cloneField2D(set.fields.slope),
    flow: cloneField2D(set.fields.flow),
    convexity: cloneField2D(set.fields.convexity),
    water: cloneField2D(set.fields.water),
    wear: cloneField2D(set.fields.wear),
    deposition: cloneField2D(set.fields.deposition),
  });
}

export function getTerrainField(set: TerrainFieldSet, name: TerrainFieldName): Field2D {
  return set.fields[name];
}

export function terrainMasksFromFieldSet(set: TerrainFieldSet): TerrainMaskMap {
  return {
    slope: set.fields.slope,
    flow: set.fields.flow,
    convexity: set.fields.convexity,
    water: set.fields.water,
    wear: set.fields.wear,
    deposition: set.fields.deposition,
  };
}

export function terrainFieldSetStats(set: TerrainFieldSet): Record<TerrainFieldName, Field2DStats> {
  return {
    height: field2DStats(set.fields.height),
    slope: field2DStats(set.fields.slope),
    flow: field2DStats(set.fields.flow),
    convexity: field2DStats(set.fields.convexity),
    water: field2DStats(set.fields.water),
    wear: field2DStats(set.fields.wear),
    deposition: field2DStats(set.fields.deposition),
  };
}
