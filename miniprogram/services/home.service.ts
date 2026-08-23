import { graphqlRead } from "./graphql.service";
import type { GraphQLErrorInfo, PageRequestTrace } from "./graphql.service";
import { getVerifiedSessionEntryId } from "./auth.service";
import type { GameweekOverallSummary } from "../models/summary";
import type { EntryLeague, HomeH2HMatchup } from "../models/entry";

export const MINI_HOME_PERSONAL_LEAGUES_QUERY = `
  query MiniHomePersonalLeagues {
    homePersonalDesk {
      state
      entryName
      playerName
      leagueRanks {
        key
        name
        leagueType
        rank
        tournamentId
        h2hMatchup {
          officialMatchId
          eventId
          isLive
          isFinal
          isBye
          sourceCheckedAt
          viewer {
            entryId
            entryName
            playerName
            isAverage
            points
          }
          opponent {
            entryId
            entryName
            playerName
            isAverage
            points
          }
        }
      }
    }
  }
`;

interface MiniHomePersonalLeaguesResponse {
  homePersonalDesk: {
    state: "READY" | "EMPTY" | "STALE" | "UNAVAILABLE";
    entryName?: string | null;
    playerName?: string | null;
    leagueRanks: Array<{
      key: string;
      name: string;
      leagueType: "CLASSIC" | "H2H";
      rank?: number | null;
      tournamentId?: number | null;
      h2hMatchup?: HomeH2HMatchup | null;
    }>;
  };
}

export interface MiniHomePersonalLeaguesResult {
  entryId: number;
  entryName: string;
  playerName: string;
  leagues: EntryLeague[];
}

export const MINI_HOME_SUPPLEMENT_QUERY = `
  query MiniHomeSupplement {
    miniProgramNotice
    eventOverallResult {
      event
      averageScore
      highestScore
      highestScoringEntry
      transfersMade
      mostViceCaptainedPlayer { id webName }
      mostTransferInPlayer { id webName }
      mostSelectedPlayer { id webName }
      mostCaptainedPlayer { id webName }
      topElementInfo {
        element
        points
        teamShortName
        player { id webName team { name shortName } }
      }
      chipPlays { chipName numberPlayed }
    }
  }
`;

interface MiniHomeSupplementResponse {
  miniProgramNotice: string | null;
  eventOverallResult: GameweekOverallSummary | GameweekOverallSummary[] | null;
}

export interface MiniHomeSupplementResult {
  notice: string;
  summary?: GameweekOverallSummary;
  errors: {
    notice: string;
    summary: string;
  };
}

function normalizeSummary(
  results: MiniHomeSupplementResponse["eventOverallResult"],
  eventId: number,
): GameweekOverallSummary | undefined {
  const list = Array.isArray(results)
    ? results.filter(Boolean)
    : results
      ? [results]
      : [];
  return (
    list.find((result) => Number(result.event) === eventId) ||
    list
      .filter(
        (result) =>
          typeof result.event === "number" && Number(result.event) <= eventId,
      )
      .sort(
        (left, right) => Number(right.event || 0) - Number(left.event || 0),
      )[0]
  );
}

function rootError(errors: GraphQLErrorInfo[], root: string): string {
  return errors
    .filter((error) => String(error.path?.[0] || "") === root)
    .map((error) => error.message || "数据加载失败")
    .join("；");
}

export async function getMiniHomePersonalLeagues(
  forceRefresh = false,
  trace?: PageRequestTrace | null,
): Promise<MiniHomePersonalLeaguesResult> {
  const verifiedEntryId = getVerifiedSessionEntryId();
  if (!verifiedEntryId) {
    throw new Error("首页账号尚未绑定已验证的 FPL 球队");
  }
  const result = await graphqlRead<MiniHomePersonalLeaguesResponse>(
    MINI_HOME_PERSONAL_LEAGUES_QUERY,
    {},
    {
      authMode: "session",
      cachePolicy: "reporting",
      cacheVariant: `home-personal:entry:${verifiedEntryId}`,
      forceRefresh,
      trace,
    },
  );
  const error = rootError(result.errors, "homePersonalDesk");
  if (error) throw new Error(error);

  const desk = result.data.homePersonalDesk;
  if (!desk || desk.state === "UNAVAILABLE") {
    throw new Error("首页联赛数据暂时不可用");
  }
  // H2H scores are time-sensitive. Never present an explicitly stale desk (or
  // a stale GraphQL cache read) as the current live matchup; the Home caller
  // will fall back to the public league directory instead.
  if (desk.state === "STALE" || result.meta.stale) {
    throw new Error("首页联赛数据已过期");
  }
  if (getVerifiedSessionEntryId() !== verifiedEntryId) {
    throw new Error("首页账号绑定已变化，请刷新后重试");
  }
  const mismatchedViewer = (desk.leagueRanks || []).some((league) => {
    const viewerId = Number(league.h2hMatchup?.viewer?.entryId);
    return Number.isSafeInteger(viewerId)
      && viewerId > 0
      && viewerId !== verifiedEntryId;
  });
  if (mismatchedViewer) {
    throw new Error("首页联赛数据与当前绑定球队不一致");
  }

  return {
    entryId: verifiedEntryId,
    entryName: String(desk.entryName || "").trim(),
    playerName: String(desk.playerName || "").trim(),
    leagues: (desk.leagueRanks || []).map((league) => ({
      id: league.key,
      name: league.name,
      rank: league.rank ?? undefined,
      officialKind: "INVITATIONAL",
      type: league.leagueType,
      tournamentId: league.tournamentId ?? undefined,
      h2hMatchup: league.h2hMatchup ?? null,
    })),
  };
}

const HOME_TEASER_LIMIT = 5;
const HOME_AVAILABILITY_LIMIT = 5;

const MINI_HOME_MARKET_QUERY = `
  query MiniHomeMarket($days: Int) {
    marketPulse(days: $days) {
        availabilityUpdates {
          player { playerId webName teamShortName selectedByPercent }
          status
          previousStatus
          news
        }
    }
    marketOwnershipDay(limit: 5) {
      period
      date
      coverage {
        status
        requestedDays
        observedDays
        fromDate
        toDate
        missingDates
      }
      risers {
        player { playerId webName teamShortName position selectedByPercent }
        fromSelectedByPercent
        toSelectedByPercent
        changePercentagePoints
        fromDate
        toDate
      }
      fallers {
        player { playerId webName teamShortName position selectedByPercent }
        fromSelectedByPercent
        toSelectedByPercent
        changePercentagePoints
        fromDate
        toDate
      }
    }
  }
`;

interface MarketPlayer {
  playerId: number;
  webName?: string;
  teamShortName?: string;
  position?: string;
  selectedByPercent?: number;
}

interface MiniHomeMarketResponse {
  marketPulse: {
    availabilityUpdates?: Array<{
      player: MarketPlayer;
      status?: string;
      previousStatus?: string | null;
      news?: string | null;
    }>;
  } | null;
  marketOwnershipDay: {
    period: "DAILY";
    date?: string | null;
    coverage: {
      status:
        | "READY"
        | "PARTIAL"
        | "NO_DATA"
        | "BASELINE_MISSING"
        | "NO_PREVIOUS_GAMEWEEK"
        | "NO_UPCOMING_GAMEWEEK";
      requestedDays?: number;
      observedDays?: number;
      fromDate?: string | null;
      toDate?: string | null;
      missingDates?: string[];
    };
    risers?: Array<{
      player: MarketPlayer;
      fromSelectedByPercent?: number;
      toSelectedByPercent?: number;
      changePercentagePoints?: number;
      fromDate?: string;
      toDate?: string;
    }>;
    fallers?: Array<{
      player: MarketPlayer;
      fromSelectedByPercent?: number;
      toSelectedByPercent?: number;
      changePercentagePoints?: number;
      fromDate?: string;
      toDate?: string;
    }>;
  } | null;
}

export type MiniHomeMarketMode = "ownership" | "empty";

export interface HomeMarketMover {
  id: string;
  name: string;
  team: string;
  position: string;
  meta: string;
  changeText: string;
  rising: boolean;
}

export interface HomeAvailabilityRow {
  id: string;
  name: string;
  team: string;
  owned: string;
  status: string;
  statusKey: string;
  body: string;
}

export interface MiniHomeMarketResult {
  mode: MiniHomeMarketMode;
  coverage: string;
  leadTitle: string;
  leadRows: HomeMarketMover[];
  risers: HomeMarketMover[];
  fallers: HomeMarketMover[];
  availability: HomeAvailabilityRow[];
  error: string;
}

const AVAILABILITY_STATUS: Record<string, string> = {
  available: "可出场",
  doubtful: "出场存疑",
  injured: "伤病",
  unavailable: "无法出场",
  suspended: "停赛",
  unknown: "状态已更新",
};

export function marketCoverageCopy(
  ownership: MiniHomeMarketResponse["marketOwnershipDay"],
): string {
  const date = ownership?.date ? ` · ${ownership.date}` : "";
  switch (ownership?.coverage?.status) {
    case "READY":
      return `最新每日持有率变化${date}`;
    case "PARTIAL":
      return `每日快照存在缺口${date}`;
    case "BASELINE_MISSING":
      return `每日变化等待前一日基准${date}`;
    case "NO_DATA":
      return `当日无快照${date}`;
    default:
      return "每日持有率变化暂不可用";
  }
}

function shortPosition(position?: string): string {
  const key = String(position || "").toUpperCase();
  if (key === "GOALKEEPER" || key === "GKP" || key === "GK") return "GKP";
  if (key === "DEFENDER" || key === "DEF") return "DEF";
  if (key === "MIDFIELDER" || key === "MID") return "MID";
  if (key === "FORWARD" || key === "FWD") return "FWD";
  return key || "";
}

function availabilityStatusKey(
  status?: string,
): keyof typeof AVAILABILITY_STATUS {
  switch (
    String(status || "")
      .trim()
      .toLowerCase()
  ) {
    case "a":
    case "available":
      return "available";
    case "d":
    case "doubtful":
      return "doubtful";
    case "i":
    case "injured":
      return "injured";
    case "u":
    case "n":
    case "unavailable":
      return "unavailable";
    case "s":
    case "suspended":
      return "suspended";
    default:
      return "unknown";
  }
}

function availabilityBody(update: {
  status?: string;
  previousStatus?: string | null;
  news?: string | null;
}): string {
  const news = String(update.news || "").trim();
  if (news) return news;
  const current = availabilityStatusKey(update.status);
  const previous = update.previousStatus
    ? availabilityStatusKey(update.previousStatus)
    : null;
  if (current === "available" && previous && previous !== "available") {
    return "球员已恢复可用，之前的伤停消息已清除。";
  }
  return AVAILABILITY_STATUS[current];
}

function mapAvailability(
  updates: NonNullable<
    NonNullable<MiniHomeMarketResponse["marketPulse"]>["availabilityUpdates"]
  >,
): HomeAvailabilityRow[] {
  const preferred = updates.filter(
    (item) => Number(item.player.selectedByPercent) >= 1,
  );
  const rest = updates.filter(
    (item) => Number(item.player.selectedByPercent) < 1,
  );
  return [...preferred, ...rest]
    .slice(0, HOME_AVAILABILITY_LIMIT)
    .map((item) => {
      const statusKey = availabilityStatusKey(item.status);
      return {
        id: String(item.player.playerId),
        name: item.player.webName || "-",
        team: item.player.teamShortName || "-",
        owned: `${Number(item.player.selectedByPercent || 0).toFixed(1)}%`,
        status: AVAILABILITY_STATUS[statusKey],
        statusKey,
        body: availabilityBody(item),
      };
    });
}

export async function getMiniHomeMarket(
  forceRefresh = false,
  trace?: PageRequestTrace | null,
): Promise<MiniHomeMarketResult> {
  const result = await graphqlRead<MiniHomeMarketResponse>(
    MINI_HOME_MARKET_QUERY,
    { days: 7 },
    {
      authMode: "public",
      cachePolicy: "market",
      forceRefresh,
      trace,
    },
  );
  const pulse = result.data.marketPulse;
  const ownership = result.data.marketOwnershipDay;
  const availability = mapAvailability(pulse?.availabilityUpdates || []);
  const coverage = marketCoverageCopy(ownership);
  const error = [
    rootError(result.errors, "marketPulse"),
    rootError(result.errors, "marketOwnershipDay"),
  ]
    .filter(Boolean)
    .join("；");

  // Do not turn a partial GraphQL response into an apparent empty market. The
  // caller can then retain the last complete market desk while surfacing the
  // refresh error.
  if (error) throw new Error(error);

  const risers = ownership?.risers || [];
  const fallers = ownership?.fallers || [];

  if (ownership && (risers.length > 0 || fallers.length > 0)) {
    const mapMover = (
      mover: NonNullable<typeof risers>[number],
      falling = false,
    ): HomeMarketMover => {
      const change = Number(mover.changePercentagePoints) || 0;
      return {
        id: String(mover.player.playerId),
        name: mover.player.webName || "-",
        team: mover.player.teamShortName || "-",
        position: shortPosition(mover.player.position),
        meta: `${Number(mover.fromSelectedByPercent || 0).toFixed(1)}% → ${Number(mover.toSelectedByPercent || 0).toFixed(1)}%`,
        changeText: `${change > 0 ? "+" : ""}${change.toFixed(1)} 个百分点`,
        rising: !falling,
      };
    };
    return {
      mode: "ownership",
      coverage,
      leadTitle: "最新每日持有率变化",
      leadRows: [],
      risers: [...risers]
        .sort(
          (a, b) =>
            Number(b.changePercentagePoints) - Number(a.changePercentagePoints),
        )
        .slice(0, HOME_TEASER_LIMIT)
        .map((row) => mapMover(row)),
      fallers: [...fallers]
        .sort(
          (a, b) =>
            Number(a.changePercentagePoints) - Number(b.changePercentagePoints),
        )
        .slice(0, HOME_TEASER_LIMIT)
        .map((row) => mapMover(row, true)),
      availability,
      error,
    };
  }

  // The homepage intentionally does not fall back to a rolling period or an
  // all-time ranking when the latest daily ownership comparison is empty.
  if (ownership) {
    return {
      mode: "empty",
      coverage,
      leadTitle: "最新每日持有率变化",
      leadRows: [],
      risers: [],
      fallers: [],
      availability,
      error,
    };
  }

  return {
    mode: "empty",
    coverage,
    leadTitle: "最新每日持有率变化",
    leadRows: [],
    risers: [],
    fallers: [],
    availability,
    error,
  };
}

export async function getMiniHomeSupplement(
  eventId: number,
  forceRefresh = false,
  trace?: PageRequestTrace | null,
): Promise<MiniHomeSupplementResult> {
  const result = await graphqlRead<MiniHomeSupplementResponse>(
    MINI_HOME_SUPPLEMENT_QUERY,
    {},
    {
      authMode: "public",
      cachePolicy: "market",
      cacheVariant: `event:${eventId}`,
      forceRefresh,
      trace,
    },
  );
  return {
    notice: result.data.miniProgramNotice || "",
    summary: normalizeSummary(result.data.eventOverallResult, eventId),
    errors: {
      notice: rootError(result.errors, "miniProgramNotice"),
      summary: rootError(result.errors, "eventOverallResult"),
    },
  };
}
