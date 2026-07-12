/**
 * BlenderHowtos-inspired cookbook: spiral scales, DNA, gradient boxes, garden rain.
 *
 * Run: pnpm blender-howtos
 */
import {
  buildDnaHelixParts,
  buildGradientBoxParts,
  buildRainingGardenParts,
  buildSpiralScalesParts,
  summarizeBlenderHowtos,
  toOBJScene,
  toViewerModel,
  type NamedPart,
} from "../src/index.js";

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

const manifestPath = path.join(outDir, "models.json");
const category = "BlenderHowtos复刻";

interface ManifestEntry {
  id: string;
  name: string;
  file: string;
  category?: string;
}

interface SceneSpec {
  id: string;
  name: string;
  description: string;
  parts: NamedPart[];
}

const scenes: SceneSpec[] = [
  {
    id: "blender-howtos-spiral-scales",
    name: "BlenderHowtos 螺旋鳞片",
    description: "螺旋实例化鳞片和中心茎",
    parts: buildSpiralScalesParts({ count: 62, phase: 0.8 }),
  },
  {
    id: "blender-howtos-dna-helix",
    name: "BlenderHowtos DNA 双螺旋",
    description: "双螺旋曲线、节点珠和横档",
    parts: buildDnaHelixParts({ pairs: 28, phase: 0.56 }),
  },
  {
    id: "blender-howtos-gradient-box",
    name: "BlenderHowtos 渐变盒阵",
    description: "渐变场驱动高度和顶点色",
    parts: buildGradientBoxParts({ cols: 8, rows: 7, ripple: 0.12 }),
  },
  {
    id: "blender-howtos-raining-garden",
    name: "BlenderHowtos 雨中花园",
    description: "圆形花园、草花散布和雨线实例",
    parts: buildRainingGardenParts({ seed: 111, grassCount: 95, flowerCount: 18, rainCount: 42, radius: 1.45 }),
  },
];

let manifest: { models: ManifestEntry[] } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}

const entries: ManifestEntry[] = [];
for (const scene of scenes) {
  const { obj, mtl } = toOBJScene(scene.parts, `${scene.id}.mtl`);
  const model = toViewerModel(scene.parts, scene.id);
  model.meta.category = category;
  model.meta.description = scene.description;
  model.meta.source = "BlenderHowtos-inspired Meshova rewrite";
  fs.writeFileSync(path.join(outDir, `${scene.id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${scene.id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${scene.id}.json`), JSON.stringify(model, null, 2));
  entries.push({ id: scene.id, name: scene.name, file: `${scene.id}.json`, category });
}

const ids = new Set([...entries.map((entry) => entry.id), "blender-howtos"]);
manifest.models = manifest.models.filter((m) => !ids.has(m.id));
manifest.models.push(...entries);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

for (const scene of scenes) {
  const summary = summarizeBlenderHowtos(scene.parts);
  console.log(`${scene.id}: ${summary.partCount} parts, ${summary.vertexCount} verts, ${summary.triangleCount} tris`);
}
console.log(`registered ${entries.length} standalone BlenderHowtos models into out/models.json`);
