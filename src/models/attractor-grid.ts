/**
 * Attractor-driven grid: Houdini-style distance field -> ramp -> instanced
 * modules. Useful first workbook clone because one scalar field can drive
 * height, color, twist, and later density.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  attractorWeight,
  box,
  merge,
  scalarRamp,
  sphere,
  transform,
  vectorRamp,
  type FalloffCurve,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";

type RGB = [number, number, number];

export type AttractorGridMode = "attract" | "repel";

export interface AttractorGridAttractor {
  readonly position: Vec3;
  readonly radius?: number;
  readonly strength?: number;
}

export interface AttractorGridParams {
  readonly cells: number;
  readonly spacing: number;
  readonly cellSize: number;
  readonly minHeight: number;
  readonly maxHeight: number;
  readonly radius: number;
  readonly mode: AttractorGridMode;
  readonly curve: FalloffCurve;
  readonly jitter: number;
  readonly twist: number;
  readonly seed: number;
  readonly markers: boolean;
  readonly attractors: ReadonlyArray<AttractorGridAttractor>;
}

export interface AttractorGridCell {
  readonly ix: number;
  readonly iz: number;
  readonly position: Vec3;
  readonly weight: number;
  readonly height: number;
}

export const ATTRACTOR_GRID_DEFAULTS: AttractorGridParams = {
  cells: 17,
  spacing: 0.42,
  cellSize: 0.28,
  minHeight: 0.08,
  maxHeight: 2.2,
  radius: 3.2,
  mode: "attract",
  curve: "smooth",
  jitter: 0.06,
  twist: 0.35,
  seed: 11,
  markers: true,
  attractors: [{ position: vec3(0, 0, 0), strength: 1 }],
};

const BASE_COLOR: RGB = [0.08, 0.1, 0.12];
const COLUMN_COLOR: RGB = [0.35, 0.56, 0.78];
const MARKER_COLOR: RGB = [1, 0.22, 0.08];

function resolveAttractorGrid(params: Partial<AttractorGridParams> = {}): AttractorGridParams {
  return {
    ...ATTRACTOR_GRID_DEFAULTS,
    ...params,
    cells: Math.max(2, Math.round(params.cells ?? ATTRACTOR_GRID_DEFAULTS.cells)),
    spacing: Math.max(0.05, params.spacing ?? ATTRACTOR_GRID_DEFAULTS.spacing),
    cellSize: Math.max(0.02, params.cellSize ?? ATTRACTOR_GRID_DEFAULTS.cellSize),
    minHeight: Math.max(0.01, params.minHeight ?? ATTRACTOR_GRID_DEFAULTS.minHeight),
    maxHeight: Math.max(0.02, params.maxHeight ?? ATTRACTOR_GRID_DEFAULTS.maxHeight),
    radius: Math.max(0.05, params.radius ?? ATTRACTOR_GRID_DEFAULTS.radius),
    jitter: Math.max(0, params.jitter ?? ATTRACTOR_GRID_DEFAULTS.jitter),
    twist: params.twist ?? ATTRACTOR_GRID_DEFAULTS.twist,
    seed: Math.round(params.seed ?? ATTRACTOR_GRID_DEFAULTS.seed),
    markers: params.markers ?? ATTRACTOR_GRID_DEFAULTS.markers,
    attractors: params.attractors?.length ? params.attractors : ATTRACTOR_GRID_DEFAULTS.attractors,
  };
}

const heightRamp = scalarRamp([
  { t: 0, value: 0 },
  { t: 0.18, value: 0.04 },
  { t: 0.55, value: 0.55 },
  { t: 1, value: 1 },
], { interp: "smooth" });

const colorRamp = vectorRamp([
  { t: 0, value: vec3(0.13, 0.22, 0.3) },
  { t: 0.45, value: vec3(0.28, 0.62, 0.78) },
  { t: 0.78, value: vec3(0.95, 0.66, 0.22) },
  { t: 1, value: vec3(1, 0.26, 0.12) },
], { interp: "smooth" });

export function attractorGridCells(params: Partial<AttractorGridParams> = {}): AttractorGridCell[] {
  const p = resolveAttractorGrid(params);
  const rng = makeRng(p.seed >>> 0);
  const cells: AttractorGridCell[] = [];
  const half = (p.cells - 1) / 2;
  for (let iz = 0; iz < p.cells; iz++) {
    for (let ix = 0; ix < p.cells; ix++) {
      const jx = p.jitter > 0 ? rng.range(-p.jitter, p.jitter) * p.spacing : 0;
      const jz = p.jitter > 0 ? rng.range(-p.jitter, p.jitter) * p.spacing : 0;
      const x = (ix - half) * p.spacing + jx;
      const z = (iz - half) * p.spacing + jz;
      const raw = attractorWeight(vec3(x, 0, z), p.attractors, {
        radius: p.radius,
        curve: p.curve,
        combine: "max",
      });
      const weight = p.mode === "repel" ? 1 - raw : raw;
      const h = p.minHeight + (p.maxHeight - p.minHeight) * heightRamp(weight);
      cells.push({ ix, iz, position: vec3(x, 0, z), weight, height: h });
    }
  }
  return cells;
}

export function buildAttractorGridParts(params: Partial<AttractorGridParams> = {}): NamedPart[] {
  const p = resolveAttractorGrid(params);
  const cells = attractorGridCells(p);
  const modules: Mesh[] = [];
  const colors: number[] = [];

  for (const c of cells) {
    const color = colorRamp(c.weight);
    const yaw = c.weight * p.twist;
    const m = transform(box(p.cellSize, c.height, p.cellSize), {
      rotate: vec3(0, yaw, 0),
      translate: vec3(c.position.x, c.height * 0.5, c.position.z),
    });
    modules.push(m);
    for (let i = 0; i < m.positions.length; i++) colors.push(color.x, color.y, color.z);
  }

  const span = (p.cells - 1) * p.spacing + p.cellSize * 2.4;
  const base = transform(box(span, 0.04, span), { translate: vec3(0, -0.02, 0) });
  const parts: NamedPart[] = [
    {
      name: "base",
      label: "基底网格",
      mesh: base,
      color: BASE_COLOR,
      surface: { type: "stone", params: { color: BASE_COLOR, roughness: 0.9 } },
    },
    {
      name: "columns",
      label: "吸引子柱阵",
      mesh: merge(...modules),
      color: COLUMN_COLOR,
      colors,
      surface: { type: "metal", params: { color: COLUMN_COLOR, roughness: 0.45, metallic: 0.15 } },
    },
  ];

  if (p.markers) {
    const markerMeshes = p.attractors.map((a) =>
      transform(sphere(p.cellSize * 0.55, 18, 12), {
        translate: vec3(a.position.x, p.maxHeight + p.cellSize, a.position.z),
      }),
    );
    parts.push({
      name: "attractors",
      label: "吸引子",
      mesh: merge(...markerMeshes),
      color: MARKER_COLOR,
      surface: { type: "emissive", params: { color: MARKER_COLOR, intensity: 1.4 } },
    });
  }

  return parts.map((part) => ({
    ...part,
    metadata: { source: "AlgorithmicDesignWorkbook-style attractor grid" },
  }));
}
