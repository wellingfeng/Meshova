/**
 * Color analysis (P7) — coarse palette/tone signals. Used two ways: scoring a
 * render's overall color against the reference, and feeding the material
 * micro-tuning step (dominant color, brightness, contrast). We deliberately
 * keep it coarse: the goal is "tone is in the right ballpark", not pixel
 * fidelity.
 */
import { getPixel, luminance, type Raster } from "./raster.js";
import type { Mask } from "./silhouette.js";

/** Mean RGB over foreground pixels (or whole image if no mask). 0..255. */
export function meanColor(img: Raster, mask?: Mask): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (mask && !mask.data[y * mask.width + x]) continue;
      const [pr, pg, pb] = getPixel(img, x, y);
      r += pr;
      g += pg;
      b += pb;
      n++;
    }
  }
  if (n === 0) return [0, 0, 0];
  return [r / n, g / n, b / n];
}

/**
 * A small RGB histogram: each channel quantized to `bins` buckets, normalized
 * to sum 1. Cheap, order-free descriptor of a region's color distribution.
 */
export function colorHistogram(img: Raster, bins = 4, mask?: Mask): Float32Array {
  const hist = new Float32Array(bins * 3);
  const scale = bins / 256;
  let n = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (mask && !mask.data[y * mask.width + x]) continue;
      const [r, g, b] = getPixel(img, x, y);
      hist[Math.min(bins - 1, (r * scale) | 0)]! += 1;
      hist[bins + Math.min(bins - 1, (g * scale) | 0)]! += 1;
      hist[2 * bins + Math.min(bins - 1, (b * scale) | 0)]! += 1;
      n++;
    }
  }
  if (n > 0) for (let i = 0; i < hist.length; i++) hist[i]! /= n;
  return hist;
}

/** L1 distance between two histograms, mapped to a 0..1 similarity. */
export function histogramSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new Error("histogramSimilarity: length mismatch");
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i]! - b[i]!);
  // Each of the 3 channels contributes up to 2 in L1; total max = 6.
  return 1 - Math.min(1, d / 6);
}

/** Mean luminance (0..1) over foreground — overall brightness. */
export function meanLuminance(img: Raster, mask?: Mask): number {
  let sum = 0;
  let n = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (mask && !mask.data[y * mask.width + x]) continue;
      const [r, g, b] = getPixel(img, x, y);
      sum += luminance(r, g, b);
      n++;
    }
  }
  return n === 0 ? 0 : sum / n;
}

/**
 * Luminance standard deviation (0..1) — a rough "busyness" measure used to
 * separate smooth surfaces (low) from grainy/rough ones (high) during material
 * micro-tuning.
 */
export function luminanceStdDev(img: Raster, mask?: Mask): number {
  const mean = meanLuminance(img, mask);
  let acc = 0;
  let n = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (mask && !mask.data[y * mask.width + x]) continue;
      const [r, g, b] = getPixel(img, x, y);
      const d = luminance(r, g, b) - mean;
      acc += d * d;
      n++;
    }
  }
  return n === 0 ? 0 : Math.sqrt(acc / n);
}

/**
 * Saturation-weighted HUE histogram — a lighting-robust color descriptor.
 *
 * Comparing mean RGB (or a brightness histogram) punishes a render for shading
 * the photo doesn't have: a highlight or cast shadow shifts the numbers even
 * when the *material color* is identical. High-quality 3D-gen pipelines avoid
 * this by "delighting" before comparing albedo. We get the same effect cheaply
 * by working in chroma space: bin each foreground pixel by its HUE, weighting
 * by chroma*value so near-gray and very dark pixels (where hue is meaningless
 * and shading lives) barely contribute. One extra bin at the end collects
 * achromatic pixels, so a gray object still matches another gray object.
 *
 * Result length = hueBins + 1, normalized to sum 1 (unless the region is empty).
 */
export function hueHistogram(img: Raster, hueBins = 12, mask?: Mask): Float32Array {
  const hist = new Float32Array(hueBins + 1);
  // Below this chroma a pixel has no meaningful hue → counts as achromatic.
  const achromaThresh = 0.12;
  let total = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (mask && !mask.data[y * mask.width + x]) continue;
      const [r, g, b] = getPixel(img, x, y);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const chroma = max === 0 ? 0 : (max - min) / max; // 0..1 saturation
      const value = max / 255; // 0..1 brightness
      // Weight by chroma*value: gray/dark pixels (shading) barely count, so the
      // descriptor reflects material hue, not the lighting.
      const w = chroma * value;
      if (chroma < achromaThresh) {
        hist[hueBins]! += value; // achromatic bucket, weighted by brightness
        total += value;
        continue;
      }
      // Hue in [0,1): standard max-channel formula.
      let hue: number;
      const d = max - min;
      if (max === r) hue = ((g - b) / d) % 6;
      else if (max === g) hue = (b - r) / d + 2;
      else hue = (r - g) / d + 4;
      hue /= 6;
      if (hue < 0) hue += 1;
      const bin = Math.min(hueBins - 1, (hue * hueBins) | 0);
      hist[bin]! += w;
      total += w;
    }
  }
  if (total > 0) for (let i = 0; i < hist.length; i++) hist[i]! /= total;
  return hist;
}

/**
 * Similarity (0..1) of two hue histograms via histogram intersection. Robust
 * and order-free; 1 means identical hue distributions, 0 means disjoint.
 */
export function hueSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new Error("hueSimilarity: length mismatch");
  let inter = 0;
  for (let i = 0; i < a.length; i++) inter += Math.min(a[i]!, b[i]!);
  return Math.min(1, Math.max(0, inter));
}

/** Saturation estimate (0..1) — chroma over max channel, averaged. */
export function meanSaturation(img: Raster, mask?: Mask): number {
  let sum = 0;
  let n = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (mask && !mask.data[y * mask.width + x]) continue;
      const [r, g, b] = getPixel(img, x, y);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      sum += max === 0 ? 0 : (max - min) / max;
      n++;
    }
  }
  return n === 0 ? 0 : sum / n;
}

