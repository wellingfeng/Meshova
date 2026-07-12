/** Run: pnpm procedural-building */
import {
  buildProceduralBuilding,
  scoreProceduralBuilding,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const scene = buildProceduralBuilding({
  width: 13.5,
  depth: 9.5,
  footprintShape: "rectangle",
  floors: 4,
  floorHeight: 3,
  facadeModule: 2.3,
  roomColumns: 3,
  corridorWidth: 1.65,
  roofStyle: "gable",
  furnished: true,
  furnitureDensity: 0.88,
  exteriorDetails: true,
  seed: 41,
});

const { obj, mtl } = toOBJScene(scene.parts, "procedural-building.mtl");
const model = toViewerModel(scene.parts, "procedural-building");
const score = scoreProceduralBuilding(scene);
const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "procedural-building.obj"), obj);
fs.writeFileSync(path.join(outDir, "procedural-building.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "procedural-building.json"), JSON.stringify({ ...model, rooms: scene.rooms, stairs: scene.stairs }, null, 2));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "procedural-building", name: "程序化建筑·室内外一体", file: "procedural-building.json" };
manifest.models = manifest.models.filter((item) => item.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`procedural building: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log(`${scene.rooms.length} rooms, ${scene.stairs.length} stair flights`);
console.log(score.feedback);
console.log("written: out/procedural-building.{obj,mtl,json} + out/models.json");
