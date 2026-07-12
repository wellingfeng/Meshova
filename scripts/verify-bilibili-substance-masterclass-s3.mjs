import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const referenceDir = path.resolve("ref", "bilibili-substance-masterclass-s3");
const manifest = JSON.parse(readFileSync(path.join(referenceDir, "index.json"), "utf8"));
const files = readdirSync(referenceDir);
const failures = [];

for (const page of manifest.pages) {
  const pageId = String(page.index).padStart(2, "0");
  const videoName = files.find((name) => name.startsWith(`${pageId}-`) && name.endsWith(".mp4"));
  if (!videoName || !existsSync(path.join(referenceDir, videoName))) {
    failures.push(`${page.index}:缺文件`);
    continue;
  }
  for (const fraction of [0.02, 0.25, 0.5, 0.75, 0.98]) {
    const result = spawnSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-xerror",
      "-ss", (page.duration * fraction).toFixed(3),
      "-i", path.join(referenceDir, videoName),
      "-frames:v", "1", "-f", "null", "-",
    ], { stdio: "ignore", shell: false });
    if (result.status !== 0) {
      failures.push(`${page.index}:${Math.round(fraction * 100)}%`);
      break;
    }
  }
}

console.log(`已校验 ${manifest.pages.length} 个分P，异常 ${failures.length} 个。`);
if (failures.length > 0) {
  console.log(`异常：${failures.join(", ")}`);
  process.exitCode = 1;
}
