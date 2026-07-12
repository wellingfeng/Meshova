import {
  buildHoudiniCityFacadeReplica,
  buildHoudiniGrotReplica,
  buildHoudiniWoodTrimReplica,
  exportPBR,
  toOBJScene,
  toViewerModel,
  triangleCount,
  type InstanceBufferGroup,
  type NamedPart,
} from "../src/index.js";

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
const materialDir = path.join(outDir, "materials", "houdini-wood-trim");
fs.mkdirSync(materialDir, { recursive: true });

const city = buildHoudiniCityFacadeReplica();
const grot = buildHoudiniGrotReplica();
const trim = buildHoudiniWoodTrimReplica(256);
const scenes = [
  {
    id: "houdini-city-grammar",
    name: "Houdini 城市语法立面",
    description: "repeat/stretch/cull 立面语法 + HISM 风格 GPU 实例数据",
    parts: city.parts,
  },
  {
    id: "houdini-grot-growth",
    name: "Houdini GROT 生长网络",
    description: "影响区散点 + 邻接生长 + 松弛 + 中段增粗 + 端点嵌入",
    parts: grot.parts,
  },
  {
    id: "houdini-wood-trim",
    name: "Houdini 木质 Trim 烘焙",
    description: "几何 UV 栅格化为 ID/Height/Normal/AO/Curvature PBR 通道",
    parts: trim.parts,
  },
];

for (const scene of scenes) writeScene(scene.id, scene.name, scene.description, scene.parts);

const pbr = exportPBR(trim.material, "houdini-wood-trim");
for (const [fileName, bytes] of Object.entries(pbr.files)) {
  fs.writeFileSync(path.join(materialDir, fileName), bytes);
}

fs.writeFileSync(
  path.join(outDir, "houdini-city-instance-buffers.json"),
  JSON.stringify(serializeInstanceBuffers(city.instanceBuffers), null, 2),
);
fs.writeFileSync(
  path.join(outDir, "houdini-grot-instance-buffers.json"),
  JSON.stringify(serializeInstanceBuffers(grot.instanceBuffers), null, 2),
);

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string; category?: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = { models: [] };
  }
}
const ids = new Set(scenes.map((scene) => scene.id));
manifest.models = manifest.models.filter((entry) => !ids.has(entry.id));
manifest.models.push(...scenes.map((scene) => ({
  id: scene.id,
  name: scene.name,
  file: `${scene.id}.json`,
  category: "Houdini 下载工程复刻",
})));
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`生成 ${scenes.length} 个 Houdini 复刻模型`);
console.log(`城市实例 ${city.instanceBuffers.reduce((sum, buffer) => sum + buffer.count, 0)} 个`);
console.log(`GROT 节点 ${grot.growth.nodes.length}、边 ${grot.growth.edges.length}`);
console.log(`Trim PBR ${Object.keys(pbr.files).length} 张`);

function writeScene(id: string, name: string, description: string, parts: NamedPart[]): void {
  const { obj, mtl } = toOBJScene(parts, `${id}.mtl`);
  const model = toViewerModel(parts, id);
  model.meta.name = name;
  model.meta.description = description;
  model.meta.category = "Houdini 下载工程复刻";
  model.meta.triangleCount = parts.reduce((sum, part) => sum + triangleCount(part.mesh), 0);
  fs.writeFileSync(path.join(outDir, `${id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(model, null, 2));
}

function serializeInstanceBuffers(buffers: ReadonlyArray<InstanceBufferGroup>): unknown[] {
  return buffers.map((buffer) => ({
    key: buffer.key,
    meshId: buffer.meshId,
    materialId: buffer.materialId,
    partition: buffer.partition,
    count: buffer.count,
    customStride: buffer.customStride,
    positions: [...buffer.positions],
    rotations: [...buffer.rotations],
    scales: [...buffer.scales],
    customData: [...buffer.customData],
    sourceNodes: buffer.sourceNodes,
  }));
}
