/**
 * Browser-side material baking. Calls the SAME Meshova procedural presets the
 * Node export uses (from /dist), evaluates them per-texel into three.js
 * DataTextures. Nothing here loads a static image; every map is computed.
 */
import * as THREE from "three";
import {
  materialFromFields,
  PRESETS,
  PRESET_PARAM_SCHEMA,
  defaultMatParams,
  MATERIAL_BUILDERS,
  SBS_REPRO,
  SBS_PARAM_SCHEMA,
  defaultSbsParams,
  buildSurface,
  resolvePhysical,
  resolveWaterSurfaceParams,
  SURFACE_LABELS,
  SURFACE_PARAM_SCHEMA,
  defaultSurfaceParams,
} from "/dist/index.js?v=water7";

/** Convert a Meshova float TextureBuffer to a three DataTexture. */
function bufferToDataTexture(tex, { srgb = false } = {}) {
  const { width, height, channels, data } = tex;
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * channels] ?? 0;
    const g = channels >= 3 ? data[i * channels + 1] : r;
    const b = channels >= 3 ? data[i * channels + 2] : r;
    rgba[i * 4] = Math.max(0, Math.min(255, Math.round(r * 255)));
    rgba[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
    rgba[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
    rgba[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(rgba, width, height, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/**
 * Bake a preset into a three MeshStandardMaterial with full PBR maps.
 * @param presetName one of PRESETS keys
 * @param size texture resolution
 * @param params preset params (seed, tint, color...)
 */
export function bakeStandardMaterial(presetName, size = 256, params = {}) {
  const presetFn = PRESETS[presetName];
  if (!presetFn) throw new Error("unknown preset: " + presetName);
  const fields = presetFn(params);
  const m = materialFromFields(size, fields);
  return materialFromMeshovaMaterial(m);
}

/** Build a three material from an already-assembled Meshova Material. */
function materialFromMeshovaMaterial(m) {
  return new THREE.MeshStandardMaterial({
    map: bufferToDataTexture(m.baseColor, { srgb: true }),
    metalnessMap: bufferToDataTexture(m.metallic),
    roughnessMap: bufferToDataTexture(m.roughness),
    normalMap: bufferToDataTexture(m.normal),
    aoMap: bufferToDataTexture(m.ao),
    metalness: 1.0,
    roughness: 1.0,
    normalScale: new THREE.Vector2(1, 1),
  });
}

/**
 * Bake a full-Material builder (buffer-chain recipe) into a three material.
 * Same recipes the Node PNG export uses (e.g. tileFloor).
 */
export function bakeBuilderMaterial(builderName, size = 256, params = {}) {
  const builderFn = MATERIAL_BUILDERS[builderName];
  if (!builderFn) throw new Error("unknown material builder: " + builderName);
  const m = builderFn(size, params);
  return materialFromMeshovaMaterial(m);
}

export const PRESET_NAMES = Object.keys(PRESETS);
export const BUILDER_NAMES = Object.keys(MATERIAL_BUILDERS);
export { PRESET_PARAM_SCHEMA, defaultMatParams };
/** SBS reproduction recipe names (field presets keyed by reference folder). */
export const SBS_REPRO_NAMES = Object.keys(SBS_REPRO);
export { SBS_PARAM_SCHEMA, defaultSbsParams };

/** True if `name` is a buffer-chain material builder rather than a field preset. */
export function isBuilder(name) {
  return Object.prototype.hasOwnProperty.call(MATERIAL_BUILDERS, name);
}

/** True if `name` is an SBS reproduction recipe. */
export function isSbsRepro(name) {
  return Object.prototype.hasOwnProperty.call(SBS_REPRO, name);
}

/** Bake an SBS reproduction recipe into a three MeshStandardMaterial. */
export function bakeSbsReproMaterial(name, size = 256, params = {}) {
  const fn = SBS_REPRO[name];
  if (!fn) throw new Error("unknown sbs recipe: " + name);
  const m = materialFromFields(size, fn(params));
  return materialFromMeshovaMaterial(m);
}

/** Bake any known material (preset, builder or SBS repro) by name. */
export function bakeMaterial(name, size = 256, params = {}) {
  if (isBuilder(name)) return bakeBuilderMaterial(name, size, params);
  if (isSbsRepro(name)) return bakeSbsReproMaterial(name, size, params);
  return bakeStandardMaterial(name, size, params);
}

/**
 * Bake a SurfaceMaterial (from the surface library: glass/metal/liquid/...)
 * into a three MeshPhysicalMaterial, mapping the physical scalar layer onto the
 * renderer (transmission, ior, thickness, clearcoat, sheen, iridescence,
 * emissive). This is the path that lets glass actually look like glass instead
 * of an opaque tinted sphere. `surfaceRef` is { type, params } as attached to a
 * part; `fallbackColor` is the part's flat color when no fields/baseColor exist.
 */
export function bakeSurface(surfaceRef, size = 256, fallbackColor = [0.8, 0.8, 0.8]) {
  const sm = buildSurface(surfaceRef.type, surfaceRef.params || {});
  if (!sm) return null;
  const phys = resolvePhysical(sm.physical);
  const fields = sm.fields || {};
  const hasFields = fields.baseColor || fields.roughness || fields.metallic || fields.normalStrength;

  const mat = new THREE.MeshPhysicalMaterial();
  if (hasFields) {
    const m = materialFromFields(size, fields);
    mat.map = bufferToDataTexture(m.baseColor, { srgb: true });
    mat.metalnessMap = bufferToDataTexture(m.metallic);
    mat.roughnessMap = bufferToDataTexture(m.roughness);
    mat.normalMap = bufferToDataTexture(m.normal);
    mat.aoMap = bufferToDataTexture(m.ao);
    mat.metalness = 1.0;
    mat.roughness = 1.0;
    mat.normalScale = new THREE.Vector2(1, 1);
    // Stash the height map (grayscale) so the viewer can drive parallax-occlusion
    // mapping (POM) on demand. Not a standard MeshPhysicalMaterial slot, so it
    // lives in userData and is sampled via an onBeforeCompile injection.
    if (m.height) mat.userData.heightTex = bufferToDataTexture(m.height);
    // emission map only if the preset authored one
    if (fields.emission) mat.emissiveMap = bufferToDataTexture(m.emission, { srgb: true });
  } else {
    const c = (fields.baseColor && fields.baseColor(0.5, 0.5)) || fallbackColor;
    mat.color = new THREE.Color(c[0], c[1], c[2]);
  }

  // Physical scalar layer.
  mat.transmission = phys.transmission;
  mat.ior = phys.ior;
  mat.thickness = phys.thickness;
  mat.attenuationColor = new THREE.Color(...phys.attenuationColor);
  if (isFinite(phys.attenuationDistance)) mat.attenuationDistance = phys.attenuationDistance;
  mat.clearcoat = phys.clearcoat;
  mat.clearcoatRoughness = phys.clearcoatRoughness;
  mat.sheen = phys.sheen;
  mat.sheenColor = new THREE.Color(...phys.sheenColor);
  mat.sheenRoughness = phys.sheenRoughness;
  mat.specularIntensity = phys.specularIntensity;
  if (phys.specularColor) mat.specularColor = new THREE.Color(...phys.specularColor);
  mat.iridescence = phys.iridescence;
  mat.iridescenceIOR = phys.iridescenceIOR ?? 1.3;
  mat.iridescenceThicknessRange = [100, phys.iridescenceThickness];
  // Anisotropy (brushed metal, carbon, hair) — r185 native GGX anisotropy.
  if (phys.anisotropy) {
    mat.anisotropy = phys.anisotropy;
    mat.anisotropyRotation = phys.anisotropyRotation || 0;
  }
  // Chromatic dispersion for gems (only meaningful with transmission).
  if (phys.dispersion) mat.dispersion = phys.dispersion;

  // Emission: any surface that authored an emission field glows. The emissiveMap
  // carries the color, so emissive must be white (three multiplies them) and the
  // intensity comes from the physical layer (neon pushes it high to drive bloom).
  if (fields.emission) {
    mat.emissive = new THREE.Color(1, 1, 1);
    mat.emissiveIntensity = phys.emissiveIntensity;
    if (!mat.emissiveMap) {
      const e = fields.emission(0.5, 0.5) || [1, 1, 1];
      mat.emissive = new THREE.Color(e[0], e[1], e[2]);
    }
  }

  // Transparency render hints. NOTE: three.js transmission uses its own
  // refraction pass and must stay in the OPAQUE queue — forcing transparent=true
  // (alpha blending) breaks the transmission sampling and makes glass look milky.
  // So only flip transparent/depthWrite for genuine alpha opacity (<1); pure
  // transmissive glass keeps the defaults.
  if (phys.opacity < 1) {
    mat.transparent = true;
    mat.opacity = phys.opacity;
    mat.depthWrite = false;
  }
  mat.envMapIntensity = 1.0;
  mat.needsUpdate = true;
  return mat;
}

const WATER_BODY_CODE = { river: 0, pond: 1, ocean: 2 };

export function bakeWaterSurface(surfaceRef, size = 256, fallbackColor = [0.1, 0.35, 0.42]) {
  const params = resolveWaterSurfaceParams(surfaceRef?.params || {});
  const mat = bakeSurface({ type: "water", params }, size, fallbackColor);
  if (!mat) return null;
  const angle = params.flowAngle * Math.PI / 180;
  const bodyCode = WATER_BODY_CODE[params.body] ?? WATER_BODY_CODE.pond;

  mat.transparent = true;
  mat.opacity = 1;
  mat.depthWrite = false;
  mat.transmission = 0;
  mat.thickness = 0;
  mat.normalMap = null;
  const normalStrength = params.body === "ocean" ? 0.24 : (params.body === "river" ? 0.46 : 0.34);
  mat.normalScale.set(normalStrength, normalStrength);
  mat.envMapIntensity = params.body === "ocean" ? 1.3 : 1.15;
  mat.userData.isWaterSurface = true;
  mat.userData.waterTime = 0;
  mat.userData.waterParams = params;

  const previousCompile = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader) => {
    if (typeof previousCompile === "function") previousCompile(shader);
    shader.uniforms.uWaterTime = { value: mat.userData.waterTime || 0 };
    shader.uniforms.uWaterBody = { value: bodyCode };
    shader.uniforms.uWaterFlow = { value: new THREE.Vector2(Math.cos(angle), Math.sin(angle)) };
    shader.uniforms.uWaterWaveAmplitude = { value: params.waveAmplitude };
    shader.uniforms.uWaterWaveScale = { value: params.waveScale };
    shader.uniforms.uWaterFlowSpeed = { value: params.flowSpeed };
    shader.uniforms.uWaterFoamStrength = { value: params.foamStrength };
    shader.uniforms.uWaterShallowWidth = { value: params.shallowWidth };
    shader.uniforms.uWaterShallowOpacity = { value: params.shallowOpacity };
    shader.uniforms.uWaterDeepOpacity = { value: params.deepOpacity };
    shader.uniforms.uWaterAttenuationDistance = { value: params.attenuationDistance };
    shader.uniforms.uWaterSceneDepth = { value: null };
    shader.uniforms.uWaterDepthResolution = { value: new THREE.Vector2(1, 1) };
    shader.uniforms.uWaterCameraNear = { value: 0.1 };
    shader.uniforms.uWaterCameraFar = { value: 1000 };
    shader.uniforms.uWaterDepthAvailable = { value: 0 };
    shader.uniforms.uWaterShallowColor = { value: new THREE.Color(...params.tint) };
    shader.uniforms.uWaterDeepColor = { value: new THREE.Color(...params.deepColor) };
    shader.uniforms.uWaterSeed = { value: params.seed * 0.137 };

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
uniform float uWaterTime;
uniform float uWaterBody;
uniform vec2 uWaterFlow;
uniform float uWaterWaveAmplitude;
uniform float uWaterWaveScale;
uniform float uWaterFlowSpeed;
varying vec2 vMeshovaWaterUv;
varying vec2 vMeshovaWaterPosition;
varying float vMeshovaWaterWave;
float meshovaWaterWave(vec2 p, out vec2 gradient) {
  vec2 direction = normalize(uWaterFlow + vec2(0.0001));
  vec2 side = vec2(-direction.y, direction.x);
  float time = uWaterTime * uWaterFlowSpeed;
  float phaseA = dot(p, direction) * uWaterWaveScale * 6.28318 - time * 2.2;
  float phaseB = dot(p, side) * uWaterWaveScale * 9.7 + time * 1.35;
  float phaseC = dot(p, normalize(direction + side * 0.63)) * uWaterWaveScale * 15.1 - time * 3.1;
  float bodyAmplitude = uWaterBody > 1.5 ? 1.0 : (uWaterBody < 0.5 ? 0.55 : 0.35);
  float height = (sin(phaseA) * 0.58 + sin(phaseB) * 0.27 + sin(phaseC) * 0.15)
    * uWaterWaveAmplitude * bodyAmplitude;
  gradient = (cos(phaseA) * direction * uWaterWaveScale * 6.28318 * 0.58
    + cos(phaseB) * side * uWaterWaveScale * 9.7 * 0.27
    + cos(phaseC) * normalize(direction + side * 0.63) * uWaterWaveScale * 15.1 * 0.15)
    * uWaterWaveAmplitude * bodyAmplitude;
  return height;
}`)
      .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
vec2 meshovaWaterGradient;
meshovaWaterWave(position.xz, meshovaWaterGradient);
objectNormal = normalize(vec3(-meshovaWaterGradient.x, 1.0, -meshovaWaterGradient.y));`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
vec2 meshovaWaterGradientPosition;
float meshovaWaterHeight = meshovaWaterWave(position.xz, meshovaWaterGradientPosition);
transformed.y += meshovaWaterHeight;
vMeshovaWaterUv = uv;
vMeshovaWaterPosition = position.xz;
vMeshovaWaterWave = meshovaWaterHeight;`);

    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
#include <packing>
uniform float uWaterTime;
uniform float uWaterBody;
uniform float uWaterFlowSpeed;
uniform float uWaterFoamStrength;
uniform float uWaterShallowWidth;
uniform float uWaterShallowOpacity;
uniform float uWaterDeepOpacity;
uniform float uWaterAttenuationDistance;
uniform sampler2D uWaterSceneDepth;
uniform vec2 uWaterDepthResolution;
uniform float uWaterCameraNear;
uniform float uWaterCameraFar;
uniform float uWaterDepthAvailable;
uniform vec3 uWaterShallowColor;
uniform vec3 uWaterDeepColor;
uniform float uWaterSeed;
varying vec2 vMeshovaWaterUv;
varying vec2 vMeshovaWaterPosition;
varying float vMeshovaWaterWave;
float meshovaWaterHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32 + uWaterSeed);
  return fract(p.x * p.y);
}
float meshovaWaterNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 local = fract(p);
  local = local * local * (3.0 - 2.0 * local);
  return mix(mix(meshovaWaterHash(cell), meshovaWaterHash(cell + vec2(1.0, 0.0)), local.x),
    mix(meshovaWaterHash(cell + vec2(0.0, 1.0)), meshovaWaterHash(cell + 1.0), local.x), local.y);
}
float meshovaWaterLinearDepth(float depth) {
  return -perspectiveDepthToViewZ(depth, uWaterCameraNear, uWaterCameraFar);
}`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
vec2 meshovaScreenUv = gl_FragCoord.xy / max(uWaterDepthResolution, vec2(1.0));
float meshovaSceneDepth = unpackRGBAToDepth(texture2D(uWaterSceneDepth, meshovaScreenUv));
float meshovaWaterDepth = meshovaWaterLinearDepth(gl_FragCoord.z);
float meshovaBehindDepth = meshovaWaterLinearDepth(meshovaSceneDepth);
float meshovaWaterColumn = meshovaSceneDepth >= 0.9999
  ? uWaterAttenuationDistance * 4.0
  : max(0.0, meshovaBehindDepth - meshovaWaterDepth);
meshovaWaterColumn = mix(uWaterAttenuationDistance * 2.0, meshovaWaterColumn, uWaterDepthAvailable);
float meshovaDepthRange = max(0.08, uWaterAttenuationDistance * 0.075);
float meshovaDepthMix = smoothstep(0.015, meshovaDepthRange, meshovaWaterColumn);
vec3 meshovaWaterColor = mix(uWaterShallowColor, uWaterDeepColor, meshovaDepthMix);
float meshovaFresnel = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 4.0);
float meshovaFresnelTint = uWaterBody < 0.5 ? 0.08 : (uWaterBody > 1.5 ? 0.2 : 0.12);
meshovaWaterColor = mix(meshovaWaterColor, vec3(0.68), meshovaFresnel * meshovaFresnelTint);
float meshovaTime = uWaterTime * uWaterFlowSpeed;
float meshovaShoreDistance = max(0.025, uWaterShallowWidth);
vec2 meshovaFoamUv = uWaterBody < 0.5
  ? vec2(vMeshovaWaterUv.y * 18.0 - meshovaTime * 2.4, vMeshovaWaterUv.x * 13.0)
  : vMeshovaWaterPosition * 2.4 + vec2(meshovaTime * 0.28, -meshovaTime * 0.19);
float meshovaFoamNoise = meshovaWaterNoise(meshovaFoamUv) * 0.68 + meshovaWaterNoise(meshovaFoamUv * 2.13 + 7.1) * 0.32;
float meshovaShoreMask = 1.0 - smoothstep(meshovaShoreDistance * 0.12, meshovaShoreDistance, meshovaWaterColumn);
float meshovaShorePhase = meshovaWaterColumn / meshovaShoreDistance * 5.5 - meshovaTime * 1.8 + meshovaFoamNoise * 3.4;
float meshovaShoreBand = smoothstep(0.5, 0.9, sin(meshovaShorePhase) * 0.5 + 0.5);
float meshovaShoreFoam = meshovaShoreMask * mix(0.12, 0.82, meshovaShoreBand) * smoothstep(0.34, 0.78, meshovaFoamNoise);
float meshovaCrestFoam = uWaterBody > 1.5 ? smoothstep(0.045, 0.16, vMeshovaWaterWave) * smoothstep(0.48, 0.82, meshovaFoamNoise) : 0.0;
vec2 meshovaRiverUv = vec2(vMeshovaWaterUv.x * 9.0, vMeshovaWaterUv.y * 2.8 - meshovaTime * 1.9);
float meshovaRiverNoise = meshovaWaterNoise(meshovaRiverUv) * 0.62
  + meshovaWaterNoise(meshovaRiverUv * vec2(2.4, 0.72) + 11.7) * 0.38;
float meshovaRiverThread = smoothstep(0.7, 0.93,
  sin((vMeshovaWaterUv.x * 7.0 + meshovaRiverNoise * 0.32) * 6.28318) * 0.5 + 0.5);
float meshovaRiverPatch = smoothstep(0.58, 0.82, meshovaRiverNoise);
float meshovaRiverInterior = smoothstep(0.015, 0.14, vMeshovaWaterUv.x)
  * (1.0 - smoothstep(0.86, 0.985, vMeshovaWaterUv.x));
float meshovaRiverFlowFoam = uWaterBody < 0.5
  ? meshovaRiverInterior * (meshovaRiverPatch * 0.72 + meshovaRiverThread * 0.28) * 0.5
  : 0.0;
float meshovaFoam = clamp((meshovaShoreFoam + meshovaCrestFoam + meshovaRiverFlowFoam) * uWaterFoamStrength, 0.0, 0.88);
diffuseColor.rgb = mix(meshovaWaterColor, vec3(0.88, 0.96, 0.98), meshovaFoam);
float meshovaDepthAlpha = mix(uWaterShallowOpacity, uWaterDeepOpacity, meshovaDepthMix);
diffuseColor.a = clamp(meshovaDepthAlpha + meshovaFresnel * 0.08 + meshovaFoam * 0.28, 0.05, 0.98);`);

    mat.userData.waterUniforms = shader.uniforms;
  };
  mat.customProgramCacheKey = () => "meshova-water-v7";
  mat.needsUpdate = true;
  return mat;
}

/** All built-in surface type ids (glass/metal/marble/skin/...). */
export const SURFACE_NAMES = Object.keys(SURFACE_LABELS);
/** zh-CN labels keyed by surface type id, for the viewer dropdown. */
export const SURFACE_LABEL_MAP = SURFACE_LABELS;
/** Editable param schema + defaults per surface type (re-exported for the viewer). */
export { SURFACE_PARAM_SCHEMA, defaultSurfaceParams };

/** True if `name` is a named surface type (vs. a field preset / builder). */
export function isSurface(name) {
  return Object.prototype.hasOwnProperty.call(SURFACE_LABELS, name);
}

/**
 * Bake a named surface type globally for preview (applies one surface to a whole
 * model). Returns a MeshPhysicalMaterial; falls back to a flat material when the
 * surface name is unknown.
 */
export function bakeSurfaceByName(name, size = 256, fallbackColor = [0.8, 0.8, 0.8]) {
  return bakeSurface({ type: name, params: {} }, size, fallbackColor);
}
