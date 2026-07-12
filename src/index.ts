/**
 * Meshova — Web procedural modeling + procedural PBR material library.
 *
 * Shared kernel: script-first DSL, deterministic RNG/noise, sandboxed
 * execution, headless screenshot loop, AI orchestration. Geometry first,
 * material reuses the kernel.
 *
 * Stage P0 (foundations) + P1 geometry core are implemented here: math,
 * deterministic random, noise, the sandbox loop-guard contract, and the
 * indexed-mesh geometry core with box/sphere/plane primitives and transforms.
 */
export * from "./math/index.js";
export * from "./random/index.js";
export * from "./sandbox/index.js";
export * from "./geometry/index.js";
export * from "./vegetation/index.js";
export * from "./field/index.js";
export * from "./texture/index.js";
export * from "./terrain/index.js";
export * from "./recipes/index.js";
export * from "./agent/index.js";
export * from "./critique/index.js";
export * from "./vision/index.js";
export * from "./pipeline/index.js";
export * from "./character/index.js";
export * from "./clothing/index.js";
export * from "./models/index.js";
export * from "./optimization/index.js";
export * from "./simulation/index.js";
export * from "./dungeon/index.js";

export const VERSION = "0.0.0";
