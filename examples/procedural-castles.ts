import {
  buildProceduralCastleParts,
  toOBJScene,
  toViewerModel,
  type CastleVariant,
} from "../src/index.js";

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out", "castles");
fs.mkdirSync(outDir, { recursive: true });

const variants: Array<{ id: string; variant: CastleVariant }> = [
  { id: "concentric-royal-castle", variant: "concentric" },
  { id: "ridge-citadel", variant: "ridge" },
  { id: "river-gate-castle", variant: "river" },
];

for (const { id, variant } of variants) {
  const parts = buildProceduralCastleParts({ variant });
  const { obj, mtl } = toOBJScene(parts, `${id}.mtl`);
  fs.writeFileSync(path.join(outDir, `${id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(toViewerModel(parts, id)));
  console.log(`${id}: ${parts.length} semantic parts`);
}
