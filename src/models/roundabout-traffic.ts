import { vec2 } from "../math/vec2.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  box,
  cylinder,
  icosphere,
  makeMesh,
  merge,
  torus,
  transform,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";

type RGB = [number, number, number];

export interface RoundaboutTrafficParams {
  islandRadius: number;
  roadWidth: number;
  armLength: number;
  vehicleCount: number;
  treeCount: number;
  streetFurniture: boolean;
  seed: number;
}

export const ROUNDABOUT_TRAFFIC_DEFAULTS: RoundaboutTrafficParams = {
  islandRadius: 15,
  roadWidth: 14,
  armLength: 52,
  vehicleCount: 38,
  treeCount: 32,
  streetFurniture: true,
  seed: 178,
};

const ASPHALT: RGB = [0.105, 0.108, 0.115];
const ROAD_PAINT: RGB = [0.93, 0.92, 0.86];
const CONCRETE: RGB = [0.62, 0.61, 0.57];
const LIGHT_CONCRETE: RGB = [0.76, 0.74, 0.68];
const CURB: RGB = [0.79, 0.78, 0.74];
const GRASS: RGB = [0.19, 0.29, 0.105];
const DARK_METAL: RGB = [0.075, 0.08, 0.085];
const GLASS: RGB = [0.035, 0.08, 0.095];
const TIRE: RGB = [0.018, 0.019, 0.021];
const TRUNK: RGB = [0.2, 0.11, 0.055];
const FOLIAGE: RGB = [0.12, 0.31, 0.075];
const SIGN_BLUE: RGB = [0.035, 0.24, 0.62];

const ARM_ANGLES = [0, 52, 96, 166, 205, 270].map((degrees) => degrees * Math.PI / 180);
const CAR_COLORS: RGB[] = [
  [0.78, 0.045, 0.03],
  [0.035, 0.32, 0.57],
  [0.05, 0.57, 0.62],
  [0.72, 0.69, 0.09],
  [0.55, 0.11, 0.21],
  [0.82, 0.82, 0.78],
  [0.12, 0.13, 0.15],
  [0.4, 0.58, 0.08],
];

function surface(type: string, color: RGB, roughness: number) {
  return { type, params: { color, roughness } };
}

function part(name: string, label: string, mesh: Mesh, color: RGB, type: string, roughness: number): NamedPart {
  return { name, label, mesh, color, surface: surface(type, color, roughness) };
}

function radial(angle: number, distance: number, side = 0, y = 0): Vec3 {
  return vec3(
    Math.cos(angle) * distance - Math.sin(angle) * side,
    y,
    Math.sin(angle) * distance + Math.cos(angle) * side,
  );
}

function radialYaw(angle: number): number {
  return Math.PI / 2 - angle;
}

function flatRing(innerRadius: number, outerRadius: number, y: number, segments = 128): Mesh {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = i / segments * Math.PI * 2;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    positions.push(vec3(cosine * outerRadius, y, sine * outerRadius));
    positions.push(vec3(cosine * innerRadius, y, sine * innerRadius));
    normals.push(vec3(0, 1, 0), vec3(0, 1, 0));
    uvs.push(vec2(1, i / segments), vec2(0, i / segments));
  }
  for (let i = 0; i < segments; i++) {
    const outer0 = i * 2;
    const inner0 = outer0 + 1;
    const outer1 = outer0 + 2;
    const inner1 = outer0 + 3;
    indices.push(outer0, inner0, outer1, outer1, inner0, inner1);
  }
  return makeMesh({ positions, normals, uvs, indices });
}

function trianglePlate(width: number, length: number, y = 0.13): Mesh {
  return makeMesh({
    positions: [
      vec3(-width / 2, y, -length / 2),
      vec3(width / 2, y, -length / 2),
      vec3(0, y, length / 2),
    ],
    normals: [vec3(0, 1, 0), vec3(0, 1, 0), vec3(0, 1, 0)],
    uvs: [vec2(0, 0), vec2(1, 0), vec2(0.5, 1)],
    indices: [0, 2, 1],
  });
}

function arrowMesh(): Mesh {
  return merge(
    transform(box(0.36, 0.025, 1.75), { translate: vec3(0, 0.155, -0.42) }),
    trianglePlate(1.25, 1.45, 0.155),
  );
}

function vehicleMeshes(kind: number): { body: Mesh; glass: Mesh; wheels: Mesh; label: string } {
  const wheelMeshes: Mesh[] = [];
  const wheel = (x: number, z: number, radius: number) => transform(cylinder(radius, 0.22, 12, true), {
    rotate: vec3(0, 0, Math.PI / 2),
    translate: vec3(x, radius + 0.12, z),
  });

  let body: Mesh;
  let glass: Mesh;
  let length: number;
  let width: number;
  let label: string;
  if (kind === 1) {
    length = 7.8;
    width = 2.45;
    label = "公交车";
    body = merge(
      transform(box(width, 1.7, length), { translate: vec3(0, 1.05, 0) }),
      transform(box(width * 0.94, 0.18, length * 0.9), { translate: vec3(0, 2.0, 0) }),
    );
    glass = merge(
      transform(box(width * 0.82, 0.42, 0.1), { translate: vec3(0, 1.55, length * 0.505) }),
      transform(box(width * 0.76, 0.05, length * 0.56), { translate: vec3(0, 2.1, 0) }),
    );
  } else if (kind === 2) {
    length = 6.4;
    width = 2.25;
    label = "货车";
    body = merge(
      transform(box(width, 1.35, length * 0.38), { translate: vec3(0, 0.92, length * 0.29) }),
      transform(box(width * 0.96, 1.55, length * 0.56), { translate: vec3(0, 1.03, -length * 0.2) }),
    );
    glass = transform(box(width * 0.78, 0.34, 0.08), { translate: vec3(0, 1.33, length * 0.49) });
  } else if (kind === 3) {
    length = 5.3;
    width = 2.05;
    label = "面包车";
    body = merge(
      transform(box(width, 1.3, length), { translate: vec3(0, 0.82, 0) }),
      transform(box(width * 0.91, 0.18, length * 0.82), { translate: vec3(0, 1.57, -0.15) }),
    );
    glass = merge(
      transform(box(width * 0.78, 0.28, 0.08), { translate: vec3(0, 1.27, length * 0.505) }),
      transform(box(width * 0.72, 0.05, length * 0.42), { translate: vec3(0, 1.67, 0.45) }),
    );
  } else {
    length = 4.5;
    width = 1.85;
    label = "轿车";
    body = merge(
      transform(box(width, 0.58, length), { translate: vec3(0, 0.52, 0) }),
      transform(box(width * 0.78, 0.16, length * 0.43), { translate: vec3(0, 1.12, -0.05) }),
    );
    glass = transform(box(width * 0.72, 0.48, length * 0.38), { translate: vec3(0, 0.9, -0.02) });
  }

  const wheelRadius = kind === 1 || kind === 2 ? 0.42 : 0.32;
  const axle = length * 0.31;
  for (const x of [-width / 2 - 0.02, width / 2 + 0.02]) {
    wheelMeshes.push(wheel(x, -axle, wheelRadius), wheel(x, axle, wheelRadius));
  }
  return { body, glass, wheels: merge(...wheelMeshes), label };
}

function placedVehicle(kind: number, colorIndex: number, position: Vec3, yaw: number, scale = 1): NamedPart[] {
  const vehicle = vehicleMeshes(kind);
  const placement = { rotate: vec3(0, yaw, 0), scale, translate: position };
  const key = `${kind}_${colorIndex}_${position.x.toFixed(2)}_${position.z.toFixed(2)}`;
  const color = CAR_COLORS[colorIndex % CAR_COLORS.length]!;
  return [
    part(`vehicle_body_${key}`, vehicle.label, transform(vehicle.body, placement), color, "carPaint", 0.24),
    part(`vehicle_glass_${key}`, `${vehicle.label}玻璃`, transform(vehicle.glass, placement), GLASS, "glass", 0.08),
    part(`vehicle_wheels_${key}`, `${vehicle.label}轮胎`, transform(vehicle.wheels, placement), TIRE, "rubber", 0.86),
  ];
}

function isNearRoad(x: number, z: number, halfWidth: number, maxDistance: number): boolean {
  const radius = Math.hypot(x, z);
  if (radius < maxDistance * 0.46) return true;
  for (const angle of ARM_ANGLES) {
    const forward = x * Math.cos(angle) + z * Math.sin(angle);
    const side = -x * Math.sin(angle) + z * Math.cos(angle);
    if (forward > 0 && forward < maxDistance && Math.abs(side) < halfWidth) return true;
  }
  return false;
}

export function buildRoundaboutTrafficParts(params: Partial<RoundaboutTrafficParams> = {}): NamedPart[] {
  const p = { ...ROUNDABOUT_TRAFFIC_DEFAULTS, ...params };
  const roadWidth = Math.max(8, p.roadWidth);
  const innerRadius = Math.max(8, p.islandRadius + 1);
  const outerRadius = innerRadius + roadWidth;
  const armLength = Math.max(24, p.armLength);
  const roadEnd = outerRadius + armLength;
  const worldSize = (roadEnd + 10) * 2;
  const rng = makeRng(Math.round(p.seed));
  const parts: NamedPart[] = [];

  parts.push(part("landscape_ground", "绿地", transform(box(worldSize, 0.12, worldSize), {
    translate: vec3(0, -0.09, 0),
  }), GRASS, "foliage", 1));

  const plazaMeshes = [
    transform(box(34, 0.08, 26), { rotate: vec3(0, -0.18, 0), translate: radial(122 * Math.PI / 180, roadEnd - 12, 0, -0.01) }),
    transform(box(31, 0.08, 24), { rotate: vec3(0, 0.28, 0), translate: radial(185 * Math.PI / 180, roadEnd - 13, 0, -0.01) }),
  ];
  parts.push(part("pedestrian_plazas", "铺装广场", merge(...plazaMeshes), LIGHT_CONCRETE, "concrete", 0.9));

  const asphaltMeshes: Mesh[] = [flatRing(innerRadius, outerRadius, 0.035)];
  const sidewalkMeshes: Mesh[] = [];
  const curbMeshes: Mesh[] = [];
  const laneMeshes: Mesh[] = [];
  const crosswalkMeshes: Mesh[] = [];
  const arrowMeshes: Mesh[] = [];
  const refugeMeshes: Mesh[] = [];
  const signMeshes: Mesh[] = [];
  const poleMeshes: Mesh[] = [];
  const lampMeshes: Mesh[] = [];
  const benchMeshes: Mesh[] = [];

  const roadCenter = outerRadius + armLength / 2;
  for (let armIndex = 0; armIndex < ARM_ANGLES.length; armIndex++) {
    const angle = ARM_ANGLES[armIndex]!;
    const yaw = radialYaw(angle);
    asphaltMeshes.push(transform(box(roadWidth, 0.12, armLength + 2), {
      rotate: vec3(0, yaw, 0),
      translate: radial(angle, roadCenter, 0, 0.02),
    }));

    for (const side of [-1, 1]) {
      sidewalkMeshes.push(transform(box(2.8, 0.16, armLength), {
        rotate: vec3(0, yaw, 0),
        translate: radial(angle, roadCenter, side * (roadWidth / 2 + 1.64), 0.09),
      }));
      curbMeshes.push(transform(box(0.24, 0.24, armLength + 1), {
        rotate: vec3(0, yaw, 0),
        translate: radial(angle, roadCenter, side * (roadWidth / 2 + 0.12), 0.14),
      }));
    }

    for (let distance = outerRadius + 11; distance < roadEnd - 2; distance += 7.2) {
      for (const side of [-roadWidth * 0.25, roadWidth * 0.25]) {
        laneMeshes.push(transform(box(0.13, 0.022, 3.4), {
          rotate: vec3(0, yaw, 0),
          translate: radial(angle, distance, side, 0.105),
        }));
      }
    }
    for (const side of [-0.2, 0.2]) {
      laneMeshes.push(transform(box(0.12, 0.024, armLength - 3), {
        rotate: vec3(0, yaw, 0),
        translate: radial(angle, roadCenter + 1, side, 0.106),
      }));
    }

    const crosswalkDistance = outerRadius + 4.8;
    for (let stripeIndex = -4; stripeIndex <= 4; stripeIndex++) {
      crosswalkMeshes.push(transform(box(roadWidth - 1.4, 0.026, 0.54), {
        rotate: vec3(0, yaw, 0),
        translate: radial(angle, crosswalkDistance + stripeIndex * 0.9, 0, 0.118),
      }));
    }

    refugeMeshes.push(transform(box(1.15, 0.3, 5.4), {
      rotate: vec3(0, yaw, 0),
      translate: radial(angle, crosswalkDistance, 0, 0.17),
    }));

    for (const side of [-roadWidth * 0.25, roadWidth * 0.25]) {
      const inward = side > 0;
      arrowMeshes.push(transform(arrowMesh(), {
        rotate: vec3(0, yaw + (inward ? Math.PI : 0), 0),
        translate: radial(angle, outerRadius + 13.5, side, 0),
      }));
    }

    if (p.streetFurniture) {
      for (const side of [-1, 1]) {
        const lampDistance = outerRadius + 14 + (armIndex % 2) * 4;
        const lampPosition = radial(angle, lampDistance, side * (roadWidth / 2 + 2.3));
        poleMeshes.push(transform(cylinder(0.12, 5.8, 12, true), {
          translate: vec3(lampPosition.x, 2.9, lampPosition.z),
        }));
        lampMeshes.push(transform(box(0.8, 0.16, 0.32), {
          rotate: vec3(0, yaw, 0),
          translate: vec3(lampPosition.x, 5.78, lampPosition.z),
        }));
      }
      const signPosition = radial(angle, outerRadius + 8.4, roadWidth / 2 + 1.5);
      signMeshes.push(
        transform(cylinder(0.065, 2.2, 10, true), { translate: vec3(signPosition.x, 1.1, signPosition.z) }),
        transform(cylinder(0.48, 0.08, 20, true), {
          rotate: vec3(Math.PI / 2, 0, yaw),
          translate: vec3(signPosition.x, 2.05, signPosition.z),
        }),
      );
    }
  }

  for (let dashIndex = 0; dashIndex < 30; dashIndex++) {
    const angle = dashIndex / 30 * Math.PI * 2;
    laneMeshes.push(transform(box(3.1, 0.024, 0.16), {
      rotate: vec3(0, -angle, 0),
      translate: radial(angle, (innerRadius + outerRadius) / 2, 0, 0.11),
    }));
  }
  for (let arrowIndex = 0; arrowIndex < 8; arrowIndex++) {
    const angle = arrowIndex / 8 * Math.PI * 2 + 0.16;
    arrowMeshes.push(transform(arrowMesh(), {
      rotate: vec3(0, -angle, 0),
      translate: radial(angle, (innerRadius + outerRadius) / 2 + 1.6),
      scale: 0.82,
    }));
  }

  parts.push(part("road_asphalt", "沥青道路", merge(...asphaltMeshes), ASPHALT, "concrete", 0.94));
  parts.push(part("sidewalks", "人行道", merge(...sidewalkMeshes), CONCRETE, "concrete", 0.82));
  parts.push(part("curbs", "路缘石", merge(...curbMeshes), CURB, "concrete", 0.72));
  parts.push(part("lane_markings", "车道线", merge(...laneMeshes), ROAD_PAINT, "ceramic", 0.55));
  parts.push(part("crosswalks", "斑马线", merge(...crosswalkMeshes), ROAD_PAINT, "ceramic", 0.52));
  parts.push(part("direction_arrows", "导向箭头", merge(...arrowMeshes), ROAD_PAINT, "ceramic", 0.52));
  parts.push(part("refuge_islands", "行人安全岛", merge(...refugeMeshes), LIGHT_CONCRETE, "concrete", 0.72));

  parts.push(part("central_island", "中央环岛", transform(cylinder(p.islandRadius, 0.3, 96, true), {
    translate: vec3(0, 0.03, 0),
  }), LIGHT_CONCRETE, "concrete", 0.84));
  parts.push(part("central_island_rings", "环岛装饰圈", merge(
    transform(torus(p.islandRadius * 0.68, 0.13, 96, 8), { translate: vec3(0, 0.18, 0) }),
    transform(torus(p.islandRadius, 0.18, 96, 8), { translate: vec3(0, 0.17, 0) }),
  ), CURB, "concrete", 0.68));
  parts.push(part("roundabout_edge_lines", "环岛边缘线", merge(
    flatRing(innerRadius + 0.5, innerRadius + 0.72, 0.112),
    flatRing(outerRadius - 0.72, outerRadius - 0.5, 0.112),
  ), ROAD_PAINT, "ceramic", 0.54));

  if (p.streetFurniture) {
    parts.push(part("lamp_posts", "路灯杆", merge(...poleMeshes), DARK_METAL, "metal", 0.4));
    parts.push(part("street_lamps", "路灯", merge(...lampMeshes), [0.92, 0.82, 0.45], "metal", 0.28));
    parts.push(part("traffic_signs", "交通标牌", merge(...signMeshes), SIGN_BLUE, "metal", 0.35));
  }

  for (let benchIndex = 0; benchIndex < 8; benchIndex++) {
    const angle = benchIndex / 8 * Math.PI * 2 + 0.24;
    const distance = outerRadius + 12 + (benchIndex % 2) * 5;
    const position = radial(angle, distance);
    if (isNearRoad(position.x, position.z, roadWidth / 2 + 3.5, roadEnd)) continue;
    benchMeshes.push(
      transform(box(2.2, 0.18, 0.55), { rotate: vec3(0, -angle, 0), translate: vec3(position.x, 0.72, position.z) }),
      transform(box(2.2, 0.14, 0.12), { rotate: vec3(0, -angle, 0), translate: vec3(position.x, 1.18, position.z) }),
    );
  }
  if (benchMeshes.length) parts.push(part("park_benches", "休息长椅", merge(...benchMeshes), [0.34, 0.17, 0.075], "bark", 0.76));

  const trunks: Mesh[] = [];
  const canopies: Mesh[] = [];
  const targetTrees = Math.max(0, Math.round(p.treeCount));
  for (let attempts = 0; attempts < targetTrees * 24 && trunks.length < targetTrees; attempts++) {
    const x = rng.range(-worldSize * 0.46, worldSize * 0.46);
    const z = rng.range(-worldSize * 0.46, worldSize * 0.46);
    if (isNearRoad(x, z, roadWidth / 2 + 5, roadEnd + 2)) continue;
    const height = rng.range(3.8, 6.3);
    const radius = rng.range(1.35, 2.25);
    trunks.push(transform(cylinder(0.18, height * 0.52, 10, true), {
      translate: vec3(x, height * 0.26, z),
    }));
    canopies.push(transform(icosphere(radius, 1), {
      scale: vec3(1, rng.range(0.85, 1.2), 1),
      translate: vec3(x, height, z),
    }));
  }
  if (trunks.length) {
    parts.push(part("tree_trunks", "树干", merge(...trunks), TRUNK, "bark", 0.95));
    parts.push(part("tree_canopies", "树冠", merge(...canopies), FOLIAGE, "foliage", 0.98));
  }

  const vehicleCount = Math.max(0, Math.round(p.vehicleCount));
  const roundaboutVehicleCount = Math.round(vehicleCount * 0.34);
  for (let vehicleIndex = 0; vehicleIndex < vehicleCount; vehicleIndex++) {
    const kindRoll = rng.next();
    const kind = kindRoll < 0.08 ? 1 : kindRoll < 0.17 ? 2 : kindRoll < 0.31 ? 3 : 0;
    const colorIndex = rng.int(0, CAR_COLORS.length - 1);
    if (vehicleIndex < roundaboutVehicleCount) {
      const angle = vehicleIndex / Math.max(1, roundaboutVehicleCount) * Math.PI * 2 + rng.range(-0.08, 0.08);
      const laneRadius = innerRadius + roadWidth * (vehicleIndex % 2 === 0 ? 0.34 : 0.68);
      parts.push(...placedVehicle(kind, colorIndex, radial(angle, laneRadius, 0, 0.11), -angle, kind === 1 ? 0.9 : 1));
    } else {
      const armIndex = vehicleIndex % ARM_ANGLES.length;
      const angle = ARM_ANGLES[armIndex]!;
      const sequence = Math.floor((vehicleIndex - roundaboutVehicleCount) / ARM_ANGLES.length);
      const outward = (vehicleIndex + armIndex) % 2 === 0;
      const side = outward ? -roadWidth * 0.25 : roadWidth * 0.25;
      const distance = outerRadius + 13 + sequence * 8.2 + rng.range(-1.1, 1.1);
      if (distance > roadEnd - 3) continue;
      const yaw = radialYaw(angle) + (outward ? 0 : Math.PI);
      parts.push(...placedVehicle(kind, colorIndex, radial(angle, distance, side, 0.11), yaw, kind === 1 ? 0.88 : 1));
    }
  }

  return parts;
}
