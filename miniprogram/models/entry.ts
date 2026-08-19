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
}

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
}
