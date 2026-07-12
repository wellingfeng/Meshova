import { describe, expect, it } from "vitest";
import {
  POLY_HAVEN_PROP_MODELS,
  buildPolyHavenPropParts,
} from "../src/models/polyhaven-props.js";
import {
  bounds,
  merge,
  rayMesh,
  triangleCount,
} from "../src/geometry/index.js";
import { vec3 } from "../src/math/vec3.js";
import { meshMetrics } from "../src/critique/geometry-metrics.js";

function expectBottomHit(kind: "wicker-basket" | "watering-can" | "oil-can", partName: string): void {
  const target = buildPolyHavenPropParts({ kind }).find((part) => part.name === partName)!;
  const partBounds = bounds(target.mesh);
  const height = partBounds.max.y - partBounds.min.y;
  const centerX = (partBounds.min.x + partBounds.max.x) * 0.5;
  const centerZ = (partBounds.min.z + partBounds.max.z) * 0.5;
  const hit = rayMesh(
    target.mesh,
    vec3(centerX, partBounds.min.y - Math.max(height, 0.1), centerZ),
    vec3(0, 1, 0),
  );
  expect(hit).not.toBeNull();
  expect(hit!.position.y).toBeLessThanOrEqual(partBounds.min.y + height * 0.12);
}

describe("Poly Haven preview-based procedural props", () => {
  it("keeps every reference as a separate procedural definition", () => {
    expect(POLY_HAVEN_PROP_MODELS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(POLY_HAVEN_PROP_MODELS.map((model) => model.id)).size).toBe(POLY_HAVEN_PROP_MODELS.length);
    expect(new Set(POLY_HAVEN_PROP_MODELS.map((model) => model.sourceAssetId)).size).toBe(POLY_HAVEN_PROP_MODELS.length);
  });

  it.each(POLY_HAVEN_PROP_MODELS)("builds valid geometry for $name", (definition) => {
    const parts = buildPolyHavenPropParts(definition.defaults);
    const mesh = merge(...parts.map((part) => part.mesh));
    const modelBounds = bounds(mesh);

    expect(parts.length).toBeGreaterThan(0);
    expect(parts.every((part) => part.label && !/^component_|^root\./.test(part.label))).toBe(true);
    expect(parts.every((part) => part.metadata?.sourceMeshUsed === false)).toBe(true);
    expect(parts.every((part) => part.metadata?.sourceTexturesUsed === false)).toBe(true);
    expect(mesh.positions.length).toBeGreaterThan(20);
    expect(mesh.normals).toHaveLength(mesh.positions.length);
    expect(mesh.uvs).toHaveLength(mesh.positions.length);
    expect(mesh.indices.every((index) => index >= 0 && index < mesh.positions.length)).toBe(true);
    expect(triangleCount(mesh)).toBeGreaterThan(10);
    expect(modelBounds.max.x - modelBounds.min.x).toBeGreaterThan(definition.defaults.width * 0.85);
    expect(modelBounds.max.y - modelBounds.min.y).toBeGreaterThan(definition.defaults.height * 0.85);
  });

  it("is deterministic and responds to dimensions", () => {
    const a = buildPolyHavenPropParts({ kind: "wooden-chest", detail: 1 });
    const b = buildPolyHavenPropParts({ kind: "wooden-chest", detail: 1 });
    expect(a.map((part) => part.mesh.positions)).toEqual(b.map((part) => part.mesh.positions));

    const narrow = merge(...buildPolyHavenPropParts({ kind: "shelf", width: 0.7 }).map((part) => part.mesh));
    const wide = merge(...buildPolyHavenPropParts({ kind: "shelf", width: 1.5 }).map((part) => part.mesh));
    expect(bounds(wide).max.x - bounds(wide).min.x).toBeGreaterThan(bounds(narrow).max.x - bounds(narrow).min.x);
  });

  it("uses seed and structure controls for procedural variation", () => {
    const stumpA = buildPolyHavenPropParts({ kind: "tree-stump", seed: 7, structure: 7, variation: 1 });
    const stumpB = buildPolyHavenPropParts({ kind: "tree-stump", seed: 8, structure: 7, variation: 1 });
    expect(stumpA.map((part) => part.mesh.positions)).not.toEqual(stumpB.map((part) => part.mesh.positions));

    const sparse = merge(...buildPolyHavenPropParts({ kind: "stone-fire-pit", structure: 8 }).map((part) => part.mesh));
    const dense = merge(...buildPolyHavenPropParts({ kind: "stone-fire-pit", structure: 16 }).map((part) => part.mesh));
    expect(triangleCount(dense)).toBeGreaterThan(triangleCount(sparse));
  });

  it("keeps stump roots distinct from the central mound", () => {
    const roots = buildPolyHavenPropParts({ kind: "tree-stump", structure: 10 })
      .find((part) => part.name === "stump_roots")!;
    const rootBounds = bounds(roots.mesh);
    expect(rootBounds.max.x - rootBounds.min.x).toBeGreaterThan(1);
    expect(rootBounds.max.z - rootBounds.min.z).toBeGreaterThan(1);
    expect(rootBounds.max.y).toBeLessThan(0.3);
  });

  it("builds the utility box as a semantic sheet-metal assembly", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((model) => model.sourceAssetId === "utility_box_01");
    expect(definition).toBeDefined();

    const parts = buildPolyHavenPropParts(definition!.defaults);
    expect(parts.map((part) => part.name)).toEqual(expect.arrayContaining([
      "utility_cabinet",
      "utility_door",
      "utility_hardware",
      "utility_vents",
    ]));
    expect(parts.find((part) => part.name === "utility_door")?.label).toBe("配电箱检修门");
  });

  it("builds the boombox from reusable panel modules", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((model) => model.sourceAssetId === "boombox")!;
    const parts = buildPolyHavenPropParts(definition?.defaults);
    expect(definition).toBeDefined();
    expect(parts.map((part) => part.name)).toEqual(expect.arrayContaining([
      "boombox_chassis",
      "boombox_speakers",
      "boombox_cassette",
      "boombox_controls",
      "boombox_handle",
    ]));
  });

  it("builds the lantern as radial metal and glass layers", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((model) => model.sourceAssetId === "brass_diya_lantern")!;
    expect(definition).toBeDefined();
    const parts = buildPolyHavenPropParts(definition.defaults);
    expect(parts.map((part) => part.name)).toEqual(expect.arrayContaining([
      "lantern_brass_shell",
      "lantern_frame",
      "lantern_glass",
      "lantern_burner",
      "lantern_chain",
    ]));
    const glass = parts.find((part) => part.name === "lantern_glass")!;
    expect(glass.doubleSided).toBeUndefined();
    expect(meshMetrics(glass.mesh).watertight).toBe(true);
  });

  it("builds the flashlight with a lathed reflector stack", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((model) => model.sourceAssetId === "pastic_torch_6v")!;
    expect(definition).toBeDefined();
    const parts = buildPolyHavenPropParts(definition.defaults);
    expect(parts.map((part) => part.name)).toEqual(expect.arrayContaining([
      "flashlight_housing",
      "flashlight_reflector",
      "flashlight_lens",
      "flashlight_handle",
      "flashlight_grip_rings",
    ]));
  });

  it("builds the bench vice as a constrained sliding assembly", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((model) => model.sourceAssetId === "bench_vice_01")!;
    expect(definition).toBeDefined();
    const parts = buildPolyHavenPropParts(definition.defaults);
    expect(parts.map((part) => part.name)).toEqual(expect.arrayContaining([
      "vise_cast_body",
      "vise_jaws",
      "vise_lead_screw",
      "vise_tommy_bar",
    ]));
    expect(parts.find((part) => part.name === "vise_jaws")?.label).toBe("固定钳口与滑动钳口");
  });

  it("builds the watering can from a thin shell and swept spout", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((model) => model.sourceAssetId === "watering_can_metal_01")!;
    expect(definition).toBeDefined();
    const parts = buildPolyHavenPropParts(definition.defaults);
    expect(parts.map((part) => part.name)).toEqual(expect.arrayContaining([
      "watering_can_shell",
      "watering_can_spout",
      "watering_can_handle",
      "watering_can_hardware",
    ]));
    expect(parts.find((part) => part.name === "watering_can_spout")?.label).toContain("莲蓬头");
  });

  it("builds binoculars as a symmetric linked optical assembly", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((model) => model.sourceAssetId === "vintage_binocular")!;
    expect(definition).toBeDefined();
    const parts = buildPolyHavenPropParts(definition.defaults);
    expect(parts.map((part) => part.name)).toEqual(expect.arrayContaining([
      "binocular_barrels",
      "binocular_optics",
      "binocular_bridge",
      "binocular_focus",
      "binocular_grips",
    ]));
    expect(parts.find((part) => part.name === "binocular_bridge")?.label).toBe("望远镜中央联动铰桥");
  });

  it("builds the alarm clock with readable radial timekeeping layers", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((model) => model.sourceAssetId === "alarm_clock_01")!;
    expect(definition).toBeDefined();
    const parts = buildPolyHavenPropParts(definition.defaults);
    expect(parts.map((part) => part.name)).toEqual(expect.arrayContaining([
      "alarm_clock_case",
      "alarm_clock_dial",
      "alarm_clock_ticks",
      "alarm_clock_hands",
      "alarm_clock_bells",
      "alarm_clock_handle",
    ]));
    expect(parts.find((part) => part.name === "alarm_clock_ticks")?.label).toBe("闹钟径向小时刻度");
  });

  it("builds the megaphone as a thin horn and handheld control assembly", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((model) => model.sourceAssetId === "Megaphone_01")!;
    expect(definition).toBeDefined();
    const parts = buildPolyHavenPropParts(definition.defaults);
    expect(parts.map((part) => part.name)).toEqual(expect.arrayContaining([
      "megaphone_horn",
      "megaphone_rim",
      "megaphone_housing",
      "megaphone_handle",
      "megaphone_controls",
    ]));
    expect(parts.find((part) => part.name === "megaphone_horn")?.doubleSided).toBe(true);
  });

  it("builds the oil can with a curved spout and pump linkage", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((model) => model.sourceAssetId === "small_oil_can_01")!;
    expect(definition).toBeDefined();
    const parts = buildPolyHavenPropParts(definition.defaults);
    expect(parts.map((part) => part.name)).toEqual(expect.arrayContaining([
      "oil_can_body",
      "oil_can_spout",
      "oil_can_pump",
      "oil_can_handle",
    ]));
    expect(parts.find((part) => part.name === "oil_can_pump")?.label).toBe("油壶手压泵杆与联动支点");
  });

  it("builds the vintage hand drill as a geared crank mechanism", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((model) => model.sourceAssetId === "vintage_hand_drill")!;
    expect(definition).toBeDefined();
    const parts = buildPolyHavenPropParts(definition.defaults);
    expect(parts.map((part) => part.name)).toEqual(expect.arrayContaining([
      "hand_drill_frame",
      "hand_drill_drive_gear",
      "hand_drill_pinion_chuck",
      "hand_drill_crank",
      "hand_drill_grips",
    ]));
    expect(parts.find((part) => part.name === "hand_drill_drive_gear")?.label).toBe("手摇钻大齿轮与啮合齿圈");
  });

  it("builds the wheelchair as a tubular mirrored rolling assembly", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((model) => model.sourceAssetId === "wheelchair_01")!;
    expect(definition).toBeDefined();
    const parts = buildPolyHavenPropParts(definition.defaults);
    expect(parts.map((part) => part.name)).toEqual(expect.arrayContaining([
      "wheelchair_frame",
      "wheelchair_drive_wheels",
      "wheelchair_spokes",
      "wheelchair_casters",
      "wheelchair_seat",
      "wheelchair_footrests",
    ]));
    expect(parts.find((part) => part.name === "wheelchair_spokes")?.label).toBe("轮椅左右轮组径向辐条");
  });

  it("builds the wall hose reel with a deterministic coiled sweep", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((model) => model.sourceAssetId === "garden_hose_wall_mounted_01")!;
    expect(definition).toBeDefined();
    const parts = buildPolyHavenPropParts(definition.defaults);
    expect(parts.map((part) => part.name)).toEqual(expect.arrayContaining([
      "hose_reel_bracket",
      "hose_reel_drum",
      "hose_reel_coil",
      "hose_reel_crank",
      "hose_reel_nozzle",
    ]));
    expect(parts.find((part) => part.name === "hose_reel_coil")?.label).toBe("卷盘多层盘绕花园水管");
  });

  it("builds the drill press with an adjustable machine hierarchy", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((model) => model.sourceAssetId === "drill_press_01")!;
    expect(definition).toBeDefined();
    const parts = buildPolyHavenPropParts(definition.defaults);
    expect(parts.map((part) => part.name)).toEqual(expect.arrayContaining([
      "drill_press_base",
      "drill_press_column",
      "drill_press_head",
      "drill_press_spindle",
      "drill_press_table",
      "drill_press_controls",
    ]));
    const low = buildPolyHavenPropParts({ ...definition.defaults, variation: 0 });
    const high = buildPolyHavenPropParts({ ...definition.defaults, variation: 1 });
    expect(low.find((part) => part.name === "drill_press_table")?.mesh.positions)
      .not.toEqual(high.find((part) => part.name === "drill_press_table")?.mesh.positions);
  });

  it("builds the retro multimeter with an analog arc and test leads", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((model) => model.sourceAssetId === "retro_multimeter")!;
    expect(definition).toBeDefined();
    const parts = buildPolyHavenPropParts(definition.defaults);
    expect(parts.map((part) => part.name)).toEqual(expect.arrayContaining([
      "multimeter_housing",
      "multimeter_gauge",
      "multimeter_ticks",
      "multimeter_selector",
      "multimeter_leads",
    ]));
    expect(parts.find((part) => part.name === "multimeter_ticks")?.label).toBe("万用表多量程弧形刻度与指针");
  });

  it("builds the portable generator as a protected engine assembly", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((model) => model.sourceAssetId === "portable_generator")!;
    expect(definition).toBeDefined();
    const parts = buildPolyHavenPropParts(definition.defaults);
    expect(parts.map((part) => part.name)).toEqual(expect.arrayContaining([
      "generator_frame",
      "generator_fuel_tank",
      "generator_engine",
      "generator_alternator",
      "generator_controls",
      "generator_exhaust",
    ]));
    expect(parts.find((part) => part.name === "generator_frame")?.label).toBe("发电机防撞管架与底部横梁");
  });

  it("builds the overhead crane as a constrained lifting system", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((model) => model.sourceAssetId === "overhead_crane")!;
    expect(definition).toBeDefined();
    const parts = buildPolyHavenPropParts(definition.defaults);
    expect(parts.map((part) => part.name)).toEqual(expect.arrayContaining([
      "overhead_crane_supports",
      "overhead_crane_bridge",
      "overhead_crane_trolley",
      "overhead_crane_hoist",
      "overhead_crane_hook",
    ]));
    const near = buildPolyHavenPropParts({ ...definition.defaults, variation: 0 });
    const far = buildPolyHavenPropParts({ ...definition.defaults, variation: 1 });
    expect(near.find((part) => part.name === "overhead_crane_trolley")?.mesh.positions)
      .not.toEqual(far.find((part) => part.name === "overhead_crane_trolley")?.mesh.positions);
  });

  it("builds the vintage microscope as an adjustable optical assembly", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((model) => model.sourceAssetId === "vintage_microscope")!;
    expect(definition).toBeDefined();
    const parts = buildPolyHavenPropParts(definition.defaults);
    expect(parts.map((part) => part.name)).toEqual(expect.arrayContaining([
      "microscope_base",
      "microscope_arm",
      "microscope_stage",
      "microscope_head",
      "microscope_objectives",
      "microscope_focus",
    ]));
    const low = buildPolyHavenPropParts({ ...definition.defaults, variation: 0 });
    const high = buildPolyHavenPropParts({ ...definition.defaults, variation: 1 });
    expect(low.find((part) => part.name === "microscope_stage")?.mesh.positions)
      .not.toEqual(high.find((part) => part.name === "microscope_stage")?.mesh.positions);
  });

  it("builds the 8mm projector with coupled reels and a visible film path", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((model) => model.sourceAssetId === "filmstrip_projector_8mm")!;
    expect(definition).toBeDefined();
    const parts = buildPolyHavenPropParts(definition.defaults);
    expect(parts.map((part) => part.name)).toEqual(expect.arrayContaining([
      "projector_body",
      "projector_reels",
      "projector_film_gate",
      "projector_lens",
      "projector_controls",
      "projector_power_cable",
    ]));
    expect(parts.find((part) => part.name === "projector_film_gate")?.label).toContain("胶片导向路径");
  });

  it("builds modular electricity poles with insulators and sagging conductors", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((model) => model.sourceAssetId === "modular_electricity_poles")!;
    expect(definition).toBeDefined();
    const parts = buildPolyHavenPropParts(definition.defaults);
    expect(parts.map((part) => part.name)).toEqual(expect.arrayContaining([
      "power_pole_posts",
      "power_pole_crossarms",
      "power_pole_insulators",
      "power_pole_wires",
      "power_pole_hardware",
    ]));
    const taut = buildPolyHavenPropParts({ ...definition.defaults, variation: 0 });
    const slack = buildPolyHavenPropParts({ ...definition.defaults, variation: 1 });
    expect(taut.find((part) => part.name === "power_pole_wires")?.mesh.positions)
      .not.toEqual(slack.find((part) => part.name === "power_pole_wires")?.mesh.positions);
  });

  it("builds the spinning wheel as a treadle-driven belt mechanism", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((model) => model.sourceAssetId === "spinning_wheel_01")!;
    expect(definition).toBeDefined();
    const parts = buildPolyHavenPropParts(definition.defaults);
    expect(parts.map((part) => part.name)).toEqual(expect.arrayContaining([
      "spinning_wheel_frame",
      "spinning_wheel_drive_wheel",
      "spinning_wheel_spokes",
      "spinning_wheel_belt",
      "spinning_wheel_flyer",
      "spinning_wheel_treadle",
    ]));
    const up = buildPolyHavenPropParts({ ...definition.defaults, variation: 0 });
    const down = buildPolyHavenPropParts({ ...definition.defaults, variation: 1 });
    expect(up.find((part) => part.name === "spinning_wheel_treadle")?.mesh.positions)
      .not.toEqual(down.find((part) => part.name === "spinning_wheel_treadle")?.mesh.positions);
  });

  it("builds the exterior aircon unit with fans and scalable heat-exchanger fins", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((model) => model.sourceAssetId === "exterior_aircon_unit")!;
    expect(definition).toBeDefined();
    const parts = buildPolyHavenPropParts(definition.defaults);
    expect(parts.map((part) => part.name)).toEqual(expect.arrayContaining([
      "aircon_cabinet",
      "aircon_fan_grille",
      "aircon_fan_blades",
      "aircon_condenser_fins",
      "aircon_service_lines",
      "aircon_feet",
    ]));
    const sparse = buildPolyHavenPropParts({ ...definition.defaults, structure: 6 });
    const dense = buildPolyHavenPropParts({ ...definition.defaults, structure: 20 });
    expect(triangleCount(dense.find((part) => part.name === "aircon_condenser_fins")!.mesh))
      .toBeGreaterThan(triangleCount(sparse.find((part) => part.name === "aircon_condenser_fins")!.mesh));
  });

  it("builds the No.4 hand plane with an adjustable angled iron", () => {
    const definition = POLY_HAVEN_PROP_MODELS.find((model) => model.sourceAssetId === "hand_plane_no4")!;
    expect(definition).toBeDefined();
    const parts = buildPolyHavenPropParts(definition.defaults);
    expect(parts.map((part) => part.name)).toEqual(expect.arrayContaining([
      "hand_plane_body",
      "hand_plane_sole",
      "hand_plane_blade",
      "hand_plane_handles",
      "hand_plane_adjuster",
      "hand_plane_mouth",
    ]));
    const shallow = buildPolyHavenPropParts({ ...definition.defaults, variation: 0 });
    const deep = buildPolyHavenPropParts({ ...definition.defaults, variation: 1 });
    expect(shallow.find((part) => part.name === "hand_plane_blade")?.mesh.positions)
      .not.toEqual(deep.find((part) => part.name === "hand_plane_blade")?.mesh.positions);
  });

  it("builds five hand-tool variants through one semantic contract", () => {
    const sourceIds = ["adjustable_wrench", "pliers", "flathead_screwdriver", "cross_pein_hammer", "hatchet"];
    const definitions = sourceIds.map((sourceAssetId) => POLY_HAVEN_PROP_MODELS.find((model) => model.sourceAssetId === sourceAssetId));
    expect(definitions.every(Boolean)).toBe(true);

    for (const definition of definitions) {
      const parts = buildPolyHavenPropParts(definition!.defaults);
      expect(parts.map((part) => part.name)).toEqual(expect.arrayContaining(["hand_tool_handle", "hand_tool_head"]));
      expect(parts.every((part) => part.label.startsWith("手工具"))).toBe(true);
    }
    expect(new Set(definitions.map((definition) => definition!.kind)).size).toBe(5);
  });

  it("reuses shared generators for the new procedural families", () => {
    const pipes = buildPolyHavenPropParts({ kind: "industrial-pipes" });
    expect(pipes.map((part) => part.name)).toEqual(expect.arrayContaining([
      "industrial_pipe_runs",
      "industrial_pipe_flanges",
      "industrial_pipe_valve",
    ]));

    const arch = buildPolyHavenPropParts({ kind: "ruined-fort-arch", damage: 0.8 });
    expect(arch.map((part) => part.name)).toContain("fort_arch_rubble");

    const deadwood = buildPolyHavenPropParts({ kind: "deadwood", seed: 23 });
    expect(deadwood.map((part) => part.name)).toContain("deadwood_branches");

    const firePit = buildPolyHavenPropParts({ kind: "stone-fire-pit", detail: 1 });
    expect(firePit.map((part) => part.name)).toEqual(expect.arrayContaining([
      "firepit_firewood",
      "firepit_cut_faces",
    ]));

    const hydrant = buildPolyHavenPropParts({ kind: "fire-hydrant", detail: 1 });
    expect(hydrant.map((part) => part.name)).toContain("hydrant_chain");
  });

  it("builds basket, watering can, and vise as semantic procedural assemblies", () => {
    const basket = buildPolyHavenPropParts({ kind: "wicker-basket", structure: 18 });
    expect(basket.map((part) => part.name)).toEqual(expect.arrayContaining([
      "basket_radial_stakes",
      "basket_over_under_weave",
      "basket_woven_base",
      "basket_braided_rim",
    ]));

    const wateringCan = buildPolyHavenPropParts({ kind: "watering-can" });
    expect(wateringCan.map((part) => part.name)).toEqual(expect.arrayContaining([
      "watering_can_shell",
      "watering_can_spout",
      "watering_can_handle",
    ]));

    const closedVise = buildPolyHavenPropParts({ kind: "bench-vise", variation: 0 });
    const openVise = buildPolyHavenPropParts({ kind: "bench-vise", variation: 1 });
    expect(closedVise.map((part) => part.name)).toEqual(expect.arrayContaining([
      "vise_cast_body",
      "vise_jaws",
      "vise_lead_screw",
      "vise_tommy_bar",
    ]));
    expect(closedVise.map((part) => part.mesh.positions)).not.toEqual(openVise.map((part) => part.mesh.positions));
  });

  it("keeps procedural container bottoms closed", () => {
    expectBottomHit("wicker-basket", "basket_woven_base");
    expectBottomHit("watering-can", "watering_can_shell");
    expectBottomHit("oil-can", "oil_can_body");
  });

  it("damage controls ruin geometry deterministically", () => {
    const intact = buildPolyHavenPropParts({ kind: "ruined-fort-arch", damage: 0 });
    const damagedA = buildPolyHavenPropParts({ kind: "ruined-fort-arch", damage: 0.85, seed: 12 });
    const damagedB = buildPolyHavenPropParts({ kind: "ruined-fort-arch", damage: 0.85, seed: 12 });
    expect(damagedA.map((part) => part.mesh.positions)).toEqual(damagedB.map((part) => part.mesh.positions));
    expect(triangleCount(merge(...damagedA.map((part) => part.mesh))))
      .not.toBe(triangleCount(merge(...intact.map((part) => part.mesh))));
  });
});
