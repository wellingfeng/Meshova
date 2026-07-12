/**
 * Four deterministic landmass studies built from the Lague-style terrain
 * pipeline: layered noise, falloff masks, erosion maps, biome colours and
 * LOD-ready meshes.
 *
 * Run: pnpm tsx examples/landmass-gallery.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  buildLandmassMap,
  classifyLandmassTerrain,
  erodeTerrainHeightfield,
  landmassHeightfieldToMesh,
  plane,
  toOBJScene,
  toViewerModel,
  transform,
  vec3,
  type Field2D,
  type LandmassMapOptions,
  type LandmassTerrainType,
  type NamedPart,
} from "../src/index.js";

const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

interface GalleryPreset {
  id: string;
  name: string;
  description: string;
  options: LandmassMapOptions;
  size: number;
  heightMultiplier: number;
  waterLevel?: number;
  terrainTypes: LandmassTerrainType[];
  reshape?: (heightMap: Field2D) => void;
  heightCurve?: (height: number) => number;
}

interface ManifestEntry {
  id: string;
  name: string;
  file: string;
  category: string;
}

const temperateTypes: LandmassTerrainType[] = [
  { id: "deep-water", label: "深水", height: 0.24, color: [0.055, 0.18, 0.34] },
  { id: "shore", label: "沙岸", height: 0.32, color: [0.72, 0.62, 0.4] },
  { id: "grass", label: "草坡", height: 0.55, color: [0.22, 0.4, 0.16] },
  { id: "forest", label: "林线", height: 0.7, color: [0.11, 0.25, 0.1] },
  { id: "rock", label: "裸岩", height: 0.87, color: [0.39, 0.37, 0.34] },
  { id: "snow", label: "积雪", height: 1, color: [0.9, 0.92, 0.93] },
];

const volcanicTypes: LandmassTerrainType[] = [
  { id: "water", label: "海水", height: 0.22, color: [0.04, 0.13, 0.24] },
  { id: "black-sand", label: "黑沙滩", height: 0.3, color: [0.16, 0.14, 0.13] },
  { id: "scrub", label: "火山灌丛", height: 0.46, color: [0.25, 0.29, 0.13] },
  { id: "basalt", label: "玄武岩", height: 0.78, color: [0.2, 0.19, 0.18] },
  { id: "ash", label: "火山灰", height: 0.92, color: [0.34, 0.31, 0.29] },
  { id: "crater", label: "火山口", height: 1, color: [0.18, 0.11, 0.08] },
];

const aridTypes: LandmassTerrainType[] = [
  { id: "basin", label: "干涸盆地", height: 0.22, color: [0.47, 0.34, 0.22] },
  { id: "sandstone", label: "砂岩坡", height: 0.5, color: [0.62, 0.39, 0.22] },
  { id: "mesa", label: "高原台地", height: 0.76, color: [0.48, 0.25, 0.15] },
  { id: "cap-rock", label: "顶盖岩", height: 1, color: [0.29, 0.2, 0.16] },
];

const alpineTypes: LandmassTerrainType[] = [
  { id: "valley", label: "寒冷谷地", height: 0.24, color: [0.18, 0.25, 0.18] },
  { id: "meadow", label: "高山草甸", height: 0.4, color: [0.25, 0.38, 0.2] },
  { id: "rock", label: "裸岩", height: 0.56, color: [0.4, 0.41, 0.42] },
  { id: "snow", label: "积雪", height: 1, color: [0.9, 0.93, 0.96] },
];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function reshapeVolcano(heightMap: Field2D): void {
  for (let y = 0; y < heightMap.height; y++) {
    const nz = y / (heightMap.height - 1) * 2 - 1;
    for (let x = 0; x < heightMap.width; x++) {
      const nx = x / (heightMap.width - 1) * 2 - 1;
      const radius = Math.hypot(nx, nz);
      const ring = Math.exp(-Math.pow((radius - 0.34) / 0.15, 2));
      const crater = Math.exp(-Math.pow(radius / 0.14, 2));
      const island = clamp01(1 - radius * 1.08);
      const index = y * heightMap.width + x;
      const detail = heightMap.data[index]!;
      heightMap.data[index] = clamp01(island * 0.24 + ring * 0.73 + detail * island * 0.18 - crater * 0.5);
    }
  }
}

function reshapeArchipelago(heightMap: Field2D): void {
  const islands = [
    [-0.42, -0.18, 0.48, 0.72],
    [0.33, 0.18, 0.4, 0.64],
    [0.03, -0.48, 0.29, 0.5],
    [0.52, -0.44, 0.2, 0.36],
    [-0.55, 0.48, 0.22, 0.4],
  ] as const;
  for (let y = 0; y < heightMap.height; y++) {
    const nz = y / (heightMap.height - 1) * 2 - 1;
    for (let x = 0; x < heightMap.width; x++) {
      const nx = x / (heightMap.width - 1) * 2 - 1;
      let mask = 0;
      for (const [cx, cz, radius, strength] of islands) {
        const distance = Math.hypot(nx - cx, nz - cz) / radius;
        mask = Math.max(mask, clamp01(1 - distance) * strength);
      }
      const index = y * heightMap.width + x;
      const detail = heightMap.data[index]!;
      heightMap.data[index] = clamp01(mask + (detail - 0.5) * 0.46);
    }
  }
}

function reshapeAlpineRidge(heightMap: Field2D): void {
  for (let y = 0; y < heightMap.height; y++) {
    const nz = y / (heightMap.height - 1) * 2 - 1;
    for (let x = 0; x < heightMap.width; x++) {
      const nx = x / (heightMap.width - 1) * 2 - 1;
      const winding = nx + Math.sin(nz * 4.2) * 0.16;
      const ridge = Math.pow(clamp01(1 - Math.abs(winding) * 1.28), 2.4);
      const taper = clamp01(1 - Math.abs(nz) * 0.38);
      const index = y * heightMap.width + x;
      const detail = heightMap.data[index]!;
      heightMap.data[index] = clamp01(ridge * taper * 0.72 + detail * 0.34);
    }
  }
}

const presets: GalleryPreset[] = [
  {
    id: "landmass-eroded-mesa",
    name: "地形：侵蚀红岩高原",
    description: "强水力侵蚀切开阶梯状红岩高原，保留沟谷、沉积坡和顶盖岩。",
    options: {
      width: 129,
      height: 129,
      seed: 731,
      scale: 41,
      octaves: 6,
      persistence: 0.53,
      lacunarity: 2.2,
      useFalloff: false,
      erosion: { iterations: 42, hydraulicStrength: 0.032, thermalStrength: 0.045, talus: 0.035 },
    },
    size: 18,
    heightMultiplier: 4.4,
    terrainTypes: aridTypes,
    heightCurve: (height) => Math.floor(Math.pow(height, 1.18) * 9) / 9,
  },
  {
    id: "landmass-volcanic-caldera",
    name: "地形：玄武岩火山口",
    description: "环形火山锥、下陷火山口、黑沙海岸；热力侵蚀软化锥坡。",
    options: {
      width: 129,
      height: 129,
      seed: 1946,
      scale: 46,
      octaves: 5,
      persistence: 0.46,
      lacunarity: 2.15,
      useFalloff: true,
      erosion: { iterations: 25, hydraulicStrength: 0.018, thermalStrength: 0.065, talus: 0.04 },
    },
    size: 18,
    heightMultiplier: 5.1,
    waterLevel: 0.235,
    terrainTypes: volcanicTypes,
    reshape: reshapeVolcano,
    heightCurve: (height) => Math.pow(height, 1.12),
  },
  {
    id: "landmass-temperate-archipelago",
    name: "地形：温带侵蚀群岛",
    description: "五座尺度不同的岛屿共享分层噪声和侵蚀规则，形成海湾与岛链。",
    options: {
      width: 129,
      height: 129,
      seed: 8803,
      scale: 34,
      octaves: 6,
      persistence: 0.49,
      lacunarity: 2.08,
      useFalloff: false,
      erosion: { iterations: 31, hydraulicStrength: 0.025, thermalStrength: 0.052, talus: 0.038 },
    },
    size: 20,
    heightMultiplier: 3.7,
    waterLevel: 0.245,
    terrainTypes: temperateTypes,
    reshape: reshapeArchipelago,
    heightCurve: (height) => Math.pow(height, 1.24),
  },
  {
    id: "landmass-alpine-ridge",
    name: "地形：冰雪侵蚀山脊",
    description: "弯曲主山脊叠加细节噪声和侵蚀沟槽，高海拔自动进入裸岩与雪线。",
    options: {
      width: 129,
      height: 129,
      seed: 5201,
      scale: 29,
      octaves: 7,
      persistence: 0.51,
      lacunarity: 2.24,
      useFalloff: false,
      erosion: { iterations: 37, hydraulicStrength: 0.03, thermalStrength: 0.035, talus: 0.03 },
    },
    size: 20,
    heightMultiplier: 6.2,
    terrainTypes: alpineTypes,
    reshape: reshapeAlpineRidge,
    heightCurve: (height) => Math.pow(height, 1.36),
  },
];

const entries: ManifestEntry[] = [];

for (const preset of presets) {
  const erosion = preset.options.erosion;
  const map = buildLandmassMap({ ...preset.options, erosion: false, terrainTypes: preset.terrainTypes });
  preset.reshape?.(map.heightMap);
  if (erosion) {
    map.heightMap = erodeTerrainHeightfield(map.heightMap, erosion).height;
  }
  const classified = classifyLandmassTerrain(map.heightMap, preset.terrainTypes);
  const terrain = landmassHeightfieldToMesh(map.heightMap, {
    size: preset.size,
    heightMultiplier: preset.heightMultiplier,
    heightCurve: preset.heightCurve,
    lod: 0,
  });
  const parts: NamedPart[] = [{
    name: "terrain_surface",
    label: "程序化地形表面",
    mesh: terrain,
    color: [0.4, 0.4, 0.4],
    colors: classified.colorMap,
    surface: { type: "stone", params: { seed: preset.options.seed ?? 1, scale: 7 } },
    metadata: {
      pipeline: ["分层噪声", "宏观地貌塑形", "水力/热力侵蚀", "高度生物群落", "LOD 网格"],
    },
  }];

  if (preset.waterLevel !== undefined) {
    parts.push({
      name: "water_plane",
      label: "水面",
      mesh: transform(plane(preset.size * 1.04, preset.size * 1.04, 8, 8), {
        translate: vec3(0, preset.waterLevel * preset.heightMultiplier, 0),
      }),
      color: [0.055, 0.24, 0.42],
      surface: {
        type: "water",
        params: {
          body: "ocean",
          tint: [0.08, 0.3, 0.5],
          deepColor: [0.01, 0.055, 0.13],
          seed: (preset.options.seed ?? 1) + 17,
        },
      },
    });
  }

  const { obj, mtl } = toOBJScene(parts, `${preset.id}.mtl`);
  const model = toViewerModel(parts, preset.id);
  model.meta.description = preset.description;
  model.meta.seed = preset.options.seed;
  model.meta.pipeline = "Lague 风格分层噪声 → 宏观塑形 → 侵蚀 → 生物群落 → LOD 网格";
  fs.writeFileSync(path.join(outDir, `${preset.id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${preset.id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${preset.id}.json`), JSON.stringify(model, null, 2));
  entries.push({ id: preset.id, name: preset.name, file: `${preset.id}.json`, category: "地形" });
  console.log(`${preset.id}: ${model.meta.verts} verts, ${model.meta.tris} tris`);
}

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: ManifestEntry[] } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = { models: [] };
  }
}
const ids = new Set(entries.map((entry) => entry.id));
manifest.models = manifest.models.filter((entry) => !ids.has(entry.id));
manifest.models.push(...entries);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`registered ${entries.length} landmass models`);
