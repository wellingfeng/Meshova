/**
 * Bake every SBS reproduction recipe to a PNG channel set under
 * out/sbs-compare/<name>/. The Python comparator then stitches each against the
 * reference bake and reports per-channel diff.
 *
 * Run: pnpm tsx examples/sbs-repro-bake.ts
 */
import { SBS_REPRO, materialFromFields, validateMaterial, exportPBR } from "../src/index.js";
import fs from "node:fs";
import path from "node:path";

const SIZE = 512;
const outRoot = path.resolve(process.cwd(), "out", "sbs-compare");

for (const [name, recipe] of Object.entries(SBS_REPRO)) {
  const material = materialFromFields(SIZE, recipe({}));
  const problems = validateMaterial(material);
  if (problems.length) {
    console.error(`${name}: validation FAILED\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  const { files } = exportPBR(material, name);
  const dir = path.join(outRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [fn, bytes] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, fn), bytes);
  }
  console.log(`${name}: baked ${SIZE}x${SIZE}, ${Object.keys(files).length} maps`);
}
console.log("done ->", outRoot);

