import { getEntryAllTournaments } from "./tournament.service";
import { adaptEntryTournaments } from "../utils/competition-state";
import type { CompetitionListItem } from "../models/competition";
import type { PageRequestTrace } from "./graphql.service";

/**
 * Competitions read service (plan §5.2). Until the bounded authorized
 * myCompetitions contract ships (plan §9), this is the compatibility
 * composition: the unfiltered legacy read plus the adapter. All identity
 * interpretation stays inside the adapter.
 *
 * Errors propagate — the page keeps same-principal last-good content.
 */
export async function getMyCompetitionsCompat(
  entryId: number,
  forceRefresh = false,
  trace?: PageRequestTrace | null
): Promise<CompetitionListItem[]> {
  const rows = await getEntryAllTournaments(entryId, forceRefresh, trace);
  return adaptEntryTournaments(rows);
}
