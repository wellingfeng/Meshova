import { describe, expect, it } from "vitest";
import {
  INTERIOR_ROOM_DEFAULTS,
  bounds,
  buildInteriorRoom,
  buildInteriorRoomParts,
  merge,
  scoreInteriorRoom,
  triangleCount,
  vertexCount,
  type NamedPart,
} from "../src/index.js";

function merged(parts: NamedPart[]) {
  return merge(...parts.map((p) => p.mesh));
}

describe("procedural interior room", () => {
  it("builds room, furniture and matched surfaces", () => {
    const scene = buildInteriorRoom();
    const names = scene.parts.map((p) => p.name);
    expect(names).toContain("room_shell");
    expect(names).toContain("wood_floor");
    expect(names).toContain("bed_frame");
    expect(names).toContain("table");
    expect(names).toContain("chair_seats");
    expect(names).toContain("cabinet_body");
    expect(names).toContain("drawers");
    expect(names).toContain("bookcase");
    expect(names).toContain("ceiling_lamp");
    expect(scene.parts.find((p) => p.name === "window")!.surface?.type).toBe("glass");
    expect(scene.parts.find((p) => p.name === "chair_seats")!.surface?.type).toBe("leather");
    expect(scene.parts.find((p) => p.name === "ceiling_lamp")!.surface?.type).toBe("emissive");
  });

  it("is deterministic for fixed params", () => {
    const a = merged(buildInteriorRoomParts({ seed: 17, clutter: 20, chairs: 5 }));
    const b = merged(buildInteriorRoomParts({ seed: 17, clutter: 20, chairs: 5 }));
    expect(vertexCount(a)).toBe(vertexCount(b));
    expect(triangleCount(a)).toBe(triangleCount(b));
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });

  it("seed changes clutter placement without changing topology", () => {
    const a = merged(buildInteriorRoomParts({ seed: 1, clutter: 18 }));
    const b = merged(buildInteriorRoomParts({ seed: 99, clutter: 18 }));
    expect(vertexCount(a)).toBe(vertexCount(b));
    expect(a.positions).not.toEqual(b.positions);
  });

  it("width and depth control the floor inside the wall shell", () => {
    const room = buildInteriorRoomParts({ width: 8, depth: 4 });
    const floor = room.find((p) => p.name === "wood_floor")!.mesh;
    const bb = bounds(floor);
    expect(bb.max.x - bb.min.x).toBeCloseTo(8 - 0.12 * 2);
    expect(bb.max.z - bb.min.z).toBeCloseTo(4 - 0.12 * 2);
  });

  it("doorOpen drives hinge geometry and joint value", () => {
    const closed = buildInteriorRoom({ doorOpen: 0 });
    const open = buildInteriorRoom({ doorOpen: 1 });
    const closedDoor = closed.parts.find((p) => p.name === "door_leaf")!.mesh;
    const openDoor = open.parts.find((p) => p.name === "door_leaf")!.mesh;
    expect(openDoor.positions).not.toEqual(closedDoor.positions);
    const joint = open.joints.find((j) => j.name === "door_hinge")!;
    expect(joint.type).toBe("hinge");
    expect(joint.part).toBe("door_leaf");
    expect(joint.value).toBeCloseTo(-Math.PI / 2);
  });

  it("drawerOpen drives slider geometry and joint value", () => {
    const shut = buildInteriorRoom({ drawerOpen: 0 });
    const pulled = buildInteriorRoom({ drawerOpen: 1 });
    const shutDrawers = shut.parts.find((p) => p.name === "drawers")!.mesh;
    const pulledDrawers = pulled.parts.find((p) => p.name === "drawers")!.mesh;
    expect(pulledDrawers.positions).not.toEqual(shutDrawers.positions);
    const joint = pulled.joints.find((j) => j.name === "drawer_slide")!;
    expect(joint.type).toBe("slider");
    expect(joint.axis).toEqual({ x: -1, y: 0, z: 0 });
    expect(joint.value).toBeGreaterThan(0);
  });

  it("chair count controls chair geometry", () => {
    const few = buildInteriorRoomParts({ chairs: 2 });
    const many = buildInteriorRoomParts({ chairs: 6 });
    const fewSeats = few.find((p) => p.name === "chair_seats")!.mesh;
    const manySeats = many.find((p) => p.name === "chair_seats")!.mesh;
    expect(vertexCount(manySeats)).toBeGreaterThan(vertexCount(fewSeats));
  });

  it("scores a complete articulated room highly", () => {
    const scene = buildInteriorRoom();
    const s = scoreInteriorRoom(scene.parts, scene.joints);
    expect(s.score).toBeGreaterThan(0.7);
    expect(s.metrics.shell).toBe(1);
    expect(s.metrics.articulation).toBe(1);
  });

  it("exposes sane defaults", () => {
    expect(INTERIOR_ROOM_DEFAULTS.width).toBeGreaterThan(0);
    expect(INTERIOR_ROOM_DEFAULTS.chairs).toBeGreaterThan(0);
  });
});
