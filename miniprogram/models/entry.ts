export interface EntrySearchResult {
  entry?: number;
  entryId?: number;
  playerName?: string;
  entryName?: string;
  teamName?: string;
  overallRank?: number;
  totalPoints?: number;
}

export interface EntryInfo {
  entry?: number;
  entryId?: number;
  playerName?: string;
  entryName?: string;
  teamName?: string;
  region?: string;
  overallRank?: number;
  totalPoints?: number;
  totalTransfers?: number;
  bank?: number;
  teamValue?: number;
  lookupStatus?: EntryLookupStatus;
  lookupSource?: EntryLookupSource | null;
  persistenceState?: EntryPersistenceState | null;
}

export type EntryLookupStatus =
  | "FOUND"
  | "NOT_FOUND"
  | "INVALID_ID"
  | "SATURATED"
  | "UNAVAILABLE";

export type EntryLookupSource = "DATABASE" | "FPL";
export type EntryPersistenceState = "NOT_REQUIRED" | "QUEUED" | "FAILED_RETRYABLE";

export interface EntryHistory {
  event?: number;
  points?: number;
  rank?: number;
  overallRank?: number;
}

export interface EntryTransfer {
  event?: number;
  playerIn?: string;
  playerOut?: string;
  elementIn?: number;
  elementOut?: number;
  elementInWebName?: string;
  elementOutWebName?: string;
  elementInTeamShortName?: string;
  elementOutTeamShortName?: string;
  cost?: number;
  time?: string;
}

export interface EntryLeague {
  id?: number | string;
  name: string;
  rank?: number;
  officialKind?: "SYSTEM" | "INVITATIONAL" | "PUBLIC";
  type?: "CLASSIC" | "H2H" | string;
  shortName?: string | null;
  tournamentId?: number;
  h2hMatchup?: HomeH2HMatchup | null;
}

export interface HomeH2HMatchupSide {
  entryId?: number | null;
  entryName?: string | null;
  playerName?: string | null;
  isAverage: boolean;
  points?: number | null;
}

export interface HomeH2HMatchup {
  officialMatchId: number;
  eventId: number;
  isLive: boolean;
  isFinal: boolean;
  isBye: boolean;
  viewer: HomeH2HMatchupSide;
  opponent: HomeH2HMatchupSide;
  sourceCheckedAt?: string | null;
}
