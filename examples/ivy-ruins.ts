/**
 * Ivy-covered ruins — stone columns + wall with ivy climbing (adhering to)
 * each surface, modeled on the classic UE PCG demo screenshot. The ivy is grown
 * live by the surface-climbing generator, not baked.
 *
 * Run: pnpm ivy-ruins
 */
import { toOBJScene, toViewerModel } from "../src/index.js";
import { buildIvyRuinsParts, scoreIvyRuins, type NamedPart } from "../src/index.js";

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
function register(id: string, name: string, file: string) {
  manifest.models = manifest.models.filter((m) => m.id !== id);
  manifest.models.push({ id, name, file });
}

function emit(id: string, name: string, parts: NamedPart[]) {
  const { obj, mtl } = toOBJScene(parts);
  const model = toViewerModel(parts, id);
  fs.writeFileSync(path.join(outDir, `${id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(model, null, 2));
  register(id, name, `${id}.json`);
  console.log(`${id}: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris — ${scoreIvyRuins(parts).feedback}`);
}

emit("ivy-ruins", "藤蔓石柱废墟", buildIvyRuinsParts({ seed: 7, columns: 3 }));
emit("ivy-ruins-lush", "藤蔓石柱废墟·繁茂", buildIvyRuinsParts({ seed: 11, columns: 4, lushness: 1.4 }));

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log("written: out/ivy-ruins*.{obj,mtl,json} + out/models.json");

