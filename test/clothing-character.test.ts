import { describe, it, expect } from "vitest";
import {
  buildAvatar,
  buildBody,
  buildCharacter,
  bounds,
  vertexCount,
} from "../src/index.js";

describe("buildBody (renderable skin body)", () => {
  it("produces a watertight-ish skin part with geometry", () => {
    const body = buildBody(buildAvatar());
    expect(body.name).toBe("body");
    expect(body.surface?.type).toBe("skin");
    expect(vertexCount(body.mesh)).toBeGreaterThan(100);
  });

  it("body spans roughly the avatar height", () => {
    const avatar = buildAvatar();
    const body = buildBody(avatar);
    const b = bounds(body.mesh);
    // Top near crown, bottom near ankle (feet not modeled, legs end at ankle).
    expect(b.max.y).toBeGreaterThan(avatar.landmarks.chinLine);
    expect(b.min.y).toBeLessThan(avatar.landmarks.knee);
  });

  it("bigger measures yield a wider body (clothes will follow)", () => {
    const widthOf = (chest: number) => {
      const m = buildBody(buildAvatar({ chest })).mesh;
      const b = bounds(m);
      return b.max.x - b.min.x;
    };
    expect(widthOf(1.4)).toBeGreaterThan(widthOf(0.8));
  });

  it("head can be omitted", () => {
    const withHead = vertexCount(buildBody(buildAvatar(), { head: true }).mesh);
    const noHead = vertexCount(buildBody(buildAvatar(), { head: false }).mesh);
    expect(noHead).toBeLessThan(withHead);
  });

  it("hands + feet add geometry and can be omitted", () => {
    const withExt = vertexCount(buildBody(buildAvatar(), { extremities: true }).mesh);
    const noExt = vertexCount(buildBody(buildAvatar(), { extremities: false }).mesh);
    expect(noExt).toBeLessThan(withExt);
  });

  it("feet extend forward (+Z) past the ankle", () => {
    const avatar = buildAvatar();
    const withFeet = buildBody(avatar, { extremities: true }).mesh;
    const noFeet = buildBody(avatar, { extremities: false }).mesh;
    // Look only near the ground (ankle height) so the head/torso don't dominate.
    const maxZLow = (m: typeof withFeet) =>
      Math.max(...m.positions.filter((p) => p.y < avatar.landmarks.knee * 0.6).map((p) => p.z));
    expect(maxZLow(withFeet)).toBeGreaterThan(maxZLow(noFeet));
  });

  it("is deterministic", () => {
    const a = buildBody(buildAvatar({ chest: 1.1 })).mesh;
    const b = buildBody(buildAvatar({ chest: 1.1 })).mesh;
    expect(a.positions).toEqual(b.positions);
  });
});

describe("buildCharacter (body + clothes generated together)", () => {
  it("emits the body plus each garment's parts", () => {
    const { parts } = buildCharacter({
      garments: [
        { template: "tshirt", params: { fabric: "cottonJersey" } },
        { template: "pants", params: { fabric: "denim" } },
      ],
    });
    const names = parts.map((p) => p.name);
    expect(names).toContain("body");
    expect(names).toContain("tshirt_body");
    expect(names).toContain("pants_seat");
  });

  it("forces character measures onto every garment so clothes fit the body", () => {
    // Big body. The shirt must size to the big chest even if params omit measures,
    // and even if params try to pass a SMALL chest (character measures win).
    const big = buildCharacter({
      measures: { chest: 1.5 },
      garments: [{ template: "tshirt", params: { measures: { chest: 0.7 } } }],
    });
    const small = buildCharacter({
      measures: { chest: 0.8 },
      garments: [{ template: "tshirt" }],
    });
    const shirtWidth = (r: ReturnType<typeof buildCharacter>) => {
      const shirt = r.parts.find((p) => p.name === "tshirt_body")!;
      const xs = shirt.mesh.positions.map((p) => p.x);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(shirtWidth(big)).toBeGreaterThan(shirtWidth(small));
  });

  it("clothing sits outside the body surface (ease gap)", () => {
    const { parts } = buildCharacter({
      garments: [{ template: "tshirt", params: { chestEase: 0.06 } }],
    });
    const body = parts.find((p) => p.name === "body")!;
    const shirt = parts.find((p) => p.name === "tshirt_body")!;
    // Front depth at the chest centerline (x≈0): the shirt front must sit
    // further out in +Z than the bare body. Sampling near x=0 avoids the arm
    // tubes, which would otherwise inflate the body's measured radius.
    const frontDepth = (m: typeof body.mesh) => {
      let z = 0;
      for (const p of m.positions) {
        if (p.y < 1.2 || p.y > 1.35 || Math.abs(p.x) > 0.06 || p.z < 0) continue;
        z = Math.max(z, p.z);
      }
      return z;
    };
    expect(frontDepth(shirt.mesh)).toBeGreaterThan(frontDepth(body.mesh));
  });

  it("body:false yields clothing only", () => {
    const { parts } = buildCharacter({
      body: false,
      garments: [{ template: "skirt" }],
    });
    expect(parts.some((p) => p.name === "body")).toBe(false);
    expect(parts.length).toBeGreaterThan(0);
  });

  it("culls hidden body faces under clothing (fewer body tris)", () => {
    const dressed = buildCharacter({
      garments: [{ template: "tshirt" }, { template: "pants" }],
    });
    const bare = buildCharacter({
      garments: [{ template: "tshirt" }, { template: "pants" }],
      cullHidden: false,
    });
    const bodyTris = (r: ReturnType<typeof buildCharacter>) =>
      r.parts.find((p) => p.name === "body")!.mesh.indices.length / 3;
    expect(bodyTris(dressed)).toBeLessThan(bodyTris(bare));
  });

  it("culling keeps exposed parts (head still present above the collar)", () => {
    const { parts } = buildCharacter({
      garments: [{ template: "tshirt" }],
    });
    const body = parts.find((p) => p.name === "body")!;
    // Head verts (high Y) must survive the cull.
    const maxY = Math.max(...body.mesh.positions.map((p) => p.y));
    expect(maxY).toBeGreaterThan(1.6);
  });

  it("culling keeps the head watertight (no holes punched above the collar)", () => {
    // Regression: cullHiddenBody projected head verts onto the torso bone's
    // clamped cap and matched them against hood cloth binned in that same cell,
    // carving an "E"-shaped hole through the head. The hood sits on the
    // shoulders, well below the head, so culling must not touch head triangles.
    const headY = 1.6; // safely above the neck join
    const headTris = (cullHidden: boolean) => {
      const { parts } = buildCharacter({
        cullHidden,
        garments: [{ template: "hoodie", params: { seed: 9 } }],
      });
      const { positions, indices } = parts.find((p) => p.name === "body")!.mesh;
      let n = 0;
      for (let t = 0; t < indices.length; t += 3) {
        const tri = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
        if (tri.every((v) => positions[v]!.y >= headY)) n++;
      }
      return n;
    };
    // Head is never under the hood, so the cull must leave every head tri intact.
    expect(headTris(true)).toBe(headTris(false));
  });

  it("is deterministic", () => {
    const make = () => buildCharacter({
      measures: { chest: 1.0 },
      garments: [{ template: "hoodie", params: { seed: 9 } }],
    }).parts;
    const a = make();
    const b = make();
    expect(a.length).toBe(b.length);
    expect(a[0]!.mesh.positions).toEqual(b[0]!.mesh.positions);
  });
});

