/**
 * Procedural interior room — room shell + furniture + articulated door/drawers.
 *
 * Run: pnpm interior-room
 */
import {
  buildInteriorRoom,
  merge,
  scoreInteriorRoom,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const scene = buildInteriorRoom({
  width: 7.4,
  depth: 5.4,
  wallHeight: 3.1,
  furnitureScale: 1.0,
  chairs: 4,
  shelves: 5,
  clutter: 18,
  doorOpen: 0.42,
  drawerOpen: 0.38,
  seed: 23,
});

const { obj, mtl } = toOBJScene(scene.parts, "interior-room.mtl");
const model = toViewerModel(scene.parts, "interior-room");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "interior-room.obj"), obj);
fs.writeFileSync(path.join(outDir, "interior-room.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "interior-room.json"), JSON.stringify({
  ...model,
  joints: scene.joints,
}, null, 2));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "interior-room", name: "程序化室内房间", file: "interior-room.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const merged = merge(...scene.parts.map((p) => p.mesh));
const score = scoreInteriorRoom(scene.parts, scene.joints);
console.log(`interior room: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log(`bbox source parts merged: ${merged.positions.length} verts`);
console.log(score.feedback);
console.log("written: out/interior-room.{obj,mtl,json} + out/models.json");
