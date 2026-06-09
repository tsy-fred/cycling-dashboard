/**
 * locations.js — 地标管理模块
 * 自动从骑行记录聚类生成地标 + 手动增删改
 */

let _locations = [];

export async function loadLocations(rides) {
  try {
    const res = await fetch('/locations', { cache: 'no-store' });
    if (res.ok) _locations = await res.json();
  } catch { _locations = []; }

  const auto = detectLocations(rides);
  for (const a of auto) {
    const dup = _locations.some(l => haversineKm(l.lat, l.lng, a.lat, a.lng) < 0.3);
    if (!dup) _locations.push({ ...a, id: `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, manual: false });
  }
  return _locations;
}

export function getLocations() { return _locations; }

export async function saveLocations() {
  const manual = _locations.filter(l => l.manual !== false);
  try {
    await fetch('/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(manual),
    });
  } catch {}
}

export function addLocation(name, lat, lng) {
  const id = `loc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  _locations.push({ id, name, lat, lng, manual: true });
  saveLocations();
  return id;
}

export function removeLocation(id) {
  _locations = _locations.filter(l => l.id !== id);
  saveLocations();
}

export function renameLocation(id, name) {
  const loc = _locations.find(l => l.id === id);
  if (loc) { loc.name = name; saveLocations(); }
}

export function findNearestLocation(lat, lng, thresholdKm = 0.5) {
  let best = null, bestDist = Infinity;
  for (const loc of _locations) {
    const d = haversineKm(lat, lng, loc.lat, loc.lng);
    if (d < bestDist && d < thresholdKm) {
      bestDist = d;
      best = loc;
    }
  }
  return best;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function extractStartName(route) {
  const m = (route || '').match(/^(.+?)→/);
  return m ? m[1].trim() : '';
}
function extractEndName(route) {
  const m = (route || '').match(/→(.+?)(（|$)/);
  return m ? m[1].trim() : '';
}
function mostFrequent(arr) {
  if (!arr.length) return '';
  const freq = {}; arr.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
  return Object.keys(freq).reduce((a, b) => freq[a] > freq[b] ? a : b);
}

function detectLocations(rides) {
  // 从路线名中提取地名（家→王府井 → 家, 王府井）
  const points = [];
  for (const r of rides) {
    if (r.start_lat != null) points.push({ lat: r.start_lat, lng: r.start_lng, name: extractStartName(r.route) });
    if (r.end_lat != null) points.push({ lat: r.end_lat, lng: r.end_lng, name: extractEndName(r.route) });
  }
  const clusters = [];
  const used = new Set();
  for (let i = 0; i < points.length; i++) {
    if (used.has(i)) continue;
    const cluster = [points[i]];
    used.add(i);
    for (let j = i + 1; j < points.length; j++) {
      if (used.has(j)) continue;
      const d = haversineKm(points[i].lat, points[i].lng, points[j].lat, points[j].lng);
      if (d < 0.5) { cluster.push(points[j]); used.add(j); }
    }
    if (cluster.length >= 2 || rides.length <= 2) {
      const avgLat = cluster.reduce((s, p) => s + p.lat, 0) / cluster.length;
      const avgLng = cluster.reduce((s, p) => s + p.lng, 0) / cluster.length;
      const names = cluster.map(p => p.name).filter(Boolean);
      const name = mostFrequent(names) || `📍地点 ${clusters.length + 1}`;
      clusters.push({ name, lat: round6(avgLat), lng: round6(avgLng) });
    }
  }
  return clusters;
}

function round6(v) { return Math.round(v * 1e6) / 1e6; }
