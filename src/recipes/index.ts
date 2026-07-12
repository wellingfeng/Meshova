import type { NamedPart } from "../geometry/index.js";

export * from "./workflow.js";

export interface NumericRecipeParam<K extends string = string> {
  readonly key: K;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly default: number;
}

export type RecipeParamSchema<P extends object> = readonly NumericRecipeParam<Extract<keyof P, string>>[];

export interface Recipe<P extends object> {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly params: RecipeParamSchema<P>;
  readonly defaults: P;
  build(params?: Partial<P>): NamedPart[];
}

export function recipeDefaults<P extends object>(recipe: Recipe<P>): P {
  const out: Record<string, number> = {};
  for (const spec of recipe.params) out[spec.key] = spec.default;
  return { ...recipe.defaults, ...out } as P;
}
