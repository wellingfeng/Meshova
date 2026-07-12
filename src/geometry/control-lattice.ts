import { vec3, type Vec3 } from "../math/vec3.js";
import { recomputeNormals, type Mesh } from "./mesh.js";

export interface ControlLatticeOptions {
  readonly rows: number;
  readonly columns: number;
  readonly interpolation?: "bilinear" | "b-spline";
  readonly degree?: number;
  readonly bounds?: ControlLatticeBounds;
}

export interface ControlLatticeBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface ControlSurfaceSampleOptions extends ControlLatticeOptions {
  readonly rowSamples?: number;
  readonly columnSamples?: number;
}

export function deformByControlLattice(
  mesh: Mesh,
  basePoints: ReadonlyArray<Vec3>,
  editedPoints: ReadonlyArray<Vec3>,
  options: ControlLatticeOptions,
): Mesh {
  const rows = Math.round(options.rows);
  const columns = Math.round(options.columns);
  const expected = rows * columns;
  if (rows < 2 || columns < 2) throw new Error("control lattice needs at least 2 rows and 2 columns");
  if (basePoints.length !== expected || editedPoints.length !== expected) {
    throw new Error(`control lattice expected ${expected} points`);
  }
  if (mesh.positions.length === 0) return mesh;

  let { minX, maxX, minZ, maxZ } = options.bounds ?? {
    minX: Infinity,
    maxX: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  };
  if (!options.bounds) {
    for (const position of mesh.positions) {
      minX = Math.min(minX, position.x);
      maxX = Math.max(maxX, position.x);
      minZ = Math.min(minZ, position.z);
      maxZ = Math.max(maxZ, position.z);
    }
  }
  const spanX = Math.max(1e-8, maxX - minX);
  const spanZ = Math.max(1e-8, maxZ - minZ);
  const displacements = basePoints.map((point, index) => {
    const edited = editedPoints[index]!;
    return vec3(edited.x - point.x, edited.y - point.y, edited.z - point.z);
  });

  const positions = mesh.positions.map((position) => {
    const normalizedU = clamp01((position.x - minX) / spanX);
    const normalizedV = clamp01((position.z - minZ) / spanZ);
    if (options.interpolation === "b-spline") {
      const displacement = evaluateBSplineSurface(
        displacements,
        rows,
        columns,
        normalizedU,
        normalizedV,
        options.degree ?? 3,
      );
      return vec3(
        position.x + displacement.x,
        position.y + displacement.y,
        position.z + displacement.z,
      );
    }
    const u = normalizedU * (columns - 1);
    const v = normalizedV * (rows - 1);
    const column = Math.min(columns - 2, Math.floor(u));
    const row = Math.min(rows - 2, Math.floor(v));
    const localU = u - column;
    const localV = v - row;
    const a = displacements[row * columns + column]!;
    const b = displacements[row * columns + column + 1]!;
    const c = displacements[(row + 1) * columns + column]!;
    const d = displacements[(row + 1) * columns + column + 1]!;
    const dx = bilerp(a.x, b.x, c.x, d.x, localU, localV);
    const dy = bilerp(a.y, b.y, c.y, d.y, localU, localV);
    const dz = bilerp(a.z, b.z, c.z, d.z, localU, localV);
    return vec3(position.x + dx, position.y + dy, position.z + dz);
  });

  return recomputeNormals({
    positions,
    normals: mesh.normals,
    uvs: mesh.uvs,
    indices: mesh.indices,
  });
}

/** Samples a tensor-product B-spline surface for viewport display. */
export function sampleControlSurface(
  controlPoints: ReadonlyArray<Vec3>,
  options: ControlSurfaceSampleOptions,
): { readonly points: Vec3[]; readonly rows: number; readonly columns: number } {
  const rows = Math.round(options.rows);
  const columns = Math.round(options.columns);
  if (rows < 2 || columns < 2 || controlPoints.length !== rows * columns) {
    throw new Error(`control surface expected ${rows * columns} points`);
  }
  const sampleRows = Math.max(2, Math.floor(options.rowSamples ?? (rows - 1) * 6 + 1));
  const sampleColumns = Math.max(2, Math.floor(options.columnSamples ?? (columns - 1) * 6 + 1));
  const points: Vec3[] = [];
  for (let row = 0; row < sampleRows; row++) {
    const v = row / (sampleRows - 1);
    for (let column = 0; column < sampleColumns; column++) {
      const u = column / (sampleColumns - 1);
      points.push(options.interpolation === "bilinear"
        ? evaluateBilinearSurface(controlPoints, rows, columns, u, v)
        : evaluateBSplineSurface(controlPoints, rows, columns, u, v, options.degree ?? 3));
    }
  }
  return { points, rows: sampleRows, columns: sampleColumns };
}

function evaluateBilinearSurface(
  points: ReadonlyArray<Vec3>,
  rows: number,
  columns: number,
  normalizedU: number,
  normalizedV: number,
): Vec3 {
  const u = clamp01(normalizedU) * (columns - 1);
  const v = clamp01(normalizedV) * (rows - 1);
  const column = Math.min(columns - 2, Math.floor(u));
  const row = Math.min(rows - 2, Math.floor(v));
  const localU = u - column;
  const localV = v - row;
  const a = points[row * columns + column]!;
  const b = points[row * columns + column + 1]!;
  const c = points[(row + 1) * columns + column]!;
  const d = points[(row + 1) * columns + column + 1]!;
  return vec3(
    bilerp(a.x, b.x, c.x, d.x, localU, localV),
    bilerp(a.y, b.y, c.y, d.y, localU, localV),
    bilerp(a.z, b.z, c.z, d.z, localU, localV),
  );
}

function evaluateBSplineSurface(
  points: ReadonlyArray<Vec3>,
  rows: number,
  columns: number,
  u: number,
  v: number,
  requestedDegree: number,
): Vec3 {
  const columnWeights = bsplineWeights(columns, requestedDegree, clamp01(u));
  const rowWeights = bsplineWeights(rows, requestedDegree, clamp01(v));
  let x = 0;
  let y = 0;
  let z = 0;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const weight = rowWeights[row]! * columnWeights[column]!;
      const point = points[row * columns + column]!;
      x += point.x * weight;
      y += point.y * weight;
      z += point.z * weight;
    }
  }
  return vec3(x, y, z);
}

function bsplineWeights(count: number, requestedDegree: number, t: number): number[] {
  const degree = Math.max(1, Math.min(Math.floor(requestedDegree), count - 1));
  const knotCount = count + degree + 1;
  const interiorCount = count - degree - 1;
  const knots = Array.from({ length: knotCount }, (_, index) => {
    if (index <= degree) return 0;
    if (index >= count) return 1;
    return (index - degree) / (interiorCount + 1);
  });
  let weights: number[] = Array.from({ length: count }, (_, index) =>
    (t >= knots[index]! && t < knots[index + 1]!) || (t === 1 && index === count - 1) ? 1 : 0);
  for (let order = 1; order <= degree; order++) {
    weights = weights.map((_, index) => {
      const leftDenominator = knots[index + order]! - knots[index]!;
      const rightDenominator = knots[index + order + 1]! - knots[index + 1]!;
      const left = leftDenominator > 1e-12 ? ((t - knots[index]!) / leftDenominator) * weights[index]! : 0;
      const right = rightDenominator > 1e-12 && index + 1 < count
        ? ((knots[index + order + 1]! - t) / rightDenominator) * weights[index + 1]!
        : 0;
      return left + right;
    });
  }
  return weights;
}

function bilerp(a: number, b: number, c: number, d: number, u: number, v: number): number {
  const top = a + (b - a) * u;
  const bottom = c + (d - c) * u;
  return top + (bottom - top) * v;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
