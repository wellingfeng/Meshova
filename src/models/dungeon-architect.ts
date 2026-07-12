import {
  CRYPT_DUNGEON_THEME,
  GRID_DUNGEON_DEFAULTS,
  STONE_DUNGEON_THEME,
  TECH_DUNGEON_THEME,
  buildGridDungeon,
  type BuiltGridDungeon,
  type GridDungeonConfig,
} from "../dungeon/index.js";
import type { NamedPart } from "../geometry/index.js";

export type DungeonArchitectTheme = "stone" | "crypt" | "tech";

export interface DungeonArchitectParams extends GridDungeonConfig {
  readonly theme: DungeonArchitectTheme;
}

export const DUNGEON_ARCHITECT_DEFAULTS: DungeonArchitectParams = {
  ...GRID_DUNGEON_DEFAULTS,
  theme: "stone",
};

export function buildDungeonArchitect(
  params: Partial<DungeonArchitectParams> = {},
): BuiltGridDungeon {
  const resolved = { ...DUNGEON_ARCHITECT_DEFAULTS, ...params };
  const config: GridDungeonConfig = {
    width: resolved.width,
    depth: resolved.depth,
    roomCount: resolved.roomCount,
    minRoomSize: resolved.minRoomSize,
    maxRoomSize: resolved.maxRoomSize,
    roomPadding: resolved.roomPadding,
    loopChance: resolved.loopChance,
    tileSize: resolved.tileSize,
    floorThickness: resolved.floorThickness,
    wallHeight: resolved.wallHeight,
    wallThickness: resolved.wallThickness,
    seed: resolved.seed,
  };
  const theme = resolved.theme === "crypt"
    ? CRYPT_DUNGEON_THEME
    : resolved.theme === "tech"
      ? TECH_DUNGEON_THEME
      : STONE_DUNGEON_THEME;
  return buildGridDungeon(config, theme);
}

export function buildDungeonArchitectParts(
  params: Partial<DungeonArchitectParams> = {},
): NamedPart[] {
  return buildDungeonArchitect(params).parts;
}
