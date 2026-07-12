import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  DECORATIVE_TEXTILE_LIBRARY,
  exportPBR,
  materialFromFields,
  validateMaterial,
} from "../src/index.js";

const size = 512;
const outputRoot = path.resolve(process.cwd(), "out", "materials", "bilibili-textile-p22-p25");

for (const [name, recipe] of Object.entries(DECORATIVE_TEXTILE_LIBRARY)) {
  const material = materialFromFields(size, recipe({ seed: 307 }));
  const problems = validateMaterial(material);
  if (problems.length > 0) {
    throw new Error(`${name}: ${problems.join("; ")}`);
  }
  const directory = path.join(outputRoot, name);
  mkdirSync(directory, { recursive: true });
  for (const [fileName, bytes] of Object.entries(exportPBR(material, name).files)) {
    writeFileSync(path.join(directory, fileName), bytes);
  }
  console.log(`${name}: ${size}x${size}, 7 maps`);
}

console.log(`done -> ${outputRoot}`);
