/**
 * Competition identity and list models (high-level design §5.2, plan §4.1).
 *
 * The full identity contract (kind / rosterBehaviour / format / authority /
 * lifecycle / setup / capabilities) is backend-gated (plan §9). Until it
 * ships, the compatibility adapter over entryTournaments fills what it can
 * and marks everything else UNKNOWN — a neutral "未就绪" display, never a
 * guessed label (MP-C1.4).
 */
export type CompetitionKind = "TRACKED_OFFICIAL_LEAGUE" | "CUSTOM_TOURNAMENT" | "UNKNOWN";

/** Legacy entryTournaments state values plus the unknown fallback. */
export type CompetitionLifecycleCompat = "ACTIVE" | "INACTIVE" | "FINISHED" | "UNKNOWN";

export type CompetitionFormatHint = "POINTS_TABLE" | "KNOCKOUT" | "UNKNOWN";

export interface CompetitionListItem {
  competitionId: number;
  name: string;
  /** Always UNKNOWN from the compatibility adapter; the contract supplies
   * real values once RG-COMPETITION-IDENTITY passes. */
  kind: CompetitionKind;
  lifecycle: CompetitionLifecycleCompat;
  formatHint: CompetitionFormatHint;
  participantCount?: number;
  startedEventId?: number;
  endedEventId?: number;
}

/** Legacy entryTournaments GraphQL row — the adapter's input shape. */
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
  /** Kind detection inputs (web isOfficialH2HTournament needs both). */
  leagueType?: string | null;
  rosterMode?: string | null;
}
