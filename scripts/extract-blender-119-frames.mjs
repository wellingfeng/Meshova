import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const referenceDir = path.resolve(process.argv[2] ?? path.join("ref", "bilibili-blender-119"));
const framesDir = path.join(referenceDir, "frames");
mkdirSync(framesDir, { recursive: true });

const videos = readdirSync(referenceDir)
  .filter((name) => name.toLowerCase().endsWith(".mp4"))
  .sort((left, right) => left.localeCompare(right));
const fractions = [0.01, 0.03, 0.06, 0.25, 0.5, 0.75, 0.94, 0.97, 0.99];
let written = 0;

for (const videoName of videos) {
  const baseName = videoName.slice(0, -4);
  const infoPath = path.join(referenceDir, `${baseName}.info.json`);
  if (!existsSync(infoPath)) continue;
  const info = JSON.parse(readFileSync(infoPath, "utf8"));
  const duration = Number(info.duration);
  if (!Number.isFinite(duration) || duration <= 0) continue;
  const page = String(info.playlist_index ?? baseName.match(/^\d{3}/)?.[0] ?? "000").padStart(3, "0");

  for (const fraction of fractions) {
    const percent = Math.round(fraction * 100);
    const outputPath = path.join(framesDir, `${page}-${percent}.jpg`);
    if (existsSync(outputPath)) continue;
    const result = spawnSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-ss", (duration * fraction).toFixed(3),
      "-i", path.join(referenceDir, videoName),
      "-frames:v", "1",
      "-vf", "scale=960:-2",
      outputPath,
    ], { stdio: "ignore", shell: false });
    if (result.status === 0) written++;
  }
}

console.log(`已扫描 ${videos.length} 个视频，新增 ${written} 张关键帧。`);
