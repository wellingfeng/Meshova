import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const referenceDir = path.resolve(process.argv[2] ?? path.join("ref", "bilibili-blender-119"));
const infoFiles = readdirSync(referenceDir)
  .filter((name) => /^\d{3}-.*\.info\.json$/i.test(name) && !name.startsWith("000-"))
  .sort((left, right) => left.localeCompare(right));
const failures = [];

for (const infoName of infoFiles) {
  const baseName = infoName.slice(0, -10);
  const videoPath = path.join(referenceDir, `${baseName}.mp4`);
  const info = JSON.parse(readFileSync(path.join(referenceDir, infoName), "utf8"));
  const duration = Number(info.duration);
  const page = Number(info.playlist_index ?? baseName.slice(0, 3));
  if (!existsSync(videoPath) || !Number.isFinite(duration) || duration <= 0) {
    failures.push(page);
    continue;
  }

  for (const fraction of [0.1, 0.5, 0.9]) {
    const result = spawnSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-xerror",
      "-ss", (duration * fraction).toFixed(3),
      "-i", videoPath,
      "-frames:v", "1",
      "-f", "null", "-",
    ], { stdio: "ignore", shell: false });
    if (result.status !== 0) {
      failures.push(page);
      break;
    }
  }
}

const uniqueFailures = [...new Set(failures)].sort((left, right) => left - right);
console.log(`已校验 ${infoFiles.length} 个视频，异常 ${uniqueFailures.length} 个。`);
if (uniqueFailures.length > 0) {
  console.log(`异常分集：${uniqueFailures.join(",")}`);
  process.exitCode = 1;
}
