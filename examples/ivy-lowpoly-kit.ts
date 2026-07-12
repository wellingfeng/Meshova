import fs from "node:fs";
import path from "node:path";

import {
  buildLowPolyIvyKitParts,
  buildLowPolyIvyParts,
  toOBJScene,
  toViewerModel,
  type NamedPart,
} from "../src/index.js";

const outDir = path.resolve("out");
fs.mkdirSync(outDir, { recursive: true });

function emit(id: string, name: string, parts: NamedPart[]): void {
  const { obj, mtl } = toOBJScene(parts);
  fs.writeFileSync(path.join(outDir, `${id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(toViewerModel(parts, id)));

  const manifestPath = path.join(outDir, "models.json");
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : { models: [] };
  manifest.models = manifest.models.filter((model: { id: string }) => model.id !== id);
  manifest.models.push({ id, name, file: `${id}.json` });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

emit("ivy-lowpoly-vol23", "低模常春藤 VOL23 复刻", buildLowPolyIvyKitParts({ seed: 23 }));
emit("ivy-lowpoly-vol23-dry", "低模常春藤 VOL23 枯藤", buildLowPolyIvyParts({
  seed: 37,
  form: "hanging",
  width: 2.8,
  height: 3.8,
  lushness: 0.8,
  dryness: 0.72,
}));

console.log("written: out/ivy-lowpoly-vol23*.{obj,mtl,json}");
