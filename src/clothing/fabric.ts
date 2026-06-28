/**
 * Fabric system (M5 — Fabric Presets).
 *
 * One fabric = two coupled layers bound by a single preset name:
 *   - FabricPhysical: how the cloth deforms (stretch / bend / density / ...),
 *     consumed by the heuristic drape today and the XPBD solver (M7) later.
 *   - FabricVisual: how the cloth looks (surface library type + PBR params),
 *     consumed by the viewer/exporter.
 *
 * The research策略: pick a类别-correct preset (denim looks/behaves like denim),
 * never pixel-match. Stiff fabrics (denim/leather) bend less and wrinkle in big
 * folds; soft fabrics (silk/jersey) bend easily and drape into many small folds.
 *
 * Physical params are normalized 0..1 so drape/solver scale them uniformly.
 * Deterministic: pure data + pure derivations.
 */

type RGB = [number, number, number];

/** How a fabric deforms. All 0..1 unless noted. */
export interface FabricPhysical {
  /** Resistance to in-plane stretch (1 = inextensible canvas, 0 = lycra). */
  stretchStiffness: number;
  /** Resistance to bending (1 = stiff leather/denim, 0 = limp silk). */
  bendStiffness: number;
  /** Shear resistance (diagonal). */
  shearStiffness: number;
  /** Mass per area; heavier fabrics hang straighter and flare less. */
  density: number;
  /** Velocity damping in the solver (higher = calmer cloth). */
  damping: number;
}

/** How a fabric looks: maps onto the existing surface library. */
export interface FabricVisual {
  surface: string;
  color: RGB;
  params: Record<string, unknown>;
}

/** A named fabric: physical + visual, kept matched. */
export interface Fabric {
  id: string;
  label: string;
  physical: FabricPhysical;
  visual: FabricVisual;
}

function mk(
  id: string,
  label: string,
  physical: FabricPhysical,
  surface: string,
  color: RGB,
  params: Record<string, unknown> = {},
): Fabric {
  return { id, label, physical, visual: { surface, color, params: { color, ...params } } };
}

/** Built-in fabric library. Keys match the template `fabric` param strings. */
export const FABRIC_LIBRARY: Record<string, Fabric> = {
  cottonJersey: mk(
    "cottonJersey", "棉质针织",
    { stretchStiffness: 0.45, bendStiffness: 0.25, shearStiffness: 0.4, density: 0.45, damping: 0.12 },
    "fabric", [0.85, 0.85, 0.86], { roughness: 0.85 },
  ),
  denim: mk(
    "denim", "牛仔",
    { stretchStiffness: 0.85, bendStiffness: 0.72, shearStiffness: 0.8, density: 0.78, damping: 0.18 },
    "fabric", [0.22, 0.32, 0.5], { roughness: 0.8 },
  ),
  wool: mk(
    "wool", "羊毛",
    { stretchStiffness: 0.55, bendStiffness: 0.5, shearStiffness: 0.55, density: 0.62, damping: 0.2 },
    "fabric", [0.4, 0.4, 0.44], { roughness: 0.92 },
  ),
  leather: mk(
    "leather", "皮革",
    { stretchStiffness: 0.92, bendStiffness: 0.85, shearStiffness: 0.88, density: 0.85, damping: 0.22 },
    "leather", [0.12, 0.1, 0.09], { roughness: 0.6, grainScale: 90, grainStrength: 0.25, normalStrength: 0.4 },
  ),
  silk: mk(
    "silk", "丝绸",
    { stretchStiffness: 0.4, bendStiffness: 0.12, shearStiffness: 0.3, density: 0.3, damping: 0.08 },
    "fabric", [0.7, 0.2, 0.32], { roughness: 0.32 },
  ),
  linen: mk(
    "linen", "亚麻",
    { stretchStiffness: 0.6, bendStiffness: 0.42, shearStiffness: 0.5, density: 0.5, damping: 0.14 },
    "fabric", [0.78, 0.74, 0.62], { roughness: 0.88 },
  ),
};

/** Look up a fabric, falling back to cotton jersey. */
export function getFabric(id: string): Fabric {
  return FABRIC_LIBRARY[id] ?? FABRIC_LIBRARY.cottonJersey!;
}

/** All fabric ids (stable order for UI dropdowns / optimizer search). */
export const FABRIC_IDS = Object.keys(FABRIC_LIBRARY);

/**
 * Drape tuning derived from physical params so a fabric's look and motion stay
 * coupled to its stiffness without templates hand-tuning each one.
 */
export interface DrapeTuning {
  wrinkleAmount: number;
  wrinkleScale: number;
  flareGain: number;
}

export function drapeTuning(fabric: Fabric): DrapeTuning {
  const ph = fabric.physical;
  return {
    wrinkleAmount: 0.008 + (1 - ph.bendStiffness) * 0.02,
    wrinkleScale: 4 + (1 - ph.bendStiffness) * 6,
    flareGain: 0.6 + (1 - ph.density) * 0.6,
  };
}

