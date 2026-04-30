export interface TeamSummary {
  id?: number | string;
  name: string;
  shortName?: string;
  strength?: number;
}

export interface TeamFixture {
  id?: number | string;
  opponent?: string;
  event?: number;
  homeAway?: string;
  difficulty?: number;
}

export interface TeamPlayer {
  element?: number;
  name: string;
  position?: string;
  price?: number;
}
