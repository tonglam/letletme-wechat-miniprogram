import { graphqlRead } from "./graphql.service";
import type { GraphQLErrorInfo, PageRequestTrace } from "./graphql.service";
import { getPriceChangeBoard } from "./price-change.service";
import { currentMyFplEntryId } from "../utils/follow";
import { formatPrice } from "../utils/fpl";
import {
  formatPredictionPercent,
  isLikelyToChange,
  priceChangeStatusLabel,
  priceChangeStatusTone,
} from "../utils/price-change";
import type { PriceChangePlayer } from "../models/price-change";
import type { GameweekOverallSummary } from "../models/summary";
import type { EntryLeague, HomeH2HMatchup } from "../models/entry";

export const MINI_HOME_PERSONAL_LEAGUES_QUERY = `
  query MiniHomePersonalLeagues {
    homePersonalDesk {
      entryId
      state
      entryName
      playerName
      leagueRanks {
        key
        name
        leagueType
        visibility
        rank
        movement {
          direction
          places
        }
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
    entryId: number;
    state: "READY" | "EMPTY" | "STALE" | "UNAVAILABLE";
    entryName?: string | null;
    playerName?: string | null;
    leagueRanks: Array<{
      key: string;
      name: string;
      leagueType: "CLASSIC" | "H2H";
      visibility?: "PRIVATE" | "PUBLIC" | null;
      rank?: number | null;
      movement?: { direction?: string; places?: number | null } | null;
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
  currentGw = 0,
): Promise<MiniHomePersonalLeaguesResult> {
  const viewerEntryId = currentMyFplEntryId();
  if (!viewerEntryId) {
    throw new Error("请先选择要查看的 FPL 球队");
  }
  const expectedEventId = Number(currentGw);
  const eventCacheScope = Number.isSafeInteger(expectedEventId) && expectedEventId > 0
    ? String(expectedEventId)
    : "auto";
  const result = await graphqlRead<MiniHomePersonalLeaguesResponse>(
    MINI_HOME_PERSONAL_LEAGUES_QUERY,
    {},
    {
      authMode: "session",
      cachePolicy: "reporting",
      // The GraphQL desk resolves H2H against the current event. Keep a
      // separate client cache value per event so a GW1 desk cannot survive
      // the context rollover and appear on the GW2 home page.
      cacheVariant: `home-personal:entry:${viewerEntryId}:event:${eventCacheScope}`,
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
  if (currentMyFplEntryId() !== viewerEntryId) {
    throw new Error("首页查看球队已变化，请刷新后重试");
  }
  const deskEntryId = Number(desk.entryId);
  if (
    !Number.isSafeInteger(deskEntryId)
    || deskEntryId <= 0
    || deskEntryId !== viewerEntryId
  ) {
    throw new Error("首页联赛数据与当前查看球队不一致");
  }
  if (!homePersonalDeskMatchesEvent(desk.leagueRanks || [], expectedEventId)) {
    throw new Error("首页联赛数据与当前比赛轮次不一致");
  }
  const mismatchedViewer = (desk.leagueRanks || []).some((league) => {
    const viewerId = Number(league.h2hMatchup?.viewer?.entryId);
    return Number.isSafeInteger(viewerId)
      && viewerId > 0
      && viewerId !== viewerEntryId;
  });
  if (mismatchedViewer) {
    throw new Error("首页联赛数据与当前查看球队不一致");
  }

  return {
    entryId: deskEntryId,
    entryName: String(desk.entryName || "").trim(),
    playerName: String(desk.playerName || "").trim(),
    leagues: (desk.leagueRanks || []).map((league) => ({
      id: league.key,
      name: league.name,
      rank: league.rank ?? undefined,
      officialKind: "INVITATIONAL",
      type: league.leagueType,
      visibility: league.visibility ?? null,
      tournamentId: league.tournamentId ?? undefined,
      movement: league.movement ?? null,
      h2hMatchup: league.h2hMatchup ?? null,
    })),
  };
}

/** Do not render a cached H2H matchup from a different current gameweek. */
export function homePersonalDeskMatchesEvent(
  leagues: ReadonlyArray<{
    leagueType: string;
    h2hMatchup?: Pick<HomeH2HMatchup, "eventId"> | null;
  }>,
  currentGw: number,
): boolean {
  if (!Number.isSafeInteger(currentGw) || currentGw <= 0) return true;
  return leagues.every((league) => {
    if (String(league.leagueType).toUpperCase() !== "H2H" || !league.h2hMatchup) {
      return true;
    }
    return Number(league.h2hMatchup.eventId) === currentGw;
  });
}

const HOME_TEASER_LIMIT = 5;
const HOME_AVAILABILITY_LIMIT = 5;

// Web parity (GET_HOME_MARKET_DESK): homeMarketDesk serves price changes for
// the latest change date only — the old marketPulse(days: 7) source mixed the
// whole week's change dates into one list. The desk also carries capturedAt
// timestamps and per-section states used by the 更新于 labels and empty copy.
export const MINI_HOME_MARKET_QUERY = `
  query MiniHomeMarket {
    homeMarketDesk {
      revision
      capturedAt
      ownershipState
      ownership {
        period
        date
        coverage {
          status
          requestedDays
          observedDays
          fromDate
          toDate
          missingDates
          capturedAt
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
      priceChangesState
      priceChanges {
        changeDate
        oldPrice
        newPrice
        change
        direction
        player { playerId webName teamShortName position }
      }
      availabilityState
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

interface MarketPriceChange {
  changeDate?: string | null;
  oldPrice?: number | null;
  newPrice?: number | null;
  change?: number | null;
  direction?: string | null;
  player: MarketPlayer;
}

export type HomeMarketSectionState = "AVAILABLE" | "EMPTY" | "UNAVAILABLE";

interface HomeMarketAvailabilityUpdate {
  player: MarketPlayer;
  status?: string;
  previousStatus?: string | null;
  news?: string | null;
}

interface HomeMarketOwnershipMover {
  player: MarketPlayer;
  fromSelectedByPercent?: number;
  toSelectedByPercent?: number;
  changePercentagePoints?: number;
  fromDate?: string;
  toDate?: string;
}

interface MiniHomeMarketResponse {
  homeMarketDesk: {
    revision?: string;
    capturedAt?: string | null;
    ownershipState?: HomeMarketSectionState;
    ownership?: {
      period: "DAILY" | "GAMEWEEK";
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
        capturedAt?: string | null;
      };
      risers?: HomeMarketOwnershipMover[];
      fallers?: HomeMarketOwnershipMover[];
    } | null;
    priceChangesState?: HomeMarketSectionState;
    priceChanges?: MarketPriceChange[];
    availabilityState?: HomeMarketSectionState;
    availabilityUpdates?: HomeMarketAvailabilityUpdate[];
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
  /** Prediction rows only: |progressPercent| capped at 100 for the bar. */
  progressPct?: number;
  /** Prediction rows only: highlighted status pill (web LikelyPlayerRow badge). */
  statusLabel?: string;
  statusTone?: "up" | "down" | "neutral";
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
  /** Raw latest change date (YYYY-MM-DD) — 更新于 fallback when the desk has
      no capturedAt, mirroring the web's todayDescription fallback. */
  priceChangeDate: string;
  priceRisers: HomeMarketMover[];
  priceFallers: HomeMarketMover[];
  /** ISO desk capture time (web LocalUpdatedLabel source for the price and
      availability views). "" when the desk did not report one. */
  capturedAt: string;
  /** ISO ownership coverage capture time; the page falls back to capturedAt. */
  ownershipCapturedAt: string;
  ownershipState: HomeMarketSectionState;
  priceChangesState: HomeMarketSectionState;
  availabilityState: HomeMarketSectionState;
  error: string;
}

export interface MiniHomePricePredictionResult {
  rises: HomeMarketMover[];
  falls: HomeMarketMover[];
  /** Complete signal rows for sharing; the home card uses the capped arrays. */
  allRises: HomeMarketMover[];
  allFalls: HomeMarketMover[];
  /** Total likely signals; the arrays below are capped teaser rows. */
  riseCount: number;
  fallCount: number;
  notice: string;
  /** ISO prediction-board fetch time (web likely-slide LocalUpdatedLabel). */
  fetchedAt: string;
  /** Durable board identity for the live-channel poller (web liveSeed). */
  seed: {
    revision: string;
    deadline: string | null;
    nextDeadlines: string[];
  };
}

const AVAILABILITY_STATUS: Record<string, string> = {
  available: "可出场",
  doubtful: "出场存疑",
  injured: "伤病",
  unavailable: "无法出场",
  suspended: "停赛",
  unknown: "状态已更新",
};

type HomeMarketDeskOwnership = NonNullable<
  MiniHomeMarketResponse["homeMarketDesk"]
>["ownership"];

export function marketCoverageCopy(
  ownership: HomeMarketDeskOwnership,
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

/** Omit missing dream-team stats so the live sheet can tell 0 from unknown. */
function optionalDreamStat<K extends "minutes" | "goalsScored" | "assists" | "cleanSheets" | "bonus">(
  value: number | null | undefined,
  key: K,
): Partial<Record<K, number>> {
  const parsed = Number(value);
  return value === null || value === undefined || !Number.isFinite(parsed)
    ? {}
    : { [key]: parsed } as Partial<Record<K, number>>;
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
  updates: HomeMarketAvailabilityUpdate[],
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

function formatTenthsOrDash(value?: number | null): string {
  return typeof value === "number" && Number.isFinite(value)
    ? formatPrice(value)
    : "—";
}

function mapPriceChanges(
  changes: MarketPriceChange[] | undefined,
): Pick<MiniHomeMarketResult, "priceChangeDate" | "priceRisers" | "priceFallers"> {
  // Web parity: ignore zero-change rows, split by direction, sort by the
  // absolute change size, then cap at the teaser limit.
  const moved = (changes || []).filter(
    (item) => Number(item.change) !== 0 && item.player,
  );
  const rawDate = String(changes?.[0]?.changeDate || "");
  const mapRow = (item: MarketPriceChange): HomeMarketMover => {
    const change = Number(item.change) || 0;
    return {
      id: String(item.player.playerId),
      name: item.player.webName || "-",
      team: item.player.teamShortName || "-",
      position: shortPosition(item.player.position),
      meta: `${formatTenthsOrDash(item.oldPrice)} → ${formatTenthsOrDash(item.newPrice)}`,
      changeText: `${change > 0 ? "+" : "-"}${formatTenthsOrDash(Math.abs(change))}`,
      rising: item.direction === "RISE",
    };
  };
  const byChangeSize = (
    left: MarketPriceChange,
    right: MarketPriceChange,
  ) => Math.abs(Number(right.change) || 0) - Math.abs(Number(left.change) || 0);
  return {
    priceChangeDate: rawDate.slice(0, 10),
    priceRisers: moved
      .filter((item) => item.direction === "RISE")
      .sort(byChangeSize)
      .slice(0, HOME_TEASER_LIMIT)
      .map(mapRow),
    priceFallers: moved
      .filter((item) => item.direction === "FALL")
      .sort(byChangeSize)
      .slice(0, HOME_TEASER_LIMIT)
      .map(mapRow),
  };
}

export async function getMiniHomeMarket(
  forceRefresh = false,
  trace?: PageRequestTrace | null,
): Promise<MiniHomeMarketResult> {
  const result = await graphqlRead<MiniHomeMarketResponse>(
    MINI_HOME_MARKET_QUERY,
    {},
    {
      authMode: "public",
      cachePolicy: "market",
      forceRefresh,
      trace,
    },
  );
  const desk = result.data.homeMarketDesk;
  const ownership = desk?.ownership;
  const availability = mapAvailability(desk?.availabilityUpdates || []);
  const priceDesk = mapPriceChanges(desk?.priceChanges);
  const coverage = marketCoverageCopy(ownership);
  const error = rootError(result.errors, "homeMarketDesk");

  // Do not turn a partial GraphQL response into an apparent empty market. The
  // caller can then retain the last complete market desk while surfacing the
  // refresh error.
  if (error) throw new Error(error);

  const risers = ownership?.risers || [];
  const fallers = ownership?.fallers || [];
  const shared = {
    availability,
    ...priceDesk,
    capturedAt: String(desk?.capturedAt || ""),
    ownershipCapturedAt: String(ownership?.coverage?.capturedAt || ""),
    ownershipState: desk?.ownershipState || "UNAVAILABLE",
    priceChangesState: desk?.priceChangesState || "UNAVAILABLE",
    availabilityState: desk?.availabilityState || "UNAVAILABLE",
    error,
  } as const;

  if (ownership && (risers.length > 0 || fallers.length > 0)) {
    const mapMover = (
      mover: HomeMarketOwnershipMover,
      falling = false,
    ): HomeMarketMover => {
      const change = Number(mover.changePercentagePoints) || 0;
      return {
        id: String(mover.player.playerId),
        name: mover.player.webName || "-",
        team: mover.player.teamShortName || "-",
        position: shortPosition(mover.player.position),
        meta: `${Number(mover.fromSelectedByPercent || 0).toFixed(1)}% → ${Number(mover.toSelectedByPercent || 0).toFixed(1)}%`,
        changeText: `${change > 0 ? "+" : ""}${change.toFixed(1)}%`,
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
      ...shared,
    };
  }

  // The homepage intentionally does not fall back to a rolling period or an
  // all-time ranking when the latest daily ownership comparison is empty.
  return {
    mode: "empty",
    coverage,
    leadTitle: "最新每日持有率变化",
    leadRows: [],
    risers: [],
    fallers: [],
    ...shared,
  };
}

export interface HomePredictionRows {
  rises: HomeMarketMover[];
  falls: HomeMarketMover[];
  /** Complete sorted signal rows; home rendering uses the capped arrays above. */
  allRises: HomeMarketMover[];
  allFalls: HomeMarketMover[];
  /** Total likely signals before the home teaser limit is applied. */
  riseCount: number;
  fallCount: number;
}

/**
 * Rows from any prediction board (durable or live) — web
 * buildHomePriceChangePredictionState parity: likely-to-change only, split by
 * progress sign and sorted by absolute progress. The home card renders the
 * complete allRises/allFalls lists (no teaser cap — vertical scroll handles
 * the length); the capped arrays remain for the explore-style consumers.
 * Status text rides as a highlighted pill
 * (statusLabel/statusTone), mirroring the web LikelyPlayerRow badge.
 */
export function mapHomePredictionRows(board: {
  players?: PriceChangePlayer[];
}): HomePredictionRows {
  const likely = (board.players || []).filter(
    (player) =>
      isLikelyToChange(player) && Number.isFinite(player.progressPercent),
  );
  const byProgress = (left: PriceChangePlayer, right: PriceChangePlayer) =>
    Math.abs(right.progressPercent) - Math.abs(left.progressPercent);
  const mapRow = (player: PriceChangePlayer): HomeMarketMover => ({
    id: String(player.playerId),
    name: player.webName || "-",
    team: player.teamShortName || "-",
    position: shortPosition(player.position),
    meta: formatTenthsOrDash(player.currentPrice),
    changeText: formatPredictionPercent(player.progressPercent),
    rising: player.progressPercent > 0,
    progressPct: Math.min(100, Math.abs(Number(player.progressPercent) || 0)),
    statusLabel: priceChangeStatusLabel(player.status),
    statusTone: priceChangeStatusTone(player.status),
  });
  const rises = likely
    .filter((player) => player.progressPercent > 0)
    .sort(byProgress);
  const falls = likely
    .filter((player) => player.progressPercent < 0)
    .sort(byProgress);
  const riseRows = rises.map(mapRow);
  const fallRows = falls.map(mapRow);
  return {
    rises: riseRows.slice(0, HOME_TEASER_LIMIT),
    falls: fallRows.slice(0, HOME_TEASER_LIMIT),
    allRises: riseRows,
    allFalls: fallRows,
    riseCount: rises.length,
    fallCount: falls.length,
  };
}

export async function getMiniHomePricePredictions(
  forceRefresh = false,
  trace?: PageRequestTrace | null,
): Promise<MiniHomePricePredictionResult> {

  const read = await getPriceChangeBoard(forceRefresh, trace ?? undefined);
  const board = read.board;
  const notice = board.status === "PARTIAL"
    ? "预测数据不完整，仅供参考"
    : board.status === "STALE" || read.cacheStale || read.usedLastGood
      ? "显示为最近一次成功的预测数据"
      : "";
  return {
    ...mapHomePredictionRows(board),
    notice,
    fetchedAt: String(board.fetchedAt || ""),
    // Seed for the live-channel poller (web HomePriceChangeDesk liveSeed).
    seed: {
      revision: board.revision,
      deadline: board.deadline,
      nextDeadlines: board.nextDeadlines || [],
    },
  };
}

export const MINI_HOME_DREAM_TEAM_QUERY = `
  query MiniHomeDreamTeam($eventId: Int!) {
    homeGameweek(eventId: $eventId) {
      gameweekDesk {
        dreamTeam {
          id
          webName
          position
          teamShortName
          totalPoints
          minutes
          goalsScored
          assists
          cleanSheets
          bonus
        }
      }
    }
  }
`;

interface MiniHomeDreamTeamResponse {
  homeGameweek: {
    gameweekDesk?: {
      dreamTeam?: Array<{
        id?: number | null;
        webName?: string | null;
        position?: string | null;
        teamShortName?: string | null;
        totalPoints?: number | null;
        minutes?: number | null;
        goalsScored?: number | null;
        assists?: number | null;
        cleanSheets?: number | null;
        bonus?: number | null;
      }> | null;
    } | null;
  } | null;
}

export interface HomeDreamTeamPlayer {
  id: number;
  name: string;
  team: string;
  position: string;
  points: number;
  minutes?: number;
  goalsScored?: number;
  assists?: number;
  cleanSheets?: number;
  bonus?: number;
}

export interface MiniHomeDreamTeamResult {
  players: HomeDreamTeamPlayer[];
}

export async function getMiniHomeDreamTeam(
  eventId: number,
  forceRefresh = false,
  trace?: PageRequestTrace | null,
): Promise<MiniHomeDreamTeamResult> {
  const result = await graphqlRead<MiniHomeDreamTeamResponse>(
    MINI_HOME_DREAM_TEAM_QUERY,
    { eventId },
    {
      authMode: "public",
      cachePolicy: "market",
      cacheVariant: `dream-team:event:${eventId}`,
      forceRefresh,
      trace,
    },
  );
  const error = rootError(result.errors, "homeGameweek");
  if (error) throw new Error(error);
  return {
    players: (result.data.homeGameweek?.gameweekDesk?.dreamTeam || [])
      .filter((player) => Number.isSafeInteger(Number(player?.id)) && Number(player?.id) > 0)
      .map((player) => ({
        id: Number(player?.id),
        name: String(player?.webName || "-"),
        team: String(player?.teamShortName || "-"),
        position: shortPosition(player?.position || ""),
        points: Number(player?.totalPoints) || 0,
        ...optionalDreamStat(player?.minutes, "minutes"),
        ...optionalDreamStat(player?.goalsScored, "goalsScored"),
        ...optionalDreamStat(player?.assists, "assists"),
        ...optionalDreamStat(player?.cleanSheets, "cleanSheets"),
        ...optionalDreamStat(player?.bonus, "bonus"),
      })),
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
