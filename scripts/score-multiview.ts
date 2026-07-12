/** Score matching Blender reference/candidate view directories. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import {
  hueHistogram,
  hueSimilarity,
} from "../src/vision/color.js";
import {
  maskFromBackground,
  maskFromPhoto,
  maskIoU,
  normalizeMask,
} from "../src/vision/silhouette.js";
import { decodePNG } from "../src/vision/png.js";
import { resizeNearest } from "../src/vision/raster.js";

const args = process.argv.slice(2);
const [referenceArg, candidateArg] = args.filter((arg) => !arg.startsWith("--"));
if (!referenceArg || !candidateArg) {
  console.error("usage: pnpm score:multiview <reference-dir> <candidate-dir> [--threshold=0.82]");
  process.exit(2);
}

const thresholdArg = args.find((arg) => arg.startsWith("--threshold="));
const threshold = thresholdArg ? Number(thresholdArg.split("=")[1]) : 0.82;
const views = ["front", "right", "back", "top", "perspective"];
const gridSize = 160;
const referenceDir = resolve(referenceArg);
const candidateDir = resolve(candidateArg);

const results = views.map((view) => {
  const reference = resizeNearest(
    decodePNG(new Uint8Array(readFileSync(resolve(referenceDir, `${view}.png`)))),
    gridSize,
    gridSize,
  );
  const candidate = resizeNearest(
    decodePNG(new Uint8Array(readFileSync(resolve(candidateDir, `${view}.png`)))),
    gridSize,
    gridSize,
  );
  const referenceMask = normalizeMask(maskFromPhoto(reference));
  const candidateMask = normalizeMask(maskFromBackground(candidate, borderColor(candidate), 18));
  const silhouetteIoU = maskIoU(referenceMask, candidateMask);
  const colorSimilarity = hueSimilarity(
    hueHistogram(reference, 12, referenceMask),
    hueHistogram(candidate, 12, candidateMask),
  );
  return {
    view,
    silhouetteIoU,
    colorSimilarity,
    score: silhouetteIoU * 0.8 + colorSimilarity * 0.2,
  };
});

const average = (key: "silhouetteIoU" | "colorSimilarity" | "score") =>
  results.reduce((sum, result) => sum + result[key], 0) / results.length;
const report = {
  referenceDir,
  candidateDir,
  averageSilhouetteIoU: average("silhouetteIoU"),
  minimumSilhouetteIoU: Math.min(...results.map((result) => result.silhouetteIoU)),
  averageColorSimilarity: average("colorSimilarity"),
  averageScore: average("score"),
  views: results,
};

const outDir = resolve(process.cwd(), "out", "quality");
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, `multiview-${safeName(basename(candidateDir))}.json`);
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

for (const result of results) {
  console.log(`${result.view}: IoU=${result.silhouetteIoU.toFixed(3)} score=${result.score.toFixed(3)}`);
}
console.log(`average IoU=${report.averageSilhouetteIoU.toFixed(3)}, minimum=${report.minimumSilhouetteIoU.toFixed(3)}`);
console.log(`written: ${outPath}`);

if (report.averageSilhouetteIoU < threshold) {
  console.error(`multiview silhouette failed: ${report.averageSilhouetteIoU.toFixed(3)} < ${threshold.toFixed(3)}`);
  process.exit(1);
}

function borderColor(raster: { width: number; height: number; data: Uint8Array }): [number, number, number] {
  const sum = [0, 0, 0];
  let samples = 0;
  const sample = (x: number, y: number) => {
    const offset = (y * raster.width + x) * 4;
    sum[0] += raster.data[offset] ?? 0;
    sum[1] += raster.data[offset + 1] ?? 0;
    sum[2] += raster.data[offset + 2] ?? 0;
    samples++;
  };
  for (let x = 0; x < raster.width; x++) {
    sample(x, 0);
    sample(x, raster.height - 1);
  }
  for (let y = 1; y < raster.height - 1; y++) {
    sample(0, y);
    sample(raster.width - 1, y);
  }
  return sum.map((value) => Math.round(value / samples)) as [number, number, number];
}

function safeName(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "candidate";
}
