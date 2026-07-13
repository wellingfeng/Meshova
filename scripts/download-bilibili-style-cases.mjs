import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const bvid = "BV1BtxNzfE8H";
const outputDir = path.resolve("ref", "bilibili-substance-style-cases");
const bundled = path.resolve("_uref", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
const executable = existsSync(bundled) ? bundled : "yt-dlp";
mkdirSync(outputDir, { recursive: true });

const response = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
  headers: { "User-Agent": "Mozilla/5.0" },
});
if (!response.ok) throw new Error(`Bilibili API 请求失败：${response.status}`);
const payload = await response.json();
if (payload.code !== 0) throw new Error(`Bilibili API 错误：${payload.message ?? payload.code}`);
if (payload.data?.pages?.length !== 26) {
  throw new Error(`预期 26P，API 返回 ${payload.data?.pages?.length ?? 0}P；停止下载。`);
}

writeFileSync(path.join(outputDir, "index.json"), `${JSON.stringify({
  source: `https://www.bilibili.com/video/${bvid}`,
  title: payload.data.title,
  uploader: payload.data.owner?.name ?? "",
  fetchedAt: new Date().toISOString(),
  pages: payload.data.pages,
}, null, 2)}\n`);

if (!process.argv.includes("--index-only")) {
  const result = spawnSync(executable, [
    "--continue",
    "--ignore-config",
    "--no-overwrites",
    "--write-info-json",
    "--write-thumbnail",
    "--convert-thumbnails", "jpg",
    "-f", "bv*[height<=720][vcodec^=avc]+ba/b[height<=720]/b",
    "--merge-output-format", "mp4",
    "--output", path.join(outputDir, "%(playlist_index)02d-%(title)s.%(ext)s"),
    `https://www.bilibili.com/video/${bvid}/`,
  ], { stdio: "inherit", shell: false });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}
