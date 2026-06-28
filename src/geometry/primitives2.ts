/**
 * Extended primitives (P9): cylinder, cone, torus, icosphere, circle.
 * Same conventions as the core primitives — indexed meshes, unit-length
 * normals, UVs, CCW front faces, centered on origin.
 */
import { vec3, normalize } from "../math/vec3.js";
import { vec2 } from "../math/vec2.js";
import { TAU } from "../math/scalar.js";
import type { Mesh } from "./mesh.js";
import { makeMesh } from "./mesh.js";

/**
 * Cylinder along Y, centered on origin. `segments` around, optional caps.
 */
export function cylinder(
  radius = 0.5,
  height = 1,
  segments = 24,
  caps = true,
): Mesh {
  const seg = Math.max(3, Math.floor(segments));
  const hy = height / 2;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices: number[] = [];

  // side ring (duplicated top/bottom for hard side normals)
  for (let y = 0; y < 2; y++) {
    const py = y === 0 ? -hy : hy;
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      const a = u * TAU;
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      positions.push(vec3(nx * radius, py, nz * radius));
      normals.push(vec3(nx, 0, nz));
      uvs.push(vec2(u, y));
    }
  }
  const stride = seg + 1;
  for (let i = 0; i < seg; i++) {
    const a = i;
    const b = i + stride;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }

  if (caps) {
    for (const top of [false, true]) {
      const py = top ? hy : -hy;
      const ny = top ? 1 : -1;
      const center = positions.length;
      positions.push(vec3(0, py, 0));
      normals.push(vec3(0, ny, 0));
      uvs.push(vec2(0.5, 0.5));
      const ringStart = positions.length;
      for (let i = 0; i <= seg; i++) {
        const u = i / seg;
        const ang = u * TAU;
        const nx = Math.cos(ang);
        const nz = Math.sin(ang);
        positions.push(vec3(nx * radius, py, nz * radius));
        normals.push(vec3(0, ny, 0));
        uvs.push(vec2(nx * 0.5 + 0.5, nz * 0.5 + 0.5));
      }
      for (let i = 0; i < seg; i++) {
        const a = ringStart + i;
        if (top) indices.push(center, a + 1, a);
        else indices.push(center, a, a + 1);
      }
    }
  }
  return makeMesh({ positions, normals, uvs, indices });
}

/**
 * Cone along Y (apex up), centered so base sits at -height/2. Optional base cap.
 */
export function cone(radius = 0.5, height = 1, segments = 24, cap = true): Mesh {
  const seg = Math.max(3, Math.floor(segments));
  const hy = height / 2;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices: number[] = [];

  // Slant normal y-component.
  const slant = Math.hypot(radius, height);
  const ny = radius / slant;
  const nyApex = ny;

  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    const a = u * TAU;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    // base vertex
    positions.push(vec3(cx * radius, -hy, cz * radius));
    normals.push(normalize(vec3(cx * (height / slant), nyApex, cz * (height / slant))));
    uvs.push(vec2(u, 0));
    // apex (per-segment for proper normals)
    positions.push(vec3(0, hy, 0));
    normals.push(normalize(vec3(cx * (height / slant), nyApex, cz * (height / slant))));
    uvs.push(vec2(u, 1));
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2);
  }

  if (cap) {
    const center = positions.length;
    positions.push(vec3(0, -hy, 0));
    normals.push(vec3(0, -1, 0));
    uvs.push(vec2(0.5, 0.5));
    const ringStart = positions.length;
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      const ang = u * TAU;
      const cx = Math.cos(ang);
      const cz = Math.sin(ang);
      positions.push(vec3(cx * radius, -hy, cz * radius));
      normals.push(vec3(0, -1, 0));
      uvs.push(vec2(cx * 0.5 + 0.5, cz * 0.5 + 0.5));
    }
    for (let i = 0; i < seg; i++) {
      const a = ringStart + i;
      indices.push(center, a, a + 1);
    }
  }
  return makeMesh({ positions, normals, uvs, indices });
}

/** Torus in the XZ plane. `radius` = ring center, `tube` = tube radius. */
export function torus(
  radius = 0.5,
  tube = 0.2,
  segments = 32,
  sides = 16,
): Mesh {
  const seg = Math.max(3, Math.floor(segments));
  const sid = Math.max(3, Math.floor(sides));
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices: number[] = [];

  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    const phi = u * TAU;
    const cphi = Math.cos(phi);
    const sphi = Math.sin(phi);
    for (let j = 0; j <= sid; j++) {
      const v = j / sid;
      const theta = v * TAU;
      const ctheta = Math.cos(theta);
      const stheta = Math.sin(theta);
      const cx = (radius + tube * ctheta) * cphi;
      const cy = tube * stheta;
      const cz = (radius + tube * ctheta) * sphi;
      positions.push(vec3(cx, cy, cz));
      // normal points from ring-center to surface
      const center = vec3(radius * cphi, 0, radius * sphi);
      normals.push(normalize(vec3(cx - center.x, cy, cz - center.z)));
      uvs.push(vec2(u, v));
    }
  }
  const stride = sid + 1;
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < sid; j++) {
      const a = i * stride + j;
      const b = a + stride;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return makeMesh({ positions, normals, uvs, indices });
}

/**
 * Icosphere: subdivided icosahedron, far more uniform triangles than a UV
 * sphere (no pole pinching). `subdivisions` 0..4 sensible.
 */
export function icosphere(radius = 0.5, subdivisions = 1): Mesh {
  const t = (1 + Math.sqrt(5)) / 2;
  // 12 icosahedron vertices
  let verts: Array<{ x: number; y: number; z: number }> = [
    { x: -1, y: t, z: 0 }, { x: 1, y: t, z: 0 }, { x: -1, y: -t, z: 0 }, { x: 1, y: -t, z: 0 },
    { x: 0, y: -1, z: t }, { x: 0, y: 1, z: t }, { x: 0, y: -1, z: -t }, { x: 0, y: 1, z: -t },
    { x: t, y: 0, z: -1 }, { x: t, y: 0, z: 1 }, { x: -t, y: 0, z: -1 }, { x: -t, y: 0, z: 1 },
  ].map((v) => normalize(vec3(v.x, v.y, v.z)));
  let faces: Array<[number, number, number]> = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  const subs = Math.max(0, Math.min(5, Math.floor(subdivisions)));
  for (let s = 0; s < subs; s++) {
    const midCache = new Map<string, number>();
    const newFaces: Array<[number, number, number]> = [];
    const mid = (a: number, b: number): number => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const cached = midCache.get(key);
      if (cached !== undefined) return cached;
      const va = verts[a]!;
      const vb = verts[b]!;
      const idx = verts.length;
      verts.push(normalize(vec3((va.x + vb.x) / 2, (va.y + vb.y) / 2, (va.z + vb.z) / 2)));
      midCache.set(key, idx);
      return idx;
    };
    for (const [a, b, c] of faces) {
      const ab = mid(a, b);
      const bc = mid(b, c);
      const ca = mid(c, a);
      newFaces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = newFaces;
  }

  const positions = verts.map((v) => vec3(v.x * radius, v.y * radius, v.z * radius));
  const normals = verts.map((v) => vec3(v.x, v.y, v.z));
  const uvs = verts.map((v) =>
    vec2(0.5 + Math.atan2(v.z, v.x) / TAU, 0.5 - Math.asin(v.y) / Math.PI),
  );
  const indices: number[] = [];
  for (const [a, b, c] of faces) indices.push(a, b, c);
  return makeMesh({ positions, normals, uvs, indices });
}

/** Flat filled circle (disc) in the XZ plane, facing +Y. */
export function circle(radius = 0.5, segments = 32): Mesh {
  const seg = Math.max(3, Math.floor(segments));
  const positions = [vec3(0, 0, 0)];
  const normals = [vec3(0, 1, 0)];
  const uvs = [vec2(0.5, 0.5)];
  const indices: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    const a = u * TAU;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    positions.push(vec3(cx * radius, 0, cz * radius));
    normals.push(vec3(0, 1, 0));
    uvs.push(vec2(cx * 0.5 + 0.5, cz * 0.5 + 0.5));
  }
  for (let i = 0; i < seg; i++) indices.push(0, i + 2, i + 1);
  return makeMesh({ positions, normals, uvs, indices });
}
