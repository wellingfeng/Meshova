import fs from "node:fs";
import path from "node:path";
import {
  buildRaycastAsteroidGardenParts,
  buildRaycastCliffLightsParts,
  buildRaycastRoofGardenParts,
  toOBJScene,
  toViewerModel,
  type NamedPart,
} from "../src/index.js";

interface SceneSpec {
  id: string;
  name: string;
  build: () => NamedPart[];
}

interface ManifestEntry {
  id: string;
  name: string;
  file: string;
  category?: string;
}

const scenes: SceneSpec[] = [
  {
    id: "raycast-roof-garden",
    name: "射线投射屋顶花园",
    build: () => buildRaycastRoofGardenParts(),
  },
  {
    id: "raycast-asteroid-garden",
    name: "径向投射晶体小行星",
    build: () => buildRaycastAsteroidGardenParts(),
  },
  {
    id: "raycast-cliff-lights",
    name: "横向投射岩壁灯阵",
    build: () => buildRaycastCliffLightsParts(),
  },
];

const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: ManifestEntry[] } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = { models: [] };
  }
}

const sceneIds = new Set(scenes.map((scene) => scene.id));
manifest.models = manifest.models.filter((entry) => !sceneIds.has(entry.id));

for (const scene of scenes) {
  const parts = scene.build();
  const viewerModel = toViewerModel(parts, scene.id);
  const { obj, mtl } = toOBJScene(parts, `${scene.id}.mtl`);

  fs.writeFileSync(path.join(outDir, `${scene.id}.json`), JSON.stringify(viewerModel));
  fs.writeFileSync(path.join(outDir, `${scene.id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${scene.id}.mtl`), mtl);
  manifest.models.push({
    id: scene.id,
    name: scene.name,
    file: `${scene.id}.json`,
    category: "程序工作流",
  });

  console.log(
    `${scene.id}: ${viewerModel.meta.parts} parts, ${viewerModel.meta.verts} verts, ${viewerModel.meta.tris} tris`,
  );
}

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log("written: out/raycast-*.{json,obj,mtl} + out/models.json");
