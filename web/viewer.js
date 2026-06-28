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
import { bakeMaterial, bakeSurface, bakeSurfaceByName, isSurface, SURFACE_NAMES, SURFACE_LABEL_MAP, PRESET_NAMES, BUILDER_NAMES, SURFACE_PARAM_SCHEMA, defaultSurfaceParams } from "/web/materials.js";
import { PRESET_PARAM_SCHEMA, defaultMatParams, evalPlan, describePlan, planNodeStats, toViewerModel } from "/dist/index.js";
import { PROC_MODELS, defaultParams } from "/web/procmodels.js";
import { makeHumanParamSchema, defaultMakeHumanParams, buildMakeHumanParts } from "/web/makehuman.js";

const stage = document.getElementById("stage");
const errEl = document.getElementById("err");
const hud = document.getElementById("hud");
const scriptPanel = document.getElementById("script-panel");
const scriptCodeEl = document.getElementById("script-code");
const scriptToggleBtn = document.getElementById("script-toggle");
const scriptCopyBtn = document.getElementById("script-copy");
const scriptCloseBtn = document.getElementById("script-close");

function fail(msg) {
  errEl.style.display = "flex";
  errEl.textContent = msg;
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
let bgColor = "#10141c";         // solid color / gradient top
let bgColor2 = "#05070b";        // gradient bottom

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

const grid = new THREE.GridHelper(20, 20, 0x30363d, 0x1c2330);
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
const fogDepthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });

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

let modelRoot = new THREE.Group();
scene.add(modelRoot);
let wireframe = false;
let autorot = false; // models stay still by default
let currentPreset = "model"; // default: follow each part's own matched surface
let currentMatPreset = null;   // preset whose params are loaded
let currentMatParams = {};     // active material param values
let currentModel = null;   // active ProcModel definition
let currentParams = null;  // active param values
let currentLoadedSource = null; // raw source carried by AI/external ViewerModel
let currentLoadedSourceName = "";
let selectedPart = null;   // selected part name
let currentParts = [];     // last built parts, kept for async models
let lastMeta = { parts: 0, verts: 0, tris: 0 };
let rebuildToken = 0;

// ---- Wind animation state ----
// Materials that carry a wind weight attribute register their `uTime` uniform
// here; the animate loop ticks them so foliage sways on the GPU. Topology never
// changes — sway is a vertex-shader displacement driven by per-vertex weight.
const windClock = new THREE.Clock();
let windEnabled = true;     // global toggle (off freezes for clean screenshots)
let windStrength = 0.08;    // world-unit sway amplitude at weight=1

// Per-part surface param overrides in "model" (matched) mode, keyed by part
// name. Each value is a partial params object merged onto the part's own
// surface params before baking, so editing the right panel retunes just that
// part's matched material (fur tint, metal roughness, ...) live.
let surfaceOverrides = {};
// Live params for a globally-applied named surface (dropdown -> glass/metal/...).
let currentSurfaceName = null;
let currentSurfaceParams = {};

// Flatten a Meshova Mesh (arrays of Vec3/Vec2) into typed arrays for three.
function meshToBuffers(mesh) {
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
  }
  return { pos, nrm, uv, indices: mesh.indices };
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

/** Build (or rebuild) the scene meshes from a list of {name, mesh, color} parts. */
function buildParts(parts, { keepCamera = false } = {}) {
  currentParts = parts;
  scene.remove(modelRoot);
  modelRoot.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose?.(); } });
  modelRoot = new THREE.Group();

  let verts = 0, tris = 0;
  for (const part of parts) {
    const { pos, nrm, uv, indices } = meshToBuffers(part.mesh);
    verts += part.mesh.positions.length;
    tris += indices.length / 3;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setAttribute("uv1", new THREE.BufferAttribute(uv, 2));
    // Per-vertex colors (shape-aligned material): attach as a color attribute.
    const hasVColors = Array.isArray(part.colors) && part.colors.length === part.mesh.positions.length * 3;
    if (hasVColors) {
      geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(part.colors), 3));
    }
    // Per-vertex wind weight: drives the GPU sway shader (foliage animation).
    const hasWind = Array.isArray(part.windWeight) && part.windWeight.length === part.mesh.positions.length;
    if (hasWind) {
      geo.setAttribute("windWeight", new THREE.BufferAttribute(new Float32Array(part.windWeight), 1));
    }
    // Per-vertex true curvature (convexity 0..1) for edge wear. Precomputed here
    // so every part has it without bloating the exported model JSON.
    geo.setAttribute("curvature", new THREE.BufferAttribute(computeCurvatureAttr(part.mesh), 1));
    geo.setIndex([...indices]);
    const mesh = new THREE.Mesh(geo, makePartMaterial(part.color, hasVColors));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = part.name;
    mesh.userData.baseColor = part.color;
    mesh.userData.vertexColors = hasVColors;
    mesh.userData.hasWind = hasWind;     // remember so material swaps re-inject wind
    mesh.userData.surface = part.surface || null; // matched per-part material
    if (hasWind) attachWind(mesh.material);
    modelRoot.add(mesh);
  }

  const bbox = new THREE.Box3().setFromObject(modelRoot);
  const center = new THREE.Vector3();
  bbox.getCenter(center);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  modelRoot.position.set(-center.x, -bbox.min.y, -center.z);
  scene.add(modelRoot);

  lastMeta = {
    parts: parts.length,
    verts,
    tris,
    size: { x: size.x, y: size.y, z: size.z },
  };
  if (!keepCamera) fitView("persp", size);
  else lastSize = size.clone();
  updateShadowCamera();   // refit shadow frustum to the new model bounds
  updateContactShadow();  // size the contact blob to the new footprint
  applyMaterial(currentPreset);
  applyWire();
  applySelectionHighlight();
  renderPartList(parts);
  updateMeta();
  updateScriptPanel();
  resetTAA();
  hud.textContent = `${currentModel ? currentModel.name : ""} · ${parts.length}件 / ${tris}面`;
}

function makePartMaterial(color, vertexColors = false) {
  const c = color || [0.8, 0.8, 0.8];
  return new THREE.MeshStandardMaterial({
    color: vertexColors ? new THREE.Color(1, 1, 1) : new THREE.Color(c[0], c[1], c[2]),
    vertexColors: !!vertexColors,
    roughness: 0.75, metalness: 0.0,
  });
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
// Optional PBR shader enhancements (global toggles, applied at material build).
let edgeWearOn = false;
const edgeWearOpts = { amount: 0.6, width: 1.5, tint: 0xb8b0a0 };
let pomOn = false;
const pomOpts = { scale: 0.06, layers: 24 };
let rimOn = false;
const rimOpts = { color: 0x88bbff, power: 3.0, strength: 0.8 };
let fogOn = false;
const fogOpts = { density: 0.12, height: 1.5, shaft: 0.5 };
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

// An inverted-hull outline: a back-faced shell pushed out along normals in view
// space, drawn dark. Cheap, robust, and works on any mesh without a second pass.
function makeOutlineMaterial(thickness = toonParams.outline, color = toonParams.color) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uThickness: { value: thickness }, uColor: { value: new THREE.Color(color) } },
    vertexShader: `
      uniform float uThickness;
      void main() {
        vec3 n = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // Scale the push by view distance so the outline width stays even.
        mv.xyz += n * uThickness * -mv.z;
        gl_Position = projectionMatrix * mv;
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
  });
  resetTAA();
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
    // Outline shell shares the geometry, drawn back-faced and pushed out.
    const outline = new THREE.Mesh(o.geometry, makeOutlineMaterial());
    outline.userData.isOutline = true;
    outline.castShadow = false;
    outline.receiveShadow = false;
    o.add(outline);
  }
}


// Apply a procedural material preset to every part (or restore flat colors).
// size: bake resolution (low while dragging, full on release).
// skipPanel: don't rebuild the param DOM (avoids interrupting a drag).
function applyMaterial(presetName, { size = 256, skipPanel = false } = {}) {
  currentPreset = presetName;

  // A material-swap debug view (normal/matcap/depth) overrides real materials.
  // Re-route to it so rebuilds/material changes keep the debug look.
  if (debugView === "normal" || debugView === "matcap" || debugView === "depth") {
    applyDebugView(debugView);
    updateScriptPanel();
    return;
  }
  if (debugView === "toon") { applyDebugView("toon"); updateScriptPanel(); return; }

  // "model" mode: each part wears its own matched surface material. Parts that
  // ship a surface ref get a baked MeshPhysicalMaterial (glass/metal/...);
  // parts without one keep their flat color. This is the matched model+material
  // path — no global preset overriding the geometry.
  if (presetName === "model") {
    currentMatPreset = null;
    currentSurfaceName = null;
    modelRoot.traverse((o) => {
      if (!o.isMesh) return;
      o.material.dispose?.();
      const surf = o.userData.surface;
      if (surf) {
        // Merge any live per-part override onto the part's own surface params,
        // so the right panel retunes this exact matched material.
        const ov = surfaceOverrides[o.name];
        const ref = ov ? { type: surf.type, params: { ...(surf.params || {}), ...ov } } : surf;
        const m = bakeSurface(ref, size, o.userData.baseColor || [0.8, 0.8, 0.8]);
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
    });
    if (!skipPanel) renderMatPanel();
    applySelectionHighlight();
    updateScriptPanel();
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
    const shared = bakeSurface({ type: presetName, params: { ...currentSurfaceParams } }, size);
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
    });
    if (!skipPanel) renderMatPanel();
    applySelectionHighlight();
    updateScriptPanel();
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
  });
  if (!skipPanel) renderMatPanel();
  applySelectionHighlight();
  updateScriptPanel();
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

let lastSize = new THREE.Vector3(3, 3, 3);
function fitView(view, size) {
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
  controls.update();
  // Keep DOF focused on the model center (distance from camera to target).
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
    const c = part.color;
    sw.style.background = `rgb(${(c[0]*255)|0},${(c[1]*255)|0},${(c[2]*255)|0})`;
    const name = document.createElement("span");
    name.textContent = part.name;
    row.append(sw, name);
    row.onclick = () => {
      selectedPart = selectedPart === part.name ? null : part.name;
      renderPartList(parts);
      applySelectionHighlight();
      renderMatPanel();
      updateScriptPanel();
    };
    boxEl.appendChild(row);
  });
}

function updateMeta() {
  document.getElementById("meta").innerHTML =
    `部件 <b>${lastMeta.parts}</b> · 顶点 <b>${lastMeta.verts}</b> · 三角面 <b>${lastMeta.tris}</b>`;
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

// ---- procedural model loading + live params ----
async function rebuild({ keepCamera = true } = {}) {
  if (!currentModel) return;
  const token = ++rebuildToken;
  try {
    const parts = await currentModel.build(currentParams);
    if (token !== rebuildToken) return;
    errEl.style.display = "none";
    buildParts(parts, { keepCamera });
  } catch (e) {
    if (token !== rebuildToken) return;
    fail("构建模型出错: " + (e?.message || e));
  }
}

function loadProcModel(model, { resetParams = true } = {}) {
  currentModel = model;
  currentLoadedSource = null;
  currentLoadedSourceName = "";
  if (resetParams || !currentParams) currentParams = model.defaultParams ? model.defaultParams() : defaultParams(model);
  selectedPart = null;
  surfaceOverrides = {}; // matched-material overrides are per-model
  renderParamPanel();
  updateScriptPanel();
  return rebuild({ keepCamera: false });
}

function renderParamPanel() {
  const panel = document.getElementById("params");
  panel.innerHTML = "";
  if (!currentModel) return;
  for (const spec of currentModel.schema) {
    const g = document.createElement("div");
    g.className = "pgroup";
    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("span");
    label.textContent = spec.label;
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
      rebuild({ keepCamera: true });
      updateScriptPanel();
    };
    g.append(row, slider);
    panel.appendChild(g);
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
      o.value = opt; o.textContent = opt;
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

const EXTERNAL_MODELS = new Map();
const EXTERNAL_MODEL_ALIASES = {
  "office-chair": "officechair",
  "preview-sphere": "sphere",
  "teddy-bear": "teddy",
};

const makeHumanLiveModel = {
  id: "makehuman-live",
  name: "MakeHuman CC0实时Morph",
  schema: makeHumanParamSchema,
  defaultParams: defaultMakeHumanParams,
  build: buildMakeHumanParts,
};

async function loadExternalModel(entry) {
  const res = await fetch(`/out/${entry.file}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`failed to load external model: ${entry.file}`);
  const model = await res.json();
  window.__meshova.loadParts(model);
}

async function appendExternalModels() {
  try {
    const res = await fetch("/out/models.json", { cache: "no-store" });
    if (!res.ok) return;
    const manifest = await res.json();
    const models = Array.isArray(manifest.models) ? manifest.models : [];
    for (const entry of models) {
      if (!entry || entry.hidden || !entry.id || !entry.file || PROC_MODELS[entry.id]) continue;
      if (PROC_MODELS[EXTERNAL_MODEL_ALIASES[entry.id]]) continue;
      const value = `external:${entry.id}`;
      if (EXTERNAL_MODELS.has(value)) continue;
      EXTERNAL_MODELS.set(value, entry);
    }
  } catch {
    /* external models are optional */
  }
}

// 初始模型由模型库通过 URL 参数 ?model=<id> 指定；工具栏不再有模型/材质下拉。
function initModelSelect() {
  const first = Object.keys(PROC_MODELS)[0];
  const wanted = new URLSearchParams(location.search).get("model");
  const initial = wanted && PROC_MODELS[wanted] ? wanted : first;
  loadProcModel(PROC_MODELS[initial]);
  appendExternalModels();
}

// ---- UI wiring ----
// 材质默认“跟随模型（匹配材质）”，不再提供工具栏下拉。
const matSel = null;
applyMaterial("model");

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
  fogDepthRT.setSize(stage.clientWidth, stage.clientHeight);
  resetTAA();
});

// Any orbit interaction restarts TAA accumulation so we don't smear motion.
controls.addEventListener("change", resetTAA);

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
  if (windEnabled) {
    const t = windClock.getElapsedTime();
    modelRoot.traverse((o) => {
      if (!o.isMesh || !o.userData.hasWind) return;
      const u = o.material && o.material.userData && o.material.userData.windUniforms;
      if (u) {
        if (u.uTime) u.uTime.value = t;
        if (u.uWindStrength) u.uWindStrength.value = windStrength;
      }
    });
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

  if (fogOn && postEnabled) updateFog();
  if (postEnabled) composer.render();
  else renderer.render(scene, camera);
}

// Capture scene depth + refresh fog uniforms. Done only while fog is on so the
// extra depth pass costs nothing otherwise. TAA accumulation is forced off
// because the god-ray march would smear; fog stays crisp at single-sample.
function updateFog() {
  const prevTarget = renderer.getRenderTarget();
  const prevOverride = scene.overrideMaterial;
  scene.overrideMaterial = fogDepthMat;
  renderer.setRenderTarget(fogDepthRT);
  renderer.clear();
  renderer.render(scene, camera);
  scene.overrideMaterial = prevOverride;
  renderer.setRenderTarget(prevTarget);
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
initModelSelect();

// Expose hooks for headless screenshot tooling + AI procedural control.
window.__meshova = {
  // procedural model control
  models: () => [...Object.keys(PROC_MODELS), makeHumanLiveModel.id],
  loadModelById: (id) => {
    if (PROC_MODELS[id]) return loadProcModel(PROC_MODELS[id]);
    if (id === makeHumanLiveModel.id) return loadProcModel(makeHumanLiveModel);
    return null;
  },
  // Load raw AI-generated parts directly (bypasses PROC_MODELS). Accepts a
  // ViewerModel-like { name, parts:[{name,color,positions,normals,uvs,indices}] }
  // or already-built {name, mesh, color} parts. Used by the agent loop's
  // render callback to screenshot arbitrary script output.
  loadParts: (model) => {
    rebuildToken++;
    currentModel = null;
    currentParams = null;
    currentLoadedSource = model && typeof model.source === "string" ? model.source : null;
    currentLoadedSourceName = (model && model.name) || "AI模型";
    selectedPart = null;
    surfaceOverrides = {};
    renderParamPanel();
    const raw = Array.isArray(model) ? model : (model.parts || []);
    const parts = raw.map((p) => {
      if (p.mesh) return p;
      // ViewerModel part: flat arrays -> mesh shape buildParts expects
      const positions = [];
      const normals = [];
      const uvs = [];
      for (let i = 0; i < p.positions.length; i += 3) {
        positions.push({ x: p.positions[i], y: p.positions[i + 1], z: p.positions[i + 2] });
        normals.push({ x: p.normals[i], y: p.normals[i + 1], z: p.normals[i + 2] });
      }
      for (let i = 0; i < p.uvs.length; i += 2) uvs.push({ x: p.uvs[i], y: p.uvs[i + 1] });
      return { name: p.name, color: p.color || [0.8, 0.8, 0.8], colors: p.colors, windWeight: p.windWeight, surface: p.surface, mesh: { positions, normals, uvs, indices: p.indices } };
    });
    buildParts(parts, { keepCamera: false });
    if (hud) hud.textContent = `${(model && model.name) || "AI模型"} · ${parts.length}件`;
  },
  getParams: () => ({ ...currentParams }),
  setParam: (key, value) => {
    if (!currentParams || !(key in currentParams)) return;
    currentParams[key] = value;
    renderParamPanel();
    return rebuild({ keepCamera: true });
  },
  setParams: (obj) => {
    if (!currentParams) return;
    Object.assign(currentParams, obj);
    renderParamPanel();
    return rebuild({ keepCamera: true });
  },
  // view + material
  setView: (v) => fitView(v),
  setAutorot: (on) => { autorot = on; },
  setWire: (on) => { wireframe = on; applyWire(); },
  // wind: toggle GPU foliage sway / set amplitude. Screenshots call setWind(false)
  // for a frozen, deterministic frame.
  setWind: (on, strength) => {
    windEnabled = !!on;
    if (typeof strength === "number") windStrength = strength;
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
    controls.update();
    if (bokeh) bokeh.uniforms["focus"].value = camera.position.distanceTo(controls.target);
    resetTAA();
  },
  setMaterial: (name) => { applyMaterial(name); if (matSel) matSel.value = name; },
  setPost: (on) => { postEnabled = !!on; resetTAA(); },
  setBloom: (strength) => { bloom.strength = strength; resetTAA(); },
  setAO: (on) => { gtao.enabled = !!on; resetTAA(); },
  // environment + background (headless control for the AI screenshot loop)
  environments: () => ENV_NAMES.slice(),
  setEnvironment: (name) => { if (ENV_PRESETS[name]) { applyEnvironment(name); if (envSel) envSel.value = name; } },
  setEnvRotation: (deg) => { applyEnvRotation(Number(deg) || 0); if (envRotEl) envRotEl.value = String(((Number(deg) || 0) % 360 + 360) % 360); },
  // Debug views for VLM semantic decomposition: off/normal/matcap/depth/ao.
  debugViews: () => ["off", "toon", "normal", "matcap", "depth", "ao"],
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
  settle: (frames = 12) => new Promise((resolve) => {
    resetTAA();
    let n = 0;
    const step = () => {
      controls.update();
      taaPass.accumulate = n >= IDLE_BEFORE_ACCUM;
      if (fogOn && postEnabled) updateFog();
      if (postEnabled) composer.render(); else renderer.render(scene, camera);
      if (++n >= frames) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }),
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
  getSurfaceParams: () => (currentSurfaceName ? { ...currentSurfaceParams } : null),
  setSurfaceParam: (key, value) => {
    if (!currentSurfaceName) return;
    currentSurfaceParams[key] = value;
    applyMaterial(currentSurfaceName);
  },
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
