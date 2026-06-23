/**
 * export.js — 骑行记录分享图生成
 * 纯 Canvas API 合成,轨迹线直接画(避 CORS canvas taint)
 */

import { getPolyline } from './map.js';

const PRESETS = [
  { name: '落日', c1: '#FF6E7F', c2: '#FFB88C' },
  { name: '深空', c1: '#0F2027', c2: '#2C5364' },
  { name: '速度', c1: '#EB3349', c2: '#F45C43' },
  { name: '清新', c1: '#43C6AC', c2: '#191654' },
  { name: '极简', c1: '#F8F9FA', c2: '#DEE2E6', light: true },
];

const STAT_DEFS = [
  { key: 'distance_km', label: '距离', unit: 'km', fmt: v => v.toFixed(1) },
  { key: 'moving_time_min', label: '用时', unit: 'min', fmt: v => v >= 60 ? `${Math.floor(v/60)}h${Math.round(v%60)}m` : `${Math.round(v)}` },
  { key: 'avg_speed_kmh', label: '均速', unit: 'km/h', fmt: v => v.toFixed(1) },
  { key: 'max_speed_kmh', label: '极速', unit: 'km/h', fmt: v => v.toFixed(1) },
  { key: 'avg_hr', label: '均心', unit: 'bpm', fmt: v => Math.round(v) },
  { key: 'max_hr', label: '最高心', unit: 'bpm', fmt: v => Math.round(v) },
  { key: 'calories', label: '消耗', unit: 'kcal', fmt: v => Math.round(v) },
  { key: 'elev_gain_m', label: '爬升', unit: 'm', fmt: v => Math.round(v) },
  { key: 'manual_laps', label: '圈数', unit: '', fmt: v => v || '-' },
  { key: '__hr_zones', label: 'HR 分区', isZones: true },
];

const DEFAULT_STATS = ['distance_km', 'moving_time_min', 'avg_speed_kmh', 'max_speed_kmh', 'elev_gain_m'];

const _state = {
  ratio: '1:1',
  bgType: 'preset',
  presetIdx: 0,
  solidColor: '#1a1a2e',
  _imageEl: null,
  imageName: '',
  stats: [...DEFAULT_STATS],
  getRide: null,
  currentRideIndex: -1,
};

const SIZES = {
  '1:1': { w: 1080, h: 1080, mapH: 580, statCols: 5 },
  '3:4': { w: 1080, h: 1440, mapH: 820, statCols: 4 },
};

const HR_COLORS = ['#4ECDC4', '#FFD93D', '#FF8C42', '#E85D75', '#C0392B'];

function getZonesArray(ride) {
  if (!ride.hr_zones) return [0, 0, 0, 0, 0];
  return [ride.hr_zones.zone1 || 0, ride.hr_zones.zone2 || 0, ride.hr_zones.zone3 || 0, ride.hr_zones.zone4 || 0, ride.hr_zones.zone5 || 0];
}

function renderBackground(ctx, w, h) {
  if (_state.bgType === 'solid') {
    ctx.fillStyle = _state.solidColor;
    ctx.fillRect(0, 0, w, h);
    return _isLightColor(_state.solidColor);
  }
  if (_state.bgType === 'image') {
    const img = _state._imageEl;
    if (img && img.complete && img.naturalWidth > 0) {
      const scale = Math.max(w / img.width, h / img.height);
      const dw = img.width * scale, dh = img.height * scale;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 0, w, h);
      return false;
    }
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);
    return false;
  }
  const p = PRESETS[_state.presetIdx] || PRESETS[0];
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, p.c1);
  grad.addColorStop(1, p.c2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  return !!p.light;
}

function _isLightColor(hex) {
  const v = parseInt(hex.replace('#', ''), 16);
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160;
}

function drawTrackInto(ctx, ride, x, y, w, h, isLight) {
  const pts = ride.track_points;
  if (!pts || pts.length < 2) {
    ctx.fillStyle = isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.65)';
    ctx.font = '500 22px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('无轨迹数据', x + w / 2, y + h / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    return;
  }

  // lat/lng 边界 → 等距投影
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lat, lng] of pts) {
    if (lat == null || lng == null) continue;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  if (minLat === Infinity) {
    ctx.fillStyle = isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.65)';
    ctx.font = '500 22px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('无轨迹数据', x + w / 2, y + h / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    return;
  }
  const lonR = Math.max(maxLng - minLng, 0.0001);
  const latR = Math.max(maxLat - minLat, 0.0001);
  const padding = 30;
  const innerW = w - padding * 2;
  const innerH = h - padding * 2;
  const scale = Math.min(innerW / lonR, innerH / latR);
  const dx = (innerW - lonR * scale) / 2;
  const dy = (innerH - latR * scale) / 2;
  const project = (lat, lng) => [
    x + padding + dx + (lng - minLng) * scale,
    y + padding + dy + (maxLat - lat) * scale,
  ];

  const first = pts.find(p => p[0] != null && p[1] != null);
  const last = [...pts].reverse().find(p => p[0] != null && p[1] != null);

  const poly = getPolyline(_state.currentRideIndex);
  const routeColor = (poly && poly.options && poly.options.color) || '#4ECDC4';

  // 描边(让线在任何背景都看得见,本身不是面板)
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.32)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  let started = false;
  for (const [lat, lng] of pts) {
    if (lat == null || lng == null) continue;
    const [px, py] = project(lat, lng);
    if (!started) { ctx.moveTo(px, py); started = true; }
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // 主线
  ctx.strokeStyle = routeColor;
  ctx.lineWidth = 5;
  ctx.beginPath();
  started = false;
  for (const [lat, lng] of pts) {
    if (lat == null || lng == null) continue;
    const [px, py] = project(lat, lng);
    if (!started) { ctx.moveTo(px, py); started = true; }
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // 起终点 (在画线之外,带白底圈)
  if (first) {
    const [sx, sy] = project(first[0], first[1]);
    _drawDot(ctx, sx, sy, '#4ECDC4', '起');
  }
  if (last && last !== first) {
    const [ex, ey] = project(last[0], last[1]);
    _drawDot(ctx, ex, ey, '#FF6B6B', '终');
  }
}

function _drawDot(ctx, x, y, color, label) {
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.font = '600 14px -apple-system, "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y - 16);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.restore();
}

function drawTitle(ctx, ride, w, isLight) {
  const fg = isLight ? '#222' : '#fff';
  const fgSub = isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.78)';

  // 日期
  ctx.fillStyle = fgSub;
  ctx.font = '600 20px -apple-system, "PingFang SC", sans-serif';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(ride.date || '', 60, 56);

  // 路线名
  ctx.fillStyle = fg;
  ctx.font = '700 64px -apple-system, "PingFang SC", sans-serif';
  const title = ride.route || '骑行';
  ctx.fillText(title, 60, 90);

  // 时间 · 距离
  ctx.font = '500 22px -apple-system, "PingFang SC", sans-serif';
  ctx.fillStyle = fgSub;
  const dist = ride.distance_km ? `${ride.distance_km} km` : '';
  const tm = ride.start_time ? `${ride.start_time}${ride.end_time ? ' - ' + ride.end_time : ''}` : '';
  const sub = [dist, tm].filter(Boolean).join('  ·  ');
  ctx.fillText(sub, 60, 178);
}

function drawBrandMark(ctx, w, h, isLight) {
  // 右上角小字品牌
  ctx.fillStyle = isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.55)';
  ctx.font = '600 16px -apple-system, "PingFang SC", sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('cycling · dashboard', w - 60, 62);
  ctx.textAlign = 'left';
}

function drawStatCard(ctx, x, y, w, h, val, unit, label, isLight) {
  const fg = isLight ? '#222' : '#fff';
  const fgSub = isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.7)';
  const r = 14;
  // 简单圆角卡片(深色:半透黑;浅色:半透白)
  ctx.fillStyle = isLight ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.2)';
  _roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  _roundRect(ctx, x, y, w, h, r);
  ctx.stroke();

  ctx.fillStyle = fg;
  ctx.font = '700 30px -apple-system, "PingFang SC", sans-serif';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(val, x + 14, y + 12);
  if (unit) {
    const vw = ctx.measureText(val).width;
    ctx.font = '500 16px -apple-system, "PingFang SC", sans-serif';
    ctx.fillStyle = fgSub;
    ctx.fillText(unit, x + 14 + vw + 4, y + 22);
  }
  ctx.fillStyle = fgSub;
  ctx.font = '500 12px -apple-system, "PingFang SC", sans-serif';
  ctx.fillText(label.toUpperCase(), x + 14, y + h - 22);
}

function drawStats(ctx, ride, w, h, isLight) {
  const fg = isLight ? '#222' : '#fff';
  const cfg = SIZES[_state.ratio];
  const cols = cfg.statCols;
  const selected = _state.stats;

  const items = selected.map(k => STAT_DEFS.find(s => s.key === k)).filter(Boolean);
  const normalItems = items.filter(s => !s.isZones);
  const zoneItem = items.find(s => s.isZones);
  const rows = Math.ceil(normalItems.length / cols) || 0;
  // 行数多了就往上挪,避免 HR chip 出画布
  const statTopY = h - 220 - Math.max(0, rows - 1) * 80;

  // 标题
  ctx.fillStyle = isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.6)';
  ctx.font = '700 14px -apple-system, "PingFang SC", sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText('STATS', 60, statTopY);

  // 卡片网格
  const cardH = 70;
  const gap = 10;
  const gridTop = statTopY + 26;
  const cellW = (w - 120 - (cols - 1) * gap) / cols;

  normalItems.forEach((s, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = 60 + col * (cellW + gap);
    const y = gridTop + row * (cardH + gap);
    const val = ride[s.key];
    const v = s.fmt ? s.fmt(val || 0) : (val || 0);
    drawStatCard(ctx, x, y, cellW, cardH, v, s.unit, s.label, isLight);
  });

  // HR 分区 — 5 个独立 chip(标签 + 百分比)
  if (zoneItem) {
    const z = getZonesArray(ride);
    const labels = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];
    const chipGap = 8;
    const chipW = (w - 120 - chipGap * 4) / 5;
    const chipH = 50;
    const chipY = gridTop + rows * (cardH + gap) + 4;
    const panelFill = isLight ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.2)';
    const panelStroke = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';

    z.forEach((pct, i) => {
      const cx = 60 + i * (chipW + chipGap);
      // 卡底
      _roundRect(ctx, cx, chipY, chipW, chipH, 8);
      ctx.fillStyle = panelFill;
      ctx.fill();
      ctx.strokeStyle = panelStroke;
      ctx.lineWidth = 1;
      ctx.stroke();
      // 左侧色条
      ctx.fillStyle = HR_COLORS[i];
      _roundRect(ctx, cx, chipY, 4, chipH, 2);
      ctx.fill();
      // 标签 + 百分比
      ctx.fillStyle = isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.65)';
      ctx.font = '700 11px -apple-system, "PingFang SC", sans-serif';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(labels[i], cx + 12, chipY + 8);
      ctx.fillStyle = isLight ? '#222' : '#fff';
      ctx.font = '700 18px -apple-system, "PingFang SC", sans-serif';
      ctx.fillText(`${(pct || 0).toFixed(0)}%`, cx + 12, chipY + 24);
    });
    ctx.textAlign = 'left';
  }
}

function drawWatermark(ctx, w, h, isLight) {
  const fg = isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.5)';
  ctx.fillStyle = fg;
  ctx.font = '500 14px -apple-system, "PingFang SC", sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('cycling-dashboard · 骑行看板', w - 40, h - 24);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

function _roundRect(ctx, x, y, w, h, r) {
  if (typeof r === 'number') r = [r, r, r, r];
  ctx.beginPath();
  ctx.moveTo(x + r[0], y);
  ctx.lineTo(x + w - r[1], y);
  ctx.arcTo(x + w, y, x + w, y + r[1], r[1]);
  ctx.lineTo(x + w, y + h - r[2]);
  ctx.arcTo(x + w, y + h, x + w - r[2], y + h, r[2]);
  ctx.lineTo(x + r[3], y + h);
  ctx.arcTo(x, y + h, x, y + h - r[3], r[3]);
  ctx.lineTo(x, y + r[0]);
  ctx.arcTo(x, y, x + r[0], y, r[0]);
  ctx.closePath();
}

function compose(ride, preview = false) {
  if (!ride) return null;
  const cfg = SIZES[_state.ratio];
  const W = cfg.w, H = cfg.h;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (preview) {
    const previewScale = 0.22;
    canvas.width = Math.round(W * previewScale);
    canvas.height = Math.round(H * previewScale);
    ctx.scale(previewScale, previewScale);
  } else {
    canvas.width = W;
    canvas.height = H;
  }
  renderTo(ctx, ride, W, H);
  return canvas;
}

function renderTo(ctx, ride, W, H) {
  const isLight = renderBackground(ctx, W, H);
  drawTitle(ctx, ride, W, isLight);
  drawBrandMark(ctx, W, H, isLight);
  const titleH = 220;
  const mapX = 60, mapY = titleH;
  const mapW = W - 120, mapH = SIZES[_state.ratio].mapH - titleH + 60;
  drawTrackInto(ctx, ride, mapX, mapY, mapW, mapH, isLight);
  drawStats(ctx, ride, W, H, isLight);
  drawWatermark(ctx, W, H, isLight);
}

function refreshPreview() {
  const ride = _state.getRide ? _state.getRide() : null;
  if (!ride) return;
  const canvas = compose(ride, true);
  if (!canvas) return;
  const preview = document.getElementById('expPreview');
  if (!preview) return;
  // 让预览 canvas 与导出图同比例,避免 3:4 被压扁
  const maxW = 280, maxH = 320;
  const scale = Math.min(maxW / canvas.width, maxH / canvas.height);
  preview.width = Math.round(canvas.width * scale);
  preview.height = Math.round(canvas.height * scale);
  preview.style.width = preview.width + 'px';
  preview.style.height = preview.height + 'px';
  const pctx = preview.getContext('2d');
  pctx.clearRect(0, 0, preview.width, preview.height);
  pctx.drawImage(canvas, 0, 0, preview.width, preview.height);
}

export function openShareModal(rideIndex, getRide) {
  _state.currentRideIndex = rideIndex;
  _state.getRide = getRide;
  const ride = getRide();
  if (!ride) return;
  _state.stats = [...DEFAULT_STATS];
  document.querySelectorAll('.exp-stat').forEach(cb => {
    cb.checked = DEFAULT_STATS.includes(cb.dataset.key);
  });
  document.getElementById('exportModal').style.display = 'flex';
  setTimeout(refreshPreview, 50);
}

export function setupExportModal() {
  // 比例 tabs
  document.querySelectorAll('.exp-ratio-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.exp-ratio-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _state.ratio = tab.dataset.ratio;
      refreshPreview();
    });
  });

  // 背景 tabs
  document.querySelectorAll('.exp-bg-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.exp-bg-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _state.bgType = tab.dataset.bg;
      document.getElementById('expBgPreset').style.display = _state.bgType === 'preset' ? '' : 'none';
      document.getElementById('expBgSolid').style.display = _state.bgType === 'solid' ? '' : 'none';
      document.getElementById('expBgImage').style.display = _state.bgType === 'image' ? '' : 'none';
      refreshPreview();
    });
  });

  // 预设渐变按钮
  document.getElementById('expPresets').innerHTML = PRESETS.map((p, i) =>
    `<button class="exp-preset${i === 0 ? ' active' : ''}${p.light ? ' light' : ''}" data-idx="${i}" style="background:linear-gradient(135deg,${p.c1},${p.c2})" title="${p.name}"><span>${p.name}</span></button>`
  ).join('');
  document.querySelectorAll('.exp-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.exp-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _state.presetIdx = parseInt(btn.dataset.idx);
      _state.bgType = 'preset';
      refreshPreview();
    });
  });

  // 纯色
  document.getElementById('expSolidColor').addEventListener('input', (e) => {
    _state.solidColor = e.target.value;
    refreshPreview();
  });

  // 图片
  document.getElementById('expImageInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    _state.imageName = file.name;
    document.getElementById('expImageName').textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => { _state._imageEl = img; refreshPreview(); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  // 统计项
  document.getElementById('expStats').innerHTML = STAT_DEFS.map(s =>
    `<label class="exp-stat-label"><input type="checkbox" class="exp-stat" data-key="${s.key}"${DEFAULT_STATS.includes(s.key) ? ' checked' : ''}>${s.label}</label>`
  ).join('');
  document.querySelectorAll('.exp-stat').forEach(cb => {
    cb.addEventListener('change', () => {
      const selected = Array.from(document.querySelectorAll('.exp-stat:checked')).map(c => c.dataset.key);
      _state.stats = selected;
      refreshPreview();
    });
  });
  document.getElementById('expStatsAll')?.addEventListener('click', () => {
    document.querySelectorAll('.exp-stat').forEach(cb => cb.checked = true);
    _state.stats = STAT_DEFS.map(s => s.key);
    refreshPreview();
  });
  document.getElementById('expStatsNone')?.addEventListener('click', () => {
    document.querySelectorAll('.exp-stat').forEach(cb => cb.checked = false);
    _state.stats = [];
    refreshPreview();
  });
  document.getElementById('expClose')?.addEventListener('click', () => {
    document.getElementById('exportModal').style.display = 'none';
  });

  // 取消
  document.getElementById('expCancel').addEventListener('click', () => {
    document.getElementById('exportModal').style.display = 'none';
  });
  document.getElementById('exportModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
  });

  // 下载
  document.getElementById('expDownload').addEventListener('click', async () => {
    const ride = _state.getRide ? _state.getRide() : null;
    if (!ride) return;
    const btn = document.getElementById('expDownload');
    btn.disabled = true;
    const oldText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader" class="lci"></i> 渲染中…';
    if (window.lucide) window.lucide.createIcons();
    try {
      const canvas = compose(ride, false);
      if (!canvas) throw new Error('渲染失败');
      let dataUrl;
      try {
        dataUrl = canvas.toDataURL('image/png');
      } catch (e) {
        throw new Error('canvas 导出失败 (' + (e.name || e.message) + ')');
      }
      const link = document.createElement('a');
      link.download = `ride_${ride.date}_${(ride.route || 'ride').replace(/[^\w一-龥]/g, '_')}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      alert('导出失败: ' + e.message + '\n\n浏览器控制台可能有更多信息');
      console.error('[export]', e);
    } finally {
      btn.disabled = false;
      btn.innerHTML = oldText;
      if (window.lucide) window.lucide.createIcons();
    }
  });
}
