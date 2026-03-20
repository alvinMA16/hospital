# 《午夜查房》技术设计文档

## 1. 文档目标

本文件用于确定《午夜查房》MVP 的技术实现路线，约束项目在微信小游戏场景下的工程结构、运行逻辑、平台接入方式与迭代边界。

当前技术目标不是构建一个重型通用框架，而是为以下目标服务：

- 尽快做出可验证核心玩法的 MVP
- 适配微信小游戏包体、加载、广告与存储约束
- 保证局内数值逻辑稳定、可调、可复盘
- 让后续内容扩展不需要推翻底层结构

---

## 2. 技术路线结论

MVP 阶段采用以下技术方案：

- 引擎：Cocos Creator 3.8
- 语言：TypeScript
- 目标平台：微信小游戏
- 逻辑组织方式：数据驱动 + 状态机 + 固定 Tick 模拟
- 平台接入方式：封装平台适配层，不让业务代码直接调用 `wx.*`

不采用的方案：

- 不上重型 ECS
- 不做多人联机
- 不先做复杂后端
- 不做通用热更新框架
- 不在 MVP 阶段引入过度插件化系统

选择原因：

- 项目是 2D 轻策略短局游戏，重点在节奏、数值、演出与广告节奏，不在大规模实体计算
- 微信小游戏对首包、资源加载、真机表现有明确约束
- Cocos 对微信小游戏发布、资源管理与远程加载支持更直接

---

## 3. 设计原则

### 3.1 规则与表现分离

游戏规则层只负责：

- 资源产出
- 升级计算
- 异常值计算
- 查房者目标选择
- 房门伤害结算
- 胜负判定

表现层只负责：

- UI 更新
- 动画
- 特效
- 音效
- 灯光变化
- 镜头反馈

任何“是否被攻击”“门是否掉血”“是否进入冲刺期”都先由逻辑层决定，再通过事件通知表现层。

### 3.2 数据驱动优先

所有高频调整项都必须从代码中抽离为配置，包括：

- 病床升级表
- 房门升级表
- 设施价格与效果
- 电力消耗与收益
- 异常值增长系数
- 查房者目标选择权重
- 各阶段时长与压力参数
- AI 病房成长倾向
- 技能冷却与效果
- 局外成长参数
- 广告复活与双倍奖励参数

### 3.3 固定 Tick 驱动局内模拟

局内模拟不依赖逐帧浮动计算，使用固定 Tick 更新核心逻辑。

建议：

- 逻辑 Tick：每秒 5 到 10 次
- 表现层：跟随帧刷新

好处：

- 数值更稳定
- 回放日志更容易记录
- 真机帧率波动时不容易导致核心逻辑失真
- 调平衡时更直观

### 3.4 平台能力隔离

广告、存档、登录、设备信息、分享等微信能力统一封装在平台层。

目标：

- 业务代码不直接调用 `wx.createRewardedVideoAd` 等 API
- 后续如需适配抖音小游戏或 QQ 小游戏，仅改平台层

---

## 4. 总体分层

项目按四层组织：

1. `Platform`
2. `Core`
3. `Gameplay`
4. `Presentation`

### 4.1 Platform 层

职责：

- 微信小游戏平台能力封装
- 广告能力管理
- 本地存储适配
- 埋点上报适配
- 音频中断与前后台回调处理

建议模块：

- `PlatformSDK`
- `AdService`
- `StorageService`
- `AnalyticsService`
- `ShareService`
- `DeviceService`
- `AudioInterruptService`

### 4.2 Core 层

职责：

- 通用基础设施
- 场景与流程管理
- 事件系统
- 定时器
- 配置管理
- 存档读写
- 对象池与音频管理

建议模块：

- `GameApp`
- `SceneFlow`
- `EventBus`
- `TimerService`
- `StateMachine`
- `ConfigService`
- `SaveService`
- `AudioManager`
- `PoolManager`
- `RandomService`

### 4.3 Gameplay 层

职责：

- 局内全部规则和数值模拟
- 病房、资源、AI、查房者、技能、结算等系统

建议模块：

- `RunDirector`
- `PhaseSystem`
- `RoomSystem`
- `EconomySystem`
- `PowerSystem`
- `PlacementSystem`
- `AnomalySystem`
- `WatcherAISystem`
- `AIRoomSystem`
- `SkillSystem`
- `ResultSystem`

### 4.4 Presentation 层

职责：

- 战斗场景表现
- UI 页面
- 特效、动画、音效、镜头反馈
- 引导层与结算表现

表现层不直接存规则状态，统一读取模型或订阅事件。

---

## 5. 推荐目录结构

```text
assets/
  scripts/
    platform/
    core/
    gameplay/
    presentation/
    configs/
    data/
  scenes/
    boot.scene
    lobby.scene
    battle.scene
    result.scene
  prefabs/
  audio/
  atlas/
  effects/
  bundles/
```

进一步细化后建议：

```text
scripts/
  platform/
    PlatformSDK.ts
    WechatAdService.ts
    WechatStorageService.ts
    WechatAnalyticsService.ts
  core/
    GameApp.ts
    EventBus.ts
    TimerService.ts
    StateMachine.ts
    ConfigService.ts
    SaveService.ts
    AudioManager.ts
    PoolManager.ts
  gameplay/
    run/
      RunDirector.ts
      PhaseSystem.ts
      ResultSystem.ts
    room/
      RoomModel.ts
      EconomySystem.ts
      PowerSystem.ts
      PlacementSystem.ts
      DoorSystem.ts
    threat/
      AnomalySystem.ts
      WatcherAISystem.ts
    ai/
      AIRoomSystem.ts
    skill/
      SkillSystem.ts
  presentation/
    battle/
    ui/
    fx/
    audio/
  configs/
    facility.json
    upgrade.json
    phase.json
    ai_room.json
    anomaly.json
```

---

## 6. 场景与流程结构

MVP 推荐四个场景：

- `boot.scene`
- `lobby.scene`
- `battle.scene`
- `result.scene`

### 6.1 Boot

职责：

- 初始化平台适配层
- 初始化配置与本地存档
- 预加载首屏资源
- 跳转大厅

### 6.2 Lobby

职责：

- 展示局外成长
- 开局增益广告入口
- 进入战斗

MVP 阶段可保持极简。

### 6.3 Battle

职责：

- 运行完整单局
- 驱动局内 UI、引导、技能与演出

### 6.4 Result

职责：

- 胜败结算
- 展示奖励
- 双倍奖励广告
- 再来一局

---

## 7. 单局运行模型

### 7.1 RunDirector

`RunDirector` 是战斗场景的最高控制器，负责：

- 初始化本局数据
- 启动各个 Gameplay System
- 推进时间轴
- 统一暂停、继续、结算
- 汇总本局事件日志

### 7.2 单局状态机

建议局内状态机如下：

- `Init`
- `Tutorial`
- `Calm`
- `Uneasy`
- `Pressure`
- `FinalRush`
- `Victory`
- `Defeat`
- `Result`

说明：

- 第一局可在 `Tutorial` 中插入弱引导
- 其他对局可直接从 `Init` 进入 `Calm`
- 任何时刻房门耐久归零直接转入 `Defeat`
- 倒计时结束且房门未破则进入 `Victory`

### 7.3 Tick 流程

每次逻辑 Tick 建议执行顺序：

1. 更新时间与阶段
2. 结算病床产出
3. 结算设施持续效果
4. 更新电力状态
5. 更新异常值
6. 更新 AI 病房行为
7. 更新查房者状态与目标选择
8. 结算攻击与门体伤害
9. 检查技能效果
10. 检查胜负条件
11. 广播本 Tick 变化事件

这样可保证数据依赖顺序稳定。

---

## 8. 核心玩法系统设计

### 8.1 RoomSystem

`RoomSystem` 维护每间病房的基础状态：

- 房间 ID
- 是否玩家控制
- 护理点
- 电力
- 病床等级
- 房门等级
- 当前门体耐久
- 当前异常值
- 当前已摆设施
- 是否被锁定
- 是否已攻破

### 8.2 EconomySystem

职责：

- 病床产出护理点
- 处理升级、购买与修补消耗
- 广告增益带来的局内资源注入

要求：

- 所有产出和消耗都走统一接口
- 每次变更记录来源，便于调试和埋点

### 8.3 PowerSystem

职责：

- 管理局内副资源电力
- 驱动高级设施是否生效
- 控制低电状态下的异常表现

MVP 阶段可以简化为：

- 电力总量
- 当前消耗
- 是否过载

### 8.4 PlacementSystem

职责：

- 校验摆放格是否合法
- 应用障碍物和设备效果
- 向查房者寻路/移动提供阻挡信息

MVP 只做有限摆放格，不做自由拖拽装修。

### 8.5 AnomalySystem

职责：

- 计算病房异常值
- 给查房者提供目标选择输入
- 对 UI 输出风险级别而非强制暴露具体数值

建议异常值来源：

- 病床等级
- 设施数量
- 高级设备工作状态
- 房间亮度
- 高频噪音
- 门受损状态
- 特殊未处理事件

### 8.6 WatcherAISystem

职责：

- 维护查房者状态机
- 计算巡游、锁定、接近、攻击、离开
- 根据异常值与防连续锁定策略选择目标

建议状态：

- `Idle`
- `Patrol`
- `SelectTarget`
- `Approach`
- `Attack`
- `Recover`
- `Retreat`

MVP 不需要复杂导航，使用节点路径与简单阻挡计算即可。

### 8.7 AIRoomSystem

职责：

- 轻量模拟 5 个 AI 病房
- 形成公共局势
- 提供“别人被打，我偷发育”的竞争感

AI 病房建议只保留轻量数据：

- 当前成长倾向
- 病床等级
- 房门等级
- 门耐久
- 异常值
- 资源增速
- 是否濒危

不需要把 AI 病房做成完整操作型玩家。

### 8.8 SkillSystem

MVP 只实现一个主动技能：`紧急呼叫`

职责：

- 处理点击触发
- 控制冷却与次数
- 对查房者、门体、局部灯光施加短时效果

### 8.9 ResultSystem

职责：

- 判定胜负
- 汇总本局表现
- 生成结算数据
- 提供复活入口与奖励翻倍入口

---

## 9. 数据模型建议

### 9.1 核心运行数据

建议存在以下运行模型：

- `RunModel`
- `RoomModel`
- `PlayerRoomModel`
- `AIRoomModel`
- `WatcherModel`
- `FacilityModel`
- `SkillModel`
- `ResultModel`

### 9.2 建议配置表

建议至少配置这些表：

- `phase_config`
- `bed_upgrade_config`
- `door_upgrade_config`
- `facility_config`
- `anomaly_formula_config`
- `watcher_ai_config`
- `ai_room_profile_config`
- `skill_config`
- `revive_config`
- `meta_progress_config`

### 9.3 数值调优原则

- 参数要少而关键
- 单个参数的影响要可解释
- 避免同一效果被多个系统重复叠加
- 第一版先保证“能感知”，再追求“精细平衡”

---

## 10. 事件系统建议

推荐用轻量事件总线解耦逻辑与表现。

建议事件示例：

- `run_started`
- `phase_changed`
- `resource_changed`
- `door_damaged`
- `door_broken`
- `anomaly_level_changed`
- `watcher_target_changed`
- `watcher_attack_started`
- `watcher_attack_finished`
- `skill_triggered`
- `room_breached`
- `run_finished`

原则：

- 逻辑层发事件
- 表现层消费事件
- 事件名称明确表达业务语义

---

## 11. 微信小游戏平台接入设计

### 11.1 广告

MVP 需要接入：

- 失败复活激励视频
- 局后双倍奖励激励视频
- 开局增益激励视频

广告接入要求：

- 初始化与展示统一走 `AdService`
- 对“加载中”“失败”“未看完”“成功发奖”统一封装
- 不让业务代码直接处理平台回调细节

### 11.2 存储

MVP 阶段优先本地存档。

存储内容：

- 局外成长
- 玩家设置
- 新手是否完成
- 广告冷却与展示统计

统一走 `StorageService`。

### 11.3 埋点

至少接入以下核心埋点：

- 首局开始
- 首局结束
- 失败原因
- 使用复活广告
- 使用双倍奖励广告
- 使用开局增益广告
- 单局时长
- 技能使用时机
- 是否死于最后 30 秒

### 11.4 前后台与音频中断

小游戏环境需要处理：

- 切后台暂停
- 恢复前台继续
- 音频中断恢复
- 网络异常下的广告失败兜底

---

## 12. 资源与包体策略

### 12.1 包体原则

MVP 要求：

- 首包只保留启动必须资源
- 所有非首屏资源延后加载
- 大体积音频与主题资源分离

### 12.2 资源分层建议

主包：

- 启动脚本
- 通用 UI 图集
- 基础字体
- 首场景必要资源

本地分包 / Bundle：

- 战斗主场景核心资源
- 结算页资源

远程资源：

- 大音频资源
- 替换主题资源
- 后续病区美术资源
- 低频特效资源

### 12.3 资源管理要求

- 所有场景切换都要有明确预加载点
- 高频复用对象走对象池
- 不允许临时创建大量短生命周期节点
- 音频资源要区分短音效与长循环氛围音

---

## 13. UI 与表现层实现原则

### 13.1 UI 原则

- 让玩家随时知道护理点、门状态、危险感和技能冷却
- 不把异常值直接做成冷冰冰的数值条
- 危险信息优先用氛围和图标表达

### 13.2 演出触发方式

推荐按事件驱动：

- `door_damaged` 触发门裂纹、震动、撞击音
- `watcher_target_changed` 触发门口阴影、走廊灯变化
- `phase_changed` 触发灯光、BGM、提示变化
- `room_breached` 触发全局压力提升演出

### 13.3 引导实现

第一局引导建议：

- 走轻引导，不强制长文本
- 通过高亮和短句提示推动流程
- 将引导状态纳入单局状态机

---

## 14. 测试与调试支持

MVP 至少预留以下调试能力：

- 跳阶段
- 加资源
- 强制触发查房者锁定
- 查看当前异常值构成
- 查看 AI 病房状态
- 快速结束对局

建议在开发环境中增加简易调试面板。

### 14.1 关键验证项

- 玩家是否能感知“发育越快越危险”
- AI 病房是否形成真实竞争感
- 技能是否能成为有效保命手段
- 最后 30 秒压力是否显著上升
- 广告节点是否自然

---

## 15. 风险与技术应对

### 15.1 风险：逻辑和表现耦合

应对：

- 所有核心规则必须先落到 Gameplay 层
- UI 不直接改核心状态

### 15.2 风险：数值不可控

应对：

- 强制配置化
- 保留事件日志和调试面板

### 15.3 风险：小游戏真机表现与编辑器差异

应对：

- 每周至少一次真机集成验证
- 性能与广告问题以真机结果为准

### 15.4 风险：包体超限

应对：

- 从首日开始规划资源分层
- 大资源不上主包

---

## 16. MVP 落地结论

《午夜查房》MVP 技术实现建议总结如下：

- 用 Cocos Creator 3.8 + TypeScript
- 用固定 Tick 驱动局内数值模拟
- 用状态机管理单局流程
- 用配置表驱动数值
- 用平台适配层隔离微信 API
- 用事件驱动表现层
- 用轻量 AI 病房模拟公共竞争
- 用分包与远程资源控制小游戏包体

这套方案的目标不是“架构高级”，而是：

- 能尽快做出可玩的版本
- 能稳定调数值
- 能适配微信小游戏限制
- 能在玩法验证通过后平滑扩展
