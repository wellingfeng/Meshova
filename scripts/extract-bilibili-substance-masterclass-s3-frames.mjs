import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const referenceDir = path.resolve(root, "ref", "bilibili-substance-masterclass-s3");
const frameDir = path.join(referenceDir, "frames");
const sheetDir = path.join(referenceDir, "contact-sheets");
const manifest = JSON.parse(readFileSync(path.join(referenceDir, "index.json"), "utf8"));
const files = readdirSync(referenceDir);
const pagesArgIndex = process.argv.indexOf("--pages");
const selectedPages = pagesArgIndex >= 0
  ? new Set(process.argv[pagesArgIndex + 1].split(",").map(Number))
  : undefined;

mkdirSync(frameDir, { recursive: true });
mkdirSync(sheetDir, { recursive: true });

for (const page of manifest.pages.filter((item) => !selectedPages || selectedPages.has(item.index))) {
  const pageId = String(page.index).padStart(2, "0");
  const videoName = files.find((name) => name.startsWith(`${pageId}-`) && name.endsWith(".mp4"));
  if (!videoName) throw new Error(`找不到第 ${page.index} 个分P的视频。`);

  const videoPath = path.join(referenceDir, videoName);
  const pageFrameDir = path.join(frameDir, pageId);
  mkdirSync(pageFrameDir, { recursive: true });

  const interval = Math.min(480, Math.max(60, Math.floor(page.duration / 24)));
  const timestamps = [];
  for (let timestamp = Math.min(10, page.duration * 0.01); timestamp < page.duration - 3; timestamp += interval) {
    timestamps.push(timestamp);
  }
  timestamps.forEach((timestamp, index) => {
    runFfmpeg([
      "-hide_banner", "-loglevel", "error", "-y",
      "-ss", timestamp.toFixed(3),
      "-i", videoPath,
      "-frames:v", "1",
      "-vf", "scale=640:-2",
      "-q:v", "3",
      path.join(pageFrameDir, `${pageId}-${String(index + 1).padStart(4, "0")}.jpg`),
    ]);
  });

  for (let offset = 0; offset < timestamps.length; offset += 25) {
    const count = Math.min(25, timestamps.length - offset);
    const padding = 25 - count;
    runFfmpeg([
      "-hide_banner", "-loglevel", "error", "-y",
      "-framerate", "1",
      "-start_number", String(offset + 1),
      "-i", path.join(pageFrameDir, `${pageId}-%04d.jpg`),
      "-vf", `trim=end_frame=${count},scale=480:-2,tpad=stop_mode=clone:stop_duration=${padding},tile=5x5:padding=4:margin=4`,
      "-frames:v", "1",
      "-q:v", "3",
      path.join(sheetDir, `${pageId}-sheet-${String(offset / 25 + 1).padStart(2, "0")}.jpg`),
    ]);
  }
  console.log(`[${page.index}/${manifest.pages.length}] ${page.title}：${timestamps.length} 帧，每 ${interval} 秒取样`);
}

function runFfmpeg(args) {
  const result = spawnSync("ffmpeg", args, { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ffmpeg 失败，退出码 ${result.status}`);
}
