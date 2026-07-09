/**
 * Discrete biome classification over a normalized heightfield.
 *
 * The continuous heightfield stays the source of truth; this layer answers the
 * categorical question "which biome is this cell?" by walking an ordered
 * elevation-threshold table (highest band first), the same idea as the
 * reference PCG tile map but kept deterministic and field-driven. Optional
 * water and slope overrides let a low/steep cell reclassify to sea/rock without
 * duplicating threshold rows.
 */
import { field2DStats, makeField2D, type Field2D } from "../field/index.js";
import { clamp } from "../math/scalar.js";

export type Rgb = [number, number, number];

export interface BiomeBand {
  /** Stable id, e.g. "grass". */
  id: string;
  /** Human-readable label for UI. */
  label?: string;
  /**
   * Minimum normalized elevation (0..1) for this band. Bands are matched from
   * the highest threshold down, so the first band whose value <= elevation wins.
   */
  minElevation: number;
  /** Linear RGB 0..1 painted for this band. */
  color: Rgb;
  /** When true, cells flagged as water never fall into this band. */
  landOnly?: boolean;
}

export interface BiomeTable {
  name?: string;
  bands: BiomeBand[];
  /**
   * Elevation at/below which a cell is forced to `waterBiome` (normalized).
   * Set to a negative number to disable water override.
   */
  waterLevel?: number;
  /** Band id used when a cell is below waterLevel. Must exist in `bands`. */
  waterBiome?: string;
  /**
   * Slope (0..1) at/above which a cell is forced to `slopeBiome`, overriding
   * its elevation band (cliffs read as rock regardless of height). Set >= 1 to
   * disable.
   */
  slopeLevel?: number;
  /** Band id used for steep cells. Must exist in `bands`. */
  slopeBiome?: string;
}

export interface BiomeClassification {
  readonly table: BiomeTable;
  readonly width: number;
  readonly height: number;
  /** Per-cell band index into `table.bands`, row-major. */
  readonly index: Int32Array;
  /** Per-cell RGB triples matching mesh vertex order, row-major. */
  readonly colors: number[];
  /** Cell count per band id. */
  readonly histogram: Record<string, number>;
}

function normalizedElevation(height: Field2D): Field2D {
  const stats = field2DStats(height);
  const span = stats.max - stats.min || 1;
  const out = makeField2D(height.width, height.height);
  for (let i = 0; i < height.data.length; i++) {
    out.data[i] = clamp((height.data[i]! - stats.min) / span, 0, 1);
  }
  return out;
}

function sortedBands(bands: BiomeBand[]): { band: BiomeBand; original: number }[] {
  return bands
    .map((band, original) => ({ band, original }))
    .sort((a, b) => b.band.minElevation - a.band.minElevation);
}

/**
 * Classify each cell of a heightfield into a discrete biome band.
 *
 * `height` may be raw world height; it is min/max normalized internally so the
 * threshold table reads in 0..1 regardless of world scale. Pass an already
 * normalized field and the normalize step is effectively a no-op.
 */
export function classifyBiomes(
  height: Field2D,
  table: BiomeTable,
  masks: { water?: Field2D; slope?: Field2D } = {},
): BiomeClassification {
  if (table.bands.length === 0) {
    throw new Error("classifyBiomes: table.bands is empty");
  }
  const elevation = normalizedElevation(height);
  const ordered = sortedBands(table.bands);
  const idOf = new Map(table.bands.map((b, i) => [b.id, i] as const));

  const waterLevel = table.waterLevel ?? -1;
  const waterIdx = table.waterBiome !== undefined ? idOf.get(table.waterBiome) : undefined;
  const slopeLevel = table.slopeLevel ?? 2;
  const slopeIdx = table.slopeBiome !== undefined ? idOf.get(table.slopeBiome) : undefined;

  const count = elevation.data.length;
  const index = new Int32Array(count);
  const colors: number[] = new Array(count * 3);
  const histogram: Record<string, number> = {};
  for (const b of table.bands) histogram[b.id] = 0;

  for (let i = 0; i < count; i++) {
    const elev = elevation.data[i]!;
    const isWater = masks.water ? masks.water.data[i]! > 0.5 : elev <= waterLevel;
    const steep = masks.slope ? masks.slope.data[i]! >= slopeLevel : false;

    let chosen = -1;
    if (isWater && waterIdx !== undefined) {
      chosen = waterIdx;
    } else if (steep && slopeIdx !== undefined) {
      chosen = slopeIdx;
    } else {
      for (const { band, original } of ordered) {
        if (band.landOnly && isWater) continue;
        if (elev >= band.minElevation) {
          chosen = original;
          break;
        }
      }
      if (chosen < 0) chosen = ordered[ordered.length - 1]!.original;
    }

    index[i] = chosen;
    const band = table.bands[chosen]!;
    histogram[band.id] = (histogram[band.id] ?? 0) + 1;
    colors[i * 3] = band.color[0];
    colors[i * 3 + 1] = band.color[1];
    colors[i * 3 + 2] = band.color[2];
  }

  return { table, width: height.width, height: height.height, index, colors, histogram };
}

/** Look up the biome band at a cell (clamped). */
export function biomeAt(c: BiomeClassification, x: number, y: number): BiomeBand {
  const xi = clamp(Math.floor(x), 0, c.width - 1);
  const yi = clamp(Math.floor(y), 0, c.height - 1);
  return c.table.bands[c.index[yi * c.width + xi]!]!;
}

/**
 * Overworld biome table modeled on the reference PCG tile palette
 * (dirt/forest/grass/soil/sand/sea), extended with a snow cap. Colors are the
 * reference hex values converted to linear-ish 0..1.
 */
export function overworldBiomeTable(): BiomeTable {
  return {
    name: "overworld",
    bands: [
      { id: "snow", label: "雪顶", minElevation: 0.9, color: [0.85, 0.87, 0.83] },
      { id: "dirt", label: "污垢", minElevation: 0.8, color: [0.302, 0.239, 0.208] },
      { id: "forest", label: "森林", minElevation: 0.6, color: [0.239, 0.38, 0.071] },
      { id: "grass", label: "草地", minElevation: 0.48, color: [0.318, 0.541, 0.078] },
      { id: "soil", label: "土壤", minElevation: 0.4, color: [0.698, 0.51, 0.306] },
      { id: "sand", label: "沙滩", minElevation: 0.32, color: [0.898, 0.847, 0.722] },
      { id: "sea", label: "海洋", minElevation: 0, color: [0.0, 0.627, 0.933] },
    ],
    waterLevel: 0.32,
    waterBiome: "sea",
    slopeLevel: 0.62,
    slopeBiome: "dirt",
  };
}
