import { vec2 } from "../math/vec2.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  box,
  buildInstanceBuffers,
  grammarResample,
  makeMesh,
  merge,
  proximityGraphGrowth,
  proximityGrowthToMesh,
  sphere,
  transform,
  type GrammarPlacement,
  type InstanceBufferGroup,
  type Mesh,
  type NamedPart,
  type ProximityGrowthResult,
} from "../geometry/index.js";
import {
  bakeGeometryToTextures,
  materialFromGeometryBake,
  type GeometryTextureBake,
  type Material,
} from "../texture/index.js";

export interface HoudiniCityFacadeParams {
  readonly width: number;
  readonly depth: number;
  readonly floors: number;
  readonly floorHeight: number;
  readonly seed: number;
}

export interface HoudiniCityFacadeReplica {
  readonly parts: NamedPart[];
  readonly facadeGrammar: ReadonlyArray<GrammarPlacement>;
  readonly instanceBuffers: ReadonlyArray<InstanceBufferGroup>;
}

export interface HoudiniGrotParams {
  readonly pointCount: number;
  readonly width: number;
  readonly depth: number;
  readonly seed: number;
}

export interface HoudiniGrotReplica {
  readonly parts: NamedPart[];
  readonly growth: ProximityGrowthResult;
  readonly instanceBuffers: ReadonlyArray<InstanceBufferGroup>;
}

export interface HoudiniWoodTrimReplica {
  readonly parts: NamedPart[];
  readonly bake: GeometryTextureBake;
  readonly material: Material;
  readonly primitiveIds: ReadonlyArray<number>;
}

const CITY_DEFAULTS: HoudiniCityFacadeParams = {
  width: 14,
  depth: 3.2,
  floors: 6,
  floorHeight: 1.25,
  seed: 731,
};

const GROT_DEFAULTS: HoudiniGrotParams = {
  pointCount: 70,
  width: 6.4,
  depth: 4.8,
  seed: 913,
};

export function buildHoudiniCityFacadeReplica(
  params: Partial<HoudiniCityFacadeParams> = {},
): HoudiniCityFacadeReplica {
  const values = { ...CITY_DEFAULTS, ...params };
  const floors = Math.max(2, Math.floor(values.floors));
  const totalHeight = floors * values.floorHeight;
  const grammar = grammarResample(values.width, [
    {
      key: "left-corner",
      label: "左侧承重转角",
      prefab: "corner-column",
      length: 0.42,
      mode: "fixed",
    },
    {
      key: "window-bay",
      label: "重复窗格模块",
      prefab: "residential-window-bay",
      length: 1.35,
      mode: "repeat",
      minCount: 3,
    },
    {
      key: "narrow-service",
      label: "窄服务模块",
      prefab: "service-riser",
      length: 0.55,
      mode: "fixed",
      cullBelow: 10,
    },
    {
      key: "right-corner",
      label: "右侧承重转角",
      prefab: "corner-column",
      length: 0.42,
      mode: "fixed",
    },
  ], {
    origin: -values.width * 0.5,
    fill: "distribute",
  });
  const bays = grammar.filter((placement) => placement.key === "window-bay");
  const rng = makeRng(values.seed);
  const windowFrame = unitWindowFrame();
  const windowGlass = box(0.78, 0.72, 0.025);
  const frameMeshes: Mesh[] = [];
  const glassMeshes: Mesh[] = [];
  const records = [];
  const transforms = [];
  for (let floor = 1; floor < floors; floor++) {
    for (let bay = 0; bay < bays.length; bay++) {
      const placement = bays[bay]!;
      const width = placement.length * 0.72;
      const height = values.floorHeight * 0.58;
      const position = vec3(
        placement.center,
        floor * values.floorHeight + values.floorHeight * 0.5,
        values.depth * 0.5 + 0.045,
      );
      const scale = vec3(width, height, 1);
      frameMeshes.push(transform(windowFrame, { translate: position, scale }));
      glassMeshes.push(transform(windowGlass, { translate: vec3(position.x, position.y, position.z + 0.015), scale }));
      records.push({
        meshId: "facade-window-frame",
        materialId: "dark-aluminum",
        partition: "facade",
        position,
        scale,
        customData: [floor, bay, rng.next()],
        sourceNode: `facade/grammar/window-bay/${bay}`,
      });
      records.push({
        meshId: "facade-window-glass",
        materialId: "blue-glass",
        partition: "facade",
        position: vec3(position.x, position.y, position.z + 0.015),
        scale,
        customData: [floor, bay, rng.next()],
        sourceNode: `facade/grammar/window-bay/${bay}`,
      });
      transforms.push({
        position: [position.x, position.y, position.z] as [number, number, number],
        scale: [scale.x, scale.y, scale.z] as [number, number, number],
      });
    }
  }

  const groundBays = bays.map((placement) => transform(
    box(placement.length * 0.68, values.floorHeight * 0.68, 0.04),
    {
      translate: vec3(
        placement.center,
        values.floorHeight * 0.5,
        values.depth * 0.5 + 0.04,
      ),
    },
  ));
  const columns = grammar
    .filter((placement) => placement.key.includes("corner"))
    .map((placement) => transform(
      box(placement.length, totalHeight + 0.25, values.depth + 0.12),
      { translate: vec3(placement.center, totalHeight * 0.5, 0) },
    ));
  const shell = transform(
    box(values.width, totalHeight, values.depth),
    { translate: vec3(0, totalHeight * 0.5, 0) },
  );
  const floorBands = merge(...Array.from({ length: floors + 1 }, (_, floor) => transform(
    box(values.width + 0.08, 0.065, values.depth + 0.1),
    { translate: vec3(0, floor * values.floorHeight, 0) },
  )));
  const instanceBuffers = buildInstanceBuffers(records, { customStride: 3 });
  const parts: NamedPart[] = [
    {
      name: "city_building_shell",
      label: "城市建筑主体",
      mesh: shell,
      color: [0.34, 0.36, 0.38],
      surface: { type: "concrete", params: { color: [0.34, 0.36, 0.38], roughness: 0.78 } },
      metadata: { source: "HouPcgCity", generator: "grammarResample" },
    },
    {
      name: "city_structural_bands",
      label: "楼层结构带与转角柱",
      mesh: merge(floorBands, ...columns),
      color: [0.16, 0.17, 0.18],
      surface: { type: "concrete", params: { color: [0.16, 0.17, 0.18], roughness: 0.72 } },
    },
    {
      name: "city_window_frames",
      label: "实例化住宅窗框",
      mesh: merge(...frameMeshes),
      color: [0.055, 0.06, 0.065],
      surface: { type: "metal", params: { color: [0.055, 0.06, 0.065], roughness: 0.35 } },
      renderInstances: { mesh: windowFrame, transforms },
      metadata: {
        source: "HouPcgCity HISM",
        instanceGroup: instanceBuffers.find((group) => group.meshId === "facade-window-frame")?.key,
      },
    },
    {
      name: "city_window_glass",
      label: "实例化住宅玻璃",
      mesh: merge(...glassMeshes, ...groundBays),
      color: [0.08, 0.2, 0.27],
      surface: { type: "glass", params: { tint: [0.08, 0.2, 0.27], roughness: 0.08 } },
    },
  ];
  return { parts, facadeGrammar: grammar, instanceBuffers };
}

export function buildHoudiniGrotReplica(
  params: Partial<HoudiniGrotParams> = {},
): HoudiniGrotReplica {
  const values = { ...GROT_DEFAULTS, ...params };
  const rng = makeRng(values.seed);
  const points: Vec3[] = [vec3(0, 0.42, 0)];
  for (let index = 1; index < Math.max(8, Math.floor(values.pointCount)); index++) {
    const angle = rng.range(0, Math.PI * 2);
    const radius = Math.sqrt(rng.next());
    const x = Math.cos(angle) * radius * values.width * 0.48;
    const z = Math.sin(angle) * radius * values.depth * 0.48;
    const normalized = (x * x) / (values.width * values.width * 0.25)
      + (z * z) / (values.depth * values.depth * 0.25);
    const y = 0.3 + Math.max(0, 1 - normalized) * 0.55 + rng.range(-0.05, 0.05);
    points.push(vec3(x, y, z));
  }
  const growth = proximityGraphGrowth(points, {
    rootIndex: 0,
    maxDistance: Math.max(values.width, values.depth) * 0.26,
    maxChildren: 3,
    connectIslands: true,
    relaxIterations: 3,
    relaxStrength: 0.28,
    endpointInset: 0.06,
    baseRadius: 0.13,
    endpointScale: 0.24,
    centerPower: 0.7,
  });
  const network = proximityGrowthToMesh(growth, 8);
  const terminalNodes = growth.nodes.filter((node) => node.terminal && node.parent !== null);
  const bulb = sphere(0.09, 10, 6);
  const bulbMeshes = terminalNodes.map((node) => transform(bulb, {
    translate: node.position,
    scale: 0.55 + node.radius * 3,
  }));
  const bulbRecords = terminalNodes.map((node, index) => ({
    meshId: "grot-terminal-bulb",
    materialId: "wet-flesh",
    partition: "grot-network",
    position: node.position,
    scale: 0.55 + node.radius * 3,
    customData: [node.depth, node.distanceFromRoot, index],
    sourceNode: node.id,
  }));
  const instanceBuffers = buildInstanceBuffers(bulbRecords, { customStride: 3 });
  const bed = transform(sphere(1, 36, 18), {
    translate: vec3(0, -0.18, 0),
    scale: vec3(values.width * 0.5, 0.62, values.depth * 0.5),
  });
  return {
    growth,
    instanceBuffers,
    parts: [
      {
        name: "grot_flesh_bed",
        label: "肉质影响区基床",
        mesh: bed,
        color: [0.22, 0.025, 0.035],
        surface: { type: "plastic", params: { color: [0.22, 0.025, 0.035], roughness: 0.48 } },
        metadata: { source: "GROT procedural flesh", stage: "influence-volume" },
      },
      {
        name: "grot_vascular_network",
        label: "邻接生长血管网络",
        mesh: network,
        color: [0.62, 0.035, 0.045],
        surface: { type: "plastic", params: { color: [0.62, 0.035, 0.045], roughness: 0.28 } },
        metadata: { source: "GROT procedural flesh", stage: "proximity-growth" },
      },
      {
        name: "grot_embedded_terminals",
        label: "嵌入式生长端点",
        mesh: merge(...bulbMeshes),
        color: [0.75, 0.08, 0.07],
        surface: { type: "plastic", params: { color: [0.75, 0.08, 0.07], roughness: 0.22 } },
        renderInstances: {
          mesh: bulb,
          transforms: terminalNodes.map((node) => ({
            position: [node.position.x, node.position.y, node.position.z],
            scale: [0.55 + node.radius * 3, 0.55 + node.radius * 3, 0.55 + node.radius * 3],
          })),
        },
      },
    ],
  };
}

export function buildHoudiniWoodTrimReplica(size = 256): HoudiniWoodTrimReplica {
  const { mesh, primitiveIds } = buildTrimReliefMesh();
  const bake = bakeGeometryToTextures(mesh, {
    width: size,
    height: size,
    heightAxis: vec3(0, 1, 0),
    primitiveIds,
    curvatureAoStrength: 0.8,
  });
  const material = materialFromGeometryBake(bake, {
    palette: [
      [0.15, 0.045, 0.012],
      [0.32, 0.095, 0.018],
      [0.53, 0.22, 0.055],
      [0.73, 0.4, 0.12],
      [0.25, 0.065, 0.014],
    ],
    roughness: 0.58,
    curvatureRoughness: 0.3,
    normalStrength: 9,
  });
  return {
    bake,
    material,
    primitiveIds,
    parts: [
      {
        name: "wood_trim_relief",
        label: "木质 Trim 几何浮雕",
        mesh,
        color: [0.46, 0.17, 0.035],
        surface: { type: "wood", params: { color: [0.46, 0.17, 0.035], roughness: 0.58 } },
        textures: {
          baseColor: "materials/houdini-wood-trim/houdini-wood-trim_baseColor.png",
          normal: "materials/houdini-wood-trim/houdini-wood-trim_normal.png",
          roughness: "materials/houdini-wood-trim/houdini-wood-trim_roughness.png",
          metallic: "materials/houdini-wood-trim/houdini-wood-trim_metallic.png",
          ao: "materials/houdini-wood-trim/houdini-wood-trim_ao.png",
        },
        metadata: { source: "Wood_trim_sheet.hip", generator: "bakeGeometryToTextures" },
      },
    ],
  };
}

function unitWindowFrame(): Mesh {
  return merge(
    transform(box(1, 0.08, 0.07), { translate: vec3(0, 0.46, 0) }),
    transform(box(1, 0.08, 0.07), { translate: vec3(0, -0.46, 0) }),
    transform(box(0.08, 1, 0.07), { translate: vec3(-0.46, 0, 0) }),
    transform(box(0.08, 1, 0.07), { translate: vec3(0.46, 0, 0) }),
    box(0.045, 0.92, 0.06),
  );
}

function buildTrimReliefMesh(): { mesh: Mesh; primitiveIds: number[] } {
  const stripCount = 7;
  const segments = 18;
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];
  const primitiveIds: number[] = [];
  for (let strip = 0; strip < stripCount; strip++) {
    const v0 = strip / stripCount + 0.012;
    const v1 = (strip + 1) / stripCount - 0.012;
    const z0 = (v0 - 0.5) * 4;
    const z1 = (v1 - 0.5) * 4;
    const baseHeight = 0.08 + (strip % 4) * 0.055;
    for (let segment = 0; segment < segments; segment++) {
      const u0 = segment / segments;
      const u1 = (segment + 1) / segments;
      const x0 = (u0 - 0.5) * 4;
      const x1 = (u1 - 0.5) * 4;
      const wave0 = Math.sin((u0 * 5 + strip * 0.37) * Math.PI * 2) * 0.018;
      const wave1 = Math.sin((u1 * 5 + strip * 0.37) * Math.PI * 2) * 0.018;
      const base = positions.length;
      positions.push(
        vec3(x0, baseHeight + wave0, z0),
        vec3(x1, baseHeight + wave1, z0),
        vec3(x1, baseHeight + wave1, z1),
        vec3(x0, baseHeight + wave0, z1),
      );
      normals.push(vec3(0, 1, 0), vec3(0, 1, 0), vec3(0, 1, 0), vec3(0, 1, 0));
      uvs.push(vec2(u0, v0), vec2(u1, v0), vec2(u1, v1), vec2(u0, v1));
      indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
      primitiveIds.push(strip, strip);
    }
  }
  return { mesh: makeMesh({ positions, normals, uvs, indices }), primitiveIds };
}
