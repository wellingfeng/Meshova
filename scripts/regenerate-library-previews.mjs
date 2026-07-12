import { chromium } from "playwright";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(process.cwd());
const OUT_DIR = join(ROOT, "out");
const SHOTS_DIR = join(OUT_DIR, "shots");
const MATERIAL_DIR = join(OUT_DIR, "material-previews");
const VIEWPORT = { width: 960, height: 720 };
const RELOAD_INTERVAL = 40;
const MODELS_ONLY = process.argv.includes("--models-only");
const startArgument = process.argv.find((argument) => argument.startsWith("--start="));
const START_INDEX = Math.max(0, Number.parseInt(startArgument?.split("=", 2)[1] || "0", 10) || 0);

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      let pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
      if (pathname === "/") pathname = "/web/index.html";
      if (pathname === "/favicon.ico") {
        response.writeHead(204).end();
        return;
      }
      const filePath = normalize(join(ROOT, pathname));
      if (!filePath.startsWith(ROOT)) {
        response.writeHead(403).end();
        return;
      }
      const info = await stat(filePath).catch(() => null);
      const target = info?.isDirectory() ? join(filePath, "index.html") : filePath;
      const body = await readFile(target);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": MIME[extname(target)] || "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  return new Promise((resolveServer, rejectServer) => {
    server.once("error", rejectServer);
    server.listen(0, "127.0.0.1", () => resolveServer(server));
  });
}

function generatedLibraryEntry(model, procModelIds, visibleModelIds) {
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

function safeFilename(value) {
  return String(value).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
}

async function openViewer(page, baseUrl) {
  await page.goto(`${baseUrl}/web/index.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.addStyleTag({
    content: "#hud,#critiqueBadge,#draw-status,#curve-point-panel,#script-panel,#err,#loading{display:none!important}",
  });
  await page.waitForFunction(() => Boolean(window.__meshova), null, { timeout: 90000 });
  await page.evaluate(() => window.__meshovaReady);
  await page.evaluate(() => {
    window.__meshova.setAutorot(false);
    window.__meshova.setWind?.(false);
    window.__meshova.setFxTime?.(1.25);
  });
}

async function captureModels(page, baseUrl, manifest) {
  await openViewer(page, baseUrl);
  const runtime = await page.evaluate(async (manifestIds) => {
    const { isGalleryModelVisible } = await import("/web/model-visibility.js");
    const procIds = window.__meshova.models().filter((id) => isGalleryModelVisible(id));
    return {
      procIds,
      visibleManifestIds: manifestIds.filter((id) => isGalleryModelVisible(id)),
    };
  }, manifest.map((model) => model.id));
  const procModelIds = new Set(runtime.procIds);
  const visibleModelIds = new Set(runtime.visibleManifestIds);
  const generatedModels = manifest.filter((model) => generatedLibraryEntry(model, procModelIds, visibleModelIds));
  const models = [
    ...runtime.procIds.map((id) => ({ id, kind: "procedural" })),
    ...generatedModels.map((model) => ({ ...model, kind: "generated" })),
  ];
  const failures = [];
  let captured = Math.min(START_INDEX, models.length);

  for (let index = captured; index < models.length; index += 1) {
    const model = models[index];
    try {
      if (index > 0 && index % RELOAD_INTERVAL === 0) await openViewer(page, baseUrl);
      if (model.kind === "procedural") {
        await page.evaluate((id) => window.__meshova.loadModelById(id), model.id);
      } else {
        const filename = String(model.file);
        if (basename(filename) !== filename || !filename.endsWith(".json")) throw new Error(`invalid model file: ${filename}`);
        const rawModel = JSON.parse(await readFile(join(OUT_DIR, filename), "utf8"));
        await page.evaluate((parts) => window.__meshova.loadParts(parts), rawModel);
      }
      await page.evaluate(() => {
        window.__meshova.setView("persp");
        window.__meshova.setDebugView("off");
        return window.__meshova.settle(12);
      });
      await page.waitForTimeout(60);
      await page.locator("canvas").first().screenshot({ path: join(SHOTS_DIR, `${safeFilename(model.id)}-persp.png`) });
      captured += 1;
      if (captured % 25 === 0 || captured === models.length) console.log(`模型 ${captured}/${models.length}`);
    } catch (error) {
      failures.push({ id: model.id, error: error instanceof Error ? error.message : String(error) });
      console.error(`模型失败 ${model.id}: ${failures.at(-1).error}`);
    }
  }
  return { captured, total: models.length, failures };
}

async function captureMaterials(page, baseUrl) {
  await page.goto(`${baseUrl}/web/gallery.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(".card[data-id^='mat:']", { timeout: 90000 });
  const materialCards = await page.locator(".card[data-id^='mat:']").evaluateAll((cards) => cards.map((card) => ({
    id: card.dataset.id,
    name: card.dataset.id.split(":").slice(2).join(":"),
  })));
  const failures = [];
  let captured = 0;

  for (const material of materialCards) {
    try {
      const card = page.locator(".card").filter({ has: page.locator(`.name:text-is(\"${material.name.replaceAll('"', '\\"')}\")`) }).last();
      await card.scrollIntoViewIfNeeded();
      await page.waitForFunction((id) => {
        const element = [...document.querySelectorAll(".card")].find((candidate) => candidate.dataset.id === id);
        const image = element?.querySelector(".thumb img");
        return Boolean(element && !element.classList.contains("loading") && image?.src?.startsWith("data:image/png"));
      }, material.id, { timeout: 90000 });
      const dataUrl = await page.evaluate((id) => {
        const element = [...document.querySelectorAll(".card")].find((candidate) => candidate.dataset.id === id);
        return element.querySelector(".thumb img").src;
      }, material.id);
      await writeFile(join(MATERIAL_DIR, `${safeFilename(material.name)}.png`), Buffer.from(dataUrl.split(",", 2)[1], "base64"));
      captured += 1;
      if (captured % 25 === 0 || captured === materialCards.length) console.log(`材质 ${captured}/${materialCards.length}`);
    } catch (error) {
      failures.push({ id: material.name, error: error instanceof Error ? error.message : String(error) });
      console.error(`材质失败 ${material.name}: ${failures.at(-1).error}`);
    }
  }
  return { captured, total: materialCards.length, failures };
}

async function captureShowcases(page, baseUrl) {
  const showcases = [
    { page: "biome-grassland.html", output: join(OUT_DIR, "biome-grassland.png") },
    { page: "vertex-grass.html", output: join(OUT_DIR, "vertex-grass.png") },
    { page: "shallow-water.html", output: join(SHOTS_DIR, "shallow-water-evolved.png") },
  ];
  const failures = [];
  let captured = 0;
  for (const showcase of showcases) {
    try {
      await page.goto(`${baseUrl}/web/${showcase.page}`, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForSelector("canvas", { timeout: 90000 });
      await page.waitForTimeout(2500);
      await page.locator("canvas").first().screenshot({ path: showcase.output });
      captured += 1;
    } catch (error) {
      failures.push({ id: showcase.page, error: error instanceof Error ? error.message : String(error) });
      console.error(`展示页失败 ${showcase.page}: ${failures.at(-1).error}`);
    }
  }
  return { captured, total: showcases.length, failures };
}

async function main() {
  if (!existsSync(join(OUT_DIR, "models.json"))) throw new Error("out/models.json missing");
  if (!existsSync(join(ROOT, "dist"))) throw new Error("dist missing; run pnpm build first");
  const reportPath = join(OUT_DIR, "preview-regeneration-report.json");
  const previousReport = MODELS_ONLY && existsSync(reportPath)
    ? JSON.parse(await readFile(reportPath, "utf8"))
    : null;
  await mkdir(SHOTS_DIR, { recursive: true });
  await mkdir(MATERIAL_DIR, { recursive: true });
  const manifest = JSON.parse(await readFile(join(OUT_DIR, "models.json"), "utf8")).models || [];
  const server = await startServer();
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const shellExe = chromium.executablePath();
  const fullExe = shellExe
    .replace(/chromium_headless_shell-(\d+)/, "chromium-$1")
    .replace(/chrome-headless-shell-win64[\\/]chrome-headless-shell\.exe$/i, "chrome-win64\\chrome.exe");
  const browser = await chromium.launch({
    executablePath: existsSync(fullExe) ? fullExe : undefined,
    headless: true,
    args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--headless=new"],
  });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  try {
    const models = await captureModels(page, baseUrl, manifest);
    const materials = MODELS_ONLY
      ? { ...(previousReport?.materials || { captured: 0, total: 0 }), failures: [] }
      : await captureMaterials(page, baseUrl);
    const showcases = MODELS_ONLY
      ? { ...(previousReport?.showcases || { captured: 0, total: 0 }), failures: [] }
      : await captureShowcases(page, baseUrl);
    const failures = [...models.failures, ...materials.failures, ...showcases.failures];
    const report = {
      generatedAt: new Date().toISOString(),
      models: { captured: models.captured, total: models.total },
      materials: { captured: materials.captured, total: materials.total },
      showcases: { captured: showcases.captured, total: showcases.total },
      failures,
      pageErrors: [...new Set(pageErrors)],
    };
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(report, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
