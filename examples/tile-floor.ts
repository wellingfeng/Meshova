/**
 * Tiled floor PBR export — exercises the full P11/P12 processing chain via the
 * shared `tileFloor` material builder, so the exact same recipe drives this
 * PNG export and the live browser viewer. Everything is computed from code;
 * no static bitmap is ever a source.
 *
 * Chain (inside tileFloor): brick mask -> floodFillRandom (per-tile color) +
 * bevel (relief) + distanceField (grout) -> curvature/AO -> heightToNormal,
 * with tileSampler(dots) speckle blended into baseColor.
 *
 * Run: pnpm tsx examples/tile-floor.ts
 */
import { tileFloor, validateMaterial, exportPBR } from "../src/index.js";

const SIZE = 512;
const SEED = 21;

const material = tileFloor(SIZE, { seed: SEED });

const problems = validateMaterial(material);
if (problems.length) {
  console.error("material validation FAILED:\n  " + problems.join("\n  "));
  process.exit(1);
}

const { files } = exportPBR(material, "tile-floor");
const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out", "materials", "tile-floor");
fs.mkdirSync(outDir, { recursive: true });
for (const [name, bytes] of Object.entries(files)) {
  fs.writeFileSync(path.join(outDir, name), bytes);
}
console.log(
  `tile-floor: ${SIZE}x${SIZE}, validated OK -> ${Object.keys(files).length} maps`,
);

