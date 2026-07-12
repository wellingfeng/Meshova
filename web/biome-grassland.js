import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const FIELD_SIZE = 70;
const TERRAIN_SEGMENTS = 180;
const BLADE_SEGMENTS = 6;
const VERTICES_PER_BLADE = (BLADE_SEGMENTS + 1) * 2;
const TRIANGLES_PER_BLADE = BLADE_SEGMENTS * 2;

const params = {
  coverage: 0.58,
  edgeNoise: 0.72,
  relief: 1.7,
  grassCount: 70000,
  groundCover: 0.85,
  shrubs: 0.78,
  trees: 12,
  edgeRocks: 1,
  wind: 0.62,
  season: 0.42,
  seed: 5417,
};

const bladeVertexShader = /* glsl */ `
precision highp float;

uniform mat4 uViewProjection;
uniform float uTime;
uniform float uWind;

in mat4 instanceMatrix;
in float iPhase;
in float iColorMix;
in float iEdge;
in float iStiffness;

out float vHeight;
out float vColorMix;
out float vEdge;
out vec3 vNormal;

void main() {
  float vertexId = float(gl_VertexID);
  float row = floor(vertexId * 0.5);
  float height01 = row / ${BLADE_SEGMENTS.toFixed(1)};
  float side = mod(vertexId, 2.0) * 2.0 - 1.0;
  float taper = pow(max(1.0 - height01, 0.0), 0.72);
  vec3 base = instanceMatrix[3].xyz;
  float time = uTime * 1.15;
  float broadWave = sin(time + base.x * 0.21 + base.z * 0.13);
  float crossWave = sin(time * 0.61 - base.x * 0.08 + base.z * 0.24 + iPhase);
  float gust = broadWave * 0.68 + crossWave * 0.32;
  float rootMask = height01 * height01;
  float bend = (0.16 + gust * uWind * iStiffness) * rootMask;
  vec3 localPosition = vec3(
    side * taper * 0.5,
    height01 * (1.0 - height01 * 0.035),
    bend * height01
  );
  vec4 worldPosition = instanceMatrix * vec4(localPosition, 1.0);
  vNormal = normalize(mat3(instanceMatrix) * vec3(0.0, 0.18 + abs(bend) * 0.16, 1.0));
  vHeight = height01;
  vColorMix = iColorMix;
  vEdge = iEdge;
  gl_Position = uViewProjection * worldPosition;
}
`;

const bladeFragmentShader = /* glsl */ `
precision highp float;

uniform float uSeason;

in float vHeight;
in float vColorMix;
in float vEdge;
in vec3 vNormal;
out vec4 fragColor;

void main() {
  vec3 root = vec3(0.055, 0.105, 0.025);
  vec3 fresh = vec3(0.32, 0.48, 0.065);
  vec3 dry = vec3(0.52, 0.42, 0.095);
  vec3 tip = mix(fresh, dry, clamp(uSeason * 0.75 + vEdge * 0.38 + vColorMix * 0.12, 0.0, 1.0));
  vec3 color = mix(root, tip, smoothstep(0.02, 0.82, vHeight));
  vec3 lightDirection = normalize(vec3(-0.42, 0.86, 0.28));
  float diffuse = abs(dot(normalize(vNormal), lightDirection)) * 0.54 + 0.46;
  float rootOcclusion = mix(0.48, 1.0, smoothstep(0.0, 0.66, vHeight));
  fragColor = vec4(color * diffuse * rootOcclusion, 1.0);
}
`;

function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function hash2(x, z, seed) {
  let value = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 1442695041);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x, z, seed) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = smoothstep01(x - x0);
  const tz = smoothstep01(z - z0);
  const a = THREE.MathUtils.lerp(hash2(x0, z0, seed), hash2(x0 + 1, z0, seed), tx);
  const b = THREE.MathUtils.lerp(hash2(x0, z0 + 1, seed), hash2(x0 + 1, z0 + 1, seed), tx);
  return THREE.MathUtils.lerp(a, b, tz) * 2 - 1;
}

function fbm(x, z, seed) {
  let total = 0;
  let amplitude = 0.55;
  let frequency = 1;
  for (let octave = 0; octave < 5; octave++) {
    total += valueNoise(x * frequency, z * frequency, seed + octave * 1013) * amplitude;
    amplitude *= 0.48;
    frequency *= 2.02;
  }
  return total;
}

function biomeLobes() {
  const rng = makeRng(params.seed + 89);
  const coverageScale = THREE.MathUtils.lerp(0.78, 1.28, params.coverage);
  const anchors = [
    [-16, -9, 11, 8, -0.38],
    [-5, -3, 13, 9, 0.18],
    [8, -9, 10, 7, 0.62],
    [15, 5, 9, 12, -0.2],
    [1, 12, 12, 8, 0.34],
    [-18, 13, 8, 7, -0.55],
  ];
  return anchors.map(([x, z, radiusX, radiusZ, rotation]) => ({
    x: x + (rng() - 0.5) * 5,
    z: z + (rng() - 0.5) * 5,
    radiusX: radiusX * coverageScale * (0.88 + rng() * 0.25),
    radiusZ: radiusZ * coverageScale * (0.88 + rng() * 0.25),
    rotation: rotation + (rng() - 0.5) * 0.36,
  }));
}

let currentLobes = biomeLobes();

function ellipseField(x, z, lobe) {
  const cosine = Math.cos(lobe.rotation);
  const sine = Math.sin(lobe.rotation);
  const dx = x - lobe.x;
  const dz = z - lobe.z;
  const localX = dx * cosine - dz * sine;
  const localZ = dx * sine + dz * cosine;
  return 1 - Math.hypot(localX / lobe.radiusX, localZ / lobe.radiusZ);
}

function exclusionField(x, z) {
  const clearingA = 1 - Math.hypot((x + 5.5) / 3.8, (z - 2.5) / 2.8);
  const clearingB = 1 - Math.hypot((x - 12.5) / 3.1, (z + 7.5) / 2.4);
  const trailCenter = Math.sin((z + 5) * 0.12) * 3.2 - 1.5;
  const trail = 1 - Math.abs(x - trailCenter) / 1.2;
  return Math.max(clearingA, clearingB, trail * 0.7);
}

function biomeField(x, z) {
  let field = -1;
  for (const lobe of currentLobes) field = Math.max(field, ellipseField(x, z, lobe));
  const largeWarp = fbm(x * 0.055, z * 0.055, params.seed + 311);
  const detailWarp = fbm(x * 0.16, z * 0.16, params.seed + 907);
  const noise = (largeWarp * 0.24 + detailWarp * 0.08) * params.edgeNoise;
  return field + noise - Math.max(0, exclusionField(x, z)) * 0.5;
}

function terrainHeight(x, z) {
  const broad = fbm(x * 0.035, z * 0.035, params.seed + 17);
  const detail = fbm(x * 0.105, z * 0.105, params.seed + 43);
  const field = biomeField(x, z);
  const islandLift = smoothstep01((field + 0.12) / 0.28) * 0.72;
  return (broad * 0.72 + detail * 0.14) * params.relief + islandLift;
}

function terrainNormal(x, z, target = new THREE.Vector3()) {
  const step = 0.18;
  const dx = terrainHeight(x - step, z) - terrainHeight(x + step, z);
  const dz = terrainHeight(x, z - step) - terrainHeight(x, z + step);
  return target.set(dx, step * 2, dz).normalize();
}

function createTerrain() {
  const geometry = new THREE.PlaneGeometry(FIELD_SIZE, FIELD_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const sand = new THREE.Color(0xc5ad75);
  const darkSand = new THREE.Color(0x98805a);
  const soil = new THREE.Color(0x4f4428);
  const grass = new THREE.Color(0x68762f);
  const moss = new THREE.Color(0x3f5126);
  const color = new THREE.Color();

  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const y = terrainHeight(x, z);
    const field = biomeField(x, z);
    positions.setY(index, y);
    color.copy(sand).lerp(darkSand, clamp01((fbm(x * 0.07, z * 0.07, params.seed + 71) + 1) * 0.22));
    color.lerp(soil, smoothstep01((field + 0.12) / 0.13));
    color.lerp(grass, smoothstep01((field - 0.005) / 0.18));
    color.lerp(moss, smoothstep01((field - 0.28) / 0.35) * 0.42);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  positions.needsUpdate = true;
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, metalness: 0 });
  const terrain = new THREE.Mesh(geometry, material);
  terrain.receiveShadow = true;
  return terrain;
}

function createBladeGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(VERTICES_PER_BLADE * 3), 3));
  const indices = [];
  for (let segment = 0; segment < BLADE_SEGMENTS; segment++) {
    const lowerLeft = segment * 2;
    const lowerRight = lowerLeft + 1;
    const upperLeft = lowerLeft + 2;
    const upperRight = lowerLeft + 3;
    indices.push(lowerLeft, upperLeft, lowerRight, lowerRight, upperLeft, upperRight);
  }
  geometry.setIndex(indices);
  return geometry;
}

function randomPoint(rng) {
  const half = FIELD_SIZE * 0.49;
  return [(rng() * 2 - 1) * half, (rng() * 2 - 1) * half];
}

function composeSurfaceMatrix(matrix, x, z, height, radius, yawAngle, normalBlend, normal, scratch) {
  const position = scratch.position.set(x, terrainHeight(x, z) + height * 0.5, z);
  terrainNormal(x, z, normal);
  const up = scratch.up.set(0, 1, 0).lerp(normal, normalBlend).normalize();
  scratch.align.setFromUnitVectors(scratch.worldUp, up);
  scratch.yaw.setFromAxisAngle(up, yawAngle);
  scratch.rotation.copy(scratch.yaw).multiply(scratch.align);
  scratch.scale.set(radius, height, radius);
  matrix.compose(position, scratch.rotation, scratch.scale);
}

function createScratch() {
  return {
    position: new THREE.Vector3(),
    scale: new THREE.Vector3(),
    up: new THREE.Vector3(),
    worldUp: new THREE.Vector3(0, 1, 0),
    align: new THREE.Quaternion(),
    yaw: new THREE.Quaternion(),
    rotation: new THREE.Quaternion(),
  };
}

function createGrass(uniforms) {
  const geometry = createBladeGeometry();
  const phases = new Float32Array(params.grassCount);
  const colorMixes = new Float32Array(params.grassCount);
  const edges = new Float32Array(params.grassCount);
  const stiffnesses = new Float32Array(params.grassCount);
  const material = new THREE.RawShaderMaterial({
    vertexShader: bladeVertexShader,
    fragmentShader: bladeFragmentShader,
    uniforms,
    side: THREE.DoubleSide,
    glslVersion: THREE.GLSL3,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, params.grassCount);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  const rng = makeRng(params.seed + 1201);
  const matrix = new THREE.Matrix4();
  const normal = new THREE.Vector3();
  const scratch = createScratch();
  let accepted = 0;
  let attempts = 0;
  const maxAttempts = params.grassCount * 8;

  while (accepted < params.grassCount && attempts < maxAttempts) {
    attempts++;
    const [x, z] = randomPoint(rng);
    const field = biomeField(x, z);
    if (field < -0.015) continue;
    terrainNormal(x, z, normal);
    if (normal.y < 0.73) continue;
    const patch = clamp01((fbm(x * 0.18, z * 0.18, params.seed + 1591) + 1) * 0.5);
    const density = 0.32 + patch * 0.68;
    if (rng() > density) continue;
    const edge = 1 - smoothstep01((field + 0.02) / 0.2);
    const bladeHeight = THREE.MathUtils.lerp(0.38, 1.18, rng()) * THREE.MathUtils.lerp(0.72, 1, 1 - edge);
    const bladeWidth = THREE.MathUtils.lerp(0.045, 0.083, rng());
    composeSurfaceMatrix(matrix, x, z, bladeHeight, bladeWidth, rng() * Math.PI * 2, 0.28, normal, scratch);
    mesh.setMatrixAt(accepted, matrix);
    phases[accepted] = rng() * Math.PI * 2;
    colorMixes[accepted] = rng();
    edges[accepted] = edge;
    stiffnesses[accepted] = 0.72 + rng() * 0.56;
    accepted++;
  }

  geometry.setAttribute("iPhase", new THREE.InstancedBufferAttribute(phases, 1));
  geometry.setAttribute("iColorMix", new THREE.InstancedBufferAttribute(colorMixes, 1));
  geometry.setAttribute("iEdge", new THREE.InstancedBufferAttribute(edges, 1));
  geometry.setAttribute("iStiffness", new THREE.InstancedBufferAttribute(stiffnesses, 1));
  mesh.count = accepted;
  mesh.instanceMatrix.needsUpdate = true;
  return { mesh, count: accepted };
}

function fillInstanced(mesh, count, seed, accept, transform, colorFn) {
  const rng = makeRng(seed);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  let accepted = 0;
  let attempts = 0;
  while (accepted < count && attempts < Math.max(count * 30, 100)) {
    attempts++;
    const [x, z] = randomPoint(rng);
    const field = biomeField(x, z);
    if (!accept(x, z, field, rng)) continue;
    transform(matrix, x, z, field, rng);
    mesh.setMatrixAt(accepted, matrix);
    if (colorFn) mesh.setColorAt(accepted, colorFn(color, x, z, field, rng));
    accepted++;
  }
  mesh.count = accepted;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return accepted;
}

function createRocks() {
  const count = Math.round(620 * params.edgeRocks);
  const geometry = new THREE.DodecahedronGeometry(0.65, 0);
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.96,
    metalness: 0,
    vertexColors: true,
    flatShading: true,
    emissive: 0x716957,
    emissiveIntensity: 0.58,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, count));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const rock = new THREE.Color(0xcab891);
  const moss = new THREE.Color(0x789a4b);
  const accepted = fillInstanced(
    mesh,
    count,
    params.seed + 2203,
    (_x, _z, field, rng) => field > -0.095 && field < 0.065 && rng() < 0.72,
    (matrix, x, z, _field, rng) => {
      const size = THREE.MathUtils.lerp(0.45, 1.25, rng());
      position.set(x, terrainHeight(x, z) + size * 0.28, z);
      euler.set(rng() * 0.5, rng() * Math.PI * 2, rng() * 0.5);
      rotation.setFromEuler(euler);
      scale.set(size * (0.8 + rng() * 0.7), size * (0.5 + rng() * 0.5), size * (0.8 + rng() * 0.65));
      matrix.compose(position, rotation, scale);
    },
    (color, _x, _z, field, rng) => color.copy(rock).lerp(moss, clamp01((field + 0.08) * 4 + rng() * 0.38)),
  );
  return { mesh, count: accepted };
}

function createGroundCover() {
  const count = Math.round(1250 * params.groundCover);
  const geometry = new THREE.ConeGeometry(0.5, 0.8, 5, 1, true);
  geometry.translate(0, 0.4, 0);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, count));
  mesh.castShadow = false;
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const green = new THREE.Color(0x526326);
  const dry = new THREE.Color(0x8f8037);
  const accepted = fillInstanced(
    mesh,
    count,
    params.seed + 2909,
    (x, z, field, rng) => field > 0.035 && fbm(x * 0.12, z * 0.12, params.seed + 283) > -0.35 && rng() < 0.72,
    (matrix, x, z, _field, rng) => {
      const size = 0.16 + rng() * 0.3;
      position.set(x, terrainHeight(x, z), z);
      euler.set(0, rng() * Math.PI * 2, (rng() - 0.5) * 0.18);
      rotation.setFromEuler(euler);
      scale.set(size * (0.8 + rng() * 0.8), size * (0.75 + rng() * 0.7), size * (0.8 + rng() * 0.8));
      matrix.compose(position, rotation, scale);
    },
    (color, _x, _z, field, rng) => color.copy(green).lerp(dry, clamp01(params.season * 0.55 + (0.18 - field) * 0.8 + rng() * 0.16)),
  );
  return { mesh, count: accepted };
}

function createShrubs() {
  const count = Math.round(290 * params.shrubs);
  const geometry = new THREE.IcosahedronGeometry(0.72, 1);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.94, metalness: 0, vertexColors: true, flatShading: true });
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, count));
  mesh.castShadow = true;
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const green = new THREE.Color(0x31491f);
  const warm = new THREE.Color(0x87772e);
  const accepted = fillInstanced(
    mesh,
    count,
    params.seed + 3511,
    (x, z, field, rng) => field > 0.11 && fbm(x * 0.085, z * 0.085, params.seed + 619) > -0.05 && rng() < 0.52,
    (matrix, x, z, _field, rng) => {
      const size = 0.48 + rng() * 0.92;
      position.set(x, terrainHeight(x, z) + size * 0.43, z);
      euler.set(0, rng() * Math.PI * 2, 0);
      rotation.setFromEuler(euler);
      scale.set(size * (0.85 + rng() * 0.45), size * (0.6 + rng() * 0.5), size * (0.85 + rng() * 0.45));
      matrix.compose(position, rotation, scale);
    },
    (color, _x, _z, field, rng) => color.copy(green).lerp(warm, clamp01(params.season * 0.78 + (0.24 - field) * 0.32 + rng() * 0.12)),
  );
  return { mesh, count: accepted };
}

function spacedTreePoints(count) {
  const rng = makeRng(params.seed + 4079);
  const points = [];
  let attempts = 0;
  while (points.length < count && attempts < count * 160) {
    attempts++;
    const [x, z] = randomPoint(rng);
    const field = biomeField(x, z);
    if (field < 0.23 || fbm(x * 0.065, z * 0.065, params.seed + 757) < -0.05) continue;
    if (points.some((point) => Math.hypot(point.x - x, point.z - z) < 5.2)) continue;
    points.push({ x, z, scale: 0.78 + rng() * 0.62, rotation: rng() * Math.PI * 2, color: rng() });
  }
  return points;
}

function createTrees() {
  const points = spacedTreePoints(Math.round(params.trees));
  const group = new THREE.Group();
  const trunkGeometry = new THREE.CylinderGeometry(0.32, 0.52, 4.6, 7);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x896545, roughness: 0.96, flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, Math.max(1, points.length));
  const crownGeometry = new THREE.IcosahedronGeometry(1, 1);
  const crownMaterial = new THREE.MeshStandardMaterial({
    roughness: 0.9,
    metalness: 0,
    vertexColors: true,
    flatShading: true,
    emissive: 0x41682e,
    emissiveIntensity: 0.72,
  });
  const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, Math.max(1, points.length * 4));
  trunks.castShadow = true;
  crowns.castShadow = true;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const green = new THREE.Color(0x3b9d35);
  const gold = new THREE.Color(0xd1a03e);
  let crownIndex = 0;
  points.forEach((point, index) => {
    const baseY = terrainHeight(point.x, point.z);
    position.set(point.x, baseY + 2.3 * point.scale, point.z);
    euler.set(0, point.rotation, 0);
    rotation.setFromEuler(euler);
    scale.set(point.scale, point.scale, point.scale);
    matrix.compose(position, rotation, scale);
    trunks.setMatrixAt(index, matrix);
    const offsets = [[0, 5.15, 0, 2.05], [-1.05, 4.35, 0.2, 1.6], [0.95, 4.55, 0.45, 1.72], [0.2, 4.35, -1.05, 1.5]];
    for (const [offsetX, offsetY, offsetZ, radius] of offsets) {
      position.set(point.x + offsetX * point.scale, baseY + offsetY * point.scale, point.z + offsetZ * point.scale);
      euler.set(point.color * 0.3, point.rotation + crownIndex * 0.7, point.color * 0.2);
      rotation.setFromEuler(euler);
      scale.set(radius * point.scale * 1.18, radius * point.scale * 0.78, radius * point.scale);
      matrix.compose(position, rotation, scale);
      crowns.setMatrixAt(crownIndex, matrix);
      crowns.setColorAt(crownIndex, new THREE.Color().copy(green).lerp(gold, clamp01(params.season * 0.62 + point.color * 0.16)));
      crownIndex++;
    }
  });
  trunks.count = points.length;
  crowns.count = crownIndex;
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  group.add(trunks, crowns);
  return { group, count: points.length };
}

function createDistantTerrain() {
  const geometry = new THREE.CircleGeometry(75, 96);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({ color: 0xb5a06f, roughness: 1 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = -1.6;
  mesh.receiveShadow = true;
  return mesh;
}

const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.55));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8c995);
scene.fog = new THREE.FogExp2(0xd8c995, 0.0125);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 220);
camera.position.set(36, 30, 38);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.2, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 7;
controls.maxDistance = 90;

scene.add(new THREE.HemisphereLight(0xfffdf2, 0xa9aa94, 2.35));
scene.add(new THREE.AmbientLight(0xfffdf5, 0.5));
const sun = new THREE.DirectionalLight(0xfff4df, 3.2);
sun.position.set(-26, 40, 21);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -44;
sun.shadow.camera.right = 44;
sun.shadow.camera.top = 44;
sun.shadow.camera.bottom = -44;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 110;
sun.shadow.bias = -0.00025;
scene.add(sun);

const uniforms = {
  uViewProjection: { value: new THREE.Matrix4() },
  uTime: { value: 0 },
  uWind: { value: params.wind },
  uSeason: { value: params.season },
};

let biomeGroup;
let sceneStats = {};

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
    else child.material?.dispose();
  });
}

function rebuild() {
  if (biomeGroup) {
    scene.remove(biomeGroup);
    disposeObject(biomeGroup);
  }
  currentLobes = biomeLobes();
  biomeGroup = new THREE.Group();
  const terrain = createTerrain();
  const grass = createGrass(uniforms);
  const rocks = createRocks();
  const groundCover = createGroundCover();
  const shrubs = createShrubs();
  const trees = createTrees();
  biomeGroup.add(createDistantTerrain(), terrain, grass.mesh, rocks.mesh, groundCover.mesh, shrubs.mesh, trees.group);
  scene.add(biomeGroup);
  sceneStats = {
    grass: grass.count,
    rocks: rocks.count,
    groundCover: groundCover.count,
    shrubs: shrubs.count,
    trees: trees.count,
  };
  updateStats();
}

function updateStats() {
  const triangles = sceneStats.grass * TRIANGLES_PER_BLADE;
  document.getElementById("stat").textContent = `${sceneStats.grass.toLocaleString()} 草叶 · ${sceneStats.groundCover.toLocaleString()} 地被 · ${sceneStats.shrubs.toLocaleString()} 灌木 · ${sceneStats.trees} 乔木 · ${sceneStats.rocks.toLocaleString()} 边缘岩石 · ${triangles.toLocaleString()} 草叶三角形`;
}

function bindRange(id, key, format, mode = "rebuild") {
  const input = document.getElementById(id);
  const output = document.getElementById(`${id}v`);
  const apply = () => {
    params[key] = Number(input.value);
    if (mode === "uniform") {
      uniforms[key === "wind" ? "uWind" : "uSeason"].value = params[key];
      if (key === "season") rebuild();
    } else {
      rebuild();
    }
    output.textContent = format(params[key]);
  };
  input.addEventListener(mode === "uniform" && key === "wind" ? "input" : "change", apply);
  output.textContent = format(params[key]);
}

bindRange("coverage", "coverage", (value) => `${Math.round(value * 100)}%`);
bindRange("edgeNoise", "edgeNoise", (value) => value.toFixed(2));
bindRange("relief", "relief", (value) => value.toFixed(1));
bindRange("grassCount", "grassCount", (value) => Math.round(value).toLocaleString());
bindRange("groundCover", "groundCover", (value) => value.toFixed(2));
bindRange("shrubs", "shrubs", (value) => value.toFixed(2));
bindRange("trees", "trees", (value) => String(Math.round(value)));
bindRange("edgeRocks", "edgeRocks", (value) => value.toFixed(2));
bindRange("wind", "wind", (value) => value.toFixed(2), "uniform");
bindRange("season", "season", (value) => `${Math.round(value * 100)}%`, "uniform");

document.getElementById("seed").addEventListener("click", () => {
  params.seed = (params.seed + 1013) >>> 0;
  document.getElementById("seedv").textContent = String(params.seed);
  rebuild();
});
document.getElementById("seedv").textContent = String(params.seed);

rebuild();

const clock = new THREE.Clock();
let statTimer = 0;

function resize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const pixelRatio = renderer.getPixelRatio();
  if (canvas.width !== Math.round(width * pixelRatio) || canvas.height !== Math.round(height * pixelRatio)) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

function frame() {
  resize();
  controls.update();
  const elapsed = clock.getElapsedTime();
  uniforms.uTime.value = elapsed;
  camera.updateMatrixWorld();
  uniforms.uViewProjection.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  renderer.render(scene, camera);
  if (elapsed - statTimer > 0.5) {
    statTimer = elapsed;
    document.getElementById("draws").textContent = `${renderer.info.render.calls} 次绘制调用 · ${renderer.info.memory.geometries} 个 GPU 几何体`;
  }
  requestAnimationFrame(frame);
}

frame();

window.__meshovaBiome = {
  ready: true,
  getStats: () => ({ ...sceneStats, drawCalls: renderer.info.render.calls, seed: params.seed, gpuInstancing: true }),
  setParams: (values) => {
    Object.assign(params, values);
    uniforms.uWind.value = params.wind;
    uniforms.uSeason.value = params.season;
    rebuild();
  },
  setView: (position = [36, 30, 38], target = [0, 1.2, 0]) => {
    camera.position.fromArray(position);
    controls.target.fromArray(target);
    controls.update();
  },
};
