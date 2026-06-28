/**
 * Deterministic quality gate for procedural pickup templates.
 *
 * Render-free and CI-friendly: checks vehicle skeleton, cab/bed layout,
 * wheels, material semantics and turntable solidity before screenshot review.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildGmcCanyonAt4xParts,
  scorePickupVehicle,
} from "../src/index.js";

const thresholdArg = process.argv.find((arg) => arg.startsWith("--threshold="));
const threshold = thresholdArg ? Number(thresholdArg.split("=")[1]) : 0.78;
const parts = buildGmcCanyonAt4xParts();
const report = scorePickupVehicle(parts);

const outDir = resolve(process.cwd(), "out", "quality");
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "gmc-canyon-at4x-quality.json"), JSON.stringify(report, null, 2));

console.log(report.feedback);
console.log("metrics:", JSON.stringify(report.metrics));
console.log("measurements:", JSON.stringify(report.measurements));
console.log("written: out/quality/gmc-canyon-at4x-quality.json");

if (report.score < threshold) {
  console.error(`pickup quality gate failed: ${report.score.toFixed(3)} < ${threshold.toFixed(3)}`);
  process.exit(1);
}
