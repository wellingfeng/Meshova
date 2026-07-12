export const HIDDEN_GALLERY_MODEL_IDS = new Set([
  "sphere",
  "rock",
  "tower",
  "pagoda",
  "mushroom",
  "gear",
  "officechair",
  "dragonfly",
  "midnight-horse",
  "reference-dog",
  "cartoon-mech-pilot",
  "stylized-humanoid",
  "tshirt",
  "skirt",
  "pants",
  "dress",
  "hoodie",
  "smooth",
  "spring",
  "meadow",
  "csg",
  "fterrain",
  "wineglass",
  "blender-howtos",
  "houdini-howtos",
]);

export function isGalleryModelVisible(id) {
  return !HIDDEN_GALLERY_MODEL_IDS.has(id);
}
