export interface AssemblySize {
  width: number;
  height: number;
  depth: number;
}

export interface AssemblyOrientation {
  yaw: number;
  pitch: number;
  roll: number;
}

export interface AssemblySlot<TMetadata extends object = Record<string, unknown>> {
  id: string;
  label: string;
  type: string;
  requiredTags: readonly string[];
  position: readonly [number, number, number];
  orientation: AssemblyOrientation;
  size: AssemblySize;
  capacity: number;
  metadata?: TMetadata;
}

export interface AssemblyModuleSpec<TMetadata extends object = Record<string, unknown>> {
  id: string;
  label: string;
  slotType: string;
  tags: readonly string[];
  size: AssemblySize;
  capacityCost: number;
  supportedYaw?: readonly number[];
  weight: number;
  metadata?: TMetadata;
}

export type AssemblyCompatibilityCode =
  | "slot-type"
  | "required-tag"
  | "width"
  | "height"
  | "depth"
  | "orientation"
  | "capacity";

export interface AssemblyCompatibilityIssue {
  code: AssemblyCompatibilityCode;
  message: string;
}

export interface AssemblyCompatibility {
  compatible: boolean;
  issues: AssemblyCompatibilityIssue[];
}

export interface AssemblyPlacement {
  instanceId: string;
  slotId: string;
  moduleId: string;
  variantSeed: number;
}

export interface AssemblyState {
  version: 1;
  id: string;
  seed: number;
  revision: number;
  placements: AssemblyPlacement[];
}

export interface CreateAssemblyOptions<
  TSlotMetadata extends object = Record<string, unknown>,
  TModuleMetadata extends object = Record<string, unknown>,
> {
  id: string;
  seed: number;
  slots: readonly AssemblySlot<TSlotMetadata>[];
  modules: readonly AssemblyModuleSpec<TModuleMetadata>[];
  moduleBySlot?: Readonly<Record<string, string>>;
}

export interface AssemblyReplaceCommand {
  id: string;
  type: "replace-module";
  slotId: string;
  before: AssemblyPlacement;
  after: AssemblyPlacement;
}

export interface AssemblyEditResult {
  state: AssemblyState;
  command: AssemblyReplaceCommand;
  invalidatedSlotIds: string[];
}

export interface AssemblyHistory {
  state: AssemblyState;
  past: AssemblyReplaceCommand[];
  future: AssemblyReplaceCommand[];
}

const ANGLE_EPSILON = 1e-4;

function normalizeAngle(angle: number): number {
  const normalized = angle % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function sameAngle(first: number, second: number): boolean {
  const delta = Math.abs(normalizeAngle(first) - normalizeAngle(second));
  return Math.min(delta, 360 - delta) <= ANGLE_EPSILON;
}

function hashText(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function stableSeed(seed: number, ...keys: string[]): number {
  return hashText(`${seed >>> 0}|${keys.join("|")}`);
}

function assertUniqueIds(items: readonly { id: string }[], kind: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.id.trim()) throw new Error(`${kind} id must not be empty`);
    if (seen.has(item.id)) throw new Error(`duplicate ${kind} id: ${item.id}`);
    seen.add(item.id);
  }
}

function clonePlacement(placement: AssemblyPlacement): AssemblyPlacement {
  return { ...placement };
}

function makePlacement(assemblyId: string, seed: number, slotId: string, moduleId: string): AssemblyPlacement {
  const variantSeed = stableSeed(seed, slotId, moduleId, "variant");
  const suffix = stableSeed(seed, assemblyId, slotId, moduleId).toString(16).padStart(8, "0");
  return {
    instanceId: `${assemblyId}:${slotId}:${suffix}`,
    slotId,
    moduleId,
    variantSeed,
  };
}

function replacePlacement(state: AssemblyState, placement: AssemblyPlacement): AssemblyState {
  return {
    ...state,
    revision: state.revision + 1,
    placements: state.placements.map((current) => (
      current.slotId === placement.slotId ? clonePlacement(placement) : clonePlacement(current)
    )),
  };
}

export function checkAssemblyCompatibility<TSlotMetadata extends object, TModuleMetadata extends object>(
  slot: AssemblySlot<TSlotMetadata>,
  module: AssemblyModuleSpec<TModuleMetadata>,
): AssemblyCompatibility {
  const issues: AssemblyCompatibilityIssue[] = [];
  if (module.slotType !== slot.type) {
    issues.push({ code: "slot-type", message: `module ${module.id} requires ${module.slotType}, slot ${slot.id} is ${slot.type}` });
  }
  for (const tag of slot.requiredTags) {
    if (!module.tags.includes(tag)) {
      issues.push({ code: "required-tag", message: `module ${module.id} is missing required tag ${tag}` });
    }
  }
  if (module.size.width > slot.size.width) {
    issues.push({ code: "width", message: `module ${module.id} exceeds slot ${slot.id} width` });
  }
  if (module.size.height > slot.size.height) {
    issues.push({ code: "height", message: `module ${module.id} exceeds slot ${slot.id} height` });
  }
  if (module.size.depth > slot.size.depth) {
    issues.push({ code: "depth", message: `module ${module.id} exceeds slot ${slot.id} depth` });
  }
  if (module.supportedYaw && !module.supportedYaw.some((yaw) => sameAngle(yaw, slot.orientation.yaw))) {
    issues.push({ code: "orientation", message: `module ${module.id} does not support slot yaw ${slot.orientation.yaw}` });
  }
  if (module.capacityCost > slot.capacity) {
    issues.push({ code: "capacity", message: `module ${module.id} exceeds slot ${slot.id} capacity` });
  }
  return { compatible: issues.length === 0, issues };
}

export function listCompatibleModules<TSlotMetadata extends object, TModuleMetadata extends object>(
  slot: AssemblySlot<TSlotMetadata>,
  modules: readonly AssemblyModuleSpec<TModuleMetadata>[],
): AssemblyModuleSpec<TModuleMetadata>[] {
  return modules
    .filter((module) => checkAssemblyCompatibility(slot, module).compatible)
    .slice()
    .sort((first, second) => first.id.localeCompare(second.id));
}

function pickCompatibleModule<TSlotMetadata extends object, TModuleMetadata extends object>(
  slot: AssemblySlot<TSlotMetadata>,
  modules: readonly AssemblyModuleSpec<TModuleMetadata>[],
  seed: number,
): AssemblyModuleSpec<TModuleMetadata> {
  const candidates = listCompatibleModules(slot, modules);
  if (candidates.length === 0) throw new Error(`no compatible module for slot ${slot.id}`);
  const totalWeight = candidates.reduce((sum, module) => sum + Math.max(0, module.weight), 0);
  if (totalWeight <= 0) return candidates[stableSeed(seed, slot.id, "pick") % candidates.length]!;
  let cursor = (stableSeed(seed, slot.id, "pick") / 0x100000000) * totalWeight;
  for (const candidate of candidates) {
    cursor -= Math.max(0, candidate.weight);
    if (cursor < 0) return candidate;
  }
  return candidates[candidates.length - 1]!;
}

export function createAssemblyState<TSlotMetadata extends object, TModuleMetadata extends object>(
  options: CreateAssemblyOptions<TSlotMetadata, TModuleMetadata>,
): AssemblyState {
  assertUniqueIds(options.slots, "slot");
  assertUniqueIds(options.modules, "module");
  const moduleById = new Map(options.modules.map((module) => [module.id, module]));
  const placements = options.slots.map((slot) => {
    const requestedId = options.moduleBySlot?.[slot.id];
    const module = requestedId ? moduleById.get(requestedId) : pickCompatibleModule(slot, options.modules, options.seed);
    if (!module) throw new Error(`unknown module ${requestedId} for slot ${slot.id}`);
    const compatibility = checkAssemblyCompatibility(slot, module);
    if (!compatibility.compatible) throw new Error(compatibility.issues.map((issue) => issue.message).join("; "));
    return makePlacement(options.id, options.seed, slot.id, module.id);
  });
  return {
    version: 1,
    id: options.id,
    seed: options.seed >>> 0,
    revision: 0,
    placements,
  };
}

export function replaceAssemblyModule<TSlotMetadata extends object, TModuleMetadata extends object>(
  state: AssemblyState,
  slots: readonly AssemblySlot<TSlotMetadata>[],
  modules: readonly AssemblyModuleSpec<TModuleMetadata>[],
  slotId: string,
  moduleId: string,
): AssemblyEditResult {
  const slot = slots.find((candidate) => candidate.id === slotId);
  const module = modules.find((candidate) => candidate.id === moduleId);
  const before = state.placements.find((placement) => placement.slotId === slotId);
  if (!slot) throw new Error(`unknown slot ${slotId}`);
  if (!module) throw new Error(`unknown module ${moduleId}`);
  if (!before) throw new Error(`slot ${slotId} has no placement`);
  const compatibility = checkAssemblyCompatibility(slot, module);
  if (!compatibility.compatible) throw new Error(compatibility.issues.map((issue) => issue.message).join("; "));
  const after = makePlacement(state.id, state.seed, slotId, moduleId);
  const command: AssemblyReplaceCommand = {
    id: `${state.id}:replace:${state.revision + 1}:${stableSeed(state.seed, slotId, moduleId).toString(16)}`,
    type: "replace-module",
    slotId,
    before: clonePlacement(before),
    after,
  };
  return {
    state: replacePlacement(state, after),
    command,
    invalidatedSlotIds: [slotId],
  };
}

export function createAssemblyHistory(state: AssemblyState): AssemblyHistory {
  return { state, past: [], future: [] };
}

export function executeAssemblyReplacement<TSlotMetadata extends object, TModuleMetadata extends object>(
  history: AssemblyHistory,
  slots: readonly AssemblySlot<TSlotMetadata>[],
  modules: readonly AssemblyModuleSpec<TModuleMetadata>[],
  slotId: string,
  moduleId: string,
): AssemblyHistory {
  const edit = replaceAssemblyModule(history.state, slots, modules, slotId, moduleId);
  return {
    state: edit.state,
    past: [...history.past, edit.command],
    future: [],
  };
}

export function undoAssembly(history: AssemblyHistory): AssemblyHistory {
  const command = history.past[history.past.length - 1];
  if (!command) return history;
  return {
    state: replacePlacement(history.state, command.before),
    past: history.past.slice(0, -1),
    future: [command, ...history.future],
  };
}

export function redoAssembly(history: AssemblyHistory): AssemblyHistory {
  const command = history.future[0];
  if (!command) return history;
  return {
    state: replacePlacement(history.state, command.after),
    past: [...history.past, command],
    future: history.future.slice(1),
  };
}

export function validateAssemblyState<TSlotMetadata extends object, TModuleMetadata extends object>(
  state: AssemblyState,
  slots: readonly AssemblySlot<TSlotMetadata>[],
  modules: readonly AssemblyModuleSpec<TModuleMetadata>[],
): string[] {
  const errors: string[] = [];
  if (state.version !== 1) errors.push(`unsupported assembly version ${state.version}`);
  if (!state.id.trim()) errors.push("assembly id must not be empty");
  if (!Number.isInteger(state.seed) || state.seed < 0) errors.push("assembly seed must be a non-negative integer");
  if (!Number.isInteger(state.revision) || state.revision < 0) errors.push("assembly revision must be a non-negative integer");
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  const moduleById = new Map(modules.map((module) => [module.id, module]));
  const placedSlots = new Set<string>();
  for (const placement of state.placements) {
    if (placedSlots.has(placement.slotId)) errors.push(`duplicate placement for slot ${placement.slotId}`);
    placedSlots.add(placement.slotId);
    const slot = slotById.get(placement.slotId);
    const module = moduleById.get(placement.moduleId);
    if (!slot) errors.push(`unknown slot ${placement.slotId}`);
    if (!module) errors.push(`unknown module ${placement.moduleId}`);
    if (slot && module) {
      errors.push(...checkAssemblyCompatibility(slot, module).issues.map((issue) => issue.message));
    }
    if (!placement.instanceId.trim()) errors.push(`placement ${placement.slotId} has empty instance id`);
    if (!Number.isInteger(placement.variantSeed) || placement.variantSeed < 0) {
      errors.push(`placement ${placement.slotId} has invalid variant seed`);
    }
  }
  for (const slot of slots) {
    if (!placedSlots.has(slot.id)) errors.push(`slot ${slot.id} has no placement`);
  }
  return errors;
}

export function serializeAssemblyState(state: AssemblyState, pretty = false): string {
  const canonical: AssemblyState = {
    ...state,
    placements: state.placements.slice().sort((first, second) => first.slotId.localeCompare(second.slotId)),
  };
  return JSON.stringify(canonical, null, pretty ? 2 : undefined);
}

export function deserializeAssemblyState<TSlotMetadata extends object, TModuleMetadata extends object>(
  serialized: string,
  slots: readonly AssemblySlot<TSlotMetadata>[],
  modules: readonly AssemblyModuleSpec<TModuleMetadata>[],
): AssemblyState {
  const value: unknown = JSON.parse(serialized);
  if (!value || typeof value !== "object") throw new Error("assembly state must be an object");
  const raw = value as Partial<AssemblyState>;
  if (!Array.isArray(raw.placements)) throw new Error("assembly placements must be an array");
  const state: AssemblyState = {
    version: raw.version as 1,
    id: String(raw.id ?? ""),
    seed: Number(raw.seed),
    revision: Number(raw.revision),
    placements: raw.placements.map((placement) => ({
      instanceId: String(placement.instanceId ?? ""),
      slotId: String(placement.slotId ?? ""),
      moduleId: String(placement.moduleId ?? ""),
      variantSeed: Number(placement.variantSeed),
    })),
  };
  const errors = validateAssemblyState(state, slots, modules);
  if (errors.length > 0) throw new Error(`invalid assembly state: ${errors.join("; ")}`);
  return state;
}
