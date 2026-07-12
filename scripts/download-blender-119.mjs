import { existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const outputDir = path.resolve(root, "ref", "bilibili-blender-119");
const bundled = path.resolve(root, "_uref", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
const executable = existsSync(bundled) ? bundled : "yt-dlp";
const itemsIndex = process.argv.indexOf("--items");
const playlistItems = itemsIndex >= 0 ? process.argv[itemsIndex + 1] : undefined;
mkdirSync(outputDir, { recursive: true });

const args = [
  "--yes-playlist",
  "--continue",
  "--ignore-errors",
  "--no-overwrites",
  "--write-info-json",
  "--write-thumbnail",
  "--convert-thumbnails", "jpg",
  "-f", "bv*[height<=480]+ba/b[height<=480]/b",
  "--merge-output-format", "mp4",
  "--output", path.join(outputDir, "%(playlist_index)03d-%(title).160B.%(ext)s"),
  "https://www.bilibili.com/video/BV1nx421972j",
];
if (playlistItems) args.splice(1, 0, "--playlist-items", playlistItems);

const result = spawnSync(executable, args, { stdio: "inherit", shell: false });

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
