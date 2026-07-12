const ORGANIC_PATTERN = /\b(?:animal|branch|coral|food|fruit|log|moss|plant|rock|root|terrain|tree|vegetation)\b/i;
const TEXTURE_DEPENDENT_PATTERN = /\b(?:book|cardboard|cloth|garment|newspaper|paper|poster|rug|towel)\b/i;

const FAMILY_RULES = [
  ["industrial-pipes", /\b(?:modular|industrial)[ _-]?(?:airduct|pipes?)\b/i],
  ["deadwood", /\b(?:dead[ _-]?(?:tree[ _-]?)?trunk|deadwood|dry[ _-]?branches?|fallen[ _-]?logs?)\b/i],
  ["rock", /\b(?:boulder|cliff|rock|stone)[ _-]?\d*\b/i],
  ["fire-hydrant", /\bfire[ _-]?hydrant\b/i],
  ["fire-pit", /\bfire[ _-]?pit\b/i],
  ["watering-can", /\bwatering[ _-]?can\b/i],
  ["hand-drill", /\b(?:vintage[ _-]?)?hand[ _-]?drill\b/i],
  ["wheelchair", /\bwheelchair\b/i],
  ["hose-reel", /\b(?:garden[ _-]?)?hose[ _-]?(?:reel|wall[ _-]?mounted)\b/i],
  ["drill-press", /\b(?:drill[ _-]?press|bench[ _-]?drill)\b/i],
  ["multimeter", /\b(?:analog[ _-]?)?multimeter\b/i],
  ["portable-generator", /\bportable[ _-]?generator\b/i],
  ["overhead-crane", /\b(?:overhead|bridge|workshop)[ _-]?crane\b/i],
  ["microscope", /\bmicroscope\b/i],
  ["film-projector", /\b(?:film(?:strip)?|movie|8mm)[ _-]?projector\b/i],
  ["power-pole", /\b(?:power|electricity|utility)[ _-]?poles?\b/i],
  ["spinning-wheel", /\bspinning[ _-]?wheel\b/i],
  ["aircon-unit", /\b(?:aircon|air[ _-]?condition(?:er|ing)|hvac)[ _-]?(?:outdoor[ _-]?)?units?\b/i],
  ["hand-plane", /\b(?:smoothing[ _-]?)?hand[ _-]?plane\b/i],
  ["surveillance-camera", /\b(?:security|surveillance)[ _-]?camera\b/i],
  ["camera", /\b(?:camera|camcorder)\b/i],
  ["coffee-cart", /\bcoffee[ _-]?cart\b/i],
  ["chess-set", /\bchess[ _-]?set\b/i],
  ["cannon", /\bcannon\b/i],
  ["clock", /\b(?:grandfather|mantel|wall)[ _-]?clock\b/i],
  ["power-drill", /\b(?:cordless[ _-]?)?(?:power[ _-]?)?drill\b/i],
  ["pier", /\b(?:wooden[ _-]?)?(?:pier|dock)\b/i],
  ["fence", /\b(?:chain[ _-]?link[ _-]?)?fence\b/i],
  ["desk-lamp", /\bdesk[ _-]?lamp\b/i],
  ["tool-storage", /\btool[ _-]?(?:chest|box|cart)\b/i],
  ["cassette-player", /\bcassette[ _-]?(?:player|recorder)\b/i],
  ["dartboard", /\bdartboard\b/i],
  ["fire-extinguisher", /\bfire[ _-]?extinguisher\b/i],
  ["payphone", /\b(?:public[ _-]?)?payphone\b/i],
  ["fire-escape", /\bfire[ _-]?escape\b/i],
  ["chalkboard", /\bchalkboard\b/i],
  ["ceiling-fan", /\bceiling[ _-]?fan\b/i],
  ["facade-kit", /\b(?:modular[ _-]?)?.*[ _-]?facade\b/i],
  ["roller-shutter", /\broller[ _-]?shutters?\b/i],
  ["compressor", /\bcompressors?\b/i],
  ["ladder", /\bladder\b/i],
  ["measuring-tape", /\bmeasuring[ _-]?tape\b/i],
  ["lightbulb", /\b(?:incandescent[ _-]?)?(?:light[ _-]?)?bulbs?\b/i],
  ["pendant-lamp", /\b(?:ceiling|pendant)[ _-]?(?:lamp|lights?)\b/i],
  ["magnifying-glass", /\bmagnifying[ _-]?glass\b/i],
  ["spade", /\b(?:spades?|shovels?)\b/i],
  ["saw", /\b(?:hand[ _-]?saws?|hack[ _-]?saws?)\b/i],
  ["hand-truck", /\bhand[ _-]?truck\b/i],
  ["laptop", /\blaptop\b/i],
  ["wicker-basket", /\b(?:wicker[ _-]?)?basket\b/i],
  ["oil-can", /\boil[ _-]?can\b/i],
  ["utility-box", /\butility[ _-]?box\b/i],
  ["traffic-sign", /\b(?:traffic|wet floor|road)[ _-]?sign\b/i],
  ["trash-can", /\b(?:trash|garbage)[ _-]?(?:can|bin)\b/i],
  ["tree-stump", /\b(?:tree[ _-]?)?stump\b/i],
  ["cement-bag", /\bcement[ _-]?bag\b/i],
  ["adjustable-wrench", /\badjustable[ _-]?wrench\b/i],
  ["wrench", /\bwrench\b/i],
  ["pliers", /\bpliers?\b/i],
  ["vice", /\b(?:bench[ _-]?)?vi[cs]e\b/i],
  ["sledgehammer", /\bsledgehammer\b/i],
  ["screwdriver", /\bscrewdriver\b/i],
  ["flashlight", /\bflashlight\b/i],
  ["binoculars", /\bbinoculars?\b/i],
  ["boombox", /\bboombox\b/i],
  ["megaphone", /\bmegaphone\b/i],
  ["lantern", /\b(?:lantern|oil lamp)\b/i],
  ["axe", /\baxe\b/i],
  ["hammer", /\bhammer\b/i],
  ["television", /\btelevision\b/i],
  ["mailbox", /\bmailbox\b/i],
  ["bollard", /\bbollard\b/i],
  ["planter", /\bplanter\b/i],
  ["bottle", /\bbottle\b/i],
  ["vase", /\bvase\b/i],
  ["barrel", /\b(?:barrel|drum)\b/i],
  ["crate", /\bcrate\b/i],
  ["chest", /\bchest\b/i],
  ["shelf", /\b(?:shelf|shelves|bookcase)\b/i],
  ["cabinet", /\b(?:cabinet|commode|drawer|nightstand|sideboard|wardrobe)\b/i],
  ["chair", /\b(?:chair|stool|ottoman)\b/i],
  ["sofa", /\b(?:sofa|couch)\b/i],
  ["table", /\b(?:table|desk|console)\b/i],
  ["bench", /\bbench\b/i],
  ["bed", /\bbed\b/i],
  ["door", /\bdoor\b/i],
  ["window", /\bwindow\b/i],
  ["pot", /\bpot\b/i],
  ["sink", /\bsink\b/i],
  ["stove", /\b(?:stove|heater)\b/i],
  ["toilet", /\btoilet\b/i],
  ["bathtub", /\b(?:bathtub|bath tub)\b/i],
];

export const DEFAULT_REPRESENTED_FAMILIES = new Set([
  "adjustable-wrench", "axe", "barrel", "bathtub", "bed", "bench", "binoculars", "bollard", "boombox", "bottle", "cabinet",
  "cement-bag", "chair", "chest", "crate", "door", "fire-hydrant", "flashlight",
  "fire-pit", "hammer", "industrial-pipes", "deadwood", "lantern", "rock", "mailbox", "megaphone", "oil-can", "planter", "pliers", "pot", "screwdriver", "shelf", "sink", "sofa",
  "stove", "table", "television", "toilet", "traffic-sign", "trash-can",
  "tree-stump", "utility-box", "vase", "vice", "watering-can", "wicker-basket", "window",
  "wrench", "sledgehammer",
  "hand-drill", "wheelchair", "hose-reel", "drill-press", "multimeter", "portable-generator",
  "overhead-crane", "microscope", "film-projector", "power-pole", "spinning-wheel", "aircon-unit", "hand-plane",
  "clock", "power-drill", "surveillance-camera", "tool-storage", "fire-escape", "camera", "pier", "fence",
  "facade-kit", "cassette-player", "hand-truck", "fire-extinguisher", "dartboard",
  "roller-shutter", "compressor", "ladder", "measuring-tape", "lightbulb", "pendant-lamp", "chalkboard", "spade", "saw",
  "magnifying-glass",
]);

function assetText(id, asset) {
  return `${id} ${asset.name ?? ""} ${asset.category ?? ""} ${(asset.tags ?? []).join(" ")}`;
}

export function extractReplicatedAssetIds(source) {
  const ids = new Set();
  for (const match of source.matchAll(/sourceAssetId:\s*["']([^"']+)["']/g)) {
    ids.add(match[1]);
  }
  return ids;
}

export function proceduralFamily(id, asset) {
  const primaryText = `${id} ${asset.name ?? ""} ${asset.category ?? ""}`;
  return FAMILY_RULES.find(([, pattern]) => pattern.test(primaryText))?.[0] ?? "other";
}

function suitability(id, asset, family) {
  const text = assetText(id, asset);
  let score = 50;
  if (/Architecture|Tools & Equipment|Industrial & Infrastructure|Lighting|Electronics & Appliances/i.test(asset.category ?? "")) score += 15;
  if (["adjustable-wrench", "axe", "binoculars", "boombox", "drill-press", "flashlight", "hand-drill", "hammer", "hose-reel", "lantern", "megaphone", "multimeter", "oil-can", "pliers", "portable-generator", "screwdriver", "sledgehammer", "utility-box", "vice", "watering-can", "wheelchair", "wrench"].includes(family)) score += 20;
  if (asset.polycount > 0 && asset.polycount <= 15000) score += 10;
  if (Array.isArray(asset.dimensions) && asset.dimensions.length === 3 && asset.dimensions.every((value) => value > 0)) score += 10;
  if (TEXTURE_DEPENDENT_PATTERN.test(text)) score -= 20;
  return Math.max(0, Math.min(100, score));
}

export function selectPolyHavenCandidates(assets, options = {}) {
  const replicatedAssetIds = options.replicatedAssetIds ?? new Set();
  const representedFamilies = options.representedFamilies ?? DEFAULT_REPRESENTED_FAMILIES;
  const minScore = options.minScore ?? 65;
  const candidates = [];
  const excluded = [];

  for (const [id, asset] of Object.entries(assets)) {
    const text = assetText(id, asset);
    if (replicatedAssetIds.has(id)) {
      excluded.push({ id, reason: "already-replicated" });
      continue;
    }
    if (ORGANIC_PATTERN.test(text)) {
      excluded.push({ id, reason: "non-procedural-organic" });
      continue;
    }
    const family = proceduralFamily(id, asset);
    if (representedFamilies.has(family)) {
      excluded.push({ id, reason: "family-already-covered", family });
      continue;
    }
    const proceduralSuitability = suitability(id, asset, family);
    if (proceduralSuitability < minScore) {
      excluded.push({ id, reason: "low-procedural-suitability", family, proceduralSuitability });
      continue;
    }
    candidates.push({
      id,
      name: asset.name,
      category: asset.category,
      tags: asset.tags ?? [],
      materials: asset.attributes?.material ?? [],
      condition: asset.attributes?.condition ?? null,
      dimensionsMm: asset.dimensions ?? null,
      polycount: asset.polycount ?? null,
      downloadCount: asset.download_count ?? 0,
      sourceUrl: `https://polyhaven.com/a/${id}`,
      thumbnailUrl: asset.thumbnail_url,
      proceduralFamily: family,
      proceduralSuitability,
    });
  }

  candidates.sort((left, right) =>
    right.proceduralSuitability - left.proceduralSuitability
    || right.downloadCount - left.downloadCount
    || left.name.localeCompare(right.name));
  return { candidates, excluded };
}

export function takeDiverseCandidates(candidates, limit, perFamily = 2) {
  const selected = [];
  const familyCounts = new Map();
  for (const candidate of candidates) {
    const family = candidate.proceduralFamily;
    const count = familyCounts.get(family) ?? 0;
    if (count >= perFamily) continue;
    selected.push(candidate);
    familyCounts.set(family, count + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}
