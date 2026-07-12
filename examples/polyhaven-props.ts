/** Emit the initial Poly Haven preview-based procedural prop set. */
import fs from "node:fs";
import path from "node:path";
import {
  POLY_HAVEN_PROP_MODELS,
  buildPolyHavenPropParts,
} from "../src/models/polyhaven-props.js";
import {
  toOBJScene,
  toViewerModel,
} from "../src/geometry/index.js";

const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    // Rebuild a valid manifest when generated output was interrupted.
  }
}

for (const definition of POLY_HAVEN_PROP_MODELS) {
  const parts = buildPolyHavenPropParts(definition.defaults);
  const viewer = toViewerModel(parts, definition.id);
  const { obj, mtl } = toOBJScene(parts, `${definition.id}.mtl`);
  fs.writeFileSync(path.join(outDir, `${definition.id}.json`), JSON.stringify(viewer, null, 2));
  fs.writeFileSync(path.join(outDir, `${definition.id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${definition.id}.mtl`), mtl);
  manifest.models = manifest.models.filter((entry) => entry.id !== definition.id);
  manifest.models.push({ id: definition.id, name: definition.name, file: `${definition.id}.json` });
  console.log(`${definition.id}: ${viewer.meta.parts} parts, ${viewer.meta.verts} verts, ${viewer.meta.tris} tris`);
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
