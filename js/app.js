/**
 * app.js — 骑行看板主逻辑
 * 整合 storage / map / charts 模块 + 上传解析 + GPS 路线匹配 + 动态颜色
 */

import { loadRides } from './storage.js';
import { initMap, rebuildMapLayers, initLegend, highlightRide, fitRideBounds, placeCrosshair, clearCrosshair, setPolylineStyle, resetPolylineStyles, fitBoundsToPoints, renderLocations, setContextMenuHandler } from './map.js';
import { initMonthlyChart, renderDetail, renderSelectedHR } from './charts.js';
import { loadLocations, getLocations, addLocation, removeLocation, renameLocation, findNearestLocation, saveLocations } from './locations.js';

const KNOWN_ROUTE_COLORS = {};

const COLOR_PALETTE = [
  '#E91E63', '#9C27B0', '#FF5722', '#00BCD4',
  '#795548', '#607D8B', '#FF9800', '#8BC34A',
  '#673AB7', '#009688', '#CDDC39', '#3F51B5',
];

const GPS_MATCH_KM = 0.5;

let RIDES = [];
let RC = {};
let RO = [];
let LOCATIONS = [];
let _currentViewIdx = -1;
let pendingUploadData = null;
let _sortCol = null;
let _sortAsc = true;
let _rsSortCol = null;
let _rsSortAsc = true;

document.addEventListener('DOMContentLoaded', async () => {
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
});

function getDisplayColor(route) {
  const base = RC[route] || '#666';
  return calcDisplayColor(base, calcRouteActivity(route));
}

function refreshAll() {
  initStats();
  initAchievements();
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
  el.innerHTML = `<div class="hd" style="margin-top:10px;margin-bottom:6px"><span class="ic">🏆</span> 骑行成就</div>
    <div class="ach-grid">
      <div class="ach-item"><span class="ach-val">${longest.distance_km || 0}</span><span class="ach-unit">km</span><span class="ach-label">最长距离</span><span class="ach-date">${longest.date || ''}</span></div>
      <div class="ach-item"><span class="ach-val">${fastest.avg_speed_kmh || 0}</span><span class="ach-unit">km/h</span><span class="ach-label">最佳均速</span><span class="ach-date">${fastest.date || ''}</span></div>
      <div class="ach-item"><span class="ach-val">${fastestTop.max_speed_kmh || 0}</span><span class="ach-unit">km/h</span><span class="ach-label">最快极速</span><span class="ach-date">${fastestTop.date || ''}</span></div>
      <div class="ach-item"><span class="ach-val">${highest.elev_gain_m || 0}</span><span class="ach-unit">m</span><span class="ach-label">最大爬升</span><span class="ach-date">${highest.date || ''}</span></div>
    </div>`;
}

function initStats() {
  const t = RIDES.length;
  const d = RIDES.reduce((s, r) => s + (r.distance_km || 0), 0);
  const e = RIDES.reduce((s, r) => s + (r.elev_gain_m || 0), 0);
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const m = RIDES.filter(r => r.date && r.date.startsWith(thisMonth));
  const md = m.reduce((s, r) => s + (r.distance_km || 0), 0);
  document.getElementById('stats').innerHTML =
    `<div class="b"><div class="n">${t}</div><div class="l">总骑行</div></div>` +
    `<div class="b"><div class="n">${d.toFixed(1)}</div><div class="l">总里程 km</div></div>` +
    `<div class="b"><div class="n">${e}</div><div class="l">总爬升 m</div></div>` +
    `<div class="b"><div class="n">${m.length}</div><div class="l">本月次数</div></div>` +
    `<div class="b"><div class="n">${md.toFixed(1)}</div><div class="l">本月 km</div></div>`;
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
  document.getElementById('rt').innerHTML = sorted.map(r => {
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
}

window.toggleSort = function(col) {
  if (_sortCol === col) { _sortAsc = !_sortAsc; }
  else { _sortCol = col; _sortAsc = true; }
  initTable();
}

function switchToDetail(title) {
  document.getElementById('monthlyView').style.display = 'none';
  document.getElementById('detailView').style.display = 'block';
  document.getElementById('leftTitle').style.display = 'none';
  document.getElementById('backBtn').style.display = 'inline-flex';
  document.getElementById('dTitle').style.display = 'inline';
  document.getElementById('dTitle').textContent = title;
}

function switchToMonthly() {
  document.getElementById('monthlyView').style.display = '';
  document.getElementById('detailView').style.display = 'none';
  document.getElementById('leftTitle').style.display = 'inline';
  document.getElementById('backBtn').style.display = 'none';
  document.getElementById('dTitle').style.display = 'none';
  document.getElementById('delDetailBtn').style.display = 'none';
  document.getElementById('editDetailBtn').style.display = 'none';
  document.getElementById('rideNotes').style.display = 'none';
  document.getElementById('selHR').style.display = 'none';
  _currentViewIdx = -1;
}

window.closeDetail = function() {
  switchToMonthly();
};

window.showRide = function(i) {
  const r = RIDES[i];
  if (!r) return;
  _currentViewIdx = i;
  switchToDetail(`${r.date} · ${r.route} · ${r.distance_km}km · ${r.start_time || ''}-${r.end_time || ''}`);
  document.getElementById('delDetailBtn').style.display = 'inline-flex';
  document.getElementById('editDetailBtn').style.display = 'inline-flex';
  document.querySelectorAll('#rt tr').forEach(el => el.classList.remove('act'));
  const row = document.querySelector(`#rt tr[data-i="${i}"]`);
  if (row) row.classList.add('act');
  highlightRide(i);
  fitRideBounds(r);
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
      num_laps: r.num_laps, hr_zones: r.hr_zones, notes: r.notes,
      has_cadence: r.has_cadence, avg_cadence: r.avg_cadence, max_cadence: r.max_cadence,
      track_points: r.track_points, start_lat: r.start_lat, start_lng: r.start_lng, end_lat: r.end_lat, end_lng: r.end_lng,
    }));
    await fetch('/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _replace: true, records }) });
  } catch (e) { console.warn('保存失败:', e); }
}

window.editRideName = function() {
  if (_currentViewIdx < 0 || _currentViewIdx >= RIDES.length) return;
  const ride = RIDES[_currentViewIdx];
  const oldName = ride.route;
  const newName = prompt(`将路线「${oldName}」重命名为：`, oldName);
  if (!newName || newName.trim() === oldName) return;
  RIDES.forEach(r => { if (r.route === oldName) r.route = newName.trim(); });
  if (RC[oldName]) { RC[newName.trim()] = RC[oldName]; delete RC[oldName]; }
  const ri = RO.indexOf(oldName);
  if (ri >= 0) RO[ri] = newName.trim();
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
  if (activity >= 40) return desaturate(baseColor, 0.35);
  if (activity >= 10) return desaturate(baseColor, 0.65);
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

function getTrackMidpoint(trackPoints) {
  if (!trackPoints || trackPoints.length < 3) return null;
  const mid = Math.floor(trackPoints.length / 2);
  return { lat: trackPoints[mid][0], lng: trackPoints[mid][1] };
}

function matchRouteByGPS(startLat, startLng, endLat, endLng, trackPoints) {
  const isLoop = startLat != null && endLat != null && haversineKm(startLat, startLng, endLat, endLng) < 0.2;
  const newMid = isLoop && trackPoints ? getTrackMidpoint(trackPoints) : null;
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
      const rIsLoop = r.start_lat != null && r.end_lat != null && haversineKm(r.start_lat, r.start_lng, r.end_lat, r.end_lng) < 0.2;
      if (!rIsLoop) continue;
      const sd = haversineKm(startLat, startLng, r.start_lat, r.start_lng);
      if (sd >= GPS_MATCH_KM) continue;
      const rMid = r.track_points ? getTrackMidpoint(r.track_points) : null;
      if (newMid && rMid) { const md = haversineKm(newMid.lat, newMid.lng, rMid.lat, rMid.lng); const distDiff = Math.abs((r.distance_km || 0) - (r.distance_km || 0)); if (md * 2 + Math.min(distDiff, 5) < bestDist) { bestDist = md * 2 + Math.min(distDiff, 5); best = { route: r.route, reversed: false }; } }
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
  if (!btn || !modal) return;

  btn.addEventListener('click', async () => {
    try {
      const res = await fetch('/config');
      const cfg = await res.json();
      const obs = cfg.obsidian || {};
      enabled.checked = obs.enabled || false;
      pathInput.value = obs.vault_path || '';
      status.textContent = obs.enabled && obs.vault_path ? '✅ 已配置' : '⏸️ 未启用';
    } catch { status.textContent = '❌ 加载失败'; }
    modal.style.display = 'flex';
  });

  document.getElementById('settingsSave').onclick = async () => {
    // 简化：export_path 存到 obsidian.vault_path，sync_obsidian.py 读取它
    const cfg = {
      obsidian: {
        enabled: enabled.checked,
        vault_path: pathInput.value.trim(),
      },
      server: { port: 8080, auto_open_browser: true },
    };
    await fetch('/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    status.textContent = '✅ 已保存';
    modal.style.display = 'none';
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
        status.textContent = '✅ 已选择文件夹，文件名默认为 骑行记录.md';
      } else if (data.error) {
        status.textContent = '❌ ' + data.error;
      }
    } catch (e) {
      status.textContent = '❌ 选择失败';
    }
  });
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
    const blob = await file.arrayBuffer();
    const res = await fetch('/upload', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: blob });
    const parsed = await res.json();
    if (parsed.error) return showStatus(`❌ ${parsed.error}`, 'err');
    parsed.filename = file.name;
    await handleParsedRide(parsed, file);
  } catch (err) { showStatus(`❌ 上传失败: ${err.message}`, 'err'); }
}

function reverseRouteName(name) {
  // "家→猁（三环）" → "猁→家（三环）",  "颐和园大圈" → "颐和园大圈"
  const m = name.match(/^(.+)→(.+?)(（.*）)?$/);
  if (m) return m[2] + '→' + m[1] + (m[3] || '');
  return name;
}

async function handleParsedRide(parsed, file) {
  const match = matchRouteByGPS(parsed.start_lat, parsed.start_lng, parsed.end_lat, parsed.end_lng, parsed.track_points);
  if (match) {
    parsed.route = match.reversed ? reverseRouteName(match.route) : match.route;
    showStatus(`✅ ${file.name || parsed.filename} 已匹配路线「${parsed.route}」${match.reversed ? '(方向相反)' : ''}`, 'ok');
    await new Promise(r => setTimeout(r, 800));
    finalizeUpload(parsed, file);
  } else {
    pendingUploadData = { parsed, file };
    const isLoop = parsed.start_lat != null && parsed.end_lat != null &&
      haversineKm(parsed.start_lat, parsed.start_lng, parsed.end_lat, parsed.end_lng) < 0.2;

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
      // 计算中点位置说明
      let midHint = '';
      if (parsed.track_points && parsed.track_points.length > 3) {
        const midPt = parsed.track_points[Math.floor(parsed.track_points.length / 2)];
        const midName = await getLocationHint(midPt[0], midPt[1]);
        if (midName) midHint = ` · 途经 ${midName}`;
      }
      document.querySelector('[data-mode="loop"]').classList.add('active');
      document.getElementById('panelLOOP').style.display = '';
      document.getElementById('loopHint').textContent = `📍 ${startName}${midHint} · ${parsed.distance_km}km`;
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

function finishUploadWithName(name) { if (!pendingUploadData) return; pendingUploadData.parsed.route = name; finalizeUpload(pendingUploadData.parsed, pendingUploadData.file); pendingUploadData = null; }

async function finalizeUpload(parsed, file) {
  const ride = buildRideObject(parsed, file.name);
  await addRideToDashboard(ride);
  if (file instanceof File) {
    const base64 = await new Promise((resolve, reject) => {
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
  showStatus(`✅ ${file.name} 解析成功！${parsed.distance_km}km，${parsed.date} · ${ride.route}`, 'ok');
  setTimeout(() => showStatus('点击或拖拽 .fit 文件到此处上传', 'info'), 5000);
}

function buildRideObject(parsed, filename) {
  return {
    filename, id: parsed.id || `${parsed.date}-${Date.now()}`, route: parsed.route || '新路线', date: parsed.date || '未知日期',
    start_time: parsed.start_time || null, end_time: parsed.end_time || null,
    distance_km: parsed.distance_km || 0, avg_speed_kmh: parsed.avg_speed_kmh || 0, max_speed_kmh: parsed.max_speed_kmh || 0,
    avg_hr: parsed.avg_hr || 0, max_hr: parsed.max_hr || 0, calories: parsed.calories || 0,
    elev_gain_m: parsed.elev_gain_m || 0, min_alt_m: parsed.min_alt_m || 0, max_alt_m: parsed.max_alt_m || 0,
    moving_time_min: parsed.moving_time_min || 0, num_laps: parsed.num_laps || 0,
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
