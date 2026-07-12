import { makeRng } from "../random/prng.js";
import { compileMaskField, type MaskField } from "./mask-field.js";
import { makePointCloud, pointContext, type PointCloud, type PointScalar } from "./point-cloud.js";

export interface ScatterTableRow {
  readonly id: string;
  readonly label?: string;
  readonly enabled?: boolean;
  readonly variant?: number;
  readonly assetSlot?: string;
  readonly weight?: number;
  readonly density?: number;
  readonly mask?: MaskField;
  readonly scale?: number | readonly [number, number];
  readonly yaw?: number | readonly [number, number];
  readonly attributes?: Readonly<Record<string, number>>;
}

export interface ScatterTable {
  readonly schema: "meshova-scatter-table@1";
  readonly seed?: number;
  readonly density?: number;
  readonly rows: ReadonlyArray<ScatterTableRow>;
}

export interface ApplyScatterTableOptions {
  readonly assetVariants?: Readonly<Record<string, number>>;
  readonly prune?: boolean;
}

interface CompiledRow {
  readonly row: ScatterTableRow;
  readonly mask: PointScalar;
  readonly variant: number;
}

export function applyScatterTable(
  pc: PointCloud,
  table: ScatterTable,
  options: ApplyScatterTableOptions = {},
): PointCloud {
  validateScatterTable(table);
  const rows = table.rows
    .filter((row) => row.enabled ?? true)
    .map((row, index): CompiledRow => ({
      row,
      mask: row.mask ? compileMaskField(row.mask) : 1,
      variant: resolveVariant(row, index, options.assetVariants ?? {}),
    }));
  const rng = makeRng((table.seed ?? 0) >>> 0);
  const globalDensity = clamp01(table.density ?? 1);
  const attributes: Record<string, number[]> = {};
  for (const [name, values] of Object.entries(pc.attributes)) attributes[name] = values.slice();
  const customNames = new Set(rows.flatMap(({ row }) => Object.keys(row.attributes ?? {})));
  for (const name of customNames) attributes[name] ??= pc.points.map(() => 0);

  const variant = pc.points.map(() => -1);
  const scatterRow = pc.points.map(() => -1);
  const scale = (pc.attributes.scale ?? pc.points.map(() => 1)).slice();
  const yaw = (pc.attributes.yaw ?? pc.points.map(() => 0)).slice();
  const mask = pc.points.map(() => 0);
  const previousMask = pc.attributes.mask;

  for (let pointIndex = 0; pointIndex < pc.points.length; pointIndex++) {
    const ctx = pointContext(pc, pointIndex);
    const coverageRoll = rng.next();
    const choiceRoll = rng.next();
    const scaleRoll = rng.next();
    const yawRoll = rng.next();
    if ((previousMask?.[pointIndex] ?? 1) < 0.5 || coverageRoll >= globalDensity) continue;

    const weights = rows.map(({ row, mask: rowMask }) => {
      const maskValue = typeof rowMask === "function" ? rowMask(ctx) : rowMask;
      return Math.max(0, row.weight ?? 1) * clamp01(row.density ?? 1) * clamp01(maskValue);
    });
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (total <= 0) continue;
    let cursor = choiceRoll * total;
    let selected = weights.length - 1;
    for (let rowIndex = 0; rowIndex < weights.length; rowIndex++) {
      cursor -= weights[rowIndex] ?? 0;
      if (cursor <= 0) {
        selected = rowIndex;
        break;
      }
    }
    const compiled = rows[selected]!;
    variant[pointIndex] = compiled.variant;
    scatterRow[pointIndex] = selected;
    mask[pointIndex] = 1;
    scale[pointIndex] = (scale[pointIndex] ?? 1) * sampleRange(compiled.row.scale ?? 1, scaleRoll);
    yaw[pointIndex] = (yaw[pointIndex] ?? 0) + sampleRange(compiled.row.yaw ?? 0, yawRoll);
    for (const [name, value] of Object.entries(compiled.row.attributes ?? {})) attributes[name]![pointIndex] = value;
  }

  attributes.variant = variant;
  attributes.scatterRow = scatterRow;
  attributes.scale = scale;
  attributes.yaw = yaw;
  attributes.mask = mask;
  const result = makePointCloud({ points: pc.points, normals: pc.normals, attributes });
  return options.prune ? pruneByMask(result) : result;
}

export function scatterTableRule(
  table: ScatterTable,
  options: ApplyScatterTableOptions = {},
): (pc: PointCloud) => PointCloud {
  return (pc) => applyScatterTable(pc, table, options);
}

export function validateScatterTable(table: ScatterTable): void {
  if (table.schema !== "meshova-scatter-table@1") throw new Error(`unexpected scatter table schema: ${String(table.schema)}`);
  if ((table.density ?? 1) < 0 || (table.density ?? 1) > 1) throw new Error("scatter table density must be within [0,1]");
  const ids = new Set<string>();
  for (const row of table.rows) {
    if (!row.id.trim()) throw new Error("scatter table row id is empty");
    if (ids.has(row.id)) throw new Error(`duplicate scatter table row "${row.id}"`);
    ids.add(row.id);
    if ((row.weight ?? 1) < 0) throw new Error(`scatter row "${row.id}" weight must be >= 0`);
    if ((row.density ?? 1) < 0 || (row.density ?? 1) > 1) throw new Error(`scatter row "${row.id}" density must be within [0,1]`);
    validateRange(row.scale, row.id, "scale");
    validateRange(row.yaw, row.id, "yaw");
  }
}

export function parseScatterTable(json: string): ScatterTable {
  const table = JSON.parse(json) as ScatterTable;
  validateScatterTable(table);
  return table;
}

export function serializeScatterTable(table: ScatterTable): string {
  validateScatterTable(table);
  return JSON.stringify(table, null, 2);
}

function resolveVariant(row: ScatterTableRow, rowIndex: number, assetVariants: Readonly<Record<string, number>>): number {
  if (row.variant !== undefined) return row.variant;
  if (row.assetSlot !== undefined) {
    const variant = assetVariants[row.assetSlot];
    if (variant === undefined) throw new Error(`missing variant mapping for asset slot "${row.assetSlot}"`);
    return variant;
  }
  return rowIndex;
}

function pruneByMask(pc: PointCloud): PointCloud {
  const keep = pc.points.map((_, index) => index).filter((index) => (pc.attributes.mask?.[index] ?? 0) >= 0.5);
  const attributes: Record<string, number[]> = {};
  for (const [name, values] of Object.entries(pc.attributes)) {
    if (name !== "mask") attributes[name] = keep.map((index) => values[index] ?? 0);
  }
  return makePointCloud({
    points: keep.map((index) => pc.points[index]!),
    normals: keep.map((index) => pc.normals[index]!),
    attributes,
  });
}

function sampleRange(value: number | readonly [number, number], t: number): number {
  if (typeof value === "number") return value;
  return value[0] + (value[1] - value[0]) * t;
}

function validateRange(value: number | readonly [number, number] | undefined, rowId: string, name: string): void {
  if (value === undefined || typeof value === "number") return;
  if (value.length !== 2 || !value.every(Number.isFinite) || value[0] > value[1]) {
    throw new Error(`scatter row "${rowId}" ${name} range is invalid`);
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
