import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ShallowWaterGrid } from "/dist/simulation/shallow-water.js";

const GRID_SIZE = 96;
const WORLD_SIZE = 44;
const CELL_SIZE = WORLD_SIZE / (GRID_SIZE - 1);
const HALF_WORLD = WORLD_SIZE * 0.5;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(min, max, value) {
  const t = clamp((value - min) / Math.max(max - min, 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}

function hash2(x, z) {
  let value = Math.imul(x, 374761393) + Math.imul(z, 668265263) + 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x, z) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = smoothstep(0, 1, x - x0);
  const tz = smoothstep(0, 1, z - z0);
  const a = THREE.MathUtils.lerp(hash2(x0, z0), hash2(x0 + 1, z0), tx);
  const b = THREE.MathUtils.lerp(hash2(x0, z0 + 1), hash2(x0 + 1, z0 + 1), tx);
  return THREE.MathUtils.lerp(a, b, tz) * 2 - 1;
}

function fbm(x, z) {
  let result = 0;
  let amplitude = 0.58;
  let frequency = 1;
  for (let octave = 0; octave < 5; octave++) {
    result += valueNoise(x * frequency, z * frequency) * amplitude;
    amplitude *= 0.47;
    frequency *= 2.08;
  }
  return result;
}

function rawTerrainHeight(x, z) {
  const channelCenter = Math.sin(z * 0.115) * 2.7 - smoothstep(-18, 12, z) * 1.2;
  const channelWidth = 3.4 + smoothstep(12, -16, z) * 2.8;
  const channelDistance = (x - channelCenter) / channelWidth;
  const canyon = Math.exp(-channelDistance * channelDistance) * (2.2 + smoothstep(14, -14, z) * 3.9);
  const shelf = 1.8 + smoothstep(-10, 16, z) * 1.65;
  const sideRidges = Math.abs(fbm(x * 0.065 + 4.3, z * 0.065 - 8.1)) * 1.05;
  const strata = Math.sin((x + z * 0.34) * 0.78 + fbm(x * 0.12, z * 0.12) * 1.7) * 0.22;
  const detail = fbm(x * 0.16, z * 0.16) * 0.52;
  const frontBasin = smoothstep(2, -18, z) * 0.9;
  let height = shelf + sideRidges + strata + detail - canyon - frontBasin;
  const rim = smoothstep(19.2, 21.5, Math.max(Math.abs(x), Math.abs(z))) * 5.5;
  height += rim;
  return height;
}

function obstacleMask(x, z) {
  const dx = Math.abs(x - 3.1);
  const dz = Math.abs(z - 8.2);
  return dx < 2.15 && dz < 1.75;
}

function terrainHeight(x, z) {
  const raw = rawTerrainHeight(x, z);
  return obstacleMask(x, z) ? Math.max(raw, 4.75) : raw;
}

function gridToWorld(x, y) {
  return {
    x: x * CELL_SIZE - HALF_WORLD,
    z: y * CELL_SIZE - HALF_WORLD,
  };
}

function worldToGrid(x, z) {
  return {
    x: clamp((x + HALF_WORLD) / CELL_SIZE, 1, GRID_SIZE - 2),
    y: clamp((z + HALF_WORLD) / CELL_SIZE, 1, GRID_SIZE - 2),
  };
}

const water = new ShallowWaterGrid({
  width: GRID_SIZE,
  height: GRID_SIZE,
  cellSize: CELL_SIZE,
  gravity: 9.8,
  friction: 0.28,
  minDepth: 0.002,
  cfl: 0.42,
});
water.setBed((x, y) => {
  const world = gridToWorld(x, y);
  return terrainHeight(world.x, world.z);
});

const sourceWorld = new THREE.Vector3(-10.5, 0, 15.4);
const sourceGrid = worldToGrid(sourceWorld.x, sourceWorld.z);
const source = { x: sourceGrid.x, y: sourceGrid.y, radius: 4.2, rate: 0.65 };

function resetSimulation() {
  water.clearWater();
  water.fillToSurface(4.15, (x, y) => {
    const world = gridToWorld(x, y);
    return world.z > 7.5 && !obstacleMask(world.x, world.z);
  });
  water.inject({ x: source.x, y: source.y, radius: 5.8, rate: 7.5 }, 0.5);
}
resetSimulation();

function makeGridGeometry(heightAt, colorAt) {
  const positions = new Float32Array(GRID_SIZE * GRID_SIZE * 3);
  const colors = new Float32Array(GRID_SIZE * GRID_SIZE * 3);
  const indices = [];
  const color = new THREE.Color();
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const index = y * GRID_SIZE + x;
      const world = gridToWorld(x, y);
      positions[index * 3] = world.x;
      positions[index * 3 + 1] = heightAt(x, y, world.x, world.z);
      positions[index * 3 + 2] = world.z;
      colorAt(color, x, y, world.x, world.z);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
  }
  for (let y = 0; y < GRID_SIZE - 1; y++) {
    for (let x = 0; x < GRID_SIZE - 1; x++) {
      const a = y * GRID_SIZE + x;
      const b = a + 1;
      const c = a + GRID_SIZE;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const canyonDark = new THREE.Color(0x50331f);
const canyonMid = new THREE.Color(0x93613a);
const canyonLight = new THREE.Color(0xc18a52);
const terrainGeometry = makeGridGeometry(
  (x, y) => water.bed[y * GRID_SIZE + x],
  (color, x, y, worldX, worldZ) => {
    const height = water.bed[y * GRID_SIZE + x];
    const detail = valueNoise(worldX * 0.42, worldZ * 0.42) * 0.5 + 0.5;
    color.copy(canyonDark).lerp(canyonMid, clamp((height + 3) / 8, 0, 1));
    color.lerp(canyonLight, detail * 0.32 + smoothstep(2, 6, height) * 0.18);
    if (obstacleMask(worldX, worldZ)) color.multiplyScalar(0.78);
  },
);
const terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 });
const terrainMesh = new THREE.Mesh(terrainGeometry, terrainMaterial);
terrainMesh.receiveShadow = true;

const waterGeometry = makeGridGeometry(
  (x, y) => water.bed[y * GRID_SIZE + x] + water.depth[y * GRID_SIZE + x] + 0.035,
  (color) => color.setRGB(1, 1, 1),
);
const waterDepthAttribute = new THREE.BufferAttribute(new Float32Array(GRID_SIZE * GRID_SIZE), 1);
const waterFoamAttribute = new THREE.BufferAttribute(new Float32Array(GRID_SIZE * GRID_SIZE), 1);
const waterSpeedAttribute = new THREE.BufferAttribute(new Float32Array(GRID_SIZE * GRID_SIZE), 1);
const waterIndices = new Uint16Array((GRID_SIZE - 1) * (GRID_SIZE - 1) * 6);
waterGeometry.setIndex(new THREE.BufferAttribute(waterIndices, 1));
waterGeometry.setAttribute("aDepth", waterDepthAttribute);
waterGeometry.setAttribute("aFoam", waterFoamAttribute);
waterGeometry.setAttribute("aSpeed", waterSpeedAttribute);
waterGeometry.getAttribute("position").setUsage(THREE.DynamicDrawUsage);
waterGeometry.getAttribute("normal").setUsage(THREE.DynamicDrawUsage);
waterDepthAttribute.setUsage(THREE.DynamicDrawUsage);
waterFoamAttribute.setUsage(THREE.DynamicDrawUsage);
waterSpeedAttribute.setUsage(THREE.DynamicDrawUsage);

const waterMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  uniforms: {
    uSunDirection: { value: new THREE.Vector3(-0.42, 0.82, 0.36).normalize() },
    uMode: { value: 0 },
  },
  vertexShader: /* glsl */ `
    attribute float aDepth;
    attribute float aFoam;
    attribute float aSpeed;
    varying float vDepth;
    varying float vFoam;
    varying float vSpeed;
    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      vNormal = normalize(normalMatrix * normal);
      vDepth = aDepth;
      vFoam = aFoam;
      vSpeed = aSpeed;
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform vec3 uSunDirection;
    uniform int uMode;
    varying float vDepth;
    varying float vFoam;
    varying float vSpeed;
    varying vec3 vWorldPosition;
    varying vec3 vNormal;

    vec3 heat(float value) {
      value = clamp(value, 0.0, 1.0);
      return clamp(vec3(1.5 - abs(value * 4.0 - 3.0), 1.5 - abs(value * 4.0 - 2.0), 1.5 - abs(value * 4.0 - 1.0)), 0.0, 1.0);
    }

    void main() {
      if (vDepth < 0.004) discard;
      vec3 normal = normalize(vNormal);
      vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
      float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.0);
      float diffuse = max(dot(normal, normalize(uSunDirection)), 0.0);
      float foam = smoothstep(0.05, 0.42, vFoam + vSpeed * 0.035);
      vec3 color;
      float alpha;
      if (uMode == 1) {
        color = heat(vDepth * 0.42);
        alpha = 0.9;
      } else if (uMode == 2) {
        color = heat(vSpeed * 0.28);
        alpha = 0.9;
      } else {
        vec3 shallowColor = vec3(0.34, 0.31, 0.17);
        vec3 deepColor = vec3(0.055, 0.19, 0.19);
        vec3 skyReflection = vec3(0.38, 0.68, 0.73);
        color = mix(shallowColor, deepColor, smoothstep(0.03, 1.7, vDepth));
        color = mix(color, skyReflection, fresnel * 0.72);
        color += diffuse * vec3(0.12, 0.10, 0.045);
        color = mix(color, vec3(0.86, 0.89, 0.78), foam * 0.86);
        alpha = mix(0.58, 0.9, smoothstep(0.03, 1.2, vDepth)) + fresnel * 0.08;
      }
      gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.96));
    }
  `,
});
const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
waterMesh.renderOrder = 4;

const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ab7bd);
scene.fog = new THREE.Fog(0x9ab7bd, 48, 105);
scene.add(terrainMesh, waterMesh);

const base = new THREE.Mesh(
  new THREE.BoxGeometry(WORLD_SIZE + 1.5, 5.5, WORLD_SIZE + 1.5),
  new THREE.MeshStandardMaterial({ color: 0x5a3925, roughness: 1 }),
);
base.position.y = -5.15;
base.receiveShadow = true;
scene.add(base);

const obstacle = new THREE.Mesh(
  new THREE.BoxGeometry(4.15, 1.8, 3.35),
  new THREE.MeshStandardMaterial({ color: 0x6f6255, roughness: 0.82 }),
);
obstacle.position.set(3.1, 5.05, 8.2);
obstacle.rotation.y = -0.08;
obstacle.castShadow = true;
obstacle.receiveShadow = true;
scene.add(obstacle);

const sourceMarker = new THREE.Mesh(
  new THREE.TorusGeometry(1.1, 0.08, 10, 48),
  new THREE.MeshBasicMaterial({ color: 0x9befff, transparent: true, opacity: 0.75 }),
);
sourceMarker.rotation.x = Math.PI / 2;
sourceMarker.position.set(sourceWorld.x, terrainHeight(sourceWorld.x, sourceWorld.z) + 0.35, sourceWorld.z);
scene.add(sourceMarker);

scene.add(new THREE.HemisphereLight(0xd7f2f4, 0x57351f, 2.1));
const sun = new THREE.DirectionalLight(0xffe3bd, 3.4);
sun.position.set(-18, 31, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -32;
sun.shadow.camera.right = 32;
sun.shadow.camera.top = 32;
sun.shadow.camera.bottom = -32;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 90;
scene.add(sun);

const camera = new THREE.PerspectiveCamera(47, 1, 0.1, 180);
camera.position.set(28, 28, -30);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.7, 1.5);
controls.enableDamping = true;
controls.minDistance = 13;
controls.maxDistance = 90;
controls.maxPolarAngle = Math.PI * 0.48;

function updateWaterMesh() {
  const positions = waterGeometry.getAttribute("position");
  let wetCells = 0;
  let maximumSpeed = 0;
  for (let index = 0; index < water.depth.length; index++) {
    const depth = water.depth[index];
    const speed = Math.hypot(water.velocityX[index], water.velocityY[index]);
    positions.setY(index, water.bed[index] + Math.max(depth, 0.001) + 0.035);
    waterDepthAttribute.setX(index, depth);
    waterFoamAttribute.setX(index, water.foam[index]);
    waterSpeedAttribute.setX(index, speed);
    if (depth > water.minDepth) wetCells++;
    maximumSpeed = Math.max(maximumSpeed, speed);
  }
  let indexCount = 0;
  for (let y = 0; y < GRID_SIZE - 1; y++) {
    for (let x = 0; x < GRID_SIZE - 1; x++) {
      const a = y * GRID_SIZE + x;
      const b = a + 1;
      const c = a + GRID_SIZE;
      const d = c + 1;
      if (water.depth[a] > water.minDepth && water.depth[c] > water.minDepth && water.depth[b] > water.minDepth) {
        waterIndices[indexCount++] = a;
        waterIndices[indexCount++] = c;
        waterIndices[indexCount++] = b;
      }
      if (water.depth[b] > water.minDepth && water.depth[c] > water.minDepth && water.depth[d] > water.minDepth) {
        waterIndices[indexCount++] = b;
        waterIndices[indexCount++] = c;
        waterIndices[indexCount++] = d;
      }
    }
  }
  waterGeometry.index.needsUpdate = true;
  waterGeometry.setDrawRange(0, indexCount);
  positions.needsUpdate = true;
  waterDepthAttribute.needsUpdate = true;
  waterFoamAttribute.needsUpdate = true;
  waterSpeedAttribute.needsUpdate = true;
  waterGeometry.computeVertexNormals();
  waterGeometry.getAttribute("normal").needsUpdate = true;
  return { wetCells, maximumSpeed };
}

const params = { speed: 1, sourceRate: 0.65, running: true, injecting: true };
function bindRange(id, apply, format) {
  const input = document.getElementById(id);
  const output = document.getElementById(`${id}v`);
  const update = () => {
    const value = Number(input.value);
    apply(value);
    output.textContent = format(value);
  };
  input.addEventListener("input", update);
  update();
}
bindRange("speed", (value) => { params.speed = value; }, (value) => `${value.toFixed(1)}×`);
bindRange("sourceRate", (value) => { params.sourceRate = value; source.rate = value; }, (value) => value.toFixed(2));
bindRange("gravity", (value) => { water.gravity = value; }, (value) => value.toFixed(1));
bindRange("friction", (value) => { water.friction = value; }, (value) => value.toFixed(2));
document.getElementById("mode").addEventListener("change", (event) => {
  waterMaterial.uniforms.uMode.value = Number(event.target.value);
});
document.getElementById("pause").addEventListener("click", (event) => {
  params.running = !params.running;
  event.currentTarget.textContent = params.running ? "暂停" : "继续";
  event.currentTarget.classList.toggle("on", !params.running);
});
document.getElementById("inject").addEventListener("click", (event) => {
  params.injecting = !params.injecting;
  event.currentTarget.classList.toggle("on", params.injecting);
});
document.getElementById("reset").addEventListener("click", () => {
  resetSimulation();
  updateWaterMesh();
});

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDown = null;
canvas.addEventListener("pointerdown", (event) => {
  pointerDown = { x: event.clientX, y: event.clientY };
});
canvas.addEventListener("pointerup", (event) => {
  if (!pointerDown || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 4) return;
  const rect = canvas.getBoundingClientRect();
  pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(terrainMesh, false)[0];
  if (!hit) return;
  const grid = worldToGrid(hit.point.x, hit.point.z);
  water.inject({ x: grid.x, y: grid.y, radius: 4.5, rate: 5.5 }, 0.32);
  updateWaterMesh();
});

let meshStats = updateWaterMesh();
let previousTime = performance.now();
let accumulator = 0;
let statsTimer = 0;
let frameCounter = 0;
let fps = 0;
const fixedDelta = 1 / 90;

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

function frame(time) {
  resize();
  controls.update();
  const frameDelta = Math.min((time - previousTime) / 1000, 0.05);
  previousTime = time;
  if (params.running) {
    accumulator += frameDelta * params.speed;
    let steps = 0;
    while (accumulator >= fixedDelta && steps < 6) {
      water.step(fixedDelta, params.injecting && source.rate > 0 ? [source] : []);
      accumulator -= fixedDelta;
      steps++;
    }
    if (steps > 0) meshStats = updateWaterMesh();
  }
  sourceMarker.material.opacity = params.injecting ? 0.55 + Math.sin(time * 0.006) * 0.2 : 0.18;
  renderer.render(scene, camera);

  frameCounter++;
  if (time - statsTimer > 500) {
    fps = Math.round(frameCounter * 1000 / Math.max(time - statsTimer, 1));
    frameCounter = 0;
    statsTimer = time;
    document.getElementById("stats").textContent =
      `水量 ${water.totalVolume().toFixed(1)} m³ · 最大水深 ${water.maxWaterDepth().toFixed(2)} m · ` +
      `最大流速 ${meshStats.maximumSpeed.toFixed(2)} m/s · 湿网格 ${meshStats.wetCells.toLocaleString()} · ${fps} FPS`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__meshovaShallowWater = {
  water,
  reset: resetSimulation,
  pause: () => { params.running = false; },
  resume: () => { params.running = true; },
  injectAtWorld: (x, z, amount = 1) => {
    const grid = worldToGrid(x, z);
    water.inject({ x: grid.x, y: grid.y, radius: 4.5, rate: amount * 5 }, 0.25);
    updateWaterMesh();
  },
  setMode: (mode) => { waterMaterial.uniforms.uMode.value = Number(mode); },
  stats: () => ({
    volume: water.totalVolume(),
    maxDepth: water.maxWaterDepth(),
    wetCells: meshStats.wetCells,
    maxSpeed: meshStats.maximumSpeed,
    finite: water.depth.every(Number.isFinite) && water.velocityX.every(Number.isFinite) && water.velocityY.every(Number.isFinite),
  }),
};
