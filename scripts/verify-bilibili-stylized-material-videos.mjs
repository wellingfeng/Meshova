import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const referenceDir = path.resolve(process.argv[2] ?? path.join("ref", "bilibili-stylized-materials-38"));
const manifest = JSON.parse(readFileSync(path.join(referenceDir, "index.json"), "utf8"));
const files = readdirSync(referenceDir);
const failures = [];

for (const episode of manifest.episodes) {
  const page = String(episode.index).padStart(2, "0");
  const videoName = files.find((name) => name.startsWith(`${page}-`) && name.endsWith(".mp4"));
  if (!videoName || !existsSync(path.join(referenceDir, videoName))) {
    failures.push(episode.index);
    continue;
  }
  for (const fraction of [0.05, 0.5, 0.95]) {
    const result = spawnSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-xerror",
      "-ss", (episode.duration * fraction).toFixed(3),
      "-i", path.join(referenceDir, videoName),
      "-frames:v", "1",
      "-f", "null", "-",
    ], { stdio: "ignore", shell: false });
    if (result.status !== 0) {
      failures.push(episode.index);
      break;
    }
  }
}

console.log(`已校验 ${manifest.episodes.length} 集，异常 ${failures.length} 集。`);
if (failures.length > 0) {
  console.log(`异常分集：${failures.join(",")}`);
  process.exitCode = 1;
}
