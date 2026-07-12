/** Generate and register advanced Grasshopper-inspired Meshova models. */
import {
  buildMeshReactionShellParts,
  buildOrigamiPavilionParts,
  buildSuperformulaTowerParts,
  toOBJScene,
  toViewerModel,
  type NamedPart,
} from "../src/index.js";

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

interface Scene {
  id: string;
  name: string;
  description: string;
  parts: NamedPart[];
}

const scenes: Scene[] = [
  {
    id: "grasshopper-mesh-reaction-shell",
    name: "曲面反应扩散壳",
    description: "任意三角网格上的 Gray-Scott 扩散与法线位移",
    parts: buildMeshReactionShellParts(),
  },
  {
    id: "grasshopper-superformula-tower",
    name: "Superformula 扭转塔",
    description: "超公式截面、锥化、鼓度和扭转组合",
    parts: buildSuperformulaTowerParts(),
  },
  {
    id: "grasshopper-origami-pavilion",
    name: "XPBD 折纸展亭",
    description: "显式目标二面角约束驱动的折纸屋面",
    parts: buildOrigamiPavilionParts(),
  },
];

const entries = [];
for (const scene of scenes) {
  const { obj, mtl } = toOBJScene(scene.parts, `${scene.id}.mtl`);
  const viewer = toViewerModel(scene.parts, scene.id);
  viewer.meta.category = "Grasshopper 高级复刻";
  viewer.meta.description = scene.description;
  viewer.meta.source = "Clean-room Meshova implementation";
  fs.writeFileSync(path.join(outDir, `${scene.id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${scene.id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${scene.id}.json`), JSON.stringify(viewer, null, 2));
  entries.push({ id: scene.id, name: scene.name, file: `${scene.id}.json`, category: "Grasshopper 高级复刻" });
}

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string; category?: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    // Invalid generated manifest: rebuild entries below.
  }
}
const ids = new Set(entries.map((entry) => entry.id));
manifest.models = manifest.models.filter((entry) => !ids.has(entry.id));
manifest.models.push(...entries);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

for (const scene of scenes) {
  const verts = scene.parts.reduce((sum, part) => sum + part.mesh.positions.length, 0);
  const tris = scene.parts.reduce((sum, part) => sum + part.mesh.indices.length / 3, 0);
  console.log(`${scene.id}: ${scene.parts.length} parts, ${verts} verts, ${tris} tris`);
}
