import { graphqlRequest, type PageRequestTrace } from "./graphql.service";
import type { PlayerDetail, PlayerFilterRow, PlayerOption } from "../models/player";
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

const PLAYER = `
  query Player($id: Int!) {
    player(id: $id) {
      id
      code
      webName
      team { name shortName }
      position
      price
      totalPoints
      selectedByPercent
    }
  }
`;

const PLAYER_DETAIL = `
  query PlayerDetail($playerId: Int!, $eventId: Int!) {
    playerDetail(playerId: $playerId, eventId: $eventId) {
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

interface GraphQLPlayer {
  id: number;
  code: number;
  webName: string;
  team: { name: string; shortName: string };
  position: string;
  price: number;
  totalPoints: number;
  selectedByPercent?: number | null;
}

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

interface PlayerResponse {
  player: GraphQLPlayer | null;
}

interface PlayerDetailResponse {
  playerDetail: {
    id: number;
    webName: string;
    teamShortName: string;
    elementType: number;
    elementTypeName: string;
    price: number;
    startPrice: number;
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
export type PlayerPickerOwnershipBand = "LE5" | "GT5_LE15" | "GT15_LE40" | "GT40";

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
    FORWARD: "FWD"
  };
  return labels[position] || position;
}

function currentEventId(): number {
  return Math.max(1, Number(getApp<IAppOption>().globalData.gw) || 1);
}

function currentSeason(explicitSeason?: string): string {
  const season = String(explicitSeason || getApp<IAppOption>().globalData.season || "").trim();
  if (!season) throw new Error("赛季信息暂时不可用，请稍后重试");
  return season;
}

function mapPlayer(player: GraphQLPlayer): PlayerOption {
  return {
    element: player.id,
    code: player.id,
    name: player.webName,
    team: player.team.shortName || player.team.name,
    teamName: player.team.name,
    position: positionLabel(player.position),
    price: player.price,
    priceText: formatPrice(player.price)
  };
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
    totalPoints: typeof player.totalPoints === "number" ? player.totalPoints : undefined,
    form: typeof player.form === "number" ? player.form : undefined,
    selectedByPercent: typeof player.selectedByPercent === "number" ? player.selectedByPercent : undefined
  };
}

function mapPlayerDetail(player: GraphQLPlayer): PlayerDetail {
  return {
    ...mapPlayer(player),
    totalPoints: player.totalPoints,
    selectedByPercent: player.selectedByPercent ?? undefined
  };
}

export async function getPlayersForPickerPage(
  options: PlayerPickerPageOptions = {}
): Promise<PlayerPickerPageResult> {
  const limit = Math.max(1, Math.min(50, Math.floor(options.limit || 50)));
  const search = String(options.search || "").trim();
  const filter = options.filter && Object.keys(options.filter).length > 0
    ? options.filter
    : null;
  const variables = {
    search: search || null,
    filter,
    sort: options.sort || "NAME_ASC",
    ownershipBand: options.ownershipBand || null,
    limit,
    cursor: options.cursor ?? null
  };
  const data = await graphqlRequest<PlayersForPickerResponse>(
    PLAYERS_FOR_PICKER_QUERY,
    variables,
    {
      authMode: "public",
      cachePolicy: "player-picker",
      season: currentSeason(),
      forceRefresh: options.forceRefresh === true,
      trace: options.trace
    }
  );
  const page = data.playersForPicker;
  return {
    items: (page?.items || []).map(mapPickerPlayer),
    nextCursor: page?.nextCursor ?? null,
    totalCount: Number(page?.totalCount) || 0
  };
}

const PLAYER_STATS_DESK_QUERY = `
  query MiniPlayerStatsDesk($playerIds: [Int!]!, $eventId: Int!, $horizon: Int!) {
    playerStatsDesk(playerIds: $playerIds, eventId: $eventId, horizon: $horizon) {
      eventId
      entries {
        playerId
        overview {
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
        evidence {
          ictIndex
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
      overview?: PlayerStatsDeskOverview | null;
      evidence?: { ictIndex?: number | null } | null;
    }>;
  };
}

/** Two-player compare desk (web playerStatsDesk, max 2 ids). */
export async function getPlayerStatsDesk(
  playerIds: number[],
  eventId: number,
  horizon = 5,
  forceRefresh = false,
  trace?: PageRequestTrace
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
      trace
    }
  );
  return (data.playerStatsDesk?.entries || []).map((entry) => ({
    playerId: entry.playerId,
    overview: entry.overview || null,
    ictIndex: entry.evidence?.ictIndex ?? null
  }));
}

export async function getPlayerInfoByElement(element: number): Promise<PlayerDetail> {
  return getPlayerDetailByElement(element);
}

export async function getPlayerInfoByCode(
  code: number | string,
  season?: string,
  forceRefresh = false,
  trace?: import("./graphql.service").PageRequestTrace
): Promise<PlayerDetail> {
  const playerId = Number(code);
  const data = await graphqlRequest<PlayerResponse>(
    PLAYER,
    { id: playerId },
    {
      authMode: "public",
      cachePolicy: "reporting",
      cacheVariant: `season:${currentSeason(season)}`,
      forceRefresh,
      trace
    }
  );
  if (!data.player) {
    throw new Error("没有找到这名球员，请返回后重试");
  }
  return mapPlayerDetail(data.player);
}

export async function getPlayersByElementType(
  elementType: number | string,
  forceRefresh = false
): Promise<PlayerOption[]> {
  const positionByType: Record<string, PlayerPickerFilter["position"]> = {
    "1": "GOALKEEPER",
    "2": "DEFENDER",
    "3": "MIDFIELDER",
    "4": "FORWARD"
  };
  const position = positionByType[String(elementType)];
  const page = await getPlayersForPickerPage({
    filter: position ? { position } : undefined,
    limit: 50,
    forceRefresh
  });
  return page.items;
}

export async function getPlayerDetailByElement(element: number): Promise<PlayerDetail> {
  const data = await graphqlRequest<PlayerDetailResponse>(
    PLAYER_DETAIL,
    {
      playerId: element,
      eventId: currentEventId()
    },
    {
      authMode: "public",
      cachePolicy: "reporting",
      cacheVariant: `season:${currentSeason()}`
    }
  );
  const detail = data.playerDetail;
  if (!detail) {
    throw new Error("这名球员的详情暂时不可用，请稍后重试");
  }

  return {
    element: detail.id,
    code: detail.id,
    name: detail.webName,
    team: detail.teamShortName,
    position: detail.elementTypeName,
    price: detail.price,
    totalPoints: detail.totalPoints,
    selectedByPercent: detail.selectedByPercent ?? undefined,
    form: detail.form ?? undefined
  };
}

export async function getFilterPlayers(_season: string): Promise<PlayerFilterRow[]> {
  const page = await getPlayersForPickerPage({ limit: 50 });
  return page.items.map((player) => ({ ...player }));
}

export function refreshPlayerStat(season: string): Promise<unknown> {
  return getFilterPlayers(season);
}
