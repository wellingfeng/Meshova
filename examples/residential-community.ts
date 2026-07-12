/** Build the complete residential-community library model and export assets. */
import {
  buildResidentialCommunityParts,
  merge,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const parts = buildResidentialCommunityParts({
  seed: 37,
  siteWidth: 112,
  siteDepth: 84,
  towerRows: 2,
  towersPerRow: 4,
  towerFloors: 15,
  floorVariation: 3,
  wallHeight: 2.1,
  treeDensity: 0.72,
  includeFreeway: true,
  freewayElevation: 8,
});

const { obj, mtl } = toOBJScene(parts, "residential-community.mtl");
const model = toViewerModel(parts, "residential-community");
model.meta.category = "城市与建筑";
model.meta.description = "总装Grammar生成的完整住宅小区，含入口、环路、住宅、公共设施、绿化与高架高速。";

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "residential-community.obj"), obj);
fs.writeFileSync(path.join(outDir, "residential-community.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "residential-community.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "residential-community", name: "程序化完整小区", file: "residential-community.json" };
manifest.models = manifest.models.filter((item) => item.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const merged = merge(...parts.map((part) => part.mesh));
console.log(`residential community: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log(`bbox source verts: ${merged.positions.length}`);
console.log("written: out/residential-community.{obj,mtl,json} + out/models.json");
