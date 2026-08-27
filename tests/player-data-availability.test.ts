import type {
  PlayerAvailability,
  PlayerDataSectionAvailability,
  PlayerDataState
} from "../miniprogram/models/player";
import {
  playerDataAvailabilityIssues,
  playerInjuryAvailabilityPresentation
} from "../miniprogram/utils/player-data-availability";

const section = (state: PlayerDataState): PlayerDataSectionAvailability => ({ state });

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

for (const state of ["READY", "EMPTY", "NOT_APPLICABLE"] as const) {
  assertDeepEqual(playerDataAvailabilityIssues({
    isFullyAuthoritative: true,
    market: section(state),
    historicalTeam: section(state),
    fixtures: section(state),
    recentGameweeks: section(state)
  }), [], `${state} is authoritative`);
}

assertDeepEqual(playerDataAvailabilityIssues(undefined), [{
  section: "player",
  sectionLabel: "球员数据",
  state: "UNAVAILABLE",
  stateLabel: "不可用",
  tone: "unavailable"
}], "missing availability fails closed");

assertDeepEqual(
  playerDataAvailabilityIssues({
    isFullyAuthoritative: false,
    market: section("STALE"),
    historicalTeam: section("FALLBACK"),
    fixtures: section("UNAVAILABLE"),
    recentGameweeks: section("EMPTY")
  }).map((issue) => [issue.sectionLabel, issue.stateLabel, issue.tone]),
  [
    ["市场", "已过期", "stale"],
    ["历史球队", "已降级", "fallback"],
    ["赛程", "不可用", "unavailable"]
  ],
  "degraded states remain distinct"
);

assertDeepEqual(playerDataAvailabilityIssues({
      isFullyAuthoritative: false,
      market: section("READY"),
      historicalTeam: section("EMPTY"),
      fixtures: section("NOT_APPLICABLE"),
      recentGameweeks: section("READY")
    }), [{
      section: "player",
      sectionLabel: "球员数据",
      state: "UNAVAILABLE",
      stateLabel: "不可用",
      tone: "unavailable"
    }], "inconsistent aggregate fails closed");

assertDeepEqual(
  playerInjuryAvailabilityPresentation({
    status: "d",
    news: "75% chance of playing",
    stale: true
  } as PlayerAvailability),
  {
    statusLabel: "出场存疑",
    news: "75% chance of playing",
    stale: true
  },
  "injury status remains separate from data authority"
);
