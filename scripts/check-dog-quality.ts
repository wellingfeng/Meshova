/**
 * Deterministic quality gate for the reference dog quadruped preset.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildReferenceDogParts,
  scoreDogAnatomy,
} from "../src/index.js";

const thresholdArg = process.argv.find((arg) => arg.startsWith("--threshold="));
const threshold = thresholdArg ? Number(thresholdArg.split("=")[1]) : 0.78;
const parts = buildReferenceDogParts();
const report = scoreDogAnatomy(parts);

const outDir = resolve(process.cwd(), "out", "quality");
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "reference-dog-quality.json"), JSON.stringify(report, null, 2));

console.log(report.feedback);
console.log("metrics:", JSON.stringify(report.metrics));
console.log("written: out/quality/reference-dog-quality.json");

if (report.score < threshold) {
  console.error(`dog quality gate failed: ${report.score.toFixed(3)} < ${threshold.toFixed(3)}`);
  process.exit(1);
}
