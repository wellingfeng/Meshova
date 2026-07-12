/**
 * SpeedTree library regeneration helpers.
 *
 * This module uses only source folder/file names as botanical hints. It does
 * not parse, import, copy, or derive geometry/textures from SpeedTree assets.
 * Output stays Meshova-native: seeded splines, sweeps, leaf cards/fronds, wind.
 */
import type { Vec3 } from "../math/vec3.js";
import { add, normalize, scale, vec3 } from "../math/vec3.js";
import type { Vec2 } from "../math/vec2.js";
import { vec2 } from "../math/vec2.js";
import { TAU } from "../math/scalar.js";
import { makeRng } from "../random/prng.js";
import type { Mesh } from "../geometry/mesh.js";
import { makeMesh, merge, recomputeNormals, vertexCount } from "../geometry/mesh.js";
import type { NamedPart } from "../geometry/export.js";
import { bezier, polyline, smoothCurve, sweep } from "../geometry/curve.js";
import { cylinder, cone, icosphere } from "../geometry/primitives2.js";
import { sphere } from "../geometry/primitives.js";
import { transform, translateMesh, scaleMesh } from "../geometry/transform.js";
import { treeGuideFromSilhouette, buildTreeFromGuide } from "./guide.js";
import type { LeafShape } from "./leaf.js";
import { leafCard, leafMesh } from "./leaf.js";
import { conifer, grass, palm, shrub, tree, type PlantResult, type TreeOptions } from "./plant.js";
import { frond, needleCluster } from "./frond.js";
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
  if (recipe.kind === "aquatic" && hasAny(species, ["water", "lily", "lotus"])) score += 20;
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
  if (recipe.kind === "aquatic") return [recipe.kind, form].join("|");
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
    if (has(["barrel"]) || (has(["easter"]) && has(["cactus"]))) return "barrel";
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
  if (kind === "aquatic") return has(["coral", "sponge"]) ? "coral-sponge" : "large-leaf";
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
  let guide = treeGuideFromSilhouette({
    height: recipe.height,
    crownWidth,
    crownDepth,
    trunkLean: (key.includes("willow") ? -0.22 : key.includes("acacia") ? 0.18 : 0) + p.lean,
    crownBasePct,
    shape,
  });
  if (acaciaLike) {
    const lean = (key.includes("acacia") ? 0.18 : 0) + p.lean;
    guide = {
      ...guide,
      trunk: [
        vec3(0, 0, 0),
        vec3(lean * 0.22, recipe.height * 0.36, 0),
        vec3(lean * 0.55, recipe.height * 0.62, lean * 0.08),
      ],
    };
  }
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
    branchCount: Math.max(1, Math.round((acaciaLike ? 11 : shape === "column" ? 7 : key.includes("baobab") ? 8 : 9) * p.branchCount)),
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
    treeOpts.branchPhototropism = 0.38;
    treeOpts.branchGravity = 0.02;
    treeOpts.branchLengthScale = 0.78;
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
  if (key.includes("acacia") || key.includes("thorn")) return acaciaCrownCloud(recipe, opts);

  const rng = makeRng(recipe.seed + 3907);
  const density = Math.max(0.35, opts.leafDensity);
  const meshes: Mesh[] = [];
  const crownBase = recipe.height * opts.crownBasePct;
  const crownHeight = recipe.height * (1 - opts.crownBasePct);
  const rx = opts.crownWidth * 0.5;
  const rz = opts.crownDepth * 0.5;
  const cloudLeafShape: Exclude<LeafShape, "quad"> =
    recipe.leafShape && recipe.leafShape !== "quad" ? recipe.leafShape : key.includes("poplar") ? "lanceolate" : "oval";
  const addCloudLeaf = (center: Vec3, normal: Vec3, up: Vec3, w: number, h: number, curl: number, fold: number) => {
    meshes.push(leafMesh(center, normal, up, w, h, {
      shape: cloudLeafShape,
      segments: opts.quality === "proxy" ? 3 : 4,
      curl,
      fold,
      roundedNormals: true,
    }));
  };
  // Interior fill uses open leaf blades only. Old closed icosphere occluders were
  // visible as green balls when shell cards missed them.
  const addLeafFill = (x: number, y: number, z: number, sx: number, sy: number, sz: number, count: number) => {
    const fillCount = Math.max(4, Math.round(count * 0.72));
    for (let i = 0; i < fillCount; i++) {
      const a = rng.next() * TAU;
      const phi = Math.acos(1 - 2 * rng.next());
      const r = Math.pow(rng.next(), 0.42) * 0.72;
      const dir = vec3(Math.sin(phi) * Math.cos(a), Math.cos(phi) * 0.82 + 0.1, Math.sin(phi) * Math.sin(a));
      const center = vec3(
        x + opts.lean * 0.45 + dir.x * sx * r,
        y + dir.y * sy * r,
        z + dir.z * sz * r,
      );
      const normal = normalize(vec3(dir.x + rng.range(-0.25, 0.25), Math.abs(dir.y) * 0.45 + 0.28, dir.z + rng.range(-0.25, 0.25)));
      const up = normalize(vec3(rng.range(-0.22, 0.22), 0.86, rng.range(-0.22, 0.22)));
      const w = Math.max(0.045, Math.min(sx, sz) * rng.range(0.18, 0.34));
      const h = w * rng.range(1.08, 1.55);
      addCloudLeaf(center, normal, up, w, h, rng.range(-0.02, 0.08), rng.range(0.04, 0.12));
    }
  };
  // A broken leaf shell: dense crossed blades scattered on and just outside an
  // ellipsoid guide, so foliage has volume without any hidden solid mesh.
  const addLeafPatch = (x: number, y: number, z: number, sx: number, sy: number, sz: number, count: number) => {
    const shellCount = Math.round(count * 3.1);
    for (let i = 0; i < shellCount; i++) {
      const a = rng.next() * TAU;
      const phi = Math.acos(1 - 2 * rng.next());
      const dirX = Math.sin(phi) * Math.cos(a);
      const dirY = Math.cos(phi) * 0.9 + 0.08;
      const dirZ = Math.sin(phi) * Math.sin(a);
      const surf = 0.66 + rng.next() * rng.next() * 0.48;
      const px = x + dirX * sx * surf;
      const py = y + dirY * sy * surf;
      const pz = z + dirZ * sz * surf;
      const n = normalize(vec3(dirX + rng.range(-0.28, 0.28), Math.abs(dirY) * 0.5 + 0.25, dirZ + rng.range(-0.28, 0.28)));
      const w = Math.max(0.06, Math.min(sx, sz) * rng.range(0.3, 0.54));
      const h = w * rng.range(1.05, 1.5);
      const center = vec3(px + opts.lean * 0.45, py, pz);
      addCloudLeaf(center, n, vec3(0, 1, 0), w, h, rng.range(-0.03, 0.1), rng.range(0.06, 0.16));
      addCloudLeaf(center, normalize(vec3(-n.z, 0.12, n.x)), vec3(0, 1, 0), w * 0.92, h * 0.94, rng.range(-0.02, 0.08), rng.range(0.04, 0.13));
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
      addLeafFill(x, y, z, ubx, uby, ubz, opts.quality === "proxy" ? 12 : 22);
      addLeafPatch(x, y, z, ubx, uby, ubz, opts.quality === "proxy" ? 12 : 22);
    }
    const cbx = rx * 0.44 * opts.leafSize;
    const cby = crownHeight * 0.12 * opts.leafSize;
    const cbz = rz * 0.5 * opts.leafSize;
    addLeafFill(0, crownBase + crownHeight * 0.72, 0, cbx, cby, cbz, opts.quality === "proxy" ? 16 : 30);
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
      addLeafFill(cxp, crownBase + crownHeight * t, czp, clx, cly, clz, opts.quality === "proxy" ? 10 : 18);
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
    addLeafFill(x, y, z, bx, by, bz, opts.quality === "proxy" ? 10 : 20);
    addLeafPatch(x, y, z, bx, by, bz, opts.quality === "proxy" ? 10 : 20);
  }
  return merge(...meshes);
}

function acaciaCrownCloud(recipe: SpeedTreeLibraryRecipe, opts: BroadleafCloudOptions): Mesh {
  if (opts.leafDensity <= 0) return merge();
  const rng = makeRng(recipe.seed + 9311);
  const density = Math.max(0.35, opts.leafDensity);
  const crownBase = recipe.height * opts.crownBasePct;
  const crownHeight = recipe.height * (1 - opts.crownBasePct);
  const rx = opts.crownWidth * 0.5;
  const rz = opts.crownDepth * 0.5;
  const clusters = Math.max(18, Math.round((opts.quality === "proxy" ? 68 : opts.quality === "high" ? 96 : 76) * density));
  const leavesPerCluster = opts.quality === "proxy" ? 18 : opts.quality === "high" ? 28 : 22;
  const leafLen = Math.max(0.085, recipe.height * 0.045 * opts.leafSize);
  const leafWidth = leafLen * 0.34;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const meshes: Mesh[] = [];

  for (let i = 0; i < clusters; i++) {
    const a = i * golden + rng.range(-0.18, 0.18);
    const radial = Math.min(1, Math.sqrt((i + 0.5) / clusters) * rng.range(0.86, 1.04));
    const flatZ = 0.58 + rng.next() * 0.28;
    const x = Math.cos(a) * rx * radial * rng.range(0.78, 1.02);
    const z = Math.sin(a) * rz * radial * flatZ;
    const y = crownBase + crownHeight * (0.62 + (1 - radial) * 0.12 + rng.range(-0.035, 0.04));
    const center = vec3(x + opts.lean * 0.45, y, z);
    const clusterRadius = Math.max(leafLen * 2.2, Math.min(rx, rz) * 0.1 * opts.leafSize);

    for (let j = 0; j < leavesPerCluster; j++) {
      const spreadA = a + rng.range(-1.35, 1.35);
      const out = normalize(vec3(Math.cos(spreadA), rng.range(0.05, 0.28), Math.sin(spreadA) * 0.72));
      const tangent = normalize(vec3(-out.z, rng.range(-0.08, 0.12), out.x));
      const lateral = rng.range(-clusterRadius, clusterRadius);
      const forward = rng.range(-clusterRadius * 0.7, clusterRadius * 0.95);
      const base = add(center, add(scale(out, forward), scale(tangent, lateral)));
      const normal = normalize(vec3(tangent.x * 0.55 + out.x * 0.25, 0.72, tangent.z * 0.55 + out.z * 0.25));
      const up = normalize(vec3(out.x, rng.range(0.18, 0.42), out.z));
      const s = rng.range(0.72, 1.25);
      meshes.push(leafMesh(base, normal, up, leafWidth * s, leafLen * s, {
        shape: "lanceolate",
        segments: 3,
        curl: rng.range(-0.04, 0.08),
        fold: rng.range(0.04, 0.14),
        roundedNormals: true,
      }));
    }
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
  const density = Math.max(0.35, params.leafDensity);
  const meshes: Mesh[] = [];
  const needleRadius = Math.max(0.006, recipe.height * 0.003);
  const addTuft = (x: number, y: number, z: number, out: Vec3, len: number, copies: number) => {
    const count = Math.max(1, Math.round(copies * density));
    const side = normalize(vec3(-out.z, 0, out.x));
    for (let i = 0; i < count; i++) {
      const base = vec3(
        x + params.lean * 0.35 + side.x * rng.range(-len * 0.45, len * 0.45) + out.x * rng.range(-len * 0.18, len * 0.28),
        y + rng.range(-len * 0.28, len * 0.2),
        z + side.z * rng.range(-len * 0.45, len * 0.45) + out.z * rng.range(-len * 0.18, len * 0.28),
      );
      const dir = normalize(vec3(
        out.x + rng.range(-0.22, 0.22),
        out.y + rng.range(-0.16, 0.18),
        out.z + rng.range(-0.22, 0.22),
      ));
      const l = len * rng.range(0.72, 1.25) * params.leafSize;
      meshes.push(needleCluster(base, dir, {
        seed: (rng.next() * 1e9) | 0,
        count: quality === "proxy" ? 9 : 12,
        length: l,
        spread: 0.62,
        radius: needleRadius,
      }));
    }
  };
  if (shape === "column") {
    const count = quality === "proxy" ? 10 : 14;
    const radiusX = recipe.height * 0.12 * params.crownScale;
    const radiusZ = recipe.height * 0.1 * params.crownDepth;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const taper = 0.62 + Math.sin(t * Math.PI) * 0.38;
      const ring = Math.max(10, Math.round((quality === "proxy" ? 16 : 24) * taper * Math.min(1.8, density)));
      for (let j = 0; j < ring; j++) {
        const a = (j / ring) * TAU + rng.range(-0.08, 0.08) + i * 0.37;
        const radial = rng.range(0.45, 1.04);
        const x = Math.cos(a) * radiusX * taper * radial;
        const z = Math.sin(a) * radiusZ * taper * radial;
        const y = recipe.height * (0.1 + t * 0.86) + rng.range(-recipe.height * 0.012, recipe.height * 0.012);
        addTuft(x, y, z, normalize(vec3(Math.cos(a), rng.range(-0.16, 0.12), Math.sin(a))), recipe.height * 0.045, 2);
      }
    }
    return merge(...meshes);
  }

  const tiers = quality === "proxy" ? 8 : 12;
  for (let i = 0; i < tiers; i++) {
    const t = i / Math.max(1, tiers - 1);
    const y = recipe.height * (0.14 + t * 0.8);
    const radius = recipe.height * (0.34 * (1 - t) + 0.05) * params.crownScale;
    const radiusZ = radius * 0.82 * params.crownDepth;
    const ring = Math.max(8, Math.round((quality === "proxy" ? 18 : 26) * (1 - t * 0.45) * Math.min(1.8, density)));
    for (let j = 0; j < ring; j++) {
      const a = (j / ring) * TAU + rng.range(-0.12, 0.12) + i * 0.29;
      const radial = rng.range(0.42, 1.04);
      const x = Math.cos(a) * radius * radial;
      const z = Math.sin(a) * radiusZ * radial;
      const out = normalize(vec3(Math.cos(a), -0.34 + t * 0.18, Math.sin(a)));
      addTuft(x, y + rng.range(-recipe.height * 0.016, recipe.height * 0.016), z, out, recipe.height * (0.042 + 0.052 * (1 - t)), t < 0.9 ? 2 : 1);
    }
  }
  return merge(...meshes);
}

function buildPalm(recipe: SpeedTreeLibraryRecipe, opts: SpeedTreeLibraryBuildOptions): PlantResult {
  const key = recipe.tags.join(" ");
  const p = resolveSpeedTreeLibraryParams(recipe, opts.params);
  const quality = opts.quality ?? "medium";
  const trunkScale = Math.sqrt(Math.max(0.25, p.trunkScale));
  const feather = !(key.includes("fan") || key.includes("palmetto"));
  return palm({
    seed: recipe.seed,
    height: recipe.height,
    trunkRadius: (key.includes("sago") || key.includes("ponytail") ? 0.16 : 0.09) * trunkScale,
    fronds: Math.max(8, Math.round((quality === "proxy" ? 11 : feather ? 15 : 17) * p.branchCount)),
    frondLength: Math.max(recipe.height * 0.42, (key.includes("fan") ? recipe.height * 0.48 : recipe.height * 0.64) * p.crownScale * Math.max(0.9, p.leafSize)),
    leafletPairs: quality === "proxy" ? 24 : 30,
    leafletLength: Math.max(0.42, recipe.height * (feather ? 0.14 : 0.16) * Math.max(0.8, p.leafSize)),
    leafletWidth: Math.max(0.045, recipe.height * 0.018 * Math.max(0.8, p.leafSize)),
    leafletShape: "lanceolate",
    leafletFold: 0.12,
    leafletCurl: feather ? -0.03 : 0.02,
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

interface BarrelCactusShape {
  ribCount: number;
  radialSegments: number;
  verticalSegments: number;
  height: number;
  bottomY: number;
  rx: number;
  rz: number;
}

function barrelCactusShape(
  recipe: SpeedTreeLibraryRecipe,
  params: SpeedTreeLibraryParams,
  quality: SpeedTreeLibraryBuildOptions["quality"] = "medium",
): BarrelCactusShape {
  const height = Math.max(0.45, recipe.height * 0.92);
  const radius = height * 0.38 * params.trunkScale;
  const ribCount = Math.max(12, Math.round((quality === "high" ? 18 : 14) * params.branchCount));
  return {
    ribCount,
    radialSegments: ribCount * (quality === "proxy" ? 4 : 6),
    verticalSegments: quality === "proxy" ? 22 : 30,
    height,
    bottomY: 0,
    rx: radius * params.crownScale,
    rz: radius * params.crownDepth,
  };
}

function barrelVerticalProfile(t: number): number {
  const bottomX = Math.max(0, (0.12 - t) / 0.12);
  const topX = Math.max(0, (t - 0.72) / 0.28);
  const bottom = Math.sqrt(Math.max(0, 1 - bottomX * bottomX));
  const top = Math.sqrt(Math.max(0, 1 - topX * topX));
  return 0.035 + Math.min(bottom, top) * 0.965;
}

function barrelFlute(shape: BarrelCactusShape, a: number): number {
  const wave = Math.cos(shape.ribCount * a);
  const crest = Math.max(0, wave);
  const groove = Math.max(0, -wave);
  return 1 + Math.pow(crest, 1.8) * 0.13 - Math.pow(groove, 1.15) * 0.18;
}

function barrelCactusPoint(shape: BarrelCactusShape, a: number, t: number, outward = 0): Vec3 {
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const r = barrelVerticalProfile(t) * barrelFlute(shape, a);
  return vec3(
    ca * (shape.rx * r + outward),
    shape.bottomY + t * shape.height,
    sa * (shape.rz * r + outward),
  );
}

function barrelCactusStem(recipe: SpeedTreeLibraryRecipe, params: SpeedTreeLibraryParams, quality: SpeedTreeLibraryBuildOptions["quality"]): Mesh {
  const shape = barrelCactusShape(recipe, params, quality);
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];
  const stride = shape.radialSegments + 1;

  for (let y = 0; y <= shape.verticalSegments; y++) {
    const t = y / shape.verticalSegments;
    for (let i = 0; i <= shape.radialSegments; i++) {
      const u = i / shape.radialSegments;
      const a = u * TAU;
      positions.push(barrelCactusPoint(shape, a, t));
      normals.push(normalize(vec3(Math.cos(a), 0.08, Math.sin(a))));
      uvs.push(vec2(u, t));
    }
  }

  for (let y = 0; y < shape.verticalSegments; y++) {
    for (let i = 0; i < shape.radialSegments; i++) {
      const a = y * stride + i;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  const bottomCenter = positions.length;
  positions.push(vec3(0, shape.bottomY, 0));
  normals.push(vec3(0, -1, 0));
  uvs.push(vec2(0.5, 0.5));
  for (let i = 0; i < shape.radialSegments; i++) indices.push(bottomCenter, i, i + 1);

  const topCenter = positions.length;
  const topStart = shape.verticalSegments * stride;
  positions.push(vec3(0, shape.bottomY + shape.height, 0));
  normals.push(vec3(0, 1, 0));
  uvs.push(vec2(0.5, 0.5));
  for (let i = 0; i < shape.radialSegments; i++) indices.push(topCenter, topStart + i + 1, topStart + i);

  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function barrelCactusDetails(
  recipe: SpeedTreeLibraryRecipe,
  params: SpeedTreeLibraryParams,
  quality: SpeedTreeLibraryBuildOptions["quality"] = "medium",
): { ribs: Mesh[]; areoles: Mesh[]; spines: Mesh[] } {
  const shape = barrelCactusShape(recipe, params, quality);
  const ribs: Mesh[] = [];
  const areoles: Mesh[] = [];
  const spines: Mesh[] = [];
  const ribRadius = Math.max(0.005, shape.height * 0.0045);
  const areoleRadius = Math.max(0.012, shape.height * 0.011);
  const spineRadius = Math.max(0.0025, shape.height * 0.0028);
  const spineLen = Math.max(0.06, shape.height * 0.06) * params.leafSize;
  const rows = quality === "proxy" ? 8 : 11;

  for (let i = 0; i < shape.ribCount; i++) {
    const a = (i / shape.ribCount) * TAU;
    const pts: Vec3[] = [];
    for (let j = 0; j <= 16; j++) {
      const t = 0.045 + (j / 16) * 0.89;
      pts.push(barrelCactusPoint(shape, a, t, ribRadius * 1.6));
    }
    ribs.push(sweep(polyline(pts), {
      sides: 4,
      radius: ribRadius,
      radiusAt: (t) => 0.75 + Math.sin(t * Math.PI) * 0.25,
      caps: true,
    }));

    for (let j = 0; j < rows; j++) {
      const t = 0.12 + (j / Math.max(1, rows - 1)) * 0.72;
      const base = barrelCactusPoint(shape, a, t, areoleRadius * 0.55);
      areoles.push(transform(icosphere(areoleRadius, 0), {
        scale: vec3(1, 0.65, 1),
        translate: base,
      }));
      for (const [angleOffset, lift, lenMul] of [[0, 0.06, 1.25], [-0.16, -0.04, 0.86], [0.16, 0.13, 0.86]] as const) {
        const dirA = a + angleOffset;
        const dir = normalize(vec3(Math.cos(dirA), lift, Math.sin(dirA)));
        const start = barrelCactusPoint(shape, a, t, areoleRadius * 1.2);
        const end = add(start, scale(dir, spineLen * lenMul));
        spines.push(sweep(polyline([start, end]), {
          sides: 3,
          radius: spineRadius,
          radiusAt: (u) => 1 - u * 0.88,
          caps: true,
        }));
      }
    }
  }

  const crownY = shape.bottomY + shape.height * 0.965;
  const crownRadius = Math.min(shape.rx, shape.rz) * 0.12;
  for (let i = 0; i < 13; i++) {
    const a = (i / 12) * TAU;
    const r = i === 0 ? 0 : crownRadius * (0.38 + (i % 3) * 0.18);
    areoles.push(transform(icosphere(areoleRadius * 1.75, 0), {
      scale: vec3(1.2, 0.55, 1.2),
      translate: vec3(Math.cos(a) * r, crownY, Math.sin(a) * r),
    }));
  }

  return { ribs, areoles, spines };
}

function columnCactusDetails(
  recipe: SpeedTreeLibraryRecipe,
  params: SpeedTreeLibraryParams,
  quality: SpeedTreeLibraryBuildOptions["quality"] = "medium",
): { ribs: Mesh[]; areoles: Mesh[]; spines: Mesh[] } {
  const ribs: Mesh[] = [];
  const areoles: Mesh[] = [];
  const spines: Mesh[] = [];
  const key = recipe.tags.join(" ");
  const branching = key.includes("cholla") || key.includes("ocotillo");
  const ribCount = Math.max(10, Math.round((quality === "proxy" ? 12 : 16) * Math.sqrt(Math.max(0.35, params.branchCount))));
  const rows = quality === "proxy" ? 8 : 13;
  const radius = (branching ? 0.115 : 0.18) * params.trunkScale;
  const ribRadius = Math.max(0.004, recipe.height * 0.0038);
  const areoleRadius = Math.max(0.009, recipe.height * 0.0065);
  const spineLen = Math.max(0.028, recipe.height * 0.024) * params.leafSize;
  const spineRadius = Math.max(0.0025, recipe.height * 0.0025);
  const point = (a: number, t: number, outward = 0): Vec3 => {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const r = radius * (1 - (branching ? 0.28 : 0.18) * t) + outward;
    return vec3(params.lean * t + ca * r, recipe.height * t, sa * r);
  };

  for (let i = 0; i < ribCount; i++) {
    const a = (i / ribCount) * TAU;
    const pts: Vec3[] = [];
    for (let j = 0; j <= 12; j++) {
      const t = 0.05 + (j / 12) * 0.87;
      pts.push(point(a, t, ribRadius * 1.7));
    }
    ribs.push(sweep(polyline(pts), {
      sides: 4,
      radius: ribRadius,
      radiusAt: (t) => 0.72 + Math.sin(t * Math.PI) * 0.28,
      caps: true,
    }));

    for (let j = 0; j < rows; j++) {
      const rowStep = 0.77 / Math.max(1, rows - 1);
      const jitter = ((((i * 37 + j * 17) % 23) / 22) - 0.5) * rowStep * 0.34;
      const t = Math.max(0.08, Math.min(0.91, 0.11 + j * rowStep + jitter));
      const base = point(a, t, areoleRadius * 0.7);
      areoles.push(transform(icosphere(areoleRadius, 0), {
        scale: vec3(1, 0.7, 1),
        translate: base,
      }));
      for (const [angleOffset, lift, lenMul] of [[0, 0.04, 1.0], [-0.18, 0.12, 0.72], [0.18, -0.04, 0.72]] as const) {
        const dirA = a + angleOffset;
        const dir = normalize(vec3(Math.cos(dirA), lift, Math.sin(dirA)));
        const start = point(a, t, areoleRadius * 1.15);
        spines.push(sweep(polyline([
          start,
          add(start, scale(dir, spineLen * lenMul)),
        ]), {
          sides: 3,
          radius: spineRadius,
          radiusAt: (u) => 1 - u * 0.85,
          caps: true,
        }));
      }
    }
  }

  return { ribs, areoles, spines };
}

interface CactusPad {
  center: Vec3;
  halfWidth: number;
  halfHeight: number;
  halfDepth: number;
  yaw: number;
  roll: number;
}

interface CactusPadJoint {
  center: Vec3;
  scale: Vec3;
  yaw: number;
  roll: number;
}

function rotatePadVector(pad: CactusPad, point: Vec3): Vec3 {
  const cr = Math.cos(pad.roll);
  const sr = Math.sin(pad.roll);
  const cy = Math.cos(pad.yaw);
  const sy = Math.sin(pad.yaw);
  const xYaw = point.x * cy + point.z * sy;
  const zYaw = -point.x * sy + point.z * cy;
  return vec3(xYaw * cr - point.y * sr, xYaw * sr + point.y * cr, zYaw);
}

function cactusPadPoint(pad: CactusPad, point: Vec3): Vec3 {
  return add(pad.center, rotatePadVector(pad, point));
}

function buildCactusPads(
  recipe: SpeedTreeLibraryRecipe,
  params: SpeedTreeLibraryParams,
  quality: SpeedTreeLibraryBuildOptions["quality"] = "medium",
): { stems: Mesh[]; areoles: Mesh[]; spines: Mesh[] } {
  const rng = makeRng(Math.round(params.seed));
  const count = Math.max(1, Math.round(7 * params.branchCount));
  const rootHeight = recipe.height * 0.29 * params.leafSize;
  const root: CactusPad = {
    center: vec3(params.lean * 0.12, rootHeight * 0.86, 0),
    halfWidth: rootHeight * 0.48 * params.crownScale,
    halfHeight: rootHeight,
    halfDepth: rootHeight * 0.13 * params.trunkScale * params.crownDepth,
    yaw: params.branchAngle * Math.PI / 180,
    roll: params.lean * 0.04,
  };
  const pads: CactusPad[] = [root];
  const joints: CactusPadJoint[] = [];

  for (let i = 1; i < count; i++) {
    const parentIndex = Math.floor((i - 1) / 2);
    const parent = pads[Math.min(parentIndex, pads.length - 1)]!;
    const depth = Math.floor(Math.log2(i + 1));
    const side = i % 2 === 0 ? 1 : -1;
    const height = rootHeight * Math.pow(0.84, depth) * rng.range(0.9, 1.08);
    const yaw = parent.yaw + side * rng.range(0.32, 0.6);
    const roll = parent.roll + side * rng.range(0.06, 0.16);
    const pad: CactusPad = {
      center: vec3(0, 0, 0),
      halfWidth: height * rng.range(0.43, 0.5) * params.crownScale,
      halfHeight: height,
      halfDepth: height * rng.range(0.105, 0.14) * params.trunkScale * params.crownDepth,
      yaw,
      roll,
    };
    const attachment = cactusPadPoint(parent, vec3(
      side * parent.halfWidth * rng.range(0.34, 0.56),
      parent.halfHeight * rng.range(0.48, 0.72),
      0,
    ));
    const childContact = rotatePadVector(pad, vec3(0, -pad.halfHeight * 0.62, 0));
    pad.center = add(attachment, scale(childContact, -1));
    const jointRadius = Math.max(0.018, Math.min(parent.halfWidth, pad.halfWidth) * 0.28);
    joints.push({
      center: attachment,
      scale: vec3(jointRadius * 1.35, jointRadius * 0.82, Math.max(parent.halfDepth, pad.halfDepth) * 1.22),
      yaw: (parent.yaw + yaw) * 0.5,
      roll: (parent.roll + roll) * 0.5,
    });
    pads.push(pad);
  }

  const stems: Mesh[] = [];
  const areoles: Mesh[] = [];
  const spines: Mesh[] = [];
  const rows = Math.max(1, Math.round((quality === "proxy" ? 3 : 4) * params.leafDensity));
  const spineLength = Math.max(0.025, recipe.height * 0.018) * params.leafSize;
  const spineRadius = Math.max(0.0015, recipe.height * 0.0015);
  const areoleRadius = Math.max(0.008, recipe.height * 0.006);

  for (const pad of pads) {
    stems.push(transform(icosphere(1, quality === "high" ? 3 : 2), {
      scale: vec3(pad.halfWidth, pad.halfHeight, pad.halfDepth),
      rotate: vec3(0, pad.yaw, pad.roll),
      translate: pad.center,
    }));

    for (let row = 0; row < rows; row++) {
      const v = rows === 1 ? 0 : row / (rows - 1);
      const localY = (v - 0.5) * pad.halfHeight * 1.25;
      const across = row % 2 === 0 ? 2 : 3;
      for (let column = 0; column < across; column++) {
        const u = column / (across - 1);
        const localX = (u - 0.5) * pad.halfWidth * 1.25;
        const ellipse = Math.sqrt(Math.max(0.08,
          1 - (localX * localX) / (pad.halfWidth * pad.halfWidth)
            - (localY * localY) / (pad.halfHeight * pad.halfHeight),
        ));
        for (const face of [-1, 1] as const) {
          const localZ = face * pad.halfDepth * ellipse;
          const base = cactusPadPoint(pad, vec3(localX, localY, localZ));
          const outward = normalize(rotatePadVector(pad, vec3(
            localX / Math.max(0.001, pad.halfWidth) * 0.18,
            localY / Math.max(0.001, pad.halfHeight) * 0.08,
            face,
          )));
          areoles.push(transform(icosphere(areoleRadius, 0), {
            scale: vec3(1, 1, 0.55),
            rotate: vec3(0, pad.yaw, pad.roll),
            translate: base,
          }));
          spines.push(sweep(polyline([base, add(base, scale(outward, spineLength))]), {
            sides: 3,
            radius: spineRadius,
            radiusAt: (t) => 1 - t * 0.88,
            caps: true,
          }));
        }
      }
    }
  }
  for (const joint of joints) {
    stems.push(transform(icosphere(1, quality === "proxy" ? 0 : 1), {
      scale: joint.scale,
      rotate: vec3(0, joint.yaw, joint.roll),
      translate: joint.center,
    }));
  }

  return { stems, areoles, spines };
}

function buildCactusParts(recipe: SpeedTreeLibraryRecipe, opts: SpeedTreeLibraryBuildOptions): NamedPart[] {
  const key = recipe.tags.join(" ");
  const p = resolveSpeedTreeLibraryParams(recipe, opts.params);
  const rng = makeRng(recipe.seed);
  const meshes: Mesh[] = [];
  const ribMeshes: Mesh[] = [];
  const areoleMeshes: Mesh[] = [];
  const spineMeshes: Mesh[] = [];
  if (key.includes("barrel") || (key.includes("easter") && key.includes("cactus"))) {
    meshes.push(barrelCactusStem(recipe, p, opts.quality ?? "medium"));
    const details = barrelCactusDetails(recipe, p, opts.quality ?? "medium");
    ribMeshes.push(...details.ribs);
    areoleMeshes.push(...details.areoles);
    spineMeshes.push(...details.spines);
  } else if (key.includes("prickly") || key.includes("beavertail")) {
    const pads = buildCactusPads(recipe, p, opts.quality ?? "medium");
    meshes.push(...pads.stems);
    areoleMeshes.push(...pads.areoles);
    spineMeshes.push(...pads.spines);
  } else {
    const branching = key.includes("cholla") || key.includes("ocotillo");
    const trunkRadius = (branching ? 0.115 : 0.18) * p.trunkScale;
    const trunkTipRadius = trunkRadius * (branching ? 0.74 : 0.82);
    const trunkTip = vec3(p.lean, recipe.height - trunkTipRadius * 0.9, 0);
    const trunk = sweep(polyline([vec3(0, 0, 0), trunkTip]), {
      sides: branching ? 16 : 14,
      radius: trunkRadius,
      radiusAt: (t) => 1 - (branching ? 0.28 : 0.18) * t,
      caps: false,
    });
    meshes.push(transform(icosphere(1, 1), {
      scale: vec3(trunkRadius, trunkRadius * 0.55, trunkRadius),
      translate: vec3(0, trunkRadius * 0.08, 0),
    }), trunk, transform(icosphere(1, 2), {
      scale: vec3(trunkTipRadius, trunkTipRadius * 1.05, trunkTipRadius),
      translate: trunkTip,
    }));
    const arms = Math.max(0, Math.round((key.includes("saguaro") ? 4 : branching ? 6 : 2) * p.branchCount));
    for (let i = 0; i < arms; i++) {
      const a = i * TAU / arms + rng.next() * 0.4;
      const y = recipe.height * (branching ? 0.22 + rng.next() * 0.55 : 0.34 + rng.next() * 0.28);
      const len = recipe.height * (branching ? 0.12 + rng.next() * 0.18 : 0.2 + rng.next() * 0.12) * p.crownScale;
      const dir = vec3(Math.cos(a), 0, Math.sin(a));
      const lift = recipe.height * (branching ? 0.1 + rng.next() * 0.2 : 0.22);
      const c = bezier(
        vec3(dir.x * trunkRadius * 0.8, y, dir.z * trunkRadius * 0.8),
        vec3(dir.x * len * 0.5, y + recipe.height * 0.04, dir.z * len * 0.5),
        vec3(dir.x * len, y + lift * 0.4, dir.z * len),
        vec3(dir.x * len * (branching ? 1.05 : 0.85), y + lift, dir.z * len * (branching ? 1.05 : 0.85)),
        8,
      );
      const armRadius = (branching ? 0.062 : 0.11) * p.trunkScale;
      const armTipRadius = armRadius * (branching ? 0.68 : 0.75);
      meshes.push(sweep(c, { sides: branching ? 14 : 12, radius: armRadius, radiusAt: (t) => 1 - (branching ? 0.32 : 0.25) * t, caps: false }));
      meshes.push(
        transform(icosphere(1, 1), {
          scale: vec3(armRadius, armRadius * 0.8, armRadius),
          translate: c.points[0]!,
        }),
        transform(icosphere(1, 2), {
          scale: vec3(armTipRadius, armTipRadius * 1.08, armTipRadius),
          translate: c.points[c.points.length - 1]!,
        }),
      );
    }
    const details = columnCactusDetails(recipe, p, opts.quality ?? "medium");
    ribMeshes.push(...details.ribs);
    areoleMeshes.push(...details.areoles);
    spineMeshes.push(...details.spines);
  }
  const stem = merge(...meshes);
  const parts = [part(recipe, "stem", `${recipe.label} 肉质茎`, stem, recipe.foliageColor ?? [0.18, 0.42, 0.2], "foliage", "static")];
  if (ribMeshes.length > 0) {
    parts.push(part(recipe, "ribs", `${recipe.label} 纵肋`, merge(...ribMeshes), recipe.foliageColor ?? [0.18, 0.42, 0.2], "foliage", "static"));
  }
  if (areoleMeshes.length > 0) {
    const areoleColor: [number, number, number] = [0.9, 0.84, 0.62];
    parts.push(part(recipe, "areoles", `${recipe.label} 刺座`, merge(...areoleMeshes), areoleColor, "wood", "static"));
  }
  if (spineMeshes.length > 0) {
    const spineColor: [number, number, number] = [0.86, 0.8, 0.58];
    parts.push(part(recipe, "spines", `${recipe.label} 刺`, merge(...spineMeshes), spineColor, "wood", "static"));
  }
  return parts;
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
  if (recipe.tags.includes("banana")) return buildBananaPlantParts(recipe, opts);
  if (recipe.tags.includes("aloe") || recipe.tags.includes("agave")) return buildRosettePlantParts(recipe, opts);
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

function buildBananaPlantParts(recipe: SpeedTreeLibraryRecipe, opts: SpeedTreeLibraryBuildOptions): NamedPart[] {
  const p = resolveSpeedTreeLibraryParams(recipe, opts.params);
  const rng = makeRng(recipe.seed);
  const trunkScale = Math.sqrt(Math.max(0.25, p.trunkScale));
  const trunkHeight = recipe.height * 0.46;
  const lean = p.lean * 0.28;
  const crown = vec3(lean, trunkHeight, lean * 0.2);
  const trunk = sweep(bezier(
    vec3(0, 0, 0),
    vec3(lean * 0.12, trunkHeight * 0.34, 0),
    vec3(lean * 0.45, trunkHeight * 0.72, lean * 0.12),
    crown,
    8,
  ), {
    sides: 9,
    radius: recipe.height * 0.045 * trunkScale,
    radiusAt: (t) => (1 - 0.32 * t) * (1 + 0.04 * Math.sin(t * 38)),
    caps: true,
  });
  const petioles: Mesh[] = [];
  const leaves: Mesh[] = [];
  const count = Math.max(8, Math.round(14 * p.branchCount));
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + rng.range(-0.12, 0.12);
    const radial = normalize(vec3(Math.cos(a), 0, Math.sin(a)));
    const tier = i % 4;
    const lift = [0.95, 0.68, 0.46, 0.3][tier]! + rng.range(-0.04, 0.05);
    const spread = [0.24, 0.46, 0.72, 0.9][tier]!;
    const dir = normalize(vec3(radial.x * spread, lift, radial.z * spread));
    const len = recipe.height * rng.range(0.58, 0.82) * p.crownScale * Math.max(0.88, p.leafSize);
    const leafBase = add(crown, add(scale(radial, len * 0.12), vec3(0, recipe.height * 0.02, 0)));
    const end = add(crown, scale(dir, len * 0.36));
    const droop = tier === 3 ? recipe.height * rng.range(0.08, 0.14) : recipe.height * rng.range(0.015, 0.06);
    const rachis = bezier(
      crown,
      add(crown, scale(dir, len * 0.16)),
      add(leafBase, vec3(0, -droop * 0.2, 0)),
      add(leafBase, vec3(0, -droop, 0)),
      8,
    );
    petioles.push(sweep(rachis, {
      sides: 4,
      radius: recipe.height * 0.008 * trunkScale,
      radiusAt: (t) => 1 - 0.7 * t,
      caps: false,
    }));
    const leafUp = normalize(vec3(radial.x * spread * 0.5, lift + 0.18, radial.z * spread * 0.5));
    leaves.push(doubleSided(leafMesh(leafBase, broadLeafNormal(radial, 0.16, 0.42), leafUp, len * rng.range(0.32, 0.42), len * rng.range(0.82, 1.04), {
      shape: "round",
      segments: 12,
      curl: tier === 3 ? -0.18 : -0.06,
      fold: 0.2,
      roundedNormals: true,
    })));
  }
  return [
    part(recipe, "stems", `${recipe.label} 假茎`, merge(trunk, ...petioles), recipe.barkColor, "wood"),
    part(recipe, "foliage", `${recipe.label} 大叶`, merge(...leaves), recipe.foliageColor ?? [0.18, 0.48, 0.16], "foliage"),
  ];
}

function buildRosettePlantParts(recipe: SpeedTreeLibraryRecipe, opts: SpeedTreeLibraryBuildOptions): NamedPart[] {
  const p = resolveSpeedTreeLibraryParams(recipe, opts.params);
  const rng = makeRng(recipe.seed);
  const leaves: Mesh[] = [];
  const flowerStems: Mesh[] = [];
  const flowers: Mesh[] = [];
  const count = Math.max(16, Math.round(26 * p.branchCount));
  const lenBase = recipe.height * 0.37 * p.crownScale * Math.max(0.85, p.leafSize);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + rng.range(-0.08, 0.08);
    const radial = normalize(vec3(Math.cos(a), 0, Math.sin(a)));
    const tier = i % 4;
    const lift = [0.34, 0.58, 0.92, 1.22][tier]! + rng.range(-0.03, 0.04);
    const spread = [0.8, 0.62, 0.42, 0.22][tier]!;
    const dir = normalize(vec3(radial.x * spread, lift, radial.z * spread));
    const len = lenBase * rng.range(0.82, 1.2) * [1.12, 1.0, 0.88, 0.72][tier]!;
    const base = vec3(0, recipe.height * 0.03, 0);
    leaves.push(doubleSided(leafMesh(add(base, scale(radial, len * 0.035)), broadLeafNormal(radial, 0.18, 0.34), dir, len * (tier <= 1 ? 0.16 : 0.13), len, {
      shape: "lanceolate",
      segments: 12,
      curl: tier === 0 ? -0.2 : -0.08,
      fold: 0.18,
      roundedNormals: true,
    })));
  }
  const stalkCount = recipe.tags.includes("aloe") ? 2 : 0;
  for (let i = 0; i < stalkCount; i++) {
    const a = i * 2.3 + rng.range(-0.18, 0.18);
    const root = vec3(Math.cos(a) * recipe.height * 0.035, recipe.height * 0.08, Math.sin(a) * recipe.height * 0.035);
    const tip = vec3(Math.cos(a) * recipe.height * 0.08, recipe.height * rng.range(0.82, 0.98), Math.sin(a) * recipe.height * 0.08);
    const stemCurve = bezier(
      root,
      add(root, vec3(0, recipe.height * 0.28, 0)),
      add(tip, vec3(rng.range(-0.035, 0.035), -recipe.height * 0.25, rng.range(-0.035, 0.035))),
      tip,
      7,
    );
    flowerStems.push(sweep(stemCurve, {
      sides: 5,
      radius: recipe.height * 0.007 * Math.sqrt(Math.max(0.25, p.trunkScale)),
      radiusAt: (t) => 1 - 0.68 * t,
      caps: false,
    }));
    for (let j = 0; j < 10; j++) {
      const t = 0.74 + j * 0.025;
      const y = root.y + (tip.y - root.y) * t;
      const r = recipe.height * (0.045 - j * 0.0026);
      const sideA = a + j * 2.4;
      flowers.push(transform(cone(recipe.height * 0.017, recipe.height * 0.07, 6), {
        rotate: vec3(0.45, sideA, 0.2),
        translate: vec3(tip.x + Math.cos(sideA) * r, y, tip.z + Math.sin(sideA) * r),
      }));
    }
  }
  const core = transform(icosphere(recipe.height * 0.007 * Math.sqrt(Math.max(0.25, p.trunkScale)), 1), {
    translate: vec3(0, recipe.height * 0.05, 0),
  });
  const parts = [
    part(recipe, "core", `${recipe.label} 肉质茎`, core, recipe.barkColor, "wood", "static"),
    part(recipe, "foliage", `${recipe.label} 莲座叶`, merge(...leaves), recipe.foliageColor ?? [0.18, 0.48, 0.16], "foliage"),
  ];
  if (flowerStems.length > 0) parts.push(part(recipe, "flower_stems", `${recipe.label} 花梗`, merge(...flowerStems), recipe.barkColor, "wood"));
  if (flowers.length > 0) parts.push(part(recipe, "flowers", `${recipe.label} 花序`, merge(...flowers), recipe.accentColor ?? [0.78, 0.18, 0.06], "foliage"));
  return parts;
}

function leafFacingNormal(dir: Vec3, lift = 0.3): Vec3 {
  return normalize(vec3(-dir.z, lift, dir.x));
}

function broadLeafNormal(radial: Vec3, lift = 0.18, frontBias = 0.35): Vec3 {
  const tangentFacing = normalize(vec3(-radial.z, lift, radial.x));
  return normalize(add(scale(tangentFacing, 1 - frontBias), scale(vec3(0, lift * 0.5, 1), frontBias)));
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

type PlantSurfaceKind = "wood" | "foliage";
type PlantWindKind = PlantSurfaceKind | "static";

function part(
  recipe: SpeedTreeLibraryRecipe,
  name: string,
  label: string,
  mesh: Mesh,
  color: [number, number, number],
  surfaceKind: PlantSurfaceKind,
  windKind: PlantWindKind = surfaceKind,
): NamedPart {
  const out: NamedPart = {
    name,
    label,
    mesh,
    color,
    surface: surfaceKind === "wood"
      ? { type: "bark", params: { color, scale: 1.2 } }
      : { type: "leaf", params: { color } },
    metadata: {
      sourceCategory: recipe.sourceCategory,
      sourceSpecies: recipe.sourceSpecies,
      sourceVariant: recipe.sourceVariant ?? "",
      libraryKind: recipe.kind,
      generator: "meshova-speedtree-library-regenerator",
      method: "name-informed procedural approximation; no source asset copied",
    },
  };
  if (windKind !== "static") {
    out.windWeight = windChannels(mesh, { kind: windKind, seed: recipe.seed + (windKind === "wood" ? 0 : 1) }).combined;
  }
  return out;
}

function inferKind(entry: SpeedTreeLibraryEntry, key: string): SpeedTreeLibraryKind {
  const category = entry.category.toLowerCase();
  const plantKey = `${entry.species} ${entry.variant ?? ""}`
    .replace(/_/g, " ")
    .toLowerCase();
  if (hasAny(plantKey, ["mushroom", "bolete", "fungus"])) return "fungus";
  if (hasAny(plantKey, ["stump", "burnt", "dead", "snag"])) return "stump";
  if (hasAny(plantKey, ["vine", "grape", "kudzu", "ivy"])) return "vine";
  if (hasAny(plantKey, ["cactus", "cholla", "saguaro", "ocotillo", "prickly", "barrel", "beavertail"])) return "cactus";
  if (category.includes("marine") || hasAny(plantKey, ["water", "lotus", "lily", "pond", "coral", "sponge", "hydrilla", "spearhead"])) return "aquatic";
  if (hasAny(plantKey, ["fern"])) return "fern";
  if (hasAny(plantKey, ["grass", "wheat", "corn", "cane", "bamboo", "cattail", "pampas"])) return "grass";
  if (hasAny(plantKey, ["aloe", "dracaena", "banana", "yucca", "joshua", "agave", "elephant ear", "bird of paradise"])) return "plant";
  if (hasAny(plantKey, ["palm", "palmetto", "coconut", "date", "sago"])) return "palm";
  if (category.includes("conifer") || hasAny(plantKey, ["pine", "spruce", "fir", "cedar", "cypress", "juniper", "redwood", "christmas"])) return "conifer";
  if (hasAny(plantKey, ["boxwood", "holly", "azalea", "hawthorn", "hazel", "sagebrush", "elder", "manzanita", "hedge", "bush", "shrub"])) return "shrub";
  if (hasAny(plantKey, ["rose", "flower", "marigold", "sunflower", "lily", "knapweed", "spirea", "tobacco", "tomato"])) return "flower";
  if (category.includes("shrubs")) return "shrub";
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
