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
  requestId: 0,

  async onLoad() {
    const app = getApp<IAppOption>();
    if (!app.globalData.gw) {
      try { await app.initAppData(); } catch { /* the picker just falls back to GW 1 */ }
    }
    const gw = Math.max(1, Number(getApp<IAppOption>().globalData.gw) || 1);
    this.setData({ startEvent: gw });
    await this.load();
  },

  onPullDownRefresh() {
    this.load(true).finally(() => wx.stopPullDownRefresh());
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
        getTeamList(season)
      ]);
      if (requestId !== this.requestId) return;
      this.fixtures = fixtures;
      this.teams = teams;
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
