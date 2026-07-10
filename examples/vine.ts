/**
 * Procedural vines — grown by a seeded gravity + wander walk, then swept into
 * tapering tubes with phyllotaxis leaves. Inspired by UE Electric Dreams' vine
 * assets, but grown from a re-runnable recipe instead of baked static meshes.
 *
 * Emits each named preset (hanging / ivy / creeper / liana) plus a wall of
 * hanging vines assembled from several seeded strands.
 *
 * Run: pnpm vine
 */
import { toOBJScene, toViewerModel } from "../src/index.js";
import {
  buildVineParts,
  buildVinePreset,
  VINE_PRESETS,
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
function register(id: string, name: string, file: string) {
  manifest.models = manifest.models.filter((m) => m.id !== id);
  manifest.models.push({ id, name, file });
}

function emit(id: string, name: string, parts: NamedPart[]) {
  const { obj, mtl } = toOBJScene(parts);
  const model = toViewerModel(parts, id);
  fs.writeFileSync(path.join(outDir, `${id}.obj`), obj);
  fs.writeFileSync(path.join(outDir, `${id}.mtl`), mtl);
  fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(model, null, 2));
  register(id, name, `${id}.json`);
  console.log(`${id}: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
}

const presetNames: Record<string, string> = {
  hanging: "垂吊藤蔓", ivy: "攀墙常春藤", creeper: "地面匍匐藤", liana: "木质藤本",
};
for (const name of Object.keys(VINE_PRESETS)) {
  emit(`vine-${name}`, `藤·${presetNames[name] ?? name}`, buildVinePreset(name));
}

// A curtain of hanging vines: several seeded strands spread along X, each
// drooping off a shared ledge — the "wall of vines" read from the UE demo,
// grown procedurally. Merge all strands' parts into one model.
function buildVineWall(count = 7, seed = 100): NamedPart[] {
  const stems: NamedPart["mesh"][] = [];
  const leaves: NamedPart["mesh"][] = [];
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * 0.55;
    const parts = buildVineParts({
      seed: seed + i,
      mode: "hanging",
      length: 2.4 + (i % 3) * 0.4,
      branches: 2,
      leafDensity: 7,
      origin: { x, y: 0, z: 0 },
    });
    for (const p of parts) {
      if (p.name === "stem") stems.push(p.mesh);
      else leaves.push(p.mesh);
    }
  }
  const out: NamedPart[] = [
    { name: "stem", label: "藤茎", mesh: merge(...stems), color: [0.32, 0.22, 0.13], surface: { type: "wood", params: { tone: [0.32, 0.22, 0.13] } } },
  ];
  if (leaves.length) out.push({ name: "leaves", label: "叶片", mesh: merge(...leaves), color: [0.22, 0.48, 0.17], surface: { type: "fabric", params: { color: [0.22, 0.48, 0.17] } } });
  return out;
}

emit("vine-wall", "藤·藤蔓墙", buildVineWall());

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log("written: out/vine-*.{obj,mtl,json} + out/models.json");

