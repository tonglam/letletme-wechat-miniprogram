import { graphqlRequest, type PageRequestTrace } from "./graphql.service";
import type {
  PlayerDetail,
  PlayerFilterRow,
  PlayerOption,
} from "../models/player";
import { formatPrice } from "../utils/fpl";

export const PLAYERS_FOR_PICKER_QUERY = `
  query PlayersForPicker(
    $search: String
    $filter: PlayersFilter
    $sort: PlayerPickerSort
    $ownershipBand: PlayerPickerOwnershipBand
    $limit: Int!
    $cursor: Int
  ) {
    playersForPicker(
      search: $search
      filter: $filter
      sort: $sort
      ownershipBand: $ownershipBand
      limit: $limit
      cursor: $cursor
    ) {
      items {
        id
        webName
        team { name shortName }
        position
        price
        selectedByPercent
        totalPoints
        form
      }
      nextCursor
      totalCount
    }
  }
`;

// The production GraphQL complexity budget rejects the 50-row shape of this
// query. Keep pagination intact while staying below that budget.
export const PLAYER_PICKER_PAGE_LIMIT = 40;

export const PLAYER_DETAIL = `
  query PlayerDetail($playerId: Int!, $eventId: Int!) {
    playerDetail(playerId: $playerId, eventId: $eventId) {
      id
      webName
      teamShortName
      elementType
      elementTypeName
      price
      startPrice
      injuryAvailability {
        status
        news
        newsAdded
        observedDate
        capturedAt
        chanceOfPlayingThisRound
        chanceOfPlayingNextRound
        stale
      }
      dataAvailability {
        isFullyAuthoritative
		seasonStats { state reasonCode revision sourceCheckedAt }
        market { state reasonCode revision sourceCheckedAt }
        historicalTeam { state reasonCode revision sourceCheckedAt }
        fixtures { state reasonCode revision sourceCheckedAt }
        recentGameweeks { state reasonCode revision sourceCheckedAt }
      }
      totalPoints
      selectedByPercent
      form
      transfersInEvent
      transfersOutEvent
      seasonTransfersIn
      seasonTransfersOut
      eventPoints
      minutes
      goalsScored
      assists
      cleanSheets
      goalsConceded
      saves
      bonus
      bps
      yellowCards
      redCards
      influence
      creativity
      threat
      ictIndex
    }
  }
`;

interface GraphQLPickerPlayer {
  id: number;
  webName: string;
  team: { name: string; shortName: string };
  position: string;
  price: number;
  selectedByPercent?: number | null;
  totalPoints?: number | null;
  form?: number | null;
}

interface PlayersForPickerResponse {
  playersForPicker: {
    items: GraphQLPickerPlayer[];
    nextCursor: number | null;
    totalCount: number;
  };
}

interface PlayerDetailResponse {
  playerDetail: {
    id: number;
    webName: string;
    teamShortName: string;
    elementType: number;
    elementTypeName: string;
    price: number;
    startPrice: number | null;
    injuryAvailability: PlayerDetail["injuryAvailability"];
    dataAvailability: PlayerDetail["dataAvailability"];
    totalPoints: number;
    selectedByPercent?: number | null;
    form?: number | null;
    transfersInEvent: number;
    transfersOutEvent: number;
    seasonTransfersIn: number;
    seasonTransfersOut: number;
    eventPoints?: number | null;
    minutes?: number | null;
    goalsScored?: number | null;
    assists?: number | null;
    cleanSheets?: number | null;
    goalsConceded?: number | null;
    saves?: number | null;
    bonus?: number | null;
    bps?: number | null;
    yellowCards?: number | null;
    redCards?: number | null;
    influence?: number | null;
    creativity?: number | null;
    threat?: number | null;
    ictIndex?: number | null;
  } | null;
}

const CLIENT_STALE_CACHE_REASON = "CLIENT_STALE_CACHE";

function stalePlayerDataSection(
  section: PlayerDetail["dataAvailability"]["market"],
): PlayerDetail["dataAvailability"]["market"] {
  if (section.state !== "READY" && section.state !== "EMPTY") return section;
  return {
    ...section,
    state: "STALE",
    reasonCode: CLIENT_STALE_CACHE_REASON,
  };
}

/** Preserve the cached payload while making its client-side staleness explicit. */
export function downgradeStalePlayerDetailResponse(
  data: PlayerDetailResponse,
): PlayerDetailResponse {
  const player = data.playerDetail;
  if (!player) return data;
  const availability = player.dataAvailability;
  return {
    ...data,
    playerDetail: {
      ...player,
      injuryAvailability: player.injuryAvailability
        ? { ...player.injuryAvailability, stale: true }
        : null,
      dataAvailability: {
        isFullyAuthoritative: false,
        seasonStats: stalePlayerDataSection(availability.seasonStats),
        market: stalePlayerDataSection(availability.market),
        historicalTeam: stalePlayerDataSection(availability.historicalTeam),
        fixtures: stalePlayerDataSection(availability.fixtures),
        recentGameweeks: stalePlayerDataSection(availability.recentGameweeks),
      },
    },
  };
}

export interface PlayerPickerFilter {
  position?: "GOALKEEPER" | "DEFENDER" | "MIDFIELDER" | "FORWARD";
  teamId?: number;
  minPrice?: number;
  maxPrice?: number;
}

/** Backend PlayerPickerSort enum (players/schema.ts). NAME_ASC preserves legacy caller behavior. */
export type PlayerPickerSort =
  | "AUTO"
  | "NAME_ASC"
  | "TOTAL_POINTS_DESC"
  | "FORM_DESC"
  | "PRICE_ASC"
  | "PRICE_DESC"
  | "OWNERSHIP_DESC";

/** Backend PlayerPickerOwnershipBand enum (players/schema.ts). */
export type PlayerPickerOwnershipBand =
  "LE5" | "GT5_LE15" | "GT15_LE40" | "GT40";

export interface PlayerPickerPageOptions {
  search?: string;
  filter?: PlayerPickerFilter;
  sort?: PlayerPickerSort;
  ownershipBand?: PlayerPickerOwnershipBand;
  limit?: number;
  cursor?: number | null;
  forceRefresh?: boolean;
  trace?: PageRequestTrace;
}

export interface PlayerPickerPageResult {
  items: PlayerOption[];
  nextCursor: number | null;
  totalCount: number;
}

function positionLabel(position: string): string {
  const labels: Record<string, string> = {
    GOALKEEPER: "GKP",
    DEFENDER: "DEF",
    MIDFIELDER: "MID",
    FORWARD: "FWD",
  };
  return labels[position] || position;
}

function currentEventId(): number {
  return Math.max(1, Number(getApp<IAppOption>().globalData.gw) || 1);
}

function currentSeason(explicitSeason?: string): string {
  const season = String(
    explicitSeason || getApp<IAppOption>().globalData.season || "",
  ).trim();
  if (!season) throw new Error("赛季信息暂时不可用，请稍后重试");
  return season;
}

function mapPickerPlayer(player: GraphQLPickerPlayer): PlayerOption {
  return {
    element: player.id,
    code: player.id,
    name: player.webName,
    team: player.team.shortName || player.team.name,
    teamName: player.team.name,
    position: positionLabel(player.position),
    price: player.price,
    priceText: formatPrice(player.price),
    totalPoints:
      typeof player.totalPoints === "number" ? player.totalPoints : undefined,
    form: typeof player.form === "number" ? player.form : undefined,
    selectedByPercent:
      typeof player.selectedByPercent === "number"
        ? player.selectedByPercent
        : undefined,
  };
}

function mapPlayerDetail(
  player: NonNullable<PlayerDetailResponse["playerDetail"]>,
): PlayerDetail {
  return {
    element: player.id,
    code: player.id,
    name: player.webName,
    team: player.teamShortName,
    position: player.elementTypeName,
    price: player.price,
    priceText: formatPrice(player.price),
    injuryAvailability: player.injuryAvailability ?? null,
    dataAvailability: player.dataAvailability,
    totalPoints: player.totalPoints,
    selectedByPercent: player.selectedByPercent ?? undefined,
    form: player.form ?? undefined,
  };
}

export async function getPlayersForPickerPage(
  options: PlayerPickerPageOptions = {},
): Promise<PlayerPickerPageResult> {
  const limit = Math.max(
    1,
    Math.min(
      PLAYER_PICKER_PAGE_LIMIT,
      Math.floor(options.limit || PLAYER_PICKER_PAGE_LIMIT),
    ),
  );
  const search = String(options.search || "").trim();
  const filter =
    options.filter && Object.keys(options.filter).length > 0
      ? options.filter
      : null;
  const variables = {
    search: search || null,
    filter,
    sort: options.sort || "NAME_ASC",
    ownershipBand: options.ownershipBand || null,
    limit,
    cursor: options.cursor ?? null,
  };
  const data = await graphqlRequest<PlayersForPickerResponse>(
    PLAYERS_FOR_PICKER_QUERY,
    variables,
    {
      authMode: "public",
      cachePolicy: "player-picker",
      season: currentSeason(),
      forceRefresh: options.forceRefresh === true,
      trace: options.trace,
    },
  );
  const page = data.playersForPicker;
  return {
    items: (page?.items || []).map(mapPickerPlayer),
    nextCursor: page?.nextCursor ?? null,
    totalCount: Number(page?.totalCount) || 0,
  };
}

const PLAYER_STATS_DESK_QUERY = `
  query MiniPlayerStatsDesk($playerIds: [Int!]!, $eventId: Int!, $horizon: Int!) {
    playerStatsDesk(playerIds: $playerIds, eventId: $eventId, horizon: $horizon) {
      eventId
      entries {
        playerId
        overview {
          status
          value {
            id
            webName
            teamShortName
            elementType
            elementTypeName
            price
            startPrice
            totalPoints
            selectedByPercent
            form
            seasonTransfersIn
            seasonTransfersOut
            transfersInEvent
            transfersOutEvent
            minutes
            starts
            goalsScored
            assists
            cleanSheets
            bonus
            bps
            expectedGoals
            expectedAssists
            expectedGoalInvolvements
          }
        }
        evidence {
          status
          value {
            ictIndex
          }
        }
      }
    }
  }
`;

/** Overview payload for one desk entry — prices are £ floats (not tenths). */
export interface PlayerStatsDeskOverview {
  id: number;
  webName: string;
  teamShortName: string;
  elementType: number;
  elementTypeName: string;
  price: number;
  startPrice: number;
  totalPoints?: number | null;
  selectedByPercent?: number | null;
  form?: number | null;
  seasonTransfersIn?: number | null;
  seasonTransfersOut?: number | null;
  transfersInEvent?: number | null;
  transfersOutEvent?: number | null;
  minutes?: number | null;
  starts?: number | null;
  goalsScored?: number | null;
  assists?: number | null;
  cleanSheets?: number | null;
  bonus?: number | null;
  bps?: number | null;
  expectedGoals?: number | null;
  expectedAssists?: number | null;
  expectedGoalInvolvements?: number | null;
}

export interface PlayerStatsDeskEntry {
  playerId: number;
  overview: PlayerStatsDeskOverview | null;
  /** Lifted out of evidence — the only evidence field the compare view uses. */
  ictIndex?: number | null;
}

interface PlayerStatsDeskResponse {
  playerStatsDesk: {
    eventId: number;
    entries?: Array<{
      playerId: number;
      overview?: {
        status: string;
        value?: PlayerStatsDeskOverview | null;
      } | null;
      evidence?: {
        status: string;
        value?: { ictIndex?: number | null } | null;
      } | null;
    }>;
  };
}

/** Two-player compare desk (web playerStatsDesk, max 2 ids). */
export async function getPlayerStatsDesk(
  playerIds: number[],
  eventId: number,
  horizon = 5,
  forceRefresh = false,
  trace?: PageRequestTrace,
): Promise<PlayerStatsDeskEntry[]> {
  const ids = playerIds.map(Number).filter(Number.isSafeInteger).slice(0, 2);
  if (!ids.length || !Number.isSafeInteger(eventId) || eventId <= 0) return [];
  const data = await graphqlRequest<PlayerStatsDeskResponse>(
    PLAYER_STATS_DESK_QUERY,
    { playerIds: ids, eventId, horizon },
    {
      authMode: "public",
      cachePolicy: "player-picker",
      season: currentSeason(),
      forceRefresh,
      trace,
    },
  );
  return (data.playerStatsDesk?.entries || []).map((entry) => ({
    playerId: entry.playerId,
    overview: entry.overview?.value ?? null,
    ictIndex: entry.evidence?.value?.ictIndex ?? null,
  }));
}

export async function getPlayerInfoByElement(
  element: number,
): Promise<PlayerDetail> {
  return getPlayerDetailByElement(element);
}

export async function getPlayerInfoByCode(
  code: number | string,
  season?: string,
  forceRefresh = false,
  trace?: import("./graphql.service").PageRequestTrace,
): Promise<PlayerDetail> {
  const playerId = Number(code);
  if (!Number.isSafeInteger(playerId) || playerId <= 0) {
    throw new Error("球员 ID 无效，请返回后重试");
  }
  const seasonName = currentSeason(season);
  const data = await graphqlRequest<PlayerDetailResponse>(
    PLAYER_DETAIL,
    { playerId, eventId: currentEventId() },
    {
      authMode: "public",
      cachePolicy: "reporting",
      season: seasonName,
      cacheVariant: `season:${seasonName}`,
      forceRefresh,
      trace,
      mapStaleData: (staleData) =>
        downgradeStalePlayerDetailResponse(staleData as PlayerDetailResponse),
    },
  );
  if (!data.playerDetail) {
    throw new Error("没有找到这名球员，请返回后重试");
  }
  return mapPlayerDetail(data.playerDetail);
}

export async function getPlayersByElementType(
  elementType: number | string,
  forceRefresh = false,
): Promise<PlayerOption[]> {
  const positionByType: Record<string, PlayerPickerFilter["position"]> = {
    "1": "GOALKEEPER",
    "2": "DEFENDER",
    "3": "MIDFIELDER",
    "4": "FORWARD",
  };
  const position = positionByType[String(elementType)];
  const page = await getPlayersForPickerPage({
    filter: position ? { position } : undefined,
    limit: PLAYER_PICKER_PAGE_LIMIT,
    forceRefresh,
  });
  return page.items;
}

export async function getPlayerDetailByElement(
  element: number,
): Promise<PlayerDetail> {
  return getPlayerInfoByCode(element);
}

export async function getFilterPlayers(
  _season: string,
): Promise<PlayerFilterRow[]> {
  const page = await getPlayersForPickerPage({
    limit: PLAYER_PICKER_PAGE_LIMIT,
  });
  return page.items.map((player) => ({ ...player }));
}

export function refreshPlayerStat(season: string): Promise<unknown> {
  return getFilterPlayers(season);
}
