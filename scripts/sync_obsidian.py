#!/usr/bin/env python3
"""
sync_obsidian.py — 将 rides.json 的骑行数据同步到 Obsidian 骑行记录.md

用法：
  python3 scripts/sync_obsidian.py                   # 全量同步
  python3 scripts/sync_obsidian.py --dry-run          # 试运行，不写入
  python3 scripts/sync_obsidian.py --check            # 检查差异但不写入
"""

import json
import os
import sys
import re
from datetime import datetime, timedelta

# ── 路径 ──
PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(PROJECT_DIR, "data", "rides.json")
CONFIG_FILE = os.path.join(PROJECT_DIR, "config.json")

def get_obsidian_path():
    """从配置文件读取导出路径，未配置则返回 None"""
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            obs = cfg.get("obsidian", {})
            if obs.get("enabled") and obs.get("vault_path"):
                return os.path.expanduser(obs["vault_path"])
        except Exception:
            pass
    return None

# ── 配色 ──
HR_COLORS = ["#4ECDC4", "#FFD93D", "#FF8C42", "#E85D75", "#C0392B"]
HR_LABELS = ["Z1", "Z2", "Z3", "Z4", "Z5"]

WEEKDAY_CN = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]


def load_rides():
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("records", []), data.get("route_colors", {}), data.get("route_order", [])


def load_existing_md():
    """读取现有 .md，提取各日期下的备注"""
    obsidian_path = get_obsidian_path()
    if not obsidian_path or not os.path.exists(obsidian_path):
        return None, {}
    with open(obsidian_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 提取每个日期标题下的 > 备注
    notes = {}
    # 匹配 ## 2026-06-07 这样的标题
    sections = re.split(r'(?=^## )', content, flags=re.MULTILINE)
    for sec in sections:
        m = re.match(r'^## (\d{4}-\d{2}-\d{2})', sec)
        if m:
            date = m.group(1)
            # 提取所有 > 开头的行
            note_lines = re.findall(r'^> (.+)', sec, re.MULTILINE)
            if note_lines:
                notes[date] = "\n".join(note_lines)

    return content, notes


def min_to_human(minutes):
    """将分钟转为 Xh Xmin 格式"""
    if not minutes or minutes == 0:
        return "—"
    h = int(minutes // 60)
    m = int(minutes % 60)
    if h > 0:
        return f"{h}h {m:02d}min"
    return f"{m} min"


def min_to_mmss(minutes):
    """将分钟转为 MM:SS 格式"""
    if not minutes or minutes == 0:
        return "—"
    m = int(minutes)
    s = int((minutes - m) * 60)
    return f"{m}:{s:02d}"


def get_previous_same_route(rides, ride):
    """获取同路线的上一次骑行记录（日期早于当前记录）"""
    ride_date = ride.get("date", "")
    same = [
        r for r in rides
        if r.get("route") == ride.get("route")
        and r.get("id") != ride.get("id")
        and r.get("date", "") <= ride_date
    ]
    same.sort(key=lambda r: r.get("date", "") + (r.get("start_time", "") or ""))
    return same[-1] if same else None


def diff_str(va, vb, higher_is_better=True):
    """比较两个数值，返回差值字符串"""
    if va is None or vb is None or va == 0 or vb == 0:
        return "—", ""
    d = vb - va
    if abs(d) < 0.1:
        return "—", ""
    arrow = "↑" if d > 0 else "↓"
    # 有些指标越小越好（用时、均心）
    if not higher_is_better:
        arrow = "↓" if d > 0 else "↑"
    return f"{arrow} {abs(d):.1f}", f"{arrow}{abs(d)}"


def hr_zone_text(zones):
    """生成心率区间纯文本彩条（兼容任何 Markdown 查看器）"""
    z = zones or {}
    lines = []
    for i in range(5):
        pct = z.get(f"zone{i+1}", 0) or 0
        # 30 格进度条：全格数 = pct / 100 * 30
        filled = round(pct / 100 * 30)
        bar = "█" * filled + "░" * (30 - filled)
        lines.append(f"  {HR_LABELS[i]} {bar} {pct:.1f}%")
    return "```\n" + "\n".join(lines) + "\n```"


def generate_md(rides, notes_map):
    """从骑行数据生成完整 Markdown"""
    lines = []
    now = datetime.now()
    this_month = now.month

    # ── Frontmatter ──
    lines.append("---")
    lines.append("tags:")
    lines.append("  - 自行车/记录")
    lines.append("  - 生活/运动")
    lines.append("  - 备忘录")
    lines.append("---")
    lines.append("")
    lines.append("# 骑行记录")
    lines.append("")

    # ── 汇总行 ──
    total_rides = len(rides)
    total_dist = sum(r.get("distance_km", 0) or 0 for r in rides)
    total_elev = sum(r.get("elev_gain_m", 0) or 0 for r in rides)
    total_cal = sum(r.get("calories", 0) or 0 for r in rides)

    this_month_rides = [r for r in rides if r.get("date", "").startswith(f"{now.year}-{now.month:02d}")]
    this_month_count = len(this_month_rides)
    this_month_dist = sum(r.get("distance_km", 0) or 0 for r in this_month_rides)

    lines.append(f"🏍 **总骑行 {total_rides} 次** · 📏 **总里程 {total_dist:.1f} km** · ⛰ **总爬升 {total_elev:.0f} m** · 🔥 **本月（{now.month:02d}） {this_month_count} 次**")
    lines.append("")
    lines.append("")

    # ── 月度统计 ──
    lines.append("## 月度统计")
    lines.append("")
    lines.append("| 月份 | 次数 | 里程 | 均速 | 移动用时 | 爬升 | 消耗 |")
    lines.append("|:---|:---:|:---|:---:|:---|:---:|:---:|")
    # 按月分组
    monthly = {}
    for r in rides:
        m = r.get("date", "")[:7]
        if m:
            monthly.setdefault(m, []).append(r)

    total_min = 0
    total_calories = 0
    for m in sorted(monthly.keys()):
        rs = monthly[m]
        cnt = len(rs)
        d = sum(r.get("distance_km", 0) or 0 for r in rs)
        avg_spd = sum(r.get("avg_speed_kmh", 0) or 0 for r in rs) / cnt if cnt else 0
        mov = sum(r.get("moving_time_min", 0) or 0 for r in rs)
        elev = sum(r.get("elev_gain_m", 0) or 0 for r in rs)
        cal = sum(r.get("calories", 0) or 0 for r in rs)
        total_min += mov
        total_calories += cal
        lines.append(f"| {m} | {cnt} | {d:.1f} km | {avg_spd:.1f} km/h | {min_to_human(mov)} | {elev:.0f} m | {cal:.0f} kcal |")

    lines.append(f"| **合计** | **{total_rides}** | **{total_dist:.1f} km** | — | **{min_to_human(total_min)}** | **{total_elev:.0f} m** | **{total_calories:.0f} kcal** |")
    lines.append("")

    # ── 路线统计 ──
    lines.append("## 路线统计")
    lines.append("")
    lines.append("| 路线 | 次数 | 最近日期 | 均速趋势 | 均心趋势 | 最佳均速 | 最快极速 |")
    lines.append("|:---|:---:|:---|:---|:---|:---|:---:|")

    routes = {}
    for r in rides:
        route = r.get("route", "未知")
        routes.setdefault(route, []).append(r)

    for route, rs in sorted(routes.items()):
        cnt = len(rs)
        dates = sorted(set(r.get("date", "") for r in rs))
        recent = dates[-1] if dates else ""
        speed_trend = "→".join(str(r.get("avg_speed_kmh", "")) for r in sorted(rs, key=lambda x: x.get("date", "")))
        hr_trend = "→".join(str(r.get("avg_hr", "")) for r in sorted(rs, key=lambda x: x.get("date", "")))
        best_speed = max(r.get("avg_speed_kmh", 0) or 0 for r in rs)
        top_speed = max(r.get("max_speed_kmh", 0) or 0 for r in rs)
        lines.append(f"| {route} | {cnt} | {recent} | {speed_trend} | {hr_trend} | {best_speed:.1f} km/h | {top_speed:.1f} km/h |")

    lines.append("")

    # ── 记录索引 ──
    lines.append("## 记录索引")
    lines.append("")
    lines.append("| 日期 | 路线 | 距离 | 均速 | 极速 | 均心 | 最高心率 | 消耗 | 爬升 |")
    lines.append("|:---|:---|:---|:---|:---|:---|:---|:---|:---|")

    sorted_rides = sorted(rides, key=lambda r: r.get("date", "") + (r.get("start_time", "") or ""), reverse=True)
    for r in sorted_rides:
        date = r.get("date", "")
        route = r.get("route", "未知")
        dist = r.get("distance_km", 0)
        avg_spd = r.get("avg_speed_kmh", 0)
        max_spd = r.get("max_speed_kmh", 0)
        avg_hr = r.get("avg_hr", 0)
        max_hr = r.get("max_hr", 0)
        cal = r.get("calories", 0)
        elev = r.get("elev_gain_m", 0)
        lines.append(
            f"| {date} | {route} | {dist:.2f} km | {avg_spd:.1f} km/h | {max_spd:.1f} km/h | "
            f"{avg_hr} bpm | {max_hr} bpm | {cal:.0f} kcal | {elev:.0f} m |"
        )

    lines.append("")
    lines.append("---")
    lines.append("")

    # ── 骑行详情（按日期分组，同一天多条合并）──
    from itertools import groupby
    sorted_by_date = sorted(rides, key=lambda r: r.get("date", ""), reverse=True)
    for date, day_rides in groupby(sorted_by_date, key=lambda r: r.get("date", "")):
        day_rides = list(day_rides)
        weekday = WEEKDAY_CN[datetime.strptime(date, "%Y-%m-%d").weekday()]

        if len(day_rides) == 1:
            # 单条骑行
            r = day_rides[0]
            lines.append(f"## {date} · {r.get('route', '骑行')}")
            lines.append("")
            lines.extend(_ride_detail_table(r, rides, single=True))
        else:
            # 同一天多条骑行（往返）
            lines.append(f"## {date}")
            lines.append("")
            # 并列表格
            headers = ["项目"] + [f"{r.get('route', '骑行')}" for r in day_rides] + [f"与上次对比"] * len(day_rides)
            # 展开：项目 | 路线A | 与上次对比 | 路线B | 与上次对比
            cols = ["| 项目"]
            for r in day_rides:
                cols.append(r.get("route", "骑行"))
                cols.append("与上次对比")
            lines.append("|".join(cols) + "|")
            lines.append("|" + "|".join([":---"] + [":---:"] * (len(day_rides) * 2)) + "|")

            # 填充数据行
            fields = ["日期", "出发", "结束", "总用时", "移动用时", "距离", "均速", "极速", "均心", "最高心率", "消耗", "爬升", "圈数"]
            for f in fields:
                row = [f"**{f}**"]
                for r in day_rides:
                    val, cmp = _ride_field(r, rides, f, single=False)
                    row.append(val)
                    row.append(cmp)
                lines.append("|" + "|".join(row) + "|")
            lines.append("")

        # 心率区间（每个路线分开展示）
        for r in day_rides:
            lines.append(f"### 心率区间分布 · {r.get('route', '')}")
            lines.append("")
            lines.append(hr_zone_text(r.get("hr_zones", {})))
            lines.append("")

        # 恢复用户备注（优先用 rides.json 里的 notes，其次从现有 md 提取）
        date_notes = []
        for r in day_rides:
            if r.get("notes") and r["notes"].strip():
                date_notes.append(r["notes"].strip())
        if not date_notes and date in notes_map:
            date_notes.append(notes_map[date])

        for note in date_notes:
            lines.append(f"> {note}")
            lines.append("")

        lines.append("---")
        lines.append("")

    return "\n".join(lines)


def _ride_detail_table(ride, all_rides, single=True):
    """生成单条骑行的详情表"""
    prev = get_previous_same_route(all_rides, ride)
    is_first = prev is None

    lines = []
    fields = [
        ("日期", _date_field(ride, prev, is_first)),
        ("出发", ride.get("start_time", "—") or "—", "—" if is_first else "—"),
        ("结束", ride.get("end_time", "—") or "—", "—" if is_first else "—"),
        ("总用时", min_to_human(ride.get("total_elapsed_min", 0)), "—" if is_first else "—"),
        ("移动用时", min_to_mmss(ride.get("moving_time_min", 0)),
         _diff_compare(ride.get("moving_time_min", 0), prev.get("moving_time_min") if prev else None, higher_is_better=False)),
        ("距离", f"{ride.get('distance_km', 0):.2f} km", "—" if is_first else "—"),
        ("均速", f"{ride.get('avg_speed_kmh', 0):.1f} km/h",
         _diff_compare(ride.get("avg_speed_kmh", 0), prev.get("avg_speed_kmh") if prev else None)),
        ("极速", f"{ride.get('max_speed_kmh', 0):.1f} km/h",
         _diff_compare(ride.get("max_speed_kmh", 0), prev.get("max_speed_kmh") if prev else None)),
        ("均心", f"{ride.get('avg_hr', 0)} bpm",
         _diff_compare(ride.get("avg_hr", 0), prev.get("avg_hr") if prev else None, higher_is_better=False)),
        ("最高心率", f"{ride.get('max_hr', 0)} bpm",
         _diff_compare(ride.get("max_hr", 0), prev.get("max_hr") if prev else None)),
        ("消耗", f"{ride.get('calories', 0):.0f} kcal",
         _diff_compare(ride.get("calories", 0), prev.get("calories") if prev else None)),
        ("爬升", f"{ride.get('elev_gain_m', 0):.0f} m（{ride.get('min_alt_m', 0):.0f}–{ride.get('max_alt_m', 0):.0f} m）",
         _diff_compare(ride.get("elev_gain_m", 0), prev.get("elev_gain_m") if prev else None)),
        ("圈数", f"{ride.get('num_laps', 0)} 圈（自动计圈，每 1km）", "—" if is_first else "—"),
    ]

    # 如果有踏频数据，加上踏频行
    if ride.get("has_cadence") or ride.get("avg_cadence", 0) > 0:
        fields.append(("均踏频", f"{ride.get('avg_cadence', 0)} rpm",
                       _diff_compare(ride.get("avg_cadence", 0), prev.get("avg_cadence") if prev else None)))
        fields.append(("最高踏频", f"{ride.get('max_cadence', 0)} rpm",
                       _diff_compare(ride.get("max_cadence", 0), prev.get("max_cadence") if prev else None)))

    lines.append("| 项目 | 数据 | 与上次对比 |")
    lines.append("|:---|:---|:---:|")
    for f in fields:
        if len(f) == 3:
            name, val, cmp = f
        else:
            name, cmp = f
            val = cmp
            cmp = "—"
        lines.append(f"| **{name}** | {val} | {cmp} |")

    return lines


def _date_field(ride, prev, is_first):
    """日期行"""
    date = ride.get("date", "")
    weekday = WEEKDAY_CN[datetime.strptime(date, "%Y-%m-%d").weekday()]
    if is_first:
        return f"{date}（{weekday}）", "首次"
    return f"{date}（{weekday}）", f"上次 {prev['date']}（{WEEKDAY_CN[datetime.strptime(prev['date'], '%Y-%m-%d').weekday()]}）"


def _diff_compare(va, vb, higher_is_better=True):
    """生成差值字符串"""
    if va is None or vb is None or va == 0 or vb == 0:
        return "—"
    d = vb - va
    if abs(d) < 0.1:
        return "—"
    if abs(d) < 1:
        arrow = "↑" if d > 0 else "↓"
        if not higher_is_better:
            arrow = "↓" if d > 0 else "↑"
        return f"{arrow} {abs(d):.1f}"
    arrow = "↑" if d > 0 else "↓"
    if not higher_is_better:
        arrow = "↓" if d > 0 else "↑"
    return f"{arrow} {abs(d):.0f}"


def _ride_field(ride, all_rides, field, single=True):
    """多路线并列表格中提取字段值"""
    prev = get_previous_same_route(all_rides, ride)
    is_first = prev is None

    if field == "日期":
        date = ride.get("date", "")
        weekday = WEEKDAY_CN[datetime.strptime(date, "%Y-%m-%d").weekday()]
        if is_first:
            return f"{date}（{weekday}）", "首次"
        return f"{date}（{weekday}）", f"上次 {prev['date']}"
    elif field == "出发":
        return ride.get("start_time", "—") or "—", "—"
    elif field == "结束":
        return ride.get("end_time", "—") or "—", "—"
    elif field == "总用时":
        return min_to_human(ride.get("total_elapsed_min", 0)), "—"
    elif field == "移动用时":
        return min_to_mmss(ride.get("moving_time_min", 0)), _diff_compare(ride.get("moving_time_min", 0), prev.get("moving_time_min") if prev else None, higher_is_better=False) if not is_first else "—"
    elif field == "距离":
        return f"{ride.get('distance_km', 0):.2f} km", "—"
    elif field == "均速":
        return f"{ride.get('avg_speed_kmh', 0):.1f} km/h", _diff_compare(ride.get("avg_speed_kmh", 0), prev.get("avg_speed_kmh") if prev else None) if not is_first else "—"
    elif field == "极速":
        return f"{ride.get('max_speed_kmh', 0):.1f} km/h", _diff_compare(ride.get("max_speed_kmh", 0), prev.get("max_speed_kmh") if prev else None) if not is_first else "—"
    elif field == "均心":
        return f"{ride.get('avg_hr', 0)} bpm", _diff_compare(ride.get("avg_hr", 0), prev.get("avg_hr") if prev else None, higher_is_better=False) if not is_first else "—"
    elif field == "最高心率":
        return f"{ride.get('max_hr', 0)} bpm", _diff_compare(ride.get("max_hr", 0), prev.get("max_hr") if prev else None) if not is_first else "—"
    elif field == "消耗":
        return f"{ride.get('calories', 0):.0f} kcal", _diff_compare(ride.get("calories", 0), prev.get("calories") if prev else None) if not is_first else "—"
    elif field == "爬升":
        return f"{ride.get('elev_gain_m', 0):.0f} m", _diff_compare(ride.get("elev_gain_m", 0), prev.get("elev_gain_m") if prev else None) if not is_first else "—"
    elif field == "圈数":
        return f"{ride.get('num_laps', 0)} 圈（自动计圈，每 1km）", "—"
    return "—", "—"


def log(msg):
    """输出到 stderr，避免污染 --stdout"""
    print(msg, file=sys.stderr)

def main():
    args = sys.argv[1:]
    dry_run = "--dry-run" in args or "-n" in args
    check = "--check" in args
    to_stdout = "--stdout" in args

    rides, colors, order = load_rides()
    if not rides:
        log("❌ 没有骑行数据")
        return

    obsidian_path = get_obsidian_path()
    existing_content, notes_map = (None, {})
    if obsidian_path and os.path.exists(obsidian_path):
        existing_content, notes_map = load_existing_md()
        if existing_content:
            log(f"📖 读取现有骑行记录.md（已提取 {len(notes_map)} 条备注）")
    elif to_stdout:
        pass  # 导出时不需要读现有文件
    elif obsidian_path:
        log("📖 未找到骑行记录.md，将创建新文件")
    else:
        log("⚠️ Obsidian 未配置（未找到 config.json 或 obsidian.enabled = false）")
        if not to_stdout:
            return

    md = generate_md(rides, notes_map)

    if check or (dry_run and not to_stdout):
        if existing_content:
            if md.strip() == existing_content.strip():
                log("✅ 文件内容一致，无需更新")
            else:
                old_lines = existing_content.strip().count("\n")
                new_lines = md.strip().count("\n")
                log(f"📝 有变化：现有 {old_lines} 行 → 新文件 {new_lines} 行")
                log("\n--- 新生成头部 ---")
                log("\n".join(md.split("\n")[:12]))
                log("...")
        else:
            log(f"📝 将创建新文件（{len(md)} 字符）")
        return

    if to_stdout:
        sys.stdout.write(md)
        return

    if not obsidian_path:
        log("❌ Obsidian 路径未配置，无法写入")
        return

    # 写入
    os.makedirs(os.path.dirname(obsidian_path), exist_ok=True)
    with open(obsidian_path, "w", encoding="utf-8") as f:
        f.write(md)

    total_km = sum(r.get("distance_km", 0) or 0 for r in rides)
    log(f"✅ 已同步到 Obsidian: {obsidian_path}")
    log(f"   总骑行 {len(rides)} 次，{total_km:.1f} km")


if __name__ == "__main__":
    main()
