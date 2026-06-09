# 🚴 骑行记录看板

> 🎨 这是一个 **Vibe Coding** 作品——完全通过 AI 对话完成，零手工编码。

将 WorkoutDoors / Garmin 等 App 导出的 .fit 骑行文件拖拽到浏览器，自动解析并展示地图路线、骑行数据和分析统计。

![看板截图](docs/%E7%9C%8B%E6%9D%BF1-%E6%80%BB%E8%A7%88.png)

## ✨ 功能一览

| 功能 | 说明 |
|------|------|
| 📤 拖拽上传 | 拖入或点击选择 .fit 文件，秒级解析 |
| 🗺️ 轨迹地图 | Leaflet 地图展示每次骑行的完整 GPS 路线 |
| 📊 数据看板 | 心率 / 速度 / 海拔趋势图、月度里程柱状图 |
| 🧠 **智能路线命名** | 自动识别起点终点位置，三种命名模式自由选 |
| 📍 地标辅助 | 自动从路线名提取地名作为地标，也支持手动标记 |
| 🔄 绕圈检测 | 起点终点相同时自动进入「绕圈命名」模式，显示途经点 |
| 🏆 路线统计 | 同路线对比、均速趋势、频次分析、排序筛选 |
| 🎨 动态颜色 | 路线越活跃越鲜艳，长期不骑自动变灰 |
| 📝 骑行点评 | 每次骑行写感想，保存后自动持久化 |
| 🗑️ 编辑管理 | 重命名路线（同名批量改）、删除记录 |
| 📥 **导出 Markdown** | 一键导出完整骑行报告，结构清晰，方便 AI 分析或归档 |
| 📓 Obsidian 可选同步 | 配置导出路径后自动同步（不绑定 Obsidian，可放任意位置） |

## 🚀 快速开始

### macOS

```bash
# 双击 start.command 即可，或终端运行：
cd cycling-dashboard
pip3 install -r requirements.txt
python3 server.py
```

浏览器打开 **http://localhost:8080**

### Windows / Linux

```bash
pip install -r requirements.txt
python server.py
```

## 📁 上传 .fit 文件

拖拽 .fit 文件到浏览器的上传区域，或点击上传区域选择文件。支持批量处理：

```bash
python scripts/process_fit.py ~/Downloads/*.fit
```

## 🧠 路线命名的三种模式

上传新路线自动检测匹配，未匹配时弹出命名弹窗：

| 模式 | 触发条件 | 示例 |
|:---|:---|:---|
| 🅰️→🅱 起终点 | 起点 ≠ 终点 | `家→王府井（长安街）` |
| 🔄 绕圈 | 起点 ≈ 终点 | `奥体中心绕圈` |
| ✏️ 自定义 | 随时可用 | `周末休闲骑` |

弹窗会显示 GPS 反编码的地点名和地标提示，输入后自动生成最终路线名。

## ⚙️ 配置导出路径（可选）

```bash
cp config.example.json config.json
```

编辑 `config.json`：

```json
{
  "obsidian": {
    "enabled": true,
    "vault_path": "~/Documents/骑行记录.md"
  }
}
```

> 不配置也不影响使用，可随时在页面右上角 ⚙️ 或点击 📥 手动导出。

## 📋 系统要求

- Python 3.8+
- 现代浏览器（Chrome / Edge / Safari）

```bash
pip install -r requirements.txt
```

## 🔄 .fit 文件兼容性

| App | 状态 |
|:---|:---:|
| WorkOutDoors (iOS) | ✅ 完整支持 |
| Garmin Connect | ✅ 标准 FIT 协议 |
| Wahoo Fitness | ✅ 同上 |
| 其他标准 .fit 导出 | ⚠️ 未大量测试，欢迎反馈 Issue |

## 🛠️ 技术栈

| 层 | 技术 |
|:---|:---|
| 后端 | Python 3 + http.server |
| 前端 | 原生 JavaScript (ES Module) |
| 地图 | Leaflet.js + CARTO 底图 |
| 图表 | Chart.js |
| .fit 解析 | fitparse (Python) |
| 地理编码 | OpenStreetMap Nominatim API |

## 📁 项目结构

```
cycling-dashboard/
├── server.py           # 本地服务器（双击或终端启动）
├── start.command       # macOS 一键启动
├── index.html          # 看板页面
├── css/style.css       # 样式
├── js/                 # 前端脚本（5 个模块）
├── data/               # 用户数据（不提交 GitHub）
├── scripts/            # 工具脚本
│   ├── parse_fit.py    # .fit 解析
│   ├── process_fit.py  # 批量处理
│   └── sync_obsidian.py# 同步到配置路径
└── __processed__/      # 已处理文件归档
```

## 📄 许可

MIT
