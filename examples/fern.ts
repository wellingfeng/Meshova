/**
 * Fern — a CPU port of Vercidium's vertex-shader vegetation technique
 * (ref: BV16T4czDEJU / youtu.be/R-bjXOEQyX8). The original builds an entire
 * fern in a vertex shader from `gl_VertexID` alone: pitch/yaw -> direction via
 * sin/cos, a rachis that bends as `bentPitch = pitch + distance * bendStrength`,
 * leaflets stepped out perpendicular to the stem, and several fronds rotated
 * around a shared center. Meshova reproduces the same math on the immutable
 * index mesh so it stays an editable, re-runnable script model.
 *
 * Re-authored from public technique; no source copied.
 *
 * Run: pnpm tsx examples/fern.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fern, toOBJScene, toViewerModel, type NamedPart } from "../src/index.js";

const FROND: [number, number, number] = [0.18, 0.42, 0.15];

const plant = fern({
  fronds: 9,
  pitch: 0.42,
  bendStrength: 1.3,
  length: 1.15,
  segments: 16,
  leafletLength: 0.24,
  leafletWidth: 0.055,
  leafletAngle: 0.72,
});

const parts: NamedPart[] = [{ name: "fronds", mesh: plant, color: FROND }];

const { obj, mtl } = toOBJScene(parts, "fern.mtl");
const model = toViewerModel(parts, "fern");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "fern.obj"), obj);
fs.writeFileSync(path.join(outDir, "fern.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "fern.json"), JSON.stringify(model));
const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string; category?: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) { try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { /* rebuild */ } }
const entry = { id: "fern", name: "蕨类", file: "fern.json", category: "meshova" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`fern: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
