import type {
  PlayerAvailability,
  PlayerDataSectionAvailability,
  PlayerDataState,
  PlayerDetailDataAvailability
} from "../models/player";

export interface PlayerDataAvailabilityIssue {
  section: "market" | "historicalTeam" | "fixtures" | "recentGameweeks" | "player";
  sectionLabel: string;
  state: "STALE" | "FALLBACK" | "UNAVAILABLE";
  stateLabel: string;
  tone: "stale" | "fallback" | "unavailable";
}

export interface PlayerInjuryAvailabilityPresentation {
  statusLabel: string;
  news: string;
  stale: boolean;
}

const AUTHORITATIVE_STATES = new Set<PlayerDataState>([
  "READY",
  "EMPTY",
  "NOT_APPLICABLE"
]);

const SECTION_LABELS = {
  market: "市场",
  historicalTeam: "历史球队",
  fixtures: "赛程",
  recentGameweeks: "近期轮次",
  player: "球员数据"
} as const;

const STATE_LABELS = {
  STALE: "已过期",
  FALLBACK: "已降级",
  UNAVAILABLE: "不可用"
} as const;

const isNonAuthoritative = (
  section: PlayerDataSectionAvailability | null | undefined
): section is PlayerDataSectionAvailability & { state: PlayerDataAvailabilityIssue["state"] } =>
  Boolean(section && !AUTHORITATIVE_STATES.has(section.state));

export function playerDataAvailabilityIssues(
  availability: PlayerDetailDataAvailability | null | undefined
): PlayerDataAvailabilityIssue[] {
  if (!availability) {
    return [{
      section: "player",
      sectionLabel: SECTION_LABELS.player,
      state: "UNAVAILABLE",
      stateLabel: STATE_LABELS.UNAVAILABLE,
      tone: "unavailable"
    }];
  }
  const sections = [
    ["market", availability.market],
    ["historicalTeam", availability.historicalTeam],
    ["fixtures", availability.fixtures],
    ["recentGameweeks", availability.recentGameweeks]
  ] as const;
  const issues: PlayerDataAvailabilityIssue[] = sections
    .filter(
      (entry): entry is readonly [
        Exclude<PlayerDataAvailabilityIssue["section"], "player">,
        PlayerDataSectionAvailability & { state: PlayerDataAvailabilityIssue["state"] }
      ] => isNonAuthoritative(entry[1])
    )
    .map(([section, status]) => ({
      section,
      sectionLabel: SECTION_LABELS[section],
      state: status.state,
      stateLabel: STATE_LABELS[status.state],
      tone: status.state.toLowerCase() as PlayerDataAvailabilityIssue["tone"]
    }));

  if (!availability.isFullyAuthoritative && issues.length === 0) {
    issues.push({
      section: "player",
      sectionLabel: SECTION_LABELS.player,
      state: "UNAVAILABLE",
      stateLabel: STATE_LABELS.UNAVAILABLE,
      tone: "unavailable"
    });
  }
  return issues;
}

const INJURY_STATUS_LABELS: Record<string, string> = {
  a: "可出场",
  d: "出场存疑",
  i: "受伤",
  n: "不在阵容",
  s: "停赛",
  u: "暂不可用"
};

export function playerInjuryAvailabilityPresentation(
  availability: PlayerAvailability | null | undefined
): PlayerInjuryAvailabilityPresentation | null {
  if (!availability) return null;
  const status = String(availability.status || "").trim().toLowerCase();
  return {
    statusLabel: INJURY_STATUS_LABELS[status] ?? (status ? `状态 ${status.toUpperCase()}` : "状态未知"),
    news: String(availability.news || "").trim(),
    stale: availability.stale === true
  };
}
