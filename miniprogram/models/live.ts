export interface LivePlayerRow {
  element?: number;
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
  saves?: number;
  yellowCards?: number;
  redCards?: number;
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
  eventSummary?: Array<{ label: string; value: string }>;
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
