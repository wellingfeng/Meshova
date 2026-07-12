import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve("ref/bilibili-blender-119/frames");
const OUTPUT = resolve("src/models/blender-119-palettes.ts");
const WIDTH = 64;
const HEIGHT = 36;

const pages = Array.from({ length: 119 }, (_, index) => String(index + 1).padStart(3, "0"));

function srgbToLinear(value) {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function rgb(buffer, x, y) {
  const offset = (y * WIDTH + x) * 3;
  return [buffer[offset], buffer[offset + 1], buffer[offset + 2]];
}

function saturation(color) {
  const max = Math.max(...color);
  const min = Math.min(...color);
  return max === 0 ? 0 : (max - min) / max;
}

function luminance(color) {
  return color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
}

function dominant(buffer, predicate, score = () => 1) {
  const bins = new Map();
  for (let y = 1; y < HEIGHT - 2; y++) {
    for (let x = Math.floor(WIDTH * 0.04); x < Math.floor(WIDTH * 0.79); x++) {
      const color = rgb(buffer, x, y);
      if (!predicate(x / WIDTH, y / HEIGHT, color)) continue;
      const key = color.map((channel) => channel >> 4).join(",");
      const entry = bins.get(key) ?? { weight: 0, sum: [0, 0, 0] };
      const weight = score(color);
      entry.weight += weight;
      entry.sum[0] += color[0] * weight;
      entry.sum[1] += color[1] * weight;
      entry.sum[2] += color[2] * weight;
      bins.set(key, entry);
    }
  }
  const best = [...bins.values()].sort((left, right) => right.weight - left.weight)[0];
  if (!best) return [89, 89, 89];
  return best.sum.map((channel) => channel / best.weight);
}

function linear(color) {
  return color.map((channel) => Number(Math.max(0.012, Math.min(0.92, srgbToLinear(channel))).toFixed(4)));
}

function decode(file) {
  return execFileSync("ffmpeg", [
    "-v", "error", "-i", file,
    "-vf", `scale=${WIDTH}:${HEIGHT}:flags=area`,
    "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
  ], { maxBuffer: WIDTH * HEIGHT * 3 + 1024 });
}

function frameScore(buffer) {
  let colorful = 0;
  let contrast = 0;
  let interfaceGray = 0;
  let count = 0;
  let mean = 0;
  let squareMean = 0;
  for (let y = Math.floor(HEIGHT * 0.08); y < Math.floor(HEIGHT * 0.9); y++) {
    for (let x = Math.floor(WIDTH * 0.04); x < Math.floor(WIDTH * 0.79); x++) {
      const color = rgb(buffer, x, y);
      const light = luminance(color);
      colorful += saturation(color);
      if (saturation(color) < 0.12 && light > 28 && light < 145) interfaceGray++;
      mean += light;
      squareMean += light * light;
      count++;
    }
  }
  mean /= count;
  contrast = Math.sqrt(Math.max(0, squareMean / count - mean * mean)) / 64;
  return colorful / count + contrast - interfaceGray / count * 0.72;
}

function extractPalette(buffer) {
  const visible = (color) => luminance(color) > 18 && luminance(color) < 246;
  const sky = dominant(buffer, (_x, y, color) => y < 0.3 && visible(color));
  const ground = dominant(buffer, (_x, y, color) => y > 0.65 && visible(color));
  const structure = dominant(buffer, (_x, y, color) => y > 0.2 && y < 0.76 && visible(color));
  const accent = dominant(
    buffer,
    (_x, y, color) => y > 0.08 && y < 0.9 && visible(color) && saturation(color) > 0.28,
    (color) => 0.3 + saturation(color) ** 2,
  );
  const vegetation = dominant(
    buffer,
    (_x, y, color) => y > 0.2 && y < 0.9 && visible(color) && color[1] > color[0] * 0.88 && color[1] > color[2] * 0.82,
    (color) => 0.4 + Math.max(0, color[1] - Math.max(color[0], color[2])) / 255,
  );
  return { ground: linear(ground), structure: linear(structure), accent: linear(accent), sky: linear(sky), vegetation: linear(vegetation) };
}

const selections = pages.map((page) => {
  const candidates = [1, 3, 6, 25, 50, 75, 94, 97, 99].map((position) => {
    const name = `${page}-${position}.jpg`;
    const buffer = decode(join(ROOT, name));
    return { name, position, buffer, score: frameScore(buffer) };
  });
  return candidates.sort((left, right) => right.score - left.score)[0];
});
const palettes = selections.map((selection) => extractPalette(selection.buffer));
const source = `import type { LowPolyColor } from "../geometry/index.js";\n\n` +
  `export interface Blender119Palette {\n  ground: LowPolyColor;\n  structure: LowPolyColor;\n  accent: LowPolyColor;\n  sky: LowPolyColor;\n  vegetation: LowPolyColor;\n}\n\n` +
  `// Generated from the most visually informative of four keyframes per downloaded video.\n` +
  `export const BLENDER_119_PALETTES: readonly Blender119Palette[] = ${JSON.stringify(palettes, null, 2)};\n\n` +
  `export const BLENDER_119_PALETTE_FRAMES: readonly number[] = ${JSON.stringify(selections.map((selection) => selection.position))};\n`;

await writeFile(OUTPUT, source, "utf8");
console.log(`Wrote ${palettes.length} scene palettes to ${OUTPUT}`);
