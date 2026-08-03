const STORAGE_KEY = "perf:v1";
const MAX_RECORDS = 100;

export interface ApiRecord {
  name: string;
  duration: number;
  ok: boolean;
  ts: number;
}

export interface StoredPerf {
  apiRecords: ApiRecord[];
  launchDuration?: number;
  launchTs?: number;
}

let _cache: StoredPerf | null = null;

function load(): StoredPerf {
  if (_cache) return _cache;
  try {
    const val = wx.getStorageSync(STORAGE_KEY) as StoredPerf | undefined;
    if (val && Array.isArray(val.apiRecords)) {
      _cache = val;
      return _cache;
    }
  } catch { /* silent */ }
  _cache = { apiRecords: [] };
  return _cache;
}

function flush(): void {
  if (!_cache) return;
  try {
    wx.setStorage({ key: STORAGE_KEY, data: _cache });
  } catch { /* instrumentation must never break callers */ }
}

export function recordLaunch(duration: number): void {
  const d = load();
  d.launchDuration = duration;
  d.launchTs = Date.now();
  flush();
}

export function recordApi(name: string, duration: number, ok: boolean): void {
  const d = load();
  if (d.apiRecords.length >= MAX_RECORDS) {
    d.apiRecords.splice(0, d.apiRecords.length - MAX_RECORDS + 1);
  }
  d.apiRecords.push({ name, duration, ok, ts: Date.now() });
  flush();
}

export function getPerf(): StoredPerf {
  const d = load();
  return { ...d, apiRecords: d.apiRecords.slice() };
}

export function clearPerf(): void {
  _cache = { apiRecords: [] };
  try {
    wx.removeStorage({ key: STORAGE_KEY });
  } catch { /* silent */ }
}
