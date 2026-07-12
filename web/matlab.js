/**
 * Material lab: preview any Meshova procedural material (SBS reproductions,
 * presets, builders) on a choice of primitive shapes. Everything is baked live
 * from /dist via materials.js — no static bitmaps.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  bakeMaterial,
  BILIBILI_MATERIAL_NAMES,
  BILIBILI_MATERIAL_DEFINITIONS,
  BILIBILI_MATERIAL_PARAM_SCHEMA,
  defaultBilibiliMaterialParams,
  URBAN_MATERIAL_NAMES,
  URBAN_MATERIAL_DEFINITIONS,
  URBAN_MATERIAL_PARAM_SCHEMA,
  defaultUrbanMaterialParams,
  ADVANCED_MATERIAL_NAMES,
  ADVANCED_MATERIAL_DEFINITIONS,
  ADVANCED_MATERIAL_PARAM_SCHEMA,
  defaultAdvancedMaterialParams,
  THIRD_BATCH_MATERIAL_NAMES,
  THIRD_BATCH_MATERIAL_DEFINITIONS,
  THIRD_BATCH_MATERIAL_PARAM_SCHEMA,
  defaultThirdBatchMaterialParams,
  FOURTH_BATCH_MATERIAL_NAMES,
  FOURTH_BATCH_MATERIAL_DEFINITIONS,
  FOURTH_BATCH_MATERIAL_PARAM_SCHEMA,
  defaultFourthBatchMaterialParams,
  FIFTH_BATCH_MATERIAL_NAMES,
  FIFTH_BATCH_MATERIAL_DEFINITIONS,
  FIFTH_BATCH_MATERIAL_PARAM_SCHEMA,
  defaultFifthBatchMaterialParams,
  SIXTH_BATCH_MATERIAL_NAMES,
  SIXTH_BATCH_MATERIAL_DEFINITIONS,
  SIXTH_BATCH_MATERIAL_PARAM_SCHEMA,
  defaultSixthBatchMaterialParams,
  SEVENTH_BATCH_MATERIAL_NAMES,
  SEVENTH_BATCH_MATERIAL_DEFINITIONS,
  SEVENTH_BATCH_MATERIAL_PARAM_SCHEMA,
  defaultSeventhBatchMaterialParams,
  EIGHTH_BATCH_MATERIAL_NAMES,
  EIGHTH_BATCH_MATERIAL_DEFINITIONS,
  EIGHTH_BATCH_MATERIAL_PARAM_SCHEMA,
  defaultEighthBatchMaterialParams,
  NINTH_BATCH_MATERIAL_NAMES,
  NINTH_BATCH_MATERIAL_DEFINITIONS,
  NINTH_BATCH_MATERIAL_PARAM_SCHEMA,
  defaultNinthBatchMaterialParams,
  SBS_REPRO_NAMES,
  SBS_PARAM_SCHEMA,
  defaultSbsParams,
  PRESET_NAMES,
  BUILDER_NAMES,
  PRESET_PARAM_SCHEMA,
  defaultMatParams,
  MATERIAL_USE_CATEGORIES,
  materialUseCategory,
} from "/web/materials.js?v=realtime8";

const CATEGORIES = MATERIAL_USE_CATEGORIES;
const DEFAULT_SHAPE = "cube";
const DEFAULT_MAT = "Stylized_01_Bricks";
const DEFAULT_CAT = materialUseCategory(DEFAULT_MAT).id;

// --- three.js scene ----------------------------------------------------------
const canvas = document.getElementById("canvas");
// alpha:true 让 three 背景透明，透出 stage 的浅色展台。
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
// 背景交给 CSS 展台；渐变天空仍作为 IBL 环境驱动反射。
scene.background = null;

const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
camera.position.set(2.1, 1.35, 2.55);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.04, 0);

// procedural gradient-sky IBL so metal/rough reflect honestly (no external HDR)
function makeEnv() {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const sky = new THREE.Scene();
  const geo = new THREE.SphereGeometry(50, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { top: { value: new THREE.Color(0xd8ecff) }, bot: { value: new THREE.Color(0x98a5b0) } },
    vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 bot;
      void main(){ float t=clamp(normalize(vP).y*0.5+0.5,0.0,1.0); gl_FragColor=vec4(mix(bot,top,t),1.0);} `,
  });
  sky.add(new THREE.Mesh(geo, mat));
  const rt = pmrem.fromScene(sky);
  pmrem.dispose();
  return rt.texture;
}
scene.environment = makeEnv();

const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(3, 4, 5);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.bias = -0.0005;
scene.add(key);
scene.add(new THREE.HemisphereLight(0xd8ecff, 0x58616b, 0.55));
scene.add(new THREE.AmbientLight(0xffffff, 0.16));
const grid = new THREE.GridHelper(7, 28, 0xe8edf3, 0xd6dde6);
grid.material.transparent = true;
grid.material.opacity = 0.86;
scene.add(grid);
const shadowFloor = new THREE.Mesh(
  new THREE.PlaneGeometry(8, 8),
  new THREE.ShadowMaterial({ opacity: 0.18 }),
);
shadowFloor.rotation.x = -Math.PI / 2;
shadowFloor.receiveShadow = true;
scene.add(shadowFloor);

// --- shapes ------------------------------------------------------------------
function makeShapes() {
  const s = {};
  s.sphere = new THREE.SphereGeometry(1, 96, 64);
  s.cube = new THREE.BoxGeometry(1.5, 1.5, 1.5, 4, 4, 4);
  s.plane = new THREE.PlaneGeometry(2, 2, 8, 8);
  s.cylinder = new THREE.CylinderGeometry(0.8, 0.8, 1.8, 96, 4);
  // aoMap/normal need a 2nd uv set (three uses uv2 for aoMap on r150-, uv on newer)
  for (const g of Object.values(s)) g.setAttribute("uv2", g.getAttribute("uv"));
  return s;
}
const SHAPES = makeShapes();
const SHAPE_LABELS = { sphere: "球", cube: "立方", plane: "平面", cylinder: "圆柱" };

let mesh = new THREE.Mesh(SHAPES[DEFAULT_SHAPE], new THREE.MeshStandardMaterial());
mesh.castShadow = true;
mesh.receiveShadow = true;
scene.add(mesh);

// --- state -------------------------------------------------------------------
let currentShape = DEFAULT_SHAPE;
let currentCat = DEFAULT_CAT;
let currentMat = DEFAULT_MAT;
let currentParams = {};

const shapeRow = document.getElementById("shape-row");
const catRow = document.getElementById("cat-row");
const matSelect = document.getElementById("mat-select");
const paramPanel = document.getElementById("param-panel");
const foot = document.getElementById("foot");
const loading = document.getElementById("loading");
const loadingTitle = document.getElementById("loading-title");
const loadingDetail = document.getElementById("loading-detail");
const MATERIAL_PARAM_LOADING_THRESHOLD_MS = 3000;
const materialTimingMs = new Map();
let activeLoadingToken = 0;
let loadingTimer = 0;

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function showMaterialLoading(title, detail) {
  const token = ++activeLoadingToken;
  clearInterval(loadingTimer);
  if (loadingTitle) loadingTitle.textContent = title;
  if (loadingDetail) loadingDetail.textContent = detail;
  loading?.classList.add("show");
  loading?.setAttribute("aria-hidden", "false");
  const startedAt = performance.now();
  loadingTimer = setInterval(() => {
    if (token !== activeLoadingToken || !loadingDetail) return;
    const seconds = Math.max(1, Math.floor((performance.now() - startedAt) / 1000));
    loadingDetail.textContent = `${detail} · 已等待 ${seconds} 秒`;
  }, 1000);
  await nextPaint();
  return token;
}

function hideMaterialLoading(token) {
  if (token !== activeLoadingToken) return;
  clearInterval(loadingTimer);
  loading?.classList.remove("show");
  loading?.setAttribute("aria-hidden", "true");
}

function schemaFor(name) {
  if (NINTH_BATCH_MATERIAL_NAMES.includes(name)) return NINTH_BATCH_MATERIAL_PARAM_SCHEMA[name];
  if (EIGHTH_BATCH_MATERIAL_NAMES.includes(name)) return EIGHTH_BATCH_MATERIAL_PARAM_SCHEMA[name];
  if (SEVENTH_BATCH_MATERIAL_NAMES.includes(name)) return SEVENTH_BATCH_MATERIAL_PARAM_SCHEMA[name];
  if (SIXTH_BATCH_MATERIAL_NAMES.includes(name)) return SIXTH_BATCH_MATERIAL_PARAM_SCHEMA[name];
  if (FIFTH_BATCH_MATERIAL_NAMES.includes(name)) return FIFTH_BATCH_MATERIAL_PARAM_SCHEMA[name];
  if (FOURTH_BATCH_MATERIAL_NAMES.includes(name)) return FOURTH_BATCH_MATERIAL_PARAM_SCHEMA[name];
  if (THIRD_BATCH_MATERIAL_NAMES.includes(name)) return THIRD_BATCH_MATERIAL_PARAM_SCHEMA[name];
  if (ADVANCED_MATERIAL_NAMES.includes(name)) return ADVANCED_MATERIAL_PARAM_SCHEMA[name];
  if (URBAN_MATERIAL_NAMES.includes(name)) return URBAN_MATERIAL_PARAM_SCHEMA[name];
  if (BILIBILI_MATERIAL_NAMES.includes(name)) return BILIBILI_MATERIAL_PARAM_SCHEMA[name];
  if (SBS_REPRO_NAMES.includes(name)) return SBS_PARAM_SCHEMA[name];
  return PRESET_PARAM_SCHEMA[name] ?? null;
}
function defaultParams(name) {
  if (NINTH_BATCH_MATERIAL_NAMES.includes(name)) return defaultNinthBatchMaterialParams(name);
  if (EIGHTH_BATCH_MATERIAL_NAMES.includes(name)) return defaultEighthBatchMaterialParams(name);
  if (SEVENTH_BATCH_MATERIAL_NAMES.includes(name)) return defaultSeventhBatchMaterialParams(name);
  if (SIXTH_BATCH_MATERIAL_NAMES.includes(name)) return defaultSixthBatchMaterialParams(name);
  if (FIFTH_BATCH_MATERIAL_NAMES.includes(name)) return defaultFifthBatchMaterialParams(name);
  if (FOURTH_BATCH_MATERIAL_NAMES.includes(name)) return defaultFourthBatchMaterialParams(name);
  if (THIRD_BATCH_MATERIAL_NAMES.includes(name)) return defaultThirdBatchMaterialParams(name);
  if (ADVANCED_MATERIAL_NAMES.includes(name)) return defaultAdvancedMaterialParams(name);
  if (URBAN_MATERIAL_NAMES.includes(name)) return defaultUrbanMaterialParams(name);
  if (BILIBILI_MATERIAL_NAMES.includes(name)) return defaultBilibiliMaterialParams(name);
  if (SBS_REPRO_NAMES.includes(name)) return defaultSbsParams(name);
  return defaultMatParams(name);
}

function rebuildMaterial() {
  const materialName = currentMat;
  const startedAt = performance.now();
  const size = 512;
  const old = mesh.material;
  mesh.material = bakeMaterial(currentMat, size, { ...currentParams });
  if (old && old.dispose) {
    for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap", "alphaMap", "transmissionMap", "anisotropyMap", "clearcoatMap", "clearcoatRoughnessMap", "sheenColorMap", "thicknessMap", "iridescenceMap", "iridescenceThicknessMap"]) {
      if (old[k] && old[k].dispose) old[k].dispose();
    }
    old.dispose();
  }
  foot.textContent = `当前: ${currentMat} · 512×512 · 程序化烘焙`;
  materialTimingMs.set(materialName, performance.now() - startedAt);
}

async function rebuildMaterialWithLoading(title, detail) {
  const token = await showMaterialLoading(title, detail);
  try {
    rebuildMaterial();
  } finally {
    hideMaterialLoading(token);
  }
}

function rebuildAfterParamChange() {
  if ((materialTimingMs.get(currentMat) ?? 0) > MATERIAL_PARAM_LOADING_THRESHOLD_MS) {
    return rebuildMaterialWithLoading("修改材质参数", `重新计算 ${currentMat} · 512×512 PBR 贴图`);
  }
  rebuildMaterial();
  return Promise.resolve();
}

function setShape(id) {
  currentShape = id;
  mesh.geometry = SHAPES[id];
  const floorY = { sphere: -1, cube: -0.75, plane: -1, cylinder: -0.9 }[id] ?? -1;
  grid.position.y = floorY;
  shadowFloor.position.y = floorY - 0.002;
  for (const b of shapeRow.children) b.classList.toggle("active", b.dataset.id === id);
}

function populateMatSelect() {
  const cat = CATEGORIES.find((c) => c.id === currentCat);
  matSelect.innerHTML = "";
  for (const n of cat.names) {
    const o = document.createElement("option");
    o.value = n;
    o.textContent = NINTH_BATCH_MATERIAL_DEFINITIONS[n]?.label ?? EIGHTH_BATCH_MATERIAL_DEFINITIONS[n]?.label ?? SEVENTH_BATCH_MATERIAL_DEFINITIONS[n]?.label ?? SIXTH_BATCH_MATERIAL_DEFINITIONS[n]?.label ?? FIFTH_BATCH_MATERIAL_DEFINITIONS[n]?.label ?? FOURTH_BATCH_MATERIAL_DEFINITIONS[n]?.label ?? THIRD_BATCH_MATERIAL_DEFINITIONS[n]?.label ?? ADVANCED_MATERIAL_DEFINITIONS[n]?.label ?? URBAN_MATERIAL_DEFINITIONS[n]?.label ?? BILIBILI_MATERIAL_DEFINITIONS[n]?.label ?? n;
    matSelect.appendChild(o);
  }
  currentMat = cat.names.includes(currentMat) ? currentMat : cat.names[0];
  matSelect.value = currentMat;
}

function buildParamPanel() {
  paramPanel.innerHTML = "";
  const sc = schemaFor(currentMat);
  if (!sc) {
    const p = document.createElement("div");
    p.style.cssText = "font-size:12px;color:var(--muted);";
    p.textContent = "该材质使用默认参数。";
    paramPanel.appendChild(p);
    return;
  }
  for (const spec of sc) {
    const lab = document.createElement("label");
    lab.className = "field";
    const head = document.createElement("span");
    const valSpan = document.createElement("span");
    valSpan.className = "val";
    valSpan.textContent = String(currentParams[spec.key]);
    head.textContent = spec.label + " ";
    head.appendChild(valSpan);
    const input = document.createElement("input");
    if (spec.type === "rgb") {
      input.type = "color";
      input.value = "#" + currentParams[spec.key].map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0")).join("");
      valSpan.textContent = input.value;
    } else {
      input.type = "range";
      input.min = spec.min; input.max = spec.max; input.step = spec.step;
      input.value = currentParams[spec.key];
    }
    let raf = 0;
    input.addEventListener("input", () => {
      currentParams[spec.key] = spec.type === "rgb"
        ? [1, 3, 5].map((offset) => parseInt(input.value.slice(offset, offset + 2), 16) / 255)
        : parseFloat(input.value);
      valSpan.textContent = spec.type === "rgb" ? input.value : String(currentParams[spec.key]);
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(rebuildAfterParamChange);
    });
    lab.appendChild(head);
    lab.appendChild(input);
    paramPanel.appendChild(lab);
  }
}

async function selectMaterial(name) {
  currentMat = name;
  currentParams = defaultParams(name);
  buildParamPanel();
  await rebuildMaterialWithLoading("生成程序化材质", `计算 ${name} · 512×512 PBR 贴图`);
}

// build shape buttons
for (const [id, label] of Object.entries(SHAPE_LABELS)) {
  const b = document.createElement("button");
  b.className = "chip";
  b.dataset.id = id;
  b.textContent = label;
  b.addEventListener("click", () => setShape(id));
  shapeRow.appendChild(b);
}
// build category buttons
for (const cat of CATEGORIES) {
  const b = document.createElement("button");
  b.className = "chip";
  b.dataset.id = cat.id;
  b.textContent = cat.label;
  b.addEventListener("click", () => {
    currentCat = cat.id;
    for (const x of catRow.children) x.classList.toggle("active", x.dataset.id === cat.id);
    populateMatSelect();
    selectMaterial(currentMat);
  });
  catRow.appendChild(b);
}
matSelect.addEventListener("change", () => selectMaterial(matSelect.value));

// init — URL 以材质名为准定位用途分类；旧来源分类链接仍可打开正确材质。
const urlParams = new URLSearchParams(location.search);
const wantCat = urlParams.get("cat");
const wantMat = urlParams.get("mat");
const wantedMaterialCategory = wantMat ? materialUseCategory(wantMat) : null;
if (wantedMaterialCategory) currentCat = wantedMaterialCategory.id;
else if (wantCat && CATEGORIES.some((c) => c.id === wantCat)) currentCat = wantCat;

setShape(DEFAULT_SHAPE);
for (const x of catRow.children) x.classList.toggle("active", x.dataset.id === currentCat);
populateMatSelect();
if (wantMat) {
  const cat = CATEGORIES.find((c) => c.id === currentCat);
  if (cat && cat.names.includes(wantMat)) {
    currentMat = wantMat;
    matSelect.value = wantMat;
  }
}
await selectMaterial(currentMat);

// --- render loop -------------------------------------------------------------
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}
function tick() {
  resize();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
