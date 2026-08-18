import { graphqlRead } from "./graphql.service";
import type { GraphQLErrorInfo, PageRequestTrace } from "./graphql.service";
import type { PlayerValue } from "../models/player";
import type { GameweekOverallSummary } from "../models/summary";

export const MINI_HOME_SUPPLEMENT_QUERY = `
  query MiniHomeSupplement($changeDate: Date!) {
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
    playerValues(changeDate: $changeDate) {
      playerId
      playerName
      teamName
      position
      lastValue
      value
    }
  }
`;

interface MiniHomeSupplementResponse {
  miniProgramNotice: string | null;
  eventOverallResult: GameweekOverallSummary | GameweekOverallSummary[] | null;
  playerValues: PlayerValue[];
}

export interface MiniHomeSupplementResult {
  notice: string;
  summary?: GameweekOverallSummary;
  playerValues: PlayerValue[];
  errors: {
    notice: string;
    summary: string;
    playerValues: string;
  };
}

function normalizeSummary(
  results: MiniHomeSupplementResponse["eventOverallResult"],
  eventId: number
): GameweekOverallSummary | undefined {
  const list = Array.isArray(results) ? results.filter(Boolean) : results ? [results] : [];
  return list.find((result) => Number(result.event) === eventId)
    || list
      .filter((result) => typeof result.event === "number" && Number(result.event) <= eventId)
      .sort((left, right) => Number(right.event || 0) - Number(left.event || 0))[0];
}

function rootError(errors: GraphQLErrorInfo[], root: string): string {
  return errors
    .filter((error) => String(error.path?.[0] || "") === root)
    .map((error) => error.message || "数据加载失败")
    .join("；");
}

function normalizeChangeDate(changeDate: string): string {
  return /^\d{8}$/.test(changeDate)
    ? `${changeDate.slice(0, 4)}-${changeDate.slice(4, 6)}-${changeDate.slice(6, 8)}`
    : changeDate;
}

const HOME_TEASER_LIMIT = 5;
const HOME_AVAILABILITY_LIMIT = 5;

const MINI_HOME_MARKET_QUERY = `
  query MiniHomeMarket($days: Int) {
    marketPulse(days: $days) {
      coverage { observedDays latestDate }
      mostSelected {
        playerId
        webName
        teamShortName
        position
        selectedByPercent
      }
      priceChanges {
        player { playerId webName teamShortName position }
        oldPrice
        newPrice
        change
        direction
      }
      ownershipMovers {
        risers {
          player { playerId webName teamShortName position selectedByPercent }
          previousSelectedByPercent
          selectedByPercent
          change
        }
        fallers {
          player { playerId webName teamShortName position selectedByPercent }
          previousSelectedByPercent
          selectedByPercent
          change
        }
      }
      availabilityUpdates {
        player { playerId webName teamShortName selectedByPercent }
        status
        previousStatus
        news
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
    coverage?: { observedDays?: number; latestDate?: string | null };
    mostSelected?: MarketPlayer[];
    priceChanges?: Array<{
      player: MarketPlayer;
      oldPrice?: number;
      newPrice?: number;
      change?: number;
      direction?: string;
    }>;
    ownershipMovers?: {
      risers?: Array<{
        player: MarketPlayer;
        previousSelectedByPercent?: number;
        selectedByPercent?: number;
        change?: number;
      }>;
      fallers?: Array<{
        player: MarketPlayer;
        previousSelectedByPercent?: number;
        selectedByPercent?: number;
        change?: number;
      }>;
    };
    availabilityUpdates?: Array<{
      player: MarketPlayer;
      status?: string;
      previousStatus?: string | null;
      news?: string | null;
    }>;
  } | null;
}

export type MiniHomeMarketMode = "price" | "ownership" | "selected" | "empty";

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
  unknown: "状态已更新"
};

export function marketCoverageCopy(observedDays = 0): string {
  if (observedDays <= 0) return "首份市场快照尚未采集";
  if (observedDays < 14) return "每日追踪开始以来的早期信号";
  return "最近 14 天最值得关注的信号";
}

function shortPosition(position?: string): string {
  const key = String(position || "").toUpperCase();
  if (key === "GOALKEEPER" || key === "GKP" || key === "GK") return "GKP";
  if (key === "DEFENDER" || key === "DEF") return "DEF";
  if (key === "MIDFIELDER" || key === "MID") return "MID";
  if (key === "FORWARD" || key === "FWD") return "FWD";
  return key || "";
}

function availabilityStatusKey(status?: string): keyof typeof AVAILABILITY_STATUS {
  switch (String(status || "").trim().toLowerCase()) {
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
  const previous = update.previousStatus ? availabilityStatusKey(update.previousStatus) : null;
  if (current === "available" && previous && previous !== "available") {
    return "球员已恢复可用，之前的伤停消息已清除。";
  }
  return AVAILABILITY_STATUS[current];
}

function mapAvailability(
  updates: NonNullable<NonNullable<MiniHomeMarketResponse["marketPulse"]>["availabilityUpdates"]>
): HomeAvailabilityRow[] {
  const preferred = updates.filter((item) => Number(item.player.selectedByPercent) >= 1);
  const rest = updates.filter((item) => Number(item.player.selectedByPercent) < 1);
  return [...preferred, ...rest].slice(0, HOME_AVAILABILITY_LIMIT).map((item) => {
    const statusKey = availabilityStatusKey(item.status);
    return {
      id: String(item.player.playerId),
      name: item.player.webName || "-",
      team: item.player.teamShortName || "-",
      owned: `${Number(item.player.selectedByPercent || 0).toFixed(1)}%`,
      status: AVAILABILITY_STATUS[statusKey],
      statusKey,
      body: availabilityBody(item)
    };
  });
}

export async function getMiniHomeMarket(
  forceRefresh = false,
  trace?: PageRequestTrace | null
): Promise<MiniHomeMarketResult> {
  const result = await graphqlRead<MiniHomeMarketResponse>(
    MINI_HOME_MARKET_QUERY,
    { days: 14 },
    {
      authMode: "public",
      cachePolicy: "market",
      forceRefresh,
      trace
    }
  );
  const pulse = result.data.marketPulse;
  const priceChanges = pulse?.priceChanges || [];
  const risers = pulse?.ownershipMovers?.risers || [];
  const fallers = pulse?.ownershipMovers?.fallers || [];
  const mostSelected = pulse?.mostSelected || [];
  const availability = mapAvailability(pulse?.availabilityUpdates || []);
  const coverage = marketCoverageCopy(Number(pulse?.coverage?.observedDays) || 0);
  const error = rootError(result.errors, "marketPulse");

  if (priceChanges.length > 0) {
    return {
      mode: "price",
      coverage,
      leadTitle: "最新真实身价变化",
      leadRows: priceChanges.slice(0, HOME_TEASER_LIMIT).map((change) => {
        const rising = String(change.direction || "").toUpperCase() === "RISE" || Number(change.change) > 0;
        const delta = Math.abs(Number(change.change) || 0) / 10;
        return {
          id: String(change.player.playerId),
          name: change.player.webName || "-",
          team: change.player.teamShortName || "-",
          position: shortPosition(change.player.position),
          meta: `£${((Number(change.newPrice) || 0) / 10).toFixed(1)}m`,
          changeText: `${rising ? "+" : "-"}£${delta.toFixed(1)}m`,
          rising
        };
      }),
      risers: [],
      fallers: [],
      availability,
      error
    };
  }

  if (risers.length > 0 || fallers.length > 0) {
    const mapMover = (mover: NonNullable<typeof risers>[number], falling = false): HomeMarketMover => ({
      id: String(mover.player.playerId),
      name: mover.player.webName || "-",
      team: mover.player.teamShortName || "-",
      position: shortPosition(mover.player.position),
      meta: `${Number(mover.previousSelectedByPercent || 0).toFixed(1)}% → ${Number(mover.selectedByPercent || 0).toFixed(1)}%`,
      changeText: `${falling ? "" : "+"}${Number(mover.change || 0).toFixed(1)}%`,
      rising: !falling
    });
    return {
      mode: "ownership",
      coverage,
      leadTitle: "持有率变化最大",
      leadRows: [],
      risers: [...risers].sort((a, b) => Number(b.change) - Number(a.change)).slice(0, HOME_TEASER_LIMIT).map((row) => mapMover(row)),
      fallers: [...fallers].sort((a, b) => Number(a.change) - Number(b.change)).slice(0, HOME_TEASER_LIMIT).map((row) => mapMover(row, true)),
      availability,
      error
    };
  }

  if (mostSelected.length > 0) {
    return {
      mode: "selected",
      coverage,
      leadTitle: "持有率最高",
      leadRows: mostSelected.slice(0, HOME_TEASER_LIMIT).map((player) => ({
        id: String(player.playerId),
        name: player.webName || "-",
        team: player.teamShortName || "-",
        position: shortPosition(player.position),
        meta: "",
        changeText: `${Number(player.selectedByPercent || 0).toFixed(1)}%`,
        rising: true
      })),
      risers: [],
      fallers: [],
      availability,
      error
    };
  }

  return {
    mode: "empty",
    coverage,
    leadTitle: "即将开始追踪",
    leadRows: [],
    risers: [],
    fallers: [],
    availability,
    error
  };
}

export async function getMiniHomeSupplement(
  eventId: number,
  changeDate: string,
  forceRefresh = false,
  trace?: PageRequestTrace | null
): Promise<MiniHomeSupplementResult> {
  const result = await graphqlRead<MiniHomeSupplementResponse>(
    MINI_HOME_SUPPLEMENT_QUERY,
    { changeDate: normalizeChangeDate(changeDate) },
    {
      authMode: "public",
      cachePolicy: "market",
      cacheVariant: `event:${eventId}`,
      forceRefresh,
      trace
    }
  );
  return {
    notice: result.data.miniProgramNotice || "",
    summary: normalizeSummary(result.data.eventOverallResult, eventId),
    playerValues: result.data.playerValues || [],
    errors: {
      notice: rootError(result.errors, "miniProgramNotice"),
      summary: rootError(result.errors, "eventOverallResult"),
      playerValues: rootError(result.errors, "playerValues")
    }
  };
}
