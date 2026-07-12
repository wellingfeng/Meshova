/**
 * Procedural game map from a Houdini-style road-network workflow.
 *
 * Run: pnpm procedural-game-map
 */
import {
  buildProceduralGameMap,
  merge,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const map = buildProceduralGameMap({
  size: 190,
  boundarySides: 15,
  boundaryJitter: 0.17,
  targetBlockArea: 920,
  minBlockArea: 260,
  streetWidth: 8.5,
  streetTaper: 0.84,
  roadCurveAmount: 2.6,
  maxBuildings: 36,
  propDensity: 0.9,
  gameplayMarkers: true,
  streetProps: true,
  seed: 91,
});

const { obj, mtl } = toOBJScene(map.parts, "procedural-game-map.mtl");
const model = toViewerModel(map.parts, "procedural-game-map");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "procedural-game-map.obj"), obj);
fs.writeFileSync(path.join(outDir, "procedural-game-map.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "procedural-game-map.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<Record<string, unknown>> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = { models: [] };
  }
}
if (!Array.isArray(manifest.models)) manifest.models = [];
const now = new Date().toISOString();
const entry = {
  id: "procedural-game-map",
  name: "程序化游戏地图",
  file: "procedural-game-map.json",
  category: "meshova",
};
const at = manifest.models.findIndex((m) => m && m.id === entry.id);
if (at >= 0) manifest.models[at] = { ...manifest.models[at], ...entry, updatedAt: now };
else manifest.models.push({ ...entry, createdAt: now, updatedAt: now });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

const merged = merge(...map.parts.map((part) => part.mesh));
console.log(
  `game map: ${map.summary.blockCount} blocks, ${map.summary.streetCount} streets, ${map.parts.length} parts, ${merged.positions.length} verts`,
);
console.log(`zones: ${JSON.stringify(map.summary.zoneCounts)}`);
console.log("written: out/procedural-game-map.{obj,mtl,json} + out/models.json");
