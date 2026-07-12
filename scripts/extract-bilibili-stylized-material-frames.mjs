import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const referenceDir = path.resolve(process.argv[2] ?? path.join("ref", "bilibili-stylized-materials-38"));
const framesDir = path.join(referenceDir, "frames");
const manifest = JSON.parse(readFileSync(path.join(referenceDir, "index.json"), "utf8"));
const files = readdirSync(referenceDir);
const fractions = [0.02, 0.06, 0.12, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.96, 0.99];
mkdirSync(framesDir, { recursive: true });

let written = 0;
let missing = 0;
const failures = [];
for (const episode of manifest.episodes) {
  const page = String(episode.index).padStart(2, "0");
  const videoName = files.find((name) => name.startsWith(`${page}-`) && name.endsWith(".mp4"));
  const videoPath = videoName ? path.join(referenceDir, videoName) : undefined;
  if (!videoPath) {
    missing++;
    continue;
  }
  const duration = probeDuration(videoPath);

  for (const fraction of fractions) {
    const percent = Math.round(fraction * 100);
    const outputPath = path.join(framesDir, `${page}-${String(percent).padStart(2, "0")}.jpg`);
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
    if (result.status === 0) written++;
    else failures.push(`${page}-${String(percent).padStart(2, "0")}`);
  }
}

console.log(`已扫描 ${manifest.episodes.length} 集，新增 ${written} 张关键帧，缺视频 ${missing} 集，失败帧 ${failures.length} 张。`);
if (failures.length > 0) console.log(`失败帧：${failures.join(",")}`);
if (missing > 0 || failures.length > 0) process.exitCode = 1;

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
