/**
 * 2D circle packing helpers for Grasshopper-style "Packed Circle" recipes.
 * Deterministic relaxation: seeded init, overlap pushes, clamped bounds.
 */
import type { Vec2 } from "../math/vec2.js";
import { vec2 } from "../math/vec2.js";
import { clamp, TAU } from "../math/scalar.js";
import { makeRng } from "../random/index.js";

export interface PackedCircle2D {
  readonly id: number;
  readonly center: Vec2;
  readonly radius: number;
}

export interface PackCircles2DOptions {
  readonly count: number;
  readonly width?: number;
  readonly height?: number;
  readonly minRadius?: number;
  readonly maxRadius?: number;
  readonly padding?: number;
  readonly iterations?: number;
  readonly seed?: number;
}

export interface CirclePackingStats {
  readonly overlapCount: number;
  readonly maxOverlap: number;
  readonly minGap: number;
}

interface MutableCircle {
  id: number;
  x: number;
  y: number;
  radius: number;
}

export function packCircles2D(options: PackCircles2DOptions): PackedCircle2D[] {
  const count = Math.max(0, Math.round(options.count));
  const width = Math.max(1e-4, options.width ?? 1);
  const height = Math.max(1e-4, options.height ?? width);
  const minRadius = Math.max(1e-5, options.minRadius ?? Math.min(width, height) * 0.035);
  const maxRadius = Math.max(minRadius, options.maxRadius ?? minRadius * 2);
  const padding = Math.max(0, options.padding ?? 0);
  const iterations = Math.max(0, Math.round(options.iterations ?? 80));
  const seed = Math.round(options.seed ?? 1) >>> 0;
  const rng = makeRng(seed);
  const circles: MutableCircle[] = [];
  const halfW = width * 0.5;
  const halfH = height * 0.5;

  for (let i = 0; i < count; i++) {
    const radius = rng.range(minRadius, maxRadius);
    circles.push({
      id: i,
      x: rng.range(-halfW + radius, halfW - radius),
      y: rng.range(-halfH + radius, halfH - radius),
      radius,
    });
  }

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        const a = circles[i]!;
        const b = circles[j]!;
        const target = a.radius + b.radius + padding;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= target) continue;
        if (d < 1e-8) {
          const angle = pseudoAngle(i, j, seed);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          d = 1;
        }
        const push = (target - d) * 0.5;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
    for (const c of circles) clampCircleToRect(c, halfW, halfH);
  }

  return circles.map((c) => ({
    id: c.id,
    center: vec2(c.x, c.y),
    radius: c.radius,
  }));
}

export function circlePackingStats(
  circles: readonly PackedCircle2D[],
  padding = 0,
): CirclePackingStats {
  let overlapCount = 0;
  let maxOverlap = 0;
  let minGap = Infinity;
  for (let i = 0; i < circles.length; i++) {
    for (let j = i + 1; j < circles.length; j++) {
      const a = circles[i]!;
      const b = circles[j]!;
      const gap = Math.hypot(b.center.x - a.center.x, b.center.y - a.center.y) -
        (a.radius + b.radius + padding);
      if (gap < 0) {
        overlapCount++;
        maxOverlap = Math.max(maxOverlap, -gap);
      }
      minGap = Math.min(minGap, gap);
    }
  }
  return {
    overlapCount,
    maxOverlap,
    minGap: Number.isFinite(minGap) ? minGap : 0,
  };
}

function clampCircleToRect(c: MutableCircle, halfW: number, halfH: number): void {
  c.x = clamp(c.x, -halfW + c.radius, halfW - c.radius);
  c.y = clamp(c.y, -halfH + c.radius, halfH - c.radius);
}

function pseudoAngle(i: number, j: number, seed: number): number {
  const h = Math.sin((i + 1) * 127.1 + (j + 1) * 311.7 + seed * 0.013) * 43758.5453;
  return (h - Math.floor(h)) * TAU;
}
