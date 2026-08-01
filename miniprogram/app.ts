import { getCurrentEventAndDeadline } from "./services/common.service";
import { formatDeadline } from "./utils/date";
import { getEntryId } from "./utils/storage";
import { refreshWechatApiSession } from "./services/auth.service";
import { MiniProgramLinkRequiredError } from "./services/auth-session";
import { routes } from "./config/routes";
import { recordLaunch } from "./utils/perf";
import { resolveEventContext } from "./utils/event-context";

App<IAppOption>({
  globalData: {
    season: "",
    gw: 0,
    lastGw: 0,
    nextGw: 0,
    utcDeadline: "",
    deadline: "",
    entryId: undefined,
    openid: undefined
  },

  _pendingInit: null as Promise<void> | null,

  async onLaunch() {
    const launchStart = Date.now();
    this.globalData.entryId = getEntryId();
    this.requirePrivacyAndLogin();
    await this.initAppData();
    recordLaunch(Date.now() - launchStart);
  },

  requirePrivacyAndLogin() {
    wx.requirePrivacyAuthorize({
      success: () => {
        this.doLogin();
      },
      fail: () => {
        this.doLogin();
      },
    });
  },

  doLogin() {
    // Restore the valid 30-day session immediately. A successful background
    // WeChat login rotates it; transient/network failures leave it usable.
    this.globalData.entryId = getEntryId();
    refreshWechatApiSession().then((session) => {
      if (session.profile.fplEntryId && session.profile.fplEntryVerifiedAt) {
        this.globalData.entryId = session.profile.fplEntryId;
      }
    }).catch((error) => {
      if (error instanceof MiniProgramLinkRequiredError) {
        wx.reLaunch({ url: routes.accountLink });
      }
    });
  },

  async initAppData() {
    if (this._pendingInit) {
      return this._pendingInit;
    }

    const promise = this._initAppDataInner();
    this._pendingInit = promise;
    try {
      return await promise;
    } finally {
      this._pendingInit = null;
    }
  },

  async _initAppDataInner() {
    try {
      const current = await getCurrentEventAndDeadline();
      const eventContext = resolveEventContext(current.currentEvent, current.nextEvent);
      const utcDeadline = String(current.utcDeadline || current.deadline || "");

      this.globalData.season = String(current.season || "");
      this.globalData.gw = eventContext.gw;
      this.globalData.lastGw = eventContext.lastGw;
      this.globalData.nextGw = eventContext.nextGw;
      this.globalData.utcDeadline = utcDeadline;
      this.globalData.deadline = formatDeadline(utcDeadline);
    } catch {
      // Keep launch resilient when shared app data is temporarily unavailable.
    }
  }
});
