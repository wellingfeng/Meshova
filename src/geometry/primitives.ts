/**
 * Geometric primitives: box, sphere, plane.
 *
 * All produce indexed meshes with correct per-vertex normals and UVs, CCW
 * winding (front faces outward). Sizes are full extents centered on origin.
 */
import { vec3 } from "../math/vec3.js";
import { vec2 } from "../math/vec2.js";
import { TAU } from "../math/scalar.js";
import type { Mesh } from "./mesh.js";
import { makeMesh } from "./mesh.js";

/** Axis-aligned box of the given full width/height/depth, centered on origin. */
export function box(width = 1, height = 1, depth = 1): Mesh {
  const hx = width / 2;
  const hy = height / 2;
  const hz = depth / 2;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices: number[] = [];

  // 6 faces, each with its own 4 vertices so normals/UVs stay per-face.
  // face = [normal, origin corner, edgeU, edgeV]
  const faces: Array<[
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ]> = [
    // +X
    [[1, 0, 0], [hx, -hy, hz], [0, 0, -2 * hz], [0, 2 * hy, 0]],
    // -X
    [[-1, 0, 0], [-hx, -hy, -hz], [0, 0, 2 * hz], [0, 2 * hy, 0]],
    // +Y
    [[0, 1, 0], [-hx, hy, hz], [2 * hx, 0, 0], [0, 0, -2 * hz]],
    // -Y
    [[0, -1, 0], [-hx, -hy, -hz], [2 * hx, 0, 0], [0, 0, 2 * hz]],
    // +Z
    [[0, 0, 1], [-hx, -hy, hz], [2 * hx, 0, 0], [0, 2 * hy, 0]],
    // -Z
    [[0, 0, -1], [hx, -hy, -hz], [-2 * hx, 0, 0], [0, 2 * hy, 0]],
  ];

  for (const [n, o, u, v] of faces) {
    const base = positions.length;
    // 4 corners: o, o+u, o+u+v, o+v
    positions.push(vec3(o[0], o[1], o[2]));
    positions.push(vec3(o[0] + u[0], o[1] + u[1], o[2] + u[2]));
    positions.push(vec3(o[0] + u[0] + v[0], o[1] + u[1] + v[1], o[2] + u[2] + v[2]));
    positions.push(vec3(o[0] + v[0], o[1] + v[1], o[2] + v[2]));
    for (let k = 0; k < 4; k++) normals.push(vec3(n[0], n[1], n[2]));
    uvs.push(vec2(0, 0), vec2(1, 0), vec2(1, 1), vec2(0, 1));
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  return makeMesh({ positions, normals, uvs, indices });
}

/** UV sphere of the given radius, with longitude/latitude segments. */
export function sphere(radius = 0.5, segments = 16, rings = 12): Mesh {
  const seg = Math.max(3, Math.floor(segments));
  const rng = Math.max(2, Math.floor(rings));
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices: number[] = [];

  for (let y = 0; y <= rng; y++) {
    const v = y / rng;
    const theta = v * Math.PI; // 0..PI top to bottom
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    for (let x = 0; x <= seg; x++) {
      const u = x / seg;
      const phi = u * TAU;
      const nx = sinT * Math.cos(phi);
      const ny = cosT;
      const nz = sinT * Math.sin(phi);
      normals.push(vec3(nx, ny, nz));
      positions.push(vec3(nx * radius, ny * radius, nz * radius));
      uvs.push(vec2(u, 1 - v));
    }
  }

  const stride = seg + 1;
  for (let y = 0; y < rng; y++) {
    for (let x = 0; x < seg; x++) {
      const a = y * stride + x;
      const b = a + stride;
      // CCW outward (winding matches outward vertex normals)
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }

  return makeMesh({ positions, normals, uvs, indices });
}

/** Subdivided plane on the XZ ground, facing +Y. Full width/depth extents. */
export function plane(width = 1, depth = 1, cols = 1, rows = 1): Mesh {
  const c = Math.max(1, Math.floor(cols));
  const r = Math.max(1, Math.floor(rows));
  const hx = width / 2;
  const hz = depth / 2;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices: number[] = [];

  for (let j = 0; j <= r; j++) {
    const tz = j / r;
    for (let i = 0; i <= c; i++) {
      const tx = i / c;
      positions.push(vec3(-hx + tx * width, 0, -hz + tz * depth));
      normals.push(vec3(0, 1, 0));
      uvs.push(vec2(tx, tz));
    }
  }

  const stride = c + 1;
  for (let j = 0; j < r; j++) {
    for (let i = 0; i < c; i++) {
      const a = j * stride + i;
      const b = a + stride;
      // CCW when viewed from +Y (so face normals point up, +Y)
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  return makeMesh({ positions, normals, uvs, indices });
}
