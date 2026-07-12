import fs from "node:fs";
import path from "node:path";
import { toOBJScene, toViewerModel } from "../src/geometry/index.js";
import { buildPcgSplineCurb } from "../src/models/pcg-spline-curb.js";

const id = "pcg-spline-curb-sidewalk";
const result = buildPcgSplineCurb();
const model = {
  ...toViewerModel(result.parts, id),
  sourceUrl: "https://www.bilibili.com/video/BV1FCyeYUEB7/",
  spline: {
    closed: result.curve.closed,
    controlPoints: result.controlPoints,
    sampledPoints: result.curve.points,
  },
};
const { obj, mtl } = toOBJScene(result.parts, `${id}.mtl`);
const outputDirectory = path.resolve(process.cwd(), "out");
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, `${id}.json`), JSON.stringify(model, null, 2));
fs.writeFileSync(path.join(outputDirectory, `${id}.curve.json`), JSON.stringify(model.spline, null, 2));
fs.writeFileSync(path.join(outputDirectory, `${id}.obj`), obj);
fs.writeFileSync(path.join(outputDirectory, `${id}.mtl`), mtl);

const manifestPath = path.join(outputDirectory, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = { models: [] };
  }
}
manifest.models = manifest.models.filter((entry) => entry.id !== id);
manifest.models.push({ id, name: "PCG 样条路缘与人行道", file: `${id}.json` });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(
  `${id}: ${result.curbBlockCount} curb blocks, ${result.sidewalkPaverCount} sidewalk pavers`,
);
