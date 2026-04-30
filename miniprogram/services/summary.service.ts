import { graphqlRequest } from "./graphql.service";
import type { GameweekOverallSummary } from "../models/summary";

const EVENT_OVERALL_RESULT = `
  query EventOverallResult($season: Int!) {
    eventOverallResult(season: $season) {
      event
      averageScore
      highestScore
      highestScoringEntry
      transfersMade
      mostViceCaptainedPlayer {
        id
        webName
      }
      mostTransferInPlayer {
        id
        webName
      }
      mostSelectedPlayer {
        id
        webName
      }
      mostCaptainedPlayer {
        id
        webName
      }
      topElementInfo {
        element
        points
        teamShortName
        player {
          id
          webName
          team {
            name
            shortName
          }
        }
      }
      chipPlays {
        chipName
        numberPlayed
      }
    }
  }
`;

const EVENT_DREAM_TEAM = `
  query EventDreamTeam($eventId: Int!) {
    eventLive(eventId: $eventId) {
      dreamTeam {
        player {
          id
          webName
          team { shortName name }
          position
        }
        totalPoints
      }
    }
  }
`;

const EVENT_ELITE_ELEMENTS = `
  query EventEliteElements($eventId: Int!) {
    eventLive(eventId: $eventId) {
      topPerformers(limit: 20) {
        player {
          id
          webName
          team { shortName name }
          position
        }
        totalPoints
      }
    }
  }
`;

const EVENT_OVERALL_TRANSFERS = `
  query EventOverallTransfers($eventId: Int!, $limit: Int!) {
    topTransfersIn(eventId: $eventId, limit: $limit) {
      transfersInEvent
      player {
        id
        webName
        team { shortName name }
        position
      }
    }
    topTransfersOut(eventId: $eventId, limit: $limit) {
      transfersOutEvent
      player {
        id
        webName
        team { shortName name }
        position
      }
    }
  }
`;

const ENTRY_EVENT_RESULT = `
  query EntryEventResult($entryId: Int!, $eventId: Int!) {
    entryEventResult(entryId: $entryId, eventId: $eventId) {
      eventId
      eventPoints
      overallPoints
      overallRank
      eventTransfers
      eventTransfersCost
      eventNetPoints
      eventBenchPoints
      eventChip
      eventCaptainPoints
      eventPlayedCaptain {
        webName
      }
      eventPicks {
        webName
        teamShortName
        teamName
        elementTypeName
        isCaptain
        isViceCaptain
        multiplier
        totalPoints
        minutes
        position
      }
      teamValue
      bank
      entry {
        id
        entryName
        playerName
        totalTransfers
        region
      }
    }
  }
`;

const ENTRY_HISTORY = `
  query EntryHistory($entryId: Int!) {
    entryHistory(entryId: $entryId) {
      results {
        eventId
        eventPoints
        eventRank
        overallPoints
        overallRank
        eventTransfers
        eventTransfersCost
        eventNetPoints
        teamValue
        bank
      }
      history {
        season
        totalPoints
        overallRank
      }
    }
  }
`;

const ENTRY_TRANSFER_HISTORY = `
  query EntryTransferHistory($entryId: Int!) {
    entryTransferHistory(entryId: $entryId) {
      eventId
      eventTransfers
      eventTransfersCost
      transfers {
        event
        elementInWebName
        elementInTypeName
        elementInTeamShortName
        elementInCost
        elementOutWebName
        elementOutTypeName
        elementOutTeamShortName
        elementOutCost
        time
      }
    }
  }
`;

interface EventOverallResultResponse {
  eventOverallResult: GameweekOverallSummary | GameweekOverallSummary[] | null;
}

interface PlayerTeamsResponse {
  [alias: string]: {
    id: number;
    team: {
      shortName: string;
    };
  } | null;
}

interface GraphQLEventPlayer {
  player: {
    id: number;
    webName: string;
    team: { shortName: string; name: string };
    position: string;
  };
  totalPoints?: number;
  transfersInEvent?: number;
  transfersOutEvent?: number;
}

interface EventDreamTeamResponse {
  eventLive: {
    dreamTeam: GraphQLEventPlayer[];
  } | null;
}

interface EventEliteElementsResponse {
  eventLive: {
    topPerformers: GraphQLEventPlayer[];
  } | null;
}

interface EventOverallTransfersResponse {
  topTransfersIn: GraphQLEventPlayer[];
  topTransfersOut: GraphQLEventPlayer[];
}

export interface EntryEventPick {
  webName: string;
  teamShortName: string;
  teamName: string;
  elementTypeName: string;
  isCaptain: boolean;
  isViceCaptain: boolean;
  multiplier: number;
  totalPoints: number;
  minutes: number;
  position: number;
}

export interface EntryEventResult {
  eventId: number;
  eventPoints: number;
  overallPoints: number;
  overallRank: number;
  eventTransfers: number;
  eventTransfersCost: number;
  eventNetPoints: number;
  eventBenchPoints: number;
  eventChip: string;
  eventCaptainPoints: number;
  eventPlayedCaptain: {
    webName: string;
  } | null;
  eventPicks: EntryEventPick[];
  teamValue: number | null;
  bank: number | null;
  entry: {
    id: number;
    entryName: string;
    playerName: string | null;
    totalTransfers: number | null;
    region: string | null;
  };
}

interface EntryEventResultResponse {
  entryEventResult: EntryEventResult | null;
}

export interface EntryHistoryItem {
  eventId: number;
  eventChip?: string | null;
  eventPoints: number;
  eventRank: number | null;
  overallPoints: number;
  overallRank: number;
  eventTransfers: number;
  eventTransfersCost: number;
  eventNetPoints: number;
  teamValue: number | null;
  bank: number | null;
}

export interface EntrySeasonHistoryItem {
  season: string;
  totalPoints: number;
  overallRank: number;
}

export interface EntryHistoryPayload {
  results: EntryHistoryItem[];
  history: EntrySeasonHistoryItem[];
}

interface EntryHistoryResponse {
  entryHistory: EntryHistoryPayload;
}

export interface EntryTransferMove {
  event: number;
  elementInWebName: string;
  elementInTypeName?: string | null;
  elementInTeamShortName?: string | null;
  elementInCost?: number | null;
  elementOutWebName: string;
  elementOutTypeName?: string | null;
  elementOutTeamShortName?: string | null;
  elementOutCost?: number | null;
  time?: string | null;
}

export interface EntryGameweekTransfers {
  eventId: number;
  eventTransfers: number;
  eventTransfersCost: number;
  transfers: EntryTransferMove[];
}

interface EntryTransferHistoryResponse {
  entryTransferHistory: EntryGameweekTransfers[];
}

function positionType(position: string): number {
  const map: Record<string, number> = {
    GOALKEEPER: 1,
    DEFENDER: 2,
    MIDFIELDER: 3,
    FORWARD: 4
  };
  return map[position] || 0;
}

function mapEventPlayer(row: GraphQLEventPlayer): Record<string, unknown> {
  return {
    element: row.player.id,
    id: row.player.id,
    webName: row.player.webName,
    teamShortName: row.player.team.shortName,
    teamName: row.player.team.name,
    elementType: positionType(row.player.position),
    position: row.player.position,
    points: row.totalPoints,
    totalPoints: row.totalPoints,
    transfersInEvent: row.transfersInEvent,
    transfersOutEvent: row.transfersOutEvent
  };
}

export async function getEntryTeamStatsEventResult(entry: number, event: number): Promise<EntryEventResult | undefined> {
  const data = await graphqlRequest<EntryEventResultResponse>(ENTRY_EVENT_RESULT, { entryId: entry, eventId: event });
  return data.entryEventResult || undefined;
}

export async function getEntryTeamStatsHistory(entry: number): Promise<EntryHistoryPayload> {
  const data = await graphqlRequest<EntryHistoryResponse>(ENTRY_HISTORY, { entryId: entry });
  return data.entryHistory;
}

export async function getEntryTeamStatsTransfers(entry: number): Promise<EntryGameweekTransfers[]> {
  const data = await graphqlRequest<EntryTransferHistoryResponse>(ENTRY_TRANSFER_HISTORY, { entryId: entry });
  return data.entryTransferHistory || [];
}

export async function getGameweekOverallSummary(event: number): Promise<GameweekOverallSummary> {
  const data = await graphqlRequest<EventOverallResultResponse>(EVENT_OVERALL_RESULT, {
    season: getCurrentSeasonKey()
  });
  const result = pickEventOverallResult(data.eventOverallResult, event);
  if (!result) {
    throw new Error(`No GW summary found for GW${event}`);
  }
  return enrichGameweekSummaryPlayers(result);
}

export async function getGameweekStatsForHome(event: number): Promise<GameweekOverallSummary | undefined> {
  const data = await graphqlRequest<EventOverallResultResponse>(EVENT_OVERALL_RESULT, {
    season: getCurrentSeasonKey()
  });
  return pickEventOverallResult(data.eventOverallResult, event);
}

export async function getEventDreamTeam(event: number): Promise<unknown[]> {
  const data = await graphqlRequest<EventDreamTeamResponse>(EVENT_DREAM_TEAM, { eventId: event });
  return (data.eventLive?.dreamTeam || []).map(mapEventPlayer);
}

export async function getEventEliteElements(event: number): Promise<unknown[]> {
  const data = await graphqlRequest<EventEliteElementsResponse>(EVENT_ELITE_ELEMENTS, { eventId: event });
  return (data.eventLive?.topPerformers || []).map(mapEventPlayer);
}

export async function getEventOverallTransfers(event: number): Promise<unknown> {
  const data = await graphqlRequest<EventOverallTransfersResponse>(EVENT_OVERALL_TRANSFERS, { eventId: event, limit: 10 });
  return {
    transfers_in: (data.topTransfersIn || []).map(mapEventPlayer),
    transfers_out: (data.topTransfersOut || []).map(mapEventPlayer)
  };
}

export function refreshEventOverallSummary(event: number): Promise<unknown> {
  return getGameweekOverallSummary(event);
}

function getCurrentSeasonKey(date = new Date()): number {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  if (month >= 8) {
    return Number(`${String(year).slice(-2)}${String(year + 1).slice(-2)}`);
  }

  return Number(`${String(year - 1).slice(-2)}${String(year).slice(-2)}`);
}

function pickEventOverallResult(
  results: GameweekOverallSummary | GameweekOverallSummary[] | null,
  event: number
): GameweekOverallSummary | undefined {
  const list = Array.isArray(results) ? results.filter(Boolean) : results ? [results] : [];
  const exact = list.find((result) => result.event === event);
  if (exact) {
    return exact;
  }

  return list
    .filter((result) => typeof result.event === "number" && Number(result.event) <= event)
    .sort((a, b) => Number(b.event || 0) - Number(a.event || 0))[0];
}

async function enrichGameweekSummaryPlayers(summary: GameweekOverallSummary): Promise<GameweekOverallSummary> {
  const players = [
    summary.mostSelectedPlayer,
    summary.mostCaptainedPlayer,
    summary.mostViceCaptainedPlayer,
    summary.mostTransferInPlayer,
    summary.topElementInfo?.player
  ].filter((player): player is NonNullable<typeof player> => Boolean(player?.id));
  const ids = [...new Set(players.map((player) => Number(player.id)).filter((id) => Number.isInteger(id) && id > 0))];

  if (ids.length === 0) {
    return summary;
  }

  const variables = ids.reduce<Record<string, number>>((acc, id, index) => {
    acc[`id${index}`] = id;
    return acc;
  }, {});
  const fields = ids
    .map((_, index) => `p${index}: player(id: $id${index}) { id team { shortName } }`)
    .join("\n");
  const variableDefs = ids.map((_, index) => `$id${index}: Int!`).join(", ");
  const query = `query SummaryPlayerTeams(${variableDefs}) { ${fields} }`;
  const data: Partial<PlayerTeamsResponse> = await graphqlRequest<PlayerTeamsResponse>(query, variables).catch(() => ({}));
  const teamById = ids.reduce<Record<number, string>>((acc, id, index) => {
    const teamShortName = data[`p${index}`]?.team?.shortName;
    if (teamShortName) {
      acc[id] = teamShortName;
    }
    return acc;
  }, {});

  players.forEach((player) => {
    const teamShortName = teamById[Number(player.id)];
    if (teamShortName) {
      player.teamShortName = teamShortName;
    }
  });

  return summary;
}
