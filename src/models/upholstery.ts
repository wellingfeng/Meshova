/** Shared procedural upholstery primitives for sofas, chairs, and ottomans. */
import { recomputeNormals, type Mesh } from "../geometry/index.js";
import { roundedBox } from "../geometry/shapes.js";
import { transform } from "../geometry/transform.js";
import { vec2, type Vec2 } from "../math/vec2.js";
import { vec3, type Vec3 } from "../math/vec3.js";

export interface TuftedPadOptions {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly columns: number;
  readonly rows?: number;
  readonly seamDepth?: number;
  readonly wrinkleStrength?: number;
  readonly segmentsPerCell?: number;
}

export function upholsteredPanel(
  width: number,
  height: number,
  depth: number,
  radius: number,
  steps = 4,
): Mesh {
  return roundedBox({ width, height, depth, radius, steps });
}

export function looseUpholsteredCushion(
  width: number,
  height: number,
  depth: number,
  radius: number,
): Mesh {
  const mesh = upholsteredPanel(width, height, depth, radius, 5);
  const positions = mesh.positions.map((position) => {
    const nx = Math.min(1, Math.abs(position.x) / (width * 0.5));
    const ny = Math.min(1, Math.abs(position.y) / (height * 0.5));
    const edge = Math.max(nx, ny);
    const side = position.z < 0 ? -1 : 1;
    const bulge = (1 - edge * edge) * depth * 0.075;
    const wrinkle = edge > 0.68
      ? Math.sin(position.x / width * Math.PI * 18 + position.y / height * Math.PI * 12)
        * depth * 0.012 * ((edge - 0.68) / 0.32)
      : 0;
    return vec3(position.x, position.y, position.z + side * (bulge + wrinkle));
  });
  return recomputeNormals({ ...mesh, positions });
}

function cellLocal(value: number, count: number): number {
  const scaled = value * count;
  return scaled === count ? 1 : scaled - Math.floor(scaled);
}

function puff(local: number): number {
  return 0.12 + Math.pow(Math.max(0, Math.sin(local * Math.PI)), 0.42) * 0.88;
}

/**
 * Closed, single-shell tufted pad. Module seams are pressed into one continuous
 * skin, so no camera angle can expose a through-gap between cushion cells.
 */
export function continuousTuftedPad(options: TuftedPadOptions): Mesh {
  const columns = Math.max(1, Math.round(options.columns));
  const rows = Math.max(1, Math.round(options.rows ?? 1));
  const segments = Math.max(4, Math.round(options.segmentsPerCell ?? 8));
  const xSegments = columns * segments;
  const zSegments = rows * segments;
  const seamDepth = Math.min(options.height * 0.35, Math.max(0, options.seamDepth ?? options.height * 0.12));
  const wrinkleStrength = Math.max(0, options.wrinkleStrength ?? options.height * 0.018);
  const positions: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];

  for (let zIndex = 0; zIndex <= zSegments; zIndex++) {
    const v = zIndex / zSegments;
    const localV = cellLocal(v, rows);
    const z = (v - 0.5) * options.depth;
    for (let xIndex = 0; xIndex <= xSegments; xIndex++) {
      const u = xIndex / xSegments;
      const localU = cellLocal(u, columns);
      const x = (u - 0.5) * options.width;
      const pressure = puff(localU) * puff(localV);
      const seamDistance = Math.min(localU, 1 - localU);
      const seamInfluence = Math.max(0, 1 - seamDistance / 0.18);
      const wrinkle = Math.sin(v * Math.PI * rows * 5 + u * Math.PI * columns * 2)
        * wrinkleStrength * seamInfluence;
      const top = Math.min(
        options.height * 0.5,
        options.height * 0.5 - seamDepth + seamDepth * pressure + wrinkle,
      );
      positions.push(vec3(x, top, z));
      uvs.push(vec2(u, v));
    }
  }

  const topCount = positions.length;
  for (let zIndex = 0; zIndex <= zSegments; zIndex++) {
    const v = zIndex / zSegments;
    const z = (v - 0.5) * options.depth;
    for (let xIndex = 0; xIndex <= xSegments; xIndex++) {
      const u = xIndex / xSegments;
      positions.push(vec3((u - 0.5) * options.width, -options.height * 0.5, z));
      uvs.push(vec2(u, v));
    }
  }

  const rowStride = xSegments + 1;
  for (let zIndex = 0; zIndex < zSegments; zIndex++) {
    for (let xIndex = 0; xIndex < xSegments; xIndex++) {
      const a = zIndex * rowStride + xIndex;
      const b = a + 1;
      const c = a + rowStride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
      indices.push(topCount + a, topCount + b, topCount + c, topCount + b, topCount + d, topCount + c);
    }
  }
  for (let xIndex = 0; xIndex < xSegments; xIndex++) {
    const backA = xIndex;
    const backB = backA + 1;
    const frontA = zSegments * rowStride + xIndex;
    const frontB = frontA + 1;
    indices.push(backA, backB, topCount + backA, backB, topCount + backB, topCount + backA);
    indices.push(frontA, topCount + frontA, frontB, frontB, topCount + frontA, topCount + frontB);
  }
  for (let zIndex = 0; zIndex < zSegments; zIndex++) {
    const leftA = zIndex * rowStride;
    const leftB = leftA + rowStride;
    const rightA = leftA + xSegments;
    const rightB = leftB + xSegments;
    indices.push(leftA, topCount + leftA, leftB, leftB, topCount + leftA, topCount + leftB);
    indices.push(rightA, rightB, topCount + rightA, rightB, topCount + rightB, topCount + rightA);
  }

  return recomputeNormals({
    positions,
    normals: positions.map(() => vec3(0, 1, 0)),
    uvs,
    indices,
  });
}

export function groundedTuftedPad(options: TuftedPadOptions, bottom = 0): Mesh {
  return transform(continuousTuftedPad(options), {
    translate: vec3(0, bottom + options.height * 0.5, 0),
  });
}
