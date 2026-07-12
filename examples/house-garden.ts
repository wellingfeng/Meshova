/**
 * House-garden variants — nine separate procedural house lots.
 *
 * Reference target: compact little houses on square garden trays, with paths,
 * fences, shrubs, flower beds and rounded trees. This script writes each lot
 * as its own model so the viewer/library does not hide them inside one board.
 *
 * Run: pnpm house-garden
 */
import fs from "node:fs";
import path from "node:path";
import {
  buildHouseGardenParts,
  HOUSE_GARDEN_VARIANTS,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string; category?: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}

const ids = new Set(["house-garden", ...HOUSE_GARDEN_VARIANTS.map((variant) => variant.id)]);
manifest.models = manifest.models.filter((model) => !ids.has(model.id));

for (const variant of HOUSE_GARDEN_VARIANTS) {
  const parts = buildHouseGardenParts({ ...variant.params, variants: 1 });
  const { obj, mtl } = toOBJScene(parts, `${variant.id}.mtl`);
  const model = toViewerModel(parts, variant.id);

  fs.writeFileSync(path.join(outDir, `${variant.id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${variant.id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${variant.id}.json`), JSON.stringify(model, null, 2));
  manifest.models.push({
    id: variant.id,
    name: variant.name,
    file: `${variant.id}.json`,
    category: "房子和花园",
  });

  console.log(`${variant.id}: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log("written: out/house-garden-01..09.{obj,mtl,json} + out/models.json");
