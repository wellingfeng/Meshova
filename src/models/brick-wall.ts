/**
 * UE5-PCG-style procedural brick wall.
 *
 * Rebuilds the reference idea as Meshova-native geometry: a spline guide is
 * resampled into brick points, every other row is shifted into a running bond,
 * and real box bricks sit proud of a dark mortar/backing core.
 */
import { clamp, lerp } from "../math/scalar.js";
import {
  add,
  cross,
  dot,
  length,
  lerpVec3,
  normalize,
  scale,
  sub,
  type Vec3,
} from "../math/vec3.js";
import { vec3 } from "../math/vec3.js";
import { makeRng } from "../random/index.js";
import {
  bezier,
  box,
  curveLength,
  makeMesh,
  polyline,
  resampleCurve,
  transform,
  computeNormals,
  type Curve,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";

type RGB = [number, number, number];

export interface PcgBrickWallParams {
  readonly controlPoints?: ReadonlyArray<Vec3>;
  /** Horizontal guide span. The curved path length is slightly longer. */
  length: number;
  /** Total wall height. */
  height: number;
  /** Overall wall thickness. */
  depth: number;
  /** Bricks per row before stagger edge overhangs. */
  columns: number;
  /** Vertical brick rows. */
  rows: number;
  /** End offset of the spline in Z. 0 = straight wall. */
  curveDepth: number;
  /** Fraction of each PCG cell occupied by a brick. Lower = wider mortar gaps. */
  brickScale: number;
  /** Absolute extra mortar gap. */
  mortar: number;
  /** Running-bond offset strength, 1 = half brick. */
  stagger: number;
  /** Seeded per-brick size/position variation, as a small fraction of cell size. */
  jitter: number;
  /** Deterministic variant seed. */
  seed: number;
}

export interface PcgBrickWallBrick {
  readonly row: number;
  readonly column: number;
  readonly distance: number;
  readonly center: Vec3;
  readonly yaw: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly curvature: number;
  readonly color: RGB;
}

export interface PcgBrickWallLayout {
  readonly params: PcgBrickWallParams;
  readonly guide: Curve;
  readonly pathLength: number;
  readonly brickPitch: number;
  readonly rowPitch: number;
  readonly bricks: readonly PcgBrickWallBrick[];
}

export const PCG_BRICK_WALL_DEFAULTS: PcgBrickWallParams = {
  length: 6.4,
  height: 3.3,
  depth: 0.36,
  columns: 15,
  rows: 17,
  curveDepth: 0.48,
  brickScale: 0.94,
  mortar: 0.01,
  stagger: 1,
  jitter: 0.02,
  seed: 21,
};

const UP = vec3(0, 1, 0);
const BRICK_DARK: RGB = [0.30, 0.27, 0.21];
const BRICK_MID: RGB = [0.48, 0.42, 0.31];
const BRICK_LIGHT: RGB = [0.62, 0.56, 0.42];
const CORE: RGB = [0.06, 0.055, 0.05];

function resolveParams(params: Partial<PcgBrickWallParams>): PcgBrickWallParams {
  const base = { ...PCG_BRICK_WALL_DEFAULTS, ...params };
  const lengthV = Math.max(1.2, base.length);
  return {
    ...(base.controlPoints && base.controlPoints.length >= 2
      ? { controlPoints: base.controlPoints.map((point) => vec3(point.x, point.y, point.z)) }
      : {}),
    length: lengthV,
    height: Math.max(0.8, base.height),
    depth: Math.max(0.08, base.depth),
    columns: Math.max(2, Math.round(base.columns)),
    rows: Math.max(2, Math.round(base.rows)),
    curveDepth: clamp(base.curveDepth, -lengthV * 0.6, lengthV * 0.6),
    brickScale: clamp(base.brickScale, 0.45, 0.98),
    mortar: Math.max(0, base.mortar),
    stagger: clamp(base.stagger, 0, 1.2),
    jitter: clamp(base.jitter, 0, 0.12),
    seed: Math.round(base.seed) >>> 0,
  };
}

function mixColor(a: RGB, b: RGB, t: number): RGB {
  const k = clamp(t, 0, 1);
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
}

function tintColor(c: RGB, amount: number): RGB {
  const k = 1 + amount;
  return [clamp(c[0] * k, 0, 1), clamp(c[1] * k, 0, 1), clamp(c[2] * k, 0, 1)];
}

function makeGuideCurve(p: PcgBrickWallParams): Curve {
  if (p.controlPoints && p.controlPoints.length >= 2) {
    return resampleCurve(polyline(p.controlPoints.map((point) => vec3(point.x, point.y, point.z))), {
      count: Math.max(32, p.columns * 4 + 1),
    });
  }
  const h = p.length * 0.5;
  const guide = bezier(
    vec3(-h, 0, 0),
    vec3(-h + p.length * 0.28, 0, p.curveDepth * 0.02),
    vec3(h - p.length * 0.22, 0, p.curveDepth * 0.82),
    vec3(h, 0, p.curveDepth),
    72,
  );
  return resampleCurve(guide, { count: Math.max(32, p.columns * 4 + 1) });
}

interface SampledGuide {
  readonly points: readonly Vec3[];
  readonly distances: readonly number[];
  readonly tangents: readonly Vec3[];
  readonly curvatures: readonly number[];
  readonly total: number;
}

interface GuideFrame {
  readonly point: Vec3;
  readonly tangent: Vec3;
  readonly normal: Vec3;
  readonly yaw: number;
  readonly curvature: number;
}

function sampleGuide(curve: Curve): SampledGuide {
  const points = curve.points;
  const distances: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    distances.push(distances[i - 1]! + length(sub(points[i]!, points[i - 1]!)));
  }
  const tangents = points.map((_, i) => {
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;
    const t = normalize(sub(next, prev));
    return length(t) > 0 ? t : vec3(1, 0, 0);
  });
  const curvatures = points.map((_, i) => {
    if (i === 0 || i >= points.length - 1) return 0;
    const a = tangents[i - 1]!;
    const b = tangents[i + 1]!;
    const angle = Math.acos(clamp(dot(a, b), -1, 1));
    const span = Math.max(1e-6, distances[i + 1]! - distances[i - 1]!);
    return angle / span;
  });
  return { points, distances, tangents, curvatures, total: distances[distances.length - 1]! };
}

function frameAt(guide: SampledGuide, distanceAlong: number): GuideFrame {
  const pts = guide.points;
  const dist = guide.distances;
  const n = pts.length;
  if (n < 2 || guide.total <= 0) {
    return { point: vec3(), tangent: vec3(1, 0, 0), normal: vec3(0, 0, 1), yaw: 0, curvature: 0 };
  }

  if (distanceAlong <= 0) {
    const t = guide.tangents[0]!;
    const p = add(pts[0]!, scale(t, distanceAlong));
    return makeFrame(p, t, guide.curvatures[0]!);
  }
  if (distanceAlong >= guide.total) {
    const t = guide.tangents[n - 1]!;
    const p = add(pts[n - 1]!, scale(t, distanceAlong - guide.total));
    return makeFrame(p, t, guide.curvatures[n - 1]!);
  }

  let lo = 0;
  let hi = dist.length - 1;
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (dist[mid]! <= distanceAlong) lo = mid;
    else hi = mid;
  }
  const segLen = Math.max(1e-6, dist[lo + 1]! - dist[lo]!);
  const t = (distanceAlong - dist[lo]!) / segLen;
  const point = lerpVec3(pts[lo]!, pts[lo + 1]!, t);
  const tangent = normalize(sub(pts[lo + 1]!, pts[lo]!));
  const curvature = lerp(guide.curvatures[lo]!, guide.curvatures[lo + 1]!, t);
  return makeFrame(point, tangent, curvature);
}

function makeFrame(point: Vec3, tangent: Vec3, curvature: number): GuideFrame {
  const t = length(tangent) > 0 ? normalize(tangent) : vec3(1, 0, 0);
  const normal = normalize(cross(t, UP));
  const n = length(normal) > 0 ? normal : vec3(0, 0, 1);
  return {
    point,
    tangent: t,
    normal: n,
    yaw: Math.atan2(t.z, t.x),
    curvature,
  };
}

function brickColor(rngValue: number, row: number, rows: number, curvature: number, pathLength: number): RGB {
  const bend = clamp(curvature * pathLength * 0.16, 0, 1);
  const base = mixColor(BRICK_MID, BRICK_LIGHT, rngValue * 0.55);
  const shaded = mixColor(base, BRICK_DARK, bend * 0.32 + (1 - rngValue) * 0.18);
  const rowBand = Math.sin(row * 0.73) * 0.035 + (row / Math.max(1, rows - 1)) * 0.025;
  return tintColor(shaded, rowBand);
}

export function buildPcgBrickWallLayout(
  params: Partial<PcgBrickWallParams> = {},
): PcgBrickWallLayout {
  const p = resolveParams(params);
  const guide = makeGuideCurve(p);
  const sampled = sampleGuide(guide);
  const rng = makeRng(p.seed);
  const brickPitch = sampled.total / p.columns;
  const rowPitch = p.height / p.rows;
  const mortar = Math.min(p.mortar, Math.min(brickPitch, rowPitch) * 0.35);
  const baseBrickW = Math.max(0.04, brickPitch * p.brickScale - mortar);
  const baseBrickH = Math.max(0.035, rowPitch * p.brickScale - mortar * 0.75);
  const baseBrickD = Math.max(0.05, p.depth * (0.86 + p.brickScale * 0.08));
  const frontOffset = p.depth * 0.5 - baseBrickD * 0.5 + Math.max(0.003, mortar * 0.25);
  const bricks: PcgBrickWallBrick[] = [];

  for (let r = 0; r < p.rows; r++) {
    const rowShift = (r % 2 === 1 ? 0.5 * brickPitch * p.stagger : 0);
    const firstColumn = rowShift > 1e-6 ? -1 : 0;
    const lastColumn = rowShift > 1e-6 ? p.columns : p.columns - 1;
    const y = rowPitch * (r + 0.5);

    for (let c = firstColumn; c <= lastColumn; c++) {
      const cellCenter = (c + 0.5) * brickPitch + rowShift;
      const f = frameAt(sampled, cellCenter);
      const j = p.jitter;
      const sideJ = rng.range(-j, j);
      const heightJ = rng.range(-j, j);
      const depthJ = rng.range(-j, j);
      const tangentJ = rng.range(-j, j) * brickPitch * 0.22;
      const normalJ = rng.range(-j, j) * p.depth * 0.20;
      const yawJ = rng.range(-j, j) * 0.35;
      const yJ = rng.range(-j, j) * rowPitch * 0.24;
      const width = baseBrickW * (1 + sideJ * 0.65);
      const height = baseBrickH * (1 + heightJ * 0.45);
      const depth = baseBrickD * (1 + depthJ * 0.28);
      const center = add(
        add(add(f.point, scale(f.tangent, tangentJ)), scale(f.normal, frontOffset + normalJ)),
        vec3(0, y + yJ, 0),
      );
      bricks.push({
        row: r,
        column: c,
        distance: cellCenter,
        center,
        yaw: f.yaw + yawJ,
        width,
        height,
        depth,
        curvature: f.curvature,
        color: brickColor(rng.next(), r, p.rows, f.curvature, sampled.total),
      });
    }
  }

  return { params: p, guide, pathLength: sampled.total, brickPitch, rowPitch, bricks };
}

interface MeshBatch {
  positions: Vec3[];
  normals: Vec3[];
  uvs: { x: number; y: number }[];
  indices: number[];
  colors: number[];
}

function appendColoredMesh(batch: MeshBatch, mesh: Mesh, color: RGB): void {
  const offset = batch.positions.length;
  for (const p of mesh.positions) batch.positions.push(p);
  for (const n of mesh.normals) batch.normals.push(n);
  for (const uv of mesh.uvs) batch.uvs.push(uv);
  for (const i of mesh.indices) batch.indices.push(i + offset);
  for (let i = 0; i < mesh.positions.length; i++) {
    batch.colors.push(color[0], color[1], color[2]);
  }
}

function batchToMesh(batch: MeshBatch): Mesh {
  return makeMesh({
    positions: batch.positions,
    normals: batch.normals,
    uvs: batch.uvs,
    indices: batch.indices,
  });
}

function buildBrickMesh(layout: PcgBrickWallLayout): { mesh: Mesh; colors: number[] } {
  const batch: MeshBatch = { positions: [], normals: [], uvs: [], indices: [], colors: [] };
  for (const b of layout.bricks) {
    const mesh = transform(box(b.width, b.height, b.depth), {
      rotate: vec3(0, b.yaw, 0),
      translate: b.center,
    });
    appendColoredMesh(batch, mesh, b.color);
  }
  return { mesh: batchToMesh(batch), colors: batch.colors };
}

function buildCoreMesh(layout: PcgBrickWallLayout): Mesh {
  const p = layout.params;
  const coreDepth = Math.max(0.04, p.depth * 0.76);
  const coreHeight = p.height + layout.rowPitch * 0.08;
  const guide = sampleGuide(resampleCurve(layout.guide, { count: Math.max(16, p.columns * 4 + 1) }));
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: { x: number; y: number }[] = [];
  const indices: number[] = [];
  const centerY = coreHeight * 0.5 - layout.rowPitch * 0.04;
  const halfDepth = coreDepth * 0.5;
  const halfHeight = coreHeight * 0.5;

  for (let i = 0; i < guide.points.length; i++) {
    const point = guide.points[i]!;
    const frame = makeFrame(point, guide.tangents[i]!, guide.curvatures[i] ?? 0);
    const center = vec3(point.x, centerY, point.z);
    const side = scale(frame.normal, halfDepth);
    const up = scale(UP, halfHeight);
    const backBottom = sub(sub(center, side), up);
    const frontBottom = sub(add(center, side), up);
    const frontTop = add(add(center, side), up);
    const backTop = add(sub(center, side), up);
    positions.push(backBottom, frontBottom, frontTop, backTop);
    normals.push(scale(frame.normal, -1), frame.normal, frame.normal, scale(frame.normal, -1));
    const u = i / Math.max(1, guide.points.length - 1);
    uvs.push({ x: u, y: 0 }, { x: u, y: 0.1 }, { x: u, y: 1 }, { x: u, y: 0.9 });
  }

  for (let i = 0; i < guide.points.length - 1; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    for (let j = 0; j < 4; j++) {
      const a0 = a + j;
      const a1 = a + ((j + 1) % 4);
      const b0 = b + j;
      const b1 = b + ((j + 1) % 4);
      indices.push(a0, a1, b1, a0, b1, b0);
    }
  }

  const last = (guide.points.length - 1) * 4;
  indices.push(0, 2, 1, 0, 3, 2);
  indices.push(last, last + 1, last + 2, last, last + 2, last + 3);
  return computeNormals(makeMesh({ positions, normals, uvs, indices }), 40);
}

export function buildPcgBrickWallParts(
  params: Partial<PcgBrickWallParams> = {},
): NamedPart[] {
  const layout = buildPcgBrickWallLayout(params);
  const bricks = buildBrickMesh(layout);
  const core = buildCoreMesh(layout);
  const p = layout.params;
  return [
    {
      name: "brick_shell",
      label: "错缝砖块",
      mesh: bricks.mesh,
      colors: bricks.colors,
      color: BRICK_MID,
      surface: { type: "stone", params: { color: BRICK_MID, roughness: 0.92, seed: p.seed } },
      metadata: {
        rows: p.rows,
        columns: p.columns,
        bricks: layout.bricks.length,
        pathLength: layout.pathLength,
      },
    },
    {
      name: "mortar_backing",
      label: "暗色砂浆背板",
      mesh: core,
      color: CORE,
      surface: { type: "concrete", params: { color: CORE, roughness: 0.98, seed: p.seed + 31 } },
      metadata: {
        role: "recessed dark core visible through mortar gaps and side/back faces",
      },
    },
  ];
}
