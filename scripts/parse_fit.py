#!/usr/bin/env python3
"""
Parse a .fit cycling file and extract ride data.

Output format matches cycling-dashboard/data/rides.json record schema:
  track_points as [lat, lng, speed_kmh, hr, alt, cadence] (cadence 可选)
  has_cadence, avg_cadence, max_cadence 字段

Dependencies: fitparse (pip install fitparse)

Usage:
  python3 parse_fit.py <fit_file_path>
  python3 parse_fit.py <fit_file_path> --pretty   # formatted JSON output
"""

import fitparse
import json
import sys
import math
import os
from datetime import datetime, timedelta, timezone

# ── Constants ──────────────────────────────────────────────────────────

BEIJING_TZ = timezone(timedelta(hours=8))

# Apple Watch 5-zone HRR model (Garmin/Watch default zones)
HR_ZONE_BOUNDARIES = [140, 152, 164, 176]  # Z2@140, Z3@152, Z4@164, Z5@176
ZONE_LABELS = ["zone1", "zone2", "zone3", "zone4", "zone5"]

# ── Helpers ────────────────────────────────────────────────────────────

def semicircles_to_deg(val):
    """Convert FIT semicircle coordinate to degrees."""
    if val is None: return None
    return val / 2**31 * 180


def try_field(session_or_record, *names):
    """Return first non-None field value, or None."""
    for n in names:
        v = session_or_record.get(n)
        if v is not None:
            return v
    return None


def parse_fit(filepath):
    """
    Parse a .fit file and return a dict matching the rides.json record schema.

    Returns dict on success, or dict with "error" key on failure.
    """
    # ── Open ──
    try:
        fitfile = fitparse.FitFile(filepath)
    except Exception as e:
        return {"error": f"无法打开或解析 .fit 文件: {e}", "filename": os.path.basename(filepath)}

    # ── Collect messages ──
    session = None
    laps = []
    records = []
    file_id = None
    device_info = None

    try:
        for msg in fitfile.get_messages():
            name = msg.name
            data = {d.name: d.value for d in msg.fields}
            if name == 'session':
                session = data
            elif name == 'lap':
                laps.append(data)
            elif name == 'record':
                records.append(data)
            elif name == 'file_id':
                file_id = data
            elif name == 'device_info':
                device_info = data
    except Exception as e:
        return {"error": f"解析消息时出错: {e}", "filename": os.path.basename(filepath)}

    # ── Validate ──
    if not session:
        return {"error": "未找到 session 消息（不含骑行数据）", "filename": os.path.basename(filepath)}
    if not records:
        # 没有 record 消息 = 没有轨迹点，可能是手动录入
        return {"error": "未找到 record 消息（无轨迹数据）", "filename": os.path.basename(filepath)}

    # ── Basic metrics (session level) ──
    total_distance_cm = session.get('total_distance', 0) or 0
    total_timer_time_s = session.get('total_timer_time', 0) or 0
    total_elapsed_time_s = session.get('total_elapsed_time', 0) or 0

    avg_speed_ms = session.get('enhanced_avg_speed') or session.get('avg_speed', 0) or 0
    max_speed_ms = session.get('enhanced_max_speed') or session.get('max_speed', 0) or 0

    avg_hr = session.get('avg_heart_rate', 0) or 0
    max_hr = session.get('max_heart_rate', 0) or 0
    calories = session.get('total_calories', 0) or 0

    num_laps = session.get('num_laps', len(laps)) or len(laps)
    sport = session.get('sport', 'cycling')

    # ── Time (UTC → Beijing) ──
    start_utc = session.get('start_time')
    start_time_bj = None
    end_time_bj = None

    if start_utc:
        if start_utc.tzinfo is None:
            start_utc = start_utc.replace(tzinfo=timezone.utc)
        start_time_bj = start_utc.astimezone(BEIJING_TZ)
        if total_elapsed_time_s:
            end_utc = start_utc + timedelta(seconds=total_elapsed_time_s)
            end_time_bj = end_utc.astimezone(BEIJING_TZ)

    # ── GPS start/end ──
    start_lat = semicircles_to_deg(session.get('start_position_lat'))
    start_lng = semicircles_to_deg(session.get('start_position_long'))

    # Endpoint: use last record with position
    end_lat, end_lng = None, None
    for r in reversed(records):
        lat = r.get('position_lat') or r.get('lat')
        lng = r.get('position_long') or r.get('long')
        if lat is not None and lng is not None:
            end_lat = semicircles_to_deg(lat)
            end_lng = semicircles_to_deg(lng)
            break

    # ── Altitude ──
    altitudes = []
    for r in records:
        alt = r.get('enhanced_altitude') or r.get('altitude')
        if alt is not None:
            altitudes.append(alt)

    if altitudes:
        min_alt = min(altitudes)
        max_alt = max(altitudes)
        elev_gain = max_alt - min_alt
    else:
        min_alt = max_alt = elev_gain = 0.0

    # ── Heart rate zones ──
    hr_values = [r['heart_rate'] for r in records
                 if r.get('heart_rate') is not None and r['heart_rate'] > 0]
    if hr_values:
        zones = {z: 0 for z in ZONE_LABELS}
        for hr in hr_values:
            if hr < HR_ZONE_BOUNDARIES[0]:
                zones["zone1"] += 1
            elif hr < HR_ZONE_BOUNDARIES[1]:
                zones["zone2"] += 1
            elif hr < HR_ZONE_BOUNDARIES[2]:
                zones["zone3"] += 1
            elif hr < HR_ZONE_BOUNDARIES[3]:
                zones["zone4"] += 1
            else:
                zones["zone5"] += 1
        total_hr = len(hr_values)
        zone_pct = {k: round(v / total_hr * 100, 1) for k, v in zones.items()}
    else:
        zone_pct = {"zone1": 0.0, "zone2": 0.0, "zone3": 0.0, "zone4": 0.0, "zone5": 0.0}

    # ── Cadence ──
    cadence_vals = [r['cadence'] for r in records
                    if r.get('cadence') is not None and r['cadence'] > 0]
    has_cadence = len(cadence_vals) > 0
    avg_cadence = round(sum(cadence_vals) / len(cadence_vals), 1) if cadence_vals else 0
    max_cadence = max(cadence_vals) if cadence_vals else 0

    # ── Track points ──
    # Format: [lat, lng, speed_kmh, hr, alt, cadence]
    # cadence 为 6 号元素，无数据时写 0
    # Sample to ~500 points max for manageable file size
    sample_rate = max(1, len(records) // 500) if len(records) > 500 else 1
    track_points = []
    for i, r in enumerate(records):
        if i % sample_rate != 0:
            continue
        lat = r.get('position_lat') or r.get('lat')
        lng = r.get('position_long') or r.get('long')
        if lat is None or lng is None:
            continue
        lat_d = semicircles_to_deg(lat)
        lng_d = semicircles_to_deg(lng)
        if lat_d is None or lng_d is None:
            continue

        speed_ms = r.get('enhanced_speed') or r.get('speed', 0)
        speed_kmh = round(speed_ms * 3.6, 1) if speed_ms else 0
        hr_val = r.get('heart_rate', 0) or 0
        alt_val = r.get('enhanced_altitude') or r.get('altitude', 0) or 0
        cad_val = r.get('cadence', 0) or 0

        pt = [
            round(lat_d, 6),
            round(lng_d, 6),
            speed_kmh,
            hr_val,
            round(alt_val, 1)
        ]
        if has_cadence:
            pt.append(cad_val)
        track_points.append(pt)

    # ── Laps/splits ──
    splits = []
    for lap in laps:
        d = lap.get('total_distance', 0) or 0
        t = lap.get('total_timer_time', 0) or 0
        avg_s = lap.get('enhanced_avg_speed') or lap.get('avg_speed', 0) or 0
        max_s = lap.get('enhanced_max_speed') or lap.get('max_speed', 0) or 0
        avg_h = lap.get('avg_heart_rate', 0) or 0
        max_h = lap.get('max_heart_rate', 0) or 0
        if t > 0:
            splits.append({
                "dist_km": round(d / 1000, 2),
                "time_sec": round(t, 1),
                "pace": f"{int(t//60)}:{int(t%60):02d}",
                "speed_kmh": round(avg_s * 3.6, 1) if avg_s else 0,
                "max_speed_kmh": round(max_s * 3.6, 1) if max_s else 0,
                "avg_hr": avg_h,
                "max_hr": max_h,
            })

    # ── Build result ──
    result = {
        "filename": os.path.basename(filepath),
        "id": None,  # caller sets this
        "route": None,  # caller sets this
        "date": start_time_bj.strftime('%Y-%m-%d') if start_time_bj else "unknown",
        "start_time": start_time_bj.strftime('%H:%M') if start_time_bj else None,
        "end_time": end_time_bj.strftime('%H:%M') if end_time_bj else None,
        "distance_km": round(total_distance_cm / 1000, 2),
        "avg_speed_kmh": round(avg_speed_ms * 3.6, 1) if avg_speed_ms else 0,
        "max_speed_kmh": round(max_speed_ms * 3.6, 1) if max_speed_ms else 0,
        "avg_hr": avg_hr,
        "max_hr": max_hr,
        "calories": calories,
        "elev_gain_m": round(elev_gain, 1),
        "min_alt_m": round(min_alt, 1) if altitudes else 0,
        "max_alt_m": round(max_alt, 1) if altitudes else 0,
        "moving_time_min": round(total_timer_time_s / 60, 1),
        "total_elapsed_min": round(total_elapsed_time_s / 60, 1),
        "num_laps": num_laps,
        "num_records": len(records),
        "has_cadence": has_cadence,
        "avg_cadence": avg_cadence,
        "max_cadence": max_cadence,
        "hr_zones": zone_pct,
        "track_points": track_points,
        "splits": splits,
        "sport": sport,
        "start_lat": round(start_lat, 4) if start_lat is not None else None,
        "start_lng": round(start_lng, 4) if start_lng is not None else None,
        "end_lat": round(end_lat, 4) if end_lat is not None else None,
        "end_lng": round(end_lng, 4) if end_lng is not None else None,
    }

    # Add extra context for debugging
    if device_info:
        result["_device"] = device_info.get('manufacturer') or device_info.get('garmin_product') or None
    if file_id:
        result["_file_timestamp"] = str(file_id.get('time_created', '')) if file_id.get('time_created') else None

    return result


# ── CLI ────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f"用法: python3 {sys.argv[0]} <fit_file_path> [--pretty]", file=sys.stderr)
        print(f"示例: python3 {sys.argv[0]} ~/Desktop/1.fit --pretty", file=sys.stderr)
        sys.exit(1)

    pretty = '--pretty' in sys.argv
    filepath = sys.argv[1]

    if not os.path.isfile(filepath):
        print(json.dumps({"error": f"文件不存在: {filepath}"}, ensure_ascii=False))
        sys.exit(1)

    result = parse_fit(filepath)

    kwargs = {"ensure_ascii": False}
    if pretty:
        kwargs["indent"] = 2

    print(json.dumps(result, **kwargs))

    if "error" in result:
        sys.exit(1)
