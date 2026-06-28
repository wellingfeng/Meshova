/**
 * Material preview sphere — the standard PBR preview target. Pick a material
 * preset in the viewer to see it shaded on this sphere (P6 "material shows up
 * correctly on a standard preview ball").
 *
 * Run: pnpm tsx examples/preview-sphere.ts
 */
import { sphere, toViewerModel } from "../src/index.js";

const model = toViewerModel(
  [{ name: "preview", mesh: sphere(1, 64, 48), color: [0.8, 0.8, 0.8] }],
  "preview-sphere",
);

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "preview-sphere.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest = { models: [] };
if (fs.existsSync(manifestPath)) {
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch {}
}
const entry = { id: "preview-sphere", name: "材质预览球", file: "preview-sphere.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`preview-sphere: ${model.meta.verts} verts -> out/preview-sphere.json`);
