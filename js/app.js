/**
 * app.js — 骑行看板主逻辑
 * 整合 storage / map / charts 模块 + 上传解析 + GPS 路线匹配 + 动态颜色
 */

import { loadRides } from './storage.js';
import { initMap, rebuildMapLayers, initLegend, highlightRide, fitRideBounds, placeCrosshair, clearCrosshair, setPolylineStyle, resetPolylineStyles, fitBoundsToPoints, renderLocations, setContextMenuHandler, renderSpeedHeatmap, clearSpeedHeatmap } from './map.js';
import { initMonthlyChart, renderDetail, renderSelectedHR } from './charts.js';
import { loadLocations, getLocations, addLocation, removeLocation, renameLocation, findNearestLocation, saveLocations } from './locations.js';
import { setupExportModal, openShareModal as openShareModalImpl } from './export.js';

const KNOWN_ROUTE_COLORS = {};

const COLOR_PALETTE = [
  '#E53935', // 红
  '#FF8F00', // 琥珀
  '#43A047', // 绿
  '#00ACC1', // 青
  '#1E88E5', // 蓝
  '#8E24AA', // 紫
  '#D81B60', // 粉
  '#FB8C00', // 橙
];

const GPS_MATCH_KM = 0.5;

// 心率分区默认阈值 (Z2/Z3/Z4/Z5 起点)
const DEFAULT_HR_THRESHOLDS = [140, 152, 164, 176];
const DEFAULT_PROFILE = { age: 0, resting_hr: 0, zone_mode: 'auto', zone_thresholds: [...DEFAULT_HR_THRESHOLDS] };
let _profile = { ...DEFAULT_PROFILE };

function calculateHRThresholds(profile) {
  const p = profile || _profile || DEFAULT_PROFILE;
  if (p.zone_mode === 'manual' && Array.isArray(p.zone_thresholds) && p.zone_thresholds.length === 4) {
    return p.zone_thresholds.map(v => +v).sort((a, b) => a - b);
  }
  const age = +p.age || 0;
  const rest = +p.resting_hr || 0;
  if (age <= 0 || rest <= 0) return [...DEFAULT_HR_THRESHOLDS];
  const maxHr = 220 - age;
  const hrr = maxHr - rest;
  const ratios = [0.6, 0.7, 0.8, 0.9];
  return ratios.map(r => Math.round(rest + hrr * r));
}

function calculateHRZones(hrs, thresholds) {
  const t = thresholds || DEFAULT_HR_THRESHOLDS;
  const zones = { zone1: 0, zone2: 0, zone3: 0, zone4: 0, zone5: 0 };
  for (const hr of hrs) {
    if (hr < t[0]) zones.zone1++;
    else if (hr < t[1]) zones.zone2++;
    else if (hr < t[2]) zones.zone3++;
    else if (hr < t[3]) zones.zone4++;
    else zones.zone5++;
  }
  const total = hrs.length || 1;
  for (const k of Object.keys(zones)) zones[k] = +(zones[k] / total * 100).toFixed(1);
  return zones;
}

function formatHRZonePreview(profile) {
  const t = calculateHRThresholds(profile);
  return `Z1 < ${t[0]} · Z2 ${t[0]}-${t[1] - 1} · Z3 ${t[1]}-${t[2] - 1} · Z4 ${t[2]}-${t[3] - 1} · Z5 ≥ ${t[3]}`;
}

let RIDES = [];
let RC = {};
let RO = [];
let LOCATIONS = [];
let _currentViewIdx = -1;
let pendingUploadData = null;
let _sortCol = 'date';
let _sortAsc = false;
let _rsSortCol = null;
const _PAGE_SIZE = 10;
let _currentPage = 1;
let _rsSortAsc = true;
let _statsScope = localStorage.getItem('cycling-dashboard:statsScope') || 'all';

// 初始化 Lucide 图标
if (window.lucide) lucide.createIcons();

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const cfgRes = await fetch('/config');
    if (cfgRes.ok) {
      const cfg = await cfgRes.json();
      _profile = { ...DEFAULT_PROFILE, ...(cfg.profile || {}) };
    }
  } catch { /* ignore */ }

  try {
    const data = await loadRides();
    RIDES = data.records || [];
    RC = data.route_colors || {};
    RO = data.route_order || [];
    refreshAll();
    LOCATIONS = await loadLocations(RIDES);
    renderLocations(LOCATIONS, handleLocationAction, handleLocationDrag);
    setupMapContextMenu();
    if (RIDES.length === 0) {
      document.getElementById('dropZone').style.display = 'block';
    }
  } catch (err) {
    document.getElementById('stats').innerHTML = `<p style="color:red;padding:20px">数据加载失败: ${err.message}</p>`;
  }
  initUpload();
  initModal();
  initNotes();
  initSettings();
  setupExportModal();
  initStatsTabs();
  handleStravaUrlFlag();
});

function initStatsTabs() {
  document.querySelectorAll('#statsTabs .sv-tab').forEach(tab => {
    if (tab.dataset.scope === _statsScope) tab.classList.add('active');
    tab.addEventListener('click', () => {
      _statsScope = tab.dataset.scope;
      localStorage.setItem('cycling-dashboard:statsScope', _statsScope);
      document.querySelectorAll('#statsTabs .sv-tab').forEach(t => t.classList.toggle('active', t.dataset.scope === _statsScope));
      initStats();
    });
  });
}

function getDisplayColor(route) {
  const base = RC[route] || '#666';
  return calcDisplayColor(base, calcRouteActivity(route));
}

function renderIcons() {
  if (window.lucide) lucide.createIcons();
}

function refreshAll() {
  initStats();
  initAchievements();
  renderIcons();
  if (!document.querySelector('#map .leaflet-container')) {
    initMap(RIDES, RC, showRide, getDisplayColor);
  }
  rebuildMapLayers(RIDES, RC, showRide, getDisplayColor);
  initLegend(RO, RC, RIDES);
  initTable();
  initRouteStats();
  initMonthlyChart(RIDES);
  initComp();
}

function initAchievements() {
  const el = document.getElementById('achievements');
  if (!el || !RIDES.length) { el && (el.innerHTML = ''); return; }
  const longest = RIDES.reduce((a, b) => (a.distance_km || 0) > (b.distance_km || 0) ? a : b);
  const fastest = RIDES.reduce((a, b) => (a.avg_speed_kmh || 0) > (b.avg_speed_kmh || 0) ? a : b);
  const highest = RIDES.reduce((a, b) => (a.elev_gain_m || 0) > (b.elev_gain_m || 0) ? a : b);
  const fastestTop = RIDES.reduce((a, b) => (a.max_speed_kmh || 0) > (b.max_speed_kmh || 0) ? a : b);
  el.innerHTML = `<div class="hd" style="margin-top:10px;margin-bottom:6px"><i data-lucide="trophy" class="lci"></i> 骑行成就</div>
    <div class="ach-grid">
      <div class="ach-item"><span class="ach-val">${longest.distance_km || 0}</span><span class="ach-unit">km</span><span class="ach-label">最长距离</span><span class="ach-date">${longest.date || ''}</span></div>
      <div class="ach-item"><span class="ach-val">${fastest.avg_speed_kmh || 0}</span><span class="ach-unit">km/h</span><span class="ach-label">最佳均速</span><span class="ach-date">${fastest.date || ''}</span></div>
      <div class="ach-item"><span class="ach-val">${fastestTop.max_speed_kmh || 0}</span><span class="ach-unit">km/h</span><span class="ach-label">最快极速</span><span class="ach-date">${fastestTop.date || ''}</span></div>
      <div class="ach-item"><span class="ach-val">${highest.elev_gain_m || 0}</span><span class="ach-unit">m</span><span class="ach-label">最大爬升</span><span class="ach-date">${highest.date || ''}</span></div>
    </div>`;
}

function initStats() {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const rides = _statsScope === 'month' ? RIDES.filter(r => r.date && r.date.startsWith(thisMonth)) : RIDES;
  const prefix = _statsScope === 'month' ? '本月' : '总';
  const t = rides.length;
  const d = rides.reduce((s, r) => s + (r.distance_km || 0), 0);
  const e = rides.reduce((s, r) => s + (r.elev_gain_m || 0), 0);
  const tm = rides.reduce((s, r) => s + (r.moving_time_min || 0), 0);
  const avgSpd = d > 0 && tm > 0 ? d / (tm / 60) : 0;
  const hrs = (tm / 60);
  document.getElementById('stats').innerHTML =
    `<div class="b"><div class="n">${t}</div><div class="l">${prefix}次数</div></div>` +
    `<div class="b"><div class="n">${d.toFixed(1)}</div><div class="l">${prefix}里程 km</div></div>` +
    `<div class="b"><div class="n">${e}</div><div class="l">${prefix}爬升 m</div></div>` +
    `<div class="b"><div class="n">${avgSpd.toFixed(1)}</div><div class="l">${prefix}均速 km/h</div></div>` +
    `<div class="b"><div class="n">${hrs.toFixed(1)}</div><div class="l">${prefix}时长 h</div></div>`;
}

function getSortValue(r, col) {
  if (col === 'date') return r.date || '';
  if (col === 'route') return r.route || '';
  if (col === 'dist') return r.distance_km || 0;
  if (col === 'speed') return r.avg_speed_kmh || 0;
  if (col === 'topSpeed') return r.max_speed_kmh || 0;
  if (col === 'hr') return r.avg_hr || 0;
  if (col === 'elev') return r.elev_gain_m || 0;
  return '';
}

function sortRides() {
  if (!_sortCol) return;
  const sorted = [...RIDES].sort((a, b) => {
    const va = getSortValue(a, _sortCol);
    const vb = getSortValue(b, _sortCol);
    if (typeof va === 'number') return _sortAsc ? va - vb : vb - va;
    return _sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
  });
  return sorted;
}

function initTable() {
  const sorted = _sortCol ? sortRides() : [...RIDES].reverse();
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / _PAGE_SIZE));
  _currentPage = Math.min(_currentPage, totalPages);
  const start = (_currentPage - 1) * _PAGE_SIZE;
  const pageItems = sorted.slice(start, start + _PAGE_SIZE);

  document.getElementById('rt').innerHTML = pageItems.map(r => {
    const idx = RIDES.indexOf(r);
    return `<tr onclick="window.showRide(${idx})" data-i="${idx}">` +
      `<td style="white-space:nowrap">${(r.date || '').replace(/-/g, '/')}</td>` +
      `<td><span class="rb"><span class="dot" style="background:${RC[r.route] || '#666'}"></span>${r.route || '未知'}</span></td>` +
      `<td class="num">${r.distance_km || '-'}</td><td class="num">${r.avg_speed_kmh || '-'}</td><td class="num">${r.max_speed_kmh || '-'}</td><td class="num">${r.avg_hr || '-'}</td><td class="num">${r.elev_gain_m || '-'}</td>` +
      `<td style="text-align:center"><span class="del-btn" onclick="event.stopPropagation();window.deleteRide(${idx})">✕</span></td></tr>`;
  }).join('');

  // 更新表头排序指示
  document.querySelectorAll('#rtable th[data-sort]').forEach(th => {
    const col = th.dataset.sort;
    th.classList.toggle('sort-asc', _sortCol === col && _sortAsc);
    th.classList.toggle('sort-desc', _sortCol === col && !_sortAsc);
  });

  renderPagination(total, totalPages);
}

function renderPagination(total, totalPages) {
  const wrap = document.getElementById('rtablePagination') || document.createElement('div');
  wrap.id = 'rtablePagination';
  wrap.className = 'pagination';
  if (totalPages <= 1) {
    wrap.style.display = 'none';
  } else {
    wrap.style.display = 'flex';
    const prevDisabled = _currentPage <= 1 ? 'disabled' : '';
    const nextDisabled = _currentPage >= totalPages ? 'disabled' : '';
    wrap.innerHTML =
      `<button ${prevDisabled} onclick="window.changePage(-1)">上一页</button>` +
      `<span class="page-info">第 ${_currentPage} / ${totalPages} 页 · 共 ${total} 条</span>` +
      `<button ${nextDisabled} onclick="window.changePage(1)">下一页</button>`;
  }
  const table = document.querySelector('#rt').closest('table');
  if (table && table.nextElementSibling !== wrap) {
    table.parentNode.insertBefore(wrap, table.nextElementSibling);
  }
}

window.changePage = function(delta) {
  const sorted = _sortCol ? sortRides() : [...RIDES].reverse();
  const totalPages = Math.max(1, Math.ceil(sorted.length / _PAGE_SIZE));
  const np = _currentPage + delta;
  if (np < 1 || np > totalPages) return;
  _currentPage = np;
  initTable();
}

window.toggleSort = function(col) {
  if (_sortCol === col) { _sortAsc = !_sortAsc; }
  else { _sortCol = col; _sortAsc = true; }
  _currentPage = 1;
  initTable();
}

function switchToDetail(title) {
  document.getElementById('monthlyView').style.display = 'none';
  document.getElementById('detailView').style.display = 'block';
  document.getElementById('leftTitle').style.display = 'none';
  document.getElementById('backBtn').style.display = 'inline-flex';
  document.getElementById('shareBtn').style.display = 'inline-flex';
  document.getElementById('dTitle').style.display = 'inline';
  document.getElementById('dTitle').innerHTML = title;
}

function switchToMonthly() {
  document.getElementById('monthlyView').style.display = '';
  document.getElementById('detailView').style.display = 'none';
  document.getElementById('leftTitle').style.display = 'inline';
  document.getElementById('backBtn').style.display = 'none';
  document.getElementById('shareBtn').style.display = 'none';
  document.getElementById('dTitle').style.display = 'none';
  document.getElementById('delDetailBtn').style.display = 'none';
  document.getElementById('editDetailBtn').style.display = 'none';
  document.getElementById('rideNotes').style.display = 'none';
  document.getElementById('selHR').style.display = 'none';
  _currentViewIdx = -1;
}

window.openShareModal = function() {
  if (_currentViewIdx < 0) return;
  openShareModalImpl(_currentViewIdx, () => RIDES[_currentViewIdx]);
};

window.closeDetail = function() {
  clearSpeedHeatmap();
  switchToMonthly();
};

window.showRide = function(i) {
  const r = RIDES[i];
  if (!r) return;
  _currentViewIdx = i;
  let lapInfo = '';
  // 直接按圈数显示,不卡 isLoop(避免「起终点不重合」的绕圈被吞掉)
  let laps = 0;
  if (r.manual_laps > 0) laps = r.manual_laps;
  else if (r.track_points && r.track_points.length > 10) laps = countLaps(r.track_points);
  if (laps >= 1) {
    const avgLapMin = r.moving_time_min ? (r.moving_time_min / laps) : 0;
    const lapTime = avgLapMin >= 1 ? `${Math.floor(avgLapMin)}′${Math.round(avgLapMin % 1 * 60)}″` : `${Math.round(avgLapMin * 60)}″`;
    lapInfo = ` · <span class="lap-edit" onclick="event.stopPropagation();window.editLaps(${i})" title="点击修改圈数">${laps} 圈 ✏️</span> · 均 ${lapTime}/圈`;
  }
  switchToDetail(`${r.date} · ${r.route}${lapInfo} · ${r.distance_km}km · ${r.start_time || ''}-${r.end_time || ''}`);
  document.getElementById('delDetailBtn').style.display = 'inline-flex';
  document.getElementById('editDetailBtn').style.display = 'inline-flex';
  document.querySelectorAll('#rt tr').forEach(el => el.classList.remove('act'));
  const row = document.querySelector(`#rt tr[data-i="${i}"]`);
  if (row) row.classList.add('act');
  highlightRide(i);
  fitRideBounds(r);
  // 速度热力图
  if (r.track_points && r.track_points.length > 3) {
    const topSpeed = r.max_speed_kmh || 30;
    renderSpeedHeatmap(r.track_points, topSpeed, i);
  }
  renderSelectedHR(r.hr_zones, `${r.date} · ${r.route} · ${r.distance_km}km`);
  renderDetail(r, (tpIdx, pt) => { placeCrosshair(pt[0], pt[1]); }, () => { clearCrosshair(); });
  const input = document.getElementById('notesInput');
  if (input) { document.getElementById('rideNotes').style.display = 'block'; input.value = r.notes || ''; }
};

function initRouteStats() {
  const t = document.getElementById('rst');
  let rows = RO.map(r => {
    const rs = RIDES.filter(x => x.route === r);
    if (!rs.length) return null;
    const dates = rs.map(x => x.date).sort();
    return {
      route: r, color: RC[r] || '#666', count: rs.length,
      recent: dates[dates.length - 1],
      speedTrend: rs.map(x => x.avg_speed_kmh).join('→'),
      hrTrend: rs.map(x => x.avg_hr).join('→'),
      bestSpeed: Math.max(...rs.map(x => x.avg_speed_kmh)),
      topSpeed: Math.max(...rs.map(x => x.max_speed_kmh)),
    };
  }).filter(Boolean);

  if (_rsSortCol) {
    rows.sort((a, b) => {
      const dir = _rsSortAsc ? 1 : -1;
      if (_rsSortCol === 'name') return dir * a.route.localeCompare(b.route);
      if (_rsSortCol === 'count') return dir * (a.count - b.count);
      if (_rsSortCol === 'recent') return dir * a.recent.localeCompare(b.recent);
      return 0;
    });
  }

  t.innerHTML = rows.map(r =>
    `<tr><td><span class="rb"><span class="dot" style="background:${r.color}"></span>${r.route}</span></td>` +
    `<td class="num">${r.count}</td><td class="num">${r.recent}</td><td>${r.speedTrend}</td><td>${r.hrTrend}</td>` +
    `<td class="num">${r.bestSpeed.toFixed(1)}</td><td class="num">${r.topSpeed.toFixed(1)}</td></tr>`
  ).join('');

  document.querySelectorAll('#rsth th[onclick]').forEach(th => {
    const m = th.getAttribute('onclick').match(/'([^']+)'/);
    const col = m ? m[1] : null;
    th.classList.toggle('sort-asc', _rsSortCol === col && _rsSortAsc);
    th.classList.toggle('sort-desc', _rsSortCol === col && !_rsSortAsc);
  });
}

window.toggleRouteSort = function(col) {
  if (_rsSortCol === col) _rsSortAsc = !_rsSortAsc;
  else { _rsSortCol = col; _rsSortAsc = true; }
  initRouteStats();
  renderIcons();
};

function initComp() {
  const sel = document.getElementById('cr');
  const routes = [...new Set(RIDES.map(r => r.route))].filter(r => RIDES.filter(x => x.route === r).length >= 2);
  sel.innerHTML = '<option value="">选择路线</option>' + routes.map(r => `<option value="${r}">${r}</option>`).join('');
  sel.onchange = () => {
    const v = sel.value;
    const s1 = document.getElementById('c1'), s2 = document.getElementById('c2');
    s1.innerHTML = s2.innerHTML = '<option value="">选择</option>';
    if (!v) return;
    const rs = RIDES.filter(x => x.route === v);
    const opts = rs.map((x, i) => `<option value="${i}">${x.date} ${x.start_time || ''}</option>`).join('');
    s1.innerHTML = '<option value="">选择</option>' + opts;
    s2.innerHTML = '<option value="">选择</option>' + opts;
  };
}

window.runC = function() {
  const r = document.getElementById('cr').value;
  const i1 = parseInt(document.getElementById('c1').value);
  const i2 = parseInt(document.getElementById('c2').value);
  if (!r || isNaN(i1) || isNaN(i2) || i1 === i2) return;
  const a = RIDES[i1], b = RIDES[i2];
  const fields = [
    ['距离 (km)', a.distance_km, b.distance_km],
    ['均速 (km/h)', a.avg_speed_kmh, b.avg_speed_kmh],
    ['极速 (km/h)', a.max_speed_kmh, b.max_speed_kmh],
    ['均心 (bpm)', a.avg_hr, b.avg_hr],
    ['最高心率', a.max_hr, b.max_hr],
    ['消耗 (kcal)', a.calories, b.calories],
    ['爬升 (m)', a.elev_gain_m, b.elev_gain_m],
    ['用时 (min)', a.moving_time_min, b.moving_time_min],
  ];
  const diffStr = (va, vb) => { const d = vb - va; if (Math.abs(d) < 0.01) return '<span style="color:#ccc">—</span>'; return `<span class="${d > 0 ? 'd-up' : 'd-down'}">${d > 0 ? '+' : ''}${d.toFixed(1)}</span>`; };
  document.getElementById('cb').innerHTML = fields.map(([n, va, vb]) => `<tr><td style="font-weight:600">${n}</td><td>${va}</td><td>${vb}</td><td>${diffStr(va, vb)}</td></tr>`).join('');
  document.getElementById('cx').classList.add('s');
  renderDetail(a, (tpIdx, pt) => placeCrosshair(pt[0], pt[1]), () => clearCrosshair());
  highlightRide(i1);
  resetPolylineStyles();
  setPolylineStyle(i1, { weight: 6, opacity: 1, color: RC[r] });
  setPolylineStyle(i2, { weight: 6, opacity: 1, color: RC[r], dashArray: '7,5' });
  const allPts = []; [a, b].forEach(x => { if (x.track_points) x.track_points.forEach(p => allPts.push([p[0], p[1]])); });
  fitBoundsToPoints(allPts);
};

// ── 删除 / 重命名 ──

window.deleteRide = function(i) {
  const idx = i !== undefined ? i : _currentViewIdx;
  if (idx < 0 || idx >= RIDES.length) return;
  const ride = RIDES[idx];
  if (!confirm(`确定删除 ${ride.date} · ${ride.route}（${ride.distance_km}km）？`)) return;
  RIDES.splice(idx, 1);
  const usedRoutes = new Set(RIDES.map(r => r.route));
  for (const route of Object.keys(RC)) { if (!usedRoutes.has(route)) { delete RC[route]; const ri = RO.indexOf(route); if (ri >= 0) RO.splice(ri, 1); } }
  clearSpeedHeatmap();
  // 删除后若当前页已空则回到上一页
  const sorted = _sortCol ? sortRides() : [...RIDES].reverse();
  const totalPages = Math.max(1, Math.ceil(sorted.length / _PAGE_SIZE));
  if (_currentPage > totalPages) _currentPage = Math.max(1, totalPages);
  refreshAll();
  switchToMonthly();
  saveAllRides();
};

async function saveAllRides() {
  try {
    const records = RIDES.map(r => ({
      id: r.id, filename: r.filename, route: r.route, date: r.date, start_time: r.start_time, end_time: r.end_time,
      distance_km: r.distance_km, avg_speed_kmh: r.avg_speed_kmh, max_speed_kmh: r.max_speed_kmh,
      avg_hr: r.avg_hr, max_hr: r.max_hr, calories: r.calories, elev_gain_m: r.elev_gain_m,
      min_alt_m: r.min_alt_m, max_alt_m: r.max_alt_m, moving_time_min: r.moving_time_min,
      num_laps: r.num_laps, manual_laps: r.manual_laps, hr_zones: r.hr_zones, notes: r.notes,
      has_cadence: r.has_cadence, avg_cadence: r.avg_cadence, max_cadence: r.max_cadence,
      track_points: r.track_points, start_lat: r.start_lat, start_lng: r.start_lng, end_lat: r.end_lat, end_lng: r.end_lng,
    }));
    await fetch('/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _replace: true, records }) });
  } catch (e) { console.warn('保存失败:', e); }
}

window.editLaps = function(i) {
  const idx = i !== undefined ? i : _currentViewIdx;
  if (idx < 0 || idx >= RIDES.length) return;
  const ride = RIDES[idx];
  const auto = countLaps(ride.track_points || []);
  const val = prompt(`修改「${ride.route}」的圈数（自动检测为 ${auto} 圈）：`, ride.manual_laps || auto);
  if (val === null) return;
  const num = parseInt(val);
  if (isNaN(num) || num < 1) return;
  ride.manual_laps = num;
  saveAllRides();
  window.showRide(idx);
};

window.editRideName = function() {
  if (_currentViewIdx < 0 || _currentViewIdx >= RIDES.length) return;
  const ride = RIDES[_currentViewIdx];
  const oldName = ride.route;
  const newName = prompt(`将路线「${oldName}」重命名为：`, oldName);
  if (!newName || newName.trim() === oldName) return;
  // 只重命名当前选中的这一条记录，不改其他同路线的
  ride.route = newName.trim();
  // 如果新路线名没有配色，从旧路线名继承一个
  if (!RC[newName.trim()] && RC[oldName]) {
    RC[newName.trim()] = RC[oldName];
  }
  // 确保路线顺序里有新名字
  if (!RO.includes(newName.trim())) RO.push(newName.trim());
  refreshAll(); saveAllRides();
};

// ── 地标 ──

function setupMapContextMenu() {
  setContextMenuHandler((lat, lng) => {
    const existing = findNearestLocation(lat, lng, 0.3);
    if (existing) { showStatus(`附近已有地标「${existing.name}」`, 'info'); return; }
    const name = prompt('请为此地标命名：');
    if (name && name.trim()) {
      addLocation(name.trim(), lat, lng);
      LOCATIONS = getLocations();
      renderLocations(LOCATIONS, handleLocationAction, handleLocationDrag);
      showStatus(`✅ 已添加地标「${name.trim()}」`, 'ok');
      setTimeout(() => showStatus('点击或拖拽 .fit 文件到此处上传', 'info'), 3000);
    }
  });
}

function handleLocationAction(loc, action) {
  if (action === 'delete') {
    if (confirm(`确定删除地标「${loc.name}」？`)) { removeLocation(loc.id); LOCATIONS = getLocations(); renderLocations(LOCATIONS, handleLocationAction, handleLocationDrag); }
  } else if (action === 'rename') {
    const name = prompt('重命名地标：', loc.name);
    if (name && name.trim() && name.trim() !== loc.name) { renameLocation(loc.id, name.trim()); LOCATIONS = getLocations(); renderLocations(LOCATIONS, handleLocationAction, handleLocationDrag); }
  }
}

function handleLocationDrag(id, lat, lng) {
  const loc = LOCATIONS.find(l => l.id === id);
  if (loc) { loc.lat = lat; loc.lng = lng; saveLocations().catch(() => {}); }
}

async function getLocationHint(lat, lng) {
  if (lat == null) return '未知';
  const nearby = findNearestLocation(lat, lng, 0.5);
  if (nearby) return nearby.name;
  const hint = await geocodeLocation(lat, lng);
  if (hint && !hint.includes(',')) return hint;
  return null;
}

const _geocodeCache = {};

async function geocodeLocation(lat, lng) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (_geocodeCache[key]) return _geocodeCache[key];
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&accept-language=zh`, { headers: { 'User-Agent': 'cycling-dashboard/1.0' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const parts = (data.display_name || '').split(',').map(s => s.trim()).filter(Boolean);
    _geocodeCache[key] = parts.slice(0, 3).join('·');
  } catch { /* 静默失败 */ }
  // 缓存未命中时，返回基于已有地标的就近描述，或坐标
  const nearby = findNearestLocation(lat, lng, 1);
  _geocodeCache[key] = _geocodeCache[key] || (nearby ? nearby.name + '附近' : `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
  return _geocodeCache[key];
}

// ── 颜色 ──

function calcRouteActivity(route) {
  const routeRides = RIDES.filter(r => r.route === route);
  if (!routeRides.length) return 0;
  const dates = routeRides.map(r => new Date(r.date)).sort((a, b) => b - a);
  const daysSinceLast = (Date.now() - dates[0].getTime()) / 86400000;
  const freqScore = Math.min(routeRides.length, 4) / 4 * 100;
  let recencyScore = 0;
  if (daysSinceLast < 30) recencyScore = 100;
  else if (daysSinceLast < 90) recencyScore = 75;
  else if (daysSinceLast < 180) recencyScore = 50;
  else if (daysSinceLast < 365) recencyScore = 25;
  return freqScore * 0.5 + recencyScore * 0.5;
}

function calcDisplayColor(baseColor, activity) {
  if (activity >= 80) return baseColor;
  if (activity >= 40) return desaturate(baseColor, 0.2);
  if (activity >= 10) return desaturate(baseColor, 0.5);
  return '#bdbdbd';
}

function hexToRgb(hex) { const v = parseInt(hex.replace('#', ''), 16); return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 }; }
function rgbToHex(r, g, b) { return '#' + [r, g, b].map(c => Math.round(c).toString(16).padStart(2, '0')).join(''); }
function desaturate(hex, factor) { const { r, g, b } = hexToRgb(hex); const gray = 0.299 * r + 0.587 * g + 0.114 * b; return rgbToHex(r + (gray - r) * factor, g + (gray - g) * factor, b + (gray - b) * factor); }
function assignPaletteColor() { const knownVals = Object.values(KNOWN_ROUTE_COLORS); const paletteCount = Object.values(RC).filter(c => knownVals.indexOf(c) === -1).length; return COLOR_PALETTE[paletteCount % COLOR_PALETTE.length]; }

// ── 心率 ──

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
  return R * 2 * Math.atan2(Math.sqrt(Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2), Math.sqrt(1 - Math.sin(dLat/2)**2 - Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2));
}

function getTrackPointsAt(trackPoints, ...ratios) {
  if (!trackPoints || trackPoints.length < 3) return null;
  return ratios.map(r => {
    const i = Math.floor((trackPoints.length - 1) * r);
    return { lat: trackPoints[i][0], lng: trackPoints[i][1] };
  });
}

function getTrackMidpoint(trackPoints) {
  if (!trackPoints || trackPoints.length < 3) return null;
  const mid = Math.floor(trackPoints.length / 2);
  return { lat: trackPoints[mid][0], lng: trackPoints[mid][1] };
}

// 起点附近 500m 范围算"核心区" — 数离开核心区又回来的次数
// 适用场景:起终点可重合也可不重合(绕圈式 A→B),只要多次经过起点附近就算绕圈
const LOOP_DIST_KM = 1.0;         // 起终点距离 < 1km 视为"起终点近似重合"
const LAP_DETECT_KM = 0.5;        // countLaps 用 500m 阈值(更容忍 GPS 漂移)

// 圈数: 数"经过起点 500m 范围"的次数
function countLaps(trackPoints) {
  if (!trackPoints || trackPoints.length < 20) return 1;
  const startLat = trackPoints[0][0], startLng = trackPoints[0][1];
  let passes = 0, inZone = true;

  for (let i = 1; i < trackPoints.length; i++) {
    const d = haversineKm(trackPoints[i][0], trackPoints[i][1], startLat, startLng);
    if (d >= LAP_DETECT_KM) {
      inZone = false;
    } else if (!inZone) {
      passes++;
      inZone = true;
    }
  }
  return Math.max(1, passes);
}

// 多圈时取第一圈的 track points（从起点到第一次"明显回到起点区域"），
// 用来跟单圈的已有路线比对。圈数从 countLaps 单独记。
function extractFirstLap(trackPoints) {
  if (!trackPoints || trackPoints.length < 20) return trackPoints;
  const startLat = trackPoints[0][0], startLng = trackPoints[0][1];
  const startFrom = Math.floor(trackPoints.length / 4); // 跳过起点附近的前几个点
  for (let i = startFrom; i < trackPoints.length; i++) {
    const d = haversineKm(trackPoints[i][0], trackPoints[i][1], startLat, startLng);
    if (d < LAP_DETECT_KM) return trackPoints.slice(0, i + 1);
  }
  return trackPoints;
}

// 算 track_points 累计距离(km)
function trackPointsDist(trackPoints) {
  if (!trackPoints || trackPoints.length < 2) return 0;
  let d = 0;
  for (let i = 1; i < trackPoints.length; i++) {
    d += haversineKm(trackPoints[i-1][0], trackPoints[i-1][1], trackPoints[i][0], trackPoints[i][1]);
  }
  return d;
}

// 判定一条轨迹是不是"绕圈路线":
// 起终点距离 < 1km(真 loop 或绕圈 A→B 起终点不算远)
function isLoopRoute(startLat, startLng, endLat, endLng) {
  if (startLat != null && endLat != null) {
    return haversineKm(startLat, startLng, endLat, endLng) < LOOP_DIST_KM;
  }
  return false;
}

function matchRouteByGPS(startLat, startLng, endLat, endLng, trackPoints, newDistKm) {
  const isLoop = isLoopRoute(startLat, startLng, endLat, endLng);
  // 绕圈 + 多圈时：截到第一圈再采样，对单圈路线也能匹配
  let newPts = null;
  let compareSource = null;
  if (isLoop && trackPoints) {
    const lapCount = countLaps(trackPoints);
    compareSource = lapCount > 1 ? extractFirstLap(trackPoints) : trackPoints;
    newPts = getTrackPointsAt(compareSource, 0.25, 0.5, 0.75);
  }
  let best = null, bestDist = Infinity;

  for (const r of RIDES) {
    if (r.start_lat == null || r.end_lat == null) continue;
    if (!isLoop) {
      const sd = haversineKm(startLat, startLng, r.start_lat, r.start_lng);
      const ed = haversineKm(endLat, endLng, r.end_lat, r.end_lng);
      const d = sd + ed;
      if (d < bestDist && sd < GPS_MATCH_KM && ed < GPS_MATCH_KM) { bestDist = d; best = { route: r.route, reversed: false }; }
      const sdr = haversineKm(startLat, startLng, r.end_lat, r.end_lng);
      const edr = haversineKm(endLat, endLng, r.start_lat, r.start_lng);
      const dr = sdr + edr;
      if (dr < bestDist * 1.15 && sdr < GPS_MATCH_KM && edr < GPS_MATCH_KM) { bestDist = dr; best = { route: r.route, reversed: true }; }
    }
    if (isLoop) {
      const rIsLoop = isLoopRoute(r.start_lat, r.start_lng, r.end_lat, r.end_lng);
      if (!rIsLoop) continue;
      const sd = haversineKm(startLat, startLng, r.start_lat, r.start_lng);
      if (sd >= GPS_MATCH_KM) continue;
      const rPts = r.track_points ? getTrackPointsAt(r.track_points, 0.25, 0.5, 0.75) : null;
      if (newPts && rPts) {
        const d1 = haversineKm(newPts[0].lat, newPts[0].lng, rPts[0].lat, rPts[0].lng);
        const d2 = haversineKm(newPts[1].lat, newPts[1].lng, rPts[1].lat, rPts[1].lng);
        const d3 = haversineKm(newPts[2].lat, newPts[2].lng, rPts[2].lat, rPts[2].lng);
        const avgD = (d1 + d2 + d3) / 3;
        // 多圈时用截到的一圈距离做对比,避免 newDistKm(全程) vs 路线(单圈) 差太大
        const refDist = (compareSource && trackPoints.length !== compareSource.length)
          ? trackPointsDist(compareSource)
          : (newDistKm || 0);
        const distDiff = Math.abs(refDist - (r.distance_km || 0));
        // 三点平均距离 < 1km 且单圈距离差 < 2km 才匹配
        if (avgD < 1 && distDiff < 2 && avgD * 2 + distDiff < bestDist) {
          bestDist = avgD * 2 + distDiff;
          best = { route: r.route, reversed: false };
        }
      }
    }
  }
  return best;
}

// ── 上传 ──

function initSettings() {
  const btn = document.getElementById('settingsBtn');
  const modal = document.getElementById('settingsModal');
  const enabled = document.getElementById('obsidianEnabled');
  const pathInput = document.getElementById('obsidianVault');
  const status = document.getElementById('obsidianStatus');
  const stravaId = document.getElementById('stravaClientId');
  const stravaSecret = document.getElementById('stravaClientSecret');
  const stravaStatus = document.getElementById('stravaStatus');
  const stravaAuto = document.getElementById('stravaAutoSync');
  const hrZoneAuto = document.getElementById('hrZoneAuto');
  const hrZoneManual = document.getElementById('hrZoneManual');
  const hrZoneAge = document.getElementById('hrZoneAge');
  const hrZoneRest = document.getElementById('hrZoneRest');
  const hrZoneThresholds = document.getElementById('hrZoneThresholds');
  const hrZonePreview = document.getElementById('hrZonePreview');
  const hrZInputs = [document.getElementById('hrZ2'), document.getElementById('hrZ3'), document.getElementById('hrZ4'), document.getElementById('hrZ5')];
  if (!btn || !modal) return;

  // 设置 Tab 切换
  modal.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      modal.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
      modal.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = modal.querySelector(`.settings-panel[data-panel="${tab.dataset.tab}"]`);
      if (panel) panel.classList.add('active');
    });
  });

  let _currentCfg = {};

  function readProfileFromUI() {
    return {
      age: parseInt(hrZoneAge.value, 10) || 0,
      resting_hr: parseInt(hrZoneRest.value, 10) || 0,
      zone_mode: hrZoneManual.checked ? 'manual' : 'auto',
      zone_thresholds: hrZInputs.map(i => parseInt(i.value, 10) || 0),
    };
  }

  function updateHRZonePreview() {
    const p = readProfileFromUI();
    hrZonePreview.textContent = formatHRZonePreview(p);
    hrZoneThresholds.style.display = p.zone_mode === 'manual' ? 'flex' : 'none';
  }

  [hrZoneAuto, hrZoneManual, hrZoneAge, hrZoneRest, ...hrZInputs].forEach(el => {
    el?.addEventListener('input', updateHRZonePreview);
    el?.addEventListener('change', updateHRZonePreview);
  });

  btn.addEventListener('click', async () => {
    try {
      const res = await fetch('/config');
      const cfg = await res.json();
      _currentCfg = cfg;
      const obs = cfg.obsidian || {};
      enabled.checked = obs.enabled || false;
      pathInput.value = obs.vault_path || '';
      status.textContent = obs.enabled && obs.vault_path ? '✅ 已配置' : '⏸️ 未启用';
      const s = cfg.strava || {};
      stravaId.value = s.client_id || '';
      stravaSecret.value = s.client_secret || '';
      stravaAuto.checked = !!s.auto_sync;
      stravaStatus.textContent = s.refresh_token
        ? `✅ 已连接: ${s.athlete || '未知账号'}`
        : (s.client_id ? '⏸️ 配置了 client_id,点连接完成 OAuth' : '⏸️ 未连接');
      const p = cfg.profile || DEFAULT_PROFILE;
      _profile = { ...DEFAULT_PROFILE, ...p };
      hrZoneAuto.checked = _profile.zone_mode !== 'manual';
      hrZoneManual.checked = _profile.zone_mode === 'manual';
      hrZoneAge.value = _profile.age || '';
      hrZoneRest.value = _profile.resting_hr || '';
      (_profile.zone_thresholds || DEFAULT_HR_THRESHOLDS).forEach((v, i) => { if (hrZInputs[i]) hrZInputs[i].value = v || ''; });
      updateHRZonePreview();
    } catch { status.textContent = '❌ 加载失败'; }
    modal.style.display = 'flex';
  });

  document.getElementById('settingsSave').onclick = async () => {
    const profile = readProfileFromUI();
    _profile = profile;
    const cfg = {
      obsidian: {
        enabled: enabled.checked,
        vault_path: pathInput.value.trim(),
      },
      server: { port: 8080, auto_open_browser: true },
      strava: {
        client_id: stravaId.value.trim(),
        client_secret: stravaSecret.value.trim(),
        refresh_token: (_currentCfg.strava || {}).refresh_token || '',
        access_token: (_currentCfg.strava || {}).access_token || '',
        expires_at: (_currentCfg.strava || {}).expires_at || 0,
        athlete: (_currentCfg.strava || {}).athlete || '',
        auto_sync: stravaAuto.checked,
      },
      profile,
    };
    await fetch('/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    _currentCfg = cfg;
    status.textContent = '✅ 已保存';
  };

  document.getElementById('settingsCancel').onclick = () => { modal.style.display = 'none'; };
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

  // 原生文件夹选择器
  document.getElementById('reExportBtn')?.addEventListener('click', async () => {
    status.textContent = '⏳ 正在导出…';
    try {
      const res = await fetch('/export-obsidian', { method: 'POST' });
      const data = await res.json();
      status.textContent = data.ok ? '✅ 导出完成' : '❌ 导出失败';
    } catch { status.textContent = '❌ 导出失败'; }
  });

  document.getElementById('pickFolderBtn')?.addEventListener('click', async () => {
    status.textContent = '⏳ 打开文件夹选择器…';
    try {
      const res = await fetch('/pick-folder');
      const data = await res.json();
      if (data.path) {
        pathInput.value = data.path + '/骑行记录.md';
        status.textContent = '✅ 已选择文件夹,文件名默认为 骑行记录.md';
      } else if (data.error) {
        status.textContent = '❌ ' + data.error;
      }
    } catch (e) {
      status.textContent = '❌ 选择失败';
    }
  });

  // Strava 连接/断开
  document.getElementById('stravaConnectBtn')?.addEventListener('click', async () => {
    if (!stravaId.value.trim() || !stravaSecret.value.trim()) {
      stravaStatus.textContent = '❌ 请先填入 client_id 和 client_secret,点保存';
      return;
    }
    // 先 await 保存配置,再跳,避免竞态
    const cfg = {
      obsidian: { enabled: enabled.checked, vault_path: pathInput.value.trim() },
      server: { port: 8080, auto_open_browser: true },
      strava: {
        client_id: stravaId.value.trim(),
        client_secret: stravaSecret.value.trim(),
        refresh_token: (_currentCfg.strava || {}).refresh_token || '',
        access_token: (_currentCfg.strava || {}).access_token || '',
        expires_at: (_currentCfg.strava || {}).expires_at || 0,
        athlete: (_currentCfg.strava || {}).athlete || '',
        auto_sync: stravaAuto.checked,
      },
    };
    await fetch('/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
    _currentCfg = cfg;
    stravaStatus.textContent = '⏳ 跳到 Strava 授权…';
    window.location.href = '/strava/connect';
  });

  document.getElementById('stravaDisconnectBtn')?.addEventListener('click', async () => {
    if (!confirm('确定断开 Strava 连接?(不会删除 Strava 上的活动)')) return;
    await fetch('/strava/disconnect', { method: 'POST' });
    _currentCfg.strava = (_currentCfg.strava || {});
    _currentCfg.strava.refresh_token = '';
    _currentCfg.strava.access_token = '';
    _currentCfg.strava.expires_at = 0;
    _currentCfg.strava.athlete = '';
    stravaStatus.textContent = '⏸️ 已断开';
  });

  // 首次使用向导
  const helpModal = document.getElementById('stravaHelpModal');
  document.getElementById('stravaHelpBtn')?.addEventListener('click', () => {
    helpModal.style.display = 'flex';
  });
  document.getElementById('stravaHelpClose')?.addEventListener('click', () => {
    helpModal.style.display = 'none';
  });
  helpModal?.addEventListener('click', (e) => { if (e.target === helpModal) helpModal.style.display = 'none'; });
}

// 检查 URL 是否有 ?strava=connected 这种回调标记
function handleStravaUrlFlag() {
  const params = new URLSearchParams(location.search);
  if (params.get('strava') === 'connected') {
    showStatus('✅ Strava 已连接', 'ok');
    setTimeout(() => showStatus('点击或拖拽 .fit 文件到此处上传', 'info'), 3000);
    // 清理 URL
    history.replaceState(null, '', location.pathname);
  }
}

function initUpload() {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fitFileInput');
  dropZone?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', () => { if (fileInput.files.length > 0) { uploadFit(fileInput.files[0]); fileInput.value = ''; } });
  dropZone?.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone?.addEventListener('dragleave', () => { dropZone.classList.remove('dragover'); });
  dropZone?.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('dragover'); const file = e.dataTransfer.files[0]; if (file) uploadFit(file); });
}

function initModal() {
  const modal = document.getElementById('routeModal');
  // 模式切换
  document.querySelectorAll('.name-mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.name-mode-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.name-mode-panel').forEach(p => p.style.display = 'none');
      document.getElementById('panel' + tab.dataset.mode.toUpperCase()).style.display = '';
      updateRoutePreview();
    });
  });

  // 输入变化时更新预览
  ['routeStart','routeEnd','routePath','routeLoopName','routeCustomName'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateRoutePreview);
  });

  document.getElementById('routeNameConfirm')?.addEventListener('click', () => {
    // 上传命名模式
    const mode = document.querySelector('.name-mode-tab.active')?.dataset.mode;
    if (!mode) return;
    const name = buildRouteName(mode);
    if (!name) return;
    modal.style.display = 'none';
    finishUploadWithName(name);
  });

  document.getElementById('routeNameCancel')?.addEventListener('click', () => {
    modal.style.display = 'none'; pendingUploadData = null; showStatus('已取消上传', 'info');
  });

  modal?.addEventListener('click', (e) => {
    if (e.target === modal) { modal.style.display = 'none'; pendingUploadData = null; document.getElementById('nameModeTabs').style.display = ''; }
  });
}

function buildRouteName(mode) {
  if (mode === 'ab') {
    const s = document.getElementById('routeStart').value.trim();
    const e = document.getElementById('routeEnd').value.trim();
    const p = document.getElementById('routePath').value.trim();
    if (!s || !e) { showStatus('请填写起点和终点', 'err'); return ''; }
    return p ? `${s}→${e}（${p}）` : `${s}→${e}`;
  }
  if (mode === 'loop') {
    const name = document.getElementById('routeLoopName').value.trim();
    if (!name) { showStatus('请填写地点名称', 'err'); return ''; }
    return `${name}绕圈`;
  }
  if (mode === 'custom') {
    const name = document.getElementById('routeCustomName').value.trim();
    if (!name) { showStatus('请输入路线名称', 'err'); return ''; }
    return name;
  }
  return '';
}

function updateRoutePreview() {
  const mode = document.querySelector('.name-mode-tab.active')?.dataset.mode;
  const name = buildRouteName(mode);
  document.getElementById('routePreviewText').textContent = name || '(输入名称后显示预览)';
}

function initNotes() {
  const saveBtn = document.getElementById('notesSaveBtn');
  const input = document.getElementById('notesInput');
  const status = document.getElementById('notesStatus');
  if (!saveBtn || !input) return;
  saveBtn.addEventListener('click', async () => { if (_currentViewIdx < 0) return; RIDES[_currentViewIdx].notes = input.value.trim(); status.textContent = '⏳ 保存中…'; await saveAllRides(); status.textContent = '✅ 已保存'; setTimeout(() => { status.textContent = ''; }, 2000); });
}

async function uploadFit(file) {
  if (!file.name.endsWith('.fit')) return showStatus('只接受 .fit 文件', 'err');
  const dropZone = document.getElementById('dropZone');
  dropZone.style.display = 'block';
  showStatus(`正在解析 ${file.name}...`, 'info');
  try {
    const buffer = await file.arrayBuffer();

    // 浏览器端解析（fit-parser-bundle.js）
    let parsed = null;
    if (window.FitParser) {
      parsed = await new Promise((resolve, reject) => {
        try {
          const Lib = window.FitParser.default || window.FitParser;
          const parser = new Lib({ force: true, speedUnit: 'km/h', lengthUnit: 'km' });
          parser.parse(buffer, (err, data) => {
            if (err) return reject(new Error(err));
            try { resolve(buildParsedFromFitFile(data, file.name)); }
            catch (e) { reject(e); }
          });
        } catch (e) { reject(e); }
      });
    }

    // 回退到服务器解析
    if (!parsed) {
      const res = await fetch('/upload', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: buffer });
      parsed = await res.json();
      if (parsed.error) return showStatus(`❌ ${parsed.error}`, 'err');
      parsed.filename = file.name;
    }

    await handleParsedRide(parsed, file);
  } catch (err) { showStatus(`❌ 上传失败: ${err.message}`, 'err'); }
}

function buildParsedFromFitFile(data, filename) {
  const session = (data.sessions || [])[0] || {};
  const records = data.records || [];
  const laps = data.laps || [];

  const hrs = records.filter(r => r.heart_rate > 0).map(r => r.heart_rate);
  const hrZones = calculateHRZones(hrs, calculateHRThresholds(_profile));

  const cads = records.filter(r => r.cadence > 0).map(r => r.cadence);
  function bjISO(d) {
    if (!d) return '';
    return new Date(d.getTime() + 8 * 3600000).toISOString();
  }
  const startDt = session.start_time ? new Date(session.start_time) : null;
  const elapsed = session.total_elapsed_time || 0;
  const endDt = startDt ? new Date(startDt.getTime() + elapsed * 1000) : null;

  const alts = records.map(r => r.altitude).filter(a => a != null);
  const minAlt = alts.length ? Math.min(...alts) : 0;
  const maxAlt = alts.length ? Math.max(...alts) : 0;

  const trackPoints = [];
  let firstPt = null, lastPt = null;
  const sr = Math.max(1, Math.floor(records.length / 500));
  for (let i = 0; i < records.length; i += sr) {
    const r = records[i];
    if (r.position_lat == null || r.position_long == null) continue;
    const lat = Math.round(r.position_lat * 1e6) / 1e6;
    const lng = Math.round(r.position_long * 1e6) / 1e6;
    if (firstPt === null) firstPt = { lat, lng };
    lastPt = { lat, lng };
    const pt = [lat, lng, r.speed || 0, r.heart_rate || 0, r.altitude || 0];
    if (r.cadence > 0) pt.push(r.cadence);
    trackPoints.push(pt);
  }

  function sc(v) { return v != null ? +v.toFixed(4) : null; }

  return {
    filename,
    distance_km: +(session.total_distance || 0).toFixed(2),
    avg_speed_kmh: +(session.avg_speed || 0).toFixed(1),
    max_speed_kmh: +(session.max_speed || 0).toFixed(1),
    avg_hr: session.avg_heart_rate || 0,
    max_hr: session.max_heart_rate || 0,
    calories: session.total_calories || 0,
    elev_gain_m: +(maxAlt - minAlt).toFixed(1),
    min_alt_m: +minAlt.toFixed(1),
    max_alt_m: +maxAlt.toFixed(1),
    moving_time_min: +((session.total_timer_time || session.total_elapsed_time || 0) / 60).toFixed(1),
    num_laps: laps.length || session.num_laps || 0,
    hr_zones: hrZones,
    has_cadence: cads.length > 0,
    avg_cadence: cads.length ? +(cads.reduce((a, b) => a + b, 0) / cads.length).toFixed(1) : 0,
    max_cadence: cads.length ? Math.max(...cads) : 0,
    date: startDt ? bjISO(startDt).slice(0, 10) : 'unknown',
    start_time: startDt ? bjISO(startDt).slice(11, 16) : null,
    end_time: endDt ? bjISO(endDt).slice(11, 16) : null,
    track_points: trackPoints,
    start_lat: sc(session.start_position_lat) ?? (firstPt?.lat ?? null),
    start_lng: sc(session.start_position_long) ?? (firstPt?.lng ?? null),
    end_lat: sc(session.end_position_lat) ?? (lastPt?.lat ?? null),
    end_lng: sc(session.end_position_long) ?? (lastPt?.lng ?? null),
    _parser: 'browser',
  };
}

function reverseRouteName(name) {
  // "A→B（C）" → "B→A（C）",  "X 绕圈" → "X 绕圈"
  const m = name.match(/^(.+)→(.+?)(（.*）)?$/);
  if (m) return m[2] + '→' + m[1] + (m[3] || '');
  return name;
}

async function handleParsedRide(parsed, file) {
  const match = matchRouteByGPS(parsed.start_lat, parsed.start_lng, parsed.end_lat, parsed.end_lng, parsed.track_points, parsed.distance_km);
  if (match) {
    parsed.route = match.reversed ? reverseRouteName(match.route) : match.route;
    // 匹配已有路线时也检查圈数
    const laps = parsed.track_points ? countLaps(parsed.track_points) : 1;
    if (laps > 1) parsed.manual_laps = laps;
    const lapHint = laps > 1 ? ` · ${laps} 圈` : '';
    showStatus(`✅ ${file.name || parsed.filename} 已匹配路线「${parsed.route}」${match.reversed ? '(方向相反)' : ''}${lapHint}`, 'ok');
    await new Promise(r => setTimeout(r, 800));
    finalizeUpload(parsed, file);
  } else {
    pendingUploadData = { parsed, file };
    const isLoop = isLoopRoute(parsed.start_lat, parsed.start_lng, parsed.end_lat, parsed.end_lng);

    // 获取地名
    let [startName, endName] = await Promise.all([
      getLocationHint(parsed.start_lat, parsed.start_lng),
      getLocationHint(parsed.end_lat, parsed.end_lng),
    ]);

    // 如果反编码没返回有意义的地名，用坐标
    if (!startName) startName = parsed.start_lat ? `${parsed.start_lat.toFixed(4)}, ${parsed.start_lng.toFixed(4)}` : '未知';
    if (!endName) endName = parsed.end_lat ? `${parsed.end_lat.toFixed(4)}, ${parsed.end_lng.toFixed(4)}` : '未知';

    // 重置弹窗
    document.getElementById('nameModeTabs').style.display = '';
    document.querySelectorAll('.name-mode-panel').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.name-mode-tab').forEach(t => t.classList.remove('active'));

    if (isLoop) {
      // 计算中点位置说明 + 圈数
      let midHint = '';
      let lapCount = 0;
      if (parsed.track_points && parsed.track_points.length > 3) {
        const midPt = parsed.track_points[Math.floor(parsed.track_points.length / 2)];
        const midName = await getLocationHint(midPt[0], midPt[1]);
        if (midName) midHint = ` · 途经 ${midName}`;
        lapCount = countLaps(parsed.track_points);
      }
      const useLaps = parsed.manual_laps || lapCount;
      const avgLapMin = parsed.moving_time_min && useLaps ? (parsed.moving_time_min / useLaps) : 0;
      const lpTimeStr = avgLapMin >= 1 ? `${Math.floor(avgLapMin)}′${Math.round(avgLapMin % 1 * 60)}″` : `${Math.round(avgLapMin * 60)}″`;
      document.getElementById('routeLoopLaps').value = useLaps;
      document.querySelector('[data-mode="loop"]').classList.add('active');
      document.getElementById('panelLOOP').style.display = '';
      document.getElementById('loopHint').textContent = `📍 ${startName}${midHint} · ${parsed.distance_km}km · 均 ${lpTimeStr}/圈`;
      document.getElementById('routeLoopName').value = startName.includes(',') ? '' : startName;
    } else {
      document.querySelector('[data-mode="ab"]').classList.add('active');
      document.getElementById('panelAB').style.display = '';
      document.getElementById('abHint').textContent = `📍 ${startName} → ${endName}（${parsed.distance_km}km）`;
      document.getElementById('routeStart').value = startName.includes(',') ? '' : startName;
      document.getElementById('routeEnd').value = endName.includes(',') ? '' : endName;
      document.getElementById('routePath').value = '';
    }

    document.getElementById('routeModalDesc').textContent = `${parsed.distance_km}km，请选择命名方式：`;
    updateRoutePreview();
    document.getElementById('routeModal').style.display = 'flex';
  }
}

function finishUploadWithName(name) {
  if (!pendingUploadData) return;
  const { parsed, file } = pendingUploadData;
  parsed.route = name;
  const lapsEl = document.getElementById('routeLoopLaps');
  if (lapsEl) {
    const laps = parseInt(lapsEl.value);
    if (laps && laps > 0) parsed.manual_laps = laps;
  }
  finalizeUpload(parsed, file);
  pendingUploadData = null;
}

async function finalizeUpload(parsed, file) {
  const ride = buildRideObject(parsed, file.name);
  await addRideToDashboard(ride);
  let base64 = null;
  if (file instanceof File) {
    base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    try {
      await fetch('/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ records: [ride], fit_files: { [ride.id]: base64 } }) });
    } catch (e) {
      console.warn('保存失败:', e);
    }
  }
  // 同步触发
  let syncHints = '';
  if (base64) {
    try {
      const cfg = await fetch('/config').then(r => r.json());
      const s = cfg.strava || {};
      if (s.refresh_token) {
        if (s.auto_sync) {
          syncToStrava(base64, ride, file.name).then(msg => {
            if (msg) showStatus(`✅ ${file.name} 解析成功！${parsed.distance_km}km · ${msg}`, 'ok');
            setTimeout(() => showStatus('点击或拖拽 .fit 文件到此处上传', 'info'), 6000);
          });
        } else {
          syncHints += ` <button class="strava-sync-btn" id="stravaSyncBtn_${ride.id}"><i data-lucide="upload-cloud" class="lci"></i> Strava</button>`;
        }
      } else if (s.client_id) {
        syncHints += ` <a href="#" id="stravaHint_${ride.id}" style="color:#FC4C02;font-size:12px">Strava</a>`;
      }
    } catch {}
  }
  const hintLabel = syncHints ? ` · 同步:${syncHints}` : '';
  const lapHint = (ride.manual_laps || 0) > 1 ? ` · ${ride.manual_laps} 圈` : '';
  showStatus(`✅ ${file.name} 解析成功！${parsed.distance_km}km，${parsed.date} · ${ride.route}${lapHint}${hintLabel}`, 'ok');
  if (syncHints) {
    document.querySelectorAll('.strava-sync-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        btn.disabled = true;
        btn.textContent = '⏳ 上传中…';
        const msg = await syncToStrava(base64, ride, file.name);
        btn.textContent = msg || '✅ 已上传';
        if (window.lucide) lucide.createIcons();
        setTimeout(() => showStatus('点击或拖拽 .fit 文件到此处上传', 'info'), 5000);
      });
    });
  }
  if (window.lucide) lucide.createIcons();
  if (!syncHints) {
    setTimeout(() => showStatus('点击或拖拽 .fit 文件到此处上传', 'info'), 5000);
  }
}

async function syncToStrava(base64, ride, filename) {
  try {
    const ext = `${ride.date}T${ride.start_time || '00:00'}:00`;
    const res = await fetch('/strava/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_base64: base64,
        external_id: ext,
        name: `${ride.date} ${ride.route}`,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) return `❌ Strava: ${data.error || '上传失败'}`;
    const uploadId = data.upload_id;
    // 轮询状态(最多 30 秒,实际 Strava 处理通常 1~10 秒)
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const sr = await fetch('/strava/status/' + uploadId);
      const sd = await sr.json();
      if (sd.status === 'Your activity is ready.') return '✅ Strava 已同步';
      if (sd.activity_id) return '✅ Strava 已同步';
      // 有 error 但 activity_id 也可能在后面才返回,继续轮询
    }
    return '⏳ Strava 处理中,稍后在 Strava 端查看';
  } catch (e) {
    return '❌ Strava 同步失败: ' + e.message;
  }
}

function buildRideObject(parsed, filename) {
  return {
    filename, id: parsed.id || `${parsed.date}-${Date.now()}`, route: parsed.route || '新路线', date: parsed.date || '未知日期',
    start_time: parsed.start_time || null, end_time: parsed.end_time || null,
    distance_km: parsed.distance_km || 0, avg_speed_kmh: parsed.avg_speed_kmh || 0, max_speed_kmh: parsed.max_speed_kmh || 0,
    avg_hr: parsed.avg_hr || 0, max_hr: parsed.max_hr || 0, calories: parsed.calories || 0,
    elev_gain_m: parsed.elev_gain_m || 0, min_alt_m: parsed.min_alt_m || 0, max_alt_m: parsed.max_alt_m || 0,
    moving_time_min: parsed.moving_time_min || 0, num_laps: parsed.num_laps || parsed.manual_laps || 0, manual_laps: parsed.manual_laps || 0,
    notes: parsed.notes || '',
    hr_zones: parsed.hr_zones || { zone1: 0, zone2: 0, zone3: 0, zone4: 0, zone5: 0 },
    has_cadence: !!parsed.has_cadence, avg_cadence: parsed.avg_cadence || 0, max_cadence: parsed.max_cadence || 0,
    track_points: parsed.track_points || [],
    start_lat: parsed.start_lat || null, start_lng: parsed.start_lng || null, end_lat: parsed.end_lat || null, end_lng: parsed.end_lng || null,
  };
}

async function addRideToDashboard(ride) {
  if (ride.route && !RC[ride.route]) { RC[ride.route] = assignPaletteColor(); if (!RO.includes(ride.route)) RO.push(ride.route); }
  const existingIdx = RIDES.findIndex(r => r.id === ride.id);
  if (existingIdx >= 0) RIDES[existingIdx] = ride; else RIDES.push(ride);
  refreshAll();
  LOCATIONS = await loadLocations(RIDES);
  renderLocations(LOCATIONS, handleLocationAction, handleLocationDrag);
  const idx = RIDES.indexOf(ride);
  if (idx >= 0) setTimeout(() => window.showRide(idx), 200);
}

function showStatus(msg, cls) {
  const el = document.getElementById('dropStatus');
  if (el) el.innerHTML = `<span class="${cls}">${msg}</span>`;
  const zone = document.getElementById('dropZone');
  if (zone) { zone.className = 'drop-zone'; if (cls === 'ok') zone.classList.add('success'); if (cls === 'err') zone.classList.add('error'); }
}
