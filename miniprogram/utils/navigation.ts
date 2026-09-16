import { routes } from "../config/routes";
import { handoffPageInteraction } from "./page-performance";

function encodeQuery(query: Record<string, string | number | undefined>): string {
  const parts = Object.keys(query)
    .filter((key) => query[key] !== undefined)
    .map((key) => `${key}=${encodeURIComponent(String(query[key]))}`);

  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

export function setPageTitle(title: string): void {
  const next = String(title || "").trim();
  if (!next) return;
  wx.setNavigationBarTitle({ title: next });
}

export function navigateTo(path: string, query: Record<string, string | number | undefined> = {}): void {
  const url = `${path}${encodeQuery(query)}`;
  handoffPageInteraction(url);
  wx.navigateTo({ url });
}

export function goToEntrySearch(): void {
  navigateTo(routes.entrySearch);
}

export function goToAccountLink(): void {
  navigateTo(routes.accountLink);
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
  handoffPageInteraction(routes.home);
  wx.redirectTo({ url: routes.home });
}

export function switchToLive(): void {
  handoffPageInteraction(routes.liveIndex);
  wx.redirectTo({ url: routes.liveIndex });
}
