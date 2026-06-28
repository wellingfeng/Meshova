import { clamp, lerp, smoothstep } from "../math/scalar.js";
import {
  makeField2D,
  mapField2D,
  sampleField2D,
  type Field2D,
} from "./buffer.js";

export function clampField2D(field: Field2D, lo = 0, hi = 1): Field2D {
  return mapField2D(field, (v) => clamp(v, lo, hi));
}

export function invertField2D(field: Field2D): Field2D {
  return mapField2D(field, (v) => 1 - v);
}

export function thresholdField2D(field: Field2D, threshold = 0.5): Field2D {
  return mapField2D(field, (v) => (v >= threshold ? 1 : 0));
}

/**
 * Smooth remap into [0,1]. Useful for turning raw weights into art-directable
 * soft selections before driving bevel/extrude/scatter/material.
 */
export function softClipField2D(field: Field2D, lo = 0, hi = 1): Field2D {
  const span = hi - lo || 1e-6;
  return mapField2D(field, (v) => {
    const t = clamp((v - lo) / span, 0, 1);
    return smoothstep(0, 1, t);
  });
}

export function curveField2D(field: Field2D, points: Array<[number, number]>): Field2D {
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  if (pts.length === 0 || pts[0]![0] > 0) pts.unshift([0, 0]);
  if (pts[pts.length - 1]![0] < 1) pts.push([1, 1]);
  return mapField2D(field, (v) => {
    const x = clamp(v, 0, 1);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      if (x >= a[0] && x <= b[0]) {
        const t = (x - a[0]) / (b[0] - a[0] || 1e-6);
        return clamp(lerp(a[1], b[1], t), 0, 1);
      }
    }
    return clamp(pts[pts.length - 1]![1], 0, 1);
  });
}

export interface DistanceField2DOptions {
  /** Max search distance in pixels; also normalization range. */
  maxDistance?: number;
  /** Source threshold. Source pixels output 1, then fade to 0. */
  threshold?: number;
  /** Measure distance to non-source pixels instead. */
  inside?: boolean;
}

/**
 * Chamfer distance transform. Output 1 at source, 0 past maxDistance.
 * Source = mask > threshold unless inside=true.
 */
export function distanceField2D(mask: Field2D, options: DistanceField2DOptions = {}): Field2D {
  const maxD = Math.max(1, options.maxDistance ?? 32);
  const threshold = options.threshold ?? 0.5;
  const inside = options.inside ?? false;
  const w = mask.width;
  const h = mask.height;
  const INF = 1e9;
  const dist = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let source = sampleField2D(mask, x, y) > threshold;
      if (inside) source = !source;
      dist[y * w + x] = source ? 0 : INF;
    }
  }

  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? INF : dist[y * w + x]!;
  const D1 = 1;
  const D2 = 1.41421356;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let d = dist[y * w + x]!;
      d = Math.min(d, at(x - 1, y) + D1, at(x, y - 1) + D1);
      d = Math.min(d, at(x - 1, y - 1) + D2, at(x + 1, y - 1) + D2);
      dist[y * w + x] = d;
    }
  }

  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      let d = dist[y * w + x]!;
      d = Math.min(d, at(x + 1, y) + D1, at(x, y + 1) + D1);
      d = Math.min(d, at(x + 1, y + 1) + D2, at(x - 1, y + 1) + D2);
      dist[y * w + x] = d;
    }
  }

  const out = makeField2D(w, h);
  for (let i = 0; i < dist.length; i++) out.data[i] = clamp(1 - dist[i]! / maxD, 0, 1);
  return out;
}
