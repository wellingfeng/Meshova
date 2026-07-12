import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { buildWaterfallParts, scoreWaterfall, toOBJScene, toViewerModel } from "../src/index.js";

const outDir = resolve(process.cwd(), "out");
mkdirSync(outDir, { recursive: true });

const id = "waterfall";
const parts = buildWaterfallParts();
const viewerModel = toViewerModel(parts, id);
const { obj, mtl } = toOBJScene(parts, `${id}.mtl`);
writeFileSync(join(outDir, `${id}.json`), JSON.stringify(viewerModel, null, 2));
writeFileSync(join(outDir, `${id}.obj`), obj);
writeFileSync(join(outDir, `${id}.mtl`), mtl);

const manifestPath = join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = { models: [] };
  }
}
manifest.models = manifest.models.filter((model) => model.id !== id);
manifest.models.push({ id, name: "程序化瀑布", file: `${id}.json` });
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`waterfall: ${JSON.stringify(scoreWaterfall(parts))}`);
console.log("written: out/waterfall.{json,obj,mtl} + out/models.json");
