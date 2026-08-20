import { getEntryId } from "./utils/storage";
import {
  getApiSessionToken,
  isLogoutInFlight,
  refreshWechatApiSession,
  restoreApiSessionCredentials,
} from "./services/auth.service";
import { purgeGraphQLStorageCache } from "./services/graphql.service";
import { routes } from "./config/routes";
import { storageKeys } from "./config/storage-keys";
import { recordLaunch } from "./utils/perf";
import {
  commitEntryBinding,
  ensureAppContext,
} from "./services/app-context.service";
import { installPrivacyAuthorizationHandler } from "./utils/privacy";
import { flushPerfNow } from "./utils/perf";

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
    openid: undefined,
    authRevision: 0,
    contextRevision: 0,
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
    this.installMandatoryUpdateGuard();
    // Older builds persisted openid even though the current session contract
    // does not consume it. Remove the legacy identifier during migration.
    wx.removeStorageSync("openid");
    this.globalData.entryId = getEntryId();
    commitEntryBinding(this.globalData.entryId || null, "restore");
    this.authReady = new Promise<void>((resolve) => {
      this._authReadyResolve = resolve;
    });
    // Install the handler up front, but do not request a privacy scope during
    // cold start. Scope-specific prompts are triggered by the user action
    // that actually needs clipboard/photo/albums access.
    installPrivacyAuthorizationHandler();
    this.doLogin();
    const initialization = this.initAppData();
    // AppContext initialization stays detached from the shell, but the
    // fallback launch metric must end when initialization settles rather than
    // when it is merely scheduled.
    void initialization.then(
      () => recordLaunch(Date.now() - launchStart),
      () => recordLaunch(Date.now() - launchStart),
    );
    this.purgeExpiredGraphQLCache();
  },

  /**
   * The market ownership contract is intentionally breaking. Once WeChat has
   * downloaded a newer bundle, the current bundle must not continue serving
   * pages against the removed GraphQL fields.
   */
  installMandatoryUpdateGuard() {
    if (typeof wx.getUpdateManager !== "function") return;
    const updateManager = wx.getUpdateManager();
    updateManager.onUpdateReady(() => {
      void wx
        .showModal({
          title: "需要更新",
          content: "市场动态已升级，请更新后继续使用。",
          showCancel: false,
          confirmText: "立即更新",
        })
        .then(() => updateManager.applyUpdate());
    });
    updateManager.onUpdateFailed(() => {
      void wx.showModal({
        title: "更新失败",
        content: "当前版本无法继续访问，请检查网络后重新打开小程序。",
        showCancel: false,
        confirmText: "知道了",
      });
    });
  },

  onShow() {
    void ensureAppContext({ reason: "app-show" }).catch(() => undefined);
  },

  onHide() {
    void flushPerfNow();
  },

  reportError(message: string) {
    (
      wx as unknown as { reportError?: (message: string) => void }
    ).reportError?.(message);
  },

  onError(error: string) {
    this.reportError(`[app] uncaught error: ${error}`);
  },

  onUnhandledRejection(event: { reason?: unknown }) {
    const reason = event?.reason;
    let message = "";
    if (reason instanceof Error) {
      message = reason.message;
    } else if (typeof reason === "string") {
      message = reason;
    } else if (reason && typeof reason === "object") {
      const record = reason as { errMsg?: unknown; message?: unknown };
      if (typeof record.errMsg === "string") message = record.errMsg;
      else if (typeof record.message === "string") message = record.message;
    } else {
      message = String(reason ?? "");
    }
    this.reportError(`[app] unhandled rejection: ${message.slice(0, 300)}`);
  },

  onPageNotFound() {
    wx.reLaunch({ url: routes.home });
  },

  requirePrivacyAndLogin() {
    this.doLogin();
  },

  async doLogin() {
    const markAuthReady = () => {
      this._authReadyResolve?.();
      this._authReadyResolve = null;
    };
    try {
      // Restore only through WeChat's encrypted asynchronous storage. Legacy
      // plaintext is migrated before any GraphQL request can read the token.
      await restoreApiSessionCredentials();
      // A still-valid 30-day session needs no login round trip: the local entry
      // binding is restored, and a later 401 triggers the central refresh path.
      this.globalData.entryId = getEntryId();
      commitEntryBinding(this.globalData.entryId || null, "restore");
      if (getApiSessionToken()) {
        markAuthReady();
        this.revalidateSessionProfile();
        return;
      }
      refreshWechatApiSession().catch(() => {
          // Account linking is optional and sync is best-effort: link-required
          // and network failures alike leave the locally followed team alone.
          // Pages render their own no-entry state instead of being redirected.
        })
        .finally(markAuthReady);
    } catch {
      refreshWechatApiSession().catch(() => {
          // Restore failed; still attempt a WeChat session so authReady is not
          // "ready with no login attempt".
        })
        .finally(markAuthReady);
    }
  },

  /**
   * A valid session can outlive the web-side binding: the user may change or
   * unlink their verified FPL entry while the 30-day token keeps working.
   * Re-fetch the authoritative profile in the background at most once per
   * 24h (storeApiSession stamps every persisted session, so fresh logins and
   * 401 recoveries count too) without blocking cold starts.
   */
  revalidateSessionProfile() {
    const lastChecked =
      Number(wx.getStorageSync(storageKeys.apiProfileCheckedAt)) || 0;
    if (lastChecked && Date.now() - lastChecked < 24 * 60 * 60 * 1000) {
      return;
    }
    const boundEntryAtStart = this.globalData.entryId;
    refreshWechatApiSession()
      .then(() => {
        // storeApiSession has applied the fresh binding to globalData and
        // cleared stale caches. If the binding actually changed, the open page
        // is still showing the previously bound team — rebuild it.
        // storeApiSession retains a local display-only follow when the profile
        // has no verified entry, so compare the state it actually applied.
        const nextEntry = this.globalData.entryId;
        if (nextEntry !== boundEntryAtStart) {
          this.reloadCurrentPageForEntryChange(nextEntry);
        }
      })
      .catch(() => {
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
        { route?: string; options?: Record<string, unknown> } | undefined;
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
      await ensureAppContext({
        forceRefresh,
        reason: forceRefresh ? "pull-refresh" : "app-launch",
      });
    } catch {
      // Keep launch resilient when shared app data is temporarily unavailable.
    }
  },

  /** Prune invalid, expired, and excess GraphQL cache rows off the launch path. */
  purgeExpiredGraphQLCache() {
    setTimeout(() => {
      purgeGraphQLStorageCache();
    }, 0);
  },
});
