/**
 * charts.js — Chart.js 图表渲染模块
 * 负责月度里程柱状图、骑行详情趋势图（心率/速度/海拔）
 */

let detailCharts = [];
let monthlyChart = null;
let crossSampleN = 1;
let crossX = null;

// 注册跨图表十字线插件
Chart.register({id:'crosshair',afterDraw:(chart)=>{
  if (crossX === null || detailCharts.indexOf(chart) === -1) return;
  const ca = chart.chartArea, ctx = chart.ctx;
  if (!ca || !ctx) return;
  ctx.save();
  ctx.beginPath();
  ctx.setLineDash([4, 3]);
  ctx.moveTo(crossX, ca.top);
  ctx.lineTo(crossX, ca.bottom);
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}});

const HR_COLORS = ['#4ECDC4', '#FFD93D', '#FF8C42', '#E85D75', '#C0392B'];
const HR_LABELS = ['Z1 有氧', 'Z2 燃脂', 'Z3 耐力', 'Z4 阈值', 'Z5 无氧'];

/**
 * 哈弗辛距离计算（km）
 */
function haversineKm(p1, p2) {
  const R = 6371;
  const dLat = (p2[0] - p1[0]) * Math.PI / 180;
  const dLon = (p2[1] - p1[1]) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(p1[0] * Math.PI / 180) * Math.cos(p2[0] * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 初始化月度里程柱状图
 * @param {Array} rides - 所有骑行记录
 */
export function initMonthlyChart(rides) {
  // 销毁旧图表
  if (monthlyChart) {
    monthlyChart.destroy();
    monthlyChart = null;
  }

  const m = {};
  rides.forEach(r => {
    const k = r.date.slice(0, 7);
    m[k] = (m[k] || 0) + r.distance_km;
  });
  const labels = Object.keys(m).sort();
  const data = labels.map(k => m[k]);

  monthlyChart = new Chart(document.getElementById('mc').getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels.map(l => l.replace('-', '/')),
      datasets: [{
        label: '',
        data,
        backgroundColor: ['#2196F3', '#4CAF50', '#4CAF50', '#4CAF50', '#4CAF50', '#4CAF50', '#FF9800'],
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: '#eee' },
          ticks: { font: { size: 10 } }
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 } }
        }
      }
    }
  });
}

/**
 * 渲染骑行详情（心率/速度/海拔趋势图）
 * @param {Object} ride - 单条骑行记录
 * @param {Function} onHover - 鼠标悬停回调 (index, point) => void
 * @param {Function} onLeave - 鼠标离开回调 () => void
 */
export function renderDetail(ride, onHover, onLeave) {
  // 销毁旧图表
  detailCharts.forEach(c => { if (c) c.destroy(); });
  detailCharts = [];

  const pts = ride.track_points;
  if (!pts || pts.length < 2) return;

  const hasCadence = !!(ride.has_cadence || ride.avg_cadence > 0);

  // 踏频面板可见性
  const cadenceWrap = document.getElementById('dcCadenceWrap');
  if (cadenceWrap) cadenceWrap.style.display = hasCadence ? 'block' : 'none';

  // 计算累积距离
  const dist = [0];
  for (let i = 1; i < pts.length; i++) {
    dist.push(dist[i - 1] + haversineKm(pts[i - 1], pts[i]));
  }

  // 采样到约 120 点
  crossSampleN = Math.max(1, Math.floor(pts.length / 120));
  const labels = [];
  const hrData = [];
  const spdData = [];
  const altData = [];
  const cadData = [];
  const indices = [];

  const hasCad6 = pts[0].length >= 6; // 轨迹点含踏频（第6元素）

  for (let i = 0; i < pts.length; i += crossSampleN) {
    labels.push(dist[i].toFixed(1));
    hrData.push(pts[i][3] || null);
    spdData.push(pts[i][2] || null);
    altData.push(pts[i][4] || null);
    cadData.push(hasCad6 ? (pts[i][5] || null) : null);
    indices.push(i);
  }

  // 鼠标移动/离开事件
  const canvasMove = (e) => {
    const rect = e.target.getBoundingClientRect();
    crossX = e.clientX - rect.left;
    const pct = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(Math.max(0, Math.min(1, pct)) * (indices.length - 1));
    const tpIdx = indices[idx];
    if (onHover && pts[tpIdx]) onHover(tpIdx, pts[tpIdx]);
    detailCharts.forEach(c => c.draw());
  };

  const canvasLeave = () => {
    crossX = null;
    if (onLeave) onLeave();
    detailCharts.forEach(c => c.draw());
  };

  const makeChart = (canvasId, data, color, zero) => {
    const canvas = document.getElementById(canvasId);
    // 移除旧监听器（通过替换克隆的方式）
    const newCanvas = canvas.cloneNode(true);
    canvas.parentNode.replaceChild(newCanvas, canvas);

    newCanvas.addEventListener('mousemove', canvasMove);
    newCanvas.addEventListener('mouseleave', canvasLeave);

    detailCharts.push(new Chart(newCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data,
          borderColor: color,
          backgroundColor: color + '18',
          fill: true,
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        },
        scales: {
          x: { display: false },
          y: {
            beginAtZero: zero,
            grid: { color: '#eee' },
            ticks: { font: { size: 9 }, maxTicksLimit: 4 }
          }
        }
      }
    }));
  };

  makeChart('dcHr', hrData, '#e85d75', false);
  makeChart('dcSpd', spdData, '#2196f3', true);
  makeChart('dcAlt', altData, '#4caf5a', true);
  if (hasCadence) {
    makeChart('dcCadence', cadData, '#9C27B0', false);
  }
}

/**
 * 在月度里程下方显示选中骑行的心率区间
 */
export function renderSelectedHR(zones, title) {
  const titleEl = document.getElementById('selHRTitle');
  const barsEl = document.getElementById('selHRBars');
  if (!titleEl || !barsEl) return;

  document.getElementById('selHR').style.display = 'block';
  titleEl.textContent = title || '';

  const z = zones || {};
  barsEl.innerHTML = HR_LABELS.map((label, i) => {
    const pct = z['zone' + (i + 1)] || 0;
    return `<div style="display:flex;align-items:center;gap:8px;margin:2px 0">
      <span style="width:56px;font-size:11px;color:#888;flex-shrink:0">${label}</span>
      <span style="flex:1;height:12px;background:#eee;border-radius:6px;overflow:hidden">
        <span style="display:block;width:${pct}%;height:100%;background:${HR_COLORS[i]};border-radius:6px;transition:width .3s"></span>
      </span>
      <span style="width:40px;text-align:right;font-size:11px;font-weight:600;color:#333;flex-shrink:0">${pct.toFixed(1)}%</span>
    </div>`;
  }).join('');
}

/**
 * 重绘所有详情图表
 */
export function redrawDetails() {
  detailCharts.forEach(c => c.draw());
}
