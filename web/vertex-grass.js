import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const SEGMENTS = 7;
const VERTICES_PER_BLADE = (SEGMENTS + 1) * 2;
const TRIANGLES_PER_BLADE = SEGMENTS * 2;

const vertexShader = /* glsl */ `
precision highp float;

uniform mat4 uViewProjection;
uniform float uTime;
uniform float uBend;
uniform float uWindStrength;

in mat4 instanceMatrix;
in float iPhase;
in float iColorMix;
in float iStiffness;

out float vHeight;
out float vColorMix;
out vec3 vNormal;

void main() {
  float vertexId = float(gl_VertexID);
  float row = floor(vertexId * 0.5);
  float height01 = row / ${SEGMENTS.toFixed(1)};
  float side = mod(vertexId, 2.0) * 2.0 - 1.0;
  float width = (1.0 - smoothstep(0.0, 1.0, height01)) * 0.5;

  float t = uTime * 1.35 + iPhase;
  float gust = sin(t) * 0.55
    + sin(t * 0.47 + 1.7) * 0.28
    + sin(t * 0.19 - 0.8) * 0.17;
  float rootMask = height01 * height01;
  float bend = uBend * height01 + gust * uWindStrength * rootMask * iStiffness;

  vec3 localPosition = vec3(
    side * width,
    height01 * (1.0 - 0.08 * height01),
    sin(bend) * height01
  );
  vec4 worldPosition = instanceMatrix * vec4(localPosition, 1.0);

  vec3 localNormal = normalize(vec3(0.0, 0.28 + cos(bend) * 0.12, 1.0));
  vNormal = normalize(mat3(instanceMatrix) * localNormal);
  vHeight = height01;
  vColorMix = iColorMix;
  gl_Position = uViewProjection * worldPosition;
}
`;

const fragmentShader = /* glsl */ `
precision highp float;

in float vHeight;
in float vColorMix;
in vec3 vNormal;
out vec4 fragColor;

void main() {
  vec3 darkGrass = vec3(0.055, 0.20, 0.035);
  vec3 freshGrass = vec3(0.21, 0.58, 0.075);
  vec3 dryGrass = vec3(0.46, 0.47, 0.12);
  vec3 grass = mix(darkGrass, freshGrass, clamp(vHeight * 0.82 + vColorMix * 0.30, 0.0, 1.0));
  grass = mix(grass, dryGrass, smoothstep(0.82, 1.0, vColorMix) * 0.28);

  vec3 lightDirection = normalize(vec3(0.45, 0.88, 0.25));
  float diffuse = abs(dot(normalize(vNormal), lightDirection)) * 0.58 + 0.42;
  float rootOcclusion = mix(0.48, 1.0, smoothstep(0.0, 0.7, vHeight));
  fragColor = vec4(grass * diffuse * rootOcclusion, 1.0);
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

function smoothstep(value) {
  return value * value * (3 - 2 * value);
}

function hash2(x, z, seed) {
  let value = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 1442695041);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x, z, seed) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = smoothstep(x - x0);
  const tz = smoothstep(z - z0);
  const a = THREE.MathUtils.lerp(hash2(x0, z0, seed), hash2(x0 + 1, z0, seed), tx);
  const b = THREE.MathUtils.lerp(hash2(x0, z0 + 1, seed), hash2(x0 + 1, z0 + 1, seed), tx);
  return THREE.MathUtils.lerp(a, b, tz) * 2 - 1;
}

function fbm(x, z, seed) {
  let total = 0;
  let amplitude = 0.56;
  let frequency = 1;
  for (let octave = 0; octave < 5; octave++) {
    total += valueNoise(x * frequency, z * frequency, seed + octave * 1013) * amplitude;
    amplitude *= 0.48;
    frequency *= 2.03;
  }
  return total;
}

const params = {
  count: 50000,
  fieldSize: 46,
  bend: 0.28,
  wind: 0.55,
  hillHeight: 4.8,
  hillScale: 0.075,
  seed: 1337,
};

function terrainHeight(x, z) {
  const broad = fbm(x * params.hillScale, z * params.hillScale, params.seed);
  const rolling = Math.sin(x * params.hillScale * 1.7 + z * params.hillScale * 0.65) * 0.18;
  const ridge = 1 - Math.abs(fbm(x * params.hillScale * 0.56 + 12.7, z * params.hillScale * 0.56 - 8.3, params.seed + 97));
  return params.hillHeight * (broad * 0.72 + rolling + (ridge - 0.5) * 0.20) - 0.65;
}

function terrainNormal(x, z, target = new THREE.Vector3()) {
  const step = 0.16;
  const dx = terrainHeight(x - step, z) - terrainHeight(x + step, z);
  const dz = terrainHeight(x, z - step) - terrainHeight(x, z + step);
  return target.set(dx, step * 2, dz).normalize();
}

function createBladeGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(VERTICES_PER_BLADE * 3), 3));
  const indices = [];
  for (let segment = 0; segment < SEGMENTS; segment++) {
    const lowerLeft = segment * 2;
    const lowerRight = lowerLeft + 1;
    const upperLeft = lowerLeft + 2;
    const upperRight = lowerLeft + 3;
    indices.push(lowerLeft, upperLeft, lowerRight, lowerRight, upperLeft, upperRight);
  }
  geometry.setIndex(indices);
  return geometry;
}

function createTerrain() {
  const resolution = 150;
  const geometry = new THREE.PlaneGeometry(params.fieldSize, params.fieldSize, resolution, resolution);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const normal = new THREE.Vector3();
  const low = new THREE.Color(0x243517);
  const high = new THREE.Color(0x526032);
  const rock = new THREE.Color(0x5b5847);
  const color = new THREE.Color();

  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const y = terrainHeight(x, z);
    positions.setY(index, y);
    terrainNormal(x, z, normal);
    const heightMix = THREE.MathUtils.clamp((y + params.hillHeight * 0.5) / Math.max(params.hillHeight * 1.3, 0.01), 0, 1);
    color.copy(low).lerp(high, heightMix);
    color.lerp(rock, THREE.MathUtils.clamp((0.82 - normal.y) * 3.8, 0, 0.7));
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  positions.needsUpdate = true;
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
  });
  const terrain = new THREE.Mesh(geometry, material);
  terrain.receiveShadow = true;
  return terrain;
}

function createGrass() {
  const geometry = createBladeGeometry();
  const phases = new Float32Array(params.count);
  const colorMixes = new Float32Array(params.count);
  const stiffnesses = new Float32Array(params.count);
  const material = new THREE.RawShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    side: THREE.DoubleSide,
    glslVersion: THREE.GLSL3,
  });
  const grass = new THREE.InstancedMesh(geometry, material, params.count);
  grass.frustumCulled = false;
  grass.castShadow = false;
  grass.receiveShadow = false;

  const rng = makeRng(params.seed);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const terrainUp = new THREE.Vector3();
  const bladeUp = new THREE.Vector3();
  const align = new THREE.Quaternion();
  const yaw = new THREE.Quaternion();
  const rotation = new THREE.Quaternion();
  const worldUp = new THREE.Vector3(0, 1, 0);
  let accepted = 0;
  let attempts = 0;
  const maxAttempts = params.count * 7;
  const half = params.fieldSize * 0.49;

  while (accepted < params.count && attempts < maxAttempts) {
    attempts++;
    const x = (rng() * 2 - 1) * half;
    const z = (rng() * 2 - 1) * half;
    terrainNormal(x, z, terrainUp);
    if (terrainUp.y < 0.72) continue;
    const patch = valueNoise(x * 0.19, z * 0.19, params.seed + 611) * 0.5 + 0.5;
    if (rng() > 0.54 + patch * 0.46) continue;

    position.set(x, terrainHeight(x, z) + 0.012, z);
    bladeUp.copy(worldUp).lerp(terrainUp, 0.34).normalize();
    align.setFromUnitVectors(worldUp, bladeUp);
    yaw.setFromAxisAngle(bladeUp, rng() * Math.PI * 2);
    rotation.copy(yaw).multiply(align);
    const height = 0.48 + rng() * 0.72;
    const width = 0.045 + rng() * 0.038;
    scale.set(width, height, height);
    matrix.compose(position, rotation, scale);
    grass.setMatrixAt(accepted, matrix);
    phases[accepted] = rng() * Math.PI * 2;
    colorMixes[accepted] = rng();
    stiffnesses[accepted] = 0.72 + rng() * 0.56;
    accepted++;
  }

  geometry.setAttribute("iPhase", new THREE.InstancedBufferAttribute(phases, 1));
  geometry.setAttribute("iColorMix", new THREE.InstancedBufferAttribute(colorMixes, 1));
  geometry.setAttribute("iStiffness", new THREE.InstancedBufferAttribute(stiffnesses, 1));
  grass.count = accepted;
  grass.instanceMatrix.needsUpdate = true;
  return grass;
}

const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc4dc);
scene.fog = new THREE.Fog(0x9fc4dc, 28, 72);

const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 180);
camera.position.set(17, 10, 20);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.4, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 4;
controls.maxDistance = 70;

scene.add(new THREE.HemisphereLight(0xd7efff, 0x2d351d, 2.1));
const sun = new THREE.DirectionalLight(0xfff2cf, 2.6);
sun.position.set(-18, 26, 14);
scene.add(sun);

const uniforms = {
  uViewProjection: { value: new THREE.Matrix4() },
  uTime: { value: 0 },
  uBend: { value: params.bend },
  uWindStrength: { value: params.wind },
};

let terrain;
let grass;
function rebuild() {
  if (terrain) {
    scene.remove(terrain);
    terrain.geometry.dispose();
    terrain.material.dispose();
  }
  if (grass) {
    scene.remove(grass);
    grass.geometry.dispose();
    grass.material.dispose();
  }
  terrain = createTerrain();
  grass = createGrass();
  scene.add(terrain, grass);
  updateStats();
}

function updateStats() {
  const element = document.getElementById("stat");
  if (!element || !grass) return;
  const triangles = grass.count * TRIANGLES_PER_BLADE;
  element.textContent = `${grass.count.toLocaleString()} 株 · ${triangles.toLocaleString()} 草叶三角形 · 1 个 InstancedMesh`;
}

function bindRange(id, key, format, mode = "rebuild") {
  const input = document.getElementById(id);
  const output = document.getElementById(`${id}v`);
  const apply = () => {
    params[key] = Number(input.value);
    if (mode === "uniform") {
      uniforms[key === "bend" ? "uBend" : "uWindStrength"].value = params[key];
    } else {
      rebuild();
    }
    output.textContent = format(params[key]);
  };
  input.addEventListener(mode === "uniform" ? "input" : "change", apply);
  output.textContent = format(params[key]);
}

bindRange("count", "count", (value) => Math.round(value).toLocaleString());
bindRange("bend", "bend", (value) => value.toFixed(2), "uniform");
bindRange("wind", "wind", (value) => value.toFixed(2), "uniform");
bindRange("hillHeight", "hillHeight", (value) => value.toFixed(1));
bindRange("hillScale", "hillScale", (value) => value.toFixed(3));

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
  if (canvas.width !== Math.round(width * renderer.getPixelRatio()) || canvas.height !== Math.round(height * renderer.getPixelRatio())) {
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
    document.getElementById("draws").textContent = `${renderer.info.render.calls} 次绘制调用`;
  }
  requestAnimationFrame(frame);
}
frame();

window.__meshovaGrass = {
  getStats: () => ({
    instances: grass?.count ?? 0,
    grassTriangles: (grass?.count ?? 0) * TRIANGLES_PER_BLADE,
    drawCalls: renderer.info.render.calls,
    gpuInstancing: grass?.isInstancedMesh === true,
    seed: params.seed,
  }),
  setParams: (values) => {
    Object.assign(params, values);
    uniforms.uBend.value = params.bend;
    uniforms.uWindStrength.value = params.wind;
    rebuild();
  },
};
