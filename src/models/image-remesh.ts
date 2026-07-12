/**
 * Image-driven remeshing workbook clone.
 *
 * This keeps the "image" procedural and deterministic for now: a tiny analytic
 * image field stands in for decoded bitmap input. The remeshing algorithms are
 * the reusable part: sample brightness -> sites / dots / triangles / relief.
 */
import { vec2, type Vec2 } from "../math/vec2.js";
import { vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  box,
  cylinder,
  makeMesh,
  merge,
  recomputeNormals,
  transform,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";

type RGB = [number, number, number];

export type ImageRemeshMode = "suite" | "voronoi" | "dots" | "triangles" | "relief";
export type ImageRemeshSource = "portrait" | "fruit" | "waves";

export interface ImageRemeshParams {
  readonly mode: ImageRemeshMode;
  readonly source: ImageRemeshSource;
  readonly size: number;
  readonly resolution: number;
  readonly samples: number;
  readonly reliefHeight: number;
  readonly seed: number;
  readonly panelGap: number;
}

export interface ImageRemeshSample {
  readonly u: number;
  readonly v: number;
  /** Dark/detail density in 0..1. Higher means more geometry. */
  readonly value: number;
  readonly color: RGB;
}

export interface ImageRemeshSite extends ImageRemeshSample {
  readonly radius: number;
}

export const IMAGE_REMESH_DEFAULTS: ImageRemeshParams = {
  mode: "suite",
  source: "portrait",
  size: 2.25,
  resolution: 18,
  samples: 80,
  reliefHeight: 0.55,
  seed: 47,
  panelGap: 0.38,
};

const PAPER: RGB = [0.78, 0.74, 0.64];
const INK: RGB = [0.06, 0.08, 0.12];
const ORANGE: RGB = [0.95, 0.46, 0.12];
const BLUE: RGB = [0.1, 0.38, 0.72];
const PANEL: RGB = [0.72, 0.72, 0.68];

function resolveParams(params: Partial<ImageRemeshParams> = {}): ImageRemeshParams {
  return {
    ...IMAGE_REMESH_DEFAULTS,
    ...params,
    size: Math.max(0.6, params.size ?? IMAGE_REMESH_DEFAULTS.size),
    resolution: Math.max(4, Math.round(params.resolution ?? IMAGE_REMESH_DEFAULTS.resolution)),
    samples: Math.max(8, Math.round(params.samples ?? IMAGE_REMESH_DEFAULTS.samples)),
    reliefHeight: Math.max(0.02, params.reliefHeight ?? IMAGE_REMESH_DEFAULTS.reliefHeight),
    seed: Math.round(params.seed ?? IMAGE_REMESH_DEFAULTS.seed) >>> 0,
    panelGap: Math.max(0.05, params.panelGap ?? IMAGE_REMESH_DEFAULTS.panelGap),
  };
}

export function sampleImageRemeshSource(
  u: number,
  v: number,
  source: ImageRemeshSource = IMAGE_REMESH_DEFAULTS.source,
): ImageRemeshSample {
  const x = clamp01(u);
  const y = clamp01(v);
  if (source === "fruit") return fruitSample(x, y);
  if (source === "waves") return wavesSample(x, y);
  return portraitSample(x, y);
}

export function imageRemeshSites(params: Partial<ImageRemeshParams> = {}): ImageRemeshSite[] {
  const p = resolveParams(params);
  const rng = makeRng((p.seed ^ 0xa53a9d13) >>> 0);
  const grid = Math.max(5, Math.ceil(Math.sqrt(p.samples * 3.2)));
  const candidates: Array<ImageRemeshSite & { score: number }> = [];
  for (let j = 0; j < grid; j++) {
    for (let i = 0; i < grid; i++) {
      const u = (i + rng.range(0.16, 0.84)) / grid;
      const v = (j + rng.range(0.16, 0.84)) / grid;
      const s = sampleImageRemeshSource(u, v, p.source);
      const score = s.value * 0.88 + rng.next() * 0.12;
      candidates.push({ ...s, radius: 0.015 + s.value * 0.045, score });
    }
  }
  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, p.samples)
    .sort((a, b) => (a.v === b.v ? a.u - b.u : a.v - b.v))
    .map(({ score: _score, ...site }) => site);
}

export function buildImageRemeshParts(params: Partial<ImageRemeshParams> = {}): NamedPart[] {
  const p = resolveParams(params);
  const panels = panelKinds(p.mode);
  const offsets = panels.map((_, i) => panelOffset(i, panels.length, p.size, p.panelGap));
  const backing = offsets.map((o) => transform(box(p.size * 1.06, 0.035, p.size * 1.06), {
    translate: vec3(o.x, -0.035, o.y),
  }));

  const parts: NamedPart[] = [{
    name: "image_backing",
    label: "图像面板",
    mesh: merge(...backing),
    color: PANEL,
    metadata: { source: "AlgorithmicDesignWorkbook-style image remeshing" },
  }];

  for (let i = 0; i < panels.length; i++) {
    const kind = panels[i]!;
    const offset = offsets[i]!;
    if (kind === "source") {
      const field = buildFieldMesh(p, offset, {
        resolution: p.resolution,
        heightScale: 0.025,
        threshold: 0,
        jitter: 0,
        seed: p.seed,
      });
      parts.push(coloredPart("source_field", "源图像场", field.mesh, field.colors, PAPER, "source"));
    } else if (kind === "voronoi") {
      const field = buildVoronoiMesh(p, offset);
      parts.push(coloredPart("voronoi_cells", "Voronoi 肖像", field.mesh, field.colors, INK, "voronoi"));
    } else if (kind === "dots") {
      parts.push({
        name: "dot_poster",
        label: "点阵海报",
        mesh: buildDotPosterMesh(p, offset),
        color: INK,
        metadata: { source: "AlgorithmicDesignWorkbook-style image remeshing", method: "dots" },
      });
    } else if (kind === "triangles") {
      const field = buildFieldMesh(p, offset, {
        resolution: p.resolution,
        heightScale: p.reliefHeight * 0.28,
        threshold: 0.08,
        jitter: 0.42,
        seed: p.seed ^ 0x51f15e,
      });
      parts.push(coloredPart("density_triangles", "密度三角网", field.mesh, field.colors, BLUE, "triangles"));
    } else {
      const field = buildFieldMesh(p, offset, {
        resolution: Math.max(6, p.resolution + 4),
        heightScale: p.reliefHeight,
        threshold: 0,
        jitter: 0,
        seed: p.seed,
      });
      parts.push(coloredPart("relief_field", "图片浮雕", field.mesh, field.colors, ORANGE, "relief"));
    }
  }

  return parts;
}

function coloredPart(
  name: string,
  label: string,
  mesh: Mesh,
  colors: number[],
  color: RGB,
  method: string,
): NamedPart {
  return {
    name,
    label,
    mesh,
    colors,
    color,
    metadata: { source: "AlgorithmicDesignWorkbook-style image remeshing", method },
  };
}

type PanelKind = "source" | Exclude<ImageRemeshMode, "suite">;

function panelKinds(mode: ImageRemeshMode): PanelKind[] {
  if (mode === "suite") return ["source", "voronoi", "dots", "triangles", "relief"];
  return [mode];
}

function panelOffset(index: number, count: number, size: number, gap: number): Vec2 {
  const cols = count > 3 ? 3 : count;
  const rows = Math.ceil(count / cols);
  const col = index % cols;
  const row = Math.floor(index / cols);
  const step = size + gap;
  return vec2((col - (cols - 1) / 2) * step, (row - (rows - 1) / 2) * step);
}

function worldFromUv(u: number, v: number, size: number, offset: Vec2, y: number) {
  return vec3(offset.x + (u - 0.5) * size, y, offset.y + (v - 0.5) * size);
}

function buildFieldMesh(
  p: ImageRemeshParams,
  offset: Vec2,
  opts: { resolution: number; heightScale: number; threshold: number; jitter: number; seed: number },
): { mesh: Mesh; colors: number[] } {
  const n = Math.max(2, Math.round(opts.resolution));
  const rng = makeRng(opts.seed >>> 0);
  const uvGrid: Vec2[] = [];
  const samples: ImageRemeshSample[] = [];
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors: number[] = [];

  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      let u = i / n;
      let v = j / n;
      if (opts.jitter > 0 && i > 0 && i < n && j > 0 && j < n) {
        u = clamp01(u + rng.range(-opts.jitter, opts.jitter) / n);
        v = clamp01(v + rng.range(-opts.jitter, opts.jitter) / n);
      }
      const s = sampleImageRemeshSource(u, v, p.source);
      uvGrid.push(vec2(u, v));
      samples.push(s);
      positions.push(worldFromUv(u, v, p.size, offset, s.value * opts.heightScale));
      normals.push(vec3(0, 1, 0));
      uvs.push(vec2(u, v));
      colors.push(s.color[0], s.color[1], s.color[2]);
    }
  }

  const indices: number[] = [];
  const stride = n + 1;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * stride + i;
      const b = a + stride;
      const avg = (
        samples[a]!.value +
        samples[a + 1]!.value +
        samples[b]!.value +
        samples[b + 1]!.value
      ) * 0.25;
      if (avg < opts.threshold) continue;
      const flip = (uvGrid[a]!.x + uvGrid[b + 1]!.y) % 0.37 > 0.185;
      if (flip) {
        indices.push(a, b, b + 1, a, b + 1, a + 1);
      } else {
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }

  return {
    mesh: recomputeNormals(makeMesh({ positions, normals, uvs, indices })),
    colors,
  };
}

function buildVoronoiMesh(p: ImageRemeshParams, offset: Vec2): { mesh: Mesh; colors: number[] } {
  const sites = imageRemeshSites(p);
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const rect = [vec2(0, 0), vec2(1, 0), vec2(1, 1), vec2(0, 1)];

  for (let i = 0; i < sites.length; i++) {
    const site = sites[i]!;
    let poly = rect;
    for (let j = 0; j < sites.length && poly.length >= 3; j++) {
      if (i === j) continue;
      poly = clipToCloserSite(poly, site, sites[j]!);
    }
    if (poly.length < 3) continue;

    const base = positions.length;
    const lift = 0.025 + site.value * p.reliefHeight * 0.12;
    positions.push(worldFromUv(site.u, site.v, p.size, offset, lift));
    normals.push(vec3(0, 1, 0));
    uvs.push(vec2(site.u, site.v));
    colors.push(site.color[0], site.color[1], site.color[2]);

    for (const pt of poly) {
      positions.push(worldFromUv(pt.x, pt.y, p.size, offset, lift));
      normals.push(vec3(0, 1, 0));
      uvs.push(pt);
      colors.push(site.color[0], site.color[1], site.color[2]);
    }
    for (let k = 1; k < poly.length; k++) indices.push(base, base + k + 1, base + k);
    indices.push(base, base + 1, base + poly.length);
  }

  return {
    mesh: recomputeNormals(makeMesh({ positions, normals, uvs, indices })),
    colors,
  };
}

function buildDotPosterMesh(p: ImageRemeshParams, offset: Vec2): Mesh {
  const grid = Math.max(5, p.resolution + 2);
  const cell = p.size / grid;
  const dots: Mesh[] = [];
  for (let j = 0; j < grid; j++) {
    for (let i = 0; i < grid; i++) {
      const u = (i + 0.5) / grid;
      const v = (j + 0.5) / grid;
      const s = sampleImageRemeshSource(u, v, p.source);
      const radius = Math.max(cell * 0.045, cell * (0.08 + s.value * 0.42));
      const h = 0.035 + s.value * p.reliefHeight * 0.28;
      dots.push(transform(cylinder(radius, h, 12, true), {
        translate: worldFromUv(u, v, p.size, offset, h * 0.5),
      }));
    }
  }
  return merge(...dots);
}

function clipToCloserSite(poly: Vec2[], a: ImageRemeshSample, b: ImageRemeshSample): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const prev = poly[(i + poly.length - 1) % poly.length]!;
    const curr = poly[i]!;
    const prevIn = closerOrEqual(prev, a, b);
    const currIn = closerOrEqual(curr, a, b);
    if (currIn !== prevIn) out.push(intersectBisector(prev, curr, a, b));
    if (currIn) out.push(curr);
  }
  return out;
}

function closerOrEqual(p: Vec2, a: ImageRemeshSample, b: ImageRemeshSample): boolean {
  return signedDistanceDelta(p, a, b) <= 1e-10;
}

function intersectBisector(p: Vec2, q: Vec2, a: ImageRemeshSample, b: ImageRemeshSample): Vec2 {
  const fp = signedDistanceDelta(p, a, b);
  const fq = signedDistanceDelta(q, a, b);
  const denom = fp - fq;
  const t = Math.abs(denom) < 1e-12 ? 0.5 : clamp01(fp / denom);
  return vec2(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t);
}

function signedDistanceDelta(p: Vec2, a: ImageRemeshSample, b: ImageRemeshSample): number {
  const ax = p.x - a.u;
  const ay = p.y - a.v;
  const bx = p.x - b.u;
  const by = p.y - b.v;
  return ax * ax + ay * ay - (bx * bx + by * by);
}

function portraitSample(u: number, v: number): ImageRemeshSample {
  const head = ellipse(u, v, 0.5, 0.56, 0.23, 0.31);
  const hair = Math.max(
    ellipse(u, v, 0.5, 0.75, 0.24, 0.13),
    gaussian(u, v, 0.37, 0.64, 0.08, 0.16),
    gaussian(u, v, 0.63, 0.64, 0.08, 0.16),
  );
  const shoulders = ellipse(u, v, 0.5, 0.18, 0.46, 0.17) * 0.65;
  const eyes = gaussian(u, v, 0.42, 0.57, 0.035, 0.018) + gaussian(u, v, 0.58, 0.57, 0.035, 0.018);
  const nose = gaussian(u, v, 0.5, 0.49, 0.035, 0.07) * 0.55;
  const mouth = gaussian(u, v, 0.5, 0.39, 0.09, 0.018) * 0.9;
  const cheekShadow = gaussian(u, v, 0.61, 0.47, 0.11, 0.16) * 0.5;
  const value = clamp01(Math.max(
    shoulders,
    head * 0.34,
    hair * 0.92,
    eyes,
    nose,
    mouth,
    cheekShadow,
  ));
  return { u, v, value, color: mixColor(PAPER, INK, value) };
}

function fruitSample(u: number, v: number): ImageRemeshSample {
  const body = ellipse(u, v, 0.49, 0.48, 0.31, 0.29);
  const edge = Math.abs(ellipse(u, v, 0.49, 0.48, 0.34, 0.32) - ellipse(u, v, 0.49, 0.48, 0.26, 0.24));
  const ridges = body * (0.5 + 0.5 * Math.sin((u - 0.5) * 42 + Math.sin(v * 12) * 0.6));
  const leaf = ellipse(u, v, 0.59, 0.78, 0.18, 0.055);
  const value = clamp01(body * 0.42 + edge * 0.42 + ridges * 0.24 + leaf * 0.82);
  return { u, v, value, color: mixColor([1, 0.82, 0.36], [0.5, 0.18, 0.03], value) };
}

function wavesSample(u: number, v: number): ImageRemeshSample {
  const cx = u - 0.5;
  const cy = v - 0.5;
  const r = Math.hypot(cx, cy);
  const a = Math.atan2(cy, cx);
  const line = 1 - smoothstep(0.0, 0.11, Math.abs(Math.sin(a * 4 + r * 22)));
  const mask = 1 - smoothstep(0.48, 0.7, r);
  const value = clamp01(line * mask + gaussian(u, v, 0.28, 0.62, 0.05, 0.24) * 0.45);
  return { u, v, value, color: mixColor([0.75, 0.92, 1], BLUE, value) };
}

function ellipse(u: number, v: number, cx: number, cy: number, rx: number, ry: number): number {
  const dx = (u - cx) / rx;
  const dy = (v - cy) / ry;
  return 1 - smoothstep(0.72, 1.05, dx * dx + dy * dy);
}

function gaussian(u: number, v: number, cx: number, cy: number, sx: number, sy: number): number {
  const dx = (u - cx) / sx;
  const dy = (v - cy) / sy;
  return Math.exp(-0.5 * (dx * dx + dy * dy));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function mixColor(a: RGB, b: RGB, t: number): RGB {
  const f = clamp01(t);
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ];
}
