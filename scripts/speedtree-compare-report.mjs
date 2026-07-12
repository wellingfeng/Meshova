#!/usr/bin/env node
/**
 * Build a static SpeedTree-vs-Meshova quality report.
 *
 * Input: out/speedtree-fit/report.json + best model JSONs from the fit run.
 * Output: doc/speedtree-quality-comparison.html + multi-angle Meshova shots.
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";
import {
  buildSpeedTreeLibraryPlant,
  decodePNG,
  maskBounds,
  maskFromPhoto,
  resizeNearest,
  toViewerModel,
} from "../dist/index.js";

const ROOT = resolve(process.cwd());
const args = parseArgs(process.argv.slice(2));
const fitDir = resolve(ROOT, String(args.fit ?? "out/speedtree-fit"));
const outDir = resolve(ROOT, String(args.out ?? "out/speedtree-compare"));
const htmlFile = resolve(ROOT, String(args.html ?? "doc/speedtree-quality-comparison.html"));
const capture = args.capture !== "false";
const force = Boolean(args.force);
const rebuildModels = Boolean(args["rebuild-models"] ?? args.current);
const limit = args.limit === undefined ? Infinity : Math.max(1, Number(args.limit));
const bgHex = "#f6f7f4";
const size = { width: 960, height: 720 };
const captureZoom = Math.max(0.5, Number(args.zoom ?? 1.72));
const views = parseViews(String(args.views ?? "front,orbit:-25@10,orbit:25@10,side"));
const report = JSON.parse(await readFile(join(fitDir, "report.json"), "utf8"));
const results = report.results.slice(0, limit);
const anglesDir = join(outDir, "angles");
const rebuiltModelsDir = join(outDir, "models");
const imageStatsCache = new Map();
const modelStatsCache = new Map();

await mkdir(anglesDir, { recursive: true });
await mkdir(rebuiltModelsDir, { recursive: true });
await mkdir(dirname(htmlFile), { recursive: true });

if (capture) {
  await captureAngles(results);
}

const diagnostics = buildDiagnostics(results);
await writeFile(join(outDir, "diagnostics.json"), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  fitDir: relative(ROOT, fitDir),
  items: diagnostics,
}, null, 2)}\n`, "utf8");

await writeFile(htmlFile, renderHtml(report, results, new Map(diagnostics.map((d) => [d.id, d]))), "utf8");
console.log(`report: ${relative(ROOT, htmlFile)}`);

async function captureAngles(items) {
  const { server, port } = await startServer();
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 2 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  try {
    await page.goto(`http://127.0.0.1:${port}/web/index.html`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => !!window.__meshova, null, { timeout: 30000 });
    await page.addStyleTag({
      content: "#hud,#err,#script-panel,#plan-panel,#critiqueBadge{display:none!important;visibility:hidden!important}",
    });
    await page.evaluate((bg) => {
      const m = window.__meshova;
      m.setAutorot?.(false);
      m.setWind?.(false);
      m.setPost?.(false);
      m.setAO?.(false);
      m.setBloom?.(0);
      m.setBackground?.("solid", bg);
      m.setFloor?.("none");
      m.setGrid?.(false);
    }, bgHex);

    for (const [index, item] of items.entries()) {
      const model = await loadModelForCapture(item);
      if (!model) {
        console.warn(`skip missing model: ${item.id}`);
        continue;
      }
      console.log(`[${index + 1}/${items.length}] capture ${item.id}`);
      await page.evaluate((m) => window.__meshova.loadParts(m), model);
      await page.evaluate((bg) => {
        const m = window.__meshova;
        m.setMaterial?.("model");
        m.setBackground?.("solid", bg);
        m.setFloor?.("none");
        m.setGrid?.(false);
        m.setDebugView?.("off");
      }, bgHex);
      await page.waitForTimeout(120);

      for (const view of views) {
        const file = anglePath(item.id, view);
        if (existsSync(file) && !force) continue;
        if (view.orbit !== undefined) {
          await page.evaluate(({ az, el }) => window.__meshova.setOrbit(az, el), { az: view.orbit, el: view.elev });
        } else {
          await page.evaluate((name) => window.__meshova.setView(name), view.name);
        }
        await page.evaluate((zoom) => window.__meshova.setZoom?.(zoom), captureZoom);
        await page.evaluate(() => window.__meshova.settle?.(16));
        await page.waitForTimeout(120);
        const canvas = await page.$("canvas");
        await canvas.screenshot({ path: file });
      }
    }
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }

  if (errors.length) {
    console.warn(`viewer warnings:\n${[...new Set(errors)].slice(0, 12).join("\n")}`);
  }
}

function renderHtml(fullReport, items, diagnosticsById = new Map()) {
  const mean = avg(items.map((r) => r.best.score.score));
  const hits = items.filter((r) => r.best.score.score >= fullReport.targetScore).length;
  const byCategory = categorySummary(items);
  const worst = [...items].sort((a, b) => a.best.score.score - b.best.score.score).slice(0, 6);
  const diagnosisSummary = summarizeDiagnostics([...diagnosticsById.values()]);
  const rows = items.map((item) => renderRow(item, diagnosticsById.get(item.id))).join("\n");
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SpeedTree × Meshova 树木质量对比</title>
<style>
:root{color-scheme:dark;--bg:#0b0f14;--panel:#111820;--line:#26313b;--muted:#8ea2b2;--text:#e6edf3;--blue:#58a6ff;--red:#f85149;--yellow:#d29922;--green:#3fb950}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
header{position:sticky;top:0;z-index:3;background:linear-gradient(180deg,#101720,#101720ee);border-bottom:1px solid var(--line);padding:16px 22px}
h1{margin:0 0 6px;font-size:22px;letter-spacing:0;font-weight:700}
.sub{color:var(--muted);font-size:12px}
.stats{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));gap:10px;margin:14px 0}
.stat{background:#0f151c;border:1px solid var(--line);border-radius:8px;padding:10px 12px}
.stat .k{color:var(--muted);font-size:12px}.stat .v{display:block;font-size:20px;font-weight:800;margin-top:2px}
main{padding:18px 22px 28px}
.summary{display:grid;grid-template-columns:1.3fr 1fr;gap:14px;margin-bottom:18px}
.box{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px}
.box h2{margin:0 0 10px;font-size:15px}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.chip{border:1px solid #334155;background:#0d131b;border-radius:999px;padding:4px 9px;color:#c7d4df;font-size:12px}
.row{display:grid;grid-template-columns:minmax(240px,.9fr) minmax(420px,1.25fr) minmax(280px,.85fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:8px;overflow:hidden;margin:14px 0}
.col{background:#0f151c;min-width:0}
.col h3{margin:0;padding:9px 11px;border-bottom:1px solid var(--line);font-size:12px;color:var(--muted);letter-spacing:.35px;text-transform:uppercase}
.media{padding:10px}
img{display:block;width:100%;background:#f6f7f4;border:1px solid #2f3b46;border-radius:6px;object-fit:contain}
.ref img{height:380px}
.angle-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.shot img{height:184px}
figcaption{margin-top:5px;color:#9fb1c1;font-size:12px}
figure{margin:0}
.title{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 12px 0}
.title h2{font-size:18px;margin:0}
.score{font-size:22px;font-weight:850;font-variant-numeric:tabular-nums}
.ok{color:var(--green)}.warn{color:var(--yellow)}.bad{color:var(--red)}
.metric{display:flex;gap:8px;flex-wrap:wrap;padding:9px 12px 12px}
.metric span{font-size:12px;color:#c8d3dc;border:1px solid #303b46;background:#0b1118;border-radius:999px;padding:3px 8px}
.advice{padding:12px}
.advice h4{margin:0 0 7px;color:#c8d3dc;font-size:13px}
.advice ul{margin:0 0 12px;padding-left:18px}
.advice li{margin:4px 0}
.diag-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:0 0 12px}
.diag{border:1px solid #303b46;background:#0b1118;border-radius:6px;padding:7px 8px;min-width:0}
.diag b{display:block;color:#91a4b5;font-size:11px;font-weight:650}
.diag span{display:block;color:#d4dee7;font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.diag em{display:block;font-style:normal;font-weight:800;font-size:13px;font-variant-numeric:tabular-nums}
.diag.ok em{color:var(--green)}.diag.warn em{color:var(--yellow)}.diag.bad em{color:var(--red)}
.note{color:var(--muted);font-size:12px}
code{background:#0a0f15;border:1px solid #24303a;border-radius:4px;padding:1px 4px}
@media (max-width:1050px){.row,.summary{grid-template-columns:1fr}.stats{grid-template-columns:repeat(2,1fr)}.ref img{height:300px}.shot img{height:220px}}
@media (max-width:640px){main,header{padding-left:12px;padding-right:12px}.stats{grid-template-columns:1fr}.angle-grid{grid-template-columns:1fr}.shot img{height:260px}}
</style>
</head>
<body>
<header>
  <h1>SpeedTree × Meshova 树木质量对比</h1>
  <div class="sub">生成时间 ${escapeHtml(new Date().toLocaleString("zh-CN"))} · 数据源 ${escapeHtml(relative(ROOT, fitDir))} · SpeedTree 源库当前只用官方预览图；Meshova 已补拍多角度截图。</div>
  <div class="stats">
    <div class="stat"><span class="k">样本数</span><span class="v">${items.length}</span></div>
    <div class="stat"><span class="k">平均分</span><span class="v ${scoreClass(mean, fullReport.targetScore)}">${fmt(mean)}</span></div>
    <div class="stat"><span class="k">达标数</span><span class="v">${hits}/${items.length}</span></div>
    <div class="stat"><span class="k">目标分</span><span class="v">${fmt(fullReport.targetScore)}</span></div>
  </div>
</header>
<main>
  <section class="summary">
    <div class="box">
      <h2>总体结论</h2>
      <div class="chips">
        <span class="chip">最大问题：树型模板太少，很多类别被同一套冠层/枝干代理硬套</span>
        <span class="chip">优先级：先修轮廓，再修颜色，再加材质细节</span>
        <span class="chip">评分只跑正面；后续拟合应纳入多视角一致性</span>
        ${diagnosisSummary.map((s) => `<span class="chip">${escapeHtml(s)}</span>`).join("")}
      </div>
    </div>
    <div class="box">
      <h2>分类均分</h2>
      <div class="chips">${byCategory.map((c) => `<span class="chip">${escapeHtml(c.name)} ${fmt(c.mean)}</span>`).join("")}</div>
      <p class="note">最低样本：${worst.map((r) => `${escapeHtml(r.name)} ${fmt(r.best.score.score)}`).join(" / ")}</p>
      <p class="note">量化诊断：${escapeHtml(relative(ROOT, join(outDir, "diagnostics.json")))}</p>
    </div>
  </section>
${rows}
</main>
</body>
</html>
`;
}

function renderRow(item, diag) {
  const best = item.best;
  const score = best.score.score;
  const cls = scoreClass(score, report.targetScore);
  const refAbs = join(fitDir, item.referencePath);
  const refPath = relToHtml(refAbs);
  const angleFigures = views.map((view) => {
    const shotAbs = anglePath(item.id, view);
    const fallbackAbs = join(fitDir, best.renderPath);
    const src = existsSync(shotAbs) ? relToHtml(shotAbs) : relToHtml(fallbackAbs);
    return `<figure class="shot"><img src="${escapeAttr(src)}" alt="${escapeAttr(item.name)} ${escapeAttr(view.label)}"><figcaption>${escapeHtml(view.label)}</figcaption></figure>`;
  }).join("");
  const advice = makeAdvice(item, diag);
  const diagMetric = diag?.ok
    ? `<span>宽高 ${fmt(diag.ref.aspect)} → ${fmt(diag.mesh.aspect)}</span><span>面积 ${fmt(diag.ref.areaFraction)} → ${fmt(diag.mesh.areaFraction)}</span>`
    : "";
  const spm = item.spmNotes?.length
    ? `<h4>SPM 映射</h4><ul>${item.spmNotes.slice(0, 5).map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>`
    : `<p class="note">无可用 SPM 结构统计，当前主要靠预览图轮廓/颜色拟合。</p>`;

  return `<section class="row">
  <div class="col ref">
    <div class="title"><h2>${escapeHtml(item.name)}</h2><div class="score ${cls}">${fmt(score)}</div></div>
    <div class="metric">
      <span>${escapeHtml(item.sourceCategory)} / ${escapeHtml(item.sourceSpecies)}</span>
      <span>IoU ${fmt(best.score.silhouetteIoU)}</span>
      <span>颜色 ${fmt(best.score.colorSimilarity)}</span>
      ${diagMetric}
    </div>
    <div class="media"><figure><img src="${escapeAttr(refPath)}" alt="${escapeAttr(item.name)} SpeedTree"><figcaption>SpeedTree 官方预览 / ${escapeHtml(item.referenceOriginal)}</figcaption></figure></div>
  </div>
  <div class="col">
    <h3>Meshova 多角度截图</h3>
    <div class="media angle-grid">${angleFigures}</div>
  </div>
  <div class="col">
    <h3>优化建议</h3>
    <div class="advice">
      <h4>主要差距</h4>
      <ul>${advice.problems.map((v) => `<li>${escapeHtml(v)}</li>`).join("")}</ul>
      <h4>指标诊断</h4>
      ${renderDiagnosticPanel(diag)}
      <h4>动作</h4>
      <ul>${advice.actions.map((v) => `<li>${inlineCode(v)}</li>`).join("")}</ul>
      ${spm}
      <p class="note">最佳候选：${escapeHtml(best.tag)} / ${escapeHtml(best.view)}。参数：height=${fmt(best.params.height)}, trunk=${fmt(best.params.trunkScale)}, crown=${fmt(best.params.crownScale)}, leaf=${fmt(best.params.leafSize)}.</p>
    </div>
  </div>
</section>`;
}

function buildDiagnostics(items) {
  return items.map((item) => {
    try {
      const refFile = join(fitDir, item.referencePath);
      const frontShot = frontAnglePath(item.id);
      const renderFile = existsSync(frontShot) ? frontShot : join(fitDir, item.best.renderPath);
      const rebuiltModelFile = join(rebuiltModelsDir, `${item.id}.json`);
      const modelFile = existsSync(rebuiltModelFile)
        ? rebuiltModelFile
        : item.best.modelPath
          ? join(fitDir, item.best.modelPath)
          : join(fitDir, "models", `${item.id}.json`);
      const ref = imageStats(refFile);
      const mesh = imageStats(renderFile);
      const geom = modelStats(modelFile);
      if (!ref.ok || !mesh.ok) {
        return {
          id: item.id,
          name: item.name,
          ok: false,
          error: ref.error || mesh.error || "image metrics unavailable",
        };
      }
      return {
        id: item.id,
        name: item.name,
        ok: true,
        ref,
        mesh,
        delta: imageDelta(ref, mesh),
        geom,
      };
    } catch (e) {
      return { id: item.id, name: item.name, ok: false, error: String(e) };
    }
  });
}

async function loadModelForCapture(item) {
  if (!rebuildModels) {
    const modelFile = join(fitDir, "models", `${item.id}.json`);
    if (!existsSync(modelFile)) return null;
    return JSON.parse(await readFile(modelFile, "utf8"));
  }
  const entry = {
    category: item.sourceCategory,
    species: item.sourceSpecies,
    ...(item.sourceVariant ? { variant: item.sourceVariant } : {}),
  };
  const buildOpts = {
    quality: report.quality ?? "medium",
    params: item.best?.params ?? {},
  };
  if (item.refColors?.foliage) buildOpts.foliageColor = item.refColors.foliage;
  if (item.refColors?.bark) buildOpts.barkColor = item.refColors.bark;
  const parts = buildSpeedTreeLibraryPlant(entry, buildOpts);
  const model = toViewerModel(parts, `${item.name} current`);
  model.meta.procedural = {
    type: "speedtree-compare-current-generator",
    source: entry,
    params: buildOpts.params,
    rebuiltFromReport: relative(ROOT, join(fitDir, "report.json")),
  };
  await writeFile(join(rebuiltModelsDir, `${item.id}.json`), JSON.stringify(model), "utf8");
  return model;
}

function imageStats(file) {
  const key = resolve(file);
  const cached = imageStatsCache.get(key);
  if (cached) return cached;
  try {
    const raster = resizeNearest(decodePNG(new Uint8Array(readFileSync(key))), 160, 160);
    const mask = maskFromPhoto(raster);
    const data = mask.data ?? mask;
    const b = maskBounds(mask);
    if (!b || b.area <= 0) {
      const empty = { ok: false, error: `empty mask: ${relative(ROOT, key)}` };
      imageStatsCache.set(key, empty);
      return empty;
    }
    const width = b.x1 - b.x0 + 1;
    const height = b.y1 - b.y0 + 1;
    let sx = 0;
    let sy = 0;
    let n = 0;
    let edge = 0;
    let r = 0;
    let g = 0;
    let bl = 0;
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        const idx = y * raster.width + x;
        if (!data[idx]) continue;
        sx += x;
        sy += y;
        n++;
        const pi = idx * 4;
        r += raster.data[pi] ?? 0;
        g += raster.data[pi + 1] ?? 0;
        bl += raster.data[pi + 2] ?? 0;
        if (!masked(data, raster.width, raster.height, x - 1, y)) edge++;
        if (!masked(data, raster.width, raster.height, x + 1, y)) edge++;
        if (!masked(data, raster.width, raster.height, x, y - 1)) edge++;
        if (!masked(data, raster.width, raster.height, x, y + 1)) edge++;
      }
    }
    const mean = n > 0 ? [r / n / 255, g / n / 255, bl / n / 255] : [0, 0, 0];
    const out = {
      ok: true,
      areaFraction: round4(n / (raster.width * raster.height)),
      aspect: round4(width / Math.max(1, height)),
      centroidX: round4((sx / Math.max(1, n) - b.x0) / Math.max(1, width)),
      centroidY: round4((sy / Math.max(1, n) - b.y0) / Math.max(1, height)),
      topWidth: round4(bandWidth(data, raster.width, b, 0, 0.25)),
      midWidth: round4(bandWidth(data, raster.width, b, 0.35, 0.65)),
      baseWidth: round4(bandWidth(data, raster.width, b, 0.75, 1)),
      lowerCoreFill: round4(bandCoreFill(data, raster.width, b, 0.62, 1, 0.22)),
      edgeComplexity: round4(edge / Math.max(1, Math.sqrt(n))),
      meanColor: mean.map(round4),
      bounds: b,
    };
    imageStatsCache.set(key, out);
    return out;
  } catch (e) {
    const out = { ok: false, error: String(e) };
    imageStatsCache.set(key, out);
    return out;
  }
}

function modelStats(file) {
  const key = resolve(file);
  const cached = modelStatsCache.get(key);
  if (cached) return cached;
  try {
    const model = JSON.parse(readFileSync(key, "utf8"));
    const bounds = {
      minX: Infinity, minY: Infinity, minZ: Infinity,
      maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity,
    };
    let verts = 0;
    let tris = 0;
    let foliageVerts = 0;
    let woodVerts = 0;
    const parts = [];
    for (const part of model.parts ?? []) {
      const positions = part.positions ?? part.mesh?.positions ?? [];
      const indices = part.indices ?? part.mesh?.indices ?? [];
      const pv = Math.floor(positions.length / 3);
      const pt = Math.floor(indices.length / 3);
      verts += pv;
      tris += pt;
      const kind = partKind(part);
      if (kind === "foliage") foliageVerts += pv;
      if (kind === "wood") woodVerts += pv;
      for (let i = 0; i < positions.length; i += 3) {
        const x = Number(positions[i] ?? 0);
        const y = Number(positions[i + 1] ?? 0);
        const z = Number(positions[i + 2] ?? 0);
        bounds.minX = Math.min(bounds.minX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.minZ = Math.min(bounds.minZ, z);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.maxY = Math.max(bounds.maxY, y);
        bounds.maxZ = Math.max(bounds.maxZ, z);
      }
      parts.push({ name: part.name ?? "", label: part.label ?? "", kind, verts: pv, tris: pt });
    }
    const hasBounds = Number.isFinite(bounds.minX);
    const width = hasBounds ? bounds.maxX - bounds.minX : 0;
    const height = hasBounds ? bounds.maxY - bounds.minY : 0;
    const depth = hasBounds ? bounds.maxZ - bounds.minZ : 0;
    const out = {
      ok: true,
      parts: parts.length,
      verts,
      tris,
      width: round3(width),
      height: round3(height),
      depth: round3(depth),
      widthHeight: round4(width / Math.max(1e-6, height)),
      depthHeight: round4(depth / Math.max(1e-6, height)),
      foliageVertexShare: round4(foliageVerts / Math.max(1, foliageVerts + woodVerts)),
      partSummary: parts.slice(0, 8),
    };
    modelStatsCache.set(key, out);
    return out;
  } catch (e) {
    const out = { ok: false, error: String(e) };
    modelStatsCache.set(key, out);
    return out;
  }
}

function imageDelta(ref, mesh) {
  return {
    aspect: round4(ratioDelta(mesh.aspect, ref.aspect)),
    area: round4(ratioDelta(mesh.areaFraction, ref.areaFraction)),
    centroidX: round4(mesh.centroidX - ref.centroidX),
    centroidY: round4(mesh.centroidY - ref.centroidY),
    topWidth: round4(mesh.topWidth - ref.topWidth),
    midWidth: round4(mesh.midWidth - ref.midWidth),
    baseWidth: round4(mesh.baseWidth - ref.baseWidth),
    lowerCoreFill: round4(mesh.lowerCoreFill - ref.lowerCoreFill),
    edgeComplexity: round4(ratioDelta(mesh.edgeComplexity, ref.edgeComplexity)),
    colorDistance: round4(colorDistance(ref.meanColor, mesh.meanColor)),
  };
}

function renderDiagnosticPanel(diag) {
  if (!diag?.ok) {
    return `<p class="note">指标不可用：${escapeHtml(diag?.error ?? "未生成")}</p>`;
  }
  const d = diag.delta;
  const cells = [
    diagCell("宽高比", diag.ref.aspect, diag.mesh.aspect, pct(d.aspect), severityAbs(d.aspect, 0.16, 0.32)),
    diagCell("遮罩面积", diag.ref.areaFraction, diag.mesh.areaFraction, pct(d.area), severityAbs(d.area, 0.18, 0.36)),
    diagCell("质量高度", diag.ref.centroidY, diag.mesh.centroidY, signed(d.centroidY), severityAbs(d.centroidY, 0.07, 0.14)),
    diagCell("顶部宽度", diag.ref.topWidth, diag.mesh.topWidth, signed(d.topWidth), severityAbs(d.topWidth, 0.16, 0.32)),
    diagCell("中段宽度", diag.ref.midWidth, diag.mesh.midWidth, signed(d.midWidth), severityAbs(d.midWidth, 0.16, 0.32)),
    diagCell("底部宽度", diag.ref.baseWidth, diag.mesh.baseWidth, signed(d.baseWidth), severityAbs(d.baseWidth, 0.16, 0.32)),
    diagCell("边缘复杂度", diag.ref.edgeComplexity, diag.mesh.edgeComplexity, pct(d.edgeComplexity), severityAbs(d.edgeComplexity, 0.2, 0.4)),
    diagCell("颜色距离", 0, d.colorDistance, fmt(d.colorDistance), severityAbs(d.colorDistance, 0.12, 0.22)),
  ].join("");
  const geom = diag.geom?.ok
    ? `<p class="note">几何：高 ${fmt(diag.geom.height)}，宽/高 ${fmt(diag.geom.widthHeight)}，深/高 ${fmt(diag.geom.depthHeight)}，叶片顶点占比 ${percent(diag.geom.foliageVertexShare)}，parts ${diag.geom.parts}。</p>`
    : "";
  return `<div class="diag-grid">${cells}</div>${geom}`;
}

function diagCell(label, ref, mesh, delta, cls) {
  return `<div class="diag ${cls}"><b>${escapeHtml(label)}</b><span>${fmt(ref)} → ${fmt(mesh)}</span><em>${escapeHtml(delta)}</em></div>`;
}

function summarizeDiagnostics(diags) {
  const counters = new Map();
  const add = (label) => counters.set(label, (counters.get(label) ?? 0) + 1);
  for (const diag of diags) {
    if (!diag?.ok) continue;
    const d = diag.delta;
    if (d.aspect > 0.18) add("常见问题：Meshova 剪影偏宽/偏矮");
    if (d.aspect < -0.18) add("常见问题：Meshova 剪影偏窄/偏高");
    if (d.area < -0.2) add("常见问题：叶冠/枝量不足");
    if (d.area > 0.2) add("常见问题：遮罩过满，冠层太团");
    if (d.centroidY < -0.08) add("常见问题：视觉质量偏上");
    if (d.centroidY > 0.08) add("常见问题：视觉质量偏下");
    if (d.edgeComplexity < -0.25) add("常见问题：轮廓过平滑");
    if (d.colorDistance > 0.16) add("常见问题：材质颜色偏差");
  }
  return [...counters.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, count]) => `${label} (${count})`);
}

function makeAdvice(item, diag) {
  const b = item.best;
  const s = b.score;
  const tag = String(b.tag ?? "");
  const nameKey = `${item.name} ${item.sourceSpecies}`.toLowerCase();
  const cat = String(item.sourceCategory ?? "").toLowerCase();
  const problems = [];
  const actions = [];

  if (s.score >= report.targetScore) {
    problems.push("轮廓已接近，可作为同类模板正例。");
    actions.push("固化该类默认参数；再补 bark/leaf 材质细节、LOD、风权重。");
  } else if (s.silhouetteIoU < 0.35) {
    problems.push("轮廓严重偏离，调单参数收益低。");
    actions.push("先换树型生成器：按物种建专用骨架/冠层包络，再跑参数拟合。");
  } else if (s.silhouetteIoU < 0.5) {
    problems.push("大轮廓可读，但冠幅、主干比例、枝层分布不稳。");
    actions.push("把 canopy envelope 变成可拟合曲线/体素场；目标先对齐 silhouette IoU。");
  } else {
    problems.push("轮廓尚可，细节与颜色拖分。");
    actions.push("保留当前骨架；追加叶片形状、枝条层级、材质分区。");
  }

  if (s.colorSimilarity < 0.22) {
    problems.push("颜色相似度低，冠/干/枯叶被平均色抹平。");
    actions.push("参考图分区采样 foliage/bark/dry/flower；材质不要只吃单个 tint。");
  }

  if (diag?.ok) {
    const d = diag.delta;
    if (d.aspect < -0.18) {
      problems.push(`指标：宽高比低 ${pct(d.aspect)}，Meshova 偏窄/偏高。`);
      actions.push("扩大 `crownScale` 或降低 `height`；优先加横向一级枝。");
    } else if (d.aspect > 0.18) {
      problems.push(`指标：宽高比高 ${pct(d.aspect)}，Meshova 偏宽/偏矮。`);
      actions.push("收窄 `crownScale` 或提高裸干高度；底层枝别铺满。");
    }
    if (d.area < -0.2) {
      problems.push(`指标：遮罩面积少 ${pct(d.area)}，视觉质量不足。`);
      actions.push("提高 `leafDensity`/`branchCount`；用叶簇体素填冠层空洞。");
    } else if (d.area > 0.2) {
      problems.push(`指标：遮罩面积多 ${pct(d.area)}，冠层过满。`);
      actions.push("降低 `leafDensity`；按高度曲线稀疏底部和内部叶片。");
    }
    if (d.centroidY < -0.08) {
      problems.push("指标：质量中心偏上，顶部太重。");
      actions.push("下移 crown base 或增加中下层枝；减少顶部叶簇集中。");
    } else if (d.centroidY > 0.08) {
      problems.push("指标：质量中心偏下，底部太重。");
      actions.push("提高 crown base；压低底部叶密度和灌木化倾向。");
    }
    if (d.edgeComplexity < -0.25) {
      problems.push(`指标：边缘复杂度低 ${pct(d.edgeComplexity)}，剪影太光滑。`);
      actions.push("增加小枝/叶簇尺度层级；叶片大小做随机分布，不只调总密度。");
    }
    if (d.colorDistance > 0.16) {
      problems.push(`指标：前景均色距离 ${fmt(d.colorDistance)}，颜色不贴参考。`);
      actions.push("拆 foliage/bark/dry/flower 多材质采样；给落叶/花色独立通道。");
    }
  }

  if (cat.includes("conifer")) {
    problems.push("针叶类用普通叶云代理，缺枝轮、针束、下垂枝片。");
    actions.push("新增 conifer whorl skeleton：主干节段 + 层状枝轮 + needle/frond card cluster。");
  }
  if (cat.includes("palm") || nameKey.includes("palm") || nameKey.includes("banana")) {
    problems.push("棕榈/芭蕉类需要器官级大叶，不是冠层云。");
    actions.push("加 frond/large-leaf generator：叶柄、折叠中脉、叶片撕裂、放射/下垂角。");
  }
  if (nameKey.includes("cactus") || nameKey.includes("saguaro")) {
    problems.push("仙人掌轮廓依赖肋条、分叉臂、刺点节律。");
    actions.push("加 cactus ribs + areole dots + arm attachment rule；叶密度参数应禁用。");
  }
  if (nameKey.includes("willow")) {
    problems.push("垂柳缺下垂枝帘，当前冠层太团块。");
    actions.push("用 hanging twig strands + leaf curtains；叶片沿重力方向成束下垂。");
  }
  if (nameKey.includes("acacia") || nameKey.includes("umbrella")) {
    problems.push("伞形树冠扁平度和裸干长度不足。");
    actions.push("加 umbrella crown mode：高裸干、水平主枝、扁平冠盘、稀疏底层。");
  }
  if (nameKey.includes("baobab")) {
    problems.push("猴面包树识别点是肿胀瓶状主干和稀疏顶部枝。");
    actions.push("加 swollen trunk spline profile；枝叶只放顶部，不要均匀包冠。");
  }
  if (nameKey.includes("bamboo")) {
    problems.push("竹子需要多根竿、节环、顶端叶簇。");
    actions.push("改为 culm cluster：随机竿高、节点环、侧枝叶簇，不走树冠模板。");
  }
  if (nameKey.includes("boxwood") || nameKey.includes("shrub")) {
    problems.push("灌木目标更像修剪体块，枝干不该抢轮廓。");
    actions.push("加 shrub volume fill：球/盒状体积叶片，枝干内部弱显示。");
  }

  if (tag.includes("leafSize+")) actions.push("搜索显示 leafSize+ 有收益：提高叶片/叶簇尺寸上限。");
  if (tag.includes("leafSize-")) actions.push("搜索显示 leafSize- 有收益：改小叶片，靠数量补密度。");
  if (tag.includes("trunkScale+")) actions.push("搜索显示 trunkScale+ 有收益：主干偏细，提升 trunk profile。");
  if (tag.includes("trunkScale-")) actions.push("搜索显示 trunkScale- 有收益：主干偏粗，细化枝干衰减。");
  if (tag.includes("crownScale+")) actions.push("搜索显示 crownScale+ 有收益：冠幅偏窄，扩大水平包络。");
  if (tag.includes("crownScale-")) actions.push("搜索显示 crownScale- 有收益：冠幅偏宽，收窄轮廓。");
  if (tag.includes("crownDepth+")) actions.push("搜索显示 crownDepth+ 有收益：冠层厚度不足。");
  if (tag.includes("lean")) actions.push("搜索显示 lean 有收益：加入风向/重力姿态作为可拟合维度。");

  return {
    problems: uniq(problems).slice(0, 5),
    actions: uniq(actions).slice(0, 7),
  };
}

function partKind(part) {
  const text = `${part.name ?? ""} ${part.label ?? ""} ${part.surface?.type ?? ""}`.toLowerCase();
  if (/leaf|foliage|frond|needle|blade|flower|bloom|petal|叶|花|针/.test(text)) return "foliage";
  if (/wood|trunk|stem|branch|bark|rachis|root|枝|干|茎|柄|轴/.test(text)) return "wood";
  return "other";
}

function masked(data, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  return !!data[y * width + x];
}

function bandWidth(data, width, b, t0, t1) {
  const h = b.y1 - b.y0 + 1;
  const fullW = b.x1 - b.x0 + 1;
  const y0 = Math.max(b.y0, Math.floor(b.y0 + h * t0));
  const y1 = Math.min(b.y1, Math.ceil(b.y0 + h * t1));
  let sum = 0;
  let rows = 0;
  for (let y = y0; y <= y1; y++) {
    let minX = Infinity;
    let maxX = -Infinity;
    for (let x = b.x0; x <= b.x1; x++) {
      if (!data[y * width + x]) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
    if (Number.isFinite(minX)) {
      sum += (maxX - minX + 1) / Math.max(1, fullW);
      rows++;
    }
  }
  return rows > 0 ? sum / rows : 0;
}

function bandCoreFill(data, width, b, t0, t1, halfWidth) {
  const h = b.y1 - b.y0 + 1;
  const fullW = b.x1 - b.x0 + 1;
  const cx = (b.x0 + b.x1) * 0.5;
  const x0 = Math.max(b.x0, Math.floor(cx - fullW * halfWidth));
  const x1 = Math.min(b.x1, Math.ceil(cx + fullW * halfWidth));
  const y0 = Math.max(b.y0, Math.floor(b.y0 + h * t0));
  const y1 = Math.min(b.y1, Math.ceil(b.y0 + h * t1));
  let hit = 0;
  let total = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      total++;
      if (data[y * width + x]) hit++;
    }
  }
  return total > 0 ? hit / total : 0;
}

function ratioDelta(a, b) {
  return b === 0 ? 0 : a / b - 1;
}

function colorDistance(a, b) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

function severityAbs(value, warn, bad) {
  const v = Math.abs(Number(value ?? 0));
  if (v >= bad) return "bad";
  if (v >= warn) return "warn";
  return "ok";
}

function pct(value) {
  const v = Number(value ?? 0);
  return `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;
}

function percent(value) {
  return `${Math.round(Number(value ?? 0) * 100)}%`;
}

function signed(value) {
  const v = Number(value ?? 0);
  return `${v > 0 ? "+" : ""}${v.toFixed(3)}`;
}

function round3(value) {
  return Math.round(Number(value ?? 0) * 1000) / 1000;
}

function round4(value) {
  return Math.round(Number(value ?? 0) * 10000) / 10000;
}

function categorySummary(items) {
  const map = new Map();
  for (const r of items) {
    const bucket = map.get(r.sourceCategory) ?? [];
    bucket.push(r.best.score.score);
    map.set(r.sourceCategory, bucket);
  }
  return [...map.entries()]
    .map(([name, values]) => ({ name, mean: avg(values) }))
    .sort((a, b) => a.mean - b.mean);
}

function parseViews(value) {
  return value.split(",").map((raw) => raw.trim()).filter(Boolean).map((token) => {
    const orb = /^orbit:(-?\d+(?:\.\d+)?)(?:@(-?\d+(?:\.\d+)?))?$/.exec(token);
    if (orb) {
      const az = Number(orb[1]);
      const el = orb[2] === undefined ? 10 : Number(orb[2]);
      return {
        name: token,
        safe: `orbit${az < 0 ? "m" : ""}${Math.abs(az)}_${el}`.replace(/\./g, "p"),
        label: `${az < 0 ? "左前" : "右前"} ${Math.abs(az)}°`,
        orbit: (az * Math.PI) / 180,
        elev: el,
      };
    }
    const labels = { front: "正面", side: "侧面", top: "顶视", persp: "透视" };
    return {
      name: token,
      safe: token.replace(/[^a-z0-9_-]+/gi, "_"),
      label: labels[token] ?? token,
    };
  });
}

function anglePath(id, view) {
  return join(anglesDir, `${id}-${view.safe}.png`);
}

function frontAnglePath(id) {
  const front = views.find((view) => view.name === "front") ?? views[0];
  return anglePath(id, front);
}

function relToHtml(file) {
  return relative(dirname(htmlFile), file).replace(/\\/g, "/");
}

async function startServer() {
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  };
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
      res.writeHead(200, { "content-type": mime[extname(target).toLowerCase()] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((resolveServer, reject) => {
    let port = 5460;
    const tryListen = () => {
      server.once("error", (err) => {
        if (err && err.code === "EADDRINUSE" && port < 5510) {
          port += 1;
          tryListen();
        } else {
          reject(err);
        }
      });
      server.listen(port, "127.0.0.1", () => resolveServer({ server, port }));
    };
    tryListen();
  });
}

async function launchBrowser() {
  const shellExe = chromium.executablePath();
  const fullExe = shellExe
    .replace(/chromium_headless_shell-(\d+)/, "chromium-$1")
    .replace(/chrome-headless-shell-win64[\\/]chrome-headless-shell\.exe$/i, "chrome-win64\\chrome.exe")
    .replace(/chrome-headless-shell-mac[^\\/]*[\\/].*$/i, "chrome-mac/Chromium.app/Contents/MacOS/Chromium")
    .replace(/chrome-headless-shell-linux[\\/]chrome-headless-shell$/i, "chrome-linux/chrome");
  return chromium.launch({
    executablePath: existsSync(fullExe) ? fullExe : undefined,
    headless: true,
    args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--headless=new"],
  });
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq > 2) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function scoreClass(score, target) {
  if (score >= target) return "ok";
  if (score >= target * 0.75) return "warn";
  return "bad";
}

function avg(values) {
  return values.reduce((sum, v) => sum + Number(v || 0), 0) / Math.max(1, values.length);
}

function uniq(values) {
  return [...new Set(values)];
}

function fmt(value) {
  return Number(value ?? 0).toFixed(3);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function inlineCode(value) {
  return escapeHtml(value).replace(/`([^`]+)`/g, "<code>$1</code>");
}
