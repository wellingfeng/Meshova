/**
 * Procedural railway — crushed-stone ballast bed, timber sleepers and two steel
 * rails swept along a deterministic S-curve centerline. Set `concreteSleepers`
 * for a modern concrete-tie track, `bend: 0` for dead-straight track.
 *
 * Run: pnpm railway
 */
import {
  buildRailwayParts,
  merge,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const parts = buildRailwayParts({
  length: 40,
  bend: 6,
  gauge: 1.435,
  sleeperSpacing: 0.6,
  concreteSleepers: false,
  sample: 0.8,
});

const { obj, mtl } = toOBJScene(parts, "railway.mtl");
const model = toViewerModel(parts, "railway");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "railway.obj"), obj);
fs.writeFileSync(path.join(outDir, "railway.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "railway.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "railway", name: "程序化铁路", file: "railway.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const merged = merge(...parts.map((p) => p.mesh));
console.log(`railway: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log(`bbox source verts: ${merged.positions.length}`);
console.log("written: out/railway.{obj,mtl,json} + out/models.json");
