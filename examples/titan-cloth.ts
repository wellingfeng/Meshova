/**
 * Titan Cloth — from "Tutorial_cloth_tool.hda" (project_titan). Analytic resting
 * drape of a pinned grid (catenary sag + fbm wrinkles), no Vellum solve.
 *
 * Run: pnpm tsx examples/titan-cloth.ts
 */
import { toOBJScene, toViewerModel } from "../src/index.js";
import { buildTitanClothParts, type NamedPart } from "../src/index.js";

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
  console.log(`${id}: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
}

emit("titan-cloth", "泰坦布料", buildTitanClothParts({ pinMode: 'corners', sag: 1.6 }));

// Real XPBD cloth solve: flat grid pinned at the corners, settled under gravity.
emit(
  "titan-cloth-sim",
  "泰坦布料·物理",
  buildTitanClothParts({ physics: true, pinMode: "corners", simSteps: 80, stiffness: 0.9 }),
);

// Classic tablecloth-over-a-ball: no pins, cloth free-falls onto a sphere and
// drapes down into pointed corner folds (matches the reference image).
emit(
  "titan-cloth-drape",
  "泰坦布料·垂盖球",
  buildTitanClothParts({
    physics: true,
    pinMode: "none",
    simSteps: 120,
    stiffness: 0.85,
    colliderRadius: 1.2,
    groundY: 0,
    restHeight: 2.7,
    width: 5,
    depth: 5,
    resolution: 48,
  }),
);

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
