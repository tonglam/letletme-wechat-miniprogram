const STORAGE_KEY = "perf:v1";
const MAX_RECORDS = 100;

export interface ApiRecord {
  name: string;
  duration: number;
  ok: boolean;
  ts: number;
}

/**
 * Sanitized live-refresh telemetry (high-level design §13 subset).
 * Never carries tokens, email, openid, team names, or entry/competition IDs.
 */
export interface LiveTransitionRecord {
  surface: "entry" | "match" | "tournament";
  season?: string;
  eventId?: number;
  isCurrentEvent?: boolean;
  /** LiveSnapshotStatus.state observed by the probe. */
  snapshotState?: string;
  revisionChanged?: boolean;
  /** LiveDisplayState entered by the page. */
  displayState?: string;
  coverageFailed?: number;
  retainedRowCount?: number;
  probeDurationBucket?: string;
  fullFetchDurationBucket?: string;
  ts: number;
}

export interface StoredPerf {
  apiRecords: ApiRecord[];
  liveTransitions?: LiveTransitionRecord[];
  myFplVisits?: MyFplVisitRecord[];
  competitionVisits?: CompetitionVisitRecord[];
  exploreVisits?: ExploreVisitRecord[];
  launchDuration?: number;
  launchTs?: number;
}

/**
 * Sanitized My FPL telemetry (high-level design §16, plan §9.1). Never
 * carries tokens, email, openid, team/league names, or the follow pointer —
 * entryId is deliberately absent.
 */
export interface MyFplVisitRecord {
  surface: "overview" | "team" | "leagues";
  principalState?: string;
  phase?: string;
  eventId?: number;
  cacheOutcome?: "fresh" | "last-good" | "miss";
  handoffActionType?: string;
  durationBucket?: string;
  ts: number;
}

/**
 * Sanitized Competitions telemetry (high-level design §18, plan §8.1).
 * Competition names and IDs never enter a record; counts are bucketed.
 */
export interface CompetitionVisitRecord {
  surface: "list";
  principalState?: string;
  /** Contract generation serving the surface; "compat" until myCompetitions ships. */
  contractSource: "compat";
  listCountBucket?: "0" | "1" | "2-5" | "6-20" | ">20";
  cacheOutcome?: "fresh" | "last-good" | "miss";
  handoffActionType?: string;
  durationBucket?: string;
  ts: number;
}

/**
 * Sanitized Explore telemetry (explore plan §9). Search text, team names,
 * and player names never enter a record — the high-level design §16 bars
 * full search text, and entity names are identifiers in disguise.
 */
export interface ExploreVisitRecord {
  surface: "overview" | "fixtures";
  /** Contract generation serving the surface; "compat" until exploreOverview ships. */
  contractSource: "compat";
  /** Fixtures window start (gameweek number, not an identity). */
  eventId?: number;
  horizon?: 3 | 5;
  cacheOutcome?: "fresh" | "last-good" | "miss";
  durationBucket?: string;
  ts: number;
}

export function durationBucket(ms: number): string {
  if (ms < 500) return "<500ms";
  if (ms < 1000) return "0.5-1s";
  if (ms < 2000) return "1-2s";
  if (ms < 5000) return "2-5s";
  return ">5s";
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

export function recordLiveTransition(record: Omit<LiveTransitionRecord, "ts">): void {
  const d = load();
  if (!Array.isArray(d.liveTransitions)) {
    d.liveTransitions = [];
  }
  if (d.liveTransitions.length >= MAX_RECORDS) {
    d.liveTransitions.splice(0, d.liveTransitions.length - MAX_RECORDS + 1);
  }
  d.liveTransitions.push({ ...record, ts: Date.now() });
  flush();
}

export function recordMyFplVisit(record: Omit<MyFplVisitRecord, "ts">): void {
  const d = load();
  if (!Array.isArray(d.myFplVisits)) {
    d.myFplVisits = [];
  }
  if (d.myFplVisits.length >= MAX_RECORDS) {
    d.myFplVisits.splice(0, d.myFplVisits.length - MAX_RECORDS + 1);
  }
  d.myFplVisits.push({ ...record, ts: Date.now() });
  flush();
}

export function recordCompetitionVisit(record: Omit<CompetitionVisitRecord, "ts">): void {
  const d = load();
  if (!Array.isArray(d.competitionVisits)) {
    d.competitionVisits = [];
  }
  if (d.competitionVisits.length >= MAX_RECORDS) {
    d.competitionVisits.splice(0, d.competitionVisits.length - MAX_RECORDS + 1);
  }
  d.competitionVisits.push({ ...record, ts: Date.now() });
  flush();
}

export function recordExploreVisit(record: Omit<ExploreVisitRecord, "ts">): void {
  const d = load();
  if (!Array.isArray(d.exploreVisits)) {
    d.exploreVisits = [];
  }
  if (d.exploreVisits.length >= MAX_RECORDS) {
    d.exploreVisits.splice(0, d.exploreVisits.length - MAX_RECORDS + 1);
  }
  d.exploreVisits.push({ ...record, ts: Date.now() });
  flush();
}

export function getPerf(): StoredPerf {
  const d = load();
  return {
    ...d,
    apiRecords: d.apiRecords.slice(),
    liveTransitions: (d.liveTransitions ?? []).slice(),
    myFplVisits: (d.myFplVisits ?? []).slice(),
    competitionVisits: (d.competitionVisits ?? []).slice(),
    exploreVisits: (d.exploreVisits ?? []).slice()
  };
}

export function clearPerf(): void {
  _cache = { apiRecords: [], liveTransitions: [], myFplVisits: [], competitionVisits: [], exploreVisits: [] };
  try {
    wx.removeStorage({ key: STORAGE_KEY });
  } catch { /* silent */ }
}
