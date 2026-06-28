/**
 * Procedural clothing demo — builds the first-batch garment templates
 * (T-shirt, skirt, pants) on the parametric avatar and writes viewer models +
 * OBJ to out/, registering each in out/models.json.
 *
 * Run: pnpm clothing
 */
import {
  buildAvatar,
  buildTShirt,
  buildSkirt,
  buildPants,
  buildDress,
  buildHoodie,
  buildCharacter,
  solveCloth,
  getFabric,
  meanStrain,
  toOBJScene,
  toViewerModel,
  merge,
  type NamedPart,
} from "../src/index.js";

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}

function emit(id: string, name: string, parts: NamedPart[]) {
  const { obj, mtl } = toOBJScene(parts, `${id}.mtl`);
  const model = toViewerModel(parts, id);
  fs.writeFileSync(path.join(outDir, `${id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(model));
  manifest.models = manifest.models.filter((m) => m.id !== id);
  manifest.models.push({ id, name, file: `${id}.json` });
  const merged = merge(...parts.map((p) => p.mesh));
  console.log(`${id}: ${model.meta.parts} parts, ${merged.positions.length} verts, ${model.meta.tris} tris`);
}

emit("tshirt", "T 恤", buildTShirt({ fabric: "cottonJersey" }));
emit("skirt", "半身裙 (A 字)", buildSkirt({ fabric: "denim", flare: 0.16 }));
emit("pants", "长裤", buildPants({ fabric: "denim" }));
emit("dress", "连衣裙", buildDress({ fabric: "silk", flare: 0.26, sleeveLength: 0.5 }));
emit("hoodie", "卫衣", buildHoodie({ fabric: "cottonJersey" }));

// Body + clothes generated together from one set of measures (auto-fit).
const character = buildCharacter({
  measures: { chest: 1.0, height: 1.8 },
  garments: [
    { template: "hoodie", params: { fabric: "cottonJersey", chestEase: 0.14 } },
    { template: "pants", params: { fabric: "denim" } },
  ],
});
emit("character", "穿衣角色 (身体+衣服)", character.parts);

// M7 demo: settle a silk skirt with the XPBD solver so it hangs into folds.
const avatar = buildAvatar();
const silkSkirt = buildSkirt({ fabric: "silk", flare: 0.28, length: 0.7 });
const settled: NamedPart[] = silkSkirt.map((part) => ({
  ...part,
  name: `${part.name}_settled`,
  mesh: solveCloth(part.mesh, {
    iterations: 40,
    gravity: -0.02,
    avatar,
    pinTopBand: 0.04,
    fabric: getFabric("silk").physical,
  }),
}));
const strain = meanStrain(silkSkirt[0]!.mesh, settled[0]!.mesh);
emit("skirt-xpbd", "丝绸裙 (XPBD 仿真)", settled);
console.log(`skirt-xpbd mean strain after settle: ${strain.toFixed(4)}`);

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log("written: out/{tshirt,skirt,pants,dress,hoodie,skirt-xpbd}.{obj,mtl,json} + out/models.json");

