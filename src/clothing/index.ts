/**
 * Clothing module barrel.
 *
 * Procedural garment generation inspired by Marvelous Designer's pattern->seam
 * ->drape pipeline (see doc/marvelous-designer-clothing-study.html), rebuilt
 * from public concepts. Pipeline stages:
 *   avatar.ts   — parametric measurement/collision body (M3)
 *   pattern.ts  — 2D panels + bezier edges + triangulation (M1)
 *   seam.ts     — seam graph linking panel edges + validation (M2)
 *   drape.ts    — heuristic body-conforming cloth shells (M4 stages A/B)
 *   fabric.ts   — fabric physical+visual presets, drape tuning (M5)
 *   xpbd.ts     — XPBD cloth solver: settle shells into real folds (M7)
 *   garment-agent.ts — VLM classify + text heuristic + param optimizer (M6)
 *   templates.ts— T-shirt / skirt / pants / dress / hoodie builders
 *   body.ts     — renderable skin body mesh from the same avatar
 *   character.ts— body + garments generated together from one set of measures
 */
export * from "./avatar.js";
export * from "./pattern.js";
export * from "./seam.js";
export * from "./drape.js";
export * from "./fabric.js";
export * from "./xpbd.js";
export * from "./garment-agent.js";
export * from "./templates.js";
export * from "./body.js";
export * from "./character.js";
