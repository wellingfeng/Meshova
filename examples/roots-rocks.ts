/**
 * Procedural roots + rock formations — Meshova's grown-from-recipe answer to
 * UE Electric Dreams' baked `RootsTest/SM_Roots_*` and `RockFormation/
 * SM_RockFormation_*` static meshes. Roots grow by a seeded gravity walk;
 * rocks fuse spheres, displace by noise, and cut strata. Every asset is a
 * re-runnable script, never a mesh dump.
 *
 * Emits each root + rock preset, plus one combined "rooted boulder" scene where
 * a root flare wraps the base of a rock shelf (the exposed-embankment read).
 *
 * Run: pnpm roots-rocks
 */
import { toOBJScene, toViewerModel } from "../src/index.js";
import {
  buildRootPreset,
  buildRootsParts,
  ROOT_PRESETS,
  buildRockPreset,
  buildRockFormationParts,
  ROCK_PRESETS,
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

const rootNames: Record<string, string> = {
  flare: "板根", erosion: "侵蚀裸根", taproot: "主根",
};
for (const name of Object.keys(ROOT_PRESETS)) {
  emit(`roots-${name}`, `根系·${rootNames[name] ?? name}`, buildRootPreset(name));
}

const rockNames: Record<string, string> = {
  boulder: "巨砾", shelf: "岩台", cliff: "岩壁",
};
for (const name of Object.keys(ROCK_PRESETS)) {
  emit(`rock-${name}`, `岩石·${rockNames[name] ?? name}`, buildRockPreset(name));
}

// Combined scene: a rock shelf with an erosion-root clump clinging to its base,
// as if soil washed out from under a boulder and left the roots exposed — the
// signature Electric Dreams embankment read, grown live.
function buildRootedBoulder(): NamedPart[] {
  const rock = buildRockFormationParts({ mode: "shelf", seed: 8, radius: 1.8, height: 1.2 });
  const roots = buildRootsParts({
    mode: "erosion",
    seed: 14,
    count: 9,
    collarRadius: 0.9,
    length: 2.6,
    origin: { x: 0, y: 0.5, z: 0 },
  });
  return [...rock, ...roots];
}

emit("rooted-boulder", "岩石·裸根巨砾", buildRootedBoulder());

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log("written: out/roots-*.{obj,mtl,json} + out/rock-*.* + out/rooted-boulder.* + out/models.json");
