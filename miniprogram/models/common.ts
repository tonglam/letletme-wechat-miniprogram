export interface CurrentEventDeadline {
  season?: string;
  gw?: number;
  event?: number;
  currentEvent?: number;
  nextEvent?: number;
  utcDeadline?: string;
  deadline?: string;
}

export interface Notice {
  title?: string;
  content?: string;
  message?: string;
}

export interface TeamOption {
  id: number | string;
  name: string;
  shortName?: string;
}

export interface GameweekOption {
  value: number;
  label: string;
}

export interface Fixture {
  id?: number | string;
  event?: number;
  homeTeam?: string;
  awayTeam?: string;
  teamId?: number | string;
  againstTeamId?: number | string;
  teamName?: string;
  againstTeamName?: string;
  teamShortName?: string;
  againstTeamShortName?: string;
  kickoffTime?: string;
  started?: boolean;
  minutes?: number;
  homeScore?: number;
  awayScore?: number;
  difficulty?: number;
  homeDifficulty?: number;
  awayDifficulty?: number;
  finished?: boolean;
}
