/**
 * Critique — the mesh review layer. A/C-tier deterministic geometry & rubric
 * checks, plus optional VLM aesthetic/realism folding, producing an actionable,
 * part-located report that closes back into the agent loop.
 */
export * from "./geometry-metrics.js";
export * from "./rubric.js";
export * from "./critic.js";
export * from "./vlm-critic.js";
