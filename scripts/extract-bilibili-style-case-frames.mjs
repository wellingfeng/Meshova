import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const referenceDir = path.resolve(process.argv[2] ?? path.join("ref", "bilibili-substance-style-cases"));
const framesDir = path.join(referenceDir, "frames");
const videos = readdirSync(referenceDir)
  .filter((name) => /^\d{2}-.*\.mp4$/i.test(name) && !/\.f\d+\.mp4$/i.test(name))
  .sort();
const fractions = [0.02, 0.08, 0.16, 0.28, 0.4, 0.52, 0.64, 0.76, 0.88, 0.96];
mkdirSync(framesDir, { recursive: true });

let written = 0;
for (const videoName of videos) {
  const page = videoName.slice(0, 2);
  const videoPath = path.join(referenceDir, videoName);
  const duration = probeDuration(videoPath);
  for (const fraction of fractions) {
    const percent = String(Math.round(fraction * 100)).padStart(2, "0");
    const outputPath = path.join(framesDir, `${page}-${percent}.jpg`);
    if (existsSync(outputPath)) continue;
    const result = spawnSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-ss", Math.min(duration * fraction, duration - 0.25).toFixed(3),
      "-i", videoPath,
      "-frames:v", "1",
      "-vf", "scale=1280:-2",
      "-q:v", "2",
      outputPath,
    ], { stdio: "ignore", shell: false });
    if (result.status !== 0) throw new Error(`抽帧失败：${page}-${percent}`);
    written++;
  }
}

console.log(`已扫描 ${videos.length}P，新增 ${written} 张关键帧。`);

function probeDuration(videoPath) {
  const result = spawnSync("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    videoPath,
  ], { encoding: "utf8", shell: false });
  const duration = Number(result.stdout.trim());
  if (result.status !== 0 || !Number.isFinite(duration) || duration <= 0.25) {
    throw new Error(`无法读取视频时长：${videoPath}`);
  }
  return duration;
}

