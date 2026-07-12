/** Parametric surfaces useful for compact, high-dimensional procedural models. */
import { TAU } from "../math/scalar.js";
import { vec2 } from "../math/vec2.js";
import { vec3 } from "../math/vec3.js";
import { makeMesh, recomputeNormals, type Mesh } from "./mesh.js";

export interface SuperformulaOptions {
  readonly a?: number;
  readonly b?: number;
  readonly m?: number;
  readonly n1?: number;
  readonly n2?: number;
  readonly n3?: number;
}

export interface SuperformulaSurfaceOptions extends SuperformulaOptions {
  readonly height?: number;
  readonly radiusBottom?: number;
  readonly radiusTop?: number;
  readonly angularSegments?: number;
  readonly heightSegments?: number;
  readonly twist?: number;
  readonly bulge?: number;
  readonly caps?: boolean;
}

/** Johan Gielis' superformula radius for an angle in radians. */
export function superformulaRadius(angle: number, options: SuperformulaOptions = {}): number {
  const a = Math.max(1e-9, Math.abs(options.a ?? 1));
  const b = Math.max(1e-9, Math.abs(options.b ?? 1));
  const m = options.m ?? 6;
  const n1 = Math.abs(options.n1 ?? 1) < 1e-9 ? 1e-9 : options.n1 ?? 1;
  const n2 = options.n2 ?? 1;
  const n3 = options.n3 ?? 1;
  const p = m * angle * 0.25;
  const sum = Math.pow(Math.abs(Math.cos(p) / a), n2) + Math.pow(Math.abs(Math.sin(p) / b), n3);
  return sum <= 1e-15 ? 0 : Math.pow(sum, -1 / n1);
}

/** Closed superformula tower/vase surface with taper, twist and vertical bulge. */
export function superformulaSurface(options: SuperformulaSurfaceOptions = {}): Mesh {
  const angularSegments = Math.max(3, Math.round(options.angularSegments ?? 64));
  const heightSegments = Math.max(1, Math.round(options.heightSegments ?? 24));
  const height = Math.max(1e-6, options.height ?? 2);
  const bottom = Math.max(0, options.radiusBottom ?? 1);
  const top = Math.max(0, options.radiusTop ?? bottom);
  const twist = options.twist ?? 0;
  const bulge = options.bulge ?? 0;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices: number[] = [];

  for (let row = 0; row <= heightSegments; row++) {
    const v = row / heightSegments;
    const baseRadius = bottom + (top - bottom) * v;
    const profile = Math.max(0, 1 + Math.sin(v * Math.PI) * bulge);
    const y = (v - 0.5) * height;
    for (let col = 0; col < angularSegments; col++) {
      const u = col / angularSegments;
      const angle = u * TAU + twist * v;
      const radius = baseRadius * profile * superformulaRadius(angle, options);
      positions.push(vec3(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
      normals.push(vec3(Math.cos(angle), 0, Math.sin(angle)));
      uvs.push(vec2(u, v));
    }
  }

  for (let row = 0; row < heightSegments; row++) {
    const next = row + 1;
    for (let col = 0; col < angularSegments; col++) {
      const right = (col + 1) % angularSegments;
      const a = row * angularSegments + col;
      const b = next * angularSegments + col;
      const c = row * angularSegments + right;
      const d = next * angularSegments + right;
      indices.push(a, b, c, c, b, d);
    }
  }

  if (options.caps ?? true) {
    const bottomCenter = positions.length;
    positions.push(vec3(0, -height * 0.5, 0));
    normals.push(vec3(0, -1, 0));
    uvs.push(vec2(0.5, 0.5));
    const topCenter = positions.length;
    positions.push(vec3(0, height * 0.5, 0));
    normals.push(vec3(0, 1, 0));
    uvs.push(vec2(0.5, 0.5));
    const topStart = heightSegments * angularSegments;
    for (let col = 0; col < angularSegments; col++) {
      const right = (col + 1) % angularSegments;
      indices.push(bottomCenter, right, col);
      indices.push(topCenter, topStart + col, topStart + right);
    }
  }

  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}
