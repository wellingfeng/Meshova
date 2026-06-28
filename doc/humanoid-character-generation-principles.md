# 类人角色生成的独立技术路线与 MetaHuman 可学习边界

## 结论

Meshova 可以单独开发类人角色生成，但必须做成独立角色管线。不能继续把角色主体当作 primitive 拼装问题。

正确方向：

```text
标准人形模板网格
  -> morph / blendshape 参数变形
  -> 骨骼 skinning
  -> pose corrective / helper joints
  -> 服装、头发、装备 conform
  -> 程序化材质
  -> AI 截图评估调参
```

不是：

```text
球 / 盒 / 胶囊
  -> transform 拼接
  -> 希望像真人或高质量卡通角色
```

当前 primitive 方案适合建筑、机械、家具、石头、低模玩具。高质量人形角色需要固定拓扑、语义控制点、morph 空间、rig、服装资产。

## 类人角色生成的核心原理

### 1. 标准模板网格

角色系统先有一个稳定 base mesh：

- 顶点数量固定。
- face/vertex id 固定。
- 人体 edge loop 固定：眼眶、嘴唇、鼻翼、肩、肘、膝、手指。
- regions 固定：head、torso、arm、leg、hand、foot、face。
- landmarks 固定：眼角、鼻尖、嘴角、下巴、锁骨、肘、膝、踝。
- skeleton、skin weights、UV、材质槽随模板绑定。

MakeHuman/MPFB 明确用 basemesh 作核心；不同身形只移动顶点，不改拓扑。衣服、身体附件也通过 basemesh 关系适配。

### 2. Morph target / blendshape

morph 本质是每个顶点的一组 delta：

```text
P_final[v] = P_base[v] + sum(weight_i * delta_i[v])
```

单个 slider 可以是一个 target，也可以是多个 target 的宏组合：

```text
body.height = 0.8 * legLength + 0.4 * spineLength + 0.2 * neckLength
```

这就是 MakeHuman、Character Creator、MetaHuman 这类系统共同底层：参数控制同拓扑顶点位移。

### 3. 统计人体模型

SMPL 系列把人体表示成：

```text
shape params beta
pose params theta
template mesh
shape blend shapes
pose corrective blend shapes
joint regressor
linear blend skinning
```

核心意义：参数空间先被人体扫描数据约束。AI 优化时不会乱跑到非人体形状。

SMPL-X 进一步把 body、hands、face 统一到一个可表达模型里；图片拟合常用 2D landmarks / silhouette / priors 优化参数，而不是直接生成任意 mesh。

### 4. 脸部模型

FLAME 代表脸部路线：

```text
identity shape
expression blendshape
jaw / neck / eyeball articulation
pose corrective
```

脸不能靠球体和贴片拼。必须有眼睑、鼻翼、嘴角、颊部这些稳定局部拓扑。

### 5. Rig 与 deformation

高质量角色不是单 mesh 静态形变。需要：

- skeleton hierarchy。
- skin weights。
- helper joints。
- corrective shapes。
- RBF / swingtwist 这类 pose solver。
- LOD 分层。

MetaHuman 的 RigLogic 把语义表情通道映射到大量 joint transform、LOD0 per-vertex displacement、皱纹材质触发。也就是说，表情不是普通 blendshape 列表，而是 joint + shape + material 的组合系统。

### 6. 服装、头发、装备 conform

服装不是 primitive 外挂。正确做法：

```text
clothing mesh
  -> 绑定 body landmarks / base mesh vertex relation
  -> body morph 后重算 fit
  -> normal offset / shrinkwrap / projection
  -> penetration solve
  -> skin weight transfer
  -> cloth / groom / skeletal asset slot
```

MakeHuman 的 MHCLO 资产描述服装顶点如何匹配 basemesh 顶点；MetaHuman wardrobe 会自动按当前 body resize，并有兼容性校验。

### 7. 材质层

人形质量很大部分来自材质：

- skin: albedo、subsurface、roughness、normal、micro detail。
- eyes: cornea、iris、wetness。
- makeup / freckles / blush / lips。
- fabric、leather、armor、hair material。

Meshova 已有程序化 PBR 核心，可复用到角色材质层；但皮肤/眼睛要单独 shader preset。

### 8. AI 输入拟合

图片到角色不应回归 primitive 参数。应拆成：

```text
reference image
  -> 人体/脸部 landmark
  -> silhouette
  -> 风格分类
  -> body / face / outfit / color 语义
  -> 选择 template + outfit
  -> 优化 morph weights + material params + pose
  -> screenshot score
```

目标函数：

```text
score =
  silhouetteIoU
  + landmarkDistance
  + VLM semantic match
  + material/style consistency
  - body prior penalty
  - interpenetration penalty
```

## Meshova 可独立开发方案

### P0：CharacterTemplate 数据格式

新增角色资产格式，不走 primitive recipe：

```ts
type CharacterTemplate = {
  id: string;
  baseMesh: Mesh;
  regions: RegionMask[];
  landmarks: Landmark[];
  skeleton: Skeleton;
  skinWeights: SkinWeights;
  morphTargets: MorphTarget[];
  materialSlots: MaterialSlot[];
  proxyMeshes: ProxyMesh[];
};
```

### P1：自研 stylized humanoid base

先做风格化，不做 photoreal：

- 8k-15k faces。
- A-pose。
- 分离眼球、牙、舌、头发接口。
- 脸部必须有眼眶、眼睑、鼻翼、嘴唇 edge loops。
- 身体拓扑支持肩、肘、膝、手指弯曲。
- 资产必须原创，不能复制 MetaHuman / MakeHuman / CC 拓扑。

这一步最好在 Blender 手工建 base，然后 Meshova 读取、参数化、导出。程序化系统不是必须从第一个顶点开始生成；base mesh 相当于标准库。

### P2：Morph runtime

实现：

- delta apply。
- region weight。
- clamp/min/max。
- macro slider。
- symmetry。
- corrective morph。

表达式：

```text
final = base + bodyMorph + faceMorph + styleMorph + poseCorrective
```

### P3：Rig runtime

实现最低限：

- joint hierarchy。
- linear blend skinning。
- landmark 随 skeleton/morph 更新。
- pose preset。
- OBJ/GLTF 导出时保留 skeleton 信息。

### P4：Outfit conform

先做静态 fitted outfit：

- 衣服 mesh 存 body surface barycentric anchor。
- body morph 后按 anchor 跟随。
- 沿法线 offset。
- 简单碰撞推出。
- layer order。

后续再做 cloth sim。

### P5：角色编辑器

Viewer 新增 Character 面板：

- body sliders。
- face sliders。
- outfit slots。
- material slots。
- pose preset。
- screenshot evaluation。

### P6：图片拟合

AI 不生成 mesh。AI 生成 recipe：

```ts
type CharacterRecipe = {
  templateId: string;
  body: Record<string, number>;
  face: Record<string, number>;
  style: Record<string, number>;
  outfit: string[];
  materials: Record<string, MaterialParams>;
  pose: PoseParams;
};
```

## MetaHuman 能不能学习

可以学抽象原理。不要学/拿专有实现。

可以学：

- DNA 这种“角色完整定义包”概念。
- 语义控制通道 -> rig/joint/morph/material 的映射。
- LOD 分层。
- custom mesh fitting 到模板拓扑。
- wardrobe / outfit slot / validation。
- head/body 参数、blend、sculpt、材质、groom 分层编辑。
- RigLogic 思想：高层语义通道驱动底层复杂 deformation。

不能做：

- 复制 MetaHuman mesh topology、DNA 数据、RigLogic 规则、Identity Pool、材质、groom、服装资产。
- 逆向 MetaHuman 工具内部算法。
- 用 MetaHuman 资产、动画曲线、渲染输出训练/测试生成式 AI 或建立数据库。
- 把 MetaHuman 专有技术包装进 Meshova 开源项目。

当前官方许可页写明 MetaHuman 可在任意引擎或创作软件使用；但 Unreal EULA 仍限制把 Licensed Technology 作为生成式 AI 输入，也限制用 MetaHuman 角色、动画曲线、特定渲染输出来构建或增强 AI 数据库。MetaHuman Creator 旧 EULA 也明确禁止逆向、竞争产品开发、AI 训练/测试用途。对 Meshova 这种开源角色生成器，安全做法是只学习公开架构思想。

## 实际可行度

| 目标 | 可行度 | 说明 |
|---|---:|---|
| 风格化人形生成器 | 高 | 1 个原创 base + 50-100 morph + 少量 outfit 可做出明显提升 |
| 卡通/二次元角色 | 中高 | 需要头发、眼睛、脸部 decal/makeup 系统 |
| 半写实角色 | 中 | 需要更好 skin/eye shader、扫描级 morph 或人工雕刻库 |
| MetaHuman 级写实 | 低 | 不是代码量问题，是扫描数据、rig、groom、材质、QA 资产库问题 |

## 推荐决策

Meshova 不应放弃类人模型。应拆出 `CharacterKit`：

```text
src/character/
  template.ts
  morph.ts
  skeleton.ts
  skinning.ts
  outfit.ts
  recipe.ts
  evaluate.ts
```

第一阶段目标：

- 1 个原创 stylized humanoid base。
- 30 个 body morph。
- 30 个 face morph。
- 10 个表情 morph。
- 1 套衣服 conform。
- 1 套皮肤/眼睛程序化材质。
- Viewer 可调参数。
- AI 用截图闭环调 morph，不再调 primitive。

## 参考资料

- MetaHuman DNA / RigLogic / LOD / joint deformation: https://dev.epicgames.com/documentation/en-us/metahuman/metahuman-dna-rig-definition-and-rig-operation
- MetaHuman Creator in UE 5.6: https://dev.epicgames.com/documentation/metahuman/metahuman-creator-in-unreal-engine
- MetaHuman Import Tools: https://dev.epicgames.com/documentation/metahuman/metahuman-creator-import-tools-in-unreal-engine
- MetaHuman Head and Body Tools: https://dev.epicgames.com/documentation/metahuman/metahuman-creator-head-and-body-tools-in-unreal-engine
- MetaHuman Hair and Clothing Controls: https://dev.epicgames.com/documentation/metahuman/hair-and-clothing-controls
- MetaHuman Licensing: https://www.metahuman.com/license
- Unreal Engine EULA AI restrictions: https://www.unrealengine.com/eula/unreal
- MetaHuman Creator legacy EULA: https://www.unrealengine.com/eula/mhc
- SMPL: https://smpl.is.tue.mpg.de/
- SMPL-X: https://smpl-x.is.tue.mpg.de/
- FLAME: https://flame.is.tue.mpg.de/
- MakeHuman / MPFB basemesh: https://static.makehumancommunity.org/mpfb/docs/assets/concept_basemesh_and_helpers.html
- MakeHuman / MPFB targets: https://static.makehumancommunity.org/mpfb/docs/assets/concept_targets.html
- MakeHuman / MPFB clothes: https://static.makehumancommunity.org/mpfb/docs/assets/concept_clothes_hair_bodyparts.html
- MakeHuman / MPFB proxies: https://static.makehumancommunity.org/mpfb/docs/assets/concept_proxymeshes.html
