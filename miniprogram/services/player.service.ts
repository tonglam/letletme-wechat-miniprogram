import { graphqlRequest } from "./graphql.service";
import type { PlayerDetail, PlayerFilterRow, PlayerOption } from "../models/player";
import { formatPrice } from "../utils/fpl";

export const PLAYERS_FOR_PICKER_QUERY = `
  query PlayersForPicker(
    $search: String
    $filter: PlayersFilter
    $limit: Int!
    $cursor: Int
  ) {
    playersForPicker(
      search: $search
      filter: $filter
      sort: NAME_ASC
      limit: $limit
      cursor: $cursor
    ) {
      items {
        id
        webName
        team { name shortName }
        position
        price
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

export interface PlayerPickerPageOptions {
  search?: string;
  filter?: PlayerPickerFilter;
  limit?: number;
  cursor?: number | null;
  forceRefresh?: boolean;
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

function currentSeason(): string {
  return String(getApp<IAppOption>().globalData.season || "unknown");
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
    priceText: formatPrice(player.price)
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
    limit,
    cursor: options.cursor ?? null
  };
  const data = await graphqlRequest<PlayersForPickerResponse>(
    PLAYERS_FOR_PICKER_QUERY,
    variables,
    {
      authMode: "public",
      cachePolicy: "player-picker",
      cacheVariant: `season:${currentSeason()}`,
      forceRefresh: options.forceRefresh === true
    }
  );
  const page = data.playersForPicker;
  return {
    items: (page?.items || []).map(mapPickerPlayer),
    nextCursor: page?.nextCursor ?? null,
    totalCount: Number(page?.totalCount) || 0
  };
}

export async function getPlayerInfoByElement(element: number): Promise<PlayerDetail> {
  return getPlayerDetailByElement(element);
}

export async function getPlayerInfoByCode(code: number | string, _season?: string): Promise<PlayerDetail> {
  const playerId = Number(code);
  const data = await graphqlRequest<PlayerResponse>(
    PLAYER,
    { id: playerId },
    {
      authMode: "public",
      cachePolicy: "reporting",
      cacheVariant: `season:${currentSeason()}`
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

export function getTeamFixtureByShortName(_shortName: string, _season?: string): Promise<unknown[]> {
  return Promise.resolve([]);
}

export async function getFilterPlayers(_season: string): Promise<PlayerFilterRow[]> {
  const page = await getPlayersForPickerPage({ limit: 50 });
  return page.items.map((player) => ({ ...player }));
}

export function refreshPlayerStat(season: string): Promise<unknown> {
  return getFilterPlayers(season);
}
