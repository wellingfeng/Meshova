import { chromium } from "playwright";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { BLENDER_119_SCENES } from "../dist/index.js";
import { BLENDER_119_PALETTE_FRAMES } from "../dist/models/blender-119-palettes.js";

const ROOT = resolve(process.cwd());
const OUT_DIR = join(ROOT, "out", "shots", "blender-119");
const MODEL_DIR = join(OUT_DIR, "models");
const SHEET_SIZE = 20;
const FORCE = process.argv.includes("--force");

function referenceUrl(page) {
  const position = BLENDER_119_PALETTE_FRAMES[page - 1] ?? 94;
  return `/ref/bilibili-blender-119/frames/${String(page).padStart(3, "0")}-${position}.jpg`;
}

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
};

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      let path = decodeURIComponent((request.url || "/").split("?")[0]);
      if (path === "/favicon.ico") return response.writeHead(204).end();
      if (path === "/") path = "/web/index.html";
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

  return new Promise((resolveServer, rejectServer) => {
    let port = 5451;
    const listen = () => {
      server.once("error", (error) => {
        if (error?.code === "EADDRINUSE" && port < 5499) {
          port += 1;
          listen();
        } else {
          rejectServer(error);
        }
      });
      server.listen(port, "127.0.0.1", () => resolveServer({ server, port }));
    };
    listen();
  });
}

function browserExecutable() {
  const shellExecutable = chromium.executablePath();
  const fullExecutable = shellExecutable
    .replace(/chromium_headless_shell-(\d+)/, "chromium-$1")
    .replace(/chrome-headless-shell-win64[\\/]chrome-headless-shell\.exe$/i, "chrome-win64\\chrome.exe")
    .replace(/chrome-headless-shell-mac[^\\/]*[\\/].*$/i, "chrome-mac/Chromium.app/Contents/MacOS/Chromium")
    .replace(/chrome-headless-shell-linux[\\/]chrome-headless-shell$/i, "chrome-linux/chrome");
  return existsSync(fullExecutable) ? fullExecutable : undefined;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildIndexHtml() {
  const cards = BLENDER_119_SCENES.map((scene) => {
    const page = String(scene.page).padStart(3, "0");
    return `<article class="card">
      <h2>${page} · ${escapeHtml(scene.name)}</h2>
      <div class="pair">
        <figure><img src="${referenceUrl(scene.page)}"><figcaption>自动选取成片帧</figcaption></figure>
        <figure><img src="models/${scene.id}.png"><figcaption>Meshova 程序化复刻</figcaption></figure>
      </div>
    </article>`;
  }).join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Blender 百景复刻验证</title>
<style>
  :root { color-scheme: dark; font-family: "Microsoft YaHei", system-ui, sans-serif; background: #0a0d12; color: #f2f6ff; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 28px; background: radial-gradient(circle at 50% 0, #1b2638, #090c11 520px); }
  header { max-width: 1680px; margin: 0 auto 24px; }
  h1 { margin: 0 0 8px; font-size: 30px; }
  header p { margin: 0; color: #9aa9bd; }
  main { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; max-width: 1680px; margin: auto; }
  .card { overflow: hidden; border: 1px solid #31435d; border-radius: 12px; background: #111822; box-shadow: 0 12px 35px #0007; }
  h2 { margin: 0; padding: 12px 16px; border-bottom: 1px solid #27364b; font-size: 17px; color: #d9e7ff; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #27364b; }
  figure { margin: 0; background: #070a0e; }
  img { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: contain; background: #05070a; }
  figcaption { padding: 8px 10px; background: #101722; color: #91a5c0; font-size: 12px; text-align: center; }
  @media (max-width: 1050px) { main { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<header><h1>Blender 百景复刻验证</h1><p>119 集 · 左：视频终段关键帧 · 右：Meshova 程序化复刻</p></header>
<main>${cards}</main>
</body>
</html>\n`;
}

function buildSheetHtml(scenes) {
  const cards = scenes.map((scene) => {
    const page = String(scene.page).padStart(3, "0");
    return `<article><h2>${page} · ${escapeHtml(scene.name)}</h2><div><figure><img src="${referenceUrl(scene.page)}"><figcaption>参考</figcaption></figure><figure><img src="/out/shots/blender-119/models/${scene.id}.png"><figcaption>复刻</figcaption></figure></div></article>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;padding:18px;background:#090c11;color:#eef4ff;font-family:"Microsoft YaHei",sans-serif}
    main{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}article{overflow:hidden;border:1px solid #334761;border-radius:8px;background:#111923}
    h2{height:34px;margin:0;padding:7px 10px;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}article>div{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#334761}
    figure{margin:0;background:#05070a}img{display:block;width:100%;aspect-ratio:4/3;object-fit:contain}figcaption{padding:4px;text-align:center;font-size:10px;color:#9badc5;background:#101721}
  </style></head><body><main>${cards}</main></body></html>`;
}

await mkdir(MODEL_DIR, { recursive: true });
await writeFile(join(OUT_DIR, "index.html"), buildIndexHtml(), "utf8");

const { server, port } = await startServer();
const baseUrl = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--headless=new"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

try {
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "#critiqueBadge{display:none!important}" });
  await page.waitForFunction(() => Boolean(window.__meshova), null, { timeout: 90000 });
  await page.evaluate(() => window.__meshovaReady);
  await page.evaluate(() => {
    window.__meshova.setAutorot(false);
    window.__meshova.setWind(false);
    window.__meshova.setGrid(false);
    window.__meshova.setFxTime(1.25);
  });

  for (const [index, scene] of BLENDER_119_SCENES.entries()) {
    const output = join(MODEL_DIR, `${scene.id}.png`);
    if (FORCE || !existsSync(output)) {
      await page.evaluate((id) => window.__meshova.loadModelById(id), scene.id);
      await page.evaluate(() => window.__meshova.setView("persp"));
      await page.evaluate(() => window.__meshova.settle(10));
      await page.waitForTimeout(80);
      const canvas = await page.$("canvas");
      await canvas.screenshot({ path: output });
    }
    process.stdout.write(`\r模型截图 ${String(index + 1).padStart(3, " ")}/119`);
  }
  process.stdout.write("\n");

  for (let start = 0; start < BLENDER_119_SCENES.length; start += SHEET_SIZE) {
    const scenes = BLENDER_119_SCENES.slice(start, start + SHEET_SIZE);
    const sheetNumber = Math.floor(start / SHEET_SIZE) + 1;
    await page.setViewportSize({ width: 1920, height: 1400 });
    await page.setContent(buildSheetHtml(scenes), { waitUntil: "load" });
    await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
    await page.screenshot({ path: join(OUT_DIR, `compare-${sheetNumber}.png`), fullPage: true });
    console.log(`对比联系表 ${sheetNumber}/6`);
  }
} finally {
  await browser.close();
  server.close();
}

const result = {
  capturedAt: new Date().toISOString(),
  modelCount: BLENDER_119_SCENES.length,
  sheetCount: Math.ceil(BLENDER_119_SCENES.length / SHEET_SIZE),
  errors,
};
await writeFile(join(OUT_DIR, "capture-report.json"), JSON.stringify(result, null, 2) + "\n", "utf8");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`完成：${result.modelCount} 张模型图，${result.sheetCount} 张对比联系表。`);
