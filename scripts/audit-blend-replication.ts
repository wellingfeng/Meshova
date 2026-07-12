import fs from "node:fs";
import path from "node:path";
import { BLEND_REFERENCE_FURNISHINGS } from "../src/models/blend-reference-furnishings.js";
import { BLEND_REFERENCE_PLANTS } from "../src/models/blend-reference-plants.js";
import { BLEND_REFERENCE_INTERIORS } from "../src/models/blend-reference-interior-collection.js";

interface CatalogEntry {
  id: string;
  relative: string;
  status: string;
}

interface InventoryObject {
  name: string;
  type: string;
  dimensions?: number[];
  polygons?: number;
}

interface Inventory {
  objects: InventoryObject[];
}

interface Replica {
  id: string;
  name: string;
  source: string;
  verified?: boolean;
  averageSilhouetteIoU?: number;
  minimumSilhouetteIoU?: number;
}

const root = process.cwd();
const libraryDir = path.join(root, "out", "blend-library");
const catalogPath = path.join(libraryDir, "catalog.json");
if (!fs.existsSync(catalogPath)) {
  throw new Error("Missing out/blend-library/catalog.json. Run pnpm blend:study -- --no-render first.");
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8")) as { entries: CatalogEntry[] };
const replicas: Replica[] = BLEND_REFERENCE_FURNISHINGS.map((definition) => ({
  id: definition.id,
  name: definition.name,
  source: normalize(definition.sourceCategory),
}));
replicas.push(...BLEND_REFERENCE_PLANTS.map((definition) => ({
  id: definition.id,
  name: definition.name,
  source: normalize(definition.sourceCategory),
})));
replicas.push(...BLEND_REFERENCE_INTERIORS.map((definition) => ({
  id: definition.id,
  name: definition.name,
  source: normalize(definition.sourceCategory),
})));
replicas.push(
  { id: "cream-sofa-quilted", name: "奶油风绗缝沙发", source: "家具/奶油风沙发/奶油风沙发1" },
  { id: "cream-sofa-wrap", name: "奶油风环抱沙发", source: "家具/奶油风沙发/奶油风沙发2" },
);
for (const replica of replicas) {
  const qualityPath = path.join(root, "out", "quality", `multiview-${replica.id}.json`);
  if (!fs.existsSync(qualityPath)) continue;
  const quality = JSON.parse(fs.readFileSync(qualityPath, "utf8")) as {
    averageSilhouetteIoU: number;
    minimumSilhouetteIoU: number;
  };
  replica.averageSilhouetteIoU = quality.averageSilhouetteIoU;
  replica.minimumSilhouetteIoU = quality.minimumSilhouetteIoU;
  replica.verified = quality.averageSilhouetteIoU >= 0.82 && quality.minimumSilhouetteIoU >= 0.82;
}

const completedBySource = new Map(replicas.map((replica) => [normalize(replica.source), replica]));
const files = catalog.entries.map((entry) => {
  const inventoryPath = path.join(libraryDir, entry.id, "inventory.json");
  const fileKey = normalize(entry.relative.replace(/\.blend$/i, ""));
  if (!fs.existsSync(inventoryPath)) {
    return { file: entry.relative, status: "missing-inventory", total: 0, verified: [], needsOptimization: [], unimplemented: [] };
  }
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8")) as Inventory;
  const assets = inventory.objects
    .filter((object) => object.type === "MESH" || object.type === "EMPTY")
    .map((object) => {
      const source = `${fileKey}/${object.name}`;
      const replica = completedBySource.get(normalize(source));
      return {
        source,
        object: object.name,
        dimensions: object.dimensions ?? [],
        polygons: object.polygons ?? 0,
        replica: replica ? {
          id: replica.id,
          name: replica.name,
          verified: replica.verified ?? false,
          averageSilhouetteIoU: replica.averageSilhouetteIoU ?? null,
          minimumSilhouetteIoU: replica.minimumSilhouetteIoU ?? null,
        } : null,
      };
    });
  return {
    file: entry.relative,
    status: entry.status,
    total: assets.length,
    verified: assets.filter((asset) => asset.replica?.verified),
    needsOptimization: assets.filter((asset) => asset.replica && !asset.replica.verified),
    unimplemented: assets.filter((asset) => !asset.replica),
  };
});

const report = {
  source: "E:/BaiduNetdiskDownload/01-BL模型",
  generatedAt: new Date().toISOString(),
  summary: {
    files: files.length,
    assets: files.reduce((sum, file) => sum + file.total, 0),
    implemented: replicas.length,
    verified: files.reduce((sum, file) => sum + file.verified.length, 0),
    needsOptimization: files.reduce((sum, file) => sum + file.needsOptimization.length, 0),
    unimplemented: files.reduce((sum, file) => sum + file.unimplemented.length, 0),
  },
  completedReplicas: replicas,
  files,
};

const output = path.join(root, "out", "blend-replication-coverage.json");
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Blender 资产：${report.summary.assets}`);
console.log(`已实现：${report.summary.implemented}`);
console.log(`五视图已过线：${report.summary.verified}`);
console.log(`待优化：${report.summary.needsOptimization}`);
console.log(`未实现：${report.summary.unimplemented}`);
console.log(`台账：${path.relative(root, output)}`);

function normalize(value: string): string {
  return value.replaceAll("\\", "/").replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "");
}
