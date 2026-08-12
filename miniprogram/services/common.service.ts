import { graphqlRead, graphqlRequest } from "./graphql.service";
import type { DomainRead, ServiceReadOptions } from "./service-read";
import type { CurrentEventDeadline, TeamOption } from "../models/common";
import { storageKeys } from "../config/storage-keys";
import { getEntryLeagueInfo } from "./entry.service";

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
  return (await readCurrentEventAndDeadline({ forceRefresh })).data;
}

export async function readCurrentEventAndDeadline(
  options: ServiceReadOptions = {}
): Promise<DomainRead<CurrentEventDeadline>> {
  const result = await graphqlRead<CurrentEventInfoResponse>(CURRENT_EVENT_INFO, {}, {
    cachePolicy: "deadline",
    forceRefresh: options.forceRefresh,
    trace: options.trace,
    getCacheExpiry: (res) => {
      const info = (res as CurrentEventInfoResponse).currentEventInfo;
      const deadline = info?.nextUtcDeadline;
      if (deadline) {
        const expiresAt = new Date(deadline).getTime();
        if (expiresAt > Date.now()) return expiresAt;
      }
      if (info?.currentEvent === 38 && !info.nextEvent) return Date.now() + 24 * 60 * 60 * 1000;
      return Date.now();
    }
  });
  if (result.errors.length > 0) {
    throw new Error("比赛周信息暂时不可用，请稍后重试");
  }
  const info = result.data.currentEventInfo;
  const gw = info?.currentEvent ?? info?.nextEvent ?? undefined;
  return {
    data: {
      season: info?.season,
      currentEvent: info?.currentEvent ?? undefined,
      nextEvent: info?.nextEvent ?? undefined,
      event: gw,
      gw,
      utcDeadline: info?.nextUtcDeadline ?? undefined,
      deadline: info?.nextUtcDeadline ?? undefined
    },
    meta: result.meta
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

export async function getTeamList(_season: string, forceRefresh = false): Promise<TeamOption[]> {
  if (!_season) throw new Error("赛季信息暂时不可用，请稍后重试");
  const data = await graphqlRequest<TeamsResponse>(TEAMS, {}, {
    cachePolicy: "team-directory",
    cacheVariant: `season:${_season}`,
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

  const leagues = await getEntryLeagueInfo(entryId);
  return [...new Set(leagues.map((league) => league.name).filter(Boolean))];
}
