import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  applyWeatherStack,
  exportPBR,
  manholeCover,
  materialFromFields,
  validateMaterial,
  type WeatherStackOptions,
} from "../src/index.js";

const size = Number(process.argv[2] ?? 512);
if (!Number.isInteger(size) || size < 16 || size > 2048) {
  throw new Error("尺寸必须是 16–2048 的整数。");
}

const states: Record<string, WeatherStackOptions> = {
  rain: { seed: 61, wetness: 0.9, dirt: 0.3, rust: 0.18, moss: 0.08 },
  neglected: { seed: 61, wetness: 0.28, dirt: 0.72, rust: 0.82, moss: 0.48 },
  overgrown: { seed: 61, wetness: 0.52, dirt: 0.42, rust: 0.3, moss: 0.92 },
  winter: { seed: 61, wetness: 0.18, dirt: 0.16, rust: 0.12, moss: 0.04, snow: 0.92 },
};
const base = materialFromFields(size, manholeCover({
  seed: 43,
  wear: 0.26,
  dirt: 0,
  groundBlend: 0.28,
}));
const outputRoot = path.resolve(process.cwd(), "out", "materials", "weather-stack");

for (const [state, options] of Object.entries(states)) {
  const material = applyWeatherStack(base, options).material;
  const problems = validateMaterial(material);
  if (problems.length > 0) throw new Error(`${state}: ${problems.join("; ")}`);
  const outputDirectory = path.join(outputRoot, state);
  mkdirSync(outputDirectory, { recursive: true });
  for (const [filename, bytes] of Object.entries(exportPBR(material, state).files)) {
    writeFileSync(path.join(outputDirectory, filename), bytes);
  }
}
console.log(`统一天气层：${size}x${size} × ${Object.keys(states).length} -> ${outputRoot}`);
