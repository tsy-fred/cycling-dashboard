# Cycling Dashboard

@../AGENTS.md

单人本地骑行记录看板。**主线是原生 Swift macOS app**,web 版已归档在 `web/`（不再迭代，仅保留可运行快照）。两形态共用 `data/rides.json`。

macOS app 主界面：地图首屏 + 下方统计卡片/路线卡/最近骑行列表，Toolbar 切换路线并缩放到具体路线。

## Quick Start (macOS App)

```bash
cd CyclingDashboard
swift build                  # 调试编译
./build-app.sh               # 生成 .build/release/CyclingDashboard.app
# 从 Finder 打开 .app，首次运行通过「项目 > 选择项目文件夹」指向仓库根目录
```

## Quick Start (Web)

```bash
cd web
pip3 install -r requirements.txt   # fitparse + certifi
npm install && npm run build       # fit-parser-bundle
python3 server.py                  # http://localhost:8080
```

## Structure

```
cycling-dashboard/
├── CyclingDashboard/    # SwiftUI macOS app（主线）
│   ├── Package.swift
│   ├── Sources/
│   │   └── CyclingDashboard/
│   └── build-app.sh
├── web/                 # 浏览器版（已归档，不再迭代）
│   ├── server.py        # HTTP 服务器，所有 API 路由
│   ├── start.command    # 双击启动
│   ├── index.html       # 看板单页
│   ├── js/
│   │   ├── app.js       # 入口/上传/设置/算法
│   │   ├── charts.js    # Chart.js 图表渲染
│   │   ├── map.js       # Leaflet 地图/轨迹/热力图
│   │   ├── export.js    # 图片分享图 Canvas 导出
│   │   ├── locations.js # 地标管理/聚类
│   │   └── storage.js   # rides.json 加载器
│   ├── css/style.css
│   └── package.json     # fit-parser-bundle 构建
├── data/
│   ├── rides.json       # 所有骑行数据（在 git）
│   └── locations.json   # 地标列表
├── __processed__/       # 已归档 .fit（gitignore）
├── scripts/
│   ├── parse_fit.py     # FIT → JSON（只读）
│   ├── process_fit.py   # 批量导入
│   ├── merge_fit.py     # 合并断开骑行
│   └── sync_obsidian.py # 同步到 Obsidian
└── config.example.json  # 配置模板
```

## Tech Stack

| 层 | 选型 |
|---|---|
| macOS app | Swift 6 + SwiftUI |
| 地图（macOS） | MapKit |
| 图表（macOS） | Swift Charts |
| 数据（macOS） | SwiftData / JSON |
| 后端 | Python 3 + http.server |
| 前端 | 原生 ES Module |
| 地图 | Leaflet 1.9 + CARTO |
| 图表 | Chart.js 4.4.7 |
| FIT 解析（macOS） | Python fitparse（复用 `scripts/parse_fit.py`） |
| FIT 解析（浏览器） | fit-file-parser（`npm run build`） |
| FIT 解析（Python） | fitparse（只读） |
| 地理编码 | OpenStreetMap Nominatim |

## Conventions

- **`fitparse` 只读**，写 FIT 用 `fit-tool`（`pip install fit-tool`）
- 不要手改 `web/js/fit-parser-bundle.js`
- **`manual_laps` 优先于 `num_laps`**
- 不要给 `data/rides.json` 写迁移脚本
- 单人项目，不要加抽象层/错误处理/参数校验
- **Push 必须经用户拍板**

## Server API

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/config` | 读配置 |
| POST | `/config` | 写配置 |
| GET | `/locations` | 读地标 |
| POST | `/save` | 保存 rides.json |
| POST | `/upload` | 上传 .fit |
| GET | `/strava/connect` | OAuth 跳转 |
| POST | `/strava/upload` | 上传到 Strava |

## Known Gotchas

1. `session.timestamp` 是开始时刻，非结束
2. Nominatim 频率限制（1 请求/秒）
3. macOS python.org 缺 SSL 证书，用 certifi 兜底
4. 浏览器端 .fit >10MB 自动回退到服务端解析
