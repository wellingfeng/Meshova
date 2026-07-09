/**
 * Chinese classical timber hall — reference model for the 殿堂 category.
 *
 * Demonstrates the 0..6 construction order (台基→柱→额枋→斗拱→曲面屋顶→墙→脊兽)
 * with the defining concave 举架 roof + upturned 翼角 corners. Param + seed
 * driven, so the same inputs always produce the same hall.
 *
 * Run: pnpm tsx examples/chinese-hall.ts
 */
import {
  buildChineseHallParts,
  merge,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const parts = buildChineseHallParts({
  baysX: 5,
  baysZ: 3,
  bayWidth: 2.2,
  bayDepth: 1.9,
  columnHeight: 3.0,
  roofRise: 0.36,
  roofConcavity: 0.55,
  cornerUpturn: 0.7,
  roof: "hip",
  dougong: true,
  ridgeBeasts: true,
  walls: true,
  seed: 9,
});

const { obj, mtl } = toOBJScene(parts, "chinese-hall.mtl");
const model = toViewerModel(parts, "chinese-hall");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "chinese-hall.obj"), obj);
fs.writeFileSync(path.join(outDir, "chinese-hall.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "chinese-hall.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "chinese-hall", name: "中式古建·殿堂", file: "chinese-hall.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const merged = merge(...parts.map((p) => p.mesh));
console.log(`chinese-hall: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log(`parts: ${parts.map((p) => p.name).join(", ")}`);
console.log(`merged verts: ${merged.positions.length}`);
console.log("written: out/chinese-hall.{obj,mtl,json} + out/models.json");

