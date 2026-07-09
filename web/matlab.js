/**
 * Material lab: preview any Meshova procedural material (SBS reproductions,
 * presets, builders) on a choice of primitive shapes. Everything is baked live
 * from /dist via materials.js — no static bitmaps.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  bakeMaterial,
  SBS_REPRO_NAMES,
  PRESET_NAMES,
  BUILDER_NAMES,
} from "/web/materials.js";

// --- param schema for the SBS reproduction recipes (label + range) ----------
const SBS_SCHEMA = {
  Metal_Knurled_01: [
    { key: "seed", label: "种子", min: 0, max: 40, step: 1, def: 3 },
    { key: "freq", label: "滚花密度", min: 8, max: 48, step: 1, def: 26 },
    { key: "depth", label: "凸起深度", min: 0.3, max: 2, step: 0.05, def: 1 },
  ],
  Tiles_01: [
    { key: "seed", label: "种子", min: 0, max: 40, step: 1, def: 8 },
    { key: "columns", label: "横向格数", min: 4, max: 20, step: 1, def: 10 },
    { key: "rows", label: "纵向格数", min: 4, max: 20, step: 1, def: 10 },
  ],
  Stylized_01_Bricks: [
    { key: "seed", label: "种子", min: 0, max: 40, step: 1, def: 4 },
    { key: "columns", label: "横向砖数", min: 3, max: 12, step: 1, def: 6 },
    { key: "rows", label: "纵向砖数", min: 4, max: 20, step: 1, def: 11 },
  ],
  Plastic_01: [
    { key: "seed", label: "种子", min: 0, max: 40, step: 1, def: 6 },
    { key: "grain", label: "颗粒密度", min: 30, max: 160, step: 5, def: 90 },
  ],
  Wood_Parquet_01: [
    { key: "seed", label: "种子", min: 0, max: 40, step: 1, def: 9 },
    { key: "planks", label: "拼花密度", min: 2, max: 12, step: 1, def: 6 },
  ],
  Concrete_Decorative_01: [
    { key: "seed", label: "种子", min: 0, max: 40, step: 1, def: 12 },
    { key: "scale", label: "斑驳频率", min: 2, max: 14, step: 0.5, def: 6 },
  ],
  Tiles_04: [
    { key: "seed", label: "种子", min: 0, max: 40, step: 1, def: 5 },
    { key: "columns", label: "横向格数", min: 4, max: 20, step: 1, def: 8 },
    { key: "rows", label: "纵向格数", min: 4, max: 20, step: 1, def: 8 },
  ],
  Tiles_02: [
    { key: "seed", label: "种子", min: 0, max: 40, step: 1, def: 6 },
    { key: "columns", label: "横向格数", min: 4, max: 20, step: 1, def: 6 },
    { key: "rows", label: "纵向格数", min: 4, max: 20, step: 1, def: 6 },
  ],
  Wall_KitchenTiles_01: [
    { key: "seed", label: "种子", min: 0, max: 40, step: 1, def: 9 },
    { key: "columns", label: "横向格数", min: 3, max: 16, step: 1, def: 5 },
    { key: "rows", label: "纵向格数", min: 3, max: 16, step: 1, def: 5 },
  ],
  Wood_Base_01: [
    { key: "seed", label: "种子", min: 0, max: 40, step: 1, def: 9 },
    { key: "count", label: "木板数", min: 2, max: 10, step: 1, def: 4 },
  ],
  Stylized_03_Wood_Planks: [
    { key: "seed", label: "种子", min: 0, max: 40, step: 1, def: 11 },
    { key: "count", label: "木板数", min: 2, max: 12, step: 1, def: 6 },
  ],
  Wood_Parquet_02: [
    { key: "seed", label: "种子", min: 0, max: 40, step: 1, def: 5 },
    { key: "planks", label: "拼花密度", min: 2, max: 12, step: 1, def: 7 },
  ],
};

// 未显式列出的 SBS 材质统一给一个种子滑块，实验室里也能微调。
const GENERIC_SBS_SCHEMA = [{ key: "seed", label: "种子", min: 0, max: 40, step: 1, def: 5 }];

const CATEGORIES = [
  { id: "sbs", label: "SBS 复现", names: SBS_REPRO_NAMES },
  { id: "preset", label: "内置预设", names: PRESET_NAMES },
  { id: "builder", label: "拼接材质", names: BUILDER_NAMES },
];

// --- three.js scene ----------------------------------------------------------
const canvas = document.getElementById("canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1116);

const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
camera.position.set(0, 0, 3);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// procedural gradient-sky IBL so metal/rough reflect honestly (no external HDR)
function makeEnv() {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const sky = new THREE.Scene();
  const geo = new THREE.SphereGeometry(50, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { top: { value: new THREE.Color(0xbcd4ff) }, bot: { value: new THREE.Color(0x33383f) } },
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
scene.add(key);
scene.add(new THREE.AmbientLight(0xffffff, 0.15));

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

let mesh = new THREE.Mesh(SHAPES.sphere, new THREE.MeshStandardMaterial());
scene.add(mesh);

// --- state -------------------------------------------------------------------
let currentShape = "sphere";
let currentCat = "sbs";
let currentMat = SBS_REPRO_NAMES[0];
let currentParams = {};

const shapeRow = document.getElementById("shape-row");
const catRow = document.getElementById("cat-row");
const matSelect = document.getElementById("mat-select");
const paramPanel = document.getElementById("param-panel");
const foot = document.getElementById("foot");

function schemaFor(name) {
  if (SBS_SCHEMA[name]) return SBS_SCHEMA[name];
  // SBS 复现类但未显式配 schema 的，回退到通用种子滑块。
  if (SBS_REPRO_NAMES.includes(name)) return GENERIC_SBS_SCHEMA;
  return null;
}
function defaultParams(name) {
  const sc = schemaFor(name);
  const out = {};
  if (sc) for (const s of sc) out[s.key] = s.def;
  return out;
}

function rebuildMaterial() {
  const size = 512;
  const old = mesh.material;
  mesh.material = bakeMaterial(currentMat, size, { ...currentParams });
  if (old && old.dispose) {
    for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap"]) {
      if (old[k] && old[k].dispose) old[k].dispose();
    }
    old.dispose();
  }
  foot.textContent = `当前: ${currentMat} · 512×512 · 程序化烘焙`;
}

function setShape(id) {
  currentShape = id;
  mesh.geometry = SHAPES[id];
  for (const b of shapeRow.children) b.classList.toggle("active", b.dataset.id === id);
}

function populateMatSelect() {
  const cat = CATEGORIES.find((c) => c.id === currentCat);
  matSelect.innerHTML = "";
  for (const n of cat.names) {
    const o = document.createElement("option");
    o.value = n;
    o.textContent = n;
    matSelect.appendChild(o);
  }
  currentMat = cat.names[0];
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
    input.type = "range";
    input.min = spec.min; input.max = spec.max; input.step = spec.step;
    input.value = currentParams[spec.key];
    let raf = 0;
    input.addEventListener("input", () => {
      currentParams[spec.key] = parseFloat(input.value);
      valSpan.textContent = String(currentParams[spec.key]);
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(rebuildMaterial);
    });
    lab.appendChild(head);
    lab.appendChild(input);
    paramPanel.appendChild(lab);
  }
}

function selectMaterial(name) {
  currentMat = name;
  currentParams = defaultParams(name);
  buildParamPanel();
  rebuildMaterial();
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

// init — 支持 URL 定位 ?cat=<sbs|preset|builder>&mat=<name>（从材质库跳入）
const urlParams = new URLSearchParams(location.search);
const wantCat = urlParams.get("cat");
const wantMat = urlParams.get("mat");
if (wantCat && CATEGORIES.some((c) => c.id === wantCat)) currentCat = wantCat;

setShape("sphere");
for (const x of catRow.children) x.classList.toggle("active", x.dataset.id === currentCat);
populateMatSelect();
if (wantMat) {
  const cat = CATEGORIES.find((c) => c.id === currentCat);
  if (cat && cat.names.includes(wantMat)) {
    currentMat = wantMat;
    matSelect.value = wantMat;
  }
}
selectMaterial(currentMat);

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


