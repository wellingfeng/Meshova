#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_SOURCE = String.raw`E:\BaiduNetdiskDownload\01-BL模型`;
const DEFAULT_BLENDER = String.raw`C:\Program Files\Blender Foundation\Blender 5.1\blender.exe`;
const args = parseArgs(process.argv.slice(2));
const source = path.resolve(args.source ?? DEFAULT_SOURCE);
const out = path.resolve(args.out ?? path.join("out", "blend-reference"));
const blender = path.resolve(args.blender ?? DEFAULT_BLENDER);
const extractor = path.resolve("scripts", "blend-reference.py");
const limit = args.limit === undefined ? Infinity : Math.max(1, Number(args.limit));
const size = Math.max(128, Number(args.size ?? 640));
const render = !args["no-render"];
const assetViews = Boolean(args["asset-views"]);
const assetLimit = Math.max(0, Number(args["asset-limit"] ?? 0));
const assetPattern = String(args["asset-pattern"] ?? "");
const components = Boolean(args.components);
const componentLimit = Math.max(0, Number(args["component-limit"] ?? 128));

for (const required of [source, blender, extractor]) {
  if (!fs.existsSync(required)) throw new Error(`not found: ${required}`);
}

const files = walk(source)
  .filter((file) => path.extname(file).toLowerCase() === ".blend")
  .filter((file) => !file.includes(`${path.sep}GroupPro${path.sep}`))
  .slice(0, limit);
fs.mkdirSync(out, { recursive: true });

const entries = [];
for (let index = 0; index < files.length; index++) {
  const file = files[index];
  const relative = path.relative(source, file);
  const id = `${String(index + 1).padStart(2, "0")}-${slug(relative.replace(/\.blend$/i, ""))}`;
  const target = path.join(out, id);
  const inventoryFile = path.join(target, "inventory.json");
  console.log(`[${index + 1}/${files.length}] ${relative}`);

  if (fs.existsSync(inventoryFile) && !args.force) {
    const existing = JSON.parse(fs.readFileSync(inventoryFile, "utf8"));
    entries.push(summary(id, relative, file, existing, "cached"));
    console.log("  cached");
    continue;
  }

  fs.mkdirSync(target, { recursive: true });
  const blenderArgs = ["--background", file, "--python", extractor, "--", "--out", target, "--size", String(size)];
  if (!render) blenderArgs.push("--no-render");
  if (assetViews) blenderArgs.push("--asset-views");
  if (assetLimit > 0) blenderArgs.push("--asset-limit", String(assetLimit));
  if (assetPattern) blenderArgs.push("--asset-pattern", assetPattern);
  if (components) blenderArgs.push("--components", "--component-limit", String(componentLimit));
  const result = spawnSync(blender, blenderArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0 || !fs.existsSync(inventoryFile)) {
    const error = (result.stderr || result.stdout || `Blender exited ${result.status}`).trim();
    entries.push({ id, relative, source: file, status: "error", error });
    fs.writeFileSync(path.join(target, "error.txt"), `${error}\n`);
    console.error(`  error: ${error.split(/\r?\n/).at(-1)}`);
    continue;
  }
  const inventory = JSON.parse(fs.readFileSync(inventoryFile, "utf8"));
  entries.push(summary(id, relative, file, inventory, "ok"));
  console.log(`  ${inventory.meshCount} meshes, ${inventory.polygonCount} polygons`);
}

const catalog = {
  source,
  generatedAt: new Date().toISOString(),
  count: entries.length,
  ok: entries.filter((entry) => entry.status !== "error").length,
  entries,
};
fs.writeFileSync(path.join(out, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
fs.writeFileSync(path.join(out, "index.html"), makeHtml(catalog));
console.log(`catalog: ${path.join(out, "catalog.json")}`);
console.log(`board: ${path.join(out, "index.html")}`);

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      parsed[key] = next;
      i++;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}

function walk(root) {
  const found = [];
  const queue = [root];
  while (queue.length) {
    const dir = queue.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) queue.push(full);
      else if (entry.isFile()) found.push(full);
    }
  }
  return found.sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function slug(value) {
  const ascii = value
    .normalize("NFKD")
    .replace(/[\\/]+/g, "-")
    .replace(/[^\p{Letter}\p{Number}-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return ascii || "asset";
}

function summary(id, relative, sourceFile, inventory, status) {
  return {
    id,
    relative,
    source: sourceFile,
    status,
    objectCount: inventory.objectCount,
    meshCount: inventory.meshCount,
    vertexCount: inventory.vertexCount,
    polygonCount: inventory.polygonCount,
    materialCount: inventory.materialCount,
    componentCount: inventory.objects.reduce((count, object) => count + (object.components?.length ?? 0), 0),
    bounds: inventory.bounds,
    views: Object.values(inventory.views ?? {}).map((view) => `${id}/${view.file}`),
    assets: (inventory.assets ?? []).map((asset) => ({
      id: asset.id,
      name: asset.name,
      views: Object.values(asset.views ?? {}).map((view) => `${id}/assets/${asset.id}/${view.file}`),
    })),
  };
}

function makeHtml(catalog) {
  const cards = catalog.entries.map((entry) => {
    const images = (entry.views ?? []).map((file) => `<img loading="lazy" src="${escapeHtml(file.replaceAll("\\", "/"))}">`).join("");
    const assets = (entry.assets ?? []).map((asset) => `<section><h3>${escapeHtml(asset.name)}</h3><div class="views">${asset.views.map((file) => `<img loading="lazy" src="${escapeHtml(file.replaceAll("\\", "/"))}">`).join("")}</div></section>`).join("");
    return `<article><header><h2>${escapeHtml(entry.relative)}</h2><span>${entry.meshCount ?? 0} 网格 · ${(entry.polygonCount ?? 0).toLocaleString("zh-CN")} 面</span></header>${assets || `<div class="views">${images || `<pre>${escapeHtml(entry.error ?? "无渲染")}</pre>`}</div>`}</article>`;
  }).join("\n");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>Blender 模型参考板</title><style>
*{box-sizing:border-box}body{margin:0;background:#0c1014;color:#eef3f6;font:14px/1.45 system-ui,"Microsoft YaHei",sans-serif}body>header{position:sticky;top:0;z-index:2;padding:14px 20px;background:#111820eF;border-bottom:1px solid #2d3943}h1{margin:0;font-size:20px;letter-spacing:0}main{padding:16px 20px}article{margin:0 0 18px;border:1px solid #2d3943;border-radius:6px;overflow:hidden;background:#131a21}article header{display:flex;align-items:baseline;justify-content:space-between;gap:16px;padding:10px 12px}h2{margin:0;font-size:15px;letter-spacing:0}h3{margin:0;padding:8px 12px;font-size:13px;letter-spacing:0;color:#c5d1d9}section{border-top:1px solid #2d3943}.views{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:1px;background:#2d3943}.views img{display:block;width:100%;aspect-ratio:1;object-fit:cover;background:#0b0f13}span{color:#9eb0bd;white-space:nowrap}pre{padding:12px;white-space:pre-wrap;color:#ef9a9a}@media(max-width:900px){.views{grid-template-columns:repeat(2,1fr)}article header{align-items:flex-start;flex-direction:column}}
</style></head><body><header><h1>Blender 模型参考板 · ${catalog.ok}/${catalog.count}</h1></header><main>${cards}</main></body></html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
