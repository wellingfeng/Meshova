/**
 * P7 Vegetation — procedural trees, shrubs, grass, conifers, and palms.
 *
 * A SpeedTree-style generator ported onto Meshova's spline + sweep + scatter
 * kernel: branches are recursive splines seeded by golden-angle phyllotaxis,
 * leaves are oriented cards or fronds, and one parameter set spans every plant
 * form. Fully deterministic (seeded), no Math.random / Date.now.
 */
export * from "./curve-frame.js";
export * from "./curve-param.js";
export * from "./envelope.js";
export * from "./branch.js";
export * from "./leaf.js";
export * from "./frond.js";
export * from "./feature.js";
export * from "./wind.js";
export * from "./imposter.js";
export * from "./plant.js";
export * from "./species.js";
export * from "./lod.js";
export * from "./export-profile.js";
export * from "./guide.js";
export * from "./library.js";
