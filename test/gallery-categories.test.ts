import { describe, expect, it } from "vitest";
import { catOf, normalizeModelName } from "../web/gallery-categories.js";

describe("模型库展示名", () => {
  it("去掉来源、教程和复刻标记", () => {
    expect(normalizeModelName("百景 042 · 大天使")).toBe("大天使");
    expect(normalizeModelName("BlenderHowtos DNA 双螺旋")).toBe("DNA 双螺旋");
    expect(normalizeModelName("HoudiniHowtos Sci-Fi 面板")).toBe("Sci-Fi 面板");
    expect(normalizeModelName("Cropout 牧场岛")).toBe("牧场岛");
    expect(normalizeModelName("Poly Haven 红色油桶复刻")).toBe("红色油桶");
    expect(normalizeModelName("参考图复刻·六臂交通环岛")).toBe("六臂交通环岛");
    expect(normalizeModelName("SpeedTree教程复刻 树型合集")).toBe("树型合集");
    expect(normalizeModelName("盆景 (Houdini教程复刻)")).toBe("盆景");
  });

  it("空名称使用稳定兜底", () => {
    expect(normalizeModelName("复刻", "model-id")).toBe("model-id");
  });
});

describe("模型库用途分类", () => {
  it("不会把场景焦点物误当成独立角色", () => {
    expect(catOf("blender-119-042-archangel", { name: "百景 042 · 大天使", category: "Blender 百景复刻" })).toBe("环境场景");
    expect(catOf("blender-119-105-off-grid-wagon", { name: "百景 105 · 离网马车", category: "Blender 百景复刻" })).toBe("环境场景");
  });

  it("分开角色、生物和卫浴设施", () => {
    expect(catOf("teddy", { name: "卡通小熊" })).toBe("角色");
    expect(catOf("grasshopper-voxel-bunny", { name: "Grasshopper Voxel Bunny" })).toBe("生物");
    expect(catOf("sweet-home-toilet", { name: "水箱式马桶" })).toBe("卫浴设施");
  });

  it("英文按完整词匹配，不做子串误判", () => {
    expect(catOf("polyhaven-adjustable-wrench", { name: "Poly Haven Adjustable Wrench" })).toBe("工具与设备");
    expect(catOf("polyhaven-flathead-screwdriver", { name: "Poly Haven Flathead Screwdriver" })).toBe("工具与设备");
  });

  it("室内前缀不覆盖单体资产用途", () => {
    expect(catOf("interior-refrigerator", { name: "双门冰箱" })).toBe("家电");
    expect(catOf("interior-casement-window", { name: "多分格平开窗" })).toBe("建筑构件");
    expect(catOf("interior-conference-table", { name: "会议桌系统" })).toBe("家具");
  });

  it("管线系统与手持工具分开", () => {
    expect(catOf("expansion-utility-duct", { name: "矩形风管网络" })).toBe("管线与机电");
    expect(catOf("polyhaven-bench-vice-01", { name: "Poly Haven 工作台钳复刻" })).toBe("工具与设备");
  });

  it("描述和能力字段不污染资产用途", () => {
    expect(catOf("plain-chair", {
      name: "餐椅",
      assetMeta: { description: "适合角色坐下，支持河流场景", capabilities: ["程序生成"] },
    })).toBe("家具");
  });

  it("工作流按产物用途归类", () => {
    expect(catOf("drawable-path-fence", { name: "可绘制路径围栏", category: "程序工作流" })).toBe("道路与基建");
    expect(catOf("masked-region-grove", { name: "可绘制区域林地", category: "程序工作流" })).toBe("植被");
  });

  it("完整场景不被局部内容拆散", () => {
    expect(catOf("dual-grid-river-mill", { name: "双网格·河岸水磨" })).toBe("环境场景");
    expect(catOf("house-garden-02", { name: "房子花园 02 折线路径", category: "房子和花园" })).toBe("环境场景");
    expect(catOf("low-poly-tropical-island", { name: "Low Poly 热带岛", category: "Low Poly 场景" })).toBe("环境场景");
  });
});
