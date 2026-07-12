import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const outputDir = path.resolve(root, "ref", "bilibili-stylized-materials-38");
const bundled = path.resolve(root, "_uref", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
const executable = existsSync(bundled) ? bundled : "yt-dlp";
const sourceBvid = "BV1prdhYrECB";
const itemsIndex = process.argv.indexOf("--items");
const selectedItems = itemsIndex >= 0 ? parseItems(process.argv[itemsIndex + 1]) : undefined;

mkdirSync(outputDir, { recursive: true });

const response = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${sourceBvid}`, {
  headers: { "User-Agent": "Mozilla/5.0" },
});
if (!response.ok) throw new Error(`Bilibili API 请求失败：${response.status}`);
const payload = await response.json();
if (payload.code !== 0) throw new Error(`Bilibili API 错误：${payload.message ?? payload.code}`);

const season = payload.data?.ugc_season;
const episodes = (season?.sections ?? [])
  .flatMap((section) => section.episodes ?? [])
  .map((episode, offset) => ({
    index: offset + 1,
    bvid: episode.bvid,
    cid: episode.cid,
    title: episode.title,
    duration: episode.arc?.duration ?? episode.page?.duration ?? 0,
    thumbnail: episode.arc?.pic ?? "",
  }));

if (episodes.length !== 38) {
  throw new Error(`预期 38 集，API 返回 ${episodes.length} 集；停止，避免抓错合集。`);
}

writeFileSync(path.join(outputDir, "index.json"), `${JSON.stringify({
  source: `https://www.bilibili.com/video/${sourceBvid}`,
  seasonId: season.id,
  title: season.title,
  uploader: payload.data.owner?.name ?? "",
  fetchedAt: new Date().toISOString(),
  episodes,
}, null, 2)}\n`);

let failures = 0;
for (const episode of episodes) {
  if (selectedItems && !selectedItems.has(episode.index)) continue;
  const prefix = `${String(episode.index).padStart(2, "0")}-${sanitize(episode.title)}`;
  const args = [
    "--continue",
    "--ignore-config",
    "--no-overwrites",
    "--write-info-json",
    "--write-thumbnail",
    "--convert-thumbnails", "jpg",
    "--write-subs",
    "--write-auto-subs",
    "--sub-langs", "zh-CN,zh-Hans,zh",
    "-f", "bv*[height<=720][vcodec^=avc]+ba/b[height<=720]/b",
    "--merge-output-format", "mp4",
    "--output", path.join(outputDir, `${prefix}.%(ext)s`),
    `https://www.bilibili.com/video/${episode.bvid}`,
  ];
  console.log(`[${episode.index}/38] ${episode.title}`);
  const result = spawnSync(executable, args, { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) failures++;
}

if (failures > 0) {
  throw new Error(`${failures} 集下载失败；重跑脚本会断点续传。`);
}

function sanitize(value) {
  return value
    .replace(/^SD(?:-SubstanceDesigner)?\s*/i, "")
    .replace(/-SubstanceDesigner$/i, "")
    .replace(/[<>:"/\\|?*]/g, "-")
    .trim()
    .slice(0, 100);
}

function parseItems(value) {
  if (!value) throw new Error("--items 需要集数，例如 1-5,8,12。 ");
  const items = new Set();
  for (const token of value.split(",")) {
    const match = token.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!match) throw new Error(`无效集数范围：${token}`);
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    for (let item = start; item <= end; item++) items.add(item);
  }
  return items;
}
