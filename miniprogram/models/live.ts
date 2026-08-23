export type LiveSnapshotState =
  | "SCHEDULED"
  | "LIVE"
  | "SETTLED"
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
  | "EVENT_SCHEDULED"
  | "BETWEEN_GAMEWEEKS"
  | "OFFSEASON";

export type LiveWindowState =
  | "PRESEASON"
  | "EVENT_SCHEDULED"
  | "LIVE_ACTIVE"
  | "DAY_SETTLING"
  | "BETWEEN_FIXTURES"
  | "GW_REVIEW"
  | "FINALIZED"
  | "BETWEEN_GAMEWEEKS"
  | "OFFSEASON";

export type LiveDataAvailability =
  | "SCHEDULED"
  | "FRESH"
  | "LAST_GOOD"
  | "FINAL"
  | "PARTIAL"
  | "UNAVAILABLE";

export type LiveAuthority = "OFFICIAL_FPL" | "LETLETME_RULES" | "MIXED";

export interface LiveSnapshotStatus {
  eventId: number;
  revision: string | null;
  state: LiveSnapshotState;
  publishedAt: string | null;
  checkedAt: string | null;
  windowState?: LiveWindowState | null;
  dataAvailability?: LiveDataAvailability | null;
  nextRefreshAt?: string | null;
  // Additive shared Live contract fields, present only after the GraphQL
  // contract ships them. Presentation must degrade when they are absent —
  // never invent authority or coverage client-side.
  season?: string;
  authority?: LiveAuthority;
  coverageExpected?: number;
  coverageSucceeded?: number;
  coverageFailed?: number;
  reasonCode?: string | null;
}

export interface LiveSnapshotResult<T> {
  data: T;
  snapshot: LiveSnapshotStatus | null;
  /** Fetch time when the payload was served from the short-lived client cache. */
  servedStoredAt?: number;
  failedEntryIds?: number[];
  unavailableEntryIds?: number[];
  officialCoverage?: number;
  totalEntries?: number;
  partialError?: string;
}

export interface LiveManagerScore {
  eventPoints?: number | null;
  netEventPoints?: number | null;
  totalPoints?: number | null;
  totalScope?: "OVERALL" | "CLASSIC_PHASE" | "UNKNOWN";
  eventRank?: number | null;
  overallRank?: number | null;
  leagueRank?: number | null;
  transferCost?: number;
  source?: string;
  state?: string;
  eventPointSemantics?: string;
  revision?: string | null;
  checkedAt?: string | null;
  upstreamUpdatedAt?: string | null;
  staleAt?: string | null;
  nextRefreshAt?: string | null;
  reconciliation?: string;
  reasonCodes?: string[];
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
  statusText?: string;
  roleText?: string;
  pointsText?: string;
  metaText?: string;
  statusClass?: string;
}

export interface LiveEntryResult {
	availability?: "READY" | "NO_PICKS";
	entry?: number;
	event?: number;
	entryName?: string;
	playerName?: string;
  total?: number;
  livePoints?: number;
  liveNetPoints?: number;
  netPointsKnown?: boolean;
  liveTotalPoints?: number;
  transferCost?: number;
  captainName?: string;
  chip?: string;
  played?: number;
  toPlay?: number;
  players?: LivePlayerRow[];
  pickList?: LivePlayerRow[];
  /** Fetch time when this result was served from cache; undefined on a fresh network response. */
  servedStoredAt?: number;
  score?: LiveManagerScore;
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
  picks?: LivePlayerRow[];
  searchText?: string;
  score?: LiveManagerScore;
}

export interface LiveTournamentRowsResult {
  rows: LiveTournamentRow[];
  /** Fetch time when the rows were served from cache; undefined on a fresh network response. */
  servedStoredAt?: number;
}
