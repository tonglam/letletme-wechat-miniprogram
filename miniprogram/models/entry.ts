export interface EntrySearchResult {
  entry?: number;
  entryId?: number;
  playerName?: string;
  entryName?: string;
  teamName?: string;
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
  cost?: number;
}

export interface EntryLeague {
  id?: number | string;
  name: string;
  rank?: number;
}
