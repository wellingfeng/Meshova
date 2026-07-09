/**
 * Procedural freeway — Meshova's take on the CitySample freeway kit. Two
 * opposing carriageways split by a central Jersey barrier, dashed lane lines,
 * yellow edge lines and steel guardrails, on an S-curve centerline. Set
 * `elevation > 0` for a viaduct on pillars.
 *
 * Run: pnpm freeway
 */
import {
  buildFreewayParts,
  merge,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const parts = buildFreewayParts({
  length: 64,
  bend: 9,
  lanesPerSide: 3,
  laneWidth: 3.5,
  medianWidth: 1.4,
  elevation: 0,
  guardrails: true,
  pillars: true,
  pillarSpacing: 12,
  sample: 1.2,
});

const { obj, mtl } = toOBJScene(parts, "freeway.mtl");
const model = toViewerModel(parts, "freeway");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "freeway.obj"), obj);
fs.writeFileSync(path.join(outDir, "freeway.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "freeway.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "freeway", name: "程序化高速", file: "freeway.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const merged = merge(...parts.map((p) => p.mesh));
console.log(`freeway: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log(`bbox source verts: ${merged.positions.length}`);
console.log("written: out/freeway.{obj,mtl,json} + out/models.json");
