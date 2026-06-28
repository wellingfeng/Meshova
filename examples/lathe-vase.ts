/**
 * Revolve / sweep showcase — proving Meshova's P3 shape builders.
 *
 * A turned vase (lathe), a handle ring (profileSweep along a curve), and a
 * rounded plinth (roundedBox). Few curve params -> a clean, recognizable model,
 * exactly the kind of low-dimensional shape an AI loop can optimize.
 *
 * Run: pnpm tsx examples/lathe-vase.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  lathe,
  profileSweep,
  roundedBox,
  rectProfile,
  bezier,
  smoothCurve,
  transform,
  computeNormals,
  vec2,
  vec3,
  toOBJScene,
  toViewerModel,
  type NamedPart,
} from "../src/index.js";

const CLAY: [number, number, number] = [0.62, 0.32, 0.24];
const GLAZE: [number, number, number] = [0.2, 0.42, 0.5];
const STONE: [number, number, number] = [0.5, 0.5, 0.52];

const parts: NamedPart[] = [];

// 1) Vase body: a smooth profile (radius, height) revolved around Y.
// Profile goes from base center up the silhouette to the rim and back to center.
const raw = [
  vec2(0, 0), vec2(0.28, 0), vec2(0.34, 0.12), vec2(0.42, 0.4),
  vec2(0.3, 0.72), vec2(0.22, 0.9), vec2(0.3, 1.05), vec2(0.27, 1.08),
  vec2(0.17, 0.95), vec2(0, 0.95),
];
const vase = computeNormals(lathe(raw, { segments: 48 }), 40);
parts.push({ name: "vase", mesh: vase, color: GLAZE });

// 2) Handle: sweep a small rectangle along a bezier arc on the side.
const arc = smoothCurve(
  bezier(vec3(0.3, 0.85, 0), vec3(0.62, 0.78, 0), vec3(0.62, 0.45, 0), vec3(0.3, 0.4, 0), 24),
  3,
);
const handle = computeNormals(profileSweep(arc, rectProfile(0.035, 0.05), { caps: true }), 40);
parts.push({ name: "handle", mesh: handle, color: CLAY });

// 3) Plinth: a rounded box the vase sits on.
const plinth = transform(
  computeNormals(roundedBox({ width: 0.9, height: 0.18, depth: 0.9, radius: 0.05, steps: 3 }), 35),
  { translate: vec3(0, -0.1, 0) },
);
parts.push({ name: "plinth", mesh: plinth, color: STONE });

const { obj, mtl } = toOBJScene(parts, "lathe-vase.mtl");
const model = toViewerModel(parts, "lathe-vase");

const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "lathe-vase.obj"), obj);
fs.writeFileSync(path.join(outDir, "lathe-vase.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "lathe-vase.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "lathe-vase", name: "旋转体花瓶", file: "lathe-vase.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(
  `lathe vase: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`,
);
console.log("written: out/lathe-vase.{obj,mtl,json} + out/models.json");
