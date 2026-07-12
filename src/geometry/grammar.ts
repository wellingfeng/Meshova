export type GrammarModuleMode = "fixed" | "repeat" | "stretch";

export interface GrammarModuleSpec {
  readonly key: string;
  readonly label: string;
  readonly prefab: string;
  readonly length: number;
  readonly mode?: GrammarModuleMode;
  readonly minCount?: number;
  readonly maxCount?: number;
  readonly cullBelow?: number;
  readonly enabled?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface GrammarPlacement {
  readonly key: string;
  readonly label: string;
  readonly prefab: string;
  readonly instance: number;
  readonly start: number;
  readonly end: number;
  readonly center: number;
  readonly length: number;
  readonly nominalLength: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface GrammarResampleOptions {
  readonly origin?: number;
  readonly fill?: "distribute" | "stretchLast" | "none";
  readonly align?: "start" | "center" | "end";
}

interface ActiveModule {
  readonly spec: GrammarModuleSpec;
  readonly mode: GrammarModuleMode;
  readonly minCount: number;
  readonly maxCount: number;
  count: number;
}

export function grammarResample(
  targetLength: number,
  modules: ReadonlyArray<GrammarModuleSpec>,
  options: GrammarResampleOptions = {},
): GrammarPlacement[] {
  if (!Number.isFinite(targetLength) || targetLength < 0) {
    throw new Error("targetLength must be finite and non-negative");
  }
  if (targetLength === 0) return [];

  const active = modules
    .filter((module) => module.enabled !== false && targetLength >= (module.cullBelow ?? 0))
    .map(normalizeModule);
  if (active.length === 0) return [];

  let used = 0;
  for (const module of active) {
    used += module.count * module.spec.length;
  }
  if (used > targetLength + 1e-9) {
    throw new Error(`grammar minimum length ${used} exceeds target ${targetLength}`);
  }

  const repeat = active.filter((module) => module.mode === "repeat");
  let changed = true;
  while (changed) {
    changed = false;
    for (const module of repeat) {
      if (module.count >= module.maxCount) continue;
      if (used + module.spec.length > targetLength + 1e-9) continue;
      module.count++;
      used += module.spec.length;
      changed = true;
    }
  }

  const lengths = new Map<ActiveModule, number[]>();
  for (const module of active) {
    lengths.set(module, Array.from({ length: module.count }, () => module.spec.length));
  }

  const fill = options.fill ?? "distribute";
  let remainder = Math.max(0, targetLength - used);
  if (fill !== "none" && remainder > 1e-9) {
    const stretch = active.filter((module) => module.mode === "stretch" && module.count > 0);
    const targets = stretch.length > 0
      ? stretch
      : active.filter((module) => module.mode === "repeat" && module.count > 0);
    if (fill === "distribute" && targets.length > 0) {
      const targetCount = targets.reduce((sum, module) => sum + module.count, 0);
      const extra = remainder / targetCount;
      for (const module of targets) {
        const moduleLengths = lengths.get(module)!;
        for (let index = 0; index < moduleLengths.length; index++) {
          moduleLengths[index] = moduleLengths[index]! + extra;
        }
      }
      remainder = 0;
    } else {
      const last = [...active].reverse().find((module) => module.count > 0);
      if (last) {
        const moduleLengths = lengths.get(last)!;
        const index = moduleLengths.length - 1;
        moduleLengths[index] = moduleLengths[index]! + remainder;
        remainder = 0;
      }
    }
  }

  const occupied = targetLength - remainder;
  const align = options.align ?? "start";
  const alignmentOffset = align === "center"
    ? remainder * 0.5
    : align === "end"
      ? remainder
      : 0;
  let cursor = (options.origin ?? 0) + alignmentOffset;
  const placements: GrammarPlacement[] = [];
  for (const module of active) {
    const moduleLengths = lengths.get(module)!;
    for (let instance = 0; instance < moduleLengths.length; instance++) {
      const length = moduleLengths[instance]!;
      const start = cursor;
      const end = start + length;
      placements.push({
        key: module.spec.key,
        label: module.spec.label,
        prefab: module.spec.prefab,
        instance,
        start,
        end,
        center: (start + end) * 0.5,
        length,
        nominalLength: module.spec.length,
        metadata: { ...(module.spec.metadata ?? {}) },
      });
      cursor = end;
    }
  }
  if (Math.abs(cursor - ((options.origin ?? 0) + alignmentOffset + occupied)) > 1e-6) {
    throw new Error("grammar layout failed to preserve occupied length");
  }
  return placements;
}

function normalizeModule(spec: GrammarModuleSpec): ActiveModule {
  if (!spec.key.trim()) throw new Error("grammar module key must not be empty");
  if (!spec.label.trim()) throw new Error(`grammar module ${spec.key} needs a semantic label`);
  if (!spec.prefab.trim()) throw new Error(`grammar module ${spec.key} needs a prefab key`);
  if (!Number.isFinite(spec.length) || spec.length <= 0) {
    throw new Error(`grammar module ${spec.key} length must be positive`);
  }
  const mode = spec.mode ?? "fixed";
  const defaultMin = mode === "repeat" ? 0 : 1;
  const minCount = Math.max(0, Math.floor(spec.minCount ?? defaultMin));
  const defaultMax = mode === "repeat" ? Number.MAX_SAFE_INTEGER : minCount;
  const maxCount = Math.max(minCount, Math.floor(spec.maxCount ?? defaultMax));
  return { spec, mode, minCount, maxCount, count: minCount };
}
