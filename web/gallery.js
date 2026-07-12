/**
 * Meshova 模型库 — 程序化模型卡片网格。
 *
 * 复用与 viewer/CLI 同一套 /dist 几何库：为每个 PROC_MODEL 用默认参数
 * build() 一次，离屏渲染一张缩略图烘成 dataURL 放进卡片。点击卡片跳转到
 * index.html?model=<id> 进入单模型预览。
 */
import * as THREE from "three";
import { PROC_MODELS, defaultParams } from "/web/procmodels.js?v=pcgriver1";
import { isGalleryModelVisible } from "/web/model-visibility.js?v=howtos1";
import { createRankedModelLibrary } from "/web/model-ranking.js?v=aesthetic2";
import { catOf, normalizeModelName } from "/web/gallery-categories.js?v=usecat4";
import {
  bakeMaterial,
  bakeSurface,
  ALL_MATERIAL_NAMES,
  MATERIAL_USE_CATEGORIES,
} from "/web/materials.js?v=usecat4";

// 材质条目：与模型同库展示，用方块缩略图；点击跳 matlab.html 单材质渲染器。
const galleryMaterialNames = new Set(ALL_MATERIAL_NAMES);
const MATERIAL_CATS = MATERIAL_USE_CATEGORIES
  .map((category) => ({
    ...category,
    names: category.names.filter((name) => galleryMaterialNames.has(name)),
  }))
  .filter((category) => category.names.length > 0);

function outUrl(path) {
  const normalized = String(path || "").replace(/^\/+/, "");
  return new URL(`../out/${normalized}`, import.meta.url).href;
}

function isGeneratedLibraryEntry(m) {
  if (!m || !m.id || !m.file || PROC_MODELS[m.id] || !isGalleryModelVisible(m.id)) return false;
  const id = String(m.id);
  return m.category === "meshova" || m.category === "BlenderHowtos复刻" || m.category === "HoudiniHowtos复刻" || id.startsWith("blender-howtos-") || id.startsWith("houdini-howtos") || id.startsWith("speedtree-") || id.startsWith("terrain-") || id.startsWith("veg-") || id.startsWith("mech-") || id.startsWith("rt-") || id.startsWith("ruin-") || m.category === "地形" || m.category === "植被" || m.category === "机械" || m.category === "建筑" || m.category === "程序工作流";
}

async function loadGeneratedEntries() {
  try {
    const res = await fetch(outUrl("models.json"), { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    const models = Array.isArray(data.models) ? data.models : [];
    return models
      .filter(isGeneratedLibraryEntry)
      .map((m) => ({
        id: m.id,
        model: {
          name: normalizeModelName(m.name || m.id, m.id),
          assetMeta: {
            description: m.description || "",
            tags: Array.isArray(m.tags) ? m.tags : [],
            capabilities: Array.isArray(m.capabilities) ? m.capabilities : [],
            materialClasses: Array.isArray(m.materialClasses) ? m.materialClasses : [],
            dimensions: m.dimensions || null,
            source: m.source || "generated",
          },
        },
        cat: catOf(m.id, m),
        generated: true,
        file: m.file,
        // 生成/最近修改时间：服务端已按 .json 文件 mtime 注入兜底。
        updatedAt: m.updatedAt || m.createdAt || null,
      }));
  } catch {
    return [];
  }
}

function generatedThumbCandidates(entry) {
  const base = [
    outUrl(`shots/${entry.id}-persp.png`),
    outUrl(`shots/${entry.id}-front.png`),
    outUrl(`shots/${entry.id}-side.png`),
    outUrl(`shots/${entry.id}-top.png`),
  ];
  if (entry.id.startsWith("terrain-")) {
    return [
      outUrl(`shots/${entry.id}-orbit35.png`),
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
// renderer 懒初始化，避免 WebGL/GPU 初始化失败时整页模型库空白。
const THUMB = 360;
let canvas = null;
let renderer = null;
let scene = null;
let camera = null;
let renderContext = null;
let renderContextError = null;
const thumbCameraDir = new THREE.Vector3(0.7, 0.55, 0.9).normalize();
// Sketchfab 风格浅色影棚背景：中心亮、四周略深的径向渐变，模型像摆在展台上。
function makeStudioBackground() {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 48;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 16, 4, 32, 24, 46);
  grad.addColorStop(0, "#fafafa");
  grad.addColorStop(0.68, "#e2e2e2");
  grad.addColorStop(1, "#d0d0d0");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 48);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 程序化渐变天空 IBL：材质方块的金属/粗糙反射才正确（无外部 HDR）。
function makeEnv(activeRenderer) {
  const pmrem = new THREE.PMREMGenerator(activeRenderer);
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

function getRenderContext() {
  if (renderContext) return renderContext;
  if (renderContextError) throw renderContextError;
  try {
    canvas = document.createElement("canvas");
    canvas.width = THUMB;
    canvas.height = THUMB * 0.75;
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      reversedDepthBuffer: true,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(canvas.width, canvas.height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    scene = new THREE.Scene();
    scene.background = makeStudioBackground();
    camera = new THREE.PerspectiveCamera(35, canvas.width / canvas.height, 0.01, 100);
    // 浅色影棚需要更亮的补光，避免模型在浅底上偏暗、发灰。
    const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(3, 5, 4);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 1.1); fill.position.set(-4, 1, -2);
    const rim = new THREE.DirectionalLight(0xffffff, 1.2); rim.position.set(0, 3, -5);
    scene.add(key, fill, rim, new THREE.HemisphereLight(0xffffff, 0xcfcfcf, 1.0));
    scene.environment = makeEnv(renderer);
    renderContext = { canvas, renderer, scene, camera };
    return renderContext;
  } catch (err) {
    renderContextError = err instanceof Error ? err : new Error(String(err));
    throw renderContextError;
  }
}

// 材质缩略图用的方块（第二套 uv 供 aoMap）。
const matCubeGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4, 4, 4, 4);
matCubeGeo.setAttribute("uv2", matCubeGeo.getAttribute("uv"));

// 为一个材质名渲染方块缩略图，返回 dataURL。
function renderMaterialThumb(name) {
  getRenderContext();
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
const surfaceMaterialCache = new Map();
const SURFACE_THUMB_SIZE = 96;

function resolveTexture(path) {
  if (!path) return null;
  if (/^(https?:)?\/\//i.test(path)) return path;
  if (path.startsWith("/out/")) return outUrl(path.slice(5));
  if (path.startsWith("/")) return path;
  return outUrl(path);
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
  const t = part.textures;
  let mat = null;
  if (part.surface && !t) {
    const cacheKey = JSON.stringify([part.surface, c]);
    let cached = surfaceMaterialCache.get(cacheKey);
    if (cached === undefined) {
      cached = bakeSurface(part.surface, SURFACE_THUMB_SIZE, c) || null;
      surfaceMaterialCache.set(cacheKey, cached);
    }
    if (cached) mat = cached.clone();
  }
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color: hasVColors ? 0xffffff : new THREE.Color(c[0], c[1], c[2]),
      roughness: 0.62,
      metalness: 0.05,
    });
  }
  mat.vertexColors = hasVColors;
  if (hasVColors) mat.color.setRGB(1, 1, 1);
  if (part.doubleSided) mat.side = THREE.DoubleSide;
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
  getRenderContext();
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

// 建一个 proc 模型的 three 场景 root（不渲染），返回 { root, verts, tris, parts }。
async function buildProcRoot(model) {
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
    mat.side = THREE.DoubleSide;
    root.add(new THREE.Mesh(geo, mat));
  }
  return { root, verts, tris, parts: parts.length };
}

function disposeRoot(root) {
  if (scene) scene.remove(root);
  root.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
}

// 为一个模型渲染缩略图，返回 { url, verts, tris, parts }。
async function renderThumb(model) {
  getRenderContext();
  const { root, verts, tris, parts } = await buildProcRoot(model);
  scene.add(root);
  frameRoot(root);
  renderer.render(scene, camera);
  const url = canvas.toDataURL("image/png");
  disposeRoot(root);
  return { url, verts, tris, parts };
}

// 悬停转盘：绕 Y 轴环绕相机渲染 count 帧，返回 dataURL 数组。root 已建好并加入场景。
// frameRoot 先把相机框到包围盒，随后绕中心旋转相机位置。
function renderTurntableFromRoot(root, count) {
  getRenderContext();
  frameRoot(root); // 居中到原点、相机 lookAt(0,0,0)
  const base = camera.position.clone();
  const radius = Math.hypot(base.x, base.z);
  const y = base.y;
  const startAngle = Math.atan2(base.x, base.z);
  const frames = [];
  for (let i = 0; i < count; i++) {
    const a = startAngle + (i / count) * Math.PI * 2;
    camera.position.set(Math.sin(a) * radius, y, Math.cos(a) * radius);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    frames.push(canvas.toDataURL("image/png"));
  }
  return frames;
}

// 建一个 ViewerModel 的 three 场景 root（不渲染），返回 { root, verts, tris, parts }。
function buildViewerModelRoot(viewerModel) {
  const root = new THREE.Group();
  let verts = 0, tris = 0;
  const parts = Array.isArray(viewerModel) ? viewerModel : (viewerModel?.parts || []);
  let partCount = 0;
  for (const part of parts) {
    const geo = viewerPartToGeo(part);
    if (!geo) continue;
    partCount++;
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
  return { root, verts, tris, parts: partCount };
}

function renderViewerModelThumb(viewerModel) {
  getRenderContext();
  const { root, verts, tris, parts } = buildViewerModelRoot(viewerModel);
  scene.add(root);
  frameRoot(root);
  renderer.render(scene, camera);
  const url = canvas.toDataURL("image/png");
  disposeRoot(root);
  return { url, verts, tris, parts };
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

function galleryPageUrl(webPage, rootPage = `web/${webPage}`) {
  const galleryLivesInWebDir = location.pathname.endsWith("web/gallery.html");
  return galleryLivesInWebDir ? `./${webPage}` : `./${rootPage}`;
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
grid.innerHTML = "";

const generatedEntries = await loadGeneratedEntries();
const procEntries = Object.entries(PROC_MODELS)
  .filter(([id]) => isGalleryModelVisible(id))
  .map(([id, model]) => ({
    id,
    model: { ...model, name: normalizeModelName(model.name || id, id) },
    cat: catOf(id, model),
    generated: false,
  }));
// 材质条目：按实际用途展平，标记 isMaterial，与模型同库排在末尾。
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

// 专用实时展示页：无法走普通 ProcModel 静态网格管线，例如 GPU 实例、
// 自定义顶点动画、动态仿真。仍在模型库统一展示，点击后加载专用渲染器。
const showcaseEntries = [
  {
    id: "biome-grassland",
    model: { name: "程序化草地生态" },
    cat: "植被",
    specialUrl: "biome-grassland.html",
    thumbCandidates: [new URL("./assets/biome-grassland.png", import.meta.url).href],
    stats: { parts: 7, tris: 840000, verts: 910000 },
    subtitle: "生态掩膜 · 6 层实例散布",
  },
  {
    id: "vertex-grass",
    model: { name: "GPU 实例化程序草地" },
    cat: "植被",
    specialUrl: "vertex-grass.html",
    thumbCandidates: [new URL("./assets/vertex-grass.png", import.meta.url).href],
    stats: { parts: 2, tris: 700000, verts: 822801 },
    subtitle: "50k 实例 · 2 Draw Calls",
  },
  {
    id: "shallow-water",
    model: { name: "峡谷浅水方程" },
    cat: "地形",
    specialUrl: "shallow-water.html",
    thumbCandidates: [new URL("./assets/shallow-water-evolved.png", import.meta.url).href],
    stats: { parts: 2, tris: 36100, verts: 18432 },
    subtitle: "SWE 求解 · 动态洪水与障碍绕流",
    title: "96 × 96 浅水网格 · CFL 自适应子步 · 质量守恒 · 动态湿干边界",
  },
];

// 每批模型进入库后自动重新排序：人工校准头部作品，长尾按色彩、场景完整度、
// 曲线/有机形态、构图层次和类型丰富度评分。材质仍排在模型之后。
const modelLibrary = createRankedModelLibrary();
modelLibrary.addMany(procEntries);
modelLibrary.addMany(showcaseEntries);
modelLibrary.addMany(generatedEntries);
modelLibrary.addMany(materialEntries);
const entries = modelLibrary.entries;
let activeCat = "全部";
let activeSemanticTag = "";
let query = "";

// ---- Sketchfab 风格下拉 mega 菜单：左侧来源列 + 右侧主题分组网格 ----
// 每个分类计数（含当前 entries 里实际出现的分类）。
const catCount = {};
for (const e of entries) catCount[e.cat] = (catCount[e.cat] || 0) + 1;
const presentCats = new Set(Object.keys(catCount));

// 分类图标：统一单色线性 SVG（24 viewBox, stroke=currentColor），替代 emoji。
// 一套语义图标，多个分类复用，风格一致、跨系统渲染稳定。
const ICON_PATHS = {
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  person: "M12 11a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4zM5.5 19.5a6.5 6.5 0 0113 0",
  shirt: "M8.5 4L4 7l2.2 2.8L8 8.9V20h8V8.9l1.8.9L20 7l-4.5-3a3.5 3.5 0 01-7 0z",
  car: "M3 13l2-5.2A2 2 0 016.9 6.5h10.2A2 2 0 0119 7.8L21 13v4h-2.2a2 2 0 01-3.6 0H8.8a2 2 0 01-3.6 0H3v-4zM3 13h18",
  sofa: "M4 11V9a2 2 0 012-2h12a2 2 0 012 2v2M4 11a2 2 0 00-2 2v4h20v-4a2 2 0 00-2-2 2 2 0 00-2 2v1H6v-1a2 2 0 00-2-2zM6 21v-2M18 21v-2",
  building: "M5 21V4h9v17M14 9h5v12M8 8h3M8 12h3M8 16h3M17 13h1M17 17h1",
  bridge: "M2 16c5 0 5-6 10-6s5 6 10 6M4 16V9M20 16V9M12 16v-4M2 9h20",
  city: "M4 21V10l4-2 4 2v11M12 21V5l4-2 4 2v16M6 13h2M6 17h2M14 9h2M14 13h2M14 17h2",
  leaf: "M5 19C5 10 12 5 19 5c0 9-7 14-14 14zM8 16c3-3 6-5 9-6",
  mountain: "M3 18l6-9 3.5 5 3-4 5.5 8z",
  tree: "M12 21v-4M12 17c-3 0-5-1.8-5-4 0-1 .5-1.9 1.3-2.5C8 9 8.5 6.5 12 4c3.5 2.5 4 5 3.7 6.5.8.6 1.3 1.5 1.3 2.5 0 2.2-2 4-5 4z",
  robot: "M9 4V6M15 4V6M6 7h12v9H6zM4 10v3M20 10v3M9 20v-4M15 20v-4M9.5 11h.01M14.5 11h.01",
  cube: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 3v18M4 7.5l8 4.5 8-4.5",
  tower: "M9 21V8l3-5 3 5v13M9 12h6M9 16h6",
  sparkles: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18 15l.7 2L21 18l-2.3.8L18 21",
  dots: "M6 12h.01M12 12h.01M18 12h.01",
  palette: "M12 3a9 9 0 000 18c1 0 1.6-.9 1.6-1.7 0-.5-.2-.8-.5-1.2-.3-.3-.5-.7-.5-1.1 0-.8.7-1.5 1.5-1.5H16a5 5 0 005-5c0-4.5-4-7.5-9-7.5zM7.5 12h.01M10 8h.01M15 8h.01",
  swatch: "M4 5h7v14H4zM11 8.5l5.5-1.6 3.8 12.9-6.3 1.9M7 16.5h.01",
  sliders: "M4 8h9M17 8h3M4 16h3M11 16h9M15 6v4M8 14v4",
  triangle: "M12 4L3 19h18z",
  vertex: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 3v18M4 7.5l8 4.5 8-4.5",
  layers: "M12 3l9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5",
  rotate: "M21 12a9 9 0 11-2.6-6.4M21 4v4h-4",
};
const CAT_TO_ICON = {
  角色: "person", 生物: "leaf", 服装: "shirt", 载具: "car", 家具: "sofa", 家电: "cube",
  卫浴设施: "cube", 灯具: "dots", 机械: "robot", 工具与设备: "sliders", 管线与机电: "bridge", 道具与装饰: "palette",
  建筑构件: "building", 建筑: "building", 室内空间: "sofa", 城市与聚落: "city",
  道路与基建: "bridge", 地图与关卡: "map", 地形: "mountain", 水体: "dots",
  植被: "tree", 岩石与自然物: "mountain", 环境场景: "layers", 技术演示: "cube",
  "金属与工业": "sliders", "木材与竹材": "swatch", "地面与道路": "bridge",
  "墙面与建筑饰面": "building", "屋顶与瓦片": "building", "岩石与自然地表": "mountain",
  "植被与有机表面": "leaf", "织物、皮革与软装": "swatch", "玻璃、冰与透明材质": "cube",
  "塑料与包装": "cube", 建筑构件: "building", 器物与装饰: "palette",
  "角色与生物表面": "person", 食品: "dots",
};
function svgIcon(key) {
  const d = ICON_PATHS[key] || ICON_PATHS.dots;
  return `<svg class="ic-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}
const iconFor = (c) => svgIcon(CAT_TO_ICON[c] || "dots");

// 主题分组：把分类归到便于浏览的大组，只显示实际存在的分类。
const MATERIAL_LABELS = MATERIAL_CATS.map((c) => c.label);
const CAT_GROUPS = [
  { label: "角色 & 生物", cats: ["角色", "生物", "服装"] },
  { label: "载具 & 设备", cats: ["载具", "机械", "工具与设备", "管线与机电"] },
  { label: "室内 & 道具", cats: ["家具", "家电", "卫浴设施", "灯具", "道具与装饰"] },
  { label: "建筑 & 城市", cats: ["建筑构件", "建筑", "室内空间", "城市与聚落", "道路与基建", "地图与关卡"] },
  { label: "自然 & 环境", cats: ["地形", "水体", "植被", "岩石与自然物", "环境场景"] },
  { label: "技术", cats: ["技术演示"] },
  { label: "材质", cats: MATERIAL_LABELS },
];

// 为每个模型建卡片骨架，缩略图后台逐个填充。
const cards = entries.map((e) => {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.name = e.model.name;
  card.dataset.id = e.id;
  card.dataset.cat = e.cat;
  card.dataset.specialUrl = e.specialUrl || "";
  card.dataset.generated = e.generated ? "true" : "false";
  card.dataset.file = e.file || "";
  const semantic = semanticMeta(e.model);
  card.dataset.semantic = semantic.searchText;
  // 骨架屏：缩略图区先显示等尺寸的占位块（含微光扫过），避免加载时布局跳动。
  card.classList.add("loading");
  card.innerHTML =
    `<div class="thumb"><div class="skel"></div></div>` +
    `<div class="meta"><span class="name">${e.model.name}</span>` +
    `<span class="sub">${subHtml(e.cat)}</span>${semanticTagsHtml(semantic.tags)}</div>`;
  card.querySelectorAll(".asset-tag").forEach((tagEl) => {
    tagEl.onclick = (event) => {
      event.stopPropagation();
      selectSemanticTag(tagEl.dataset.tag || "");
    };
  });
  card.onclick = () => {
    if (e.specialUrl) {
      openModal({
        url: galleryPageUrl(e.specialUrl),
        title: e.model.name,
        sub: `${e.cat} · ${e.id}`,
      });
      return;
    }
    if (e.isMaterial) {
      openModal({
        url: `${galleryPageUrl("matlab.html")}?cat=${encodeURIComponent(e.matCat)}&mat=${encodeURIComponent(e.matName)}`,
        title: e.model.name,
        sub: e.cat,
      });
      return;
    }
    const modelParam = e.generated ? (e.file || `${e.id}.json`) : e.id;
    openModal({
      url: `${galleryPageUrl("index.html", "viewer.html")}?model=${encodeURIComponent(modelParam)}`,
      title: e.model.name,
      sub: [e.cat, ...semantic.tags.slice(0, 3)].join(" · "),
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
      (!activeSemanticTag || semanticMeta(model).tags.includes(activeSemanticTag)) &&
      (!q || model.name.toLowerCase().includes(q) || id.includes(q) || cat.toLowerCase().includes(q) || card.dataset.semantic.includes(q));
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
  { key: "全部", ic: "grid", label: "全部", count: () => cards.length },
  { key: "__models", ic: "cube", label: "仅模型", count: () => cards.filter((c) => !c.isMaterial).length },
  { key: "__materials", ic: "palette", label: "仅材质", count: () => cards.filter((c) => c.isMaterial).length },
];
for (const s of SOURCES) {
  const el = document.createElement("div");
  el.className = "src" + (s.key === activeCat ? " on" : "");
  el.dataset.key = s.key;
  el.innerHTML = `<span class="ic">${svgIcon(s.ic)}</span><span>${s.label}</span><span class="n">${s.count()}</span>`;
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
  activeSemanticTag = "";
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

function selectSemanticTag(tag) {
  activeSemanticTag = tag;
  activeCat = "全部";
  sideEl.querySelectorAll(".src").forEach((el) => el.classList.toggle("on", el.dataset.key === "全部"));
  mainEl.querySelectorAll(".it").forEach((el) => el.classList.remove("on"));
  toggleLabelEl.textContent = "全部分类";
  activeTagEl.classList.toggle("on", !!tag);
  activeTagLabelEl.textContent = tag ? `标签：${tag}` : "";
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
activeTagClearEl.onclick = (ev) => {
  ev.stopPropagation();
  if (activeSemanticTag) selectSemanticTag("");
  else selectCat("全部");
};

searchEl.oninput = () => { query = searchEl.value; applyFilter(); };
applyFilter();

// 数字紧凑化：1234 -> 1.2k，减少角标占位。
function compactNum(n) {
  n = Math.round(n || 0);
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}
// 副标题：分类图标 + 分类名（+可选后缀），底部信息栏图标化。
function subHtml(cat, suffix) {
  const tail = suffix ? `<span class="sub-x">${suffix}</span>` : "";
  return `<span class="sub-ic">${iconFor(cat)}</span><span class="sub-t">${cat}</span>${tail}`;
}

function semanticMeta(model) {
  const meta = model?.assetMeta || {};
  const tags = [...new Set([
    ...(Array.isArray(meta.tags) ? meta.tags : []),
    ...(Array.isArray(meta.capabilities) ? meta.capabilities : []),
  ].map(String).filter(Boolean))];
  const materials = Array.isArray(meta.materialClasses) ? meta.materialClasses.map(String) : [];
  return {
    tags,
    searchText: [meta.description || "", ...tags, ...materials, meta.source || ""].join(" ").toLowerCase(),
  };
}

function semanticTagsHtml(tags) {
  if (!tags.length) return "";
  return `<span class="asset-tags">${tags.slice(0, 3).map((tag) =>
    `<button class="asset-tag" data-tag="${escapeHtml(tag)}" title="按标签筛选">${escapeHtml(tag)}</button>`
  ).join("")}</span>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
}

// 统计信息条：图标化的 面/顶点/件，默认淡出，hover 缩略图才浮现（专业感来自克制）。
function statsBadgeHtml({ parts, tris, verts }) {
  const st = [];
  if (tris) st.push(`<span class="st">${svgIcon("triangle")}${compactNum(tris)}</span>`);
  if (verts) st.push(`<span class="st">${svgIcon("vertex")}${compactNum(verts)}</span>`);
  if (parts) st.push(`<span class="st">${svgIcon("layers")}${parts}</span>`);
  if (!st.length) return "";
  return `<div class="stats">${st.join("")}</div>`;
}

function fallbackThumbHtml(entry, message = "暂无缩略图") {
  const name = entry?.model?.name || entry?.id || "模型";
  return `<div class="fallback">${iconFor(entry?.cat || "基础")}<span class="t">${name}</span><span class="m">${message}</span></div>`;
}

// ---- 悬停转盘：hover 时懒生成一组 360° 帧，循环切换 <img> src ----
const TURN_FRAMES = 24;     // 环绕帧数
const TURN_INTERVAL = 90;   // 每帧毫秒
let turnTimer = null;
let turnActiveCard = null;

function stopTurntable() {
  if (turnTimer) { clearInterval(turnTimer); turnTimer = null; }
  if (turnActiveCard) {
    const img = turnActiveCard.card.querySelector(".thumb img");
    if (img && turnActiveCard.thumbUrl) img.src = turnActiveCard.thumbUrl; // 复位到静态封面
    turnActiveCard = null;
  }
}

// 懒生成一个 entry 的转盘帧（材质卡不做，无 build 来源的卡兜底跳过）。
async function ensureTurnFrames(entry) {
  if (entry.turnFrames || entry.turnFailed || entry.isMaterial) return entry.turnFrames || null;
  try {
    let build;
    if (entry.generated) {
      const res = await fetch(outUrl(entry.file), { cache: "no-store" });
      if (!res.ok) throw new Error("no model");
      build = buildViewerModelRoot(await res.json());
    } else {
      build = await buildProcRoot(entry.model);
    }
    scene.add(build.root);
    entry.turnFrames = renderTurntableFromRoot(build.root, TURN_FRAMES);
    disposeRoot(build.root);
  } catch {
    entry.turnFailed = true;
    return null;
  }
  return entry.turnFrames;
}

async function startTurntable(entry) {
  const img = entry.card.querySelector(".thumb img");
  if (!img) return;
  const frames = await ensureTurnFrames(entry);
  // hover 期间可能已移出：只有当前仍悬停在此卡才播放
  if (!frames || turnActiveCard || !entry.card.matches(":hover")) return;
  turnActiveCard = entry;
  let i = 0;
  turnTimer = setInterval(() => {
    i = (i + 1) % frames.length;
    img.src = frames[i];
  }, TURN_INTERVAL);
}

// 给一张卡片绑定 hover 转盘（渲染完成、有 img 后调用）。
function wireTurntable(entry) {
  const thumb = entry.card.querySelector(".thumb");
  if (!thumb || entry.isMaterial) return;
  entry.card.addEventListener("mouseenter", () => { startTurntable(entry); });
  entry.card.addEventListener("mouseleave", () => { stopTurntable(); });
}

async function fillGeneratedCard(entry) {
  const thumb = entry.card.querySelector(".thumb");
  try {
    const res = await fetch(outUrl(entry.file), { cache: "no-store" });
    if (!res.ok) throw new Error("模型文件不存在");
    const model = await res.json();
    let tris = Math.round(model?.meta?.tris ?? 0);
    let verts = Math.round(model?.meta?.verts ?? 0);
    // 统一背景：优先用 gallery 深色离屏渲染，跟其余卡片一致。
    // 离线截图（/out/shots/*.png）背景是 viewer 的 env 天空，色调不一致，
    // 只在离屏渲染失败（几何缺失等）时兜底。
    let thumbUrl = null;
    let parts = Math.round(model?.meta?.parts ?? (Array.isArray(model?.parts) ? model.parts.length : 0));
    try {
      const rendered = renderViewerModelThumb(model);
      thumbUrl = rendered.url;
      if (!tris) tris = Math.round(rendered.tris);
      if (!verts) verts = Math.round(rendered.verts);
      if (!parts) parts = rendered.parts;
    } catch {
      thumbUrl = await firstLoadableImage(generatedThumbCandidates(entry));
    }
    if (!thumbUrl) throw new Error("无缩略图");
    entry.thumbUrl = thumbUrl;
    entry.stats = { parts, tris, verts };
    thumb.innerHTML =
      `<img src="${thumbUrl}" alt="${entry.model.name}" />` +
      statsBadgeHtml(entry.stats) +
      `<span class="spinhint">${svgIcon("rotate")}环视</span>`;
    // 副标题：分类图标 + 分类名，保持卡面克制；详细统计交给 hover 浮层。
    const meta = model?.meta || {};
    let suffix = "";
    if (entry.id.startsWith("terrain-") && typeof meta.waterCoverage === "number") {
      suffix = `水域 ${Math.round(meta.waterCoverage * 100)}%`;
    }
    entry.card.querySelector(".sub").innerHTML = subHtml(entry.cat, suffix);
    // 完整统计放进 title 悬浮提示，方便需要精确数值时查看。
    const full = [`${tris} 面`, verts && `${verts} 顶点`, parts && `${parts} 件`].filter(Boolean).join(" · ");
    entry.card.title = meta.description ? `${meta.description}\n${full}` : full;
    wireTurntable(entry);
  } catch (e) {
    thumb.innerHTML = fallbackThumbHtml(entry, "暂无缩略图");
    entry.card.title = e?.message || String(e);
  }
}

async function fillShowcaseCard(entry) {
  const thumb = entry.card.querySelector(".thumb");
  const thumbUrl = await firstLoadableImage(entry.thumbCandidates || []);
  if (!thumbUrl) {
    thumb.innerHTML = fallbackThumbHtml(entry, "打开查看实时 GPU 预览");
    return;
  }
  entry.thumbUrl = thumbUrl;
  thumb.innerHTML =
    `<img src="${thumbUrl}" alt="${entry.model.name}" />` +
    statsBadgeHtml(entry.stats || {});
  entry.card.querySelector(".sub").innerHTML = subHtml(entry.cat, entry.subtitle);
  entry.card.title = entry.title || entry.subtitle || "打开实时程序化预览";
}

// 单张缩略图渲染：按 entry 类型分派。材质方块最快，生成模型优先用离线截图，proc 模型运行时 build。
async function renderOne(entry) {
  const { card, model } = entry;
  const thumb = card.querySelector(".thumb");
  if (entry.specialUrl) {
    await fillShowcaseCard(entry);
    return;
  }
  if (entry.isMaterial) {
    try {
      const url = renderMaterialThumb(entry.matName);
      thumb.innerHTML = `<img src="${url}" alt="${entry.model.name}" />`;
    } catch (e) {
      thumb.innerHTML = fallbackThumbHtml(entry, "需要 WebGL 预览");
      card.title = e?.message || String(e);
    }
    return;
  }
  if (entry.generated) {
    await fillGeneratedCard(entry);
    return;
  }
  try {
    const { url, verts, tris, parts } = await renderThumb(model);
    entry.thumbUrl = url;
    entry.stats = { parts, tris, verts };
    thumb.innerHTML =
      `<img src="${url}" alt="${model.name}" />` +
      statsBadgeHtml(entry.stats) +
      `<span class="spinhint">${svgIcon("rotate")}环视</span>`;
    // 副标题保持克制，完整统计进 title。
    const full = [`${tris} 面`, verts && `${verts} 顶点`, parts && `${parts} 件`].filter(Boolean).join(" · ");
    card.title = full;
    wireTurntable(entry);
  } catch (e) {
    thumb.innerHTML = fallbackThumbHtml(entry, "需要 WebGL 预览");
    card.title = e?.message || String(e);
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
    entry.card.classList.remove("loading"); // 渲染完成，撤下骨架
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
