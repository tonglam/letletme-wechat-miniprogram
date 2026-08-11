import { getCurrentEventAndDeadline } from "./services/common.service";
import { formatDeadline } from "./utils/date";
import { getEntryId } from "./utils/storage";
import { getApiSessionToken, isLogoutInFlight, refreshWechatApiSession } from "./services/auth.service";
import { routes } from "./config/routes";
import { storageKeys, storagePrefixes } from "./config/storage-keys";
import { recordLaunch } from "./utils/perf";
import { resolveEventContext } from "./utils/event-context";

App<IAppOption>({
  globalData: {
    season: "",
    gw: 0,
    currentGw: 0,
    lastGw: 0,
    nextGw: 0,
    utcDeadline: "",
    deadline: "",
    entryId: undefined,
    openid: undefined
  },

  _pendingInit: null as Promise<void> | null,
  _pendingInitForced: false,
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

  reportError(message: string) {
    (wx as unknown as { reportError?: (message: string) => void }).reportError?.(message);
  },

  onError(error: string) {
    this.reportError(`[app] uncaught error: ${error}`);
  },

  onUnhandledRejection(event: { reason?: unknown }) {
    this.reportError(
      `[app] unhandled rejection: ${event?.reason ? JSON.stringify(event.reason) : String(event?.reason)}`
    );
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
      this.revalidateSessionProfile();
      return;
    }
    refreshWechatApiSession().then((session) => {
      if (session.profile.fplEntryId && session.profile.fplEntryVerifiedAt) {
        this.globalData.entryId = session.profile.fplEntryId;
      }
    }).catch(() => {
      // Account linking is optional and sync is best-effort: link-required
      // and network failures alike leave the locally followed team alone.
      // Pages render their own no-entry state instead of being redirected.
    }).finally(markAuthReady);
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
    refreshWechatApiSession().then(() => {
      // storeApiSession has applied the fresh binding to globalData and
      // cleared stale caches. If the binding actually changed, the open page
      // is still showing the previously bound team — rebuild it.
      // storeApiSession retains a local display-only follow when the profile
      // has no verified entry, so compare the state it actually applied.
      const nextEntry = this.globalData.entryId;
      if (nextEntry !== boundEntryAtStart) {
        this.reloadCurrentPageForEntryChange(nextEntry);
      }
    }).catch(() => {
      // Link-required and network failures keep the stored follow and retry
      // on a later launch — pages own how they render the no-entry state.
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

  async initAppData(forceRefresh = false) {
    if (this._pendingInit) {
      if (!forceRefresh || this._pendingInitForced) {
        return this._pendingInit;
      }
      // A cache-bypassing caller must not be downgraded to an ordinary read.
      // Wait for the existing single-flight request, then start (or join) the
      // forced refresh that supersedes it.
      await this._pendingInit;
      return this.initAppData(true);
    }

    const promise = this._initAppDataInner(forceRefresh);
    this._pendingInit = promise;
    this._pendingInitForced = forceRefresh;
    try {
      return await promise;
    } finally {
      if (this._pendingInit === promise) {
        this._pendingInit = null;
        this._pendingInitForced = false;
      }
    }
  },

  async _initAppDataInner(forceRefresh = false) {
    try {
      const current = await getCurrentEventAndDeadline(forceRefresh);
      const eventContext = resolveEventContext(current.currentEvent, current.nextEvent);
      const utcDeadline = String(current.utcDeadline || current.deadline || "");

      this.globalData.season = String(current.season || "");
      this.globalData.gw = eventContext.gw;
      this.globalData.currentGw = Number(current.currentEvent) || 0;
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
