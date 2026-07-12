import {
  box,
  cone,
  cylinder,
  icosphere,
  makeMesh,
  merge,
  styleLowPolyMesh,
  transform,
  type LowPolyColor,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";

export interface MessengerPlanetOptions {
  radius?: number;
  buildingCount?: number;
  treeCount?: number;
  propDensity?: number;
  colorVariation?: number;
  seed?: number;
}

export const MESSENGER_PLANET_DEFAULTS: Required<MessengerPlanetOptions> = {
  radius: 5.2,
  buildingCount: 14,
  treeCount: 22,
  propDensity: 0.8,
  colorVariation: 0.055,
  seed: 2607,
};

const SOURCE_URL = "https://messenger.abeto.co/";

type GroupName =
  | "planet"
  | "plots"
  | "roads"
  | "facadeLight"
  | "facadeGray"
  | "facadeWarm"
  | "roofs"
  | "windows"
  | "accents"
  | "trunks"
  | "foliage"
  | "utilities"
  | "clouds"
  | "skin"
  | "hair"
  | "clothes"
  | "backpack";

interface GroupSpec {
  label: string;
  color: LowPolyColor;
  castShadow?: boolean;
}

const GROUPS: Record<GroupName, GroupSpec> = {
  planet: { label: "青绿球形地表", color: [0.34, 0.67, 0.63] },
  plots: { label: "浅色街区地块", color: [0.72, 0.78, 0.69] },
  roads: { label: "环形浅灰道路", color: [0.79, 0.82, 0.75] },
  facadeLight: { label: "米白建筑墙面", color: [0.78, 0.79, 0.7] },
  facadeGray: { label: "灰色建筑墙面", color: [0.55, 0.59, 0.56] },
  facadeWarm: { label: "暖色建筑墙面", color: [0.82, 0.48, 0.32] },
  roofs: { label: "深灰屋顶与檐口", color: [0.24, 0.27, 0.27] },
  windows: { label: "蓝灰窗玻璃", color: [0.2, 0.33, 0.34] },
  accents: { label: "青黄街区装饰", color: [0.1, 0.63, 0.66] },
  trunks: { label: "树干", color: [0.31, 0.23, 0.2] },
  foliage: { label: "团块树冠", color: [0.23, 0.5, 0.3] },
  utilities: { label: "电杆与街区设施", color: [0.28, 0.31, 0.3] },
  clouds: { label: "卡通云团", color: [0.72, 0.91, 0.84], castShadow: false },
  skin: { label: "快递员皮肤", color: [0.72, 0.5, 0.42] },
  hair: { label: "快递员头发", color: [0.08, 0.11, 0.13] },
  clothes: { label: "快递员制服", color: [0.11, 0.16, 0.18] },
  backpack: { label: "红色快递背包", color: [0.55, 0.16, 0.2] },
};

function gableRoof(width: number, height: number, depth: number): Mesh {
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  const positions = [
    vec3(-halfWidth, 0, -halfDepth),
    vec3(halfWidth, 0, -halfDepth),
    vec3(0, height, -halfDepth),
    vec3(-halfWidth, 0, halfDepth),
    vec3(halfWidth, 0, halfDepth),
    vec3(0, height, halfDepth),
  ];
  return makeMesh({
    positions,
    normals: positions.map(() => vec3(0, 1, 0)),
    uvs: positions.map(() => ({ x: 0, y: 0 })),
    indices: [0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3],
  });
}

function sphericalFrame(radius: number, latitude: number, longitude: number) {
  const cosLatitude = Math.cos(latitude);
  const sinLatitude = Math.sin(latitude);
  const cosLongitude = Math.cos(longitude);
  const sinLongitude = Math.sin(longitude);
  const up = vec3(cosLatitude * sinLongitude, sinLatitude, cosLatitude * cosLongitude);
  const east = vec3(cosLongitude, 0, -sinLongitude);
  const south = vec3(sinLongitude * sinLatitude, -cosLatitude, cosLongitude * sinLatitude);
  const origin = vec3(up.x * radius, up.y * radius, up.z * radius);
  return { east, up, south, origin };
}

function mapVector(point: Vec3, east: Vec3, up: Vec3, south: Vec3): Vec3 {
  return vec3(
    east.x * point.x + up.x * point.y + south.x * point.z,
    east.y * point.x + up.y * point.y + south.y * point.z,
    east.z * point.x + up.z * point.y + south.z * point.z,
  );
}

function placeOnPlanet(mesh: Mesh, radius: number, latitude: number, longitude: number): Mesh {
  const frame = sphericalFrame(radius, latitude, longitude);
  return makeMesh({
    positions: mesh.positions.map((point) => {
      const mapped = mapVector(point, frame.east, frame.up, frame.south);
      return vec3(mapped.x + frame.origin.x, mapped.y + frame.origin.y, mapped.z + frame.origin.z);
    }),
    normals: mesh.normals.map((normal) => mapVector(normal, frame.east, frame.up, frame.south)),
    uvs: mesh.uvs.slice(),
    indices: mesh.indices.slice(),
  });
}

function local(mesh: Mesh, x: number, y: number, z: number, rotateY = 0): Mesh {
  return transform(mesh, { rotate: vec3(0, rotateY, 0), translate: vec3(x, y, z) });
}

function add(groups: Map<GroupName, Mesh[]>, group: GroupName, mesh: Mesh): void {
  const entries = groups.get(group) ?? [];
  entries.push(mesh);
  groups.set(group, entries);
}

function addBuilding(
  groups: Map<GroupName, Mesh[]>,
  radius: number,
  latitude: number,
  longitude: number,
  seed: number,
): void {
  const rng = makeRng(seed);
  const width = rng.range(0.66, 1.08);
  const depth = rng.range(0.55, 0.9);
  const height = rng.range(0.75, 1.65);
  const angle = rng.range(-0.34, 0.34);
  const facade: GroupName = rng.next() < 0.18 ? "facadeWarm" : rng.next() < 0.45 ? "facadeGray" : "facadeLight";
  const onPlanet = (mesh: Mesh) => placeOnPlanet(mesh, radius, latitude, longitude);

  add(groups, "plots", onPlanet(local(box(width + 0.22, 0.08, depth + 0.2), 0, 0.06, 0, angle)));
  add(groups, facade, onPlanet(local(box(width, height, depth), 0, 0.13 + height * 0.5, 0, angle)));

  if (rng.next() < 0.62) {
    add(groups, "roofs", onPlanet(local(gableRoof(width + 0.12, rng.range(0.18, 0.34), depth + 0.14), 0, 0.13 + height, 0, angle)));
  } else {
    add(groups, "roofs", onPlanet(local(box(width + 0.12, 0.1, depth + 0.12), 0, 0.18 + height, 0, angle)));
  }

  const floors = Math.max(1, Math.floor(height / 0.42));
  for (let floor = 0; floor < floors; floor++) {
    const y = 0.32 + floor * 0.4;
    for (const x of [-width * 0.23, width * 0.23]) {
      add(groups, "windows", onPlanet(local(box(width * 0.25, 0.2, 0.035), x, y, depth * 0.5 + 0.025, angle)));
    }
  }

  if (rng.next() < 0.7) {
    add(groups, "accents", onPlanet(local(box(width * 0.52, 0.08, 0.13), 0, 0.24, depth * 0.58, angle)));
  }
  if (rng.next() < 0.55) {
    add(groups, "utilities", onPlanet(local(box(0.18, 0.14, 0.1), width * 0.34, height * 0.72, depth * 0.56, angle)));
  }
}

function addTree(
  groups: Map<GroupName, Mesh[]>,
  radius: number,
  latitude: number,
  longitude: number,
  seed: number,
): void {
  const rng = makeRng(seed);
  const scale = rng.range(0.72, 1.18);
  const trunkHeight = 0.58 * scale;
  const onPlanet = (mesh: Mesh) => placeOnPlanet(mesh, radius, latitude, longitude);
  add(groups, "trunks", onPlanet(local(cylinder(0.055 * scale, trunkHeight, 6), 0, 0.11 + trunkHeight * 0.5, 0)));
  const lobes: Mesh[] = [];
  for (let index = 0; index < 3; index++) {
    lobes.push(local(
      icosphere(0.27 * scale, 1),
      rng.range(-0.14, 0.14) * scale,
      0.2 + trunkHeight + rng.range(0.05, 0.25) * scale,
      rng.range(-0.12, 0.12) * scale,
    ));
  }
  add(groups, "foliage", onPlanet(merge(...lobes)));
}

function addUtilityPole(
  groups: Map<GroupName, Mesh[]>,
  radius: number,
  latitude: number,
  longitude: number,
  seed: number,
): void {
  const rng = makeRng(seed);
  const height = rng.range(0.78, 1.05);
  const onPlanet = (mesh: Mesh) => placeOnPlanet(mesh, radius, latitude, longitude);
  add(groups, "utilities", onPlanet(local(cylinder(0.035, height, 7), 0, 0.13 + height * 0.5, 0)));
  add(groups, "utilities", onPlanet(local(box(0.42, 0.035, 0.035), 0, 0.12 + height, 0, rng.range(-0.18, 0.18))));
  for (const x of [-0.14, 0.14]) {
    add(groups, "accents", onPlanet(local(icosphere(0.045, 1), x, 0.1 + height, 0)));
  }
}

function addCourier(groups: Map<GroupName, Mesh[]>, radius: number): void {
  const latitude = 0.72;
  const longitude = 0.02;
  const onPlanet = (mesh: Mesh) => placeOnPlanet(mesh, radius, latitude, longitude);
  for (const side of [-1, 1]) {
    add(groups, "clothes", onPlanet(local(box(0.11, 0.42, 0.13), side * 0.09, 0.32, 0)));
    add(groups, "skin", onPlanet(local(cylinder(0.045, 0.42, 7), side * 0.22, 0.74, 0, side * -0.18)));
  }
  add(groups, "clothes", onPlanet(local(box(0.38, 0.5, 0.22), 0, 0.76, 0)));
  add(groups, "skin", onPlanet(local(icosphere(0.2, 2), 0, 1.17, 0)));
  add(groups, "hair", onPlanet(local(icosphere(0.205, 1), 0, 1.23, -0.04)));
  add(groups, "backpack", onPlanet(local(box(0.34, 0.58, 0.25), 0, 0.83, -0.23)));
  add(groups, "accents", onPlanet(local(box(0.22, 0.09, 0.03), 0, 0.95, 0.13)));
}

function addCloud(
  groups: Map<GroupName, Mesh[]>,
  radius: number,
  latitude: number,
  longitude: number,
  seed: number,
): void {
  const rng = makeRng(seed);
  const lobes: Mesh[] = [];
  for (let index = 0; index < 5; index++) {
    lobes.push(local(
      icosphere(rng.range(0.18, 0.32), 1),
      (index - 2) * 0.22,
      1.55 + rng.range(-0.06, 0.12),
      rng.range(-0.1, 0.1),
    ));
  }
  add(groups, "clouds", placeOnPlanet(merge(...lobes), radius, latitude, longitude));
}

function styledGroup(
  name: GroupName,
  meshes: Mesh[],
  seed: number,
  colorVariation: number,
): NamedPart {
  const spec = GROUPS[name];
  const styled = styleLowPolyMesh(merge(...meshes), spec.color, {
    seed,
    colorVariation: name === "windows" || name === "hair" ? colorVariation * 0.35 : colorVariation,
  });
  return {
    name: `messenger_${name}`,
    label: spec.label,
    mesh: styled.mesh,
    colors: styled.colors,
    color: spec.color,
    metadata: {
      style: "messenger-toon",
      sourceStudy: SOURCE_URL,
      castShadow: spec.castShadow !== false,
      originalAssets: false,
    },
  };
}

export function buildMessengerPlanetParts(options: MessengerPlanetOptions = {}): NamedPart[] {
  const params = { ...MESSENGER_PLANET_DEFAULTS, ...options };
  const radius = Math.max(2.5, params.radius);
  const buildingCount = Math.max(1, Math.round(params.buildingCount));
  const treeCount = Math.max(0, Math.round(params.treeCount));
  const propDensity = Math.max(0, Math.min(1, params.propDensity));
  const groups = new Map<GroupName, Mesh[]>();
  const rng = makeRng(params.seed);

  add(groups, "planet", icosphere(radius, 3));

  for (let index = 0; index < 9; index++) {
    const latitude = -0.04 + index * 0.12;
    const longitude = -0.86 + index * 0.21;
    const length = index % 2 === 0 ? 1.45 : 1.1;
    add(groups, "roads", placeOnPlanet(local(box(length, 0.055, 0.22), 0, 0.055, 0, index * 0.26 - 0.45), radius, latitude, longitude));
  }

  for (let index = 0; index < buildingCount; index++) {
    const row = index % 3;
    const latitude = 0.04 + row * 0.28 + rng.range(-0.06, 0.06);
    const longitude = -0.88 + (index / Math.max(1, buildingCount - 1)) * 1.72 + rng.range(-0.08, 0.08);
    addBuilding(groups, radius, latitude, longitude, params.seed + index * 37 + 11);
  }

  for (let index = 0; index < treeCount; index++) {
    const latitude = rng.range(-0.08, 0.94);
    const longitude = rng.range(-1.03, 1.03);
    addTree(groups, radius, latitude, longitude, params.seed + 700 + index * 19);
  }

  const poleCount = Math.round(6 * propDensity);
  for (let index = 0; index < poleCount; index++) {
    addUtilityPole(
      groups,
      radius,
      0.05 + index * 0.15,
      -0.76 + index * 0.29,
      params.seed + 1200 + index,
    );
  }

  addCourier(groups, radius);
  addCloud(groups, radius, 0.12, -1.38, params.seed + 1601);
  addCloud(groups, radius, 0.54, 1.35, params.seed + 1602);
  addCloud(groups, radius, -0.28, 0.95, params.seed + 1603);

  return Array.from(groups.entries()).map(([name, meshes], index) =>
    styledGroup(name, meshes, params.seed + index * 101, params.colorVariation),
  );
}
