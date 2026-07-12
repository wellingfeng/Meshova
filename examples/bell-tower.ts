/**
 * Bell tower — semantic multi-part building, mirroring Skylark's SM_Tower_*
 * (Base / Roof / Windows / Bell / Details). Each part is a named sub-mesh so a
 * viewer or an AI loop can swap/tune one without touching the rest. Shows
 * Meshova's "language of parts" for architecture: lathe for the drum, box
 * arrays for the arcade windows, a cone roof, a lathe bell hanging inside.
 *
 * Run: pnpm tsx examples/bell-tower.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  lathe, box, cone, cylinder, sphere, transform, merge, subtractAll,
  computeNormals, vec2, vec3, toOBJScene, toViewerModel, type NamedPart,
} from "../src/index.js";

const STONE: [number, number, number] = [0.68, 0.65, 0.6];
const ROOF: [number, number, number] = [0.4, 0.18, 0.15];
const BELL: [number, number, number] = [0.55, 0.45, 0.18];
const WOOD: [number, number, number] = [0.42, 0.28, 0.16];
const DARK: [number, number, number] = [0.12, 0.1, 0.1];

const parts: NamedPart[] = [];
const H_BASE = 2.4;

// 1) Base drum: a slightly tapered cylinder-ish revolve with a plinth ring.
const baseProfile = [
  vec2(0, 0), vec2(1.0, 0), vec2(1.0, 0.2), vec2(0.9, 0.28),
  vec2(0.88, H_BASE - 0.3), vec2(0.94, H_BASE - 0.1), vec2(0.9, H_BASE), vec2(0, H_BASE),
];
const drum = computeNormals(lathe(baseProfile, { segments: 40 }), 40);
// Arched window openings cut around the belfry level.
const cutters = [];
const WINDOWS = 4;
for (let i = 0; i < WINDOWS; i++) {
  const a = (i / WINDOWS) * Math.PI * 2;
  const cut = transform(box(0.4, 0.7, 2.2), { rotate: vec3(0, a, 0), translate: vec3(0, H_BASE - 0.55, 0) });
  cutters.push(cut);
}
const baseCut = computeNormals(subtractAll(drum, cutters), 40);
parts.push({ name: "base", mesh: baseCut, color: STONE });

// 2) Window frames: thin box rings around each opening (the "details" read).
const frameMeshes = [];
for (let i = 0; i < WINDOWS; i++) {
  const a = (i / WINDOWS) * Math.PI * 2;
  const frame = transform(box(0.5, 0.8, 0.12), { rotate: vec3(0, a, 0), translate: vec3(Math.sin(a) * 0.9, H_BASE - 0.55, Math.cos(a) * 0.9) });
  frameMeshes.push(frame);
}
parts.push({ name: "windows", mesh: computeNormals(merge(...frameMeshes), 40), color: WOOD });

// 3) Roof: a tall cone with a small finial sphere.
const roofCone = transform(computeNormals(cone(1.15, 1.3, 40), 40), { translate: vec3(0, H_BASE, 0) });
const finial = transform(computeNormals(sphere(0.12, 16, 12), 40), { translate: vec3(0, H_BASE + 1.4, 0) });
parts.push({ name: "roof", mesh: merge(roofCone, finial), color: ROOF });

// 4) Bell: a lathe bell profile hanging under the belfry, with a yoke bar.
const bellProfile = [
  vec2(0, 0.5), vec2(0.28, 0.48), vec2(0.34, 0.3), vec2(0.3, 0.1),
  vec2(0.16, 0.02), vec2(0.16, 0), vec2(0.1, 0), vec2(0.08, 0.42), vec2(0, 0.46),
];
const bell = transform(computeNormals(lathe(bellProfile, { segments: 32 }), 40), { translate: vec3(0, H_BASE - 0.95, 0) });
const yoke = transform(computeNormals(cylinder(0.03, 0.9, 8), 40), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(0, H_BASE - 0.4, 0) });
parts.push({ name: "bell", mesh: merge(bell, yoke), color: BELL });

// 5) Door: a dark recessed box at ground level (detail).
const door = transform(box(0.55, 1.0, 0.15), { translate: vec3(0, 0.5, 0.86) });
parts.push({ name: "door", mesh: computeNormals(door, 40), color: DARK });

const { obj, mtl } = toOBJScene(parts, "bell-tower.mtl");
const model = toViewerModel(parts, "bell-tower");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "bell-tower.obj"), obj);
fs.writeFileSync(path.join(outDir, "bell-tower.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "bell-tower.json"), JSON.stringify(model));
const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) { try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { /* rebuild */ } }
const entry = { id: "bell-tower", name: "钟塔", file: "bell-tower.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`bell tower: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
