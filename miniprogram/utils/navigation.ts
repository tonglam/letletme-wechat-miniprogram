import { routes } from "../config/routes";

function encodeQuery(query: Record<string, string | number | undefined>): string {
  const parts = Object.keys(query)
    .filter((key) => query[key] !== undefined)
    .map((key) => `${key}=${encodeURIComponent(String(query[key]))}`);

  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

export function navigateTo(path: string, query: Record<string, string | number | undefined> = {}): void {
  wx.navigateTo({ url: `${path}${encodeQuery(query)}` });
}

export function goToEntrySearch(): void {
  navigateTo(routes.entrySearch);
}

export function forceEntryBinding(): void {
  wx.reLaunch({ url: routes.accountLink });
}

export function goToEntryProfile(entryId?: number): void {
  navigateTo(routes.entryProfile, { entry: entryId });
}

export function goToPlayerDetail(code: number | string, season?: string): void {
  navigateTo(routes.dataPlayerDetail, { code, season });
}

export function goToTeamDetail(teamId: number | string, season?: string): void {
  navigateTo(routes.dataTeamDetail, { teamId, season });
}

export function goToLiveEntry(entryId?: number): void {
  navigateTo(routes.liveEntry, { entry: entryId });
}

export function switchToHome(): void {
  wx.redirectTo({ url: routes.home });
}

export function switchToLive(): void {
  wx.redirectTo({ url: routes.liveIndex });
}

export function switchToData(): void {
  wx.redirectTo({ url: routes.dataIndex });
}
