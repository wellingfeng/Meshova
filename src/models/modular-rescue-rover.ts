import type { NamedPart } from "../geometry/index.js";
import {
  buildModularVehicle,
  type ModularVehicleBuild,
  type ModularVehicleParams,
} from "./vehicle-assembly.js";

export const MODULAR_RESCUE_ROVER_DEFAULTS = {
  style: "suv",
  length: 5.4,
  width: 2.08,
  height: 1.92,
  wheelBase: 3.25,
  wheelRadius: 0.44,
  wheelWidth: 0.29,
  rideHeight: 0.25,
  cabinPosition: -0.08,
  roofRoundness: 0.28,
  hoodSlope: 0.36,
  detail: 1,
  seed: 73,
  engineModuleId: "engine-performance",
  cabinModuleId: "cabin-crew",
  rearModuleId: "rear-rescue-command",
} as const satisfies ModularVehicleParams;

export type ModularRescueRoverParams = Omit<ModularVehicleParams, "style" | "rearModuleId">;

export function buildModularRescueRover(params: ModularRescueRoverParams = {}): ModularVehicleBuild {
  return buildModularVehicle({
    ...MODULAR_RESCUE_ROVER_DEFAULTS,
    ...params,
    style: "suv",
    rearModuleId: "rear-rescue-command",
  });
}

export function buildModularRescueRoverParts(params: ModularRescueRoverParams = {}): NamedPart[] {
  return buildModularRescueRover(params).parts;
}
