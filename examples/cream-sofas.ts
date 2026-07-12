/** Generate both procedural replicas from the cream-sofa Blender reference pack. */
import fs from "node:fs";
import path from "node:path";
import {
  buildCreamSofaParts,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

const variants = [
  { id: "cream-sofa-quilted", name: "奶油风绗缝沙发", variant: "quilted" as const },
  { id: "cream-sofa-wrap", name: "奶油风环抱沙发", variant: "wrap" as const },
];

for (const variant of variants) {
  const parts = buildCreamSofaParts({ variant: variant.variant });
  const { obj, mtl } = toOBJScene(parts, `${variant.id}.mtl`);
  const model = toViewerModel(parts, variant.id);
  fs.writeFileSync(path.join(outDir, `${variant.id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${variant.id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${variant.id}.json`), JSON.stringify(model));
  console.log(`${variant.name}: ${model.meta.parts} parts, ${model.meta.tris} tris`);
}

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* Rebuild invalid manifest. */
  }
}
const ids = new Set(variants.map((variant) => variant.id));
manifest.models = manifest.models.filter((model) => !ids.has(model.id));
manifest.models.push(...variants.map((variant) => ({
  id: variant.id,
  name: variant.name,
  file: `${variant.id}.json`,
})));
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log("written: out/cream-sofa-{quilted,wrap}.{obj,mtl,json}");
