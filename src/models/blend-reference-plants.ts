import {
  box,
  computeNormals,
  cylinder,
  lathe,
  makeMesh,
  merge,
  sphere,
  torus,
  transform,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { vec2 } from "../math/vec2.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng, type Rng } from "../random/prng.js";

type RGB = [number, number, number];

export type BlendReferencePlantKind = "canopy-tree" | "dracaena" | "broadleaf-stand";

export interface BlendReferencePlantParams {
  kind: BlendReferencePlantKind;
  width: number;
  height: number;
  depth: number;
  density: number;
  seed: number;
  leafColor: RGB;
  potColor: RGB;
}

export interface BlendReferencePlantDefinition {
  id: string;
  name: string;
  sourceCategory: string;
  defaults: BlendReferencePlantParams;
}

const LEAF: RGB = [0.2, 0.43, 0.19];
const POT: RGB = [0.72, 0.75, 0.73];
const WOOD: RGB = [0.29, 0.19, 0.1];

export const BLEND_REFERENCE_PLANTS: BlendReferencePlantDefinition[] = [
  {
    id: "blend-ref-canopy-tree",
    name: "偏冠分枝盆栽",
    sourceCategory: "摆设/植物/植物.020",
    defaults: { kind: "canopy-tree", width: 1.798, height: 2.481, depth: 1.939, density: 1, seed: 20, leafColor: LEAF, potColor: POT },
  },
  {
    id: "blend-ref-dracaena",
    name: "多头龙血树",
    sourceCategory: "摆设/植物/植物.025",
    defaults: { kind: "dracaena", width: 0.702, height: 1.96, depth: 0.563, density: 1, seed: 25, leafColor: [0.24, 0.46, 0.2], potColor: POT },
  },
  {
    id: "blend-ref-broadleaf-stand",
    name: "木架阔叶盆栽",
    sourceCategory: "摆设/植物/植物.032",
    defaults: { kind: "broadleaf-stand", width: 0.49, height: 0.476, depth: 0.514, density: 1, seed: 32, leafColor: [0.18, 0.4, 0.16], potColor: POT },
  },
];

function moved(mesh: Mesh, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Mesh {
  return transform(mesh, { translate: vec3(x, y, z), rotate: vec3(rx, ry, rz) });
}

function tubeBetween(start: Vec3, end: Vec3, radius: number, segments = 8): Mesh {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dy, dz) || 1e-6;
  const yaw = Math.atan2(dx, dz);
  const pitch = Math.acos(Math.max(-1, Math.min(1, dy / length)));
  return transform(cylinder(radius, length, segments, true), {
    rotate: vec3(pitch * Math.cos(yaw + Math.PI / 2), yaw, pitch * Math.sin(yaw + Math.PI / 2)),
    translate: vec3((start.x + end.x) * 0.5, (start.y + end.y) * 0.5, (start.z + end.z) * 0.5),
  });
}

function branch(points: Vec3[], radius: number): Mesh[] {
  return points.slice(1).map((point, index) => tubeBetween(points[index]!, point, radius * (1 - index / points.length * 0.45), 8));
}

function leafBlade(start: Vec3, end: Vec3, width: number, sag: number, twist: number): Mesh {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dy, dz) || 1e-6;
  let sideX = -dz / length;
  let sideZ = dx / length;
  const sideLength = Math.hypot(sideX, sideZ);
  if (sideLength < 0.05) {
    sideX = 1;
    sideZ = 0;
  } else {
    sideX /= sideLength;
    sideZ /= sideLength;
  }
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const directionX = dx / length;
  const directionY = dy / length;
  const directionZ = dz / length;
  const normalX = sideZ * directionY;
  const normalY = sideX * directionZ - sideZ * directionX;
  const normalZ = -sideX * directionY;
  const normalLength = Math.hypot(normalX, normalY, normalZ) || 1;
  const thickness = width * 0.075;
  const stations = 6;
  for (let index = 0; index <= stations; index++) {
    const t = index / stations;
    const envelope = Math.sin(Math.PI * t) ** 0.72;
    const centerX = start.x + dx * t;
    const centerY = start.y + dy * t - sag * Math.sin(Math.PI * t);
    const centerZ = start.z + dz * t;
    const turn = twist * (t - 0.5);
    const offsetX = sideX * width * envelope * Math.cos(turn);
    const offsetY = width * envelope * Math.sin(turn) * 0.28;
    const offsetZ = sideZ * width * envelope * Math.cos(turn);
    const thicknessX = normalX / normalLength * thickness;
    const thicknessY = normalY / normalLength * thickness;
    const thicknessZ = normalZ / normalLength * thickness;
    positions.push(vec3(centerX - offsetX + thicknessX, centerY - offsetY + thicknessY, centerZ - offsetZ + thicknessZ));
    positions.push(vec3(centerX + offsetX + thicknessX, centerY + offsetY + thicknessY, centerZ + offsetZ + thicknessZ));
    positions.push(vec3(centerX - offsetX - thicknessX, centerY - offsetY - thicknessY, centerZ - offsetZ - thicknessZ));
    positions.push(vec3(centerX + offsetX - thicknessX, centerY + offsetY - thicknessY, centerZ + offsetZ - thicknessZ));
    normals.push(vec3(0, 1, 0), vec3(0, 1, 0), vec3(0, -1, 0), vec3(0, -1, 0));
    uvs.push(vec2(0, t), vec2(1, t), vec2(0, t), vec2(1, t));
  }
  const indices: number[] = [];
  for (let index = 0; index < stations; index++) {
    const a = index * 4;
    const next = a + 4;
    indices.push(
      a, next, a + 1, a + 1, next, next + 1,
      a + 2, a + 3, next + 2, a + 3, next + 3, next + 2,
      a, a + 2, next, a + 2, next + 2, next,
      a + 1, next + 1, a + 3, a + 3, next + 1, next + 3,
    );
  }
  indices.push(0, 1, 2, 1, 3, 2);
  const last = stations * 4;
  indices.push(last, last + 2, last + 1, last + 1, last + 2, last + 3);
  return computeNormals(makeMesh({ positions, normals, uvs, indices }), 55);
}

function part(name: string, label: string, meshes: Mesh | Mesh[], color: RGB, surfaceType: string): NamedPart {
  const list = Array.isArray(meshes) ? meshes : [meshes];
  return {
    name,
    label,
    mesh: list.length === 1 ? list[0]! : merge(...list),
    color,
    surface: { type: surfaceType, params: { color, roughness: surfaceType === "ceramic" ? 0.42 : 0.76 } },
    metadata: { sourceMeshUsed: false, reconstruction: "procedural-blend-reference" },
  };
}

function roundPot(width: number, height: number, depth: number): Mesh[] {
  const radius = Math.min(width, depth) * 0.145;
  const potHeight = height * 0.205;
  const profile = [
    vec2(0, 0),
    vec2(radius * 0.72, 0),
    vec2(radius * 0.9, potHeight * 0.1),
    vec2(radius, potHeight * 0.54),
    vec2(radius * 0.88, potHeight * 0.93),
    vec2(radius * 0.76, potHeight),
    vec2(0, potHeight),
  ];
  return [
    computeNormals(lathe(profile, { segments: 40 }), 50),
    moved(torus(radius * 0.94, radius * 0.055, 40, 8), 0, potHeight * 0.05, 0),
  ];
}

function canopyLeaves(center: Vec3, radiusX: number, radiusY: number, radiusZ: number, count: number, rng: Rng): Mesh[] {
  const leaves: Mesh[] = [];
  for (let index = 0; index < count; index++) {
    const angle = index * 2.399963 + rng.range(-0.22, 0.22);
    const ring = Math.sqrt((index + 0.5) / count);
    const leafCenter = vec3(
      center.x + Math.cos(angle) * radiusX * ring * 0.74,
      center.y + rng.range(-radiusY * 0.5, radiusY * 0.42),
      center.z + Math.sin(angle) * radiusZ * ring * 0.68,
    );
    leaves.push(moved(
      transform(sphere(1, 10, 6), {
        scale: vec3(
          rng.range(radiusX * 0.12, radiusX * 0.2),
          rng.range(radiusY * 0.06, radiusY * 0.11),
          rng.range(radiusZ * 0.08, radiusZ * 0.14),
        ),
      }),
      leafCenter.x,
      leafCenter.y,
      leafCenter.z,
      rng.range(-0.3, 0.3),
      -angle + rng.range(-0.35, 0.35),
      rng.range(-0.45, 0.45),
    ));
  }
  return leaves;
}

function canopyTree(params: BlendReferencePlantParams): NamedPart[] {
  const rng = makeRng(Math.round(params.seed) >>> 0);
  const density = Math.max(0.45, Math.min(1.8, params.density));
  const potHeight = params.height * 0.205;
  const trunks = [
    [vec3(-0.03, potHeight * 0.82, 0), vec3(-0.06, params.height * 0.43, 0.03), vec3(0.08, params.height * 0.62, 0.04), vec3(0.42, params.height * 0.79, 0.02)],
    [vec3(0.01, potHeight * 0.84, -0.02), vec3(-0.08, params.height * 0.3, -0.05), vec3(-0.34, params.height * 0.39, -0.1)],
    [vec3(0.04, potHeight * 0.82, 0.02), vec3(0.03, params.height * 0.48, 0.1), vec3(0.02, params.height * 0.62, 0.14)],
  ];
  const branches = trunks.flatMap((points, index) => branch(points, params.width * (0.012 - index * 0.0015)));
  const leaves = [
    ...canopyLeaves(vec3(0.42, params.height * 0.81, 0.02), params.width * 0.31, params.height * 0.15, params.depth * 0.25, Math.round(92 * density), rng),
    ...canopyLeaves(vec3(0.01, params.height * 0.61, 0.08), params.width * 0.32, params.height * 0.14, params.depth * 0.26, Math.round(82 * density), rng),
    ...canopyLeaves(vec3(-0.34, params.height * 0.39, -0.08), params.width * 0.18, params.height * 0.1, params.depth * 0.16, Math.round(44 * density), rng),
  ];
  return [
    part("ribbed_round_pot", "竖纹圆腹花盆", roundPot(params.width, params.height, params.depth), params.potColor, "ceramic"),
    part("asymmetric_branch_graph", "偏冠分枝骨架", branches, WOOD, "wood"),
    part("layered_leaf_canopies", "分层阔叶树冠", leaves, params.leafColor, "foliage"),
  ];
}

function rosette(center: Vec3, radius: number, leafCount: number, rng: Rng): Mesh[] {
  const leaves: Mesh[] = [];
  for (let index = 0; index < leafCount; index++) {
    const angle = index / leafCount * Math.PI * 2 + rng.range(-0.08, 0.08);
    const length = radius * rng.range(0.72, 1.18);
    const group = index % 3;
    const lift = group === 0
      ? rng.range(radius * 0.28, radius * 0.78)
      : group === 1
        ? rng.range(-radius * 0.08, radius * 0.24)
        : rng.range(-radius * 0.52, -radius * 0.12);
    leaves.push(leafBlade(
      center,
      vec3(center.x + Math.cos(angle) * length, center.y + lift, center.z + Math.sin(angle) * length),
      radius * rng.range(0.045, 0.068),
      radius * rng.range(0.04, 0.18),
      rng.range(-0.35, 0.35),
    ));
  }
  return leaves;
}

function dracaena(params: BlendReferencePlantParams): NamedPart[] {
  const rng = makeRng(Math.round(params.seed) >>> 0);
  const density = Math.max(0.5, Math.min(1.6, params.density));
  const planterHeight = params.height * 0.205;
  const planterWidth = params.width * 0.36;
  const planterDepth = params.depth * 0.44;
  const heads = [
    vec3(0.03, params.height * 0.91, -0.01),
    vec3(-params.width * 0.13, params.height * 0.67, 0.03),
    vec3(params.width * 0.15, params.height * 0.58, -0.02),
    vec3(-params.width * 0.08, params.height * 0.39, -0.01),
  ];
  const stems = heads.flatMap((head, index) => branch([
    vec3((index - 1.5) * params.width * 0.018, planterHeight * 0.85, (index % 2 ? 1 : -1) * params.depth * 0.018),
    vec3(head.x * 0.45, (head.y + planterHeight) * 0.52, head.z * 0.4),
    head,
  ], params.width * 0.012));
  const leaves = heads.flatMap((head, index) => rosette(head, params.width * (index === 0 ? 0.36 : 0.3), Math.round((index === 0 ? 52 : 42) * density), rng));
  const soil = moved(box(planterWidth * 0.88, params.height * 0.012, planterDepth * 0.88), 0, planterHeight * 0.94, 0);
  return [
    part("square_tapered_planter", "方形收底花盆", moved(transform(box(1, 1, 1), { scale: vec3(planterWidth, planterHeight, planterDepth) }), 0, planterHeight * 0.5, 0), params.potColor, "ceramic"),
    part("planter_soil", "花盆覆土", soil, [0.16, 0.11, 0.07], "soil"),
    part("multi_head_stems", "多头分叉茎干", stems, [0.27, 0.3, 0.16], "wood"),
    part("radial_strap_leaves", "放射带状叶簇", leaves, params.leafColor, "foliage"),
  ];
}

function broadleafStand(params: BlendReferencePlantParams): NamedPart[] {
  const rng = makeRng(Math.round(params.seed) >>> 0);
  const density = Math.max(0.55, Math.min(1.55, params.density));
  const standHeight = params.height * 0.55;
  const standWidth = params.width * 0.48;
  const standDepth = params.depth * 0.48;
  const beam = params.width * 0.025;
  const legs = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => moved(
    cylinder(beam, standHeight, 8, true),
    sx * standWidth * 0.5,
    standHeight * 0.5,
    sz * standDepth * 0.5,
  )));
  const braces = [
    box(standWidth + beam, beam * 1.5, beam * 1.5),
    box(beam * 1.5, beam * 1.5, standDepth + beam),
  ].map((mesh) => moved(mesh, 0, standHeight * 0.31, 0));
  const potRadius = params.width * 0.205;
  const potHeight = params.height * 0.29;
  const potProfile = [
    vec2(0, standHeight * 0.42),
    vec2(potRadius * 0.75, standHeight * 0.42),
    vec2(potRadius, standHeight * 0.52),
    vec2(potRadius * 0.94, standHeight * 0.42 + potHeight),
    vec2(0, standHeight * 0.42 + potHeight),
  ];
  const leafBaseY = standHeight * 0.42 + potHeight * 0.74;
  const leafCount = Math.round(23 * density);
  const stems: Mesh[] = [];
  const leaves: Mesh[] = [];
  for (let index = 0; index < leafCount; index++) {
    const angle = index / leafCount * Math.PI * 2 + rng.range(-0.16, 0.16);
    const ring = index % 4 === 0 ? 0.55 : 1;
    const length = params.width * rng.range(0.3, 0.52) * ring;
    const tip = vec3(
      Math.cos(angle) * length,
      leafBaseY + params.height * rng.range(0.14, 0.52) * ring,
      Math.sin(angle) * length * params.depth / params.width,
    );
    const base = vec3(Math.cos(angle) * params.width * 0.025, leafBaseY, Math.sin(angle) * params.depth * 0.025);
    stems.push(tubeBetween(base, vec3(tip.x * 0.72, tip.y - params.height * 0.035, tip.z * 0.72), params.width * 0.008, 6));
    const center = vec3(tip.x * 0.78, tip.y - params.height * 0.025, tip.z * 0.78);
    leaves.push(moved(
      transform(sphere(1, 14, 8), {
        scale: vec3(
          params.width * rng.range(0.12, 0.19),
          params.height * rng.range(0.045, 0.07),
          params.depth * rng.range(0.055, 0.085),
        ),
      }),
      center.x,
      center.y,
      center.z,
      rng.range(-0.28, 0.28),
      -angle,
      rng.range(-0.5, 0.5),
    ));
  }
  return [
    part("timber_plant_stand", "四脚木质花架", [...legs, ...braces], [0.62, 0.48, 0.31], "wood"),
    part("round_stand_pot", "花架圆盆", computeNormals(lathe(potProfile, { segments: 32 }), 45), params.potColor, "ceramic"),
    part("fan_petioles", "扇状叶柄", stems, [0.2, 0.34, 0.15], "foliage"),
    part("broad_oval_leaves", "宽卵形叶片", leaves, params.leafColor, "foliage"),
  ];
}

const BUILDERS: Record<BlendReferencePlantKind, (params: BlendReferencePlantParams) => NamedPart[]> = {
  "canopy-tree": canopyTree,
  dracaena,
  "broadleaf-stand": broadleafStand,
};

export function buildBlendReferencePlantParts(
  input: Partial<BlendReferencePlantParams> & Pick<BlendReferencePlantParams, "kind">,
): NamedPart[] {
  const definition = BLEND_REFERENCE_PLANTS.find((entry) => entry.defaults.kind === input.kind);
  if (!definition) throw new Error(`Unknown Blender reference plant: ${input.kind}`);
  const params = { ...definition.defaults, ...input, kind: input.kind };
  return BUILDERS[input.kind](params);
}
