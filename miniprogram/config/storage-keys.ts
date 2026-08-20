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
  pendingSessionRevocations: "api-session-revocations",
  apiProfileCheckedAt: "api-profile-checked-at",
  apiProfileEmail: "api-profile-email",
  deviceId: "mini-program-device-id",
  graphqlCooldownUntil: "graphql-cooldown-until",
  pendingBugReportDraft: "pending-bug-report-draft",
  lastPlayerCode: "stat-player",
  lastPlayerSeason: "stat-player-season",
  lastTeamId: "stat-team",
  lastTeamSeason: "stat-team-season"
} as const;

export const storagePrefixes = {
  graphqlCache: "gql:",
  graphqlPublicCache: "gql:v2:public:",
  graphqlSessionCache: "gql:v2:session:"
} as const;
