# Usnea（松萝）

[English](README.md) | 简体中文

为 Vibe Coding 而生的轻量 2D 游戏引擎。一套代码运行在 Web、Windows、Linux 和安卓上；TypeScript + ECS、纯文本场景、npm 插件生态、按需渲染省电，并能把其他引擎的项目直接转写过来。

> **状态：v0.0，刚刚起步。** 下文描述的大部分功能**尚未实现**。本页是路线图，不是现状，任何内容都不应被当作已有功能。“Usnea”为暂定名。

## 目标

每一项目标在 [docs/PLAN.md](docs/PLAN.md) 中都有验收标准。

- 便捷：不装编辑器，一条命令开始。
- 易写：接口少、概念少。
- 适合 Vibe Coding：AI 能读懂文档、改代码，并自己验证结果。
- 能耗最优：默认省电，不靠使用者调优。
- 生态：插件就是普通 npm 包，官方插件与第三方插件使用同一套接口。
- 跨平台：同一个项目能打包到 Web、Windows、Linux、安卓。
- 可转写：能导入 Cocos Creator、Phaser、Godot、Unity 的 2D 项目。

## 非目标（1.0 之前不做）

- 3D 渲染。
- 图形化编辑器（场景靠文本，由人或 AI 编辑）。
- 主机平台（PlayStation、Xbox、Switch）。
- 苹果平台（macOS、iOS）的原生打包。Web 版在苹果设备的浏览器里通常也能打开，但不做专门的测试和保证。
- 自研物理、音频解码、网络协议；一律封装现成的开源库。
- 可视化着色器编辑、骨骼动画编辑等内容制作工具。

## 设计原则

1. 一切皆文本。场景、预制体、配置、资源清单都是 JSON。
2. 核心极小。能做成插件的就不进核心。
3. 数据与逻辑分离。组件只存数据，系统只是函数，一个系统一个文件。
4. 默认省电。画面没变就不重绘，没事可做就停下主循环。
5. AI 可自验证。每个功能都能无头运行、截图、导出状态。
6. 报错即教学。每条错误信息都说明原因和修法。
7. 一套代码，全平台。游戏代码、插件和核心都不直接调用浏览器接口，一切经过平台层。

## 接口草案

以下是规划中的设计草案，目前无法运行，最终实现可能不同。

```ts
import { defineComponent, defineSystem, f32 } from "usnea";

export const Position = defineComponent("Position", { x: f32, y: f32 });
export const Velocity = defineComponent("Velocity", { x: f32, y: f32 });

export const movement = defineSystem({
  name: "movement",
  query: [Position, Velocity],
  writes: [Position],
  run(world, dt, entities) {
    for (const e of entities) {
      Position.x[e] += Velocity.x[e] * dt;
      Position.y[e] += Velocity.y[e] * dt;
    }
  },
});
```

## 目标平台

Web、Windows、Linux、安卓。计划第一阶段给 Web 构建产物套一层原生“壳”，之后可能做实验性的原生运行时。以上均尚未实现。

## 路线图

规模为相对工作量，不承诺日期。

- v0.0 起步（小）：仓库结构、协议文件、中英文 README、`AGENTS.md`、CI、npm 占位包。
- v0.1 核心（大）：ECS、调度器、事件、JSON 场景、平台层、WebGL2 精灵渲染、按需渲染主循环、无头模式、基础命令行、一个示例游戏。
- v0.2 生态（中）：插件接口、官方插件（输入、音频、物理、UI、补间）、自动生成 `llms.txt`、配方库、错误编号。
- v0.3 多平台打包（中）：`usnea build --target` 支持 Web、Windows、Linux、安卓，以及设备插件。
- v0.4 转写一期（大）：导入器框架与报告、Cocos Creator 和 Phaser 导入器、兼容层、瓦片地图插件。
- v0.5 能耗与小游戏平台（中）：基准测试、四个平台实测、微信和抖音小游戏适配、粒子、WebGPU 评估。
- v0.6 转写二期（大）：Godot 和 Unity 导入器及兼容层。
- v0.7 原生运行时（大，实验性）：Rust + wgpu 运行时；可能推迟到 1.0 之后。
- v1.0 稳定版（中）：核心接口冻结、完整文档、迁移指南、数据模组。

## 仓库结构

目录已经建立，但每个包目前都是空骨架。

```
usnea/
├─ packages/    核心、render-webgl2、headless、platform-web、cli、create-usnea
├─ shells/      各平台的壳（tauri、electron）
├─ runtime-native/   原生运行时（v0.7，Rust）
├─ plugins/     input、audio、physics2d、ui、tween、device、tilemap …
├─ compat/      cocos、phaser、godot、unity
├─ importers/   core、cocos、phaser、godot、unity
├─ examples/    示例游戏
├─ benchmarks/  能耗与性能基准
└─ docs/        文档、配方库、llms.txt 生成脚本
```

## 开发

需要 Node >= 22 和 pnpm。各包目前是空骨架，所以这些命令几乎没有可运行的内容。

```
pnpm install
pnpm check       # 代码检查与格式化（Biome）
pnpm typecheck
pnpm test
pnpm build
```

提交改动之前请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 协议

- 代码：Apache-2.0。
- 文档和示例素材：CC BY 4.0。

文中提到其他引擎（Cocos Creator、Phaser、Godot、Unity）只是为了说明导入器的用途，不代表有官方合作关系。

## 更多

完整规划：[docs/PLAN.md](docs/PLAN.md)。
