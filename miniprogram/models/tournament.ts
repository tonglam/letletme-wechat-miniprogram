export interface TournamentOption {
  id: number | string;
  name: string;
  startGw?: number;
  endGw?: number;
}

export interface KnockoutOption extends TournamentOption {
  round?: string;
}

export interface ChampionLeagueOption extends TournamentOption {
  stage?: string;
}

export interface TournamentSelectionPlayer {
  id: number;
  webName: string;
  teamShortName: string;
  position: string;
  selectedByPercent: number;
  eoByPercent?: number;
  transfersEvent?: number;
}

export interface TournamentSelectionStats {
  eventId: number;
  tournamentId: number;
  totalEntries: number;
  mostSelectedPlayers: TournamentSelectionPlayer[];
  captainSelect: TournamentSelectionPlayer[];
  mostTransferIn: TournamentSelectionPlayer[];
  mostTransferOut: TournamentSelectionPlayer[];
}
