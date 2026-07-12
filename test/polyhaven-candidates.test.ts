import { describe, expect, it } from "vitest";
import {
  extractReplicatedAssetIds,
  proceduralFamily,
  selectPolyHavenCandidates,
  takeDiverseCandidates,
} from "../scripts/polyhaven-candidates.mjs";

function asset(
  name: string,
  category: string,
  tags: string[],
  polycount = 4000,
) {
  return {
    name,
    category,
    tags,
    polycount,
    dimensions: [200, 300, 400],
    thumbnail_url: `https://example.com/${name}.png`,
    attributes: { material: ["metal"], condition: "worn" },
  };
}

describe("Poly Haven procedural candidate selection", () => {
  it("removes replicated assets, covered families, and organic scans", () => {
    const result = selectPolyHavenCandidates({
      Barrel_01: asset("Barrel 01", "Containers/Barrels", ["barrel"]),
      school_chair: asset("School Chair", "Furniture/Seating/Chairs", ["chair"]),
      mossy_rock: asset("Mossy Rock", "Nature/Rocks", ["rock", "moss"]),
      adjustable_wrench: asset("Adjustable Wrench", "Tools/Hand Tools", ["wrench", "metal"]),
    }, {
      replicatedAssetIds: new Set(["Barrel_01"]),
      representedFamilies: new Set(["chair"]),
    });

    expect(result.candidates.map((candidate) => candidate.id)).toEqual(["adjustable_wrench"]);
    expect(result.excluded).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "Barrel_01", reason: "already-replicated" }),
      expect.objectContaining({ id: "school_chair", reason: "family-already-covered" }),
      expect.objectContaining({ id: "mossy_rock", reason: "non-procedural-organic" }),
    ]));
  });

  it("extracts replicated source asset ids from model definitions", () => {
    const source = `
      { sourceAssetId: "Barrel_01", sourceName: "Barrel 01" },
      { sourceAssetId: "fire_hydrant", sourceName: "Fire Hydrant" },
      { sourceAssetId: "Barrel_01", sourceName: "Duplicate" }
    `;

    expect([...extractReplicatedAssetIds(source)]).toEqual(["Barrel_01", "fire_hydrant"]);
  });

  it("classifies by primary identity and caps repeated families", () => {
    const pliers = asset("Tongue & Groove Pliers", "Tools/Hand Tools/Pliers", ["adjustable wrench"]);
    expect(proceduralFamily("tongue_groove_pliers", pliers)).toBe("pliers");

    const ranked = [
      { id: "wrench-a", proceduralFamily: "wrench" },
      { id: "wrench-b", proceduralFamily: "wrench" },
      { id: "wrench-c", proceduralFamily: "wrench" },
      { id: "vice-a", proceduralFamily: "vice" },
    ];
    expect(takeDiverseCandidates(ranked, 4, 2).map((candidate) => candidate.id)).toEqual([
      "wrench-a",
      "wrench-b",
      "vice-a",
    ]);
  });

  it("does not infer asset identity from incidental tags", () => {
    expect(proceduralFamily(
      "gate_latch_01",
      asset("Gate Latch 01", "Architecture/Gates/Gate Hardware", ["fence"]),
    )).toBe("other");
    expect(proceduralFamily(
      "lateral_sea_marker",
      asset("Lateral Sea Marker", "Vehicles & Transport/Watercraft/Buoys", ["dock"]),
    )).toBe("other");
  });

  it("ranks equally suitable assets by demand", () => {
    const popular = { ...asset("Popular Measuring Tape", "Tools & Equipment/Measuring Tools", ["measure"]), download_count: 1000 };
    const obscure = { ...asset("Obscure Measuring Tape", "Tools & Equipment/Measuring Tools", ["measure"]), download_count: 10 };
    const result = selectPolyHavenCandidates(
      { obscure_measuring_tape: obscure, popular_measuring_tape: popular },
      { representedFamilies: new Set() },
    );

    expect(result.candidates.map((candidate) => candidate.id)).toEqual(["popular_measuring_tape", "obscure_measuring_tape"]);
  });

  it("filters pipe kits after the shared industrial-pipe generator exists", () => {
    const result = selectPolyHavenCandidates({
      modular_pipes: asset("Modular Pipes", "Industrial & Infrastructure/Pipes & Ducts/Modular Pipes", ["pipe", "metal"]),
    });

    expect(result.candidates).toEqual([]);
    expect(result.excluded).toEqual([
      expect.objectContaining({
        id: "modular_pipes",
        reason: "family-already-covered",
        family: "industrial-pipes",
      }),
    ]);
  });

  it("filters all represented Poly Haven prop families", () => {
    const result = selectPolyHavenCandidates({
      wicker_basket_02: asset("Wicker Basket 02", "Containers", ["wicker"]),
      watering_can_metal_02: asset("Watering Can Metal 02", "Tools", ["garden"]),
      bench_vise_02: asset("Bench Vise 02", "Tools", ["workshop"]),
      utility_box_02: asset("Utility Box 02", "Industrial & Infrastructure/Electrical", ["power"]),
      signal_flashlight: asset("Signal Flashlight", "Lighting/Portable", ["torch"]),
      vintage_binocular_02: asset("Vintage Binocular 02", "Tools", ["optics"]),
      vintage_oil_lamp: asset("Vintage Oil Lamp", "Lighting/Portable", ["brass"]),
      vintage_hand_drill_02: asset("Vintage Hand Drill 02", "Tools", ["crank"]),
      wheelchair_02: asset("Wheelchair 02", "Props", ["medical"]),
      garden_hose_reel_02: asset("Garden Hose Reel 02", "Tools/Garden", ["irrigation"]),
      drill_press_02: asset("Drill Press 02", "Tools/Industrial", ["workshop"]),
      analog_multimeter_02: asset("Analog Multimeter 02", "Electronics", ["instrument"]),
      portable_generator_02: asset("Portable Generator 02", "Industrial", ["engine"]),
    });

    expect(result.candidates).toEqual([]);
    expect(result.excluded.map((entry) => entry.family)).toEqual(expect.arrayContaining([
      "wicker-basket",
      "watering-can",
      "vice",
      "utility-box",
      "flashlight",
      "binoculars",
      "lantern",
      "hand-drill",
      "wheelchair",
      "hose-reel",
      "drill-press",
      "multimeter",
      "portable-generator",
    ]));
  });

  it("filters the mechanism and infrastructure families added in the latest batch", () => {
    const result = selectPolyHavenCandidates({
      workshop_bridge_crane: asset("Workshop Bridge Crane", "Industrial", ["lifting"]),
      laboratory_microscope: asset("Laboratory Microscope", "Electronics", ["optics"]),
      home_movie_projector: asset("Home Movie Projector", "Electronics", ["film"]),
      wooden_power_pole: asset("Wooden Power Pole", "Infrastructure", ["electricity"]),
      antique_spinning_wheel: asset("Antique Spinning Wheel", "Tools", ["textile"]),
      outdoor_aircon_unit: asset("Outdoor Aircon Unit", "Infrastructure", ["hvac"]),
      smoothing_hand_plane: asset("Smoothing Hand Plane", "Tools", ["woodworking"]),
    });

    expect(result.candidates).toEqual([]);
    expect(result.excluded.map((entry) => entry.family)).toEqual(expect.arrayContaining([
      "overhead-crane",
      "microscope",
      "film-projector",
      "power-pole",
      "spinning-wheel",
      "aircon-unit",
      "hand-plane",
    ]));
  });

  it("keeps unrepresented families diverse after filtering covered ones", () => {
    const result = selectPolyHavenCandidates({
      Camera_01: asset("Camera 01", "Electronics & Appliances/Cameras", ["camera"]),
      security_camera_01: asset("Security Camera 01", "Industrial & Infrastructure/Surveillance", ["camera"]),
      modular_chainlink_fence: asset("Modular Chainlink Fence", "Architecture/Fences", ["fence"]),
      modular_fire_escape: asset("Modular Fire Escape", "Architecture/Outdoor Structures", ["stairs"]),
      classic_laptop: asset("Classic Laptop", "Electronics & Appliances/Computing", ["computer"]),
      measuring_tape_01: asset("Measuring Tape 01", "Tools & Equipment/Measuring Tools", ["measure"]),
      hand_truck_01: asset("Hand Truck 01", "Tools & Equipment/Material Handling", ["cart"]),
    });

    expect(takeDiverseCandidates(result.candidates, 10, 1).map((candidate) => candidate.proceduralFamily)).toEqual(expect.arrayContaining([
      "laptop",
    ]));
    expect(result.excluded.map((entry) => entry.family)).toEqual(expect.arrayContaining([
      "surveillance-camera",
      "fire-escape",
      "camera",
      "fence",
      "hand-truck",
      "measuring-tape",
    ]));
  });

  it("filters hand-tool variants already covered by shared generators", () => {
    const result = selectPolyHavenCandidates({
      pipe_wrench: asset("Pipe Wrench", "Tools & Equipment/Hand Tools", ["wrench"]),
      sledgehammer_01: asset("Sledgehammer 01", "Tools & Equipment/Hand Tools", ["hammer"]),
    });

    expect(result.candidates).toEqual([]);
    expect(result.excluded.map((entry) => entry.family)).toEqual(expect.arrayContaining(["wrench", "sledgehammer"]));
  });

  it("filters the final mechanism and cutting-tool families", () => {
    const result = selectPolyHavenCandidates({
      rollershutter_window: asset("Rollershutter Window", "Architecture/Windows", ["shutter"]),
      workshop_compressor: asset("Workshop Compressor", "Tools & Equipment/Workshop Equipment", ["pump"]),
      garden_spade: asset("Garden Spade", "Tools & Equipment/Garden Tools", ["digging"]),
      carpenter_handsaw: asset("Carpenter Handsaw", "Tools & Equipment/Hand Tools", ["cutting"]),
      metal_hacksaw: asset("Metal Hacksaw", "Tools & Equipment/Hand Tools", ["cutting"]),
    });

    expect(result.candidates).toEqual([]);
    expect(result.excluded.map((entry) => entry.family)).toEqual(expect.arrayContaining([
      "roller-shutter",
      "compressor",
      "spade",
      "saw",
    ]));
  });

  it("filters families covered by the top candidate batch", () => {
    const result = selectPolyHavenCandidates({
      mantel_clock_01: asset("Mantel Clock 01", "Electronics & Appliances/Clocks", ["clock"]),
      cordless_power_drill: asset("Cordless Power Drill", "Tools & Equipment/Power Tools", ["drill"]),
      security_camera_02: asset("Security Camera 02", "Industrial & Infrastructure/Surveillance", ["camera"]),
      metal_toolbox: asset("Metal Toolbox", "Tools & Equipment/Storage", ["toolbox"]),
      modular_fire_escape_02: asset("Modular Fire Escape 02", "Architecture/Outdoor Structures", ["stairs"]),
      vintage_video_camera: asset("Vintage Video Camera", "Electronics & Appliances/Cameras", ["camera"]),
      modular_wooden_pier_02: asset("Modular Wooden Pier 02", "Architecture/Outdoor Structures", ["pier"]),
      modular_chainlink_fence_02: asset("Modular Chainlink Fence 02", "Architecture/Fences", ["fence"]),
    });

    expect(result.candidates).toEqual([]);
    expect(result.excluded.map((entry) => entry.family)).toEqual(expect.arrayContaining([
      "clock",
      "power-drill",
      "surveillance-camera",
      "tool-storage",
      "fire-escape",
      "camera",
      "pier",
      "fence",
    ]));
  });

  it("filters families covered by the capability-learning batch", () => {
    const result = selectPolyHavenCandidates({
      modular_factory_facade: asset("Modular Factory Facade", "Architecture/Facades", ["factory"]),
      apartment_facade_kit: asset("Apartment Facade Kit", "Architecture/Facades", ["building"]),
      cassette_recorder: asset("Cassette Recorder", "Electronics & Appliances/Audio", ["portable"]),
      warehouse_hand_truck: asset("Warehouse Hand Truck", "Tools & Equipment/Material Handling", ["cart"]),
      wall_fire_extinguisher: asset("Wall Fire Extinguisher", "Industrial & Infrastructure/Fire Safety", ["safety"]),
      pub_dartboard: asset("Pub Dartboard", "Leisure/Games", ["target"]),
    });

    expect(result.candidates).toEqual([]);
    expect(result.excluded.map((entry) => entry.family)).toEqual(expect.arrayContaining([
      "facade-kit",
      "cassette-player",
      "hand-truck",
      "fire-extinguisher",
      "dartboard",
    ]));
  });
});
