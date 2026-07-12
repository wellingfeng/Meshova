import fs from "node:fs";
import path from "node:path";
import {
  TEXTILE_LIBRARY,
  exportPBR,
  materialFromFields,
  validateMaterial,
} from "../src/index.js";

const size = 512;
const outRoot = path.resolve(process.cwd(), "out", "materials", "bilibili-textile-p21");

for (const [name, recipe] of Object.entries(TEXTILE_LIBRARY)) {
  const material = materialFromFields(size, recipe({ seed: 211 }));
  const problems = validateMaterial(material);
  if (problems.length > 0) {
    throw new Error(`${name}: ${problems.join("; ")}`);
  }
  const directory = path.join(outRoot, name);
  fs.mkdirSync(directory, { recursive: true });
  for (const [fileName, bytes] of Object.entries(exportPBR(material, name).files)) {
    fs.writeFileSync(path.join(directory, fileName), bytes);
  }
  console.log(`${name}: ${size}x${size}, 7 maps`);
}

console.log(`done -> ${outRoot}`);
