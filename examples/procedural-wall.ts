import fs from "node:fs";
import path from "node:path";
import {
  buildPcgPalisadeWallParts,
  buildSplineStoneWallParts,
  toOBJScene,
  toViewerModel,
  type NamedPart,
} from "../src/index.js";

const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string; category?: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = { models: [] };
  }
}

function emit(id: string, name: string, parts: NamedPart[]): void {
  const { obj, mtl } = toOBJScene(parts, `${id}.mtl`);
  const model = toViewerModel(parts, id);
  fs.writeFileSync(path.join(outDir, `${id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(model));
  manifest.models = manifest.models.filter((entry) => entry.id !== id);
  manifest.models.push({ id, name, file: `${id}.json`, category: "meshova" });
  console.log(`${id}: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
}

emit("pcg-palisade-wall", "PCG 木栅城墙", buildPcgPalisadeWallParts());
emit("spline-stone-wall", "样条石砌围墙", buildSplineStoneWallParts());
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
