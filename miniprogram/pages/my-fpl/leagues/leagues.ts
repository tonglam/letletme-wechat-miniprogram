import { PerformancePage } from "../../../utils/performance-page";
import {
  getMyTournamentGameweekReview,
  getMyTournamentReviewCatalog,
  getMyTournamentSeasonReview,
  getMyTournamentSeasonReviewSection,
  type MyTournamentGameweekReview,
  type MyTournamentReviewCatalog,
  type MyTournamentReviewCatalogItem,
  type MyTournamentReviewFormat,
  type MyTournamentReviewPageInfo,
  type MyTournamentReviewPayload,
  type MyTournamentReviewScope,
  type MyTournamentReviewSeasonSection,
  type MyTournamentReviewState,
  type MyTournamentSeasonReview,
  type MyTournamentSeasonSection,
} from "../../../services/tournament.service";
import { goToEntrySearch, switchToLive } from "../../../utils/navigation";
import {
  canonicalAction,
  openWebsiteAction,
} from "../../../utils/canonical-action";
import {
  currentMyFplEntryId,
  refreshAuthoritativeFollow,
  waitForAuthoritativeFollow,
} from "../../../utils/follow";
import { getAppContextSnapshot } from "../../../services/app-context.service";
import {
  capturePageRequestTrace,
  isClientUpgradeRequired,
  isViewerEntryAuthorizationError,
  type PageRequestTrace,
} from "../../../services/graphql.service";

type LeagueView = "season" | "gameweek";
type LeagueEmptyState = "" | "entry" | "tournaments" | "view";
type ReviewRetryOperation = "catalog" | "review" | "loadMore";

interface ReviewSeasonDisplay {
  state: MyTournamentReviewState;
  tournamentId: number;
  throughEventId: number;
  latestFinalizedEventId: number | null;
  phases: MyTournamentSeasonReview["phases"];
}

interface LeaguesData {
  v2Scope: MyTournamentReviewScope;
  v2Catalog: MyTournamentReviewCatalog | null;
  v2TournamentNames: string[];
  v2SelectedTournamentIndex: number;
  v2SelectedTournament: MyTournamentReviewCatalogItem | null;
  v2EventIds: number[];
  v2SelectedEventIndex: number;
  v2Event: number;
  v2Format: MyTournamentReviewFormat | null;
  v2State: MyTournamentReviewState;
  v2StatusText: string;
  v2Gameweek: MyTournamentGameweekReview | null;
  v2Season: ReviewSeasonDisplay | null;
  v2SelectedPhaseId: string | null;
  v2SeasonSection: MyTournamentSeasonSection | null;
  v2Loading: boolean;
  v2LoadingMore: boolean;
  v2CatalogLoadingMore: boolean;
  v2HasNextPage: boolean;
  v2Error: string;
  v2UpgradeRequired: boolean;
  entryId: number;
  activeView: LeagueView;
  showSeason: boolean;
  showGameweek: boolean;
  emptyState: LeagueEmptyState;
  emptyEyebrow: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyActionText: string;
}

function stateText(state: MyTournamentReviewState): string {
  switch (state) {
    case "READY":
      return "已结算快照就绪";
    case "PENDING":
      return "正在生成已结算快照";
    case "WAITING_SOURCE":
      return "等待数据源结算";
    case "DEGRADED":
      return "快照延迟，已安排补偿";
    case "NOT_STARTED":
      return "尚未开始结算";
    default:
      return "暂无已结算快照";
  }
}

function catalogItems(
  catalog: MyTournamentReviewCatalog | null,
): MyTournamentReviewCatalogItem[] {
  return catalog?.edges?.map((edge) => edge.node) ?? [];
}

function mergeCatalogPages(
  previous: MyTournamentReviewCatalog | null,
  next: MyTournamentReviewCatalog,
): MyTournamentReviewCatalog {
  if (!previous) return next;
  const byTournamentId = new Map<
    number,
    { cursor: string; node: MyTournamentReviewCatalogItem }
  >();
  for (const edge of [...previous.edges, ...next.edges]) {
    byTournamentId.set(edge.node.tournamentId, edge);
  }
  return {
    ...next,
    edges: [...byTournamentId.values()],
  };
}

function eventIdsFromPhases(
  phases: MyTournamentReviewCatalogItem["phaseSummaries"],
  latest: number | null,
): number[] {
  // A review event is selectable only after the server has established a
  // finalized bound.  Phase metadata without that bound describes setup, not
  // a settled snapshot, and must not manufacture selectable GW ids.
  if (!latest || latest <= 0) return [];
  const ids = new Set<number>();
  for (const phase of phases) {
    const end = Math.min(phase.endEventId ?? latest, latest);
    for (let eventId = phase.startEventId; eventId <= end; eventId += 1) {
      if (eventId > 0) ids.add(eventId);
    }
  }
  ids.add(latest);
  return [...ids].sort((left, right) => left - right);
}

function payloadFormat(
  payload: MyTournamentReviewPayload | null | undefined,
): MyTournamentReviewFormat | null {
  return payload?.format ?? null;
}

function payloadCursor(
  payload: MyTournamentReviewPayload | null | undefined,
): string | null {
  if (!payload) return null;
  if (payload.format === "POINTS") return payload.points.nextCursor;
  if (payload.format === "H2H") return payload.h2h.nextCursor;
  return payload.knockout.nextCursor;
}

function payloadHasNext(
  payload: MyTournamentReviewPayload | null | undefined,
): boolean {
  if (!payload) return false;
  if (payload.format === "POINTS") return payload.points.hasNextPage;
  if (payload.format === "H2H") return payload.h2h.hasNextPage;
  return payload.knockout.hasNextPage;
}

function mergePayload(
  previous: MyTournamentReviewPayload | null,
  next: MyTournamentReviewPayload,
): MyTournamentReviewPayload {
  if (!previous || previous.format !== next.format) return next;
  if (next.format === "POINTS" && previous.format === "POINTS") {
    return {
      format: "POINTS",
      points: {
        ...next.points,
        rows: [...previous.points.rows, ...next.points.rows],
      },
    };
  }
  if (next.format === "H2H" && previous.format === "H2H") {
    return {
      format: "H2H",
      h2h: {
        ...next.h2h,
        matches: [...previous.h2h.matches, ...next.h2h.matches],
        standings: next.h2h.standings.length
          ? next.h2h.standings
          : previous.h2h.standings,
      },
    };
  }
  if (next.format === "KNOCKOUT" && previous.format === "KNOCKOUT") {
    return {
      format: "KNOCKOUT",
      knockout: {
        ...next.knockout,
        matches: [...previous.knockout.matches, ...next.knockout.matches],
      },
    };
  }
  return next;
}

function mergeSection(
  previous: MyTournamentSeasonSection | null,
  next: MyTournamentSeasonSection,
): MyTournamentSeasonSection {
  if (!previous) return next;
  return {
    ...next,
    points:
      previous.points && next.points
        ? {
            ...next.points,
            rows: [...previous.points.rows, ...next.points.rows],
          }
        : (next.points ?? previous.points),
    h2h:
      previous.h2h && next.h2h
        ? {
            ...next.h2h,
            matches: [...previous.h2h.matches, ...next.h2h.matches],
            standings: next.h2h.standings.length
              ? next.h2h.standings
              : previous.h2h.standings,
          }
        : (next.h2h ?? previous.h2h),
    knockout:
      previous.knockout && next.knockout
        ? {
            ...next.knockout,
            matches: [...previous.knockout.matches, ...next.knockout.matches],
          }
        : (next.knockout ?? previous.knockout),
  };
}

type SeasonSectionPages = Partial<
  Record<MyTournamentReviewSeasonSection, MyTournamentSeasonSection>
>;

function combineSeasonSections(
  pages: SeasonSectionPages,
): MyTournamentSeasonSection | null {
  const sections = Object.values(pages).filter(
    (section): section is MyTournamentSeasonSection => Boolean(section),
  );
  if (!sections.length) return null;
  const merged = sections.reduce(
    mergeSection,
    null as MyTournamentSeasonSection | null,
  );
  if (!merged) return null;
  // Each section has its own cursor.  The UI only needs the aggregate flag;
  // pagination uses seasonSectionPages below and never reuses this synthetic
  // cursor for another section.
  return {
    ...merged,
    pageInfo: {
      hasNextPage: sections.some((section) => section.pageInfo.hasNextPage),
      endCursor: null,
    },
  };
}

function reviewViewMeta(
  view: LeagueView,
  selected: MyTournamentReviewCatalogItem | null,
  season: ReviewSeasonDisplay | null,
  gameweek: MyTournamentGameweekReview | null,
  phaseId: string | null,
): { format: MyTournamentReviewFormat | null; state: MyTournamentReviewState } {
  if (view === "gameweek") {
    const format =
      payloadFormat(gameweek?.payload) ?? gameweek?.scope?.format ?? null;
    return {
      format: format ?? selected?.latestFinalizedScope?.format ?? null,
      state:
        gameweek?.state ??
        selected?.latestFinalizedScope?.state ??
        selected?.state ??
        "NOT_STARTED",
    };
  }
  const phase =
    season?.phases.find((candidate) => candidate.phaseId === phaseId) ??
    season?.phases.find(
      (candidate) =>
        candidate.startEventId <= (season?.throughEventId ?? 0) &&
        candidate.endEventId >= (season?.throughEventId ?? 0),
    );
  return {
    format: phase?.format ?? selected?.latestFinalizedScope?.format ?? null,
    state:
      phase?.state ??
      season?.state ??
      selected?.latestFinalizedScope?.state ??
      selected?.state ??
      "NOT_STARTED",
  };
}

function sectionForFormat(
  format: MyTournamentReviewFormat | null,
): MyTournamentReviewSeasonSection | null {
  if (format === "POINTS") return "POINTS_STANDINGS";
  if (format === "H2H") return "H2H_STANDINGS";
  if (format === "KNOCKOUT") return "KNOCKOUT_BRACKET";
  return null;
}

function sectionPageInfo(
  section: MyTournamentSeasonSection | null,
): MyTournamentReviewPageInfo {
  return section?.pageInfo ?? { hasNextPage: false, endCursor: null };
}

function persistLastPick(entryId: number, tournamentId: number): void {
  if (!entryId || !tournamentId) return;
  try {
    const picks = (wx.getStorageSync("my-fpl:tournament:last") || {}) as Record<
      string,
      number
    >;
    picks[String(entryId)] = tournamentId;
    wx.setStorageSync("my-fpl:tournament:last", picks);
  } catch {
    // A preference is best effort and never a source of review data.
  }
}

function readLastPick(entryId: number): number {
  try {
    const picks = wx.getStorageSync("my-fpl:tournament:last") as
      Record<string, number> | undefined;
    return Number(picks?.[String(entryId)]) || 0;
  } catch {
    return 0;
  }
}

function promptForUpgrade(): void {
  try {
    const manager = wx.getUpdateManager();
    manager.onUpdateReady(() => {
      wx.showModal({
        title: "需要升级",
        content: "赛事复盘已更新，请升级小程序后继续。",
        showCancel: false,
        success: () => manager.applyUpdate(),
      });
    });
    manager.onUpdateFailed(() => {
      wx.showToast({ title: "升级失败，请稍后重试", icon: "none" });
    });
  } catch {
    wx.showToast({ title: "请升级小程序后继续", icon: "none" });
  }
}

PerformancePage({
  data: {
    v2Scope: "ACCESSIBLE" as MyTournamentReviewScope,
    v2Catalog: null,
    v2TournamentNames: [] as string[],
    v2SelectedTournamentIndex: 0,
    v2SelectedTournament: null,
    v2EventIds: [] as number[],
    v2SelectedEventIndex: 0,
    v2Event: 0,
    v2Format: null,
    v2State: "NOT_STARTED" as MyTournamentReviewState,
    v2StatusText: stateText("NOT_STARTED"),
    v2Gameweek: null,
    v2Season: null,
    v2SelectedPhaseId: null,
    v2SeasonSection: null,
    v2Loading: true,
    v2LoadingMore: false,
    v2CatalogLoadingMore: false,
    v2HasNextPage: false,
    v2Error: "",
    v2UpgradeRequired: false,
    entryId: 0,
    activeView: "season" as LeagueView,
    showSeason: true,
    showGameweek: false,
    emptyState: "" as LeagueEmptyState,
    emptyEyebrow: "",
    emptyTitle: "",
    emptyDescription: "",
    emptyActionText: "",
  } as LeaguesData,

  pageVisible: false,
  hasShown: false,
  lifecycleRevision: 0,
  requestId: 0,
  viewRequestId: 0,
  retryOperation: null as ReviewRetryOperation | null,
  retryPhaseId: null as string | null,
  loadedEntryId: 0,
  loadedContextRevision: 0,
  loadedSeason: "" as string,
  resumeForceRefresh: false,
  catalogRequestSequence: 0,
  catalogAfter: null as string | null,
  seasonSectionPages: {} as SeasonSectionPages,
  seasonSectionContext: null as {
    tournamentId: number;
    eventId: number;
    phaseId: string;
    entryId: number;
  } | null,

  async onLoad() {
    this.pageVisible = true;
    const revision = this.lifecycleRevision;
    await waitForAuthoritativeFollow();
    if (!this.pageVisible || revision !== this.lifecycleRevision) return;
    try {
      await getApp<IAppOption>().initAppData(false);
    } catch {
      // The catalog request reports the actionable state below.
    }
    if (!this.pageVisible || revision !== this.lifecycleRevision) return;
    await this.loadCatalog(
      false,
      capturePageRequestTrace({
        callerSurface: "my-fpl-leagues-v2.1",
        trigger: "load",
      }),
    );
  },

  async onShow() {
    this.pageVisible = true;
    if (!this.hasShown) {
      this.hasShown = true;
      return;
    }
    const forceRefresh = this.resumeForceRefresh;
    await this.loadCatalog(
      forceRefresh,
      capturePageRequestTrace({
        callerSurface: "my-fpl-leagues-v2.1",
        trigger: forceRefresh ? "refresh" : "show",
        ...(forceRefresh ? { forceReason: "user-refresh" as const } : {}),
      }),
    );
    if (this.pageVisible) this.resumeForceRefresh = false;
  },

  onHide() {
    this.pageVisible = false;
    this.resumeForceRefresh =
      this.resumeForceRefresh ||
      this.data.v2Loading ||
      this.data.v2LoadingMore ||
      this.data.v2CatalogLoadingMore;
    this.lifecycleRevision += 1;
    this.requestId += 1;
    this.viewRequestId += 1;
    this.setData({
      v2Loading: false,
      v2LoadingMore: false,
      v2CatalogLoadingMore: false,
    });
  },

  onUnload() {
    this.pageVisible = false;
    this.resumeForceRefresh = false;
    this.lifecycleRevision += 1;
    this.requestId += 1;
    this.viewRequestId += 1;
  },

  async onPullDownRefresh() {
    try {
      await this.loadCatalog(
        true,
        capturePageRequestTrace({
          callerSurface: "my-fpl-leagues-v2.1",
          trigger: "refresh",
          forceReason: "user-refresh",
        }),
      );
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  async loadCatalog(
    forceRefresh = false,
    trace?: PageRequestTrace,
    scopeOverride?: MyTournamentReviewScope,
    after: string | null = null,
    append = false,
  ) {
    const requestId = ++this.requestId;
    const expectedEntryId = currentMyFplEntryId() || 0;
    const scope = scopeOverride ?? this.data.v2Scope;
    const active = () =>
      this.pageVisible &&
      requestId === this.requestId &&
      (!expectedEntryId || currentMyFplEntryId() === expectedEntryId);
    this.retryOperation = "catalog";
    this.setData({
      v2Loading: !append,
      v2LoadingMore: false,
      v2CatalogLoadingMore: append,
      v2Error: "",
      v2UpgradeRequired: false,
      v2Scope: scope,
      entryId: expectedEntryId,
      emptyState: "",
    });
    try {
      const entryId = (await refreshAuthoritativeFollow()) || 0;
      if (!active()) return;
      if (!entryId && scope !== "ALL") {
        this.showEntryEmptyState();
        return;
      }
      let catalog: MyTournamentReviewCatalog;
      try {
        catalog = await getMyTournamentReviewCatalog(
          scope,
          forceRefresh,
          trace,
          entryId,
          after,
          null,
          100,
        );
      } catch (error) {
        if (scope !== "ALL" || !isViewerEntryAuthorizationError(error)) {
          throw error;
        }
        catalog = await getMyTournamentReviewCatalog(
          "ACCESSIBLE",
          true,
          trace,
          entryId,
          after,
          null,
          100,
        );
        if (active()) this.setData({ v2Scope: "ACCESSIBLE" });
      }
      if (!active() || currentMyFplEntryId() !== entryId) return;
      // Re-read the Web-owned binding immediately before committing the
      // catalog. A binding can change between the network response and this
      // state update; never attach the response to the new entry by accident.
      const authoritativeEntryId = currentMyFplEntryId() || 0;
      if (authoritativeEntryId !== entryId) return;
      if (catalog.viewerEntryId && Number(catalog.viewerEntryId) !== entryId) {
        throw new Error("球队绑定已变更，请稍后重试");
      }
      const mergedCatalog = append
        ? mergeCatalogPages(this.data.v2Catalog, catalog)
        : catalog;
      const items = catalogItems(mergedCatalog);
      const lastPick = readLastPick(entryId);
      const previousId = this.data.v2SelectedTournament?.tournamentId ?? 0;
      const selected =
        items.find((item) => item.tournamentId === previousId) ??
        items.find((item) => item.tournamentId === lastPick) ??
        items[0] ??
        null;
      const selectedIndex = selected
        ? Math.max(
            0,
            items.findIndex(
              (item) => item.tournamentId === selected.tournamentId,
            ),
          )
        : 0;
      const eventIds = selected
        ? eventIdsFromPhases(
            selected.phaseSummaries,
            selected.latestFinalizedEventId,
          )
        : [];
      const previousEventId = this.data.v2Event;
      const eventId =
        selected &&
        previousId === selected.tournamentId &&
        eventIds.includes(previousEventId)
          ? previousEventId
          : (selected?.latestFinalizedEventId ?? 0);
      const aggregateState =
        selected?.latestFinalizedScope?.state ??
        selected?.state ??
        mergedCatalog.state ??
        "NOT_STARTED";
      this.loadedEntryId = entryId;
      this.loadedContextRevision =
        getAppContextSnapshot()?.contextRevision ?? 0;
      this.loadedSeason = getApp<IAppOption>().globalData.season || "";
      this.catalogAfter = mergedCatalog.pageInfo.endCursor;
      this.retryOperation = null;
      if (append) {
        // Appending catalog pages must not reset the active review, GW, phase,
        // or its in-flight visual state.  Only the connection and picker
        // labels change; a newly discovered tournament is selected explicitly
        // by the user later.
        this.setData({
          entryId,
          v2Catalog: mergedCatalog,
          v2TournamentNames: items.map((item) => item.name),
          v2CatalogLoadingMore: false,
        });
        return;
      }
      this.setData({
        entryId,
        v2Catalog: mergedCatalog,
        v2TournamentNames: items.map((item) => item.name),
        v2SelectedTournamentIndex: selectedIndex,
        v2SelectedTournament: selected,
        v2EventIds: eventIds,
        v2SelectedEventIndex: Math.max(0, eventIds.indexOf(eventId)),
        v2Event: eventId,
        v2Format: selected?.latestFinalizedScope?.format ?? null,
        v2State: aggregateState,
        v2StatusText: stateText(aggregateState),
        v2Gameweek: null,
        v2Season: null,
        v2SelectedPhaseId: null,
        v2SeasonSection: null,
        v2Loading: append ? this.data.v2Loading : Boolean(selected && eventId),
        v2CatalogLoadingMore: false,
        v2HasNextPage: false,
        emptyState: selected
          ? ""
          : items.length || mergedCatalog.state !== "NOT_STARTED"
            ? "view"
            : "tournaments",
      });
      if (!append) {
        this.seasonSectionPages = {};
        this.seasonSectionContext = null;
      }
      if (!append && selected && eventId) {
        await this.loadReview(
          selected.tournamentId,
          eventId,
          forceRefresh,
          trace,
        );
      }
    } catch (error) {
      if (!active()) return;
      if (isClientUpgradeRequired(error)) {
        promptForUpgrade();
        this.retryOperation = "catalog";
        this.setData({
          v2Loading: false,
          v2CatalogLoadingMore: false,
          v2UpgradeRequired: true,
          v2Error: "赛事复盘需要升级小程序后继续",
        });
      } else {
        this.retryOperation = "catalog";
        const errorState: Partial<LeaguesData> = {
          v2Loading: false,
          v2CatalogLoadingMore: false,
          v2Error:
            error instanceof Error ? error.message : "赛事复盘目录暂时不可用",
        };
        if (!append) {
          errorState.v2State = "UNAVAILABLE";
          errorState.v2StatusText = stateText("UNAVAILABLE");
        }
        this.setData(errorState);
      }
    }
  },

  async loadReview(
    tournamentId: number,
    eventId: number,
    forceRefresh = false,
    trace?: PageRequestTrace,
    after: string | null = null,
  ) {
    const requestId = ++this.viewRequestId;
    const expectedEntryId = this.data.entryId || currentMyFplEntryId() || 0;
    const catalogRevision =
      this.data.v2SelectedTournament?.latestFinalizedScope?.revision ?? null;
    const active = () =>
      this.pageVisible &&
      requestId === this.viewRequestId &&
      this.data.v2SelectedTournament?.tournamentId === tournamentId &&
      this.data.v2Event === eventId &&
      (!expectedEntryId || currentMyFplEntryId() === expectedEntryId);
    this.retryOperation = "review";
    this.retryPhaseId = null;
    this.setData({
      v2Loading: true,
      v2LoadingMore: Boolean(after),
      v2Error: "",
    });
    try {
      const [gameweek, season] = await Promise.all([
        getMyTournamentGameweekReview(
          tournamentId,
          eventId,
          forceRefresh,
          trace,
          after,
          this.data.v2Gameweek?.scope?.revision ?? null,
          this.data.entryId,
          catalogRevision,
        ),
        after
          ? Promise.resolve(this.data.v2Season)
          : getMyTournamentSeasonReview(
              tournamentId,
              eventId,
              forceRefresh,
              trace,
              this.data.entryId,
            ),
      ]);
      if (!active() || !season) return;
      let nextGameweek = gameweek;
      if (after && this.data.v2Gameweek?.payload && gameweek.payload) {
        nextGameweek = {
          ...gameweek,
          payload: mergePayload(this.data.v2Gameweek.payload, gameweek.payload),
        };
      }
      let section = this.data.v2SeasonSection;
      const phase = season.phases.find(
        (candidate) =>
          candidate.startEventId <= eventId && candidate.endEventId >= eventId,
      );
      if (!after && phase?.state === "READY") {
        const format = phase?.format ?? payloadFormat(gameweek.payload);
        const baseSection = sectionForFormat(format);
        if (phase?.revision && phase.semanticSha256 && baseSection) {
          const requests = [
            getMyTournamentSeasonReviewSection(
              tournamentId,
              eventId,
              phase.phaseId,
              baseSection,
              phase.revision,
              phase.semanticSha256,
              forceRefresh,
              trace,
              null,
              this.data.entryId,
            ),
          ];
          if (format === "POINTS") {
            requests.push(
              getMyTournamentSeasonReviewSection(
                tournamentId,
                eventId,
                phase.phaseId,
                "POINTS_TRAJECTORIES",
                phase.revision,
                phase.semanticSha256,
                forceRefresh,
                trace,
                null,
                this.data.entryId,
              ),
            );
          }
          if (format === "H2H") {
            requests.push(
              getMyTournamentSeasonReviewSection(
                tournamentId,
                eventId,
                phase.phaseId,
                "H2H_FIXTURES",
                phase.revision,
                phase.semanticSha256,
                forceRefresh,
                trace,
                null,
                this.data.entryId,
              ),
            );
          }
          const settledSections = await Promise.allSettled(requests);
          const primarySection = settledSections[0];
          if (!primarySection) throw new Error("赛事阶段暂时不可用");
          if (primarySection.status === "rejected") throw primarySection.reason;
          // Standings are the primary review. An auxiliary trajectory/fixture
          // projection may be retried independently without hiding a valid
          // primary section behind one failed request.
          const sections = settledSections.flatMap((result) =>
            result.status === "fulfilled" ? [result.value] : [],
          );
          if (!active()) return;
          this.seasonSectionPages = Object.fromEntries(
            sections.map((candidate) => [candidate.section, candidate]),
          ) as SeasonSectionPages;
          this.seasonSectionContext = {
            tournamentId,
            eventId,
            phaseId: phase.phaseId,
            entryId: expectedEntryId,
          };
          section = combineSeasonSections(this.seasonSectionPages);
        }
      } else if (!after) {
        this.seasonSectionPages = {};
        this.seasonSectionContext = null;
      }
      const selected = this.data.v2SelectedTournament;
      const eventIds = selected
        ? eventIdsFromPhases(
            selected.phaseSummaries,
            selected.latestFinalizedEventId,
          )
        : [eventId];
      const nextSeason: ReviewSeasonDisplay = {
        state: season.state,
        tournamentId: season.tournamentId,
        throughEventId: season.throughEventId,
        latestFinalizedEventId: season.latestFinalizedEventId,
        phases: season.phases,
      };
      const visibleMeta = reviewViewMeta(
        this.data.activeView,
        selected,
        nextSeason,
        nextGameweek,
        phase?.phaseId ?? null,
      );
      const visibleState = visibleMeta.state;
      this.retryOperation = null;
      this.retryPhaseId = null;
      this.setData({
        v2Loading: false,
        v2LoadingMore: false,
        v2Gameweek: nextGameweek,
        v2Season: nextSeason,
        v2SelectedPhaseId: phase?.phaseId ?? null,
        v2SeasonSection: section,
        v2EventIds: eventIds,
        v2SelectedEventIndex: Math.max(0, eventIds.indexOf(eventId)),
        v2Format: visibleMeta.format,
        v2State: visibleState,
        v2StatusText: stateText(visibleState),
        v2HasNextPage:
          this.data.activeView === "season"
            ? sectionPageInfo(section).hasNextPage
            : payloadHasNext(nextGameweek.payload),
        emptyState: "",
      });
    } catch (error) {
      if (!active()) return;
      if (isClientUpgradeRequired(error)) {
        promptForUpgrade();
        this.setData({
          v2Loading: false,
          v2LoadingMore: false,
          v2UpgradeRequired: true,
          v2Error: "赛事复盘需要升级小程序后继续",
        });
      } else {
        this.retryOperation = "review";
        this.setData({
          v2Loading: false,
          v2LoadingMore: false,
          v2State: "UNAVAILABLE",
          v2StatusText: stateText("UNAVAILABLE"),
          v2Error:
            error instanceof Error ? error.message : "赛事复盘暂时不可用",
        });
      }
    }
  },

  async loadSeasonPhase(phaseId: string) {
    const selected = this.data.v2SelectedTournament;
    const season = this.data.v2Season;
    const eventId = this.data.v2Event;
    if (!selected || !season || !eventId) return;
    const phase = season.phases.find(
      (candidate) => candidate.phaseId === phaseId,
    );
    if (!phase) return;
    const requestId = ++this.viewRequestId;
    const expectedEntryId = this.data.entryId || currentMyFplEntryId() || 0;
    const active = () =>
      this.pageVisible &&
      requestId === this.viewRequestId &&
      this.data.activeView === "season" &&
      this.data.v2SelectedTournament?.tournamentId === selected.tournamentId &&
      this.data.v2Event === eventId &&
      this.data.v2SelectedPhaseId === phaseId &&
      (!expectedEntryId || currentMyFplEntryId() === expectedEntryId);
    this.setData({
      v2SelectedPhaseId: phaseId,
      v2Format: phase.format,
      v2State: phase.state,
      v2StatusText: stateText(phase.state),
      v2SeasonSection: null,
      v2Loading: true,
      v2LoadingMore: false,
      v2HasNextPage: false,
      v2Error: "",
    });
    if (phase.state !== "READY" || !phase.revision || !phase.semanticSha256) {
      this.seasonSectionPages = {};
      this.seasonSectionContext = null;
      this.setData({ v2Loading: false });
      return;
    }
    try {
      const baseSection = sectionForFormat(phase.format);
      if (!baseSection) throw new Error("赛事阶段类型待发布");
      const requests = [
        getMyTournamentSeasonReviewSection(
          selected.tournamentId,
          eventId,
          phase.phaseId,
          baseSection,
          phase.revision,
          phase.semanticSha256,
          true,
          capturePageRequestTrace({
            callerSurface: "my-fpl-leagues-v2.1",
            trigger: "tab",
          }),
          null,
          this.data.entryId,
        ),
      ];
      if (phase.format === "POINTS") {
        requests.push(
          getMyTournamentSeasonReviewSection(
            selected.tournamentId,
            eventId,
            phase.phaseId,
            "POINTS_TRAJECTORIES",
            phase.revision,
            phase.semanticSha256,
            true,
            capturePageRequestTrace({
              callerSurface: "my-fpl-leagues-v2.1",
              trigger: "tab",
            }),
            null,
            this.data.entryId,
          ),
        );
      }
      if (phase.format === "H2H") {
        requests.push(
          getMyTournamentSeasonReviewSection(
            selected.tournamentId,
            eventId,
            phase.phaseId,
            "H2H_FIXTURES",
            phase.revision,
            phase.semanticSha256,
            true,
            capturePageRequestTrace({
              callerSurface: "my-fpl-leagues-v2.1",
              trigger: "tab",
            }),
            null,
            this.data.entryId,
          ),
        );
      }
      const settledSections = await Promise.allSettled(requests);
      const primarySection = settledSections[0];
      if (!primarySection) throw new Error("赛事阶段暂时不可用");
      if (primarySection.status === "rejected") throw primarySection.reason;
      const sections = settledSections.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      if (!active()) return;
      this.seasonSectionPages = Object.fromEntries(
        sections.map((candidate) => [candidate.section, candidate]),
      ) as SeasonSectionPages;
      this.seasonSectionContext = {
        tournamentId: selected.tournamentId,
        eventId,
        phaseId,
        entryId: expectedEntryId,
      };
      const section = combineSeasonSections(this.seasonSectionPages);
      this.setData({
        v2SeasonSection: section,
        v2Loading: false,
        v2State: section?.state ?? phase.state,
        v2StatusText: stateText(section?.state ?? phase.state),
        v2HasNextPage: sectionPageInfo(section).hasNextPage,
      });
    } catch (error) {
      if (!active()) return;
      if (isClientUpgradeRequired(error)) {
        promptForUpgrade();
        this.setData({
          v2Loading: false,
          v2UpgradeRequired: true,
          v2Error: "赛事复盘需要升级小程序后继续",
        });
      } else {
        this.retryOperation = "review";
        this.retryPhaseId = phaseId;
        this.setData({
          v2Loading: false,
          v2State: "UNAVAILABLE",
          v2StatusText: stateText("UNAVAILABLE"),
          v2Error:
            error instanceof Error ? error.message : "赛事阶段暂时不可用",
        });
      }
    }
  },

  async onV2LoadMore() {
    if (this.data.v2Loading || this.data.v2LoadingMore) return;
    const selected = this.data.v2SelectedTournament;
    if (!selected || !this.data.v2Event) return;
    if (this.data.activeView === "season") {
      const section = this.data.v2SeasonSection;
      const phase =
        this.data.v2Season?.phases.find(
          (candidate) => candidate.phaseId === this.data.v2SelectedPhaseId,
        ) ??
        this.data.v2Season?.phases.find(
          (candidate) =>
            candidate.startEventId <= this.data.v2Event &&
            candidate.endEventId >= this.data.v2Event,
        );
      const context = this.seasonSectionContext;
      const pages = this.seasonSectionPages;
      const pendingSections = Object.values(pages).filter(
        (candidate): candidate is MyTournamentSeasonSection =>
          Boolean(candidate?.pageInfo.hasNextPage),
      );
      if (
        !section ||
        !phase?.revision ||
        !phase.semanticSha256 ||
        !context ||
        context.tournamentId !== selected.tournamentId ||
        context.eventId !== this.data.v2Event ||
        context.phaseId !== phase.phaseId ||
        !pendingSections.length
      )
        return;
      const requestId = ++this.viewRequestId;
      const expectedEntryId = this.data.entryId || currentMyFplEntryId() || 0;
      const active = () =>
        this.pageVisible &&
        requestId === this.viewRequestId &&
        this.data.activeView === "season" &&
        this.data.v2SelectedTournament?.tournamentId ===
          selected.tournamentId &&
        this.data.v2Event === context.eventId &&
        this.data.v2SelectedPhaseId === context.phaseId &&
        (!expectedEntryId || currentMyFplEntryId() === expectedEntryId);
      this.retryOperation = "loadMore";
      this.setData({ v2LoadingMore: true, v2Error: "" });
      try {
        const nextSections = await Promise.all(
          pendingSections.map((current) =>
            getMyTournamentSeasonReviewSection(
              selected.tournamentId,
              context.eventId,
              current.phaseId,
              current.section,
              current.revision,
              current.semanticSha256,
              true,
              capturePageRequestTrace({
                callerSurface: "my-fpl-leagues-v2.1",
                trigger: "pagination",
              }),
              current.pageInfo.endCursor,
              expectedEntryId,
            ),
          ),
        );
        if (!active()) return;
        const nextPages: SeasonSectionPages = { ...pages };
        for (const next of nextSections) {
          const previous = nextPages[next.section];
          nextPages[next.section] = previous
            ? mergeSection(previous, next)
            : next;
        }
        this.seasonSectionPages = nextPages;
        const combined = combineSeasonSections(nextPages);
        this.setData({
          v2SeasonSection: combined,
          v2LoadingMore: false,
          v2HasNextPage: sectionPageInfo(combined).hasNextPage,
        });
        this.retryOperation = null;
        this.retryPhaseId = null;
      } catch (error) {
        if (!active()) return;
        this.setData({
          v2LoadingMore: false,
          v2Error: error instanceof Error ? error.message : "加载更多失败",
        });
      }
      return;
    }
    const after = payloadCursor(this.data.v2Gameweek?.payload);
    if (!after) return;
    await this.loadReview(
      selected.tournamentId,
      this.data.v2Event,
      true,
      capturePageRequestTrace({
        callerSurface: "my-fpl-leagues-v2.1",
        trigger: "pagination",
      }),
      after,
    );
  },

  async onCatalogLoadMore() {
    if (
      this.data.v2Loading ||
      this.data.v2CatalogLoadingMore ||
      !this.data.v2Catalog?.pageInfo.hasNextPage ||
      !this.catalogAfter
    )
      return;
    await this.loadCatalog(
      false,
      capturePageRequestTrace({
        callerSurface: "my-fpl-leagues-v2.1",
        trigger: "pagination",
      }),
      this.data.v2Scope,
      this.catalogAfter,
      true,
    );
  },

  selectTournament(index: number) {
    const selected = catalogItems(this.data.v2Catalog)[index];
    if (!selected) return;
    const eventIds = eventIdsFromPhases(
      selected.phaseSummaries,
      selected.latestFinalizedEventId,
    );
    const eventId = selected?.latestFinalizedEventId ?? 0;
    this.viewRequestId += 1;
    this.seasonSectionPages = {};
    this.seasonSectionContext = null;
    this.retryOperation = null;
    persistLastPick(this.data.entryId, selected.tournamentId);
    this.setData({
      v2SelectedTournamentIndex: index,
      v2SelectedTournament: selected,
      v2EventIds: eventIds,
      v2SelectedEventIndex: Math.max(0, eventIds.indexOf(eventId)),
      v2Event: eventId,
      v2Format: selected.latestFinalizedScope?.format ?? null,
      v2State: selected.latestFinalizedScope?.state ?? selected.state,
      v2StatusText: stateText(
        selected.latestFinalizedScope?.state ?? selected.state,
      ),
      v2Gameweek: null,
      v2Season: null,
      v2SelectedPhaseId: null,
      v2SeasonSection: null,
      v2Loading: Boolean(eventId),
      v2HasNextPage: false,
      v2Error: "",
      emptyState: eventId ? "" : "view",
    });
    if (eventId) {
      void this.loadReview(
        selected.tournamentId,
        eventId,
        false,
        capturePageRequestTrace({
          callerSurface: "my-fpl-leagues-v2.1",
          trigger: "tab",
        }),
      );
    }
  },

  onTournamentChange(event: WechatMiniprogram.PickerChange) {
    this.selectTournament(Number(event.detail.value));
  },

  onGwChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value);
    const eventId = this.data.v2EventIds[index];
    const selected = this.data.v2SelectedTournament;
    if (!selected || !eventId) return;
    this.setData({
      v2SelectedEventIndex: index,
      v2Event: eventId,
      v2Loading: true,
      v2Gameweek: null,
      v2Season: null,
      v2SelectedPhaseId: null,
      v2SeasonSection: null,
      v2Error: "",
    });
    this.seasonSectionPages = {};
    this.seasonSectionContext = null;
    void this.loadReview(
      selected.tournamentId,
      eventId,
      false,
      capturePageRequestTrace({
        callerSurface: "my-fpl-leagues-v2.1",
        trigger: "tab",
      }),
    );
  },

  onViewTap(event: WechatMiniprogram.TouchEvent) {
    const nextView: LeagueView =
      event.currentTarget.dataset.view === "gameweek" ? "gameweek" : "season";
    if (nextView !== this.data.activeView) {
      // A phase request started in the hidden view must not commit after the
      // user changes tabs. The request is allowed to finish on the wire, but
      // its result is stale by definition.
      this.viewRequestId += 1;
    }
    const selected = this.data.v2SelectedTournament;
    const season = this.data.v2Season;
    const gameweek = this.data.v2Gameweek;
    const phase =
      season?.phases.find(
        (candidate) => candidate.phaseId === this.data.v2SelectedPhaseId,
      ) ??
      season?.phases.find(
        (candidate) =>
          candidate.startEventId <= this.data.v2Event &&
          candidate.endEventId >= this.data.v2Event,
      );
    const meta = reviewViewMeta(
      nextView,
      selected,
      season,
      gameweek,
      phase?.phaseId ?? null,
    );
    const visibleState =
      nextView === "season"
        ? this.seasonSectionContext?.phaseId === phase?.phaseId
          ? (this.data.v2SeasonSection?.state ?? meta.state)
          : meta.state
        : meta.state;
    this.setData({
      activeView: nextView,
      showSeason: nextView === "season",
      showGameweek: nextView === "gameweek",
      v2Format: meta.format,
      v2State: visibleState,
      v2StatusText: stateText(visibleState),
      v2SelectedPhaseId:
        nextView === "season"
          ? (phase?.phaseId ?? this.data.v2SelectedPhaseId)
          : this.data.v2SelectedPhaseId,
      v2HasNextPage:
        nextView === "season"
          ? sectionPageInfo(this.data.v2SeasonSection).hasNextPage
          : payloadHasNext(this.data.v2Gameweek?.payload),
    });
    if (
      nextView === "season" &&
      phase &&
      (!this.data.v2SeasonSection ||
        this.seasonSectionContext?.phaseId !== phase.phaseId)
    ) {
      void this.loadSeasonPhase(phase.phaseId);
    }
  },

  onPhaseTap(event: WechatMiniprogram.TouchEvent) {
    const phaseId = String(event.currentTarget.dataset.phaseId || "");
    if (!phaseId || this.data.activeView !== "season") return;
    if (phaseId === this.data.v2SelectedPhaseId) return;
    void this.loadSeasonPhase(phaseId);
  },

  onV2ScopeTap() {
    if (!this.data.v2Catalog?.adminReadAll) return;
    void this.loadCatalog(
      true,
      capturePageRequestTrace({
        callerSurface: "my-fpl-leagues-v2.1",
        trigger: "refresh",
      }),
      this.data.v2Scope === "ALL" ? "ACCESSIBLE" : "ALL",
    );
  },

  onRetry() {
    if (
      this.retryOperation === "loadMore" &&
      this.data.activeView === "season"
    ) {
      void this.onV2LoadMore();
      return;
    }
    if (
      this.retryOperation === "review" &&
      this.data.activeView === "season" &&
      this.retryPhaseId
    ) {
      void this.loadSeasonPhase(this.retryPhaseId);
      return;
    }
    if (
      this.retryOperation === "review" ||
      this.retryOperation === "loadMore"
    ) {
      const selected = this.data.v2SelectedTournament;
      if (selected && this.data.v2Event) {
        void this.loadReview(
          selected.tournamentId,
          this.data.v2Event,
          true,
          capturePageRequestTrace({
            callerSurface: "my-fpl-leagues-v2.1",
            trigger: "refresh",
          }),
        );
        return;
      }
    }
    void this.loadCatalog(
      true,
      capturePageRequestTrace({
        callerSurface: "my-fpl-leagues-v2.1",
        trigger: "refresh",
      }),
    );
  },

  showEntryEmptyState() {
    this.retryOperation = null;
    this.viewRequestId += 1;
    this.catalogAfter = null;
    this.seasonSectionPages = {};
    this.seasonSectionContext = null;
    this.setData({
      entryId: 0,
      v2Catalog: null,
      v2TournamentNames: [],
      v2SelectedTournament: null,
      v2EventIds: [],
      v2SelectedEventIndex: 0,
      v2Event: 0,
      v2Format: null,
      v2State: "NOT_STARTED",
      v2StatusText: stateText("NOT_STARTED"),
      v2Gameweek: null,
      v2Season: null,
      v2SelectedPhaseId: null,
      v2SeasonSection: null,
      v2Loading: false,
      v2LoadingMore: false,
      v2CatalogLoadingMore: false,
      v2HasNextPage: false,
      v2Error: "",
      emptyState: "entry",
      emptyEyebrow: "需要球队",
      emptyTitle: "先选择我的球队",
      emptyDescription: "绑定我的球队后即可查看参加的赛事复盘。",
      emptyActionText: "去选择球队",
    });
  },

  onEmptyAction() {
    if (this.data.emptyState === "entry") {
      goToEntrySearch();
      return;
    }
    if (this.data.v2State !== "NOT_STARTED") {
      this.onRetry();
      return;
    }
    void this.onOpenWebsite();
  },

  async onOpenWebsite() {
    await openWebsiteAction(canonicalAction("MANAGE_COMPETITION"));
  },

  onGoLive() {
    switchToLive();
  },
});
