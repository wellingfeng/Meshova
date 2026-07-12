const CURATED_VISUAL_SCORES = new Map([
  ["pcg-biome-river", 100],
  ["biome-grassland", 99],
  ["biome-blend-world", 98],
  ["mountain-village", 97],
  ["house-garden-04", 96],
  ["city-district-roadnet", 95],
  ["assembly-flower-island", 94],
  ["blender-raining-garden", 93],
  ["pcg-world", 92],
  ["river-lake", 91],
  ["dual-grid-river-mill", 90],
  ["sidefx-solaris-market", 89],
  ["town-scene", 88],
  ["watabou-city", 87],
  ["cloud-sky", 86],
  ["waterfall", 85],
  ["vine-covered-rock", 84],
  ["roundabout-traffic", 83],
  ["japanese-street-building", 82],
  ["chinese-hall", 81],
  ["speedtree-custom-blossom-tree", 80],
  ["pcg-snow-scene", 79],
  ["terrain-island", 78],
  ["realistic-spline-path", 77],
  ["grasshopper-ribbon-loop", 76],
  ["blender-dna-helix", 75],
  ["houdini-howtos-curve-graph", 74],
  ["suspension-bridge", 73],
  ["gmc-canyon-at4x", 72],
  ["sports-car", 71],
]);

const CATEGORY_WEIGHT = {
  城市: 13,
  程序化地图: 13,
  地形: 11,
  自然: 10,
  植被: 10,
  建筑: 8,
  程序生态: 8,
  载具: 7,
  角色: 6,
  基建: 6,
  家具: 4,
  机械: 4,
  硬表面: 3,
  程序工作流: 3,
  服装: 2,
  基础: -8,
};

const SIGNALS = [
  {
    label: "色彩/生态",
    weight: 4,
    max: 16,
    terms: ["color", "colour", "彩色", "花", "garden", "blossom", "market", "biome", "生态", "湿地", "雪", "traffic"],
  },
  {
    label: "完整场景",
    weight: 4,
    max: 20,
    terms: ["scene", "场景", "world", "世界", "city", "城市", "district", "街区", "village", "村", "garden", "花园", "forest", "森林", "market", "市集", "map", "地图"],
  },
  {
    label: "曲线/有机形态",
    weight: 3,
    max: 15,
    terms: ["curve", "曲线", "spline", "path", "路径", "river", "河", "vine", "藤", "ivy", "helix", "螺旋", "ribbon", "willow", "waterfall", "瀑布", "roadnet", "路网"],
  },
  {
    label: "分层/组合",
    weight: 3,
    max: 15,
    terms: ["layer", "分层", "scatter", "散布", "assembly", "组合", "lineup", "群", "district", "街区", "plaza", "广场", "bridge", "桥", "cave", "洞"],
  },
];

const SIMPLE_TERMS = ["basic", "基础", "preview", "预览", "single", "单体", "test", "测试", "box", "sphere", "gear"];

function entryText(entry) {
  const meta = entry.model?.assetMeta || {};
  return [
    entry.id,
    entry.model?.name,
    entry.cat,
    meta.description,
    ...(Array.isArray(meta.tags) ? meta.tags : []),
    ...(Array.isArray(meta.capabilities) ? meta.capabilities : []),
    ...(Array.isArray(meta.materialClasses) ? meta.materialClasses : []),
  ].filter(Boolean).join(" ").toLowerCase();
}

function signalScore(text, signal) {
  let score = 0;
  for (const term of signal.terms) {
    if (text.includes(term)) score += signal.weight;
  }
  return Math.min(score, signal.max);
}

export function scoreModelEntryDetails(entry) {
  if (entry.isMaterial) {
    return { score: -1, mode: "material", reasons: ["材质条目不参与模型评分。"] };
  }
  const curated = CURATED_VISUAL_SCORES.get(entry.id);
  if (curated !== undefined) {
    return {
      score: curated,
      mode: "curated",
      reasons: [
        `人工校准视觉排序分为 ${curated}，低于 85 阈值。`,
        "原评分表只保存总分，未记录逐项扣分原因。",
      ],
    };
  }

  const text = entryText(entry);
  const categoryWeight = CATEGORY_WEIGHT[entry.cat] || 0;
  const signalDetails = SIGNALS.map((signal) => ({
    label: signal.label,
    score: signalScore(text, signal),
    matches: signal.terms.filter((term) => text.includes(term)),
  }));
  const signalTotal = signalDetails.reduce((sum, signal) => sum + signal.score, 0);
  const simpleMatches = SIMPLE_TERMS.filter((term) => text.includes(term));
  const simplePenalty = simpleMatches.length ? -10 : 0;
  const specialBonus = entry.specialUrl ? 4 : 0;
  const rawScore = 34 + categoryWeight + signalTotal + simplePenalty + specialBonus;
  const score = Math.max(0, Math.min(70, Math.round(rawScore)));
  const missingSignals = signalDetails.filter((signal) => signal.score === 0).map((signal) => signal.label);
  const formula = [
    "起始 34",
    `分类“${entry.cat || "未分类"}” ${categoryWeight >= 0 ? "+" : ""}${categoryWeight}`,
    `丰富度信号 +${signalTotal}`,
    simplePenalty ? `简化词“${simpleMatches.join("、")}” -10` : null,
    specialBonus ? "专用展示页 +4" : null,
    `最终 ${score}`,
  ].filter(Boolean).join("；");
  const reasons = [
    "采用规则估分；规则分上限 70，天然低于 85，不等于逐图质量验收失败。",
    formula,
  ];
  if (missingSignals.length) reasons.push(`未命中${missingSignals.join("、")}信号，未获得对应加分。`);

  return { score, mode: "rule", reasons };
}

export function scoreModelEntry(entry) {
  return scoreModelEntryDetails(entry).score;
}

export function rankModelEntries(entries) {
  return entries
    .map((entry, index) => ({ ...entry, aestheticScore: scoreModelEntry(entry), rankingIndex: index }))
    .sort((a, b) => {
      if (!!a.isMaterial !== !!b.isMaterial) return a.isMaterial ? 1 : -1;
      return b.aestheticScore - a.aestheticScore || a.rankingIndex - b.rankingIndex;
    })
    .map(({ rankingIndex, ...entry }) => entry);
}

export function createRankedModelLibrary(initialEntries = []) {
  let rankedEntries = rankModelEntries(initialEntries);

  function addMany(entries) {
    const byId = new Map(rankedEntries.map((entry) => [entry.id, entry]));
    for (const entry of entries) byId.set(entry.id, entry);
    rankedEntries = rankModelEntries([...byId.values()]);
    return rankedEntries;
  }

  return {
    get entries() {
      return rankedEntries;
    },
    add(entry) {
      return addMany([entry]);
    },
    addMany,
  };
}
