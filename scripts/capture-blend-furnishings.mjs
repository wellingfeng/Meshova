import { chromium } from "playwright";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, normalize, resolve } from "node:path";

const root = resolve(process.cwd());
const outDir = join(root, "out", "shots");
const defaultIds = [
  "cream-sofa-quilted",
  "blend-ref-modern-sofa",
  "blend-ref-armchair",
  "blend-ref-ottoman",
  "blend-ref-dining-table",
  "blend-ref-dining-chair",
  "blend-ref-coffee-table",
  "blend-ref-cabinet",
  "blend-ref-refrigerator",
  "blend-ref-washing-machine",
  "blend-ref-desktop-monitor",
  "blend-ref-wall-air-conditioner",
  "blend-ref-keyboard",
  "blend-ref-pendant-lamp",
  "blend-ref-wine-bottle",
  "blend-ref-chinese-ornament",
  "blend-ref-indoor-plant",
  "blend-ref-canopy-tree",
  "blend-ref-dracaena",
  "blend-ref-broadleaf-stand",
];
const views = (process.argv[2] ?? "persp").split(",").map((view) => view.trim()).filter(Boolean);
const requestedIds = (process.argv[3] ?? "").split(",").map((id) => id.trim()).filter(Boolean);
const ids = requestedIds.length > 0 ? requestedIds : defaultIds;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
};

const server = createServer(async (request, response) => {
  try {
    let pathname = decodeURIComponent((request.url ?? "/").split("?")[0]);
    if (pathname === "/favicon.ico") return response.writeHead(204).end();
    if (pathname === "/") pathname = "/web/index.html";
    const filepath = normalize(join(root, pathname));
    if (!filepath.startsWith(root)) return response.writeHead(403).end();
    const info = await stat(filepath).catch(() => null);
    const target = info?.isDirectory() ? join(filepath, "index.html") : filepath;
    response.writeHead(200, { "content-type": mime[extname(target)] ?? "application/octet-stream" });
    response.end(await readFile(target));
  } catch {
    response.writeHead(404).end("not found");
  }
});
await new Promise((resolveListen, rejectListen) => {
  server.once("error", rejectListen);
  server.listen(5451, "127.0.0.1", resolveListen);
});

await mkdir(outDir, { recursive: true });
const shellExecutable = chromium.executablePath();
const fullExecutable = shellExecutable
  .replace(/chromium_headless_shell-(\d+)/, "chromium-$1")
  .replace(/chrome-headless-shell-win64[\\/]chrome-headless-shell\.exe$/i, "chrome-win64\\chrome.exe");
const browser = await chromium.launch({
  executablePath: existsSync(fullExecutable) ? fullExecutable : undefined,
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--headless=new"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
await page.goto("http://127.0.0.1:5451/", { waitUntil: "networkidle" });
await page.addStyleTag({ content: "#critiqueBadge{display:none!important}" });
await page.waitForFunction(() => Boolean(window.__meshova), null, { timeout: 90000 });
await page.evaluate(() => window.__meshovaReady);
await page.evaluate(() => window.__meshova.setAutorot(false));

for (const id of ids) {
  const model = JSON.parse(await readFile(join(root, "out", `${id}.json`), "utf8"));
  await page.evaluate((viewerModel) => window.__meshova.loadParts(viewerModel), model);
  await page.waitForTimeout(120);
  for (const view of views) {
    await page.evaluate((name) => window.__meshova.setView(name), view);
    await page.evaluate(() => window.__meshova.settle(16));
    await page.waitForTimeout(100);
    const canvas = await page.$("canvas");
    await canvas.screenshot({ path: join(outDir, `${id}-${view}.png`) });
  }
  console.log(`${basename(id)}: ${views.join(",")}`);
}

await browser.close();
server.close();
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
}
