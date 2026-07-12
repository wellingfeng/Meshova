/**
 * Script API surface (P4): the curated set of functions an AI-written script
 * may call inside the sandbox. We hand-pick exports rather than dumping the
 * whole library so the API stays small, documented, and stable for the model.
 *
 * A script receives these as in-scope identifiers plus a `part(name, mesh,
 * color)` helper and must `return` an array of parts (or a single mesh).
 */
import * as M from "../index.js";
import type { NamedPart, PartSurfaceRef } from "../geometry/export.js";
import type { Mesh } from "../geometry/mesh.js";

/** Build a named, colored part for the scene. */
function part(name: string, mesh: Mesh, color?: [number, number, number]): NamedPart {
  return color ? { name, mesh, color } : { name, mesh };
}

/**
 * Build a part with a MATCHED surface material attached. `surfaceType` is a
 * library type id (glass/liquid/metal/carPaint/plastic/brushedMetal/fabric/
 * leather/emissive/iridescent) and `params` tunes it (color/tint/roughness/
 * seed). This is how a script emits model + material together so they stay
 * matched — e.g. a wine glass bowl gets `"glass"`, the wine gets `"liquid"`.
 */
function surfacePart(
  name: string,
  mesh: Mesh,
  surfaceType: string,
  params?: Record<string, unknown>,
): NamedPart {
  const surface: PartSurfaceRef = params ? { type: surfaceType, params } : { type: surfaceType };
  return { name, mesh, surface };
}

/**
 * Build a part whose color comes from a geometry-driven color field, baked to
 * per-vertex colors. This is the shape-aligned material path for AI scripts:
 * color is a function of each vertex's position/normal, so it can't misalign.
 */
function coloredPart(
  name: string,
  mesh: Mesh,
  colorFn: (ctx: M.FieldContext) => M.Vec3,
): NamedPart {
  const colors = M.bakeVertexColors(M.withAttributes(mesh), colorFn);
  return { name, mesh, colors };
}

/**
 * M_Trim_Vertex part: ONE mesh transitions across several trim-sheet strips by
 * per-vertex weights, baked to per-vertex colors. `attributes` supplies any
 * per-vertex weight arrays a layer references by name (length = vertex count).
 * Each layer's weight is a constant, an attribute name, or a (ctx)=>number; the
 * weights are normalized per vertex so the blend always sums to 1. All parts
 * built from the same `sheet` share one atlas — the trim-vertex memory win.
 */
function vertexBlendSurface(
  name: string,
  mesh: Mesh,
  sheet: M.TrimSheet,
  layers: ReadonlyArray<M.TrimBlendLayer>,
  opts: {
    attributes?: Record<string, number[]>;
    blend?: M.TrimBlendOptions;
  } = {},
): NamedPart {
  const field = M.trimBlendColorField(sheet, layers, opts.blend ?? {});
  const colorFn = (ctx: M.FieldContext): M.Vec3 => {
    const [r, g, b] = field(ctx);
    return M.vec3(r, g, b);
  };
  const colors = M.bakeVertexColors(M.withAttributes(mesh, opts.attributes ?? {}), colorFn);
  return { name, mesh, colors };
}

/**
 * The object spread into the sandbox scope. Keep this list curated: every
 * entry is something we're happy for generated scripts to depend on.
 */
export const SCRIPT_API: Record<string, unknown> = {
  // primitives
  box: M.box,
  sphere: M.sphere,
  plane: M.plane,
  cylinder: M.cylinder,
  cone: M.cone,
  torus: M.torus,
  icosphere: M.icosphere,
  circle: M.circle,
  // transforms / combine
  transform: M.transform,
  translateMesh: M.translateMesh,
  scaleMesh: M.scaleMesh,
  merge: M.merge,
  // ops
  subdivide: M.subdivide,
  displaceByNoise: M.displaceByNoise,
  indentCreases: M.indentCreases,
  array: M.array,
  extrude: M.extrude,
  // UV projection / unwrap
  planarUV: M.planarUV,
  boxUV: M.boxUV,
  cylindricalUV: M.cylindricalUV,
  sphericalUV: M.sphericalUV,
  normalizeUV: M.normalizeUV,
  transformUV: M.transformUV,
  // Trim-sheet UV remap — point a part at one band of a shared atlas
  mapUVToTrimBand: M.mapUVToTrimBand,
  // Trim-sheet material atlas (pack many bands into ONE reusable texture)
  makeTrimSheet: M.makeTrimSheet,
  trimSheetFields: M.trimSheetFields,
  trimStripBand: M.trimStripBand,
  trimStripNames: M.trimStripNames,
  architecturalTrim: M.architecturalTrim,
  // M_Trim_Vertex — blend one part across multiple strips by per-vertex weights
  trimBlendColorField: M.trimBlendColorField,
  // Voxel remesh — rebuild clean uniform topology from messy meshes
  voxelRemesh: M.voxelRemesh,
  // Rotation-minimizing frames along a curve (no twist flips)
  parallelTransportFrames: M.parallelTransportFrames,
  curveTangents: M.curveTangents,
  // DCC-style topology edit operators (P1)
  extrudeRegion: M.extrudeRegion,
  insetFaces: M.insetFaces,
  bevelEdges: M.bevelEdges,
  solidify: M.solidify,
  bridgeLoops: M.bridgeLoops,
  // P3 shape builders (revolve / sweep / loft / rounded primitives)
  lathe: M.lathe,
  profileSweep: M.profileSweep,
  loft: M.loft,
  capsule: M.capsule,
  roundedBox: M.roundedBox,
  rectProfile: M.rectProfile,
  lProfile: M.lProfile,
  segmentedTube: M.segmentedTube,
  // deformers (cheap per-vertex shape control — arcs, cones, spirals, stretch)
  bendMesh: M.bendMesh,
  taperMesh: M.taperMesh,
  twistMesh: M.twistMesh,
  stretchMesh: M.stretchMesh,
  // cloth physics (deterministic XPBD — drape any mesh under gravity/wind/colliders)
  simulateCloth: M.simulateCloth,
  clothStrain: M.clothStrain,
  // implicit-surface fusion (one seamless skin from blobs — heads into bodies)
  metaballs: M.metaballs,
  fuseSpheres: M.fuseSpheres,
  // P2 cut / loop cut / selection helpers
  planeCut: M.planeCut,
  loopCut: M.loopCut,
  knifeCut: M.knifeCut,
  growSelection: M.growSelection,
  shrinkSelection: M.shrinkSelection,
  selectionBoundary: M.selectionBoundary,
  selectFacesByNormal: M.selectFacesByNormal,
  toTopo: M.toTopo,
  diagnose: M.diagnose,
  hardEdges: M.hardEdges,
  // advanced geometry
  catmullClark: M.catmullClark,
  union: M.union,
  subtract: M.subtract,
  intersect: M.intersect,
  subtractAll: M.subtractAll,
  unionAll: M.unionAll,
  // mechanical hard-surface parts kit (nuts/bolts/gears/threads/flanges)
  prism: M.prism,
  regularPolygon: M.regularPolygon,
  hexPrism: M.hexPrism,
  hexNut: M.hexNut,
  boredPrism: M.boredPrism,
  gear: M.gear,
  gearOutline: M.gearOutline,
  threadedRod: M.threadedRod,
  bolt: M.bolt,
  ringGear: M.ringGear,
  annularPrism: M.annularPrism,
  flange: M.flange,
  boltHoleCircle: M.boltHoleCircle,
  punchHoles: M.punchHoles,
  poissonScatter: M.poissonScatter,
  // Houdini-style middle layer
  scalarRamp: M.scalarRamp,
  vectorRamp: M.vectorRamp,
  rampF: M.rampF,
  makePointCloud: M.makePointCloud,
  pointCount: M.pointCount,
  storePointAttribute: M.storePointAttribute,
  pointAttribute: M.pointAttribute,
  filterPoints: M.filterPoints,
  surfacePointCloud: M.surfacePointCloud,
  poissonPointCloud: M.poissonPointCloud,
  instancePlanFromPoints: M.instancePlanFromPoints,
  instanceCount: M.instanceCount,
  realizeInstances: M.realizeInstances,
  copyToPoints: M.copyToPoints,
  // hierarchical assembly (UE PCG "ApplyHierarchy / CopyPointsWithHierarchy"):
  // pre-bake a group of meshes (mesh + prop) into one unit, then scatter as a
  // whole so composed detail travels together under one parent transform.
  realizeAssembly: M.realizeAssembly,
  copyAssembliesToPoints: M.copyAssembliesToPoints,
  partitionByAttribute: M.partitionByAttribute,
  scatterToLayers: M.scatterToLayers,
  // text / signage (procedural 5x7 glyph geometry — no bitmaps)
  textMesh: M.textMesh,
  textMeshWidth: M.textMeshWidth,
  glyphSupported: M.glyphSupported,
  // curves
  polyline: M.polyline,
  bezier: M.bezier,
  helix: M.helix,
  smoothCurve: M.smoothCurve,
  resampleCurve: M.resampleCurve,
  curveLength: M.curveLength,
  sweep: M.sweep,
  // race-track toolkit (curvature auto-bank, coving road surface, prop instancing)
  bankedFrames: M.bankedFrames,
  trackSurface: M.trackSurface,
  instanceAlongCurve: M.instanceAlongCurve,
  // procedural vines / creepers / hanging plants (grown, not baked)
  buildVineParts: M.buildVineParts,
  buildVineStemMesh: M.buildVineStemMesh,
  buildVinePreset: M.buildVinePreset,
  growVineStrands: M.growVineStrands,
  // surface-climbing ivy: grow vines that adhere to a column/wall and climb up
  cylinderSurface: M.cylinderSurface,
  wallSurface: M.wallSurface,
  meshSurface: M.meshSurface,
  growClimbingStrands: M.growClimbingStrands,
  buildClimbingVineParts: M.buildClimbingVineParts,
  buildIvyRuinsParts: M.buildIvyRuinsParts,
  // procedural roots / root-flare / erosion roots (grown down+out, not baked)
  buildRootsParts: M.buildRootsParts,
  buildRootMesh: M.buildRootMesh,
  buildRootPreset: M.buildRootPreset,
  growRootStrands: M.growRootStrands,
  // procedural rock formations / cliffs / shelves (fuse + noise + strata cut)
  buildRockFormationParts: M.buildRockFormationParts,
  buildRockFormationMesh: M.buildRockFormationMesh,
  buildRockPreset: M.buildRockPreset,
  // procedural roads (ribbon swept along a centerline, ported from UE Quick Road PCG)
  roadRibbon: M.roadRibbon,
  roadCurbs: M.roadCurbs,
  roadCenterLine: M.roadCenterLine,
  roadLaneLines: M.roadLaneLines,
  roadEdgeLines: M.roadEdgeLines,
  // freeway / viaduct kit (CitySample Kit_Freeway_A parts)
  roadMedianBarrier: M.roadMedianBarrier,
  roadGuardrail: M.roadGuardrail,
  roadPillars: M.roadPillars,
  roadDeck: M.roadDeck,
  roadPierCaps: M.roadPierCaps,
  roadSignGantry: M.roadSignGantry,
  roadLightPoles: M.roadLightPoles,
  // procedural railway kit (ballast bed + sleepers + steel rails swept along a centerline)
  railwayBallast: M.railwayBallast,
  railwaySleepers: M.railwaySleepers,
  railwayRails: M.railwayRails,
  railwayTrack: M.railwayTrack,
  // SliceAndDice-style scatter rule DSL (composable point-cloud layout rules)
  scatterAlongCurve: M.scatterAlongCurve,
  scatterGrid: M.scatterGrid,
  applyRules: M.applyRules,
  ruleCadence: M.ruleCadence,
  ruleWeightedFill: M.ruleWeightedFill,
  ruleScale: M.ruleScale,
  ruleScaleJitter: M.ruleScaleJitter,
  ruleJitterPosition: M.ruleJitterPosition,
  ruleYawJitter: M.ruleYawJitter,
  ruleMask: M.ruleMask,
  ruleThin: M.ruleThin,
  pruneMasked: M.pruneMasked,
  // density-driven layout (noise/normal -> density -> prune): natural thinning
  ruleDensityNoise: M.ruleDensityNoise,
  ruleNormalToDensity: M.ruleNormalToDensity,
  ruleDensityPrune: M.ruleDensityPrune,
  // proximity + orientation (UE PCG DistanceToNeighbors / LookAt) + self-pruning
  ruleDistanceToNeighbors: M.ruleDistanceToNeighbors,
  ruleLookAt: M.ruleLookAt,
  ruleSelfPruning: M.ruleSelfPruning,
  ruleSlopeFilter: M.ruleSlopeFilter,
  // spline / polygon clipping (keep points inside a boundary or curve band)
  ruleClipToPolygon: M.ruleClipToPolygon,
  ruleClipToCurveBand: M.ruleClipToCurveBand,
  // variant selection (UE PCG PointMatchAndSet): pick which library mesh per point
  ruleMatchAndSet: M.ruleMatchAndSet,
  ruleVariantBySlope: M.ruleVariantBySlope,
  ruleVariantByHeight: M.ruleVariantByHeight,
  // point-cloud query layer (RuleProcessor PointCloudQuery/SQL): inspect + slice
  where: M.where,
  selectRows: M.selectRows,
  pointRow: M.pointRow,
  gatherPoints: M.gatherPoints,
  aggregate: M.aggregate,
  pointCloudBounds: M.pointCloudBounds,
  groupBy: M.groupBy,
  partition: M.partition,
  histogram: M.histogram,
  // SliceAndDice rule TREE (Filter/Iterator/Generator branching layout)
  seq: M.seq,
  filter: M.filter,
  iterate: M.iterate,
  emitNode: M.emitNode,
  evalRuleTree: M.evalRuleTree,
  evalRuleTreeCached: M.evalRuleTreeCached,
  emptyRuleTreeCache: M.emptyRuleTreeCache,
  ruleKind: M.ruleKind,
  describeRuleTree: M.describeRuleTree,
  // architecture generators (parametric arch/column/pavilion/bridge-wall)
  archway: M.archway,
  column: M.column,
  pavilion: M.pavilion,
  bridgeWall: M.bridgeWall,
  // ruinify — weather/break an intact structure into a ruin
  ruinify: M.ruinify,
  crumbleTop: M.crumbleTop,
  erodeEdges: M.erodeEdges,
  knockChunks: M.knockChunks,
  // rock / cliff variants (one rule, N deterministic variants)
  rock: M.rock,
  rockVariants: M.rockVariants,
  archetypeRock: M.archetypeRock,
  // heightfield terrain (fbm base -> stamps -> erosion -> flatten under track)
  fbmHeightfield: M.fbmHeightfield,
  stampHeightfield: M.stampHeightfield,
  thermalErode: M.thermalErode,
  hydraulicErode: M.hydraulicErode,
  flattenUnderCurve: M.flattenUnderCurve,
  heightfieldToMesh: M.heightfieldToMesh,
  sampleHeight: M.sampleHeight,
  // vegetation (P7: procedural trees/shrubs/grass/conifer/palm — SpeedTree-style generator)
  tree: M.tree,
  shrub: M.shrub,
  grass: M.grass,
  conifer: M.conifer,
  palm: M.palm,
  curve1D: M.curve1D,
  sampleCurve1D: M.sampleCurve1D,
  shapeBranchesToEnvelope: M.shapeBranchesToEnvelope,
  constrainPointToEnvelope: M.constrainPointToEnvelope,
  envelopeRadiusScale: M.envelopeRadiusScale,
  frond: M.frond,
  fern: M.fern,
  fernFrond: M.fernFrond,
  needleCluster: M.needleCluster,
  branchFeatures: M.branchFeatures,
  branchFeatureMeshes: M.branchFeatureMeshes,
  windWeights: M.windWeights,
  foliageWindWeights: M.foliageWindWeights,
  windChannels: M.windChannels,
  combineWindChannels: M.combineWindChannels,
  billboardImposter: M.billboardImposter,
  imposterAtlasLayout: M.imposterAtlasLayout,
  buildTreeLOD: M.buildTreeLOD,
  gameExportProfile: M.gameExportProfile,
  buildTreeGameExport: M.buildTreeGameExport,
  treeGuideFromSilhouette: M.treeGuideFromSilhouette,
  buildTreeFromGuide: M.buildTreeFromGuide,
  vegetationSpeciesPreset: M.vegetationSpeciesPreset,
  buildSpeciesPlant: M.buildSpeciesPlant,
  growBranches: M.growBranches,
  branchesToMesh: M.branchesToMesh,
  branchFlareMesh: M.branchFlareMesh,
  scatterLeaves: M.scatterLeaves,
  leafCard: M.leafCard,
  leafMesh: M.leafMesh,
  crossQuad: M.crossQuad,
  crossLeafMesh: M.crossLeafMesh,
  gnarlCurve: M.gnarlCurve,
  growCurve: M.growCurve,
  curveFrameAt: M.curveFrameAt,
  // measure / size-matching (measure first, place by relative size)
  faceAreas: M.faceAreas,
  surfaceArea: M.surfaceArea,
  centerOn: M.centerOn,
  groundMesh: M.groundMesh,
  fitInto: M.fitInto,
  matchSize: M.matchSize,
  connectivity: M.connectivity,
  pointIslands: M.pointIslands,
  // blast (delete-by-selection) + cleanup
  blast: M.blast,
  blastByNormal: M.blastByNormal,
  blastByHeight: M.blastByHeight,
  keepIsland: M.keepIsland,
  cleanMesh: M.cleanMesh,
  // fields
  withAttributes: M.withAttributes,
  displaceField: M.displaceField,
  displaceAlongNormal: M.displaceAlongNormal,
  // shape-aligned material (per-vertex color driven by geometry)
  weatheredColor: M.weatheredColor,
  bakeVertexColors: M.bakeVertexColors,
  // terrain layering + RVT-style ground blend (color fields for coloredPart)
  terrainAutoMaterial: M.terrainAutoMaterial,
  groundBlendColorField: M.groundBlendColorField,
  // math / random
  vec3: M.vec3,
  vec2: M.vec2,
  makeNoise: M.makeNoise,
  fbm2: M.fbm2,
  makeRng: M.makeRng,
  // procedural clothing (avatar-conformed garments)
  buildAvatar: M.buildAvatar,
  buildTShirt: M.buildTShirt,
  buildSkirt: M.buildSkirt,
  buildPants: M.buildPants,
  buildDress: M.buildDress,
  buildHoodie: M.buildHoodie,
  buildGarment: M.buildGarment,
  buildBody: M.buildBody,
  buildCharacter: M.buildCharacter,
  torsoShell: M.torsoShell,
  limbSleeve: M.limbSleeve,
  solveCloth: M.solveCloth,
  getFabric: M.getFabric,
  // procedural architecture (parametric building generator)
  buildPcgBrickWallParts: M.buildPcgBrickWallParts,
  buildBuildingParts: M.buildBuildingParts,
  buildCityBlockParts: M.buildCityBlockParts,
  // urban city buildings (CitySample-style podium/shaft/crown modular towers)
  buildUrbanBuildingParts: M.buildUrbanBuildingParts,
  urbanDefaults: M.urbanDefaults,
  // Chinese classical timber hall (台基/柱/额枋/斗拱/曲面屋顶/墙/脊兽)
  buildChineseHallParts: M.buildChineseHallParts,
  // procedural quadrupeds (skeleton + cross-section skin template)
  buildQuadrupedParts: M.buildQuadrupedParts,
  buildReferenceDogParts: M.buildReferenceDogParts,
  // helpers
  part,
  coloredPart,
  surfacePart,
  vertexBlendSurface,
  Math,
};

/** Names exposed to the script, for prompt generation and docs. */
export const SCRIPT_API_NAMES: string[] = Object.keys(SCRIPT_API);

/**
 * A compact human/LLM-readable signature list. Used to build the system
 * prompt so the model knows exactly what it can call.
 */
export const SCRIPT_API_REFERENCE = `Available functions (call these, then \`return\` an array of part(...)):
PRIMITIVES:
  box(w=1,h=1,d=1) sphere(r=0.5,seg=16,rings=12) plane(w,d,cols,rows)
  cylinder(r=0.5,h=1,seg=24,caps=true) cone(r=0.5,h=1,seg=24,cap=true)
  torus(r=0.5,tube=0.2,seg=32,sides=16) icosphere(r=0.5,subdiv=1) circle(r=0.5,seg=32)
TRANSFORM/COMBINE:
  transform(mesh,{translate?:vec3,rotate?:vec3,scale?:vec3}) translateMesh(mesh,vec3)
  scaleMesh(mesh,vec3|number) merge(...meshes)
OPS:
  subdivide(mesh,n) displaceByNoise(mesh,{seed,scale,amount})
  indentCreases(mesh,[{from:vec3(...),to:vec3(...),depth?,width?}],{direction?,surfaceNormal?,normalThreshold?})
  array(mesh,count,offsetVec3)
  extrude(mesh,selection,distance) catmullClark(mesh,iterations)
UV PROJECTION (fix stretched textures after boolean/extrude/sweep — reproject before surfacePart):
  planarUV(mesh,{axis?:"x"|"y"|"z",scale?,offset?:vec2}) flat drop onto a world plane (floors/walls/decals), keeps vertex count
  boxUV(mesh,{scale?,offset?:vec2}) tri-planar: per-face pick nearest axis -> shear-free UVs on ANY shape (unwelds faces)
  cylindricalUV(mesh,{axis?,center?:vec3,vScale?,uRepeat?}) angle=u height=v, seam-fixed (pipes/cables/trunks)
  sphericalUV(mesh,{center?:vec3,uRepeat?}) lat-long mapping (balls/domes/gems), seam-fixed
  normalizeUV(mesh) rescale existing UVs into the [0,1] tile, aspect-preserving
  transformUV(mesh,{scale?:number|vec2,rotateDeg?,offset?:vec2}) tile/rotate/shift existing UVs
TRIM SHEETS (one atlas, many parts — the SKYLARK/SideFX memory + draw-call win. Pack material bands into ONE
  texture, then point each part's UVs at the band it needs. Bake the sheet ONCE and reuse across a whole prop set):
  makeTrimSheet([{name,fields,weight?,physical?},...],{gutter?}) -> sheet  // stack strips bottom->top along V
  architecturalTrim({seed?,gutter?}) -> sheet  // ready-made bands: "wood","plank","metal","plaster"
  trimStripBand(sheet,name) -> {v0,v1} | null  // the atlas band for one strip
  trimStripNames(sheet) -> [name,...]
  mapUVToTrimBand(mesh,{v0,v1,uTile?,uOffset?,from?:"u"|"v",normalize?}) -> Mesh  // squeeze a part's V into a band
  trimSheetFields(sheet) -> MaterialFields  // collapse the sheet to one bakeable recipe
  // Flow: box/plane a part -> boxUV/planarUV it -> mapUVToTrimBand(mesh,trimStripBand(sheet,"wood")) ->
  //   surfacePart uses the shared atlas. All parts sharing a sheet share ONE texture.
  vertexBlendSurface(name,mesh,sheet,[{strip,weight},...],{attributes?,blend?:{uFrom?,uTile?,localV?}}) -> part
    // M_Trim_Vertex: ONE part transitions across several strips by per-vertex weight, baked to vertex colors.
    // weight is a number, an attribute name (array in attributes, length=verts), or (ctx)=>number; weights
    // normalize per vertex. e.g. a wall that fades wood->plaster: weight by height. All parts sharing a sheet
    // share the atlas. trimBlendColorField(sheet,layers,opts) -> the raw (ctx)=>[r,g,b] field if you need it.
REMESH (rebuild clean uniform topology — run after boolean/heavy extrude before subdivide/smooth/unwrap):
  voxelRemesh(mesh,{resolution?=32,padding?=0.05}) VDB-style: mesh->SDF->marching cubes; one watertight shell, even faces. Lossy: rounds sharp corners + drops sub-cell thin features. Keep resolution 16-64 (cost ~cubic).
DCC EDIT (topology operators — clean panels, hard-surface edges, shells):
  extrudeRegion(mesh,{faces?:[i],normalDir?:vec3,angleDeg?},{distance?,direction?:vec3,taper?})
    lift a connected face region along its normal; side walls only on the region border
  insetFaces(mesh,{faces?,normalDir?,angleDeg?},{amount?}) shrink faces inward, leave a rim
  bevelEdges(mesh,{width?,segments?}) chamfer all edges (hard-surface crisp edges; flat 1-seg)
  solidify(mesh,{thickness?,offset?}) give an open surface thickness (shell), stitch borders
  bridgeLoops(mesh, loopA:[vec3], loopB:[vec3], {flip?,shift?}) quad band between two equal-length loops
SHAPE BUILDERS (revolve / sweep / loft / rounded — few params -> recognizable models):
  lathe(profile:[vec2(radius,height)], {segments?,angle?,caps?}) revolve a profile around Y (bottles/cups/wheels/columns)
  profileSweep(curve, profile:[vec2], {scaleAt?,closed?,caps?}) sweep a 2D section along a curve (rails/frames/mouldings)
  loft(rings:[[vec3]], {closed?,caps?}) skin a surface through equal-length cross-section rings (hulls/petals)
  capsule(radius=0.4,height=1,segments=24,rings=6) watertight pill/limb/blockout
  roundedBox({width?,height?,depth?,radius?,steps?}) box with filleted edges (casings/props/furniture)
  rectProfile(hw,hh) lProfile(w,h,t) ready-made profiles for profileSweep
  segmentedTube(spine:[vec3], {sides?,radius?,radiusAt?:(t)=>n,segments?,segmentPinch?,segmentBulge?,caps?})
    skin ONE continuous tube along a spine of points — the correct way to build an
    insect/worm abdomen, tail, tentacle, finger, snake. radiusAt tapers it; segments>0
    adds periodic ring bulges/pinches (segmented body). NEVER build a continuous body
    as a row of separate spheres — that leaves seams/beads. Use this instead.
DEFORMERS (cheap per-vertex shape control — apply AFTER building a primitive/tube):
  bendMesh(mesh,{axis?,towards?,angle?}) arc a straight mesh into a curve (arching tail/horn/hook/bent pipe)
  taperMesh(mesh,{axis?,startScale?,endScale?,curve?}) scale cross-section along axis (cone limb, tapering tail)
  twistMesh(mesh,{axis?,angle?,center?}) spiral cross-sections around axis (drill/horn/shell/screw)
  stretchMesh(mesh,{axis?,factor?,pivot?}) elongate/squash along one axis only
    axis is "x"|"y"|"z" or a unit vec3. These return a new deformed mesh.
CLOTH PHYSICS (deterministic XPBD — drop fabric and let it settle into real folds):
  simulateCloth(mesh,{iterations?,passes?,gravity?,gravityDir?,damping?,stretchStiffness?,
    bendStiffness?,wind?,colliders?,collisionOffset?,pin?,pinAboveY?,pinTopBand?}) -> Mesh
    Feed a subdivided plane (plane(w,d,cols,rows)); pin anchors then it drapes/hangs.
    colliders: [{kind:"ground",y?},{kind:"sphere",center,radius},{kind:"plane",point,normal}].
    pin(p,i)->bool fixes verts (flags/tablecloths); pinTopBand/pinAboveY pin the top.
    stretchStiffness 0..1 (silk≈0.6/canvas≈0.95), bendStiffness 0..1 (limp..cardboard).
  clothStrain(restMesh,settledMesh) -> number  mean per-edge stretch (settle/stress metric)
IMPLICIT FUSION (melt overlapping blobs into ONE seamless skin — the right way
  to join a head to a thorax, limbs to a torso, beads into a body — no seams):
  metaballs([{center:vec3,radius,strength?}], {iso?,resolution?,padding?}) -> Mesh
  fuseSpheres([{center:vec3,radius}], {resolution?}) -> Mesh  // convenience over metaballs
    Overlapping balls blend smoothly; higher resolution = smoother + slower (32 default).
    Use for organic creatures/characters where parts must read as one continuous body.
CUT / SELECTION (deterministic knife + DCC component selection):
  planeCut(mesh,{point:vec3,normal:vec3},{keep?:"positive"|"negative"|"both",cap?}) slice along a plane
  loopCut(mesh,{point:vec3,normal:vec3},{cuts?}) insert N supporting edge rings (no removal)
  knifeCut(mesh, path:[vec3], {direction?:vec3,projectToSurface?}) inscribe a path as new edges; projectToSurface follows curvature
  selectFacesByNormal(toTopo(mesh),dir:vec3,angleDeg?) -> [faceIndex]
  growSelection(topo,faces[],steps?) shrinkSelection(topo,faces[],steps?) selectionBoundary(topo,faces[])
  toTopo(mesh) -> topology view; diagnose(topo) -> {borderEdges,nonManifoldEdges,isClosed,...}
  hardEdges(toTopo(mesh),angleDeg?) -> [{a,b,faces}] the sharp (crease) edges — the ones worth beveling
  // Crisp hard-surface edges: bevelEdges(mesh,{width,segments}) chamfers/rounds ALL edges;
  // roundedBox(...) is the fast path for a chamfered block. Selective per-edge bevel isn't
  // available yet, so model crisp+soft by ASSEMBLING beveled parts rather than one bevel pass.
BOOLEAN:
  union(a,b) subtract(a,b) intersect(a,b)
  subtractAll(base, cutters:[mesh]) drill/cut MANY tools at once (merges them, subtracts once)
  unionAll([mesh]) combine many solids into one (cleans between steps)
  // Chained subtracts on the SAME solid can fail (CSG cracks). For many holes,
  // use subtractAll(...) or punchHoles(...) instead of a subtract loop.
MECHANICAL PARTS (hard-surface kit — build engineered models by ASSEMBLING these
  parametric parts + boolean, the way OpenSCAD/BOSL2 do; far cleaner than blobs):
  prism(outline:[vec2(x,z)], height?) extrude a closed CCW 2D outline into a solid along Y
  regularPolygon(sides, size, acrossFlats?) -> [vec2] ; acrossFlats sizes by wrench flat-to-flat (nuts)
  hexPrism(acrossFlats?, height?) solid hex prism (bolt head / standoff / spacer)
  hexNut({acrossFlats?,height?,boreRadius?,boreSegments?}) hex prism with a concentric through-bore
  boredPrism(outline:[vec2], height, boreRadius, boreSegments?) any prism with a centered round bore (washers/rings)
  gear({teeth?,module?,thickness?,pressureAngle?,boreRadius?,boreSegments?}) spur gear disk (module=pitchDia/teeth)
  gearOutline({teeth?,module?,pressureAngle?}) -> [vec2] just the toothed profile (feed to prism/extrude)
  threadedRod({radius?,length?,pitch?,depth?,segments?}) shaft with a helical V-thread ridge (screws/rods)
  bolt({radius?,length?,pitch?,headAcrossFlats?,headHeight?}) threaded shaft + hex head, ready to place
  ringGear({teeth?,module?,thickness?,pressureAngle?,rimWidth?}) internal ring gear (planetary housing; match module to sun/planet)
  annularPrism(outer:[vec2], inner:[vec2], height) solid between two concentric CCW outlines (any bore/tooth profile)
  flange({radius?,thickness?,boreRadius?,boltHoles?,boltHoleRadius?,boltCircleRadius?,segments?}) pipe flange w/ bolt-hole ring
  boltHoleCircle(count, boltCircleRadius, y?, phase?) -> [vec3] evenly spaced fastener centers (feed copyToPoints or punchHoles)
  punchHoles(solid, centers:[vec3], holeRadius, depth, segments?) drill vertical holes through a solid (unions cutters, subtracts once)
  // Parts stand along +Y; translateMesh/transform them into an assembly, then merge or boolean.
SCATTER:
  poissonScatter(target,instance,{count,seed,scaleRange?,randomYaw?,alignToNormal?})
HOUDINI-STYLE FLOW:
  scalarRamp([{t,value},...],{smooth?}) -> (t)=>number
  makePointCloud({points,normals?,attributes?}) pointCount(pc)
  surfacePointCloud(mesh,{count,seed}) poissonPointCloud(mesh,{count,seed,candidates?})
  storePointAttribute(pc,name,number|(ctx)=>number) pointAttribute(name,fallback?)
  filterPoints(pc,field,threshold=0.5)
  instancePlanFromPoints(pc,meshOrMeshes,{scale?,yaw?,variant?,alignToNormal?})
  instanceCount(plan) realizeInstances(plan) copyToPoints(pc,meshOrMeshes,opts)
  vectorRamp([{t,value:[r,g,b]},...],{smooth?}) -> (t)=>vec3  // gradient of colors/vectors
HIERARCHICAL ASSEMBLY (UE PCG ApplyHierarchy / CopyPointsWithHierarchy — scatter a composed unit, not one mesh):
  realizeAssembly({parts:[{mesh,offset?,rotate?,scale?},...]}) -> Mesh  // pre-bake a group into one unit
  copyAssembliesToPoints(pc, assemblyOrAssemblies, opts) -> Mesh  // scatter whole assemblies (variant picks which)
  partitionByAttribute(pc,attr,count) -> [pc,...]  // split a cloud into N sub-clouds by a floored attribute
  scatterToLayers(pc,attr,[{name,library,options?},...]) -> [{name,mesh,count},...]  // one mesh per layer
TEXT/SIGNAGE (procedural glyph geometry, XY plane, +Z facing, centered):
  textMesh(text,{height?,depth?,tracking?,fill?}) -> Mesh  // A-Z 0-9 -/. as extruded 5x7 dot-matrix strokes; place onto sign faces/plates
  textMeshWidth(text,{height?,tracking?}) -> number  // layout width for fitting text into a panel
  glyphSupported(ch) -> bool  // whether a char is in the font (case-insensitive)
CURVES:
  polyline(points[],closed?) bezier(p0,p1,p2,p3,seg) helix({radius,height,turns,segments})
  smoothCurve(curve,subdiv) resampleCurve(curve,{count?,segmentLength?}) curveLength(curve)
  sweep(curve,{radius,sides,radiusAt?,caps?})  // resample BEFORE sweep for even tubes (ropes/pipes/vines); a closed curve sweeps a seamless ring (no caps, seam twist auto-cancelled)
  parallelTransportFrames(points[],{closed?,initialNormal?:vec3}) -> [{position,tangent,normal,binormal}]  // rotation-minimizing frames: no twist flip when the curve goes vertical; use to orient your own profile/instances along a path
  curveTangents(points[],closed?) -> [vec3]  // unit tangents (wraps if closed)
RACE TRACK (curve-driven roads/rally tracks; feed a polyline path):
  bankedFrames(curve,{factor?,maxAngle?,smooth?,up?}) -> frames rolled by local curvature so the road leans into corners (factor 0 = flat, 1 = natural bank); reuse to orient your own road section
  trackSurface(curve,{width?,coving?,covingDrop?,bank?,widthAt?}) sweep a road strip; coving>0 flares a skirt down from each edge to blend into terrain (no floating road); bank:{factor} tilts corners
  instanceAlongCurve(curve, meshOrArray, {spacing?,count?,offset?,endsOffset?,bank?,scaleAt?,yawAt?,variantAt?}) resample to even spacing and stamp props along the road — guard rails/cones/tyre stacks/fence posts; offset rides the banked sideways axis (put rails on the edge), endsOffset trims the start/finish
VINES / CREEPERS (grown by a seeded gravity+wander walk, then swept — never baked meshes):
  buildVineParts({seed,mode,length,radius,branches,branchDepth,leafDensity,leafSize,wander,gravity,origin,heading}) -> [stem,leaves]
  buildVineStemMesh(opts) -> Mesh   // just the woody tube(s), no leaves
  buildVinePreset("hanging"|"ivy"|"creeper"|"liana",override?) -> parts
  growVineStrands(opts) -> [{curve,radius,depth}]  // strand centerlines for custom sweeping/scatter
  // mode: "hanging"(droops under gravity) | "climbing"(grows up a wall) | "creeping"(ground runner)
SURFACE-CLIMBING IVY (vines that ADHERE to a column/wall and spiral up — for ruins/architecture):
  cylinderSurface({center,radius,height}) / wallSurface({origin,normal,up,width,height}) -> ClimbSurface
  meshSurface(mesh,{up?}) -> ClimbSurface  // grow vines on ANY mesh (ruins/rocks/statues), closest-point projection
  buildClimbingVineParts(surface,{seed,strands,radius,climb,weave,wander,leafDensity,branches,length}) -> [stem,leaves]
  growClimbingStrands(surface,opts) -> strands  // climb=up drive, weave=winding (helix on a column)
  buildIvyRuinsParts({seed,columns,columnRadius,ivyPerColumn,leafDensity,lushness}) -> ivy-covered ruin scene
ROOTS (grown DOWN+OUT by the same gravity+wander walk, then swept — mirror of vines):
  buildRootsParts({seed,mode,count,collarRadius,length,radius,branches,branchDepth,wander,spread,origin}) -> [roots]
  buildRootMesh(opts) -> Mesh   buildRootPreset("flare"|"erosion"|"taproot",override?) -> parts
  growRootStrands(opts) -> [{curve,radius,depth}]  // mode: flare(buttress) | erosion(exposed embankment) | taproot(plunge)
ROCK FORMATIONS (fuse spheres -> fBm noise displace -> strata plane-cut — grown, never scanned):
  buildRockFormationParts({seed,mode,radius,height,blobs,resolution,crag,cragFrequency,strata,color}) -> [rock]
  buildRockFormationMesh(opts) -> Mesh   buildRockPreset("boulder"|"shelf"|"cliff",override?) -> parts
  // mode: boulder(rounded blob) | shelf(flat-top ledge) | cliff(tall stacked strata)

ROADS (flat ribbon swept along a centerline curve on the XZ ground plane):
  roadRibbon(centerline,{halfWidth,sampleDistance,widthSubdivisions,adaptiveCurvature,curvatureThresholdDeg,verticalOffset,uvLengthScale}) road surface
  roadCurbs(centerline,{halfWidth,curbHeight,curbWidth,...}) raised edge curbs; merge with the ribbon
  roadCenterLine(centerline,{halfWidth,lineWidth,...}) thin painted centerline strip lifted above the road
  roadLaneLines(centerline,{halfWidth,lanes,lineWidth,dashed,dashLength,gapLength,skipCenter}) dashed lane-divider lines
    for a multi-lane road (lanes-1 dividers; skipCenter leaves the middle for a separate double line)
  roadEdgeLines(centerline,{halfWidth,lineWidth,edgeInset}) solid white lines bounding both outer edges
  // Paint lines with surfacePart(...,"plastic",{color:[1,1,1]}) (white) or [0.8,0.7,0.1] (yellow center).
FREEWAY / VIADUCT KIT (CitySample Kit_Freeway_A; sweep along the same centerline as the ribbon):
  roadMedianBarrier(centerline,{halfWidth,barrierHeight,barrierWidth,...}) central Jersey crash barrier
  roadGuardrail(centerline,{side(+1/-1),lateral,postSpacing,railHeight,postSize,...}) posts + rail beam along one edge
  roadDeck(centerline,{halfWidth,thickness,...}) solid box-beam slab with a real underside (elevated bridge deck)
  roadPillars(centerline,{spacing,radius,groundY,deckThickness,verticalOffset,...}) cylindrical support columns to the ground
  roadPierCaps(centerline,{spacing,capWidth,capHeight,capLength,deckThickness,...}) transverse cross-beams on top of the columns
  roadSignGantry(centerline,{spacing,halfWidth,clearance,poleRadius,beamThickness,panelSpan,panelHeight,overhang}) overhead sign bridge
  roadLightPoles(centerline,{side(+1/-1),lateral,spacing,poleHeight,poleRadius,armLength,lampSize,...}) roadside cantilever lamp standards along one edge
RAILWAY KIT (ballast bed + sleepers + two steel rails, swept along a centerline; ground-aligned so rails stay upright on curves):
  railwayBallast(centerline,{ballastTopWidth,ballastShoulder,ballastHeight,sampleDistance,verticalOffset}) trapezoidal crushed-stone embankment
  railwaySleepers(centerline,{gauge,sleeperSpacing,sleeperLength,sleeperWidth,sleeperHeight,...}) cross-ties arrayed at a pitch (wood/concrete)
  railwayRails(centerline,{gauge,railHeight,railHeadWidth,railFootWidth,...}) two I-beam steel rails offset by half the gauge
  railwayTrack(centerline,opts) ballast+sleepers+rails merged into one mesh (use the three builders for separate stone/wood/steel materials)
SCATTER RULE DSL (SliceAndDice-style: build a layout point cloud, pass it through composable
  deterministic rules, then copyToPoints to place a prop library. variant->which mesh, scale, yaw, mask):
  scatterAlongCurve(curve,{spacing,offset,bothSides,endPadding}) -> point cloud rowed along a curve
    (sidewalk/fence/planting), with "along"(0..1),"side"(+/-1),"yaw"(faces the curve) attributes
  scatterGrid({cols,rows,cellX,cellZ,y}) -> regular XZ grid cloud (plaza/lot/orchard) with "gx","gz"
  applyRules(pc,[rule,...]) -> run a point cloud through an ordered rule chain
  ruleCadence(every,feature,base?) every Nth slot gets variant=feature (lamp rhythm), rest keep base
  ruleWeightedFill(choices,{weights?,seed?}) fill still-unassigned points (variant<0) with a seeded weighted pick
  ruleScale(field,{multiply?}) / ruleScaleJitter(amount,seed) set/vary per-point "scale"
  ruleJitterPosition(amount,seed) / ruleYawJitter(amountRad,seed) break row/grid regularity, seeded
  ruleMask((ctx)=>bool) / ruleThin(keepProb,seed) mark points for removal; pruneMasked({dropUnassigned?}) drops them
  ruleDensityNoise({scale?,seed?,attr?,...}) noise-driven "density" attribute; ruleNormalToDensity({...}) slope->density
  ruleDensityPrune(seed) drop points where density is low (natural thinning on steep/sparse areas)
  ruleDistanceToNeighbors({attr?,maxDistance?,cellSize?}) store distance to nearest neighbor (spacing/crowding)
  ruleLookAt({target?,direction?}) orient each point (yaw toward a target or a fixed direction) — UE PCG LookAt
  ruleSelfPruning({radius,...}) remove points too close to a kept neighbor (Poisson-like de-clumping)
  ruleSlopeFilter({maxSlope?,minSlope?,up?}) HARD 0/1 slope gate: keep only points in [minSlope,maxSlope] (陡坡不长草 / cliff-only ivy) — UE NormalToDensity as a cutoff
  // maxSlope alone = "flat ground only"; minSlope alone = "steep faces only"; both = a slope band
  ruleClipToPolygon([[x,z],...],{inside?}) / ruleClipToCurveBand(curve,{halfWidth,inside?}) keep points inside a boundary
  ruleMatchAndSet({cases:[{when:(ctx)=>bool,variant:int},...],fallback?,attribute?}) per-point variant by first matching case (UE PointMatchAndSet)
  ruleVariantBySlope({thresholds:[rad,...],variants:[int,...],up?}) pick variant by surface slope (flat->climb->cliff)
  ruleVariantByHeight({thresholds:[y,...],variants:[int,...]}) pick variant by world height (altitude zoning)
  // Then: copyToPoints(prunedCloud, [meshA,meshB,...], {variant:pointAttribute("variant"),
  //   scale:pointAttribute("scale",1), yaw:pointAttribute("yaw"), alignToNormal:false})
POINT-CLOUD QUERY (RuleProcessor PointCloudQuery/SQL — inspect & slice a cloud; all pure, deterministic):
  where(pc,(ctx)=>bool) -> keep matching points (WHERE), carries all attributes
  selectRows(pc,(ctx)=>bool?) -> [{index,x,y,z,...attrs}] flat records (SELECT); pointRow(pc,i) for one
  gatherPoints(pc,[i,...]) -> rebuild a cloud from source indices (reorder/subset/duplicate)
  aggregate(pc,field) -> {count,sum,min,max,mean} over a scalar column (COUNT/SUM/AVG)
  pointCloudBounds(pc) -> {min,max,center,size} XYZ box of the live points
  groupBy(pc,keyField) -> Map<intKey,PointCloud> bucket by a floored key column (GROUP BY)
  partition(pc,(ctx)=>bool) -> {inside,outside} split by predicate (the FILTER split)
  histogram(pc,field,bins=10) -> {counts,min,max,binWidth} bucket a column
    field is a number, an attribute via pointAttribute("h"), or (ctx)=>number.
SLICEANDDICE RULE TREE (branching layout, the UE RuleProcessor node types; build a tree, then evalRuleTree):
  seq([rule,...], then?, label?) SEQUENCE: apply linear ScatterRules, then descend into the then-child
  filter((ctx)=>bool, {inside?,outside?}, label?) FILTER: split points; route each half to a subtree
  iterate(keyField, body, label?) ITERATOR: group by key, run the body once per group
  emitNode((pc)=>items[], label?) GENERATOR: leaf that turns its points into output items (any type T)
  evalRuleTree(pc, node) -> items[]  // walk the tree, collect all generator output (inside before outside)
  evalRuleTreeCached(pc, node, cache?) -> {items,recomputed,reused}  // reuses unchanged subtrees
  emptyRuleTreeCache() -> cache to thread across iterations; describeRuleTree(node) -> outline; ruleKind(node)
  // Pattern for a city: grid cloud of lots -> filter(big vs small) -> per-branch emitNode returns
  //   [...buildUrbanBuildingParts({...})] positioned at the lot; flatten to a NamedPart[] scene.
ARCHITECTURE (parametric structure generators — params -> recognizable masonry, then compose/ruinify):
  archway({span?,pierHeight?,pierWidth?,depth?,ringThickness?,archStyle?:"round"|"pointed",keystone?,segments?}) gate/doorway ring on two piers
  column({height?,radius?,segments?,taper?,flutes?,fluteDepth?,base?,capital?}) classical fluted column w/ plinth+capital
  pavilion({size?,depth?,columnHeight?,columnRadius?,columnsPerSide?,roof?:"hip"|"flat"|"dome",roofRise?,platform?}) open colonnade + roof
  bridgeWall({length?,height?,thickness?,openings?,style?:"baluster"|"crenel"|"solid",coping?}) parapet/balustrade run
  buildPcgBrickWallParts({length?,height?,depth?,columns?,rows?,curveDepth?,brickScale?,mortar?,stagger?,jitter?,seed?})
    -> NamedPart[] UE-PCG-style curved running-bond brick wall: real bricks + dark recessed mortar backing
RUINIFY (turn an intact structure into a weathered ruin — a capability, feed it any building mesh):
  ruinify(mesh,{seed?,crumble?,erosion?,chunks?,chunkSize?,cusp?}) full pass: crumble top -> knock chunks -> erode edges
  crumbleTop(mesh,amount,seed?) bite jagged chunks off the upper region  | erodeEdges(mesh,amount,seed?) weather the silhouette
  knockChunks(mesh,count,sizeFrac,seed?) subtract missing-masonry bites   // e.g. ruinify(archway({span:3}),{seed:7,crumble:0.5})
ROCK / CLIFF (one rule, N deterministic variants — no static mesh dumps):
  rock({seed?,radius?,detail?,lumpiness?,roughness?,stretch?:vec3,flatBase?,cusp?}) one boulder/cliff (fbm-displaced icosphere)
  rockVariants(count,{seed?,...rockOpts}) -> Mesh[]  // a natural family from one seed (stretch/lumpiness auto-jittered)
  archetypeRock("boulder"|"slab"|"spire"|"eroded"|"strata",{seed?,strata?,strataBands?,...rockOpts})  // named silhouette recipe; strata adds horizontal sedimentary banding
TERRAIN (heightfield pipeline; deterministic; combine ops then heightfieldToMesh):
  fbmHeightfield({cols?,rows?,size?,seed?,amplitude?,featureScale?,octaves?,ridged?}) -> Heightfield  // ridged 0=hills 1=mountain crests
  stampHeightfield(hf,[{x,z,radius,height,shape?:"cone"|"dome"|"crater"|"plateau"}]) -> Heightfield  // add peaks/craters/mesas
  thermalErode(hf,{iterations?,talus?,strength?}) -> Heightfield  // slump cliffs into scree
  hydraulicErode(hf,{iterations?,rain?,capacity?,solubility?,evaporation?}) -> Heightfield  // carve valleys/gullies with water
  flattenUnderCurve(hf,curve,{width?,falloff?,raise?}) -> Heightfield  // press a buildable pad under a track centreline
  heightfieldToMesh(hf,{cusp?}) -> Mesh   //  sampleHeight(hf,wx,wz) -> y  to sit props on the ground
VEGETATION (P7: procedural trees/shrubs/grass — recursive spline branches + leaf cards):
  tree({seed,height?,trunkRadius?,branchCount?,depth?,branchAngle?,leafDensity?,leafSize?,leaves?,leafShape?,leafCurl?,leafFold?,branchFlare?,
    branchLengthProfile?,branchRadiusProfile?,branchAngleProfile?,branchCountProfile?,leafDensityProfile?,
    canopy?:{shape?:"ellipsoid"|"cone"|"column"|"umbrella",baseY?,height?,radiusX?,radiusZ?,strength?},
    branchFeatures?:true|{count?,kind?:"mixed"|"knot"|"burl"|"scar",size?}}) -> {wood,leaves,branches,features?}
  shrub({seed,height?,stems?,stemRadius?,spread?,leafDensity?,leafSize?,leafShape?}) -> {wood,leaves,branches}
  grass({seed,blades?,area?,height?,bend?,width?}) -> {wood(empty),leaves,branches}
  conifer({seed,height?,trunkRadius?,whorls?,perWhorl?,needleDensity?}) -> {wood,leaves} // pine/spruce cone shape, needle clusters
  palm({seed,height?,trunkRadius?,fronds?,frondLength?,lean?}) -> {wood,leaves} // leaning ringed trunk + arching fronds
  vegetationSpeciesPreset("oak"|"maple"|"birch"|"willow"|"pine"|"spruce"|"palm"|"shrub", overrides?) -> species rules/material colors
  buildSpeciesPlant(species, overrides?) -> {wood,leaves,branches} // species-specific tree/conifer/palm/shrub
  buildTreeLOD(treeOptions) -> {high,mid,low,imposter,imposterDistance} // progressive LOD: fewer branches/leaves + billboard
  gameExportProfile("hero"|"realtime"|"mobile"|overrides?) -> LOD distances + atlas + wind packing + material slots
  buildTreeGameExport(treeOptions, profile?) -> {profile,lod,stats,wind} // engine-ready metadata around tree LOD
  treeGuideFromSilhouette({height?,crownWidth?,crownDepth?,trunkLean?,crownBasePct?,shape?}) -> {trunk,canopy}
  buildTreeFromGuide(guide, treeOptions?) -> {wood,leaves,branches} // image/VLM guide spine + crown -> procedural tree
  curve1D(number|[{t,value}]|{value?,stops?,variance?,seed?,min?,max?}) -> (t,index?)=>number
  sampleCurve1D(input,t,fallback?,index?) -> number // deterministic SpeedTree-style curve/variance parameter
  shapeBranchesToEnvelope(branches,{shape,baseY,height,radiusX,radiusZ,strength}) -> BranchSegment[] // crown silhouette clamp
  branchFeatures(branches,{seed?,count?,kind?,size?}) -> feature metadata
  branchFeatureMeshes(branches,{seed?,count?,kind?,size?}) -> Mesh // knots/scars/burls on bark
  frond(rachisCurve,{pairs?,leafletLength?,leafletWidth?,angle?,rachisRadius?}) -> {stem,blades} // palm/fern leaf blade
  fern({fronds?,pitch?,bendStrength?,length?,segments?,leafletLength?,leafletWidth?,leafletAngle?,windPhase?,windStrength?}) -> Mesh // Vercidium vertex-shader-style fern: fronds fanned by golden angle, each a bending rachis of leaflet cards
  fernFrond({segments?,pitch?,yaw?,bendStrength?,length?,leafletLength?,leafletWidth?,leafletAngle?,windPhase?,windStrength?}) -> Mesh // one bending fern frond (pitch/yaw dir + bentPitch curl)
  needleCluster(center,dir,{count?,length?,spread?}) -> Mesh // pine needle tuft
  windWeights(mesh,{heightInfluence?,radialInfluence?}) -> number[] // per-vertex 0..1 wind weight (root=0,tip=1); pass as part.windWeight for viewer sway
  foliageWindWeights(mesh,base?,jitter?) -> number[] // uniform-high weights for leaf/grass meshes
  windChannels(mesh,{kind?:"wood"|"foliage"|"grass"|"frond",seed?}) -> {trunkBend,branchSway,leafFlutter,phase,combined}
  combineWindChannels(channels,{trunk?,branch?,leaf?}) -> number[] // pack channels to current viewer windWeight
  billboardImposter(sourceMesh,{cards?,height?,width?,uvRect?}) -> Mesh // far-LOD crossed cards sized to a tree's bounds
  imposterAtlasLayout({views?,rows?}) -> {cells:[{azimuth,uvRect}]} // multi-view atlas UV layout for imposters
  // tree/shrub/grass return separate meshes: surfacePart the .wood as "bark", the .leaves as a thin/translucent leaf material
  growBranches(parentCurve,parentRadius,{seed,count,depth,angle,phototropism?,gravity?,startPct?,endPct?,radiusScale?,lengthScale?}) -> BranchSegment[]
  branchesToMesh(branches,{sides?,flare?,flareScale?}) branchFlareMesh(branch,{sides?,flareScale?}) -> Mesh
  scatterLeaves(branches,{seed,perBranch?,size?,upBias?,cross?,shape?:"quad"|"oval"|"lanceolate"|"teardrop"|"round",curl?,fold?}) -> Mesh
  leafCard(center,normal,up,w,h) crossQuad(center,normal,up,w,h)  // single / crossed leaf quads
  leafMesh(center,normal,up,w,h,{shape?,segments?,curl?,fold?}) crossLeafMesh(center,normal,up,w,h,opts?) // procedural leaf silhouette
  gnarlCurve(curve,{seed,amount,frequency?}) growCurve(start,dir,len,{segments?,phototropism?,gravity?,gnarl?,seed?}) curveFrameAt(curve,t)->{position,tangent,normal,binormal}
MEASURE / PLACEMENT (measure first, place by relative size — robust multi-part assembly):
  faceAreas(mesh)->number[] surfaceArea(mesh) connectivity(topo)->{faceIsland,count} pointIslands(topo)->{pointIsland,count}
  centerOn(mesh,target=origin) groundMesh(mesh) fitInto(mesh,vec3(sx,sy,sz),{uniform?,recenter?}) matchSize(mesh,refMesh,{uniform?})
BLAST / CLEANUP (delete-by-selection + post-boolean tidy):
  blast(mesh,(f)=>bool,{keep?}) // f={index,center,normal,area,a,b,c}; default deletes selected, keep:true keeps only selection
  blastByNormal(mesh,axis,threshold=0.5,{keep?}) blastByHeight(mesh,axis,min,max,{keep?}) keepIsland(mesh,islandId)
  cleanMesh(mesh,tol=1e-4) // weld coincident points + drop degenerate faces (run after boolean/merge)
MATH/RANDOM:
  vec3(x,y,z) vec2(x,y) makeNoise(seed) fbm2(noise,x,y,{octaves?}) makeRng(seed)
CLOTHING (procedural garments draped on a parametric avatar; returns part arrays already):
  buildTShirt({measures?:{chest?,height?,...},chestEase?,bodyLength?,sleeveLength?,neckDrop?,fabric?,seed?})
  buildSkirt({measures?,length?,flare?,hipEase?,waistEase?,fabric?,seed?})
  buildPants({measures?,length?,legOpening?,thighEase?,hipEase?,fabric?,seed?})
  buildDress({measures?,chestEase?,waistline?,skirtLength?,flare?,sleeveLength?,neckDrop?,fabric?,seed?})
  buildHoodie({measures?,chestEase?,bodyLength?,sleeveLength?,hoodScale?,pocket?,fabric?,seed?})
  buildGarment("tshirt"|"skirt"|"pants"|"dress"|"hoodie", params)  // dispatch by id
  buildBody(buildAvatar(measures), {segments?,skinColor?,head?})   // skin body NamedPart
  buildCharacter({measures?, garments:[{template,params}], body?}).parts  // body + clothes, all fit
  fabric is one of "cottonJersey"|"denim"|"wool"|"leather"|"silk".
  These return NamedPart[] directly — spread into your return: return [...buildTShirt({}), ...buildPants({})].
ARCHITECTURE (parametric building: footprint -> floors -> facade grid -> windows -> roof):
  buildBuildingParts({floors?,floorHeight?,width?,depth?,baysX?,baysZ?,windowRatio?,
    setback?,groundFloorScale?,roof?:"flat"|"hip"|"gable",roofHeight?,corners?,
    balconyEvery?,canopy?,seed?})
  Returns NamedPart[] with matched materials (concrete walls/slabs/pilasters, metal window
  frames, glass panes, metal door/rails, concrete/ceramic roof). Windows placed per bay via
  copy-to-points; "lit" window variant is seeded (deterministic). setback>0 tapers the tower.
  corners adds corner pilasters; balconyEvery>0 adds front balconies every N floors;
  canopy adds an entrance awning. Spread into your return: return [...buildBuildingParts({floors:10})].
  buildCityBlockParts({cols?,rows?,lotX?,lotZ?,minFloors?,maxFloors?,ground?,roads?,
    roadWidth?,sidewalkWidth?,faceStreet?,seed?,base?})
  Grid of seeded building variants (a street/block). Each lot gets random floors/roof/
  balconies from the master seed (deterministic); parts merged by name across buildings.
  roads (rows>=2) adds a central carriageway + sidewalks + dashed centre line, splitting
  rows into two bands lining the street; faceStreet rotates the far band so every front
  faces the road. base is a Partial building-params applied to every building.
  buildUrbanBuildingParts({style,floors?,floorHeight?,width?,depth?,baysX?,baysZ?,
    podiumFloors?,podiumOverhang?,setbackEvery?,setbackAmount?,facade?:"punched"|"ribbon",
    windowRatio?,verticalPiers?,crown?:"flat"|"stepped"|"spire"|"mansard"|"watertank",crownHeight?,seed?})
  Modern CITY building (CitySample-style modular kit): a wider PODIUM base -> a repeated
  SHAFT of standard floors (stepped back in tiers when setbackEvery>0) -> a CROWN
  (flat parapet / stepped ziggurat / spire / mansard / rooftop water tank). Facade is a
  bay grid: "punched" = discrete framed windows, "ribbon" = horizontal vision bands.
  style is one of "artDeco"|"glassTower"|"brickWalkup"|"modernOffice"|"brownstone"|"corporate"
  and pre-sets a matched palette + massing; override any field. verticalPiers adds
  art-deco piers between bays; lit windows + roof plant are seeded (deterministic).
  urbanDefaults(style) returns the preset params. Spread: return [...buildUrbanBuildingParts({style:"artDeco",floors:20})].
  buildChineseHallParts({baysX?,baysZ?,bayWidth?,bayDepth?,columnHeight?,columnRadius?,
    baseHeight?,baseOverhang?,eaveOverhang?,roofRise?,roofConcavity?,cornerUpturn?,
    roof?:"hip"|"hipGable"|"gable",dougong?,ridgeBeasts?,walls?,seed?})
  Chinese classical timber HALL (殿堂): stone platform + steps, cinnabar column grid,
  green architrave tie-beams, 斗拱 bracket sets, and the defining CURVED HIP ROOF —
  concave 举架 pitch + upturned 翼角 corners + ridge/hip beasts + lattice front doors.
  Returns matched materials (stone/wood/ceramic tiles). roofConcavity bows the roof
  line; cornerUpturn lifts the corners. Spread into your return: return [...buildChineseHallParts({baysX:7})].
QUADRUPEDS (animal template: skeleton curve + cross-section skin, not sphere piles):
  buildQuadrupedParts({scale?,bodyLength?,bodyWidth?,legLength?,
    neckArch?,maneLength?,tailLength?,stride?}) -> NamedPart[]
  Returns one continuous body_skin (body+neck+head), four tapered legs, four feet,
  ears, eyes, optional mane/face details and tail with matched shortCoat/blackCoat/hair surfaces.
  buildReferenceDogParts({scale?,bodyLength?,bodyWidth?,legLength?,tailLength?,stride?})
    -> NamedPart[] tan short-coat dog preset with floppy ears, paws, black nose, mouth and tongue.
  Use generic quadruped for new animal blockouts before writing species-specific presets.
  Quality gates check continuous skin, side silhouette, limb layout,
  ground contact, material match and detail.
SHAPE-ALIGNED MATERIAL (color follows the geometry, never misaligns):
  weatheredColor({base?,topColor?,topThreshold?,topSoftness?,cavityColor?,cavityBelow?})
    -> returns a color field (ctx)=>vec3 using ctx.position / ctx.normal
  terrainAutoMaterial([{color,minSlope?,heightRange?,priority?}],{breakup?,softness?,seed?}) -> (pos,normal)=>rgb
    // UE auto-landscape: rock on steep faces, grass on flat tops, snow up high — pure code
  groundBlendColorField(objColorAt,groundColorAt,{groundY?,fade?,strength?,breakup?,seed?}) -> (pos,normal)=>rgb
    // RVT-style: a prop's base picks up the ground color it rests on (kills the "pasted-on" look)
  coloredPart(name, mesh, colorFn)  // bakes a color field to per-vertex colors
SURFACE MATERIAL (matched, generated WITH the model — pick the right physical type):
  surfacePart(name, mesh, type, params?)
    type is one of:
      "glass"        clear/tinted transmissive glass  params {tint?:[r,g,b],roughness?,thickness?}
      "liquid"       tinted transmissive liquid       params {tint?:[r,g,b],ior?}
      "metal"        polished metal                   params {color?:[r,g,b],roughness?}
      "brushedMetal" satin/brushed metal              params {color?:[r,g,b]}
      "carPaint"     glossy clearcoated paint         params {color?:[r,g,b]}
      "plastic"      smooth opaque plastic            params {color?:[r,g,b],roughness?}
      "fabric"       cloth/velvet with sheen          params {color?:[r,g,b]}
      "leather"      pebbled leather                  params {color?:[r,g,b],roughness?,grainScale?,grainStrength?,normalStrength?,clearcoat?}
      "emissive"     glowing surface                  params {color?:[r,g,b],intensity?}
      "iridescent"   pearlescent/soap-film            params {color?:[r,g,b]}
      "silk"         anisotropic satin/silk cloth      params {color?:[r,g,b],rotation?}
      "flakePaint"   metallic-flake sparkle paint      params {color?:[r,g,b],flake?}
      "jade"         translucent jade/wax (SSS look)   params {color?:[r,g,b],transmission?}
      "wetGround"    wet asphalt with puddle sheen     params {color?:[r,g,b],wetness?}
      "snow"         bright translucent snow cover     params {tint?:[r,g,b]}
      "sand"         granular rippled sand             params {color?:[r,g,b]}
      "mossyStone"   rock with moss in the cavities    params {moss?}
      "scratchedMetal" anisotropic scratched metal      params {color?:[r,g,b],density?,rotation?}
      "knit"         chunky knit/wool cloth             params {color?:[r,g,b],scale?}
      "bark"         deep-grooved tree bark             params {color?:[r,g,b],scale?}
      "neon"         saturated emissive (drives bloom)  params {color?:[r,g,b],intensity?}
      "leaf"         thin two-sided translucent leaf    params {color?:[r,g,b]}
      "grassBlade"   soft translucent grass blade       params {color?:[r,g,b]}
    STYLIZED / hand-painted (toon look — light is BAKED into the texture, for
    cartoon/stylized scenes; each takes {color?:[r,g,b], bands?:1..5}):
      "painterVertex"   flat toon color, cel light + brush grain   params {color?,bands?,shadow?,grain?}
      "stylizedPlaster" toon-mottled plaster wall                  params {color?,bands?}
      "stylizedRoof"    rounded cel-shaded roof tiles              params {color?,rows?}
      "brushPainted"    directional hand-painted brush strokes     params {color?,bands?}
      "stylizedMetal"   toon-banded metal                          params {color?,bands?}
      "stylizedFoliage" toon canopy/bush green                     params {color?,bands?}
    More types also exist (gem, marble, skin, velvet, wood, stone, brick, ceramic,
    concrete, carbonFiber, rubber, pearl, chrome, preciousMetal, ice, water, ...).
    Use surfacePart for objects whose material matters (a wine glass bowl is
    "glass", the wine is "liquid", a chrome stem is "metal"). Colors are linear 0..1.
    For soft cushions/chairs, prefer subdivided leather/fabric mesh plus
    indentCreases(...) for wrinkles/creases. Do not add thin rods for wrinkles.
    For dark leather chairs/cushions, prefer subtle grain:
    {roughness:0.7, grainScale:80, grainStrength:0.25, normalStrength:0.4}.
HELPER:
  part(name, mesh, [r,g,b])  // flat color; colors are linear 0..1
Return value: an array of part(...)/coloredPart(...)/surfacePart(...) OR a single mesh. Do NOT import anything.`;
