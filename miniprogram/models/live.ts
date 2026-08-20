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
  | "FINALIZED";

export type LiveAuthority = "OFFICIAL_FPL" | "LETLETME_RULES" | "MIXED";

export interface LiveSnapshotStatus {
  eventId: number;
  revision: string;
  state: LiveSnapshotState;
  publishedAt: string;
  checkedAt: string;
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
  partialError?: string;
}

export interface LivePlayerRow {
  element?: number;
  teamId?: number;
  name?: string;
  webName?: string;
  team?: string;
  teamShortName?: string;
  position?: string;
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
  total?: number;
  livePoints?: number;
  liveNetPoints?: number;
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
}

export interface LiveMatch {
  id?: number | string;
  matchId?: number | string;
  homeTeamId?: number;
  awayTeamId?: number;
  status?: string;
  playStatus?: string;
  minutes?: number;
  homeTeam?: string;
  homeTeamName?: string;
  homeTeamShortName?: string;
  homeTeamDataList?: LivePlayerRow[];
  homeTeamManagerData?: LivePlayerRow;
  awayTeam?: string;
  awayTeamName?: string;
  awayTeamShortName?: string;
  awayTeamDataList?: LivePlayerRow[];
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
}

export interface LiveTournamentRowsResult {
  rows: LiveTournamentRow[];
  /** Fetch time when the rows were served from cache; undefined on a fresh network response. */
  servedStoredAt?: number;
}
