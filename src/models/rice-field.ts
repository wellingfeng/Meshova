import { vec2 } from "../math/vec2.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng, type Rng } from "../random/prng.js";
import { palm } from "../vegetation/index.js";
import {
  box,
  makeMesh,
  merge,
  recomputeNormals,
  transform,
  type Mesh,
  type NamedPart,
  type PartSurfaceRef,
} from "../geometry/index.js";

type RGB = [number, number, number];

export interface RiceFieldParams {
  columns: number;
  rows: number;
  plotSize: number;
  channelWidth: number;
  terraceHeight: number;
  irregularity: number;
  coverage: number;
  riceDensity: number;
  riceHeight: number;
  maturity: number;
  flooded: number;
  palmCount: number;
  seed: number;
}

export interface RiceFieldSummary {
  readonly plots: number;
  readonly riceClumps: number;
  readonly matureClumps: number;
  readonly palms: number;
}

export interface RiceField {
  readonly parts: NamedPart[];
  readonly summary: RiceFieldSummary;
}

export const RICE_FIELD_DEFAULTS: RiceFieldParams = {
  columns: 6,
  rows: 5,
  plotSize: 4.2,
  channelWidth: 0.42,
  terraceHeight: 0.18,
  irregularity: 0.28,
  coverage: 0.9,
  riceDensity: 9,
  riceHeight: 0.72,
  maturity: 0.38,
  flooded: 0.68,
  palmCount: 9,
  seed: 2026,
};

interface MeshBuilder {
  positions: Vec3[];
  uvs: ReturnType<typeof vec2>[];
  indices: number[];
  weights: number[];
}

interface Plot {
  outer: [Vec3, Vec3, Vec3, Vec3];
  inner: [Vec3, Vec3, Vec3, Vec3];
  height: number;
}

const SOIL: RGB = [0.3, 0.19, 0.09];
const DIKE: RGB = [0.38, 0.29, 0.13];
const WATER: RGB = [0.24, 0.48, 0.48];
const RICE_GREEN: RGB = [0.24, 0.58, 0.12];
const RICE_GOLD: RGB = [0.68, 0.62, 0.17];
const PANICLE: RGB = [0.82, 0.7, 0.2];
const TRUNK: RGB = [0.31, 0.2, 0.1];
const PALM_LEAF: RGB = [0.18, 0.43, 0.12];

export function buildRiceField(params: Partial<RiceFieldParams> = {}): RiceField {
  const p = normalizeParams({ ...RICE_FIELD_DEFAULTS, ...params });
  const rng = makeRng(p.seed);
  const width = p.columns * p.plotSize;
  const depth = p.rows * p.plotSize;
  const lattice = buildLattice(p, rng);
  const plots = buildPlots(p, lattice, rng);
  const soilMeshes: Mesh[] = [];
  const dikeMeshes: Mesh[] = [];
  const waterMeshes: Mesh[] = [];

  for (const plot of plots) {
    soilMeshes.push(quadPrism(plot.outer, plot.height - 0.16, plot.height));
    dikeMeshes.push(quadRing(plot.outer, plot.inner, plot.height + 0.1));
    if (p.flooded > 0) waterMeshes.push(quadSurface(plot.inner, plot.height + 0.035));
  }

  const rice = buildRicePlants(plots, p, rng);
  const palms = buildBoundaryPalms(p, width, depth, rng);
  const minGround = -0.2;
  const parts: NamedPart[] = [
    part(
      "irrigation_basin",
      "灌溉沟底",
      transform(box(width + p.plotSize, 0.18, depth + p.plotSize), { translate: vec3(0, minGround - 0.09, 0) }),
      SOIL,
      { type: "concrete", params: { color: SOIL, roughness: 0.99 } },
    ),
  ];
  if (soilMeshes.length > 0) {
    parts.push(part("paddy_soil", "水田泥底", merge(...soilMeshes), SOIL, {
      type: "concrete",
      params: { color: SOIL, roughness: 0.98 },
    }));
    parts.push(part("field_dikes", "田埂", merge(...dikeMeshes), DIKE, {
      type: "concrete",
      params: { color: DIKE, roughness: 0.96 },
    }));
  }
  if (waterMeshes.length > 0) {
    parts.push(part("paddy_water", "稻田水面", merge(...waterMeshes), WATER, {
      type: "water",
      params: { body: "pond", tint: WATER, deepColor: [0.05, 0.14, 0.1], transmission: 0.34, roughness: 0.12, waveAmplitude: 0.004, foamStrength: 0.02, seed: p.seed + 19 },
    }));
  }
  parts.push(...rice.parts, ...palms.parts);

  return {
    parts: parts.filter((candidate) => candidate.mesh.positions.length > 0),
    summary: {
      plots: plots.length,
      riceClumps: rice.clumps,
      matureClumps: rice.matureClumps,
      palms: palms.count,
    },
  };
}

export function buildRiceFieldParts(params: Partial<RiceFieldParams> = {}): NamedPart[] {
  return buildRiceField(params).parts;
}

function buildLattice(p: RiceFieldParams, rng: Rng): Vec3[][] {
  const halfWidth = p.columns * p.plotSize * 0.5;
  const halfDepth = p.rows * p.plotSize * 0.5;
  const jitter = p.plotSize * p.irregularity * 0.42;
  return Array.from({ length: p.rows + 1 }, (_, row) =>
    Array.from({ length: p.columns + 1 }, (_, column) => {
      const edgeX = column === 0 || column === p.columns;
      const edgeZ = row === 0 || row === p.rows;
      const xJitter = edgeX ? 0 : rng.range(-jitter, jitter);
      const zJitter = edgeZ ? 0 : rng.range(-jitter, jitter);
      return vec3(
        -halfWidth + column * p.plotSize + xJitter,
        0,
        -halfDepth + row * p.plotSize + zJitter,
      );
    }),
  );
}

function buildPlots(p: RiceFieldParams, lattice: Vec3[][], rng: Rng): Plot[] {
  const plots: Plot[] = [];
  const inset = Math.min(0.22, p.channelWidth / Math.max(0.01, p.plotSize));
  for (let row = 0; row < p.rows; row++) {
    for (let column = 0; column < p.columns; column++) {
      const nx = ((column + 0.5) / p.columns) * 2 - 1;
      const nz = ((row + 0.5) / p.rows) * 2 - 1;
      const footprint = nx * nx * 0.8 + nz * nz;
      const centerCell = Math.abs(nx) < 0.34 && Math.abs(nz) < 0.34;
      const edgeChance = p.coverage - Math.max(0, footprint - 0.72) * 0.5;
      if (!centerCell && rng.next() > edgeChance) continue;
      const height = (p.rows - row - 1) * p.terraceHeight + rng.range(-0.08, 0.08) * p.terraceHeight;
      const outer: Plot["outer"] = [
        withY(lattice[row]![column]!, height),
        withY(lattice[row]![column + 1]!, height),
        withY(lattice[row + 1]![column + 1]!, height),
        withY(lattice[row + 1]![column]!, height),
      ];
      const center = quadCenter(outer);
      const inner = outer.map((point) => vec3(
        point.x + (center.x - point.x) * inset,
        height,
        point.z + (center.z - point.z) * inset,
      )) as Plot["inner"];
      plots.push({ outer, inner, height });
    }
  }
  return plots;
}

function buildRicePlants(
  plots: Plot[],
  p: RiceFieldParams,
  rng: Rng,
): { parts: NamedPart[]; clumps: number; matureClumps: number } {
  const green = meshBuilder();
  const gold = meshBuilder();
  const panicles = meshBuilder();
  let clumps = 0;
  let matureClumps = 0;
  const density = Math.max(2, Math.round(p.riceDensity));

  for (const plot of plots) {
    for (let row = 0; row < density; row++) {
      for (let column = 0; column < density; column++) {
        const u = (column + 0.5 + rng.range(-0.14, 0.14)) / density;
        const v = (row + 0.5 + rng.range(-0.14, 0.14)) / density;
        const point = bilinear(plot.inner, u, v);
        const mature = rng.next() < p.maturity * (0.72 + 0.5 * rng.next());
        const builder = mature ? gold : green;
        const height = p.riceHeight * rng.range(0.82, 1.16);
        const yaw = rng.range(0, Math.PI * 2);
        const bend = rng.range(0.04, 0.18) * height;
        for (let blade = 0; blade < 3; blade++) {
          addRiceBlade(
            builder,
            vec3(point.x + rng.range(-0.05, 0.05), plot.height + 0.05, point.z + rng.range(-0.05, 0.05)),
            height * rng.range(0.78, 1.05),
            p.riceHeight * rng.range(0.035, 0.055),
            yaw + blade * Math.PI / 3,
            bend,
          );
        }
        if (mature) {
          addPanicle(panicles, vec3(point.x, plot.height + 0.05 + height, point.z), yaw, height * 0.3);
          matureClumps++;
        }
        clumps++;
      }
    }
  }

  const parts: NamedPart[] = [];
  if (green.positions.length > 0) parts.push(windPart("young_rice", "青绿稻株", finish(green), RICE_GREEN, green.weights));
  if (gold.positions.length > 0) parts.push(windPart("mature_rice", "成熟稻株", finish(gold), RICE_GOLD, gold.weights));
  if (panicles.positions.length > 0) parts.push(windPart("rice_panicles", "稻穗", finish(panicles), PANICLE, panicles.weights));
  return { parts, clumps, matureClumps };
}

function buildBoundaryPalms(
  p: RiceFieldParams,
  width: number,
  depth: number,
  rng: Rng,
): { parts: NamedPart[]; count: number } {
  const trunks: Mesh[] = [];
  const leaves: Mesh[] = [];
  const count = Math.max(0, Math.round(p.palmCount));
  for (let index = 0; index < count; index++) {
    const side = index % 4;
    const t = (Math.floor(index / 4) + rng.range(0.18, 0.82)) / Math.max(1, Math.ceil(count / 4));
    const margin = p.plotSize * rng.range(0.3, 0.55);
    let x = (t - 0.5) * width;
    let z = (t - 0.5) * depth;
    if (side === 0) z = -depth * 0.5 - margin;
    if (side === 1) x = width * 0.5 + margin;
    if (side === 2) z = depth * 0.5 + margin;
    if (side === 3) x = -width * 0.5 - margin;
    const height = p.plotSize * rng.range(1.15, 1.65);
    const tree = palm({
      seed: p.seed + index * 101,
      height,
      trunkRadius: height * 0.025,
      fronds: 9,
      frondLength: height * 0.34,
      leafletPairs: 13,
      leafletLength: height * 0.085,
      leafletWidth: height * 0.013,
      lean: rng.range(-0.35, 0.35),
    });
    const yaw = rng.range(0, Math.PI * 2);
    trunks.push(transform(tree.wood, { rotate: vec3(0, yaw, 0), translate: vec3(x, -0.18, z) }));
    leaves.push(transform(tree.leaves, { rotate: vec3(0, yaw, 0), translate: vec3(x, -0.18, z) }));
  }
  const parts: NamedPart[] = [];
  if (trunks.length > 0) {
    parts.push(part("palm_trunks", "椰树树干", merge(...trunks), TRUNK, {
      type: "bark",
      params: { color: TRUNK, scale: 7, seed: p.seed + 400 },
    }));
    const leafMesh = merge(...leaves);
    parts.push({
      ...part("palm_crowns", "椰树冠叶", leafMesh, PALM_LEAF, {
        type: "foliage",
        params: { color: PALM_LEAF, season: 0.1, translucency: 0.38 },
      }),
      doubleSided: true,
      windWeight: leafMesh.positions.map(() => 0.9),
    });
  }
  return { parts, count };
}

function addRiceBlade(builder: MeshBuilder, base: Vec3, height: number, width: number, yaw: number, bend: number): void {
  const sideX = Math.cos(yaw) * width;
  const sideZ = Math.sin(yaw) * width;
  const bendX = Math.cos(yaw + Math.PI / 2) * bend;
  const bendZ = Math.sin(yaw + Math.PI / 2) * bend;
  const start = builder.positions.length;
  builder.positions.push(
    vec3(base.x - sideX, base.y, base.z - sideZ),
    vec3(base.x + sideX, base.y, base.z + sideZ),
    vec3(base.x - sideX * 0.58 + bendX * 0.35, base.y + height * 0.56, base.z - sideZ * 0.58 + bendZ * 0.35),
    vec3(base.x + sideX * 0.58 + bendX * 0.35, base.y + height * 0.56, base.z + sideZ * 0.58 + bendZ * 0.35),
    vec3(base.x + bendX, base.y + height, base.z + bendZ),
    vec3(base.x + bendX, base.y + height, base.z + bendZ),
  );
  builder.uvs.push(vec2(0, 0), vec2(1, 0), vec2(0, 0.56), vec2(1, 0.56), vec2(0, 1), vec2(1, 1));
  builder.weights.push(0, 0, 0.48, 0.48, 1, 1);
  builder.indices.push(start, start + 2, start + 1, start + 1, start + 2, start + 3, start + 2, start + 4, start + 3, start + 3, start + 4, start + 5);
}

function addPanicle(builder: MeshBuilder, tip: Vec3, yaw: number, length: number): void {
  const dx = Math.cos(yaw) * length;
  const dz = Math.sin(yaw) * length;
  const sideX = Math.cos(yaw + Math.PI / 2) * length * 0.08;
  const sideZ = Math.sin(yaw + Math.PI / 2) * length * 0.08;
  const end = vec3(tip.x + dx, tip.y - length * 0.42, tip.z + dz);
  const start = builder.positions.length;
  builder.positions.push(
    vec3(tip.x - sideX, tip.y, tip.z - sideZ),
    vec3(tip.x + sideX, tip.y, tip.z + sideZ),
    vec3(end.x - sideX * 0.45, end.y, end.z - sideZ * 0.45),
    vec3(end.x + sideX * 0.45, end.y, end.z + sideZ * 0.45),
  );
  builder.uvs.push(vec2(0, 0), vec2(1, 0), vec2(0, 1), vec2(1, 1));
  builder.weights.push(0.82, 0.82, 1, 1);
  builder.indices.push(start, start + 2, start + 1, start + 1, start + 2, start + 3);
}

function quadSurface(quad: Plot["outer"], y: number): Mesh {
  const positions = quad.map((point) => vec3(point.x, y, point.z));
  return makeMesh({
    positions,
    normals: positions.map(() => vec3(0, 1, 0)),
    uvs: [vec2(0, 0), vec2(1, 0), vec2(1, 1), vec2(0, 1)],
    indices: [0, 2, 1, 0, 3, 2],
  });
}

function quadPrism(quad: Plot["outer"], bottomY: number, topY: number): Mesh {
  const positions = [
    ...quad.map((point) => vec3(point.x, topY, point.z)),
    ...quad.map((point) => vec3(point.x, bottomY, point.z)),
  ];
  return recomputeNormals(makeMesh({
    positions,
    normals: positions.map(() => vec3(0, 1, 0)),
    uvs: positions.map((point) => vec2(point.x, point.z)),
    indices: [
      0, 2, 1, 0, 3, 2,
      4, 5, 6, 4, 6, 7,
      0, 1, 5, 0, 5, 4,
      1, 2, 6, 1, 6, 5,
      2, 3, 7, 2, 7, 6,
      3, 0, 4, 3, 4, 7,
    ],
  }));
}

function quadRing(outer: Plot["outer"], inner: Plot["inner"], y: number): Mesh {
  const positions = [
    ...outer.map((point) => vec3(point.x, y, point.z)),
    ...inner.map((point) => vec3(point.x, y, point.z)),
  ];
  const indices: number[] = [];
  for (let side = 0; side < 4; side++) {
    const next = (side + 1) % 4;
    indices.push(side, next, 4 + next, side, 4 + next, 4 + side);
  }
  return makeMesh({
    positions,
    normals: positions.map(() => vec3(0, 1, 0)),
    uvs: positions.map((point) => vec2(point.x, point.z)),
    indices,
  });
}

function bilinear(quad: Plot["inner"], u: number, v: number): Vec3 {
  const topX = quad[0].x + (quad[1].x - quad[0].x) * u;
  const topZ = quad[0].z + (quad[1].z - quad[0].z) * u;
  const bottomX = quad[3].x + (quad[2].x - quad[3].x) * u;
  const bottomZ = quad[3].z + (quad[2].z - quad[3].z) * u;
  return vec3(topX + (bottomX - topX) * v, quad[0].y, topZ + (bottomZ - topZ) * v);
}

function quadCenter(quad: Plot["outer"]): Vec3 {
  return vec3(
    quad.reduce((sum, point) => sum + point.x, 0) / 4,
    quad[0].y,
    quad.reduce((sum, point) => sum + point.z, 0) / 4,
  );
}

function withY(point: Vec3, y: number): Vec3 {
  return vec3(point.x, y, point.z);
}

function meshBuilder(): MeshBuilder {
  return { positions: [], uvs: [], indices: [], weights: [] };
}

function finish(builder: MeshBuilder): Mesh {
  return recomputeNormals(makeMesh({
    positions: builder.positions,
    normals: builder.positions.map(() => vec3(0, 1, 0)),
    uvs: builder.uvs,
    indices: builder.indices,
  }));
}

function windPart(name: string, label: string, mesh: Mesh, color: RGB, weights: number[]): NamedPart {
  return {
    ...part(name, label, mesh, color, {
      type: "grassBlade",
      params: { color },
    }),
    doubleSided: true,
    windWeight: weights.slice(),
  };
}

function part(name: string, label: string, mesh: Mesh, color: RGB, surface: PartSurfaceRef): NamedPart {
  return { name, label, mesh, color, surface };
}

function normalizeParams(p: RiceFieldParams): RiceFieldParams {
  return {
    columns: clampInt(p.columns, 2, 9),
    rows: clampInt(p.rows, 2, 9),
    plotSize: clamp(p.plotSize, 2, 8),
    channelWidth: clamp(p.channelWidth, 0.1, 1.2),
    terraceHeight: clamp(p.terraceHeight, 0, 0.8),
    irregularity: clamp(p.irregularity, 0, 0.7),
    coverage: clamp(p.coverage, 0.45, 1),
    riceDensity: clampInt(p.riceDensity, 2, 14),
    riceHeight: clamp(p.riceHeight, 0.25, 1.5),
    maturity: clamp(p.maturity, 0, 1),
    flooded: clamp(p.flooded, 0, 1),
    palmCount: clampInt(p.palmCount, 0, 24),
    seed: Math.round(p.seed),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}
