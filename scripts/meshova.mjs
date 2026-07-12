/**
 * /meshova unified entry — one driver for the whole "prompt/image -> procedural
 * script -> sandbox -> render -> feedback" chain, with Claude acting as the LLM
 * that writes the script. This wraps the same runMeshScript + viewer + scoring
 * that textToModel/imageToModel use internally, exposed as atomic CLI steps so
 * the closed loop can be driven one iteration at a time.
 *
 * Subcommands:
 *   ref
 *       Print SCRIPT_API_REFERENCE (the DSL surface) and exit. No build needed
 *       beyond dist/. Use this to know which functions a script may call.
 *   run <scriptFile.js> [--views a,b,c] [--material name] [--name id]
 *                       [--ref refImage] [--no-render] [--obj]
 *       One iteration: run the AI script through the sandbox, render each view
 *       to out/meshova/<name>/, optionally score against --ref, and print a
 *       JSON summary the caller reads to decide the next revision.
 *   prep-image <img>
 *       Normalize a reference image to PNG at out/meshova/ref.png.
 *
 * The script file must be a plain JS snippet: no imports/async, calling only
 * SCRIPT_API functions, ending with `return [ part(...), ... ]`.
 *
 * Requires: `pnpm build` (dist/) and, for rendering, a Playwright Chromium.
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, writeFile, stat, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, basename, join, normalize, resolve } from "node:path";
import {
  runMeshScript,
  toViewerModel,
  toOBJScene,
  SCRIPT_API_REFERENCE,
  makeReferenceTarget,
  scoreRenderPng,
  decodePNG,
  encodePNG,
} from "../dist/index.js";

const ROOT = resolve(process.cwd());
const SIZE = { width: 960, height: 720 };
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function parseFlags(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true;
      else { flags[key] = next; i++; }
    } else positional.push(a);
  }
  return { flags, positional };
}

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
  return new Promise((r) => server.listen(0, () => r({ server, port: server.address().port })));
}

function fullChromiumPath() {
  const shell = chromium.executablePath();
  return shell
    .replace(/chromium_headless_shell-(\d+)/, "chromium-$1")
    .replace(/chrome-headless-shell-win64[\\/]chrome-headless-shell\.exe$/i, "chrome-win64\\chrome.exe")
    .replace(/chrome-headless-shell-mac[^\\/]*[\\/].*$/i, "chrome-mac/Chromium.app/Contents/MacOS/Chromium")
    .replace(/chrome-headless-shell-linux[\\/]chrome-headless-shell$/i, "chrome-linux/chrome");
}

const { positional, flags } = parseFlags(process.argv.slice(2));
const cmd = positional[0];

function die(msg) { console.error(msg); process.exit(2); }

/**
 * Register (or update) a generated model in out/models.json so the web gallery
 * lists it. category "meshova" is what the gallery whitelist recognizes.
 */
async function upsertManifest(id, displayName, file) {
  const manifestPath = join(ROOT, "out", "models.json");
  let data = { models: [] };
  if (existsSync(manifestPath)) {
    try { data = JSON.parse(await readFile(manifestPath, "utf8")); } catch { data = { models: [] }; }
  }
  if (!Array.isArray(data.models)) data.models = [];
  const now = new Date().toISOString();
  const entry = { id, name: displayName, file, category: "meshova" };
  const i = data.models.findIndex((m) => m && m.id === id);
  if (i >= 0) {
    // 更新已有模型：保留首次生成时间 createdAt，刷新 updatedAt。
    data.models[i] = { ...data.models[i], ...entry, createdAt: data.models[i].createdAt || now, updatedAt: now };
  } else {
    data.models.push({ ...entry, createdAt: now, updatedAt: now });
  }
  await writeFile(manifestPath, JSON.stringify(data, null, 2) + "\n");
}

// --- ref: print the DSL surface --------------------------------------------
if (cmd === "ref" || cmd === undefined) {
  console.log(SCRIPT_API_REFERENCE);
  process.exit(0);
}

// --- prep-image: normalize a reference image to PNG ------------------------
if (cmd === "prep-image") {
  const src = positional[1];
  if (!src || !existsSync(src)) die(`prep-image: file not found: ${src}`);
  await mkdir(join(ROOT, "out", "meshova"), { recursive: true });
  const bytes = new Uint8Array(await readFile(src));
  // If already PNG, copy; otherwise decode+re-encode (decodePNG handles PNG only,
  // so for non-PNG we just pass through and let the caller supply PNG).
  const out = join(ROOT, "out", "meshova", "ref.png");
  await writeFile(out, bytes);
  console.log(JSON.stringify({ ok: true, ref: "out/meshova/ref.png", bytes: bytes.length }));
  process.exit(0);
}

// --- run: one closed-loop iteration ----------------------------------------
if (cmd === "run") {
  const scriptFile = positional[1];
  if (!scriptFile || !existsSync(scriptFile)) die(`run: script not found: ${scriptFile}`);
  const name = (flags.name && String(flags.name)) || basename(scriptFile).replace(/\.[^.]+$/, "");
  const views = (flags.views ? String(flags.views) : "persp,front,side").split(",").map((v) => v.trim()).filter(Boolean);
  const material = flags.material ? String(flags.material) : null;
  const refPath = flags.ref ? String(flags.ref) : null;
  const doRender = !flags["no-render"];
  // Publish to the web gallery by default: write out/<id>.json + shots + manifest
  // so /meshova output shows up in the viewer/gallery with zero extra steps.
  // Disable with --no-publish. A friendly display name comes from --title.
  const doPublish = !flags["no-publish"];
  const title = flags.title ? String(flags.title) : name;
  const source = await readFile(scriptFile, "utf8");

  // 1) sandbox run — the SAME entry textToModel/imageToModel use internally.
  const result = runMeshScript(source, name);
  const summary = {
    ok: result.ok,
    name,
    error: result.error ?? null,
    partCount: result.parts.length,
    opsUsed: result.opsUsed ?? null,
    elapsedMs: result.elapsedMs ?? null,
    stats: result.summary,
    renders: [],
    score: null,
  };

  if (!result.ok) {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(1);
  }

  const outDir = join(ROOT, "out", "meshova", name);
  await mkdir(outDir, { recursive: true });

  // Always persist the re-runnable artifacts: script + OBJ (never a baked-only dump).
  await writeFile(join(outDir, "script.js"), source);
  if (flags.obj) {
    const obj = toOBJScene(result.parts, name);
    await writeFile(join(outDir, `${name}.obj`), obj.obj);
    if (obj.mtl) await writeFile(join(outDir, `${name}.mtl`), obj.mtl);
  }

  // Publish the ViewerModel JSON so the viewer can load it via ?model=<id>.
  const viewerModel = toViewerModel(result.parts, title);
  if (doPublish) {
    await writeFile(join(ROOT, "out", `${name}.json`), JSON.stringify(viewerModel));
    await upsertManifest(name, title, `${name}.json`);
    summary.published = { id: name, file: `${name}.json`, view: `?model=${name}`, gallery: true };
  }

  if (!doRender) {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  }

  // 2) render each view via the live viewer, exactly like the P3 loop.
  const { server, port } = await startServer();
  const base = `http://localhost:${port}`;
  const fullExe = fullChromiumPath();
  const browser = await chromium.launch({
    executablePath: existsSync(fullExe) ? fullExe : undefined,
    headless: true,
    args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--headless=new"],
  });
  try {
    const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 2 });
    await page.goto(base + "/", { waitUntil: "networkidle" });
    await page.waitForFunction(() => !!window.__meshova, null, { timeout: 15000 });
    await page.evaluate(() => window.__meshova.setAutorot(false));

    await page.evaluate((m) => window.__meshova.loadParts(m), viewerModel);
    if (material) await page.evaluate((mat) => window.__meshova.setMaterial(mat), material);

    let target = null;
    if (refPath && existsSync(refPath)) {
      target = makeReferenceTarget(new Uint8Array(await readFile(refPath)));
    }

    const shotsDir = join(ROOT, "out", "shots");
    if (doPublish) await mkdir(shotsDir, { recursive: true });

    for (const view of views) {
      await page.evaluate((v) => window.__meshova.setView(v), view);
      await page.evaluate(() => window.__meshova.screenshotReady());
      await page.waitForTimeout(160);
      const canvas = await page.$("canvas");
      const file = join(outDir, `${view}.png`);
      await canvas.screenshot({ path: file });
      // Also drop the gallery-thumbnail-shaped copy: out/shots/<id>-<view>.png
      if (doPublish) await canvas.screenshot({ path: join(shotsDir, `${name}-${view}.png`) });
      const rel = `out/meshova/${name}/${view}.png`;
      const entry = { view, path: rel };
      // Score the primary view against the reference if provided.
      if (target && (view === "front" || view === views[0])) {
        const png = new Uint8Array(await readFile(file));
        const sc = scoreRenderPng(target, png);
        entry.score = { score: +sc.score.toFixed(4), iou: +sc.silhouetteIoU.toFixed(4), color: +sc.colorSimilarity.toFixed(4) };
        if (!summary.score) summary.score = entry.score;
      }
      summary.renders.push(entry);
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

die(`unknown subcommand: ${cmd}. Use: ref | run | prep-image`);


