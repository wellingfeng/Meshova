import {
  BLENDER_119_SCENES,
  buildBlender119SceneParts,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out", "blender-119");
fs.mkdirSync(outDir, { recursive: true });

const manifestPath = path.resolve(process.cwd(), "out", "models.json");
let manifest: { models: Array<Record<string, unknown>> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = { models: [] };
  }
}
if (!Array.isArray(manifest.models)) manifest.models = [];

for (const scene of BLENDER_119_SCENES) {
  const parts = buildBlender119SceneParts(scene);
  const { obj, mtl } = toOBJScene(parts, `${scene.id}.mtl`);
  fs.writeFileSync(path.join(outDir, `${scene.id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${scene.id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${scene.id}.json`), JSON.stringify(toViewerModel(parts, scene.name)));

  const entry = {
    id: scene.id,
    name: `百景 ${String(scene.page).padStart(3, "0")} · ${scene.name}`,
    file: `blender-119/${scene.id}.json`,
    category: "Blender 百景复刻",
  };
  const index = manifest.models.findIndex((candidate) => candidate?.id === scene.id);
  if (index >= 0) manifest.models[index] = { ...manifest.models[index], ...entry };
  else manifest.models.push(entry);
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`已生成 ${BLENDER_119_SCENES.length} 个 Blender 百景程序化模型。`);
