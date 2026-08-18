export type OfficialLeagueKind = "SYSTEM" | "INVITATIONAL" | "PUBLIC";

export interface HomeLeaguePreviewInput {
  officialKind?: OfficialLeagueKind | string | null;
  shortName?: string | null;
}

export function isInvitationalLeague(league: HomeLeaguePreviewInput): boolean {
  if (league.officialKind === "INVITATIONAL") {
    return true;
  }
  if (league.officialKind === "SYSTEM" || league.officialKind === "PUBLIC") {
    return false;
  }
  const shortName = league.shortName?.trim();
  return !shortName;
}

/** Home card shows invitational leagues only. Caller must already be in official display order. */
export function selectHomeEntryLeagues<T extends HomeLeaguePreviewInput>(
  leagues: T[],
  limit = 4
): T[] {
  return leagues.filter(isInvitationalLeague).slice(0, limit);
}
