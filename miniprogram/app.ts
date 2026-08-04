import { getCurrentEventAndDeadline } from "./services/common.service";
import { formatDeadline } from "./utils/date";
import { getEntryId } from "./utils/storage";
import { getApiSessionToken, refreshWechatApiSession } from "./services/auth.service";
import { MiniProgramLinkRequiredError } from "./services/auth-session";
import { routes } from "./config/routes";
import { storagePrefixes } from "./config/storage-keys";
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
  _authReadyResolve: null as (() => void) | null,
  /** Resolves once the first cold-start login attempt has settled (either
   *  path). Pages that need the authoritative entry binding should await it
   *  instead of polling for an in-flight refresh, which may not exist yet
   *  while the privacy callback is still pending. */
  authReady: null as Promise<void> | null,

  async onLaunch() {
    const launchStart = Date.now();
    this.globalData.entryId = getEntryId();
    this.authReady = new Promise<void>((resolve) => {
      this._authReadyResolve = resolve;
    });
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
    const markAuthReady = () => {
      this._authReadyResolve?.();
      this._authReadyResolve = null;
    };
    if (getApiSessionToken()) {
      markAuthReady();
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
    }).finally(markAuthReady);
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
