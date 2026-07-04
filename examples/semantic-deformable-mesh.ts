/**
 * Semantic deformable mesh demo.
 *
 * Input can be a .zip containing an OBJ, a directory, or an OBJ path.
 * Run:
 *   pnpm semantic-mesh C:\path\model.zip
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import {
  bounds,
  deformSemanticMesh,
  parseOBJ,
  semanticModelFromParts,
  semanticModelToNamedParts,
  toOBJScene,
  toViewerModel,
  withInferredSemanticPartLabels,
  type NamedPart,
  type PartTextureRef,
  type SemanticDeformOp,
} from "../src/index.js";

const ROOT = resolve(process.cwd());
const OUT_DIR = join(ROOT, "out");
const EXTRACT_DIR = join(OUT_DIR, "semantic-mesh-input");
const DEFAULT_INPUT = join(EXTRACT_DIR, "base.obj");

const PALETTE: Array<[number, number, number]> = [
  [0.76, 0.58, 0.44],
  [0.44, 0.58, 0.78],
  [0.7, 0.66, 0.44],
  [0.54, 0.72, 0.52],
  [0.72, 0.48, 0.58],
  [0.48, 0.7, 0.72],
  [0.68, 0.55, 0.76],
  [0.76, 0.62, 0.38],
];

type AxisName = "x" | "y" | "z";

async function findFirstOBJ(dir: string): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isFile() && extname(entry.name).toLowerCase() === ".obj") return full;
    if (entry.isDirectory()) {
      const nested = await findFirstOBJ(full);
      if (nested) return nested;
    }
  }
  return null;
}

async function resolveInputOBJ(input: string): Promise<string> {
  const full = resolve(input);
  if (!existsSync(full)) {
    throw new Error(`input not found: ${input}`);
  }

  const info = await stat(full);
  if (info.isDirectory()) {
    const obj = await findFirstOBJ(full);
    if (!obj) throw new Error(`no OBJ found in directory: ${input}`);
    return obj;
  }

  if (extname(full).toLowerCase() === ".zip") {
    await mkdir(EXTRACT_DIR, { recursive: true });
    const result = spawnSync("tar", ["-xf", full, "-C", EXTRACT_DIR], { stdio: "inherit" });
    if (result.status !== 0) {
      throw new Error(`failed to extract zip with tar: ${input}`);
    }
    const obj = await findFirstOBJ(EXTRACT_DIR);
    if (!obj) throw new Error(`zip contains no OBJ: ${input}`);
    return obj;
  }

  if (extname(full).toLowerCase() !== ".obj") {
    throw new Error(`expected .zip, directory, or .obj: ${input}`);
  }
  return full;
}

function colorize(parts: NamedPart[]): NamedPart[] {
  return parts.map((part, i) => ({
    ...part,
    color: part.color ?? PALETTE[i % PALETTE.length]!,
  }));
}

function outPathFor(file: string): string {
  return relative(OUT_DIR, file).replace(/\\/g, "/");
}

async function findTexture(dir: string, needles: string[]): Promise<string | undefined> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const imageFiles = entries.filter((entry) => (
    entry.isFile() && [".png", ".jpg", ".jpeg", ".webp"].includes(extname(entry.name).toLowerCase())
  ));
  for (const needle of needles) {
    for (const entry of imageFiles) {
      const lower = entry.name.toLowerCase();
      if (needle === "orm") {
        if (!/(^|[_-])orm([_.-]|$)/.test(lower)) continue;
      } else if (!lower.includes(needle)) {
        continue;
      }
      return outPathFor(join(dir, entry.name));
    }
  }
  return undefined;
}

async function detectPBRTextures(objPath: string): Promise<PartTextureRef | undefined> {
  const dir = dirname(objPath);
  const textures: PartTextureRef = {};
  const baseColor = await findTexture(dir, ["texture_diffuse", "basecolor", "base_color", "albedo", "diffuse"]);
  const normal = await findTexture(dir, ["texture_normal", "normal"]);
  const roughness = await findTexture(dir, ["texture_roughness", "roughness"]);
  const metallic = await findTexture(dir, ["texture_metallic", "metallic", "metalness"]);
  const orm = await findTexture(dir, ["texture_pbr", "orm", "occlusionroughnessmetallic"]);
  const ao = await findTexture(dir, ["texture_ao", "ambientocclusion", "ambient_occlusion"]);
  const shaded = await findTexture(dir, ["shaded"]);
  if (baseColor) textures.baseColor = baseColor;
  if (normal) textures.normal = normal;
  if (roughness) textures.roughness = roughness;
  if (metallic) textures.metallic = metallic;
  if (orm) textures.orm = orm;
  if (ao) textures.ao = ao;
  if (shaded) textures.shaded = shaded;
  return Object.keys(textures).length ? textures : undefined;
}

function applyTextures(parts: NamedPart[], textures: PartTextureRef | undefined): NamedPart[] {
  if (!textures) return parts;
  return parts.map((part) => ({ ...part, textures: { ...textures } }));
}

function axisExtent(part: NamedPart): Record<AxisName, number> {
  const b = bounds(part.mesh);
  return {
    x: b.max.x - b.min.x,
    y: b.max.y - b.min.y,
    z: b.max.z - b.min.z,
  };
}

function longestAxis(part: NamedPart): AxisName {
  const e = axisExtent(part);
  if (e.x >= e.y && e.x >= e.z) return "x";
  if (e.y >= e.z) return "y";
  return "z";
}

function buildDemoOps(parts: NamedPart[]): SemanticDeformOp[] {
  const ranked = parts
    .map((part) => ({ part, tris: part.mesh.indices.length / 3, verts: part.mesh.positions.length }))
    .sort((a, b) => b.tris - a.tris || b.verts - a.verts);

  const ops: SemanticDeformOp[] = [];
  const primary = ranked[0]?.part;
  if (primary) {
    ops.push(
      { part: primary.name, mode: "stretch", axis: "y", factor: 1.08, pivot: "min" },
      { part: primary.name, mode: "thicken", axis: "y", factor: 1.06 },
    );
  }

  const secondary = ranked[1]?.part;
  if (secondary) {
    const axis = longestAxis(secondary);
    ops.push(
      { part: secondary.name, mode: "stretch", axis, factor: 1.18, pivot: "center" },
      { part: secondary.name, mode: "taper", axis, startScale: 1.08, endScale: 0.82 },
    );
  }

  const tertiary = ranked[2]?.part;
  if (tertiary) {
    const axis = longestAxis(tertiary);
    ops.push(
      { part: tertiary.name, mode: "thicken", axis, factor: 1.22 },
      { part: tertiary.name, mode: "twist", axis, angle: 0.18 },
    );
  }

  return ops;
}

async function writeModel(id: string, name: string, parts: NamedPart[]): Promise<void> {
  const model = toViewerModel(parts, name);
  const { obj, mtl } = toOBJScene(parts, `${id}.mtl`);
  await writeFile(join(OUT_DIR, `${id}.json`), JSON.stringify(model));
  await writeFile(join(OUT_DIR, `${id}.obj`), obj);
  await writeFile(join(OUT_DIR, `${id}.mtl`), mtl);
}

async function updateManifest(entries: Array<{ id: string; name: string; file: string }>): Promise<void> {
  const manifestPath = join(OUT_DIR, "models.json");
  let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    /* create fresh manifest */
  }
  const ids = new Set(entries.map((entry) => entry.id));
  manifest.models = (manifest.models || []).filter((entry) => !ids.has(entry.id));
  manifest.models.push(...entries);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

await mkdir(OUT_DIR, { recursive: true });

const input = process.argv[2] ?? DEFAULT_INPUT;
const objPath = await resolveInputOBJ(input);
const sourceText = await readFile(objPath, "utf8");
const sourceTextures = await detectPBRTextures(objPath);
const sourceParts = withInferredSemanticPartLabels(
  applyTextures(colorize(parseOBJ(sourceText, { groupBy: "objectOrGroup", normals: "recompute" })), sourceTextures),
  { prompt: basename(objPath) },
);
if (sourceParts.length === 0) throw new Error(`no mesh parts imported from ${objPath}`);

const sourceModel = semanticModelFromParts(sourceParts);
const ops = buildDemoOps(sourceParts);
const deformedModel = deformSemanticMesh(sourceModel, ops);
const deformedParts = semanticModelToNamedParts(deformedModel).map((part, i) => ({
  ...part,
  color: sourceParts[i]?.color ?? PALETTE[i % PALETTE.length]!,
  textures: sourceParts[i]?.textures,
}));

await writeModel("semantic-source", "Semantic source mesh", sourceParts);
await writeModel("semantic-deformed", "Semantic deformed mesh", deformedParts);
await updateManifest([
  { id: "semantic-source", name: "语义网格原始模型", file: "semantic-source.json" },
  { id: "semantic-deformed", name: "语义网格变形测试", file: "semantic-deformed.json" },
]);

const sourceTris = sourceParts.reduce((sum, part) => sum + part.mesh.indices.length / 3, 0);
const sourceVerts = sourceParts.reduce((sum, part) => sum + part.mesh.positions.length, 0);
console.log(`input: ${basename(objPath)}`);
console.log(`parts: ${sourceParts.length}, verts: ${sourceVerts}, tris: ${sourceTris}`);
console.log(`ops: ${ops.map((op) => `${op.part}:${op.mode}`).join(", ")}`);
console.log("written: out/semantic-source.{json,obj,mtl}, out/semantic-deformed.{json,obj,mtl}, out/models.json");
