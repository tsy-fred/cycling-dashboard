/**
 * map.js — Leaflet 地图渲染模块
 * 负责地图初始化、路线绘制、图例控制
 */

let map = null;
const layers = {};
const allPolylines = [];
let crossMarker = null;
let locationMarkers = [];
let onMapContextMenu = null;

const ZL = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];
const ZC = ['#4ECDC4', '#FFD93D', '#FF8C42', '#E85D75', '#C0392B'];

/**
 * 初始化地图
 * @param {Array} rides - 骑行记录数组
 * @param {Object} routeColors - 路线颜色配置
 * @param {Function} onRideClick - 骑行记录点击回调
 */
export function initMap(rides, routeColors, onRideClick, getDisplayColor) {
  if (map) return;

  map = L.map('map', { zoomControl: true }).setView([39.92, 116.35], 12);
  L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png', {
    attribution: '&copy; CARTO',
    maxZoom: 18
  }).addTo(map);

  rides.forEach((ride, i) => {
    if (!ride.track_points || ride.track_points.length < 2) return;
    const pts = ride.track_points.map(p => [p[0], p[1]]);
    const baseColor = routeColors[ride.route] || '#666';
    const color = getDisplayColor ? getDisplayColor(ride.route) : baseColor;
    const isDash = ride.route && (ride.route.includes('（南二环）') || ride.route.includes('（长安街）'));
    const poly = L.polyline(pts, {
      color,
      weight: 3,
      opacity: 0.7,
      dashArray: isDash ? '7,5' : null
    });
    poly.ri = i;

    const z = ride.hr_zones;
    const hrBars = ZL.map((l, zi) =>
      `<div style="display:flex;align-items:center;gap:3px;margin:1px 0">` +
      `<span style="width:22px;font-size:11px;color:#888">${l}</span>` +
      `<span style="flex:1;height:8px;background:#eee;border-radius:4px;overflow:hidden">` +
      `<span style="display:block;width:${z['zone' + (zi + 1)] || 0}%;height:100%;background:${ZC[zi]};border-radius:4px"></span></span>` +
      `<span style="width:36px;text-align:right;font-size:11px">${(z['zone' + (zi + 1)] || 0).toFixed(1)}%</span></div>`
    ).join('');

    const dateLabel = ride.date.slice(5);
    poly.on('click', () => {
      if (onRideClick) onRideClick(i);
    });
    poly.bindTooltip(dateLabel, {
      sticky: true,
      direction: 'top',
      offset: [0, -8],
      className: 'route-label'
    });

    poly.bindPopup(
      `<div style="min-width:210px">` +
      `<div style="font-weight:700;font-size:14px;margin-bottom:4px">${ride.route}</div>` +
      `<div style="font-size:12px;color:#888;margin-bottom:6px">${ride.date} · ${ride.start_time}-${ride.end_time}</div>` +
      `<table class="pt"><tr><td>距离</td><td>${ride.distance_km} km</td></tr>` +
      `<tr><td>均速</td><td>${ride.avg_speed_kmh} km/h</td></tr>` +
      `<tr><td>极速</td><td>${ride.max_speed_kmh} km/h</td></tr>` +
      `<tr><td>均心</td><td>${ride.avg_hr} bpm</td></tr>` +
      `<tr><td>爬升</td><td>${ride.elev_gain_m} m</td></tr>` +
      `<tr><td>消耗</td><td>${ride.calories} kcal</td></tr></table>` +
      `<div style="margin-top:5px;border-top:1px solid #eee;padding-top:3px">${hrBars}</div></div>`
    );
    poly.addTo(map);
    allPolylines.push(poly);
    if (!layers[ride.route]) layers[ride.route] = [];
    layers[ride.route].push(poly);
  });
}

/**
 * 初始化图例
 * @param {Array} routeOrder - 路线顺序
 * @param {Object} routeColors - 路线颜色
 * @param {Array} rides - 骑行记录
 */
export function initLegend(routeOrder, routeColors, rides) {
  document.getElementById('legend').innerHTML = routeOrder.map(r => {
    const c = routeColors[r] || '#666';
    const n = rides.filter(x => x.route === r).length;
    if (!n) return '';
    return `<label style="outline-color:${c}"><input type=checkbox checked onchange="toggleRoute('${r}',this.checked)">` +
      `<span class="d" style="background:${c}"></span>${r}<span style="font-size:11px;opacity:.5;margin-left:2px">${n}</span></label>`;
  }).join('');
}

/**
 * 切换路线可见性（由 HTML onclick 调用）
 */
window.toggleRoute = function(r, s) {
  (layers[r] || []).forEach(l => {
    if (s) map.addLayer(l);
    else map.removeLayer(l);
  });
};

/**
 * 重建地图所有路线（上传新数据后调用）
 * 清除所有已有折线，从 rides 数组重新绘制
 */
export function rebuildMapLayers(rides, routeColors, onRideClick, getDisplayColor) {
  // 清除所有已有的折线
  Object.keys(layers).forEach(route => {
    layers[route].forEach(poly => {
      if (map) map.removeLayer(poly);
    });
  });
  // 清空记录
  Object.keys(layers).forEach(k => delete layers[k]);
  allPolylines.length = 0;

  if (!map) return;

  // 确保地图容器尺寸正确
  map.invalidateSize();

  // 重新添加所有路线
  rides.forEach((ride, i) => {
    if (!ride.track_points || ride.track_points.length < 2) return;
    const pts = ride.track_points.map(p => [p[0], p[1]]);
    const color = routeColors[ride.route] || '#666';
    const isDash = ride.route && (ride.route.includes('（南二环）') || ride.route.includes('（长安街）'));
    const poly = L.polyline(pts, {
      color,
      weight: 3,
      opacity: 0.7,
      dashArray: isDash ? '7,5' : null
    });
    poly.ri = i;

    const z = ride.hr_zones || {};
    const hrBars = ZL.map((l, zi) =>
      `<div style="display:flex;align-items:center;gap:3px;margin:1px 0">` +
      `<span style="width:22px;font-size:11px;color:#888">${l}</span>` +
      `<span style="flex:1;height:8px;background:#eee;border-radius:4px;overflow:hidden">` +
      `<span style="display:block;width:${z['zone' + (zi + 1)] || 0}%;height:100%;background:${ZC[zi]};border-radius:4px"></span></span>` +
      `<span style="width:36px;text-align:right;font-size:11px">${(z['zone' + (zi + 1)] || 0).toFixed(1)}%</span></div>`
    ).join('');

    const dateLabel = (ride.date || '').slice(5);
    poly.on('click', () => {
      if (onRideClick) onRideClick(i);
    });
    poly.bindTooltip(dateLabel, {
      sticky: true,
      direction: 'top',
      offset: [0, -8],
      className: 'route-label'
    });

    poly.bindPopup(
      `<div style="min-width:210px">` +
      `<div style="font-weight:700;font-size:14px;margin-bottom:4px">${ride.route || '未知'}</div>` +
      `<div style="font-size:12px;color:#888;margin-bottom:6px">${ride.date || ''} · ${ride.start_time || ''}-${ride.end_time || ''}</div>` +
      `<table class="pt"><tr><td>距离</td><td>${ride.distance_km || 0} km</td></tr>` +
      `<tr><td>均速</td><td>${ride.avg_speed_kmh || 0} km/h</td></tr>` +
      `<tr><td>极速</td><td>${ride.max_speed_kmh || 0} km/h</td></tr>` +
      `<tr><td>均心</td><td>${ride.avg_hr || 0} bpm</td></tr>` +
      `<tr><td>爬升</td><td>${ride.elev_gain_m || 0} m</td></tr>` +
      `<tr><td>消耗</td><td>${ride.calories || 0} kcal</td></tr></table>` +
      `<div style="margin-top:5px;border-top:1px solid #eee;padding-top:3px">${hrBars}</div></div>`
    );
    poly.addTo(map);
    allPolylines.push(poly);
    if (!layers[ride.route]) layers[ride.route] = [];
    layers[ride.route].push(poly);
  });
}

/**
 * 高亮指定骑行线路
 */
export function highlightRide(i) {
  allPolylines.forEach((l, j) => {
    if (j === i) {
      l.setStyle({ weight: 5, opacity: 1 });
      l.bringToFront();
    } else {
      l.setStyle({ weight: 3, opacity: 0.7 });
    }
  });
}

/**
 * 聚焦到某条路线的范围
 */
export function fitRideBounds(ride) {
  if (ride.track_points && ride.track_points.length > 0) {
    map.fitBounds(L.latLngBounds(ride.track_points.map(p => [p[0], p[1]])), {
      padding: [40, 40],
      maxZoom: 15
    });
  }
}

/**
 * 在地图上放置位置标记
 */
export function placeCrosshair(lat, lng) {
  if (crossMarker) {
    map.removeLayer(crossMarker);
    crossMarker = null;
  }
  crossMarker = L.circleMarker([lat, lng], {
    radius: 7,
    color: '#222',
    weight: 2.5,
    fillColor: '#fff',
    fillOpacity: 1
  }).addTo(map);
}

/**
 * 清除位置标记
 */
export function clearCrosshair() {
  if (crossMarker) {
    map.removeLayer(crossMarker);
    crossMarker = null;
  }
}

/**
 * 获取所有折线（用于对比显示）
 */
export function getPolyline(i) {
  return allPolylines[i];
}

/**
 * 设置折线样式（用于对比）
 */
export function setPolylineStyle(i, style) {
  if (allPolylines[i]) {
    allPolylines[i].setStyle(style);
  }
}

/**
 * 重置所有折线样式
 */
export function resetPolylineStyles() {
  allPolylines.forEach(l => {
    l.setStyle({ weight: 3, opacity: 0.7 });
  });
}

/**
 * 调整地图视野到所有给定坐标点
 */
export function fitBoundsToPoints(points) {
  if (points.length) {
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 14 });
  }
}

// ═════════════════════════════════════════════════════════════════════
//  地标大头钉
// ═════════════════════════════════════════════════════════════════════

/**
 * 渲染地标标记
 * @param {Array} locations - [{id, name, lat, lng}]
 * @param {Function} onRightClick - (loc) => void  右键标记 → 弹出菜单
 * @param {Function} onDragEnd - (id, lat, lng) => void  拖拽结束
 */
export function renderLocations(locations, onRightClick, onDragEnd) {
  // 清除旧标记
  locationMarkers.forEach(m => map?.removeLayer(m));
  locationMarkers = [];

  if (!map || !locations) return;

  const pinIcon = L.divIcon({
    className: 'loc-pin',
    html: '<div class="pin-icon">📍</div>',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -30],
  });

  // 注册全局回调（每次重新注册）
  window._locRename = (id) => {
    const loc = locations.find(l => l.id === id);
    if (loc) onRightClick?.(loc, 'rename');
  };
  window._locDelete = (id) => {
    const loc = locations.find(l => l.id === id);
    if (loc) onRightClick?.(loc, 'delete');
  };

  locations.forEach(loc => {
    const marker = L.marker([loc.lat, loc.lng], {
      icon: pinIcon,
      draggable: loc.manual !== false,
    });

    marker.bindPopup(
      `<div style="min-width:120px">
        <div style="font-weight:600;margin-bottom:4px">${loc.name}</div>
        <div style="font-size:11px;color:#888">${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}</div>
        <div style="margin-top:6px;display:flex;gap:4px">
          <button onclick="window._locRename('${loc.id}')" style="flex:1;padding:4px 8px;border:1px solid #ddd;border-radius:5px;background:#fff;cursor:pointer;font-size:11px">✏️ 重命名</button>
          <button onclick="window._locDelete('${loc.id}')" style="flex:1;padding:4px 8px;border:1px solid #ddd;border-radius:5px;background:#fff;cursor:pointer;font-size:11px">🗑️ 删除</button>
        </div>
      </div>`
    );

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      onDragEnd?.(loc.id, pos.lat, pos.lng);
    });

    marker.addTo(map);
    locationMarkers.push(marker);
  });
}

/**
 * 设置地图右键菜单回调
 */
export function setContextMenuHandler(handler) {
  onMapContextMenu = handler;
  if (map) {
    map.off('contextmenu');
    if (handler) {
      map.on('contextmenu', (e) => {
        handler(e.latlng.lat, e.latlng.lng, e.originalEvent);
      });
    }
  }
}

/**
 * 刷新地标标记（重新执行 renderLocations）
 */
export function refreshLocationMarkers(locations, onRightClick, onDragEnd) {
  renderLocations(locations, onRightClick, onDragEnd);
}
