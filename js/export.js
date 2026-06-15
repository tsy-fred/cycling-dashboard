/**
 * export.js — 骑行记录分享图生成
 * 纯 Canvas API 合成,地图用 leaflet-image 渲染
 */

import { getMap, getPolyline, setPolylineStyle, resetPolylineStyles, fitRideBounds } from './map.js';

const PRESETS = [
  { name: '落日', c1: '#FF6B6B', c2: '#FFD86B' },
  { name: '深空', c1: '#0F2027', c2: '#2C5364' },
  { name: '运动', c1: '#B71C1C', c2: '#212121' },
  { name: '清新', c1: '#43C6AC', c2: '#1F3A5F' },
  { name: '极简', c1: '#FAFAFA', c2: '#D7D7D7', light: true },
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
  { key: 'num_laps', label: '圈数', unit: '', fmt: v => v || '-' },
  { key: '__hr_zones', label: 'HR 分区', isZones: true },
];

const DEFAULT_STATS = ['distance_km', 'moving_time_min', 'avg_speed_kmh', 'max_speed_kmh', 'elev_gain_m'];

const _state = {
  ratio: '1:1',
  bgType: 'preset',
  presetIdx: 0,
  solidColor: '#1a1a2e',
  imageDataUrl: null,
  imageName: '',
  stats: [...DEFAULT_STATS],
  getRide: null,
};

const SIZES = {
  '1:1': { w: 1080, h: 1080, mapH: 580, statCols: 5 },
  '3:4': { w: 1080, h: 1440, mapH: 820, statCols: 4 },
};

function fmtTime(min) {
  if (!min) return '-';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h${m}m` : `${m}m`;
}

function getZonesArray(ride) {
  if (!ride.hr_zones) return [0, 0, 0, 0, 0];
  return [ride.hr_zones.zone1 || 0, ride.hr_zones.zone2 || 0, ride.hr_zones.zone3 || 0, ride.hr_zones.zone4 || 0, ride.hr_zones.zone5 || 0];
}

const HR_COLORS = ['#4ECDC4', '#FFD93D', '#FF8C42', '#E85D75', '#C0392B'];

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
    // 还没加载好 → 降级到纯黑
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);
    return false;
  }
  // 预设渐变(默认)
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

async function renderMapToCanvas(mapInstance, ride) {
  return new Promise((resolve) => {
    const savedStyles = [];
    mapInstance.eachLayer(layer => {
      if (layer instanceof L.Polyline) {
        savedStyles.push({ layer, weight: layer.options.weight, opacity: layer.options.opacity, color: layer.options.color });
        if (layer.ri !== undefined && layer.ri === _currentRideIndex) {
          layer.setStyle({ weight: 5, opacity: 1 });
        } else {
          layer.setStyle({ opacity: 0, weight: 0 });
        }
      }
    });
    fitRideBounds(ride);
    setTimeout(() => {
      const restore = () => savedStyles.forEach(s => s.layer.setStyle({ weight: s.weight, opacity: s.opacity, color: s.color }));
      if (window.leafletImage) {
        window.leafletImage(mapInstance, (err, mapCanvas) => {
          restore();
          if (err) resolve(null);
          else resolve(mapCanvas);
        });
      } else {
        restore();
        resolve(null);
      }
    }, 400);
  });
}

let _currentRideIndex = -1;

function drawMapInto(ctx, mapCanvas, x, y, w, h) {
  if (!mapCanvas) {
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(x, y, w, h);
    return;
  }
  // 圆角裁切
  const r = 16;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.clip();
  // cover fit
  const scale = Math.max(w / mapCanvas.width, h / mapCanvas.height);
  const dw = mapCanvas.width * scale, dh = mapCanvas.height * scale;
  ctx.drawImage(mapCanvas, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
  // 边框
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.stroke();
}

function drawTitle(ctx, ride, w, isLight) {
  const fg = isLight ? '#222' : '#fff';
  const fgSub = isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.7)';

  ctx.fillStyle = fg;
  ctx.font = '700 56px -apple-system, "PingFang SC", sans-serif';
  ctx.textBaseline = 'top';
  const title = ride.route || '骑行';
  ctx.fillText(title, 60, 50);

  // 日期 · 时间
  ctx.font = '500 24px -apple-system, "PingFang SC", sans-serif';
  ctx.fillStyle = fgSub;
  const dateText = `${ride.date}${ride.start_time ? ` · ${ride.start_time}-${ride.end_time}` : ''}`;
  ctx.fillText(dateText, 60, 124);
}

function drawStats(ctx, ride, w, h, isLight) {
  const fg = isLight ? '#222' : '#fff';
  const fgSub = isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.7)';
  const cfg = SIZES[_state.ratio];
  const cols = cfg.statCols;
  const selected = _state.stats;
  const hasZones = selected.includes('__hr_zones');

  // 决定每行 item 数
  let items = selected.map(k => STAT_DEFS.find(s => s.key === k)).filter(Boolean);
  // HR 分区占满整行
  const normalItems = items.filter(s => !s.isZones);
  const zoneItem = items.find(s => s.isZones);
  const rows = Math.ceil(normalItems.length / cols);
  const statTopY = h - 240; // 地图底 + 间距
  const statAreaH = 200;

  // 标题
  ctx.fillStyle = fgSub;
  ctx.font = '600 16px -apple-system, "PingFang SC", sans-serif';
  ctx.fillText('STATS', 60, statTopY);

  const gridTop = statTopY + 30;
  const cellW = (w - 120) / cols;
  const cellH = 36;

  ctx.font = '500 18px -apple-system, "PingFang SC", sans-serif';
  normalItems.forEach((s, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = 60 + col * cellW;
    const y = gridTop + row * (cellH + 4);
    const val = ride[s.key];
    const v = s.fmt ? s.fmt(val || 0) : (val || 0);
    ctx.fillStyle = fg;
    ctx.textAlign = 'left';
    ctx.fillText(v, x, y);
    // 单位
    if (s.unit) {
      ctx.font = '500 13px -apple-system, "PingFang SC", sans-serif';
      ctx.fillStyle = fgSub;
      const vw = ctx.measureText(v).width;
      ctx.fillText(s.unit, x + vw + 4, y + 6);
      ctx.font = '500 18px -apple-system, "PingFang SC", sans-serif';
    }
    // label
    ctx.fillStyle = fgSub;
    ctx.font = '500 12px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(s.label, x, y + 22);
  });

  // HR 分区条
  if (zoneItem) {
    const y = gridTop + rows * (cellH + 4) + 4;
    const z = getZonesArray(ride);
    const total = w - 120;
    const labels = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];
    let cur = 60;
    z.forEach((pct, i) => {
      if (!pct) return;
      const wseg = total * (pct / 100);
      ctx.fillStyle = HR_COLORS[i];
      ctx.fillRect(cur, y, wseg, 14);
      // 标签
      if (wseg > 30) {
        ctx.fillStyle = isLight ? '#222' : '#fff';
        ctx.font = '500 11px -apple-system, "PingFang SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${labels[i]} ${pct.toFixed(0)}%`, cur + wseg / 2, y + 11);
        ctx.textAlign = 'left';
      }
      cur += wseg;
    });
  }
}

function drawWatermark(ctx, w, h, isLight) {
  const fg = isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.5)';
  ctx.fillStyle = fg;
  ctx.font = '500 14px -apple-system, "PingFang SC", sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('cycling-dashboard', w - 40, h - 24);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

async function compose(ride, preview = false) {
  if (!ride) return null;
  const cfg = SIZES[_state.ratio];
  const W = cfg.w, H = cfg.h;
  const canvas = document.createElement('canvas');
  if (preview) {
    const previewScale = 0.22;
    canvas.width = Math.round(W * previewScale);
    canvas.height = Math.round(H * previewScale);
    const ctx = canvas.getContext('2d');
    ctx.scale(previewScale, previewScale);
    renderTo(ctx, ride, W, H);
  } else {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    await renderTo(ctx, ride, W, H);
  }
  return canvas;
}

async function renderTo(ctx, ride, W, H) {
  const isLight = renderBackground(ctx, W, H);
  drawTitle(ctx, ride, W, isLight);
  const mapInstance = getMap();
  if (mapInstance) {
    const mapCanvas = await renderMapToCanvas(mapInstance, ride);
    if (mapCanvas) {
      const titleH = 170;
      const mapX = 60, mapY = titleH;
      const mapW = W - 120, mapH = (SIZES[_state.ratio].mapH - titleH + 60);
      drawMapInto(ctx, mapCanvas, mapX, mapY, mapW, mapH);
    }
  }
  drawStats(ctx, ride, W, H, isLight);
  drawWatermark(ctx, W, H, isLight);
}

function refreshPreview() {
  const ride = _state.getRide ? _state.getRide() : null;
  if (!ride) return;
  compose(ride, true).then(canvas => {
    if (!canvas) return;
    const preview = document.getElementById('expPreview');
    if (preview) {
      const pctx = preview.getContext('2d');
      pctx.clearRect(0, 0, preview.width, preview.height);
      pctx.drawImage(canvas, 0, 0, preview.width, preview.height);
    }
  });
}

export function openShareModal(rideIndex, getRide) {
  _currentRideIndex = rideIndex;
  _state.getRide = getRide;
  const ride = getRide();
  if (!ride) return;
  // 重置为默认
  _state.stats = [...DEFAULT_STATS];
  document.querySelectorAll('.exp-stat').forEach(cb => {
    cb.checked = DEFAULT_STATS.includes(cb.dataset.key);
  });
  // 打开
  document.getElementById('exportModal').style.display = 'flex';
  // 预览
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
    `<button class="exp-preset${i === 0 ? ' active' : ''}" data-idx="${i}" style="background:linear-gradient(135deg,${p.c1},${p.c2})" title="${p.name}"></button>`
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
      _state.imageDataUrl = reader.result;
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
      const canvas = await compose(ride, false);
      if (!canvas) throw new Error('渲染失败');
      const link = document.createElement('a');
      link.download = `ride_${ride.date}_${(ride.route || 'ride').replace(/[^\w一-龥]/g, '_')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      alert('导出失败: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = oldText;
      if (window.lucide) window.lucide.createIcons();
    }
  });
}
