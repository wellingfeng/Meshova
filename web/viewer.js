import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { TAARenderPass } from "three/addons/postprocessing/TAARenderPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import { bakeMaterial, bakeSurface, bakeWaterSurface, bakeSurfaceByName, isSurface, SURFACE_NAMES, SURFACE_LABEL_MAP, PRESET_NAMES, BUILDER_NAMES, SURFACE_PARAM_SCHEMA, defaultSurfaceParams } from "/web/materials.js?v=water7";
import {
  PRESET_PARAM_SCHEMA,
  defaultMatParams,
  evalPlan,
  describePlan,
  planNodeStats,
  toViewerModel,
  makeMesh,
  recomputeNormals,
  semanticModelFromParts,
  deformSemanticMesh,
  semanticModelToNamedParts,
  inferSemanticPartLabels,
  semanticSplitMesh,
  splitMeshByAiMasks,
  canonicalizeHumanoidPartsToTPose,
  critique,
  formatCritique,
} from "/dist/index.js?v=water7";
import { PROC_MODELS, defaultParams, makeSpeedTreeLibraryModel } from "/web/procmodels.js?v=water7";

const stage = document.getElementById("stage");
const errEl = document.getElementById("err");
const hud = document.getElementById("hud");
const scriptPanel = document.getElementById("script-panel");
const scriptCodeEl = document.getElementById("script-code");
const scriptToggleBtn = document.getElementById("script-toggle");
const scriptCopyBtn = document.getElementById("script-copy");
const scriptCloseBtn = document.getElementById("script-close");
const loadingEl = document.getElementById("loading");
const loadingTitleEl = document.getElementById("loading-title");
const loadingDetailEl = document.getElementById("loading-detail");
const loadingFillEl = loadingEl?.querySelector(".loading-fill");
const optRunBtn = document.getElementById("opt-run");
const optModeSel = document.getElementById("opt-mode");
const optStatsEl = document.getElementById("opt-stats");
const optCandidatesEl = document.getElementById("opt-candidates");

function fail(msg) {
  errEl.style.display = "flex";
  errEl.textContent = msg;
}

let activeLoadingToken = 0;
let loadingHideTimer = 0;
let loadingShownAt = 0;
let loadingStatusTimer = 0;
let loadingBaseDetail = "";

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function showGenerationLoading(detail = "执行程序化建模脚本", title = "生成 3D 模型") {
  if (!loadingEl) return 0;
  const token = ++activeLoadingToken;
  clearTimeout(loadingHideTimer);
  clearInterval(loadingStatusTimer);
  loadingShownAt = performance.now();
  loadingBaseDetail = detail;
  loadingFillEl?.classList.remove("determinate");
  loadingFillEl?.style.removeProperty("--loading-progress");
  loadingEl.removeAttribute("aria-valuenow");
  if (loadingTitleEl) loadingTitleEl.textContent = title;
  if (loadingDetailEl) loadingDetailEl.textContent = detail;
  stage.classList.add("loading");
  loadingEl.classList.add("show");
  loadingEl.setAttribute("aria-hidden", "false");
  loadingStatusTimer = setInterval(() => {
    if (token !== activeLoadingToken || !loadingDetailEl) return;
    const seconds = Math.max(1, Math.floor((performance.now() - loadingShownAt) / 1000));
    loadingDetailEl.textContent = `${loadingBaseDetail} · 已等待 ${seconds} 秒 · 页面仍可响应`;
  }, 1000);
  await nextPaint();
  return token;
}

function updateGenerationLoading(detail, progress = null) {
  if (!loadingEl?.classList.contains("show")) return;
  loadingBaseDetail = detail;
  const seconds = Math.max(1, Math.floor((performance.now() - loadingShownAt) / 1000));
  if (loadingDetailEl) loadingDetailEl.textContent = `${detail} · 已等待 ${seconds} 秒 · 页面仍可响应`;
  if (!Number.isFinite(progress)) {
    loadingFillEl?.classList.remove("determinate");
    loadingEl.removeAttribute("aria-valuenow");
    return;
  }
  const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
  loadingFillEl?.classList.add("determinate");
  loadingFillEl?.style.setProperty("--loading-progress", `${percent}%`);
  loadingEl.setAttribute("aria-valuenow", String(percent));
}

function hideGenerationLoading(token) {
  if (!loadingEl || token !== activeLoadingToken) return;
  const elapsed = performance.now() - loadingShownAt;
  const delay = Math.max(0, 180 - elapsed);
  clearTimeout(loadingHideTimer);
  loadingHideTimer = setTimeout(() => {
    if (token !== activeLoadingToken) return;
    clearInterval(loadingStatusTimer);
    stage.classList.remove("loading");
    loadingEl.classList.remove("show");
    loadingEl.setAttribute("aria-hidden", "true");
  }, delay);
}

function forceHideGenerationLoading() {
  activeLoadingToken++;
  clearTimeout(loadingHideTimer);
  clearInterval(loadingStatusTimer);
  stage.classList.remove("loading");
  if (loadingEl) {
    loadingEl.classList.remove("show");
    loadingEl.setAttribute("aria-hidden", "true");
  }
}

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();

// ---- Procedural HDR environments (IBL) ----
// Analytic skies baked into FLOAT equirect textures: an HDR sun disk (many
// times brighter than the sky) + a zenith->horizon->ground gradient. PMREM
// prefilters each into a roughness-aware environment map. Everything is computed
// in code — no .hdr files — so we ship multiple lighting moods (studio/sunset/
// overcast/night) and still honor Meshova's "fully procedural" rule.
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();

// Each preset describes a sky in linear-HDR radiance plus the sun it implies.
// `sunDir` drives both the reflected sun in the IBL and the key light, so the
// specular hot-spot and the cast shadow always agree.
const ENV_PRESETS = {
  studio: {
    label: "影棚日光",
    sunDir: [5, 8, 6], sunColor: [1.0, 0.96, 0.86], sunIntensity: 20.0, sunRadius: 0.045, glow: 0.6,
    zenith: [0.24, 0.36, 0.62], horizon: [0.58, 0.66, 0.78], ground: [0.24, 0.22, 0.2],
    keyColor: 0xfff4e6, keyIntensity: 2.6, hemiSky: 0xbfd4ff, hemiGround: 0x202830, hemiIntensity: 0.18,
  },
  sunset: {
    label: "黄昏暖阳",
    sunDir: [7, 2.2, 4], sunColor: [1.0, 0.55, 0.28], sunIntensity: 26.0, sunRadius: 0.06, glow: 1.4,
    zenith: [0.18, 0.20, 0.40], horizon: [0.95, 0.52, 0.30], ground: [0.18, 0.12, 0.10],
    keyColor: 0xffb070, keyIntensity: 3.0, hemiSky: 0xffd0a0, hemiGround: 0x281810, hemiIntensity: 0.22,
  },
  overcast: {
    label: "阴天柔光",
    sunDir: [3, 9, 4], sunColor: [1.0, 1.0, 1.0], sunIntensity: 3.5, sunRadius: 0.18, glow: 0.4,
    zenith: [0.62, 0.66, 0.70], horizon: [0.78, 0.80, 0.82], ground: [0.34, 0.34, 0.36],
    keyColor: 0xf0f4ff, keyIntensity: 1.0, hemiSky: 0xd6dee8, hemiGround: 0x3a3e44, hemiIntensity: 0.55,
  },
  night: {
    label: "夜景冷光",
    sunDir: [-4, 6, -5], sunColor: [0.6, 0.72, 1.0], sunIntensity: 8.0, sunRadius: 0.05, glow: 0.5,
    zenith: [0.02, 0.03, 0.08], horizon: [0.06, 0.09, 0.16], ground: [0.02, 0.02, 0.04],
    keyColor: 0x9fb6ff, keyIntensity: 1.6, hemiSky: 0x2a3a66, hemiGround: 0x050608, hemiIntensity: 0.14,
  },
};
const ENV_NAMES = Object.keys(ENV_PRESETS);

// Mutable sun direction — lights read this so they follow the active env.
const SUN_DIR = new THREE.Vector3(5, 8, 6).normalize();

function buildEnvTexture(p) {
  const w = 512, h = 256;
  const data = new Float32Array(w * h * 4);
  const sun = new THREE.Vector3(p.sunDir[0], p.sunDir[1], p.sunDir[2]).normalize();
  const dir = new THREE.Vector3();
  for (let y = 0; y < h; y++) {
    const theta = (y / (h - 1)) * Math.PI;          // 0 top .. PI bottom
    const ct = Math.cos(theta), st = Math.sin(theta);
    const up = Math.cos(theta);                      // +1 zenith .. -1 nadir
    for (let x = 0; x < w; x++) {
      const phi = (x / w) * Math.PI * 2;
      dir.set(st * Math.cos(phi), ct, st * Math.sin(phi));
      let r, g, b;
      if (up >= 0) {
        const k = Math.pow(1 - up, 1.2);
        r = p.zenith[0] + (p.horizon[0] - p.zenith[0]) * k;
        g = p.zenith[1] + (p.horizon[1] - p.zenith[1]) * k;
        b = p.zenith[2] + (p.horizon[2] - p.zenith[2]) * k;
      } else {
        const k = Math.min(1, -up * 1.4);
        r = p.horizon[0] + (p.ground[0] - p.horizon[0]) * k;
        g = p.horizon[1] + (p.ground[1] - p.horizon[1]) * k;
        b = p.horizon[2] + (p.ground[2] - p.horizon[2]) * k;
      }
      const cosA = dir.dot(sun);
      const ang = Math.acos(Math.min(1, Math.max(-1, cosA)));
      if (ang < p.sunRadius) {
        r += p.sunColor[0] * p.sunIntensity;
        g += p.sunColor[1] * p.sunIntensity;
        b += p.sunColor[2] * p.sunIntensity;
      } else {
        const g0 = Math.exp(-(ang - p.sunRadius) * 22) * p.glow;
        r += p.sunColor[0] * g0;
        g += p.sunColor[1] * g0;
        b += p.sunColor[2] * g0;
      }
      const i = (y * w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 1;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

let currentEnvName = "studio";
let currentEnvRT = null;     // prefiltered PMREM target (for reflections)

// Background modes decouple what you SEE behind the model from what LIGHTS it.
// 'env' shows the (blurred) sky; 'solid'/'gradient' give the AI a clean,
// controllable backdrop for silhouette-IoU matting; 'transparent' exports a
// cutout PNG. The IBL environment stays active in every mode.
let bgMode = "env";              // env | solid | gradient | transparent
let bgColor = "#f2f2f2";         // solid color / gradient top（浅色影棚基调）
let bgColor2 = "#d4d4d4";        // gradient bottom

function applyEnvironment(name) {
  const p = ENV_PRESETS[name] || ENV_PRESETS.studio;
  currentEnvName = name;
  const equirect = buildEnvTexture(p);
  const rt = pmrem.fromEquirectangular(equirect);
  equirect.dispose();
  if (currentEnvRT) currentEnvRT.dispose();
  currentEnvRT = rt;
  scene.environment = rt.texture;
  // Sun + lights follow the env so highlights and shadows stay consistent.
  SUN_DIR.set(p.sunDir[0], p.sunDir[1], p.sunDir[2]).normalize();
  if (typeof key !== "undefined") {
    key.position.copy(SUN_DIR).multiplyScalar(12);
    key.color.setHex(p.keyColor); key.intensity = p.keyIntensity;
    hemi.color.setHex(p.hemiSky); hemi.groundColor.setHex(p.hemiGround); hemi.intensity = p.hemiIntensity;
    updateShadowCamera();
  }
  applyBackground();
  // Hair highlights track the key light direction.
  if (typeof modelRoot !== "undefined" && modelRoot) {
    modelRoot.traverse((o) => {
      const u = o.material && o.material.userData && o.material.userData.hairUniforms;
      if (u && u.uHairLightDir) u.uHairLightDir.value.copy(SUN_DIR);
    });
  }
  resetTAA();
}

// Build a tiny 2-stop vertical gradient texture for the 'gradient' background.
function makeGradientTexture(top, bottom) {
  const c = document.createElement("canvas");
  c.width = 2; c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top); g.addColorStop(1, bottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let gradientTex = null;
function applyBackground() {
  if (gradientTex) { gradientTex.dispose(); gradientTex = null; }
  if (bgMode === "transparent") {
    scene.background = null;
    renderer.setClearColor(0x000000, 0);
  } else if (bgMode === "solid") {
    scene.background = new THREE.Color(bgColor);
    renderer.setClearColor(bgColor, 1);
  } else if (bgMode === "gradient") {
    gradientTex = makeGradientTexture(bgColor, bgColor2);
    scene.background = gradientTex;
    renderer.setClearColor(0x000000, 1);
  } else {
    // env: show the prefiltered sky, softly blurred, behind the model.
    scene.background = currentEnvRT ? currentEnvRT.texture : null;
    scene.backgroundBlurriness = 0.35;
    scene.backgroundIntensity = 0.5;
    renderer.setClearColor(0x000000, 1);
  }
  resetTAA();
}

// Rotate the IBL + background around Y. Lets the user spin reflections/shadows
// to flatter a model without re-baking the sky; angle in degrees.
let envRotationDeg = 0;
function applyEnvRotation(deg) {
  envRotationDeg = deg;
  const rad = (deg * Math.PI) / 180;
  scene.environmentRotation.set(0, rad, 0);
  scene.backgroundRotation.set(0, rad, 0);
  resetTAA();
}

const camera = new THREE.PerspectiveCamera(45, stage.clientWidth / stage.clientHeight, 0.1, 200);
camera.position.set(4, 3, 6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

// Lights — IBL carries ambient + reflections; direct lights add crisp shadows
// and a rim. The key light is co-located with the HDR sun (SUN_DIR) so its
// specular highlight lines up with the reflected sun. Color/intensity are
// driven by the active environment preset via applyEnvironment().
const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x202830, 0.18);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff4e6, 2.6);
key.position.copy(SUN_DIR).multiplyScalar(12);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
key.shadow.radius = 4;
scene.add(key);
scene.add(key.target);
const fill = new THREE.DirectionalLight(0x9ec1ff, 0.3);
fill.position.set(-6, 3, -4);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 0.5);
rim.position.set(0, 4, -8);
scene.add(rim);

// Fit the directional shadow frustum to the current model's bounding sphere so
// large models stay fully shadowed and small ones keep crisp texels. Without
// this the fixed ±8 box clips big scenes (soft/missing shadows) and wastes
// shadow-map resolution on small ones.
function updateShadowCamera() {
  const r = Math.max(lastSize.x, lastSize.y, lastSize.z) * 0.5;
  const radius = Math.max(0.5, r * 1.6);   // a little margin around the model
  const dist = radius * 3;
  key.position.copy(SUN_DIR).multiplyScalar(dist);
  key.target.position.set(0, lastSize.y * 0.5, 0);
  key.target.updateMatrixWorld();
  const cam = key.shadow.camera;
  cam.left = -radius; cam.right = radius;
  cam.top = radius; cam.bottom = -radius;
  cam.near = Math.max(0.1, dist - radius * 2);
  cam.far = dist + radius * 2;
  cam.updateProjectionMatrix();
}

// 浅色主题：地面网格用淡灰线，衬浅底不突兀（Sketchfab 单模型页干净风）。
const grid = new THREE.GridHelper(20, 20, 0xc8c8c8, 0xdadada);
scene.add(grid);

// ---- Floor: three modes ----
// shadow : invisible plane that only catches the contact shadow (default).
// glossy : a smooth PBR plane that mirrors the IBL sky (cheap, no model echo).
// mirror : a planar Reflector that re-renders the scene — reflects the model
//          itself for a showroom look (like Sketchfab's reflective ground).
let floorMode = "shadow";
const FLOOR_SIZE = 60;

// Radial alpha (white center -> transparent edge). Used to fade the floor out
// toward the horizon so there's no hard square edge, and to shape the contact
// shadow blob. Pure canvas gradient — procedural, no image asset.
function makeRadialAlpha(inner = 0.0, outer = 0.5, gamma = 1.0) {
  const s = 256;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(s, s);
  const cx = (s - 1) / 2, cy = (s - 1) / 2, R = s / 2;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const d = Math.hypot(x - cx, y - cy) / R;            // 0 center .. 1 edge
      let a = 1 - (d - inner) / Math.max(1e-4, outer - inner);
      a = Math.pow(Math.max(0, Math.min(1, a)), gamma);
      const i = (y * s + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

const floorFadeAlpha = makeRadialAlpha(0.0, 0.5, 1.3);  // reflective-floor vignette

const shadowFloor = new THREE.Mesh(
  new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
  new THREE.ShadowMaterial({ opacity: 0.28 }),
);
shadowFloor.rotation.x = -Math.PI / 2;
shadowFloor.receiveShadow = true;
scene.add(shadowFloor);

const glossyFloor = new THREE.Mesh(
  new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
  new THREE.MeshStandardMaterial({
    color: 0x0c0f14, roughness: 0.18, metalness: 0.0, envMapIntensity: 1.0,
    transparent: true, alphaMap: floorFadeAlpha,   // fade reflections out at distance
  }),
);
glossyFloor.rotation.x = -Math.PI / 2;
glossyFloor.receiveShadow = true;
glossyFloor.position.y = -0.001;   // just under the shadow catcher
glossyFloor.visible = false;
scene.add(glossyFloor);

// Contact shadow: a soft dark radial blob sitting right under the model. Unlike
// the cast shadow (which needs a strong key light), this grounds the model in
// flat/overcast lighting and tightens the "sits on the floor" read. Sized to
// the model footprint in buildParts via updateContactShadow().
const contactShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.35,
    alphaMap: makeRadialAlpha(0.0, 0.5, 2.2),
    depthWrite: false,
  }),
);
contactShadow.rotation.x = -Math.PI / 2;
contactShadow.position.y = 0.002;     // just above the floor to avoid z-fight
contactShadow.renderOrder = 1;
scene.add(contactShadow);

function updateContactShadow() {
  // Footprint ~ model XZ extent; pad a bit so the blob spills past the base.
  const w = Math.max(0.2, lastSize.x) * 1.7;
  const d = Math.max(0.2, lastSize.z) * 1.7;
  contactShadow.scale.set(w, d, 1);
}

// Mirror is created lazily (it owns a render target) the first time it's used.
let mirrorFloor = null;
function ensureMirrorFloor() {
  if (mirrorFloor) return mirrorFloor;
  mirrorFloor = new Reflector(new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE), {
    color: 0x889099, textureWidth: 1024, textureHeight: 1024, opacity: 0.55, clipBias: 0.003,
  });
  mirrorFloor.rotation.x = -Math.PI / 2;
  mirrorFloor.position.y = -0.002;
  mirrorFloor.visible = false;
  scene.add(mirrorFloor);
  return mirrorFloor;
}

function applyFloor(mode) {
  floorMode = mode;
  shadowFloor.visible = mode === "shadow" || mode === "glossy" || mode === "mirror"; // always catch shadow
  glossyFloor.visible = mode === "glossy";
  // Contact blob looks wrong under the mirror (it would reflect as a smear), so
  // only show it for the matte/glossy floors.
  contactShadow.visible = mode === "shadow" || mode === "glossy";
  if (mode === "mirror") ensureMirrorFloor();
  if (mirrorFloor) mirrorFloor.visible = mode === "mirror";
  resetTAA();
}

// ---- Post-processing pipeline (AAA-style) ----
// TAA -> GTAO (contact AO) -> UnrealBloom (HDR highlight bloom) -> OutputPass
// (ACES tone map + sRGB). The renderer keeps toneMapping=ACES; OutputPass
// applies it at the very end so intermediate buffers stay linear-HDR (required
// for correct bloom thresholding).
const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(devicePixelRatio, 2));
composer.setSize(stage.clientWidth, stage.clientHeight);

// Dedicated depth capture for the volumetric-fog pass. TAARenderPass renders to
// internal sample targets, so reading depth off the composer buffers is
// unreliable; sampling a hardware DepthTexture is also flaky under software GL.
// Instead we render the scene with a packed-RGBA depth material into a plain
// color target and unpack it in the fog shader — portable across GL backends.
const fogDepthRT = new THREE.WebGLRenderTarget(stage.clientWidth, stage.clientHeight, {
  minFilter: THREE.NearestFilter,
  magFilter: THREE.NearestFilter,
});
// Packed depth must be sampled verbatim — no sRGB decode would corrupt the bytes.
fogDepthRT.texture.colorSpace = THREE.NoColorSpace;
fogDepthRT.texture.generateMipmaps = false;
const fogDepthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });

function resizeSceneDepthTarget() {
  const ratio = renderer.getPixelRatio();
  fogDepthRT.setSize(
    Math.max(1, Math.floor(stage.clientWidth * ratio)),
    Math.max(1, Math.floor(stage.clientHeight * ratio)),
  );
}

// TAA: while the camera moves we render a single sample (cheap, like a plain
// RenderPass). Once it goes idle we flip accumulate on and the pass jitters the
// camera over several frames, averaging them into a clean, near-supersampled
// image — exactly what the VLM/silhouette-IoU loop wants from a screenshot.
const taaPass = new TAARenderPass(scene, camera);
taaPass.unbiased = false;     // bias toward stability (less flicker per sample)
taaPass.sampleLevel = 3;      // 2^3 = 8 accumulated samples when idle
taaPass.accumulate = false;
composer.addPass(taaPass);

// Ground-truth ambient occlusion: adds the soft contact darkening between
// touching parts that a flat IBL alone can't produce.
const gtao = new GTAOPass(scene, camera, stage.clientWidth, stage.clientHeight);
gtao.output = GTAOPass.OUTPUT.Default;
gtao.blendIntensity = 0.7;
gtao.updateGtaoMaterial({ radius: 0.25, distanceExponent: 1.0, thickness: 1.0, scale: 1.0, samples: 16, screenSpaceRadius: false });
composer.addPass(gtao);

// HDR bloom: only pixels above threshold (the bright sun reflection, emissives,
// glints) bleed — this is what sells metal/glass/neon as "expensive".
const bloom = new UnrealBloomPass(
  new THREE.Vector2(stage.clientWidth, stage.clientHeight),
  0.15, // strength
  0.45, // radius
  1.1,  // threshold (only HDR highlights bloom)
);
composer.addPass(bloom);

// Depth of field (disabled by default). When on, foreground/background blur
// draws the eye to the focal subject — a "product shot" look. focus is the
// focal distance in world units; aperture controls blur strength. We retune
// focus to the model center on each fit so the subject stays sharp.
const bokeh = new BokehPass(scene, camera, { focus: 8.0, aperture: 0.0008, maxblur: 0.012 });
bokeh.enabled = false;
composer.addPass(bokeh);

// VOLUMETRIC FOG — a full-screen raymarch through height-based fog with sun
// light shafts (god rays). It reconstructs each pixel's world position from the
// captured depth, then marches camera->surface accumulating fog density that
// falls off with height, brightening samples that face the sun. Disabled by
// default; toggled via the "体积雾" button.
const fogPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: fogDepthRT.texture },
    uInvProj: { value: new THREE.Matrix4() },
    uInvView: { value: new THREE.Matrix4() },
    uCamPos: { value: new THREE.Vector3() },
    uSunDir: { value: SUN_DIR.clone() },
    uSunColor: { value: new THREE.Color(1.0, 0.92, 0.78) },
    uNear: { value: camera.near },
    uFar: { value: camera.far },
    uDensity: { value: 0.06 },
    uHeight: { value: 2.2 },     // fog top; density decays above the ground
    uShaft: { value: 0.5 },      // god-ray strength
    uSteps: { value: 24 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tDiffuse; uniform sampler2D tDepth;
    uniform mat4 uInvProj, uInvView; uniform vec3 uCamPos, uSunDir, uSunColor;
    uniform float uNear, uFar, uDensity, uHeight, uShaft; uniform int uSteps;
    // Unpack three's RGBA-packed depth back to a [0,1] non-linear depth.
    float unpackDepth(vec4 rgba){
      return dot(rgba, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0));
    }
    // Linearize the perspective depth buffer to a view-space distance.
    float linDepth(float d){
      float z = d * 2.0 - 1.0;
      return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
    }
    // Reconstruct world position from depth + screen uv.
    vec3 worldPos(vec2 uv, float depth){
      vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
      vec4 view = uInvProj * clip; view /= view.w;
      return (uInvView * view).xyz;
    }
    // Exponential height fog: densest at ground (y=0), thinning with altitude
    // over a scale height uHeight. Stays > 0 everywhere so an elevated camera
    // still sees haze and god rays.
    float densAt(vec3 p){
      return exp(-max(p.y, 0.0) / uHeight) * uDensity;
    }
    void main(){
      vec4 scene = texture2D(tDiffuse, vUv);
      float d = unpackDepth(texture2D(tDepth, vUv));
      vec3 wp = worldPos(vUv, d);
      vec3 ro = uCamPos;
      vec3 dir = wp - ro;
      float dist = length(dir);
      dir /= max(dist, 1e-4);
      // Background (no geometry) gets a capped march distance so the sky still fogs.
      float maxT = (d >= 0.9999) ? uFar * 0.25 : dist;
      int N = uSteps;
      float stepLen = maxT / float(N);
      float fog = 0.0; float shaft = 0.0;
      float sunAmt = pow(clamp(dot(dir, normalize(uSunDir)), 0.0, 1.0), 8.0);
      for(int i = 0; i < 64; i++){
        if(i >= N) break;
        float t = (float(i) + 0.5) * stepLen;
        vec3 p = ro + dir * t;
        float dens = densAt(p) * stepLen;
        fog += dens;
        shaft += dens * sunAmt;   // samples toward the sun glow brighter
      }
      fog = 1.0 - exp(-fog);
      vec3 fogColor = mix(vec3(0.62, 0.66, 0.72), uSunColor, sunAmt * 0.6);
      vec3 col = mix(scene.rgb, fogColor, clamp(fog, 0.0, 1.0));
      col += uSunColor * shaft * uShaft;   // additive god rays
      gl_FragColor = vec4(col, scene.a);
    }`,
});
fogPass.enabled = false;
// ShaderPass clones the uniform spec on construction, dropping the texture ref;
// rebind the depth texture on the live material uniforms.
fogPass.uniforms.tDepth.value = fogDepthRT.texture;
fogPass.material.uniforms.tDepth.value = fogDepthRT.texture;
composer.addPass(fogPass);

const outputPass = new OutputPass();
composer.addPass(outputPass);

// TAA accumulation control: any camera/scene change calls resetTAA(), which
// drops back to single-sample rendering; the animate loop re-enables
// accumulation after the view has been still for a few frames.
let taaEnabled = true;
let idleFrames = 0;
const IDLE_BEFORE_ACCUM = 4;
function resetTAA() {
  idleFrames = 0;
  if (taaPass) taaPass.accumulate = false;
}

let postEnabled = true;
let postUserOverride = null;
let perfMode = "quality";
let activePerfTier = "quality";

const PERF_TIERS = {
  quality: { maxPixelRatio: 2, post: true, taa: true, gtao: true, bloom: true, shadows: true },
  balanced: { maxPixelRatio: 1.25, post: true, taa: false, gtao: false, bloom: true, shadows: true },
  fast: { maxPixelRatio: 1, post: false, taa: false, gtao: false, bloom: false, shadows: false },
};

function setRenderPixelRatio(maxPixelRatio) {
  const ratio = Math.max(0.75, Math.min(devicePixelRatio || 1, maxPixelRatio));
  renderer.setPixelRatio(ratio);
  composer.setPixelRatio(ratio);
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  composer.setSize(stage.clientWidth, stage.clientHeight);
  gtao.setSize(stage.clientWidth, stage.clientHeight);
  bloom.setSize(stage.clientWidth, stage.clientHeight);
  if (bokeh) bokeh.setSize(stage.clientWidth, stage.clientHeight);
  resizeSceneDepthTarget();
}

function setShadowEnabled(enabled) {
  renderer.shadowMap.enabled = enabled;
  key.castShadow = enabled;
  shadowFloor.receiveShadow = enabled;
  glossyFloor.receiveShadow = enabled;
  modelRoot.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline) return;
    o.castShadow = enabled && o.userData.castShadow !== false;
    o.receiveShadow = enabled;
  });
  renderer.shadowMap.needsUpdate = true;
}

function applyAdaptivePerformance(meta = lastMeta) {
  const tier = perfMode === "auto" ? "quality" : (PERF_TIERS[perfMode] ? perfMode : "quality");
  const cfg = PERF_TIERS[tier];
  activePerfTier = tier;
  setRenderPixelRatio(cfg.maxPixelRatio);
  if (postUserOverride === null) postEnabled = cfg.post;
  taaEnabled = cfg.taa;
  if (!taaEnabled) taaPass.accumulate = false;
  gtao.enabled = cfg.gtao;
  bloom.enabled = cfg.bloom;
  setShadowEnabled(cfg.shadows);
  resetTAA();
}

let modelRoot = new THREE.Group();
scene.add(modelRoot);
let wireframe = false;
let autorot = false; // models stay still by default
let currentPreset = "model"; // default: follow each part's own matched surface
let currentMatPreset = null;   // preset whose params are loaded
let currentMatParams = {};     // active material param values
let currentModel = null;   // active ProcModel definition
let currentParams = null;  // active param values
let currentBindings = {};
let currentView = "persp"; // active named camera view (for share URL)
let currentLoadedSource = null; // raw source carried by AI/external ViewerModel
let currentLoadedSourceName = "";
let selectedPart = null;   // selected part name
let currentParts = [];     // last built parts, kept for async models
let lastMeta = { parts: 0, verts: 0, tris: 0 };
let currentOptimizationRun = null;
let selectedOptimizationCandidateId = null;
let lastAiSplitFrame = null;
let rebuildToken = 0;
const PARAM_LOADING_THRESHOLD_MS = 3000;
const modelTimingMs = new Map();
const workerModelIds = new WeakMap(Object.entries(PROC_MODELS).map(([id, model]) => [model, id]));
let modelBuildWorker = null;
let modelBuildRequestId = 0;
let pendingWorkerBuild = null;
const bindingOverlay = new THREE.Group();
scene.add(bindingOverlay);
let activeDrawing = null;
let bindingEditEnabled = false;
let selectedBindingPoint = -1;
let bindingDrag = null;
let bindingUndoStack = [];
let bindingRedoStack = [];
let viewportPress = null;
const bindingRaycaster = new THREE.Raycaster();
bindingRaycaster.params.Line.threshold = 0.18;
const bindingPointer = new THREE.Vector2();
const bindingPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const drawBindingBtn = document.getElementById("draw-binding");
const editBindingBtn = document.getElementById("edit-binding");
const resetBindingBtn = document.getElementById("draw-reset");
const undoBindingBtn = document.getElementById("draw-undo");
const redoBindingBtn = document.getElementById("draw-redo");
const drawStatusEl = document.getElementById("draw-status");
const drawToolsEl = document.getElementById("draw-tools");

function stopModelBuildWorker() {
  if (modelBuildWorker) modelBuildWorker.terminate();
  modelBuildWorker = null;
  if (pendingWorkerBuild) {
    pendingWorkerBuild.reject(new DOMException("模型构建已取消", "AbortError"));
    pendingWorkerBuild = null;
  }
}

function ensureModelBuildWorker() {
  if (modelBuildWorker) return modelBuildWorker;
  modelBuildWorker = new Worker(new URL("./model-build-worker.js?v=responsive2", import.meta.url), { type: "module" });
  modelBuildWorker.onmessage = (event) => {
    const message = event.data || {};
    if (!pendingWorkerBuild || message.requestId !== pendingWorkerBuild.requestId) return;
    const pending = pendingWorkerBuild;
    pendingWorkerBuild = null;
    if (message.ok) pending.resolve(message);
    else pending.reject(new Error(message.error || "后台模型构建失败"));
  };
  modelBuildWorker.onerror = (event) => {
    const message = event.message || "后台模型构建失败";
    stopModelBuildWorker();
    if (pendingWorkerBuild) pendingWorkerBuild.reject(new Error(message));
  };
  return modelBuildWorker;
}

async function buildModelParts(model, params) {
  const context = { bindings: cloneSerializable(currentBindings) };
  const modelId = workerModelIds.get(model);
  if (!modelId || typeof Worker === "undefined") {
    stopModelBuildWorker();
    return { parts: await model.build(params, context), elapsedMs: 0 };
  }
  if (pendingWorkerBuild) stopModelBuildWorker();
  const worker = ensureModelBuildWorker();
  const requestId = ++modelBuildRequestId;
  return new Promise((resolve, reject) => {
    pendingWorkerBuild = { requestId, resolve, reject };
    worker.postMessage({ requestId, modelId, params, context });
  });
}

function cloneSerializable(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function modelTimingKey(model = currentModel, fallback = "") {
  const raw = model?.id || model?.sourceName || model?.name || fallback || currentLoadedSourceName || "runtime";
  return String(raw);
}

function recordModelTiming(model, elapsedMs, fallback = "") {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return;
  const key = modelTimingKey(model, fallback);
  const prev = modelTimingMs.get(key) || 0;
  if (elapsedMs > prev) modelTimingMs.set(key, elapsedMs);
}

function shouldShowParamLoading() {
  return (modelTimingMs.get(modelTimingKey(currentModel)) || 0) >= PARAM_LOADING_THRESHOLD_MS;
}

// ---- Wind animation state ----
// Materials that carry a wind weight attribute register their `uTime` uniform
// here; the animate loop ticks them so foliage sways on the GPU. Topology never
// changes — sway is a vertex-shader displacement driven by per-vertex weight.
const windClock = new THREE.Clock();
let windEnabled = true;     // global toggle (off freezes for clean screenshots)
let windStrength = 0.08;    // world-unit sway amplitude at weight=1
let windMeshes = [];
let cloudVolumeMeshes = [];
let waterfallFxMeshes = [];
let waterSurfaceMeshes = [];
let waterfallFxTimeOverride = null;

// Per-part surface param overrides in "model" (matched) mode, keyed by part
// name. Each value is a partial params object merged onto the part's own
// surface params before baking, so editing the right panel retunes just that
// part's matched material (fur tint, metal roughness, ...) live.
let surfaceOverrides = {};
// Live params for a globally-applied named surface (dropdown -> glass/metal/...).
let currentSurfaceName = null;
let currentSurfaceParams = {};

// Flatten a Meshova Mesh (arrays of Vec3/Vec2) into typed arrays for three.
function yieldToBrowser() {
  if (globalThis.scheduler?.yield) return globalThis.scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function meshToBuffers(mesh) {
  const pos = new Float32Array(mesh.positions.length * 3);
  const nrm = new Float32Array(mesh.normals.length * 3);
  const uv = new Float32Array(mesh.uvs.length * 2);
  for (let i = 0; i < mesh.positions.length; i++) {
    pos[i * 3] = mesh.positions[i].x;
    pos[i * 3 + 1] = mesh.positions[i].y;
    pos[i * 3 + 2] = mesh.positions[i].z;
    nrm[i * 3] = mesh.normals[i].x;
    nrm[i * 3 + 1] = mesh.normals[i].y;
    nrm[i * 3 + 2] = mesh.normals[i].z;
    uv[i * 2] = mesh.uvs[i].x;
    uv[i * 2 + 1] = mesh.uvs[i].y;
    if (i > 0 && i % 12000 === 0) await yieldToBrowser();
  }
  return { pos, nrm, uv, indices: mesh.indices };
}

const importedTextureLoader = new THREE.TextureLoader();
const importedTextureCache = new Map();
const importedTexturePending = new Set();

function resolveImportedTextureUrl(path) {
  if (!path) return null;
  if (/^(?:(?:https?:)?\/\/|blob:|data:)/i.test(path) || path.startsWith("/")) return path;
  return `/out/${path}`;
}

function loadImportedTexture(path, { srgb = false, flipY = true } = {}) {
  const url = resolveImportedTextureUrl(path);
  if (!url) return null;
  const key = `${srgb ? "srgb" : "linear"}:${flipY ? "flipY" : "noFlipY"}:${url}`;
  const cached = importedTextureCache.get(key);
  if (cached) return cached;
  let resolvePending = () => {};
  const pending = new Promise((resolve) => { resolvePending = resolve; });
  importedTexturePending.add(pending);
  const tex = importedTextureLoader.load(url, () => {
    resolvePending();
    importedTexturePending.delete(pending);
    resetTAA();
  }, undefined, (err) => {
    resolvePending();
    importedTexturePending.delete(pending);
    console.warn("texture load failed", url, err);
  });
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  // OBJ/MTL texture atlases use Three's default flipped upload. glTF-style
  // no-flip would vertically mirror atlas islands and make UVs look scrambled.
  tex.flipY = flipY;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  importedTextureCache.set(key, tex);
  return tex;
}

function waitForImportedTextures() {
  return importedTexturePending.size
    ? Promise.allSettled([...importedTexturePending])
    : Promise.resolve();
}

function releaseUploadedTexture(path) {
  if (!String(path || "").startsWith("blob:")) return;
  for (const [key, texture] of importedTextureCache) {
    if (!key.endsWith(`:${path}`)) continue;
    texture.dispose?.();
    importedTextureCache.delete(key);
  }
  URL.revokeObjectURL(path);
}

function viewerPartToNamedPart(p) {
  if (p.mesh) return p;
  const positions = [];
  const normals = [];
  const uvs = [];
  for (let i = 0; i < p.positions.length; i += 3) {
    positions.push({ x: p.positions[i], y: p.positions[i + 1], z: p.positions[i + 2] });
  }
  if (Array.isArray(p.normals) && p.normals.length === p.positions.length) {
    for (let i = 0; i < p.normals.length; i += 3) {
      normals.push({ x: p.normals[i], y: p.normals[i + 1], z: p.normals[i + 2] });
    }
  } else {
    for (let i = 0; i < positions.length; i++) normals.push({ x: 0, y: 1, z: 0 });
  }
  if (Array.isArray(p.uvs) && p.uvs.length === positions.length * 2) {
    for (let i = 0; i < p.uvs.length; i += 2) uvs.push({ x: p.uvs[i], y: p.uvs[i + 1] });
  } else {
    for (let i = 0; i < positions.length; i++) uvs.push({ x: 0, y: 0 });
  }
  const mesh = recomputeNormals(makeMesh({
    positions,
    normals,
    uvs,
    indices: Array.from(p.indices || []),
  }));
  const namedPart = {
    name: p.name,
    label: p.label,
    color: p.color || [0.8, 0.8, 0.8],
    colors: p.colors,
    windWeight: p.windWeight,
    surface: p.surface,
    textures: p.textures,
    metadata: p.metadata,
    mesh,
  };
  const render = p.renderInstances;
  if (render && Array.isArray(render.transforms) && render.transforms.length > 1) {
    const renderPart = viewerPartToNamedPart({
      name: p.name,
      positions: render.positions || [],
      normals: render.normals || [],
      uvs: render.uvs || [],
      indices: render.indices || [],
    });
    namedPart.renderInstances = {
      mesh: renderPart.mesh,
      transforms: render.transforms,
    };
  }
  return namedPart;
}

function viewerModelToNamedParts(model) {
  const raw = Array.isArray(model) ? model : (model.parts || []);
  return raw.map(viewerPartToNamedPart);
}

// Precompute per-vertex convexity/curvature (0..1) from a viewer mesh: spread
// of incident face normals, high on convex edges. Mirrors the geometry-library
// computeVertexCurvature so edge-wear uses TRUE curvature instead of the
// fwidth screen-space proxy. Welds by spatial position first so split-vertex
// hard edges (a cube's 24 verts) still register their curvature.
function computeCurvatureAttr(mesh) {
  const n = mesh.positions.length;
  const P = mesh.positions, idx = mesh.indices, weld = 1e-4;
  // Weld by quantized position.
  const idOf = new Map();
  const posId = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const p = P[i];
    const k = Math.round(p.x / weld) + "," + Math.round(p.y / weld) + "," + Math.round(p.z / weld);
    let id = idOf.get(k);
    if (id === undefined) { id = idOf.size; idOf.set(k, id); }
    posId[i] = id;
  }
  const np = idOf.size;
  const sx = new Float64Array(np), sy = new Float64Array(np), sz = new Float64Array(np);
  const cnt = new Int32Array(np);
  const fc = idx.length / 3;
  const fnx = new Float64Array(fc), fny = new Float64Array(fc), fnz = new Float64Array(fc);
  for (let f = 0, i = 0; i < idx.length; i += 3, f++) {
    const a = P[idx[i]], b = P[idx[i + 1]], c = P[idx[i + 2]];
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    fnx[f] = nx; fny[f] = ny; fnz[f] = nz;
    for (const vi of [idx[i], idx[i + 1], idx[i + 2]]) { const p = posId[vi]; sx[p] += nx; sy[p] += ny; sz[p] += nz; cnt[p]++; }
  }
  const mx = new Float64Array(np), my = new Float64Array(np), mz = new Float64Array(np);
  for (let i = 0; i < np; i++) {
    const c = cnt[i] || 1; let ax = sx[i] / c, ay = sy[i] / c, az = sz[i] / c;
    const l = Math.hypot(ax, ay, az) || 1; mx[i] = ax / l; my[i] = ay / l; mz[i] = az / l;
  }
  const dev = new Float64Array(np);
  for (let f = 0, i = 0; i < idx.length; i += 3, f++) {
    for (const vi of [idx[i], idx[i + 1], idx[i + 2]]) {
      const p = posId[vi];
      dev[p] += 1 - Math.max(-1, Math.min(1, fnx[f] * mx[p] + fny[f] * my[p] + fnz[f] * mz[p]));
    }
  }
  const curvPos = new Float32Array(np);
  for (let i = 0; i < np; i++) curvPos[i] = Math.max(0, Math.min(1, (dev[i] / (cnt[i] || 1)) * 2.0));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = curvPos[posId[i]];
  return out;
}

function inferLegacyWaterSurface(part) {
  const name = String(part?.name || "").toLowerCase();
  const label = String(part?.label || "");
  const isWaterPart = name === "water"
    || name === "water_plane"
    || name === "water_level"
    || name === "sea_plane"
    || name === "ocean"
    || name === "rivers"
    || name.endsWith("_water")
    || /(?:水面|河面|水域|水潭|海平面)$/.test(label);
  if (!isWaterPart) return null;
  const semantics = `${name} ${label}`;
  const body = /(?:ocean|sea|海洋|海水|海平面)/i.test(semantics)
    ? "ocean"
    : /(?:river|stream|canal|河流|河道|河面|水道|溪流)/i.test(semantics)
      ? "river"
      : "pond";
  return {
    type: "water",
    params: {
      body,
      tint: part?.color || [0.1, 0.35, 0.42],
      seed: Number(part?.metadata?.seed || 71),
    },
  };
}

/** Build (or rebuild) the scene meshes from a list of {name, mesh, color} parts. */
async function buildParts(parts, { keepCamera = false, buildToken = null } = {}) {
  currentParts = parts;
  scene.remove(modelRoot);
  modelRoot.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose?.(); } });
  modelRoot = new THREE.Group();
  await yieldToBrowser();

  let verts = 0, tris = 0, gpuVerts = 0, gpuTris = 0, gpuInstances = 0;
  for (let partIndex = 0; partIndex < parts.length; partIndex++) {
    if (buildToken !== null && buildToken !== rebuildToken) throw new DOMException("模型构建已取消", "AbortError");
    const part = parts[partIndex];
    updateGenerationLoading(`装配场景 ${partIndex + 1}/${parts.length}`, parts.length ? partIndex / parts.length : 1);
    const instances = part.renderInstances?.transforms?.length > 1 ? part.renderInstances : null;
    const renderMesh = instances?.mesh || part.mesh;
    const { pos, nrm, uv, indices } = await meshToBuffers(renderMesh);
    verts += part.mesh.positions.length;
    tris += part.mesh.indices.length / 3;
    gpuVerts += renderMesh.positions.length;
    gpuTris += indices.length / 3;
    gpuInstances += instances?.transforms.length || 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setAttribute("uv1", new THREE.BufferAttribute(uv, 2));
    // Per-vertex colors (shape-aligned material): attach as a color attribute.
    const hasVColors = Array.isArray(part.colors) && part.colors.length === renderMesh.positions.length * 3;
    if (hasVColors) {
      geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(part.colors), 3));
    }
    // Per-vertex wind weight: drives the GPU sway shader (foliage animation).
    const hasWind = Array.isArray(part.windWeight) && part.windWeight.length === renderMesh.positions.length;
    if (hasWind) {
      geo.setAttribute("windWeight", new THREE.BufferAttribute(new Float32Array(part.windWeight), 1));
    }
    // Edge wear is opt-in. Curvature is expensive on million-vertex scenes, so
    // attach it only when the feature is active or toggled later.
    if (edgeWearOn) {
      geo.setAttribute("curvature", new THREE.BufferAttribute(computeCurvatureAttr(renderMesh), 1));
    }
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    const material = makePartMaterial(part.color, hasVColors);
    let mesh;
    if (instances) {
      mesh = new THREE.InstancedMesh(geo, material, instances.transforms.length);
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const rotation = new THREE.Euler();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      for (let index = 0; index < instances.transforms.length; index++) {
        const instance = instances.transforms[index];
        position.fromArray(instance.position || [0, 0, 0]);
        rotation.fromArray([...(instance.rotation || [0, 0, 0]), "XYZ"]);
        quaternion.setFromEuler(rotation);
        scale.fromArray(instance.scale || [1, 1, 1]);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(index, matrix);
        if (index > 0 && index % 2000 === 0) await yieldToBrowser();
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      mesh.userData.gpuInstances = instances.transforms.length;
    } else {
      mesh = new THREE.Mesh(geo, material);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = part.name;
    mesh.userData.label = part.label || part.name;
    mesh.userData.baseColor = part.color;
    mesh.userData.vertexColors = hasVColors;
    mesh.userData.hasWind = hasWind;     // remember so material swaps re-inject wind
    mesh.userData.surface = part.surface || inferLegacyWaterSurface(part); // matched per-part material
    mesh.userData.textures = part.textures || null; // imported PBR texture atlas
    mesh.userData.doubleSided = !!part.doubleSided;
    mesh.userData.metadata = part.metadata || null;
    mesh.userData.castShadow = part.metadata?.castShadow !== false;
    mesh.castShadow = mesh.userData.castShadow;
    mesh.userData.fxTransforms = instances
      ? instances.transforms.map((item) => ({
          position: [...(item.position || [0, 0, 0])],
          rotation: [...(item.rotation || [0, 0, 0])],
          scale: [...(item.scale || [1, 1, 1])],
        }))
      : null;
    if (String(part.metadata?.renderFx || "").startsWith("waterfall-")) {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    }
    if (hasWind) attachWind(mesh.material);
    applyPartRenderHints(mesh);
    modelRoot.add(mesh);
    await yieldToBrowser();
  }

  updateGenerationLoading("整理材质与视图", 0.94);
  await yieldToBrowser();
  const bbox = new THREE.Box3();
  for (const child of modelRoot.children) {
    if (child.userData.metadata?.cameraFitIgnore) continue;
    bbox.expandByObject(child);
  }
  if (bbox.isEmpty()) bbox.setFromObject(modelRoot);
  const center = new THREE.Vector3();
  bbox.getCenter(center);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  modelRoot.position.set(-center.x, -bbox.min.y, -center.z);
  scene.add(modelRoot);
  updateBindingOverlay();

  lastMeta = {
    parts: parts.length,
    verts,
    tris,
    gpuVerts,
    gpuTris,
    gpuInstances,
    size: { x: size.x, y: size.y, z: size.z },
  };
  applyAdaptivePerformance(lastMeta);
  if (!keepCamera) fitView("persp", size);
  else lastSize = size.clone();
  updateShadowCamera();   // refit shadow frustum to the new model bounds
  updateContactShadow();  // size the contact blob to the new footprint
  const materialSize = tris >= 500000 ? 96 : tris >= 150000 ? 128 : 256;
  updateGenerationLoading(`烘焙材质 ${materialSize}×${materialSize}`, 0.96);
  await yieldToBrowser();
  applyMaterial(currentPreset, { size: materialSize });
  applyWire();
  applySelectionHighlight();
  renderPartList(parts);
  updateMeta();
  updateScriptPanel();
  resetTAA();
  hud.textContent = `${currentModel ? currentModel.name : ""} · ${parts.length}件 / ${tris}面`;
  scheduleCritique(parts);
  updateGenerationLoading("模型生成完成", 1);
}

function ensureCurvatureAttributes() {
  const byName = new Map(currentParts.map((part) => [part.name, part]));
  modelRoot.traverse((o) => {
    if (!o.isMesh || o.geometry.getAttribute("curvature")) return;
    const part = byName.get(o.name);
    if (!part) return;
    const renderMesh = part.renderInstances?.mesh || part.mesh;
    o.geometry.setAttribute("curvature", new THREE.BufferAttribute(computeCurvatureAttr(renderMesh), 1));
  });
}

// ---- 确定性自审 (critique) ----
// 每次 build 后跑一道无 API 的确定性自审：per-part 几何 sanity(退化面/翻转法线/
// 破壳) + rubric 结构 + 比例。结果打到 console 并显示右下角标。装配级 analyzeAssembly
// 是 O(n^2)，植被上百叶片会卡主线程，故此处不跑——那属于 agent loop 的重活。
// 250ms 防抖，避免拖滑块时每帧重算。
let critiqueTimer = 0;
let critiqueBadge = null;

function ensureCritiqueBadge() {
  if (critiqueBadge) return critiqueBadge;
  const el = document.createElement("div");
  el.id = "critiqueBadge";
  el.style.cssText =
    "position:fixed;right:12px;bottom:12px;z-index:50;max-width:340px;" +
    "font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;padding:8px 10px;" +
    "border-radius:8px;background:rgba(20,24,30,.88);color:#dfe6ee;" +
    "box-shadow:0 2px 10px rgba(0,0,0,.35);white-space:pre-wrap;cursor:pointer;" +
    "border-left:3px solid #4a5560;display:none;";
  el.title = "点击折叠/展开自审详情";
  let collapsed = false;
  el.addEventListener("click", () => {
    collapsed = !collapsed;
    el.querySelector("[data-body]").style.display = collapsed ? "none" : "block";
  });
  document.body.appendChild(el);
  critiqueBadge = el;
  return el;
}

// 推断自审用的英文 goal：模型可显式声明 critiqueGoal，否则用英文 id
// (veg-shrub/veg-tree 里的 shrub/tree 能被 rubric 的 \bword\b 命中)。
function critiqueGoalFor() {
  if (currentModel?.critiqueGoal) return currentModel.critiqueGoal;
  if (currentModel?.id) return currentModel.id;
  return currentLoadedSourceName || "";
}

function scheduleCritique(parts) {
  clearTimeout(critiqueTimer);
  const snapshot = parts;
  critiqueTimer = setTimeout(() => runCritique(snapshot), 250);
}

function runCritique(parts) {
  const badge = ensureCritiqueBadge();
  try {
    const goal = critiqueGoalFor();
    const report = critique(parts, { goal });
    const text = formatCritique(report);
    console.log("[自审]\n" + text);
    const s = report.scores;
    const hard = report.issues.filter((i) => i.severity === "hard").length;
    const soft = report.issues.filter((i) => i.severity === "soft").length;
    const color = hard > 0 ? "#e0555a" : soft > 0 ? "#d6b24a" : "#4ec27a";
    badge.style.borderLeftColor = color;
    badge.style.display = "block";
    const head =
      `自审 [${report.category}] ${(s.overall * 100).toFixed(0)}分` +
      (report.passed ? " ✅通过" : hard > 0 ? ` ⚠️${hard}项必修` : ` 🔎${soft}项待优化`);
    const detail = report.issues.length
      ? report.issues
          .slice(0, 6)
          .map((i) => `· ${i.severity === "hard" ? "必修" : "优化"}[${i.part || i.axis}] ${i.finding}`)
          .join("\n")
      : "无问题。";
    badge.innerHTML =
      `<div style="font-weight:600">${head}</div>` +
      `<div data-body style="margin-top:4px;opacity:.85">${detail.replace(/</g, "&lt;")}</div>`;
  } catch (e) {
    console.warn("[自审] 失败:", e);
    if (critiqueBadge) critiqueBadge.style.display = "none";
  }
}

function makePartMaterial(color, vertexColors = false, textures = null) {
  const c = color || [0.8, 0.8, 0.8];
  const mat = new THREE.MeshStandardMaterial({
    color: vertexColors ? new THREE.Color(1, 1, 1) : new THREE.Color(c[0], c[1], c[2]),
    vertexColors: !!vertexColors,
    roughness: 0.75, metalness: 0.0,
  });
  if (!textures) return mat;

  const baseColor = loadImportedTexture(textures.baseColor, { srgb: true });
  const normal = loadImportedTexture(textures.normal);
  const roughness = loadImportedTexture(textures.roughness);
  const metallic = loadImportedTexture(textures.metallic);
  const ao = loadImportedTexture(textures.ao);
  const orm = loadImportedTexture(textures.orm);
  if (baseColor) {
    mat.map = baseColor;
    mat.color.setRGB(1, 1, 1);
    mat.vertexColors = !!vertexColors;
  }
  if (normal) {
    mat.normalMap = normal;
    mat.normalScale = new THREE.Vector2(1, 1);
  }
  if (orm) {
    // glTF/Three convention: ORM = R AO, G roughness, B metallic.
    mat.aoMap = orm;
    mat.roughnessMap = orm;
    mat.metalnessMap = orm;
    mat.roughness = 1.0;
    mat.metalness = 1.0;
    mat.aoMapIntensity = 1.0;
  } else {
    if (ao) mat.aoMap = ao;
    if (roughness) {
      mat.roughnessMap = roughness;
      mat.roughness = 1.0;
    }
    if (metallic) {
      mat.metalnessMap = metallic;
      mat.metalness = 1.0;
    }
  }
  mat.envMapIntensity = 1.0;
  return mat;
}

function colorKey(color) {
  return Array.isArray(color) ? color.map((v) => Number(v).toFixed(4)).join(",") : "";
}

function surfaceMaterialCacheKey(surfaceRef, fallbackColor) {
  return `${surfaceRef?.type || "none"}|${JSON.stringify(surfaceRef?.params || {})}|${colorKey(fallbackColor)}`;
}

function cachedSurfaceMaterial(cache, surfaceRef, size, fallbackColor) {
  const key = surfaceMaterialCacheKey(surfaceRef, fallbackColor);
  let base = cache.get(key);
  if (!base) {
    base = bakeSurface(surfaceRef, size, fallbackColor) || makePartMaterial(fallbackColor || [0.8, 0.8, 0.8]);
    cache.set(key, base);
  }
  return base.clone();
}

const DOUBLE_SIDED_SURFACES = new Set(["leaf", "foliage", "grassBlade"]);

function partNeedsDoubleSide(o) {
  const surfaceType = o?.userData?.surface?.type;
  return !!o?.userData?.doubleSided || DOUBLE_SIDED_SURFACES.has(surfaceType);
}

function applyPartRenderHints(o) {
  if (!o || !o.material) return;
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  for (const mat of mats) {
    if (!mat || !partNeedsDoubleSide(o)) continue;
    mat.side = THREE.DoubleSide;
    mat.shadowSide = THREE.DoubleSide;
    mat.needsUpdate = true;
  }
}

/**
 * Inject a GPU wind sway into any material that has a `windWeight` vertex
 * attribute. The vertex shader offsets each vertex by a sum of sines scaled by
 * its weight (root=0, tip=1) and the global windStrength — SpeedTree-style
 * hierarchical sway, no topology change. Registers the material's uniforms so
 * the animate loop can tick uTime.
 */
function attachWind(material) {
  if (!material || material.userData.windPatched) return;
  material.userData.windPatched = true;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    if (typeof prev === "function") prev(shader);
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uWindStrength = { value: windStrength };
    shader.vertexShader =
      "attribute float windWeight;\nuniform float uTime;\nuniform float uWindStrength;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          float w = windWeight;
          // Two octaves of sway + a phase from world position so neighbors differ.
          float phase = position.x * 0.7 + position.z * 0.7;
          float s1 = sin(uTime * 1.6 + phase);
          float s2 = sin(uTime * 3.1 + phase * 1.7) * 0.4;
          float sway = (s1 + s2) * w * uWindStrength;
          // Sway mostly horizontally (X/Z), tiny vertical bob.
          transformed.x += sway;
          transformed.z += sway * 0.6;
          transformed.y += abs(sway) * 0.15 * w;
        }`,
      );
    // Stash uniforms on the material so the animate loop can tick them; storing
    // here (not a global list) keeps material swaps from leaving stale refs.
    material.userData.windUniforms = shader.uniforms;
  };
  material.needsUpdate = true;
}

/**
 * Patch a baked skin material to sample its textures with TRIPLANAR projection
 * instead of the mesh UVs. The body's UVs are a cylindrical wrap, which is fine
 * on the torso/limbs but degenerates at the +Y/-Y poles (the head crown), where
 * all meridians converge and the noise smears into radial streaks that read like
 * stray glyphs. True triplanar samples each map three times in WORLD space (along
 * X/Y/Z planes) and blends by the squared surface normal, so there is no pole,
 * no seam and no stretching on off-axis hands/feet. We blend the SAMPLED colors
 * (correct) rather than the UV coordinates (which would smear).
 */
function attachTriplanar(material, scale = 1.6) {
  if (!material || material.userData.triplanarPatched) return;
  material.userData.triplanarPatched = true;
  const prevOBC = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    if (typeof prevOBC === "function") prevOBC(shader);
    shader.uniforms.uTriScale = { value: scale };
    // Pass world position + world normal to the fragment shader.
    shader.vertexShader =
      "varying vec3 vTriWPos;\nvarying vec3 vTriWNrm;\n" +
      shader.vertexShader
        .replace(
          "#include <worldpos_vertex>",
          "#include <worldpos_vertex>\n  vTriWPos = (modelMatrix * vec4(transformed,1.0)).xyz;\n  vTriWNrm = normalize(mat3(modelMatrix) * objectNormal);",
        );
    // If worldpos_vertex isn't present (no shadows/env), fall back to begin_vertex.
    if (!shader.vertexShader.includes("vTriWPos =")) {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n  vTriWPos = (modelMatrix * vec4(transformed,1.0)).xyz;\n  vTriWNrm = normalize(mat3(modelMatrix) * objectNormal);",
      );
    }

    const triHelpers = `
      varying vec3 vTriWPos;
      varying vec3 vTriWNrm;
      uniform float uTriScale;
      vec3 triBlend() {
        vec3 b = pow(abs(normalize(vTriWNrm)), vec3(4.0));
        return b / max(b.x + b.y + b.z, 1e-4);
      }
      vec4 triSample(sampler2D tex, vec3 wpos, vec3 bw) {
        vec3 p = wpos * uTriScale;
        vec4 x = texture2D(tex, p.zy);
        vec4 y = texture2D(tex, p.xz);
        vec4 z = texture2D(tex, p.xy);
        return x * bw.x + y * bw.y + z * bw.z;
      }
      vec3 triUnpackNormal(sampler2D tex, vec2 uv, vec2 nScale) {
        vec3 n = texture2D(tex, uv * uTriScale).xyz * 2.0 - 1.0;
        n.xy *= nScale;
        return n;
      }
    `;
    shader.fragmentShader = triHelpers + shader.fragmentShader;

    // Albedo: replace the map fetch with a triplanar blend.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#ifdef USE_MAP
        vec3 triBW = triBlend();
        vec4 sampledDiffuseColor = triSample(map, vTriWPos, triBW);
        diffuseColor *= sampledDiffuseColor;
      #endif`,
    );
    // Roughness map triplanar.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `float roughnessFactor = roughness;
      #ifdef USE_ROUGHNESSMAP
        roughnessFactor *= triSample(roughnessMap, vTriWPos, triBlend()).g;
      #endif`,
    );
    // AO map triplanar (uses uv2 normally; the pinch lives there too).
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <aomap_fragment>",
      `#ifdef USE_AOMAP
        float ambientOcclusion = (triSample(aoMap, vTriWPos, triBlend()).r - 1.0) * aoMapIntensity + 1.0;
        reflectedLight.indirectDiffuse *= ambientOcclusion;
        #if defined( USE_ENVMAP ) && defined( STANDARD )
          float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
          reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
        #endif
      #endif`,
    );
    // Normal map triplanar (Golus "whiteout" blend): the cylindrical normal
    // map pinches hardest at the pole, which is what reads as a radial glyph.
    // Sample three tangent-space normals, swizzle each into world space and
    // blend by the axis weights.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#ifdef USE_NORMALMAP
        vec3 tbw = triBlend();
        vec3 wn = normalize(vTriWNrm);
        vec3 tnX = triUnpackNormal(normalMap, vTriWPos.zy, normalScale);
        vec3 tnY = triUnpackNormal(normalMap, vTriWPos.xz, normalScale);
        vec3 tnZ = triUnpackNormal(normalMap, vTriWPos.xy, normalScale);
        tnX = vec3(tnX.xy + wn.zy, abs(tnX.z) * wn.x);
        tnY = vec3(tnY.xy + wn.xz, abs(tnY.z) * wn.y);
        tnZ = vec3(tnZ.xy + wn.xy, abs(tnZ.z) * wn.z);
        vec3 worldN = normalize(tnX.zyx * tbw.x + tnY.xzy * tbw.y + tnZ.xyz * tbw.z);
        normal = normalize((viewMatrix * vec4(worldN, 0.0)).xyz);
      #endif`,
    );
  };
  material.needsUpdate = true;
}

// Curvature-proxy EDGE WEAR. True curvature needs a precomputed per-vertex
// attribute; here we estimate it cheaply from screen-space derivatives of the
// world normal (fwidth) — high on convex edges/creases, ~0 on flat faces. Convex
// edges expose bare metal (roughness down, metalness/brightness up) the way worn
// props and weapons read in AAA. Strength is global; 0 disables.
function attachEdgeWear(material, opts = {}) {
  if (!material || material.userData.edgeWearPatched) return;
  material.userData.edgeWearPatched = true;
  const prev = material.onBeforeCompile;
  const uni = {
    uWearAmt: { value: opts.amount ?? 0.6 },
    uWearWidth: { value: opts.width ?? 1.5 },
    uWearTint: { value: new THREE.Color(opts.tint ?? 0xb8b0a0) },
  };
  material.onBeforeCompile = (shader) => {
    if (typeof prev === "function") prev(shader);
    Object.assign(shader.uniforms, uni);
    shader.fragmentShader =
      "uniform float uWearAmt;\nuniform float uWearWidth;\nuniform vec3 uWearTint;\nvarying vec3 vWearWN;\nvarying float vCurv;\nfloat gWearF;\n" +
      shader.fragmentShader;
    // Compute the wear factor early (color_fragment runs before roughness/
    // metalness in main). Prefer TRUE per-vertex curvature (vCurv) when present;
    // fall back to a screen-space fwidth(normal) proxy on meshes without it.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      {
        float curvTrue = clamp(vCurv * uWearWidth, 0.0, 1.0);
        float curvProxy = clamp(length(fwidth(normalize(vWearWN))) * 40.0 * uWearWidth, 0.0, 1.0);
        float wearCurv = max(curvTrue, curvProxy * 0.5);
        gWearF = wearCurv * uWearAmt;
        diffuseColor.rgb = mix(diffuseColor.rgb, uWearTint, gWearF * 0.6);
      }`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.18, gWearF);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <metalnessmap_fragment>",
      `#include <metalnessmap_fragment>
      metalnessFactor = mix(metalnessFactor, 1.0, gWearF * 0.7);`,
    );
    shader.vertexShader =
      "varying vec3 vWearWN;\nvarying float vCurv;\nattribute float curvature;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n  vWearWN = normalize(mat3(modelMatrix) * objectNormal);\n  vCurv = curvature;",
      );
    material.userData.edgeWearUniforms = shader.uniforms;
  };
  material.needsUpdate = true;
}

// PARALLAX OCCLUSION MAPPING. Ray-march the height map (stashed on userData) in
// tangent space so cavities self-occlude and gain real depth — brick mortar,
// bark grooves, tile gaps. Falls back silently when there is no height map.
function attachPOM(material, opts = {}) {
  if (!material || material.userData.pomPatched) return;
  const heightTex = material.userData.heightTex;
  if (!heightTex) return;
  material.userData.pomPatched = true;
  const prev = material.onBeforeCompile;
  const uni = {
    uPomHeight: { value: heightTex },
    uPomScale: { value: opts.scale ?? 0.06 },
    uPomLayers: { value: opts.layers ?? 24 },
  };
  material.onBeforeCompile = (shader) => {
    if (typeof prev === "function") prev(shader);
    Object.assign(shader.uniforms, uni);
    // Build a tangent-space view dir from the existing normal + a derived tangent.
    shader.vertexShader =
      "varying vec3 vPomTanViewDir;\nvarying vec2 vPomUv;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          vec3 n = normalize(normalMatrix * normal);
          vec3 t = normalize(normalMatrix * (abs(normal.y) < 0.99 ? cross(vec3(0.0,1.0,0.0), normal) : vec3(1.0,0.0,0.0)));
          vec3 b = cross(n, t);
          vec3 viewPos = (modelViewMatrix * vec4(transformed,1.0)).xyz;
          vec3 vdir = normalize(-viewPos);
          vPomTanViewDir = vec3(dot(vdir,t), dot(vdir,b), dot(vdir,n));
          vPomUv = uv;
        }`,
      );
    shader.fragmentShader =
      `uniform sampler2D uPomHeight;\nuniform float uPomScale;\nuniform float uPomLayers;\nvarying vec3 vPomTanViewDir;\nvarying vec2 vPomUv;\n
       vec2 pomOffset(vec2 uv){
         vec3 v = normalize(vPomTanViewDir);
         float nl = mix(uPomLayers, 8.0, abs(v.z));
         float layerD = 1.0 / nl;
         float curD = 0.0;
         vec2 P = v.xy / max(v.z, 0.2) * uPomScale;
         vec2 dUv = P / nl;
         vec2 cur = uv;
         float h = 1.0 - texture2D(uPomHeight, cur).r;
         for(int i=0;i<32;i++){
           if(curD >= h) break;
           cur -= dUv; h = 1.0 - texture2D(uPomHeight, cur).r; curD += layerD;
         }
         vec2 prevUv = cur + dUv;
         float after = h - curD;
         float before = (1.0 - texture2D(uPomHeight, prevUv).r) - curD + layerD;
         float w = after / (after - before);
         return mix(cur, prevUv, w);
       }\n` + shader.fragmentShader;
    // Shift every UV-driven map fetch to the parallax-corrected UV.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#ifdef USE_MAP
        vec2 pomUv = pomOffset(vMapUv);
        diffuseColor *= texture2D(map, pomUv);
      #endif`,
    );
    material.userData.pomUniforms = shader.uniforms;
  };
  material.needsUpdate = true;
}

// RIM LIGHT (Fresnel edge glow). Adds a view-dependent emissive ring on grazing
// angles — separates the subject from the background, useful for both PBR hero
// shots and the toon look. Reusable global toggle.
function attachRimLight(material, opts = {}) {
  if (!material || material.userData.rimPatched) return;
  material.userData.rimPatched = true;
  const prev = material.onBeforeCompile;
  const uni = {
    uRimColor: { value: new THREE.Color(opts.color ?? 0x88bbff) },
    uRimPower: { value: opts.power ?? 3.0 },
    uRimStrength: { value: opts.strength ?? 0.8 },
  };
  material.onBeforeCompile = (shader) => {
    if (typeof prev === "function") prev(shader);
    Object.assign(shader.uniforms, uni);
    shader.fragmentShader =
      "uniform vec3 uRimColor;\nuniform float uRimPower;\nuniform float uRimStrength;\n" +
      shader.fragmentShader;
    // Add the rim just before tone-mapping/output, using the resolved normal +
    // view dir that three already has in scope (normal, vViewPosition).
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `{
        vec3 V = normalize(vViewPosition);
        float fres = pow(1.0 - clamp(dot(normalize(normal), V), 0.0, 1.0), uRimPower);
        totalEmissiveRadiance += uRimColor * fres * uRimStrength;
      }
      #include <opaque_fragment>`,
    );
    material.userData.rimUniforms = shader.uniforms;
  };
  material.needsUpdate = true;
}

// VOLUMETRIC CLOUD — a per-part raymarch material that replaces the hard
// metaball shell with genuinely soft vapor. The cloud mesh acts only as a
// bounding proxy: in the fragment shader we intersect the view ray with the
// mesh's local bounding sphere, march through it sampling an fbm density field,
// and accumulate Beer-Lambert transmittance with a short secondary march toward
// the sun (self-shadowing) plus a powder term for the bright-core / dark-edge
// read. The silhouette is eroded by the noise, so edges go feathery instead of
// faceted. No time term -> deterministic, screenshot- and TAA-safe.
const CLOUD_VOL_VERT = `
  varying vec3 vLocalPos;
  void main(){
    vLocalPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const CLOUD_VOL_FRAG = `
  precision highp float;
  varying vec3 vLocalPos;
  uniform vec3 uCamLocal, uSunLocal, uCenter, uSeed;
  uniform vec3 uBaseColor, uSunColor, uSkyColor;
  uniform float uRadius, uDensity, uAbsorption, uCoverage, uNoiseFreq;
  uniform int uSteps;
  float hash(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float vnoise(vec3 x){
    vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                   mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                   mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  float fbm(vec3 p){ float a=0.5,s=0.0; for(int i=0;i<5;i++){ s+=a*vnoise(p); p*=2.02; a*=0.5; } return s; }
  float sampleDensity(vec3 p){
    vec3 rel = (p - uCenter) / uRadius;
    float dist = length(rel);
    float shell = smoothstep(1.0, uCoverage, dist);   // 1 at core, 0 past the rim
    if(shell <= 0.0) return 0.0;
    vec3 q = rel * uNoiseFreq + uSeed;
    float warp = fbm(q * 0.5);
    float n = fbm(q + warp * 0.6);
    return clamp(shell * (n * 1.7 - 0.12), 0.0, 1.0);  // noise erodes the edge -> soft silhouette
  }
  float lightMarch(vec3 p){
    float lstep = uRadius * 0.16;
    float dsum = 0.0;
    for(int i=0;i<6;i++){ p += uSunLocal * lstep; dsum += sampleDensity(p); }
    return exp(-dsum * lstep * uAbsorption);
  }
  void main(){
    vec3 ro = uCamLocal;
    vec3 rd = normalize(vLocalPos - uCamLocal);
    vec3 oc = ro - uCenter;
    float b = dot(oc, rd);
    float c = dot(oc, oc) - uRadius * uRadius;
    float h = b*b - c;
    if(h < 0.0) discard;
    h = sqrt(h);
    float t0 = max(-b - h, 0.0), t1 = -b + h;
    float span = t1 - t0;
    if(span <= 0.0) discard;
    int N = uSteps;
    float stepLen = span / float(N);
    float T = 1.0;
    vec3 col = vec3(0.0);
    for(int i=0;i<128;i++){
      if(i >= N) break;
      vec3 p = ro + rd * (t0 + (float(i) + 0.5) * stepLen);
      float dens = sampleDensity(p);
      if(dens > 0.001){
        float lT = lightMarch(p);
        float powder = 1.0 - exp(-dens * 2.0);
        vec3 lit = uSunColor * lT * (0.55 + 0.45 * powder) + uSkyColor;
        float a = clamp(dens * uDensity * stepLen, 0.0, 1.0);
        col += lit * uBaseColor * a * T;   // premultiplied
        T *= (1.0 - a);
        if(T < 0.01) break;
      }
    }
    float alpha = 1.0 - T;
    if(alpha < 0.003) discard;
    gl_FragColor = vec4(col, alpha);
  }`;

// Build a volumetric-cloud ShaderMaterial for one cloud mesh. The mesh's local
// bounding sphere defines the march volume; uSeed is derived from the lump's
// center so each cloud in a sky reads distinct while staying deterministic.
function makeCloudVolumeMaterial(mesh, params = {}) {
  const geo = mesh.geometry;
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  const bs = geo.boundingSphere || { center: new THREE.Vector3(), radius: 1 };
  const tint = params.color || [0.98, 0.99, 1.0];
  const seed = params.seed ?? 7;
  const seedVec = bs.center.clone().multiplyScalar(0.37).addScalar(seed * 0.13);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uCamLocal: { value: new THREE.Vector3() },
      uSunLocal: { value: new THREE.Vector3(0, 1, 0) },
      uCenter: { value: bs.center.clone() },
      uSeed: { value: seedVec },
      uBaseColor: { value: new THREE.Color(tint[0], tint[1], tint[2]) },
      uSunColor: { value: new THREE.Color(1.0, 0.95, 0.85) },
      uSkyColor: { value: new THREE.Color(0.32, 0.38, 0.5) },
      uRadius: { value: bs.radius * 1.08 },
      uDensity: { value: params.density ?? 6.0 },
      uAbsorption: { value: params.absorption ?? 1.6 },
      uCoverage: { value: params.coverage ?? 0.05 },
      uNoiseFreq: { value: params.noiseFreq ?? 3.2 },
      uSteps: { value: params.steps ?? 48 },
    },
    vertexShader: CLOUD_VOL_VERT,
    fragmentShader: CLOUD_VOL_FRAG,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  mat.userData.isCloudVolume = true;
  return mat;
}

const WATERFALL_FX_VERT = `
  uniform float uTime;
  uniform float uFlowSpeed;
  uniform float uKind;
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewPosition;
  void main() {
    vUv = uv;
    vec3 p = position;
    float t = uTime * uFlowSpeed;
    if (uKind < 0.5) {
      p += normal * (sin(uv.y * 17.0 - t * 5.0 + uv.x * 8.0) * 0.025
        + sin(uv.y * 39.0 - t * 8.0 - uv.x * 15.0) * 0.012);
    } else {
      p.y += sin((uv.x + uv.y) * 31.0 + t * 2.4) * 0.018
        + sin((uv.x - uv.y) * 47.0 - t * 3.1) * 0.009;
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    vViewPosition = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;

const WATERFALL_FX_FRAG = `
  uniform float uTime;
  uniform float uFlowSpeed;
  uniform float uKind;
  uniform float uOpacity;
  uniform float uSeed;
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewPosition;
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise21(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + 1.0), f.x), f.y);
  }
  void main() {
    float t = uTime * uFlowSpeed;
    if (uKind < 0.5) {
      float n1 = noise21(vec2(vUv.x * 10.0 + uSeed, vUv.y * 4.2 - t * 2.8));
      float n2 = noise21(vec2(vUv.x * 27.0 - uSeed, vUv.y * 9.0 - t * 5.1));
      float streak = smoothstep(0.48, 0.9, n1 * 0.72 + n2 * 0.5);
      float edge = smoothstep(0.0, 0.075, vUv.x) * smoothstep(0.0, 0.075, 1.0 - vUv.x);
      float fresnel = pow(1.0 - abs(dot(normalize(vNormalView), normalize(vViewPosition))), 2.0);
      vec3 water = mix(vec3(0.13, 0.48, 0.68), vec3(0.88, 0.98, 1.0), streak * 0.86 + fresnel * 0.32);
      float alpha = (0.24 + streak * 0.62 + fresnel * 0.14) * edge * uOpacity;
      if (alpha < 0.035) discard;
      gl_FragColor = vec4(water, alpha);
      return;
    }
    vec2 p = vUv - 0.5;
    float radius = length(p);
    float wave = sin(radius * 95.0 - t * 4.8) * 0.5 + 0.5;
    float crossWave = noise21(p * 24.0 + vec2(t * 0.35, -t * 0.22));
    if (uKind < 1.5) {
      float glint = smoothstep(0.72, 0.98, wave * 0.56 + crossWave * 0.55);
      vec3 pool = mix(vec3(0.025, 0.18, 0.24), vec3(0.18, 0.62, 0.72), glint);
      gl_FragColor = vec4(pool, uOpacity);
      return;
    }
    float broken = smoothstep(0.42, 0.72, crossWave + wave * 0.28);
    if (broken < 0.16) discard;
    gl_FragColor = vec4(mix(vec3(0.72, 0.9, 0.95), vec3(1.0), broken), broken * uOpacity);
  }`;

function makeWaterfallFxMaterial(mesh, fx, params = {}) {
  let mat;
  if (fx === "waterfall-sheet" || fx === "waterfall-pool" || fx === "waterfall-foam-ring") {
    const kind = fx === "waterfall-sheet" ? 0 : fx === "waterfall-pool" ? 1 : 2;
    mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uFlowSpeed: { value: params.flowSpeed ?? 1 },
        uKind: { value: kind },
        uOpacity: { value: params.opacity ?? (kind === 0 ? 0.72 : kind === 1 ? 0.82 : 0.9) },
        uSeed: { value: Number(params.seed || 0) * 0.137 },
      },
      vertexShader: WATERFALL_FX_VERT,
      fragmentShader: WATERFALL_FX_FRAG,
      transparent: true,
      depthWrite: kind === 1,
      side: THREE.DoubleSide,
    });
  } else if (fx === "waterfall-mist") {
    mat = new THREE.MeshBasicMaterial({
      color: 0xdaf7ff,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  } else if (fx === "waterfall-spray") {
    mat = new THREE.MeshPhysicalMaterial({
      color: 0xd9f5ff,
      roughness: 0.08,
      metalness: 0,
      transmission: 0.72,
      thickness: 0.03,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
  } else {
    mat = new THREE.MeshStandardMaterial({
      color: 0xe7fbff,
      emissive: 0x3a6870,
      emissiveIntensity: 0.3,
      roughness: 0.45,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });
  }
  mat.userData.isWaterfallFx = true;
  mesh.renderOrder = fx === "waterfall-pool" ? 1 : fx === "waterfall-sheet" ? 2 : fx === "waterfall-foam-ring" ? 3 : 4;
  return mat;
}

function makePlanetOceanMaterial(mesh, params = {}) {
  mesh.renderOrder = 1;
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.018, 0.13, 0.34),
    metalness: 0,
    roughness: 0.24,
    clearcoat: 0.72,
    clearcoatRoughness: 0.16,
    envMapIntensity: 1.45,
    depthWrite: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
varying vec3 vMeshovaPlanetPosition;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
vMeshovaPlanetPosition = position;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec3 vMeshovaPlanetPosition;
float meshovaOceanHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float meshovaOceanNoise(vec3 p) {
  vec3 cell = floor(p);
  vec3 local = fract(p);
  local = local * local * (3.0 - 2.0 * local);
  float n000 = meshovaOceanHash(cell);
  float n100 = meshovaOceanHash(cell + vec3(1.0, 0.0, 0.0));
  float n010 = meshovaOceanHash(cell + vec3(0.0, 1.0, 0.0));
  float n110 = meshovaOceanHash(cell + vec3(1.0, 1.0, 0.0));
  float n001 = meshovaOceanHash(cell + vec3(0.0, 0.0, 1.0));
  float n101 = meshovaOceanHash(cell + vec3(1.0, 0.0, 1.0));
  float n011 = meshovaOceanHash(cell + vec3(0.0, 1.0, 1.0));
  float n111 = meshovaOceanHash(cell + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, local.x);
  float nx10 = mix(n010, n110, local.x);
  float nx01 = mix(n001, n101, local.x);
  float nx11 = mix(n011, n111, local.x);
  return mix(mix(nx00, nx10, local.y), mix(nx01, nx11, local.y), local.z);
}`)
      .replace("#include <color_fragment>", `#include <color_fragment>
vec3 meshovaOceanP = normalize(vMeshovaPlanetPosition);
float meshovaOceanLarge = meshovaOceanNoise(meshovaOceanP * 7.0 + vec3(3.1, 7.7, 1.9));
float meshovaOceanSmall = meshovaOceanNoise(meshovaOceanP * 21.0 - vec3(8.3, 2.4, 5.6));
float meshovaOceanWave = sin(dot(meshovaOceanP, vec3(17.3, -11.7, 23.1)) * 4.0) * 0.5 + 0.5;
float meshovaOceanDetail = clamp(meshovaOceanLarge * 0.58 + meshovaOceanSmall * 0.3 + meshovaOceanWave * 0.12, 0.0, 1.0);
diffuseColor.rgb *= mix(0.72, 1.18, meshovaOceanDetail);
diffuseColor.rgb += vec3(0.0, 0.025, 0.055) * smoothstep(0.62, 0.92, meshovaOceanDetail);`);
  };
  material.customProgramCacheKey = () => "meshova-planet-ocean-v2";
  return material;
}

function makePlanetAtmosphereMaterial(mesh, params = {}) {
  const color = params.atmosphereColor || [0.18, 0.48, 0.92];
  const strength = Number(params.atmosphereStrength ?? 0.72);
  mesh.renderOrder = 4;
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color[0], color[1], color[2]) },
      uStrength: { value: strength },
    },
    vertexShader: `
      varying vec3 vNormalView;
      varying vec3 vViewDirection;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vViewDirection = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uStrength;
      varying vec3 vNormalView;
      varying vec3 vViewDirection;
      void main() {
        float rim = pow(1.0 - max(dot(normalize(vNormalView), normalize(vViewDirection)), 0.0), 3.2);
        float alpha = rim * uStrength;
        if (alpha < 0.008) discard;
        vec3 color = mix(uColor * 0.48, vec3(0.12, 0.48, 1.0), rim * 0.52);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  });
}

const _waterfallMatrix = new THREE.Matrix4();
const _waterfallPosition = new THREE.Vector3();
const _waterfallRotation = new THREE.Euler();
const _waterfallQuaternion = new THREE.Quaternion();
const _waterfallScale = new THREE.Vector3();

function updateWaterfallFx(time) {
  for (const mesh of waterfallFxMeshes) {
    const uniforms = mesh.material?.uniforms;
    if (uniforms?.uTime) uniforms.uTime.value = time;
    if (!mesh.isInstancedMesh || !Array.isArray(mesh.userData.fxTransforms)) continue;
    const fx = String(mesh.userData.metadata?.renderFx || "");
    const params = mesh.userData.metadata || {};
    const speed = Number(params.flowSpeed || 1);
    const seed = Number(params.seed || 0);
    const baseTransforms = mesh.userData.fxTransforms;
    for (let i = 0; i < mesh.count; i++) {
      const base = baseTransforms[i];
      if (!base) continue;
      const phaseOffset = ((i * 0.61803398875 + seed * 0.071) % 1 + 1) % 1;
      const phase = (time * speed * (fx === "waterfall-mist" ? 0.08 : 0.16) + phaseOffset) % 1;
      _waterfallPosition.fromArray(base.position);
      _waterfallRotation.fromArray([...(base.rotation || [0, 0, 0]), "XYZ"]);
      _waterfallQuaternion.setFromEuler(_waterfallRotation);
      _waterfallScale.fromArray(base.scale || [1, 1, 1]);
      if (fx === "waterfall-spray") {
        const arc = 4 * phase * (1 - phase);
        _waterfallPosition.x *= 0.35 + phase * 0.9;
        _waterfallPosition.y = 0.12 + arc * (0.55 + (i % 11) * 0.055);
        _waterfallPosition.z += (phase - 0.3) * (0.35 + (i % 7) * 0.045);
        _waterfallScale.multiplyScalar(0.95 - phase * 0.5);
      } else if (fx === "waterfall-mist") {
        _waterfallPosition.x += Math.sin(time * 0.32 + i * 1.73) * 0.32;
        _waterfallPosition.y += phase * 0.72;
        _waterfallPosition.z += Math.cos(time * 0.27 + i * 0.91) * 0.22;
        _waterfallScale.multiplyScalar(0.7 + Math.sin(phase * Math.PI) * 0.65);
      } else if (fx === "waterfall-foam") {
        const centerZ = Number(params.depth || 0) * 0.3;
        const x = _waterfallPosition.x;
        const z = _waterfallPosition.z - centerZ;
        const angle = time * speed * 0.055 + (i % 3 === 0 ? -1 : 1) * phase * 0.16;
        _waterfallPosition.x = x * Math.cos(angle) - z * Math.sin(angle);
        _waterfallPosition.z = centerZ + x * Math.sin(angle) + z * Math.cos(angle);
        _waterfallPosition.y += Math.sin(time * 1.7 + i) * 0.016;
      }
      _waterfallMatrix.compose(_waterfallPosition, _waterfallQuaternion, _waterfallScale);
      mesh.setMatrixAt(i, _waterfallMatrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
}

// Refresh per-frame view/light uniforms for every volumetric cloud in the model.
// Camera + sun must be expressed in each mesh's local space (the space the
// bounding sphere and march live in), so we invert each mesh's world matrix.
const _cloudInv = new THREE.Matrix4();
function updateCloudVolumes() {
  modelRoot.updateMatrixWorld(true);
  for (const o of cloudVolumeMeshes) {
    const m = o.material;
    if (!m || !m.userData || !m.userData.isCloudVolume) continue;
    _cloudInv.copy(o.matrixWorld).invert();
    m.uniforms.uCamLocal.value.copy(camera.position).applyMatrix4(_cloudInv);
    m.uniforms.uSunLocal.value.copy(SUN_DIR).transformDirection(_cloudInv).normalize();
  }
}

// HAIR — Marschner-style dual-highlight anisotropic shading via Kajiya-Kay. Real
// hair has two specular lobes along the strand tangent: a primary "R" reflection
// (shifted toward the tip, near-white) and a secondary "TRT" lobe (shifted toward
// the root, tinted by the hair's own absorption color). We derive the strand
// tangent from the surface normal (no tangent attribute needed) and evaluate
// both lobes against the key light, adding them as emissive over the albedo.
function attachHair(material, opts = {}) {
  if (!material || material.userData.hairPatched) return;
  material.userData.hairPatched = true;
  const prev = material.onBeforeCompile;
  const tint = new THREE.Color(opts.tint ?? (material.color ? material.color.getHex() : 0x6b4a2b));
  const uni = {
    uHairLightDir: { value: SUN_DIR.clone() },
    uHairTint: { value: tint },
    uShiftR: { value: opts.shiftR ?? 0.08 },
    uShiftTRT: { value: opts.shiftTRT ?? -0.12 },
    uExpR: { value: opts.expR ?? 120.0 },
    uExpTRT: { value: opts.expTRT ?? 24.0 },
    uHairSpec: { value: opts.strength ?? 0.9 },
  };
  material.onBeforeCompile = (shader) => {
    if (typeof prev === "function") prev(shader);
    Object.assign(shader.uniforms, uni);
    shader.vertexShader =
      "varying vec3 vHairT;\nvarying vec3 vHairWN;\nvarying vec3 vHairWPos;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          vec3 wn = normalize(mat3(modelMatrix) * objectNormal);
          vec3 up = abs(wn.y) < 0.95 ? vec3(0.0,1.0,0.0) : vec3(1.0,0.0,0.0);
          vHairT = normalize(cross(cross(wn, up), wn));
          vHairWN = wn;
          vHairWPos = (modelMatrix * vec4(transformed,1.0)).xyz;
        }`,
      );
    shader.fragmentShader =
      "uniform vec3 uHairLightDir;\nuniform vec3 uHairTint;\nuniform float uShiftR;\nuniform float uShiftTRT;\nuniform float uExpR;\nuniform float uExpTRT;\nuniform float uHairSpec;\nvarying vec3 vHairT;\nvarying vec3 vHairWN;\nvarying vec3 vHairWPos;\n" +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `{
        vec3 T = normalize(vHairT);
        vec3 L = normalize(uHairLightDir);
        vec3 Vw = normalize(cameraPosition - vHairWPos);
        vec3 H = normalize(L + Vw);
        vec3 N = normalize(vHairWN);
        vec3 tR = normalize(T + N * uShiftR);
        vec3 tT = normalize(T + N * uShiftTRT);
        float dotR = dot(tR, H);
        float dotT = dot(tT, H);
        float sinR = sqrt(max(0.0, 1.0 - dotR * dotR));
        float sinT = sqrt(max(0.0, 1.0 - dotT * dotT));
        float specR = pow(sinR, uExpR);
        float specT = pow(sinT, uExpTRT);
        float ndl = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
        vec3 hair = vec3(specR) + uHairTint * specT * 1.5;
        totalEmissiveRadiance += hair * uHairSpec * ndl;
      }
      #include <opaque_fragment>`,
    );
    material.userData.hairUniforms = shader.uniforms;
  };
  material.needsUpdate = true;
}
// neutral shading (matcap), depth, or contact occlusion (ao). These are exactly
// the channels that help an AI segment a model into named parts.
let debugView = "off";

// A procedural matcap: a sphere lit by a soft key + cool fill + warm rim, baked
// into a 2D disc. MeshMatcapMaterial samples it by view-space normal, giving a
// clean, lighting-stable clay look regardless of the scene's IBL — ideal for
// comparing silhouettes/forms across frames.
let matcapTex = null;
function buildMatcapTexture() {
  const s = 256;
  const data = new Uint8Array(s * s * 4);
  const L = new THREE.Vector3(0.4, 0.6, 0.7).normalize();   // key
  const F = new THREE.Vector3(-0.5, -0.2, 0.5).normalize(); // fill
  const R = new THREE.Vector3(0, 0.3, -1).normalize();      // rim (back)
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const nx = (x / (s - 1)) * 2 - 1;
      const ny = 1 - (y / (s - 1)) * 2;
      const r2 = nx * nx + ny * ny;
      const i = (y * s + x) * 4;
      if (r2 > 1) { data[i] = data[i + 1] = data[i + 2] = 0; data[i + 3] = 0; continue; }
      const nz = Math.sqrt(1 - r2);
      const n = new THREE.Vector3(nx, ny, nz);
      const key = Math.max(0, n.dot(L));
      const fill = Math.max(0, n.dot(F)) * 0.4;
      const rim = Math.pow(Math.max(0, n.dot(R)), 2) * 0.5;
      const base = 0.18 + 0.82 * (0.7 * key + fill);
      let r = base + rim * 0.6, g = base + rim * 0.7, b = base * 1.04 + rim;
      const enc = (v) => Math.max(0, Math.min(255, Math.round(Math.pow(Math.min(1, v), 1 / 2.2) * 255)));
      data[i] = enc(r); data[i + 1] = enc(g); data[i + 2] = enc(b); data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, s, s, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// --- NPR / cel (toon) shading ---------------------------------------------
// Tunable cel parameters, driven by the toolbar (segments / outline width/color).
const toonParams = { steps: 4, outline: 0.012, color: 0x12141a };
let lowPolyGradientTex = null;
// Optional PBR shader enhancements (global toggles, applied at material build).
let edgeWearOn = false;
const edgeWearOpts = { amount: 0.6, width: 1.5, tint: 0xb8b0a0 };
let pomOn = false;
const pomOpts = { scale: 0.06, layers: 24 };
let rimOn = false;
const rimOpts = { color: 0x88bbff, power: 3.0, strength: 0.8 };
let fogOn = false;
const fogOpts = { density: 0.12, height: 1.5, shaft: 0.5 };
// Volumetric cloud rendering: on by default so cloud parts render as soft vapor
// via raymarch instead of the hard metaball shell. Toggled by "体积云".
let cloudVolOn = true;
// A stepped gradient ramp turns MeshToonMaterial's diffuse falloff into hard
// cel bands (shadow / mid / light) instead of a smooth gradient. This is the
// "anime" look the Sketchfab data showed dominating the character category.
let toonGradientTex = null;
function buildToonGradient(steps = toonParams.steps) {
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) {
    // Bias the ramp so the lit band is wide and the shadow band reads dark but
    // not black — typical of stylized character shading.
    const t = i / (steps - 1);
    data[i] = Math.round((0.32 + 0.68 * t) * 255);
  }
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function buildLowPolyGradient() {
  const data = new Uint8Array([68, 112, 166, 224]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// An inverted-hull outline: a back-faced shell expanded in clip space. Keeping
// thickness in screen space prevents close-up or faceted meshes from exploding.
function makeOutlineMaterial(thickness = toonParams.outline, color = toonParams.color) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uThickness: { value: thickness }, uColor: { value: new THREE.Color(color) } },
    vertexShader: `
      uniform float uThickness;
      void main() {
        vec3 n = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec4 clip = projectionMatrix * mv;
        vec2 direction = normalize(n.xy + vec2(0.00001));
        clip.xy += direction * uThickness * clip.w;
        gl_Position = clip;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }`,
  });
  return mat;
}

// Build a toon material for a part, carrying over its baked albedo map / color
// so the cel look still respects the matched per-part material.
function makeToonMaterial(srcMat, fallbackColor, hasVColors) {
  const m = new THREE.MeshToonMaterial({ gradientMap: toonGradientTex });
  if (srcMat && srcMat.map) {
    m.map = srcMat.map;
  } else if (srcMat && srcMat.color) {
    m.color = srcMat.color.clone();
  } else if (fallbackColor) {
    m.color = new THREE.Color(fallbackColor[0], fallbackColor[1], fallbackColor[2]);
  }
  if (hasVColors) m.vertexColors = true;
  if (srcMat && srcMat.emissiveMap) { m.emissive = new THREE.Color(0xffffff); m.emissiveMap = srcMat.emissiveMap; }
  return m;
}

function makeLowPolyMaterial(srcMat, fallbackColor, hasVColors) {
  const material = new THREE.MeshToonMaterial({
    gradientMap: lowPolyGradientTex,
    flatShading: true,
    vertexColors: !!hasVColors,
  });
  if (srcMat?.map) material.map = srcMat.map;
  if (srcMat?.color) material.color = srcMat.color.clone();
  else if (fallbackColor) material.color = new THREE.Color(fallbackColor[0], fallbackColor[1], fallbackColor[2]);
  if (srcMat?.emissiveMap) {
    material.emissive = new THREE.Color(0xffffff);
    material.emissiveMap = srcMat.emissiveMap;
  }
  material.transparent = !!srcMat?.transparent;
  material.opacity = srcMat?.opacity ?? 1;
  material.alphaTest = srcMat?.alphaTest ?? 0;
  return material;
}


// Apply the active debug view. Material-swap modes (normal/matcap/depth) replace
// every part's material; 'ao' instead routes the GTAO pass to its raw AO output;
// 'off' restores the real materials + GTAO blend.
function applyDebugView(mode) {
  debugView = mode;
  // AO is a post-pass channel, not a material — toggle the GTAO output.
  if (gtao) gtao.output = (mode === "ao") ? GTAOPass.OUTPUT.AO : GTAOPass.OUTPUT.Default;

  // Always strip any previous toon outline shells before re-deciding the look.
  clearOutlines();

  if (mode === "off" || mode === "ao") {
    // Rebuild real materials (applyMaterial guards against re-entry via debugView).
    applyMaterial(currentPreset);
    resetTAA();
    return;
  }
  if (mode === "toon") { applyToon(); resetTAA(); return; }
  if (mode === "lowpoly") { applyLowPoly(); resetTAA(); return; }
  if (mode === "matcap" && !matcapTex) matcapTex = buildMatcapTexture();
  modelRoot.traverse((o) => {
    if (!o.isMesh) return;
    o.material.dispose?.();
    if (mode === "normal") {
      o.material = new THREE.MeshNormalMaterial();
    } else if (mode === "depth") {
      const m = new THREE.MeshDepthMaterial();
      o.material = m;
    } else if (mode === "matcap") {
      o.material = new THREE.MeshMatcapMaterial({ matcap: matcapTex });
    }
    o.material.wireframe = wireframe;
    applyPartRenderHints(o);
  });
  refreshDynamicMeshLists();
  resetTAA();
}

function applyLowPoly() {
  lowPolyGradientTex?.dispose?.();
  lowPolyGradientTex = buildLowPolyGradient();
  const keep = debugView;
  debugView = "off";
  applyMaterial(currentPreset, { skipPanel: true });
  debugView = keep;

  modelRoot.traverse((object) => {
    if (!object.isMesh || object.userData.isOutline) return;
    const material = makeLowPolyMaterial(object.material, object.userData.baseColor, object.userData.vertexColors);
    material.wireframe = wireframe;
    object.material.dispose?.();
    object.material = material;
    applyPartRenderHints(object);
  });
  refreshDynamicMeshLists();
}

// Remove inverted-hull outline shells added by the toon view.
function clearOutlines() {
  const dead = [];
  modelRoot.traverse((o) => { if (o.userData && o.userData.isOutline) dead.push(o); });
  for (const o of dead) { o.geometry = null; o.material.dispose?.(); o.parent && o.parent.remove(o); }
}

// NPR cel look: bake the real per-part materials first (so toon keeps each
// part's matched albedo), convert every part to a stepped MeshToonMaterial, and
// add an inverted-hull outline shell as a child of each part.
function applyToon() {
  // Rebuild the gradient each entry so a changed step count takes effect.
  if (toonGradientTex) toonGradientTex.dispose?.();
  toonGradientTex = buildToonGradient(toonParams.steps);
  // Build the real materials without re-routing back into the toon view.
  const keep = debugView; debugView = "off";
  applyMaterial(currentPreset, { skipPanel: true });
  debugView = keep;

  const parts = [];
  modelRoot.traverse((o) => { if (o.isMesh && !o.userData.isOutline) parts.push(o); });
  for (const o of parts) {
    const toon = makeToonMaterial(o.material, o.userData.baseColor, o.userData.vertexColors);
    toon.wireframe = wireframe;
    o.material.dispose?.();
    o.material = toon;
    applyPartRenderHints(o);
    // Outline shell shares the geometry, drawn back-faced and pushed out.
    const outline = o.isInstancedMesh
      ? new THREE.InstancedMesh(o.geometry, makeOutlineMaterial(), o.count)
      : new THREE.Mesh(o.geometry, makeOutlineMaterial());
    if (o.isInstancedMesh) {
      outline.instanceMatrix.copy(o.instanceMatrix);
      outline.instanceMatrix.needsUpdate = true;
    }
    outline.userData.isOutline = true;
    outline.castShadow = false;
    outline.receiveShadow = false;
    o.add(outline);
  }
  refreshDynamicMeshLists();
}


// Apply a procedural material preset to every part (or restore flat colors).
// size: bake resolution (low while dragging, full on release).
// skipPanel: don't rebuild the param DOM (avoids interrupting a drag).
function applyMaterial(presetName, { size = 256, skipPanel = false } = {}) {
  currentPreset = presetName;
  if (edgeWearOn) ensureCurvatureAttributes();

  // A material-swap debug view (normal/matcap/depth) overrides real materials.
  // Re-route to it so rebuilds/material changes keep the debug look.
  if (debugView === "normal" || debugView === "matcap" || debugView === "depth") {
    applyDebugView(debugView);
    updateScriptPanel();
    return;
  }
  if (debugView === "toon" || debugView === "lowpoly") { applyDebugView(debugView); updateScriptPanel(); return; }

  // "model" mode: each part wears its own matched surface material. Parts that
  // ship a surface ref get a baked MeshPhysicalMaterial (glass/metal/...);
  // parts without one keep their flat color. This is the matched model+material
  // path — no global preset overriding the geometry.
  if (presetName === "model") {
    currentMatPreset = null;
    currentSurfaceName = null;
    const surfaceMaterialCache = new Map();
    const connectedWaterMaterialCache = new Map();
    modelRoot.traverse((o) => {
      if (!o.isMesh) return;
      o.material.dispose?.();
      const surf = o.userData.surface;
      const tex = o.userData.textures;
      const renderFx = String(o.userData.metadata?.renderFx || "");
      if (renderFx === "planet-ocean") {
        o.material = makePlanetOceanMaterial(o, o.userData.metadata || {});
      } else if (renderFx === "planet-atmosphere") {
        o.material = makePlanetAtmosphereMaterial(o, o.userData.metadata || {});
      } else if (renderFx.startsWith("waterfall-")) {
        o.material = makeWaterfallFxMaterial(o, renderFx, o.userData.metadata || {});
      } else if (tex) {
        o.material = makePartMaterial(o.userData.baseColor || [0.8, 0.8, 0.8], o.userData.vertexColors, tex);
        if (edgeWearOn) attachEdgeWear(o.material, edgeWearOpts);
        if (pomOn) attachPOM(o.material, pomOpts);
        if (rimOn) attachRimLight(o.material, rimOpts);
      } else if (surf && surf.type === "cloud" && cloudVolOn) {
        // Volumetric path: cloud parts raymarch into soft vapor instead of
        // wearing the hard metaball shell as a physical surface.
        o.material = makeCloudVolumeMaterial(o, surf.params || {});
      } else if (surf && surf.type === "water") {
        const ov = surfaceOverrides[o.name];
        const ref = ov ? { type: "water", params: { ...(surf.params || {}), ...ov } } : surf;
        const waterSystem = !ov && o.userData.metadata?.waterSystem;
        if (waterSystem) {
          const key = `${waterSystem}|${JSON.stringify(ref.params || {})}`;
          let material = connectedWaterMaterialCache.get(key);
          if (!material) {
            material = bakeWaterSurface(ref, size, o.userData.baseColor || [0.1, 0.35, 0.42]);
            connectedWaterMaterialCache.set(key, material);
          }
          o.material = material;
        } else {
          o.material = bakeWaterSurface(ref, size, o.userData.baseColor || [0.1, 0.35, 0.42]);
        }
      } else if (surf) {
        // Merge any live per-part override onto the part's own surface params,
        // so the right panel retunes this exact matched material.
        const ov = surfaceOverrides[o.name];
        const ref = ov ? { type: surf.type, params: { ...(surf.params || {}), ...ov } } : surf;
        const m = cachedSurfaceMaterial(surfaceMaterialCache, ref, size, o.userData.baseColor || [0.8, 0.8, 0.8]);
        // If the part also ships per-vertex colors (e.g. a triplanar-baked rock),
        // let those drive the albedo and keep only the surface's roughness/normal/
        // ao质感: drop the UV-space color map (which would stretch on unwrapped
        // meshes) and multiply the physical material by the vertex colors instead.
        if (m && o.userData.vertexColors) {
          m.vertexColors = true;
          m.map = null;
          m.color = new THREE.Color(1, 1, 1);
        }
        o.material = m || makePartMaterial(o.userData.baseColor, o.userData.vertexColors);
        // Skin uses cylindrical UVs that pinch at the head crown -> triplanar.
        if (surf.type === "skin") attachTriplanar(o.material);
        if (surf.type === "hair") attachHair(o.material);
        // Optional shader enhancements (global toggles).
        if (edgeWearOn) attachEdgeWear(o.material, edgeWearOpts);
        if (pomOn) attachPOM(o.material, pomOpts);
        if (rimOn) attachRimLight(o.material, rimOpts);
      } else {
        o.material = makePartMaterial(o.userData.baseColor || [0.8, 0.8, 0.8], o.userData.vertexColors);
      }
      o.material.wireframe = wireframe;
      ensureWind(o);
      applyPartRenderHints(o);
    });
    if (!skipPanel) renderMatPanel();
    applySelectionHighlight();
    updateScriptPanel();
    refreshDynamicMeshLists();
    return;
  }

  // Named surface type (glass/metal/marble/skin/gem/...): bake one
  // MeshPhysicalMaterial and apply it to every part. This is how the new AAA
  // surface library is previewed globally from the dropdown.
  if (isSurface(presetName)) {
    currentMatPreset = null;
    // Load this surface's default params the first time it's selected, so the
    // panel has values to show and edit.
    if (currentSurfaceName !== presetName) {
      currentSurfaceName = presetName;
      currentSurfaceParams = defaultSurfaceParams(presetName);
    }
    const shared = presetName === "water"
      ? bakeWaterSurface({ type: "water", params: { ...currentSurfaceParams } }, size)
      : bakeSurface({ type: presetName, params: { ...currentSurfaceParams } }, size);
    if (shared && edgeWearOn) attachEdgeWear(shared, edgeWearOpts);
    if (shared && pomOn) attachPOM(shared, pomOpts);
    if (shared && rimOn) attachRimLight(shared, rimOpts);
    modelRoot.traverse((o) => {
      if (!o.isMesh) return;
      o.material.dispose?.();
      o.material = shared || makePartMaterial(o.userData.baseColor, o.userData.vertexColors);
      if (presetName === "skin" && o.material) attachTriplanar(o.material);
      if (presetName === "hair" && o.material) attachHair(o.material);
      o.material.wireframe = wireframe;
      ensureWind(o);
      applyPartRenderHints(o);
    });
    if (!skipPanel) renderMatPanel();
    applySelectionHighlight();
    updateScriptPanel();
    refreshDynamicMeshLists();
    return;
  }
  currentSurfaceName = null;
  if (presetName !== "none" && (!currentMatPreset || currentMatPreset !== presetName)) {
    currentMatParams = defaultMatParams(presetName);
  }
  currentMatPreset = presetName;

  // Bake once and share across parts with the same params. Only plushFur reads
  // a per-part tint, so it still needs a per-part bake.
  let shared = null;
  const perPartTint = presetName === "plushFur";
  if (presetName !== "none" && !perPartTint) {
    shared = bakeMaterial(presetName, size, { ...currentMatParams });
  }

  modelRoot.traverse((o) => {
    if (!o.isMesh) return;
    o.material.dispose?.();
    if (presetName === "none") {
      o.material = makePartMaterial(o.userData.baseColor || [0.8, 0.8, 0.8], o.userData.vertexColors);
    } else if (shared) {
      o.material = shared;
    } else {
      const params = { ...currentMatParams };
      const c = o.userData.baseColor;
      if (c && !params.tint) params.tint = c;
      o.material = bakeMaterial(presetName, size, params);
    }
    o.material.wireframe = wireframe;
    ensureWind(o);
    applyPartRenderHints(o);
  });
  if (!skipPanel) renderMatPanel();
  applySelectionHighlight();
  updateScriptPanel();
  refreshDynamicMeshLists();
}

/**
 * Make sure a wind-bearing mesh's current material carries the sway shader. If
 * the material is shared across parts, clone it first so patching one foliage
 * part doesn't make non-foliage parts sway.
 */
function ensureWind(o) {
  if (!o.userData.hasWind) return;
  if (!o.material.userData.windPatched) {
    o.material = o.material.clone();
    attachWind(o.material);
  }
}

function refreshDynamicMeshLists() {
  windMeshes = [];
  cloudVolumeMeshes = [];
  waterfallFxMeshes = [];
  waterSurfaceMeshes = [];
  modelRoot.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline) return;
    if (o.userData.hasWind) windMeshes.push(o);
    if (o.material?.userData?.isCloudVolume) cloudVolumeMeshes.push(o);
    if (o.material?.userData?.isWaterfallFx) waterfallFxMeshes.push(o);
    if (o.material?.userData?.isWaterSurface) waterSurfaceMeshes.push(o);
  });
}

function updateWaterSurfaceFx(time) {
  for (const mesh of waterSurfaceMeshes) {
    const material = mesh.material;
    if (!material?.userData?.isWaterSurface) continue;
    material.userData.waterTime = time;
    const uniforms = material.userData.waterUniforms;
    if (uniforms?.uWaterTime) uniforms.uWaterTime.value = time;
    if (uniforms?.uWaterSceneDepth) uniforms.uWaterSceneDepth.value = fogDepthRT.texture;
    if (uniforms?.uWaterDepthResolution) uniforms.uWaterDepthResolution.value.set(fogDepthRT.width, fogDepthRT.height);
    if (uniforms?.uWaterCameraNear) uniforms.uWaterCameraNear.value = camera.near;
    if (uniforms?.uWaterCameraFar) uniforms.uWaterCameraFar.value = camera.far;
    if (uniforms?.uWaterDepthAvailable) uniforms.uWaterDepthAvailable.value = 1;
  }
}

let lastSize = new THREE.Vector3(3, 3, 3);
function updateCameraClipPlanes() {
  const camDist = camera.position.distanceTo(controls.target);
  const r = Math.max(lastSize.x, lastSize.y, lastSize.z);
  camera.near = Math.max(0.05, (camDist - r * 2) * 0.5);
  camera.far = Math.max(camera.near + 1, (camDist + r * 3) * 2);
  camera.updateProjectionMatrix();
}

function fitView(view, size) {
  if (view && ["persp", "front", "side", "top"].includes(view)) currentView = view;
  if (size) lastSize = size.clone();
  const s = lastSize;
  const r = Math.max(s.x, s.y, s.z);
  const d = r * 1.9;
  const cy = s.y * 0.5;
  const targets = {
    persp: [d * 0.7, cy + r * 0.5, d],
    front: [0, cy, d * 1.3],
    side: [d * 1.3, cy, 0.0001],
    top: [0.0001, d * 1.6, 0],
  };
  const p = targets[view] || targets.persp;
  camera.position.set(p[0], p[1], p[2]);
  controls.target.set(0, cy, 0);
  // Adapt clip planes to the model size so large models (terrain/tracks) aren't
  // culled by a fixed far plane. Keep a generous margin around the fit distance.
  updateCameraClipPlanes();
  controls.update();
  // Keep DOF focused on the model center (distance from camera to target).
  if (bokeh) bokeh.uniforms["focus"].value = camera.position.distanceTo(controls.target);
  resetTAA();
}

function zoomCamera(factor) {
  const f = Math.max(0.1, Number(factor) || 1);
  const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
  offset.multiplyScalar(1 / f);
  camera.position.copy(controls.target).add(offset);
  updateCameraClipPlanes();
  controls.update();
  if (bokeh) bokeh.uniforms["focus"].value = camera.position.distanceTo(controls.target);
  resetTAA();
}

function applyWire() {
  modelRoot.traverse((o) => { if (o.isMesh && !o.userData.isOutline) o.material.wireframe = wireframe; });
}

// Selected part glows via emissive; others normal.
function applySelectionHighlight() {
  modelRoot.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline || !o.material.emissive) return;
    // Skip self-emissive materials (neon/emissive) — zeroing their emissive would
    // kill the glow since three multiplies emissive by emissiveMap.
    if (o.material.emissiveMap) return;
    if (o.name === selectedPart) {
      o.material.emissive.setRGB(0.15, 0.45, 0.15);
    } else {
      o.material.emissive.setRGB(0, 0, 0);
    }
  });
}

function renderPartList(parts) {
  const boxEl = document.getElementById("parts");
  boxEl.innerHTML = "";
  parts.forEach((part) => {
    const row = document.createElement("div");
    row.className = "part" + (part.name === selectedPart ? " sel" : "");
    const sw = document.createElement("span");
    sw.className = "sw";
    const c = part.color || (part.colors && part.colors.length >= 3
      ? [part.colors[0], part.colors[1], part.colors[2]]
      : [0.7, 0.7, 0.7]);
    sw.style.background = `rgb(${(c[0]*255)|0},${(c[1]*255)|0},${(c[2]*255)|0})`;
    const name = document.createElement("span");
    name.textContent = part.label || part.name;
    name.title = part.label ? `${part.label} (${part.name})` : part.name;
    row.append(sw, name);
    row.onclick = () => {
      selectedPart = selectedPart === part.name ? null : part.name;
      if (selectedPart && drawableBindingSpec()) setBindingEditEnabled(true);
      renderPartList(parts);
      applySelectionHighlight();
      renderMatPanel();
      updateScriptPanel();
    };
    boxEl.appendChild(row);
  });
}

function updateMeta() {
  const perfLabel = activePerfTier === "fast" ? "快速" : activePerfTier === "balanced" ? "均衡" : "质量";
  const instanceLabel = lastMeta.gpuInstances > 0
    ? ` · GPU实例 <b>${lastMeta.gpuInstances}</b> · GPU顶点 <b>${lastMeta.gpuVerts}</b>`
    : "";
  document.getElementById("meta").innerHTML =
    `部件 <b>${lastMeta.parts}</b> · 顶点 <b>${lastMeta.verts}</b> · 三角面 <b>${lastMeta.tris}</b>${instanceLabel} · 渲染 <b>${perfLabel}</b>`;
}

// ---- script inspector ----
let scriptPanelOpen = false;
let scriptUpdateToken = 0;
let procModelsSourcePromise = null;

function jsonBlock(value) {
  return JSON.stringify(value, (_key, v) => {
    if (typeof v === "number" && Number.isFinite(v)) return Number(v.toFixed(6));
    return v;
  }, 2);
}

function materialStateForScript() {
  const surfaces = currentParts
    .filter((p) => p && p.surface)
    .map((p) => ({
      part: p.name,
      surface: p.surface,
      override: surfaceOverrides[p.name] || null,
    }));
  return {
    mode: currentPreset,
    selectedPart,
    surfaces,
    globalSurface: currentSurfaceName ? { type: currentSurfaceName, params: currentSurfaceParams } : null,
    preset: currentMatPreset ? { name: currentMatPreset, params: currentMatParams } : null,
    enhancements: {
      edgeWear: edgeWearOn,
      pom: pomOn,
      rimLight: rimOn,
    },
  };
}

function fetchProcModelsSource() {
  if (!procModelsSourcePromise) {
    procModelsSourcePromise = fetch("/web/procmodels.js", { cache: "no-store" })
      .then((res) => res.ok ? res.text() : "")
      .catch(() => "");
  }
  return procModelsSourcePromise;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findMatchingBrace(text, start) {
  let depth = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (lineComment) {
      if (ch === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === "*" && next === "/") { blockComment = false; i++; }
      continue;
    }
    if (quote) {
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "/" && next === "/") { lineComment = true; i++; continue; }
    if (ch === "/" && next === "*") { blockComment = true; i++; continue; }
    if (ch === "\"" || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function extractProcModelSource(moduleText, model) {
  if (!moduleText || !model || !model.id) return null;
  const re = new RegExp(`\\bid\\s*:\\s*["']${escapeRegExp(model.id)}["']`);
  const idMatch = re.exec(moduleText);
  if (!idMatch) return null;
  const prefix = moduleText.slice(0, idMatch.index);
  const matches = [...prefix.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*\{/g)];
  const startMatch = matches[matches.length - 1];
  if (!startMatch) return null;
  const braceStart = startMatch.index + startMatch[0].lastIndexOf("{");
  const braceEnd = findMatchingBrace(moduleText, braceStart);
  if (braceEnd < 0) return null;
  const name = startMatch[1];
  return {
    name,
    file: "/web/procmodels.js",
    source: `const ${name} = ${moduleText.slice(braceStart, braceEnd + 1)};`,
  };
}

function functionSourceForScript(fn) {
  let src = Function.prototype.toString.call(fn);
  if (/^async\s+[A-Za-z_$][\w$]*\s*\(/.test(src)) src = src.replace(/^async\s+([A-Za-z_$][\w$]*)\s*\(/, "async function $1(");
  else if (/^[A-Za-z_$][\w$]*\s*\(/.test(src)) src = src.replace(/^([A-Za-z_$][\w$]*)\s*\(/, "function $1(");
  return src;
}

async function buildScriptText() {
  const header = [
    "// Meshova 当前预览脚本",
    `// 模型: ${currentModel ? `${currentModel.name} (${currentModel.id || "runtime"})` : (currentLoadedSourceName || "runtime")}`,
    `// 部件: ${lastMeta.parts || 0} · 顶点: ${lastMeta.verts || 0} · 三角面: ${lastMeta.tris || 0}`,
  ];
  const paramsText = jsonBlock(currentParams || {});
  const materialText = jsonBlock(materialStateForScript());

  if (currentLoadedSource) {
    return [
      ...header,
      "// 来源: ViewerModel.source",
      "",
      currentLoadedSource.trim(),
      "",
      "// 当前材质状态",
      `const materialState = ${materialText};`,
    ].join("\n");
  }

  if (currentModel?.semanticRuntime) {
    return [
      ...header,
      `// 来源: ${currentModel.sourceName || "ViewerModel"}`,
      "// 类型: SemanticMeshModel + 部件级程序化变形控制器",
      "",
      `const params = ${paramsText};`,
      "",
      "// 运行时代码: viewer 从 ViewerModel 转 NamedPart，调用 semanticModelFromParts/deformSemanticMesh/semanticModelToNamedParts。",
      "// 当前材质状态",
      `const materialState = ${materialText};`,
    ].join("\n");
  }

  if (currentModel) {
    const moduleText = await fetchProcModelsSource();
    const info = extractProcModelSource(moduleText, currentModel);
    if (info) {
      return [
        ...header,
        `// 源文件: ${info.file}`,
        "// helper/imports 同文件提供；参数为当前滑块值。",
        "",
        `const params = ${paramsText};`,
        "",
        info.source,
        "",
        `const parts = await ${info.name}.build(params);`,
        "",
        "// 当前材质状态",
        `const materialState = ${materialText};`,
      ].join("\n");
    }
    return [
      ...header,
      "// 源码回退: 当前 build 函数",
      "",
      `const params = ${paramsText};`,
      "",
      `const build = (${functionSourceForScript(currentModel.build)});`,
      "const parts = await build(params);",
      "",
      "// 当前材质状态",
      `const materialState = ${materialText};`,
    ].join("\n");
  }

  if (currentPlan) {
    return [
      ...header,
      "// 当前显示来自 OpPlan。",
      "",
      `const opPlan = ${jsonBlock(currentPlan)};`,
      "",
      "// 当前材质状态",
      `const materialState = ${materialText};`,
    ].join("\n");
  }

  return [
    ...header,
    "// 当前模型未携带脚本源码。",
    "",
    "// 当前材质状态",
    `const materialState = ${materialText};`,
  ].join("\n");
}

async function updateScriptPanel() {
  if (!scriptPanelOpen || !scriptCodeEl) return;
  const token = ++scriptUpdateToken;
  if (!scriptCodeEl.textContent) scriptCodeEl.textContent = "加载脚本...";
  const text = await buildScriptText();
  if (token !== scriptUpdateToken) return;
  scriptCodeEl.textContent = text;
}

function setScriptPanelOpen(open) {
  scriptPanelOpen = !!open;
  if (!scriptPanel) return;
  scriptPanel.classList.toggle("open", scriptPanelOpen);
  scriptPanel.setAttribute("aria-hidden", scriptPanelOpen ? "false" : "true");
  if (scriptToggleBtn) scriptToggleBtn.classList.toggle("on", scriptPanelOpen);
  if (scriptPanelOpen) updateScriptPanel();
}

const SEMANTIC_GLOBAL_SCHEMA = [
  { key: "scaleX", label: "整体X缩放", min: 0.5, max: 1.8, step: 0.01, default: 1 },
  { key: "scaleY", label: "整体Y缩放", min: 0.5, max: 1.8, step: 0.01, default: 1 },
  { key: "scaleZ", label: "整体Z缩放", min: 0.5, max: 1.8, step: 0.01, default: 1 },
];
const SEMANTIC_PARAM_PART_LIMIT = 12;

function semanticPartParamKey(partName, suffix) {
  return `part:${partName}:${suffix}`;
}

function semanticPartLabel(part, i) {
  if (part.label) return part.label;
  const raw = String(part.name || "");
  if (/^(root|mesh|object|component)[._-]?\d+$/i.test(raw)) return `部件${i + 1}`;
  return raw || `部件${i + 1}`;
}

function makeSemanticParamSpec(part, i, suffix, label, min, max, step, defaultValue) {
  return {
    key: semanticPartParamKey(part.name, suffix),
    label: `${semanticPartLabel(part, i)} · ${label}`,
    min,
    max,
    step,
    default: defaultValue,
  };
}

function isSemanticSupportSurface(part) {
  const text = `${part.name || ""} ${part.metadata?.role || ""}`.toLowerCase();
  return /(^|[_\s-])(terrain|ground|landscape|floor|地形|地面)([_\s-]|$)/.test(text);
}

function semanticParamSchema(parts, { maxParts = SEMANTIC_PARAM_PART_LIMIT } = {}) {
  const ranked = [...parts]
    .map((part, i) => ({ part, i, tris: part.mesh.indices.length / 3, verts: part.mesh.positions.length }))
    .filter(({ part }) => !isSemanticSupportSurface(part))
    .sort((a, b) => b.tris - a.tris || b.verts - a.verts);
  const schema = [...SEMANTIC_GLOBAL_SCHEMA];
  const selected = Number.isFinite(maxParts) ? ranked.slice(0, Math.max(0, Math.round(maxParts))) : ranked;
  for (const { part, i } of selected) {
    schema.push(
      makeSemanticParamSpec(part, i, "length", "拉长", 0.45, 1.8, 0.01, 1),
      makeSemanticParamSpec(part, i, "thickness", "变粗", 0.45, 1.8, 0.01, 1),
      makeSemanticParamSpec(part, i, "twist", "扭转", -1.2, 1.2, 0.01, 0),
      makeSemanticParamSpec(part, i, "bend", "弯曲", -1.2, 1.2, 0.01, 0),
      makeSemanticParamSpec(part, i, "taper", "收分", -0.8, 0.8, 0.01, 0),
    );
  }
  return schema;
}

function defaultParamsFromSchema(schema) {
  const params = {};
  for (const spec of schema) params[spec.key] = spec.default;
  return params;
}

function semanticLongestAxis(part) {
  const b = new THREE.Box3();
  for (const p of part.mesh.positions) b.expandByPoint(new THREE.Vector3(p.x, p.y, p.z));
  const size = new THREE.Vector3();
  b.getSize(size);
  if (size.x >= size.y && size.x >= size.z) return "x";
  if (size.y >= size.z) return "y";
  return "z";
}

function semanticAnalysisFromModel(model, entry = {}) {
  const meta = model?.meta || {};
  return entry.semanticAnalysis || meta.semanticAnalysis || meta.objectSemantic || meta.aiSemantic || null;
}

function normalizeViewerSemanticAnalysis(analysis) {
  if (!analysis || typeof analysis !== "object") return null;
  const out = {};
  if (typeof analysis.object === "string" && analysis.object.trim()) out.object = analysis.object.trim();
  if (typeof analysis.category === "string" && analysis.category.trim()) out.category = analysis.category.trim();
  if (typeof analysis.confidence === "number") out.confidence = Math.max(0, Math.min(1, analysis.confidence));
  if (analysis.partLabels && typeof analysis.partLabels === "object") out.partLabels = { ...analysis.partLabels };
  if (Array.isArray(analysis.parts)) out.parts = analysis.parts.map((part) => ({ ...part }));
  return Object.keys(out).length ? out : null;
}

function trustedPartLabel(part) {
  const source = part.metadata?.labelSource;
  return source === "ai" || source === "explicit" || source === "user";
}

function remapSemanticVertexAttribute(model, semanticPart, values, itemSize) {
  if (!semanticPart || !Array.isArray(values) || values.length !== semanticPart.vertices.length * itemSize) {
    return values;
  }
  const vertexSet = new Set(semanticPart.vertices);
  const localIndex = new Map(semanticPart.vertices.map((vertex, index) => [vertex, index]));
  const ordered = [];
  const seen = new Set();
  for (let i = 0; i < model.mesh.indices.length; i += 3) {
    const triangle = [model.mesh.indices[i], model.mesh.indices[i + 1], model.mesh.indices[i + 2]];
    if (!triangle.every((vertex) => vertexSet.has(vertex))) continue;
    for (const vertex of triangle) {
      if (seen.has(vertex)) continue;
      seen.add(vertex);
      ordered.push(vertex);
    }
  }
  const remapped = new Array(ordered.length * itemSize);
  for (let outputIndex = 0; outputIndex < ordered.length; outputIndex++) {
    const sourceIndex = localIndex.get(ordered[outputIndex]);
    for (let component = 0; component < itemSize; component++) {
      remapped[outputIndex * itemSize + component] = values[sourceIndex * itemSize + component];
    }
  }
  return remapped;
}

function buildSemanticLiveModel(sourceParts, name = "语义网格实时变形", prompt = "", options = {}) {
  const baseParts = sourceParts.map((part) => ({
    ...part,
    mesh: makeMesh({
      positions: part.mesh.positions.map((p) => ({ ...p })),
      normals: part.mesh.normals.map((n) => ({ ...n })),
      uvs: part.mesh.uvs.map((uv) => ({ ...uv })),
      indices: Array.from(part.mesh.indices),
    }),
  }));
  const inferLabels = options.inferLabels !== false;
  if (inferLabels) {
    const analysis = normalizeViewerSemanticAnalysis(options.analysis);
    const shouldReplaceExisting = options.replaceExistingLabels === true
      || !!analysis
      || baseParts.some((part) => part.label && !trustedPartLabel(part));
    const labelInput = shouldReplaceExisting
      ? baseParts.map((part) => (trustedPartLabel(part) ? part : { ...part, label: undefined }))
      : baseParts;
    const inferredLabels = inferSemanticPartLabels(labelInput, {
      prompt,
      analysis,
      replaceExistingLabels: shouldReplaceExisting,
    });
    const inferredByName = new Map(inferredLabels.map((item) => [item.name, item]));
    for (const part of baseParts) {
      if (!part.label || shouldReplaceExisting || analysis) {
        const inferred = inferredByName.get(part.name);
        if (inferred) {
          part.label = inferred.label;
          part.metadata = {
            ...(part.metadata || {}),
            role: inferred.role,
            labelConfidence: inferred.confidence,
            labelSource: inferred.source || (analysis ? "ai" : "generic"),
          };
        }
      }
    }
  } else {
    baseParts.forEach((part, i) => {
      if (part.label) return;
      part.label = semanticPartLabel(part, i);
      part.metadata = {
        ...(part.metadata || {}),
        role: part.metadata?.role || "component",
        labelConfidence: part.metadata?.labelConfidence || 1,
      };
    });
  }
  const schema = semanticParamSchema(baseParts, { maxParts: options.maxParts ?? SEMANTIC_PARAM_PART_LIMIT });
  const axes = new Map(baseParts.map((part) => [part.name, semanticLongestAxis(part)]));
  return {
    id: options.id || "semantic-live",
    name,
    semanticRuntime: true,
    sourceName: options.sourceName || name,
    schema,
    defaultParams: () => defaultParamsFromSchema(schema),
    build(params) {
      const model = semanticModelFromParts(baseParts);
      const modelBox = new THREE.Box3();
      for (const p of model.mesh.positions) modelBox.expandByPoint(new THREE.Vector3(p.x, p.y, p.z));
      const modelCenter = new THREE.Vector3();
      modelBox.getCenter(modelCenter);
      const center = { x: modelCenter.x, y: modelCenter.y, z: modelCenter.z };
      const ops = [];
      if (params.scaleX !== 1 || params.scaleY !== 1 || params.scaleZ !== 1) {
        ops.push({ part: baseParts.map((part) => part.name), mode: "scale", scale: { x: params.scaleX, y: params.scaleY, z: params.scaleZ }, center });
      }
      for (const part of baseParts) {
        const axis = axes.get(part.name) || "y";
        const length = params[semanticPartParamKey(part.name, "length")] ?? 1;
        const thickness = params[semanticPartParamKey(part.name, "thickness")] ?? 1;
        const twist = params[semanticPartParamKey(part.name, "twist")] ?? 0;
        const bend = params[semanticPartParamKey(part.name, "bend")] ?? 0;
        const taper = params[semanticPartParamKey(part.name, "taper")] ?? 0;
        if (length !== 1) ops.push({ part: part.name, mode: "stretch", axis, factor: length, pivot: "center" });
        if (thickness !== 1) ops.push({ part: part.name, mode: "thicken", axis, factor: thickness });
        if (taper !== 0) ops.push({ part: part.name, mode: "taper", axis, startScale: 1 + taper, endScale: Math.max(0.05, 1 - taper) });
        if (twist !== 0) ops.push({ part: part.name, mode: "twist", axis, angle: twist });
        if (bend !== 0) ops.push({ part: part.name, mode: "bend", axis, towards: axis === "x" ? "z" : "x", angle: bend });
      }
      const deformed = ops.length ? deformSemanticMesh(model, ops) : model;
      const out = semanticModelToNamedParts(deformed);
      return out.map((part, i) => ({
        ...part,
        color: baseParts[i]?.color || part.color,
        colors: remapSemanticVertexAttribute(deformed, deformed.parts[i], baseParts[i]?.colors, 3) || part.colors,
        windWeight: remapSemanticVertexAttribute(deformed, deformed.parts[i], baseParts[i]?.windWeight, 1) || part.windWeight,
        surface: baseParts[i]?.surface || part.surface,
        textures: baseParts[i]?.textures || part.textures,
        doubleSided: baseParts[i]?.doubleSided || part.doubleSided,
        metadata: baseParts[i]?.metadata || part.metadata,
      }));
    },
  };
}

function sourceIdFromViewerModel(model, fallback = "") {
  const raw = fallback || model?.id || model?.name || "runtime";
  const file = String(raw).replace(/^\/+/, "").split(/[\\/]/).pop() || "runtime";
  return file.replace(/\.json$/i, "") || "runtime";
}

async function loadViewerModel(model, options = {}) {
  const loadStart = performance.now();
  const loadingToken = options.showLoading === false
    ? 0
    : await showGenerationLoading(options.loadingLabel || `生成 ${(model && model.name) || "AI模型"}`);
  rebuildToken++;
  try {
    const parts = viewerModelToNamedParts(model);
    if (options.parametrize !== false && parts.length) {
      const id = options.id || sourceIdFromViewerModel(model);
      const name = options.name || (model && model.name) || id || "AI模型";
      const proc = buildSemanticLiveModel(parts, name, name, {
        id,
        sourceName: name,
        analysis: semanticAnalysisFromModel(model, options.entry),
        maxParts: options.maxParts ?? SEMANTIC_PARAM_PART_LIMIT,
      });
      const loaded = await loadProcModel(proc, { loadingLabel: options.loadingLabel || `生成 ${name}` });
      recordModelTiming(proc, performance.now() - loadStart);
      return loaded;
    }
    currentModel = null;
    currentParams = null;
    currentBindings = {};
    resetBindingEditorState();
    currentLoadedSource = model && typeof model.source === "string" ? model.source : null;
    currentLoadedSourceName = (model && model.name) || "AI模型";
    selectedPart = null;
    surfaceOverrides = {};
    renderParamPanel();
    syncDrawableUi();
    await buildParts(parts, { keepCamera: false });
    errEl.style.display = "none";
    if (hud) hud.textContent = `${(model && model.name) || "AI模型"} · ${parts.length}件`;
  } finally {
    if (loadingToken) hideGenerationLoading(loadingToken);
  }
}

function semanticSplitTargetIndex(parts) {
  if (selectedPart) {
    const selected = parts.findIndex((part) => part.name === selectedPart);
    if (selected >= 0) return selected;
  }
  if (parts.length !== 1) return -1;
  let best = -1;
  let bestTris = -1;
  parts.forEach((part, i) => {
    const tris = part.mesh?.indices?.length ? part.mesh.indices.length / 3 : 0;
    if (tris > bestTris) {
      best = i;
      bestTris = tris;
    }
  });
  return best;
}

function stableSplitName(sourceName, splitName) {
  const base = String(sourceName || "mesh").replace(/[^a-zA-Z0-9_:-]+/g, "_").replace(/^_+|_+$/g, "") || "mesh";
  const suffix = String(splitName || "part").replace(/^part_/, "").replace(/[^a-zA-Z0-9_:-]+/g, "_");
  return `${base}_${suffix || "region"}`;
}

async function autoSemanticSplitCurrent(options = {}) {
  if (!currentParts.length) return { ok: false, error: "no parts" };
  const targetIndex = semanticSplitTargetIndex(currentParts);
  if (targetIndex < 0) return { ok: false, error: "请先选中要拆分的大部件" };

  const source = currentParts[targetIndex];
  const splitOptions = {
    cap: true,
    prefix: "part",
  };
  if (options.faceLabels) splitOptions.faceLabels = options.faceLabels;
  if (options.preset) splitOptions.preset = options.preset;
  if (options.positionTolerance !== undefined) splitOptions.positionTolerance = options.positionTolerance;
  const split = semanticSplitMesh(source.mesh, splitOptions);
  if (split.length <= 1) return { ok: false, error: "只检测到 1 个连通部件" };

  const splitParts = split.map((part) => ({
    ...part,
    name: stableSplitName(source.name, part.name),
    color: source.color || part.color || [0.8, 0.8, 0.8],
    surface: source.surface || part.surface,
    textures: source.textures || part.textures,
    metadata: {
      ...(source.metadata || {}),
      ...(part.metadata || {}),
      sourcePart: source.name,
      autoSemanticSplit: true,
      role: "component",
      labelConfidence: 1,
      labelSource: "generic",
    },
  }));
  const nextParts = [
    ...currentParts.slice(0, targetIndex),
    ...splitParts,
    ...currentParts.slice(targetIndex + 1),
  ];
  const modelName = `${currentModel?.name || currentLoadedSourceName || "模型"} · 按部件拆分`;
  const model = buildSemanticLiveModel(nextParts, modelName, "", { inferLabels: false });
  await loadProcModel(model);
  if (hud) hud.textContent = `${modelName} · ${nextParts.length}件`;
  return { ok: true, source: source.name, parts: nextParts.length, splitParts: splitParts.length };
}

async function captureSemanticFrame(frames = 12) {
  await window.__meshova?.settle?.(frames);
  const url = renderer.domElement.toDataURL("image/png");
  return {
    imageBase64: url.includes(",") ? url.split(",")[1] : url,
    parts: currentParts.map((part) => ({
      name: part.name,
      label: part.label || "",
      tris: part.mesh?.indices?.length ? part.mesh.indices.length / 3 : 0,
    })),
  };
}

function colorForFaceId(faceIndex) {
  const id = faceIndex + 1;
  return [
    (id & 255) / 255,
    ((id >> 8) & 255) / 255,
    ((id >> 16) & 255) / 255,
  ];
}

function faceIdFromPixel(r, g, b) {
  const id = r + (g << 8) + (b << 16);
  return id === 0 ? -1 : id - 1;
}

function faceIdMeshForPart(part) {
  const mesh = part.mesh;
  const tris = mesh.indices.length / 3;
  const positions = new Float32Array(tris * 9);
  const colors = new Float32Array(tris * 9);
  for (let f = 0; f < tris; f++) {
    const color = colorForFaceId(f);
    for (let corner = 0; corner < 3; corner++) {
      const src = mesh.positions[mesh.indices[f * 3 + corner]];
      const dst = f * 9 + corner * 3;
      positions[dst] = src.x;
      positions[dst + 1] = src.y;
      positions[dst + 2] = src.z;
      colors[dst] = color[0];
      colors[dst + 1] = color[1];
      colors[dst + 2] = color[2];
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.ShaderMaterial({
    vertexShader: `
      attribute vec3 color;
      varying vec3 vIdColor;
      void main() {
        vIdColor = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      precision highp float;
      varying vec3 vIdColor;
      void main() {
        gl_FragColor = vec4(vIdColor, 1.0);
      }`,
  });
  mat.toneMapped = false;
  const out = new THREE.Mesh(geo, mat);
  out.frustumCulled = false;
  return out;
}

function captureFaceIdViewForPart(part) {
  const width = renderer.domElement.width;
  const height = renderer.domElement.height;
  const rt = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: true,
    stencilBuffer: false,
    colorSpace: THREE.NoColorSpace,
  });
  rt.texture.minFilter = THREE.NearestFilter;
  rt.texture.magFilter = THREE.NearestFilter;
  const tempScene = new THREE.Scene();
  tempScene.background = new THREE.Color(0, 0, 0);
  const tempRoot = new THREE.Group();
  tempRoot.position.copy(modelRoot.position);
  tempRoot.add(faceIdMeshForPart(part));
  tempScene.add(tempRoot);

  const prevTarget = renderer.getRenderTarget();
  const prevClearAlpha = renderer.getClearAlpha();
  const prevClearColor = new THREE.Color();
  renderer.getClearColor(prevClearColor);
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 1);
  renderer.clear(true, true, true);
  renderer.render(tempScene, camera);

  const pixels = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, width, height, pixels);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClearColor, prevClearAlpha);

  const faceIds = new Int32Array(width * height);
  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y;
    for (let x = 0; x < width; x++) {
      const src = (srcY * width + x) * 4;
      faceIds[y * width + x] = faceIdFromPixel(pixels[src], pixels[src + 1], pixels[src + 2]);
    }
  }

  tempRoot.traverse((obj) => {
    if (obj.isMesh) {
      obj.geometry.dispose();
      obj.material.dispose();
    }
  });
  rt.dispose();
  return { width, height, faceIds, backgroundFaceId: -1 };
}

function aiSplitTargetIndex(parts, partName) {
  if (partName) {
    const idx = parts.findIndex((part) => part.name === partName);
    if (idx >= 0) return idx;
  }
  return semanticSplitTargetIndex(parts);
}

function maskFromBbox(bbox, width, height) {
  if (!Array.isArray(bbox) || bbox.length < 4) return null;
  const nums = bbox.map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return null;
  let [x0, y0, x1, y1] = nums;
  const normalized = Math.max(Math.abs(x0), Math.abs(y0), Math.abs(x1), Math.abs(y1)) <= 1.01;
  if (normalized) {
    x0 *= width; x1 *= width;
    y0 *= height; y1 *= height;
  }
  const left = Math.max(0, Math.min(width - 1, Math.floor(Math.min(x0, x1))));
  const right = Math.max(0, Math.min(width - 1, Math.ceil(Math.max(x0, x1))));
  const top = Math.max(0, Math.min(height - 1, Math.floor(Math.min(y0, y1))));
  const bottom = Math.max(0, Math.min(height - 1, Math.ceil(Math.max(y0, y1))));
  if (right <= left || bottom <= top) return null;
  const out = new Uint8Array(width * height);
  for (let y = top; y <= bottom; y++) {
    out.fill(1, y * width + left, y * width + right + 1);
  }
  return out;
}

async function captureAiSplitFrame(options = {}) {
  if (!currentParts.length) return { ok: false, error: "no parts" };
  const targetIndex = aiSplitTargetIndex(currentParts, options.partName);
  if (targetIndex < 0) return { ok: false, error: "请先选中要 AI 切割的大部件" };
  await window.__meshova?.settle?.(options.frames ?? 12);
  const source = currentParts[targetIndex];
  const url = renderer.domElement.toDataURL("image/png");
  const faceIdView = captureFaceIdViewForPart(source);
  const frameId = `ai_split_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  lastAiSplitFrame = {
    frameId,
    targetPartName: source.name,
    targetIndex,
    faceIdView,
  };
  const out = {
    ok: true,
    frameId,
    imageBase64: url.includes(",") ? url.split(",")[1] : url,
    width: faceIdView.width,
    height: faceIdView.height,
    targetPart: {
      name: source.name,
      label: source.label || "",
      tris: source.mesh.indices.length / 3,
    },
    parts: currentParts.map((part) => ({
      name: part.name,
      label: part.label || "",
      tris: part.mesh?.indices?.length ? part.mesh.indices.length / 3 : 0,
    })),
  };
  if (options.includeFaceIds) out.faceIds = Array.from(faceIdView.faceIds);
  return out;
}

function normalizeAiMaskPayload(mask) {
  const data = mask?.mask ?? mask?.data;
  const generated = data || maskFromBbox(mask?.bbox, lastAiSplitFrame.faceIdView.width, lastAiSplitFrame.faceIdView.height);
  if (!generated || typeof generated.length !== "number") return null;
  const out = {
    partKey: mask.partKey || mask.key || mask.name,
    label: mask.label,
    role: mask.role,
    confidence: mask.confidence,
    color: mask.color,
    method: mask.method,
    generationPrompt: mask.generationPrompt,
    threshold: mask.threshold,
    weight: mask.weight,
    mask: Array.from(generated),
    view: lastAiSplitFrame.faceIdView,
  };
  return out;
}

async function applyAiGuidedSplit(payload = {}) {
  if (!currentParts.length) return { ok: false, error: "no parts" };
  if (!lastAiSplitFrame) return { ok: false, error: "missing AI split frame" };
  if (payload.frameId && payload.frameId !== lastAiSplitFrame.frameId) {
    return { ok: false, error: "AI split frame expired" };
  }
  const masks = Array.isArray(payload.masks)
    ? payload.masks.map(normalizeAiMaskPayload).filter(Boolean)
    : [];
  if (!masks.length) return { ok: false, error: "missing AI masks" };

  const targetIndex = lastAiSplitFrame.targetIndex;
  const source = currentParts[targetIndex];
  const result = splitMeshByAiMasks(source.mesh, masks, {
    plan: payload.plan,
    cap: payload.cap ?? true,
    minTriangles: payload.minTriangles ?? 1,
    smoothPasses: payload.smoothPasses ?? 8,
    minFaceScore: payload.minFaceScore ?? 0.25,
  });
  if (!result.ok) {
    return { ok: false, error: "AI masks did not produce split", diagnostics: result.diagnostics };
  }

  const splitParts = result.parts.map((part) => ({
    ...part,
    name: stableSplitName(source.name, part.name),
    color: part.color || source.color || [0.8, 0.8, 0.8],
    surface: source.surface || part.surface,
    textures: source.textures || part.textures,
    metadata: {
      ...(source.metadata || {}),
      ...(part.metadata || {}),
      sourcePart: source.name,
      autoSemanticSplit: true,
      aiGuidedSplit: true,
    },
  }));
  const nextParts = [
    ...currentParts.slice(0, targetIndex),
    ...splitParts,
    ...currentParts.slice(targetIndex + 1),
  ];
  const objectName = payload.plan?.objectLabel || currentModel?.name || currentLoadedSourceName || "模型";
  const modelName = `${objectName} · AI识别切割`;
  const model = buildSemanticLiveModel(nextParts, modelName, "", { inferLabels: false });
  await loadProcModel(model);
  if (hud) hud.textContent = `${modelName} · ${nextParts.length}件`;
  return {
    ok: true,
    frameId: lastAiSplitFrame.frameId,
    source: source.name,
    parts: nextParts.length,
    splitParts: splitParts.length,
    labels: splitParts.map((part) => part.label || part.name),
    diagnostics: result.diagnostics,
  };
}

async function postJson(url, body) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await resp.json();
  } catch {
    // keep null
  }
  if (!resp.ok) {
    return { ok: false, error: json?.error || `HTTP ${resp.status}` };
  }
  return json || { ok: false, error: "empty response" };
}

async function runAiGuidedSplitCurrent(options = {}) {
  if (!currentParts.length) return { ok: false, error: "no parts" };
  if (hud) hud.textContent = "AI切割: 截图中...";
  const frame = await captureAiSplitFrame({ frames: options.frames ?? 12, partName: options.partName });
  if (!frame.ok) return frame;
  if (hud) hud.textContent = "AI切割: 识别部件中...";
  const res = await postJson("/api/ai-split", {
    imageBase64: frame.imageBase64,
    width: frame.width,
    height: frame.height,
    targetPart: frame.targetPart,
    parts: frame.parts,
    hint: options.hint || currentModel?.name || currentLoadedSourceName || "",
  });
  if (!res.ok) return res;
  const masks = Array.isArray(res.masks)
    ? res.masks
    : Array.isArray(res.parts)
      ? res.parts
      : Array.isArray(res.plan?.parts)
        ? res.plan.parts
        : [];
  if (!masks.length) {
    return { ok: false, error: "AI 未返回 masks/bbox；需要 SAM masks 或 VLM bbox" };
  }
  if (hud) hud.textContent = "AI切割: 应用切割中...";
  return applyAiGuidedSplit({
    frameId: frame.frameId,
    plan: res.plan,
    masks,
    cap: options.cap ?? true,
  });
}

async function applySemanticAnalysis(analysis) {
  if (!currentParts.length) return { ok: false, error: "no parts" };
  const normalized = normalizeViewerSemanticAnalysis(analysis);
  if (!normalized) return { ok: false, error: "invalid semantic analysis" };
  const modelName = normalized.object
    ? `${normalized.object} · 语义网格实时变形`
    : `${currentModel?.name || currentLoadedSourceName || "模型"} · AI识别`;
  const model = buildSemanticLiveModel(currentParts, modelName, "", {
    analysis: normalized,
    replaceExistingLabels: true,
  });
  await loadProcModel(model);
  if (hud) hud.textContent = `${modelName} · ${currentParts.length}件`;
  return { ok: true, analysis: normalized, parts: currentParts.length };
}

async function autoTPoseCurrent(options = {}) {
  if (!currentParts.length) return { ok: false, error: "no parts" };
  const res = canonicalizeHumanoidPartsToTPose(currentParts, options);
  if (!res.parts.length) return { ok: false, error: "empty_model" };
  rebuildToken++;
  currentModel = null;
  currentParams = null;
  currentBindings = {};
  resetBindingEditorState();
  currentLoadedSource = null;
  currentLoadedSourceName = "T-Pose 规范化模型";
  selectedPart = null;
  surfaceOverrides = {};
  renderParamPanel();
  syncDrawableUi();
  await buildParts(res.parts, { keepCamera: false });
  if (hud) {
    const pct = Math.round(res.confidence * 100);
    const diag = res.diagnostics.length ? ` · ${res.diagnostics.join(", ")}` : "";
    hud.textContent = `T-Pose完成 · 置信度 ${pct}%${diag}`;
  }
  return { ok: true, confidence: res.confidence, diagnostics: res.diagnostics };
}

// ---- procedural model loading + live params ----
function workflowBindingSpecs(model = currentModel) {
  return model?.workflowPreset?.bindings || [];
}

function drawableBindingSpec(model = currentModel) {
  return workflowBindingSpecs(model).find((spec) => {
    if (spec.kind === "curve" || spec.kind === "region") return true;
    return spec.kind === "surface" && Array.isArray(spec.default?.points);
  }) || null;
}

function defaultBindingsFor(model) {
  const out = {};
  for (const spec of workflowBindingSpecs(model)) {
    if (Object.prototype.hasOwnProperty.call(spec, "default")) out[spec.key] = cloneSerializable(spec.default);
  }
  return out;
}

function bindingPointCount(spec = drawableBindingSpec()) {
  return spec ? currentBindings[spec.key]?.points?.length || 0 : 0;
}

function bindingIsClosed(spec) {
  return spec?.kind === "region" || spec?.kind === "surface";
}

function currentDrawableBinding(spec = drawableBindingSpec()) {
  if (!spec) return null;
  if (activeDrawing?.spec.key === spec.key) {
    return { kind: spec.kind, points: activeDrawing.points, closed: bindingIsClosed(spec) };
  }
  return currentBindings[spec.key] || null;
}

function setBindingPointer(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  bindingPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  bindingPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  bindingRaycaster.setFromCamera(bindingPointer, camera);
}

function localBindingPointFromEvent(event) {
  setBindingPointer(event);
  bindingPlane.constant = -modelRoot.position.y;
  const hit = new THREE.Vector3();
  if (!bindingRaycaster.ray.intersectPlane(bindingPlane, hit)) return null;
  return [
    Number((hit.x - modelRoot.position.x).toFixed(4)),
    0,
    Number((hit.z - modelRoot.position.z).toFixed(4)),
  ];
}

function disposeOverlayObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material?.dispose?.());
    else child.material?.dispose?.();
  });
}

function clearBindingOverlay() {
  for (const child of [...bindingOverlay.children]) {
    bindingOverlay.remove(child);
    disposeOverlayObject(child);
  }
}

function bindingBounds(points) {
  if (!points.length) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, Number(point[0]));
    maxX = Math.max(maxX, Number(point[0]));
    minZ = Math.min(minZ, Number(point[2]));
    maxZ = Math.max(maxZ, Number(point[2]));
  }
  return { minX, maxX, minZ, maxZ };
}

function addBindingLine(worldPoints, closed, color, opacity = 1) {
  if (worldPoints.length < 2) return null;
  const geometry = new THREE.BufferGeometry().setFromPoints(worldPoints);
  const material = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity });
  const line = closed && worldPoints.length >= 3
    ? new THREE.LineLoop(geometry, material)
    : new THREE.Line(geometry, material);
  line.renderOrder = 1000;
  line.userData.bindingPath = true;
  bindingOverlay.add(line);
  return line;
}

function addRegionSurface(worldPoints) {
  if (worldPoints.length < 3) return;
  const contour = worldPoints.map((point) => new THREE.Vector2(point.x, point.z));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  if (!triangles.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(
    worldPoints.flatMap((point) => [point.x, point.y - 0.025, point.z]),
    3,
  ));
  geometry.setIndex(triangles.flat());
  const material = new THREE.MeshBasicMaterial({
    color: 0x19c6ff,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: bindingEditEnabled ? 0.16 : 0.08,
  });
  const surface = new THREE.Mesh(geometry, material);
  surface.renderOrder = 998;
  surface.userData.bindingSurface = true;
  bindingOverlay.add(surface);
}

function addBindingHandle(position, size, color, userData, shape = "sphere") {
  const geometry = shape === "box"
    ? new THREE.BoxGeometry(size * 1.45, size * 0.55, size * 1.45)
    : new THREE.SphereGeometry(size, 16, 10);
  const material = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.98 });
  const handle = new THREE.Mesh(geometry, material);
  handle.position.copy(position);
  handle.renderOrder = 1002;
  handle.userData.bindingHandle = userData;
  bindingOverlay.add(handle);
  return handle;
}

function updateBindingOverlay() {
  clearBindingOverlay();
  const spec = drawableBindingSpec();
  if (!spec) return;
  const binding = currentDrawableBinding(spec);
  const points = binding?.points || [];
  if (!points.length) return;
  const worldPoints = points.map((point) => new THREE.Vector3(
    Number(point[0]) + modelRoot.position.x,
    Number(point[1]) + modelRoot.position.y + 0.055,
    Number(point[2]) + modelRoot.position.z,
  ));
  const closed = binding.closed || bindingIsClosed(spec);
  if (closed) addRegionSurface(worldPoints);
  addBindingLine(worldPoints, closed, 0x19c6ff, 0.95);

  if (!bindingEditEnabled && !activeDrawing) {
    const pointGeometry = new THREE.BufferGeometry().setFromPoints(worldPoints);
    const pointMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 7, sizeAttenuation: false, depthTest: false });
    const pointCloud = new THREE.Points(pointGeometry, pointMaterial);
    pointCloud.renderOrder = 1001;
    bindingOverlay.add(pointCloud);
    return;
  }

  const bounds = bindingBounds(points);
  const span = bounds ? Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) : 1;
  const handleSize = Math.max(0.08, Math.min(0.32, span * 0.018));
  worldPoints.forEach((point, index) => {
    addBindingHandle(point, handleSize * (index === selectedBindingPoint ? 1.32 : 1),
      index === selectedBindingPoint ? 0xffd34d : 0xffffff,
      { type: "point", index });
  });
  if (!bindingEditEnabled || !bounds || points.length < 2) return;

  const y = modelRoot.position.y + 0.09;
  const corners = [
    [bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ],
    [bounds.maxX, bounds.minZ, bounds.minX, bounds.maxZ],
    [bounds.maxX, bounds.maxZ, bounds.minX, bounds.minZ],
    [bounds.minX, bounds.maxZ, bounds.maxX, bounds.minZ],
  ];
  const boxWorld = corners.map(([x, z]) => new THREE.Vector3(x + modelRoot.position.x, y, z + modelRoot.position.z));
  const boundsLine = addBindingLine(boxWorld, true, 0xf3b33d, 0.72);
  if (boundsLine) boundsLine.userData.bindingPath = false;
  corners.forEach(([x, z, anchorX, anchorZ], index) => {
    addBindingHandle(
      new THREE.Vector3(x + modelRoot.position.x, y, z + modelRoot.position.z),
      handleSize * 0.82,
      0xf3b33d,
      { type: "scale", index, anchor: [anchorX, 0, anchorZ], corner: [x, 0, z] },
      "box",
    );
  });
  addBindingHandle(
    new THREE.Vector3((bounds.minX + bounds.maxX) * 0.5 + modelRoot.position.x, y, (bounds.minZ + bounds.maxZ) * 0.5 + modelRoot.position.z),
    handleSize,
    0x55d68b,
    { type: "translate" },
    "box",
  );
  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
  const rotateOffset = Math.max(handleSize * 4.5, span * 0.12);
  const rotateBase = new THREE.Vector3(centerX + modelRoot.position.x, y, bounds.minZ + modelRoot.position.z);
  const rotatePoint = new THREE.Vector3(centerX + modelRoot.position.x, y, bounds.minZ - rotateOffset + modelRoot.position.z);
  const rotateLine = addBindingLine([rotateBase, rotatePoint], false, 0xff7a45, 0.9);
  if (rotateLine) rotateLine.userData.bindingPath = false;
  addBindingHandle(
    rotatePoint,
    handleSize * 0.9,
    0xff7a45,
    { type: "rotate", center: [centerX, 0, centerZ] },
  );
}

function bindingEditorState() {
  const rect = renderer.domElement.getBoundingClientRect();
  const handles = [];
  bindingOverlay.updateMatrixWorld(true);
  bindingOverlay.traverse((object) => {
    const handle = object.userData?.bindingHandle;
    if (!handle) return;
    const world = new THREE.Vector3();
    object.getWorldPosition(world);
    const projected = world.clone().project(camera);
    handles.push({
      ...cloneSerializable(handle),
      world: world.toArray(),
      screen: [
        rect.left + (projected.x + 1) * rect.width * 0.5,
        rect.top + (1 - projected.y) * rect.height * 0.5,
      ],
    });
  });
  return {
    enabled: bindingEditEnabled,
    drawing: !!activeDrawing,
    selectedPoint: selectedBindingPoint,
    binding: cloneSerializable(currentDrawableBinding()),
    handles,
    hasSurface: bindingOverlay.children.some((object) => !!object.userData?.bindingSurface),
  };
}

function resetBindingEditorState() {
  activeDrawing = null;
  bindingEditEnabled = false;
  selectedBindingPoint = -1;
  bindingDrag = null;
  bindingUndoStack = [];
  bindingRedoStack = [];
  controls.enabled = true;
  renderer.domElement.classList.remove("binding-drag");
}

function setBindingEditEnabled(enabled) {
  if (!drawableBindingSpec() || activeDrawing) return false;
  bindingEditEnabled = !!enabled;
  if (!bindingEditEnabled) selectedBindingPoint = -1;
  syncDrawableUi();
  return bindingEditEnabled;
}

function bindingLabel(spec) {
  if (spec?.kind === "surface") return "曲面";
  return spec?.kind === "region" ? "区域" : "路径";
}

function syncDrawableUi() {
  const spec = drawableBindingSpec();
  if (!drawBindingBtn || !editBindingBtn || !resetBindingBtn) return;
  const visible = !!spec;
  if (drawToolsEl) drawToolsEl.style.display = visible ? "" : "none";
  editBindingBtn.style.display = visible ? "" : "none";
  drawBindingBtn.style.display = visible ? "" : "none";
  resetBindingBtn.style.display = visible ? "" : "none";
  drawBindingBtn.classList.toggle("on", !!activeDrawing);
  editBindingBtn.classList.toggle("on", bindingEditEnabled);
  editBindingBtn.textContent = `${bindingEditEnabled ? "完成" : "编辑"}${bindingLabel(spec)}`;
  drawBindingBtn.textContent = activeDrawing
    ? "完成绘制"
    : `重绘${bindingLabel(spec)}`;
  if (undoBindingBtn) undoBindingBtn.disabled = !bindingUndoStack.length;
  if (redoBindingBtn) redoBindingBtn.disabled = !bindingRedoStack.length;
  if (drawStatusEl) {
    drawStatusEl.classList.toggle("show", visible);
    drawStatusEl.textContent = !spec
      ? ""
      : activeDrawing
        ? `${spec.label} · 单击加点 · ${activeDrawing.points.length} 点 · 点击“完成绘制”结束`
        : bindingDrag
          ? `${spec.label} · 正在修改，松开鼠标应用并重建`
          : bindingEditEnabled
            ? `${spec.label} · 拖点改形 · 双击线段加点 · Delete删点 · 绿色平移 · 黄色缩放 · 橙色旋转 · Shift等比`
            : `${spec.label} · ${bindingPointCount(spec)} 点 · 点击模型或“编辑${bindingLabel(spec)}”修改`;
  }
  renderer.domElement.classList.toggle("drawing", !!activeDrawing);
  renderer.domElement.classList.toggle("binding-edit", bindingEditEnabled);
  updateBindingOverlay();
}

function pushBindingHistory(previous) {
  bindingUndoStack.push(cloneSerializable(previous));
  if (bindingUndoStack.length > 50) bindingUndoStack.shift();
  bindingRedoStack = [];
}

function applyBindingHistoryValue(spec, value) {
  if (value == null) delete currentBindings[spec.key];
  else currentBindings[spec.key] = cloneSerializable(value);
  selectedBindingPoint = -1;
  renderParamPanel();
  syncDrawableUi();
  rebuildAfterParamChange({ keepCamera: true });
}

function undoBindingEdit() {
  const spec = drawableBindingSpec();
  if (!spec || !bindingUndoStack.length || activeDrawing || bindingDrag) return false;
  bindingRedoStack.push(cloneSerializable(currentBindings[spec.key]));
  applyBindingHistoryValue(spec, bindingUndoStack.pop());
  return true;
}

function redoBindingEdit() {
  const spec = drawableBindingSpec();
  if (!spec || !bindingRedoStack.length || activeDrawing || bindingDrag) return false;
  bindingUndoStack.push(cloneSerializable(currentBindings[spec.key]));
  applyBindingHistoryValue(spec, bindingRedoStack.pop());
  return true;
}

function beginBindingDrawing() {
  const spec = drawableBindingSpec();
  if (!spec) return false;
  bindingEditEnabled = false;
  selectedBindingPoint = -1;
  activeDrawing = {
    spec,
    points: [],
    previous: cloneSerializable(currentBindings[spec.key]),
  };
  controls.enabled = false;
  syncDrawableUi();
  return true;
}

function finishBindingDrawing() {
  if (!activeDrawing) return false;
  const { spec, points, previous } = activeDrawing;
  const minimum = spec.kind === "curve" ? 2 : 3;
  currentBindings[spec.key] = points.length >= minimum
    ? { kind: spec.kind, points: points.map((point) => [...point]), closed: bindingIsClosed(spec) }
    : previous;
  activeDrawing = null;
  controls.enabled = true;
  if (points.length >= minimum) {
    pushBindingHistory(previous);
    bindingEditEnabled = true;
  }
  renderParamPanel();
  syncDrawableUi();
  if (points.length >= minimum) rebuildAfterParamChange({ keepCamera: true });
  return points.length >= minimum;
}

function cancelBindingDrawing() {
  if (!activeDrawing) return false;
  currentBindings[activeDrawing.spec.key] = activeDrawing.previous;
  activeDrawing = null;
  controls.enabled = true;
  syncDrawableUi();
  return true;
}

function resetDrawableBinding() {
  const spec = drawableBindingSpec();
  if (!spec) return;
  cancelBindingDrawing();
  const previous = cloneSerializable(currentBindings[spec.key]);
  const defaults = defaultBindingsFor(currentModel);
  if (Object.prototype.hasOwnProperty.call(defaults, spec.key)) currentBindings[spec.key] = defaults[spec.key];
  else delete currentBindings[spec.key];
  pushBindingHistory(previous);
  selectedBindingPoint = -1;
  renderParamPanel();
  syncDrawableUi();
  rebuildAfterParamChange({ keepCamera: true });
}

function addDrawingPoint(event) {
  if (!activeDrawing || event.button !== 0) return;
  const point = localBindingPointFromEvent(event);
  if (!point) return;
  activeDrawing.points.push(point);
  syncDrawableUi();
}

function bindingOverlayHit(event) {
  setBindingPointer(event);
  return bindingRaycaster.intersectObjects(bindingOverlay.children, true)[0] || null;
}

function startBindingDrag(event) {
  if (!bindingEditEnabled || activeDrawing || event.button !== 0) return false;
  const hit = bindingOverlayHit(event);
  const handle = hit?.object?.userData?.bindingHandle;
  if (!handle) return false;
  const spec = drawableBindingSpec();
  const binding = currentBindings[spec.key];
  const startPoint = localBindingPointFromEvent(event);
  if (!binding?.points?.length || !startPoint) return false;
  selectedBindingPoint = handle.type === "point" ? handle.index : -1;
  bindingDrag = {
    ...cloneSerializable(handle),
    spec,
    startPoint,
    original: cloneSerializable(binding),
  };
  controls.enabled = false;
  renderer.domElement.classList.add("binding-drag");
  renderer.domElement.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
  syncDrawableUi();
  return true;
}

function moveBindingDrag(event) {
  if (!bindingDrag) return;
  const point = localBindingPointFromEvent(event);
  if (!point) return;
  const next = cloneSerializable(bindingDrag.original);
  if (bindingDrag.type === "point") {
    next.points[bindingDrag.index] = [point[0], next.points[bindingDrag.index][1] || 0, point[2]];
  } else if (bindingDrag.type === "translate") {
    const dx = point[0] - bindingDrag.startPoint[0];
    const dz = point[2] - bindingDrag.startPoint[2];
    next.points = next.points.map((source) => [source[0] + dx, source[1] || 0, source[2] + dz]);
  } else if (bindingDrag.type === "scale") {
    const anchor = bindingDrag.anchor;
    const corner = bindingDrag.corner;
    let sx = Math.abs(corner[0] - anchor[0]) < 1e-6 ? 1 : (point[0] - anchor[0]) / (corner[0] - anchor[0]);
    let sz = Math.abs(corner[2] - anchor[2]) < 1e-6 ? 1 : (point[2] - anchor[2]) / (corner[2] - anchor[2]);
    if (event.shiftKey) {
      const uniform = Math.abs(sx) >= Math.abs(sz) ? sx : sz;
      sx = uniform;
      sz = uniform;
    }
    next.points = next.points.map((source) => [
      anchor[0] + (source[0] - anchor[0]) * sx,
      source[1] || 0,
      anchor[2] + (source[2] - anchor[2]) * sz,
    ]);
  } else if (bindingDrag.type === "rotate") {
    const center = bindingDrag.center;
    const startAngle = Math.atan2(bindingDrag.startPoint[2] - center[2], bindingDrag.startPoint[0] - center[0]);
    const angle = Math.atan2(point[2] - center[2], point[0] - center[0]) - startAngle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    next.points = next.points.map((source) => {
      const dx = source[0] - center[0];
      const dz = source[2] - center[2];
      return [center[0] + dx * cos - dz * sin, source[1] || 0, center[2] + dx * sin + dz * cos];
    });
  }
  currentBindings[bindingDrag.spec.key] = next;
  syncDrawableUi();
}

function finishBindingDrag(event) {
  if (!bindingDrag) return false;
  const drag = bindingDrag;
  bindingDrag = null;
  controls.enabled = true;
  renderer.domElement.classList.remove("binding-drag");
  renderer.domElement.releasePointerCapture?.(event.pointerId);
  if (JSON.stringify(currentBindings[drag.spec.key]) !== JSON.stringify(drag.original)) {
    pushBindingHistory(drag.original);
    renderParamPanel();
    syncDrawableUi();
    rebuildAfterParamChange({ keepCamera: true });
  } else {
    syncDrawableUi();
  }
  return true;
}

function insertBindingPoint(event) {
  if (!bindingEditEnabled || activeDrawing) return false;
  const overlayHit = bindingOverlayHit(event);
  if (!overlayHit?.object?.userData?.bindingPath) return false;
  const spec = drawableBindingSpec();
  const binding = currentBindings[spec.key];
  const point = localBindingPointFromEvent(event);
  if (!binding?.points?.length || !point) return false;
  const count = binding.points.length;
  const segmentCount = binding.closed || bindingIsClosed(spec) ? count : count - 1;
  let bestIndex = -1;
  let bestDistance = Infinity;
  for (let index = 0; index < segmentCount; index++) {
    const a = binding.points[index];
    const b = binding.points[(index + 1) % count];
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const length2 = dx * dx + dz * dz;
    const t = length2 > 0 ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[2] - a[2]) * dz) / length2)) : 0;
    const distance = Math.hypot(point[0] - (a[0] + dx * t), point[2] - (a[2] + dz * t));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index + 1;
    }
  }
  if (bestIndex < 0) return false;
  const previous = cloneSerializable(binding);
  binding.points.splice(bestIndex, 0, point);
  selectedBindingPoint = bestIndex;
  pushBindingHistory(previous);
  renderParamPanel();
  syncDrawableUi();
  rebuildAfterParamChange({ keepCamera: true });
  event.preventDefault();
  return true;
}

function deleteSelectedBindingPoint() {
  const spec = drawableBindingSpec();
  const binding = spec && currentBindings[spec.key];
  const minimum = bindingIsClosed(spec) ? 3 : 2;
  if (!bindingEditEnabled || !binding?.points || selectedBindingPoint < 0 || binding.points.length <= minimum) return false;
  const previous = cloneSerializable(binding);
  binding.points.splice(selectedBindingPoint, 1);
  selectedBindingPoint = Math.min(selectedBindingPoint, binding.points.length - 1);
  pushBindingHistory(previous);
  renderParamPanel();
  syncDrawableUi();
  rebuildAfterParamChange({ keepCamera: true });
  return true;
}

function selectModelPartFromViewport(event) {
  if (activeDrawing || bindingDrag || event.button !== 0) return false;
  const overlayHit = drawableBindingSpec() ? bindingOverlayHit(event) : null;
  if (overlayHit?.object?.userData?.bindingPath || overlayHit?.object?.userData?.bindingSurface) {
    setBindingEditEnabled(true);
    return true;
  }
  setBindingPointer(event);
  const candidates = [];
  modelRoot.traverse((object) => {
    if (object.isMesh && !object.userData.isOutline && object.visible) candidates.push(object);
  });
  const hit = bindingRaycaster.intersectObjects(candidates, false)[0];
  if (!hit) return false;
  selectedPart = hit.object.name || null;
  renderPartList(currentParts);
  applySelectionHighlight();
  renderMatPanel();
  updateScriptPanel();
  if (drawableBindingSpec()) setBindingEditEnabled(true);
  return true;
}

renderer.domElement.addEventListener("pointerdown", addDrawingPoint);
renderer.domElement.addEventListener("pointerdown", (event) => {
  viewportPress = { x: event.clientX, y: event.clientY };
  startBindingDrag(event);
});
renderer.domElement.addEventListener("pointermove", (event) => {
  if (viewportPress && Math.hypot(event.clientX - viewportPress.x, event.clientY - viewportPress.y) > 4) viewportPress = null;
  moveBindingDrag(event);
});
renderer.domElement.addEventListener("pointerup", (event) => {
  if (finishBindingDrag(event)) {
    viewportPress = null;
    return;
  }
  if (viewportPress) selectModelPartFromViewport(event);
  viewportPress = null;
});
renderer.domElement.addEventListener("dblclick", insertBindingPoint);
renderer.domElement.addEventListener("contextmenu", (event) => {
  if (!activeDrawing) return;
  event.preventDefault();
  finishBindingDrawing();
});
document.addEventListener("keydown", (event) => {
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redoBindingEdit();
    else undoBindingEdit();
    return;
  }
  if (mod && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redoBindingEdit();
    return;
  }
  if (activeDrawing && event.key === "Escape") cancelBindingDrawing();
  else if (bindingEditEnabled && event.key === "Escape") setBindingEditEnabled(false);
  if (activeDrawing && event.key === "Backspace") {
    event.preventDefault();
    activeDrawing.points.pop();
    syncDrawableUi();
  }
  if (bindingEditEnabled && (event.key === "Delete" || event.key === "Backspace")) {
    if (deleteSelectedBindingPoint()) event.preventDefault();
  }
});

async function rebuild({ keepCamera = true, showLoading = false, loadingLabel = "", loadingTitle = "" } = {}) {
  if (!currentModel) return;
  const token = ++rebuildToken;
  const modelAtStart = currentModel;
  const loadingToken = showLoading
    ? await showGenerationLoading(
      loadingLabel || `生成 ${currentModel.name || "模型"}`,
      loadingTitle || "生成 3D 模型",
    )
    : 0;
  if (token !== rebuildToken) {
    if (showLoading) hideGenerationLoading(loadingToken);
    return;
  }
  try {
    const buildStart = performance.now();
    updateGenerationLoading(`后台计算 ${modelAtStart.name || "模型"}`);
    const result = await buildModelParts(modelAtStart, currentParams);
    const parts = result.parts;
    recordModelTiming(modelAtStart, result.elapsedMs || performance.now() - buildStart);
    if (token !== rebuildToken) return;
    errEl.style.display = "none";
    await buildParts(parts, { keepCamera, buildToken: token });
  } catch (e) {
    if (token !== rebuildToken) return;
    fail("构建模型出错: " + (e?.message || e));
  } finally {
    if (showLoading) hideGenerationLoading(loadingToken);
  }
}

function rebuildAfterParamChange({ keepCamera = true } = {}) {
  return rebuild({
    keepCamera,
    showLoading: shouldShowParamLoading(),
    loadingTitle: "修改参数",
    loadingLabel: `重新计算 ${currentModel?.name || "模型"}`,
  });
}

function applyModelScenePreset(model) {
  const preset = model?.scenePreset;
  if (!preset) return;
  if (preset.environment && ENV_PRESETS[preset.environment]) applyEnvironment(preset.environment);
  if (preset.background) {
    bgMode = preset.background.mode || bgMode;
    bgColor = preset.background.color || bgColor;
    bgColor2 = preset.background.color2 || bgColor2;
    syncBgColorInputs();
    applyBackground();
  }
  if (Number.isFinite(preset.exposure)) renderer.toneMappingExposure = preset.exposure;
  if (preset.bloom) {
    bloom.enabled = preset.bloom.enabled !== false;
    if (Number.isFinite(preset.bloom.strength)) bloom.strength = preset.bloom.strength;
    if (Number.isFinite(preset.bloom.radius)) bloom.radius = preset.bloom.radius;
    if (Number.isFinite(preset.bloom.threshold)) bloom.threshold = preset.bloom.threshold;
  }
  if (preset.fog) {
    fogOn = preset.fog.enabled !== false;
    Object.assign(fogOpts, preset.fog);
    fogPass.enabled = fogOn;
    if (fogBtn) fogBtn.classList.toggle("on", fogOn);
  }
  if (typeof preset.grid === "boolean") {
    grid.visible = preset.grid;
    const gridBtn = document.getElementById("grid");
    if (gridBtn) gridBtn.classList.toggle("on", grid.visible);
  }
  if (preset.toon) {
    if (Number.isFinite(preset.toon.steps)) toonParams.steps = Math.max(2, Math.round(preset.toon.steps));
    if (Number.isFinite(preset.toon.outline)) toonParams.outline = preset.toon.outline;
    if (preset.toon.color != null) {
      toonParams.color = typeof preset.toon.color === "string"
        ? parseInt(preset.toon.color.replace("#", ""), 16)
        : preset.toon.color;
    }
    const stepsInput = document.getElementById("toon-steps");
    const outlineInput = document.getElementById("toon-outline");
    const colorInput = document.getElementById("toon-color");
    if (stepsInput) stepsInput.value = String(toonParams.steps);
    if (outlineInput) outlineInput.value = String(toonParams.outline);
    if (colorInput) colorInput.value = `#${toonParams.color.toString(16).padStart(6, "0")}`;
  }
  if (preset.renderMode && ["off", "lowpoly", "toon", "normal", "matcap", "depth", "ao"].includes(preset.renderMode)) {
    applyDebugView(preset.renderMode);
    const debugInput = document.getElementById("debug");
    const toonControls = document.getElementById("toon-ctl");
    if (debugInput) debugInput.value = preset.renderMode;
    if (toonControls) toonControls.style.display = preset.renderMode === "toon" ? "" : "none";
  }
  if (preset.camera === "courtyard") {
    camera.fov = 68;
    camera.updateProjectionMatrix();
    camera.position.set(0, Math.max(1.5, lastSize.y * 0.16), lastSize.z * 0.23);
    controls.target.set(0, lastSize.y * 0.18, -lastSize.z * 0.1);
    updateCameraClipPlanes();
    controls.update();
    if (bokeh) bokeh.uniforms["focus"].value = camera.position.distanceTo(controls.target);
  } else if (preset.camera === "city") {
    const radius = Math.max(lastSize.x, lastSize.z);
    camera.fov = 47;
    camera.updateProjectionMatrix();
    camera.position.set(radius * 0.48, Math.max(lastSize.y * 0.9, radius * 0.25), radius * 0.66);
    controls.target.set(0, lastSize.y * 0.22, -lastSize.z * 0.05);
    updateCameraClipPlanes();
    controls.update();
    if (bokeh) bokeh.uniforms["focus"].value = camera.position.distanceTo(controls.target);
  } else if (preset.camera === "planet") {
    const radius = Math.max(lastSize.x, lastSize.y, lastSize.z);
    const centerY = lastSize.y * 0.5;
    camera.fov = 34;
    camera.updateProjectionMatrix();
    camera.position.set(radius * 0.22, centerY + radius * 0.32, radius * 1.72);
    controls.target.set(0, centerY + radius * 0.04, 0);
    updateCameraClipPlanes();
    controls.update();
    if (bokeh) bokeh.uniforms["focus"].value = camera.position.distanceTo(controls.target);
  }
  resetTAA();
}

async function loadProcModel(model, { resetParams = true, showLoading = true, loadingLabel = "" } = {}) {
  const loadStart = performance.now();
  const loadingToken = showLoading
    ? await showGenerationLoading(loadingLabel || `生成 ${model.name || "模型"}`)
    : 0;
  cancelBindingDrawing();
  resetBindingEditorState();
  currentModel = model;
  currentLoadedSource = null;
  currentLoadedSourceName = "";
  try {
    if (resetParams || !currentParams) currentParams = model.defaultParams ? model.defaultParams() : defaultParams(model);
    if (resetParams) currentBindings = defaultBindingsFor(model);
    selectedPart = null;
    currentOptimizationRun = null;
    selectedOptimizationCandidateId = null;
    surfaceOverrides = {}; // matched-material overrides are per-model
    renderParamPanel();
    renderOptimizationPanel();
    syncDrawableUi();
    updateScriptPanel();
    const result = await rebuild({ keepCamera: false });
    applyModelScenePreset(model);
    return result;
  } finally {
    recordModelTiming(model, performance.now() - loadStart);
    if (loadingToken) hideGenerationLoading(loadingToken);
  }
}

function renderParamPanel() {
  const panel = document.getElementById("params");
  panel.innerHTML = "";
  if (!currentModel) return;
  const preset = currentModel.workflowPreset;
  if (preset) {
    const summary = document.createElement("div");
    summary.className = "workflow-summary";
    const tags = (preset.metadata?.tags || []).slice(0, 4).join(" · ");
    summary.textContent = `${preset.metadata?.label || currentModel.name} · ${tags}`;
    panel.appendChild(summary);
  }
  for (const spec of currentModel.schema) {
    const g = document.createElement("div");
    g.className = "pgroup";
    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("span");
    label.textContent = spec.label;
    if (spec.type === "image") {
      g.classList.add("image-param");
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = spec.accept || "image/*";
      fileInput.hidden = true;
      const choose = document.createElement("button");
      choose.type = "button";
      choose.className = "mini";
      choose.textContent = currentParams[spec.key] ? "替换" : "选择图片";
      choose.onclick = () => fileInput.click();
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "mini";
      clear.textContent = "清除";
      clear.disabled = !currentParams[spec.key];
      const name = document.createElement("span");
      name.className = "image-param-name";
      name.textContent = currentParams[spec.key] ? "已加载自定义图片" : "未选择";
      const applyTexture = (value, displayName) => {
        currentParams[spec.key] = value;
        name.textContent = displayName;
        choose.textContent = value ? "替换" : "选择图片";
        clear.disabled = !value;
        clearOptimizationRun();
        if (!setPartTexture(spec.part || "ad_face", value, spec.channel || "baseColor")) {
          rebuildAfterParamChange();
        }
        updateScriptPanel();
      };
      fileInput.onchange = () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        applyTexture(URL.createObjectURL(file), file.name);
      };
      clear.onclick = () => {
        applyTexture("", "未选择");
        fileInput.value = "";
      };
      const actions = document.createElement("div");
      actions.className = "image-param-actions";
      actions.append(choose, clear);
      row.append(label);
      g.append(row, actions, name, fileInput);
      panel.appendChild(g);
      continue;
    }
    if (spec.type === "toggle") {
      g.classList.add("toggle-group");
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "param-toggle";
      toggle.setAttribute("role", "switch");
      const syncToggle = () => {
        const on = Number(currentParams[spec.key]) === 1;
        toggle.classList.toggle("on", on);
        toggle.setAttribute("aria-checked", String(on));
        toggle.setAttribute("aria-label", `${spec.label}：${on ? "开" : "关"}`);
      };
      syncToggle();
      toggle.onclick = () => {
        currentParams[spec.key] = Number(currentParams[spec.key]) === 1 ? 0 : 1;
        syncToggle();
        clearOptimizationRun();
        rebuildAfterParamChange();
        updateScriptPanel();
      };
      row.append(label, toggle);
      g.append(row);
      panel.appendChild(g);
      continue;
    }
    const val = document.createElement("span");
    val.className = "val";
    val.textContent = String(currentParams[spec.key]);
    row.append(label, val);
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = spec.min; slider.max = spec.max; slider.step = spec.step;
    slider.value = currentParams[spec.key];
    slider.oninput = () => {
      const v = Number(slider.value);
      currentParams[spec.key] = v;
      val.textContent = String(v);
      clearOptimizationRun();
      rebuildAfterParamChange();
      updateScriptPanel();
    };
    g.append(row, slider);
    panel.appendChild(g);
  }
}

function setPartTexture(partName, path, channel = "baseColor") {
  const channels = new Set(["baseColor", "normal", "roughness", "metallic", "ao", "orm"]);
  if (!channels.has(channel)) return false;
  const partIndex = currentParts.findIndex((part) => part.name === partName);
  if (partIndex < 0) return false;
  const previous = currentParts[partIndex];
  const previousPath = previous.textures?.[channel];
  const textures = { ...(previous.textures || {}) };
  if (path) textures[channel] = path;
  else delete textures[channel];
  const nextPart = { ...previous, textures: Object.keys(textures).length ? textures : undefined };
  currentParts = currentParts.map((part, index) => index === partIndex ? nextPart : part);
  const object = modelRoot.getObjectByName(partName);
  if (!object?.isMesh) return false;
  object.userData.textures = nextPart.textures || null;
  applyMaterial("model");
  if (previousPath !== path) releaseUploadedTexture(previousPath);
  if (matSel) matSel.value = "model";
  resetTAA();
  return true;
}

function clearOptimizationRun() {
  currentOptimizationRun = null;
  selectedOptimizationCandidateId = null;
  renderOptimizationPanel();
}

let optimizationApiPromise = null;
function viewerOptRng(seed) {
  let a = (seed >>> 0) || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
  };
}

function viewerSnapGene(gene, value) {
  const clamped = Math.min(gene.max, Math.max(gene.min, Number(value)));
  if (gene.step > 0) {
    const snapped = gene.min + Math.round((clamped - gene.min) / gene.step) * gene.step;
    return gene.kind === "int" ? Math.round(snapped) : Number(snapped.toFixed(12));
  }
  return gene.kind === "int" ? Math.round(clamped) : Number(clamped.toFixed(12));
}

function viewerSchemaToGenes(schema, options = {}) {
  const defaults = options.defaults || {};
  return (schema || []).map((spec) => {
    const key = String(spec.key);
    if (Array.isArray(spec.values) && spec.values.length) {
      return {
        key,
        label: spec.label,
        kind: "choice",
        values: [...spec.values],
        default: defaults[key] ?? spec.default ?? spec.values[0],
        locked: !!spec.locked,
      };
    }
    const min = Number.isFinite(Number(spec.min)) ? Number(spec.min) : 0;
    const max = Number.isFinite(Number(spec.max)) ? Number(spec.max) : 1;
    const step = Number.isFinite(Number(spec.step)) ? Number(spec.step) : undefined;
    const kind = step >= 1 && Number.isInteger(step) && Number.isInteger(min) && Number.isInteger(max) ? "int" : "float";
    const gene = {
      key,
      label: spec.label,
      kind,
      min: Math.min(min, max),
      max: Math.max(min, max),
      step,
      default: 0,
      locked: !!spec.locked,
    };
    gene.default = viewerSnapGene(gene, defaults[key] ?? spec.default ?? gene.min);
    return gene;
  });
}

function viewerSampleGenome(genes, rng) {
  const genome = {};
  for (const gene of genes) {
    if (gene.locked) { genome[gene.key] = gene.default; continue; }
    if (gene.kind === "choice") genome[gene.key] = gene.values[rng.int(0, gene.values.length - 1)] ?? gene.default;
    else genome[gene.key] = viewerSnapGene(gene, gene.kind === "int" ? rng.int(Math.ceil(gene.min), Math.floor(gene.max)) : rng.range(gene.min, gene.max));
  }
  return genome;
}

function viewerMutateGenome(genome, genes, rng, rate, strength) {
  const out = {};
  for (const gene of genes) {
    const current = genome[gene.key] ?? gene.default;
    if (gene.locked || rng.next() > rate) { out[gene.key] = gene.kind === "choice" ? current : viewerSnapGene(gene, current); continue; }
    if (gene.kind === "choice") out[gene.key] = gene.values[rng.int(0, gene.values.length - 1)] ?? gene.default;
    else out[gene.key] = viewerSnapGene(gene, Number(current) + rng.range(-(gene.max - gene.min) * strength, (gene.max - gene.min) * strength));
  }
  return out;
}

function viewerDominates(a, b, objectives) {
  const avOk = a.valid !== false;
  const bvOk = b.valid !== false;
  if (avOk !== bvOk) return avOk;
  if (!avOk && !bvOk) return false;
  let better = false;
  for (const objective of objectives) {
    const av = Number(a.fitness[objective.key]);
    const bv = Number(b.fitness[objective.key]);
    if (objective.direction === "maximize") {
      if (av < bv) return false;
      if (av > bv) better = true;
    } else {
      if (av > bv) return false;
      if (av < bv) better = true;
    }
  }
  return better;
}

function viewerRankCandidates(candidates, objectives) {
  const ranked = candidates.map((candidate) => ({ ...candidate, genome: { ...candidate.genome }, metrics: { ...candidate.metrics } }));
  const remaining = new Set(ranked.map((_, index) => index));
  let rank = 0;
  while (remaining.size) {
    const front = [];
    for (const i of remaining) {
      let dominated = false;
      for (const j of remaining) {
        if (i !== j && viewerDominates(ranked[j], ranked[i], objectives)) { dominated = true; break; }
      }
      if (!dominated) front.push(i);
    }
    for (const i of (front.length ? front : [...remaining])) {
      ranked[i].rank = rank;
      remaining.delete(i);
    }
    rank++;
  }
  const rangeSource = ranked.some((candidate) => candidate.valid !== false) ? ranked.filter((candidate) => candidate.valid !== false) : ranked;
  const ranges = objectives.map((objective) => {
    const values = rangeSource.map((candidate) => Number(candidate.fitness[objective.key]));
    return { objective, min: Math.min(...values), max: Math.max(...values) };
  });
  for (const candidate of ranked) {
    if (candidate.valid === false) {
      candidate.score = 0;
      continue;
    }
    let score = 0, weights = 0;
    for (const range of ranges) {
      const value = Number(candidate.fitness[range.objective.key]);
      const denom = Math.max(1e-9, range.max - range.min);
      const normalized = range.objective.direction === "maximize" ? (value - range.min) / denom : (range.max - value) / denom;
      const weight = range.objective.weight ?? 1;
      score += normalized * weight; weights += weight;
    }
    candidate.score = weights ? score / weights : 0;
  }
  return ranked;
}

async function viewerRunRandomSearch(options) {
  const seed = options.seed ?? 1;
  const rng = viewerOptRng(seed);
  const populationSize = Math.max(1, Math.floor(options.populationSize ?? 12));
  const generations = Math.max(1, Math.floor(options.generations ?? 1));
  const candidates = [];
  let ranked = [];
  let nextIndex = 0;
  for (let generation = 0; generation < generations; generation++) {
    const elites = ranked.length ? [...ranked].sort((a, b) => a.rank - b.rank || b.score - a.score).slice(0, options.eliteCount ?? 3) : [];
    for (let slot = 0; slot < populationSize; slot++) {
      const parent = elites.length ? elites[rng.int(0, elites.length - 1)] : null;
      const genome = parent
        ? viewerMutateGenome(parent.genome, options.genes, rng, options.mutationRate ?? 0.3, options.mutationStrength ?? 0.2)
        : viewerSampleGenome(options.genes, rng);
      const index = nextIndex++;
      let evaluation;
      try {
        evaluation = await options.evaluate(genome, { index, generation, seed: seed + index, parentId: parent?.id });
      } catch (err) {
        evaluation = { valid: false, invalidReason: err?.message || String(err) };
      }
      const valid = evaluation.valid !== false;
      const fitness = {};
      for (const objective of options.objectives) {
        const raw = evaluation.fitness?.[objective.key];
        fitness[objective.key] = Number.isFinite(Number(raw))
          ? Number(raw)
          : objective.direction === "maximize" ? -1e12 : 1e12;
      }
      candidates.push({
        id: `g${generation}-c${slot}`,
        index,
        generation,
        genome,
        fitness,
        metrics: evaluation.metrics ? { ...evaluation.metrics } : {},
        rank: Number.POSITIVE_INFINITY,
        score: 0,
        valid,
        invalidReason: valid ? undefined : evaluation.invalidReason || "invalid candidate",
        parentId: parent?.id,
      });
    }
    ranked = viewerRankCandidates(candidates, options.objectives);
  }
  const pareto = ranked.filter((candidate) => candidate.rank === 0 && candidate.valid !== false);
  const best = [...ranked].filter((candidate) => candidate.valid !== false).sort((a, b) => a.rank - b.rank || b.score - a.score || a.index - b.index)[0] || null;
  return { id: options.id || `viewer-${seed}`, seed, genes: options.genes, objectives: options.objectives, candidates: ranked, paretoFront: pareto, best, clusters: [] };
}

async function loadOptimizationApi() {
  if (!optimizationApiPromise) optimizationApiPromise = import("/dist/index.js?v=opt2");
  try {
    const api = await optimizationApiPromise;
    if (typeof api.schemaToGenes === "function" && typeof api.runRandomSearch === "function") return api;
  } catch {
    // fall through to viewer-local implementation
  }
  return { schemaToGenes: viewerSchemaToGenes, runRandomSearch: viewerRunRandomSearch };
}

function measureCandidateParts(parts) {
  let verts = 0;
  let tris = 0;
  for (const part of parts || []) {
    const mesh = part.mesh || part;
    verts += Array.isArray(mesh?.positions) ? mesh.positions.length : 0;
    tris += Array.isArray(mesh?.indices) ? Math.floor(mesh.indices.length / 3) : 0;
  }
  return { parts: Array.isArray(parts) ? parts.length : 0, verts, tris };
}

function compactNumber(value) {
  const n = Number(value) || 0;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}m`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function normalizedParamDistance(genome, baseParams, genes) {
  let total = 0;
  let count = 0;
  for (const gene of genes) {
    if (gene.locked) continue;
    const a = genome[gene.key];
    const b = baseParams[gene.key];
    if (gene.kind === "choice") {
      total += a === b ? 0 : 1;
      count++;
      continue;
    }
    const span = Math.max(1e-9, gene.max - gene.min);
    total += Math.min(1, Math.abs(Number(a) - Number(b)) / span);
    count++;
  }
  return count ? total / count : 0;
}

function sortedOptimizationCandidates(run) {
  return [...(run?.candidates || [])].sort((a, b) => {
    const av = a.valid !== false ? 0 : 1;
    const bv = b.valid !== false ? 0 : 1;
    return av - bv || a.rank - b.rank || b.score - a.score || a.index - b.index;
  });
}

function optimizationMode() {
  return optModeSel?.value || "best";
}

function validOptimizationCandidates(run) {
  return sortedOptimizationCandidates(run).filter((candidate) => candidate.valid !== false);
}

function objectiveBetterForMode(a, b, objective) {
  return objective.direction === "maximize" ? a > b : a < b;
}

function optimizationRanges(candidates, objectives) {
  return objectives.map((objective) => {
    const values = candidates.map((candidate) => Number(candidate.fitness[objective.key]));
    return { objective, min: Math.min(...values), max: Math.max(...values) };
  });
}

function optimizationVector(candidate, ranges) {
  return ranges.map((range) => {
    const value = Number(candidate.fitness[range.objective.key]);
    const denom = Math.max(1e-9, range.max - range.min);
    return range.objective.direction === "maximize" ? (value - range.min) / denom : (range.max - value) / denom;
  });
}

function vectorDist(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function selectOptimizationCandidates(run, count = 10) {
  const valid = validOptimizationCandidates(run);
  if (!valid.length) return sortedOptimizationCandidates(run).slice(0, count);
  const mode = optimizationMode();
  if (mode === "best") return valid.slice(0, count);
  if (mode === "per-objective") {
    const picks = [];
    const seen = new Set();
    for (const objective of run.objectives || []) {
      let best = null;
      for (const candidate of valid) {
        if (!best || objectiveBetterForMode(Number(candidate.fitness[objective.key]), Number(best.fitness[objective.key]), objective)) best = candidate;
      }
      if (best && !seen.has(best.id)) { picks.push(best); seen.add(best.id); }
    }
    return picks.slice(0, count);
  }
  if (mode === "cluster-representatives") {
    const picks = [];
    const seen = new Set();
    for (const cluster of run.clusters || []) {
      const best = sortedOptimizationCandidates({ candidates: cluster.candidates })[0];
      if (best && best.valid !== false && !seen.has(best.id)) { picks.push(best); seen.add(best.id); }
    }
    return (picks.length ? picks : valid).slice(0, count);
  }
  const ranges = optimizationRanges(valid, run.objectives || []);
  if (mode === "pareto-knee") {
    const front = (run.paretoFront && run.paretoFront.length ? run.paretoFront : valid).filter((candidate) => candidate.valid !== false);
    return front.map((candidate) => {
      const v = optimizationVector(candidate, ranges);
      return { candidate, dist: vectorDist(v, new Array(v.length).fill(1)) };
    }).sort((a, b) => a.dist - b.dist || a.candidate.rank - b.candidate.rank || b.candidate.score - a.candidate.score)
      .slice(0, count)
      .map((item) => item.candidate);
  }
  const picks = [valid[0]];
  const seen = new Set([valid[0].id]);
  while (picks.length < count && picks.length < valid.length) {
    let best = null;
    let bestDist = -Infinity;
    for (const candidate of valid) {
      if (seen.has(candidate.id)) continue;
      const v = optimizationVector(candidate, ranges);
      let minDist = Infinity;
      for (const pick of picks) minDist = Math.min(minDist, vectorDist(v, optimizationVector(pick, ranges)));
      if (minDist > bestDist) { best = candidate; bestDist = minDist; }
    }
    if (!best) break;
    picks.push(best);
    seen.add(best.id);
  }
  return picks;
}

function renderOptimizationPanel() {
  if (!optStatsEl || !optCandidatesEl) return;
  optCandidatesEl.innerHTML = "";
  const run = currentOptimizationRun;
  if (!run) {
    optStatsEl.textContent = "暂无候选";
    return;
  }
  const invalid = run.candidates.filter((candidate) => candidate.valid === false).length;
  optStatsEl.textContent = `候选 ${run.candidates.length} · Pareto ${run.paretoFront.length} · 无效 ${invalid}`;
  for (const candidate of selectOptimizationCandidates(run, 10)) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "opt-row" + (candidate.id === selectedOptimizationCandidateId ? " sel" : "") + (candidate.valid === false ? " bad" : "");
    const title = document.createElement("span");
    title.textContent = candidate.valid === false
      ? `#${candidate.index + 1} · 无效`
      : `#${candidate.index + 1} · R${candidate.rank} · 分 ${candidate.score.toFixed(2)}`;
    const sub = document.createElement("span");
    sub.className = "sub";
    const variation = candidate.fitness.variation ?? 0;
    const tris = candidate.metrics.triangles ?? candidate.fitness.triangles ?? 0;
    const parts = candidate.metrics.parts ?? 0;
    sub.textContent = candidate.valid === false
      ? (candidate.invalidReason || "构建失败")
      : `差异 ${Number(variation).toFixed(2)} · 面 ${compactNumber(tris)} · 部件 ${parts}`;
    row.append(title, sub);
    row.onclick = () => applyOptimizationCandidate(candidate.id);
    optCandidatesEl.appendChild(row);
  }
}

async function applyOptimizationCandidate(candidateId) {
  const candidate = currentOptimizationRun?.candidates.find((item) => item.id === candidateId);
  if (!candidate || !currentParams) return null;
  if (candidate.valid === false) return null;
  selectedOptimizationCandidateId = candidate.id;
  Object.assign(currentParams, candidate.genome);
  renderParamPanel();
  renderOptimizationPanel();
  updateScriptPanel();
  await rebuildAfterParamChange();
  return candidate;
}

async function runCandidateSearch() {
  if (!currentModel || !currentParams) return null;
  const modelAtStart = currentModel;
  const baseParams = { ...currentParams };
  const token = await showGenerationLoading(`采样 ${modelAtStart.name || "模型"} 参数候选`, "候选搜索");
  if (optRunBtn) optRunBtn.disabled = true;
  if (optStatsEl) optStatsEl.textContent = "搜索中...";
  try {
    const { schemaToGenes, runRandomSearch } = await loadOptimizationApi();
    const genes = schemaToGenes(modelAtStart.schema || [], { defaults: baseParams });
    if (!genes.length) throw new Error("当前模型没有可搜索参数");
    const seedValue = Number.isFinite(Number(baseParams.seed)) ? Number(baseParams.seed) : 17;
    const objectives = [
      { key: "variation", label: "差异", direction: "maximize", weight: 0.7 },
      { key: "triangles", label: "三角面", direction: "minimize", weight: 0.3 },
    ];
    const run = await runRandomSearch({
      id: `${modelAtStart.id || "model"}-search`,
      seed: seedValue,
      genes,
      objectives,
      populationSize: 6,
      generations: 2,
      eliteCount: 3,
      mutationRate: 0.35,
      mutationStrength: 0.22,
      includeDefault: false,
      clusterCount: 3,
      evaluate: async (genome) => {
        const params = { ...baseParams, ...genome };
        const parts = await modelAtStart.build(params);
        const metrics = measureCandidateParts(parts);
        return {
          fitness: {
            variation: normalizedParamDistance(genome, baseParams, genes),
            triangles: metrics.tris,
          },
          metrics: { parts: metrics.parts, vertices: metrics.verts, triangles: metrics.tris },
        };
      },
    });
    if (modelAtStart !== currentModel) return null;
    currentOptimizationRun = run;
    const selected = selectOptimizationCandidates(run, 1)[0] ?? run.best;
    selectedOptimizationCandidateId = selected?.id || null;
    renderOptimizationPanel();
    if (selected) await applyOptimizationCandidate(selected.id);
    return run;
  } catch (err) {
    if (optStatsEl) optStatsEl.textContent = err?.message || String(err);
    if (hud) hud.textContent = `候选搜索失败: ${err?.message || err}`;
    return null;
  } finally {
    if (optRunBtn) optRunBtn.disabled = false;
    if (token) hideGenerationLoading(token);
  }
}

// Live material editing scheduler: while dragging, rebake at LOW resolution
// throttled to one bake per animation frame; when the drag ends, do one
// FULL-resolution bake. Per-texel baking in JS is the cost, so dropping the
// preview to 64px keeps dragging smooth, and 256px lands on release.
const MAT_PREVIEW_SIZE = 64;
const MAT_FULL_SIZE = 256;
let matRafPending = false;
let matFullTimer = null;

function scheduleMatPreview() {
  if (matRafPending) return;
  matRafPending = true;
  requestAnimationFrame(() => {
    matRafPending = false;
    applyMaterial(currentPreset, { size: MAT_PREVIEW_SIZE, skipPanel: true });
  });
}
function scheduleMatFull() {
  clearTimeout(matFullTimer);
  matFullTimer = setTimeout(() => {
    applyMaterial(currentPreset, { size: MAT_FULL_SIZE, skipPanel: true });
  }, 120);
}

// Render the material parameter controls (sliders + color pickers + selects)
// into the #matparams panel. Editing rebakes the material live, no model
// rebuild. Three modes:
//   - "model" (matched): show the SELECTED part's matched surface params, so
//     tuning retunes just that part. Defaults to the first surfaced part.
//   - named surface (glass/metal/...): show the global surface's params.
//   - preset (rustyMetal/...): show the legacy preset params.
function renderMatPanel() {
  const panel = document.getElementById("matparams");
  if (!panel) return;
  panel.innerHTML = "";

  if (currentPreset === "model") {
    renderModelModePanel(panel);
    return;
  }
  if (currentSurfaceName) {
    const schema = SURFACE_PARAM_SCHEMA[currentSurfaceName] || [];
    if (!schema.length) return;
    addPanelTitle(panel, `${SURFACE_LABEL_MAP[currentSurfaceName] || currentSurfaceName} · 材质参数`);
    for (const spec of schema) {
      panel.appendChild(makeControl(spec, currentSurfaceParams, () => applyMaterial(currentSurfaceName, { size: MAT_PREVIEW_SIZE, skipPanel: true }), () => applyMaterial(currentSurfaceName, { size: MAT_FULL_SIZE, skipPanel: true })));
    }
    return;
  }

  const schema = PRESET_PARAM_SCHEMA[currentMatPreset];
  if (currentPreset === "none" || !schema) return;
  addPanelTitle(panel, "贴图参数");
  for (const spec of schema) {
    panel.appendChild(makeControl(spec, currentMatParams, scheduleMatPreview, scheduleMatFull));
  }
}

// "Follow model" mode panel: pick the selected part's matched surface (or the
// first surfaced part) and expose its editable params, baking just that part.
function renderModelModePanel(panel) {
  const meshes = [];
  modelRoot.traverse((o) => { if (o.isMesh && o.userData.surface) meshes.push(o); });
  if (!meshes.length) {
    addPanelTitle(panel, "贴图参数");
    const hint = document.createElement("div");
    hint.style.cssText = "color:var(--mut);font-size:12px;";
    hint.textContent = "当前模型部件无可调材质。";
    panel.appendChild(hint);
    return;
  }
  let target = meshes.find((m) => m.name === selectedPart) || meshes[0];
  const type = target.userData.surface.type;
  const schema = SURFACE_PARAM_SCHEMA[type] || [];

  addPanelTitle(panel, `${target.name} · ${SURFACE_LABEL_MAP[type] || type}`);
  if (!schema.length) {
    const hint = document.createElement("div");
    hint.style.cssText = "color:var(--mut);font-size:12px;";
    hint.textContent = "该材质无可调参数。";
    panel.appendChild(hint);
    return;
  }

  // Effective params = surface's own params, overlaid with any live override.
  const base = { ...(target.userData.surface.params || {}) };
  const ov = surfaceOverrides[target.name] || {};
  const eff = {};
  for (const s of schema) eff[s.key] = (s.key in ov) ? ov[s.key] : (base[s.key] ?? s.default);

  const writeOverride = (key, value) => {
    if (!surfaceOverrides[target.name]) surfaceOverrides[target.name] = {};
    surfaceOverrides[target.name][key] = value;
  };
  const preview = () => applyMaterial("model", { size: MAT_PREVIEW_SIZE, skipPanel: true });
  const full = () => applyMaterial("model", { size: MAT_FULL_SIZE, skipPanel: true });

  for (const spec of schema) {
    panel.appendChild(makeControl(spec, eff, preview, full, writeOverride));
  }
}

function addPanelTitle(panel, text) {
  const head = document.createElement("div");
  head.className = "pgroup-title";
  head.textContent = text;
  panel.appendChild(head);
}

// Build one parameter control bound to `store[spec.key]`. onPreview fires
// continuously (low-res rebake); onFull fires on release (full-res rebake).
// writeFn, when given, also records the value into a side store (overrides).
function makeControl(spec, store, onPreview, onFull, writeFn) {
  const g = document.createElement("div");
  g.className = "pgroup";
  const set = (v) => {
    store[spec.key] = v;
    if (writeFn) writeFn(spec.key, v);
    updateScriptPanel();
  };

  if (spec.type === "rgb") {
    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("span");
    label.textContent = spec.label;
    const picker = document.createElement("input");
    picker.type = "color";
    picker.value = rgbToHex(store[spec.key] || spec.default);
    picker.oninput = () => { set(hexToRgb(picker.value)); onPreview(); };
    picker.onchange = () => onFull();
    row.append(label, picker);
    g.append(row);
  } else if (spec.type === "select") {
    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("span");
    label.textContent = spec.label;
    const sel = document.createElement("select");
    for (const opt of spec.options || []) {
      const o = document.createElement("option");
      o.value = opt; o.textContent = spec.optionLabels?.[opt] || opt;
      sel.appendChild(o);
    }
    sel.value = store[spec.key] ?? spec.default;
    sel.onchange = () => { set(sel.value); onFull(); };
    row.append(label, sel);
    g.append(row);
  } else {
    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("span");
    label.textContent = spec.label;
    const val = document.createElement("span");
    val.className = "val";
    const cur = store[spec.key] ?? spec.default;
    val.textContent = String(cur);
    row.append(label, val);
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = spec.min; slider.max = spec.max; slider.step = spec.step;
    slider.value = cur;
    slider.oninput = () => {
      const v = Number(slider.value);
      set(v);
      val.textContent = String(v);
      onPreview();
    };
    slider.onchange = () => onFull();
    g.append(row, slider);
  }
  return g;
}

function rgbToHex(c) {
  const h = (x) => Math.max(0, Math.min(255, Math.round(x * 255))).toString(16).padStart(2, "0");
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

async function loadGeneratedModelById(id) {
  const safe = String(id || "").replace(/^\/+/, "").split(/[\\/]/).pop();
  if (!safe) return null;
  const file = safe.endsWith(".json") ? safe : `${safe}.json`;
  const modelId = file.replace(/\.json$/i, "");
  const loadingToken = await showGenerationLoading(`生成 ${modelId || "模型"}`);
  try {
    const res = await fetch(`/out/${file}`, { cache: "no-store" });
    if (!res.ok) return null;
    const model = await res.json();
    if (model?.meta?.procedural?.type === "speedtree-library") {
      await loadProcModel(makeSpeedTreeLibraryModel(model.meta.procedural, model.name), { loadingLabel: `生成 ${model.name || modelId}` });
      return true;
    }
    await loadViewerModel(model, { id: modelId, loadingLabel: `生成 ${model.name || modelId}` });
    return true;
  } catch {
    return null;
  } finally {
    hideGenerationLoading(loadingToken);
  }
}

const PROC_MODEL_ALIASES = {
  "teddy-bear": "teddy",
  "office-chair": "officechair",
  "city-block": "cityblock",
  "preview-sphere": "sphere",
  "hard-surface-panel": "hard-surface-kit",
};

function procModelForId(id) {
  const key = String(id || "").replace(/\.json$/i, "");
  const alias = PROC_MODEL_ALIASES[key] || key.replace(/-/g, "");
  return PROC_MODELS[key] || PROC_MODELS[alias] || null;
}

// ---- 分享即复现：把当前完整可视状态编码进 URL，任何人打开都还原同一画面 ----
// URL 载荷：?model=<id>&s=<base64url(JSON)>。s 里放参数/材质/环境/背景/视角/调试。
// 这是 Meshova 相对 Sketchfab 的差异点——产物是"可重跑脚本+参数"，不是烘死的封面。
function encodeShareState() {
  const state = {
    v: 1,
    view: currentView,
    mat: currentPreset,
    matParams: currentMatParams && Object.keys(currentMatParams).length ? currentMatParams : undefined,
    env: currentEnvName,
    envRot: envRotationDeg || undefined,
    bg: bgMode !== "env" ? { mode: bgMode, c: bgColor, c2: bgColor2 } : undefined,
    debug: debugView !== "off" ? debugView : undefined,
    wire: wireframe || undefined,
    params: currentParams || undefined,
    bindings: Object.keys(currentBindings).length ? currentBindings : undefined,
  };
  const json = JSON.stringify(state);
  // base64url，避免 URL 里出现 +/= 需转义
  const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return b64;
}

function decodeShareState(b64) {
  try {
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    const norm = b64.replace(/-/g, "+").replace(/_/g, "/") + pad;
    return JSON.parse(decodeURIComponent(escape(atob(norm))));
  } catch { return null; }
}

// 模型已加载后，按分享状态还原参数/材质/环境/背景/视角/调试。
async function applyShareState(state) {
  if (!state || typeof state !== "object") return;
  let needsRebuild = false;
  if (state.params && currentParams) {
    for (const k of Object.keys(state.params)) {
      if (k in currentParams) currentParams[k] = state.params[k];
    }
    needsRebuild = true;
  }
  if (state.bindings && drawableBindingSpec()) {
    currentBindings = { ...currentBindings, ...cloneSerializable(state.bindings) };
    needsRebuild = true;
  }
  if (needsRebuild) {
    renderParamPanel();
    syncDrawableUi();
    await rebuildAfterParamChange();
    updateScriptPanel();
  }
  if (state.env && ENV_PRESETS[state.env]) { applyEnvironment(state.env); if (envSel) envSel.value = state.env; }
  if (typeof state.envRot === "number") { applyEnvRotation(state.envRot); if (envRotEl) envRotEl.value = String(state.envRot); }
  if (state.bg && state.bg.mode) {
    bgMode = state.bg.mode; if (state.bg.c) bgColor = state.bg.c; if (state.bg.c2) bgColor2 = state.bg.c2;
    if (bgModeSel) bgModeSel.value = bgMode;
    syncBgColorInputs(); applyBackground();
  }
  if (state.mat) { applyMaterial(state.mat); if (matSel) matSel.value = state.mat; }
  if (state.matParams && currentMatParams) { Object.assign(currentMatParams, state.matParams); applyMaterial(currentPreset); }
  if (state.debug && state.debug !== "off") { applyDebugView(state.debug); if (debugSel) debugSel.value = debugView; syncToonCtl(); }
  if (state.wire) { wireframe = true; applyWire(); const b = document.getElementById("wire"); if (b) b.classList.add("on"); }
  if (state.view) fitView(state.view);
}

// 生成完整分享 URL 并写入地址栏（不刷新页面），返回 URL 字符串。
function buildShareUrl() {
  const modelId = currentModel?.id || currentLoadedSourceName || new URLSearchParams(location.search).get("model") || "";
  const u = new URL(location.href);
  u.search = "";
  if (modelId) u.searchParams.set("model", modelId);
  u.searchParams.set("s", encodeShareState());
  return u.toString();
}

// 初始模型由模型库通过 URL 参数 ?model=<id> 指定；工具栏不再有模型/材质下拉。
async function initModelSelect() {
  const first = Object.keys(PROC_MODELS)[0];
  const q = new URLSearchParams(location.search);
  const wanted = q.get("model");
  const shareRaw = q.get("s");
  const share = shareRaw ? decodeShareState(shareRaw) : null;
  let loaded = false;
  if (wanted) {
    const proc = procModelForId(wanted);
    if (proc) { await loadProcModel(proc); loaded = true; }
    else if (await loadGeneratedModelById(wanted)) loaded = true;
  }
  if (!loaded) await loadProcModel(PROC_MODELS[first]);
  // 模型就位后套用分享状态（延一帧确保 schema/材质面板已建）。
  if (share) requestAnimationFrame(() => applyShareState(share));
}

// ---- UI wiring ----
// 材质默认“跟随模型（匹配材质）”，不再提供工具栏下拉。
const matSel = null;
applyMaterial("model");

if (editBindingBtn) editBindingBtn.onclick = () => setBindingEditEnabled(!bindingEditEnabled);
if (drawBindingBtn) drawBindingBtn.onclick = () => activeDrawing ? finishBindingDrawing() : beginBindingDrawing();
if (undoBindingBtn) undoBindingBtn.onclick = undoBindingEdit;
if (redoBindingBtn) redoBindingBtn.onclick = redoBindingEdit;
if (resetBindingBtn) resetBindingBtn.onclick = resetDrawableBinding;

document.querySelectorAll("[data-view]").forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll("[data-view]").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
    fitView(b.dataset.view);
  };
});
document.getElementById("wire").onclick = (e) => {
  wireframe = !wireframe; e.target.classList.toggle("on", wireframe); applyWire();
};
document.getElementById("autorot").onclick = (e) => {
  autorot = !autorot; e.target.classList.toggle("on", autorot);
};
document.getElementById("grid").onclick = (e) => {
  grid.visible = !grid.visible; e.target.classList.toggle("on", grid.visible);
};
const semanticSplitBtn = document.getElementById("semantic-split");
if (semanticSplitBtn) semanticSplitBtn.onclick = async () => {
  semanticSplitBtn.disabled = true;
  try {
    const res = await autoSemanticSplitCurrent();
    if (!res.ok && hud) hud.textContent = `自动拆分失败: ${res.error}`;
  } catch (err) {
    fail("自动拆分出错: " + (err?.message || err));
  } finally {
    semanticSplitBtn.disabled = false;
  }
};
const aiSemanticSplitBtn = document.getElementById("ai-semantic-split");
if (aiSemanticSplitBtn) aiSemanticSplitBtn.onclick = async () => {
  aiSemanticSplitBtn.disabled = true;
  try {
    const res = await runAiGuidedSplitCurrent();
    if (!res.ok && hud) hud.textContent = `AI切割失败: ${res.error}`;
  } catch (err) {
    fail("AI切割出错: " + (err?.message || err));
  } finally {
    aiSemanticSplitBtn.disabled = false;
  }
};
const tposeBtn = document.getElementById("tpose");
if (tposeBtn) tposeBtn.onclick = async () => {
  tposeBtn.disabled = true;
  try {
    const res = await autoTPoseCurrent();
    if (!res.ok && hud) hud.textContent = `T-Pose失败: ${res.error}`;
  } catch (err) {
    fail("T-Pose出错: " + (err?.message || err));
  } finally {
    tposeBtn.disabled = false;
  }
};
if (scriptToggleBtn) scriptToggleBtn.onclick = () => setScriptPanelOpen(!scriptPanelOpen);
if (scriptCloseBtn) scriptCloseBtn.onclick = () => setScriptPanelOpen(false);
if (scriptCopyBtn) scriptCopyBtn.onclick = async () => {
  const text = scriptCodeEl ? scriptCodeEl.textContent : "";
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  const old = scriptCopyBtn.textContent;
  scriptCopyBtn.textContent = "已复制";
  setTimeout(() => { scriptCopyBtn.textContent = old; }, 900);
};
document.getElementById("reset").onclick = () => fitView("persp");

// 分享：生成可复现链接，写入地址栏并复制到剪贴板。
const shareBtn = document.getElementById("share");
if (shareBtn) shareBtn.onclick = async () => {
  const url = buildShareUrl();
  try { history.replaceState(null, "", url); } catch { /* file:// 下忽略 */ }
  const done = () => {
    const old = shareBtn.textContent;
    shareBtn.textContent = "链接已复制";
    shareBtn.classList.add("on");
    setTimeout(() => { shareBtn.textContent = old; shareBtn.classList.remove("on"); }, 1200);
  };
  try {
    await navigator.clipboard.writeText(url);
    done();
  } catch {
    // 剪贴板不可用（非安全上下文）时，退回选中提示
    window.prompt("复制此分享链接：", url);
  }
};

// Environment (IBL lighting mood) selector.
const envSel = document.getElementById("env");
if (envSel) {
  for (const name of ENV_NAMES) {
    const opt = document.createElement("option");
    opt.value = name; opt.textContent = ENV_PRESETS[name].label;
    envSel.appendChild(opt);
  }
  envSel.value = currentEnvName;
  envSel.onchange = () => applyEnvironment(envSel.value);
}

// Environment rotation slider (spins IBL + background around Y).
const envRotEl = document.getElementById("envrot");
if (envRotEl) envRotEl.oninput = () => applyEnvRotation(Number(envRotEl.value));

// Debug view selector (normal/matcap/depth/ao) for VLM-friendly inspection.
const debugSel = document.getElementById("debug");
const toonCtl = document.getElementById("toon-ctl");
function syncToonCtl() { if (toonCtl) toonCtl.style.display = debugView === "toon" ? "" : "none"; }
if (debugSel) {
  debugSel.value = debugView;
  debugSel.onchange = () => { applyDebugView(debugSel.value); syncToonCtl(); };
}
// Toon tunables: segments / outline width / outline color. Steps rebuild the
// gradient (full re-enter); width/color just update the live outline uniforms.
const toonStepsEl = document.getElementById("toon-steps");
const toonOutlineEl = document.getElementById("toon-outline");
const toonColorEl = document.getElementById("toon-color");
function updateOutlineUniforms() {
  modelRoot.traverse((o) => {
    if (o.userData && o.userData.isOutline && o.material.uniforms) {
      o.material.uniforms.uThickness.value = toonParams.outline;
      o.material.uniforms.uColor.value.set(toonParams.color);
    }
  });
  resetTAA();
}
if (toonStepsEl) toonStepsEl.oninput = () => { toonParams.steps = Number(toonStepsEl.value); if (debugView === "toon") applyDebugView("toon"); };
if (toonOutlineEl) toonOutlineEl.oninput = () => { toonParams.outline = Number(toonOutlineEl.value); updateOutlineUniforms(); };
if (toonColorEl) toonColorEl.oninput = () => { toonParams.color = parseInt(toonColorEl.value.slice(1), 16); updateOutlineUniforms(); };

// PBR enhancement toggles: edge wear (curvature) + parallax-occlusion mapping.
// Both rebuild materials (the shader injection happens at bake time).
const edgeWearBtn = document.getElementById("edgewear");
if (edgeWearBtn) edgeWearBtn.onclick = (e) => {
  edgeWearOn = !edgeWearOn; e.target.classList.toggle("on", edgeWearOn);
  applyMaterial(currentPreset); resetTAA();
};
const pomBtn = document.getElementById("pom");
if (pomBtn) pomBtn.onclick = (e) => {
  pomOn = !pomOn; e.target.classList.toggle("on", pomOn);
  applyMaterial(currentPreset); resetTAA();
};
const rimBtn = document.getElementById("rim");
if (rimBtn) rimBtn.onclick = (e) => {
  rimOn = !rimOn; e.target.classList.toggle("on", rimOn);
  applyMaterial(currentPreset); resetTAA();
};
const fogBtn = document.getElementById("fog");
if (fogBtn) fogBtn.onclick = (e) => {
  fogOn = !fogOn; e.target.classList.toggle("on", fogOn);
  fogPass.enabled = fogOn; resetTAA();
};
const cloudBtn = document.getElementById("cloudvol");
if (cloudBtn) {
  cloudBtn.classList.toggle("on", cloudVolOn);
  cloudBtn.onclick = (e) => {
    cloudVolOn = !cloudVolOn; e.target.classList.toggle("on", cloudVolOn);
    applyMaterial(currentPreset); resetTAA();
  };
}

// Floor mode (shadow/glossy/mirror) + depth-of-field toggle.
const floorSel = document.getElementById("floor");
if (floorSel) {
  floorSel.value = floorMode;
  floorSel.onchange = () => applyFloor(floorSel.value);
}
const dofBtn = document.getElementById("dof");
if (dofBtn) {
  dofBtn.onclick = (e) => {
    bokeh.enabled = !bokeh.enabled;
    e.target.classList.toggle("on", bokeh.enabled);
    if (bokeh.enabled) bokeh.uniforms["focus"].value = camera.position.distanceTo(controls.target);
    resetTAA();
  };
}

// ---- OpPlan timeline UI: load a plan, step through intermediate meshes ----
let currentPlan = null;
const planPanel = document.getElementById("plan-panel");
const planStepsEl = document.getElementById("plan-steps");
const planInfoEl = document.getElementById("plan-info");

function renderPlanSteps(activeStep) {
  if (!planStepsEl) return;
  if (!currentPlan) { if (planPanel) planPanel.style.display = "none"; return; }
  if (planPanel) planPanel.style.display = "";
  const steps = window.__meshova.planSteps(currentPlan);
  planStepsEl.innerHTML = "";
  for (const s of steps) {
    const row = document.createElement("div");
    row.className = "part-row" + (s.step === activeStep ? " sel" : "");
    row.style.cssText = "cursor:pointer;padding:3px 6px;font-size:12px;border-radius:4px;";
    const tag = s.part ? ` ▸${s.part}` : "";
    row.textContent = `${s.step}. ${s.id} · ${s.op}${tag}`;
    row.title = s.note || s.op;
    row.onclick = () => showPlanStep(s.step);
    planStepsEl.appendChild(row);
  }
  const full = document.createElement("div");
  full.className = "part-row" + (activeStep === -1 ? " sel" : "");
  full.style.cssText = "cursor:pointer;padding:3px 6px;font-size:12px;border-radius:4px;font-weight:600;";
  full.textContent = "★ 完整计划";
  full.onclick = () => showPlanStep(-1);
  planStepsEl.appendChild(full);
}

function showPlanStep(step) {
  if (!currentPlan) return;
  const res = step < 0
    ? window.__meshova.loadPlan(currentPlan)
    : window.__meshova.loadPlan(currentPlan, { upTo: step });
  renderPlanSteps(step);
  if (planInfoEl) {
    planInfoEl.style.cssText = "margin-top:6px;font-size:11px;color:#8aa;";
    if (!res || res.ok === false) {
      planInfoEl.textContent = `✗ ${res && res.error ? res.error : "求值失败"}${res && res.failedNode ? " @ " + res.failedNode : ""}`;
    } else if (step < 0) {
      planInfoEl.textContent = `完整计划 · ${res.parts} 部件`;
    } else {
      planInfoEl.textContent = `步骤 ${step} · ${res.node || ""}`;
    }
  }
}

function loadPlanFromText(text) {
  try {
    const plan = JSON.parse(text);
    if (!plan || !Array.isArray(plan.nodes)) throw new Error("不是合法的 OpPlan（缺 nodes）");
    currentPlan = plan;
    showPlanStep(-1);
  } catch (err) {
    if (planInfoEl) { planInfoEl.style.display = ""; planInfoEl.textContent = `✗ ${err.message}`; }
    if (planPanel) planPanel.style.display = "";
  }
}

const planLoadBtn = document.getElementById("plan-load");
if (planLoadBtn) {
  planLoadBtn.onclick = async () => {
    let text = "";
    try {
      if (navigator.clipboard && navigator.clipboard.readText) text = await navigator.clipboard.readText();
    } catch { /* clipboard blocked; fall through to prompt */ }
    if (!text) text = window.prompt("粘贴 OpPlan JSON：") || "";
    if (text.trim()) loadPlanFromText(text.trim());
  };
}
const planFullBtn = document.getElementById("plan-full");
if (planFullBtn) planFullBtn.onclick = () => { if (currentPlan) showPlanStep(-1); };
if (optRunBtn) optRunBtn.onclick = () => runCandidateSearch();
if (optModeSel) optModeSel.onchange = () => renderOptimizationPanel();

// Background mode + color pickers (decoupled from the IBL environment).
const bgModeSel = document.getElementById("bgmode");
const bgColorEl = document.getElementById("bgcolor");
const bgColor2El = document.getElementById("bgcolor2");
function syncBgColorInputs() {
  const showColors = bgMode === "solid" || bgMode === "gradient";
  if (bgColorEl) bgColorEl.style.display = showColors ? "" : "none";
  if (bgColor2El) bgColor2El.style.display = bgMode === "gradient" ? "" : "none";
}
if (bgModeSel) {
  bgModeSel.value = bgMode;
  bgModeSel.onchange = () => { bgMode = bgModeSel.value; syncBgColorInputs(); applyBackground(); };
}
if (bgColorEl) bgColorEl.oninput = () => { bgColor = bgColorEl.value; applyBackground(); };
if (bgColor2El) bgColor2El.oninput = () => { bgColor2 = bgColor2El.value; applyBackground(); };
syncBgColorInputs();

addEventListener("resize", () => {
  camera.aspect = stage.clientWidth / stage.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  composer.setSize(stage.clientWidth, stage.clientHeight);
  gtao.setSize(stage.clientWidth, stage.clientHeight);
  bloom.setSize(stage.clientWidth, stage.clientHeight);
  if (bokeh) bokeh.setSize(stage.clientWidth, stage.clientHeight);
  resizeSceneDepthTarget();
  resetTAA();
});

// Orbit/pan/zoom changes camera distance. Refit clipping planes so a stale
// near plane cannot slice through large scenes after dollying inward.
controls.addEventListener("change", () => {
  updateCameraClipPlanes();
  resetTAA();
});

// Track camera movement: if the view changed since last frame, we're not idle.
const _prevCamPos = new THREE.Vector3();
const _prevCamTarget = new THREE.Vector3();
function cameraMoved() {
  const moved = !_prevCamPos.equals(camera.position) || !_prevCamTarget.equals(controls.target);
  _prevCamPos.copy(camera.position);
  _prevCamTarget.copy(controls.target);
  return moved;
}

function animate() {
  requestAnimationFrame(animate);
  if (autorot) { modelRoot.rotation.y += 0.004; resetTAA(); }
  controls.update();

  // Tick wind: advance uTime for every foliage material carrying wind uniforms.
  // Traverse so material swaps (preset changes) are always reflected. Wind keeps
  // animating when the camera is still, so TAA stays off while it runs.
  if (windEnabled && windMeshes.length) {
    const t = windClock.getElapsedTime();
    for (const o of windMeshes) {
      const u = o.material && o.material.userData && o.material.userData.windUniforms;
      if (u) {
        if (u.uTime) u.uTime.value = t;
        if (u.uWindStrength) u.uWindStrength.value = windStrength;
      }
    }
  }
  if (waterfallFxMeshes.length) {
    updateWaterfallFx(waterfallFxTimeOverride ?? windClock.getElapsedTime());
    if (waterfallFxTimeOverride === null) {
      idleFrames = 0;
      if (taaPass) taaPass.accumulate = false;
    }
  }
  if (waterSurfaceMeshes.length) {
    updateWaterSurfaceFx(waterfallFxTimeOverride ?? windClock.getElapsedTime());
    if (waterfallFxTimeOverride === null) {
      idleFrames = 0;
      if (taaPass) taaPass.accumulate = false;
    }
  }

  // Drive progressive AA: once the camera has been still for a few frames,
  // enable TAA accumulation so the image refines toward a clean supersample.
  if (taaEnabled && postEnabled) {
    if (cameraMoved()) {
      idleFrames = 0;
      taaPass.accumulate = false;
      // Track focus while orbiting so the subject stays sharp under DOF.
      if (bokeh && bokeh.enabled) bokeh.uniforms["focus"].value = camera.position.distanceTo(controls.target);
    } else if (idleFrames < IDLE_BEFORE_ACCUM) {
      idleFrames++;
      if (idleFrames >= IDLE_BEFORE_ACCUM) taaPass.accumulate = true;
    }
  }

  if (!loadingEl?.classList.contains("show")) {
    if (cloudVolOn && cloudVolumeMeshes.length) updateCloudVolumes();
    if (waterSurfaceMeshes.length || (fogOn && postEnabled)) captureSceneDepth();
    if (fogOn && postEnabled) updateFog();
    if (postEnabled) composer.render();
    else renderer.render(scene, camera);
  }
}

function captureSceneDepth() {
  const prevTarget = renderer.getRenderTarget();
  const prevOverride = scene.overrideMaterial;
  const prevBackground = scene.background;
  const prevClearColor = renderer.getClearColor(new THREE.Color());
  const prevClearAlpha = renderer.getClearAlpha();
  const waterVisibility = waterSurfaceMeshes.map((mesh) => mesh.visible);
  for (const mesh of waterSurfaceMeshes) mesh.visible = false;
  scene.overrideMaterial = fogDepthMat;
  scene.background = null;
  renderer.setClearColor(0xffffff, 1);
  renderer.setRenderTarget(fogDepthRT);
  renderer.clear();
  renderer.render(scene, camera);
  for (let i = 0; i < waterSurfaceMeshes.length; i++) waterSurfaceMeshes[i].visible = waterVisibility[i];
  scene.overrideMaterial = prevOverride;
  scene.background = prevBackground;
  renderer.setClearColor(prevClearColor, prevClearAlpha);
  renderer.setRenderTarget(prevTarget);
}

function updateFog() {
  const u = fogPass.uniforms;
  u.uInvProj.value.copy(camera.projectionMatrixInverse);
  u.uInvView.value.copy(camera.matrixWorld);
  u.uCamPos.value.copy(camera.position);
  u.uSunDir.value.copy(SUN_DIR);
  u.uNear.value = camera.near;
  u.uFar.value = camera.far;
  u.uDensity.value = fogOpts.density;
  u.uHeight.value = fogOpts.height;
  u.uShaft.value = fogOpts.shaft;
}
animate();
applyEnvironment("studio");
window.__meshovaReady = initModelSelect().then(() => {
  window.__meshovaBootDone?.();
}).catch((e) => {
  window.__meshovaBootDone?.();
  forceHideGenerationLoading();
  fail("加载初始模型出错: " + (e?.message || e));
  console.error(e);
});

// Expose hooks for headless screenshot tooling + AI procedural control.
window.__meshova = {
  // procedural model control
  models: () => Object.keys(PROC_MODELS),
  loadModelById: async (id) => {
    const proc = procModelForId(id);
    if (proc) return loadProcModel(proc);
    return loadGeneratedModelById(id);
  },
  // Load raw AI-generated parts directly (bypasses PROC_MODELS). Accepts a
  // ViewerModel-like { name, parts:[{name,color,positions,normals,uvs,indices}] }
  // or already-built {name, mesh, color} parts. Used by the agent loop's
  // render callback to screenshot arbitrary script output.
  loadParts: (model) => loadViewerModel(model),
  getParams: () => ({ ...currentParams }),
  getBindings: () => cloneSerializable(currentBindings),
  getBindingEditorState: () => bindingEditorState(),
  setBinding: (key, binding) => {
    const spec = workflowBindingSpecs().find((item) => item.key === key);
    if (!spec || !binding || !Array.isArray(binding.points)) return false;
    currentBindings[key] = cloneSerializable({ ...binding, kind: spec.kind, closed: bindingIsClosed(spec) });
    renderParamPanel();
    syncDrawableUi();
    return rebuildAfterParamChange().then(() => true);
  },
  resetBinding: () => resetDrawableBinding(),
  startDrawing: () => beginBindingDrawing(),
  finishDrawing: () => finishBindingDrawing(),
  startBindingEdit: () => setBindingEditEnabled(true),
  finishBindingEdit: () => setBindingEditEnabled(false),
  undoBindingEdit: () => undoBindingEdit(),
  redoBindingEdit: () => redoBindingEdit(),
  getRenderStats: () => {
    let sceneMeshes = 0;
    let instancedMeshes = 0;
    modelRoot.traverse((object) => {
      if (!object.isMesh || object.userData.isOutline) return;
      sceneMeshes++;
      if (object.isInstancedMesh) instancedMeshes++;
    });
    return {
      ...lastMeta,
      sceneMeshes,
      instancedMeshes,
      geometries: renderer.info.memory.geometries,
      pixelRatio: renderer.getPixelRatio(),
      performanceTier: activePerfTier,
      postEnabled,
      taaEnabled,
      gtaoEnabled: gtao.enabled,
      bloomEnabled: bloom.enabled,
      shadowsEnabled: renderer.shadowMap.enabled,
    };
  },
  setParam: (key, value) => {
    if (!currentParams || !(key in currentParams)) return;
    currentParams[key] = value;
    clearOptimizationRun();
    renderParamPanel();
    return rebuildAfterParamChange();
  },
  setParams: (obj) => {
    if (!currentParams) return;
    Object.assign(currentParams, obj);
    clearOptimizationRun();
    renderParamPanel();
    return rebuildAfterParamChange();
  },
  setPartTexture: (partName, path, channel = "baseColor") => setPartTexture(partName, path, channel),
  getPartTextures: (partName) => ({ ...(currentParts.find((part) => part.name === partName)?.textures || {}) }),
  // view + material
  setView: (v) => fitView(v),
  setZoom: (factor) => zoomCamera(factor),
  setAutorot: (on) => { autorot = on; },
  setWire: (on) => { wireframe = on; applyWire(); },
  setGrid: (on) => { grid.visible = !!on; const btn = document.getElementById("grid"); if (btn) btn.classList.toggle("on", grid.visible); },
  // wind: toggle GPU foliage sway / set amplitude. Screenshots call setWind(false)
  // for a frozen, deterministic frame.
  setWind: (on, strength) => {
    windEnabled = !!on;
    if (typeof strength === "number") windStrength = strength;
  },
  // null = live animation; numeric time = deterministic frozen FX frame.
  setFxTime: (time) => {
    waterfallFxTimeOverride = time !== null && time !== undefined && Number.isFinite(Number(time)) ? Number(time) : null;
    if (waterfallFxMeshes.length) updateWaterfallFx(waterfallFxTimeOverride ?? windClock.getElapsedTime());
    if (waterSurfaceMeshes.length) updateWaterSurfaceFx(waterfallFxTimeOverride ?? windClock.getElapsedTime());
    resetTAA();
  },
  // Orbit the camera to a specific azimuth (radians, around +Y) and elevation
  // (degrees above horizon). Used by the imposter atlas capture to shoot a tree
  // from N evenly-spaced angles with an identical framing each time.
  setOrbit: (azimuth, elevationDeg = 10) => {
    const s = lastSize;
    const r = Math.max(s.x, s.y, s.z);
    const d = r * 1.9;
    const el = (elevationDeg * Math.PI) / 180;
    const cy = s.y * 0.5;
    const horiz = Math.cos(el) * d;
    camera.position.set(Math.sin(azimuth) * horiz, cy + Math.sin(el) * d, Math.cos(azimuth) * horiz);
    controls.target.set(0, cy, 0);
    updateCameraClipPlanes();
    controls.update();
    if (bokeh) bokeh.uniforms["focus"].value = camera.position.distanceTo(controls.target);
    resetTAA();
  },
  setMaterial: (name) => { applyMaterial(name); if (matSel) matSel.value = name; },
  setPost: (on) => { postUserOverride = !!on; postEnabled = !!on; resetTAA(); },
  setPerformanceMode: (mode = "auto") => {
    if (mode !== "auto" && !PERF_TIERS[mode]) return false;
    perfMode = mode;
    postUserOverride = null;
    applyAdaptivePerformance(lastMeta);
    updateMeta();
    return true;
  },
  setBloom: (strength) => { bloom.strength = strength; resetTAA(); },
  setAO: (on) => { gtao.enabled = !!on; resetTAA(); },
  // environment + background (headless control for the AI screenshot loop)
  environments: () => ENV_NAMES.slice(),
  setEnvironment: (name) => { if (ENV_PRESETS[name]) { applyEnvironment(name); if (envSel) envSel.value = name; } },
  setEnvRotation: (deg) => { applyEnvRotation(Number(deg) || 0); if (envRotEl) envRotEl.value = String(((Number(deg) || 0) % 360 + 360) % 360); },
  // Debug views for VLM semantic decomposition and stylized rendering.
  debugViews: () => ["off", "lowpoly", "toon", "normal", "matcap", "depth", "ao"],
  setDebugView: (mode) => { applyDebugView(mode); if (debugSel) debugSel.value = debugView; syncToonCtl(); },
  // Toon tunables + PBR enhancement toggles (also usable from headless shots).
  setToonParams: (p = {}) => {
    if (p.steps != null) toonParams.steps = p.steps;
    if (p.outline != null) toonParams.outline = p.outline;
    if (p.color != null) toonParams.color = typeof p.color === "string" ? parseInt(p.color.replace("#",""),16) : p.color;
    if (debugView === "toon") applyDebugView("toon");
  },
  setEdgeWear: (on, opts = {}) => { edgeWearOn = !!on; Object.assign(edgeWearOpts, opts); applyMaterial(currentPreset); resetTAA(); },
  setPOM: (on, opts = {}) => { pomOn = !!on; Object.assign(pomOpts, opts); applyMaterial(currentPreset); resetTAA(); },
  setRimLight: (on, opts = {}) => { rimOn = !!on; Object.assign(rimOpts, opts); applyMaterial(currentPreset); resetTAA(); },
  setFog: (on, opts = {}) => { fogOn = !!on; Object.assign(fogOpts, opts); fogPass.enabled = fogOn; resetTAA(); },
  // Volumetric cloud rendering: cloud parts raymarch into soft vapor instead of
  // the hard metaball shell. On by default; headless-controllable for the loop.
  setCloudVolume: (on) => {
    cloudVolOn = !!on;
    const btn = document.getElementById("cloudvol");
    if (btn) btn.classList.toggle("on", cloudVolOn);
    applyMaterial(currentPreset); resetTAA();
  },
  // Floor + depth of field (showroom presentation controls).
  setFloor: (mode) => { applyFloor(mode); if (floorSel) floorSel.value = floorMode; },
  setDOF: (on, opts = {}) => {
    bokeh.enabled = !!on;
    if (opts.aperture !== undefined) bokeh.uniforms["aperture"].value = opts.aperture;
    if (opts.maxblur !== undefined) bokeh.uniforms["maxblur"].value = opts.maxblur;
    if (opts.focus !== undefined) bokeh.uniforms["focus"].value = opts.focus;
    else if (bokeh.enabled) bokeh.uniforms["focus"].value = camera.position.distanceTo(controls.target);
    if (dofBtn) dofBtn.classList.toggle("on", bokeh.enabled);
    resetTAA();
  },
  setBackground: (mode, color, color2) => {
    if (mode) bgMode = mode;
    if (color) bgColor = color;
    if (color2) bgColor2 = color2;
    if (bgModeSel) bgModeSel.value = bgMode;
    if (bgColorEl && color) bgColorEl.value = color;
    if (bgColor2El && color2) bgColor2El.value = color2;
    syncBgColorInputs();
    applyBackground();
  },
  // Force-finish TAA accumulation, then resolve once a stable, fully
  // anti-aliased frame is on screen. Use this before grabbing a screenshot.
  settle: async (frames = 12) => {
    await waitForImportedTextures();
    return new Promise((resolve) => {
    resetTAA();
    let n = 0;
    const step = () => {
      controls.update();
      taaPass.accumulate = n >= IDLE_BEFORE_ACCUM;
      if (cloudVolOn && cloudVolumeMeshes.length) updateCloudVolumes();
      if (waterSurfaceMeshes.length || (fogOn && postEnabled)) captureSceneDepth();
      if (fogOn && postEnabled) updateFog();
      if (postEnabled) composer.render(); else renderer.render(scene, camera);
      if (++n >= frames) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    });
  },
  getMatParams: () => ({ ...currentMatParams }),
  setMatParam: (key, value) => {
    currentMatParams[key] = value;
    applyMaterial(currentPreset);
  },
  // Per-part matched-surface override (model mode): retune one part's material.
  setPartSurfaceParam: (partName, key, value) => {
    if (!surfaceOverrides[partName]) surfaceOverrides[partName] = {};
    surfaceOverrides[partName][key] = value;
    if (currentPreset === "model") applyMaterial("model");
  },
  captureSemanticFrame: (frames = 12) => captureSemanticFrame(frames),
  applySemanticAnalysis: (analysis) => applySemanticAnalysis(analysis),
  captureAiSplitFrame: (options = {}) => captureAiSplitFrame(options),
  applyAiGuidedSplit: (payload = {}) => applyAiGuidedSplit(payload),
  runAiGuidedSplit: (options = {}) => runAiGuidedSplitCurrent(options),
  autoSemanticSplit: (options = {}) => autoSemanticSplitCurrent(options),
  autoTPose: (options = {}) => autoTPoseCurrent(options),
  getSurfaceParams: () => (currentSurfaceName ? { ...currentSurfaceParams } : null),
  setSurfaceParam: (key, value) => {
    if (!currentSurfaceName) return;
    currentSurfaceParams[key] = value;
    applyMaterial(currentSurfaceName);
  },
  runOptimization: runCandidateSearch,
  getOptimizationRun: () => currentOptimizationRun,
  applyOptimizationCandidate,
  selectPart: (name) => {
    selectedPart = name;
    applySelectionHighlight();
    renderMatPanel();
    renderPartList(currentParts);
    updateScriptPanel();
  },
  presets: () => ["model", "none", ...PRESET_NAMES, ...BUILDER_NAMES, ...SURFACE_NAMES],
  meta: () => ({ ...lastMeta }),
  showScript: (open = true) => setScriptPanelOpen(open),
  getScript: () => buildScriptText(),
  screenshotReady: () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  canvas: () => renderer.domElement,

  // ---- P4 OpPlan: step-through debug view for the AI screenshot loop ----
  // Render an OpPlan (the serializable modeling graph). `opts.upTo` evaluates
  // only the first N+1 nodes and shows the mesh produced by node index `upTo`,
  // so a defect ("step 3 bevel too wide") can be isolated visually. With no
  // upTo, all part-tagged nodes render as the full scene.
  loadPlan: (plan, opts = {}) => {
    if (!plan || !Array.isArray(plan.nodes)) return { ok: false, error: "invalid plan" };
    const upTo = opts.upTo;
    if (upTo === undefined || upTo === null) {
      const res = evalPlan(plan);
      if (!res.ok) {
        if (hud) hud.textContent = `计划求值失败 @ ${res.failedNode || "?"}: ${res.error || ""}`;
        return { ok: false, error: res.error, failedNode: res.failedNode };
      }
      const vm = toViewerModel(res.parts, plan.name || "opplan");
      window.__meshova.loadParts(vm);
      return { ok: true, parts: res.parts.length, stats: planNodeStats(res) };
    }
    // Partial: evaluate a prefix of the plan and show the target node's mesh.
    const n = Math.max(0, Math.min(plan.nodes.length - 1, upTo | 0));
    const prefix = { ...plan, nodes: plan.nodes.slice(0, n + 1) };
    const res = evalPlan(prefix);
    if (!res.ok) {
      if (hud) hud.textContent = `计划第 ${n} 步失败 @ ${res.failedNode || "?"}: ${res.error || ""}`;
      return { ok: false, error: res.error, failedNode: res.failedNode };
    }
    const targetId = plan.nodes[n].id;
    const mesh = res.values.get(targetId);
    if (!mesh || !Array.isArray(mesh.positions)) {
      // Target node produced no mesh (e.g. a profile/number): show whatever
      // parts exist so far instead.
      const vm = toViewerModel(res.parts, `${plan.name || "opplan"}@${n}`);
      window.__meshova.loadParts(vm);
      return { ok: true, note: `node ${targetId} is not a mesh`, parts: res.parts.length };
    }
    const part = { name: targetId, mesh, color: [0.7, 0.74, 0.8] };
    const vm = toViewerModel([part], `${plan.name || "opplan"}@${targetId}`);
    window.__meshova.loadParts(vm);
    if (hud) hud.textContent = `计划步 ${n}/${plan.nodes.length - 1} · ${targetId}`;
    return { ok: true, node: targetId, step: n, total: plan.nodes.length };
  },
  // Step descriptor list for building a debug UI/timeline.
  planSteps: (plan) => {
    if (!plan || !Array.isArray(plan.nodes)) return [];
    return plan.nodes.map((nd, i) => ({ step: i, id: nd.id, op: nd.op, part: nd.part ? nd.part.name : null, note: nd.note || null }));
  },
  describePlan: (plan) => (plan ? describePlan(plan) : ""),
};
window.__meshova.setPlan = (plan) => { currentPlan = plan; showPlanStep(-1); };
window.__meshova.showPlanStep = showPlanStep;
