/**
 * Official H2H tournament view models and pure presentation logic.
 *
 * Web parity anchors (letletme-web):
 * - lib/tournament/liveTournament.ts isOfficialH2HTournament — kind detection
 *   from list fields: leagueType H2H + rosterMode OFFICIAL_SYNC + groupMode
 *   BATTLE_RACES.
 * - lib/live-manager-score.ts traceableOfficialH2HScore — standings/match
 *   scores only render when the score has a traceable source + revision +
 *   checkedAt; otherwise the table is empty and matches render as VS.
 * - OfficialH2HCompetitionView — standings sort (rank asc, then matchPoints
 *   desc, pointsFor desc, entryId asc), match card labels, awaiting-schedule
 *   card, and the future-GW standings gate
 *   (lib/tournament/official-h2h-presentation.ts).
 * Labels mirror messages/zh-CN.json (LiveTournament / TournamentLifecycle).
 */

export type TournamentDetailKind = "SETUP" | "OFFICIAL_H2H" | "LIVE_POINTS";

export type OfficialH2HScoreSource =
  | "FPL_EVENT_LIVE"
  | "FPL_H2H_FINAL"
  | "UNAVAILABLE";

export interface OfficialH2HMatchSide {
  entryId?: number | null;
  entryName?: string | null;
  playerName?: string | null;
  isAverage?: boolean | null;
  points?: number | null;
  matchPoints?: number | null;
}

export interface OfficialH2HMatch {
  officialMatchId: number;
  eventId: number;
  sourceOrder: number;
  phase?: string | null;
  knockoutName?: string | null;
  isBye?: boolean | null;
  winnerEntryId?: number | null;
  tiebreak?: string | null;
  sourceCheckedAt?: string | null;
  home: OfficialH2HMatchSide;
  away: OfficialH2HMatchSide;
}

export interface OfficialH2HStanding {
  entryId: number;
  entryName?: string | null;
  playerName?: string | null;
  rank?: number | null;
  matchPoints?: number | null;
  played?: number | null;
  won?: number | null;
  drawn?: number | null;
  lost?: number | null;
  pointsFor?: number | null;
}

export interface OfficialH2HBoard {
  eventId: number;
  awaitingSchedule?: boolean | null;
  scoreSource?: string | null;
  scoreRevision?: string | null;
  scoreCheckedAt?: string | null;
  standings?: OfficialH2HStanding[] | null;
  matches?: OfficialH2HMatch[] | null;
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

/** lib/tournament/liveTournament.ts isOfficialH2HTournament. */
export function isOfficialH2HTournamentRow(
  row: {
    leagueType?: string | null;
    rosterMode?: string | null;
    groupMode?: string | null;
  } | null
  | undefined,
): boolean {
  return Boolean(
    row &&
      row.leagueType === "H2H" &&
      row.rosterMode === "OFFICIAL_SYNC" &&
      row.groupMode === "BATTLE_RACES",
  );
}

function hasRevision(value?: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasCheckedAt(value?: string | null): boolean {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

/** lib/live-manager-score.ts traceableOfficialH2HScore. */
export function traceableOfficialH2HBoard(
  board?: Pick<
    OfficialH2HBoard,
    "scoreSource" | "scoreRevision" | "scoreCheckedAt"
  > | null,
): boolean {
  return Boolean(
    board &&
      (board.scoreSource === "FPL_EVENT_LIVE" ||
        board.scoreSource === "FPL_H2H_FINAL") &&
      hasRevision(board.scoreRevision) &&
      hasCheckedAt(board.scoreCheckedAt),
  );
}

/**
 * OfficialH2HCompetitionView standings order: rank asc (unranked last), then
 * matchPoints desc, pointsFor desc, entryId asc.
 */
export function sortOfficialH2HStandings(
  standings: readonly OfficialH2HStanding[],
): OfficialH2HStanding[] {
  return [...standings].sort((left, right) => {
    const leftRank =
      typeof left.rank === "number" && Number.isFinite(left.rank)
        ? left.rank
        : Number.MAX_SAFE_INTEGER;
    const rightRank =
      typeof right.rank === "number" && Number.isFinite(right.rank)
        ? right.rank
        : Number.MAX_SAFE_INTEGER;
    return (
      leftRank - rightRank ||
      (right.matchPoints ?? 0) - (left.matchPoints ?? 0) ||
      (right.pointsFor ?? 0) - (left.pointsFor ?? 0) ||
      left.entryId - right.entryId
    );
  });
}

/** Untraceable scores render as upcoming: no points, no winner. */
export function scrubUntraceableH2HMatches(
  matches: readonly OfficialH2HMatch[],
): OfficialH2HMatch[] {
  return matches.map((match) => ({
    ...match,
    home: { ...match.home, points: null, matchPoints: null },
    away: { ...match.away, points: null, matchPoints: null },
    winnerEntryId: null,
    sourceCheckedAt: null,
  }));
}

/** lib/tournament/official-h2h-presentation.ts shouldShowOfficialH2HStandings. */
export function shouldShowOfficialH2HStandings(
  eventId: number,
  activeEventId?: number | null,
): boolean {
  return activeEventId == null || eventId <= activeEventId;
}

/** Score-source badge text (LiveTournament live/completed/pending). */
export function officialH2HScoreSourceText(
  scoreSource?: string | null,
): string {
  if (scoreSource === "FPL_EVENT_LIVE") return "进行中";
  if (scoreSource === "FPL_H2H_FINAL") return "已结束";
  return "待开始";
}

export function officialH2HPhaseLabel(match: {
  phase?: string | null;
  knockoutName?: string | null;
}): string {
  if (match.phase === "KNOCKOUT") {
    return match.knockoutName || "淘汰赛";
  }
  return "常规赛";
}

/** Average placeholder side in an official schedule (平均队). */
export function officialH2HSideName(side: OfficialH2HMatchSide): string {
  if (side.isAverage) return "平均队";
  return side.entryName || "";
}

/**
 * Web MatchupHistoryBoard status badge: live when the entry desk flags its
 * current event live, finished for past events or a final current one, else
 * upcoming (进行中/已结束/待开始).
 */
export function officialH2HMatchupStatusText(
  match: { eventId: number },
  desk?: {
    eventId?: number | null;
    isLive?: boolean | null;
    isFinal?: boolean | null;
  } | null,
): "进行中" | "已结束" | "待开始" {
  const currentEventId =
    desk && typeof desk.eventId === "number" ? desk.eventId : null;
  if (
    desk?.isLive === true &&
    currentEventId != null &&
    match.eventId === currentEventId
  ) {
    return "进行中";
  }
  if (
    currentEventId != null &&
    (match.eventId < currentEventId ||
      (match.eventId === currentEventId && desk?.isFinal === true))
  ) {
    return "已结束";
  }
  return "待开始";
}

/** TournamentLifecycle phase labels (LC.phase) plus queue/terminal states. */
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

/** Web polls the directory every 5s while setup is in flight. */
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

/** Web TournamentDetailClient SETUP_PHASES order. */
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

/**
 * Web TournamentDetailClient setup checklist: READY counts as past every
 * phase, QUEUED activates the first one, and the active phase carries its
 * completed/total counter unless the backend reports INDETERMINATE progress
 * (then the web shows indeterminateProgress instead).
 */
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

/** LT.gameweekRange 第 {start}–{end} 轮, else 未安排. */
export function tournamentEventRangeText(
  startedEventId?: number | null,
  endedEventId?: number | null,
): string {
  if (startedEventId && endedEventId) {
    return `第 ${startedEventId}–${endedEventId} 轮`;
  }
  return "未安排";
}

/** Roster search: name, manager, or entry id substring (case-insensitive). */
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

/**
 * Visible roster window: top `visibleCount` rows, with the viewer pinned into
 * the window when they would otherwise be cut (web TournamentRosterList).
 */
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
