export const MODEL_USE_CATEGORIES = [
  "角色", "生物", "服装", "载具", "家具", "家电", "卫浴设施", "灯具",
  "机械", "工具与设备", "管线与机电", "道具与装饰", "建筑构件", "建筑", "室内空间",
  "城市与聚落", "道路与基建", "地图与关卡", "地形", "水体", "植被",
  "岩石与自然物", "环境场景", "技术演示",
];

const MODEL_USE_CATEGORY_SET = new Set(MODEL_USE_CATEGORIES);

const MODEL_NAME_SOURCE_PREFIX = /^(?:blender\s*howtos?|houdini\s*howtos?|cropout|poly\s*haven)\s*[:：·\-–—]?\s*/i;

export function normalizeModelName(value, fallback = "未命名模型") {
  let name = String(value || "").trim();
  if (!name) return fallback;
  name = name
    .replace(/^百景\s*\d*\s*[:：·\-–—]?\s*/i, "")
    .replace(/^[a-z0-9 ._-]+教程(?:复刻|模仿)\s*[:：·\-–—]?\s*/i, "")
    .replace(MODEL_NAME_SOURCE_PREFIX, "")
    .replace(/[（(][^）)]*(?:复刻|模仿)[^）)]*[）)]/gi, "")
    .replace(/^.+?(?:复刻|模仿)\s*[:：·\-–—]\s*/i, "")
    .replace(/(?:复刻|模仿)/g, "")
    .replace(/^[\s:：·\-–—]+|[\s:：·\-–—]+$/g, "")
    .replace(/[（(]\s*[）)]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return name || fallback;
}

const CATEGORY_BY_ID = {
  teddy: "角色",
  "cartoon-mech-pilot": "角色",
  "stylized-humanoid": "角色",
  "midnight-horse": "生物",
  "reference-dog": "生物",
  "grasshopper-voxel-bunny": "生物",
  dragonfly: "生物",
  tshirt: "服装",
  skirt: "服装",
  pants: "服装",
  dress: "服装",
  hoodie: "服装",
  "sports-car": "载具",
  "procedural-vehicle": "载具",
  "modular-rescue-rover": "载具",
  "gmc-canyon-at4x": "载具",
  "buick-riviera-1965": "载具",
  bicycle: "载具",
  "titan-train": "载具",
  officechair: "家具",
  "umbrella-table": "家具",
  "park-bench": "家具",
  wineglass: "道具与装饰",
  "interior-room": "室内空间",
  "procedural-building": "建筑",
  streetscene: "环境场景",
  freeway: "道路与基建",
  road: "道路与基建",
  railway: "道路与基建",
  viaduct: "道路与基建",
  pylon: "道路与基建",
  "wind-turbine": "道路与基建",
  "toll-station": "道路与基建",
  "tunnel-portal": "道路与基建",
  intersection: "道路与基建",
  "multilevel-interchange": "道路与基建",
  "tower-crane": "工具与设备",
  "rooftop-kit": "工具与设备",
  scaffolding: "工具与设备",
  "bus-stop": "道路与基建",
  billboard: "道路与基建",
  "container-yard": "道路与基建",
  "manhole-cover": "道路与基建",
  "barrier-run": "道路与基建",
  "fire-escape": "建筑构件",
  newsstand: "建筑",
  "traffic-signal": "道路与基建",
  "street-tree": "植被",
  "street-lamp": "道路与基建",
  "fire-hydrant": "道路与基建",
  "traffic-cone": "道路与基建",
  "freeway-sign": "道路与基建",
  "water-tower": "道路与基建",
  "kowloon-cyber-courtyard": "建筑",
  "wfc-rooftop": "建筑",
  "titan-rail": "道路与基建",
  "titan-fence": "道路与基建",
  "titan-cable": "道路与基建",
  "titan-adboard": "道路与基建",
  "titan-shrub": "植被",
  "titan-platform": "道路与基建",
  "titan-building": "建筑",
  "titan-stacking": "岩石与自然物",
  "titan-tree": "植被",
  "titan-cloth": "技术演示",
  "pcg-world": "环境场景",
  "town-scene": "环境场景",
  "pcg-plaza": "道路与基建",
  "pcg-colonnade": "道路与基建",
  "rt-plaza": "道路与基建",
  "rt-skyline": "城市与聚落",
  "race-track": "道路与基建",
  "braid-rope": "道具与装饰",
  roots: "植被",
  trashcan: "道具与装饰",
  "material-stack": "道具与装饰",
  "blend-ref-chinese-ornament": "道具与装饰",
  "blend-ref-book-row": "道具与装饰",
  "blend-ref-keyboard": "工具与设备",
  "blend-ref-tv-wall": "家具",
  "spatial-media-wall": "家具",
  "sweet-home-tv-console": "家具",
  "blend-ref-canopy-tree": "植被",
  "blend-ref-indoor-plant": "植被",
  "blend-ref-dracaena": "植被",
  "blend-ref-broadleaf-stand": "植被",
  "crazy-ivy-wall": "植被",
  "vine-ruin-arch": "建筑构件",
  "polyhaven-pastic-torch-6v": "灯具",
  "polyhaven-utility-box-01": "工具与设备",
  "polyhaven-wheelchair-01": "工具与设备",
  "polyhaven-spinning-wheel-01": "机械",
  "polyhaven-hand-plane-no4": "工具与设备",
  "polyhaven-bench-vice-01": "工具与设备",
  "polyhaven-drill-press-01": "工具与设备",
  "polyhaven-metal-tool-chest": "工具与设备",
  "polyhaven-modular-fire-escape": "建筑构件",
  "polyhaven-modular-wooden-pier": "道路与基建",
  "polyhaven-stone-fire-pit": "道具与装饰",
  "polyhaven-overhead-crane": "工具与设备",
  "polyhaven-garden-hose-wall-mounted-01": "管线与机电",
  "expansion-utility-water": "管线与机电",
  "expansion-utility-duct": "管线与机电",
  "expansion-utility-cable": "管线与机电",
  "polyhaven-industrial-pipes-01": "管线与机电",
  "polyhaven-modular-airduct-rectangular-01": "管线与机电",
  "polyhaven-modular-airduct-circular-01": "管线与机电",
  "polyhaven-modular-electric-cables": "管线与机电",
  bonsai: "植被",
  sphere: "技术演示",
  smooth: "技术演示",
  spring: "机械",
  gear: "机械",
  csg: "技术演示",
  remesh: "技术演示",
  "image-remesh": "技术演示",
  "fabcafe-houdini": "技术演示",
  "fabcafe-wavy-surface": "技术演示",
  "houdini-howtos": "技术演示",
  "houdini-howtos-field": "技术演示",
  "houdini-howtos-curve-graph": "管线与机电",
  "houdini-howtos-weave-pot": "道具与装饰",
  "houdini-howtos-sci-fi-panel": "工具与设备",
  "houdini-howtos-growth-urchin": "岩石与自然物",
  "houdini-howtos-bsp-dungeon": "地图与关卡",
  "houdini-howtos-voronoi-vase": "道具与装饰",
  "houdini-howtos-gradational-crystal": "岩石与自然物",
  "blender-howtos": "技术演示",
  "blender-spiral-scales": "技术演示",
  "blender-dna-helix": "技术演示",
  "blender-gradient-box": "技术演示",
  "blender-howtos-spiral-scales": "技术演示",
  "blender-howtos-dna-helix": "技术演示",
  "blender-howtos-gradient-box": "技术演示",
  "blender-raining-garden": "环境场景",
  "blender-howtos-raining-garden": "环境场景",
  "grasshopper-howtos": "技术演示",
  "grasshopper-rock-tile": "技术演示",
  "grasshopper-voronoi-pipe": "技术演示",
  "grasshopper-waffle-pattern": "技术演示",
  "grasshopper-reaction-diffusion": "技术演示",
  "grasshopper-packed-circle": "技术演示",
  "grasshopper-ribbon-loop": "技术演示",
  "grasshopper-image-field": "技术演示",
  "grasshopper-mesh-reaction-shell": "技术演示",
  "grasshopper-landscape-contour": "地形",
  "grasshopper-superformula-tower": "建筑",
  "grasshopper-origami-pavilion": "建筑",
  "pcg-rock-cluster": "岩石与自然物",
  "raycast-roof-garden": "植被",
  "raycast-asteroid-garden": "岩石与自然物",
  "raycast-cliff-lights": "道路与基建",
  "drawable-path-fence": "道路与基建",
  "masked-region-grove": "植被",
  "scatter-path-lights": "道路与基建",
  "stylized-lakeside-village": "环境场景",
  "stylized-tactical-island": "地图与关卡",
};

const CATEGORY_ALIASES = new Map([
  ["角色", "角色"], ["服装", "服装"], ["载具", "载具"], ["家具", "家具"],
  ["机械", "机械"], ["机械构造", "机械"], ["硬表面", "工具与设备"],
  ["建筑", "建筑"], ["城市", "城市与聚落"], ["城市与建筑", "城市与聚落"],
  ["建筑与城市", "城市与聚落"], ["基建", "道路与基建"],
  ["程序地牢", "地图与关卡"], ["程序化地图", "地图与关卡"],
  ["自然", "岩石与自然物"], ["地形", "地形"], ["地形与环境", "地形"],
  ["植被", "植被"], ["程序生态", "植被"], ["基础", "技术演示"],
  ["程序化城堡", "建筑"], ["B站城堡系列复刻", "建筑"],
  ["房子和花园", "环境场景"], ["风格化场景", "环境场景"],
  ["Low Poly 场景", "环境场景"], ["Blender 百景复刻", "环境场景"],
]);

const ENGLISH_WORDS = {
  clothing: ["tshirt", "shirt", "skirt", "pants", "dress", "hoodie", "clothing", "garment"],
  character: ["humanoid", "character", "pilot", "teddy"],
  animal: ["animal", "horse", "dog", "bunny", "rabbit", "dragonfly"],
  vehicle: ["vehicle", "rover", "car", "sedan", "coupe", "pickup", "truck", "bus", "train", "bicycle", "wagon", "van", "suv"],
  sanitary: ["toilet", "bathtub", "shower", "sink", "vanity", "washbasin"],
  appliance: ["refrigerator", "oven", "washer", "dishwasher", "stove", "television", "monitor", "copier", "kiosk", "aircon", "laptop"],
  lighting: ["lamp", "lantern", "chandelier", "light", "lighting"],
  furniture: ["furniture", "sofa", "chair", "table", "bench", "cabinet", "shelf", "storage", "wardrobe", "bookcase", "desk", "bed", "nightstand", "ottoman"],
  component: ["door", "doorway", "window", "roof", "facade", "wall", "railing", "stair", "staircase", "column", "beam", "archway", "fireplace", "canopy", "awning", "balcony", "cornice", "rainscreen", "deck", "pergola", "carport"],
  map: ["dungeon", "map", "level", "tactical", "wfc"],
  infrastructure: ["road", "street", "rail", "railway", "bridge", "freeway", "traffic", "curb", "sidewalk", "fence", "path", "interchange", "viaduct", "pylon", "tunnel", "transit", "platform", "hydrant", "canal", "infrastructure"],
  city: ["city", "urban", "metropolis", "town", "townscaper", "community", "district", "neighbourhood", "neighborhood", "settlement", "market"],
  building: ["building", "house", "castle", "citadel", "pavilion", "tower", "pagoda", "silo", "shrine", "temple", "ruin", "cottage", "architecture", "fort"],
  interior: ["interior", "room", "suite", "layout", "kitchen", "bathroom", "office"],
  water: ["river", "lake", "ocean", "waterfall", "water", "wetland"],
  terrain: ["terrain", "island", "mountain", "cliff", "cave", "crater", "canyon", "landscape", "coast", "snow", "marsh", "valley", "mesa", "caldera", "archipelago", "landmass"],
  vegetation: ["tree", "forest", "grove", "grass", "ivy", "vine", "plant", "shrub", "fern", "cactus", "garden", "ecosystem", "biome", "farm", "rice", "flower", "canopy", "bonsai"],
  natural: ["rock", "boulder", "stone", "mushroom", "crystal", "cloud", "planet", "asteroid"],
  mechanical: ["mech", "gear", "spring", "engine", "gearbox", "machine", "waterwheel", "mechanism"],
  equipment: ["tool", "wrench", "pliers", "screwdriver", "hammer", "hatchet", "drill", "microscope", "generator", "welder", "airduct", "cable", "camera", "binocular", "projector", "multimeter", "payphone", "fan"],
  prop: ["prop", "barrel", "crate", "bag", "basket", "bottle", "glass", "vase", "pot", "rope", "trashcan", "clock", "gamepad", "boombox", "megaphone"],
  scene: ["scene", "showcase", "environment"],
};

const CHINESE_WORDS = {
  clothing: ["服装", "衬衫", "半身裙", "长裤", "连衣裙", "卫衣", "恤"],
  character: ["角色", "人物", "人形", "飞行员", "驾驶员", "小熊"],
  animal: ["动物", "骏马", "黑马", "黄犬", "小狗", "兔子", "蜻蜓"],
  vehicle: ["载具", "汽车", "跑车", "轿车", "皮卡", "卡车", "巴士", "列车", "火车", "自行车", "马车", "厢式车"],
  sanitary: ["马桶", "浴缸", "淋浴", "洗手台", "洗脸盆", "水槽", "浴室柜", "镜柜", "卫浴设施"],
  appliance: ["冰箱", "烤箱", "洗衣机", "洗碗机", "灶台", "炉灶", "空调", "电视", "显示器", "复印机", "服务机", "家电"],
  lighting: ["吊灯", "台灯", "壁灯", "落地灯", "灯笼", "灯具", "照明"],
  furniture: ["家具", "沙发", "座椅", "餐椅", "扶手椅", "长椅", "餐桌", "茶几", "边几", "书桌", "办公桌", "柜", "衣柜", "书柜", "搁架", "床", "床头柜", "工作站", "工位", "窗帘", "百叶", "地毯", "床品"],
  component: ["门窗", "房门", "推拉门", "门洞", "开门", "窗", "屋顶", "墙体", "砖墙", "围墙", "栏杆", "楼梯", "结构柱", "结构梁", "拱门", "壁炉", "雨棚", "露台", "棚架", "车棚", "阳台", "檐口", "立面", "建筑构件"],
  map: ["地图", "地牢", "关卡", "战术", "地图与关卡"],
  infrastructure: ["道路", "公路", "街道", "铁路", "轨道", "桥", "高速", "交通", "路缘", "人行道", "围栏", "路径", "立交", "高架", "输电", "电塔", "隧道", "站台", "消防栓", "水塔", "基建"],
  city: ["城市", "都市", "城镇", "小镇", "小区", "街区", "社区", "聚落", "村落", "市集"],
  building: ["建筑", "房屋", "小屋", "街屋", "城堡", "堡垒", "要塞", "凉亭", "展亭", "塔楼", "宝塔", "筒仓", "神社", "寺", "院落", "废墟", "古建"],
  interior: ["室内空间", "室内房间", "房间壳体", "自动布局", "客厅", "卧室", "餐厅", "家庭办公室", "单间公寓", "厨房组合", "卫浴组合"],
  water: ["河流", "河道", "湖泊", "海洋", "瀑布", "水体", "浅水", "湿地"],
  terrain: ["地形", "岛屿", "群岛", "山地", "山脊", "山谷", "峡谷", "悬崖", "山洞", "洞穴", "陨石坑", "海岸", "积雪", "高原", "火山口", "恶地", "地貌"],
  vegetation: ["植被", "树木", "树库", "森林", "林地", "草地", "草丛", "常春藤", "藤蔓", "植物", "灌木", "蕨类", "仙人掌", "花园", "生态", "生物群落", "农场", "稻田", "花卉", "盆景"],
  natural: ["岩石", "巨石", "石块", "蘑菇", "晶体", "云海", "积云", "星球", "小行星", "自然物"],
  mechanical: ["机械", "齿轮", "弹簧", "发动机", "减速器", "水车"],
  equipment: ["工具", "设备", "扳手", "钳子", "螺丝刀", "锤", "斧", "电钻", "钻床", "显微镜", "发电机", "焊接", "风管", "电缆", "相机", "望远镜", "放映机", "万用表", "收银机", "电话", "摄像机", "工业"],
  prop: ["道具", "装饰", "油桶", "木箱", "水泥袋", "篮", "酒瓶", "杯具", "花瓶", "编织罐", "绳", "垃圾桶", "物料堆", "闹钟", "手柄", "收录机", "扩音器", "浇水壶"],
  scene: ["环境场景", "场景", "作品集", "总览"],
};

function tokensOf(value) {
  return new Set(String(value || "").toLowerCase().match(/[a-z0-9]+/g) || []);
}

function hasEnglish(tokens, words) {
  return words.some((word) => tokens.has(word));
}

function hasChinese(text, words) {
  return words.some((word) => text.includes(word));
}

function matches(text, key) {
  return hasEnglish(tokensOf(text), ENGLISH_WORDS[key]) || hasChinese(text, CHINESE_WORDS[key]);
}

function classifySemanticText(text) {
  if (matches(text, "clothing")) return "服装";
  if (matches(text, "character")) return "角色";
  if (matches(text, "animal")) return "生物";
  if (matches(text, "vehicle")) return "载具";
  if (matches(text, "sanitary")) return "卫浴设施";
  if (matches(text, "appliance")) return "家电";
  if (matches(text, "lighting")) return "灯具";
  if (matches(text, "map")) return "地图与关卡";
  if (matches(text, "infrastructure")) return "道路与基建";
  if (matches(text, "city")) return "城市与聚落";
  if (matches(text, "water")) return "水体";
  if (matches(text, "terrain")) return "地形";
  if (matches(text, "vegetation")) return "植被";
  if (matches(text, "mechanical")) return "机械";
  if (matches(text, "equipment")) return "工具与设备";
  if (matches(text, "component")) return "建筑构件";
  if (matches(text, "furniture")) return "家具";
  if (matches(text, "interior")) return "室内空间";
  if (matches(text, "building")) return "建筑";
  if (matches(text, "natural")) return "岩石与自然物";
  if (matches(text, "prop")) return "道具与装饰";
  if (matches(text, "scene")) return "环境场景";
  return "";
}

function categoryFromLegacyLabel(label) {
  if (CATEGORY_ALIASES.has(label)) return CATEGORY_ALIASES.get(label);
  if (MODEL_USE_CATEGORY_SET.has(label)) return label;
  if (label.startsWith("Blender 百景复刻")) return "环境场景";
  if (label.includes("室内系统") || label.includes("室内空间")) return "室内空间";
  if (label.includes("城堡")) return "建筑";
  if (label.includes("植物")) return "植被";
  return "";
}

export function catOf(id, model = {}) {
  const key = String(id || "");
  const fallback = String(model.category || "");
  const name = String(model.name || "");
  if (key.startsWith("blender-119-")) return "环境场景";
  if (key.startsWith("dual-grid-") || key.startsWith("house-garden-")) return "环境场景";
  if (key.startsWith("speedtree-")) return "植被";
  if (key.startsWith("citygen-")) return "城市与聚落";
  if (key.startsWith("vehicle-")) return "载具";
  if (key.startsWith("mech-")) return "机械";
  if (key.startsWith("terrain-") || key.startsWith("landmass-") || key.startsWith("rock-border-")) return "地形";
  if (key.startsWith("veg-") || key.startsWith("assembly-")) return "植被";
  if (key.startsWith("urban-")) return "建筑";
  if (key.startsWith("ruin-")) return "建筑";
  if (key.startsWith("layout-")) return "室内空间";
  if (key.startsWith("bathroom-suite-") || key.startsWith("interior-suite-")) return "室内空间";
  if (CATEGORY_BY_ID[key]) return CATEGORY_BY_ID[key];

  const legacy = categoryFromLegacyLabel(fallback);
  if (legacy === "环境场景") return legacy;

  const semantic = classifySemanticText(`${key} ${name}`.toLowerCase());
  if (semantic) return semantic;

  if (legacy) return legacy;

  const tags = model?.assetMeta?.tags || model?.tags || [];
  const tagCategory = classifySemanticText(Array.isArray(tags) ? tags.join(" ").toLowerCase() : "");
  return tagCategory || "技术演示";
}
