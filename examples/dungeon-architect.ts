import {
  buildDungeonArchitect,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

const id = "dungeon-architect-grid";
const built = buildDungeonArchitect();
const { obj, mtl } = toOBJScene(built.parts, `${id}.mtl`);
const viewer = toViewerModel(built.parts, id);
viewer.meta.category = "程序地牢";
viewer.meta.description = "可复现 Grid 布局、房间图、回环、Marker 与可替换 Theme";
viewer.meta.source = "Meshova original implementation inspired by dungeon-builder workflows";

fs.writeFileSync(path.join(outDir, `${id}.obj`), obj);
fs.writeFileSync(path.join(outDir, `${id}.mtl`), mtl);
fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(viewer, null, 2));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string; category?: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.models = manifest.models.filter((entry) => entry.id !== id);
manifest.models.push({ id, name: "Meshova Dungeon Architect", file: `${id}.json`, category: "程序地牢" });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`${id}: ${built.layout.rooms.length} rooms, ${built.layout.connections.length} connections, ${built.layout.markers.length} markers`);
