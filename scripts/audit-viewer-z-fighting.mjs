import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(process.cwd());
const captureScreenshots = process.argv.includes("--screenshots");
const screenshotDir = join(ROOT, "out", "audit-z-fighting");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent((request.url || "/").split("?")[0]);
      const file = normalize(join(ROOT, path));
      if (!file.startsWith(ROOT)) return response.writeHead(403).end();
      const info = await stat(file).catch(() => null);
      const target = info?.isDirectory() ? join(file, "index.html") : file;
      const body = await readFile(target);
      response.writeHead(200, { "content-type": MIME[extname(target)] || "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  return new Promise((resolveServer, reject) => {
    let port = 5460;
    const listen = () => {
      server.once("error", (error) => {
        if (error?.code === "EADDRINUSE" && port < 5510) {
          port++;
          listen();
        } else {
          reject(error);
        }
      });
      server.listen(port, "127.0.0.1", () => resolveServer({ server, port }));
    };
    listen();
  });
}

const { server, port } = await startServer();
const shellExe = chromium.executablePath();
const fullExe = shellExe
  .replace(/chromium_headless_shell-(\d+)/, "chromium-$1")
  .replace(/chrome-headless-shell-win64[\\/]chrome-headless-shell\.exe$/i, "chrome-win64\\chrome.exe");
const browser = await chromium.launch({
  executablePath: existsSync(fullExe) ? fullExe : undefined,
  headless: true,
  args: ["--headless=new"],
});

const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
await page.goto(`http://127.0.0.1:${port}/${captureScreenshots ? "web/index.html" : "web/procmodels.js"}`, {
  waitUntil: captureScreenshots ? "networkidle" : "domcontentloaded",
});
if (captureScreenshots) {
  await mkdir(screenshotDir, { recursive: true });
  await page.waitForFunction(() => Boolean(window.__meshova));
  await page.evaluate(() => window.__meshovaReady);
  await page.addStyleTag({ content: "#critiqueBadge{display:none!important}" });
}

let ids = await page.evaluate(async () => {
  const { PROC_MODELS } = await import("/web/procmodels.js");
  return Object.keys(PROC_MODELS).sort();
});
const requestedIds = process.argv.slice(2)
  .filter((arg) => !arg.startsWith("--"))
  .flatMap((arg) => arg.split(/[,\s]+/))
  .map((id) => id.trim())
  .filter(Boolean);
if (requestedIds.length) ids = ids.filter((id) => requestedIds.includes(id));
const offenders = [];
const buildErrors = [];

for (let index = 0; index < ids.length; index++) {
  const id = ids[index];
  try {
    const result = await page.evaluate(async (modelId) => {
      const [{ PROC_MODELS, defaultParams }, { zFightingReport }] = await Promise.all([
        import("/web/procmodels.js"),
        import("/dist/index.js"),
      ]);
      const model = PROC_MODELS[modelId];
      const params = model.defaultParams ? model.defaultParams() : defaultParams(model);
      const parts = await model.build(params);
      const report = zFightingReport(parts, {
        includeSamePart: false,
        maxTriangles: Number.POSITIVE_INFINITY,
        maxExamples: 100000,
      });
      const pairCounts = {};
      for (const example of report.examples) {
        const key = [example.partA, example.partB].sort().join(" / ");
        pairCounts[key] = (pairCounts[key] || 0) + 1;
      }
      return {
        pairs: report.pairs,
        parts: report.parts,
        triangles: report.testedTriangles,
        pairCounts,
      };
    }, id);
    if (result.pairs > 0) offenders.push({ id, ...result });
    if (captureScreenshots) {
      await page.evaluate(async (modelId) => {
        await window.__meshova.loadModelById(modelId);
        window.__meshova.setAutorot(false);
        window.__meshova.setWind(false);
        window.__meshova.setPost(false);
        window.__meshova.setView("persp");
        await window.__meshova.settle(2);
      }, id);
      await page.locator("canvas").screenshot({ path: join(screenshotDir, `${id}.png`) });
    }
  } catch (error) {
    buildErrors.push({ id, error: error?.message || String(error) });
  }
  if ((index + 1) % 25 === 0) console.log(`Audited ${index + 1}/${ids.length} viewer models...`);
}

await browser.close();
server.close();

for (const item of offenders) {
  console.error(`Z-FIGHT ${item.id}: ${item.pairs} pair(s) [${item.parts.join(", ")}]`);
  if (requestedIds.length) console.error(JSON.stringify(item.pairCounts));
}
for (const item of buildErrors) console.error(`ERROR ${item.id}: ${item.error}`);
for (const error of errors) console.error(`PAGE ERROR ${error}`);
console.log(`Audited ${ids.length} viewer models: ${offenders.length} offender(s), ${buildErrors.length} build error(s).`);
if (captureScreenshots) console.log(`Screenshots: ${screenshotDir}`);

if (offenders.length || buildErrors.length || errors.length) process.exitCode = 1;
