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
  // advanced geometry
  catmullClark: M.catmullClark,
  union: M.union,
  subtract: M.subtract,
  intersect: M.intersect,
  poissonScatter: M.poissonScatter,
  // Houdini-style middle layer
  scalarRamp: M.scalarRamp,
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
  // curves
  polyline: M.polyline,
  bezier: M.bezier,
  helix: M.helix,
  smoothCurve: M.smoothCurve,
  resampleCurve: M.resampleCurve,
  curveLength: M.curveLength,
  sweep: M.sweep,
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
  buildBuildingParts: M.buildBuildingParts,
  buildCityBlockParts: M.buildCityBlockParts,
  // procedural quadrupeds (skeleton + cross-section skin template)
  buildQuadrupedParts: M.buildQuadrupedParts,
  buildReferenceDogParts: M.buildReferenceDogParts,
  // helpers
  part,
  coloredPart,
  surfacePart,
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
BOOLEAN:
  union(a,b) subtract(a,b) intersect(a,b)
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
CURVES:
  polyline(points[],closed?) bezier(p0,p1,p2,p3,seg) helix({radius,height,turns,segments})
  smoothCurve(curve,subdiv) resampleCurve(curve,{count?,segmentLength?}) curveLength(curve)
  sweep(curve,{radius,sides,radiusAt?,caps?})  // resample BEFORE sweep for even tubes (ropes/pipes/vines)
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
