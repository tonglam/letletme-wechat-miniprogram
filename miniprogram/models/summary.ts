export interface EntrySeasonSummary {
  entry?: number;
  season?: string;
  totalPoints?: number;
  rank?: number;
}

export interface LeagueSeasonSummary {
  leagueName?: string;
  season?: string;
  rows?: unknown[];
}

export interface GameweekOverallSummary {
  event?: number;
  averageScore?: number;
  highestScore?: number;
  highestScoringEntry?: number;
  transfersMade?: number;
  mostCaptainedPlayer?: SummaryPlayerInfo | null;
  mostViceCaptainedPlayer?: SummaryPlayerInfo | null;
  mostTransferInPlayer?: SummaryPlayerInfo | null;
  mostSelectedPlayer?: SummaryPlayerInfo | null;
  topElementInfo?: SummaryTopElementInfo | null;
  chipPlays?: SummaryChipPlay[];
  dreamTeam?: unknown[];
  elitePlayers?: unknown[];
  transfers?: unknown[];
}

export interface SummaryPlayerInfo {
  id?: number;
  webName?: string;
  teamShortName?: string;
}

export interface SummaryTopElementInfo {
  element?: number;
  points?: number;
  player?: {
    id?: number;
    webName?: string;
    teamShortName?: string;
    team?: {
      name?: string;
      shortName?: string;
    } | null;
  } | null;
  teamShortName?: string;
}

export interface SummaryChipPlay {
  chipName?: string;
  numberPlayed?: number;
}
