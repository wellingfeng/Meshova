/**
 * Deterministic quality gate for classic coupe templates.
 *
 * Render-free and CI-friendly: checks long-low coupe skeleton, hardtop glass,
 * whitewall wheels, chrome/paint/glass semantics and turntable solidity before
 * screenshot/reference review.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildBuickRiviera1965Parts,
  scoreClassicCoupeVehicle,
} from "../src/index.js";

const thresholdArg = process.argv.find((arg) => arg.startsWith("--threshold="));
const threshold = thresholdArg ? Number(thresholdArg.split("=")[1]) : 0.8;
const parts = buildBuickRiviera1965Parts();
const report = scoreClassicCoupeVehicle(parts);

const outDir = resolve(process.cwd(), "out", "quality");
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "buick-riviera-1965-quality.json"), JSON.stringify(report, null, 2));

console.log(report.feedback);
console.log("metrics:", JSON.stringify(report.metrics));
console.log("measurements:", JSON.stringify(report.measurements));
console.log("written: out/quality/buick-riviera-1965-quality.json");

if (report.score < threshold) {
  console.error(`classic coupe quality gate failed: ${report.score.toFixed(3)} < ${threshold.toFixed(3)}`);
  process.exit(1);
}
