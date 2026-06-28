/**
 * Rusty metal PBR export — uses the shared `rustyMetal` preset so the exact
 * same procedural recipe drives both this PNG export and the live browser
 * preview. The texture is always computed, never a static bitmap.
 *
 * Run: pnpm tsx examples/rusty-metal.ts
 */
import {
  rustyMetal,
  materialFromFields,
  validateMaterial,
  exportPBR,
} from "../src/index.js";

const SIZE = 512;
const material = materialFromFields(SIZE, rustyMetal({ seed: 7 }));

const problems = validateMaterial(material);
if (problems.length) {
  console.error("material validation FAILED:\n  " + problems.join("\n  "));
  process.exit(1);
}

const { files } = exportPBR(material, "rusty-metal");
const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out", "materials", "rusty-metal");
fs.mkdirSync(outDir, { recursive: true });
for (const [name, bytes] of Object.entries(files)) {
  fs.writeFileSync(path.join(outDir, name), bytes);
}
console.log(`rusty-metal: ${SIZE}x${SIZE}, validated OK -> ${Object.keys(files).length} maps`);
