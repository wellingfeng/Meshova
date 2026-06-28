import type { NamedPart } from "../geometry/index.js";
import {
  buildQuadrupedParts,
  HORSE_QUADRUPED_DEFAULTS,
  HORSE_QUADRUPED_PRESET,
  scoreQuadrupedAnatomy,
  type QuadrupedAnatomyScore,
  type QuadrupedBuildParams,
} from "./quadruped.js";

export type MidnightHorseParams = QuadrupedBuildParams;
export const MIDNIGHT_HORSE_DEFAULTS: MidnightHorseParams = HORSE_QUADRUPED_DEFAULTS;
export type HorseAnatomyScore = QuadrupedAnatomyScore;

export function buildMidnightHorseParts(params: Partial<MidnightHorseParams> = {}): NamedPart[] {
  return buildQuadrupedParts(HORSE_QUADRUPED_PRESET, params);
}

export function scoreHorseAnatomy(parts: NamedPart[]): HorseAnatomyScore {
  return scoreQuadrupedAnatomy(parts, HORSE_QUADRUPED_PRESET);
}
