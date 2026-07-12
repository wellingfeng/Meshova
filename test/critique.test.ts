import { describe, expect, it } from "vitest";
import {
  box,
  sphere,
  plane,
  merge,
  transform,
  translateMesh,
  scaleMesh,
  makeMesh,
  meshMetrics,
  foliageMetrics,
  sealTest,
  symmetryScore,
  zFightingReport,
  cylinder,
  rubricForGoal,
  critique,
  formatCritique,
  parseVlmCritique,
  critiqueWithVlm,
  MockLlmClient,
  vec3,
  buildFireEscapeParts,
  buildMountainVillageParts,
  buildSpeedTreeLibraryPlant,
  buildStreetTreeParts,
  type Mesh,
  type NamedPart,
} from "../src/index.js";

describe("geometry metrics (A tier)", () => {
  it("reports a closed box as watertight with no defects", () => {
    const m = meshMetrics(box(1, 1, 1));
    expect(m.triangles).toBe(12);
    expect(m.watertight).toBe(true);
    expect(m.boundaryEdges).toBe(0);
    expect(m.nonManifoldEdges).toBe(0);
    expect(m.degenerateFaces).toBe(0);
    expect(m.flippedFaces).toBe(0);
  });

  it("detects an open shell (plane has boundary edges)", () => {
    const m = meshMetrics(plane(1, 1, 2, 2));
    expect(m.watertight).toBe(false);
    expect(m.boundaryEdges).toBeGreaterThan(0);
  });

  it("counts pole/seam caps separately from genuine slivers", () => {
    // Collapsing two verts onto each other is a cap (benign fan closure), not
    // a sliver — this is exactly what UV-sphere poles produce by construction.
    const b = box(1, 1, 1);
    const positions = b.positions.map((p) => ({ ...p }));
    positions[b.indices[1]!] = { ...positions[b.indices[0]!]! };
    const capped = makeMesh({
      positions,
      normals: b.normals.map((n) => ({ ...n })),
      uvs: b.uvs.map((u) => ({ ...u })),
      indices: [...b.indices],
    });
    const cm = meshMetrics(capped);
    expect(cm.capFaces).toBeGreaterThan(0);
    expect(cm.degenerateFaces).toBe(0);
  });

  it("flags a genuine sliver (three distinct but collinear verts)", () => {
    // Three distinct, collinear positions => zero area, all welded verts
    // distinct => a real sliver defect.
    const sliver = makeMesh({
      positions: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
      ],
      normals: [
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 1, z: 0 },
      ],
      uvs: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
      indices: [0, 1, 2],
    });
    const sm = meshMetrics(sliver);
    expect(sm.degenerateFaces).toBeGreaterThan(0);
    expect(sm.capFaces).toBe(0);
  });

  it("does not flag a UV sphere's poles as sliver defects", () => {
    const m = meshMetrics(sphere(0.5, 16, 12));
    // Poles produce cap faces, but zero genuine slivers.
    expect(m.capFaces).toBeGreaterThan(0);
    expect(m.degenerateFaces).toBe(0);
  });

  it("scores a symmetric sphere near 1 and an X-lopsided mesh lower", () => {
    const sym = symmetryScore(sphere(0.5, 16, 12));
    expect(sym).toBeGreaterThan(0.9);
    // A big block on +X merged with a small block on -X is genuinely
    // asymmetric about its own bbox-center mirror plane.
    const lopsided = merge(
      translateMesh(box(0.8, 0.8, 0.8), { x: 0.6, y: 0, z: 0 }),
      translateMesh(box(0.15, 0.15, 0.15), { x: -0.6, y: 0, z: 0 }),
    );
    const asym = symmetryScore(lopsided);
    expect(asym).toBeLessThan(sym);
  });

  it("detects same-facing coplanar overlap that would z-fight", () => {
    const backing = box(1, 1, 0.1);
    const inset = translateMesh(box(0.5, 0.5, 0.04), { x: 0, y: 0, z: 0.03 });
    const zf = zFightingReport([
      { name: "frame_plate", mesh: backing },
      { name: "glass_pane", mesh: inset },
    ]);
    expect(zf.pairs).toBeGreaterThan(0);

    const report = critique([
      { name: "frame_plate", mesh: backing },
      { name: "glass_pane", mesh: inset },
    ], { goal: "generic object" });
    expect(report.passed).toBe(false);
    expect(report.issues.some((i) => /z-fighting|重面闪烁/.test(i.finding))).toBe(true);
    expect(report.scores.overall).toBeLessThan(1);
  });

  it("checks adjacent quantized plane bins within tolerance", () => {
    const backing = box(1, 1, 0.1);
    const nearPane = translateMesh(box(0.5, 0.5, 0.04), { x: 0, y: 0, z: 0.0325 });
    const parts = [
      { name: "backing", mesh: backing },
      { name: "near_pane", mesh: nearPane },
    ];

    expect(zFightingReport(parts, { planeTolerance: 0.002 }).pairs).toBe(0);
    expect(zFightingReport(parts, { planeTolerance: 0.003 }).pairs).toBeGreaterThan(0);
    expect(zFightingReport(parts, { planeTolerance: 0.004 }).pairs).toBeGreaterThan(0);
  });

  it("does not treat back-to-back shared faces as z-fighting", () => {
    const a = translateMesh(box(1, 1, 1), { x: -0.5, y: 0, z: 0 });
    const b = translateMesh(box(1, 1, 1), { x: 0.5, y: 0, z: 0 });
    expect(zFightingReport([{ name: "a", mesh: a }, { name: "b", mesh: b }]).pairs).toBe(0);
  });
});

describe("rubric selection", () => {
  it("matches known categories by alias", () => {
    expect(rubricForGoal("a wooden dining chair").category).toBe("chair");
    expect(rubricForGoal("a red sports car").category).toBe("car");
    expect(rubricForGoal("a tall oak tree").category).toBe("tree");
    expect(rubricForGoal("Meshova树库 Acacia").category).toBe("tree");
    expect(rubricForGoal("speedtree-library-broadleaves-barrel-cactus").category).toBe("cactus");
    expect(rubricForGoal("mountain-village").category).toBe("settlement");
    expect(rubricForGoal("cityblock").category).toBe("settlement");
  });
  it("falls back to generic for unknown goals", () => {
    expect(rubricForGoal("an abstract sculpture").category).toBe("generic");
  });
});

describe("critique report", () => {
  function part(name: string, mesh: NamedPart["mesh"]): NamedPart {
    return { name, mesh };
  }

  it("passes a clean, well-proportioned chair", () => {
    const seat = translateMesh(box(0.5, 0.08, 0.5), { x: 0, y: 0.45, z: 0 });
    const back = translateMesh(box(0.5, 0.5, 0.06), { x: 0, y: 0.75, z: -0.22 });
    const legGeo = box(0.06, 0.45, 0.06);
    const parts: NamedPart[] = [
      part("seat", seat),
      part("back", back),
      part("leg_fl", translateMesh(legGeo, { x: -0.2, y: 0.22, z: 0.2 })),
      part("leg_fr", translateMesh(legGeo, { x: 0.2, y: 0.22, z: 0.2 })),
      part("leg_bl", translateMesh(legGeo, { x: -0.2, y: 0.22, z: -0.2 })),
      part("leg_br", translateMesh(legGeo, { x: 0.2, y: 0.22, z: -0.2 })),
    ];
    const report = critique(parts, { goal: "a dining chair" });
    expect(report.category).toBe("chair");
    expect(report.issues.filter((i) => i.severity === "hard")).toHaveLength(0);
    expect(report.scores.geometry).toBeGreaterThan(0.9);
    expect(report.passed).toBe(true);
  });

  it("hard-fails an empty part and reports it", () => {
    const empty = makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
    const report = critique([{ name: "ghost", mesh: empty }], { goal: "a box" });
    expect(report.passed).toBe(false);
    const hard = report.issues.filter((i) => i.severity === "hard");
    expect(hard.some((i) => i.part === "ghost")).toBe(true);
  });

  it("flags missing expected parts for a category", () => {
    // A car that is just one body block: no wheels/cabin.
    const report = critique([{ name: "body", mesh: scaleMesh(box(1, 0.4, 2), 1) }], {
      goal: "a car",
    });
    const findings = report.issues.map((i) => i.finding).join(" ");
    expect(findings).toMatch(/wheel|cabin/);
  });

  it("hard-fails a smooth barrel cactus proxy with no spines", () => {
    const report = critique([{
      name: "stem",
      label: "Barrel Cactus 肉质茎",
      mesh: scaleMesh(sphere(0.5, 16, 12), { x: 0.8, y: 1.15, z: 0.8 }),
    }], { goal: "speedtree-library-broadleaves-barrel-cactus" });
    expect(report.category).toBe("cactus");
    expect(report.passed).toBe(false);
    expect(report.issues.some((i) => i.severity === "hard" && /spine/.test(i.finding))).toBe(true);
  });

  it("hard-fails active wind animation on cactus parts", () => {
    const stem = scaleMesh(sphere(0.5, 16, 12), { x: 0.8, y: 1.4, z: 0.8 });
    const spines = translateMesh(cylinder(0.02, 0.32, 6, true), { x: 0.48, y: 0.65, z: 0 });
    const report = critique([{
      name: "stem",
      label: "Saguaro cactus stem",
      mesh: stem,
      windWeight: stem.positions.map(() => 0.85),
      metadata: { libraryKind: "cactus" },
    }, {
      name: "spines",
      label: "Cactus spines",
      mesh: spines,
      metadata: { libraryKind: "cactus" },
    }], { goal: "saguaro cactus" });
    expect(report.passed).toBe(false);
    expect(report.issues.some((i) => i.axis === "motion" && i.severity === "hard" && /wind\/sway/.test(i.finding))).toBe(true);
  });

  it("builds barrel cactus with cactus-critical detail parts", () => {
    const parts = buildSpeedTreeLibraryPlant(
      { category: "Broadleaves", species: "Barrel_Cactus", seed: 455951 },
      { quality: "proxy" },
    );
    expect(parts.some((p) => p.name === "stem")).toBe(true);
    expect(parts.some((p) => p.name === "ribs")).toBe(true);
    expect(parts.some((p) => p.name === "areoles")).toBe(true);
    expect(parts.some((p) => p.name === "spines")).toBe(true);
    const report = critique(parts, { goal: "speedtree-library-broadleaves-barrel-cactus" });
    expect(report.category).toBe("cactus");
    expect(report.issues.some((i) => i.severity === "hard" && /spine/.test(i.finding))).toBe(false);
    expect(parts.some((p) => p.windWeight?.some((w) => Math.abs(w) > 1e-4))).toBe(false);
  });

  it("flags a visible tree imposter card as a hard issue", () => {
    const card = makeMesh({
      positions: [
        { x: -1, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: -1, y: 3, z: 0 },
        { x: 1, y: 3, z: 0 },
        { x: 0, y: 0, z: -1 },
        { x: 0, y: 0, z: 1 },
        { x: 0, y: 3, z: -1 },
        { x: 0, y: 3, z: 1 },
      ],
      normals: [
        { x: 0, y: 0, z: 1 },
        { x: 0, y: 0, z: 1 },
        { x: 0, y: 0, z: 1 },
        { x: 0, y: 0, z: 1 },
        { x: 1, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
      ],
      uvs: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
      ],
      indices: [0, 1, 2, 1, 3, 2, 4, 5, 6, 5, 7, 6],
    });
    const parts: NamedPart[] = [
      part("trunk", translateMesh(box(0.22, 2.1, 0.22), { x: -1.2, y: 1.05, z: 0 })),
      part("leaves", translateMesh(sphere(0.7, 12, 8), { x: -1.2, y: 2.35, z: 0 })),
      part("imposter", translateMesh(card, { x: 1.5, y: 0, z: 0 })),
    ];
    const report = critique(parts, { goal: "a tree" });
    expect(report.passed).toBe(false);
    expect(report.issues.some((i) => i.severity === "hard" && /LOD\/billboard card/.test(i.finding))).toBe(true);
    expect(report.scores.overall).toBeLessThan(1);
  });

  it("formats a critique with prioritized issues", () => {
    const empty = makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
    const report = critique([{ name: "ghost", mesh: empty }], { goal: "a chair" });
    const text = formatCritique(report);
    expect(text).toContain("Critique [chair]");
    expect(text).toContain("MUST FIX");
  });

  it("folds VLM aesthetic/realism into the score when provided", () => {
    const parts = [{ name: "body", mesh: box(1, 1, 1) }];
    const withVlm = critique(parts, {
      goal: "a cube",
      vlm: { aesthetic: 0.2, realism: 0.3, issues: [] },
    });
    const noVlm = critique(parts, { goal: "a cube" });
    expect(withVlm.scores.overall).toBeLessThan(noVlm.scores.overall);
  });

  it("flags settlement buildings that overlap roads and crowd each other", () => {
    const houses: Mesh[] = [];
    for (let z = 0; z < 4; z++) {
      for (let x = 0; x < 4; x++) {
        houses.push(translateMesh(box(0.55, 0.5, 0.55), {
          x: x * 0.42 - 0.63,
          y: 0.25,
          z: z * 0.42 - 0.63,
        }));
      }
    }
    const parts: NamedPart[] = [
      { name: "terrain", mesh: translateMesh(box(4, 0.05, 4), { x: 0, y: -0.03, z: 0 }) },
      { name: "roads", mesh: plane(0.35, 4, 1, 16) },
      { name: "buildings", mesh: merge(...houses) },
    ];
    const report = critique(parts, { goal: "mountain village settlement" });
    const findings = report.issues.map((i) => i.finding).join(" ");
    expect(report.category).toBe("settlement");
    expect(findings).toMatch(/overlap road|overcrowded/);
    expect(report.passed).toBe(false);
    expect(report.scores.overall).toBeLessThan(0.7);
  });

  it("does not treat street-tree parts as road geometry", () => {
    const parts: NamedPart[] = [
      { name: "buildings", mesh: translateMesh(box(1, 1, 1), { x: 0, y: 0.5, z: 0 }) },
      { name: "street_tree_canopy", mesh: translateMesh(box(1.2, 0.8, 1.2), { x: 0, y: 1.2, z: 0 }) },
    ];
    const report = critique(parts, { goal: "city settlement" });
    expect(report.issues.some((i) => /overlap road/.test(i.finding))).toBe(false);
  });

  it("keeps the generated mountain village clear of road/spacing hard failures", () => {
    const parts = buildMountainVillageParts({
      size: 12,
      resolution: 48,
      height: 1.6,
      noiseScale: 1.05,
      roads: 9,
      buildings: 190,
      trees: 60,
      seed: 21,
    });
    const report = critique(parts, { goal: "mountain-village" });
    expect(report.category).toBe("settlement");
    expect(report.issues.filter((i) => i.severity === "hard")).toHaveLength(0);
    expect(report.issues.some((i) => /overlap road|overcrowded|plain body\+roof/.test(i.finding))).toBe(false);
    expect(parts.find((p) => p.name === "roads")?.surface?.type).toBe("dirtRoad");
    expect(parts.some((p) => p.name === "windows")).toBe(true);
    expect(parts.some((p) => p.name === "doors")).toBe(true);
    expect(report.scores.overall).toBeGreaterThan(0.9);
  });
});

describe("VLM critic (B/C tier)", () => {
  const reply = [
    "```json",
    JSON.stringify({
      aesthetic: 0.55,
      realism: 0.4,
      issues: [
        { axis: "realism", severity: "hard", part: "seat", finding: "seat too high", suggestion: "lower the seat" },
        { axis: "aesthetic", severity: "soft", finding: "legs too thin", suggestion: "thicken legs" },
        { axis: "weird", severity: "nope" },
      ],
    }),
    "```",
  ].join("\n");

  it("parses scores and issues, tolerating malformed entries", () => {
    const v = parseVlmCritique(reply);
    expect(v.aesthetic).toBeCloseTo(0.55);
    expect(v.realism).toBeCloseTo(0.4);
    expect(v.issues).toHaveLength(3);
    expect(v.issues[0]!.part).toBe("seat");
    // Unknown axis falls back to "realism", unknown severity to "soft".
    expect(v.issues[2]!.axis).toBe("realism");
    expect(v.issues[2]!.severity).toBe("soft");
  });

  it("throws on non-JSON replies", () => {
    expect(() => parseVlmCritique("no code here")).toThrow();
  });

  it("runs a full VLM pass via a mock client and folds into critique", async () => {
    const client = new MockLlmClient([reply]);
    const vlm = await critiqueWithVlm({
      client,
      goal: "a dining chair",
      rendersBase64: ["ZmFrZQ=="],
    });
    expect(vlm.realism).toBeCloseTo(0.4);
    const report = critique([{ name: "seat", mesh: box(1, 1, 1) }], { goal: "a chair", vlm });
    // The hard VLM issue should surface in the report and block passing.
    expect(report.issues.some((i) => i.severity === "hard" && i.part === "seat")).toBe(true);
    expect(report.passed).toBe(false);
  });
});

describe("seal test (functional plausibility)", () => {
  it("reports a solid box and capped cylinder as fully enclosed", () => {
    expect(sealTest(box(1, 1, 1)).enclosure).toBeGreaterThan(0.98);
    expect(sealTest(cylinder(0.5, 1, 24, true)).sideEnclosure).toBeGreaterThan(0.98);
  });

  it("detects a capless cylinder leaking at the top/bottom but sealed on the side", () => {
    const s = sealTest(cylinder(0.5, 1, 24, false));
    expect(s.sideEnclosure).toBeGreaterThan(0.95);
    expect(s.enclosure).toBeLessThan(0.9);
  });

  it("detects a gapped staved barrel as leaking on the side wall", () => {
    // Eight thin planks spread around a circle with wide gaps => leaks.
    const planks: NamedPart["mesh"][] = [];
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const plank = translateMesh(box(0.12, 1, 0.05), {
        x: Math.cos(a) * 0.5,
        y: 0,
        z: Math.sin(a) * 0.5,
      });
      planks.push(plank);
    }
    const barrel = merge(...planks);
    expect(sealTest(barrel).sideEnclosure).toBeLessThan(0.6);
  });

  it("flags an unsealed water-tank assembly as a hard realism failure", () => {
    // A tank made of gapped staves under the water-tower rubric.
    const planks: NamedPart[] = [];
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      planks.push({
        name: "tank",
        mesh: translateMesh(box(0.1, 1.2, 0.05), { x: Math.cos(a) * 0.6, y: 0.6, z: Math.sin(a) * 0.6 }),
      });
    }
    const support: NamedPart = { name: "support", mesh: translateMesh(box(1.2, 0.6, 1.2), { x: 0, y: 0.3, z: 0 }) };
    const report = critique([...planks, support], { goal: "a water tower" });
    expect(report.category).toBe("water-tower");
    const hard = report.issues.filter((i) => i.severity === "hard");
    expect(hard.some((i) => /not sealed|leak/i.test(i.finding))).toBe(true);
    expect(report.passed).toBe(false);
    expect(report.scores.overall).toBeLessThan(0.8);
  });

  it("passes a solid-walled tank (no gaps)", () => {
    const tank: NamedPart = { name: "tank", mesh: cylinder(0.6, 1.2, 24, true) };
    const support: NamedPart = { name: "support", mesh: translateMesh(box(1, 0.6, 1), { x: 0, y: -0.9, z: 0 }) };
    const report = critique([tank, support], { goal: "a water tower" });
    expect(report.issues.some((i) => /not sealed/i.test(i.finding))).toBe(false);
  });
});

describe("fire-escape functional plausibility", () => {
  function blockedFireEscape(): NamedPart[] {
    const w = 2.6;
    const pd = 1.2;
    const y = 3.2;
    const frontZ = pd + 0.1;
    const platforms = transform(box(w, 0.08, pd), { translate: vec3(0, y, pd / 2 + 0.1) });
    const railMeshes: Mesh[] = [
      transform(box(w, 0.05, 0.05), { translate: vec3(0, y + 1.0, frontZ) }),
    ];
    for (let i = 0; i <= 6; i++) {
      const x = -w / 2 + (i / 6) * w;
      railMeshes.push(transform(box(0.03, 1.0, 0.03), { translate: vec3(x, y + 0.5, frontZ) }));
    }
    const stepMeshes: Mesh[] = [];
    const nsteps = 12;
    for (let s = 1; s < nsteps; s++) {
      const t = s / nsteps;
      stepMeshes.push(transform(box(0.7, 0.03, 0.22), { translate: vec3(0, 0.1 + t * (y - 0.1), 0.1 + t * pd) }));
    }
    return [
      { name: "platforms", mesh: platforms },
      { name: "railings", mesh: merge(...railMeshes) },
      { name: "steps", mesh: merge(...stepMeshes) },
    ];
  }

  it("flags stair access blocked by a continuous landing rail", () => {
    const report = critique(blockedFireEscape(), { goal: "fire escape" });
    expect(report.category).toBe("fire-escape");
    expect(report.issues.some((i) => i.severity === "hard" && /blocked by railing/.test(i.finding))).toBe(true);
    expect(report.passed).toBe(false);
  });

  it("accepts the generated fire escape's clear landing openings", () => {
    const report = critique(buildFireEscapeParts(), { goal: "fire escape" });
    expect(report.issues.some((i) => /blocked by railing|not connected|no reachable/.test(i.finding))).toBe(false);
    expect(report.issues.filter((i) => i.severity === "hard")).toHaveLength(0);
  });
});

describe("structural support", () => {
  it("hard-fails a weighted component floating above the ground", () => {
    const report = critique([
      { name: "base", mesh: translateMesh(box(1, 0.2, 1), { x: 0, y: 0.1, z: 0 }) },
      { name: "floating_beam", mesh: translateMesh(box(1.2, 0.16, 0.16), { x: 0, y: 1.2, z: 0 }) },
    ], { goal: "a steel structure" });
    expect(report.issues.some((i) => i.severity === "hard" && /floating with no contact path/.test(i.finding))).toBe(true);
    expect(report.passed).toBe(false);
  });

  it("passes a weighted component connected to ground by a post", () => {
    const report = critique([
      { name: "base", mesh: translateMesh(box(1, 0.2, 1), { x: 0, y: 0.1, z: 0 }) },
      { name: "post", mesh: translateMesh(box(0.16, 1.1, 0.16), { x: 0, y: 0.65, z: 0 }) },
      { name: "beam", mesh: translateMesh(box(1.2, 0.16, 0.16), { x: 0, y: 1.2, z: 0 }) },
    ], { goal: "a steel structure" });
    expect(report.issues.some((i) => /floating with no contact path/.test(i.finding))).toBe(false);
  });

  it("allows explicitly weightless visual geometry", () => {
    const report = critique([
      {
        name: "magic_orb",
        mesh: translateMesh(sphere(0.3, 12, 8), { x: 0, y: 2, z: 0 }),
        metadata: { supportExempt: true },
      },
    ], { goal: "a magic effect" });
    expect(report.issues.some((i) => /floating with no contact path/.test(i.finding))).toBe(false);
  });
});

describe("broken/open shell detection", () => {
  /**
   * A big solid sphere with faces deleted in a scattered pattern (every k-th
   * face) => holes riddling the surface, a large boundary over many faces.
   */
  function holedSphere(keepEvery: number): NamedPart["mesh"] {
    const s = sphere(0.5, 24, 18);
    const keep: number[] = [];
    const faces = s.indices.length / 3;
    for (let f = 0; f < faces; f++) {
      if (f % keepEvery === 0) continue; // punch a hole every k-th face
      keep.push(s.indices[f * 3]!, s.indices[f * 3 + 1]!, s.indices[f * 3 + 2]!);
    }
    return makeMesh({
      positions: s.positions.map((p) => ({ ...p })),
      normals: s.normals.map((n) => ({ ...n })),
      uvs: s.uvs.map((u) => ({ ...u })),
      indices: keep,
    });
  }

  it("does not flag a small open bowl/lid (single legitimate opening)", () => {
    // A capless cylinder is a small part with a 100%-boundary rim but few
    // faces — a legitimate opening, not a broken solid.
    const lid: NamedPart = { name: "lid", mesh: cylinder(0.3, 0.05, 12, false) };
    const report = critique([lid], { goal: "a bin lid" });
    expect(report.issues.some((i) => /broken\/open shell/.test(i.finding))).toBe(false);
  });

  it("flags a large holed solid as a broken shell", () => {
    // A dense sphere missing ~30% of its faces: many triangles yet a big
    // boundary => holes riddling a mesh that should be closed.
    const rock: NamedPart = { name: "rock", mesh: holedSphere(3) };
    const report = critique([rock], { goal: "a rock" });
    expect(report.issues.some((i) => /broken\/open shell/.test(i.finding))).toBe(true);
    expect(report.scores.geometry).toBeLessThan(1);
  });

  it("does not flag a closed dense sphere", () => {
    const rock: NamedPart = { name: "rock", mesh: sphere(0.5, 24, 18) };
    const report = critique([rock], { goal: "a rock" });
    expect(report.issues.some((i) => /broken\/open shell/.test(i.finding))).toBe(false);
  });
});

describe("transparency policy", () => {
  it("flags an opaque double-sided open solid as unintended translucency", () => {
    const report = critique([{
      name: "ceramic_vase_body",
      label: "陶瓷花瓶主体",
      mesh: cylinder(0.5, 1.5, 24, false),
      surface: { type: "ceramic", params: { color: [0.7, 0.8, 0.85] } },
      doubleSided: true,
    }], { goal: "a ceramic vase" });
    expect(report.issues.some((i) => /unintended translucency/.test(i.finding))).toBe(true);
    expect(report.passed).toBe(false);
  });

  it("flags transmissive material on an opaque semantic part", () => {
    const report = critique([{
      name: "cactus_skin",
      label: "仙人掌茎体",
      mesh: sphere(0.5, 16, 12),
      surface: { type: "leaf", params: { color: [0.2, 0.5, 0.2] } },
    }], { goal: "a cactus" });
    expect(report.issues.some((i) => /without matching transparent\/translucent semantics/.test(i.finding))).toBe(true);
    expect(report.passed).toBe(false);
  });

  it("allows semantically matched transparent parts", () => {
    const report = critique([{
      name: "window_glass",
      label: "窗户玻璃",
      mesh: box(1, 1, 0.04),
      surface: { type: "glass", params: { tint: [0.8, 0.9, 1] } },
    }], { goal: "a window" });
    expect(report.issues.some((i) => /transparent\/translucent semantics|unintended translucency/.test(i.finding))).toBe(false);
  });

  it("flags an open glass vessel even when its name implies glass", () => {
    const report = critique([{
      name: "wine_glass",
      label: "高脚酒杯",
      mesh: cylinder(0.4, 1.2, 24, false),
      surface: { type: "glass", params: { tint: [0.8, 0.9, 1] } },
    }], { goal: "a wine glass" });
    expect(report.issues.some((issue) => /single-sided\/open transmissive shell/.test(issue.finding))).toBe(true);
    expect(report.passed).toBe(false);
  });

  it("rejects double-sided rendering on closed transmissive solids", () => {
    const report = critique([{
      name: "window_glass",
      label: "窗户玻璃",
      mesh: box(1, 1, 0.04),
      surface: { type: "glass", params: { tint: [0.8, 0.9, 1] } },
      doubleSided: true,
    }], { goal: "a window" });
    expect(report.issues.some((issue) => /forced double-sided/.test(issue.finding))).toBe(true);
  });
});

describe("foliage morphology", () => {
  // Build a "foliage" part from N leaf cards. `aspect` sets card long/short,
  // `stacked` piles them all at one spot (else spreads them on a grid).
  function makeFoliage(n: number, aspect: number, stacked: boolean): Mesh {
    const cards: Mesh[] = [];
    const w = 0.12;
    const h = w * aspect;
    const side = Math.ceil(Math.sqrt(n));
    for (let i = 0; i < n; i++) {
      const card = scaleMesh(plane(w, h, 1, 1), { x: 1, y: 1, z: 1 });
      if (stacked) {
        // Piled into a spot much smaller than the leaf: cards spread across a
        // patch ~1/8 of a leaf-width, so many leaves fall in each grid cell
        // (leaves-per-cell blows up) yet stay distinct components => hard.
        const jx = ((i * 7) % 5) * 0.003;
        const jz = ((i * 3) % 5) * 0.003;
        cards.push(translateMesh(card, { x: jx, y: i * 0.0006, z: jz }));
      } else {
        const gx = (i % side) * w * 3;
        const gz = Math.floor(i / side) * h * 3;
        cards.push(translateMesh(card, { x: gx, y: 0, z: gz }));
      }
    }
    return merge(...cards);
  }

  it("passes clean, well-spread, leaf-shaped cards without a torn/overlap flag", () => {
    const foliage: NamedPart = { name: "foliage", mesh: makeFoliage(16, 1.4, false) };
    const report = critique([foliage], { goal: "a bush" });
    expect(report.issues.some((i) => /torn slivers|overlap heavily/.test(i.finding))).toBe(false);
  });

  it("flags elongated leaf cards as torn slivers", () => {
    const foliage: NamedPart = { name: "foliage", mesh: makeFoliage(16, 6, false) };
    const report = critique([foliage], { goal: "a bush" });
    expect(report.issues.some((i) => /torn slivers/.test(i.finding))).toBe(true);
  });

  it("flags heavily stacked leaves as overcrowded", () => {
    const foliage: NamedPart = { name: "foliage", mesh: makeFoliage(24, 1.4, true) };
    const report = critique([foliage], { goal: "a bush" });
    const issue = report.issues.find((i) => /overlap heavily|overcrowded/.test(i.finding));
    expect(issue?.severity).toBe("hard");
    expect(report.passed).toBe(false);
    expect(report.scores.overall).toBeLessThan(0.7);
  });

  it("does not flag well-spread dense foliage as overcrowded", () => {
    // 64 leaf cards spread on a grid: dense but not piled — must stay clean.
    const foliage: NamedPart = { name: "foliage", mesh: makeFoliage(64, 1.4, false) };
    const report = critique([foliage], { goal: "a bush" });
    expect(report.issues.some((i) => /overcrowded/.test(i.finding))).toBe(false);
  });

  it("foliageMetrics counts cards and reports aspect", () => {
    const m = makeFoliage(9, 3, false);
    const fm = foliageMetrics(m);
    expect(fm.cards).toBe(9);
    expect(fm.meanAspect).toBeGreaterThan(2.5);
    expect(fm.maxCardDiagonalRatio).toBeGreaterThan(0);
  });

  it("pure leaf cards have zero blobRatio", () => {
    expect(foliageMetrics(makeFoliage(40, 1.4, false)).blobRatio).toBe(0);
  });

  it("detects a closed solid sphere hidden in the foliage as an exposed blob", () => {
    // Spread leaf cards + one closed occluder sphere merged in: the sphere is a
    // closed solid volume that a leaf part should never contain.
    const leaves = makeFoliage(40, 1.4, false);
    const blob = translateMesh(sphere(0.3, 16, 12), { x: 0.5, y: 0, z: 0.5 });
    const foliage: NamedPart = { name: "foliage", mesh: merge(leaves, blob) };
    const fm = foliageMetrics(foliage.mesh);
    expect(fm.blobRatio).toBeGreaterThan(0);
    const report = critique([foliage], { goal: "a tree" });
    expect(report.issues.some((i) => /exposed occluder blob|green ball/.test(i.finding))).toBe(true);
  });

  it("accepts street-tree crowns made from small shaped leaves", () => {
    const parts = buildStreetTreeParts();
    const canopy = parts.find((p) => p.name === "canopy");
    expect(canopy).toBeDefined();
    expect(foliageMetrics(canopy!.mesh).maxCardDiagonalRatio).toBeLessThanOrEqual(0.22);
    expect(new Set(canopy!.mesh.uvs.map((uv) => uv.x))).toContain(0.5);

    const report = critique(parts, { goal: "a tree" });
    expect(report.issues.some((i) => /leaf cards are too large/.test(i.finding))).toBe(false);
  });
});
