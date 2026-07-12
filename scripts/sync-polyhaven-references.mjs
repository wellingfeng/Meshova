/**
 * Sync Poly Haven model metadata and optional public thumbnails for reference.
 * This script deliberately never calls the files endpoint or downloads meshes/textures.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  extractReplicatedAssetIds,
  selectPolyHavenCandidates,
  takeDiverseCandidates,
} from "./polyhaven-candidates.mjs";

const API = "https://api.polyhaven.com/assets?t=models";
const outDir = path.resolve(process.cwd(), "out", "references", "polyhaven");
const args = new Set(process.argv.slice(2));
const downloadImages = args.has("--images");
const includeCovered = args.has("--include-covered");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = Math.max(1, Number(limitArg?.split("=")[1] ?? 80));
const minScoreArg = process.argv.find((arg) => arg.startsWith("--min-score="));
const minScore = Math.max(0, Math.min(100, Number(minScoreArg?.split("=")[1] ?? 65)));
const perFamilyArg = process.argv.find((arg) => arg.startsWith("--per-family="));
const perFamily = Math.max(1, Number(perFamilyArg?.split("=")[1] ?? 2));

const response = await fetch(API);
if (!response.ok) throw new Error(`Poly Haven API failed: ${response.status} ${response.statusText}`);
const assets = await response.json();
const modelDefinitions = await Promise.all([
  "polyhaven-props.ts",
  "reference-benchmark-props.ts",
].map((file) => readFile(path.resolve(process.cwd(), "src", "models", file), "utf8")))
  .then((sources) => sources.join("\n"));
const replicatedAssetIds = extractReplicatedAssetIds(modelDefinitions);
const selection = selectPolyHavenCandidates(assets, {
  replicatedAssetIds,
  ...(includeCovered ? { representedFamilies: new Set() } : {}),
  minScore,
});
const catalog = takeDiverseCandidates(selection.candidates, limit, perFamily);
const excludedByReason = Object.fromEntries(
  [...new Set(selection.excluded.map((entry) => entry.reason))]
    .map((reason) => [reason, selection.excluded.filter((entry) => entry.reason === reason).length]),
);

await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "catalog.json"), JSON.stringify({
  source: API,
  generatedAt: new Date().toISOString(),
  policy: {
    sourceMeshes: false,
    sourceTextures: false,
    publicThumbnailsOnly: true,
    excludeReplicatedAssets: true,
    excludeCoveredFamilies: !includeCovered,
    excludeOrganicScans: true,
    minProceduralSuitability: minScore,
    maxCandidatesPerFamily: perFamily,
  },
  scanned: Object.keys(assets).length,
  replicatedAssetIds: [...replicatedAssetIds],
  excludedByReason,
  models: catalog,
}, null, 2));

if (downloadImages) {
  const imageDir = path.join(outDir, "candidates");
  await rm(imageDir, { recursive: true, force: true });
  await mkdir(imageDir, { recursive: true });
  for (const asset of catalog) {
    const image = await fetch(asset.thumbnailUrl);
    if (!image.ok) throw new Error(`Thumbnail failed for ${asset.id}: ${image.status}`);
    await writeFile(path.join(imageDir, `${asset.id}.png`), new Uint8Array(await image.arrayBuffer()));
  }
}

console.log(`Poly Haven candidates: ${catalog.length}/${selection.candidates.length} selected from ${Object.keys(assets).length} models${downloadImages ? " + thumbnails" : ""}`);
console.log(`Excluded: ${JSON.stringify(excludedByReason)}`);
console.log("Policy: public thumbnails only; no meshes or texture maps downloaded; existing Meshova families filtered by default.");
