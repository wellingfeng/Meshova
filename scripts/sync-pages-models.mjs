import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, normalize, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { chromium } from "playwright";

const root = resolve(process.cwd());
const outDir = join(root, "out");
const distDir = join(root, "dist");
const publishDir = join(root, "pages-models");
const dataDir = join(publishDir, "data");
const gzipAsync = promisify(gzip);

function assertInsideRoot(path) {
  const rel = relative(root, path);
  if (!rel || rel.startsWith("..") || resolve(root, rel) !== path) {
    throw new Error(`refuse to modify unsafe path: ${path}`);
  }
}

function isGeneratedLibraryEntry(model, procModelIds, visibleModelIds) {
  if (!model?.id || !model?.file || procModelIds.has(model.id) || !visibleModelIds.has(model.id)) return false;
  const id = String(model.id);
  return model.category === "meshova" ||
    model.category === "BlenderHowtos复刻" ||
    model.category === "HoudiniHowtos复刻" ||
    id.startsWith("blender-howtos-") ||
    id.startsWith("houdini-howtos") ||
    id.startsWith("speedtree-") ||
    id.startsWith("terrain-") ||
    id.startsWith("veg-") ||
    id.startsWith("mech-") ||
    id.startsWith("rt-") ||
    id.startsWith("ruin-") ||
    model.category === "地形" ||
    model.category === "植被" ||
    model.category === "机械" ||
    model.category === "建筑" ||
    model.category === "程序工作流";
}

function mimeType(path) {
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
  }[extname(path)] || "application/octet-stream";
}

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
      if (pathname === "/__sync__") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end("<!doctype html><title>Meshova model sync</title>");
        return;
      }
      const path = normalize(join(root, pathname));
      if (!path.startsWith(root)) {
        response.writeHead(403).end();
        return;
      }
      const info = await stat(path).catch(() => null);
      if (!info?.isFile()) {
        response.writeHead(404).end("not found");
        return;
      }
      response.writeHead(200, { "content-type": mimeType(path) });
      response.end(await readFile(path));
    } catch {
      response.writeHead(500).end("server error");
    }
  });
  return new Promise((resolveServer) => {
    server.listen(0, "127.0.0.1", () => resolveServer(server));
  });
}

async function readRuntimeModelSets(models) {
  const server = await startServer();
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/__sync__`);
    return await page.evaluate(async (modelIds) => {
      const [{ PROC_MODELS }, { isGalleryModelVisible }] = await Promise.all([
        import("/web/procmodels.js"),
        import("/web/model-visibility.js"),
      ]);
      return {
        procModelIds: Object.keys(PROC_MODELS),
        visibleModelIds: modelIds.filter((id) => isGalleryModelVisible(id)),
      };
    }, models.map((model) => model.id));
  } finally {
    await browser.close();
    server.close();
  }
}

async function main() {
  const sourceManifestPath = join(outDir, "models.json");
  if (!existsSync(sourceManifestPath)) throw new Error("out/models.json missing");
  if (!existsSync(distDir)) throw new Error("dist/ missing. Run `pnpm build` first.");

  const sourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8"));
  const sourceModels = Array.isArray(sourceManifest.models) ? sourceManifest.models : [];
  const runtimeSets = await readRuntimeModelSets(sourceModels);
  const procModelIds = new Set(runtimeSets.procModelIds);
  const visibleModelIds = new Set(runtimeSets.visibleModelIds);
  const models = sourceModels
    .filter((model) => isGeneratedLibraryEntry(model, procModelIds, visibleModelIds))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));

  assertInsideRoot(dataDir);
  await rm(dataDir, { recursive: true, force: true });
  await mkdir(dataDir, { recursive: true });

  let rawBytes = 0;
  let compressedBytes = 0;
  for (const model of models) {
    const filename = String(model.file || "");
    if (!filename.endsWith(".json") || basename(filename) !== filename) {
      throw new Error(`invalid model filename: ${filename}`);
    }
    const sourcePath = join(outDir, filename);
    const raw = await readFile(sourcePath);
    JSON.parse(raw.toString("utf8"));
    const compressed = await gzipAsync(raw, { level: 9 });
    await writeFile(join(dataDir, `${filename}.gz`), compressed);
    rawBytes += raw.length;
    compressedBytes += compressed.length;
  }

  await mkdir(dirname(join(publishDir, "models.json")), { recursive: true });
  await writeFile(join(publishDir, "models.json"), `${JSON.stringify({ models }, null, 2)}\n`, "utf8");
  console.log(`Published model sources: ${models.length}`);
  console.log(`Raw: ${(rawBytes / 1048576).toFixed(2)} MiB`);
  console.log(`Gzip: ${(compressedBytes / 1048576).toFixed(2)} MiB`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
