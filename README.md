#  骑行记录看板

> **Vibe Coding 作品** — 从浏览器原型演进为原生 macOS 应用。

将 Garmin / WorkOutDoors 等 App 导出的 .fit 骑行文件拖入 macOS 应用，自动解析并展示地图路线、骑行数据和分析统计。

> 本项目的 [Web 版本](web/) 已归档在 `web/` 目录，功能完整但不再迭代。

## 功能一览

| 功能 | 说明 |
|------|------|
|   地图首屏 | 进入即见所有路线总览，MapKit 全屏展示 |
|   统计卡片 | 距离/用时/均速/极速/爬升/消耗/心率一目了然 |
|   月度图表 | 柱线双轴图，月度里程趋势 + 均速 |
|   智能路线命名 | 自动识别起点终点，三种命名模式 + 地标辅助 |
|   绕圈检测 | 起点终点相同时自动进入绕圈模式，途经点标记 + 圈数统计 |
|   路线对比 | 选中同路线所有骑行，统一缩放聚焦 |
|   排序筛选 | 骑行列表按日期/距离/均速/爬升排序，统计区按月筛选 |
|   深色模式 | 明暗切换，系统跟随可选 |
|   分享图导出 | 1:1 / 3:4 比例，5 预设渐变 + 纯色 + 自定义背景 |
|   Obsidian 同步 | Cmd+Shift+S 一键同步到知识库 |

## 快速开始

```bash
# 系统要求: macOS 14 (Sonoma) 或更高

cd CyclingDashboard

# 日常验收（增量编译）
./build-app.sh debug

# 发布
./build-app.sh

# 从 Finder 打开 .build/release/CyclingDashboard.app
# 首次运行通过「项目 > 选择项目文件夹」指向仓库根目录
```

也可用 Xcode 直接打开 `Package.swift`，Cmd+R 增量编译 + SwiftUI Preview。

## 开发与测试

日常修改后运行一次完整验收：

```bash
cd CyclingDashboard
./verify-app.sh
```

这个命令会先运行自动测试，再生成调试版 `.build/debug/CyclingDashboard.app`。

在 Xcode 中：

- `Cmd+U`：运行全部自动测试
- `Cmd+R`：编译并启动应用，进行界面验收

自动测试覆盖核心算法、旧版 JSON 兼容、圈数优先级、骑行排序及路线趋势数据。地图交互、FIT 导入、重命名、删除和分享仍需在发布前人工走查。

## 项目结构

```
cycling-dashboard/
├── CyclingDashboard/        #   macOS 应用主工程
│   ├── Package.swift
│   ├── Tests/                 # XCTest 自动测试
│   ├── verify-app.sh          # 自动测试 + 调试构建
│   ├── Sources/
│   │   └── CyclingDashboard/
│   │       ├── App.swift            # 入口 + 菜单栏 + 快捷键
│   │       ├── DashboardView.swift  # 主布局
│   │       ├── MapView.swift        # MapKit 地图
│   │       ├── ImportView.swift     # .fit 导入
│   │       ├── StatsSection.swift   # 统计卡片
│   │       ├── MonthlyChartView.swift # 月度图表
│   │       ├── RideDetailView.swift # 骑行详情
│   │       ├── DataStore.swift      # 数据层
│   │       ├── Models.swift         # 数据模型
│   │       ├── CoordinateTransform.swift # WGS-84 ←→ GCJ-02
│   │       ├── Theme.swift          # 主题/配色
│   │       ├── Utils.swift          # 工具函数
│   │       └── ...
│   └── build-app.sh
├── web/                      #   已归档浏览器版（不再迭代）
├── data/
│   ├── rides.json            # 所有骑行数据
│   └── locations.json        # 地标列表
├── scripts/                  # 工具脚本
└── config.example.json       # 配置模板
```

## 技术栈

| 层 | 技术 |
|:---|:---|
| 语言 | Swift 6 |
| UI | SwiftUI |
| 地图 | MapKit |
| 图表 | Swift Charts |
| 数据 | SwiftData / JSON |
| .fit 解析 | Python fitparse（桥接） |
| 地理编码 | OpenStreetMap Nominatim API |

## .fit 文件兼容性

| App | 状态 |
|:---|:---:|
| WorkOutDoors (iOS) |   完整支持 |
| Garmin Connect |   标准 FIT 协议 |
| Wahoo Fitness |   同上 |
| Strava 导出 |   同上 |

## 致谢

本项目始于 2026 年 5 月的一个浏览器原型，经多轮迭代演进为原生 macOS 应用。全程由 AI 对话驱动（Vibe Coding），零手工编码。Web 原型源码保留在 `web/` 目录供参考。

## 许可

MIT
