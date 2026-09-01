export type LiveSnapshotState =
  | "PRE_DEADLINE"
  | "PICKS_WAIT"
  | "PICKS_PROBE"
  | "PICKS_SYNC"
  | "LIVE_ACTIVE"
  | "BETWEEN_FIXTURES"
  | "DAY_SETTLING"
  | "GW_REVIEW"
  | "FINALIZED"
  | "PRESEASON"
  | "BETWEEN_GAMEWEEKS"
  | "OFFSEASON"
  | "UNAVAILABLE";

export type LiveWindowState =
  | "PRESEASON"
  | "PRE_DEADLINE"
  | "LIVE_ACTIVE"
  | "DAY_SETTLING"
  | "BETWEEN_FIXTURES"
  | "GW_REVIEW"
  | "FINALIZED"
  | "BETWEEN_GAMEWEEKS"
  | "OFFSEASON";

export type LiveDataAvailability =
  "FRESH" | "STALE" | "DEGRADED" | "FINAL" | "UNAVAILABLE";

export type LiveScoreSource =
  "FPL_EVENT_LIVE" | "FPL_FINAL_RESULT" | "UNAVAILABLE";

export type LiveDeliveryState =
  "FRESH" | "STALE" | "DEGRADED" | "FINAL" | "UNAVAILABLE";

export type LiveServedFrom =
  | "REDIS_CURRENT"
  | "REDIS_PREVIOUS"
  | "PROCESS_LKG"
  | "POSTGRES_CHECKPOINT"
  | "FINAL_RESULT"
  | "UNAVAILABLE";

export interface LiveRevisionVector {
  publicationId: string;
  generation: number;
  lifecycle: string;
  fixtureIdentity: string;
  scoreCore: string;
  displayStats: string;
  explain: string;
  picksBase: string | null;
  officialAdjustment: string | null;
  previousTotals: string | null;
  finalResult: string | null;
  rules: string;
  algorithm: string;
  input: string;
}

export interface LiveTimes {
  sourceCheckedAt: string;
  contentUpdatedAt: string;
  publishedAt: string;
  checkpointedAt: string | null;
  servedAt: string;
  staleAt: string;
  nextRefreshAt: string | null;
}

export interface LiveDelivery {
  state: LiveDeliveryState;
  servedFrom: LiveServedFrom;
  reasonCodes: string[];
}

export interface LiveScore {
  eventPoints: number;
  netEventPoints: number;
  totalPoints: number | null;
  totalScope: "OVERALL" | "UNKNOWN";
  transferCost: number;
  source: LiveScoreSource;
  calculationMode: "PROJECTED_AUTOSUBS" | "FINAL_RESULT";
  revisions: LiveRevisionVector;
  times: LiveTimes;
  delivery: LiveDelivery;
}

export interface LiveSnapshotStatus {
  season: string;
  eventId: number;
  state: LiveSnapshotState;
  publishedAt: string | null;
  sourceCheckedAt: string | null;
  contentUpdatedAt?: string | null;
  scoreCoreRevision: string | null;
  publicationId?: string | null;
  revisions?: LiveRevisionVector | null;
  times?: LiveTimes | null;
  delivery?: LiveDelivery | null;
  windowState?: LiveWindowState | null;
  dataAvailability?: LiveDataAvailability | null;
  nextRefreshAt?: string | null;
}

export type LiveMatchdayState =
  | "PRE_DEADLINE"
  | "LIVE_ACTIVE"
  | "BETWEEN_FIXTURES"
  | "DAY_SETTLING"
  | "GW_REVIEW"
  | "FINALIZED";

export type LiveMatchdayDeliveryState = LiveDeliveryState | "PENDING";

export interface LiveMatchdayDelivery {
  state: LiveMatchdayDeliveryState;
  servedFrom: Exclude<LiveServedFrom, "FINAL_RESULT" | "UNAVAILABLE"> | null;
  reasonCodes: string[];
}

export interface LiveMatchdayRevisionVector {
  deskPublicationId: string;
  deskGeneration: number;
  lifecycle: string;
  fixtureIdentity: string;
  scoreState: string;
  /** Descriptor-only detail token returned by HEAD; FULL also carries the verified revision. */
  detailObservation: string | null;
  detailPublicationId: string | null;
  detailGeneration: number | null;
  playerDetail: string | null;
}

export interface LiveMatchdayTimes {
  deskSourceCheckedAt: string;
  deskContentUpdatedAt: string;
  deskPublishedAt: string;
  deskStaleAt: string | null;
  detailSourceCheckedAt: string | null;
  detailContentUpdatedAt: string | null;
  detailPublishedAt: string | null;
  detailStaleAt: string | null;
  servedAt: string;
  nextRefreshAt: string | null;
}

export interface LiveMatchdayStatus {
  season: string;
  eventId: number;
  state: LiveMatchdayState;
  revisions: LiveMatchdayRevisionVector;
  times: LiveMatchdayTimes;
  availability: "READY" | "UNAVAILABLE";
  delivery: LiveMatchdayDelivery;
  detailDelivery: LiveMatchdayDelivery;
}

export interface LiveSnapshotResult<T, S = LiveSnapshotStatus> {
  data: T;
  snapshot: S | null;
  /** Fetch time when the payload was served from the short-lived client cache. */
  servedStoredAt?: number;
  failedEntryIds?: number[];
  unavailableEntryIds?: number[];
  officialCoverage?: number;
  /** Traceable rows before any client-side search narrows the returned data. */
  traceableEntries?: number;
  /** Traceable score states before any client-side search narrows the rows. */
  traceableScoreStates?: LiveDeliveryState[];
  totalEntries?: number;
  partialError?: string;
}

export type LiveEntryAvailability =
  "READY" | "PENDING" | "NO_PICKS" | "UNAVAILABLE";

export interface LivePlayerStatPoints {
  awardedPoints: number;
}

export interface LivePlayerRow {
  element?: number;
  teamId?: number;
  name?: string;
  webName?: string;
  team?: string;
  teamShortName?: string;
  position?: string;
  /** Official FPL pick slot: 1–11 starters, 12–15 bench. */
  squadPosition?: number;
  elementType?: number;
  elementTypeName?: string;
  points?: number;
  livePoints?: number;
  totalPoints?: number;
  bonus?: number;
  bps?: number;
  multiplier?: number;
  captain?: boolean;
  viceCaptain?: boolean;
  /** Raw pick flags (captain = original armband, before any auto-captain promotion). */
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  pickActive?: boolean;
  autoSub?: boolean;
  playStatus?: number;
  minutes?: number;
  goalsScored?: number;
  assists?: number;
  cleanSheets?: number;
  goalsConceded?: number;
  saves?: number;
  yellowCards?: number;
  redCards?: number;
  defensiveContribution?: number;
  ownGoals?: number;
  penaltiesSaved?: number;
  penaltiesMissed?: number;
  /** GW fixture lifecycle flags from the calc pipeline (auto-sub projection). */
  isGwStarted?: boolean;
  isGwFinished?: boolean;
  isPlayed?: boolean;
  bgw?: boolean;
  starts?: boolean;
  expectedGoals?: number;
  expectedAssists?: number;
  expectedGoalInvolvements?: number;
  expectedGoalsConceded?: number;
  /** Authoritative per-stat points from the live-match publication. */
  statPoints?: Record<string, LivePlayerStatPoints>;
  /** Auto-sub annotation: OFFICIAL_IN/OUT or PREDICTED_IN/OUT, plus partner. */
  autoSubRole?: string;
  autoSubPartnerName?: string;
  /** Badge display parts derived from autoSubRole (WXML has no string methods). */
  autoSubArrow?: "" | "↑" | "↓";
  autoSubIncoming?: boolean;
  autoSubPredicted?: boolean;
  statusText?: string;
  roleText?: string;
  pointsText?: string;
  metaText?: string;
  statusClass?: string;
}

export interface LiveEntryResult {
  availability?: LiveEntryAvailability;
  entry?: number;
  event?: number;
  entryName?: string;
  playerName?: string;
  region?: string | null;
  startedEvent?: number | null;
  value?: number | null;
  bank?: number | null;
  teamValue?: number | null;
  totalTransfers?: number | null;
  lastValue?: number | null;
  playedCaptain?: number | null;
  activeCaptain?: { id: number; name: string; points: number } | null;
  total?: number;
  livePoints?: number;
  liveNetPoints?: number;
  netPointsKnown?: boolean;
  liveTotalPoints?: number;
  transferCost?: number;
  /** Retry metadata retained even when an untraceable score payload is rejected. */
  scoreNextRefreshAt?: string;
  captainName?: string;
  chip?: string;
  played?: number;
  toPlay?: number;
  players?: LivePlayerRow[];
  pickList?: LivePlayerRow[];
  /** Fetch time when this result was served from cache; undefined on a fresh network response. */
  servedStoredAt?: number;
  score?: LiveScore;
}

export interface LiveMatch {
  id?: number | string;
  matchId?: number | string;
  homeTeamId?: number;
  awayTeamId?: number;
  status?: string;
  playStatus?: string;
  /** The fixture has provisional completion data, but FPL has not finalized it. */
  provisional?: boolean;
  minutes?: number;
  homeTeam?: string;
  homeTeamName?: string;
  homeTeamShortName?: string;
  homeTeamDataList?: LivePlayerRow[];
  /** Non-zero live rows prepared for the match detail panel. */
  homeMatchPlayers?: LivePlayerRow[];
  homeTeamManagerData?: LivePlayerRow;
  awayTeam?: string;
  awayTeamName?: string;
  awayTeamShortName?: string;
  awayTeamDataList?: LivePlayerRow[];
  /** Non-zero live rows prepared for the match detail panel. */
  awayMatchPlayers?: LivePlayerRow[];
  awayTeamManagerData?: LivePlayerRow;
  homeScore?: number;
  awayScore?: number;
  kickoffTime?: string;
  statusText?: string;
  statusClass?: string;
  scoreText?: string;
  kickoffText?: string;
  minuteText?: string;
  homeTeamDisplay?: string;
  awayTeamDisplay?: string;
  eventSummary?: Array<{
    kind: string;
    label: string;
    items: Array<{ name: string; team: string; text: string }>;
  }>;
}

export interface LiveTournamentRow {
  availability?: "READY" | "MISSING";
  entry?: number;
  entryName?: string;
  playerName?: string;
  livePoints?: number;
  liveNetPoints?: number;
  liveTotalPoints?: number;
  totalPoints?: number;
  transferCost?: number;
  captainName?: string;
  chip?: string;
  played?: number;
  toPlay?: number;
  rank?: number;
  overallRank?: number;
  /** FPL tenths (1015 = £101.5m); present on the live-board pipeline. */
  teamValue?: number;
  /** Effective captain's live points (server value, or derived from picks). */
  captainPoints?: number;
  picks?: LivePlayerRow[];
  searchText?: string;
  score?: LiveScore;
  /** Retry metadata retained even when an untraceable score payload is rejected. */
  scoreNextRefreshAt?: string;
}

export interface LiveTournamentRowsResult {
  rows: LiveTournamentRow[];
  /** Fetch time when the rows were served from cache; undefined on a fresh network response. */
  servedStoredAt?: number;
}
