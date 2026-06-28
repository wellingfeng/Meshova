/**
 * Vision module (P7): image-target pipeline. Decode a reference photo, extract
 * shape/color signals, score a render against it, and classify surface
 * material — the building blocks for "image -> procedural model" without ever
 * baking the photo into a mesh or texture.
 */
export * from "./raster.js";
export * from "./png.js";
export * from "./silhouette.js";
export * from "./color.js";
export * from "./material.js";
export * from "./loss.js";
export * from "./multiview.js";
export * from "./solidity.js";
export * from "./turntable.js";
export * from "./canonicalize.js";
