export interface TournamentOption {
  id: number | string;
  name: string;
  participantCount?: number;
  startGw?: number;
  endGw?: number;
  /** Kind-detection inputs; only the live-tournament picker populates them. */
  groupMode?: string | null;
  leagueType?: string | null;
  rosterMode?: string | null;
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
  totalEntries: number;
  mostSelectedPlayers: TournamentSelectionPlayer[];
  captainSelect: TournamentSelectionPlayer[];
  mostTransferIn: TournamentSelectionPlayer[];
  mostTransferOut: TournamentSelectionPlayer[];
}
