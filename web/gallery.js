/**
 * Meshova 模型库 — 程序化模型卡片网格。
 *
 * 复用与 viewer/CLI 同一套 /dist 几何库：为每个 PROC_MODEL 用默认参数
 * build() 一次，离屏渲染一张缩略图烘成 dataURL 放进卡片。点击卡片跳转到
 * index.html?model=<id> 进入单模型预览。
 */
import * as THREE from "three";
import { PROC_MODELS, defaultParams } from "/web/procmodels.js";
import { isGalleryModelVisible } from "/web/model-visibility.js";
import { bakeMaterial, SBS_REPRO_NAMES, PRESET_NAMES, BUILDER_NAMES } from "/web/materials.js";

// 材质条目：与模型同库展示，用方块缩略图；点击跳 matlab.html 单材质渲染器。
const MATERIAL_CATS = [
  { id: "sbs", label: "材质·SBS复现", names: SBS_REPRO_NAMES },
  { id: "preset", label: "材质·内置预设", names: PRESET_NAMES },
  { id: "builder", label: "材质·拼接", names: BUILDER_NAMES },
];

// 分类：把模型 id 归到便于浏览的组，未列出的归“其它”。
const CATEGORY = {
  teddy: "角色", "cartoon-mech-pilot": "角色", "stylized-humanoid": "角色",
  tshirt: "服装", skirt: "服装", pants: "服装", dress: "服装", hoodie: "服装",
  "sports-car": "载具",
  "hard-surface-kit": "硬表面",
  officechair: "家具", wineglass: "家具", "interior-room": "家具",
  tower: "建筑", pagoda: "建筑", building: "建筑", cityblock: "建筑", streetscene: "建筑", freeway: "建筑",
  road: "基建", railway: "基建", viaduct: "基建", pylon: "基建", "tower-crane": "基建", "wind-turbine": "基建",
  "toll-station": "基建", "tunnel-portal": "基建", intersection: "基建",
  "titan-rail": "Titan复刻", "titan-fence": "Titan复刻", "titan-cable": "Titan复刻",
  "titan-adboard": "Titan复刻", "titan-shrub": "Titan复刻", "titan-platform": "Titan复刻",
  "titan-building": "Titan复刻", "titan-stacking": "Titan复刻",
  "urban-artdeco": "建筑", "urban-glass": "建筑", "urban-brick": "建筑",
  "urban-office": "建筑", "urban-brownstone": "建筑", "urban-corporate": "建筑",
  "rooftop-kit": "城市", scaffolding: "城市", "bus-stop": "城市", bicycle: "城市",
  billboard: "城市", "container-yard": "城市", "manhole-cover": "城市", "barrier-run": "城市",
  "fire-escape": "城市", newsstand: "城市", "traffic-signal": "城市",
  "umbrella-table": "城市", "street-tree": "城市", "wfc-rooftop": "城市",
  rock: "自然", mushroom: "自然", meadow: "自然", vine: "自然", "vine-slope": "自然", "ivy-ruins": "自然",
  fterrain: "地形", "terrain-island": "地形",
  "veg-tree": "植被", "veg-shrub": "植被", "veg-grass": "植被",
  "veg-conifer": "植被", "veg-palm": "植被", "veg-tree-lod": "植被", "veg-garden": "植被",
  sphere: "基础", smooth: "基础", spring: "基础", gear: "基础", csg: "基础",
};
const catOf = (id, fallback) => {
  if (id === "fterrain" || id.startsWith("terrain-")) return "地形";
  if (id.startsWith("veg-")) return "植被";
  if (id.startsWith("mech-")) return "机械";
  if (fallback === "meshova") return "Meshova 生成";
  if (id.startsWith("urban-")) return "建筑";
  if (id.startsWith("speedtree-tutorial-")) return "SpeedTree教程复刻";
  if (id === "speedtree-species-lineup" || id === "speedtree-guided-canopy" || /^speedtree-(oak|maple|birch|willow|pine|spruce|palm)$/.test(id)) return "SpeedTree-lite";
  if (id === "speedtree-custom-lineup" || id.startsWith("speedtree-custom-")) return "SpeedTree-lite 新树型";
  return fallback || CATEGORY[id] || "其它";
};

function isGeneratedLibraryEntry(m) {
  if (!m || !m.id || !m.file || PROC_MODELS[m.id] || !isGalleryModelVisible(m.id)) return false;
  const id = String(m.id);
  return m.category === "meshova" || id.startsWith("speedtree-") || id.startsWith("terrain-") || id.startsWith("veg-") || id.startsWith("mech-") || id.startsWith("rt-") || m.category === "地形" || m.category === "植被" || m.category === "机械";
}

async function loadGeneratedEntries() {
  try {
    const res = await fetch("/out/models.json", { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    const models = Array.isArray(data.models) ? data.models : [];
    return models
      .filter(isGeneratedLibraryEntry)
      .map((m) => ({
        id: m.id,
        model: { name: m.name || m.id },
        cat: catOf(m.id, m.category || "生成模型"),
        generated: true,
        file: m.file,
      }));
  } catch {
    return [];
  }
}

function generatedThumbCandidates(entry) {
  const base = [
    `/out/shots/${entry.id}-persp.png`,
    `/out/shots/${entry.id}-front.png`,
    `/out/shots/${entry.id}-side.png`,
    `/out/shots/${entry.id}-top.png`,
  ];
  if (entry.id.startsWith("terrain-")) {
    return [
      `/out/shots/${entry.id}-orbit35.png`,
      ...base,
    ];
  }
  return base;
}

function loadableImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(url);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function firstLoadableImage(urls) {
  for (const url of urls) {
    const ok = await loadableImage(url);
    if (ok) return ok;
  }
  return null;
}

// 离屏渲染：一个共享 renderer + 场景，逐个模型渲染再 toDataURL。
const THUMB = 360;
const canvas = document.createElement("canvas");
canvas.width = THUMB; canvas.height = THUMB * 0.75;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(canvas.width, canvas.height, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d12);
const camera = new THREE.PerspectiveCamera(35, canvas.width / canvas.height, 0.01, 100);
const thumbCameraDir = new THREE.Vector3(0.7, 0.55, 0.9).normalize();
const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(3, 5, 4);
const fill = new THREE.DirectionalLight(0x88aaff, 0.8); fill.position.set(-4, 1, -2);
const rim = new THREE.DirectionalLight(0xffffff, 1.0); rim.position.set(0, 3, -5);
scene.add(key, fill, rim, new THREE.HemisphereLight(0x9fb8ff, 0x202028, 0.7));

// 程序化渐变天空 IBL：材质方块的金属/粗糙反射才正确（无外部 HDR）。
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

// 材质缩略图用的方块（第二套 uv 供 aoMap）。
const matCubeGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4, 4, 4, 4);
matCubeGeo.setAttribute("uv2", matCubeGeo.getAttribute("uv"));

// 为一个材质名渲染方块缩略图，返回 dataURL。
function renderMaterialThumb(name) {
  const material = bakeMaterial(name, 256, {});
  const mesh = new THREE.Mesh(matCubeGeo, material);
  mesh.rotation.set(0.15, 0.6, 0);
  const root = new THREE.Group();
  root.add(mesh);
  scene.add(root);
  frameRoot(root);
  renderer.render(scene, camera);
  const url = canvas.toDataURL("image/png");
  scene.remove(root);
  for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap"]) {
    if (material[k] && material[k].dispose) material[k].dispose();
  }
  material.dispose();
  return url;
}

const textureLoader = new THREE.TextureLoader();
const textureCache = new Map();

function resolveTexture(path) {
  if (!path) return null;
  if (/^(https?:)?\/\//i.test(path) || path.startsWith("/")) return path;
  return `/out/${path}`;
}

function loadTexture(path, { srgb = false, flipY = true } = {}) {
  const url = resolveTexture(path);
  if (!url) return null;
  const key = `${srgb ? "srgb" : "linear"}:${flipY ? "flipY" : "noFlipY"}:${url}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const tex = textureLoader.load(url);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.flipY = flipY;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  textureCache.set(key, tex);
  return tex;
}

function materialForViewerPart(part, hasVColors) {
  const c = part.color || [0.8, 0.8, 0.8];
  const mat = new THREE.MeshStandardMaterial({
    color: hasVColors ? 0xffffff : new THREE.Color(c[0], c[1], c[2]),
    vertexColors: hasVColors,
    roughness: 0.62,
    metalness: 0.05,
  });
  const t = part.textures;
  if (!t) return mat;
  const baseColor = loadTexture(t.baseColor, { srgb: true });
  const normal = loadTexture(t.normal);
  const orm = loadTexture(t.orm);
  const roughness = loadTexture(t.roughness);
  const metallic = loadTexture(t.metallic);
  const ao = loadTexture(t.ao);
  if (baseColor) {
    mat.map = baseColor;
    mat.color.setRGB(1, 1, 1);
  }
  if (normal) mat.normalMap = normal;
  if (orm) {
    mat.aoMap = orm;
    mat.roughnessMap = orm;
    mat.metalnessMap = orm;
    mat.roughness = 1;
    mat.metalness = 1;
  } else {
    if (ao) mat.aoMap = ao;
    if (roughness) {
      mat.roughnessMap = roughness;
      mat.roughness = 1;
    }
    if (metallic) {
      mat.metalnessMap = metallic;
      mat.metalness = 1;
    }
  }
  return mat;
}

function meshToGeo(mesh) {
  const n = mesh.positions.length;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    pos[i*3]=mesh.positions[i].x; pos[i*3+1]=mesh.positions[i].y; pos[i*3+2]=mesh.positions[i].z;
    nrm[i*3]=mesh.normals[i].x; nrm[i*3+1]=mesh.normals[i].y; nrm[i*3+2]=mesh.normals[i].z;
    uv[i*2]=mesh.uvs[i].x; uv[i*2+1]=mesh.uvs[i].y;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex([...mesh.indices]);
  return geo;
}

function viewerPartToGeo(part) {
  const positions = Array.isArray(part?.positions) ? part.positions : [];
  if (positions.length < 9) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  if (Array.isArray(part.normals) && part.normals.length === positions.length) {
    geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(part.normals), 3));
  }
  const vertCount = positions.length / 3;
  if (Array.isArray(part.uvs) && part.uvs.length === vertCount * 2) {
    geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(part.uvs), 2));
  }
  if (Array.isArray(part.colors) && part.colors.length === positions.length) {
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(part.colors), 3));
  }
  if (Array.isArray(part.indices) && part.indices.length > 0) {
    geo.setIndex([...part.indices]);
  }
  if (!geo.getAttribute("normal")) geo.computeVertexNormals();
  return geo;
}

function frameRoot(root) {
  const bbox = new THREE.Box3().setFromObject(root);
  const center = new THREE.Vector3(); bbox.getCenter(center);
  const size = new THREE.Vector3(); bbox.getSize(size);
  if (!Number.isFinite(size.x) || !Number.isFinite(size.y) || !Number.isFinite(size.z) || size.length() <= 1e-6) {
    center.set(0, 0, 0);
    size.set(1, 1, 1);
  }
  root.position.set(-center.x, -center.y, -center.z);
  const radius = Math.max(1e-3, size.length() * 0.5);
  const fov = (camera.fov * Math.PI) / 180;
  const dist = (radius / Math.sin(fov * 0.5)) * 1.18;
  camera.near = Math.max(0.01, dist - radius * 2.4);
  camera.far = dist + radius * 2.4;
  camera.updateProjectionMatrix();
  camera.position.copy(thumbCameraDir).multiplyScalar(dist);
  camera.lookAt(0, 0, 0);
}

// 为一个模型渲染缩略图，返回 { url, verts, tris }。
async function renderThumb(model) {
  const params = model.defaultParams ? model.defaultParams() : defaultParams(model);
  const parts = await model.build(params);
  const root = new THREE.Group();
  let verts = 0, tris = 0;
  for (const part of parts) {
    const geo = meshToGeo(part.mesh);
    verts += part.mesh.positions.length;
    tris += part.mesh.indices.length / 3;
    const hasVColors = Array.isArray(part.colors) && part.colors.length === part.mesh.positions.length * 3;
    if (hasVColors) geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(part.colors), 3));
    const mat = materialForViewerPart(part, hasVColors);
    root.add(new THREE.Mesh(geo, mat));
  }
  scene.add(root);

  // 居中 + 框定相机到包围盒。
  frameRoot(root);

  renderer.render(scene, camera);
  const url = canvas.toDataURL("image/png");

  // 清理本次的几何/材质，避免 GPU 泄漏。
  scene.remove(root);
  root.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return { url, verts, tris };
}

function renderViewerModelThumb(viewerModel) {
  const root = new THREE.Group();
  let verts = 0, tris = 0;
  const parts = Array.isArray(viewerModel) ? viewerModel : (viewerModel?.parts || []);
  for (const part of parts) {
    const geo = viewerPartToGeo(part);
    if (!geo) continue;
    const pos = geo.getAttribute("position");
    const index = geo.getIndex();
    verts += pos.count;
    tris += (index ? index.count : pos.count) / 3;
    const hasVColors = !!geo.getAttribute("color");
    const mat = materialForViewerPart(part, hasVColors);
    mat.side = THREE.DoubleSide;
    root.add(new THREE.Mesh(geo, mat));
  }
  if (root.children.length === 0) throw new Error("模型无可渲染几何");
  scene.add(root);
  frameRoot(root);
  renderer.render(scene, camera);
  const url = canvas.toDataURL("image/png");
  scene.remove(root);
  root.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return { url, verts, tris };
}

// ---- 单模型预览模态：内嵌 iframe 渲染，避免整页跳转 ----
const modalEl = document.getElementById("modal");
const modalFrame = document.getElementById("modal-frame");
const modalTitle = document.getElementById("modal-title");
const modalSub = document.getElementById("modal-sub");
const modalOpen = document.getElementById("modal-open");
const modalClose = document.getElementById("modal-close");

function openModal({ url, title, sub }) {
  modalTitle.textContent = title || "";
  modalSub.textContent = sub || "";
  modalOpen.href = url;
  modalFrame.src = url;
  modalEl.classList.add("on");
  document.body.style.overflow = "hidden";
}

// iframe 内的子页面自带“← 模型库”返回链接，嵌在模态里会造成嵌套画廊，隐藏它。
// 同源可直接访问 contentDocument。
modalFrame.addEventListener("load", () => {
  if (modalFrame.src.endsWith("about:blank")) return;
  try {
    const doc = modalFrame.contentDocument;
    if (!doc) return;
    // 隐藏子页面里所有指向模型库的返回链接（.back 或 href 指到 gallery.html）。
    doc.querySelectorAll('.back, a[href*="gallery.html"]').forEach((el) => {
      el.style.display = "none";
    });
  } catch { /* 跨源时忽略 */ }
});

function closeModal() {
  modalEl.classList.remove("on");
  modalFrame.src = "about:blank"; // 释放 iframe 内的 WebGL 上下文
  document.body.style.overflow = "";
}

modalClose.onclick = closeModal;
// 点遮罩空白处（box 之外）关闭。
modalEl.addEventListener("click", (ev) => { if (ev.target === modalEl) closeModal(); });
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && modalEl.classList.contains("on")) closeModal();
});

// ---- 构建卡片网格 + 搜索 + 分类过滤 ----
const grid = document.getElementById("grid");
const countEl = document.getElementById("count");
const searchEl = document.getElementById("search");

const generatedEntries = await loadGeneratedEntries();
const procEntries = Object.entries(PROC_MODELS)
  .filter(([id]) => isGalleryModelVisible(id))
  .map(([id, model]) => ({ id, model, cat: catOf(id), generated: false }));
// 材质条目：三大类展平，标记 isMaterial，与模型同库排在末尾。
const materialEntries = [];
for (const cat of MATERIAL_CATS) {
  for (const name of cat.names) {
    materialEntries.push({
      id: `mat:${cat.id}:${name}`,
      model: { name },
      cat: cat.label,
      isMaterial: true,
      matName: name,
      matCat: cat.id,
    });
  }
}

// rt-* 是规则树/查询层的演示模型，置顶方便查看。
const pinnedGenerated = generatedEntries.filter((e) => e.id.startsWith("rt-"));
const restGenerated = generatedEntries.filter((e) => !e.id.startsWith("rt-"));

const entries = [
  ...pinnedGenerated,
  ...procEntries.filter((e) => !e.id.startsWith("speedtree-")),
  ...procEntries.filter((e) => e.id.startsWith("speedtree-")),
  ...restGenerated,
  ...materialEntries,
];
let activeCat = "全部";
let query = "";

// ---- Sketchfab 风格下拉 mega 菜单：左侧来源列 + 右侧主题分组网格 ----
// 每个分类计数（含当前 entries 里实际出现的分类）。
const catCount = {};
for (const e of entries) catCount[e.cat] = (catCount[e.cat] || 0) + 1;
const presentCats = new Set(Object.keys(catCount));

// 分类图标（emoji，找不到用默认圆点）。
const CAT_ICON = {
  角色: "🧍", 服装: "👕", 载具: "🚗", 硬表面: "🔩", 家具: "🛋️", 建筑: "🏙️",
  基建: "🌉", 城市: "🏗️", 自然: "🌿", 地形: "⛰️", 植被: "🌳", 机械: "🤖",
  基础: "🔷", "Titan复刻": "🗼", SpeedTree教程复刻: "🌲", "SpeedTree-lite": "🌴",
  "SpeedTree-lite 新树型": "🌱", "Meshova 生成": "✨", 生成模型: "📦", 其它: "🔸",
  "材质·SBS复现": "🎛️", "材质·内置预设": "🎨", "材质·拼接": "🧩",
};
const iconFor = (c) => CAT_ICON[c] || "•";

// 主题分组：把分类归到便于浏览的大组，只显示实际存在的分类。
const MATERIAL_LABELS = MATERIAL_CATS.map((c) => c.label);
const CAT_GROUPS = [
  { label: "角色 & 服装", cats: ["角色", "服装"] },
  { label: "载具 & 机械", cats: ["载具", "机械", "硬表面"] },
  { label: "建筑 & 城市", cats: ["建筑", "城市", "基建"] },
  { label: "自然 & 植被", cats: ["自然", "地形", "植被"] },
  { label: "复刻 & 教程", cats: ["Titan复刻", "SpeedTree教程复刻", "SpeedTree-lite", "SpeedTree-lite 新树型"] },
  { label: "家具 & 基础", cats: ["家具", "基础"] },
  { label: "生成 & 其它", cats: ["Meshova 生成", "生成模型", "其它"] },
  { label: "材质", cats: MATERIAL_LABELS },
];

// 为每个模型建卡片骨架，缩略图后台逐个填充。
const cards = entries.map((e) => {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.name = e.model.name;
  card.dataset.id = e.id;
  card.dataset.cat = e.cat;
  const sub = e.isMaterial ? e.cat : e.generated ? `${e.cat} · ${e.file}` : `${e.cat} · ${e.id}`;
  card.innerHTML =
    `<div class="thumb"><div class="spin"></div></div>` +
    `<div class="meta"><span class="name">${e.model.name}</span>` +
    `<span class="sub">${sub}</span></div>`;
  card.onclick = () => {
    if (e.isMaterial) {
      openModal({
        url: `/web/matlab.html?cat=${encodeURIComponent(e.matCat)}&mat=${encodeURIComponent(e.matName)}`,
        title: e.model.name,
        sub: e.cat,
      });
      return;
    }
    const modelParam = e.generated ? (e.file || `${e.id}.json`) : e.id;
    openModal({
      url: `/web/index.html?model=${encodeURIComponent(modelParam)}`,
      title: e.model.name,
      sub: `${e.cat} · ${e.id}`,
    });
  };
  grid.appendChild(card);
  return { ...e, card };
});

const empty = document.createElement("div");
empty.id = "empty";
empty.textContent = "没有匹配的模型";
grid.appendChild(empty);

function catMatch(entry) {
  if (activeCat === "全部") return true;
  if (activeCat === "__models") return !entry.isMaterial;
  if (activeCat === "__materials") return !!entry.isMaterial;
  return entry.cat === activeCat;
}

function applyFilter() {
  const q = query.trim().toLowerCase();
  let shown = 0;
  for (const entry of cards) {
    const { card, model, id, cat } = entry;
    const match =
      catMatch(entry) &&
      (!q || model.name.toLowerCase().includes(q) || id.includes(q) || cat.toLowerCase().includes(q));
    card.style.display = match ? "" : "none";
    if (match) shown++;
  }
  empty.style.display = shown ? "none" : "block";
  countEl.textContent = `${shown} / ${cards.length} 个模型`;
}

// ---- mega 菜单构建 ----
const toggleEl = document.getElementById("cat-toggle");
const toggleLabelEl = document.getElementById("cat-toggle-label");
const menuEl = document.getElementById("megamenu");
const sideEl = document.getElementById("mega-side");
const mainEl = document.getElementById("mega-main");
const activeTagEl = document.getElementById("active-tag");
const activeTagLabelEl = document.getElementById("active-tag-label");
const activeTagClearEl = document.getElementById("active-tag-clear");

// 左侧“来源列”：跨分类的快捷视图（全部 / 模型 / 材质）。
const SOURCES = [
  { key: "全部", ic: "▦", label: "全部", count: () => cards.length },
  { key: "__models", ic: "📦", label: "仅模型", count: () => cards.filter((c) => !c.isMaterial).length },
  { key: "__materials", ic: "🎨", label: "仅材质", count: () => cards.filter((c) => c.isMaterial).length },
];
for (const s of SOURCES) {
  const el = document.createElement("div");
  el.className = "src" + (s.key === activeCat ? " on" : "");
  el.dataset.key = s.key;
  el.innerHTML = `<span class="ic">${s.ic}</span><span>${s.label}</span><span class="n">${s.count()}</span>`;
  el.onclick = () => selectCat(s.key);
  sideEl.appendChild(el);
}

// 右侧主题分组网格：只列出实际存在的分类。
for (const grp of CAT_GROUPS) {
  const present = grp.cats.filter((c) => presentCats.has(c));
  if (present.length === 0) continue;
  const box = document.createElement("div");
  box.className = "grp";
  box.innerHTML = `<div class="gt">${grp.label}</div>`;
  for (const c of present) {
    const it = document.createElement("div");
    it.className = "it" + (c === activeCat ? " on" : "");
    it.dataset.key = c;
    it.innerHTML = `<span class="ic">${iconFor(c)}</span><span>${c}</span><span class="n">${catCount[c]}</span>`;
    it.onclick = () => selectCat(c);
    box.appendChild(it);
  }
  mainEl.appendChild(box);
}

function labelForCat(key) {
  const src = SOURCES.find((s) => s.key === key);
  return src ? src.label : key;
}

function selectCat(key) {
  activeCat = key;
  // 高亮同步：来源列 + 主题网格。
  sideEl.querySelectorAll(".src").forEach((el) => el.classList.toggle("on", el.dataset.key === key));
  mainEl.querySelectorAll(".it").forEach((el) => el.classList.toggle("on", el.dataset.key === key));
  const isAll = key === "全部";
  toggleLabelEl.textContent = isAll ? "全部分类" : labelForCat(key);
  activeTagEl.classList.toggle("on", !isAll);
  if (!isAll) activeTagLabelEl.textContent = labelForCat(key);
  closeMenu();
  applyFilter();
}

function openMenu() { menuEl.classList.add("open"); toggleEl.classList.add("open"); }
function closeMenu() { menuEl.classList.remove("open"); toggleEl.classList.remove("open"); }
toggleEl.onclick = (ev) => {
  ev.stopPropagation();
  menuEl.classList.contains("open") ? closeMenu() : openMenu();
};
menuEl.addEventListener("click", (ev) => ev.stopPropagation());
document.addEventListener("click", () => closeMenu());
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") closeMenu(); });
activeTagClearEl.onclick = (ev) => { ev.stopPropagation(); selectCat("全部"); };

searchEl.oninput = () => { query = searchEl.value; applyFilter(); };
applyFilter();

async function fillGeneratedCard(entry) {
  const thumb = entry.card.querySelector(".thumb");
  try {
    const res = await fetch(`/out/${entry.file}`, { cache: "no-store" });
    if (!res.ok) throw new Error("模型文件不存在");
    const model = await res.json();
    let tris = Math.round(model?.meta?.tris ?? 0);
    let verts = Math.round(model?.meta?.verts ?? 0);
    // 统一背景：优先用 gallery 深色离屏渲染，跟其余卡片一致。
    // 离线截图（/out/shots/*.png）背景是 viewer 的 env 天空，色调不一致，
    // 只在离屏渲染失败（几何缺失等）时兜底。
    let thumbUrl = null;
    try {
      const rendered = renderViewerModelThumb(model);
      thumbUrl = rendered.url;
      if (!tris) tris = Math.round(rendered.tris);
      if (!verts) verts = Math.round(rendered.verts);
    } catch {
      thumbUrl = await firstLoadableImage(generatedThumbCandidates(entry));
    }
    if (!thumbUrl) throw new Error("无缩略图");
    thumb.innerHTML = `<img src="${thumbUrl}" alt="${entry.model.name}" />`;
    thumb.innerHTML += `<span class="badge">${tris} 面</span>`;
    const meta = model?.meta || {};
    const bits = [entry.cat, `${tris} 面`];
    if (verts) bits.push(`${verts} 顶点`);
    if (entry.id.startsWith("terrain-") && typeof meta.waterCoverage === "number") {
      bits.push(`水域 ${Math.round(meta.waterCoverage * 100)}%`);
    }
    entry.card.querySelector(".sub").textContent = bits.join(" · ");
    if (meta.description) entry.card.title = meta.description;
  } catch (e) {
    thumb.innerHTML = `<span style="color:#ff7b72;font-size:12px;padding:8px;text-align:center">加载失败<br>${e?.message || e}</span>`;
  }
}

// 单张缩略图渲染：按 entry 类型分派。材质方块最快，生成模型优先用离线截图，proc 模型运行时 build。
async function renderOne(entry) {
  const { card, model } = entry;
  const thumb = card.querySelector(".thumb");
  if (entry.isMaterial) {
    try {
      const url = renderMaterialThumb(entry.matName);
      thumb.innerHTML = `<img src="${url}" alt="${entry.model.name}" />`;
    } catch (e) {
      thumb.innerHTML = `<span style="color:#ff7b72;font-size:12px;padding:8px;text-align:center">渲染失败<br>${e?.message || e}</span>`;
    }
    return;
  }
  if (entry.generated) {
    await fillGeneratedCard(entry);
    return;
  }
  try {
    const { url, verts, tris } = await renderThumb(model);
    thumb.innerHTML =
      `<img src="${url}" alt="${model.name}" />` +
      `<span class="badge">${tris | 0} 面</span>`;
    card.querySelector(".sub").textContent += ` · ${verts} 顶点`;
  } catch (e) {
    thumb.innerHTML = `<span style="color:#ff7b72;font-size:12px;padding:8px;text-align:center">渲染失败<br>${e?.message || e}</span>`;
  }
}

// 懒加载：只渲染进入视口的卡片。共享同一个 renderer，所以按“进入视口”顺序串行出队，
// 首屏可见的卡片最先渲染。滚动到哪就渲染到哪，避免几百张排一条队把首屏挤到队尾。
const renderQueue = [];
let pumping = false;
async function pump() {
  if (pumping) return;
  pumping = true;
  while (renderQueue.length) {
    const entry = renderQueue.shift();
    if (entry.rendered) continue;
    entry.rendered = true;
    await renderOne(entry);
    await new Promise((r) => requestAnimationFrame(r));
  }
  pumping = false;
}

const cardByEl = new Map(cards.map((e) => [e.card, e]));
const observer = new IntersectionObserver(
  (records) => {
    for (const rec of records) {
      if (!rec.isIntersecting) continue;
      const entry = cardByEl.get(rec.target);
      if (!entry || entry.rendered || entry.queued) continue;
      entry.queued = true;
      renderQueue.push(entry);
      observer.unobserve(rec.target);
    }
    pump();
  },
  { rootMargin: "300px 0px", threshold: 0.01 }
);
for (const entry of cards) observer.observe(entry.card);
