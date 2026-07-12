import type { Vec3 } from "../math/vec3.js";
import { add, distance, scale } from "../math/vec3.js";
import { polyline, resampleCurve, smoothCurve, type Curve } from "./curve.js";
import type { ClimbSurface } from "./vine.js";

export interface SurfaceStrokePoint {
  readonly position: Vec3;
  readonly normal: Vec3;
}

export interface SurfaceStroke {
  readonly points: ReadonlyArray<SurfaceStrokePoint>;
}

export interface SurfaceSketchOptions {
  spacing?: number;
  smoothing?: number;
  offset?: number;
  minimumDistance?: number;
}

export function projectSurfaceStroke(
  samples: ReadonlyArray<Vec3>,
  surface: ClimbSurface,
  options: SurfaceSketchOptions = {},
): SurfaceStroke {
  if (samples.length < 2) throw new Error("surface stroke requires at least two samples");
  const minimumDistance = Math.max(0, options.minimumDistance ?? 0.02);
  const offset = options.offset ?? 0.015;
  const filtered: Vec3[] = [];
  for (const sample of samples) {
    if (filtered.length === 0 || distance(filtered[filtered.length - 1]!, sample) >= minimumDistance) {
      filtered.push(sample);
    }
  }
  if (filtered.length < 2) filtered.push(samples[samples.length - 1]!);
  let curve = polyline(filtered);
  const spacing = Math.max(1e-4, options.spacing ?? 0.12);
  curve = resampleCurve(curve, { segmentLength: spacing });
  const smoothing = Math.max(0, Math.round(options.smoothing ?? 2));
  if (smoothing > 0) curve = smoothCurve(curve, smoothing);
  return {
    points: curve.points.map((sample) => {
      const projected = surface.project(sample);
      return {
        position: add(projected.point, scale(projected.normal, offset)),
        normal: projected.normal,
      };
    }),
  };
}

export function surfaceStrokeCurve(stroke: SurfaceStroke): Curve {
  return polyline(stroke.points.map((point) => point.position));
}
