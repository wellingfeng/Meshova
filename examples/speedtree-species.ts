/**
 * SpeedTree-style species lineup.
 *
 * Uses Meshova's vegetation species presets: recursive spline branches, swept
 * bark, branch root flares, shaped procedural leaves/fronds, LOD-friendly
 * structure, and wind weights. No art assets.
 *
 * Run: pnpm tsx examples/speedtree-species.ts
 */
import {
  buildTreeFromGuide,
  buildSpeciesPlant,
  treeGuideFromSilhouette,
  toOBJScene,
  toViewerModel,
  translateMesh,
  vegetationSpeciesPreset,
  vec3,
  windChannels,
  type NamedPart,
  type VegetationSpecies,
} from "../src/index.js";

const fs = await import("node:fs");
const path = await import("node:path");

interface SpeciesEntry {
  id: VegetationSpecies;
  seed: number;
  height: number;
}

interface Scene {
  id: string;
  name: string;
  parts: NamedPart[];
}

const species: SpeciesEntry[] = [
  { id: "oak", seed: 101, height: 4.6 },
  { id: "maple", seed: 117, height: 4.2 },
  { id: "birch", seed: 131, height: 5.0 },
  { id: "willow", seed: 149, height: 4.8 },
  { id: "pine", seed: 163, height: 5.6 },
  { id: "spruce", seed: 179, height: 6.1 },
  { id: "palm", seed: 191, height: 5.2 },
];

const scenes: Scene[] = [];
const lineupParts: NamedPart[] = [];

for (const [i, entry] of species.entries()) {
  const overrides = overridesFor(entry);
  const preset = vegetationSpeciesPreset(entry.id, overrides);
  const plant = buildSpeciesPlant(entry.id, overrides);
  const parts = speciesParts(entry.id, preset.label, plant.wood, plant.leaves, preset.barkColor, preset.leafColor, entry.seed);

  scenes.push({
    id: `speedtree-${entry.id}`,
    name: `SpeedTree-lite ${preset.label}`,
    parts,
  });

  const x = (i - (species.length - 1) * 0.5) * 3.2;
  for (const part of parts) {
    lineupParts.push({
      ...part,
      name: `${entry.id}_${part.name}`,
      label: `${preset.label} ${part.label ?? part.name}`,
      mesh: translateMesh(part.mesh, vec3(x, 0, 0)),
      metadata: {
        ...(part.metadata ?? {}),
        species: entry.id,
        lineupX: x,
      },
    });
  }
}

const guidedPreset = vegetationSpeciesPreset("oak");
const guided = buildTreeFromGuide(
  treeGuideFromSilhouette({
    height: 4.7,
    crownWidth: 3.5,
    crownDepth: 2.7,
    trunkLean: -0.42,
    crownBasePct: 0.22,
    shape: "umbrella",
  }),
  {
    seed: 233,
    trunkRadius: 0.26,
    branchCount: 9,
    depth: 3,
    branchAngle: 56,
    leafDensity: 10,
    leafSize: 0.18,
    leafShape: "oval",
    branchFeatures: { count: 10, size: 1.0 },
    branchLengthProfile: [{ t: 0, value: 1.25 }, { t: 0.6, value: 1.1 }, { t: 1, value: 0.65 }],
    leafDensityProfile: [{ t: 0, value: 0.35 }, { t: 0.7, value: 1.15 }, { t: 1, value: 0.8 }],
  },
);
scenes.push({
  id: "speedtree-guided-canopy",
  name: "SpeedTree-lite 引导树冠",
  parts: speciesParts("guided", "引导树冠", guided.wood, guided.leaves, guidedPreset.barkColor, guidedPreset.leafColor, 233),
});

scenes.push({
  id: "speedtree-species-lineup",
  name: "SpeedTree-lite 树种对比",
  parts: lineupParts,
});

const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string; category?: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = { models: [] };
  }
}

for (const scene of scenes) {
  const model = toViewerModel(scene.parts, scene.name);
  const file = `${scene.id}.json`;
  fs.writeFileSync(path.join(outDir, file), JSON.stringify(model));

  const obj = toOBJScene(scene.parts, `${scene.id}.mtl`);
  fs.writeFileSync(path.join(outDir, `${scene.id}.obj`), obj.obj);
  fs.writeFileSync(path.join(outDir, `${scene.id}.mtl`), obj.mtl);

  manifest.models = manifest.models.filter((m) => m.id !== scene.id);
  manifest.models.push({ id: scene.id, name: scene.name, file, category: "SpeedTree-lite" });
  console.log(`${scene.id}: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log("written: out/speedtree-*.json + .obj/.mtl + out/models.json");

function overridesFor(entry: SpeciesEntry) {
  if (entry.id === "pine" || entry.id === "spruce") {
    return { conifer: { seed: entry.seed, height: entry.height } };
  }
  if (entry.id === "palm") {
    return { palm: { seed: entry.seed, height: entry.height } };
  }
  if (entry.id === "shrub") {
    return { shrub: { seed: entry.seed, height: entry.height } };
  }
  return { tree: { seed: entry.seed, height: entry.height } };
}

function speciesParts(
  speciesId: VegetationSpecies | "guided",
  label: string,
  wood: NamedPart["mesh"],
  leaves: NamedPart["mesh"],
  barkColor: [number, number, number],
  leafColor: [number, number, number],
  seed: number,
): NamedPart[] {
  return [
    {
      name: "wood",
      label: `${label} 枝干`,
      mesh: wood,
      color: barkColor,
      windWeight: windChannels(wood, { kind: "wood", seed }).combined,
      metadata: { species: speciesId, generator: "spline-sweep-branch-flare" },
    },
    {
      name: "foliage",
      label: `${label} 叶冠`,
      mesh: leaves,
      color: leafColor,
      windWeight: windChannels(leaves, { kind: "foliage", seed: seed + 1 }).combined,
      metadata: { species: speciesId, generator: "procedural-leaf-or-frond" },
    },
  ];
}
