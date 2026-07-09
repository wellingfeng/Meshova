#!/usr/bin/env node
/**
 * SPM feature extractor.
 *
 * A SpeedTree .spm file is a gzip-compressed SpeedTree XML document. This
 * reader decompresses it with Node's built-in zlib (no SDK, no Modeler, no
 * reverse engineering of proprietary binary formats) and extracts only
 * STRUCTURAL STATISTICS: per-level generator params, instance counts, overall
 * scale. These become a fitting target for Meshova's own procedural tree DSL.
 *
 * It never copies SpeedTree geometry, textures, or ships .spm at runtime. The
 * output is a small JSON "TreeFeature" describing proportions and branch
 * statistics, which Meshova maps onto its native `tree()` authoring params.
 */
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

/** Decompress a .spm buffer into its XML string. Returns null if not gzip XML. */
export function spmToXml(buf) {
  if (buf.length < 3 || buf[0] !== 0x1f || buf[1] !== 0x8b) return null;
  let xml;
  try {
    xml = gunzipSync(buf).toString("utf8");
  } catch {
    return null; // truncated or non-standard gzip variant (e.g. some Desktop LODs)
  }
  return /<SpeedTree\b/.test(xml.slice(0, 200)) ? xml : null;
}

/** Read the first <Value> under a named <Property> inside an XML fragment. */
function propValue(body, name) {
  const key = `<Name>${name}</Name>`;
  const idx = body.indexOf(key);
  if (idx < 0) return undefined;
  const m = body.slice(idx, idx + 160).match(/<Value>([^<]*)<\/Value>/);
  return m ? m[1] : undefined;
}

function propNum(body, name, fallback) {
  const v = propValue(body, name);
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function propVariance(body, name) {
  const key = `<Name>${name}</Name>`;
  const idx = body.indexOf(key);
  if (idx < 0) return 0;
  const m = body.slice(idx, idx + 220).match(/<Variance>([^<]*)<\/Variance>/);
  return m ? Number(m[1]) || 0 : 0;
}

/**
 * Parse all <Generator> blocks with their level, type, name, GUID, and key
 * geometry params. Also counts <Node> instances per generator GUID, which
 * gives real branch counts per level.
 */
export function parseGenerators(xml) {
  const gens = [];
  const genRe = /<Generator Type="([^"]+)">([\s\S]*?)(?=<Generator Type=|<\/Generators>)/g;
  let m;
  while ((m = genRe.exec(xml))) {
    const type = m[1];
    const body = m[2];
    const guid = (body.match(/<GUID>([^<]+)<\/GUID>/) || [])[1] || "";
    const name = (body.match(/<Name>([^<]+)<\/Name>/) || [])[1] || "";
    const level = Number((body.match(/<Level>(\d+)<\/Level>/) || [])[1] ?? -1);
    gens.push({
      type, name, guid, level,
      spineLength: propNum(body, "Spine:Length", undefined),
      spineLengthVar: propVariance(body, "Spine:Length"),
      startAngle: propNum(body, "Spine:Start angle", undefined),
      breakChance: propNum(body, "Spine:Break chance", undefined),
      bifChance: propNum(body, "Bifurcation:Chance", undefined),
      bifLeftAngle: propNum(body, "Bifurcation:Left angle", undefined),
      flareNumber: propNum(body, "Branch:Flares:Number", undefined),
      leafSize: propNum(body, "Leaves:Size", undefined),
      leafAspect: propNum(body, "Cards:Aspect ratio", undefined),
      placeAngle: propNum(body, "Placement:Angle", undefined),
      placeDistance: propNum(body, "Placement:Distance", undefined),
      placeSpread: propNum(body, "Placement:Spread scalar", undefined),
    });
  }
  // Count node instances per generator GUID.
  const counts = {};
  for (const nm of xml.matchAll(/<GeneratorGUID>([^<]+)<\/GeneratorGUID>/g)) {
    counts[nm[1]] = (counts[nm[1]] || 0) + 1;
  }
  for (const g of gens) g.instances = counts[g.guid] || 0;
  return gens;
}

/** Overall bounding extents (Length control points give trunk height hints). */
function overallScale(gens) {
  const trunk = gens.find((g) => g.level === 1 && g.type === "Spine")
    || gens.find((g) => g.type === "Spine");
  return trunk?.spineLength ?? 10;
}

/**
 * Build a compact TreeFeature: normalized proportions + per-level branch
 * statistics that Meshova can map onto its tree() authoring levels.
 */
export function extractTreeFeature(buf, meta = {}) {
  const xml = spmToXml(buf);
  if (!xml) return null;
  const gens = parseGenerators(xml);
  const trunkLen = overallScale(gens);

  // Spine generators sorted by level = branch hierarchy.
  const spines = gens.filter((g) => g.type === "Spine").sort((a, b) => a.level - b.level);
  const leaf = gens.find((g) => g.type === "Leaf");
  const frond = gens.find((g) => g.type === "Frond");

  // Per-level: real instance count is children-per-parent aggregate.
  const levels = spines.map((g, i) => {
    const parentInstances = i === 0 ? 1 : (spines[i - 1].instances || 1);
    return {
      level: g.level,
      name: g.name,
      instances: g.instances,
      childrenPerParent: g.instances / Math.max(1, parentInstances),
      lengthRatio: g.spineLength !== undefined ? g.spineLength / Math.max(1e-3, trunkLen) : undefined,
      startAngle: g.startAngle,
      bifChance: g.bifChance,
      bifAngle: g.bifLeftAngle,
      flares: g.flareNumber,
    };
  });

  return {
    source: meta,
    trunkLength: trunkLen,
    depth: spines.length,
    hasLeaf: !!leaf,
    hasFrond: !!frond,
    leafSize: leaf?.leafSize,
    leafAspect: leaf?.leafAspect,
    leafInstances: leaf?.instances ?? 0,
    frondInstances: frond?.instances ?? 0,
    levels,
    generatorSummary: gens.map((g) => ({ level: g.level, type: g.type, name: g.name, instances: g.instances })),
  };
}

// CLI: node scripts/spm-features.mjs <file.spm>
import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) { console.error("usage: node scripts/spm-features.mjs <file.spm>"); process.exit(1); }
  const feat = extractTreeFeature(readFileSync(file), { file });
  console.log(JSON.stringify(feat, null, 2));
}
