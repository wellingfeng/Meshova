import fs from "node:fs";
import path from "node:path";

import {
  buildCrazyIvyWallParts,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const id = "crazy-ivy-wall";
const name = "Crazy Ivy 爬墙藤蔓复刻";
const outDir = path.resolve("out");
fs.mkdirSync(outDir, { recursive: true });

const parts = buildCrazyIvyWallParts({ seed: 45 });
const { obj, mtl } = toOBJScene(parts, `${id}.mtl`);
const viewerModel = toViewerModel(parts, id);
fs.writeFileSync(path.join(outDir, `${id}.obj`), obj);
fs.writeFileSync(path.join(outDir, `${id}.mtl`), mtl);
fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(viewerModel));

const manifestPath = path.join(outDir, "models.json");
const manifest: { models: Array<{ id: string; name: string; file: string }> } = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : { models: [] };
manifest.models = manifest.models.filter((model) => model.id !== id);
manifest.models.push({ id, name, file: `${id}.json` });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`${id}: ${viewerModel.meta.parts} parts, ${viewerModel.meta.verts} verts, ${viewerModel.meta.tris} tris`);
