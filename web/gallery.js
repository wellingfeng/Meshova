/**
 * Meshova 模型库 — Sketchfab 风格卡片网格。
 *
 * 复用与 viewer/CLI 同一套 /dist 几何库：为每个 PROC_MODEL 用默认参数
 * build() 一次，离屏渲染一张缩略图烘成 dataURL 放进卡片。点击卡片跳转到
 * index.html?model=<id> 进入单模型预览。
 */
import * as THREE from "three";
import { PROC_MODELS, defaultParams } from "/web/procmodels.js";

// 分类：把模型 id 归到便于浏览的组，未列出的归“其它”。
const CATEGORY = {
  teddy: "角色", "cartoon-mech-pilot": "角色", "stylized-humanoid": "角色",
  tshirt: "服装", skirt: "服装", pants: "服装", dress: "服装", hoodie: "服装",
  "sports-car": "载具",
  "hard-surface-kit": "硬表面",
  officechair: "家具", wineglass: "家具", "interior-room": "家具",
  tower: "建筑", pagoda: "建筑", building: "建筑", cityblock: "建筑",
  rock: "自然", mushroom: "自然", meadow: "自然", fterrain: "自然", vine: "自然",
  "terrain-island": "自然",
  "veg-tree": "植被", "veg-shrub": "植被", "veg-grass": "植被",
  "veg-conifer": "植被", "veg-palm": "植被",
  sphere: "基础", smooth: "基础", spring: "基础", gear: "基础", csg: "基础",
};
const catOf = (id) => CATEGORY[id] || "其它";

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
const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(3, 5, 4);
const fill = new THREE.DirectionalLight(0x88aaff, 0.8); fill.position.set(-4, 1, -2);
const rim = new THREE.DirectionalLight(0xffffff, 1.0); rim.position.set(0, 3, -5);
scene.add(key, fill, rim, new THREE.HemisphereLight(0x9fb8ff, 0x202028, 0.7));

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
    const c = part.color || [0.8, 0.8, 0.8];
    const mat = new THREE.MeshStandardMaterial({
      color: hasVColors ? 0xffffff : new THREE.Color(c[0], c[1], c[2]),
      vertexColors: hasVColors, roughness: 0.62, metalness: 0.05,
    });
    root.add(new THREE.Mesh(geo, mat));
  }
  scene.add(root);

  // 居中 + 框定相机到包围盒。
  const bbox = new THREE.Box3().setFromObject(root);
  const center = new THREE.Vector3(); bbox.getCenter(center);
  const size = new THREE.Vector3(); bbox.getSize(size);
  root.position.set(-center.x, -center.y, -center.z);
  const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
  const dist = radius / Math.tan((camera.fov * Math.PI/180) / 2) * 1.5;
  camera.position.set(dist * 0.7, dist * 0.55, dist * 0.9);
  camera.lookAt(0, 0, 0);

  renderer.render(scene, camera);
  const url = canvas.toDataURL("image/png");

  // 清理本次的几何/材质，避免 GPU 泄漏。
  scene.remove(root);
  root.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return { url, verts, tris };
}

// ---- 构建卡片网格 + 搜索 + 分类过滤 ----
const grid = document.getElementById("grid");
const countEl = document.getElementById("count");
const catsEl = document.getElementById("cats");
const searchEl = document.getElementById("search");

const entries = Object.entries(PROC_MODELS).map(([id, model]) => ({ id, model, cat: catOf(id) }));
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
  card.innerHTML =
    `<div class="thumb"><div class="spin"></div></div>` +
    `<div class="meta"><span class="name">${e.model.name}</span>` +
    `<span class="sub">${e.cat} · ${e.id}</span></div>`;
  card.onclick = () => { location.href = `/web/index.html?model=${encodeURIComponent(e.id)}`; };
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

// 逐个烘缩略图（顺序执行，避免同时占满 GPU；让出主线程保持 UI 响应）。
(async () => {
  for (const { card, model } of cards) {
    const thumb = card.querySelector(".thumb");
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
