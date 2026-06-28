import { clamp } from "../math/scalar.js";
import {
  assertSameField2D,
  makeField2D,
  sampleField2D,
  type Field2D,
} from "./buffer.js";

export type Field2DCombineMode =
  | "copy"
  | "add"
  | "subtract"
  | "multiply"
  | "screen"
  | "min"
  | "max"
  | "difference"
  | "overlay"
  | "power";

export interface CombineField2DOptions {
  mode?: Field2DCombineMode;
  /** Foreground opacity in [0,1]. */
  opacity?: number;
  /** Optional per-pixel mask gating the foreground. */
  mask?: Field2D;
  /** Clamp result to [0,1]. Default false so numeric fields keep range. */
  clampOutput?: boolean;
}

function blendOp(mode: Field2DCombineMode, fg: number, bg: number): number {
  switch (mode) {
    case "add": return bg + fg;
    case "subtract": return bg - fg;
    case "multiply": return bg * fg;
    case "screen": return 1 - (1 - bg) * (1 - fg);
    case "min": return Math.min(bg, fg);
    case "max": return Math.max(bg, fg);
    case "difference": return Math.abs(bg - fg);
    case "overlay": return bg < 0.5 ? 2 * bg * fg : 1 - 2 * (1 - bg) * (1 - fg);
    case "power": return Math.pow(Math.max(bg, 0), fg);
    case "copy":
    default: return fg;
  }
}

/** Blend foreground over background. Mask/opacity affect only foreground. */
export function combineField2D(
  foreground: Field2D,
  background: Field2D,
  options: CombineField2DOptions = {},
): Field2D {
  assertSameField2D(foreground, background);
  if (options.mask) assertSameField2D(foreground, options.mask);
  const mode = options.mode ?? "copy";
  const opacity = clamp(options.opacity ?? 1, 0, 1);
  const out = makeField2D(background.width, background.height);
  for (let y = 0; y < background.height; y++) {
    for (let x = 0; x < background.width; x++) {
      const i = y * background.width + x;
      const fg = foreground.data[i]!;
      const bg = background.data[i]!;
      const mask = options.mask ? sampleField2D(options.mask, x, y) : 1;
      const a = clamp(opacity * mask, 0, 1);
      const blended = blendOp(mode, fg, bg);
      const v = bg + (blended - bg) * a;
      out.data[i] = options.clampOutput ? clamp(v, 0, 1) : v;
    }
  }
  return out;
}

/** Insert/stamp one field into another through a mask. */
export function insertField2D(
  base: Field2D,
  insert: Field2D,
  mask: Field2D,
  opacity = 1,
): Field2D {
  return combineField2D(insert, base, { mode: "copy", mask, opacity });
}
