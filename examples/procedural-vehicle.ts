import { buildProceduralVehicleFleet, toOBJScene, toViewerModel, type VehicleBodyStyle } from "../src/index.js";

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
const names: Record<VehicleBodyStyle, string> = { sedan: "程序化轿车", suv: "程序化SUV", pickup: "程序化皮卡", van: "程序化厢式车", bus: "程序化巴士" };
const fleet = buildProceduralVehicleFleet();
const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { manifest = { models: [] }; }
}
for (const style of Object.keys(fleet) as VehicleBodyStyle[]) {
  const id = `procedural-vehicle-${style}`;
  const parts = fleet[style];
  const { obj, mtl } = toOBJScene(parts, `${id}.mtl`);
  const model = toViewerModel(parts, id);
  fs.writeFileSync(path.join(outDir, `${id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(model));
  manifest.models = manifest.models.filter((entry) => entry.id !== id);
  manifest.models.push({ id, name: names[style], file: `${id}.json` });
  console.log(`${names[style]}: ${model.meta.parts} parts, ${model.meta.tris} tris`);
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
