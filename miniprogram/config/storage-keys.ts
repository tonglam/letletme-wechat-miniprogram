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
  apiProfileFplEntryId: "api-profile-fpl-entry-id",
  apiProfileEmail: "api-profile-email",
  apiProfileV2: "api-profile-v2",
  apiProfileV2Initialized: "api-profile-v2-initialized",
  pendingFollowEntry: "pending-follow-entry-v1",
  pendingEntryChoice: "pending-entry-choice-v1",
  deviceId: "mini-program-device-id",
  graphqlCooldownUntil: "graphql-cooldown-until",
  pendingBugReportDraft: "pending-bug-report-draft",
  lastPriceChangeBoard: "price-change-board:last-good:v1",
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
