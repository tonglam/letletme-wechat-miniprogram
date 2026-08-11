import { graphqlRequest } from "./graphql.service";
import type { CurrentEventDeadline, TeamOption } from "../models/common";
import { storageKeys } from "../config/storage-keys";

const CURRENT_EVENT_INFO = `
  query CurrentEventInfo {
    currentEventInfo {
      season
      currentEvent
      nextEvent
      nextUtcDeadline
    }
  }
`;

interface CurrentEventInfoResponse {
  currentEventInfo: {
    season: string;
    currentEvent: number | null;
    nextEvent: number | null;
    nextUtcDeadline: string | null;
  } | null;
}

export async function getCurrentEventAndDeadline(forceRefresh = false): Promise<CurrentEventDeadline> {
  const data = await graphqlRequest<CurrentEventInfoResponse>(CURRENT_EVENT_INFO, {}, {
    cachePolicy: "deadline",
    forceRefresh,
    getCacheExpiry: (res) => {
      const deadline = (res as CurrentEventInfoResponse).currentEventInfo?.nextUtcDeadline;
      if (deadline) {
        const expiresAt = new Date(deadline).getTime();
        return expiresAt > Date.now() ? expiresAt : Date.now() + 3600_000;
      }
      return Date.now() + 3600_000;
    }
  });
  const info = data.currentEventInfo;
  const gw = info?.currentEvent ?? info?.nextEvent ?? undefined;
  return {
    season: info?.season,
    currentEvent: info?.currentEvent ?? undefined,
    nextEvent: info?.nextEvent ?? undefined,
    event: gw,
    gw,
    utcDeadline: info?.nextUtcDeadline ?? undefined,
    deadline: info?.nextUtcDeadline ?? undefined
  };
}

export function refreshEventAndDeadline(): Promise<CurrentEventDeadline> {
  return getCurrentEventAndDeadline(true);
}

const MINI_PROGRAM_NOTICE = `
  query MiniProgramNotice {
    miniProgramNotice
  }
`;

interface MiniProgramNoticeResponse {
  miniProgramNotice: string;
}

export async function getMiniProgramNotice(): Promise<string> {
  const data = await graphqlRequest<MiniProgramNoticeResponse>(MINI_PROGRAM_NOTICE, {}, {
    cachePolicy: "notice"
  });
  return data.miniProgramNotice || "";
}

export function refreshLiveCache(): Promise<unknown> {
  return getCurrentEventAndDeadline();
}

const TEAMS = `
  query Teams {
    teams {
      id
      name
      shortName
    }
  }
`;

interface TeamsResponse {
  teams: Array<{
    id: number;
    name: string;
    shortName: string;
  }>;
}

const ENTRY_LEAGUES = `
  query EntryLeagues($entryId: Int!) {
    entryLeagues(entryId: $entryId) {
      id
      name
    }
  }
`;

interface EntryLeaguesResponse {
  entryLeagues: Array<{
    id: number;
    name: string;
  }>;
}

export async function getTeamList(_season: string, forceRefresh = false): Promise<TeamOption[]> {
  const data = await graphqlRequest<TeamsResponse>(TEAMS, {}, {
    cachePolicy: "team-directory",
    cacheVariant: _season ? `season:${_season}` : "season:unknown",
    forceRefresh
  });
  return (data.teams || []).map((team) => ({
    id: team.id,
    name: team.name,
    shortName: team.shortName
  }));
}

function getCurrentEntryId(): number | undefined {
  const appEntryId = Number(getApp<IAppOption>().globalData.entryId);
  if (Number.isInteger(appEntryId) && appEntryId > 0) {
    return appEntryId;
  }

  const storedEntryId = Number(wx.getStorageSync(storageKeys.entryId));
  return Number.isInteger(storedEntryId) && storedEntryId > 0 ? storedEntryId : undefined;
}

export async function getAllLeagueName(_season: string): Promise<string[]> {
  const entryId = getCurrentEntryId();
  if (!entryId) {
    return [];
  }

  const data = await graphqlRequest<EntryLeaguesResponse>(ENTRY_LEAGUES, { entryId }, {
    cachePolicy: "reporting"
  });
  return [...new Set((data.entryLeagues || []).map((league) => league.name).filter(Boolean))];
}
