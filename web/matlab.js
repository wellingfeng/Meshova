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
  SBS_PARAM_SCHEMA,
  defaultSbsParams,
  PRESET_NAMES,
  BUILDER_NAMES,
  PRESET_PARAM_SCHEMA,
  defaultMatParams,
} from "/web/materials.js?v=cloth2";

const CATEGORIES = [
  { id: "sbs", label: "SBS 复现", names: SBS_REPRO_NAMES },
  { id: "preset", label: "内置预设", names: PRESET_NAMES },
  { id: "builder", label: "拼接材质", names: BUILDER_NAMES },
];
const DEFAULT_SHAPE = "cube";
const DEFAULT_CAT = "sbs";
const DEFAULT_MAT = "Stylized_01_Bricks";

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

function schemaFor(name) {
  if (SBS_REPRO_NAMES.includes(name)) return SBS_PARAM_SCHEMA[name];
  return PRESET_PARAM_SCHEMA[name] ?? null;
}
function defaultParams(name) {
  if (SBS_REPRO_NAMES.includes(name)) return defaultSbsParams(name);
  return defaultMatParams(name);
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
    o.textContent = n;
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
