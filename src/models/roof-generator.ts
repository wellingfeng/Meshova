/**
 * Roof grammar generator: footprint -> roof style -> trim/detail modules.
 *
 * This is the Houdini workbook "roof" idea in Meshova form. The useful bit is
 * not one roof mesh, but a small deterministic grammar that can emit common
 * architectural roof families and expose them as semantic parts.
 */
import { vec2 } from "../math/vec2.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  box,
  bounds,
  computeNormals,
  makeMesh,
  merge,
  transform,
  translateMesh,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";

type RGB = [number, number, number];

export type RoofGeneratorStyle =
  | "gable"
  | "hip"
  | "crossGable"
  | "mansard"
  | "shed"
  | "butterfly";

export interface RoofGeneratorParams {
  readonly style: RoofGeneratorStyle;
  readonly width: number;
  readonly depth: number;
  readonly wallHeight: number;
  readonly roofHeight: number;
  readonly overhang: number;
  readonly dormers: number;
  readonly chimney: boolean;
  readonly rafters: boolean;
  readonly seed: number;
}

export const ROOF_GENERATOR_DEFAULTS: RoofGeneratorParams = {
  style: "crossGable",
  width: 5.2,
  depth: 3.6,
  wallHeight: 1.6,
  roofHeight: 1.15,
  overhang: 0.34,
  dormers: 2,
  chimney: true,
  rafters: true,
  seed: 31,
};

const WALL: RGB = [0.57, 0.5, 0.42];
const FOUNDATION: RGB = [0.32, 0.31, 0.29];
const ROOF: RGB = [0.35, 0.12, 0.08];
const ROOF_DARK: RGB = [0.18, 0.08, 0.06];
const TRIM: RGB = [0.72, 0.66, 0.56];
const CHIMNEY: RGB = [0.42, 0.2, 0.15];

function resolveRoofParams(params: Partial<RoofGeneratorParams> = {}): RoofGeneratorParams {
  const style = params.style ?? ROOF_GENERATOR_DEFAULTS.style;
  return {
    style,
    width: Math.max(0.8, params.width ?? ROOF_GENERATOR_DEFAULTS.width),
    depth: Math.max(0.8, params.depth ?? ROOF_GENERATOR_DEFAULTS.depth),
    wallHeight: Math.max(0.2, params.wallHeight ?? ROOF_GENERATOR_DEFAULTS.wallHeight),
    roofHeight: Math.max(0.1, params.roofHeight ?? ROOF_GENERATOR_DEFAULTS.roofHeight),
    overhang: Math.max(0, params.overhang ?? ROOF_GENERATOR_DEFAULTS.overhang),
    dormers: Math.max(0, Math.round(params.dormers ?? ROOF_GENERATOR_DEFAULTS.dormers)),
    chimney: params.chimney ?? ROOF_GENERATOR_DEFAULTS.chimney,
    rafters: params.rafters ?? ROOF_GENERATOR_DEFAULTS.rafters,
    seed: Math.round(params.seed ?? ROOF_GENERATOR_DEFAULTS.seed) >>> 0,
  };
}

export function buildRoofGeneratorMesh(params: Partial<RoofGeneratorParams> = {}): Mesh {
  const p = resolveRoofParams(params);
  const w = p.width + p.overhang * 2;
  const d = p.depth + p.overhang * 2;
  const y = p.wallHeight;
  if (p.style === "gable") return gableRoofX(w, d, y, p.roofHeight);
  if (p.style === "hip") return hipRoof(w, d, y, p.roofHeight);
  if (p.style === "mansard") return mansardRoof(w, d, y, p.roofHeight);
  if (p.style === "shed") return shedRoof(w, d, y, p.roofHeight);
  if (p.style === "butterfly") return butterflyRoof(w, d, y, p.roofHeight);
  return crossGableRoof(w, d, y, p.roofHeight);
}

export function buildRoofGeneratorParts(params: Partial<RoofGeneratorParams> = {}): NamedPart[] {
  const p = resolveRoofParams(params);
  const roof = buildRoofGeneratorMesh(p);
  const roofB = bounds(roof);
  const w = p.width + p.overhang * 2;
  const d = p.depth + p.overhang * 2;
  const parts: NamedPart[] = [
    named("foundation", "基础台座", translateMesh(box(p.width + 0.22, 0.16, p.depth + 0.22), vec3(0, 0.08, 0)), FOUNDATION, "stone"),
    named("walls", "承重墙体", translateMesh(box(p.width, p.wallHeight, p.depth), vec3(0, p.wallHeight / 2 + 0.16, 0)), WALL, "concrete"),
    named("roof_planes", "屋顶坡面", translateMesh(roof, vec3(0, 0.16, 0)), ROOF, "ceramic"),
    named("eave_trim", "屋檐收边", translateMesh(eaveTrim(w, d, p.wallHeight), vec3(0, 0.16, 0)), TRIM, "wood"),
  ];

  const ridges = roofRidges(p, roofB);
  if (ridges.positions.length > 0) {
    parts.push(named("ridge_caps", "屋脊压条", translateMesh(ridges, vec3(0, 0.16, 0)), TRIM, "ceramic"));
  }

  const valleys = roofValleys(p, roofB);
  if (valleys.positions.length > 0) {
    parts.push(named("roof_valleys", "交叉屋谷", translateMesh(valleys, vec3(0, 0.16, 0)), ROOF_DARK, "ceramic"));
  }

  if (p.rafters) {
    parts.push(named("rafters", "外露椽子", translateMesh(rafters(w, d, p.wallHeight), vec3(0, 0.16, 0)), TRIM, "wood"));
  }

  if (p.dormers > 0) {
    const dormer = dormers(p);
    if (dormer.walls.positions.length > 0) {
      parts.push(named("dormer_walls", "老虎窗墙体", translateMesh(dormer.walls, vec3(0, 0.16, 0)), WALL, "concrete"));
      parts.push(named("dormer_roofs", "老虎窗小屋顶", translateMesh(dormer.roofs, vec3(0, 0.16, 0)), ROOF, "ceramic"));
    }
  }

  if (p.chimney) {
    parts.push(named("chimney", "屋顶烟囱", translateMesh(chimney(p), vec3(0, 0.16, 0)), CHIMNEY, "brick"));
  }

  return parts.map((part) => ({
    ...part,
    metadata: { source: "AlgorithmicDesignWorkbook-style roof grammar" },
  }));
}

function named(name: string, label: string, mesh: Mesh, color: RGB, surface: string): NamedPart {
  return { name, label, mesh, color, surface: { type: surface, params: { color, roughness: 0.78 } } };
}

function gableRoofX(width: number, depth: number, baseY: number, roofH: number): Mesh {
  const hx = width / 2;
  const hz = depth / 2;
  const ridgeY = baseY + roofH;
  const positions = [
    vec3(-hx, baseY, -hz),
    vec3(hx, baseY, -hz),
    vec3(-hx, ridgeY, 0),
    vec3(hx, ridgeY, 0),
    vec3(-hx, baseY, hz),
    vec3(hx, baseY, hz),
  ];
  const uvs = [
    vec2(0, 0), vec2(width, 0), vec2(0, roofH), vec2(width, roofH), vec2(0, depth), vec2(width, depth),
  ];
  const indices = [
    0, 3, 1, 0, 2, 3,
    2, 5, 3, 2, 4, 5,
    0, 4, 2, 1, 3, 5,
    0, 1, 5, 0, 5, 4,
  ];
  return hardMesh(positions, uvs, indices);
}

function gableRoofZ(width: number, depth: number, baseY: number, roofH: number): Mesh {
  const hx = width / 2;
  const hz = depth / 2;
  const ridgeY = baseY + roofH;
  const positions = [
    vec3(-hx, baseY, -hz),
    vec3(0, ridgeY, -hz),
    vec3(hx, baseY, -hz),
    vec3(-hx, baseY, hz),
    vec3(0, ridgeY, hz),
    vec3(hx, baseY, hz),
  ];
  const uvs = [
    vec2(0, 0), vec2(width / 2, roofH), vec2(width, 0), vec2(0, depth), vec2(width / 2, depth + roofH), vec2(width, depth),
  ];
  const indices = [
    0, 3, 4, 0, 4, 1,
    1, 4, 5, 1, 5, 2,
    0, 1, 2, 3, 5, 4,
    0, 2, 5, 0, 5, 3,
  ];
  return hardMesh(positions, uvs, indices);
}

function crossGableRoof(width: number, depth: number, baseY: number, roofH: number): Mesh {
  return merge(
    gableRoofX(width, depth, baseY, roofH),
    gableRoofZ(width * 0.52, depth * 1.04, baseY + 0.025, roofH * 0.92),
  );
}

function hipRoof(width: number, depth: number, baseY: number, roofH: number): Mesh {
  if (depth > width) {
    return transform(hipRoofX(depth, width, baseY, roofH), { rotate: vec3(0, Math.PI / 2, 0) });
  }
  return hipRoofX(width, depth, baseY, roofH);
}

function hipRoofX(width: number, depth: number, baseY: number, roofH: number): Mesh {
  const hx = width / 2;
  const hz = depth / 2;
  const topY = baseY + roofH;
  const ridgeHalf = Math.max(0, (width - depth) / 2);
  if (ridgeHalf < 0.02) return pyramidRoof(width, depth, baseY, roofH);
  const positions = [
    vec3(-hx, baseY, -hz),
    vec3(hx, baseY, -hz),
    vec3(hx, baseY, hz),
    vec3(-hx, baseY, hz),
    vec3(-ridgeHalf, topY, 0),
    vec3(ridgeHalf, topY, 0),
  ];
  const uvs = [
    vec2(0, 0), vec2(width, 0), vec2(width, depth), vec2(0, depth), vec2((width - ridgeHalf) / 2, roofH), vec2((width + ridgeHalf) / 2, roofH),
  ];
  const indices = [
    0, 4, 5, 0, 5, 1,
    3, 2, 5, 3, 5, 4,
    0, 3, 4,
    1, 5, 2,
    0, 1, 2, 0, 2, 3,
  ];
  return hardMesh(positions, uvs, indices);
}

function pyramidRoof(width: number, depth: number, baseY: number, roofH: number): Mesh {
  const hx = width / 2;
  const hz = depth / 2;
  const apex = vec3(0, baseY + roofH, 0);
  const positions = [
    vec3(-hx, baseY, -hz),
    vec3(hx, baseY, -hz),
    vec3(hx, baseY, hz),
    vec3(-hx, baseY, hz),
    apex,
  ];
  const uvs = [vec2(0, 0), vec2(width, 0), vec2(width, depth), vec2(0, depth), vec2(width / 2, roofH)];
  const indices = [
    0, 4, 1,
    1, 4, 2,
    3, 2, 4,
    0, 3, 4,
    0, 1, 2, 0, 2, 3,
  ];
  return hardMesh(positions, uvs, indices);
}

function mansardRoof(width: number, depth: number, baseY: number, roofH: number): Mesh {
  const hx = width / 2;
  const hz = depth / 2;
  const tx = hx * 0.58;
  const tz = hz * 0.58;
  const topY = baseY + roofH * 0.72;
  const positions = [
    vec3(-hx, baseY, -hz),
    vec3(hx, baseY, -hz),
    vec3(hx, baseY, hz),
    vec3(-hx, baseY, hz),
    vec3(-tx, topY, -tz),
    vec3(tx, topY, -tz),
    vec3(tx, topY, tz),
    vec3(-tx, topY, tz),
  ];
  const uvs = [
    vec2(0, 0), vec2(width, 0), vec2(width, depth), vec2(0, depth),
    vec2((hx - tx), roofH), vec2(width - (hx - tx), roofH), vec2(width - (hx - tx), depth + roofH), vec2(hx - tx, depth + roofH),
  ];
  const indices = [
    0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2,
    3, 2, 6, 3, 6, 7,
    0, 3, 7, 0, 7, 4,
    4, 7, 6, 4, 6, 5,
    0, 1, 2, 0, 2, 3,
  ];
  return merge(
    hardMesh(positions, uvs, indices),
    translateMesh(box(tx * 2.02, roofH * 0.12, tz * 2.02), vec3(0, topY + roofH * 0.06, 0)),
  );
}

function shedRoof(width: number, depth: number, baseY: number, roofH: number): Mesh {
  const hx = width / 2;
  const hz = depth / 2;
  const topY = baseY + roofH;
  const positions = [
    vec3(-hx, baseY, -hz),
    vec3(hx, baseY, -hz),
    vec3(hx, topY, hz),
    vec3(-hx, topY, hz),
    vec3(-hx, baseY, hz),
    vec3(hx, baseY, hz),
  ];
  const uvs = [vec2(0, 0), vec2(width, 0), vec2(width, depth), vec2(0, depth), vec2(0, depth + roofH), vec2(width, depth + roofH)];
  const indices = [
    0, 3, 2, 0, 2, 1,
    4, 3, 2, 4, 2, 5,
    0, 4, 3,
    1, 2, 5,
    0, 1, 5, 0, 5, 4,
  ];
  return hardMesh(positions, uvs, indices);
}

function butterflyRoof(width: number, depth: number, baseY: number, roofH: number): Mesh {
  const hx = width / 2;
  const hz = depth / 2;
  const highY = baseY + roofH;
  const positions = [
    vec3(-hx, highY, -hz),
    vec3(hx, highY, -hz),
    vec3(-hx, baseY, 0),
    vec3(hx, baseY, 0),
    vec3(-hx, highY, hz),
    vec3(hx, highY, hz),
  ];
  const uvs = [vec2(0, 0), vec2(width, 0), vec2(0, depth / 2), vec2(width, depth / 2), vec2(0, depth), vec2(width, depth)];
  const indices = [
    0, 2, 3, 0, 3, 1,
    2, 4, 5, 2, 5, 3,
    0, 2, 4,
    1, 5, 3,
  ];
  return hardMesh(positions, uvs, indices);
}

function hardMesh(positions: Vec3[], uvs: ReturnType<typeof vec2>[], indices: number[]): Mesh {
  return computeNormals(makeMesh({
    positions,
    normals: positions.map(() => vec3(0, 1, 0)),
    uvs,
    indices,
  }), 1);
}

function eaveTrim(width: number, depth: number, y: number): Mesh {
  const hx = width / 2;
  const hz = depth / 2;
  const t = 0.08;
  return merge(
    translateMesh(box(width, t, t), vec3(0, y - t * 0.6, hz)),
    translateMesh(box(width, t, t), vec3(0, y - t * 0.6, -hz)),
    translateMesh(box(t, t, depth), vec3(hx, y - t * 0.6, 0)),
    translateMesh(box(t, t, depth), vec3(-hx, y - t * 0.6, 0)),
  );
}

function roofRidges(p: RoofGeneratorParams, roofB: ReturnType<typeof bounds>): Mesh {
  const y = roofB.max.y + 0.035;
  const w = p.width + p.overhang * 2;
  const d = p.depth + p.overhang * 2;
  const cap = Math.max(0.06, Math.min(w, d) * 0.018);
  if (p.style === "gable") return translateMesh(box(w * 0.96, cap, cap), vec3(0, y, 0));
  if (p.style === "hip") {
    const len = Math.max(cap * 2, Math.abs(w - d));
    return w >= d
      ? translateMesh(box(len, cap, cap), vec3(0, y, 0))
      : translateMesh(box(cap, cap, len), vec3(0, y, 0));
  }
  if (p.style === "crossGable") {
    return merge(
      translateMesh(box(w * 0.96, cap, cap), vec3(0, y, 0)),
      translateMesh(box(cap, cap, d * 0.88), vec3(0, y - p.roofHeight * 0.08, 0)),
    );
  }
  if (p.style === "shed") return translateMesh(box(w * 0.96, cap, cap), vec3(0, y, d / 2 - cap));
  if (p.style === "butterfly") return translateMesh(box(w * 0.96, cap * 0.8, cap * 1.8), vec3(0, p.wallHeight + 0.02, 0));
  return translateMesh(box(w * 0.62, cap, d * 0.62), vec3(0, y, 0));
}

function roofValleys(p: RoofGeneratorParams, roofB: ReturnType<typeof bounds>): Mesh {
  if (p.style !== "crossGable" && p.style !== "butterfly") return merge();
  const w = p.width + p.overhang * 2;
  const d = p.depth + p.overhang * 2;
  const t = Math.max(0.045, Math.min(w, d) * 0.012);
  if (p.style === "butterfly") {
    return translateMesh(box(w * 0.94, t, t * 2.2), vec3(0, p.wallHeight + 0.04, 0));
  }
  return merge(
    transform(box(Math.hypot(w, d) * 0.42, t, t), { rotate: vec3(0, Math.PI / 4, 0), translate: vec3(0, roofB.max.y - p.roofHeight * 0.42, 0) }),
    transform(box(Math.hypot(w, d) * 0.42, t, t), { rotate: vec3(0, -Math.PI / 4, 0), translate: vec3(0, roofB.max.y - p.roofHeight * 0.42, 0) }),
  );
}

function rafters(width: number, depth: number, y: number): Mesh {
  const out: Mesh[] = [];
  const count = Math.max(4, Math.round(width / 0.42));
  const hz = depth / 2;
  for (let i = 0; i <= count; i++) {
    const x = -width / 2 + (width * i) / count;
    out.push(translateMesh(box(0.055, 0.08, 0.32), vec3(x, y - 0.12, hz + 0.04)));
    out.push(translateMesh(box(0.055, 0.08, 0.32), vec3(x, y - 0.12, -hz - 0.04)));
  }
  return merge(...out);
}

function dormers(p: RoofGeneratorParams): { walls: Mesh; roofs: Mesh } {
  if (p.style === "butterfly" || p.style === "shed") return { walls: merge(), roofs: merge() };
  const walls: Mesh[] = [];
  const roofs: Mesh[] = [];
  const w = p.width + p.overhang * 2;
  const d = p.depth + p.overhang * 2;
  const count = Math.min(6, p.dormers);
  const dormerW = Math.min(0.62, p.width / Math.max(3, count + 2));
  const dormerD = Math.min(0.54, d * 0.18);
  const bodyH = Math.min(0.52, p.roofHeight * 0.42);
  const y = p.wallHeight + p.roofHeight * 0.32;
  const z = d / 2 - dormerD * 0.7;
  for (let i = 0; i < count; i++) {
    const x = count === 1 ? 0 : -w * 0.32 + (w * 0.64 * i) / (count - 1);
    walls.push(translateMesh(box(dormerW, bodyH, dormerD), vec3(x, y + bodyH / 2, z)));
    roofs.push(translateMesh(gableRoofX(dormerW * 1.18, dormerD * 1.28, y + bodyH, bodyH * 0.5), vec3(x, 0, z)));
  }
  return { walls: merge(...walls), roofs: merge(...roofs) };
}

function chimney(p: RoofGeneratorParams): Mesh {
  const rng = makeRng((p.seed ^ 0x9e3779b9) >>> 0);
  const x = rng.range(-p.width * 0.22, p.width * 0.22);
  const z = rng.range(-p.depth * 0.16, p.depth * 0.18);
  const baseY = p.wallHeight + p.roofHeight * rng.range(0.4, 0.7);
  const h = Math.max(0.7, p.roofHeight * 0.8);
  return merge(
    translateMesh(box(0.28, h, 0.28), vec3(x, baseY + h / 2, z)),
    translateMesh(box(0.38, 0.1, 0.38), vec3(x, baseY + h + 0.05, z)),
  );
}
