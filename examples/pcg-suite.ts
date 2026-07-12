/**
 * PCG suite — road + buildings + interior + forest + snow + trench.
 *
 * Run: pnpm pcg-suite
 */
import {
  buildPcgSuite,
  summarizePcgSuite,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const suite = buildPcgSuite({
  seed: 50,
  size: 72,
  terrainResolution: 72,
  forestCandidates: 320,
  snowPatches: 70,
  buildingCount: 6,
  includeInterior: true,
  includeTrench: true,
});

const { obj, mtl } = toOBJScene(suite.parts, "pcg-suite.mtl");
const model = {
  ...toViewerModel(suite.parts, "pcg-suite"),
  pcgFlows: suite.flows,
};

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "pcg-suite.obj"), obj);
fs.writeFileSync(path.join(outDir, "pcg-suite.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "pcg-suite.json"), JSON.stringify(model, null, 2));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "pcg-suite", name: "PCG 教程能力合集", file: "pcg-suite.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const summary = summarizePcgSuite(suite);
console.log(`pcg suite: ${summary.partCount} parts, ${summary.vertexCount} verts, ${summary.triangleCount} tris`);
for (const flow of suite.flows) {
  console.log(`${flow.kind}: ${flow.input} -> ${flow.output} via ${flow.operators.join(", ")}`);
}
console.log("written: out/pcg-suite.{obj,mtl,json} + out/models.json");
