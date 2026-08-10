import { getSeasonFixture } from "../../../services/fixture.service";
import { getTeamList } from "../../../services/common.service";
import type { Fixture } from "../../../models/common";
import {
  buildFixtureRuns,
  maxFixtureEvent,
  normalizeHorizon,
  type FixtureRun,
  type FixtureRunTeam
} from "../../../utils/fixture-run";
import { durationBucket, recordExploreVisit } from "../../../utils/perf";

const FALLBACK_MAX_EVENT = 38;

Page({
  data: {
    loading: true,
    error: "",
    startEvent: 1,
    maxEvent: FALLBACK_MAX_EVENT,
    horizon: 3 as 3 | 5,
    runs: [] as FixtureRun[]
  },

  // Payload mirrors outside data — rebuilding on control changes must not
  // refetch, and setData never carries the full season fixture list.
  fixtures: [] as Fixture[],
  teams: [] as FixtureRunTeam[],
  loadedSeason: undefined as string | undefined,
  requestId: 0,
  hasShown: false,

  async onLoad() {
    await this.syncEventContext(true);
    await this.load();
  },

  async onShow() {
    const resumed = this.hasShown;
    this.hasShown = true;
    if (!resumed) return;
    const seasonChanged = await this.syncEventContext(true);
    // A normal cached read lets the fixture service's 30-minute TTL bound
    // staleness. A season rollover bypasses both fixture and team caches.
    await this.load(seasonChanged);
  },

  onPullDownRefresh() {
    this.syncEventContext(true)
      .then(() => this.load(true))
      .finally(() => wx.stopPullDownRefresh());
  },

  async syncEventContext(forceRefresh = false) {
    const app = getApp<IAppOption>();
    try { await app.initAppData(forceRefresh); } catch { /* the picker falls back to GW 1 */ }
    const season = app.globalData.season;
    const seasonChanged = Boolean(this.loadedSeason && season && this.loadedSeason !== season);
    const gw = Math.max(1, Number(app.globalData.gw) || 1);
    if (seasonChanged) {
      // Never relabel last season's payload as the new season. A failed reload
      // must show unavailable, not stale clubs under the new GW picker.
      this.fixtures = [];
      this.teams = [];
      this.setData({ startEvent: gw, maxEvent: FALLBACK_MAX_EVENT, runs: [] });
      return true;
    }
    this.setData({ startEvent: gw });
    // Recompose retained fixture payload immediately. If the subsequent
    // refresh fails, the picker and cards still describe the same event.
    if (this.teams.length) {
      this.rebuild();
    }
    return false;
  },

  async load(forceRefresh = false) {
    const requestId = ++this.requestId;
    const loadStart = Date.now();
    const hadLastGood = this.teams.length > 0;
    this.setData({ loading: !hadLastGood, error: "" });
    try {
      const season = getApp<IAppOption>().globalData.season;
      const [fixtures, teams] = await Promise.all([
        getSeasonFixture(season, forceRefresh),
        getTeamList(season, forceRefresh)
      ]);
      if (requestId !== this.requestId) return;
      this.fixtures = fixtures;
      this.teams = teams;
      this.loadedSeason = season;
      const maxEvent = maxFixtureEvent(fixtures) || FALLBACK_MAX_EVENT;
      const startEvent = Math.min(Math.max(1, this.data.startEvent), maxEvent);
      this.setData({ loading: false, maxEvent, startEvent });
      this.rebuild();
      // Composition settled (plan §9): window and duration only — team
      // names never enter a record.
      recordExploreVisit({
        surface: "fixtures",
        contractSource: "compat",
        eventId: startEvent,
        horizon: this.data.horizon,
        cacheOutcome: hadLastGood ? "last-good" : "miss",
        durationBucket: durationBucket(Date.now() - loadStart)
      });
    } catch (error) {
      if (requestId !== this.requestId) return;
      // Last-good retention: a failed refresh keeps the previous cards.
      this.setData({
        loading: false,
        error: this.teams.length
          ? "刷新失败，当前显示上次成功结果"
          : error instanceof Error ? error.message : "赛程加载失败"
      });
    }
  },

  rebuild() {
    if (!this.teams.length) {
      this.setData({ runs: [] });
      return;
    }
    const runs = buildFixtureRuns(this.fixtures, this.teams, this.data.startEvent, this.data.horizon);
    this.setData({ runs });
  },

  onGwChange(event: WechatMiniprogram.CustomEvent<{ value: number }>) {
    this.setData({ startEvent: Number(event.detail.value) || 1 });
    this.rebuild();
  },

  onHorizonChange(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { horizon: number }>) {
    this.setData({ horizon: normalizeHorizon(Number(event.currentTarget.dataset.horizon)) });
    this.rebuild();
  },

  onRetry() {
    void this.load(true);
  }
});
