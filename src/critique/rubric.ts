/**
 * Realism rubrics — per-category common-sense checklists the C-tier critic
 * uses to judge whether a model matches how the real object is built. These
 * are data, not code, so the standard can iterate without touching logic:
 * add a category, tweak proportion ranges, extend the checklist.
 *
 * A rubric is intentionally coarse. It encodes structural facts ("a chair has
 * a seat and legs", "wheels sit on the ground") and rough proportion envelopes,
 * not exact dimensions. It feeds both the deterministic proportion check and
 * the VLM realism prompt.
 */

export interface ProportionRange {
  /** Which bbox ratio, e.g. "height/width". */
  ratio: "h/w" | "h/d" | "w/d";
  min: number;
  max: number;
  /** Human phrasing used in feedback when out of range. */
  note: string;
}

export interface MotionPolicy {
  /** Whether viewer wind/sway weights are allowed for this object category. */
  allowWind: boolean;
  /**
   * Part names/roles that may carry wind weights when allowWind is true.
   * Omitted/empty means all parts in this category may carry wind.
   */
  allowedWindParts?: string[];
  /** Human-readable reason used in critique feedback. */
  note: string;
}

export interface Rubric {
  category: string;
  /** Aliases that map a free-text goal to this rubric. */
  aliases: string[];
  /** Expected structural parts (by role) the model should contain. */
  expectedParts: string[];
  /** Expected parts that are category-defining; missing them blocks passing. */
  hardExpectedParts?: string[];
  /**
   * Alternate names a part may carry for a given role, so "canopy" satisfies
   * "foliage" and "cockpit" satisfies "cabin". Role -> accepted synonyms.
   */
  partSynonyms?: Record<string, string[]>;
  /** Rough overall proportion envelope. */
  proportions: ProportionRange[];
  /** Common-sense checks phrased for a VLM to answer yes/no. */
  checklist: string[];
  /** Typical count expectations, e.g. { leg: [4,4] } means exactly 4 legs. */
  counts?: Record<string, [number, number]>;
  /**
   * Category-specific expected height range in world units. Overrides the
   * generic scale sanity range — a lamppost or a tree is legitimately tall.
   */
  heightRange?: [number, number];
  /**
   * The object is meant to hold liquid/contents, so its container part(s) must
   * be sealed (no gaps between planks/panels). Triggers the assembly-level seal
   * test. `sealParts` names which parts are the vessel (default: any part named
   * like a tank/barrel/body). It's a functional-plausibility check: a water
   * tower whose staves have gaps would leak.
   */
  mustBeSealed?: boolean;
  /** Which part names/roles are the sealed vessel (regex-tested by name). */
  sealParts?: string[];
  /** Object has a human/vehicle access route that must connect and stay clear. */
  requiresAccessPath?: boolean;
  /**
   * Skip assembly connectivity (floating-part) checks. Scatter-based models
   * (grass clusters, forests, debris fields, crowds) legitimately have many
   * separated pieces, so the gap check would false-positive.
   */
  allowDetachedParts?: boolean;
  /** Category-level rule for semantic animation plausibility. */
  motionPolicy?: MotionPolicy;
  /**
   * Max single-part size as a fraction of the whole-assembly diagonal. A leaf
   * or a bolt far bigger than this relative to the plant/machine is wrong.
   * Default 0.9 (a part may be most of the model, e.g. a car body).
   */
  maxPartSizeRatio?: number;
}

export const RUBRICS: Rubric[] = [
  {
    category: "chair",
    aliases: ["chair", "stool", "seat", "armchair", "dining chair"],
    expectedParts: ["seat", "leg", "back"],
    proportions: [
      { ratio: "h/w", min: 0.9, max: 2.2, note: "a chair is taller than it is wide, but not a tower" },
    ],
    checklist: [
      "Does it have a flat seat surface at a plausible sitting height?",
      "Are the legs the same length so it stands level?",
      "Is there a backrest rising above the seat?",
      "Do the legs reach the ground plane without floating or sinking?",
    ],
    counts: { leg: [3, 4] },
    motionPolicy: {
      allowWind: false,
      note: "chairs are rigid props; viewer wind/sway animation should not be attached",
    },
  },
  {
    category: "table",
    aliases: ["table", "desk", "workbench"],
    expectedParts: ["top", "leg"],
    proportions: [
      { ratio: "h/w", min: 0.3, max: 1.1, note: "a table is wider than it is tall" },
    ],
    checklist: [
      "Is there a flat horizontal top?",
      "Are the legs equal length and vertical?",
      "Is the top supported at its corners or edges, not floating?",
    ],
    counts: { leg: [3, 4] },
    motionPolicy: {
      allowWind: false,
      note: "tables are rigid props; viewer wind/sway animation should not be attached",
    },
  },
  {
    category: "car",
    aliases: ["car", "vehicle", "sedan", "automobile", "truck", "suv"],
    expectedParts: ["body", "wheel", "cabin"],
    partSynonyms: {
      body: ["body", "chassis", "shell", "hull", "frame", "bodywork"],
      wheel: ["wheel", "tire", "tyre", "rim"],
      cabin: ["cabin", "cockpit", "greenhouse", "canopy", "roof", "cab", "windshield", "windscreen"],
    },
    proportions: [
      { ratio: "w/d", min: 0.3, max: 0.75, note: "a car is much longer than it is wide" },
      { ratio: "h/d", min: 0.2, max: 0.6, note: "a car is low relative to its length" },
    ],
    checklist: [
      "Are there four wheels, evenly placed front and rear?",
      "Do all wheels touch the ground at the same level?",
      "Is the cabin/greenhouse set on top of the body, not beside it?",
      "Is the body a single continuous volume, not fragmented?",
    ],
    counts: { wheel: [4, 4] },
    motionPolicy: {
      allowWind: false,
      note: "vehicles need explicit mechanical/rig animation, not vegetation wind sway",
    },
  },
  {
    category: "tree",
    aliases: [
      "tree", "bush", "shrub", "plant", "broadleaf", "broadleaves", "conifer", "conifers", "palm",
      "acacia", "oak", "maple", "birch", "willow", "pine", "spruce", "cedar", "cypress",
      "baobab", "beech", "olive", "cherry", "aspen", "boxwood",
    ],
    expectedParts: ["trunk", "foliage"],
    partSynonyms: {
      trunk: ["trunk", "stem", "wood", "bole", "flare", "stump", "log", "branch", "rachis"],
      foliage: ["foliage", "canopy", "crown", "leaves", "leaf", "leafage", "frond", "needle", "needles"],
    },
    proportions: [
      { ratio: "h/w", min: 0.7, max: 3.0, note: "a tree is generally taller than wide" },
    ],
    checklist: [
      "Is there a trunk narrower than the crown?",
      "Does the foliage sit above and around the trunk top?",
      "Is the trunk rooted at the ground, not floating?",
    ],
    heightRange: [0.3, 12],
    motionPolicy: {
      allowWind: true,
      allowedWindParts: [
        "wood", "trunk", "branch", "bough", "twig", "stem", "stalk", "foliage", "canopy", "crown",
        "leaf", "leaves", "needle", "frond",
      ],
      note: "trees may use rooted wind sway on flexible wood/foliage; the base should stay anchored",
    },
  },
  {
    category: "cactus",
    aliases: [
      "cactus", "cacti", "saguaro", "barrel cactus", "barrel-cactus",
      "prickly pear", "prickly-pear", "cholla", "beavertail", "ocotillo",
    ],
    expectedParts: ["stem", "spine"],
    hardExpectedParts: ["stem", "spine"],
    partSynonyms: {
      stem: ["stem", "trunk", "body", "fleshy stem", "succulent stem", "肉质茎"],
      spine: ["spine", "spines", "thorn", "thorns", "areole", "刺"],
    },
    proportions: [
      { ratio: "h/w", min: 0.8, max: 5.5, note: "a cactus has a readable upright succulent body" },
    ],
    checklist: [
      "Is there a fleshy green stem or pad body?",
      "Are spines/thorns or areoles visible on the surface?",
      "For barrel cactus, are vertical ribs/grooves visible rather than a smooth egg?",
      "Does it rest on the ground without floating?",
    ],
    heightRange: [0.2, 6],
    motionPolicy: {
      allowWind: false,
      note: "cactus stems, ribs, areoles and spines are rigid succulent structure; they should not float or sway like leaves",
    },
  },
  {
    category: "bottle",
    aliases: ["bottle", "vase", "flask", "jar"],
    expectedParts: ["body", "neck"],
    partSynonyms: {
      body: ["body", "belly", "barrel", "tank"],
      neck: ["neck", "mouth", "spout", "top"],
    },
    proportions: [
      { ratio: "h/w", min: 1.3, max: 4.0, note: "a bottle is clearly taller than wide" },
    ],
    checklist: [
      "Is there a wider body tapering to a narrower neck?",
      "Is it radially symmetric around the vertical axis?",
      "Does it have a flat base to stand on?",
    ],
    mustBeSealed: true,
    sealParts: ["body", "belly", "barrel", "tank"],
    motionPolicy: {
      allowWind: false,
      note: "bottles and vessels are rigid props; viewer wind/sway animation should not be attached",
    },
  },
  {
    category: "water-tower",
    aliases: ["water tower", "water tank", "storage tank", "cistern", "silo", "tank"],
    expectedParts: ["tank", "support"],
    hardExpectedParts: ["tank", "support"],
    partSynonyms: {
      tank: ["tank", "barrel", "cistern", "drum", "vessel", "body"],
      support: ["support", "leg", "frame", "stand", "structure", "truss"],
    },
    proportions: [
      { ratio: "h/w", min: 0.8, max: 4.0, note: "a water tower is taller than wide" },
    ],
    checklist: [
      "Is the tank a closed vessel (no visible gaps between staves/panels)?",
      "Does the support frame reach the ground and stand level?",
      "Is the roof/lid fully covering the tank top?",
    ],
    heightRange: [0.5, 20],
    mustBeSealed: true,
    sealParts: ["tank", "barrel", "cistern", "drum", "vessel"],
    motionPolicy: {
      allowWind: false,
      note: "water towers are rigid structures; viewer wind/sway animation should not be attached",
    },
  },
  {
    category: "fire-escape",
    aliases: ["fire escape", "fire-escape", "escape stair", "消防逃生梯", "逃生梯"],
    expectedParts: ["platform", "railing", "stair"],
    partSynonyms: {
      platform: ["platform", "landing", "deck"],
      railing: ["railing", "rail", "guard", "baluster"],
      stair: ["stair", "stairs", "step", "steps", "tread", "ladder"],
    },
    proportions: [
      { ratio: "h/w", min: 1.0, max: 10.0, note: "a fire escape is a tall, narrow wall-mounted access structure" },
    ],
    checklist: [
      "Does every landing connect to the next by stairs or a ladder?",
      "Does each stair/ladder arrive at a clear landing opening instead of a closed railing?",
      "Are guardrails present around landings but cut away at access gates?",
      "Is the climb angle plausible for stairs/ship ladder/rungs, not a decorative diagonal bar?",
    ],
    heightRange: [2, 35],
    requiresAccessPath: true,
    motionPolicy: {
      allowWind: false,
      note: "fire escapes are rigid architecture; viewer wind/sway animation should not be attached",
    },
  },
  {
    category: "lamp",
    aliases: ["lamp", "lamppost", "street lamp", "streetlight", "desk lamp", "floor lamp", "light"],
    expectedParts: ["base", "stem", "shade"],
    partSynonyms: {
      base: ["base", "foot", "pedestal", "plinth", "footing"],
      stem: ["stem", "pole", "post", "column", "mast", "shaft", "stand"],
      shade: ["shade", "head", "lantern", "lamp", "luminaire", "fixture", "lens", "bulb", "arm"],
    },
    proportions: [
      { ratio: "h/w", min: 1.0, max: 12.0, note: "a lamp/lamppost is taller than wide" },
    ],
    checklist: [
      "Is there a stable base at the bottom?",
      "Does a stem rise from the base to a shade/head?",
      "Is the whole thing balanced over its base so it would not tip?",
    ],
    heightRange: [0.3, 10],
    motionPolicy: {
      allowWind: false,
      note: "lamps are rigid props; viewer wind/sway animation should not be attached",
    },
  },
  {
    category: "settlement",
    aliases: [
      "settlement", "village", "town", "city block", "cityblock", "city-block",
      "city district", "district", "street block", "mountain village", "mountain-village",
      "山村", "聚落", "街区", "城区",
    ],
    expectedParts: ["ground", "road", "building"],
    hardExpectedParts: ["ground", "road", "building"],
    partSynonyms: {
      ground: ["ground", "terrain", "land", "plateau", "field", "地形", "地面", "沙地地形"],
      road: ["road", "roads", "street", "streets", "lane", "path", "track", "sidewalk", "道路", "山路", "街道"],
      building: ["building", "buildings", "house", "houses", "hut", "walls", "facade", "roof", "roofs", "建筑", "房屋", "屋顶"],
    },
    proportions: [
      { ratio: "h/w", min: 0.02, max: 1.2, note: "a settlement is a broad scene, not a single tall object" },
      { ratio: "h/d", min: 0.02, max: 1.2, note: "a settlement should spread across the ground plane" },
      { ratio: "w/d", min: 0.35, max: 2.8, note: "a settlement footprint should not collapse into a thin strip" },
    ],
    checklist: [
      "Do buildings sit beside roads instead of on top of road surfaces?",
      "Is there readable spacing between buildings, not a packed blob?",
      "Do repeated houses vary in footprint, height, rotation, color, or facade detail?",
      "Are roads connected and visible as circulation, not hidden under buildings?",
    ],
    allowDetachedParts: true,
    motionPolicy: {
      allowWind: true,
      allowedWindParts: [
        "tree", "wood", "trunk", "branch", "stem", "foliage", "leaf", "leaves", "grass", "shrub",
        "bush", "vine", "flag", "banner", "cloth", "fabric", "curtain", "water", "wave",
      ],
      note: "settlements may animate only flexible vegetation, cloth/flags, or water surfaces; buildings/roads stay static",
    },
  },
];

/** Generic fallback rubric when the goal matches no known category. */
export const GENERIC_RUBRIC: Rubric = {
  category: "generic",
  aliases: [],
  expectedParts: [],
  proportions: [],
  checklist: [
    "Are the proportions believable for the intended object?",
    "Do the parts connect sensibly without floating or intersecting wrongly?",
    "Is the silhouette readable and recognizable from a normal viewing angle?",
    "Is the object stable, i.e. it would rest on the ground without tipping?",
  ],
};

/** Escape a string for safe use inside a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Pick the rubric whose aliases best match a free-text goal. Aliases are
 * matched on WORD BOUNDARIES, so "cartoon" no longer matches "car" and
 * "seatback" doesn't spuriously match "seat". The longest matching alias wins.
 */
export function rubricForGoal(goal: string): Rubric {
  const g = goal.toLowerCase().replace(/[_-]+/g, " ");
  let best: Rubric | null = null;
  let bestLen = 0;
  for (const r of RUBRICS) {
    for (const alias of r.aliases) {
      const aliasPattern = escapeRe(alias).replace(/\s+/g, "[\\s_-]+");
      const re = new RegExp(`\\b${aliasPattern}\\b`);
      if (re.test(g) && alias.length > bestLen) {
        best = r;
        bestLen = alias.length;
      }
    }
  }
  return best ?? GENERIC_RUBRIC;
}
