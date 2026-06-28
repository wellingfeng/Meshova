import type { NamedPart } from "../geometry/index.js";
import {
  buildQuadrupedParts,
  REFERENCE_DOG_DEFAULTS,
  REFERENCE_DOG_PRESET,
  scoreQuadrupedAnatomy,
  type QuadrupedAnatomyScore,
  type QuadrupedBuildParams,
} from "./quadruped.js";

export type ReferenceDogParams = QuadrupedBuildParams;
export const REFERENCE_DOG_PARAMS: ReferenceDogParams = REFERENCE_DOG_DEFAULTS;
export type DogAnatomyScore = QuadrupedAnatomyScore;

export function buildReferenceDogParts(params: Partial<ReferenceDogParams> = {}): NamedPart[] {
  return buildQuadrupedParts(REFERENCE_DOG_PRESET, params);
}

export function scoreDogAnatomy(parts: NamedPart[]): DogAnatomyScore {
  return scoreQuadrupedAnatomy(parts, REFERENCE_DOG_PRESET);
}
