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

// 分类：把模型 id 归到便于浏览的组，未列出的归“其它”。
const CATEGORY = {
  teddy: "角色", "cartoon-mech-pilot": "角色", "stylized-humanoid": "角色",
  tshirt: "服装", skirt: "服装", pants: "服装", dress: "服装", hoodie: "服装",
  "sports-car": "载具",
  "hard-surface-kit": "硬表面",
  officechair: "家具", wineglass: "家具", "interior-room": "家具",
  tower: "建筑", pagoda: "建筑", building: "建筑", cityblock: "建筑",
  rock: "自然", mushroom: "自然", meadow: "自然", vine: "自然",
  fterrain: "地形", "terrain-island": "地形",
  "veg-tree": "植被", "veg-shrub": "植被", "veg-grass": "植被",
  "veg-conifer": "植被", "veg-palm": "植被", "veg-tree-lod": "植被", "veg-garden": "植被",
  sphere: "基础", smooth: "基础", spring: "基础", gear: "基础", csg: "基础",
};
const catOf = (id, fallback) => {
  if (id === "fterrain" || id.startsWith("terrain-")) return "地形";
  if (id.startsWith("veg-")) return "植被";
  if (id.startsWith("speedtree-tutorial-")) return "SpeedTree教程复刻";
  if (id === "speedtree-species-lineup" || id === "speedtree-guided-canopy" || /^speedtree-(oak|maple|birch|willow|pine|spruce|palm)$/.test(id)) return "SpeedTree-lite";
  if (id === "speedtree-custom-lineup" || id.startsWith("speedtree-custom-")) return "SpeedTree-lite 新树型";
  return fallback || CATEGORY[id] || "其它";
};

function isGeneratedLibraryEntry(m) {
  if (!m || !m.id || !m.file || PROC_MODELS[m.id] || !isGalleryModelVisible(m.id)) return false;
  const id = String(m.id);
  return id.startsWith("speedtree-") || id.startsWith("terrain-") || id.startsWith("veg-") || m.category === "地形" || m.category === "植被";
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

// ---- 构建卡片网格 + 搜索 + 分类过滤 ----
const grid = document.getElementById("grid");
const countEl = document.getElementById("count");
const catsEl = document.getElementById("cats");
const searchEl = document.getElementById("search");

const generatedEntries = await loadGeneratedEntries();
const procEntries = Object.entries(PROC_MODELS)
  .filter(([id]) => isGalleryModelVisible(id))
  .map(([id, model]) => ({ id, model, cat: catOf(id), generated: false }));
const entries = [
  ...procEntries.filter((e) => !e.id.startsWith("speedtree-")),
  ...procEntries.filter((e) => e.id.startsWith("speedtree-")),
  ...generatedEntries,
];
let activeCat = "全部";
let query = "";

// 分类标签栏（按出现顺序，去重）。
const cats = ["全部", ...[...new Set(entries.map((e) => e.cat))]];
for (const cat of cats) {
  const el = document.createElement("div");
  el.className = "cat" + (cat === activeCat ? " on" : "");
  el.textContent = cat;
  el.onclick = () => {
    activeCat = cat;
    [...catsEl.children].forEach((c) => c.classList.toggle("on", c.textContent === cat));
    applyFilter();
  };
  catsEl.appendChild(el);
}

// 为每个模型建卡片骨架，缩略图后台逐个填充。
const cards = entries.map((e) => {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.name = e.model.name;
  card.dataset.id = e.id;
  card.dataset.cat = e.cat;
  const sub = e.generated ? `${e.cat} · ${e.file}` : `${e.cat} · ${e.id}`;
  card.innerHTML =
    `<div class="thumb"><div class="spin"></div></div>` +
    `<div class="meta"><span class="name">${e.model.name}</span>` +
    `<span class="sub">${sub}</span></div>`;
  card.onclick = () => {
    const modelParam = e.generated ? (e.file || `${e.id}.json`) : e.id;
    location.href = `/web/index.html?model=${encodeURIComponent(modelParam)}`;
  };
  grid.appendChild(card);
  return { ...e, card };
});

const empty = document.createElement("div");
empty.id = "empty";
empty.textContent = "没有匹配的模型";
grid.appendChild(empty);

function applyFilter() {
  const q = query.trim().toLowerCase();
  let shown = 0;
  for (const { card, model, id, cat } of cards) {
    const match =
      (activeCat === "全部" || cat === activeCat) &&
      (!q || model.name.toLowerCase().includes(q) || id.includes(q) || cat.toLowerCase().includes(q));
    card.style.display = match ? "" : "none";
    if (match) shown++;
  }
  empty.style.display = shown ? "none" : "block";
  countEl.textContent = `${shown} / ${cards.length} 个模型`;
}

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
    const img = await firstLoadableImage(generatedThumbCandidates(entry));
    let thumbUrl = img;
    if (!thumbUrl) {
      const rendered = renderViewerModelThumb(model);
      thumbUrl = rendered.url;
      if (!tris) tris = Math.round(rendered.tris);
      if (!verts) verts = Math.round(rendered.verts);
    }
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

// 逐个烘缩略图（顺序执行，避免同时占满 GPU；让出主线程保持 UI 响应）。
(async () => {
  for (const entry of cards.filter((card) => card.generated)) {
    await fillGeneratedCard(entry);
  }
  for (const entry of cards) {
    const { card, model } = entry;
    const thumb = card.querySelector(".thumb");
    if (entry.generated) continue;
    try {
      const { url, verts, tris } = await renderThumb(model);
      thumb.innerHTML =
        `<img src="${url}" alt="${model.name}" />` +
        `<span class="badge">${tris | 0} 面</span>`;
      card.querySelector(".sub").textContent += ` · ${verts} 顶点`;
    } catch (e) {
      thumb.innerHTML = `<span style="color:#ff7b72;font-size:12px;padding:8px;text-align:center">渲染失败<br>${e?.message || e}</span>`;
    }
    await new Promise((r) => requestAnimationFrame(r));
  }
})();
