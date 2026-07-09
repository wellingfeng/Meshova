/**
 * Polygonal island generator (redblobgames / 42arch-style).
 *
 * A different lineage from the heightfield island in models/terrain.ts: instead
 * of a displaced grid, this builds a Delaunay/Voronoi graph of cells, classifies
 * land vs ocean with a radial island shape, derives elevation from coast
 * distance, traces downhill rivers, spreads moisture and assigns Whittaker-style
 * biomes. Output is a continuous low-poly mesh (vertices = Voronoi sites, faces =
 * Delaunay triangles) plus water and river parts.
 *
 * Determinism: sites come from a jittered grid driven by the seeded PRNG, and
 * every pass iterates arrays in index order. Same seed -> same island.
 */
import { makeRng, type Rng } from "../random/prng.js";
import { makeNoise, fbm2 } from "../random/noise.js";
import { vec2, type Vec2 } from "../math/vec2.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeMesh, recomputeNormals, type Mesh } from "../geometry/mesh.js";
import type { NamedPart } from "../geometry/export.js";
import { clamp, lerp, smoothstep } from "../math/scalar.js";

type RGB = [number, number, number];

export interface PolygonIslandOptions {
  /** Deterministic seed. */
  seed?: number;
  /** World width/depth of the square domain. */
  size?: number;
  /** Approximate number of cells (rounded to a grid). */
  points?: number;
  /** Max land elevation in world units. */
  height?: number;
  /** Land threshold for the radial island shape (0..1). Higher = smaller island. */
  seaLevel?: number;
  /** Radial falloff strength; higher pushes coastline inward. */
  islandFactor?: number;
  /** Grid jitter amount 0..1. */
  jitter?: number;
  /** Number of river sources. */
  rivers?: number;
}

export interface IslandCell {
  index: number;
  /** Voronoi site center (x=x, y=z) in world space. */
  site: Vec2;
  neighbors: number[];
  border: boolean;
  water: boolean;
  ocean: boolean;
  coast: boolean;
  /** Normalized -0.04..1 elevation (ocean below 0). */
  elevation: number;
  moisture: number;
  flux: number;
  downslope: number;
  biome: string;
  color: RGB;
}

export interface IslandRiverEdge {
  from: number;
  to: number;
  width: number;
}

export interface IslandGraph {
  size: number;
  height: number;
  seed: number;
  cells: IslandCell[];
  triangles: number[];
  rivers: IslandRiverEdge[];
}

interface Tri {
  a: number;
  b: number;
  c: number;
  cx: number;
  cz: number;
  r2: number;
}

export const POLYGON_ISLAND_DEFAULTS: Required<PolygonIslandOptions> = {
  seed: 7,
  size: 12,
  points: 900,
  height: 2.2,
  seaLevel: 0.2,
  islandFactor: 0.72,
  jitter: 0.62,
  rivers: 8,
};

/** Jittered-grid sample sites, deterministic. Returns [x,z] pairs in world space. */
function makeSites(size: number, points: number, jitter: number, rng: Rng): Vec2[] {
  const cols = Math.max(4, Math.round(Math.sqrt(points)));
  const cell = size / cols;
  const half = size * 0.5;
  const j = clamp(jitter, 0, 1) * cell * 0.5;
  const sites: Vec2[] = [];
  for (let gy = 0; gy < cols; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const x = -half + (gx + 0.5) * cell + rng.range(-j, j);
      const z = -half + (gy + 0.5) * cell + rng.range(-j, j);
      sites.push(vec2(x, z));
    }
  }
  return sites;
}

function circumcircle(p: Vec2[], a: number, b: number, c: number): Tri | null {
  const ax = p[a]!.x, az = p[a]!.y;
  const bx = p[b]!.x, bz = p[b]!.y;
  const cx = p[c]!.x, cz = p[c]!.y;
  const d = 2 * (ax * (bz - cz) + bx * (cz - az) + cx * (az - bz));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = ax * ax + az * az;
  const b2 = bx * bx + bz * bz;
  const c2 = cx * cx + cz * cz;
  const ux = (a2 * (bz - cz) + b2 * (cz - az) + c2 * (az - bz)) / d;
  const uz = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  const r2 = (ax - ux) * (ax - ux) + (az - uz) * (az - uz);
  return { a, b, c, cx: ux, cz: uz, r2 };
}

/** Bowyer-Watson Delaunay triangulation over the given sites (super-triangle wrapped). */
function triangulate(points: Vec2[]): Tri[] {
  const n = points.length;
  if (n < 3) return [];
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minZ) minZ = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxZ) maxZ = p.y;
  }
  const dx = maxX - minX || 1;
  const dz = maxZ - minZ || 1;
  const dmax = Math.max(dx, dz) * 20;
  const midX = (minX + maxX) * 0.5;
  const midZ = (minZ + maxZ) * 0.5;
  // Super-triangle vertices appended at the end.
  const pts = points.slice();
  const s0 = pts.push(vec2(midX - dmax, midZ - dmax)) - 1;
  const s1 = pts.push(vec2(midX, midZ + dmax)) - 1;
  const s2 = pts.push(vec2(midX + dmax, midZ - dmax)) - 1;
  let tris: Tri[] = [];
  const seed = circumcircle(pts, s0, s1, s2);
  if (seed) tris.push(seed);

  for (let i = 0; i < n; i++) {
    const px = pts[i]!.x, pz = pts[i]!.y;
    const bad: Tri[] = [];
    const keep: Tri[] = [];
    for (const t of tris) {
      const ddx = px - t.cx;
      const ddz = pz - t.cz;
      if (ddx * ddx + ddz * ddz < t.r2) bad.push(t);
      else keep.push(t);
    }
    // Collect boundary edges of the bad-triangle cavity.
    const edges: Array<[number, number]> = [];
    for (const t of bad) {
      pushEdge(edges, t.a, t.b);
      pushEdge(edges, t.b, t.c);
      pushEdge(edges, t.c, t.a);
    }
    tris = keep;
    for (const [ea, eb] of edges) {
      const t = circumcircle(pts, ea, eb, i);
      if (t) tris.push(t);
    }
  }
  // Drop any triangle touching the super-triangle.
  return tris.filter((t) => t.a < n && t.b < n && t.c < n);
}

/** Add edge unless its reverse is already present; if so, remove it (shared = interior). */
function pushEdge(edges: Array<[number, number]>, a: number, b: number): void {
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i]!;
    if ((e[0] === a && e[1] === b) || (e[0] === b && e[1] === a)) {
      edges.splice(i, 1);
      return;
    }
  }
  edges.push([a, b]);
}

/** Build the full island graph: sites, triangles, classification, elevation, rivers, biomes. */
export function buildIslandGraph(options: PolygonIslandOptions = {}): IslandGraph {
  const o = { ...POLYGON_ISLAND_DEFAULTS, ...options };
  const size = Math.max(2, o.size);
  const seed = Math.round(o.seed) >>> 0;
  const rng = makeRng(seed);
  const shapeNoise = makeNoise(seed + 91);

  const sites = makeSites(size, Math.max(64, o.points), o.jitter, rng);
  const n = sites.length;
  const tris = triangulate(sites);

  const cells: IslandCell[] = sites.map((site, index) => ({
    index,
    site,
    neighbors: [],
    border: false,
    water: false,
    ocean: false,
    coast: false,
    elevation: 0,
    moisture: 0,
    flux: 0,
    downslope: -1,
    biome: "OCEAN",
    color: [0, 0, 0],
  }));

  // Adjacency from Delaunay edges (dedup via sorted key set per cell).
  const triangles: number[] = [];
  for (const t of tris) {
    triangles.push(t.a, t.b, t.c);
    linkNeighbors(cells, t.a, t.b);
    linkNeighbors(cells, t.b, t.c);
    linkNeighbors(cells, t.c, t.a);
  }

  // Water classification: radial island shape modulated by noise.
  const half = size * 0.5;
  const factor = Math.max(0.2, o.islandFactor);
  for (const c of cells) {
    const nx = c.site.x / half;
    const nz = c.site.y / half;
    const radial = Math.hypot(nx, nz);
    if (radial > 0.985) c.border = true;
    const bump = fbm2(shapeNoise, nx * 1.7 + 3.1, nz * 1.7 - 2.4, { octaves: 4, gain: 0.5 }) * 0.5 + 0.5;
    const landShape = bump - factor * radial * radial;
    c.water = c.border || landShape < o.seaLevel * (1 - 0.001);
  }

  classifyOcean(cells);
  assignElevation(cells, half, makeNoise(seed + 137));
  assignRivers(cells, o.rivers, rng);
  assignMoisture(cells);
  assignBiomes(cells);

  return { size, height: Math.max(0.2, o.height), seed, cells, triangles, rivers: collectRivers(cells) };
}

function linkNeighbors(cells: IslandCell[], a: number, b: number): void {
  if (!cells[a]!.neighbors.includes(b)) cells[a]!.neighbors.push(b);
  if (!cells[b]!.neighbors.includes(a)) cells[b]!.neighbors.push(a);
}

/** Flood-fill ocean from border water; enclosed water stays as lakes. Mark coasts. */
function classifyOcean(cells: IslandCell[]): void {
  const queue: number[] = [];
  for (const c of cells) {
    if (c.border && c.water) {
      c.ocean = true;
      queue.push(c.index);
    }
  }
  let head = 0;
  while (head < queue.length) {
    const ci = queue[head++]!;
    for (const ni of cells[ci]!.neighbors) {
      const nb = cells[ni]!;
      if (nb.water && !nb.ocean) {
        nb.ocean = true;
        queue.push(ni);
      }
    }
  }
  // Coast = land touching ocean.
  for (const c of cells) {
    if (c.water) continue;
    c.coast = c.neighbors.some((ni) => cells[ni]!.ocean);
  }
}

/** Elevation = graph distance from the coast (BFS), eased and ridge-modulated. */
function assignElevation(
  cells: IslandCell[],
  half: number,
  ridgeNoise: ReturnType<typeof makeNoise>,
): void {
  const dist = new Array<number>(cells.length).fill(Infinity);
  const queue: number[] = [];
  for (const c of cells) {
    if (c.coast || (c.ocean && c.neighbors.some((ni) => !cells[ni]!.water))) {
      dist[c.index] = 0;
      queue.push(c.index);
    }
  }
  let head = 0;
  let maxDist = 0;
  while (head < queue.length) {
    const ci = queue[head++]!;
    const d = dist[ci]!;
    for (const ni of cells[ci]!.neighbors) {
      if (dist[ni]! > d + 1) {
        dist[ni] = d + 1;
        if (d + 1 > maxDist && !cells[ni]!.ocean) maxDist = d + 1;
        queue.push(ni);
      }
    }
  }
  const span = maxDist || 1;
  for (const c of cells) {
    if (c.ocean) {
      const d = Number.isFinite(dist[c.index]!) ? dist[c.index]! : 0;
      c.elevation = -clamp(0.02 + d / (span * 2.2), 0, 0.05);
    } else {
      const t = clamp((Number.isFinite(dist[c.index]!) ? dist[c.index]! : 0) / span, 0, 1);
      // Base cone from coast distance, softened so it is not a single spike.
      const base = Math.pow(t, 0.72);
      // Ridged noise breaks the radial symmetry into hills, valleys and ranges.
      const nx = c.site.x / half;
      const nz = c.site.y / half;
      const ridge = 1 - Math.abs(fbm2(ridgeNoise, nx * 2.4 + 5.7, nz * 2.4 - 3.1, {
        octaves: 5,
        gain: 0.5,
      }));
      const detail = fbm2(ridgeNoise, nx * 5.5 - 2.2, nz * 5.5 + 4.4, { octaves: 3 }) * 0.5 + 0.5;
      // Ridges only take hold inland (weighted by base) so coasts stay low.
      const relief = base * (0.55 + 0.45 * ridge) + detail * 0.12 * base;
      c.elevation = clamp(relief, 0, 1);
    }
  }
}

/** Compute each cell's lowest neighbor (downslope pointer) for river routing. */
function computeDownslopes(cells: IslandCell[]): void {
  for (const c of cells) {
    let best = -1;
    let bestElev = c.elevation;
    for (const ni of c.neighbors) {
      const e = cells[ni]!.elevation;
      if (e < bestElev) {
        bestElev = e;
        best = ni;
      }
    }
    c.downslope = best;
  }
}

/** Trace rivers from high-elevation land sources downhill, accumulating flux. */
function assignRivers(cells: IslandCell[], count: number, rng: Rng): void {
  computeDownslopes(cells);
  const land = cells.filter((c) => !c.water && c.elevation > 0.35);
  if (land.length === 0) return;
  const n = Math.max(0, Math.min(count, land.length));
  for (let i = 0; i < n; i++) {
    const src = land[rng.int(0, land.length - 1)]!;
    let cur: IslandCell | undefined = src;
    let guard = 0;
    while (cur && !cur.ocean && guard++ < cells.length) {
      cur.flux += 1;
      if (cur.downslope < 0) break;
      const downhill: IslandCell = cells[cur.downslope]!;
      if (downhill.elevation >= cur.elevation) break;
      cur = downhill;
    }
  }
}

function collectRivers(cells: IslandCell[]): IslandRiverEdge[] {
  const edges: IslandRiverEdge[] = [];
  for (const c of cells) {
    if (c.flux < 1 || c.downslope < 0 || c.water) continue;
    const to = cells[c.downslope]!;
    edges.push({ from: c.index, to: to.index, width: Math.min(0.4, 0.05 + Math.sqrt(c.flux) * 0.03) });
  }
  return edges;
}

/** Moisture: BFS distance from fresh water (rivers, lakes, coast), normalized inverse. */
function assignMoisture(cells: IslandCell[]): void {
  const dist = new Array<number>(cells.length).fill(Infinity);
  const queue: number[] = [];
  for (const c of cells) {
    if ((c.water && !c.ocean) || c.flux >= 1 || c.coast) {
      dist[c.index] = 0;
      queue.push(c.index);
    }
  }
  let head = 0;
  let maxD = 1;
  while (head < queue.length) {
    const ci = queue[head++]!;
    const d = dist[ci]!;
    for (const ni of cells[ci]!.neighbors) {
      if (dist[ni]! > d + 1) {
        dist[ni] = d + 1;
        if (d + 1 > maxD) maxD = d + 1;
        queue.push(ni);
      }
    }
  }
  for (const c of cells) {
    if (c.ocean) {
      c.moisture = 1;
      continue;
    }
    const d = Number.isFinite(dist[c.index]!) ? dist[c.index]! : maxD;
    // Gamma curve + baseline lift so large interiors stay humid enough to grow
    // forest instead of collapsing to a uniform desert band.
    const near = Math.pow(clamp(1 - d / maxD, 0, 1), 0.55);
    c.moisture = clamp(0.28 + near * 0.72, 0, 1);
  }
}

/** Whittaker-style biome from elevation + moisture, with matching low-poly colors. */
function assignBiomes(cells: IslandCell[]): void {
  for (const c of cells) {
    if (c.ocean) {
      c.biome = "OCEAN";
      c.color = [0.16, 0.34, 0.52];
      continue;
    }
    if (c.water) {
      c.biome = "LAKE";
      c.color = [0.24, 0.46, 0.6];
      continue;
    }
    if (c.coast) {
      c.biome = "BEACH";
      c.color = [0.8, 0.72, 0.5];
      continue;
    }
    c.biome = whittaker(c.elevation, c.moisture);
    c.color = BIOME_COLORS[c.biome] ?? [0.5, 0.5, 0.5];
  }
}

function whittaker(e: number, m: number): string {
  if (e > 0.8) {
    if (m < 0.1) return "SCORCHED";
    if (m < 0.2) return "BARE";
    if (m < 0.5) return "TUNDRA";
    return "SNOW";
  }
  if (e > 0.6) {
    if (m < 0.33) return "TEMPERATE_DESERT";
    if (m < 0.66) return "SHRUBLAND";
    return "TAIGA";
  }
  if (e > 0.3) {
    if (m < 0.16) return "TEMPERATE_DESERT";
    if (m < 0.5) return "GRASSLAND";
    if (m < 0.83) return "TEMPERATE_DECIDUOUS_FOREST";
    return "TEMPERATE_RAIN_FOREST";
  }
  if (m < 0.16) return "SUBTROPICAL_DESERT";
  if (m < 0.33) return "GRASSLAND";
  if (m < 0.66) return "TROPICAL_SEASONAL_FOREST";
  return "TROPICAL_RAIN_FOREST";
}

const BIOME_COLORS: Record<string, RGB> = {
  SNOW: [0.9, 0.9, 0.92],
  TUNDRA: [0.73, 0.75, 0.66],
  BARE: [0.6, 0.6, 0.6],
  SCORCHED: [0.4, 0.4, 0.4],
  TAIGA: [0.6, 0.66, 0.47],
  SHRUBLAND: [0.53, 0.58, 0.47],
  TEMPERATE_DESERT: [0.79, 0.78, 0.58],
  TEMPERATE_RAIN_FOREST: [0.26, 0.53, 0.33],
  TEMPERATE_DECIDUOUS_FOREST: [0.4, 0.6, 0.35],
  GRASSLAND: [0.53, 0.68, 0.34],
  TROPICAL_RAIN_FOREST: [0.2, 0.5, 0.28],
  TROPICAL_SEASONAL_FOREST: [0.32, 0.6, 0.3],
  SUBTROPICAL_DESERT: [0.82, 0.73, 0.55],
};

/**
 * Convert the island graph to a continuous mesh: each Voronoi site becomes a
 * vertex (raised by biome elevation), each Delaunay triangle becomes a face.
 * Per-vertex colors carry the biome palette.
 */
export function islandGraphToMesh(graph: IslandGraph): { mesh: Mesh; colors: number[] } {
  const { cells, triangles, height } = graph;
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Vec2[] = [];
  const colors: number[] = [];
  const half = graph.size * 0.5;
  for (const c of cells) {
    const y = c.elevation >= 0 ? c.elevation * height : c.elevation * height * 0.5;
    positions.push(vec3(c.site.x, y, c.site.y));
    normals.push(vec3(0, 1, 0));
    uvs.push(vec2((c.site.x + half) / graph.size, (c.site.y + half) / graph.size));
    colors.push(c.color[0], c.color[1], c.color[2]);
  }
  // Delaunay triangles are wound arbitrarily; force CCW when viewed from +Y.
  const indices: number[] = [];
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i]!;
    const b = triangles[i + 1]!;
    const c = triangles[i + 2]!;
    const pa = cells[a]!.site;
    const pb = cells[b]!.site;
    const pc = cells[c]!.site;
    const area2 = (pb.x - pa.x) * (pc.y - pa.y) - (pc.x - pa.x) * (pb.y - pa.y);
    if (area2 < 0) indices.push(a, b, c);
    else indices.push(a, c, b);
  }
  const mesh = recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
  return { mesh, colors };
}

/** Flat water plane slightly above sea level, covering the domain. */
function makeOceanPlane(size: number, y: number): Mesh {
  const half = size * 0.52;
  const positions = [
    vec3(-half, y, -half), vec3(half, y, -half), vec3(half, y, half), vec3(-half, y, half),
  ];
  const normals = positions.map(() => vec3(0, 1, 0));
  const uvs = [vec2(0, 0), vec2(1, 0), vec2(1, 1), vec2(0, 1)];
  const indices = [0, 3, 1, 1, 3, 2];
  return makeMesh({ positions, normals, uvs, indices });
}

/** River lines as thin ribbons following downslope edges above the terrain. */
function makeRiverMesh(graph: IslandGraph): Mesh | null {
  const { cells, rivers, height } = graph;
  if (rivers.length === 0) return null;
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];
  for (const r of rivers) {
    const a = cells[r.from]!;
    const b = cells[r.to]!;
    const ax = a.site.x, az = a.site.y;
    const bx = b.site.x, bz = b.site.y;
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len, nz = dx / len;
    const w = r.width * 0.5;
    const ay = a.elevation * height + 0.02;
    const by = b.elevation * height + 0.02;
    const base = positions.length;
    positions.push(
      vec3(ax + nx * w, ay, az + nz * w),
      vec3(ax - nx * w, ay, az - nz * w),
      vec3(bx + nx * w, by, bz + nz * w),
      vec3(bx - nx * w, by, bz - nz * w),
    );
    for (let k = 0; k < 4; k++) { normals.push(vec3(0, 1, 0)); uvs.push(vec2(0, 0)); }
    indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
  if (indices.length === 0) return null;
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

/** Build a polygonal island as semantic named parts (terrain / ocean / rivers). */
export function buildPolygonIslandParts(options: PolygonIslandOptions = {}): NamedPart[] {
  const graph = buildIslandGraph(options);
  const { mesh, colors } = islandGraphToMesh(graph);
  const parts: NamedPart[] = [
    {
      name: "island",
      label: "多边形岛屿",
      mesh,
      colors,
      color: [0.4, 0.6, 0.35],
      surface: { type: "mossyStone", params: { moss: 0.4, seed: graph.seed } },
      metadata: {
        generator: "polygon-island",
        cells: graph.cells.length,
        biomes: countBiomes(graph.cells),
      },
    },
  ];

  const ocean = makeOceanPlane(graph.size, 0.001);
  parts.push({
    name: "ocean",
    label: "海洋",
    mesh: ocean,
    color: [0.16, 0.34, 0.52],
    surface: { type: "water", params: { tint: [0.16, 0.34, 0.52], seed: graph.seed + 1 } },
  });

  const river = makeRiverMesh(graph);
  if (river) {
    parts.push({
      name: "rivers",
      label: "河流",
      mesh: river,
      color: [0.3, 0.52, 0.66],
      surface: { type: "water", params: { tint: [0.3, 0.52, 0.66], seed: graph.seed + 2 } },
    });
  }
  return parts;
}

function countBiomes(cells: IslandCell[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of cells) out[c.biome] = (out[c.biome] ?? 0) + 1;
  return out;
}
