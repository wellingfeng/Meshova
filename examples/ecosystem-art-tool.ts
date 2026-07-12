import {
  buildEcosystemArtToolParts,
  summarizeEcosystemArtTool,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const parts = buildEcosystemArtToolParts();
const { obj, mtl } = toOBJScene(parts, "ecosystem-art-tool.mtl");
const model = toViewerModel(parts, "ecosystem-art-tool");
const summary = summarizeEcosystemArtTool(parts);

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "ecosystem-art-tool.obj"), obj);
fs.writeFileSync(path.join(outDir, "ecosystem-art-tool.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "ecosystem-art-tool.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "ecosystem-art-tool", name: "生态艺术工具（视频复刻）", file: "ecosystem-art-tool.json" };
manifest.models = manifest.models.filter((item) => item.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`ecosystem: ${summary.totalInstances} instances, ${summary.chunkCount} chunks, ${summary.triangleCount} tris`);
console.log("written: out/ecosystem-art-tool.{obj,mtl,json} + out/models.json");
