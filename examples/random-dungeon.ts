/**
 * Seeded branching dungeon with connected rooms, corridors and boundary walls.
 *
 * Run: pnpm random-dungeon
 */
import {
  buildRandomDungeon,
  merge,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const dungeon = buildRandomDungeon({
  roomCount: 22,
  minRoomSize: 4,
  maxRoomSize: 9,
  corridorWidth: 2,
  branchiness: 0.68,
  loopChance: 0.22,
  wallHeight: 0.8,
  seed: 147,
});

const { obj, mtl } = toOBJScene(dungeon.parts, "random-dungeon.mtl");
const model = toViewerModel(dungeon.parts, "random-dungeon");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "random-dungeon.obj"), obj);
fs.writeFileSync(path.join(outDir, "random-dungeon.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "random-dungeon.json"), JSON.stringify(model));

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
  id: "random-dungeon",
  name: "随机地牢",
  file: "random-dungeon.json",
  category: "meshova",
};
const at = manifest.models.findIndex((item) => item && item.id === entry.id);
if (at >= 0) manifest.models[at] = { ...manifest.models[at], ...entry, updatedAt: now };
else manifest.models.push({ ...entry, createdAt: now, updatedAt: now });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

const merged = merge(...dungeon.parts.map((part) => part.mesh));
console.log(
  `random dungeon: ${dungeon.summary.roomCount} rooms, ${dungeon.summary.corridorCount} corridors, ${dungeon.summary.loopCount} loops, ${merged.positions.length} verts`,
);
console.log("written: out/random-dungeon.{obj,mtl,json} + out/models.json");
