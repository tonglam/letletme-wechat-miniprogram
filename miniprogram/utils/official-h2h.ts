/**
 * V2 official H2H publication models and pure presentation helpers.
 *
 * The live contract is publication-scoped: one response contains the
 * tournament head, its independent standings overlay, and every match for
 * the requested event. It never exposes derived winner or match-point fields;
 * those belong to the exact official standings/final-result lane.
 */

export type TournamentDetailKind = "SETUP" | "OFFICIAL_H2H" | "LIVE_POINTS";

export type H2HAvailability = "READY" | "PENDING" | "MISSING" | "ERROR";
export type H2HDeliveryState =
  "FRESH" | "STALE" | "DEGRADED" | "FINAL" | "UNAVAILABLE";

export interface H2HDelivery {
  state: H2HDeliveryState;
  servedFrom:
    | "REDIS_CURRENT"
    | "REDIS_PREVIOUS"
    | "PROCESS_LKG"
    | "POSTGRES_CHECKPOINT"
    | "FINAL_RESULT"
    | "UNAVAILABLE";
  reasonCodes: string[];
}

export interface H2HRevisionVector {
  publicationId: string;
  generation: number;
  roster: string;
  scoreCore: string;
  fixtureIdentity: string;
  entryInputSet: string;
  identity: string;
  officialRank: string | null;
  rules: string;
  algorithm: string;
  content: string;
}

export interface H2HTimes {
  sourceCheckedAt: string;
  contentUpdatedAt: string;
  publishedAt: string;
  checkpointedAt: string | null;
  servedAt: string;
  staleAt: string;
  nextRefreshAt: string | null;
}

export interface H2HMatchSide {
  availability: H2HAvailability;
  entryId: number | null;
  entryName: string;
  playerName: string | null;
  isAverage: boolean;
  points: number | null;
  netPoints: number | null;
}

export interface H2HMatch {
  officialMatchId: number;
  eventId: number;
  groupId: number;
  sourceOrder: number;
  phase: "REGULAR" | "KNOCKOUT";
  knockoutName: string | null;
  tiebreak: string | null;
  isBye: boolean;
  availability: H2HAvailability;
  delivery: H2HDelivery;
  revisions: H2HRevisionVector;
  times: H2HTimes;
  home: H2HMatchSide;
  away: H2HMatchSide;
}

export interface H2HHistoryMatch {
  officialMatchId: number;
  eventId: number;
  groupId: number;
  sourceOrder: number;
  phase: "REGULAR" | "KNOCKOUT";
  knockoutName: string | null;
  tiebreak: string | null;
  isBye: boolean;
  availability: H2HAvailability;
  home: H2HMatchSide;
  away: H2HMatchSide;
}

export interface H2HStanding {
  entryId: number;
  entryName: string;
  playerName: string | null;
  rank: number | null;
  matchPoints: number | null;
  played: number | null;
  won: number | null;
  drawn: number | null;
  lost: number | null;
  pointsFor: number | null;
}

export interface H2HStandings {
  throughEventId: number;
  state: "READY" | "STALE" | "UPDATING" | "UNAVAILABLE";
  sourceCheckedAt: string | null;
  rows: H2HStanding[];
}

export interface H2HBoard {
  eventId: number;
  availability: H2HAvailability;
  delivery: H2HDelivery;
  revisions: H2HRevisionVector | null;
  times: H2HTimes | null;
  standings: H2HStandings | null;
  matches: H2HMatch[];
}

export interface TournamentSetupProgress {
  status?: string | null;
  phase?: string | null;
  completedUnits?: number | null;
  totalUnits?: number | null;
  progressMode?: string | null;
}

export interface TournamentParticipantRow {
  entryId: number;
  entryName?: string | null;
  playerName?: string | null;
}

export const TOURNAMENT_ROSTER_PREVIEW = 20;
export const TOURNAMENT_ROSTER_STEP = 20;

/** The official-sync battle-race tournament kind. */
export function isOfficialH2HTournamentRow(
  row:
    | {
        leagueType?: string | null;
        rosterMode?: string | null;
        groupMode?: string | null;
      }
    | null
    | undefined,
): boolean {
  return Boolean(
    row &&
    row.leagueType === "H2H" &&
    row.rosterMode === "OFFICIAL_SYNC" &&
    row.groupMode === "BATTLE_RACES",
  );
}

function hasRevision(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasCheckedAt(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

/** A board is traceable only when its complete publication has content time. */
export function traceableH2HBoard(board: H2HBoard | null | undefined): boolean {
  return Boolean(
    board &&
    board.availability === "READY" &&
    board.revisions &&
    hasRevision(board.revisions.content) &&
    board.times &&
    hasCheckedAt(board.times.contentUpdatedAt),
  );
}

export function sortH2HStandings(rows: readonly H2HStanding[]): H2HStanding[] {
  return [...rows].sort((left, right) => {
    const leftRank = left.rank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = right.rank ?? Number.MAX_SAFE_INTEGER;
    return (
      leftRank - rightRank ||
      (right.matchPoints ?? 0) - (left.matchPoints ?? 0) ||
      (right.pointsFor ?? 0) - (left.pointsFor ?? 0) ||
      left.entryId - right.entryId
    );
  });
}

/** Remove scores from an unavailable match while retaining its schedule. */
export function scrubUntraceableH2HMatches(
  matches: readonly H2HMatch[],
): H2HMatch[] {
  return matches.map((match) => ({
    ...match,
    home: { ...match.home, points: null, netPoints: null },
    away: { ...match.away, points: null, netPoints: null },
  }));
}

export function shouldShowH2HStandings(
  eventId: number,
  activeEventId?: number | null,
): boolean {
  return activeEventId == null || eventId <= activeEventId;
}

export function h2hScoreStateText(
  availability: H2HAvailability,
  deliveryState?: H2HDeliveryState | null,
): string {
  if (availability === "ERROR" || availability === "MISSING")
    return "暂时不可用";
  if (availability === "PENDING") return "正在获取";
  if (deliveryState === "FINAL") return "已结束";
  if (deliveryState === "STALE" || deliveryState === "DEGRADED")
    return "官方数据延迟";
  return "进行中";
}

export function h2hPhaseLabel(match: {
  phase?: string | null;
  knockoutName?: string | null;
}): string {
  return match.phase === "KNOCKOUT" ? match.knockoutName || "淘汰赛" : "常规赛";
}

export function h2hSideName(side: H2HMatchSide): string {
  return side.isAverage ? "平均队" : side.entryName || "—";
}

export function h2hMatchupStatusText(
  match: {
    eventId: number;
    availability: H2HAvailability;
    delivery?: Pick<H2HDelivery, "state"> | null;
  },
  currentEventId: number | null | undefined,
): "进行中" | "已结束" | "待开始" | "暂时不可用" {
  if (match.availability === "ERROR" || match.availability === "MISSING") {
    return "暂时不可用";
  }
  if (currentEventId != null && match.eventId > currentEventId) {
    return "待开始";
  }
  if (
    match.delivery?.state === "FINAL" ||
    (currentEventId != null && match.eventId < currentEventId)
  ) {
    return "已结束";
  }
  if (match.availability === "PENDING") return "待开始";
  return "进行中";
}

export function tournamentSetupPhaseText(phase?: string | null): string {
  switch (phase) {
    case "SYNCING_ENTRIES":
      return "同步经理数据";
    case "BUILDING_STRUCTURE":
      return "构建赛事结构";
    case "CALCULATING_STANDINGS":
      return "计算积分榜";
    case "ENRICHING_HISTORY":
      return "补充历史分析";
    case "FINALIZING":
      return "最终检查";
    case "READY":
      return "已就绪";
    case "FAILED":
      return "设置失败";
    case "QUEUED":
    default:
      return "排队中";
  }
}

export function isTournamentSetupInFlight(
  setup?: TournamentSetupProgress | null,
): boolean {
  return setup?.status === "PENDING" || setup?.status === "PROCESSING";
}

export function tournamentSetupProgressText(
  setup?: TournamentSetupProgress | null,
): string {
  if (!setup) return "";
  const phase = tournamentSetupPhaseText(setup.phase);
  const completed = Number(setup.completedUnits);
  const total = Number(setup.totalUnits);
  if (
    setup.progressMode !== "INDETERMINATE" &&
    Number.isFinite(completed) &&
    Number.isFinite(total) &&
    total > 0
  ) {
    return `${phase} ${Math.min(completed, total)}/${total}`;
  }
  return phase;
}

export function tournamentGroupModeText(groupMode?: string | null): string {
  if (groupMode === "BATTLE_RACES") return "对战";
  if (groupMode === "POINTS_RACES") return "积分赛";
  return "无小组赛";
}

export const TOURNAMENT_SETUP_PHASES = [
  "SYNCING_ENTRIES",
  "BUILDING_STRUCTURE",
  "CALCULATING_STANDINGS",
  "ENRICHING_HISTORY",
  "FINALIZING",
] as const;

export type TournamentSetupPhaseState = "complete" | "active" | "pending";

export interface TournamentSetupPhaseRow {
  phase: (typeof TOURNAMENT_SETUP_PHASES)[number];
  label: string;
  state: TournamentSetupPhaseState;
  progressText: string;
}

export function tournamentSetupPhaseRows(
  setup?: TournamentSetupProgress | null,
): TournamentSetupPhaseRow[] {
  const phase = setup?.phase || "QUEUED";
  const currentIndex =
    phase === "READY"
      ? TOURNAMENT_SETUP_PHASES.length
      : TOURNAMENT_SETUP_PHASES.findIndex((item) => item === phase);
  const completed = Number(setup?.completedUnits);
  const total = Number(setup?.totalUnits);
  const determinate =
    setup?.progressMode !== "INDETERMINATE" &&
    Number.isFinite(completed) &&
    Number.isFinite(total) &&
    total > 0;
  return TOURNAMENT_SETUP_PHASES.map((item, index) => {
    const complete = currentIndex > index;
    const active =
      currentIndex === index || (phase === "QUEUED" && index === 0);
    let progressText = "";
    if (active && determinate) {
      progressText = `${completed}/${total}`;
    } else if (active && setup?.progressMode === "INDETERMINATE") {
      progressText = "后台仍在继续处理，完成时间暂无法确定。";
    }
    return {
      phase: item,
      label: tournamentSetupPhaseText(item),
      state: complete ? "complete" : active ? "active" : "pending",
      progressText,
    };
  });
}

export function tournamentKnockoutModeText(
  knockoutMode?: string | null,
): string {
  if (knockoutMode === "SINGLE_ELIMINATION") return "单败淘汰";
  if (knockoutMode === "DOUBLE_ELIMINATION") return "主客场制";
  if (knockoutMode === "HEAD_TO_HEAD") return "淘汰赛";
  return "无淘汰赛";
}

export function tournamentHasKnockout(knockoutMode?: string | null): boolean {
  return Boolean(knockoutMode) && knockoutMode !== "NO_KNOCKOUT";
}

export function tournamentLeagueTypeText(leagueType?: string | null): string {
  if (leagueType === "H2H") return "对战";
  if (leagueType === "CLASSIC") return "经典联赛";
  return leagueType || "—";
}

export function tournamentEventRangeText(
  startedEventId?: number | null,
  endedEventId?: number | null,
): string {
  if (startedEventId && endedEventId) {
    return `第 ${startedEventId}–${endedEventId} 轮`;
  }
  return "未安排";
}

export function filterTournamentRoster(
  participants: readonly TournamentParticipantRow[],
  query: string,
): TournamentParticipantRow[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return [...participants];
  return participants.filter((participant) => {
    const name = (participant.entryName || "").toLowerCase();
    const manager = (participant.playerName || "").toLowerCase();
    return (
      name.includes(keyword) ||
      manager.includes(keyword) ||
      String(participant.entryId).includes(keyword)
    );
  });
}

export function visibleTournamentRoster(
  filtered: readonly TournamentParticipantRow[],
  visibleCount: number,
  viewerEntryId?: number | null,
): TournamentParticipantRow[] {
  const top = filtered.slice(0, Math.max(0, visibleCount));
  if (viewerEntryId == null) return top;
  const me = filtered.find(
    (participant) => participant.entryId === viewerEntryId,
  );
  if (!me || top.some((participant) => participant.entryId === me.entryId)) {
    return top;
  }
  return [...top, me];
}
