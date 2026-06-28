/**
 * Import a small CC0 MakeHuman asset subset into Meshova viewer JSON.
 *
 * This intentionally copies/uses only MakeHuman asset files released as CC0.
 * It does not import MakeHuman application code.
 *
 * Run: pnpm makehuman-base
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const ROOT = resolve(process.cwd());
const ASSET_DIR = join(ROOT, "assets", "third_party", "makehuman");
const OUT_DIR = join(ROOT, "out");

const SOURCE = {
  repository: "https://github.com/makehumancommunity/makehuman",
  license: "CC0 1.0 Universal",
  licenseFile: "assets/third_party/makehuman/LICENSE.ASSETS.md",
};

const TARGETS = {
  "caucasian-female-young": "targets/caucasian-female-young.target",
  "caucasian-male-young": "targets/caucasian-male-young.target",
  "fem-neat-hourglass": "targets/bodyshapes-elvs-fem-neat-hourglass.target",
  "upperlegs-height-incr": "targets/upperlegs-height-incr.target",
};

const VARIANTS = [
  {
    id: "makehuman-base",
    label: "MakeHuman CC0 base mesh",
    color: [0.78, 0.62, 0.5],
    weights: {},
  },
  {
    id: "makehuman-female-test",
    label: "MakeHuman CC0 female morph test",
    color: [0.82, 0.62, 0.54],
    weights: {
      "caucasian-female-young": 0.72,
      "fem-neat-hourglass": 0.28,
      "upperlegs-height-incr": 0.12,
    },
  },
  {
    id: "makehuman-male-test",
    label: "MakeHuman CC0 male morph test",
    color: [0.7, 0.56, 0.47],
    weights: {
      "caucasian-male-young": 0.72,
      "upperlegs-height-incr": 0.08,
    },
  },
];

function parseIndex(raw, count) {
  const idx = Number.parseInt(raw, 10);
  if (!Number.isFinite(idx)) throw new Error(`bad OBJ index: ${raw}`);
  return idx < 0 ? count + idx : idx - 1;
}

function parseOBJ(text) {
  const positions = [];
  const uvs = [];
  const groups = new Map();
  let current = "default";

  const ensureGroup = (name) => {
    if (!groups.has(name)) groups.set(name, []);
    return groups.get(name);
  };
  ensureGroup(current);

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    const tag = parts[0];

    if (tag === "v") {
      positions.push({
        x: Number(parts[1]),
        y: Number(parts[2]),
        z: Number(parts[3]),
      });
    } else if (tag === "vt") {
      uvs.push({
        x: Number(parts[1]),
        y: 1 - Number(parts[2]),
      });
    } else if (tag === "g") {
      current = parts.slice(1).join("_") || "default";
      ensureGroup(current);
    } else if (tag === "f") {
      const face = parts.slice(1).map((token) => {
        const [vRaw, vtRaw] = token.split("/");
        return {
          v: parseIndex(vRaw, positions.length),
          vt: vtRaw ? parseIndex(vtRaw, uvs.length) : -1,
        };
      });
      if (face.length >= 3) ensureGroup(current).push(face);
    }
  }

  return { positions, uvs, groups };
}

function parseTarget(text, name) {
  const deltas = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const [idxRaw, dxRaw, dyRaw, dzRaw] = line.split(/\s+/);
    const index = Number.parseInt(idxRaw, 10);
    const dx = Number(dxRaw);
    const dy = Number(dyRaw);
    const dz = Number(dzRaw);
    if (!Number.isFinite(index) || !Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)) {
      throw new Error(`bad target line in ${name}: ${rawLine}`);
    }
    deltas.push({ index, dx, dy, dz });
  }
  return deltas;
}

function clonePositions(positions) {
  return positions.map((p) => ({ x: p.x, y: p.y, z: p.z }));
}

function applyTargets(positions, targetData, weights) {
  const out = clonePositions(positions);
  for (const [id, weight] of Object.entries(weights)) {
    const deltas = targetData.get(id);
    if (!deltas) throw new Error(`missing target data: ${id}`);
    if (weight === 0) continue;
    for (const d of deltas) {
      const p = out[d.index];
      if (!p) continue;
      p.x += d.dx * weight;
      p.y += d.dy * weight;
      p.z += d.dz * weight;
    }
  }
  return out;
}

function normalizePositions(positions, usedFaces, targetHeight = 4.45) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  const used = new Set();
  for (const face of usedFaces) {
    for (const c of face) used.add(c.v);
  }
  for (const i of used) {
    const p = positions[i];
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
    maxZ = Math.max(maxZ, p.z);
  }
  const scale = targetHeight / Math.max(1e-6, maxY - minY);
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  return positions.map((p) => ({
    x: (p.x - cx) * scale,
    y: (p.y - minY) * scale,
    z: (p.z - cz) * scale,
  }));
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function addTo(a, b) {
  a.x += b.x;
  a.y += b.y;
  a.z += b.z;
}

function normalize(v) {
  const len = Math.hypot(v.x, v.y, v.z);
  return len > 0 ? { x: v.x / len, y: v.y / len, z: v.z / len } : { x: 0, y: 1, z: 0 };
}

function buildBodyMesh(obj, positions) {
  const bodyFaces = obj.groups.get("body");
  if (!bodyFaces || bodyFaces.length === 0) throw new Error("MakeHuman OBJ has no body group");
  const normPositions = normalizePositions(positions, bodyFaces);
  const outPositions = [];
  const outUvs = [];
  const outIndices = [];
  const remap = new Map();

  const addCorner = (corner) => {
    const key = `${corner.v}/${corner.vt}`;
    const cached = remap.get(key);
    if (cached !== undefined) return cached;
    const next = outPositions.length;
    remap.set(key, next);
    outPositions.push(normPositions[corner.v]);
    outUvs.push(corner.vt >= 0 ? obj.uvs[corner.vt] : { x: 0, y: 0 });
    return next;
  };

  for (const face of bodyFaces) {
    const ids = face.map(addCorner);
    for (let i = 1; i < ids.length - 1; i++) {
      outIndices.push(ids[0], ids[i], ids[i + 1]);
    }
  }

  const normals = outPositions.map(() => ({ x: 0, y: 0, z: 0 }));
  for (let i = 0; i < outIndices.length; i += 3) {
    const ia = outIndices[i];
    const ib = outIndices[i + 1];
    const ic = outIndices[i + 2];
    const n = cross(sub(outPositions[ib], outPositions[ia]), sub(outPositions[ic], outPositions[ia]));
    addTo(normals[ia], n);
    addTo(normals[ib], n);
    addTo(normals[ic], n);
  }

  return {
    positions: outPositions,
    normals: normals.map(normalize),
    uvs: outUvs,
    indices: outIndices,
  };
}

function flat3(items) {
  const out = [];
  for (const p of items) out.push(p.x, p.y, p.z);
  return out;
}

function flat2(items) {
  const out = [];
  for (const p of items) out.push(p.x, p.y);
  return out;
}

function toViewerModel(variant, mesh) {
  return {
    format: "meshova-model@1",
    name: variant.id,
    source: SOURCE,
    morphWeights: variant.weights,
    meta: {
      parts: 1,
      verts: mesh.positions.length,
      tris: mesh.indices.length / 3,
    },
    parts: [
      {
        name: "body",
        color: variant.color,
        positions: flat3(mesh.positions),
        normals: flat3(mesh.normals),
        uvs: flat2(mesh.uvs),
        indices: mesh.indices,
        surface: {
          type: "skin",
          params: { color: variant.color, roughness: 0.62 },
        },
      },
    ],
  };
}

function fmt(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(6);
}

function toOBJ(variant, mesh) {
  const obj = ["# Meshova MakeHuman CC0 import", `mtllib ${variant.id}.mtl`, "g body", "usemtl body_mat"];
  for (const p of mesh.positions) obj.push(`v ${fmt(p.x)} ${fmt(p.y)} ${fmt(p.z)}`);
  for (const uv of mesh.uvs) obj.push(`vt ${fmt(uv.x)} ${fmt(uv.y)}`);
  for (const n of mesh.normals) obj.push(`vn ${fmt(n.x)} ${fmt(n.y)} ${fmt(n.z)}`);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i] + 1;
    const b = mesh.indices[i + 1] + 1;
    const c = mesh.indices[i + 2] + 1;
    obj.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}`);
  }
  const c = variant.color;
  const mtl = [
    "# Meshova MakeHuman CC0 import",
    "newmtl body_mat",
    `Kd ${fmt(c[0])} ${fmt(c[1])} ${fmt(c[2])}`,
    "Ka 0 0 0",
    "Ns 24",
    "",
  ];
  return { obj: obj.join("\n") + "\n", mtl: mtl.join("\n") };
}

async function updateManifest(entries) {
  const manifestPath = join(OUT_DIR, "models.json");
  let manifest = { models: [] };
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    /* create a fresh manifest */
  }
  const ids = new Set(entries.map((e) => e.id));
  manifest.models = (manifest.models || []).filter((m) => !ids.has(m.id));
  manifest.models.push(...entries);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

await mkdir(OUT_DIR, { recursive: true });

const objText = await readFile(join(ASSET_DIR, "base.obj"), "utf8");
const parsed = parseOBJ(objText);
const targetData = new Map();
for (const [id, rel] of Object.entries(TARGETS)) {
  targetData.set(id, parseTarget(await readFile(join(ASSET_DIR, rel), "utf8"), rel));
}

const entries = [];
for (const variant of VARIANTS) {
  const morphed = applyTargets(parsed.positions, targetData, variant.weights);
  const mesh = buildBodyMesh(parsed, morphed);
  const model = toViewerModel(variant, mesh);
  const { obj, mtl } = toOBJ(variant, mesh);
  await writeFile(join(OUT_DIR, `${variant.id}.json`), JSON.stringify(model));
  await writeFile(join(OUT_DIR, `${variant.id}.obj`), obj);
  await writeFile(join(OUT_DIR, `${variant.id}.mtl`), mtl);
  entries.push({ id: variant.id, name: variant.label, file: `${variant.id}.json`, hidden: true });
  console.log(`${variant.id}: ${model.meta.verts} verts, ${model.meta.tris} tris`);
}

await updateManifest(entries);
console.log(`written: ${entries.map((e) => `out/${basename(e.file)}`).join(", ")} + OBJ/MTL + out/models.json`);
