export type OfficialLeagueKind = "SYSTEM" | "INVITATIONAL" | "PUBLIC";

export type HomeLeagueType = "CLASSIC" | "H2H";

export interface HomeLeaguePreviewInput {
  officialKind?: OfficialLeagueKind | string | null;
  shortName?: string | null;
  type?: HomeLeagueType | string | null;
}

export const HOME_LEAGUE_PAGE_SIZE = 4;

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

export function normalizeHomeLeagueType(
  type?: HomeLeagueType | string | null
): HomeLeagueType {
  return String(type || "").trim().toUpperCase() === "H2H" ? "H2H" : "CLASSIC";
}

/**
 * Home preview: invitational only, then split Classic / H2H in caller order.
 * Missing or unknown type defaults to Classic (most FPL private leagues).
 */
export function partitionHomeEntryLeagues<T extends HomeLeaguePreviewInput>(
  leagues: T[]
): { classic: T[]; h2h: T[] } {
  const classic: T[] = [];
  const h2h: T[] = [];

  for (const league of leagues) {
    if (!isInvitationalLeague(league)) {
      continue;
    }
    if (normalizeHomeLeagueType(league.type) === "H2H") {
      h2h.push(league);
    } else {
      classic.push(league);
    }
  }

  return { classic, h2h };
}

export function pageHomeLeagues<T>(
  leagues: T[],
  visibleCount: number
): { items: T[]; hasMore: boolean; total: number } {
  const total = leagues.length;
  const limit = Math.max(0, visibleCount);
  const items = leagues.slice(0, limit);
  return {
    items,
    hasMore: total > items.length,
    total
  };
}
