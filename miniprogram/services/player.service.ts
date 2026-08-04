import { graphqlRequest } from "./graphql.service";
import type { PlayerDetail, PlayerFilterRow, PlayerOption } from "../models/player";
import { formatPrice } from "../utils/fpl";

const PLAYERS = `
  query Players($limit: Int!, $offset: Int!) {
    players(limit: $limit, offset: $offset) {
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

interface PlayersResponse {
  players: GraphQLPlayer[];
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

function positionLabel(position: string): string {
  const map: Record<string, string> = {
    GOALKEEPER: "GKP",
    DEFENDER: "DEF",
    MIDFIELDER: "MID",
    FORWARD: "FWD"
  };
  return map[position] || position;
}

function currentEventId(): number {
  return Math.max(1, Number(getApp<IAppOption>().globalData.gw) || 1);
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

function mapPlayerDetail(player: GraphQLPlayer): PlayerDetail {
  return {
    ...mapPlayer(player),
    totalPoints: player.totalPoints,
    selectedByPercent: player.selectedByPercent ?? undefined
  };
}

export async function getPlayerInfoByElement(element: number): Promise<PlayerDetail> {
  return getPlayerDetailByElement(element);
}

export async function getPlayerInfoByCode(code: number | string, _season?: string): Promise<PlayerDetail> {
  const playerId = Number(code);
  const data = await graphqlRequest<PlayerResponse>(PLAYER, { id: playerId });
  if (!data.player) {
    throw new Error("没有找到这名球员，请返回后重试");
  }
  return mapPlayerDetail(data.player);
}

export async function getPlayersByElementType(_elementType: number | string, forceRefresh = false): Promise<PlayerOption[]> {
  // The 600-row player directory changes slowly (names/teams/positions are
  // stable; prices move once daily), so a 6h TTL is safe and avoids pulling
  // the full list on every visit to the price page's player mode. An empty
  // directory is almost always a mid-sync backend state rather than a real
  // season with zero players, though — retry those soon instead of pinning
  // them for 6h.
  const data = await graphqlRequest<PlayersResponse>(PLAYERS, { limit: 600, offset: 0 }, {
    getCacheExpiry: (result) => {
      const rows = (result as PlayersResponse | undefined)?.players;
      return Date.now() + ((rows && rows.length > 0) ? 6 * 60 * 60 * 1000 : 60 * 1000);
    },
    forceRefresh
  });
  return (data.players || []).map(mapPlayer);
}

export async function getPlayerDetailByElement(element: number): Promise<PlayerDetail> {
  const data = await graphqlRequest<PlayerDetailResponse>(PLAYER_DETAIL, {
    playerId: element,
    eventId: currentEventId()
  });
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
  const players = await getPlayersByElementType("all");
  return players.map((player) => ({ ...player }));
}

export function refreshPlayerStat(season: string): Promise<unknown> {
  return getFilterPlayers(season);
}
