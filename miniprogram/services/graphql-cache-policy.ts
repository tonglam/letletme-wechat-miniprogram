export type GraphQLAuthMode = "public" | "session";

export const GRAPHQL_WORKLOADS = [
  "interactive",
  "home",
  "fixtures",
  "market",
  "player-stats",
  "gameweek",
  "public-other",
] as const;
export type GraphQLWorkload = (typeof GRAPHQL_WORKLOADS)[number];

export type GraphQLCachePolicyName =
  | "network-only"
  | "live"
  | "deadline"
  | "reporting"
  | "fixtures"
  | "player-picker"
  | "team-directory"
  | "market"
  | "historical"
  | "notice";

export interface GraphQLCachePolicy {
  freshTtl: number;
  emptyFreshTtl?: number;
  staleTtl: number;
  persist: boolean;
}

export interface GraphQLOperationPolicy {
  authMode: GraphQLAuthMode;
  cachePolicy: GraphQLCachePolicyName;
  workload?: GraphQLWorkload;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const GRAPHQL_CACHE_POLICIES: Record<
  GraphQLCachePolicyName,
  GraphQLCachePolicy
> = {
  "network-only": { freshTtl: 0, staleTtl: 0, persist: false },
  live: { freshTtl: 10 * SECOND, staleTtl: 0, persist: false },
  deadline: { freshTtl: 5 * MINUTE, staleTtl: DAY, persist: true },
  reporting: { freshTtl: 5 * MINUTE, staleTtl: DAY, persist: true },
  fixtures: { freshTtl: 30 * MINUTE, staleTtl: DAY, persist: true },
  "player-picker": {
    freshTtl: 6 * HOUR,
    emptyFreshTtl: MINUTE,
    staleTtl: 7 * DAY,
    persist: true,
  },
  "team-directory": { freshTtl: DAY, staleTtl: 7 * DAY, persist: true },
  market: { freshTtl: 30 * MINUTE, staleTtl: DAY, persist: true },
  historical: { freshTtl: 6 * HOUR, staleTtl: 7 * DAY, persist: true },
  notice: { freshTtl: HOUR, staleTtl: DAY, persist: true },
};

const OPERATION_POLICIES: Record<string, GraphQLOperationPolicy> = {
  CurrentEvent: { authMode: "public", cachePolicy: "deadline" },
  CurrentEventInfo: { authMode: "public", cachePolicy: "deadline" },
  CoreEventFixtureSchedule: { authMode: "public", cachePolicy: "fixtures" },
  FixtureWindow: { authMode: "public", cachePolicy: "fixtures" },
  MiniProgramNotice: { authMode: "public", cachePolicy: "notice" },
  Teams: { authMode: "public", cachePolicy: "team-directory" },
  Team: { authMode: "public", cachePolicy: "team-directory" },
  PlayersForPicker: { authMode: "public", cachePolicy: "player-picker" },
  Player: { authMode: "public", cachePolicy: "reporting" },
  PlayerDetail: { authMode: "public", cachePolicy: "reporting" },
  MiniHomeMarket: { authMode: "public", cachePolicy: "market" },
  MiniMarketPulse: { authMode: "public", cachePolicy: "market" },
  MiniMarketAvailability: { authMode: "public", cachePolicy: "market" },
  GetPriceChangeBoard: { authMode: "public", cachePolicy: "market" },
  GetPriceChangePersonal: { authMode: "session", cachePolicy: "reporting" },
  GetPriceChangeStartPrices: {
    authMode: "public",
    cachePolicy: "player-picker",
  },
  MiniPlayerStatsDesk: { authMode: "public", cachePolicy: "player-picker" },
  TournamentSeasonSnapshot: { authMode: "session", cachePolicy: "reporting" },
  GetPlayerValues: { authMode: "public", cachePolicy: "market" },
  MiniHomeSupplement: { authMode: "public", cachePolicy: "market" },
  MiniHomePersonalLeagues: { authMode: "session", cachePolicy: "reporting" },
  PlayerValues: { authMode: "public", cachePolicy: "market" },
  GetPlayerValueHistory: { authMode: "public", cachePolicy: "historical" },
  PlayerValueHistory: { authMode: "public", cachePolicy: "historical" },
  EventOverallResult: { authMode: "public", cachePolicy: "historical" },
  EventDreamTeam: { authMode: "public", cachePolicy: "historical" },
  EventEliteElements: { authMode: "public", cachePolicy: "historical" },
  EventOverallTransfers: { authMode: "public", cachePolicy: "historical" },
  MiniGameweekSummary: { authMode: "public", cachePolicy: "historical" },
  SummaryPlayerTeams: { authMode: "public", cachePolicy: "historical" },
  GetLiveContext: { authMode: "public", cachePolicy: "live" },
  LiveSnapshotByEvent: { authMode: "public", cachePolicy: "live" },
  LiveMatchday: { authMode: "public", cachePolicy: "live" },
  LiveMatchdayHead: { authMode: "public", cachePolicy: "live" },
  EntryLookup: { authMode: "session", cachePolicy: "reporting" },
  SearchEntries: { authMode: "public", cachePolicy: "reporting" },
  OwnEntry: { authMode: "session", cachePolicy: "reporting" },
  EntryLeagues: { authMode: "session", cachePolicy: "reporting" },
  EntryHistory: { authMode: "session", cachePolicy: "reporting" },
  EntryEventResult: { authMode: "session", cachePolicy: "reporting" },
  GetEntryTransferHistory: { authMode: "session", cachePolicy: "reporting" },
  EntryTransferHistory: { authMode: "session", cachePolicy: "reporting" },
  EntryTournaments: { authMode: "session", cachePolicy: "reporting" },
  TournamentSummary: { authMode: "session", cachePolicy: "reporting" },
  TournamentSelectionStats: { authMode: "session", cachePolicy: "reporting" },
  MyTournamentReviewCatalog: { authMode: "session", cachePolicy: "reporting" },
  MyTournamentGameweekReview: { authMode: "session", cachePolicy: "reporting" },
  MyTournamentSeasonReview: { authMode: "session", cachePolicy: "reporting" },
  MyTournamentSeasonReviewSection: { authMode: "session", cachePolicy: "reporting" },
  CalcLivePointsByEntry: { authMode: "session", cachePolicy: "live" },
  GetEntryLiveCompetitionBoard: {
    authMode: "session",
    cachePolicy: "network-only",
  },
  GetTournamentSelectionIndex: {
    authMode: "session",
    cachePolicy: "network-only",
  },
  GetTournamentEntrySquads: {
    authMode: "session",
    cachePolicy: "network-only",
  },
};

function workloadForCachePolicy(
  operationName: string,
  cachePolicy: GraphQLCachePolicyName,
): GraphQLWorkload {
  if (
    /^myFpl|^entry|^tournament|^competition|^league|^trend/i.test(operationName)
  ) {
    return "interactive";
  }
  switch (cachePolicy) {
    case "fixtures":
      return "fixtures";
    case "market":
      return "market";
    case "player-picker":
    case "team-directory":
      return "player-stats";
    case "live":
    case "historical":
      return "gameweek";
    case "deadline":
    case "notice":
      return "home";
    case "reporting":
      return "interactive";
    default:
      return "public-other";
  }
}

export function getGraphQLWorkload(
  operationName: string,
  cachePolicy?: GraphQLCachePolicyName,
): GraphQLWorkload {
  const configured = OPERATION_POLICIES[operationName];
  if (configured?.workload) return configured.workload;
  return workloadForCachePolicy(
    operationName,
    cachePolicy ?? configured?.cachePolicy ?? "network-only",
  );
}

export function getGraphQLCachePolicy(
  name: GraphQLCachePolicyName,
): GraphQLCachePolicy {
  return GRAPHQL_CACHE_POLICIES[name];
}

export function getGraphQLOperationPolicy(
  operationName: string,
): GraphQLOperationPolicy {
  const configured = OPERATION_POLICIES[operationName] || {
    authMode: "session",
    cachePolicy: "network-only",
  };
  return {
    ...configured,
    workload: getGraphQLWorkload(operationName, configured.cachePolicy),
  };
}
