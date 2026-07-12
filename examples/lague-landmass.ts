/**
 * Sebastian Lague-style landmass terrain in Meshova.
 *
 * Run:
 *   pnpm tsx examples/lague-landmass.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  buildLandmassTerrain,
  plane,
  toOBJScene,
  toViewerModel,
  transform,
  vec3,
  type NamedPart,
} from "../src/index.js";

const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

const land = buildLandmassTerrain({
  width: 129,
  height: 129,
  seed: 2607,
  scale: 52,
  octaves: 6,
  persistence: 0.48,
  lacunarity: 2.05,
  normalizeMode: "local",
  useFalloff: true,
  falloff: { exponent: 3.2, midpoint: 2.35 },
  size: 14,
  heightMultiplier: 3.2,
  lod: 1,
  erosion: {
    iterations: 18,
    hydraulicStrength: 0.02,
    thermalStrength: 0.055,
    talus: 0.035,
  },
  heightCurve: (h) => Math.pow(h, 1.35),
});

const waterLevel = 0.285 * 3.2;
const parts: NamedPart[] = [
  {
    name: "landmass_heightfield",
    label: "程序化岛屿地貌",
    mesh: land.mesh,
    color: [0.3, 0.42, 0.22],
    colors: land.colors,
    surface: { type: "mossyStone", params: { seed: 2607, moss: 0.46 } },
    metadata: {
      source: "Procedural Landmass Generation 风格流程",
      stages: ["噪声", "octave 分层", "falloff 岛屿边缘", "水力/热力侵蚀", "地形颜色图", "LOD 网格"],
    },
  },
  {
    name: "sea_plane",
    label: "海平面",
    mesh: transform(plane(15, 15, 8, 8), { translate: vec3(0, waterLevel, 0) }),
    color: [0.1, 0.33, 0.62],
    surface: { type: "water", params: { body: "ocean", tint: [0.1, 0.33, 0.62], deepColor: [0.012, 0.06, 0.15], seed: 2608 } },
  },
];

const { obj, mtl } = toOBJScene(parts, "lague-landmass.mtl");
const model = toViewerModel(parts, "lague-landmass");
model.meta.description = "Sebastian Lague 风格程序化地形：分层噪声、岛屿 falloff、水力/热力侵蚀、生物群落颜色、LOD 网格。";
model.meta.seed = 2607;
model.meta.mapSize = "129x129";

fs.writeFileSync(path.join(outDir, "lague-landmass.obj"), obj);
fs.writeFileSync(path.join(outDir, "lague-landmass.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "lague-landmass.json"), JSON.stringify(model, null, 2));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string; category?: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = { models: [] };
  }
}
const entry = { id: "lague-landmass", name: "地形：Lague 风格岛屿", file: "lague-landmass.json", category: "地形" };
manifest.models = manifest.models.filter((model) => model.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`lague-landmass: ${model.meta.verts} verts, ${model.meta.tris} tris`);
