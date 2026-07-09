/**
 * Urban buildings — six recognizable city-tower archetypes generated from the
 * CitySample-style modular kit (podium/shaft/crown + bay-grid facade). Lays
 * them out in a row so the whole family renders in one scene.
 *
 * All params + seed driven: same seed -> same skyline.
 *
 * Run: pnpm tsx examples/urban-buildings.ts
 */
import {
  buildUrbanBuildingParts,
  translateMesh,
  vec3,
  merge,
  toOBJScene,
  toViewerModel,
  type NamedPart,
  type UrbanStyle,
} from "../src/index.js";

const STYLES: Array<{ style: UrbanStyle; label: string }> = [
  { style: "artDeco", label: "装饰艺术摩天楼" },
  { style: "glassTower", label: "玻璃幕墙塔" },
  { style: "brickWalkup", label: "砖砌公寓" },
  { style: "modernOffice", label: "现代办公楼" },
  { style: "brownstone", label: "褐石排屋" },
  { style: "corporate", label: "企业总部塔" },
];

const SPACING = 9;
const all: NamedPart[] = [];
STYLES.forEach(({ style }, i) => {
  const x = (i - (STYLES.length - 1) / 2) * SPACING;
  const parts = buildUrbanBuildingParts({ style, seed: 7 + i });
  for (const part of parts) {
    all.push({ ...part, name: `${style}_${part.name}`, mesh: translateMesh(part.mesh, vec3(x, 0, 0)) });
  }
});

const { obj, mtl } = toOBJScene(all, "urban-buildings.mtl");
const model = toViewerModel(all, "urban-buildings");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "urban-buildings.obj"), obj);
fs.writeFileSync(path.join(outDir, "urban-buildings.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "urban-buildings.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "urban-buildings", name: "都市建筑合集", file: "urban-buildings.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const merged = merge(...all.map((p) => p.mesh));
console.log(`urban-buildings: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log(`merged verts: ${merged.positions.length}`);
console.log("written: out/urban-buildings.{obj,mtl,json} + out/models.json");
