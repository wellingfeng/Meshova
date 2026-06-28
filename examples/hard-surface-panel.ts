/**
 * Procedural hard-surface kit — chamfered chassis, panels, vents, bolts, pipes
 * and seeded greebles.
 *
 * Run: pnpm hard-surface
 */
import {
  buildHardSurfaceKitParts,
  merge,
  scoreHardSurfaceKit,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const parts = buildHardSurfaceKitParts({
  width: 3.2,
  height: 1.25,
  depth: 2.1,
  bevel: 0.085,
  panelCols: 3,
  panelRows: 2,
  ventCols: 3,
  ventRows: 5,
  bolts: 16,
  pipes: 5,
  greebles: 28,
  seed: 31,
});

const { obj, mtl } = toOBJScene(parts, "hard-surface-kit.mtl");
const model = toViewerModel(parts, "hard-surface-kit");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "hard-surface-kit.obj"), obj);
fs.writeFileSync(path.join(outDir, "hard-surface-kit.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "hard-surface-kit.json"), JSON.stringify(model, null, 2));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "hard-surface-kit", name: "硬表面工业设备", file: "hard-surface-kit.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const merged = merge(...parts.map((p) => p.mesh));
const score = scoreHardSurfaceKit(parts);
console.log(`hard-surface kit: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log(`bbox source parts merged: ${merged.positions.length} verts`);
console.log(score.feedback);
console.log("written: out/hard-surface-kit.{obj,mtl,json} + out/models.json");
