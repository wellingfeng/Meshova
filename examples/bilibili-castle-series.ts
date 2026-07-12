import {
  BILIBILI_CASTLE_SERIES,
  buildBilibiliCastleSeriesParts,
  toOBJScene,
  toViewerModel,
} from "../src/index.js";

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out", "bilibili-castle-series");
fs.mkdirSync(outDir, { recursive: true });

for (const definition of BILIBILI_CASTLE_SERIES) {
  const parts = buildBilibiliCastleSeriesParts({
    variant: definition.variant,
    seed: definition.seed,
  });
  const { obj, mtl } = toOBJScene(parts, `${definition.id}.mtl`);
  fs.writeFileSync(path.join(outDir, `${definition.id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${definition.id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${definition.id}.json`), JSON.stringify(toViewerModel(parts, definition.id)));
  console.log(`${definition.id}: ${parts.length} semantic parts`);
}
