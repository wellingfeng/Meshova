import type { NamedPart } from "../geometry/export.js";
import { transform } from "../geometry/transform.js";
import type { Vec3 } from "../math/vec3.js";
import { vec3 } from "../math/vec3.js";
import { makeRng, type Rng } from "../random/prng.js";

export interface VegetationAssemblyTransform {
  position: Vec3;
  rotation?: Vec3;
  scale?: Vec3 | number;
}

export interface VegetationAssemblySlot {
  id: string;
  label: string;
  species: string;
  type: string;
  preferredAssetId?: string;
  transform: VegetationAssemblyTransform;
}

export interface VegetationAssemblyCollection {
  id: string;
  label: string;
  seed?: number;
  slots: VegetationAssemblySlot[];
}

export interface VegetationAssemblyAsset {
  id: string;
  label: string;
  species: string;
  type: string;
  weight?: number;
  build(seed: number): NamedPart[];
}

export interface VegetationAssemblyBuildOptions {
  seed?: number;
  seedPosition?: Vec3;
  root?: Partial<VegetationAssemblyTransform>;
  randomizeAssets?: boolean;
  positionJitter?: number;
  yawJitter?: number;
  scaleJitter?: number;
}

export interface ResolvedVegetationAssemblySlot extends VegetationAssemblySlot {
  asset: VegetationAssemblyAsset;
  seed: number;
  resolvedTransform: VegetationAssemblyTransform;
}

function hashText(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mixSeed(...values: number[]): number {
  let seed = 0x9e3779b9;
  for (const value of values) {
    seed ^= value >>> 0;
    seed = Math.imul(seed ^ (seed >>> 16), 0x21f0aaad) >>> 0;
  }
  return seed >>> 0;
}

export function vegetationAssemblyPositionSeed(position: Vec3): number {
  return mixSeed(
    Math.round(position.x * 100),
    Math.round(position.y * 100),
    Math.round(position.z * 100),
  );
}

function weightedAsset(assets: VegetationAssemblyAsset[], rng: Rng): VegetationAssemblyAsset {
  const total = assets.reduce((sum, asset) => sum + Math.max(0, asset.weight ?? 1), 0);
  if (total <= 0) return assets[0]!;
  let target = rng.range(0, total);
  for (const asset of assets) {
    target -= Math.max(0, asset.weight ?? 1);
    if (target <= 0) return asset;
  }
  return assets[assets.length - 1]!;
}

function scaleWithJitter(value: Vec3 | number | undefined, jitter: number): Vec3 | number {
  const base = value ?? 1;
  if (typeof base === "number") return base * jitter;
  return vec3(base.x * jitter, base.y * jitter, base.z * jitter);
}

export function resolveVegetationAssembly(
  collection: VegetationAssemblyCollection,
  assets: VegetationAssemblyAsset[],
  options: VegetationAssemblyBuildOptions = {},
): ResolvedVegetationAssemblySlot[] {
  const seedPosition = options.seedPosition ?? vec3(0, 0, 0);
  const baseSeed = mixSeed(
    collection.seed ?? 0,
    options.seed ?? 0,
    hashText(collection.id),
    vegetationAssemblyPositionSeed(seedPosition),
  );
  return collection.slots.map((slot) => {
    const candidates = assets.filter((asset) => asset.species === slot.species && asset.type === slot.type);
    const speciesFallback = assets.filter((asset) => asset.species === slot.species);
    const pool = candidates.length > 0 ? candidates : speciesFallback;
    if (pool.length === 0) {
      throw new Error(`Assembly slot ${slot.id} has no asset for species=${slot.species}, type=${slot.type}`);
    }
    const slotSeed = mixSeed(baseSeed, hashText(slot.id));
    const rng = makeRng(slotSeed);
    const preferred = pool.find((asset) => asset.id === slot.preferredAssetId);
    const asset = options.randomizeAssets === false && preferred ? preferred : weightedAsset(pool, rng);
    const positionJitter = Math.max(0, options.positionJitter ?? 0);
    const yawJitter = Math.max(0, options.yawJitter ?? 0);
    const scaleJitter = Math.max(0, options.scaleJitter ?? 0);
    const position = vec3(
      slot.transform.position.x + rng.range(-positionJitter, positionJitter),
      slot.transform.position.y,
      slot.transform.position.z + rng.range(-positionJitter, positionJitter),
    );
    const baseRotation = slot.transform.rotation ?? vec3(0, 0, 0);
    const rotation = vec3(baseRotation.x, baseRotation.y + rng.range(-yawJitter, yawJitter), baseRotation.z);
    const jitter = 1 + rng.range(-scaleJitter, scaleJitter);
    return {
      ...slot,
      asset,
      seed: slotSeed,
      resolvedTransform: {
        position,
        rotation,
        scale: scaleWithJitter(slot.transform.scale, jitter),
      },
    };
  });
}

export function buildVegetationAssembly(
  collection: VegetationAssemblyCollection,
  assets: VegetationAssemblyAsset[],
  options: VegetationAssemblyBuildOptions = {},
): NamedPart[] {
  const rootPosition = options.root?.position ?? vec3(0, 0, 0);
  const rootRotation = options.root?.rotation ?? vec3(0, 0, 0);
  const rootScale = options.root?.scale ?? 1;
  const resolved = resolveVegetationAssembly(collection, assets, options);
  const parts: NamedPart[] = [];
  for (const slot of resolved) {
    for (const assetPart of slot.asset.build(slot.seed)) {
      const localMesh = transform(assetPart.mesh, {
        translate: slot.resolvedTransform.position,
        rotate: slot.resolvedTransform.rotation ?? vec3(0, 0, 0),
        scale: slot.resolvedTransform.scale ?? 1,
      });
      const mesh = transform(localMesh, { translate: rootPosition, rotate: rootRotation, scale: rootScale });
      const part: NamedPart = {
        ...assetPart,
        name: `${collection.id}.${slot.id}.${assetPart.name}`,
        label: `${slot.label} · ${assetPart.label ?? slot.asset.label}`,
        mesh,
        metadata: {
          ...assetPart.metadata,
          assemblyId: collection.id,
          assemblyLabel: collection.label,
          slotId: slot.id,
          slotLabel: slot.label,
          species: slot.species,
          assemblyType: slot.type,
          assetId: slot.asset.id,
          assetLabel: slot.asset.label,
          assemblySeed: slot.seed,
        },
      };
      if (assetPart.windWeight) part.windWeight = assetPart.windWeight.slice();
      parts.push(part);
    }
  }
  return parts;
}
