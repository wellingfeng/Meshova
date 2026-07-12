import { add, length, normalize, scale, type Vec3 } from "../math/vec3.js";
import type { Mesh } from "./mesh.js";
import {
  makePointCloud,
  pointContext,
  type PointCloud,
  type PointContext,
} from "./point-cloud.js";
import { primuvVec3, rayMesh } from "./query.js";

export type PointRayDirection = Vec3 | ((context: PointContext) => Vec3);

export interface RayProjectPointCloudOptions {
  /** World-space ray direction, or a per-point direction callback. */
  readonly direction?: PointRayDirection;
  /** Move each ray origin along its normalized direction before tracing. */
  readonly originOffset?: number;
  /** Reject hits farther than this world-space distance. */
  readonly maxDistance?: number;
  /** Move successful points along the hit normal to avoid coplanar overlap. */
  readonly surfaceOffset?: number;
  /** Keep misses in place, or remove them from the result. */
  readonly miss?: "drop" | "keep";
  /** Replace point normals with interpolated target-surface normals. */
  readonly updateNormal?: boolean;
}

/**
 * Project a point cloud onto an arbitrary mesh with nearest-hit ray queries.
 * Source attributes survive compaction; three diagnostic columns are added:
 * `ray.hit`, `ray.distance`, and `ray.prim`.
 */
export function rayProjectPointCloud(
  pointCloud: PointCloud,
  target: Mesh,
  options: RayProjectPointCloudOptions = {},
): PointCloud {
  const directionField = options.direction ?? { x: 0, y: -1, z: 0 };
  const originOffset = options.originOffset ?? 0;
  const maxDistance = Math.max(0, options.maxDistance ?? Number.POSITIVE_INFINITY);
  const surfaceOffset = options.surfaceOffset ?? 0;
  const keepMisses = options.miss === "keep";
  const updateNormal = options.updateNormal ?? true;
  const sourceIndices: number[] = [];
  const points: Vec3[] = [];
  const normals: Vec3[] = [];
  const hitValues: number[] = [];
  const distances: number[] = [];
  const primitives: number[] = [];

  for (let index = 0; index < pointCloud.points.length; index++) {
    const context = pointContext(pointCloud, index);
    const rawDirection = typeof directionField === "function"
      ? directionField(context)
      : directionField;
    if (length(rawDirection) <= 1e-12) {
      throw new Error(`ray direction is zero at point ${index}`);
    }
    const direction = normalize(rawDirection);
    const origin = add(context.point, scale(direction, originOffset));
    const hit = rayMesh(target, origin, direction);
    if (!hit || hit.t > maxDistance) {
      if (!keepMisses) continue;
      sourceIndices.push(index);
      points.push(context.point);
      normals.push(context.normal);
      hitValues.push(0);
      distances.push(-1);
      primitives.push(-1);
      continue;
    }

    const hitNormal = normalize(primuvVec3(
      target,
      target.normals,
      hit.prim,
      hit.uv.u,
      hit.uv.v,
    ));
    sourceIndices.push(index);
    points.push(add(hit.position, scale(hitNormal, surfaceOffset)));
    normals.push(updateNormal ? hitNormal : context.normal);
    hitValues.push(1);
    distances.push(hit.t);
    primitives.push(hit.prim);
  }

  const attributes: Record<string, number[]> = {};
  for (const [name, values] of Object.entries(pointCloud.attributes)) {
    attributes[name] = sourceIndices.map((index) => values[index] ?? 0);
  }
  attributes["ray.hit"] = hitValues;
  attributes["ray.distance"] = distances;
  attributes["ray.prim"] = primitives;
  return makePointCloud({ points, normals, attributes });
}
