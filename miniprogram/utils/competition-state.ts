import type {
  CompetitionFormatHint,
  CompetitionLifecycleCompat,
  CompetitionListItem,
  EntryTournamentRow
} from "../models/competition";

/**
 * Compatibility adapter (MP-C1.3/1.4): the ONLY place legacy entryTournaments
 * fields are interpreted. Ambiguous input degrades to UNKNOWN — the rest of
 * the client never infers kind, lifecycle, or format from legacy fields.
 */
export type { EntryTournamentRow };

const KNOWN_STATES: ReadonlySet<string> = new Set(["ACTIVE", "INACTIVE", "FINISHED"]);

function adaptLifecycle(state: string | null | undefined): CompetitionLifecycleCompat {
  return state && KNOWN_STATES.has(state) ? (state as CompetitionLifecycleCompat) : "UNKNOWN";
}

function adaptFormatHint(row: EntryTournamentRow): CompetitionFormatHint {
  if (row.groupMode === "POINTS_RACES") {
    return "POINTS_TABLE";
  }
  if (row.knockoutMode && row.knockoutMode !== "NO_KNOCKOUT") {
    return "KNOCKOUT";
  }
  return "UNKNOWN";
}

function pickPositiveInt(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

/** Rows without a usable stable ID are dropped — identity comes first. */
export function adaptEntryTournament(row: EntryTournamentRow): CompetitionListItem | null {
  const id = Number(row.id);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  const hasKnockout = Boolean(row.knockoutMode && row.knockoutMode !== "NO_KNOCKOUT");
  return {
    competitionId: id,
    name: row.name,
    kind: "UNKNOWN",
    lifecycle: adaptLifecycle(row.state),
    formatHint: adaptFormatHint(row),
    participantCount: pickPositiveInt(row.totalTeamNum),
    startedEventId: pickPositiveInt(row.groupStartedEventId) ?? (hasKnockout ? pickPositiveInt(row.knockoutStartedEventId) : undefined),
    endedEventId: pickPositiveInt(row.groupEndedEventId) ?? (hasKnockout ? pickPositiveInt(row.knockoutEndedEventId) : undefined)
  };
}

function relevanceRank(item: CompetitionListItem): number {
  // Conservative relevance until the server-owned ordering contract ships:
  // active first, then upcoming, finished last, unknown in between.
  switch (item.lifecycle) {
    case "ACTIVE": return 0;
    case "INACTIVE": return 1;
    case "UNKNOWN": return 2;
    case "FINISHED": return 3;
  }
}

export function adaptEntryTournaments(rows: EntryTournamentRow[]): CompetitionListItem[] {
  return rows
    .map(adaptEntryTournament)
    .filter((item): item is CompetitionListItem => item !== null)
    .sort((a, b) => relevanceRank(a) - relevanceRank(b) || a.name.localeCompare(b.name, "zh-CN") || a.competitionId - b.competitionId);
}

/** §18 telemetry bucket — raw counts never enter a record. */
export function listCountBucket(count: number): "0" | "1" | "2-5" | "6-20" | ">20" {
  if (count <= 0) return "0";
  if (count === 1) return "1";
  if (count <= 5) return "2-5";
  if (count <= 20) return "6-20";
  return ">20";
}
