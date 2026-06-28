/**
 * Cartoon mech pilot — procedural character model inspired by a Sketchfab
 * reference page, rebuilt from Meshova primitives and procedural surfaces.
 *
 * Run: pnpm tsx examples/cartoon-mech-pilot.ts
 */
import {
  buildCartoonMechPilotParts,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const parts = buildCartoonMechPilotParts();
const { obj, mtl } = toOBJScene(parts, "cartoon-mech-pilot.mtl");
const model = toViewerModel(parts, "cartoon-mech-pilot");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "cartoon-mech-pilot.obj"), obj);
fs.writeFileSync(path.join(outDir, "cartoon-mech-pilot.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "cartoon-mech-pilot.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = {
  models: [],
};
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "cartoon-mech-pilot", name: "卡通机甲驾驶员", file: "cartoon-mech-pilot.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(
  `cartoon mech pilot: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`,
);
console.log("written: out/cartoon-mech-pilot.{obj,mtl,json} + out/models.json");
