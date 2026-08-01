export const storageKeys = {
  entryId: "entry",
  selectedLiveTournamentId: "live-tournamentId",
  selectedLiveTournamentName: "live-tournamentName",
  selectedKnockoutId: "live-knockoutId",
  selectedKnockoutName: "live-knockoutName",
  selectedStatLeagueId: "stat-select-id",
  selectedStatLeagueName: "stat-select-name",
  selectedDataSelectionsTournamentId: "data-selections-tournamentId",
  selectedDataSelectionsTournamentName: "data-selections-tournamentName",
  selectedSummaryTournamentId: "summary-tournamentId",
  selectedSummaryTournamentName: "summary-tournamentName",
  apiSessionToken: "api-session-token",
  apiSessionExpiresAt: "api-session-expires-at",
  deviceId: "mini-program-device-id",
  lastPlayerCode: "stat-player",
  lastPlayerSeason: "stat-player-season",
  lastTeamId: "stat-team",
  lastTeamSeason: "stat-team-season"
} as const;

export const storagePrefixes = {
  graphqlCache: "gql:",
  graphqlPublicCache: "gql:public:",
  graphqlSessionCache: "gql:session:"
} as const;
