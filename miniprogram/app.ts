import { getCurrentEventAndDeadline } from "./services/common.service";
import { formatDeadline } from "./utils/date";
import { getEntryId } from "./utils/storage";
import { getApiSessionToken, isLogoutInFlight, refreshWechatApiSession } from "./services/auth.service";
import { MiniProgramLinkRequiredError } from "./services/auth-session";
import { routes } from "./config/routes";
import { storageKeys, storagePrefixes } from "./config/storage-keys";
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
    this.purgeExpiredGraphQLCache();
  },

  onError(error: string) {
    console.error("[app] uncaught error:", error);
  },

  onUnhandledRejection(event: { reason?: unknown }) {
    console.error("[app] unhandled rejection:", event && event.reason);
  },

  onPageNotFound() {
    wx.reLaunch({ url: routes.home });
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
    // A still-valid 30-day session needs no login round trip: the local
    // entry binding is restored from storage, and a later 401 triggers the
    // single-flight refresh path in graphql.service.
    this.globalData.entryId = getEntryId();
    if (getApiSessionToken()) {
      this.revalidateSessionProfile();
      return;
    }
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

  /**
   * A valid session can outlive the web-side binding: the user may change or
   * unlink their verified FPL entry while the 30-day token keeps working.
   * Re-fetch the authoritative profile in the background at most once per
   * 24h (storeApiSession stamps every persisted session, so fresh logins and
   * 401 recoveries count too) without blocking cold starts.
   */
  revalidateSessionProfile() {
    const lastChecked = Number(wx.getStorageSync(storageKeys.apiProfileCheckedAt)) || 0;
    if (lastChecked && Date.now() - lastChecked < 24 * 60 * 60 * 1000) {
      return;
    }
    const boundEntryAtStart = this.globalData.entryId;
    refreshWechatApiSession().then((session) => {
      // storeApiSession has applied the fresh binding to globalData and
      // cleared stale caches. If the binding actually changed, the open page
      // is still showing the previously bound team — rebuild it.
      const nextEntry = session.profile.fplEntryId && session.profile.fplEntryVerifiedAt
        ? session.profile.fplEntryId
        : undefined;
      if (nextEntry !== boundEntryAtStart) {
        this.reloadCurrentPageForEntryChange(nextEntry);
      }
    }).catch((error) => {
      if (error instanceof MiniProgramLinkRequiredError) {
        wx.reLaunch({ url: routes.accountLink });
      }
      // Network failures keep the stored binding and retry on a later launch.
    });
  },

  /** Rebuild the visible page after the authoritative entry binding changed. */
  reloadCurrentPageForEntryChange(nextEntry?: number) {
    try {
      if (isLogoutInFlight()) {
        // Logout is about to clear the session it awaited: rebuilding entry
        // content now would strand the signed-out user on it with no route
        // back. The sign-out flow owns navigation from here.
        return;
      }
      const pages = getCurrentPages();
      const current = pages[pages.length - 1] as
        | { route?: string; options?: Record<string, unknown> }
        | undefined;
      if (!current || !current.route) {
        return;
      }
      const url = `/${current.route}`;
      if (url === routes.accountLink) {
        // Never yank an in-progress account-link flow — unless the binding it
        // exists to create has just been restored, in which case the form is
        // obsolete and the user belongs back on content.
        if (nextEntry) {
          wx.reLaunch({ url: routes.home });
        }
        return;
      }
      // Preserve route params (player-detail?code=..., team-detail?teamId=...):
      // reLaunching the bare route re-runs onLoad with no identifier and
      // strands the page on an empty state.
      const query = Object.entries(current.options || {})
        .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
        .join("&");
      wx.reLaunch({ url: query ? `${url}?${query}` : url });
    } catch {}
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
  },

  /** Drop expired gql:* cache rows once per launch, off the critical path. */
  purgeExpiredGraphQLCache() {
    setTimeout(() => {
      try {
        const { keys } = wx.getStorageInfoSync();
        const now = Date.now();
        keys
          .filter((key) => key.startsWith(storagePrefixes.graphqlCache))
          .forEach((key) => {
            try {
              const entry = wx.getStorageSync(key) as { expiresAt?: number } | undefined;
              if (!entry || typeof entry.expiresAt !== "number" || now >= entry.expiresAt) {
                wx.removeStorageSync(key);
              }
            } catch {}
          });
      } catch {}
    }, 0);
  }
});
