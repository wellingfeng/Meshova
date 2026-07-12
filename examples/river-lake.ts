import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  buildRiverLakeParts,
  scoreRiverLake,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const outDir = resolve(process.cwd(), "out");
mkdirSync(outDir, { recursive: true });

const id = "river-lake";
const parts = buildRiverLakeParts();
const viewerModel = toViewerModel(parts, id);
const { obj, mtl } = toOBJScene(parts, `${id}.mtl`);
writeFileSync(join(outDir, `${id}.json`), JSON.stringify(viewerModel, null, 2));
writeFileSync(join(outDir, `${id}.obj`), obj);
writeFileSync(join(outDir, `${id}.mtl`), mtl);

const manifestPath = join(outDir, "models.json");
let manifest: { models: Array<Record<string, unknown>> } = { models: [] };
if (existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = { models: [] };
  }
}
manifest.models = manifest.models.filter((model) => model.id !== id);
manifest.models.push({
  id,
  name: "PCG 河流湖泊回水",
  file: `${id}.json`,
  category: "地形",
  description: "复刻 Houdini PCG 河流入湖：湖面边界、回水剖面、顺坡河床、连续岸线。",
  tags: ["Houdini", "PCG", "河流", "湖泊", "回水"],
  source: "BV1ndiWBfEXo",
});
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`river-lake: ${JSON.stringify(scoreRiverLake(parts))}`);
console.log("written: out/river-lake.{json,obj,mtl} + out/models.json");
