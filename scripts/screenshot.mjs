/**
 * Headless screenshot tool — the P3 capture half of Meshova's AI loop.
 *
 * Boots the static server, opens the viewer in headless Chromium, drives the
 * exposed window.__meshova hooks to load a model and pose the camera, then
 * writes one PNG per view into out/shots/. An AI can read these PNGs to
 * self-evaluate and revise the generating script.
 *
 * Usage: pnpm shot [modelFile] [view1,view2,...] [material] [channels]
 *   pnpm shot teddy-bear.json front,side,persp
 *   pnpm shot teddy persp,front "" pbr,normal,depth,matcap
 *   pnpm shot teddy tt8                 # 8-frame turntable regression set
 *   pnpm shot teddy orbit:45@20,front   # one 45deg orbit at 20deg elevation
 *
 * View tokens: named views (persp/front/side/top) plus turntable tokens —
 * "tt<N>" expands to N evenly spaced orbit frames, "orbit:<deg>[@<elev>]" poses
 * a single azimuth. Turntable frames feed the multi-view consistency check
 * (scoreMultiView): a shape that's only right head-on shows high IoU variance.
 *
 * channels (5th arg, comma-separated) drives multi-channel capture for the VLM
 * loop — one PNG per view per channel. Recognized: pbr (real PBR render),
 * normal, depth, matcap, ao. Defaults to "pbr". The non-pbr channels map onto
 * __meshova.setDebugView() so a single pose yields aligned multi-channel images.
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(process.cwd());
const MODEL = process.argv[2] || "teddy-bear.json";
const VIEWS = (process.argv[3] || "persp,front,side,top").split(",");
// Optional 4th arg: material preset name (rustyMetal/plushFur/ceramic/none).
const MATERIAL = process.argv[4] || null;
// Optional 5th arg: render channels for multi-channel VLM capture.
const CHANNELS = (process.argv[5] || "pbr").split(",").map((c) => c.trim()).filter(Boolean);
const SIZE = { width: 960, height: 720 };

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

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
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((res) => {
    server.listen(0, () => res({ server, port: server.address().port }));
  });
}

const { server, port } = await startServer();
const base = `http://localhost:${port}`;
const outDir = join(ROOT, "out", "shots");
await mkdir(outDir, { recursive: true });

// Use the full chromium build instead of the separate headless-shell
// download, so a single browser install covers both viewing and shots.
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
const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(base + "/", { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.__meshova, null, { timeout: 10000 });

function findModelFile(modelArg) {
  const candidates = [
    resolve(ROOT, modelArg),
    resolve(ROOT, "out", modelArg),
  ];
  return candidates.find((file) => existsSync(file)) || null;
}

// Stop auto-rotation so screenshots are deterministic, then load the model.
// MODEL can be a procedural model id, or a viewer JSON file path.
const modelFile = findModelFile(MODEL);
const modelId = modelFile
  ? basename(modelFile).replace(/\.json$/i, "")
  : MODEL.replace(/\.json$/i, "");
await page.evaluate(() => window.__meshova.setAutorot(false));
if (modelFile) {
  const rawModel = JSON.parse(await readFile(modelFile, "utf8"));
  await page.evaluate((model) => window.__meshova.loadParts(model), rawModel);
} else {
  await page.evaluate((id) => window.__meshova.loadModelById(id), modelId);
}
await page.waitForTimeout(300);
if (MATERIAL) {
  await page.evaluate((m) => window.__meshova.setMaterial(m), MATERIAL);
  await page.waitForTimeout(250);
}

// Optional FX toggles via env: FX=edgewear,pom (comma-separated). Applied once
// before posing so all channels share the look.
const FX = (process.env.FX || "").split(",").map((s) => s.trim()).filter(Boolean);
if (FX.includes("edgewear")) await page.evaluate(() => window.__meshova.setEdgeWear(true));
if (FX.includes("pom")) await page.evaluate(() => window.__meshova.setPOM(true));
if (FX.includes("rim")) await page.evaluate(() => window.__meshova.setRimLight(true));
if (FX.includes("fog")) await page.evaluate(() => window.__meshova.setFog(true));
if (FX.length) await page.waitForTimeout(250);

const suffix = MATERIAL ? `-${MATERIAL}` : "";
const written = [];
// Expand turntable tokens into concrete orbit views. "tt<N>" yields N evenly
// spaced azimuths around +Y (e.g. tt8 -> 8 frames); "orbit:<deg>[@<elev>]"
// poses one azimuth. Everything else passes through as a named view.
function expandViews(tokens) {
  const out = [];
  for (const raw of tokens) {
    const v = raw.trim();
    const tt = /^tt(\d+)$/.exec(v);
    if (tt) {
      const n = Math.max(1, parseInt(tt[1], 10));
      for (let i = 0; i < n; i++) {
        out.push({ name: `orbit${Math.round((i * 360) / n)}`, orbit: (i * 2 * Math.PI) / n, elev: 12 });
      }
      continue;
    }
    const orb = /^orbit:(-?\d+(?:\.\d+)?)(?:@(-?\d+(?:\.\d+)?))?$/.exec(v);
    if (orb) {
      out.push({ name: `orbit${orb[1]}`, orbit: (parseFloat(orb[1]) * Math.PI) / 180, elev: orb[2] !== undefined ? parseFloat(orb[2]) : 12 });
      continue;
    }
    out.push({ name: v });
  }
  return out;
}

// Outer loop = pose (set once, accumulate TAA); inner loop = channel (debug
// view swap is cheap and keeps the exact same camera, so the multi-channel
// images are pixel-aligned — what the VLM needs to fuse them).
for (const view of expandViews(VIEWS)) {
  if (view.orbit !== undefined) {
    await page.evaluate(({ az, el }) => window.__meshova.setOrbit(az, el), { az: view.orbit, el: view.elev });
  } else {
    await page.evaluate((v) => window.__meshova.setView(v), view.name);
  }
  for (const ch of CHANNELS) {
    const debugMode = ch === "pbr" ? "off" : ch;
    await page.evaluate((m) => window.__meshova.setDebugView(m), debugMode);
    // Let TAA fully accumulate so the captured frame is clean/anti-aliased —
    // crisper silhouettes help the VLM/IoU matching downstream.
    await page.evaluate(() => window.__meshova.settle(16));
    await page.waitForTimeout(120);
    const canvas = await page.$("canvas");
    // Single-channel runs keep the legacy "<id><mat>-<view>.png" name; multi
    // channel runs add a "-<channel>" tag so files don't collide.
    const chTag = CHANNELS.length > 1 || ch !== "pbr" ? `-${ch}` : "";
    const file = join(outDir, `${modelId}${suffix}-${view.name}${chTag}.png`);
    await canvas.screenshot({ path: file });
    written.push(file);
  }
  // Restore real PBR after the pose's channels are done.
  await page.evaluate(() => window.__meshova.setDebugView("off"));
}

await browser.close();
server.close();

if (errors.length) {
  console.error("page errors:\n" + errors.join("\n"));
}
console.log(`captured ${written.length} views of ${MODEL}:`);
for (const f of written) console.log("  " + f.replace(ROOT + "\\", "").replace(ROOT + "/", ""));
process.exit(errors.length ? 1 : 0);
