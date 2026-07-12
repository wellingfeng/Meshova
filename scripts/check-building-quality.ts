/**
 * Deterministic quality gate for the procedural building template.
 *
 * Render-free and CI-friendly: checks named parts, roof/cornice assembly,
 * material semantics and basic massing before screenshot/VLM review.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildBuildingParts,
  scoreBuilding,
} from "../src/index.js";

const thresholdArg = process.argv.find((arg) => arg.startsWith("--threshold="));
const threshold = thresholdArg ? Number(thresholdArg.split("=")[1]) : 0.82;
const parts = buildBuildingParts({ roof: "gable", width: 5, depth: 4, floors: 6, setback: 0.02 });
const report = scoreBuilding(parts);

const outDir = resolve(process.cwd(), "out", "quality");
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "building-quality.json"), JSON.stringify(report, null, 2));

console.log(report.feedback);
console.log("metrics:", JSON.stringify(report.metrics));
console.log("written: out/quality/building-quality.json");

if (report.score < threshold) {
  console.error(`building quality gate failed: ${report.score.toFixed(3)} < ${threshold.toFixed(3)}`);
  process.exit(1);
}
