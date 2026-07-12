/**
 * HoudiniHowtos-inspired showcase: fields, curve graphs, weave, panels, growth,
 * BSP dungeon and Voronoi vase.
 *
 * Run: pnpm houdini-howtos
 */
import {
  buildBspDungeonParts,
  buildField3DBlobParts,
  buildGrowthUrchinParts,
  buildPipeNetworkParts,
  buildReactionDiffusionReliefParts,
  buildSciFiPanelParts,
  buildVoronoiVaseParts,
  buildWovenPotParts,
  summarizeHoudiniHowtos,
  toOBJScene,
  toViewerModel,
  type NamedPart,
} from "../src/index.js";

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

const manifestPath = path.join(outDir, "models.json");
const category = "HoudiniHowtos复刻";
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
    id: "houdini-howtos-field",
    name: "HoudiniHowtos 场与等值面",
    description: "反应扩散浮雕 + Field3D 标量场等值面",
    parts: [
      ...buildReactionDiffusionReliefParts({ seed: 101 }),
      ...buildField3DBlobParts(102),
    ],
  },
  {
    id: "houdini-howtos-curve-graph",
    name: "HoudiniHowtos 曲线图管网",
    description: "CurveGraph 节点边图、最短路和管线 sweep",
    parts: buildPipeNetworkParts({ seed: 110 }),
  },
  {
    id: "houdini-howtos-weave-pot",
    name: "HoudiniHowtos 编织罐",
    description: "weaveField2D 编织 relief 包裹旋转罐体",
    parts: buildWovenPotParts({ seed: 120 }),
  },
  {
    id: "houdini-howtos-sci-fi-panel",
    name: "HoudiniHowtos Sci-Fi 面板",
    description: "分格面板、散热槽、螺栓和硬表面 greeble",
    parts: buildSciFiPanelParts({ seed: 130 }),
  },
  {
    id: "houdini-howtos-growth-urchin",
    name: "HoudiniHowtos 放射生长体",
    description: "Fibonacci 方向采样 + 曲线 sweep 生长刺",
    parts: buildGrowthUrchinParts({ seed: 140 }),
  },
  {
    id: "houdini-howtos-bsp-dungeon",
    name: "HoudiniHowtos BSP 地牢",
    description: "二叉空间划分房间 + L 形走廊路由",
    parts: buildBspDungeonParts({ seed: 150 }),
  },
  {
    id: "houdini-howtos-voronoi-vase",
    name: "HoudiniHowtos Voronoi 花瓶",
    description: "环向包裹 Voronoi 边界 mask + 径向浮雕",
    parts: buildVoronoiVaseParts({ seed: 160 }),
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
  model.meta.source = "HoudiniHowtos-inspired Meshova rewrite";
  fs.writeFileSync(path.join(outDir, `${scene.id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${scene.id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${scene.id}.json`), JSON.stringify(model, null, 2));
  entries.push({ id: scene.id, name: scene.name, file: `${scene.id}.json`, category });
}

const ids = new Set([...entries.map((entry) => entry.id), "houdini-howtos"]);
manifest.models = manifest.models.filter((m) => !ids.has(m.id));
manifest.models.push(...entries);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

for (const scene of scenes) {
  const summary = summarizeHoudiniHowtos(scene.parts);
  console.log(`${scene.id}: ${summary.partCount} parts, ${summary.vertexCount} verts, ${summary.triangleCount} tris`);
}
console.log(`registered ${entries.length} standalone HoudiniHowtos models into out/models.json`);
