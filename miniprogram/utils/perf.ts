const STORAGE_KEY = "perf:v1";
const MAX_API_RECORDS = 300;
const MAX_RECORDS = 100;

export type ApiRecordSource =
  | "network"
  | "memory"
  | "storage"
  | "in-flight"
  | "stale";

export interface ApiRecord {
  name: string;
  operationName?: string;
  duration: number;
  ok: boolean;
  source?: ApiRecordSource;
  networkAttempted?: boolean;
  cacheAgeBucket?: string;
  ts: number;
}

export interface ApiRecordDetails {
  operationName?: string;
  source?: ApiRecordSource;
  networkAttempted?: boolean;
  cacheAgeBucket?: string;
}

export interface LiveTransitionRecord {
  surface: "entry" | "match" | "tournament";
  season?: string;
  eventId?: number;
  isCurrentEvent?: boolean;
  snapshotState?: string;
  revisionChanged?: boolean;
  displayState?: string;
  coverageFailed?: number;
  retainedRowCount?: number;
  probeDurationBucket?: string;
  fullFetchDurationBucket?: string;
  ts: number;
}

export interface RenderCommitRecord {
  surface: "home-fixtures";
  itemCount: number;
  duration: number;
  ts: number;
}

export interface StoredPerf {
  apiRecords: ApiRecord[];
  renderCommits?: RenderCommitRecord[];
  liveTransitions?: LiveTransitionRecord[];
  myFplVisits?: MyFplVisitRecord[];
  competitionVisits?: CompetitionVisitRecord[];
  exploreVisits?: ExploreVisitRecord[];
  launchDuration?: number;
  launchTs?: number;
}

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

export interface CompetitionVisitRecord {
  surface: "list";
  principalState?: string;
  contractSource: "compat";
  listCountBucket?: "0" | "1" | "2-5" | "6-20" | ">20";
  cacheOutcome?: "fresh" | "last-good" | "miss";
  handoffActionType?: string;
  durationBucket?: string;
  ts: number;
}

export interface ExploreVisitRecord {
  surface: "overview" | "fixtures";
  contractSource: "compat";
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
  } catch {}
  _cache = { apiRecords: [] };
  return _cache;
}

function flush(): void {
  if (!_cache) return;
  try {
    wx.setStorage({ key: STORAGE_KEY, data: _cache });
  } catch {}
}

export function recordLaunch(duration: number): void {
  const data = load();
  data.launchDuration = duration;
  data.launchTs = Date.now();
  flush();
}

export function recordApi(
  name: string,
  duration: number,
  ok: boolean,
  details: ApiRecordDetails = {}
): void {
  const data = load();
  if (data.apiRecords.length >= MAX_API_RECORDS) {
    data.apiRecords.splice(0, data.apiRecords.length - MAX_API_RECORDS + 1);
  }
  data.apiRecords.push({
    name,
    operationName: details.operationName || name,
    duration,
    ok,
    source: details.source,
    networkAttempted: details.networkAttempted,
    cacheAgeBucket: details.cacheAgeBucket,
    ts: Date.now()
  });
  flush();
}

export function recordRenderCommit(record: Omit<RenderCommitRecord, "ts">): void {
  const data = load();
  if (!Array.isArray(data.renderCommits)) data.renderCommits = [];
  if (data.renderCommits.length >= MAX_RECORDS) {
    data.renderCommits.splice(0, data.renderCommits.length - MAX_RECORDS + 1);
  }
  data.renderCommits.push({ ...record, ts: Date.now() });
  flush();
}

export function recordLiveTransition(record: Omit<LiveTransitionRecord, "ts">): void {
  const data = load();
  if (!Array.isArray(data.liveTransitions)) data.liveTransitions = [];
  if (data.liveTransitions.length >= MAX_RECORDS) {
    data.liveTransitions.splice(0, data.liveTransitions.length - MAX_RECORDS + 1);
  }
  data.liveTransitions.push({ ...record, ts: Date.now() });
  flush();
}

export function recordMyFplVisit(record: Omit<MyFplVisitRecord, "ts">): void {
  const data = load();
  if (!Array.isArray(data.myFplVisits)) data.myFplVisits = [];
  if (data.myFplVisits.length >= MAX_RECORDS) {
    data.myFplVisits.splice(0, data.myFplVisits.length - MAX_RECORDS + 1);
  }
  data.myFplVisits.push({ ...record, ts: Date.now() });
  flush();
}

export function recordCompetitionVisit(record: Omit<CompetitionVisitRecord, "ts">): void {
  const data = load();
  if (!Array.isArray(data.competitionVisits)) data.competitionVisits = [];
  if (data.competitionVisits.length >= MAX_RECORDS) {
    data.competitionVisits.splice(0, data.competitionVisits.length - MAX_RECORDS + 1);
  }
  data.competitionVisits.push({ ...record, ts: Date.now() });
  flush();
}

export function recordExploreVisit(record: Omit<ExploreVisitRecord, "ts">): void {
  const data = load();
  if (!Array.isArray(data.exploreVisits)) data.exploreVisits = [];
  if (data.exploreVisits.length >= MAX_RECORDS) {
    data.exploreVisits.splice(0, data.exploreVisits.length - MAX_RECORDS + 1);
  }
  data.exploreVisits.push({ ...record, ts: Date.now() });
  flush();
}

export function getPerf(): StoredPerf {
  const data = load();
  return {
    ...data,
    apiRecords: data.apiRecords.slice(),
    renderCommits: (data.renderCommits ?? []).slice(),
    liveTransitions: (data.liveTransitions ?? []).slice(),
    myFplVisits: (data.myFplVisits ?? []).slice(),
    competitionVisits: (data.competitionVisits ?? []).slice(),
    exploreVisits: (data.exploreVisits ?? []).slice()
  };
}

export function clearPerf(): void {
  _cache = {
    apiRecords: [],
    renderCommits: [],
    liveTransitions: [],
    myFplVisits: [],
    competitionVisits: [],
    exploreVisits: []
  };
  try {
    wx.removeStorage({ key: STORAGE_KEY });
  } catch {}
}
