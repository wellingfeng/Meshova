import {
  buildPcgPathfinding,
  merge,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const { parts, route } = buildPcgPathfinding();

if (!route.reachedGoal) throw new Error("pathfinding demo could not reach the goal");

const { obj, mtl } = toOBJScene(parts, "pcg-pathfinding.mtl");
const model = toViewerModel(parts, "pcg-pathfinding");
const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "pcg-pathfinding.obj"), obj);
fs.writeFileSync(path.join(outDir, "pcg-pathfinding.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "pcg-pathfinding.json"), JSON.stringify(model, null, 2));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = { models: [] };
  }
}
const entry = {
  id: "pcg-pathfinding",
  name: "PCG 密度寻路",
  file: "pcg-pathfinding.json",
  category: "地形",
};
manifest.models = manifest.models.filter((item) => item.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`path: ${route.pointIndices.length} graph points, cost ${route.cost.toFixed(2)}, visited ${route.visited}`);
console.log(`mesh: ${merge(...parts.map((part) => part.mesh)).positions.length} verts`);
console.log("written: out/pcg-pathfinding.{obj,mtl,json} + out/models.json");
