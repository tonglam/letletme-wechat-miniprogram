/**
 * Canonical Website action links (high-level design §9, plan amendment A1).
 *
 * web-view is unavailable in this Mini Program, so a handoff copies an
 * allowlisted static task URL to the clipboard and tells the user to open it
 * in a browser — Website login may be required. URLs are static constants:
 * never interpolate tokens, email, openid, entry IDs, or any user data.
 */
import {
  isClipboardApiBlocked,
  isPrivacyScopeUndeclared,
  markClipboardApiBlocked
} from "./privacy";
import { miniLogger } from "./logger";

export type CanonicalActionType =
  | "ACCOUNT_LINK"
  | "TEAM_BIND"
  | "LEAGUE_PREPARE"
  | "LEAGUE_MANAGE"
  | "CREATE_COMPETITION"
  | "MANAGE_COMPETITION"
  | "VIEW_COMPETITION"
  | "OPEN_HOME";

export interface CanonicalAction {
  actionType: CanonicalActionType;
  href: string;
}

const ACTION_URLS: Record<CanonicalActionType, string> = {
  ACCOUNT_LINK: "https://letletme.top/zh-CN/account",
  TEAM_BIND: "https://letletme.top/zh-CN/account",
  LEAGUE_PREPARE: "https://letletme.top/zh-CN/tournament",
  LEAGUE_MANAGE: "https://letletme.top/zh-CN/tournament",
  // Compatibility destinations until the Website /zh-CN/competitions route
  // registry ships (§11.1); URLs stay static — no competition IDs appended.
  CREATE_COMPETITION: "https://letletme.top/zh-CN/tournament",
  MANAGE_COMPETITION: "https://letletme.top/zh-CN/tournament",
  VIEW_COMPETITION: "https://letletme.top/zh-CN/tournament",
  OPEN_HOME: "https://letletme.top/zh-CN"
};

const ALLOWED_HOSTS: ReadonlySet<string> = new Set(["www.letletme.top", "letletme.top"]);
const HTTPS_PREFIX = "https://";

export function canonicalAction(actionType: CanonicalActionType): CanonicalAction {
  return { actionType, href: ACTION_URLS[actionType] };
}

/** https on an allowlisted host only; everything else is rejected. */
export function isAllowedWebsiteUrl(href: string): boolean {
  // No URL global in the Mini Program runtime — parse by hand.
  if (typeof href !== "string" || !href.startsWith(HTTPS_PREFIX)) {
    return false;
  }
  const host = href.slice(HTTPS_PREFIX.length).split(/[/?#]/, 1)[0];
  // Reject userinfo tricks (https://allowed.host@evil.com/) and empty hosts.
  if (!host || host.includes("@")) {
    return false;
  }
  const hostname = host.split(":", 1)[0];
  return ALLOWED_HOSTS.has(hostname);
}

/**
 * Copy the task link and explain the browser handoff. Returns whether the
 * action completed, so callers only record an accepted handoff after the
 * clipboard write succeeds.
 */
export function openWebsiteAction(action: CanonicalAction): Promise<boolean> {
  if (!isAllowedWebsiteUrl(action.href)) {
    wx.showToast({ title: "链接不可用", icon: "none" });
    return Promise.resolve(false);
  }

  if (isClipboardApiBlocked()) {
    wx.showToast({ title: "复制失败，请重试", icon: "none" });
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const fail = (err?: { errno?: number; errMsg?: string }) => {
      if (isPrivacyScopeUndeclared(err)) {
        markClipboardApiBlocked();
        miniLogger.error("canonical-action.privacy-scope");
      }
      wx.showToast({ title: "复制失败，请重试", icon: "none" });
      resolve(false);
    };
    try {
      wx.setClipboardData({
        data: action.href,
        success: () => {
          wx.showToast({ title: "链接已复制，请在浏览器打开，可能需要登录网页版", icon: "none" });
          resolve(true);
        },
        fail
      });
    } catch {
      fail();
    }
  });
}
