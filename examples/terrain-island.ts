/**
 * Procedural terrain island — mountains, coastline, river, cliffs, boulders and
 * tree proxies.
 *
 * Run: pnpm terrain-island
 */
import {
  buildTerrainIslandParts,
  merge,
  scoreTerrainIsland,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const parts = buildTerrainIslandParts({
  size: 10.5,
  resolution: 72,
  height: 2.35,
  noiseScale: 1.25,
  islandFalloff: 1.55,
  seaLevel: 0.05,
  riverWidth: 0.48,
  riverDepth: 0.62,
  cliffStrength: 0.78,
  rocks: 34,
  trees: 70,
  seed: 43,
});

const { obj, mtl } = toOBJScene(parts, "terrain-island.mtl");
const model = toViewerModel(parts, "terrain-island");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "terrain-island.obj"), obj);
fs.writeFileSync(path.join(outDir, "terrain-island.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "terrain-island.json"), JSON.stringify(model, null, 2));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "terrain-island", name: "程序化岛屿地貌", file: "terrain-island.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const merged = merge(...parts.map((p) => p.mesh));
const score = scoreTerrainIsland(parts);
console.log(`terrain island: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log(`bbox source parts merged: ${merged.positions.length} verts`);
console.log(score.feedback);
console.log("written: out/terrain-island.{obj,mtl,json} + out/models.json");
