import type { Quat } from "../math/quat.js";
import { dihedral, fromAxisAngle, qidentity, qmultiply, qnormalize } from "../math/quat.js";
import type { Vec3 } from "../math/vec3.js";
import { normalize, vec3 } from "../math/vec3.js";
import type { InstancePlan } from "./instance.js";
import type { Mesh } from "./mesh.js";

export interface GpuInstanceRecord {
  readonly meshId: string;
  readonly materialId?: string;
  readonly partition?: string;
  readonly position: Vec3;
  readonly rotation?: Quat;
  readonly scale?: Vec3 | number;
  readonly customData?: ReadonlyArray<number>;
  readonly sourceNode?: string;
}

export interface InstanceBufferGroup {
  readonly key: string;
  readonly meshId: string;
  readonly materialId: string;
  readonly partition: string;
  readonly count: number;
  readonly positions: Float32Array;
  readonly rotations: Float32Array;
  readonly scales: Float32Array;
  readonly customData: Float32Array;
  readonly customStride: number;
  readonly sourceNodes: ReadonlyArray<string>;
}

export interface BuildInstanceBuffersOptions {
  readonly customStride?: number;
}

export function buildInstanceBuffers(
  records: ReadonlyArray<GpuInstanceRecord>,
  options: BuildInstanceBuffersOptions = {},
): InstanceBufferGroup[] {
  const inferredStride = records.reduce(
    (max, record) => Math.max(max, record.customData?.length ?? 0),
    0,
  );
  const customStride = Math.max(0, Math.floor(options.customStride ?? inferredStride));
  const grouped = new Map<string, GpuInstanceRecord[]>();
  for (const record of records) {
    if (!record.meshId.trim()) throw new Error("instance meshId must not be empty");
    if ((record.customData?.length ?? 0) > customStride) {
      throw new Error(`custom data length exceeds stride ${customStride}`);
    }
    const key = groupKey(record);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(record);
    else grouped.set(key, [record]);
  }

  return [...grouped.entries()].map(([key, group]) => packGroup(key, group, customStride));
}

export function instancePlanToGpuRecords(
  plan: InstancePlan,
  meshIdFor: (mesh: Mesh, variant: number) => string,
  materialId = "default",
  partition = "default",
): GpuInstanceRecord[] {
  return plan.instances.map((instance) => {
    const up = vec3(0, 1, 0);
    const normal = normalize(instance.normal);
    const aligned = instance.alignToNormal ? dihedral(up, normal) : qidentity();
    const yawAxis = instance.alignToNormal && (normal.x !== 0 || normal.y !== 0 || normal.z !== 0)
      ? normal
      : up;
    const rotation = qmultiply(fromAxisAngle(yawAxis, instance.yaw), aligned);
    return {
      meshId: meshIdFor(instance.mesh, instance.variant),
      materialId,
      partition,
      position: instance.position,
      rotation,
      scale: instance.scale,
      customData: [instance.variant],
      sourceNode: "instancePlanFromPoints",
    };
  });
}

function packGroup(
  key: string,
  records: ReadonlyArray<GpuInstanceRecord>,
  customStride: number,
): InstanceBufferGroup {
  const positions = new Float32Array(records.length * 3);
  const rotations = new Float32Array(records.length * 4);
  const scales = new Float32Array(records.length * 3);
  const customData = new Float32Array(records.length * customStride);
  const sourceNodes: string[] = [];
  for (let index = 0; index < records.length; index++) {
    const record = records[index]!;
    const rotation = qnormalize(record.rotation ?? qidentity());
    const scaleValue = record.scale ?? 1;
    const scale = typeof scaleValue === "number"
      ? vec3(scaleValue, scaleValue, scaleValue)
      : scaleValue;
    positions.set([record.position.x, record.position.y, record.position.z], index * 3);
    rotations.set([rotation.x, rotation.y, rotation.z, rotation.w], index * 4);
    scales.set([scale.x, scale.y, scale.z], index * 3);
    for (let customIndex = 0; customIndex < customStride; customIndex++) {
      customData[index * customStride + customIndex] = record.customData?.[customIndex] ?? 0;
    }
    sourceNodes.push(record.sourceNode ?? "unknown");
  }
  const first = records[0]!;
  return {
    key,
    meshId: first.meshId,
    materialId: first.materialId ?? "default",
    partition: first.partition ?? "default",
    count: records.length,
    positions,
    rotations,
    scales,
    customData,
    customStride,
    sourceNodes,
  };
}

function groupKey(record: GpuInstanceRecord): string {
  return `${record.partition ?? "default"}\u001f${record.meshId}\u001f${record.materialId ?? "default"}`;
}
