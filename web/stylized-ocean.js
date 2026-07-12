import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildStylizedOceanEnvironmentParts } from "/dist/index.js";

const WATER_LEVEL = -0.46;
const params = {
  waveHeight: 0.22,
  foamStrength: 0.92,
  dayHour: 13.2,
  boatSpeed: 1,
  autoDay: true,
  paused: false,
};

if (new URLSearchParams(location.search).has("clean")) document.body.classList.add("clean");

function meshGeometry(mesh) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(mesh.positions.length * 3);
  const normals = new Float32Array(mesh.normals.length * 3);
  const uvs = new Float32Array(mesh.uvs.length * 2);
  for (let index = 0; index < mesh.positions.length; index++) {
    const position = mesh.positions[index];
    const normal = mesh.normals[index];
    const uv = mesh.uvs[index];
    positions.set([position.x, position.y, position.z], index * 3);
    normals.set([normal.x, normal.y, normal.z], index * 3);
    uvs.set([uv.x, uv.y], index * 2);
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.indices), 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function colorFromPart(part) {
  return new THREE.Color(...(part.color ?? [0.8, 0.8, 0.8]));
}

function makePartMaterial(part) {
  const color = colorFromPart(part);
  const role = part.metadata?.fxRole;
  if (role === "shore-foam") {
    return new THREE.MeshBasicMaterial({ color: 0xd9fff5, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
  }
  if (role === "ocean-cloud") {
    return new THREE.MeshToonMaterial({ color: 0xf7fffb, emissive: 0x263c45, emissiveIntensity: 0.22, roughness: 0.95 });
  }
  const material = new THREE.MeshToonMaterial({ color, side: part.doubleSided ? THREE.DoubleSide : THREE.FrontSide });
  if (/leaf|grass|frond|canop/i.test(part.name)) material.color.offsetHSL(0, 0.04, 0.03);
  return material;
}

function makeWaterMaterial(islandMasks) {
  const islandData = Array.from({ length: 6 }, (_, index) => {
    const island = islandMasks[index];
    return island
      ? new THREE.Vector4(island.x, island.z, island.radiusX, island.radiusZ)
      : new THREE.Vector4(999, 999, 1, 1);
  });
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWaveHeight: { value: params.waveHeight },
      uFoam: { value: params.foamStrength },
      uDaylight: { value: 1 },
      uSunDirection: { value: new THREE.Vector3(-0.45, 0.82, 0.34).normalize() },
      uIslandCount: { value: islandMasks.length },
      uIslandData: { value: islandData },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uWaveHeight;
      varying vec3 vWorldPosition;
      varying vec3 vWaterNormal;
      varying float vWave;

      void addWave(vec2 p, vec2 direction, float frequency, float speed, float amplitude, inout float height, inout vec2 gradient) {
        float phase = dot(p, normalize(direction)) * frequency + uTime * speed;
        height += sin(phase) * amplitude;
        gradient += normalize(direction) * cos(phase) * frequency * amplitude;
      }

      void main() {
        vec3 displaced = position;
        float height = 0.0;
        vec2 gradient = vec2(0.0);
        addWave(position.xz, vec2(1.0, 0.22), 0.34, 0.75, uWaveHeight * 0.48, height, gradient);
        addWave(position.xz, vec2(-0.35, 1.0), 0.57, -1.12, uWaveHeight * 0.25, height, gradient);
        addWave(position.xz, vec2(0.72, 0.68), 0.93, 1.48, uWaveHeight * 0.17, height, gradient);
        addWave(position.xz, vec2(-0.91, 0.42), 1.64, -1.9, uWaveHeight * 0.10, height, gradient);
        displaced.y += height;
        vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWaterNormal = normalize(normalMatrix * vec3(-gradient.x, 1.0, -gradient.y));
        vWave = height / max(uWaveHeight, 0.001);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform float uFoam;
      uniform float uDaylight;
      uniform vec3 uSunDirection;
      uniform int uIslandCount;
      uniform vec4 uIslandData[6];
      varying vec3 vWorldPosition;
      varying vec3 vWaterNormal;
      varying float vWave;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise21(vec2 p) {
        vec2 cell = floor(p);
        vec2 local = fract(p);
        local = local * local * (3.0 - 2.0 * local);
        return mix(mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), local.x), mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + 1.0), local.x), local.y);
      }

      float islandDistance(vec2 point) {
        float distanceToIsland = 1000.0;
        for (int index = 0; index < 6; index++) {
          if (index >= uIslandCount) break;
          vec4 island = uIslandData[index];
          float ellipse = length((point - island.xy) / island.zw) - 1.0;
          distanceToIsland = min(distanceToIsland, ellipse * min(island.z, island.w));
        }
        return distanceToIsland;
      }

      void main() {
        vec2 point = vWorldPosition.xz;
        float shoreDistance = islandDistance(point);
        float shallow = 1.0 - smoothstep(0.0, 7.0, max(shoreDistance, 0.0));
        float detail = noise21(point * 0.32 + uTime * vec2(0.08, -0.05));
        float smallDetail = noise21(point * 1.25 - uTime * vec2(0.17, 0.12));
        vec3 nightDeep = vec3(0.01, 0.075, 0.15);
        vec3 dayDeep = vec3(0.012, 0.34, 0.52);
        vec3 nightShallow = vec3(0.025, 0.28, 0.38);
        vec3 dayShallow = vec3(0.16, 0.88, 0.78);
        vec3 deepColor = mix(nightDeep, dayDeep, uDaylight);
        vec3 shallowColor = mix(nightShallow, dayShallow, uDaylight);
        vec3 waterColor = mix(deepColor, shallowColor, shallow * 0.88 + detail * 0.06);
        vec3 normal = normalize(vWaterNormal);
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.5);
        vec3 skyTint = mix(vec3(0.03, 0.11, 0.24), vec3(0.42, 0.86, 0.94), uDaylight);
        waterColor = mix(waterColor, skyTint, fresnel * 0.56);
        float crest = smoothstep(0.66, 0.91, vWave + detail * 0.18) * smoothstep(0.68, 0.88, smallDetail);
        float shorePulse = sin(shoreDistance * 4.2 - uTime * 2.4 + detail * 5.0) * 0.5 + 0.5;
        float shoreMask = (1.0 - smoothstep(0.0, 0.92, max(shoreDistance, 0.0))) * smoothstep(-0.25, 0.04, shoreDistance);
        float shoreFoam = shoreMask * mix(0.24, 0.82, smoothstep(0.42, 0.76, shorePulse + smallDetail * 0.22));
        float caustic = shallow * smoothstep(0.78, 0.96, sin((point.x + point.y) * 2.1 + detail * 7.0 - uTime) * 0.5 + 0.5) * 0.09;
        float foam = clamp((crest * 0.36 + shoreFoam + caustic) * uFoam, 0.0, 1.0);
        waterColor = mix(waterColor, vec3(0.83, 1.0, 0.96), foam);
        vec3 halfVector = normalize(uSunDirection + viewDirection);
        float sparkle = pow(max(dot(normal, halfVector), 0.0), 240.0) * smoothstep(0.965, 0.998, hash21(floor(point * 4.0) + floor(uTime * 8.0)));
        waterColor += sparkle * mix(vec3(0.3, 0.55, 0.8), vec3(1.0, 0.94, 0.72), uDaylight) * 1.1;
        waterColor *= 0.84 + uDaylight * 0.25;
        gl_FragColor = vec4(waterColor, 1.0);
      }
    `,
  });
}

const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.16;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x69cbd3);
scene.fog = new THREE.FogExp2(0x69cbd3, 0.0065);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 240);
camera.position.set(35, 55, 47);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, -0.2, 0);
controls.enableDamping = true;
controls.minDistance = 24;
controls.maxDistance = 110;
controls.minPolarAngle = 0.12;
controls.maxPolarAngle = Math.PI * 0.48;

const hemisphere = new THREE.HemisphereLight(0xc9ffff, 0x17354d, 2.25);
scene.add(hemisphere);
const sun = new THREE.DirectionalLight(0xffe4ad, 4.3);
sun.position.set(-38, 58, 24);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -52;
sun.shadow.camera.right = 52;
sun.shadow.camera.top = 45;
sun.shadow.camera.bottom = -45;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 150;
sun.shadow.bias = -0.0003;
scene.add(sun);

const parts = buildStylizedOceanEnvironmentParts();
const boatRoot = new THREE.Group();
const fishRoots = [];
const cloudMeshes = [];
const shoreMeshes = [];
let waterMesh;
let waterMaterial;
let totalTriangles = 0;

for (const part of parts) {
  const geometry = meshGeometry(part.mesh);
  totalTriangles += part.mesh.indices.length / 3;
  const role = part.metadata?.fxRole;
  if (part.name === "stylized_ocean_surface") {
    waterMaterial = makeWaterMaterial(part.metadata?.islandMasks ?? []);
    waterMesh = new THREE.Mesh(geometry, waterMaterial);
    waterMesh.scale.set(2, 1, 2);
    waterMesh.renderOrder = -1;
    scene.add(waterMesh);
    continue;
  }
  const mesh = new THREE.Mesh(geometry, makePartMaterial(part));
  mesh.name = part.name;
  mesh.userData.part = part;
  if (part.name === "stylized_ocean_floor") mesh.scale.set(2, 1, 2);
  mesh.castShadow = role !== "shore-foam" && part.name !== "stylized_ocean_floor";
  mesh.receiveShadow = role !== "ocean-cloud";
  if (role === "ocean-boat") {
    boatRoot.add(mesh);
  } else if (role === "ocean-fish") {
    const root = new THREE.Group();
    root.userData.index = Number(part.metadata?.index ?? fishRoots.length);
    root.add(mesh);
    fishRoots.push(root);
    scene.add(root);
  } else {
    scene.add(mesh);
    if (role === "ocean-cloud") cloudMeshes.push(mesh);
    if (role === "shore-foam") shoreMeshes.push(mesh);
  }
}
scene.add(boatRoot);

const wakeGeometryLeft = new THREE.BufferGeometry();
const wakeGeometryRight = new THREE.BufferGeometry();
const wakeGeometryCenter = new THREE.BufferGeometry();
const wakeMaterial = new THREE.LineBasicMaterial({ color: 0xc9fff8, transparent: true, opacity: 0.78, depthWrite: false });
const wakeCenterMaterial = new THREE.PointsMaterial({ color: 0xeafffb, size: 0.22, transparent: true, opacity: 0.48, depthWrite: false, sizeAttenuation: true });
const wakeLeft = new THREE.Line(wakeGeometryLeft, wakeMaterial);
const wakeRight = new THREE.Line(wakeGeometryRight, wakeMaterial.clone());
const wakeCenter = new THREE.Points(wakeGeometryCenter, wakeCenterMaterial);
wakeLeft.renderOrder = wakeRight.renderOrder = wakeCenter.renderOrder = 4;
scene.add(wakeLeft, wakeRight, wakeCenter);
const wakeHistory = [];

const splashFx = fishRoots.map(() => {
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xd8fff7, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 48), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 5;
  const dropsMaterial = new THREE.PointsMaterial({ color: 0xeafffb, size: 0.13, transparent: true, opacity: 0, depthWrite: false });
  const drops = new THREE.Points(new THREE.BufferGeometry(), dropsMaterial);
  drops.renderOrder = 5;
  scene.add(ring, drops);
  return { ring, drops };
});

let randomState = 872341;
function seededRandom() {
  randomState = (randomState * 1664525 + 1013904223) >>> 0;
  return randomState / 4294967296;
}

const starPositions = new Float32Array(900 * 3);
for (let index = 0; index < 900; index++) {
  const angle = seededRandom() * Math.PI * 2;
  const height = seededRandom() * 70 + 18;
  const radius = seededRandom() * 95 + 45;
  starPositions.set([Math.cos(angle) * radius, height, Math.sin(angle) * radius], index * 3);
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
const starMaterial = new THREE.PointsMaterial({ color: 0xd8eeff, size: 0.3, transparent: true, opacity: 0, depthWrite: false });
const stars = new THREE.Points(starGeometry, starMaterial);
scene.add(stars);

function bindRange(id, key, format) {
  const input = document.getElementById(id);
  const output = document.getElementById(`${id}V`);
  const update = () => {
    params[key] = Number(input.value);
    output.textContent = format(params[key]);
    if (key === "waveHeight") waterMaterial.uniforms.uWaveHeight.value = params[key];
    if (key === "foamStrength") waterMaterial.uniforms.uFoam.value = params[key];
  };
  input.addEventListener("input", update);
  update();
}

bindRange("waveHeight", "waveHeight", (value) => value.toFixed(2));
bindRange("foamStrength", "foamStrength", (value) => value.toFixed(2));
bindRange("dayHour", "dayHour", (value) => `${value.toFixed(1)} 时`);
bindRange("boatSpeed", "boatSpeed", (value) => `${value.toFixed(2)}×`);

document.getElementById("autoDay").addEventListener("click", (event) => {
  params.autoDay = !params.autoDay;
  event.currentTarget.classList.toggle("on", params.autoDay);
});
document.getElementById("pause").addEventListener("click", (event) => {
  params.paused = !params.paused;
  event.currentTarget.textContent = params.paused ? "继续动态" : "暂停动态";
  event.currentTarget.classList.toggle("on", params.paused);
});

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function setDayNight(hour) {
  const solar = Math.sin((hour - 6) / 24 * Math.PI * 2);
  const daylight = clamp01((solar + 0.12) / 1.12);
  const dawn = Math.exp(-Math.pow((hour - 6.3) / 1.55, 2)) + Math.exp(-Math.pow((hour - 18.2) / 1.65, 2));
  const night = new THREE.Color(0x06162d);
  const day = new THREE.Color(0x61cad1);
  const sunset = new THREE.Color(0xe58f77);
  const sky = night.clone().lerp(day, daylight).lerp(sunset, Math.min(0.48, dawn * 0.34));
  scene.background.copy(sky);
  scene.fog.color.copy(sky);
  hemisphere.intensity = 0.72 + daylight * 1.85;
  hemisphere.color.set(daylight > 0.2 ? 0xc9ffff : 0x46668f);
  sun.intensity = 0.08 + daylight * 4.2;
  sun.color.set(dawn > 0.35 ? 0xffad78 : 0xffe6b7);
  const angle = (hour - 6) / 24 * Math.PI * 2;
  sun.position.set(Math.cos(angle) * 62, Math.max(5, Math.sin(angle) * 70), 28);
  waterMaterial.uniforms.uDaylight.value = daylight;
  waterMaterial.uniforms.uSunDirection.value.copy(sun.position).normalize();
  starMaterial.opacity = Math.pow(1 - daylight, 2) * 0.92;
  renderer.toneMappingExposure = 0.88 + daylight * 0.3;
  return daylight;
}

function updateWake(position, forward, time) {
  if (wakeHistory.length === 0 || wakeHistory[wakeHistory.length - 1].position.distanceToSquared(position) > 0.055) {
    wakeHistory.push({ position: position.clone(), forward: forward.clone() });
    if (wakeHistory.length > 92) wakeHistory.shift();
  }
  const left = new Float32Array(wakeHistory.length * 3);
  const right = new Float32Array(wakeHistory.length * 3);
  const center = new Float32Array(wakeHistory.length * 3);
  for (let index = 0; index < wakeHistory.length; index++) {
    const sample = wakeHistory[index];
    const age = wakeHistory.length - 1 - index;
    const side = new THREE.Vector3(-sample.forward.z, 0, sample.forward.x);
    const width = 0.34 + age * 0.027;
    const pulse = Math.sin(time * 3.2 + index * 0.72) * 0.08;
    const y = WATER_LEVEL + 0.07 + pulse * 0.08;
    left.set([sample.position.x + side.x * width, y, sample.position.z + side.z * width], index * 3);
    right.set([sample.position.x - side.x * width, y, sample.position.z - side.z * width], index * 3);
    center.set([sample.position.x, y + 0.015, sample.position.z], index * 3);
  }
  wakeGeometryLeft.setAttribute("position", new THREE.BufferAttribute(left, 3));
  wakeGeometryRight.setAttribute("position", new THREE.BufferAttribute(right, 3));
  wakeGeometryCenter.setAttribute("position", new THREE.BufferAttribute(center, 3));
}

function updateBoat(time) {
  const travel = time * params.boatSpeed;
  const x = Math.sin(travel * 0.18) * 14.5;
  const z = Math.cos(travel * 0.14) * 9.5 + 1.5;
  const dx = Math.cos(travel * 0.18) * 14.5 * 0.18;
  const dz = -Math.sin(travel * 0.14) * 9.5 * 0.14;
  const forward = new THREE.Vector3(dx, 0, dz).normalize();
  boatRoot.position.set(x, WATER_LEVEL + 0.44 + Math.sin(time * 1.8) * params.waveHeight * 0.22, z);
  boatRoot.rotation.y = Math.atan2(forward.x, forward.z);
  boatRoot.rotation.z = Math.sin(time * 1.33) * 0.035;
  updateWake(boatRoot.position, forward, time);
}

function updateFish(time) {
  for (let index = 0; index < fishRoots.length; index++) {
    const root = fishRoots[index];
    const phase = (time * (0.085 + index * 0.008) + index * 0.29) % 1;
    const angle = index * 2.15 + time * 0.045;
    const radius = 7.5 + index * 4.2;
    const x = Math.cos(angle) * radius + 4;
    const z = Math.sin(angle) * radius - 5;
    const jump = Math.max(0, Math.sin(phase * Math.PI) * 3.3 - 0.36);
    root.position.set(x + (phase - 0.5) * 4.2, WATER_LEVEL + jump, z + (phase - 0.5) * 2.1);
    root.rotation.set(Math.cos(phase * Math.PI) * 0.8, -angle + Math.PI * 0.5, Math.sin(phase * Math.PI * 2) * 0.18);
    root.visible = phase < 0.82;
    const fx = splashFx[index];
    const impact = Math.min(phase, 1 - phase) / 0.13;
    const strength = clamp01(1 - impact);
    fx.ring.position.set(root.position.x, WATER_LEVEL + 0.08, root.position.z);
    fx.ring.scale.setScalar(0.8 + (1 - strength) * 2.4);
    fx.ring.material.opacity = strength * 0.8;
    const droplets = new Float32Array(18 * 3);
    for (let drop = 0; drop < 18; drop++) {
      const dropAngle = drop / 18 * Math.PI * 2 + index;
      const spread = (1 - strength) * (0.8 + (drop % 5) * 0.1);
      droplets.set([
        root.position.x + Math.cos(dropAngle) * spread,
        WATER_LEVEL + 0.14 + Math.sin(dropAngle * 2.7) * 0.12 + strength * 0.45,
        root.position.z + Math.sin(dropAngle) * spread,
      ], drop * 3);
    }
    fx.drops.geometry.setAttribute("position", new THREE.BufferAttribute(droplets, 3));
    fx.drops.material.opacity = strength * 0.85;
  }
}

function updateClouds(time) {
  for (let index = 0; index < cloudMeshes.length; index++) {
    const cloud = cloudMeshes[index];
    const drift = Number(cloud.userData.part?.metadata?.drift ?? 0.5);
    cloud.position.x = ((time * drift + index * 31 + 50) % 104) - 52;
    cloud.position.z = Math.sin(time * 0.035 + index) * 1.2;
    cloud.material.emissiveIntensity = 0.1 + (1 - waterMaterial.uniforms.uDaylight.value) * 0.38;
  }
  for (let index = 0; index < shoreMeshes.length; index++) {
    shoreMeshes[index].material.opacity = 0.42 + Math.sin(time * 2.2 + index * 1.7) * 0.09;
  }
}

function resize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const pixelRatio = renderer.getPixelRatio();
  if (canvas.width === Math.round(width * pixelRatio) && canvas.height === Math.round(height * pixelRatio)) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

let previousTime = performance.now();
let elapsed = 0;
let fxTimeOverride = null;
let frames = 0;
let fps = 0;
let fpsClock = performance.now();
let daylight = 1;

function renderFrame(now) {
  resize();
  controls.update();
  const delta = Math.min((now - previousTime) / 1000, 0.05);
  previousTime = now;
  if (!params.paused && fxTimeOverride === null) elapsed += delta;
  const fxTime = fxTimeOverride ?? elapsed;
  if (params.autoDay && !params.paused && fxTimeOverride === null) {
    params.dayHour = (13.2 + fxTime * 0.18) % 24;
    document.getElementById("dayHour").value = String(params.dayHour);
    document.getElementById("dayHourV").textContent = `${params.dayHour.toFixed(1)} 时`;
  }
  daylight = setDayNight(params.dayHour);
  waterMaterial.uniforms.uTime.value = fxTime;
  updateBoat(fxTime);
  updateFish(fxTime);
  updateClouds(fxTime);
  renderer.render(scene, camera);
  frames++;
  if (now - fpsClock > 600) {
    fps = Math.round(frames * 1000 / (now - fpsClock));
    frames = 0;
    fpsClock = now;
    document.getElementById("stats").textContent = `${parts.length} 部件 · ${Math.round(totalTriangles).toLocaleString()} 三角形 · ${fps} FPS · 日光 ${Math.round(daylight * 100)}%`;
  }
  requestAnimationFrame(renderFrame);
}

window.__meshovaOcean = {
  ready: true,
  setTimeOfDay(hour) {
    params.autoDay = false;
    params.dayHour = ((Number(hour) % 24) + 24) % 24;
    document.getElementById("dayHour").value = String(params.dayHour);
  },
  setFxTime(time) {
    fxTimeOverride = Number.isFinite(Number(time)) ? Number(time) : null;
  },
  setPaused(value) {
    params.paused = Boolean(value);
  },
  stats() {
    return { parts: parts.length, triangles: totalTriangles, fps, daylight, waterFinite: Number.isFinite(waterMaterial.uniforms.uTime.value) };
  },
};

requestAnimationFrame(renderFrame);
