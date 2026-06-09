/**
 * storage.js — 骑行数据加载模块
 * 从 data/rides.json 加载数据，提供数据访问接口
 */

let _data = null;

export async function loadRides() {
  if (_data) return _data;
  const res = await fetch('data/rides.json?t=' + Date.now());
  if (!res.ok) throw new Error(`加载数据失败: ${res.status}`);
  _data = await res.json();
  return _data;
}

export function getAllRides() {
  return _data?.records ?? [];
}

export function getRouteColors() {
  return _data?.route_colors ?? {};
}

export function getRouteOrder() {
  return _data?.route_order ?? [];
}

export function getVersion() {
  return _data?.version ?? null;
}

export function getLastUpdated() {
  return _data?.last_updated ?? null;
}
