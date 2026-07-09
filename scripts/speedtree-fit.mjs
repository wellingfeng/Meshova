#!/usr/bin/env node
/**
 * SpeedTree library fitting loop.
 *
 * Uses local SpeedTree library preview renders as reference screenshots, then
 * generates Meshova-native procedural candidates, captures them in the browser,
 * scores silhouette/color, and writes a comparison report. It never parses or
 * copies .spm geometry/textures.
 *
 * Run:
 *   pnpm speedtree:fit -- --limit 10 --candidates 18
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { appendFileSync, existsSync, readdirSync, readFileSync as readFileSyncBuf } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, normalize, relative, resolve } from "node:path";
import {
  buildSpeedTreeLibraryPlant,
  defaultSpeedTreeLibraryParams,
  decodePNG,
  makeReferenceTarget,
  maskBounds,
  maskFromPhoto,
  resizeNearest,
  scoreRenderPng,
  speedTreeLibraryId,
  spmFeatureToParams,
  toViewerModel,
} from "../dist/index.js";
import { extractTreeFeature } from "./spm-features.mjs";

const ROOT = resolve(process.cwd());
const DEFAULT_SOURCE = String.raw`E:\BaiduNetdiskDownload\speedtree教程软件树库\speedtree树库\解压后11.1GB树库\SpeedTree Library树库`;
const DEFAULT_OUT = "out/speedtree-fit";
const BG_HEX = "#f6f7f4";
const BG_RGB = [246, 247, 244];
const SIZE = { width: 900, height: 700 };
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const DEFAULT_SAMPLES = [
  // Broadleaves
  "Acacia",
  "African Boabab",
  "African Olive",
  "Big Leaf Maple",
  "Cherry Tree",
  "European Aspen",
  "European Beech",
  "Green Ash",
  "Japanese Maple",
  "Live Oak",
  "Sugar Maple",
  "Umbrella Thorn Tree",
  "Weeping Willow",
  "White Oak",
  // Conifers
  "Alaska Cedar",
  "Bald Cypress",
  "Douglas Fir",
  "Eastern White Pine",
  "Italian Cypress",
  "Jeffrey Pine",
  "Loblolly Pine",
  "Norway Spruce",
  "Scots Pine",
  // Palms & Cacti
  "AloeVera",
  "BananaPlant",
  "DatePalm",
  "QueenPalm",
  "SaguaroCactus",
  // Shrubs & Flowers
  "AmericanBoxwood",
  "Bamboo",
  "CommonHawthorn",
  "DogRose",
];

const VIEW_PRESETS = {
  front: { kind: "view", name: "front" },
  persp: { kind: "view", name: "persp" },
  "orbit-25": { kind: "orbit", name: "orbit-25", azimuth: -25, elevation: 10 },
  orbit25: { kind: "orbit", name: "orbit25", azimuth: 25, elevation: 10 },
  orbit45: { kind: "orbit", name: "orbit45", azimuth: 45, elevation: 10 },
  side: { kind: "view", name: "side" },
};

const args = parseArgs(process.argv.slice(2));
const sourceDir = resolve(String(args.source ?? process.env.SPEEDTREE_LIBRARY_SOURCE ?? DEFAULT_SOURCE));
const outDir = resolve(ROOT, String(args.out ?? DEFAULT_OUT));
const limit = Math.max(1, Number(args.limit ?? 30));
const candidateLimit = Math.max(1, Number(args.candidates ?? 18));
const targetScore = Number(args.target ?? 0.62);
const refineRounds = Math.max(0, Number(args.refine ?? 6));
const quality = ["proxy", "medium", "high"].includes(String(args.quality)) ? String(args.quality) : "medium";
const sampleNames = String(args.samples ?? DEFAULT_SAMPLES.join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const viewNames = String(args.views ?? "front,orbit-25,orbit25")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const views = viewNames.map((name) => VIEW_PRESETS[name]).filter(Boolean);
if (views.length === 0) views.push(VIEW_PRESETS.front);
let serverPort = 0;

if (!existsSync(sourceDir)) {
  throw new Error(`SpeedTree library source dir not found: ${sourceDir}`);
}

await mkdir(outDir, { recursive: true });
await mkdir(join(outDir, "refs"), { recursive: true });
await mkdir(join(outDir, "renders"), { recursive: true });
await mkdir(join(outDir, "models"), { recursive: true });

console.log(`source: ${sourceDir}`);
console.log(`out: ${relative(ROOT, outDir)}`);
console.log(`samples: ${Math.min(limit, sampleNames.length)}; candidates/sample: ${candidateLimit}; quality: ${quality}`);
mark(`start source=${sourceDir}`);

mark("starting server");
const { server, port } = await startServer();
serverPort = port;
mark(`server port=${port}`);
mark("launching browser");
const browser = await launchBrowser();
mark("browser launched");
let viewerPage;
try {
  const converter = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1 });
  viewerPage = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1 });
  mark("initializing viewer");
  await initViewer(viewerPage, port);
  mark("viewer ready");

  const references = collectReferenceRenders(sourceDir);
  const samples = selectSamples(sourceDir, references, sampleNames, limit);
  mark(`samples selected=${samples.length}`);
  if (samples.length < limit) {
    console.warn(`warning: found only ${samples.length}/${limit} requested samples`);
  }

  const results = [];
  for (const [i, sample] of samples.entries()) {
    console.log(`\n[${i + 1}/${samples.length}] ${sample.name} -> ${sample.entry.category}/${sample.entry.species}`);
    mark(`fit sample ${i + 1}/${samples.length} ${sample.name}`);
    const result = await fitSample(converter, viewerPage, sample);
    results.push(result);
    const best = result.best;
    console.log(
      `  best ${best.score.score.toFixed(3)} IoU=${best.score.silhouetteIoU.toFixed(3)} color=${best.score.colorSimilarity.toFixed(3)} ${best.tag} ${best.view}`,
    );
    if (best.score.score < targetScore) console.log("  score below target; kept expanded candidate search result");
  }

  const report = {
    sourceDir,
    generatedAt: new Date().toISOString(),
    targetScore,
    quality,
    candidateLimit,
    views: views.map((v) => v.name),
    results,
  };
  await writeFile(join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(outDir, "index.html"), reportHtml(report));
  console.log(`\nreport: ${relative(ROOT, join(outDir, "index.html"))}`);
  console.log(`json: ${relative(ROOT, join(outDir, "report.json"))}`);
} finally {
  if (viewerPage) await viewerPage.close().catch(() => {});
  await browser.close().catch(() => {});
  server.close();
}

async function fitSample(converter, page, sample) {
  const id = speedTreeLibraryId(sample.entry);
  const refPngPath = join(outDir, "refs", `${id}.png`);
  mark(`convert reference ${id}`);
  await convertImageToPng(converter, sample.referencePath, refPngPath);
  mark(`reference converted ${id}`);
  const refBytes = new Uint8Array(await readFile(refPngPath));
  const target = makeReferenceTarget(refBytes, {
    gridSize: 160,
    renderBg: BG_RGB,
    weights: { silhouette: 0.72, color: 0.28 },
  });
  const refMaskInfo = maskStats(refBytes);
  // Sample real crown/trunk colors from the reference image (foliage vs bark).
  const refColors = sampleReferenceColors(refBytes);
  // Parse the SPM structural feature (offline gzip XML, stats only).
  const spmSeed = loadSpmSeed(sample);
  const candidates = buildCandidates(sample.entry, target, candidateLimit, spmSeed, refColors);
  const all = [];
  let best = null;
  let shotSeq = 0;

  // Evaluate one parameter set across all views; return the best-scoring view entry.
  const evaluate = async (params, tag) => {
    const buildOpts = { quality, params };
    if (refColors?.foliage) buildOpts.foliageColor = refColors.foliage;
    if (refColors?.bark) buildOpts.barkColor = refColors.bark;
    const parts = buildSpeedTreeLibraryPlant(sample.entry, buildOpts);
    const model = toViewerModel(parts, `${sample.name} ${tag}`);
    model.meta.procedural = {
      type: "speedtree-fit-candidate",
      reference: sample.referenceRel,
      source: sample.entry,
      params,
      tag,
    };
    let bestView = null;
    for (const view of views) {
      const shotName = `${id}-${String(shotSeq++).padStart(3, "0")}-${view.name}.png`;
      const shotPath = join(outDir, "renders", shotName);
      mark(`capture ${id} ${tag} ${view.name}`);
      const buf = await captureModel(page, model, view, shotPath);
      const score = scoreRenderPng(target, new Uint8Array(buf));
      const entry = { tag, view: view.name, score, renderPath: relOut(shotPath), params };
      all.push(entry);
      if (!bestView || score.score > bestView.score.score) bestView = entry;
    }
    bestView.model = model;
    return bestView;
  };

  const commitBest = async (entry) => {
    best = entry;
    const bestModelPath = join(outDir, "models", `${id}.json`);
    await writeFile(bestModelPath, JSON.stringify(entry.model));
    best.modelPath = relOut(bestModelPath);
  };

  // Stage 1: coarse grid search over hand-authored parameter presets.
  for (const [ci, candidate] of candidates.entries()) {
    mark(`candidate ${id} ${ci + 1}/${candidates.length} ${candidate.tag}`);
    const bestView = await evaluate(candidate.params, candidate.tag);
    if (!best || bestView.score.score > best.score.score) await commitBest(bestView);
    if (best.score.score >= targetScore && ci >= 5) break;
  }

  // Stage 2: coordinate-descent refinement around the current best.
  if (best.score.score < targetScore && refineRounds > 0) {
    best = await refine(id, target, best, evaluate, commitBest);
  }

  return {
    id,
    name: sample.name,
    sourceCategory: sample.entry.category,
    sourceSpecies: sample.entry.species,
    sourceVariant: sample.entry.variant ?? "",
    referencePath: relOut(refPngPath),
    referenceOriginal: sample.referenceRel,
    refMask: refMaskInfo,
    spmNotes: spmSeed?.notes ?? [],
    spmFeature: spmSeed?.feature
      ? { depth: spmSeed.feature.depth, leafInstances: spmSeed.feature.leafInstances, levels: spmSeed.feature.levels?.length ?? 0 }
      : null,
    refColors,
    best: stripModel(best),
    candidates: all.map(stripModel).sort((a, b) => b.score.score - a.score.score),
  };
}

function stripModel(entry) {
  if (!entry) return entry;
  const { model, ...rest } = entry;
  return rest;
}

// Coordinate descent: nudge one axis at a time, keep improvements, shrink step on stall.
async function refine(id, target, seed, evaluate, commitBest) {
  const axes = [
    { key: "height", step: 0.1, min: 0.2, max: 20, kind: "mul" },
    { key: "crownScale", step: 0.12, min: 0.2, max: 3, kind: "mul" },
    { key: "crownDepth", step: 0.12, min: 0.2, max: 3, kind: "mul" },
    { key: "branchAngle", step: 8, min: -45, max: 45, kind: "add" },
    { key: "leafDensity", step: 0.18, min: 0, max: 3, kind: "mul" },
    { key: "leafSize", step: 0.14, min: 0.2, max: 3, kind: "mul" },
    { key: "trunkScale", step: 0.16, min: 0.25, max: 3, kind: "mul" },
    { key: "lean", step: 0.16, min: -2, max: 2, kind: "add" },
  ];
  let current = seed;
  let scale = 1;
  for (let round = 0; round < refineRounds; round++) {
    let improvedThisRound = false;
    for (const axis of axes) {
      const cur = Number(current.params[axis.key] ?? (axis.kind === "add" ? 0 : 1));
      const step = axis.step * scale;
      for (const dir of [1, -1]) {
        const next = axis.kind === "add" ? cur + dir * step : cur * (1 + dir * step);
        const value = clamp(next, axis.min, axis.max);
        if (Math.abs(value - cur) < 1e-4) continue;
        const params = { ...current.params, [axis.key]: value };
        mark(`refine ${id} r${round + 1} ${axis.key}${dir > 0 ? "+" : "-"}`);
        const trial = await evaluate(params, `refine-r${round + 1}-${axis.key}${dir > 0 ? "+" : "-"}`);
        if (trial.score.score > current.score.score + 1e-4) {
          current = trial;
          await commitBest(trial);
          improvedThisRound = true;
          break; // greedy: accept first improving direction, move to next axis
        }
      }
      if (current.score.score >= targetScore) return current;
    }
    if (!improvedThisRound) {
      scale *= 0.5;
      if (scale < 0.2) break; // step too small to matter; converged
    }
  }
  return current;
}

function mark(message) {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(line);
  try {
    appendFileSync(join(outDir, "progress.log"), `${line}\n`);
  } catch {
    // Ignore progress logging failures; fitting can still continue.
  }
}

function buildCandidates(entry, target, limit, spmSeed, _refColors) {
  const base = defaultSpeedTreeLibraryParams(entry, { quality });
  // SPM-derived near-truth base becomes the starting point when available.
  const spmBase = spmSeed?.params ? applyPatch(base, toPatch(spmSeed.params)) : base;
  const b = maskBounds(target.maskNorm);
  const aspect = b.area > 0 ? (b.x1 - b.x0 + 1) / Math.max(1, b.y1 - b.y0 + 1) : 0.8;
  const wide = aspect > 0.72;
  const narrow = aspect < 0.42;
  const patches = [
    ["base", {}],
    ["ref-aspect", {
      height: { mul: narrow ? 1.18 : wide ? 0.92 : 1 },
      crownScale: { mul: wide ? 1.28 : narrow ? 0.78 : 1.05 },
      crownDepth: { mul: wide ? 1.12 : narrow ? 0.82 : 1 },
    }],
    ["wide-dense", { crownScale: { mul: 1.32 }, crownDepth: { mul: 1.18 }, leafDensity: { mul: 1.28 }, leafSize: { mul: 1.08 } }],
    ["low-wide", { height: { mul: 0.86 }, crownScale: { mul: 1.45 }, crownDepth: { mul: 1.18 }, branchAngle: { add: 12 } }],
    ["narrow-tall", { height: { mul: 1.16 }, crownScale: { mul: 0.72 }, crownDepth: { mul: 0.72 }, branchAngle: { add: -14 }, branchCount: { mul: 1.15 } }],
    ["open-branchy", { leafDensity: { mul: 0.62 }, branchCount: { mul: 1.45 }, trunkScale: { mul: 1.14 }, gnarl: { mul: 1.45 } }],
    ["dense-soft", { leafDensity: { mul: 1.7 }, leafSize: { mul: 1.22 }, branchCount: { mul: 0.86 }, crownScale: { mul: 1.1 } }],
    ["thin-trunk", { trunkScale: { mul: 0.72 }, branchAngle: { add: -8 }, branchCount: { mul: 1.18 } }],
    ["heavy-trunk", { trunkScale: { mul: 1.48 }, branchAngle: { add: 10 }, leafDensity: { mul: 0.9 } }],
    ["small-leaf", { leafSize: { mul: 0.68 }, leafDensity: { mul: 1.55 }, branchCount: { mul: 1.12 } }],
    ["large-leaf", { leafSize: { mul: 1.55 }, leafDensity: { mul: 0.9 }, crownScale: { mul: 1.08 } }],
    ["lean-left", { lean: { add: -0.42 }, crownDepth: { mul: 0.86 }, gnarl: { mul: 1.2 } }],
    ["lean-right", { lean: { add: 0.42 }, crownDepth: { mul: 0.86 }, gnarl: { mul: 1.2 } }],
    ["seed-a", { seed: { add: 31 } }],
    ["seed-b", { seed: { add: 97 } }],
    ["seed-c-wide", { seed: { add: 173 }, crownScale: { mul: 1.2 }, leafDensity: { mul: 1.2 } }],
    ["seed-d-narrow", { seed: { add: 271 }, crownScale: { mul: 0.82 }, branchAngle: { add: -10 } }],
    ["sparse-wide", { crownScale: { mul: 1.34 }, leafDensity: { mul: 0.78 }, branchAngle: { add: 18 }, branchCount: { mul: 0.9 } }],
    ["compact-dense", { height: { mul: 0.95 }, crownScale: { mul: 0.95 }, leafDensity: { mul: 1.9 }, leafSize: { mul: 0.85 } }],
  ];
  // When SPM structure is available, seed the search from it (first candidate)
  // and derive all variations off the SPM-informed base instead of blind defaults.
  const seedTag = spmSeed?.params ? "spm-seed" : "base";
  const out = patches.slice(0, limit).map(([tag, patch]) => ({
    tag: tag === "base" ? seedTag : tag,
    params: applyPatch(spmBase, patch),
  }));
  return out;
}

// Convert a plain param-override object into applyPatch's {set} form.
function toPatch(params) {
  const patch = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "number" && Number.isFinite(v)) patch[k] = { set: v };
  }
  return patch;
}

// Locate and parse a species' authoring SPM into a structural feature + seed.
function loadSpmSeed(sample) {
  try {
    const relPath = sample.entry.relPath;
    if (!relPath) return null;
    const spmPath = join(sourceDir, relPath);
    if (!existsSync(spmPath)) return null;
    const feature = extractTreeFeature(readFileSyncBuf(spmPath), { file: relPath });
    if (!feature || !(feature.depth >= 1)) return null;
    const seed = spmFeatureToParams(feature);
    mark(`spm feature ${sample.name}: depth=${feature.depth} leaves=${feature.leafInstances} -> ${seed.notes.join("; ")}`);
    return { feature, params: seed.params, notes: seed.notes };
  } catch (e) {
    mark(`spm parse skipped ${sample.name}: ${String(e).slice(0, 80)}`);
    return null;
  }
}

function applyPatch(base, patch) {
  const out = { ...base };
  for (const [key, op] of Object.entries(patch)) {
    const cur = Number(out[key] ?? 0);
    if (op.mul !== undefined) out[key] = cur * op.mul;
    if (op.add !== undefined) out[key] = cur + op.add;
    if (op.set !== undefined) out[key] = op.set;
  }
  out.seed = Math.max(0, Math.round(out.seed));
  out.height = clamp(out.height, 0.2, 20);
  out.trunkScale = clamp(out.trunkScale, 0.25, 3);
  out.crownScale = clamp(out.crownScale, 0.2, 3);
  out.crownDepth = clamp(out.crownDepth, 0.2, 3);
  out.branchAngle = clamp(out.branchAngle, -45, 45);
  out.branchCount = clamp(out.branchCount, 0.1, 3);
  out.leafDensity = clamp(out.leafDensity, 0, 3);
  out.leafSize = clamp(out.leafSize, 0.2, 3);
  out.gnarl = clamp(out.gnarl, 0, 3);
  out.lean = clamp(out.lean, -2, 2);
  return out;
}

async function captureModel(page, model, view, file) {
  await page.evaluate((m) => window.__meshova.loadParts(m), model);
  await page.evaluate(() => window.__meshova.setMaterial("model"));
  await page.evaluate((bg) => window.__meshova.setBackground("solid", bg), BG_HEX);
  await page.evaluate(() => window.__meshova.setFloor("none"));
  await page.evaluate(() => window.__meshova.setGrid(false));
  if (view.kind === "orbit") {
    await page.evaluate(({ az, el }) => window.__meshova.setOrbit((az * Math.PI) / 180, el), {
      az: view.azimuth,
      el: view.elevation,
    });
  } else {
    await page.evaluate((name) => window.__meshova.setView(name), view.name);
  }
  await page.evaluate(() => window.__meshova.settle(8));
  const canvas = await page.$("canvas");
  return canvas.screenshot({ path: file });
}

async function convertImageToPng(page, inputPath, outputPath) {
  const url = sourceAssetUrl(inputPath);
  await page.setViewportSize(SIZE);
  await page.setContent(`<!doctype html><html><body style="margin:0;background:white"><img src="${escapeHtml(url)}" style="display:block;max-width:none"></body></html>`, {
    waitUntil: "domcontentloaded",
    timeout: 10000,
  });
  const img = await page.waitForSelector("img", { timeout: 10000 });
  await page.waitForFunction(() => {
    const el = document.querySelector("img");
    return !!el && el.complete;
  }, null, { timeout: 10000 });
  const loaded = await img.evaluate((el) => ({ width: el.naturalWidth, height: el.naturalHeight }));
  if (loaded.width <= 0 || loaded.height <= 0) {
    throw new Error(`image load failed: ${inputPath}`);
  }
  await img.screenshot({ path: outputPath });
}

function maskStats(pngBytes) {
  const raster = resizeNearest(decodePNG(pngBytes), 160, 160);
  const mask = maskFromPhoto(raster);
  const b = maskBounds(mask);
  return {
    area: b.area,
    aspect: b.area > 0 ? Number(((b.x1 - b.x0 + 1) / Math.max(1, b.y1 - b.y0 + 1)).toFixed(3)) : 0,
    bounds: b,
  };
}

/**
 * Sample real foliage/bark colors from the reference image. Foreground pixels
 * (via the same mask logic) are split by height: the upper crown band averages
 * to foliage color; the lower narrow trunk band averages to bark color. Returns
 * 0..1 RGB triples. Never bakes the image — only two average colors leave here.
 */
function sampleReferenceColors(pngBytes) {
  try {
    const N = 160;
    const raster = resizeNearest(decodePNG(pngBytes), N, N);
    const mask = maskFromPhoto(raster);
    const maskData = mask.data ?? mask;
    const px = raster.data;
    const w = raster.width;
    const b = maskBounds(mask);
    if (b.area <= 0) return null;
    const height = b.y1 - b.y0 + 1;
    const cx = (b.x0 + b.x1) / 2;
    const halfW = (b.x1 - b.x0 + 1) / 2;
    let fr = 0, fg = 0, fb = 0, fn = 0; // foliage (upper 70%)
    let br = 0, bg = 0, bb = 0, bn = 0; // bark (lower 35%, central column)
    for (let y = b.y0; y <= b.y1; y++) {
      const rel = (y - b.y0) / Math.max(1, height);
      for (let x = b.x0; x <= b.x1; x++) {
        if (!maskData[y * N + x]) continue;
        const i = (y * w + x) * 4;
        const r = px[i], g = px[i + 1], bl = px[i + 2];
        if (rel < 0.68) { fr += r; fg += g; fb += bl; fn++; }
        // Bark: lower band, near the central trunk column.
        if (rel > 0.62 && Math.abs(x - cx) < halfW * 0.22) { br += r; bg += g; bb += bl; bn++; }
      }
    }
    const foliage = fn > 20 ? [fr / fn / 255, fg / fn / 255, fb / fn / 255] : null;
    let bark = bn > 12 ? [br / bn / 255, bg / bn / 255, bb / bn / 255] : null;
    // Reject a "bark" sample that is actually green foliage (trunk hidden by leaves).
    if (bark && bark[1] > bark[0] * 1.08 && bark[1] > bark[2] * 1.08) bark = null;
    const out = {};
    if (foliage) out.foliage = foliage.map((v) => Math.max(0, Math.min(1, v)));
    if (bark) out.bark = bark.map((v) => Math.max(0, Math.min(1, v)));
    return out.foliage || out.bark ? out : null;
  } catch {
    return null;
  }
}

async function initViewer(page, port) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !!window.__meshova, null, { timeout: 10000 });
  await page.addStyleTag({
    content: "#hud,#err,#script-panel,#plan-panel{display:none!important;visibility:hidden!important}",
  });
  await page.evaluate(() => window.__meshova.setAutorot(false));
  await page.evaluate(() => window.__meshova.setWind(false));
  await page.evaluate(() => window.__meshova.setPost(false));
  await page.evaluate(() => window.__meshova.setAO(false));
  await page.evaluate(() => window.__meshova.setBloom(0));
  await page.evaluate((bg) => window.__meshova.setBackground("solid", bg), BG_HEX);
  await page.evaluate(() => window.__meshova.setFloor("none"));
  await page.evaluate(() => window.__meshova.setGrid(false));
  if (errors.length) throw new Error(`viewer init errors:\n${errors.join("\n")}`);
}

function collectReferenceRenders(root) {
  const rendersRoot = join(root, "renders");
  if (!existsSync(rendersRoot)) return [];
  return walkFiles(rendersRoot)
    .filter((file) => /\.(jpe?g|png|webp)$/i.test(file))
    .map((file) => {
      const rel = relative(root, file);
      const parts = rel.split(/[\\/]+/);
      return {
        file,
        rel,
        renderCategory: parts[1] ?? "",
        name: cleanRenderName(basename(file, extname(file))),
      };
    });
}

function selectSamples(root, references, names, max) {
  const out = [];
  for (const name of names) {
    const ref = findReference(references, name);
    if (!ref) {
      console.warn(`warning: reference not found for ${name}`);
      continue;
    }
    const category = sourceCategoryForRender(ref.renderCategory);
    const species = findSpeciesDir(root, category, ref.name);
    if (!species) {
      console.warn(`warning: species dir not found for ${ref.rel}`);
      continue;
    }
    const spm = representativeSpm(join(root, category, species));
    out.push({
      name: ref.name,
      referencePath: ref.file,
      referenceRel: ref.rel,
      entry: {
        category,
        species,
        ...(spm ? { variant: basename(spm, extname(spm)), relPath: relative(root, spm) } : {}),
      },
    });
    if (out.length >= max) break;
  }
  return out;
}

function findReference(references, name) {
  const want = norm(name);
  return references.find((ref) => norm(ref.name) === want)
    ?? references.find((ref) => norm(ref.name).includes(want) || want.includes(norm(ref.name)));
}

function findSpeciesDir(root, category, renderName) {
  const dir = join(root, category);
  if (!existsSync(dir)) return null;
  const dirs = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const target = norm(renderName);
  let best = null;
  for (const d of dirs) {
    const s = speciesScore(norm(d), target);
    if (!best || s > best.score) best = { name: d, score: s };
  }
  return best && best.score > 0 ? best.name : null;
}

function speciesScore(species, target) {
  if (species === target) return 100;
  if (species.includes(target) || target.includes(species)) return 80;
  // Space-insensitive containment: render names often drop spaces
  // (e.g. "aloevera" vs dir "aloe vera"), so compare collapsed forms too.
  const sc = species.replace(/\s+/g, "");
  const tc = target.replace(/\s+/g, "");
  if (sc === tc) return 90;
  if (sc.includes(tc) || tc.includes(sc)) return 70;
  const st = tokenSet(species);
  const tt = tokenSet(target);
  let hits = 0;
  for (const t of tt) if (st.has(t)) hits++;
  return hits * 12 - Math.abs(st.size - tt.size);
}

function representativeSpm(speciesDir) {
  if (!existsSync(speciesDir)) return null;
  const all = walkFiles(speciesDir).filter((file) => /\.spm$/i.test(file));
  const usable = all.filter((file) => !/(modeler_use_only|modeler use only|map[_ -]?maker|leaf[_ -]?map|needle[_ -]?maker)/i.test(file));
  const files = usable.length > 0 ? usable : all;
  if (files.length === 0) return null;
  const base = norm(basename(speciesDir));
  return files.find((file) => norm(basename(file, extname(file))) === base)
    ?? files.find((file) => /(^|[_-])rt($|[_-])/i.test(basename(file, extname(file))))
    ?? files.find((file) => /desktop/i.test(basename(file, extname(file))))
    ?? files.find((file) => /(^|[_-])med($|[_-])/i.test(basename(file, extname(file))))
    ?? files[0];
}

function cleanRenderName(name) {
  return name
    .replace(/^\d+[_ -]*/, "")
    .replace(/_Full$/i, "")
    .replace(/_RT$/i, "")
    .replace(/_RT_/gi, "_")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function sourceCategoryForRender(renderCategory) {
  const n = norm(renderCategory);
  if (n.includes("palm") || n.includes("catti") || n.includes("cacti")) return "Palms_&_Cacti";
  if (n.includes("shrub") || n.includes("flower")) return "Shrubs_&_Flowers";
  if (n.includes("conifer")) return "Conifers";
  if (n.includes("broad")) return "Broadleaves";
  if (n.includes("marine")) return "Marine";
  if (n.includes("hand")) return "Hand_Drawn";
  return "Miscellaneous_&_Fantasy";
}

function walkFiles(root) {
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  return out.sort((a, b) => a.localeCompare(b, "zh-CN"));
}

async function startServer() {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent((req.url || "/").split("?")[0]);
      if (p === "/favicon.ico") return res.writeHead(204).end();
      if (p.startsWith("/__speedtree__/")) {
        const rel = p.slice("/__speedtree__/".length);
        const fp = resolve(sourceDir, rel);
        if (!fp.startsWith(sourceDir)) return res.writeHead(403).end();
        const body = await readFile(fp);
        res.writeHead(200, { "content-type": MIME[extname(fp).toLowerCase()] || "application/octet-stream" });
        res.end(body);
        return;
      }
      if (p === "/") p = "/web/index.html";
      const fp = normalize(join(ROOT, p));
      if (!fp.startsWith(ROOT)) return res.writeHead(403).end();
      const info = await stat(fp).catch(() => null);
      const target = info?.isDirectory() ? join(fp, "index.html") : fp;
      const body = await readFile(target);
      res.writeHead(200, { "content-type": MIME[extname(target)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((resolveServer) => {
    server.listen(0, () => resolveServer({ server, port: server.address().port }));
  });
}

function sourceAssetUrl(file) {
  const rel = relative(sourceDir, file)
    .split(/[\\/]+/)
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `http://127.0.0.1:${serverPort}/__speedtree__/${rel}`;
}

async function launchBrowser() {
  const shellExe = chromium.executablePath();
  const fullExe = shellExe
    .replace(/chromium_headless_shell-(\d+)/, "chromium-$1")
    .replace(/chrome-headless-shell-win64[\\/]chrome-headless-shell\.exe$/i, "chrome-win64\\chrome.exe")
    .replace(/chrome-headless-shell-mac[^\\/]*[\\/].*$/i, "chrome-mac/Chromium.app/Contents/MacOS/Chromium")
    .replace(/chrome-headless-shell-linux[\\/]chrome-headless-shell$/i, "chrome-linux/chrome");
  return chromium.launch({
    executablePath: existsSync(fullExe) ? fullExe : undefined,
    headless: true,
    args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--headless=new"],
  });
}

function reportHtml(report) {
  const rows = report.results.map((r) => {
    const best = r.best;
    const score = best.score.score;
    const cls = score >= report.targetScore ? "ok" : score >= 0.5 ? "warn" : "bad";
    const top = r.candidates.slice(0, 6).map((c) =>
      `<tr><td>${escapeHtml(c.tag)}</td><td>${escapeHtml(c.view)}</td><td>${fmt(c.score.score)}</td><td>${fmt(c.score.silhouetteIoU)}</td><td>${fmt(c.score.colorSimilarity)}</td></tr>`,
    ).join("");
    return `<section class="card ${cls}">
  <div class="head">
    <h2>${escapeHtml(r.name)}</h2>
    <div class="score">${fmt(score)}</div>
  </div>
  <div class="meta">${escapeHtml(r.sourceCategory)} / ${escapeHtml(r.sourceSpecies)} · ${escapeHtml(r.sourceVariant || "default")} · ${escapeHtml(r.referenceOriginal)}</div>
  <div class="compare">
    <figure><img src="${escapeAttr(r.referencePath)}" alt="${escapeAttr(r.name)} reference"><figcaption>SpeedTree 参考图</figcaption></figure>
    <figure><img src="${escapeAttr(best.renderPath)}" alt="${escapeAttr(r.name)} render"><figcaption>Meshova 最佳候选 · ${escapeHtml(best.tag)} · ${escapeHtml(best.view)}</figcaption></figure>
  </div>
  <div class="metrics">
    <span>总分 ${fmt(best.score.score)}</span><span>轮廓 IoU ${fmt(best.score.silhouetteIoU)}</span><span>颜色 ${fmt(best.score.colorSimilarity)}</span><span>参考宽高比 ${fmt(r.refMask.aspect)}</span>
  </div>
  <details>
    <summary>候选排名</summary>
    <table><thead><tr><th>候选</th><th>视角</th><th>总分</th><th>IoU</th><th>颜色</th></tr></thead><tbody>${top}</tbody></table>
  </details>
</section>`;
  }).join("\n");
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>SpeedTree 10 树拟合报告</title>
<style>
:root{color-scheme:dark}
body{margin:0;background:#0d1117;color:#e6edf3;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
header{position:sticky;top:0;z-index:2;background:#111820;border-bottom:1px solid #28323d;padding:16px 22px}
h1{margin:0 0 6px;font-size:22px}
.sub{color:#9fb1c1}
main{padding:18px 22px;display:grid;grid-template-columns:repeat(auto-fit,minmax(520px,1fr));gap:16px}
.card{border:1px solid #28323d;background:#141b23;border-radius:8px;padding:14px}
.card.ok{border-color:#2f8f56}.card.warn{border-color:#c28a2c}.card.bad{border-color:#b94a4a}
.head{display:flex;align-items:center;justify-content:space-between;gap:12px}
h2{margin:0;font-size:18px}
.score{font-weight:800;font-size:24px}
.meta{color:#8ea2b2;margin:4px 0 12px;font-size:12px}
.compare{display:grid;grid-template-columns:1fr 1fr;gap:12px}
figure{margin:0;background:#0b0f14;border:1px solid #25303a;border-radius:6px;overflow:hidden}
img{display:block;width:100%;height:320px;object-fit:contain;background:#f6f7f4}
figcaption{padding:8px 10px;color:#aab8c5;font-size:12px;border-top:1px solid #25303a}
.metrics{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.metrics span{background:#0f151c;border:1px solid #27313b;border-radius:999px;padding:4px 9px}
summary{cursor:pointer;color:#c7d4df}
table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px}
th,td{padding:6px;border-bottom:1px solid #26313b;text-align:left}
th{color:#91a4b5}
@media (max-width:700px){main{grid-template-columns:1fr;padding:12px}.compare{grid-template-columns:1fr}img{height:260px}}
</style>
</head>
<body>
<header>
  <h1>SpeedTree 10 树拟合报告</h1>
  <div class="sub">目标分 ${fmt(report.targetScore)} · 质量 ${escapeHtml(report.quality)} · 候选 ${report.candidateLimit} · 视角 ${escapeHtml(report.views.join(", "))} · ${escapeHtml(report.generatedAt)}</div>
</header>
<main>
${rows}
</main>
</body>
</html>
`;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq > 2) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function norm(value) {
  return String(value)
    .toLowerCase()
    .replace(/boabab/g, "baobab")
    .replace(/chenese/g, "chinese")
    .replace(/jupiter/g, "juniper")
    .replace(/giand/g, "giant")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenSet(value) {
  return new Set(norm(value).split(" ").filter(Boolean));
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
}

function relOut(file) {
  return relative(outDir, file).replace(/\\/g, "/");
}

function fmt(value) {
  return Number(value ?? 0).toFixed(3);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
