#!/usr/bin/env node
/**
 * Publish a speedtree-fit run to the web comparison page.
 *
 * Reads out/speedtree-fit/report.json, copies each tree's reference image, best
 * render, and best model JSON into web/tree-fit-assets/ (and out/ root for the
 * viewer's ?model= loader), then writes fit-data.json the page consumes.
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(process.cwd());
const FIT = join(ROOT, "out/speedtree-fit");
const ASSETS = join(ROOT, "web/tree-fit-assets");
const OUT_ROOT = join(ROOT, "out");

const report = JSON.parse(readFileSync(join(FIT, "report.json"), "utf8"));
mkdirSync(ASSETS, { recursive: true });

const items = [];
let sum = 0;
for (const r of report.results) {
  const best = r.best;
  const id = r.id;
  // Copy reference image.
  const refSrc = join(FIT, r.referencePath);
  const refName = `${id}.png`;
  if (existsSync(refSrc)) copyFileSync(refSrc, join(ASSETS, refName));
  // Copy best render.
  const bestSrc = join(FIT, best.renderPath);
  const bestName = `${id}-best.png`;
  if (existsSync(bestSrc)) copyFileSync(bestSrc, join(ASSETS, bestName));
  // Copy best model JSON into out/ root so the viewer can load ?model=<id>.
  const modelSrc = best.modelPath ? join(FIT, best.modelPath) : null;
  if (modelSrc && existsSync(modelSrc)) copyFileSync(modelSrc, join(OUT_ROOT, `${id}.json`));

  sum += best.score.score;
  items.push({
    id,
    name: r.name,
    category: r.sourceCategory,
    species: r.sourceSpecies,
    score: best.score.score,
    iou: best.score.silhouetteIoU,
    color: best.score.colorSimilarity,
    tag: best.tag,
    view: best.view,
    ref: `tree-fit-assets/${refName}`,
    best: `tree-fit-assets/${bestName}`,
    spmNotes: r.spmNotes || [],
    params: best.params,
  });
}

const data = {
  generatedAt: report.generatedAt,
  targetScore: report.targetScore,
  mean: sum / Math.max(1, items.length),
  items,
};
writeFileSync(join(ASSETS, "fit-data.json"), JSON.stringify(data, null, 2));
console.log(`published ${items.length} trees, mean=${data.mean.toFixed(3)} -> web/tree-fit-assets/fit-data.json`);
