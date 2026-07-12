/**
 * Ruins generator — archway + colonnade + wall, run through ruinify, scattered
 * with rock variants. Demonstrates the four new capabilities re-authored from
 * Elderwood Overlook's Houdini OTLs (Archway/Column/Pavilion/BridgeWall +
 * Quick_Ruinify) and the Natsura rock-cliff rule.
 *
 * Nothing is copied from the UE project: these are re-implemented from public
 * procedural technique. Deterministic — same seed, same ruin.
 *
 * Run: pnpm tsx examples/ruins-generator.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  archway, column, bridgeWall, ruinify, rockVariants,
  transform, merge, vec3, toOBJScene, toViewerModel, type NamedPart,
} from "../src/index.js";

const STONE: [number, number, number] = [0.62, 0.59, 0.53];
const STONE_DARK: [number, number, number] = [0.5, 0.47, 0.43];
const MOSS: [number, number, number] = [0.34, 0.4, 0.26];
const ROCK: [number, number, number] = [0.44, 0.42, 0.4];
const SEED = 7;
const parts: NamedPart[] = [];

// 1) A ruined gate arch at the centre.
const gate = ruinify(archway({ span: 3, pierHeight: 3, pierWidth: 0.6, depth: 0.8, archStyle: "pointed" }),
  { seed: SEED, crumble: 0.45, erosion: 0.5, chunks: 8, chunkSize: 0.07 });
parts.push({ name: "gate_arch", mesh: gate, color: STONE });

// 2) A row of columns flanking the path, each ruined to a different height.
const colMeshes = [];
for (let i = 0; i < 4; i++) {
  const side = i < 2 ? -1 : 1;
  const idx = i % 2;
  const raw = column({ height: 4 - idx * 0.6, radius: 0.35, flutes: 14, fluteDepth: 0.06 });
  const broken = ruinify(raw, { seed: SEED + i * 3, crumble: 0.35 + idx * 0.25, erosion: 0.4, chunks: 4 });
  colMeshes.push(transform(broken, { translate: vec3(side * 2.4, 0, -1.5 + idx * 3) }));
}
parts.push({ name: "columns", mesh: merge(...colMeshes), color: STONE_DARK });

// 3) A crumbled parapet wall behind the gate.
const wall = ruinify(bridgeWall({ length: 7, height: 1.4, thickness: 0.4, openings: 5, style: "crenel" }),
  { seed: SEED + 20, crumble: 0.5, erosion: 0.6, chunks: 10, chunkSize: 0.08 });
parts.push({ name: "wall", mesh: transform(wall, { translate: vec3(0, 0, -3) }), color: MOSS });

// 4) A scatter of rock variants around the base (one rule -> many rocks).
const rocks = rockVariants(9, { seed: SEED + 50, radius: 0.55, detail: 3, flatBase: 0.4 });
const rockMeshes = rocks.map((r, i) => {
  const ang = i * 2.399963;
  const rad = 3 + (i % 3) * 0.8;
  return transform(r, { translate: vec3(Math.cos(ang) * rad, 0, Math.sin(ang) * rad), scale: 0.6 + (i % 4) * 0.2 });
});
parts.push({ name: "rocks", mesh: merge(...rockMeshes), color: ROCK });

const { obj, mtl } = toOBJScene(parts, "ruins-generator.mtl");
const model = toViewerModel(parts, "ruins-generator");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "ruins-generator.obj"), obj);
fs.writeFileSync(path.join(outDir, "ruins-generator.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "ruins-generator.json"), JSON.stringify(model));
const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string; category?: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) { try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { /* rebuild */ } }
const entry = { id: "ruins-generator", name: "程序化废墟", file: "ruins-generator.json", category: "meshova" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`ruins: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
