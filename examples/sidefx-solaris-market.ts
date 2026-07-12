/**
 * SideFX Solaris Market inspired scene.
 *
 * Run: pnpm sidefx:solaris-market
 */
import {
  buildSolarisMarketParts,
  summarizeSolarisMarket,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const parts = buildSolarisMarketParts({
  stalls: 2,
  shelfRows: 3,
  jarsPerShelf: 10,
  propDensity: 0.82,
  backgroundBuildings: 3,
  sandRelief: 0.28,
  seed: 205,
});

const { obj, mtl } = toOBJScene(parts, "sidefx-solaris-market.mtl");
const model = toViewerModel(parts, "sidefx-solaris-market");
const summary = summarizeSolarisMarket(parts);

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "sidefx-solaris-market.obj"), obj);
fs.writeFileSync(path.join(outDir, "sidefx-solaris-market.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "sidefx-solaris-market.json"), JSON.stringify(model, null, 2));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string; category?: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = {
  id: "sidefx-solaris-market",
  name: "SideFX Solaris 市集",
  file: "sidefx-solaris-market.json",
  category: "SideFX 参考复刻",
};
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(
  `sidefx solaris market: ${summary.parts} parts, ${summary.triangles} tris, ` +
    `${summary.width.toFixed(1)} x ${summary.depth.toFixed(1)} x ${summary.height.toFixed(1)}`,
);
console.log("written: out/sidefx-solaris-market.{obj,mtl,json} + out/models.json");
