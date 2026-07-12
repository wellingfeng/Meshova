import { clamp, smoothstep } from "../math/scalar.js";
import { generate, type TextureBuffer } from "./buffer.js";

/** Signed distance in a centered 2D domain. Negative values are inside. */
export type Sdf2 = (x: number, y: number) => number;

export interface SdfRasterOptions {
  /** Centered domain half extent. Default 1 maps UV to [-1, 1]. */
  extent?: number;
  /** Antialiasing width in SDF domain units. Default derives from resolution. */
  softness?: number;
  invert?: boolean;
}

export interface SdfTransformOptions {
  translate?: [number, number];
  rotation?: number;
  scale?: number | [number, number];
}

export function sdfCircle(radius = 0.5): Sdf2 {
  const safeRadius = Math.max(0, radius);
  return (x, y) => Math.hypot(x, y) - safeRadius;
}

export function sdfRoundedBox(
  halfWidth = 0.5,
  halfHeight = 0.5,
  radius = 0,
): Sdf2 {
  const hx = Math.max(0, halfWidth);
  const hy = Math.max(0, halfHeight);
  const r = clamp(radius, 0, Math.min(hx, hy));
  return (x, y) => {
    const qx = Math.abs(x) - hx + r;
    const qy = Math.abs(y) - hy + r;
    const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
    return outside + Math.min(Math.max(qx, qy), 0) - r;
  };
}

export function sdfRegularPolygon(
  sides: number,
  radius = 0.5,
  rotation = 0,
): Sdf2 {
  const count = Math.max(3, Math.floor(sides));
  const vertices: Array<[number, number]> = [];
  for (let index = 0; index < count; index++) {
    const angle = rotation + index * Math.PI * 2 / count;
    vertices.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  return (x, y) => {
    let inside = false;
    let distanceSq = Infinity;
    for (let index = 0; index < count; index++) {
      const first = vertices[index]!;
      const second = vertices[(index + 1) % count]!;
      const edgeX = second[0] - first[0];
      const edgeY = second[1] - first[1];
      const pointX = x - first[0];
      const pointY = y - first[1];
      const amount = clamp(
        (pointX * edgeX + pointY * edgeY) / Math.max(1e-12, edgeX * edgeX + edgeY * edgeY),
        0,
        1,
      );
      const dx = pointX - edgeX * amount;
      const dy = pointY - edgeY * amount;
      distanceSq = Math.min(distanceSq, dx * dx + dy * dy);
      if ((first[1] > y) !== (second[1] > y)) {
        const crossing = (second[0] - first[0]) * (y - first[1]) /
          (second[1] - first[1]) + first[0];
        if (x < crossing) inside = !inside;
      }
    }
    return Math.sqrt(distanceSq) * (inside ? -1 : 1);
  };
}

export function sdf2Union(first: Sdf2, second: Sdf2): Sdf2 {
  return (x, y) => Math.min(first(x, y), second(x, y));
}

export function sdf2Intersection(first: Sdf2, second: Sdf2): Sdf2 {
  return (x, y) => Math.max(first(x, y), second(x, y));
}

export function sdf2Subtract(base: Sdf2, cutter: Sdf2): Sdf2 {
  return (x, y) => Math.max(base(x, y), -cutter(x, y));
}

export function sdf2SmoothUnion(first: Sdf2, second: Sdf2, radius = 0.1): Sdf2 {
  const k = Math.max(1e-6, radius);
  return (x, y) => {
    const a = first(x, y);
    const b = second(x, y);
    const blend = clamp(0.5 + 0.5 * (b - a) / k, 0, 1);
    return b + (a - b) * blend - k * blend * (1 - blend);
  };
}

/** Positive amount expands a shape. */
export function sdfDilate(source: Sdf2, amount: number): Sdf2 {
  return (x, y) => source(x, y) - amount;
}

/** Positive amount contracts a shape. */
export function sdfErode(source: Sdf2, amount: number): Sdf2 {
  return (x, y) => source(x, y) + amount;
}

export function sdfOutline(source: Sdf2, width: number): Sdf2 {
  const halfWidth = Math.max(0, width) * 0.5;
  return (x, y) => Math.abs(source(x, y)) - halfWidth;
}

export function sdfTransform(source: Sdf2, options: SdfTransformOptions = {}): Sdf2 {
  const translate = options.translate ?? [0, 0];
  const rawScale = options.scale ?? 1;
  const scale: [number, number] = typeof rawScale === "number" ? [rawScale, rawScale] : rawScale;
  const sx = Math.max(1e-6, Math.abs(scale[0]));
  const sy = Math.max(1e-6, Math.abs(scale[1]));
  const cosine = Math.cos(-(options.rotation ?? 0));
  const sine = Math.sin(-(options.rotation ?? 0));
  return (x, y) => {
    const px = x - translate[0];
    const py = y - translate[1];
    const localX = (px * cosine - py * sine) / sx;
    const localY = (px * sine + py * cosine) / sy;
    return source(localX, localY) * Math.min(sx, sy);
  };
}

export function rasterizeSdf(
  width: number,
  height: number,
  source: Sdf2,
  options: SdfRasterOptions = {},
): TextureBuffer {
  const extent = Math.max(1e-6, options.extent ?? 1);
  const softness = Math.max(1e-6, options.softness ?? extent * 2 / Math.min(width, height));
  return generate(width, height, 1, (u, v) => {
    const distance = source((u - 0.5) * extent * 2, (v - 0.5) * extent * 2);
    const mask = 1 - smoothstep(-softness, softness, distance);
    return options.invert ? 1 - mask : mask;
  });
}
