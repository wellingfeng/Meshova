/**
 * Browser-side material baking. Calls the SAME Meshova procedural presets the
 * Node export uses (from /dist), evaluates them per-texel into three.js
 * DataTextures. Nothing here loads a static image; every map is computed.
 */
import * as THREE from "three";
import {
  materialFromFields,
  PRESETS,
  MATERIAL_BUILDERS,
  buildSurface,
  resolvePhysical,
  SURFACE_LABELS,
  SURFACE_PARAM_SCHEMA,
  defaultSurfaceParams,
} from "/dist/index.js";

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

/** True if `name` is a buffer-chain material builder rather than a field preset. */
export function isBuilder(name) {
  return Object.prototype.hasOwnProperty.call(MATERIAL_BUILDERS, name);
}

/** Bake any known material (preset or builder) by name. */
export function bakeMaterial(name, size = 256, params = {}) {
  return isBuilder(name)
    ? bakeBuilderMaterial(name, size, params)
    : bakeStandardMaterial(name, size, params);
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
