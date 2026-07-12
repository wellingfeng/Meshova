import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  buildRockBorderSceneParts,
  toOBJScene,
  toViewerModel,
  type RockBorderScenePreset,
} from "../src/index.js";

const outDir = resolve(process.cwd(), "out");
mkdirSync(outDir, { recursive: true });

const scenes: Array<{ id: string; name: string; preset: RockBorderScenePreset; seed: number }> = [
  { id: "rock-border-river-gorge", name: "河谷岩石包边", preset: "river-gorge", seed: 31 },
  { id: "rock-border-crater-lake", name: "火山湖岩石包边", preset: "crater-lake", seed: 47 },
  { id: "rock-border-mesa-rim", name: "台地悬崖包边", preset: "mesa-rim", seed: 73 },
];

const manifestPath = join(outDir, "models.json");
let manifest: { models: Array<Record<string, unknown>> } = { models: [] };
if (existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = { models: [] };
  }
}

for (const scene of scenes) {
  const parts = buildRockBorderSceneParts({ preset: scene.preset, seed: scene.seed });
  const viewerModel = toViewerModel(parts, scene.id);
  const { obj, mtl } = toOBJScene(parts, `${scene.id}.mtl`);
  writeFileSync(join(outDir, `${scene.id}.json`), JSON.stringify(viewerModel, null, 2));
  writeFileSync(join(outDir, `${scene.id}.obj`), obj);
  writeFileSync(join(outDir, `${scene.id}.mtl`), mtl);
  manifest.models = manifest.models.filter((model) => model.id !== scene.id);
  manifest.models.push({
    id: scene.id,
    name: scene.name,
    file: `${scene.id}.json`,
    category: "地形",
    description: "连续崖壁封缝，多原型岩石按曲线覆盖约束、错层生成。",
    tags: ["Houdini", "岩石包边", "曲线", "程序化"],
    source: "BV12H4y1578d",
  });
  console.log(`${scene.id}: ${viewerModel.meta.verts} verts, ${viewerModel.meta.tris} tris`);
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log("written: out/rock-border-*.{json,obj,mtl} + out/models.json");
