import { PerformancePage } from "../../../utils/performance-page";
import { routes } from "../../../config/routes";
import { goToEntrySearch, navigateTo } from "../../../utils/navigation";
import { ensureAppContext, getAppContextSnapshot } from "../../../services/app-context.service";
import { EntryLookupError, getEntryInfo } from "../../../services/entry.service";
import { waitForAuthoritativeFollow } from "../../../utils/follow";
import type { EntryPersistenceState } from "../../../models/entry";
import {
  entryPersistenceNeedsRevalidation,
  entryPersistencePresentation
} from "../../../utils/entry-lookup-presentation";

/** Live index warm-show skip window (aligned with home/leagues at 60s; team is 5 min). */
export const LIVE_INDEX_REVALIDATE_MS = 60 * 1000;

export function shouldReloadLiveIndex(
  lastLoadAt: number,
  loadedContextRevision: number,
  currentContextRevision: number,
  loadedEntryId: number,
  currentEntryId: number,
  now = Date.now()
): boolean {
  return !lastLoadAt
    || loadedContextRevision !== currentContextRevision
    || loadedEntryId !== currentEntryId
    || now - lastLoadAt >= LIVE_INDEX_REVALIDATE_MS;
}

PerformancePage({
  data: {
    contextResolved: false,
    entryId: 0,
    entryName: "",
    entryLookupStatus: "",
    entryLookupMessage: "",
    entryLookupRetryable: false,
    entryPersistenceState: "" as EntryPersistenceState | "",
    event: 0,
    currentGw: 0,
    cards: [
      {
        title: "实时积分",
        description: "阵容、队长、替补、开卡和实时积分",
        meta: "实时积分",
        status: "积分必看",
        url: routes.liveEntry
      },
      {
        title: "实时比赛",
        description: "比赛状态、比分、BPS 和关键事件",
        meta: "比赛中心",
        status: "按状态筛选",
        url: routes.liveMatch
      },
      {
        title: "实时赛事",
        description: "赛事实时排名、搜索和排序",
        meta: "赛事榜",
        status: "支持切换",
        url: routes.liveTournament
      }
    ]
  },

  pageVisible: false,
  hasShown: false,
  lifecycleRevision: 0,
  lastLoadAt: 0,
  loadedContextRevision: 0,
  loadedEntryId: 0,

  onLoad() {
    this.pageVisible = true;
    return this.loadContext("page-load");
  },

  async onShow() {
    this.pageVisible = true;
    const resumed = this.hasShown;
    this.hasShown = true;
    if (!resumed) return undefined;
    const lifecycleRevision = this.lifecycleRevision;
    await waitForAuthoritativeFollow();
    if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision) {
      return undefined;
    }
    const snapshot = getAppContextSnapshot();
    const currentEntryId = getApp<IAppOption>().globalData.entryId ?? 0;
    if (!shouldReloadLiveIndex(
      this.lastLoadAt,
      this.loadedContextRevision,
      snapshot?.contextRevision ?? 0,
      this.loadedEntryId,
      currentEntryId
    )) {
      return undefined;
    }
    return this.loadContext("page-show");
  },

  onHide() {
    this.pageVisible = false;
    this.lifecycleRevision += 1;
  },

  onUnload() {
    this.pageVisible = false;
    this.lifecycleRevision += 1;
  },

  async loadContext(
    reason: "page-load" | "page-show",
    forceEntryLookup = false
  ) {
    const lifecycleRevision = this.lifecycleRevision;
    try {
      await ensureAppContext({ reason });
    } catch {
      // Keep the landing page usable with the last normalized app state.
    }
    if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision) return;
    await waitForAuthoritativeFollow();
    if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision) return;
    const app = getApp<IAppOption>();
    const entryId = app.globalData.entryId ?? 0;
    const entryChanged = this.data.entryId !== entryId;
    let entryName = entryChanged ? "" : this.data.entryName || "";
    let entryLookupStatus = entryChanged ? "" : this.data.entryLookupStatus || "";
    let entryLookupMessage = entryChanged ? "" : this.data.entryLookupMessage || "";
    let entryLookupRetryable = entryChanged
      ? false
      : Boolean(this.data.entryLookupRetryable);
    let entryPersistenceState: EntryPersistenceState | "" = entryChanged
      ? ""
      : this.data.entryPersistenceState || "";
    const persistenceRevalidation = entryPersistenceNeedsRevalidation(
      entryPersistenceState
    );
    if (entryId && (!entryName || forceEntryLookup || persistenceRevalidation)) {
      try {
        const entry = await getEntryInfo(
          entryId,
          forceEntryLookup || persistenceRevalidation
        );
        const persistence = entryPersistencePresentation(entry.persistenceState);
        entryName = entry.entryName || entry.teamName || "";
        entryLookupStatus = "FOUND";
        entryLookupMessage = persistence?.message ?? "";
        entryLookupRetryable = persistence?.retryable ?? false;
        entryPersistenceState = entry.persistenceState ?? "";
      } catch (error) {
        if (error instanceof EntryLookupError) {
          entryLookupStatus = error.status;
          entryLookupMessage = error.message;
          entryLookupRetryable = error.retryable;
          if (!error.retryable) {
            entryName = "";
            entryPersistenceState = "";
          }
        } else {
          entryLookupStatus = "UNAVAILABLE";
          entryLookupMessage = "当前无法确认球队数据，请稍后重试";
          entryLookupRetryable = true;
        }
      }
    }
    if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision) return;
    this.setData({
      contextResolved: true,
      entryId,
      entryName: entryId ? entryName : "",
      entryLookupStatus: entryId ? entryLookupStatus : "",
      entryLookupMessage: entryId ? entryLookupMessage : "",
      entryLookupRetryable: entryId ? entryLookupRetryable : false,
      entryPersistenceState: entryId ? entryPersistenceState : "",
      event: app.globalData.gw,
      currentGw: app.globalData.currentGw || 0
    });
    this.lastLoadAt = Date.now();
    this.loadedEntryId = entryId;
    this.loadedContextRevision = getAppContextSnapshot()?.contextRevision ?? 0;
  },

  onOpenEntryStrip() {
    if (this.data.entryId) {
      navigateTo(routes.liveEntry);
      return;
    }

    goToEntrySearch();
  },

  onRetryEntryIdentity() {
    if (!this.data.entryId || !this.data.entryLookupRetryable) return;
    return this.loadContext("page-show", true);
  },

  onChangeEntry() {
    goToEntrySearch();
  },

  onOpenCard(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { url: string }>) {
    // Cards always open — entry-scoped destinations render their own
    // no-entry empty state instead of blocking navigation here.
    navigateTo(event.currentTarget.dataset.url);
  }
});
