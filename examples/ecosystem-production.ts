import {
  buildEcosystemFeatureParts,
  toOBJScene,
  toViewerModel,
  type EcosystemFeature,
} from "../src/index.js";

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

const models: ReadonlyArray<{ id: string; name: string; feature: EcosystemFeature }> = [
  { id: "ecosystem-brush-editor", name: "生态笔刷编辑器", feature: "brush-editor" },
  { id: "biome-blend-world", name: "多 Biome 混合世界", feature: "biome-blend" },
  { id: "ecosystem-bake-pipeline", name: "生态 Bake 生产管线", feature: "bake-contract" },
  { id: "ecological-association", name: "生态关联规则", feature: "association-rules" },
  { id: "ecosystem-lod-streaming", name: "生态分块流送与 LOD", feature: "lod-streaming" },
  { id: "terrain-ecology-feedback", name: "地形—生态反馈", feature: "terrain-feedback" },
  { id: "ecosystem-succession", name: "季节与生态演替", feature: "succession" },
];

for (const item of models) {
  const parts = buildEcosystemFeatureParts(item.feature);
  const { obj, mtl } = toOBJScene(parts, `${item.id}.mtl`);
  fs.writeFileSync(path.join(outDir, `${item.id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${item.id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${item.id}.json`), JSON.stringify(toViewerModel(parts, item.id)));
  console.log(`${item.id}: ${parts.length} parts, ${parts.reduce((sum, part) => sum + part.mesh.indices.length / 3, 0)} tris`);
}

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const ids = new Set(models.map((item) => item.id));
manifest.models = manifest.models.filter((item) => !ids.has(item.id));
manifest.models.push(...models.map((item) => ({ id: item.id, name: item.name, file: `${item.id}.json` })));
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log("written: out/ecosystem-*.{obj,mtl,json} + out/models.json");
