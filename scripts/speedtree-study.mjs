#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_SOURCE = process.env.SPEEDTREE_SOURCE
  ?? String.raw`E:\BaiduNetdiskDownload\speedtree教程软件树库\SpeedTree教程26部`;
const VIDEO_EXTS = new Set([".mp4", ".mov", ".m4v", ".mkv", ".avi", ".wmv", ".flv"]);
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".tif", ".tiff", ".tga", ".bmp"]);
const SOURCE_EXTS = new Set([".spm"]);

const args = parseArgs(process.argv.slice(2));
const sourceDir = path.resolve(args.source ?? DEFAULT_SOURCE);
const outDir = path.resolve(args.out ?? path.join("out", "speedtree-study"));
const extractFrames = Boolean(args.frames);
const force = Boolean(args.force);
const intervalSec = Math.max(1, Number(args.interval ?? 15));
const frameWidth = Math.max(240, Number(args.width ?? 1280));
const limit = args.limit === undefined ? Infinity : Math.max(1, Number(args.limit));

if (!fs.existsSync(sourceDir)) {
  throw new Error(`SpeedTree source dir not found: ${sourceDir}`);
}

fs.mkdirSync(outDir, { recursive: true });

const allFiles = walk(sourceDir);
const videos = allFiles.filter((file) => VIDEO_EXTS.has(path.extname(file).toLowerCase()));
const imageAssets = allFiles.filter((file) => IMAGE_EXTS.has(path.extname(file).toLowerCase()));
const speedTreeSources = allFiles.filter((file) => SOURCE_EXTS.has(path.extname(file).toLowerCase()));

const entries = [];
for (let i = 0; i < videos.length; i++) {
  const fullPath = videos[i];
  const relPath = path.relative(sourceDir, fullPath);
  const stat = fs.statSync(fullPath);
  const probe = ffprobe(fullPath);
  const durationSec = probe.durationSec ?? 0;
  const id = `${String(i + 1).padStart(3, "0")}-${slug(relPath)}`;
  entries.push({
    index: i + 1,
    id,
    tutorial: relPath.split(path.sep)[0] ?? "",
    name: path.basename(fullPath),
    relPath,
    fullPath,
    bytes: stat.size,
    durationSec,
    duration: fmtDuration(durationSec),
    width: probe.width,
    height: probe.height,
    hasAudio: probe.hasAudio,
    probeError: probe.error,
  });
}

const study = {
  sourceDir,
  generatedAt: new Date().toISOString(),
  videoCount: entries.length,
  totalDurationSec: entries.reduce((sum, entry) => sum + entry.durationSec, 0),
  totalDuration: fmtDuration(entries.reduce((sum, entry) => sum + entry.durationSec, 0)),
  imageAssetCount: imageAssets.length,
  speedTreeSourceCount: speedTreeSources.length,
  videos: entries,
  imageAssets: imageAssets.map((file) => path.relative(sourceDir, file)),
  speedTreeSources: speedTreeSources.map((file) => path.relative(sourceDir, file)),
};

writeJson(path.join(outDir, "video-inventory.json"), study);
writeMarkdown(path.join(outDir, "video-inventory.md"), study);

if (extractFrames) {
  const selected = entries.slice(0, limit);
  for (let i = 0; i < selected.length; i++) {
    const entry = selected[i];
    console.log(`[frames ${i + 1}/${selected.length}] ${entry.relPath}`);
    const result = extractVideoFrames(entry, { outDir, intervalSec, frameWidth, force });
    console.log(`  ${result.status}: ${result.frameCount} shots`);
  }
}

writeHtml(path.join(outDir, "index.html"), study, { includeFrames: extractFrames });
console.log(`videos: ${study.videoCount}`);
console.log(`duration: ${study.totalDuration}`);
console.log(`inventory: ${path.join(outDir, "video-inventory.md")}`);
console.log(`html: ${path.join(outDir, "index.html")}`);
if (extractFrames) console.log(`frames: ${path.join(outDir, "frames")}`);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
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

function walk(root) {
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile()) out.push(fullPath);
    }
  }
  return out.sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function ffprobe(file) {
  const res = spawnSync(
    "ffprobe",
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file],
    { encoding: "utf8" },
  );
  if (res.status !== 0) {
    return { error: (res.stderr || res.stdout || "ffprobe failed").trim() };
  }
  try {
    const data = JSON.parse(res.stdout);
    const video = (data.streams ?? []).find((stream) => stream.codec_type === "video");
    const hasAudio = (data.streams ?? []).some((stream) => stream.codec_type === "audio");
    const duration = Number(data.format?.duration ?? video?.duration ?? 0);
    return {
      durationSec: Number.isFinite(duration) ? duration : 0,
      width: video?.width,
      height: video?.height,
      hasAudio,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

function extractVideoFrames(entry, opts) {
  const frameDir = path.join(opts.outDir, "frames", entry.id);
  fs.mkdirSync(frameDir, { recursive: true });
  const metaPath = path.join(frameDir, "meta.json");
  const existing = fs.existsSync(frameDir)
    ? fs.readdirSync(frameDir).filter((name) => /^frame_\d+\.jpg$/i.test(name))
    : [];
  const expected = Math.max(1, Math.ceil(entry.durationSec / opts.intervalSec));
  if (!opts.force && existing.length >= Math.max(1, expected - 1)) {
    return { status: "skip", frameCount: existing.length };
  }
  if (opts.force) {
    for (const name of existing) fs.unlinkSync(path.join(frameDir, name));
  }
  const pattern = path.join(frameDir, "frame_%05d.jpg");
  const vf = `fps=1/${opts.intervalSec},scale=${opts.frameWidth}:-1`;
  const res = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-y", "-i", entry.fullPath, "-vf", vf, "-q:v", "3", pattern],
    { encoding: "utf8" },
  );
  const frames = fs.existsSync(frameDir)
    ? fs.readdirSync(frameDir).filter((name) => /^frame_\d+\.jpg$/i.test(name)).sort()
    : [];
  writeJson(metaPath, {
    video: entry.relPath,
    intervalSec: opts.intervalSec,
    frameWidth: opts.frameWidth,
    extractedAt: new Date().toISOString(),
    frameCount: frames.length,
    error: res.status === 0 ? undefined : (res.stderr || res.stdout || "ffmpeg failed").trim(),
  });
  return { status: res.status === 0 ? "ok" : "error", frameCount: frames.length };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeMarkdown(file, study) {
  const byTutorial = new Map();
  for (const entry of study.videos) {
    const group = byTutorial.get(entry.tutorial) ?? { count: 0, durationSec: 0 };
    group.count++;
    group.durationSec += entry.durationSec;
    byTutorial.set(entry.tutorial, group);
  }
  const lines = [
    "# SpeedTree Tutorial Inventory",
    "",
    `- Source: ${study.sourceDir}`,
    `- Videos: ${study.videoCount}`,
    `- Total duration: ${study.totalDuration}`,
    `- Image assets: ${study.imageAssetCount}`,
    `- SpeedTree source files: ${study.speedTreeSourceCount}`,
    "",
    "## Tutorial Groups",
    "",
    "| Group | Videos | Duration |",
    "|---|---:|---:|",
  ];
  for (const [name, group] of [...byTutorial.entries()].sort((a, b) => a[0].localeCompare(b[0], "zh-CN"))) {
    lines.push(`| ${name} | ${group.count} | ${fmtDuration(group.durationSec)} |`);
  }
  lines.push("", "## Videos", "", "| # | Duration | Size MB | Resolution | File |", "|---:|---:|---:|---|---|");
  for (const entry of study.videos) {
    const sizeMb = (entry.bytes / 1024 / 1024).toFixed(1);
    const res = entry.width && entry.height ? `${entry.width}x${entry.height}` : "";
    lines.push(`| ${entry.index} | ${entry.duration} | ${sizeMb} | ${res} | ${entry.relPath} |`);
  }
  fs.writeFileSync(file, `${lines.join("\n")}\n`);
}

function writeHtml(file, study) {
  const rows = study.videos.map((entry) => {
    const frameDir = path.join(outDir, "frames", entry.id);
    const frames = fs.existsSync(frameDir)
      ? fs.readdirSync(frameDir).filter((name) => /^frame_\d+\.jpg$/i.test(name)).sort()
      : [];
    const imgs = frames.map((name) =>
      `<a href="frames/${entry.id}/${name}"><img loading="lazy" src="frames/${entry.id}/${name}" alt="${escapeHtml(entry.relPath)} ${name}"></a>`,
    ).join("");
    return `<details>
  <summary>${entry.index}. ${escapeHtml(entry.relPath)} <span>${entry.duration}</span> <b>${frames.length} shots</b></summary>
  <div class="shots">${imgs || "<em>No extracted frames yet. Run with --frames.</em>"}</div>
</details>`;
  }).join("\n");
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>SpeedTree Tutorial Study</title>
<style>
body{margin:0;background:#101418;color:#e8eef2;font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
header{position:sticky;top:0;background:#151b21;border-bottom:1px solid #2a343d;padding:14px 20px;z-index:1}
h1{margin:0 0 6px;font-size:20px}
main{padding:18px 20px}
details{border:1px solid #2a343d;border-radius:8px;margin:0 0 10px;background:#141a20}
summary{cursor:pointer;padding:10px 12px}
summary span,summary b{margin-left:12px;color:#9fb3c2}
.shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;padding:0 12px 12px}
img{width:100%;border-radius:4px;border:1px solid #2a343d;background:#0b0f13}
em{color:#9fb3c2}
</style>
</head>
<body>
<header>
<h1>SpeedTree Tutorial Study</h1>
<div>${study.videoCount} videos · ${study.totalDuration} · ${study.imageAssetCount} image assets · ${study.speedTreeSourceCount} .spm files</div>
</header>
<main>${rows}</main>
</body>
</html>
`;
  fs.writeFileSync(file, html);
}

function slug(input) {
  const base = path.basename(input, path.extname(input))
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const hash = createHash("sha1").update(input).digest("hex").slice(0, 8);
  return `${base || "video"}-${hash}`.toLowerCase();
}

function fmtDuration(sec) {
  const total = Math.max(0, Math.round(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
