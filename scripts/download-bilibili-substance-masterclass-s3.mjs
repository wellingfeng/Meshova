import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const outputDir = path.resolve(root, "ref", "bilibili-substance-masterclass-s3");
const bundled = path.resolve(root, "_uref", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
const executable = existsSync(bundled) ? bundled : "yt-dlp";
const aria2 = path.resolve(root, "_uref", "aria2", "aria2-1.37.0-win-64bit-build1", process.platform === "win32" ? "aria2c.exe" : "aria2c");
const sourceBvid = "BV1Cb411P7zo";

mkdirSync(outputDir, { recursive: true });

const response = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${sourceBvid}`, {
  headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.bilibili.com/" },
});
if (!response.ok) throw new Error(`Bilibili API 请求失败：${response.status}`);
const payload = await response.json();
if (payload.code !== 0) throw new Error(`Bilibili API 错误：${payload.message ?? payload.code}`);

const pages = (payload.data?.pages ?? []).map((page) => ({
  index: page.page,
  cid: page.cid,
  title: page.part,
  duration: page.duration,
  width: page.dimension?.width ?? 0,
  height: page.dimension?.height ?? 0,
}));

writeFileSync(path.join(outputDir, "index.json"), `${JSON.stringify({
  source: `https://www.bilibili.com/video/${sourceBvid}`,
  bvid: sourceBvid,
  title: payload.data.title,
  uploader: payload.data.owner?.name ?? "",
  fetchedAt: new Date().toISOString(),
  pages,
}, null, 2)}\n`);

let failures = 0;
for (const page of pages) {
  const prefix = `${String(page.index).padStart(2, "0")}-${sanitize(page.title)}`;
  const args = [
    "--continue",
    "--ignore-config",
    "--no-overwrites",
    "--concurrent-fragments", "8",
    ...(existsSync(aria2) ? [
      "--downloader", aria2,
      "--downloader-args", "aria2c:-x16 -s16 -k1M --file-allocation=none",
    ] : []),
    "--write-info-json",
    "--write-thumbnail",
    "--convert-thumbnails", "jpg",
    "-f", "30080+30280/30064+30280/b",
    "--merge-output-format", "mp4",
    "--output", path.join(outputDir, `${prefix}.%(ext)s`),
    `https://www.bilibili.com/video/${sourceBvid}?p=${page.index}`,
  ];
  console.log(`[${page.index}/${pages.length}] ${page.title}`);
  const result = spawnSync(executable, args, { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) failures++;
}

if (failures > 0) throw new Error(`${failures} 个分P下载失败；重跑脚本会断点续传。`);

function sanitize(value) {
  return value.replace(/[<>:"/\\|?*]/g, "-").trim().slice(0, 100);
}
