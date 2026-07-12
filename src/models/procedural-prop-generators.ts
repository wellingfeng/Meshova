import {
  archway,
  box,
  bounds,
  capsule,
  computeNormals,
  cylinder,
  lathe,
  merge,
  polyline,
  recomputeNormals,
  roundedBox,
  ruinify,
  smoothCurve,
  sphere,
  sweep,
  taperMesh,
  torus,
  transform,
  type Mesh,
} from "../geometry/index.js";
import { vec2 } from "../math/vec2.js";
import { vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import { branchesToMesh, growBranches, sweepBarkTube } from "../vegetation/index.js";
import { buildRockFormationMesh } from "./rock-formation.js";

export interface ProceduralPropGeneratorParams {
  width: number;
  depth: number;
  height: number;
  detail: number;
  seed: number;
  variation: number;
  structure: number;
  damage: number;
}

export interface MasonryRingMeshes {
  stones: Mesh;
  infill: Mesh;
  firewood: Mesh | null;
  cutFaces: Mesh | null;
}

export interface HydrantMeshes {
  body: Mesh;
  outlets: Mesh;
  fasteners: Mesh;
  chain: Mesh | null;
}

export interface RootedStumpMeshes {
  trunk: Mesh;
  roots: Mesh;
  cutFace: Mesh;
  moss: Mesh | null;
}

export interface SoftBagMeshes {
  body: Mesh;
  seams: Mesh;
  folds: Mesh | null;
}

export interface TimberTableMeshes {
  boards: Mesh;
  frame: Mesh;
  fasteners: Mesh | null;
}

export interface IndustrialPipeMeshes {
  pipes: Mesh;
  flanges: Mesh;
  valve: Mesh | null;
  fasteners: Mesh | null;
}

export interface RuinedArchMeshes {
  structure: Mesh;
  rubble: Mesh | null;
}

export interface BoulderMeshes {
  rock: Mesh;
}

export interface DeadwoodMeshes {
  trunk: Mesh;
  branches: Mesh | null;
  cutFaces: Mesh;
}

export type HandToolKind = "adjustable-wrench" | "pliers" | "screwdriver" | "cross-pein-hammer" | "hatchet";

export interface HandToolMeshes {
  handle: Mesh;
  head: Mesh;
}

export interface FirewoodPileMeshes {
  logs: Mesh;
  cutFaces: Mesh;
}

export interface WickerBasketMeshes {
  stakes: Mesh;
  weave: Mesh;
  base: Mesh;
  rim: Mesh;
}

export interface WateringCanMeshes {
  body: Mesh;
  spout: Mesh;
  handle: Mesh;
  hardware: Mesh | null;
}

export interface BenchViseMeshes {
  body: Mesh;
  jaws: Mesh;
  screw: Mesh;
  handle: Mesh;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function deform(mesh: Mesh, fn: (x: number, y: number, z: number, index: number) => [number, number, number]): Mesh {
  const positions = mesh.positions.map((point, index) => {
    const [x, y, z] = fn(point.x, point.y, point.z, index);
    return vec3(x, y, z);
  });
  return recomputeNormals({
    positions,
    normals: mesh.normals,
    uvs: mesh.uvs,
    indices: mesh.indices,
  });
}

function fitMeshesToBox(meshes: Mesh[], width: number, height: number, depth: number): Mesh[] {
  const sourceBounds = bounds(merge(...meshes));
  const sourceWidth = Math.max(1e-6, sourceBounds.max.x - sourceBounds.min.x);
  const sourceHeight = Math.max(1e-6, sourceBounds.max.y - sourceBounds.min.y);
  const sourceDepth = Math.max(1e-6, sourceBounds.max.z - sourceBounds.min.z);
  const centerX = (sourceBounds.min.x + sourceBounds.max.x) / 2;
  const centerZ = (sourceBounds.min.z + sourceBounds.max.z) / 2;
  const scaleX = width / sourceWidth;
  const scaleY = height / sourceHeight;
  const scaleZ = depth / sourceDepth;
  return meshes.map((mesh) => transform(mesh, {
    translate: vec3(-centerX * scaleX, -sourceBounds.min.y * scaleY, -centerZ * scaleZ),
    scale: vec3(scaleX, scaleY, scaleZ),
  }));
}

function irregularUnitStone(seed: number, variation: number): Mesh {
  const phase = seed * 0.731;
  const source = roundedBox({ width: 2, height: 2, depth: 2, radius: 0.42, steps: 1 });
  return computeNormals(deform(source, (x, y, z, index) => {
    const angle = Math.atan2(z, x);
    const vertical = Math.asin(clamp(y, -1, 1));
    const wave = Math.sin(angle * 3 + phase)
      + Math.sin(angle * 5 - vertical * 2 + phase * 1.7) * 0.55
      + Math.sin(index * 1.91 + phase) * 0.22;
    const radius = 1 + wave * 0.07 * variation;
    return [x * radius, y * (1 + wave * 0.035 * variation), z * radius];
  }), 22);
}

function irregularUnitBlob(seed: number, variation: number): Mesh {
  const phase = seed * 0.731;
  return deform(sphere(1, 12, 7), (x, y, z, index) => {
    const angle = Math.atan2(z, x);
    const vertical = Math.asin(clamp(y, -1, 1));
    const wave = Math.sin(angle * 3 + phase)
      + Math.sin(angle * 5 - vertical * 2 + phase * 1.7) * 0.55
      + Math.sin(index * 1.91 + phase) * 0.22;
    const radius = 1 + wave * 0.07 * variation;
    return [x * radius, y * (1 + wave * 0.035 * variation), z * radius];
  });
}

export function buildMasonryRingMeshes(params: ProceduralPropGeneratorParams): MasonryRingMeshes {
  const rng = makeRng(params.seed);
  const count = Math.max(7, Math.round(params.structure));
  const halfWidth = params.width / 2;
  const halfDepth = params.depth / 2;
  const circumference = Math.PI * (halfWidth + halfDepth);
  const stoneWidth = circumference / count * 0.92;
  const stones: Mesh[] = [];

  for (let index = 0; index < count; index++) {
    const angle = (index / count) * Math.PI * 2;
    const jitter = params.variation * rng.range(-0.045, 0.045);
    const radialScale = 1 + params.variation * rng.range(-0.08, 0.08);
    const width = stoneWidth * (1 + params.variation * rng.range(-0.18, 0.18));
    const depth = Math.min(params.width, params.depth) * (0.19 + rng.range(-0.018, 0.025) * params.variation);
    const height = params.height * (0.86 + rng.range(-0.08, 0.14) * params.variation);
    const stone = transform(irregularUnitStone(params.seed + index * 97, params.variation), {
      scale: vec3(width / 2, height / 2, depth / 2),
      rotate: vec3(rng.range(-0.08, 0.08) * params.variation, -angle + rng.range(-0.08, 0.08) * params.variation, rng.range(-0.06, 0.06) * params.variation),
      translate: vec3(
        Math.cos(angle + jitter) * (halfWidth - depth * 0.36) * radialScale,
        height / 2,
        Math.sin(angle + jitter) * (halfDepth - depth * 0.36) * radialScale,
      ),
    });
    stones.push(stone);
  }

  const firewood = params.detail > 0
    ? buildFirewoodPileMeshes({
      ...params,
      width: params.width * 0.56,
      depth: params.depth * 0.56,
      height: params.height * 0.52,
      structure: Math.max(3, Math.round(params.structure * 0.48)),
    })
    : null;

  return {
    stones: merge(...stones),
    infill: transform(cylinder(Math.min(halfWidth, halfDepth) * 0.73, params.height * 0.12, Math.max(24, count * 2)), {
      scale: vec3(halfWidth / Math.min(halfWidth, halfDepth), 1, halfDepth / Math.min(halfWidth, halfDepth)),
      translate: vec3(0, params.height * 0.06, 0),
    }),
    firewood: firewood ? transform(firewood.logs, { translate: vec3(0, params.height * 0.38, 0) }) : null,
    cutFaces: firewood ? transform(firewood.cutFaces, { translate: vec3(0, params.height * 0.38, 0) }) : null,
  };
}

function horizontalCylinder(radius: number, length: number, axis: "x" | "z", segments: number): Mesh {
  return transform(cylinder(radius, length, segments), {
    rotate: axis === "x" ? vec3(0, 0, Math.PI / 2) : vec3(Math.PI / 2, 0, 0),
  });
}

function horizontalTorus(majorRadius: number, tubeRadius: number, axis: "x" | "z", segments: number): Mesh {
  return transform(torus(majorRadius, tubeRadius, segments, 7), {
    rotate: axis === "x" ? vec3(0, 0, Math.PI / 2) : vec3(Math.PI / 2, 0, 0),
  });
}

export function buildRigidChainMesh(
  centers: Array<[number, number, number]>,
  linkRadius: number,
  wireRadius: number,
  segments = 12,
): Mesh {
  const links = centers.map(([x, y, z], index) => transform(
    torus(linkRadius, wireRadius, segments, 5),
    {
      scale: vec3(1.45, 1, 0.68),
      rotate: index % 2 === 0 ? vec3(Math.PI / 2, 0, 0) : vec3(0, 0, Math.PI / 2),
      translate: vec3(x, y, z),
    },
  ));
  return merge(...links);
}

export function buildFirewoodPileMeshes(params: ProceduralPropGeneratorParams): FirewoodPileMeshes {
  const rng = makeRng(params.seed + 910);
  const logCount = Math.max(3, Math.min(10, Math.round(params.structure)));
  const logs: Mesh[] = [];
  const cutFaces: Mesh[] = [];
  const baseRadius = params.height / Math.max(5.2, Math.ceil(logCount / 2) * 2.2);

  for (let index = 0; index < logCount; index++) {
    const layer = Math.floor(index / 3);
    const slot = index % 3 - 1;
    const axisAngle = layer % 2 === 0 ? rng.range(-0.16, 0.16) : Math.PI / 2 + rng.range(-0.16, 0.16);
    const radius = baseRadius * rng.range(0.82, 1.12);
    const maxLength = layer % 2 === 0 ? params.width : params.depth;
    const length = maxLength * rng.range(0.72, 0.94);
    const lateralSpan = layer % 2 === 0 ? params.depth : params.width;
    const lateral = slot * lateralSpan * 0.19 + rng.range(-0.025, 0.025) * lateralSpan * params.variation;
    const centerX = layer % 2 === 0 ? 0 : lateral;
    const centerZ = layer % 2 === 0 ? lateral : 0;
    const centerY = params.height * 0.12 + radius + layer * baseRadius * 1.55;
    const segments = params.detail > 0 ? 14 : 8;
    const log = transform(horizontalCylinder(radius, length, "x", segments), {
      rotate: vec3(0, axisAngle, 0),
      translate: vec3(centerX, centerY, centerZ),
    });
    logs.push(radialWaveMesh(log, params.seed + index * 31, params.variation * 0.32));

    const directionX = Math.cos(axisAngle);
    const directionZ = -Math.sin(axisAngle);
    for (const side of [-1, 1]) {
      cutFaces.push(transform(horizontalCylinder(radius * 0.94, length * 0.018, "x", segments), {
        rotate: vec3(0, axisAngle, 0),
        translate: vec3(
          centerX + directionX * length * 0.505 * side,
          centerY,
          centerZ + directionZ * length * 0.505 * side,
        ),
      }));
    }
  }

  return { logs: merge(...logs), cutFaces: merge(...cutFaces) };
}

export function buildHydrantMeshes(params: ProceduralPropGeneratorParams): HydrantMeshes {
  const segments = params.detail > 0 ? 28 : 16;
  const barrelRadius = Math.min(params.depth * 0.39, params.width * 0.17);
  const baseRadius = barrelRadius * 1.36;
  const bodyBottom = params.height * 0.08;
  const barrelTop = params.height * 0.68;
  const barrelHeight = barrelTop - bodyBottom;
  const bonnetHeight = params.height * 0.27;
  const body = merge(
    transform(cylinder(baseRadius, params.height * 0.07, segments), { translate: vec3(0, params.height * 0.035, 0) }),
    transform(torus(baseRadius * 0.78, baseRadius * 0.12, segments, 7), { translate: vec3(0, params.height * 0.075, 0) }),
    transform(cylinder(barrelRadius, barrelHeight, segments), { translate: vec3(0, bodyBottom + barrelHeight / 2, 0) }),
    transform(torus(barrelRadius * 0.97, barrelRadius * 0.07, segments, 7), { translate: vec3(0, barrelTop * 0.96, 0) }),
    transform(lathe([
      vec2(barrelRadius * 1.02, 0),
      vec2(barrelRadius * 1.16, bonnetHeight * 0.08),
      vec2(barrelRadius * 1.18, bonnetHeight * 0.22),
      vec2(barrelRadius * 1.02, bonnetHeight * 0.72),
      vec2(barrelRadius * 0.62, bonnetHeight),
    ], { segments }), { translate: vec3(0, barrelTop, 0) }),
    transform(cylinder(barrelRadius * 0.29, params.height * 0.08, 6), { translate: vec3(0, params.height * 0.96, 0) }),
  );

  const sideLength = Math.max(barrelRadius * 0.7, params.width / 2 - barrelRadius * 0.75);
  const sideY = params.height * 0.58;
  const sideOutlets: Mesh[] = [];
  for (const side of [-1, 1]) {
    sideOutlets.push(
      transform(horizontalCylinder(barrelRadius * 0.55, sideLength, "x", segments), {
        translate: vec3(side * (barrelRadius * 0.62 + sideLength / 2), sideY, 0),
      }),
      transform(horizontalTorus(barrelRadius * 0.53, barrelRadius * 0.08, "x", segments), {
        translate: vec3(side * (barrelRadius * 0.62 + sideLength * 0.92), sideY, 0),
      }),
      transform(horizontalCylinder(barrelRadius * 0.51, barrelRadius * 0.12, "x", segments), {
        translate: vec3(side * (barrelRadius * 0.62 + sideLength * 0.96), sideY, 0),
      }),
    );
  }

  const frontRadius = Math.min(params.height * 0.22, params.width * 0.22);
  const frontZ = barrelRadius * 0.72 + params.depth * 0.16;
  const frontOutlet = merge(
    transform(horizontalCylinder(frontRadius * 0.74, params.depth * 0.23, "z", segments), { translate: vec3(0, params.height * 0.4, frontZ * 0.62) }),
    transform(horizontalTorus(frontRadius * 0.78, frontRadius * 0.12, "z", segments), { translate: vec3(0, params.height * 0.4, frontZ) }),
    transform(horizontalCylinder(frontRadius * 0.74, params.depth * 0.055, "z", segments), { translate: vec3(0, params.height * 0.4, frontZ * 1.08) }),
    transform(horizontalCylinder(frontRadius * 0.18, params.depth * 0.075, "z", 6), { translate: vec3(0, params.height * 0.4, frontZ * 1.17) }),
  );

  const fastenerCount = Math.max(4, Math.round(params.structure));
  const fasteners: Mesh[] = [];
  for (let index = 0; index < fastenerCount; index++) {
    const angle = index / fastenerCount * Math.PI * 2;
    fasteners.push(transform(cylinder(barrelRadius * 0.055, barrelRadius * 0.07, 6), {
      translate: vec3(Math.cos(angle) * baseRadius * 0.72, params.height * 0.09, Math.sin(angle) * baseRadius * 0.72),
    }));
  }

  let chain: Mesh | null = null;
  if (params.detail > 0) {
    const linkCount = 8;
    const centers: Array<[number, number, number]> = [];
    for (let index = 0; index < linkCount; index++) {
      const t = index / (linkCount - 1);
      centers.push([
        frontRadius * 0.58,
        params.height * (0.35 - t * 0.19) - Math.sin(t * Math.PI) * params.height * 0.025,
        frontZ * 1.22,
      ]);
    }
    chain = buildRigidChainMesh(centers, barrelRadius * 0.1, barrelRadius * 0.022, 10);
  }

  return { body, outlets: merge(...sideOutlets, frontOutlet), fasteners: merge(...fasteners), chain };
}

export function buildWickerBasketMeshes(params: ProceduralPropGeneratorParams): WickerBasketMeshes {
  const stakeCount = Math.max(8, Math.min(24, Math.round(params.structure / 2) * 2));
  const rowCount = Math.max(5, Math.round(5 + params.detail * 7));
  const sides = params.detail > 0 ? 7 : 5;
  const stakes: Mesh[] = [];
  const weave: Mesh[] = [];
  const base: Mesh[] = [];
  const sourceWidth = 2;
  const sourceDepth = 1.48;
  const sourceHeight = 0.7;
  const strandRadius = 0.025;

  for (let index = 0; index < stakeCount; index++) {
    const angle = index / stakeCount * Math.PI * 2;
    const points = [];
    for (let step = 0; step <= 4; step++) {
      const t = step / 4;
      const flare = 0.72 + t * 0.28;
      const irregular = Math.sin(index * 2.17 + params.seed * 0.31) * params.variation * 0.025;
      points.push(vec3(
        Math.cos(angle) * sourceWidth * 0.5 * (flare + irregular * t),
        t * sourceHeight,
        Math.sin(angle) * sourceDepth * 0.5 * (flare + irregular * t),
      ));
    }
    stakes.push(sweep(smoothCurve(polyline(points), 3), { radius: strandRadius, sides, caps: true }));
  }

  const samples = params.detail > 0 ? 48 : 28;
  for (let row = 0; row < rowCount; row++) {
    const t = (row + 0.5) / rowCount;
    const flare = 0.72 + t * 0.28;
    const points = [];
    for (let sample = 0; sample < samples; sample++) {
      const angle = sample / samples * Math.PI * 2;
      const overUnder = Math.sin(angle * stakeCount + (row % 2) * Math.PI) * strandRadius * 0.7;
      points.push(vec3(
        Math.cos(angle) * (sourceWidth * 0.5 * flare + overUnder),
        sourceHeight * t,
        Math.sin(angle) * (sourceDepth * 0.5 * flare + overUnder),
      ));
    }
    weave.push(sweep(polyline(points, true), { radius: strandRadius * 0.9, sides, caps: false }));
  }

  const baseWidth = sourceWidth * 0.34;
  const baseDepth = sourceDepth * 0.34;
  const baseRows = Math.max(7, Math.round(stakeCount * 0.62));
  const baseColumns = Math.max(9, Math.round(baseRows * sourceWidth / sourceDepth));
  for (let row = 0; row < baseRows; row++) {
    const z = ((row + 0.5) / baseRows * 2 - 1) * baseDepth;
    const span = baseWidth * Math.sqrt(Math.max(0, 1 - z * z / (baseDepth * baseDepth)));
    base.push(sweep(polyline([
      vec3(-span, strandRadius * (1.2 + row % 2 * 0.32), z),
      vec3(span, strandRadius * (1.2 + row % 2 * 0.32), z),
    ]), { radius: strandRadius * 0.9, sides, caps: true }));
  }
  for (let column = 0; column < baseColumns; column++) {
    const x = ((column + 0.5) / baseColumns * 2 - 1) * baseWidth;
    const span = baseDepth * Math.sqrt(Math.max(0, 1 - x * x / (baseWidth * baseWidth)));
    base.push(sweep(polyline([
      vec3(x, strandRadius * (1.48 - column % 2 * 0.32), -span),
      vec3(x, strandRadius * (1.48 - column % 2 * 0.32), span),
    ]), { radius: strandRadius * 0.9, sides, caps: true }));
  }
  base.push(transform(torus(baseDepth, strandRadius, samples, sides), {
    scale: vec3(baseWidth / baseDepth, 1, 1),
    translate: vec3(0, strandRadius * 1.35, 0),
  }));

  const rimRadius = sourceDepth * 0.5;
  const rim = merge(
    transform(torus(rimRadius, strandRadius * 1.35, samples, sides), {
      scale: vec3(sourceWidth / sourceDepth, 1, 1),
      translate: vec3(0, sourceHeight, 0),
    }),
    transform(torus(rimRadius * 0.98, strandRadius, samples, sides), {
      scale: vec3(sourceWidth / sourceDepth, 1, 1),
      translate: vec3(0, sourceHeight - strandRadius * 2.2, 0),
    }),
  );
  const fitted = fitMeshesToBox([merge(...stakes), merge(...weave), merge(...base), rim], params.width, params.height, params.depth);
  return { stakes: fitted[0]!, weave: fitted[1]!, base: fitted[2]!, rim: fitted[3]! };
}

export function buildWateringCanMeshes(params: ProceduralPropGeneratorParams): WateringCanMeshes {
  const segments = params.detail > 0 ? 28 : 16;
  const body = merge(
    lathe([
      vec2(0, 0),
      vec2(0.31, 0),
      vec2(0.34, 0.08),
      vec2(0.36, 0.48),
      vec2(0.31, 0.68),
      vec2(0.22, 0.74),
    ], { segments }),
    transform(torus(0.31, 0.025, segments, 6), { translate: vec3(0, 0.05, 0) }),
    transform(torus(0.22, 0.025, segments, 6), { translate: vec3(0, 0.73, 0) }),
  );
  const spout = merge(
    sweep(smoothCurve(polyline([
      vec3(0, 0.27, 0.28),
      vec3(0, 0.32, 0.52),
      vec3(0, 0.49, 0.82),
      vec3(0, 0.68 + params.variation * 0.08, 1.08),
    ]), 5), { radius: 0.105, sides: segments, radiusAt: (t) => 1 - t * 0.52, caps: true }),
    transform(horizontalCylinder(0.14, 0.08, "z", segments), {
      rotate: vec3(-0.62, 0, 0),
      translate: vec3(0, 0.71 + params.variation * 0.08, 1.11),
    }),
  );
  const handle = sweep(smoothCurve(polyline([
    vec3(0, 0.56, -0.22),
    vec3(0, 0.95, -0.3),
    vec3(0, 1.12, 0.02),
    vec3(0, 0.94, 0.3),
    vec3(0, 0.66, 0.25),
  ]), 5), { radius: 0.035, sides: segments, caps: true });
  const hardware = params.detail > 0 ? merge(
    transform(torus(0.335, 0.016, segments, 5), { translate: vec3(0, 0.18, 0) }),
    transform(torus(0.335, 0.016, segments, 5), { translate: vec3(0, 0.54, 0) }),
    transform(cylinder(0.18, 0.025, segments), { translate: vec3(0, 0.755, 0) }),
  ) : null;
  const source = [body, spout, handle, ...(hardware ? [hardware] : [])];
  const fitted = fitMeshesToBox(source, params.width, params.height, params.depth);
  return { body: fitted[0]!, spout: fitted[1]!, handle: fitted[2]!, hardware: hardware ? fitted[3]! : null };
}

export function buildBenchViseMeshes(params: ProceduralPropGeneratorParams): BenchViseMeshes {
  const segments = params.detail > 0 ? 20 : 12;
  const opening = 0.18 + params.variation * 0.3;
  const body = merge(
    transform(cylinder(0.48, 0.13, segments), { translate: vec3(0, 0.065, 0) }),
    transform(roundedBox({ width: 0.72, height: 0.48, depth: 0.74, radius: 0.1, steps: 2 }), { translate: vec3(0, 0.36, -0.1) }),
    transform(roundedBox({ width: 0.58, height: 0.32, depth: 0.62, radius: 0.08, steps: 2 }), { translate: vec3(0, 0.61, -0.25) }),
  );
  const jaws = merge(
    transform(roundedBox({ width: 0.82, height: 0.32, depth: 0.22, radius: 0.035, steps: 2 }), { translate: vec3(0, 0.83, -0.34) }),
    transform(roundedBox({ width: 0.82, height: 0.32, depth: 0.22, radius: 0.035, steps: 2 }), { translate: vec3(0, 0.83, opening) }),
    transform(box(0.72, 0.12, 0.025), { translate: vec3(0, 0.89, -0.225) }),
    transform(box(0.72, 0.12, 0.025), { translate: vec3(0, 0.89, opening - 0.115) }),
  );
  const screw = merge(
    transform(horizontalCylinder(0.075, opening + 0.7, "z", segments), { translate: vec3(0, 0.48, opening * 0.5) }),
    transform(horizontalCylinder(0.14, 0.18, "z", segments), { translate: vec3(0, 0.48, opening + 0.43) }),
  );
  const handle = merge(
    transform(horizontalCylinder(0.035, 0.76, "x", segments), { translate: vec3(0, 0.48, opening + 0.54) }),
    transform(sphere(0.065, segments, Math.max(6, Math.round(segments / 2))), { translate: vec3(-0.38, 0.48, opening + 0.54) }),
    transform(sphere(0.065, segments, Math.max(6, Math.round(segments / 2))), { translate: vec3(0.38, 0.48, opening + 0.54) }),
  );
  const fitted = fitMeshesToBox([body, jaws, screw, handle], params.width, params.height, params.depth);
  return { body: fitted[0]!, jaws: fitted[1]!, screw: fitted[2]!, handle: fitted[3]! };
}

function radialWaveMesh(mesh: Mesh, seed: number, variation: number): Mesh {
  const phase = seed * 0.417;
  return deform(mesh, (x, y, z) => {
    const angle = Math.atan2(z, x);
    const radius = 1 + variation * (Math.sin(angle * 5 + phase) * 0.075 + Math.sin(angle * 9 - phase) * 0.035);
    return [x * radius, y, z * radius];
  });
}

export function buildRootedStumpMeshes(params: ProceduralPropGeneratorParams): RootedStumpMeshes {
  const rng = makeRng(params.seed);
  const radius = Math.min(params.width, params.depth) * 0.23;
  const trunkHeight = params.height * 0.9;
  const trunk = radialWaveMesh(lathe([
    vec2(radius * 1.28, 0),
    vec2(radius * 1.05, trunkHeight * 0.2),
    vec2(radius * 0.82, trunkHeight * 0.72),
    vec2(radius * 0.9, trunkHeight),
  ], { segments: params.detail > 0 ? 28 : 16 }), params.seed, params.variation);

  const rootCount = Math.max(5, Math.round(params.structure));
  const roots: Mesh[] = [transform(irregularUnitBlob(params.seed + 400, params.variation), {
    scale: vec3(params.width * 0.28, params.height * 0.12, params.depth * 0.28),
    translate: vec3(0, params.height * 0.06, 0),
  })];
  for (let index = 0; index < rootCount; index++) {
    const angle = index / rootCount * Math.PI * 2 + rng.range(-0.12, 0.12) * params.variation;
    const length = (index % 2 === 0 ? params.width : params.depth) * rng.range(0.4, 0.54);
    const rootRadius = radius * rng.range(0.18, 0.28);
    const root = taperMesh(capsule(rootRadius, length, 12, 4), { axis: "y", startScale: 1.3, endScale: 0.35 });
    roots.push(transform(root, {
      scale: vec3(1, 1, rng.range(0.72, 1.18)),
      rotate: vec3(Math.PI / 2 - 0.12, Math.PI / 2 - angle, 0),
      translate: vec3(Math.cos(angle) * length * 0.43, params.height * 0.09, Math.sin(angle) * length * 0.43),
    }));
  }

  const cutFace = transform(cylinder(radius * 0.83, params.height * 0.018, params.detail > 0 ? 28 : 16), {
    translate: vec3(0, trunkHeight + params.height * 0.009, 0),
  });

  let moss: Mesh | null = null;
  if (params.detail > 0) {
    const patches: Mesh[] = [];
    for (let index = 0; index < Math.max(3, Math.round(rootCount * 0.55)); index++) {
      const angle = rng.range(0, Math.PI * 2);
      const patchRadius = radius * rng.range(0.16, 0.3);
      patches.push(transform(irregularUnitBlob(params.seed + 700 + index, params.variation), {
        scale: vec3(patchRadius, params.height * 0.018, patchRadius * rng.range(0.65, 1.15)),
        translate: vec3(Math.cos(angle) * radius * 0.42, trunkHeight + params.height * 0.02, Math.sin(angle) * radius * 0.42),
      }));
    }
    moss = merge(...patches);
  }

  return { trunk, roots: merge(...roots), cutFace, moss };
}

export function buildSoftBagMeshes(params: ProceduralPropGeneratorParams): SoftBagMeshes {
  const source = roundedBox({
    width: params.width,
    height: params.height,
    depth: params.depth,
    radius: Math.min(params.width, params.depth, params.height) * 0.18,
    steps: params.detail > 0 ? 5 : 3,
  });
  const phase = params.seed * 0.173;
  const body = deform(source, (x, y, z) => {
    const nx = x / (params.width / 2);
    const ny = y / (params.height / 2);
    const nz = z / (params.depth / 2);
    const longitudinalBulge = 1 - Math.min(1, nz * nz);
    const centerBulge = (1 - Math.min(1, nx * nx)) * longitudinalBulge;
    const endPinch = 1 - Math.pow(Math.abs(nz), 4) * 0.14;
    const edgeCompression = 1 - Math.pow(Math.abs(nz), 5) * 0.06;
    const wrinkle = (
      Math.sin(nx * 8 + nz * 5 + phase)
      + Math.sin(nx * 13 - nz * 4 + phase * 1.7) * 0.45
    ) * params.variation * params.height * 0.012;
    return [
      x * endPinch * (1 + longitudinalBulge * 0.08 * params.variation),
      y * (1 + centerBulge * 0.34 + longitudinalBulge * 0.08) + wrinkle * (1 - Math.abs(ny)),
      z * edgeCompression,
    ];
  });

  const seamThickness = params.height * 0.09;
  const seamDepth = params.depth * 0.055;
  const seams = merge(
    transform(roundedBox({ width: params.width * 0.96, height: seamThickness, depth: seamDepth, radius: seamThickness * 0.35, steps: 2 }), {
      translate: vec3(0, 0, -params.depth / 2 + seamDepth * 0.6),
    }),
    transform(roundedBox({ width: params.width * 0.96, height: seamThickness, depth: seamDepth, radius: seamThickness * 0.35, steps: 2 }), {
      translate: vec3(0, 0, params.depth / 2 - seamDepth * 0.6),
    }),
  );

  let folds: Mesh | null = null;
  if (params.detail > 0) {
    const foldCount = Math.max(4, Math.round(params.structure));
    const foldMeshes: Mesh[] = [];
    for (let index = 0; index < foldCount; index++) {
      const x = -params.width * 0.38 + params.width * 0.76 * (index / Math.max(1, foldCount - 1));
      foldMeshes.push(transform(capsule(params.height * 0.015, params.depth * 0.14, 8, 3), {
        rotate: vec3(Math.PI / 2, 0, 0),
        translate: vec3(x, params.height * 0.51, params.depth * (index % 2 === 0 ? 0.36 : -0.36)),
      }));
    }
    folds = merge(...foldMeshes);
  }

  return { body: transform(body, { translate: vec3(0, params.height / 2, 0) }), seams: transform(seams, { translate: vec3(0, params.height / 2, 0) }), folds };
}

export function buildTimberTableMeshes(params: ProceduralPropGeneratorParams): TimberTableMeshes {
  const plankCount = Math.max(3, Math.round(params.structure));
  const topThickness = params.height * 0.075;
  const topY = params.height - topThickness / 2;
  const gap = params.depth * 0.006;
  const boardDepth = (params.depth - gap * (plankCount - 1)) / plankCount;
  const boards: Mesh[] = [];
  for (let index = 0; index < plankCount; index++) {
    const z = -params.depth / 2 + boardDepth / 2 + index * (boardDepth + gap);
    const edgeJitter = params.variation * Math.sin(params.seed * 0.37 + index * 1.91) * params.width * 0.002;
    boards.push(transform(roundedBox({ width: params.width + edgeJitter, height: topThickness, depth: boardDepth, radius: topThickness * 0.12, steps: 2 }), {
      translate: vec3(edgeJitter * 0.3, topY, z),
    }));
  }

  const postWidth = params.width * 0.055;
  const postDepth = params.depth * 0.12;
  const trestleX = params.width * 0.34;
  const footHeight = params.height * 0.075;
  const footDepth = params.depth * 0.78;
  const frame: Mesh[] = [
    transform(box(params.width * 0.78, params.height * 0.075, postDepth * 0.8), { translate: vec3(0, params.height * 0.45, 0) }),
    transform(box(params.width * 0.86, params.height * 0.055, params.depth * 0.06), { translate: vec3(0, params.height * 0.78, -params.depth * 0.36) }),
  ];
  for (const side of [-1, 1]) {
    frame.push(
      transform(taperMesh(box(postWidth, params.height * 0.72, postDepth), { axis: "y", startScale: 1.12, endScale: 0.86 }), {
        translate: vec3(side * trestleX, params.height * 0.46, 0),
      }),
      transform(roundedBox({ width: postWidth * 2.2, height: footHeight, depth: footDepth, radius: footHeight * 0.18, steps: 2 }), {
        translate: vec3(side * trestleX, footHeight / 2, 0),
      }),
      transform(box(postWidth * 1.8, params.height * 0.06, params.depth * 0.78), {
        translate: vec3(side * trestleX, params.height * 0.73, 0),
      }),
    );
  }

  let fasteners: Mesh | null = null;
  if (params.detail > 0) {
    const bolts: Mesh[] = [];
    for (const side of [-1, 1]) {
      for (const z of [-params.depth * 0.27, params.depth * 0.27]) {
        bolts.push(transform(horizontalCylinder(postWidth * 0.18, postDepth * 1.12, "z", 6), {
          translate: vec3(side * trestleX, params.height * 0.72, z),
        }));
      }
    }
    fasteners = merge(...bolts);
  }

  return { boards: merge(...boards), frame: merge(...frame), fasteners };
}

function pipePath(points: Array<[number, number, number]>, radius: number, sides: number): Mesh {
  const curve = points.length > 2
    ? smoothCurve(polyline(points.map(([x, y, z]) => vec3(x, y, z))), 4)
    : polyline(points.map(([x, y, z]) => vec3(x, y, z)));
  return sweep(curve, { radius, sides, caps: false });
}

function axisCylinder(radius: number, length: number, axis: "x" | "y" | "z", segments: number): Mesh {
  if (axis === "x") return horizontalCylinder(radius, length, "x", segments);
  if (axis === "z") return horizontalCylinder(radius, length, "z", segments);
  return cylinder(radius, length, segments);
}

function pipeFlange(
  center: [number, number, number],
  axis: "x" | "y" | "z",
  radius: number,
  thickness: number,
  segments: number,
  boltCount: number,
): { plate: Mesh; bolts: Mesh } {
  const [x, y, z] = center;
  const plate = transform(axisCylinder(radius, thickness, axis, segments), { translate: vec3(x, y, z) });
  const boltMeshes: Mesh[] = [];
  for (let index = 0; index < boltCount; index++) {
    const angle = index / boltCount * Math.PI * 2;
    const radial = radius * 0.72;
    const offset = axis === "x"
      ? vec3(0, Math.cos(angle) * radial, Math.sin(angle) * radial)
      : axis === "z"
        ? vec3(Math.cos(angle) * radial, Math.sin(angle) * radial, 0)
        : vec3(Math.cos(angle) * radial, 0, Math.sin(angle) * radial);
    boltMeshes.push(transform(axisCylinder(radius * 0.09, thickness * 1.35, axis, 6), {
      translate: vec3(x + offset.x, y + offset.y, z + offset.z),
    }));
  }
  return { plate, bolts: merge(...boltMeshes) };
}

export function buildIndustrialPipeMeshes(params: ProceduralPropGeneratorParams): IndustrialPipeMeshes {
  const sides = params.detail > 0 ? 20 : 12;
  const radius = Math.min(params.width * 0.055, params.depth * 0.22);
  const pipes = [
    pipePath([
      [-params.width * 0.38, params.height * 0.08, 0],
      [-params.width * 0.38, params.height * 0.62, 0],
      [-params.width * 0.34, params.height * 0.75, 0],
      [-params.width * 0.22, params.height * 0.82, 0],
      [-params.width * 0.05, params.height * 0.82, 0],
      [params.width * 0.02, params.height * 0.75, 0],
      [params.width * 0.02, params.height * 0.62, 0],
    ], radius, sides),
    pipePath([
      [params.width * 0.02, params.height * 0.08, 0],
      [params.width * 0.02, params.height * 0.48, 0],
    ], radius, sides),
    pipePath([
      [params.width * 0.02, params.height * 0.42, 0],
      [params.width * 0.4, params.height * 0.42, 0],
    ], radius, sides),
    pipePath([
      [params.width * 0.4, params.height * 0.08, 0],
      [params.width * 0.4, params.height * 0.92, 0],
    ], radius, sides),
  ];

  const flangeSpecs: Array<[[number, number, number], "x" | "y" | "z"]> = [
    [[-params.width * 0.38, params.height * 0.08, 0], "y"],
    [[params.width * 0.02, params.height * 0.08, 0], "y"],
    [[params.width * 0.4, params.height * 0.08, 0], "y"],
    [[params.width * 0.4, params.height * 0.92, 0], "y"],
    [[params.width * 0.4, params.height * 0.42, 0], "x"],
  ];
  const flangeMeshes: Mesh[] = [];
  const boltMeshes: Mesh[] = [];
  const boltCount = Math.max(4, Math.min(12, Math.round(params.structure * 0.6)));
  for (const [center, axis] of flangeSpecs) {
    const flange = pipeFlange(center, axis, radius * 1.75, radius * 0.55, sides, boltCount);
    flangeMeshes.push(flange.plate);
    boltMeshes.push(flange.bolts);
  }

  let valve: Mesh | null = null;
  if (params.detail > 0) {
    const wheelRadius = radius * 2.35;
    const wheelX = params.width * 0.2;
    const wheelY = params.height * 0.42;
    const wheelZ = radius * 1.9;
    const spokes: Mesh[] = [];
    for (let index = 0; index < 4; index++) {
      spokes.push(transform(box(wheelRadius * 1.65, radius * 0.16, radius * 0.16), {
        rotate: vec3(0, 0, index * Math.PI / 4),
        translate: vec3(wheelX, wheelY, wheelZ),
      }));
    }
    valve = merge(
      transform(torus(wheelRadius, radius * 0.16, 20, 6), {
        rotate: vec3(Math.PI / 2, 0, 0),
        translate: vec3(wheelX, wheelY, wheelZ),
      }),
      ...spokes,
      transform(horizontalCylinder(radius * 0.28, wheelZ, "z", 10), {
        translate: vec3(wheelX, wheelY, wheelZ * 0.5),
      }),
    );
  }

  const source = [merge(...pipes), merge(...flangeMeshes), ...(valve ? [valve] : []), merge(...boltMeshes)];
  const fitted = fitMeshesToBox(source, params.width, params.height, params.depth);
  return {
    pipes: fitted[0]!,
    flanges: fitted[1]!,
    valve: valve ? fitted[2]! : null,
    fasteners: fitted[3] ?? null,
  };
}

export function buildRuinedArchMeshes(params: ProceduralPropGeneratorParams): RuinedArchMeshes {
  const span = params.width * 0.5;
  const pierHeight = params.height * 0.54;
  const pierWidth = params.width * 0.245;
  const ringThickness = params.width * 0.105;
  const damage = clamp(params.damage, 0, 1);
  const intact = archway({
    span,
    pierHeight,
    pierWidth,
    depth: params.depth * 0.48,
    ringThickness: ringThickness * 0.78,
    segments: params.detail > 0 ? 24 : 12,
    keystone: false,
  });
  const core = damage > 0
    ? ruinify(intact, {
      seed: params.seed,
      crumble: damage * 0.18,
      erosion: damage * 0.2,
      chunks: 0,
      cusp: 30,
    })
    : intact;

  const rng = makeRng(params.seed + 400);
  const masonry: Mesh[] = [];
  const rows = Math.max(4, Math.round(params.structure * 0.55));
  const courseHeight = pierHeight / rows;
  for (const side of [-1, 1]) {
    for (let row = 0; row < rows; row++) {
      const exposed = row / Math.max(1, rows - 1);
      if (row > 1 && rng.next() < damage * (0.05 + exposed * 0.14)) continue;
      masonry.push(transform(irregularUnitStone(params.seed + side * 100 + row, params.variation * 0.5), {
        scale: vec3(pierWidth * 0.48, courseHeight * 0.46, params.depth * 0.42),
        rotate: vec3(0, rng.range(-0.02, 0.02) * params.variation, rng.range(-0.025, 0.025) * params.variation),
        translate: vec3(
          side * (span / 2 + pierWidth / 2) + rng.range(-pierWidth * 0.02, pierWidth * 0.02) * params.variation,
          courseHeight * (row + 0.5),
          0,
        ),
      }));
    }
  }

  const archCount = Math.max(9, Math.round(params.structure * 1.25));
  const archRadius = span / 2 + ringThickness * 0.48;
  const blockLength = Math.PI * archRadius / archCount * 0.92;
  for (let index = 0; index < archCount; index++) {
    const theta = Math.PI * (index + 0.5) / archCount;
    const crownDistance = Math.abs(index - (archCount - 1) / 2) / archCount;
    if (index > 0 && index < archCount - 1 && rng.next() < damage * (0.08 + crownDistance * 0.1)) continue;
    masonry.push(transform(irregularUnitStone(params.seed + 800 + index, params.variation * 0.45), {
      scale: vec3(blockLength * 0.5, ringThickness * 0.5, params.depth * 0.43),
      rotate: vec3(0, 0, Math.PI / 2 - theta + rng.range(-0.018, 0.018) * params.variation),
      translate: vec3(
        -Math.cos(theta) * archRadius,
        pierHeight + Math.sin(theta) * archRadius,
        0,
      ),
    }));
  }
  masonry.push(transform(irregularUnitStone(params.seed + 999, params.variation * 0.35), {
    scale: vec3(blockLength * 0.72, ringThickness * 0.62, params.depth * 0.45),
    translate: vec3(0, pierHeight + archRadius + ringThickness * 0.12, 0),
  }));
  const structure = merge(core, ...masonry);

  let rubble: Mesh | null = null;
  if (damage > 0.08) {
    const rubbleCount = Math.max(3, Math.round(params.structure * damage));
    const stones: Mesh[] = [];
    for (let index = 0; index < rubbleCount; index++) {
      const side = index % 2 === 0 ? -1 : 1;
      const size = params.width * rng.range(0.035, 0.075);
      stones.push(transform(irregularUnitStone(params.seed + 600 + index, params.variation), {
        scale: vec3(size, size * rng.range(0.55, 1.05), size * rng.range(0.7, 1.25)),
        rotate: vec3(rng.range(-0.4, 0.4), rng.range(0, Math.PI), rng.range(-0.35, 0.35)),
        translate: vec3(
          side * rng.range(params.width * 0.16, params.width * 0.48),
          size * 0.55,
          rng.range(-params.depth * 0.45, params.depth * 0.45),
        ),
      }));
    }
    rubble = merge(...stones);
  }

  const source = [structure, ...(rubble ? [rubble] : [])];
  const fitted = fitMeshesToBox(source, params.width, params.height, params.depth);
  return { structure: fitted[0]!, rubble: rubble ? fitted[1]! : null };
}

export function buildBoulderMeshes(params: ProceduralPropGeneratorParams): BoulderMeshes {
  const damage = clamp(params.damage, 0, 1);
  const rock = buildRockFormationMesh({
    seed: params.seed,
    mode: "boulder",
    radius: 1,
    height: 0.82,
    blobs: Math.max(3, Math.round(params.structure * 0.55)),
    resolution: params.detail > 0 ? 28 : 18,
    crag: 0.11 + params.variation * 0.16,
    cragFrequency: 1.2 + params.variation * 1.4,
    chip: 0.015 + damage * 0.075,
    faceCusp: 18 + (1 - damage) * 24,
  });
  return { rock: fitMeshesToBox([rock], params.width, params.height, params.depth)[0]! };
}

export function buildDeadwoodMeshes(params: ProceduralPropGeneratorParams): DeadwoodMeshes {
  const rng = makeRng(params.seed);
  const pointCount = Math.max(4, Math.round(params.structure * 0.6));
  const points = [];
  for (let index = 0; index < pointCount; index++) {
    const t = index / (pointCount - 1);
    points.push(vec3(
      (t - 0.5) * params.width,
      params.height * (0.34 + Math.sin(t * Math.PI) * 0.12 + rng.range(-0.025, 0.025) * params.variation),
      Math.sin(t * Math.PI * 2 + params.seed * 0.1) * params.depth * 0.08 * params.variation,
    ));
  }
  const trunkCurve = smoothCurve(polyline(points), params.detail > 0 ? 5 : 3);
  const trunkRadius = Math.min(params.depth, params.height) * 0.28;
  const trunk = sweepBarkTube(trunkCurve, {
    radius: trunkRadius,
    sides: params.detail > 0 ? 14 : 8,
    radiusAt: (t) => 1 - t * (0.18 + params.variation * 0.12),
    caps: true,
    barkUv: { longitudinalScale: 0.7, radialScale: 0.25 },
  });

  const damage = clamp(params.damage, 0, 1);
  const branchCount = Math.max(1, Math.round(params.structure * (0.22 + damage * 0.18)));
  const branchSegments = growBranches(trunkCurve, trunkRadius, {
    seed: params.seed + 70,
    count: branchCount,
    depth: params.detail > 0 ? 2 : 1,
    startPct: 0.08,
    endPct: 0.88,
    angle: 58,
    angleJitter: 22,
    phototropism: 0.04,
    gravity: 0.38,
    lengthScale: 0.12 + params.variation * 0.07,
    radiusScale: 0.34,
    childFalloff: 0.35,
    gnarl: 0.08 + params.variation * 0.16,
    segments: params.detail > 0 ? 5 : 3,
  });
  const branches = branchSegments.length > 0
    ? branchesToMesh(branchSegments, { sides: params.detail > 0 ? 8 : 5, minSides: 4, flare: true, barkUv: true })
    : null;

  const cutRadius = trunkRadius * 0.93;
  const cutFaces = merge(
    transform(horizontalCylinder(cutRadius, trunkRadius * 0.08, "x", params.detail > 0 ? 16 : 8), {
      translate: points[0]!,
    }),
    transform(horizontalCylinder(cutRadius * (0.82 - params.variation * 0.08), trunkRadius * 0.08, "x", params.detail > 0 ? 16 : 8), {
      translate: points[points.length - 1]!,
    }),
  );

  const source = [trunk, ...(branches ? [branches] : []), cutFaces];
  const fitted = fitMeshesToBox(source, params.width, params.height, params.depth);
  return {
    trunk: fitted[0]!,
    branches: branches ? fitted[1]! : null,
    cutFaces: fitted[branches ? 2 : 1]!,
  };
}

export function buildHandToolMeshes(kind: HandToolKind, params: ProceduralPropGeneratorParams): HandToolMeshes {
  let handle: Mesh;
  let head: Mesh;
  switch (kind) {
    case "pliers":
      handle = merge(
        transform(capsule(0.11, 1.02, 10, 4), { rotate: vec3(0, 0, -0.11), translate: vec3(-0.08, 0.55, 0) }),
        transform(capsule(0.11, 1.02, 10, 4), { rotate: vec3(0, 0, 0.11), translate: vec3(0.08, 0.55, 0) }),
      );
      head = merge(
        transform(taperMesh(capsule(0.085, 0.64, 10, 3), { axis: "y", startScale: 1.15, endScale: 0.45 }), { rotate: vec3(0, 0, -0.22), translate: vec3(-0.07, 1.31, 0) }),
        transform(taperMesh(capsule(0.085, 0.64, 10, 3), { axis: "y", startScale: 1.15, endScale: 0.45 }), { rotate: vec3(0, 0, 0.22), translate: vec3(0.07, 1.31, 0) }),
        transform(horizontalCylinder(0.12, 0.24, "z", 12), { translate: vec3(0, 1.05, 0) }),
      );
      break;
    case "screwdriver":
      handle = transform(capsule(0.24, 0.62, 14, 5), { translate: vec3(0, 0.38, 0) });
      head = merge(
        transform(cylinder(0.055, 0.95, 10), { translate: vec3(0, 1.08, 0) }),
        transform(box(0.16, 0.16, 0.045), { translate: vec3(0, 1.6, 0) }),
      );
      break;
    case "cross-pein-hammer":
      handle = transform(taperMesh(capsule(0.12, 1.28, 12, 4), { axis: "y", startScale: 0.86, endScale: 1.15 }), { translate: vec3(0, 0.66, 0) });
      head = merge(
        transform(roundedBox({ width: 0.82, height: 0.28, depth: 0.28, radius: 0.06, steps: 2 }), { translate: vec3(-0.08, 1.37, 0) }),
        transform(taperMesh(box(0.5, 0.22, 0.18), { axis: "x", startScale: 1, endScale: 0.28 }), { translate: vec3(0.54, 1.37, 0) }),
      );
      break;
    case "hatchet":
      handle = transform(taperMesh(capsule(0.12, 1.32, 12, 4), { axis: "y", startScale: 0.78, endScale: 1.12 }), { rotate: vec3(0, 0, -0.06), translate: vec3(0.08, 0.66, 0) });
      head = merge(
        transform(roundedBox({ width: 0.42, height: 0.34, depth: 0.25, radius: 0.05, steps: 2 }), { translate: vec3(0.02, 1.38, 0) }),
        transform(taperMesh(box(0.62, 0.48, 0.12), { axis: "x", startScale: 0.42, endScale: 1.1 }), { translate: vec3(-0.42, 1.38, 0) }),
      );
      break;
    case "adjustable-wrench":
    default:
      handle = transform(taperMesh(roundedBox({ width: 0.25, height: 1.18, depth: 0.16, radius: 0.08, steps: 3 }), { axis: "y", startScale: 0.72, endScale: 1.08 }), { translate: vec3(0, 0.62, 0) });
      head = merge(
        transform(roundedBox({ width: 0.72, height: 0.28, depth: 0.2, radius: 0.06, steps: 2 }), { translate: vec3(0, 1.34, 0) }),
        transform(box(0.18, 0.34, 0.22), { translate: vec3(-0.27, 1.49, 0) }),
        transform(box(0.18, 0.25, 0.22), { translate: vec3(0.27, 1.45, 0) }),
        transform(horizontalCylinder(0.08, 0.24, "z", 10), { translate: vec3(0.08, 1.31, 0) }),
      );
      break;
  }
  const [fittedHandle, fittedHead] = fitMeshesToBox([handle, head], params.width, params.height, params.depth);
  return { handle: fittedHandle!, head: fittedHead! };
}
