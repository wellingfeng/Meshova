import { clamp } from "../math/scalar.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { sdfBox, type SDF3D } from "./sdf.js";
import { makeField2D, sampleField2DUV, type Field2D } from "./buffer.js";

export interface RasterFieldSource {
  readonly width: number;
  readonly height: number;
  readonly data: ArrayLike<number>;
}

export type RasterFieldChannel = "luminance" | "red" | "green" | "blue" | "alpha";

export interface RasterToField2DOptions {
  readonly channel?: RasterFieldChannel;
  readonly invert?: boolean;
  readonly gamma?: number;
  readonly multiplyAlpha?: boolean;
}

/** Convert RGBA8 pixels to neutral Field2D data without baking an output texture. */
export function rasterToField2D(source: RasterFieldSource, options: RasterToField2DOptions = {}): Field2D {
  const width = Math.max(1, Math.floor(source.width));
  const height = Math.max(1, Math.floor(source.height));
  if (source.data.length < width * height * 4) throw new Error("Raster RGBA data is shorter than width*height*4");
  const channel = options.channel ?? "luminance";
  const gamma = Math.max(1e-6, options.gamma ?? 1);
  const field = makeField2D(width, height);
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    const red = Number(source.data[offset]!) / 255;
    const green = Number(source.data[offset + 1]!) / 255;
    const blue = Number(source.data[offset + 2]!) / 255;
    const alpha = Number(source.data[offset + 3]!) / 255;
    let value = channel === "red" ? red
      : channel === "green" ? green
        : channel === "blue" ? blue
          : channel === "alpha" ? alpha
            : red * 0.2126 + green * 0.7152 + blue * 0.0722;
    if (options.multiplyAlpha && channel !== "alpha") value *= alpha;
    if (options.invert) value = 1 - value;
    field.data[i] = clamp(value, 0, 1) ** gamma;
  }
  return field;
}

export interface Field2DExtrudeSDFOptions {
  readonly width?: number;
  readonly depth?: number;
  readonly height?: number;
  readonly threshold?: number;
  /** Approximate world distance represented by full 0..1 field range. */
  readonly edgeScale?: number;
  readonly center?: Vec3;
}

/** Turn a thresholded image/Field2D mask into a polygonizable 3D extrusion. */
export function field2DExtrudeSDF(field: Field2D, options: Field2DExtrudeSDFOptions = {}): SDF3D {
  const width = Math.max(1e-6, options.width ?? 2);
  const depth = Math.max(1e-6, options.depth ?? 2);
  const height = Math.max(1e-6, options.height ?? 0.25);
  const threshold = clamp(options.threshold ?? 0.5, 0, 1);
  const edgeScale = Math.max(1e-6, options.edgeScale ?? Math.min(width / field.width, depth / field.height) * 2);
  const center = options.center ?? vec3();
  const domain = sdfBox(vec3(width, height, depth), center);
  return (point) => {
    const u = (point.x - center.x) / width + 0.5;
    const v = (point.z - center.z) / depth + 0.5;
    const maskDistance = (threshold - sampleField2DUV(field, u, v)) * edgeScale;
    return Math.max(maskDistance, domain(point));
  };
}
