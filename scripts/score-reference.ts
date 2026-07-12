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
  maskFromBackground,
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
const renderMask = normalizeMask(maskFromBackground(renderRaster, borderColor(renderRaster), 18));
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
