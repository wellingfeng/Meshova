/**
 * SpeedTree library regeneration helpers.
 *
 * This module uses only source folder/file names as botanical hints. It does
 * not parse, import, copy, or derive geometry/textures from SpeedTree assets.
 * Output stays Meshova-native: seeded splines, sweeps, leaf cards/fronds, wind.
 */
import type { Vec3 } from "../math/vec3.js";
import { add, normalize, scale, vec3 } from "../math/vec3.js";
import { TAU } from "../math/scalar.js";
import { makeRng } from "../random/prng.js";
import type { Mesh } from "../geometry/mesh.js";
import { merge, vertexCount } from "../geometry/mesh.js";
import type { NamedPart } from "../geometry/export.js";
import { bezier, polyline, smoothCurve, sweep } from "../geometry/curve.js";
import { cylinder, cone, icosphere } from "../geometry/primitives2.js";
import { sphere } from "../geometry/primitives.js";
import { transform, translateMesh, scaleMesh } from "../geometry/transform.js";
import { treeGuideFromSilhouette, buildTreeFromGuide } from "./guide.js";
import type { LeafShape } from "./leaf.js";
import { leafCard, leafMesh } from "./leaf.js";
import { conifer, grass, palm, shrub, tree, type PlantResult, type TreeOptions } from "./plant.js";
import { frond } from "./frond.js";
import { windChannels } from "./wind.js";

export type SpeedTreeLibraryKind =
  | "broadleaf"
  | "conifer"
  | "palm"
  | "cactus"
  | "shrub"
  | "grass"
  | "fern"
  | "flower"
  | "aquatic"
  | "fungus"
  | "stump"
  | "vine"
  | "plant";

export interface SpeedTreeLibraryEntry {
  /** Top-level source folder, e.g. Broadleaves / Conifers. */
  category: string;
  /** Species or asset folder, e.g. Red_Oak / Saguaro_Cactus. */
  species: string;
  /** Optional source variant file basename. */
  variant?: string;
  /** Optional original relative path for provenance only. */
  relPath?: string;
  /** Optional explicit seed. Defaults to hash(category/species/variant). */
  seed?: number;
}

export interface SpeedTreeLibraryRecipe {
  kind: SpeedTreeLibraryKind;
  id: string;
  label: string;
  sourceCategory: string;
  sourceSpecies: string;
  sourceVariant?: string;
  seed: number;
  height: number;
  barkColor: [number, number, number];
  foliageColor?: [number, number, number];
  accentColor?: [number, number, number];
  leafShape?: LeafShape;
  leafless?: boolean;
  tags: string[];
}

export interface SpeedTreeLibraryBuildOptions {
  /** Override derived seed. */
  seed?: number;
  /** Output detail. "proxy" is useful for generating hundreds of assets fast. */
  quality?: "proxy" | "medium" | "high";
  /** Live procedural controls used by the browser viewer. */
  params?: Partial<SpeedTreeLibraryParams>;
  /** Foliage color sampled from the reference image (0..1 RGB). */
  foliageColor?: [number, number, number];
  /** Bark color sampled from the reference image (0..1 RGB). */
  barkColor?: [number, number, number];
}

export interface SpeedTreeLibraryParams {
  /** Re-seeds branch placement, colors, and scatter. */
  seed: number;
  /** Overall plant height in world units. */
  height: number;
  /** Multiplies trunk / stem radius. */
  trunkScale: number;
  /** Multiplies crown, frond, and clump spread. */
  crownScale: number;
  /** Multiplies crown depth on Z. */
  crownDepth: number;
  /** Adds degrees to the species branch angle. */
  branchAngle: number;
  /** Multiplies primary branch, stem, frond, or blade count. */
  branchCount: number;
  /** Multiplies leaf / needle / bloom density. */
  leafDensity: number;
  /** Multiplies leaf card / frond / blade size. */
  leafSize: number;
  /** Multiplies bark wobble / gnarl. */
  gnarl: number;
  /** Adds horizontal lean in world units. */
  lean: number;
}

export function speedTreeLibrarySeed(entry: SpeedTreeLibraryEntry): number {
  return hashSeed(`${entry.category}/${entry.species}/${entry.variant ?? ""}`);
}

export function inferSpeedTreeLibraryRecipe(
  entry: SpeedTreeLibraryEntry,
  opts: SpeedTreeLibraryBuildOptions = {},
): SpeedTreeLibraryRecipe {
  const seed = Math.round(opts.params?.seed ?? opts.seed ?? entry.seed ?? speedTreeLibrarySeed(entry));
  const key = keyOf(entry);
  const tags = tagsFor(key);
  const kind = inferKind(entry, key);
  const rng = makeRng(seed);
  const height = inferHeight(kind, key, rng);
  const recipe: SpeedTreeLibraryRecipe = {
    kind,
    id: speedTreeLibraryId(entry),
    label: displayLabel(entry),
    sourceCategory: entry.category,
    sourceSpecies: entry.species,
    seed,
    height,
    barkColor: barkColorFor(key, rng),
    tags,
  };
  if (entry.variant) recipe.sourceVariant = entry.variant;
  const foliage = foliageColorFor(kind, key, rng);
  if (foliage) recipe.foliageColor = foliage;
  const accent = accentColorFor(key, rng);
  if (accent) recipe.accentColor = accent;
  const leafShape = leafShapeFor(key);
  if (leafShape) recipe.leafShape = leafShape;
  if (tags.includes("dead") || tags.includes("winter") || kind === "stump") recipe.leafless = true;
  return recipe;
}

export function defaultSpeedTreeLibraryParams(
  entry: SpeedTreeLibraryEntry,
  opts: Omit<SpeedTreeLibraryBuildOptions, "params"> = {},
): SpeedTreeLibraryParams {
  return defaultSpeedTreeLibraryParamsForRecipe(inferSpeedTreeLibraryRecipe(entry, opts));
}

function defaultSpeedTreeLibraryParamsForRecipe(recipe: SpeedTreeLibraryRecipe): SpeedTreeLibraryParams {
  const key = recipe.tags.join(" ");
  return {
    seed: recipe.seed,
    height: round2(recipe.height),
    trunkScale: key.includes("baobab") ? 1.12 : key.includes("cactus") ? 1.05 : 1,
    crownScale: key.includes("column") || key.includes("cypress") ? 0.9 : 1,
    crownDepth: 1,
    branchAngle: 0,
    branchCount: 1,
    leafDensity: recipe.leafless ? 0 : 1,
    leafSize: 1,
    gnarl: 1,
    lean: 0,
  };
}

function resolveSpeedTreeLibraryParams(
  recipe: SpeedTreeLibraryRecipe,
  params: Partial<SpeedTreeLibraryParams> | undefined,
): SpeedTreeLibraryParams {
  const d = defaultSpeedTreeLibraryParamsForRecipe(recipe);
  const p = { ...d, ...(params ?? {}) };
  return {
    seed: Math.round(clampNum(p.seed, 0, 999999)),
    height: round2(clampNum(p.height, 0.1, 20)),
    trunkScale: clampNum(p.trunkScale, 0.25, 3),
    crownScale: clampNum(p.crownScale, 0.2, 3),
    crownDepth: clampNum(p.crownDepth, 0.2, 3),
    branchAngle: clampNum(p.branchAngle, -45, 45),
    branchCount: clampNum(p.branchCount, 0.1, 3),
    leafDensity: clampNum(p.leafDensity, 0, 3),
    leafSize: clampNum(p.leafSize, 0.2, 3),
    gnarl: clampNum(p.gnarl, 0, 3),
    lean: clampNum(p.lean, -2, 2),
  };
}

export function buildSpeedTreeLibraryPlant(
  entry: SpeedTreeLibraryEntry,
  opts: SpeedTreeLibraryBuildOptions = {},
): NamedPart[] {
  const recipe = inferSpeedTreeLibraryRecipe(entry, opts);
  const params = resolveSpeedTreeLibraryParams(recipe, opts.params);
  recipe.seed = params.seed;
  recipe.height = params.height;
  // Reference-derived color overrides (sampled from the target image, not baked).
  if (opts.foliageColor) recipe.foliageColor = clampColor(opts.foliageColor);
  if (opts.barkColor) recipe.barkColor = clampColor(opts.barkColor);
  if (recipe.kind === "conifer") return plantParts(recipe, buildConifer(recipe, opts), "needles");
  if (recipe.kind === "palm") return plantParts(recipe, buildPalm(recipe, opts), "fronds");
  if (recipe.kind === "cactus") return buildCactusParts(recipe, opts);
  if (recipe.kind === "shrub") return plantParts(recipe, buildShrub(recipe, opts));
  if (recipe.kind === "grass") return plantParts(recipe, buildGrass(recipe, opts), "blades");
  if (recipe.kind === "fern") return buildFernParts(recipe, opts);
  if (recipe.kind === "flower") return buildFlowerParts(recipe, opts);
  if (recipe.kind === "aquatic") return buildAquaticParts(recipe, opts);
  if (recipe.kind === "fungus") return buildFungusParts(recipe, opts);
  if (recipe.kind === "stump") return buildStumpParts(recipe, opts);
  if (recipe.kind === "vine") return buildVineParts(recipe, opts);
  if (recipe.kind === "plant") return buildLargeLeafPlantParts(recipe, opts);
  return plantParts(recipe, buildBroadleaf(recipe, opts));
}

export function speedTreeLibraryId(entry: SpeedTreeLibraryEntry): string {
  const parts = ["speedtree-library", slug(entry.category), slug(entry.species)];
  if (entry.variant && slug(entry.variant) !== slug(entry.species)) parts.push(slug(entry.variant));
  return parts.filter(Boolean).join("-");
}

export function speedTreeLibraryVisualKey(entry: SpeedTreeLibraryEntry): string {
  return speedTreeLibraryRecipeVisualKey(inferSpeedTreeLibraryRecipe(entry));
}

export function speedTreeLibraryRepresentativeScore(entry: SpeedTreeLibraryEntry): number {
  const recipe = inferSpeedTreeLibraryRecipe(entry);
  const category = recipe.sourceCategory.toLowerCase();
  const species = recipe.sourceSpecies.toLowerCase();
  let score = 0;
  if (category.includes("conifer") && recipe.kind === "conifer") score += 80;
  if (category.includes("broad") && recipe.kind === "broadleaf") score += 80;
  if (category.includes("palm") && (recipe.kind === "palm" || recipe.kind === "cactus" || recipe.kind === "plant")) score += 80;
  if (category.includes("shrub") && ["shrub", "grass", "fern", "flower"].includes(recipe.kind)) score += 80;
  if (category.includes("marine") && recipe.kind === "aquatic") score += 80;
  if (!entry.variant) score += 12;
  if (entry.variant && slug(entry.variant) === slug(entry.species)) score += 8;
  if (species.includes("sample")) score -= 50;
  if (species.includes("common")) score -= 5;
  score -= Math.min(30, slug(entry.species).length / 4);
  return score;
}

function speedTreeLibraryRecipeVisualKey(recipe: SpeedTreeLibraryRecipe): string {
  const tags = recipe.tags;
  const form = visualForm(recipe.kind, tags);
  const leaf = recipe.leafShape ?? "none";
  const leafless = recipe.leafless ? "bare" : "leafy";
  const h = bucket(recipe.height, recipe.height < 2 ? 0.35 : 0.8);
  const foliage = colorBucket(recipe.foliageColor);
  const accent = colorBucket(recipe.accentColor);
  return [recipe.kind, form, leaf, leafless, h, foliage, accent].join("|");
}

function visualForm(kind: SpeedTreeLibraryKind, tags: string[]): string {
  const has = (values: string[]) => values.some((v) => tags.includes(v));
  if (kind === "conifer") {
    if (has(["cypress", "juniper", "cedar"])) return "column-conifer";
    if (has(["spruce", "fir", "christmas"])) return "spruce-fir";
    if (has(["redwood"])) return "redwood";
    return "pine";
  }
  if (kind === "broadleaf") {
    if (has(["baobab"])) return "baobab";
    if (has(["willow", "weeping"])) return "weeping";
    if (has(["poplar", "lombardy"])) return "column";
    if (has(["maple"])) return "maple";
    if (has(["oak"])) return "oak";
    if (has(["birch", "aspen"])) return "birch-aspen";
    if (has(["acacia", "thorn"])) return "acacia";
    if (has(["apple", "orange", "lemon", "peach", "cherry"])) return "fruit";
    return "round-broadleaf";
  }
  if (kind === "palm") return has(["fan", "palmetto"]) ? "fan-palm" : "feather-palm";
  if (kind === "cactus") {
    if (has(["barrel"])) return "barrel";
    if (has(["prickly", "beavertail"])) return "pad";
    if (has(["cholla", "ocotillo"])) return "branching";
    return "column-cactus";
  }
  if (kind === "flower") {
    if (has(["sunflower"])) return "sunflower";
    if (has(["rose"])) return "rose";
    if (has(["marigold"])) return "marigold";
    return "cluster-flower";
  }
  if (kind === "grass") {
    if (has(["bamboo", "cane"])) return "bamboo-cane";
    if (has(["cattail"])) return "cattail";
    if (has(["wheat", "corn"])) return "crop";
    return "grass-clump";
  }
  if (kind === "shrub") {
    if (has(["boxwood"])) return "boxwood";
    if (has(["holly"])) return "holly";
    if (has(["hedge"])) return "hedge";
    return "leafy-shrub";
  }
  if (kind === "plant") {
    if (has(["aloe", "agave"])) return "rosette";
    if (has(["banana"])) return "banana";
    if (has(["elephant"])) return "elephant-ear";
    return "large-leaf";
  }
  return kind;
}

function colorBucket(color: [number, number, number] | undefined): string {
  if (!color) return "none";
  const [r, g, b] = color;
  if (r > 0.75 && g > 0.45 && b < 0.2) return "yellow";
  if (r > 0.65 && g < 0.2 && b < 0.25) return "red";
  if (r > 0.7 && b > 0.45) return "pink";
  if (g > r * 1.45 && g > b * 1.3) return "green";
  if (r > g && g > b) return "brown";
  return "mixed";
}

function bucket(value: number, step: number): string {
  return String(Math.round(value / step));
}

function buildBroadleaf(recipe: SpeedTreeLibraryRecipe, opts: SpeedTreeLibraryBuildOptions): PlantResult {
  const key = recipe.tags.join(" ");
  const acaciaLike = key.includes("acacia") || key.includes("thorn");
  const p = resolveSpeedTreeLibraryParams(recipe, opts.params);
  const quality = opts.quality ?? "medium";
  const depth = quality === "proxy" ? 2 : 3;
  const leafDensityScale = quality === "proxy" ? 0.55 : quality === "high" ? 1.25 : 1;
  const shape = key.includes("willow") ? "umbrella"
    : key.includes("poplar") || key.includes("lombardy") || key.includes("column") ? "column"
    : key.includes("baobab") || key.includes("acacia") || key.includes("thorn") ? "umbrella"
    : "ellipsoid";
  const crownWidth = recipe.height * (
    acaciaLike ? 1.28
      : key.includes("baobab") ? 0.9
        : key.includes("willow") ? 0.78
          : shape === "column" ? 0.34
            : key.includes("olive") || key.includes("mesquite") ? 0.62
              : 0.7
  ) * p.crownScale;
  const crownBasePct = acaciaLike ? 0.42 : key.includes("baobab") ? 0.46 : key.includes("poplar") ? 0.18 : 0.26;
  const crownDepth = crownWidth * (acaciaLike || key.includes("windswept") ? 0.55 : 0.85) * p.crownDepth;
  const guide = treeGuideFromSilhouette({
    height: recipe.height,
    crownWidth,
    crownDepth,
    trunkLean: (key.includes("willow") ? -0.22 : key.includes("acacia") ? 0.18 : 0) + p.lean,
    crownBasePct,
    shape,
  });
  const trunkRadius = recipe.height * (
    key.includes("baobab") ? 0.12
      : key.includes("oak") ? 0.075
        : key.includes("birch") || key.includes("poplar") ? 0.04
          : 0.06
  ) * p.trunkScale;
  const branchAngle = (key.includes("willow") ? 64 : acaciaLike ? 70 : key.includes("baobab") ? 68 : shape === "column" ? 30 : 52) + p.branchAngle;
  const leafDensity = recipe.leafless ? 0 : Math.round((acaciaLike ? 18 : key.includes("fruit") ? 11 : 8) * leafDensityScale * p.leafDensity);
  const treeOpts: TreeOptions = {
    seed: recipe.seed,
    trunkRadius,
    gnarl: (key.includes("birch") || shape === "column" ? 0.06 : key.includes("oak") ? 0.18 : 0.12) * p.gnarl,
    branchCount: Math.max(1, Math.round((shape === "column" ? 7 : key.includes("baobab") ? 8 : 9) * p.branchCount)),
    depth,
    branchAngle,
    leafDensity,
    leafSize: (acaciaLike ? 0.07 : key.includes("maple") ? 0.18 : key.includes("willow") ? 0.14 : 0.16) * p.leafSize,
    leafShape: acaciaLike ? "lanceolate" : recipe.leafShape ?? "oval",
    leafCurl: key.includes("willow") ? -0.18 : 0.08,
    leafFold: 0.1,
    // Thinner root collars: fat flares turned branches into visible "antlers"
    // poking out of the crown. Keep just enough for a natural base.
    branchFlareScale: key.includes("baobab") ? 1.5 : key.includes("oak") ? 1.35 : 1.2,
    // Shorter mid/tip branches so twigs stay inside the crown envelope and get
    // covered by the leaf shell instead of spearing past it.
    branchLengthProfile: acaciaLike
      ? [{ t: 0, value: 0.45 }, { t: 0.5, value: 1.0 }, { t: 1, value: 0.62 }]
      : shape === "column"
      ? [{ t: 0, value: 0.42 }, { t: 0.65, value: 0.78 }, { t: 1, value: 0.36 }]
      : key.includes("baobab")
        ? [{ t: 0, value: 0.3 }, { t: 0.62, value: 1.1 }, { t: 1, value: 0.55 }]
        : [{ t: 0, value: 0.9 }, { t: 0.55, value: 0.82 }, { t: 1, value: 0.42 }],
    // Push leaves outward and up toward the branch tips so the shell forms on the
    // crown edge, not clustered at branch roots.
    leafDensityProfile: [{ t: 0, value: 0.15 }, { t: 0.6, value: 1.0 }, { t: 1, value: 1.35 }],
    // Taper branches hard so woody mass shrinks fast and hides under the foliage.
    branchRadiusProfile: [{ t: 0, value: 1.0 }, { t: 0.5, value: 0.5 }, { t: 1, value: 0.16 }],
    branchFeatures: { count: Math.max(1, Math.round((quality === "proxy" ? 3 : 9) * p.branchCount)), kind: "mixed", size: key.includes("baobab") ? 1.25 : 0.75 },
  };
  if (acaciaLike) {
    treeOpts.branchPhototropism = 0.72;
    treeOpts.branchGravity = 0;
    treeOpts.branchLengthScale = 0.52;
  }
  const plant = buildTreeFromGuide(guide, treeOpts);
  const leafCloud = leafDensity > 0
    ? broadleafCrownCloud(recipe, {
      shape,
      quality,
      crownWidth,
      crownDepth,
      crownBasePct,
      lean: (key.includes("willow") ? -0.22 : key.includes("acacia") ? 0.18 : 0) + p.lean,
      leafSize: p.leafSize,
      leafDensity: p.leafDensity,
    })
    : merge();
  return {
    ...plant,
    leaves: merge(plant.leaves, leafCloud),
  };
}

function buildConifer(recipe: SpeedTreeLibraryRecipe, opts: SpeedTreeLibraryBuildOptions): PlantResult {
  const key = recipe.tags.join(" ");
  const p = resolveSpeedTreeLibraryParams(recipe, opts.params);
  const quality = opts.quality ?? "medium";
  if (key.includes("cypress") || key.includes("juniper") || key.includes("cedar")) {
    const plant = buildTreeFromGuide(treeGuideFromSilhouette({
      height: recipe.height,
      crownWidth: (key.includes("italian") ? recipe.height * 0.22 : recipe.height * 0.36) * p.crownScale,
      crownDepth: (key.includes("italian") ? recipe.height * 0.2 : recipe.height * 0.34) * p.crownDepth,
      trunkLean: p.lean,
      crownBasePct: 0.1,
      shape: "column",
    }), {
      seed: recipe.seed,
      trunkRadius: recipe.height * 0.028 * p.trunkScale,
      gnarl: 0.04 * p.gnarl,
      branchCount: Math.max(1, Math.round((quality === "proxy" ? 6 : 9) * p.branchCount)),
      depth: quality === "proxy" ? 2 : 3,
      branchAngle: 24 + p.branchAngle,
      leafDensity: Math.round((quality === "proxy" ? 3 : 6) * p.leafDensity),
      leafSize: 0.08 * p.leafSize,
      leafShape: "lanceolate",
      branchLengthProfile: [{ t: 0, value: 0.42 }, { t: 0.6, value: 0.75 }, { t: 1, value: 0.34 }],
      leafDensityProfile: [{ t: 0, value: 0.55 }, { t: 0.55, value: 1.25 }, { t: 1, value: 0.9 }],
      branchFeatures: { count: quality === "proxy" ? 2 : 5, size: 0.65 },
    });
    return {
      ...plant,
      leaves: merge(plant.leaves, coniferCrownCloud(recipe, p, "column", quality)),
    };
  }
  const plant = conifer({
    seed: recipe.seed,
    height: recipe.height,
    trunkRadius: (key.includes("redwood") ? 0.28 : 0.16) * p.trunkScale,
    whorls: Math.max(3, Math.round((quality === "proxy" ? 7 : key.includes("spruce") || key.includes("fir") ? 13 : 10) * p.branchCount)),
    perWhorl: Math.max(3, Math.round((quality === "proxy" ? 5 : key.includes("spruce") ? 8 : 7) * p.crownScale)),
    needleDensity: Math.max(0, Math.round((quality === "proxy" ? 3 : key.includes("pine") ? 6 : 7) * p.leafDensity)),
  });
  return {
    ...plant,
    leaves: merge(plant.leaves, coniferCrownCloud(recipe, p, "cone", quality)),
  };
}

interface BroadleafCloudOptions {
  shape: "ellipsoid" | "column" | "umbrella";
  quality: "proxy" | "medium" | "high";
  crownWidth: number;
  crownDepth: number;
  crownBasePct: number;
  lean: number;
  leafSize: number;
  leafDensity: number;
}

function broadleafCrownCloud(recipe: SpeedTreeLibraryRecipe, opts: BroadleafCloudOptions): Mesh {
  const key = recipe.tags.join(" ");
  const rng = makeRng(recipe.seed + 3907);
  const detail = opts.quality === "proxy" ? 1 : 2;
  const density = Math.max(0.35, opts.leafDensity);
  const meshes: Mesh[] = [];
  const crownBase = recipe.height * opts.crownBasePct;
  const crownHeight = recipe.height * (1 - opts.crownBasePct);
  const rx = opts.crownWidth * 0.5;
  const rz = opts.crownDepth * 0.5;
  // Interior occluder only: a small, shrunken sphere deep inside the leaf mass so
  // gaps between leaf cards don't show sky through the crown. It must never form
  // the outer silhouette (that's the "green ball" artifact), so it stays at ~0.6x
  // and is always wrapped by the leaf shell below.
  const addBlob = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    // Fill most of the volume so the crown reads solid, but stay just under the
    // leaf shell so the sphere edge itself never becomes the silhouette.
    meshes.push(transform(icosphere(1, detail), {
      scale: vec3(sx * 0.82, sy * 0.82, sz * 0.82),
      translate: vec3(x + opts.lean * 0.45, y, z),
    }));
  };
  // A broken leaf shell: dense crossed cards scattered on and just OUTSIDE the
  // blob's ellipsoid surface, pushed outward so their edges break the contour.
  // Size + outward-offset jitter make the silhouette ragged like real foliage.
  const addLeafPatch = (x: number, y: number, z: number, sx: number, sy: number, sz: number, count: number) => {
    // Dense shell hugging the occluder surface. Two bands: an inner band right on
    // the surface (fills gaps, no sky through), and an outer band slightly past it
    // (frays the contour). Kept close so the crown stays solid, not a spray.
    const shellCount = Math.round(count * 2.6);
    for (let i = 0; i < shellCount; i++) {
      const a = rng.next() * TAU;
      const phi = Math.acos(1 - 2 * rng.next());
      const dirX = Math.sin(phi) * Math.cos(a);
      const dirY = Math.cos(phi) * 0.9 + 0.08;
      const dirZ = Math.sin(phi) * Math.sin(a);
      // Surface band 0.72..1.02: mostly on/just inside the shell, a few fraying out.
      const surf = 0.72 + rng.next() * rng.next() * 0.34;
      const px = x + dirX * sx * surf;
      const py = y + dirY * sy * surf;
      const pz = z + dirZ * sz * surf;
      const n = normalize(vec3(dirX + rng.range(-0.28, 0.28), Math.abs(dirY) * 0.5 + 0.25, dirZ + rng.range(-0.28, 0.28)));
      // Larger overlapping cards so neighbors close the gaps between them.
      const w = Math.max(0.07, Math.min(sx, sz) * rng.range(0.34, 0.6));
      const h = w * rng.range(1.05, 1.5);
      const center = vec3(px + opts.lean * 0.45, py, pz);
      meshes.push(leafCard(center, n, vec3(0, 1, 0), w, h));
      meshes.push(leafCard(center, normalize(vec3(-n.z, 0.12, n.x)), vec3(0, 1, 0), w * 0.92, h * 0.94));
    }
  };

  if (opts.shape === "umbrella" || key.includes("acacia") || key.includes("thorn")) {
    const count = Math.max(5, Math.round((opts.quality === "proxy" ? 7 : 10) * density));
    for (let i = 0; i < count; i++) {
      const t = count <= 1 ? 0.5 : i / (count - 1);
      const edge = t * 2 - 1;
      const y = crownBase + crownHeight * (0.62 + rng.range(-0.06, 0.08));
      const x = edge * rx * (0.82 + rng.next() * 0.18);
      const z = rng.range(-rz * 0.5, rz * 0.5);
      const sideScale = 1 - Math.abs(edge) * 0.28;
      const ubx = rx * (0.26 + rng.next() * 0.08) * sideScale * opts.leafSize;
      const uby = crownHeight * (0.08 + rng.next() * 0.035) * opts.leafSize;
      const ubz = rz * (0.38 + rng.next() * 0.12) * opts.leafSize;
      addBlob(x, y, z, ubx, uby, ubz);
      addLeafPatch(x, y, z, ubx, uby, ubz, opts.quality === "proxy" ? 12 : 22);
    }
    const cbx = rx * 0.44 * opts.leafSize;
    const cby = crownHeight * 0.12 * opts.leafSize;
    const cbz = rz * 0.5 * opts.leafSize;
    addBlob(0, crownBase + crownHeight * 0.72, 0, cbx, cby, cbz);
    addLeafPatch(0, crownBase + crownHeight * 0.72, 0, cbx, cby, cbz, opts.quality === "proxy" ? 16 : 30);
    return merge(...meshes);
  }

  if (opts.shape === "column") {
    const count = Math.max(4, Math.round((opts.quality === "proxy" ? 6 : 9) * density));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const taper = 0.72 + Math.sin(t * Math.PI) * 0.35;
      const clx = rx * taper * opts.leafSize;
      const cly = crownHeight * 0.13 * opts.leafSize;
      const clz = rz * taper * opts.leafSize;
      const cxp = rng.range(-rx * 0.18, rx * 0.18);
      const czp = rng.range(-rz * 0.18, rz * 0.18);
      addBlob(cxp, crownBase + crownHeight * t, czp, clx, cly, clz);
      addLeafPatch(cxp, crownBase + crownHeight * t, czp, clx, cly, clz, opts.quality === "proxy" ? 10 : 18);
    }
    return merge(...meshes);
  }

  const count = Math.max(5, Math.round((opts.quality === "proxy" ? 7 : 11) * density));
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + rng.range(-0.18, 0.18);
    const r = Math.sqrt(rng.next()) * 0.72;
    const x = Math.cos(a) * rx * r;
    const z = Math.sin(a) * rz * r;
    const y = crownBase + crownHeight * (0.34 + rng.next() * 0.52);
    const vertical = Math.sin(((y - crownBase) / crownHeight) * Math.PI);
    const bx = rx * (0.28 + rng.next() * 0.11) * (0.72 + vertical * 0.35) * opts.leafSize;
    const by = crownHeight * (0.12 + rng.next() * 0.05) * opts.leafSize;
    const bz = rz * (0.28 + rng.next() * 0.1) * (0.72 + vertical * 0.35) * opts.leafSize;
    addBlob(x, y, z, bx, by, bz);
    // Leaf shell spans the blob's full extent so cards wrap it, not a bare sphere.
    addLeafPatch(x, y, z, bx, by, bz, opts.quality === "proxy" ? 10 : 20);
  }
  return merge(...meshes);
}

function coniferCrownCloud(
  recipe: SpeedTreeLibraryRecipe,
  params: SpeedTreeLibraryParams,
  shape: "column" | "cone",
  quality: "proxy" | "medium" | "high",
): Mesh {
  if (params.leafDensity <= 0) return merge();
  const rng = makeRng(recipe.seed + 7901);
  const detail = quality === "proxy" ? 1 : 2;
  const meshes: Mesh[] = [];
  const addBlob = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    meshes.push(transform(icosphere(1, detail), {
      scale: vec3(sx, sy, sz),
      translate: vec3(x + params.lean * 0.35, y, z),
    }));
  };
  if (shape === "column") {
    const count = quality === "proxy" ? 7 : 11;
    const radiusX = recipe.height * 0.12 * params.crownScale;
    const radiusZ = recipe.height * 0.1 * params.crownDepth;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const taper = 0.62 + Math.sin(t * Math.PI) * 0.38;
      addBlob(
        rng.range(-radiusX * 0.16, radiusX * 0.16),
        recipe.height * (0.1 + t * 0.86),
        rng.range(-radiusZ * 0.16, radiusZ * 0.16),
        radiusX * taper,
        recipe.height * 0.085,
        radiusZ * taper,
      );
    }
    return merge(...meshes);
  }

  const tiers = quality === "proxy" ? 6 : 10;
  for (let i = 0; i < tiers; i++) {
    const t = i / Math.max(1, tiers - 1);
    const y = recipe.height * (0.14 + t * 0.8);
    const radius = recipe.height * (0.34 * (1 - t) + 0.05) * params.crownScale;
    addBlob(
      rng.range(-radius * 0.08, radius * 0.08),
      y,
      rng.range(-radius * 0.08, radius * 0.08),
      radius,
      recipe.height * (0.055 + 0.02 * (1 - t)),
      radius * 0.82 * params.crownDepth,
    );
  }
  return merge(...meshes);
}

function buildPalm(recipe: SpeedTreeLibraryRecipe, opts: SpeedTreeLibraryBuildOptions): PlantResult {
  const key = recipe.tags.join(" ");
  const p = resolveSpeedTreeLibraryParams(recipe, opts.params);
  const quality = opts.quality ?? "medium";
  return palm({
    seed: recipe.seed,
    height: recipe.height,
    trunkRadius: (key.includes("sago") || key.includes("ponytail") ? 0.22 : 0.15) * p.trunkScale,
    fronds: Math.max(1, Math.round((quality === "proxy" ? 7 : key.includes("fan") || key.includes("palmetto") ? 14 : 10) * p.branchCount)),
    frondLength: (key.includes("fan") ? 1.55 : recipe.height * 0.36) * p.crownScale * p.leafSize,
    lean: (key.includes("beach") || key.includes("coconut") ? 0.58 : 0.28) + p.lean,
  });
}

function buildShrub(recipe: SpeedTreeLibraryRecipe, opts: SpeedTreeLibraryBuildOptions): PlantResult {
  const p = resolveSpeedTreeLibraryParams(recipe, opts.params);
  const quality = opts.quality ?? "medium";
  return shrub({
    seed: recipe.seed,
    height: recipe.height,
    stems: Math.max(1, Math.round((quality === "proxy" ? 4 : 8) * p.branchCount)),
    spread: recipe.height * 0.22 * p.crownScale,
    stemRadius: recipe.height * 0.025 * p.trunkScale,
    leafDensity: Math.round((quality === "proxy" ? 5 : 12) * p.leafDensity),
    leafSize: (recipe.tags.includes("boxwood") ? 0.09 : 0.13) * p.leafSize,
    leafShape: recipe.leafShape ?? "oval",
    leafCurl: 0.08,
    leafFold: 0.08,
  });
}

function buildGrass(recipe: SpeedTreeLibraryRecipe, opts: SpeedTreeLibraryBuildOptions): PlantResult {
  const quality = opts.quality ?? "medium";
  const key = recipe.tags.join(" ");
  const p = resolveSpeedTreeLibraryParams(recipe, opts.params);
  if (key.includes("bamboo") || key.includes("cane")) {
    return {
      wood: buildBambooStems(recipe),
      leaves: buildBambooLeaves(recipe),
      branches: [],
    };
  }
  return grass({
    seed: recipe.seed,
    blades: Math.max(1, Math.round((quality === "proxy" ? 80 : key.includes("pampas") ? 240 : 180) * p.leafDensity)),
    area: (key.includes("wheat") || key.includes("corn") ? 1.2 : 2.2) * p.crownScale,
    height: recipe.height,
    bend: key.includes("pampas") ? 0.38 : 0.22,
    width: (key.includes("thick") ? 0.02 : 0.012) * p.leafSize,
  });
}

function buildCactusParts(recipe: SpeedTreeLibraryRecipe, opts: SpeedTreeLibraryBuildOptions): NamedPart[] {
  const key = recipe.tags.join(" ");
  const p = resolveSpeedTreeLibraryParams(recipe, opts.params);
  const rng = makeRng(recipe.seed);
  const meshes: Mesh[] = [];
  if (key.includes("barrel")) {
    meshes.push(transform(icosphere(0.8 * p.trunkScale, 2), { scale: vec3(0.82 * p.crownScale, 1.05, 0.82 * p.crownDepth), translate: vec3(0, recipe.height * 0.48, 0) }));
  } else if (key.includes("prickly") || key.includes("beavertail")) {
    const padCount = Math.max(1, Math.round(7 * p.branchCount));
    for (let i = 0; i < padCount; i++) {
      const a = i * 0.82;
      const r = i === 0 ? 0 : 0.35 + rng.next() * 0.45;
      const y = 0.45 + i * 0.22;
      meshes.push(transform(icosphere(0.45, 1), {
        scale: vec3(0.72 * p.leafSize, 1.05 * p.leafSize, 0.16 * p.trunkScale),
        rotate: vec3(rng.range(-0.25, 0.25), a, rng.range(-0.25, 0.25)),
        translate: vec3(Math.cos(a) * r * p.crownScale, y, Math.sin(a) * r * p.crownDepth),
      }));
    }
  } else {
    const trunk = sweep(polyline([vec3(0, 0, 0), vec3(p.lean, recipe.height, 0)]), {
      sides: 10,
      radius: 0.18 * p.trunkScale,
      radiusAt: (t) => 1 - 0.18 * t,
      caps: true,
    });
    meshes.push(trunk);
    const arms = Math.max(0, Math.round((key.includes("saguaro") ? 4 : 2) * p.branchCount));
    for (let i = 0; i < arms; i++) {
      const a = i * TAU / arms + rng.next() * 0.4;
      const y = recipe.height * (0.34 + rng.next() * 0.28);
      const len = recipe.height * (0.2 + rng.next() * 0.12) * p.crownScale;
      const dir = vec3(Math.cos(a), 0, Math.sin(a));
      const c = bezier(
        vec3(dir.x * 0.15, y, dir.z * 0.15),
        vec3(dir.x * len, y + 0.08, dir.z * len),
        vec3(dir.x * len, y + 0.55, dir.z * len),
        vec3(dir.x * len * 0.85, y + recipe.height * 0.22, dir.z * len * 0.85),
        8,
      );
      meshes.push(sweep(c, { sides: 8, radius: 0.11 * p.trunkScale, radiusAt: (t) => 1 - 0.25 * t, caps: true }));
    }
  }
  const stem = merge(...meshes);
  return [part(recipe, "stem", `${recipe.label} 肉质茎`, stem, recipe.foliageColor ?? [0.18, 0.42, 0.2], "foliage")];
}

function buildFernParts(recipe: SpeedTreeLibraryRecipe, opts: SpeedTreeLibraryBuildOptions): NamedPart[] {
  const quality = opts.quality ?? "medium";
  const p = resolveSpeedTreeLibraryParams(recipe, opts.params);
  const rng = makeRng(recipe.seed);
  const stems: Mesh[] = [];
  const blades: Mesh[] = [];
  const count = Math.max(1, Math.round((quality === "proxy" ? 7 : 13) * p.branchCount));
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + rng.next() * 0.2;
    const len = recipe.height * (0.75 + rng.next() * 0.35) * p.crownScale;
    const dir = vec3(Math.cos(a), 0, Math.sin(a));
    const rachis = bezier(
      vec3(0, 0.04, 0),
      vec3(dir.x * len * 0.22, recipe.height * 0.35, dir.z * len * 0.22),
      vec3(dir.x * len * 0.65, recipe.height * 0.44, dir.z * len * 0.65),
      vec3(dir.x * len, recipe.height * 0.16, dir.z * len),
      9,
    );
    const f = frond(rachis, {
      seed: (rng.next() * 1e9) | 0,
      pairs: Math.max(1, Math.round((quality === "proxy" ? 10 : 18) * p.leafDensity)),
      leafletLength: recipe.height * 0.16 * p.leafSize,
      leafletWidth: recipe.height * 0.035 * p.leafSize,
      angle: 62,
      rachisRadius: 0.01 * p.trunkScale,
      tipScale: 0.22,
    });
    stems.push(f.stem);
    blades.push(f.blades);
  }
  return [
    part(recipe, "rachis", `${recipe.label} 叶轴`, merge(...stems), recipe.barkColor, "wood"),
    part(recipe, "foliage", `${recipe.label} 羽叶`, merge(...blades), recipe.foliageColor ?? [0.15, 0.42, 0.14], "foliage"),
  ];
}

function buildFlowerParts(recipe: SpeedTreeLibraryRecipe, opts: SpeedTreeLibraryBuildOptions): NamedPart[] {
  const p = resolveSpeedTreeLibraryParams(recipe, opts.params);
  const rng = makeRng(recipe.seed);
  const stems: Mesh[] = [];
  const leaves: Mesh[] = [];
  const blooms: Mesh[] = [];
  const count = Math.max(1, Math.round((recipe.tags.includes("sunflower") ? 3 : 7) * p.branchCount));
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + rng.next() * 0.25;
    const r = (count === 3 ? i * 0.22 : 0.18 + rng.next() * 0.36) * p.crownScale;
    const root = vec3(Math.cos(a) * r, 0, Math.sin(a) * r);
    const h = recipe.height * (0.75 + rng.next() * 0.3);
    const top = add(root, vec3(rng.range(-0.04, 0.04), h, rng.range(-0.04, 0.04)));
    stems.push(sweep(bezier(root, add(root, vec3(0, h * 0.35, 0)), add(top, vec3(0, -h * 0.3, 0)), top, 5), {
      sides: 5,
      radius: 0.018 * p.trunkScale,
      radiusAt: (t) => 1 - 0.55 * t,
      caps: false,
    }));
    if (p.leafDensity > 0) leaves.push(leafMesh(add(root, vec3(0.02, h * 0.35, 0)), vec3(0, 1, 0), vec3(Math.cos(a), 0.25, Math.sin(a)), 0.11 * p.leafSize, 0.32 * p.leafSize, {
      shape: recipe.leafShape === "round" ? "round" : "lanceolate",
      segments: 6,
      curl: 0.08,
      fold: 0.12,
    }));
    if (p.leafDensity > 0) blooms.push(flowerHead(top, recipe.accentColor ?? [0.9, 0.35, 0.42], recipe.tags.includes("sunflower"), p.leafSize));
  }
  return [
    part(recipe, "stems", `${recipe.label} 花茎`, merge(...stems), recipe.barkColor, "wood"),
    part(recipe, "foliage", `${recipe.label} 叶片`, merge(...leaves), recipe.foliageColor ?? [0.2, 0.48, 0.16], "foliage"),
    part(recipe, "blooms", `${recipe.label} 花朵`, merge(...blooms), recipe.accentColor ?? [0.9, 0.35, 0.42], "foliage"),
  ];
}

function buildAquaticParts(recipe: SpeedTreeLibraryRecipe, opts: SpeedTreeLibraryBuildOptions): NamedPart[] {
  const key = recipe.tags.join(" ");
  const p = resolveSpeedTreeLibraryParams(recipe, opts.params);
  if (key.includes("coral") || key.includes("sponge")) {
    const stems: Mesh[] = [];
    const rng = makeRng(recipe.seed);
    const count = Math.max(1, Math.round((key.includes("fan") ? 18 : 10) * p.branchCount));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI - Math.PI * 0.5;
      const len = recipe.height * (0.55 + rng.next() * 0.6) * p.crownScale;
      const c = bezier(vec3(0, 0, 0), vec3(Math.cos(a) * len * 0.15, len * 0.35, Math.sin(a) * 0.04), vec3(Math.cos(a) * len * 0.55, len * 0.8, Math.sin(a) * 0.08), vec3(Math.cos(a) * len, len, Math.sin(a) * 0.12), 5);
      stems.push(sweep(c, { sides: 4, radius: 0.018 * p.trunkScale, radiusAt: (t) => 1 - 0.6 * t, caps: false }));
    }
    return [part(recipe, "coral", `${recipe.label} 海洋枝体`, merge(...stems), recipe.accentColor ?? [0.72, 0.36, 0.5], "foliage")];
  }
  return buildLargeLeafPlantParts(recipe, opts);
}

function buildFungusParts(recipe: SpeedTreeLibraryRecipe, opts: SpeedTreeLibraryBuildOptions): NamedPart[] {
  const p = resolveSpeedTreeLibraryParams(recipe, opts.params);
  const cap = transform(sphere(0.45 * p.leafSize, 24, 8), { scale: vec3(1.15 * p.crownScale, 0.32, 1.0 * p.crownDepth), translate: vec3(p.lean, recipe.height * 0.75, 0) });
  const stem = transform(cylinder(0.11 * p.trunkScale, recipe.height * 0.72, 10, true), { translate: vec3(p.lean * 0.35, recipe.height * 0.36, 0) });
  return [
    part(recipe, "stem", `${recipe.label} 菌柄`, stem, [0.78, 0.68, 0.5], "wood"),
    part(recipe, "cap", `${recipe.label} 菌盖`, cap, recipe.accentColor ?? [0.56, 0.22, 0.12], "foliage"),
  ];
}

function buildStumpParts(recipe: SpeedTreeLibraryRecipe, opts: SpeedTreeLibraryBuildOptions): NamedPart[] {
  const p = resolveSpeedTreeLibraryParams(recipe, opts.params);
  const height = recipe.height * 0.55;
  const trunk = sweep(polyline([vec3(0, 0, 0), vec3(0.05 + p.lean * 0.3, height * 0.55, 0.02), vec3(-0.03 + p.lean, height, 0.01)]), {
    sides: 8,
    radius: recipe.height * 0.14 * p.trunkScale,
    radiusAt: (t) => 1 - 0.35 * t,
    caps: true,
  });
  const root = rootFlares(recipe.seed, recipe.height * 0.62 * p.crownScale, recipe.height * 0.035 * p.trunkScale);
  return [part(recipe, "wood", `${recipe.label} 枯桩`, merge(trunk, root), recipe.barkColor, "wood")];
}

function buildVineParts(recipe: SpeedTreeLibraryRecipe, opts: SpeedTreeLibraryBuildOptions): NamedPart[] {
  const p = resolveSpeedTreeLibraryParams(recipe, opts.params);
  const rng = makeRng(recipe.seed);
  const vines: Mesh[] = [];
  const leaves: Mesh[] = [];
  const count = Math.max(1, Math.round(6 * p.branchCount));
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + rng.next() * 0.3;
    const pts: Vec3[] = [];
    for (let j = 0; j <= 8; j++) {
      const t = j / 8;
      const twist = a + t * TAU * (0.5 + rng.next() * 0.4);
      pts.push(vec3(Math.cos(twist) * recipe.height * 0.18 * p.crownScale + p.lean * t, t * recipe.height, Math.sin(twist) * recipe.height * 0.18 * p.crownDepth));
    }
    const curve = smoothCurve(polyline(pts), 3);
    vines.push(sweep(curve, { sides: 5, radius: 0.02 * p.trunkScale, radiusAt: (t) => 1 - 0.35 * t, caps: false }));
    for (let j = 2; j < curve.points.length; j += 3) {
      const pt = curve.points[j]!;
      if (p.leafDensity > 0) leaves.push(leafMesh(pt, vec3(0, 1, 0), vec3(Math.cos(a), 0.4, Math.sin(a)), 0.14 * p.leafSize, 0.22 * p.leafSize, {
        shape: "teardrop",
        segments: 5,
        curl: 0.08,
        fold: 0.12,
      }));
    }
  }
  return [
    part(recipe, "vines", `${recipe.label} 藤茎`, merge(...vines), recipe.barkColor, "wood"),
    part(recipe, "foliage", `${recipe.label} 藤叶`, merge(...leaves), recipe.foliageColor ?? [0.14, 0.38, 0.12], "foliage"),
  ];
}

function buildLargeLeafPlantParts(recipe: SpeedTreeLibraryRecipe, opts: SpeedTreeLibraryBuildOptions): NamedPart[] {
  const p = resolveSpeedTreeLibraryParams(recipe, opts.params);
  const rng = makeRng(recipe.seed);
  const stems: Mesh[] = [];
  const leaves: Mesh[] = [];
  const count = Math.max(1, Math.round((recipe.tags.includes("banana") ? 10 : recipe.tags.includes("aloe") ? 16 : 9) * p.branchCount));
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + rng.next() * 0.18;
    const len = recipe.height * (0.48 + rng.next() * 0.28) * p.crownScale;
    const start = vec3(0, recipe.height * 0.08, 0);
    const out = normalize(vec3(Math.cos(a), 0.25 + rng.next() * 0.18, Math.sin(a)));
    const end = add(start, scale(out, len));
    const rachis = bezier(start, add(start, scale(out, len * 0.35)), add(end, vec3(0, -len * 0.12, 0)), end, 6);
    stems.push(sweep(rachis, { sides: 4, radius: recipe.height * 0.012 * p.trunkScale, radiusAt: (t) => 1 - 0.75 * t, caps: false }));
    if (p.leafDensity > 0) leaves.push(doubleSided(leafMesh(add(end, scale(out, -len * 0.35)), vec3(0, 1, 0), out, len * 0.26 * p.leafSize, len * 0.95 * p.leafSize, {
      shape: recipe.tags.includes("aloe") ? "lanceolate" : "round",
      segments: 10,
      curl: recipe.tags.includes("aloe") ? -0.12 : -0.08,
      fold: 0.26,
    })));
  }
  return [
    part(recipe, "stems", `${recipe.label} 叶柄`, merge(...stems), recipe.barkColor, "wood"),
    part(recipe, "foliage", `${recipe.label} 大叶`, merge(...leaves), recipe.foliageColor ?? [0.18, 0.48, 0.16], "foliage"),
  ];
}

function buildBambooStems(recipe: SpeedTreeLibraryRecipe): Mesh {
  const rng = makeRng(recipe.seed);
  const stems: Mesh[] = [];
  const count = 9;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + rng.next() * 0.2;
    const r = 0.2 + rng.next() * 0.42;
    const h = recipe.height * (0.75 + rng.next() * 0.35);
    const base = vec3(Math.cos(a) * r, 0, Math.sin(a) * r);
    const top = add(base, vec3(rng.range(-0.07, 0.07), h, rng.range(-0.07, 0.07)));
    stems.push(sweep(bezier(base, add(base, vec3(0, h * 0.35, 0)), add(top, vec3(0, -h * 0.32, 0)), top, 5), {
      sides: 7,
      radius: 0.035,
      radiusAt: () => 1,
      caps: true,
    }));
  }
  return merge(...stems);
}

function buildBambooLeaves(recipe: SpeedTreeLibraryRecipe): Mesh {
  const rng = makeRng(recipe.seed + 1);
  const leaves: Mesh[] = [];
  for (let i = 0; i < 32; i++) {
    const a = rng.next() * TAU;
    const y = recipe.height * (0.35 + rng.next() * 0.55);
    const r = 0.25 + rng.next() * 0.55;
    const p = vec3(Math.cos(a) * r, y, Math.sin(a) * r);
    leaves.push(leafMesh(p, vec3(0, 1, 0), vec3(Math.cos(a), 0.2, Math.sin(a)), 0.07, 0.26, {
      shape: "lanceolate",
      segments: 5,
      curl: 0.08,
      fold: 0.08,
    }));
  }
  return merge(...leaves);
}

function flowerHead(center: Vec3, color: [number, number, number], large: boolean, sizeScale = 1): Mesh {
  const petals: Mesh[] = [];
  const count = large ? 18 : 8;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    const dir = vec3(Math.cos(a), 0.15, Math.sin(a));
    petals.push(leafCard(add(center, scale(dir, (large ? 0.1 : 0.055) * sizeScale)), vec3(0, 1, 0), dir, (large ? 0.08 : 0.055) * sizeScale, (large ? 0.24 : 0.14) * sizeScale));
  }
  return merge(transform(sphere((large ? 0.08 : 0.045) * sizeScale, 12, 6), { translate: center }), ...petals);
}

function rootFlares(seed: number, radius: number, tubeRadius: number): Mesh {
  const rng = makeRng(seed);
  const roots: Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + rng.next() * 0.16;
    const len = radius * (0.65 + rng.next() * 0.35);
    const curve = bezier(
      vec3(0, 0.08, 0),
      vec3(Math.cos(a) * len * 0.24, 0.12, Math.sin(a) * len * 0.24),
      vec3(Math.cos(a) * len * 0.68, 0.04, Math.sin(a) * len * 0.68),
      vec3(Math.cos(a) * len, 0.02, Math.sin(a) * len),
      6,
    );
    roots.push(sweep(curve, { sides: 5, radius: tubeRadius, radiusAt: (t) => 1 - 0.84 * t, caps: false }));
  }
  return merge(...roots);
}

function plantParts(recipe: SpeedTreeLibraryRecipe, plant: PlantResult, foliageName = "foliage"): NamedPart[] {
  const parts: NamedPart[] = [];
  if (vertexCount(plant.wood) > 0) {
    parts.push(part(recipe, "wood", `${recipe.label} 枝干`, plant.wood, recipe.barkColor, "wood"));
  }
  if (vertexCount(plant.leaves) > 0 && recipe.foliageColor) {
    parts.push(part(recipe, foliageName, `${recipe.label} 叶冠`, plant.leaves, recipe.foliageColor, "foliage"));
  }
  return parts;
}

function part(
  recipe: SpeedTreeLibraryRecipe,
  name: string,
  label: string,
  mesh: Mesh,
  color: [number, number, number],
  windKind: "wood" | "foliage",
): NamedPart {
  const out: NamedPart = {
    name,
    label,
    mesh,
    color,
    surface: windKind === "wood"
      ? { type: "bark", params: { color, scale: 1.2 } }
      : { type: "leaf", params: { color } },
    windWeight: windChannels(mesh, { kind: windKind, seed: recipe.seed + (windKind === "wood" ? 0 : 1) }).combined,
    metadata: {
      sourceCategory: recipe.sourceCategory,
      sourceSpecies: recipe.sourceSpecies,
      sourceVariant: recipe.sourceVariant ?? "",
      libraryKind: recipe.kind,
      generator: "meshova-speedtree-library-regenerator",
      method: "name-informed procedural approximation; no source asset copied",
    },
  };
  return out;
}

function inferKind(entry: SpeedTreeLibraryEntry, key: string): SpeedTreeLibraryKind {
  const category = entry.category.toLowerCase();
  if (hasAny(key, ["mushroom", "bolete", "fungus"])) return "fungus";
  if (hasAny(key, ["stump", "burnt", "dead", "snag"])) return "stump";
  if (hasAny(key, ["vine", "grape", "kudzu", "ivy"])) return "vine";
  if (category.includes("marine") || hasAny(key, ["water", "lotus", "lily", "pond", "coral", "sponge", "hydrilla", "spearhead"])) return "aquatic";
  if (hasAny(key, ["fern"])) return "fern";
  if (hasAny(key, ["rose", "flower", "marigold", "sunflower", "lily", "knapweed", "spirea", "tobacco", "tomato"])) return "flower";
  if (hasAny(key, ["grass", "wheat", "corn", "cane", "bamboo", "cattail", "pampas"])) return "grass";
  if (hasAny(key, ["cactus", "cholla", "saguaro", "ocotillo", "prickly", "barrel", "beavertail"])) return "cactus";
  if (hasAny(key, ["palm", "palmetto", "coconut", "date", "sago"])) return "palm";
  if (hasAny(key, ["aloe", "dracaena", "banana", "yucca", "joshua", "agave", "elephant ear", "bird of paradise"])) return "plant";
  if (category.includes("conifer") || hasAny(key, ["pine", "spruce", "fir", "cedar", "cypress", "juniper", "redwood", "christmas"])) return "conifer";
  if (category.includes("shrubs") || hasAny(key, ["shrub", "boxwood", "holly", "azalea", "hawthorn", "hazel", "sagebrush", "elder", "manzanita", "hedge", "bush"])) return "shrub";
  return "broadleaf";
}

function inferHeight(kind: SpeedTreeLibraryKind, key: string, rng: ReturnType<typeof makeRng>): number {
  if (kind === "conifer") return key.includes("redwood") ? 8.0 : rng.range(5.0, 6.8);
  if (kind === "palm") return rng.range(4.2, 6.1);
  if (kind === "cactus") return key.includes("saguaro") ? rng.range(3.3, 4.8) : rng.range(1.1, 2.3);
  if (kind === "shrub") return rng.range(1.0, 1.8);
  if (kind === "grass") return key.includes("bamboo") || key.includes("cane") ? rng.range(2.3, 3.4) : rng.range(0.45, 1.2);
  if (kind === "fern") return rng.range(0.8, 1.3);
  if (kind === "flower") return key.includes("sunflower") ? rng.range(1.4, 2.0) : rng.range(0.55, 1.2);
  if (kind === "aquatic") return rng.range(0.45, 1.1);
  if (kind === "fungus") return rng.range(0.45, 0.9);
  if (kind === "stump") return rng.range(1.0, 1.8);
  if (kind === "vine") return rng.range(2.2, 3.5);
  if (kind === "plant") return rng.range(1.2, 2.6);
  if (key.includes("baobab")) return rng.range(4.2, 5.4);
  if (key.includes("poplar") || key.includes("sycamore")) return rng.range(5.5, 7.0);
  return rng.range(3.8, 5.4);
}

function barkColorFor(key: string, rng: ReturnType<typeof makeRng>): [number, number, number] {
  if (hasAny(key, ["birch", "aspen"])) return [0.7, 0.66, 0.55];
  if (hasAny(key, ["dead", "burnt", "stump"])) return [0.42, 0.37, 0.3];
  if (hasAny(key, ["bamboo", "cane", "grass", "flower"])) return [0.22, 0.34, 0.12];
  if (hasAny(key, ["cactus", "aloe"])) return [0.16, 0.36, 0.18];
  return [0.25 + rng.next() * 0.12, 0.16 + rng.next() * 0.08, 0.1 + rng.next() * 0.06];
}

function foliageColorFor(
  kind: SpeedTreeLibraryKind,
  key: string,
  rng: ReturnType<typeof makeRng>,
): [number, number, number] | undefined {
  if (kind === "fungus" || kind === "stump") return undefined;
  if (hasAny(key, ["dead", "burnt", "winter"])) return undefined;
  if (hasAny(key, ["red maple", "red_oak", "japanese maple"])) return [0.55, 0.14, 0.08];
  if (hasAny(key, ["autumn", "fall", "orange"])) return [0.72, 0.34, 0.08];
  if (hasAny(key, ["yellow", "linden", "wheat"])) return [0.58, 0.5, 0.18];
  if (kind === "conifer") return [0.06 + rng.next() * 0.04, 0.22 + rng.next() * 0.08, 0.1 + rng.next() * 0.05];
  if (kind === "cactus" || kind === "plant") return [0.16 + rng.next() * 0.06, 0.42 + rng.next() * 0.12, 0.16 + rng.next() * 0.08];
  if (kind === "aquatic") return [0.12, 0.44, 0.22];
  return [0.12 + rng.next() * 0.12, 0.34 + rng.next() * 0.18, 0.1 + rng.next() * 0.1];
}

function accentColorFor(key: string, rng: ReturnType<typeof makeRng>): [number, number, number] | undefined {
  if (hasAny(key, ["sunflower"])) return [0.95, 0.68, 0.08];
  if (hasAny(key, ["rose", "red"])) return [0.74, 0.08, 0.12];
  if (hasAny(key, ["marigold", "orange"])) return [0.9, 0.42, 0.08];
  if (hasAny(key, ["lotus", "lily", "flower", "cherry", "blossom", "azalea"])) return [0.86 + rng.next() * 0.1, 0.42 + rng.next() * 0.22, 0.58 + rng.next() * 0.2];
  if (hasAny(key, ["mushroom", "bolete"])) return [0.52, 0.22, 0.12];
  if (hasAny(key, ["coral", "sponge"])) return [0.78, 0.34, 0.48];
  return undefined;
}

function leafShapeFor(key: string): LeafShape | undefined {
  if (hasAny(key, ["willow", "grass", "palm", "bamboo", "cane", "olive", "eucalyptus", "gum"])) return "lanceolate";
  if (hasAny(key, ["birch", "poplar", "aspen", "cherry", "dogwood"])) return "teardrop";
  if (hasAny(key, ["maple", "linden", "boxwood", "flower", "aloe"])) return "round";
  return "oval";
}

function tagsFor(key: string): string[] {
  return key.split(/[^a-z0-9]+/).filter(Boolean);
}

function keyOf(entry: SpeedTreeLibraryEntry): string {
  return `${entry.category} ${entry.species} ${entry.variant ?? ""}`
    .replace(/_/g, " ")
    .toLowerCase();
}

function displayLabel(entry: SpeedTreeLibraryEntry): string {
  const base = title(entry.species);
  const variant = entry.variant && slug(entry.variant) !== slug(entry.species) ? ` ${title(entry.variant)}` : "";
  return `${base}${variant}`;
}

function title(value: string): string {
  return value
    .replace(/\.[^.]+$/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function hasAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.[^.]+$/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Map to unsigned then into the valid seed range [0, 999999]. Returning a
  // signed int here (h | 0) made ~half the species hash to negatives, which the
  // seed clamps (Math.max(0, …) / clampNum(…, 0, 999999)) collapsed to 0 — so
  // many species shared seed 0 and rendered as visually identical trees.
  return (h >>> 0) % 1000000;
}

function clampNum(value: unknown, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, n));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampColor(c: [number, number, number]): [number, number, number] {
  const ch = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
  return [ch(c[0]), ch(c[1]), ch(c[2])];
}

function doubleSided(mesh: Mesh): Mesh {
  const offset = mesh.positions.length;
  const indices = mesh.indices.slice();
  for (let i = 0; i < mesh.indices.length; i += 3) {
    indices.push(offset + mesh.indices[i]!, offset + mesh.indices[i + 2]!, offset + mesh.indices[i + 1]!);
  }
  return {
    positions: [...mesh.positions, ...mesh.positions],
    normals: [...mesh.normals, ...mesh.normals.map((n) => scale(n, -1))],
    uvs: [...mesh.uvs, ...mesh.uvs],
    indices,
  };
}
