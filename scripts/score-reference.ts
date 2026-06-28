/**
 * Compare one reference PNG with one rendered PNG.
 *
 * Usage:
 *   pnpm score:ref out/refs/canyon-side.png out/shots/gmc-canyon-at4x-side.png --threshold=0.72
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import {
  decodePNG,
  hueHistogram,
  hueSimilarity,
  maskFromPhoto,
  maskIoU,
  normalizeMask,
  resizeNearest,
} from "../src/index.js";

const [refPath, renderPath] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (!refPath || !renderPath) {
  console.error("usage: pnpm score:ref <reference.png> <render.png> [--threshold=0.72]");
  process.exit(2);
}

const thresholdArg = process.argv.find((arg) => arg.startsWith("--threshold="));
const threshold = thresholdArg ? Number(thresholdArg.split("=")[1]) : 0.72;

const gridSize = 160;
const refRaster = resizeNearest(decodePNG(new Uint8Array(readFileSync(resolve(refPath)))), gridSize, gridSize);
const renderRaster = resizeNearest(decodePNG(new Uint8Array(readFileSync(resolve(renderPath)))), gridSize, gridSize);
const refMask = normalizeMask(maskFromPhoto(refRaster));
const renderMask = normalizeMask(maskFromPhoto(renderRaster));
const silhouetteIoU = maskIoU(refMask, renderMask);
const colorSimilarity = hueSimilarity(
  hueHistogram(refRaster, 12, refMask),
  hueHistogram(renderRaster, 12, renderMask),
);
const score = silhouetteIoU * 0.8 + colorSimilarity * 0.2;
const report = { score, silhouetteIoU, colorSimilarity };

mkdirSync(resolve(process.cwd(), "out", "quality"), { recursive: true });
const outPath = resolve(
  process.cwd(),
  "out",
  "quality",
  `${basename(refPath, ".png")}-vs-${basename(renderPath, ".png")}.json`,
);
writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log(`score=${report.score.toFixed(3)} (silhouetteIoU=${report.silhouetteIoU.toFixed(3)}, color=${report.colorSimilarity.toFixed(3)})`);
console.log(`written: ${outPath}`);

if (report.score < threshold) {
  console.error(`reference score failed: ${report.score.toFixed(3)} < ${threshold.toFixed(3)}`);
  process.exit(1);
}
