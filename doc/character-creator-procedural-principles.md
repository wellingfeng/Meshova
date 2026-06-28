# Character Creator 与 Meshova 当前角色生成路线的技术差异

## 结论

当前 Meshova 的“解析图元拼装”路线不适合高质量人形角色。不是程序化建模走不通，而是当前表示法走错层级。

Character Creator 这类工具不是从球、盒、圆柱直接生成角色。它的核心是高质量人形模板网格、稳定拓扑、morph delta、骨骼绑定、服装适配、材质资产库、约束混合。程序化发生在“控制已有高质量资产与变形空间”，不是“从零解析构造人体所有细节”。

因此 Meshova 角色方向应从：

```text
primitive recipe -> merge mesh -> material
```

改成：

```text
template character mesh -> morph / rig / cloth / material procedural controls -> export
```

primitive recipe 仍适合道具、建筑、硬表面、低多边形风格化物体；不适合作为角色主体的最终表达。

## 当前失败原因

截图里的模型问题不是单点 bug，而是表示能力不足：

- 头、脸、眼、嘴、手、鞋、服装边界都靠简单图元堆叠，缺人体面部 planes、眼眶、嘴角、指节、布料贴合。
- 部件之间只是空间接触，没有连续拓扑、局部 edge flow、权重、法线连续性。
- AI 即使调参，也只能在“球/胶囊/盒子组合”的低质量空间里搜索；目标形状不在当前参数流形内。
- 角色质量高度依赖小尺度局部结构。人脸、手、眼睑、服装层次属于高频语义几何，不能靠少量 primitive 稳定逼近。

## Character Creator 的技术本质

根据 Reallusion 官方资料，Character Creator 的基础不是自由生成网格，而是 CC3+/CC5 角色底座：

- 均匀 quad topology、动画友好 edge loops、joint rings、muscle lines。
- 一个通用 mesh 适配大量体型与风格。
- 高质量 UV/UDIM、眼睛/牙齿/舌头/泪线等独立子部件。
- 内置 skeletal rig、skin weights、facial expression profiles。
- CC5 增加 HD base、Subdivision workflow、HD morph、displacement/normal baking。

形变核心可抽象为：

```text
P_final[v] =
  P_base[v]
  + sum(weight_i * morph_delta_i[v])
  + corrective_delta(v, pose, expression, body_shape)
  + displacement(v, material_or_sculpt_detail)
```

关键约束：morph target 必须共享兼容拓扑。官方文档中自定义 morph 也要求 OBJ 编辑不能改变顶点数量。这说明它依赖稳定 vertex id 与 delta 变形，不是任意重建 mesh。

## 核心差异表

| 维度 | Meshova 当前路线 | Character Creator 路线 |
|---|---|---|
| 基础表示 | 解析图元、transform、merge、少量几何算子 | 预制高质量人形模板网格 |
| 拓扑 | 由 primitive 拼出，部件孤立 | 稳定 quad topology，面部/关节 edge loops |
| 参数 | 尺寸、位置、颜色、少量噪声 | morph slider、region blend、pose corrective |
| 随机生成 | 随机 primitive 参数 | 在可行人体/风格空间内混合已有 morph/asset |
| 服装 | 几何块外挂 | 服装 mesh + transfer skin weights + conform |
| 变形 | 静态 mesh 变换 | skeleton skinning + blendshape + corrective morph |
| 细节 | 几何噪声或颜色 | normal/displacement/wrinkle/UDIM texture |
| 质量上限 | 玩具/摆件/硬表面可用，角色低 | 角色生产级，因高质量底座托底 |
| AI 优化难度 | 参数空间缺目标形状，优化无解 | 参数空间贴近角色语义，优化有效 |

## Character Creator 的“程序化”不是 Houdini 式从零建模

它更像资产驱动的参数系统：

1. 艺术家先做一套高质量 base mesh。
2. 为同拓扑角色制作大量 morph delta。
3. 参数 slider 控制 morph 权重。
4. 系统按区域混合头、身体、脸部特征。
5. 骨骼、权重、表情、衣服 conform 保持动画和穿戴稳定。
6. 高分辨率细节通过 normal/displacement/texture baking 承载。

ActorMIXER 也是这个逻辑：混合已有高质量角色资产，并用非破坏约束避免破形。它不是把自然语言直接转成全新拓扑。

## 对 Meshova 的直接含义

Meshova 不该放弃程序化，但角色模块需要换架构。

### 保留当前路线的领域

- 建筑、家具、机械、车辆、石头、植物低频形体。
- 风格化玩具、低模 icon、预览占位角色。
- 程序化材质、PBR preset、贴图字段生成。
- AI 自迭代截图评价。

### 新增角色路线

角色应增加独立 pipeline：

```text
CharacterTemplate
  base mesh
  semantic landmarks
  skeleton
  skin weights
  UV sets
  morph targets
  material slots

CharacterRecipe
  body shape params
  face params
  style params
  outfit asset ids
  material params
  pose params

Evaluator
  silhouette score
  landmark score
  VLM semantic score
  style/material score
```

程序化 recipe 控制模板，而不是从 primitives 造人体。

## 推荐技术路线

### P0：自研简化角色模板

做一个合法自研、低复杂度、风格化 humanoid base：

- 单一中性 A-pose/T-pose。
- quad-ish topology，先 5k-15k faces。
- 头、躯干、手、脚、眼、牙、头发接口分开。
- 固定 vertex ids。
- 语义 landmark：眼角、鼻梁、嘴角、下巴、肩、肘、膝、脚踝。
- 简单骨架与 skin weights。

重点：先让模板“天然像人”，而不是让参数把球调成人。

### P1：morph target 系统

新增同拓扑 morph：

- 身高、肩宽、腰臀、腿长、头身比。
- 脸宽、下巴、眼距、鼻梁、嘴形。
- 风格化程度：Q版、写实、卡通机甲。

实现层：

```ts
type MorphTarget = {
  name: string;
  region: "head" | "body" | "face" | "hands";
  deltas: Float32Array;
  min: number;
  max: number;
};
```

### P2：服装/装备库

服装不要再用硬插 primitive。改为模板化 clothing meshes：

- 每件衣服绑定到 body landmarks。
- 自动 fit：body surface projection + margin offset。
- penetration solve：沿法线推出 + smooth/delta mush。
- layer order：内衣、裤、外套、护甲。

### P3：材质细节补强

高质量角色很大部分来自材质：

- skin shader preset。
- stylized face decal/paint layer。
- fabric/armor material slots。
- normal/displacement micro detail。
- roughness/color variation。

Meshova 现有 PBR 字段系统可复用。

### P4：AI 控制入口

图片到角色不应直接回归 primitive 参数。应分解成：

```text
reference image
  -> semantic parse: gender/style/body/outfit/colors
  -> landmark/silhouette target
  -> choose template + outfit assets
  -> optimize morph weights/material params
  -> screenshot evaluation loop
```

目标：让 AI 搜索“角色参数空间”，不是搜索“图元摆放空间”。

## 是否走不通

当前 primitive 拼装路线做高质量角色：走不通。

Meshova 程序化角色路线：走得通，但必须从“生成几何”升级为“生成参数化角色资产实例”。

最小可行转向：

1. 不再用 primitives 做角色主体。
2. 做自研 humanoid template。
3. 做 morph delta runtime。
4. 做服装 conform。
5. 让 AI 调 morph/outfit/material，而不是调球和盒子。

## 参考资料

- Reallusion CC3+/CC5 base topology: https://www.reallusion.com/character-creator/cc-avatar.html
- Reallusion topology / mesh enhancements: https://manual.reallusion.com/Character-Creator-4/Content/ENU/4.0/05_Character/Topology-Mesh-Enhancements.htm
- Reallusion head/body morph sliders: https://manual.reallusion.com/Character-Creator-4/Content/ENU/4.0/06_Customizing_Morphing_Sliders/Creating-Head-and-Body-Morphing-Sliders.htm
- Reallusion custom morph slider workflow: https://manual.reallusion.com/Character-Creator-4/Content/ENU/4.0/06-Facial-Profile-Editor/Creating-Custom-Category-with-Morphing-Sliders.htm
- Reallusion custom clothing and skin weight transfer: https://manual.reallusion.com/Character-Creator-4/Content/ENU/4.0/08_Cloth/Creating_Custom_Clothes_OBJ.htm
- Reallusion conform clothing: https://manual.reallusion.com/Character-Creator-4/Content/ENU/4.0/08_Cloth/Conforming_Clothing.htm
- Reallusion ActorMIXER: https://www.reallusion.com/character-creator/actor-mixer/
- Reallusion Delta Mush smoothing: https://manual.reallusion.com/Character-Creator-4/Content/ENU/4.0/09-Editing-Meshes/Smoothing-Mesh-Faces-with-Delta-Mush.htm
