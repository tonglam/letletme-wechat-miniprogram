import { getCurrentEventAndDeadline } from "./common.service";
import { getEntryEventResult, getEntryInfo, getEntryLeagueInfo } from "./entry.service";
import { getLiveSnapshot } from "./live.service";
import { getApiSessionToken } from "./auth.service";
import { storageKeys } from "../config/storage-keys";
import type { MyFplContext, MyFplLeagueBrief, MyFplTeamBrief } from "../models/my-fpl";
import type { LiveSnapshotState } from "../models/live";

/**
 * My FPL read composition (high-level design §4.3, plan §5). Everything here
 * is built from existing queries — zero new backend dependencies. Backend-
 * gated read models (myFplOverview aggregate, league associations, settled
 * metadata) replace these compositions when the contract ships (plan §10).
 *
 * Every composition is failure-tolerant: a failing sub-read degrades one
 * part of the view and must never throw away the rest, and nothing here ever
 * touches the follow pointer.
 */

/** Raw shape of the EntryEventResult payload (service returns it untyped). */
interface EntryEventResultPayload {
  eventId?: number | null;
  eventPoints?: number | null;
  overallPoints?: number | null;
  overallRank?: number | null;
}

function pickNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Merge the two overview sub-reads into one brief. Pure and exported for
 * tests: either side may be missing after a partial failure, and the event
 * result wins for points while entry info supplies identity and rank.
 */
export function mergeMyFplTeamBrief(
  entry: { entryName?: string; playerName?: string; overallPoints?: number; overallRank?: number } | null,
  eventResult: EntryEventResultPayload | null
): MyFplTeamBrief | null {
  if (!entry && !eventResult) {
    return null;
  }
  return {
    entryName: entry?.entryName,
    playerName: entry?.playerName,
    eventPoints: pickNumber(eventResult?.eventPoints),
    overallPoints: pickNumber(eventResult?.overallPoints) ?? entry?.overallPoints,
    overallRank: pickNumber(eventResult?.overallRank) ?? entry?.overallRank
  };
}

/**
 * Season/event context plus the local follow pointer and link state. The
 * event read failing leaves the follow/account fields intact — callers can
 * still render principal states.
 */
export async function getMyFplContext(forceRefresh = false): Promise<MyFplContext> {
  let season: string | undefined;
  let currentEvent: number | undefined;
  let nextEvent: number | undefined;
  let utcDeadline: string | undefined;
  try {
    const eventInfo = await getCurrentEventAndDeadline(forceRefresh);
    season = eventInfo.season;
    currentEvent = eventInfo.currentEvent;
    nextEvent = eventInfo.nextEvent;
    utcDeadline = eventInfo.utcDeadline;
  } catch {
    // Degrade to principal-only context; the page shows a data state.
  }

  let entryId: number | undefined;
  try {
    entryId = getApp<IAppOption>().globalData.entryId;
  } catch { /* app not ready */ }
  if (!entryId) {
    try {
      const stored = Number(wx.getStorageSync(storageKeys.entryId));
      entryId = Number.isInteger(stored) && stored > 0 ? stored : undefined;
    } catch { /* storage unavailable */ }
  }

  return {
    season,
    currentEvent,
    nextEvent,
    utcDeadline,
    entryId,
    accountLinked: Boolean(getApiSessionToken())
  };
}

/**
 * Team brief for the overview card. Partial failure returns a partial brief;
 * total failure returns null so the page can keep last-good content.
 */
export async function getMyFplTeamBrief(entryId: number, event: number): Promise<MyFplTeamBrief | null> {
  const [entry, eventResult] = await Promise.all([
    getEntryInfo(entryId).catch(() => null),
    event > 0
      ? getEntryEventResult(entryId, event).then((res) => res as EntryEventResultPayload | null).catch(() => null)
      : Promise.resolve(null)
  ]);
  return mergeMyFplTeamBrief(
    entry ? {
      entryName: entry.entryName,
      playerName: entry.playerName,
      overallPoints: entry.totalPoints,
      overallRank: entry.overallRank
    } : null,
    eventResult
  );
}

/**
 * Official league list. The current contract yields id/name only; gated
 * fields (viewerRank, associationCount) arrive with plan §10 and stay absent
 * until then.
 */
export async function getMyFplLeagues(entryId: number, forceRefresh = false): Promise<MyFplLeagueBrief[]> {
  const leagues = await getEntryLeagueInfo(entryId, forceRefresh);
  return leagues
    .map((league) => ({
      id: Number(league.id),
      name: league.name,
      viewerRank: league.rank
    }))
    .filter((league) => Number.isInteger(league.id) && league.id > 0);
}

/**
 * Lightweight snapshot-state probe for phase derivation. Failure is fine —
 * the phase function has a deadline fallback — so this never throws.
 */
export async function getCurrentSnapshotState(event: number): Promise<LiveSnapshotState | undefined> {
  if (event <= 0) {
    return undefined;
  }
  try {
    const snapshot = await getLiveSnapshot(event);
    return snapshot?.state;
  } catch {
    return undefined;
  }
}
