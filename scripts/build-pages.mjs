import { mkdir, readFile, rm, writeFile, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HIDDEN_GALLERY_MODEL_IDS } from "../web/model-visibility.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, process.env.MESHOVA_PAGES_DIR || ".site");
const webDir = join(root, "web");
const distDir = join(root, "dist");
const procModelsPath = join(webDir, "procmodels.js");

function assertInsideRoot(path) {
  const rel = path.slice(root.length);
  if (!path.startsWith(root) || rel === "" || rel === "\\") {
    throw new Error(`refuse to remove unsafe path: ${path}`);
  }
}

async function readText(path) {
  return readFile(path, "utf8");
}

async function writeText(path, text) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
}

function rewriteHtmlForRoot(html, kind) {
  let out = html
    .replaceAll('"/web/vendor/three.module.js"', '"./web/vendor/three.module.js"')
    .replaceAll('"/web/vendor/addons/"', '"./web/vendor/addons/"');
  if (kind === "gallery") {
    out = out.replace(/src="\/web\/gallery\.js([^\"]*)"/g, 'src="./web/gallery.js$1"');
  } else {
    out = out
      .replaceAll('href="/web/gallery.html"', 'href="./index.html"')
      .replaceAll("← 模型库", "模型库")
      .replace(/src="\/web\/viewer\.js([^\"]*)"/g, 'src="./web/viewer.js$1"');
  }
  return out.replace("</head>", '<link rel="icon" href="./favicon.ico" />\n</head>');
}

function rewriteHtmlForWeb(html, kind) {
  let out = html
    .replaceAll('"/web/vendor/three.module.js"', '"./vendor/three.module.js"')
    .replaceAll('"/web/vendor/addons/"', '"./vendor/addons/"');
  if (kind === "gallery") {
    out = out.replace(/src="\/web\/gallery\.js([^\"]*)"/g, 'src="./gallery.js$1"');
  } else {
    out = out
      .replaceAll('href="/web/gallery.html"', 'href="../index.html"')
      .replaceAll("← 模型库", "模型库")
      .replace(/src="\/web\/viewer\.js([^\"]*)"/g, 'src="./viewer.js$1"');
  }
  return out.replace("</head>", '<link rel="icon" href="../favicon.ico" />\n</head>');
}

// matlab.html lives in outDir/web/ and references vendor + its module script by
// absolute /web paths; the "back" link points to the gallery (index.html).
function rewriteMaterialHtml(html) {
  const out = html
    .replaceAll('"/web/vendor/three.module.js"', '"./vendor/three.module.js"')
    .replaceAll('"/web/vendor/addons/"', '"./vendor/addons/"')
    .replace(/src="\/web\/matlab\.js([^\"]*)"/g, 'src="./matlab.js$1"')
    .replaceAll('href="/web/gallery.html"', 'href="../index.html"');
  return out.replace("</head>", '<link rel="icon" href="../favicon.ico" />\n</head>');
}

function rewriteWebJs(filename, text) {
  let out = text
    .replace(/fetch\("\/out\/([^"]+)",/g, 'fetch(new URL("../out/$1", import.meta.url),')
    .replace(/fetch\(`\/out\/([^`]+)`,/g, 'fetch(new URL(`../out/$1`, import.meta.url),')
    .replaceAll("`/out/shots/${entry.id}-orbit35.png`", "new URL(`../out/shots/${entry.id}-orbit35.png`, import.meta.url).href")
    .replaceAll("`/out/shots/${entry.id}-persp.png`", "new URL(`../out/shots/${entry.id}-persp.png`, import.meta.url).href")
    .replaceAll("`/out/shots/${entry.id}-top.png`", "new URL(`../out/shots/${entry.id}-top.png`, import.meta.url).href")
    .replaceAll("return `/out/${path}`;", "return new URL(`../out/${path}`, import.meta.url).href;");
  if (
    filename === "materials.js" ||
    filename === "procmodels.js" ||
    filename === "speedtree-tutorial-procmodels.js" ||
    filename === "model-visibility.js"
  ) {
    return out
      .replaceAll('from "/dist/index.js"', 'from "../dist/index.js"')
      .replaceAll('from "/web/', 'from "./')
      .replaceAll('import("/web/', 'import("./');
  }
  if (filename === "viewer.js") {
    return out
      .replaceAll('from "/web/', 'from "./')
      .replaceAll('import("/web/', 'import("./')
      .replaceAll('from "/dist/index.js"', 'from "../dist/index.js"')
      .replaceAll('fetch("/web/', 'fetch("./')
      .replaceAll('file: "/web/procmodels.js"', 'file: "web/procmodels.js"');
  }
  if (filename === "gallery.js") {
    return out
      .replaceAll('from "/web/', 'from "./')
      .replaceAll('import("/web/', 'import("./')
      .replaceAll('fetch("/web/', 'fetch("./')
      .replaceAll("`/web/matlab.html?", "`./matlab.html?")
      .replace(/`\/web\/index\.html\?model=\$\{([^}]+)\}`/g, (_, expr) => {
        return "`./viewer.html?model=${" + expr + "}`";
      });
  }
  if (filename === "matlab.js") {
    return out
      .replaceAll('from "/web/', 'from "./')
      .replaceAll('from "/dist/index.js"', 'from "../dist/index.js"');
  }
  return out;
}

function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseModelNames(source) {
  const names = new Map();
  const idName = /id:\s*"([^"]+)"[\s\S]{0,160}?name:\s*"([^"]+)"/g;
  for (const m of source.matchAll(idName)) names.set(m[1], m[2]);
  const species = /SPEEDTREE_SPECIES\s*=\s*\[([\s\S]*?)\];/.exec(source)?.[1] || "";
  for (const m of species.matchAll(/\{\s*id:\s*"([^"]+)",\s*label:\s*"([^"]+)"/g)) {
    names.set(`speedtree-${m[1]}`, `SpeedTree-lite ${m[2]}`);
  }
  const archetypes = /SPEEDTREE_ARCHETYPES\s*=\s*\[([\s\S]*?)\];\s*function customDefaults/.exec(source)?.[1] || "";
  for (const m of archetypes.matchAll(/id:\s*"([^"]+)"[\s\S]{0,120}?name:\s*"([^"]+)"/g)) {
    names.set(`speedtree-custom-${m[1]}`, `SpeedTree-lite ${m[2]}`);
  }
  return names;
}

function parseExportedModelIds(source) {
  const match = /export const PROC_MODELS\s*=\s*\{([\s\S]*?)\};/.exec(source);
  if (!match) throw new Error("cannot find PROC_MODELS export");
  const ids = [];
  for (const raw of match[1].split(",")) {
    const entry = raw.trim();
    if (!entry) continue;
    if (entry === "...SPEEDTREE_MODELS") {
      const species = /SPEEDTREE_SPECIES\s*=\s*\[([\s\S]*?)\];/.exec(source)?.[1] || "";
      for (const m of species.matchAll(/\{\s*id:\s*"([^"]+)"/g)) ids.push(`speedtree-${m[1]}`);
      ids.push("speedtree-guided-canopy", "speedtree-species-lineup");
      const archetypes = /SPEEDTREE_ARCHETYPES\s*=\s*\[([\s\S]*?)\];\s*function customDefaults/.exec(source)?.[1] || "";
      for (const m of archetypes.matchAll(/id:\s*"([^"]+)"/g)) ids.push(`speedtree-custom-${m[1]}`);
      ids.push("speedtree-custom-lineup");
      continue;
    }
    const quoted = /^"([^"]+)"\s*:/.exec(entry);
    if (quoted) {
      ids.push(quoted[1]);
      continue;
    }
    const keyed = /^([A-Za-z_$][\w$]*)\s*:/.exec(entry);
    if (keyed) {
      ids.push(keyed[1]);
      continue;
    }
    const shorthand = /^([A-Za-z_$][\w$]*)$/.exec(entry);
    if (shorthand) ids.push(shorthand[1]);
  }
  for (const assignment of source.matchAll(/PROC_MODELS\["([^"]+)"\]\s*=/g)) {
    ids.push(assignment[1]);
  }
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

function modelPage(id, name) {
  const safeId = JSON.stringify(id);
  const title = htmlEscape(name || id);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Meshova · ${title}</title>
<link rel="icon" href="../favicon.ico" />
<style>
html,body{height:100%;margin:0;background:#0d1117;color:#e6edf3;font:14px/1.6 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
main{min-height:100%;display:grid;place-items:center;text-align:center;padding:24px}
a{color:#58a6ff}
</style>
<script>
const target = new URL("../viewer.html", location.href);
target.searchParams.set("model", ${safeId});
location.replace(target.href);
</script>
</head>
<body>
<main>
  <div>
    <h1>${title}</h1>
    <p>正在打开模型预览...</p>
    <p><a href="../viewer.html?model=${encodeURIComponent(id)}">打开预览</a></p>
  </div>
</main>
</body>
</html>
`;
}

async function main() {
  if (!existsSync(distDir)) {
    throw new Error("dist/ missing. Run `pnpm build` before building Pages.");
  }

  assertInsideRoot(outDir);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  await cp(webDir, join(outDir, "web"), { recursive: true });
  await cp(distDir, join(outDir, "dist"), { recursive: true });

  await writeText(join(outDir, ".nojekyll"), "");
  await writeText(join(outDir, "out", "models.json"), `${JSON.stringify({ models: [] }, null, 2)}\n`);
  await writeText(join(outDir, "favicon.ico"), "");
  await writeText(join(outDir, "index.html"), rewriteHtmlForRoot(await readText(join(webDir, "gallery.html")), "gallery"));
  await writeText(join(outDir, "viewer.html"), rewriteHtmlForRoot(await readText(join(webDir, "index.html")), "viewer"));
  await writeText(join(outDir, "web", "gallery.html"), rewriteHtmlForWeb(await readText(join(webDir, "gallery.html")), "gallery"));
  await writeText(join(outDir, "web", "index.html"), rewriteHtmlForWeb(await readText(join(webDir, "index.html")), "viewer"));
  await writeText(join(outDir, "web", "matlab.html"), rewriteMaterialHtml(await readText(join(webDir, "matlab.html"))));

  for (const filename of [
    "gallery.js",
    "materials.js",
    "matlab.js",
    "procmodels.js",
    "viewer.js",
    "speedtree-tutorial-procmodels.js",
    "model-visibility.js",
  ]) {
    const path = join(outDir, "web", filename);
    await writeText(path, rewriteWebJs(filename, await readText(path)));
  }

  const procSource = await readText(procModelsPath);
  const names = parseModelNames(procSource);
  const ids = parseExportedModelIds(procSource).filter((id) => !HIDDEN_GALLERY_MODEL_IDS.has(id));
  for (const id of ids) {
    await writeText(join(outDir, "models", `${id}.html`), modelPage(id, names.get(id)));
  }

  console.log(`Meshova Pages built: ${outDir}`);
  console.log(`Model entry pages: ${ids.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
