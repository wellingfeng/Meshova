/**
 * Imposter atlas capture — the far-LOD half of Meshova's vegetation pipeline.
 *
 * Boots the viewer headless, loads a tree model, then orbits the camera to N
 * evenly-spaced azimuths (transparent background) and screenshots each. The N
 * cells are stitched into ONE horizontal atlas PNG using Meshova's own PNG
 * codec (zero deps). At runtime a billboardImposter card samples the atlas cell
 * matching the view angle, so a whole tree renders as a couple of triangles.
 *
 * Usage: pnpm imposter [modelFile] [views] [cell]
 *   pnpm imposter veg-tree.json 8 256
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, extname, join, normalize, resolve } from "node:path";
import { decodePNG } from "../dist/vision/png.js";
import { encodePNG } from "../dist/texture/png.js";
import { imposterAtlasLayout } from "../dist/vegetation/imposter.js";

const ROOT = resolve(process.cwd());
const MODEL = process.argv[2] || "veg-tree.json";
const VIEWS = parseInt(process.argv[3] || "8", 10);
const CELL = parseInt(process.argv[4] || "256", 10);
// The viewer canvas fills the stage; use the proven viewer viewport (smaller
// sizes collapse the toolbar/panel layout and zero out the canvas). We
// center-crop a square per cell when stitching, then the atlas cell = CELL px.
const SIZE = { width: 960, height: 720 };

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".css": "text/css; charset=utf-8" };

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent((req.url || "/").split("?")[0]);
      if (p === "/favicon.ico") return res.writeHead(204).end();
      if (p === "/") p = "/web/index.html";
      const fp = normalize(join(ROOT, p));
      if (!fp.startsWith(ROOT)) return res.writeHead(403).end();
      const info = await stat(fp).catch(() => null);
      const target = info?.isDirectory() ? join(fp, "index.html") : fp;
      const body = await readFile(target);
      res.writeHead(200, { "content-type": MIME[extname(target)] || "application/octet-stream" });
      res.end(body);
    } catch { res.writeHead(404).end("not found"); }
  });
  return new Promise((r) => server.listen(0, () => r({ server, port: server.address().port })));
}

function findModelFile(arg) {
  return [resolve(ROOT, arg), resolve(ROOT, "out", arg)].find((f) => existsSync(f)) || null;
}

const { server, port } = await startServer();
const base = `http://127.0.0.1:${port}`;

// Reuse the full Chromium build + ANGLE flags the screenshot tool relies on, so
// WebGPU/ANGLE rendering works headless (the headless-shell can't render WebGL).
const shellExe = chromium.executablePath();
const fullExe = shellExe
  .replace(/chromium_headless_shell-(\d+)/, "chromium-$1")
  .replace(/chrome-headless-shell-win64[\\/]chrome-headless-shell\.exe$/i, "chrome-win64\\chrome.exe")
  .replace(/chrome-headless-shell-mac[^\\/]*[\\/].*$/i, "chrome-mac/Chromium.app/Contents/MacOS/Chromium")
  .replace(/chrome-headless-shell-linux[\\/]chrome-headless-shell$/i, "chrome-linux/chrome");

const browser = await chromium.launch({
  executablePath: existsSync(fullExe) ? fullExe : undefined,
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--headless=new"],
});
const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1 });
await page.goto(base + "/", { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.__meshova, null, { timeout: 10000 });

const modelFile = findModelFile(MODEL);
const modelId = (modelFile ? basename(modelFile).replace(/\.json$/i, "") : MODEL.replace(/\.json$/i, ""));
await page.evaluate(() => window.__meshova.setAutorot(false));
await page.evaluate(() => window.__meshova.setWind(false));            // freeze foliage
await page.evaluate(() => window.__meshova.setPost(false));            // raw render, no opaque post buffer
// Playwright element screenshots flatten alpha onto white, so we chroma-key:
// render on solid magenta, then key that color out to transparent when
// stitching. Magenta (#ff00ff) rarely occurs in foliage greens/browns.
await page.evaluate(() => window.__meshova.setBackground("solid", "#ff00ff"));
await page.evaluate(() => window.__meshova.setFloor("none"));          // no floor/shadow in the silhouette
if (modelFile) {
  const raw = JSON.parse(await readFile(modelFile, "utf8"));
  await page.evaluate((m) => window.__meshova.loadParts(m), raw);
} else {
  await page.evaluate((id) => window.__meshova.loadModelById(id), modelId);
}
await page.waitForTimeout(300);

const layout = imposterAtlasLayout({ views: VIEWS, rows: 1 });
const cells = [];
for (const cell of layout.cells) {
  await page.evaluate((az) => window.__meshova.setOrbit(az, 8), cell.azimuth);
  await page.evaluate(() => window.__meshova.settle(16));
  await page.waitForTimeout(80);
  const canvas = await page.$("canvas");
  const buf = await canvas.screenshot();
  cells.push(decodePNG(new Uint8Array(buf)));
}

/** Chroma-key: magenta-ish pixels -> transparent. */
function keyAlpha(r, g, b) {
  return r > 180 && b > 180 && g < 90; // close to #ff00ff
}

// Each captured cell: center-crop the largest square, then nearest-neighbor
// downscale to CELL x CELL. Stitch into one horizontal RGBA atlas.
const atlasW = CELL * VIEWS, atlasH = CELL;
const atlas = new Uint8Array(atlasW * atlasH * 4);
for (let i = 0; i < cells.length; i++) {
  const c = cells[i];
  const side = Math.min(c.width, c.height);
  const sx = ((c.width - side) / 2) | 0;
  const sy = ((c.height - side) / 2) | 0;
  const ox = i * CELL;
  for (let y = 0; y < CELL; y++) {
    const srcY = sy + ((y * side / CELL) | 0);
    for (let x = 0; x < CELL; x++) {
      const srcX = sx + ((x * side / CELL) | 0);
      const src = (srcY * c.width + srcX) * 4;
      const dst = (y * atlasW + (ox + x)) * 4;
      const r = c.data[src], g = c.data[src + 1], b = c.data[src + 2];
      if (keyAlpha(r, g, b)) {
        atlas[dst] = 0; atlas[dst + 1] = 0; atlas[dst + 2] = 0; atlas[dst + 3] = 0;
      } else {
        atlas[dst] = r; atlas[dst + 1] = g; atlas[dst + 2] = b; atlas[dst + 3] = 255;
      }
    }
  }
}

const outDir = resolve(ROOT, "out", "imposters");
await mkdir(outDir, { recursive: true });
const png = encodePNG(atlasW, atlasH, 4, atlas);
const atlasPath = join(outDir, `${modelId}-atlas.png`);
await writeFile(atlasPath, png);
// Sidecar JSON: the atlas layout (per-view azimuth + uvRect) for runtime use.
await writeFile(join(outDir, `${modelId}-atlas.json`), JSON.stringify({ model: modelId, cell: CELL, ...layout }, null, 2));

await browser.close();
server.close();
console.log(`imposter atlas: ${VIEWS} views, ${atlasW}x${atlasH} -> out/imposters/${modelId}-atlas.png`);
