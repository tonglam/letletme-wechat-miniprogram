/**
 * Competition identity and list models (high-level design §5.2, plan §4.1).
 *
 * The participating-tournament directory is a canonical projection. Fields
 * that are not authoritative for this surface remain UNKNOWN rather than
 * being inferred from a different contract.
 */
export type CompetitionKind = "TRACKED_OFFICIAL_LEAGUE" | "CUSTOM_TOURNAMENT" | "UNKNOWN";

export type CompetitionLifecycle = "ACTIVE" | "INACTIVE" | "FINISHED" | "UNKNOWN";

export type CompetitionFormatHint = "POINTS_TABLE" | "KNOCKOUT" | "UNKNOWN";

export interface CompetitionListItem {
  competitionId: number;
  name: string;
  /** UNKNOWN means the directory does not authoritatively expose this field. */
  kind: CompetitionKind;
  lifecycle: CompetitionLifecycle;
  formatHint: CompetitionFormatHint;
  participantCount?: number;
  startedEventId?: number;
  endedEventId?: number;
}

/** Canonical participating-tournament row used by directory projections. */
export interface EntryTournamentRow {
  id: number | string;
  name: string;
  groupMode?: string | null;
  totalTeamNum?: number | null;
  groupStartedEventId?: number | null;
  groupEndedEventId?: number | null;
  state?: string | null;
  knockoutMode?: string | null;
  knockoutStartedEventId?: number | null;
  knockoutEndedEventId?: number | null;
}
