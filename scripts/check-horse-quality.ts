/**
 * Deterministic quality gate for the procedural horse template.
 *
 * This is intentionally render-free and CI-friendly: it inspects the generated
 * quadruped skin, side silhouette, limb layout, material category and detail.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildMidnightHorseParts,
  scoreHorseAnatomy,
} from "../src/index.js";

const thresholdArg = process.argv.find((arg) => arg.startsWith("--threshold="));
const threshold = thresholdArg ? Number(thresholdArg.split("=")[1]) : 0.78;
const parts = buildMidnightHorseParts();
const report = scoreHorseAnatomy(parts);

const outDir = resolve(process.cwd(), "out", "quality");
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "midnight-horse-quality.json"), JSON.stringify(report, null, 2));

console.log(report.feedback);
console.log("metrics:", JSON.stringify(report.metrics));
console.log("written: out/quality/midnight-horse-quality.json");

if (report.score < threshold) {
  console.error(`horse quality gate failed: ${report.score.toFixed(3)} < ${threshold.toFixed(3)}`);
  process.exit(1);
}
